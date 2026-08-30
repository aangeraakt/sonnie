const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed, COLORS } = require('../../utils/embedBuilder');
const { trackGamble } = require('../../utils/earnings');

function generateCrashPoint() {
  // 3% instant crash house edge
  if (Math.random() < 0.03) return 1.00;
  const rand = Math.random();
  // Standard crash curve with 96% RTP
  const point = 0.96 / (1 - rand);
  return Math.max(1.01, Math.min(100.0, Math.floor(point * 100) / 100));
}

function getProgressStages(targetCrash) {
  const multipliers = [1.00];
  let cur = 1.00;
  const step = 0.15;
  while (cur < targetCrash) {
    const increment = cur < 2.0 ? 0.15 : cur < 5.0 ? 0.35 : cur < 10.0 ? 0.85 : 2.5;
    cur = Math.round((cur + increment) * 100) / 100;
    if (cur < targetCrash) {
      multipliers.push(cur);
    } else {
      break;
    }
  }
  multipliers.push(targetCrash);
  return multipliers;
}

function buildGraph(multiplier, crashed = false) {
  const steps = 10;
  const level = Math.min(steps, Math.floor((multiplier - 1.0) / 0.5) + 1);
  const trail = '═'.repeat(Math.max(1, level * 2));
  if (crashed) {
    return `\`${trail}💥\` **CRASHED AT ${multiplier.toFixed(2)}x**`;
  }
  return `\`${trail}🚀\` **${multiplier.toFixed(2)}x**`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('crash')
    .setDescription('Watch the rocket multiplier climb and cash out before it crashes!')
    .addIntegerOption(opt =>
      opt.setName('bet')
        .setDescription('Amount of coins to bet')
        .setRequired(true)
        .setMinValue(10)
    )
    .addNumberOption(opt =>
      opt.setName('auto_cashout')
        .setDescription('Automatically cash out when reaching this multiplier (e.g. 2.0)')
        .setRequired(false)
        .setMinValue(1.05)
        .setMaxValue(50.0)
    ),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const bet = interaction.options.getInteger('bet');
    const autoCashout = interaction.options.getNumber('auto_cashout') || null;

    const user = db.getUser(guildId, userId);
    if (user.balance < bet) {
      return interaction.reply({
        embeds: [errorEmbed('Insufficient Funds', `You need **$${bet.toLocaleString()}** coins, but only have **$${user.balance.toLocaleString()}** in your wallet! 👛`)],
        ephemeral: true
      });
    }

    // Deduct bet immediately
    db.addBalance(guildId, userId, -bet);
    trackGamble(guildId, userId);

    const crashPoint = generateCrashPoint();
    const stages = getProgressStages(crashPoint);

    let stageIndex = 0;
    let hasCashedOut = false;
    let cashedOutMultiplier = 1.0;

    const buildEmbed = (status = 'flying', currentMult = 1.0) => {
      let color = COLORS.PRIMARY || 0x5865F2;
      let title = '🚀 Rocket Crash Game';
      let desc = `The rocket is ascending! Click **Cash Out** before it crashes!`;

      if (status === 'cashed_out') {
        color = COLORS.SUCCESS || 0x57F287;
        title = '🎉 Rocket: Safe Landing!';
        const winAmount = Math.floor(bet * cashedOutMultiplier);
        const profit = winAmount - bet;
        desc = `You successfully cashed out at **${cashedOutMultiplier.toFixed(2)}x**!\nWon **$${winAmount.toLocaleString()}** (Profit: **+$${profit.toLocaleString()}**)`;
      } else if (status === 'crashed') {
        color = COLORS.ERROR || 0xED4245;
        title = '💥 BOOM! Rocket Crashed!';
        desc = `The rocket exploded at **${crashPoint.toFixed(2)}x**!\nYou lost your bet of **$${bet.toLocaleString()}** coins.`;
      }

      const payout = Math.floor(bet * (hasCashedOut ? cashedOutMultiplier : currentMult));

      return createEmbed({
        title,
        color,
        description: `${buildGraph(status === 'crashed' ? crashPoint : currentMult, status === 'crashed')}\n\n${desc}`,
        fields: [
          { name: '💵 Bet', value: `\`$${bet.toLocaleString()}\``, inline: true },
          { name: '📈 Multiplier', value: `\`${(status === 'crashed' ? crashPoint : currentMult).toFixed(2)}x\``, inline: true },
          { name: '💰 Value', value: `\`$${payout.toLocaleString()}\``, inline: true },
          ...(autoCashout ? [{ name: '🎯 Auto-Cashout', value: `\`${autoCashout.toFixed(2)}x\``, inline: true }] : [])
        ],
        footer: { text: status === 'flying' ? 'Hit Cash Out or set an Auto-Cashout' : 'Game Finished' }
      });
    };

    const buildRow = (disabled = false, currentMult = 1.0) => {
      const payout = Math.floor(bet * currentMult);
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('crash_cashout')
          .setLabel(`Cash Out ($${payout.toLocaleString()})`)
          .setStyle(ButtonStyle.Success)
          .setEmoji('💰')
          .setDisabled(disabled)
      );
    };

    const response = await interaction.reply({
      embeds: [buildEmbed('flying', stages[0])],
      components: [buildRow(false, stages[0])],
      fetchReply: true
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 45_000
    });

    let interval = null;

    const finalizeGame = async (outcome, finalMult) => {
      if (interval) clearInterval(interval);
      collector.stop(outcome);

      if (outcome === 'cashed_out') {
        const winAmount = Math.floor(bet * finalMult);
        db.addBalance(guildId, userId, winAmount);
        db.addXP(guildId, userId, Math.min(100, Math.floor(winAmount / 100) + 10));

        await interaction.editReply({
          embeds: [buildEmbed('cashed_out', finalMult)],
          components: [buildRow(true, finalMult)]
        }).catch(() => {});
      } else {
        await interaction.editReply({
          embeds: [buildEmbed('crashed', crashPoint)],
          components: [buildRow(true, crashPoint)]
        }).catch(() => {});
      }
    };

    collector.on('collect', async (i) => {
      if (i.user.id !== userId) {
        return i.reply({ content: "❌ This is not your game of Crash!", ephemeral: true });
      }

      if (i.customId === 'crash_cashout' && !hasCashedOut) {
        hasCashedOut = true;
        cashedOutMultiplier = stages[stageIndex];
        await i.deferUpdate();
        await finalizeGame('cashed_out', cashedOutMultiplier);
      }
    });

    // Animate rocket flight
    interval = setInterval(async () => {
      if (hasCashedOut) {
        clearInterval(interval);
        return;
      }

      stageIndex++;
      if (stageIndex >= stages.length) {
        // Rocket crashed!
        clearInterval(interval);
        if (!hasCashedOut) {
          await finalizeGame('crashed', crashPoint);
        }
        return;
      }

      const currentMult = stages[stageIndex];

      // Check auto-cashout
      if (autoCashout && currentMult >= autoCashout && !hasCashedOut) {
        hasCashedOut = true;
        cashedOutMultiplier = autoCashout;
        clearInterval(interval);
        await finalizeGame('cashed_out', cashedOutMultiplier);
        return;
      }

      await interaction.editReply({
        embeds: [buildEmbed('flying', currentMult)],
        components: [buildRow(false, currentMult)]
      }).catch(() => {
        clearInterval(interval);
      });
    }, 1300);
  }
};
