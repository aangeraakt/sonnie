const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');

function isValidQuery(query) {
  if (!query || typeof query !== 'string') return false;
  const value = query.trim();
  if (!value || value.length > 253) return false;
  if (/\s/.test(value)) return false;
  return true;
}

async function lookupIp(query) {
  const res = await fetch(`https://ipwho.is/${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': 'Sonnies-Discord-Bot' }
  });
  if (!res.ok) {
    throw new Error(`Lookup service returned ${res.status}`);
  }
  return res.json();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('iplookup')
    .setDescription('Look up geolocation and network details for an IP or hostname')
    .addStringOption(opt =>
      opt.setName('query')
        .setDescription('IPv4, IPv6, or hostname')
        .setRequired(true)
    ),

  async execute(interaction) {
    const query = interaction.options.getString('query');
    if (!isValidQuery(query)) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid Query', 'Provide a single IPv4, IPv6, or hostname.')],
        flags: 64
      });
    }

    await interaction.deferReply();

    try {
      const data = await lookupIp(query.trim());
      if (!data || data.success === false) {
        const message = data?.message || `No results found for \`${query}\`.`;
        return interaction.editReply({ embeds: [errorEmbed('Lookup Failed', message)] });
      }

      const connection = data.connection || {};
      const timezone = data.timezone || {};
      const location = [data.city, data.region, data.country].filter(Boolean).join(', ') || 'Unknown';
      const asn = connection.asn ? `AS${connection.asn}` : 'Unknown';

      const embed = createEmbed({
        title: `IP Lookup • ${data.ip || query}`,
        description: location,
        fields: [
          { name: 'IP', value: `\`${data.ip || query}\``, inline: true },
          { name: 'Type', value: `\`${data.type || 'Unknown'}\``, inline: true },
          { name: 'Country', value: `\`${data.country || 'Unknown'}\``, inline: true },
          { name: 'Region', value: `\`${data.region || 'Unknown'}\``, inline: true },
          { name: 'City', value: `\`${data.city || 'Unknown'}\``, inline: true },
          { name: 'Postal', value: `\`${data.postal || 'Unknown'}\``, inline: true },
          { name: 'ISP', value: `\`${connection.isp || 'Unknown'}\``, inline: true },
          { name: 'Org', value: `\`${connection.org || 'Unknown'}\``, inline: true },
          { name: 'ASN', value: `\`${asn}\``, inline: true },
          { name: 'Timezone', value: `\`${timezone.id || 'Unknown'}\``, inline: true },
          { name: 'Coordinates', value: `\`${data.latitude ?? '?'}, ${data.longitude ?? '?'}\``, inline: true }
        ],
        footerText: 'Sonnies Search • IP Lookup'
      });

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      return interaction.editReply({ embeds: [errorEmbed('Lookup Failed', `Could not look up that address: ${err.message}`)] });
    }
  }
};
