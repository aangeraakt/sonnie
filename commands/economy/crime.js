const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { awardEarnings, trackGamble } = require('../../utils/earnings');

const CRIMES_SUCCESS = [
  { action: 'You successfully hacked a local ATM', reward: [250, 750] },
  { action: 'You pulled off a high-speed bank jewelry heist', reward: [500, 1200] },
  { action: 'You pickpocketed a wealthy NFT investor', reward: [200, 600] },
  { action: 'You smuggled rare antique Pokémon cards across borders', reward: [350, 900] },
  { action: 'You cracked into a crypto whale wallet and drained gas fees', reward: [400, 1100] },
  { action: 'You raided the Discord server owner coin stash', reward: [300, 800] }
];

const CRIMES_FAIL = [
  { action: 'You tripped over your own shoelaces inside the jewelry store!', fine: [150, 400] },
  { action: 'The FBI intercepted your unencrypted Discord VPN connection!', fine: [200, 500] },
  { action: 'An angry grandma with a broom chased you into the police precinct!', fine: [100, 300] },
  { action: 'The bank laser security alarm triggered and caught you in 4K!', fine: [180, 450] },
  { action: 'You accidentally pickpocketed an undercover police officer!', fine: [250, 600] }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('crime')
    .setDescription('Attempt a risky criminal heist for big money or face heavy police fines'),

  async execute(interaction) {
    const { guild, user } = interaction;
    const cooldownKey = 'crime';
    const lastCrime = db.getCooldown(guild.id, user.id, cooldownKey);
    const COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes
    const now = Date.now();

    if (now - lastCrime < COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((COOLDOWN_MS - (now - lastCrime)) / 1000);
      return interaction.reply({
        embeds: [errorEmbed('Laying Low!', `The heat is still on you! Wait **${remainingSeconds}s** before attempting another crime.`)],
        flags: 64
      });
    }

    db.setCooldown(guild.id, user.id, cooldownKey, now);

    const isSuccess = Math.random() < 0.58; // 58% success chance

    if (isSuccess) {
      const crime = CRIMES_SUCCESS[Math.floor(Math.random() * CRIMES_SUCCESS.length)];
      const rolled = Math.floor(Math.random() * (crime.reward[1] - crime.reward[0] + 1)) + crime.reward[0];
      const reward = awardEarnings(guild.id, user.id, rolled, 'gather');
      const updatedUser = db.getUser(guild.id, user.id);

      const embed = createEmbed({
        title: '🥷 Crime Successful!',
        description: `**${crime.action}!**\n\n💰 Loot: **+$${reward}** coins!\n👛 Wallet Balance: **$${updatedUser.balance}**`,
        color: 0x57F287,
        footerText: 'Sonnies Economy • Crime'
      });

      return interaction.reply({ embeds: [embed] });
    } else {
      const crime = CRIMES_FAIL[Math.floor(Math.random() * CRIMES_FAIL.length)];
      const fine = Math.floor(Math.random() * (crime.fine[1] - crime.fine[0] + 1)) + crime.fine[0];

      const currentUser = db.getUser(guild.id, user.id);
      const actualFine = Math.min(currentUser.balance, fine);
      const updatedUser = db.addBalance(guild.id, user.id, -actualFine);

      const embed = createEmbed({
        title: '🚨 Busted by the Police!',
        description: `**${crime.action}**\n\n💸 You paid a fine of **-$${actualFine}** coins!\n👛 Wallet Balance: **$${updatedUser.balance}**`,
        color: 0xED4245,
        footerText: 'Sonnies Economy • Crime Busted'
      });

      return interaction.reply({ embeds: [embed] });
    }
  }
};
