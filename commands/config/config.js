const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, successEmbed, errorEmbed, infoEmbed, parseHexColor } = require('../../utils/embedBuilder');
const { checkStaffPermission } = require('../../utils/staffSecurity');
const { pickFlag, flagPromptEmbed, pickNumber, numberPromptEmbed, pickSnakeStart, snakePromptEmbed } = require('../../utils/minigameManager');
const { TICKET_TYPES } = require('../../utils/ticketCreate');

const TYPES = [
  { name: 'View settings', value: 'view' },
  { name: 'Command channel', value: 'command_channel' },
  { name: 'Auto-mod', value: 'automod' },
  { name: 'Staff role', value: 'staffrole' },
  { name: 'DJ role', value: 'djrole' },
  { name: 'Embed color', value: 'embedcolor' },
  { name: 'Gemini API key', value: 'geminikey' },
  { name: 'Welcome', value: 'welcome' },
  { name: 'Leave', value: 'leave' },
  { name: 'Mod log', value: 'modlog' },
  { name: 'Auto role', value: 'autorole' },
  { name: 'Tickets', value: 'ticket' },
  { name: 'XP', value: 'xp' },
  { name: 'Prefix', value: 'prefix' },
  { name: 'Radio', value: 'radio' },
  { name: 'Counting', value: 'counting' },
  { name: 'Guess the flag', value: 'guessflag' },
  { name: 'Guess the number', value: 'guessnumber' },
  { name: 'Word snake', value: 'wordsnake' },
  { name: 'Temp voice', value: 'tempvoice' },
  { name: 'Suggestions', value: 'suggestions' },
  { name: 'Starboard', value: 'starboard' },
  { name: 'Reset all', value: 'reset' }
];

function channelInUseForCounting(channelId) {
  const counting = db.getCountingByChannel(channelId);
  return Boolean(counting?.channel_id);
}

