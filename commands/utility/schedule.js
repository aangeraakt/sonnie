const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embedBuilder');
const { checkStaffPermission } = require('../../utils/staffSecurity');
const { parseDuration } = require('../../utils/giveawayHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Schedule an announcement')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Schedule a message')
        .addStringOption((opt) => opt.setName('duration').setDescription('When, like 10m, 2h, 1d').setRequired(true))
        .addStringOption((opt) => opt.setName('message').setDescription('Message to send').setRequired(true).setMaxLength(1800))
        .addChannelOption((opt) =>
          opt.setName('channel').setDescription('Channel to post in').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('List scheduled messages'))
    .addSubcommand((sub) =>
      sub
        .setName('cancel')
        .setDescription('Cancel a scheduled message')
        .addIntegerOption((opt) => opt.setName('id').setDescription('Schedule ID').setRequired(true))
    ),

  async execute(interaction) {
    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission Denied', 'You need Manage Messages to schedule announcements.')],
        flags: 64
      });
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'list') {
      const items = db.getReminders(guildId, null, 'schedule');
      if (!items.length) {
        return interaction.reply({ embeds: [infoEmbed('Scheduled Messages', 'Nothing is scheduled.')], flags: 64 });
      }
      const lines = items.slice(0, 10).map((item) => `\`${item.id}\` <#${item.channel_id}> <t:${Math.floor(item.at / 1000)}:R> — ${item.content.slice(0, 80)}`);
      return interaction.reply({ embeds: [infoEmbed('Scheduled Messages', lines.join('\n'))], flags: 64 });
    }

    if (sub === 'cancel') {
      const id = interaction.options.getInteger('id');
      const item = db.getReminder(guildId, id);
      if (!item || item.type !== 'schedule') {
        return interaction.reply({ embeds: [errorEmbed('Not Found', 'No scheduled message with that ID.')], flags: 64 });
      }
      db.deleteReminder(id);
      return interaction.reply({ embeds: [successEmbed('Schedule Cancelled', `Removed schedule \`${id}\`.`)], flags: 64 });
    }

    const ms = parseDuration(interaction.options.getString('duration'));
    if (!ms || ms < 15000 || ms > 30 * 24 * 60 * 60 * 1000) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid Duration', 'Use 15s to 30d, like `10m` or `2h`.')],
        flags: 64
      });
    }

    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const item = db.addReminder({
      type: 'schedule',
      guild_id: guildId,
      channel_id: channel.id,
      user_id: interaction.user.id,
      content: interaction.options.getString('message'),
      at: Date.now() + ms
    });

    return interaction.reply({
      embeds: [successEmbed('Message Scheduled', `Will post in ${channel} <t:${Math.floor(item.at / 1000)}:R>. ID \`${item.id}\`.`)]
    });
  }
};
