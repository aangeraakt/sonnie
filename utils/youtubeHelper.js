const { Readable } = require('stream');
const { once } = require('events');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { StreamType } = require('@discordjs/voice');
const { mintPoTokenSafe } = require('./youtubePoToken');
const Logger = require('./logger');

const STREAM_CLIENTS = ['YTMUSIC', 'WEB', 'MWEB', 'WEB_EMBEDDED', 'IOS', 'ANDROID_VR'];
const CHUNK_SIZE = 512 * 1024;
const BASE_STREAM_HEADERS = {
  accept: '*/*',
  origin: 'https://www.youtube.com',
  referer: 'https://www.youtube.com/',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
};
const IOS_USER_AGENT = 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)';
let innertubePromise = null;

async function createInnertube() {
  const { Innertube, Platform } = await import('youtubei.js');
  Platform.shim.eval = (data) => new Function(data.output)();
  let yt = await Innertube.create();
  const visitorData = yt.session.context.client.visitorData;
  const sessionToken = await mintPoTokenSafe(yt, visitorData);
  if (visitorData && sessionToken) {
    yt = await Innertube.create({
      visitor_data: visitorData,
      po_token: sessionToken
    });
  }
  return yt;
}

async function getInnertube() {
  if (!innertubePromise) {
    innertubePromise = createInnertube().catch((err) => {
      innertubePromise = null;
      throw err;
    });
  }
  return innertubePromise;
}

function headersForUrl(url) {
  try {
    const client = new URL(url).searchParams.get('c');
    if (client === 'IOS' || client === 'iOS') {
      return { ...BASE_STREAM_HEADERS, 'user-agent': IOS_USER_AGENT };
    }
  } catch (e) {}
  return BASE_STREAM_HEADERS;
}

function withPoToken(url, poToken) {
  if (!url || !poToken) return url;
  const parsed = new URL(url);
  parsed.searchParams.set('pot', poToken);
  return parsed.toString();
}

function extractVideoId(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id ? id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 11) : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host.endsWith('.youtube.com')) {
      const fromQuery = url.searchParams.get('v');
      if (fromQuery) return fromQuery;
      const parts = url.pathname.split('/').filter(Boolean);
      if (['shorts', 'embed', 'live', 'v'].includes(parts[0]) && parts[1]) {
        return parts[1].replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 11);
      }
    }
  } catch (e) {}

  return null;
}

function extractPlaylistId(input) {
  if (!input || typeof input !== 'string') return null;
  try {
    const url = new URL(input.trim());
    const list = url.searchParams.get('list');
    if (list) return list;
  } catch (e) {}
  const match = input.match(/[?&]list=([\w-]+)/);
  return match ? match[1] : null;
}

function isQueueablePlaylistId(id) {
  if (!id || typeof id !== 'string') return false;
  if (id === 'RD' || id.startsWith('RD')) return false;
  return true;
}

function isYouTubeUrl(input) {
  return Boolean(extractVideoId(input) || extractPlaylistId(input));
}

