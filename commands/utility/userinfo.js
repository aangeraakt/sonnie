const { SlashCommandBuilder } = require('discord.js');
const { createEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Display detailed information about a server member')
    .addUserOption(opt => opt.setName('user').setDescription('User to view').setRequired(false)),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const member = interaction.guild.members.cache.get(targetUser.id);

    const roles = member ? member.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => r.toString()).join(', ') || 'None' : 'N/A';

    const embed = createEmbed({
      title: `👤 User Info - ${targetUser.tag}`,
      thumbnail: targetUser.displayAvatarURL({ dynamic: true }),
      fields: [
        { name: '🆔 User ID', value: `\`${targetUser.id}\``, inline: true },
        { name: '📅 Account Created', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:f>`, inline: true },
        { name: '📥 Joined Server', value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:f>` : 'N/A', inline: true },
        { name: '🎭 Roles', value: roles.length > 1024 ? `${roles.substring(0, 1000)}...` : roles, inline: false }
      ]
    });

    return interaction.reply({ embeds: [embed] });
  }
};
