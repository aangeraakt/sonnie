const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { createEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addxp')
    .setDescription('Give XP to a user (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(opt => opt.setName('user').setDescription('The user to give XP to').setRequired(true))
    .addIntegerOption(opt => opt.setName('amount').setDescription('Amount of XP to give').setRequired(true)),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    const result = db.addXP(interaction.guild.id, targetUser.id, amount);

    const embed = createEmbed({
      title: '⭐ Added XP',
      description: `Added **${amount} XP** to <@${targetUser.id}>!\n\nNew total: **${result.xp} XP** (Level **${result.level}**)`,
      color: 0x00FF00
    });

    return interaction.reply({ embeds: [embed] });
  }
};
