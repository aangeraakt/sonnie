const { SlashCommandBuilder } = require('discord.js');
const { createEmbed } = require('../../utils/embedBuilder');

function resolveLatency(roundtripMs, apiPing) {
  const bot = Number.isFinite(roundtripMs) && roundtripMs >= 0 ? Math.round(roundtripMs) : 0;
  const api = Number.isFinite(apiPing) && apiPing >= 0 ? Math.round(apiPing) : bot;
  return { bot, api };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check the bot\'s latency and API ping'),

  async execute(interaction) {
    const start = Date.now();
    await interaction.reply({ content: 'Pinging...', flags: 64 });
    const { bot, api } = resolveLatency(Date.now() - start, interaction.client?.ws?.ping);

    const embed = createEmbed({
      title: 'Pong',
      fields: [
        { name: 'Bot Latency', value: `\`${bot} ms\``, inline: true },
        { name: 'API Latency', value: `\`${api} ms\``, inline: true }
      ]
    });

    return interaction.editReply({ content: null, embeds: [embed] });
  }
};
