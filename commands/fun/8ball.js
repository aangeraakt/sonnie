const { SlashCommandBuilder } = require('discord.js');
const { createEmbed } = require('../../utils/embedBuilder');

const responses = [
  'It is certain.', 'It is decidedly so.', 'Without a doubt.',
  'Yes definitely.', 'You may rely on it.', 'As I see it, yes.',
  'Most likely.', 'Outlook good.', 'Yes.', 'Signs point to yes.',
  'Reply hazy, try again.', 'Ask again later.', 'Better not tell you now.',
  'Cannot predict now.', 'Concentrate and ask again.',
  'Don\'t count on it.', 'My reply is no.', 'My sources say no.',
  'Outlook not so good.', 'Very doubtful.'
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Ask the Magic 8-Ball a question')
    .addStringOption(opt => opt.setName('question').setDescription('Your question').setRequired(true)),

  async execute(interaction) {
    const question = interaction.options.getString('question');
    const answer = responses[Math.floor(Math.random() * responses.length)];

    const embed = createEmbed({
      title: '🎱 Magic 8-Ball',
      fields: [
        { name: '❓ Question', value: question, inline: false },
        { name: '🔮 Answer', value: answer, inline: false }
      ]
    });

    return interaction.reply({ embeds: [embed] });
  }
};