function formatDurationSec(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function textOf(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.text || value.toString?.() || '';
}

function toCount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(textOf(value)).replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

async function getAudioFormat(videoId) {
  const yt = await getInnertube();
  const poToken = await mintPoTokenSafe(yt, videoId);
  let lastError = null;

  for (const client of STREAM_CLIENTS) {
    try {
      const options = {
        type: 'audio',
        quality: 'best',
        client
      };
      if (poToken) options.po_token = poToken;
      const format = await yt.getStreamingData(videoId, options);
      if (!format?.url) continue;
      format.url = withPoToken(format.url, poToken);
      return format;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Could not get a playable YouTube audio stream');
}

async function searchVideos(query, limit = 1) {
  const yt = await getInnertube();
  const results = await yt.search(query, { type: 'video' });
  const videos = (results.videos || []).filter((v) => v?.type === 'Video' && v.id);

  return videos.slice(0, limit).map((v) => ({
    id: v.id,
    title: textOf(v.title) || 'Unknown',
    url: `https://www.youtube.com/watch?v=${v.id}`,
    durationRaw: textOf(v.duration) || formatDurationSec(v.duration?.seconds),
    durationSec: Number(v.duration?.seconds) || 0,
    views: toCount(v.view_count ?? v.views),
    thumbnails: v.thumbnails || [],
    channel: {
      name: v.author?.name || 'YouTube',
      url: v.author?.url || `https://www.youtube.com/watch?v=${v.id}`
    }
  }));
}

async function searchMusicSongs(query, limit = 8) {
  const yt = await getInnertube();
  const results = await yt.music.search(query, { type: 'song' });
  const items = results.songs?.contents || [];
  const songs = [];

  for (const item of items) {
    if (songs.length >= limit) break;
    if (!item?.id) continue;
    if (item.item_type && item.item_type !== 'song' && item.item_type !== 'video') continue;
    songs.push({
      id: item.id,
      title: item.title || 'Unknown',
      url: `https://www.youtube.com/watch?v=${item.id}`,
      durationSec: Number(item.duration?.seconds) || 0
    });
  }

  return songs;
}

function expectedDurationSec(track) {
  if (Number(track?.durationMs) > 0) return Number(track.durationMs) / 1000;
  const raw = track?.duration;
  if (typeof raw === 'string' && raw.includes(':')) {
    const parts = raw.split(':').map((part) => Number(part));
    if (parts.every((n) => Number.isFinite(n))) {
      return parts.reduce((total, part) => total * 60 + part, 0);
    }
  }
  return 0;
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreCandidate(candidate, trackTitle, trackAuthor, expectedSec) {
  const normCandTitle = normalizeText(candidate.title);
  const normCandChannel = normalizeText(candidate.channel?.name || candidate.author?.name || candidate.author || '');
  const normTrackTitle = normalizeText(trackTitle);
  const normTrackAuthor = normalizeText(trackAuthor);

  let score = 0;

  // Title match
  const titleWords = normTrackTitle.split(' ').filter(w => w.length > 1);
  let titleMatches = 0;
  for (const w of titleWords) {
    if (normCandTitle.includes(w)) titleMatches++;
  }
  const titleMatchRatio = titleWords.length > 0 ? titleMatches / titleWords.length : 0;
  score += titleMatchRatio * 50;

  // Artist match
  const authorWords = normTrackAuthor.split(' ').filter(w => w.length > 1 && !['spotify', 'artist', 'unknown'].includes(w));
  let authorMatches = 0;
  for (const w of authorWords) {
    if (normCandTitle.includes(w) || normCandChannel.includes(w)) authorMatches++;
  }
  const authorMatchRatio = authorWords.length > 0 ? authorMatches / authorWords.length : 0;
  score += authorMatchRatio * 30;

  // Official Audio / Topic channel priority
  if (
    normCandChannel.includes('topic') ||
    normCandChannel.includes('vevo') ||
    normCandChannel.includes('official') ||
    normCandTitle.includes('official audio') ||
    normCandTitle.includes('official video') ||
    normCandTitle.includes('official music video')
  ) {
    score += 15;
  }

  // Penalize covers, reactions, reviews, loops unless requested
  const junkWords = ['cover', 'reaction', 'react', 'review', '1 hour', '1hour', '10 hours', 'slowed', 'reverb', 'bass boosted', 'parody', 'instrumental'];
  for (const j of junkWords) {
    if (normCandTitle.includes(j) && !normTrackTitle.includes(j)) {
      score -= 40;
    }
  }

  // Duration proximity
  if (expectedSec > 0 && candidate.durationSec > 0) {
    const diff = Math.abs(candidate.durationSec - expectedSec);
    if (diff <= 5) score += 20;
    else if (diff <= 15) score += 15;
    else if (diff <= 30) score += 10;
    else if (diff > 60) score -= 30;
  }

  return score;
}

function pickBestMatch(candidates, trackTitle, trackAuthor, expectedSec) {
  const usable = (candidates || []).filter((item) => item?.url);
  if (!usable.length) return null;

  const scored = usable.map((item) => ({
    item,
    score: scoreCandidate(item, trackTitle, trackAuthor, expectedSec)
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].item : usable[0];
}

async function getVideoDetails(urlOrId) {
  const videoId = extractVideoId(urlOrId);
  if (!videoId) return null;
  const yt = await getInnertube();
  const info = await yt.getBasicInfo(videoId);
  const details = info.basic_info || {};
  const thumbnails = details.thumbnail || [];
  return {
    id: details.id || videoId,
    title: details.title || 'Unknown',
    url: `https://www.youtube.com/watch?v=${details.id || videoId}`,
    durationRaw: formatDurationSec(details.duration),
    thumbnails,
    channel: {
      name: details.author || details.channel?.name || 'YouTube'
    }
  };
}

function playlistItemToTrack(item, requester) {
  if (!item) return null;

  if (item.type === 'PlaylistVideo' && item.id) {
    return {
      title: textOf(item.title) || 'Unknown',
      url: `https://www.youtube.com/watch?v=${item.id}`,
      duration: item.duration?.text || formatDurationSec(item.duration?.seconds),
      thumbnail: item.thumbnails?.[0]?.url || 'https://cdn.discordapp.com/embed/avatars/0.png',
      author: item.author?.name || 'YouTube',
      requester
    };
  }

  const lockupId = item.type === 'LockupView' ? item.content_id : (item.id || item.video_id);
  if (!lockupId || !/^[\w-]{11}$/.test(lockupId)) return null;
  if (item.type === 'LockupView' && item.content_type && item.content_type !== 'VIDEO') return null;

  const authorText = item.author?.name
    || item.metadata?.metadata?.metadata_rows?.[0]?.metadata_parts?.[0]?.text;

  return {
    title: textOf(item.metadata?.title) || textOf(item.title) || 'Unknown',
    url: `https://www.youtube.com/watch?v=${lockupId}`,
    duration: textOf(item.duration) || item.duration?.text || '0:00',
    thumbnail: item.content_image?.image?.[0]?.url || item.thumbnails?.[0]?.url || 'https://cdn.discordapp.com/embed/avatars/0.png',
    author: textOf(authorText) || 'YouTube',
    requester
  };
}

async function getPlaylistTracks(url, requester, limit = 100) {
  const playlistId = extractPlaylistId(url);
  if (!playlistId) return [];
  const yt = await getInnertube();
  let playlist = await yt.getPlaylist(playlistId);
  const tracks = [];

  const pushItems = (items) => {
    for (const item of items || []) {
      if (tracks.length >= limit) return;
      const track = playlistItemToTrack(item, requester);
      if (track) tracks.push(track);
    }
  };

  pushItems(playlist.items);
  while (playlist.has_continuation && tracks.length < limit) {
    playlist = await playlist.getContinuation();
    pushItems(playlist.items);
  }

  return tracks;
}

async function resolvePlayableUrl(track) {
  if (extractVideoId(track?.url)) return track.url;

  const trackTitle = track?.rawTitle || track?.title || '';
  const trackAuthor = track?.author || '';
  const expectedSec = expectedDurationSec(track);

  // Build high-precision search queries
  const queriesToTry = [];
  if (trackAuthor && trackTitle && !trackAuthor.includes('Spotify') && !trackAuthor.includes('Unknown')) {
    queriesToTry.push(`${trackAuthor} - ${trackTitle} Official Audio`);
    queriesToTry.push(`${trackAuthor} - ${trackTitle}`);
  }
  if (track?.searchQuery && !queriesToTry.includes(track.searchQuery)) {
    queriesToTry.push(track.searchQuery);
  }
  if (track?.title && !queriesToTry.includes(track.title)) {
    queriesToTry.push(track.title);
  }

  // 1. Try YouTube Music first with targeted queries
  for (const q of queriesToTry) {
    try {
      const songs = await searchMusicSongs(q, 8);
      if (songs.length > 0) {
        const bestSong = pickBestMatch(songs, trackTitle, trackAuthor, expectedSec);
        if (bestSong?.url) return bestSong.url;
      }
    } catch (err) {
      Logger.warn('[YouTube] Music search failed:', err.message);
    }
  }

  // 2. Try YouTube Video Search with targeted queries
  for (const q of queriesToTry) {
    try {
      const ytResults = await searchVideos(q, 8);
      if (ytResults.length > 0) {
        const bestVideo = pickBestMatch(ytResults, trackTitle, trackAuthor, expectedSec);
        if (bestVideo?.url) return bestVideo.url;
      }
    } catch (err) {
      Logger.warn('[YouTube] Video search failed:', err.message);
    }
  }

  throw new Error(`Track stream could not be located on YouTube for: ${trackTitle}`);
}

async function fetchRange(url, start, end, headers) {
  const rangedUrl = `${url}${url.includes('?') ? '&' : '?'}range=${start}-${end}`;
  const res = await fetch(rangedUrl, {
    headers,
    signal: AbortSignal.timeout(15000)
  });
  if (res.status === 416) return Buffer.alloc(0);
  if (!res.ok && res.status !== 206) {
    throw new Error(`YouTube stream HTTP ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function createByteQueue() {
  const chunks = [];
  let ended = false;
  let closed = false;
  let failed = null;
  let received = 0;
  let readyResolve;
  const ready = new Promise((resolve, reject) => {
    readyResolve = { resolve, reject };
  });

  const readable = new Readable({
    read() {
      pump();
    }
  });

  function pump() {
    if (failed) {
      if (!readable.destroyed) readable.destroy(failed);
      return;
    }
    while (chunks.length) {
      if (!readable.push(chunks.shift())) return;
    }
    if (ended && !closed) {
      closed = true;
      readable.push(null);
    }
  }

  return {
    readable,
    ready,
    received() {
      return received;
    },
    push(buf) {
      if (!buf?.length || ended || failed) return;
      received += buf.length;
      chunks.push(buf);
      if (readyResolve) {
        readyResolve.resolve();
        readyResolve = null;
      }
      pump();
    },
    end() {
      ended = true;
      if (readyResolve) {
        if (received > 0) readyResolve.resolve();
        else readyResolve.reject(new Error('YouTube audio download empty'));
        readyResolve = null;
      }
      pump();
    },
    fail(err) {
      failed = err;
      if (readyResolve) {
        readyResolve.reject(err);
        readyResolve = null;
      }
      if (!readable.destroyed) readable.destroy(err);
    }
  };
}

async function fillQueue(queue, format) {
  const headers = headersForUrl(format.url);
  const total = Number(format.content_length) || 0;
  let position = 0;
  let retries = 0;

  while (!queue.readable.destroyed) {
    if (total && position >= total) break;
    const end = total
      ? Math.min(position + CHUNK_SIZE - 1, total - 1)
      : position + CHUNK_SIZE - 1;

    let buf;
    try {
      buf = await fetchRange(format.url, position, end, headers);
      retries = 0;
    } catch (err) {
      if (position > 0 && retries < 3) {
        retries += 1;
        await new Promise((resolve) => setTimeout(resolve, 250 * retries));
        continue;
      }
      if (position === 0) throw err;
      break;
    }

    if (!buf.length) break;
    queue.push(buf);
    position += buf.length;
    if (!total && buf.length < CHUNK_SIZE) break;
  }

  if (position === 0) {
    throw new Error('YouTube audio download empty');
  }
  queue.end();
}

async function createPcmStream(urlOrId, preparedFormat, options = {}) {
  const videoId = extractVideoId(urlOrId);
  if (!videoId) {
    throw new Error('Invalid YouTube URL');
  }

  const format = preparedFormat || await getAudioFormat(videoId);
  const queue = createByteQueue();
  fillQueue(queue, format).catch((err) => queue.fail(err));

  await Promise.race([
    queue.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('YouTube audio timed out')), 15000))
  ]);

  // The base -6dB pad keeps headroom; any effect chain is appended to it.
  const filterChain = options.audioFilter
    ? `volume=-6dB,${options.audioFilter}`
    : 'volume=-6dB';

  const args = ['-fflags', '+genpts', '-i', 'pipe:0'];

  // Output-side seeking: the input is a pipe starting at byte 0, so ffmpeg
  // has to decode and discard up to the seek point rather than skipping.
  const seekSeconds = Math.max(0, Math.floor(Number(options.seekSeconds) || 0));
  if (seekSeconds > 0) args.push('-ss', String(seekSeconds));

  args.push(
    '-analyzeduration', '2000000',
    '-probesize', '512000',
    '-loglevel', '0',
    '-af', filterChain,
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1'
  );

  const ffmpeg = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });

  queue.readable.pipe(ffmpeg.stdin);
  ffmpeg.stdin.on('error', () => {});
  ffmpeg.on('error', () => {});
  ffmpeg.on('close', () => {
    if (!queue.readable.destroyed) queue.readable.destroy();
  });

  if (!ffmpeg.stdout.readableLength) {
    await Promise.race([
      once(ffmpeg.stdout, 'readable'),
      new Promise((_, reject) => {
        ffmpeg.once('exit', (code) => reject(new Error(`ffmpeg exited with code ${code}`)));
        setTimeout(() => reject(new Error('YouTube audio timed out')), 15_000);
      })
    ]);
  }

  return {
    stream: ffmpeg.stdout,
    process: ffmpeg,
    type: StreamType.Raw,
    durationMs: Number(format.approx_duration_ms) || 0,
    downloadedBytes: Number(format.content_length) || queue.received()
  };
}

module.exports = {
  extractVideoId,
  extractPlaylistId,
  isQueueablePlaylistId,
  isYouTubeUrl,
  searchVideos,
  getVideoDetails,
  getPlaylistTracks,
  resolvePlayableUrl,
  getAudioFormat,
  createPcmStream,
  warmup: getInnertube
};
