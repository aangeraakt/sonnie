const { ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database/db');
const Logger = require('./logger');
const { createEmbed } = require('./embedBuilder');

const TICKET_TYPES = {
  support: { label: 'Support', description: 'General help from staff' },
  report: { label: 'Report', description: 'Report a user or issue' },
  apply: { label: 'Application', description: 'Apply for a role or staff' }
};

function ticketButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Close Ticket').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim Ticket').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_transcript').setLabel('Save Transcript').setStyle(ButtonStyle.Primary)
  );
}

async function openTicket(interaction, type, subject, details) {
  const { guild, user } = interaction;
  const cfg = db.getGuildConfig(guild.id);
  const typeInfo = TICKET_TYPES[type] || TICKET_TYPES.support;
  const slug = user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'user';
  const ticketId = `${type}-${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
  const parentCategory = cfg.ticket_category_id ? guild.channels.cache.get(cfg.ticket_category_id) : null;

  const ticketChannel = await guild.channels.create({
    name: ticketId,
    type: ChannelType.GuildText,
    parent: parentCategory ? parentCategory.id : null,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ReadMessageHistory
        ]
      },
      {
        id: interaction.client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.AttachFiles
        ]
      }
    ]
  });

  if (cfg.staff_role_id) {
    await ticketChannel.permissionOverwrites.edit(cfg.staff_role_id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    }).catch(() => {});
  }

  db.createTicket(ticketId, guild.id, ticketChannel.id, user.id, { type, subject, details });

  const fields = [
    { name: 'Type', value: typeInfo.label, inline: true },
    { name: 'Opened by', value: `${user}`, inline: true }
  ];
  if (subject) fields.push({ name: 'Subject', value: subject.slice(0, 256), inline: false });
  if (details) fields.push({ name: 'Details', value: details.slice(0, 1000), inline: false });

  await ticketChannel.send({
    content: `${user}`,
    embeds: [createEmbed({
      title: `${typeInfo.label} ticket`,
      description: 'Staff will be with you shortly. Use the buttons below to manage this ticket.',
      fields
    })],
    components: [ticketButtons()]
  });

  return ticketChannel;
}

module.exports = {
  TICKET_TYPES,
  ticketButtons,
  openTicket
};
