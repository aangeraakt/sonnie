const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType,
  NoSubscriberBehavior
} = require('@discordjs/voice');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const db = require('../database/db');
const Logger = require('./logger');
const SpotifyHelper = require('./spotifyHelper');
const youtubeHelper = require('./youtubeHelper');
const deezerHelper = require('./deezerHelper');
const { createEmbed, errorEmbed, withGuildColor } = require('./embedBuilder');
const { panelPayload } = require('./musicPanel');

const spotifyHelper = new SpotifyHelper();

// Active guild music instances
const guildQueues = new Map();
const restoredGuilds = new Set();

/**
 * ffmpeg audio filter chains. Applied at stream creation, so switching one
 * restarts the current track from its current position.
 */
const AUDIO_FILTERS = {
  none: { label: 'None', chain: null },
  bassboost: { label: 'Bass Boost', chain: 'bass=g=12,dynaudnorm=f=200' },
  nightcore: { label: 'Nightcore', chain: 'aresample=48000,asetrate=48000*1.25,atempo=1.06' },
  vaporwave: { label: 'Vaporwave', chain: 'aresample=48000,asetrate=48000*0.8,atempo=1.04' },
  treble: { label: 'Treble Boost', chain: 'treble=g=8' },
  '8d': { label: '8D Audio', chain: 'apulsator=hz=0.09' },
  karaoke: { label: 'Karaoke', chain: 'stereotools=mlev=0.03' },
  soft: { label: 'Soft', chain: 'lowpass=f=1500' },
  earrape: { label: 'Loud', chain: 'acrusher=level_in=4:level_out=5:bits=8:mode=log' }
};

function serializeTrack(track) {
  if (!track || track.isRadio || !track.url) return null;
  return {
    title: track.title || 'Unknown',
    rawTitle: track.rawTitle || null,
    url: track.url,
    duration: track.duration || '0:00',
    durationMs: track.durationMs || 0,
    thumbnail: track.thumbnail || null,
    author: track.author || null,
    searchQuery: track.searchQuery || null,
    requesterId: track.requester?.id || null
  };
}

function hydrateTrack(data) {
  if (!data || !data.url) return null;
  return {
    title: data.title || 'Unknown',
    rawTitle: data.rawTitle || null,
    url: data.url,
    duration: data.duration || '0:00',
    durationMs: data.durationMs || 0,
    thumbnail: data.thumbnail || 'https://cdn.discordapp.com/embed/avatars/0.png',
    author: data.author || 'Unknown',
    searchQuery: data.searchQuery || null,
    requester: { id: data.requesterId || '0' }
  };
}

