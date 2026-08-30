const { SlashCommandBuilder } = require('discord.js');
const { createEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Flip a coin (Heads or Tails)'),

  async execute(interaction) {
    const result = Math.random() < 0.5 ? 'Heads 🪙' : 'Tails 🪙';

    const embed = createEmbed({
      title: '🪙 Coinflip Result',
      description: `The coin landed on: **${result}**! ✨`
    });

    return interaction.reply({ embeds: [embed] });
  }
};
