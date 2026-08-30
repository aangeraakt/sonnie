const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('github')
    .setDescription('Search GitHub for repositories or user profiles')
    .addStringOption(opt =>
      opt.setName('query')
        .setDescription('Repository name (e.g. expressjs/express) or search keywords')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('type')
        .setDescription('Search type')
        .setRequired(false)
        .addChoices(
          { name: 'Repository', value: 'repo' },
          { name: 'User Profile', value: 'user' }
        )
    ),

  async execute(interaction) {
    const query = interaction.options.getString('query');
    const type = interaction.options.getString('type') || 'repo';

    await interaction.deferReply();

    try {
      if (type === 'user') {
        const res = await fetch(`https://api.github.com/users/${encodeURIComponent(query)}`, {
          headers: { 'User-Agent': 'Sonnies-Discord-Bot' }
        });

        if (!res.ok) {
          return interaction.editReply({ embeds: [errorEmbed('User Not Found', `No GitHub user found matching \`${query}\`.`)] });
        }

        const user = await res.json();
        const embed = createEmbed({
          title: `🐙 GitHub User: ${user.name || user.login} (@${user.login})`,
          url: user.html_url,
          description: user.bio || 'No bio provided.',
          color: 0x24292E, // GitHub Black
          fields: [
            { name: '📦 Public Repos', value: `\`${user.public_repos || 0}\``, inline: true },
            { name: '👥 Followers', value: `\`${user.followers || 0}\``, inline: true },
            { name: '👣 Following', value: `\`${user.following || 0}\``, inline: true },
            { name: '🏢 Company', value: user.company ? `\`${user.company}\`` : '`None`', inline: true },
            { name: '📍 Location', value: user.location ? `\`${user.location}\`` : '`Unknown`', inline: true },
            { name: '🔗 Blog / Site', value: user.blog ? `[${user.blog}](${user.blog.startsWith('http') ? user.blog : `https://${user.blog}`})` : '`None`', inline: true }
          ],
          footerText: 'Sonnies Search • GitHub'
        });

        if (user.avatar_url) {
          embed.setThumbnail(user.avatar_url);
        }

        const btn = new ButtonBuilder()
          .setLabel('View GitHub Profile')
          .setURL(user.html_url)
          .setStyle(ButtonStyle.Link)
          .setEmoji('🐙');

        const row = new ActionRowBuilder().addComponents(btn);
        return interaction.editReply({ embeds: [embed], components: [row] });
      }

      // Repository search
      const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=1`, {
        headers: { 'User-Agent': 'Sonnies-Discord-Bot' }
      });

      if (!res.ok) {
        return interaction.editReply({ embeds: [errorEmbed('GitHub Error', 'Could not fetch data from GitHub API.')] });
      }

      const data = await res.json();
      if (!data.items || data.items.length === 0) {
        return interaction.editReply({ embeds: [errorEmbed('Not Found', `No GitHub repository found matching \`${query}\`.`)] });
      }

      const repo = data.items[0];
      const embed = createEmbed({
        title: `🐙 ${repo.full_name}`,
        url: repo.html_url,
        description: repo.description || 'No description provided.',
        color: 0x24292E,
        fields: [
          { name: '⭐ Stars', value: `\`${repo.stargazers_count.toLocaleString()}\``, inline: true },
          { name: '🍴 Forks', value: `\`${repo.forks_count.toLocaleString()}\``, inline: true },
          { name: '🐛 Issues', value: `\`${repo.open_issues_count.toLocaleString()}\``, inline: true },
          { name: '💻 Language', value: repo.language ? `\`${repo.language}\`` : '`Not specified`', inline: true },
          { name: '⚖️ License', value: repo.license ? `\`${repo.license.spdx_id || repo.license.name}\`` : '`None`', inline: true },
          { name: '👤 Owner', value: `[${repo.owner.login}](${repo.owner.html_url})`, inline: true },
          { name: '📥 Clone URL', value: `\`\`\`bash\ngit clone ${repo.clone_url}\`\`\``, inline: false }
        ],
        footerText: `GitHub Repository Search • Last updated: ${new Date(repo.updated_at).toLocaleDateString()}`
      });

      if (repo.owner && repo.owner.avatar_url) {
        embed.setThumbnail(repo.owner.avatar_url);
      }

      const btn = new ButtonBuilder()
        .setLabel('View on GitHub')
        .setURL(repo.html_url)
        .setStyle(ButtonStyle.Link)
        .setEmoji('🐙');

      const row = new ActionRowBuilder().addComponents(btn);
      return interaction.editReply({ embeds: [embed], components: [row] });
    } catch (err) {
      return interaction.editReply({ embeds: [errorEmbed('Search Failed', `Failed to query GitHub: ${err.message}`)] });
    }
  }
};
