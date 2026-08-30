const { ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('../database/db');
const Logger = require('../utils/logger');
const { startVoiceSession, endVoiceSession } = require('../utils/levelingManager');
const { logVoiceEvent } = require('../utils/auditLogger');

async function deleteIfEmpty(channel) {
  const tracked = db.getTempVoice(channel.id);
  if (!tracked) return;
  if (channel.members.size > 0) return;
  db.removeTempVoice(channel.id);
  await channel.delete('Temporary voice channel empty').catch((err) => {
    Logger.error('Failed to delete temp voice channel:', err);
  });
}

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState) {
    const guild = newState.guild || oldState.guild;
    if (!guild) return;
    const cfg = db.getGuildConfig(guild.id);
    const hubId = cfg.temp_vc_hub_id;
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    // Voice XP session tracking + voice audit logging.
    if (oldState.channelId !== newState.channelId) {
      if (newState.channelId) startVoiceSession(guild.id, member.id);
      else endVoiceSession(guild.id, member.id);
    }
    logVoiceEvent(oldState, newState).catch(() => {});

    if (oldState.channelId && oldState.channelId !== newState.channelId && oldState.channel) {
      await deleteIfEmpty(oldState.channel);
    }

    if (!hubId || newState.channelId !== hubId) return;

    const existing = db.getTempVoiceByOwner(guild.id, member.id);
    if (existing) {
      const owned = guild.channels.cache.get(existing.channel_id);
      if (owned) {
        await member.voice.setChannel(owned).catch(() => {});
        return;
      }
      db.removeTempVoice(existing.channel_id);
    }

    const parent = cfg.temp_vc_category_id || newState.channel?.parentId || null;
    const name = `${member.displayName}'s channel`.slice(0, 100);

    try {
      const created = await guild.channels.create({
        name,
        type: ChannelType.GuildVoice,
        parent,
        permissionOverwrites: [
          {
            id: member.id,
            allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ManageChannels]
          }
        ]
      });
      db.addTempVoice(created.id, guild.id, member.id);
      await member.voice.setChannel(created);
    } catch (err) {
      Logger.error('Failed to create temp voice channel:', err);
    }
  }
};
