const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed } = require('./embedBuilder');

function parseDuration(str) {
  const match = String(str || '').match(/^(\d+)([smhd])$/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === 's') return num * 1000;
  if (unit === 'm') return num * 60 * 1000;
  if (unit === 'h') return num * 60 * 60 * 1000;
  if (unit === 'd') return num * 24 * 60 * 60 * 1000;
  return null;
}

function pickWinners(pool, count) {
  const remaining = [...pool];
  const winners = [];
  const n = Math.min(count, remaining.length);
  for (let i = 0; i < n; i++) {
    const randomIndex = Math.floor(Math.random() * remaining.length);
    winners.push(remaining.splice(randomIndex, 1)[0]);
  }
  return winners;
}

async function collectParticipants(giveaway, msg) {
  const participantIds = new Set(giveaway.entries || []);
  if (msg) {
    const reaction = msg.reactions.cache.get('🎉');
    if (reaction) {
      const fetchedUsers = await reaction.users.fetch();
      fetchedUsers.filter((u) => !u.bot).forEach((u) => participantIds.add(u.id));
    }
  }
  return Array.from(participantIds);
}

function runningEmbed(prize, winnersCount, host, endTimestamp) {
  return createEmbed({
    title: `🎉 GIVEAWAY • ${prize}`,
    description: `Jump in for a chance to win!\n\n🎁 **Prize:** ${prize}\n🏆 **Winners:** ${winnersCount}\n👤 **Host:** ${host}\n⏰ **Ends:** <t:${endTimestamp}:R> (<t:${endTimestamp}:f>)`,
    footerText: 'Sonnies Giveaways • Good luck!'
  });
}

function endedEmbed(prize, winnersText, hostedBy) {
  return createEmbed({
    title: `🎊 GIVEAWAY ENDED • ${prize}`,
    description: `🏆 **Winner(s):** ${winnersText}\n👤 **Hosted By:** <@${hostedBy}>\n\nThanks for entering!`
  });
}

function rerollEmbed(prize, winnerId) {
  return createEmbed({
    title: '🎲 GIVEAWAY REROLL',
    description: `New winner for **${prize}**: <@${winnerId}>!\nCongrats! 🥳`
  });
}

function enterRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('giveaway_enter')
      .setLabel('Enter Giveaway')
      .setEmoji('🎉')
      .setStyle(ButtonStyle.Success)
  );
}

module.exports = {
  parseDuration,
  pickWinners,
  collectParticipants,
  runningEmbed,
  endedEmbed,
  rerollEmbed,
  enterRow
};
