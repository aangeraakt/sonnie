const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const musicManager = require('../../utils/musicManager');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');

const PAGE_SIZE = 3800;

/** Strips the noise YouTube titles carry so lyrics lookups actually match. */
function cleanTitle(title) {
  return String(title)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(official|video|audio|lyrics?|hd|4k|mv|m\/v|visualizer|remaster(ed)?|explicit|feat\.?|ft\.?)\b/gi, ' ')
    .replace(/[|].*$/, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits "Artist - Title" when the title carries it. */
function splitArtistTitle(text) {
  const parts = text.split(/\s+-\s+|\s+–\s+/);
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  }
  return { artist: null, title: text };
}

async function fetchLyrics(artist, title) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    // lyrics.ovh is keyless and returns plain text.
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const data = await response.json();
    const lyrics = String(data?.lyrics || '').replace(/\r\n/g, '\n').trim();
    return lyrics || null;
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function paginate(text) {
  const pages = [];
  let current = '';
  for (const line of text.split('\n')) {
    if (current.length + line.length + 1 > PAGE_SIZE) {
      pages.push(current);
      current = '';
    }
    current += `${line}\n`;
  }
  if (current.trim()) pages.push(current);
  return pages;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lyrics')
    .setDescription('Find lyrics for the current track, or any song')
    .addStringOption(opt =>
      opt.setName('song')
        .setDescription('Song to look up, ideally "Artist - Title". Defaults to what is playing')
        .setRequired(false)
    ),

  async execute(interaction) {
    const { guild } = interaction;
    let query = interaction.options.getString('song');

    if (!query) {
      if (!musicManager.hasQueue(guild.id)) {
        return interaction.reply({
          embeds: [errorEmbed('Nothing Playing', 'Give me a `song` to look up, or start playing something first.')],
          flags: 64
        });
      }
      const queue = musicManager.getQueue(guild.id, interaction.client);
      if (!queue.currentTrack || queue.isRadioMode) {
        return interaction.reply({
          embeds: [errorEmbed('Nothing to Look Up', 'Live radio has no track title. Give me a `song` instead.')],
          flags: 64
        });
      }
      query = queue.currentTrack.title;
    }

    await interaction.deferReply();

    const cleaned = cleanTitle(query);
    const { artist, title } = splitArtistTitle(cleaned);

    // Try "Artist - Title" first, then fall back to treating it all as a title.
    let lyrics = artist ? await fetchLyrics(artist, title) : null;
    if (!lyrics && artist) lyrics = await fetchLyrics(title, artist);
    if (!lyrics) lyrics = await fetchLyrics(cleaned, cleaned);

    if (!lyrics) {
      return interaction.editReply({
        embeds: [errorEmbed('Lyrics Not Found',
          `I could not find lyrics for **${cleaned}**.\n\nThe lyrics service matches on exact artist and title, so try \`/music lyrics song:Artist - Title\`.`)]
      });
    }

    const pages = paginate(lyrics);
    let page = 0;

    const render = () => createEmbed({
      title: `Lyrics - ${cleaned}`.slice(0, 250),
      description: pages[page],
      footerText: pages.length > 1 ? `Page ${page + 1}/${pages.length} • lyrics.ovh` : 'Source: lyrics.ovh'
    });

    const buttons = () => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('lyr_prev').setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId('lyr_next').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page >= pages.length - 1)
    );

    await interaction.editReply({
      embeds: [render()],
      components: pages.length > 1 ? [buttons()] : []
    });

    if (pages.length <= 1) return;

    const message = await interaction.fetchReply().catch(() => null);
    if (!message) return;

    const collector = message.createMessageComponentCollector({ time: 300000 });
    collector.on('collect', async (component) => {
      if (component.user.id !== interaction.user.id) {
        return component.reply({ embeds: [errorEmbed('Not Your Lookup', 'Run `/music lyrics` yourself to page through it.')], flags: 64 }).catch(() => {});
      }
      page = component.customId === 'lyr_next'
        ? Math.min(page + 1, pages.length - 1)
        : Math.max(page - 1, 0);
      await component.update({ embeds: [render()], components: [buttons()] }).catch(() => {});
    });

    collector.on('end', () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  }
};
