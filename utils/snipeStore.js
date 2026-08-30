/**
 * In-memory ring of recently deleted and edited messages, per channel.
 * Deliberately not persisted - snipes are a short-lived convenience and
 * writing every message to disk would be both slow and a privacy problem.
 */
const MAX_PER_CHANNEL = 10;
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours
const CONTENT_CACHE_LIMIT = 2000;

const deletedByChannel = new Map();
const editedByChannel = new Map();
// Cache of live message content so deletes of uncached messages still snipe.
const contentCache = new Map();

function cacheKey(channelId, messageId) {
  return `${channelId}-${messageId}`;
}

function recordMessage(message) {
  if (!message || !message.guild || message.author?.bot) return;
  if (!message.content && !message.attachments?.size) return;

  if (contentCache.size >= CONTENT_CACHE_LIMIT) {
    // Drop the oldest quarter in insertion order.
    const drop = Math.floor(CONTENT_CACHE_LIMIT / 4);
    let removed = 0;
    for (const key of contentCache.keys()) {
      contentCache.delete(key);
      if (++removed >= drop) break;
    }
  }

  contentCache.set(cacheKey(message.channel.id, message.id), {
    content: message.content || '',
    authorId: message.author.id,
    authorTag: message.author.tag,
    authorAvatar: message.author.displayAvatarURL({ dynamic: true }),
    attachments: [...(message.attachments?.values() || [])].map((a) => a.url),
    createdTimestamp: message.createdTimestamp
  });
}

function push(map, channelId, entry) {
  if (!map.has(channelId)) map.set(channelId, []);
  const list = map.get(channelId);
  list.unshift(entry);
  if (list.length > MAX_PER_CHANNEL) list.length = MAX_PER_CHANNEL;
}

function recordDelete(message) {
  if (!message || !message.guild) return;

  const cached = contentCache.get(cacheKey(message.channelId || message.channel?.id, message.id));
  const author = message.author;
  if (author?.bot) return;
  if (!author && !cached) return;

  const content = message.content || cached?.content || '';
  const attachments = message.attachments?.size
    ? [...message.attachments.values()].map((a) => a.url)
    : (cached?.attachments || []);

  if (!content && !attachments.length) return;

  push(deletedByChannel, message.channelId || message.channel.id, {
    content,
    attachments,
    authorId: author?.id || cached?.authorId,
    authorTag: author?.tag || cached?.authorTag || 'Unknown user',
    authorAvatar: author?.displayAvatarURL?.({ dynamic: true }) || cached?.authorAvatar || null,
    at: Date.now(),
    originallyAt: message.createdTimestamp || cached?.createdTimestamp || Date.now()
  });

  contentCache.delete(cacheKey(message.channelId || message.channel.id, message.id));
}

function recordEdit(oldMessage, newMessage) {
  if (!newMessage || !newMessage.guild || newMessage.author?.bot) return;

  const cached = contentCache.get(cacheKey(newMessage.channel.id, newMessage.id));
  const before = oldMessage?.content || cached?.content || '';
  const after = newMessage.content || '';
  if (!before || before === after) {
    recordMessage(newMessage);
    return;
  }

  push(editedByChannel, newMessage.channel.id, {
    before,
    after,
    authorId: newMessage.author.id,
    authorTag: newMessage.author.tag,
    authorAvatar: newMessage.author.displayAvatarURL({ dynamic: true }),
    url: newMessage.url,
    at: Date.now()
  });

  recordMessage(newMessage);
}

function fresh(list) {
  const now = Date.now();
  return (list || []).filter((entry) => now - entry.at < MAX_AGE_MS);
}

function getDeleted(channelId, index = 0) {
  const list = fresh(deletedByChannel.get(channelId));
  return { entry: list[index] || null, total: list.length };
}

function getEdited(channelId, index = 0) {
  const list = fresh(editedByChannel.get(channelId));
  return { entry: list[index] || null, total: list.length };
}

function clearChannel(channelId) {
  deletedByChannel.delete(channelId);
  editedByChannel.delete(channelId);
}

module.exports = {
  recordMessage,
  recordDelete,
  recordEdit,
  getDeleted,
  getEdited,
  clearChannel,
  MAX_PER_CHANNEL
};
