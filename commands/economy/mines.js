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

const GRID_SIZE = 16; // 4x4 grid
const ROWS = 4;
const COLS = 4;

function calculateMultiplier(minesCount, revealedCount) {
  if (revealedCount === 0) return 1.0;
  const safeTotal = GRID_SIZE - minesCount;
  let prob = 1.0;
  for (let i = 0; i < revealedCount; i++) {
    prob *= (safeTotal - i) / (GRID_SIZE - i);
  }
  // 96% RTP (house edge 4%)
  const mult = 0.96 / prob;
  return Math.max(1.05, Math.round(mult * 100) / 100);
}

function createGridButtons(grid, revealed, gameOver, explodedIndex = -1, cashout = false) {
  const rows = [];

  for (let r = 0; r < ROWS; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < COLS; c++) {
      const index = r * COLS + c;
      const isMine = grid[index] === 'mine';
      const isRevealed = revealed.has(index);

      const btn = new ButtonBuilder().setCustomId(`mine_tile_${index}`);

      if (gameOver) {
        btn.setDisabled(true);
        if (index === explodedIndex) {
          btn.setEmoji('💥').setStyle(ButtonStyle.Danger);
        } else if (isMine) {
          btn.setEmoji('💣').setStyle(ButtonStyle.Danger);
        } else if (isRevealed) {
          btn.setEmoji('💎').setStyle(ButtonStyle.Success);
        } else {
          btn.setEmoji('⬛').setStyle(ButtonStyle.Secondary);
        }
      } else {
        if (isRevealed) {
          btn.setEmoji('💎').setStyle(ButtonStyle.Success).setDisabled(true);
        } else {
          btn.setEmoji('⬛').setStyle(ButtonStyle.Secondary);
        }
      }
      row.addComponents(btn);
    }
    rows.push(row);
  }

  return rows;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mines')
    .setDescription('Play the thrilling Mines game! Uncover gems and cash out before hitting a mine.')
    .addIntegerOption(opt =>
      opt.setName('bet')
        .setDescription('Amount of coins to bet')
        .setRequired(true)
        .setMinValue(10)
    )
    .addIntegerOption(opt =>
      opt.setName('bombs')
        .setDescription('Number of hidden mines (1 - 8, default: 3)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(8)
    ),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const bet = interaction.options.getInteger('bet');
    const minesCount = interaction.options.getInteger('bombs') || 3;

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

    // Place mines randomly
    const grid = Array(GRID_SIZE).fill('gem');
    const mineIndices = new Set();
    while (mineIndices.size < minesCount) {
      mineIndices.add(Math.floor(Math.random() * GRID_SIZE));
    }
    for (const idx of mineIndices) {
      grid[idx] = 'mine';
    }

    const revealed = new Set();
    const safeTotal = GRID_SIZE - minesCount;
    let currentMultiplier = 1.0;
    let currentPayout = bet;
    let nextMultiplier = calculateMultiplier(minesCount, 1);

    const buildEmbed = (status = 'playing', message = '') => {
      let color = COLORS.PRIMARY || 0x5865F2;
      let title = '💣 Mines Field';

      if (status === 'won') {
        color = COLORS.SUCCESS || 0x57F287;
        title = '🎉 Mines: Cashed Out!';
      } else if (status === 'lost') {
        color = COLORS.ERROR || 0xED4245;
        title = '💥 BOOM! You Hit a Mine!';
      }

      const embed = createEmbed({
        title,
        color,
        description: message || `Pick a tile to find hidden **Gems** 💎 and avoid the **Mines** 💣!\nCash out at any time to secure your winnings.`,
        fields: [
          { name: '💵 Bet', value: `\`$${bet.toLocaleString()}\``, inline: true },
          { name: '💣 Mines', value: `\`${minesCount} / ${GRID_SIZE}\``, inline: true },
          { name: '💎 Gems Found', value: `\`${revealed.size} / ${safeTotal}\``, inline: true },
          { name: '📈 Multiplier', value: `\`${currentMultiplier.toFixed(2)}x\``, inline: true },
          { name: '💰 Current Payout', value: `\`$${currentPayout.toLocaleString()}\``, inline: true },
          { name: '✨ Next Gem', value: `\`${revealed.size < safeTotal ? nextMultiplier.toFixed(2) + 'x' : 'MAX'}\``, inline: true }
        ],
        footer: { text: status === 'playing' ? 'Click a tile or click Cash Out • Expires in 90s' : 'Game Finished' }
      });

      return embed;
    };

    const buildControlRow = (disabled = false) => {
      const controlRow = new ActionRowBuilder();
      const cashoutBtn = new ButtonBuilder()
        .setCustomId('mine_cashout')
        .setLabel(`Cash Out ($${currentPayout.toLocaleString()})`)
        .setStyle(ButtonStyle.Success)
        .setEmoji('💰')
        .setDisabled(disabled || revealed.size === 0);

      controlRow.addComponents(cashoutBtn);
      return controlRow;
    };

    const gridRows = createGridButtons(grid, revealed, false);
    const initialRows = [...gridRows, buildControlRow(false)];

    const response = await interaction.reply({
      embeds: [buildEmbed('playing')],
      components: initialRows,
      fetchReply: true
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 90_000
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== userId) {
        return i.reply({ content: "❌ This is not your game of Mines!", ephemeral: true });
      }

      if (i.customId === 'mine_cashout') {
        collector.stop('cashout');
        return;
      }

      if (i.customId.startsWith('mine_tile_')) {
        const tileIdx = parseInt(i.customId.replace('mine_tile_', ''), 10);
        if (revealed.has(tileIdx)) {
          return i.deferUpdate();
        }

        if (grid[tileIdx] === 'mine') {
          // Exploded!
          collector.stop(`exploded_${tileIdx}`);
          return;
        }

        // Safe gem found!
        revealed.add(tileIdx);
        currentMultiplier = calculateMultiplier(minesCount, revealed.size);
        currentPayout = Math.floor(bet * currentMultiplier);
        nextMultiplier = calculateMultiplier(minesCount, revealed.size + 1);

        // Check if all safe gems found
        if (revealed.size >= safeTotal) {
          collector.stop('cleared');
          return;
        }

        const newGridRows = createGridButtons(grid, revealed, false);
        const newComponents = [...newGridRows, buildControlRow(false)];

        await i.update({
          embeds: [buildEmbed('playing', `✨ Found a **Gem**! Multiplier is now **${currentMultiplier.toFixed(2)}x**!\nUncover more or Cash Out now.`)],
          components: newComponents
        }).catch(() => {});
      }
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'cashout' || reason === 'cleared') {
        const profit = currentPayout - bet;
        db.addBalance(guildId, userId, currentPayout);
        db.addXP(guildId, userId, Math.min(100, Math.floor(currentPayout / 100) + 10));

        const endGridRows = createGridButtons(grid, revealed, true, -1, true);
        const msg = reason === 'cleared'
          ? `🏆 **JACKPOT FIELD CLEARED!** You found all **${safeTotal}** gems!\nWon **$${currentPayout.toLocaleString()}** (Profit: **+$${profit.toLocaleString()}**)!`
          : `🎉 **Successfully cashed out!**\nYou banked **$${currentPayout.toLocaleString()}** coins at **${currentMultiplier.toFixed(2)}x** (Profit: **+$${profit.toLocaleString()}**)!`;

        await interaction.editReply({
          embeds: [buildEmbed('won', msg)],
          components: endGridRows
        }).catch(() => {});
      } else if (reason.startsWith('exploded_')) {
        const explodedIndex = parseInt(reason.split('_')[1], 10);
        const endGridRows = createGridButtons(grid, revealed, true, explodedIndex);

        await interaction.editReply({
          embeds: [buildEmbed('lost', `💥 **BOOM!** You stepped on a hidden mine at tile **#${explodedIndex + 1}**!\nYou lost your bet of **$${bet.toLocaleString()}** coins. Better luck next time!` + (revealed.size > 0 ? `\n*(You made it to ${currentMultiplier.toFixed(2)}x before detonating)*` : ''))],
          components: endGridRows
        }).catch(() => {});
      } else {
        // Timeout
        if (revealed.size > 0) {
          // Auto cashout on timeout
          const profit = currentPayout - bet;
          db.addBalance(guildId, userId, currentPayout);
          const endGridRows = createGridButtons(grid, revealed, true, -1, true);

          await interaction.editReply({
            embeds: [buildEmbed('won', `⏰ **Game Timed Out!** Auto-cashed out at **${currentMultiplier.toFixed(2)}x**.\nYou banked **$${currentPayout.toLocaleString()}** coins!`)],
            components: endGridRows
          }).catch(() => {});
        } else {
          // No tiles revealed, refund
          db.addBalance(guildId, userId, bet);
          const endGridRows = createGridButtons(grid, revealed, true);

          await interaction.editReply({
            embeds: [buildEmbed('lost', `⏰ **Game Timed Out!** Your bet of **$${bet.toLocaleString()}** was refunded.`)],
            components: endGridRows
          }).catch(() => {});
        }
      }
    });
  }
};
