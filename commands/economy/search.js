const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');

const PLACES = {
  couch: { label: 'couch', min: 15, max: 80, fail: 'You only found crumbs between the cushions.' },
  dumpster: { label: 'dumpster', min: 10, max: 160, fail: 'Just rotten food and flies.' },
  bushes: { label: 'bushes', min: 15, max: 90, fail: 'A bird scared you off empty-handed.' },
  car: { label: 'car', min: 25, max: 120, fail: 'The glove box was locked.' },
  attic: { label: 'attic', min: 20, max: 110, fail: 'Nothing but dust and boxes.' },
  beach: { label: 'beach', min: 20, max: 100, fail: 'The tide already took anything valuable.' },
  sewer: { label: 'sewer', min: 5, max: 180, fail: 'You found nothing worth keeping.' },
  mailbox: { label: 'mailbox', min: 10, max: 70, fail: 'Only junk mail.' },
  park: { label: 'park', min: 15, max: 95, fail: 'Someone else got there first.' },
  closet: { label: 'closet', min: 20, max: 85, fail: 'Just old coats.' }
};

const PLACE_KEYS = Object.keys(PLACES);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search a random place for leftover coins'),

  async execute(interaction) {
    const { guild, user } = interaction;
    const lastSearch = db.getCooldown(guild.id, user.id, 'search');
    const COOLDOWN_MS = 40 * 1000;
    const now = Date.now();

    if (now - lastSearch < COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((COOLDOWN_MS - (now - lastSearch)) / 1000);
      return interaction.reply({
        embeds: [errorEmbed('Search Cooldown', `Wait **${remainingSeconds}s** before searching again.`)],
        flags: 64
      });
    }

    const key = PLACE_KEYS[Math.floor(Math.random() * PLACE_KEYS.length)];
    const place = PLACES[key];
    db.setCooldown(guild.id, user.id, 'search', now);

    if (Math.random() < 0.28) {
      return interaction.reply({
        embeds: [createEmbed({
          title: `🔍 Searched the ${place.label}`,
          description: `${place.fail}\nYou found **$0**.`,
          color: 0x95A5A6
        })]
      });
    }

    const amount = Math.floor(Math.random() * (place.max - place.min + 1)) + place.min;
    const updated = db.addBalance(guild.id, user.id, amount);

    return interaction.reply({
      embeds: [createEmbed({
        title: `🔍 Searched the ${place.label}`,
        description: `You found **$${amount}**!\nWallet: **$${updated.balance}**`
      })]
    });
  }
};
