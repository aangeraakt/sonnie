const db = require('../database/db');

/**
 * Daily quest pool. Progress is driven by `trackQuest` calls from the
 * commands that can advance them.
 */
const QUEST_POOL = [
  { id: 'work_jobs', name: 'Clock In', description: 'Complete {goal} jobs', emoji: '🔨', goals: [3, 5, 8], reward: [1500, 2500, 4000] },
  { id: 'gather', name: 'Forager', description: 'Fish, hunt, mine, or dig {goal} times', emoji: '🎣', goals: [5, 8, 12], reward: [1800, 3000, 4500] },
  { id: 'gamble', name: 'Feeling Lucky', description: 'Play {goal} casino games', emoji: '🎰', goals: [3, 6, 10], reward: [1500, 2800, 4200] },
  { id: 'earn', name: 'Payday', description: 'Earn {goal} coins', emoji: '💰', goals: [5000, 15000, 30000], reward: [2000, 3500, 6000] },
  { id: 'chat', name: 'Social', description: 'Send {goal} messages', emoji: '💬', goals: [25, 60, 120], reward: [1200, 2200, 3800] },
  { id: 'spend', name: 'Shopper', description: 'Spend {goal} coins in the shop', emoji: '🛒', goals: [2000, 6000, 12000], reward: [1500, 2800, 4500] },
  { id: 'pet_care', name: 'Caretaker', description: 'Feed or play with your pet {goal} times', emoji: '🐾', goals: [2, 4, 6], reward: [1500, 2500, 3500] },
  { id: 'deposit', name: 'Banker', description: 'Deposit {goal} coins into the bank', emoji: '🏦', goals: [5000, 15000, 40000], reward: [1500, 2500, 4000] }
];

const QUESTS_PER_DAY = 3;
const STREAK_BONUS_PER_DAY = 250;
const MAX_STREAK_BONUS = 5000;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/** Deterministic per-user, per-day shuffle so quests are stable all day. */
function pickQuests(userId, dateKey) {
  let seed = 0;
  const source = `${userId}-${dateKey}`;
  for (let i = 0; i < source.length; i += 1) {
    seed = (seed * 31 + source.charCodeAt(i)) >>> 0;
  }

  const pool = QUEST_POOL.slice();
  const chosen = [];
  for (let i = 0; i < QUESTS_PER_DAY && pool.length; i += 1) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const index = seed % pool.length;
    const template = pool.splice(index, 1)[0];

    seed = (seed * 1103515245 + 12345) >>> 0;
    const tier = seed % template.goals.length;

    chosen.push({
      id: template.id,
      name: template.name,
      emoji: template.emoji,
      description: template.description.replace('{goal}', template.goals[tier].toLocaleString()),
      goal: template.goals[tier],
      reward: template.reward[tier],
      progress: 0,
      claimed: false
    });
  }
  return chosen;
}

/** Returns today's quests, generating a fresh set at the day boundary. */
function getDailyQuests(guildId, userId) {
  const dateKey = todayKey();
  let record = db.getQuests(guildId, userId);

  if (!record || record.date !== dateKey) {
    const previousDate = record?.date;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    // Streak survives only if the last quest day was yesterday.
    const streak = previousDate === yesterday ? (record.streak || 0) : 0;

    record = db.setQuests(guildId, userId, {
      date: dateKey,
      quests: pickQuests(userId, dateKey),
      streak,
      all_claimed: false
    });
  }

  return record;
}

/**
 * Advances any active quest matching `questId`. Called from the economy
 * commands; silently does nothing when the user has no matching quest.
 */
function trackQuest(guildId, userId, questId, amount = 1) {
  try {
    const record = getDailyQuests(guildId, userId);
    let changed = false;

    for (const quest of record.quests) {
      if (quest.id !== questId || quest.claimed) continue;
      if (quest.progress >= quest.goal) continue;
      quest.progress = Math.min(quest.goal, quest.progress + amount);
      changed = true;
    }

    if (changed) db.saveQuests();
    return changed;
  } catch (err) {
    return false;
  }
}

function isComplete(quest) {
  return quest.progress >= quest.goal;
}

/**
 * Claims every finished, unclaimed quest. Completing all three in one day
 * extends the streak and pays a bonus.
 */
function claimQuests(guildId, userId) {
  const record = getDailyQuests(guildId, userId);
  const claimable = record.quests.filter((quest) => isComplete(quest) && !quest.claimed);

  if (!claimable.length) return { claimed: [], total: 0, bonus: 0, streak: record.streak || 0 };

  let total = 0;
  for (const quest of claimable) {
    quest.claimed = true;
    total += quest.reward;
  }

  let bonus = 0;
  const allDone = record.quests.every((quest) => quest.claimed);
  if (allDone && !record.all_claimed) {
    record.all_claimed = true;
    record.streak = (record.streak || 0) + 1;
    bonus = Math.min(MAX_STREAK_BONUS, record.streak * STREAK_BONUS_PER_DAY);
    total += bonus;
    db.bumpAchievementStat(guildId, userId, 'quests_completed', record.quests.length);
  }

  db.saveQuests();
  db.addBalance(guildId, userId, total);

  return { claimed: claimable, total, bonus, streak: record.streak || 0, allDone };
}

module.exports = {
  QUEST_POOL,
  QUESTS_PER_DAY,
  getDailyQuests,
  trackQuest,
  claimQuests,
  isComplete,
  todayKey
};
