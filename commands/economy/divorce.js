const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, successEmbed, errorEmbed } = require('../../utils/embedBuilder');

const DIVORCE_COST = 10000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('divorce')
    .setDescription(`End your marriage (${DIVORCE_COST.toLocaleString()} coin filing fee)`),

  async execute(interaction) {
    const { guild, user } = interaction;
    const marriage = db.getMarriage(guild.id, user.id);

    if (!marriage) {
      return interaction.reply({ embeds: [errorEmbed('Not Married', 'You are not married to anyone in this server.')], flags: 64 });
    }

    const profile = db.getUser(guild.id, user.id);
    if (profile.balance < DIVORCE_COST) {
      return interaction.reply({
        embeds: [errorEmbed('Cannot Afford the Filing Fee', `Divorce costs **${DIVORCE_COST.toLocaleString()}** coins. You have **${profile.balance.toLocaleString()}**.`)],
        flags: 64
      });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('divorce_yes').setLabel('Confirm divorce').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('divorce_no').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );

    const days = Math.floor((Date.now() - marriage.since) / 86400000);

    await interaction.reply({
      embeds: [createEmbed({
        title: 'Confirm Divorce',
        description: `You have been married to <@${marriage.partner_id}> for **${days}** day${days === 1 ? '' : 's'}.\n\nDivorcing costs **${DIVORCE_COST.toLocaleString()}** coins and cannot be undone.`
      })],
      components: [row],
      flags: 64
    });

    const message = await interaction.fetchReply().catch(() => null);
    if (!message) return;

    const collector = message.createMessageComponentCollector({ time: 30000, max: 1 });

    collector.on('collect', async (component) => {
      if (component.customId === 'divorce_no') {
        return component.update({
          embeds: [createEmbed({ title: 'Divorce Cancelled', description: 'Your marriage is intact.' })],
          components: []
        }).catch(() => {});
      }

      const current = db.getMarriage(guild.id, user.id);
      if (!current) {
        return component.update({
          embeds: [errorEmbed('Already Divorced', 'Your partner already ended the marriage.')],
          components: []
        }).catch(() => {});
      }

      db.addBalance(guild.id, user.id, -DIVORCE_COST);
      db.removeMarriage(guild.id, user.id);

      return component.update({
        embeds: [successEmbed('Divorced', `Your marriage to <@${current.partner_id}> has ended. (-${DIVORCE_COST.toLocaleString()} coins)`)],
        components: []
      }).catch(() => {});
    });

    collector.on('end', (collected) => {
      if (collected.size) return;
      interaction.editReply({
        embeds: [createEmbed({ title: 'Divorce Cancelled', description: 'You did not confirm in time.' })],
        components: []
      }).catch(() => {});
    });
  }
};
