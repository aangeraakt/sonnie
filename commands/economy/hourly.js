const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, warningEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hourly')
    .setDescription('Claim your hourly coin reward'),

  async execute(interaction) {
    const userData = db.getUser(interaction.guild.id, interaction.user.id);
    const now = Date.now();
    const cooldown = 60 * 60 * 1000;

    if (userData.last_hourly) {
      const lastHourlyTime = new Date(userData.last_hourly).getTime();
      if (now - lastHourlyTime < cooldown) {
        const remainingMs = cooldown - (now - lastHourlyTime);
        const minutes = Math.floor(remainingMs / (1000 * 60));
        const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
        return interaction.reply({
          embeds: [warningEmbed('Hourly Cooldown', `Come back in **${minutes}m ${seconds}s**.`)]
        });
      }
    }

    const reward = Math.floor(Math.random() * 51) + 75;
    db.addBalance(interaction.guild.id, interaction.user.id, reward);
    db.setLastHourly(interaction.guild.id, interaction.user.id, new Date().toISOString());

    return interaction.reply({
      embeds: [successEmbed('Hourly Reward', `You claimed **${reward} coins**.`)]
    });
  }
};
