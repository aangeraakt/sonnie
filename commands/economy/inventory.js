const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { ITEMS } = require('../../utils/economyItems');
const { createEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('View your owned tools, collectibles, catches, and net inventory worth')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('User whose inventory you want to view')
        .setRequired(false)
    ),

  async execute(interaction) {
    const { guild } = interaction;
    const targetUser = interaction.options.getUser('user') || interaction.user;

    const inv = db.getInventory(guild.id, targetUser.id);
    const userProfile = db.getUser(guild.id, targetUser.id);

    const itemEntries = Object.entries(inv).filter(([_, count]) => count > 0);

    let totalNetWorth = 0;
    const categorized = {
      tools: [],
      consumables: [],
      fish: [],
      game: [],
      minerals: [],
      relics: []
    };

    for (const [id, count] of itemEntries) {
      const item = ITEMS[id] || { name: id, emoji: '📦', category: 'other', sellPrice: 0 };
      const itemVal = (item.sellPrice || item.buyPrice || 0) * count;
      totalNetWorth += itemVal;

      const line = `${item.emoji} **${item.name}** ×${count} \`($${(item.sellPrice || item.buyPrice || 0).toLocaleString()} ea)\``;
      if (categorized[item.category]) {
        categorized[item.category].push(line);
      } else {
        categorized.tools.push(line);
      }
    }

    const embed = createEmbed({
      title: `🎒 Inventory • ${targetUser.username}`,
      description: `👛 **Wallet:** \`$${(userProfile.balance || 0).toLocaleString()}\` • 🏦 **Bank:** \`$${(userProfile.bank || 0).toLocaleString()}\`\n💎 **Estimated Inventory Value:** \`$${totalNetWorth.toLocaleString()}\` coins`,
      color: 0x3498DB,
      fields: [],
      footerText: 'Sonnies Economy • Use /sell <item> or /sellall to cash in!'
    });

    if (itemEntries.length === 0) {
      embed.addFields({
        name: '📭 Empty Backpack',
        value: 'No items yet. Use `/fish`, `/hunt`, `/mine`, `/dig`, or `/shop`.',
        inline: false
      });
      return interaction.reply({ embeds: [embed] });
    }

    if (categorized.tools.length > 0) {
      embed.addFields({ name: '🛠️ Equipment & Tools', value: categorized.tools.join('\n'), inline: false });
    }
    if (categorized.consumables.length > 0) {
      embed.addFields({ name: '🧪 Consumables & Bait', value: categorized.consumables.join('\n'), inline: false });
    }
    if (categorized.fish.length > 0) {
      embed.addFields({ name: '🐟 Marine Catches', value: categorized.fish.slice(0, 10).join('\n') + (categorized.fish.length > 10 ? `\n*+${categorized.fish.length - 10} more*` : ''), inline: true });
    }
    if (categorized.game.length > 0) {
      embed.addFields({ name: '🏹 Hunted Game', value: categorized.game.slice(0, 10).join('\n') + (categorized.game.length > 10 ? `\n*+${categorized.game.length - 10} more*` : ''), inline: true });
    }
    if (categorized.minerals.length > 0) {
      embed.addFields({ name: '⛏️ Mined Minerals', value: categorized.minerals.slice(0, 10).join('\n') + (categorized.minerals.length > 10 ? `\n*+${categorized.minerals.length - 10} more*` : ''), inline: true });
    }
    if (categorized.relics.length > 0) {
      embed.addFields({ name: '🏺 Ancient Relics', value: categorized.relics.slice(0, 10).join('\n') + (categorized.relics.length > 10 ? `\n*+${categorized.relics.length - 10} more*` : ''), inline: true });
    }

    return interaction.reply({ embeds: [embed] });
  }
};
