const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { StreamType } = require('@discordjs/voice');
const Logger = require('./logger');
const youtubeHelper = require('./youtubeHelper');

function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  }
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

class DeezerHelper {
  constructor() {
    this.apiUrl = 'https://api.deezer.com';
    this.urlRegex = /(?:https?:\/\/)?(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?(track|album|playlist|artist)\/(\d+)/i;
  }

  isDeezerUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return this.urlRegex.test(url) || url.includes('deezer.page.link') || url.includes('deezer.com');
  }

  parseUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const match = url.match(this.urlRegex);
    if (!match) return null;
    return {
      type: match[1].toLowerCase(),
      id: match[2]
    };
  }

  async resolveShortUrl(shortUrl) {
    try {
      const res = await fetch(shortUrl, { method: 'HEAD', redirect: 'follow' });
      return res.url || shortUrl;
    } catch (e) {
      return shortUrl;
    }
  }

  mapTrack(data, requester = null) {
    if (!data) return null;
    const durationSec = Number(data.duration) || 0;
    const authorName = data.artist?.name || (typeof data.artist === 'string' ? data.artist : 'Deezer Artist');
    const thumbnail =
      data.album?.cover_big ||
      data.album?.cover_medium ||
      data.album?.cover ||
      data.artist?.picture_big ||
      data.artist?.picture_medium ||
      'https://cdn.discordapp.com/embed/avatars/0.png';

    return {
      id: String(data.id),
      title: data.title || data.title_short || 'Unknown Deezer Track',
      url: data.link || `https://www.deezer.com/track/${data.id}`,
      previewUrl: data.preview || null,
      duration: formatClock(durationSec),
      durationSeconds: durationSec,
      thumbnail,
      author: authorName,
      requester: requester ? { id: requester.id, username: requester.username } : null
    };
  }

  async getTrack(id, requester = null) {
    const res = await fetch(`${this.apiUrl}/track/${id}`);
    if (!res.ok) throw new Error(`Deezer API returned status ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'Deezer track error');
    return this.mapTrack(data, requester);
  }

  async getAlbum(id, requester = null) {
    const res = await fetch(`${this.apiUrl}/album/${id}`);
    if (!res.ok) throw new Error(`Deezer API returned status ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'Deezer album error');

    const tracksData = data.tracks?.data || [];
    const tracks = tracksData.map(t => {
      if (!t.album) t.album = { cover_big: data.cover_big, cover_medium: data.cover_medium, cover: data.cover };
      if (!t.artist && data.artist) t.artist = data.artist;
      return this.mapTrack(t, requester);
    }).filter(Boolean);

    return {
      title: data.title || 'Deezer Album',
      author: data.artist?.name || 'Various Artists',
      thumbnail: data.cover_big || data.cover_medium || 'https://cdn.discordapp.com/embed/avatars/0.png',
      tracks
    };
  }

  async getPlaylist(id, requester = null) {
    const res = await fetch(`${this.apiUrl}/playlist/${id}`);
    if (!res.ok) throw new Error(`Deezer API returned status ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'Deezer playlist error');

    const tracksData = data.tracks?.data || [];
    const tracks = tracksData.map(t => this.mapTrack(t, requester)).filter(Boolean);

    return {
      title: data.title || 'Deezer Playlist',
      author: data.creator?.name || 'Deezer User',
      thumbnail: data.picture_big || data.picture_medium || 'https://cdn.discordapp.com/embed/avatars/0.png',
      tracks
    };
  }

  async getArtistTop(id, requester = null) {
    const res = await fetch(`${this.apiUrl}/artist/${id}/top?limit=50`);
    if (!res.ok) throw new Error(`Deezer API returned status ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'Deezer artist error');

    const tracksData = data.data || [];
    const tracks = tracksData.map(t => this.mapTrack(t, requester)).filter(Boolean);

    return {
      title: tracks[0]?.author ? `${tracks[0].author} - Top Tracks` : 'Artist Top Tracks',
      tracks
    };
  }

  async search(query, requester = null, limit = 25) {
    const res = await fetch(`${this.apiUrl}/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    if (!res.ok) throw new Error(`Deezer API returned status ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'Deezer search error');

    const tracksData = data.data || [];
    return tracksData.map(t => this.mapTrack(t, requester)).filter(Boolean);
  }

  async resolve(query, requester = null) {
    let effectiveQuery = String(query || '').trim();
    if (!effectiveQuery) {
      return { type: 'none', tracks: [] };
    }

    if (effectiveQuery.includes('deezer.page.link')) {
      effectiveQuery = await this.resolveShortUrl(effectiveQuery);
    }

    const parsed = this.parseUrl(effectiveQuery);
    if (parsed) {
      if (parsed.type === 'track') {
        const track = await this.getTrack(parsed.id, requester);
        return { type: 'Deezer Track', tracks: track ? [track] : [] };
      }
      if (parsed.type === 'album') {
        const album = await this.getAlbum(parsed.id, requester);
        return { type: 'Deezer Album', title: album.title, tracks: album.tracks };
      }
      if (parsed.type === 'playlist') {
        const playlist = await this.getPlaylist(parsed.id, requester);
        return { type: 'Deezer Playlist', title: playlist.title, tracks: playlist.tracks };
      }
      if (parsed.type === 'artist') {
        const artist = await this.getArtistTop(parsed.id, requester);
        return { type: 'Deezer Artist Top Tracks', title: artist.title, tracks: artist.tracks };
      }
    }

    // Default: Search Deezer by keyword
    const searchResults = await this.search(effectiveQuery, requester, 10);
    if (searchResults.length > 0) {
      return { type: 'Deezer Search', tracks: [searchResults[0]] };
    }

    return { type: 'none', tracks: [] };
  }

  /**
   * Resolves the full-length audio stream for the Deezer track.
   * Plays the ENTIRE full-length song, not just the 30-second preview!
   */
  async resolvePlayableAudio(track) {
    try {
      const playableUrl = await youtubeHelper.resolvePlayableUrl(track);
      const videoId = youtubeHelper.extractVideoId(playableUrl);
      const format = await youtubeHelper.getAudioFormat(videoId);
      if (format && format.url) {
        return {
          type: 'full',
          playableUrl,
          format,
          durationMs: track.durationSeconds ? track.durationSeconds * 1000 : 0
        };
      }
    } catch (err) {
      Logger.warn(`[Deezer] Audio bridge fallback for "${track?.title}":`, err.message);
    }

    // Fallback to direct preview URL if audio bridge is unreachable
    if (track?.previewUrl) {
      return {
        type: 'preview',
        streamUrl: track.previewUrl,
        durationMs: track.durationSeconds ? track.durationSeconds * 1000 : 30000
      };
    }

    throw new Error(`Could not load full audio for "${track?.title || 'Unknown'}"`);
  }

  /**
   * Spawns FFmpeg for continuous raw PCM playback into @discordjs/voice
   */
  async createPcmStream(audioInfo, track) {
    if (audioInfo.type === 'full' && audioInfo.playableUrl && audioInfo.format) {
      return youtubeHelper.createPcmStream(audioInfo.playableUrl, audioInfo.format);
    }

    const streamUrl = audioInfo.streamUrl || track?.previewUrl;
    if (!streamUrl) {
      throw new Error(`No audio stream URL available for "${track?.title}"`);
    }

    const process = spawn(ffmpegPath, [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      '-i', streamUrl,
      '-analyzeduration', '0',
      '-loglevel', 'error',
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2',
      'pipe:1'
    ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

    process.on('error', (err) => {
      Logger.error('[Deezer FFmpeg] Error:', err.message);
    });

    return {
      stream: process.stdout,
      process,
      type: StreamType.Raw,
      durationMs: audioInfo.durationMs || (track.durationSeconds ? track.durationSeconds * 1000 : 0)
    };
  }
}

module.exports = new DeezerHelper();
