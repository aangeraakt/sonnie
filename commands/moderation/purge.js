const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { createModLogEmbed, MOD_COLORS } = require('../../utils/modLogger');
const { checkStaffPermission } = require('../../utils/staffSecurity');
const db = require('../../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete multiple messages at once from the current channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages to purge (1-100)').setMinValue(1).setMaxValue(100).setRequired(true)),

  async execute(interaction) {
    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission Denied', 'You need `Manage Messages` permissions to purge messages.')],
        flags: 64
      });
    }

    const amount = interaction.options.getInteger('amount');

    try {
      const deleted = await interaction.channel.bulkDelete(amount, true);

      const cfg = db.getGuildConfig(interaction.guild.id);
      if (cfg.mod_log_channel_id) {
        const logChannel = interaction.guild.channels.cache.get(cfg.mod_log_channel_id);
        if (logChannel) {
          const logEmbed = createModLogEmbed({
            action: '🧹 Messages Purged',
            color: MOD_COLORS.PURGE,
            moderator: interaction.user,
            channel: interaction.channel,
            extraDetails: {
              '🗑️ Deleted Messages': `${deleted.size} messages`
            }
          });
          logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
      }

      return interaction.reply({
        embeds: [successEmbed('Purge Complete 🧹', `Successfully deleted **${deleted.size}** messages.`)],
        flags: 64
      });
    } catch (err) {
      return interaction.reply({
        embeds: [errorEmbed('Purge Failed', `Could not bulk delete messages: ${err.message}`)],
        flags: 64
      });
    }
  }
};
