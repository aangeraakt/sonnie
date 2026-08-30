const db = require('../database/db');
const Logger = require('../utils/logger');
const { createEmbed, withGuildColor } = require('../utils/embedBuilder');
const { logMemberLeave } = require('../utils/auditLogger');
const { buildWelcomeCard } = require('../utils/welcomeCard');
const { updateGuildCounters } = require('../utils/counterChannels');
const { endVoiceSession } = require('../utils/levelingManager');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    return withGuildColor(member.guild.id, () => run(member));
  }
};

async function run(member) {
    const { guild } = member;
    const cfg = db.getGuildConfig(guild.id);

    db.recordInviteLeave(guild.id, member.id);

    endVoiceSession(guild.id, member.id);

    if (cfg.leave_channel_id) {
      const channel = guild.channels.cache.get(cfg.leave_channel_id);
      if (channel) {
        let msg = cfg.leave_message || '{user} has left {server}.';
        msg = msg
          .replace(/\{user\}/g, member.user.tag)
          .replace(/\{username\}/g, member.user.username)
          .replace(/\{server\}/g, guild.name)
          .replace(/\{membercount\}/g, String(guild.memberCount));

        const embed = createEmbed({
          title: `🚪 Goodbye!`,
          description: msg,
          thumbnail: member.user.displayAvatarURL({ dynamic: true })
        });

        const payload = { embeds: [embed] };

        if (cfg.welcome_card !== 0) {
          const card = await buildWelcomeCard({
            username: member.user.username,
            avatarURL: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
            bannerURL: guild.bannerURL({ extension: 'png', size: 1024 }),
            title: 'Goodbye',
            subtitle: `${guild.memberCount} members remain`,
            accentHex: cfg.embed_color || '#5865F2'
          });
          if (card) {
            payload.files = [card];
            embed.setImage('attachment://welcome.png');
            embed.setThumbnail(null);
          }
        }

        channel.send(payload).catch(err => Logger.error('Failed to send leave message:', err));
      }
    }

    await logMemberLeave(member).catch(() => {});
    await updateGuildCounters(guild).catch(() => {});
}