class GuildMusicQueue {
  constructor(guildId, client) {
    this.guildId = guildId;
    this.client = client;
    this.connection = null;
    this.player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play,
        maxMissedFrames: 250
      }
    });
    this.queue = [];
    this.currentTrack = null;
    this.currentResource = null;
    this.volume = 0.35;
    this.loop = 'off';
    this.isRadioMode = false;
    this.radioStreamProcess = null;
    this.youtubeStreamProcess = null;
    this.textChannel = null;
    this.disconnectTimeout = null;
    this.startingPlayback = false;
    this.ignoreIdle = false;
    this.endingTrack = false;
    this.enqueueLock = Promise.resolve();
    this.voiceChannelId = null;
    this.suppressNowPlaying = false;
    this.panelMessage = null;
    this.progressTimer = null;
    this.persistTimer = null;
    this.prefetchToken = 0;
    this.nextPrefetch = null;
    this.currentDurationMs = 0;
    this.filter = 'none';
    this.seekOffsetMs = 0;
    this.autoplay = false;
    this.autoplayHistory = [];
    this.lastFinishedTrack = null;

    this.player.on(AudioPlayerStatus.Idle, () => {
      this.handleTrackEnd();
    });

    this.player.on('error', error => {
      Logger.error(`[Music] Audio Player error in guild ${this.guildId}:`, error.message);
      this.handleTrackEnd();
    });
  }

  applyVolume(resource) {
    if (resource?.volume) {
      resource.volume.setVolumeLogarithmic(this.volume);
    }
  }

  killYoutubeProcess() {
    if (this.youtubeStreamProcess) {
      try { this.youtubeStreamProcess.kill('SIGKILL'); } catch (e) {}
      this.youtubeStreamProcess = null;
    }
  }

  clearDisconnectTimeout() {
    if (this.disconnectTimeout) {
      clearTimeout(this.disconnectTimeout);
      this.disconnectTimeout = null;
    }
  }

  scheduleDisconnectTimeout() {
    this.clearDisconnectTimeout();
    this.disconnectTimeout = setTimeout(() => {
      if (!this.currentTrack && !this.isRadioMode && this.queue.length === 0) {
        this.destroy();
      }
    }, 60000); // 1 minute idle disconnect
  }

  async connect(voiceChannel) {
    this.clearDisconnectTimeout();
    this.voiceChannelId = voiceChannel.id;
    const guild = voiceChannel.guild;
    const existingChannelId = this.connection?.joinConfig?.channelId;
    const status = this.connection?.state?.status;
    if (
      this.connection &&
      existingChannelId === voiceChannel.id &&
      status &&
      status !== VoiceConnectionStatus.Destroyed &&
      status !== VoiceConnectionStatus.Disconnected
    ) {
      this.connection.subscribe(this.player);
      return this.connection;
    }

    this.ignoreIdle = true;
    try {
      this.connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: false
      });

      this.connection.on('error', (error) => {
        Logger.error(`[Music] Voice connection error in guild ${this.guildId}:`, error.message);
      });

      this.connection.subscribe(this.player);
      await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);
      return this.connection;
    } catch (error) {
      Logger.error(`[Music] Failed to connect to voice channel ${voiceChannel.id}:`, error);
      this.destroy();
      throw error;
    } finally {
      this.ignoreIdle = false;
    }
  }

  async playNext() {
    this.clearDisconnectTimeout();
    if (this.currentTrack && !this.currentTrack.isRadio) {
      this.lastFinishedTrack = this.currentTrack;
    }

    // Check if loop track
    if (this.loop === 'track' && this.currentTrack) {
      return this.startPlayback(this.currentTrack);
    }

    // Check if loop queue
    if (this.loop === 'queue' && this.currentTrack) {
      this.queue.push(this.currentTrack);
    }

    if (this.queue.length === 0 && this.autoplay && this.lastFinishedTrack && !this.isRadioMode) {
      const related = await this.findRelatedTrack(this.lastFinishedTrack).catch(() => null);
      if (related) {
        this.queue.push(related);
        if (this.textChannel) {
          withGuildColor(this.guildId, () => this.textChannel.send({
            embeds: [createEmbed({
              title: 'Autoplay',
              description: `Queue ran dry, so I picked **${related.title}** to keep things going.
Turn this off with \`/music autoplay enabled:false\`.`
            })]
          })).catch(() => {});
        }
      }
    }

    if (this.queue.length === 0) {
      this.currentTrack = null;
      this.currentResource = null;
      this.killYoutubeProcess();
      this.currentDurationMs = 0;
      this.seekOffsetMs = 0;
      this.flushPersist();
      this.updatePanel().catch(() => {});

      const radioCfg = db.getRadioConfig(this.guildId);
      if (radioCfg && radioCfg.active && radioCfg.channel_id && radioCfg.stream_url) {
        Logger.info(`[Music] Queue empty in guild ${this.guildId}. Resuming 24/7 radio station: ${radioCfg.station_name}`);
        return this.startRadio(radioCfg.channel_id, radioCfg.stream_url, radioCfg.station_name);
      }

      this.scheduleDisconnectTimeout();
      return;
    }

    const nextTrack = this.queue.shift();
    return this.startPlayback(nextTrack);
  }

  hasActiveMusic() {
    if (this.isRadioMode) return false;
    if (this.startingPlayback && this.currentTrack) return true;
    if (this.currentTrack) return true;
    const status = this.player?.state?.status;
    return status === AudioPlayerStatus.Playing || status === AudioPlayerStatus.Paused || status === AudioPlayerStatus.Buffering;
  }

  enqueueTracks(tracks) {
    const run = () => this._enqueueTracks(tracks);
    const pending = this.enqueueLock.then(run, run);
    this.enqueueLock = pending.then(() => undefined, () => undefined);
    return pending;
  }

  async _enqueueTracks(tracks) {
    if (!Array.isArray(tracks) || tracks.length === 0) {
      return { started: false, added: 0, position: this.queue.length };
    }

    const shouldStart = this.isRadioMode || !this.hasActiveMusic();
    if (shouldStart) {
      const [first, ...rest] = tracks;
      this.queue.push(...rest);
      this.currentTrack = first;
      this.startingPlayback = true;
      this.persistQueue();
      this.startPlayback(first).catch(() => {});
      return { started: true, added: tracks.length, position: 0 };
    }

    this.queue.push(...tracks);
    this.persistQueue();
    this.updatePanel().catch(() => {});
    return {
      started: false,
      added: tracks.length,
      position: this.queue.length - tracks.length + 1
    };
  }

  persistQueue() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.writePersistedQueue();
    }, 400);
  }

  flushPersist() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.writePersistedQueue();
  }

  writePersistedQueue() {
    if (this.isRadioMode) {
      db.clearMusicQueue(this.guildId);
      return;
    }

    const current = serializeTrack(this.currentTrack);
    const queue = this.queue.map(serializeTrack).filter(Boolean);
    const voiceChannelId = this.voiceChannelId || this.connection?.joinConfig?.channelId || null;

    if (!current && queue.length === 0) {
      db.clearMusicQueue(this.guildId);
      return;
    }

    db.saveMusicQueue(this.guildId, {
      voice_channel_id: voiceChannelId,
      text_channel_id: this.textChannel?.id || null,
      volume: this.volume,
      loop: this.loop,
      filter: this.filter,
      autoplay: this.autoplay,
      current,
      queue
    });
  }

  async startPlayback(track, seekSeconds = 0) {
    this.startingPlayback = true;
    this.isRadioMode = false;
    if (this.radioStreamProcess) {
      try { this.radioStreamProcess.kill('SIGKILL'); } catch (e) {}
      this.radioStreamProcess = null;
    }

    this.currentTrack = track;
    this.persistQueue();
    this.killYoutubeProcess();

    try {
      let youtubeUrl;
      let format;
      if (seekSeconds === 0 && this.nextPrefetch?.trackUrl === track.url) {
        youtubeUrl = this.nextPrefetch.youtubeUrl;
        format = this.nextPrefetch.format;
        this.nextPrefetch = null;
      } else {
        this.invalidatePrefetch();
        youtubeUrl = await youtubeHelper.resolvePlayableUrl(track);
      }

      const streamData = await youtubeHelper.createPcmStream(youtubeUrl, format, {
        seekSeconds,
        audioFilter: AUDIO_FILTERS[this.filter]?.chain || null
      });
      this.youtubeStreamProcess = streamData.process;
      this.currentDurationMs = streamData.durationMs || 0;
      this.seekOffsetMs = seekSeconds * 1000;

      const resource = createAudioResource(streamData.stream, {
        inputType: streamData.type,
        inlineVolume: true
      });

      this.applyVolume(resource);
      this.currentResource = resource;
      this.player.play(resource);
      await entersState(this.player, AudioPlayerStatus.Playing, 15_000).catch(() => {});
      this.startingPlayback = false;

      if (this.player.state.status === AudioPlayerStatus.Idle) {
        this.handleTrackEnd();
        return;
      }

      this.prefetchNext().catch(() => {});
      await this.updatePanel();
    } catch (err) {
      this.startingPlayback = false;
      this.killYoutubeProcess();
      Logger.error(`[Music] Error starting playback for "${track.title}":`, err);
      if (this.textChannel) {
        withGuildColor(this.guildId, () => this.textChannel.send({
          embeds: [errorEmbed('Playback Error', `Could not play **${track.title}**: ${err.message}`)]
        })).catch(() => {});
      }
      this.playNext();
    }
  }

  async startRadio(voiceChannelId, streamUrl, stationName = '24/7 Radio Station') {
    this.clearDisconnectTimeout();
    this.startingPlayback = true;
    this.killYoutubeProcess();
    this.isRadioMode = true;
    this.queue = [];
    this.persistQueue();
    this.currentTrack = {
      title: stationName,
      url: streamUrl,
      duration: 'LIVE 24/7',
      thumbnail: 'https://cdn.discordapp.com/embed/avatars/1.png',
      requester: { id: this.client.user.id, username: '24/7 Radio' },
      isRadio: true
    };

    // Kill old radio stream process if any
    if (this.radioStreamProcess) {
      try { this.radioStreamProcess.kill('SIGKILL'); } catch (e) {}
      this.radioStreamProcess = null;
    }

    try {
      const guild = this.client.guilds.cache.get(this.guildId);
      if (!guild) {
        this.startingPlayback = false;
        return;
      }

      const voiceChannel = guild.channels.cache.get(voiceChannelId);
      if (!voiceChannel) {
        this.startingPlayback = false;
        return;
      }

      // Join/Switch to radio channel
      await this.connect(voiceChannel);

      // Spawn ffmpeg with streaming reconnection flags
      this.radioStreamProcess = spawn(ffmpegPath, [
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        '-i', streamUrl,
        '-analyzeduration', '0',
        '-loglevel', 'error',
        '-af', 'volume=-6dB',
        '-f', 's16le',
        '-ar', '48000',
        '-ac', '2',
        'pipe:1'
      ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

      this.radioStreamProcess.on('error', (err) => {
        Logger.error(`[Radio] FFmpeg process error in guild ${this.guildId}:`, err);
      });
      this.radioStreamProcess.stderr.on('data', (chunk) => {
        const message = chunk.toString().trim();
        if (message) Logger.warn(`[Radio] FFmpeg: ${message}`);
      });

      if (!this.radioStreamProcess.stdout.readableLength) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Radio stream timed out')), 20_000);
          this.radioStreamProcess.stdout.once('readable', () => {
            clearTimeout(timeout);
            resolve();
          });
          this.radioStreamProcess.once('exit', (code) => {
            clearTimeout(timeout);
            reject(new Error(`Radio ffmpeg exited with code ${code}`));
          });
        });
      }

      const resource = createAudioResource(this.radioStreamProcess.stdout, {
        inputType: StreamType.Raw,
        inlineVolume: true
      });

      this.applyVolume(resource);
      this.currentResource = resource;
      this.player.play(resource);
      await entersState(this.player, AudioPlayerStatus.Playing, 15_000).catch(() => {});
      this.startingPlayback = false;

      Logger.success(`[Radio] 24/7 Radio Station "${stationName}" active in #${voiceChannel.name} (${guild.name})`);
      await this.updatePanel();
    } catch (err) {
      this.startingPlayback = false;
      Logger.error(`[Radio] Failed to start radio stream in guild ${this.guildId}:`, err);
    }
  }

  handleTrackEnd() {
    if (this.ignoreIdle || this.startingPlayback || this.endingTrack) return;
    this.endingTrack = true;

    Promise.resolve()
      .then(() => {
        if (this.isRadioMode) {
          const radioCfg = db.getRadioConfig(this.guildId);
          if (radioCfg && radioCfg.active && radioCfg.channel_id && radioCfg.stream_url) {
            setTimeout(() => {
              if (this.isRadioMode && this.queue.length === 0) {
                this.startRadio(radioCfg.channel_id, radioCfg.stream_url, radioCfg.station_name);
              }
            }, 3000);
          }
          return;
        }
        return this.playNext();
      })
      .catch((err) => {
        Logger.error(`[Music] Failed to continue playback in guild ${this.guildId}:`, err);
      })
      .finally(() => {
        this.endingTrack = false;
      });
  }

  /**
   * Picks a follow-up track for autoplay by searching on the finished track's
   * channel and title, skipping anything played recently in this session.
   */
  async findRelatedTrack(seed) {
    const seen = new Set(this.autoplayHistory);
    seen.add(seed.url);

    const queries = [
      seed.author || seed.channel?.name,
      String(seed.title || '').replace(/\([^)]*\)/g, ' ').split(/\s+-\s+/)[0]
    ].filter(Boolean);

    for (const query of queries) {
      const results = await youtubeHelper.searchVideos(`${query} mix`, 10).catch(() => []);
      const pick = results.find((item) => item.url && !seen.has(item.url));
      if (!pick) continue;

      this.autoplayHistory.push(pick.url);
      if (this.autoplayHistory.length > 40) this.autoplayHistory.shift();

      return {
        title: pick.title,
        url: pick.url,
        duration: pick.durationRaw || '?',
        thumbnail: pick.thumbnails?.[0]?.url || seed.thumbnail,
        author: pick.channel?.name,
        requester: { id: this.client.user.id, username: 'Autoplay' },
        isAutoplay: true
      };
    }
    return null;
  }

  /**
   * Restarts the current track from `seconds`. ffmpeg decodes and discards up
   * to that point, so long seeks on long tracks take a moment to start.
   */
  async seekTo(seconds) {
    if (this.isRadioMode || !this.currentTrack) return false;
    const target = Math.max(0, Math.floor(seconds));
    const durationSeconds = Math.floor((this.currentDurationMs || 0) / 1000);
    if (durationSeconds && target >= durationSeconds) return false;

    this.ignoreIdle = true;
    this.killYoutubeProcess();
    try {
      await this.startPlayback(this.currentTrack, target);
    } finally {
      this.ignoreIdle = false;
    }
    return true;
  }

  /** Current playback position in seconds, including any seek offset. */
  getPositionSeconds() {
    const played = this.currentResource?.playbackDuration
      || this.player?.state?.resource?.playbackDuration
      || 0;
    return Math.floor((played + (this.seekOffsetMs || 0)) / 1000);
  }

  /**
   * Applies an ffmpeg audio effect. The chain is baked into the stream, so
   * the current track restarts from its present position to take effect.
   */
  async setFilter(name) {
    if (!AUDIO_FILTERS[name]) return false;
    this.filter = name;
    if (this.isRadioMode || !this.currentTrack) return true;

    const position = this.getPositionSeconds();
    this.ignoreIdle = true;
    this.killYoutubeProcess();
    try {
      await this.startPlayback(this.currentTrack, position);
    } finally {
      this.ignoreIdle = false;
    }
    return true;
  }

  setVolume(volPercent) {
    this.volume = Math.max(0, Math.min(100, volPercent)) / 100;
    this.applyVolume(this.currentResource);
    if (!this.isRadioMode) this.persistQueue();
    this.updatePanel().catch(() => {});
    return Math.round(this.volume * 100);
  }

  playNow(index) {
    if (index < 0 || index >= this.queue.length) return false;
    const track = this.queue.splice(index, 1)[0];
    this.invalidatePrefetch();
    this.startingPlayback = true;
    this.startPlayback(track).catch(() => {});
    return true;
  }

  invalidatePrefetch() {
    this.prefetchToken += 1;
    this.nextPrefetch = null;
  }

  async prefetchNext() {
    const next = this.queue[0];
    if (!next || this.isRadioMode) {
      this.nextPrefetch = null;
      return;
    }
    const token = this.prefetchToken + 1;
    this.prefetchToken = token;
    try {
      const youtubeUrl = await youtubeHelper.resolvePlayableUrl(next);
      if (token !== this.prefetchToken) return;
      const videoId = youtubeHelper.extractVideoId(youtubeUrl);
      const format = await youtubeHelper.getAudioFormat(videoId);
      if (token !== this.prefetchToken) return;
      this.nextPrefetch = { trackUrl: next.url, youtubeUrl, format };
    } catch (err) {
      if (token === this.prefetchToken) this.nextPrefetch = null;
    }
  }

  clearProgressTimer() {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }

  startProgressTimer() {
    this.clearProgressTimer();
    this.progressTimer = setInterval(() => {
      if (!this.currentTrack || this.isRadioMode) return;
      if (this.player?.state?.status !== AudioPlayerStatus.Playing) return;
      this.updatePanel().catch(() => {});
    }, 12000);
  }

  async updatePanel() {
    if (!this.textChannel?.send) return;
    return withGuildColor(this.guildId, async () => {
      const payload = panelPayload(this);
      if (this.panelMessage?.edit) {
        try {
          this.panelMessage = await this.panelMessage.edit(payload);
          this.startProgressTimer();
          return;
        } catch (err) {
          this.panelMessage = null;
        }
      }
      this.panelMessage = await this.textChannel.send(payload).catch(() => null);
      this.startProgressTimer();
    });
  }

  async clearPanel() {
    this.clearProgressTimer();
    if (this.panelMessage?.delete) {
      await this.panelMessage.delete().catch(() => {});
    }
    this.panelMessage = null;
  }

  skip() {
    if (this.isRadioMode) {
      return false;
    }
    if (this.player) {
      this.player.stop();
      return true;
    }
    return false;
  }

  stop() {
    this.ignoreIdle = true;
    this.queue = [];
    this.currentTrack = null;
    this.currentResource = null;
    this.loop = 'off';
    this.killYoutubeProcess();

    if (this.radioStreamProcess) {
      try { this.radioStreamProcess.kill('SIGKILL'); } catch (e) {}
      this.radioStreamProcess = null;
    }

    this.player.stop();
    this.ignoreIdle = false;
    this.flushPersist();

    const radioCfg = db.getRadioConfig(this.guildId);
    if (radioCfg && radioCfg.active && radioCfg.channel_id && radioCfg.stream_url) {
      return this.startRadio(radioCfg.channel_id, radioCfg.stream_url, radioCfg.station_name);
    }

    this.destroy();
  }

  destroy() {
    this.ignoreIdle = true;
    this.clearDisconnectTimeout();
    this.clearProgressTimer();
    this.invalidatePrefetch();
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.queue = [];
    this.currentTrack = null;
    this.currentResource = null;
    this.currentDurationMs = 0;
    this.isRadioMode = false;
    db.clearMusicQueue(this.guildId);
    this.killYoutubeProcess();
    this.clearPanel().catch(() => {});

    if (this.radioStreamProcess) {
      try { this.radioStreamProcess.kill('SIGKILL'); } catch (e) {}
      this.radioStreamProcess = null;
    }

    if (this.player) {
      this.player.stop();
    }

    if (this.connection) {
      try {
        this.connection.destroy();
      } catch (e) {}
      this.connection = null;
    }

    guildQueues.delete(this.guildId);
  }
}

