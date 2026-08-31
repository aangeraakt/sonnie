require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const Logger = require('./utils/logger');
const db = require('./database/db');
const { loadCommands, deployCommands } = require('./utils/commandLoader');
const { installComponentsV2 } = require('./utils/componentsV2');

// Installed before anything can send: it rewrites every outgoing embed into a
// Components V2 container on its way to the API.
if (installComponentsV2()) {
  Logger.info('Components V2 rendering enabled for all embeds.');
} else {
  Logger.warn('Components V2 rendering is disabled - embeds will send in classic format.');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildExpressions
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.Reaction, Partials.User]
});

client.commands = new Collection();
client.db = db;
client.startedAt = Date.now();

const commandsPath = path.join(__dirname, 'commands');
const loadedCommands = loadCommands(commandsPath);
client.prefixCommands = new Collection();
for (const command of loadedCommands.prefixCommands) {
  client.prefixCommands.set(command.data.name, command);
  Logger.info(`Registered command handler: ${command.data.name}`);
}
for (const command of loadedCommands.slashCommands) {
  client.commands.set(command.data.name, command);
  Logger.info(`Registered slash command: /${command.data.name}`);
}

const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    try {
      const event = require(filePath);

      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
      }
      Logger.info(`Loaded event listener: ${event.name}`);
    } catch (err) {
      Logger.error(`Failed to load event ${filePath}:`, err);
    }
  }
}

process.on('unhandledRejection', (reason, promise) => {
  Logger.error('Unhandled Rejection at:', promise);
  Logger.error('Reason:', reason);
});

process.on('uncaughtException', (err) => {
  Logger.error('Uncaught Exception thrown:', err);
});

async function start() {
  const token = process.env.DISCORD_TOKEN || '';
  if (!token || token === 'your_bot_token_here') {
    Logger.error('DISCORD_TOKEN is missing or default in .env file!');
    Logger.warn('Please fill in DISCORD_TOKEN and CLIENT_ID in your .env file to start Sonnies bot.');
    process.exit(1);
  }

  // Under the sharding manager every shard runs this file, so only the first
  // one registers the command payload - the rest would be identical rewrites.
  const shardIds = process.env.SHARDS ? JSON.parse(process.env.SHARDS) : null;
  const isPrimary = !process.env.SHARDING_MANAGER || (Array.isArray(shardIds) && shardIds.includes(0));

  if (isPrimary) {
    await deployCommands(loadedCommands.slashCommands);
  } else {
    Logger.info('Skipping command deployment on this shard (handled by shard 0).');
  }

  try {
    await client.login(token);
  } catch (err) {
    Logger.error('Failed to log in to Discord:', err);
    process.exit(1);
  }
}

start().catch((err) => {
  Logger.error('Failed to start Sonnies:', err);
  process.exit(1);
});
