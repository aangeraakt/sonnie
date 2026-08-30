const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setxp')
    .setDescription('Set a user\'s XP to an exact amount (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((opt) => opt.setName('user').setDescription('The user to set XP for').setRequired(true))
    .addIntegerOption((opt) => opt.setName('amount').setDescription('XP amount to set').setMinValue(0).setRequired(true)),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    if (amount == null || amount < 0) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid Amount', 'XP must be 0 or higher.')],
        flags: 64
      });
    }

    const result = db.setXP(interaction.guild.id, targetUser.id, amount);

    const embed = createEmbed({
      title: '⭐ XP Updated',
      description: `Set <@${targetUser.id}> to **${result.xp} XP** (Level **${result.level}**).\nPreviously **${result.oldXP} XP** (Level **${result.oldLevel}**).`,
      color: 0x00FF00
    });

    return interaction.reply({ embeds: [embed] });
  }
};
