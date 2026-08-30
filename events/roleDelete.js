const { withGuildColor } = require('../utils/embedBuilder');
const { logRoleDelete } = require('../utils/auditLogger');
const { onRoleDelete } = require('../utils/antiNuke');

module.exports = {
  name: 'roleDelete',
  async execute(role) {
    return withGuildColor(role.guild.id, async () => {
      await logRoleDelete(role);
      await onRoleDelete(role);
    });
  }
};
