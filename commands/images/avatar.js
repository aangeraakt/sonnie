const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Display and download full-resolution avatar of a user')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('The user whose avatar you want to view')
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;

    const pngUrl = targetUser.displayAvatarURL({ extension: 'png', size: 1024, forceStatic: true });
    const jpgUrl = targetUser.displayAvatarURL({ extension: 'jpg', size: 1024, forceStatic: true });
    const webpUrl = targetUser.displayAvatarURL({ extension: 'webp', size: 1024, forceStatic: true });
    const fullResUrl = targetUser.displayAvatarURL({ extension: 'png', size: 4096 });

    const isAnimated = targetUser.avatar && targetUser.avatar.startsWith('a_');
    const gifUrl = isAnimated ? targetUser.displayAvatarURL({ extension: 'gif', size: 1024 }) : null;

    const embed = createEmbed({
      title: `🖼️ Avatar of ${targetUser.tag}`,
      description: `[PNG](${pngUrl}) • [JPG](${jpgUrl}) • [WEBP](${webpUrl}) • [4K High-Res](${fullResUrl})${gifUrl ? ` • [GIF](${gifUrl})` : ''}`,
      color: 0x7289DA,
      footerText: 'Sonnies Image • Avatar Viewer'
    });

    embed.setImage(fullResUrl);

    const btn = new ButtonBuilder()
      .setLabel('Open High-Res (4096px)')
      .setURL(fullResUrl)
      .setStyle(ButtonStyle.Link)
      .setEmoji('🔍');

    const row = new ActionRowBuilder().addComponents(btn);

    return interaction.reply({ embeds: [embed], components: [row] });
  }
};
