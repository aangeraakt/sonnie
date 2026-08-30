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

    const embed = createEmbed({
      title: '🏹 Hunt',
      description: `You caught **${caughtItem.emoji} ${caughtItem.name}**!\n\n**Rarity:** \`${caughtItem.rarity}\`\n**Value:** $${caughtItem.sellPrice.toLocaleString()}\n**Owned:** ${ownedCount}x`,
      color: RARITY_COLORS[caughtItem.rarity] || 0x2ECC71,
      footerText: 'Sell loot with /sell or /sellall'
    });

    return interaction.reply({ embeds: [embed] });
  }
};
