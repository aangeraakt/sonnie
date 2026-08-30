const { PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../database/db');

/**
 * DJ gating for the music commands.
 *
 * A member may control playback when any of these hold:
 *  - no DJ role is configured (open to everyone, the original behaviour)
 *  - they hold the DJ role, the staff role, or Manage Server
 *  - they are alone with the bot in the voice channel
 *  - they requested the track currently playing (their own track only)
 */
function isDj(member, guild) {
  if (!member) return false;
  const cfg = db.getGuildConfig(guild.id);
  const djRoleId = cfg.dj_role_id;

  if (!djRoleId) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.roles.cache.has(djRoleId)) return true;
  if (cfg.staff_role_id && member.roles.cache.has(cfg.staff_role_id)) return true;

  return false;
}

function isAloneWithBot(member, guild) {
  const channel = member.voice?.channel;
  if (!channel || channel.type === ChannelType.GuildStageVoice) return false;
  const humans = channel.members.filter((m) => !m.user.bot);
  return humans.size === 1 && humans.has(member.id) && channel.members.has(guild.members.me.id);
}

/**
 * Returns { allowed, reason }. `ownTrackOnly` lets a non-DJ act on the track
 * they themselves queued (used by /music skip).
 */
function checkDjPermission(member, guild, { queue = null, ownTrackOnly = false } = {}) {
  if (isDj(member, guild)) return { allowed: true };
  if (isAloneWithBot(member, guild)) return { allowed: true };

  if (ownTrackOnly && queue?.currentTrack?.requester?.id === member.id) {
    return { allowed: true };
  }

  const cfg = db.getGuildConfig(guild.id);
  return {
    allowed: false,
    reason: `Music controls are limited to <@&${cfg.dj_role_id}>.` +
      (ownTrackOnly ? ' You can still control tracks you queued yourself.' : '') +
      ' You can also use them when you are alone in the voice channel with me.'
  };
}

module.exports = { isDj, isAloneWithBot, checkDjPermission };
