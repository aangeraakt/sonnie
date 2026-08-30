const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('google')
    .setDescription('Search Google or generate a direct Google search link')
    .addStringOption(opt =>
      opt.setName('query')
        .setDescription('What do you want to search on Google?')
        .setRequired(true)
    ),

  async execute(interaction) {
    const query = interaction.options.getString('query');
    if (!query) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Query', 'Please provide a search query!')], flags: 64 });
    }

    const encodedQuery = encodeURIComponent(query);
    const googleUrl = `https://www.google.com/search?q=${encodedQuery}`;

    const embed = createEmbed({
      title: `🔍 Google Search: "${query}"`,
      url: googleUrl,
      description: `Click the button below to view live Google search results for **${query}**.`,
      color: 0x4285F4, // Google Blue
      fields: [
        { name: '🔎 Search Query', value: `\`${query}\``, inline: true },
        { name: '🌐 Engine', value: 'Google Search', inline: true },
        { name: '💡 Tip', value: 'Use quotes for exact matches, or `-term` to exclude keywords.', inline: false }
      ],
      footerText: 'Sonnies Search • Google'
    });

    const searchButton = new ButtonBuilder()
      .setLabel('Open Google Results')
      .setURL(googleUrl)
      .setStyle(ButtonStyle.Link)
      .setEmoji('🔎');

    const row = new ActionRowBuilder().addComponents(searchButton);

    return interaction.reply({ embeds: [embed], components: [row] });
  }
};
