const { withGuildColor } = require('../utils/embedBuilder');
const { logChannelDelete } = require('../utils/auditLogger');
const { onChannelDelete } = require('../utils/antiNuke');

module.exports = {
  name: 'channelDelete',
  async execute(channel) {
    if (!channel.guild) return;
    return withGuildColor(channel.guild.id, async () => {
      await logChannelDelete(channel);
      await onChannelDelete(channel);
    });
  }
};
