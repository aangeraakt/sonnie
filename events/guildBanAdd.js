const { withGuildColor } = require('../utils/embedBuilder');
const { logBan } = require('../utils/auditLogger');
const { onBanAdd } = require('../utils/antiNuke');

module.exports = {
  name: 'guildBanAdd',
  async execute(ban) {
    return withGuildColor(ban.guild.id, async () => {
      await logBan(ban.guild, ban.user, true);
      await onBanAdd(ban);
    });
  }
};
