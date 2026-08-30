const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('firstmessage')
    .setDescription('Jump to the very first message sent in a channel')
    .addChannelOption(opt => opt.setName('channel').setDescription('Channel to look in (default: this one)').setRequired(false)),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    if (!channel.isTextBased?.()) {
      return interaction.reply({ embeds: [errorEmbed('Not a Text Channel', 'Pick a channel that holds messages.')], flags: 64 });
    }

    const me = interaction.guild.members.me;
    if (me && !channel.permissionsFor(me)?.has('ReadMessageHistory')) {
      return interaction.reply({ embeds: [errorEmbed('Cannot Read History', `I need **Read Message History** in ${channel}.`)], flags: 64 });
    }

    await interaction.deferReply();

    // Fetching "after" the zero snowflake returns the oldest message.
    const messages = await channel.messages.fetch({ after: '0', limit: 1 }).catch(() => null);
    const first = messages?.first();

    if (!first) {
      return interaction.editReply({ embeds: [errorEmbed('Nothing Found', `I could not read any messages in ${channel}.`)] });
    }

    const embed = createEmbed({
      title: 'First Message',
      url: first.url,
      description: first.content?.slice(0, 2000) || '*No text content*',
      authorName: first.author.tag,
      authorIcon: first.author.displayAvatarURL({ dynamic: true }),
      fields: [
        { name: 'Channel', value: `${channel}`, inline: true },
        { name: 'Sent', value: `<t:${Math.floor(first.createdTimestamp / 1000)}:F>`, inline: true },
        { name: 'Jump', value: `[Go to message](${first.url})`, inline: true }
      ]
    });

    const image = [...first.attachments.values()].find((item) => /\.(png|jpe?g|gif|webp)/i.test(item.url));
    if (image) embed.setImage(image.url);

    return interaction.editReply({ embeds: [embed] });
  }
};
