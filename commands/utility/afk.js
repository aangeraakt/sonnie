const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, infoEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Mark yourself AFK')
    .addStringOption((opt) => opt.setName('reason').setDescription('AFK reason').setMaxLength(200)),

  async execute(interaction) {
    const existing = db.getAfk(interaction.guild.id, interaction.user.id);
    if (existing && !interaction.options.getString('reason')) {
      db.clearAfk(interaction.guild.id, interaction.user.id);
      return interaction.reply({ embeds: [successEmbed('Welcome Back', 'Your AFK status was cleared.')] });
    }

    const reason = interaction.options.getString('reason') || 'AFK';
    db.setAfk(interaction.guild.id, interaction.user.id, reason);
    return interaction.reply({
      embeds: [infoEmbed('AFK Set', `You are now AFK: ${reason}\nSend a message or run \`/afk\` again to clear it.`)]
    });
  }
};
