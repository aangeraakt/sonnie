const db = require('../database/db');
const Logger = require('./logger');
const { infoEmbed, withGuildColor } = require('./embedBuilder');

function startReminderLoop(client) {
  setInterval(async () => {
    const due = db.takeDueReminders(Date.now());
    for (const item of due) {
      try {
        await withGuildColor(item.guild_id, async () => {
        const channel = await client.channels.fetch(item.channel_id).catch(() => null);
        if (!channel?.send) return;
        if (item.type === 'schedule') {
          await channel.send({ content: item.content });
        } else {
          await channel.send({
            content: `<@${item.user_id}>`,
            embeds: [infoEmbed('Reminder', item.content)]
          });
        }
        });
      } catch (err) {
        Logger.error('Failed to send reminder:', err);
      }
    }
  }, 15000);
}

module.exports = { startReminderLoop };
