const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { ITEMS, RARITY_COLORS } = require('../../utils/economyItems');

const MINE_TABLE = [
  { id: 'netherite', weight: 2 },
  { id: 'diamond', weight: 6 },
  { id: 'emerald', weight: 12 },
  { id: 'ruby', weight: 16 },
  { id: 'gold_ore', weight: 26 },
  { id: 'iron', weight: 35 },
  { id: 'copper', weight: 48 },
  { id: 'coal', weight: 60 },
  { id: 'stone', weight: 40 }
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
    .setName('mine')
    .setDescription('Mine ores and gemstones'),

  async execute(interaction) {
    const { guild, user } = interaction;
    const lastMine = db.getCooldown(guild.id, user.id, 'mine');
    const COOLDOWN_MS = 50 * 1000;
    const now = Date.now();

    if (now - lastMine < COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((COOLDOWN_MS - (now - lastMine)) / 1000);
      return interaction.reply({
        embeds: [errorEmbed('Mining Cooldown', `Wait **${remainingSeconds}s** before mining again.`)],
        flags: 64
      });
    }

    db.setCooldown(guild.id, user.id, 'mine', now);
    const caughtItem = ITEMS[pickLoot(MINE_TABLE, 'coal')];
    db.addItem(guild.id, user.id, caughtItem.id, 1);
    const ownedCount = db.getItemCount(guild.id, user.id, caughtItem.id);

    const embed = createEmbed({
      title: '⛏️ Mine',
      description: `You found **${caughtItem.emoji} ${caughtItem.name}**!\n\n**Rarity:** \`${caughtItem.rarity}\`\n**Value:** $${caughtItem.sellPrice.toLocaleString()}\n**Owned:** ${ownedCount}x`,
      color: RARITY_COLORS[caughtItem.rarity] || 0x9B59B6,
      footerText: 'Sell loot with /sell or /sellall'
    });

    return interaction.reply({ embeds: [embed] });
  }
};
