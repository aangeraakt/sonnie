const path = require('path');
const fs = require('fs');
const Logger = require('../utils/logger');
const store = require('./jsonStore');

store.cleanStaleTemp();

// New pure JSON data directory
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Old database directory for migration check
const oldDbDir = __dirname;
const oldJsonDbPath = path.join(oldDbDir, 'sonnies.db.json');
const oldDbPath = path.join(oldDbDir, 'sonnies.db');

const files = {
  guild_config: path.join(dataDir, 'guild_config.json'),
  users: path.join(dataDir, 'users.json'),
  warnings: path.join(dataDir, 'warnings.json'),
  tickets: path.join(dataDir, 'tickets.json'),
  giveaways: path.join(dataDir, 'giveaways.json'),
  counting: path.join(dataDir, 'counting.json'),
  counting_users: path.join(dataDir, 'counting_users.json'),
  minigames: path.join(dataDir, 'minigames.json'),
  radio: path.join(dataDir, 'radio.json'),
  music_queues: path.join(dataDir, 'music_queues.json'),
  cooldowns: path.join(dataDir, 'cooldowns.json'),
  inventory: path.join(dataDir, 'inventory.json'),
  ai_whitelist: path.join(dataDir, 'ai_whitelist.json'),
  ltc_wallets: path.join(dataDir, 'ltc_wallets.json'),
  usdt_wallets: path.join(dataDir, 'usdt_wallets.json'),
  youtube_channels: path.join(dataDir, 'youtube_channels.json'),
  role_panels: path.join(dataDir, 'role_panels.json'),
  temp_voice: path.join(dataDir, 'temp_voice.json'),
  suggestions: path.join(dataDir, 'suggestions.json'),
  polls: path.join(dataDir, 'polls.json'),
  tags: path.join(dataDir, 'tags.json'),
  reminders: path.join(dataDir, 'reminders.json'),
  invite_stats: path.join(dataDir, 'invite_stats.json'),
  invite_joins: path.join(dataDir, 'invite_joins.json'),
  starboard: path.join(dataDir, 'starboard.json'),
  sticky: path.join(dataDir, 'sticky.json'),
  afk: path.join(dataDir, 'afk.json'),
  cases: path.join(dataDir, 'cases.json'),
  xp_boosters: path.join(dataDir, 'xp_boosters.json')
};

// In-memory cache
let storage = {
  guild_config: {},
  users: {},
  warnings: [],
  tickets: {},
  giveaways: {},
  counting: {},
  counting_users: {},
  minigames: {},
  radio: {},
  music_queues: {},
  cooldowns: {},
  inventory: {},
  ai_whitelist: {},
  ltc_wallets: {},
  usdt_wallets: {},
  youtube_channels: {},
  role_panels: {},
  temp_voice: {},
  suggestions: {},
  polls: {},
  tags: {},
  reminders: [],
  invite_stats: {},
  invite_joins: {},
  starboard: {},
  sticky: {},
  afk: {},
  cases: [],
  xp_boosters: {}
};

// Helper: read a JSON file safely (falls back to the newest good backup)
function readJson(filePath, defaultValue) {
  if (fs.existsSync(filePath)) {
    return store.readJsonSafe(filePath, defaultValue);
  }
  return null;
}

// Helper: write a JSON file atomically (temp file + fsync + rename)
function writeJson(filePath, data) {
  store.writeJsonAtomic(filePath, data);
}

// Load / Migrate data
function loadDatabase() {
  let migrated = false;
  let oldData = null;

  if (fs.existsSync(oldJsonDbPath)) {
    try {
      oldData = JSON.parse(fs.readFileSync(oldJsonDbPath, 'utf8'));
    } catch (e) {}
  } else if (fs.existsSync(oldDbPath)) {
    try {
      oldData = JSON.parse(fs.readFileSync(oldDbPath, 'utf8'));
    } catch (e) {}
  }

  for (const key of Object.keys(files)) {
    const loaded = readJson(files[key], null);
    if (loaded !== null) {
      storage[key] = loaded;
    } else if (oldData && oldData[key] !== undefined) {
      storage[key] = oldData[key];
      writeJson(files[key], storage[key]);
      migrated = true;
    } else {
      writeJson(files[key], storage[key]);
    }
  }

  if (migrated) {
    Logger.success('Migrated database successfully to data/ JSON folder!');
  } else {
    Logger.success('Loaded data storage from data/ directory JSON files.');
  }
}

// Writes are debounced per collection so hot paths (XP on every message,
// economy on every spin) coalesce into a single atomic write.
const writer = store.createDebouncedWriter(Number(process.env.SAVE_FLUSH_MS || 400));

function saveKey(key) {
  if (files[key]) {
    writer.schedule(key, files[key], () => storage[key]);
  }
}

function flushAll() {
  writer.flushAll();
}

loadDatabase();

// Never lose buffered writes on shutdown.
let flushedOnExit = false;
function flushOnExit() {
  if (flushedOnExit) return;
  flushedOnExit = true;
  flushAll();
}
process.on('exit', flushOnExit);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGQUIT']) {
  process.on(signal, () => {
    flushOnExit();
    process.exit(0);
  });
}

