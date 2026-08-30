const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { checkStaffPermission } = require('../../utils/staffSecurity');

const MAX_RESPONDERS = 50;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autoresponder')
    .setDescription('Reply automatically when someone says a trigger phrase')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add an automatic response')
        .addStringOption(opt => opt.setName('trigger').setDescription('Phrase that fires the response').setMaxLength(200).setRequired(true))
        .addStringOption(opt => opt.setName('response').setDescription('What to reply. Supports {user} {username} {server} {channel} {membercount}').setMaxLength(1500).setRequired(true))
        .addStringOption(opt =>
          opt.setName('match')
            .setDescription('How the trigger is matched (default: contains)')
            .setRequired(false)
            .addChoices(
              { name: 'Contains the phrase as a whole word', value: 'contains' },
              { name: 'Message is exactly the phrase', value: 'exact' },
              { name: 'Message starts with it', value: 'startswith' },
              { name: 'Message ends with it', value: 'endswith' },
              { name: 'Regular expression', value: 'regex' }
            )
        )
        .addBooleanOption(opt => opt.setName('reply').setDescription('Reply to the message instead of sending a new one').setRequired(false))
        .addBooleanOption(opt => opt.setName('embed').setDescription('Send the response as an embed').setRequired(false))
        .addBooleanOption(opt => opt.setName('delete_trigger').setDescription('Delete the message that triggered it').setRequired(false))
        .addBooleanOption(opt => opt.setName('case_sensitive').setDescription('Match the trigger case exactly').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove an automatic response')
        .addStringOption(opt => opt.setName('trigger').setDescription('The trigger phrase or its ID').setRequired(true))
    )
    .addSubcommand(sub => sub.setName('list').setDescription('List every automatic response')),

  async execute(interaction) {
    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission Denied', 'You need `Manage Server` to configure auto responders.')],
        flags: 64
      });
    }

    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const existing = db.getAutoResponders(guildId);
      if (existing.length >= MAX_RESPONDERS) {
        return interaction.reply({
          embeds: [errorEmbed('Limit Reached', `This server already has ${MAX_RESPONDERS} auto responders. Remove one first.`)],
          flags: 64
        });
      }

      const trigger = interaction.options.getString('trigger').trim();
      const response = interaction.options.getString('response');
      const match = interaction.options.getString('match') || 'contains';

      if (existing.some((item) => item.trigger.toLowerCase() === trigger.toLowerCase())) {
        return interaction.reply({ embeds: [errorEmbed('Duplicate Trigger', `\`${trigger}\` already has a response. Remove it first.`)], flags: 64 });
      }

      if (match === 'regex') {
        try {
          new RegExp(trigger);
        } catch (err) {
          return interaction.reply({ embeds: [errorEmbed('Invalid Regular Expression', `\`${err.message}\``)], flags: 64 });
        }
      }

      const deleteTrigger = interaction.options.getBoolean('delete_trigger') || false;
      const me = interaction.guild.members.me;
      if (deleteTrigger && me && !me.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ embeds: [errorEmbed('Missing Permission', 'I need **Manage Messages** to delete trigger messages.')], flags: 64 });
      }

      const entry = db.addAutoResponder(guildId, {
        trigger,
        response,
        match,
        reply: interaction.options.getBoolean('reply') ?? true,
        embed: interaction.options.getBoolean('embed') || false,
        delete_trigger: deleteTrigger,
        case_sensitive: interaction.options.getBoolean('case_sensitive') || false,
        created_by: interaction.user.id
      });

      return interaction.reply({
        embeds: [successEmbed('Auto Responder Added',
          `**Trigger:** \`${trigger}\` (${match})\n**Response:** ${response.slice(0, 500)}\n\nID: \`${entry.id}\`\nResponses are rate limited to one per channel every 3 seconds.`)]
      });
    }

    if (sub === 'remove') {
      const trigger = interaction.options.getString('trigger');
      const removed = db.removeAutoResponder(guildId, trigger);
      return interaction.reply({
        embeds: removed
          ? [successEmbed('Auto Responder Removed', `\`${trigger}\` no longer triggers a response.`)]
          : [errorEmbed('Not Found', `No auto responder matches \`${trigger}\`. Check \`/tools autoresponder list\`.`)],
        flags: removed ? undefined : 64
      });
    }

    const responders = db.getAutoResponders(guildId);
    if (!responders.length) {
      return interaction.reply({ embeds: [errorEmbed('None Configured', 'Add one with `/tools autoresponder add`.')], flags: 64 });
    }

    return interaction.reply({
      embeds: [createEmbed({
        title: `Auto Responders (${responders.length})`,
        description: responders.map((item) => {
          const flags = [
            item.match,
            item.reply ? 'reply' : 'send',
            item.embed ? 'embed' : null,
            item.delete_trigger ? 'deletes trigger' : null,
            item.case_sensitive ? 'case sensitive' : null
          ].filter(Boolean).join(', ');
          return `**\`${item.trigger}\`** - ${flags}\n${item.response.slice(0, 120)}${item.response.length > 120 ? '...' : ''}\nID: \`${item.id}\``;
        }).join('\n\n').slice(0, 4000),
        footerText: `${responders.length} of ${MAX_RESPONDERS} used`
      })]
    });
  }
};
