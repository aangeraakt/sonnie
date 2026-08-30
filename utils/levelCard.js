const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');
const Logger = require('./logger');

const WIDTH = 934;
const HEIGHT = 282;

// Resolve a font family that actually exists on the host; napi-rs ships none.
const FONT_STACK = (() => {
  try {
    const families = GlobalFonts.families.map((font) => font.family);
    for (const preferred of ['Segoe UI', 'Arial', 'Helvetica', 'DejaVu Sans', 'Liberation Sans', 'Noto Sans']) {
      if (families.includes(preferred)) return preferred;
    }
    return families[0] || 'sans-serif';
  } catch (err) {
    return 'sans-serif';
  }
})();

function font(size, weight = 'normal') {
  return `${weight} ${size}px "${FONT_STACK}"`;
}

function abbreviate(value) {
  const number = Number(value) || 0;
  if (number >= 1e9) return `${(number / 1e9).toFixed(1)}B`;
  if (number >= 1e6) return `${(number / 1e6).toFixed(1)}M`;
  if (number >= 1e3) return `${(number / 1e3).toFixed(1)}K`;
  return String(number);
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function hexToRgb(hex) {
  const clean = String(hex || '').replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(clean)) return { r: 88, g: 101, b: 242 };
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
}

function truncate(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let output = text;
  while (output.length > 1 && ctx.measureText(`${output}...`).width > maxWidth) {
    output = output.slice(0, -1);
  }
  return `${output}...`;
}

/**
 * Renders the rank card. Returns an AttachmentBuilder, or null if rendering
 * fails so callers can fall back to an embed.
 */
async function buildRankCard({
  username,
  discriminatorTag,
  avatarURL,
  level,
  rank,
  totalMembers,
  currentXP,
  neededXP,
  totalXP,
  accentHex,
  prestige = 0,
  status = null
}) {
  try {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');
    const accent = hexToRgb(accentHex);
    const accentCss = `rgb(${accent.r}, ${accent.g}, ${accent.b})`;

    // Background
    const backdrop = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    backdrop.addColorStop(0, '#1b1d24');
    backdrop.addColorStop(1, '#101218');
    roundedRect(ctx, 0, 0, WIDTH, HEIGHT, 28);
    ctx.fillStyle = backdrop;
    ctx.fill();

    // Accent glow behind the avatar
    const glow = ctx.createRadialGradient(148, 141, 20, 148, 141, 190);
    glow.addColorStop(0, `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.35)`);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 400, HEIGHT);

    // Card border
    roundedRect(ctx, 3, 3, WIDTH - 6, HEIGHT - 6, 26);
    ctx.strokeStyle = `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.45)`;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Avatar
    const avatarX = 148;
    const avatarY = 141;
    const avatarR = 88;
    if (avatarURL) {
      try {
        const avatar = await loadImage(avatarURL);
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, avatarX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
        ctx.restore();
      } catch (err) {
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
        ctx.fillStyle = '#2c2f36';
        ctx.fill();
      }
    }

    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarR + 6, 0, Math.PI * 2);
    ctx.strokeStyle = accentCss;
    ctx.lineWidth = 6;
    ctx.stroke();

    // Presence dot
    if (status) {
      const statusColors = {
        online: '#3ba55d',
        idle: '#faa81a',
        dnd: '#ed4245',
        offline: '#747f8d'
      };
      ctx.beginPath();
      ctx.arc(avatarX + 63, avatarY + 63, 22, 0, Math.PI * 2);
      ctx.fillStyle = '#101218';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(avatarX + 63, avatarY + 63, 15, 0, Math.PI * 2);
      ctx.fillStyle = statusColors[status] || statusColors.offline;
      ctx.fill();
    }

    // Rank + level readout, right aligned
    ctx.textAlign = 'right';
    let cursor = WIDTH - 45;

    ctx.font = font(56, 'bold');
    ctx.fillStyle = accentCss;
    ctx.fillText(String(level), cursor, 88);
    cursor -= ctx.measureText(String(level)).width + 12;

    ctx.font = font(28, 'bold');
    ctx.fillStyle = accentCss;
    ctx.fillText('LEVEL', cursor, 88);
    cursor -= ctx.measureText('LEVEL').width + 30;

    ctx.font = font(56, 'bold');
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`#${rank}`, cursor, 88);
    cursor -= ctx.measureText(`#${rank}`).width + 12;

    ctx.font = font(28, 'bold');
    ctx.fillStyle = '#b9bbbe';
    ctx.fillText('RANK', cursor, 88);

    // Username
    ctx.textAlign = 'left';
    ctx.font = font(38, 'bold');
    ctx.fillStyle = '#ffffff';
    const nameMax = 430;
    ctx.fillText(truncate(ctx, username, nameMax), 268, 168);

    const nameWidth = ctx.measureText(truncate(ctx, username, nameMax)).width;
    if (discriminatorTag) {
      ctx.font = font(28);
      ctx.fillStyle = '#8a8d93';
      ctx.fillText(discriminatorTag, 268 + nameWidth + 12, 168);
    }

    if (prestige > 0) {
      ctx.font = font(24, 'bold');
      ctx.fillStyle = '#ffd166';
      ctx.fillText(`PRESTIGE ${prestige}`, 268, 128);
    }

    // XP counters
    ctx.textAlign = 'right';
    ctx.font = font(26, 'bold');
    ctx.fillStyle = '#ffffff';
    const xpLabel = `${abbreviate(currentXP)} / ${abbreviate(neededXP)} XP`;
    ctx.fillText(xpLabel, WIDTH - 45, 168);

    ctx.font = font(20);
    ctx.fillStyle = '#72767d';
    ctx.fillText(`${abbreviate(totalXP)} total  -  of ${abbreviate(totalMembers)} ranked`, WIDTH - 45, 250);

    // Progress bar
    const barX = 268;
    const barY = 196;
    const barW = WIDTH - barX - 45;
    const barH = 38;
    const ratio = neededXP > 0 ? Math.max(0, Math.min(1, currentXP / neededXP)) : 1;

    roundedRect(ctx, barX, barY, barW, barH, barH / 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fill();

    if (ratio > 0) {
      const fillW = Math.max(barH, barW * ratio);
      const barGradient = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
      barGradient.addColorStop(0, `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.75)`);
      barGradient.addColorStop(1, accentCss);
      roundedRect(ctx, barX, barY, fillW, barH, barH / 2);
      ctx.fillStyle = barGradient;
      ctx.fill();
    }

    ctx.textAlign = 'center';
    ctx.font = font(20, 'bold');
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${Math.floor(ratio * 100)}%`, barX + barW / 2, barY + 26);

    return new AttachmentBuilder(await canvas.encode('png'), { name: 'rank.png' });
  } catch (err) {
    Logger.error('Failed to render rank card:', err);
    return null;
  }
}

module.exports = { buildRankCard, abbreviate };
