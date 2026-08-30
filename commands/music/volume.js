const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../../utils/musicManager');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { checkDjPermission } = require('../../utils/djRole');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Adjust the music or radio playback volume')
    .addIntegerOption(opt =>
      opt.setName('percent')
        .setDescription('Volume level between 1 and 100 (default is 35)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  async execute(interaction) {
    const { guild, member } = interaction;
    if (!member.voice.channel) {
      return interaction.reply({ embeds: [errorEmbed('Voice Channel Required', 'You must be in a voice channel to change volume!')], flags: 64 });
    }

    const musicQueue = musicManager.getQueue(guild.id, interaction.client);

    const djCheck = checkDjPermission(member, guild, { queue: musicQueue, ownTrackOnly: false });

    if (!djCheck.allowed) {

      return interaction.reply({ embeds: [errorEmbed('DJ Only', djCheck.reason)], flags: 64 });

    }
    if (!musicQueue || (!musicQueue.currentTrack && !musicQueue.isRadioMode)) {
      return interaction.reply({ embeds: [errorEmbed('Nothing Playing', 'No music or radio is currently playing to adjust volume for.')], flags: 64 });
    }

    const percent = interaction.options.getInteger('percent');
    const newVol = musicQueue.setVolume(percent);

    return interaction.reply({
      embeds: [successEmbed('Volume', `Volume set to **${newVol}%**.`)]
    });
  }
};
