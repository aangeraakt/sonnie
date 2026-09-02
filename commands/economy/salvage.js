const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { ITEMS, RARITY_COLORS } = require('../../utils/economyItems');
const { awardEarnings } = require('../../utils/earnings');
const { grantXp } = require('../../utils/levelingManager');

const SALVAGE_TABLE = [
  { id: 'scrap_metal', weight: 45, minCoins: 40, maxCoins: 100, xp: 12 },
  { id: 'copper_wire', weight: 30, minCoins: 90, maxCoins: 180, xp: 20 },
  { id: 'circuit_board', weight: 15, minCoins: 200, maxCoins: 380, xp: 35 },
  { id: 'titanium_alloy', weight: 8, minCoins: 450, maxCoins: 800, xp: 55 },
  { id: 'quantum_core', weight: 2, minCoins: 1500, maxCoins: 3000, xp: 100 }
];

function pickSalvage(hasTorch) {
  const table = hasTorch
    ? SALVAGE_TABLE.map(s => s.id === 'quantum_core' || s.id === 'titanium_alloy' ? { ...s, weight: s.weight * 2 } : s)
    : SALVAGE_TABLE;
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
    .setName('salvage')
    .setDescription('Scrap discarded machinery and tech for parts, coins, and XP (45s cooldown)'),

  async execute(interaction) {
    const { guild, user, member } = interaction;
    const lastSalvage = db.getCooldown(guild.id, user.id, 'salvage');
    const COOLDOWN_MS = 45 * 1000;
    const now = Date.now();

    if (now - lastSalvage < COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((COOLDOWN_MS - (now - lastSalvage)) / 1000);
      return interaction.reply({
        embeds: [errorEmbed('Salvage Yard Busy', `You need to cool your tools down! Return to the scrap yard in **${remainingSeconds}s**.`)],
        flags: 64
      });
    }

    db.setCooldown(guild.id, user.id, 'salvage', now);

    const hasTorch = db.getItemCount(guild.id, user.id, 'welding_torch') > 0;
    const picked = pickSalvage(hasTorch);
    const item = ITEMS[picked.id];

    let baseCoins = Math.floor(Math.random() * (picked.maxCoins - picked.minCoins + 1)) + picked.minCoins;
    if (hasTorch) baseCoins = Math.round(baseCoins * 1.25);

    const earnedCoins = awardEarnings(guild.id, user.id, baseCoins, 'gather');
    db.addItem(guild.id, user.id, item.id, 1);
    const ownedCount = db.getItemCount(guild.id, user.id, item.id);

    await grantXp(member, picked.xp, { channel: interaction.channel, source: 'salvage' });
    const booster = db.getXpBooster(guild.id, user.id);
    const boosterTag = booster ? ` (${booster.multiplier}x Booster Active!)` : '';

    const embed = createEmbed({
      title: '🔩 Scrap & Tech Salvage',
      description: `You cut through derelict wreckage and salvaged **${item.emoji} ${item.name}**!${hasTorch ? '\n🔦 *Industrial Torch applied +25% payout bonus!*' : ''}\n\n💰 **Coins Earned:** +$${earnedCoins.toLocaleString()}\n✨ **XP Gained:** +${picked.xp} XP${boosterTag}\n📦 **Inventory:** Added 1x ${item.name} (Total: ${ownedCount}x)\n🏷️ **Scrap Value:** $${item.sellPrice.toLocaleString()} coins`,
      color: RARITY_COLORS[item.rarity] || 0x95A5A6,
      footerText: 'Sell scrap with /sell or /sellall • Craft advanced goods with /craft'
    });

    return interaction.reply({ embeds: [embed] });
  }
};
