const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, warningEmbed } = require('../../utils/embedBuilder');
const { awardEarnings } = require('../../utils/earnings');
const { checkAndAnnounce } = require('../../utils/achievements');

const BASE_REWARD = 250;
const STREAK_BONUS = 50;
const MAX_STREAK_BONUS = 2500;
// A claim is only late enough to break the streak after two full days.
const STREAK_GRACE_MS = 48 * 60 * 60 * 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily reward of 250 coins'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const userData = db.getUser(guildId, userId);

    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000; // 24 hours

    if (userData.last_daily) {
      const lastDailyTime = new Date(userData.last_daily).getTime();
      if (now - lastDailyTime < cooldown) {
        const remainingMs = cooldown - (now - lastDailyTime);
        const hours = Math.floor(remainingMs / (1000 * 60 * 60));
        const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

        return interaction.reply({
          embeds: [warningEmbed('Daily Cooldown 😴', `You already claimed today's gift!\nCome back in **${hours}h ${minutes}m**.`)]
        });
      }
    }

    // Claiming within 48h of the last claim continues the streak.
    const profile = db.getUserExtras(guildId, userId);
    const lastClaim = userData.last_daily ? new Date(userData.last_daily).getTime() : 0;
    const continues = lastClaim && (now - lastClaim) < STREAK_GRACE_MS;
    const streak = continues ? (profile.daily_streak || 0) + 1 : 1;

    const bonus = Math.min(MAX_STREAK_BONUS, (streak - 1) * STREAK_BONUS);
    const paid = awardEarnings(guildId, userId, BASE_REWARD + bonus, 'daily');

    db.setUserField(guildId, userId, 'daily_streak', streak);
    db.setLastDaily(guildId, userId, new Date().toISOString());

    await interaction.reply({
      embeds: [successEmbed('Daily Reward ☀️',
        `🎉 You pocketed **${paid.toLocaleString()} coins**!

` +
        `**Streak:** ${streak} day${streak === 1 ? '' : 's'}${continues ? '' : ' (streak restarted)'}
` +
        `**Streak bonus:** ${bonus.toLocaleString()} coins

` +
        `Claim again within 48 hours to keep the streak alive.`)]
    });

    return checkAndAnnounce(interaction);
  }
};
