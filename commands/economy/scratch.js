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

const TIERS = {
  bronze: { name: 'Bronze Ticket', cost: 100, emoji: '🥉' },
  silver: { name: 'Silver Ticket', cost: 500, emoji: '🥈' },
  gold: { name: 'Gold Ticket', cost: 2500, emoji: '🥇' },
  diamond: { name: 'Diamond VIP Ticket', cost: 10000, emoji: '💎' }
};

const SYMBOLS = [
  { emoji: '7️⃣', name: 'Lucky 7', mult: 100, weight: 2, isJackpot: true },
  { emoji: '💎', name: 'Diamond', mult: 50, weight: 4 },
  { emoji: '👑', name: 'Crown', mult: 25, weight: 8 },
  { emoji: '🔔', name: 'Bell', mult: 10, weight: 14 },
  { emoji: '🍇', name: 'Grapes', mult: 5, weight: 22 },
  { emoji: '🍋', name: 'Lemon', mult: 3, weight: 30 },
  { emoji: '🍒', name: 'Cherry', mult: 2, weight: 38 },
  { emoji: '🎁', name: 'Mystery Box', mult: 5, weight: 10, itemReward: 'mystery_box' },
  { emoji: '🍀', name: 'Lucky Clover', mult: 5, weight: 12, itemReward: 'lucky_clover' }
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

function generateScratchGrid() {
  // ~35% chance to force a winning set of 3 matching symbols
  const willWin = Math.random() < 0.38;
  const grid = [];

  if (willWin) {
    const winSymbol = getRandomSymbol();
    // Pick 3 random positions for the match
    const matchIndices = new Set();
    while (matchIndices.size < 3) {
      matchIndices.add(Math.floor(Math.random() * 9));
    }
    for (let i = 0; i < 9; i++) {
      if (matchIndices.has(i)) {
        grid.push(winSymbol);
      } else {
        grid.push(getRandomSymbol());
      }
    }
  } else {
    // Fill with random symbols ensuring no 3-match
    for (let i = 0; i < 9; i++) {
      grid.push(getRandomSymbol());
    }
  }
  return grid;
}

function checkWinningMatches(grid) {
  const counts = {};
  for (const sym of grid) {
    counts[sym.name] = (counts[sym.name] || 0) + 1;
  }

  let bestMatch = null;
  for (const sym of SYMBOLS) {
    if ((counts[sym.name] || 0) >= 3) {
      if (!bestMatch || sym.mult > bestMatch.mult) {
        bestMatch = sym;
      }
    }
  }
  return bestMatch;
}

function createScratchRows(grid, revealed, gameOver) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c;
      const isRev = revealed.has(idx) || gameOver;
      const sym = grid[idx];

      const btn = new ButtonBuilder()
        .setCustomId(`scratch_tile_${idx}`)
        .setDisabled(gameOver || revealed.has(idx));

      if (isRev) {
        btn.setEmoji(sym.emoji).setStyle(ButtonStyle.Secondary);
      } else {
        btn.setEmoji('❔').setStyle(ButtonStyle.Primary);
      }
      row.addComponents(btn);
    }
    rows.push(row);
  }

  if (!gameOver) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('scratch_all')
          .setLabel('Scratch All')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✨')
      )
    );
  }

  return rows;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('scratch')
    .setDescription('Scratch off a lottery ticket to reveal 3 matching symbols for big multipliers!')
    .addStringOption(opt =>
      opt.setName('tier')
        .setDescription('Ticket Tier (Bronze $100, Silver $500, Gold $2,500, Diamond $10,000)')
        .setRequired(false)
        .addChoices(
          { name: '🥉 Bronze ($100)', value: 'bronze' },
          { name: '🥈 Silver ($500)', value: 'silver' },
          { name: '🥇 Gold ($2,500)', value: 'gold' },
          { name: '💎 Diamond VIP ($10,000)', value: 'diamond' }
        )
    ),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const tierKey = interaction.options.getString('tier') || 'bronze';
    const tier = TIERS[tierKey];

    const user = db.getUser(guildId, userId);
    if (user.balance < tier.cost) {
      return interaction.reply({
        embeds: [errorEmbed('Insufficient Funds', `You need **$${tier.cost.toLocaleString()}** coins for a **${tier.name}**, but only have **$${user.balance.toLocaleString()}** in your wallet! 👛`)],
        ephemeral: true
      });
    }

    // Deduct ticket cost immediately
    db.addBalance(guildId, userId, -tier.cost);
    trackGamble(guildId, userId);

    const grid = generateScratchGrid();
    const revealed = new Set();

    const buildEmbed = (status = 'scratching', note = '') => {
      let color = COLORS.PRIMARY || 0x5865F2;
      let title = `🎟️ ${tier.emoji} ${tier.name} Scratchcard`;

      if (status === 'won') {
        color = COLORS.SUCCESS || 0x57F287;
        title = `🎉 ${tier.name}: WINNER!`;
      } else if (status === 'lost') {
        color = COLORS.ERROR || 0xED4245;
        title = `💨 ${tier.name}: No Match!`;
      }

      return createEmbed({
        title,
        color,
        description: `${note ? note + '\n\n' : ''}Scratch off tiles to reveal symbols! Match **3 identical symbols** anywhere on the card to win!\n\n**Paytable (3x Match):**\n` +
          `7️⃣ **100x** | 💎 **50x** | 👑 **25x** | 🔔 **10x** | 🍇 **5x** | 🍋 **3x** | 🍒 **2x**`,
        fields: [
          { name: '🎫 Ticket Cost', value: `\`$${tier.cost.toLocaleString()}\``, inline: true },
          { name: '🔍 Scratched', value: `\`${revealed.size} / 9\``, inline: true },
          { name: '🏆 Top Jackpot', value: `\`$${(tier.cost * 100).toLocaleString()}\``, inline: true }
        ],
        footer: { text: status === 'scratching' ? 'Click tiles to scratch or hit Scratch All • 60s timeout' : 'Scratchcard Finished' }
      });
    };

    const initialRows = createScratchRows(grid, revealed, false);
    const response = await interaction.reply({
      embeds: [buildEmbed('scratching')],
      components: initialRows,
      fetchReply: true
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60_000
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== userId) {
        return i.reply({ content: "❌ This is not your scratchcard!", ephemeral: true });
      }

      if (i.customId === 'scratch_all') {
        for (let idx = 0; idx < 9; idx++) revealed.add(idx);
        collector.stop('done');
        return;
      }

      if (i.customId.startsWith('scratch_tile_')) {
        const idx = parseInt(i.customId.replace('scratch_tile_', ''), 10);
        revealed.add(idx);

        if (revealed.size >= 9) {
          collector.stop('done');
          return;
        }

        await i.update({
          embeds: [buildEmbed('scratching', `Scratched tile **#${idx + 1}**: ${grid[idx].emoji} **${grid[idx].name}**`)],
          components: createScratchRows(grid, revealed, false)
        }).catch(() => {});
      }
    });

    collector.on('end', async (collected, reason) => {
      // Reveal all tiles on finish
      for (let idx = 0; idx < 9; idx++) revealed.add(idx);

      const winningMatch = checkWinningMatches(grid);

      if (winningMatch) {
        const payout = tier.cost * winningMatch.mult;
        const profit = payout - tier.cost;
        db.addBalance(guildId, userId, payout);
        db.addXP(guildId, userId, Math.min(150, Math.floor(payout / 100) + 15));

        let bonusText = '';
        if (winningMatch.itemReward) {
          db.addItem(guildId, userId, winningMatch.itemReward, 1);
          bonusText = `\n🎁 **Bonus Item Awarded:** Received **1x ${winningMatch.name}** in your inventory!`;
        }

        const msg = winningMatch.isJackpot
          ? `🌟 **JACKPOT! 3x ${winningMatch.emoji} ${winningMatch.name}!**\nYou hit the 100x Jackpot and won **$${payout.toLocaleString()}** (Profit: **+$${profit.toLocaleString()}**)!${bonusText}`
          : `🎉 **MATCH FOUND! 3x ${winningMatch.emoji} ${winningMatch.name}!**\nMultiplier: **${winningMatch.mult}x** | Won **$${payout.toLocaleString()}** (Profit: **+$${profit.toLocaleString()}**)!${bonusText}`;

        await interaction.editReply({
          embeds: [buildEmbed('won', msg)],
          components: createScratchRows(grid, revealed, true)
        }).catch(() => {});
      } else {
        await interaction.editReply({
          embeds: [buildEmbed('lost', `💨 **No 3-symbol match found on this card.**\nBetter luck on your next ticket!`)],
          components: createScratchRows(grid, revealed, true)
        }).catch(() => {});
      }
    });
  }
};
