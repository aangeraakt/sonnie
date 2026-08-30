const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { createModLogEmbed, MOD_COLORS } = require('../../utils/modLogger');
const { checkStaffPermission } = require('../../utils/staffSecurity');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(opt =>
      opt.setName('user')
        .setDescription('User ID to unban')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for the unban')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.BanMembers)) {
      return interaction.reply({
        embeds: [errorEmbed('Unban Failed', 'You need Ban Members permission to unban a user.')],
        flags: 64
      });
    }

    const raw = interaction.options.getString('user').trim();
    const userId = raw.replace(/[<@!>]/g, '');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!/^\d{17,20}$/.test(userId)) {
      return interaction.reply({
        embeds: [errorEmbed('Unban Failed', 'Provide a valid user ID.')],
        flags: 64
      });
    }

    try {
      const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
      if (!ban) {
        return interaction.reply({
          embeds: [errorEmbed('Unban Failed', 'That user is not banned.')],
          flags: 64
        });
      }

      await interaction.guild.bans.remove(userId, reason);
      const target = ban.user;
      const caseObj = db.addCase(interaction.guild.id, 'unban', target.id, interaction.user.id, reason);

      await interaction.reply({
        embeds: [successEmbed('User Unbanned', `**${target.tag}** can join the server again.\n**Case:** \`${caseObj.id}\`\n**Reason:** ${reason}`)]
      });

      const cfg = db.getGuildConfig(interaction.guild.id);
      if (cfg.mod_log_channel_id) {
        const logChannel = interaction.guild.channels.cache.get(cfg.mod_log_channel_id);
        if (logChannel) {
          logChannel.send({
            embeds: [createModLogEmbed({
              action: 'Member Unbanned',
              color: MOD_COLORS.UNBAN,
              target,
              moderator: interaction.user,
              reason,
              extraDetails: {
                Case: `#${caseObj.id}`
              }
            })]
          }).catch(() => {});
        }
      }
    } catch (err) {
      return interaction.reply({
        embeds: [errorEmbed('Unban Failed', `Could not unban that user: ${err.message}`)],
        flags: 64
      });
    }
  }
};
