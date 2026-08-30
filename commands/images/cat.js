const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');

const CAT_FACTS = [
  'Cats spend 70% of their lives sleeping and 15% grooming!',
  'A cat can jump up to six times its length in a single bound.',
  'Cats have 32 muscles in each ear, allowing them to rotate 180 degrees.',
  'A cat’s purr vibrates at a frequency that promotes bone healing.',
  'Ancient Egyptians worshipped cats and considered them sacred protectors.'
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cat')
    .setDescription('Get a random cute cat photo and fun fact'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      let imageUrl = null;
      try {
        const res = await fetch('https://api.thecatapi.com/v1/images/search');
        const data = await res.json();
        if (data && data[0]?.url) {
          imageUrl = data[0].url;
        }
      } catch (e) {}

      if (!imageUrl) {
        imageUrl = `https://cataas.com/cat?timestamp=${Date.now()}`;
      }

      const randomFact = CAT_FACTS[Math.floor(Math.random() * CAT_FACTS.length)];

      const embed = createEmbed({
        title: '🐱 Meow! Here is a Cute Kitty',
        description: `💡 *${randomFact}*`,
        color: 0x9B59B6,
        footerText: 'Sonnies Image • TheCatAPI'
      });

      embed.setImage(imageUrl);

      const btn = new ButtonBuilder()
        .setLabel('View Original')
        .setURL(imageUrl)
        .setStyle(ButtonStyle.Link)
        .setEmoji('🐾');

      const row = new ActionRowBuilder().addComponents(btn);

      return interaction.editReply({ embeds: [embed], components: [row] });
    } catch (err) {
      return interaction.editReply({ embeds: [errorEmbed('Error', `Failed to load cat image: ${err.message}`)] });
    }
  }
};
