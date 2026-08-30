const { PermissionFlagsBits } = require('discord.js');
const db = require('../database/db');
const { createModLogEmbed, MOD_COLORS } = require('./modLogger');
const { runFilters } = require('./autoModFilters');
const { applyEscalation } = require('./punishmentEngine');
const { sendLog } = require('./auditLogger');

// Anti-Spam state tracking
const userMessageTimestamps = new Map(); // key: guildId-userId -> array of timestamps
const userLastMessageContent = new Map(); // key: guildId-userId -> { content, count }

function isStaffMember(member, cfg) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageMessages) ||
      member.permissions.has(PermissionFlagsBits.ManageGuild) ||
      member.permissions.has(PermissionFlagsBits.BanMembers) ||
      member.permissions.has(PermissionFlagsBits.KickMembers)) {
    return true;
  }
  if (cfg.staff_role_id && member.roles.cache.has(cfg.staff_role_id)) {
    return true;
  }
  return false;
}

/** Channels and roles the server owner marked as exempt from auto-mod. */
function isExempt(message, member, autoCfg) {
  if ((autoCfg.ignored_channels || []).includes(message.channel.id)) return true;
  if (message.channel.parentId && (autoCfg.ignored_channels || []).includes(message.channel.parentId)) return true;
  for (const roleId of autoCfg.ignored_roles || []) {
    if (member.roles.cache.has(roleId)) return true;
  }
  return false;
}

/**
 * Deletes the offending message, warns the author, logs it, and runs the
 * escalation ladder. Shared by every content filter.
 */
async function punishViolation(message, member, violation, autoCfg) {
  const botUser = message.client.user;
  const guild = message.guild;

  await message.delete().catch(() => {});

  const action = autoCfg.banned_words_action || 'delete';
  let extraAction = null;

  if (violation.rule === 'banned_words' && action === 'timeout' && member.moderatable) {
    await member.timeout(10 * 60 * 1000, `[Auto-Mod] ${violation.reason}`).catch(() => {});
    extraAction = 'Timed out for 10 minutes';
  }

  const shouldWarn = action !== 'delete' || violation.rule !== 'banned_words';
  let warnCount = 0;
  if (shouldWarn) {
    db.addWarning(guild.id, message.author.id, botUser.id, `[Auto-Mod] ${violation.reason}`);
    warnCount = db.getWarnings(guild.id, message.author.id).length;
  }

  const alert = await message.channel.send({
    content: `${message.author}, that message was removed: ${violation.reason.toLowerCase()}.`
  }).catch(() => null);
  if (alert) setTimeout(() => alert.delete().catch(() => {}), 6000);

  await sendLog(guild, 'moderation', createModLogEmbed({
    action: `Auto-Mod: ${violation.rule.replace(/_/g, ' ')}`,
    color: MOD_COLORS.WARN,
    target: message.author,
    moderator: botUser,
    reason: violation.reason,
    extraDetails: {
      'Channel': `${message.channel}`,
      'Content': `\`\`\`${(message.content || '(no text)').slice(0, 300).replace(/`/g, "'")}\`\`\``,
      ...(extraAction ? { 'Action': extraAction } : {}),
      ...(warnCount ? { 'Total Warnings': String(warnCount) } : {})
    }
  })).catch(() => {});

  if (warnCount) {
    await applyEscalation(guild, message.author, warnCount, `[Auto-Mod] ${violation.reason}`).catch(() => {});
  }

  return true;
}

