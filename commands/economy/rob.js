const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed, successEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rob')
    .setDescription('Attempt to rob another member wallet cash (Bank deposits are safe!)')
    .addUserOption(opt =>
      opt.setName('target')
        .setDescription('The user you want to rob')
        .setRequired(true)
    ),

  async execute(interaction) {
    const { guild, user } = interaction;
    const target = interaction.options.getUser('target');

    if (target.id === user.id) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Target', 'You cannot rob yourself!')], flags: 64 });
    }

    if (target.bot) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Target', 'You cannot rob bots!')], flags: 64 });
    }

    const robberData = db.getUser(guild.id, user.id);
    const targetData = db.getUser(guild.id, target.id);

    if (robberData.balance < 50) {
      return interaction.reply({
        embeds: [errorEmbed('Too Broke to Rob', 'You need at least **$50** in your wallet to risk attempting a robbery!')],
        flags: 64
      });
    }

    if (targetData.balance < 50) {
      return interaction.reply({
        embeds: [errorEmbed('Target Too Broke', `${target.username} has less than **$50** in their wallet. Not worth the risk!`)],
        flags: 64
      });
    }

    const protectUntil = Number(targetData.rob_protect_until) || 0;
    if (protectUntil > Date.now()) {
      const remainingMs = protectUntil - Date.now();
      const minutes = Math.ceil(remainingMs / (1000 * 60));
      return interaction.reply({
        embeds: [errorEmbed('Padlock Active', `${target.username} is protected for **${minutes}m**.`)],
        flags: 64
      });
    }

    const cooldownKey = 'rob';
    const lastRob = db.getCooldown(guild.id, user.id, cooldownKey);
    const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();

    if (now - lastRob < COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((COOLDOWN_MS - (now - lastRob)) / 1000);
      return interaction.reply({
        embeds: [errorEmbed('Cooldown Active', `You must wait **${remainingSeconds}s** before attempting another robbery.`)],
        flags: 64
      });
    }

    db.setCooldown(guild.id, user.id, cooldownKey, now);

    const isSuccess = Math.random() < 0.50; // 50% chance

    if (isSuccess) {
      // Steal 15% to 40% of target balance
      const percent = (Math.floor(Math.random() * 26) + 15) / 100;
      const stolenAmount = Math.max(10, Math.floor(targetData.balance * percent));

      db.addBalance(guild.id, target.id, -stolenAmount);
      db.addBalance(guild.id, user.id, stolenAmount);

      const embed = createEmbed({
        title: '🗡️ Robbery Successful!',
        description: `You snuck up on ${target} and stole **$${stolenAmount}** coins from their wallet!\n\n👛 Your New Balance: **$${robberData.balance + stolenAmount}**`,
        color: 0x57F287,
        footerText: 'Sonnies Economy • Rob'
      });

      return interaction.reply({ embeds: [embed] });
    } else {
      // Failed: Pay fine to victim
      const finePercent = (Math.floor(Math.random() * 20) + 10) / 100;
      const fine = Math.max(25, Math.floor(robberData.balance * finePercent));

      db.addBalance(guild.id, user.id, -fine);
      db.addBalance(guild.id, target.id, fine);

      const embed = createEmbed({
        title: '🚨 Robbery Failed!',
        description: `You got caught trying to pickpocket ${target}!\nYou were forced to pay them **$${fine}** in compensation.`,
        color: 0xED4245,
        footerText: 'Sonnies Economy • Rob'
      });

      return interaction.reply({ embeds: [embed] });
    }
  }
};
