const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');
const Logger = require('./logger');

const WIDTH = 1024;
const HEIGHT = 400;

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

function hexToRgb(hex) {
  const clean = String(hex || '').replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(clean)) return { r: 88, g: 101, b: 242 };
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
}

function fitText(ctx, text, maxWidth, startSize, weight = 'bold') {
  let size = startSize;
  ctx.font = font(size, weight);
  while (size > 14 && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = font(size, weight);
  }
  return size;
}

/**
 * Renders a welcome or goodbye banner. Returns an AttachmentBuilder, or null
 * when rendering fails so callers can fall back to a plain embed.
 */
async function buildWelcomeCard({
  username,
  avatarURL,
  bannerURL = null,
  title = 'WELCOME',
  subtitle = '',
  accentHex = '#5865F2'
}) {
  try {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');
    const accent = hexToRgb(accentHex);
    const accentCss = `rgb(${accent.r}, ${accent.g}, ${accent.b})`;

    // Background: the server banner if there is one, else a gradient.
    let painted = false;
    if (bannerURL) {
      try {
        const banner = await loadImage(bannerURL);
        const scale = Math.max(WIDTH / banner.width, HEIGHT / banner.height);
        const w = banner.width * scale;
        const h = banner.height * scale;
        ctx.drawImage(banner, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
        ctx.fillStyle = 'rgba(10, 12, 16, 0.72)';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        painted = true;
      } catch (err) {
        painted = false;
      }
    }

    if (!painted) {
      const backdrop = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
      backdrop.addColorStop(0, '#1b1d24');
      backdrop.addColorStop(1, '#0d0f14');
      ctx.fillStyle = backdrop;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      const glow = ctx.createRadialGradient(WIDTH / 2, 130, 30, WIDTH / 2, 130, 320);
      glow.addColorStop(0, `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.30)`);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    // Accent frame
    ctx.strokeStyle = accentCss;
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, WIDTH - 6, HEIGHT - 6);

    // Avatar
    const avatarX = WIDTH / 2;
    const avatarY = 138;
    const avatarR = 88;

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    try {
      const avatar = await loadImage(avatarURL);
      ctx.drawImage(avatar, avatarX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
    } catch (err) {
      ctx.fillStyle = '#2c2f36';
      ctx.fillRect(avatarX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarR + 5, 0, Math.PI * 2);
    ctx.strokeStyle = accentCss;
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.textAlign = 'center';

    // Title
    ctx.font = font(44, 'bold');
    ctx.fillStyle = accentCss;
    ctx.fillText(title.toUpperCase(), avatarX, 285);

    // Username
    const nameSize = fitText(ctx, username, WIDTH - 120, 52);
    ctx.font = font(nameSize, 'bold');
    ctx.fillStyle = '#ffffff';
    ctx.fillText(username, avatarX, 340);

    // Subtitle
    if (subtitle) {
      const subSize = fitText(ctx, subtitle, WIDTH - 140, 24, 'normal');
      ctx.font = font(subSize, 'normal');
      ctx.fillStyle = '#a8abb2';
      ctx.fillText(subtitle, avatarX, 378);
    }

    return new AttachmentBuilder(await canvas.encode('png'), { name: 'welcome.png' });
  } catch (err) {
    Logger.error('Failed to render welcome card:', err);
    return null;
  }
}

module.exports = { buildWelcomeCard };
