const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../../utils/musicManager');
const { createEmbed, errorEmbed, COLORS } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Display the current music queue and upcoming tracks'),

  async execute(interaction) {
    const musicQueue = musicManager.getQueue(interaction.guild.id, interaction.client);

    if (!musicQueue || (!musicQueue.currentTrack && !musicQueue.isRadioMode && musicQueue.queue.length === 0)) {
      return interaction.reply({
        embeds: [errorEmbed('Empty Queue', 'Nothing is playing and the queue is empty.')],
        flags: 64
      });
    }

    if (musicQueue.isRadioMode) {
      return interaction.reply({
        embeds: [createEmbed({
          title: 'Radio',
          description: `Streaming **${musicQueue.currentTrack.title}**\nUse \`/play\` to take over this session.`,
          color: COLORS.MUSIC
        })]
      });
    }

    const current = musicQueue.currentTrack;
    const upcoming = musicQueue.queue.slice(0, 12).map((track, i) => {
      return `**${i + 1}.** [${track.title}](${track.url}) \`${track.duration}\``;
    });
    if (musicQueue.queue.length > 12) {
      upcoming.push(`+${musicQueue.queue.length - 12} more`);
    }

    return interaction.reply({
      embeds: [createEmbed({
        title: 'Queue',
        description: `**Now playing**\n[${current.title}](${current.url}) \`${current.duration}\``,
        fields: [
          { name: 'Up next', value: upcoming.length ? upcoming.join('\n') : 'No upcoming tracks' }
        ],
        thumbnail: current.thumbnail,
        color: COLORS.MUSIC,
        footerText: `${musicQueue.queue.length + 1} tracks • Loop ${musicQueue.loop} • ${Math.round(musicQueue.volume * 100)}%`
      })]
    });
  }
};
