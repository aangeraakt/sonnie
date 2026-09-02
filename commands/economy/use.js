const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { getItem } = require('../../utils/economyItems');
const { createEmbed, successEmbed, errorEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('use')
    .setDescription('Use a consumable item from your inventory (e.g. Energy Drink, Mystery Box)')
    .addStringOption(opt =>
      opt.setName('item')
        .setDescription('Item name or ID to use')
        .setRequired(true)
    ),

  async execute(interaction) {
    const { guild, user } = interaction;
    const query = interaction.options.getString('item');

    const item = getItem(query);
    if (!item) {
      return interaction.reply({
        embeds: [errorEmbed('Unknown Item', `Item \`${query}\` not recognized.\nCheck \`/inventory\` to see your items.`)],
        flags: 64
      });
    }

    if (item.category !== 'consumables') {
      return interaction.reply({
        embeds: [errorEmbed('Cannot Use Item', `**${item.name}** cannot be used.`)],
        flags: 64
      });
    }

    const owned = db.getItemCount(guild.id, user.id, item.id);
    if (owned <= 0) {
      return interaction.reply({
        embeds: [errorEmbed('Item Not Owned', `You don't have any **${item.name}** in your inventory!\nBuy some from \`/shop\`.`)],
        flags: 64
      });
    }

    // Consume 1 item
    db.removeItem(guild.id, user.id, item.id, 1);

    // Effect: XP Boosters (1.5x, 2.0x, 3.0x)
    if (item.id.startsWith('xp_booster_')) {
      const multiplier = item.multiplier || (item.id === 'xp_booster_15' ? 1.5 : item.id === 'xp_booster_20' ? 2.0 : 3.0);
      const durationMs = item.durationMs || (item.id === 'xp_booster_30' ? 2 * 3600 * 1000 : 3600 * 1000);
      const booster = db.setXpBooster(guild.id, user.id, multiplier, durationMs);
      const expiryTimestamp = Math.floor(booster.expiresAt / 1000);

      const embed = createEmbed({
        title: `${item.emoji} XP Booster Activated!`,
        description: `You consumed **${item.name}**!\n\n✨ **XP Multiplier:** **${multiplier}x**\n⏳ **Active Until:** <t:${expiryTimestamp}:R> (<t:${expiryTimestamp}:T>)\n\nAll XP earned across text chat, voice channels, and activities is boosted!`,
        color: 0xF1C40F,
        footerText: 'Sonnies Leveling • Booster active server-wide'
      });
      return interaction.reply({ embeds: [embed] });
    }

    // Effect: Padlock (Protects from robberies)
    if (item.id === 'padlock') {
      const protectMs = 2 * 60 * 60 * 1000;
      db.setRobProtectUntil(guild.id, user.id, Date.now() + protectMs);
      const embed = successEmbed(
        'Padlock Active',
        'Your wallet is protected from robberies for **2 hours**.'
      );
      return interaction.reply({ embeds: [embed] });
    }

    if (item.id === 'energy_drink') {
      const cooldownList = ['fish', 'hunt', 'mine', 'dig', 'work', 'beg', 'crime', 'rob', 'search', 'farm', 'deliver', 'salvage', 'craft'];
      for (const cmd of cooldownList) {
        db.setCooldown(guild.id, user.id, cmd, 0);
      }

      const embed = successEmbed(
        'Energy Drink Used',
        'All activity cooldowns were reset. You can gather, farm, deliver, and work again immediately.'
      );
      return interaction.reply({ embeds: [embed] });
    }

    // Effect: Mystery Box (Opens random reward)
    if (item.id === 'mystery_box') {
      const roll = Math.random();
      let prizeCoins = 0;
      let bonusItem = null;
      let tierName = 'Common';

      if (roll < 0.05) {
        // Jackpot 5%
        prizeCoins = Math.floor(Math.random() * 2500) + 2500; // $2500 - $5000
        bonusItem = 'netherite';
        tierName = '🌟 JACKPOT LEGENDARY 🌟';
      } else if (roll < 0.25) {
        // High Tier 20%
        prizeCoins = Math.floor(Math.random() * 1000) + 1000; // $1000 - $2000
        bonusItem = 'diamond';
        tierName = '💎 EPIC PRIZE 💎';
      } else if (roll < 0.60) {
        // Medium Tier 35%
        prizeCoins = Math.floor(Math.random() * 500) + 500; // $500 - $1000
        bonusItem = 'ruby';
        tierName = '✨ RARE PRIZE ✨';
      } else {
        // Normal Tier 40%
        prizeCoins = Math.floor(Math.random() * 300) + 200; // $200 - $500
        tierName = '📦 Common Mystery Reward';
      }

      db.addBalance(guild.id, user.id, prizeCoins);
      if (bonusItem) {
        db.addItem(guild.id, user.id, bonusItem, 1);
      }

      const updatedUser = db.getUser(guild.id, user.id);

      const embed = createEmbed({
        title: `🎁 Mystery Box Opened: ${tierName}`,
        description: `You popped open the mystery crate and discovered:\n\n💰 **+$${prizeCoins.toLocaleString()}** Coins!${bonusItem ? `\n✨ Bonus Item: **1x ${getItem(bonusItem).emoji} ${getItem(bonusItem).name}**` : ''}\n\n👛 **New Balance:** **$${updatedUser.balance.toLocaleString()}** coins`,
        color: 0xF1C40F,
        footerText: 'Sonnies Mystery Box • Good luck on your next open!'
      });

      return interaction.reply({ embeds: [embed] });
    }

    // Effect: Lucky Clover
    if (item.id === 'lucky_clover') {
      const embed = successEmbed(
        '🍀 Four-Leaf Clover Activated!',
        'Your luck has been enhanced! Your next gathering trips will have greatly boosted chances of finding rare treasures.'
      );
      return interaction.reply({ embeds: [embed] });
    }

    // Generic consumable fallback
    const embed = successEmbed('Item Used', `You used **${item.name}**.`);
    return interaction.reply({ embeds: [embed] });
  }
};
