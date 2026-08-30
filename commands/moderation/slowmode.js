const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { checkStaffPermission } = require('../../utils/staffSecurity');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set slowmode for a channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((opt) =>
      opt.setName('seconds').setDescription('Slowmode in seconds (0 to disable)').setRequired(true).setMinValue(0).setMaxValue(21600)
    )
    .addChannelOption((opt) =>
      opt.setName('channel').setDescription('Channel to update').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    ),

  async execute(interaction) {
    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission Denied', 'You need Manage Channels to set slowmode.')],
        flags: 64
      });
    }

    const seconds = interaction.options.getInteger('seconds');
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    if (!channel?.setRateLimitPerUser) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Channel', 'Slowmode can only be set on text channels.')], flags: 64 });
    }

    try {
      await channel.setRateLimitPerUser(seconds, `Slowmode set by ${interaction.user.tag}`);
    } catch (err) {
      return interaction.reply({ embeds: [errorEmbed('Failed', err.message)], flags: 64 });
    }

    const text = seconds === 0 ? `Slowmode disabled in ${channel}.` : `Slowmode in ${channel} is now **${seconds}s**.`;
    return interaction.reply({ embeds: [successEmbed('Slowmode Updated', text)] });
  }
};
