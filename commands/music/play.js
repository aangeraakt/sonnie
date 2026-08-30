const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../../utils/musicManager');
const { createEmbed, errorEmbed, COLORS } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play or queue audio from YouTube or Spotify (tracks, albums, playlists)')
    .addStringOption(opt =>
      opt.setName('query')
        .setDescription('YouTube URL, Spotify URL, playlist URL, or song search keywords')
        .setRequired(true)
    ),

  async execute(interaction) {
    const { member, guild, channel } = interaction;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
      return interaction.reply({
        embeds: [errorEmbed('Voice Channel Required', 'Join a voice channel first.')],
        flags: 64
      });
    }

    await interaction.deferReply();

    const query = interaction.options.getString('query');
    const musicQueue = musicManager.getQueue(guild.id, interaction.client);
    musicQueue.textChannel = channel;

    try {
      await musicQueue.connect(voiceChannel);

      const { type, tracks } = await musicManager.resolveTracks(query, interaction.user);

      if (!tracks || tracks.length === 0) {
        return interaction.editReply({
          embeds: [errorEmbed('No Results', `Nothing playable found for \`${query}\`.`)]
        });
      }

      const result = await musicQueue.enqueueTracks(tracks);
      const first = tracks[0];

      if (tracks.length === 1) {
        return interaction.editReply({
          embeds: [createEmbed({
            title: result.started ? 'Now playing' : 'Added to queue',
            description: `**[${first.title}](${first.url})**\n${first.author || 'Unknown'} · \`${first.duration}\`${result.started ? '' : `\nPosition **#${result.position}**`}`,
            image: first.thumbnail,
            color: COLORS.MUSIC
          })]
        });
      }

      return interaction.editReply({
        embeds: [createEmbed({
          title: result.started ? 'Playing playlist' : 'Playlist queued',
          description: `Loaded **${tracks.length}** tracks from **${type}**.\n**${first.title}**${result.started ? ' is playing now.' : ` starts at **#${result.position}**.`}`,
          image: first.thumbnail,
          color: COLORS.MUSIC
        })]
      });
    } catch (err) {
      return interaction.editReply({
        embeds: [errorEmbed('Playback Error', err.message)]
      });
    }
  }
};
