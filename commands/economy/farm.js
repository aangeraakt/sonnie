const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { ITEMS, RARITY_COLORS } = require('../../utils/economyItems');
const { awardEarnings } = require('../../utils/earnings');
const { grantXp } = require('../../utils/levelingManager');

const CROP_TABLE = [
  { id: 'wheat', weight: 40, minCoins: 60, maxCoins: 120, xp: 15 },
  { id: 'carrots', weight: 30, minCoins: 100, maxCoins: 180, xp: 20 },
  { id: 'potatoes', weight: 25, minCoins: 140, maxCoins: 220, xp: 25 },
  { id: 'strawberries', weight: 15, minCoins: 220, maxCoins: 350, xp: 35 },
  { id: 'pumpkin', weight: 8, minCoins: 450, maxCoins: 700, xp: 50 },
  { id: 'golden_apple', weight: 2, minCoins: 1200, maxCoins: 2000, xp: 90 }
];

function pickCrop(hasWateringCan) {
  const table = hasWateringCan
    ? CROP_TABLE.map(c => c.id === 'golden_apple' || c.id === 'pumpkin' ? { ...c, weight: c.weight * 2 } : c)
    : CROP_TABLE;
  const total = table.reduce((sum, item) => sum + item.weight, 0);
  let rand = Math.random() * total;
  for (const entry of table) {
    if (rand <= entry.weight) return entry;
    rand -= entry.weight;
  }
  return table[0];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('farm')
    .setDescription('Harvest crops from your farm to earn coins, produce, and XP (90s cooldown)'),

  async execute(interaction) {
    const { guild, user, member } = interaction;
    const lastFarm = db.getCooldown(guild.id, user.id, 'farm');
    const COOLDOWN_MS = 90 * 1000;
    const now = Date.now();

    if (now - lastFarm < COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((COOLDOWN_MS - (now - lastFarm)) / 1000);
      return interaction.reply({
        embeds: [errorEmbed('Farm Resting', `Your crops need time to grow! Return in **${remainingSeconds}s** to harvest again.`)],
        flags: 64
      });
    }

    db.setCooldown(guild.id, user.id, 'farm', now);

    const hasWateringCan = db.getItemCount(guild.id, user.id, 'watering_can') > 0;
    const picked = pickCrop(hasWateringCan);
    const cropItem = ITEMS[picked.id];

    let baseCoins = Math.floor(Math.random() * (picked.maxCoins - picked.minCoins + 1)) + picked.minCoins;
    if (hasWateringCan) baseCoins = Math.round(baseCoins * 1.3); // 30% watering can bonus

    const earnedCoins = awardEarnings(guild.id, user.id, baseCoins, 'gather');
    db.addItem(guild.id, user.id, cropItem.id, 1);
    const ownedCount = db.getItemCount(guild.id, user.id, cropItem.id);

    // Grant XP
    let xpAwarded = picked.xp;
    const xpResult = await grantXp(member, xpAwarded, { channel: interaction.channel, source: 'farm' });
    const booster = db.getXpBooster(guild.id, user.id);
    const boosterTag = booster ? ` (${booster.multiplier}x Booster Active!)` : '';

    const embed = createEmbed({
      title: '🌾 Farm Harvest Complete',
      description: `You tended your fields and harvested **${cropItem.emoji} ${cropItem.name}**!${hasWateringCan ? '\n🚿 *Watering Can applied +30% yield boost!*' : ''}\n\n💰 **Coins Earned:** +$${earnedCoins.toLocaleString()}\n✨ **XP Gained:** +${xpAwarded} XP${boosterTag}\n📦 **Inventory:** Added 1x ${cropItem.name} (Total: ${ownedCount}x)\n🏷️ **Crop Value:** $${cropItem.sellPrice.toLocaleString()} coins`,
      color: RARITY_COLORS[cropItem.rarity] || 0x2ECC71,
      footerText: 'Sell crops with /sell or /sellall • Reset cooldowns with /use energy_drink'
    });

    return interaction.reply({ embeds: [embed] });
  }
};
