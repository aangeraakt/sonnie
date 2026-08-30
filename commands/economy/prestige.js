const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { checkAndAnnounce } = require('../../utils/achievements');

const REQUIRED_LEVEL = 50;
const REQUIRED_NET_WORTH = 1000000;

/** Each prestige adds a permanent 10% earnings bonus. */
function bonusFor(prestige) {
  return Math.round(prestige * 10);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('prestige')
    .setDescription('Reset your level and coins for a permanent earnings bonus'),

  async execute(interaction) {
    const { guild, user } = interaction;
    const profile = db.getUserExtras(guild.id, user.id);
    const netWorth = (profile.balance || 0) + (profile.bank || 0);
    const prestige = profile.prestige || 0;

    if (profile.level < REQUIRED_LEVEL || netWorth < REQUIRED_NET_WORTH) {
      return interaction.reply({
        embeds: [createEmbed({
          title: 'Not Ready to Prestige',
          description: 'Prestiging wipes your level, XP, wallet, and bank in exchange for a permanent bonus on everything you earn.',
          fields: [
            { name: 'Level', value: `\`${profile.level} / ${REQUIRED_LEVEL}\` ${profile.level >= REQUIRED_LEVEL ? 'Ready' : 'Not yet'}`, inline: true },
            { name: 'Net Worth', value: `\`${netWorth.toLocaleString()} / ${REQUIRED_NET_WORTH.toLocaleString()}\` ${netWorth >= REQUIRED_NET_WORTH ? 'Ready' : 'Not yet'}`, inline: true },
            { name: 'Current Prestige', value: `\`${prestige}\` (+${bonusFor(prestige)}% earnings)`, inline: true },
            { name: 'What you keep', value: 'Items, pet, clan, marriage, achievements, and every prestige bonus so far.', inline: false },
            { name: 'What you lose', value: 'Your level, XP, wallet balance, and bank balance.', inline: false }
          ]
        })],
        flags: 64
      });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('prestige_yes').setLabel(`Prestige to ${prestige + 1}`).setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('prestige_no').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      embeds: [createEmbed({
        title: `Confirm Prestige ${prestige + 1}`,
        description:
          `You are about to reset **level ${profile.level}** and **${netWorth.toLocaleString()} coins**.\n\n` +
          `In exchange your permanent earnings bonus goes from **+${bonusFor(prestige)}%** to **+${bonusFor(prestige + 1)}%**.\n\n` +
          'You keep your items, pet, clan, marriage, and achievements. This cannot be undone.'
      })],
      components: [row],
      flags: 64
    });

    const message = await interaction.fetchReply().catch(() => null);
    if (!message) return;

    const collector = message.createMessageComponentCollector({ time: 30000, max: 1 });

    collector.on('collect', async (component) => {
      if (component.customId === 'prestige_no') {
        return component.update({
          embeds: [createEmbed({ title: 'Prestige Cancelled', description: 'Nothing was reset.' })],
          components: []
        }).catch(() => {});
      }

      // Re-check, since the confirmation window is open for 30 seconds.
      const current = db.getUserExtras(guild.id, user.id);
      const currentNet = (current.balance || 0) + (current.bank || 0);
      if (current.level < REQUIRED_LEVEL || currentNet < REQUIRED_NET_WORTH) {
        return component.update({
          embeds: [errorEmbed('Prestige Failed', 'You no longer meet the requirements.')],
          components: []
        }).catch(() => {});
      }

      const newPrestige = (current.prestige || 0) + 1;
      db.setXP(guild.id, user.id, 0);
      db.setUserField(guild.id, user.id, 'balance', 0);
      db.setUserField(guild.id, user.id, 'bank', 0);
      db.setUserField(guild.id, user.id, 'prestige', newPrestige);

      await component.update({
        embeds: [successEmbed(`Prestige ${newPrestige}`,
          `You reset back to level 1 with an empty wallet.\n\n` +
          `Permanent earnings bonus: **+${bonusFor(newPrestige)}%**\n` +
          'Your prestige rank now shows on your rank card and profile.')],
        components: []
      }).catch(() => {});

      await checkAndAnnounce(interaction);
    });

    collector.on('end', (collected) => {
      if (collected.size) return;
      interaction.editReply({
        embeds: [createEmbed({ title: 'Prestige Cancelled', description: 'You did not confirm in time.' })],
        components: []
      }).catch(() => {});
    });
  }
};

module.exports.bonusFor = bonusFor;
