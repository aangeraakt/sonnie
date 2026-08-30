const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { createModLogEmbed, MOD_COLORS } = require('../../utils/modLogger');
const { validateModerationTarget } = require('../../utils/staffSecurity');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Remove a timeout from a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('The user to remove timeout from')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for removing the timeout')
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const validation = validateModerationTarget(interaction, targetUser, PermissionFlagsBits.ModerateMembers);
    if (!validation.valid) {
      return interaction.reply({ embeds: [errorEmbed('Untimeout Failed', validation.error)], flags: 64 });
    }

    const member = validation.targetMember;
    if (!member) {
      return interaction.reply({
        embeds: [errorEmbed('Untimeout Failed', 'That member is not in this server.')],
        flags: 64
      });
    }

    if (!member.communicationDisabledUntil) {
      return interaction.reply({
        embeds: [errorEmbed('Untimeout Failed', 'That member is not timed out.')],
        flags: 64
      });
    }

    if (!member.moderatable) {
      return interaction.reply({
        embeds: [errorEmbed('Untimeout Failed', 'I cannot update the timeout for this member.')],
        flags: 64
      });
    }

    try {
      await member.timeout(null, reason);
      await interaction.reply({
        embeds: [successEmbed('Timeout Removed', `**${targetUser.tag}** can talk again.\n**Reason:** ${reason}`)]
      });

      const cfg = db.getGuildConfig(interaction.guild.id);
      if (cfg.mod_log_channel_id) {
        const logChannel = interaction.guild.channels.cache.get(cfg.mod_log_channel_id);
        if (logChannel) {
          logChannel.send({
            embeds: [createModLogEmbed({
              action: 'Timeout Removed',
              color: MOD_COLORS.UNTIMEOUT,
              target: targetUser,
              moderator: interaction.user,
              reason
            })]
          }).catch(() => {});
        }
      }
    } catch (err) {
      return interaction.reply({
        embeds: [errorEmbed('Untimeout Failed', `Could not remove the timeout: ${err.message}`)],
        flags: 64
      });
    }
  }
};
