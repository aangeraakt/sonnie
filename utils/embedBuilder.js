const { EmbedBuilder } = require('discord.js');
const { AsyncLocalStorage } = require('async_hooks');
const db = require('../database/db');

const COLORS = {
  PRIMARY: 0x5865F2,
  SUCCESS: 0x57F287,
  WARNING: 0xFEE75C,
  ERROR: 0xED4245,
  INFO: 0x3498DB,
  SONNIES: 0x7289DA,
  MUSIC: 0x8B7CFF
};

// Tracks which guild is currently being served, so every embed built anywhere
// in the call chain (commands, prefix commands, event handlers, background
// loops) automatically picks up that guild's configured brand color without
// every call site having to pass a guildId around.
const guildContext = new AsyncLocalStorage();

function withGuildColor(guildId, fn) {
  return guildContext.run(guildId || null, fn);
}

function parseHexColor(value) {
  if (!value) return null;
  const hex = String(value).trim().replace(/^#/, '');
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return null;
  const parsed = parseInt(hex, 16);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveColor() {
  const guildId = guildContext.getStore();
  if (guildId) {
    try {
      const cfg = db.getGuildConfig(guildId);
      const parsed = parseHexColor(cfg.embed_color);
      if (parsed !== null) return parsed;
    } catch (e) {
      // fall through to default
    }
  }
  return COLORS.PRIMARY;
}

function createEmbed({
  title,
  description,
  color,
  fields = [],
  footerText,
  authorName,
  authorIcon,
  thumbnail,
  image,
  url,
  timestamp = true
} = {}) {
  const embed = new EmbedBuilder().setColor(resolveColor());

  if (title) embed.setTitle(title);
  if (url) embed.setURL(url);
  if (description) embed.setDescription(description);
  if (fields && fields.length > 0) embed.addFields(fields);
  embed.setFooter({ text: footerText || 'Sonnies' });
  if (timestamp) embed.setTimestamp();
  if (authorName) embed.setAuthor({ name: authorName, iconURL: authorIcon });
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);

  return embed;
}

function successEmbed(title, description) {
  return createEmbed({ title, description });
}

function errorEmbed(title, description) {
  return createEmbed({ title, description });
}

function warningEmbed(title, description) {
  return createEmbed({ title, description });
}

function infoEmbed(title, description) {
  return createEmbed({ title, description });
}

module.exports = {
  COLORS,
  createEmbed,
  successEmbed,
  errorEmbed,
  warningEmbed,
  infoEmbed,
  withGuildColor,
  parseHexColor
};
