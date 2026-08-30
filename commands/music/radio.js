const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const musicManager = require('../../utils/musicManager');
const { createEmbed, successEmbed, errorEmbed, infoEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('radio')
    .setDescription('Play, stop, or check 24/7 radio')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub
        .setName('play')
        .setDescription('Start or resume the configured 24/7 radio station')
    )
    .addSubcommand(sub =>
      sub
        .setName('stop')
        .setDescription('Stop the 24/7 radio station and leave voice')
    )
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('Check current 24/7 radio configuration and status')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const { guild, client } = interaction;

    if (subcommand === 'play') {
      const radioCfg = db.getRadioConfig(guild.id);
      if (!radioCfg || !radioCfg.channel_id || !radioCfg.stream_url) {
        return interaction.reply({
          embeds: [errorEmbed('No Radio Configured', 'No 24/7 radio station is configured yet. Use `/config type:radio channel:#voice url:https://stream`.')],
          flags: 64
        });
      }

      await interaction.deferReply();

      db.setRadioConfig(guild.id, { ...radioCfg, active: true });
      const musicQueue = musicManager.getQueue(guild.id, client);
      await musicQueue.startRadio(radioCfg.channel_id, radioCfg.stream_url, radioCfg.station_name);

      return interaction.editReply({
        embeds: [successEmbed('24/7 Radio Started', `Streaming **${radioCfg.station_name}** in <#${radioCfg.channel_id}>.`)]
      });
    }

    if (subcommand === 'stop') {
      db.disableRadio(guild.id);
      const musicQueue = musicManager.getQueue(guild.id, client);
      musicQueue.destroy();

      return interaction.reply({
        embeds: [infoEmbed('24/7 Radio Stopped', '24/7 radio station playback stopped and disabled.')]
      });
    }

    if (subcommand === 'status') {
      const radioCfg = db.getRadioConfig(guild.id);
      if (!radioCfg) {
        return interaction.reply({
          embeds: [infoEmbed('Radio Status', 'No 24/7 radio station is configured on this server. Set one with `/config type:radio`.')],
          flags: 64
        });
      }

      const statusEmbed = createEmbed({
        title: '24/7 Radio Status',
        description: `**Station Name:** ${radioCfg.station_name}\n**Channel:** <#${radioCfg.channel_id}>\n**Stream URL:** \`${radioCfg.stream_url}\`\n**Active Status:** ${radioCfg.active ? 'ACTIVE (24/7)' : 'INACTIVE'}\n**Priority Override:** Enabled (Switches on \`/play\`, resumes on finish)`,
        footerText: 'Sonnies 24/7 Radio System'
      });

      return interaction.reply({ embeds: [statusEmbed] });
    }
  }
};
