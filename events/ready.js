const { ActivityType } = require('discord.js');
const db = require('../database/db');
const Logger = require('../utils/logger');
const { endedEmbed, collectParticipants, pickWinners } = require('../utils/giveawayHelper');
const musicManager = require('../utils/musicManager');
const youtubeHelper = require('../utils/youtubeHelper');
const { cacheGuildInvites } = require('../utils/inviteCache');
const { startReminderLoop } = require('../utils/reminderLoop');
const { withGuildColor } = require('../utils/embedBuilder');
const { startVoiceXpLoop } = require('../utils/levelingManager');
const { startTempBanLoop } = require('../utils/punishmentEngine');
const { startCounterLoop } = require('../utils/counterChannels');
const { startLotteryLoop } = require('../utils/lotterySystem');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    Logger.success(`🤖 Bot ${client.user.tag} (Sonnies) is online and ready!`);
    Logger.info(`Connected to ${client.guilds.cache.size} servers.`);

    client.inviteCache = new Map();
    for (const guild of client.guilds.cache.values()) {
      await cacheGuildInvites(guild);
    }
    startReminderLoop(client);
    startVoiceXpLoop(client);
    startTempBanLoop(client);
    startCounterLoop(client);
    startLotteryLoop(client);

    // Set activity
    client.user.setActivity('/utility help | Sonnies Bot', { type: ActivityType.Watching });

    youtubeHelper.warmup().catch((err) => {
      Logger.warn('YouTube session warmup failed:', err.message);
    });

    // Initialize 24/7 radio stations
    setTimeout(() => {
      musicManager.restoreQueuesOnStartup(client)
        .then(() => musicManager.initRadioOnStartup(client))
        .catch(err => {
          Logger.error('Error restoring music or radio on startup:', err);
        });
    }, 3000);

    // Giveaway background checker (runs every 10 seconds)
    setInterval(async () => {
      try {
        const activeGiveaways = db.getActiveGiveaways();
        const now = Date.now();

        for (const giveaway of activeGiveaways) {
          if (now >= giveaway.end_time) {
            db.endGiveaway(giveaway.message_id);

            const guild = client.guilds.cache.get(giveaway.guild_id);
            if (!guild) continue;

            const channel = guild.channels.cache.get(giveaway.channel_id);
            if (!channel) continue;

            try {
              await withGuildColor(giveaway.guild_id, async () => {
              const msg = await channel.messages.fetch(giveaway.message_id).catch(() => null);
              const pool = await collectParticipants(giveaway, msg);

              if (pool.length === 0) {
                channel.send(`📭 Giveaway for **${giveaway.prize}** ended, but nobody entered.`);
              } else {
                const winners = pickWinners(pool, giveaway.winners_count);
                const winnersText = winners.map(id => `<@${id}>`).join(', ');
                const endEmbed = endedEmbed(giveaway.prize, winnersText, giveaway.hosted_by);

                if (msg) {
                  await msg.edit({ embeds: [endEmbed], components: [] }).catch(() => {});
                }
                await channel.send({ content: `🎊 Congratulations ${winnersText}! You won **${giveaway.prize}**!`, embeds: [endEmbed] });
              }
              });
            } catch (err) {
              Logger.error(`Error ending giveaway ${giveaway.message_id}:`, err);
            }
          }
        }
      } catch (err) {
        Logger.error('Error in giveaway checker loop:', err);
      }
    }, 10000);
  }
};
