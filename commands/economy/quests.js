const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed, successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { getDailyQuests, claimQuests, isComplete } = require('../../utils/questSystem');
const { checkAndAnnounce } = require('../../utils/achievements');

function questLine(quest) {
  const done = isComplete(quest);
  const ratio = Math.min(1, quest.progress / quest.goal);
  const filled = Math.round(ratio * 10);
  const status = quest.claimed ? 'Claimed' : (done ? 'Ready to claim' : `${quest.progress.toLocaleString()} / ${quest.goal.toLocaleString()}`);

  return `${quest.emoji} **${quest.name}** - ${quest.description}\n` +
    `\`${'█'.repeat(filled)}${'░'.repeat(10 - filled)}\` ${status} • **${quest.reward.toLocaleString()}** coins`;
}

function midnightUnix() {
  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);
  return Math.floor(tomorrow.getTime() / 1000);
}

function render(record) {
  const claimable = record.quests.filter((quest) => isComplete(quest) && !quest.claimed);

  return createEmbed({
    title: 'Daily Quests',
    description: record.quests.map(questLine).join('\n\n'),
    fields: [
      { name: 'Quest Streak', value: `\`${record.streak || 0} day${(record.streak || 0) === 1 ? '' : 's'}\``, inline: true },
      { name: 'Ready to Claim', value: `\`${claimable.length}\``, inline: true },
      { name: 'Resets', value: `<t:${midnightUnix()}:R>`, inline: true }
    ],
    footerText: 'Finish all three in one day to extend your streak and earn a bonus'
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quests')
    .setDescription('View and claim your daily quests'),

  async execute(interaction) {
    const { guild, user } = interaction;
    const record = getDailyQuests(guild.id, user.id);
    const claimable = record.quests.filter((quest) => isComplete(quest) && !quest.claimed);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('quest_claim')
        .setLabel(claimable.length ? `Claim ${claimable.length} reward${claimable.length === 1 ? '' : 's'}` : 'Nothing to claim')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!claimable.length)
    );

    await interaction.reply({ embeds: [render(record)], components: [row] });

    if (!claimable.length) return;

    const message = await interaction.fetchReply().catch(() => null);
    if (!message) return;

    const collector = message.createMessageComponentCollector({ time: 120000 });

    collector.on('collect', async (component) => {
      if (component.user.id !== user.id) {
        return component.reply({
          embeds: [errorEmbed('Not Your Quests', 'Run `/economy social quests` to see your own.')],
          flags: 64
        }).catch(() => {});
      }

      const result = claimQuests(guild.id, user.id);
      if (!result.claimed.length) {
        return component.reply({ embeds: [errorEmbed('Nothing to Claim', 'You already claimed everything available today.')], flags: 64 }).catch(() => {});
      }

      const updated = getDailyQuests(guild.id, user.id);
      await component.update({
        embeds: [
          render(updated),
          successEmbed('Quest Rewards Claimed',
            `${result.claimed.map((quest) => `${quest.emoji} **${quest.name}** - ${quest.reward.toLocaleString()} coins`).join('\n')}` +
            (result.bonus ? `\n\n**Streak bonus (day ${result.streak}):** ${result.bonus.toLocaleString()} coins` : '') +
            `\n\n**Total: ${result.total.toLocaleString()} coins**`)
        ],
        components: []
      }).catch(() => {});

      collector.stop();
      await checkAndAnnounce(interaction);
    });

    collector.on('end', (collected) => {
      if (collected.size) return;
      interaction.editReply({ components: [] }).catch(() => {});
    });
  }
};
