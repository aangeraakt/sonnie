const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { getItem } = require('../../utils/economyItems');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sell')
    .setDescription('Sell fish, game animals, minerals, relics, or tools for coins')
    .addStringOption(opt =>
      opt.setName('item')
        .setDescription('Item ID or name to sell (e.g. salmon, diamond, deer, fossil)')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('quantity')
        .setDescription('Quantity to sell (number or "all")')
        .setRequired(false)
    ),

  async execute(interaction) {
    const { guild, user } = interaction;
    const query = interaction.options.getString('item');
    const rawQty = interaction.options.getString('quantity') || '1';

    const item = getItem(query);
    if (!item) {
      return interaction.reply({
        embeds: [errorEmbed('Unknown Item', `Item \`${query}\` was not recognized.\nUse \`/inventory\` to view your items.`)],
        flags: 64
      });
    }

    if (!item.sellPrice || item.sellPrice <= 0) {
      return interaction.reply({
        embeds: [errorEmbed('Cannot Sell', `**${item.name}** cannot be sold to the merchant.`)],
        flags: 64
      });
    }

    const ownedCount = db.getItemCount(guild.id, user.id, item.id);
    if (ownedCount <= 0) {
      return interaction.reply({
        embeds: [errorEmbed('Item Not in Inventory', `You do not have any **${item.emoji} ${item.name}** in your inventory to sell!`)],
        flags: 64
      });
    }

    let quantityToSell = 1;
    if (rawQty.toLowerCase() === 'all' || rawQty.toLowerCase() === 'max') {
      quantityToSell = ownedCount;
    } else {
      const parsed = parseInt(rawQty, 10);
      if (isNaN(parsed) || parsed <= 0) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid Quantity', 'Please provide a valid number of items to sell, or "all".')],
          flags: 64
        });
      }
      quantityToSell = Math.min(parsed, ownedCount);
    }

    const totalPayout = item.sellPrice * quantityToSell;

    // Remove item and credit coins
    db.removeItem(guild.id, user.id, item.id, quantityToSell);
    const updatedUser = db.addBalance(guild.id, user.id, totalPayout);
    const remaining = db.getItemCount(guild.id, user.id, item.id);

    const embed = successEmbed(
      'Sale Complete! 💰',
      `You sold **${quantityToSell}x ${item.emoji} ${item.name}** for **+$${totalPayout.toLocaleString()}** coins!\n\n🎒 Remaining in Inventory: **${remaining}x**\n👛 New Wallet Balance: **$${updatedUser.balance.toLocaleString()}**`
    );

    return interaction.reply({ embeds: [embed] });
  }
};
