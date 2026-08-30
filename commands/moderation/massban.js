const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { createModLogEmbed, MOD_COLORS } = require('../../utils/modLogger');
const { checkStaffPermission } = require('../../utils/staffSecurity');
const { sendLog } = require('../../utils/auditLogger');

const ID_PATTERN = /\d{17,20}/g;
const MAX_TARGETS = 50;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('massban')
    .setDescription('Ban many users at once by ID (raid cleanup)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt.setName('users')
        .setDescription('User IDs or mentions, separated by spaces or commas')
        .setRequired(true)
    )
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for the mass ban').setRequired(false))
    .addIntegerOption(opt =>
      opt.setName('delete_days')
        .setDescription('Days of their messages to delete (0-7)')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false)
    ),

  async execute(interaction) {
    // Deliberately stricter than the ban permission: this is a bulk destructive action.
    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission Denied', 'You need `Administrator` permissions to mass-ban.')],
        flags: 64
      });
    }

    const raw = interaction.options.getString('users');
    const reason = interaction.options.getString('reason') || 'Mass ban';
    const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

    const ids = [...new Set(raw.match(ID_PATTERN) || [])];
    if (!ids.length) {
      return interaction.reply({ embeds: [errorEmbed('No IDs Found', 'Provide user IDs or mentions, e.g. `123456789012345678 987654321098765432`.')], flags: 64 });
    }
    if (ids.length > MAX_TARGETS) {
      return interaction.reply({ embeds: [errorEmbed('Too Many Targets', `Ban at most **${MAX_TARGETS}** users per command. You gave ${ids.length}.`)], flags: 64 });
    }

    // Filter out anyone the moderator is not allowed to touch.
    const me = interaction.guild.members.me;
    const skipped = [];
    const targets = [];

    for (const id of ids) {
      if (id === interaction.user.id) {
        skipped.push({ id, why: 'that is you' });
        continue;
      }
      if (id === interaction.guild.ownerId) {
        skipped.push({ id, why: 'server owner' });
        continue;
      }
      if (id === interaction.client.user.id) {
        skipped.push({ id, why: 'that is me' });
        continue;
      }

      const member = await interaction.guild.members.fetch(id).catch(() => null);
      if (member) {
        if (!member.bannable) {
          skipped.push({ id, why: 'above my highest role' });
          continue;
        }
        if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
          skipped.push({ id, why: 'equal or higher than your role' });
          continue;
        }
      }
      targets.push(id);
    }

    if (!targets.length) {
      return interaction.reply({
        embeds: [errorEmbed('Nothing to Ban', `All ${ids.length} target(s) were skipped:\n${skipped.map((s) => `\`${s.id}\` - ${s.why}`).join('\n').slice(0, 1500)}`)],
        flags: 64
      });
    }

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('massban_go').setLabel(`Ban ${targets.length} users`).setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('massban_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      embeds: [createEmbed({
        title: 'Confirm Mass Ban',
        description: `You are about to ban **${targets.length}** user${targets.length === 1 ? '' : 's'}.\nThis cannot be undone in bulk.`,
        fields: [
          { name: 'Reason', value: reason, inline: true },
          { name: 'Message Purge', value: deleteDays ? `${deleteDays} day(s)` : 'None', inline: true },
          ...(skipped.length ? [{ name: `Skipped (${skipped.length})`, value: skipped.map((s) => `\`${s.id}\` - ${s.why}`).join('\n').slice(0, 1000) }] : [])
        ]
      })],
      components: [confirmRow]
    });

    const message = await interaction.fetchReply().catch(() => null);
    if (!message) return;

    let handled = false;
    const collector = message.createMessageComponentCollector({ time: 30000, max: 1 });

    collector.on('collect', async (component) => {
      if (component.user.id !== interaction.user.id) {
        return component.reply({ embeds: [errorEmbed('Not Your Confirmation', 'Only the moderator who ran this can confirm it.')], flags: 64 }).catch(() => {});
      }
      handled = true;

      if (component.customId === 'massban_cancel') {
        return component.update({ embeds: [errorEmbed('Mass Ban Cancelled', 'No one was banned.')], components: [] }).catch(() => {});
      }

      await component.update({
        embeds: [createEmbed({ title: 'Mass Ban Running', description: `Banning ${targets.length} users...` })],
        components: []
      }).catch(() => {});

      let banned = 0;
      const failed = [];
      for (const id of targets) {
        const ok = await interaction.guild.members.ban(id, {
          reason: `[Massban by ${interaction.user.tag}] ${reason}`,
          deleteMessageSeconds: deleteDays * 86400
        }).then(() => true).catch(() => false);

        if (ok) {
          banned += 1;
          db.addCase(interaction.guild.id, 'ban', id, interaction.user.id, `[Mass ban] ${reason}`);
        } else {
          failed.push(id);
        }
      }

      await interaction.editReply({
        embeds: [successEmbed('Mass Ban Complete',
          `Banned **${banned}** of ${targets.length} target${targets.length === 1 ? '' : 's'}.` +
          (failed.length ? `\n\nFailed: ${failed.map((id) => `\`${id}\``).join(', ').slice(0, 1000)}` : ''))],
        components: []
      }).catch(() => {});

      await sendLog(interaction.guild, 'moderation', createModLogEmbed({
        action: 'Mass Ban Executed',
        color: MOD_COLORS.BAN,
        moderator: interaction.user,
        reason,
        extraDetails: {
          'Banned': `${banned}`,
          'Failed': `${failed.length}`,
          'Skipped': `${skipped.length}`,
          'Message Purge': deleteDays ? `${deleteDays} day(s)` : 'None'
        }
      })).catch(() => {});
    });

    collector.on('end', () => {
      if (handled) return;
      interaction.editReply({
        embeds: [errorEmbed('Mass Ban Timed Out', 'No confirmation within 30 seconds - nobody was banned.')],
        components: []
      }).catch(() => {});
    });
  }
};
