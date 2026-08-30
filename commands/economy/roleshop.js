const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { checkStaffPermission } = require('../../utils/staffSecurity');

const ACTIONS = [
  { name: 'View the role shop', value: 'view' },
  { name: 'Buy a role', value: 'buy' },
  { name: 'Add a role to the shop (admin)', value: 'add' },
  { name: 'Remove a role from the shop (admin)', value: 'remove' }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roleshop')
    .setDescription('Buy server roles with coins')
    .addStringOption(opt => opt.setName('action').setDescription('What to do (default: view)').setRequired(false).addChoices(...ACTIONS))
    .addRoleOption(opt => opt.setName('role').setDescription('The role to buy, add, or remove').setRequired(false))
    .addIntegerOption(opt => opt.setName('price').setDescription('Price in coins when adding a role').setMinValue(1).setRequired(false))
    .addStringOption(opt => opt.setName('description').setDescription('Short description shown in the shop').setMaxLength(100).setRequired(false)),

  async execute(interaction) {
    const { guild, user, member } = interaction;
    const action = interaction.options.getString('action') || 'view';
    const role = interaction.options.getRole('role');

    if (action === 'view') {
      const shop = db.getRoleShop(guild.id);
      if (!shop.length) {
        return interaction.reply({
          embeds: [errorEmbed('Role Shop Is Empty', 'No roles are for sale here yet. An admin can add one with `/economy social roleshop action:add`.')],
          flags: 64
        });
      }

      const profile = db.getUser(guild.id, user.id);
      return interaction.reply({
        embeds: [createEmbed({
          title: `Role Shop - ${guild.name}`,
          description: `Buy with \`/economy social roleshop action:buy role:@role\`.\nYour wallet: **${profile.balance.toLocaleString()}** coins.`,
          fields: shop.map((entry) => ({
            name: `${entry.price.toLocaleString()} coins`,
            value: `<@&${entry.role_id}>${entry.description ? `\n${entry.description}` : ''}${member.roles.cache.has(entry.role_id) ? '\n*You own this*' : ''}`,
            inline: true
          })).slice(0, 25)
        })]
      });
    }

    if (action === 'buy') {
      if (!role) {
        return interaction.reply({ embeds: [errorEmbed('No Role Given', 'Provide the `role` you want to buy.')], flags: 64 });
      }

      const entry = db.getRoleShopEntry(guild.id, role.id);
      if (!entry) {
        return interaction.reply({ embeds: [errorEmbed('Not For Sale', `${role} is not in the role shop. See \`/economy social roleshop\`.`)], flags: 64 });
      }
      if (member.roles.cache.has(role.id)) {
        return interaction.reply({ embeds: [errorEmbed('Already Owned', `You already have ${role}.`)], flags: 64 });
      }

      const me = guild.members.me;
      if (!me?.permissions.has(PermissionFlagsBits.ManageRoles) || role.position >= me.roles.highest.position) {
        return interaction.reply({
          embeds: [errorEmbed('Cannot Grant That Role', `I cannot assign ${role}. Move my role above it and make sure I have **Manage Roles**.`)],
          flags: 64
        });
      }

      const profile = db.getUser(guild.id, user.id);
      if (profile.balance < entry.price) {
        return interaction.reply({
          embeds: [errorEmbed('Not Enough Coins', `${role} costs **${entry.price.toLocaleString()}** coins. You have **${profile.balance.toLocaleString()}**.`)],
          flags: 64
        });
      }

      const granted = await member.roles.add(role, `Purchased from the role shop for ${entry.price} coins`)
        .then(() => true)
        .catch(() => false);

      if (!granted) {
        return interaction.reply({ embeds: [errorEmbed('Purchase Failed', 'Discord rejected the role assignment. You were not charged.')], flags: 64 });
      }

      db.addBalance(guild.id, user.id, -entry.price);
      db.bumpAchievementStat(guild.id, user.id, 'roles_bought', 1);

      return interaction.reply({
        embeds: [successEmbed('Role Purchased', `You bought ${role} for **${entry.price.toLocaleString()}** coins.`)]
      });
    }

    // add and remove are admin-only.
    if (!checkStaffPermission(member, guild, PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [errorEmbed('Permission Denied', 'You need `Administrator` permissions to change the role shop.')],
        flags: 64
      });
    }

    if (!role) {
      return interaction.reply({ embeds: [errorEmbed('No Role Given', 'Provide the `role` to add or remove.')], flags: 64 });
    }

    if (action === 'remove') {
      const removed = db.removeRoleShopEntry(guild.id, role.id);
      return interaction.reply({
        embeds: removed
          ? [successEmbed('Removed From Role Shop', `${role} is no longer for sale. Members who already bought it keep it.`)]
          : [errorEmbed('Not In The Shop', `${role} is not currently for sale.`)],
        flags: removed ? undefined : 64
      });
    }

    // add
    const price = interaction.options.getInteger('price');
    if (!price) {
      return interaction.reply({ embeds: [errorEmbed('No Price Given', 'Provide a `price` in coins.')], flags: 64 });
    }
    if (role.managed) {
      return interaction.reply({ embeds: [errorEmbed('Unusable Role', 'That role is managed by an integration and cannot be assigned.')], flags: 64 });
    }

    const me = guild.members.me;
    if (me && role.position >= me.roles.highest.position) {
      return interaction.reply({
        embeds: [errorEmbed('Role Too High', `${role} sits above my highest role, so I could never grant it. Move my role above it first.`)],
        flags: 64
      });
    }

    db.setRoleShopEntry(guild.id, role.id, price, interaction.options.getString('description') || '');

    return interaction.reply({
      embeds: [successEmbed('Added To Role Shop', `${role} is now on sale for **${price.toLocaleString()}** coins.`)]
    });
  }
};
