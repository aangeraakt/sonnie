const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEmbed, successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { checkStaffPermission } = require('../../utils/staffSecurity');

const CUSTOM_EMOJI = /<(a)?:(\w{2,32}):(\d{17,20})>/;

function emojiUrl(id, animated) {
  return `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=256`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('emoji')
    .setDescription('Inspect, steal, and manage custom emojis')
    .addSubcommand(sub =>
      sub.setName('info')
        .setDescription('Show details and the full-size image for an emoji')
        .addStringOption(opt => opt.setName('emoji').setDescription('A custom emoji, or its ID').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('steal')
        .setDescription('Copy an emoji from another server into this one')
        .addStringOption(opt => opt.setName('emoji').setDescription('A custom emoji, or its ID').setRequired(true))
        .addStringOption(opt => opt.setName('name').setDescription('Name for the new emoji (2-32 characters)').setMinLength(2).setMaxLength(32).setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Delete a custom emoji from this server')
        .addStringOption(opt => opt.setName('emoji').setDescription('An emoji from this server, or its ID').setRequired(true))
    )
    .addSubcommand(sub => sub.setName('list').setDescription('List every custom emoji in this server')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const emojis = interaction.guild.emojis.cache;
      if (!emojis.size) {
        return interaction.reply({ embeds: [errorEmbed('No Emojis', 'This server has no custom emojis.')], flags: 64 });
      }

      const statik = emojis.filter((item) => !item.animated);
      const animated = emojis.filter((item) => item.animated);

      return interaction.reply({
        embeds: [createEmbed({
          title: `Custom Emojis - ${interaction.guild.name}`,
          fields: [
            { name: `Static (${statik.size})`, value: statik.map((item) => `${item}`).join(' ').slice(0, 1020) || '`None`' },
            { name: `Animated (${animated.size})`, value: animated.map((item) => `${item}`).join(' ').slice(0, 1020) || '`None`' }
          ],
          footerText: `${emojis.size} total`
        })]
      });
    }

    const input = interaction.options.getString('emoji').trim();
    const match = CUSTOM_EMOJI.exec(input);
    const id = match ? match[3] : (/^\d{17,20}$/.test(input) ? input : null);

    if (!id) {
      return interaction.reply({
        embeds: [errorEmbed('Not a Custom Emoji', 'Provide a custom emoji (like `:pepe:` from any server) or its numeric ID. Standard Unicode emojis cannot be copied.')],
        flags: 64
      });
    }

    const animated = match ? Boolean(match[1]) : false;
    const name = match ? match[2] : `emoji_${id.slice(-6)}`;

    if (sub === 'info') {
      const local = interaction.guild.emojis.cache.get(id);
      const url = local ? local.imageURL({ size: 256 }) : emojiUrl(id, animated);

      return interaction.reply({
        embeds: [createEmbed({
          title: `Emoji - ${local?.name || name}`,
          image: url,
          url,
          fields: [
            { name: 'Name', value: `\`${local?.name || name}\``, inline: true },
            { name: 'Animated', value: (local?.animated ?? animated) ? 'Yes' : 'No', inline: true },
            { name: 'From This Server', value: local ? 'Yes' : 'No', inline: true },
            { name: 'Usage', value: `\`<${(local?.animated ?? animated) ? 'a' : ''}:${local?.name || name}:${id}>\``, inline: false },
            { name: 'Direct Link', value: `[Open full size](${url})`, inline: false }
          ],
          footerText: `Emoji ID: ${id}`
        })]
      });
    }

    // steal and delete both change the server, so they need permission.
    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.ManageGuildExpressions)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission Denied', 'You need `Manage Expressions` to add or remove emojis.')],
        flags: 64
      });
    }

    const me = interaction.guild.members.me;
    if (me && !me.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return interaction.reply({ embeds: [errorEmbed('Missing Permission', 'I need the **Manage Expressions** permission.')], flags: 64 });
    }

    if (sub === 'delete') {
      const local = interaction.guild.emojis.cache.get(id);
      if (!local) {
        return interaction.reply({ embeds: [errorEmbed('Not Found Here', 'That emoji does not belong to this server.')], flags: 64 });
      }
      const deletedName = local.name;
      const ok = await local.delete(`Deleted by ${interaction.user.tag}`).then(() => true).catch(() => false);
      return interaction.reply({
        embeds: ok
          ? [successEmbed('Emoji Deleted', `Removed \`:${deletedName}:\` from this server.`)]
          : [errorEmbed('Delete Failed', 'Discord rejected the deletion.')],
        flags: ok ? undefined : 64
      });
    }

    // steal
    if (interaction.guild.emojis.cache.has(id)) {
      return interaction.reply({ embeds: [errorEmbed('Already Here', 'That emoji is already in this server.')], flags: 64 });
    }

    const requested = interaction.options.getString('name') || name;
    const cleanName = requested.replace(/[^\w]/g, '_').slice(0, 32);
    if (cleanName.length < 2) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Name', 'Emoji names must be 2-32 characters of letters, numbers, or underscores.')], flags: 64 });
    }

    await interaction.deferReply();

    try {
      const created = await interaction.guild.emojis.create({
        attachment: emojiUrl(id, animated),
        name: cleanName,
        reason: `Added by ${interaction.user.tag} via /tools emoji steal`
      });

      return interaction.editReply({
        embeds: [successEmbed('Emoji Added', `${created} is now available as \`:${created.name}:\`.`)]
      });
    } catch (err) {
      const reason = /Maximum number of emojis/i.test(err.message)
        ? 'This server has reached its emoji limit. Boost the server or remove one first.'
        : 'Discord rejected the upload. The image may be too large (256 KB limit) or the ID may be wrong.';
      return interaction.editReply({ embeds: [errorEmbed('Could Not Add Emoji', reason)] });
    }
  }
};
