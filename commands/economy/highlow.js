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

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const RANKS = [
  { name: '2', val: 2 },
  { name: '3', val: 3 },
  { name: '4', val: 4 },
  { name: '5', val: 5 },
  { name: '6', val: 6 },
  { name: '7', val: 7 },
  { name: '8', val: 8 },
  { name: '9', val: 9 },
  { name: '10', val: 10 },
  { name: 'J', val: 11 },
  { name: 'Q', val: 12 },
  { name: 'K', val: 13 },
  { name: 'A', val: 14 }
];

const MULTIPLIERS = [1.0, 1.35, 1.85, 2.60, 3.80, 5.50, 8.50, 15.00];

function getRandomCard() {
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
  const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
  return { ...rank, suit, display: `\`[${rank.name}${suit}]\`` };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('highlow')
    .setDescription('Predict whether the next card will be Higher or Lower to build a win streak!')
    .addIntegerOption(opt =>
      opt.setName('bet')
        .setDescription('Amount of coins to bet')
        .setRequired(true)
        .setMinValue(10)
    ),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const bet = interaction.options.getInteger('bet');

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

    let currentCard = getRandomCard();
    let streak = 0;
    const history = [currentCard.display];

    const getMultiplier = (s) => MULTIPLIERS[Math.min(s, MULTIPLIERS.length - 1)];

    const buildEmbed = (status = 'playing', note = '') => {
      let color = COLORS.PRIMARY || 0x5865F2;
      let title = '🃏 Higher or Lower';

      const currentMult = getMultiplier(streak);
      const nextMult = getMultiplier(streak + 1);
      const payout = Math.floor(bet * currentMult);

      if (status === 'won') {
        color = COLORS.SUCCESS || 0x57F287;
        title = '🎉 High-Low: Cashed Out!';
      } else if (status === 'lost') {
        color = COLORS.ERROR || 0xED4245;
        title = '💥 High-Low: Wrong Guess!';
      } else if (status === 'max') {
        color = COLORS.GOLD || 0xF1C40F;
        title = '👑 High-Low: MAXIMUM STREAK!';
      }

      return createEmbed({
        title,
        color,
        description: `${note ? note + '\n\n' : ''}Current Card: **${currentCard.display}** (Rank: **${currentCard.name}**)\nCard History: ${history.join(' ➔ ')}`,
        fields: [
          { name: '💵 Bet', value: `\`$${bet.toLocaleString()}\``, inline: true },
          { name: '🔥 Streak', value: `\`${streak} / ${MULTIPLIERS.length - 1}\``, inline: true },
          { name: '📈 Multiplier', value: `\`${currentMult.toFixed(2)}x\``, inline: true },
          { name: '💰 Current Payout', value: `\`$${payout.toLocaleString()}\``, inline: true },
          { name: '✨ Next Streak', value: `\`${streak < MULTIPLIERS.length - 1 ? nextMult.toFixed(2) + 'x' : 'MAX'}\``, inline: true }
        ],
        footer: { text: status === 'playing' ? 'Guess Higher, Lower, or Cash Out • 60s timeout' : 'Game Finished' }
      });
    };

    const buildControlRow = (disabled = false) => {
      const payout = Math.floor(bet * getMultiplier(streak));
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('hl_higher')
          .setLabel('Higher')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('⬆️')
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId('hl_lower')
          .setLabel('Lower')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('⬇️')
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId('hl_cashout')
          .setLabel(`Cash Out ($${payout.toLocaleString()})`)
          .setStyle(ButtonStyle.Success)
          .setEmoji('💰')
          .setDisabled(disabled || streak === 0)
      );
    };

    const response = await interaction.reply({
      embeds: [buildEmbed('playing', 'Will the next card be higher or lower in rank than this card?')],
      components: [buildControlRow(false)],
      fetchReply: true
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60_000
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== userId) {
        return i.reply({ content: "❌ This is not your High-Low game!", ephemeral: true });
      }

      if (i.customId === 'hl_cashout') {
        collector.stop('cashout');
        return;
      }

      const nextCard = getRandomCard();
      history.push(nextCard.display);

      const isHigher = nextCard.val > currentCard.val;
      const isLower = nextCard.val < currentCard.val;
      const isTie = nextCard.val === currentCard.val;

      const guessedHigher = i.customId === 'hl_higher';
      const guessedLower = i.customId === 'hl_lower';

      let correct = (guessedHigher && isHigher) || (guessedLower && isLower);

      if (isTie) {
        // Tie push bonus
        currentCard = nextCard;
        await i.update({
          embeds: [buildEmbed('playing', `⚖️ **It's a TIE!** Both cards were **${nextCard.name}**. Your streak is preserved!`)],
          components: [buildControlRow(false)]
        }).catch(() => {});
        return;
      }

      if (correct) {
        streak++;
        currentCard = nextCard;

        if (streak >= MULTIPLIERS.length - 1) {
          collector.stop('max');
          return;
        }

        await i.update({
          embeds: [buildEmbed('playing', `✅ **Correct!** Next card was **${nextCard.display}**! Streak is now **${streak}** (Multiplier: **${getMultiplier(streak).toFixed(2)}x**)!`)],
          components: [buildControlRow(false)]
        }).catch(() => {});
      } else {
        currentCard = nextCard;
        collector.stop('wrong');
      }
    });

    collector.on('end', async (collected, reason) => {
      const payout = Math.floor(bet * getMultiplier(streak));
      const profit = payout - bet;

      if (reason === 'cashout' || reason === 'max') {
        db.addBalance(guildId, userId, payout);
        db.addXP(guildId, userId, Math.min(100, Math.floor(payout / 100) + 10));

        const note = reason === 'max'
          ? `👑 **MAX STREAK REACHED!** You nailed **${streak}** consecutive guesses!\nWon **$${payout.toLocaleString()}** (Profit: **+$${profit.toLocaleString()}**)!`
          : `🎉 **Successfully cashed out!** Banked **$${payout.toLocaleString()}** at **${getMultiplier(streak).toFixed(2)}x** (Profit: **+$${profit.toLocaleString()}**)!`;

        await interaction.editReply({
          embeds: [buildEmbed(reason === 'max' ? 'max' : 'won', note)],
          components: [buildControlRow(true)]
        }).catch(() => {});
      } else if (reason === 'wrong') {
        await interaction.editReply({
          embeds: [buildEmbed('lost', `❌ **Wrong Guess!** Next card was **${currentCard.display}**.\nYou lost your bet of **$${bet.toLocaleString()}** coins.`)],
          components: [buildControlRow(true)]
        }).catch(() => {});
      } else {
        // Timeout
        if (streak > 0) {
          db.addBalance(guildId, userId, payout);
          await interaction.editReply({
            embeds: [buildEmbed('won', `⏰ **Game Timed Out!** Auto-cashed out **$${payout.toLocaleString()}** coins!`)],
            components: [buildControlRow(true)]
          }).catch(() => {});
        } else {
          db.addBalance(guildId, userId, bet);
          await interaction.editReply({
            embeds: [buildEmbed('lost', `⏰ **Game Timed Out!** Your bet of **$${bet.toLocaleString()}** was refunded.`)],
            components: [buildControlRow(true)]
          }).catch(() => {});
        }
      }
    });
  }
};
