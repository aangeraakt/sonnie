const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../../utils/musicManager');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { checkDjPermission } = require('../../utils/djRole');

/** Accepts "90", "1:30", or "1:02:03". */
function parsePosition(input) {
  const text = String(input).trim();
  if (/^\d+$/.test(text)) return Number(text);

  const parts = text.split(':').map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function format(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Jump to a position in the current track')
    .addStringOption(opt =>
      opt.setName('position')
        .setDescription('Position as seconds or mm:ss, or +30 / -15 to jump relative')
        .setRequired(true)
    ),

  async execute(interaction) {
    const { guild, member } = interaction;

    if (!musicManager.hasQueue(guild.id)) {
      return interaction.reply({ embeds: [errorEmbed('Nothing Playing', 'There is no track to seek in.')], flags: 64 });
    }

    const queue = musicManager.getQueue(guild.id, interaction.client);
    if (!queue.currentTrack) {
      return interaction.reply({ embeds: [errorEmbed('Nothing Playing', 'There is no track to seek in.')], flags: 64 });
    }
    if (queue.isRadioMode) {
      return interaction.reply({ embeds: [errorEmbed('Live Radio', 'You cannot seek inside a live radio stream.')], flags: 64 });
    }
    if (!member.voice?.channelId || member.voice.channelId !== queue.voiceChannelId) {
      return interaction.reply({ embeds: [errorEmbed('Wrong Channel', 'Join the voice channel I am playing in first.')], flags: 64 });
    }

    const permission = checkDjPermission(member, guild, { queue, ownTrackOnly: true });
    if (!permission.allowed) {
      return interaction.reply({ embeds: [errorEmbed('DJ Only', permission.reason)], flags: 64 });
    }

    const raw = interaction.options.getString('position').trim();
    const current = queue.getPositionSeconds();
    let target;

    if (/^[+-]/.test(raw)) {
      const delta = parsePosition(raw.slice(1));
      if (delta === null) {
        return interaction.reply({ embeds: [errorEmbed('Invalid Position', 'Use `+30`, `-15`, `90`, or `1:30`.')], flags: 64 });
      }
      target = raw.startsWith('+') ? current + delta : current - delta;
    } else {
      target = parsePosition(raw);
    }

    if (target === null || Number.isNaN(target)) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Position', 'Use seconds (`90`), `mm:ss` (`1:30`), or a relative jump (`+30`, `-15`).')], flags: 64 });
    }

    target = Math.max(0, Math.floor(target));
    const duration = Math.floor((queue.currentDurationMs || 0) / 1000);
    if (duration && target >= duration) {
      return interaction.reply({
        embeds: [errorEmbed('Past the End', `**${queue.currentTrack.title}** is only ${format(duration)} long. Use \`/music skip\` to move on.`)],
        flags: 64
      });
    }

    await interaction.deferReply();

    const ok = await queue.seekTo(target).catch(() => false);
    if (!ok) {
      return interaction.editReply({ embeds: [errorEmbed('Seek Failed', 'I could not restart the track at that position.')] });
    }

    return interaction.editReply({
      embeds: [successEmbed('Seeked',
        `**${queue.currentTrack.title}** is now playing from **${format(target)}**${duration ? ` of ${format(duration)}` : ''}.\n\n` +
        'Seeking re-decodes from the start, so long jumps take a moment to settle.')]
    });
  }
};
