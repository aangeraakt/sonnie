const { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const db = require('../database/db');
const { createEmbed, errorEmbed, successEmbed } = require('./embedBuilder');

function panelComponents(roles) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('roles_panel')
    .setPlaceholder('Pick a role to add or remove')
    .addOptions(
      roles.slice(0, 25).map((role) => {
        const option = new StringSelectMenuOptionBuilder()
          .setLabel(role.label.slice(0, 100))
          .setValue(role.role_id)
          .setDescription(`Toggle <@&${role.role_id}>`.slice(0, 100));
        if (role.emoji) option.setEmoji(role.emoji);
        return option;
      })
    );
  return [new ActionRowBuilder().addComponents(menu)];
}

function panelEmbed(roles) {
  const lines = roles.map((role) => `${role.emoji ? `${role.emoji} ` : ''}<@&${role.role_id}> — ${role.label}`);
  return createEmbed({
    title: 'Self-assign roles',
    description: lines.join('\n') || 'No roles configured yet.'
  });
}

async function handleRoleSelect(interaction) {
  const roleId = interaction.values[0];
  const panel = db.getRolePanel(interaction.guild.id);
  const configured = panel.roles.find((role) => role.role_id === roleId);
  if (!configured) {
    return interaction.reply({ embeds: [errorEmbed('Unknown Role', 'That role is no longer on this panel.')], flags: 64 });
  }

  const role = interaction.guild.roles.cache.get(roleId);
  if (!role) {
    return interaction.reply({ embeds: [errorEmbed('Missing Role', 'That role no longer exists.')], flags: 64 });
  }

  const member = interaction.member;
  if (member.roles.cache.has(roleId)) {
    await member.roles.remove(role).catch(() => {
      throw new Error('Could not remove that role. Check my role position.');
    });
    return interaction.reply({ embeds: [successEmbed('Role Removed', `Removed ${role}.`)], flags: 64 });
  }

  await member.roles.add(role).catch(() => {
    throw new Error('Could not add that role. Check my role position.');
  });
  return interaction.reply({ embeds: [successEmbed('Role Added', `You now have ${role}.`)], flags: 64 });
}

module.exports = {
  panelComponents,
  panelEmbed,
  handleRoleSelect
};
