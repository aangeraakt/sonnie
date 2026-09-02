const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { levelProgress } = require('../../utils/levelingManager');
const { ACHIEVEMENTS } = require('../../utils/achievements');
const { SPECIES } = require('../../utils/petSystem');
const { bonusFor } = require('./prestige');

const MAX_BIO = 200;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Your full profile: level, wealth, pet, clan, marriage, and badges')
    .addUserOption(opt => opt.setName('user').setDescription('Whose profile to view').setRequired(false))
    .addStringOption(opt =>
      opt.setName('bio')
        .setDescription('Set your own bio (max 200 characters). Use "clear" to remove it')
        .setMaxLength(MAX_BIO)
        .setRequired(false)
    ),

  async execute(interaction) {
    const { guild, user } = interaction;
    const newBio = interaction.options.getString('bio');

    if (newBio) {
      const value = newBio.trim().toLowerCase() === 'clear' ? '' : newBio.trim().slice(0, MAX_BIO);
      db.setUserField(guild.id, user.id, 'bio', value);
      return interaction.reply({
        embeds: [createEmbed({
          title: value ? 'Bio Updated' : 'Bio Cleared',
          description: value ? `Your profile bio is now:\n\n> ${value}` : 'Your profile bio has been removed.'
        })],
        flags: 64
      });
    }

    const target = interaction.options.getUser('user') || user;
    const member = await guild.members.fetch(target.id).catch(() => null);
    const profile = db.getUserExtras(guild.id, target.id);

    if (!profile.xp && !profile.balance && !profile.bank) {
      return interaction.reply({
        embeds: [errorEmbed('No Profile Yet', target.id === user.id
          ? 'You have not used the economy or chatted yet. Try `/economy wallet daily`.'
          : `**${target.tag}** has no activity in this server yet.`)],
        flags: 64
      });
    }

    const progress = levelProgress(profile.xp);
    const ranked = db.getTopXP(guild.id, 1000);
    const xpRank = ranked.findIndex((entry) => entry.user_id === target.id) + 1;
    const wealthRanked = db.getTopEconomy(guild.id, 1000);
    const wealthRank = wealthRanked.findIndex((entry) => entry.user_id === target.id) + 1;

    const record = db.getAchievements(guild.id, target.id);
    const badges = Object.keys(record.unlocked)
      .map((id) => ACHIEVEMENTS[id]?.emoji)
      .filter(Boolean)
      .join(' ');

    const pet = db.getPet(guild.id, target.id);
    const petSpecies = pet ? (SPECIES[pet.species] || SPECIES.dog) : null;
    const clan = db.getClanByMember(guild.id, target.id);
    const marriage = db.getMarriage(guild.id, target.id);
    const questRecord = db.getQuests(guild.id, target.id);

    const netWorth = (profile.balance || 0) + (profile.bank || 0);
    const filled = Math.round((progress.currentXP / progress.neededXP) * 15);

    const fields = [
      {
        name: 'Level',
        value: `\`${progress.level}\`${profile.prestige ? ` • Prestige \`${profile.prestige}\`` : ''}\n\`${'█'.repeat(filled)}${'░'.repeat(15 - filled)}\`\n${progress.currentXP.toLocaleString()} / ${progress.neededXP.toLocaleString()} XP`,
        inline: true
      },
      {
        name: 'Wealth',
        value: `Wallet \`${(profile.balance || 0).toLocaleString()}\`\nBank \`${(profile.bank || 0).toLocaleString()}\`\n**Net \`${netWorth.toLocaleString()}\`**`,
        inline: true
      },
      {
        name: 'Ranks',
        value: `XP \`#${xpRank || '-'}\`\nWealth \`#${wealthRank || '-'}\``,
        inline: true
      },
      {
        name: 'Pet',
        value: pet ? `${petSpecies.emoji} **${pet.name}**\n${petSpecies.name}, level ${pet.level}` : '`None`',
        inline: true
      },
      {
        name: 'Clan',
        value: clan ? `**${clan.name}**\nLevel ${clan.level}${clan.owner_id === target.id ? ' (leader)' : ''}` : '`None`',
        inline: true
      },
      {
        name: 'Married To',
        value: marriage ? `<@${marriage.partner_id}>\n<t:${Math.floor(marriage.since / 1000)}:R>` : '`Single`',
        inline: true
      },
      {
        name: 'Streaks',
        value: `Daily \`${profile.daily_streak || 0}\`\nQuests \`${questRecord?.streak || 0}\``,
        inline: true
      }
    ];

    const activeBooster = db.getXpBooster(guild.id, target.id);
    if (activeBooster) {
      const expSec = Math.floor(activeBooster.expiresAt / 1000);
      fields.push({
        name: '⚡ XP Booster',
        value: `**${activeBooster.multiplier}x** (ends <t:${expSec}:R>)`,
        inline: true
      });
    }

    fields.push(
      {
        name: 'Achievements',
        value: `\`${Object.keys(record.unlocked).length} / ${Object.keys(ACHIEVEMENTS).length}\``,
        inline: true
      },
      {
        name: 'Earnings Bonus',
        value: `\`+${bonusFor(profile.prestige || 0)}%\``,
        inline: true
      }
    );

    if (badges) fields.push({ name: 'Badges', value: badges.slice(0, 1020), inline: false });

    return interaction.reply({
      embeds: [createEmbed({
        title: `Profile - ${member?.displayName || target.username}`,
        description: profile.bio ? `> ${profile.bio}` : '*No bio set. Add one with `/economy social profile bio:...`*',
        thumbnail: target.displayAvatarURL({ dynamic: true, size: 256 }),
        fields,
        footerText: member?.joinedTimestamp ? `Joined ${new Date(member.joinedTimestamp).toDateString()}` : 'Sonnies'
      })]
    });
  }
};
