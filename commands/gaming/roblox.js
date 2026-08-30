const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, errorEmbed, infoEmbed } = require('../../utils/embedBuilder');
const api = require('../../utils/gameApis');

const ROBLOX_RED = 0xE2231A;

async function resolveUser(username) {
  const named = await api.robloxUserByName(username);
  if (!named?.id) return null;
  const user = await api.robloxUser(named.id);
  return user;
}

function profileUrl(id) {
  return `https://www.roblox.com/users/${id}/profile`;
}

function createdStamp(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '`Unknown`';
  return `<t:${Math.floor(ms / 1000)}:D>`;
}

function clip(text, max = 400) {
  const value = String(text || '').trim();
  if (!value) return 'No description.';
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roblox')
    .setDescription('Roblox user, inventory, avatar, game, and group lookup')
    .addSubcommand(sub =>
      sub
        .setName('user')
        .setDescription('Look up a Roblox user')
        .addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('inventory')
        .setDescription('View limiteds and RAP for a Roblox user')
        .addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('avatar')
        .setDescription('Show a Roblox avatar and currently worn items')
        .addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('game')
        .setDescription('Look up a Roblox experience')
        .addStringOption(opt => opt.setName('query').setDescription('Experience name or place ID').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('group')
        .setDescription('Look up a Roblox group')
        .addStringOption(opt => opt.setName('query').setDescription('Group name or ID').setRequired(true))
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply();

    try {
      if (subcommand === 'user') {
        const username = interaction.options.getString('username');
        const user = await resolveUser(username);
        if (!user) {
          return interaction.editReply({ embeds: [errorEmbed('User Not Found', `No Roblox user named \`${username}\`.`)] });
        }
        const [counts, presence, headshot, groups] = await Promise.all([
          api.robloxCounts(user.id),
          api.robloxPresence(user.id),
          api.robloxHeadshot(user.id),
          api.robloxGroups(user.id)
        ]);
        const topGroups = groups.slice(0, 5).map((entry) => entry.group?.name).filter(Boolean);
        const fields = [
          { name: 'User ID', value: `\`${user.id}\``, inline: true },
          { name: 'Display name', value: `\`${user.displayName || user.name}\``, inline: true },
          { name: 'Created', value: createdStamp(user.created), inline: true },
          { name: 'Status', value: user.isBanned ? 'Banned' : api.presenceLabel(presence?.userPresenceType), inline: true },
          { name: 'Friends', value: `\`${api.formatCount(counts.friends)}\``, inline: true },
          { name: 'Followers', value: `\`${api.formatCount(counts.followers)}\``, inline: true },
          { name: 'Following', value: `\`${api.formatCount(counts.followings)}\``, inline: true },
          { name: 'Verified', value: user.hasVerifiedBadge ? 'Yes' : 'No', inline: true }
        ];
        if (presence?.lastLocation && presence.userPresenceType === 2) {
          fields.push({ name: 'Playing', value: `\`${presence.lastLocation}\``, inline: true });
        }
        if (topGroups.length) {
          fields.push({ name: 'Groups', value: topGroups.join(', '), inline: false });
        }
        return interaction.editReply({
          embeds: [createEmbed({
            title: `@${user.name}`,
            url: profileUrl(user.id),
            description: clip(user.description, 300),
            color: ROBLOX_RED,
            thumbnail: headshot,
            fields,
            footerText: 'Sonnies Gaming • Roblox'
          })]
        });
      }

      if (subcommand === 'inventory') {
        const username = interaction.options.getString('username');
        const user = await resolveUser(username);
        if (!user) {
          return interaction.editReply({ embeds: [errorEmbed('User Not Found', `No Roblox user named \`${username}\`.`)] });
        }
        const res = await api.robloxCollectibles(user.id);
        if (res.status === 403) {
          return interaction.editReply({
            embeds: [infoEmbed('Inventory Private', `**@${user.name}** has a private inventory.`)]
          });
        }
        if (!res.ok) {
          return interaction.editReply({ embeds: [errorEmbed('Inventory Failed', 'Could not load that Roblox inventory.')] });
        }
        const items = Array.isArray(res.data?.data) ? res.data.data : [];
        if (!items.length) {
          return interaction.editReply({
            embeds: [infoEmbed('No Collectibles', `**@${user.name}** has no public limiteds to show.`)]
          });
        }
        const rap = items.reduce((sum, item) => sum + Number(item.recentAveragePrice || 0), 0);
        const lines = items.slice(0, 10).map((item) => {
          const price = Number(item.recentAveragePrice || 0).toLocaleString('en-US');
          const serial = item.serialNumber ? ` #${item.serialNumber}` : '';
          return `**${item.name}**${serial} — RAP ${price}`;
        });
        return interaction.editReply({
          embeds: [createEmbed({
            title: `@${user.name} inventory`,
            url: profileUrl(user.id),
            description: `Public limiteds / collectibles.\nShown RAP: **${rap.toLocaleString('en-US')}**`,
            color: ROBLOX_RED,
            fields: [{ name: 'Items', value: lines.join('\n').slice(0, 1024) }],
            footerText: items.length === 25 ? 'Sonnies Gaming • First 25 collectibles' : 'Sonnies Gaming • Roblox'
          })]
        });
      }

      if (subcommand === 'avatar') {
        const username = interaction.options.getString('username');
        const user = await resolveUser(username);
        if (!user) {
          return interaction.editReply({ embeds: [errorEmbed('User Not Found', `No Roblox user named \`${username}\`.`)] });
        }
        const [avatar, wearing] = await Promise.all([
          api.robloxAvatar(user.id),
          api.robloxWearing(user.id)
        ]);
        const ids = wearing.slice(0, 10);
        const names = await Promise.all(ids.map((id) => api.robloxAssetName(id)));
        const worn = names.filter(Boolean).map((name) => `\`${name}\``).join('\n') || 'Nothing equipped.';
        return interaction.editReply({
          embeds: [createEmbed({
            title: `@${user.name} avatar`,
            url: profileUrl(user.id),
            description: `Currently wearing **${wearing.length}** items.`,
            color: ROBLOX_RED,
            image: avatar,
            fields: [{ name: 'Wearing', value: worn.slice(0, 1024) }],
            footerText: 'Sonnies Gaming • Roblox'
          })]
        });
      }

      if (subcommand === 'game') {
        const query = interaction.options.getString('query');
        let universeId = null;
        if (/^\d+$/.test(query.trim())) {
          universeId = await api.robloxUniverseFromPlace(query.trim());
          if (!universeId) universeId = Number(query.trim());
        } else {
          const hit = await api.robloxGameSearch(query);
          universeId = hit?.universeId || null;
        }
        if (!universeId) {
          return interaction.editReply({ embeds: [errorEmbed('Game Not Found', `No Roblox experience matching \`${query}\`.`)] });
        }
        const [game, icon] = await Promise.all([
          api.robloxGame(universeId),
          api.robloxGameIcon(universeId)
        ]);
        if (!game) {
          return interaction.editReply({ embeds: [errorEmbed('Game Not Found', `No Roblox experience matching \`${query}\`.`)] });
        }
        const placeId = game.rootPlaceId;
        return interaction.editReply({
          embeds: [createEmbed({
            title: game.name,
            url: placeId ? `https://www.roblox.com/games/${placeId}` : undefined,
            description: clip(game.description, 350),
            color: ROBLOX_RED,
            thumbnail: icon,
            fields: [
              { name: 'Playing', value: `\`${api.formatCount(game.playing)}\``, inline: true },
              { name: 'Visits', value: `\`${api.formatCount(game.visits)}\``, inline: true },
              { name: 'Max players', value: `\`${api.formatCount(game.maxPlayers)}\``, inline: true },
              { name: 'Creator', value: `\`${game.creator?.name || 'Unknown'}\``, inline: true },
              { name: 'Place ID', value: `\`${placeId || 'Unknown'}\``, inline: true },
              { name: 'Updated', value: createdStamp(game.updated), inline: true }
            ],
            footerText: 'Sonnies Gaming • Roblox'
          })]
        });
      }

      const query = interaction.options.getString('query');
      let group = null;
      if (/^\d+$/.test(query.trim())) {
        group = await api.robloxGroup(query.trim());
      } else {
        const hits = await api.robloxGroupSearch(query);
        group = hits[0] ? await api.robloxGroup(hits[0].id) : null;
      }
      if (!group) {
        return interaction.editReply({ embeds: [errorEmbed('Group Not Found', `No Roblox group matching \`${query}\`.`)] });
      }
      return interaction.editReply({
        embeds: [createEmbed({
          title: group.name,
          url: `https://www.roblox.com/groups/${group.id}`,
          description: clip(group.description, 350),
          color: ROBLOX_RED,
          fields: [
            { name: 'Group ID', value: `\`${group.id}\``, inline: true },
            { name: 'Members', value: `\`${api.formatCount(group.memberCount)}\``, inline: true },
            { name: 'Owner', value: group.owner?.username ? `\`${group.owner.username}\`` : '`None`', inline: true },
            { name: 'Public entry', value: group.publicEntryAllowed ? 'Yes' : 'No', inline: true },
            { name: 'Verified', value: group.hasVerifiedBadge ? 'Yes' : 'No', inline: true }
          ],
          footerText: 'Sonnies Gaming • Roblox'
        })]
      });
    } catch (err) {
      return interaction.editReply({ embeds: [errorEmbed('Lookup Failed', err.message || 'Could not reach the Roblox API.')] });
    }
  }
};
