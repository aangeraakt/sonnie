const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('npm')
    .setDescription('Search for packages on the NPM Registry')
    .addStringOption(opt =>
      opt.setName('package')
        .setDescription('The npm package name to search')
        .setRequired(true)
    ),

  async execute(interaction) {
    const pkgQuery = interaction.options.getString('package');
    if (!pkgQuery) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Query', 'Please provide a package name to search!')], flags: 64 });
    }

    await interaction.deferReply();

    try {
      const res = await fetch(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(pkgQuery)}&size=1`);
      if (!res.ok) {
        return interaction.editReply({ embeds: [errorEmbed('NPM Search Error', 'Could not reach NPM registry service.')] });
      }

      const data = await res.json();
      if (!data.objects || data.objects.length === 0) {
        return interaction.editReply({ embeds: [errorEmbed('Not Found', `No npm package found matching \`${pkgQuery}\`.`)] });
      }

      const pkg = data.objects[0].package;
      const flags = data.objects[0].flags || {};
      const score = data.objects[0].score || {};

      const embed = createEmbed({
        title: `📦 NPM Package: ${pkg.name}`,
        url: pkg.links.npm,
        description: pkg.description || 'No description provided.',
        color: 0xCB3837, // NPM Red
        fields: [
          { name: '🏷️ Version', value: `\`v${pkg.version}\``, inline: true },
          { name: '⚖️ License', value: `\`${pkg.license || 'N/A'}\``, inline: true },
          { name: '👤 Publisher', value: pkg.publisher?.username ? `[${pkg.publisher.username}](https://www.npmjs.com/~${pkg.publisher.username})` : '`Unknown`', inline: true },
          { name: '📥 Install Command', value: `\`\`\`bash\nnpm install ${pkg.name}\`\`\``, inline: false },
          {
            name: '🔗 Links',
            value: [
              pkg.links.npm ? `[NPM Page](${pkg.links.npm})` : null,
              pkg.links.homepage ? `[Homepage](${pkg.links.homepage})` : null,
              pkg.links.repository ? `[Repository](${pkg.links.repository})` : null
            ].filter(Boolean).join(' • ') || 'None',
            inline: false
          }
        ],
        footerText: `NPM Registry Search • Quality: ${Math.round((score.final || 0) * 100)}%`
      });

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      return interaction.editReply({ embeds: [errorEmbed('Search Failed', `Failed to search NPM: ${err.message}`)] });
    }
  }
};
