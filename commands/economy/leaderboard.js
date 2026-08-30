const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View Top users for Economy or Level XP')
    .addStringOption(opt =>
      opt.setName('type')
        .setDescription('Leaderboard category')
        .setRequired(true)
        .addChoices(
          { name: 'Economy (Coins)', value: 'economy' },
          { name: 'Level (XP)', value: 'xp' }
        )
    ),

  async execute(interaction) {
    const type = interaction.options.getString('type');
    const guildId = interaction.guild.id;

    if (type === 'economy') {
      const top = db.getTopEconomy(guildId, 10);
      if (top.length === 0) {
        return interaction.reply({ content: 'No economy data yet for this server.' });
      }

      const description = top.map((entry, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**#${index + 1}**`;
        return `${medal} <@${entry.user_id}> • **${entry.total} coins** *(Wallet: ${entry.balance} | Bank: ${entry.bank})*`;
      }).join('\n');

      const embed = createEmbed({
        title: `🏆 Economy Leaderboard - ${interaction.guild.name}`,
        description
      });

      return interaction.reply({ embeds: [embed] });
    }

    if (type === 'xp') {
      const top = db.getTopXP(guildId, 10);
      if (top.length === 0) {
        return interaction.reply({ content: 'No XP data yet for this server.' });
      }

      const description = top.map((entry, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**#${index + 1}**`;
        return `${medal} <@${entry.user_id}> • **Level ${entry.level}** (${entry.xp} XP)`;
      }).join('\n');

      const embed = createEmbed({
        title: `⭐ Level Leaderboard - ${interaction.guild.name}`,
        description
      });

      return interaction.reply({ embeds: [embed] });
    }
  }
};
