const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const youtubeHelper = require('../../utils/youtubeHelper');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');
const Logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('youtube')
    .setDescription('Search for videos on YouTube')
    .addStringOption(opt =>
      opt.setName('query')
        .setDescription('Title or keyword to search on YouTube')
        .setRequired(true)
    ),

  async execute(interaction) {
    const query = interaction.options.getString('query');
    if (!query) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Query', 'Please provide a search term!')], flags: 64 });
    }

    await interaction.deferReply();

    try {
      let video = null;
      try {
        const searchResults = await youtubeHelper.searchVideos(query, 1);
        if (searchResults && searchResults.length > 0) {
          video = searchResults[0];
        }
      } catch (searchErr) {
        Logger.warn('YouTube search failed, falling back:', searchErr.message);
      }

      if (video && video.url) {
        const embed = createEmbed({
          title: `▶️ ${video.title}`,
          url: video.url,
          description: `**Channel:** [${video.channel?.name || 'Unknown'}](${video.channel?.url || video.url})\n**Duration:** \`${video.durationRaw || 'Live'}\` • **Views:** \`${(video.views || 0).toLocaleString()}\``,
          color: 0xFF0000,
          footerText: 'Sonnies Search • YouTube'
        });

        if (video.thumbnails && video.thumbnails.length > 0) {
          embed.setImage(video.thumbnails[0].url);
        }

        const watchBtn = new ButtonBuilder()
          .setLabel('Watch on YouTube')
          .setURL(video.url)
          .setStyle(ButtonStyle.Link)
          .setEmoji('📺');

        const row = new ActionRowBuilder().addComponents(watchBtn);
        return interaction.editReply({ embeds: [embed], components: [row] });
      }

      const ytSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      const fallbackEmbed = createEmbed({
        title: `▶️ YouTube Search: "${query}"`,
        url: ytSearchUrl,
        description: `Click below to see search results on YouTube for **${query}**.`,
        color: 0xFF0000,
        footerText: 'Sonnies Search • YouTube'
      });

      const watchBtn = new ButtonBuilder()
        .setLabel('Open YouTube Search')
        .setURL(ytSearchUrl)
        .setStyle(ButtonStyle.Link)
        .setEmoji('📺');

      const row = new ActionRowBuilder().addComponents(watchBtn);
      return interaction.editReply({ embeds: [fallbackEmbed], components: [row] });
    } catch (err) {
      return interaction.editReply({ embeds: [errorEmbed('Search Error', `Could not search YouTube: ${err.message}`)] });
    }
  }
};
