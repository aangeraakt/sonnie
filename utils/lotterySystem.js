const db = require('../database/db');
const Logger = require('./logger');
const { createEmbed, withGuildColor } = require('./embedBuilder');

const TICKET_PRICE = 500;
const MAX_TICKETS_PER_USER = 50;
const DRAW_INTERVAL_MS = 24 * 60 * 60 * 1000;
const HOUSE_SEED = 2500;

/** Total tickets in the pot, used for odds display and weighted drawing. */
function totalTickets(lottery) {
  return Object.values(lottery.tickets || {}).reduce((sum, count) => sum + count, 0);
}

function pickWinner(lottery) {
  const entries = Object.entries(lottery.tickets || {});
  const total = totalTickets(lottery);
  if (!total) return null;

  let roll = Math.floor(Math.random() * total);
  for (const [userId, count] of entries) {
    roll -= count;
    if (roll < 0) return userId;
  }
  return entries[entries.length - 1][0];
}

/**
 * Runs the draw for one guild. Returns the winner id, or null when the
 * lottery had fewer than two participants (in which case it rolls over).
 */
async function drawLottery(client, guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;

  const lottery = db.getLottery(guildId);
  const participants = Object.keys(lottery.tickets || {});
  const nextDraw = Date.now() + DRAW_INTERVAL_MS;

  // A one-person lottery is just a refund with extra steps - roll it over.
  if (participants.length < 2) {
    db.setLotteryDraw(guildId, nextDraw);
    return null;
  }

  const winnerId = pickWinner(lottery);
  const pot = lottery.pot + HOUSE_SEED;
  const tickets = totalTickets(lottery);
  const winnerTickets = lottery.tickets[winnerId] || 0;

  db.addBalance(guildId, winnerId, pot);
  db.bumpAchievementStat(guildId, winnerId, 'lottery_wins', 1);
  db.resetLottery(guildId, winnerId, pot, nextDraw);

  const announceChannel = resolveAnnounceChannel(guild);
  if (announceChannel) {
    await withGuildColor(guildId, () => announceChannel.send({
      content: `<@${winnerId}>`,
      embeds: [createEmbed({
        title: 'Lottery Draw',
        description: `<@${winnerId}> won **${pot.toLocaleString()}** coins!`,
        fields: [
          { name: 'Winning Tickets', value: `\`${winnerTickets} of ${tickets}\``, inline: true },
          { name: 'Odds', value: `\`${((winnerTickets / tickets) * 100).toFixed(1)}%\``, inline: true },
          { name: 'Players', value: `\`${participants.length}\``, inline: true },
          { name: 'Next Draw', value: `<t:${Math.floor(nextDraw / 1000)}:R>`, inline: false }
        ]
      })]
    })).catch(() => {});
  }

  Logger.info(`Lottery drawn in ${guild.name}: ${winnerId} won ${pot} coins.`);
  return winnerId;
}

function resolveAnnounceChannel(guild) {
  const cfg = db.getGuildConfig(guild.id);
  const candidates = [cfg.command_channel_id, cfg.welcome_channel_id].filter(Boolean);
  for (const id of candidates) {
    const channel = guild.channels.cache.get(id);
    if (channel?.isTextBased?.()) return channel;
  }
  return guild.systemChannel && guild.systemChannel.isTextBased() ? guild.systemChannel : null;
}

/** Checks every guild's lottery once a minute and draws the ones that are due. */
function startLotteryLoop(client, intervalMs = 60 * 1000) {
  const timer = setInterval(async () => {
    let lotteries;
    try {
      lotteries = db.getAllLotteries();
    } catch (err) {
      return;
    }

    const now = Date.now();
    for (const lottery of lotteries) {
      if (!lottery.draw_at || lottery.draw_at > now) continue;
      await drawLottery(client, lottery.guild_id).catch((err) => {
        Logger.error(`Lottery draw failed for ${lottery.guild_id}:`, err);
      });
    }
  }, intervalMs);

  if (typeof timer.unref === 'function') timer.unref();
  Logger.info('Lottery draw loop started.');
  return timer;
}

module.exports = {
  TICKET_PRICE,
  MAX_TICKETS_PER_USER,
  DRAW_INTERVAL_MS,
  HOUSE_SEED,
  totalTickets,
  pickWinner,
  drawLottery,
  startLotteryLoop
};
