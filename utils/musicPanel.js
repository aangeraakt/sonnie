const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');
const { AudioPlayerStatus } = require('@discordjs/voice');
const { createEmbed, COLORS, errorEmbed } = require('./embedBuilder');

function parseDurationSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  const text = String(value || '').trim();
  if (!text || text.toUpperCase().includes('LIVE')) return 0;
  const parts = text.split(':').map((part) => parseInt(part, 10));
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

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

function progressBar(current, total) {
  const size = 16;
  if (!total || total <= 0) {
    return `\`${formatClock(current)}\` ${'─'.repeat(size)} \`LIVE\``;
  }
  const ratio = Math.max(0, Math.min(1, current / total));
  const pos = Math.round(ratio * (size - 1));
  let bar = '';
  for (let i = 0; i < size; i += 1) {
    bar += i === pos ? '●' : '─';
  }
  return `\`${formatClock(current)}\` ${bar} \`${formatClock(total)}\``;
}

function truncate(text, max) {
  const value = String(text || 'Unknown');
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function loopLabel(mode) {
  if (mode === 'track') return 'Track';
  if (mode === 'queue') return 'Queue';
  return 'Off';
}

function isPaused(queue) {
  return queue.player?.state?.status === AudioPlayerStatus.Paused;
}

function playbackSeconds(queue) {
  const played = queue.currentResource?.playbackDuration || queue.player?.state?.resource?.playbackDuration || 0;
  // A seek restarts the stream at 0, so add back where we seeked to.
  return Math.floor((played + (queue.seekOffsetMs || 0)) / 1000);
}

function trackLengthSeconds(queue) {
  if (queue.currentDurationMs) return Math.floor(queue.currentDurationMs / 1000);
  return parseDurationSeconds(queue.currentTrack?.duration);
}

function buildPanelEmbed(queue) {
  const track = queue.currentTrack;
  if (!track) {
    return createEmbed({
      title: 'Music',
      description: 'Nothing is playing.',
      color: COLORS.MUSIC
    });
  }

  if (queue.isRadioMode || track.isRadio) {
    return createEmbed({
      authorName: 'Live radio',
      title: track.title,
      description: progressBar(0, 0),
      fields: [
        { name: 'Volume', value: `${Math.round(queue.volume * 100)}%`, inline: true },
        { name: 'Status', value: isPaused(queue) ? 'Paused' : 'Streaming', inline: true }
      ],
      color: COLORS.MUSIC
    });
  }

  const upcoming = queue.queue.slice(0, 5).map((item, index) => {
    return `**${index + 1}.** ${truncate(item.title, 48)} \`${item.duration || '0:00'}\``;
  });
  if (queue.queue.length > 5) {
    upcoming.push(`+${queue.queue.length - 5} more`);
  }

  return createEmbed({
    authorName: isPaused(queue) ? 'Paused' : 'Now playing',
    title: truncate(track.title, 240),
    url: track.url,
    description: [
      track.author ? `**${track.author}**` : null,
      progressBar(playbackSeconds(queue), trackLengthSeconds(queue))
    ].filter(Boolean).join('\n'),
    fields: [
      { name: 'Requested by', value: track.requester?.id ? `<@${track.requester.id}>` : 'Unknown', inline: true },
      { name: 'Volume', value: `${Math.round(queue.volume * 100)}%`, inline: true },
      { name: 'Loop', value: loopLabel(queue.loop), inline: true },
      { name: 'Up next', value: upcoming.length ? upcoming.join('\n') : 'Queue is empty', inline: false }
    ],
    image: track.thumbnail || null,
    color: COLORS.MUSIC,
    footerText: `${queue.queue.length} in queue • Sonnies`
  });
}

function buildPanelComponents(queue) {
  const stopped = !queue.currentTrack;
  const radio = queue.isRadioMode || queue.currentTrack?.isRadio;
  const paused = isPaused(queue);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music_pause')
      .setLabel(paused ? 'Resume' : 'Pause')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(stopped || radio),
    new ButtonBuilder()
      .setCustomId('music_skip')
      .setLabel('Skip')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(stopped || radio),
    new ButtonBuilder()
      .setCustomId('music_stop')
      .setLabel('Stop')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(stopped),
    new ButtonBuilder()
      .setCustomId('music_loop')
      .setLabel(`Loop: ${loopLabel(queue.loop)}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(stopped || radio),
    new ButtonBuilder()
      .setCustomId('music_shuffle')
      .setLabel('Shuffle')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(stopped || radio || queue.queue.length < 2)
  );

  const rows = [buttons];
  if (!stopped && !radio && queue.queue.length > 0) {
    const options = queue.queue.slice(0, 25).map((track, index) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(truncate(track.title, 100))
        .setDescription(truncate(`${track.duration || '0:00'}${track.author ? ` • ${track.author}` : ''}`, 100))
        .setValue(String(index))
    );
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('music_queue')
          .setPlaceholder('Play a song from the queue')
          .addOptions(options)
      )
    );
  }

  return rows;
}

function panelPayload(queue) {
  return {
    embeds: [buildPanelEmbed(queue)],
    components: buildPanelComponents(queue)
  };
}

function requireSameVoice(interaction, queue) {
  const userChannel = interaction.member?.voice?.channelId;
  const botChannel = queue.voiceChannelId || queue.connection?.joinConfig?.channelId;
  if (!userChannel || !botChannel || userChannel !== botChannel) {
    return false;
  }
  return true;
}

async function handleMusicPanelInteraction(interaction) {
  const musicManager = require('./musicManager');
  const queue = musicManager.getQueue(interaction.guild.id, interaction.client);
  if (!queue.currentTrack && interaction.customId !== 'music_stop') {
    return interaction.reply({
      embeds: [errorEmbed('Nothing Playing', 'There is no active music session.')],
      flags: 64
    });
  }

  if (!requireSameVoice(interaction, queue)) {
    return interaction.reply({
      embeds: [errorEmbed('Voice Channel Required', 'Join the same voice channel as the bot to use the player.')],
      flags: 64
    });
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'music_queue') {
    const index = parseInt(interaction.values[0], 10);
    const track = queue.queue[index];
    if (!track) {
      return interaction.reply({
        embeds: [errorEmbed('Queue', 'That song is no longer in the queue.')],
        flags: 64
      });
    }
    queue.playNow(index);
    await interaction.deferUpdate().catch(() => {});
    await queue.updatePanel();
    return;
  }

  if (interaction.customId === 'music_pause') {
    if (isPaused(queue)) queue.player.unpause();
    else queue.player.pause();
    await interaction.deferUpdate().catch(() => {});
    await queue.updatePanel();
    return;
  }

  if (interaction.customId === 'music_skip') {
    if (queue.isRadioMode) {
      return interaction.reply({
        embeds: [errorEmbed('Radio Active', 'Radio streams cannot be skipped.')],
        flags: 64
      });
    }
    queue.skip();
    await interaction.deferUpdate().catch(() => {});
    return;
  }

  if (interaction.customId === 'music_stop') {
    queue.stop();
    await interaction.deferUpdate().catch(() => {});
    return;
  }

  if (interaction.customId === 'music_loop') {
    const order = ['off', 'track', 'queue'];
    queue.loop = order[(order.indexOf(queue.loop) + 1) % order.length];
    queue.persistQueue();
    await interaction.deferUpdate().catch(() => {});
    await queue.updatePanel();
    return;
  }

  if (interaction.customId === 'music_shuffle') {
    for (let i = queue.queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue.queue[i], queue.queue[j]] = [queue.queue[j], queue.queue[i]];
    }
    queue.invalidatePrefetch();
    queue.persistQueue();
    queue.prefetchNext().catch(() => {});
    await interaction.deferUpdate().catch(() => {});
    await queue.updatePanel();
  }
}

module.exports = {
  parseDurationSeconds,
  formatClock,
  progressBar,
  panelPayload,
  handleMusicPanelInteraction
};
