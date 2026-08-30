const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed, COLORS } = require('../../utils/embedBuilder');
const { trackGamble } = require('../../utils/earnings');

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const RANKS = [
  { rank: 'A', value: 11 },
  { rank: '2', value: 2 },
  { rank: '3', value: 3 },
  { rank: '4', value: 4 },
  { rank: '5', value: 5 },
  { rank: '6', value: 6 },
  { rank: '7', value: 7 },
  { rank: '8', value: 8 },
  { rank: '9', value: 9 },
  { rank: '10', value: 10 },
  { rank: 'J', value: 10 },
  { rank: 'Q', value: 10 },
  { rank: 'K', value: 10 }
];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rankObj of RANKS) {
      deck.push({ rank: rankObj.rank, suit, value: rankObj.value });
    }
  }
  // Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function calculateHand(hand) {
  let value = 0;
  let aces = 0;

  for (const card of hand) {
    value += card.value;
    if (card.rank === 'A') aces++;
  }

  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }

  return value;
}

function formatHand(hand, hideSecond = false) {
  if (hideSecond) {
    return `\`[${hand[0].rank}${hand[0].suit}]\` \`[🂠 ?]\``;
  }
  return hand.map(c => `\`[${c.rank}${c.suit}]\``).join(' ');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Play a game of Blackjack against the dealer!')
    .addIntegerOption(opt =>
      opt
        .setName('amount')
        .setDescription('The amount of coins to bet')
        .setMinValue(10)
        .setRequired(true)
    ),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    let bet = interaction.options.getInteger('amount');

    if (!bet || bet < 10) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid Bet', 'The minimum bet for Blackjack is **10 coins**!')],
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

    // Deduct initial bet
    db.addBalance(guildId, userId, -bet);
    trackGamble(guildId, userId);

    const deck = createDeck();
    const playerHand = [deck.pop(), deck.pop()];
    const dealerHand = [deck.pop(), deck.pop()];

    const initialPlayerScore = calculateHand(playerHand);
    const initialDealerScore = calculateHand(dealerHand);

    const isPlayerBJ = initialPlayerScore === 21;
    const isDealerBJ = initialDealerScore === 21;

    // --- Check Natural Blackjack ---
    if (isPlayerBJ || isDealerBJ) {
      let title = '';
      let description = '';
      let color = COLORS.INFO;
      let payout = 0;

      if (isPlayerBJ && isDealerBJ) {
        title = '🤝 Push! Both Got Blackjack!';
        description = `Both you and the dealer got a natural **Blackjack (21)**!\nYour bet of **${bet} coins** has been refunded.`;
        color = COLORS.WARNING;
        payout = bet;
      } else if (isPlayerBJ) {
        payout = Math.floor(bet * 2.5); // 3:2 payout (bet + 1.5x profit)
        title = '🃏 BLACKJACK! You Win!';
        description = `You got a natural **Blackjack (21)**!\nYou won **+${payout - bet} coins** (Total return: **${payout} coins**)! 🎉`;
        color = COLORS.SUCCESS;
      } else {
        title = '💀 Dealer Blackjack! You Lost!';
        description = `The dealer got a natural **Blackjack (21)**.\nYou lost **${bet} coins**. Better luck next time!`;
        color = COLORS.ERROR;
        payout = 0;
      }

      if (payout > 0) {
        db.addBalance(guildId, userId, payout);
      }

      const updatedUser = db.getUser(guildId, userId);
      const endEmbed = createEmbed({
        title,
        description,
        color,
        fields: [
          { name: `🧑 Your Hand (${calculateHand(playerHand)})`, value: formatHand(playerHand), inline: true },
          { name: `🤖 Dealer Hand (${calculateHand(dealerHand)})`, value: formatHand(dealerHand), inline: true },
          { name: '💰 Wallet Balance', value: `\`${updatedUser.balance} coins\``, inline: false }
        ]
      });

      return interaction.reply({ embeds: [endEmbed] });
    }

    // --- Normal Gameplay ---
    let currentBet = bet;
    const gameId = `${interaction.id || Date.now()}_${userId}`;

    function createButtons(canDouble = false, disabled = false) {
      const hitBtn = new ButtonBuilder()
        .setCustomId(`bj_hit_${gameId}`)
        .setLabel('Hit')
        .setEmoji('🟢')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled);

      const standBtn = new ButtonBuilder()
        .setCustomId(`bj_stand_${gameId}`)
        .setLabel('Stand')
        .setEmoji('🛑')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);

      const doubleBtn = new ButtonBuilder()
        .setCustomId(`bj_double_${gameId}`)
        .setLabel(`Double Down (+${bet})`)
        .setEmoji('💰')
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled || !canDouble);

      return new ActionRowBuilder().addComponents(hitBtn, standBtn, doubleBtn);
    }

    // Check if player has enough money to double down
    const canInitialDouble = db.getUser(guildId, userId).balance >= bet;

    function buildGameEmbed(status = 'Choose an action to continue...', color = COLORS.PRIMARY) {
      const pScore = calculateHand(playerHand);
      return createEmbed({
        title: '🃏 Blackjack Table',
        description: `**Bet:** \`${currentBet} coins\`\n${status}`,
        color,
        fields: [
          { name: `🧑 Your Hand (${pScore})`, value: formatHand(playerHand), inline: true },
          { name: '🤖 Dealer Hand (?)', value: formatHand(dealerHand, true), inline: true }
        ],
        footerText: 'Sonnies Casino • Blackjack'
      });
    }

    const gameMessage = await interaction.reply({
      embeds: [buildGameEmbed()],
      components: [createButtons(canInitialDouble, false)],
      fetchReply: true
    });

    const collector = gameMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000
    });

    let gameEnded = false;

    async function finishGame(reason, extraMsg = '') {
      gameEnded = true;
      collector.stop(reason);

      // Dealer turn if player didn't bust
      if (reason !== 'bust') {
        while (calculateHand(dealerHand) < 17) {
          dealerHand.push(deck.pop());
        }
      }

      const pScore = calculateHand(playerHand);
      const dScore = calculateHand(dealerHand);

      let title = '';
      let desc = '';
      let color = COLORS.INFO;
      let payout = 0;

      if (pScore > 21) {
        title = '💥 You Busted!';
        desc = `Your hand exceeded 21 (**${pScore}**).\nYou lost **${currentBet} coins**!`;
        color = COLORS.ERROR;
      } else if (dScore > 21) {
        payout = currentBet * 2;
        title = '🎉 Dealer Busted! You Win!';
        desc = `The dealer busted with **${dScore}**!\nYou won **+${currentBet} coins** (Payout: **${payout} coins**)! 🏆`;
        color = COLORS.SUCCESS;
      } else if (pScore > dScore) {
        payout = currentBet * 2;
        title = '🏆 You Win!';
        desc = `Your hand (**${pScore}**) beat the dealer's hand (**${dScore}**)!\nYou won **+${currentBet} coins** (Payout: **${payout} coins**)! ✨`;
        color = COLORS.SUCCESS;
      } else if (pScore === dScore) {
        payout = currentBet;
        title = '🤝 Push (Tie)!';
        desc = `Both you and the dealer scored **${pScore}**.\nYour bet of **${currentBet} coins** has been refunded.`;
        color = COLORS.WARNING;
      } else {
        title = '📉 Dealer Wins!';
        desc = `Dealer scored **${dScore}**, beating your **${pScore}**.\nYou lost **${currentBet} coins**. Better luck next round!`;
        color = COLORS.ERROR;
      }

      if (payout > 0) {
        db.addBalance(guildId, userId, payout);
      }

      const updatedUser = db.getUser(guildId, userId);
      const endEmbed = createEmbed({
        title,
        description: `${desc}${extraMsg ? `\n\n${extraMsg}` : ''}`,
        color,
        fields: [
          { name: `🧑 Your Hand (${pScore})`, value: formatHand(playerHand), inline: true },
          { name: `🤖 Dealer Hand (${dScore})`, value: formatHand(dealerHand), inline: true },
          { name: '💰 Wallet Balance', value: `\`${updatedUser.balance} coins\``, inline: false }
        ],
        footerText: 'Sonnies Casino • Blackjack'
      });

      try {
        await gameMessage.edit({
          embeds: [endEmbed],
          components: [createButtons(false, true)]
        });
      } catch (err) {}
    }

    collector.on('collect', async btnInteraction => {
      if (btnInteraction.user.id !== userId) {
        return btnInteraction.reply({
          embeds: [errorEmbed('Not Your Game', 'This Blackjack game was started by someone else!')],
          flags: 64
        });
      }

      await btnInteraction.deferUpdate();

      if (btnInteraction.customId === `bj_hit_${gameId}`) {
        playerHand.push(deck.pop());
        const newScore = calculateHand(playerHand);

        if (newScore > 21) {
          await finishGame('bust');
        } else if (newScore === 21) {
          await finishGame('stand', '🎯 You reached 21 and automatically stood!');
        } else {
          await gameMessage.edit({
            embeds: [buildGameEmbed(`You drew **${playerHand[playerHand.length - 1].rank}${playerHand[playerHand.length - 1].suit}**! Score is now **${newScore}**!`)],
            components: [createButtons(false, false)] // Cannot double after first hit
          });
        }
      } else if (btnInteraction.customId === `bj_double_${gameId}`) {
        // Double bet
        const freshUser = db.getUser(guildId, userId);
        if (freshUser.balance < currentBet) {
          return btnInteraction.followUp({
            embeds: [errorEmbed('Insufficient Funds', 'You do not have enough coins to Double Down!')],
            flags: 64
          });
        }

        db.addBalance(guildId, userId, -currentBet);
        currentBet *= 2;

        playerHand.push(deck.pop());
        const doubleScore = calculateHand(playerHand);

        if (doubleScore > 21) {
          await finishGame('bust', '💰 You doubled down and drew 1 card.');
        } else {
          await finishGame('stand', '💰 You doubled down, drew 1 card, and stood.');
        }
      } else if (btnInteraction.customId === `bj_stand_${gameId}`) {
        await finishGame('stand');
      }
    });

    collector.on('end', async (collected, reason) => {
      if (!gameEnded && reason === 'time') {
        await finishGame('stand', '⏰ Time expired: Automatically stood for dealer resolution.');
      }
    });
  }
};
