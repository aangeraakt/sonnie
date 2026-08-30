const { withGuildColor } = require('../utils/embedBuilder');
const { logChannelUpdate } = require('../utils/auditLogger');

module.exports = {
  name: 'channelUpdate',
  async execute(oldChannel, newChannel) {
    if (!newChannel.guild) return;
    return withGuildColor(newChannel.guild.id, () => logChannelUpdate(oldChannel, newChannel));
  }
};
