const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { checkStaffPermission } = require('../../utils/staffSecurity');

const PERIODS = [
  { name: 'Last 24 hours', value: '1' },
  { name: 'Last 7 days', value: '7' },
  { name: 'Last 30 days', value: '30' },
  { name: 'All time', value: '0' }
];

const TYPE_LABELS = {
  warn: 'Warnings',
  unwarn: 'Warnings removed',
  kick: 'Kicks',
  ban: 'Bans',
  unban: 'Unbans',
  tempban: 'Temp bans',
  softban: 'Soft bans',
  timeout: 'Timeouts',
  untimeout: 'Timeouts lifted',
  purge: 'Purges',
  antinuke: 'Anti-nuke actions'
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('modstats')
    .setDescription('Moderation activity statistics for the server or one moderator')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(opt => opt.setName('moderator').setDescription('Show only this moderator\'s actions').setRequired(false))
    .addStringOption(opt =>
      opt.setName('period')
        .setDescription('Time range (default: last 30 days)')
        .setRequired(false)
        .addChoices(...PERIODS)
    ),

  async execute(interaction) {
    if (!checkStaffPermission(interaction.member, interaction.guild, PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission Denied', 'You need moderator permissions to view moderation statistics.')],
        flags: 64
      });
    }

    const moderator = interaction.options.getUser('moderator');
    const days = Number(interaction.options.getString('period') ?? '30');
    const sinceMs = days > 0 ? Date.now() - days * 86400000 : 0;
    const periodLabel = days > 0 ? `Last ${days} day${days === 1 ? '' : 's'}` : 'All time';

    const stats = db.getModStats(interaction.guild.id, moderator?.id || null, sinceMs);

    if (!stats.total) {
      return interaction.reply({
        embeds: [errorEmbed('No Activity', moderator
          ? `**${moderator.tag}** has no logged moderation actions in that period.`
          : 'No moderation actions were logged in that period.')],
        flags: 64
      });
    }

    const breakdown = Object.entries(stats.byType)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `${TYPE_LABELS[type] || type}: **${count}**`)
      .join('\n');

    const fields = [
      { name: 'Total Actions', value: `\`${stats.total}\``, inline: true },
      { name: 'Period', value: periodLabel, inline: true },
      { name: 'Breakdown', value: breakdown, inline: false }
    ];

    if (!moderator) {
      const leaderboard = Object.entries(stats.byModerator)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([id, count], index) => `\`${index + 1}.\` <@${id}> - **${count}** action${count === 1 ? '' : 's'}`)
        .join('\n');
      fields.push({ name: 'Most Active Moderators', value: leaderboard, inline: false });
    } else {
      const recent = stats.cases
        .slice(-5)
        .reverse()
        .map((item) => `\`${item.type}\` on <@${item.user_id}> - <t:${Math.floor(new Date(item.timestamp).getTime() / 1000)}:R>`)
        .join('\n');
      fields.push({ name: 'Most Recent', value: recent || '`None`', inline: false });
    }

    return interaction.reply({
      embeds: [createEmbed({
        title: moderator ? `Moderation Stats - ${moderator.username}` : `Moderation Stats - ${interaction.guild.name}`,
        thumbnail: moderator ? moderator.displayAvatarURL({ dynamic: true }) : interaction.guild.iconURL({ dynamic: true }),
        fields,
        footerText: 'Counted from the case log'
      })]
    });
  }
};
