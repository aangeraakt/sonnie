const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { createModLogEmbed, MOD_COLORS } = require('../../utils/modLogger');
const { validateModerationTarget } = require('../../utils/staffSecurity');
const { notifyTarget } = require('../../utils/punishmentEngine');
const { sendLog } = require('../../utils/auditLogger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('softban')
    .setDescription('Ban then immediately unban a user to purge their recent messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(opt => opt.setName('user').setDescription('The user to soft-ban').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for the soft-ban').setRequired(false))
    .addIntegerOption(opt =>
      opt.setName('delete_days')
        .setDescription('Days of messages to purge (default 1, max 7)')
        .setMinValue(1)
        .setMaxValue(7)
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const deleteDays = interaction.options.getInteger('delete_days') ?? 1;

    const validation = validateModerationTarget(interaction, targetUser, PermissionFlagsBits.BanMembers);
    if (!validation.valid) {
      return interaction.reply({ embeds: [errorEmbed('Soft-Ban Failed', validation.error)], flags: 64 });
    }

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (member && !member.bannable) {
      return interaction.reply({ embeds: [errorEmbed('Cannot Soft-Ban', 'I cannot ban that member. My role must sit above theirs.')], flags: 64 });
    }

    await notifyTarget(targetUser, interaction.guild, 'soft-banned', reason,
      'This is a kick with a message purge - you may rejoin with a new invite.');

    await interaction.deferReply();

    try {
      await interaction.guild.members.ban(targetUser.id, {
        reason: `[Softban by ${interaction.user.tag}] ${reason}`,
        deleteMessageSeconds: deleteDays * 86400
      });
      await interaction.guild.members.unban(targetUser.id, `[Softban by ${interaction.user.tag}] Lifting immediately`);
    } catch (err) {
      return interaction.editReply({
        embeds: [errorEmbed('Soft-Ban Failed', 'Discord rejected the action. Check that I have **Ban Members** and my role sits above theirs.')]
      });
    }

    const record = db.addCase(interaction.guild.id, 'softban', targetUser.id, interaction.user.id, reason, { deleteDays });

    await interaction.editReply({
      embeds: [successEmbed('User Soft-Banned',
        `**${targetUser.tag}** was removed and **${deleteDays} day${deleteDays === 1 ? '' : 's'}** of their messages were purged (case \`${record?.id || '?'}\`).\n` +
        `They are **not** banned and can rejoin with a new invite.\n**Reason:** ${reason}`)]
    });

    await sendLog(interaction.guild, 'moderation', createModLogEmbed({
      action: 'User Soft-Banned',
      color: MOD_COLORS.KICK,
      target: targetUser,
      moderator: interaction.user,
      reason,
      extraDetails: {
        'Messages Purged': `${deleteDays} day(s)`,
        'Case': record?.id ? `#${record.id}` : 'n/a'
      }
    })).catch(() => {});
  }
};
