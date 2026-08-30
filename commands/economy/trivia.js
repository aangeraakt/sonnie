const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed, COLORS } = require('../../utils/embedBuilder');
const { trackGamble } = require('../../utils/earnings');

const QUESTIONS = [
  // Gaming
  {
    category: 'Gaming',
    q: 'Which video game character is known as the "Blue Blur"?',
    correct: 'Sonic the Hedgehog',
    wrong: ['Mega Man', 'Crash Bandicoot', 'Pac-Man'],
    fact: 'Sonic debuted in 1991 for the Sega Genesis console!'
  },
  {
    category: 'Gaming',
    q: 'In Minecraft, what is the maximum build height in modern versions?',
    correct: '320 blocks',
    wrong: ['256 blocks', '128 blocks', '512 blocks'],
    fact: 'The height limit was increased from 256 to 320 in the Caves & Cliffs update.'
  },
  {
    category: 'Gaming',
    q: 'What was the first commercial home video game console ever released?',
    correct: 'Magnavox Odyssey',
    wrong: ['Atari 2600', 'Nintendo Entertainment System', 'ColecoVision'],
    fact: 'The Magnavox Odyssey was released in 1972.'
  },
  {
    category: 'Gaming',
    q: 'In League of Legends, what is the Baron Nashor an anagram for?',
    correct: 'Roshan',
    wrong: ['Dragon', 'Nashor', 'Shadow'],
    fact: 'Baron Nashor is an anagram for Roshan from DotA!'
  },

  // Science & Tech
  {
    category: 'Science',
    q: 'What is the closest planet to the Sun in our Solar System?',
    correct: 'Mercury',
    wrong: ['Venus', 'Mars', 'Earth'],
    fact: 'Despite being closest to the Sun, Venus is actually hotter due to its atmosphere!'
  },
  {
    category: 'Science',
    q: 'What is the chemical symbol for Gold on the periodic table?',
    correct: 'Au',
    wrong: ['Ag', 'Gd', 'Fe'],
    fact: 'Au comes from the Latin word "aurum", meaning shining dawn.'
  },
  {
    category: 'Science',
    q: 'How many bits are in a single byte?',
    correct: '8',
    wrong: ['4', '16', '32'],
    fact: 'A half-byte (4 bits) is historically called a nibble!'
  },
  {
    category: 'Science',
    q: 'What is the hardest naturally occurring mineral on Earth?',
    correct: 'Diamond',
    wrong: ['Corundum', 'Titanium', 'Quartz'],
    fact: 'Diamonds score a maximum 10 on the Mohs mineral hardness scale.'
  },

  // Geography & History
  {
    category: 'Geography',
    q: 'What is the largest ocean on Earth by surface area?',
    correct: 'Pacific Ocean',
    wrong: ['Atlantic Ocean', 'Indian Ocean', 'Arctic Ocean'],
    fact: 'The Pacific Ocean covers more area than all of Earth\'s landmass combined!'
  },
  {
    category: 'Geography',
    q: 'Which country has the most natural lakes in the world?',
    correct: 'Canada',
    wrong: ['United States', 'Russia', 'Sweden'],
    fact: 'Canada contains over 60% of all the world\'s natural lakes!'
  },
  {
    category: 'History',
    q: 'In which year did the Apollo 11 mission first land humans on the Moon?',
    correct: '1969',
    wrong: ['1965', '1972', '1975'],
    fact: 'Neil Armstrong and Buzz Aldrin landed the Lunar Module on July 20, 1969.'
  },

  // Pop Culture & General
  {
    category: 'Pop Culture',
    q: 'In the Marvel Cinematic Universe, what is Thor\'s enchanted hammer named?',
    correct: 'Mjolnir',
    wrong: ['Stormbreaker', 'Gungnir', 'Aegis'],
    fact: 'Only those who are worthy can lift Mjolnir!'
  },
  {
    category: 'Pop Culture',
    q: 'What is the highest-grossing film of all time worldwide?',
    correct: 'Avatar (2009)',
    wrong: ['Avengers: Endgame', 'Titanic', 'Star Wars: The Force Awakens'],
    fact: 'James Cameron\'s Avatar has grossed over $2.9 billion worldwide.'
  }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trivia')
    .setDescription('Answer trivia questions under 20s to win coins and XP!')
    .addIntegerOption(opt =>
      opt.setName('bet')
        .setDescription('Coins to bet (0 or leave blank for free play)')
        .setRequired(false)
        .setMinValue(0)
    )
    .addStringOption(opt =>
      opt.setName('category')
        .setDescription('Question Category')
        .setRequired(false)
        .addChoices(
          { name: '🎲 All Categories', value: 'all' },
          { name: '🎮 Gaming', value: 'Gaming' },
          { name: '🔬 Science & Tech', value: 'Science' },
          { name: '🌍 Geography & History', value: 'Geography' },
          { name: '🍿 Pop Culture', value: 'Pop Culture' }
        )
    ),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const bet = interaction.options.getInteger('bet') || 0;
    const chosenCategory = interaction.options.getString('category') || 'all';

    const user = db.getUser(guildId, userId);
    if (bet > 0 && user.balance < bet) {
      return interaction.reply({
        embeds: [errorEmbed('Insufficient Funds', `You need **$${bet.toLocaleString()}** coins, but only have **$${user.balance.toLocaleString()}** in your wallet! 👛`)],
        ephemeral: true
      });
    }

    if (bet > 0) {
      db.addBalance(guildId, userId, -bet);
      trackGamble(guildId, userId);
    }

    // Filter questions
    let pool = QUESTIONS;
    if (chosenCategory !== 'all') {
      pool = QUESTIONS.filter(q => q.category === chosenCategory || (chosenCategory === 'Geography' && (q.category === 'Geography' || q.category === 'History')));
      if (!pool.length) pool = QUESTIONS;
    }

    const question = pool[Math.floor(Math.random() * pool.length)];

    // Shuffle options
    const allOptions = [question.correct, ...question.wrong];
    for (let i = allOptions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allOptions[i], allOptions[j]] = [allOptions[j], allOptions[i]];
    }

    const labels = ['A', 'B', 'C', 'D'];
    const row = new ActionRowBuilder();

    allOptions.forEach((opt, idx) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`trivia_${idx}`)
          .setLabel(`${labels[idx]}: ${opt.length > 70 ? opt.slice(0, 67) + '...' : opt}`)
          .setStyle(ButtonStyle.Secondary)
      );
    });

    const questionEmbed = createEmbed({
      title: `🧠 Trivia Quiz: ${question.category}`,
      color: COLORS.PRIMARY || 0x5865F2,
      description: `### **${question.q}**\n\nClick the correct button below before the timer runs out!`,
      fields: [
        { name: '💵 Bet', value: bet > 0 ? `\`$${bet.toLocaleString()}\`` : '`Free Play`', inline: true },
        { name: '⏳ Timer', value: '`20 Seconds`', inline: true },
        { name: '🏆 Reward', value: bet > 0 ? `\`$${(bet * 2).toLocaleString()} + 50 XP\`` : '`$150 + 35 XP`', inline: true }
      ],
      footer: { text: 'Select an answer option A, B, C, or D' }
    });

    const response = await interaction.reply({
      embeds: [questionEmbed],
      components: [row],
      fetchReply: true
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 20_000
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== userId) {
        return i.reply({ content: "❌ This is not your trivia game!", ephemeral: true });
      }

      const selectedIdx = parseInt(i.customId.replace('trivia_', ''), 10);
      const selectedAnswer = allOptions[selectedIdx];
      const isCorrect = selectedAnswer === question.correct;

      collector.stop(isCorrect ? 'correct' : 'wrong');
    });

    collector.on('end', async (collected, reason) => {
      const disabledRow = new ActionRowBuilder();
      allOptions.forEach((opt, idx) => {
        const btn = new ButtonBuilder()
          .setCustomId(`trivia_end_${idx}`)
          .setLabel(`${labels[idx]}: ${opt.length > 70 ? opt.slice(0, 67) + '...' : opt}`)
          .setDisabled(true);

        if (opt === question.correct) {
          btn.setStyle(ButtonStyle.Success);
        } else {
          btn.setStyle(ButtonStyle.Secondary);
        }
        disabledRow.addComponents(btn);
      });

      if (reason === 'correct') {
        const payout = bet > 0 ? bet * 2 : 150;
        const xpEarned = bet > 0 ? 50 : 35;
        db.addBalance(guildId, userId, payout);
        db.addXP(guildId, userId, xpEarned);

        const wonEmbed = createEmbed({
          title: '🎉 Correct Answer!',
          color: COLORS.SUCCESS || 0x57F287,
          description: `✅ **Spot on!** The answer was **${question.correct}**.\n\n💡 *Did you know?* ${question.fact}`,
          fields: [
            { name: '💰 Won', value: `\`+$${payout.toLocaleString()}\``, inline: true },
            { name: '✨ XP Earned', value: `\`+${xpEarned} XP\``, inline: true },
            { name: '👛 Wallet', value: `\`$${db.getUser(guildId, userId).balance.toLocaleString()}\``, inline: true }
          ]
        });

        await interaction.editReply({
          embeds: [wonEmbed],
          components: [disabledRow]
        }).catch(() => {});
      } else if (reason === 'wrong') {
        const lostEmbed = createEmbed({
          title: '❌ Incorrect Answer!',
          color: COLORS.ERROR || 0xED4245,
          description: `The correct answer was **${question.correct}**.\n\n💡 *Did you know?* ${question.fact}`,
          fields: [
            ...(bet > 0 ? [{ name: '💸 Lost Bet', value: `\`-$${bet.toLocaleString()}\``, inline: true }] : []),
            { name: '👛 Wallet', value: `\`$${db.getUser(guildId, userId).balance.toLocaleString()}\``, inline: true }
          ]
        });

        await interaction.editReply({
          embeds: [lostEmbed],
          components: [disabledRow]
        }).catch(() => {});
      } else {
        // Timeout
        const timeoutEmbed = createEmbed({
          title: '⏰ Time\'s Up!',
          color: COLORS.WARNING || 0xFEE75C,
          description: `You ran out of time! The correct answer was **${question.correct}**.\n\n💡 *Did you know?* ${question.fact}`,
          fields: [
            ...(bet > 0 ? [{ name: '💸 Forfeited Bet', value: `\`-$${bet.toLocaleString()}\``, inline: true }] : [])
          ]
        });

        await interaction.editReply({
          embeds: [timeoutEmbed],
          components: [disabledRow]
        }).catch(() => {});
      }
    });
  }
};
