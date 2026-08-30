const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed } = require('../../utils/embedBuilder');
const { buildRankCard } = require('../../utils/levelCard');
const { levelProgress } = require('../../utils/levelingManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Check your or another user\'s current level and XP rank')
    .addUserOption(opt => opt.setName('user').setDescription('User to check rank for').setRequired(false)),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const guildId = interaction.guild.id;
    const userData = db.getUser(guildId, targetUser.id);
    const progress = levelProgress(userData.xp);

    const ranked = db.getTopXP(guildId, 1000);
    const rank = ranked.findIndex((entry) => entry.user_id === targetUser.id) + 1 || ranked.length + 1;

    const levelCfg = db.getLevelConfig(guildId);
    const guildCfg = db.getGuildConfig(guildId);

    if (levelCfg.card_enabled) {
      await interaction.deferReply();
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      const card = await buildRankCard({
        username: member?.displayName || targetUser.username,
        discriminatorTag: `@${targetUser.username}`,
        avatarURL: targetUser.displayAvatarURL({ extension: 'png', size: 256 }),
        level: progress.level,
        rank,
        totalMembers: ranked.length,
        currentXP: progress.currentXP,
        neededXP: progress.neededXP,
        totalXP: progress.totalXP,
        accentHex: guildCfg.embed_color || '#5865F2',
        prestige: userData.prestige || 0,
        status: member?.presence?.status || null
      });

      if (card) return interaction.editReply({ files: [card] });

      // Canvas failed - fall through to the embed below.
      const embed = buildEmbed(targetUser, progress, rank, ranked.length, userData);
      return interaction.editReply({ embeds: [embed] });
    }

    return interaction.reply({ embeds: [buildEmbed(targetUser, progress, rank, ranked.length, userData)] });
  }
};

function buildEmbed(targetUser, progress, rank, total, userData) {
  const filled = Math.round((progress.currentXP / progress.neededXP) * 20);
  const bar = `${'█'.repeat(Math.max(0, filled))}${'░'.repeat(Math.max(0, 20 - filled))}`;

  return createEmbed({
    title: `Rank Card - ${targetUser.username}`,
    thumbnail: targetUser.displayAvatarURL({ dynamic: true }),
    description: `\`${bar}\` **${Math.floor((progress.currentXP / progress.neededXP) * 100)}%**`,
    fields: [
      { name: 'Level', value: `\`${progress.level}\``, inline: true },
      { name: 'Rank', value: `\`#${rank} / ${total}\``, inline: true },
      { name: 'Prestige', value: `\`${userData.prestige || 0}\``, inline: true },
      { name: 'Progress', value: `\`${progress.currentXP} / ${progress.neededXP} XP\``, inline: true },
      { name: 'Total XP', value: `\`${progress.totalXP} XP\``, inline: true }
    ]
  });
}
