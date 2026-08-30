const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed, COLORS } = require('../../utils/embedBuilder');
const { trackGamble } = require('../../utils/earnings');

const SEGMENTS = [
  { label: '🌟 JACKPOT (10x)', mult: 10, weight: 3, isJackpot: true },
  { label: '💎 MEGA WIN (5x)', mult: 5, weight: 6 },
  { label: '💰 TRIPLE (3x)', mult: 3, weight: 12 },
  { label: '💵 DOUBLE (2x)', mult: 2, weight: 20 },
  { label: '🪙 PROFIT (1.5x)', mult: 1.5, weight: 22 },
  { label: '🔄 REFUND (1x)', mult: 1.0, weight: 16 },
  { label: '🎁 MYSTERY BOX', mult: 1.0, weight: 6, item: 'mystery_box', itemName: 'Golden Mystery Box' },
  { label: '🍀 LUCKY CLOVER', mult: 1.0, weight: 6, item: 'lucky_clover', itemName: 'Four-Leaf Clover' },
  { label: '🛡️ PADLOCK', mult: 1.0, weight: 5, item: 'padlock', itemName: 'Padlock' },
  { label: '💸 HALF LOSS (0.5x)', mult: 0.5, weight: 12 },
  { label: '💀 BANKRUPT (0x)', mult: 0, weight: 10 }
];

const TOTAL_WEIGHT = SEGMENTS.reduce((sum, s) => sum + s.weight, 0);

function pickSegment() {
  let rand = Math.random() * TOTAL_WEIGHT;
  for (const seg of SEGMENTS) {
    if (rand < seg.weight) return seg;
    rand -= seg.weight;
  }
  return SEGMENTS[SEGMENTS.length - 1];
}

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wheel')
    .setDescription('Spin the Fortune Wheel for huge multipliers, items, or the 10x Jackpot!')
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

    const winningSegment = pickSegment();

    // Initial spinning embed
    const spinEmbed1 = createEmbed({
      title: '🎡 Spinning the Fortune Wheel...',
      color: COLORS.PRIMARY || 0x5865F2,
      description: `\`[ 🌀 10x ➔ 💀 0x ➔ 💎 5x ➔ 🎁 Item ➔ 💰 3x ➔ 💵 2x ➔ 🍀 Item ]\`\n\n*The wheel is spinning at high speed...*`,
      fields: [{ name: '💵 Bet', value: `\`$${bet.toLocaleString()}\``, inline: true }]
    });

    await interaction.reply({ embeds: [spinEmbed1] });

    await sleep(1200);

    const spinEmbed2 = createEmbed({
      title: '🎡 The Wheel is Slowing Down...',
      color: COLORS.PRIMARY || 0x5865F2,
      description: `\`[ ... ➔ 💵 2x ➔ 🔻 ❓ 🔻 ➔ 💎 5x ➔ ... ]\`\n\n*The wheel clicks past the pins and settles...*`,
      fields: [{ name: '💵 Bet', value: `\`$${bet.toLocaleString()}\``, inline: true }]
    });

    await interaction.editReply({ embeds: [spinEmbed2] }).catch(() => {});

    await sleep(1300);

    // Calculate result
    const payout = Math.floor(bet * winningSegment.mult);
    const profit = payout - bet;

    let finalColor = COLORS.PRIMARY || 0x5865F2;
    let finalTitle = '🎡 Fortune Wheel Result';
    let resultText = '';

    if (winningSegment.item) {
      db.addItem(guildId, userId, winningSegment.item, 1);
      if (payout > 0) db.addBalance(guildId, userId, payout);
      finalColor = COLORS.SUCCESS || 0x57F287;
      finalTitle = '🎁 Fortune Wheel: ITEM WON!';
      resultText = `🎉 The wheel landed on **${winningSegment.label}**!\n\nYour bet of **$${bet.toLocaleString()}** was returned, and you received **1x ${winningSegment.itemName}** in your inventory!`;
    } else if (winningSegment.isJackpot) {
      db.addBalance(guildId, userId, payout);
      db.addXP(guildId, userId, 150);
      finalColor = COLORS.GOLD || 0xF1C40F;
      finalTitle = '🌟 JACKPOT WINNER!';
      resultText = `🏆 **MEGA JACKPOT!** The wheel stopped right on **${winningSegment.label}**!\nYou won a massive **$${payout.toLocaleString()}** coins (**+$${profit.toLocaleString()}** profit)!`;
    } else if (payout > bet) {
      db.addBalance(guildId, userId, payout);
      db.addXP(guildId, userId, Math.min(100, Math.floor(payout / 100) + 10));
      finalColor = COLORS.SUCCESS || 0x57F287;
      finalTitle = '🎉 Fortune Wheel: Big Win!';
      resultText = `The wheel landed on **${winningSegment.label}**!\nYou won **$${payout.toLocaleString()}** coins (**+$${profit.toLocaleString()}** profit)!`;
    } else if (payout === bet) {
      db.addBalance(guildId, userId, payout);
      finalColor = COLORS.INFO || 0x3498DB;
      finalTitle = '🔄 Fortune Wheel: Push / Refund';
      resultText = `The wheel landed on **${winningSegment.label}**.\nYour bet of **$${bet.toLocaleString()}** coins was refunded.`;
    } else if (payout > 0) {
      db.addBalance(guildId, userId, payout);
      finalColor = COLORS.WARNING || 0xFEE75C;
      finalTitle = '💸 Fortune Wheel: Partial Return';
      resultText = `The wheel landed on **${winningSegment.label}**.\nYou got back **$${payout.toLocaleString()}** coins (**-$${Math.abs(profit).toLocaleString()}** loss).`;
    } else {
      finalColor = COLORS.ERROR || 0xED4245;
      finalTitle = '💀 Fortune Wheel: Bankrupt!';
      resultText = `The wheel stopped on **${winningSegment.label}**.\nYou lost your entire bet of **$${bet.toLocaleString()}** coins.`;
    }

    const finalEmbed = createEmbed({
      title: finalTitle,
      color: finalColor,
      description: `\`🔻 🔻 🔻\`\n### **[ ${winningSegment.label} ]**\n\`🔺 🔺 🔺\`\n\n${resultText}`,
      fields: [
        { name: '💵 Bet', value: `\`$${bet.toLocaleString()}\``, inline: true },
        { name: '💰 Payout', value: `\`$${payout.toLocaleString()}\``, inline: true },
        { name: '👛 Wallet', value: `\`$${db.getUser(guildId, userId).balance.toLocaleString()}\``, inline: true }
      ]
    });

    await interaction.editReply({ embeds: [finalEmbed] }).catch(() => {});
  }
};
