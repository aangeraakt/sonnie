const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const { createEmbed, successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const {
  SPECIES, FEED_COST, FEED_RESTORE, PLAY_RESTORE, PLAY_COOLDOWN_MS, HUNT_COOLDOWN_MS,
  xpForPetLevel, refreshPet, condition, conditionLabel, statBar, addPetXp, huntReward
} = require('../../utils/petSystem');
const { checkAndAnnounce } = require('../../utils/achievements');
const { trackQuest } = require('../../utils/questSystem');

const SPECIES_CHOICES = Object.values(SPECIES).map((species) => ({
  name: `${species.name} - ${species.cost.toLocaleString()} coins`,
  value: species.id
}));

function remaining(until) {
  const ms = until - Date.now();
  if (ms <= 0) return null;
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  return `${Math.ceil(minutes / 60)} hour${Math.ceil(minutes / 60) === 1 ? '' : 's'}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pet')
    .setDescription('Adopt and raise a pet companion')
    .addSubcommand(sub =>
      sub.setName('adopt')
        .setDescription('Adopt a new pet')
        .addStringOption(opt => opt.setName('species').setDescription('Which pet to adopt').setRequired(true).addChoices(...SPECIES_CHOICES))
        .addStringOption(opt => opt.setName('name').setDescription('Name your pet').setMaxLength(32).setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View your pet, or someone else\'s')
        .addUserOption(opt => opt.setName('user').setDescription('Whose pet to view').setRequired(false))
    )
    .addSubcommand(sub => sub.setName('feed').setDescription(`Feed your pet (${FEED_COST} coins)`))
    .addSubcommand(sub => sub.setName('play').setDescription('Play with your pet to raise happiness'))
    .addSubcommand(sub => sub.setName('hunt').setDescription('Send your pet out to earn coins'))
    .addSubcommand(sub =>
      sub.setName('rename')
        .setDescription('Rename your pet')
        .addStringOption(opt => opt.setName('name').setDescription('New name').setMaxLength(32).setRequired(true))
    )
    .addSubcommand(sub => sub.setName('release').setDescription('Release your pet back into the wild (permanent)'))
    .addSubcommand(sub => sub.setName('shop').setDescription('See every pet you can adopt'))
    .addSubcommand(sub => sub.setName('leaderboard').setDescription('The top pets in this server')),

  async execute(interaction) {
    const { guild, user } = interaction;
    const sub = interaction.options.getSubcommand();

    if (sub === 'shop') {
      return interaction.reply({
        embeds: [createEmbed({
          title: 'Pet Shop',
          description: 'Adopt with `/pet adopt`. Hunt payouts scale with species power, level, and how well you look after them.',
          fields: Object.values(SPECIES).map((species) => ({
            name: `${species.emoji} ${species.name} - ${species.cost.toLocaleString()} coins`,
            value: `Power \`${species.power}x\`\n${species.trait}`,
            inline: true
          }))
        })]
      });
    }

    if (sub === 'leaderboard') {
      const top = db.getTopPets(guild.id, 10);
      if (!top.length) {
        return interaction.reply({ embeds: [errorEmbed('No Pets Yet', 'Nobody in this server has adopted a pet. Be the first with `/pet adopt`.')], flags: 64 });
      }
      return interaction.reply({
        embeds: [createEmbed({
          title: `Top Pets - ${guild.name}`,
          description: top.map((pet, index) => {
            const species = SPECIES[pet.species] || SPECIES.dog;
            return `\`${index + 1}.\` ${species.emoji} **${pet.name}** (${species.name}) - Level ${pet.level}\n Owner: <@${pet.user_id}>`;
          }).join('\n\n')
        })]
      });
    }

    if (sub === 'view') {
      const target = interaction.options.getUser('user') || user;
      const pet = refreshPet(guild.id, target.id);
      if (!pet) {
        return interaction.reply({
          embeds: [errorEmbed('No Pet', target.id === user.id
            ? 'You do not have a pet yet. Adopt one with `/pet adopt`.'
            : `**${target.tag}** does not have a pet.`)],
          flags: 64
        });
      }

      const species = SPECIES[pet.species] || SPECIES.dog;
      const health = condition(pet);
      const playReady = remaining(pet.last_played + PLAY_COOLDOWN_MS);
      const huntReady = remaining(pet.last_hunt + HUNT_COOLDOWN_MS);

      return interaction.reply({
        embeds: [createEmbed({
          title: `${species.emoji} ${pet.name}`,
          description: `**${species.name}** owned by <@${target.id}>\n*${species.trait}*`,
          fields: [
            { name: 'Level', value: `\`${pet.level}\``, inline: true },
            { name: 'XP', value: `\`${pet.xp} / ${xpForPetLevel(pet.level)}\``, inline: true },
            { name: 'Condition', value: `\`${conditionLabel(health)}\``, inline: true },
            { name: 'Hunger', value: `\`${statBar(pet.hunger)}\``, inline: false },
            { name: 'Happiness', value: `\`${statBar(pet.happiness)}\``, inline: false },
            { name: 'Play', value: playReady ? `Ready in ${playReady}` : 'Ready now', inline: true },
            { name: 'Hunt', value: huntReady ? `Ready in ${huntReady}` : 'Ready now', inline: true },
            { name: 'Adopted', value: `<t:${Math.floor(pet.created_at / 1000)}:R>`, inline: true }
          ],
          footerText: 'Stats decay over time - feed and play regularly'
        })]
      });
    }

    if (sub === 'adopt') {
      if (db.getPet(guild.id, user.id)) {
        return interaction.reply({ embeds: [errorEmbed('You Already Have a Pet', 'Release your current pet with `/pet release` before adopting another.')], flags: 64 });
      }

      const speciesId = interaction.options.getString('species');
      const species = SPECIES[speciesId];
      const profile = db.getUser(guild.id, user.id);

      if (profile.balance < species.cost) {
        return interaction.reply({
          embeds: [errorEmbed('Not Enough Coins', `A ${species.name} costs **${species.cost.toLocaleString()}** coins. You have **${profile.balance.toLocaleString()}** in your wallet.`)],
          flags: 64
        });
      }

      const name = (interaction.options.getString('name') || species.name).slice(0, 32);
      db.addBalance(guild.id, user.id, -species.cost);
      db.createPet(guild.id, user.id, { species: speciesId, name, last_decay: Date.now() });

      await interaction.reply({
        embeds: [successEmbed('Pet Adopted',
          `${species.emoji} You adopted **${name}** the ${species.name} for **${species.cost.toLocaleString()}** coins.\n\n*${species.trait}*\n\nFeed and play with them to keep them happy, then send them hunting with \`/pet hunt\`.`)]
      });
      return checkAndAnnounce(interaction);
    }

    // Every remaining subcommand acts on the caller's own pet.
    const pet = refreshPet(guild.id, user.id);
    if (!pet) {
      return interaction.reply({ embeds: [errorEmbed('No Pet', 'You do not have a pet yet. Adopt one with `/pet adopt`.')], flags: 64 });
    }
    const species = SPECIES[pet.species] || SPECIES.dog;

    if (sub === 'rename') {
      const name = interaction.options.getString('name').slice(0, 32);
      db.updatePet(guild.id, user.id, { name });
      return interaction.reply({ embeds: [successEmbed('Pet Renamed', `${species.emoji} **${pet.name}** is now called **${name}**.`)] });
    }

    if (sub === 'release') {
      db.releasePet(guild.id, user.id);
      return interaction.reply({
        embeds: [successEmbed('Pet Released', `${species.emoji} **${pet.name}** has been released back into the wild. You can adopt a new pet whenever you like.`)]
      });
    }

    if (sub === 'feed') {
      if (pet.hunger >= 100) {
        return interaction.reply({ embeds: [errorEmbed('Already Full', `**${pet.name}** is completely full right now.`)], flags: 64 });
      }

      const profile = db.getUser(guild.id, user.id);
      if (profile.balance < FEED_COST) {
        return interaction.reply({ embeds: [errorEmbed('Not Enough Coins', `Feeding costs **${FEED_COST}** coins. You have **${profile.balance.toLocaleString()}**.`)], flags: 64 });
      }

      db.addBalance(guild.id, user.id, -FEED_COST);
      const hunger = Math.min(100, pet.hunger + FEED_RESTORE);
      db.updatePet(guild.id, user.id, { hunger, last_fed: Date.now() });
      const xp = addPetXp(guild.id, user.id, 10);
      trackQuest(guild.id, user.id, 'pet_care', 1);

      return interaction.reply({
        embeds: [successEmbed('Pet Fed',
          `${species.emoji} **${pet.name}** ate happily. (-${FEED_COST} coins)\n\nHunger: \`${statBar(hunger)}\`${xp?.leveledUp ? `\n\n**${pet.name}** reached level **${xp.level}**!` : ''}`)]
      });
    }

    if (sub === 'play') {
      const wait = remaining(pet.last_played + PLAY_COOLDOWN_MS);
      if (wait) {
        return interaction.reply({ embeds: [errorEmbed('Pet Is Resting', `**${pet.name}** wants to rest. Try again in **${wait}**.`)], flags: 64 });
      }

      const happiness = Math.min(100, pet.happiness + PLAY_RESTORE);
      db.updatePet(guild.id, user.id, { happiness, last_played: Date.now() });
      const xp = addPetXp(guild.id, user.id, 15);
      trackQuest(guild.id, user.id, 'pet_care', 1);

      return interaction.reply({
        embeds: [successEmbed('Play Time',
          `${species.emoji} You played with **${pet.name}**. They loved it.\n\nHappiness: \`${statBar(happiness)}\`${xp?.leveledUp ? `\n\n**${pet.name}** reached level **${xp.level}**!` : ''}`)]
      });
    }

    if (sub === 'hunt') {
      const wait = remaining(pet.last_hunt + HUNT_COOLDOWN_MS);
      if (wait) {
        return interaction.reply({ embeds: [errorEmbed('Pet Is Tired', `**${pet.name}** needs to recover. Try again in **${wait}**.`)], flags: 64 });
      }
      if (pet.hunger < 20) {
        return interaction.reply({ embeds: [errorEmbed('Pet Is Too Hungry', `**${pet.name}** is too hungry to hunt. Feed them first with \`/pet feed\`.`)], flags: 64 });
      }

      const reward = huntReward(pet);
      const health = condition(pet);

      db.addBalance(guild.id, user.id, reward);
      db.updatePet(guild.id, user.id, {
        last_hunt: Date.now(),
        hunger: Math.max(0, pet.hunger - 15),
        happiness: Math.max(0, pet.happiness - 5)
      });
      const xp = addPetXp(guild.id, user.id, 40);
      db.bumpAchievementStat(guild.id, user.id, 'pet_hunts', 1);

      await interaction.reply({
        embeds: [successEmbed('Hunt Complete',
          `${species.emoji} **${pet.name}** returned with **${reward.toLocaleString()}** coins!\n\n` +
          `Condition when they set out: **${conditionLabel(health)}** (${health}%)\n` +
          `Hunting is tiring - hunger and happiness both dropped.${xp?.leveledUp ? `\n\n**${pet.name}** reached level **${xp.level}**!` : ''}`)]
      });
      return checkAndAnnounce(interaction);
    }

    return interaction.reply({ embeds: [errorEmbed('Unknown Option', 'That pet option is not available.')], flags: 64 });
  }
};
