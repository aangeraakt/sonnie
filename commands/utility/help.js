const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType
} = require('discord.js');
const { createEmbed } = require('../../utils/embedBuilder');

const CATEGORIES = [
  {
    id: 'overview',
    label: 'Overview',
    emoji: '📖',
    description: 'All command categories',
    title: '✨ Sonnies Command Guide',
    body: 'Pick a category below. Commands work as slash commands (`/music play`) or with the server prefix (`!play`).',
    fields: [
      { name: '🎵 Music', value: '`/music play` `/music skip` `/music radio`', inline: true },
      { name: '💰 Economy', value: '`/economy wallet daily` `/economy wallet shop`', inline: true },
      { name: 'Crypto', value: '`/ltc create` `/usdt create` `/ltc send` `/usdt send`', inline: true },
      { name: 'Gaming', value: '`/gaming mc status` `/gaming roblox user`', inline: true },
      { name: 'Tickets', value: '`/ticket` `/config type:ticket`', inline: true },
      { name: 'Community', value: '`/roles` `/utility suggest` `/utility tag`', inline: true },
      { name: 'Moderation', value: '`/moderation ban` `/moderation warn` `/config`', inline: true },
      { name: 'Fun', value: '`/fun counting` `/images meme` `/ai ask`', inline: true },
      { name: 'Social', value: '`/economy social profile` `/pet adopt` `/clan create`', inline: true },
      { name: 'Protection', value: '`/automod view` `/logging view`', inline: true }
    ]
  },
  {
    id: 'ai',
    label: 'AI',
    emoji: '🤖',
    description: 'Ask Sonnies AI questions',
    title: '🤖 AI Assistant',
    body: 'Chat with Sonnies AI. Server admins can whitelist extra users.',
    fields: [
      { name: 'Commands', value: '`/ai ask <prompt>`\n`/ai whitelist <add/remove/list>`\n`/ai status`' }
    ]
  },
  {
    id: 'search',
    label: 'Search',
    emoji: '🔎',
    description: 'Look up web results and media',
    title: '🔎 Search',
    body: 'Find packages, videos, repos, articles, movies, and weather.',
    fields: [
      { name: 'Commands', value: '`/search npm` `/search google` `/search youtube` `/search github` `/search wikipedia` `/search movie` `/search weather` `/search iplookup` `/search asnlookup`' }
    ]
  },
  {
    id: 'images',
    label: 'Images',
    emoji: '🖼️',
    description: 'Animals, memes, and avatars',
    title: '🖼️ Images & Memes',
    body: 'Send pictures and image effects.',
    fields: [
      { name: 'Commands', value: '`/images dog` `/images cat` `/images fox` `/images meme` `/images avatar` `/images deepfry`' }
    ]
  },
  {
    id: 'economy',
    label: 'Economy',
    emoji: '💰',
    description: 'Coins, jobs, gathering, and gambling',
    title: '💰 Economy & Gathering',
    body: 'Earn coins, buy items, and play casino games.',
    fields: [
      { name: 'Wallet & Jobs', value: '`/economy wallet balance` `/economy wallet deposit` `/economy wallet withdraw` `/economy wallet pay` `/economy wallet daily` `/economy wallet work` `/economy wallet leaderboard`', inline: false },
      { name: 'Shop & Boosters', value: '`/economy wallet shop` `/economy wallet buy` `/economy wallet sell` `/economy wallet inventory` `/economy wallet use` (Buy 1.5x, 2.0x, 3.0x XP Boosters)', inline: false },
      { name: 'Earning & Gather', value: '`/economy gather fish` `/economy gather hunt` `/economy gather mine` `/economy gather dig` `/economy gather farm` `/economy gather deliver` `/economy gather salvage` `/economy gather craft` `/economy gather heist` `/economy gather trivia`', inline: false },
      { name: 'Casino', value: '`/economy casino blackjack` (Play blackjack against the dealer)', inline: false }
    ]
  },
  {
    id: 'crypto',
    label: 'Crypto',
    emoji: '🪙',
    description: 'LTC and TRC-20 USDT wallets',
    title: 'Crypto Wallets',
    body: 'Create Litecoin and TRC-20 USDT wallets, receive deposits, send coins, and view on-chain history. Keys are stored encrypted on the bot. Sends need a confirmation. USDT is Tron TRC-20 only.',
    fields: [
      { name: 'Litecoin', value: '`/ltc create` `/ltc wallets` `/ltc balance` `/ltc receive` `/ltc send` `/ltc transactions` `/ltc export` `/ltc delete`' },
      { name: 'USDT (TRC-20)', value: '`/usdt create` `/usdt wallets` `/usdt balance` `/usdt receive` `/usdt send` `/usdt transactions` `/usdt export` `/usdt delete`' },
      { name: 'Instant Swaps', value: '`/swap rate` `/swap execute` `/swap status` `/swap history` (Accountless LTC ⇋ USDT bridge)' }
    ]
  },
  {
    id: 'gaming',
    label: 'Gaming',
    emoji: '🎮',
    description: 'Minecraft status and Roblox lookups',
    title: 'Gaming',
    body: 'Check Minecraft servers and players, plus Roblox users, inventory, avatars, experiences, and groups.',
    fields: [
      { name: 'Minecraft', value: '`/gaming mc status` `/gaming mc player`', inline: false },
      { name: 'Roblox', value: '`/gaming roblox user` `/gaming roblox inventory` `/gaming roblox avatar` `/gaming roblox game` `/gaming roblox group`', inline: false }
    ]
  },
  {
    id: 'moderation',
    label: 'Moderation',
    emoji: '🛡️',
    description: 'Punishments and auto-mod',
    title: '🛡️ Moderation',
    body: 'Staff tools, punishments, and server-wide lockdown.',
    fields: [
      { name: 'Punishments', value: '`/moderation ban` `/moderation tempban` `/moderation softban` `/moderation massban` `/moderation unban` `/moderation kick` `/moderation timeout`', inline: false },
      { name: 'Warnings', value: '`/moderation warn` `/moderation unwarn` `/moderation warnings` `/moderation clearwarnings` `/moderation case`', inline: false },
      { name: 'Channels & stats', value: '`/moderation purge` `/moderation slowmode` `/moderation lock` `/moderation lockdown` `/moderation nuke` `/moderation modstats`', inline: false }
    ]
  },
  {
    id: 'config',
    label: 'Config',
    emoji: '⚙️',
    description: 'Server setup and settings',
    title: '⚙️ Server Configuration',
    body: 'Configure channels, minigames, auto-mod, tickets, XP, and more with one command.',
    fields: [
      { name: 'Core', value: '`/config type:view` `/config type:prefix` `/config type:staffrole` `/config type:djrole` `/config type:embedcolor` `/config type:modlog` `/config type:autorole`', inline: false },
      { name: 'Channels', value: '`/config type:welcome` `/config type:leave` `/config type:ticket` `/config type:radio` `/config type:counting` `/config type:tempvoice` `/config type:suggestions` `/config type:starboard`', inline: false },
      { name: 'Availability', value: '`/commands disable` `/commands enable` `/commands channel` `/commands role` `/commands list`', inline: false }
    ]
  },
  {
    id: 'music',
    label: 'Music',
    emoji: '🎵',
    description: 'YouTube, Spotify, and radio',
    title: '🎵 Music & Radio',
    body: 'Play tracks from a live player panel. `/music play` pauses 24/7 radio until the queue is empty.',
    fields: [
      { name: 'Playback', value: '`/music play` `/music skip` `/music stop` `/music pause` `/music resume` `/music seek` `/music queue` `/music nowplaying`', inline: false },
      { name: 'Sound & mode', value: '`/music volume` `/music loop` `/music shuffle` `/music filter` `/music autoplay` `/music lyrics`', inline: false },
      { name: 'Saved music', value: '`/music playlist save` `/music playlist load` `/music favorites add` `/music favorites play`', inline: false },
      { name: 'Radio', value: '`/music radio play` `/music radio stop` `/music radio status`', inline: false },
      { name: 'DJ role', value: 'Set one with `/config type:djrole` to limit playback controls to DJs.', inline: false }
    ]
  },
  {
    id: 'tickets',
    label: 'Tickets',
    emoji: '🎫',
    description: 'Support tickets and transcripts',
    title: '🎫 Tickets',
    body: 'Open staff tickets and export HTML transcripts.',
    fields: [
      { name: 'Commands', value: '`/config type:ticket channel:#channel` `/ticket add` `/ticket remove` `/ticket close` `/ticket claim` `/ticket transcript`' }
    ]
  },
  {
    id: 'community',
    label: 'Community',
    emoji: '📣',
    description: 'Roles, suggestions, tags, and reminders',
    title: 'Community',
    body: 'Tools that keep a server useful day to day.',
    fields: [
      { name: 'Roles', value: '`/roles add` `/roles panel`', inline: false },
      { name: 'Suggestions & polls', value: '`/utility suggest post` `/utility suggest accept` `/utility poll`', inline: false },
      { name: 'Tags & reminders', value: '`/utility tag create` `/utility tag get` `/utility remind set` `/utility schedule create`', inline: false },
      { name: 'Other', value: '`/utility invites` `/utility sticky set` `/utility afk` `/moderation slowmode`', inline: false }
    ]
  },
  {
    id: 'leveling',
    label: 'Leveling',
    emoji: '⭐',
    description: 'XP ranks and leaderboards',
    title: '⭐ Leveling',
    body: 'Earn XP by chatting and by talking in voice, with automatic role rewards.',
    fields: [
      { name: 'Members', value: '`/leveling rank` `/leveling levels`', inline: false },
      { name: 'Staff', value: '`/leveling addxp` `/leveling setxp` `/leveling levelconfig view`', inline: false },
      { name: 'Role rewards', value: '`/leveling levelconfig reward` `/leveling levelconfig rewards` `/leveling levelconfig stack` `/leveling levelconfig sync`', inline: false },
      { name: 'Rules', value: '`/leveling levelconfig announce` `/leveling levelconfig noxp` `/leveling levelconfig multiplier` `/leveling levelconfig voicexp` `/leveling levelconfig card`', inline: false }
    ]
  },
  {
    id: 'giveaways',
    label: 'Giveaways',
    emoji: '🎉',
    description: 'Start and roll giveaways',
    title: '🎉 Giveaways',
    body: 'Run prize drawings in a channel.',
    fields: [
      { name: 'Commands', value: '`/giveaway start` `/giveaway end` `/giveaway reroll`' }
    ]
  },
  {
    id: 'fun',
    label: 'Fun',
    emoji: '🎲',
    description: 'Counting and party games',
    title: '🎲 Fun & Minigames',
    body: 'Play counting in a configured channel, plus party games.',
    fields: [
      { name: 'Commands', value: '`/fun counting` `/fun 8ball` `/fun coinflip` `/fun dice`' }
    ]
  },
  {
    id: 'utility',
    label: 'Utility',
    emoji: '🛠️',
    description: 'Info, ping, and embeds',
    title: '🛠️ Utility',
    body: 'Server tools and custom messages.',
    fields: [
      { name: 'Commands', value: '`/utility echo` `/utility embed` `/utility ping` `/utility botinfo` `/utility userinfo` `/utility serverinfo` `/utility help` `/utility invites` `/utility sticky` `/utility afk`' }
    ]
  },
  {
    id: 'social',
    label: 'Social & Pets',
    emoji: '🐾',
    description: 'Profiles, pets, clans, quests, and marriage',
    title: '🐾 Social, Pets & Clans',
    body: 'Progression that sits on top of the economy.',
    fields: [
      { name: 'Profile', value: '`/economy social profile` `/economy social achievements` `/economy social quests` `/economy social prestige`', inline: false },
      { name: 'Pets', value: '`/pet adopt` `/pet view` `/pet feed` `/pet play` `/pet hunt` `/pet shop` `/pet leaderboard`', inline: false },
      { name: 'Clans', value: '`/clan create` `/clan join` `/clan info` `/clan deposit` `/clan leaderboard`', inline: false },
      { name: 'Trading & more', value: '`/economy social trade` `/economy social marry` `/economy social lottery` `/economy social roleshop`', inline: false }
    ]
  },
  {
    id: 'automod',
    label: 'Auto-Mod',
    emoji: '🚨',
    description: 'Filters, raid, and nuke protection',
    title: '🚨 Auto-Moderation',
    body: 'Content filters, automatic punishments, and protection against raids and compromised staff accounts.',
    fields: [
      { name: 'Overview', value: '`/automod view`', inline: false },
      { name: 'Filters', value: '`/automod filter` `/automod words add` `/automod words list` `/automod words action` `/automod ignore`', inline: false },
      { name: 'Escalation', value: '`/automod escalation toggle` `/automod escalation set` `/automod escalation list`', inline: false },
      { name: 'Protection', value: '`/automod raid` `/automod antinuke`', inline: false }
    ]
  },
  {
    id: 'logging',
    label: 'Logging',
    emoji: '📋',
    description: 'Audit logs by category',
    title: '📋 Server Logging',
    body: 'Route each kind of event to its own channel. Give me **View Audit Log** so I can name who did what.',
    fields: [
      { name: 'Commands', value: '`/logging view` `/logging set` `/logging all` `/logging disable` `/logging ignore`', inline: false },
      { name: 'Categories', value: 'messages, members, server, voice, joins & leaves, moderation', inline: false }
    ]
  },
  {
    id: 'tools',
    label: 'Tools',
    emoji: '🔧',
    description: 'Lookups, snipes, and translation',
    title: '🔧 Tools',
    body: 'Everyday utilities for members and staff.',
    fields: [
      { name: 'Lookups', value: '`/tools roleinfo` `/tools channelinfo` `/tools banner` `/tools firstmessage` `/tools timestamp`', inline: false },
      { name: 'Staff', value: '`/tools snipe` `/tools editsnipe` `/tools emoji steal` `/tools emoji list`', inline: false },
      { name: 'Automation', value: '`/tools autoresponder add` `/tools counter create` `/tools counter list`', inline: false },
      { name: 'Translation', value: '`/tools translate`', inline: false }
    ]
  }
];

