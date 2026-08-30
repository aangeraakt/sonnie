const db = require('../database/db');
const Logger = require('./logger');
const { createEmbed } = require('./embedBuilder');

// The original curve: level = floor(0.1 * sqrt(xp)) + 1
const xpForLevel = (level) => Math.pow((level - 1) / 0.1, 2);
const levelForXp = (xp) => Math.floor(0.1 * Math.sqrt(Math.max(0, xp))) + 1;

/** Progress inside the current level, for the rank card and /leveling levels. */
function levelProgress(xp) {
  const level = levelForXp(xp);
  const floorXp = xpForLevel(level);
  const ceilXp = xpForLevel(level + 1);
  return {
    level,
    currentXP: Math.max(0, Math.round(xp - floorXp)),
    neededXP: Math.max(1, Math.round(ceilXp - floorXp)),
    totalXP: xp
  };
}

/** Resolves the XP multiplier for a member from role and channel overrides. */
function resolveMultiplier(levelCfg, guildCfg, member, channelId) {
  let multiplier = Number(guildCfg.xp_rate) || 1;

  const roleMultipliers = levelCfg.role_multipliers || {};
  let bestRole = 0;
  if (member?.roles?.cache) {
    for (const roleId of member.roles.cache.keys()) {
      const value = Number(roleMultipliers[roleId]);
      if (Number.isFinite(value) && value > bestRole) bestRole = value;
    }
  }
  if (bestRole > 0) multiplier *= bestRole;

  const channelMultiplier = Number((levelCfg.channel_multipliers || {})[channelId]);
  if (Number.isFinite(channelMultiplier) && channelMultiplier > 0) multiplier *= channelMultiplier;

  return multiplier;
}

/** True when this member/channel combination is excluded from gaining XP. */
function isXpBlocked(levelCfg, member, channelId, parentId) {
  const noChannels = levelCfg.no_xp_channels || [];
  if (noChannels.includes(channelId)) return true;
  if (parentId && noChannels.includes(parentId)) return true;

  const noRoles = levelCfg.no_xp_roles || [];
  if (noRoles.length && member?.roles?.cache) {
    for (const roleId of noRoles) {
      if (member.roles.cache.has(roleId)) return true;
    }
  }
  return false;
}

/**
 * Grants every reward role the member has earned. With stacking off, older
 * reward roles are removed so only the highest earned role remains.
 */
async function applyRoleRewards(member, level, { announce = true } = {}) {
  if (!member || !member.guild) return { added: [], removed: [] };

  const rewards = db.getLevelRewards(member.guild.id);
  if (!rewards.length) return { added: [], removed: [] };

  const levelCfg = db.getLevelConfig(member.guild.id);
  const stack = levelCfg.stack_rewards !== 0;

  const me = member.guild.members.me;
  if (!me || !me.permissions.has('ManageRoles')) return { added: [], removed: [] };

  const earned = rewards.filter((reward) => level >= reward.level);
  if (!earned.length) return { added: [], removed: [] };

  const keep = stack ? earned : [earned[earned.length - 1]];
  const keepIds = new Set(keep.map((reward) => reward.role_id));

  const added = [];
  const removed = [];

  for (const reward of rewards) {
    const role = member.guild.roles.cache.get(reward.role_id);
    if (!role) continue;
    if (role.managed || role.position >= me.roles.highest.position) continue;

    const shouldHave = keepIds.has(reward.role_id);
    const hasRole = member.roles.cache.has(reward.role_id);

    if (shouldHave && !hasRole) {
      const ok = await member.roles.add(role, `Level reward for reaching level ${reward.level}`).then(() => true).catch(() => false);
      if (ok) added.push(role);
    } else if (!shouldHave && hasRole && !stack && level >= reward.level) {
      // Only strip lower reward roles that this member outgrew.
      const ok = await member.roles.remove(role, 'Superseded by a higher level reward').then(() => true).catch(() => false);
      if (ok) removed.push(role);
    }
  }

  if (announce && added.length) {
    Logger.info(`Granted ${added.length} level reward role(s) to ${member.user.tag} in ${member.guild.name}`);
  }
  return { added, removed };
}

function formatAnnouncement(template, { member, level, rewards }) {
  return String(template || '{user} just reached **Level {level}**!')
    .replace(/{user}/g, `<@${member.id}>`)
    .replace(/{username}/g, member.user.username)
    .replace(/{server}/g, member.guild.name)
    .replace(/{level}/g, String(level))
    .replace(/{rewards}/g, rewards.length ? rewards.map((role) => `<@&${role.id}>`).join(', ') : 'none');
}

