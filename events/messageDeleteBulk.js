const { withGuildColor } = require('../utils/embedBuilder');
const { logBulkDelete } = require('../utils/auditLogger');

module.exports = {
  name: 'messageDeleteBulk',
  async execute(messages, channel) {
    const guild = channel?.guild;
    if (!guild) return;
    return withGuildColor(guild.id, () => logBulkDelete(messages, channel));
  }
};
