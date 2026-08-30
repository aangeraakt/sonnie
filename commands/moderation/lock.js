const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { createModLogEmbed, MOD_COLORS } = require('../../utils/modLogger');
const { checkStaffPermission } = require('../../utils/staffSecurity');

const LOCK_PERMS = {
  SendMessages: false,
  SendMessagesInThreads: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false,
  AddReactions: false
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock a text channel so members cannot send messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('Channel to lock (defaults to this channel)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for locking the channel')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({
        embeds: [errorEmbed('Lock Failed', 'You need Manage Channels permission to lock a channel.')],
        flags: 64
      });
    }

    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!channel || channel.type !== ChannelType.GuildText) {
      return interaction.reply({
        embeds: [errorEmbed('Lock Failed', 'Pick a text channel to lock.')],
        flags: 64
      });
    }

    try {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, LOCK_PERMS, { reason });
      await interaction.reply({
        embeds: [successEmbed('Channel Locked', `${channel} is locked. Members can no longer send messages.\n**Reason:** ${reason}`)]
      });

      const cfg = db.getGuildConfig(interaction.guild.id);
      if (cfg.mod_log_channel_id) {
        const logChannel = interaction.guild.channels.cache.get(cfg.mod_log_channel_id);
        if (logChannel) {
          logChannel.send({
            embeds: [createModLogEmbed({
              action: 'Channel Locked',
              color: MOD_COLORS.LOCK,
              moderator: interaction.user,
              reason,
              extraDetails: { Channel: `${channel}` }
            })]
          }).catch(() => {});
        }
      }
    } catch (err) {
      return interaction.reply({
        embeds: [errorEmbed('Lock Failed', `Could not lock this channel: ${err.message}`)],
        flags: 64
      });
    }
  }
};
