const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { levelProgress } = require('../../utils/levelingManager');

const PAGE_SIZE = 10;

function medal(position) {
  if (position === 1) return '🥇';
  if (position === 2) return '🥈';
  if (position === 3) return '🥉';
  return `\`#${String(position).padStart(2, ' ')}\``;
}

function renderPage(interaction, entries, page, totalPages) {
  const start = page * PAGE_SIZE;
  const slice = entries.slice(start, start + PAGE_SIZE);

  const lines = slice.map((entry, index) => {
    const position = start + index + 1;
    const progress = levelProgress(entry.xp);
    return `${medal(position)} <@${entry.user_id}>\n Level **${progress.level}** • ${entry.xp.toLocaleString()} XP`;
  });

  const self = entries.findIndex((entry) => entry.user_id === interaction.user.id);
  const footer = self === -1
    ? `Page ${page + 1}/${totalPages}`
    : `Page ${page + 1}/${totalPages} • You are #${self + 1}`;

  return createEmbed({
    title: `XP Leaderboard - ${interaction.guild.name}`,
    description: lines.join('\n\n') || 'No one has earned XP yet.',
    thumbnail: interaction.guild.iconURL({ dynamic: true }),
    footerText: footer
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('levels')
    .setDescription('Show the server XP leaderboard')
    .addIntegerOption(opt =>
      opt.setName('page')
        .setDescription('Page to jump to')
        .setMinValue(1)
        .setRequired(false)
    ),

  async execute(interaction) {
    const entries = db.getTopXP(interaction.guild.id, 500).filter((entry) => entry.xp > 0);
    if (!entries.length) {
      return interaction.reply({
        embeds: [errorEmbed('Empty Leaderboard', 'Nobody in this server has earned XP yet.')],
        flags: 64
      });
    }

    const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
    let page = Math.min(Math.max((interaction.options.getInteger('page') || 1) - 1, 0), totalPages - 1);

    const buttons = (current) => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('lb_prev').setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(current === 0),
      new ButtonBuilder().setCustomId('lb_next').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(current >= totalPages - 1)
    );

    await interaction.reply({
      embeds: [renderPage(interaction, entries, page, totalPages)],
      components: totalPages > 1 ? [buttons(page)] : []
    });

    if (totalPages <= 1) return;
    const message = await interaction.fetchReply().catch(() => null);
    if (!message) return;

    const collector = message.createMessageComponentCollector({ time: 120000 });
    collector.on('collect', async (component) => {
      if (component.user.id !== interaction.user.id) {
        return component.reply({
          embeds: [errorEmbed('Not Your Leaderboard', 'Run `/leveling levels` yourself to page through it.')],
          flags: 64
        }).catch(() => {});
      }
      page = component.customId === 'lb_next'
        ? Math.min(page + 1, totalPages - 1)
        : Math.max(page - 1, 0);

      await component.update({
        embeds: [renderPage(interaction, entries, page, totalPages)],
        components: [buttons(page)]
      }).catch(() => {});
    });

    collector.on('end', () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  }
};
