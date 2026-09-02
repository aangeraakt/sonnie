const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { ITEMS, RARITY_COLORS } = require('../../utils/economyItems');

const FISH_TABLE = [
  { id: 'treasure_chest', weight: 3 },
  { id: 'shark', weight: 8 },
  { id: 'electric_eel', weight: 14 },
  { id: 'squid', weight: 18 },
  { id: 'sea_bass', weight: 25 },
  { id: 'salmon', weight: 32 },
  { id: 'trout', weight: 45 },
  { id: 'goldfish', weight: 55 },
  { id: 'seaweed', weight: 35 },
  { id: 'boot', weight: 30 }
];

function pickLoot(table, fallbackId) {
  const totalWeight = table.reduce((sum, item) => sum + item.weight, 0);
  let randomVal = Math.random() * totalWeight;
  for (const entry of table) {
    if (randomVal <= entry.weight) return entry.id;
    randomVal -= entry.weight;
  }
  return fallbackId;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fish')
    .setDescription('Fish and store your catch in your inventory'),

  async execute(interaction) {
    const { guild, user } = interaction;
    const lastFish = db.getCooldown(guild.id, user.id, 'fish');
    const COOLDOWN_MS = 45 * 1000;
    const now = Date.now();

    if (now - lastFish < COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((COOLDOWN_MS - (now - lastFish)) / 1000);
      return interaction.reply({
        embeds: [errorEmbed('Fishing Cooldown', `Wait **${remainingSeconds}s** before fishing again.`)],
        flags: 64
      });
    }

    db.setCooldown(guild.id, user.id, 'fish', now);
    const caughtItem = ITEMS[pickLoot(FISH_TABLE, 'goldfish')];
    db.addItem(guild.id, user.id, caughtItem.id, 1);
    const ownedCount = db.getItemCount(guild.id, user.id, caughtItem.id);

    const bonusCoins = Math.floor(Math.random() * 60) + 40;
    const { awardEarnings } = require('../../utils/earnings');
    const { grantXp } = require('../../utils/levelingManager');
    const earned = awardEarnings(guild.id, user.id, bonusCoins, 'gather');

    const rarityXp = { Junk: 10, Common: 18, Uncommon: 28, Rare: 45, Epic: 75, LEGENDARY: 150 };
    const xpGain = rarityXp[caughtItem.rarity] || 20;
    await grantXp(interaction.member, xpGain, { channel: interaction.channel, source: 'fish' });

    const booster = db.getXpBooster(guild.id, user.id);
    const boosterTag = booster ? ` (${booster.multiplier}x Booster Active!)` : '';

    const embed = createEmbed({
      title: '🎣 Fish Reeled In',
      description: `You cast your line and reeled in **${caughtItem.emoji} ${caughtItem.name}**!\n\n💰 **Coins Earned:** +$${earned.toLocaleString()}\n✨ **XP Gained:** +${xpGain} XP${boosterTag}\n🏷️ **Item Value:** $${caughtItem.sellPrice.toLocaleString()} (\`${caughtItem.rarity}\`)\n📦 **Owned:** ${ownedCount}x`,
      color: RARITY_COLORS[caughtItem.rarity] || 0x3498DB,
      footerText: 'Sell loot with /sell or /sellall'
    });

    return interaction.reply({ embeds: [embed] });
  }
};
