const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { Jimp } = require('jimp');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');
const Logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deepfry')
    .setDescription('Deepfry an image or user avatar with maximum crunch and saturation')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('User whose avatar you want to deepfry')
        .setRequired(false)
    )
    .addAttachmentOption(opt =>
      opt.setName('image')
        .setDescription('Upload an image to deepfry')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('url')
        .setDescription('Direct image URL to deepfry')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const targetUser = interaction.options.getUser('user');
    const attachment = interaction.options.getAttachment('image');
    const inputUrl = interaction.options.getString('url');

    let imageUrl = null;
    if (attachment) {
      imageUrl = attachment.url;
    } else if (inputUrl) {
      imageUrl = inputUrl;
    } else if (targetUser) {
      imageUrl = targetUser.displayAvatarURL({ extension: 'png', size: 512, forceStatic: true });
    } else {
      imageUrl = interaction.user.displayAvatarURL({ extension: 'png', size: 512, forceStatic: true });
    }

    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        return interaction.editReply({ embeds: [errorEmbed('Failed to Fetch Image', 'Could not download the requested image.')] });
      }

      const arrayBuffer = await response.arrayBuffer();
      const inputBuffer = Buffer.from(arrayBuffer);

      const image = await Jimp.read(inputBuffer);

      // Resize if too large
      if (image.width > 600 || image.height > 600) {
        image.resize({ w: 500, h: 500 });
      }

      // Apply deepfry saturation and color crunch
      image.contrast(0.7);
      image.brightness(0.12);
      image.posterize(4);

      // Add noise / red-yellow channel crunch by pixel manipulation
      image.scan(0, 0, image.width, image.height, (x, y, idx) => {
        const r = image.bitmap.data[idx + 0];
        const g = image.bitmap.data[idx + 1];
        const b = image.bitmap.data[idx + 2];

        // Boost reds and warm tones, reduce blues
        const noise = (Math.random() - 0.5) * 40;
        image.bitmap.data[idx + 0] = Math.min(255, Math.max(0, Math.floor(r * 1.35 + noise)));
        image.bitmap.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 1.1 + noise)));
        image.bitmap.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 0.7 + noise)));
      });

      // Extra contrast punch
      image.contrast(0.4);

      // Export as crunchy low-quality JPEG
      const outputBuffer = await image.getBuffer('image/jpeg', { quality: 28 });
      const discordFile = new AttachmentBuilder(outputBuffer, { name: 'deepfried.jpg' });

      const embed = createEmbed({
        title: '🔥 DEEP FRIED 🔥',
        description: 'Here is your extra crispy deep-fried image! 🍟👌💯',
        color: 0xE74C3C,
        footerText: 'Sonnies Image Manipulation • Maximum Crunch'
      });

      embed.setImage('attachment://deepfried.jpg');

      return interaction.editReply({ embeds: [embed], files: [discordFile] });
    } catch (err) {
      Logger.error('Deepfry error:', err);
      return interaction.editReply({ embeds: [errorEmbed('Deepfry Failed', `Could not deepfry image: ${err.message}`)] });
    }
  }
};
