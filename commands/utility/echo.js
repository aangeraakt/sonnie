const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { errorEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('echo')
    .setDescription('Echo a message through the bot into any channel')
    .addStringOption(opt =>
      opt.setName('text')
        .setDescription('The text message to echo')
        .setRequired(true)
    )
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('Channel to send message in (defaults to current channel)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    ),

  async execute(interaction) {
    const text = interaction.options.getString('text');
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

    if (!text) {
      return interaction.reply({
        embeds: [errorEmbed('Echo Failed', 'Provide text to echo.')],
        flags: 64
      });
    }

    try {
      await targetChannel.send({ content: text });
    } catch (err) {
      return interaction.reply({
        embeds: [errorEmbed('Echo Failed', `Could not send message to ${targetChannel}: ${err.message}`)],
        flags: 64
      });
    }

    if (interaction.sourceMessage) {
      await interaction.sourceMessage.delete().catch(() => {});
      return;
    }

    await interaction.deferReply({ flags: 64 });
    if (typeof interaction.deleteReply === 'function') {
      await interaction.deleteReply().catch(() => {});
    }
  }
};
