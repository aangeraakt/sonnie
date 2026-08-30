const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your or another user\'s coin balance')
    .addUserOption(opt => opt.setName('user').setDescription('User to check balance for').setRequired(false)),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const userData = db.getUser(interaction.guild.id, targetUser.id);

    const embed = createEmbed({
      title: `💰 Balance - ${targetUser.username}`,
      thumbnail: targetUser.displayAvatarURL({ dynamic: true }),
      fields: [
        { name: '💵 Wallet', value: `\`${userData.balance} coins\``, inline: true },
        { name: '🏦 Bank', value: `\`${userData.bank} coins\``, inline: true },
        { name: '📊 Total', value: `\`${userData.balance + userData.bank} coins\``, inline: true }
      ]
    });

    return interaction.reply({ embeds: [embed] });
  }
};
