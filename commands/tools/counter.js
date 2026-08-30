const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { checkStaffPermission } = require('../../utils/staffSecurity');
const { COUNTER_TYPES, updateGuildCounters, renderName } = require('../../utils/counterChannels');

const TYPE_CHOICES = Object.entries(COUNTER_TYPES).map(([value, meta]) => ({ name: meta.label, value }));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('counter')
    .setDescription('Live server statistics shown in a channel name')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Create a new locked voice channel that displays a statistic')
        .addStringOption(opt => opt.setName('type').setDescription('What to count').setRequired(true).addChoices(...TYPE_CHOICES))
        .addStringOption(opt => opt.setName('template').setDescription('Name template, must contain {count}. Default: "Members: {count}"').setMaxLength(90).setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Turn an existing channel into a counter')
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel to use as the counter').setRequired(true))
        .addStringOption(opt => opt.setName('type').setDescription('What to count').setRequired(true).addChoices(...TYPE_CHOICES))
        .addStringOption(opt => opt.setName('template').setDescription('Name template, must contain {count}').setMaxLength(90).setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Stop updating a counter channel (the channel itself is kept)')
        .addChannelOption(opt => opt.setName('channel').setDescription('Counter channel to stop updating').setRequired(true))
    )
    .addSubcommand(sub => sub.setName('list').setDescription('List every counter channel'))
    .addSubcommand(sub => sub.setName('refresh').setDescription('Update every counter channel right now')),

  async execute(interaction) {
    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission Denied', 'You need `Manage Channels` to configure counter channels.')],
        flags: 64
      });
    }

    const me = interaction.guild.members.me;
    if (me && !me.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ embeds: [errorEmbed('Missing Permission', 'I need **Manage Channels** to rename counter channels.')], flags: 64 });
    }

    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const counters = db.getCounters(guildId);
      if (!counters.length) {
        return interaction.reply({ embeds: [errorEmbed('No Counters', 'Create one with `/tools counter create`.')], flags: 64 });
      }
      return interaction.reply({
        embeds: [createEmbed({
          title: `Counter Channels (${counters.length})`,
          description: counters.map((counter) =>
            `<#${counter.channel_id}> - **${COUNTER_TYPES[counter.type]?.label || counter.type}**\nTemplate: \`${counter.template}\``
          ).join('\n\n'),
          footerText: 'Updated every 10 minutes (Discord rate limits channel renames)'
        })]
      });
    }

    if (sub === 'refresh') {
      await interaction.deferReply();
      const updated = await updateGuildCounters(interaction.guild);
      return interaction.editReply({
        embeds: [successEmbed('Counters Refreshed', `Renamed **${updated}** channel${updated === 1 ? '' : 's'}.\n\nDiscord allows only 2 renames per channel per 10 minutes, so some may not have changed yet.`)]
      });
    }

    if (sub === 'remove') {
      const channel = interaction.options.getChannel('channel');
      const removed = db.removeCounter(guildId, channel.id);
      return interaction.reply({
        embeds: removed
          ? [successEmbed('Counter Removed', `${channel} will no longer be renamed. Delete the channel yourself if you no longer want it.`)]
          : [errorEmbed('Not a Counter', `${channel} is not configured as a counter channel.`)],
        flags: removed ? undefined : 64
      });
    }

    const type = interaction.options.getString('type');
    const rawTemplate = interaction.options.getString('template');
    const template = rawTemplate || `${COUNTER_TYPES[type].label}: {count}`;

    if (!template.includes('{count}')) {
      return interaction.reply({
        embeds: [errorEmbed('Template Needs {count}', 'The template must contain `{count}` so I know where to put the number, e.g. `Members: {count}`.')],
        flags: 64
      });
    }

    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel');
      db.addCounter(guildId, channel.id, type, template);
      await updateGuildCounters(interaction.guild).catch(() => {});
      return interaction.reply({
        embeds: [successEmbed('Counter Configured', `${channel} now shows **${COUNTER_TYPES[type].label}**.\nPreview: \`${renderName(template, COUNTER_TYPES[type].compute(interaction.guild))}\``)]
      });
    }

    // create
    await interaction.deferReply();

    const preview = renderName(template, COUNTER_TYPES[type].compute(interaction.guild));
    let channel;
    try {
      channel = await interaction.guild.channels.create({
        name: preview,
        type: ChannelType.GuildVoice,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            // Visible to everyone but impossible to join, which is what makes
            // a voice channel work as a display-only stat banner.
            deny: [PermissionFlagsBits.Connect],
            allow: [PermissionFlagsBits.ViewChannel]
          }
        ],
        reason: `Counter channel created by ${interaction.user.tag}`
      });
    } catch (err) {
      return interaction.editReply({ embeds: [errorEmbed('Could Not Create Channel', 'Discord rejected the channel creation. Check my permissions and the server channel limit.')] });
    }

    db.addCounter(guildId, channel.id, type, template);

    return interaction.editReply({
      embeds: [successEmbed('Counter Channel Created',
        `${channel} now shows **${COUNTER_TYPES[type].label}**.\nCurrent name: \`${preview}\`\n\nDrag it to the top of your channel list. It refreshes every 10 minutes, and on every join or leave.`)]
    });
  }
};
