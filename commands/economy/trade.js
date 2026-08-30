const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database/db');
const { getItem } = require('../../utils/economyItems');
const { createEmbed, successEmbed, errorEmbed } = require('../../utils/embedBuilder');

// Guards against the same user opening several trades that each pass their
// own balance check and then all settle.
const activeTrades = new Set();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trade')
    .setDescription('Offer items or coins to another member')
    .addUserOption(opt => opt.setName('user').setDescription('Who to trade with').setRequired(true))
    .addStringOption(opt => opt.setName('item').setDescription('Item ID you are offering (see /economy wallet inventory)').setRequired(false))
    .addIntegerOption(opt => opt.setName('quantity').setDescription('How many of that item (default 1)').setMinValue(1).setMaxValue(1000).setRequired(false))
    .addIntegerOption(opt => opt.setName('coins').setDescription('Coins you are offering').setMinValue(1).setRequired(false))
    .addStringOption(opt => opt.setName('want_item').setDescription('Item ID you want in return').setRequired(false))
    .addIntegerOption(opt => opt.setName('want_quantity').setDescription('How many of that item you want (default 1)').setMinValue(1).setMaxValue(1000).setRequired(false))
    .addIntegerOption(opt => opt.setName('want_coins').setDescription('Coins you want in return').setMinValue(1).setRequired(false)),

  async execute(interaction) {
    const { guild, user } = interaction;
    const target = interaction.options.getUser('user');

    if (target.id === user.id) {
      return interaction.reply({ embeds: [errorEmbed('Cannot Trade Yourself', 'Pick another member.')], flags: 64 });
    }
    if (target.bot) {
      return interaction.reply({ embeds: [errorEmbed('Cannot Trade With Bots', 'Bots have nothing to offer.')], flags: 64 });
    }

    const offerItemId = interaction.options.getString('item');
    const offerQty = interaction.options.getInteger('quantity') || 1;
    const offerCoins = interaction.options.getInteger('coins') || 0;
    const wantItemId = interaction.options.getString('want_item');
    const wantQty = interaction.options.getInteger('want_quantity') || 1;
    const wantCoins = interaction.options.getInteger('want_coins') || 0;

    if (!offerItemId && !offerCoins && !wantItemId && !wantCoins) {
      return interaction.reply({
        embeds: [errorEmbed('Empty Trade', 'Offer something, ask for something, or both. Use `item`/`coins` for your side and `want_item`/`want_coins` for theirs.')],
        flags: 64
      });
    }

    const offerItem = offerItemId ? getItem(offerItemId) : null;
    const wantItem = wantItemId ? getItem(wantItemId) : null;

    if (offerItemId && !offerItem) {
      return interaction.reply({ embeds: [errorEmbed('Unknown Item', `\`${offerItemId}\` is not a known item.`)], flags: 64 });
    }
    if (wantItemId && !wantItem) {
      return interaction.reply({ embeds: [errorEmbed('Unknown Item', `\`${wantItemId}\` is not a known item.`)], flags: 64 });
    }

    if (activeTrades.has(`${guild.id}-${user.id}`)) {
      return interaction.reply({ embeds: [errorEmbed('Trade Already Open', 'Finish or cancel your open trade before starting another.')], flags: 64 });
    }

    // Validate the proposer can actually deliver their half.
    const check = validateSide(guild.id, user.id, offerItem, offerQty, offerCoins);
    if (!check.ok) {
      return interaction.reply({ embeds: [errorEmbed('You Cannot Cover That Offer', check.error)], flags: 64 });
    }

    const describe = (item, qty, coins) => {
      const parts = [];
      if (item) parts.push(`${item.emoji || ''} **${qty}x ${item.name}**`);
      if (coins) parts.push(`**${coins.toLocaleString()}** coins`);
      return parts.join(' + ') || '*nothing*';
    };

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('trade_accept').setLabel('Accept trade').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('trade_decline').setLabel('Decline').setStyle(ButtonStyle.Secondary)
    );

    activeTrades.add(`${guild.id}-${user.id}`);

    await interaction.reply({
      content: `${target}`,
      embeds: [createEmbed({
        title: 'Trade Offer',
        description: `${user} wants to trade with ${target}.`,
        fields: [
          { name: `${user.username} gives`, value: describe(offerItem, offerQty, offerCoins), inline: true },
          { name: `${target.username} gives`, value: describe(wantItem, wantQty, wantCoins), inline: true }
        ],
        footerText: 'This offer expires in 90 seconds'
      })],
      components: [row]
    });

    const message = await interaction.fetchReply().catch(() => null);
    if (!message) {
      activeTrades.delete(`${guild.id}-${user.id}`);
      return;
    }

    const collector = message.createMessageComponentCollector({ time: 90000, max: 1 });

    collector.on('collect', async (component) => {
      if (component.user.id !== target.id) {
        return component.reply({ embeds: [errorEmbed('Not Your Trade', `Only ${target} can respond to this offer.`)], flags: 64 }).catch(() => {});
      }

      if (component.customId === 'trade_decline') {
        activeTrades.delete(`${guild.id}-${user.id}`);
        return component.update({
          embeds: [errorEmbed('Trade Declined', `${target} declined the offer. Nothing changed hands.`)],
          components: []
        }).catch(() => {});
      }

      // Re-validate both sides at settlement time.
      const proposerOk = validateSide(guild.id, user.id, offerItem, offerQty, offerCoins);
      const accepterOk = validateSide(guild.id, target.id, wantItem, wantQty, wantCoins);
      activeTrades.delete(`${guild.id}-${user.id}`);

      if (!proposerOk.ok) {
        return component.update({ embeds: [errorEmbed('Trade Failed', `${user} can no longer cover their side: ${proposerOk.error}`)], components: [] }).catch(() => {});
      }
      if (!accepterOk.ok) {
        return component.update({ embeds: [errorEmbed('Trade Failed', `You cannot cover your side: ${accepterOk.error}`)], components: [] }).catch(() => {});
      }

      // Settle. Both sides were just validated, so these all succeed.
      if (offerItem) {
        db.removeItem(guild.id, user.id, offerItem.id, offerQty);
        db.addItem(guild.id, target.id, offerItem.id, offerQty);
      }
      if (offerCoins) {
        db.addBalance(guild.id, user.id, -offerCoins);
        db.addBalance(guild.id, target.id, offerCoins);
      }
      if (wantItem) {
        db.removeItem(guild.id, target.id, wantItem.id, wantQty);
        db.addItem(guild.id, user.id, wantItem.id, wantQty);
      }
      if (wantCoins) {
        db.addBalance(guild.id, target.id, -wantCoins);
        db.addBalance(guild.id, user.id, wantCoins);
      }

      db.bumpAchievementStat(guild.id, user.id, 'trades', 1);
      db.bumpAchievementStat(guild.id, target.id, 'trades', 1);

      return component.update({
        embeds: [successEmbed('Trade Complete',
          `${user} gave ${describe(offerItem, offerQty, offerCoins)}\n${target} gave ${describe(wantItem, wantQty, wantCoins)}`)],
        components: []
      }).catch(() => {});
    });

    collector.on('end', (collected) => {
      activeTrades.delete(`${guild.id}-${user.id}`);
      if (collected.size) return;
      interaction.editReply({
        embeds: [errorEmbed('Trade Expired', `${target} did not respond in time.`)],
        components: []
      }).catch(() => {});
    });
  }
};

/** Confirms one party actually holds what they promised. */
function validateSide(guildId, userId, item, quantity, coins) {
  if (coins) {
    const profile = db.getUser(guildId, userId);
    if (profile.balance < coins) {
      return { ok: false, error: `needs **${coins.toLocaleString()}** coins but only has **${profile.balance.toLocaleString()}** in their wallet.` };
    }
  }
  if (item) {
    const owned = db.getItemCount(guildId, userId, item.id);
    if (owned < quantity) {
      return { ok: false, error: `needs **${quantity}x ${item.name}** but only owns **${owned}**.` };
    }
  }
  return { ok: true };
}
