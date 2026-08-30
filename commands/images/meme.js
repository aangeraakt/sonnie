const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');

const SUBREDDITS = ['memes', 'dankmemes', 'wholesomememes', 'me_irl', 'funny'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('meme')
    .setDescription('Get a fresh trending meme from Reddit')
    .addStringOption(opt =>
      opt.setName('category')
        .setDescription('Meme category / subreddit')
        .setRequired(false)
        .addChoices(
          { name: 'General Memes (r/memes)', value: 'memes' },
          { name: 'Dank Memes (r/dankmemes)', value: 'dankmemes' },
          { name: 'Wholesome Memes (r/wholesomememes)', value: 'wholesomememes' },
          { name: 'Me IRL (r/me_irl)', value: 'me_irl' }
        )
    ),

  async execute(interaction) {
    const category = interaction.options.getString('category') || SUBREDDITS[Math.floor(Math.random() * SUBREDDITS.length)];
    await interaction.deferReply();

    try {
      const res = await fetch(`https://meme-api.com/gimme/${category}`);
      if (!res.ok) {
        return interaction.editReply({ embeds: [errorEmbed('Meme Error', 'Could not retrieve meme from Reddit.')] });
      }

      const data = await res.json();
      if (!data || !data.url) {
        return interaction.editReply({ embeds: [errorEmbed('Meme Error', 'No meme found.')] });
      }

      const embed = createEmbed({
        title: `😂 ${data.title}`,
        url: data.postLink || data.url,
        description: `Subreddit: **r/${data.subreddit}** • Author: **u/${data.author}**`,
        color: 0xFF4500, // Reddit Orange
        footerText: `👍 ${data.ups?.toLocaleString() || 0} Upvotes • Sonnies Memes`
      });

      embed.setImage(data.url);

      const btn = new ButtonBuilder()
        .setLabel('View on Reddit')
        .setURL(data.postLink || data.url)
        .setStyle(ButtonStyle.Link)
        .setEmoji('🔗');

      const row = new ActionRowBuilder().addComponents(btn);

      return interaction.editReply({ embeds: [embed], components: [row] });
    } catch (err) {
      return interaction.editReply({ embeds: [errorEmbed('Error', `Failed to load meme: ${err.message}`)] });
    }
  }
};
