/**
 * Pure content filters used by autoModHandler. Each returns null when the
 * message is clean, or { rule, reason } when it violates the rule.
 * Keeping them free of Discord and database calls makes them cheap to run on
 * every message and easy to reason about.
 */

const INVITE_PATTERN = /(discord\.(gg|io|me|li|com\/invite)|discordapp\.com\/invite)\/[a-z0-9-]+/i;
const URL_PATTERN = /https?:\/\/[^\s]+/i;

// Domains widely used for Nitro/Steam credential phishing.
const SCAM_PATTERNS = [
  /discord(?:app)?[-.](?:gift|nitro|give|airdrop)/i,
  /(?:disc[o0]rd|dlscord|discrod|dicsord|discorcl)\.(?:com|gg|gift|link|click|ru|xyz|info)/i,
  /steamcommunity[-.](?:com\.[a-z]{2,}|ru|link|gift)/i,
  /free[-.]?nitro/i,
  /nitro[-.]?(?:gift|drop|generator)/i,
  /(?:bit\.ly|tinyurl\.com|cutt\.ly|shorturl\.at)\/[a-z0-9]+/i
];

const ZALGO_PATTERN = /[̀-ͯ҃-҉᪰-᫿᷀-᷿⃐-⃰︠-︯]/g;
const CUSTOM_EMOJI_PATTERN = /<a?:\w+:\d+>/g;
const UNICODE_EMOJI_PATTERN = /\p{Extended_Pictographic}/gu;

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalises common letter substitutions so "n1gg3r" is caught by "nigger"
 * without needing every variant in the list.
 */
function normalise(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(ZALGO_PATTERN, '')
    .replace(/[013457$@!|]/g, (char) => ({
      '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't',
      '$': 's', '@': 'a', '!': 'i', '|': 'i'
    })[char] || char)
    .replace(/(.)\1{2,}/g, '$1$1');
}

function checkBannedWords(content, words) {
  if (!words?.length) return null;
  const haystack = normalise(content);
  const collapsed = haystack.replace(/[^a-z0-9]/g, '');

  for (const word of words) {
    const needle = normalise(word);
    if (!needle) continue;

    // Word-boundary match on the normalised text.
    if (new RegExp(`\\b${escapeRegex(needle)}\\b`).test(haystack)) {
      return { rule: 'banned_words', reason: `Used a blocked word ("${word}")` };
    }
    // Also catch spaced-out evasion like "n i g g e r".
    if (needle.length >= 4 && collapsed.includes(needle.replace(/[^a-z0-9]/g, ''))) {
      return { rule: 'banned_words', reason: `Used a blocked word ("${word}")` };
    }
  }
  return null;
}

function checkMassMention(message, limit) {
  if (!limit) return null;
  const users = message.mentions.users?.size || 0;
  const roles = message.mentions.roles?.size || 0;
  const total = users + roles;
  if (total >= limit) {
    return { rule: 'mass_mention', reason: `Mentioned ${total} users/roles at once (limit ${limit})` };
  }
  if (message.mentions.everyone) {
    return { rule: 'mass_mention', reason: 'Attempted an @everyone/@here ping' };
  }
  return null;
}

function checkCaps(content, percent) {
  if (!percent) return null;
  const letters = content.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 8) return null;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  const ratio = Math.round((upper / letters.length) * 100);
  if (ratio >= percent) {
    return { rule: 'caps', reason: `Message was ${ratio}% capitals (limit ${percent}%)` };
  }
  return null;
}

function checkEmojiSpam(content, limit) {
  if (!limit) return null;
  const custom = (content.match(CUSTOM_EMOJI_PATTERN) || []).length;
  const unicode = (content.replace(CUSTOM_EMOJI_PATTERN, '').match(UNICODE_EMOJI_PATTERN) || []).length;
  const total = custom + unicode;
  if (total >= limit) {
    return { rule: 'emoji', reason: `Used ${total} emojis in one message (limit ${limit})` };
  }
  return null;
}

function checkZalgo(content, enabled) {
  if (!enabled) return null;
  const marks = (content.match(ZALGO_PATTERN) || []).length;
  // A few combining marks are normal in many languages; a wall of them is not.
  if (marks > 8 && marks / Math.max(1, content.length) > 0.2) {
    return { rule: 'zalgo', reason: 'Sent zalgo / combining-character spam' };
  }
  return null;
}

function checkInvites(content, enabled) {
  if (!enabled) return null;
  if (INVITE_PATTERN.test(content)) {
    return { rule: 'invite', reason: 'Posted a Discord server invite' };
  }
  return null;
}

function checkScam(content, enabled) {
  if (!enabled) return null;
  for (const pattern of SCAM_PATTERNS) {
    if (pattern.test(content)) {
      return { rule: 'scam', reason: 'Posted a known scam or phishing link' };
    }
  }
  // A "free nitro" style pitch alongside any link.
  if (/free\s+(?:nitro|gift|steam)/i.test(content) && URL_PATTERN.test(content)) {
    return { rule: 'scam', reason: 'Posted a suspected scam link' };
  }
  return null;
}

function checkAttachments(message, enabled) {
  if (!enabled || !message.attachments?.size) return null;
  const blocked = ['.exe', '.scr', '.bat', '.cmd', '.com', '.pif', '.vbs', '.js', '.jar', '.msi', '.apk', '.dll', '.ps1'];
  for (const attachment of message.attachments.values()) {
    const name = (attachment.name || '').toLowerCase();
    if (blocked.some((ext) => name.endsWith(ext))) {
      return { rule: 'attachment', reason: `Uploaded a blocked file type (${name})` };
    }
  }
  return null;
}

/** Runs every enabled filter and returns the first violation found. */
function runFilters(message, cfg) {
  const content = message.content || '';

  return checkBannedWords(content, cfg.banned_words)
    || checkScam(content, cfg.scam_filter)
    || checkInvites(content, cfg.invite_filter)
    || checkMassMention(message, cfg.mass_mention_limit)
    || checkCaps(content, cfg.caps_percent)
    || checkEmojiSpam(content, cfg.emoji_limit)
    || checkZalgo(content, cfg.zalgo)
    || checkAttachments(message, cfg.attachment_filter)
    || null;
}

module.exports = {
  runFilters,
  normalise,
  checkBannedWords,
  checkMassMention,
  checkCaps,
  checkEmojiSpam,
  checkZalgo,
  checkInvites,
  checkScam,
  checkAttachments,
  INVITE_PATTERN,
  SCAM_PATTERNS
};
