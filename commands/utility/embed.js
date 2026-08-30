const { SlashCommandBuilder, ChannelType, EmbedBuilder } = require('discord.js');
const { errorEmbed, successEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Create and post a custom rich embed with your info or custom styling')
    .addStringOption(opt =>
      opt.setName('title')
        .setDescription('Title for the embed')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('description')
        .setDescription('Description body text for the embed (supports markdown)')
        .setRequired(true)
    )
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('Channel to post the embed in (defaults to current channel)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('color')
        .setDescription('Hex color code (e.g. #5865F2, #57F287, #ED4245, #FEE75C, #9B59B6)')
        .setRequired(false)
    )
    .addBooleanOption(opt =>
      opt.setName('include_author')
        .setDescription('Display your name and avatar as the embed author (defaults to true)')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('thumbnail_url')
        .setDescription('Direct image URL to use as thumbnail')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('image_url')
        .setDescription('Direct image URL to display as large banner')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('footer')
        .setDescription('Custom footer text')
        .setRequired(false)
    ),

  async execute(interaction) {
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description').replace(/\\n/g, '\n');
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
    const colorHex = interaction.options.getString('color') || '#5865F2';
    const includeAuthor = interaction.options.getBoolean('include_author') ?? true;
    const thumbnailUrl = interaction.options.getString('thumbnail_url');
    const imageUrl = interaction.options.getString('image_url');
    const footerText = interaction.options.getString('footer');

    try {
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(colorHex.startsWith('#') ? parseInt(colorHex.replace('#', ''), 16) : 0x5865F2)
        .setTimestamp();

      if (includeAuthor) {
        embed.setAuthor({
          name: interaction.user.username,
          iconURL: interaction.user.displayAvatarURL({ dynamic: true })
        });
      }

      if (thumbnailUrl && (thumbnailUrl.startsWith('http://') || thumbnailUrl.startsWith('https://'))) {
        embed.setThumbnail(thumbnailUrl);
      }

      if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
        embed.setImage(imageUrl);
      }

      if (footerText) {
        embed.setFooter({ text: footerText });
      } else {
        embed.setFooter({ text: `Created by ${interaction.user.tag}` });
      }

      await targetChannel.send({ embeds: [embed] });

      return interaction.reply({
        embeds: [successEmbed('Embed Created', `Custom embed successfully posted to ${targetChannel}!`)],
        flags: 64
      });
    } catch (err) {
      return interaction.reply({
        embeds: [errorEmbed('Embed Creation Failed', `Could not create embed: ${err.message}`)],
        flags: 64
      });
    }
  }
};
