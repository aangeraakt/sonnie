const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { checkStaffPermission } = require('../../utils/staffSecurity');
const { PROTECTED } = require('../../utils/commandGate');

function normalise(name) {
  return String(name).trim().toLowerCase().replace(/^\//, '');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('commands')
    .setDescription('Enable, disable, or restrict commands in this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('disable')
        .setDescription('Disable a command for everyone except staff')
        .addStringOption(opt => opt.setName('command').setDescription('Command name, e.g. "rob" or "economy gather"').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('enable')
        .setDescription('Re-enable a disabled command')
        .addStringOption(opt => opt.setName('command').setDescription('Command name to re-enable').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('channel')
        .setDescription('Restrict a command to one channel, or clear the restriction')
        .addStringOption(opt => opt.setName('command').setDescription('Command name to restrict').setRequired(true))
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel or category to allow. Leave empty to clear').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('role')
        .setDescription('Require a role to use a command, or clear the requirement')
        .addStringOption(opt => opt.setName('command').setDescription('Command name to restrict').setRequired(true))
        .addRoleOption(opt => opt.setName('role').setDescription('Role to require. Leave empty to clear').setRequired(false))
    )
    .addSubcommand(sub => sub.setName('list').setDescription('Show every command rule in this server'))
    .addSubcommand(sub => sub.setName('reset').setDescription('Remove every command rule')),

  async execute(interaction) {
    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission Denied', 'You need `Administrator` permissions to manage command availability.')],
        flags: 64
      });
    }

    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();
    const toggles = db.getCommandToggles(guildId);

    if (sub === 'list') {
      const channelRules = Object.entries(toggles.channels)
        .map(([name, ids]) => `\`/${name}\` -> ${ids.map((id) => `<#${id}>`).join(', ')}`);
      const roleRules = Object.entries(toggles.roles)
        .map(([name, ids]) => `\`/${name}\` -> ${ids.map((id) => `<@&${id}>`).join(', ')}`);

      if (!toggles.disabled.length && !channelRules.length && !roleRules.length) {
        return interaction.reply({
          embeds: [errorEmbed('No Rules', 'Every command is available everywhere. Add a rule with `/commands disable`, `/commands channel`, or `/commands role`.')],
          flags: 64
        });
      }

      return interaction.reply({
        embeds: [createEmbed({
          title: 'Command Rules',
          description: 'Administrators, members with **Manage Server**, and the staff role always bypass these rules.',
          fields: [
            { name: 'Disabled', value: toggles.disabled.map((name) => `\`/${name}\``).join(', ') || '`None`', inline: false },
            { name: 'Channel Locked', value: channelRules.join('\n') || '`None`', inline: false },
            { name: 'Role Locked', value: roleRules.join('\n') || '`None`', inline: false }
          ]
        })]
      });
    }

    if (sub === 'reset') {
      db.getCommandToggles(guildId);
      for (const name of [...toggles.disabled]) db.setCommandDisabled(guildId, name, false);
      for (const name of Object.keys(toggles.channels)) db.setCommandChannelLock(guildId, name, null);
      for (const name of Object.keys(toggles.roles)) db.setCommandRoleLock(guildId, name, null);
      return interaction.reply({ embeds: [successEmbed('Command Rules Cleared', 'Every command is available everywhere again.')] });
    }

    const name = normalise(interaction.options.getString('command'));
    const known = interaction.client.commands.has(name.split(' ')[0]);

    if (!known) {
      return interaction.reply({
        embeds: [errorEmbed('Unknown Command', `\`/${name}\` is not a command I have. Use the top-level name (\`economy\`, \`music\`, \`moderation\`) or a "parent sub" pair like \`economy rob\`.`)],
        flags: 64
      });
    }

    if (sub === 'disable') {
      if (PROTECTED.has(name)) {
        return interaction.reply({
          embeds: [errorEmbed('Cannot Disable', `\`/${name}\` is protected - disabling it would leave no way to undo the change.`)],
          flags: 64
        });
      }
      db.setCommandDisabled(guildId, name, true);
      return interaction.reply({
        embeds: [successEmbed('Command Disabled', `\`/${name}\` is now disabled for everyone except administrators and the staff role.`)]
      });
    }

    if (sub === 'enable') {
      if (!toggles.disabled.includes(name)) {
        return interaction.reply({ embeds: [errorEmbed('Not Disabled', `\`/${name}\` is not currently disabled.`)], flags: 64 });
      }
      db.setCommandDisabled(guildId, name, false);
      return interaction.reply({ embeds: [successEmbed('Command Enabled', `\`/${name}\` is available again.`)] });
    }

    if (sub === 'channel') {
      const channel = interaction.options.getChannel('channel');
      if (!channel) {
        db.setCommandChannelLock(guildId, name, null);
        return interaction.reply({ embeds: [successEmbed('Channel Restriction Cleared', `\`/${name}\` can be used in any channel again.`)] });
      }

      const existing = toggles.channels[name] || [];
      const updated = existing.includes(channel.id)
        ? existing.filter((id) => id !== channel.id)
        : [...existing, channel.id];

      db.setCommandChannelLock(guildId, name, updated);
      return interaction.reply({
        embeds: [successEmbed('Channel Restriction Updated', updated.length
          ? `\`/${name}\` is now limited to ${updated.map((id) => `<#${id}>`).join(', ')}.\n\nRun this again with the same channel to remove it.`
          : `\`/${name}\` can be used in any channel again.`)]
      });
    }

    if (sub === 'role') {
      const role = interaction.options.getRole('role');
      if (!role) {
        db.setCommandRoleLock(guildId, name, null);
        return interaction.reply({ embeds: [successEmbed('Role Requirement Cleared', `\`/${name}\` no longer requires a role.`)] });
      }

      const existing = toggles.roles[name] || [];
      const updated = existing.includes(role.id)
        ? existing.filter((id) => id !== role.id)
        : [...existing, role.id];

      db.setCommandRoleLock(guildId, name, updated);
      return interaction.reply({
        embeds: [successEmbed('Role Requirement Updated', updated.length
          ? `\`/${name}\` now requires ${updated.map((id) => `<@&${id}>`).join(' or ')}.\n\nRun this again with the same role to remove it.`
          : `\`/${name}\` no longer requires a role.`)]
      });
    }

    return interaction.reply({ embeds: [errorEmbed('Unknown Option', 'That option is not available.')], flags: 64 });
  }
};
