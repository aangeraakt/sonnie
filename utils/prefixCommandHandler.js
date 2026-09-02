const { PermissionFlagsBits } = require('discord.js');
const db = require('../database/db');
const Logger = require('./logger');
const { errorEmbed, createEmbed, withGuildColor } = require('./embedBuilder');

function toChannelPayload(options) {
  if (typeof options === 'string') return { content: options };
  const payload = { ...(options || {}) };
  delete payload.flags;
  delete payload.ephemeral;
  delete payload.fetchReply;
  delete payload.withResponse;
  return payload;
}

async function resolveMessageChannel(message) {
  const cached = message.client?.channels?.cache?.get(message.channelId) || message.channel;
  if (cached?.send) return cached;
  if (!message.channelId || !message.client?.channels?.fetch) return null;
  const fetched = await message.client.channels.fetch(message.channelId).catch(() => null);
  return fetched?.send ? fetched : null;
}

async function sendPrefixReply(message, options, channel = null) {
  const target = channel || await resolveMessageChannel(message);
  if (!target?.send) return null;
  return target.send(toChannelPayload(options));
}

async function handlePrefixCommand(message, client) {
  if (message.author.bot || !message.guild) return false;
  return withGuildColor(message.guild.id, () => runPrefixCommand(message, client));
}

