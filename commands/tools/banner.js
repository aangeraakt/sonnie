const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('banner')
    .setDescription('Show a profile banner, or the server banner')
    .addUserOption(opt => opt.setName('user').setDescription('User whose banner to show (default: you)').setRequired(false))
    .addBooleanOption(opt => opt.setName('server').setDescription('Show the server banner instead').setRequired(false)),

  async execute(interaction) {
    const wantsServer = interaction.options.getBoolean('server') || false;

    if (wantsServer) {
      const url = interaction.guild.bannerURL({ size: 4096, extension: 'png' });
      if (!url) {
        return interaction.reply({
          embeds: [errorEmbed('No Server Banner', 'This server has no banner. Server banners need boost level 2.')],
          flags: 64
        });
      }
      return interaction.reply({
        embeds: [createEmbed({ title: `${interaction.guild.name} - Server Banner`, image: url, url })]
      });
    }

    const target = interaction.options.getUser('user') || interaction.user;

    // Banners are not on the cached user object, so force a fresh fetch.
    const fetched = await interaction.client.users.fetch(target.id, { force: true }).catch(() => null);
    const url = fetched?.bannerURL({ size: 4096, extension: 'png' });

    if (!url) {
      return interaction.reply({
        embeds: [errorEmbed('No Banner', `**${target.tag}** has no profile banner set. Profile banners require Discord Nitro.`)],
        flags: 64
      });
    }

    return interaction.reply({
      embeds: [createEmbed({
        title: `${target.username} - Profile Banner`,
        image: url,
        url,
        authorName: target.tag,
        authorIcon: target.displayAvatarURL({ dynamic: true })
      })]
    });
  }
};
