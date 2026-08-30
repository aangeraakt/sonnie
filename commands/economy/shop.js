const { SlashCommandBuilder } = require('discord.js');
const { getShopItems } = require('../../utils/economyItems');
const { createEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Browse items you can buy'),

  async execute(interaction) {
    const items = getShopItems();
    const list = items
      .map((item) => `${item.emoji} **${item.name}** — $${item.buyPrice.toLocaleString()} (\`${item.id}\`)`)
      .join('\n');

    const embed = createEmbed({
      title: '🛒 Shop',
      description: list || 'Nothing is for sale right now.',
      color: 0x2ECC71,
      footerText: 'Buy with /buy item_id • Use items with /use'
    });

    return interaction.reply({ embeds: [embed] });
  }
};
