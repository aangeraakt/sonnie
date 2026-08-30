const { cacheGuildInvites } = require('../utils/inviteCache');

module.exports = {
  name: 'inviteDelete',
  async execute(invite) {
    if (invite.guild) await cacheGuildInvites(invite.guild);
  }
};
