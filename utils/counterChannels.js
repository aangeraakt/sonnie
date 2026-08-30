const db = require('../database/db');
const Logger = require('./logger');

const COUNTER_TYPES = {
  members: {
    label: 'All members',
    compute: (guild) => guild.memberCount
  },
  humans: {
    label: 'Humans only',
    compute: (guild) => guild.members.cache.filter((m) => !m.user.bot).size
  },
  bots: {
    label: 'Bots only',
    compute: (guild) => guild.members.cache.filter((m) => m.user.bot).size
  },
  online: {
    label: 'Online members',
    compute: (guild) => guild.members.cache.filter((m) => m.presence && m.presence.status !== 'offline').size
  },
  boosts: {
    label: 'Server boosts',
    compute: (guild) => guild.premiumSubscriptionCount || 0
  },
  roles: {
    label: 'Role count',
    compute: (guild) => guild.roles.cache.size - 1
  },
  channels: {
    label: 'Channel count',
    compute: (guild) => guild.channels.cache.size
  }
};

// Remember the last name we set so we skip no-op renames. Channel renames are
// rate limited to 2 per 10 minutes per channel, so this matters.
const lastNames = new Map();

function renderName(template, value) {
  return String(template || '{type}: {count}')
    .replace(/{count}/g, String(value))
    .slice(0, 100);
}

async function updateGuildCounters(guild) {
  let counters;
  try {
    counters = db.getCounters(guild.id);
  } catch (err) {
    return 0;
  }
  if (!counters.length) return 0;

  let updated = 0;
  for (const counter of counters) {
    const channel = guild.channels.cache.get(counter.channel_id);
    if (!channel) {
      db.removeCounter(guild.id, counter.channel_id);
      continue;
    }

    const type = COUNTER_TYPES[counter.type];
    if (!type) continue;

    const name = renderName(counter.template, type.compute(guild));
    if (channel.name === name) continue;
    if (lastNames.get(counter.channel_id) === name) continue;

    const ok = await channel.setName(name, 'Counter channel update').then(() => true).catch(() => false);
    if (ok) {
      lastNames.set(counter.channel_id, name);
      updated += 1;
    }
  }
  return updated;
}

/**
 * Refreshes counter channel names on a slow interval. Discord rate limits
 * channel renames hard (2 per 10 minutes), so 10 minutes is the floor.
 */
function startCounterLoop(client, intervalMs = 10 * 60 * 1000) {
  const tick = async () => {
    for (const guild of client.guilds.cache.values()) {
      await updateGuildCounters(guild).catch(() => {});
    }
  };

  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  // First pass shortly after startup once the member cache is warm.
  const initial = setTimeout(tick, 20000);
  if (typeof initial.unref === 'function') initial.unref();

  Logger.info('Counter channel loop started (10 minute interval).');
  return timer;
}

module.exports = { COUNTER_TYPES, updateGuildCounters, startCounterLoop, renderName };
