const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('weather')
    .setDescription('Get live weather information for any city or location')
    .addStringOption(opt =>
      opt.setName('city')
        .setDescription('City name or location (e.g. Amsterdam, London, New York)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const city = interaction.options.getString('city');
    if (!city) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Location', 'Please specify a city or location!')], flags: 64 });
    }

    await interaction.deferReply();

    try {
      const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
        headers: { 'User-Agent': 'Sonnies-Discord-Bot' }
      });

      if (!res.ok) {
        return interaction.editReply({ embeds: [errorEmbed('Weather Error', 'Could not retrieve weather data. Check city name.')] });
      }

      const data = await res.json();
      const current = data.current_condition?.[0];
      const area = data.nearest_area?.[0];

      if (!current) {
        return interaction.editReply({ embeds: [errorEmbed('Not Found', `No weather data found for \`${city}\`.`)] });
      }

      const cityName = area?.areaName?.[0]?.value || city;
      const country = area?.country?.[0]?.value || '';
      const condition = current.weatherDesc?.[0]?.value || 'Clear';
      const tempC = current.temp_C;
      const tempF = current.temp_F;
      const feelsC = current.FeelsLikeC;
      const feelsF = current.FeelsLikeF;
      const humidity = current.humidity;
      const windKmph = current.windspeedKmph;
      const windMiles = current.windspeedMiles;
      const uvIndex = current.uvIndex;
      const visibility = current.visibility;

      // Weather emoji selector
      let weatherEmoji = '☀️';
      const condLower = condition.toLowerCase();
      if (condLower.includes('rain') || condLower.includes('drizzle')) weatherEmoji = '🌧️';
      else if (condLower.includes('thunder') || condLower.includes('storm')) weatherEmoji = '⛈️';
      else if (condLower.includes('snow') || condLower.includes('ice') || condLower.includes('blizzard')) weatherEmoji = '❄️';
      else if (condLower.includes('cloud') || condLower.includes('overcast')) weatherEmoji = '☁️';
      else if (condLower.includes('fog') || condLower.includes('mist')) weatherEmoji = '🌫️';
      else if (condLower.includes('partly')) weatherEmoji = '⛅';

      const embed = createEmbed({
        title: `${weatherEmoji} Weather in ${cityName}, ${country}`,
        description: `Current condition: **${condition}**`,
        color: 0x3498DB,
        fields: [
          { name: '🌡️ Temperature', value: `**${tempC}°C** (${tempF}°F)`, inline: true },
          { name: '🤔 Feels Like', value: `**${feelsC}°C** (${feelsF}°F)`, inline: true },
          { name: '💧 Humidity', value: `**${humidity}%**`, inline: true },
          { name: '💨 Wind Speed', value: `**${windKmph} km/h** (${windMiles} mph)`, inline: true },
          { name: '☀️ UV Index', value: `**${uvIndex}**`, inline: true },
          { name: '👁️ Visibility', value: `**${visibility} km**`, inline: true }
        ],
        footerText: `Live Weather Data • Observed at ${current.localObsDateTime || 'Now'}`
      });

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      return interaction.editReply({ embeds: [errorEmbed('Weather Error', `Failed to fetch weather: ${err.message}`)] });
    }
  }
};
