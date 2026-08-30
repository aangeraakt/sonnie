const { withGuildColor } = require('../utils/embedBuilder');
const { logChannelCreate } = require('../utils/auditLogger');

module.exports = {
  name: 'channelCreate',
  async execute(entity) {
    if (!entity.guild) return;
    return withGuildColor(entity.guild.id, () => logChannelCreate(entity));
  }
};
