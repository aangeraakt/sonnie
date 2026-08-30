const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { checkAndAnnounce } = require('../../utils/achievements');

const CREATE_COST = 50000;
const MAX_MEMBERS = 20;
const NAME_PATTERN = /^[\w '-]{3,24}$/;

function clanXpForLevel(level) {
  return 25000 * level * level;
}

function addClanXp(guildId, clan, amount) {
  let xp = clan.xp + amount;
  let level = clan.level;
  let leveledUp = false;

  while (xp >= clanXpForLevel(level)) {
    xp -= clanXpForLevel(level);
    level += 1;
    leveledUp = true;
  }

  db.updateClan(guildId, clan.id, { xp, level });
  return { xp, level, leveledUp };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clan')
    .setDescription('Create or join a clan and build a shared bank')
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription(`Found a new clan (${CREATE_COST.toLocaleString()} coins)`)
        .addStringOption(opt => opt.setName('name').setDescription('Clan name (3-24 characters)').setMinLength(3).setMaxLength(24).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('join')
        .setDescription('Join an existing clan')
        .addStringOption(opt => opt.setName('name').setDescription('Clan to join').setRequired(true))
    )
    .addSubcommand(sub => sub.setName('leave').setDescription('Leave your current clan'))
    .addSubcommand(sub =>
      sub.setName('info')
        .setDescription('View a clan')
        .addStringOption(opt => opt.setName('name').setDescription('Clan to view (default: yours)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('deposit')
        .setDescription('Contribute coins to the clan bank')
        .addIntegerOption(opt => opt.setName('amount').setDescription('Coins to deposit').setMinValue(1).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('withdraw')
        .setDescription('Take coins out of the clan bank (leader only)')
        .addIntegerOption(opt => opt.setName('amount').setDescription('Coins to withdraw').setMinValue(1).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('kick')
        .setDescription('Remove a member from your clan (leader only)')
        .addUserOption(opt => opt.setName('user').setDescription('Member to remove').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('motto')
        .setDescription('Set your clan motto (leader only)')
        .addStringOption(opt => opt.setName('text').setDescription('The motto').setMaxLength(150).setRequired(true))
    )
    .addSubcommand(sub => sub.setName('leaderboard').setDescription('The strongest clans in this server')),

  async execute(interaction) {
    const { guild, user } = interaction;
    const sub = interaction.options.getSubcommand();
    const own = db.getClanByMember(guild.id, user.id);

    if (sub === 'leaderboard') {
      const top = db.getClanLeaderboard(guild.id, 10);
      if (!top.length) {
        return interaction.reply({ embeds: [errorEmbed('No Clans', 'No clans exist here yet. Found one with `/clan create`.')], flags: 64 });
      }
      return interaction.reply({
        embeds: [createEmbed({
          title: `Clan Leaderboard - ${guild.name}`,
          description: top.map((clan, index) =>
            `\`${index + 1}.\` **${clan.name}** - Level ${clan.level}\n ${clan.members.length} member${clan.members.length === 1 ? '' : 's'} • ${clan.bank.toLocaleString()} coins banked`
          ).join('\n\n')
        })]
      });
    }

    if (sub === 'create') {
      if (own) {
        return interaction.reply({ embeds: [errorEmbed('Already in a Clan', `You are already in **${own.name}**. Leave it first with \`/clan leave\`.`)], flags: 64 });
      }

      const name = interaction.options.getString('name').trim();
      if (!NAME_PATTERN.test(name)) {
        return interaction.reply({ embeds: [errorEmbed('Invalid Name', 'Clan names must be 3-24 characters using letters, numbers, spaces, hyphens, or apostrophes.')], flags: 64 });
      }
      if (db.getClanByName(guild.id, name)) {
        return interaction.reply({ embeds: [errorEmbed('Name Taken', `A clan called **${name}** already exists here.`)], flags: 64 });
      }

      const profile = db.getUser(guild.id, user.id);
      if (profile.balance < CREATE_COST) {
        return interaction.reply({
          embeds: [errorEmbed('Not Enough Coins', `Founding a clan costs **${CREATE_COST.toLocaleString()}** coins. You have **${profile.balance.toLocaleString()}**.`)],
          flags: 64
        });
      }

      db.addBalance(guild.id, user.id, -CREATE_COST);
      const clan = db.createClan(guild.id, name, user.id);

      await interaction.reply({
        embeds: [successEmbed('Clan Founded',
          `**${clan.name}** has been founded, with you as its leader.\n\nOthers can join with \`/clan join name:${clan.name}\`.\nMembers grow the clan by depositing coins - every 1,000 banked adds 1,000 clan XP.`)]
      });
      return checkAndAnnounce(interaction);
    }

    if (sub === 'join') {
      if (own) {
        return interaction.reply({ embeds: [errorEmbed('Already in a Clan', `You are already in **${own.name}**.`)], flags: 64 });
      }

      const clan = db.getClanByName(guild.id, interaction.options.getString('name'));
      if (!clan) {
        return interaction.reply({ embeds: [errorEmbed('Clan Not Found', 'No clan by that name exists here. See `/clan leaderboard`.')], flags: 64 });
      }
      if (clan.members.length >= MAX_MEMBERS) {
        return interaction.reply({ embeds: [errorEmbed('Clan Is Full', `**${clan.name}** already has the maximum of ${MAX_MEMBERS} members.`)], flags: 64 });
      }

      clan.members.push(user.id);
      db.updateClan(guild.id, clan.id, { members: clan.members });

      await interaction.reply({
        embeds: [successEmbed('Clan Joined', `You joined **${clan.name}**. It now has **${clan.members.length}** members.`)]
      });
      return checkAndAnnounce(interaction);
    }

    if (sub === 'info') {
      const requested = interaction.options.getString('name');
      const clan = requested ? db.getClanByName(guild.id, requested) : own;

      if (!clan) {
        return interaction.reply({
          embeds: [errorEmbed('No Clan', requested ? 'No clan by that name exists here.' : 'You are not in a clan. Join one with `/clan join`.')],
          flags: 64
        });
      }

      return interaction.reply({
        embeds: [createEmbed({
          title: `Clan - ${clan.name}`,
          description: clan.motto ? `*${clan.motto}*` : 'No motto set.',
          fields: [
            { name: 'Leader', value: `<@${clan.owner_id}>`, inline: true },
            { name: 'Level', value: `\`${clan.level}\``, inline: true },
            { name: 'Clan XP', value: `\`${clan.xp.toLocaleString()} / ${clanXpForLevel(clan.level).toLocaleString()}\``, inline: true },
            { name: 'Bank', value: `\`${clan.bank.toLocaleString()} coins\``, inline: true },
            { name: 'Members', value: `\`${clan.members.length} / ${MAX_MEMBERS}\``, inline: true },
            { name: 'Founded', value: `<t:${Math.floor(clan.created_at / 1000)}:R>`, inline: true },
            { name: 'Roster', value: clan.members.map((id) => `<@${id}>`).join(' ').slice(0, 1000), inline: false }
          ]
        })]
      });
    }

    // Everything below needs clan membership.
    if (!own) {
      return interaction.reply({ embeds: [errorEmbed('Not in a Clan', 'Join a clan first with `/clan join`, or found one with `/clan create`.')], flags: 64 });
    }

    if (sub === 'leave') {
      if (own.owner_id === user.id) {
        if (own.members.length > 1) {
          // Hand leadership to the next member rather than stranding the clan.
          const heir = own.members.find((id) => id !== user.id);
          db.updateClan(guild.id, own.id, {
            owner_id: heir,
            members: own.members.filter((id) => id !== user.id)
          });
          return interaction.reply({
            embeds: [successEmbed('Clan Left', `You left **${own.name}**. Leadership passed to <@${heir}>.`)]
          });
        }
        db.deleteClan(guild.id, own.id);
        return interaction.reply({
          embeds: [successEmbed('Clan Disbanded', `You were the last member, so **${own.name}** has been disbanded. The ${own.bank.toLocaleString()} coins in its bank were lost.`)]
        });
      }

      db.updateClan(guild.id, own.id, { members: own.members.filter((id) => id !== user.id) });
      return interaction.reply({ embeds: [successEmbed('Clan Left', `You left **${own.name}**.`)] });
    }

    if (sub === 'deposit') {
      const amount = interaction.options.getInteger('amount');
      const profile = db.getUser(guild.id, user.id);

      if (profile.balance < amount) {
        return interaction.reply({ embeds: [errorEmbed('Not Enough Coins', `You have **${profile.balance.toLocaleString()}** coins in your wallet.`)], flags: 64 });
      }

      db.addBalance(guild.id, user.id, -amount);
      db.updateClan(guild.id, own.id, { bank: own.bank + amount });
      const progress = addClanXp(guild.id, own, Math.floor(amount));

      return interaction.reply({
        embeds: [successEmbed('Deposited to Clan Bank',
          `You added **${amount.toLocaleString()}** coins to **${own.name}**.\nClan bank: **${(own.bank + amount).toLocaleString()}** coins.` +
          (progress.leveledUp ? `\n\n**${own.name}** reached clan level **${progress.level}**!` : ''))]
      });
    }

    if (sub === 'withdraw') {
      if (own.owner_id !== user.id) {
        return interaction.reply({ embeds: [errorEmbed('Leader Only', `Only <@${own.owner_id}> can withdraw from the clan bank.`)], flags: 64 });
      }

      const amount = interaction.options.getInteger('amount');
      if (own.bank < amount) {
        return interaction.reply({ embeds: [errorEmbed('Not Enough in Bank', `**${own.name}** has **${own.bank.toLocaleString()}** coins banked.`)], flags: 64 });
      }

      db.updateClan(guild.id, own.id, { bank: own.bank - amount });
      db.addBalance(guild.id, user.id, amount);

      return interaction.reply({
        embeds: [successEmbed('Withdrawn from Clan Bank', `You took **${amount.toLocaleString()}** coins.\nClan bank: **${(own.bank - amount).toLocaleString()}** coins.`)]
      });
    }

    if (sub === 'kick') {
      if (own.owner_id !== user.id) {
        return interaction.reply({ embeds: [errorEmbed('Leader Only', 'Only the clan leader can remove members.')], flags: 64 });
      }

      const target = interaction.options.getUser('user');
      if (target.id === user.id) {
        return interaction.reply({ embeds: [errorEmbed('Cannot Kick Yourself', 'Use `/clan leave` instead.')], flags: 64 });
      }
      if (!own.members.includes(target.id)) {
        return interaction.reply({ embeds: [errorEmbed('Not a Member', `**${target.tag}** is not in **${own.name}**.`)], flags: 64 });
      }

      db.updateClan(guild.id, own.id, { members: own.members.filter((id) => id !== target.id) });
      return interaction.reply({ embeds: [successEmbed('Member Removed', `**${target.tag}** was removed from **${own.name}**.`)] });
    }

    if (sub === 'motto') {
      if (own.owner_id !== user.id) {
        return interaction.reply({ embeds: [errorEmbed('Leader Only', 'Only the clan leader can set the motto.')], flags: 64 });
      }
      const motto = interaction.options.getString('text');
      db.updateClan(guild.id, own.id, { motto });
      return interaction.reply({ embeds: [successEmbed('Motto Updated', `**${own.name}**: *${motto}*`)] });
    }

    return interaction.reply({ embeds: [errorEmbed('Unknown Option', 'That clan option is not available.')], flags: 64 });
  }
};
