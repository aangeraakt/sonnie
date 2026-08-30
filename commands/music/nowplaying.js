const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../../utils/musicManager');
const { panelPayload } = require('../../utils/musicPanel');
const { errorEmbed, infoEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show the live player for the current song or radio'),

  async execute(interaction) {
    const musicQueue = musicManager.getQueue(interaction.guild.id, interaction.client);

    if (!musicQueue || !musicQueue.currentTrack) {
      return interaction.reply({
        embeds: [errorEmbed('Nothing Playing', 'No song or radio is currently playing.')],
        flags: 64
      });
    }

    musicQueue.textChannel = interaction.channel;
    if (musicQueue.panelMessage) {
      await musicQueue.updatePanel();
      return interaction.reply({
        embeds: [infoEmbed('Player', 'The music panel was updated.')],
        flags: 64
      });
    }

    await interaction.reply({ ...panelPayload(musicQueue), fetchReply: true });
    musicQueue.panelMessage = await interaction.fetchReply().catch(() => null);
    musicQueue.startProgressTimer();
  }
};
