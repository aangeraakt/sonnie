const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { createModLogEmbed, MOD_COLORS } = require('../../utils/modLogger');
const { checkStaffPermission } = require('../../utils/staffSecurity');
const { lockdownServer, liftLockdown, endRaidLockdown, isLockedDown, activeLockdowns } = require('../../utils/antiRaid');
const { sendLog } = require('../../utils/auditLogger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Lock or unlock every text channel in the server at once')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption(opt => opt.setName('enabled').setDescription('True locks the server, false unlocks it').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Announced in the locked channels').setRequired(false))
    .addBooleanOption(opt => opt.setName('announce').setDescription('Post a notice in each locked channel (default: false)').setRequired(false)),

  async execute(interaction) {
    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission Denied', 'You need `Administrator` permissions to lock down the server.')],
        flags: 64
      });
    }

    const me = interaction.guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ embeds: [errorEmbed('Missing Permission', 'I need **Manage Channels** to change channel permissions.')], flags: 64 });
    }

    const enabled = interaction.options.getBoolean('enabled');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const announce = interaction.options.getBoolean('announce') || false;

    await interaction.deferReply();

    if (enabled) {
      const locked = await lockdownServer(interaction.guild, `[Lockdown by ${interaction.user.tag}] ${reason}`);
      activeLockdowns.set(interaction.guild.id, { until: 0, channels: locked });

      if (announce) {
        const notice = createEmbed({
          title: 'Channel Locked',
          description: `This channel is locked while staff handle a situation.\n**Reason:** ${reason}`
        });
        for (const channelId of locked) {
          const channel = interaction.guild.channels.cache.get(channelId);
          if (channel) await channel.send({ embeds: [notice] }).catch(() => {});
        }
      }

      db.addCase(interaction.guild.id, 'lockdown', interaction.user.id, interaction.user.id, reason, { channels: locked.length });

      await interaction.editReply({
        embeds: [successEmbed('Server Locked Down',
          `Locked **${locked.length}** channel${locked.length === 1 ? '' : 's'}.\n**Reason:** ${reason}\n\n` +
          'Unlock with `/moderation lockdown enabled:false`. Channels already locked before this were left untouched and will stay locked.')]
      });

      await sendLog(interaction.guild, 'moderation', createModLogEmbed({
        action: 'Server Lockdown Started',
        color: MOD_COLORS.LOCK,
        moderator: interaction.user,
        reason,
        extraDetails: { 'Channels Locked': String(locked.length) }
      })).catch(() => {});
      return;
    }

    // Unlocking - prefer the tracked set so we only reopen what we closed.
    const tracked = activeLockdowns.get(interaction.guild.id);
    if (!tracked && !isLockedDown(interaction.guild.id)) {
      return interaction.editReply({
        embeds: [errorEmbed('Not Locked Down', 'I have no record of an active lockdown. Unlock individual channels with `/moderation unlock`.')]
      });
    }

    const unlocked = tracked
      ? await liftLockdown(interaction.guild, tracked.channels, `[Lockdown lifted by ${interaction.user.tag}] ${reason}`)
      : await endRaidLockdown(interaction.guild, true);
    activeLockdowns.delete(interaction.guild.id);

    db.addCase(interaction.guild.id, 'unlockdown', interaction.user.id, interaction.user.id, reason, { channels: unlocked });

    await interaction.editReply({
      embeds: [successEmbed('Server Unlocked', `Reopened **${unlocked}** channel${unlocked === 1 ? '' : 's'}.`)]
    });

    await sendLog(interaction.guild, 'moderation', createModLogEmbed({
      action: 'Server Lockdown Lifted',
      color: MOD_COLORS.UNLOCK,
      moderator: interaction.user,
      reason,
      extraDetails: { 'Channels Unlocked': String(unlocked) }
    })).catch(() => {});
  }
};
