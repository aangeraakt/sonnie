const db = require('../database/db');
const Logger = require('./logger');
const { createEmbed, withGuildColor } = require('./embedBuilder');
const { createModLogEmbed, MOD_COLORS } = require('./modLogger');
const { sendLog } = require('./auditLogger');

const DURATION_PATTERN = /^(\d+)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|w|weeks?)$/i;
const UNIT_MS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000
};

/** Parses "10m", "2 hours", "1d" into milliseconds. Returns null when invalid. */
function parseDuration(input) {
  if (!input) return null;
  const match = DURATION_PATTERN.exec(String(input).trim());
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase()[0];
  const ms = amount * (UNIT_MS[unit] || 0);
  return ms > 0 ? ms : null;
}

function formatDuration(ms) {
  const units = [
    ['week', 7 * 24 * 60 * 60 * 1000],
    ['day', 24 * 60 * 60 * 1000],
    ['hour', 60 * 60 * 1000],
    ['minute', 60 * 1000],
    ['second', 1000]
  ];
  const parts = [];
  let remaining = ms;
  for (const [name, size] of units) {
    const value = Math.floor(remaining / size);
    if (value > 0) {
      parts.push(`${value} ${name}${value === 1 ? '' : 's'}`);
      remaining -= value * size;
    }
    if (parts.length === 2) break;
  }
  return parts.join(' ') || '0 seconds';
}

/**
 * Applies the configured escalation ladder after a warning is issued.
 * Returns a description of what happened, or null when nothing triggered.
 */
async function applyEscalation(guild, targetUser, warnCount, reason = 'Automatic warning escalation') {
  const cfg = db.getAutomodConfig(guild.id);
  if (!cfg.escalation_enabled) return null;

  const rules = (cfg.escalation || []).slice().sort((a, b) => a.warns - b.warns);
  // Only fire on the exact threshold so a member is not punished repeatedly.
  const rule = rules.find((item) => item.warns === warnCount);
  if (!rule) return null;

  const member = await guild.members.fetch(targetUser.id).catch(() => null);
  const me = guild.members.me;
  let outcome = null;

  try {
    if (rule.action === 'timeout') {
      if (!member || !member.moderatable) return null;
      const ms = Math.min((rule.duration || 3600) * 1000, 28 * 24 * 60 * 60 * 1000);
      await member.timeout(ms, `${reason} (${warnCount} warnings)`);
      outcome = `timed out for ${formatDuration(ms)}`;
      db.addCase(guild.id, 'timeout', targetUser.id, me.id, `Auto-escalation at ${warnCount} warnings`);
    } else if (rule.action === 'kick') {
      if (!member || !member.kickable) return null;
      await member.kick(`${reason} (${warnCount} warnings)`);
      outcome = 'kicked';
      db.addCase(guild.id, 'kick', targetUser.id, me.id, `Auto-escalation at ${warnCount} warnings`);
    } else if (rule.action === 'ban') {
      if (member && !member.bannable) return null;
      await guild.members.ban(targetUser.id, { reason: `${reason} (${warnCount} warnings)` });
      outcome = 'banned';
      db.addCase(guild.id, 'ban', targetUser.id, me.id, `Auto-escalation at ${warnCount} warnings`);
    } else if (rule.action === 'tempban') {
      if (member && !member.bannable) return null;
      const ms = (rule.duration || 86400) * 1000;
      await guild.members.ban(targetUser.id, { reason: `${reason} (${warnCount} warnings)` });
      db.addTempBan(guild.id, targetUser.id, Date.now() + ms, me.id, `Auto-escalation at ${warnCount} warnings`);
      outcome = `temporarily banned for ${formatDuration(ms)}`;
      db.addCase(guild.id, 'tempban', targetUser.id, me.id, `Auto-escalation at ${warnCount} warnings`);
    }
  } catch (err) {
    Logger.error(`Escalation (${rule.action}) failed in ${guild.name}:`, err);
    return null;
  }

  if (!outcome) return null;

  await sendLog(guild, 'moderation', createModLogEmbed({
    action: 'Warning Escalation Triggered',
    color: MOD_COLORS.WARN,
    target: targetUser,
    moderator: guild.client.user,
    reason: `Reached ${warnCount} warnings`,
    extraDetails: {
      'Action Taken': outcome,
      'Threshold': `${rule.warns} warnings`
    }
  }));

  Logger.info(`Escalation in ${guild.name}: ${targetUser.tag} ${outcome} at ${warnCount} warnings.`);
  return { outcome, rule };
}

/**
 * Background loop that lifts expired temporary bans.
 */
function startTempBanLoop(client, intervalMs = 30 * 1000) {
  const timer = setInterval(async () => {
    let due;
    try {
      due = db.takeDueTempBans();
    } catch (err) {
      return;
    }
    if (!due.length) return;

    for (const ban of due) {
      const guild = client.guilds.cache.get(ban.guild_id);
      if (!guild) continue;

      const unbanned = await guild.members.unban(ban.user_id, 'Temporary ban expired')
        .then(() => true)
        .catch(() => false);
      if (!unbanned) continue;

      const user = await client.users.fetch(ban.user_id).catch(() => null);
      db.addCase(guild.id, 'unban', ban.user_id, client.user.id, 'Temporary ban expired');

      await withGuildColor(guild.id, () => sendLog(guild, 'moderation', createModLogEmbed({
        action: 'Temporary Ban Expired',
        color: MOD_COLORS.UNBAN,
        target: user || { id: ban.user_id, tag: `Unknown (${ban.user_id})` },
        moderator: client.user,
        reason: ban.reason || 'Temporary ban duration elapsed',
        extraDetails: { 'Originally Banned By': `<@${ban.moderator_id}>` }
      }))).catch(() => {});

      Logger.info(`Lifted expired temp ban for ${ban.user_id} in ${guild.name}.`);
    }
  }, intervalMs);

  if (typeof timer.unref === 'function') timer.unref();
  Logger.info('Temporary ban expiry loop started.');
  return timer;
}

/** Sends the target a courtesy DM before a punishment lands. Never throws. */
async function notifyTarget(user, guild, action, reason, extra = '') {
  return user.send({
    embeds: [createEmbed({
      title: `You were ${action} in ${guild.name}`,
      description: `**Reason:** ${reason || 'No reason provided'}${extra ? `\n${extra}` : ''}`
    })]
  }).catch(() => null);
}

module.exports = {
  parseDuration,
  formatDuration,
  applyEscalation,
  startTempBanLoop,
  notifyTarget
};
