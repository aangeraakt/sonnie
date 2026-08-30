const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../../utils/musicManager');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { checkDjPermission } = require('../../utils/djRole');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Set repeat mode for music')
    .addStringOption(opt =>
      opt.setName('mode')
        .setDescription('Loop mode')
        .setRequired(true)
        .addChoices(
          { name: 'Off', value: 'off' },
          { name: 'Repeat Track', value: 'track' },
          { name: 'Repeat Queue', value: 'queue' }
        )
    ),

  async execute(interaction) {
    const { guild, member } = interaction;
    if (!member.voice.channel) {
      return interaction.reply({ embeds: [errorEmbed('Voice Channel Required', 'You must be in a voice channel to set loop mode!')], flags: 64 });
    }

    const musicQueue = musicManager.getQueue(guild.id, interaction.client);

    const djCheck = checkDjPermission(member, guild, { queue: musicQueue, ownTrackOnly: false });

    if (!djCheck.allowed) {

      return interaction.reply({ embeds: [errorEmbed('DJ Only', djCheck.reason)], flags: 64 });

    }
    if (!musicQueue || (!musicQueue.currentTrack && !musicQueue.isRadioMode)) {
      return interaction.reply({ embeds: [errorEmbed('Nothing Playing', 'No music is currently playing.')], flags: 64 });
    }

    const mode = interaction.options.getString('mode');
    musicQueue.loop = mode;
    if (!musicQueue.isRadioMode) musicQueue.persistQueue();
    await musicQueue.updatePanel();

    return interaction.reply({
      embeds: [successEmbed('Loop', `Loop is now **${mode}**.`)]
    });
  }
};
