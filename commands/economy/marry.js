const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { checkAndAnnounce } = require('../../utils/achievements');

const RING_COST = 25000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('marry')
    .setDescription(`Propose to another member (${RING_COST.toLocaleString()} coin ring)`)
    .addUserOption(opt => opt.setName('user').setDescription('Who to propose to').setRequired(true)),

  async execute(interaction) {
    const { guild, user } = interaction;
    const target = interaction.options.getUser('user');

    if (target.id === user.id) {
      return interaction.reply({ embeds: [errorEmbed('Cannot Marry Yourself', 'Self-love is important, but pick someone else.')], flags: 64 });
    }
    if (target.bot) {
      return interaction.reply({ embeds: [errorEmbed('Cannot Marry a Bot', 'Bots are not available for marriage.')], flags: 64 });
    }

    const ownMarriage = db.getMarriage(guild.id, user.id);
    if (ownMarriage) {
      return interaction.reply({
        embeds: [errorEmbed('Already Married', `You are already married to <@${ownMarriage.partner_id}>. Use \`/economy social divorce\` first.`)],
        flags: 64
      });
    }

    const theirMarriage = db.getMarriage(guild.id, target.id);
    if (theirMarriage) {
      return interaction.reply({
        embeds: [errorEmbed('Already Taken', `**${target.tag}** is already married to <@${theirMarriage.partner_id}>.`)],
        flags: 64
      });
    }

    const profile = db.getUser(guild.id, user.id);
    if (profile.balance < RING_COST) {
      return interaction.reply({
        embeds: [errorEmbed('Cannot Afford the Ring', `A ring costs **${RING_COST.toLocaleString()}** coins. You have **${profile.balance.toLocaleString()}**.`)],
        flags: 64
      });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('marry_yes').setLabel('Accept').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('marry_no').setLabel('Decline').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      content: `${target}`,
      embeds: [createEmbed({
        title: 'A Proposal',
        description: `${user} has proposed to ${target}!\n\n${target}, do you accept?`,
        thumbnail: user.displayAvatarURL({ dynamic: true }),
        footerText: 'This proposal expires in 60 seconds'
      })],
      components: [row]
    });

    const message = await interaction.fetchReply().catch(() => null);
    if (!message) return;

    let answered = false;
    const collector = message.createMessageComponentCollector({ time: 60000, max: 1 });

    collector.on('collect', async (component) => {
      if (component.user.id !== target.id) {
        return component.reply({
          embeds: [errorEmbed('Not Your Proposal', `Only ${target} can answer this.`)],
          flags: 64
        }).catch(() => {});
      }
      answered = true;

      if (component.customId === 'marry_no') {
        return component.update({
          embeds: [errorEmbed('Proposal Declined', `${target} turned ${user} down. The ring was not purchased.`)],
          components: []
        }).catch(() => {});
      }

      // Re-check state - both sides may have changed while the prompt was open.
      const current = db.getUser(guild.id, user.id);
      if (current.balance < RING_COST) {
        return component.update({
          embeds: [errorEmbed('Proposal Failed', `${user} can no longer afford the ring.`)],
          components: []
        }).catch(() => {});
      }
      if (db.getMarriage(guild.id, user.id) || db.getMarriage(guild.id, target.id)) {
        return component.update({
          embeds: [errorEmbed('Proposal Failed', 'One of you got married in the meantime.')],
          components: []
        }).catch(() => {});
      }

      db.addBalance(guild.id, user.id, -RING_COST);
      const since = db.setMarriage(guild.id, user.id, target.id);

      await component.update({
        embeds: [successEmbed('Married',
          `${user} and ${target} are now married!\n\nMarried on <t:${Math.floor(since / 1000)}:D>.\nCheck your anniversary any time with \`/economy social profile\`.`)],
        components: []
      }).catch(() => {});

      await checkAndAnnounce(interaction);
      await checkAndAnnounce(interaction, guild.id, target.id).catch(() => {});
    });

    collector.on('end', () => {
      if (answered) return;
      interaction.editReply({
        embeds: [errorEmbed('Proposal Expired', `${target} did not answer in time.`)],
        components: []
      }).catch(() => {});
    });
  }
};
