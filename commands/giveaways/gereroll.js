const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { collectParticipants, pickWinners, rerollEmbed } = require('../../utils/giveawayHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gereroll')
    .setDescription('Reroll a winner for an ended giveaway')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) => opt.setName('message_id').setDescription('Giveaway message ID').setRequired(true)),

  async execute(interaction) {
    const messageId = interaction.options.getString('message_id');
    const giveaway = db.getGiveaway(messageId);

    if (!giveaway) {
      return interaction.reply({ embeds: [errorEmbed('Not Found', 'No giveaway found with that message ID.')], flags: 64 });
    }

    const channel = interaction.guild.channels.cache.get(giveaway.channel_id) || interaction.channel;
    const msg = await channel.messages.fetch(messageId).catch(() => null);
    const pool = await collectParticipants(giveaway, msg);

    if (pool.length === 0) {
      return interaction.reply({ embeds: [errorEmbed('Reroll Failed', 'No valid participants found to reroll!')], flags: 64 });
    }

    const [newWinner] = pickWinners(pool, 1);
    const embed = rerollEmbed(giveaway.prize, newWinner);

    await channel.send({ content: `🎲 New winner: <@${newWinner}>!`, embeds: [embed] });
    return interaction.reply({ embeds: [successEmbed('Reroll Complete 🎲', `Picked a new winner: <@${newWinner}>`)] });
  }
};
