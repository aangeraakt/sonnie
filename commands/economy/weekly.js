const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, warningEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('weekly')
    .setDescription('Claim your weekly coin reward'),

  async execute(interaction) {
    const userData = db.getUser(interaction.guild.id, interaction.user.id);
    const now = Date.now();
    const cooldown = 7 * 24 * 60 * 60 * 1000;

    if (userData.last_weekly) {
      const lastWeeklyTime = new Date(userData.last_weekly).getTime();
      if (now - lastWeeklyTime < cooldown) {
        const remainingMs = cooldown - (now - lastWeeklyTime);
        const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        return interaction.reply({
          embeds: [warningEmbed('Weekly Cooldown', `Come back in **${days}d ${hours}h**.`)]
        });
      }
    }

    const reward = Math.floor(Math.random() * 751) + 1000;
    db.addBalance(interaction.guild.id, interaction.user.id, reward);
    db.setLastWeekly(interaction.guild.id, interaction.user.id, new Date().toISOString());

    return interaction.reply({
      embeds: [successEmbed('Weekly Reward', `You claimed **${reward} coins**.`)]
    });
  }
};
