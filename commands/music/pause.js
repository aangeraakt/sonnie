const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../../utils/musicManager');
const { errorEmbed, successEmbed } = require('../../utils/embedBuilder');
const { AudioPlayerStatus } = require('@discordjs/voice');
const { checkDjPermission } = require('../../utils/djRole');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause current music playback'),

  async execute(interaction) {
    const { guild, member } = interaction;
    if (!member.voice.channel) {
      return interaction.reply({ embeds: [errorEmbed('Voice Channel Required', 'You must be in a voice channel to pause!')], flags: 64 });
    }

    const musicQueue = musicManager.getQueue(guild.id, interaction.client);

    const djCheck = checkDjPermission(member, guild, { queue: musicQueue, ownTrackOnly: true });

    if (!djCheck.allowed) {

      return interaction.reply({ embeds: [errorEmbed('DJ Only', djCheck.reason)], flags: 64 });

    }
    if (!musicQueue || !musicQueue.player || musicQueue.player.state.status !== AudioPlayerStatus.Playing) {
      return interaction.reply({ embeds: [errorEmbed('Nothing Playing', 'Music is not currently playing!')], flags: 64 });
    }

    musicQueue.player.pause();
    await musicQueue.updatePanel();
    return interaction.reply({
      embeds: [successEmbed('Paused', 'Playback is paused.')]
    });
  }
};
