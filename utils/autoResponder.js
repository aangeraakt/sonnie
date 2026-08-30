const db = require('../database/db');
const { createEmbed } = require('./embedBuilder');

// Per-guild cooldown so a trigger word cannot be used to spam the channel.
const cooldowns = new Map();
const COOLDOWN_MS = 3000;

const MATCH_MODES = ['exact', 'contains', 'startswith', 'endswith', 'regex'];

function matches(entry, content) {
  const trigger = String(entry.trigger || '');
  const haystack = entry.case_sensitive ? content : content.toLowerCase();
  const needle = entry.case_sensitive ? trigger : trigger.toLowerCase();

  switch (entry.match) {
    case 'exact':
      return haystack.trim() === needle;
    case 'startswith':
      return haystack.startsWith(needle);
    case 'endswith':
      return haystack.endsWith(needle);
    case 'regex':
      try {
        return new RegExp(trigger, entry.case_sensitive ? '' : 'i').test(content);
      } catch (err) {
        return false;
      }
    case 'contains':
    default:
      // Word-boundary match so "hi" does not fire inside "this".
      return new RegExp(`(^|\\s)${escapeRegex(needle)}($|\\s|[.,!?])`).test(haystack);
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fillPlaceholders(text, message) {
  return String(text)
    .replace(/{user}/g, `<@${message.author.id}>`)
    .replace(/{username}/g, message.author.username)
    .replace(/{server}/g, message.guild.name)
    .replace(/{channel}/g, `<#${message.channel.id}>`)
    .replace(/{membercount}/g, String(message.guild.memberCount));
}

async function handleAutoResponder(message) {
  if (!message.guild || message.author.bot || !message.content) return false;

  const responders = db.getAutoResponders(message.guild.id);
  if (!responders.length) return false;

  const key = `${message.guild.id}-${message.channel.id}`;
  const last = cooldowns.get(key) || 0;
  if (Date.now() - last < COOLDOWN_MS) return false;

  const hit = responders.find((entry) => matches(entry, message.content));
  if (!hit) return false;

  cooldowns.set(key, Date.now());

  if (hit.delete_trigger) {
    await message.delete().catch(() => {});
  }

  const response = fillPlaceholders(hit.response, message);
  const payload = hit.embed
    ? { embeds: [createEmbed({ description: response })] }
    : { content: response.slice(0, 2000), allowedMentions: { parse: ['users'] } };

  if (hit.reply && !hit.delete_trigger) {
    await message.reply(payload).catch(() => {});
  } else {
    await message.channel.send(payload).catch(() => {});
  }
  return true;
}

module.exports = { handleAutoResponder, MATCH_MODES };
