const { cacheGuildInvites } = require('../utils/inviteCache');

module.exports = {
  name: 'guildCreate',
  async execute(guild) {
    await cacheGuildInvites(guild);
  }
};
