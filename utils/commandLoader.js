const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const Logger = require('./logger');

const FOLDER_META = {
  music: { name: 'music', description: 'Play and control music' },
  moderation: { name: 'moderation', description: 'Staff moderation tools' },
  economy: {
    name: 'economy',
    description: 'Coins, jobs, gathering, and casino',
    groups: {
      wallet: {
        description: 'Balance, shop, and paydays',
        commands: ['balance', 'deposit', 'withdraw', 'pay', 'daily', 'hourly', 'weekly', 'monthly', 'work', 'leaderboard', 'inventory', 'shop', 'buy', 'sell', 'sellall', 'use']
      },
      gather: {
        description: 'Jobs and collecting',
        commands: ['fish', 'hunt', 'mine', 'dig', 'search', 'beg', 'crime', 'rob', 'stream', 'explore', 'postmeme', 'chores', 'hack', 'youtuber']
      },
      casino: {
        description: 'Gambling and minigames',
        commands: ['mines', 'crash', 'highlow', 'scratch', 'wheel', 'dicebet', 'blackjack', 'roulette', 'slots', 'heist', 'trivia']
      },
      social: {
        description: 'Profiles, quests, marriage, trading, and prestige',
        commands: ['profile', 'quests', 'achievements', 'lottery', 'trade', 'marry', 'divorce', 'prestige', 'roleshop']
      }
    }
  },
  utility: { name: 'utility', description: 'Server tools and community commands' },
  search: { name: 'search', description: 'Look up web results and media' },
  images: { name: 'images', description: 'Pictures, avatars, and memes' },
  giveaways: { name: 'giveaway', description: 'Start and manage giveaways' },
  gaming: { name: 'gaming', description: 'Minecraft and Roblox lookups' },
  fun: { name: 'fun', description: 'Party games and counting' },
  leveling: { name: 'leveling', description: 'XP ranks and rewards' },
  tools: { name: 'tools', description: 'Lookups, snipes, translation, and server utilities' }
};

const SUBCOMMAND_RENAME = {
  gstart: 'start',
  gend: 'end',
  gereroll: 'reroll'
};

function hasNested(json) {
  return (json.options || []).some((opt) => opt.type === 1 || opt.type === 2);
}

function applyOption(builder, opt) {
  const configure = (option) => {
    option.setName(opt.name).setDescription(opt.description || opt.name);
    if (opt.required) option.setRequired(true);
    if (Array.isArray(opt.choices) && opt.choices.length) {
      option.addChoices(...opt.choices.map((choice) => ({ name: choice.name, value: choice.value })));
    }
    if (opt.min_value !== undefined && typeof option.setMinValue === 'function') option.setMinValue(opt.min_value);
    if (opt.max_value !== undefined && typeof option.setMaxValue === 'function') option.setMaxValue(opt.max_value);
    if (opt.min_length !== undefined && typeof option.setMinLength === 'function') option.setMinLength(opt.min_length);
    if (opt.max_length !== undefined && typeof option.setMaxLength === 'function') option.setMaxLength(opt.max_length);
    if (opt.autocomplete && typeof option.setAutocomplete === 'function') option.setAutocomplete(true);
    if (Array.isArray(opt.channel_types) && opt.channel_types.length && typeof option.addChannelTypes === 'function') {
      option.addChannelTypes(...opt.channel_types);
    }
    return option;
  };

  switch (opt.type) {
    case 3:
      builder.addStringOption(configure);
      break;
    case 4:
      builder.addIntegerOption(configure);
      break;
    case 5:
      builder.addBooleanOption(configure);
      break;
    case 6:
      builder.addUserOption(configure);
      break;
    case 7:
      builder.addChannelOption(configure);
      break;
    case 8:
      builder.addRoleOption(configure);
      break;
    case 9:
      builder.addMentionableOption(configure);
      break;
    case 10:
      builder.addNumberOption(configure);
      break;
    case 11:
      builder.addAttachmentOption(configure);
      break;
    default:
      break;
  }
}

function fillSubcommand(sub, json) {
  sub.setName(json.name).setDescription(String(json.description || json.name).slice(0, 100));
  for (const opt of json.options || []) {
    if (opt.type === 1 || opt.type === 2) continue;
    applyOption(sub, opt);
  }
  return sub;
}

function fillGroup(group, json) {
  group.setName(json.name).setDescription(String(json.description || json.name).slice(0, 100));
  for (const opt of json.options || []) {
    if (opt.type === 1) {
      group.addSubcommand((sub) => fillSubcommand(sub, opt));
    }
  }
  return group;
}

