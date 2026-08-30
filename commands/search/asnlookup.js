const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');

function parseAsn(input) {
  if (!input || typeof input !== 'string') return null;
  const match = input.trim().toUpperCase().match(/^(?:AS)?(\d{1,10})$/);
  if (!match) return null;
  const asn = Number(match[1]);
  if (!Number.isInteger(asn) || asn < 0 || asn > 4294967295) return null;
  return asn;
}

async function lookupAsn(asn) {
  const resource = `AS${asn}`;
  const [overviewRes, prefixesRes] = await Promise.all([
    fetch(`https://stat.ripe.net/data/as-overview/data.json?resource=${encodeURIComponent(resource)}`, {
      headers: { 'User-Agent': 'Sonnies-Discord-Bot' }
    }),
    fetch(`https://stat.ripe.net/data/announced-prefixes/data.json?resource=${encodeURIComponent(resource)}`, {
      headers: { 'User-Agent': 'Sonnies-Discord-Bot' }
    })
  ]);

  if (!overviewRes.ok) {
    throw new Error(`RIPE returned ${overviewRes.status}`);
  }

  const overview = await overviewRes.json();
  let prefixes = null;
  if (prefixesRes.ok) {
    prefixes = await prefixesRes.json();
  }

  return { overview, prefixes };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('asnlookup')
    .setDescription('Look up Autonomous System Number (ASN) details')
    .addStringOption(opt =>
      opt.setName('asn')
        .setDescription('ASN number, e.g. 15169 or AS15169')
        .setRequired(true)
    ),

  async execute(interaction) {
    const asn = parseAsn(interaction.options.getString('asn'));
    if (asn === null) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid ASN', 'Provide an ASN like `15169` or `AS15169`.')],
        flags: 64
      });
    }

    await interaction.deferReply();

    try {
      const { overview, prefixes } = await lookupAsn(asn);
      const data = overview?.data;
      if (!data || overview?.status !== 'ok') {
        return interaction.editReply({ embeds: [errorEmbed('Lookup Failed', `No ASN data found for AS${asn}.`)] });
      }

      const prefixList = prefixes?.data?.prefixes || [];
      const v4 = prefixList.filter((item) => item.prefix && !item.prefix.includes(':')).length;
      const v6 = prefixList.filter((item) => item.prefix && item.prefix.includes(':')).length;
      const samples = prefixList.slice(0, 8).map((item) => `\`${item.prefix}\``).join('\n') || 'None listed';

      const embed = createEmbed({
        title: `ASN Lookup • AS${asn}`,
        description: data.holder || 'No holder name available.',
        fields: [
          { name: 'ASN', value: `\`AS${asn}\``, inline: true },
          { name: 'Type', value: `\`${data.type || 'Unknown'}\``, inline: true },
          { name: 'Announced', value: data.announced ? '`Yes`' : '`No`', inline: true },
          { name: 'IPv4 Prefixes', value: `\`${v4}\``, inline: true },
          { name: 'IPv6 Prefixes', value: `\`${v6}\``, inline: true },
          { name: 'Block', value: data.block?.desc ? `\`${data.block.desc}\`` : '`Unknown`', inline: true },
          { name: 'Sample Prefixes', value: samples, inline: false }
        ],
        footerText: 'Sonnies Search • ASN Lookup'
      });

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      return interaction.editReply({ embeds: [errorEmbed('Lookup Failed', `Could not look up that ASN: ${err.message}`)] });
    }
  }
};
