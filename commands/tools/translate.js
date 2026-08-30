const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');

// A trimmed list that fits Discord's 25-choice cap; `to` also accepts any
// ISO code typed by hand because the option is a free string.
const LANGUAGES = [
  { name: 'English', value: 'en' },
  { name: 'Dutch', value: 'nl' },
  { name: 'Spanish', value: 'es' },
  { name: 'French', value: 'fr' },
  { name: 'German', value: 'de' },
  { name: 'Italian', value: 'it' },
  { name: 'Portuguese', value: 'pt' },
  { name: 'Russian', value: 'ru' },
  { name: 'Polish', value: 'pl' },
  { name: 'Turkish', value: 'tr' },
  { name: 'Arabic', value: 'ar' },
  { name: 'Hindi', value: 'hi' },
  { name: 'Japanese', value: 'ja' },
  { name: 'Korean', value: 'ko' },
  { name: 'Chinese (Simplified)', value: 'zh-CN' },
  { name: 'Swedish', value: 'sv' },
  { name: 'Norwegian', value: 'no' },
  { name: 'Danish', value: 'da' },
  { name: 'Finnish', value: 'fi' },
  { name: 'Greek', value: 'el' },
  { name: 'Czech', value: 'cs' },
  { name: 'Romanian', value: 'ro' },
  { name: 'Ukrainian', value: 'uk' },
  { name: 'Vietnamese', value: 'vi' },
  { name: 'Indonesian', value: 'id' }
];

const LANGUAGE_NAMES = Object.fromEntries(LANGUAGES.map((lang) => [lang.value.toLowerCase(), lang.name]));

/**
 * Uses the public translate endpoint that the Google Translate web widget
 * calls. No API key, but it is unofficial - every failure mode is handled.
 */
async function translate(text, to, from = 'auto') {
  const url = 'https://translate.googleapis.com/translate_a/single'
    + `?client=gtx&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SonniesBot/1.0)' }
    });
    if (!response.ok) return { ok: false, error: `Translation service returned ${response.status}.` };

    const data = await response.json();
    if (!Array.isArray(data) || !Array.isArray(data[0])) {
      return { ok: false, error: 'The translation service returned an unexpected response.' };
    }

    const translated = data[0].map((chunk) => chunk[0]).filter(Boolean).join('');
    const detected = data[2] || from;
    return { ok: true, translated, detected };
  } catch (err) {
    if (err.name === 'AbortError') return { ok: false, error: 'The translation service timed out.' };
    return { ok: false, error: 'Could not reach the translation service.' };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('translate')
    .setDescription('Translate text into another language')
    .addStringOption(opt =>
      opt.setName('text')
        .setDescription('Text to translate')
        .setMaxLength(1800)
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('to')
        .setDescription('Target language (default: English)')
        .setRequired(false)
        .addChoices(...LANGUAGES)
    )
    .addStringOption(opt =>
      opt.setName('from')
        .setDescription('Source language (default: detect automatically)')
        .setRequired(false)
        .addChoices(...LANGUAGES)
    )
    .addBooleanOption(opt =>
      opt.setName('private')
        .setDescription('Only show the result to you')
        .setRequired(false)
    ),

  async execute(interaction) {
    const text = interaction.options.getString('text');
    const to = interaction.options.getString('to') || 'en';
    const from = interaction.options.getString('from') || 'auto';
    const isPrivate = interaction.options.getBoolean('private') || false;

    await interaction.deferReply({ flags: isPrivate ? 64 : undefined });

    const result = await translate(text, to, from);
    if (!result.ok) {
      return interaction.editReply({ embeds: [errorEmbed('Translation Failed', result.error)] });
    }

    const detectedName = LANGUAGE_NAMES[String(result.detected).toLowerCase()] || result.detected;
    const targetName = LANGUAGE_NAMES[to.toLowerCase()] || to;

    return interaction.editReply({
      embeds: [createEmbed({
        title: `Translation - ${detectedName} to ${targetName}`,
        fields: [
          { name: 'Original', value: text.slice(0, 1020) },
          { name: 'Translated', value: result.translated.slice(0, 1020) || '*empty result*' }
        ],
        footerText: 'Machine translation - accuracy is not guaranteed'
      })]
    });
  }
};

module.exports.translate = translate;
