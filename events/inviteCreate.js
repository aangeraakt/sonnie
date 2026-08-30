const { cacheGuildInvites } = require('../utils/inviteCache');

module.exports = {
  name: 'inviteCreate',
  async execute(invite) {
    if (invite.guild) await cacheGuildInvites(invite.guild);
  }
};
