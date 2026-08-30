const crypto = require('crypto');

const UA = 'Sonnies-Discord-Bot/1.0';

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(12000),
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch (err) {}
  return { ok: res.ok, status: res.status, data };
}

function encodeHost(address) {
  return encodeURIComponent(String(address).trim()).replace(/%3A/gi, ':');
}

function cleanMotd(motd) {
  if (!motd) return 'No MOTD';
  const text = typeof motd === 'string' ? motd : motd.clean || motd.raw || '';
  return String(text).replace(/\s+/g, ' ').trim() || 'No MOTD';
}

async function mcStatus(address, bedrock) {
  const path = bedrock ? 'bedrock' : 'java';
  const { ok, status, data } = await jsonFetch(`https://api.mcstatus.io/v2/status/${path}/${encodeHost(address)}`);
  if (!ok || !data || typeof data !== 'object') {
    const err = new Error(status === 404 ? 'Server not found.' : 'Could not reach the Minecraft status API.');
    err.code = status;
    throw err;
  }
  return data;
}

async function mcPlayer(username) {
  const { ok, data } = await jsonFetch(`https://playerdb.co/api/player/minecraft/${encodeURIComponent(username)}`);
  const player = data?.data?.player;
  if (!ok || data?.code !== 'player.found' || !player) return null;
  return player;
}

async function rbxFetch(path, options = {}) {
  const direct = await jsonFetch(`https://${path}`, options);
  if (direct.ok) return direct;
  const proxied = path.replace(/^([a-z0-9-]+)\.roblox\.com/i, '$1.roproxy.com');
  if (proxied !== path) {
    const fallback = await jsonFetch(`https://${proxied}`, options);
    if (fallback.ok) return fallback;
  }
  return direct;
}

async function robloxUserByName(username) {
  const { ok, data } = await rbxFetch('users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
  });
  const entry = ok && Array.isArray(data?.data) ? data.data[0] : null;
  return entry || null;
}

async function robloxUser(id) {
  const { ok, data } = await rbxFetch(`users.roblox.com/v1/users/${id}`);
  return ok ? data : null;
}

async function robloxCounts(id) {
  const [friends, followers, followings] = await Promise.all([
    rbxFetch(`friends.roblox.com/v1/users/${id}/friends/count`),
    rbxFetch(`friends.roblox.com/v1/users/${id}/followers/count`),
    rbxFetch(`friends.roblox.com/v1/users/${id}/followings/count`)
  ]);
  return {
    friends: friends.data?.count ?? 0,
    followers: followers.data?.count ?? 0,
    followings: followings.data?.count ?? 0
  };
}

async function robloxPresence(id) {
  const { ok, data } = await rbxFetch('presence.roblox.com/v1/presence/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userIds: [id] })
  });
  return ok ? data?.userPresences?.[0] || null : null;
}

async function robloxAvatar(id) {
  const { ok, data } = await rbxFetch(`thumbnails.roblox.com/v1/users/avatar?userIds=${id}&size=420x420&format=Png&isCircular=false`);
  return ok ? data?.data?.[0]?.imageUrl || null : null;
}

async function robloxHeadshot(id) {
  const { ok, data } = await rbxFetch(`thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=150x150&format=Png&isCircular=false`);
  return ok ? data?.data?.[0]?.imageUrl || null : null;
}

async function robloxCollectibles(id) {
  const res = await rbxFetch(`inventory.roblox.com/v1/users/${id}/assets/collectibles?limit=25&sortOrder=Desc`);
  return res;
}

async function robloxWearing(id) {
  const { ok, data } = await rbxFetch(`avatar.roblox.com/v1/users/${id}/currently-wearing`);
  return ok && Array.isArray(data?.assetIds) ? data.assetIds : [];
}

async function robloxAssetName(assetId) {
  const { ok, data } = await rbxFetch(`economy.roblox.com/v2/assets/${assetId}/details`);
  return ok ? data?.Name || `Asset ${assetId}` : `Asset ${assetId}`;
}

async function robloxGroups(id) {
  const { ok, data } = await rbxFetch(`groups.roblox.com/v2/users/${id}/groups/roles`);
  return ok && Array.isArray(data?.data) ? data.data : [];
}

async function robloxGroup(id) {
  const { ok, data } = await rbxFetch(`groups.roblox.com/v1/groups/${id}`);
  return ok ? data : null;
}

async function robloxGroupSearch(keyword) {
  const { ok, data } = await rbxFetch(`groups.roblox.com/v1/groups/search?keyword=${encodeURIComponent(keyword)}&limit=10`);
  return ok && Array.isArray(data?.data) ? data.data : [];
}

async function robloxUniverseFromPlace(placeId) {
  const { ok, data } = await rbxFetch(`apis.roblox.com/universes/v1/places/${placeId}/universe`);
  return ok ? data?.universeId || null : null;
}

async function robloxGame(universeId) {
  const { ok, data } = await rbxFetch(`games.roblox.com/v1/games?universeIds=${universeId}`);
  return ok ? data?.data?.[0] || null : null;
}

async function robloxGameIcon(universeId) {
  const { ok, data } = await rbxFetch(`thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=512x512&format=Png&isCircular=false`);
  return ok ? data?.data?.[0]?.imageUrl || null : null;
}

async function robloxGameSearch(query) {
  const sessionId = crypto.randomUUID();
  const { ok, data } = await rbxFetch(`apis.roblox.com/search-api/omni-search?searchQuery=${encodeURIComponent(query)}&sessionId=${sessionId}&pageType=all`);
  if (!ok) return null;
  const group = (data?.searchResults || []).find((item) => item.contentGroupType === 'Game');
  return group?.contents?.[0] || null;
}

function presenceLabel(type) {
  if (type === 2) return 'In experience';
  if (type === 3) return 'In Studio';
  if (type === 1) return 'Online';
  return 'Offline';
}

function formatCount(n) {
  return Number(n || 0).toLocaleString('en-US');
}

module.exports = {
  jsonFetch,
  cleanMotd,
  mcStatus,
  mcPlayer,
  robloxUserByName,
  robloxUser,
  robloxCounts,
  robloxPresence,
  robloxAvatar,
  robloxHeadshot,
  robloxCollectibles,
  robloxWearing,
  robloxAssetName,
  robloxGroups,
  robloxGroup,
  robloxGroupSearch,
  robloxUniverseFromPlace,
  robloxGame,
  robloxGameIcon,
  robloxGameSearch,
  presenceLabel,
  formatCount
};
