const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { awardEarnings, trackGamble } = require('../../utils/earnings');

const FINDS = [
  { place: 'an abandoned arcade', min: 60, max: 180 },
  { place: 'a hidden cave behind the waterfall', min: 80, max: 220 },
  { place: 'the old lighthouse attic', min: 50, max: 160 },
  { place: 'a crashed supply drone', min: 90, max: 250 },
  { place: 'the sewer maintenance tunnel', min: 40, max: 200 }
];

const FAILS = [
  'You got lost and had to turn back empty-handed.',
  'A locked gate blocked the only path.',
  'It started raining and the trail washed out.',
  'You found a map, but it was just a restaurant flyer.'
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('explore')
    .setDescription('Explore the map for leftover coins and loot'),

  async execute(interaction) {
    const { guild, user } = interaction;
    const lastExplore = db.getCooldown(guild.id, user.id, 'explore');
    const COOLDOWN_MS = 90 * 1000;
    const now = Date.now();

    if (now - lastExplore < COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((COOLDOWN_MS - (now - lastExplore)) / 1000);
      return interaction.reply({
        embeds: [errorEmbed('Explore Cooldown', `Wait **${remainingSeconds}s** before exploring again.`)],
        flags: 64
      });
    }

    db.setCooldown(guild.id, user.id, 'explore', now);
    const roll = Math.random();

    if (roll < 0.22) {
      return interaction.reply({
        embeds: [createEmbed({
          title: 'Exploration Failed',
          description: FAILS[Math.floor(Math.random() * FAILS.length)] + '\nYou found **$0**.',
          color: 0x95A5A6,
          footerText: 'Sonnies Economy • Explore'
        })]
      });
    }

    if (roll > 0.93) {
      const rolled = Math.floor(Math.random() * 501) + 400;
      const jackpot = awardEarnings(guild.id, user.id, rolled, 'gather');
      const updated = db.getUser(guild.id, user.id);
      return interaction.reply({
        embeds: [createEmbed({
          title: 'Rare Find',
          description: `You stumbled into a hidden stash and grabbed **$${jackpot}**!\nWallet: **$${updated.balance}**`,
          footerText: 'Sonnies Economy • Explore'
        })]
      });
    }

    const find = FINDS[Math.floor(Math.random() * FINDS.length)];
    const rolled = Math.floor(Math.random() * (find.max - find.min + 1)) + find.min;
    const amount = awardEarnings(guild.id, user.id, rolled, 'gather');
    const updated = db.getUser(guild.id, user.id);

    return interaction.reply({
      embeds: [createEmbed({
        title: 'Exploration Complete',
        description: `You explored **${find.place}** and found **$${amount}**.\nWallet: **$${updated.balance}**`,
        footerText: 'Sonnies Economy • Explore'
      })]
    });
  }
};
