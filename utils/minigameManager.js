const db = require('../database/db');
const { createEmbed } = require('./embedBuilder');

const FLAGS = [
  { code: 'NL', names: ['netherlands', 'holland', 'the netherlands'] },
  { code: 'BE', names: ['belgium'] },
  { code: 'DE', names: ['germany', 'deutschland'] },
  { code: 'FR', names: ['france'] },
  { code: 'ES', names: ['spain'] },
  { code: 'IT', names: ['italy'] },
  { code: 'PT', names: ['portugal'] },
  { code: 'GB', names: ['united kingdom', 'uk', 'great britain', 'britain', 'england'] },
  { code: 'IE', names: ['ireland'] },
  { code: 'US', names: ['united states', 'usa', 'america', 'united states of america'] },
  { code: 'CA', names: ['canada'] },
  { code: 'MX', names: ['mexico'] },
  { code: 'BR', names: ['brazil'] },
  { code: 'AR', names: ['argentina'] },
  { code: 'JP', names: ['japan'] },
  { code: 'CN', names: ['china'] },
  { code: 'KR', names: ['south korea', 'korea'] },
  { code: 'IN', names: ['india'] },
  { code: 'AU', names: ['australia'] },
  { code: 'NZ', names: ['new zealand'] },
  { code: 'SE', names: ['sweden'] },
  { code: 'NO', names: ['norway'] },
  { code: 'FI', names: ['finland'] },
  { code: 'DK', names: ['denmark'] },
  { code: 'PL', names: ['poland'] },
  { code: 'UA', names: ['ukraine'] },
  { code: 'TR', names: ['turkey'] },
  { code: 'GR', names: ['greece'] },
  { code: 'CH', names: ['switzerland'] },
  { code: 'AT', names: ['austria'] },
  { code: 'RU', names: ['russia'] },
  { code: 'ZA', names: ['south africa'] },
  { code: 'EG', names: ['egypt'] },
  { code: 'NG', names: ['nigeria'] },
  { code: 'KE', names: ['kenya'] },
  { code: 'MA', names: ['morocco'] },
  { code: 'SA', names: ['saudi arabia'] },
  { code: 'AE', names: ['united arab emirates', 'uae'] },
  { code: 'IL', names: ['israel'] },
  { code: 'TH', names: ['thailand'] },
  { code: 'VN', names: ['vietnam'] },
  { code: 'PH', names: ['philippines'] },
  { code: 'ID', names: ['indonesia'] },
  { code: 'MY', names: ['malaysia'] },
  { code: 'SG', names: ['singapore'] },
  { code: 'CL', names: ['chile'] },
  { code: 'CO', names: ['colombia'] },
  { code: 'PE', names: ['peru'] },
  { code: 'IS', names: ['iceland'] },
  { code: 'HR', names: ['croatia'] }
];

const SNAKE_STARTS = ['apple', 'ocean', 'night', 'tiger', 'river', 'music', 'lemon', 'house', 'planet', 'garden'];

function flagEmoji(code) {
  return [...String(code || '').toUpperCase()].map((char) => String.fromCodePoint(127397 + char.charCodeAt(0))).join('');
}

function flagImageUrl(code) {
  return `https://flagcdn.com/w640/${String(code || '').toLowerCase()}.png`;
}

