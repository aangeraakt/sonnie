const { syncStarboard } = require('../utils/starboard');
const { withGuildColor } = require('../utils/embedBuilder');

module.exports = {
  name: 'messageReactionRemove',
  async execute(reaction, user) {
    const guildId = reaction.message?.guildId || reaction.message?.guild?.id;
    await withGuildColor(guildId, () => syncStarboard(reaction, user));
  }
};
