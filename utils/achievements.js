const db = require('../database/db');
const { createEmbed } = require('./embedBuilder');

/**
 * Achievement catalog. Each entry checks a stat counter or a live value from
 * the user record, so nothing needs a dedicated tracking loop.
 */
const ACHIEVEMENTS = {
  first_coins: { name: 'Pocket Change', emoji: '🪙', description: 'Hold 1,000 coins at once', reward: 500, check: (ctx) => ctx.netWorth >= 1000 },
  saver: { name: 'Saver', emoji: '🏦', description: 'Hold 100,000 coins at once', reward: 5000, check: (ctx) => ctx.netWorth >= 100000 },
  millionaire: { name: 'Millionaire', emoji: '💰', description: 'Hold 1,000,000 coins at once', reward: 50000, check: (ctx) => ctx.netWorth >= 1000000 },

  level_10: { name: 'Getting Started', emoji: '⭐', description: 'Reach level 10', reward: 2000, check: (ctx) => ctx.user.level >= 10 },
  level_25: { name: 'Regular', emoji: '🌟', description: 'Reach level 25', reward: 10000, check: (ctx) => ctx.user.level >= 25 },
  level_50: { name: 'Veteran', emoji: '✨', description: 'Reach level 50', reward: 40000, check: (ctx) => ctx.user.level >= 50 },
  level_100: { name: 'Legend', emoji: '👑', description: 'Reach level 100', reward: 150000, check: (ctx) => ctx.user.level >= 100 },

  gambler: { name: 'Gambler', emoji: '🎰', description: 'Play 100 casino games', reward: 5000, check: (ctx) => (ctx.stats.games_played || 0) >= 100 },
  high_roller: { name: 'High Roller', emoji: '💎', description: 'Win 100,000 coins in a single bet', reward: 25000, check: (ctx) => (ctx.stats.biggest_win || 0) >= 100000 },
  lottery_winner: { name: 'Lucky One', emoji: '🎟️', description: 'Win the server lottery', reward: 10000, check: (ctx) => (ctx.stats.lottery_wins || 0) >= 1 },

  worker: { name: 'Grafter', emoji: '🔨', description: 'Complete 50 jobs', reward: 4000, check: (ctx) => (ctx.stats.jobs_done || 0) >= 50 },
  collector: { name: 'Collector', emoji: '🎒', description: 'Hold 25 different item types at once', reward: 6000, check: (ctx) => ctx.uniqueItems >= 25 },

  pet_owner: { name: 'Companion', emoji: '🐾', description: 'Adopt a pet', reward: 1000, check: (ctx) => Boolean(ctx.pet) },
  pet_master: { name: 'Pet Master', emoji: '🏅', description: 'Raise a pet to level 10', reward: 15000, check: (ctx) => (ctx.pet?.level || 0) >= 10 },

  married: { name: 'Betrothed', emoji: '💍', description: 'Get married', reward: 5000, check: (ctx) => Boolean(ctx.marriage) },
  clan_member: { name: 'Team Player', emoji: '🛡️', description: 'Join a clan', reward: 2500, check: (ctx) => Boolean(ctx.clan) },

  quest_starter: { name: 'Questing', emoji: '📜', description: 'Complete 10 daily quests', reward: 5000, check: (ctx) => (ctx.stats.quests_completed || 0) >= 10 },
  quest_master: { name: 'Quest Master', emoji: '🗺️', description: 'Complete 100 daily quests', reward: 40000, check: (ctx) => (ctx.stats.quests_completed || 0) >= 100 },

  streak_week: { name: 'Consistent', emoji: '🔥', description: 'Reach a 7 day daily streak', reward: 7000, check: (ctx) => (ctx.user.daily_streak || 0) >= 7 },
  streak_month: { name: 'Devoted', emoji: '🔥🔥', description: 'Reach a 30 day daily streak', reward: 30000, check: (ctx) => (ctx.user.daily_streak || 0) >= 30 },

  prestiged: { name: 'Reborn', emoji: '♻️', description: 'Prestige for the first time', reward: 0, check: (ctx) => (ctx.user.prestige || 0) >= 1 },
  prestige_5: { name: 'Ascended', emoji: '🚀', description: 'Reach prestige 5', reward: 0, check: (ctx) => (ctx.user.prestige || 0) >= 5 }
};

/** Gathers everything the checks need in one pass. */
function buildContext(guildId, userId) {
  const user = db.getUserExtras(guildId, userId);
  const record = db.getAchievements(guildId, userId);
  const inventory = db.getInventory(guildId, userId) || {};

  return {
    user,
    stats: record.stats,
    unlocked: record.unlocked,
    netWorth: (user.balance || 0) + (user.bank || 0),
    uniqueItems: Object.values(inventory).filter((count) => count > 0).length,
    pet: db.getPet(guildId, userId),
    marriage: db.getMarriage(guildId, userId),
    clan: db.getClanByMember(guildId, userId)
  };
}

/**
 * Checks every achievement and unlocks the newly earned ones, paying out
 * their rewards. Returns the list of achievements unlocked by this call.
 */
function checkAchievements(guildId, userId) {
  const ctx = buildContext(guildId, userId);
  const newlyUnlocked = [];

  for (const [id, achievement] of Object.entries(ACHIEVEMENTS)) {
    if (ctx.unlocked[id]) continue;
    let earned = false;
    try {
      earned = achievement.check(ctx);
    } catch (err) {
      earned = false;
    }
    if (!earned) continue;

    if (db.unlockAchievement(guildId, userId, id)) {
      if (achievement.reward > 0) db.addBalance(guildId, userId, achievement.reward);
      newlyUnlocked.push({ id, ...achievement });
    }
  }

  return newlyUnlocked;
}

/**
 * Runs the check and, if anything unlocked, announces it. Safe to call from
 * any command - it never throws and never blocks the original reply.
 */
async function checkAndAnnounce(interaction, guildId = null, userId = null) {
  try {
    const gid = guildId || interaction.guild.id;
    const uid = userId || interaction.user.id;
    const unlocked = checkAchievements(gid, uid);
    if (!unlocked.length) return [];

    const totalReward = unlocked.reduce((sum, item) => sum + item.reward, 0);
    const embed = createEmbed({
      title: unlocked.length === 1 ? 'Achievement Unlocked' : `${unlocked.length} Achievements Unlocked`,
      description: unlocked
        .map((item) => `${item.emoji} **${item.name}** - ${item.description}${item.reward ? ` (+${item.reward.toLocaleString()} coins)` : ''}`)
        .join('\n'),
      footerText: totalReward ? `Total reward: ${totalReward.toLocaleString()} coins` : 'Sonnies'
    });

    const payload = { embeds: [embed] };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
    return unlocked;
  } catch (err) {
    return [];
  }
}

module.exports = { ACHIEVEMENTS, buildContext, checkAchievements, checkAndAnnounce };
