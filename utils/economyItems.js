/**
 * Sonnies Economy Items Catalog and Loot Tables
 */

const ITEMS = {
  // --- 🛠️ TOOLS ---
  fishing_rod: {
    id: 'fishing_rod',
    name: 'Basic Fishing Rod',
    emoji: '🎣',
    category: 'tools',
    buyPrice: 200,
    sellPrice: 100,
    description: 'A sturdy wooden rod for catching freshwater and coastal fish.'
  },
  pro_rod: {
    id: 'pro_rod',
    name: 'Carbon Fiber Pro Rod',
    emoji: '🎏',
    category: 'tools',
    buyPrice: 1500,
    sellPrice: 500,
    description: 'High-end rod that boosts your chances of catching Rare & Legendary sea creatures!'
  },
  hunting_bow: {
    id: 'hunting_bow',
    name: 'Hunting Bow & Arrows',
    emoji: '🏹',
    category: 'tools',
    buyPrice: 250,
    sellPrice: 120,
    description: 'A classic recurve bow for tracking and hunting forest game.'
  },
  hunting_rifle: {
    id: 'hunting_rifle',
    name: 'Precision Hunting Rifle',
    emoji: '🎯',
    category: 'tools',
    buyPrice: 1800,
    sellPrice: 600,
    description: 'Sniper rifle capable of taking down massive predators and mythical beasts.'
  },
  pickaxe: {
    id: 'pickaxe',
    name: 'Iron Pickaxe',
    emoji: '⛏️',
    category: 'tools',
    buyPrice: 300,
    sellPrice: 150,
    description: 'Standard pickaxe to mine underground tunnels for valuable ores and minerals.'
  },
  diamond_pickaxe: {
    id: 'diamond_pickaxe',
    name: 'Diamond-Tipped Drill',
    emoji: '💎⛏️',
    category: 'tools',
    buyPrice: 2400,
    sellPrice: 800,
    description: 'Ultra-durable drill that penetrates deep bedrock to extract rubies, diamonds, and netherite.'
  },
  shovel: {
    id: 'shovel',
    name: 'Archaeologist Shovel',
    emoji: '🔍',
    category: 'tools',
    buyPrice: 220,
    sellPrice: 110,
    description: 'Special metal detector & shovel to dig up buried historical artifacts and treasures.'
  },
  watering_can: {
    id: 'watering_can',
    name: 'Botanist Watering Can',
    emoji: '🚿',
    category: 'tools',
    buyPrice: 180,
    sellPrice: 80,
    description: 'Handy tool used to tend and harvest higher-yielding farm crops.'
  },
  welding_torch: {
    id: 'welding_torch',
    name: 'Industrial Salvage Torch',
    emoji: '🔦',
    category: 'tools',
    buyPrice: 350,
    sellPrice: 150,
    description: 'Cuts through heavy scrap metal and dismantled tech in salvage yards.'
  },

  // --- ⚡ XP BOOSTERS ---
  xp_booster_15: {
    id: 'xp_booster_15',
    name: '1.5x XP Booster (1 Hour)',
    emoji: '⚡',
    category: 'consumables',
    buyPrice: 500,
    sellPrice: 150,
    multiplier: 1.5,
    durationMs: 60 * 60 * 1000,
    description: 'Consumable that grants 1.5x XP boost across all activities for 1 hour.'
  },
  xp_booster_20: {
    id: 'xp_booster_20',
    name: '2.0x XP Booster (1 Hour)',
    emoji: '🚀',
    category: 'consumables',
    buyPrice: 1200,
    sellPrice: 400,
    multiplier: 2.0,
    durationMs: 60 * 60 * 1000,
    description: 'Double XP! Consumable that grants 2.0x XP boost across all activities for 1 hour.'
  },
  xp_booster_30: {
    id: 'xp_booster_30',
    name: '3.0x Mega XP Booster (2 Hours)',
    emoji: '🌟',
    category: 'consumables',
    buyPrice: 3000,
    sellPrice: 1000,
    multiplier: 3.0,
    durationMs: 2 * 60 * 60 * 1000,
    description: 'Triple XP! Colossal 3.0x XP boost across all chat, voice, and economy activities for 2 hours.'
  },

  // --- 📦 CONSUMABLES ---
  bait: {
    id: 'bait',
    name: 'Worm Bait (x5)',
    emoji: '🪱',
    category: 'consumables',
    buyPrice: 50,
    sellPrice: 15,
    description: 'Juicy live bait that attracts bigger, more profitable fish.'
  },
  lucky_clover: {
    id: 'lucky_clover',
    name: 'Four-Leaf Clover',
    emoji: '🍀',
    category: 'consumables',
    buyPrice: 250,
    sellPrice: 80,
    description: 'Consumable that grants 15 minutes of 2x Lucky Drop Chance for gathering.'
  },
  energy_drink: {
    id: 'energy_drink',
    name: 'Overdrive Energy Drink',
    emoji: '⚡🥤',
    category: 'consumables',
    buyPrice: 180,
    sellPrice: 60,
    description: 'Drink to immediately reset all your gathering and job cooldowns!'
  },
  mystery_box: {
    id: 'mystery_box',
    name: 'Golden Mystery Box',
    emoji: '🎁',
    category: 'consumables',
    buyPrice: 500,
    sellPrice: 200,
    description: 'Open to win random prizes ranging from $200 up to $5,000 coins or rare items!'
  },
  padlock: {
    id: 'padlock',
    name: 'Padlock',
    emoji: '🔒',
    category: 'consumables',
    buyPrice: 450,
    sellPrice: 80,
    description: 'Use this to block robberies on your wallet for 2 hours.'
  },

  // --- 🐟 FISH & MARINE LIFE ---
  boot: { id: 'boot', name: 'Old Boot', emoji: '👞', category: 'fish', buyPrice: null, sellPrice: 5, rarity: 'Junk', description: 'A soggy leather boot pulled from the depths.' },
  seaweed: { id: 'seaweed', name: 'Tangled Seaweed', emoji: '🌿', category: 'fish', buyPrice: null, sellPrice: 12, rarity: 'Junk', description: 'Slimy green seaweed.' },
  goldfish: { id: 'goldfish', name: 'Common Goldfish', emoji: '🐟', category: 'fish', buyPrice: null, sellPrice: 40, rarity: 'Common', description: 'A small shiny goldfish.' },
  trout: { id: 'trout', name: 'Rainbow Trout', emoji: '🐠', category: 'fish', buyPrice: null, sellPrice: 75, rarity: 'Common', description: 'A vibrant freshwater trout.' },
  salmon: { id: 'salmon', name: 'Alaskan Salmon', emoji: '🍣', category: 'fish', buyPrice: null, sellPrice: 130, rarity: 'Uncommon', description: 'A delicious pink salmon.' },
  sea_bass: { id: 'sea_bass', name: 'Striped Sea Bass', emoji: '🐡', category: 'fish', buyPrice: null, sellPrice: 220, rarity: 'Uncommon', description: 'A prized coastal game fish.' },
  squid: { id: 'squid', name: 'Giant Squid', emoji: '🦑', category: 'fish', buyPrice: null, sellPrice: 450, rarity: 'Rare', description: 'A massive multi-tentacled sea creature.' },
  electric_eel: { id: 'electric_eel', name: 'Voltaic Electric Eel', emoji: '⚡', category: 'fish', buyPrice: null, sellPrice: 750, rarity: 'Rare', description: 'A crackling eel generating 500 volts.' },
  shark: { id: 'shark', name: 'Great White Shark', emoji: '🦈', category: 'fish', buyPrice: null, sellPrice: 1500, rarity: 'Epic', description: 'An apex ocean predator.' },
  treasure_chest: { id: 'treasure_chest', name: 'Sunken Pirate Chest', emoji: '👑💎', category: 'fish', buyPrice: null, sellPrice: 3500, rarity: 'LEGENDARY', description: 'A locked chest overflowing with ancient Spanish doubloons!' },

  // --- 🏹 HUNTED GAME ---
  rabbit: { id: 'rabbit', name: 'Cottontail Rabbit', emoji: '🐇', category: 'game', buyPrice: null, sellPrice: 45, rarity: 'Common', description: 'A swift little forest rabbit.' },
  duck: { id: 'duck', name: 'Wild Mallard Duck', emoji: '🦆', category: 'game', buyPrice: null, sellPrice: 85, rarity: 'Common', description: 'A waterfowl captured near the riverbanks.' },
  fox_pelt: { id: 'fox_pelt', name: 'Silver Fox Pelt', emoji: '🦊', category: 'game', buyPrice: null, sellPrice: 150, rarity: 'Uncommon', description: 'Luxurious fur from a clever silver fox.' },
  wild_boar: { id: 'wild_boar', name: 'Wild Tusker Boar', emoji: '🐗', category: 'game', buyPrice: null, sellPrice: 260, rarity: 'Uncommon', description: 'A ferocious tusker hunted in the woods.' },
  deer: { id: 'deer', name: 'Majestic White-Tail Stag', emoji: '🦌', category: 'game', buyPrice: null, sellPrice: 450, rarity: 'Rare', description: 'A full-grown trophy buck with large antlers.' },
  wolf: { id: 'wolf', name: 'Alpha Timber Wolf', emoji: '🐺', category: 'game', buyPrice: null, sellPrice: 800, rarity: 'Rare', description: 'The feared leader of the mountain wolfpack.' },
  bear: { id: 'bear', name: 'Grizzly Bear', emoji: '🐻', category: 'game', buyPrice: null, sellPrice: 1600, rarity: 'Epic', description: 'A towering 800lb grizzly bear.' },
  golden_stag: { id: 'golden_stag', name: 'Mythical Golden Stag', emoji: '✨👑', category: 'game', buyPrice: null, sellPrice: 4000, rarity: 'LEGENDARY', description: 'A creature of legend with horns spun from pure gold!' },

  // --- ⛏️ MINERALS & ORES ---
  stone: { id: 'stone', name: 'Granite Cobblestone', emoji: '🪨', category: 'minerals', buyPrice: null, sellPrice: 8, rarity: 'Junk', description: 'Common heavy rocks.' },
  coal: { id: 'coal', name: 'Anthracite Coal', emoji: '⬛', category: 'minerals', buyPrice: null, sellPrice: 30, rarity: 'Common', description: 'Dark combustible mineral fuel.' },
  copper: { id: 'copper', name: 'Copper Chunk', emoji: '🟤', category: 'minerals', buyPrice: null, sellPrice: 70, rarity: 'Common', description: 'A raw reddish-brown copper nugget.' },
  iron: { id: 'iron', name: 'Iron Ore Cluster', emoji: '⚙️', category: 'minerals', buyPrice: null, sellPrice: 140, rarity: 'Uncommon', description: 'High-grade metallic iron ore.' },
  gold_ore: { id: 'gold_ore', name: 'Pure Gold Nugget', emoji: '🪙', category: 'minerals', buyPrice: null, sellPrice: 350, rarity: 'Uncommon', description: 'Gleaming yellow gold discovered in rock veins.' },
  ruby: { id: 'ruby', name: 'Star Ruby Gem', emoji: '🔴', category: 'minerals', buyPrice: null, sellPrice: 850, rarity: 'Rare', description: 'A sparkling crimson precious gemstone.' },
  emerald: { id: 'emerald', name: 'Luminous Emerald', emoji: '🟢', category: 'minerals', buyPrice: null, sellPrice: 1200, rarity: 'Rare', description: 'A deep green radiant emerald.' },
  diamond: { id: 'diamond', name: 'Flawless Diamond', emoji: '💎', category: 'minerals', buyPrice: null, sellPrice: 2500, rarity: 'Epic', description: 'An uncut sparkling diamond of maximum clarity.' },
  netherite: { id: 'netherite', name: 'Ancient Netherite Scrap', emoji: '🌌', category: 'minerals', buyPrice: null, sellPrice: 5500, rarity: 'LEGENDARY', description: 'An indestructible extraterrestrial alloy from deep below.' },

  // --- 🏺 RELICS & BURIED ARTIFACTS ---
  rusty_nail: { id: 'rusty_nail', name: 'Bent Rusty Nail', emoji: '🔩', category: 'relics', buyPrice: null, sellPrice: 5, rarity: 'Junk', description: 'An old oxidized iron nail.' },
  old_coin: { id: 'old_coin', name: 'Ancient Roman Denarius', emoji: '🪙', category: 'relics', buyPrice: null, sellPrice: 90, rarity: 'Common', description: 'A 2,000-year-old silver coin with an emperor’s face.' },
  fossil: { id: 'fossil', name: 'Velociraptor Fossil', emoji: '🦴', category: 'relics', buyPrice: null, sellPrice: 350, rarity: 'Uncommon', description: 'A preserved prehistoric claw fossil.' },
  golden_goblet: { id: 'golden_goblet', name: 'Chalice of Kings', emoji: '🏆', category: 'relics', buyPrice: null, sellPrice: 1000, rarity: 'Rare', description: 'An ornate gold goblet encrusted with garnets.' },
  diamond_ring: { id: 'diamond_ring', name: 'Vintage Diamond Ring', emoji: '💍', category: 'relics', buyPrice: null, sellPrice: 2800, rarity: 'Epic', description: 'An exquisite lost heirloom wedding ring.' },
  ancient_relic: { id: 'ancient_relic', name: 'Pharaoh’s Ankh of Eternity', emoji: '🏺✨', category: 'relics', buyPrice: null, sellPrice: 6500, rarity: 'LEGENDARY', description: 'A sacred golden artifact humming with ancient energy!' },

  // --- 🌾 FARM CROPS ---
  wheat: { id: 'wheat', name: 'Golden Wheat Sheaf', emoji: '🌾', category: 'crops', buyPrice: null, sellPrice: 40, rarity: 'Common', description: 'Freshly harvested golden wheat bundle.' },
  carrots: { id: 'carrots', name: 'Crunchy Garden Carrots', emoji: '🥕', category: 'crops', buyPrice: null, sellPrice: 75, rarity: 'Common', description: 'Sweet, vibrant garden carrots.' },
  potatoes: { id: 'potatoes', name: 'Russet Baking Potatoes', emoji: '🥔', category: 'crops', buyPrice: null, sellPrice: 110, rarity: 'Common', description: 'Hearty russet potatoes dug from rich soil.' },
  strawberries: { id: 'strawberries', name: 'Sweet Organic Strawberries', emoji: '🍓', category: 'crops', buyPrice: null, sellPrice: 240, rarity: 'Uncommon', description: 'Juicy ripe red strawberries.' },
  pumpkin: { id: 'pumpkin', name: 'Prize Giant Pumpkin', emoji: '🎃', category: 'crops', buyPrice: null, sellPrice: 650, rarity: 'Rare', description: 'A massive award-winning autumn pumpkin.' },
  golden_apple: { id: 'golden_apple', name: 'Enchanted Golden Apple', emoji: '🍏✨', category: 'crops', buyPrice: null, sellPrice: 2200, rarity: 'Epic', description: 'A magical glowing fruit harvested from a rare golden orchard.' },

  // --- 🔩 TECH & SCRAP SALVAGE ---
  scrap_metal: { id: 'scrap_metal', name: 'Bale of Scrap Metal', emoji: '🔩', category: 'salvage', buyPrice: null, sellPrice: 35, rarity: 'Junk', description: 'Recyclable iron and aluminum scraps.' },
  copper_wire: { id: 'copper_wire', name: 'Spool of Copper Wire', emoji: '🧵', category: 'salvage', buyPrice: null, sellPrice: 95, rarity: 'Common', description: 'High-conductivity copper wiring pulled from old generators.' },
  circuit_board: { id: 'circuit_board', name: 'Intact Circuit Board', emoji: '🎛️', category: 'salvage', buyPrice: null, sellPrice: 280, rarity: 'Uncommon', description: 'A salvageable motherboard packed with microchips.' },
  titanium_alloy: { id: 'titanium_alloy', name: 'Aviation Titanium Plate', emoji: '🛡️', category: 'salvage', buyPrice: null, sellPrice: 750, rarity: 'Rare', description: 'High-strength titanium plating stripped from airplane wreckage.' },
  quantum_core: { id: 'quantum_core', name: 'Quantum AI Processor', emoji: '🔮⚡', category: 'salvage', buyPrice: null, sellPrice: 2600, rarity: 'Epic', description: 'An experimental mainframe core humming with computing power.' },

  // --- 🛠️ CRAFTED GOODS ---
  iron_ingot: { id: 'iron_ingot', name: 'Refined Iron Ingot', emoji: '🧱', category: 'crafted', buyPrice: null, sellPrice: 300, rarity: 'Uncommon', description: 'Smelted iron bar purified in the workshop forge.' },
  gold_bar: { id: 'gold_bar', name: 'Solid 24k Gold Ingot', emoji: '🪙✨', category: 'crafted', buyPrice: null, sellPrice: 850, rarity: 'Rare', description: 'Pure bullion stamped and certified by the mint.' },
  jeweled_necklace: { id: 'jeweled_necklace', name: 'Ruby-Encrusted Necklace', emoji: '📿', category: 'crafted', buyPrice: null, sellPrice: 2400, rarity: 'Epic', description: 'An artisan gold necklace set with deep red star rubies.' },
  royal_crown: { id: 'royal_crown', name: 'Imperial Diamond Crown', emoji: '👑', category: 'crafted', buyPrice: null, sellPrice: 6500, rarity: 'LEGENDARY', description: 'A supreme regal crown glittering with flawless diamonds and netherite.' }
};

function getItem(id) {
  if (!id) return null;
  const key = id.toLowerCase().trim().replace(/\s+/g, '_');
  if (ITEMS[key]) return ITEMS[key];

  // Try partial or name match
  return Object.values(ITEMS).find(item =>
    item.id === key ||
    item.name.toLowerCase() === id.toLowerCase() ||
    item.name.toLowerCase().includes(id.toLowerCase())
  ) || null;
}

function getShopItems(category = null) {
  return Object.values(ITEMS).filter(item => {
    if (!item.buyPrice) return false;
    if (category && item.category !== category) return false;
    return true;
  });
}

function getSellableItems(category = null) {
  return Object.values(ITEMS).filter(item => {
    if (!item.sellPrice) return false;
    if (category && item.category !== category) return false;
    return true;
  });
}

const RARITY_COLORS = {
  Junk: 0x95A5A6,
  Common: 0x2ECC71,
  Uncommon: 0x3498DB,
  Rare: 0x9B59B6,
  Epic: 0xE67E22,
  LEGENDARY: 0xF1C40F
};

module.exports = {
  ITEMS,
  getItem,
  getShopItems,
  getSellableItems,
  RARITY_COLORS
};
