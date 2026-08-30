const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { parseDuration, runningEmbed, enterRow } = require('../../utils/giveawayHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gstart')
    .setDescription('Start a new giveaway')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) => opt.setName('duration').setDescription('Duration (e.g. 10m, 2h, 1d)').setRequired(true))
    .addIntegerOption((opt) => opt.setName('winners').setDescription('Number of winners').setMinValue(1).setMaxValue(10).setRequired(true))
    .addStringOption((opt) => opt.setName('prize').setDescription('Prize to win').setRequired(true))
    .addChannelOption((opt) => opt.setName('channel').setDescription('Channel to host the giveaway in').addChannelTypes(ChannelType.GuildText).setRequired(false)),

  async execute(interaction) {
    const durationStr = interaction.options.getString('duration');
    const ms = parseDuration(durationStr);

    if (!ms) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Duration', 'Please use a valid format like `10m`, `2h`, or `1d`.')], flags: 64 });
    }

    const winnersCount = interaction.options.getInteger('winners');
    const prize = interaction.options.getString('prize');
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const endTime = Date.now() + ms;
    const endTimestamp = Math.floor(endTime / 1000);

    const msg = await channel.send({
      embeds: [runningEmbed(prize, winnersCount, interaction.user, endTimestamp)],
      components: [enterRow()]
    });

    db.createGiveaway(msg.id, channel.id, interaction.guild.id, prize, winnersCount, endTime, interaction.user.id);

    return interaction.reply({
      embeds: [successEmbed('Giveaway Started! 🎉', `Giveaway for **${prize}** is live in ${channel}!`)],
      flags: 64
    });
  }
};
