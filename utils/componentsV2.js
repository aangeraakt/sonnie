'use strict';

/**
 * Components V2 rendering layer.
 *
 * Discord's "Components V2" message format replaces the classic embed object
 * with a tree of components (containers, sections, separators, galleries).
 * A V2 message may not carry `content` or `embeds` at all, so switching the
 * bot over could either mean rewriting all ~950 send sites, or translating the
 * payload once, right before it leaves for the API. This module does the
 * latter: every outgoing message in discord.js is funnelled through
 * `MessagePayload#resolveBody`, so patching that single method converts every
 * embed the bot produces - commands, prefix commands, event logs and the
 * background loops alike - without touching the call sites.
 *
 * Command code therefore keeps building plain EmbedBuilders (and keeps calling
 * `.setDescription()`, `.setImage()`, `.addFields()` on them); the translation
 * to a container happens here.
 */

const { MessagePayload, Message } = require('discord.js');

// MessageFlags.IsComponentsV2 - spelled out so this keeps working on older
// discord.js builds that do not export the constant yet.
const IS_COMPONENTS_V2 = 1 << 15;

const Type = {
  ActionRow: 1,
  Section: 9,
  TextDisplay: 10,
  Thumbnail: 11,
  MediaGallery: 12,
  File: 13,
  Separator: 14,
  Container: 17
};

const Spacing = { Small: 1, Large: 2 };

// Discord counts every component in the tree against one budget, and every
// piece of text against another. Both are kept a little under the real ceiling
// so a container never fails validation over a rounding error.
const MAX_COMPONENTS = 38;
const MAX_TEXT = 3800;

// An inline field is folded onto a single "name - value" line when its value is
// short enough to read as one, which keeps stat rows compact instead of
// stretching a container over a dozen paragraphs.
const INLINE_FOLD_LIMIT = 72;

const DEFAULT_ACCENT = 0x5865F2;
const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif)$/i;

