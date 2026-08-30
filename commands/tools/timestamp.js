const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { parseDuration } = require('../../utils/punishmentEngine');

const FORMATS = [
  { code: 't', label: 'Short time' },
  { code: 'T', label: 'Long time' },
  { code: 'd', label: 'Short date' },
  { code: 'D', label: 'Long date' },
  { code: 'f', label: 'Short date/time' },
  { code: 'F', label: 'Long date/time' },
  { code: 'R', label: 'Relative' }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timestamp')
    .setDescription('Build a Discord timestamp that renders in every viewer\'s local timezone')
    .addStringOption(opt =>
      opt.setName('when')
        .setDescription('A relative offset like 2h or 3d, or an absolute date like 2026-12-25 18:30')
        .setRequired(false)
    ),

  async execute(interaction) {
    const input = interaction.options.getString('when');
    let target = Date.now();

    if (input) {
      const offset = parseDuration(input);
      if (offset) {
        target = Date.now() + offset;
      } else {
        const parsed = Date.parse(input.replace(' ', 'T'));
        if (Number.isNaN(parsed)) {
          return interaction.reply({
            embeds: [errorEmbed('Could Not Read That Time', 'Use a relative offset like `2h`, `30m`, `3d`, or an absolute date like `2026-12-25 18:30`.')],
            flags: 64
          });
        }
        target = parsed;
      }
    }

    const seconds = Math.floor(target / 1000);
    const rows = FORMATS.map((format) =>
      `**${format.label}** - \`<t:${seconds}:${format.code}>\` renders as <t:${seconds}:${format.code}>`
    );

    return interaction.reply({
      embeds: [createEmbed({
        title: 'Discord Timestamp',
        description: `Copy any code below into a message. Each viewer sees it in their own timezone.\n\n${rows.join('\n')}`,
        footerText: `Unix seconds: ${seconds}`
      })],
      flags: 64
    });
  }
};
