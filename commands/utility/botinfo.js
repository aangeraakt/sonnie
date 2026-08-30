const { SlashCommandBuilder, version: djsVersion } = require('discord.js');
const { createEmbed } = require('../../utils/embedBuilder');

function formatUptime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

function collectBotStats(client) {
  const guilds = client.guilds?.cache?.size || 0;
  const users = client.guilds?.cache
    ? [...client.guilds.cache.values()].reduce((sum, guild) => sum + (guild.memberCount || 0), 0)
    : 0;
  const channels = client.channels?.cache?.size || 0;
  const commands = client.commands?.size || 0;
  const startedAt = client.startedAt || Date.now() - (process.uptime() * 1000);
  const memoryMb = process.memoryUsage().heapUsed / 1024 / 1024;
  const rawPing = client.ws?.ping;
  const ping = Number.isFinite(rawPing) && rawPing >= 0 ? Math.round(rawPing) : 0;

  return {
    guilds,
    users,
    channels,
    commands,
    uptime: formatUptime(Date.now() - startedAt),
    memory: `${memoryMb.toFixed(1)} MB`,
    ping: `${ping} ms`,
    node: process.version,
    djs: djsVersion,
    version: process.env.BOT_VERSION || '1.3.0'
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('botinfo')
    .setDescription('Show statistics about Sonnies'),

  async execute(interaction) {
    const stats = collectBotStats(interaction.client);
    const botUser = interaction.client.user;
    const botName = process.env.BOT_NAME || 'Sonnies';

    const embed = createEmbed({
      title: `${botName} Info`,
      thumbnail: botUser?.displayAvatarURL({ size: 256 }) || null,
      fields: [
        { name: 'Bot', value: botUser ? `${botUser.tag}\n\`${botUser.id}\`` : botName, inline: true },
        { name: 'Version', value: `\`${stats.version}\``, inline: true },
        { name: 'Ping', value: `\`${stats.ping}\``, inline: true },
        { name: 'Servers', value: `\`${stats.guilds}\``, inline: true },
        { name: 'Users', value: `\`${stats.users}\``, inline: true },
        { name: 'Channels', value: `\`${stats.channels}\``, inline: true },
        { name: 'Commands', value: `\`${stats.commands}\``, inline: true },
        { name: 'Uptime', value: `\`${stats.uptime}\``, inline: true },
        { name: 'Memory', value: `\`${stats.memory}\``, inline: true },
        { name: 'Node.js', value: `\`${stats.node}\``, inline: true },
        { name: 'discord.js', value: `\`${stats.djs}\``, inline: true }
      ],
      footerText: 'Sonnies Utility'
    });

    return interaction.reply({ embeds: [embed] });
  }
};
