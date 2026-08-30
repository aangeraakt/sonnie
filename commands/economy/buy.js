const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { getItem } = require('../../utils/economyItems');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { trackQuest } = require('../../utils/questSystem');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Buy an item from the shop')
    .addStringOption(opt =>
      opt.setName('item')
        .setDescription('Item ID (e.g. padlock, mystery_box)')
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('quantity')
        .setDescription('Quantity to purchase (default: 1)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(false)
    ),

  async execute(interaction) {
    const { guild, user } = interaction;
    const query = interaction.options.getString('item');
    const quantity = interaction.options.getInteger('quantity') || 1;

    const item = getItem(query);
    if (!item || !item.buyPrice) {
      return interaction.reply({
        embeds: [errorEmbed('Item Not Available', `The item \`${query}\` is not sold in the shop.\nType \`/shop\` to see available items.`)],
        flags: 64
      });
    }

    const totalCost = item.buyPrice * quantity;
    const userProfile = db.getUser(guild.id, user.id);

    if (userProfile.balance < totalCost) {
      return interaction.reply({
        embeds: [errorEmbed('Insufficient Funds', `You need **$${totalCost.toLocaleString()}** coins to buy **${quantity}x ${item.name}**, but you only have **$${userProfile.balance.toLocaleString()}** in your wallet.\nDeposit or work to earn more coins!`)],
        flags: 64
      });
    }

    // Deduct coins and add items to inventory
    db.addBalance(guild.id, user.id, -totalCost);
    trackQuest(guild.id, user.id, 'spend', totalCost);
    db.addItem(guild.id, user.id, item.id, quantity);

    const updatedUser = db.getUser(guild.id, user.id);
    const newCount = db.getItemCount(guild.id, user.id, item.id);

    const embed = successEmbed(
      'Purchase Successful! 🎉',
      `You bought **${quantity}x ${item.emoji} ${item.name}** for **$${totalCost.toLocaleString()}** coins!\n\n🎒 You now own: **${newCount}x ${item.name}**\n👛 Remaining Wallet: **$${updatedUser.balance.toLocaleString()}**`
    );

    return interaction.reply({ embeds: [embed] });
  }
};
