const { PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../database/db');
const Logger = require('./logger');
const { createEmbed, withGuildColor } = require('./embedBuilder');
const { sendLog } = require('./auditLogger');

// guildId -> array of join timestamps
const joinWindows = new Map();
// guildId -> { until, channels: [ids] } while a raid lockdown is active
const activeLockdowns = new Map();

function pushJoin(guildId, windowMs) {
  const now = Date.now();
  const list = (joinWindows.get(guildId) || []).filter((time) => now - time < windowMs);
  list.push(now);
  joinWindows.set(guildId, list);
  return list.length;
}

/** Locks every text channel by denying SendMessages to @everyone. */
async function lockdownServer(guild, reason) {
  const me = guild.members.me;
  if (!me || !me.permissions.has(PermissionFlagsBits.ManageChannels)) return [];

  const locked = [];
  for (const channel of guild.channels.cache.values()) {
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) continue;
    const current = channel.permissionOverwrites.cache.get(guild.id);
    if (current?.deny?.has(PermissionFlagsBits.SendMessages)) continue;

    const ok = await channel.permissionOverwrites.edit(guild.id, { SendMessages: false }, { reason })
      .then(() => true)
      .catch(() => false);
    if (ok) locked.push(channel.id);
  }
  return locked;
}

async function liftLockdown(guild, channelIds, reason) {
  let unlocked = 0;
  for (const channelId of channelIds) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel) continue;
    const ok = await channel.permissionOverwrites.edit(guild.id, { SendMessages: null }, { reason })
      .then(() => true)
      .catch(() => false);
    if (ok) unlocked += 1;
  }
  return unlocked;
}

function isLockedDown(guildId) {
  const entry = activeLockdowns.get(guildId);
  if (!entry) return false;
  if (entry.until && Date.now() > entry.until) {
    activeLockdowns.delete(guildId);
    return false;
  }
  return true;
}

async function endRaidLockdown(guild, manual = false) {
  const entry = activeLockdowns.get(guild.id);
  if (!entry) return 0;
  activeLockdowns.delete(guild.id);
  const unlocked = await liftLockdown(guild, entry.channels, manual ? 'Raid lockdown lifted manually' : 'Raid lockdown expired');
  await withGuildColor(guild.id, () => sendLog(guild, 'moderation', createEmbed({
    title: 'Raid Lockdown Lifted',
    description: `Unlocked **${unlocked}** channel${unlocked === 1 ? '' : 's'}.`
  }))).catch(() => {});
  return unlocked;
}

/**
 * Called on every join. Enforces the minimum account age and detects join
 * bursts, then applies the configured raid response.
 *
 * Returns { blocked: true } when the member was removed, so guildMemberAdd
 * can skip welcome messages and auto-roles for them.
 */
async function handleJoin(member) {
  const guild = member.guild;
  let cfg;
  try {
    cfg = db.getAutomodConfig(guild.id);
  } catch (err) {
    return { blocked: false };
  }
  if (!cfg.raid_enabled) return { blocked: false };

  // Minimum account age gate.
  const minDays = Number(cfg.raid_account_age_days) || 0;
  if (minDays > 0) {
    const ageDays = (Date.now() - member.user.createdTimestamp) / 86400000;
    if (ageDays < minDays) {
      const kicked = await member.kick(`Account younger than the ${minDays} day minimum`).then(() => true).catch(() => false);
      if (kicked) {
        await withGuildColor(guild.id, () => sendLog(guild, 'moderation', createEmbed({
          title: 'New Account Rejected',
          description: `**${member.user.tag}** was removed: account is ${ageDays.toFixed(1)} days old, minimum is ${minDays}.`,
          thumbnail: member.user.displayAvatarURL({ dynamic: true })
        }))).catch(() => {});
        db.addCase(guild.id, 'kick', member.id, guild.client.user.id, `Account age below ${minDays} day minimum`);
        return { blocked: true, reason: 'account_age' };
      }
    }
  }

  const windowMs = (Number(cfg.raid_seconds) || 10) * 1000;
  const threshold = Number(cfg.raid_joins) || 8;
  const count = pushJoin(guild.id, windowMs);

  if (count < threshold) return { blocked: false };
  if (isLockedDown(guild.id)) return { blocked: false };

  // Raid detected - take the configured action against the burst.
  const recentJoiners = guild.members.cache
    .filter((m) => m.joinedTimestamp && Date.now() - m.joinedTimestamp < windowMs && !m.user.bot);

  let summary = '';

  if (cfg.raid_action === 'lockdown') {
    const locked = await lockdownServer(guild, 'Automatic raid lockdown');
    activeLockdowns.set(guild.id, { until: Date.now() + 15 * 60 * 1000, channels: locked });
    summary = `Locked **${locked.length}** channel${locked.length === 1 ? '' : 's'} for 15 minutes.`;

    const timer = setTimeout(() => endRaidLockdown(guild).catch(() => {}), 15 * 60 * 1000);
    if (typeof timer.unref === 'function') timer.unref();
  } else if (cfg.raid_action === 'kick') {
    let removed = 0;
    for (const joiner of recentJoiners.values()) {
      const ok = await joiner.kick('Automatic raid protection').then(() => true).catch(() => false);
      if (ok) removed += 1;
    }
    summary = `Kicked **${removed}** recent joiner${removed === 1 ? '' : 's'}.`;
  } else if (cfg.raid_action === 'ban') {
    let removed = 0;
    for (const joiner of recentJoiners.values()) {
      const ok = await joiner.ban({ reason: 'Automatic raid protection' }).then(() => true).catch(() => false);
      if (ok) removed += 1;
    }
    summary = `Banned **${removed}** recent joiner${removed === 1 ? '' : 's'}.`;
  }

  joinWindows.set(guild.id, []);

  await withGuildColor(guild.id, () => sendLog(guild, 'moderation', createEmbed({
    title: 'Raid Detected',
    description: `**${count}** members joined within ${cfg.raid_seconds}s (threshold: ${threshold}).\n\n${summary}`,
    fields: [
      { name: 'Action', value: `\`${cfg.raid_action}\``, inline: true },
      { name: 'Lift Manually', value: '`/moderation lockdown enabled:false`', inline: true }
    ]
  }))).catch(() => {});

  Logger.warn(`Raid protection triggered in ${guild.name}: ${count} joins in ${cfg.raid_seconds}s.`);
  return { blocked: cfg.raid_action !== 'lockdown', reason: 'raid' };
}

module.exports = {
  handleJoin,
  lockdownServer,
  liftLockdown,
  endRaidLockdown,
  isLockedDown,
  activeLockdowns
};
