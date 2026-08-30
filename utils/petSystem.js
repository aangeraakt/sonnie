const db = require('../database/db');

/**
 * Pet species. `power` scales hunt rewards, `cost` is the adoption price.
 * Stats decay over time so pets need regular attention.
 */
const SPECIES = {
  dog: { id: 'dog', name: 'Dog', emoji: '🐕', cost: 5000, power: 1.0, trait: 'Loyal - never runs away, even at zero happiness.' },
  cat: { id: 'cat', name: 'Cat', emoji: '🐈', cost: 5000, power: 0.9, trait: 'Independent - hunger decays 25% slower.' },
  fox: { id: 'fox', name: 'Fox', emoji: '🦊', cost: 12000, power: 1.2, trait: 'Cunning - 15% better hunt payouts.' },
  wolf: { id: 'wolf', name: 'Wolf', emoji: '🐺', cost: 25000, power: 1.5, trait: 'Fierce - strongest hunter of the common pets.' },
  panda: { id: 'panda', name: 'Panda', emoji: '🐼', cost: 30000, power: 1.1, trait: 'Content - happiness decays 40% slower.' },
  dragon: { id: 'dragon', name: 'Dragon', emoji: '🐉', cost: 150000, power: 2.5, trait: 'Legendary - by far the best hunter, but always hungry.' },
  phoenix: { id: 'phoenix', name: 'Phoenix', emoji: '🔥🦅', cost: 250000, power: 3.0, trait: 'Immortal - stats never fall below 25.' }
};

const HUNGER_DECAY_PER_HOUR = 4;
const HAPPINESS_DECAY_PER_HOUR = 3;
const FEED_COST = 250;
const FEED_RESTORE = 30;
const PLAY_RESTORE = 25;
const PLAY_COOLDOWN_MS = 30 * 60 * 1000;
const HUNT_COOLDOWN_MS = 60 * 60 * 1000;

function xpForPetLevel(level) {
  return 100 * level * level;
}

/**
 * Applies time-based stat decay and persists it. Every read path calls this
 * so stats are always current without needing a background loop.
 */
function refreshPet(guildId, userId) {
  const pet = db.getPet(guildId, userId);
  if (!pet) return null;

  const now = Date.now();
  const hoursSince = (now - (pet.last_decay || pet.created_at || now)) / 3600000;
  if (hoursSince < 0.25) return pet;

  const species = SPECIES[pet.species] || SPECIES.dog;
  const hungerRate = species.id === 'cat' ? HUNGER_DECAY_PER_HOUR * 0.75 : HUNGER_DECAY_PER_HOUR;
  const happinessRate = species.id === 'panda' ? HAPPINESS_DECAY_PER_HOUR * 0.6 : HAPPINESS_DECAY_PER_HOUR;
  const floor = species.id === 'phoenix' ? 25 : 0;

  const changes = {
    hunger: Math.max(floor, Math.round(pet.hunger - hungerRate * hoursSince)),
    happiness: Math.max(floor, Math.round(pet.happiness - happinessRate * hoursSince)),
    last_decay: now
  };

  return db.updatePet(guildId, userId, changes);
}

/** Overall condition, used to scale hunt rewards and shown on the pet card. */
function condition(pet) {
  return Math.round((pet.hunger + pet.happiness) / 2);
}

function conditionLabel(value) {
  if (value >= 80) return 'Thriving';
  if (value >= 60) return 'Healthy';
  if (value >= 40) return 'Restless';
  if (value >= 20) return 'Unhappy';
  return 'Neglected';
}

function statBar(value) {
  const filled = Math.max(0, Math.min(10, Math.round(value / 10)));
  return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)} ${value}%`;
}

/** Awards pet XP and returns the level-up result. */
function addPetXp(guildId, userId, amount) {
  const pet = db.getPet(guildId, userId);
  if (!pet) return null;

  let xp = pet.xp + amount;
  let level = pet.level;
  let leveledUp = false;

  while (xp >= xpForPetLevel(level)) {
    xp -= xpForPetLevel(level);
    level += 1;
    leveledUp = true;
  }

  db.updatePet(guildId, userId, { xp, level });
  return { xp, level, leveledUp, gained: amount };
}

/**
 * Hunt payout. Scales with species power, pet level, and condition, so a
 * neglected pet earns very little.
 */
function huntReward(pet) {
  const species = SPECIES[pet.species] || SPECIES.dog;
  const base = 300 + Math.random() * 500;
  const levelBonus = 1 + (pet.level - 1) * 0.12;
  const conditionScale = Math.max(0.15, condition(pet) / 100);
  const cunning = species.id === 'fox' ? 1.15 : 1;

  return Math.round(base * species.power * levelBonus * conditionScale * cunning);
}

module.exports = {
  SPECIES,
  FEED_COST,
  FEED_RESTORE,
  PLAY_RESTORE,
  PLAY_COOLDOWN_MS,
  HUNT_COOLDOWN_MS,
  xpForPetLevel,
  refreshPet,
  condition,
  conditionLabel,
  statBar,
  addPetXp,
  huntReward
};
