const db = require('../database/db');
const Logger = require('../utils/logger');
const { createEmbed, withGuildColor } = require('../utils/embedBuilder');
const { findUsedInvite } = require('../utils/inviteCache');
const { handleJoin } = require('../utils/antiRaid');
const { logMemberJoin } = require('../utils/auditLogger');
const { buildWelcomeCard } = require('../utils/welcomeCard');
const { updateGuildCounters } = require('../utils/counterChannels');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    return withGuildColor(member.guild.id, () => run(member));
  }
};

async function run(member) {
    const { guild } = member;
    const cfg = db.getGuildConfig(guild.id);

    // 0. Anti-raid runs first: if the member is removed there is nothing to
    // welcome and no role to hand out.
    const raid = await handleJoin(member).catch(() => ({ blocked: false }));
    if (raid.blocked) return;

    // 1. Auto-Role Assignment
    if (cfg.auto_role_id) {
      const role = guild.roles.cache.get(cfg.auto_role_id);
      if (role) {
        member.roles.add(role).catch(err => Logger.error(`Failed to assign auto-role to ${member.user.tag}:`, err));
      }
    }

    // 2. Welcome Message
    let inviterLine = '';
    let inviterField = [];
    try {
      const used = await findUsedInvite(guild);
      if (used?.inviter) {
        const isFake = Date.now() - member.user.createdTimestamp < 7 * 24 * 60 * 60 * 1000;
        db.recordInviteJoin(guild.id, member.id, used.inviter.id, isFake);
        inviterLine = `\nInvited by ${used.inviter}`;
        inviterField = [{ name: 'Invited By', value: `<@${used.inviter.id}>`, inline: true }];
      } else if (used?.vanity) {
        inviterLine = '\nJoined with the vanity invite.';
        inviterField = [{ name: 'Invited By', value: '`Vanity URL`', inline: true }];
      }
    } catch (err) {
      Logger.error('Invite tracking failed:', err);
    }

    if (cfg.welcome_channel_id) {
      const channel = guild.channels.cache.get(cfg.welcome_channel_id);
      if (channel) {
        let msg = cfg.welcome_message || 'Welcome {user} to {server}!';
        msg = msg
          .replace(/\{user\}/g, member.toString())
          .replace(/\{username\}/g, member.user.username)
          .replace(/\{server\}/g, guild.name)
          .replace(/\{membercount\}/g, String(guild.memberCount));

        const embed = createEmbed({
          title: `Welcome to ${guild.name}`,
          description: `${msg}${inviterLine}`,
          thumbnail: member.user.displayAvatarURL({ dynamic: true })
        });

        const payload = { embeds: [embed] };

        // Attach the rendered banner when welcome cards are enabled.
        if (cfg.welcome_card !== 0) {
          const card = await buildWelcomeCard({
            username: member.user.username,
            avatarURL: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
            bannerURL: guild.bannerURL({ extension: 'png', size: 1024 }),
            title: 'Welcome',
            subtitle: `You are member #${guild.memberCount} of ${guild.name}`,
            accentHex: cfg.embed_color || '#5865F2'
          });
          if (card) {
            payload.files = [card];
            embed.setImage('attachment://welcome.png');
            embed.setThumbnail(null);
          }
        }

        channel.send(payload).catch(err => Logger.error('Failed to send welcome message:', err));
      }
    }

    // 3. Audit log + counter channels
    await logMemberJoin(member, inviterField).catch(() => {});
    await updateGuildCounters(guild).catch(() => {});
}
