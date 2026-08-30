const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { checkStaffPermission } = require('../../utils/staffSecurity');
const { suggestionEmbed, suggestionButtons } = require('../../utils/voteButtons');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Submit or moderate suggestions')
    .addSubcommand((sub) =>
      sub
        .setName('post')
        .setDescription('Post a suggestion')
        .addStringOption((opt) => opt.setName('text').setDescription('Your suggestion').setRequired(true).setMaxLength(1000))
    )
    .addSubcommand((sub) =>
      sub
        .setName('accept')
        .setDescription('Accept a suggestion')
        .addStringOption((opt) => opt.setName('message_id').setDescription('Suggestion message ID').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('deny')
        .setDescription('Deny a suggestion')
        .addStringOption((opt) => opt.setName('message_id').setDescription('Suggestion message ID').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('implement')
        .setDescription('Mark a suggestion as implemented')
        .addStringOption((opt) => opt.setName('message_id').setDescription('Suggestion message ID').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'post') {
      const cfg = db.getGuildConfig(interaction.guild.id);
      const channel = cfg.suggestions_channel_id
        ? interaction.guild.channels.cache.get(cfg.suggestions_channel_id)
        : interaction.channel;
      if (!channel?.send) {
        return interaction.reply({
          embeds: [errorEmbed('Not Configured', 'Set a suggestions channel with `/config type:suggestions`.')],
          flags: 64
        });
      }

      const content = interaction.options.getString('text');
      const payload = {
        user_id: interaction.user.id,
        author_tag: interaction.user.tag,
        content,
        status: 'open',
        up: [],
        down: []
      };
      const message = await channel.send({
        embeds: [suggestionEmbed({ ...payload, message_id: 'pending' })],
        components: [suggestionButtons()]
      });
      db.addSuggestion({ ...payload, message_id: message.id, channel_id: channel.id, guild_id: interaction.guild.id });
      return interaction.reply({
        embeds: [successEmbed('Suggestion Posted', `Posted in ${channel}.`)],
        flags: 64
      });
    }

    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission Denied', 'You need Manage Messages to moderate suggestions.')],
        flags: 64
      });
    }

    const messageId = interaction.options.getString('message_id').trim();
    const data = db.getSuggestion(messageId);
    if (!data || data.guild_id !== interaction.guild.id) {
      return interaction.reply({ embeds: [errorEmbed('Not Found', 'No suggestion with that message ID.')], flags: 64 });
    }

    const status = sub === 'accept' ? 'accepted' : sub === 'deny' ? 'denied' : 'implemented';
    const saved = db.saveSuggestion(messageId, { ...data, status });
    const channel = interaction.guild.channels.cache.get(saved.channel_id);
    const message = channel ? await channel.messages.fetch(messageId).catch(() => null) : null;
    if (message) {
      await message.edit({ embeds: [suggestionEmbed(saved)], components: [] }).catch(() => {});
    }
    return interaction.reply({ embeds: [successEmbed('Suggestion Updated', `Marked as **${status}**.`)] });
  }
};
