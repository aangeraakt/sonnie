const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { createModLogEmbed, MOD_COLORS } = require('../../utils/modLogger');
const { validateModerationTarget } = require('../../utils/staffSecurity');
const { sendLog } = require('../../utils/auditLogger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unwarn')
    .setDescription('Remove a single warning from a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(opt => opt.setName('user').setDescription('The user to clear a warning from').setRequired(true))
    .addIntegerOption(opt =>
      opt.setName('number')
        .setDescription('Which warning to remove (from /moderation warnings). Defaults to the most recent')
        .setMinValue(1)
        .setRequired(false)
    )
    .addStringOption(opt => opt.setName('reason').setDescription('Why the warning is being removed').setRequired(false)),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const number = interaction.options.getInteger('number');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const validation = validateModerationTarget(interaction, targetUser, PermissionFlagsBits.ModerateMembers);
    if (!validation.valid) {
      return interaction.reply({ embeds: [errorEmbed('Cannot Remove Warning', validation.error)], flags: 64 });
    }

    const warnings = db.getWarnings(interaction.guild.id, targetUser.id);
    if (!warnings.length) {
      return interaction.reply({ embeds: [errorEmbed('No Warnings', `**${targetUser.tag}** has no warnings to remove.`)], flags: 64 });
    }

    const index = number ? number - 1 : warnings.length - 1;
    if (index < 0 || index >= warnings.length) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid Warning', `**${targetUser.tag}** has **${warnings.length}** warning${warnings.length === 1 ? '' : 's'}. Pick a number between 1 and ${warnings.length}.`)],
        flags: 64
      });
    }

    const removed = warnings[index];
    const ok = db.removeWarning(interaction.guild.id, targetUser.id, removed.id);
    if (!ok) {
      return interaction.reply({ embeds: [errorEmbed('Removal Failed', 'That warning could not be found any more.')], flags: 64 });
    }

    const remaining = db.getWarnings(interaction.guild.id, targetUser.id).length;
    db.addCase(interaction.guild.id, 'unwarn', targetUser.id, interaction.user.id, reason, { removed_case_id: removed.case_id });

    await interaction.reply({
      embeds: [successEmbed('Warning Removed',
        `Removed warning **#${index + 1}** from **${targetUser.tag}**.\n` +
        `**Original reason:** ${removed.reason}\n**Removed because:** ${reason}\n\nThey now have **${remaining}** warning${remaining === 1 ? '' : 's'}.`)]
    });

    await sendLog(interaction.guild, 'moderation', createModLogEmbed({
      action: 'Warning Removed',
      color: MOD_COLORS.UNTIMEOUT,
      target: targetUser,
      moderator: interaction.user,
      reason,
      extraDetails: {
        'Original Warning': removed.reason,
        'Original Case': removed.case_id ? `#${removed.case_id}` : 'n/a',
        'Warnings Remaining': String(remaining)
      }
    })).catch(() => {});
  }
};
