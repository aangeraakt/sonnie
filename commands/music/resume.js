const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../../utils/musicManager');
const { errorEmbed, successEmbed } = require('../../utils/embedBuilder');
const { AudioPlayerStatus } = require('@discordjs/voice');
const { checkDjPermission } = require('../../utils/djRole');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume paused music playback'),

  async execute(interaction) {
    const { guild, member } = interaction;
    if (!member.voice.channel) {
      return interaction.reply({ embeds: [errorEmbed('Voice Channel Required', 'You must be in a voice channel to resume!')], flags: 64 });
    }

    const musicQueue = musicManager.getQueue(guild.id, interaction.client);

    const djCheck = checkDjPermission(member, guild, { queue: musicQueue, ownTrackOnly: true });

    if (!djCheck.allowed) {

      return interaction.reply({ embeds: [errorEmbed('DJ Only', djCheck.reason)], flags: 64 });

    }
    if (!musicQueue || !musicQueue.player || musicQueue.player.state.status !== AudioPlayerStatus.Paused) {
      return interaction.reply({ embeds: [errorEmbed('Not Paused', 'Music is not paused!')], flags: 64 });
    }

    musicQueue.player.unpause();
    await musicQueue.updatePanel();
    return interaction.reply({
      embeds: [successEmbed('Resumed', 'Playback is playing again.')]
    });
  }
};
