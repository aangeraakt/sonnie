const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { checkStaffPermission } = require('../../utils/staffSecurity');
const { pollEmbed, pollButtons } = require('../../utils/voteButtons');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a vote with up to 5 options')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((opt) => opt.setName('question').setDescription('Poll question').setRequired(true).setMaxLength(256))
    .addStringOption((opt) => opt.setName('options').setDescription('Options separated by |').setRequired(true)),

  async execute(interaction) {
    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission Denied', 'You need Manage Messages to create polls.')],
        flags: 64
      });
    }

    const question = interaction.options.getString('question');
    const options = interaction.options.getString('options')
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 5);

    if (options.length < 2) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid Options', 'Provide at least two options separated by `|`.')],
        flags: 64
      });
    }

    const data = {
      guild_id: interaction.guild.id,
      channel_id: interaction.channel.id,
      question,
      options: options.map((label) => ({ label: label.slice(0, 80), voters: [] }))
    };
    const message = await interaction.channel.send({
      embeds: [pollEmbed(data)],
      components: [pollButtons(data)]
    });
    db.addPoll({ ...data, message_id: message.id });
    return interaction.reply({ embeds: [successEmbed('Poll Posted', 'Members can vote with the buttons.')], flags: 64 });
  }
};
