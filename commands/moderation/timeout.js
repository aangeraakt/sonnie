const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { createModLogEmbed, MOD_COLORS } = require('../../utils/modLogger');
const { validateModerationTarget } = require('../../utils/staffSecurity');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout (mute) a user for a specified duration')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(opt => opt.setName('user').setDescription('The user to timeout').setRequired(true))
    .addIntegerOption(opt => opt.setName('duration').setDescription('Duration number').setMinValue(1).setRequired(true))
    .addStringOption(opt => opt.setName('unit').setDescription('Time unit')
      .setRequired(true)
      .addChoices(
        { name: 'Minutes', value: 'm' },
        { name: 'Hours', value: 'h' },
        { name: 'Days', value: 'd' }
      )
    )
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for timeout').setRequired(false)),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const durationNum = interaction.options.getInteger('duration');
    const unit = interaction.options.getString('unit');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const validation = validateModerationTarget(interaction, targetUser, PermissionFlagsBits.ModerateMembers);
    if (!validation.valid) {
      return interaction.reply({ embeds: [errorEmbed('Timeout Failed', validation.error)], flags: 64 });
    }

    const member = validation.targetMember;
    if (!member) {
      return interaction.reply({ embeds: [errorEmbed('Timeout Failed', 'Member not found in server!')], flags: 64 });
    }

    if (!member.moderatable) {
      return interaction.reply({ embeds: [errorEmbed('Timeout Failed', 'I cannot timeout this user! Their roles may be higher than mine.')], flags: 64 });
    }

    let multiplier = 60 * 1000;
    let unitLabel = 'Minutes';
    if (unit === 'h') {
      multiplier = 60 * 60 * 1000;
      unitLabel = 'Hours';
    }
    if (unit === 'd') {
      multiplier = 24 * 60 * 60 * 1000;
      unitLabel = 'Days';
    }

    const ms = durationNum * multiplier;

    try {
      await member.timeout(ms, reason);
      const caseObj = db.addCase(interaction.guild.id, 'timeout', targetUser.id, interaction.user.id, reason, `${durationNum} ${unitLabel}`);

      const embed = successEmbed('User Timed Out', `**${targetUser.tag}** has been timed out for **${durationNum} ${unitLabel}**.\n**Case:** \`${caseObj.id}\`\n**Reason:** ${reason}`);
      await interaction.reply({ embeds: [embed] });

      const cfg = db.getGuildConfig(interaction.guild.id);
      if (cfg.mod_log_channel_id) {
        const logChannel = interaction.guild.channels.cache.get(cfg.mod_log_channel_id);
        if (logChannel) {
          const logEmbed = createModLogEmbed({
            action: '⏳ Member Timed Out',
            color: MOD_COLORS.TIMEOUT,
            target: targetUser,
            moderator: interaction.user,
            reason,
            extraDetails: {
              Duration: `${durationNum} ${unitLabel}`,
              Case: `#${caseObj.id}`
            }
          });
          logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
      }
    } catch (err) {
      return interaction.reply({ embeds: [errorEmbed('Error', `Could not timeout user: ${err.message}`)], flags: 64 });
    }
  }
};
