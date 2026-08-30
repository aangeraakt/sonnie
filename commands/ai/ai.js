const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, successEmbed, errorEmbed, infoEmbed } = require('../../utils/embedBuilder');
const Logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Interact with Google Gemini AI or manage user AI access whitelist')
    .addSubcommand(sub =>
      sub
        .setName('ask')
        .setDescription('Ask Google Gemini AI a question or give it a prompt')
        .addStringOption(opt =>
          opt.setName('prompt')
            .setDescription('The question or instruction for the AI')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('whitelist')
        .setDescription('Manage users who are allowed to use AI commands')
        .addStringOption(opt =>
          opt.setName('action')
            .setDescription('Action to perform')
            .setRequired(true)
            .addChoices(
              { name: 'Add User', value: 'add' },
              { name: 'Remove User', value: 'remove' },
              { name: 'List Whitelisted Users', value: 'list' }
            )
        )
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('The user to add or remove from whitelist')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('View Gemini AI system status and whitelist summary')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const { guild, user, member } = interaction;
    const cfg = db.getGuildConfig(guild.id);

    // --- SUBCOMMAND: STATUS ---
    if (subcommand === 'status') {
      const apiKey = cfg.gemini_api_key || process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
      const isKeySet = Boolean(apiKey && apiKey.length > 5 && !apiKey.includes('your_'));
      const whitelistedUsers = db.getAiWhitelist(guild.id);

      const embed = createEmbed({
        title: '🤖 Google Gemini AI Status',
        description: 'AI integration powered by Google Generative AI (Gemini 1.5 Flash).',
        color: 0x4285F4,
        fields: [
          { name: '🔑 API Key Status', value: isKeySet ? '✅ Configured' : '❌ Missing (`GEMINI_API_KEY`)', inline: true },
          { name: '🧠 Model', value: '`gemini-3.7-flash`', inline: true },
          { name: '👥 Whitelisted Users', value: `**${whitelistedUsers.length}** user(s)`, inline: true },
          { name: '🛡️ Access Control', value: 'Only whitelisted users and Server Admins can run `/ai ask`', inline: false }
        ],
        footerText: 'Sonnies AI Assistant • Google Gemini'
      });

      return interaction.reply({ embeds: [embed] });
    }

    // --- SUBCOMMAND: WHITELIST MANAGEMENT ---
    if (subcommand === 'whitelist') {
      const action = interaction.options.getString('action');
      const targetUser = interaction.options.getUser('user');

      // Check Admin permissions for whitelist modifications
      const isStaff = member.permissions.has(PermissionFlagsBits.Administrator) ||
                      member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                      (cfg.staff_role_id && member.roles.cache.has(cfg.staff_role_id));

      if (action === 'list') {
        const list = db.getAiWhitelist(guild.id);
        if (list.length === 0) {
          return interaction.reply({
            embeds: [infoEmbed('AI Whitelist', 'No users are currently whitelisted for AI.\nServer Administrators always have permission to use AI commands.')],
            flags: 64
          });
        }

        const userMentions = list.map((uid, index) => `${index + 1}. <@${uid}> (\`${uid}\`)`).join('\n');
        const embed = createEmbed({
          title: '📋 Whitelisted AI Users',
          description: `These users have permission to use \`/ai ask\` on this server:\n\n${userMentions}`,
          color: 0x4285F4,
          footerText: `Total Whitelisted: ${list.length}`
        });

        return interaction.reply({ embeds: [embed] });
      }

      // Add / Remove requires staff permissions
      if (!isStaff) {
        return interaction.reply({
          embeds: [errorEmbed('Permission Denied', 'You need `Administrator` or `Manage Server` permissions to modify the AI whitelist.')],
          flags: 64
        });
      }

      if (!targetUser) {
        return interaction.reply({
          embeds: [errorEmbed('Missing User', 'Please specify a user to add or remove from the whitelist!')],
          flags: 64
        });
      }

      if (action === 'add') {
        const added = db.addAiWhitelist(guild.id, targetUser.id);
        if (!added) {
          return interaction.reply({
            embeds: [infoEmbed('Already Whitelisted', `${targetUser} is already on the AI whitelist.`)],
            flags: 64
          });
        }
        return interaction.reply({
          embeds: [successEmbed('User Whitelisted ✅', `${targetUser} (\`${targetUser.id}\`) has been added to the AI whitelist and can now use \`/ai ask\`!`)]
        });
      }

      if (action === 'remove') {
        const removed = db.removeAiWhitelist(guild.id, targetUser.id);
        if (!removed) {
          return interaction.reply({
            embeds: [errorEmbed('Not Whitelisted', `${targetUser} was not found on the AI whitelist.`)],
            flags: 64
          });
        }
        return interaction.reply({
          embeds: [successEmbed('User Removed ❌', `${targetUser} (\`${targetUser.id}\`) has been removed from the AI whitelist.`)]
        });
      }
    }

    // --- SUBCOMMAND: ASK AI ---
    if (subcommand === 'ask') {
      const prompt = interaction.options.getString('prompt');

      // Check Whitelist & Admin bypass
      const isStaff = member.permissions.has(PermissionFlagsBits.Administrator) ||
                      member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                      guild.ownerId === user.id;
      const isWhitelisted = db.isAiWhitelisted(guild.id, user.id);

      if (!isStaff && !isWhitelisted) {
        return interaction.reply({
          embeds: [errorEmbed('⛔ Access Denied', 'You are **not whitelisted** to use Gemini AI commands on this server.\nPlease ask a server administrator to whitelist your User ID using `/ai whitelist add`.')],
          flags: 64
        });
      }

      const apiKey = cfg.gemini_api_key || process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
      if (!apiKey || apiKey.length < 5 || apiKey.includes('your_')) {
        return interaction.reply({
          embeds: [errorEmbed('Gemini API Key Missing', 'Google Gemini API key has not been configured for this bot!\nAdd `GEMINI_API_KEY` to your `.env` file or ask an admin to configure it.')],
          flags: 64
        });
      }

      await interaction.deferReply();

      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: `You are Sonnies AI, a helpful, intelligent, concise, and friendly assistant in a Discord server. Answer the user prompt cleanly with good markdown formatting:\n\n${prompt}`
                    }
                  ]
                }
              ],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1000
              }
            })
          }
        );

        if (!response.ok) {
          const errorJson = await response.json().catch(() => ({}));
          const errMsg = errorJson.error?.message || response.statusText;
          Logger.error('Gemini API Error:', errMsg);
          return interaction.editReply({
            embeds: [errorEmbed('AI Request Failed', `Google Gemini API returned an error: ${errMsg}`)]
          });
        }

        const data = await response.json();
        const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response was generated.';

        // Format and send reply
        if (aiText.length <= 3900) {
          const embed = createEmbed({
            title: `🤖 Sonnies AI • ${user.username}`,
            description: `**Prompt:** *${prompt.length > 200 ? prompt.slice(0, 197) + '...' : prompt}*\n\n${aiText}`,
            color: 0x4285F4,
            footerText: 'Powered by Google Gemini 3.7 Flash'
          });
          return interaction.editReply({ embeds: [embed] });
        } else {
          // If response is very long, split into message chunks
          await interaction.editReply({ content: `**Prompt:** *${prompt}*\n\n${aiText.slice(0, 1900)}` });
          if (aiText.length > 1900) {
            await interaction.followUp({ content: aiText.slice(1900, 3800) });
          }
        }
      } catch (err) {
        Logger.error('AI Command Error:', err);
        return interaction.editReply({
          embeds: [errorEmbed('AI Error', `An error occurred while generating AI response: ${err.message}`)]
        });
      }
    }
  }
};
