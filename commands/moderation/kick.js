const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { createModLogEmbed, MOD_COLORS } = require('../../utils/modLogger');
const { validateModerationTarget } = require('../../utils/staffSecurity');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(opt => opt.setName('user').setDescription('The user to kick').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for the kick').setRequired(false)),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const validation = validateModerationTarget(interaction, targetUser, PermissionFlagsBits.KickMembers);
    if (!validation.valid) {
      return interaction.reply({ embeds: [errorEmbed('Kick Failed', validation.error)], flags: 64 });
    }

    const member = validation.targetMember;
    if (!member) {
      return interaction.reply({ embeds: [errorEmbed('Kick Failed', 'Member is not in this server!')], flags: 64 });
    }

    if (!member.kickable) {
      return interaction.reply({ embeds: [errorEmbed('Kick Failed', 'I cannot kick this user! They may have higher permissions than me.')], flags: 64 });
    }

    try {
      await member.kick(reason);
      const caseObj = db.addCase(interaction.guild.id, 'kick', targetUser.id, interaction.user.id, reason);

      const embed = successEmbed('User Kicked', `**${targetUser.tag}** has been kicked from the server.\n**Case:** \`${caseObj.id}\`\n**Reason:** ${reason}`);
      await interaction.reply({ embeds: [embed] });

      const cfg = db.getGuildConfig(interaction.guild.id);
      if (cfg.mod_log_channel_id) {
        const logChannel = interaction.guild.channels.cache.get(cfg.mod_log_channel_id);
        if (logChannel) {
          const logEmbed = createModLogEmbed({
            action: '👢 Member Kicked',
            color: MOD_COLORS.KICK,
            target: targetUser,
            moderator: interaction.user,
            reason,
            extraDetails: {
              Case: `#${caseObj.id}`
            }
          });
          logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
      }
    } catch (err) {
      return interaction.reply({ embeds: [errorEmbed('Error', `Could not kick member: ${err.message}`)], flags: 64 });
    }
  }
};
