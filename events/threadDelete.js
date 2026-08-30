const { withGuildColor } = require('../utils/embedBuilder');
const { logThreadEvent } = require('../utils/auditLogger');

module.exports = {
  name: 'threadDelete',
  async execute(thread) {
    if (!thread.guild) return;
    return withGuildColor(thread.guild.id, () => logThreadEvent(thread, 'Deleted'));
  }
};