function normalizeGuess(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchFlag(guess, flag) {
  const normalized = normalizeGuess(guess);
  if (!normalized || !flag) return false;
  return flag.names.some((name) => normalizeGuess(name) === normalized);
}

function lastLetter(word) {
  const letters = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
  return letters.slice(-1);
}

function isSnakeWord(text) {
  return /^[a-zA-Z]{3,32}$/.test(String(text || '').trim());
}

function findFlag(code) {
  return FLAGS.find((flag) => flag.code === code) || null;
}

function pickFlag(excludeCode) {
  const pool = excludeCode ? FLAGS.filter((flag) => flag.code !== excludeCode) : FLAGS;
  const list = pool.length ? pool : FLAGS;
  return list[Math.floor(Math.random() * list.length)];
}

function pickNumber(exclude) {
  let number = Math.floor(Math.random() * 100) + 1;
  if (exclude != null && number === exclude) {
    number = (number % 100) + 1;
  }
  return number;
}

function pickSnakeStart() {
  return SNAKE_STARTS[Math.floor(Math.random() * SNAKE_STARTS.length)];
}

function flagPromptEmbed(flag) {
  const embed = createEmbed({
    title: 'Guess the Flag',
    description: 'What country is this? Type the country name in chat.'
  });
  embed.setImage(flagImageUrl(flag.code));
  return embed;
}

function numberPromptEmbed() {
  return createEmbed({
    title: 'Guess the Number',
    description: 'I picked a number from **1** to **100**.\nType a number in chat.\n⬆️ means go higher, ⬇️ means go lower.'
  });
}

function snakePromptEmbed(word) {
  return createEmbed({
    title: 'Word Snake',
    description: `Starter word: **${word}**\nNext word must start with **${lastLetter(word).toUpperCase()}**.\nOne word per message, at least 3 letters, no repeats, and not the same person twice in a row.`
  });
}

async function deleteInvalid(message) {
  try {
    await message.delete();
  } catch (err) {}
}

async function handleMinigameMessage(message) {
  if (!message.guild || message.author.bot) return false;
  const game = db.getMinigameByChannel(message.channel.id);
  if (!game) return false;

  const content = message.content.trim();

  if (game.type === 'flag') {
    let flag = findFlag(game.code);
    if (!flag) {
      flag = pickFlag();
      db.updateMinigameState(game.guildId, 'flag', { code: flag.code });
      await message.channel.send({ embeds: [flagPromptEmbed(flag)] }).catch(() => {});
      await deleteInvalid(message);
      return true;
    }
    if (!/^[a-zA-Z][a-zA-Z\s]{1,40}$/.test(content) || !matchFlag(content, flag)) {
      await deleteInvalid(message);
      return true;
    }
    await message.react('✅').catch(() => {});
    const next = pickFlag(flag.code);
    db.updateMinigameState(game.guildId, 'flag', { code: next.code });
    await message.channel.send({
      embeds: [
        createEmbed({
          title: 'Guess the Flag',
          description: `${message.author} got it!\n${flagEmoji(flag.code)} **${flag.names[0]}**`
        }),
        flagPromptEmbed(next)
      ]
    }).catch(() => {});
    return true;
  }

  if (game.type === 'number') {
    let secret = Number(game.number);
    if (!Number.isInteger(secret) || secret < 1 || secret > 100) {
      secret = pickNumber();
      db.updateMinigameState(game.guildId, 'number', { number: secret });
      await message.channel.send({ embeds: [numberPromptEmbed()] }).catch(() => {});
      await deleteInvalid(message);
      return true;
    }
    if (!/^\d{1,3}$/.test(content)) {
      await deleteInvalid(message);
      return true;
    }
    const guess = Number(content);
    if (!Number.isInteger(guess) || guess < 1 || guess > 100) {
      await deleteInvalid(message);
      return true;
    }
    if (guess === secret) {
      await message.react('✅').catch(() => {});
      const next = pickNumber(secret);
      db.updateMinigameState(game.guildId, 'number', { number: next });
      await message.channel.send({
        embeds: [
          createEmbed({
            title: 'Guess the Number',
            description: `${message.author} found **${secret}**. A new number is ready.`
          }),
          numberPromptEmbed()
        ]
      }).catch(() => {});
      return true;
    }
    await message.react(guess < secret ? '⬆️' : '⬇️').catch(() => {});
    return true;
  }

  if (game.type === 'snake') {
    let lastWord = game.lastWord;
    let used = Array.isArray(game.used) ? game.used : [];
    if (!lastWord) {
      lastWord = pickSnakeStart();
      used = [lastWord];
      db.updateMinigameState(game.guildId, 'snake', { lastWord, lastUserId: null, used });
      await message.channel.send({ embeds: [snakePromptEmbed(lastWord)] }).catch(() => {});
      await deleteInvalid(message);
      return true;
    }
    if (!isSnakeWord(content)) {
      await deleteInvalid(message);
      return true;
    }
    const word = content.toLowerCase();
    const needed = lastLetter(lastWord);
    const valid = word.startsWith(needed) && !used.includes(word) && game.lastUserId !== message.author.id;
    if (!valid) {
      await deleteInvalid(message);
      return true;
    }
    db.updateMinigameState(game.guildId, 'snake', {
      lastWord: word,
      lastUserId: message.author.id,
      used: [...used, word]
    });
    await message.react('✅').catch(() => {});
    return true;
  }

  return true;
}

module.exports = {
  FLAGS,
  flagEmoji,
  flagImageUrl,
  normalizeGuess,
  matchFlag,
  lastLetter,
  isSnakeWord,
  pickFlag,
  pickNumber,
  pickSnakeStart,
  flagPromptEmbed,
  numberPromptEmbed,
  snakePromptEmbed,
  handleMinigameMessage
};
