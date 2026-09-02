const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { awardEarnings } = require('../../utils/earnings');
const { grantXp } = require('../../utils/levelingManager');

const GIGS = [
  {
    name: '🍕 Express Pizza Run',
    desc: 'You rushed a piping hot pepperoni pizza through traffic to a game night!',
    minCoins: 120,
    maxCoins: 250,
    xp: 20
  },
  {
    name: '💻 High-End GPU Delivery',
    desc: 'You delivered a packaged RTX graphics card to an excited Twitch streamer.',
    minCoins: 200,
    maxCoins: 400,
    xp: 30
  },
  {
    name: '☕ Artisan Coffee & Pastries',
    desc: 'You brought gourmet iced lattes and croissants to a bustling morning office.',
    minCoins: 150,
    maxCoins: 300,
    xp: 25
  },
  {
    name: '📦 Fragile Antique Vase',
    desc: 'You carefully transported a rare porcelain vase across town without a scratch.',
    minCoins: 280,
    maxCoins: 520,
    xp: 40
  },
  {
    name: '💼 Confidential Legal Briefcase',
    desc: 'You safely handed off sensitive court documents to a downtown attorney.',
    minCoins: 380,
    maxCoins: 750,
    xp: 50
  },
  {
    name: '💎 Armored Jewelry Escort',
    desc: 'You provided courier escort for diamond rings dispatched to a VIP collector.',
    minCoins: 650,
    maxCoins: 1250,
    xp: 75
  }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deliver')
    .setDescription('Complete express delivery runs across town for cash and XP (60s cooldown)'),

  async execute(interaction) {
    const { guild, user, member } = interaction;
    const lastDeliver = db.getCooldown(guild.id, user.id, 'deliver');
    const COOLDOWN_MS = 60 * 1000;
    const now = Date.now();

    if (now - lastDeliver < COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((COOLDOWN_MS - (now - lastDeliver)) / 1000);
      return interaction.reply({
        embeds: [errorEmbed('Courier Rest', `Your delivery vehicle is recharging! Ready for next run in **${remainingSeconds}s**.`)],
        flags: 64
      });
    }

    db.setCooldown(guild.id, user.id, 'deliver', now);

    const gig = GIGS[Math.floor(Math.random() * GIGS.length)];
    let payout = Math.floor(Math.random() * (gig.maxCoins - gig.minCoins + 1)) + gig.minCoins;

    // 25% chance of generous customer tip
    const tipped = Math.random() < 0.25;
    let tipAmount = 0;
    if (tipped) {
      tipAmount = Math.floor(payout * 0.4);
      payout += tipAmount;
    }

    const earnedCoins = awardEarnings(guild.id, user.id, payout, 'work');
    await grantXp(member, gig.xp, { channel: interaction.channel, source: 'deliver' });

    const booster = db.getXpBooster(guild.id, user.id);
    const boosterTag = booster ? ` (${booster.multiplier}x Booster Active!)` : '';

    const embed = createEmbed({
      title: `🚚 ${gig.name}`,
      description: `${gig.desc}${tipped ? `\n\n⭐ *The customer was thrilled and gave you a **+$${tipAmount}** tip!*` : ''}\n\n💰 **Payment Received:** **+$${earnedCoins.toLocaleString()}** coins\n✨ **XP Earned:** **+${gig.xp} XP**${boosterTag}`,
      color: 0x3498DB,
      footerText: 'Sonnies Deliveries • Earn more with /farm, /salvage, /craft'
    });

    return interaction.reply({ embeds: [embed] });
  }
};
