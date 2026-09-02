const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed, COLORS } = require('../../utils/embedBuilder');
const { trackGamble, awardEarnings } = require('../../utils/earnings');

const TARGETS = {
  store: {
    name: '🏪 Quick Mart 24/7',
    baseSuccess: 0.85,
    minLoot: 250,
    maxLoot: 750,
    risk: 'Low',
    cooldownSec: 300, // 5 min
    bonusItem: 'lucky_clover'
  },
  jewelry: {
    name: '💎 Royal Diamonds Jewelry',
    baseSuccess: 0.65,
    minLoot: 1200,
    maxLoot: 3500,
    risk: 'Medium',
    cooldownSec: 600, // 10 min
    bonusItem: 'diamond_ring'
  },
  bank: {
    name: '🏦 Grand Metropolis Bank',
    baseSuccess: 0.45,
    minLoot: 4000,
    maxLoot: 10000,
    risk: 'High',
    cooldownSec: 900, // 15 min
    bonusItem: 'gold_ore'
  },
  vault: {
    name: '🏰 Federal Deep-Bedrock Vault',
    baseSuccess: 0.28,
    minLoot: 15000,
    maxLoot: 40000,
    risk: 'Extreme',
    cooldownSec: 1800, // 30 min
    bonusItem: 'diamond'
  }
};

const INFILTRATION_OPTIONS = [
  { id: 'hack', label: 'Hack Security Cameras', emoji: '💻', modifier: 0.08, desc: 'Loop the CCTV feeds to move unseen.' },
  { id: 'disguise', label: 'Wear Staff Uniform', emoji: '🕶️', modifier: 0.05, desc: 'Blend in as a security guard or janitor.' },
  { id: 'stealth', label: 'Vents & Skylights', emoji: '🪟', modifier: 0.06, desc: 'Drop quietly through ceiling access shafts.' }
];

