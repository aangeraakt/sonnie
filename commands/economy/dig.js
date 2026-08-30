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

    const embed = createEmbed({
      title: '🏺 Dig',
      description: `You unearthed **${caughtItem.emoji} ${caughtItem.name}**!\n\n**Rarity:** \`${caughtItem.rarity}\`\n**Value:** $${caughtItem.sellPrice.toLocaleString()}\n**Owned:** ${ownedCount}x`,
      color: RARITY_COLORS[caughtItem.rarity] || 0xE67E22,
      footerText: 'Sell loot with /sell or /sellall'
    });

    return interaction.reply({ embeds: [embed] });
  }
};
