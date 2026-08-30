const { handleCountingDelete } = require('../utils/countingHandler');
const { withGuildColor } = require('../utils/embedBuilder');
const { recordDelete } = require('../utils/snipeStore');
const { logMessageDelete, findExecutor } = require('../utils/auditLogger');
const { AuditLogEvent } = require('discord.js');

module.exports = {
  name: 'messageDelete',
  async execute(message) {
    if (!message.guild || message.author?.bot) return;
    return withGuildColor(message.guild.id, () => run(message));
  }
};

async function run(message) {
  // Capture for /tools snipe before anything else can drop the reference.
  recordDelete(message);

  // Check if deleted message was a counted message in a counting channel
  await handleCountingDelete(message);

  // Attribute the delete to a moderator when the audit log knows who did it.
  const executor = await findExecutor(message.guild, AuditLogEvent.MessageDelete, message.author?.id, 5000);
  await logMessageDelete(message, executor?.executor || null);
}
