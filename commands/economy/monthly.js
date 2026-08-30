const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, warningEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('monthly')
    .setDescription('Claim your monthly coin reward'),

  async execute(interaction) {
    const userData = db.getUser(interaction.guild.id, interaction.user.id);
    const now = Date.now();
    const cooldown = 30 * 24 * 60 * 60 * 1000;

    if (userData.last_monthly) {
      const lastMonthlyTime = new Date(userData.last_monthly).getTime();
      if (now - lastMonthlyTime < cooldown) {
        const remainingMs = cooldown - (now - lastMonthlyTime);
        const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        return interaction.reply({
          embeds: [warningEmbed('Monthly Cooldown', `Come back in **${days}d ${hours}h**.`)]
        });
      }
    }

    const reward = Math.floor(Math.random() * 3001) + 4000;
    db.addBalance(interaction.guild.id, interaction.user.id, reward);
    db.setLastMonthly(interaction.guild.id, interaction.user.id, new Date().toISOString());

    return interaction.reply({
      embeds: [successEmbed('Monthly Reward', `You claimed **${reward} coins**.`)]
    });
  }
};
