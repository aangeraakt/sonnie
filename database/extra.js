const path = require('path');
const store = require('./jsonStore');
const Logger = require('../utils/logger');

/**
 * Feature collections layered on top of the core store in db.js.
 * Receives the live storage object so every collection shares the same
 * atomic-write + debounce + backup machinery.
 */
module.exports = function createExtraApi({ storage, files, saveKey, dbAPI }) {
  const DEFAULTS = {
    level_config: {},
    level_rewards: {},
    automod_config: {},
    log_config: {},
    command_toggles: {},
    pets: {},
    marriages: {},
    lottery: {},
    achievements: {},
    quests: {},
    clans: {},
    autoresponders: {},
    counters: {},
    playlists: {},
    music_favorites: {},
    role_shop: {},
    tempbans: []
  };

  // Register every new collection with the shared file map and load it.
  for (const [key, fallback] of Object.entries(DEFAULTS)) {
    files[key] = path.join(store.dataDir, `${key}.json`);
    const loaded = store.readJsonSafe(files[key], null);
    storage[key] = loaded === null ? fallback : loaded;
    if (loaded === null) store.writeJsonAtomic(files[key], storage[key]);
  }
  Logger.info(`Loaded ${Object.keys(DEFAULTS).length} extended data collections.`);

  const uid = (guildId, userId) => `${guildId}-${userId}`;
  const clone = (value) => JSON.parse(JSON.stringify(value));

  // ------------------------------------------------------------------
  // Leveling
  // ------------------------------------------------------------------
  const LEVEL_DEFAULTS = {
    announce_channel_id: null, // null = announce in the channel they spoke in
    announce_enabled: 1,
    announce_dm: 0,
    announce_message: '{user} just reached **Level {level}**!',
    no_xp_channels: [],
    no_xp_roles: [],
    role_multipliers: {},
    channel_multipliers: {},
    voice_xp_enabled: 0,
    voice_xp_per_minute: 5,
    stack_rewards: 1,
    card_enabled: 1
  };

  function getLevelConfig(guildId) {
    if (!storage.level_config[guildId]) {
      storage.level_config[guildId] = clone(LEVEL_DEFAULTS);
      saveKey('level_config');
    }
    const cfg = storage.level_config[guildId];
    for (const [key, value] of Object.entries(LEVEL_DEFAULTS)) {
      if (cfg[key] === undefined) cfg[key] = clone(value);
    }
    return cfg;
  }

  function setLevelConfig(guildId, key, value) {
    const cfg = getLevelConfig(guildId);
    cfg[key] = value;
    saveKey('level_config');
    return cfg;
  }

  function getLevelRewards(guildId) {
    return (storage.level_rewards[guildId] || []).slice().sort((a, b) => a.level - b.level);
  }

  function addLevelReward(guildId, level, roleId) {
    if (!storage.level_rewards[guildId]) storage.level_rewards[guildId] = [];
    const list = storage.level_rewards[guildId];
    const existing = list.find((reward) => reward.role_id === roleId);
    if (existing) existing.level = level;
    else list.push({ level, role_id: roleId });
    saveKey('level_rewards');
    return getLevelRewards(guildId);
  }

  function removeLevelReward(guildId, roleId) {
    const list = storage.level_rewards[guildId] || [];
    const index = list.findIndex((reward) => reward.role_id === roleId);
    if (index === -1) return false;
    list.splice(index, 1);
    saveKey('level_rewards');
    return true;
  }

  // ------------------------------------------------------------------
  // Auto-moderation
  // ------------------------------------------------------------------
  const AUTOMOD_DEFAULTS = {
    banned_words: [],
    banned_words_action: 'delete',
    mass_mention_limit: 0,
    caps_percent: 0,
    emoji_limit: 0,
    zalgo: 0,
    invite_filter: 0,
    scam_filter: 0,
    attachment_filter: 0,
    ignored_channels: [],
    ignored_roles: [],
    escalation_enabled: 0,
    escalation: [
      { warns: 3, action: 'timeout', duration: 3600 },
      { warns: 5, action: 'kick' },
      { warns: 7, action: 'ban' }
    ],
    raid_enabled: 0,
    raid_joins: 8,
    raid_seconds: 10,
    raid_action: 'lockdown',
    raid_account_age_days: 0,
    nuke_enabled: 0,
    nuke_channel_deletes: 3,
    nuke_role_deletes: 3,
    nuke_bans: 5,
    nuke_window_seconds: 30,
    nuke_action: 'strip',
    nuke_whitelist: []
  };

  function getAutomodConfig(guildId) {
    if (!storage.automod_config[guildId]) {
      storage.automod_config[guildId] = clone(AUTOMOD_DEFAULTS);
      saveKey('automod_config');
    }
    const cfg = storage.automod_config[guildId];
    for (const [key, value] of Object.entries(AUTOMOD_DEFAULTS)) {
      if (cfg[key] === undefined) cfg[key] = clone(value);
    }
    return cfg;
  }

  function setAutomodConfig(guildId, key, value) {
    const cfg = getAutomodConfig(guildId);
    cfg[key] = value;
    saveKey('automod_config');
    return cfg;
  }

  // ------------------------------------------------------------------
  // Audit logging routing
  // ------------------------------------------------------------------
  const LOG_CATEGORIES = ['message', 'member', 'server', 'voice', 'joinleave', 'moderation'];
  const LOG_DEFAULTS = {
    message: null,
    member: null,
    server: null,
    voice: null,
    joinleave: null,
    moderation: null,
    ignored_channels: [],
    ignored_users: []
  };

  function getLogConfig(guildId) {
    if (!storage.log_config[guildId]) {
      storage.log_config[guildId] = clone(LOG_DEFAULTS);
      saveKey('log_config');
    }
    const cfg = storage.log_config[guildId];
    for (const [key, value] of Object.entries(LOG_DEFAULTS)) {
      if (cfg[key] === undefined) cfg[key] = clone(value);
    }
    return cfg;
  }

  function setLogChannel(guildId, category, channelId) {
    const cfg = getLogConfig(guildId);
    cfg[category] = channelId;
    saveKey('log_config');
    return cfg;
  }

  function setLogIgnore(guildId, key, list) {
    const cfg = getLogConfig(guildId);
    cfg[key] = list;
    saveKey('log_config');
    return cfg;
  }

  // ------------------------------------------------------------------
  // Per-guild command toggles
  // ------------------------------------------------------------------
  function getCommandToggles(guildId) {
    if (!storage.command_toggles[guildId]) {
      storage.command_toggles[guildId] = { disabled: [], channels: {}, roles: {} };
      saveKey('command_toggles');
    }
    const cfg = storage.command_toggles[guildId];
    if (!Array.isArray(cfg.disabled)) cfg.disabled = [];
    if (!cfg.channels) cfg.channels = {};
    if (!cfg.roles) cfg.roles = {};
    return cfg;
  }

  function setCommandDisabled(guildId, commandName, disabled) {
    const cfg = getCommandToggles(guildId);
    const name = String(commandName).toLowerCase();
    const index = cfg.disabled.indexOf(name);
    if (disabled && index === -1) cfg.disabled.push(name);
    if (!disabled && index !== -1) cfg.disabled.splice(index, 1);
    saveKey('command_toggles');
    return cfg;
  }

  function setCommandChannelLock(guildId, commandName, channelIds) {
    const cfg = getCommandToggles(guildId);
    const name = String(commandName).toLowerCase();
    if (!channelIds || !channelIds.length) delete cfg.channels[name];
    else cfg.channels[name] = channelIds;
    saveKey('command_toggles');
    return cfg;
  }

  function setCommandRoleLock(guildId, commandName, roleIds) {
    const cfg = getCommandToggles(guildId);
    const name = String(commandName).toLowerCase();
    if (!roleIds || !roleIds.length) delete cfg.roles[name];
    else cfg.roles[name] = roleIds;
    saveKey('command_toggles');
    return cfg;
  }

  // ------------------------------------------------------------------
  // Pets
  // ------------------------------------------------------------------
  function getPet(guildId, userId) {
    return storage.pets[uid(guildId, userId)] || null;
  }

  function createPet(guildId, userId, data) {
    const pet = {
      guild_id: guildId,
      user_id: userId,
      hunger: 100,
      happiness: 100,
      level: 1,
      xp: 0,
      last_fed: 0,
      last_played: 0,
      last_hunt: 0,
      created_at: Date.now(),
      ...data
    };
    storage.pets[uid(guildId, userId)] = pet;
    saveKey('pets');
    return pet;
  }

  function updatePet(guildId, userId, changes) {
    const pet = storage.pets[uid(guildId, userId)];
    if (!pet) return null;
    Object.assign(pet, changes);
    saveKey('pets');
    return pet;
  }

  function releasePet(guildId, userId) {
    const key = uid(guildId, userId);
    if (!storage.pets[key]) return false;
    delete storage.pets[key];
    saveKey('pets');
    return true;
  }

  function getTopPets(guildId, limit = 10) {
    return Object.values(storage.pets)
      .filter((pet) => pet.guild_id === guildId)
      .sort((a, b) => b.level - a.level || b.xp - a.xp)
      .slice(0, limit);
  }

  // ------------------------------------------------------------------
  // Marriage
  // ------------------------------------------------------------------
  function getMarriage(guildId, userId) {
    return storage.marriages[uid(guildId, userId)] || null;
  }

  function setMarriage(guildId, userId, partnerId) {
    const since = Date.now();
    storage.marriages[uid(guildId, userId)] = { guild_id: guildId, user_id: userId, partner_id: partnerId, since };
    storage.marriages[uid(guildId, partnerId)] = { guild_id: guildId, user_id: partnerId, partner_id: userId, since };
    saveKey('marriages');
    return since;
  }

  function removeMarriage(guildId, userId) {
    const record = getMarriage(guildId, userId);
    if (!record) return false;
    delete storage.marriages[uid(guildId, userId)];
    delete storage.marriages[uid(guildId, record.partner_id)];
    saveKey('marriages');
    return true;
  }

  // ------------------------------------------------------------------
  // Lottery
  // ------------------------------------------------------------------
  function getLottery(guildId) {
    if (!storage.lottery[guildId]) {
      storage.lottery[guildId] = {
        guild_id: guildId,
        pot: 0,
        tickets: {},
        draw_at: 0,
        last_winner: null,
        last_pot: 0
      };
      saveKey('lottery');
    }
    const lottery = storage.lottery[guildId];
    if (!lottery.tickets) lottery.tickets = {};
    return lottery;
  }

  function addLotteryTickets(guildId, userId, count, cost) {
    const lottery = getLottery(guildId);
    lottery.tickets[userId] = (lottery.tickets[userId] || 0) + count;
    lottery.pot += cost;
    saveKey('lottery');
    return lottery;
  }

  function resetLottery(guildId, winnerId, pot, nextDrawAt) {
    const lottery = getLottery(guildId);
    lottery.last_winner = winnerId;
    lottery.last_pot = pot;
    lottery.pot = 0;
    lottery.tickets = {};
    lottery.draw_at = nextDrawAt;
    saveKey('lottery');
    return lottery;
  }

  function setLotteryDraw(guildId, drawAt) {
    const lottery = getLottery(guildId);
    lottery.draw_at = drawAt;
    saveKey('lottery');
    return lottery;
  }

  function getAllLotteries() {
    return Object.values(storage.lottery);
  }

  // ------------------------------------------------------------------
  // Achievements
  // ------------------------------------------------------------------
  function getAchievements(guildId, userId) {
    const key = uid(guildId, userId);
    if (!storage.achievements[key]) {
      storage.achievements[key] = { guild_id: guildId, user_id: userId, unlocked: {}, stats: {} };
      saveKey('achievements');
    }
    const record = storage.achievements[key];
    if (!record.unlocked) record.unlocked = {};
    if (!record.stats) record.stats = {};
    return record;
  }

  function unlockAchievement(guildId, userId, achievementId) {
    const record = getAchievements(guildId, userId);
    if (record.unlocked[achievementId]) return false;
    record.unlocked[achievementId] = Date.now();
    saveKey('achievements');
    return true;
  }

  function bumpAchievementStat(guildId, userId, stat, amount = 1) {
    const record = getAchievements(guildId, userId);
    record.stats[stat] = (record.stats[stat] || 0) + amount;
    saveKey('achievements');
    return record.stats[stat];
  }

  // ------------------------------------------------------------------
  // Quests
  // ------------------------------------------------------------------
  function getQuests(guildId, userId) {
    return storage.quests[uid(guildId, userId)] || null;
  }

  function setQuests(guildId, userId, data) {
    const key = uid(guildId, userId);
    storage.quests[key] = { guild_id: guildId, user_id: userId, ...data };
    saveKey('quests');
    return storage.quests[key];
  }

  function saveQuests() {
    saveKey('quests');
  }

  // ------------------------------------------------------------------
  // Clans
  // ------------------------------------------------------------------
  function getClans(guildId) {
    if (!storage.clans[guildId]) {
      storage.clans[guildId] = {};
      saveKey('clans');
    }
    return storage.clans[guildId];
  }

  function getClan(guildId, clanId) {
    return getClans(guildId)[clanId] || null;
  }

  function getClanByMember(guildId, userId) {
    for (const clan of Object.values(getClans(guildId))) {
      if (clan.members.includes(userId)) return clan;
    }
    return null;
  }

  function getClanByName(guildId, name) {
    const lowered = String(name).toLowerCase();
    return Object.values(getClans(guildId)).find((clan) => clan.name.toLowerCase() === lowered) || null;
  }

  function createClan(guildId, name, ownerId) {
    const clans = getClans(guildId);
    const id = `clan_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
    clans[id] = {
      id,
      guild_id: guildId,
      name,
      owner_id: ownerId,
      members: [ownerId],
      bank: 0,
      xp: 0,
      level: 1,
      motto: '',
      created_at: Date.now()
    };
    saveKey('clans');
    return clans[id];
  }

  function updateClan(guildId, clanId, changes) {
    const clan = getClan(guildId, clanId);
    if (!clan) return null;
    Object.assign(clan, changes);
    saveKey('clans');
    return clan;
  }

  function deleteClan(guildId, clanId) {
    const clans = getClans(guildId);
    if (!clans[clanId]) return false;
    delete clans[clanId];
    saveKey('clans');
    return true;
  }

  function getClanLeaderboard(guildId, limit = 10) {
    return Object.values(getClans(guildId))
      .sort((a, b) => b.level - a.level || b.xp - a.xp || b.bank - a.bank)
      .slice(0, limit);
  }

  // ------------------------------------------------------------------
  // Auto responders
  // ------------------------------------------------------------------
  function getAutoResponders(guildId) {
    return storage.autoresponders[guildId] || [];
  }

  function addAutoResponder(guildId, data) {
    if (!storage.autoresponders[guildId]) storage.autoresponders[guildId] = [];
    const id = `ar_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
    const entry = { id, ...data, created_at: Date.now() };
    storage.autoresponders[guildId].push(entry);
    saveKey('autoresponders');
    return entry;
  }

  function removeAutoResponder(guildId, idOrTrigger) {
    const list = storage.autoresponders[guildId] || [];
    const needle = String(idOrTrigger).toLowerCase();
    const index = list.findIndex((item) => item.id === idOrTrigger || item.trigger.toLowerCase() === needle);
    if (index === -1) return false;
    list.splice(index, 1);
    saveKey('autoresponders');
    return true;
  }

  // ------------------------------------------------------------------
  // Counter channels
  // ------------------------------------------------------------------
  function getCounters(guildId) {
    return storage.counters[guildId] || [];
  }

  function addCounter(guildId, channelId, type, template) {
    if (!storage.counters[guildId]) storage.counters[guildId] = [];
    const list = storage.counters[guildId];
    const existing = list.find((counter) => counter.channel_id === channelId);
    if (existing) {
      existing.type = type;
      existing.template = template;
    } else {
      list.push({ channel_id: channelId, type, template });
    }
    saveKey('counters');
    return list;
  }

  function removeCounter(guildId, channelId) {
    const list = storage.counters[guildId] || [];
    const index = list.findIndex((counter) => counter.channel_id === channelId);
    if (index === -1) return false;
    list.splice(index, 1);
    saveKey('counters');
    return true;
  }

  function getAllCounterGuilds() {
    return Object.keys(storage.counters);
  }

  // ------------------------------------------------------------------
  // Music playlists & favorites
  // ------------------------------------------------------------------
  function getPlaylists(guildId, userId) {
    const key = uid(guildId, userId);
    if (!storage.playlists[key]) {
      storage.playlists[key] = {};
      saveKey('playlists');
    }
    return storage.playlists[key];
  }

  function savePlaylist(guildId, userId, name, tracks) {
    const lists = getPlaylists(guildId, userId);
    lists[name.toLowerCase()] = { name, tracks, updated_at: Date.now() };
    saveKey('playlists');
    return lists[name.toLowerCase()];
  }

  function deletePlaylist(guildId, userId, name) {
    const lists = getPlaylists(guildId, userId);
    if (!lists[name.toLowerCase()]) return false;
    delete lists[name.toLowerCase()];
    saveKey('playlists');
    return true;
  }

  function getFavorites(guildId, userId) {
    const key = uid(guildId, userId);
    if (!storage.music_favorites[key]) {
      storage.music_favorites[key] = [];
      saveKey('music_favorites');
    }
    return storage.music_favorites[key];
  }

  function addFavorite(guildId, userId, track) {
    const list = getFavorites(guildId, userId);
    if (list.some((item) => item.url === track.url)) return false;
    list.push(track);
    saveKey('music_favorites');
    return true;
  }

  function removeFavorite(guildId, userId, index) {
    const list = getFavorites(guildId, userId);
    if (index < 0 || index >= list.length) return null;
    const [removed] = list.splice(index, 1);
    saveKey('music_favorites');
    return removed;
  }

  // ------------------------------------------------------------------
  // Temporary bans
  // ------------------------------------------------------------------
  function addTempBan(guildId, userId, until, moderatorId, reason) {
    if (!Array.isArray(storage.tempbans)) storage.tempbans = [];
    storage.tempbans = storage.tempbans.filter((ban) => !(ban.guild_id === guildId && ban.user_id === userId));
    storage.tempbans.push({ guild_id: guildId, user_id: userId, until, moderator_id: moderatorId, reason });
    saveKey('tempbans');
  }

  function takeDueTempBans(now = Date.now()) {
    if (!Array.isArray(storage.tempbans)) storage.tempbans = [];
    const due = storage.tempbans.filter((ban) => ban.until <= now);
    if (due.length) {
      storage.tempbans = storage.tempbans.filter((ban) => ban.until > now);
      saveKey('tempbans');
    }
    return due;
  }

  function removeTempBan(guildId, userId) {
    if (!Array.isArray(storage.tempbans)) return false;
    const before = storage.tempbans.length;
    storage.tempbans = storage.tempbans.filter((ban) => !(ban.guild_id === guildId && ban.user_id === userId));
    if (storage.tempbans.length !== before) {
      saveKey('tempbans');
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------
  // Role shop (server roles purchasable with coins)
  // ------------------------------------------------------------------
  function getRoleShop(guildId) {
    return (storage.role_shop[guildId] || []).slice().sort((a, b) => a.price - b.price);
  }

  function getRoleShopEntry(guildId, roleId) {
    return (storage.role_shop[guildId] || []).find((entry) => entry.role_id === roleId) || null;
  }

  function setRoleShopEntry(guildId, roleId, price, description = '') {
    if (!storage.role_shop[guildId]) storage.role_shop[guildId] = [];
    const list = storage.role_shop[guildId];
    const existing = list.find((entry) => entry.role_id === roleId);
    if (existing) {
      existing.price = price;
      existing.description = description;
    } else {
      list.push({ role_id: roleId, price, description });
    }
    saveKey('role_shop');
    return getRoleShop(guildId);
  }

  function removeRoleShopEntry(guildId, roleId) {
    const list = storage.role_shop[guildId] || [];
    const index = list.findIndex((entry) => entry.role_id === roleId);
    if (index === -1) return false;
    list.splice(index, 1);
    saveKey('role_shop');
    return true;
  }

  // ------------------------------------------------------------------
  // Individual warning removal
  // ------------------------------------------------------------------
  function removeWarning(guildId, userId, warningId) {
    if (!Array.isArray(storage.warnings)) return false;
    const index = storage.warnings.findIndex(
      (warning) => warning.id === warningId && warning.guild_id === guildId && warning.user_id === userId
    );
    if (index === -1) return false;
    storage.warnings.splice(index, 1);
    saveKey('warnings');
    return true;
  }

  // ------------------------------------------------------------------
  // Moderator statistics (derived from the case log)
  // ------------------------------------------------------------------
  function getModStats(guildId, moderatorId = null, sinceMs = 0) {
    const cases = (storage.cases || []).filter((item) => {
      if (item.guild_id !== guildId) return false;
      if (moderatorId && item.moderator_id !== moderatorId) return false;
      if (sinceMs && new Date(item.timestamp).getTime() < sinceMs) return false;
      return true;
    });

    const byType = {};
    const byModerator = {};
    for (const item of cases) {
      const type = String(item.type || 'unknown').toLowerCase();
      byType[type] = (byType[type] || 0) + 1;
      byModerator[item.moderator_id] = (byModerator[item.moderator_id] || 0) + 1;
    }
    return { total: cases.length, byType, byModerator, cases };
  }

  // ------------------------------------------------------------------
  // Economy extras stored on the user record
  // ------------------------------------------------------------------
  function getUserExtras(guildId, userId) {
    const user = dbAPI.getUser(guildId, userId);
    if (user.prestige === undefined) user.prestige = 0;
    if (user.daily_streak === undefined) user.daily_streak = 0;
    if (user.bio === undefined) user.bio = '';
    if (user.badges === undefined) user.badges = [];
    if (user.total_earned === undefined) user.total_earned = 0;
    return user;
  }

  function setUserField(guildId, userId, key, value) {
    const user = getUserExtras(guildId, userId);
    user[key] = value;
    saveKey('users');
    return user;
  }

  return {
    getLevelConfig,
    setLevelConfig,
    getLevelRewards,
    addLevelReward,
    removeLevelReward,
    getAutomodConfig,
    setAutomodConfig,
    LOG_CATEGORIES,
    getLogConfig,
    setLogChannel,
    setLogIgnore,
    getCommandToggles,
    setCommandDisabled,
    setCommandChannelLock,
    setCommandRoleLock,
    getPet,
    createPet,
    updatePet,
    releasePet,
    getTopPets,
    getMarriage,
    setMarriage,
    removeMarriage,
    getLottery,
    addLotteryTickets,
    resetLottery,
    setLotteryDraw,
    getAllLotteries,
    getAchievements,
    unlockAchievement,
    bumpAchievementStat,
    getQuests,
    setQuests,
    saveQuests,
    getClans,
    getClan,
    getClanByMember,
    getClanByName,
    createClan,
    updateClan,
    deleteClan,
    getClanLeaderboard,
    getAutoResponders,
    addAutoResponder,
    removeAutoResponder,
    getCounters,
    addCounter,
    removeCounter,
    getAllCounterGuilds,
    getPlaylists,
    savePlaylist,
    deletePlaylist,
    getFavorites,
    addFavorite,
    removeFavorite,
    addTempBan,
    takeDueTempBans,
    removeTempBan,
    removeWarning,
    getRoleShop,
    getRoleShopEntry,
    setRoleShopEntry,
    removeRoleShopEntry,
    getModStats,
    getUserExtras,
    setUserField
  };
};
