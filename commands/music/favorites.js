const { SlashCommandBuilder, ChannelType } = require('discord.js');
const db = require('../../database/db');
const musicManager = require('../../utils/musicManager');
const { createEmbed, successEmbed, errorEmbed } = require('../../utils/embedBuilder');

const MAX_FAVORITES = 50;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('favorites')
    .setDescription('Keep a personal list of favourite tracks')
    .addSubcommand(sub => sub.setName('add').setDescription('Save the currently playing track to your favourites'))
    .addSubcommand(sub => sub.setName('list').setDescription('Show your favourite tracks'))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove one favourite')
        .addIntegerOption(opt => opt.setName('number').setDescription('Position from /music favorites list').setMinValue(1).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('play')
        .setDescription('Queue one favourite, or all of them')
        .addIntegerOption(opt => opt.setName('number').setDescription('Position to play. Leave empty to queue them all').setMinValue(1).setRequired(false))
    ),

  async execute(interaction) {
    const { guild, user, member } = interaction;
    const sub = interaction.options.getSubcommand();
    const favorites = db.getFavorites(guild.id, user.id);

    if (sub === 'add') {
      if (!musicManager.hasQueue(guild.id)) {
        return interaction.reply({ embeds: [errorEmbed('Nothing Playing', 'Play something before favouriting it.')], flags: 64 });
      }

      const queue = musicManager.getQueue(guild.id, interaction.client);
      if (!queue.currentTrack || queue.isRadioMode) {
        return interaction.reply({ embeds: [errorEmbed('Nothing to Save', 'Live radio streams cannot be favourited.')], flags: 64 });
      }
      if (favorites.length >= MAX_FAVORITES) {
        return interaction.reply({ embeds: [errorEmbed('Favourites Full', `You already have ${MAX_FAVORITES} favourites. Remove one first.`)], flags: 64 });
      }

      const track = queue.currentTrack;
      const added = db.addFavorite(guild.id, user.id, {
        title: track.title,
        url: track.url,
        duration: track.duration,
        author: track.author
      });

      return interaction.reply({
        embeds: added
          ? [successEmbed('Favourite Saved', `**${track.title}** is now in your favourites (**${favorites.length}/${MAX_FAVORITES}**).`)]
          : [errorEmbed('Already Saved', `**${track.title}** is already in your favourites.`)],
        flags: 64
      });
    }

    if (!favorites.length) {
      return interaction.reply({
        embeds: [errorEmbed('No Favourites', 'Save the playing track with `/music favorites add`.')],
        flags: 64
      });
    }

    if (sub === 'list') {
      return interaction.reply({
        embeds: [createEmbed({
          title: `Favourites - ${user.username}`,
          description: favorites
            .map((track, index) => `\`${index + 1}.\` [${track.title}](${track.url}) ${track.duration ? `\`${track.duration}\`` : ''}`)
            .join('\n')
            .slice(0, 4000),
          footerText: `${favorites.length} of ${MAX_FAVORITES} saved`
        })],
        flags: 64
      });
    }

    if (sub === 'remove') {
      const index = interaction.options.getInteger('number') - 1;
      const removed = db.removeFavorite(guild.id, user.id, index);
      return interaction.reply({
        embeds: removed
          ? [successEmbed('Favourite Removed', `Removed **${removed.title}**. You have **${favorites.length}** left.`)]
          : [errorEmbed('Invalid Number', `Pick a number between 1 and ${favorites.length}.`)],
        flags: 64
      });
    }

    // play
    const voiceChannel = member.voice?.channel;
    if (!voiceChannel || voiceChannel.type === ChannelType.GuildStageVoice) {
      return interaction.reply({ embeds: [errorEmbed('Join a Voice Channel', 'Get into a voice channel first.')], flags: 64 });
    }

    const number = interaction.options.getInteger('number');
    if (number && (number < 1 || number > favorites.length)) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Number', `Pick a number between 1 and ${favorites.length}.`)], flags: 64 });
    }

    await interaction.deferReply();

    const chosen = number ? [favorites[number - 1]] : favorites;
    const queue = musicManager.getQueue(guild.id, interaction.client);
    queue.textChannel = interaction.channel;
    await queue.connect(voiceChannel).catch(() => null);

    const result = await queue.enqueueTracks(chosen.map((track) => ({
      ...track,
      requester: { id: user.id, username: user.username }
    })));

    return interaction.editReply({
      embeds: [successEmbed('Favourites Queued',
        `Queued **${chosen.length}** track${chosen.length === 1 ? '' : 's'} from your favourites.` +
        (result?.started ? `\n\n**${chosen[0].title}** is playing now.` : ''))]
    });
  }
};
