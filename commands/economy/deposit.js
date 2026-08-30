const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed, successEmbed } = require('../../utils/embedBuilder');
const { trackQuest } = require('../../utils/questSystem');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deposit')
    .setDescription('Deposit coins from your wallet into your safe bank vault')
    .addStringOption(opt =>
      opt.setName('amount')
        .setDescription('Amount of coins to deposit, or "all"')
        .setRequired(true)
    ),

  async execute(interaction) {
    const { guild, user } = interaction;
    const userData = db.getUser(guild.id, user.id);
    const amountStr = interaction.options.getString('amount').toLowerCase();

    let amount = 0;
    if (amountStr === 'all' || amountStr === 'max') {
      amount = userData.balance;
    } else {
      amount = parseInt(amountStr, 10);
    }

    if (isNaN(amount) || amount <= 0) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Amount', 'Please provide a valid positive number or "all".')], flags: 64 });
    }

    if (userData.balance < amount) {
      return interaction.reply({
        embeds: [errorEmbed('Insufficient Wallet Funds', `You only have **$${userData.balance}** in your wallet!`)],
        flags: 64
      });
    }

    const res = db.deposit(guild.id, user.id, amount);
    if (res.success) trackQuest(guild.id, user.id, 'deposit', amount);

    const embed = createEmbed({
      title: '🏦 Bank Deposit Successful',
      description: `Deposited **$${amount}** coins into your secure bank vault.\n\n👛 **Wallet:** $${res.balance}\n🏛️ **Bank:** $${res.bank}`,
      color: 0x57F287,
      footerText: 'Sonnies Bank Vault • Protected from Robberies'
    });

    return interaction.reply({ embeds: [embed] });
  }
};