function isTextSetupChannel(channel) {
  return channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Set up Sonnies for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt.setName('type')
        .setDescription('What to set up')
        .setRequired(true)
        .addChoices(...TYPES)
    )
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('Channel for this setup')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice)
        .setRequired(false)
    )
    .addChannelOption(opt =>
      opt.setName('category')
        .setDescription('Ticket category')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(false)
    )
    .addChannelOption(opt =>
      opt.setName('log_channel')
        .setDescription('Ticket log channel')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addRoleOption(opt =>
      opt.setName('role')
        .setDescription('Role for this setup')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('message')
        .setDescription('Welcome or leave message ({user} {server})')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('key')
        .setDescription('Gemini API key')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('symbol')
        .setDescription('Prefix symbol or starboard emoji')
        .setRequired(false)
    )
    .addBooleanOption(opt =>
      opt.setName('enabled')
        .setDescription('Enable/disable XP, or the welcome & leave image card')
        .setRequired(false)
    )
    .addIntegerOption(opt =>
      opt.setName('rate')
        .setDescription('XP multiplier (1-5)')
        .setMinValue(1)
        .setMaxValue(5)
        .setRequired(false)
    )
    .addBooleanOption(opt =>
      opt.setName('anti_link')
        .setDescription('Anti-link protection')
        .setRequired(false)
    )
    .addBooleanOption(opt =>
      opt.setName('anti_spam')
        .setDescription('Anti-spam protection')
        .setRequired(false)
    )
    .addBooleanOption(opt =>
      opt.setName('allow_double_counting')
        .setDescription('Allow the same user to count twice in a row')
        .setRequired(false)
    )
    .addIntegerOption(opt =>
      opt.setName('start_number')
        .setDescription('Counting start number')
        .setMinValue(0)
        .setRequired(false)
    )
    .addIntegerOption(opt =>
      opt.setName('count')
        .setDescription('Starboard reaction count')
        .setMinValue(1)
        .setMaxValue(20)
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('url')
        .setDescription('Radio stream URL')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('name')
        .setDescription('Radio station name or ticket panel title')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission Denied', 'You need `Administrator` permissions to manage server configuration.')],
        flags: 64
      });
    }

    const type = interaction.options.getString('type');
    const guildId = interaction.guild.id;
    const channel = interaction.options.getChannel('channel');

    if (type === 'view') {
      const cfg = db.getGuildConfig(guildId);
      const counting = db.getCounting(guildId);
      const games = db.getMinigames(guildId);
      const radio = db.getRadioConfig(guildId);

      const embed = createEmbed({
        title: `Server Configuration - ${interaction.guild.name}`,
        description: 'Current configuration settings for Sonnies Bot.',
        fields: [
          { name: 'Prefix', value: `\`${cfg.prefix || process.env.DEFAULT_PREFIX || '!'}\``, inline: true },
          { name: 'Command Channel', value: cfg.command_channel_id ? `<#${cfg.command_channel_id}>` : '`All channels`', inline: true },
          { name: 'Staff Role', value: cfg.staff_role_id ? `<@&${cfg.staff_role_id}>` : '`Not set`', inline: true },
          { name: 'DJ Role', value: cfg.dj_role_id ? `<@&${cfg.dj_role_id}>` : '`Open to everyone`', inline: true },
          { name: 'Embed Color', value: cfg.embed_color ? `\`${cfg.embed_color}\`` : '`Default (Blurple)`', inline: true },
          { name: 'Mod Log', value: cfg.mod_log_channel_id ? `<#${cfg.mod_log_channel_id}>` : '`Not set`', inline: true },
          { name: 'Welcome', value: cfg.welcome_channel_id ? `<#${cfg.welcome_channel_id}>` : '`Not set`', inline: true },
          { name: 'Leave', value: cfg.leave_channel_id ? `<#${cfg.leave_channel_id}>` : '`Not set`', inline: true },
          { name: 'Auto Role', value: cfg.auto_role_id ? `<@&${cfg.auto_role_id}>` : '`Not set`', inline: true },
          { name: 'Ticket Category', value: cfg.ticket_category_id ? `<#${cfg.ticket_category_id}>` : '`Not set`', inline: true },
          { name: 'Radio', value: radio?.channel_id ? `<#${radio.channel_id}>` : '`Not set`', inline: true },
          { name: 'Counting', value: counting.channel_id ? `<#${counting.channel_id}>` : '`Not set`', inline: true },
          { name: 'Guess the Flag', value: games.flag?.channel_id ? `<#${games.flag.channel_id}>` : '`Not set`', inline: true },
          { name: 'Guess the Number', value: games.number?.channel_id ? `<#${games.number.channel_id}>` : '`Not set`', inline: true },
          { name: 'Word Snake', value: games.snake?.channel_id ? `<#${games.snake.channel_id}>` : '`Not set`', inline: true },
          { name: 'Temp Voice', value: cfg.temp_vc_hub_id ? `<#${cfg.temp_vc_hub_id}>` : '`Not set`', inline: true },
          { name: 'Suggestions', value: cfg.suggestions_channel_id ? `<#${cfg.suggestions_channel_id}>` : '`Not set`', inline: true },
          { name: 'Starboard', value: cfg.starboard_channel_id ? `<#${cfg.starboard_channel_id}> (${cfg.starboard_emoji || '⭐'} x${cfg.starboard_count || 3})` : '`Not set`', inline: true },
          { name: 'XP System', value: cfg.xp_enabled ? `Enabled (${cfg.xp_rate || 1}x)` : 'Disabled', inline: true },
          { name: 'Anti-Link', value: cfg.anti_link === 1 ? 'Enabled' : 'Disabled', inline: true },
          { name: 'Anti-Spam', value: cfg.anti_spam === 1 ? 'Enabled' : 'Disabled', inline: true },
          { name: 'Gemini API Key', value: cfg.gemini_api_key ? '`Configured`' : '`Default (.env)`', inline: true },
          { name: 'Welcome Msg', value: `\`${cfg.welcome_message || 'Default'}\``, inline: false },
          { name: 'Leave Msg', value: `\`${cfg.leave_message || 'Default'}\``, inline: false }
        ]
      });
      return interaction.reply({ embeds: [embed] });
    }

    if (type === 'command_channel') {
      if (!channel) {
        db.updateGuildConfig(guildId, 'command_channel_id', null);
        return interaction.reply({
          embeds: [successEmbed('Command Channel Restriction Removed', 'Commands can now be executed in **all channels**.')]
        });
      }
      if (!isTextSetupChannel(channel)) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid Channel', 'Provide a text channel for command restriction.')],
          flags: 64
        });
      }
      db.updateGuildConfig(guildId, 'command_channel_id', channel.id);
      return interaction.reply({
        embeds: [successEmbed('Command Channel Configured', `Commands are now restricted to ${channel}.`)]
      });
    }

    if (type === 'automod') {
      const antiLink = interaction.options.getBoolean('anti_link');
      const antiSpam = interaction.options.getBoolean('anti_spam');
      if (antiLink !== null && antiLink !== undefined) db.updateGuildConfig(guildId, 'anti_link', antiLink ? 1 : 0);
      if (antiSpam !== null && antiSpam !== undefined) db.updateGuildConfig(guildId, 'anti_spam', antiSpam ? 1 : 0);
      const cfg = db.getGuildConfig(guildId);
      return interaction.reply({
        embeds: [successEmbed('Auto-Mod Settings Updated', `Anti-Link: **${cfg.anti_link === 1 ? 'Enabled' : 'Disabled'}**\nAnti-Spam: **${cfg.anti_spam === 1 ? 'Enabled' : 'Disabled'}**`)]
      });
    }

    if (type === 'staffrole') {
      const role = interaction.options.getRole('role');
      if (!role) {
        db.updateGuildConfig(guildId, 'staff_role_id', null);
        return interaction.reply({ embeds: [successEmbed('Staff Role Cleared', 'Only members with Administrator permissions have staff access.')] });
      }
      db.updateGuildConfig(guildId, 'staff_role_id', role.id);
      return interaction.reply({ embeds: [successEmbed('Staff Role Set', `Members with ${role} now have staff access.`)] });
    }

    if (type === 'djrole') {
      const role = interaction.options.getRole('role');
      if (!role) {
        db.updateGuildConfig(guildId, 'dj_role_id', null);
        return interaction.reply({
          embeds: [successEmbed('DJ Role Cleared', 'Music controls are open to everyone again.')]
        });
      }
      db.updateGuildConfig(guildId, 'dj_role_id', role.id);
      return interaction.reply({
        embeds: [successEmbed('DJ Role Set',
          `Skip, stop, pause, resume, volume, shuffle, loop, seek, filter, and autoplay now require ${role}.

` +
          'Administrators, members with **Manage Server**, and the staff role always pass. ' +
          'Anyone alone in the voice channel with me can still control playback, and members can always skip or pause a track they queued themselves.')]
      });
    }

    if (type === 'embedcolor') {
      const symbol = interaction.options.getString('symbol');
      if (!symbol) {
        db.updateGuildConfig(guildId, 'embed_color', null);
        return interaction.reply({
          embeds: [successEmbed('Embed Color Reset', 'All Sonnies embeds in this server are back to the default **Blurple** color.')]
        });
      }
      const parsed = parseHexColor(symbol);
      if (parsed === null) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid Color', 'Provide a valid 6-digit hex color code using the `symbol` option, e.g. `#5865F2`.')],
          flags: 64
        });
      }
      const normalized = `#${parsed.toString(16).padStart(6, '0').toUpperCase()}`;
      db.updateGuildConfig(guildId, 'embed_color', normalized);
      return interaction.reply({
        embeds: [successEmbed('Embed Color Updated', `Every embed Sonnies sends in this server will now use \`${normalized}\`.`)]
      });
    }

    if (type === 'geminikey') {
      const key = interaction.options.getString('key');
      if (!key) {
        return interaction.reply({ embeds: [errorEmbed('Missing Key', 'Provide a Gemini API key with the `key` option.')], flags: 64 });
      }
      db.updateGuildConfig(guildId, 'gemini_api_key', key);
      return interaction.reply({
        embeds: [successEmbed('Gemini API Key Saved', 'Custom Google Gemini API key configured for this server.')],
        flags: 64
      });
    }

    if (type === 'welcome') {
      if (!channel) {
        return interaction.reply({ embeds: [errorEmbed('Missing Channel', 'Provide a `channel` for welcome messages.')], flags: 64 });
      }
      if (!isTextSetupChannel(channel)) {
        return interaction.reply({ embeds: [errorEmbed('Invalid Channel', 'Provide a text channel for welcome messages.')], flags: 64 });
      }
      const message = interaction.options.getString('message');
      const cardEnabled = interaction.options.getBoolean('enabled');
      db.updateGuildConfig(guildId, 'welcome_channel_id', channel.id);
      if (message) db.updateGuildConfig(guildId, 'welcome_message', message);
      if (cardEnabled !== null) db.updateGuildConfig(guildId, 'welcome_card', cardEnabled ? 1 : 0);
      const welcomeCfg = db.getGuildConfig(guildId);
      return interaction.reply({
        embeds: [successEmbed('Welcome Configuration Updated',
          `Welcome messages will be sent to ${channel}.${message ? `\nMessage: "${message}"` : ''}\n` +
          `Image card: **${welcomeCfg.welcome_card === 0 ? 'Off' : 'On'}** (toggle with the \`enabled\` option)\n` +
          'Placeholders: `{user}` `{username}` `{server}` `{membercount}`')]
      });
    }

    if (type === 'leave') {
      if (!channel) {
        return interaction.reply({ embeds: [errorEmbed('Missing Channel', 'Provide a `channel` for leave messages.')], flags: 64 });
      }
      if (!isTextSetupChannel(channel)) {
        return interaction.reply({ embeds: [errorEmbed('Invalid Channel', 'Provide a text channel for leave messages.')], flags: 64 });
      }
      const message = interaction.options.getString('message');
      db.updateGuildConfig(guildId, 'leave_channel_id', channel.id);
      if (message) db.updateGuildConfig(guildId, 'leave_message', message);
      return interaction.reply({
        embeds: [successEmbed('Leave Configuration Updated', `Goodbye messages will be sent to ${channel}.${message ? `\nMessage: "${message}"` : ''}`)]
      });
    }

    if (type === 'modlog') {
      if (!channel) {
        return interaction.reply({ embeds: [errorEmbed('Missing Channel', 'Provide a `channel` for mod logs.')], flags: 64 });
      }
      if (!isTextSetupChannel(channel)) {
        return interaction.reply({ embeds: [errorEmbed('Invalid Channel', 'Provide a text channel for mod logs.')], flags: 64 });
      }
      db.updateGuildConfig(guildId, 'mod_log_channel_id', channel.id);
      return interaction.reply({
        embeds: [successEmbed('Mod Log Channel Set', `Moderation events will be logged in ${channel}.`)]
      });
    }

    if (type === 'autorole') {
      const role = interaction.options.getRole('role');
      if (!role) {
        return interaction.reply({ embeds: [errorEmbed('Missing Role', 'Provide a `role` for auto-role.')], flags: 64 });
      }
      db.updateGuildConfig(guildId, 'auto_role_id', role.id);
      return interaction.reply({
        embeds: [successEmbed('Auto-Role Set', `New members will receive ${role}.`)]
      });
    }

    if (type === 'ticket') {
      const category = interaction.options.getChannel('category');
      const logChannel = interaction.options.getChannel('log_channel');
      if (category) db.updateGuildConfig(guildId, 'ticket_category_id', category.id);
      if (logChannel) db.updateGuildConfig(guildId, 'ticket_log_channel_id', logChannel.id);

      if (channel) {
        if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
          return interaction.reply({
            embeds: [errorEmbed('Invalid Channel', 'Provide a text channel to post the ticket panel.')],
            flags: 64
          });
        }
        const title = interaction.options.getString('name') || 'Support Tickets';
        const description = interaction.options.getString('message') || 'Need assistance from staff? Choose a ticket type below. You will be asked for a subject and details.';
        const panelEmbed = createEmbed({
          title,
          description,
          footerText: 'Sonnies Ticket System'
        });
        const menu = new StringSelectMenuBuilder()
          .setCustomId('ticket_type')
          .setPlaceholder('Choose a ticket type')
          .addOptions(
            Object.entries(TICKET_TYPES).map(([id, info]) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(info.label)
                .setDescription(info.description)
                .setValue(id)
            )
          );
        const row = new ActionRowBuilder().addComponents(menu);
        await channel.send({ embeds: [panelEmbed], components: [row] });
        const extra = [];
        if (category) extra.push(`Tickets will be created under **${category.name}**.`);
        if (logChannel) extra.push(`Logs go to ${logChannel}.`);
        return interaction.reply({
          embeds: [successEmbed('Ticket Panel Posted', `Ticket panel sent to ${channel}.${extra.length ? `\n${extra.join(' ')}` : ''}`)]
        });
      }

      if (!category && !logChannel) {
        return interaction.reply({
          embeds: [errorEmbed('Missing Options', 'Provide a `category` to configure tickets, or a `channel` to post the ticket panel.')],
          flags: 64
        });
      }

      return interaction.reply({
        embeds: [successEmbed('Ticket System Configured', `Tickets will be created under **${category ? category.name : 'the saved category'}**${logChannel ? ` and logged in ${logChannel}` : ''}.`)]
      });
    }

    if (type === 'xp') {
      const enabled = interaction.options.getBoolean('enabled');
      if (enabled === null || enabled === undefined) {
        return interaction.reply({ embeds: [errorEmbed('Missing Option', 'Set `enabled` to true or false.')], flags: 64 });
      }
      const rate = interaction.options.getInteger('rate') || 1;
      db.updateGuildConfig(guildId, 'xp_enabled', enabled ? 1 : 0);
      db.updateGuildConfig(guildId, 'xp_rate', rate);
      return interaction.reply({
        embeds: [successEmbed('XP System Settings Updated', `XP leveling is **${enabled ? 'Enabled' : 'Disabled'}** with multiplier **${rate}x**.`)]
      });
    }

    if (type === 'prefix') {
      const symbol = interaction.options.getString('symbol');
      if (!symbol) {
        const cfg = db.getGuildConfig(guildId);
        const current = cfg.prefix || process.env.DEFAULT_PREFIX || '!';
        return interaction.reply({
          embeds: [infoEmbed('Server Prefix', `Current prefix is \`${current}\`. Provide \`symbol\` to change it.`)]
        });
      }
      db.updateGuildConfig(guildId, 'prefix', symbol);
      return interaction.reply({
        embeds: [successEmbed('Prefix Updated', `Server prefix is now \`${symbol}\`.`)]
      });
    }

    if (type === 'radio') {
      const musicManager = require('../../utils/musicManager');
      if (!channel) {
        db.disableRadio(guildId);
        const musicQueue = musicManager.getQueue(guildId, interaction.client);
        musicQueue.destroy();
        return interaction.reply({
          embeds: [successEmbed('Radio Disabled', '24/7 radio has been disabled.')]
        });
      }
      if (channel.type !== ChannelType.GuildVoice) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid Channel', 'Provide a voice channel for radio.')],
          flags: 64
        });
      }
      const url = interaction.options.getString('url');
      if (!url) {
        return interaction.reply({
          embeds: [errorEmbed('Missing URL', 'Provide a stream `url` for radio.')],
          flags: 64
        });
      }
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid Stream URL', 'Provide a valid HTTP or HTTPS stream URL.')],
          flags: 64
        });
      }
      const stationName = interaction.options.getString('name') || '24/7 Radio Station';
      await interaction.deferReply();
      db.setRadioConfig(guildId, {
        channel_id: channel.id,
        stream_url: url,
        station_name: stationName,
        active: true
      });
      const musicQueue = musicManager.getQueue(guildId, interaction.client);
      await musicQueue.startRadio(channel.id, url, stationName);
      return interaction.editReply({
        embeds: [successEmbed('Radio Configured', `**Station:** ${stationName}\n**Channel:** ${channel}\n**Stream:** \`${url}\`\n\nWhen someone uses \`/music play\`, radio pauses and resumes when the queue ends.`)]
      });
    }

    if (type === 'counting') {
      if (!channel) {
        db.disableCounting(guildId);
        return interaction.reply({
          embeds: [successEmbed('Counting Disabled', 'The counting minigame has been disabled.')]
        });
      }
      if (!isTextSetupChannel(channel)) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid Channel', 'Provide a text channel for counting.')],
          flags: 64
        });
      }
      const allowDouble = interaction.options.getBoolean('allow_double_counting') ?? false;
      const startNumber = interaction.options.getInteger('start_number');
      const counting = db.setCountingConfig(guildId, {
        channel_id: channel.id,
        allow_double_counting: allowDouble,
        start_number: startNumber ?? 0
      });
      return interaction.reply({
        embeds: [successEmbed('Counting Configured', `Counting is now active in ${channel}.\nNext number: **${(counting.current_count || 0) + 1}**\nDouble counting: **${allowDouble ? 'Allowed' : 'Disabled'}**.`)]
      });
    }

    if (type === 'guessflag') {
      if (!channel) {
        db.disableMinigame(guildId, 'flag');
        return interaction.reply({
          embeds: [successEmbed('Guess the Flag Disabled', 'Guess the flag has been disabled.')]
        });
      }
      if (!isTextSetupChannel(channel)) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid Channel', 'Provide a text channel for guess the flag.')],
          flags: 64
        });
      }
      if (channelInUseForCounting(channel.id)) {
        return interaction.reply({
          embeds: [errorEmbed('Channel In Use', `${channel} is already used for counting.`)],
          flags: 64
        });
      }
      const flag = pickFlag();
      db.setMinigameChannel(guildId, 'flag', channel.id, { code: flag.code });
      await channel.send({ embeds: [flagPromptEmbed(flag)] }).catch(() => {});
      return interaction.reply({
        embeds: [successEmbed('Guess the Flag Configured', `Guess the flag is now active in ${channel}.`)]
      });
    }

    if (type === 'guessnumber') {
      if (!channel) {
        db.disableMinigame(guildId, 'number');
        return interaction.reply({
          embeds: [successEmbed('Guess the Number Disabled', 'Guess the number has been disabled.')]
        });
      }
      if (!isTextSetupChannel(channel)) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid Channel', 'Provide a text channel for guess the number.')],
          flags: 64
        });
      }
      if (channelInUseForCounting(channel.id)) {
        return interaction.reply({
          embeds: [errorEmbed('Channel In Use', `${channel} is already used for counting.`)],
          flags: 64
        });
      }
      const number = pickNumber();
      db.setMinigameChannel(guildId, 'number', channel.id, { number });
      await channel.send({ embeds: [numberPromptEmbed()] }).catch(() => {});
      return interaction.reply({
        embeds: [successEmbed('Guess the Number Configured', `Guess the number is now active in ${channel}.`)]
      });
    }

    if (type === 'wordsnake') {
      if (!channel) {
        db.disableMinigame(guildId, 'snake');
        return interaction.reply({
          embeds: [successEmbed('Word Snake Disabled', 'Word snake has been disabled.')]
        });
      }
      if (!isTextSetupChannel(channel)) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid Channel', 'Provide a text channel for word snake.')],
          flags: 64
        });
      }
      if (channelInUseForCounting(channel.id)) {
        return interaction.reply({
          embeds: [errorEmbed('Channel In Use', `${channel} is already used for counting.`)],
          flags: 64
        });
      }
      const word = pickSnakeStart();
      db.setMinigameChannel(guildId, 'snake', channel.id, { lastWord: word, lastUserId: null, used: [word] });
      await channel.send({ embeds: [snakePromptEmbed(word)] }).catch(() => {});
      return interaction.reply({
        embeds: [successEmbed('Word Snake Configured', `Word snake is now active in ${channel}.`)]
      });
    }

    if (type === 'tempvoice') {
      if (!channel) {
        db.updateGuildConfig(guildId, 'temp_vc_hub_id', null);
        db.updateGuildConfig(guildId, 'temp_vc_category_id', null);
        return interaction.reply({ embeds: [successEmbed('Temp Voice Disabled', 'Join-to-create voice channels are off.')] });
      }
      if (channel.type !== ChannelType.GuildVoice) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid Channel', 'Provide a voice channel as the hub members join to create a VC.')],
          flags: 64
        });
      }
      const category = interaction.options.getChannel('category');
      db.updateGuildConfig(guildId, 'temp_vc_hub_id', channel.id);
      db.updateGuildConfig(guildId, 'temp_vc_category_id', category?.id || channel.parentId || null);
      return interaction.reply({
        embeds: [successEmbed('Temp Voice Configured', `Joining ${channel} will create a personal voice channel.${category ? `\nNew channels go under **${category.name}**.` : ''}`)]
      });
    }

    if (type === 'suggestions') {
      if (!channel) {
        db.updateGuildConfig(guildId, 'suggestions_channel_id', null);
        return interaction.reply({ embeds: [successEmbed('Suggestions Disabled', 'Suggestions will post in the current channel until you set one.')] });
      }
      if (!isTextSetupChannel(channel)) {
        return interaction.reply({ embeds: [errorEmbed('Invalid Channel', 'Provide a text channel for suggestions.')], flags: 64 });
      }
      db.updateGuildConfig(guildId, 'suggestions_channel_id', channel.id);
      return interaction.reply({ embeds: [successEmbed('Suggestions Channel Set', `Suggestions will be posted in ${channel}.`)] });
    }

    if (type === 'starboard') {
      if (!channel) {
        db.updateGuildConfig(guildId, 'starboard_channel_id', null);
        return interaction.reply({ embeds: [successEmbed('Starboard Disabled', 'Starboard is off.')] });
      }
      if (!isTextSetupChannel(channel)) {
        return interaction.reply({ embeds: [errorEmbed('Invalid Channel', 'Provide a text channel for starboard.')], flags: 64 });
      }
      const emoji = interaction.options.getString('symbol') || '⭐';
      const count = interaction.options.getInteger('count') || 3;
      db.updateGuildConfig(guildId, 'starboard_channel_id', channel.id);
      db.updateGuildConfig(guildId, 'starboard_emoji', emoji);
      db.updateGuildConfig(guildId, 'starboard_count', count);
      return interaction.reply({
        embeds: [successEmbed('Starboard Configured', `Messages with **${count}× ${emoji}** will be posted in ${channel}.`)]
      });
    }

    if (type === 'reset') {
      db.resetGuildConfig(guildId);
      return interaction.reply({
        embeds: [successEmbed('Configuration Reset', 'All server configuration settings have been reset to defaults.')]
      });
    }

    return interaction.reply({
      embeds: [errorEmbed('Unknown Type', 'Pick a setup type from the list.')],
      flags: 64
    });
  }
};