async function runPrefixCommand(message, client) {
  const channel = await resolveMessageChannel(message);
  const cfg = db.getGuildConfig(message.guild.id);
  const prefix = cfg.prefix || process.env.DEFAULT_PREFIX || '!';

  if (!message.content.startsWith(prefix)) return false;

  const rawArgs = message.content.slice(prefix.length).trim().split(/\s+/);
  const commandName = rawArgs.shift()?.toLowerCase();

  if (!commandName) return false;

  let effectiveCommandName = commandName;
  if (commandName === 'bj') effectiveCommandName = 'blackjack';
  if (commandName === 'slot') effectiveCommandName = 'slots';
  if (commandName === 'roulettw') effectiveCommandName = 'roulette';
  if (commandName === 'hl') effectiveCommandName = 'highlow';
  if (commandName === 'scratchcard') effectiveCommandName = 'scratch';
  if (commandName === 'dice') effectiveCommandName = 'dicebet';
  if (commandName === 'bal') effectiveCommandName = 'balance';
  if (commandName === 'dep') effectiveCommandName = 'deposit';
  if (commandName === 'with') effectiveCommandName = 'withdraw';
  if (commandName === 'inv') effectiveCommandName = 'inventory';
  if (['guessflag', 'guessnumber', 'wordsnake', 'prefix'].includes(commandName)) effectiveCommandName = 'config';
  if (commandName === 'counting' && ['setup', 'disable'].includes(rawArgs[0]?.toLowerCase())) effectiveCommandName = 'config';
  if (commandName === 'ticket' && ['panel', 'setup'].includes(rawArgs[0]?.toLowerCase())) effectiveCommandName = 'config';
  if (commandName === 'radio' && rawArgs[0]?.toLowerCase() === 'set') effectiveCommandName = 'config';
  if (['ltccreate', 'ltcwallets', 'ltcbalance', 'ltcreceive', 'ltcsend', 'ltctx', 'ltcexport', 'ltcdelete'].includes(commandName)) {
    rawArgs.unshift({
      ltccreate: 'create',
      ltcwallets: 'wallets',
      ltcbalance: 'balance',
      ltcreceive: 'receive',
      ltcsend: 'send',
      ltctx: 'transactions',
      ltcexport: 'export',
      ltcdelete: 'delete'
    }[commandName]);
    effectiveCommandName = 'ltc';
  }
  if (['usdtcreate', 'usdtwallets', 'usdtbalance', 'usdtreceive', 'usdtsend', 'usdttx', 'usdtexport', 'usdtdelete'].includes(commandName)) {
    rawArgs.unshift({
      usdtcreate: 'create',
      usdtwallets: 'wallets',
      usdtbalance: 'balance',
      usdtreceive: 'receive',
      usdtsend: 'send',
      usdttx: 'transactions',
      usdtexport: 'export',
      usdtdelete: 'delete'
    }[commandName]);
    effectiveCommandName = 'usdt';
  }
  if (commandName === 'mcstatus' || commandName === 'mcserver') {
    rawArgs.unshift('status');
    effectiveCommandName = 'mc';
  }
  if (commandName === 'mcplayer' || commandName === 'mcskin') {
    rawArgs.unshift('player');
    effectiveCommandName = 'mc';
  }
  if (commandName === 'rblx' || commandName === 'rbx') effectiveCommandName = 'roblox';
  if (commandName === 'ip') effectiveCommandName = 'iplookup';
  if (commandName === 'asn') effectiveCommandName = 'asnlookup';
  if (commandName === 'bot') effectiveCommandName = 'botinfo';
  if (commandName === 'meme') effectiveCommandName = 'postmeme';
  if (commandName === 'np') effectiveCommandName = 'nowplaying';
  if (commandName === 'yt') effectiveCommandName = 'youtube';
  if (commandName === 'wiki') effectiveCommandName = 'wikipedia';
  if (['rt', 'rottentomatoes', 'film'].includes(commandName)) effectiveCommandName = 'movie';
  if (commandName === 'ask') effectiveCommandName = 'ai';
  if (commandName === 'df') effectiveCommandName = 'deepfry';
  if (commandName === 'greroll') effectiveCommandName = 'gereroll';
  if (commandName === 'giveaway') {
    const sub = rawArgs[0]?.toLowerCase();
    if (sub === 'start') {
      effectiveCommandName = 'gstart';
      rawArgs.shift();
    } else if (sub === 'end') {
      effectiveCommandName = 'gend';
      rawArgs.shift();
    } else if (sub === 'reroll' || sub === 'gereroll') {
      effectiveCommandName = 'gereroll';
      rawArgs.shift();
    }
  }

  const command = client.prefixCommands?.get(effectiveCommandName) || client.commands.get(effectiveCommandName);
  if (!command) {
    const tag = db.getTag(message.guild.id, commandName);
    if (!tag) return false;
    await sendPrefixReply(message, {
      embeds: [createEmbed({ title: commandName, description: tag.content })]
    }, channel).catch(() => {});
    return true;
  }

  // Enforce command channel restriction
  const allowedChannelId = cfg.command_channel_id || process.env.COMMAND_CHANNEL_ID;
  if (allowedChannelId && channel?.id !== allowedChannelId) {
    const isStaff = message.member.permissions.has(PermissionFlagsBits.Administrator) ||
                    message.member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                    message.member.permissions.has(PermissionFlagsBits.ManageMessages) ||
                    (cfg.staff_role_id && message.member.roles.cache.has(cfg.staff_role_id)) ||
                    message.guild.ownerId === message.author.id;

    if (!isStaff) {
      const alertMsg = await sendPrefixReply(message, {
        embeds: [errorEmbed('Commands Restricted 🔒', `Commands can only be used in <#${allowedChannelId}>!`)]
      }, channel).catch(() => null);

      if (alertMsg) {
        setTimeout(() => alertMsg.delete().catch(() => {}), 5000);
      }
      return true;
    }
  }

  // Mock interaction object so all slash command handlers execute via prefix commands smoothly
  const mockInteraction = {
    isChatInputCommand: () => true,
    isButton: () => false,
    client,
    guild: message.guild,
    channel: channel || message.channel,
    channelId: message.channelId || channel?.id,
    user: message.author,
    member: message.member,
    commandName: effectiveCommandName,
    replied: false,
    deferred: false,

    async reply(options) {
      this.replied = true;
      return sendPrefixReply(message, options, channel);
    },

    async followUp(options) {
      return sendPrefixReply(message, options, channel);
    },

    async deferReply() {
      this.deferred = true;
      return true;
    },

    async deleteReply() {
      return true;
    },

    sourceMessage: message,
    createdTimestamp: message.createdTimestamp,

    async editReply(options) {
      this.replied = true;
      return sendPrefixReply(message, options, channel);
    },

    options: {
      getSubcommandGroup() {
        return null;
      },
      getSubcommand() {
        if (effectiveCommandName === 'ai') {
          if (commandName === 'ask') return 'ask';
          const sub = rawArgs[0]?.toLowerCase();
          if (sub === 'whitelist' || sub === 'status') return sub;
          return 'ask';
        }
        if (effectiveCommandName === 'config') {
          return null;
        }
        if (effectiveCommandName === 'counting') {
          const sub = rawArgs[0]?.toLowerCase();
          if (!sub || sub === 'current' || sub === 'info' || sub === 'stats') return 'status';
          if (sub === 'lb' || sub === 'top') return 'leaderboard';
          return sub;
        }
        if (effectiveCommandName === 'ticket') {
          const sub = rawArgs[0]?.toLowerCase();
          if (['add', 'remove', 'close', 'claim', 'transcript'].includes(sub)) return sub;
          return 'transcript';
        }
        if (effectiveCommandName === 'radio') {
          const sub = rawArgs[0]?.toLowerCase();
          if (['play', 'stop', 'status'].includes(sub)) return sub;
          return 'status';
        }
        if (effectiveCommandName === 'ltc' || effectiveCommandName === 'usdt') {
          const sub = rawArgs[0]?.toLowerCase();
          if (sub === 'list') return 'wallets';
          if (sub === 'tx' || sub === 'txs') return 'transactions';
          if (sub === 'addr' || sub === 'address') return 'receive';
          if (sub === 'new') return 'create';
          if (['create', 'wallets', 'balance', 'receive', 'send', 'transactions', 'export', 'delete'].includes(sub)) return sub;
          return 'wallets';
        }
        if (effectiveCommandName === 'mc') {
          const sub = rawArgs[0]?.toLowerCase();
          if (sub === 'skin') return 'player';
          if (['status', 'player'].includes(sub)) return sub;
          return 'status';
        }
        if (effectiveCommandName === 'roblox') {
          const sub = rawArgs[0]?.toLowerCase();
          if (['user', 'userinfo', 'profile'].includes(sub)) return 'user';
          if (['inventory', 'inv', 'limiteds'].includes(sub)) return 'inventory';
          if (['avatar', 'wearing'].includes(sub)) return 'avatar';
          if (['game', 'games', 'experience'].includes(sub)) return 'game';
          if (['group', 'groups'].includes(sub)) return 'group';
          return 'user';
        }
        if (effectiveCommandName === 'remind') {
          const sub = rawArgs[0]?.toLowerCase();
          if (['set', 'list', 'cancel'].includes(sub)) return sub;
          return 'set';
        }
        if (effectiveCommandName === 'schedule') {
          const sub = rawArgs[0]?.toLowerCase();
          if (['create', 'list', 'cancel'].includes(sub)) return sub;
          return 'create';
        }
        if (effectiveCommandName === 'suggest') {
          const sub = rawArgs[0]?.toLowerCase();
          if (['post', 'accept', 'deny', 'implement'].includes(sub)) return sub;
          return 'post';
        }
        if (effectiveCommandName === 'tag') {
          const sub = rawArgs[0]?.toLowerCase();
          if (['create', 'delete', 'list', 'get'].includes(sub)) return sub;
          return 'get';
        }
        if (effectiveCommandName === 'sticky') {
          const sub = rawArgs[0]?.toLowerCase();
          if (['set', 'remove'].includes(sub)) return sub;
          return 'set';
        }
        if (effectiveCommandName === 'roles') {
          const sub = rawArgs[0]?.toLowerCase();
          if (['add', 'remove', 'list', 'panel'].includes(sub)) return sub;
          return 'list';
        }
        if (effectiveCommandName === 'case') {
          if (message.mentions.users.size) return 'user';
          const sub = rawArgs[0]?.toLowerCase();
          if (['view', 'user'].includes(sub)) return sub;
          return 'view';
        }
        return rawArgs[0] ? rawArgs[0].toLowerCase() : null;
      },
      getUser(name) {
        const mention = message.mentions.users.first();
        if (mention) return mention;
        const arg = rawArgs.find(a => /^\d{17,20}$/.test(a));
        if (arg) return client.users.cache.get(arg) || null;
        return null;
      },
      getMember(name) {
        const mention = message.mentions.members.first();
        if (mention) return mention;
        const arg = rawArgs.find(a => /^\d{17,20}$/.test(a));
        if (arg) return message.guild.members.cache.get(arg) || null;
        return null;
      },
      getString(name) {
        if (effectiveCommandName === 'ai' && name === 'prompt') {
          if (rawArgs[0]?.toLowerCase() === 'ask') {
            return rawArgs.slice(1).join(' ') || 'Hello';
          }
          return rawArgs.join(' ') || 'Hello';
        }

        if (effectiveCommandName === 'ai' && name === 'action') {
          return rawArgs[1]?.toLowerCase() || 'list';
        }

        if (effectiveCommandName === 'npm' && name === 'package') {
          return rawArgs.join(' ') || null;
        }

        if (effectiveCommandName === 'config' && name === 'type') {
          if (['guessflag', 'guessnumber', 'wordsnake'].includes(commandName)) return commandName;
          if (commandName === 'counting') return 'counting';
          if (commandName === 'prefix') return rawArgs[0]?.toLowerCase() === 'setup' ? 'prefix' : 'view';
          if (commandName === 'ticket') return 'ticket';
          if (commandName === 'radio') return 'radio';
          const first = rawArgs[0]?.toLowerCase();
          if (first === 'setup' || first === 'disable') return rawArgs[1]?.toLowerCase() || 'view';
          return first || 'view';
        }

        if (effectiveCommandName === 'config' && name === 'url') {
          return rawArgs.find((arg) => arg.startsWith('http://') || arg.startsWith('https://')) || null;
        }

        if (effectiveCommandName === 'config' && name === 'name') {
          const url = rawArgs.find((arg) => arg.startsWith('http://') || arg.startsWith('https://'));
          const skip = new Set(['setup', 'disable', 'panel', 'set', rawArgs[0], url]);
          const parts = rawArgs.filter((arg) => !skip.has(arg) && !arg.startsWith('<#') && !arg.startsWith('<@') && !arg.startsWith('http://') && !arg.startsWith('https://'));
          return parts.join(' ') || null;
        }

        if (effectiveCommandName === 'config' && (name === 'symbol' || name === 'key')) {
          return rawArgs.find((arg) => !arg.startsWith('<#') && !arg.startsWith('<@') && arg !== rawArgs[0] && arg !== 'setup') || rawArgs[1] || null;
        }

        if (effectiveCommandName === 'config' && name === 'message') {
          return rawArgs.slice(1).filter((arg) => !arg.startsWith('<#') && !arg.startsWith('<@')).join(' ') || null;
        }

        if (['google', 'youtube', 'github', 'wikipedia', 'iplookup', 'movie'].includes(effectiveCommandName) && name === 'query') {
          return rawArgs.join(' ') || null;
        }

        if (effectiveCommandName === 'asnlookup' && name === 'asn') {
          return rawArgs.join(' ') || null;
        }

        if (effectiveCommandName === 'weather' && name === 'city') {
          return rawArgs.join(' ') || null;
        }

        if (['buy', 'sell', 'use'].includes(effectiveCommandName) && name === 'item') {
          return rawArgs[0] || null;
        }

        if (effectiveCommandName === 'sell' && name === 'quantity') {
          return rawArgs[1] || '1';
        }

        if (effectiveCommandName === 'sellall' && name === 'category') {
          return rawArgs[0] || 'all';
        }

        if (effectiveCommandName === 'shop' && name === 'category') {
          return rawArgs[0] || null;
        }

        if (effectiveCommandName === 'roulette' && name === 'space') {
          const knownNamedSpaces = ['red', 'black', 'green', 'even', 'odd', 'low', 'high', '1st12', '2nd12', '3rd12', '1-18', '19-36', '1-12', '13-24', '25-36'];
          const namedArg = rawArgs.find(a => knownNamedSpaces.includes(a.toLowerCase()));
          if (namedArg) return namedArg.toLowerCase();

          if (rawArgs.length >= 2) {
            const n0 = parseInt(rawArgs[0], 10);
            const n1 = parseInt(rawArgs[1], 10);
            if (!isNaN(n0) && n0 >= 0 && n0 <= 36 && !isNaN(n1) && n1 > 36) {
              return String(n0);
            }
            if (!isNaN(n1) && n1 >= 0 && n1 <= 36) {
              return String(n1);
            }
          }
          return 'red';
        }

        if (effectiveCommandName === 'play' && name === 'query') {
          return rawArgs.join(' ');
        }
        if (effectiveCommandName === 'echo' && name === 'text') {
          return rawArgs.join(' ');
        }

        if (effectiveCommandName === 'ltc' && name === 'address') {
          return rawArgs.find((arg) => /^(ltc1|[LM3])[a-zA-Z0-9]{20,}$/i.test(arg)) || null;
        }

        if (effectiveCommandName === 'usdt' && name === 'address') {
          return rawArgs.find((arg) => /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(arg)) || null;
        }

        if (effectiveCommandName === 'ltc' && (name === 'wallet' || name === 'name')) {
          const skip = new Set(['create', 'wallets', 'list', 'balance', 'receive', 'send', 'transactions', 'tx', 'txs', 'delete', 'export', 'confirm', 'new', 'addr', 'address']);
          return rawArgs.find((arg) => !skip.has(arg.toLowerCase()) && !/^(ltc1|[LM3])/i.test(arg) && !/^\d+(\.\d+)?$/.test(arg)) || null;
        }

        if (effectiveCommandName === 'usdt' && (name === 'wallet' || name === 'name')) {
          const skip = new Set(['create', 'wallets', 'list', 'balance', 'receive', 'send', 'transactions', 'tx', 'txs', 'delete', 'export', 'confirm', 'new', 'addr', 'address']);
          return rawArgs.find((arg) => !skip.has(arg.toLowerCase()) && !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(arg) && !/^\d+(\.\d+)?$/.test(arg)) || null;
        }

        if (effectiveCommandName === 'mc' && name === 'host') {
          return rawArgs.find((arg) => arg.includes('.') || arg.includes(':')) || (['status', 'player', 'skin'].includes(rawArgs[0]?.toLowerCase()) ? rawArgs[1] : rawArgs[0]) || null;
        }

        if (effectiveCommandName === 'mc' && name === 'username') {
          if (['player', 'skin'].includes(rawArgs[0]?.toLowerCase())) return rawArgs[1] || null;
          return rawArgs.filter((arg) => !['status', 'bedrock'].includes(arg.toLowerCase()) && !arg.includes('.'))[0] || null;
        }

        if (effectiveCommandName === 'roblox' && name === 'username') {
          const skip = new Set(['user', 'userinfo', 'profile', 'inventory', 'inv', 'limiteds', 'avatar', 'wearing']);
          return rawArgs.find((arg) => !skip.has(arg.toLowerCase())) || rawArgs[1] || rawArgs[0] || null;
        }

        if (effectiveCommandName === 'roblox' && name === 'query') {
          const skip = new Set(['game', 'games', 'experience', 'group', 'groups']);
          if (skip.has(rawArgs[0]?.toLowerCase())) return rawArgs.slice(1).join(' ') || null;
          return rawArgs.join(' ') || null;
        }

        if (effectiveCommandName === 'remind' && name === 'duration') {
          if (['set', 'list', 'cancel'].includes(rawArgs[0]?.toLowerCase())) return rawArgs[1] || null;
          return rawArgs[0] || null;
        }
        if (effectiveCommandName === 'remind' && name === 'text') {
          if (rawArgs[0]?.toLowerCase() === 'set') return rawArgs.slice(2).join(' ') || null;
          return rawArgs.slice(1).join(' ') || null;
        }
        if (effectiveCommandName === 'schedule' && name === 'duration') {
          return rawArgs.find((arg) => /^\d+[smhd]$/i.test(arg)) || rawArgs[1] || null;
        }
        if (effectiveCommandName === 'schedule' && name === 'message') {
          const start = ['create', 'list', 'cancel'].includes(rawArgs[0]?.toLowerCase()) ? 1 : 0;
          return rawArgs.slice(start).filter((arg) => !arg.startsWith('<#') && !/^\d+[smhd]$/i.test(arg)).join(' ') || null;
        }
        if (effectiveCommandName === 'suggest' && name === 'text') {
          if (['post', 'accept', 'deny', 'implement'].includes(rawArgs[0]?.toLowerCase())) return rawArgs.slice(1).join(' ') || null;
          return rawArgs.join(' ') || null;
        }
        if (effectiveCommandName === 'suggest' && name === 'message_id') {
          return rawArgs.find((arg) => /^\d{17,20}$/.test(arg)) || rawArgs[1] || rawArgs[0] || null;
        }
        if (effectiveCommandName === 'poll' && name === 'question') {
          return rawArgs.join(' ').split('|')[0]?.trim() || null;
        }
        if (effectiveCommandName === 'poll' && name === 'options') {
          const parts = rawArgs.join(' ').split('|');
          return parts.slice(1).map((part) => part.trim()).filter(Boolean).join(' | ') || null;
        }
        if (effectiveCommandName === 'tag' && name === 'name') {
          if (['create', 'delete', 'get', 'list'].includes(rawArgs[0]?.toLowerCase())) return rawArgs[1] || null;
          return rawArgs[0] || null;
        }
        if (effectiveCommandName === 'tag' && name === 'content') {
          if (rawArgs[0]?.toLowerCase() === 'create') return rawArgs.slice(2).join(' ') || null;
          return rawArgs.slice(1).join(' ') || null;
        }
        if (effectiveCommandName === 'sticky' && name === 'text') {
          if (rawArgs[0]?.toLowerCase() === 'set') return rawArgs.slice(1).join(' ') || null;
          return rawArgs.join(' ') || null;
        }
        if (effectiveCommandName === 'afk' && name === 'reason') {
          return rawArgs.join(' ') || null;
        }
        if (effectiveCommandName === 'hack' && name === 'target') {
          return rawArgs[0] || null;
        }
        if (effectiveCommandName === 'youtuber') {
          if (name === 'action') {
            const known = ['start', 'post', 'stats'];
            return known.includes(rawArgs[0]?.toLowerCase()) ? rawArgs[0].toLowerCase() : 'stats';
          }
          if (name === 'name' || name === 'title') {
            return rawArgs.slice(1).join(' ') || null;
          }
        }
        if (effectiveCommandName === 'roles' && name === 'label') {
          return rawArgs.filter((arg) => !arg.startsWith('<@&') && !['add', 'remove', 'list', 'panel'].includes(arg.toLowerCase())).join(' ') || null;
        }

        if (name === 'type' || name === 'duration' || name === 'reason' || name === 'prize' || name === 'message' || name === 'unit' || name === 'message_id' || name === 'amount' || name === 'key' || name === 'symbol') {
          if (effectiveCommandName === 'leaderboard') return rawArgs[0] || 'xp';
        if (effectiveCommandName === 'gstart') {
          if (name === 'duration') return rawArgs[0];
          if (name === 'prize') return rawArgs.slice(2).join(' ') || 'Prize';
        }
        if ((effectiveCommandName === 'gend' || effectiveCommandName === 'gereroll') && name === 'message_id') {
          return rawArgs[0];
        }
          if (effectiveCommandName === 'timeout') {
            if (name === 'unit') return rawArgs[2] || 'm';
            if (name === 'reason') return rawArgs.slice(3).join(' ') || 'No reason provided';
          }
          if (effectiveCommandName === 'ban' || effectiveCommandName === 'kick' || effectiveCommandName === 'warn' || effectiveCommandName === 'unban' || effectiveCommandName === 'untimeout') {
            if (name === 'reason') return rawArgs.slice(1).filter(a => !a.startsWith('<@')).join(' ') || 'No reason provided';
          }
          if ((effectiveCommandName === 'lock' || effectiveCommandName === 'unlock') && name === 'reason') {
            return rawArgs.filter((arg) => !arg.startsWith('<#')).join(' ') || 'No reason provided';
          }
          if (effectiveCommandName === 'unban' && name === 'user') {
            return rawArgs[0] || null;
          }
          if (effectiveCommandName === 'config') {
            if (name === 'symbol' || name === 'key') return rawArgs[1] || null;
            if (name === 'action') return rawArgs[1] || 'list';
          }
          return rawArgs[0] || null;
        }
        return rawArgs[0] || null;
      },
      getNumber(name) {
        if (effectiveCommandName === 'ltc' && name === 'amount') {
          for (const arg of rawArgs) {
            if (/^(ltc1|[LM3])/i.test(arg)) continue;
            const num = parseFloat(arg);
            if (Number.isFinite(num) && num > 0 && num < 84000000) return num;
          }
        }
        if (effectiveCommandName === 'usdt' && name === 'amount') {
          for (const arg of rawArgs) {
            if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(arg)) continue;
            const num = parseFloat(arg);
            if (Number.isFinite(num) && num > 0) return num;
          }
        }
        const asInt = this.getInteger(name);
        return asInt === null ? null : asInt;
      },
      getInteger(name) {
        if (effectiveCommandName === 'config' && (name === 'start_number' || name === 'rate' || name === 'count')) {
          const nums = rawArgs
            .map((arg) => parseInt(arg, 10))
            .filter((n) => Number.isFinite(n) && String(n).length < 17);
          return nums.length ? nums[nums.length - 1] : null;
        }

        if (effectiveCommandName === 'buy' && name === 'quantity') {
          return parseInt(rawArgs[1], 10) || 1;
        }
        if (effectiveCommandName === 'gstart' && name === 'winners') {
          return parseInt(rawArgs[1], 10) || 1;
        }
        if (effectiveCommandName === 'timeout' && name === 'duration') {
          return parseInt(rawArgs[1], 10) || 10;
        }
        if ((effectiveCommandName === 'setxp' || effectiveCommandName === 'addxp') && name === 'amount') {
          const amounts = rawArgs
            .map((arg) => parseInt(arg, 10))
            .filter((n) => Number.isFinite(n) && String(n).length < 17);
          return amounts.length ? amounts[amounts.length - 1] : null;
        }
        if (effectiveCommandName === 'slowmode' && name === 'seconds') {
          return parseInt(rawArgs[0], 10) || 0;
        }
        if ((effectiveCommandName === 'case' || effectiveCommandName === 'remind' || effectiveCommandName === 'schedule') && name === 'id') {
          const nums = rawArgs.map((arg) => parseInt(arg, 10)).filter((n) => Number.isFinite(n));
          return nums.length ? nums[0] : null;
        }
        if (effectiveCommandName === 'purge' && name === 'amount') {
          return parseInt(rawArgs[0], 10) || 10;
        }
        if (effectiveCommandName === 'counting' && name === 'number') {
          return parseInt(rawArgs[1], 10) || 0;
        }
        if (effectiveCommandName === 'counting' && name === 'start_number') {
          const num = parseInt(rawArgs[2], 10);
          return !isNaN(num) ? num : null;
        }

        if (['blackjack', 'roulette', 'slots'].includes(effectiveCommandName) && (name === 'amount' || name === 'bet')) {
          const u = db.getUser(message.guild.id, message.author.id);
          for (const arg of rawArgs) {
            const low = arg.toLowerCase();
            if (low === 'all' || low === 'max') return u.balance;
            if (low === 'half') return Math.max(10, Math.floor(u.balance / 2));
          }

          if (effectiveCommandName === 'roulette') {
            const numArgs = rawArgs.map(a => parseInt(a, 10)).filter(n => !isNaN(n) && n > 0);
            if (numArgs.length === 1) {
              return numArgs[0];
            } else if (numArgs.length >= 2) {
              if (numArgs[0] <= 36 && numArgs[1] > 36) return numArgs[1];
              if (numArgs[1] <= 36 && numArgs[0] > 36) return numArgs[0];
              return numArgs[0];
            }
          }

          for (const arg of rawArgs) {
            const num = parseInt(arg, 10);
            if (!isNaN(num) && num > 0) return num;
          }
        }

        for (const arg of rawArgs) {
          const num = parseInt(arg, 10);
          if (!isNaN(num)) return num;
        }
        return null;
      },
      getChannel(name) {
        const mention = message.mentions.channels.first();
        if (mention) return mention;
        if (effectiveCommandName === 'config') return null;
        return message.channel;
      },
      getRole(name) {
        return message.mentions.roles.first() || null;
      },
      getAttachment(name) {
        return message.attachments.first() || null;
      },
      getBoolean(name) {
        if (name === 'bedrock' && rawArgs.some((arg) => arg.toLowerCase() === 'bedrock')) return true;
        const arg = rawArgs.find(a => ['true', 'enable', 'on', '1', 'false', 'disable', 'off', '0'].includes(a.toLowerCase()));
        if (arg) {
          return ['true', 'enable', 'on', '1'].includes(arg.toLowerCase());
        }
        if (name === 'allow_double_counting') return false;
        if (name === 'include_author') return true;
        if (name === 'bedrock') return false;
        return null;
      }
    }
  };

  try {
    await command.execute(mockInteraction);
  } catch (err) {
    Logger.error(`Error executing prefix command ${commandName}:`, err);
    await sendPrefixReply(message, { embeds: [errorEmbed('Command Error', 'An error occurred while executing this command.')] }, channel).catch(() => {});
  }

  return true;
}

module.exports = { handlePrefixCommand };
