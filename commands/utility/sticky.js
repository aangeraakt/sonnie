const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed, createEmbed } = require('../../utils/embedBuilder');
const { checkStaffPermission } = require('../../utils/staffSecurity');

async function postSticky(channel, content) {
  const message = await channel.send({
    embeds: [createEmbed({ title: 'Sticky', description: content })]
  });
  return message;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sticky')
    .setDescription('Keep a message at the bottom of this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Set the sticky message')
        .addStringOption((opt) => opt.setName('text').setDescription('Sticky text').setRequired(true).setMaxLength(1800))
    )
    .addSubcommand((sub) => sub.setName('remove').setDescription('Remove the sticky message')),

  async execute(interaction) {
    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission Denied', 'You need Manage Messages to manage stickies.')],
        flags: 64
      });
    }

    const sub = interaction.options.getSubcommand();
    const existing = db.getSticky(interaction.channel.id);

    if (sub === 'remove') {
      if (existing?.last_message_id) {
        const old = await interaction.channel.messages.fetch(existing.last_message_id).catch(() => null);
        if (old) await old.delete().catch(() => {});
      }
      db.deleteSticky(interaction.channel.id);
      return interaction.reply({ embeds: [successEmbed('Sticky Removed', 'This channel no longer has a sticky message.')] });
    }

    const content = interaction.options.getString('text');
    if (existing?.last_message_id) {
      const old = await interaction.channel.messages.fetch(existing.last_message_id).catch(() => null);
      if (old) await old.delete().catch(() => {});
    }
    const message = await postSticky(interaction.channel, content);
    db.setSticky(interaction.channel.id, {
      guild_id: interaction.guild.id,
      content,
      last_message_id: message.id
    });
    return interaction.reply({ embeds: [successEmbed('Sticky Set', 'That message will stay at the bottom of this channel.')], flags: 64 });
  }
};
