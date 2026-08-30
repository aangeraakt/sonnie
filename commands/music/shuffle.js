const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../../utils/musicManager');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { checkDjPermission } = require('../../utils/djRole');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Randomly shuffle all tracks in the queue'),

  async execute(interaction) {
    const { guild, member } = interaction;
    if (!member.voice.channel) {
      return interaction.reply({ embeds: [errorEmbed('Voice Channel Required', 'You must be in a voice channel to shuffle tracks!')], flags: 64 });
    }

    const musicQueue = musicManager.getQueue(guild.id, interaction.client);

    const djCheck = checkDjPermission(member, guild, { queue: musicQueue, ownTrackOnly: false });

    if (!djCheck.allowed) {

      return interaction.reply({ embeds: [errorEmbed('DJ Only', djCheck.reason)], flags: 64 });

    }
    if (!musicQueue || musicQueue.queue.length < 2) {
      return interaction.reply({ embeds: [errorEmbed('Not Enough Tracks', 'You need at least 2 songs in the queue to shuffle!')], flags: 64 });
    }

    // Fisher-Yates shuffle
    for (let i = musicQueue.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [musicQueue.queue[i], musicQueue.queue[j]] = [musicQueue.queue[j], musicQueue.queue[i]];
    }

    musicQueue.invalidatePrefetch();
    musicQueue.persistQueue();
    musicQueue.prefetchNext().catch(() => {});
    await musicQueue.updatePanel();

    return interaction.reply({
      embeds: [successEmbed('Shuffled', `Shuffled **${musicQueue.queue.length}** songs.`)]
    });
  }
};
