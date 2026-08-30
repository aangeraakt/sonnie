const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { awardEarnings, trackGamble } = require('../../utils/earnings');

const STREAMS = [
  { title: 'Just Chatting', min: 90, max: 220 },
  { title: 'Speedrunning a cursed ROM hack', min: 110, max: 260 },
  { title: 'Cooking stream that went surprisingly well', min: 80, max: 200 },
  { title: 'Late-night music stream', min: 100, max: 240 },
  { title: 'IRL street food tour', min: 120, max: 280 }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stream')
    .setDescription('Go live and earn coins from donations'),

  async execute(interaction) {
    const { guild, user } = interaction;
    const lastStream = db.getCooldown(guild.id, user.id, 'stream');
    const COOLDOWN_MS = 15 * 60 * 1000;
    const now = Date.now();

    if (now - lastStream < COOLDOWN_MS) {
      const remaining = Math.ceil((COOLDOWN_MS - (now - lastStream)) / 1000);
      const minutes = Math.floor(remaining / 60);
      const seconds = remaining % 60;
      return interaction.reply({
        embeds: [errorEmbed('Stream Cooldown', `The stream is offline. Come back in **${minutes}m ${seconds}s**.`)],
        flags: 64
      });
    }

    db.setCooldown(guild.id, user.id, 'stream', now);
    const stream = STREAMS[Math.floor(Math.random() * STREAMS.length)];
    const rolled = Math.floor(Math.random() * (stream.max - stream.min + 1)) + stream.min;
    const viewers = Math.floor(Math.random() * 180) + 20;
    const amount = awardEarnings(guild.id, user.id, rolled, 'work');
    const updated = db.getUser(guild.id, user.id);

    return interaction.reply({
      embeds: [createEmbed({
        title: 'Stream Ended',
        description: `You streamed **${stream.title}** to **${viewers}** viewers.\nDonations: **$${amount}**\nWallet: **$${updated.balance}**`,
        footerText: 'Sonnies Economy • Stream'
      })]
    });
  }
};
