const { PermissionFlagsBits, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../database/db');
const Logger = require('../utils/logger');
const { createEmbed, successEmbed, errorEmbed, infoEmbed } = require('../utils/embedBuilder');
const { handleMusicPanelInteraction } = require('../utils/musicPanel');
const { openTicket, TICKET_TYPES } = require('../utils/ticketCreate');
const { handleRoleSelect } = require('../utils/rolePanel');
const { handleSuggestButton, handlePollButton } = require('../utils/voteButtons');
const { createTranscriptAttachment } = require('../utils/transcriptGenerator');
const { withGuildColor } = require('../utils/embedBuilder');
const { checkCommand } = require('../utils/commandGate');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    return withGuildColor(interaction.guildId, () => handleInteraction(interaction));
  }
};

async function handleInteraction(interaction) {
    // 1. Handle Slash Commands
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) {
        Logger.warn(`No command matching ${interaction.commandName} was found.`);
        return;
      }

      // Check command channel restriction
      if (interaction.guild) {
        const cfg = db.getGuildConfig(interaction.guild.id);
        const allowedChannelId = cfg.command_channel_id || process.env.COMMAND_CHANNEL_ID;

        if (allowedChannelId && interaction.channelId !== allowedChannelId) {
          const isStaff = interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                          interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                          interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) ||
                          (cfg.staff_role_id && interaction.member.roles.cache.has(cfg.staff_role_id)) ||
                          interaction.guild.ownerId === interaction.user.id;

          if (!isStaff) {
            return interaction.reply({
              embeds: [errorEmbed('Commands Restricted 🔒', `Commands can only be used in <#${allowedChannelId}>!`)],
              flags: 64
            });
          }
        }

        // Per-guild command toggles, channel locks, and role locks.
        const gate = checkCommand(
          interaction.guild,
          interaction.member,
          interaction.channel,
          interaction.commandName,
          interaction.options.getSubcommand(false)
        );
        if (!gate.allowed) {
          return interaction.reply({
            embeds: [errorEmbed('Command Unavailable', gate.reason)],
            flags: 64
          });
        }
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        Logger.error(`Error executing /${interaction.commandName}:`, error);
        const errorContent = { embeds: [errorEmbed('Command Error', 'There was an error while executing this command!')], flags: 64 };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorContent);
        } else {
          await interaction.reply(errorContent);
        }
      }
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_modal_')) {
      const type = interaction.customId.replace('ticket_modal_', '');
      const subject = interaction.fields.getTextInputValue('ticket_subject');
      const details = interaction.fields.getTextInputValue('ticket_details');
      try {
        const ticketChannel = await openTicket(interaction, type, subject, details);
        return interaction.reply({
          embeds: [successEmbed('Ticket Created', `Your ${TICKET_TYPES[type]?.label || 'support'} ticket: ${ticketChannel}`)],
          flags: 64
        });
      } catch (err) {
        Logger.error('Failed to create ticket channel:', err);
        return interaction.reply({
          embeds: [errorEmbed('Ticket Error', 'Failed to create ticket channel. Make sure the bot can manage channels.')],
          flags: 64
        });
      }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'roles_panel') {
      try {
        await handleRoleSelect(interaction);
      } catch (err) {
        const payload = { embeds: [errorEmbed('Role Error', err.message || 'Could not update that role.')], flags: 64 };
        if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
        else await interaction.reply(payload).catch(() => {});
      }
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type') {
      const type = interaction.values[0];
      const typeInfo = TICKET_TYPES[type] || TICKET_TYPES.support;
      const modal = new ModalBuilder()
        .setCustomId(`ticket_modal_${type}`)
        .setTitle(typeInfo.label);
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('ticket_subject')
            .setLabel('Subject')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('ticket_details')
            .setLabel('Details')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000)
        )
      );
      return interaction.showModal(modal);
    }

    if (interaction.isButton() && (interaction.customId === 'suggest_up' || interaction.customId === 'suggest_down')) {
      try {
        await handleSuggestButton(interaction);
      } catch (err) {
        Logger.error('Suggestion vote failed:', err);
      }
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('poll_vote_')) {
      try {
        await handlePollButton(interaction);
      } catch (err) {
        Logger.error('Poll vote failed:', err);
      }
      return;
    }

    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      const customId = interaction.customId;
      if (customId === 'music_pause' || customId === 'music_skip' || customId === 'music_stop' || customId === 'music_loop' || customId === 'music_shuffle' || customId === 'music_queue') {
        try {
          await handleMusicPanelInteraction(interaction);
        } catch (error) {
          Logger.error('Error handling music panel interaction:', error);
          const payload = { embeds: [errorEmbed('Player Error', 'Could not update the music player.')], flags: 64 };
          if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
          else await interaction.reply(payload).catch(() => {});
        }
        return;
      }
    }

    if (interaction.isButton()) {
      const { customId, guild, user, channel } = interaction;
      const cfg = db.getGuildConfig(guild.id);

      // --- Ticket Creation ---
      if (customId === 'ticket_create') {
        try {
          const ticketChannel = await openTicket(interaction, 'support', null, null);
          return interaction.reply({
            embeds: [successEmbed('Ticket Created', `Your support channel has been created: ${ticketChannel}`)],
            flags: 64
          });
        } catch (err) {
          Logger.error('Failed to create ticket channel:', err);
          return interaction.reply({ embeds: [errorEmbed('Ticket Error', 'Failed to create ticket channel. Make sure bot has Manage Channels permissions!')], flags: 64 });
        }
      }

      // --- Ticket Close ---
      if (customId === 'ticket_close') {
        const ticket = db.getTicketByChannel(channel.id);
        if (!ticket) {
          return interaction.reply({ embeds: [errorEmbed('Error', 'This channel is not an active ticket!')], flags: 64 });
        }

        await interaction.reply({ embeds: [infoEmbed('Closing Ticket', '🔒 Generating HTML transcript and deleting ticket channel in 5 seconds...')] });

        db.closeTicket(ticket.ticket_id);

        let transcriptAttachment = null;
        try {
          transcriptAttachment = await createTranscriptAttachment(channel);
        } catch (err) {
          Logger.error('Failed to export transcript on close:', err);
        }

        // Ticket log channel
        if (cfg.ticket_log_channel_id) {
          const logChannel = guild.channels.cache.get(cfg.ticket_log_channel_id);
          if (logChannel) {
            const logEmbed = createEmbed({
              title: '🔒 Ticket Closed & Archived',
              description: `**Ticket ID:** \`${ticket.ticket_id}\`\n**Channel:** #${channel.name}\n**Ticket Creator:** <@${ticket.user_id}>\n**Closed By:** ${user} (${user.tag})\n**Claimed By:** ${ticket.claimed_by ? `<@${ticket.claimed_by}>` : '*Unclaimed*'}`,
              footerText: 'Sonnies Ticket System'
            });
            const payload = { embeds: [logEmbed] };
            if (transcriptAttachment) payload.files = [transcriptAttachment];
            logChannel.send(payload).catch(() => {});
          }
        }

        // DM Ticket creator
        try {
          const ticketCreator = await interaction.client.users.fetch(ticket.user_id).catch(() => null);
          if (ticketCreator) {
            const dmEmbed = createEmbed({
              title: `Ticket Closed: ${ticket.ticket_id}`,
              description: `Your support ticket in **${guild.name}** has been closed by **${user.tag}**.\n\nA copy of your chat transcript is attached below.`,
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

      // --- Ticket Claim ---
      if (customId === 'ticket_claim') {
        const ticket = db.getTicketByChannel(channel.id);
        if (!ticket) {
          return interaction.reply({ embeds: [errorEmbed('Error', 'This channel is not an active ticket!')], flags: 64 });
        }

        if (ticket.claimed_by) {
          return interaction.reply({ embeds: [errorEmbed('Already Claimed', `This ticket is already claimed by <@${ticket.claimed_by}>!`)], flags: 64 });
        }

        db.claimTicket(channel.id, user.id, user.tag);

        return interaction.reply({
          embeds: [infoEmbed('Ticket Claimed 📌', `Ticket claimed by staff member ${user}. They will now assist you.`)]
        });
      }

      // --- Ticket Transcript Button ---
      if (customId === 'ticket_transcript') {
        const ticket = db.getTicketByChannel(channel.id);
        if (!ticket) {
          return interaction.reply({ embeds: [errorEmbed('Error', 'This channel is not an active ticket!')], flags: 64 });
        }

        await interaction.deferReply({ flags: 64 });
        try {
          const attachment = await createTranscriptAttachment(channel);
          return interaction.editReply({
            embeds: [successEmbed('Transcript Exported', `Here is your current HTML transcript for **#${channel.name}**!`)],
            files: [attachment]
          });
        } catch (err) {
          Logger.error('Failed to generate transcript:', err);
          return interaction.editReply({ embeds: [errorEmbed('Error', `Could not export transcript: ${err.message}`)] });
        }
      }

      // --- Giveaway Entry ---
      if (customId === 'giveaway_enter') {
        const messageId = interaction.message.id;
        const giveaway = db.getGiveaway(messageId);

        if (!giveaway) {
          return interaction.reply({ embeds: [errorEmbed('Giveaway Ended', 'This giveaway is no longer active.')], flags: 64 });
        }
        if (giveaway.ended) {
          return interaction.reply({ embeds: [errorEmbed('Giveaway Ended', 'This giveaway has already ended!')], flags: 64 });
        }

        const result = db.toggleGiveawayEntry(messageId, user.id);
        if (result.entered) {
          return interaction.reply({
            embeds: [successEmbed('You are in! 🎉', `You're entered for **${giveaway.prize}**!\n🎟️ Total entries: **${result.totalEntries}**`)],
            flags: 64
          });
        } else {
          return interaction.reply({
            embeds: [infoEmbed('Entry Removed ❌', `You left the giveaway for **${giveaway.prize}**.\nTotal entries: **${result.totalEntries}**`)],
            flags: 64
          });
        }
      }
    }
}
