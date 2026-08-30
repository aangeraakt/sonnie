const Logger = require('./logger');

async function cacheGuildInvites(guild) {
  if (!guild.client.inviteCache) guild.client.inviteCache = new Map();
  const invites = await guild.invites.fetch().catch((err) => {
    Logger.warn(`Could not fetch invites for ${guild.name}: ${err.message}`);
    return null;
  });
  const map = new Map();
  if (invites) {
    for (const invite of invites.values()) {
      map.set(invite.code, invite.uses || 0);
    }
  }
  if (guild.vanityURLCode) {
    const vanity = await guild.fetchVanityData().catch(() => null);
    if (vanity) map.set(guild.vanityURLCode, vanity.uses || 0);
  }
  guild.client.inviteCache.set(guild.id, map);
  return map;
}

async function findUsedInvite(guild) {
  const cached = guild.client.inviteCache?.get(guild.id) || new Map();
  const invites = await guild.invites.fetch().catch(() => null);
  let used = null;
  if (invites) {
    for (const invite of invites.values()) {
      const before = cached.get(invite.code) || 0;
      if ((invite.uses || 0) > before) {
        used = invite;
        break;
      }
    }
  }
  if (!used && guild.vanityURLCode) {
    const vanity = await guild.fetchVanityData().catch(() => null);
    const before = cached.get(guild.vanityURLCode) || 0;
    if (vanity && (vanity.uses || 0) > before) {
      used = { code: guild.vanityURLCode, inviter: null, uses: vanity.uses, vanity: true };
    }
  }
  await cacheGuildInvites(guild);
  return used;
}

module.exports = {
  cacheGuildInvites,
  findUsedInvite
};
