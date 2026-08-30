const { AuditLogEvent, ChannelType } = require('discord.js');
const db = require('../database/db');
const { createEmbed, withGuildColor } = require('./embedBuilder');
const Logger = require('./logger');

const CATEGORY_LABELS = {
  message: 'Message events (deletes, edits, bulk purges)',
  member: 'Member events (nickname, roles, avatar, timeout)',
  server: 'Server events (channels, roles, emojis, threads, settings)',
  voice: 'Voice events (join, leave, move, mute, deafen, stream)',
  joinleave: 'Joins and leaves',
  moderation: 'Bans, kicks, and automod actions'
};

const LEGACY_FALLBACK_CATEGORIES = new Set(['message', 'member', 'moderation']);

function resolveChannel(guild, category) {
  if (!guild) return null;
  const cfg = db.getLogConfig(guild.id);
  let channelId = cfg[category];

  // Categories the bot already wrote into the classic mod log fall back to it
  // so existing setups keep working untouched. The genuinely new categories
  // (server, voice, joinleave) stay opt-in and never flood an old mod log.
  if (!channelId && LEGACY_FALLBACK_CATEGORIES.has(category)) {
    channelId = db.getGuildConfig(guild.id).mod_log_channel_id;
  }
  if (!channelId) return null;

  const channel = guild.channels.cache.get(channelId);
  if (!channel || !channel.isTextBased?.()) return null;

  const me = guild.members.me;
  if (me && !channel.permissionsFor(me)?.has('SendMessages')) return null;
  return channel;
}

function isIgnored(guild, { channelId = null, userId = null } = {}) {
  const cfg = db.getLogConfig(guild.id);
  if (channelId && (cfg.ignored_channels || []).includes(channelId)) return true;
  if (userId && (cfg.ignored_users || []).includes(userId)) return true;
  return false;
}

/** Central send. Every log helper funnels through here. */
async function sendLog(guild, category, embed, { channelId = null, userId = null } = {}) {
  try {
    if (!guild) return false;
    if (isIgnored(guild, { channelId, userId })) return false;
    const channel = resolveChannel(guild, category);
    if (!channel) return false;
    await withGuildColor(guild.id, () => channel.send({ embeds: [embed] }));
    return true;
  } catch (err) {
    Logger.error(`Failed to send ${category} log:`, err);
    return false;
  }
}

function userLine(user) {
  if (!user) return '`Unknown`';
  return `**${user.tag || user.username}**\n<@${user.id}> \`${user.id}\``;
}

