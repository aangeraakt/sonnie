const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed, COLORS } = require('../../utils/embedBuilder');
const { trackGamble } = require('../../utils/earnings');

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const BLACK_NUMBERS = new Set([2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35]);

function getNumberColor(num) {
  if (num === 0) return { name: 'Green', emoji: '🟢' };
  if (RED_NUMBERS.has(num)) return { name: 'Red', emoji: '🔴' };
  return { name: 'Black', emoji: '⚫' };
}

function evaluateBet(betSpace, rolledNumber) {
  const colorInfo = getNumberColor(rolledNumber);
  const cleanSpace = betSpace.toLowerCase().trim();

  // 1. Exact number bet (0 - 36)
  if (/^[0-9]+$/.test(cleanSpace)) {
    const targetNum = parseInt(cleanSpace, 10);
    if (targetNum >= 0 && targetNum <= 36) {
      if (targetNum === rolledNumber) {
        return { won: true, multiplier: 36, label: `Exact Number ${targetNum}` };
      }
      return { won: false, multiplier: 0, label: `Exact Number ${targetNum}` };
    }
  }

  // 2. Color Bets
  if (cleanSpace === 'red' || cleanSpace === '🔴') {
    return { won: colorInfo.name === 'Red', multiplier: 2, label: 'Red (🔴)' };
  }
  if (cleanSpace === 'black' || cleanSpace === '⚫') {
    return { won: colorInfo.name === 'Black', multiplier: 2, label: 'Black (⚫)' };
  }
  if (cleanSpace === 'green' || cleanSpace === '🟢') {
    return { won: rolledNumber === 0, multiplier: 36, label: 'Green (🟢)' };
  }

  // 3. Even / Odd (0 is neither even nor odd in casino roulette)
  if (cleanSpace === 'even') {
    return { won: rolledNumber !== 0 && rolledNumber % 2 === 0, multiplier: 2, label: 'Even Numbers' };
  }
  if (cleanSpace === 'odd') {
    return { won: rolledNumber !== 0 && rolledNumber % 2 !== 0, multiplier: 2, label: 'Odd Numbers' };
  }

  // 4. Halves: Low (1-18) vs High (19-36)
  if (cleanSpace === 'low' || cleanSpace === '1-18') {
    return { won: rolledNumber >= 1 && rolledNumber <= 18, multiplier: 2, label: 'Low (1-18)' };
  }
  if (cleanSpace === 'high' || cleanSpace === '19-36') {
    return { won: rolledNumber >= 19 && rolledNumber <= 36, multiplier: 2, label: 'High (19-36)' };
  }

  // 5. Dozens
  if (cleanSpace === '1st12' || cleanSpace === '1-12' || cleanSpace === 'first12') {
    return { won: rolledNumber >= 1 && rolledNumber <= 12, multiplier: 3, label: '1st Dozen (1-12)' };
  }
  if (cleanSpace === '2nd12' || cleanSpace === '13-24' || cleanSpace === 'second12') {
    return { won: rolledNumber >= 13 && rolledNumber <= 24, multiplier: 3, label: '2nd Dozen (13-24)' };
  }
  if (cleanSpace === '3rd12' || cleanSpace === '25-36' || cleanSpace === 'third12') {
    return { won: rolledNumber >= 25 && rolledNumber <= 36, multiplier: 3, label: '3rd Dozen (25-36)' };
  }

  return null; // Invalid bet space
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roulette')
    .setDescription('Bet your coins on European Roulette!')
    .addIntegerOption(opt =>
      opt
        .setName('amount')
        .setDescription('Amount of coins to bet')
        .setMinValue(10)
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName('space')
        .setDescription('Where to place your bet (e.g., red, black, even, odd, low, high, 1st12, 2nd12, 3rd12, or 0-36)')
        .setRequired(true)
        .addChoices(
          { name: '🔴 Red (2x payout)', value: 'red' },
          { name: '⚫ Black (2x payout)', value: 'black' },
          { name: '🟢 Green / Zero (36x payout)', value: 'green' },
          { name: '🔢 Even Numbers (2x payout)', value: 'even' },
          { name: '🔢 Odd Numbers (2x payout)', value: 'odd' },
          { name: '📉 Low: 1-18 (2x payout)', value: 'low' },
          { name: '📈 High: 19-36 (2x payout)', value: 'high' },
          { name: '📦 1st Dozen: 1-12 (3x payout)', value: '1st12' },
          { name: '📦 2nd Dozen: 13-24 (3x payout)', value: '2nd12' },
          { name: '📦 3rd Dozen: 25-36 (3x payout)', value: '3rd12' }
        )
    ),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const bet = interaction.options.getInteger('amount');
    const spaceInput = interaction.options.getString('space') || 'red';

    if (!bet || bet < 10) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid Bet', 'The minimum bet for Roulette is **10 coins**!')],
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

    // Validate bet space
    const dummyCheck = evaluateBet(spaceInput, 1);
    if (!dummyCheck) {
      return interaction.reply({
        embeds: [
          errorEmbed(
            'Invalid Bet Space',
            'Please choose a valid bet space!\nOptions: `red`, `black`, `green`, `even`, `odd`, `low` (1-18), `high` (19-36), `1st12`, `2nd12`, `3rd12`, or any number `0`-`36`.'
          )
        ],
        flags: 64
      });
    }

    // Deduct bet
    db.addBalance(guildId, userId, -bet);
    trackGamble(guildId, userId);

    // Initial spinning embed
    const spinEmbed = createEmbed({
      title: '🎡 Roulette Wheel Spinning...',
      description: `**${interaction.user.username}** placed a bet of **${bet} coins** on **${spaceInput.toUpperCase()}**!\n\n*The ball rolls around the wheel... ⚪ ↷*`,
      color: COLORS.INFO,
      footerText: 'Sonnies Casino • European Roulette'
    });

    const replyMsg = await interaction.reply({ embeds: [spinEmbed], fetchReply: true });

    // Simulate roulette roll
    const rolledNumber = Math.floor(Math.random() * 37); // 0 to 36
    const colorInfo = getNumberColor(rolledNumber);
    const result = evaluateBet(spaceInput, rolledNumber);

    let payout = 0;
    let title = '';
    let description = '';
    let color = COLORS.ERROR;

    if (result.won) {
      payout = bet * result.multiplier;
      const profit = payout - bet;
      db.addBalance(guildId, userId, payout);

      title = '🎉 WINNER! Roulette Payout!';
      description = `The ball landed on **${colorInfo.emoji} ${rolledNumber} (${colorInfo.name})**!\n\nYour bet on **${result.label}** won **+${profit} coins** (Payout: **${payout} coins**)! 🏆`;
      color = COLORS.SUCCESS;
    } else {
      title = '💀 Lost! No Match!';
      description = `The ball landed on **${colorInfo.emoji} ${rolledNumber} (${colorInfo.name})**.\n\nYour bet on **${result.label}** was not a winner. You lost **${bet} coins**.`;
      color = COLORS.ERROR;
    }

    const updatedUser = db.getUser(guildId, userId);

    const resultEmbed = createEmbed({
      title,
      description,
      color,
      fields: [
        { name: '🎯 Winning Space', value: `\`[ ${colorInfo.emoji} ${rolledNumber} - ${colorInfo.name} ]\``, inline: true },
        { name: '🎲 Your Bet', value: `\`${bet} coins\` on \`${result.label}\``, inline: true },
        { name: '💰 Wallet Balance', value: `\`${updatedUser.balance} coins\``, inline: false }
      ],
      footerText: 'Sonnies Casino • European Roulette'
    });

    // Small delay to make the spinning feel alive
    setTimeout(async () => {
      try {
        if (interaction.isChatInputCommand?.() || interaction.replied) {
          await replyMsg.edit({ embeds: [resultEmbed] });
        } else {
          await replyMsg.edit({ embeds: [resultEmbed] });
        }
      } catch (err) {}
    }, 1500);
  }
};
