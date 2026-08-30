const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { checkStaffPermission } = require('../../utils/staffSecurity');

const FILTERS = [
  { name: 'Blocked words', value: 'banned_words_toggle' },
  { name: 'Discord invites', value: 'invite_filter' },
  { name: 'Scam / phishing links', value: 'scam_filter' },
  { name: 'Dangerous attachments', value: 'attachment_filter' },
  { name: 'Zalgo text', value: 'zalgo' },
  { name: 'Mass mentions', value: 'mass_mention_limit' },
  { name: 'Excessive caps', value: 'caps_percent' },
  { name: 'Emoji spam', value: 'emoji_limit' }
];

const NUMERIC_FILTERS = {
  mass_mention_limit: { label: 'Mass mention limit', suffix: 'mentions', fallback: 5 },
  caps_percent: { label: 'Caps threshold', suffix: '%', fallback: 70 },
  emoji_limit: { label: 'Emoji limit', suffix: 'emojis', fallback: 10 }
};

function onOff(value) {
  return value ? 'Enabled' : 'Disabled';
}

function describeNumeric(cfg, key) {
  const value = cfg[key];
  if (!value) return 'Disabled';
  return `${value}${NUMERIC_FILTERS[key].suffix === '%' ? '%' : ` ${NUMERIC_FILTERS[key].suffix}`}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configure automatic moderation, raid, and nuke protection')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub.setName('view').setDescription('Show every auto-mod setting'))
    .addSubcommand(sub =>
      sub.setName('filter')
        .setDescription('Turn a content filter on or off')
        .addStringOption(opt => opt.setName('type').setDescription('Filter to change').setRequired(true).addChoices(...FILTERS))
        .addBooleanOption(opt => opt.setName('enabled').setDescription('Enable or disable it').setRequired(true))
        .addIntegerOption(opt => opt.setName('threshold').setDescription('Limit for mass mentions / caps % / emoji count').setMinValue(1).setMaxValue(100).setRequired(false))
    )
    .addSubcommandGroup(group =>
      group.setName('words')
        .setDescription('Manage the blocked word list')
        .addSubcommand(sub =>
          sub.setName('add')
            .setDescription('Block one or more words (comma separated)')
            .addStringOption(opt => opt.setName('words').setDescription('Words to block, comma separated').setRequired(true))
        )
        .addSubcommand(sub =>
          sub.setName('remove')
            .setDescription('Unblock a word')
            .addStringOption(opt => opt.setName('word').setDescription('Word to unblock').setRequired(true))
        )
        .addSubcommand(sub => sub.setName('list').setDescription('Show the blocked word list'))
        .addSubcommand(sub => sub.setName('clear').setDescription('Remove every blocked word'))
        .addSubcommand(sub =>
          sub.setName('action')
            .setDescription('What happens when a blocked word is used')
            .addStringOption(opt =>
              opt.setName('action').setDescription('Response').setRequired(true).addChoices(
                { name: 'Delete only', value: 'delete' },
                { name: 'Delete and warn', value: 'warn' },
                { name: 'Delete, warn and timeout', value: 'timeout' }
              )
            )
        )
    )
    .addSubcommandGroup(group =>
      group.setName('escalation')
        .setDescription('Automatic punishments once a member hits a warning count')
        .addSubcommand(sub =>
          sub.setName('toggle')
            .setDescription('Enable or disable the escalation ladder')
            .addBooleanOption(opt => opt.setName('enabled').setDescription('Enable escalation').setRequired(true))
        )
        .addSubcommand(sub =>
          sub.setName('set')
            .setDescription('Set the punishment for a warning count')
            .addIntegerOption(opt => opt.setName('warns').setDescription('Warning count that triggers it').setMinValue(1).setMaxValue(50).setRequired(true))
            .addStringOption(opt =>
              opt.setName('action').setDescription('Punishment').setRequired(true).addChoices(
                { name: 'Timeout', value: 'timeout' },
                { name: 'Kick', value: 'kick' },
                { name: 'Temporary ban', value: 'tempban' },
                { name: 'Ban', value: 'ban' }
              )
            )
            .addIntegerOption(opt => opt.setName('minutes').setDescription('Duration for timeout / tempban').setMinValue(1).setMaxValue(40320).setRequired(false))
        )
        .addSubcommand(sub =>
          sub.setName('remove')
            .setDescription('Remove the rule for a warning count')
            .addIntegerOption(opt => opt.setName('warns').setDescription('Warning count to clear').setMinValue(1).setMaxValue(50).setRequired(true))
        )
        .addSubcommand(sub => sub.setName('list').setDescription('Show the escalation ladder'))
    )
    .addSubcommand(sub =>
      sub.setName('raid')
        .setDescription('Anti-raid: react to bursts of joins')
        .addBooleanOption(opt => opt.setName('enabled').setDescription('Enable raid protection').setRequired(true))
        .addIntegerOption(opt => opt.setName('joins').setDescription('Joins needed to trigger (default 8)').setMinValue(2).setMaxValue(100).setRequired(false))
        .addIntegerOption(opt => opt.setName('seconds').setDescription('Time window in seconds (default 10)').setMinValue(2).setMaxValue(600).setRequired(false))
        .addStringOption(opt =>
          opt.setName('action').setDescription('Response to a detected raid').setRequired(false).addChoices(
            { name: 'Lock the server for 15 minutes', value: 'lockdown' },
            { name: 'Kick the joiners', value: 'kick' },
            { name: 'Ban the joiners', value: 'ban' }
          )
        )
        .addIntegerOption(opt => opt.setName('min_account_age').setDescription('Reject accounts younger than N days (0 = off)').setMinValue(0).setMaxValue(365).setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('antinuke')
        .setDescription('Anti-nuke: stop mass deletions and bans by a compromised staff account')
        .addBooleanOption(opt => opt.setName('enabled').setDescription('Enable anti-nuke').setRequired(true))
        .addIntegerOption(opt => opt.setName('channel_deletes').setDescription('Channel deletes before acting (default 3)').setMinValue(2).setMaxValue(50).setRequired(false))
        .addIntegerOption(opt => opt.setName('role_deletes').setDescription('Role deletes before acting (default 3)').setMinValue(2).setMaxValue(50).setRequired(false))
        .addIntegerOption(opt => opt.setName('bans').setDescription('Bans before acting (default 5)').setMinValue(2).setMaxValue(50).setRequired(false))
        .addIntegerOption(opt => opt.setName('seconds').setDescription('Detection window in seconds (default 30)').setMinValue(5).setMaxValue(600).setRequired(false))
        .addStringOption(opt =>
          opt.setName('action').setDescription('Response').setRequired(false).addChoices(
            { name: 'Strip their privileged roles', value: 'strip' },
            { name: 'Ban them', value: 'ban' }
          )
        )
        .addUserOption(opt => opt.setName('whitelist').setDescription('Trust this user (toggles them on the whitelist)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('ignore')
        .setDescription('Exempt a channel or role from every auto-mod filter')
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel or category to exempt').setRequired(false))
        .addRoleOption(opt => opt.setName('role').setDescription('Role to exempt').setRequired(false))
        .addBooleanOption(opt => opt.setName('remove').setDescription('Remove the exemption instead').setRequired(false))
    ),

  async execute(interaction) {
    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission Denied', 'You need `Administrator` permissions to configure auto-mod.')],
        flags: 64
      });
    }

    const guildId = interaction.guild.id;
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    const cfg = db.getAutomodConfig(guildId);

    if (group === 'words') return handleWords(interaction, guildId, sub, cfg);
    if (group === 'escalation') return handleEscalation(interaction, guildId, sub, cfg);

    if (sub === 'view') {
      const guildCfg = db.getGuildConfig(guildId);
      const ladder = (cfg.escalation || []).sort((a, b) => a.warns - b.warns)
        .map((rule) => `\`${rule.warns}\` warns -> **${rule.action}**${rule.duration ? ` (${Math.round(rule.duration / 60)}m)` : ''}`)
        .join('\n') || '`None`';

      return interaction.reply({
        embeds: [createEmbed({
          title: 'Auto-Mod Configuration',
          fields: [
            { name: 'Anti-Link (legacy)', value: onOff(guildCfg.anti_link === 1), inline: true },
            { name: 'Anti-Spam (legacy)', value: onOff(guildCfg.anti_spam === 1), inline: true },
            { name: 'Blocked Words', value: `${(cfg.banned_words || []).length} word(s), action: \`${cfg.banned_words_action}\``, inline: true },
            { name: 'Invite Filter', value: onOff(cfg.invite_filter), inline: true },
            { name: 'Scam Filter', value: onOff(cfg.scam_filter), inline: true },
            { name: 'Attachment Filter', value: onOff(cfg.attachment_filter), inline: true },
            { name: 'Zalgo Filter', value: onOff(cfg.zalgo), inline: true },
            { name: 'Mass Mentions', value: describeNumeric(cfg, 'mass_mention_limit'), inline: true },
            { name: 'Caps Filter', value: describeNumeric(cfg, 'caps_percent'), inline: true },
            { name: 'Emoji Spam', value: describeNumeric(cfg, 'emoji_limit'), inline: true },
            { name: 'Escalation', value: cfg.escalation_enabled ? 'Enabled' : 'Disabled', inline: true },
            { name: 'Anti-Raid', value: cfg.raid_enabled ? `${cfg.raid_joins} joins / ${cfg.raid_seconds}s -> ${cfg.raid_action}` : 'Disabled', inline: true },
            { name: 'Min Account Age', value: cfg.raid_account_age_days ? `${cfg.raid_account_age_days} days` : 'Off', inline: true },
            { name: 'Anti-Nuke', value: cfg.nuke_enabled ? `${cfg.nuke_channel_deletes}ch / ${cfg.nuke_role_deletes}role / ${cfg.nuke_bans}ban in ${cfg.nuke_window_seconds}s -> ${cfg.nuke_action}` : 'Disabled', inline: false },
            { name: 'Escalation Ladder', value: ladder, inline: false },
            { name: 'Exempt Channels', value: (cfg.ignored_channels || []).map((id) => `<#${id}>`).join(' ') || '`None`', inline: false },
            { name: 'Exempt Roles', value: (cfg.ignored_roles || []).map((id) => `<@&${id}>`).join(' ') || '`None`', inline: false },
            { name: 'Anti-Nuke Whitelist', value: (cfg.nuke_whitelist || []).map((id) => `<@${id}>`).join(' ') || '`None`', inline: false }
          ],
          footerText: 'Staff and administrators always bypass auto-mod'
        })]
      });
    }

    if (sub === 'filter') {
      const type = interaction.options.getString('type');
      const enabled = interaction.options.getBoolean('enabled');
      const threshold = interaction.options.getInteger('threshold');

      if (type === 'banned_words_toggle') {
        return interaction.reply({
          embeds: [errorEmbed('Use the Word List', 'The blocked-word filter is driven by its list. Add words with `/automod words add`, or clear it with `/automod words clear`.')],
          flags: 64
        });
      }

      if (NUMERIC_FILTERS[type]) {
        const meta = NUMERIC_FILTERS[type];
        const value = enabled ? (threshold || meta.fallback) : 0;
        db.setAutomodConfig(guildId, type, value);
        return interaction.reply({
          embeds: [successEmbed(`${meta.label} Updated`, enabled
            ? `Messages with **${value}${meta.suffix === '%' ? '% capitals' : ` ${meta.suffix}`}** or more are now removed.`
            : `The ${meta.label.toLowerCase()} filter is now disabled.`)]
        });
      }

      db.setAutomodConfig(guildId, type, enabled ? 1 : 0);
      const label = FILTERS.find((f) => f.value === type)?.name || type;
      return interaction.reply({ embeds: [successEmbed('Filter Updated', `**${label}** is now **${onOff(enabled).toLowerCase()}**.`)] });
    }

    if (sub === 'raid') {
      const enabled = interaction.options.getBoolean('enabled');
      const joins = interaction.options.getInteger('joins');
      const seconds = interaction.options.getInteger('seconds');
      const action = interaction.options.getString('action');
      const minAge = interaction.options.getInteger('min_account_age');

      db.setAutomodConfig(guildId, 'raid_enabled', enabled ? 1 : 0);
      if (joins) db.setAutomodConfig(guildId, 'raid_joins', joins);
      if (seconds) db.setAutomodConfig(guildId, 'raid_seconds', seconds);
      if (action) db.setAutomodConfig(guildId, 'raid_action', action);
      if (minAge !== null) db.setAutomodConfig(guildId, 'raid_account_age_days', minAge);

      const updated = db.getAutomodConfig(guildId);
      return interaction.reply({
        embeds: [successEmbed('Anti-Raid Updated', enabled
          ? `Trigger: **${updated.raid_joins} joins in ${updated.raid_seconds}s**\nResponse: **${updated.raid_action}**\nMinimum account age: **${updated.raid_account_age_days || 0} days**\n\nLockdowns lift themselves after 15 minutes, or immediately with \`/moderation lockdown enabled:false\`.`
          : 'Anti-raid protection is now disabled.')]
      });
    }

    if (sub === 'antinuke') {
      const enabled = interaction.options.getBoolean('enabled');
      const channelDeletes = interaction.options.getInteger('channel_deletes');
      const roleDeletes = interaction.options.getInteger('role_deletes');
      const bans = interaction.options.getInteger('bans');
      const seconds = interaction.options.getInteger('seconds');
      const action = interaction.options.getString('action');
      const whitelist = interaction.options.getUser('whitelist');

      db.setAutomodConfig(guildId, 'nuke_enabled', enabled ? 1 : 0);
      if (channelDeletes) db.setAutomodConfig(guildId, 'nuke_channel_deletes', channelDeletes);
      if (roleDeletes) db.setAutomodConfig(guildId, 'nuke_role_deletes', roleDeletes);
      if (bans) db.setAutomodConfig(guildId, 'nuke_bans', bans);
      if (seconds) db.setAutomodConfig(guildId, 'nuke_window_seconds', seconds);
      if (action) db.setAutomodConfig(guildId, 'nuke_action', action);

      let whitelistNote = '';
      if (whitelist) {
        const list = (cfg.nuke_whitelist || []).slice();
        const index = list.indexOf(whitelist.id);
        if (index === -1) {
          list.push(whitelist.id);
          whitelistNote = `\n\n${whitelist} was **added** to the whitelist.`;
        } else {
          list.splice(index, 1);
          whitelistNote = `\n\n${whitelist} was **removed** from the whitelist.`;
        }
        db.setAutomodConfig(guildId, 'nuke_whitelist', list);
      }

      const updated = db.getAutomodConfig(guildId);
      return interaction.reply({
        embeds: [successEmbed('Anti-Nuke Updated', enabled
          ? `Within **${updated.nuke_window_seconds}s**, a single member may delete at most **${updated.nuke_channel_deletes} channels**, **${updated.nuke_role_deletes} roles**, or issue **${updated.nuke_bans} bans**.\nPast that they are **${updated.nuke_action === 'ban' ? 'banned' : 'stripped of privileged roles'}**.\n\nThe server owner and I are always exempt. I need **View Audit Log** to identify who acted.${whitelistNote}`
          : `Anti-nuke is now disabled.${whitelistNote}`)]
      });
    }

    if (sub === 'ignore') {
      const channel = interaction.options.getChannel('channel');
      const role = interaction.options.getRole('role');
      const remove = interaction.options.getBoolean('remove') || false;

      if (!channel && !role) {
        return interaction.reply({ embeds: [errorEmbed('Nothing Given', 'Provide a `channel` or a `role`.')], flags: 64 });
      }

      const changes = [];
      if (channel) {
        const list = (cfg.ignored_channels || []).slice();
        const index = list.indexOf(channel.id);
        if (remove && index !== -1) list.splice(index, 1);
        if (!remove && index === -1) list.push(channel.id);
        db.setAutomodConfig(guildId, 'ignored_channels', list);
        changes.push(`${channel} is ${remove ? 'no longer' : 'now'} exempt from auto-mod`);
      }
      if (role) {
        const list = (cfg.ignored_roles || []).slice();
        const index = list.indexOf(role.id);
        if (remove && index !== -1) list.splice(index, 1);
        if (!remove && index === -1) list.push(role.id);
        db.setAutomodConfig(guildId, 'ignored_roles', list);
        changes.push(`${role} is ${remove ? 'no longer' : 'now'} exempt from auto-mod`);
      }

      return interaction.reply({ embeds: [successEmbed('Exemptions Updated', changes.join('\n'))] });
    }

    return interaction.reply({ embeds: [errorEmbed('Unknown Option', 'That auto-mod option is not available.')], flags: 64 });
  }
};

