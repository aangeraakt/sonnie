const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wikipedia')
    .setDescription('Search Wikipedia encyclopedia for articles and summaries')
    .addStringOption(opt =>
      opt.setName('query')
        .setDescription('Article topic to search')
        .setRequired(true)
    ),

  async execute(interaction) {
    const query = interaction.options.getString('query');
    if (!query) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Query', 'Please provide a topic to search!')], flags: 64 });
    }

    await interaction.deferReply();

    try {
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);

      if (!res.ok) {
        // Try searching for article titles
        const searchRes = await fetch(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&namespace=0&format=json`);
        const searchData = await searchRes.json();

        if (searchData && searchData[1] && searchData[1].length > 0) {
          const matchTitle = searchData[1][0];
          const secondRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(matchTitle)}`);
          if (secondRes.ok) {
            const article = await secondRes.json();
            return sendWikiEmbed(interaction, article);
          }
        }

        return interaction.editReply({ embeds: [errorEmbed('Not Found', `No Wikipedia article found matching \`${query}\`.`)] });
      }

      const article = await res.json();
      return sendWikiEmbed(interaction, article);
    } catch (err) {
      return interaction.editReply({ embeds: [errorEmbed('Search Error', `Could not search Wikipedia: ${err.message}`)] });
    }
  }
};

function sendWikiEmbed(interaction, article) {
  const pageUrl = article.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(article.title)}`;
  const extract = article.extract ? (article.extract.length > 1000 ? article.extract.slice(0, 997) + '...' : article.extract) : 'No summary available.';

  const embed = createEmbed({
    title: `📚 Wikipedia: ${article.title}`,
    url: pageUrl,
    description: `${article.description ? `*${article.description}*\n\n` : ''}${extract}`,
    color: 0xEAEAEA,
    footerText: 'Sonnies Search • Wikipedia'
  });

  if (article.thumbnail?.source) {
    embed.setThumbnail(article.thumbnail.source);
  }

  const readBtn = new ButtonBuilder()
    .setLabel('Read Full Article')
    .setURL(pageUrl)
    .setStyle(ButtonStyle.Link)
    .setEmoji('📖');

  const row = new ActionRowBuilder().addComponents(readBtn);
  return interaction.editReply({ embeds: [embed], components: [row] });
}
