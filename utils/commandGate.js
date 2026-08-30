const { PermissionFlagsBits } = require('discord.js');
const db = require('../database/db');

/**
 * Per-guild command availability: disabled commands, channel locks, and role
 * locks. Administrators and the staff role always bypass, so a server cannot
 * lock itself out of its own configuration commands.
 *
 * Commands that must never be disabled - otherwise there is no way back.
 */
const PROTECTED = new Set(['config', 'help', 'commands', 'logging', 'automod']);

function isExempt(member, guild) {
  if (!member) return false;
  if (guild.ownerId === member.id) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;

  const cfg = db.getGuildConfig(guild.id);
  if (cfg.staff_role_id && member.roles.cache.has(cfg.staff_role_id)) return true;
  return false;
}

/**
 * Checks a command name (and optionally the "parent sub" form, so both
 * `economy` and `economy daily` can be targeted) against the guild's rules.
 *
 * Returns { allowed: true } or { allowed: false, reason }.
 */
function checkCommand(guild, member, channel, commandName, subcommandName = null) {
  if (!guild) return { allowed: true };

  let toggles;
  try {
    toggles = db.getCommandToggles(guild.id);
  } catch (err) {
    return { allowed: true };
  }

  if (isExempt(member, guild)) return { allowed: true };

  const names = [String(commandName).toLowerCase()];
  if (subcommandName) names.push(`${commandName} ${subcommandName}`.toLowerCase());

  for (const name of names) {
    if (toggles.disabled.includes(name)) {
      return { allowed: false, reason: `\`/${name}\` is disabled in this server.` };
    }

    const channels = toggles.channels[name];
    if (channels?.length && channel) {
      const inAllowed = channels.includes(channel.id) || (channel.parentId && channels.includes(channel.parentId));
      if (!inAllowed) {
        return {
          allowed: false,
          reason: `\`/${name}\` can only be used in ${channels.map((id) => `<#${id}>`).join(', ')}.`
        };
      }
    }

    const roles = toggles.roles[name];
    if (roles?.length && member) {
      const hasRole = roles.some((roleId) => member.roles.cache.has(roleId));
      if (!hasRole) {
        return {
          allowed: false,
          reason: `\`/${name}\` requires ${roles.map((id) => `<@&${id}>`).join(' or ')}.`
        };
      }
    }
  }

  return { allowed: true };
}

module.exports = { checkCommand, isExempt, PROTECTED };