const GETAWAY_OPTIONS = [
  { id: 'car', label: 'Fast Getaway Muscle Car', emoji: '🚗', modifier: 0.06, desc: 'Speed through alleyways and avoid roadblocks.' },
  { id: 'subway', label: 'Underground Subway', emoji: '🚇', modifier: 0.08, desc: 'Disappear into the underground rail transit network.' },
  { id: 'crowd', label: 'Blend with the Crowd', emoji: '🎭', modifier: 0.04, desc: 'Ditch your mask and walk out with pedestrians.' }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('heist')
    .setDescription('Plan and execute an interactive multi-stage heist with high cash rewards!')
    .addStringOption(opt =>
      opt.setName('target')
        .setDescription('Heist Target')
        .setRequired(true)
        .addChoices(
          { name: '🏪 Quick Mart (Low Risk, $250 - $750)', value: 'store' },
          { name: '💎 Jewelry Store (Medium Risk, $1,200 - $3,500)', value: 'jewelry' },
          { name: '🏦 Grand Metropolis Bank (High Risk, $4,000 - $10,000)', value: 'bank' },
          { name: '🏰 Federal Vault (Extreme Risk, $15,000 - $40,000)', value: 'vault' }
        )
    ),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const targetKey = interaction.options.getString('target');
    const target = TARGETS[targetKey];

    // Check cooldown
    const lastHeist = db.getCooldown(guildId, userId, 'heist');
    const now = Date.now();
    const cooldownMs = target.cooldownSec * 1000;

    if (now < lastHeist) {
      const remainingSeconds = Math.ceil((lastHeist - now) / 1000);
      const mins = Math.floor(remainingSeconds / 60);
      const secs = remainingSeconds % 60;
      return interaction.reply({
        embeds: [errorEmbed('Heist Cooldown 🚨', `The police are still on high alert in your sector!\nYou can plan another heist in **${mins > 0 ? `${mins}m ` : ''}${secs}s**.`)],
        ephemeral: true
      });
    }

    // Set cooldown
    db.setCooldown(guildId, userId, 'heist', now + cooldownMs);

    let infiltrationChoice = null;
    let getawayChoice = null;

    // Stage 1: Infiltration
    const stage1Row = new ActionRowBuilder();
    INFILTRATION_OPTIONS.forEach(opt => {
      stage1Row.addComponents(
        new ButtonBuilder()
          .setCustomId(`heist_s1_${opt.id}`)
          .setLabel(opt.label)
          .setStyle(ButtonStyle.Primary)
          .setEmoji(opt.emoji)
      );
    });

    const stage1Embed = createEmbed({
      title: `🚨 Heist Phase 1: Infiltration`,
      color: COLORS.PRIMARY || 0x5865F2,
      description: `### Target: **${target.name}**\n**Risk Level:** \`${target.risk}\`\n\nYou arrive at the perimeter. How do you breach security?`,
      fields: INFILTRATION_OPTIONS.map(opt => ({
        name: `${opt.emoji} ${opt.label}`,
        value: opt.desc,
        inline: false
      })),
      footerText: 'Choose your entry tactic • 30s timer'
    });

    const response = await interaction.reply({
      embeds: [stage1Embed],
      components: [stage1Row],
      fetchReply: true
    });

    const s1Collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 30_000,
      max: 1
    });

    s1Collector.on('collect', async (i) => {
      if (i.user.id !== userId) {
        return i.reply({ content: "❌ This is not your heist operation!", ephemeral: true });
      }

      const chosenId = i.customId.replace('heist_s1_', '');
      infiltrationChoice = INFILTRATION_OPTIONS.find(o => o.id === chosenId);

      // Stage 2: Getaway
      const stage2Row = new ActionRowBuilder();
      GETAWAY_OPTIONS.forEach(opt => {
        stage2Row.addComponents(
          new ButtonBuilder()
            .setCustomId(`heist_s2_${opt.id}`)
            .setLabel(opt.label)
            .setStyle(ButtonStyle.Success)
            .setEmoji(opt.emoji)
        );
      });

      const stage2Embed = createEmbed({
        title: `💰 Heist Phase 2: Loot Secured & Getaway!`,
        color: COLORS.WARNING || 0xFEE75C,
        description: `### Target: **${target.name}**\n**Entry Tactic Used:** ${infiltrationChoice.emoji} *${infiltrationChoice.label}*\n\nYou managed to bypass the locks and bag the cash! Alarms are sounding—how are you escaping?`,
        fields: GETAWAY_OPTIONS.map(opt => ({
          name: `${opt.emoji} ${opt.label}`,
          value: opt.desc,
          inline: false
        })),
        footerText: 'Choose your getaway route • 30s timer'
      });

      await i.update({
        embeds: [stage2Embed],
        components: [stage2Row]
      }).catch(() => {});

      const s2Collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 30_000,
        max: 1
      });

      s2Collector.on('collect', async (i2) => {
        if (i2.user.id !== userId) {
          return i2.reply({ content: "❌ This is not your heist operation!", ephemeral: true });
        }

        const getChosenId = i2.customId.replace('heist_s2_', '');
        getawayChoice = GETAWAY_OPTIONS.find(o => o.id === getChosenId);

        // Calculate odds
        let totalSuccessChance = target.baseSuccess + (infiltrationChoice?.modifier || 0) + (getawayChoice?.modifier || 0);
        totalSuccessChance = Math.min(0.92, totalSuccessChance);

        const succeeded = Math.random() < totalSuccessChance;

        if (succeeded) {
          const loot = Math.floor(Math.random() * (target.maxLoot - target.minLoot + 1)) + target.minLoot;
          trackGamble(guildId, userId);
          awardEarnings(guildId, userId, loot, 'gather');
          const xpGain = Math.min(200, Math.floor(loot / 150) + 30);
          const { grantXp } = require('../../utils/levelingManager');
          await grantXp(interaction.member, xpGain, { channel: interaction.channel, source: 'heist' });

          let bonusText = '';
          if (target.bonusItem && Math.random() < 0.45) {
            db.addItem(guildId, userId, target.bonusItem, 1);
            bonusText = `\n🎁 **Bonus Item Found:** You also snagged a **1x ${target.bonusItem.replace('_', ' ')}** from the vault!`;
          }

          const successEmbed = createEmbed({
            title: '🏆 HEIST SUCCESSFUL!',
            color: COLORS.SUCCESS || 0x57F287,
            description: `You successfully pulled off the heist at **${target.name}**!\n` +
              `• **Entry:** ${infiltrationChoice.emoji} ${infiltrationChoice.label}\n` +
              `• **Escape:** ${getawayChoice.emoji} ${getawayChoice.label}\n\n` +
              `💵 **Loot Bagged:** **+$${loot.toLocaleString()}** coins!${bonusText}`,
            fields: [
              { name: '👛 New Balance', value: `\`$${db.getUser(guildId, userId).balance.toLocaleString()}\``, inline: true },
              { name: '🎯 Target', value: `\`${target.name}\``, inline: true }
            ]
          });

          await i2.update({
            embeds: [successEmbed],
            components: []
          }).catch(() => {});
        } else {
          // Failure penalty
          const fine = Math.min(db.getUser(guildId, userId).balance, Math.floor(target.minLoot * 0.25));
          if (fine > 0) db.addBalance(guildId, userId, -fine);

          const failEmbed = createEmbed({
            title: '🚔 BUSTED BY POLICE!',
            color: COLORS.ERROR || 0xED4245,
            description: `Sirens blare and SWAT intercepted your escape route from **${target.name}**!\n` +
              `You dropped the loot bag and had to pay **$${fine.toLocaleString()}** coins in bail fees.`,
            fields: [
              { name: '💸 Bail Paid', value: `\`-$${fine.toLocaleString()}\``, inline: true },
              { name: '👛 Remaining Balance', value: `\`$${db.getUser(guildId, userId).balance.toLocaleString()}\``, inline: true }
            ]
          });

          await i2.update({
            embeds: [failEmbed],
            components: []
          }).catch(() => {});
        }
      });
    });
  }
};
