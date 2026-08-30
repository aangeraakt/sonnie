const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');

const DOG_FACTS = [
  'Dogs have a sense of time and miss you when you are gone!',
  'A dog’s nose print is unique, much like a human fingerprint.',
  'Dogs can learn over 100 words and gestures!',
  'Petting a dog lowers your blood pressure and eases anxiety.',
  'Dalmatians are born completely white and develop spots as they grow.'
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dog')
    .setDescription('Get a random cute dog photo and fun fact'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const res = await fetch('https://dog.ceo/api/breeds/image/random');
      const data = await res.json();

      if (data.status !== 'success' || !data.message) {
        return interaction.editReply({ embeds: [errorEmbed('Dog API Error', 'Could not fetch a dog photo right now!')] });
      }

      // Extract breed name from URL
      let breed = 'Good Doggo';
      const match = data.message.match(/breeds\/([^/]+)/);
      if (match && match[1]) {
        breed = match[1].split('-').reverse().map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }

      const randomFact = DOG_FACTS[Math.floor(Math.random() * DOG_FACTS.length)];

      const embed = createEmbed({
        title: `🐶 Woof! Here is a ${breed}`,
        description: `💡 *${randomFact}*`,
        color: 0xE67E22,
        footerText: 'Sonnies Image • Dog CEO API'
      });

      embed.setImage(data.message);

      const btn = new ButtonBuilder()
        .setLabel('View Original')
        .setURL(data.message)
        .setStyle(ButtonStyle.Link)
        .setEmoji('🐾');

      const row = new ActionRowBuilder().addComponents(btn);

      return interaction.editReply({ embeds: [embed], components: [row] });
    } catch (err) {
      return interaction.editReply({ embeds: [errorEmbed('Error', `Failed to load dog image: ${err.message}`)] });
    }
  }
};
