const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { ITEMS, RARITY_COLORS } = require('../../utils/economyItems');

const DIG_TABLE = [
  { id: 'ancient_relic', weight: 2 },
  { id: 'diamond_ring', weight: 6 },
  { id: 'golden_goblet', weight: 14 },
  { id: 'fossil', weight: 24 },
  { id: 'old_coin', weight: 45 },
  { id: 'rusty_nail', weight: 40 }
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
    .setName('dig')
    .setDescription('Dig up relics and buried treasure'),

  async execute(interaction) {
    const { guild, user } = interaction;
    const lastDig = db.getCooldown(guild.id, user.id, 'dig');
    const COOLDOWN_MS = 50 * 1000;
    const now = Date.now();

    if (now - lastDig < COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((COOLDOWN_MS - (now - lastDig)) / 1000);
      return interaction.reply({
        embeds: [errorEmbed('Digging Cooldown', `Wait **${remainingSeconds}s** before digging again.`)],
        flags: 64
      });
    }

    db.setCooldown(guild.id, user.id, 'dig', now);
    const caughtItem = ITEMS[pickLoot(DIG_TABLE, 'old_coin')];
    db.addItem(guild.id, user.id, caughtItem.id, 1);
    const ownedCount = db.getItemCount(guild.id, user.id, caughtItem.id);

    const bonusCoins = Math.floor(Math.random() * 80) + 50;
    const { awardEarnings } = require('../../utils/earnings');
    const { grantXp } = require('../../utils/levelingManager');
    const earned = awardEarnings(guild.id, user.id, bonusCoins, 'gather');

    const rarityXp = { Junk: 10, Common: 22, Uncommon: 38, Rare: 65, Epic: 110, LEGENDARY: 220 };
    const xpGain = rarityXp[caughtItem.rarity] || 30;
    await grantXp(interaction.member, xpGain, { channel: interaction.channel, source: 'dig' });

    const booster = db.getXpBooster(guild.id, user.id);
    const boosterTag = booster ? ` (${booster.multiplier}x Booster Active!)` : '';

    const embed = createEmbed({
      title: '🏺 Ancient Artifact Excavated',
      description: `You unearthed **${caughtItem.emoji} ${caughtItem.name}**!\n\n💰 **Coins Earned:** +$${earned.toLocaleString()}\n✨ **XP Gained:** +${xpGain} XP${boosterTag}\n🏷️ **Artifact Value:** $${caughtItem.sellPrice.toLocaleString()} (\`${caughtItem.rarity}\`)\n📦 **Owned:** ${ownedCount}x`,
      color: RARITY_COLORS[caughtItem.rarity] || 0xE67E22,
      footerText: 'Sell relics with /sell or /sellall'
    });

    return interaction.reply({ embeds: [embed] });
  }
};
