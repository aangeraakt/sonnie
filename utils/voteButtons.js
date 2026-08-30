const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database/db');
const { createEmbed, COLORS, errorEmbed } = require('./embedBuilder');

function suggestionEmbed(data) {
  const up = data.up.length;
  const down = data.down.length;
  const colors = {
    open: COLORS.PRIMARY,
    accepted: COLORS.SUCCESS,
    denied: COLORS.ERROR,
    implemented: COLORS.INFO
  };
  return createEmbed({
    title: `Suggestion · ${data.status}`,
    description: data.content,
    color: colors[data.status] || COLORS.PRIMARY,
    authorName: data.author_tag || 'User',
    fields: [
      { name: 'Upvotes', value: String(up), inline: true },
      { name: 'Downvotes', value: String(down), inline: true },
      { name: 'Author', value: `<@${data.user_id}>`, inline: true }
    ]
  });
}

function suggestionButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('suggest_up').setLabel('Upvote').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('suggest_down').setLabel('Downvote').setStyle(ButtonStyle.Danger)
  );
}

function pollEmbed(data) {
  const lines = data.options.map((option, index) => {
    const votes = option.voters.length;
    return `**${index + 1}.** ${option.label} — **${votes}**`;
  });
  return createEmbed({
    title: data.question,
    description: lines.join('\n')
  });
}

function pollButtons(data) {
  return new ActionRowBuilder().addComponents(
    data.options.slice(0, 5).map((option, index) =>
      new ButtonBuilder()
        .setCustomId(`poll_vote_${index}`)
        .setLabel(`${index + 1}`)
        .setStyle(ButtonStyle.Primary)
    )
  );
}

async function handleSuggestButton(interaction) {
  const data = db.getSuggestion(interaction.message.id);
  if (!data) {
    return interaction.reply({ embeds: [errorEmbed('Closed', 'This suggestion is no longer tracked.')], flags: 64 });
  }
  if (data.status !== 'open') {
    return interaction.reply({ embeds: [errorEmbed('Closed', 'Voting is closed on this suggestion.')], flags: 64 });
  }

  const userId = interaction.user.id;
  const up = new Set(data.up);
  const down = new Set(data.down);
  if (interaction.customId === 'suggest_up') {
    if (up.has(userId)) up.delete(userId);
    else {
      up.add(userId);
      down.delete(userId);
    }
  } else {
    if (down.has(userId)) down.delete(userId);
    else {
      down.add(userId);
      up.delete(userId);
    }
  }

  const saved = db.saveSuggestion(interaction.message.id, {
    ...data,
    up: [...up],
    down: [...down]
  });
  await interaction.update({ embeds: [suggestionEmbed(saved)], components: [suggestionButtons()] });
}

async function handlePollButton(interaction) {
  const data = db.getPoll(interaction.message.id);
  if (!data) {
    return interaction.reply({ embeds: [errorEmbed('Closed', 'This poll is no longer tracked.')], flags: 64 });
  }
  const index = Number(interaction.customId.replace('poll_vote_', ''));
  if (!data.options[index]) {
    return interaction.reply({ embeds: [errorEmbed('Invalid Option', 'That option no longer exists.')], flags: 64 });
  }
  const userId = interaction.user.id;
  for (const option of data.options) {
    option.voters = option.voters.filter((id) => id !== userId);
  }
  data.options[index].voters.push(userId);
  const saved = db.savePoll(interaction.message.id, data);
  await interaction.update({ embeds: [pollEmbed(saved)], components: [pollButtons(saved)] });
}

module.exports = {
  suggestionEmbed,
  suggestionButtons,
  pollEmbed,
  pollButtons,
  handleSuggestButton,
  handlePollButton
};