function truncate(value, limit = 1000) {
  const text = String(value ?? '');
  if (!text) return '*empty*';
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

/**
 * Finds who performed an action by scanning the audit log. Discord does not
 * tell us in the gateway event, so this is best-effort and returns null when
 * the entry is too old or the bot lacks View Audit Log.
 */
async function findExecutor(guild, type, targetId, withinMs = 8000) {
  try {
    const me = guild.members.me;
    if (!me || !me.permissions.has('ViewAuditLog')) return null;

    const logs = await guild.fetchAuditLogs({ type, limit: 6 });
    const entry = logs.entries.find((item) => {
      if (targetId && item.target?.id !== targetId) return false;
      return Date.now() - item.createdTimestamp < withinMs;
    });
    return entry ? { executor: entry.executor, reason: entry.reason, entry } : null;
  } catch (err) {
    return null;
  }
}

// ------------------------------------------------------------------
// Message events
// ------------------------------------------------------------------
async function logMessageDelete(message, deletedBy = null) {
  if (!message.guild || message.author?.bot) return;
  const fields = [
    { name: 'Author', value: userLine(message.author), inline: true },
    { name: 'Channel', value: `<#${message.channelId}>`, inline: true }
  ];
  if (deletedBy && deletedBy.id !== message.author?.id) {
    fields.push({ name: 'Deleted By', value: userLine(deletedBy), inline: true });
  }
  fields.push({ name: 'Content', value: truncate(message.content) });

  if (message.attachments?.size) {
    fields.push({
      name: `Attachments (${message.attachments.size})`,
      value: [...message.attachments.values()].map((a) => a.url).join('\n').slice(0, 1000)
    });
  }

  return sendLog(message.guild, 'message', createEmbed({
    title: 'Message Deleted',
    fields,
    footerText: `Message ID: ${message.id}`
  }), { channelId: message.channelId, userId: message.author?.id });
}

async function logMessageEdit(oldMessage, newMessage) {
  if (!newMessage.guild || newMessage.author?.bot) return;
  if (oldMessage?.content === newMessage.content) return;

  return sendLog(newMessage.guild, 'message', createEmbed({
    title: 'Message Edited',
    url: newMessage.url,
    fields: [
      { name: 'Author', value: userLine(newMessage.author), inline: true },
      { name: 'Channel', value: `<#${newMessage.channelId}>`, inline: true },
      { name: 'Before', value: truncate(oldMessage?.content) },
      { name: 'After', value: truncate(newMessage.content) }
    ],
    footerText: `Message ID: ${newMessage.id}`
  }), { channelId: newMessage.channelId, userId: newMessage.author?.id });
}

async function logBulkDelete(messages, channel) {
  const guild = channel?.guild;
  if (!guild) return;

  return sendLog(guild, 'message', createEmbed({
    title: 'Messages Bulk Deleted',
    fields: [
      { name: 'Channel', value: `<#${channel.id}>`, inline: true },
      { name: 'Count', value: `\`${messages.size}\``, inline: true }
    ]
  }), { channelId: channel.id });
}

// ------------------------------------------------------------------
// Member events
// ------------------------------------------------------------------
async function logMemberUpdate(oldMember, newMember) {
  const guild = newMember.guild;
  const changes = [];

  if (oldMember.nickname !== newMember.nickname) {
    changes.push({
      name: 'Nickname',
      value: `\`${oldMember.nickname || 'none'}\` -> \`${newMember.nickname || 'none'}\``
    });
  }

  const oldRoles = oldMember.roles.cache;
  const newRoles = newMember.roles.cache;
  const added = newRoles.filter((role) => !oldRoles.has(role.id));
  const removed = oldRoles.filter((role) => !newRoles.has(role.id));

  if (added.size) changes.push({ name: 'Roles Added', value: added.map((r) => `<@&${r.id}>`).join(' ').slice(0, 1000) });
  if (removed.size) changes.push({ name: 'Roles Removed', value: removed.map((r) => `<@&${r.id}>`).join(' ').slice(0, 1000) });

  const oldTimeout = oldMember.communicationDisabledUntilTimestamp || 0;
  const newTimeout = newMember.communicationDisabledUntilTimestamp || 0;
  if (oldTimeout !== newTimeout) {
    changes.push({
      name: 'Timeout',
      value: newTimeout > Date.now() ? `Until <t:${Math.floor(newTimeout / 1000)}:F>` : 'Timeout removed'
    });
  }

  if (!changes.length) return;

  const executor = await findExecutor(guild, AuditLogEvent.MemberUpdate, newMember.id)
    || await findExecutor(guild, AuditLogEvent.MemberRoleUpdate, newMember.id);

  return sendLog(guild, 'member', createEmbed({
    title: 'Member Updated',
    thumbnail: newMember.user.displayAvatarURL({ dynamic: true }),
    fields: [
      { name: 'Member', value: userLine(newMember.user), inline: true },
      ...(executor?.executor ? [{ name: 'Changed By', value: userLine(executor.executor), inline: true }] : []),
      ...changes
    ]
  }), { userId: newMember.id });
}

async function logMemberJoin(member, extra = []) {
  const created = Math.floor(member.user.createdTimestamp / 1000);
  const ageDays = Math.floor((Date.now() - member.user.createdTimestamp) / 86400000);

  return sendLog(member.guild, 'joinleave', createEmbed({
    title: 'Member Joined',
    thumbnail: member.user.displayAvatarURL({ dynamic: true }),
    fields: [
      { name: 'Member', value: userLine(member.user), inline: true },
      { name: 'Account Created', value: `<t:${created}:R>${ageDays < 7 ? '\n**New account**' : ''}`, inline: true },
      { name: 'Member Count', value: `\`${member.guild.memberCount}\``, inline: true },
      ...extra
    ]
  }), { userId: member.id });
}

async function logMemberLeave(member) {
  const roles = member.roles?.cache?.filter((role) => role.id !== member.guild.id);
  const kick = await findExecutor(member.guild, AuditLogEvent.MemberKick, member.id, 5000);

  return sendLog(member.guild, 'joinleave', createEmbed({
    title: kick ? 'Member Kicked' : 'Member Left',
    thumbnail: member.user.displayAvatarURL({ dynamic: true }),
    fields: [
      { name: 'Member', value: userLine(member.user), inline: true },
      { name: 'Joined', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : '`Unknown`', inline: true },
      { name: 'Member Count', value: `\`${member.guild.memberCount}\``, inline: true },
      ...(kick?.executor ? [{ name: 'Kicked By', value: userLine(kick.executor), inline: true }] : []),
      ...(kick?.reason ? [{ name: 'Reason', value: truncate(kick.reason) }] : []),
      ...(roles?.size ? [{ name: `Roles (${roles.size})`, value: roles.map((r) => `<@&${r.id}>`).join(' ').slice(0, 1000) }] : [])
    ]
  }), { userId: member.id });
}

// ------------------------------------------------------------------
// Voice events
// ------------------------------------------------------------------
async function logVoiceEvent(oldState, newState) {
  const guild = newState.guild || oldState.guild;
  const member = newState.member || oldState.member;
  if (!guild || !member || member.user.bot) return;

  let title = null;
  let detail = null;

  if (!oldState.channelId && newState.channelId) {
    title = 'Voice Joined';
    detail = `<#${newState.channelId}>`;
  } else if (oldState.channelId && !newState.channelId) {
    title = 'Voice Left';
    detail = `<#${oldState.channelId}>`;
  } else if (oldState.channelId !== newState.channelId) {
    title = 'Voice Moved';
    detail = `<#${oldState.channelId}> -> <#${newState.channelId}>`;
  } else if (oldState.streaming !== newState.streaming) {
    title = newState.streaming ? 'Started Streaming' : 'Stopped Streaming';
    detail = `<#${newState.channelId}>`;
  } else if (oldState.serverMute !== newState.serverMute) {
    title = newState.serverMute ? 'Server Muted' : 'Server Unmuted';
    detail = `<#${newState.channelId}>`;
  } else if (oldState.serverDeaf !== newState.serverDeaf) {
    title = newState.serverDeaf ? 'Server Deafened' : 'Server Undeafened';
    detail = `<#${newState.channelId}>`;
  }

  if (!title) return;

  return sendLog(guild, 'voice', createEmbed({
    title,
    fields: [
      { name: 'Member', value: userLine(member.user), inline: true },
      { name: 'Channel', value: detail, inline: true }
    ]
  }), { channelId: newState.channelId || oldState.channelId, userId: member.id });
}

// ------------------------------------------------------------------
// Server structure events
// ------------------------------------------------------------------
const CHANNEL_TYPE_NAMES = {
  [ChannelType.GuildText]: 'Text',
  [ChannelType.GuildVoice]: 'Voice',
  [ChannelType.GuildCategory]: 'Category',
  [ChannelType.GuildAnnouncement]: 'Announcement',
  [ChannelType.GuildStageVoice]: 'Stage',
  [ChannelType.GuildForum]: 'Forum'
};

async function logChannelCreate(channel) {
  if (!channel.guild) return;
  const executor = await findExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
  return sendLog(channel.guild, 'server', createEmbed({
    title: 'Channel Created',
    fields: [
      { name: 'Channel', value: `${channel} \`#${channel.name}\``, inline: true },
      { name: 'Type', value: `\`${CHANNEL_TYPE_NAMES[channel.type] || channel.type}\``, inline: true },
      ...(executor?.executor ? [{ name: 'Created By', value: userLine(executor.executor), inline: true }] : [])
    ],
    footerText: `Channel ID: ${channel.id}`
  }));
}

async function logChannelDelete(channel) {
  if (!channel.guild) return;
  const executor = await findExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
  return sendLog(channel.guild, 'server', createEmbed({
    title: 'Channel Deleted',
    fields: [
      { name: 'Channel', value: `\`#${channel.name}\``, inline: true },
      { name: 'Type', value: `\`${CHANNEL_TYPE_NAMES[channel.type] || channel.type}\``, inline: true },
      ...(executor?.executor ? [{ name: 'Deleted By', value: userLine(executor.executor), inline: true }] : [])
    ],
    footerText: `Channel ID: ${channel.id}`
  }));
}

async function logChannelUpdate(oldChannel, newChannel) {
  if (!newChannel.guild) return;
  const changes = [];

  if (oldChannel.name !== newChannel.name) {
    changes.push({ name: 'Name', value: `\`${oldChannel.name}\` -> \`${newChannel.name}\`` });
  }
  if (oldChannel.topic !== newChannel.topic) {
    changes.push({ name: 'Topic', value: `${truncate(oldChannel.topic, 400)}\n->\n${truncate(newChannel.topic, 400)}` });
  }
  if (oldChannel.nsfw !== newChannel.nsfw) {
    changes.push({ name: 'NSFW', value: `\`${oldChannel.nsfw}\` -> \`${newChannel.nsfw}\`` });
  }
  if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
    changes.push({ name: 'Slowmode', value: `\`${oldChannel.rateLimitPerUser || 0}s\` -> \`${newChannel.rateLimitPerUser || 0}s\`` });
  }
  if (oldChannel.parentId !== newChannel.parentId) {
    changes.push({ name: 'Category', value: `${oldChannel.parentId ? `<#${oldChannel.parentId}>` : '`none`'} -> ${newChannel.parentId ? `<#${newChannel.parentId}>` : '`none`'}` });
  }

  if (!changes.length) return;
  const executor = await findExecutor(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);

  return sendLog(newChannel.guild, 'server', createEmbed({
    title: 'Channel Updated',
    fields: [
      { name: 'Channel', value: `${newChannel}`, inline: true },
      ...(executor?.executor ? [{ name: 'Updated By', value: userLine(executor.executor), inline: true }] : []),
      ...changes
    ]
  }), { channelId: newChannel.id });
}

async function logRoleCreate(role) {
  const executor = await findExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
  return sendLog(role.guild, 'server', createEmbed({
    title: 'Role Created',
    fields: [
      { name: 'Role', value: `${role} \`${role.name}\``, inline: true },
      { name: 'Color', value: `\`${role.hexColor}\``, inline: true },
      ...(executor?.executor ? [{ name: 'Created By', value: userLine(executor.executor), inline: true }] : [])
    ],
    footerText: `Role ID: ${role.id}`
  }));
}

async function logRoleDelete(role) {
  const executor = await findExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
  return sendLog(role.guild, 'server', createEmbed({
    title: 'Role Deleted',
    fields: [
      { name: 'Role', value: `\`${role.name}\``, inline: true },
      { name: 'Members', value: `\`${role.members?.size ?? 'unknown'}\``, inline: true },
      ...(executor?.executor ? [{ name: 'Deleted By', value: userLine(executor.executor), inline: true }] : [])
    ],
    footerText: `Role ID: ${role.id}`
  }));
}

async function logRoleUpdate(oldRole, newRole) {
  const changes = [];
  if (oldRole.name !== newRole.name) changes.push({ name: 'Name', value: `\`${oldRole.name}\` -> \`${newRole.name}\`` });
  if (oldRole.hexColor !== newRole.hexColor) changes.push({ name: 'Color', value: `\`${oldRole.hexColor}\` -> \`${newRole.hexColor}\`` });
  if (oldRole.hoist !== newRole.hoist) changes.push({ name: 'Hoisted', value: `\`${oldRole.hoist}\` -> \`${newRole.hoist}\`` });
  if (oldRole.mentionable !== newRole.mentionable) changes.push({ name: 'Mentionable', value: `\`${oldRole.mentionable}\` -> \`${newRole.mentionable}\`` });

  const oldPerms = oldRole.permissions.toArray();
  const newPerms = newRole.permissions.toArray();
  const gained = newPerms.filter((perm) => !oldPerms.includes(perm));
  const lost = oldPerms.filter((perm) => !newPerms.includes(perm));
  if (gained.length) changes.push({ name: 'Permissions Granted', value: `\`${gained.join('`, `')}\``.slice(0, 1000) });
  if (lost.length) changes.push({ name: 'Permissions Revoked', value: `\`${lost.join('`, `')}\``.slice(0, 1000) });

  if (!changes.length) return;
  const executor = await findExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);

  return sendLog(newRole.guild, 'server', createEmbed({
    title: 'Role Updated',
    fields: [
      { name: 'Role', value: `${newRole}`, inline: true },
      ...(executor?.executor ? [{ name: 'Updated By', value: userLine(executor.executor), inline: true }] : []),
      ...changes
    ]
  }));
}

async function logEmojiChange(emoji, action, oldEmoji = null) {
  const fields = [{ name: 'Emoji', value: `\`:${emoji.name}:\``, inline: true }];
  if (action === 'Updated' && oldEmoji) {
    fields.push({ name: 'Name', value: `\`${oldEmoji.name}\` -> \`${emoji.name}\``, inline: true });
  }
  return sendLog(emoji.guild, 'server', createEmbed({
    title: `Emoji ${action}`,
    thumbnail: action === 'Deleted' ? undefined : emoji.imageURL?.(),
    fields,
    footerText: `Emoji ID: ${emoji.id}`
  }));
}

async function logThreadEvent(thread, action) {
  return sendLog(thread.guild, 'server', createEmbed({
    title: `Thread ${action}`,
    fields: [
      { name: 'Thread', value: `${thread} \`${thread.name}\``, inline: true },
      { name: 'Parent', value: thread.parentId ? `<#${thread.parentId}>` : '`unknown`', inline: true },
      ...(thread.ownerId ? [{ name: 'Owner', value: `<@${thread.ownerId}>`, inline: true }] : [])
    ],
    footerText: `Thread ID: ${thread.id}`
  }), { channelId: thread.parentId });
}

async function logGuildUpdate(oldGuild, newGuild) {
  const changes = [];
  if (oldGuild.name !== newGuild.name) changes.push({ name: 'Name', value: `\`${oldGuild.name}\` -> \`${newGuild.name}\`` });
  if (oldGuild.iconURL() !== newGuild.iconURL()) changes.push({ name: 'Icon', value: 'Server icon changed' });
  if (oldGuild.ownerId !== newGuild.ownerId) changes.push({ name: 'Owner', value: `<@${oldGuild.ownerId}> -> <@${newGuild.ownerId}>` });
  if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
    changes.push({ name: 'Verification Level', value: `\`${oldGuild.verificationLevel}\` -> \`${newGuild.verificationLevel}\`` });
  }
  if (oldGuild.afkChannelId !== newGuild.afkChannelId) {
    changes.push({ name: 'AFK Channel', value: `${oldGuild.afkChannelId ? `<#${oldGuild.afkChannelId}>` : '`none`'} -> ${newGuild.afkChannelId ? `<#${newGuild.afkChannelId}>` : '`none`'}` });
  }

  if (!changes.length) return;
  return sendLog(newGuild, 'server', createEmbed({
    title: 'Server Updated',
    thumbnail: newGuild.iconURL({ dynamic: true }),
    fields: changes
  }));
}

// ------------------------------------------------------------------
// Moderation events
// ------------------------------------------------------------------
async function logBan(guild, user, added = true) {
  const executor = await findExecutor(
    guild,
    added ? AuditLogEvent.MemberBanAdd : AuditLogEvent.MemberBanRemove,
    user.id
  );

  return sendLog(guild, 'moderation', createEmbed({
    title: added ? 'Member Banned' : 'Member Unbanned',
    thumbnail: user.displayAvatarURL({ dynamic: true }),
    fields: [
      { name: 'User', value: userLine(user), inline: true },
      ...(executor?.executor ? [{ name: 'Moderator', value: userLine(executor.executor), inline: true }] : []),
      ...(executor?.reason ? [{ name: 'Reason', value: truncate(executor.reason) }] : [])
    ]
  }), { userId: user.id });
}

module.exports = {
  CATEGORY_LABELS,
  sendLog,
  resolveChannel,
  findExecutor,
  logMessageDelete,
  logMessageEdit,
  logBulkDelete,
  logMemberUpdate,
  logMemberJoin,
  logMemberLeave,
  logVoiceEvent,
  logChannelCreate,
  logChannelDelete,
  logChannelUpdate,
  logRoleCreate,
  logRoleDelete,
  logRoleUpdate,
  logEmojiChange,
  logThreadEvent,
  logGuildUpdate,
  logBan
};
