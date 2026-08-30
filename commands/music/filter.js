const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../../utils/musicManager');
const { AUDIO_FILTERS } = require('../../utils/musicManager');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { checkDjPermission } = require('../../utils/djRole');

const CHOICES = Object.entries(AUDIO_FILTERS).map(([value, meta]) => ({ name: meta.label, value }));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('filter')
    .setDescription('Apply an audio effect to the music')
    .addStringOption(opt =>
      opt.setName('effect')
        .setDescription('Effect to apply. "None" clears it')
        .setRequired(true)
        .addChoices(...CHOICES)
    ),

  async execute(interaction) {
    const { guild, member } = interaction;

    if (!musicManager.hasQueue(guild.id)) {
      return interaction.reply({ embeds: [errorEmbed('Nothing Playing', 'Start some music first with `/music play`.')], flags: 64 });
    }

    const queue = musicManager.getQueue(guild.id, interaction.client);
    if (queue.isRadioMode) {
      return interaction.reply({ embeds: [errorEmbed('Live Radio', 'Filters cannot be applied to a live radio stream.')], flags: 64 });
    }
    if (!member.voice?.channelId || member.voice.channelId !== queue.voiceChannelId) {
      return interaction.reply({ embeds: [errorEmbed('Wrong Channel', 'Join the voice channel I am playing in first.')], flags: 64 });
    }

    const permission = checkDjPermission(member, guild, { queue });
    if (!permission.allowed) {
      return interaction.reply({ embeds: [errorEmbed('DJ Only', permission.reason)], flags: 64 });
    }

    const effect = interaction.options.getString('effect');
    if (effect === queue.filter) {
      return interaction.reply({
        embeds: [errorEmbed('Already Applied', `**${AUDIO_FILTERS[effect].label}** is already the active filter.`)],
        flags: 64
      });
    }

    await interaction.deferReply();

    const position = queue.getPositionSeconds();
    const ok = await queue.setFilter(effect).catch(() => false);

    if (!ok) {
      return interaction.editReply({ embeds: [errorEmbed('Filter Failed', 'I could not apply that effect.')] });
    }

    return interaction.editReply({
      embeds: [successEmbed('Filter Applied',
        `Audio effect set to **${AUDIO_FILTERS[effect].label}**.` +
        (queue.currentTrack ? `\n\n**${queue.currentTrack.title}** resumed from ${Math.floor(position / 60)}:${String(position % 60).padStart(2, '0')}.` : '') +
        '\n\nEffects are baked into the audio stream, so changing one restarts the current track at its position.')]
    });
  }
};
