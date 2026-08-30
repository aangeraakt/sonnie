const db = require('../database/db');
const { createEmbed, infoEmbed, withGuildColor } = require('../utils/embedBuilder');
const { handlePrefixCommand } = require('../utils/prefixCommandHandler');
const { handleCountingMessage } = require('../utils/countingHandler');
const { handleMinigameMessage } = require('../utils/minigameManager');
const { handleAutoMod } = require('../utils/autoModHandler');
const { grantXp } = require('../utils/levelingManager');
const { handleAutoResponder } = require('../utils/autoResponder');
const { recordMessage } = require('../utils/snipeStore');
const { trackQuest } = require('../utils/questSystem');

const xpCooldowns = new Set();
const userMessageCounts = new Map();
const stickyLocks = new Map();

async function handleAfk(message) {
  const cleared = db.clearAfk(message.guild.id, message.author.id);
  if (cleared) {
    await message.reply({ embeds: [infoEmbed('Welcome Back', 'Your AFK status was cleared.')] }).catch(() => {});
  }

  const mentioned = [...message.mentions.users.values()].filter((user) => !user.bot && user.id !== message.author.id);
  const lines = [];
  for (const user of mentioned) {
    const item = db.getAfk(message.guild.id, user.id);
    if (item) lines.push(`${user}: ${item.reason}`);
  }
  if (lines.length) {
    await message.reply({ embeds: [infoEmbed('AFK', lines.join('\n'))] }).catch(() => {});
  }
}

async function handleSticky(message) {
  const sticky = db.getSticky(message.channel.id);
  if (!sticky || message.id === sticky.last_message_id) return;
  if (stickyLocks.has(message.channel.id)) return;
  stickyLocks.set(message.channel.id, true);
  try {
    if (sticky.last_message_id) {
      const old = await message.channel.messages.fetch(sticky.last_message_id).catch(() => null);
      if (old) await old.delete().catch(() => {});
    }
    const posted = await message.channel.send({
      embeds: [createEmbed({ title: 'Sticky', description: sticky.content })]
    });
    db.setSticky(message.channel.id, { ...sticky, last_message_id: posted.id });
  } finally {
    setTimeout(() => stickyLocks.delete(message.channel.id), 1500);
  }
}

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot || !message.guild) return;
    return withGuildColor(message.guild.id, () => run(message));
  }
};

async function run(message) {
    recordMessage(message);

    const countingChannel = db.getCountingByChannel(message.channel.id);
    const minigameChannel = db.getMinigameByChannel(message.channel.id);
    if ((!countingChannel || !countingChannel.channel_id) && !minigameChannel) {
      const isViolating = await handleAutoMod(message);
      if (isViolating) return;
    }

    await handleAfk(message);

    const isCounting = await handleCountingMessage(message);
    const isCommand = isCounting ? false : await handlePrefixCommand(message, message.client);
    const isMinigame = (isCounting || isCommand) ? false : await handleMinigameMessage(message);

    const cfg = db.getGuildConfig(message.guild.id);
    if (!isCounting && !isCommand && !isMinigame && cfg.xp_enabled) {
      const userId = message.author.id;
      const cooldownKey = `${message.guild.id}-${userId}`;

      if (!xpCooldowns.has(cooldownKey)) {
        const count = (userMessageCounts.get(cooldownKey) || 0) + 1;
        if (count >= 2) {
          userMessageCounts.set(cooldownKey, 0);
          xpCooldowns.add(cooldownKey);
          setTimeout(() => xpCooldowns.delete(cooldownKey), 5000);
          // grantXp applies the guild base rate, role/channel multipliers,
          // no-XP exclusions, reward roles, and the level-up announcement.
          await grantXp(message.member, 3, { channel: message.channel, source: 'message' }).catch(() => {});
          trackQuest(message.guild.id, userId, 'chat', 2);
        } else {
          userMessageCounts.set(cooldownKey, count);
        }
      }
    }

    if (!isCounting && !isCommand && !isMinigame) {
      await handleAutoResponder(message);
    }

    await handleSticky(message);
}
