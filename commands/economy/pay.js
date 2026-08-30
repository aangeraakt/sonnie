const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription('Transfer coins to another user')
    .addUserOption(opt => opt.setName('user').setDescription('Recipient').setRequired(true))
    .addIntegerOption(opt => opt.setName('amount').setDescription('Amount of coins to transfer').setMinValue(1).setRequired(true)),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const senderId = interaction.user.id;
    const guildId = interaction.guild.id;

    if (targetUser.id === senderId) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Transfer', 'You cannot pay yourself!')], flags: 64 });
    }

    if (targetUser.bot) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Transfer', 'You cannot pay bots!')], flags: 64 });
    }

    const senderData = db.getUser(guildId, senderId);
    if (senderData.balance < amount) {
      return interaction.reply({
        embeds: [errorEmbed('Insufficient Funds', `You only have **${senderData.balance} coins** in your wallet. You need **${amount} coins**.`)]
      });
    }

    db.addBalance(guildId, senderId, -amount);
    db.addBalance(guildId, targetUser.id, amount);

    return interaction.reply({
      embeds: [successEmbed('Payment Transferred', `💸 You sent **${amount} coins** to **${targetUser.tag}**!`)]
    });
  }
};
