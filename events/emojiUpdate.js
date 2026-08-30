const { withGuildColor } = require('../utils/embedBuilder');
const { logEmojiChange } = require('../utils/auditLogger');

module.exports = {
  name: 'emojiUpdate',
  async execute(oldEmoji, newEmoji) {
    if (oldEmoji.name === newEmoji.name) return;
    return withGuildColor(newEmoji.guild.id, () => logEmojiChange(newEmoji, 'Updated', oldEmoji));
  }
};
