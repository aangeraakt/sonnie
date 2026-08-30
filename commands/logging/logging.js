const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { checkStaffPermission } = require('../../utils/staffSecurity');
const { CATEGORY_LABELS } = require('../../utils/auditLogger');

const CATEGORY_CHOICES = [
  { name: 'Messages (deletes, edits, purges)', value: 'message' },
  { name: 'Members (nicknames, roles, timeouts)', value: 'member' },
  { name: 'Server (channels, roles, emojis, threads)', value: 'server' },
  { name: 'Voice (join, leave, move, stream)', value: 'voice' },
  { name: 'Joins and leaves', value: 'joinleave' },
  { name: 'Moderation (bans, kicks, automod)', value: 'moderation' }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('logging')
    .setDescription('Route server audit logs to channels by category')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub.setName('view').setDescription('Show where each log category is sent'))
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Send one log category to a channel')
        .addStringOption(opt => opt.setName('category').setDescription('Which events to route').setRequired(true).addChoices(...CATEGORY_CHOICES))
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Destination channel')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('disable')
        .setDescription('Stop logging one category')
        .addStringOption(opt => opt.setName('category').setDescription('Category to disable').setRequired(true).addChoices(...CATEGORY_CHOICES))
    )
    .addSubcommand(sub =>
      sub.setName('all')
        .setDescription('Send every log category to one channel')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Destination channel for all categories')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('ignore')
        .setDescription('Never log activity from a channel or user')
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel to ignore').setRequired(false))
        .addUserOption(opt => opt.setName('user').setDescription('User to ignore').setRequired(false))
        .addBooleanOption(opt => opt.setName('remove').setDescription('Stop ignoring instead').setRequired(false))
    ),

  async execute(interaction) {
    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission Denied', 'You need `Administrator` permissions to configure logging.')],
        flags: 64
      });
    }

    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();
    const cfg = db.getLogConfig(guildId);

    if (sub === 'view') {
      const guildCfg = db.getGuildConfig(guildId);
      const fields = CATEGORY_CHOICES.map((choice) => {
        let value = cfg[choice.value] ? `<#${cfg[choice.value]}>` : '`Disabled`';
        if (choice.value === 'moderation' && !cfg.moderation && guildCfg.mod_log_channel_id) {
          value = `<#${guildCfg.mod_log_channel_id}> *(from /config modlog)*`;
        }
        return { name: CATEGORY_LABELS[choice.value].split(' (')[0], value, inline: true };
      });

      fields.push(
        { name: 'Ignored Channels', value: (cfg.ignored_channels || []).map((id) => `<#${id}>`).join(' ') || '`None`', inline: false },
        { name: 'Ignored Users', value: (cfg.ignored_users || []).map((id) => `<@${id}>`).join(' ') || '`None`', inline: false }
      );

      return interaction.reply({
        embeds: [createEmbed({
          title: 'Logging Configuration',
          description: 'Each category can go to its own channel. I need **View Audit Log** to attribute who performed an action.',
          fields
        })]
      });
    }

    if (sub === 'set') {
      const category = interaction.options.getString('category');
      const channel = interaction.options.getChannel('channel');

      const me = interaction.guild.members.me;
      if (me && !channel.permissionsFor(me)?.has('SendMessages')) {
        return interaction.reply({ embeds: [errorEmbed('Cannot Post There', `I cannot send messages in ${channel}. Fix my permissions and try again.`)], flags: 64 });
      }

      db.setLogChannel(guildId, category, channel.id);
      return interaction.reply({
        embeds: [successEmbed('Log Category Routed', `**${CATEGORY_LABELS[category]}** will now be sent to ${channel}.`)]
      });
    }

    if (sub === 'disable') {
      const category = interaction.options.getString('category');
      db.setLogChannel(guildId, category, null);
      return interaction.reply({
        embeds: [successEmbed('Log Category Disabled', `**${CATEGORY_LABELS[category]}** will no longer be logged.`)]
      });
    }

    if (sub === 'all') {
      const channel = interaction.options.getChannel('channel');
      const me = interaction.guild.members.me;
      if (me && !channel.permissionsFor(me)?.has('SendMessages')) {
        return interaction.reply({ embeds: [errorEmbed('Cannot Post There', `I cannot send messages in ${channel}.`)], flags: 64 });
      }

      for (const choice of CATEGORY_CHOICES) {
        db.setLogChannel(guildId, choice.value, channel.id);
      }
      return interaction.reply({
        embeds: [successEmbed('All Logging Routed', `Every log category now goes to ${channel}.\n\nSplit them up later with \`/logging set\`.`)]
      });
    }

    if (sub === 'ignore') {
      const channel = interaction.options.getChannel('channel');
      const user = interaction.options.getUser('user');
      const remove = interaction.options.getBoolean('remove') || false;

      if (!channel && !user) {
        return interaction.reply({ embeds: [errorEmbed('Nothing Given', 'Provide a `channel` or a `user`.')], flags: 64 });
      }

      const changes = [];
      if (channel) {
        const list = (cfg.ignored_channels || []).slice();
        const index = list.indexOf(channel.id);
        if (remove && index !== -1) list.splice(index, 1);
        if (!remove && index === -1) list.push(channel.id);
        db.setLogIgnore(guildId, 'ignored_channels', list);
        changes.push(`${channel} is ${remove ? 'no longer' : 'now'} ignored`);
      }
      if (user) {
        const list = (cfg.ignored_users || []).slice();
        const index = list.indexOf(user.id);
        if (remove && index !== -1) list.splice(index, 1);
        if (!remove && index === -1) list.push(user.id);
        db.setLogIgnore(guildId, 'ignored_users', list);
        changes.push(`${user} is ${remove ? 'no longer' : 'now'} ignored`);
      }

      return interaction.reply({ embeds: [successEmbed('Log Exemptions Updated', changes.join('\n'))] });
    }

    return interaction.reply({ embeds: [errorEmbed('Unknown Option', 'That logging option is not available.')], flags: 64 });
  }
};
