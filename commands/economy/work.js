const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, warningEmbed } = require('../../utils/embedBuilder');
const { awardEarnings, trackGamble } = require('../../utils/earnings');
const { grantXp } = require('../../utils/levelingManager');

const jobs = [
  'Developer', 'Discord Mod', 'Barista', 'Graphic Designer',
  'Gamer Streamer', 'Chef', 'Pizza Delivery Driver', 'Cybersecurity Specialist'
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('Work a shift to earn coins (1 hour cooldown)'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const userData = db.getUser(guildId, userId);

    const now = Date.now();
    const cooldown = 60 * 60 * 1000; // 1 hour

    if (userData.last_work) {
      const lastWorkTime = new Date(userData.last_work).getTime();
      if (now - lastWorkTime < cooldown) {
        const remainingMs = cooldown - (now - lastWorkTime);
        const minutes = Math.floor(remainingMs / (1000 * 60));
        const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);

        return interaction.reply({
          embeds: [warningEmbed('Need a Break 😴', `You are tired! Rest for **${minutes}m ${seconds}s** before working again.`)]
        });
      }
    }

    const rolled = Math.floor(Math.random() * 150) + 50; // 50-200 coins
    const job = jobs[Math.floor(Math.random() * jobs.length)];

    const earned = awardEarnings(guildId, userId, rolled, 'work');
    db.setLastWork(guildId, userId, new Date().toISOString());

    const xpToGive = Math.floor(Math.random() * 20) + 35; // 35-55 XP
    await grantXp(interaction.member, xpToGive, { channel: interaction.channel, source: 'work' });

    const booster = db.getXpBooster(guildId, userId);
    const boosterTag = booster ? ` (${booster.multiplier}x Booster Active!)` : '';

    return interaction.reply({
      embeds: [successEmbed('Shift Done 💼', `You worked as a **${job}** and earned **${earned} coins** and **+${xpToGive} XP**${boosterTag}!`)]
    });
  }
};
