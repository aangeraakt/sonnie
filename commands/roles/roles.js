const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embedBuilder');
const { checkStaffPermission } = require('../../utils/staffSecurity');
const { panelComponents, panelEmbed } = require('../../utils/rolePanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roles')
    .setDescription('Self-assign role panels')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a role to the panel')
        .addRoleOption((opt) => opt.setName('role').setDescription('Role to offer').setRequired(true))
        .addStringOption((opt) => opt.setName('label').setDescription('Button label').setRequired(false))
        .addStringOption((opt) => opt.setName('emoji').setDescription('Unicode emoji').setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a role from the panel')
        .addRoleOption((opt) => opt.setName('role').setDescription('Role to remove').setRequired(true))
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('List roles on the panel'))
    .addSubcommand((sub) =>
      sub
        .setName('panel')
        .setDescription('Post or refresh the role panel in this channel')
    ),

  async execute(interaction) {
    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission Denied', 'You need Manage Roles to edit the role panel.')],
        flags: 64
      });
    }

    const sub = interaction.options.getSubcommand();
    const panel = db.getRolePanel(interaction.guild.id);

    if (sub === 'add') {
      const role = interaction.options.getRole('role');
      if (role.managed || role.id === interaction.guild.id) {
        return interaction.reply({ embeds: [errorEmbed('Invalid Role', 'That role cannot be self-assigned.')], flags: 64 });
      }
      if (panel.roles.length >= 25) {
        return interaction.reply({ embeds: [errorEmbed('Limit Reached', 'A panel can have at most 25 roles.')], flags: 64 });
      }
      panel.roles = panel.roles.filter((item) => item.role_id !== role.id);
      panel.roles.push({
        role_id: role.id,
        label: interaction.options.getString('label') || role.name,
        emoji: interaction.options.getString('emoji') || null
      });
      db.saveRolePanel(interaction.guild.id, panel);
      return interaction.reply({ embeds: [successEmbed('Role Added', `${role} is now on the self-assign panel.`)] });
    }

    if (sub === 'remove') {
      const role = interaction.options.getRole('role');
      const before = panel.roles.length;
      panel.roles = panel.roles.filter((item) => item.role_id !== role.id);
      if (panel.roles.length === before) {
        return interaction.reply({ embeds: [errorEmbed('Not Found', `${role} is not on the panel.`)], flags: 64 });
      }
      db.saveRolePanel(interaction.guild.id, panel);
      return interaction.reply({ embeds: [successEmbed('Role Removed', `${role} was removed from the panel.`)] });
    }

    if (sub === 'list') {
      if (!panel.roles.length) {
        return interaction.reply({ embeds: [infoEmbed('Role Panel', 'No roles configured. Use `/roles add`.')] });
      }
      const lines = panel.roles.map((item) => `${item.emoji || ''} <@&${item.role_id}> — ${item.label}`).join('\n');
      return interaction.reply({ embeds: [infoEmbed('Role Panel', lines)] });
    }

    if (!panel.roles.length) {
      return interaction.reply({
        embeds: [errorEmbed('Empty Panel', 'Add roles with `/roles add` before posting a panel.')],
        flags: 64
      });
    }

    const message = await interaction.channel.send({
      embeds: [panelEmbed(panel.roles)],
      components: panelComponents(panel.roles)
    });
    db.saveRolePanel(interaction.guild.id, { ...panel, message_id: message.id, channel_id: interaction.channel.id });
    return interaction.reply({ embeds: [successEmbed('Panel Posted', 'Members can pick roles from the menu above.')], flags: 64 });
  }
};
