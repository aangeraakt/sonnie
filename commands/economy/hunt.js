const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { ITEMS, RARITY_COLORS } = require('../../utils/economyItems');

const HUNT_TABLE = [
  { id: 'golden_stag', weight: 3 },
  { id: 'bear', weight: 8 },
  { id: 'wolf', weight: 15 },
  { id: 'deer', weight: 22 },
  { id: 'wild_boar', weight: 30 },
  { id: 'fox_pelt', weight: 38 },
  { id: 'duck', weight: 50 },
  { id: 'rabbit', weight: 60 }
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
    .setName('hunt')
    .setDescription('Hunt animals and store them in your inventory'),

  async execute(interaction) {
    const { guild, user } = interaction;
    const lastHunt = db.getCooldown(guild.id, user.id, 'hunt');
    const COOLDOWN_MS = 45 * 1000;
    const now = Date.now();

    if (now - lastHunt < COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((COOLDOWN_MS - (now - lastHunt)) / 1000);
      return interaction.reply({
        embeds: [errorEmbed('Hunting Cooldown', `Wait **${remainingSeconds}s** before hunting again.`)],
        flags: 64
      });
    }

    db.setCooldown(guild.id, user.id, 'hunt', now);
    const caughtItem = ITEMS[pickLoot(HUNT_TABLE, 'rabbit')];
    db.addItem(guild.id, user.id, caughtItem.id, 1);
    const ownedCount = db.getItemCount(guild.id, user.id, caughtItem.id);

    const bonusCoins = Math.floor(Math.random() * 70) + 40;
    const { awardEarnings } = require('../../utils/earnings');
    const { grantXp } = require('../../utils/levelingManager');
    const earned = awardEarnings(guild.id, user.id, bonusCoins, 'gather');

    const rarityXp = { Common: 20, Uncommon: 35, Rare: 60, Epic: 100, LEGENDARY: 200 };
    const xpGain = rarityXp[caughtItem.rarity] || 25;
    await grantXp(interaction.member, xpGain, { channel: interaction.channel, source: 'hunt' });

    const booster = db.getXpBooster(guild.id, user.id);
    const boosterTag = booster ? ` (${booster.multiplier}x Booster Active!)` : '';

    const embed = createEmbed({
      title: '🏹 Hunting Expedition Successful',
      description: `You stalked the wild woods and captured **${caughtItem.emoji} ${caughtItem.name}**!\n\n💰 **Coins Earned:** +$${earned.toLocaleString()}\n✨ **XP Gained:** +${xpGain} XP${boosterTag}\n🏷️ **Trophy Value:** $${caughtItem.sellPrice.toLocaleString()} (\`${caughtItem.rarity}\`)\n📦 **Owned:** ${ownedCount}x`,
      color: RARITY_COLORS[caughtItem.rarity] || 0x2ECC71,
      footerText: 'Sell game with /sell or /sellall'
    });

    return interaction.reply({ embeds: [embed] });
  }
};
