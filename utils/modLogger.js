const { createEmbed } = require('./embedBuilder');

const MOD_COLORS = {
  BAN: 0x992D22,       // Dark Crimson
  UNBAN: 0x2ECC71,
  UNTIMEOUT: 0x3498DB,
  LOCK: 0x95A5A6,
  UNLOCK: 0x1ABC9C,
  KICK: 0xE67E22,
  TIMEOUT: 0xF1C40F,   // Amber Gold
  WARN: 0xFEE75C,      // Bright Yellow
  PURGE: 0x9B59B6,     // Royal Purple
  NUKE: 0xE74C3C,      // Crimson Flame
  MSG_DELETE: 0x34495E,// Slate Blue
  MSG_EDIT: 0x5865F2,  // Discord Blurple
  TICKET: 0x1ABC9C     // Teal Cyan
};

function createModLogEmbed({
  action,
  color,
  target,
  moderator,
  reason,
  fields = [],
  channel,
  extraDetails
}) {
  const logFields = [];

  if (target) {
    logFields.push({
      name: '👤 Target User',
      value: `**${target.tag || target.username || 'User'}**\n<@${target.id}> \`(${target.id})\``,
      inline: true
    });
  }

  if (moderator) {
    logFields.push({
      name: '🛡️ Moderator',
      value: `**${moderator.tag || moderator.username || 'Moderator'}**\n<@${moderator.id}>`,
      inline: true
    });
  }

  if (channel) {
    logFields.push({
      name: '📍 Channel',
      value: `${channel}`,
      inline: true
    });
  }

  if (extraDetails) {
    for (const [k, v] of Object.entries(extraDetails)) {
      if (v) {
        logFields.push({ name: k, value: String(v), inline: true });
      }
    }
  }

  if (reason) {
    logFields.push({
      name: '📝 Reason',
      value: `\`\`\`${reason}\`\`\``,
      inline: false
    });
  }

  if (fields && fields.length > 0) {
    logFields.push(...fields);
  }

  return createEmbed({
    title: action,
    fields: logFields,
    thumbnail: target?.displayAvatarURL ? target.displayAvatarURL({ dynamic: true, size: 128 }) : undefined,
    footerText: 'Sonnies Moderation Logging System'
  });
}

module.exports = {
  MOD_COLORS,
  createModLogEmbed
};
