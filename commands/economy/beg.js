const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { awardEarnings, trackGamble } = require('../../utils/earnings');

const BEG_RESPONSES_SUCCESS = [
  { donor: 'MrBeast', quote: 'I just bought this street, take some money!', min: 100, max: 350 },
  { donor: 'Elon Musk', quote: 'Here is some pocket change for Dogecoin.', min: 80, max: 250 },
  { donor: 'A Generous Grandma', quote: 'You look so thin dear, buy yourself a cookie.', min: 40, max: 120 },
  { donor: 'Keanu Reeves', quote: 'You are breathtaking! Take this.', min: 90, max: 300 },
  { donor: 'A Confused Tourist', quote: 'Is this where I buy subway tickets? Take this anyway.', min: 30, max: 100 },
  { donor: 'A Friendly Street Musician', quote: 'I split my tip jar with you brother.', min: 25, max: 80 },
  { donor: 'Gordon Ramsay', quote: 'Here! Now go eat some good food, you donut!', min: 50, max: 200 },
  { donor: 'A Mysterious Stranger', quote: 'Take this coin and speak to no one of this encounter.', min: 120, max: 400 }
];

const BEG_RESPONSES_FAIL = [
  { person: 'A Street Karen', quote: 'I am calling the server moderators on you!' },
  { person: 'A Stray Raccoon', quote: 'The raccoon hissed and knocked over your cup.' },
  { person: 'Jeff Bezos', quote: 'Get back to the packing warehouse!' },
  { person: 'A Local Teenager', quote: 'L + Ratio + Broke + No Coins.' },
  { person: 'An Officer', quote: 'Move along, no loitering here!' },
  { person: 'A Pigeon', quote: 'The pigeon stared at you judgmentally and flew away.' }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('beg')
    .setDescription('Beg passersby for coins in the streets'),

  async execute(interaction) {
    const { guild, user } = interaction;
    const cooldownKey = 'beg';
    const lastBeg = db.getCooldown(guild.id, user.id, cooldownKey);
    const COOLDOWN_MS = 45 * 1000; // 45s cooldown
    const now = Date.now();

    if (now - lastBeg < COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((COOLDOWN_MS - (now - lastBeg)) / 1000);
      return interaction.reply({
        embeds: [errorEmbed('Patience Please!', `You must wait **${remainingSeconds}s** before begging again.`)],
        flags: 64
      });
    }

    db.setCooldown(guild.id, user.id, cooldownKey, now);

    const isSuccess = Math.random() < 0.70; // 70% success chance

    if (isSuccess) {
      const item = BEG_RESPONSES_SUCCESS[Math.floor(Math.random() * BEG_RESPONSES_SUCCESS.length)];
      const rolled = Math.floor(Math.random() * (item.max - item.min + 1)) + item.min;
      const amount = awardEarnings(guild.id, user.id, rolled, 'gather');
      const updatedUser = db.getUser(guild.id, user.id);

      const embed = createEmbed({
        title: '🥺 Begging Succeeded!',
        description: `**${item.donor}:** "${item.quote}"\n\n💵 You received: **$${amount}** coins!\n👛 Wallet Balance: **$${updatedUser.balance}**`,
        footerText: 'Sonnies Economy • Beg'
      });

      return interaction.reply({ embeds: [embed] });
    } else {
      const item = BEG_RESPONSES_FAIL[Math.floor(Math.random() * BEG_RESPONSES_FAIL.length)];
      const embed = createEmbed({
        title: '🥺 Begging Failed!',
        description: `**${item.person}:** "${item.quote}"\n\nYou received nothing this time!`,
        color: 0xED4245,
        footerText: 'Sonnies Economy • Beg'
      });

      return interaction.reply({ embeds: [embed] });
    }
  }
};
