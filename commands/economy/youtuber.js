const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { awardEarnings, trackGamble } = require('../../utils/earnings');

const COOLDOWN_MS = 20 * 60 * 1000; // 20 minutes

const VIDEO_TITLES = [
  'I Survived 24 Hours in a Discord Call',
  'Ranking Every Server Emoji (Tier List)',
  'Trying the Viral TikTok Recipe So You Don\'t Have To',
  'Speedrunning My Own Life Choices',
  'Reacting to My First Ever Upload',
  'Building a PC With Only $50',
  'I Let Chat Control My Day for 24 Hours',
  'Unboxing Mystery Packages From the Internet',
  'Testing Life Hacks Until One Actually Works',
  'Explaining My Entire Personality in 10 Minutes'
];

const TIERS = [
  { min: 0, name: 'New Creator', emoji: '🎬' },
  { min: 1000, name: 'Rising Star', emoji: '⭐' },
  { min: 10000, name: 'Influencer', emoji: '📈' },
  { min: 100000, name: 'Superstar', emoji: '🌟' },
  { min: 1000000, name: 'Legend', emoji: '👑' }
];

function getTier(subscribers) {
  let tier = TIERS[0];
  for (const t of TIERS) {
    if (subscribers >= t.min) tier = t;
  }
  return tier;
}

