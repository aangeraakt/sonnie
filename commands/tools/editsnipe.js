const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { getEdited, MAX_PER_CHANNEL } = require('../../utils/snipeStore');
const { checkStaffPermission } = require('../../utils/staffSecurity');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('editsnipe')
    .setDescription('Show what a recently edited message said before the edit')
    .addIntegerOption(opt =>
      opt.setName('index')
        .setDescription(`How far back to look (1 = most recent, max ${MAX_PER_CHANNEL})`)
        .setMinValue(1)
        .setMaxValue(MAX_PER_CHANNEL)
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission Denied', 'You need `Manage Messages` to snipe edited messages.')],
        flags: 64
      });
    }

    const index = (interaction.options.getInteger('index') || 1) - 1;
    const { entry, total } = getEdited(interaction.channel.id, index);

    if (!entry) {
      return interaction.reply({
        embeds: [errorEmbed('Nothing to Snipe', total
          ? `Only **${total}** edited message${total === 1 ? ' is' : 's are'} remembered in this channel.`
          : 'No edited messages are remembered in this channel. I only keep the last 10 per channel, for 2 hours.')],
        flags: 64
      });
    }

    return interaction.reply({
      embeds: [createEmbed({
        title: 'Edited Message',
        url: entry.url,
        authorName: entry.authorTag,
        authorIcon: entry.authorAvatar || undefined,
        fields: [
          { name: 'Author', value: `<@${entry.authorId}>`, inline: true },
          { name: 'Edited', value: `<t:${Math.floor(entry.at / 1000)}:R>`, inline: true },
          { name: 'Before', value: entry.before.slice(0, 1000) || '*empty*' },
          { name: 'After', value: entry.after.slice(0, 1000) || '*empty*' }
        ],
        footerText: `${index + 1} of ${total} remembered here`
      })]
    });
  }
};