function buildEmbed(categoryId) {
  const category = CATEGORIES.find((item) => item.id === categoryId) || CATEGORIES[0];
  return createEmbed({
    title: category.title,
    description: category.body,
    fields: category.fields,
    footerText: 'Sonnies Bot • Choose a category in the menu'
  });
}

function buildMenu(selectedId) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('help_category')
    .setPlaceholder('Pick a category')
    .addOptions(
      CATEGORIES.map((category) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(category.label)
          .setDescription(category.description)
          .setValue(category.id)
          .setEmoji(category.emoji)
          .setDefault(category.id === selectedId)
      )
    );

  return new ActionRowBuilder().addComponents(menu);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Browse Sonnies commands by category'),

  async execute(interaction) {
    const selectedId = 'overview';
    const payload = {
      embeds: [buildEmbed(selectedId)],
      components: [buildMenu(selectedId)],
      fetchReply: true
    };

    const message = await interaction.reply(payload);
    if (!message || typeof message.createMessageComponentCollector !== 'function') return;

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 5 * 60 * 1000
    });

    collector.on('collect', async (select) => {
      if (select.user.id !== interaction.user.id) {
        await select.reply({ content: 'This help menu is not for you.', flags: 64 }).catch(() => {});
        return;
      }

      const nextId = select.values[0];
      await select.update({
        embeds: [buildEmbed(nextId)],
        components: [buildMenu(nextId)]
      }).catch(() => {});
    });

    collector.on('end', async () => {
      try {
        await interaction.editReply({ components: [] });
      } catch (e) {}
    });
  }
};
