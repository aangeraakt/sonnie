const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed, successEmbed } = require('../../utils/embedBuilder');
const { ITEMS, getItem } = require('../../utils/economyItems');
const { awardEarnings } = require('../../utils/earnings');
const { grantXp } = require('../../utils/levelingManager');

const RECIPES = {
  iron_ingot: {
    resultId: 'iron_ingot',
    name: 'Refined Iron Ingot',
    ingredients: [{ id: 'iron', name: 'Iron Ore Cluster', count: 2 }],
    coinBonus: 150,
    xp: 50,
    desc: 'Smelt 2x Iron Ore into a refined building bar.'
  },
  gold_bar: {
    resultId: 'gold_bar',
    name: 'Solid 24k Gold Ingot',
    ingredients: [{ id: 'gold_ore', name: 'Pure Gold Nugget', count: 2 }],
    coinBonus: 300,
    xp: 90,
    desc: 'Purify 2x Gold Nuggets into a 24k mint gold bullion.'
  },
  jeweled_necklace: {
    resultId: 'jeweled_necklace',
    name: 'Ruby-Encrusted Necklace',
    ingredients: [
      { id: 'gold_bar', name: 'Solid 24k Gold Ingot', count: 1 },
      { id: 'ruby', name: 'Star Ruby Gem', count: 1 }
    ],
    coinBonus: 750,
    xp: 180,
    desc: 'Craft an artisan necklace combining gold with ruby.'
  },
  royal_crown: {
    resultId: 'royal_crown',
    name: 'Imperial Diamond Crown',
    ingredients: [
      { id: 'gold_bar', name: 'Solid 24k Gold Ingot', count: 1 },
      { id: 'diamond', name: 'Flawless Diamond', count: 1 },
      { id: 'netherite', name: 'Ancient Netherite Scrap', count: 1 }
    ],
    coinBonus: 2500,
    xp: 450,
    desc: 'Forge the ultimate regal crown with gold, diamond, and netherite.'
  }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('craft')
    .setDescription('Forge raw materials into valuable crafted items and earn massive XP')
    .addStringOption(opt =>
      opt.setName('item')
        .setDescription('Recipe to craft')
        .addChoices(
          { name: '🧱 Refined Iron Ingot (Needs 2x Iron Ore)', value: 'iron_ingot' },
          { name: '🪙 Solid 24k Gold Ingot (Needs 2x Gold Nugget)', value: 'gold_bar' },
          { name: '📿 Ruby-Encrusted Necklace (Needs 1x Gold Bar + 1x Ruby)', value: 'jeweled_necklace' },
          { name: '👑 Imperial Diamond Crown (Needs 1x Gold Bar + 1x Diamond + 1x Netherite)', value: 'royal_crown' }
        )
    ),

  async execute(interaction) {
    const { guild, user, member } = interaction;
    const target = interaction.options.getString('item');

    // If no item selected, display the Crafting Workshop menu
    if (!target) {
      const inv = db.getInventory(guild.id, user.id);
      const recipeList = Object.values(RECIPES).map(r => {
        const itemInfo = ITEMS[r.resultId];
        const reqs = r.ingredients.map(ing => {
          const have = inv[ing.id] || 0;
          const check = have >= ing.count ? '✅' : '❌';
          return `${check} ${ing.count}x ${ing.name} (You have: ${have})`;
        }).join('\n');

        return `**${itemInfo.emoji} ${r.name}** (\`/craft item:${r.resultId}\`)\n*${r.desc}*\n**Materials Required:**\n${reqs}\n🎁 **Rewards:** +$${r.coinBonus.toLocaleString()} bonus coins • +${r.xp} XP • Sells for $${itemInfo.sellPrice.toLocaleString()}`;
      }).join('\n\n');

      const embed = createEmbed({
        title: '⚒️ Blacksmith & Artisan Workshop',
        description: `Combine gathered ores and gems into luxury crafted goods!\n\n${recipeList}`,
        color: 0xE67E22,
        footerText: 'Select an item with /craft <item> to forge it'
      });

      return interaction.reply({ embeds: [embed] });
    }

    const recipe = RECIPES[target];
    if (!recipe) {
      return interaction.reply({
        embeds: [errorEmbed('Unknown Recipe', 'That crafting recipe does not exist. Use `/craft` to view available blueprints.')],
        flags: 64
      });
    }

    // Check ingredients
    for (const ing of recipe.ingredients) {
      const have = db.getItemCount(guild.id, user.id, ing.id);
      if (have < ing.count) {
        return interaction.reply({
          embeds: [errorEmbed('Missing Materials', `You don't have enough **${ing.name}**!\nNeed: **${ing.count}x** • You have: **${have}x**\nGather more with \`/mine\` or buy from players via \`/trade\`.`)],
          flags: 64
        });
      }
    }

    // Consume ingredients
    for (const ing of recipe.ingredients) {
      db.removeItem(guild.id, user.id, ing.id, ing.count);
    }

    // Award crafted item + coins + XP
    db.addItem(guild.id, user.id, recipe.resultId, 1);
    const earnedCoins = awardEarnings(guild.id, user.id, recipe.coinBonus, 'work');
    await grantXp(member, recipe.xp, { channel: interaction.channel, source: 'craft' });

    const craftedItem = ITEMS[recipe.resultId];
    const ownedNow = db.getItemCount(guild.id, user.id, recipe.resultId);
    const booster = db.getXpBooster(guild.id, user.id);
    const boosterTag = booster ? ` (${booster.multiplier}x Booster Active!)` : '';

    const embed = createEmbed({
      title: '⚒️ Crafting Successful!',
      description: `You stoked the forge and mastercrafted **${craftedItem.emoji} ${craftedItem.name}**!\n\n💰 **Mastery Bonus:** +$${earnedCoins.toLocaleString()} coins\n✨ **XP Gained:** +${recipe.xp} XP${boosterTag}\n📦 **Inventory:** Added 1x ${craftedItem.name} (Total: ${ownedNow}x)\n🏷️ **Market Value:** Sells for **$${craftedItem.sellPrice.toLocaleString()}** coins with \`/sell\`!`,
      color: 0xF1C40F,
      footerText: 'Sonnies Crafting • Keep crafting to level up faster!'
    });

    return interaction.reply({ embeds: [embed] });
  }
};
