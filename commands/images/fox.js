const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fox')
    .setDescription('Get a random cute fox photo'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const res = await fetch('https://randomfox.ca/floof/');
      const data = await res.json();

      if (!data || !data.image) {
        return interaction.editReply({ embeds: [errorEmbed('Error', 'Could not load fox image right now!')] });
      }

      const embed = createEmbed({
        title: '🦊 What does the Fox say?',
        description: 'Here is a beautiful floofy fox!',
        color: 0xE67E22,
        footerText: 'Sonnies Image • randomfox.ca'
      });

      embed.setImage(data.image);

      const btn = new ButtonBuilder()
        .setLabel('View Original')
        .setURL(data.image)
        .setStyle(ButtonStyle.Link)
        .setEmoji('🦊');

      const row = new ActionRowBuilder().addComponents(btn);

      return interaction.editReply({ embeds: [embed], components: [row] });
    } catch (err) {
      return interaction.editReply({ embeds: [errorEmbed('Error', `Failed to load fox image: ${err.message}`)] });
    }
  }
};