/** Escapes markdown that would otherwise fire inside a text display. */
function escapeMd(text) {
  return String(text).replace(/([*_~`|\\])/g, '\\$1');
}

/** Collapses a value onto one line - headings and subtext are line-scoped. */
function oneLine(text) {
  return String(text).replace(/\s*\n+\s*/g, ' ').trim();
}

function clamp(text, limit) {
  if (limit <= 0) return '';
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trimEnd()}…`;
}

function textDisplay(content) {
  return { type: Type.TextDisplay, content };
}

function separator(spacing = Spacing.Small, divider = true) {
  return { type: Type.Separator, divider, spacing };
}

/** Prefixes every line so multi-line footers stay in subtext styling. */
function subtext(text) {
  return String(text)
    .split('\n')
    .map(line => `-# ${line}`)
    .join('\n');
}

function attachmentName(url) {
  if (typeof url !== 'string') return null;
  const match = /^attachment:\/\/(.+)$/i.exec(url.split('?')[0]);
  return match ? match[1] : null;
}

/**
 * Renders embed fields as a single text block. Runs of foldable inline fields
 * are packed together so they read like the columns they were in the embed,
 * while block fields keep breathing room around them.
 */
function renderFields(fields) {
  const blocks = [];
  let run = [];

  const flush = () => {
    if (run.length) {
      blocks.push(run.join('\n'));
      run = [];
    }
  };

  for (const field of fields) {
    const name = escapeMd(oneLine(field.name ?? ''));
    const value = String(field.value ?? '').trim();
    if (!name && !value) continue;

    const foldable = field.inline && value && !value.includes('\n') && value.length <= INLINE_FOLD_LIMIT;
    if (foldable) {
      run.push(`**${name}** · ${value}`);
    } else {
      flush();
      blocks.push(value ? `**${name}**\n${value}` : `**${name}**`);
    }
  }

  flush();
  return blocks.join('\n\n');
}

function renderFooter(embed) {
  const parts = [];
  const footerText = embed.footer?.text;
  if (footerText) parts.push(escapeMd(oneLine(footerText)));

  if (embed.timestamp) {
    const parsed = Date.parse(embed.timestamp);
    if (Number.isFinite(parsed)) parts.push(`<t:${Math.floor(parsed / 1000)}:R>`);
  }

  return parts.length ? subtext(parts.join(' • ')) : null;
}

/**
 * Translates one resolved API embed into a Components V2 container.
 *
 * @param {object} embed raw embed body as discord.js resolved it
 * @param {Set<string>} referenced collects attachment names the container uses,
 *   so the caller can surface anything the embed did not reference itself
 * @param {number} budget characters this container may spend on text
 * @returns {object|null} container component, or null for an empty embed
 */
function embedToContainer(embed, referenced = new Set(), budget = MAX_TEXT) {
  if (!embed || typeof embed !== 'object') return null;

  const children = [];
  let remaining = budget;

  const take = text => {
    const allowed = clamp(text, remaining);
    remaining -= allowed.length;
    return allowed;
  };

  // --- Header: author line + title, kept together so they can share a
  // thumbnail accessory with the description.
  const headerLines = [];
  if (embed.author?.name) headerLines.push(subtext(escapeMd(oneLine(embed.author.name))));
  if (embed.title) {
    const title = escapeMd(oneLine(embed.title));
    headerLines.push(embed.url ? `## [${title}](${embed.url})` : `## ${title}`);
  }

  const headerText = headerLines.length ? take(headerLines.join('\n')) : '';
  const descriptionText = embed.description ? take(String(embed.description).trim()) : '';

  const headerBlocks = [];
  if (headerText) headerBlocks.push(textDisplay(headerText));
  if (descriptionText) headerBlocks.push(textDisplay(descriptionText));

  // The thumbnail becomes a section accessory. An author icon stands in when
  // there is no thumbnail, so avatar-led log embeds keep their portrait.
  const accessoryUrl = embed.thumbnail?.url || embed.author?.icon_url || null;

  if (headerBlocks.length && accessoryUrl) {
    children.push({
      type: Type.Section,
      components: headerBlocks.slice(0, 3),
      accessory: { type: Type.Thumbnail, media: { url: accessoryUrl } }
    });
    const name = attachmentName(accessoryUrl);
    if (name) referenced.add(name);
  } else {
    children.push(...headerBlocks);
  }

  // --- Fields
  if (Array.isArray(embed.fields) && embed.fields.length > 0) {
    const rendered = take(renderFields(embed.fields));
    if (rendered) {
      if (children.length) children.push(separator());
      children.push(textDisplay(rendered));
    }
  }

  // --- Image
  if (embed.image?.url) {
    children.push({
      type: Type.MediaGallery,
      items: [{ media: { url: embed.image.url } }]
    });
    const name = attachmentName(embed.image.url);
    if (name) referenced.add(name);
  }

  // --- Footer
  const footer = renderFooter(embed);
  const footerAt = children.length;
  if (footer) {
    if (children.length) children.push(separator(Spacing.Small, false));
    // The footer is always worth keeping, so it gets its own allowance rather
    // than whatever the body happened to leave behind.
    children.push(textDisplay(clamp(footer, Math.max(remaining, 256))));
  }

  if (children.length === 0) return null;

  const container = {
    type: Type.Container,
    accent_color: typeof embed.color === 'number' ? embed.color : DEFAULT_ACCENT,
    components: children
  };

  // Where anything appended later belongs, so trailing attachments land above
  // the footer rather than dangling underneath it. Non-enumerable so it never
  // reaches the API.
  Object.defineProperty(container, 'contentEndsAt', { value: footerAt, writable: true });

  return container;
}

/** Names of the attachments a payload is about to upload, where knowable. */
function attachmentNames(files) {
  if (!Array.isArray(files)) return [];
  return files
    .map(file => (file && typeof file === 'object' ? file.name ?? file.data?.name : null))
    .filter(name => typeof name === 'string' && name.length > 0);
}

/**
 * A V2 message must expose every attachment through a component, so anything
 * the embed did not already reference is appended to the container: images join
 * a gallery, everything else becomes a file card.
 */
function appendUnreferenced(container, files, referenced) {
  const orphans = attachmentNames(files).filter(name => !referenced.has(name));
  if (orphans.length === 0) return;

  const images = orphans.filter(name => IMAGE_EXTENSIONS.test(name));
  const others = orphans.filter(name => !IMAGE_EXTENSIONS.test(name));

  const added = [];
  if (images.length) {
    added.push({
      type: Type.MediaGallery,
      items: images.map(name => ({ media: { url: `attachment://${name}` } }))
    });
  }
  for (const name of others) {
    added.push({ type: Type.File, file: { url: `attachment://${name}` } });
  }

  const at = typeof container.contentEndsAt === 'number' ? container.contentEndsAt : container.components.length;
  container.components.splice(at, 0, ...added);
  container.contentEndsAt = at + added.length;
}

/** Depth-first component count, since Discord budgets the whole tree. */
function countComponents(components) {
  if (!Array.isArray(components)) return 0;
  let total = 0;
  for (const component of components) {
    if (!component || typeof component !== 'object') continue;
    total += 1;
    total += countComponents(component.components);
    total += countComponents(component.items);
    if (component.accessory) total += 1;
  }
  return total;
}

/**
 * Editing a message that was not created as a V2 message is rejected by the
 * API, so a payload aimed at an existing classic message is left alone. That
 * keeps messages posted before this change (giveaways, suggestions, starboard
 * posts) editable instead of throwing on their next update.
 */
function targetRejectsV2(target) {
  // Only a Message target is an edit. Channels carry an unrelated `flags` of
  // their own, so the check has to be on the type, not on the property.
  if (!(target instanceof Message)) return false;
  const flags = target.flags;
  if (!flags || typeof flags.bitfield !== 'number') return false;
  return (flags.bitfield & IS_COMPONENTS_V2) === 0;
}

/**
 * Rewrites a resolved message body from `content` + `embeds` into a Components
 * V2 component tree. Mutates and returns the body; a body with nothing to
 * convert is returned untouched.
 */
function convertBody(body, { files = [], target = null } = {}) {
  if (!body || typeof body !== 'object') return body;
  if (!Array.isArray(body.embeds) || body.embeds.length === 0) return body;

  // Polls and stickers cannot ride along on a V2 message.
  if (body.poll || (Array.isArray(body.sticker_ids) && body.sticker_ids.length > 0)) return body;
  if (((body.flags ?? 0) & IS_COMPONENTS_V2) !== 0) return body;
  if (targetRejectsV2(target)) return body;

  const referenced = new Set();
  const components = [];

  // A leading `content` is usually a ping (giveaway winners, mod alerts). It
  // stays above the container so it still notifies and still reads as a ping.
  if (body.content) components.push(textDisplay(clamp(String(body.content), 1800)));

  const perEmbed = Math.floor(MAX_TEXT / body.embeds.length);
  const containers = [];
  for (const embed of body.embeds) {
    const container = embedToContainer(embed, referenced, perEmbed);
    if (container) containers.push(container);
  }

  if (containers.length === 0) return body;

  if (files.length) appendUnreferenced(containers[containers.length - 1], files, referenced);

  components.push(...containers);

  // Buttons and select menus the call site attached sit below the container.
  const existing = Array.isArray(body.components) ? body.components : [];
  components.push(...existing);

  while (components.length > 1 && countComponents(components) > MAX_COMPONENTS) {
    components.pop();
  }

  body.components = components;
  body.embeds = [];
  // A V2 message carries no top-level content at all - the key is dropped
  // rather than nulled so an edit never argues with the API about it.
  delete body.content;
  body.flags = (body.flags ?? 0) | IS_COMPONENTS_V2;

  return body;
}

let installed = false;

/**
 * Patches discord.js so every embed the bot sends is delivered as Components
 * V2. Safe to call more than once; set `COMPONENTS_V2=false` to opt out and
 * fall back to classic embeds.
 */
function installComponentsV2() {
  if (installed) return false;
  if (String(process.env.COMPONENTS_V2 ?? '').toLowerCase() === 'false') return false;

  const originalResolveBody = MessagePayload.prototype.resolveBody;

  MessagePayload.prototype.resolveBody = function resolveBody(...args) {
    const alreadyResolved = Boolean(this.body);
    const result = originalResolveBody.apply(this, args);
    if (alreadyResolved) return result;

    try {
      convertBody(this.body, { files: this.options?.files ?? [], target: this.target });
    } catch (err) {
      // A rendering slip must never cost the user their reply - the payload is
      // still a perfectly valid classic embed at this point.
      // eslint-disable-next-line no-console
      console.error('[componentsV2] Failed to convert embeds, sending as classic embed:', err);
    }

    return result;
  };

  installed = true;
  return true;
}

module.exports = {
  IS_COMPONENTS_V2,
  installComponentsV2,
  convertBody,
  embedToContainer
};
