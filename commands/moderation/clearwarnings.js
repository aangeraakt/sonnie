const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { checkStaffPermission } = require('../../utils/staffSecurity');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clearwarnings')
    .setDescription('Clear all warnings for a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(opt => opt.setName('user').setDescription('The user whose warnings will be cleared').setRequired(true)),

  async execute(interaction) {
    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission Denied', 'You need `Moderate Members` permissions to clear warnings.')],
        flags: 64
      });
    }

    const targetUser = interaction.options.getUser('user');
    db.clearWarnings(interaction.guild.id, targetUser.id);

    return interaction.reply({
      embeds: [successEmbed('Warnings Cleared 🧹', `Cleared all warning records for **${targetUser.tag}**.`)]
    });
  }
};
