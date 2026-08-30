const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embedBuilder');
const { parseDuration } = require('../../utils/giveawayHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Remind yourself in this channel')
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Set a reminder')
        .addStringOption((opt) => opt.setName('duration').setDescription('When, like 10m, 2h, 1d').setRequired(true))
        .addStringOption((opt) => opt.setName('text').setDescription('What to remind you').setRequired(true).setMaxLength(1000))
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('List your reminders'))
    .addSubcommand((sub) =>
      sub
        .setName('cancel')
        .setDescription('Cancel a reminder')
        .addIntegerOption((opt) => opt.setName('id').setDescription('Reminder ID').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    if (sub === 'list') {
      const items = db.getReminders(guildId, userId, 'remind');
      if (!items.length) {
        return interaction.reply({ embeds: [infoEmbed('Reminders', 'You have no reminders.')], flags: 64 });
      }
      const lines = items.slice(0, 10).map((item) => `\`${item.id}\` <t:${Math.floor(item.at / 1000)}:R> — ${item.content}`);
      return interaction.reply({ embeds: [infoEmbed('Your Reminders', lines.join('\n'))], flags: 64 });
    }

    if (sub === 'cancel') {
      const id = interaction.options.getInteger('id');
      const item = db.getReminder(guildId, id);
      if (!item || item.user_id !== userId || item.type !== 'remind') {
        return interaction.reply({ embeds: [errorEmbed('Not Found', 'No reminder with that ID belongs to you.')], flags: 64 });
      }
      db.deleteReminder(id);
      return interaction.reply({ embeds: [successEmbed('Reminder Cancelled', `Removed reminder \`${id}\`.`)], flags: 64 });
    }

    const ms = parseDuration(interaction.options.getString('duration'));
    if (!ms || ms < 15000 || ms > 30 * 24 * 60 * 60 * 1000) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid Duration', 'Use 15s to 30d, like `10m` or `2h`.')],
        flags: 64
      });
    }

    const item = db.addReminder({
      type: 'remind',
      guild_id: guildId,
      channel_id: interaction.channel.id,
      user_id: userId,
      content: interaction.options.getString('text'),
      at: Date.now() + ms
    });

    return interaction.reply({
      embeds: [successEmbed('Reminder Set', `I will remind you <t:${Math.floor(item.at / 1000)}:R>. ID \`${item.id}\`.`)]
    });
  }
};
