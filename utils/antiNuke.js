const { AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const db = require('../database/db');
const Logger = require('./logger');
const { createEmbed, withGuildColor } = require('./embedBuilder');
const { sendLog, findExecutor } = require('./auditLogger');

// `${guildId}-${executorId}-${kind}` -> timestamps
const actionWindows = new Map();

const THRESHOLD_KEYS = {
  channel_delete: 'nuke_channel_deletes',
  role_delete: 'nuke_role_deletes',
  ban: 'nuke_bans'
};

const KIND_LABELS = {
  channel_delete: 'channel deletions',
  role_delete: 'role deletions',
  ban: 'member bans'
};

function record(guildId, executorId, kind, windowMs) {
  const key = `${guildId}-${executorId}-${kind}`;
  const now = Date.now();
  const list = (actionWindows.get(key) || []).filter((time) => now - time < windowMs);
  list.push(now);
  actionWindows.set(key, list);
  return list.length;
}

function clear(guildId, executorId, kind) {
  actionWindows.delete(`${guildId}-${executorId}-${kind}`);
}

/** A member is exempt if they are the owner, the bot, or explicitly whitelisted. */
function isExempt(guild, executorId, cfg) {
  if (!executorId) return true;
  if (executorId === guild.ownerId) return true;
  if (executorId === guild.client.user.id) return true;
  if ((cfg.nuke_whitelist || []).includes(executorId)) return true;
  return false;
}

/** Removes every role that carries a dangerous permission. */
async function stripDangerousRoles(member, reason) {
  const dangerous = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.ManageWebhooks
  ];

  const me = member.guild.members.me;
  const toRemove = member.roles.cache.filter((role) => {
    if (role.id === member.guild.id) return false;
    if (role.managed) return false;
    if (me && role.position >= me.roles.highest.position) return false;
    return dangerous.some((perm) => role.permissions.has(perm));
  });

  if (!toRemove.size) return [];
  const removed = await member.roles.remove(toRemove, reason).then(() => [...toRemove.values()]).catch(() => []);
  return removed;
}

/**
 * Core detector. Called from the destructive gateway events with the kind of
 * action that just happened. Looks up who did it in the audit log, counts
 * their recent actions, and neutralises them past the threshold.
 */
async function checkDestructiveAction(guild, kind, auditType, targetId) {
  let cfg;
  try {
    cfg = db.getAutomodConfig(guild.id);
  } catch (err) {
    return;
  }
  if (!cfg.nuke_enabled) return;

  const found = await findExecutor(guild, auditType, targetId, 10000);
  const executor = found?.executor;
  if (!executor || isExempt(guild, executor.id, cfg)) return;

  const windowMs = (Number(cfg.nuke_window_seconds) || 30) * 1000;
  const threshold = Number(cfg[THRESHOLD_KEYS[kind]]) || 3;
  const count = record(guild.id, executor.id, kind, windowMs);

  if (count < threshold) return;
  clear(guild.id, executor.id, kind);

  const member = await guild.members.fetch(executor.id).catch(() => null);
  let outcome = 'No action was possible (member not found or above the bot).';

  if (member) {
    if (cfg.nuke_action === 'ban' && member.bannable) {
      const banned = await member.ban({ reason: `Anti-nuke: ${count} ${KIND_LABELS[kind]} in ${cfg.nuke_window_seconds}s` })
        .then(() => true).catch(() => false);
      if (banned) {
        outcome = 'Member was **banned**.';
        db.addCase(guild.id, 'ban', executor.id, guild.client.user.id, `Anti-nuke: ${count} ${KIND_LABELS[kind]}`);
      }
    } else {
      const stripped = await stripDangerousRoles(member, `Anti-nuke: ${count} ${KIND_LABELS[kind]} in ${cfg.nuke_window_seconds}s`);
      outcome = stripped.length
        ? `Stripped **${stripped.length}** privileged role${stripped.length === 1 ? '' : 's'}: ${stripped.map((r) => `<@&${r.id}>`).join(', ')}`
        : 'Could not strip any roles - they all sit above my highest role.';
      if (stripped.length) {
        db.addCase(guild.id, 'antinuke', executor.id, guild.client.user.id, `Stripped roles after ${count} ${KIND_LABELS[kind]}`);
      }
    }
  }

  await withGuildColor(guild.id, () => sendLog(guild, 'moderation', createEmbed({
    title: 'Anti-Nuke Triggered',
    description: `<@${executor.id}> performed **${count} ${KIND_LABELS[kind]}** in ${cfg.nuke_window_seconds} seconds.`,
    thumbnail: executor.displayAvatarURL?.({ dynamic: true }),
    fields: [
      { name: 'Member', value: `**${executor.tag}**\n<@${executor.id}> \`${executor.id}\``, inline: true },
      { name: 'Threshold', value: `\`${threshold} in ${cfg.nuke_window_seconds}s\``, inline: true },
      { name: 'Response', value: outcome, inline: false }
    ]
  }))).catch(() => {});

  Logger.warn(`Anti-nuke triggered in ${guild.name}: ${executor.tag} did ${count} ${KIND_LABELS[kind]}.`);
}

const onChannelDelete = (channel) => {
  if (!channel.guild) return Promise.resolve();
  return checkDestructiveAction(channel.guild, 'channel_delete', AuditLogEvent.ChannelDelete, channel.id);
};

const onRoleDelete = (role) =>
  checkDestructiveAction(role.guild, 'role_delete', AuditLogEvent.RoleDelete, role.id);

const onBanAdd = (ban) =>
  checkDestructiveAction(ban.guild, 'ban', AuditLogEvent.MemberBanAdd, ban.user.id);

module.exports = {
  checkDestructiveAction,
  stripDangerousRoles,
  onChannelDelete,
  onRoleDelete,
  onBanAdd
};
