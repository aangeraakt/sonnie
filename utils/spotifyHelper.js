class SpotifyHelper {
  constructor(config = {}) {
    this.clientId = config.clientId || process.env.SPOTIFY_CLIENT_ID || '';
    this.clientSecret = config.clientSecret || process.env.SPOTIFY_CLIENT_SECRET || '';
    this.market = config.market || process.env.SPOTIFY_MARKET || 'US';
    this.accessToken = null;
    this.tokenExpiresAt = 0;
  }

  hasCredentials() {
    return Boolean(this.clientId && this.clientSecret);
  }

  async getAccessToken() {
    if (!this.hasCredentials()) return null;
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }

    try {
      const authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      const data = JSON.parse(await this._fetchText('https://accounts.spotify.com/api/token', {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }, 'POST', 'grant_type=client_credentials'));

      if (data.access_token) {
        this.accessToken = data.access_token;
        this.tokenExpiresAt = Date.now() + ((data.expires_in || 3600) * 1000);
        return this.accessToken;
      }
    } catch (err) {
      console.error('[SpotifyHelper] Failed to obtain client credentials token:', err.message);
    }
    return null;
  }

  parseUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const cleanUrl = url.trim();

    const match = cleanUrl.match(/(?:open\.spotify\.com|spotify\.link)\/(?:[a-zA-Z0-9_-]+\/)*(track|album|playlist)\/([a-zA-Z0-9]+)/i);
    if (match) {
      return { type: match[1].toLowerCase(), id: match[2] };
    }

    const uriMatch = cleanUrl.match(/^spotify:(track|album|playlist):([a-zA-Z0-9]+)$/i);
    if (uriMatch) {
      return { type: uriMatch[1].toLowerCase(), id: uriMatch[2] };
    }

    return null;
  }

  async resolve(url, requester) {
    const parsed = this.parseUrl(url);
    if (!parsed) return null;

    const token = await this.getAccessToken();

    if (token) {
      try {
        const apiResult = await this._resolveViaApi(parsed.type, parsed.id, token, requester);
        if (apiResult && apiResult.tracks && apiResult.tracks.length > 0) {
          return apiResult;
        }
      } catch (err) {
        console.warn('[SpotifyHelper] API resolution failed, falling back to embed scraper:', err.message);
      }
    }

    const embedResult = await this._resolveViaEmbed(parsed.type, parsed.id, requester);
    if (embedResult && embedResult.tracks && embedResult.tracks.length > 0) {
      return embedResult;
    }

    throw new Error('Could not retrieve track information from Spotify. Please check the URL.');
  }

  _mapApiTrack(t, requester, fallbackThumbnail, fallbackArtist) {
    if (!t || !t.name || t.error) return null;
    const artistName = (t.artists && t.artists.length > 0)
      ? t.artists.map((a) => a.name).filter(Boolean).join(', ')
      : (fallbackArtist || 'Spotify Artist');
    const trackName = t.name.trim();
    if (!trackName) return null;
    const searchTitle = `${artistName} - ${trackName} Official Audio`;

    return {
      title: `${trackName} - ${artistName}`,
      rawTitle: trackName,
      url: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
      duration: this._formatDurationMs(t.duration_ms),
      durationMs: Number(t.duration_ms) || 0,
      thumbnail: t.album?.images?.[0]?.url || fallbackThumbnail || 'https://cdn.discordapp.com/embed/avatars/0.png',
      author: artistName,
      requester,
      searchQuery: searchTitle,
      source: 'spotify'
    };
  }

  async _resolveViaApi(type, id, token, requester) {
    const headers = { Authorization: `Bearer ${token}` };

    if (type === 'track') {
      let data = null;
      try {
        data = await this._fetchJson(`https://api.spotify.com/v1/tracks/${id}?market=${encodeURIComponent(this.market)}`, headers);
      } catch (e) {
        data = await this._fetchJson(`https://api.spotify.com/v1/tracks/${id}`, headers).catch(() => null);
      }
      if (!data || data.error || !data.name) return null;
      const track = this._mapApiTrack(data, requester);
      return track ? { type: 'track', tracks: [track] } : null;
    }

    if (type === 'album') {
      let data = null;
      try {
        data = await this._fetchJson(`https://api.spotify.com/v1/albums/${id}?market=${encodeURIComponent(this.market)}`, headers);
      } catch (e) {
        data = await this._fetchJson(`https://api.spotify.com/v1/albums/${id}`, headers).catch(() => null);
      }
      if (!data || data.error) return null;

      const albumArtist = data.artists?.[0]?.name || 'Spotify Artist';
      const thumbnail = data.images?.[0]?.url || 'https://cdn.discordapp.com/embed/avatars/0.png';
      const tracks = [];
      for (const t of data.tracks?.items || []) {
        if (tracks.length >= 100) break;
        const mapped = this._mapApiTrack(t, requester, thumbnail, albumArtist);
        if (mapped) tracks.push(mapped);
      }

      let next = data.tracks?.next;
      while (next && tracks.length < 100) {
        const page = await this._fetchJson(next, headers).catch(() => null);
        if (!page) break;
        for (const t of page.items || []) {
          if (tracks.length >= 100) break;
          const mapped = this._mapApiTrack(t, requester, thumbnail, albumArtist);
          if (mapped) tracks.push(mapped);
        }
        next = tracks.length >= 100 ? null : page.next;
      }

      return tracks.length > 0 ? { type: 'album', tracks } : null;
    }

    if (type === 'playlist') {
      let data = null;
      try {
        data = await this._fetchJson(`https://api.spotify.com/v1/playlists/${id}?market=${encodeURIComponent(this.market)}`, headers);
      } catch (e) {
        data = await this._fetchJson(`https://api.spotify.com/v1/playlists/${id}`, headers).catch(() => null);
      }
      if (!data || data.error) return null;

      const thumbnail = data.images?.[0]?.url || 'https://cdn.discordapp.com/embed/avatars/0.png';
      const tracks = [];

      const pushItems = (items) => {
        for (const item of items || []) {
          if (tracks.length >= 100) return;
          const mapped = this._mapApiTrack(item?.track, requester, thumbnail);
          if (mapped) tracks.push(mapped);
        }
      };

      pushItems(data.tracks?.items);
      let next = data.tracks?.next;
      while (next && tracks.length < 100) {
        const page = await this._fetchJson(next, headers).catch(() => null);
        if (!page) break;
        pushItems(page.items);
        next = tracks.length >= 100 ? null : page.next;
      }

      return tracks.length > 0 ? { type: 'playlist', tracks } : null;
    }

    return null;
  }

  async _resolveViaEmbed(type, id, requester) {
    try {
      const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
      const html = await this._fetchText(embedUrl, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      });

      const jsonMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (!jsonMatch) {
        return await this._resolveViaOembed(type, id, requester);
      }

      const json = JSON.parse(jsonMatch[1]);
      const entity = json.props?.pageProps?.state?.data?.entity;
      if (!entity || !entity.name) {
        return await this._resolveViaOembed(type, id, requester);
      }

      if (type === 'track') {
        const artists = (entity.artists || []).map((a) => a.name).filter(Boolean).join(', ') || 'Spotify Artist';
        const trackTitle = entity.name || entity.title || 'Unknown Track';
        const searchTitle = `${artists} - ${trackTitle} Official Audio`;
        const thumbnail = entity.visualIdentity?.image?.[0]?.url || 'https://cdn.discordapp.com/embed/avatars/0.png';

        return {
          type: 'track',
          tracks: [{
            title: `${trackTitle} - ${artists}`,
            rawTitle: trackTitle,
            url: `https://open.spotify.com/track/${id}`,
            duration: this._formatDurationMs(entity.duration),
            durationMs: Number(entity.duration) || 0,
            thumbnail,
            author: artists,
            requester,
            searchQuery: searchTitle,
            source: 'spotify'
          }]
        };
      }

      if (type === 'playlist' || type === 'album') {
        const trackList = entity.trackList || [];
        const thumbnail = entity.visualIdentity?.image?.[0]?.url || 'https://cdn.discordapp.com/embed/avatars/0.png';
        const tracks = [];

        for (const t of trackList.slice(0, 100)) {
          const title = t.title || t.name;
          if (!title) continue;
          const artist = t.subtitle || (t.artists ? t.artists.map((a) => a.name).filter(Boolean).join(', ') : 'Spotify Artist');
          const searchTitle = `${artist} - ${title} Official Audio`;
          const trackId = t.uri ? t.uri.replace('spotify:track:', '') : id;

          tracks.push({
            title: `${title} - ${artist}`,
            rawTitle: title,
            url: `https://open.spotify.com/track/${trackId}`,
            duration: this._formatDurationMs(t.duration),
            durationMs: Number(t.duration) || 0,
            thumbnail,
            author: artist,
            requester,
            searchQuery: searchTitle,
            source: 'spotify'
          });
        }

        return tracks.length > 0 ? { type, tracks } : null;
      }
    } catch (err) {
      console.error('[SpotifyHelper] Embed scraper error:', err.message);
      return await this._resolveViaOembed(type, id, requester);
    }
    return null;
  }

  async _resolveViaOembed(type, id, requester) {
    try {
      const fullUrl = `https://open.spotify.com/${type}/${id}`;
      const data = JSON.parse(await this._fetchText(`https://open.spotify.com/oembed?url=${encodeURIComponent(fullUrl)}`));

      if (data && data.title && data.title !== 'undefined') {
        let cleanTitle = data.title.trim();
        cleanTitle = cleanTitle.replace(/\s+on Spotify$/i, '');
        const artist = data.author_name && data.author_name !== 'Spotify' ? data.author_name : '';
        const searchTitle = artist ? `${artist} - ${cleanTitle} Official Audio` : `${cleanTitle} Official Audio`;

        return {
          type: type || 'track',
          tracks: [{
            title: artist ? `${cleanTitle} - ${artist}` : cleanTitle,
            rawTitle: cleanTitle,
            url: fullUrl,
            duration: '0:00',
            durationMs: 0,
            thumbnail: data.thumbnail_url || 'https://cdn.discordapp.com/embed/avatars/0.png',
            author: artist || 'Spotify Artist',
            requester,
            searchQuery: searchTitle,
            source: 'spotify'
          }]
        };
      }
    } catch (e) {}
    return null;
  }

  _formatDurationMs(ms) {
    if (!ms || isNaN(ms)) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  async _fetchText(url, headers = {}, method = 'GET', body = null) {
    const options = {
      method,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', ...headers },
      signal: AbortSignal.timeout(10000)
    };
    if (body != null) options.body = body;
    const res = await fetch(url, options);
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Spotify HTTP ${res.status}`);
    }
    return text;
  }

  async _fetchJson(url, headers = {}) {
    return JSON.parse(await this._fetchText(url, headers));
  }
}

module.exports = SpotifyHelper;
