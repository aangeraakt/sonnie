const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed, COLORS } = require('../../utils/embedBuilder');
const { trackGamble } = require('../../utils/earnings');

const SYMBOLS = [
  { emoji: '7️⃣', name: 'Lucky 7', weight: 8, multiplier: 10, isJackpot: true },
  { emoji: '💎', name: 'Diamond', weight: 12, multiplier: 7 },
  { emoji: '👑', name: 'Crown', weight: 18, multiplier: 5 },
  { emoji: '🔔', name: 'Bell', weight: 24, multiplier: 4 },
  { emoji: '🍇', name: 'Grapes', weight: 30, multiplier: 3 },
  { emoji: '🍋', name: 'Lemon', weight: 36, multiplier: 2.5 },
  { emoji: '🍒', name: 'Cherry', weight: 42, multiplier: 2 }
];

const TOTAL_WEIGHT = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);

function getRandomSymbol() {
  let rand = Math.random() * TOTAL_WEIGHT;
  for (const s of SYMBOLS) {
    if (rand < s.weight) return s;
    rand -= s.weight;
  }
  return SYMBOLS[SYMBOLS.length - 1];
}

function generateReelGrid() {
  // 3 rows x 3 columns
  const top = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];
  const middle = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()]; // Payline
  const bottom = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];
  return { top, middle, bottom };
}

function evaluatePayline(middleRow) {
  const [s1, s2, s3] = middleRow;

  // 3-of-a-kind match
  if (s1.emoji === s2.emoji && s2.emoji === s3.emoji) {
    return {
      won: true,
      multiplier: s1.multiplier,
      matchType: s1.isJackpot ? '🎰 JACKPOT MATCH (3x 7️⃣)!' : `Triple Match (3x ${s1.emoji} ${s1.name})!`,
      isJackpot: !!s1.isJackpot
    };
  }

  // Two cherries match payout
  const cherries = middleRow.filter(s => s.emoji === '🍒').length;
  if (cherries === 2) {
    return {
      won: true,
      multiplier: 2,
      matchType: 'Double Cherries Match (2x 🍒)!',
      isJackpot: false
    };
  }

  // No match - full loss
  return { won: false, multiplier: 0, matchType: 'No match' };
}

function renderSlotGrid(grid) {
  return [
    '```',
    '╔═════════════════════════╗',
    '║     🎰 CASINO SLOTS 🎰   ║',
    '╠═════════════════════════╣',
    `║   ${grid.top[0].emoji}   │   ${grid.top[1].emoji}   │   ${grid.top[2].emoji}   ║`,
    `║ ▶ ${grid.middle[0].emoji}   │   ${grid.middle[1].emoji}   │   ${grid.middle[2].emoji}   ◀ ║  (PAYLINE)`,
    `║   ${grid.bottom[0].emoji}   │   ${grid.bottom[1].emoji}   │   ${grid.bottom[2].emoji}   ║`,
    '╚═════════════════════════╝',
    '```'
  ].join('\n');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Spin the 3-reel slot machine to win big coin multipliers!')
    .addIntegerOption(opt =>
      opt
        .setName('amount')
        .setDescription('Amount of coins to bet')
        .setMinValue(10)
        .setRequired(true)
    ),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const bet = interaction.options.getInteger('amount');

    if (!bet || bet < 10) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid Bet', 'The minimum bet for Slots is **10 coins**!')],
        flags: 64
      });
    }

    const userData = db.getUser(guildId, userId);
    if (userData.balance < bet) {
      return interaction.reply({
        embeds: [
          errorEmbed(
            'Insufficient Funds',
            `You do not have enough coins in your wallet!\n• **Your Wallet:** \`${userData.balance} coins\`\n• **Required Bet:** \`${bet} coins\``
          )
        ],
        flags: 64
      });
    }

    // Deduct bet
    db.addBalance(guildId, userId, -bet);
    trackGamble(guildId, userId);

    // Initial spinning embed
    const spinningEmbed = createEmbed({
      title: '🎰 Spinning the Slots...',
      description: [
        `**Bet:** \`${bet} coins\``,
        '',
        '```',
        '╔═════════════════════════╗',
        '║     🎰 CASINO SLOTS 🎰   ║',
        '╠═════════════════════════╣',
        '║   🌀   │   🌀   │   🌀   ║',
        '║ ▶ 🌀   │   🌀   │   🌀   ◀ ║',
        '║   🌀   │   🌀   │   🌀   ║',
        '╚═════════════════════════╝',
        '```',
        '*Reels are spinning fast...*'
      ].join('\n'),
      color: COLORS.INFO,
      footerText: 'Sonnies Casino • Slots'
    });

    const replyMsg = await interaction.reply({ embeds: [spinningEmbed], fetchReply: true });

    // Generate final reels
    const finalGrid = generateReelGrid();
    const result = evaluatePayline(finalGrid.middle);

    let payout = 0;
    let title = '';
    let description = '';
    let color = COLORS.ERROR;

    if (result.won) {
      payout = Math.floor(bet * result.multiplier);
      const profit = payout - bet;
      db.addBalance(guildId, userId, payout);

      if (result.isJackpot) {
        title = '🚨 777 MEGA JACKPOT WINNER! 🚨';
        color = COLORS.WARNING;
      } else {
        title = '🎉 WINNER! Slot Payline Hit!';
        color = COLORS.SUCCESS;
      }

      description = [
        `**${result.matchType}**`,
        `Multiplier: **${result.multiplier}x**`,
        `Net Profit: **+${profit >= 0 ? profit : profit} coins** (Payout: **${payout} coins**)`,
        '',
        renderSlotGrid(finalGrid)
      ].join('\n');
    } else {
      title = '💀 No Match! Spin Again!';
      color = COLORS.ERROR;
      description = [
        `You didn't hit any matching payline symbols.`,
        `Lost: **-${bet} coins**`,
        '',
        renderSlotGrid(finalGrid)
      ].join('\n');
    }

    const updatedUser = db.getUser(guildId, userId);

    const finalEmbed = createEmbed({
      title,
      description,
      color,
      fields: [
        { name: '🎲 Bet Amount', value: `\`${bet} coins\``, inline: true },
        { name: '💰 Wallet Balance', value: `\`${updatedUser.balance} coins\``, inline: true }
      ],
      footerText: 'Sonnies Casino • Slots'
    });

    setTimeout(async () => {
      try {
        await replyMsg.edit({ embeds: [finalEmbed] });
      } catch (err) {}
    }, 1200);
  }
};
