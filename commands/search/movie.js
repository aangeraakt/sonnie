const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');

const UA = 'Mozilla/5.0 (compatible; Sonnies-Discord-Bot/1.0)';

async function jsonFetch(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: { 'User-Agent': UA, Accept: 'application/json' }
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (err) {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

function isFilmLike(summary) {
  const text = `${summary.description || ''} ${summary.extract || ''} ${summary.title || ''}`;
  return /(film|movie|television|tv series|miniseries)/i.test(text);
}

function names(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((item) => (typeof item === 'string' ? item : item?.name)).filter(Boolean);
}

function extractJsonObject(html, key) {
  const needle = `"${key}":{`;
  const start = html.indexOf(needle);
  if (start < 0) return null;
  const brace = html.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    else if (html[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(brace, i + 1));
        } catch (err) {
          return null;
        }
      }
    }
  }
  return null;
}

function parseLdMovie(html) {
  const matches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const match of matches) {
    try {
      const data = JSON.parse(match[1]);
      const type = data['@type'];
      if (type === 'Movie' || type === 'TVSeries' || type === 'TVEpisode') return data;
    } catch (err) {}
  }
  return null;
}

function claimValues(entity, prop) {
  const claims = entity?.claims?.[prop] || [];
  return claims.map((claim) => claim?.mainsnak?.datavalue?.value).filter(Boolean);
}

async function wikiSummary(title) {
  const { ok, data } = await jsonFetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  if (!ok || !data || data.type === 'disambiguation') return null;
  return data;
}

async function findWikiMovie(query) {
  const direct = await wikiSummary(query);
  if (direct && isFilmLike(direct)) return direct;

  const filmTitle = await wikiSummary(`${query} (film)`);
  if (filmTitle && isFilmLike(filmTitle)) return filmTitle;

  const search = await jsonFetch(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=8&namespace=0&format=json`);
  const titles = Array.isArray(search.data) ? search.data[1] || [] : [];
  const preferred = titles.find((title) => /(film|movie|television|TV series)/i.test(title)) || titles[0];
  if (preferred) {
    const summary = await wikiSummary(preferred);
    if (summary) return summary;
  }
  return direct;
}

async function wikidataMedia(qid) {
  if (!qid) return { rtId: null, imdb: null };
  const { ok, data } = await jsonFetch(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(qid)}.json`);
  const entity = ok ? data?.entities?.[qid] : null;
  const rt = claimValues(entity, 'P1258').find((value) => typeof value === 'string') || null;
  const imdb = claimValues(entity, 'P345').find((value) => typeof value === 'string') || null;
  return { rtId: rt, imdb };
}

async function rottenTomatoes(rtId, fallbackName) {
  const path = rtId || `m/${String(fallbackName || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
  if (!path) return null;
  const url = `https://www.rottentomatoes.com/${path.replace(/^\/+/, '')}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    redirect: 'follow'
  });
  if (!res.ok) return null;
  const html = await res.text();
  const ld = parseLdMovie(html);
  const critics = extractJsonObject(html, 'criticsScore');
  const audience = extractJsonObject(html, 'audienceScore');
  if (!ld && !critics && !audience) return null;
  return {
    url: res.url || url,
    ld,
    critics,
    audience
  };
}

function scoreLine(score, extra) {
  if (score === null || score === undefined || score === '') return 'N/A';
  const certified = extra ? ` ${extra}` : '';
  return `**${score}%**${certified}`;
}

function clip(text, max = 400) {
  const value = String(text || '').trim();
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('movie')
    .setDescription('Look up a movie with Rotten Tomatoes scores')
    .addStringOption(opt =>
      opt.setName('query')
        .setDescription('Movie or show title')
        .setRequired(true)
    ),

  async execute(interaction) {
    const query = interaction.options.getString('query');
    if (!query) {
      return interaction.reply({ embeds: [errorEmbed('Missing Title', 'Provide a movie title to look up.')], flags: 64 });
    }

    await interaction.deferReply();

    try {
      const wiki = await findWikiMovie(query);
      if (!wiki) {
        return interaction.editReply({ embeds: [errorEmbed('Not Found', `No movie found matching \`${query}\`.`)] });
      }

      const ids = await wikidataMedia(wiki.wikibase_item);
      const rt = await rottenTomatoes(ids.rtId, wiki.title);
      const ld = rt?.ld || {};
      const baseTitle = ld.name || wiki.title;
      const year = (ld.dateCreated || ld.datePublished || '').slice(0, 4);
      const title = year && !/\(\d{4}\)\s*$/.test(baseTitle) ? `${baseTitle} (${year})` : baseTitle;
      const directors = names(ld.director);
      const actors = names(ld.actor).slice(0, 5);
      const genres = names(ld.genre).slice(0, 4);
      const tomato = rt?.critics?.score || ld.aggregateRating?.ratingValue;
      const popcorn = rt?.audience?.score;
      const certified = rt?.critics?.certified ? 'Certified Fresh' : '';
      const plot = clip(wiki.extract, 450) || clip(ld.description, 300) || 'No plot summary available.';
      const poster = typeof ld.image === 'string' ? ld.image : ld.image?.url || wiki.thumbnail?.source;
      const rtUrl = rt?.url || (ids.rtId ? `https://www.rottentomatoes.com/${ids.rtId}` : null);
      const imdbUrl = ids.imdb ? `https://www.imdb.com/title/${ids.imdb}/` : null;

      const fields = [
        { name: 'Tomatometer', value: scoreLine(tomato, certified), inline: true },
        { name: 'Audience', value: scoreLine(popcorn), inline: true },
        { name: 'Rated', value: `\`${ld.contentRating || 'N/A'}\``, inline: true }
      ];
      if (year) fields.push({ name: 'Released', value: `\`${year}\``, inline: true });
      if (directors.length) fields.push({ name: 'Director', value: directors.join(', '), inline: true });
      if (genres.length) fields.push({ name: 'Genre', value: genres.join(', '), inline: true });
      if (actors.length) fields.push({ name: 'Cast', value: actors.join(', '), inline: false });

      const embed = createEmbed({
        title,
        url: rtUrl || wiki.content_urls?.desktop?.page,
        description: wiki.description ? `*${wiki.description}*\n\n${plot}` : plot,
        color: 0xFA320A,
        thumbnail: poster,
        fields,
        footerText: 'Sonnies Search • Rotten Tomatoes'
      });

      const buttons = [];
      if (rtUrl) {
        buttons.push(new ButtonBuilder().setLabel('Rotten Tomatoes').setURL(rtUrl).setStyle(ButtonStyle.Link));
      }
      if (imdbUrl) {
        buttons.push(new ButtonBuilder().setLabel('IMDb').setURL(imdbUrl).setStyle(ButtonStyle.Link));
      }
      const wikiPage = wiki.content_urls?.desktop?.page;
      if (wikiPage && buttons.length < 5) {
        buttons.push(new ButtonBuilder().setLabel('Wikipedia').setURL(wikiPage).setStyle(ButtonStyle.Link));
      }

      return interaction.editReply({
        embeds: [embed],
        components: buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : []
      });
    } catch (err) {
      return interaction.editReply({ embeds: [errorEmbed('Lookup Failed', err.message || 'Could not look up that movie.')] });
    }
  }
};