// Module API
const musicManager = {
  getQueue(guildId, client) {
    if (!guildQueues.has(guildId)) {
      guildQueues.set(guildId, new GuildMusicQueue(guildId, client));
    }
    return guildQueues.get(guildId);
  },

  hasQueue(guildId) {
    return guildQueues.has(guildId);
  },

  deleteQueue(guildId) {
    if (guildQueues.has(guildId)) {
      guildQueues.get(guildId).destroy();
    }
  },

  // Resolve query (YouTube, Spotify, Deezer, and keyword searches)
  async resolveTracks(query, requester) {
    const tracks = [];

    // 1. Check Spotify URL
    const spotifyType = spotifyHelper.parseUrl(query);
    if (spotifyType) {
      try {
        const spotResult = await spotifyHelper.resolve(query, requester);
        if (spotResult && spotResult.tracks && spotResult.tracks.length > 0) {
          return spotResult;
        }
      } catch (spotErr) {
        Logger.warn('[Music] Spotify resolution failed:', spotErr.message);
      }
      throw new Error('Could not retrieve track information from Spotify. Please check the URL.');
    }

    // 2. Check Deezer URL
    if (deezerHelper.isDeezerUrl(query)) {
      try {
        const deezResult = await deezerHelper.resolve(query, requester);
        if (deezResult && deezResult.tracks && deezResult.tracks.length > 0) {
          return deezResult;
        }
      } catch (deezErr) {
        Logger.warn('[Music] Deezer resolution failed:', deezErr.message);
      }
    }

    // 3. Check YouTube Playlist / Video / Search
    const playlistId = youtubeHelper.extractPlaylistId(query);
    const videoId = youtubeHelper.extractVideoId(query);

    if (playlistId && youtubeHelper.isQueueablePlaylistId(playlistId)) {
      try {
        const playlistTracks = await youtubeHelper.getPlaylistTracks(query, requester, 100);
        if (playlistTracks.length > 0) {
          return { type: 'playlist', tracks: playlistTracks };
        }
      } catch (err) {
        Logger.warn('[Music] YouTube playlist resolution failed:', err.message);
      }
      if (!videoId) {
        throw new Error('Could not load that YouTube playlist.');
      }
    }

    if (videoId) {
      const details = await youtubeHelper.getVideoDetails(query);
      if (details) {
        tracks.push({
          title: details.title,
          url: details.url,
          duration: details.durationRaw || '0:00',
          thumbnail: details.thumbnails[0]?.url || 'https://cdn.discordapp.com/embed/avatars/0.png',
          author: details.channel?.name || 'YouTube',
          requester
        });
        return { type: 'video', tracks };
      }
    }

    // 4. Default: Search YouTube for keyword query
    const searchResults = await youtubeHelper.searchVideos(query, 1);
    if (searchResults && searchResults.length > 0) {
      const v = searchResults[0];
      tracks.push({
        title: v.title,
        url: v.url,
        duration: v.durationRaw || '0:00',
        thumbnail: v.thumbnails[0]?.url || 'https://cdn.discordapp.com/embed/avatars/0.png',
        author: v.channel?.name || 'YouTube',
        requester
      });
      return { type: 'search', tracks };
    }

    return { type: 'none', tracks: [] };
  },

  async restoreQueuesOnStartup(client) {
    restoredGuilds.clear();
    const saved = db.getAllMusicQueues();

    for (const [guildId, state] of Object.entries(saved)) {
      try {
        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
          db.clearMusicQueue(guildId);
          continue;
        }

        const voiceChannelId = state?.voice_channel_id;
        const voiceChannel = voiceChannelId
          ? (guild.channels.cache.get(voiceChannelId) || await guild.channels.fetch(voiceChannelId).catch(() => null))
          : null;
        if (!voiceChannel || typeof voiceChannel.isVoiceBased !== 'function' || !voiceChannel.isVoiceBased()) {
          db.clearMusicQueue(guildId);
          continue;
        }

        const tracks = [];
        const current = hydrateTrack(state.current);
        if (current) tracks.push(current);
        if (Array.isArray(state.queue)) {
          for (const item of state.queue) {
            const track = hydrateTrack(item);
            if (track) tracks.push(track);
          }
        }

        if (tracks.length === 0) {
          db.clearMusicQueue(guildId);
          continue;
        }

        const musicQueue = this.getQueue(guildId, client);
        musicQueue.volume = typeof state.volume === 'number' ? Math.max(0, Math.min(1, state.volume)) : 0.35;
        musicQueue.loop = ['off', 'track', 'queue'].includes(state.loop) ? state.loop : 'off';
        musicQueue.filter = AUDIO_FILTERS[state.filter] ? state.filter : 'none';
        musicQueue.autoplay = Boolean(state.autoplay);
        if (state.text_channel_id) {
          musicQueue.textChannel = guild.channels.cache.get(state.text_channel_id)
            || await guild.channels.fetch(state.text_channel_id).catch(() => null)
            || null;
        }

        musicQueue.suppressNowPlaying = true;
        await musicQueue.connect(voiceChannel);
        await musicQueue.enqueueTracks(tracks);
        restoredGuilds.add(guildId);
        musicQueue.suppressNowPlaying = false;
        await musicQueue.updatePanel();

        Logger.success(`[Music] Restored ${tracks.length} track(s) in guild ${guildId}`);
      } catch (err) {
        Logger.error(`[Music] Failed to restore queue for guild ${guildId}:`, err);
      }
    }
  },

  async initRadioOnStartup(client) {
    const activeRadios = db.getAllActiveRadios();
    for (const r of activeRadios) {
      try {
        if (restoredGuilds.has(r.guild_id)) continue;
        const guild = client.guilds.cache.get(r.guild_id);
        if (!guild) continue;
        const channel = guild.channels.cache.get(r.channel_id);
        if (!channel) continue;

        const musicQueue = this.getQueue(r.guild_id, client);
        await musicQueue.startRadio(r.channel_id, r.stream_url, r.station_name);
      } catch (err) {
        Logger.error(`[Radio] Failed to auto-start radio for guild ${r.guild_id}:`, err);
      }
    }
  },

  serializeTrack,
  hydrateTrack,
  AUDIO_FILTERS
};

module.exports = musicManager;
