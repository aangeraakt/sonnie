const { AttachmentBuilder } = require('discord.js');

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseMarkdown(text) {
  if (!text) return '';
  let parsed = escapeHtml(text);

  // Code blocks: ```lang\ncode\n```
  parsed = parsed.replace(/```(?:([a-zA-Z0-9_-]+)\n)?([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre class="codeblock"><code class="${lang ? `language-${lang}` : ''}">${code}</code></pre>`;
  });

  // Inline code: `code`
  parsed = parsed.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // Bold & Italic: ***text*** or ___text___
  parsed = parsed.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold: **text**
  parsed = parsed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic: *text* or _text_
  parsed = parsed.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  parsed = parsed.replace(/_([^_]+)_/g, '<em>$1</em>');
  // Strikethrough: ~~text~~
  parsed = parsed.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  // Spoiler: ||text||
  parsed = parsed.replace(/\|\|([^|]+)\|\|/g, '<span class="spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>');

  // User mentions: &lt;@!?(\d+)&gt;
  parsed = parsed.replace(/&lt;@!?(\d+)&gt;/g, '<span class="mention">@User</span>');
  // Role mentions: &lt;@&amp;(\d+)&gt;
  parsed = parsed.replace(/&lt;@&amp;(\d+)&gt;/g, '<span class="mention">@Role</span>');
  // Channel mentions: &lt;#(\d+)&gt;
  parsed = parsed.replace(/&lt;#(\d+)&gt;/g, '<span class="mention">#channel</span>');

  // Line breaks
  parsed = parsed.replace(/\n/g, '<br>');

  return parsed;
}

async function fetchAllMessages(channel, limit = 500) {
  let messages = [];
  let lastId = null;

  while (messages.length < limit) {
    const options = { limit: Math.min(100, limit - messages.length) };
    if (lastId) options.before = lastId;

    const batch = await channel.messages.fetch(options).catch(() => null);
    if (!batch || batch.size === 0) break;

    messages = messages.concat(Array.from(batch.values()));
    lastId = batch.last().id;

    if (batch.size < 100) break;
  }

  // Reverse so oldest messages are at the top
  return messages.reverse();
}