async function handleWords(interaction, guildId, sub, cfg) {
  if (sub === 'add') {
    const input = interaction.options.getString('words');
    const words = input.split(',').map((word) => word.trim().toLowerCase()).filter(Boolean);
    if (!words.length) {
      return interaction.reply({ embeds: [errorEmbed('No Words', 'Provide at least one word.')], flags: 64 });
    }

    const list = (cfg.banned_words || []).slice();
    const added = [];
    for (const word of words) {
      if (!list.includes(word)) {
        list.push(word);
        added.push(word);
      }
    }
    db.setAutomodConfig(guildId, 'banned_words', list);

    return interaction.reply({
      embeds: [successEmbed('Blocked Words Updated', added.length
        ? `Added **${added.length}** word${added.length === 1 ? '' : 's'}. The list now has **${list.length}**.\n\nMatching ignores case, leet-speak (\`n1ce\`), repeated letters, and spaced-out spelling.`
        : 'Every word you gave was already on the list.')],
      flags: 64
    });
  }

  if (sub === 'remove') {
    const word = interaction.options.getString('word').trim().toLowerCase();
    const list = (cfg.banned_words || []).slice();
    const index = list.indexOf(word);
    if (index === -1) {
      return interaction.reply({ embeds: [errorEmbed('Not Blocked', `\`${word}\` is not on the blocked list.`)], flags: 64 });
    }
    list.splice(index, 1);
    db.setAutomodConfig(guildId, 'banned_words', list);
    return interaction.reply({ embeds: [successEmbed('Word Unblocked', `Removed \`${word}\`. **${list.length}** word${list.length === 1 ? '' : 's'} remain.`)], flags: 64 });
  }

  if (sub === 'list') {
    const list = cfg.banned_words || [];
    if (!list.length) {
      return interaction.reply({ embeds: [errorEmbed('No Blocked Words', 'Add some with `/automod words add`.')], flags: 64 });
    }
    return interaction.reply({
      embeds: [createEmbed({
        title: `Blocked Words (${list.length})`,
        description: `||${list.join(', ').slice(0, 3900)}||`,
        footerText: `Action on match: ${cfg.banned_words_action}`
      })],
      flags: 64
    });
  }

  if (sub === 'clear') {
    db.setAutomodConfig(guildId, 'banned_words', []);
    return interaction.reply({ embeds: [successEmbed('Word List Cleared', 'The blocked word filter is now empty and inactive.')] });
  }

  if (sub === 'action') {
    const action = interaction.options.getString('action');
    db.setAutomodConfig(guildId, 'banned_words_action', action);
    const described = {
      delete: 'The message is deleted silently.',
      warn: 'The message is deleted and the member receives a warning.',
      timeout: 'The message is deleted, the member is warned and timed out for 10 minutes.'
    };
    return interaction.reply({ embeds: [successEmbed('Blocked Word Action Updated', described[action])] });
  }

  return interaction.reply({ embeds: [errorEmbed('Unknown Option', 'That word-list option is not available.')], flags: 64 });
}

