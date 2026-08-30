const { withGuildColor } = require('../utils/embedBuilder');
const { logEmojiChange } = require('../utils/auditLogger');

module.exports = {
  name: 'emojiDelete',
  async execute(emoji) {
    return withGuildColor(emoji.guild.id, () => logEmojiChange(emoji, 'Deleted'));
  }
};
