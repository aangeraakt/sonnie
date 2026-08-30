const { SlashCommandBuilder } = require('discord.js');
const { createEmbed } = require('../../utils/embedBuilder');

const KEY_PERMISSIONS = [
  'Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'ManageMessages',
  'BanMembers', 'KickMembers', 'ModerateMembers', 'MentionEveryone', 'ManageWebhooks',
  'ManageNicknames', 'ViewAuditLog'
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roleinfo')
    .setDescription('Show detailed information about a role')
    .addRoleOption(opt => opt.setName('role').setDescription('The role to inspect').setRequired(true)),

  async execute(interaction) {
    const role = interaction.options.getRole('role');
    const created = Math.floor(role.createdTimestamp / 1000);

    const key = KEY_PERMISSIONS.filter((perm) => role.permissions.has(perm));
    const memberCount = role.members?.size ?? 0;
    const position = interaction.guild.roles.cache.size - role.position;

    return interaction.reply({
      embeds: [createEmbed({
        title: `Role - ${role.name}`,
        description: role.id === interaction.guild.id ? 'This is the default `@everyone` role.' : `${role}`,
        thumbnail: role.iconURL?.({ size: 128 }) || undefined,
        fields: [
          { name: 'Members', value: `\`${memberCount}\``, inline: true },
          { name: 'Color', value: `\`${role.hexColor}\``, inline: true },
          { name: 'Position', value: `\`${position} from top\``, inline: true },
          { name: 'Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true },
          { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
          { name: 'Managed', value: role.managed ? 'Yes (integration)' : 'No', inline: true },
          { name: 'Created', value: `<t:${created}:D> (<t:${created}:R>)`, inline: false },
          { name: 'Key Permissions', value: key.length ? `\`${key.join('`, `')}\`` : '`None`', inline: false }
        ],
        footerText: `Role ID: ${role.id}`
      })]
    });
  }
};