async function handleEscalation(interaction, guildId, sub, cfg) {
  if (sub === 'toggle') {
    const enabled = interaction.options.getBoolean('enabled');
    db.setAutomodConfig(guildId, 'escalation_enabled', enabled ? 1 : 0);
    return interaction.reply({
      embeds: [successEmbed('Escalation Updated', enabled
        ? 'Members are now punished automatically once they hit a configured warning count. Review the ladder with `/automod escalation list`.'
        : 'Automatic punishment on warning thresholds is now disabled.')]
    });
  }

  if (sub === 'set') {
    const warns = interaction.options.getInteger('warns');
    const action = interaction.options.getString('action');
    const minutes = interaction.options.getInteger('minutes');

    if ((action === 'timeout' || action === 'tempban') && !minutes) {
      return interaction.reply({
        embeds: [errorEmbed('Duration Required', `A \`${action}\` rule needs a \`minutes\` value.`)],
        flags: 64
      });
    }
    if (action === 'timeout' && minutes > 40320) {
      return interaction.reply({ embeds: [errorEmbed('Too Long', 'Discord caps timeouts at 28 days (40320 minutes).')], flags: 64 });
    }

    const ladder = (cfg.escalation || []).filter((rule) => rule.warns !== warns);
    const rule = { warns, action };
    if (minutes) rule.duration = minutes * 60;
    ladder.push(rule);
    ladder.sort((a, b) => a.warns - b.warns);
    db.setAutomodConfig(guildId, 'escalation', ladder);

    return interaction.reply({
      embeds: [successEmbed('Escalation Rule Set', `At **${warns} warning${warns === 1 ? '' : 's'}** the member is **${action}**${minutes ? ` for ${minutes} minute${minutes === 1 ? '' : 's'}` : ''}.${cfg.escalation_enabled ? '' : '\n\nEscalation is currently **off** - enable it with `/automod escalation toggle`.'}`)]
    });
  }

  if (sub === 'remove') {
    const warns = interaction.options.getInteger('warns');
    const ladder = (cfg.escalation || []).filter((rule) => rule.warns !== warns);
    if (ladder.length === (cfg.escalation || []).length) {
      return interaction.reply({ embeds: [errorEmbed('No Such Rule', `Nothing is configured for ${warns} warnings.`)], flags: 64 });
    }
    db.setAutomodConfig(guildId, 'escalation', ladder);
    return interaction.reply({ embeds: [successEmbed('Escalation Rule Removed', `Cleared the rule for **${warns} warnings**.`)] });
  }

  if (sub === 'list') {
    const ladder = (cfg.escalation || []).slice().sort((a, b) => a.warns - b.warns);
    if (!ladder.length) {
      return interaction.reply({ embeds: [errorEmbed('Empty Ladder', 'Add a rule with `/automod escalation set`.')], flags: 64 });
    }
    return interaction.reply({
      embeds: [createEmbed({
        title: 'Escalation Ladder',
        description: ladder.map((rule) =>
          `**${rule.warns}** warning${rule.warns === 1 ? '' : 's'} -> \`${rule.action}\`${rule.duration ? ` for ${Math.round(rule.duration / 60)} minute(s)` : ''}`
        ).join('\n'),
        footerText: cfg.escalation_enabled ? 'Escalation is active' : 'Escalation is currently disabled'
      })]
    });
  }

  return interaction.reply({ embeds: [errorEmbed('Unknown Option', 'That escalation option is not available.')], flags: 64 });
}
