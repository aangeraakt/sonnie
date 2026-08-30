const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, successEmbed, infoEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View warning history for a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(opt => opt.setName('user').setDescription('The user to check').setRequired(true)),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const warnings = db.getWarnings(interaction.guild.id, targetUser.id);

    if (warnings.length === 0) {
      return interaction.reply({
        embeds: [infoEmbed('Warning History', `**${targetUser.tag}** has no active warnings.`)]
      });
    }

    const warningFields = warnings.slice(0, 10).map((w, index) => ({
      name: `Warning #${index + 1}${w.case_id ? ` · Case ${w.case_id}` : ''} - ${w.timestamp}`,
      value: `**Moderator:** <@${w.moderator_id}>\n**Reason:** ${w.reason}`,
      inline: false
    }));

    const embed = createEmbed({
      title: `⚠️ Warnings for ${targetUser.tag}`,
      description: `Total Warnings: **${warnings.length}**`,
      fields: warningFields
    });

    return interaction.reply({ embeds: [embed] });
  }
};
