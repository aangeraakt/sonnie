const db = require('../database/db');
const { trackQuest } = require('./questSystem');

/**
 * Central payout path for coins a user *earns* (jobs, gathering, gambling
 * wins). Transfers between users deliberately do not go through here - the
 * prestige bonus would mint coins out of nothing if it applied to /pay.
 *
 * Applies the prestige earnings bonus, advances the relevant daily quest,
 * and records achievement stats. Returns the amount actually credited.
 */
function awardEarnings(guildId, userId, amount, source = 'other') {
  const base = Math.max(0, Math.round(amount));
  if (!base) return 0;

  const user = db.getUserExtras(guildId, userId);
  const prestige = user.prestige || 0;
  const final = Math.round(base * (1 + prestige * 0.1));

  db.addBalance(guildId, userId, final);
  db.setUserField(guildId, userId, 'total_earned', (user.total_earned || 0) + final);

  trackQuest(guildId, userId, 'earn', final);

  switch (source) {
    case 'work':
      trackQuest(guildId, userId, 'work_jobs', 1);
      db.bumpAchievementStat(guildId, userId, 'jobs_done', 1);
      break;
    case 'gather':
      trackQuest(guildId, userId, 'gather', 1);
      db.bumpAchievementStat(guildId, userId, 'gathers', 1);
      break;
    case 'gamble': {
      const record = db.getAchievements(guildId, userId);
      if (final > (record.stats.biggest_win || 0)) {
        db.bumpAchievementStat(guildId, userId, 'biggest_win', final - (record.stats.biggest_win || 0));
      }
      break;
    }
    default:
      break;
  }

  return final;
}

/** Records a casino round being played, win or lose. */
function trackGamble(guildId, userId) {
  trackQuest(guildId, userId, 'gamble', 1);
  db.bumpAchievementStat(guildId, userId, 'games_played', 1);
}

/** The multiplier a user's prestige currently gives them. */
function earningsMultiplier(guildId, userId) {
  const user = db.getUserExtras(guildId, userId);
  return 1 + (user.prestige || 0) * 0.1;
}

module.exports = { awardEarnings, trackGamble, earningsMultiplier };
