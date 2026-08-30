const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed, infoEmbed } = require('../../utils/embedBuilder');
const { checkStaffPermission } = require('../../utils/staffSecurity');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('case')
    .setDescription('Look up a moderation case')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) =>
      sub
        .setName('view')
        .setDescription('View a case by ID')
        .addIntegerOption((opt) => opt.setName('id').setDescription('Case ID').setRequired(true).setMinValue(1))
    )
    .addSubcommand((sub) =>
      sub
        .setName('user')
        .setDescription('List cases for a user')
        .addUserOption((opt) => opt.setName('user').setDescription('User to look up').setRequired(true))
    ),

  async execute(interaction) {
    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission Denied', 'You need Moderate Members to view cases.')],
        flags: 64
      });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'view') {
      const item = db.getCase(interaction.guild.id, interaction.options.getInteger('id'));
      if (!item) {
        return interaction.reply({ embeds: [errorEmbed('Not Found', 'No case with that ID.')], flags: 64 });
      }
      return interaction.reply({
        embeds: [createEmbed({
          title: `Case #${item.id} · ${item.type}`,
          fields: [
            { name: 'User', value: `<@${item.user_id}>`, inline: true },
            { name: 'Moderator', value: `<@${item.moderator_id}>`, inline: true },
            { name: 'When', value: `<t:${Math.floor(new Date(item.timestamp).getTime() / 1000)}:f>`, inline: true },
            { name: 'Reason', value: item.reason || 'No reason provided', inline: false }
          ]
        })]
      });
    }

    const target = interaction.options.getUser('user');
    const cases = db.getCasesForUser(interaction.guild.id, target.id);
    if (!cases.length) {
      return interaction.reply({ embeds: [infoEmbed('Cases', `**${target.tag}** has no cases.`)] });
    }
    const lines = cases.slice(-15).reverse().map((item) => `\`${item.id}\` **${item.type}** — ${item.reason}`);
    return interaction.reply({
      embeds: [createEmbed({
        title: `Cases · ${target.tag}`,
        description: lines.join('\n')
      })]
    });
  }
};
