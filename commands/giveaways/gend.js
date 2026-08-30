const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embedBuilder');
const { collectParticipants, pickWinners, endedEmbed } = require('../../utils/giveawayHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gend')
    .setDescription('End an active giveaway early')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) => opt.setName('message_id').setDescription('Giveaway message ID').setRequired(true)),

  async execute(interaction) {
    const messageId = interaction.options.getString('message_id');
    const giveaway = db.getGiveaway(messageId);

    if (!giveaway) {
      return interaction.reply({ embeds: [errorEmbed('Not Found', 'No giveaway found with that message ID.')], flags: 64 });
    }

    if (giveaway.ended) {
      return interaction.reply({ embeds: [errorEmbed('Already Ended', 'This giveaway has already ended.')], flags: 64 });
    }

    db.endGiveaway(messageId);

    const channel = interaction.guild.channels.cache.get(giveaway.channel_id) || interaction.channel;
    const msg = await channel.messages.fetch(messageId).catch(() => null);
    const pool = await collectParticipants(giveaway, msg);

    if (pool.length === 0) {
      return interaction.reply({ embeds: [infoEmbed('Giveaway Ended 📭', `Ended giveaway \`${messageId}\`, but nobody entered.`)] });
    }

    const winners = pickWinners(pool, giveaway.winners_count);
    const winnersText = winners.map((id) => `<@${id}>`).join(', ');
    const embed = endedEmbed(giveaway.prize, winnersText, giveaway.hosted_by);

    if (msg) {
      await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
    }

    await channel.send({ content: `🎊 Congratulations ${winnersText}! You won **${giveaway.prize}**!`, embeds: [embed] });
    return interaction.reply({ embeds: [successEmbed('Giveaway Ended 🛑', `Giveaway \`${messageId}\` has been ended.`)] });
  }
};
