const { handleCountingEdit } = require('../utils/countingHandler');
const { withGuildColor } = require('../utils/embedBuilder');
const { recordEdit } = require('../utils/snipeStore');
const { logMessageEdit } = require('../utils/auditLogger');

module.exports = {
  name: 'messageUpdate',
  async execute(oldMessage, newMessage) {
    if (!oldMessage.guild || oldMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;
    return withGuildColor(oldMessage.guild.id, () => run(oldMessage, newMessage));
  }
};

async function run(oldMessage, newMessage) {
  recordEdit(oldMessage, newMessage);

  // Check if edited message is in a counting channel (anti-tamper protection)
  await handleCountingEdit(oldMessage, newMessage);

  await logMessageEdit(oldMessage, newMessage);
}
