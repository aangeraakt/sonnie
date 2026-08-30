const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');
const api = require('../../utils/gameApis');

function hostFrom(address) {
  return String(address || '').replace(/^minecraft:\/\//i, '').trim();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mc')
    .setDescription('Minecraft server status and player lookup')
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('Check a Java or Bedrock Minecraft server')
        .addStringOption(opt => opt.setName('host').setDescription('IP or domain, e.g. play.hypixel.net').setRequired(true))
        .addBooleanOption(opt => opt.setName('bedrock').setDescription('Look up a Bedrock server').setRequired(false))
    )
    .addSubcommand(sub =>
      sub
        .setName('player')
        .setDescription('Look up a Minecraft Java player')
        .addStringOption(opt => opt.setName('username').setDescription('Minecraft username').setRequired(true))
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply();

    if (subcommand === 'status') {
      const host = hostFrom(interaction.options.getString('host'));
      const bedrock = Boolean(interaction.options.getBoolean('bedrock'));
      if (!host) {
        return interaction.editReply({ embeds: [errorEmbed('Missing Host', 'Provide a server IP or domain.')] });
      }
      try {
        const status = await api.mcStatus(host, bedrock);
        const players = status.players || {};
        const version = status.version?.name_clean || status.version?.name || 'Unknown';
        const sample = Array.isArray(players.list) ? players.list.slice(0, 10).map((p) => p.name_clean || p.name_raw || p).filter(Boolean) : [];
        const fields = [
          { name: 'Status', value: status.online ? 'Online' : 'Offline', inline: true },
          { name: 'Players', value: status.online ? `${api.formatCount(players.online || 0)} / ${api.formatCount(players.max || 0)}` : '`—`', inline: true },
          { name: 'Version', value: `\`${version}\``, inline: true },
          { name: 'Address', value: `\`${status.host || host}${status.port ? `:${status.port}` : ''}\``, inline: true },
          { name: 'Edition', value: bedrock ? 'Bedrock' : 'Java', inline: true }
        ];
        if (status.ip_address) fields.push({ name: 'IP', value: `\`${status.ip_address}\``, inline: true });
        if (sample.length) fields.push({ name: 'Sample players', value: sample.map((name) => `\`${name}\``).join(', '), inline: false });

        return interaction.editReply({
          embeds: [createEmbed({
            title: status.host || host,
            description: api.cleanMotd(status.motd),
            color: status.online ? 0x57F287 : 0xED4245,
            thumbnail: `https://api.mcstatus.io/v2/icon/${encodeURIComponent(status.host || host).replace(/%3A/gi, ':')}`,
            fields,
            footerText: 'Sonnies Gaming • Minecraft'
          })]
        });
      } catch (err) {
        return interaction.editReply({ embeds: [errorEmbed('Status Failed', err.message || 'Could not look up that Minecraft server.')] });
      }
    }

    const username = interaction.options.getString('username');
    if (!username) {
      return interaction.editReply({ embeds: [errorEmbed('Missing Username', 'Provide a Minecraft username.')] });
    }
    try {
      const player = await api.mcPlayer(username);
      if (!player) {
        return interaction.editReply({ embeds: [errorEmbed('Player Not Found', `No Java player named \`${username}\`.`)] });
      }
      const uuid = player.id || player.raw_id;
      return interaction.editReply({
        embeds: [createEmbed({
          title: player.username,
          url: `https://namemc.com/profile/${uuid}`,
          description: `UUID: \`${uuid}\``,
          thumbnail: player.avatar || `https://crafthead.net/avatar/${player.raw_id || uuid}`,
          image: `https://crafthead.net/body/${player.raw_id || uuid}`,
          fields: [
            { name: 'NameMC', value: `[Open profile](https://namemc.com/profile/${uuid})`, inline: true }
          ],
          footerText: 'Sonnies Gaming • Minecraft'
        })]
      });
    } catch (err) {
      return interaction.editReply({ embeds: [errorEmbed('Lookup Failed', 'Could not look up that Minecraft player.')] });
    }
  }
};