/** Sends the level-up notice to the configured destination. */
async function announceLevelUp(member, level, rewards, fallbackChannel) {
  const levelCfg = db.getLevelConfig(member.guild.id);
  if (!levelCfg.announce_enabled) return;

  const description = formatAnnouncement(levelCfg.announce_message, { member, level, rewards });
  const embed = createEmbed({
    title: 'Level Up!',
    description: rewards.length
      ? `${description}\n\nUnlocked: ${rewards.map((role) => `<@&${role.id}>`).join(', ')}`
      : description,
    thumbnail: member.user.displayAvatarURL({ extension: 'png', size: 128 })
  });

  if (levelCfg.announce_dm) {
    const sent = await member.send({ embeds: [embed] }).then(() => true).catch(() => false);
    if (sent) return;
  }

  const target = levelCfg.announce_channel_id
    ? member.guild.channels.cache.get(levelCfg.announce_channel_id)
    : fallbackChannel;

  if (!target || typeof target.send !== 'function') return;
  await target.send({ embeds: [embed] }).catch(() => {});
}

/**
 * Single entry point for awarding XP. Handles exclusions, multipliers,
 * reward roles, and the level-up announcement.
 */
async function grantXp(member, baseAmount, { channel = null, source = 'message' } = {}) {
  if (!member || member.user.bot || !member.guild) return null;

  const guildCfg = db.getGuildConfig(member.guild.id);
  if (!guildCfg.xp_enabled) return null;

  const levelCfg = db.getLevelConfig(member.guild.id);
  const channelId = channel?.id || null;
  const parentId = channel?.parentId || null;

  if (isXpBlocked(levelCfg, member, channelId, parentId)) return null;

  const multiplier = resolveMultiplier(levelCfg, guildCfg, member, channelId);
  const amount = Math.max(1, Math.round(baseAmount * multiplier));

  const result = db.addXP(member.guild.id, member.id, amount);
  if (!result.leveledUp) return result;

  const { added } = await applyRoleRewards(member, result.level);
  await announceLevelUp(member, result.level, added, channel);

  Logger.info(`${member.user.tag} reached level ${result.level} in ${member.guild.name} (${source})`);
  return { ...result, rewards: added };
}

// ------------------------------------------------------------------
// Voice XP
// ------------------------------------------------------------------
const voiceSessions = new Map(); // `${guildId}-${userId}` -> joinedAt

function startVoiceSession(guildId, userId) {
  voiceSessions.set(`${guildId}-${userId}`, Date.now());
}

function endVoiceSession(guildId, userId) {
  const key = `${guildId}-${userId}`;
  const started = voiceSessions.get(key);
  voiceSessions.delete(key);
  return started || null;
}

/** True when the member should earn voice XP right now. */
function isEligibleVoiceState(state) {
  if (!state.channelId) return false;
  if (state.member?.user?.bot) return false;
  if (state.selfDeaf || state.deaf) return false;
  if (state.channel && state.channel.id === state.guild.afkChannelId) return false;
  // Alone in a channel is not "participating".
  const humans = state.channel?.members?.filter((m) => !m.user.bot).size || 0;
  return humans >= 2;
}

/**
 * Ticks once a minute over every connected member and awards voice XP.
 * Called from ready.js so it survives reconnects.
 */
function startVoiceXpLoop(client, intervalMs = 60 * 1000) {
  const timer = setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      let levelCfg;
      try {
        levelCfg = db.getLevelConfig(guild.id);
      } catch (err) {
        continue;
      }
      if (!levelCfg.voice_xp_enabled) continue;

      const perMinute = Number(levelCfg.voice_xp_per_minute) || 5;

      for (const state of guild.voiceStates.cache.values()) {
        if (!isEligibleVoiceState(state)) {
          endVoiceSession(guild.id, state.id);
          continue;
        }
        const member = state.member;
        if (!member) continue;
        if (!voiceSessions.has(`${guild.id}-${state.id}`)) {
          startVoiceSession(guild.id, state.id);
          continue;
        }
        await grantXp(member, perMinute, { channel: state.channel, source: 'voice' }).catch(() => {});
      }
    }
  }, intervalMs);

  if (typeof timer.unref === 'function') timer.unref();
  Logger.info('Voice XP loop started (1 minute interval).');
  return timer;
}

module.exports = {
  xpForLevel,
  levelForXp,
  levelProgress,
  grantXp,
  applyRoleRewards,
  announceLevelUp,
  startVoiceSession,
  endVoiceSession,
  startVoiceXpLoop,
  resolveMultiplier,
  isXpBlocked
};
