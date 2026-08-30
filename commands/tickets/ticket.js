const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, successEmbed, errorEmbed, infoEmbed } = require('../../utils/embedBuilder');
const { createTranscriptAttachment } = require('../../utils/transcriptGenerator');
const Logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage an open support ticket')
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Add a user to the current ticket')
        .addUserOption(opt => opt.setName('user').setDescription('User to add to ticket').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove a user from the current ticket')
        .addUserOption(opt => opt.setName('user').setDescription('User to remove from ticket').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('close')
        .setDescription('Close and archive the current ticket with an HTML transcript')
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for closing ticket').setRequired(false))
    )
    .addSubcommand(sub =>
      sub
        .setName('claim')
        .setDescription('Claim responsibility for this support ticket')
    )
    .addSubcommand(sub =>
      sub
        .setName('transcript')
        .setDescription('Export an HTML transcript of the current ticket channel')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const { guild, channel, user } = interaction;
    const cfg = db.getGuildConfig(guild.id);

    const ticket = db.getTicketByChannel(channel.id);
    if (!ticket) {
      return interaction.reply({
        embeds: [errorEmbed('Not a Ticket Channel', 'This command can only be used inside an active ticket channel.\nPost a panel with `/config type:ticket channel:#channel`.')],
        flags: 64
      });
    }

    if (subcommand === 'add') {
      const targetUser = interaction.options.getUser('user');
      try {
        await channel.permissionOverwrites.edit(targetUser.id, {
          ViewChannel: true,
          SendMessages: true,
          AttachFiles: true,
          EmbedLinks: true,
          ReadMessageHistory: true
        });

        db.addTicketUser(channel.id, targetUser.id);

        return interaction.reply({
          embeds: [successEmbed('User Added', `Successfully added ${targetUser} to ${channel}.`)]
        });
      } catch (err) {
        Logger.error('Failed to add user to ticket:', err);
        return interaction.reply({ embeds: [errorEmbed('Error', `Failed to add user: ${err.message}`)], flags: 64 });
      }
    }

    if (subcommand === 'remove') {
      const targetUser = interaction.options.getUser('user');
      if (targetUser.id === ticket.user_id) {
        return interaction.reply({ embeds: [errorEmbed('Action Blocked', 'You cannot remove the ticket creator from their own ticket!')], flags: 64 });
      }

      try {
        await channel.permissionOverwrites.delete(targetUser.id);
        db.removeTicketUser(channel.id, targetUser.id);

        return interaction.reply({
          embeds: [successEmbed('User Removed', `Successfully removed ${targetUser} from ${channel}.`)]
        });
      } catch (err) {
        Logger.error('Failed to remove user from ticket:', err);
        return interaction.reply({ embeds: [errorEmbed('Error', `Failed to remove user: ${err.message}`)], flags: 64 });
      }
    }

    if (subcommand === 'claim') {
      if (ticket.claimed_by) {
        return interaction.reply({ embeds: [errorEmbed('Already Claimed', `This ticket is already claimed by <@${ticket.claimed_by}>!`)], flags: 64 });
      }

      db.claimTicket(channel.id, user.id, user.tag);

      const claimEmbed = createEmbed({
        title: 'Ticket Claimed',
        description: `This ticket has been claimed by **${user.tag}** (${user}). They will be handling your request.`,
        footerText: 'Sonnies Ticket System • Support in Progress'
      });

      return interaction.reply({ embeds: [claimEmbed] });
    }

    if (subcommand === 'transcript') {
      await interaction.deferReply();
      try {
        const attachment = await createTranscriptAttachment(channel);
        return interaction.editReply({
          embeds: [successEmbed('HTML Transcript Generated', `Here is the full HTML message transcript for **#${channel.name}**!`)],
          files: [attachment]
        });
      } catch (err) {
        Logger.error('Failed to generate ticket transcript:', err);
        return interaction.editReply({ embeds: [errorEmbed('Transcript Failed', `Could not export transcript: ${err.message}`)] });
      }
    }

    if (subcommand === 'close') {
      const reason = interaction.options.getString('reason') || 'No reason provided';
      await interaction.reply({
        embeds: [infoEmbed('Closing Ticket', `Ticket closure requested by **${user.tag}**.\n**Reason:** ${reason}\n\nGenerating HTML transcript and deleting channel in 5 seconds...`)]
      });

      db.closeTicket(ticket.ticket_id);

      let transcriptAttachment = null;
      try {
        transcriptAttachment = await createTranscriptAttachment(channel);
      } catch (err) {
        Logger.error('Failed to generate transcript on close:', err);
      }

      if (cfg.ticket_log_channel_id) {
        const logChannel = guild.channels.cache.get(cfg.ticket_log_channel_id);
        if (logChannel) {
          const logEmbed = createEmbed({
            title: 'Ticket Closed & Archived',
            description: `**Ticket ID:** \`${ticket.ticket_id}\`\n**Channel:** #${channel.name}\n**Ticket Creator:** <@${ticket.user_id}>\n**Closed By:** ${user} (${user.tag})\n**Claimed By:** ${ticket.claimed_by ? `<@${ticket.claimed_by}>` : '*Unclaimed*'}\n**Reason:** ${reason}`,
            footerText: 'Sonnies Ticket Logs'
          });

          const sendPayload = { embeds: [logEmbed] };
          if (transcriptAttachment) sendPayload.files = [transcriptAttachment];
          logChannel.send(sendPayload).catch(() => {});
        }
      }

      try {
        const ticketCreator = await interaction.client.users.fetch(ticket.user_id).catch(() => null);
        if (ticketCreator) {
          const dmEmbed = createEmbed({
            title: `Ticket Closed: ${ticket.ticket_id}`,
            description: `Your support ticket in **${guild.name}** has been closed by **${user.tag}**.\n**Reason:** ${reason}\n\nA copy of your chat transcript is attached below.`,
            footerText: guild.name
          });

          const dmPayload = { embeds: [dmEmbed] };
          if (transcriptAttachment) dmPayload.files = [transcriptAttachment];
          await ticketCreator.send(dmPayload).catch(() => {});
        }
      } catch (e) {}

      setTimeout(() => {
        channel.delete().catch(err => Logger.error('Failed to delete ticket channel:', err));
      }, 5000);
    }
  }
};
