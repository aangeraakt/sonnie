const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { createModLogEmbed, MOD_COLORS } = require('../../utils/modLogger');
const { validateModerationTarget } = require('../../utils/staffSecurity');
const { parseDuration, formatDuration, notifyTarget } = require('../../utils/punishmentEngine');
const { sendLog } = require('../../utils/auditLogger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tempban')
    .setDescription('Ban a user and automatically unban them after a set time')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(opt => opt.setName('user').setDescription('The user to ban').setRequired(true))
    .addStringOption(opt => opt.setName('duration').setDescription('How long, e.g. 30m, 12h, 7d, 2w').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for the ban').setRequired(false))
    .addIntegerOption(opt =>
      opt.setName('delete_days')
        .setDescription('Days of their messages to delete (0-7)')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const durationInput = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

    const validation = validateModerationTarget(interaction, targetUser, PermissionFlagsBits.BanMembers);
    if (!validation.valid) {
      return interaction.reply({ embeds: [errorEmbed('Temporary Ban Failed', validation.error)], flags: 64 });
    }

    const ms = parseDuration(durationInput);
    if (!ms) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid Duration', 'Use a value like `30m`, `12h`, `7d`, or `2w`.')],
        flags: 64
      });
    }
    if (ms > 365 * 24 * 60 * 60 * 1000) {
      return interaction.reply({ embeds: [errorEmbed('Too Long', 'Temporary bans are capped at 1 year. Use `/moderation ban` for anything longer.')], flags: 64 });
    }

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (member && !member.bannable) {
      return interaction.reply({ embeds: [errorEmbed('Cannot Ban', 'I cannot ban that member. My role must sit above theirs.')], flags: 64 });
    }

    const until = Date.now() + ms;
    const pretty = formatDuration(ms);

    await notifyTarget(targetUser, interaction.guild, `temporarily banned for ${pretty}`, reason,
      `You can rejoin automatically <t:${Math.floor(until / 1000)}:R>.`);

    try {
      await interaction.guild.members.ban(targetUser.id, {
        reason: `[${interaction.user.tag}] ${reason} (temp: ${pretty})`,
        deleteMessageSeconds: deleteDays * 86400
      });
    } catch (err) {
      return interaction.reply({ embeds: [errorEmbed('Ban Failed', 'Discord rejected the ban. Check my permissions and role position.')], flags: 64 });
    }

    db.addTempBan(interaction.guild.id, targetUser.id, until, interaction.user.id, reason);
    const record = db.addCase(interaction.guild.id, 'tempban', targetUser.id, interaction.user.id, reason, { until });

    await interaction.reply({
      embeds: [successEmbed('User Temporarily Banned',
        `**${targetUser.tag}** was banned for **${pretty}** (case \`${record?.id || '?'}\`).\n` +
        `Automatic unban: <t:${Math.floor(until / 1000)}:F>\n**Reason:** ${reason}`)]
    });

    await sendLog(interaction.guild, 'moderation', createModLogEmbed({
      action: 'Temporary Ban Issued',
      color: MOD_COLORS.BAN,
      target: targetUser,
      moderator: interaction.user,
      reason,
      extraDetails: {
        'Duration': pretty,
        'Expires': `<t:${Math.floor(until / 1000)}:R>`,
        'Case': record?.id ? `#${record.id}` : 'n/a',
        'Messages Deleted': deleteDays ? `${deleteDays} day(s)` : 'None'
      }
    })).catch(() => {});
  }
};
