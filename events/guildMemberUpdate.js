const { withGuildColor } = require('../utils/embedBuilder');
const { logMemberUpdate } = require('../utils/auditLogger');

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember) {
    if (newMember.user.bot) return;
    return withGuildColor(newMember.guild.id, () => logMemberUpdate(oldMember, newMember));
  }
};
