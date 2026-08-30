const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { createEmbed } = require('../../utils/embedBuilder');

const TYPE_NAMES = {
  [ChannelType.GuildText]: 'Text',
  [ChannelType.GuildVoice]: 'Voice',
  [ChannelType.GuildCategory]: 'Category',
  [ChannelType.GuildAnnouncement]: 'Announcement',
  [ChannelType.GuildStageVoice]: 'Stage',
  [ChannelType.GuildForum]: 'Forum',
  [ChannelType.PublicThread]: 'Public thread',
  [ChannelType.PrivateThread]: 'Private thread'
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('channelinfo')
    .setDescription('Show detailed information about a channel')
    .addChannelOption(opt => opt.setName('channel').setDescription('The channel to inspect (default: this one)').setRequired(false)),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const created = Math.floor(channel.createdTimestamp / 1000);

    const fields = [
      { name: 'Type', value: `\`${TYPE_NAMES[channel.type] || channel.type}\``, inline: true },
      { name: 'Category', value: channel.parentId ? `<#${channel.parentId}>` : '`None`', inline: true },
      { name: 'Position', value: `\`${channel.rawPosition ?? 'n/a'}\``, inline: true }
    ];

    if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) {
      fields.push(
        { name: 'NSFW', value: channel.nsfw ? 'Yes' : 'No', inline: true },
        { name: 'Slowmode', value: channel.rateLimitPerUser ? `\`${channel.rateLimitPerUser}s\`` : '`Off`', inline: true },
        { name: 'Threads', value: `\`${channel.threads?.cache.size ?? 0}\``, inline: true }
      );
    }

    if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
      fields.push(
        { name: 'Bitrate', value: `\`${Math.round((channel.bitrate || 0) / 1000)} kbps\``, inline: true },
        { name: 'User Limit', value: channel.userLimit ? `\`${channel.userLimit}\`` : '`Unlimited`', inline: true },
        { name: 'Connected', value: `\`${channel.members?.size ?? 0}\``, inline: true }
      );
    }

    if (channel.type === ChannelType.GuildCategory) {
      const children = interaction.guild.channels.cache.filter((item) => item.parentId === channel.id);
      fields.push({ name: 'Channels Inside', value: `\`${children.size}\``, inline: true });
    }

    const overwrites = channel.permissionOverwrites?.cache;
    if (overwrites?.size) {
      fields.push({ name: 'Permission Overwrites', value: `\`${overwrites.size}\``, inline: true });
    }

    fields.push({ name: 'Created', value: `<t:${created}:D> (<t:${created}:R>)`, inline: false });
    if (channel.topic) fields.push({ name: 'Topic', value: channel.topic.slice(0, 1000), inline: false });

    return interaction.reply({
      embeds: [createEmbed({
        title: `Channel - ${channel.name}`,
        description: `${channel}`,
        fields,
        footerText: `Channel ID: ${channel.id}`
      })]
    });
  }
};
