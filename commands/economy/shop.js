const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { getShopItems } = require('../../utils/economyItems');
const { createEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Browse items and XP boosters you can buy')
    .addStringOption(opt =>
      opt.setName('category')
        .setDescription('Filter shop items by category')
        .addChoices(
          { name: '⚡ XP Boosters', value: 'boosters' },
          { name: '🛠️ Tools', value: 'tools' },
          { name: '📦 Consumables', value: 'consumables' },
          { name: '🌐 All Items', value: 'all' }
        )
    ),

  async execute(interaction) {
    const { guild, user } = interaction;
    const filter = interaction.options?.getString?.('category') || 'all';
    const allShop = getShopItems();

    const activeBooster = db.getXpBooster(guild.id, user.id);
    let boosterNotice = '';
    if (activeBooster) {
      const expSec = Math.floor(activeBooster.expiresAt / 1000);
      boosterNotice = `⚡ **Your Active Booster:** **${activeBooster.multiplier}x XP** (expires <t:${expSec}:R>)\n\n`;
    }

    const boosters = allShop.filter(i => i.id.startsWith('xp_booster_'));
    const tools = allShop.filter(i => i.category === 'tools');
    const consumables = allShop.filter(i => i.category === 'consumables' && !i.id.startsWith('xp_booster_'));

    const fields = [];

    if (filter === 'all' || filter === 'boosters') {
      const boosterText = boosters.map(item =>
        `${item.emoji} **${item.name}** — **$${item.buyPrice.toLocaleString()}** (\`${item.id}\`)\n*${item.description}*`
      ).join('\n\n');
      if (boosterText) fields.push({ name: '⚡ XP Boosters (Limited Time Buffs)', value: boosterText, inline: false });
    }

    if (filter === 'all' || filter === 'tools') {
      const toolsText = tools.map(item =>
        `${item.emoji} **${item.name}** — **$${item.buyPrice.toLocaleString()}** (\`${item.id}\`)\n*${item.description}*`
      ).join('\n\n');
      if (toolsText) fields.push({ name: '🛠️ Tools & Equipment', value: toolsText, inline: false });
    }

    if (filter === 'all' || filter === 'consumables') {
      const consumablesText = consumables.map(item =>
        `${item.emoji} **${item.name}** — **$${item.buyPrice.toLocaleString()}** (\`${item.id}\`)\n*${item.description}*`
      ).join('\n\n');
      if (consumablesText) fields.push({ name: '📦 Consumables & Mystery Boxes', value: consumablesText, inline: false });
    }

    const embed = createEmbed({
      title: '🛒 Sonnies Economy Shop',
      description: `${boosterNotice}Purchase items with \`/buy <item_id>\` • Activate with \`/use <item_id>\``,
      fields,
      color: 0x2ECC71,
      footerText: 'Sonnies Shop • Earn coins with /work, /farm, /deliver, /salvage, /craft'
    });

    return interaction.reply({ embeds: [embed] });
  }
};
