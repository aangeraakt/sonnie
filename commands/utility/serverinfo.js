const { SlashCommandBuilder } = require('discord.js');
const { createEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Display information and statistics about this server'),

  async execute(interaction) {
    const { guild } = interaction;
    const owner = await guild.fetchOwner();

    const embed = createEmbed({
      title: `🏰 Server Info - ${guild.name}`,
      thumbnail: guild.iconURL({ dynamic: true }),
      fields: [
        { name: '👑 Owner', value: `${owner.user.tag}`, inline: true },
        { name: '🆔 Server ID', value: `\`${guild.id}\``, inline: true },
        { name: '👥 Members', value: `\`${guild.memberCount}\``, inline: true },
        { name: '💬 Channels', value: `\`${guild.channels.cache.size}\` channels`, inline: true },
        { name: '🎭 Roles', value: `\`${guild.roles.cache.size}\` roles`, inline: true },
        { name: '📅 Created On', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:f>`, inline: true }
      ]
    });

    return interaction.reply({ embeds: [embed] });
  }
};
