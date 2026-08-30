const db = require('../database/db');
const { createEmbed, COLORS } = require('./embedBuilder');

function reactionEmojiKey(emoji) {
  return emoji.id ? `<:${emoji.name}:${emoji.id}>` : emoji.name;
}

function countMatches(reaction, configured) {
  const key = reactionEmojiKey(reaction.emoji);
  return key === configured || reaction.emoji.name === configured;
}

async function syncStarboard(reaction, user) {
  if (!reaction.message.guild || user?.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => null);
  const message = reaction.message;
  if (message.partial) await message.fetch().catch(() => null);
  if (!message.guild || message.author?.bot) return;

  const cfg = db.getGuildConfig(message.guild.id);
  if (!cfg.starboard_channel_id) return;
  if (message.channel.id === cfg.starboard_channel_id) return;

  const emoji = cfg.starboard_emoji || '⭐';
  const threshold = Math.max(1, Number(cfg.starboard_count) || 3);
  if (!countMatches(reaction, emoji)) return;

  const matched = message.reactions.cache.find((item) => countMatches(item, emoji));
  const users = matched ? await matched.users.fetch().catch(() => null) : null;
  const count = users ? users.filter((item) => !item.bot).size : 0;

  const board = message.guild.channels.cache.get(cfg.starboard_channel_id);
  if (!board?.send) return;

  const existing = db.getStarboardEntry(message.id);

  if (count < threshold) {
    if (existing?.starboard_message_id) {
      const posted = await board.messages.fetch(existing.starboard_message_id).catch(() => null);
      if (posted) await posted.delete().catch(() => {});
      db.deleteStarboardEntry(message.id);
    }
    return;
  }

  const jump = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
  const embed = createEmbed({
    title: `${emoji} ${count}`,
    description: (message.content || '*Attachment / embed*').slice(0, 1800),
    color: COLORS.WARNING,
    authorName: message.author.tag,
    authorIcon: message.author.displayAvatarURL(),
    url: jump,
    fields: [{ name: 'Source', value: `[Jump to message](${jump}) in ${message.channel}`, inline: false }],
    image: message.attachments.first()?.contentType?.startsWith('image/') ? message.attachments.first().url : undefined,
    timestamp: true
  });

  if (existing?.starboard_message_id) {
    const posted = await board.messages.fetch(existing.starboard_message_id).catch(() => null);
    if (posted) {
      await posted.edit({ embeds: [embed] }).catch(() => {});
      return;
    }
  }

  const posted = await board.send({ embeds: [embed] }).catch(() => null);
  if (posted) db.saveStarboardEntry(message.id, { guild_id: message.guild.id, starboard_message_id: posted.id, count });
}

module.exports = { syncStarboard };
