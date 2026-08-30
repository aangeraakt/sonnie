const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed, infoEmbed, createEmbed } = require('../../utils/embedBuilder');
const { checkStaffPermission } = require('../../utils/staffSecurity');

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tag')
    .setDescription('Saved replies for this server')
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create or update a tag')
        .addStringOption((opt) => opt.setName('name').setDescription('Tag name').setRequired(true))
        .addStringOption((opt) => opt.setName('content').setDescription('Tag content').setRequired(true).setMaxLength(1800))
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Delete a tag')
        .addStringOption((opt) => opt.setName('name').setDescription('Tag name').setRequired(true))
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('List tags'))
    .addSubcommand((sub) =>
      sub
        .setName('get')
        .setDescription('Post a tag')
        .addStringOption((opt) => opt.setName('name').setDescription('Tag name').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'list') {
      const tags = Object.keys(db.getTags(guildId));
      if (!tags.length) {
        return interaction.reply({ embeds: [infoEmbed('Tags', 'No tags yet. Create one with `/tag create`.')] });
      }
      return interaction.reply({
        embeds: [infoEmbed('Tags', tags.map((name) => `\`${name}\``).join(', '))]
      });
    }

    const name = normalizeName(interaction.options.getString('name'));
    if (!name) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Name', 'Use letters, numbers, `_` or `-`.')], flags: 64 });
    }

    if (sub === 'get') {
      const tag = db.getTag(guildId, name);
      if (!tag) {
        return interaction.reply({ embeds: [errorEmbed('Not Found', `No tag named \`${name}\`.`)], flags: 64 });
      }
      return interaction.reply({
        embeds: [createEmbed({ title: name, description: tag.content })]
      });
    }

    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission Denied', 'You need Manage Messages to edit tags.')],
        flags: 64
      });
    }

    if (sub === 'delete') {
      const existed = db.deleteTag(guildId, name);
      if (!existed) {
        return interaction.reply({ embeds: [errorEmbed('Not Found', `No tag named \`${name}\`.`)], flags: 64 });
      }
      return interaction.reply({ embeds: [successEmbed('Tag Deleted', `Removed \`${name}\`.`)] });
    }

    db.setTag(guildId, name, {
      content: interaction.options.getString('content'),
      author_id: interaction.user.id,
      created_at: Date.now()
    });
    return interaction.reply({ embeds: [successEmbed('Tag Saved', `Use \`/tag get\` or the server prefix plus \`${name}\`.`)] });
  }
};
