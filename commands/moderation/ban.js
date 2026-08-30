const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { createModLogEmbed, MOD_COLORS } = require('../../utils/modLogger');
const { validateModerationTarget } = require('../../utils/staffSecurity');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(opt => opt.setName('user').setDescription('The user to ban').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for the ban').setRequired(false))
    .addIntegerOption(opt => opt.setName('delete_days').setDescription('Days of messages to delete (0-7)').setMinValue(0).setMaxValue(7).setRequired(false)),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const deleteDays = interaction.options.getInteger('delete_days') || 0;

    const validation = validateModerationTarget(interaction, targetUser, PermissionFlagsBits.BanMembers);
    if (!validation.valid) {
      return interaction.reply({ embeds: [errorEmbed('Ban Failed', validation.error)], flags: 64 });
    }

    const member = validation.targetMember;
    if (member && !member.bannable) {
      return interaction.reply({ embeds: [errorEmbed('Ban Failed', 'I cannot ban this user! They may have higher permissions than me.')], flags: 64 });
    }

    try {
      await interaction.guild.members.ban(targetUser.id, { reason, deleteMessageSeconds: deleteDays * 86400 });
      const caseObj = db.addCase(interaction.guild.id, 'ban', targetUser.id, interaction.user.id, reason);

      const embed = successEmbed('User Banned', `**${targetUser.tag}** has been banned from the server.\n**Case:** \`${caseObj.id}\`\n**Reason:** ${reason}`);
      await interaction.reply({ embeds: [embed] });

      // Log to mod log channel if configured
      const cfg = db.getGuildConfig(interaction.guild.id);
      if (cfg.mod_log_channel_id) {
        const logChannel = interaction.guild.channels.cache.get(cfg.mod_log_channel_id);
        if (logChannel) {
          const logEmbed = createModLogEmbed({
            action: '🔨 Member Banned',
            color: MOD_COLORS.BAN,
            target: targetUser,
            moderator: interaction.user,
            reason,
            extraDetails: {
              'Pruned Messages': deleteDays > 0 ? `${deleteDays} days` : 'None',
              Case: `#${caseObj.id}`
            }
          });
          logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
      }
    } catch (err) {
      return interaction.reply({ embeds: [errorEmbed('Error', `Could not ban member: ${err.message}`)], flags: 64 });
    }
  }
};
