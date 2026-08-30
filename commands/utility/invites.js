const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed } = require('../../utils/embedBuilder');

function formatStats(stats) {
  const regular = Math.max(0, (stats.joins || 0) - (stats.left || 0) - (stats.fake || 0));
  return `Joins **${stats.joins || 0}** · Left **${stats.left || 0}** · Fake **${stats.fake || 0}** · Regular **${regular}**`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Invite stats for this server')
    .addUserOption((opt) => opt.setName('user').setDescription('Member to check')),

  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const stats = db.getInviteStats(interaction.guild.id, target.id);
    return interaction.reply({
      embeds: [
        createEmbed({
          title: `Invites · ${target.tag}`,
          description: formatStats(stats),
          thumbnail: target.displayAvatarURL()
        })
      ]
    });
  }
};