const dbAPI = {
  // --- Guild Config ---
  getGuildConfig(guildId) {
    if (!storage.guild_config[guildId]) {
      storage.guild_config[guildId] = {
        guild_id: guildId,
        prefix: process.env.DEFAULT_PREFIX || '!',
        welcome_channel_id: null,
        welcome_message: 'Welcome {user} to {server}!',
        leave_channel_id: null,
        leave_message: '{user} has left {server}.',
        mod_log_channel_id: null,
        auto_role_id: null,
        ticket_category_id: null,
        ticket_log_channel_id: null,
        command_channel_id: null,
        xp_enabled: 1,
        xp_rate: 1,
        anti_link: 0,
        anti_spam: 0,
        staff_role_id: null,
        embed_color: null
      };
      saveKey('guild_config');
    }
    if (!storage.guild_config[guildId].prefix) {
      storage.guild_config[guildId].prefix = process.env.DEFAULT_PREFIX || '!';
    }
    if (storage.guild_config[guildId].command_channel_id === undefined) storage.guild_config[guildId].command_channel_id = null;
    if (storage.guild_config[guildId].anti_link === undefined) storage.guild_config[guildId].anti_link = 0;
    if (storage.guild_config[guildId].anti_spam === undefined) storage.guild_config[guildId].anti_spam = 0;
    if (storage.guild_config[guildId].staff_role_id === undefined) storage.guild_config[guildId].staff_role_id = null;
    if (storage.guild_config[guildId].temp_vc_hub_id === undefined) storage.guild_config[guildId].temp_vc_hub_id = null;
    if (storage.guild_config[guildId].temp_vc_category_id === undefined) storage.guild_config[guildId].temp_vc_category_id = null;
    if (storage.guild_config[guildId].suggestions_channel_id === undefined) storage.guild_config[guildId].suggestions_channel_id = null;
    if (storage.guild_config[guildId].starboard_channel_id === undefined) storage.guild_config[guildId].starboard_channel_id = null;
    if (storage.guild_config[guildId].starboard_emoji === undefined) storage.guild_config[guildId].starboard_emoji = '⭐';
    if (storage.guild_config[guildId].starboard_count === undefined) storage.guild_config[guildId].starboard_count = 3;
    if (storage.guild_config[guildId].embed_color === undefined) storage.guild_config[guildId].embed_color = null;
    return storage.guild_config[guildId];
  },

  updateGuildConfig(guildId, key, value) {
    const cfg = this.getGuildConfig(guildId);
    cfg[key] = value;
    saveKey('guild_config');
    return cfg;
  },

  resetGuildConfig(guildId) {
    delete storage.guild_config[guildId];
    saveKey('guild_config');
    return this.getGuildConfig(guildId);
  },

  // --- User Profile (Economy & XP) ---
  getUser(guildId, userId) {
    const key = `${guildId}-${userId}`;
    if (!storage.users[key]) {
      storage.users[key] = {
        guild_id: guildId,
        user_id: userId,
        balance: 100,
        bank: 0,
        xp: 0,
        level: 1,
        last_daily: null,
        last_hourly: null,
        last_weekly: null,
        last_monthly: null,
        last_work: null,
        rob_protect_until: 0
      };
      saveKey('users');
    }
    if (storage.users[key].bank === undefined) storage.users[key].bank = 0;
    if (storage.users[key].last_hourly === undefined) storage.users[key].last_hourly = null;
    if (storage.users[key].last_weekly === undefined) storage.users[key].last_weekly = null;
    if (storage.users[key].last_monthly === undefined) storage.users[key].last_monthly = null;
    if (storage.users[key].rob_protect_until === undefined) storage.users[key].rob_protect_until = 0;
    return storage.users[key];
  },

  addBalance(guildId, userId, amount) {
    const user = this.getUser(guildId, userId);
    user.balance += amount;
    saveKey('users');
    return user;
  },

  deposit(guildId, userId, amount) {
    const user = this.getUser(guildId, userId);
    if (user.balance < amount) return { success: false, reason: 'insufficient_funds' };
    user.balance -= amount;
    user.bank = (user.bank || 0) + amount;
    saveKey('users');
    return { success: true, balance: user.balance, bank: user.bank };
  },

  withdraw(guildId, userId, amount) {
    const user = this.getUser(guildId, userId);
    const bank = user.bank || 0;
    if (bank < amount) return { success: false, reason: 'insufficient_funds' };
    user.bank = bank - amount;
    user.balance += amount;
    saveKey('users');
    return { success: true, balance: user.balance, bank: user.bank };
  },

  setLastDaily(guildId, userId, timestampStr) {
    const user = this.getUser(guildId, userId);
    user.last_daily = timestampStr;
    saveKey('users');
  },

  setLastHourly(guildId, userId, timestampStr) {
    const user = this.getUser(guildId, userId);
    user.last_hourly = timestampStr;
    saveKey('users');
  },

  setLastWeekly(guildId, userId, timestampStr) {
    const user = this.getUser(guildId, userId);
    user.last_weekly = timestampStr;
    saveKey('users');
  },

  setLastMonthly(guildId, userId, timestampStr) {
    const user = this.getUser(guildId, userId);
    user.last_monthly = timestampStr;
    saveKey('users');
  },

  setRobProtectUntil(guildId, userId, timestampMs) {
    const user = this.getUser(guildId, userId);
    user.rob_protect_until = Number(timestampMs) || 0;
    saveKey('users');
  },

  setLastWork(guildId, userId, timestampStr) {
    const user = this.getUser(guildId, userId);
    user.last_work = timestampStr;
    saveKey('users');
  },

  setCooldown(guildId, userId, command, timestampMs) {
    const key = `${guildId}-${userId}-${command}`;
    storage.cooldowns[key] = timestampMs;
    saveKey('cooldowns');
  },

  getCooldown(guildId, userId, command) {
    const key = `${guildId}-${userId}-${command}`;
    return storage.cooldowns[key] || 0;
  },

  addXP(guildId, userId, amount) {
    const user = this.getUser(guildId, userId);
    const newXP = user.xp + amount;
    const newLevel = Math.floor(0.1 * Math.sqrt(newXP)) + 1;
    const leveledUp = newLevel > user.level;

    user.xp = newXP;
    const oldLevel = user.level;
    user.level = newLevel;

    saveKey('users');
    return { xp: newXP, level: newLevel, leveledUp, oldLevel };
  },

  setXP(guildId, userId, amount) {
    const user = this.getUser(guildId, userId);
    const newXP = Math.max(0, Math.floor(Number(amount) || 0));
    const newLevel = Math.floor(0.1 * Math.sqrt(newXP)) + 1;
    const oldXP = user.xp;
    const oldLevel = user.level;

    user.xp = newXP;
    user.level = newLevel;
    saveKey('users');
    return { xp: newXP, level: newLevel, oldXP, oldLevel, leveledUp: newLevel > oldLevel };
  },

  getTopEconomy(guildId, limit = 10) {
    return Object.values(storage.users)
      .filter(u => u.guild_id === guildId)
      .map(u => ({ user_id: u.user_id, balance: u.balance, bank: u.bank || 0, total: u.balance + (u.bank || 0) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  },

  getTopXP(guildId, limit = 10) {
    return Object.values(storage.users)
      .filter(u => u.guild_id === guildId)
      .map(u => ({ user_id: u.user_id, xp: u.xp, level: u.level }))
      .sort((a, b) => b.xp - a.xp)
      .slice(0, limit);
  },

  // --- Moderation Warnings ---
  addCase(guildId, type, userId, moderatorId, reason, extra = null) {
    if (!Array.isArray(storage.cases)) storage.cases = [];
    const id = storage.cases.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
    const caseObj = {
      id,
      guild_id: guildId,
      type,
      user_id: userId,
      moderator_id: moderatorId,
      reason: reason || 'No reason provided',
      extra,
      timestamp: new Date().toISOString()
    };
    storage.cases.push(caseObj);
    saveKey('cases');
    return caseObj;
  },

  getCase(guildId, caseId) {
    if (!Array.isArray(storage.cases)) storage.cases = [];
    return storage.cases.find((item) => item.guild_id === guildId && Number(item.id) === Number(caseId)) || null;
  },

  getCasesForUser(guildId, userId) {
    if (!Array.isArray(storage.cases)) storage.cases = [];
    return storage.cases.filter((item) => item.guild_id === guildId && item.user_id === userId);
  },

  addWarning(guildId, userId, moderatorId, reason) {
    const caseObj = this.addCase(guildId, 'warn', userId, moderatorId, reason);
    const warningObj = {
      id: storage.warnings.length + 1,
      case_id: caseObj.id,
      guild_id: guildId,
      user_id: userId,
      moderator_id: moderatorId,
      reason,
      timestamp: new Date().toISOString()
    };
    storage.warnings.push(warningObj);
    saveKey('warnings');
    return warningObj;
  },

  getWarnings(guildId, userId) {
    return storage.warnings.filter(w => w.guild_id === guildId && w.user_id === userId);
  },

  clearWarnings(guildId, userId) {
    storage.warnings = storage.warnings.filter(w => !(w.guild_id === guildId && w.user_id === userId));
    saveKey('warnings');
  },

  // --- Ticket Management ---
  createTicket(ticketId, guildId, channelId, userId, extra = {}) {
    const ticketObj = {
      ticket_id: ticketId,
      guild_id: guildId,
      channel_id: channelId,
      user_id: userId,
      type: extra.type || 'support',
      subject: extra.subject || null,
      details: extra.details || null,
      status: 'OPEN',
      claimed_by: null,
      claimed_by_tag: null,
      added_users: [],
      created_at: new Date().toISOString()
    };
    storage.tickets[channelId] = ticketObj;
    saveKey('tickets');
    return ticketObj;
  },

  getTicketByChannel(channelId) {
    const t = storage.tickets[channelId];
    if (t && t.status === 'OPEN') return t;
    return null;
  },

  claimTicket(channelId, staffId, staffTag) {
    const t = storage.tickets[channelId];
    if (t) {
      t.claimed_by = staffId;
      t.claimed_by_tag = staffTag;
      saveKey('tickets');
    }
    return t;
  },

  addTicketUser(channelId, userId) {
    const t = storage.tickets[channelId];
    if (t) {
      if (!t.added_users) t.added_users = [];
      if (!t.added_users.includes(userId)) {
        t.added_users.push(userId);
        saveKey('tickets');
      }
    }
    return t;
  },

  removeTicketUser(channelId, userId) {
    const t = storage.tickets[channelId];
    if (t && t.added_users) {
      t.added_users = t.added_users.filter(id => id !== userId);
      saveKey('tickets');
    }
    return t;
  },

  closeTicket(ticketId) {
    for (const chanId of Object.keys(storage.tickets)) {
      if (storage.tickets[chanId].ticket_id === ticketId || storage.tickets[chanId].channel_id === ticketId) {
        storage.tickets[chanId].status = 'CLOSED';
        storage.tickets[chanId].closed_at = new Date().toISOString();
      }
    }
    saveKey('tickets');
  },

  // --- Giveaways ---
  createGiveaway(messageId, channelId, guildId, prize, winnersCount, endTime, hostedBy) {
    const gwObj = { message_id: messageId, channel_id: channelId, guild_id: guildId, prize, winners_count: winnersCount, end_time: endTime, hosted_by: hostedBy, ended: 0, entries: [] };
    storage.giveaways[messageId] = gwObj;
    saveKey('giveaways');
    return gwObj;
  },

  getActiveGiveaways() {
    return Object.values(storage.giveaways).filter(g => g.ended === 0);
  },

  getGiveaway(messageId) {
    return storage.giveaways[messageId] || null;
  },

  toggleGiveawayEntry(messageId, userId) {
    const gw = storage.giveaways[messageId];
    if (!gw) return null;
    if (!gw.entries) gw.entries = [];

    const index = gw.entries.indexOf(userId);
    let entered = false;
    if (index === -1) {
      gw.entries.push(userId);
      entered = true;
    } else {
      gw.entries.splice(index, 1);
      entered = false;
    }
    saveKey('giveaways');
    return { entered, totalEntries: gw.entries.length };
  },

  endGiveaway(messageId) {
    if (storage.giveaways[messageId]) {
      storage.giveaways[messageId].ended = 1;
      saveKey('giveaways');
    }
  },

  // --- Counting Minigame ---
  getCounting(guildId) {
    if (!storage.counting) storage.counting = {};
    if (!storage.counting[guildId]) {
      storage.counting[guildId] = {
        guild_id: guildId,
        channel_id: null,
        current_count: 0,
        last_user_id: null,
        last_message_id: null,
        highest_count: 0,
        allow_double_counting: false,
        recent_messages: {}
      };
      saveKey('counting');
    }
    return storage.counting[guildId];
  },

  getCountingByChannel(channelId) {
    if (!storage.counting) return null;
    return Object.values(storage.counting).find(c => c.channel_id === channelId) || null;
  },

  setCountingConfig(guildId, configData) {
    const counting = this.getCounting(guildId);
    if (configData.channel_id !== undefined) counting.channel_id = configData.channel_id;
    if (configData.allow_double_counting !== undefined) counting.allow_double_counting = configData.allow_double_counting;
    if (configData.start_number !== undefined) {
      counting.current_count = configData.start_number;
      if (counting.current_count > counting.highest_count) {
        counting.highest_count = counting.current_count;
      }
      counting.last_user_id = null;
      counting.last_message_id = null;
    }
    if (configData.current_count !== undefined) {
      counting.current_count = configData.current_count;
      if (counting.current_count > counting.highest_count) {
        counting.highest_count = counting.current_count;
      }
    }
    saveKey('counting');
    return counting;
  },

  updateCountingNumber(guildId, newCount, userId, messageId) {
    const counting = this.getCounting(guildId);
    counting.current_count = newCount;
    counting.last_user_id = userId;
    counting.last_message_id = messageId;
    if (newCount > counting.highest_count) {
      counting.highest_count = newCount;
    }

    if (!counting.recent_messages) counting.recent_messages = {};
    counting.recent_messages[messageId] = {
      number: newCount,
      userId,
      timestamp: Date.now()
    };

    const keys = Object.keys(counting.recent_messages);
    if (keys.length > 100) {
      const toRemove = keys.slice(0, keys.length - 100);
      for (const k of toRemove) {
        delete counting.recent_messages[k];
      }
    }

    if (!storage.counting_users) storage.counting_users = {};
    if (!storage.counting_users[guildId]) storage.counting_users[guildId] = {};
    storage.counting_users[guildId][userId] = (storage.counting_users[guildId][userId] || 0) + 1;

    saveKey('counting');
    saveKey('counting_users');
    return counting;
  },

  setCountingNumber(guildId, newCount) {
    const counting = this.getCounting(guildId);
    counting.current_count = newCount;
    if (newCount > counting.highest_count) {
      counting.highest_count = newCount;
    }
    counting.last_user_id = null;
    counting.last_message_id = null;
    saveKey('counting');
    return counting;
  },

  getCountedMessage(guildId, messageId) {
    const counting = storage.counting?.[guildId];
    if (!counting || !counting.recent_messages) return null;
    return counting.recent_messages[messageId] || null;
  },

  getTopCounters(guildId, limit = 10) {
    if (!storage.counting_users || !storage.counting_users[guildId]) return [];
    return Object.entries(storage.counting_users[guildId])
      .map(([userId, count]) => ({ user_id: userId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  },

  disableCounting(guildId) {
    const counting = this.getCounting(guildId);
    counting.channel_id = null;
    saveKey('counting');
    return counting;
  },

  resetCountingStats(guildId) {
    if (storage.counting_users && storage.counting_users[guildId]) {
      delete storage.counting_users[guildId];
      saveKey('counting_users');
    }
    if (storage.counting && storage.counting[guildId]) {
      delete storage.counting[guildId];
      saveKey('counting');
    }
  },

  // --- 24/7 Radio Stations ---
  getRadioConfig(guildId) {
    return storage.radio[guildId] || null;
  },

  setRadioConfig(guildId, configData) {
    storage.radio[guildId] = {
      guild_id: guildId,
      channel_id: configData.channel_id,
      stream_url: configData.stream_url,
      station_name: configData.station_name || '24/7 Radio Stream',
      active: configData.active !== undefined ? configData.active : true,
      updated_at: new Date().toISOString()
    };
    saveKey('radio');
    return storage.radio[guildId];
  },

  disableRadio(guildId) {
    if (storage.radio[guildId]) {
      storage.radio[guildId].active = false;
      saveKey('radio');
    }
    return storage.radio[guildId];
  },

  getAllActiveRadios() {
    return Object.values(storage.radio).filter(r => r.active && r.channel_id && r.stream_url);
  },

  saveMusicQueue(guildId, state) {
    if (!storage.music_queues) storage.music_queues = {};
    storage.music_queues[guildId] = state;
    saveKey('music_queues');
    return storage.music_queues[guildId];
  },

  getAllMusicQueues() {
    return storage.music_queues || {};
  },

  clearMusicQueue(guildId) {
    if (!storage.music_queues || !storage.music_queues[guildId]) return;
    delete storage.music_queues[guildId];
    saveKey('music_queues');
  },

  // --- Economy Inventory ---
  getInventory(guildId, userId) {
    const key = `${guildId}-${userId}`;
    if (!storage.inventory[key]) {
      storage.inventory[key] = {};
    }
    return storage.inventory[key];
  },

  addItem(guildId, userId, itemId, amount = 1) {
    const key = `${guildId}-${userId}`;
    if (!storage.inventory[key]) {
      storage.inventory[key] = {};
    }
    const current = storage.inventory[key][itemId] || 0;
    storage.inventory[key][itemId] = current + amount;
    saveKey('inventory');
    return storage.inventory[key];
  },

  removeItem(guildId, userId, itemId, amount = 1) {
    const key = `${guildId}-${userId}`;
    if (!storage.inventory[key] || !storage.inventory[key][itemId]) {
      return false;
    }
    const current = storage.inventory[key][itemId];
    if (current < amount) {
      return false;
    }
    if (current === amount) {
      delete storage.inventory[key][itemId];
    } else {
      storage.inventory[key][itemId] = current - amount;
    }
    saveKey('inventory');
    return true;
  },

  getItemCount(guildId, userId, itemId) {
    const inv = this.getInventory(guildId, userId);
    return inv[itemId] || 0;
  },

  getAiWhitelist(guildId) {
    if (!storage.ai_whitelist[guildId]) {
      storage.ai_whitelist[guildId] = [];
    }
    return storage.ai_whitelist[guildId];
  },

  addAiWhitelist(guildId, userId) {
    const list = this.getAiWhitelist(guildId);
    if (!list.includes(userId)) {
      list.push(userId);
      saveKey('ai_whitelist');
      return true;
    }
    return false;
  },

  removeAiWhitelist(guildId, userId) {
    const list = this.getAiWhitelist(guildId);
    const index = list.indexOf(userId);
    if (index !== -1) {
      list.splice(index, 1);
      saveKey('ai_whitelist');
      return true;
    }
    return false;
  },

  isAiWhitelisted(guildId, userId) {
    const list = this.getAiWhitelist(guildId);
    return list.includes(userId);
  },

  _ensureMinigames(guildId) {
    if (!storage.minigames) storage.minigames = {};
    if (!storage.minigames[guildId]) {
      storage.minigames[guildId] = {};
    }
    const games = storage.minigames[guildId];
    if (!games.flag) games.flag = { channel_id: null, code: null };
    if (!games.number) games.number = { channel_id: null, number: null };
    if (!games.snake) games.snake = { channel_id: null, lastWord: null, lastUserId: null, used: [] };
    return games;
  },

  getMinigames(guildId) {
    return this._ensureMinigames(guildId);
  },

  getMinigameByChannel(channelId) {
    if (!storage.minigames || !channelId) return null;
    for (const [guildId, games] of Object.entries(storage.minigames)) {
      if (games.flag?.channel_id === channelId) return { guildId, type: 'flag', ...games.flag };
      if (games.number?.channel_id === channelId) return { guildId, type: 'number', ...games.number };
      if (games.snake?.channel_id === channelId) return { guildId, type: 'snake', ...games.snake };
    }
    return null;
  },

  setMinigameChannel(guildId, type, channelId, state = {}) {
    if (!storage.minigames) storage.minigames = {};
    for (const [gid, games] of Object.entries(storage.minigames)) {
      for (const gameType of ['flag', 'number', 'snake']) {
        if (games[gameType]?.channel_id === channelId && !(gid === guildId && gameType === type)) {
          games[gameType].channel_id = null;
        }
      }
    }
    const games = this._ensureMinigames(guildId);
    games[type] = { ...(games[type] || {}), channel_id: channelId, ...state };
    saveKey('minigames');
    return games[type];
  },

  updateMinigameState(guildId, type, state) {
    const games = this._ensureMinigames(guildId);
    games[type] = { ...(games[type] || {}), ...state };
    saveKey('minigames');
    return games[type];
  },

  disableMinigame(guildId, type) {
    const games = this._ensureMinigames(guildId);
    if (games[type]) games[type].channel_id = null;
    saveKey('minigames');
    return games[type];
  },

  getLtcWallets(userId) {
    if (!storage.ltc_wallets) storage.ltc_wallets = {};
    if (!Array.isArray(storage.ltc_wallets[userId])) storage.ltc_wallets[userId] = [];
    return storage.ltc_wallets[userId];
  },

  addLtcWallet(userId, wallet) {
    const wallets = this.getLtcWallets(userId);
    wallets.push(wallet);
    saveKey('ltc_wallets');
    return wallet;
  },

  findLtcWallet(userId, nameOrId) {
    const wallets = this.getLtcWallets(userId);
    if (!wallets.length) return null;
    if (!nameOrId) return wallets[0];
    const query = String(nameOrId).toLowerCase();
    return wallets.find((wallet) => wallet.id === nameOrId || wallet.name.toLowerCase() === query) || null;
  },

  removeLtcWallet(userId, walletId) {
    if (!storage.ltc_wallets) storage.ltc_wallets = {};
    storage.ltc_wallets[userId] = this.getLtcWallets(userId).filter((wallet) => wallet.id !== walletId);
    saveKey('ltc_wallets');
    return storage.ltc_wallets[userId];
  },

  getUsdtWallets(userId) {
    if (!storage.usdt_wallets) storage.usdt_wallets = {};
    if (!Array.isArray(storage.usdt_wallets[userId])) storage.usdt_wallets[userId] = [];
    return storage.usdt_wallets[userId];
  },

  addUsdtWallet(userId, wallet) {
    const wallets = this.getUsdtWallets(userId);
    wallets.push(wallet);
    saveKey('usdt_wallets');
    return wallet;
  },

  findUsdtWallet(userId, nameOrId) {
    const wallets = this.getUsdtWallets(userId);
    if (!wallets.length) return null;
    if (!nameOrId) return wallets[0];
    const query = String(nameOrId).toLowerCase();
    return wallets.find((wallet) => wallet.id === nameOrId || wallet.name.toLowerCase() === query) || null;
  },

  removeUsdtWallet(userId, walletId) {
    if (!storage.usdt_wallets) storage.usdt_wallets = {};
    storage.usdt_wallets[userId] = this.getUsdtWallets(userId).filter((wallet) => wallet.id !== walletId);
    saveKey('usdt_wallets');
    return storage.usdt_wallets[userId];
  },

  getRolePanel(guildId) {
    if (!storage.role_panels) storage.role_panels = {};
    if (!storage.role_panels[guildId]) storage.role_panels[guildId] = { roles: [], message_id: null, channel_id: null };
    if (!Array.isArray(storage.role_panels[guildId].roles)) storage.role_panels[guildId].roles = [];
    return storage.role_panels[guildId];
  },

  saveRolePanel(guildId, data) {
    if (!storage.role_panels) storage.role_panels = {};
    storage.role_panels[guildId] = { ...this.getRolePanel(guildId), ...data };
    saveKey('role_panels');
    return storage.role_panels[guildId];
  },

  addTempVoice(channelId, guildId, ownerId) {
    if (!storage.temp_voice) storage.temp_voice = {};
    storage.temp_voice[channelId] = { channel_id: channelId, guild_id: guildId, owner_id: ownerId, created_at: Date.now() };
    saveKey('temp_voice');
    return storage.temp_voice[channelId];
  },

  getTempVoice(channelId) {
    if (!storage.temp_voice) storage.temp_voice = {};
    return storage.temp_voice[channelId] || null;
  },

  getTempVoiceByOwner(guildId, ownerId) {
    if (!storage.temp_voice) storage.temp_voice = {};
    return Object.values(storage.temp_voice).find((item) => item.guild_id === guildId && item.owner_id === ownerId) || null;
  },

  removeTempVoice(channelId) {
    if (!storage.temp_voice) storage.temp_voice = {};
    delete storage.temp_voice[channelId];
    saveKey('temp_voice');
  },

  addSuggestion(data) {
    if (!storage.suggestions) storage.suggestions = {};
    storage.suggestions[data.message_id] = data;
    saveKey('suggestions');
    return data;
  },

  getSuggestion(messageId) {
    if (!storage.suggestions) storage.suggestions = {};
    return storage.suggestions[messageId] || null;
  },

  saveSuggestion(messageId, data) {
    if (!storage.suggestions) storage.suggestions = {};
    storage.suggestions[messageId] = { ...(storage.suggestions[messageId] || {}), ...data };
    saveKey('suggestions');
    return storage.suggestions[messageId];
  },

  addPoll(data) {
    if (!storage.polls) storage.polls = {};
    storage.polls[data.message_id] = data;
    saveKey('polls');
    return data;
  },

  getPoll(messageId) {
    if (!storage.polls) storage.polls = {};
    return storage.polls[messageId] || null;
  },

  savePoll(messageId, data) {
    if (!storage.polls) storage.polls = {};
    storage.polls[messageId] = { ...(storage.polls[messageId] || {}), ...data };
    saveKey('polls');
    return storage.polls[messageId];
  },

  getTags(guildId) {
    if (!storage.tags) storage.tags = {};
    if (!storage.tags[guildId]) storage.tags[guildId] = {};
    return storage.tags[guildId];
  },

  getTag(guildId, name) {
    const tags = this.getTags(guildId);
    return tags[String(name || '').toLowerCase()] || null;
  },

  setTag(guildId, name, data) {
    const tags = this.getTags(guildId);
    tags[String(name).toLowerCase()] = data;
    saveKey('tags');
    return data;
  },

  deleteTag(guildId, name) {
    const tags = this.getTags(guildId);
    const key = String(name || '').toLowerCase();
    const existed = Boolean(tags[key]);
    delete tags[key];
    saveKey('tags');
    return existed;
  },

  addReminder(data) {
    if (!Array.isArray(storage.reminders)) storage.reminders = [];
    const id = storage.reminders.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
    const item = { id, ...data };
    storage.reminders.push(item);
    saveKey('reminders');
    return item;
  },

  getReminders(guildId, userId = null, type = null) {
    if (!Array.isArray(storage.reminders)) storage.reminders = [];
    return storage.reminders.filter((item) => {
      if (item.guild_id !== guildId) return false;
      if (userId && item.user_id !== userId) return false;
      if (type && item.type !== type) return false;
      return true;
    });
  },

  getReminder(guildId, reminderId) {
    if (!Array.isArray(storage.reminders)) storage.reminders = [];
    return storage.reminders.find((item) => item.guild_id === guildId && Number(item.id) === Number(reminderId)) || null;
  },

  deleteReminder(reminderId) {
    if (!Array.isArray(storage.reminders)) storage.reminders = [];
    storage.reminders = storage.reminders.filter((item) => Number(item.id) !== Number(reminderId));
    saveKey('reminders');
  },

  takeDueReminders(now) {
    if (!Array.isArray(storage.reminders)) storage.reminders = [];
    const due = storage.reminders.filter((item) => Number(item.at) <= now);
    if (!due.length) return [];
    const dueIds = new Set(due.map((item) => item.id));
    storage.reminders = storage.reminders.filter((item) => !dueIds.has(item.id));
    saveKey('reminders');
    return due;
  },

  getInviteStats(guildId, userId) {
    if (!storage.invite_stats) storage.invite_stats = {};
    if (!storage.invite_stats[guildId]) storage.invite_stats[guildId] = {};
    if (!storage.invite_stats[guildId][userId]) {
      storage.invite_stats[guildId][userId] = { joins: 0, left: 0, fake: 0 };
    }
    return storage.invite_stats[guildId][userId];
  },

  recordInviteJoin(guildId, memberId, inviterId, isFake) {
    if (!inviterId) return null;
    const stats = this.getInviteStats(guildId, inviterId);
    stats.joins += 1;
    if (isFake) stats.fake += 1;
    if (!storage.invite_joins) storage.invite_joins = {};
    if (!storage.invite_joins[guildId]) storage.invite_joins[guildId] = {};
    storage.invite_joins[guildId][memberId] = inviterId;
    saveKey('invite_stats');
    saveKey('invite_joins');
    return stats;
  },

  recordInviteLeave(guildId, memberId) {
    if (!storage.invite_joins) storage.invite_joins = {};
    const inviterId = storage.invite_joins[guildId]?.[memberId];
    if (!inviterId) return null;
    const stats = this.getInviteStats(guildId, inviterId);
    stats.left += 1;
    saveKey('invite_stats');
    return { inviterId, stats };
  },

  getStarboardEntry(messageId) {
    if (!storage.starboard) storage.starboard = {};
    return storage.starboard[messageId] || null;
  },

  saveStarboardEntry(messageId, data) {
    if (!storage.starboard) storage.starboard = {};
    storage.starboard[messageId] = data;
    saveKey('starboard');
    return data;
  },

  deleteStarboardEntry(messageId) {
    if (!storage.starboard) storage.starboard = {};
    delete storage.starboard[messageId];
    saveKey('starboard');
  },

  getSticky(channelId) {
    if (!storage.sticky) storage.sticky = {};
    return storage.sticky[channelId] || null;
  },

  setSticky(channelId, data) {
    if (!storage.sticky) storage.sticky = {};
    storage.sticky[channelId] = data;
    saveKey('sticky');
    return data;
  },

  deleteSticky(channelId) {
    if (!storage.sticky) storage.sticky = {};
    delete storage.sticky[channelId];
    saveKey('sticky');
  },

  getAfk(guildId, userId) {
    if (!storage.afk) storage.afk = {};
    return storage.afk[`${guildId}-${userId}`] || null;
  },

  setAfk(guildId, userId, reason) {
    if (!storage.afk) storage.afk = {};
    const item = { guild_id: guildId, user_id: userId, reason: reason || 'AFK', since: Date.now() };
    storage.afk[`${guildId}-${userId}`] = item;
    saveKey('afk');
    return item;
  },

  clearAfk(guildId, userId) {
    if (!storage.afk) storage.afk = {};
    const key = `${guildId}-${userId}`;
    const item = storage.afk[key] || null;
    delete storage.afk[key];
    if (item) saveKey('afk');
    return item;
  },

  // --- YouTuber Minigame ---
  getYoutubeChannel(guildId, userId) {
    if (!storage.youtube_channels) storage.youtube_channels = {};
    const key = `${guildId}-${userId}`;
    return storage.youtube_channels[key] || null;
  },

  createYoutubeChannel(guildId, userId, name) {
    if (!storage.youtube_channels) storage.youtube_channels = {};
    const key = `${guildId}-${userId}`;
    const channel = {
      guild_id: guildId,
      user_id: userId,
      name,
      subscribers: 0,
      total_views: 0,
      total_revenue: 0,
      videos_posted: 0,
      created_at: new Date().toISOString()
    };
    storage.youtube_channels[key] = channel;
    saveKey('youtube_channels');
    return channel;
  },

  updateYoutubeChannel(guildId, userId, changes) {
    const key = `${guildId}-${userId}`;
    const channel = storage.youtube_channels?.[key];
    if (!channel) return null;
    Object.assign(channel, changes);
    saveKey('youtube_channels');
    return channel;
  },

  getYoutubeLeaderboard(guildId, limit = 10) {
    if (!storage.youtube_channels) return [];
    return Object.values(storage.youtube_channels)
      .filter((c) => c.guild_id === guildId)
      .sort((a, b) => b.subscribers - a.subscribers)
      .slice(0, limit);
  },

  // --- XP Boosters ---
  getXpBooster(guildId, userId) {
    if (!storage.xp_boosters) storage.xp_boosters = {};
    const guildBoosters = storage.xp_boosters[guildId];
    if (!guildBoosters || !guildBoosters[userId]) return null;
    const booster = guildBoosters[userId];
    if (Date.now() > booster.expiresAt) {
      delete guildBoosters[userId];
      saveKey('xp_boosters');
      return null;
    }
    return booster;
  },

  setXpBooster(guildId, userId, multiplier, durationMs) {
    if (!storage.xp_boosters) storage.xp_boosters = {};
    if (!storage.xp_boosters[guildId]) storage.xp_boosters[guildId] = {};
    const now = Date.now();
    const existing = this.getXpBooster(guildId, userId);
    let expiresAt = now + durationMs;
    // If existing booster of equal multiplier is active, stack the remaining time
    if (existing && existing.multiplier === Number(multiplier) && existing.expiresAt > now) {
      expiresAt = existing.expiresAt + durationMs;
    }
    const booster = {
      multiplier: Number(multiplier),
      expiresAt,
      startedAt: now
    };
    storage.xp_boosters[guildId][userId] = booster;
    saveKey('xp_boosters');
    return booster;
  },

  // --- Storage maintenance ---
  flush() {
    flushAll();
  },

  backupNow(reason = 'manual') {
    flushAll();
    return store.createBackup(reason);
  },

  listBackups() {
    return store.listBackupSets();
  }
};

// Feature collections added on top of the core store (leveling, automod,
// logging, pets, clans, playlists, ...) live in extra.js to keep this file
// focused on the original schema.
Object.assign(dbAPI, require('./extra')({ storage, files, saveKey, dbAPI }));

// Started only once every collection is registered so the first snapshot
// covers the extended stores too.
store.startBackupSchedule();

module.exports = dbAPI;