function composeFolder(folderName, modules) {
  const meta = FOLDER_META[folderName];
  const parent = new SlashCommandBuilder()
    .setName(meta.name)
    .setDescription(meta.description);

  const leafModules = new Map();
  const groupModules = new Map();

  if (meta.groups) {
    for (const [groupName, groupMeta] of Object.entries(meta.groups)) {
      for (const cmdName of groupMeta.commands) {
        const mod = modules.find((item) => item.data.name === cmdName);
        if (!mod) {
          Logger.warn(`Missing command ${cmdName} for /${meta.name} ${groupName}`);
          continue;
        }
        const json = mod.data.toJSON();
        if (hasNested(json)) {
          Logger.error(`Cannot nest /${json.name} under /${meta.name} ${groupName}`);
          continue;
        }
        const subName = SUBCOMMAND_RENAME[json.name] || json.name;
        leafModules.set(subName, mod);
      }
      parent.addSubcommandGroup((builder) => {
        builder.setName(groupName).setDescription(groupMeta.description);
        for (const cmdName of groupMeta.commands) {
          const mod = modules.find((item) => item.data.name === cmdName);
          if (!mod) continue;
          const json = mod.data.toJSON();
          if (hasNested(json)) continue;
          const subName = SUBCOMMAND_RENAME[json.name] || json.name;
          builder.addSubcommand((sub) => fillSubcommand(sub, { ...json, name: subName }));
        }
        return builder;
      });
    }
  } else if (modules.length === 1 && hasNested(modules[0].data.toJSON())) {
    return modules[0];
  } else {
    for (const mod of modules) {
      const json = mod.data.toJSON();
      const subName = SUBCOMMAND_RENAME[json.name] || json.name;
      if (hasNested(json)) {
        parent.addSubcommandGroup((group) => fillGroup(group, { ...json, name: subName }));
        groupModules.set(subName, mod);
      } else {
        parent.addSubcommand((sub) => fillSubcommand(sub, { ...json, name: subName }));
        leafModules.set(subName, mod);
      }
    }
  }

  return {
    data: parent,
    async execute(interaction) {
      const group = interaction.options.getSubcommandGroup(false);
      const sub = interaction.options.getSubcommand(false);
      if (group && groupModules.has(group)) {
        return groupModules.get(group).execute(interaction);
      }
      const target = leafModules.get(sub);
      if (!target) {
        Logger.warn(`No handler for /${meta.name} ${group || ''} ${sub || ''}`);
        return interaction.reply({
          content: 'That subcommand is not available.',
          flags: 64
        }).catch(() => {});
      }
      return target.execute(interaction);
    }
  };
}

function loadCommands(commandsPath) {
  const prefixCommands = [];
  const byFolder = {};
  if (!fs.existsSync(commandsPath)) return { slashCommands: [], prefixCommands };

  const commandFolders = fs.readdirSync(commandsPath);
  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    if (!fs.lstatSync(folderPath).isDirectory()) continue;
    byFolder[folder] = [];

    const commandFiles = fs.readdirSync(folderPath).filter((file) => file.endsWith('.js'));
    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);
      try {
        const command = require(filePath);
        if (command.data && command.execute) {
          prefixCommands.push(command);
          byFolder[folder].push(command);
        } else {
          Logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
      } catch (err) {
        Logger.error(`Failed to load command ${filePath}:`, err);
      }
    }
  }

  const slashCommands = [];
  for (const [folder, modules] of Object.entries(byFolder)) {
    if (!modules.length) continue;
    if (FOLDER_META[folder]) {
      slashCommands.push(composeFolder(folder, modules));
    } else {
      slashCommands.push(...modules);
    }
  }

  return { slashCommands, prefixCommands };
}

async function deployCommands(commands) {
  const token = process.env.DISCORD_TOKEN || '';
  const clientId = process.env.CLIENT_ID || '';
  const guildId = process.env.GUILD_ID || '';

  if (!token || token === 'your_bot_token_here') {
    Logger.error('DISCORD_TOKEN is not set in .env! Command deployment aborted.');
    return false;
  }
  if (!clientId) {
    Logger.error('CLIENT_ID is not set in .env! Command deployment aborted.');
    return false;
  }

  const body = [];
  for (const command of commands) {
    if (command.data && typeof command.data.toJSON === 'function') {
      body.push(command.data.toJSON());
    }
  }

  const rest = new REST({ version: '10' }).setToken(token);
  Logger.info(`Started refreshing ${body.length} application (/) commands.`);

  try {
    let data;
    if (guildId) {
      data = await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body }
      );
      Logger.success(`Successfully reloaded ${data.length} guild (/) commands for Guild ID: ${guildId}`);
    } else {
      data = await rest.put(
        Routes.applicationCommands(clientId),
        { body }
      );
      Logger.success(`Successfully reloaded ${data.length} global (/) commands.`);
    }
    return true;
  } catch (error) {
    Logger.error('Failed to deploy slash commands:', error);
    return false;
  }
}

module.exports = { loadCommands, deployCommands };
