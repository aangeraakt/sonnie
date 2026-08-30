const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const {
  TICKET_PRICE, MAX_TICKETS_PER_USER, DRAW_INTERVAL_MS, HOUSE_SEED, totalTickets
} = require('../../utils/lotterySystem');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lottery')
    .setDescription(`Buy tickets for the server lottery (${TICKET_PRICE} coins each)`)
    .addIntegerOption(opt =>
      opt.setName('tickets')
        .setDescription('How many tickets to buy. Leave empty to just view the pot')
        .setMinValue(1)
        .setMaxValue(MAX_TICKETS_PER_USER)
        .setRequired(false)
    ),

  async execute(interaction) {
    const { guild, user } = interaction;
    const requested = interaction.options.getInteger('tickets');
    const lottery = db.getLottery(guild.id);

    // First use in a server starts the clock.
    if (!lottery.draw_at) {
      db.setLotteryDraw(guild.id, Date.now() + DRAW_INTERVAL_MS);
    }

    const current = db.getLottery(guild.id);
    const mine = current.tickets[user.id] || 0;
    const total = totalTickets(current);
    const pot = current.pot + HOUSE_SEED;

    if (!requested) {
      const players = Object.keys(current.tickets).length;
      return interaction.reply({
        embeds: [createEmbed({
          title: `Server Lottery - ${guild.name}`,
          description: `Tickets cost **${TICKET_PRICE.toLocaleString()}** coins each. One winner takes the whole pot.`,
          fields: [
            { name: 'Current Pot', value: `\`${pot.toLocaleString()} coins\``, inline: true },
            { name: 'Tickets Sold', value: `\`${total}\``, inline: true },
            { name: 'Players', value: `\`${players}\``, inline: true },
            { name: 'Your Tickets', value: `\`${mine}\``, inline: true },
            { name: 'Your Odds', value: total ? `\`${((mine / total) * 100).toFixed(1)}%\`` : '`0%`', inline: true },
            { name: 'Next Draw', value: `<t:${Math.floor(current.draw_at / 1000)}:R>`, inline: true },
            ...(current.last_winner ? [{
              name: 'Last Winner',
              value: `<@${current.last_winner}> won **${current.last_pot.toLocaleString()}** coins`,
              inline: false
            }] : [])
          ],
          footerText: 'A draw needs at least 2 players, otherwise the pot rolls over'
        })]
      });
    }

    if (mine + requested > MAX_TICKETS_PER_USER) {
      return interaction.reply({
        embeds: [errorEmbed('Ticket Limit', `You can hold at most **${MAX_TICKETS_PER_USER}** tickets per draw. You already have **${mine}**.`)],
        flags: 64
      });
    }

    const cost = requested * TICKET_PRICE;
    const profile = db.getUser(guild.id, user.id);
    if (profile.balance < cost) {
      return interaction.reply({
        embeds: [errorEmbed('Not Enough Coins', `**${requested}** ticket${requested === 1 ? '' : 's'} costs **${cost.toLocaleString()}** coins. You have **${profile.balance.toLocaleString()}**.`)],
        flags: 64
      });
    }

    db.addBalance(guild.id, user.id, -cost);
    const updated = db.addLotteryTickets(guild.id, user.id, requested, cost);
    const newTotal = totalTickets(updated);
    const newMine = updated.tickets[user.id];

    return interaction.reply({
      embeds: [successEmbed('Tickets Purchased',
        `You bought **${requested}** ticket${requested === 1 ? '' : 's'} for **${cost.toLocaleString()}** coins.\n\n` +
        `Your tickets: **${newMine}** of ${newTotal} (**${((newMine / newTotal) * 100).toFixed(1)}%** odds)\n` +
        `Pot: **${(updated.pot + HOUSE_SEED).toLocaleString()}** coins\n` +
        `Draw: <t:${Math.floor(updated.draw_at / 1000)}:R>`)]
    });
  }
};
