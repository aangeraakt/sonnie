const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { awardEarnings, trackGamble } = require('../../utils/earnings');

const MEMES = [
  { caption: 'A perfectly timed reaction image', min: 45, max: 140 },
  { caption: 'A cursed deep-fried screenshot', min: 35, max: 120 },
  { caption: 'A surprisingly wholesome cat video', min: 50, max: 160 },
  { caption: 'An inside joke that actually landed', min: 40, max: 130 },
  { caption: 'A remix of last week\'s trend', min: 30, max: 110 }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('postmeme')
    .setDescription('Post a meme and collect coins from upvotes'),

  async execute(interaction) {
    const { guild, user } = interaction;
    const lastPost = db.getCooldown(guild.id, user.id, 'postmeme');
    const COOLDOWN_MS = 60 * 1000;
    const now = Date.now();

    if (now - lastPost < COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((COOLDOWN_MS - (now - lastPost)) / 1000);
      return interaction.reply({
        embeds: [errorEmbed('Meme Cooldown', `The algorithm needs a break. Wait **${remainingSeconds}s**.`)],
        flags: 64
      });
    }

    db.setCooldown(guild.id, user.id, 'postmeme', now);

    if (Math.random() < 0.18) {
      return interaction.reply({
        embeds: [createEmbed({
          title: 'Meme Flopped',
          description: 'Nobody upvoted it. You earned **$0**.',
          color: 0x95A5A6,
          footerText: 'Sonnies Economy • Post Meme'
        })]
      });
    }

    const meme = MEMES[Math.floor(Math.random() * MEMES.length)];
    const rolled = Math.floor(Math.random() * (meme.max - meme.min + 1)) + meme.min;
    const upvotes = Math.floor(Math.random() * 900) + 20;
    const amount = awardEarnings(guild.id, user.id, rolled, 'work');
    const updated = db.getUser(guild.id, user.id);

    return interaction.reply({
      embeds: [createEmbed({
        title: 'Meme Posted',
        description: `${meme.caption}.\nUpvotes: **${upvotes}**\nEarnings: **$${amount}**\nWallet: **$${updated.balance}**`,
        footerText: 'Sonnies Economy • Post Meme'
      })]
    });
  }
};
