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

// One leading glyph per status, so a result is readable from the container
// accent and the heading alone. Kept to a single emoji per embed - the command
// text underneath already carries plenty of its own.
const ACCENTS = {
  success: { emoji: '✅', color: COLORS.SUCCESS },
  error: { emoji: '❌', color: COLORS.ERROR },
  warning: { emoji: '⚠️', color: COLORS.WARNING },
  info: { emoji: 'ℹ️', color: COLORS.INFO }
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

// Emoji, symbols and dingbats - enough to spot a title that already opens with
// its own glyph, so status helpers do not stack a second one in front of it.
// Written with explicit code points because the ranges span surrogate pairs.
const LEADING_GLYPH = new RegExp(
  '^\\s*(?:' +
    '[\\u2190-\\u21FF\\u2300-\\u23FF\\u2460-\\u27BF\\u2B00-\\u2BFF\\u3030\\u303D\\u3297\\u3299]' +
    '|[\\uD83C-\\uD83E][\\uDC00-\\uDFFF]' +
    '|\\uD83D[\\uDC00-\\uDFFF]' +
    '|<a?:\\w+:\\d+>' + // custom server emoji, e.g. <:sonnies:123>
  ')'
);

function withAccent(title, emoji) {
  const text = String(title ?? '').trim();
  if (!text) return emoji;
  return LEADING_GLYPH.test(text) ? text : `${emoji} ${text}`;
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
  const embed = new EmbedBuilder().setColor(color ?? resolveColor());

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

// The status helpers pin their own accent colour rather than the guild brand
// colour: a failure that renders in the server's pastel pink reads as a
// success, and the container stripe is the first thing anyone looks at.
function statusEmbed(kind, title, description, options = {}) {
  const { emoji, color } = ACCENTS[kind];
  return createEmbed({ ...options, title: withAccent(title, emoji), description, color });
}

function successEmbed(title, description, options) {
  return statusEmbed('success', title, description, options);
}

function errorEmbed(title, description, options) {
  return statusEmbed('error', title, description, options);
}

function warningEmbed(title, description, options) {
  return statusEmbed('warning', title, description, options);
}

function infoEmbed(title, description, options) {
  return statusEmbed('info', title, description, options);
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
