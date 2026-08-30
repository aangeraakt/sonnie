const { withGuildColor } = require('../utils/embedBuilder');
const { logRoleCreate } = require('../utils/auditLogger');

module.exports = {
  name: 'roleCreate',
  async execute(entity) {
    if (!entity.guild) return;
    return withGuildColor(entity.guild.id, () => logRoleCreate(entity));
  }
};