async function handleAutoMod(message) {
  if (message.author.bot || !message.guild) return false;

  const cfg = db.getGuildConfig(message.guild.id);
  const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member) return false;

  // Staff and Admin members bypass all auto-mod rules
  if (isStaffMember(member, cfg)) {
    return false;
  }

  const autoCfg = db.getAutomodConfig(message.guild.id);
  if (isExempt(message, member, autoCfg)) return false;

  // Extended content filters (blocked words, scams, invites, mass mentions,
  // caps, emoji spam, zalgo, dangerous attachments).
  const violation = runFilters(message, autoCfg);
  if (violation) {
    return punishViolation(message, member, violation, autoCfg);
  }

  const botUser = message.client.user;
  const modLogChannel = cfg.mod_log_channel_id ? message.guild.channels.cache.get(cfg.mod_log_channel_id) : null;

  if (cfg.anti_link === 1) {
    const linkRegex = /(https?:\/\/[^\s]+|discord\.(gg|io|me|li)\/[^\s]+|discord\.com\/invite\/[^\s]+)/i;
    if (linkRegex.test(message.content)) {
      try {
        await message.delete();
      } catch (e) {}

      db.addWarning(message.guild.id, message.author.id, botUser.id, '[Auto-Mod] Sent unauthorized link/invite');

      const alertMsg = await message.channel.send({
        content: `⚠️ ${message.author}, posting links or invites is prohibited on this server!`
      }).catch(() => null);

      if (alertMsg) {
        setTimeout(() => alertMsg.delete().catch(() => {}), 5000);
      }

      if (modLogChannel) {
        const logEmbed = createModLogEmbed({
          action: '🛡️ Auto-Mod: Anti-Link Triggered',
          color: MOD_COLORS.WARN,
          target: message.author,
          moderator: botUser,
          reason: 'Posting unauthorized links or Discord invites',
          extraDetails: {
            '📍 Channel': `${message.channel}`,
            '💬 Content': `\`\`\`${message.content.slice(0, 100).replace(/`/g, '')}\`\`\``
          }
        });
        modLogChannel.send({ embeds: [logEmbed] }).catch(() => {});
      }

      return true;
    }
  }

  // 3. Anti-Spam Protection
  if (cfg.anti_spam === 1) {
    const userKey = `${message.guild.id}-${message.author.id}`;
    const now = Date.now();

    // Check repeated exact messages
    const lastMsgInfo = userLastMessageContent.get(userKey) || { content: '', count: 0 };
    if (message.content.length > 3 && lastMsgInfo.content === message.content) {
      lastMsgInfo.count += 1;
    } else {
      lastMsgInfo.content = message.content;
      lastMsgInfo.count = 1;
    }
    userLastMessageContent.set(userKey, lastMsgInfo);

    // Rate limiting: > 5 messages in 3.5 seconds
    const timestamps = userMessageTimestamps.get(userKey) || [];
    const filteredTimestamps = timestamps.filter(t => now - t < 3500);
    filteredTimestamps.push(now);
    userMessageTimestamps.set(userKey, filteredTimestamps);

    const isRapidSpam = filteredTimestamps.length >= 6;
    const isDuplicateSpam = lastMsgInfo.count >= 4;

    if (isRapidSpam || isDuplicateSpam) {
      try {
        await message.delete();
      } catch (e) {}

      const reason = isRapidSpam ? 'Sending messages too fast (Rate-Limit Spam)' : 'Repeated duplicate message spam';

      // Apply 1-minute timeout if bot has permissions
      if (member.moderatable) {
        await member.timeout(60 * 1000, `[Auto-Mod] ${reason}`).catch(() => {});
      }

      db.addWarning(message.guild.id, message.author.id, botUser.id, `[Auto-Mod] ${reason}`);
      const spamWarnCount = db.getWarnings(message.guild.id, message.author.id).length;

      const alertMsg = await message.channel.send({
        content: `🔇 ${message.author} has been timed out for 1 minute for spamming!`
      }).catch(() => null);

      if (alertMsg) {
        setTimeout(() => alertMsg.delete().catch(() => {}), 6000);
      }

      if (modLogChannel) {
        const logEmbed = createModLogEmbed({
          action: '🛡️ Auto-Mod: Anti-Spam Triggered',
          color: MOD_COLORS.TIMEOUT,
          target: message.author,
          moderator: botUser,
          reason,
          extraDetails: {
            '📍 Channel': `${message.channel}`,
            '⏱️ Timeout Duration': '1 Minute'
          }
        });
        modLogChannel.send({ embeds: [logEmbed] }).catch(() => {});
      }

      await applyEscalation(message.guild, message.author, spamWarnCount, `[Auto-Mod] ${reason}`).catch(() => {});
      return true;
    }
  }

  return false;
}

module.exports = {
  handleAutoMod,
  isStaffMember,
  isExempt
};
