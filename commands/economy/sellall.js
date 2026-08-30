const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { ITEMS } = require('../../utils/economyItems');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { awardEarnings, trackGamble } = require('../../utils/earnings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sellall')
    .setDescription('Sell all your collected fish, game, minerals, and relics for maximum coins')
    .addStringOption(opt =>
      opt.setName('category')
        .setDescription('Specific category to sell all items from')
        .setRequired(false)
        .addChoices(
          { name: 'All Loot (Fish, Game, Minerals, Relics)', value: 'all' },
          { name: '🐟 Fish Only', value: 'fish' },
          { name: '🏹 Hunted Game Only', value: 'game' },
          { name: '⛏️ Minerals & Ores Only', value: 'minerals' },
          { name: '🏺 Buried Relics Only', value: 'relics' }
        )
    ),

  async execute(interaction) {
    const { guild, user } = interaction;
    const chosenCategory = interaction.options.getString('category') || 'all';

    const inv = db.getInventory(guild.id, user.id);
    const itemIds = Object.keys(inv).filter(id => inv[id] > 0);

    if (itemIds.length === 0) {
      return interaction.reply({
        embeds: [errorEmbed('Inventory Empty', 'You have no items in your inventory to sell!\nGo fishing (`/fish`), hunting (`/hunt`), mining (`/mine`), or digging (`/dig`) to collect loot.')],
        flags: 64
      });
    }

    let totalCoins = 0;
    let totalItemsSold = 0;
    const soldBreakdown = [];

    for (const id of itemIds) {
      const item = ITEMS[id];
      if (!item || !item.sellPrice) continue;

      // Do NOT sell tools or consumables automatically in sellall unless explicitly specified
      if (item.category === 'tools' || item.category === 'consumables') continue;

      if (chosenCategory !== 'all' && item.category !== chosenCategory) continue;

      const count = inv[id];
      const payout = item.sellPrice * count;
      totalCoins += payout;
      totalItemsSold += count;

      soldBreakdown.push(`${item.emoji} **${item.name}** x${count} ➔ **+$${payout.toLocaleString()}**`);
      db.removeItem(guild.id, user.id, id, count);
    }

    if (totalItemsSold === 0) {
      return interaction.reply({
        embeds: [errorEmbed('No Sellable Loot', `You have no sellable loot in the selected category (**${chosenCategory}**).\nTools and consumables are preserved.`)],
        flags: 64
      });
    }

    awardEarnings(guild.id, user.id, totalCoins, 'gather');
    const updatedUser = db.getUser(guild.id, user.id);

    const embed = createEmbed({
      title: '📦 Bulk Merchant Sale Complete! 💰',
      description: `Sold **${totalItemsSold}** items for a grand total of **+$${totalCoins.toLocaleString()}** coins!\n\n${soldBreakdown.slice(0, 15).join('\n')}${soldBreakdown.length > 15 ? `\n*...and ${soldBreakdown.length - 15} more items*` : ''}\n\n👛 **New Balance:** **$${updatedUser.balance.toLocaleString()}** coins`,
      color: 0xF1C40F,
      footerText: 'Sonnies Economy • Bulk Sell'
    });

    return interaction.reply({ embeds: [embed] });
  }
};
