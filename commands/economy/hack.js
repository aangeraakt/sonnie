const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');
const db = require('../../database/db');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { awardEarnings, trackGamble } = require('../../utils/earnings');

const TARGETS = {
  wifi: {
    name: '📶 Neighbor\'s Wi-Fi Router',
    baseSuccess: 0.82,
    minLoot: 100,
    maxLoot: 350,
    risk: 'Low',
    cooldownSec: 180,
    traceFine: [50, 120]
  },
  database: {
    name: '🗄️ Corporate User Database',
    baseSuccess: 0.6,
    minLoot: 600,
    maxLoot: 1800,
    risk: 'Medium',
    cooldownSec: 480,
    traceFine: [200, 500]
  },
  mainframe: {
    name: '🖥️ Government Mainframe',
    baseSuccess: 0.35,
    minLoot: 2500,
    maxLoot: 7000,
    risk: 'Extreme',
    cooldownSec: 900,
    traceFine: [800, 1800]
  }
};

const EXPLOITS = [
  { id: 'bruteforce', label: 'Brute Force Password', emoji: '🔨', modifier: 0.04, desc: 'Slow, loud, but reliable — hammer the login until it breaks.' },
  { id: 'phishing', label: 'Phishing Payload', emoji: '🎣', modifier: 0.07, desc: 'Trick an employee into handing over their credentials.' },
  { id: 'zeroday', label: 'Zero-Day Exploit', emoji: '🕳️', modifier: 0.1, desc: 'Slip through an unpatched vulnerability before anyone notices.' }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hack')
    .setDescription('Breach a target system for a quick payout — pick your exploit wisely')
    .addStringOption(opt =>
      opt.setName('target')
        .setDescription('What to hack')
        .setRequired(true)
        .addChoices(
          { name: '📶 Wi-Fi Router (Low Risk, $100 - $350)', value: 'wifi' },
          { name: '🗄️ Corporate Database (Medium Risk, $600 - $1,800)', value: 'database' },
          { name: '🖥️ Government Mainframe (Extreme Risk, $2,500 - $7,000)', value: 'mainframe' }
        )
    ),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const targetKey = interaction.options.getString('target');
    const target = TARGETS[targetKey];

    const lastHack = db.getCooldown(guildId, userId, 'hack');
    const now = Date.now();
    const cooldownMs = target.cooldownSec * 1000;

    if (now < lastHack) {
      const remainingSeconds = Math.ceil((lastHack - now) / 1000);
      const mins = Math.floor(remainingSeconds / 60);
      const secs = remainingSeconds % 60;
      return interaction.reply({
        embeds: [errorEmbed('Cooling Down 🧊', `Your VPN needs to reset before another intrusion attempt.\nTry again in **${mins > 0 ? `${mins}m ` : ''}${secs}s**.`)],
        flags: 64
      });
    }

    db.setCooldown(guildId, userId, 'hack', now + cooldownMs);

    const row = new ActionRowBuilder();
    EXPLOITS.forEach(exploit => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`hack_${exploit.id}`)
          .setLabel(exploit.label)
          .setStyle(ButtonStyle.Primary)
          .setEmoji(exploit.emoji)
      );
    });

    const embed = createEmbed({
      title: '💻 Initiating Breach',
      description: `### Target: **${target.name}**\n**Risk Level:** \`${target.risk}\`\n\nYou're in the network's perimeter. Choose your exploit:`,
      fields: EXPLOITS.map(exploit => ({
        name: `${exploit.emoji} ${exploit.label}`,
        value: exploit.desc,
        inline: false
      })),
      footerText: 'Choose an exploit • 20s timer'
    });

    const response = await interaction.reply({
      embeds: [embed],
      components: [row],
      fetchReply: true
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 20_000,
      max: 1
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== userId) {
        return i.reply({ content: '❌ This is not your intrusion attempt!', ephemeral: true });
      }

      const chosenId = i.customId.replace('hack_', '');
      const exploit = EXPLOITS.find(e => e.id === chosenId);

      const totalSuccessChance = Math.min(0.95, target.baseSuccess + (exploit?.modifier || 0));
      const succeeded = Math.random() < totalSuccessChance;

      if (succeeded) {
        const rolled = Math.floor(Math.random() * (target.maxLoot - target.minLoot + 1)) + target.minLoot;
        const loot = awardEarnings(guildId, userId, rolled, 'gather');
        db.addXP(guildId, userId, Math.min(150, Math.floor(loot / 150) + 20));

        const updated = db.getUser(guildId, userId);
        const successResultEmbed = createEmbed({
          title: '✅ BREACH SUCCESSFUL!',
          description: `You cracked **${target.name}** using ${exploit.emoji} *${exploit.label}*!\n\n💵 **Data Exfiltrated:** **+$${loot.toLocaleString()}** coins!`,
          fields: [
            { name: '👛 New Balance', value: `\`$${updated.balance.toLocaleString()}\``, inline: true },
            { name: '🎯 Target', value: `\`${target.name}\``, inline: true }
          ]
        });

        await i.update({ embeds: [successResultEmbed], components: [] }).catch(() => {});
      } else {
        const [fineMin, fineMax] = target.traceFine;
        const fine = Math.min(db.getUser(guildId, userId).balance, Math.floor(Math.random() * (fineMax - fineMin + 1)) + fineMin);
        if (fine > 0) db.addBalance(guildId, userId, -fine);

        const updated = db.getUser(guildId, userId);
        const failResultEmbed = createEmbed({
          title: '🚨 CONNECTION TRACED!',
          description: `Security caught your intrusion on **${target.name}** mid-exploit!\nYou paid **$${fine.toLocaleString()}** coins to scrub the logs before they traced your IP.`,
          fields: [
            { name: '💸 Fine Paid', value: `\`-$${fine.toLocaleString()}\``, inline: true },
            { name: '👛 Remaining Balance', value: `\`$${updated.balance.toLocaleString()}\``, inline: true }
          ]
        });

        await i.update({ embeds: [failResultEmbed], components: [] }).catch(() => {});
      }
    });

    collector.on('end', async (collected) => {
      if (collected.size === 0) {
        const timeoutEmbed = createEmbed({
          title: '⌛ Connection Timed Out',
          description: `You hesitated too long and your access window to **${target.name}** closed.`
        });
        await interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
      }
    });
  }
};
