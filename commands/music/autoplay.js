const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../../utils/musicManager');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { checkDjPermission } = require('../../utils/djRole');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autoplay')
    .setDescription('Keep playing related tracks when the queue runs out')
    .addBooleanOption(opt => opt.setName('enabled').setDescription('Turn autoplay on or off').setRequired(true)),

  async execute(interaction) {
    const { guild, member } = interaction;

    if (!musicManager.hasQueue(guild.id)) {
      return interaction.reply({ embeds: [errorEmbed('Nothing Playing', 'Start some music first with `/music play`.')], flags: 64 });
    }

    const queue = musicManager.getQueue(guild.id, interaction.client);
    const permission = checkDjPermission(member, guild, { queue });
    if (!permission.allowed) {
      return interaction.reply({ embeds: [errorEmbed('DJ Only', permission.reason)], flags: 64 });
    }

    const enabled = interaction.options.getBoolean('enabled');
    queue.autoplay = enabled;
    queue.persistQueue();

    return interaction.reply({
      embeds: [successEmbed('Autoplay Updated', enabled
        ? 'When the queue empties I will keep going with tracks related to the last one played.\n\nA 24/7 radio station, if one is configured, still takes priority once I run out of ideas.'
        : 'Autoplay is off. I will stop when the queue empties.')]
    });
  }
};
