const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { getDeleted, MAX_PER_CHANNEL } = require('../../utils/snipeStore');
const { checkStaffPermission } = require('../../utils/staffSecurity');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('snipe')
    .setDescription('Show a recently deleted message from this channel')
    .addIntegerOption(opt =>
      opt.setName('index')
        .setDescription(`How far back to look (1 = most recent, max ${MAX_PER_CHANNEL})`)
        .setMinValue(1)
        .setMaxValue(MAX_PER_CHANNEL)
        .setRequired(false)
    ),

  async execute(interaction) {
    // Deleted messages can contain anything, so keep this to staff.
    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission Denied', 'You need `Manage Messages` to snipe deleted messages.')],
        flags: 64
      });
    }

    const index = (interaction.options.getInteger('index') || 1) - 1;
    const { entry, total } = getDeleted(interaction.channel.id, index);

    if (!entry) {
      return interaction.reply({
        embeds: [errorEmbed('Nothing to Snipe', total
          ? `Only **${total}** deleted message${total === 1 ? ' is' : 's are'} remembered in this channel.`
          : 'No deleted messages are remembered in this channel. I only keep the last 10 per channel, for 2 hours.')],
        flags: 64
      });
    }

    const embed = createEmbed({
      title: 'Deleted Message',
      description: entry.content || '*No text content*',
      authorName: entry.authorTag,
      authorIcon: entry.authorAvatar || undefined,
      fields: [
        { name: 'Author', value: entry.authorId ? `<@${entry.authorId}>` : '`Unknown`', inline: true },
        { name: 'Sent', value: `<t:${Math.floor(entry.originallyAt / 1000)}:R>`, inline: true },
        { name: 'Deleted', value: `<t:${Math.floor(entry.at / 1000)}:R>`, inline: true }
      ],
      footerText: `${index + 1} of ${total} remembered here`
    });

    if (entry.attachments?.length) {
      const image = entry.attachments.find((url) => /\.(png|jpe?g|gif|webp)/i.test(url));
      if (image) embed.setImage(image);
      embed.addFields({ name: `Attachments (${entry.attachments.length})`, value: entry.attachments.join('\n').slice(0, 1000) });
    }

    return interaction.reply({ embeds: [embed] });
  }
};
