const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed, COLORS } = require('../../utils/embedBuilder');
const { trackGamble } = require('../../utils/earnings');

const DICE_EMOJIS = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
}

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dicebet')
    .setDescription('Gamble on dice rolls against the dealer or bet on sums and doubles!')
    .addIntegerOption(opt =>
      opt.setName('bet')
        .setDescription('Amount of coins to bet')
        .setRequired(true)
        .setMinValue(10)
    )
    .addStringOption(opt =>
      opt.setName('mode')
        .setDescription('Betting mode')
        .setRequired(true)
        .addChoices(
          { name: '⚔️ VS Dealer (Highest 2d6 roll wins 2.0x)', value: 'vs_dealer' },
          { name: '⬆️ Over 7 (Roll 8 - 12 pays 2.3x)', value: 'over7' },
          { name: '⬇️ Under 7 (Roll 2 - 6 pays 2.3x)', value: 'under7' },
          { name: '🎯 Exact 7 (Lucky 7 pays 5.5x)', value: 'exact7' },
          { name: '👯 Doubles (Matching pair pays 5.5x)', value: 'doubles' },
          { name: '🔢 Exact Sum (2-12 pays up to 30x)', value: 'exact_sum' }
        )
    )
    .addIntegerOption(opt =>
      opt.setName('exact_sum')
        .setDescription('Target sum when using Exact Sum mode (2 - 12)')
        .setRequired(false)
        .setMinValue(2)
        .setMaxValue(12)
    ),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const bet = interaction.options.getInteger('bet');
    const mode = interaction.options.getString('mode');
    const exactSum = interaction.options.getInteger('exact_sum');

    if (mode === 'exact_sum' && !exactSum) {
      return interaction.reply({
        embeds: [errorEmbed('Missing Parameter', 'Please provide the `exact_sum` option (number between 2 and 12) when betting on Exact Sum!')],
        ephemeral: true
      });
    }

    const user = db.getUser(guildId, userId);
    if (user.balance < bet) {
      return interaction.reply({
        embeds: [errorEmbed('Insufficient Funds', `You need **$${bet.toLocaleString()}** coins, but only have **$${user.balance.toLocaleString()}** in your wallet! 👛`)],
        ephemeral: true
      });
    }

    // Deduct bet immediately
    db.addBalance(guildId, userId, -bet);
    trackGamble(guildId, userId);

    const d1 = rollDie();
    const d2 = rollDie();
    const playerTotal = d1 + d2;
    const isDouble = d1 === d2;

    let initialEmbed = createEmbed({
      title: '🎲 Rolling the Dice...',
      color: COLORS.PRIMARY || 0x5865F2,
      description: `*The dice are bouncing across the felt table...* 🎲 🎲`,
      fields: [
        { name: '💵 Bet', value: `\`$${bet.toLocaleString()}\``, inline: true },
        { name: '🎯 Mode', value: `\`${mode.toUpperCase()}\``, inline: true }
      ]
    });

    await interaction.reply({ embeds: [initialEmbed] });
    await sleep(1200);

    let won = false;
    let push = false;
    let multiplier = 0;
    let resultDesc = '';

    if (mode === 'vs_dealer') {
      const dealer1 = rollDie();
      const dealer2 = rollDie();
      const dealerTotal = dealer1 + dealer2;

      const playerDiceStr = `${DICE_EMOJIS[d1]} (${d1}) + ${DICE_EMOJIS[d2]} (${d2}) = **${playerTotal}**`;
      const dealerDiceStr = `${DICE_EMOJIS[dealer1]} (${dealer1}) + ${DICE_EMOJIS[dealer2]} (${dealer2}) = **${dealerTotal}**`;

      if (playerTotal > dealerTotal) {
        won = true;
        multiplier = 2.0;
        resultDesc = `🧑 **Your Roll:** ${playerDiceStr}\n🤖 **Dealer's Roll:** ${dealerDiceStr}\n\n🎉 **You beat the dealer!**`;
      } else if (playerTotal === dealerTotal) {
        push = true;
        multiplier = 1.0;
        resultDesc = `🧑 **Your Roll:** ${playerDiceStr}\n🤖 **Dealer's Roll:** ${dealerDiceStr}\n\n⚖️ **It's a TIE!** Your bet was refunded.`;
      } else {
        won = false;
        resultDesc = `🧑 **Your Roll:** ${playerDiceStr}\n🤖 **Dealer's Roll:** ${dealerDiceStr}\n\n❌ **Dealer won with the higher total!**`;
      }
    } else {
      const rollStr = `${DICE_EMOJIS[d1]} (${d1}) + ${DICE_EMOJIS[d2]} (${d2}) = **${playerTotal}**`;

      if (mode === 'over7') {
        won = playerTotal > 7;
        multiplier = 2.3;
        resultDesc = `🎲 **Roll:** ${rollStr}\n\n` + (won ? '🎉 **Over 7!** You won the bet!' : '❌ **7 or Lower!** You lost.');
      } else if (mode === 'under7') {
        won = playerTotal < 7;
        multiplier = 2.3;
        resultDesc = `🎲 **Roll:** ${rollStr}\n\n` + (won ? '🎉 **Under 7!** You won the bet!' : '❌ **7 or Higher!** You lost.');
      } else if (mode === 'exact7') {
        won = playerTotal === 7;
        multiplier = 5.5;
        resultDesc = `🎲 **Roll:** ${rollStr}\n\n` + (won ? '🌟 **LUCKY 7!** Hit the exact 7!' : '❌ **Not a 7.** You lost.');
      } else if (mode === 'doubles') {
        won = isDouble;
        multiplier = 5.5;
        resultDesc = `🎲 **Roll:** ${rollStr}\n\n` + (won ? `🎉 **DOUBLES (${d1}-${d2})!** You won!` : '❌ **Not doubles.** You lost.');
      } else if (mode === 'exact_sum') {
        won = playerTotal === exactSum;
        const exactPayouts = { 2: 30, 12: 30, 3: 15, 11: 15, 4: 10, 10: 10, 5: 8, 9: 8, 6: 6, 8: 6, 7: 5 };
        multiplier = exactPayouts[exactSum] || 5;
        resultDesc = `🎲 **Roll:** ${rollStr} (Target: **${exactSum}**)\n\n` + (won ? `🏆 **BULLSEYE!** Hit exact sum **${exactSum}** at **${multiplier}x**!` : `❌ **Missed!** Rolled ${playerTotal} instead of ${exactSum}.`);
      }
    }

    const payout = Math.floor(bet * multiplier);
    const profit = payout - bet;

    if (won) {
      db.addBalance(guildId, userId, payout);
      db.addXP(guildId, userId, Math.min(100, Math.floor(payout / 100) + 10));
    } else if (push) {
      db.addBalance(guildId, userId, bet);
    }

    const finalEmbed = createEmbed({
      title: won ? '🎉 Dice: Winner!' : push ? '⚖️ Dice: Tie / Push' : '💥 Dice: Loss',
      color: won ? COLORS.SUCCESS : push ? COLORS.INFO : COLORS.ERROR,
      description: resultDesc,
      fields: [
        { name: '💵 Bet', value: `\`$${bet.toLocaleString()}\``, inline: true },
        { name: '💰 Payout', value: `\`$${payout.toLocaleString()}\``, inline: true },
        { name: '👛 Wallet', value: `\`$${db.getUser(guildId, userId).balance.toLocaleString()}\``, inline: true }
      ]
    });

    await interaction.editReply({ embeds: [finalEmbed] }).catch(() => {});
  }
};
