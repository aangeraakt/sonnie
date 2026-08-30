const { SlashCommandBuilder } = require('discord.js');
const { createEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dice')
    .setDescription('Roll a random dice')
    .addIntegerOption(opt => opt.setName('sides').setDescription('Number of sides (default 6)').setMinValue(2).setMaxValue(100).setRequired(false)),

  async execute(interaction) {
    const sides = interaction.options.getInteger('sides') || 6;
    const roll = Math.floor(Math.random() * sides) + 1;

    const embed = createEmbed({
      title: '🎲 Dice Roll',
      description: `You rolled a **d${sides}** and got: **${roll}**! 🍀`
    });

    return interaction.reply({ embeds: [embed] });
  }
};
