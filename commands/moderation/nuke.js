const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Logger = require('../../utils/logger');
const db = require('../../database/db');
const { createEmbed, errorEmbed, successEmbed } = require('../../utils/embedBuilder');
const { createModLogEmbed, MOD_COLORS } = require('../../utils/modLogger');
const { checkStaffPermission } = require('../../utils/staffSecurity');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nuke')
    .setDescription('Delete and recreate the current channel with the exact same permissions and settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission Denied', 'You need `Manage Channels` permissions to nuke a channel.')],
        flags: 64
      });
    }

    const channel = interaction.channel;
    const guild = interaction.guild;

    if (!channel || !channel.deletable) {
      return interaction.reply({
        embeds: [errorEmbed('Nuke Error', 'Cannot delete/nuke this channel! Make sure the bot has Manage Channels permission.')],
        flags: 64
      });
    }

    const channelData = {
      name: channel.name,
      type: channel.type,
      topic: channel.topic,
      nsfw: channel.nsfw,
      parent: channel.parentId,
      permissionOverwrites: channel.permissionOverwrites.cache.map(p => ({
        id: p.id,
        type: p.type,
        allow: p.allow,
        deny: p.deny
      })),
      position: channel.position,
      rateLimitPerUser: channel.rateLimitPerUser
    };

    await interaction.reply({
      embeds: [successEmbed('💣 Nuking Channel...', 'Deleting and recreating this channel in 3 seconds...')]
    });

    setTimeout(async () => {
      try {
        await channel.delete('Channel Nuked by Administrator');

        const newChannel = await guild.channels.create({
          name: channelData.name,
          type: channelData.type,
          topic: channelData.topic,
          nsfw: channelData.nsfw,
          parent: channelData.parent,
          permissionOverwrites: channelData.permissionOverwrites,
          position: channelData.position,
          rateLimitPerUser: channelData.rateLimitPerUser
        });

        const nukeEmbed = createEmbed({
          title: '💥 CHANNEL NUKED 💥',
          description: `This channel was nuked and reset by ${interaction.user}!\nAll permissions and settings have been restored.`,
          footerText: 'Sonnies Nuke System'
        });

        await newChannel.send({ embeds: [nukeEmbed] });

        // Log to mod channel
        const cfg = db.getGuildConfig(guild.id);
        if (cfg.mod_log_channel_id) {
          const logChannel = guild.channels.cache.get(cfg.mod_log_channel_id);
          if (logChannel) {
            const logEmbed = createModLogEmbed({
              action: '💥 Channel Nuked',
              color: MOD_COLORS.NUKE,
              moderator: interaction.user,
              channel: newChannel,
              extraDetails: {
                'Channel Name': `#${channelData.name}`
              }
            });
            logChannel.send({ embeds: [logEmbed] }).catch(() => {});
          }
        }
      } catch (err) {
        Logger.error('Failed to nuke channel:', err);
      }
    }, 3000);
  }
};
