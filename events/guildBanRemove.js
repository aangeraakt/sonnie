const { withGuildColor } = require('../utils/embedBuilder');
const { logBan } = require('../utils/auditLogger');

module.exports = {
  name: 'guildBanRemove',
  async execute(ban) {
    return withGuildColor(ban.guild.id, () => logBan(ban.guild, ban.user, false));
  }
};