async function generateTranscriptHtml(channel, options = {}) {
  const messages = await fetchAllMessages(channel, options.limit || 500);
  const guild = channel.guild;
  const now = new Date().toUTCString();
  const guildIcon = guild.iconURL({ dynamic: true, size: 128 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

  let messagesHtml = '';

  for (const msg of messages) {
    const avatar = msg.author.displayAvatarURL({ dynamic: true, size: 64 });
    const isBot = msg.author.bot;
    const authorName = escapeHtml(msg.author.username);
    const timestamp = msg.createdAt.toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      hour12: true
    });

    const parsedContent = msg.content ? parseMarkdown(msg.content) : '';

    // Render embeds
    let embedsHtml = '';
    if (msg.embeds && msg.embeds.length > 0) {
      for (const embed of msg.embeds) {
        const colorHex = embed.hexColor && embed.hexColor !== '#000000' ? embed.hexColor : '#5865f2';
        let fieldsHtml = '';
        if (embed.fields && embed.fields.length > 0) {
          fieldsHtml = `<div class="embed-fields">` + embed.fields.map(f => `
            <div class="embed-field ${f.inline ? 'inline' : ''}">
              <div class="field-name">${escapeHtml(f.name)}</div>
              <div class="field-value">${parseMarkdown(f.value)}</div>
            </div>
          `).join('') + `</div>`;
        }

        let thumbnailHtml = embed.thumbnail?.url ? `<img class="embed-thumbnail" src="${escapeHtml(embed.thumbnail.url)}" alt="thumbnail">` : '';
        let authorHtml = embed.author?.name ? `
          <div class="embed-author">
            ${embed.author.iconURL ? `<img class="embed-author-icon" src="${escapeHtml(embed.author.iconURL)}" alt="author-icon">` : ''}
            <span>${escapeHtml(embed.author.name)}</span>
          </div>
        ` : '';

        let footerHtml = embed.footer?.text ? `
          <div class="embed-footer">
            ${embed.footer.iconURL ? `<img class="embed-footer-icon" src="${escapeHtml(embed.footer.iconURL)}" alt="footer-icon">` : ''}
            <span>${escapeHtml(embed.footer.text)}</span>
          </div>
        ` : '';

        embedsHtml += `
          <div class="embed-wrapper" style="border-left-color: ${colorHex};">
            <div class="embed-inner">
              ${authorHtml}
              ${embed.title ? `<div class="embed-title">${escapeHtml(embed.title)}</div>` : ''}
              ${embed.description ? `<div class="embed-description">${parseMarkdown(embed.description)}</div>` : ''}
              ${fieldsHtml}
              ${embed.image?.url ? `<img class="embed-image" src="${escapeHtml(embed.image.url)}" alt="embed-image">` : ''}
              ${footerHtml}
            </div>
            ${thumbnailHtml}
          </div>
        `;
      }
    }

    // Render attachments
    let attachmentsHtml = '';
    if (msg.attachments && msg.attachments.size > 0) {
      attachmentsHtml = `<div class="attachments-container">` + Array.from(msg.attachments.values()).map(att => {
        const isImage = att.contentType?.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(att.name);
        if (isImage) {
          return `<div class="attachment-image"><img src="${escapeHtml(att.url)}" alt="${escapeHtml(att.name)}" loading="lazy"></div>`;
        }
        return `
          <div class="attachment-file">
            <svg class="file-icon" viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
            <a href="${escapeHtml(att.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(att.name)}</a>
            <span class="file-size">(${(att.size / 1024).toFixed(1)} KB)</span>
          </div>
        `;
      }).join('') + `</div>`;
    }

    messagesHtml += `
      <div class="message-row">
        <img class="avatar" src="${avatar}" alt="avatar">
        <div class="message-content">
          <div class="message-header">
            <span class="author-name">${authorName}</span>
            ${isBot ? '<span class="bot-badge">BOT</span>' : ''}
            <span class="timestamp">${timestamp}</span>
          </div>
          ${parsedContent ? `<div class="message-text">${parsedContent}</div>` : ''}
          ${embedsHtml}
          ${attachmentsHtml}
        </div>
      </div>
    `;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ticket Transcript - #${escapeHtml(channel.name)}</title>
  <style>
    :root {
      --bg-dark: #313338;
      --bg-sidebar: #2b2d31;
      --bg-header: #1e1f22;
      --text-normal: #dbdee1;
      --text-muted: #949ba4;
      --text-header: #f2f3f5;
      --blurple: #5865f2;
      --embed-bg: #2b2d31;
      --code-bg: #1e1f22;
      --mention-bg: rgba(88, 101, 242, 0.3);
      --mention-text: #c9cdfb;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
    }
    body {
      background-color: var(--bg-dark);
      color: var(--text-normal);
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      line-height: 1.375rem;
    }
    .header {
      background-color: var(--bg-header);
      padding: 20px 30px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .server-icon {
      width: 52px;
      height: 52px;
      border-radius: 16px;
      object-fit: cover;
      border: 2px solid var(--blurple);
    }
    .header-info h1 {
      color: var(--text-header);
      font-size: 1.25rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .header-info p {
      color: var(--text-muted);
      font-size: 0.85rem;
      margin-top: 4px;
    }
    .header-badge {
      background-color: var(--bg-sidebar);
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 0.85rem;
      color: var(--text-muted);
      border: 1px solid rgba(255,255,255,0.05);
    }
    .header-badge strong {
      color: var(--text-header);
    }
    .chat-container {
      padding: 20px 30px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 1200px;
      width: 100%;
      margin: 0 auto;
      flex: 1;
    }
    .message-row {
      display: flex;
      gap: 16px;
      padding: 6px 12px;
      border-radius: 6px;
      transition: background-color 0.15s ease;
    }
    .message-row:hover {
      background-color: rgba(0, 0, 0, 0.07);
    }
    .avatar {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
    }
    .message-content {
      flex: 1;
      min-width: 0;
    }
    .message-header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 4px;
    }
    .author-name {
      color: var(--text-header);
      font-weight: 600;
      font-size: 1rem;
    }
    .bot-badge {
      background-color: var(--blurple);
      color: #ffffff;
      font-size: 0.65rem;
      font-weight: 700;
      padding: 1px 4px;
      border-radius: 3px;
      text-transform: uppercase;
    }
    .timestamp {
      color: var(--text-muted);
      font-size: 0.75rem;
    }
    .message-text {
      color: var(--text-normal);
      font-size: 0.95rem;
      word-break: break-word;
    }
    .mention {
      background-color: var(--mention-bg);
      color: var(--mention-text);
      padding: 0 4px;
      border-radius: 3px;
      font-weight: 500;
    }
    .codeblock {
      background-color: var(--code-bg);
      border: 1px solid rgba(0, 0, 0, 0.3);
      padding: 10px 14px;
      border-radius: 6px;
      font-family: 'Consolas', monospace;
      font-size: 0.85rem;
      margin-top: 6px;
      overflow-x: auto;
      color: #e3e5e8;
    }
    .inline-code {
      background-color: var(--code-bg);
      padding: 2px 5px;
      border-radius: 3px;
      font-family: 'Consolas', monospace;
      font-size: 0.85rem;
    }
    .spoiler {
      background-color: #202225;
      color: transparent;
      padding: 0 4px;
      border-radius: 3px;
      cursor: pointer;
      user-select: none;
    }
    .spoiler.revealed {
      background-color: rgba(255, 255, 255, 0.1);
      color: inherit;
    }
    .embed-wrapper {
      background-color: var(--embed-bg);
      border-left: 4px solid var(--blurple);
      border-radius: 4px;
      padding: 12px 16px;
      margin-top: 8px;
      display: flex;
      justify-content: space-between;
      max-width: 600px;
    }
    .embed-inner {
      flex: 1;
    }
    .embed-author {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-header);
      margin-bottom: 6px;
    }
    .embed-author-icon {
      width: 20px;
      height: 20px;
      border-radius: 50%;
    }
    .embed-title {
      color: var(--text-header);
      font-size: 1rem;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .embed-description {
      font-size: 0.9rem;
      color: var(--text-normal);
      margin-bottom: 8px;
      word-break: break-word;
    }
    .embed-fields {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      margin-top: 8px;
    }
    .embed-field.inline {
      display: inline-block;
      min-width: 150px;
    }
    .field-name {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-header);
      margin-bottom: 2px;
    }
    .field-value {
      font-size: 0.85rem;
      color: var(--text-normal);
    }
    .embed-thumbnail {
      width: 80px;
      height: 80px;
      border-radius: 4px;
      object-fit: cover;
      margin-left: 16px;
    }
    .embed-image {
      max-width: 100%;
      border-radius: 4px;
      margin-top: 8px;
    }
    .embed-footer {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 10px;
    }
    .embed-footer-icon {
      width: 16px;
      height: 16px;
      border-radius: 50%;
    }
    .attachments-container {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 8px;
    }
    .attachment-image img {
      max-width: 400px;
      max-height: 300px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.05);
    }
    .attachment-file {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background-color: var(--bg-sidebar);
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.05);
      color: var(--text-header);
      font-size: 0.85rem;
    }
    .attachment-file a {
      color: var(--blurple);
      text-decoration: none;
      font-weight: 500;
    }
    .attachment-file a:hover {
      text-decoration: underline;
    }
    .file-size {
      color: var(--text-muted);
      font-size: 0.75rem;
    }
    .footer {
      text-align: center;
      padding: 20px;
      background-color: var(--bg-header);
      font-size: 0.8rem;
      color: var(--text-muted);
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <img class="server-icon" src="${guildIcon}" alt="Server Icon">
      <div class="header-info">
        <h1>#${escapeHtml(channel.name)}</h1>
        <p>${escapeHtml(guild.name)} • Generated on ${now}</p>
      </div>
    </div>
    <div class="header-badge">
      Total Messages: <strong>${messages.length}</strong>
    </div>
  </div>

  <div class="chat-container">
    ${messages.length > 0 ? messagesHtml : '<p style="text-align:center; color:var(--text-muted); padding:40px;">No messages found in this ticket channel.</p>'}
  </div>

  <div class="footer">
    Sonnies Ticket System • HTML Transcript Export
  </div>
</body>
</html>`;

  return Buffer.from(html, 'utf-8');
}

async function createTranscriptAttachment(channel, options = {}) {
  const htmlBuffer = await generateTranscriptHtml(channel, options);
  const fileName = `transcript-${channel.name}-${Date.now()}.html`;
  return new AttachmentBuilder(htmlBuffer, { name: fileName });
}

module.exports = {
  generateTranscriptHtml,
  createTranscriptAttachment
};
