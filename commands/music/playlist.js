const { SlashCommandBuilder, ChannelType } = require('discord.js');
const db = require('../../database/db');
const musicManager = require('../../utils/musicManager');
const { createEmbed, successEmbed, errorEmbed } = require('../../utils/embedBuilder');

const MAX_PLAYLISTS = 25;
const MAX_TRACKS = 100;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('playlist')
    .setDescription('Save and reload your own playlists')
    .addSubcommand(sub =>
      sub.setName('save')
        .setDescription('Save the current queue as a playlist')
        .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setMaxLength(40).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('load')
        .setDescription('Queue up a saved playlist')
        .addStringOption(opt => opt.setName('name').setDescription('Playlist to load').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Delete a saved playlist')
        .addStringOption(opt => opt.setName('name').setDescription('Playlist to delete').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('Show the tracks in a saved playlist')
        .addStringOption(opt => opt.setName('name').setDescription('Playlist to view').setRequired(true))
    )
    .addSubcommand(sub => sub.setName('list').setDescription('List your saved playlists')),

  async execute(interaction) {
    const { guild, user, member } = interaction;
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const playlists = Object.values(db.getPlaylists(guild.id, user.id));
      if (!playlists.length) {
        return interaction.reply({
          embeds: [errorEmbed('No Playlists', 'Save the current queue with `/music playlist save name:...`.')],
          flags: 64
        });
      }
      return interaction.reply({
        embeds: [createEmbed({
          title: `Your Playlists - ${user.username}`,
          description: playlists.map((item) =>
            `**${item.name}** - ${item.tracks.length} track${item.tracks.length === 1 ? '' : 's'}\n Updated <t:${Math.floor(item.updated_at / 1000)}:R>`
          ).join('\n\n'),
          footerText: `${playlists.length} of ${MAX_PLAYLISTS} used`
        })],
        flags: 64
      });
    }

    const name = interaction.options.getString('name').trim();

    if (sub === 'save') {
      if (!musicManager.hasQueue(guild.id)) {
        return interaction.reply({ embeds: [errorEmbed('Nothing Playing', 'There is no queue to save.')], flags: 64 });
      }

      const queue = musicManager.getQueue(guild.id, interaction.client);
      if (queue.isRadioMode) {
        return interaction.reply({ embeds: [errorEmbed('Live Radio', 'A radio stream is not a playlist.')], flags: 64 });
      }

      const tracks = [queue.currentTrack, ...queue.queue]
        .filter(Boolean)
        .map((track) => ({ title: track.title, url: track.url, duration: track.duration, author: track.author }))
        .slice(0, MAX_TRACKS);

      if (!tracks.length) {
        return interaction.reply({ embeds: [errorEmbed('Empty Queue', 'There is nothing queued to save.')], flags: 64 });
      }

      const existing = db.getPlaylists(guild.id, user.id);
      if (!existing[name.toLowerCase()] && Object.keys(existing).length >= MAX_PLAYLISTS) {
        return interaction.reply({
          embeds: [errorEmbed('Playlist Limit', `You already have ${MAX_PLAYLISTS} playlists. Delete one first.`)],
          flags: 64
        });
      }

      db.savePlaylist(guild.id, user.id, name, tracks);
      return interaction.reply({
        embeds: [successEmbed('Playlist Saved',
          `**${name}** now holds **${tracks.length}** track${tracks.length === 1 ? '' : 's'}.\nLoad it any time with \`/music playlist load name:${name}\`.`)]
      });
    }

    const playlists = db.getPlaylists(guild.id, user.id);
    const playlist = playlists[name.toLowerCase()];
    if (!playlist) {
      return interaction.reply({
        embeds: [errorEmbed('Playlist Not Found', `You have no playlist called **${name}**. See \`/music playlist list\`.`)],
        flags: 64
      });
    }

    if (sub === 'delete') {
      db.deletePlaylist(guild.id, user.id, name);
      return interaction.reply({ embeds: [successEmbed('Playlist Deleted', `**${playlist.name}** has been removed.`)], flags: 64 });
    }

    if (sub === 'view') {
      return interaction.reply({
        embeds: [createEmbed({
          title: `Playlist - ${playlist.name}`,
          description: playlist.tracks
            .map((track, index) => `\`${index + 1}.\` [${track.title}](${track.url}) ${track.duration ? `\`${track.duration}\`` : ''}`)
            .join('\n')
            .slice(0, 4000),
          footerText: `${playlist.tracks.length} tracks`
        })],
        flags: 64
      });
    }

    // load
    const voiceChannel = member.voice?.channel;
    if (!voiceChannel || voiceChannel.type === ChannelType.GuildStageVoice) {
      return interaction.reply({ embeds: [errorEmbed('Join a Voice Channel', 'Get into a voice channel before loading a playlist.')], flags: 64 });
    }

    await interaction.deferReply();

    const queue = musicManager.getQueue(guild.id, interaction.client);
    queue.textChannel = interaction.channel;
    await queue.connect(voiceChannel).catch(() => null);

    const tracks = playlist.tracks.map((track) => ({
      ...track,
      requester: { id: user.id, username: user.username }
    }));

    const result = await queue.enqueueTracks(tracks);

    return interaction.editReply({
      embeds: [successEmbed('Playlist Loaded',
        `Queued **${tracks.length}** track${tracks.length === 1 ? '' : 's'} from **${playlist.name}**.` +
        (result?.started ? `\n\n**${tracks[0].title}** is playing now.` : `\n\nFirst track starts at **#${result?.position ?? '?'}**.`))]
    });
  }
};
