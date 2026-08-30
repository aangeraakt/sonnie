const { withGuildColor } = require('../utils/embedBuilder');
const { logRoleUpdate } = require('../utils/auditLogger');

module.exports = {
  name: 'roleUpdate',
  async execute(oldRole, newRole) {
    return withGuildColor(newRole.guild.id, () => logRoleUpdate(oldRole, newRole));
  }
};
