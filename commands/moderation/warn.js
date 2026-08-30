const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { createModLogEmbed, MOD_COLORS } = require('../../utils/modLogger');
const { validateModerationTarget } = require('../../utils/staffSecurity');
const { applyEscalation } = require('../../utils/punishmentEngine');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue an official warning to a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(opt => opt.setName('user').setDescription('The user to warn').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for the warning').setRequired(true)),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    const validation = validateModerationTarget(interaction, targetUser, PermissionFlagsBits.ModerateMembers);
    if (!validation.valid) {
      return interaction.reply({ embeds: [errorEmbed('Warning Failed', validation.error)], flags: 64 });
    }

    if (targetUser.bot) {
      return interaction.reply({ embeds: [errorEmbed('Invalid User', 'You cannot warn bots!')], flags: 64 });
    }

    db.addWarning(interaction.guild.id, targetUser.id, interaction.user.id, reason);
    const userWarnings = db.getWarnings(interaction.guild.id, targetUser.id);
    const last = userWarnings[userWarnings.length - 1];

    const embed = successEmbed('User Warned', `**${targetUser.tag}** has been issued warning **#${userWarnings.length}** (case \`${last?.case_id || '?'}\`).\n**Reason:** ${reason}`);
    await interaction.reply({ embeds: [embed] });

    const cfg = db.getGuildConfig(interaction.guild.id);
    if (cfg.mod_log_channel_id) {
      const logChannel = interaction.guild.channels.cache.get(cfg.mod_log_channel_id);
      if (logChannel) {
        const logEmbed = createModLogEmbed({
          action: '⚠️ Warning Issued',
          color: MOD_COLORS.WARN,
          target: targetUser,
          moderator: interaction.user,
          reason,
          extraDetails: {
            'Total Warnings': `${userWarnings.length}`,
            'Case': last?.case_id ? `#${last.case_id}` : 'n/a'
          }
        });
        logChannel.send({ embeds: [logEmbed] }).catch(() => {});
      }
    }

    // Run the configured escalation ladder for this new warning count.
    const escalated = await applyEscalation(
      interaction.guild,
      targetUser,
      userWarnings.length,
      `Reached ${userWarnings.length} warnings`
    ).catch(() => null);

    if (escalated) {
      await interaction.followUp({
        embeds: [successEmbed('Escalation Applied', `**${targetUser.tag}** was automatically **${escalated.outcome}** for reaching ${userWarnings.length} warnings.`)]
      }).catch(() => {});
    }
  }
};
