const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { awardEarnings, trackGamble } = require('../../utils/earnings');

const CHORES = [
  { job: 'took out the trash', min: 25, max: 70 },
  { job: 'washed a stack of dishes', min: 30, max: 80 },
  { job: 'walked the neighbor\'s dog', min: 35, max: 90 },
  { job: 'mowed a tiny patch of lawn', min: 40, max: 95 },
  { job: 'folded an entire laundry mountain', min: 28, max: 75 }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chores')
    .setDescription('Do a quick chore for some extra coins'),

  async execute(interaction) {
    const { guild, user } = interaction;
    const lastChore = db.getCooldown(guild.id, user.id, 'chores');
    const COOLDOWN_MS = 45 * 1000;
    const now = Date.now();

    if (now - lastChore < COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((COOLDOWN_MS - (now - lastChore)) / 1000);
      return interaction.reply({
        embeds: [errorEmbed('Chores Cooldown', `Take a breather. Wait **${remainingSeconds}s**.`)],
        flags: 64
      });
    }

    db.setCooldown(guild.id, user.id, 'chores', now);
    const chore = CHORES[Math.floor(Math.random() * CHORES.length)];
    const rolled = Math.floor(Math.random() * (chore.max - chore.min + 1)) + chore.min;
    const amount = awardEarnings(guild.id, user.id, rolled, 'work');
    const updated = db.getUser(guild.id, user.id);

    return interaction.reply({
      embeds: [createEmbed({
        title: 'Chore Done',
        description: `You ${chore.job} and earned **$${amount}**.\nWallet: **$${updated.balance}**`,
        footerText: 'Sonnies Economy • Chores'
      })]
    });
  }
};
