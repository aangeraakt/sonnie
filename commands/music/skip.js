const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../../utils/musicManager');
const { errorEmbed, successEmbed } = require('../../utils/embedBuilder');
const { checkDjPermission } = require('../../utils/djRole');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the currently playing song'),

  async execute(interaction) {
    const { guild, member } = interaction;
    if (!member.voice.channel) {
      return interaction.reply({ embeds: [errorEmbed('Voice Channel Required', 'You must be in a voice channel to skip tracks!')], flags: 64 });
    }

    const musicQueue = musicManager.getQueue(guild.id, interaction.client);

    const djCheck = checkDjPermission(member, guild, { queue: musicQueue, ownTrackOnly: true });

    if (!djCheck.allowed) {

      return interaction.reply({ embeds: [errorEmbed('DJ Only', djCheck.reason)], flags: 64 });

    }
    if (!musicQueue || (!musicQueue.currentTrack && !musicQueue.isRadioMode)) {
      return interaction.reply({ embeds: [errorEmbed('Nothing Playing', 'There is no music currently playing to skip!')], flags: 64 });
    }

    if (musicQueue.isRadioMode) {
      return interaction.reply({ embeds: [errorEmbed('Radio Active', 'Cannot skip 24/7 radio streams. Use `/music radio stop` or `/music play` to switch music.')], flags: 64 });
    }

    const skippedTitle = musicQueue.currentTrack.title;
    musicQueue.skip();

    return interaction.reply({
      embeds: [successEmbed('Skipped', `Skipped **${skippedTitle}**.`)]
    });
  }
};