function formatCount(num) {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return `${num}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('youtuber')
    .setDescription('Run your own YouTube channel — upload videos, gain subscribers, earn ad revenue')
    .addStringOption(opt =>
      opt.setName('action')
        .setDescription('What to do')
        .setRequired(true)
        .addChoices(
          { name: 'Start Channel', value: 'start' },
          { name: 'Upload Video', value: 'post' },
          { name: 'Channel Stats', value: 'stats' }
        )
    )
    .addStringOption(opt =>
      opt.setName('name')
        .setDescription('Your channel name (for starting a channel)')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('title')
        .setDescription('Your video title (for uploading)')
        .setRequired(false)
    )
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('View another member\'s channel stats')
        .setRequired(false)
    ),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const action = interaction.options.getString('action');

    if (action === 'start') {
      const existing = db.getYoutubeChannel(guildId, userId);
      if (existing) {
        return interaction.reply({
          embeds: [errorEmbed('Channel Already Exists', `You already run **${existing.name}**! Use \`/youtuber action:Upload Video\` to post content.`)],
          flags: 64
        });
      }

      const name = (interaction.options.getString('name') || `${interaction.user.username}'s Channel`).slice(0, 60);
      const channel = db.createYoutubeChannel(guildId, userId, name);

      return interaction.reply({
        embeds: [createEmbed({
          title: '🎥 Channel Launched!',
          description: `**${channel.name}** is now live! Start uploading videos with \`/youtuber action:Upload Video\` to earn subscribers and ad revenue.`,
          thumbnail: interaction.user.displayAvatarURL({ dynamic: true }),
          footerText: 'Sonnies Economy • YouTuber'
        })]
      });
    }

    if (action === 'post') {
      const channel = db.getYoutubeChannel(guildId, userId);
      if (!channel) {
        return interaction.reply({
          embeds: [errorEmbed('No Channel Yet', 'Start your channel first with `/youtuber action:Start Channel`.')],
          flags: 64
        });
      }

      const lastPost = db.getCooldown(guildId, userId, 'youtuber_post');
      const now = Date.now();
      if (now - lastPost < COOLDOWN_MS) {
        const remaining = Math.ceil((COOLDOWN_MS - (now - lastPost)) / 1000);
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        return interaction.reply({
          embeds: [errorEmbed('Still Editing', `Your next video isn't ready yet. Come back in **${minutes}m ${seconds}s**.`)],
          flags: 64
        });
      }
      db.setCooldown(guildId, userId, 'youtuber_post', now);

      const title = (interaction.options.getString('title') || VIDEO_TITLES[Math.floor(Math.random() * VIDEO_TITLES.length)]).slice(0, 100);

      const subscriberBoost = Math.min(5, 1 + channel.subscribers / 500);
      const baseViews = Math.floor(Math.random() * 251) + 50; // 50-300
      const isViral = Math.random() < 0.06;
      const viralMultiplier = isViral ? Math.random() * 10 + 5 : 1; // 5x-15x
      const views = Math.floor(baseViews * subscriberBoost * viralMultiplier);

      const revenue = Math.floor(views * (Math.random() * 1.4 + 0.8)); // ~$0.8-$2.2 per view

      const subscriberGain = Math.floor(views / 40) + Math.floor(Math.random() * 6);
      const churn = Math.random() < 0.2 ? Math.floor(Math.random() * (subscriberGain / 2 + 1)) : 0;
      const netSubChange = subscriberGain - churn;

      const updated = db.updateYoutubeChannel(guildId, userId, {
        subscribers: Math.max(0, channel.subscribers + netSubChange),
        total_views: channel.total_views + views,
        total_revenue: channel.total_revenue + revenue,
        videos_posted: channel.videos_posted + 1
      });

      awardEarnings(guildId, userId, revenue, 'work');
      db.addXP(guildId, userId, Math.min(80, Math.floor(views / 40) + 10));

      const tier = getTier(updated.subscribers);
      const viralLine = isViral ? '\n\n🚀 **YOUR VIDEO WENT VIRAL!** Views are through the roof!' : '';
      const subLine = netSubChange >= 0
        ? `+${netSubChange.toLocaleString()} subscribers`
        : `${netSubChange.toLocaleString()} subscribers (lost some to churn)`;

      return interaction.reply({
        embeds: [createEmbed({
          title: '📹 Video Uploaded!',
          description: `**${channel.name}** just posted:\n"**${title}**"${viralLine}`,
          thumbnail: interaction.user.displayAvatarURL({ dynamic: true }),
          fields: [
            { name: '👁️ Views', value: `\`${views.toLocaleString()}\``, inline: true },
            { name: '👥 Subscribers', value: `\`${subLine}\``, inline: true },
            { name: '💰 Ad Revenue', value: `\`+$${revenue.toLocaleString()}\``, inline: true },
            { name: `${tier.emoji} Channel Tier`, value: `\`${tier.name}\``, inline: true },
            { name: '📊 Total Subscribers', value: `\`${formatCount(updated.subscribers)}\``, inline: true },
            { name: '👛 Wallet', value: `\`$${db.getUser(guildId, userId).balance.toLocaleString()}\``, inline: true }
          ],
          footerText: 'Sonnies Economy • YouTuber'
        })]
      });
    }

    if (action === 'stats') {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const channel = db.getYoutubeChannel(guildId, targetUser.id);
      if (!channel) {
        return interaction.reply({
          embeds: [errorEmbed('No Channel Found', targetUser.id === userId ? 'You haven\'t started a channel yet. Use `/youtuber action:Start Channel` to begin.' : `${targetUser.username} hasn't started a YouTube channel yet.`)],
          flags: 64
        });
      }

      const tier = getTier(channel.subscribers);

      return interaction.reply({
        embeds: [createEmbed({
          title: `${tier.emoji} ${channel.name}`,
          description: `Channel owned by ${targetUser}`,
          thumbnail: targetUser.displayAvatarURL({ dynamic: true }),
          fields: [
            { name: '👥 Subscribers', value: `\`${formatCount(channel.subscribers)}\``, inline: true },
            { name: '👁️ Total Views', value: `\`${formatCount(channel.total_views)}\``, inline: true },
            { name: '🎬 Videos Posted', value: `\`${channel.videos_posted}\``, inline: true },
            { name: '💰 Lifetime Revenue', value: `\`$${channel.total_revenue.toLocaleString()}\``, inline: true },
            { name: 'Tier', value: `\`${tier.name}\``, inline: true }
          ],
          footerText: 'Sonnies Economy • YouTuber'
        })]
      });
    }

    return interaction.reply({
      embeds: [errorEmbed('Unknown Action', 'Pick an action from the list.')],
      flags: 64
    });
  }
};
