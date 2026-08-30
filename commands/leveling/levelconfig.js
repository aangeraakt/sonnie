const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { checkStaffPermission } = require('../../utils/staffSecurity');
const { applyRoleRewards } = require('../../utils/levelingManager');

function listOrNone(ids, prefix) {
  if (!ids || !ids.length) return '`None`';
  return ids.slice(0, 15).map((id) => `${prefix}${id}>`).join(' ');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('levelconfig')
    .setDescription('Configure the XP and level reward system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('view').setDescription('Show the current leveling configuration')
    )
    .addSubcommand(sub =>
      sub.setName('reward')
        .setDescription('Grant a role automatically at a given level')
        .addIntegerOption(opt => opt.setName('level').setDescription('Level that unlocks the role').setMinValue(1).setMaxValue(500).setRequired(true))
        .addRoleOption(opt => opt.setName('role').setDescription('Role to grant').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('unreward')
        .setDescription('Stop granting a role as a level reward')
        .addRoleOption(opt => opt.setName('role').setDescription('Role to remove from the rewards list').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('rewards').setDescription('List every configured level reward')
    )
    .addSubcommand(sub =>
      sub.setName('stack')
        .setDescription('Keep every earned reward role, or only the highest one')
        .addBooleanOption(opt => opt.setName('enabled').setDescription('True keeps all earned roles').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('announce')
        .setDescription('Where and how level-ups are announced')
        .addBooleanOption(opt => opt.setName('enabled').setDescription('Enable level-up announcements').setRequired(false))
        .addChannelOption(opt => opt.setName('channel').setDescription('Dedicated announcement channel (leave empty for current channel)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
        .addBooleanOption(opt => opt.setName('dm').setDescription('Send the notice by DM instead').setRequired(false))
        .addStringOption(opt => opt.setName('message').setDescription('Template: {user} {username} {level} {server} {rewards}').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('noxp')
        .setDescription('Block a channel or role from earning XP')
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel or category to block').setRequired(false))
        .addRoleOption(opt => opt.setName('role').setDescription('Role to block').setRequired(false))
        .addBooleanOption(opt => opt.setName('remove').setDescription('Unblock instead of block').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('multiplier')
        .setDescription('Set an XP multiplier for a role or channel')
        .addNumberOption(opt => opt.setName('multiplier').setDescription('Multiplier, e.g. 2 for double XP. Use 0 to clear').setMinValue(0).setMaxValue(10).setRequired(true))
        .addRoleOption(opt => opt.setName('role').setDescription('Role to boost').setRequired(false))
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel to boost').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('voicexp')
        .setDescription('Award XP for time spent in voice channels')
        .addBooleanOption(opt => opt.setName('enabled').setDescription('Enable voice XP').setRequired(true))
        .addIntegerOption(opt => opt.setName('per_minute').setDescription('Base XP per active minute (default 5)').setMinValue(1).setMaxValue(100).setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('card')
        .setDescription('Toggle the rendered rank card image')
        .addBooleanOption(opt => opt.setName('enabled').setDescription('False falls back to a plain embed').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('sync')
        .setDescription('Re-apply every level reward role across the server')
    ),

  async execute(interaction) {
    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission Denied', 'You need `Administrator` permissions to configure leveling.')],
        flags: 64
      });
    }

    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();
    const cfg = db.getLevelConfig(guildId);

    if (sub === 'view') {
      const guildCfg = db.getGuildConfig(guildId);
      const rewards = db.getLevelRewards(guildId);
      const roleMultipliers = Object.entries(cfg.role_multipliers || {}).map(([id, value]) => `<@&${id}> \`${value}x\``);
      const channelMultipliers = Object.entries(cfg.channel_multipliers || {}).map(([id, value]) => `<#${id}> \`${value}x\``);

      return interaction.reply({
        embeds: [createEmbed({
          title: 'Leveling Configuration',
          fields: [
            { name: 'XP System', value: guildCfg.xp_enabled ? `Enabled (base ${guildCfg.xp_rate || 1}x)` : 'Disabled', inline: true },
            { name: 'Rank Card', value: cfg.card_enabled ? 'Image card' : 'Plain embed', inline: true },
            { name: 'Reward Stacking', value: cfg.stack_rewards ? 'Keep all earned' : 'Highest only', inline: true },
            { name: 'Announcements', value: cfg.announce_enabled ? (cfg.announce_dm ? 'Direct message' : (cfg.announce_channel_id ? `<#${cfg.announce_channel_id}>` : 'Current channel')) : 'Disabled', inline: true },
            { name: 'Voice XP', value: cfg.voice_xp_enabled ? `${cfg.voice_xp_per_minute} XP/min` : 'Disabled', inline: true },
            { name: 'Rewards', value: `${rewards.length} configured`, inline: true },
            { name: 'No-XP Channels', value: listOrNone(cfg.no_xp_channels, '<#'), inline: false },
            { name: 'No-XP Roles', value: listOrNone(cfg.no_xp_roles, '<@&'), inline: false },
            { name: 'Role Multipliers', value: roleMultipliers.join(' ') || '`None`', inline: false },
            { name: 'Channel Multipliers', value: channelMultipliers.join(' ') || '`None`', inline: false },
            { name: 'Announce Template', value: `\`${cfg.announce_message}\``, inline: false }
          ]
        })]
      });
    }

    if (sub === 'reward') {
      const level = interaction.options.getInteger('level');
      const role = interaction.options.getRole('role');
      const me = interaction.guild.members.me;

      if (role.managed) {
        return interaction.reply({ embeds: [errorEmbed('Unusable Role', 'That role is managed by an integration and cannot be assigned.')], flags: 64 });
      }
      if (me && role.position >= me.roles.highest.position) {
        return interaction.reply({
          embeds: [errorEmbed('Role Too High', `${role} sits above my highest role, so I cannot grant it. Move my role above it first.`)],
          flags: 64
        });
      }

      db.addLevelReward(guildId, level, role.id);
      return interaction.reply({
        embeds: [successEmbed('Level Reward Added', `${role} will now be granted automatically at **Level ${level}**.\n\nRun \`/leveling levelconfig sync\` to backfill members who are already past that level.`)]
      });
    }

    if (sub === 'unreward') {
      const role = interaction.options.getRole('role');
      const removed = db.removeLevelReward(guildId, role.id);
      return interaction.reply({
        embeds: removed
          ? [successEmbed('Level Reward Removed', `${role} is no longer a level reward. Existing holders keep the role.`)]
          : [errorEmbed('Not a Reward', `${role} is not configured as a level reward.`)],
        flags: removed ? undefined : 64
      });
    }

    if (sub === 'rewards') {
      const rewards = db.getLevelRewards(guildId);
      if (!rewards.length) {
        return interaction.reply({ embeds: [errorEmbed('No Rewards', 'Add one with `/leveling levelconfig reward`.')], flags: 64 });
      }
      return interaction.reply({
        embeds: [createEmbed({
          title: 'Level Rewards',
          description: rewards.map((reward) => `**Level ${reward.level}** - <@&${reward.role_id}>`).join('\n'),
          footerText: cfg.stack_rewards ? 'Stacking on: members keep every reward earned' : 'Stacking off: only the highest reward is kept'
        })]
      });
    }

    if (sub === 'stack') {
      const enabled = interaction.options.getBoolean('enabled');
      db.setLevelConfig(guildId, 'stack_rewards', enabled ? 1 : 0);
      return interaction.reply({
        embeds: [successEmbed('Reward Stacking Updated', enabled
          ? 'Members now keep every reward role they earn.'
          : 'Members now keep only their highest earned reward role.')]
      });
    }

    if (sub === 'announce') {
      const enabled = interaction.options.getBoolean('enabled');
      const channel = interaction.options.getChannel('channel');
      const dm = interaction.options.getBoolean('dm');
      const message = interaction.options.getString('message');

      if (enabled !== null) db.setLevelConfig(guildId, 'announce_enabled', enabled ? 1 : 0);
      if (dm !== null) db.setLevelConfig(guildId, 'announce_dm', dm ? 1 : 0);
      if (message) db.setLevelConfig(guildId, 'announce_message', message.slice(0, 500));
      db.setLevelConfig(guildId, 'announce_channel_id', channel ? channel.id : null);

      const updated = db.getLevelConfig(guildId);
      return interaction.reply({
        embeds: [successEmbed('Level-Up Announcements Updated',
          `Enabled: **${updated.announce_enabled ? 'Yes' : 'No'}**\n` +
          `Destination: **${updated.announce_dm ? 'Direct message' : (updated.announce_channel_id ? `<#${updated.announce_channel_id}>` : 'Channel they levelled in')}**\n` +
          `Template: \`${updated.announce_message}\``)]
      });
    }

    if (sub === 'noxp') {
      const channel = interaction.options.getChannel('channel');
      const role = interaction.options.getRole('role');
      const remove = interaction.options.getBoolean('remove') || false;

      if (!channel && !role) {
        return interaction.reply({ embeds: [errorEmbed('Nothing Given', 'Provide a `channel` or a `role`.')], flags: 64 });
      }

      const changes = [];
      if (channel) {
        const list = cfg.no_xp_channels.slice();
        const index = list.indexOf(channel.id);
        if (remove && index !== -1) list.splice(index, 1);
        if (!remove && index === -1) list.push(channel.id);
        db.setLevelConfig(guildId, 'no_xp_channels', list);
        changes.push(`${channel} ${remove ? 'can earn XP again' : 'no longer grants XP'}`);
      }
      if (role) {
        const list = cfg.no_xp_roles.slice();
        const index = list.indexOf(role.id);
        if (remove && index !== -1) list.splice(index, 1);
        if (!remove && index === -1) list.push(role.id);
        db.setLevelConfig(guildId, 'no_xp_roles', list);
        changes.push(`${role} ${remove ? 'can earn XP again' : 'no longer earns XP'}`);
      }

      return interaction.reply({ embeds: [successEmbed('No-XP List Updated', changes.join('\n'))] });
    }

    if (sub === 'multiplier') {
      const multiplier = interaction.options.getNumber('multiplier');
      const role = interaction.options.getRole('role');
      const channel = interaction.options.getChannel('channel');

      if (!role && !channel) {
        return interaction.reply({ embeds: [errorEmbed('Nothing Given', 'Provide a `role` or a `channel` to apply the multiplier to.')], flags: 64 });
      }

      const changes = [];
      if (role) {
        const map = { ...(cfg.role_multipliers || {}) };
        if (multiplier === 0) delete map[role.id];
        else map[role.id] = multiplier;
        db.setLevelConfig(guildId, 'role_multipliers', map);
        changes.push(multiplier === 0 ? `Cleared the multiplier for ${role}` : `${role} now earns **${multiplier}x** XP`);
      }
      if (channel) {
        const map = { ...(cfg.channel_multipliers || {}) };
        if (multiplier === 0) delete map[channel.id];
        else map[channel.id] = multiplier;
        db.setLevelConfig(guildId, 'channel_multipliers', map);
        changes.push(multiplier === 0 ? `Cleared the multiplier for ${channel}` : `${channel} now grants **${multiplier}x** XP`);
      }

      return interaction.reply({ embeds: [successEmbed('Multipliers Updated', `${changes.join('\n')}\n\nMultipliers combine with the server base rate from \`/config type:XP\`.`)] });
    }

    if (sub === 'voicexp') {
      const enabled = interaction.options.getBoolean('enabled');
      const perMinute = interaction.options.getInteger('per_minute');
      db.setLevelConfig(guildId, 'voice_xp_enabled', enabled ? 1 : 0);
      if (perMinute) db.setLevelConfig(guildId, 'voice_xp_per_minute', perMinute);

      const updated = db.getLevelConfig(guildId);
      return interaction.reply({
        embeds: [successEmbed('Voice XP Updated', enabled
          ? `Members earn **${updated.voice_xp_per_minute} XP** per active minute in voice.\nMuted-by-self, deafened, AFK-channel and alone-in-channel members are skipped.`
          : 'Voice XP is now disabled.')]
      });
    }

    if (sub === 'card') {
      const enabled = interaction.options.getBoolean('enabled');
      db.setLevelConfig(guildId, 'card_enabled', enabled ? 1 : 0);
      return interaction.reply({
        embeds: [successEmbed('Rank Card Updated', enabled ? '`/leveling rank` now renders the image card.' : '`/leveling rank` now replies with a plain embed.')]
      });
    }

    if (sub === 'sync') {
      const rewards = db.getLevelRewards(guildId);
      if (!rewards.length) {
        return interaction.reply({ embeds: [errorEmbed('Nothing to Sync', 'No level rewards are configured yet.')], flags: 64 });
      }

      await interaction.deferReply();
      const members = await interaction.guild.members.fetch().catch(() => null);
      if (!members) {
        return interaction.editReply({ embeds: [errorEmbed('Sync Failed', 'I could not fetch the member list. Enable the Server Members intent.')] });
      }

      let updated = 0;
      let granted = 0;
      for (const member of members.values()) {
        if (member.user.bot) continue;
        const user = db.getUser(guildId, member.id);
        if (!user.xp) continue;
        const result = await applyRoleRewards(member, user.level, { announce: false });
        if (result.added.length || result.removed.length) {
          updated += 1;
          granted += result.added.length;
        }
      }

      return interaction.editReply({
        embeds: [successEmbed('Level Rewards Synced', `Updated **${updated}** member${updated === 1 ? '' : 's'} and granted **${granted}** role${granted === 1 ? '' : 's'}.`)]
      });
    }

    return interaction.reply({ embeds: [errorEmbed('Unknown Option', 'That leveling option is not available.')], flags: 64 });
  }
};
