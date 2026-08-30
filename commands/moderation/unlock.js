const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { createModLogEmbed, MOD_COLORS } = require('../../utils/modLogger');
const { checkStaffPermission } = require('../../utils/staffSecurity');

const UNLOCK_PERMS = {
  SendMessages: null,
  SendMessagesInThreads: null,
  CreatePublicThreads: null,
  CreatePrivateThreads: null,
  AddReactions: null
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock a text channel so members can send messages again')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('Channel to unlock (defaults to this channel)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for unlocking the channel')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({
        embeds: [errorEmbed('Unlock Failed', 'You need Manage Channels permission to unlock a channel.')],
        flags: 64
      });
    }

    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!channel || channel.type !== ChannelType.GuildText) {
      return interaction.reply({
        embeds: [errorEmbed('Unlock Failed', 'Pick a text channel to unlock.')],
        flags: 64
      });
    }

    try {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, UNLOCK_PERMS, { reason });
      await interaction.reply({
        embeds: [successEmbed('Channel Unlocked', `${channel} is unlocked. Members can send messages again.\n**Reason:** ${reason}`)]
      });

      const cfg = db.getGuildConfig(interaction.guild.id);
      if (cfg.mod_log_channel_id) {
        const logChannel = interaction.guild.channels.cache.get(cfg.mod_log_channel_id);
        if (logChannel) {
          logChannel.send({
            embeds: [createModLogEmbed({
              action: 'Channel Unlocked',
              color: MOD_COLORS.UNLOCK,
              moderator: interaction.user,
              reason,
              extraDetails: { Channel: `${channel}` }
            })]
          }).catch(() => {});
        }
      }
    } catch (err) {
      return interaction.reply({
        embeds: [errorEmbed('Unlock Failed', `Could not unlock this channel: ${err.message}`)],
        flags: 64
      });
    }
  }
};
