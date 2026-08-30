const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed, successEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('withdraw')
    .setDescription('Withdraw coins from your bank vault into your wallet')
    .addStringOption(opt =>
      opt.setName('amount')
        .setDescription('Amount of coins to withdraw, or "all"')
        .setRequired(true)
    ),

  async execute(interaction) {
    const { guild, user } = interaction;
    const userData = db.getUser(guild.id, user.id);
    const amountStr = interaction.options.getString('amount').toLowerCase();

    let amount = 0;
    if (amountStr === 'all' || amountStr === 'max') {
      amount = userData.bank || 0;
    } else {
      amount = parseInt(amountStr, 10);
    }

    if (isNaN(amount) || amount <= 0) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Amount', 'Please provide a valid positive number or "all".')], flags: 64 });
    }

    if ((userData.bank || 0) < amount) {
      return interaction.reply({
        embeds: [errorEmbed('Insufficient Bank Funds', `You only have **$${userData.bank || 0}** in your bank vault!`)],
        flags: 64
      });
    }

    const res = db.withdraw(guild.id, user.id, amount);

    const embed = createEmbed({
      title: '💵 Bank Withdrawal Successful',
      description: `Withdrew **$${amount}** coins from your bank vault into your wallet.\n\n👛 **Wallet:** $${res.balance}\n🏛️ **Bank:** $${res.bank}`,
      color: 0x57F287,
      footerText: 'Sonnies Bank Vault'
    });

    return interaction.reply({ embeds: [embed] });
  }
};
