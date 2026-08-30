const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed } = require('../../utils/embedBuilder');
const { ACHIEVEMENTS, checkAchievements } = require('../../utils/achievements');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('achievements')
    .setDescription('See which achievements you have unlocked')
    .addUserOption(opt => opt.setName('user').setDescription('Whose achievements to view').setRequired(false)),

  async execute(interaction) {
    const { guild } = interaction;
    const target = interaction.options.getUser('user') || interaction.user;

    // Catch up anything they earned before this system existed.
    const justUnlocked = checkAchievements(guild.id, target.id);
    const record = db.getAchievements(guild.id, target.id);

    const entries = Object.entries(ACHIEVEMENTS);
    const unlocked = entries.filter(([id]) => record.unlocked[id]);
    const locked = entries.filter(([id]) => !record.unlocked[id]);

    const unlockedText = unlocked
      .map(([id, item]) => `${item.emoji} **${item.name}** - <t:${Math.floor(record.unlocked[id] / 1000)}:d>`)
      .join('\n');

    const lockedText = locked
      .map(([, item]) => `🔒 **${item.name}** - ${item.description}${item.reward ? ` *(${item.reward.toLocaleString()} coins)*` : ''}`)
      .join('\n');

    const percent = Math.round((unlocked.length / entries.length) * 100);
    const filled = Math.round(percent / 5);

    const fields = [
      { name: 'Progress', value: `\`${'█'.repeat(filled)}${'░'.repeat(20 - filled)}\` **${unlocked.length}/${entries.length}** (${percent}%)`, inline: false }
    ];

    if (unlockedText) fields.push({ name: `Unlocked (${unlocked.length})`, value: unlockedText.slice(0, 1020), inline: false });
    if (lockedText) fields.push({ name: `Locked (${locked.length})`, value: lockedText.slice(0, 1020), inline: false });

    return interaction.reply({
      embeds: [createEmbed({
        title: `Achievements - ${target.username}`,
        thumbnail: target.displayAvatarURL({ dynamic: true }),
        fields,
        footerText: justUnlocked.length
          ? `${justUnlocked.length} achievement(s) just unlocked and paid out`
          : 'Rewards are paid automatically the moment you qualify'
      })]
    });
  }
};
