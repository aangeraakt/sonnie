const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, successEmbed, errorEmbed, infoEmbed, COLORS } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('counting')
    .setDescription('View stats and manage the counting minigame')
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('Check current count, highest streak, and counting settings')
    )
    .addSubcommand(sub =>
      sub
        .setName('leaderboard')
        .setDescription('View the top 10 members who counted the most in this server')
    )
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Manually adjust the current count (Staff only)')
        .addIntegerOption(opt =>
          opt
            .setName('number')
            .setDescription('The new current count number')
            .setMinValue(0)
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (subcommand === 'status') {
      const counting = db.getCounting(guildId);
      if (!counting.channel_id) {
        return interaction.reply({
          embeds: [infoEmbed('Counting Not Set Up', 'The counting minigame is not active yet.\nUse `/config type:counting channel:#channel` to set it up.')]
        });
      }

      const embed = createEmbed({
        title: `Counting Status - ${interaction.guild.name}`,
        description: `Counting channel is currently <#${counting.channel_id}>.`,
        fields: [
          { name: 'Current Count', value: `**${counting.current_count || 0}**`, inline: true },
          { name: 'Next Number', value: `**${(counting.current_count || 0) + 1}**`, inline: true },
          { name: 'Highest Streak', value: `**${counting.highest_count || 0}**`, inline: true },
          { name: 'Last Counter', value: counting.last_user_id ? `<@${counting.last_user_id}>` : '`None`', inline: true },
          { name: 'Double Counting', value: counting.allow_double_counting ? 'Allowed' : 'Disabled', inline: true },
          { name: 'Rewards', value: '+2 Coins & +3 XP per count', inline: true }
        ],
        color: COLORS.INFO
      });

      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'leaderboard') {
      const topCounters = db.getTopCounters(guildId, 10);

      if (!topCounters || topCounters.length === 0) {
        return interaction.reply({
          embeds: [infoEmbed('Counting Leaderboard', 'No counting statistics recorded yet.')]
        });
      }

      const medals = ['1.', '2.', '3.', '4.', '5.', '6.', '7.', '8.', '9.', '10.'];
      const lines = topCounters.map((entry, index) => {
        const medal = medals[index] || `#${index + 1}`;
        return `${medal} <@${entry.user_id}> — **${entry.count}** counts`;
      });

      const embed = createEmbed({
        title: `Top Counters - ${interaction.guild.name}`,
        description: lines.join('\n'),
        color: COLORS.PRIMARY
      });

      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'set') {
      if (
        !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) &&
        !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
      ) {
        return interaction.reply({
          embeds: [errorEmbed('Permission Denied', 'You need `Manage Server` permissions to manually adjust the count.')],
          flags: 64
        });
      }

      const newNumber = interaction.options.getInteger('number');
      db.setCountingNumber(guildId, newNumber);

      return interaction.reply({
        embeds: [
          successEmbed(
            'Count Updated',
            `The current count is now **${newNumber}**.\nThe next expected number is **${newNumber + 1}**.`
          )
        ]
      });
    }
  }
};
