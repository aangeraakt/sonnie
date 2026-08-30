const { withGuildColor } = require('../utils/embedBuilder');
const { logGuildUpdate } = require('../utils/auditLogger');

module.exports = {
  name: 'guildUpdate',
  async execute(oldGuild, newGuild) {
    return withGuildColor(newGuild.id, () => logGuildUpdate(oldGuild, newGuild));
  }
};
