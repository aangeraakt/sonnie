const { PermissionFlagsBits } = require('discord.js');
const db = require('../database/db');

/**
 * Checks if a member has staff permissions or Administrator permissions
 */
function checkStaffPermission(member, guild, requiredPermission = PermissionFlagsBits.ManageMessages) {
  if (!member || !guild) return false;
  if (guild.ownerId === member.id) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (requiredPermission && member.permissions.has(requiredPermission)) return true;

  const cfg = db.getGuildConfig(guild.id);
  if (cfg.staff_role_id && member.roles.cache.has(cfg.staff_role_id)) {
    return true;
  }
  return false;
}

/**
 * Validates a moderation command execution against permissions and role hierarchies
 */
function validateModerationTarget(interaction, targetUser, requiredPermission) {
  const { guild, member, user } = interaction;

  // 1. Check if caller has required permissions
  if (!checkStaffPermission(member, guild, requiredPermission)) {
    return {
      valid: false,
      error: 'Permission Denied: You do not have the required staff permissions to perform this action.'
    };
  }

  if (!targetUser) {
    return { valid: true };
  }

  // 2. Cannot moderate self
  if (targetUser.id === user.id) {
    return {
      valid: false,
      error: 'Invalid Target: You cannot perform moderation actions on yourself!'
    };
  }

  // 3. Cannot moderate the bot itself
  if (targetUser.id === interaction.client.user.id) {
    return {
      valid: false,
      error: 'Invalid Target: You cannot perform moderation actions on Sonnies bot!'
    };
  }

  // 4. Cannot moderate server owner
  if (targetUser.id === guild.ownerId) {
    return {
      valid: false,
      error: 'Invalid Target: You cannot moderate the Server Owner!'
    };
  }

  const targetMember = guild.members.cache.get(targetUser.id);
  if (targetMember) {
    // 5. Caller role hierarchy check (unless caller is server owner)
    if (guild.ownerId !== user.id) {
      if (targetMember.roles.highest.position >= member.roles.highest.position) {
        return {
          valid: false,
          error: 'Role Hierarchy: You cannot moderate this member because their highest role is equal to or higher than yours!'
        };
      }
    }

    // 6. Bot role hierarchy check
    const botMember = guild.members.me || guild.members.cache.get(interaction.client.user.id);
    if (botMember && targetMember.roles.highest.position >= botMember.roles.highest.position) {
      return {
        valid: false,
        error: 'Role Hierarchy: I cannot moderate this member because their highest role is equal to or higher than my bot role!'
      };
    }
  }

  return { valid: true, targetMember };
}

module.exports = {
  checkStaffPermission,
  validateModerationTarget
};
