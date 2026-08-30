const db = require('../database/db');
const Logger = require('./logger');
const { createEmbed, COLORS } = require('./embedBuilder');

function parseCountNumber(content) {
  if (!content || typeof content !== 'string') return null;

  const cleanStr = content
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF\u00A0\u2060]/g, '')
    .replace(/,/g, '')
    .trim();

  if (/^\d+$/.test(cleanStr)) {
    const number = Number(cleanStr);
    if (Number.isSafeInteger(number) && number >= 0) return number;
    return null;
  }

  if (/^[\d\s+\-*/%^()]+$/.test(cleanStr)) {
    try {
      const sanitized = cleanStr.replace(/\^/g, '**');
      if (!/^[0-9+\-*/%().\s]+$/.test(sanitized)) return null;
      const result = Function(`"use strict"; return (${sanitized});`)();
      if (typeof result === 'number' && Number.isFinite(result) && Number.isInteger(result) && result >= 0 && Number.isSafeInteger(result)) {
        return result;
      }
    } catch (e) {}
  }

  return null;
}

async function handleCountingMessage(message) {
  if (!message.guild || message.author.bot) return false;

  const counting = db.getCountingByChannel(message.channel.id);
  if (!counting || !counting.channel_id) return false;

  const currentCount = counting.current_count || 0;
  const expectedNumber = currentCount + 1;
  const number = parseCountNumber(message.content);

  const isDoubleCount = !counting.allow_double_counting &&
    counting.last_user_id === message.author.id &&
    currentCount > 0;

  const isWrong = number === null || number !== expectedNumber || isDoubleCount;

  if (isWrong) {
    try {
      await message.delete();
    } catch (err) {
      Logger.warn(`Could not delete invalid counting message in #${message.channel.name}: ${err.message}`);
    }
    return true;
  }

  try {
    await message.react('✅');
    if (expectedNumber % 100 === 0) {
      await message.react('🎉').catch(() => {});
    } else if (expectedNumber % 50 === 0) {
      await message.react('⭐').catch(() => {});
    }
  } catch (err) {
    Logger.warn(`Could not add checkmark reaction: ${err.message}`);
  }

  db.updateCountingNumber(message.guild.id, expectedNumber, message.author.id, message.id);

  try {
    db.addBalance(message.guild.id, message.author.id, 2);
    db.addXP(message.guild.id, message.author.id, 3);
  } catch (err) {
    Logger.error('Failed to award counting rewards:', err);
  }

  return true;
}

async function handleCountingEdit(oldMessage, newMessage) {
  if (!oldMessage.guild || oldMessage.author?.bot) return;

  const counting = db.getCountingByChannel(oldMessage.channel.id);
  if (!counting || !counting.channel_id) return;

  const record = db.getCountedMessage(counting.guild_id, oldMessage.id);
  if (record) {
    if (parseCountNumber(newMessage.content) !== record.number) {
      try {
        await newMessage.delete();
      } catch (err) {}

      const alertEmbed = createEmbed({
        title: 'Count Tampering Detected',
        description: `**${newMessage.author}** edited their count message (was **#${record.number}**).\n\nThe count is safe.\n• Current count: **${counting.current_count}**\n• Next number: **${counting.current_count + 1}**`,
        color: COLORS.WARNING
      });

      newMessage.channel.send({ embeds: [alertEmbed] }).then(tempMsg => {
        setTimeout(() => tempMsg.delete().catch(() => {}), 6000);
      }).catch(() => {});
    }
  }
}

async function handleCountingDelete(message) {
  if (!message.guild || message.author?.bot) return;

  const counting = db.getCountingByChannel(message.channel.id);
  if (!counting || !counting.channel_id) return;

  const record = db.getCountedMessage(counting.guild_id, message.id);
  if (record) {
    const deleteEmbed = createEmbed({
      title: 'Count Message Deleted',
      description: `<@${record.userId}> deleted their count message (**#${record.number}**).\n\nThe count is safe.\n• Current Count: **${counting.current_count}**\n• Next Number: **${counting.current_count + 1}**`,
      color: COLORS.INFO
    });

    message.channel.send({ embeds: [deleteEmbed] }).catch(() => {});
  }
}

module.exports = {
  parseCountNumber,
  handleCountingMessage,
  handleCountingEdit,
  handleCountingDelete
};
