const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../../utils/musicManager');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embedBuilder');
const db = require('../../database/db');
const { checkDjPermission } = require('../../utils/djRole');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop music playback, clear queue, and resume radio if configured'),

  async execute(interaction) {
    const { guild, member } = interaction;
    if (!member.voice.channel) {
      return interaction.reply({ embeds: [errorEmbed('Voice Channel Required', 'You must be in a voice channel to stop playback!')], flags: 64 });
    }

    const musicQueue = musicManager.getQueue(guild.id, interaction.client);

    const djCheck = checkDjPermission(member, guild, { queue: musicQueue, ownTrackOnly: false });

    if (!djCheck.allowed) {

      return interaction.reply({ embeds: [errorEmbed('DJ Only', djCheck.reason)], flags: 64 });

    }
    if (!musicQueue || (!musicQueue.currentTrack && !musicQueue.isRadioMode && musicQueue.queue.length === 0)) {
      return interaction.reply({ embeds: [errorEmbed('Nothing Playing', 'There is no music or radio playing.')], flags: 64 });
    }

    const radioCfg = db.getRadioConfig(guild.id);
    musicQueue.stop();

    if (radioCfg && radioCfg.active && radioCfg.channel_id && radioCfg.stream_url) {
      return interaction.reply({
        embeds: [infoEmbed('Stopped', `Queue cleared. Resuming **${radioCfg.station_name}** in <#${radioCfg.channel_id}>.`)]
      });
    }

    return interaction.reply({
      embeds: [successEmbed('Stopped', 'Cleared the queue and left the voice channel.')]
    });
  }
};
