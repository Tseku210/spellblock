"use strict";

/* Block Dungeon Spell Runner, upgraded edition.
   The whole game draws on one 960x640 canvas; the side panel mirrors its state. */

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const $ = (id) => document.getElementById(id);

const ui = {
  hpBar: $("hpBar"),
  hpText: $("hpText"),
  manaBar: $("manaBar"),
  manaText: $("manaText"),
  coinText: $("coinText"),
  miniMap: $("miniMap"),
  trackRoom: $("trackRoom"),
  trackBiome: $("trackBiome"),
  trackBoss: $("trackBoss"),
  trackEnemies: $("trackEnemies"),
  trackBosses: $("trackBosses"),
  trackBig: $("trackBig"),
  trackTime: $("trackTime"),
  trackGoal: $("trackGoal"),
  spellList: $("spellList"),
  upgradeList: $("upgradeList"),
  bestiary: $("bestiary"),
  bestiaryCount: $("bestiaryCount"),
  hpLabel: $("hpLabel"),
  manaLabel: $("manaLabel"),
  p2Meters: $("p2Meters"),
  hp2Bar: $("hp2Bar"),
  hp2Text: $("hp2Text"),
  mana2Bar: $("mana2Bar"),
  mana2Text: $("mana2Text"),
  hatGrid: $("hatGrid"),
  petGrid: $("petGrid"),
  petCount: $("petCount"),
  hatCount: $("hatCount"),
  comboList: $("comboList"),
  comboCount: $("comboCount"),
  soundBtn: $("soundBtn"),
  pauseBtn: $("pauseBtn"),
  touch: $("touchControls"),
  stick: $("stick"),
  stickKnob: $("stickKnob")
};

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const TILE = 32;
const ROOM_COLS = 6;
const ROOM_ROWS = 5;
const ROOM_COUNT = ROOM_COLS * ROOM_ROWS;
const DRAGON_ROOM = ROOM_COUNT;
const DOOR_HALF = 64;
const SAVE_KEY = "block-dungeon-spell-runner-save-v2";
const PREFS_KEY = "block-dungeon-spell-runner-prefs";
const DISPLAY_FONT = '"Pixelify Sans", "Trebuchet MS", system-ui, sans-serif';
const BODY_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const reducedMotion = Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

/* ---------- small helpers ---------- */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mulberry32(seed) {
  return function next() {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function shade(hex, amount) {
  const value = parseInt(hex.slice(1), 16);
  const target = amount < 0 ? 0 : 255;
  const t = Math.abs(amount);
  const r = Math.round(((value >> 16) & 255) + (target - ((value >> 16) & 255)) * t);
  const g = Math.round(((value >> 8) & 255) + (target - ((value >> 8) & 255)) * t);
  const b = Math.round((value & 255) + (target - (value & 255)) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function formatTime(seconds) {
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = String(total % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function readStorage(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    /* Storage can be blocked; the game still plays without saving. */
  }
}

/* ---------- game data ---------- */

const biomes = [
  { name: "Grass Vault", floor: "#4e8c45", floor2: "#40743a", wall: "#6a4f35", ambient: "firefly", root: 60 },
  { name: "Stone Mine", floor: "#686868", floor2: "#565656", wall: "#343434", ambient: "dust", root: 57 },
  { name: "Lava Keep", floor: "#4b2720", floor2: "#673123", wall: "#1e1715", ambient: "ember", root: 55 },
  { name: "Ice Cavern", floor: "#77b7c9", floor2: "#5f9cad", wall: "#d7f4ff", ambient: "snow", root: 64 },
  { name: "Sand Crypt", floor: "#caa55d", floor2: "#ad8a4c", wall: "#806030", ambient: "sand", root: 62 },
  { name: "Mossy Ruin", floor: "#415d38", floor2: "#334c2c", wall: "#59614c", ambient: "spore", root: 59 }
];

const dragonBiome = { name: "Dragon's Hoard", floor: "#5a4318", floor2: "#4a3612", wall: "#2a1d0a", ambient: "ember", root: 53 };

const robes = [
  { name: "Sky", robe: "#3b82f6", trim: "#1d4ed8", hat: "#2557c9" },
  { name: "Grape", robe: "#8b5cf6", trim: "#5b34c4", hat: "#6d3fe0" },
  { name: "Leaf", robe: "#2fae5f", trim: "#1d7a41", hat: "#23894a" },
  { name: "Berry", robe: "#e8508a", trim: "#b02d61", hat: "#c93a72" }
];

/* Hat 0 is the starter hat. Hats 1-15 drop from the boss of each enemy type
   (hat = typeIndex + 1), hat 16 comes from befriending the dragon and
   hats 17-21 come from the five big bosses. */
const hats = [
  { name: "Wizard Hat", from: "Every wizard starts with one" },
  { name: "King Zombo's Crown", from: "King Zombo" },
  { name: "Rattlebones Skull Cap", from: "Sir Rattlebones" },
  { name: "Mama Webby's Bow", from: "Mama Webby" },
  { name: "Big Wobble Jelly Hat", from: "Big Wobble" },
  { name: "Imp-eror Horns", from: "Imp-eror Blaze" },
  { name: "Wispy Queen Tiara", from: "The Wispy Queen" },
  { name: "Pharaoh Headdress", from: "Pharaoh Husk" },
  { name: "Mossbeard Leaf Crown", from: "Chief Mossbeard" },
  { name: "Count Batula Ears", from: "Count Batula" },
  { name: "Crystal Crown", from: "Crystal Crusher" },
  { name: "Brute-zilla Helmet", from: "Brute-zilla" },
  { name: "Golem Bucket Helmet", from: "Grandpa Golem" },
  { name: "Shadow Hood", from: "The Shadow Shifter" },
  { name: "Mud Puff Mushroom", from: "Mega Mud Puff" },
  { name: "Commander's Plume", from: "Quartz Commander" },
  { name: "Dragon Horns", from: "Blocky the Dragon" },
  { name: "Bonecrown", from: "King Bonecrown" },
  { name: "Magma Helm", from: "Magmaw the Lava Golem" },
  { name: "Frostbite Crown", from: "Queen Frostbite" },
  { name: "Shadowfang Top Hat", from: "Count Shadowfang" },
  { name: "Crystal Halo", from: "Crystal Colossus" }
];
const DRAGON_HAT = 16;
const BIG_HAT = 17;

const combos = [
  { id: "steam", name: "Steam Blast", recipe: "Fireball + Frost Nova", color: "#e6f7ff", hint: "What happens if a fireball lands on something frozen?", desc: "Blow up a fireball on a frozen enemy or inside the frosty puddle for a huge steam blast." },
  { id: "shatter", name: "Shatter", recipe: "Frost Nova + Chain Lightning", color: "#9be7ff", hint: "Frozen things look a bit fragile...", desc: "Zap a frozen enemy and the ice shatters for extra damage. Bosses resist combos used again and again." },
  { id: "fireworks", name: "Fireworks", recipe: "Fireball + Chain Lightning", color: "#ffd166", hint: "Burning enemies are full of sparks...", desc: "Zap a burning enemy to set off fireworks that hit everything nearby." },
  { id: "gasboom", name: "Gas Boom", recipe: "Fireball + Poison Potion", color: "#b5e86b", hint: "Poison puddles bubble with a funny-smelling gas...", desc: "Blow up a fireball inside a poison puddle to set off a giant gas explosion." }
];

const COMBO_REWARD = 25;

/* behavior: chase, ranged, lunge, split, zigzag, blink, fuse */
const enemyTypes = [
  { name: "Zombie Block", color: "#5aa45c", accent: "#345d36", hp: 28, speed: 70, damage: 8, behavior: "chase", boss: "King Zombo" },
  { name: "Skeleton Archer", color: "#d8d8c8", accent: "#858575", hp: 22, speed: 82, damage: 7, behavior: "ranged", boss: "Sir Rattlebones", shot: "#f2f2e6" },
  { name: "Cave Spider", color: "#34243b", accent: "#e0457f", hp: 20, speed: 118, damage: 6, behavior: "lunge", boss: "Mama Webby" },
  { name: "Slime Cube", color: "#65d66b", accent: "#3c8f41", hp: 35, speed: 62, damage: 9, behavior: "split", boss: "Big Wobble" },
  { name: "Ember Imp", color: "#d75833", accent: "#ffb347", hp: 24, speed: 96, damage: 8, behavior: "zigzag", boss: "Imp-eror Blaze" },
  { name: "Frost Wisp", color: "#90e2ff", accent: "#ffffff", hp: 24, speed: 92, damage: 7, behavior: "blink", boss: "The Wispy Queen" },
  { name: "Sand Husk", color: "#c5a15c", accent: "#7f6438", hp: 30, speed: 74, damage: 8, behavior: "chase", boss: "Pharaoh Husk" },
  { name: "Moss Goblin", color: "#608c39", accent: "#a2c45a", hp: 26, speed: 95, damage: 7, behavior: "zigzag", boss: "Chief Mossbeard" },
  { name: "Bat Miner", color: "#4b465c", accent: "#b8aacb", hp: 18, speed: 130, damage: 6, behavior: "zigzag", boss: "Count Batula" },
  { name: "Crystal Crawler", color: "#8f6cff", accent: "#d6c7ff", hp: 34, speed: 76, damage: 9, behavior: "ranged", boss: "Crystal Crusher", shot: "#d6c7ff" },
  { name: "Nether Brute", color: "#8d2d25", accent: "#2a1110", hp: 44, speed: 60, damage: 12, behavior: "lunge", boss: "Brute-zilla" },
  { name: "Iron Golemling", color: "#a9a49a", accent: "#725a43", hp: 48, speed: 48, damage: 13, behavior: "chase", boss: "Grandpa Golem" },
  { name: "Ender Shade", color: "#201827", accent: "#b35cff", hp: 30, speed: 108, damage: 10, behavior: "blink", boss: "The Shadow Shifter" },
  { name: "Mud Creeper", color: "#6c5b38", accent: "#2f7e43", hp: 32, speed: 86, damage: 11, behavior: "fuse", boss: "Mega Mud Puff" },
  { name: "Quartz Knight", color: "#eee4cf", accent: "#c09a63", hp: 40, speed: 66, damage: 12, behavior: "chase", boss: "Quartz Commander" },
  // Scary monsters: they only show up as regular foes, never as room bosses.
  // minTier is how many bosses you need to beat before they start appearing.
  { name: "Shadow Wolf", color: "#2d3150", accent: "#ff4d5e", hp: 24, speed: 112, damage: 8, behavior: "pack", scale: 1.2, monster: true, minTier: 2, quirk: "hunts in packs, howls and pounces" },
  { name: "Venom Cobra", color: "#2f7a43", accent: "#f2d65c", hp: 26, speed: 84, damage: 10, behavior: "serpent", monster: true, minTier: 3, shot: "#9be15d", quirk: "coils up, then strikes like lightning" },
  { name: "Crystal Shard", color: "#4fe3d0", accent: "#e9fffb", hp: 30, speed: 60, damage: 7, behavior: "shard", monster: true, minTier: 4, shot: "#9ff7ec", quirk: "shoots splinters back when you hit it" },
  { name: "Watcher Eye", color: "#22184a", accent: "#ff4fd8", hp: 28, speed: 58, damage: 12, behavior: "eye", scale: 1.1, monster: true, minTier: 5, quirk: "charges up a laser beam" },
  { name: "Ember Spirit", color: "#ff6a1f", accent: "#ffd23f", hp: 22, speed: 104, damage: 8, behavior: "ember", monster: true, minTier: 7, quirk: "leaves burning footprints and bursts into flames" },
  { name: "Wraith", color: "#c9d3ff", accent: "#7b5cff", hp: 30, speed: 88, damage: 11, behavior: "wraith", scale: 1.15, monster: true, minTier: 8, quirk: "turns invisible and appears right next to you" },
  { name: "Gargoyle", color: "#5d5868", accent: "#ff9a3c", hp: 42, speed: 120, damage: 12, behavior: "gargoyle", scale: 1.25, monster: true, minTier: 10, quirk: "pretends to be a statue and turns to stone between swoops" },
  { name: "Spirit Lantern", color: "#3a3428", accent: "#7dffb0", hp: 26, speed: 70, damage: 5, behavior: "lantern", monster: true, minTier: 11, quirk: "heals other monsters, so hit it first!" },
  { name: "Void Raven", color: "#1c1233", accent: "#c06bff", hp: 30, speed: 100, damage: 10, behavior: "raven", monster: true, minTier: 13, shot: "#c06bff", quirk: "calls little ravens to dive at you" }
];

// The first 15 types can be room bosses (each has a boss name and a boss body).
const BOSS_TYPE_COUNT = 15;

const BOSS_PATTERNS = ["aim", "ring", "spiral", "summon", "charge"];

/* A big boss waits behind a locked gate at the end of each row. The gate opens
   once all six room bosses in that row are beaten. Each big boss has its own
   arena, look, attacks and hat. */
const ARENA_START = DRAGON_ROOM + 1;
const BIG_HP_BONUS = 20;
const bigBosses = [
  {
    name: "King Bonecrown", title: "Ruler of the Bone Kingdom", color: "#e8e2cf", accent: "#f6c85f", shot: "#f2f2e6", minion: 1,
    patterns: ["aim", "rain", "summon", "ring", "slam"], rage: "spiral", rageLine: "King Bonecrown calls the royal guard!",
    biome: { name: "Bone Kingdom", floor: "#5b5348", floor2: "#4e463c", wall: "#26211c", ambient: "dust", root: 50, deco: "bones" }
  },
  {
    name: "Magmaw the Lava Golem", title: "Heart of the Volcano", color: "#6b4a3e", accent: "#ff7a2e", shot: "#ff9b3d", minion: 4,
    patterns: ["slam", "rain", "ring", "charge", "aim"], rage: "spiral", rageLine: "Magmaw is boiling over!",
    biome: { name: "Volcano Throne", floor: "#3a1a12", floor2: "#4a2117", wall: "#140c0a", ambient: "ember", root: 48, deco: "lava" }
  },
  {
    name: "Queen Frostbite", title: "Empress of the Frozen Throne", color: "#bfeaff", accent: "#5fb8e0", shot: "#bdf1ff", minion: 5,
    patterns: ["spiral", "teleport", "rain", "aim", "ring"], rage: "summon", rageLine: "Queen Frostbite summons a blizzard of wisps!",
    biome: { name: "Frozen Throne", floor: "#a6d8e6", floor2: "#8fc6d6", wall: "#eaf9ff", ambient: "snow", root: 52, deco: "ice" }
  },
  {
    name: "Count Shadowfang", title: "Lord of the Moonlit Crypt", color: "#2a1f3d", accent: "#e0457f", shot: "#c26bff", minion: 8,
    patterns: ["teleport", "aim", "summon", "spiral", "charge"], rage: "rain", rageLine: "Count Shadowfang turns the sky red!",
    biome: { name: "Moonlit Crypt", floor: "#2e2742", floor2: "#262037", wall: "#120e1d", ambient: "spore", root: 46, deco: "graves" }
  },
  {
    name: "Crystal Colossus", title: "Guardian of the Crystal Cathedral", color: "#8f6cff", accent: "#d6c7ff", shot: "#e0d4ff", minion: 9,
    patterns: ["ring", "slam", "rain", "spiral", "teleport", "aim"], rage: "charge", rageLine: "The Crystal Colossus is cracking with power!",
    biome: { name: "Crystal Cathedral", floor: "#4a3a78", floor2: "#3f3268", wall: "#1c1535", ambient: "firefly", root: 54, deco: "crystals" }
  }
];

const difficulties = [
  // Easy plays like the old Normal, Normal like the old Hard, and Hard is tougher still.
  // extra = more enemies in every room.
  { name: "Easy", hp: 1, attack: 1, damage: 1, speed: 1, extra: 0 },
  { name: "Normal", hp: 1.35, attack: 0.82, damage: 1.2, speed: 1.06, extra: 1 },
  { name: "Hard", hp: 1.65, attack: 0.72, damage: 1.4, speed: 1.12, extra: 2 }
];

// The staff is a backup weapon: weak to start and slow to upgrade. Spells do the big damage.
const STAFF_DPS = 14 / 0.55;
// Bosses are sized for a wizard who uses spells too, so the staff alone is slow going.
const BOSS_DPS = 80;

/* Every spell can evolve one of two ways (pick one), and each path evolves a
   second time into a mega form 8 bosses later. */
const spells = [
  { id: "fireball", name: "Fireball", cost: 20, cooldown: 1.9, color: "#ff742e", unlockAt: 0, evoAt: 4, desc: "Launches a big burning block that explodes and sets enemies on fire.",
    evos: [
      { id: "meteor", name: "Meteor", color: "#ff5a3d", cost: 34, cooldown: 6, short: "Calls a giant flaming rock down from the sky.", desc: "Calls a giant flaming rock down where you aim. Huge blast, sets everything on fire.",
        mega: { name: "Meteor Shower", color: "#ff3d2e", short: "Three meteors crash down instead of one.", desc: "Three giant flaming rocks crash down around where you aim." } },
      { id: "phoenix", name: "Phoenix", color: "#ffb347", cost: 24, cooldown: 2.8, short: "A fire bird flies through enemies and blows up on every one it hits.", desc: "A blazing fire bird flies straight through enemies, with a fiery blast on every enemy it touches.",
        mega: { name: "Phoenix Flock", color: "#ffd166", short: "Three fire birds fly out in a fan.", desc: "Three blazing fire birds fly out in a fan, burning everything they pass through." } }
    ] },
  { id: "frost", name: "Frost Nova", cost: 26, cooldown: 3.8, color: "#9be7ff", unlockAt: 0, evoAt: 6, desc: "A huge icy ring that hits hard, freezes enemies and leaves a frosty puddle.",
    evos: [
      { id: "blizzard", name: "Blizzard", color: "#d7f4ff", short: "A snowstorm follows you, freezing and hurting enemies.", desc: "The icy ring plus a snowstorm that follows you for 4 seconds, freezing and hurting everything inside.",
        mega: { name: "Ice Age", color: "#eafcff", short: "The snowstorm is much bigger and lasts 7 seconds.", desc: "The icy ring plus a giant snowstorm that follows you for 7 seconds." } },
      { id: "glacier", name: "Glacier Spikes", color: "#7dd3fc", short: "The icy ring also shoots 12 ice spikes that pierce and freeze.", desc: "The icy ring shoots 12 ice spikes in every direction. They fly through enemies and freeze them." },
    ] },
  { id: "lightning", name: "Chain Lightning", cost: 22, cooldown: 2.6, color: "#ffe45c", unlockAt: 3, evoAt: 9, desc: "A mighty zap on the enemy nearest your aim that jumps to its friends.",
    evos: [
      { id: "storm", name: "Thunderstorm", color: "#fff27a", short: "Jumps farther, then thunder strikes every target again.", desc: "A huge chain zap that jumps farther, then thunder crashes down on every enemy it hit.",
        mega: { name: "Superstorm", color: "#fffbb0", short: "Even more jumps, and thunder strikes twice.", desc: "A giant chain zap with even more jumps. Thunder crashes down on every target twice." } },
      { id: "orb", name: "Ball Lightning", color: "#ffd84a", cost: 30, cooldown: 5, short: "A crackling orb rolls toward your aim and zaps everything near it.", desc: "Sends out a slow crackling orb that bounces off walls and zaps nearby enemies, then bursts.",
        mega: { name: "Twin Orbs", color: "#fff06a", short: "Two bigger orbs that last longer.", desc: "Sends out two big crackling orbs that zap three enemies at a time and last longer." } }
    ] },
  { id: "shield", name: "Bubble Shield", cost: 32, cooldown: 8, color: "#ff9ff3", unlockAt: 8, evoAt: 13, desc: "A rainbow bubble that knocks enemies back, blocks hits and bounces shots back harder.",
    evos: [
      { id: "fortress", name: "Rainbow Fortress", color: "#c084fc", short: "A longer bubble with three orbs that spin around and bonk enemies.", desc: "A longer-lasting bubble with three rainbow orbs that spin around you, bonking enemies and blocking shots.",
        mega: { name: "Diamond Fortress", color: "#e9d5ff", short: "Five orbs and an even longer bubble.", desc: "An extra-long bubble with five rainbow orbs that spin around you." } },
      { id: "heal", name: "Healing Bubble", color: "#86efac", short: "The bubble heals you and a nearby friend.", desc: "A bubble that heals you, and a friend standing close, by 40% of max HP while it lasts.",
        mega: { name: "Angel Bubble", color: "#bbf7d0", short: "Heals more, bubbles your friend too and brings them back up.", desc: "Heals you and your friend by 70%, gives your friend a bubble too, and instantly helps up a bonked friend nearby." } }
    ] },
  { id: "poison", name: "Poison Potion", cost: 24, cooldown: 4.5, color: "#7bd35a", unlockAt: 5, evoAt: 11, desc: "Throws a bubbling potion that splashes where it lands and leaves a poison puddle that hurts enemies over time.",
    evos: [
      { id: "swamp", name: "Toxic Swamp", color: "#4ade80", short: "A much bigger puddle that lasts longer and slows enemies.", desc: "Throws a potion that makes a big toxic swamp. It lasts 7 seconds, slows enemies and hurts them over time.",
        mega: { name: "Plague Swamp", color: "#22c55e", short: "A giant swamp that hurts twice as much.", desc: "Throws a potion that makes a giant swamp for 9 seconds that slows enemies and hurts them twice as fast." } },
      { id: "cluster", name: "Cluster Flask", color: "#a3e635", short: "Splits into 4 potions that splash all around your aim.", desc: "Throws a potion that splits into 4 smaller potions, each leaving its own poison puddle.",
        mega: { name: "Potion Storm", color: "#d9f99d", short: "Splits into 8 potions instead of 4.", desc: "Throws a potion that splits into 8 smaller potions all around your aim." } }
    ] }
];
spells[1].evos[1].mega = { name: "Glacier Burst", color: "#bae6fd", short: "Shoots 24 bigger ice spikes.", desc: "The icy ring shoots 24 big ice spikes in every direction that fly through enemies and freeze them." };
const MEGA_DELAY = 8;

const upgrades = [
  { id: "hp", name: "Hearty Snack", desc: "+25 max HP and a full heal", color: "#ef5b4b", icon: "heart", max: 6, apply: () => { stats.maxHp += 25; for (const p of players) p.hp = p.hp > 0 || !state.twoPlayer ? stats.maxHp : 0; } },
  { id: "mana", name: "Mana Crystal", desc: "+20 max mana and faster mana refill", color: "#55aaff", icon: "gem", max: 5, apply: () => { stats.maxMana += 20; stats.manaRegen += 2.5; for (const p of players) p.mana = stats.maxMana; } },
  { id: "staff", name: "Sharper Staff", desc: "Staff bolts hit 10% harder", color: "#fff2a3", icon: "staff", max: 3, apply: () => { stats.staffDamage *= 1.1; } },
  { id: "rapid", name: "Speedy Sparks", desc: "Your staff shoots 15% faster", color: "#ffd166", icon: "bolt", max: 5, apply: () => { stats.shotDelay *= 0.85; } },
  { id: "multi", name: "Twin Bolt", desc: "Fire a second, smaller staff bolt", color: "#fef08a", icon: "multi", max: 1, apply: () => { stats.shotCount += 1; stats.staffDamage *= 0.7; } },
  { id: "book", name: "Spell Book", desc: "All your spells hit 25% harder", color: "#c084fc", icon: "book", max: 5, apply: () => { stats.spellBoost *= 1.25; } },
  { id: "quick", name: "Quick Casting", desc: "Spells cool down 15% faster", color: "#7dd3fc", icon: "clock", max: 3, apply: () => { stats.castSpeed *= 0.85; } },
  { id: "boom", name: "Big Boom", desc: "Fireballs explode bigger and hotter", color: "#ff742e", icon: "boom", max: 4, apply: () => { stats.boomRadius *= 1.2; stats.boomDamage += 18; } },
  { id: "freeze", name: "Deep Freeze", desc: "Frost Nova reaches farther, hits harder and freezes longer", color: "#9be7ff", icon: "snow", max: 4, apply: () => { stats.novaRadius += 30; stats.novaSlow += 1; stats.novaDamage += 15; } },
  { id: "boots", name: "Zoomy Boots", desc: "Run 12% faster", color: "#a3e635", icon: "boot", max: 4, apply: () => { stats.speed *= 1.12; } },
  { id: "magnet", name: "Coin Magnet", desc: "Pull coins and treats from farther away", color: "#f6c85f", icon: "magnet", max: 3, apply: () => { stats.magnet += 80; } },
  { id: "robe", name: "Sturdy Robe", desc: "Every hit does 2 less damage", color: "#c084fc", icon: "shield", max: 4, apply: () => { stats.armor += 2; } },
  { id: "dash", name: "Dash Master", desc: "Your dash comes back 30% sooner", color: "#7dd3fc", icon: "boot", max: 3, apply: () => { stats.dashCooldown *= 0.7; } },
  { id: "clover", name: "Lucky Clover", desc: "More mana stars drop", color: "#4ade80", icon: "clover", max: 3, apply: () => { stats.luck += 0.06; } },
  { id: "seed", name: "Golden Seed", desc: "+1 healing flask", color: "#f6c85f", icon: "spell:estus", max: 3, apply: () => { stats.maxFlasks += 1; for (const p of players) p.flasks += 1; } },
  { id: "endurance", name: "Endurance", desc: "+25 max stamina and it refills faster", color: "#86efac", icon: "boot", max: 3, apply: () => { stats.maxStamina += 25; stats.staminaRegen += 8; for (const p of players) p.stamina = stats.maxStamina; } },
  { id: "pet", name: "Pet Power", desc: "Every pet attacks faster and harder", color: "#fb923c", icon: "fox", max: 5, requires: () => state.petUnlocked, apply: () => { stats.petLevel += 1; } },
  { id: "fork", name: "Forked Bolts", desc: "Chain Lightning jumps 2 more times and hits harder", color: "#ffe45c", icon: "bolt", max: 3, requires: () => state.bossesDefeated >= 3, apply: () => { stats.chainJumps += 2; stats.zapDamage += 15; } },
  { id: "bubble", name: "Bigger Bubble", desc: "Bubble Shield lasts longer and its bounced shots hit harder", color: "#ff9ff3", icon: "shield", max: 3, requires: () => state.bossesDefeated >= 8, apply: () => { stats.shieldTime += 1.5; stats.reflectDamage += 15; } }
];

/* Evolutions turn a spell or the dash into a stronger version. One shows up
   on the power-up screen as soon as it is ready. A wizard picks one dash style. */
const dashKinds = {
  normal: { name: "Dash", color: "#7dd3fc" },
  fire: { name: "Fire Dash", color: "#ff742e", desc: "Dash through enemies to set them on fire and leave a burning trail." },
  frost: { name: "Frost Dash", color: "#9be7ff", desc: "Freeze every enemy you dash through and leave a frosty puddle behind." },
  thunder: { name: "Thunder Dash", color: "#ffe45c", desc: "Dash farther, zap what you touch, and strike nearby enemies with lightning at the end." }
};
const DASH_EVO_AT = 2;
const DASH_MEGA_AT = 10;
const dashMegas = {
  fire: { name: "Inferno Dash", desc: "Fire Dash burns twice as hard, comes back sooner and ends in an explosion." },
  frost: { name: "Glacier Dash", desc: "Frost Dash freezes harder, comes back sooner and leaves a giant frosty puddle." },
  thunder: { name: "Lightning Rush", desc: "Thunder Dash comes back sooner and strikes 6 enemies at the end." }
};

/* Pixel the Fox evolves too: one of three foxes at 6 bosses, then into a
   nine-tailed fox at 16 bosses. */
const PET_EVO_AT = 6;
const PET_MEGA_AT = 16;
/* Pets. Pick one on the title screen (or in the Pet Den) before a run; it
   follows you from the very first room. Only Pixel can evolve. */
const petTypes = {
  pixel: { name: "Pixel the Fox", color: "#fb923c", desc: "Shoots sparks. The only pet that can evolve.", from: "the first boss" },
  owl: { name: "Hoot the Owl", color: "#c9a26b", desc: "Throws feathers that chase enemies around corners.", row: 0 },
  hatchling: { name: "Ember the Hatchling", color: "#ef5b4b", desc: "A baby dragon that breathes short bursts of fire.", row: 1 },
  turtle: { name: "Shelly the Turtle", color: "#4ade80", desc: "Circles you and blocks enemy bullets with her shell.", row: 2 },
  slime: { name: "Bloop the Slime", color: "#7dd3fc", desc: "Heals the most hurt wizard a little, and spits sticky slime.", row: 3 },
  bat: { name: "Glimmer the Crystal Bat", color: "#c084fc", desc: "Fires quick crystal shards at two enemies at once.", row: 4 }
};
const PET_IDS = Object.keys(petTypes);

function petForRow(row) {
  return PET_IDS.find((id) => petTypes[id].row === row);
}

const petKinds = {
  flame: { name: "Flame Fox", color: "#ef5b4b", tip: "#ffd166", desc: "Pixel's sparks set enemies on fire." },
  frost: { name: "Frost Fox", color: "#7dd3fc", tip: "#ffffff", desc: "Pixel's sparks freeze enemies." },
  storm: { name: "Storm Fox", color: "#facc15", tip: "#fff7c2", desc: "Pixel's sparks zap a second enemy too." }
};

// Evolution cards share a group; cards from one group show up side by side
// so you can pick your path.
for (const spell of spells) {
  spell.evos.forEach((branch, i) => {
    branch.mega.id = branch.id;
    upgrades.push({
      id: i === 0 ? `evo-${spell.id}` : `evo-${spell.id}-${branch.id}`,
      name: branch.name,
      desc: `${spell.name} evolves! ${branch.short}`,
      color: branch.color,
      icon: `spell:${branch.id}`,
      max: 1,
      evo: true,
      group: spell.id,
      requires: () => !stats.evo[spell.id] && state.bossesDefeated >= Math.max(spell.evoAt, spell.unlockAt),
      apply: () => { stats.evo[spell.id] = branch.id; },
      from: spell.name
    });
    upgrades.push({
      id: `mega-${branch.id}`,
      name: branch.mega.name,
      desc: `${branch.name} evolves again! ${branch.mega.short}`,
      color: branch.mega.color,
      icon: `spell:${branch.id}`,
      max: 1,
      evo: true,
      mega: true,
      group: `mega-${spell.id}`,
      requires: () => stats.evo[spell.id] === branch.id && state.bossesDefeated >= spell.evoAt + MEGA_DELAY,
      apply: () => { stats.mega[spell.id] = true; },
      from: branch.name
    });
  });
}
for (const kind of ["fire", "frost", "thunder"]) {
  upgrades.push({
    id: `dash-${kind}`,
    name: dashKinds[kind].name,
    desc: dashKinds[kind].desc,
    color: dashKinds[kind].color,
    icon: `spell:dash-${kind}`,
    max: 1,
    evo: true,
    group: "dash",
    requires: () => state.bossesDefeated >= DASH_EVO_AT && stats.dash === "normal",
    apply: () => { stats.dash = kind; },
    from: "Dash"
  });
  upgrades.push({
    id: `dashmega-${kind}`,
    name: dashMegas[kind].name,
    desc: dashMegas[kind].desc,
    color: dashKinds[kind].color,
    icon: `spell:dash-${kind}`,
    max: 1,
    evo: true,
    mega: true,
    group: "dashmega",
    requires: () => state.bossesDefeated >= DASH_MEGA_AT && stats.dash === kind,
    apply: () => { stats.dashMega = true; stats.dashCooldown *= 0.75; },
    from: dashKinds[kind].name
  });
}
for (const kind of Object.keys(petKinds)) {
  upgrades.push({
    id: `pet-${kind}`,
    name: petKinds[kind].name,
    desc: `Pixel evolves! ${petKinds[kind].desc}`,
    color: petKinds[kind].color,
    icon: `pet:${kind}`,
    max: 1,
    evo: true,
    group: "pet",
    requires: () => state.petUnlocked && state.petChoice === "pixel" && !stats.petEvo && state.bossesDefeated >= PET_EVO_AT,
    apply: () => { stats.petEvo = kind; },
    from: "Pixel the Fox"
  });
  upgrades.push({
    id: `petmega-${kind}`,
    name: `Nine-Tailed ${petKinds[kind].name}`,
    desc: "Pixel evolves again! Nine tails, three sparks at once and 50% more damage.",
    color: petKinds[kind].tip,
    icon: `pet:${kind}:mega`,
    max: 1,
    evo: true,
    mega: true,
    group: "petmega",
    requires: () => state.petChoice === "pixel" && stats.petEvo === kind && state.bossesDefeated >= PET_MEGA_AT,
    apply: () => { stats.petMega = true; },
    from: petKinds[kind].name
  });
}

function spellBranch(spell) {
  const id = stats.evo[spell.id];
  return id ? spell.evos.find((branch) => branch.id === id) || null : null;
}

function spellLook(spell) {
  const branch = spellBranch(spell);
  if (!branch) return spell;
  return stats.mega[spell.id] ? branch.mega : branch;
}

// Some evolutions cost more mana or take longer to cool down than the base spell.
function spellCost(spell) {
  const branch = spellBranch(spell);
  return branch && branch.cost !== undefined ? branch.cost : spell.cost;
}

function spellCooldown(spell) {
  const branch = spellBranch(spell);
  return (branch && branch.cooldown !== undefined ? branch.cooldown : spell.cooldown) * stats.castSpeed;
}

function evoIs(spellId, branchId) {
  return stats.evo[spellId] === branchId;
}

function petName() {
  if (state.petChoice !== "pixel") return petTypes[state.petChoice].name;
  if (!stats.petEvo) return "Pixel the Fox";
  return `Pixel the ${stats.petMega ? "Nine-Tailed " : ""}${petKinds[stats.petEvo].name}`;
}

// How hard the staff hits per second right now, upgrades included.
function playerDps() {
  return (stats.staffDamage * stats.shotCount) / stats.shotDelay;
}

// Bosses soak up most of the staff upgrades so later fights stay a challenge,
// but 30% of every upgrade still shows, so power-ups always feel good.
// Two wizards deal about twice the damage, so bosses get tougher in co-op.
function bossHpFor(tier, seconds = 6 + tier * 0.5, final = false) {
  const spellGain = (1 + (stats.spellBoost / stats.castSpeed - 1) * 0.5) * (1 + 0.1 * (Object.keys(stats.evo).length + Object.keys(stats.mega).length));
  const effective = (BOSS_DPS + Math.max(0, playerDps() - STAFF_DPS) * 0.7) * spellGain;
  const planned = effective * seconds * difficulty().hp * coopScale(1.6);
  // Bosses also remember how fast you beat the last few. If your spells and
  // combos melt them faster than planned, the next ones get tougher to match.
  // Strong builds still win a bit faster (85% on Normal), so upgrades feel good.
  // Final bosses (big bosses and the dragon) get no discount at all.
  const keepUp = final ? 1.05 : [0.7, 0.85, 1][state.difficulty] || 0.85;
  const measured = state.powerDps * seconds * keepUp;
  return Math.round(Math.min(planned * 3, Math.max(planned, measured)));
}

// Called when a boss (or a big boss phase) goes down: how much damage per
// second did the player really deal in that fight?
function rememberBossFight(boss) {
  if (!boss.firstHit || boss.isDragon) return;
  const seconds = Math.max(3, state.clock - boss.firstHit);
  const dps = boss.maxHp / seconds;
  state.powerDps = state.powerDps ? state.powerDps * 0.6 + dps * 0.4 : dps;
  boss.firstHit = 0;
}

// Big bosses last about three to five times as long as a room boss. The fight
// is split in two: knock out phase one and the boss transforms with fresh HP.
const PHASE2_SHARE = 0.38;
const PHASE2_NAMES = ["Bonecrown the Undying", "Magmaw Unleashed", "Frostbite, Heart of Winter", "Shadowfang of the Blood Moon", "Crystal Colossus Prime"];

function bigSeconds(row) {
  return 28 + row * 6;
}

// Big bosses and the dragon are the final bosses: tougher in every way.
function isFinal(boss) {
  return Boolean(boss && (boss.isBig || boss.isDragon));
}

function bossMaxHp(room) {
  if (room.final) return bossHpFor(30, 45, true);
  if (room.arena) return bossHpFor(room.tier, bigSeconds(room.row) * (room.boss && room.boss.phase2 ? PHASE2_SHARE : 1 - PHASE2_SHARE), true);
  return bossHpFor(room.tier);
}

function coopScale(amount) {
  return state.twoPlayer ? amount : 1;
}

function difficulty() {
  return difficulties[state.difficulty] || difficulties[1];
}

function baseStats() {
  return {
    maxHp: 120,
    maxMana: 100,
    manaRegen: 14,
    speed: 210,
    staffDamage: 14,
    shotDelay: 0.55,
    shotCount: 1,
    boomRadius: 95,
    boomDamage: 40,
    fireDamage: 55,
    novaRadius: 160,
    novaDamage: 50,
    novaSlow: 3.2,
    zapDamage: 65,
    shieldTime: 5,
    reflectDamage: 35,
    spellBoost: 1,
    castSpeed: 1,
    evo: {},
    mega: {},
    dash: "normal",
    dashMega: false,
    petEvo: null,
    petMega: false,
    magnet: 70,
    armor: 0,
    dashCooldown: 0.55,
    maxStamina: 100,
    staminaRegen: 45,
    maxFlasks: 3,
    luck: 0,
    petLevel: 1,
    chainJumps: 3
  };
}

/* ---------- state ---------- */

let stats = baseStats();
let rooms = createRooms();
let pet = null;

function makePlayer(index) {
  return {
    index,
    x: WIDTH / 2,
    y: HEIGHT / 2,
    r: 14,
    hp: 120,
    mana: 90,
    dirX: 1,
    dirY: 0,
    moving: false,
    shotCooldown: 0,
    invulnerable: 0,
    dashTime: 0,
    dashCd: 0,
    dashX: 1,
    dashY: 0,
    shield: 0,
    kx: 0,
    ky: 0,
    downTimer: 0,
    revive: 0,
    cooldowns: { fireball: 0, frost: 0, lightning: 0, shield: 0, poison: 0 },
    stamina: 100,
    staminaWait: 0,
    blocking: false,
    blockStart: -9,
    lastBlockPress: -9,
    parryUsed: true,
    stun: 0,
    drinking: 0,
    flasks: 3,
    dashStart: -9,
    perfectDone: true,
    restedHere: false,
    fireWarn: 0
  };
}

// Player 1 is always playing; player 2 joins when two-player mode is on.
const players = [makePlayer(0), makePlayer(1)];
const player = players[0];
const REVIVE_TIME = 1.5;
const AUTO_REVIVE = 12;

const projectiles = [];
const effects = [];
const particles = [];
// Dead particles wait here to be reused, so busy fights make less garbage.
const particlePool = [];
const floatTexts = [];
const pickups = [];
const ambient = [];
const banners = [];
const hitRegions = [];
const keys = new Set();
const codes = new Set();
const mapCells = [];

const mouse = { x: WIDTH / 2, y: HEIGHT / 2, down: false, touchAim: false, active: 0 };
const touch = { enabled: false, moveX: 0, moveY: 0, fire: false, block: false, stickId: null };

const state = {
  mode: "title",
  twoPlayer: false,
  looks: [{ robe: 0, hat: 0 }, { robe: 1, hat: 0 }],
  hatsUnlocked: new Set([0]),
  combosFound: new Set(),
  shownHats: -1,
  shownCombos: -1,
  difficulty: 1,
  roomIndex: 0,
  coins: 0,
  bossesDefeated: 0,
  enemiesDefeated: 0,
  time: 0,
  clock: 0,
  anim: 0,
  petUnlocked: false,
  portalOpen: false,
  won: false,
  upgradeCounts: {},
  upgradeChoices: [],
  upgradeTimer: 0,
  victoryTimer: 0,
  rerollCost: 10,
  seenTypes: new Set(),
  message: "Find every room boss and clear the dungeon.",
  messageTimer: 0,
  shake: 0,
  hurtFlash: 0,
  fade: 0,
  entry: { x: WIDTH / 2, y: HEIGHT / 2 },
  coinStreak: 0,
  coinStreakTimer: 0,
  confirmNew: false,
  upgradesVersion: 0,
  shownUpgradesVersion: -1,
  shownBestiary: -1,
  uiTimer: 0,
  hasSave: false,
  petsOwned: new Set(PET_IDS),
  petChoice: "pixel",
  petPick: "pixel",
  powerDps: 0,
  habits: { parry: 0, dash: 0 },
  slowmo: 0,
  checkpoint: 0,
  lostCoins: null,
  lastLost: 0,
  bigBeaten: new Set(),
  picksLeft: 0,
  intro: null
};

/* ---------- audio: tiny chiptune synth ---------- */

const audio = { ctx: null, master: null, music: null, sfx: null, noise: null, mode: 0, nextNote: 0, step: 0 };
const soundLabels = ["Sound: On", "Music: Off", "Sound: Off"];

function initAudio() {
  if (audio.ctx) {
    if (audio.ctx.state === "suspended") audio.ctx.resume().catch(() => {});
    return;
  }
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return;
  try {
    audio.ctx = new AudioCtor();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0.8;
    audio.master.connect(audio.ctx.destination);
    audio.music = audio.ctx.createGain();
    audio.music.connect(audio.master);
    audio.sfx = audio.ctx.createGain();
    audio.sfx.connect(audio.master);
    const length = Math.floor(audio.ctx.sampleRate * 0.5);
    audio.noise = audio.ctx.createBuffer(1, length, audio.ctx.sampleRate);
    const data = audio.noise.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    applySoundMode();
  } catch (err) {
    audio.ctx = null;
  }
}

function applySoundMode() {
  ui.soundBtn.textContent = soundLabels[audio.mode];
  if (!audio.ctx) return;
  audio.music.gain.value = audio.mode === 0 ? 0.55 : 0;
  audio.sfx.gain.value = audio.mode === 2 ? 0 : 0.9;
}

function savePrefs() {
  writeStorage(PREFS_KEY, {
    sound: audio.mode,
    robe: state.looks[0].robe,
    difficulty: state.difficulty,
    twoPlayer: state.twoPlayer,
    looks: state.looks,
    pet: state.petPick,
    hats: [...state.hatsUnlocked],
    combos: [...state.combosFound]
  });
}

function cycleDifficulty() {
  state.difficulty = (state.difficulty + 1) % difficulties.length;
  savePrefs();
  // Bosses nobody has hit yet pick up the new setting right away.
  for (const room of rooms) {
    if (room.boss && room.boss.hp > 0 && room.boss.hp === room.boss.maxHp) {
      room.boss.maxHp = bossMaxHp(room);
      room.boss.hp = room.boss.maxHp;
    }
  }
  if (state.mode !== "title") toast(`Difficulty: ${difficulty().name}`);
}

function togglePlayers() {
  state.twoPlayer = !state.twoPlayer;
  savePrefs();
}

function cycleSound() {
  audio.mode = (audio.mode + 1) % 3;
  savePrefs();
  initAudio();
  applySoundMode();
  toast(soundLabels[audio.mode]);
}

function tone(freq, duration, options = {}) {
  if (!audio.ctx || audio.mode === 2) return;
  const { type = "square", volume = 0.1, slide = 0, delay = 0, music = false } = options;
  if (music && audio.mode !== 0) return;
  const start = audio.ctx.currentTime + Math.max(0, delay);
  const osc = audio.ctx.createOscillator();
  const gain = audio.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(music ? audio.music : audio.sfx);
  osc.start(start);
  osc.stop(start + duration + 0.03);
}

function noiseBurst(duration, options = {}) {
  if (!audio.ctx || audio.mode === 2) return;
  const { volume = 0.15, freq = 1200, delay = 0 } = options;
  const start = audio.ctx.currentTime + delay;
  const src = audio.ctx.createBufferSource();
  src.buffer = audio.noise;
  const filter = audio.ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = freq;
  const gain = audio.ctx.createGain();
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(audio.sfx);
  src.start(start);
  src.stop(start + duration + 0.03);
}

const sfx = {
  shoot: () => tone(760, 0.07, { volume: 0.035, slide: -280 }),
  fireball: () => { tone(240, 0.25, { type: "sawtooth", volume: 0.06, slide: -140 }); noiseBurst(0.2, { volume: 0.05, freq: 900 }); },
  boom: () => { noiseBurst(0.35, { volume: 0.18, freq: 700 }); tone(110, 0.3, { type: "triangle", volume: 0.1, slide: -60 }); },
  nova: () => { tone(1250, 0.35, { type: "triangle", volume: 0.07, slide: -800 }); tone(1800, 0.25, { type: "sine", volume: 0.04, slide: -1200, delay: 0.03 }); },
  zap: () => { noiseBurst(0.14, { volume: 0.1, freq: 5000 }); tone(1500, 0.16, { volume: 0.045, slide: -1100 }); },
  shield: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: "triangle", volume: 0.06, delay: i * 0.05 })),
  bubble: () => tone(900, 0.1, { type: "sine", volume: 0.06, slide: 500 }),
  hurt: () => tone(210, 0.2, { volume: 0.09, slide: -130 }),
  hit: () => tone(320, 0.05, { volume: 0.025, slide: -120 }),
  poof: () => { noiseBurst(0.12, { volume: 0.07, freq: 2200 }); tone(520, 0.12, { type: "triangle", volume: 0.05, slide: 360 }); },
  coin: (n) => { const f = 988 * Math.pow(2, Math.min(n, 12) / 24); tone(f, 0.06, { volume: 0.04 }); tone(f * 1.5, 0.08, { volume: 0.035, delay: 0.05 }); },
  heal: () => [660, 880, 1320].forEach((f, i) => tone(f, 0.1, { type: "triangle", volume: 0.06, delay: i * 0.06 })),
  dash: () => noiseBurst(0.16, { volume: 0.06, freq: 2600 }),
  crate: () => { noiseBurst(0.12, { volume: 0.12, freq: 500 }); tone(140, 0.08, { type: "triangle", volume: 0.06 }); },
  chime: () => [784, 988, 1175].forEach((f, i) => tone(f, 0.14, { type: "triangle", volume: 0.06, delay: i * 0.08 })),
  boss: () => [196, 185, 175, 147].forEach((f, i) => tone(f, 0.32, { type: "sawtooth", volume: 0.05, delay: i * 0.18 })),
  fanfare: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, { volume: 0.05, delay: i * 0.1 })),
  pick: () => { tone(660, 0.08, { volume: 0.05, slide: 400 }); tone(990, 0.12, { type: "triangle", volume: 0.05, delay: 0.08 }); },
  click: () => tone(880, 0.04, { volume: 0.035 }),
  nope: () => tone(150, 0.12, { volume: 0.05 }),
  enemyShot: () => tone(430, 0.06, { type: "triangle", volume: 0.02, slide: -150 }),
  pop: () => { noiseBurst(0.3, { volume: 0.14, freq: 420 }); tone(180, 0.2, { type: "triangle", volume: 0.07, slide: -90 }); },
  door: () => tone(330, 0.12, { type: "triangle", volume: 0.05, slide: 200 }),
  portal: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: "sine", volume: 0.06, delay: i * 0.07 })),
  sad: () => [392, 349, 311, 262].forEach((f, i) => tone(f, 0.22, { type: "triangle", volume: 0.06, delay: i * 0.16 })),
  rumble: () => { noiseBurst(0.9, { volume: 0.12, freq: 260 }); tone(70, 0.9, { type: "sawtooth", volume: 0.05, slide: 40 }); },
  roar: () => {
    tone(150, 0.7, { type: "sawtooth", volume: 0.09, slide: -90 });
    tone(110, 0.8, { type: "square", volume: 0.05, slide: -60, delay: 0.05 });
    noiseBurst(0.7, { volume: 0.12, freq: 900 });
  },
  block: () => { tone(520, 0.08, { type: "square", volume: 0.05, slide: -200 }); noiseBurst(0.08, { volume: 0.08, freq: 3000 }); },
  parry: () => { tone(1760, 0.25, { type: "square", volume: 0.06, slide: -400 }); tone(2640, 0.3, { type: "triangle", volume: 0.05, delay: 0.03 }); noiseBurst(0.1, { volume: 0.1, freq: 6000 }); },
  slash: (heavy) => { noiseBurst(heavy ? 0.18 : 0.12, { volume: heavy ? 0.12 : 0.08, freq: 2400 }); tone(heavy ? 300 : 500, 0.12, { type: "sawtooth", volume: 0.03, slide: -250 }); },
  slam: () => { noiseBurst(0.4, { volume: 0.2, freq: 400 }); tone(70, 0.4, { type: "triangle", volume: 0.12, slide: -40 }); },
  bigWin: () => [523, 659, 784, 1047, 1319, 1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.2, { volume: 0.055, delay: i * 0.11 }))
};

const MAJOR = [0, 2, 4, 7, 9, 12, 14, 16];
const MINOR = [0, 3, 5, 7, 10, 12, 15, 17];
const MELODY = [0, 2, 4, 5, 4, 2, 3, -1, 1, 3, 5, 7, 6, 4, 2, -1];
const PROGRESSION = [0, 5, -3, 7];

function midiToFreq(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function updateMusic() {
  if (!audio.ctx || audio.mode !== 0 || audio.ctx.state !== "running") return;
  if (state.mode === "paused" || state.mode === "dead") return;
  const room = currentRoom();
  const bossFight = state.mode === "playing" && room.boss && room.boss.hp > 0;
  const stepLen = bossFight ? 0.135 : 0.19;
  const now = audio.ctx.currentTime;
  if (audio.nextNote < now) audio.nextNote = now + 0.05;
  while (audio.nextNote < now + 0.25) {
    const step = audio.step % 16;
    const bar = Math.floor(audio.step / 16) % 4;
    const root = (state.mode === "title" ? 60 : room.biome.root) + PROGRESSION[bar];
    const scale = bossFight ? MINOR : MAJOR;
    const index = MELODY[(step + bar * 3) % 16];
    const delay = audio.nextNote - now;
    if (index >= 0) tone(midiToFreq(root + scale[index]), stepLen * 0.9, { type: "triangle", volume: 0.045, music: true, delay });
    if (step % 4 === 0) tone(midiToFreq(root - 24 + (step === 8 ? 7 : 0)), stepLen * 2, { type: bossFight ? "sawtooth" : "triangle", volume: bossFight ? 0.03 : 0.06, music: true, delay });
    if (bossFight && step % 2 === 1) noiseBurst(0.04, { volume: 0.025, freq: 6000, delay });
    audio.nextNote += stepLen;
    audio.step += 1;
  }
}

/* ---------- rooms and enemies ---------- */

function createRooms() {
  const list = [];
  for (let index = 0; index < ROOM_COUNT; index += 1) {
    list.push({ index, biome: biomes[index % biomes.length], visited: false, populated: false, cleared: false, enemies: [], boss: null, crates: [], tier: 0, final: false });
  }
  list.push({ index: DRAGON_ROOM, biome: dragonBiome, visited: false, populated: false, cleared: false, enemies: [], boss: null, crates: [], tier: 30, final: true });
  bigBosses.forEach((big, row) => {
    list.push({ index: ARENA_START + row, biome: big.biome, visited: false, populated: false, cleared: false, enemies: [], boss: null, crates: [], tier: 0, final: false, arena: true, row });
  });
  return list;
}

function rowEnd(row) {
  return row * ROOM_COLS + ROOM_COLS - 1;
}

function isRowEnd(room) {
  return !room.final && !room.arena && room.index % ROOM_COLS === ROOM_COLS - 1;
}

function rowBossesBeaten(row) {
  let count = 0;
  for (let col = 0; col < ROOM_COLS; col += 1) {
    const room = rooms[row * ROOM_COLS + col];
    if (room.populated && room.boss.hp <= 0) count += 1;
  }
  return count;
}

function gateOpen(row) {
  return rowBossesBeaten(row) >= ROOM_COLS;
}

function currentRoom() {
  return rooms[state.roomIndex];
}

function roomDoors(room) {
  if (room.final) return { up: false, down: false, left: false, right: false };
  // The arena door stays shut until its big boss is beaten.
  if (room.arena) return { up: false, down: false, left: !(room.boss && room.boss.hp > 0), right: false };
  const col = room.index % ROOM_COLS;
  const row = Math.floor(room.index / ROOM_COLS);
  return { up: row > 0, down: row < ROOM_ROWS - 1, left: col > 0, right: col < ROOM_COLS - 1 || gateOpen(row) };
}

function livingFoes(room) {
  const list = room.enemies.filter((enemy) => enemy.hp > 0);
  if (room.boss && room.boss.hp > 0) list.push(room.boss);
  return list;
}

function isRoomCleared(room) {
  return room.populated && room.boss && room.boss.hp <= 0 && room.enemies.every((enemy) => enemy.hp <= 0);
}

function makeEnemy(typeIndex, x, y, options = {}) {
  const type = enemyTypes[typeIndex];
  const tier = options.tier || 0;
  const isBoss = Boolean(options.boss);
  const small = Boolean(options.small);
  const powerScale = 1 + Math.max(0, playerDps() / STAFF_DPS - 1) * 0.5;
  let maxHp = Math.round(type.hp * (1 + tier * 0.07) * (small ? 0.45 : 1) * powerScale * difficulty().hp * coopScale(1.3));
  if (isBoss) maxHp = bossHpFor(tier);
  const roomIndex = options.roomIndex || 0;

  return {
    typeIndex,
    type,
    name: isBoss ? type.boss : type.name,
    x,
    y,
    homeX: x,
    homeY: y,
    size: isBoss ? 46 : small ? 16 : Math.round(25 * (type.scale || 1)),
    hp: maxHp,
    maxHp,
    speed: type.speed * (isBoss ? 0.72 : small ? 1.25 : 1) * (1 + tier * 0.012) * (difficulty().speed || 1),
    damage: Math.round((type.damage * (1 + tier * 0.035) + (isBoss ? 4 : 0)) * difficulty().damage),
    behavior: type.behavior,
    isBoss,
    small,
    temp: Boolean(options.temp),
    hitCooldown: 0,
    attackTimer: rand(1, 2),
    slowUntil: 0,
    flash: 0,
    state: "move",
    stateTimer: 0,
    lockX: 0,
    lockY: 0,
    wobble: Math.random() * 10,
    strafe: Math.random() < 0.5 ? -1 : 1,
    alpha: 1,
    patterns: isBoss ? [BOSS_PATTERNS[roomIndex % 5], BOSS_PATTERNS[(roomIndex + 2) % 5], BOSS_PATTERNS[(roomIndex + 4) % 5]] : [],
    patternIndex: 0,
    spiralTime: 0,
    spiralTick: 0,
    spiralAngle: 0,
    enraged: false,
    furious: false,
    dodgeTimer: rand(2, 3),
    stone: type.behavior === "gargoyle" && !isBoss
  };
}

function makeDragon() {
  return {
    typeIndex: -1,
    type: { color: "#c0395b", accent: "#ffd28a", name: "Dragon" },
    name: "Blocky the Dungeon Dragon",
    x: WIDTH / 2,
    y: 190,
    homeX: WIDTH / 2,
    homeY: 190,
    size: 96,
    hp: bossHpFor(30, 45, true),
    maxHp: bossHpFor(30, 45, true),
    speed: 70,
    damage: Math.round(20 * difficulty().damage),
    behavior: "dragon",
    isBoss: true,
    isDragon: true,
    small: false,
    temp: false,
    hitCooldown: 0,
    attackTimer: 2.4,
    slowUntil: 0,
    flash: 0,
    state: "move",
    stateTimer: 0,
    lockX: 0,
    lockY: 0,
    wobble: 0,
    strafe: 1,
    alpha: 1,
    patterns: ["breath", "ring", "summon", "spiral", "charge", "aim"],
    patternIndex: 0,
    spiralTime: 0,
    spiralTick: 0,
    spiralAngle: 0,
    breathFollow: 0,
    enraged: false,
    furious: false,
    dodgeTimer: 99,
    friendly: false
  };
}

function makeBigBoss(row, tier) {
  const big = bigBosses[row];
  const maxHp = bossHpFor(tier, bigSeconds(row) * (1 - PHASE2_SHARE), true);
  return {
    typeIndex: -1,
    type: { color: big.color, accent: big.accent, name: big.name },
    name: big.name,
    x: WIDTH - 260,
    y: HEIGHT / 2,
    homeX: WIDTH - 260,
    homeY: HEIGHT / 2,
    size: 84,
    hp: maxHp,
    maxHp,
    speed: 62 + row * 4,
    damage: Math.round((14 + row * 2 + tier * 0.3) * 1.25 * difficulty().damage),
    behavior: "big",
    isBoss: true,
    isBig: true,
    row,
    shotColor: big.shot,
    minionType: big.minion,
    small: false,
    temp: false,
    hitCooldown: 0,
    attackTimer: 1.6,
    slowUntil: 0,
    flash: 0,
    state: "move",
    stateTimer: 0,
    lockX: 0,
    lockY: 0,
    wobble: 0,
    strafe: 1,
    alpha: 1,
    patterns: big.patterns.slice(),
    patternIndex: 0,
    spiralTime: 0,
    spiralTick: 0,
    spiralAngle: 0,
    enraged: false,
    furious: false,
    dodgeTimer: 99,
    hop: 0,
    leapTime: 0.85
  };
}

function makeCrates(room, rng) {
  const crates = [];
  const count = 1 + Math.floor(rng() * 4);
  let tries = 0;
  while (crates.length < count && tries < 40) {
    tries += 1;
    const tx = 3 + Math.floor(rng() * 24);
    const ty = 3 + Math.floor(rng() * 14);
    const x = tx * TILE;
    const y = ty * TILE;
    if (Math.abs(x + TILE / 2 - WIDTH / 2) < 120 || Math.abs(y + TILE / 2 - HEIGHT / 2) < 100) continue;
    if (crates.some((crate) => Math.abs(crate.x - x) < TILE * 2 && Math.abs(crate.y - y) < TILE * 2)) continue;
    crates.push({ x, y, w: TILE, h: TILE, hp: 2, wobble: 0 });
  }
  return crates;
}

function findSpawn(room, rng, entry, minDist) {
  let spot = { x: WIDTH / 2, y: HEIGHT / 2 };
  for (let i = 0; i < 60; i += 1) {
    spot = { x: TILE + 50 + rng() * (WIDTH - 2 * TILE - 100), y: TILE + 50 + rng() * (HEIGHT - 2 * TILE - 100) };
    if (distance(spot, entry) < minDist) continue;
    if (room.crates.some((crate) => spot.x > crate.x - 30 && spot.x < crate.x + crate.w + 30 && spot.y > crate.y - 30 && spot.y < crate.y + crate.h + 30)) continue;
    if (room.enemies.some((enemy) => distance(enemy, spot) < 60)) continue;
    return spot;
  }
  return spot;
}

function bossSpot(entry) {
  let spot = { x: clamp(WIDTH - entry.x, 170, WIDTH - 170), y: clamp(HEIGHT - entry.y, 150, HEIGHT - 150) };
  if (distance(spot, entry) < 220) {
    spot = { x: WIDTH / 2, y: entry.y > HEIGHT / 2 ? 150 : HEIGHT - 150 };
  }
  return spot;
}

function populateRoom(room, entry, tier) {
  const rng = mulberry32(9001 + room.index * 7919);
  room.tier = tier;
  room.populated = true;
  room.cleared = false;
  room.enemies = [];
  room.crates = room.final || room.arena ? [] : makeCrates(room, rng);
  if (hasCampfire(room)) room.crates = room.crates.filter((crate) => Math.hypot(crate.x + TILE / 2 - CAMPFIRE.x, crate.y + TILE / 2 - CAMPFIRE.y) > 80);

  if (room.final) {
    room.boss = makeDragon();
    return;
  }
  if (room.arena) {
    room.boss = makeBigBoss(room.row, tier);
    return;
  }

  const count = 3 + (room.index % 4) + (difficulty().extra || 0);
  // Scary monsters unlock as you beat bosses, and get more common the deeper you go.
  const monsters = enemyTypes.map((type, i) => i).filter((i) => enemyTypes[i].monster && tier >= enemyTypes[i].minTier);
  const monsterChance = Math.min(0.45, 0.25 + monsters.length * 0.025);
  for (let i = 0; i < count; i += 1) {
    let typeIndex = (room.index * 5 + i * 3) % BOSS_TYPE_COUNT;
    if (monsters.length && rng() < monsterChance) typeIndex = monsters[Math.floor(rng() * monsters.length)];
    const behavior = enemyTypes[typeIndex].behavior;
    // At most one lantern and one wolf pack per room.
    if ((behavior === "lantern" || behavior === "pack") && room.enemies.some((enemy) => enemy.behavior === behavior)) typeIndex = (room.index * 5 + i * 3) % BOSS_TYPE_COUNT;
    const spot = findSpawn(room, rng, entry, 230);
    room.enemies.push(makeEnemy(typeIndex, spot.x, spot.y, { tier }));
    // Wolves never hunt alone.
    if (enemyTypes[typeIndex].behavior === "pack") room.enemies.push(makeEnemy(typeIndex, clamp(spot.x + 34, TILE + 40, WIDTH - TILE - 40), spot.y + 10, { tier }));
  }

  const bossType = (room.index * 7 + 4) % BOSS_TYPE_COUNT;
  const spot = bossSpot(entry);
  room.boss = makeEnemy(bossType, spot.x, spot.y, { tier, boss: true, roomIndex: room.index });
  if (isSwordRoom(room)) makeSwordBoss(room.boss, tier);
  else if (tier >= 10) room.boss.patterns.push("retreat");
}

/* ---------- sword bosses ----------
   Every third room boss fights up close with a sword: slash combos, lunging
   stabs, jump attacks and spins. They are quick on their feet and roll out of
   the way of shots flying at them. Every slash can be blocked, parried or
   perfect-dodged. */
function isSwordRoom(room) {
  return !room.final && !room.arena && room.index % 3 === 2;
}

function makeSwordBoss(boss, tier) {
  boss.melee = true;
  boss.name = `${boss.type.boss} the Blade`;
  boss.speed *= 1.4;
  boss.patterns = tier < 4 ? ["combo", "thrust", "slash"] : tier < 12 ? ["combo", "thrust", "retreat", "leapslash", "slash"] : ["combo", "thrust", "leapslash", "retreat", "spin", "combo", "slash"];
  boss.patternIndex = Math.floor(Math.random() * boss.patterns.length);
  boss.swordAngle = Math.PI / 2;
  boss.swingSide = 1;
}

function startSwings(boss, list) {
  boss.swings = list;
  boss.state = "swing";
  nextSwing(boss);
}

function nextSwing(boss) {
  const swing = boss.swings[0];
  const target = leadPoint(bossTarget(boss), 0.12);
  const d = Math.hypot(target.x - boss.x, target.y - boss.y) || 1;
  boss.lockX = (target.x - boss.x) / d;
  boss.lockY = (target.y - boss.y) / d;
  boss.swingSide = -(boss.swingSide || 1);
  swing.side = boss.swingSide;
  boss.state = "swing";
  boss.stateTimer = swing.delay;
  boss.swingTotal = swing.delay;
}

function afterSwing(boss) {
  if (boss.hp <= 0 || isStunned(boss)) return;
  if (boss.swings && boss.swings.length) {
    nextSwing(boss);
    return;
  }
  boss.swings = null;
  // A short breather after every attack: the moment to hit back.
  boss.state = "recover";
  boss.stateTimer = boss.isBig ? 0.4 : 0.6;
}

function swingReach(boss, kind) {
  return boss.size * 0.5 + (kind === "thrust" ? 74 : kind === "spin" ? 66 : 54);
}

function swingSpread(kind) {
  return kind === "thrust" ? 0.42 : kind === "spin" ? Math.PI : 1.05;
}

function meleeHit(boss, swing) {
  const angle = Math.atan2(boss.lockY, boss.lockX);
  const reach = swingReach(boss, swing.kind);
  const spread = swingSpread(swing.kind);
  const damage = boss.damage * (swing.heavy ? 1.35 : swing.kind === "thrust" ? 1.2 : 1);
  if (swing.kind === "arc") {
    boss.x += boss.lockX * 16;
    boss.y += boss.lockY * 16;
  }
  effects.push({ type: "slash", x: boss.x, y: boss.y, angle, reach, spread, side: swing.side, kind: swing.kind, life: 0.22, max: 0.22, color: boss.shotColor || boss.type.accent, heavy: swing.heavy });
  boss.swordAngle = angle + swing.side * 1.4;
  sfx.slash(swing.heavy);
  if (swing.heavy) addShake(4);
  for (const p of livingPlayers()) {
    const dx = p.x - boss.x;
    const dy = p.y - boss.y;
    const d = Math.hypot(dx, dy);
    if (d > reach + p.r) continue;
    const diff = Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle));
    if (Math.abs(diff) > spread && d > boss.size * 0.45) continue;
    hurtPlayer(p, damage, boss.x, boss.y, boss);
    if (isStunned(boss)) break;
  }
}

// A jump attack: lands with a shockwave, then follows up with a quick slash.
function meleeLanding(boss) {
  const radius = boss.leapRadius || 90;
  addShake(7);
  addRing(boss.x, boss.y, radius, "#ffffff", 0.3, 8);
  burst(boss.x, boss.y + boss.size / 2, [boss.type.color, boss.type.accent, "#ffffff"], 20, 240);
  sfx.slam();
  for (const p of livingPlayers()) {
    if (Math.hypot(p.x - boss.x, p.y - boss.y) < radius + p.r) hurtPlayer(p, boss.damage * 1.3, boss.x, boss.y, boss);
  }
  if (!isStunned(boss)) startSwings(boss, [{ kind: "arc", delay: 0.22 }]);
}

/* ---------- smarter bosses ----------
   A few small rules that make bosses feel clever:
   - bossTarget: in co-op they pick on whoever is drinking or much weaker.
   - leadPoint: they aim where you are running, not where you are.
   - tryEvade / tryEscapeZone: they roll away from shots and spell circles.
   - state.habits: they notice if you parry or dash a lot and fake you out more.
   - punish: drinking a flask in front of them is risky.
   - "retreat": they back off, then rush straight back in. */
function bossTarget(boss) {
  const list = livingPlayers();
  if (list.length < 2) return list[0] || player;
  const drinker = list.find((p) => p.drinking > 0);
  let pick = drinker;
  if (!pick) {
    const [a, b] = list;
    const gap = a.hp / stats.maxHp - b.hp / stats.maxHp;
    pick = Math.abs(gap) > 0.3 ? (gap < 0 ? a : b) : nearestPlayer(boss.x, boss.y);
  }
  if (boss.focus !== pick.index) {
    if (boss.focus !== undefined && pick !== nearestPlayer(boss.x, boss.y)) floatText(pick.x, pick.y - 50, "Targeted!", "#ff8b7d", 14);
    boss.focus = pick.index;
  }
  return pick;
}

// Where a player will be in a moment if they keep running the same way.
function leadPoint(target, seconds) {
  return {
    x: clamp(target.x + (target.velX || 0) * seconds, TILE + 20, WIDTH - TILE - 20),
    y: clamp(target.y + (target.velY || 0) * seconds, TILE + 20, HEIGHT - TILE - 20)
  };
}

// The angle to shoot so a bullet meets you. It only leads 75% of the way, so
// changing direction still saves you.
function leadAngle(boss, target, speed) {
  const time = (Math.hypot(target.x - boss.x, target.y - boss.y) / speed) * 0.75;
  const spot = leadPoint(target, time);
  return Math.atan2(spot.y - boss.y, spot.x - boss.x);
}

// Bosses get trickier when they notice your habits.
function habitBonus() {
  return Math.min(0.3, state.habits.parry * 0.03) + Math.min(0.15, state.habits.dash * 0.012);
}

function noticeHabits(boss) {
  if (boss.readYou || habitBonus() < 0.15) return;
  boss.readYou = true;
  const parries = state.habits.parry * 0.03 >= state.habits.dash * 0.012;
  floatText(boss.x, boss.y - boss.size - 10, parries ? "It's reading your parries!" : "It's reading your dashes!", "#c084fc", 15);
}

function dangerZone(boss) {
  for (const effect of effects) {
    if (!["meteor", "flask", "poison", "blizzard", "firetrail"].includes(effect.type)) continue;
    if (Math.hypot(boss.x - effect.x, boss.y - effect.y) < effect.radius + boss.size * 0.4) return effect;
  }
  return null;
}

function tryEscapeZone(boss, dt) {
  boss.zoneCd = (boss.zoneCd || 0) - dt;
  if (boss.zoneCd > 0) return false;
  const zone = dangerZone(boss);
  if (!zone) return false;
  boss.zoneCd = boss.melee ? 0.9 : 1.4;
  if (Math.random() > (boss.isBig ? 0.4 : boss.melee ? 0.75 : 0.55)) return false;
  // Right in the middle of the circle? Then any direction out will do.
  const d = Math.hypot(boss.x - zone.x, boss.y - zone.y);
  const away = d > 4 ? Math.atan2(boss.y - zone.y, boss.x - zone.x) : Math.random() * Math.PI * 2;
  boss.state = "dodge";
  boss.stateTimer = 0.4;
  boss.lockX = Math.cos(away);
  boss.lockY = Math.sin(away);
  burst(boss.x, boss.y + boss.size / 2, ["rgba(255,255,255,0.7)"], 6, 80);
  if (Math.random() < 0.4) floatText(boss.x, boss.y - boss.size, "Nope!", "#f8ead2", 13);
  return true;
}

// Agile bosses watch for your shots and roll out of the way.
function incomingShot(boss) {
  for (const shot of projectiles) {
    if (shot.owner !== "player" || shot.life <= 0) continue;
    const rx = boss.x - shot.x;
    const ry = boss.y - shot.y;
    const d = Math.hypot(rx, ry);
    if (d > 150 || d < 1) continue;
    const speed = Math.hypot(shot.vx, shot.vy) || 1;
    const along = (rx * shot.vx + ry * shot.vy) / speed;
    if (along <= 0) continue;
    const miss = Math.abs(rx * shot.vy - ry * shot.vx) / speed;
    if (miss < boss.size * 0.6 + (shot.r || 6)) return shot;
  }
  return null;
}

function tryEvade(boss, dt, room) {
  boss.evadeCd = (boss.evadeCd || 0) - dt;
  if (boss.evadeCd > 0) return false;
  const shot = incomingShot(boss);
  if (!shot) return false;
  if (Math.random() > (boss.melee ? 0.6 : boss.isBig ? 0.4 : 0.35)) {
    boss.evadeCd = 0.5;
    return false;
  }
  const speed = Math.hypot(shot.vx, shot.vy) || 1;
  const side = (boss.x - shot.x) * shot.vy - (boss.y - shot.y) * shot.vx > 0 ? 1 : -1;
  boss.state = "dodge";
  boss.stateTimer = 0.2;
  boss.lockX = (shot.vy / speed) * side;
  boss.lockY = (-shot.vx / speed) * side;
  boss.evadeCd = rand(0.9, 1.5) * difficulty().attack / (room.tier >= 15 ? 1.2 : 1);
  burst(boss.x, boss.y + boss.size / 2, ["rgba(255,255,255,0.7)"], 6, 80);
  if (Math.random() < 0.35) floatText(boss.x, boss.y - boss.size, "Too slow!", "#f8ead2", 13);
  return true;
}

// The sword swings smoothly toward where it should point.
function updateSword(boss, dt, ux, uy) {
  const aim = Math.atan2(uy, ux);
  let want = aim + 0.9;
  if (boss.state === "swing") want = Math.atan2(boss.lockY, boss.lockX) - boss.swingSide * 1.5;
  if (boss.state === "lunge") want = Math.atan2(boss.lockY, boss.lockX);
  if (boss.state === "recover") return;
  const diff = Math.atan2(Math.sin(want - boss.swordAngle), Math.cos(want - boss.swordAngle));
  boss.swordAngle += diff * Math.min(1, dt * 12);
}

function repositionFoes(room, entry) {
  for (const enemy of livingFoes(room)) {
    enemy.x = enemy.homeX;
    enemy.y = enemy.homeY;
    if (distance(enemy, entry) < 200) {
      enemy.x = clamp(WIDTH - enemy.x, TILE + 40, WIDTH - TILE - 40);
      enemy.y = clamp(HEIGHT - enemy.y, TILE + 40, HEIGHT - TILE - 40);
    }
    enemy.state = "move";
    enemy.stateTimer = 0;
    enemy.alpha = 1;
    enemy.spiralTime = 0;
    enemy.attackTimer = enemy.isBoss ? 2 : rand(1, 2);
    enemy.hop = 0;
  }
}

/* ---------- starting, saving, loading ---------- */

function resetWorld() {
  stats = baseStats();
  rooms = createRooms();
  pet = null;
  Object.assign(state, {
    roomIndex: 0,
    coins: 0,
    bossesDefeated: 0,
    enemiesDefeated: 0,
    time: 0,
    clock: 0,
    petUnlocked: false,
    portalOpen: false,
    won: false,
    upgradeCounts: {},
    upgradeChoices: [],
    upgradeTimer: 0,
    victoryTimer: 0,
    rerollCost: 10,
    seenTypes: new Set(),
    upgradesVersion: state.upgradesVersion + 1,
    confirmNew: false,
    bigBeaten: new Set(),
    picksLeft: 0,
    intro: null,
    petsOwned: new Set(PET_IDS),
    petChoice: state.petPick,
    powerDps: 0,
    habits: { parry: 0, dash: 0 },
    slowmo: 0,
    checkpoint: 0,
    lostCoins: null,
    lastLost: 0
  });
  for (const p of players) {
    p.hp = stats.maxHp;
    p.mana = stats.maxMana;
    p.shield = 0;
    p.dashCd = 0;
    p.dashTime = 0;
    p.kx = 0;
    p.ky = 0;
    p.revive = 0;
    p.downTimer = 0;
    for (const id of Object.keys(p.cooldowns)) p.cooldowns[id] = 0;
    p.stamina = stats.maxStamina;
    p.flasks = stats.maxFlasks;
    p.stun = 0;
    p.drinking = 0;
    p.blocking = false;
  }
  banners.length = 0;
  particles.length = 0;
}

/* ---------- players ---------- */

function activePlayers() {
  return state.twoPlayer ? players : [player];
}

function livingPlayers() {
  return activePlayers().filter((p) => p.hp > 0);
}

// Enemies chase and aim at whichever wizard is closest.
function nearestPlayer(x, y) {
  const list = livingPlayers();
  if (!list.length) return player;
  return list.reduce((best, p) => (Math.hypot(p.x - x, p.y - y) < Math.hypot(best.x - x, best.y - y) ? p : best));
}

function partnerOf(p) {
  return players[1 - p.index];
}

function robeOf(p) {
  return robes[state.looks[p.index].robe];
}

// Puts the partner a step closer to the middle of the room than the leader.
function placePartner(leader) {
  if (!state.twoPlayer) return;
  const partner = partnerOf(leader);
  let dx = WIDTH / 2 - leader.x;
  let dy = HEIGHT / 2 - leader.y;
  let length = Math.hypot(dx, dy);
  if (length < 1) {
    dx = 1;
    dy = 0;
    length = 1;
  }
  const side = leader.index === 0 ? 1 : -1;
  partner.x = clamp(leader.x + (dx / length) * 34 - (dy / length) * 26 * side, TILE + partner.r, WIDTH - TILE - partner.r);
  partner.y = clamp(leader.y + (dy / length) * 34 + (dx / length) * 26 * side, TILE + partner.r, HEIGHT - TILE - partner.r);
  partner.kx = 0;
  partner.ky = 0;
  partner.dashTime = 0;
  if (partner.hp <= 0) revivePlayer(partner, 0.3);
}

function placePlayers(x, y) {
  player.x = state.twoPlayer ? x - 26 : x;
  player.y = y;
  if (state.twoPlayer) {
    players[1].x = x + 26;
    players[1].y = y;
  }
  for (const p of activePlayers()) {
    p.kx = 0;
    p.ky = 0;
    p.dashTime = 0;
  }
}

function revivePlayer(p, fraction) {
  p.hp = Math.max(1, Math.round(stats.maxHp * fraction));
  p.revive = 0;
  p.downTimer = 0;
  p.invulnerable = 2;
  p.kx = 0;
  p.ky = 0;
  burst(p.x, p.y, ["#ff9ff3", "#ef5b4b", "#ffffff"], 16, 200, { heart: true });
  floatText(p.x, p.y - 40, "Back up!", "#9ee49c", 18);
  sfx.heal();
}

function startNewGame() {
  resetWorld();
  writeStorage(SAVE_KEY, null);
  placePlayers(WIDTH / 2, HEIGHT / 2);
  state.petUnlocked = true;
  pet = { x: WIDTH / 2 - 30, y: HEIGHT / 2 + 10, timer: 1, face: 1, hop: 0 };
  state.mode = "playing";
  enterRoom(0, { x: WIDTH / 2, y: HEIGHT / 2 }, true);
  toast(state.twoPlayer ? "Team up! Stand next to a bonked friend to help them up." : "Find every room boss and clear the dungeon!", 3.5);
  banner("Room 1", "Defeat the boss, then pick a door", "#f6c85f");
}

function saveGame() {
  if (state.won) return;
  const data = {
    v: 2,
    robe: state.looks[0].robe,
    coins: state.coins,
    time: state.time,
    room: state.mode === "dead" ? state.checkpoint : currentRoom().final ? 0 : currentRoom().arena ? rowEnd(currentRoom().row) : state.roomIndex,
    big: [...state.bigBeaten],
    checkpoint: state.checkpoint,
    lostCoins: state.lostCoins,
    flasks: [player.flasks, players[1].flasks],
    stats,
    upgradeCounts: state.upgradeCounts,
    petUnlocked: state.petUnlocked,
    pets: [...state.petsOwned],
    petChoice: state.petChoice,
    powerDps: state.powerDps,
    seen: [...state.seenTypes],
    defeated: state.enemiesDefeated,
    rerollCost: state.rerollCost,
    hp: player.hp,
    mana: player.mana,
    hp2: players[1].hp,
    mana2: players[1].mana,
    rooms: rooms.slice(0, ROOM_COUNT).map((room) => (room.populated
      ? { t: room.tier, b: room.boss.hp <= 0 ? 1 : 0, e: room.enemies.filter((enemy) => !enemy.temp).map((enemy) => (enemy.hp > 0 ? 1 : 0)) }
      : null))
  };
  writeStorage(SAVE_KEY, data);
  state.hasSave = true;
}

function loadGame() {
  const data = readStorage(SAVE_KEY);
  if (!data || data.v !== 2 || !Array.isArray(data.rooms)) return false;
  resetWorld();
  state.coins = data.coins | 0;
  state.time = Number(data.time) || 0;
  // Rebuild stats from the power-ups owned, so older saves pick up balance changes.
  stats = baseStats();
  state.upgradeCounts = {};
  const owned = data.upgradeCounts || {};
  for (const upgrade of upgrades) {
    const count = Math.min(upgrade.max, owned[upgrade.id] | 0);
    for (let i = 0; i < count; i += 1) upgrade.apply();
    if (count) state.upgradeCounts[upgrade.id] = count;
  }
  const big = Array.isArray(data.big) ? data.big : [];
  state.bigBeaten = new Set(big.filter((row) => Number.isInteger(row) && bigBosses[row]));
  stats.maxHp += BIG_HP_BONUS * state.bigBeaten.size;
  state.checkpoint = Number.isInteger(data.checkpoint) && data.checkpoint % ROOM_COLS === 0 && data.checkpoint < ROOM_COUNT ? data.checkpoint : 0;
  const lost = data.lostCoins;
  state.lostCoins = lost && Number.isInteger(lost.room) && rooms[lost.room] && lost.amount > 0 ? { room: lost.room, x: Number(lost.x) || WIDTH / 2, y: Number(lost.y) || HEIGHT / 2, amount: lost.amount | 0 } : null;
  players.forEach((p, i) => {
    const saved = Array.isArray(data.flasks) ? data.flasks[i] : undefined;
    p.flasks = Number.isInteger(saved) ? clamp(saved, 0, stats.maxFlasks) : stats.maxFlasks;
    p.stamina = stats.maxStamina;
  });
  state.petUnlocked = Boolean(data.petUnlocked);
  state.powerDps = Number(data.powerDps) > 0 ? Number(data.powerDps) : 0;
  state.petsOwned = new Set(PET_IDS);
  state.petChoice = petTypes[data.petChoice] ? data.petChoice : "pixel";
  state.seenTypes = new Set(Array.isArray(data.seen) ? data.seen : []);
  state.enemiesDefeated = data.defeated | 0;
  state.rerollCost = data.rerollCost || 10;
  state.upgradesVersion += 1;

  data.rooms.forEach((saved, index) => {
    if (!saved || !rooms[index]) return;
    const room = rooms[index];
    room.visited = true;
    populateRoom(room, { x: WIDTH / 2, y: HEIGHT / 2 }, saved.t | 0);
    if (saved.b) room.boss.hp = 0;
    room.enemies.forEach((enemy, i) => {
      if (Array.isArray(saved.e) && saved.e[i] === 0) enemy.hp = 0;
    });
    room.cleared = isRoomCleared(room);
  });

  for (const row of state.bigBeaten) {
    const arena = rooms[ARENA_START + row];
    arena.visited = true;
    populateRoom(arena, { x: WIDTH / 2, y: HEIGHT / 2 }, 0);
    arena.boss.hp = 0;
    arena.cleared = true;
  }

  state.bossesDefeated = countBossesDefeated();
  state.portalOpen = state.bossesDefeated >= ROOM_COUNT;
  player.hp = clamp(Number(data.hp) || stats.maxHp, 1, stats.maxHp);
  player.mana = clamp(Number(data.mana) || stats.maxMana, 0, stats.maxMana);
  players[1].hp = clamp(Number(data.hp2) || stats.maxHp, 1, stats.maxHp);
  players[1].mana = clamp(Number(data.mana2) || stats.maxMana, 0, stats.maxMana);
  if (state.petUnlocked) pet = { x: WIDTH / 2, y: HEIGHT / 2, timer: 1, face: 1, hop: 0 };

  const roomIndex = clamp(data.room | 0, 0, ROOM_COUNT - 1);
  placePlayers(WIDTH / 2, HEIGHT / 2);
  state.mode = "playing";
  enterRoom(roomIndex, { x: WIDTH / 2, y: HEIGHT / 2 }, true);
  toast("Welcome back, wizard!", 3);
  return true;
}

function countBossesDefeated() {
  return rooms.slice(0, ROOM_COUNT).filter((room) => room.populated && room.boss.hp <= 0).length;
}

function quitToTitle() {
  saveGame();
  state.mode = "title";
  state.confirmNew = false;
  mouse.down = false;
}

/* ---------- moving between rooms ---------- */

function enterRoom(index, entry, silent = false) {
  // Coins left on the floor come with you, so nothing is lost by leaving.
  for (const item of pickups) {
    if (item.kind === "coin") state.coins += item.value;
  }
  pickups.length = 0;
  projectiles.length = 0;
  effects.length = 0;
  ambient.length = 0;
  floatTexts.length = 0;

  state.roomIndex = index;
  const room = rooms[index];
  if (!room.populated) populateRoom(room, entry, room.final ? 30 : Math.min(state.bossesDefeated, 29));
  else repositionFoes(room, entry);
  room.visited = true;
  state.entry = { x: entry.x, y: entry.y };
  state.fade = silent ? 0.6 : 1;

  for (const enemy of livingFoes(room)) {
    if (enemy.typeIndex < 0) continue;
    const type = enemyTypes[enemy.typeIndex];
    if (type && type.monster && !state.seenTypes.has(enemy.typeIndex) && !silent) toast(`New monster: ${type.name}! It ${type.quirk}.`, 4);
    state.seenTypes.add(enemy.typeIndex);
  }

  if (pet) {
    pet.x = player.x - 30;
    pet.y = player.y + 10;
  }

  renderRoomBackground(room);

  if (room.boss.hp > 0 && room.boss.hp === room.boss.maxHp) {
    if (!room.final) room.tier = Math.max(room.tier, Math.min(state.bossesDefeated, 29));
    room.boss.maxHp = bossMaxHp(room);
    room.boss.hp = room.boss.maxHp;
  }

  if (room.arena && room.boss.hp > 0) {
    startIntro(room);
  } else if (room.boss.hp > 0) {
    room.boss.attackTimer = 2;
    if (!silent) sfx.boss();
    banner(room.boss.name, room.final ? "The final boss!" : room.boss.melee ? "Sword boss! Block, parry or dodge its slashes" : `Boss of Room ${index + 1}`, "#ff8b7d");
  } else if (!silent) {
    sfx.door();
  }

  if (!room.final) saveGame();
}

// The wizard who walks through a door brings their partner along.
function changeRoom(dx, dy, mover = player) {
  const room = currentRoom();
  let target;
  if (room.arena) {
    if (dx !== -1) return;
    target = rowEnd(room.row);
  } else {
    const col = state.roomIndex % ROOM_COLS;
    const row = Math.floor(state.roomIndex / ROOM_COLS);
    const newCol = col + dx;
    const newRow = row + dy;
    if (dx === 1 && col === ROOM_COLS - 1) {
      // Through the big gate at the end of the row.
      if (!gateOpen(row)) return;
      target = ARENA_START + row;
    } else {
      if (newCol < 0 || newCol >= ROOM_COLS || newRow < 0 || newRow >= ROOM_ROWS) return;
      target = newRow * ROOM_COLS + newCol;
    }
  }

  if (dx === 1) mover.x = TILE + mover.r + 4;
  if (dx === -1) mover.x = WIDTH - TILE - mover.r - 4;
  if (dy === 1) mover.y = TILE + mover.r + 4;
  if (dy === -1) mover.y = HEIGHT - TILE - mover.r - 4;
  mover.dashTime = 0;
  placePartner(mover);

  enterRoom(target, { x: mover.x, y: mover.y });
}

function enterDragonRoom() {
  placePlayers(WIDTH / 2, HEIGHT - 110);
  for (const p of activePlayers()) {
    if (p.hp <= 0) revivePlayer(p, 0.3);
    p.invulnerable = 1.5;
  }
  sfx.portal();
  enterRoom(DRAGON_ROOM, { x: WIDTH / 2, y: HEIGHT - 110 });
}

/* ---------- input ---------- */

/* Keys are read by their position (event.code), so WASD works on any layout.
   One player:  WASD or arrows move, Space or mouse fires, Shift dashes, 1-4 cast.
   Two players: P1 uses WASD, Space or mouse, Left Shift and 1-4.
                P2 uses arrows (or IJKL), fires by itself, Enter or Right Shift
                dashes and 7 8 9 0 (or numpad 1-4) cast. */
function digitFrom(event) {
  const match = /^(Digit|Numpad)([0-9])$/.exec(event.code || "");
  if (match) return { n: Number(match[2]), numpad: match[1] === "Numpad" };
  if (/^[0-9]$/.test(event.key)) return { n: Number(event.key), numpad: false };
  return null;
}

function handlePlayKey(event, key, code, digit) {
  const two = state.twoPlayer;
  const p2 = players[1];
  if (digit) {
    if (!two && digit.n >= 1 && digit.n <= 5) castSpell(player, digit.n - 1);
    else if (two && digit.numpad && digit.n >= 1 && digit.n <= 5) castSpell(p2, digit.n - 1);
    else if (two && digit.n >= 1 && digit.n <= 5) castSpell(player, digit.n - 1);
    else if (two && digit.n >= 7) castSpell(p2, digit.n - 7);
    else if (two && digit.n === 0) castSpell(p2, 3);
  }
  if (two && (code === "Minus" || code === "NumpadSubtract")) castSpell(p2, 4);
  if (!event.repeat && (code === "KeyQ" || (!code && key === "q"))) drinkFlask(player);
  if (!event.repeat && two && (code === "Slash" || code === "NumpadAdd")) drinkFlask(p2);
  if (!two && key === "shift") tryDash(player);
  if (two && (code === "ShiftLeft" || (!code && key === "shift"))) tryDash(player);
  if (two && (code === "ShiftRight" || code === "Enter" || code === "NumpadEnter")) tryDash(p2);
}

window.addEventListener("keydown", (event) => {
  initAudio();
  const key = event.key.toLowerCase();
  const code = event.code || "";
  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key) || code === "Space" || code === "Slash") event.preventDefault();
  keys.add(key);
  if (code) codes.add(code);
  if (event.repeat) return;

  const digit = digitFrom(event);

  if (key === "m") {
    cycleSound();
    return;
  }

  switch (state.mode) {
    case "title": {
      const two = state.twoPlayer;
      if (code === "KeyA" || (!two && key === "arrowleft")) chooseRobe(0, -1);
      if (code === "KeyD" || (!two && key === "arrowright")) chooseRobe(0, 1);
      if (code === "KeyW" || (!two && key === "arrowup")) chooseHat(0, -1);
      if (code === "KeyS" || (!two && key === "arrowdown")) chooseHat(0, 1);
      if (two && key === "arrowleft") chooseRobe(1, -1);
      if (two && key === "arrowright") chooseRobe(1, 1);
      if (two && key === "arrowup") chooseHat(1, -1);
      if (two && key === "arrowdown") chooseHat(1, 1);
      if (code === "KeyQ" || (!code && key === "q")) cyclePet(-1);
      if (code === "KeyE" || code === "KeyT" || (!code && (key === "e" || key === "t"))) cyclePet(1);
      if (digit && digit.n === 1 && state.twoPlayer) togglePlayers();
      if (digit && digit.n === 2 && !state.twoPlayer) togglePlayers();
      if (key === "enter" || key === " ") {
        if (state.hasSave) loadGame() || startNewGame();
        else startNewGame();
      }
      break;
    }
    case "intro":
      if ((key === " " || key === "enter" || key === "escape") && state.intro && state.intro.time > 0.5) endIntro();
      break;
    case "playing":
      handlePlayKey(event, key, code, digit);
      if (key === "p" || key === "escape") togglePause();
      break;
    case "paused":
      if (key === "p" || key === "escape" || key === "enter") togglePause();
      if (key === "h") chooseHat(0, 1);
      break;
    case "upgrade":
      if (digit && digit.n >= 1 && digit.n <= state.upgradeChoices.length) chooseUpgrade(digit.n - 1);
      if (key === "r") rerollUpgrades();
      break;
    case "dead":
      if (key === "r" || key === "enter") restartInRoom();
      break;
    case "victory":
      if (key === "enter") {
        writeStorage(SAVE_KEY, null);
        state.hasSave = false;
        state.mode = "title";
      }
      break;
    default:
      break;
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
  if (event.code) codes.delete(event.code);
  // Shift changes event.key while held, so clear the shifted spellings too.
  if (event.key === "Shift") {
    codes.delete("ShiftLeft");
    codes.delete("ShiftRight");
  }
});

window.addEventListener("blur", () => {
  keys.clear();
  codes.clear();
  mouse.down = false;
  touch.fire = false;
  if (state.mode === "playing") togglePause();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.mode === "playing") togglePause();
});

function updatePointer(event) {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * WIDTH;
  mouse.y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
}

canvas.addEventListener("pointermove", (event) => {
  updatePointer(event);
  if (event.pointerType === "mouse") {
    mouse.touchAim = false;
    mouse.active = 2.5;
  }
});

canvas.addEventListener("pointerdown", (event) => {
  initAudio();
  updatePointer(event);
  if (state.mode === "intro") {
    if (state.intro && state.intro.time > 0.5) endIntro();
    return;
  }
  const region = hitRegions.find((r) => mouse.x >= r.x && mouse.x <= r.x + r.w && mouse.y >= r.y && mouse.y <= r.y + r.h);
  if (region) {
    event.preventDefault();
    sfx.click();
    region.action();
    return;
  }

  if (state.mode === "playing") {
    mouse.active = 2.5;
    if (event.button === 2) {
      tryDash(player);
      return;
    }
    mouse.down = true;
    mouse.touchAim = event.pointerType !== "mouse";
  } else if (state.mode === "dead") {
    restartInRoom();
  }
});

window.addEventListener("pointerup", () => {
  mouse.down = false;
});

canvas.addEventListener("contextmenu", (event) => event.preventDefault());

ui.soundBtn.addEventListener("click", () => {
  cycleSound();
  ui.soundBtn.blur();
});

ui.pauseBtn.addEventListener("click", () => {
  initAudio();
  if (state.mode === "playing" || state.mode === "paused") togglePause();
  ui.pauseBtn.blur();
});

function enableTouch() {
  if (touch.enabled) return;
  touch.enabled = true;
  ui.touch.hidden = false;
  document.body.classList.add("touch");
}

if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) enableTouch();
window.addEventListener("touchstart", enableTouch, { passive: true, once: true });

function moveStick(event) {
  const rect = ui.stick.getBoundingClientRect();
  let dx = event.clientX - (rect.left + rect.width / 2);
  let dy = event.clientY - (rect.top + rect.height / 2);
  const max = rect.width * 0.36;
  const length = Math.hypot(dx, dy);
  if (length > max) {
    dx = (dx / length) * max;
    dy = (dy / length) * max;
  }
  touch.moveX = dx / max;
  touch.moveY = dy / max;
  ui.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
}

function endStick(event) {
  if (event.pointerId !== touch.stickId) return;
  touch.stickId = null;
  touch.moveX = 0;
  touch.moveY = 0;
  ui.stickKnob.style.transform = "";
}

ui.stick.addEventListener("pointerdown", (event) => {
  initAudio();
  event.preventDefault();
  touch.stickId = event.pointerId;
  try {
    ui.stick.setPointerCapture(event.pointerId);
  } catch (err) {
    /* Pointer capture is optional. */
  }
  moveStick(event);
});
ui.stick.addEventListener("pointermove", (event) => {
  if (event.pointerId === touch.stickId) moveStick(event);
});
ui.stick.addEventListener("pointerup", endStick);
ui.stick.addEventListener("pointercancel", endStick);

for (const button of ui.touch.querySelectorAll("[data-action]")) {
  const action = button.dataset.action;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    initAudio();
    if (state.mode === "dead") {
      restartInRoom();
      return;
    }
    if (state.mode === "intro") {
      if (state.intro && state.intro.time > 0.5) endIntro();
      return;
    }
    if (state.mode !== "playing") return;
    if (action === "fire") touch.fire = true;
    else if (action === "block") touch.block = true;
    else if (action === "flask") drinkFlask(player);
    else if (action === "dash") tryDash(player);
    else if (action.startsWith("spell")) castSpell(player, Number(action.slice(5)));
  });
  if (action === "block") {
    const stop = () => { touch.block = false; };
    button.addEventListener("pointerup", stop);
    button.addEventListener("pointercancel", stop);
    button.addEventListener("pointerleave", stop);
  }
  if (action === "fire") {
    const stop = () => { touch.fire = false; };
    button.addEventListener("pointerup", stop);
    button.addEventListener("pointercancel", stop);
    button.addEventListener("pointerleave", stop);
  }
}

function chooseRobe(index, step) {
  const look = state.looks[index];
  look.robe = (look.robe + step + robes.length) % robes.length;
  savePrefs();
  sfx.click();
}

function ownedHats() {
  return [...state.hatsUnlocked].sort((a, b) => a - b);
}

// Steps through the hats this player has collected so far.
function chooseHat(index, step) {
  const owned = ownedHats();
  const look = state.looks[index];
  const pos = Math.max(0, owned.indexOf(look.hat));
  look.hat = owned[(pos + step + owned.length) % owned.length];
  savePrefs();
  sfx.click();
}

function wearHat(index, hatId) {
  if (!state.hatsUnlocked.has(hatId)) return;
  state.looks[index].hat = hatId;
  savePrefs();
  sfx.pick();
}

function unlockHat(hatId) {
  if (!hats[hatId] || state.hatsUnlocked.has(hatId)) return;
  state.hatsUnlocked.add(hatId);
  savePrefs();
  banner("New hat!", `${hats[hatId].name}. Try it on in the pause menu!`, "#f6c85f", 3.2);
}

function togglePause() {
  if (state.mode === "playing") {
    state.mode = "paused";
    mouse.down = false;
    touch.fire = false;
    ui.pauseBtn.textContent = "Resume";
  } else if (state.mode === "paused") {
    state.mode = "playing";
    ui.pauseBtn.textContent = "Pause";
  }
}

/* ---------- messages ---------- */

function toast(text, time = 2) {
  state.message = text;
  state.messageTimer = time;
}

function banner(title, subtitle, color = "#f6c85f", time = 2.6) {
  banners.push({ title, subtitle, color, time, max: time });
}

function floatText(x, y, text, color = "#ffffff", size = 16) {
  floatTexts.push({ x, y, text, color, size, life: 0.9, max: 0.9 });
  if (floatTexts.length > 60) floatTexts.shift();
}

/* ---------- particles and effects ---------- */

function burst(x, y, colors, count = 12, speed = 160, options = {}) {
  if (particles.length > 700) return;
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = rand(speed * 0.3, speed);
    const p = particlePool.pop() || {};
    p.x = x;
    p.y = y;
    p.vx = Math.cos(angle) * velocity;
    p.vy = Math.sin(angle) * velocity - (options.lift || 0);
    p.life = rand(0.35, 0.75) * (options.lifeScale || 1);
    p.max = 0.75 * (options.lifeScale || 1);
    p.size = rand(3, 7) * (options.sizeScale || 1);
    p.color = Array.isArray(colors) ? pick(colors) : colors;
    p.gravity = options.gravity || 0;
    p.drag = options.drag ?? 0.9;
    p.spin = options.spin ? rand(-8, 8) : 0;
    p.angle = 0;
    p.heart = Boolean(options.heart);
    particles.push(p);
  }
}

function confetti(x, y, count = 60) {
  burst(x, y, ["#f6c85f", "#ef5b4b", "#55aaff", "#4ade80", "#ff9ff3", "#ffffff", "#c084fc"], count, 420, {
    gravity: 520,
    drag: 0.96,
    lifeScale: 2.4,
    sizeScale: 1.2,
    lift: 160,
    spin: true
  });
}

function addRing(x, y, radius, color, life = 0.4, width = 10) {
  effects.push({ type: "ring", x, y, radius, color, life, max: life, width });
}

function addShake(amount) {
  if (reducedMotion) return;
  state.shake = Math.max(state.shake, amount);
}

/* ---------- player actions ---------- */

function aimAngle(p) {
  return Math.atan2(p.dirY, p.dirX);
}

// Spells grow with every boss beaten and with Spell Book upgrades.
function spellPower() {
  // Every big boss beaten adds 10% spell power for the rest of the run.
  return (1 + state.bossesDefeated * 0.06) * stats.spellBoost * (1 + 0.1 * state.bigBeaten.size);
}

function petPower() {
  return 1 + state.bossesDefeated * 0.045;
}

function shootStaff(p) {
  if (p.shotCooldown > 0 || p.hp <= 0) return;
  const count = stats.shotCount;
  const base = aimAngle(p);
  for (let i = 0; i < count; i += 1) {
    const angle = base + (i - (count - 1) / 2) * 0.13;
    projectiles.push({
      x: p.x + Math.cos(angle) * 22,
      y: p.y + Math.sin(angle) * 22,
      vx: Math.cos(angle) * 480,
      vy: Math.sin(angle) * 480,
      r: 7,
      damage: stats.staffDamage,
      life: 0.85,
      owner: "player",
      kind: "staff",
      color: p.index === 0 ? "#fff2a3" : "#c6f6ff",
      spin: 0
    });
  }
  p.shotCooldown = stats.shotDelay;
  sfx.shoot();
}

const DASH_STAMINA = 28;

function tryDash(p = player) {
  if (state.mode !== "playing" || p.dashCd > 0 || p.hp <= 0 || p.stun > 0 || p.drinking > 0) return;
  if (p.index === 1 && !state.twoPlayer) return;
  if (p.stamina < DASH_STAMINA) {
    floatText(p.x, p.y - 36, "Too tired!", "#86efac", 14);
    sfx.nope();
    return;
  }
  p.stamina -= DASH_STAMINA;
  p.staminaWait = 0.6;
  p.blocking = false;
  p.dashStart = state.time;
  p.perfectDone = false;
  state.habits.dash += 1;
  let dx = 0;
  let dy = 0;
  const move = movementInput(p);
  if (Math.hypot(move.x, move.y) > 0.2) {
    dx = move.x;
    dy = move.y;
  } else {
    dx = p.dirX;
    dy = p.dirY;
  }
  const length = Math.hypot(dx, dy) || 1;
  p.dashX = dx / length;
  p.dashY = dy / length;
  p.dashTime = stats.dash === "thunder" ? 0.22 : 0.16;
  p.dashCd = stats.dashCooldown;
  p.dashHits = new Set();
  p.invulnerable = Math.max(p.invulnerable, p.dashTime + 0.12);
  sfx.dash();
  if (stats.dash === "fire") tone(300, 0.2, { type: "sawtooth", volume: 0.04, slide: -150 });
  if (stats.dash === "thunder") noiseBurst(0.12, { volume: 0.08, freq: 5000 });
}

// Older callers (and the console handle) may pass just the spell number for player 1.
function castSpell(p, index) {
  if (typeof p === "number") {
    index = p;
    p = player;
  }
  const spell = spells[index];
  if (!spell || state.mode !== "playing" || p.hp <= 0 || p.stun > 0 || p.drinking > 0 || p.blocking) return;
  if (p.index === 1 && !state.twoPlayer) return;
  const who = state.twoPlayer ? `P${p.index + 1}: ` : "";
  if (state.bossesDefeated < spell.unlockAt) {
    toast(`${spellLook(spell).name} unlocks after ${spell.unlockAt} bosses.`);
    sfx.nope();
    return;
  }
  if (p.cooldowns[spell.id] > 0) {
    toast(`${who}${spellLook(spell).name} is cooling down.`, 1.2);
    sfx.nope();
    return;
  }
  if (p.mana < spellCost(spell)) {
    toast(`${who}Not enough mana for ${spellLook(spell).name}.`, 1.4);
    sfx.nope();
    return;
  }

  let worked = true;
  if (spell.id === "fireball") castFireball(p);
  if (spell.id === "frost") castFrostNova(p);
  if (spell.id === "lightning") worked = castLightning(p);
  if (spell.id === "shield") castShield(p);
  if (spell.id === "poison") castPoison(p);

  if (worked) {
    p.mana -= spellCost(spell);
    p.cooldowns[spell.id] = spellCooldown(spell);
  }
}

function castFireball(p) {
  if (evoIs("fireball", "meteor")) {
    castMeteor(p);
    return;
  }
  if (evoIs("fireball", "phoenix")) {
    castPhoenix(p);
    return;
  }
  const angle = aimAngle(p);
  projectiles.push({
    x: p.x + Math.cos(angle) * 24,
    y: p.y + Math.sin(angle) * 24,
    vx: Math.cos(angle) * 390,
    vy: Math.sin(angle) * 390,
    r: 13,
    damage: stats.fireDamage * spellPower(),
    life: 1.35,
    owner: "player",
    kind: "fireball",
    color: "#ff742e",
    spin: 0
  });
  sfx.fireball();
}

// Meteor: a shadow appears where you aim, then a flaming rock crashes down.
// Where a lobbed spell lands: the mouse, or the enemy closest to where the wizard faces.
function landingSpot(p, reach = 220) {
  let tx = p.x + p.dirX * reach;
  let ty = p.y + p.dirY * reach;
  if (aimsWithMouse(p)) {
    tx = mouse.x;
    ty = mouse.y;
  } else {
    const foes = livingFoes(currentRoom()).filter((enemy) => enemy.alpha > 0.3 && !enemy.friendly);
    if (foes.length) {
      const spot = { x: tx, y: ty };
      const target = foes.reduce((best, enemy) => (distance(enemy, spot) < distance(best, spot) ? enemy : best));
      tx = target.x;
      ty = target.y;
    }
  }
  return { x: clamp(tx, TILE + 20, WIDTH - TILE - 20), y: clamp(ty, TILE + 20, HEIGHT - TILE - 20) };
}

function castPhoenix(p) {
  const base = aimAngle(p);
  const angles = stats.mega.fireball ? [base - 0.16, base, base + 0.16] : [base];
  for (const angle of angles) {
    projectiles.push({
      x: p.x + Math.cos(angle) * 24,
      y: p.y + Math.sin(angle) * 24,
      vx: Math.cos(angle) * 420,
      vy: Math.sin(angle) * 420,
      r: 16,
      damage: stats.fireDamage * spellPower() * 0.7,
      life: 1.3,
      owner: "player",
      kind: "phoenix",
      pierce: true,
      hits: new Set(),
      color: "#ffb347",
      spin: 0
    });
  }
  tone(900, 0.3, { type: "sawtooth", volume: 0.05, slide: 600 });
  sfx.fireball();
}

function castMeteor(p) {
  if (stats.mega.fireball) {
    const spot = landingSpot(p);
    for (let i = 0; i < 3; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const off = i === 0 ? 0 : rand(60, 110);
      const x = clamp(spot.x + Math.cos(angle) * off, TILE + 20, WIDTH - TILE - 20);
      const y = clamp(spot.y + Math.sin(angle) * off, TILE + 20, HEIGHT - TILE - 20);
      effects.push({ type: "meteor", x, y, radius: stats.boomRadius * 1.4, life: 0.6 + i * 0.2, max: 0.6 + i * 0.2, power: i === 0 ? 1 : 0.5 });
    }
    tone(1400, 0.8, { type: "sine", volume: 0.05, slide: -1100 });
    sfx.fireball();
    return;
  }
  let tx = p.x + p.dirX * 220;
  let ty = p.y + p.dirY * 220;
  if (aimsWithMouse(p)) {
    tx = mouse.x;
    ty = mouse.y;
  } else {
    const foes = livingFoes(currentRoom()).filter((enemy) => enemy.alpha > 0.3 && !enemy.friendly);
    if (foes.length) {
      const spot = { x: tx, y: ty };
      const target = foes.reduce((best, enemy) => (distance(enemy, spot) < distance(best, spot) ? enemy : best));
      tx = target.x;
      ty = target.y;
    }
  }
  tx = clamp(tx, TILE + 20, WIDTH - TILE - 20);
  ty = clamp(ty, TILE + 20, HEIGHT - TILE - 20);
  effects.push({ type: "meteor", x: tx, y: ty, radius: stats.boomRadius * 1.4, life: 0.6, max: 0.6, power: 1 });
  tone(1400, 0.55, { type: "sine", volume: 0.05, slide: -1100 });
  sfx.fireball();
}

function meteorImpact(m) {
  const foes = livingFoes(currentRoom()).filter((enemy) => Math.hypot(enemy.x - m.x, enemy.y - m.y) < m.radius);
  const target = foes.length ? foes.reduce((best, enemy) => (distance(enemy, m) < distance(best, m) ? enemy : best)) : null;
  burst(m.x, m.y, ["#5a3b1c", "#8a5f12", "#3a2516"], 20, 360, { gravity: 500, spin: true });
  addShake(10);
  const power = m.power || 1;
  explode(m.x, m.y, target, stats.fireDamage * spellPower() * 1.05 * power, 1.4, 1.15 * power);
}

function castFrostNova(p) {
  const room = currentRoom();
  const radius = stats.novaRadius;
  for (const enemy of livingFoes(room)) {
    if (Math.hypot(enemy.x - p.x, enemy.y - p.y) <= radius + enemy.size / 2) {
      enemy.slowUntil = state.clock + stats.novaSlow;
      // Ice puts out fire.
      enemy.burnUntil = 0;
      damageEnemy(enemy, stats.novaDamage * spellPower(), "frost");
    }
  }
  for (const projectile of projectiles) {
    if (projectile.owner === "enemy" && Math.hypot(projectile.x - p.x, projectile.y - p.y) < radius) {
      projectile.life = 0;
      burst(projectile.x, projectile.y, ["#ffffff", "#9be7ff"], 4, 90);
    }
  }
  // The nova leaves a frosty puddle behind for a few seconds (part of the Steam Blast combo).
  effects.push({ type: "frostfield", x: p.x, y: p.y, radius: radius * 0.7, life: 3.2, max: 3.2, seed: Math.random() * 10 });
  // Blizzard: a snowstorm that follows the caster around for a while.
  if (evoIs("frost", "blizzard")) {
    const life = stats.mega.frost ? 7 : 4;
    effects.push({ type: "blizzard", owner: p.index, x: p.x, y: p.y, radius: radius * (stats.mega.frost ? 1.4 : 1), life, max: life, tick: 0.25 });
  }
  // Glacier Spikes: ice spikes fly out in every direction.
  if (evoIs("frost", "glacier")) {
    const mega = Boolean(stats.mega.frost);
    const count = mega ? 24 : 12;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      projectiles.push({
        x: p.x + Math.cos(angle) * 20,
        y: p.y + Math.sin(angle) * 20,
        vx: Math.cos(angle) * 460,
        vy: Math.sin(angle) * 460,
        r: mega ? 10 : 8,
        damage: stats.novaDamage * 0.6 * spellPower() * (mega ? 1.3 : 1),
        life: 0.85,
        owner: "player",
        kind: "icicle",
        pierce: true,
        hits: new Set(),
        color: "#bdf1ff",
        spin: angle
      });
    }
  }
  addRing(p.x, p.y, radius, "#9be7ff", 0.45, 10);
  burst(p.x, p.y, ["#ffffff", "#9be7ff", "#d7f4ff"], 26, 300);
  sfx.nova();
}

// Uses the mouse to pick a target when player 1 is aiming with it.
function aimsWithMouse(p) {
  if (p.index !== 0) return false;
  if (touch.enabled && !mouse.touchAim) return false;
  return !state.twoPlayer || mouse.active > 0 || mouse.down;
}

function castLightning(p) {
  if (evoIs("lightning", "orb")) {
    castBallLightning(p);
    return true;
  }
  const room = currentRoom();
  const foes = livingFoes(room).filter((enemy) => enemy.alpha > 0.3);
  if (!foes.length) {
    toast("Nothing to zap here.", 1.2);
    sfx.nope();
    return false;
  }
  const aim = aimsWithMouse(p)
    ? { x: mouse.x, y: mouse.y }
    : { x: p.x + p.dirX * 200, y: p.y + p.dirY * 200 };
  let first = foes.reduce((best, enemy) => (distance(enemy, aim) < distance(best, aim) ? enemy : best));
  if (distance(first, p) > 560) first = foes.reduce((best, enemy) => (distance(enemy, p) < distance(best, p) ? enemy : best));

  const storm = evoIs("lightning", "storm");
  const superstorm = storm && Boolean(stats.mega.lightning);
  const chain = [first];
  let last = first;
  for (let jump = 0; jump < stats.chainJumps + (storm ? 3 : 0) + (superstorm ? 3 : 0); jump += 1) {
    const next = foes
      .filter((enemy) => !chain.includes(enemy) && distance(enemy, last) < (storm ? 320 : 230))
      .sort((a, b) => distance(a, last) - distance(b, last))[0];
    if (!next) break;
    chain.push(next);
    last = next;
  }

  const points = [{ x: p.x, y: p.y }, ...chain.map((enemy) => ({ x: enemy.x, y: enemy.y }))];
  effects.push({ type: "bolt", points, life: 0.3, max: 0.3 });
  let damage = stats.zapDamage * spellPower() * (storm ? 1.25 : 1);
  for (const enemy of chain) {
    zapHit(enemy, damage);
    damage *= 0.9;
  }
  // Thunderstorm: a moment later, thunder crashes down on everything the chain hit.
  if (storm) effects.push({ type: "storm", targets: chain.slice(), damage: stats.zapDamage * spellPower() * 0.8, life: 0.4, max: 0.4 });
  if (superstorm) effects.push({ type: "storm", targets: chain.slice(), damage: stats.zapDamage * spellPower() * 0.8, life: 0.85, max: 0.85 });
  addShake(4);
  sfx.zap();
  return true;
}

// One lightning hit, with the Shatter and Fireworks combos.
function castBallLightning(p) {
  const mega = Boolean(stats.mega.lightning);
  const base = aimAngle(p);
  const angles = mega ? [base - 0.3, base + 0.3] : [base];
  for (const angle of angles) {
    const life = mega ? 5 : 3.5;
    effects.push({
      type: "orb",
      x: p.x + Math.cos(angle) * 26,
      y: p.y + Math.sin(angle) * 26,
      vx: Math.cos(angle) * 150,
      vy: Math.sin(angle) * 150,
      radius: mega ? 22 : 17,
      reach: mega ? 190 : 170,
      targets: mega ? 3 : 2,
      life,
      max: life,
      tick: 0.1
    });
  }
  tone(220, 0.5, { type: "sawtooth", volume: 0.05, slide: 300 });
  sfx.zap();
}

function updateBallLightning(orb, dt) {
  orb.x += orb.vx * dt;
  orb.y += orb.vy * dt;
  if (orb.x < TILE + orb.radius || orb.x > WIDTH - TILE - orb.radius) orb.vx *= -1;
  if (orb.y < TILE + orb.radius || orb.y > HEIGHT - TILE - orb.radius) orb.vy *= -1;
  orb.x = clamp(orb.x, TILE + orb.radius, WIDTH - TILE - orb.radius);
  orb.y = clamp(orb.y, TILE + orb.radius, HEIGHT - TILE - orb.radius);
  orb.tick -= dt;
  if (orb.tick > 0) return;
  orb.tick = 0.3;
  const foes = livingFoes(currentRoom())
    .filter((enemy) => enemy.alpha > 0.3 && !enemy.friendly && Math.hypot(enemy.x - orb.x, enemy.y - orb.y) < orb.reach)
    .sort((a, b) => distance(a, orb) - distance(b, orb))
    .slice(0, orb.targets);
  for (const enemy of foes) {
    effects.push({ type: "bolt", points: [{ x: orb.x, y: orb.y }, { x: enemy.x, y: enemy.y }], life: 0.18, max: 0.18 });
    zapHit(enemy, stats.zapDamage * 0.45 * spellPower());
  }
  if (foes.length) noiseBurst(0.08, { volume: 0.05, freq: 5000 });
}

function ballLightningPop(orb) {
  addRing(orb.x, orb.y, orb.reach, "#ffe45c", 0.35, 8);
  burst(orb.x, orb.y, ["#ffe45c", "#ffffff"], 20, 260);
  for (const enemy of livingFoes(currentRoom())) {
    if (enemy.alpha > 0.3 && !enemy.friendly && Math.hypot(enemy.x - orb.x, enemy.y - orb.y) < orb.reach) zapHit(enemy, stats.zapDamage * 0.8 * spellPower());
  }
  sfx.zap();
}

function zapHit(enemy, damage) {
  burst(enemy.x, enemy.y, ["#ffe45c", "#ffffff"], 8, 180);
  if (isFrozen(enemy)) {
    shatter(enemy, damage);
  } else if (isBurning(enemy)) {
    damageEnemy(enemy, damage, "zap");
    fireworks(enemy);
  } else {
    damageEnemy(enemy, damage, "zap");
  }
}

function thunderStrike(s) {
  for (const enemy of s.targets) {
    if (enemy.hp <= 0 || enemy.friendly) continue;
    effects.push({ type: "bolt", points: [{ x: enemy.x + rand(-40, 40), y: TILE }, { x: enemy.x, y: enemy.y }], life: 0.3, max: 0.3 });
    zapHit(enemy, s.damage);
  }
  noiseBurst(0.4, { volume: 0.16, freq: 1800 });
  tone(90, 0.4, { type: "sawtooth", volume: 0.08, slide: -40 });
  addShake(8);
}

function castShield(p) {
  // Rainbow Fortress lasts longer and brings spinning orbs (see updateOrbs).
  const fortress = evoIs("shield", "fortress");
  const mega = Boolean(stats.mega.shield);
  p.shield = stats.shieldTime + (fortress ? 2 : 0) + (fortress && mega ? 2 : 0) + (evoIs("shield", "heal") ? 1 : 0);
  if (evoIs("shield", "heal")) {
    const partner = state.twoPlayer ? partnerOf(p) : null;
    if (mega && partner) {
      if (partner.hp <= 0 && Math.hypot(partner.x - p.x, partner.y - p.y) < 220) revivePlayer(partner, 0.4);
      if (partner.hp > 0) partner.shield = Math.max(partner.shield, p.shield);
    }
    effects.push({ type: "heal", owner: p.index, life: p.shield, max: p.shield, amount: (mega ? 0.7 : 0.4) * stats.maxHp, reach: mega ? 260 : 160 });
  }
  // The bubble pops out with a push that hurts and shoves nearby enemies.
  for (const enemy of livingFoes(currentRoom())) {
    const d = Math.hypot(enemy.x - p.x, enemy.y - p.y) || 1;
    if (d > 110 + enemy.size / 2) continue;
    damageEnemy(enemy, 30 * spellPower(), "zap");
    if (!enemy.isBoss) {
      enemy.x += ((enemy.x - p.x) / d) * 50;
      enemy.y += ((enemy.y - p.y) / d) * 50;
    }
  }
  addRing(p.x, p.y, 110, "#ff9ff3", 0.35, 8);
  burst(p.x, p.y, ["#ff9ff3", "#9be7ff", "#fef08a", "#a3e635"], 20, 220);
  sfx.shield();
}

/* ---------- spell combos ---------- */

function castPoison(p) {
  const spot = landingSpot(p, 240);
  const reach = Math.hypot(spot.x - p.x, spot.y - p.y);
  if (reach > 420) {
    spot.x = p.x + ((spot.x - p.x) / reach) * 420;
    spot.y = p.y + ((spot.y - p.y) / reach) * 420;
  }
  const mega = Boolean(stats.mega.poison);
  let radius = 80;
  let life = 4;
  let power = 1;
  let slow = false;
  if (evoIs("poison", "swamp")) {
    radius = mega ? 165 : 128;
    life = mega ? 9 : 7;
    power = mega ? 2 : 1;
    slow = true;
  }
  const flasks = [{ x: spot.x, y: spot.y, delay: 0 }];
  if (evoIs("poison", "cluster")) {
    flasks.length = 0;
    const count = mega ? 8 : 4;
    radius = 64;
    // Little potions overlap a lot, so each one is weaker and shorter.
    power = 0.45;
    life = 3;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const off = count === 8 && i % 2 ? 120 : 75;
      flasks.push({ x: spot.x + Math.cos(angle) * off, y: spot.y + Math.sin(angle) * off, delay: 0.05 * i });
    }
  }
  for (const f of flasks) {
    const flight = 0.55 + f.delay;
    effects.push({
      type: "flask",
      sx: p.x,
      sy: p.y - 10,
      x: clamp(f.x, TILE + 20, WIDTH - TILE - 20),
      y: clamp(f.y, TILE + 20, HEIGHT - TILE - 20),
      life: flight,
      max: flight,
      radius,
      duration: life,
      power,
      slow
    });
  }
  tone(500, 0.2, { type: "triangle", volume: 0.05, slide: 300 });
}

function flaskLand(f) {
  burst(f.x, f.y, ["#7bd35a", "#b5e86b", "#ffffff", "#3f6b2a"], 16, 220);
  addRing(f.x, f.y, f.radius, "#7bd35a", 0.3, 6);
  noiseBurst(0.18, { volume: 0.08, freq: 1500 });
  tone(260, 0.2, { type: "sine", volume: 0.05, slide: -120 });
  for (const enemy of livingFoes(currentRoom())) {
    if (Math.hypot(enemy.x - f.x, enemy.y - f.y) < f.radius + enemy.size / 2) damageEnemy(enemy, 25 * spellPower() * f.power, "poison");
  }
  effects.push({ type: "poison", x: f.x, y: f.y, radius: f.radius, life: f.duration, max: f.duration, tick: 0.25, power: f.power, slow: f.slow, seed: Math.random() * 10 });
}

function updatePoison(pool, dt) {
  pool.tick -= dt;
  if (pool.tick > 0) return;
  pool.tick = 0.25;
  for (const enemy of livingFoes(currentRoom())) {
    if (enemy.friendly || Math.hypot(enemy.x - pool.x, enemy.y - pool.y) > pool.radius + enemy.size / 2) continue;
    enemy.poisonUntil = state.clock + 0.6;
    // Swamp mud slows enemies without freezing them.
    if (pool.slow) enemy.stickyUntil = state.clock + 0.4;
    damageEnemy(enemy, 7 * spellPower() * pool.power, "poison");
  }
}

function inPoison(x, y) {
  return effects.some((e) => e.type === "poison" && e.life > 0.2 && Math.hypot(x - e.x, y - e.y) < e.radius);
}

function updateHealBubble(h, dt) {
  const owner = players[h.owner];
  const rate = (h.amount / h.max) * dt;
  for (const p of activePlayers()) {
    if (p.hp <= 0) continue;
    if (p !== owner && Math.hypot(p.x - owner.x, p.y - owner.y) > h.reach) continue;
    p.hp = Math.min(stats.maxHp, p.hp + rate);
    if (Math.random() < dt * 6) burst(p.x + rand(-12, 12), p.y - 10, ["#86efac", "#ffffff"], 1, 50, { heart: true });
  }
}

function isFrozen(enemy) {
  return state.clock < enemy.slowUntil;
}

function isBurning(enemy) {
  return state.clock < (enemy.burnUntil || 0);
}

function inFrostField(x, y) {
  return effects.some((e) => e.type === "frostfield" && Math.hypot(x - e.x, y - e.y) < e.radius);
}

function comboText(x, y, combo) {
  floatTexts.push({ x, y: y - 20, text: `${combo.name.toUpperCase()}!`, color: combo.color, size: 26, life: 1.4, max: 1.4 });
}

// The first time a combo happens it goes in the Combo Book, with a coin bonus.
function discoverCombo(id, x, y) {
  const combo = combos.find((c) => c.id === id);
  comboText(x, y, combo);
  if (state.combosFound.has(id)) return;
  state.combosFound.add(id);
  savePrefs();
  state.coins += COMBO_REWARD;
  floatText(x, y + 10, `+${COMBO_REWARD} coins`, "#f6c85f", 16);
  banner("New combo!", `${combo.name}: ${combo.recipe}`, combo.color, 3.2);
  sfx.chime();
}

/* Combos are strong, but bosses build up a resistance: every combo that hits
   a boss in the last 8 seconds shrinks the bonus of the next one. Normal
   enemies always take the full bonus. */
function comboBonus(enemy, bonus) {
  if (!enemy || !enemy.isBoss) return bonus;
  const recent = (enemy.comboHits || []).filter((t) => state.clock - t < 8).length;
  return 1 + (bonus - 1) / (1 + recent * 0.6);
}

function noteCombo(enemy) {
  if (!enemy || !enemy.isBoss) return;
  enemy.comboHits = (enemy.comboHits || []).filter((t) => state.clock - t < 8);
  enemy.comboHits.push(state.clock);
}

// Frozen enemy + Chain Lightning: the ice cracks for extra damage.
function shatter(enemy, damage) {
  enemy.slowUntil = 0;
  burst(enemy.x, enemy.y, ["#ffffff", "#9be7ff", "#d7f4ff", "#5fb7d9"], 22, 320, { spin: true, gravity: 380, sizeScale: 1.3 });
  addRing(enemy.x, enemy.y, enemy.size + 30, "#d7f4ff", 0.3, 6);
  tone(1900, 0.18, { type: "triangle", volume: 0.06, slide: -900 });
  noiseBurst(0.12, { volume: 0.1, freq: 7000 });
  discoverCombo("shatter", enemy.x, enemy.y - enemy.size / 2);
  damageEnemy(enemy, damage * comboBonus(enemy, 1.5), "frost");
  noteCombo(enemy);
}

// Burning enemy + Chain Lightning: a fireworks show that hits everything nearby.
function fireworks(enemy) {
  const x = enemy.x;
  const y = enemy.y;
  enemy.burnUntil = 0;
  confetti(x, y, 50);
  addRing(x, y, 90, "#ffd166", 0.4, 8);
  addRing(x, y, 60, "#ff9ff3", 0.3, 6);
  [784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.12, { type: "triangle", volume: 0.05, delay: i * 0.06 }));
  noiseBurst(0.25, { volume: 0.12, freq: 3000, delay: 0.1 });
  addShake(5);
  discoverCombo("fireworks", x, y - (enemy.size || 30) / 2);
  for (const foe of livingFoes(currentRoom())) {
    if (Math.hypot(foe.x - x, foe.y - y) > 90 + foe.size / 2) continue;
    damageEnemy(foe, 28 * spellPower() * comboBonus(foe, 2) / 2, "fire");
    noteCombo(foe);
  }
}

/* ---------- damage ---------- */

function damageEnemy(enemy, amount, source = "staff") {
  if (enemy.hp <= 0 || enemy.friendly || enemy.transforming) return;
  if (enemy.isBoss && !enemy.firstHit) enemy.firstHit = state.clock;
  // A gargoyle in stone form barely feels anything.
  if (enemy.stone) {
    amount *= 0.15;
    if (Math.random() < 0.3) floatText(enemy.x, enemy.y - enemy.size, "Ting!", "#c9c4d2", 13);
  }
  const damage = Math.max(1, Math.round(amount * (isStunned(enemy) ? 1.5 : 1)));
  enemy.hp -= damage;
  const burn = source === "burn";
  if (!burn) enemy.flash = 0.12;
  const color = source === "frost" ? "#bdf1ff" : source === "zap" ? "#ffe45c" : source === "fire" || burn ? "#ffb070" : source === "steam" ? "#e6f7ff" : source === "poison" ? "#a3e635" : "#ffffff";
  const small = burn || source === "poison";
  floatText(enemy.x + rand(-10, 10), enemy.y - enemy.size / 2 - 8, String(damage), color, small ? 12 : enemy.isBoss ? 18 : 15);
  if (!enemy.isBoss && !small) {
    const from = nearestPlayer(enemy.x, enemy.y);
    const away = Math.hypot(enemy.x - from.x, enemy.y - from.y) || 1;
    enemy.x += ((enemy.x - from.x) / away) * 5;
    enemy.y += ((enemy.y - from.y) / away) * 5;
  }
  if (!small) sfx.hit();
  if (enemy.behavior === "shard" && !small && enemy.hp > 0 && state.clock > (enemy.splinterAt || 0)) {
    enemy.splinterAt = state.clock + 0.8;
    shardSplinters(enemy, 6);
  }
  if (enemy.hp <= 0) defeatEnemy(enemy);
}

function defeatEnemy(enemy) {
  const room = currentRoom();
  if (enemy.isBoss) rememberBossFight(enemy);
  if (enemy.isBig && !enemy.phase2) {
    startPhase2(enemy, room);
    return;
  }
  enemy.hp = 0;
  state.enemiesDefeated += 1;

  if (enemy.isDragon) {
    befriendDragon(enemy);
    return;
  }

  burst(enemy.x, enemy.y, [enemy.type.color, enemy.type.accent, "#ffffff"], enemy.isBoss ? 40 : 16, enemy.isBoss ? 320 : 200);
  addRing(enemy.x, enemy.y, enemy.size, "#ffffff", 0.25, 5);
  sfx.poof();

  if (enemy.behavior === "shard") shardSplinters(enemy, 8);
  if (enemy.behavior === "ember") emberPop(enemy);
  if (enemy.behavior === "split" && !enemy.small && !enemy.isBoss) {
    for (const side of [-1, 1]) {
      const child = makeEnemy(enemy.typeIndex, enemy.x + side * 14, enemy.y, { tier: room.tier, small: true, temp: true });
      child.attackTimer = 0.6;
      room.enemies.push(child);
    }
  }

  if (enemy.isBig) {
    onBigBossDefeated(enemy);
  } else if (enemy.isBoss) {
    dropLoot(enemy.x, enemy.y, "gem", 8);
    dropLoot(enemy.x, enemy.y, "heart", 1);
    dropLoot(enemy.x, enemy.y, "star", 1);
    onBossDefeated(enemy);
  } else {
    const coins = enemy.temp ? (Math.random() < 0.5 ? 1 : 0) : 1 + (Math.random() < 0.4 ? 1 : 0);
    dropLoot(enemy.x, enemy.y, "coin", coins);
    if (Math.random() < 0.1 + stats.luck) dropLoot(enemy.x, enemy.y, "star", 1);
  }

  if (!room.cleared && isRoomCleared(room)) {
    room.cleared = true;
    if (!enemy.isBoss) {
      toast("Room cleared! Pick a door to explore.", 3);
      sfx.chime();
    }
  }
}

function onBossDefeated(boss) {
  const room = currentRoom();
  state.bossesDefeated = countBossesDefeated();
  const count = state.bossesDefeated;
  addShake(12);
  confetti(boss.x, boss.y, 70);
  sfx.fanfare();

  for (const projectile of projectiles) {
    if (projectile.owner === "enemy") {
      projectile.life = 0;
      burst(projectile.x, projectile.y, ["#f6c85f", "#ffffff"], 3, 80);
    }
  }

  banner("Boss defeated!", `${boss.name} went poof!`, "#9ee49c");
  unlockHat(boss.typeIndex + 1);
  if (room.cleared || isRoomCleared(room)) {
    room.cleared = true;
    toast("Room cleared! Pick a door to explore.", 3.5);
  } else {
    toast("Boss down! Clean up the last enemies.", 3);
  }

  if (count === 1 && !state.petUnlocked) {
    state.petUnlocked = true;
    state.petsOwned.add("pixel");
    state.petChoice = "pixel";
    pet = { x: boss.x, y: boss.y, timer: 1, face: 1, hop: 0 };
    burst(boss.x, boss.y, ["#fb923c", "#ffffff", "#ff9ff3"], 24, 240, { heart: true });
    banner("Surprise!", "Pixel the Fox wants to join your adventure!", "#fb923c", 3.4);
  }
  if (count === spells[2].unlockAt) banner("New spell!", "Chain Lightning unlocked. Press 3", "#ffe45c", 3);
  if (count === spells[3].unlockAt) banner("New spell!", "Bubble Shield unlocked. Press 4", "#ff9ff3", 3);
  if (count === spells[4].unlockAt) banner("New spell!", `Poison Potion unlocked. Press ${state.twoPlayer ? "5 (P2: -)" : "5"}`, "#7bd35a", 3);
  const row = Math.floor(room.index / ROOM_COLS);
  if (row < ROOM_ROWS && rowBossesBeaten(row) === ROOM_COLS && !state.bigBeaten.has(row)) {
    banner("A big gate opened!", `${bigBosses[row].name} waits at the end of row ${row + 1}`, "#c084fc", 3.6);
    toast(`Row ${row + 1} done! Find the big gate on the right side of Room ${rowEnd(row) + 1}.`, 4);
  }
  if (count === ROOM_COUNT) {
    state.portalOpen = true;
    banner("All 30 bosses defeated!", "A golden portal opened in Room 1...", "#f6c85f", 4);
  }

  state.upgradeTimer = 1.5;
  saveGame();
}

// Big bosses give a huge reward: lots of gems, a full heal, a hat,
// more max health, stronger spells and two power-ups to pick.
function startPhase2(boss, room) {
  const big = bigBosses[boss.row];
  boss.phase2 = true;
  boss.transforming = 1.6;
  boss.maxHp = bossMaxHp(room);
  boss.hp = boss.maxHp;
  boss.name = PHASE2_NAMES[boss.row] || `${big.name} Reborn`;
  boss.enraged = true;
  boss.furious = false;
  boss.state = "move";
  boss.spiralTime = 0;
  boss.alpha = 1;
  boss.hop = 0;
  boss.stunUntil = 0;
  // Phase two draws a giant sword: slash combos and stabs join the old attacks.
  const ranged = [...boss.patterns, big.rage];
  boss.patterns = [];
  ranged.forEach((pattern, i) => {
    boss.patterns.push(pattern);
    if (i % 2 === 0) boss.patterns.push(i % 4 === 0 ? "combo" : "thrust");
  });
  boss.patterns.push("retreat");
  boss.patternIndex = 0;
  boss.melee = true;
  boss.swordAngle = Math.PI / 2;
  boss.swingSide = 1;
  boss.swings = null;
  boss.speed *= 1.2;
  boss.attackTimer = 2.4;
  for (const projectile of projectiles) {
    if (projectile.owner === "enemy") projectile.life = 0;
  }
  state.slowmo = 0.7;
  addShake(10);
  sfx.roar();
  banners.length = 0;
  banner(boss.name, "Phase two! It's not over yet!", "#ff5a3d", 3);
  toast(big.rageLine, 2.6);
}

function startLastStand(boss, room) {
  boss.desperate = true;
  boss.speed *= 1.15;
  boss.rainTimer = 1.2;
  state.slowmo = 0.6;
  addShake(12);
  sfx.roar();
  addRing(boss.x, boss.y, 240, "#ff5a3d", 0.7, 14);
  banners.length = 0;
  banner("LAST STAND!", `${boss.isDragon ? "Blocky" : boss.name} is giving it everything!`, "#ff5a3d", 3);
  // Two tough helpers join the fight.
  for (let i = 0; i < 2; i += 1) {
    const type = boss.isDragon ? Math.floor(Math.random() * BOSS_TYPE_COUNT) : boss.minionType;
    const angle = Math.random() * Math.PI * 2;
    const minion = makeEnemy(type, boss.x + Math.cos(angle) * 80, boss.y + Math.sin(angle) * 80, { tier: Math.min(room.tier, 25), temp: true });
    minion.maxHp = Math.round(minion.maxHp * 1.5);
    minion.hp = minion.maxHp;
    minion.attackTimer = 1.2;
    room.enemies.push(minion);
    burst(minion.x, minion.y, [minion.type.color, "#ffffff"], 10, 140);
  }
}

// Things crash down around (and ahead of) every wizard. Red circles show where.
function lastStandRain(boss) {
  const color = boss.shotColor || "#ff9b3d";
  const spots = [];
  for (const p of livingPlayers()) {
    spots.push(leadPoint(p, 0.6));
    spots.push({ x: p.x + rand(-90, 90), y: p.y + rand(-90, 90) });
  }
  spots.push({ x: rand(TILE + 60, WIDTH - TILE - 60), y: rand(TILE + 60, HEIGHT - TILE - 60) });
  spots.forEach((spot, i) => {
    const life = 1.1 + i * 0.12;
    effects.push({ type: "hazard", x: clamp(spot.x, TILE + 30, WIDTH - TILE - 30), y: clamp(spot.y, TILE + 30, HEIGHT - TILE - 30), radius: 50, life, max: life, damage: boss.damage * 0.8, color, row: boss.isDragon ? 1 : boss.row });
  });
  sfx.rumble();
}

function updateTransform(boss, dt) {
  boss.transforming -= dt;
  boss.wobble += dt * 6;
  if (Math.random() < dt * 30) burst(boss.x + rand(-40, 40), boss.y + rand(-50, 30), [boss.shotColor, "#ffffff", "#ff5a3d"], 2, 160, { lift: 80 });
  state.shake = Math.max(state.shake, 3);
  if (boss.transforming <= 0) {
    boss.transforming = 0;
    addRing(boss.x, boss.y, 220, boss.shotColor, 0.6, 12);
    addShake(12);
    sfx.roar();
  }
}

function onBigBossDefeated(boss) {
  const room = currentRoom();
  const big = bigBosses[boss.row];
  state.bigBeaten.add(boss.row);
  for (const enemy of room.enemies) {
    if (enemy.hp > 0) {
      enemy.hp = 0;
      burst(enemy.x, enemy.y, [enemy.type.color, "#ffffff"], 12, 180);
    }
  }
  for (const projectile of projectiles) {
    if (projectile.owner === "enemy") projectile.life = 0;
  }
  for (let i = effects.length - 1; i >= 0; i -= 1) {
    if (effects[i].type === "hazard") effects.splice(i, 1);
  }
  room.cleared = true;
  boss.hop = 0;

  addShake(18);
  burst(boss.x, boss.y, [big.color, big.accent, "#ffffff", "#f6c85f"], 60, 380);
  confetti(boss.x, boss.y, 120);
  confetti(WIDTH * 0.25, 120, 50);
  confetti(WIDTH * 0.75, 120, 50);
  addRing(boss.x, boss.y, 220, "#f6c85f", 0.6, 10);
  sfx.slam();
  sfx.bigWin();

  dropLoot(boss.x, boss.y, "gem", 10);
  dropLoot(boss.x, boss.y, "heart", 2);
  dropLoot(boss.x, boss.y, "star", 2);
  stats.maxHp += BIG_HP_BONUS;
  for (const p of activePlayers()) {
    if (p.hp <= 0) revivePlayer(p, 1);
    p.hp = stats.maxHp;
    p.mana = stats.maxMana;
    burst(p.x, p.y, ["#ef5b4b", "#ffffff"], 14, 180, { heart: true });
  }

  banner("BIG BOSS DEFEATED!", `${big.name} is beaten! +${BIG_HP_BONUS} max HP and +10% spell power`, "#f6c85f", 4.2);
  unlockHat(BIG_HAT + boss.row);
  toast("Huge reward! Full heal, a pile of gems and 2 power-ups to pick.", 4);
  state.picksLeft = 2;
  state.upgradeTimer = 2.2;
  saveGame();
}

function befriendDragon(dragon) {
  const room = currentRoom();
  dragon.friendly = true;
  dragon.state = "move";
  dragon.spiralTime = 0;
  state.won = true;
  for (const enemy of room.enemies) {
    if (enemy.hp > 0) {
      enemy.hp = 0;
      burst(enemy.x, enemy.y, [enemy.type.color, "#ffffff"], 12, 180);
    }
  }
  projectiles.length = 0;
  confetti(dragon.x, dragon.y, 140);
  burst(dragon.x, dragon.y, ["#ff9ff3", "#ef5b4b"], 20, 220, { heart: true, lifeScale: 2 });
  addShake(14);
  sfx.fanfare();
  banner("You did it!", "Blocky the Dragon just wanted a friend!", "#ff9ff3", 4);
  unlockHat(DRAGON_HAT);
  for (const p of activePlayers()) {
    if (p.hp <= 0) revivePlayer(p, 0.5);
  }
  state.victoryTimer = 4.2;
  writeStorage(SAVE_KEY, null);
  state.hasSave = false;
}

/* Elden Ring style defence:
   - Dash through a hit in the first moment of a dash for a perfect dodge.
   - Hold block (F) to take 80% less damage for stamina; run out and your guard breaks.
   - Tap block just before a hit lands to parry: no damage, and the attacker is stunned.
   Returns what happened: false, "dodge", "shield", "parry", "block" or "hit". */
const PARRY_WINDOW = 0.16;

function hurtPlayer(p, amount, fromX, fromY, attacker = null) {
  if (state.mode !== "playing" || p.hp <= 0 || state.won) return false;
  if (p.dashTime > 0 && !p.perfectDone && state.time - p.dashStart < 0.22) {
    perfectDodge(p);
    return "dodge";
  }
  if (p.invulnerable > 0) return false;
  if (p.shield > 0) {
    addRing(p.x, p.y, 40, "#ff9ff3", 0.25, 6);
    sfx.bubble();
    p.invulnerable = 0.2;
    return "shield";
  }
  let blocked = false;
  if (p.blocking) {
    if (!p.parryUsed && state.time - p.blockStart <= PARRY_WINDOW) {
      parry(p, attacker);
      return "parry";
    }
    const cost = Math.max(12, amount * 1.6);
    if (p.stamina >= cost) {
      p.stamina -= cost;
      p.staminaWait = 0.7;
      amount *= 0.2;
      blocked = true;
      burst(p.x + p.dirX * 18, p.y - 6 + p.dirY * 18, ["#ffffff", "#9be7ff"], 8, 160);
      sfx.block();
    } else {
      p.stamina = 0;
      p.staminaWait = 1;
      p.blocking = false;
      p.stun = 0.8;
      floatText(p.x, p.y - 46, "Guard broken!", "#ff8b7d", 16);
      noiseBurst(0.25, { volume: 0.12, freq: 900 });
    }
  }
  const damage = Math.max(1, Math.round(amount - stats.armor));
  p.hp = Math.max(0, p.hp - damage);
  p.invulnerable = blocked ? 0.35 : 0.7;
  state.hurtFlash = 0.3;
  addShake(7);
  floatText(p.x, p.y - 30, `-${damage}`, "#ff8b7d", 18);
  sfx.hurt();
  if (fromX !== undefined) {
    const length = Math.hypot(p.x - fromX, p.y - fromY) || 1;
    const push = blocked ? 120 : 260;
    p.kx = ((p.x - fromX) / length) * push;
    p.ky = ((p.y - fromY) / length) * push;
  }
  if (p.hp > 0) return blocked ? "block" : "hit";

  burst(p.x, p.y, [robeOf(p).robe, "#ffffff"], 24, 220);
  if (livingPlayers().length) {
    // In two-player mode a bonked wizard turns into a little ghost until a friend helps.
    p.downTimer = AUTO_REVIVE;
    p.revive = 0;
    p.shield = 0;
    p.dashTime = 0;
    toast(`P${p.index + 1} got bonked! P${2 - p.index}, stand next to them to help them up.`, 3.5);
    tone(392, 0.2, { type: "triangle", volume: 0.06 });
    tone(311, 0.3, { type: "triangle", volume: 0.06, delay: 0.16 });
    return "hit";
  }
  // Your coins drop where you fell. Get back there to pick them up, or they are
  // gone for good if you fall again first.
  state.lastLost = state.coins;
  state.lostCoins = state.coins > 0 ? { room: state.roomIndex, x: p.x, y: p.y, amount: state.coins } : null;
  state.coins = 0;
  state.mode = "dead";
  mouse.down = false;
  touch.fire = false;
  touch.block = false;
  sfx.sad();
  saveGame();
  return "hit";
}

function perfectDodge(p) {
  p.perfectDone = true;
  state.slowmo = 0.8;
  p.mana = Math.min(stats.maxMana, p.mana + 25);
  p.stamina = Math.min(stats.maxStamina, p.stamina + 30);
  floatText(p.x, p.y - 44, "Perfect dodge!", "#9be7ff", 18);
  addRing(p.x, p.y, 50, "#9be7ff", 0.35, 5);
  tone(1200, 0.25, { type: "sine", volume: 0.06, slide: 600 });
}

function parry(p, attacker) {
  p.parryUsed = true;
  p.invulnerable = 0.45;
  p.stamina = Math.min(stats.maxStamina, p.stamina + 30);
  state.slowmo = 0.5;
  floatText(p.x, p.y - 46, "PARRY!", "#f6c85f", 22);
  addRing(p.x, p.y, 60, "#f6c85f", 0.3, 8);
  burst(p.x, p.y, ["#f6c85f", "#ffffff"], 18, 260);
  addShake(5);
  sfx.parry();
  if (attacker && attacker.hp > 0 && !attacker.friendly && attacker.size) {
    stunEnemy(attacker, attacker.isBoss ? 1.3 : 2.2);
    damageEnemy(attacker, 25 * spellPower(), "staff");
  }
}

// Stunned enemies stop, see stars and take 50% more damage.
function stunEnemy(enemy, seconds) {
  // Final bosses shake off a stun quickly.
  if (isFinal(enemy)) seconds = Math.min(seconds, 0.7);
  enemy.stunUntil = state.clock + seconds;
  enemy.spiralTime = 0;
  enemy.swings = null;
  if (enemy.state !== "leap") enemy.state = "move";
  enemy.alpha = 1;
}

function isStunned(enemy) {
  return state.clock < (enemy.stunUntil || 0);
}

function blockHeld(p) {
  if (p.index === 0) return held("KeyF", "f") || touch.block;
  return codes.has("Period") || codes.has("NumpadDecimal");
}

function updateGuard(p) {
  const want = blockHeld(p) && p.stun <= 0 && p.dashTime <= 0 && p.drinking <= 0;
  if (want && !p.blocking) {
    p.blocking = true;
    p.blockStart = state.time;
    // Mashing block doesn't work: a fresh press soon after the last one has no parry.
    p.parryUsed = state.time - p.lastBlockPress < 0.45;
    p.lastBlockPress = state.time;
    state.habits.parry += 1;
  } else if (!want) {
    p.blocking = false;
  }
}

function drinkFlask(p) {
  if (state.mode !== "playing" || p.hp <= 0 || p.drinking > 0 || p.stun > 0) return;
  if (p.index === 1 && !state.twoPlayer) return;
  if (p.flasks <= 0) {
    toast("No flasks left! Rest at a campfire to refill them.", 2.2);
    sfx.nope();
    return;
  }
  if (p.hp >= stats.maxHp) {
    toast("Already at full health.", 1.2);
    return;
  }
  p.flasks -= 1;
  p.drinking = 0.7;
  p.blocking = false;
  [330, 392, 440].forEach((f, i) => tone(f, 0.12, { type: "sine", volume: 0.05, delay: i * 0.15 }));
}

function finishDrink(p) {
  const heal = Math.round(stats.maxHp * 0.45);
  p.hp = Math.min(stats.maxHp, p.hp + heal);
  floatText(p.x, p.y - 40, `+${heal} HP`, "#ff8b7d", 16);
  burst(p.x, p.y, ["#ef5b4b", "#ffffff"], 12, 160, { heart: true });
  sfx.heal();
}

/* ---------- campfires and lost coins ---------- */

// The first room of every row has a campfire. Resting there (with no enemies
// around) heals you, refills flasks and makes it the place you wake up.
const CAMPFIRE = { x: 190, y: 150 };

function hasCampfire(room) {
  return !room.final && !room.arena && room.index % ROOM_COLS === 0;
}

function updateCampfire(p) {
  const room = currentRoom();
  if (!hasCampfire(room)) return;
  const near = Math.hypot(p.x - CAMPFIRE.x, p.y - CAMPFIRE.y) < 44;
  if (!near) {
    p.restedHere = false;
    return;
  }
  if (p.restedHere) return;
  if (livingFoes(room).some((enemy) => !enemy.friendly)) {
    if (state.time > p.fireWarn) {
      toast("You can't rest with enemies around!", 1.8);
      p.fireWarn = state.time + 3;
    }
    return;
  }
  restAtCampfire(room);
}

function restAtCampfire(room) {
  for (const p of activePlayers()) {
    if (p.hp <= 0) revivePlayer(p, 1);
    p.hp = stats.maxHp;
    p.mana = stats.maxMana;
    p.stamina = stats.maxStamina;
    p.flasks = stats.maxFlasks;
    p.restedHere = true;
  }
  state.checkpoint = room.index;
  burst(CAMPFIRE.x, CAMPFIRE.y - 10, ["#ffd166", "#ff742e", "#ffffff"], 24, 200, { lift: 60 });
  sfx.chime();
  toast("Rested at the campfire. Flasks refilled, and you'll wake up here.", 3);
  saveGame();
}

function updateLostCoins(p) {
  const lost = state.lostCoins;
  if (!lost || lost.room !== state.roomIndex) return;
  if (Math.hypot(p.x - lost.x, p.y - lost.y) > 30) return;
  state.coins += lost.amount;
  state.lostCoins = null;
  floatText(lost.x, lost.y - 30, `+${lost.amount} coins`, "#f6c85f", 20);
  burst(lost.x, lost.y, ["#f6c85f", "#fff3b0"], 30, 240);
  banner("Coins recovered!", `You got your ${lost.amount} coins back`, "#f6c85f", 2.6);
  sfx.fanfare();
  saveGame();
}

// Wakes the team up at the last campfire. The boss of the room you fell in
// heals back up, Elden Ring style.
function resetBoss(room) {
  if (!room.boss || room.boss.hp <= 0 || room.boss.friendly) return;
  if (room.arena) room.boss = makeBigBoss(room.row, room.tier);
  else if (room.final) room.boss = makeDragon();
  else {
    Object.assign(room.boss, { hp: room.boss.maxHp, enraged: false, furious: false, state: "move", spiralTime: 0, stunUntil: 0, alpha: 1, hop: 0, swings: null });
    room.boss.patternIndex = 0;
  }
  room.enemies = room.enemies.filter((enemy) => !enemy.temp);
}

function restartInRoom() {
  resetBoss(currentRoom());
  for (const p of activePlayers()) {
    p.hp = stats.maxHp;
    p.mana = stats.maxMana;
    p.stamina = stats.maxStamina;
    p.flasks = stats.maxFlasks;
    p.invulnerable = 2;
    p.revive = 0;
    p.downTimer = 0;
    p.stun = 0;
    p.drinking = 0;
    p.blocking = false;
    p.restedHere = true;
  }
  projectiles.length = 0;
  effects.length = 0;
  state.mode = "playing";
  state.slowmo = 0;
  const spot = { x: CAMPFIRE.x + 70, y: CAMPFIRE.y + 50 };
  placePlayers(spot.x, spot.y);
  enterRoom(state.checkpoint, spot, true);
  toast(state.lostCoins ? `You woke up at the campfire. Your ${state.lostCoins.amount} coins are waiting where you fell!` : "You woke up at the campfire. Try a different plan!", 3.5);
  sfx.heal();
}

/* ---------- loot ---------- */

function dropLoot(x, y, kind, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = rand(60, 190);
    pickups.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      kind,
      value: kind === "gem" ? 5 : 1,
      t: 0
    });
  }
}

function collectPickup(item, p) {
  if (item.kind === "coin" || item.kind === "gem") {
    state.coins += item.value;
    state.coinStreak = state.coinStreakTimer > 0 ? state.coinStreak + 1 : 0;
    state.coinStreakTimer = 0.6;
    sfx.coin(state.coinStreak);
    floatText(item.x, item.y - 8, `+${item.value}`, "#f6c85f", 14);
  } else if (item.kind === "heart") {
    p.hp = Math.min(stats.maxHp, p.hp + 25);
    floatText(item.x, item.y - 8, "+25 HP", "#ff8b7d", 15);
    burst(p.x, p.y, ["#ef5b4b", "#ffffff"], 8, 120, { heart: true });
    sfx.heal();
  } else if (item.kind === "star") {
    p.mana = Math.min(stats.maxMana, p.mana + 30);
    floatText(item.x, item.y - 8, "+30 Mana", "#9ed4ff", 15);
    sfx.heal();
  }
}

/* ---------- upgrades ---------- */

function openUpgrade() {
  const choices = rollUpgrades();
  if (!choices.length) return;
  state.upgradeChoices = choices;
  state.mode = "upgrade";
  mouse.down = false;
  touch.fire = false;
  sfx.chime();
}

function rollUpgrades() {
  const eligible = upgrades.filter((upgrade) => (state.upgradeCounts[upgrade.id] || 0) < upgrade.max && (!upgrade.requires || upgrade.requires()));
  // When an evolution is ready, all the paths for one thing show up together
  // so you can choose; any empty spots get normal power-ups.
  const evos = eligible.filter((upgrade) => upgrade.evo);
  if (!evos.length) return shuffle(eligible).slice(0, 3);
  const group = pick([...new Set(evos.map((upgrade) => upgrade.group))]);
  const paths = evos.filter((upgrade) => upgrade.group === group).slice(0, 3);
  const rest = shuffle(eligible.filter((upgrade) => !upgrade.evo)).slice(0, 3 - paths.length);
  return [...paths, ...rest];
}

function rerollUpgrades() {
  if (state.coins < state.rerollCost) {
    sfx.nope();
    return;
  }
  state.coins -= state.rerollCost;
  state.rerollCost += 5;
  state.upgradeChoices = rollUpgrades();
  sfx.pick();
}

function chooseUpgrade(index) {
  const upgrade = state.upgradeChoices[index];
  if (!upgrade) return;
  upgrade.apply();
  state.upgradeCounts[upgrade.id] = (state.upgradeCounts[upgrade.id] || 0) + 1;
  state.upgradesVersion += 1;
  state.upgradeChoices = [];
  state.mode = "playing";
  for (const p of livingPlayers()) {
    p.invulnerable = Math.max(p.invulnerable, 1);
    burst(p.x, p.y, [upgrade.color, "#ffffff"], 24, 240);
  }
  if (upgrade.evo) {
    banner("Evolution!", `${upgrade.from} became ${upgrade.name}!`, upgrade.color, 3.2);
    for (const p of livingPlayers()) confetti(p.x, p.y - 20, 40);
    sfx.fanfare();
    toast(upgrade.desc, 3.5);
  } else {
    toast(`${upgrade.name}! ${upgrade.desc}.`, 3);
    sfx.pick();
  }
  // Big bosses let you pick twice.
  if (state.picksLeft > 1) {
    state.picksLeft -= 1;
    const next = rollUpgrades();
    if (next.length) {
      state.upgradeChoices = next;
      state.mode = "upgrade";
    } else {
      state.picksLeft = 0;
    }
  } else {
    state.picksLeft = 0;
  }
  saveGame();
}

/* ---------- update ---------- */

function held(code, key) {
  return codes.has(code) || (key !== undefined && keys.has(key));
}

function movementInput(p = player) {
  let x = 0;
  let y = 0;
  const two = state.twoPlayer;
  if (p.index === 0) {
    const arrows = !two;
    if (held("KeyA", "a") || (arrows && held("ArrowLeft", "arrowleft"))) x -= 1;
    if (held("KeyD", "d") || (arrows && held("ArrowRight", "arrowright"))) x += 1;
    if (held("KeyW", "w") || (arrows && held("ArrowUp", "arrowup"))) y -= 1;
    if (held("KeyS", "s") || (arrows && held("ArrowDown", "arrowdown"))) y += 1;
    x += touch.moveX;
    y += touch.moveY;
  } else {
    if (held("ArrowLeft", "arrowleft") || codes.has("KeyJ")) x -= 1;
    if (held("ArrowRight", "arrowright") || codes.has("KeyL")) x += 1;
    if (held("ArrowUp", "arrowup") || codes.has("KeyI")) y -= 1;
    if (held("ArrowDown", "arrowdown") || codes.has("KeyK")) y += 1;
  }
  const length = Math.hypot(x, y);
  if (length > 1) {
    x /= length;
    y /= length;
  }
  return { x, y };
}

function update(dt) {
  state.anim += dt;
  updateMusic();
  updateParticles(dt);
  updateBanners(dt);
  state.shake = Math.max(0, state.shake - dt * 30);
  state.fade = Math.max(0, state.fade - dt * 3);
  state.hurtFlash = Math.max(0, state.hurtFlash - dt);

  if (state.mode === "title") {
    updateAmbient(dt);
    return;
  }
  if (state.mode === "victory") {
    if (Math.random() < dt * 3) confetti(rand(100, WIDTH - 100), rand(60, 200), 18);
    return;
  }
  if (state.mode === "intro") {
    updateAmbient(dt);
    updateIntro(dt);
    return;
  }
  if (state.mode !== "playing") return;

  // Perfect dodges and parries slow the world down for a moment.
  const worldDt = state.slowmo > 0 ? dt * 0.35 : dt;
  state.slowmo = Math.max(0, state.slowmo - dt);
  // Bosses remember what you did lately; old habits fade after about half a minute.
  const fade = Math.exp(-dt / 25);
  state.habits.parry *= fade;
  state.habits.dash *= fade;
  state.time += dt;
  state.clock += worldDt;
  if (state.messageTimer > 0) state.messageTimer -= dt;
  state.coinStreakTimer = Math.max(0, state.coinStreakTimer - dt);

  mouse.active = Math.max(0, mouse.active - dt);
  for (const p of activePlayers()) {
    if (updatePlayer(p, dt)) break;
  }
  if (state.mode !== "playing") return;
  updatePet(worldDt);
  updateFoes(worldDt);
  updateProjectiles(worldDt);
  updatePickups(dt);
  updateEffects(worldDt);
  updateAmbient(dt);
  updateFloatTexts(dt);

  for (const p of activePlayers()) {
    if (p.hp > 0) p.mana = Math.min(stats.maxMana, p.mana + stats.manaRegen * dt);
    p.shotCooldown = Math.max(0, p.shotCooldown - dt);
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.shield = Math.max(0, p.shield - dt);
    for (const id of Object.keys(p.cooldowns)) p.cooldowns[id] = Math.max(0, p.cooldowns[id] - dt);
    p.stun = Math.max(0, p.stun - dt);
    p.staminaWait = Math.max(0, p.staminaWait - dt);
    if (p.staminaWait <= 0 && !p.blocking && p.dashTime <= 0) p.stamina = Math.min(stats.maxStamina, p.stamina + stats.staminaRegen * dt);
    if (p.drinking > 0) {
      p.drinking -= dt;
      if (p.drinking <= 0 && p.hp > 0) finishDrink(p);
    }
    if (p.hp > 0 && !p.blocking && p.stun <= 0 && p.drinking <= 0 && wantsToFire(p)) shootStaff(p);
    updateOrbs(p);
  }

  if (state.upgradeTimer > 0) {
    state.upgradeTimer -= dt;
    if (state.upgradeTimer <= 0) openUpgrade();
  }

  if (state.victoryTimer > 0) {
    state.victoryTimer -= dt;
    if (state.victoryTimer <= 0) state.mode = "victory";
  }
}

/* ---------- big boss intro ---------- */

// The big boss drops into its arena, roars and gets a name card.
// Gameplay waits until the intro ends; Space, Enter or a click skips it.
function startIntro(room) {
  const boss = room.boss;
  state.intro = { time: 0, max: 3.6, boss, row: room.row, landed: false, roared: false };
  state.mode = "intro";
  boss.hop = 560;
  boss.state = "move";
  mouse.down = false;
  touch.fire = false;
  sfx.rumble();
}

function updateIntro(dt) {
  const intro = state.intro;
  if (!intro) {
    state.mode = "playing";
    return;
  }
  const boss = intro.boss;
  intro.time += dt;
  const fall = clamp((intro.time - 0.6) / 0.55, 0, 1);
  boss.hop = (1 - fall * fall) * 560;
  boss.wobble += dt;
  if (fall >= 1 && !intro.landed) landBigBoss(intro);
  if (intro.time > 1.5 && !intro.roared) {
    intro.roared = true;
    sfx.roar();
    addShake(9);
    addRing(boss.x, boss.y, 160, boss.shotColor, 0.5, 8);
  }
  if (Math.random() < dt * 12) ambientDust(boss);
  if (intro.time >= intro.max) endIntro();
}

function ambientDust(boss) {
  burst(rand(TILE, WIDTH - TILE), rand(TILE, TILE + 40), [boss.type.accent, "rgba(255,255,255,0.5)"], 1, 40);
}

function landBigBoss(intro) {
  const boss = intro.boss;
  intro.landed = true;
  boss.hop = 0;
  addShake(16);
  addRing(boss.x, boss.y + boss.size * 0.3, 140, "#ffffff", 0.45, 10);
  burst(boss.x, boss.y + boss.size / 2, [boss.type.color, boss.type.accent, "#ffffff"], 34, 320);
  sfx.slam();
}

function endIntro() {
  const intro = state.intro;
  if (!intro) return;
  if (!intro.landed) landBigBoss(intro);
  state.intro = null;
  state.mode = "playing";
  intro.boss.attackTimer = 1.4;
  for (const p of activePlayers()) p.invulnerable = Math.max(p.invulnerable, 1);
  toast(`Beat ${intro.boss.name} for a huge reward!`, 3);
}

// Player 2's staff fires by itself whenever an enemy is in range.
function wantsToFire(p) {
  if (p.index === 0) return mouse.down || held("Space", " ") || touch.fire;
  const foes = livingFoes(currentRoom()).filter((enemy) => enemy.alpha > 0.3 && !enemy.friendly);
  return foes.some((enemy) => distance(enemy, p) < 520);
}

// Returns true when the wizard walked through a door and the room changed.
function updatePlayer(p, dt) {
  if (p.hp <= 0) {
    updateGhost(p, dt);
    return false;
  }
  updateGuard(p);
  const move = movementInput(p);
  let vx;
  let vy;
  if (p.dashTime > 0) {
    p.dashTime -= dt;
    vx = p.dashX * stats.speed * 3.2;
    vy = p.dashY * stats.speed * 3.2;
    if (Math.random() < 0.8) {
      const color = stats.dash === "normal" ? robeOf(p).robe : pick([dashColor(), "#ffffff"]);
      particles.push({ x: p.x + rand(-8, 8), y: p.y + rand(-8, 12), vx: 0, vy: 0, life: 0.3, max: 0.3, size: 8, color, gravity: 0, drag: 1, spin: 0, angle: 0 });
    }
    if (p.dashHits) updateDashPower(p);
    if (p.dashTime <= 0) finishDash(p);
  } else {
    // Blocking and drinking slow you down; a broken guard leaves you stuck for a moment.
    const pace = p.stun > 0 ? 0 : p.drinking > 0 ? 0.4 : p.blocking ? 0.45 : 1;
    vx = move.x * stats.speed * pace;
    vy = move.y * stats.speed * pace;
  }
  vx += p.kx;
  vy += p.ky;
  p.velX = vx;
  p.velY = vy;
  const decay = Math.pow(0.0005, dt);
  p.kx *= decay;
  p.ky *= decay;
  p.moving = Math.hypot(move.x, move.y) > 0.1 || p.dashTime > 0;

  moveWithWalls(p, p.r, vx * dt, vy * dt, true);
  pushOutOfCrates(p, p.r);

  if (p.x < -p.r) return changeRoom(-1, 0, p) || true;
  if (p.x > WIDTH + p.r) return changeRoom(1, 0, p) || true;
  if (p.y < -p.r) return changeRoom(0, -1, p) || true;
  if (p.y > HEIGHT + p.r) return changeRoom(0, 1, p) || true;

  updateAim(p, move);

  updateCampfire(p);
  updateLostCoins(p);
  const room = currentRoom();
  if (room.index === 0 && state.portalOpen && !state.won && Math.hypot(p.x - WIDTH / 2, p.y - HEIGHT / 2) < 34) {
    enterDragonRoom();
    return true;
  }
  return false;
}

// A bonked wizard floats around slowly. Standing next to them fills a ring that
// brings them back; if nobody helps, they pop back up on their own after a while.
function updateGhost(p, dt) {
  const move = movementInput(p);
  p.moving = Math.hypot(move.x, move.y) > 0.1;
  p.kx = 0;
  p.ky = 0;
  moveWithWalls(p, p.r, move.x * stats.speed * 0.45 * dt, move.y * stats.speed * 0.45 * dt, false);
  const helper = partnerOf(p);
  const helping = helper.hp > 0 && distance(helper, p) < 58;
  p.revive = helping ? p.revive + dt : Math.max(0, p.revive - dt * 0.5);
  p.downTimer -= dt;
  if (helping && Math.random() < dt * 10) burst(p.x + rand(-14, 14), p.y + rand(-20, 6), ["#ff9ff3", "#ef5b4b"], 1, 50, { heart: true, lift: 40 });
  if (p.revive >= REVIVE_TIME) revivePlayer(p, 0.5);
  else if (p.downTimer <= 0) revivePlayer(p, 0.3);
}

function aimAt(p, x, y) {
  const dx = x - p.x;
  const dy = y - p.y;
  const length = Math.hypot(dx, dy);
  if (length > 2) {
    p.dirX = dx / length;
    p.dirY = dy / length;
  }
}

// Points the staff at the closest enemy, or the way the wizard walks if the room is empty.
function autoAim(p, move) {
  const foes = livingFoes(currentRoom()).filter((enemy) => enemy.alpha > 0.3 && !enemy.friendly);
  if (foes.length) {
    const target = foes.reduce((best, enemy) => (distance(enemy, p) < distance(best, p) ? enemy : best));
    aimAt(p, target.x, target.y);
    return;
  }
  if (Math.hypot(move.x, move.y) > 0.2) {
    const length = Math.hypot(move.x, move.y);
    p.dirX = move.x / length;
    p.dirY = move.y / length;
  }
}

function updateAim(p, move) {
  if (p.index === 1) {
    autoAim(p, move);
    return;
  }
  if (touch.enabled && !(mouse.down && mouse.touchAim)) {
    autoAim(p, move);
    return;
  }
  if (state.twoPlayer && !aimsWithMouse(p)) {
    autoAim(p, move);
    return;
  }
  aimAt(p, mouse.x, mouse.y);
}

// Valid spots are the room floor plus a corridor through each open doorway.
function positionValid(x, y, r, doors) {
  if (x >= TILE + r && x <= WIDTH - TILE - r && y >= TILE + r && y <= HEIGHT - TILE - r) return true;
  const inSideGap = Math.abs(y - HEIGHT / 2) <= DOOR_HALF - r;
  const inTopGap = Math.abs(x - WIDTH / 2) <= DOOR_HALF - r;
  if (inSideGap && x < TILE + r && doors.left && y >= TILE + r && y <= HEIGHT - TILE - r) return true;
  if (inSideGap && x > WIDTH - TILE - r && doors.right && y >= TILE + r && y <= HEIGHT - TILE - r) return true;
  if (inTopGap && y < TILE + r && doors.up && x >= TILE + r && x <= WIDTH - TILE - r) return true;
  if (inTopGap && y > HEIGHT - TILE - r && doors.down && x >= TILE + r && x <= WIDTH - TILE - r) return true;
  return false;
}

function moveWithWalls(entity, r, dx, dy, canExit) {
  const doors = canExit ? roomDoors(currentRoom()) : { up: false, down: false, left: false, right: false };
  const nextX = entity.x + dx;
  if (positionValid(nextX, entity.y, r, doors)) entity.x = nextX;
  else if (positionValid(clamp(nextX, TILE + r, WIDTH - TILE - r), entity.y, r, doors)) entity.x = clamp(nextX, TILE + r, WIDTH - TILE - r);
  else {
    const gapX = clamp(nextX, WIDTH / 2 - DOOR_HALF + r, WIDTH / 2 + DOOR_HALF - r);
    if (positionValid(gapX, entity.y, r, doors)) entity.x = gapX;
  }

  const nextY = entity.y + dy;
  if (positionValid(entity.x, nextY, r, doors)) entity.y = nextY;
  else if (positionValid(entity.x, clamp(nextY, TILE + r, HEIGHT - TILE - r), r, doors)) entity.y = clamp(nextY, TILE + r, HEIGHT - TILE - r);
  else {
    const gapY = clamp(nextY, HEIGHT / 2 - DOOR_HALF + r, HEIGHT / 2 + DOOR_HALF - r);
    if (positionValid(entity.x, gapY, r, doors)) entity.y = gapY;
  }
}

function circleHitsRect(x, y, r, rect) {
  const nx = clamp(x, rect.x, rect.x + rect.w);
  const ny = clamp(y, rect.y, rect.y + rect.h);
  return Math.hypot(x - nx, y - ny) < r;
}

function pushOutOfCrates(entity, r) {
  for (const crate of currentRoom().crates) {
    if (crate.hp <= 0) continue;
    const nx = clamp(entity.x, crate.x, crate.x + crate.w);
    const ny = clamp(entity.y, crate.y, crate.y + crate.h);
    const dx = entity.x - nx;
    const dy = entity.y - ny;
    const d = Math.hypot(dx, dy);
    if (d >= r) continue;
    if (d === 0) {
      const cx = crate.x + crate.w / 2;
      const cy = crate.y + crate.h / 2;
      if (Math.abs(entity.x - cx) > Math.abs(entity.y - cy)) entity.x = entity.x < cx ? crate.x - r : crate.x + crate.w + r;
      else entity.y = entity.y < cy ? crate.y - r : crate.y + crate.h + r;
    } else {
      entity.x += (dx / d) * (r - d);
      entity.y += (dy / d) * (r - d);
    }
  }
}

function damageCrate(crate) {
  crate.hp -= 1;
  crate.wobble = 0.2;
  sfx.crate();
  if (crate.hp <= 0) {
    const cx = crate.x + crate.w / 2;
    const cy = crate.y + crate.h / 2;
    burst(cx, cy, ["#a0703c", "#5a3b1c", "#d9a066"], 16, 200, { gravity: 300 });
    const roll = Math.random();
    if (roll < 0.15 + stats.luck) dropLoot(cx, cy, "heart", 1);
    else if (roll < 0.3 + stats.luck) dropLoot(cx, cy, "star", 1);
    dropLoot(cx, cy, "coin", 2 + Math.floor(Math.random() * 3));
  }
}

// The pet is picked before a run starts and stays for the whole run.
function choosePet(id) {
  if (!petTypes[id]) return;
  if (state.mode !== "title") {
    toast("Pick your pet on the title screen before starting a run.", 2.2);
    return;
  }
  state.petPick = id;
  savePrefs();
  sfx.chime();
}

function cyclePet(dir = 1) {
  const i = PET_IDS.indexOf(state.petPick);
  choosePet(PET_IDS[(i + dir + PET_IDS.length) % PET_IDS.length]);
}

function nearestFoes(x, y, range, count) {
  return livingFoes(currentRoom())
    .filter((enemy) => enemy.alpha > 0.3 && !enemy.friendly && Math.hypot(enemy.x - x, enemy.y - y) < range)
    .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))
    .slice(0, count);
}

function petShot(angle, speed, extra) {
  projectiles.push(Object.assign({ x: pet.x, y: pet.y - 4, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 5, life: 0.9, owner: "player", kind: "spark", spin: 0 }, extra));
}

// Each new pet has one trick. pet.timer counts down to its next move.
function updateNewPet(dt, kind) {
  const level = stats.petLevel;
  const hit = petPower();
  if (kind === "turtle") {
    // Shelly blocks the first enemy bullet that touches her shell, then needs a moment.
    pet.blockCd = Math.max(0, (pet.blockCd || 0) - dt);
    if (pet.blockCd <= 0) {
      const shot = projectiles.find((s) => s.owner === "enemy" && s.life > 0 && Math.hypot(s.x - pet.x, s.y - pet.y) < 20 + s.r);
      if (shot) {
        shot.life = 0;
        pet.blockCd = Math.max(0.35, 0.9 - level * 0.1);
        burst(shot.x, shot.y, ["#4ade80", "#ffffff"], 8, 140);
        sfx.block();
      }
    }
    return;
  }
  pet.timer -= dt;
  if (pet.timer > 0) return;
  if (kind === "slime") {
    const hurt = livingPlayers().filter((p) => p.hp < stats.maxHp).sort((a, b) => a.hp - b.hp)[0];
    pet.healTimer = (pet.healTimer || 0) - 1;
    if (hurt && pet.healTimer <= 0) {
      const heal = Math.max(2, Math.round(stats.maxHp * 0.04));
      hurt.hp = Math.min(stats.maxHp, hurt.hp + heal);
      floatText(hurt.x, hurt.y - 40, `+${heal}`, "#7dd3fc", 14);
      burst(hurt.x, hurt.y, ["#7dd3fc", "#ffffff"], 8, 100, { heart: true });
      pet.healTimer = Math.max(4, 7 - level * 0.6);
    }
    const [target] = nearestFoes(pet.x, pet.y, 300, 1);
    if (target) petShot(Math.atan2(target.y - pet.y, target.x - pet.x), 360, { damage: (4 + level * 3) * hit, color: "#7dd3fc", petSlime: true, r: 6 });
    pet.timer = 1;
    return;
  }
  if (kind === "owl") {
    const [target] = nearestFoes(pet.x, pet.y, 420, 1);
    if (!target) return void (pet.timer = 0.2);
    petShot(Math.atan2(target.y - pet.y, target.x - pet.x) + rand(-0.6, 0.6), 300, { damage: (9 + level * 4) * hit, color: "#e8d2a6", kind: "feather", homing: true, life: 1.8 });
    pet.face = target.x >= pet.x ? 1 : -1;
    pet.timer = Math.max(0.4, 1.05 - level * 0.12);
    return;
  }
  if (kind === "bat") {
    const targets = nearestFoes(pet.x, pet.y, 360, 2);
    if (!targets.length) return void (pet.timer = 0.2);
    for (const target of targets) petShot(Math.atan2(target.y - pet.y, target.x - pet.x), 540, { damage: (4 + level * 2.5) * hit, color: "#e9d5ff", r: 4, life: 0.8 });
    pet.timer = Math.max(0.35, 0.8 - level * 0.08);
    return;
  }
  if (kind === "hatchling") {
    const [target] = nearestFoes(pet.x, pet.y, 150, 1);
    if (!target) return void (pet.timer = 0.2);
    const angle = Math.atan2(target.y - pet.y, target.x - pet.x);
    effects.push({ type: "petbreath", x: pet.x, y: pet.y - 4, angle, reach: 150, life: 0.35, max: 0.35 });
    for (const enemy of nearestFoes(pet.x, pet.y, 160, 12)) {
      const diff = Math.atan2(Math.sin(Math.atan2(enemy.y - pet.y, enemy.x - pet.x) - angle), Math.cos(Math.atan2(enemy.y - pet.y, enemy.x - pet.x) - angle));
      if (Math.abs(diff) > 0.5) continue;
      damageEnemy(enemy, (12 + level * 6) * hit, "fire");
      if (!isBurning(enemy)) enemy.burnTick = 0.5;
      enemy.burnUntil = Math.max(enemy.burnUntil || 0, state.clock + 3);
    }
    noiseBurst(0.25, { volume: 0.06, freq: 700 });
    pet.face = Math.cos(angle) >= 0 ? 1 : -1;
    pet.timer = Math.max(1, 2.2 - level * 0.22);
  }
}

function updatePet(dt) {
  if (!pet) return;
  const kind = state.petChoice;
  const sideX = -player.dirY;
  const sideY = player.dirX;
  let tx = player.x - player.dirX * 30 + sideX * 22;
  let ty = player.y - player.dirY * 30 + sideY * 22;
  if (kind === "turtle") {
    // Shelly circles the wizard like a moon.
    pet.orbit = (pet.orbit || 0) + dt * 2.2;
    tx = player.x + Math.cos(pet.orbit) * 42;
    ty = player.y - 6 + Math.sin(pet.orbit) * 42;
  }
  const follow = Math.min(1, dt * 6);
  const oldX = pet.x;
  pet.x += (tx - pet.x) * follow;
  pet.y += (ty - pet.y) * follow;
  if (Math.abs(pet.x - oldX) > 0.2) pet.face = pet.x > oldX ? 1 : -1;
  pet.hop += dt * (Math.hypot(tx - pet.x, ty - pet.y) > 6 ? 14 : 3);
  if (kind !== "pixel") {
    updateNewPet(dt, kind);
    return;
  }

  pet.timer -= dt;
  if (pet.timer > 0) return;
  const foes = livingFoes(currentRoom()).filter((enemy) => enemy.alpha > 0.3 && distance(enemy, pet) < 340);
  if (!foes.length) {
    pet.timer = 0.2;
    return;
  }
  const target = foes.reduce((best, enemy) => (distance(enemy, pet) < distance(best, pet) ? enemy : best));
  const aim = Math.atan2(target.y - pet.y, target.x - pet.x);
  const evo = stats.petEvo;
  const shots = stats.petMega ? 3 : 1;
  for (let i = 0; i < shots; i += 1) {
    const angle = aim + (i - (shots - 1) / 2) * 0.22;
    projectiles.push({
      x: pet.x,
      y: pet.y - 4,
      vx: Math.cos(angle) * 430,
      vy: Math.sin(angle) * 430,
      r: stats.petMega ? 7 : 5,
      damage: (6 + stats.petLevel * 4) * petPower() * (evo ? 1.3 : 1) * (stats.petMega ? 1.5 : 1),
      life: 0.9,
      owner: "player",
      kind: "spark",
      petEvo: evo,
      color: evo ? petKinds[evo].color : "#fb923c",
      spin: 0
    });
  }
  pet.face = Math.cos(aim) >= 0 ? 1 : -1;
  pet.timer = Math.max(0.35, 1.15 - stats.petLevel * 0.13);
}

function bulletSpeed(room) {
  return Math.min(255, 190 + room.tier * 2.2);
}

function enemyShot(enemy, angle, speed, options = {}) {
  projectiles.push({
    x: enemy.x + Math.cos(angle) * enemy.size * 0.4,
    y: enemy.y + Math.sin(angle) * enemy.size * 0.4,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: options.r || 8,
    damage: options.damage || enemy.damage,
    life: 3.2,
    owner: "enemy",
    kind: options.kind || "orb",
    color: options.color || "#cf3fff",
    spin: 0
  });
}

function updateFoes(dt) {
  const room = currentRoom();
  if (room.enemies.length > 24) room.enemies = room.enemies.filter((enemy) => enemy.hp > 0 || !enemy.temp);
  const foes = livingFoes(room);

  for (const enemy of foes) {
    enemy.flash = Math.max(0, enemy.flash - dt);
    enemy.hitCooldown = Math.max(0, enemy.hitCooldown - dt);
    enemy.wobble += dt;

    const target = enemy.isBoss ? bossTarget(enemy) : nearestPlayer(enemy.x, enemy.y);
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    if (inFrostField(enemy.x, enemy.y)) enemy.slowUntil = Math.max(enemy.slowUntil, state.clock + 0.3);
    if (isFinal(enemy)) {
      // Final bosses resist ice and slime: slows wear off fast.
      enemy.slowUntil = Math.min(enemy.slowUntil, state.clock + 0.8);
      if (enemy.stickyUntil) enemy.stickyUntil = Math.min(enemy.stickyUntil, state.clock + 0.8);
    }
    const slow = state.clock < enemy.slowUntil || state.clock < (enemy.stickyUntil || 0) ? 0.4 : 1;
    const step = enemy.speed * slow * dt;

    if (isStunned(enemy)) {
      if (Math.random() < dt * 6) burst(enemy.x, enemy.y - enemy.size / 2, ["#f6c85f", "#ffffff"], 1, 40, { lift: 30 });
    } else if (enemy.isBoss) updateBoss(enemy, dt, ux, uy, dist, slow, room);
    else updateMinion(enemy, dt, ux, uy, dist, step, room, target);

    if (enemy.hp <= 0) continue;

    if (isBurning(enemy)) {
      enemy.burnTick -= dt;
      if (Math.random() < dt * 14) {
        particles.push({ x: enemy.x + rand(-enemy.size / 3, enemy.size / 3), y: enemy.y - enemy.size / 3, vx: rand(-15, 15), vy: rand(-70, -35), life: 0.4, max: 0.4, size: rand(4, 7), color: pick(["#ff742e", "#ffd166", "#ef5b4b"]), gravity: 0, drag: 0.92, spin: 0, angle: 0 });
      }
      if (enemy.burnTick <= 0) {
        enemy.burnTick = 0.5;
        damageEnemy(enemy, 6 * spellPower(), "burn");
        if (enemy.hp <= 0) continue;
      }
    }

    const half = enemy.size / 2;
    enemy.x = clamp(enemy.x, TILE + half, WIDTH - TILE - half);
    enemy.y = clamp(enemy.y, TILE + half, HEIGHT - TILE - half);
    if (enemy.isBoss && enemy.state === "charge") {
      for (const crate of room.crates) {
        if (crate.hp > 0 && circleHitsRect(enemy.x, enemy.y, half, crate)) {
          crate.hp = 1;
          damageCrate(crate);
        }
      }
    } else if (!enemy.isDragon) {
      pushOutOfCrates(enemy, half * 0.9);
    }

    if (enemy.hitCooldown <= 0 && enemy.alpha > 0.5 && !enemy.friendly && !enemy.stone && !(enemy.hop > 30) && !isStunned(enemy)) {
      for (const p of livingPlayers()) {
        if (Math.hypot(p.x - enemy.x, p.y - enemy.y) < half * 0.9 + p.r) {
          hurtPlayer(p, enemy.damage, enemy.x, enemy.y, enemy);
          enemy.hitCooldown = enemy.isBoss ? 0.9 : 1.1;
          break;
        }
      }
    }
  }

  // Keep enemies from stacking into one blob.
  for (let i = 0; i < foes.length; i += 1) {
    for (let j = i + 1; j < foes.length; j += 1) {
      const a = foes[i];
      const b = foes[j];
      if (a.isDragon || b.isDragon || a.state === "charge" || b.state === "charge") continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const min = (a.size + b.size) * 0.45;
      if (d < min) {
        const push = (min - d) / 2;
        const aShare = a.isBoss ? 0.2 : 1;
        const bShare = b.isBoss ? 0.2 : 1;
        a.x -= (dx / d) * push * aShare;
        a.y -= (dy / d) * push * aShare;
        b.x += (dx / d) * push * bShare;
        b.y += (dy / d) * push * bShare;
      }
    }
  }
}

function updateMinion(enemy, dt, ux, uy, dist, step, room, target) {
  switch (enemy.behavior) {
    case "ranged": {
      if (dist < 190) {
        enemy.x -= ux * step * 0.8;
        enemy.y -= uy * step * 0.8;
      } else if (dist > 300) {
        enemy.x += ux * step;
        enemy.y += uy * step;
      } else {
        enemy.x += -uy * enemy.strafe * step * 0.6;
        enemy.y += ux * enemy.strafe * step * 0.6;
        if (Math.random() < dt * 0.4) enemy.strafe *= -1;
      }
      enemy.attackTimer -= dt;
      if (enemy.attackTimer <= 0) {
        enemyShot(enemy, Math.atan2(uy, ux), bulletSpeed(room) - 10, { r: 7, color: enemy.type.shot || "#ffffff", kind: "arrow" });
        sfx.enemyShot();
        enemy.attackTimer = rand(1.9, 2.7);
      }
      break;
    }
    case "lunge": {
      if (enemy.state === "windup") {
        enemy.stateTimer -= dt;
        if (enemy.stateTimer <= 0) {
          enemy.state = "dash";
          enemy.stateTimer = 0.35;
        }
      } else if (enemy.state === "dash") {
        enemy.stateTimer -= dt;
        enemy.x += enemy.lockX * step * 3.6;
        enemy.y += enemy.lockY * step * 3.6;
        if (enemy.stateTimer <= 0) {
          enemy.state = "move";
          enemy.attackTimer = rand(1.6, 2.4);
        }
      } else {
        enemy.x += ux * step;
        enemy.y += uy * step;
        enemy.attackTimer -= dt;
        if (dist < 200 && enemy.attackTimer <= 0) {
          enemy.state = "windup";
          enemy.stateTimer = 0.5;
          enemy.lockX = ux;
          enemy.lockY = uy;
        }
      }
      break;
    }
    case "zigzag": {
      const sway = Math.sin(enemy.wobble * 5) * 0.9;
      let mx = ux + -uy * sway;
      let my = uy + ux * sway;
      const length = Math.hypot(mx, my) || 1;
      mx /= length;
      my /= length;
      enemy.x += mx * step;
      enemy.y += my * step;
      break;
    }
    case "blink": {
      if (enemy.state === "fadeout") {
        enemy.stateTimer -= dt;
        enemy.alpha = Math.max(0, enemy.stateTimer / 0.3);
        if (enemy.stateTimer <= 0) {
          const angle = Math.random() * Math.PI * 2;
          const radius = rand(140, 200);
          enemy.x = clamp(target.x + Math.cos(angle) * radius, TILE + 30, WIDTH - TILE - 30);
          enemy.y = clamp(target.y + Math.sin(angle) * radius, TILE + 30, HEIGHT - TILE - 30);
          enemy.state = "fadein";
          enemy.stateTimer = 0.3;
          burst(enemy.x, enemy.y, [enemy.type.accent, enemy.type.color], 8, 120);
        }
      } else if (enemy.state === "fadein") {
        enemy.stateTimer -= dt;
        enemy.alpha = 1 - Math.max(0, enemy.stateTimer / 0.3);
        if (enemy.stateTimer <= 0) {
          enemy.state = "move";
          enemy.alpha = 1;
          enemy.attackTimer = rand(2.8, 4);
        }
      } else {
        enemy.x += ux * step;
        enemy.y += uy * step;
        enemy.attackTimer -= dt;
        if (enemy.attackTimer <= 0) {
          enemy.state = "fadeout";
          enemy.stateTimer = 0.3;
        }
      }
      break;
    }
    case "fuse": {
      if (enemy.state === "fuse") {
        enemy.stateTimer -= dt;
        if (enemy.stateTimer <= 0) mudPop(enemy);
      } else {
        enemy.x += ux * step;
        enemy.y += uy * step;
        if (dist < 70) {
          enemy.state = "fuse";
          enemy.stateTimer = 0.9;
        }
      }
      break;
    }
    case "pack":
      updateWolf(enemy, dt, ux, uy, dist, step, room, target);
      break;
    case "serpent":
      updateSerpent(enemy, dt, ux, uy, dist, step, room, target);
      break;
    case "shard":
      updateShard(enemy, dt, ux, uy, dist, step, room);
      break;
    case "eye":
      updateEye(enemy, dt, ux, uy, dist, step, target);
      break;
    case "ember":
      updateEmber(enemy, dt, ux, uy, step);
      break;
    case "wraith":
      updateWraith(enemy, dt, ux, uy, step, target);
      break;
    case "gargoyle":
      updateGargoyle(enemy, dt, ux, uy, dist, step, target);
      break;
    case "lantern":
      updateLantern(enemy, dt, ux, uy, dist, step, room);
      break;
    case "raven":
      updateRaven(enemy, dt, ux, uy, dist, step, room);
      break;
    default:
      enemy.x += ux * step;
      enemy.y += uy * step;
  }
}

/* ---------- scary monsters ----------
   Each one has its own little state machine, like the bosses do.
   "windup" is always the warning: the monster shakes and a red line or
   circle shows where the attack will land. */

// Point the monster's attack (lockX, lockY) at a spot.
function lockOn(enemy, spot) {
  const dx = spot.x - enemy.x;
  const dy = spot.y - enemy.y;
  const d = Math.hypot(dx, dy) || 1;
  enemy.lockX = dx / d;
  enemy.lockY = dy / d;
}

// Shared by wolves, cobras and gargoyles: warn, then dash along the locked line.
function runPounce(enemy, dt, step, speed) {
  enemy.stateTimer -= dt;
  if (enemy.state === "windup") {
    if (enemy.stateTimer <= 0) {
      enemy.state = "dash";
      enemy.stateTimer = enemy.dashTime;
      sfx.slash();
    }
    return false;
  }
  enemy.x += enemy.lockX * step * speed;
  enemy.y += enemy.lockY * step * speed;
  if (enemy.stateTimer > 0) return false;
  enemy.state = "move";
  return true;
}

function updateWolf(enemy, dt, ux, uy, dist, step, room, target) {
  // The first wolf to spot you howls, and the whole pack speeds up.
  if (!enemy.howled && dist < 320) {
    for (const wolf of livingFoes(room)) {
      if (wolf.behavior !== "pack") continue;
      wolf.howled = true;
      wolf.howlUntil = state.clock + 5;
    }
    floatText(enemy.x, enemy.y - 26, "AWOOO!", "#ff8a95", 15);
    tone(380, 0.6, { type: "triangle", volume: 0.05, slide: 260 });
  }
  const fast = state.clock < (enemy.howlUntil || 0) ? 1.3 : 1;
  if (enemy.state === "windup" || enemy.state === "dash") {
    if (runPounce(enemy, dt, step, 4)) enemy.attackTimer = rand(1.3, 2.1);
    return;
  }
  // Circle around you at a distance, waiting for an opening.
  const radial = dist > 150 ? 1 : dist < 110 ? -0.7 : 0;
  enemy.x += (ux * radial - uy * enemy.strafe * 0.9) * step * fast;
  enemy.y += (uy * radial + ux * enemy.strafe * 0.9) * step * fast;
  if (Math.random() < dt * 0.3) enemy.strafe *= -1;
  enemy.attackTimer -= dt * fast;
  if (enemy.attackTimer <= 0 && dist < 240) {
    enemy.state = "windup";
    enemy.stateTimer = 0.4;
    enemy.dashTime = 0.32;
    lockOn(enemy, leadPoint(target, 0.25));
  }
}

function updateSerpent(enemy, dt, ux, uy, dist, step, room, target) {
  if (enemy.state === "windup" || enemy.state === "dash") {
    if (runPounce(enemy, dt, step, 6.5)) enemy.attackTimer = rand(1.5, 2.3);
    return;
  }
  // Slither toward you in an S shape.
  const sway = Math.sin(enemy.wobble * 4) * 0.7;
  enemy.x += (ux - uy * sway) * step;
  enemy.y += (uy + ux * sway) * step;
  enemy.attackTimer -= dt;
  enemy.spitTimer = (enemy.spitTimer === undefined ? rand(2, 3) : enemy.spitTimer) - dt;
  if (dist < 150 && enemy.attackTimer <= 0) {
    enemy.state = "windup";
    enemy.stateTimer = 0.45;
    enemy.dashTime = 0.2;
    lockOn(enemy, target);
  } else if (dist > 220 && enemy.spitTimer <= 0) {
    const aim = Math.atan2(uy, ux);
    for (let k = -1; k <= 1; k += 1) enemyShot(enemy, aim + k * 0.18, bulletSpeed(room) * 0.8, { r: 6, color: enemy.type.shot, damage: Math.round(enemy.damage * 0.7) });
    sfx.enemyShot();
    enemy.spitTimer = rand(2.6, 3.6);
  }
}

function updateShard(enemy, dt, ux, uy, dist, step, room) {
  const radial = dist > 260 ? 1 : dist < 160 ? -1 : 0;
  enemy.x += (ux * radial - uy * enemy.strafe * 0.5) * step;
  enemy.y += (uy * radial + ux * enemy.strafe * 0.5) * step;
  if (Math.random() < dt * 0.3) enemy.strafe *= -1;
  enemy.attackTimer -= dt;
  if (enemy.attackTimer <= 0) {
    const aim = Math.atan2(uy, ux);
    for (let k = -1; k <= 1; k += 1) enemyShot(enemy, aim + k * 0.2, bulletSpeed(room) * 0.9, { r: 6, color: enemy.type.shot });
    sfx.enemyShot();
    enemy.attackTimer = rand(2.4, 3.2);
  }
}

// Splinters fly out in a ring. Hitting a shard is never free!
function shardSplinters(enemy, count) {
  for (let i = 0; i < count; i += 1) {
    enemyShot(enemy, (i / count) * Math.PI * 2 + enemy.wobble, 190, { r: 5, color: enemy.type.shot, damage: Math.round(enemy.damage * 0.6) });
  }
  burst(enemy.x, enemy.y, [enemy.type.color, enemy.type.accent], 8, 160);
  tone(1400, 0.12, { type: "triangle", volume: 0.04, slide: 600 });
}

const EYE_BEAM = 720;

function updateEye(enemy, dt, ux, uy, dist, step, target) {
  if (enemy.state === "aim") {
    // Charging: the beam slowly turns to follow you, so keep moving!
    enemy.stateTimer -= dt;
    const want = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    let diff = want - enemy.beamAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    enemy.beamAngle += clamp(diff, -1.1 * dt, 1.1 * dt);
    if (enemy.stateTimer <= 0) {
      enemy.state = "beam";
      enemy.stateTimer = 0.35;
      enemy.beamHit = new Set();
      sfx.zap();
      addShake(3);
    }
    return;
  }
  if (enemy.state === "beam") {
    enemy.stateTimer -= dt;
    const bx = Math.cos(enemy.beamAngle);
    const by = Math.sin(enemy.beamAngle);
    for (const p of livingPlayers()) {
      if (enemy.beamHit.has(p)) continue;
      const rx = p.x - enemy.x;
      const ry = p.y - enemy.y;
      const along = rx * bx + ry * by;
      const side = Math.abs(rx * by - ry * bx);
      if (along > 0 && along < EYE_BEAM && side < 14 + p.r * 0.5) {
        hurtPlayer(p, enemy.damage, enemy.x, enemy.y);
        enemy.beamHit.add(p);
      }
    }
    if (enemy.stateTimer <= 0) {
      enemy.state = "move";
      enemy.attackTimer = rand(2.6, 3.6);
    }
    return;
  }
  const radial = dist > 300 ? 1 : dist < 200 ? -1 : 0;
  enemy.x += (ux * radial - uy * enemy.strafe * 0.5) * step;
  enemy.y += (uy * radial + ux * enemy.strafe * 0.5) * step;
  if (Math.random() < dt * 0.3) enemy.strafe *= -1;
  enemy.attackTimer -= dt;
  if (enemy.attackTimer <= 0 && dist < 520) {
    enemy.state = "aim";
    enemy.stateTimer = 1.1;
    enemy.beamAngle = Math.atan2(uy, ux);
  }
}

function updateEmber(enemy, dt, ux, uy, step) {
  const sway = Math.sin(enemy.wobble * 6) * 1.1;
  let mx = ux - uy * sway;
  let my = uy + ux * sway;
  const length = Math.hypot(mx, my) || 1;
  enemy.x += (mx / length) * step;
  enemy.y += (my / length) * step;
  enemy.trailTimer = (enemy.trailTimer || 0) - dt;
  if (enemy.trailTimer <= 0) {
    enemy.trailTimer = 0.35;
    effects.push({ type: "emberfire", x: enemy.x, y: enemy.y + enemy.size * 0.3, radius: 15, life: 2.4, max: 2.4, damage: Math.max(2, Math.round(enemy.damage * 0.5)), tick: 0 });
  }
}

function updateEmberFire(effect, dt) {
  effect.tick -= dt;
  if (effect.tick > 0) return;
  for (const p of livingPlayers()) {
    if (Math.hypot(p.x - effect.x, p.y - effect.y) < effect.radius + p.r * 0.5) {
      hurtPlayer(p, effect.damage, effect.x, effect.y);
      effect.tick = 0.8;
    }
  }
}

function emberPop(enemy) {
  for (let i = 0; i < 6; i += 1) enemyShot(enemy, (i / 6) * Math.PI * 2, 170, { r: 8, color: "#ff9b3d", kind: "flame", damage: Math.round(enemy.damage * 0.7) });
  addRing(enemy.x, enemy.y, 50, "#ffb347", 0.3, 8);
  sfx.fireball();
}

function updateWraith(enemy, dt, ux, uy, step, target) {
  if (enemy.state === "fade") {
    // Invisible: spells pass right through it while it sneaks up on you.
    enemy.stateTimer -= dt;
    enemy.alpha = Math.max(0.08, enemy.alpha - dt * 3);
    enemy.x += ux * step * 1.6;
    enemy.y += uy * step * 1.6;
    if (enemy.stateTimer <= 0) {
      const angle = Math.random() * Math.PI * 2;
      enemy.x = clamp(target.x + Math.cos(angle) * 55, TILE + 30, WIDTH - TILE - 30);
      enemy.y = clamp(target.y + Math.sin(angle) * 55, TILE + 30, HEIGHT - TILE - 30);
      enemy.alpha = 1;
      enemy.state = "windup";
      enemy.stateTimer = 0.45;
      burst(enemy.x, enemy.y, [enemy.type.color, enemy.type.accent], 10, 140);
      floatText(enemy.x, enemy.y - 28, "BOO!", "#c9b8ff", 16);
      tone(220, 0.4, { type: "sawtooth", volume: 0.04, slide: -120 });
    }
    return;
  }
  if (enemy.state === "windup") {
    enemy.stateTimer -= dt;
    if (enemy.stateTimer <= 0) {
      for (const p of livingPlayers()) {
        if (Math.hypot(p.x - enemy.x, p.y - enemy.y) < 62 + p.r * 0.5) hurtPlayer(p, enemy.damage, enemy.x, enemy.y, enemy);
      }
      addRing(enemy.x, enemy.y, 62, enemy.type.accent, 0.25, 6);
      sfx.slash();
      enemy.state = "move";
      enemy.attackTimer = rand(2.6, 3.6);
    }
    return;
  }
  const wave = Math.sin(enemy.wobble * 3) * 0.5;
  enemy.x += (ux - uy * wave) * step * 0.8;
  enemy.y += (uy + ux * wave) * step * 0.8;
  enemy.alpha = Math.min(1, enemy.alpha + dt * 3);
  enemy.attackTimer -= dt;
  if (enemy.attackTimer <= 0) {
    enemy.state = "fade";
    enemy.stateTimer = 1.2;
  }
}

function updateGargoyle(enemy, dt, ux, uy, dist, step, target) {
  if (enemy.stone) {
    // A statue... until you get close.
    enemy.stateTimer -= dt;
    if ((enemy.stateTimer <= 0 && dist < 260) || enemy.stateTimer < -4) {
      enemy.stone = false;
      enemy.swoops = 2;
      enemy.state = "move";
      enemy.attackTimer = 0.3;
      burst(enemy.x, enemy.y, ["#8a8794", "#c9c4d2"], 12, 160);
      floatText(enemy.x, enemy.y - 28, "GRRR!", "#ffb36b", 16);
      sfx.slam();
    }
    return;
  }
  if (enemy.state === "windup" || enemy.state === "dash") {
    if (!runPounce(enemy, dt, step, 3.2)) return;
    enemy.swoops -= 1;
    if (enemy.swoops > 0) {
      enemy.attackTimer = 0.5;
      return;
    }
    enemy.stone = true;
    enemy.stateTimer = 2.4;
    burst(enemy.x, enemy.y, ["#8a8794", "#5d5868"], 10, 120);
    floatText(enemy.x, enemy.y - 28, "Stone!", "#c9c4d2", 14);
    return;
  }
  enemy.x += ux * step * 0.6;
  enemy.y += uy * step * 0.6;
  enemy.attackTimer -= dt;
  if (enemy.attackTimer <= 0) {
    enemy.state = "windup";
    enemy.stateTimer = 0.45;
    enemy.dashTime = 0.4;
    lockOn(enemy, leadPoint(target, 0.3));
  }
}

function updateLantern(enemy, dt, ux, uy, dist, step, room) {
  // Hangs back and keeps the other monsters alive.
  const radial = dist < 260 ? -1 : dist > 360 ? 0.6 : 0;
  enemy.x += (ux * radial - uy * enemy.strafe * 0.6) * step;
  enemy.y += (uy * radial + ux * enemy.strafe * 0.6) * step;
  if (Math.random() < dt * 0.3) enemy.strafe *= -1;
  enemy.attackTimer -= dt;
  if (enemy.attackTimer > 0) return;
  enemy.attackTimer = rand(3, 3.8);
  let healed = 0;
  for (const ally of livingFoes(room)) {
    if (ally === enemy || ally.friendly || ally.hp >= ally.maxHp || distance(ally, enemy) > 240) continue;
    const amount = Math.max(1, Math.round(ally.maxHp * (ally.isBoss ? 0.02 : 0.12)));
    ally.hp = Math.min(ally.maxHp, ally.hp + amount);
    floatText(ally.x, ally.y - ally.size / 2 - 14, `+${amount}`, "#7dffb0", 14);
    effects.push({ type: "healbeam", x: enemy.x, y: enemy.y, tx: ally.x, ty: ally.y, life: 0.5, max: 0.5 });
    healed += 1;
  }
  addRing(enemy.x, enemy.y, 240, "#7dffb0", 0.4, 3);
  if (healed) sfx.heal();
}

function updateRaven(enemy, dt, ux, uy, dist, step, room) {
  if (enemy.small) {
    // Little ravens dive at you in loops.
    const sway = Math.sin(enemy.wobble * 6) * 1.2;
    enemy.x += (ux - uy * sway) * step;
    enemy.y += (uy + ux * sway) * step;
    return;
  }
  if (enemy.state === "windup") {
    enemy.stateTimer -= dt;
    if (enemy.stateTimer > 0) return;
    const flock = room.enemies.filter((foe) => foe.hp > 0 && foe.behavior === "raven" && foe.small).length;
    for (let i = 0; i < Math.min(2, 4 - flock); i += 1) {
      const chick = makeEnemy(enemy.typeIndex, enemy.x + (i ? 22 : -22), enemy.y, { tier: room.tier, small: true, temp: true });
      room.enemies.push(chick);
      burst(chick.x, chick.y, [enemy.type.accent, "#ffffff"], 6, 100);
    }
    enemy.state = "move";
    enemy.attackTimer = rand(4.5, 5.5);
    return;
  }
  const radial = dist > 260 ? 1 : dist < 170 ? -1 : 0;
  enemy.x += (ux * radial - uy * enemy.strafe * 0.8) * step;
  enemy.y += (uy * radial + ux * enemy.strafe * 0.8) * step;
  if (Math.random() < dt * 0.4) enemy.strafe *= -1;
  enemy.shotTimer = (enemy.shotTimer === undefined ? 1.5 : enemy.shotTimer) - dt;
  if (enemy.shotTimer <= 0) {
    enemyShot(enemy, Math.atan2(uy, ux), bulletSpeed(room), { r: 6, color: enemy.type.shot, kind: "arrow" });
    sfx.enemyShot();
    enemy.shotTimer = rand(1.8, 2.4);
  }
  enemy.attackTimer -= dt;
  if (enemy.attackTimer <= 0) {
    enemy.state = "windup";
    enemy.stateTimer = 0.6;
    floatText(enemy.x, enemy.y - 26, "CAW!", "#d9a6ff", 15);
    tone(900, 0.25, { type: "sawtooth", volume: 0.04, slide: -500 });
  }
}

function mudPop(enemy) {
  const radius = 85;
  addRing(enemy.x, enemy.y, radius, "#8a6b3c", 0.4, 14);
  burst(enemy.x, enemy.y, ["#6c5b38", "#8a6b3c", "#2f7e43"], 26, 260);
  addShake(6);
  sfx.pop();
  for (const p of livingPlayers()) {
    if (Math.hypot(p.x - enemy.x, p.y - enemy.y) < radius + p.r) hurtPlayer(p, enemy.damage + 4, enemy.x, enemy.y);
  }
  enemy.hp = 0;
  defeatEnemy(enemy);
}

function updateBoss(boss, dt, ux, uy, dist, slow, room) {
  if (boss.transforming > 0) {
    updateTransform(boss, dt);
    return;
  }
  if (boss.melee) updateSword(boss, dt, ux, uy);
  // Big bosses get angry in their second phase instead of at half HP.
  const phase2 = boss.isBig ? Boolean(boss.phase2) : boss.hp < boss.maxHp * 0.5;
  if (phase2 && !boss.enraged) {
    boss.enraged = true;
    toast(boss.isDragon ? "Blocky is getting grumpy!" : boss.isBig ? bigBosses[boss.row].rageLine : `${boss.name} is getting angry!`, 2.4);
    addShake(6);
    if (boss.isBig) {
      // Phase two: a new attack joins the mix and the boss speeds up.
      boss.patterns.push(bigBosses[boss.row].rage);
      boss.speed *= 1.15;
      addRing(boss.x, boss.y, 180, boss.shotColor, 0.5, 10);
      sfx.roar();
    }
  }
  const phase3 = boss.hp < boss.maxHp * 0.25 && (!boss.isBig || boss.phase2);
  if (phase3 && !boss.furious) {
    boss.furious = true;
    toast(boss.isDragon ? "Blocky is FURIOUS! Hang in there!" : `${boss.name} is furious!`, 2.2);
    burst(boss.x, boss.y, ["#ef5b4b", "#ffd166"], 20, 220);
    addShake(8);
  }
  // Last stand: near the end, final bosses throw everything at you at once.
  if (isFinal(boss) && !boss.desperate && (!boss.isBig || boss.phase2) && boss.hp < boss.maxHp * (boss.isDragon ? 0.3 : 0.35)) startLastStand(boss, room);
  if (boss.desperate) {
    boss.rainTimer -= dt;
    if (boss.rainTimer <= 0) {
      lastStandRain(boss);
      boss.rainTimer = boss.isDragon ? 2.2 : 2.8;
    }
  }

  if (boss.state === "leap") {
    boss.stateTimer -= dt;
    const k = 1 - clamp(boss.stateTimer / boss.leapTime, 0, 1);
    boss.x = boss.leapFromX + (boss.leapX - boss.leapFromX) * k;
    boss.y = boss.leapFromY + (boss.leapY - boss.leapFromY) * k;
    boss.hop = Math.sin(k * Math.PI) * 150;
    if (boss.stateTimer <= 0) {
      boss.hop = 0;
      boss.state = "move";
      if (boss.melee && !boss.isBig) meleeLanding(boss);
      else bossSlam(boss, room);
    }
    return;
  }

  if (boss.state === "vanish") {
    boss.stateTimer -= dt;
    boss.alpha = clamp(boss.stateTimer / 0.45, 0, 1);
    if (boss.stateTimer <= 0) {
      const target = nearestPlayer(boss.x, boss.y);
      let spot = { x: WIDTH / 2, y: HEIGHT / 2 };
      for (let i = 0; i < 20; i += 1) {
        spot = { x: rand(TILE + 90, WIDTH - TILE - 90), y: rand(TILE + 90, HEIGHT - TILE - 90) };
        if (Math.hypot(spot.x - target.x, spot.y - target.y) > 260) break;
      }
      boss.x = spot.x;
      boss.y = spot.y;
      boss.state = "appear";
      boss.stateTimer = 0.35;
    }
    return;
  }

  if (boss.state === "appear") {
    boss.stateTimer -= dt;
    boss.alpha = 1 - clamp(boss.stateTimer / 0.35, 0, 1);
    if (boss.stateTimer <= 0) {
      boss.alpha = 1;
      boss.state = "move";
      const count = boss.enraged ? 14 : 10;
      const offset = Math.random() * Math.PI;
      for (let i = 0; i < count; i += 1) enemyShot(boss, offset + (i / count) * Math.PI * 2, bulletSpeed(room) * 0.75, { color: boss.shotColor });
      addRing(boss.x, boss.y, 90, boss.shotColor, 0.3, 6);
      sfx.enemyShot();
    }
    return;
  }

  if (boss.state === "dodge") {
    boss.stateTimer -= dt;
    const roll = Math.max(boss.speed, 75) * 4 * slow * dt;
    boss.x += boss.lockX * roll;
    boss.y += boss.lockY * roll;
    if (boss.stateTimer <= 0) boss.state = "move";
    return;
  }

  if (boss.breathFollow > 0) {
    boss.breathFollow -= dt;
    if (boss.breathFollow <= 0) dragonBreath(boss, room);
  }

  if (boss.state === "swing") {
    boss.stateTimer -= dt;
    // While winding up the boss keeps turning toward you, but slowly.
    if (boss.stateTimer > 0.12) {
      const target = bossTarget(boss);
      const want = Math.atan2(target.y - boss.y, target.x - boss.x);
      const now = Math.atan2(boss.lockY, boss.lockX);
      const turn = clamp(Math.atan2(Math.sin(want - now), Math.cos(want - now)), -dt * 2.5, dt * 2.5);
      boss.lockX = Math.cos(now + turn);
      boss.lockY = Math.sin(now + turn);
    }
    if (boss.stateTimer <= 0) {
      const swing = boss.swings.shift();
      if (swing.kind === "thrust") {
        boss.state = "lunge";
        boss.stateTimer = swing.far ? 0.32 : 0.16;
        boss.pendingSwing = swing;
        sfx.dash();
        return;
      }
      meleeHit(boss, swing);
      afterSwing(boss);
    }
    return;
  }

  if (boss.state === "lunge") {
    boss.stateTimer -= dt;
    boss.x += boss.lockX * 820 * slow * dt;
    boss.y += boss.lockY * 820 * slow * dt;
    if (Math.random() < 0.7) burst(boss.x, boss.y + boss.size / 2, ["rgba(255,255,255,0.6)"], 1, 50);
    const prey = bossTarget(boss);
    if (Math.hypot(prey.x - boss.x, prey.y - boss.y) < swingReach(boss, "thrust") * 0.55) boss.stateTimer = 0;
    if (boss.stateTimer <= 0) {
      meleeHit(boss, boss.pendingSwing);
      afterSwing(boss);
    }
    return;
  }

  if (boss.state === "recover") {
    boss.stateTimer -= dt;
    if (boss.stateTimer <= 0) boss.state = "move";
    return;
  }

  if (boss.state === "retreat") {
    // A fake retreat: back off, then rush straight back in.
    boss.stateTimer -= dt;
    boss.x += boss.lockX * boss.speed * 2.2 * slow * dt;
    boss.y += boss.lockY * boss.speed * 2.2 * slow * dt;
    if (boss.stateTimer <= 0) {
      if (boss.melee) {
        startSwings(boss, [{ kind: "thrust", delay: 0.22, far: true }]);
      } else {
        const spot = leadPoint(bossTarget(boss), 0.3);
        const d = Math.hypot(spot.x - boss.x, spot.y - boss.y) || 1;
        boss.state = "windup";
        boss.stateTimer = 0.35;
        boss.lockX = (spot.x - boss.x) / d;
        boss.lockY = (spot.y - boss.y) / d;
      }
    }
    return;
  }

  if (!boss.isDragon && (tryEscapeZone(boss, dt) || ((boss.melee || boss.isBig || room.tier >= 2) && tryEvade(boss, dt, room)))) return;

  // The tell: a ring shrinks onto the boss before it attacks. Sometimes the boss
  // holds the pose a little longer (a feint), so you can't just parry on rhythm.
  if (boss.state === "tell") {
    const progress = 1 - boss.stateTimer / boss.tellTime;
    if (boss.feint > 0 && progress >= 0.85) {
      boss.feint -= dt;
      if (boss.feint <= 0) boss.feint = 0;
    } else {
      boss.stateTimer -= dt;
    }
    if (boss.stateTimer <= 0) {
      boss.state = "move";
      runBossPattern(boss, phase2, room, ux, uy);
    }
    return;
  }

  if (boss.state === "windup") {
    boss.stateTimer -= dt;
    if (boss.stateTimer <= 0) {
      boss.state = "charge";
      boss.stateTimer = boss.isDragon ? 0.8 : 0.6;
      addShake(4);
    }
    return;
  }

  if (boss.state === "charge") {
    boss.stateTimer -= dt;
    const speed = boss.speed * (boss.isDragon ? 5.5 : 4.4) * slow;
    boss.x += boss.lockX * speed * dt;
    boss.y += boss.lockY * speed * dt;
    if (Math.random() < 0.6) burst(boss.x, boss.y + boss.size / 2, ["rgba(255,255,255,0.6)", boss.type.color], 1, 60);
    if (boss.stateTimer <= 0) {
      boss.state = "move";
    }
    return;
  }

  if (boss.spiralTime > 0) {
    boss.spiralTime -= dt;
    boss.spiralTick -= dt;
    while (boss.spiralTick <= 0) {
      boss.spiralTick += phase2 ? 0.075 : 0.13;
      const color = boss.shotColor || (boss.isDragon ? "#ff9b3d" : "#cf3fff");
      const arms = 1 + (phase2 ? 1 : 0) + (room.tier >= 12 ? 1 : 0);
      for (let arm = 0; arm < arms; arm += 1) {
        enemyShot(boss, boss.spiralAngle + (arm * Math.PI * 2) / arms, bulletSpeed(room) * 0.85, { color });
      }
      boss.spiralAngle += 0.42;
    }
  }

  // Bosses hop sideways now and then, which makes them harder to pin down.
  if (!boss.isDragon && !boss.isBig && room.tier >= 1) {
    boss.dodgeTimer -= dt;
    if (boss.dodgeTimer <= 0) {
      const side = Math.random() < 0.5 ? -1 : 1;
      boss.state = "dodge";
      boss.stateTimer = 0.22;
      boss.lockX = -uy * side;
      boss.lockY = ux * side;
      boss.dodgeTimer = Math.max(1.2, rand(2.4, 3.6) - room.tier * 0.04) * difficulty().attack;
      burst(boss.x, boss.y + boss.size / 2, ["rgba(255,255,255,0.6)"], 4, 60);
      return;
    }
  }

  const step = boss.speed * slow * dt * (boss.furious ? 1.25 : 1);
  if (boss.isDragon) {
    const tx = WIDTH / 2 + Math.sin(state.clock * 0.6) * 260;
    const ty = 180 + Math.sin(state.clock * 1.3) * 40;
    boss.x += (tx - boss.x) * Math.min(1, dt * 1.5);
    boss.y += (ty - boss.y) * Math.min(1, dt * 1.5);
  } else if (boss.melee) {
    // Sword fighters close in fast, then circle you at sword range.
    const range = boss.size * 0.5 + 44;
    const pace = boss.isBig ? 1.05 : 1.3;
    if (dist > range + 30) {
      boss.x += ux * step * pace;
      boss.y += uy * step * pace;
    } else if (dist < range - 16) {
      boss.x -= ux * step * 0.7;
      boss.y -= uy * step * 0.7;
    } else {
      boss.x += -uy * boss.strafe * step * 0.9;
      boss.y += ux * boss.strafe * step * 0.9;
      if (Math.random() < dt * 0.6) boss.strafe *= -1;
    }
  } else if (!boss.isBig) {
    // Shooters keep their distance, but slide sideways instead of backing into a wall.
    const backX = boss.x - ux * 60;
    const backY = boss.y - uy * 60;
    const cornered = backX < TILE + 50 || backX > WIDTH - TILE - 50 || backY < TILE + 50 || backY > HEIGHT - TILE - 50;
    if (dist > 280) {
      boss.x += ux * step;
      boss.y += uy * step;
    } else if (dist < 170 && !cornered) {
      boss.x -= ux * step * 0.9;
      boss.y -= uy * step * 0.9;
    } else {
      const side = cornered ? 1.3 : 0.7;
      boss.x += -uy * boss.strafe * step * side;
      boss.y += ux * boss.strafe * step * side;
      if (Math.random() < dt * 0.4) boss.strafe *= -1;
    }
  } else if (dist > 150) {
    boss.x += ux * step;
    boss.y += uy * step;
  } else if (dist < 90) {
    boss.x -= ux * step * 0.6;
    boss.y -= uy * step * 0.6;
  } else {
    boss.x += -uy * boss.strafe * step * 0.6;
    boss.y += ux * boss.strafe * step * 0.6;
  }

  // Drinking a flask right in front of a boss is a bad idea.
  const drinker = livingPlayers().find((p) => p.drinking > 0);
  if (drinker && !boss.sawDrink && boss.spiralTime <= 0) {
    boss.sawDrink = true;
    boss.punish = true;
    boss.attackTimer = 0;
    floatText(boss.x, boss.y - boss.size - 6, "I see you drinking!", "#ff8b7d", 14);
  } else if (!drinker) {
    boss.sawDrink = false;
  }
  noticeHabits(boss);

  boss.attackTimer -= dt * (slow < 1 ? 0.6 : 1);
  if (boss.attackTimer <= 0 && boss.spiralTime <= 0) {
    const base = (boss.furious ? 1.25 : phase2 ? 1.7 : 2.6) * (boss.melee && !boss.isBig ? 0.8 : 1);
    boss.attackTimer = base * Math.max(0.6, 1 - room.tier * 0.013) * difficulty().attack * (boss.isBig ? 0.7 : boss.isDragon ? 0.75 : 1) * (boss.desperate ? 0.75 : 1);
    if (boss.isDragon) {
      runBossPattern(boss, phase2, room, ux, uy);
    } else {
      // Random wind-up length, plus a feint now and then on later bosses.
      boss.state = "tell";
      boss.tellTime = boss.punish ? 0.2 : boss.melee ? rand(0.15, 0.45) : rand(0.35, 0.8);
      boss.stateTimer = boss.tellTime;
      boss.feint = Math.random() < feintChance(boss, room) ? 0.5 : 0;
      boss.attackTimer = Math.max(0.5, boss.attackTimer - 0.55);
    }
  }
}

function feintChance(boss, room) {
  if (boss.punish) return 0;
  if (boss.isBig) return 0.35 + habitBonus();
  if (room.tier < 4) return habitBonus() * 0.5;
  return 0.15 + 0.1 * state.difficulty + habitBonus();
}

function runBossPattern(boss, phase2, room, ux, uy) {
  let pattern;
  if (boss.punish) {
    boss.punish = false;
    pattern = boss.isDragon ? "breath" : boss.melee ? "thrust" : "aim";
  } else {
    pattern = boss.patterns[boss.patternIndex % boss.patterns.length];
    boss.patternIndex += 1;
  }
  const speed = bulletSpeed(room);
  const aim = Math.atan2(uy, ux);
  const color = boss.shotColor || (boss.isDragon ? "#ff9b3d" : "#cf3fff");

  if (pattern === "aim") {
    const count = (phase2 ? 5 : 3) + Math.floor(room.tier / 8) * 2;
    const lead = leadAngle(boss, bossTarget(boss), speed);
    for (let i = 0; i < count; i += 1) enemyShot(boss, lead + (i - (count - 1) / 2) * 0.22, speed, { color });
    sfx.enemyShot();
  } else if (pattern === "ring") {
    const count = Math.min(24, (phase2 ? 15 : 9) + Math.floor(room.tier / 4));
    const offset = Math.random() * Math.PI;
    for (let i = 0; i < count; i += 1) enemyShot(boss, offset + (i / count) * Math.PI * 2, speed * 0.8, { color });
    addRing(boss.x, boss.y, 60, color, 0.3, 6);
    sfx.enemyShot();
  } else if (pattern === "spiral") {
    boss.spiralTime = phase2 ? 1.8 : 1.4;
    boss.spiralTick = 0;
    boss.spiralAngle = aim;
  } else if (pattern === "summon") {
    const living = room.enemies.filter((enemy) => enemy.hp > 0 && enemy.temp).length;
    const wanted = boss.isDragon || boss.isBig ? 3 : 2 + Math.floor(room.tier / 10);
    if (living < 5) {
      for (let i = 0; i < wanted; i += 1) {
        const type = boss.isDragon ? Math.floor(Math.random() * enemyTypes.length) : boss.isBig ? boss.minionType : boss.typeIndex;
        const angle = Math.random() * Math.PI * 2;
        const minion = makeEnemy(type, boss.x + Math.cos(angle) * 60, boss.y + Math.sin(angle) * 60, { tier: Math.min(room.tier, 20), temp: true, small: !boss.isDragon && !boss.isBig });
        minion.attackTimer = 1.2;
        room.enemies.push(minion);
        state.seenTypes.add(type);
        burst(minion.x, minion.y, [minion.type.color, "#ffffff"], 10, 140);
      }
      toast(boss.isDragon ? "Blocky called some friends!" : `${boss.name} called for help!`, 1.6);
    } else {
      runBossPattern(boss, phase2, room, ux, uy);
    }
  } else if (pattern === "charge") {
    boss.state = "windup";
    boss.stateTimer = boss.isDragon ? 0.75 : 0.45;
    const spot = leadPoint(bossTarget(boss), 0.35);
    const d = Math.hypot(spot.x - boss.x, spot.y - boss.y) || 1;
    boss.lockX = (spot.x - boss.x) / d;
    boss.lockY = (spot.y - boss.y) / d;
  } else if (pattern === "breath") {
    dragonBreath(boss, room);
    if (phase2) boss.breathFollow = 0.4;
  } else if (pattern === "rain") {
    // Things fall from the ceiling. Red circles show where they land.
    const count = 4 + boss.row + (phase2 ? 3 : 0);
    const spots = livingPlayers().map((p) => leadPoint(p, 0.6));
    for (let i = 0; i < count; i += 1) {
      const spot = spots[i] || { x: rand(TILE + 60, WIDTH - TILE - 60), y: rand(TILE + 60, HEIGHT - TILE - 60) };
      const life = 1.1 + i * 0.09;
      effects.push({ type: "hazard", x: spot.x, y: spot.y, radius: 52, life, max: life, damage: boss.damage, color, row: boss.row });
    }
    sfx.rumble();
  } else if (pattern === "slam") {
    const target = nearestPlayer(boss.x, boss.y);
    boss.state = "leap";
    boss.leapTime = phase2 ? 0.7 : 0.85;
    boss.stateTimer = boss.leapTime;
    boss.leapFromX = boss.x;
    boss.leapFromY = boss.y;
    boss.leapX = clamp(target.x, TILE + 60, WIDTH - TILE - 60);
    boss.leapY = clamp(target.y, TILE + 60, HEIGHT - TILE - 60);
    sfx.dash();
  } else if (pattern === "retreat") {
    boss.state = "retreat";
    boss.stateTimer = 0.55;
    boss.lockX = -ux;
    boss.lockY = -uy;
  } else if (pattern === "slash") {
    startSwings(boss, [{ kind: "arc", delay: 0.32, heavy: true }]);
  } else if (pattern === "combo") {
    // The last hit of a combo comes at a random moment, so mashing parry fails.
    const list = [{ kind: "arc", delay: 0.3 }, { kind: "arc", delay: rand(0.16, 0.38) }];
    const late = state.habits.parry > 4 ? 0.3 : 0;
    if (phase2 || room.tier >= 8 || boss.isBig) list.push({ kind: "arc", delay: rand(0.2, 0.7) + late, heavy: true });
    if (boss.desperate) list.push({ kind: "spin", delay: rand(0.25, 0.5), heavy: true });
    startSwings(boss, list);
  } else if (pattern === "thrust") {
    startSwings(boss, [{ kind: "thrust", delay: 0.36 }]);
  } else if (pattern === "spin") {
    startSwings(boss, [{ kind: "spin", delay: 0.5, heavy: true }]);
  } else if (pattern === "leapslash") {
    const target = nearestPlayer(boss.x, boss.y);
    boss.state = "leap";
    boss.leapTime = 0.6;
    boss.leapRadius = 90;
    boss.stateTimer = boss.leapTime;
    boss.leapFromX = boss.x;
    boss.leapFromY = boss.y;
    boss.leapX = clamp(target.x, TILE + 50, WIDTH - TILE - 50);
    boss.leapY = clamp(target.y, TILE + 50, HEIGHT - TILE - 50);
    sfx.dash();
  } else if (pattern === "teleport") {
    boss.state = "vanish";
    boss.stateTimer = 0.45;
    tone(600, 0.4, { type: "sine", volume: 0.06, slide: -450 });
  }
}

function bossSlam(boss, room) {
  const radius = 120;
  addShake(12);
  addRing(boss.x, boss.y, radius, boss.shotColor, 0.4, 14);
  burst(boss.x, boss.y + boss.size / 2, [boss.type.color, boss.type.accent, "#ffffff"], 30, 300);
  sfx.slam();
  for (const p of livingPlayers()) {
    if (Math.hypot(p.x - boss.x, p.y - boss.y) < radius + p.r) hurtPlayer(p, boss.damage * 1.3, boss.x, boss.y, boss);
  }
  const count = boss.enraged ? 16 : 10;
  const offset = Math.random() * Math.PI;
  for (let i = 0; i < count; i += 1) enemyShot(boss, offset + (i / count) * Math.PI * 2, bulletSpeed(room) * 0.7, { color: boss.shotColor });
}

function hazardImpact(effect) {
  addRing(effect.x, effect.y, effect.radius, effect.color, 0.3, 8);
  burst(effect.x, effect.y, [effect.color, "#ffffff", "rgba(80,80,80,0.6)"], 12, 200);
  addShake(3);
  noiseBurst(0.15, { volume: 0.08, freq: 600 });
  for (const p of livingPlayers()) {
    if (Math.hypot(p.x - effect.x, p.y - effect.y) < effect.radius + p.r * 0.5) hurtPlayer(p, effect.damage, effect.x, effect.y);
  }
}

function dragonBreath(boss, room) {
  const target = nearestPlayer(boss.x, boss.y);
  const aim = Math.atan2(target.y - boss.y, target.x - boss.x);
  for (let i = 0; i < 9; i += 1) {
    enemyShot(boss, aim + (i - 4) * 0.11, bulletSpeed(room) * rand(0.8, 1.05), { color: "#ff9b3d", r: 10, kind: "flame" });
  }
  burst(boss.x + Math.cos(aim) * 50, boss.y + Math.sin(aim) * 50, ["#ff9b3d", "#ffd28a", "#ef5b4b"], 14, 200);
  sfx.fireball();
}

function updateProjectiles(dt) {
  const room = currentRoom();
  const foes = livingFoes(room);

  for (const p of projectiles) {
    if (p.life <= 0) continue;
    if (p.homing) {
      // Feathers turn toward the closest enemy a little every frame.
      const [aim] = nearestFoes(p.x, p.y, 400, 1);
      if (aim) {
        const now = Math.atan2(p.vy, p.vx);
        const want = Math.atan2(aim.y - p.y, aim.x - p.x);
        const turn = clamp(Math.atan2(Math.sin(want - now), Math.cos(want - now)), -dt * 7, dt * 7);
        const speed = Math.hypot(p.vx, p.vy);
        p.vx = Math.cos(now + turn) * speed;
        p.vy = Math.sin(now + turn) * speed;
      }
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    p.spin += dt * 10;
    if (p.kind === "phoenix" && p.life <= 0) {
      burst(p.x, p.y, ["#ff742e", "#ffd166", "#ffffff"], 14, 200);
      continue;
    }

    if ((p.kind === "fireball" || p.kind === "phoenix") && Math.random() < 0.7) {
      particles.push({ x: p.x + rand(-6, 6), y: p.y + rand(-6, 6), vx: rand(-20, 20), vy: rand(-40, -10), life: 0.35, max: 0.35, size: rand(4, 8), color: pick(["#ff742e", "#ffd166", "#ef5b4b"]), gravity: 0, drag: 0.9, spin: 0, angle: 0 });
    }

    if (p.x < TILE - 2 || p.x > WIDTH - TILE + 2 || p.y < TILE - 2 || p.y > HEIGHT - TILE + 2) {
      projectileImpact(p);
      continue;
    }

    const crate = room.crates.find((c) => c.hp > 0 && circleHitsRect(p.x, p.y, p.r * 0.8, c));
    if (crate) {
      if (p.owner === "player") damageCrate(crate);
      projectileImpact(p);
      continue;
    }

    if (p.owner === "player") {
      const target = foes.find((enemy) => enemy.hp > 0 && enemy.alpha > 0.3 && !(p.hits && p.hits.has(enemy)) && Math.hypot(p.x - enemy.x, p.y - enemy.y) < p.r + enemy.size * 0.5);
      if (target && p.pierce) {
        p.hits.add(target);
        pierceHit(p, target);
      } else if (target) {
        // The fireball's own blast does the damage, so it can tell whether the target was frozen.
        if (p.kind !== "fireball") damageEnemy(target, p.damage, p.petEvo === "flame" ? "fire" : p.petEvo === "frost" ? "frost" : p.petEvo === "storm" ? "zap" : "staff");
        if (p.petEvo) petSparkHit(p, target);
        if (p.petSlime) target.stickyUntil = Math.max(target.stickyUntil || 0, state.clock + 1.2);
        projectileImpact(p, target);
      }
    } else {
      for (const hero of livingPlayers()) {
        const d = Math.hypot(p.x - hero.x, p.y - hero.y) || 1;
        if (hero.shield > 0 && d < 36 + p.r) {
          p.owner = "player";
          p.kind = "reflect";
          p.color = "#ff9ff3";
          p.damage = stats.reflectDamage * spellPower();
          const length = Math.hypot(p.vx, p.vy) || 1;
          p.vx = ((p.x - hero.x) / d) * length * 1.3;
          p.vy = ((p.y - hero.y) / d) * length * 1.3;
          p.life = 1.2;
          sfx.bubble();
          break;
        } else if (d < p.r * 0.8 + hero.r * 0.75) {
          const result = hurtPlayer(hero, p.damage, p.x - p.vx, p.y - p.vy, null);
          if (result === "parry") {
            // A parried shot flies back faster and harder.
            p.owner = "player";
            p.kind = "reflect";
            p.color = "#f6c85f";
            p.damage = stats.reflectDamage * spellPower() * 1.5;
            p.vx *= -1.5;
            p.vy *= -1.5;
            p.life = 1.2;
            break;
          }
          if (result === "dodge" || (!result && hero.dashTime > 0)) continue;
          p.life = 0;
          burst(p.x, p.y, [p.color, "#ffffff"], 6, 120);
          break;
        }
      }
    }
  }

  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    if (projectiles[i].life <= 0) projectiles.splice(i, 1);
  }
}

// Phoenixes and ice spikes fly through enemies, hitting each one once.
function pierceHit(p, enemy) {
  if (p.kind === "phoenix") {
    // A small blast on every enemy the bird flies through.
    explode(enemy.x, enemy.y, enemy, p.damage, 0.6, 0.5);
  } else {
    enemy.burnUntil = 0;
    enemy.slowUntil = Math.max(enemy.slowUntil, state.clock + 1.6);
    burst(enemy.x, enemy.y, ["#ffffff", "#9be7ff"], 6, 140);
    damageEnemy(enemy, p.damage, "frost");
  }
}

// Evolved Pixel's sparks burn, freeze or jump to a second enemy.
function petSparkHit(p, target) {
  if (p.petEvo === "flame") {
    if (!isBurning(target)) target.burnTick = 0.5;
    target.burnUntil = Math.max(target.burnUntil || 0, state.clock + 3);
  } else if (p.petEvo === "frost") {
    target.slowUntil = Math.max(target.slowUntil, state.clock + 1.4);
    target.burnUntil = 0;
  } else if (p.petEvo === "storm") {
    const next = livingFoes(currentRoom())
      .filter((enemy) => enemy !== target && enemy.alpha > 0.3 && !enemy.friendly && distance(enemy, target) < 200)
      .sort((a, b) => distance(a, target) - distance(b, target))[0];
    if (next) {
      effects.push({ type: "bolt", points: [{ x: target.x, y: target.y }, { x: next.x, y: next.y }], life: 0.15, max: 0.15 });
      damageEnemy(next, p.damage * 0.7, "zap");
    }
  }
}

function projectileImpact(p, target = null) {
  p.life = 0;
  if (p.kind === "fireball") explode(p.x, p.y, target, p.damage);
  else if (p.kind === "phoenix") burst(p.x, p.y, ["#ff742e", "#ffd166", "#ffffff"], 14, 200);
  else burst(p.x, p.y, [p.color, "#ffffff"], 4, 90);
}

// A fireball blast sets enemies on fire. If it lands on something frozen, or
// inside a frosty puddle, the ice turns into a giant Steam Blast instead.
function explode(x, y, target = null, direct = 0, size = 1, power = 1) {
  const steam = Boolean((target && isFrozen(target)) || inFrostField(x, y));
  const gas = !steam && inPoison(x, y);
  const radius = stats.boomRadius * size * (steam ? 1.6 : gas ? 1.7 : 1);
  const splash = stats.boomDamage * spellPower() * power;
  const comboMult = steam ? 1.6 : gas ? 1.7 : 1;
  if (gas) {
    addRing(x, y, radius, "#b5e86b", 0.55, 20);
    addRing(x, y, radius * 0.6, "#ff742e", 0.4, 12);
    burst(x, y, ["#b5e86b", "#7bd35a", "#ff742e", "#ffd166"], 56, 420, { lifeScale: 1.4, sizeScale: 1.5 });
    noiseBurst(0.7, { volume: 0.2, freq: 900 });
    tone(90, 0.5, { type: "sawtooth", volume: 0.09, slide: -50 });
    addShake(12);
    discoverCombo("gasboom", x, y);
    for (const pool of effects) {
      if (pool.type === "poison" && Math.hypot(x - pool.x, y - pool.y) < pool.radius + radius) pool.life = Math.min(pool.life, 0.2);
    }
  } else if (steam) {
    addRing(x, y, radius, "#e6f7ff", 0.5, 18);
    addRing(x, y, radius * 0.6, "#9be7ff", 0.35, 10);
    burst(x, y, ["#ffffff", "#e6f7ff", "#cfe9f2", "#9be7ff"], 46, 380, { lifeScale: 1.6, sizeScale: 1.6, drag: 0.94, lift: 60 });
    noiseBurst(0.6, { volume: 0.16, freq: 2600 });
    tone(180, 0.4, { type: "triangle", volume: 0.09, slide: 260 });
    addShake(9);
    discoverCombo("steam", x, y);
    for (const field of effects) {
      if (field.type === "frostfield" && Math.hypot(x - field.x, y - field.y) < field.radius + radius) field.life = Math.min(field.life, 0.3);
    }
  } else {
    addRing(x, y, radius, "#ff8a24", 0.35, 14);
    burst(x, y, ["#ff742e", "#ffd166", "#ef5b4b", "#3a2516"], 30, 320);
    addShake(6);
    sfx.boom();
  }
  if (target && target.hp > 0 && direct) damageEnemy(target, direct * (steam ? comboBonus(target, 1.25) : 1), steam ? "steam" : "fire");
  for (const enemy of livingFoes(currentRoom())) {
    if (Math.hypot(enemy.x - x, enemy.y - y) > radius + enemy.size / 2) continue;
    if (steam) {
      enemy.slowUntil = 0;
    } else {
      enemy.burnUntil = state.clock + 4;
      enemy.burnTick = 0.5;
    }
    damageEnemy(enemy, splash * comboBonus(enemy, comboMult), steam ? "steam" : "fire");
    if (steam || gas) noteCombo(enemy);
  }
  for (const crate of currentRoom().crates) {
    if (crate.hp > 0 && circleHitsRect(x, y, radius * 0.6, crate)) damageCrate(crate);
  }
}

function updatePickups(dt) {
  for (const item of pickups) {
    item.t += dt;
    item.x += item.vx * dt;
    item.y += item.vy * dt;
    const drag = Math.pow(0.02, dt);
    item.vx *= drag;
    item.vy *= drag;
    item.x = clamp(item.x, TILE + 8, WIDTH - TILE - 8);
    item.y = clamp(item.y, TILE + 8, HEIGHT - TILE - 8);

    // Each treat flies to the closest wizard who can use it.
    let taker = null;
    let d = Infinity;
    for (const p of livingPlayers()) {
      const wants = item.kind === "heart" ? p.hp < stats.maxHp : item.kind === "star" ? p.mana < stats.maxMana : true;
      const gap = Math.hypot(p.x - item.x, p.y - item.y) || 1;
      if (wants && gap < d) {
        taker = p;
        d = gap;
      }
    }
    if (!taker) continue;
    if (item.t > 0.35 && d < stats.magnet) {
      const pull = 520 * (1 - d / stats.magnet) + 120;
      item.x += ((taker.x - item.x) / d) * pull * dt;
      item.y += ((taker.y - item.y) / d) * pull * dt;
    }
    if (item.t > 0.25 && d < taker.r + 12) {
      item.taken = true;
      collectPickup(item, taker);
    }
  }
  for (let i = pickups.length - 1; i >= 0; i -= 1) {
    if (pickups[i].taken) pickups.splice(i, 1);
  }
}

function updateEffects(dt) {
  const landed = [];
  for (const effect of effects) {
    effect.life -= dt;
    if (effect.life <= 0 && ["meteor", "storm", "hazard", "flask", "orb"].includes(effect.type)) landed.push(effect);
    if (effect.type === "blizzard") updateBlizzard(effect, dt);
    if (effect.type === "firetrail") updateFireTrail(effect, dt);
    if (effect.type === "poison") updatePoison(effect, dt);
    if (effect.type === "orb" && effect.life > 0) updateBallLightning(effect, dt);
    if (effect.type === "heal" && effect.life > 0) updateHealBubble(effect, dt);
    if (effect.type === "emberfire" && effect.life > 0) updateEmberFire(effect, dt);
  }
  for (let i = effects.length - 1; i >= 0; i -= 1) {
    if (effects[i].life <= 0) effects.splice(i, 1);
  }
  for (const effect of landed) {
    if (effect.type === "meteor") meteorImpact(effect);
    else if (effect.type === "hazard") hazardImpact(effect);
    else if (effect.type === "flask") flaskLand(effect);
    else if (effect.type === "orb") ballLightningPop(effect);
    else thunderStrike(effect);
  }
  for (const crate of currentRoom().crates) crate.wobble = Math.max(0, crate.wobble - dt);
}

function updateBlizzard(b, dt) {
  const owner = players[b.owner];
  if (owner && owner.hp > 0) {
    b.x += (owner.x - b.x) * Math.min(1, dt * 8);
    b.y += (owner.y - b.y) * Math.min(1, dt * 8);
  }
  for (const projectile of projectiles) {
    if (projectile.owner === "enemy" && projectile.life > 0 && Math.hypot(projectile.x - b.x, projectile.y - b.y) < b.radius * 0.8) {
      projectile.life = 0;
      burst(projectile.x, projectile.y, ["#ffffff", "#9be7ff"], 3, 80);
    }
  }
  b.tick -= dt;
  if (b.tick > 0) return;
  b.tick = 0.5;
  for (const enemy of livingFoes(currentRoom())) {
    if (Math.hypot(enemy.x - b.x, enemy.y - b.y) > b.radius + enemy.size / 2) continue;
    enemy.slowUntil = Math.max(enemy.slowUntil, state.clock + 1.2);
    enemy.burnUntil = 0;
    damageEnemy(enemy, stats.novaDamage * 0.25 * spellPower(), "frost");
  }
}

function updateFireTrail(f, dt) {
  f.tick = (f.tick || 0) - dt;
  if (f.tick > 0) return;
  f.tick = 0.25;
  for (const enemy of livingFoes(currentRoom())) {
    if (Math.hypot(enemy.x - f.x, enemy.y - f.y) > f.radius + enemy.size / 2) continue;
    if (!isBurning(enemy)) enemy.burnTick = 0.3;
    enemy.burnUntil = Math.max(enemy.burnUntil || 0, state.clock + 2.5);
  }
}

// Rainbow Fortress orbs spin around the wizard while the bubble is up.
function orbSpots(p) {
  const spots = [];
  const count = stats.mega.shield ? 5 : 3;
  for (let k = 0; k < count; k += 1) {
    const angle = state.anim * 3.2 + (k * Math.PI * 2) / count;
    spots.push({ x: p.x + Math.cos(angle) * 62, y: p.y - 6 + Math.sin(angle) * 62 });
  }
  return spots;
}

function updateOrbs(p) {
  if (!evoIs("shield", "fortress") || p.shield <= 0 || p.hp <= 0) return;
  const spots = orbSpots(p);
  for (const enemy of livingFoes(currentRoom())) {
    if ((enemy.orbCd || 0) > state.clock) continue;
    if (spots.some((s) => Math.hypot(enemy.x - s.x, enemy.y - s.y) < 14 + enemy.size / 2)) {
      enemy.orbCd = state.clock + 0.35;
      damageEnemy(enemy, 16 * spellPower(), "zap");
    }
  }
  for (const projectile of projectiles) {
    if (projectile.owner !== "enemy" || projectile.life <= 0) continue;
    if (spots.some((s) => Math.hypot(projectile.x - s.x, projectile.y - s.y) < 14 + projectile.r)) {
      projectile.life = 0;
      burst(projectile.x, projectile.y, ["#ff9ff3", "#ffffff"], 4, 90);
    }
  }
}

/* ---------- evolved dashes ---------- */

function dashColor() {
  return dashKinds[stats.dash].color;
}

function updateDashPower(p) {
  if (stats.dash === "normal") return;
  const kind = stats.dash;
  for (const enemy of livingFoes(currentRoom())) {
    if (p.dashHits.has(enemy) || Math.hypot(enemy.x - p.x, enemy.y - p.y) > 30 + enemy.size / 2) continue;
    p.dashHits.add(enemy);
    const boost = stats.dashMega ? 1.8 : 1;
    if (kind === "fire") {
      enemy.burnUntil = state.clock + 4;
      enemy.burnTick = 0.4;
      damageEnemy(enemy, 22 * spellPower() * boost, "fire");
    } else if (kind === "frost") {
      enemy.slowUntil = Math.max(enemy.slowUntil, state.clock + stats.novaSlow * (stats.dashMega ? 1.5 : 1));
      enemy.burnUntil = 0;
      damageEnemy(enemy, 18 * spellPower() * boost, "frost");
    } else {
      burst(enemy.x, enemy.y, ["#ffe45c", "#ffffff"], 8, 180);
      damageEnemy(enemy, 26 * spellPower() * boost, "zap");
    }
  }
  if (kind === "fire") {
    const last = effects.findLast ? effects.findLast((e) => e.type === "firetrail") : null;
    if ((!last || Math.hypot(last.x - p.x, last.y - p.y) > 22) && effects.length < 120) {
      effects.push({ type: "firetrail", x: p.x, y: p.y + 8, radius: 24, life: 2.4, max: 2.4, seed: Math.random() * 10 });
    }
  }
}

function finishDash(p) {
  if (stats.dash === "fire" && stats.dashMega) {
    explode(p.x, p.y, null, 0, 0.8, 0.8);
  } else if (stats.dash === "frost") {
    const big = stats.dashMega;
    effects.push({ type: "frostfield", x: p.x, y: p.y, radius: big ? 120 : 70, life: big ? 4 : 2.6, max: big ? 4 : 2.6, seed: Math.random() * 10 });
    burst(p.x, p.y, ["#ffffff", "#9be7ff"], 14, 200);
    tone(1500, 0.2, { type: "triangle", volume: 0.05, slide: -700 });
  } else if (stats.dash === "thunder") {
    const foes = livingFoes(currentRoom())
      .filter((enemy) => enemy.alpha > 0.3 && !enemy.friendly && distance(enemy, p) < (stats.dashMega ? 300 : 230))
      .sort((a, b) => distance(a, p) - distance(b, p))
      .slice(0, stats.dashMega ? 6 : 3);
    for (const enemy of foes) {
      effects.push({ type: "bolt", points: [{ x: p.x, y: p.y }, { x: enemy.x, y: enemy.y }], life: 0.25, max: 0.25 });
      zapHit(enemy, stats.zapDamage * 0.5 * spellPower() * (stats.dashMega ? 1.5 : 1));
    }
    if (foes.length) sfx.zap();
  }
}

function updateParticles(dt) {
  for (const p of particles) {
    p.life -= dt;
    p.vy += p.gravity * dt;
    const drag = Math.pow(p.drag, dt * 60);
    p.vx *= drag;
    p.vy *= drag;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.angle += p.spin * dt;
  }
  // Keep the living ones in order and hand the dead ones back to the pool.
  let alive = 0;
  for (let i = 0; i < particles.length; i += 1) {
    const p = particles[i];
    if (p.life > 0) particles[alive++] = p;
    else if (particlePool.length < 800) particlePool.push(p);
  }
  particles.length = alive;
}

function updateFloatTexts(dt) {
  for (const t of floatTexts) {
    t.life -= dt;
    t.y -= 34 * dt;
  }
  for (let i = floatTexts.length - 1; i >= 0; i -= 1) {
    if (floatTexts[i].life <= 0) floatTexts.splice(i, 1);
  }
}

function updateBanners(dt) {
  // Banners wait while a menu covers the room, so none get missed.
  if (!banners.length || state.mode !== "playing") return;
  banners[0].time -= dt;
  if (banners[0].time <= 0) banners.shift();
}

function updateAmbient(dt) {
  const room = state.mode === "title" ? rooms[0] : currentRoom();
  const kind = room.biome.ambient;
  if (ambient.length < 34 && Math.random() < dt * 14) {
    const a = { kind, x: rand(TILE, WIDTH - TILE), y: rand(TILE, HEIGHT - TILE), vx: 0, vy: 0, life: rand(3, 6), max: 6, seed: Math.random() * 10 };
    if (kind === "ember") { a.y = HEIGHT - TILE; a.vy = rand(-50, -25); }
    if (kind === "snow") { a.y = TILE; a.vy = rand(20, 45); a.vx = rand(-10, 10); }
    if (kind === "sand") { a.x = TILE; a.vx = rand(40, 80); a.vy = rand(-5, 5); }
    if (kind === "dust") { a.vx = rand(-6, 6); a.vy = rand(-6, 6); }
    if (kind === "spore") { a.vy = rand(-14, -6); a.vx = rand(-6, 6); }
    a.max = a.life;
    ambient.push(a);
  }
  for (const a of ambient) {
    a.life -= dt;
    a.x += (a.vx + (a.kind === "firefly" ? Math.sin(state.anim * 2 + a.seed) * 18 : 0)) * dt;
    a.y += (a.vy + (a.kind === "firefly" ? Math.cos(state.anim * 1.6 + a.seed) * 14 : 0)) * dt;
  }
  for (let i = ambient.length - 1; i >= 0; i -= 1) {
    if (ambient[i].life <= 0) ambient.splice(i, 1);
  }
}

/* ---------- drawing: room ---------- */

const bgCanvas = document.createElement("canvas");
bgCanvas.width = WIDTH;
bgCanvas.height = HEIGHT;
const bgCtx = bgCanvas.getContext("2d");
let bgRoomIndex = -1;

function renderRoomBackground(room) {
  const g = bgCtx;
  const b = room.biome;
  const rng = mulberry32(room.index * 131 + 7);
  bgRoomIndex = room.index;

  for (let y = 0; y < HEIGHT; y += TILE) {
    for (let x = 0; x < WIDTH; x += TILE) {
      const checker = (x / TILE + y / TILE + room.index) % 2 === 0;
      g.fillStyle = checker ? b.floor : b.floor2;
      g.fillRect(x, y, TILE, TILE);
      const v = rng();
      g.fillStyle = v < 0.5 ? `rgba(0, 0, 0, ${v * 0.1})` : `rgba(255, 255, 255, ${(v - 0.5) * 0.08})`;
      g.fillRect(x, y, TILE, TILE);
      g.fillStyle = "rgba(0, 0, 0, 0.08)";
      g.fillRect(x, y + TILE - 4, TILE, 4);
      g.fillStyle = "rgba(255, 255, 255, 0.05)";
      g.fillRect(x + 4, y + 4, 10, 4);
    }
  }

  if (room.arena) {
    drawArenaFloor(g, room, rng);
  } else {
    const decorCount = 46;
    for (let i = 0; i < decorCount; i += 1) {
      const x = TILE + 8 + rng() * (WIDTH - 2 * TILE - 16);
      const y = TILE + 8 + rng() * (HEIGHT - 2 * TILE - 16);
      drawDecor(g, b.ambient, x, y, rng, room.final);
    }
  }

  // Walls with a simple brick pattern.
  g.fillStyle = b.wall;
  g.fillRect(0, 0, WIDTH, TILE);
  g.fillRect(0, HEIGHT - TILE, WIDTH, TILE);
  g.fillRect(0, 0, TILE, HEIGHT);
  g.fillRect(WIDTH - TILE, 0, TILE, HEIGHT);
  g.fillStyle = "rgba(0, 0, 0, 0.22)";
  for (let x = 0; x < WIDTH; x += 16) {
    for (const y of [0, HEIGHT - TILE]) {
      g.fillRect(x, y + ((x / 16) % 2 === 0 ? 15 : 0), 16, 2);
      g.fillRect(x + ((y / 16) % 2 === 0 ? 0 : 8), y, 2, TILE);
    }
  }
  for (let y = 0; y < HEIGHT; y += 16) {
    for (const x of [0, WIDTH - TILE]) {
      g.fillRect(x, y, TILE, 2);
      g.fillRect(x + ((y / 16) % 2 === 0 ? 15 : 4), y, 2, 16);
    }
  }
  g.fillStyle = "rgba(255, 255, 255, 0.12)";
  g.fillRect(TILE, TILE - 4, WIDTH - 2 * TILE, 4);
  g.fillStyle = "rgba(0, 0, 0, 0.25)";
  g.fillRect(TILE, TILE, WIDTH - 2 * TILE, 6);
  g.fillRect(TILE, TILE, 6, HEIGHT - 2 * TILE);

  const doors = roomDoors(room);
  if (doors.up) carveDoor(g, WIDTH / 2 - DOOR_HALF, 0, DOOR_HALF * 2, TILE, b);
  if (doors.down) carveDoor(g, WIDTH / 2 - DOOR_HALF, HEIGHT - TILE, DOOR_HALF * 2, TILE, b);
  // Gates get a doorway even while locked; the bars are drawn on top each frame.
  if (doors.left || room.arena) carveDoor(g, 0, HEIGHT / 2 - DOOR_HALF, TILE, DOOR_HALF * 2, b);
  if (doors.right || isRowEnd(room)) carveDoor(g, WIDTH - TILE, HEIGHT / 2 - DOOR_HALF, TILE, DOOR_HALF * 2, b);
}

const ARENA_COLORS = {
  bones: ["#5b2a6e", "#f6c85f"],
  lava: ["#2a0f0a", "#ff7a2e"],
  ice: ["#e8fbff", "#5fb8e0"],
  graves: ["#5a1830", "#c0254a"],
  crystals: ["#2a1f55", "#d6c7ff"]
};

// Big boss arenas get a carpet to the throne, a ring where the boss stands,
// braziers in the corners and decorations that match the biome.
function drawArenaFloor(g, room, rng) {
  const deco = room.biome.deco;
  const [base, trim] = ARENA_COLORS[deco];
  g.fillStyle = trim;
  g.fillRect(TILE, HEIGHT / 2 - 52, WIDTH - 2 * TILE, 104);
  g.fillStyle = base;
  g.fillRect(TILE, HEIGHT / 2 - 46, WIDTH - 2 * TILE, 92);
  g.fillStyle = trim;
  for (let x = TILE + 40; x < WIDTH - TILE - 120; x += 64) {
    g.fillRect(x, HEIGHT / 2 - 4, 8, 8);
    g.fillRect(x - 8, HEIGHT / 2 - 2, 4, 4);
    g.fillRect(x + 12, HEIGHT / 2 - 2, 4, 4);
  }

  g.globalAlpha = 0.45;
  g.strokeStyle = trim;
  g.lineWidth = 6;
  for (const r of [96, 124]) {
    g.beginPath();
    g.arc(WIDTH - 260, HEIGHT / 2, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.globalAlpha = 1;

  const tx = WIDTH - TILE - 70;
  const ty = HEIGHT / 2 - 70;
  g.fillStyle = "#1a120c";
  g.fillRect(tx, ty, 64, 140);
  g.fillStyle = base;
  g.fillRect(tx + 4, ty + 4, 56, 132);
  g.fillStyle = trim;
  g.fillRect(tx + 4, ty + 4, 56, 6);
  g.fillRect(tx + 4, ty + 64, 56, 6);
  g.fillRect(tx + 6, ty - 10, 8, 12);
  g.fillRect(tx + 28, ty - 16, 8, 18);
  g.fillRect(tx + 50, ty - 10, 8, 12);

  for (let i = 0; i < 40; i += 1) {
    const x = TILE + 12 + rng() * (WIDTH - 2 * TILE - 40);
    const y = TILE + 12 + rng() * (HEIGHT - 2 * TILE - 40);
    if (Math.abs(y - HEIGHT / 2) < 70) continue;
    drawArenaDecor(g, deco, x, y, rng);
  }

  for (const [bx, by] of [[TILE + 24, TILE + 24], [WIDTH - TILE - 44, TILE + 24], [TILE + 24, HEIGHT - TILE - 44], [WIDTH - TILE - 44, HEIGHT - TILE - 44]]) {
    g.fillStyle = "#3a2a1c";
    g.fillRect(bx, by + 8, 20, 14);
    g.fillStyle = trim;
    g.fillRect(bx + 4, by, 12, 10);
    g.fillStyle = "#ffd166";
    g.fillRect(bx + 7, by + 2, 6, 6);
  }
}

function drawArenaDecor(g, kind, x, y, rng) {
  const roll = rng();
  switch (kind) {
    case "bones":
      g.fillStyle = "#e8e2cf";
      if (roll < 0.7) {
        g.fillRect(x, y + 2, 14, 3);
        g.fillRect(x - 2, y, 4, 7);
        g.fillRect(x + 12, y, 4, 7);
      } else {
        g.fillRect(x, y, 12, 10);
        g.fillRect(x + 2, y + 10, 8, 3);
        g.fillStyle = "#26211c";
        g.fillRect(x + 2, y + 3, 3, 3);
        g.fillRect(x + 7, y + 3, 3, 3);
      }
      break;
    case "lava":
      if (roll < 0.45) {
        g.fillStyle = "#ff7a2e";
        g.fillRect(x, y, 22, 10);
        g.fillRect(x + 4, y - 4, 12, 18);
        g.fillStyle = "#ffd166";
        g.fillRect(x + 6, y + 1, 8, 6);
      } else {
        g.fillStyle = "#1e0e0a";
        g.fillRect(x, y, 12, 9);
        g.fillStyle = "#ff7a2e";
        g.fillRect(x + 3, y + 3, 6, 2);
      }
      break;
    case "ice":
      if (roll < 0.6) {
        g.fillStyle = "#e8fbff";
        g.fillRect(x, y, 6, 14);
        g.fillRect(x + 6, y + 5, 5, 9);
        g.fillStyle = "#5fb8e0";
        g.fillRect(x + 1, y + 2, 2, 8);
      } else {
        g.fillStyle = "rgba(255, 255, 255, 0.5)";
        g.fillRect(x, y, 26, 8);
        g.fillRect(x + 6, y - 4, 14, 4);
      }
      break;
    case "graves":
      if (roll < 0.5) {
        g.fillStyle = "rgba(0, 0, 0, 0.3)";
        g.fillRect(x, y + 20, 18, 4);
        g.fillStyle = "#4b465c";
        g.fillRect(x, y, 16, 20);
        g.fillRect(x + 2, y - 3, 12, 3);
        g.fillStyle = "#2a2538";
        g.fillRect(x + 7, y + 4, 2, 9);
        g.fillRect(x + 4, y + 7, 8, 2);
      } else if (roll < 0.75) {
        g.fillStyle = "#f2e6c8";
        g.fillRect(x, y, 4, 8);
        g.fillStyle = "#ffd166";
        g.fillRect(x + 1, y - 4, 2, 4);
      } else {
        g.fillStyle = "rgba(192, 132, 252, 0.25)";
        g.fillRect(x, y, 18, 18);
      }
      break;
    case "crystals":
      g.fillStyle = roll < 0.5 ? "#8f6cff" : "#c084fc";
      g.fillRect(x, y, 6, 14);
      g.fillRect(x + 7, y + 4, 5, 10);
      g.fillRect(x - 5, y + 6, 4, 8);
      g.fillStyle = "#e0d4ff";
      g.fillRect(x + 1, y + 1, 2, 6);
      break;
    default:
      break;
  }
}

function carveDoor(g, x, y, w, h, biome) {
  g.fillStyle = biome.floor2;
  g.fillRect(x, y, w, h);
  g.fillStyle = "rgba(0, 0, 0, 0.35)";
  g.fillRect(x, y, w, h);
  g.fillStyle = "#f0c05a";
  if (w > h) {
    g.fillRect(x - 6, y, 6, h);
    g.fillRect(x + w, y, 6, h);
  } else {
    g.fillRect(x, y - 6, w, 6);
    g.fillRect(x, y + h, w, 6);
  }
}

function drawDecor(g, kind, x, y, rng, final) {
  const roll = rng();
  if (final) {
    g.fillStyle = roll < 0.5 ? "#f6c85f" : "#d9a33a";
    g.fillRect(x, y, 6, 4);
    g.fillRect(x + 3, y - 3, 6, 4);
    return;
  }
  switch (kind) {
    case "firefly":
      if (roll < 0.5) {
        g.fillStyle = pickColor(rng, ["#ffd166", "#ff9ff3", "#ffffff", "#9be7ff"]);
        g.fillRect(x, y, 4, 4);
        g.fillRect(x - 4, y + 4, 4, 4);
        g.fillRect(x + 4, y + 4, 4, 4);
        g.fillRect(x, y + 8, 4, 4);
        g.fillStyle = "#ffe45c";
        g.fillRect(x, y + 4, 4, 4);
      } else {
        g.fillStyle = "rgba(20, 60, 20, 0.35)";
        g.fillRect(x, y, 3, 8);
        g.fillRect(x + 5, y + 2, 3, 6);
        g.fillRect(x - 5, y + 3, 3, 5);
      }
      break;
    case "dust":
      g.fillStyle = roll < 0.12 ? "#f6c85f" : roll < 0.2 ? "#7ee7f0" : "rgba(30, 30, 30, 0.35)";
      g.fillRect(x, y, roll < 0.2 ? 5 : 7, roll < 0.2 ? 5 : 5);
      break;
    case "ember":
      g.fillStyle = roll < 0.4 ? "rgba(255, 120, 40, 0.45)" : "rgba(0, 0, 0, 0.25)";
      g.fillRect(x, y, 14, 3);
      g.fillRect(x + 10, y + 3, 3, 8);
      break;
    case "snow":
      g.fillStyle = "rgba(255, 255, 255, 0.55)";
      g.fillRect(x, y, 3, 3);
      if (roll < 0.3) {
        g.fillRect(x - 3, y, 9, 1);
        g.fillRect(x + 1, y - 3, 1, 9);
      }
      break;
    case "sand":
      if (roll < 0.15) {
        g.fillStyle = "#3f8f4a";
        g.fillRect(x, y, 6, 16);
        g.fillRect(x - 5, y + 4, 5, 3);
        g.fillRect(x + 6, y + 7, 5, 3);
      } else {
        g.fillStyle = "rgba(120, 90, 40, 0.35)";
        g.fillRect(x, y, 10, 2);
      }
      break;
    case "spore":
      if (roll < 0.25) {
        g.fillStyle = "#d94d3f";
        g.fillRect(x - 4, y, 12, 5);
        g.fillStyle = "#ffffff";
        g.fillRect(x - 1, y + 1, 2, 2);
        g.fillStyle = "#e8dcc4";
        g.fillRect(x, y + 5, 4, 5);
      } else {
        g.fillStyle = "rgba(120, 170, 80, 0.35)";
        g.fillRect(x, y, 8, 4);
      }
      break;
    default:
      break;
  }
}

function pickColor(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

function drawRoom(room) {
  if (bgRoomIndex !== room.index) renderRoomBackground(room);
  ctx.drawImage(bgCanvas, 0, 0);

  if (state.mode !== "title" && isRoomCleared(room)) {
    const doors = roomDoors(room);
    const pulse = 0.45 + Math.sin(state.anim * 5) * 0.3;
    ctx.fillStyle = `rgba(246, 200, 95, ${pulse})`;
    if (doors.up) drawChevron(WIDTH / 2, 16, 0, -1);
    if (doors.down) drawChevron(WIDTH / 2, HEIGHT - 16, 0, 1);
    if (doors.left) drawChevron(16, HEIGHT / 2, -1, 0);
    if (doors.right) drawChevron(WIDTH - 16, HEIGHT / 2, 1, 0);
  }

  if (room.index === 0 && state.portalOpen && !state.won && state.mode !== "title") drawPortal(WIDTH / 2, HEIGHT / 2);
  drawGate(room);
}

// The big gate on the right of each row's last room, and the arena door
// that stays barred while the big boss is awake.
function drawGate(room) {
  if (state.mode === "title") return;
  let x;
  let row;
  let locked;
  if (room.arena) {
    x = 0;
    row = room.row;
    locked = Boolean(room.boss && room.boss.hp > 0);
  } else if (isRowEnd(room)) {
    x = WIDTH - TILE;
    row = Math.floor(room.index / ROOM_COLS);
    locked = !gateOpen(row);
  } else {
    return;
  }
  const y = HEIGHT / 2 - DOOR_HALF;
  const h = DOOR_HALF * 2;
  if (locked) {
    ctx.fillStyle = "#120c08";
    ctx.fillRect(x, y, TILE, h);
    for (const bx of [3, 13, 23]) {
      ctx.fillStyle = "#5d6470";
      ctx.fillRect(x + bx, y, 6, h);
      ctx.fillStyle = "#8a93a3";
      ctx.fillRect(x + bx, y, 2, h);
    }
    ctx.fillStyle = "#3d434c";
    ctx.fillRect(x, y + 18, TILE, 6);
    ctx.fillRect(x, y + h - 24, TILE, 6);
    ctx.strokeStyle = "#f6c85f";
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 11, y + h / 2 - 13, 10, 9);
    ctx.fillStyle = "#8a5f12";
    ctx.fillRect(x + 7, y + h / 2 - 6, 18, 16);
    ctx.fillStyle = "#f6c85f";
    ctx.fillRect(x + 8, y + h / 2 - 5, 16, 14);
    ctx.fillStyle = "#3a2a10";
    ctx.fillRect(x + 15, y + h / 2, 3, 5);
  } else if (!room.arena && !state.bigBeaten.has(row)) {
    const pulse = 0.45 + Math.sin(state.anim * 4) * 0.25;
    ctx.fillStyle = `rgba(192, 132, 252, ${pulse})`;
    ctx.fillRect(x + 4, y + 4, TILE - 4, h - 8);
    if (Math.random() < 0.2) burst(x + rand(6, TILE), y + rand(10, h - 10), ["#c084fc", "#f6c85f"], 1, 50);
  }
  if (!room.arena) {
    const beaten = state.bigBeaten.has(row);
    const label = beaten ? "Big boss beaten!" : locked ? `Big boss gate ${rowBossesBeaten(row)}/${ROOM_COLS}` : "BIG BOSS!";
    const color = beaten ? "#9ee49c" : locked ? "#c5a988" : "#c084fc";
    outlinedText(label, WIDTH - TILE - 10, y - 12, { size: 14, align: "right", color, font: DISPLAY_FONT });
  }
}

function drawChevron(x, y, dx, dy) {
  const bounce = reducedMotion ? 0 : Math.sin(state.anim * 6) * 3;
  ctx.save();
  ctx.translate(x + dx * bounce, y + dy * bounce);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-4, -12);
  ctx.lineTo(-4, 12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPortal(x, y) {
  const t = state.anim;
  ctx.save();
  ctx.translate(x, y);
  for (let i = 0; i < 4; i += 1) {
    ctx.rotate(t * (0.8 + i * 0.3));
    ctx.fillStyle = i % 2 === 0 ? "rgba(246, 200, 95, 0.7)" : "rgba(139, 92, 246, 0.7)";
    const s = 54 - i * 12;
    ctx.fillRect(-s / 2, -s / 2, s, s);
  }
  ctx.restore();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x - 5, y - 5, 10, 10);
  if (Math.random() < 0.3) burst(x + rand(-20, 20), y + rand(-20, 20), ["#f6c85f", "#c084fc"], 1, 60);
  outlinedText("Step in!", x, y - 44, { size: 16, color: "#f6c85f", align: "center" });
}

function drawCrates(room) {
  for (const crate of room.crates) {
    if (crate.hp <= 0) continue;
    const wobble = crate.wobble > 0 ? Math.sin(crate.wobble * 60) * 2 : 0;
    const x = crate.x + wobble;
    const y = crate.y;
    const ice = room.biome.ambient === "snow";
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.fillRect(x + 4, y + crate.h - 2, crate.w, 6);
    ctx.fillStyle = ice ? "#bfe9f7" : "#a0703c";
    ctx.fillRect(x, y, crate.w, crate.h);
    ctx.fillStyle = ice ? "#e9faff" : "#c08850";
    ctx.fillRect(x + 3, y + 3, crate.w - 6, 4);
    ctx.strokeStyle = ice ? "#6fb4cc" : "#5a3b1c";
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, crate.w - 3, crate.h - 3);
    if (!ice) {
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 4);
      ctx.lineTo(x + crate.w - 4, y + crate.h - 4);
      ctx.moveTo(x + crate.w - 4, y + 4);
      ctx.lineTo(x + 4, y + crate.h - 4);
      ctx.stroke();
    }
    if (crate.hp === 1) {
      ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 8, y + 2);
      ctx.lineTo(x + 14, y + 12);
      ctx.lineTo(x + 10, y + 20);
      ctx.stroke();
    }
  }
}

function drawAmbient() {
  for (const a of ambient) {
    const alpha = Math.min(1, a.life / 0.6, (a.max - a.life) / 0.6 + 0.1);
    ctx.globalAlpha = clamp(alpha, 0, 1);
    switch (a.kind) {
      case "firefly":
        ctx.fillStyle = Math.sin(state.anim * 6 + a.seed * 3) > 0 ? "#fff6a3" : "#c9e86b";
        ctx.fillRect(a.x, a.y, 4, 4);
        break;
      case "ember":
        ctx.fillStyle = a.seed > 5 ? "#ffb347" : "#ff6b3d";
        ctx.fillRect(a.x, a.y, 4, 4);
        break;
      case "snow":
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(a.x + Math.sin(state.anim * 2 + a.seed) * 6, a.y, 4, 4);
        break;
      case "sand":
        ctx.fillStyle = "rgba(240, 210, 150, 0.8)";
        ctx.fillRect(a.x, a.y + Math.sin(state.anim * 3 + a.seed) * 4, 5, 2);
        break;
      case "spore":
        ctx.fillStyle = "#c6f08a";
        ctx.fillRect(a.x, a.y, 3, 3);
        break;
      default:
        ctx.fillStyle = "rgba(220, 220, 220, 0.5)";
        ctx.fillRect(a.x, a.y, 3, 3);
    }
  }
  ctx.globalAlpha = 1;
}

/* ---------- drawing: characters ---------- */

function drawWizard(g, x, y, robeIndex, dirX, dirY, t, moving, hatId = 0) {
  const robe = robes[robeIndex];
  const bob = moving ? -Math.abs(Math.sin(t * 12)) * 3 : Math.sin(t * 3);
  const step = moving ? Math.sin(t * 12) * 2 : 0;

  g.fillStyle = "rgba(0, 0, 0, 0.28)";
  g.fillRect(x - 13, y + 14, 26, 6);
  y += bob;

  g.fillStyle = "#3a2516";
  g.fillRect(x - 9, y + 9 + step, 7, 6);
  g.fillRect(x + 2, y + 9 - step, 7, 6);

  const staffBehind = dirY < -0.4;
  if (staffBehind) drawStaff(g, x, y, dirX, dirY, t);

  g.fillStyle = robe.robe;
  g.fillRect(x - 12, y - 4, 24, 15);
  g.fillStyle = robe.trim;
  g.fillRect(x - 12, y + 8, 24, 3);
  g.fillStyle = "#f6c85f";
  g.fillRect(x - 12, y + 1, 24, 2);

  g.fillStyle = "#f0c78a";
  g.fillRect(x - 9, y - 18, 18, 15);
  g.fillStyle = "#f2a0a0";
  g.fillRect(x - 8, y - 9, 3, 2);
  g.fillRect(x + 5, y - 9, 3, 2);
  const ex = Math.round(dirX * 2);
  const ey = Math.round(dirY * 1.5);
  g.fillStyle = "#2a1b11";
  g.fillRect(x - 6 + ex, y - 13 + ey, 3, 4);
  g.fillRect(x + 3 + ex, y - 13 + ey, 3, 4);

  drawHat(g, hatId, x, y, dirX >= 0 ? 1 : -1, t, robe);

  if (!staffBehind) drawStaff(g, x, y, dirX, dirY, t);
}

// Draws one of the collectible hats on a wizard whose head top is at y - 18.
function drawHat(g, id, x, y, lean, t, robe) {
  const box = (color, rx, ry, w, h) => {
    g.fillStyle = color;
    g.fillRect(x + rx, y + ry, w, h);
  };
  switch (id) {
    case 1: // King Zombo's Crown
      box("#8a5f12", -12, -25, 24, 8);
      box("#f6c85f", -11, -24, 22, 6);
      box("#f6c85f", -11, -29, 4, 5);
      box("#f6c85f", -2, -31, 4, 7);
      box("#f6c85f", 7, -29, 4, 5);
      box("#5aa45c", -7, -22, 3, 3);
      box("#ef5b4b", -1, -22, 3, 3);
      box("#5aa45c", 5, -22, 3, 3);
      break;
    case 2: // Rattlebones Skull Cap
      box("#858575", -11, -27, 22, 10);
      box("#e8e4d4", -10, -27, 20, 9);
      box("#e8e4d4", -7, -30, 14, 3);
      box("#2a2a2a", -7, -25, 4, 4);
      box("#2a2a2a", 3, -25, 4, 4);
      box("#2a2a2a", -1, -21, 2, 2);
      break;
    case 3: // Mama Webby's Bow
      box("#34243b", -9, -20, 18, 3);
      box("#a32a5a", -12, -30, 10, 10);
      box("#a32a5a", 2, -30, 10, 10);
      box("#e0457f", -11, -29, 8, 8);
      box("#e0457f", 3, -29, 8, 8);
      box("#ff9fc3", -9, -27, 3, 3);
      box("#a32a5a", -3, -27, 6, 6);
      box("#ff6b9a", -2, -26, 4, 4);
      break;
    case 4: { // Big Wobble Jelly Hat
      const wob = Math.round(Math.sin(t * 6) * 1);
      g.globalAlpha *= 0.9;
      box("#3c8f41", -12, -27 + wob, 24, 10 - wob);
      box("#65d66b", -11, -26 + wob, 22, 8 - wob);
      box("#65d66b", -8, -31 + wob * 2, 16, 5);
      box("#ffffff", -7, -29 + wob * 2, 4, 3);
      box("#65d66b", 7, -18, 3, 4);
      g.globalAlpha /= 0.9;
      break;
    }
    case 5: // Imp-eror Horns
      box("#7a2a12", -9, -21, 18, 3);
      box("#d75833", -9, -26, 5, 7);
      box("#d75833", -11, -31, 4, 6);
      box("#ffb347", -12, -35, 3, 4);
      box("#d75833", 4, -26, 5, 7);
      box("#d75833", 7, -31, 4, 6);
      box("#ffb347", 9, -35, 3, 4);
      break;
    case 6: { // Wispy Queen Tiara
      box("#bcd8e6", -9, -21, 18, 3);
      box("#e8f6ff", -7, -25, 3, 4);
      box("#e8f6ff", -1, -28, 3, 7);
      box("#e8f6ff", 5, -25, 3, 4);
      box("#90e2ff", -1, -24, 3, 3);
      const sparkle = Math.sin(t * 5) > 0.6;
      if (sparkle) box("#ffffff", 8, -31, 2, 2);
      break;
    }
    case 7: // Pharaoh Headdress
      for (let i = 0; i < 5; i += 1) {
        const color = i % 2 === 0 ? "#2557c9" : "#f6c85f";
        box(color, -12, -24 + i * 3, 4, 3);
        box(color, 8, -24 + i * 3, 4, 3);
      }
      box("#f6c85f", -11, -25, 22, 6);
      box("#2557c9", -11, -23, 22, 2);
      box("#f6c85f", -12, -9, 4, 5);
      box("#f6c85f", 8, -9, 4, 5);
      box("#c79a2e", -1, -29, 3, 4);
      box("#ef5b4b", 0, -28, 1, 1);
      break;
    case 8: // Mossbeard Leaf Crown
      box("#345d36", -10, -22, 20, 4);
      box("#608c39", -13, -27, 6, 6);
      box("#a2c45a", -6, -29, 5, 7);
      box("#608c39", 1, -29, 5, 7);
      box("#a2c45a", 7, -27, 6, 6);
      box("#ff9ff3", -2, -24, 3, 3);
      box("#ffd166", -1, -23, 1, 1);
      break;
    case 9: // Count Batula Ears
      box("#2a2633", -9, -20, 18, 3);
      box("#4b465c", -11, -27, 7, 8);
      box("#4b465c", -11, -31, 4, 4);
      box("#4b465c", 4, -27, 7, 8);
      box("#4b465c", 7, -31, 4, 4);
      box("#b8aacb", -9, -26, 3, 5);
      box("#b8aacb", 6, -26, 3, 5);
      break;
    case 10: // Crystal Crown
      box("#5b34c4", -10, -22, 20, 4);
      box("#8f6cff", -10, -29, 5, 7);
      box("#8f6cff", -2, -34, 5, 12);
      box("#8f6cff", 5, -29, 5, 7);
      box("#d6c7ff", -9, -28, 2, 4);
      box("#d6c7ff", -1, -33, 2, 6);
      box("#d6c7ff", 6, -28, 2, 4);
      break;
    case 11: // Brute-zilla Helmet
      box("#5c4a3a", -11, -20, 22, 3);
      box("#8d8a82", -10, -27, 20, 8);
      box("#bdb8ad", -8, -26, 6, 2);
      box("#f6e7c1", -15, -26, 5, 5);
      box("#f6e7c1", -16, -31, 3, 5);
      box("#f6e7c1", 10, -26, 5, 5);
      box("#f6e7c1", 13, -31, 3, 5);
      break;
    case 12: // Golem Bucket Helmet
      box("#725a43", -11, -28, 22, 11);
      box("#a9a49a", -10, -27, 20, 9);
      box("#725a43", -8, -25, 2, 2);
      box("#725a43", 6, -25, 2, 2);
      box("#4e8c45", -7, -30, 10, 3);
      box("#ff9ff3", 1, -32, 3, 3);
      break;
    case 13: // Shadow Hood
      box("#201827", -12, -25, 24, 8);
      box("#201827", -12, -18, 4, 15);
      box("#201827", 8, -18, 4, 15);
      box("#201827", -4 + lean * 3, -30, 8, 5);
      box("#b35cff", -12, -19, 24, 2);
      box("#b35cff", -12, -5, 4, 2);
      box("#b35cff", 8, -5, 4, 2);
      break;
    case 14: // Mud Puff Mushroom
      box("#8f2f26", -15, -24, 30, 6);
      box("#d94d3f", -14, -25, 28, 6);
      box("#d94d3f", -10, -30, 20, 5);
      box("#ffffff", -9, -28, 3, 3);
      box("#ffffff", 3, -29, 3, 3);
      box("#ffffff", 8, -23, 3, 2);
      box("#ffffff", -4, -23, 3, 2);
      break;
    case 15: // Commander's Plume
      box("#c09a63", -11, -20, 22, 3);
      box("#eee4cf", -10, -27, 20, 8);
      box("#c09a63", -1, -27, 2, 8);
      box("#ef5b4b", -2 + lean, -33, 5, 7);
      box("#ef5b4b", 2 + lean * 2, -36, 5, 5);
      box("#ff8b7d", 4 + lean * 3, -38, 4, 3);
      break;
    case 16: // Dragon Horns
      box("#8a2440", -9, -21, 18, 3);
      box("#c0395b", -10, -26, 5, 7);
      box("#c0395b", -13, -31, 5, 6);
      box("#ffd28a", -15, -34, 4, 4);
      box("#c0395b", 5, -26, 5, 7);
      box("#c0395b", 8, -31, 5, 6);
      box("#ffd28a", 11, -34, 4, 4);
      box("#ffd28a", -2, -24, 4, 4);
      break;
    case 17: // Bonecrown
      box("#8a5f12", -12, -24, 24, 7);
      box("#e8e2cf", -11, -23, 22, 5);
      box("#f6c85f", -11, -29, 4, 6);
      box("#f6c85f", -2, -32, 4, 9);
      box("#f6c85f", 7, -29, 4, 6);
      box("#c084fc", -8, -22, 3, 3);
      box("#ef5b4b", -1, -22, 3, 3);
      box("#c084fc", 6, -22, 3, 3);
      break;
    case 18: // Magma Helm
      box("#2a1712", -12, -21, 24, 4);
      box("#4a2f28", -11, -29, 22, 9);
      box("#ff7a2e", -6, -26, 5, 2);
      box("#ff7a2e", 2, -24, 6, 2);
      box("#ffd166", 3, -28, 2, 3);
      box("#3a2520", -15, -31, 4, 8);
      box("#ff7a2e", -15, -34, 4, 3);
      box("#3a2520", 11, -31, 4, 8);
      box("#ff7a2e", 11, -34, 4, 3);
      break;
    case 19: // Frostbite Crown
      box("#5fb8e0", -11, -22, 22, 4);
      box("#bdf1ff", -11, -27, 3, 5);
      box("#ffffff", -6, -31, 3, 9);
      box("#bdf1ff", -1.5, -35, 3, 13);
      box("#ffffff", 3, -31, 3, 9);
      box("#bdf1ff", 8, -27, 3, 5);
      box("#2a6fb0", -1, -24, 2, 2);
      break;
    case 20: { // Shadowfang Top Hat
      const flap = Math.sin(t * 8) > 0 ? 1 : 0;
      box("#120c1a", -13, -21, 26, 4);
      box("#1f1630", -8, -37, 16, 16);
      box("#c0254a", -8, -25, 16, 3);
      box("#2a1f3d", -16, -32 - flap, 7, 3);
      box("#2a1f3d", 9, -32 - flap, 7, 3);
      box("#2a1f3d", -13, -29, 4, 2);
      box("#2a1f3d", 9, -29, 4, 2);
      break;
    }
    case 21: { // Crystal Halo
      const hy = Math.round(Math.sin(t * 3) * 1.5);
      box("#5b3fc4", -11, -21, 22, 3);
      box("#8f6cff", -9, -26, 4, 6);
      box("#d6c7ff", -8, -29, 2, 3);
      box("#8f6cff", -2, -28, 4, 8);
      box("#d6c7ff", -1, -31, 2, 3);
      box("#8f6cff", 5, -26, 4, 6);
      box("#d6c7ff", 6, -29, 2, 3);
      box("#d6c7ff", -11, -36 + hy, 22, 3);
      box("#ffe45c", -2, -36 + hy, 4, 3);
      break;
    }
    default: // Wizard Hat
      box(robe.hat, -13, -21, 26, 5);
      box(robe.hat, -9, -27, 18, 6);
      box(robe.hat, -6 + lean * 2, -33, 12, 6);
      box(robe.hat, -3 + lean * 5, -38, 7, 5);
      box("#fde68a", -2, -26, 4, 4);
  }
}

function drawStaff(g, x, y, dirX, dirY, t) {
  const hx = x + dirX * 12;
  const hy = y + 3 + dirY * 6;
  g.strokeStyle = "#8b5a2b";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(hx - dirX * 10, hy - dirY * 10 + 6);
  g.lineTo(hx + dirX * 13, hy + dirY * 13);
  g.stroke();
  const tx = hx + dirX * 15;
  const ty = hy + dirY * 15;
  const glow = 0.35 + Math.sin(t * 8) * 0.15;
  g.fillStyle = `rgba(255, 242, 163, ${glow})`;
  g.fillRect(tx - 8, ty - 8, 16, 16);
  g.fillStyle = "#fff2a3";
  g.fillRect(tx - 4, ty - 4, 8, 8);
}

// Pixel's colours follow its evolution; the nine-tailed form gets a fan of tails.
function drawPet(g, x, y, face, hop, t, look = { evo: stats.petEvo, mega: stats.petMega }) {
  const kind = look.evo ? petKinds[look.evo] : null;
  const body = kind ? kind.color : "#fb923c";
  let tip = kind ? kind.tip : "#ffffff";
  if (look.evo === "flame" && Math.floor(t * 8) % 2 === 0) tip = "#ff742e";
  const lift = Math.abs(Math.sin(hop)) * 4;
  g.fillStyle = "rgba(0, 0, 0, 0.25)";
  g.fillRect(x - 10, y + 8, 20, 4);
  y -= lift;
  const tail = Math.sin(t * 10) * 3;
  const tails = look.mega ? [-7, -3.5, 0, 3.5, 7] : [0];
  for (const off of tails) {
    const reach = look.mega ? Math.abs(off) * 0.5 : 0;
    g.fillStyle = body;
    g.fillRect(x - face * (16 - reach), y - 2 + tail * (1 - Math.abs(off) / 14) + off, 8, 6);
    g.fillStyle = tip;
    g.fillRect(x - face * (19 - reach), y - 2 + tail * (1 - Math.abs(off) / 14) + off, 4, 6);
  }
  g.fillStyle = body;
  g.fillRect(x - 10, y - 4, 20, 11);
  g.fillStyle = "#fde7d0";
  g.fillRect(x - 6, y + 2, 12, 5);
  const hx = x + face * 8;
  g.fillStyle = body;
  g.fillRect(hx - 6, y - 13, 12, 10);
  g.fillRect(hx - 6, y - 17, 4, 4);
  g.fillRect(hx + 2, y - 17, 4, 4);
  if (look.mega) {
    g.fillStyle = tip;
    g.fillRect(hx - 6, y - 19, 4, 2);
    g.fillRect(hx + 2, y - 19, 4, 2);
  }
  g.fillStyle = kind ? shade(body, -0.35) : "#3a2516";
  g.fillRect(hx - 5, y - 17, 2, 2);
  g.fillRect(hx + 3, y - 17, 2, 2);
  g.fillStyle = "#fde7d0";
  g.fillRect(hx + face * 2 - 2, y - 7, 6, 4);
  g.fillStyle = "#1a120c";
  g.fillRect(hx + face * 5 - 1, y - 7, 2, 2);
  g.fillRect(hx - 3, y - 11, 2, 2);
  g.fillRect(hx + 1, y - 11, 2, 2);
  g.fillStyle = "#3a2516";
  g.fillRect(x - 8, y + 6, 3, 3);
  g.fillRect(x + 5, y + 6, 3, 3);
}

function drawFoeBody(g, typeIndex, cx, cy, size, t, look = { x: 0, y: 0 }, extra = {}) {
  const type = enemyTypes[typeIndex];
  if (type.monster) {
    drawMonster(g, type, cx, cy, size, t, look, extra.enemy);
    return;
  }
  const s = size;
  let x = cx - s / 2;
  let y = cy - s / 2;
  const lx = Math.round(look.x * s * 0.06);
  const ly = Math.round(look.y * s * 0.05);
  let eyeColor = "#120c08";

  // Things that sit behind the body.
  if (typeIndex === 2) {
    g.strokeStyle = "#1c1320";
    g.lineWidth = Math.max(2, s * 0.08);
    for (let i = 0; i < 4; i += 1) {
      const legY = y + s * (0.2 + i * 0.2);
      const wiggle = Math.sin(t * 14 + i) * s * 0.08;
      g.beginPath();
      g.moveTo(x + s * 0.2, legY);
      g.lineTo(x - s * 0.25, legY + wiggle);
      g.moveTo(x + s * 0.8, legY);
      g.lineTo(x + s * 1.25, legY - wiggle);
      g.stroke();
    }
  }
  if (typeIndex === 8) {
    const flap = (0.4 + Math.abs(Math.sin(t * 16)) * 0.6) * s * 0.55;
    g.fillStyle = type.accent;
    g.beginPath();
    g.moveTo(x + s * 0.1, y + s * 0.35);
    g.lineTo(x - s * 0.5, y + s * 0.35 - flap);
    g.lineTo(x - s * 0.35, y + s * 0.75);
    g.closePath();
    g.moveTo(x + s * 0.9, y + s * 0.35);
    g.lineTo(x + s * 1.5, y + s * 0.35 - flap);
    g.lineTo(x + s * 1.35, y + s * 0.75);
    g.closePath();
    g.fill();
  }
  if (typeIndex === 5 || typeIndex === 12) {
    g.fillStyle = typeIndex === 5 ? "rgba(144, 226, 255, 0.5)" : "rgba(179, 92, 255, 0.4)";
    for (let i = 0; i < 3; i += 1) {
      const tail = Math.sin(t * 6 + i) * s * 0.12;
      g.fillRect(x + s * (0.15 + i * 0.25) + tail, y + s * 0.9, s * 0.18, s * (0.25 - i * 0.04));
    }
  }

  let w = s;
  let h = s;
  if (typeIndex === 3) {
    const squish = Math.sin(t * 6) * 0.07;
    w = s * (1 + squish);
    h = s * (1 - squish);
    x = cx - w / 2;
    y = cy + s / 2 - h;
  }
  if (typeIndex === 13 && extra.fuse) {
    const grow = 1 + (1 - extra.fuse) * 0.3;
    w = s * grow;
    h = s * grow;
    x = cx - w / 2;
    y = cy - h / 2;
  }

  if (typeIndex === 5) {
    g.shadowColor = type.color;
    g.shadowBlur = 14;
  }
  g.fillStyle = type.color;
  if (typeIndex === 3 || typeIndex === 12) g.globalAlpha *= 0.86;
  g.fillRect(x, y, w, h);
  g.globalAlpha = typeIndex === 3 || typeIndex === 12 ? g.globalAlpha / 0.86 : g.globalAlpha;
  g.shadowBlur = 0;

  g.fillStyle = "rgba(255, 255, 255, 0.18)";
  g.fillRect(x, y, w, Math.max(2, h * 0.1));
  g.fillStyle = "rgba(0, 0, 0, 0.18)";
  g.fillRect(x, y + h * 0.88, w, h * 0.12);

  switch (typeIndex) {
    case 0:
      g.fillStyle = type.accent;
      g.fillRect(x + w * 0.62, y + h * 0.7, w * 0.26, h * 0.18);
      g.fillStyle = type.color;
      g.fillRect(cx + (look.x >= 0 ? w * 0.45 : -w * 0.8), cy + h * 0.05, w * 0.35, h * 0.16);
      break;
    case 1:
      g.fillStyle = type.accent;
      for (let i = 0; i < 3; i += 1) g.fillRect(x + w * 0.2, y + h * (0.66 + i * 0.09), w * 0.6, Math.max(1, h * 0.04));
      g.strokeStyle = "#8b5a2b";
      g.lineWidth = Math.max(2, s * 0.07);
      g.beginPath();
      g.arc(x + w * 1.05, cy, s * 0.42, -Math.PI / 2.2, Math.PI / 2.2);
      g.stroke();
      eyeColor = "#000000";
      break;
    case 2:
      g.fillStyle = type.accent;
      g.fillRect(x + w * 0.2 + lx, y + h * 0.38 + ly, w * 0.12, h * 0.1);
      g.fillRect(x + w * 0.68 + lx, y + h * 0.38 + ly, w * 0.12, h * 0.1);
      eyeColor = type.accent;
      break;
    case 3:
      g.fillStyle = type.accent;
      g.fillRect(x + w * 0.3, y + h * 0.55, w * 0.4, h * 0.3);
      g.fillStyle = "rgba(255, 255, 255, 0.45)";
      g.fillRect(x + w * 0.1, y + h * 0.12, w * 0.18, h * 0.12);
      break;
    case 4: {
      g.fillStyle = type.accent;
      g.fillRect(x - w * 0.04, y - h * 0.22, w * 0.18, h * 0.28);
      g.fillRect(x + w * 0.86, y - h * 0.22, w * 0.18, h * 0.28);
      const flicker = Math.sin(t * 20) > 0 ? 1 : 0.7;
      g.fillStyle = "#ffd166";
      g.fillRect(cx - w * 0.12, y - h * 0.3 * flicker, w * 0.24, h * 0.3 * flicker);
      break;
    }
    case 5:
      g.fillStyle = "rgba(255, 255, 255, 0.6)";
      g.fillRect(x + w * 0.15, y + h * 0.15, w * 0.2, h * 0.15);
      eyeColor = "#1d4ed8";
      break;
    case 6:
      g.fillStyle = type.accent;
      for (let i = 0; i < 3; i += 1) g.fillRect(x, y + h * (0.2 + i * 0.25), w, Math.max(2, h * 0.07));
      eyeColor = "#ffd166";
      break;
    case 7:
      g.fillStyle = type.color;
      g.fillRect(x - w * 0.25, y + h * 0.2, w * 0.25, h * 0.15);
      g.fillRect(x + w, y + h * 0.2, w * 0.25, h * 0.15);
      g.fillStyle = type.accent;
      g.fillRect(cx - w * 0.06, y + h * 0.6, w * 0.12, h * 0.12);
      break;
    case 8:
      g.fillStyle = "#ffffff";
      g.fillRect(x + w * 0.32, y + h * 0.75, w * 0.08, h * 0.12);
      g.fillRect(x + w * 0.6, y + h * 0.75, w * 0.08, h * 0.12);
      eyeColor = "#ffd166";
      break;
    case 9:
      g.fillStyle = type.accent;
      for (let i = 0; i < 3; i += 1) {
        g.beginPath();
        g.moveTo(x + w * (0.1 + i * 0.3), y);
        g.lineTo(x + w * (0.25 + i * 0.3), y - h * (0.3 + (i % 2) * 0.15));
        g.lineTo(x + w * (0.4 + i * 0.3), y);
        g.closePath();
        g.fill();
      }
      break;
    case 10:
      g.fillStyle = type.accent;
      g.fillRect(x - w * 0.1, y - h * 0.15, w * 0.2, h * 0.3);
      g.fillRect(x + w * 0.9, y - h * 0.15, w * 0.2, h * 0.3);
      g.fillRect(x + w * 0.15, y + h * 0.36, w * 0.7, h * 0.08);
      eyeColor = "#ffb347";
      break;
    case 11:
      g.fillStyle = type.accent;
      g.fillRect(x + w * 0.1, y + h * 0.7, w * 0.8, h * 0.08);
      g.fillStyle = "#4a8a3a";
      g.fillRect(x + w * 0.75, y, w * 0.08, h * 0.5);
      eyeColor = "#ffb347";
      break;
    case 12:
      eyeColor = type.accent;
      break;
    case 13:
      g.fillStyle = type.accent;
      g.fillRect(x + w * 0.1, y + h * 0.1, w * 0.18, h * 0.18);
      g.fillRect(x + w * 0.7, y + h * 0.72, w * 0.18, h * 0.14);
      g.fillStyle = "#120c08";
      g.fillRect(cx - w * 0.08, y + h * 0.68, w * 0.16, h * 0.16);
      if (extra.fuse !== undefined && Math.sin(t * 40) > 0) {
        g.fillStyle = "rgba(255, 255, 255, 0.55)";
        g.fillRect(x, y, w, h);
      }
      break;
    case 14:
      g.fillStyle = "#3a2e22";
      g.fillRect(x, y + h * 0.4, w, h * 0.2);
      g.fillStyle = type.accent;
      g.fillRect(cx - w * 0.1, y - h * 0.35, w * 0.2, h * 0.35);
      g.fillStyle = "#d94d3f";
      g.fillRect(cx - w * 0.06, y - h * 0.45, w * 0.18, h * 0.15);
      eyeColor = "#55aaff";
      break;
    default:
      break;
  }

  if (typeIndex !== 2) {
    g.fillStyle = eyeColor;
    g.fillRect(x + w * 0.24 + lx, y + h * 0.45 + ly, w * 0.16, h * 0.14);
    g.fillRect(x + w * 0.6 + lx, y + h * 0.45 + ly, w * 0.16, h * 0.14);
  }

  if (extra.boss) {
    g.fillStyle = "#f6c85f";
    g.fillRect(x + w * 0.15, y - 12, w * 0.7, 9);
    g.fillRect(x + w * 0.22, y - 20, 7, 10);
    g.fillRect(x + w * 0.48, y - 23, 7, 13);
    g.fillRect(x + w * 0.74, y - 20, 7, 10);
    g.fillStyle = "#ef5b4b";
    g.fillRect(x + w * 0.48 + 1, y - 10, 5, 5);
  }
}

/* ---------- room boss bodies ----------
   Room bosses are drawn as real figures: legs that walk, arms that swing and
   a weapon that fits each boss. Sizes are in u, one twelfth of the boss size.
   The hitbox is still the boss's square, only the drawing changed. */
const BOSS_LOOKS = [
  { kind: "biped", torso: [6, 5], head: [5, 4], weapon: "club", zombie: true },
  { kind: "biped", torso: [4, 5], head: [4.4, 4], weapon: "bow", bones: true },
  { kind: "spider" },
  { kind: "blob", weapon: "mallet" },
  { kind: "biped", torso: [5, 4.5], head: [5, 4], weapon: "trident", horns: true, wings: true },
  { kind: "float", torso: [5, 5], head: [4.5, 4], weapon: "scepter" },
  { kind: "biped", torso: [5, 5.5], head: [4.6, 4.4], weapon: "khopesh", wraps: true, headdress: true },
  { kind: "biped", torso: [5, 4], head: [5, 4], weapon: "spear", beard: true, ears: true, short: true },
  { kind: "flyer", weapon: "claws" },
  { kind: "biped", torso: [7, 6], head: [4, 3.4], weapon: "fists", spikes: true },
  { kind: "biped", torso: [7.4, 6], head: [4.6, 4], weapon: "axe", horns: true },
  { kind: "biped", torso: [7, 6], head: [5, 4], weapon: "hammer", mustache: true },
  { kind: "float", torso: [3.6, 7], head: [3.6, 4], weapon: "scythe" },
  { kind: "quad", weapon: "bomb" },
  { kind: "biped", torso: [5.6, 5.6], head: [4.6, 4.6], weapon: "sword", shield: true, plume: true }
];

function drawBossFigure(g, enemy, cx, cy, size, t, look) {
  const L = BOSS_LOOKS[enemy.typeIndex] || BOSS_LOOKS[0];
  const type = enemy.type;
  const u = size / 10.5;
  const face = look.x < -0.1 ? -1 : 1;
  const busy = ["tell", "windup", "swing"].includes(enemy.state);
  const strike = ["lunge", "charge", "dash"].includes(enemy.state) || (enemy.state === "recover" && enemy.stateTimer > 0.35);
  const moving = !busy && !strike;
  const walk = moving ? Math.sin(t * 9) : 0;
  const breathe = Math.sin(t * 3) * 0.25;
  const dark = shade(type.color, -0.35);
  const light = shade(type.color, 0.25);
  g.save();
  g.translate(cx, cy);
  g.scale(face, 1);
  const R = (color, x, y, w, h) => {
    g.fillStyle = color;
    g.fillRect(x * u, y * u, w * u, h * u);
  };
  // A limb hangs from (x, y). Angle 0 points straight down; positive swings it forward.
  const limb = (color, x, y, len, thick, angle, outline = true) => {
    g.save();
    g.translate(x * u, y * u);
    g.rotate(-angle);
    if (outline) {
      g.fillStyle = "#120c08";
      g.fillRect((-thick / 2 - 0.35) * u, -0.35 * u, (thick + 0.7) * u, (len + 0.7) * u);
    }
    g.fillStyle = color;
    g.fillRect((-thick / 2) * u, 0, thick * u, len * u);
    g.restore();
    return { x: x + Math.sin(angle) * len, y: y + Math.cos(angle) * len };
  };

  // Where the weapon arm points: resting, raised for a wind-up, or swung forward.
  const armAngle = busy ? 2.7 : strike ? 1.5 : 0.45 + Math.sin(t * 3) * 0.12 + walk * 0.25;
  const weaponAngle = busy ? -0.5 : strike ? 1.7 : 0.35;
  const weapon = enemy.melee ? null : L.weapon;

  if (L.kind === "spider") {
    for (let i = 0; i < 4; i += 1) {
      const wig = Math.sin(t * 14 + i) * 0.35;
      limb(dark, -2, -1 + i * 1.2, 6.5, 0.9, -1.2 - i * 0.25 + wig);
      limb(dark, 2, -1 + i * 1.2, 6.5, 0.9, 1.2 + i * 0.25 - wig);
    }
    R("#120c08", -5.4, -3.4, 10.8, 8.8);
    R(type.color, -5, -3, 10, 8);
    R(type.accent, -2, 0, 4, 3);
    R("#120c08", -3.4, -6.4, 6.8, 4.4);
    R(type.color, -3, -6, 6, 4);
    for (const [ex, ey] of [[-2.2, -5.2], [-0.8, -5.6], [0.6, -5.6], [2, -5.2], [-1.4, -4.2], [1.2, -4.2]]) R(type.accent, ex, ey, 0.9, 0.9);
    R("#ffffff", -1.6, -2.2, 0.8, 1.4);
    R("#ffffff", 0.8, -2.2, 0.8, 1.4);
    drawBossCrown(g, u, 0, -6.2);
    g.restore();
    return;
  }

  if (L.kind === "flyer") {
    const flap = Math.sin(t * 12) * 0.5;
    g.fillStyle = shade(type.accent, -0.2);
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(side * 2 * u, -3 * u);
      g.lineTo(side * 11 * u, (-6 + flap * 4) * u);
      g.lineTo(side * 9 * u, (1 + flap * 2) * u);
      g.lineTo(side * 6 * u, (-1 + flap) * u);
      g.lineTo(side * 4 * u, 2 * u);
      g.closePath();
      g.fill();
    }
    R("#5b1020", -3.6, -3, 7.2, 8);
    R("#120c08", -3.4, -4.4, 6.8, 7.8);
    R(type.color, -3, -4, 6, 7);
    R(type.accent, -4.2, -7.6, 2, 3.4);
    R(type.accent, 2.2, -7.6, 2, 3.4);
    R("#ffd166", -2, -2.6, 1.2, 1.2);
    R("#ffd166", 0.8, -2.6, 1.2, 1.2);
    R("#ffffff", -1.2, 0, 0.7, 1.2);
    R("#ffffff", 0.5, 0, 0.7, 1.2);
    limb(dark, -1.5, 3, 3, 0.9, -0.2 + walk * 0.2);
    const hand = limb(dark, 2, 0, 3.6, 1, strike ? 1.6 : busy ? 2.5 : 0.8);
    R("#ffffff", hand.x - 0.2, hand.y, 0.5, 1.2);
    R("#ffffff", hand.x + 0.6, hand.y - 0.2, 0.5, 1.2);
    drawBossCrown(g, u, 0, -4);
    g.restore();
    return;
  }

  if (L.kind === "quad") {
    for (const [lx, phase] of [[-4.2, 0], [-1.6, 1], [1.2, 2], [3.6, 3]]) limb(dark, lx, 2, 3.2 + Math.sin(t * 9 + phase) * 0.4, 1.4, Math.sin(t * 9 + phase) * 0.3);
    R("#120c08", -5.9, -3.9, 11.8, 7.3);
    R(type.color, -5.5, -3.5, 11, 6.5);
    R(type.accent, -5.5, 1.5, 11, 1.5);
    R("#2f7e43", -4, -5, 2, 1.6);
    R("#2f7e43", 1.5, -5.4, 2.4, 2);
    R("#120c08", 1.2, -1.8, 1.2, 1.4);
    R("#120c08", 3.4, -1.8, 1.2, 1.4);
    R("#120c08", 1.8, 0.4, 2.4, 0.7);
    // The bomb it carries on its back, with a lit fuse.
    R("#120c08", -4, -8.4, 4.4, 4.4);
    R("#3a3a46", -3.6, -8, 3.6, 3.6);
    R("#8a8a99", -3, -7.4, 1, 1);
    const spark = Math.sin(t * 25) > 0 ? "#ffd166" : "#ff742e";
    R("#8a6b3c", -1.6, -9.6, 0.6, 1.6);
    R(spark, -1.9, -10.4, 1.2, 1.2);
    drawBossCrown(g, u, 3, -5.4);
    g.restore();
    return;
  }

  const [tw, th] = L.torso || [5, 5];
  const [hw, hh] = L.head || [4.5, 4];
  const float = L.kind === "float" || L.kind === "blob";
  const torsoTop = L.kind === "blob" ? -3 : (L.short ? -1 : -2) + breathe;
  const torsoBottom = torsoTop + th;
  const headTop = torsoTop - hh + 0.4;

  if (L.wings) {
    const flap = Math.sin(t * 10) * 0.4;
    g.fillStyle = shade(type.color, -0.25);
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(side * tw * 0.3 * u, (torsoTop + 1) * u);
      g.lineTo(side * (tw * 0.5 + 5) * u, (torsoTop - 3 + flap * 3) * u);
      g.lineTo(side * (tw * 0.5 + 3) * u, (torsoTop + 3) * u);
      g.closePath();
      g.fill();
    }
  }

  // Legs (or a ghostly tail for floating bosses).
  if (L.kind === "float") {
    for (let i = 0; i < 3; i += 1) {
      const sway = Math.sin(t * 6 + i) * 0.8;
      g.globalAlpha *= 0.7;
      R(type.color, -tw / 2 + i * (tw / 3) + sway, torsoBottom - 0.2, tw / 3, 3 - i * 0.6);
      g.globalAlpha /= 0.7;
    }
  } else if (L.kind === "biped") {
    const legLen = L.short ? 3.4 : 4.6;
    const legColor = L.bones ? "#e8e2cf" : L.wraps ? "#d9c9a3" : dark;
    limb(legColor, -tw / 4, torsoBottom - 0.4, legLen, L.bones ? 0.9 : 1.6, walk * 0.45);
    limb(legColor, tw / 4, torsoBottom - 0.4, legLen, L.bones ? 0.9 : 1.6, -walk * 0.45);
  }

  // Back arm, behind the body.
  const armLen = L.weapon === "fists" ? 5 : float ? 3.6 : 4.2;
  const armThick = L.bones ? 0.9 : L.weapon === "fists" ? 2.2 : 1.5;
  const armColor = L.bones ? "#e8e2cf" : L.wraps ? "#d9c9a3" : type.color;
  const backHand = limb(armColor, -tw / 2 + 0.6, torsoTop + 0.8, armLen, armThick, L.zombie ? 1.3 + walk * 0.1 : -0.35 - walk * 0.25);
  if (L.weapon === "fists") drawFist(g, u, backHand, type.accent);

  // Body.
  if (L.kind === "blob") {
    const squish = Math.sin(t * 6) * 0.5;
    R("#120c08", -tw / 2 - 1.4 - squish, torsoTop - 0.4 + squish, 9.8 + squish * 2, 8.6 - squish);
    g.globalAlpha *= 0.9;
    R(type.color, -tw / 2 - 1 - squish, torsoTop + squish, 9 + squish * 2, 8 - squish);
    g.globalAlpha /= 0.9;
    R("rgba(255,255,255,0.4)", -tw / 2, torsoTop + 1 + squish, 1.6, 1.4);
  } else {
    R("#120c08", -tw / 2 - 0.4, torsoTop - 0.4, tw + 0.8, th + 0.8);
    R(L.bones ? "#3a3a32" : type.color, -tw / 2, torsoTop, tw, th);
    if (L.bones) for (let i = 0; i < 3; i += 1) R("#e8e2cf", -tw / 2 + 0.4, torsoTop + 0.8 + i * 1.4, tw - 0.8, 0.6);
    else R(light, -tw / 2, torsoTop, tw, 0.7);
    if (L.wraps) for (let i = 0; i < 3; i += 1) R("#d9c9a3", -tw / 2, torsoTop + 1 + i * 1.6, tw, 0.6);
    if (L.zombie) R(type.accent, -tw / 2 + 1, torsoTop + 2.4, 2.4, 2);
    if (L.spikes) for (let i = 0; i < 3; i += 1) R(type.accent, -tw / 2 - 0.6 + i * 2.2, torsoTop - 2 - (i % 2), 1.4, 2.2);
    if (L.shield) R(type.accent, -tw / 2, torsoBottom - 1.2, tw, 0.8);
  }

  // Head with face details.
  if (L.kind !== "blob") {
    R("#120c08", -hw / 2 - 0.4, headTop - 0.4, hw + 0.8, hh + 0.8);
    R(L.bones ? "#e8e2cf" : L.wraps ? "#d9c9a3" : type.color, -hw / 2, headTop, hw, hh);
    if (L.wraps) R("#b8a77c", -hw / 2, headTop + 1.4, hw, 0.5);
  }
  const eyeY = L.kind === "blob" ? torsoTop + 2.6 : headTop + hh * 0.4;
  const eyeColor = L.bones ? "#120c08" : L.weapon === "scythe" ? "#c084fc" : L.kind === "float" ? "#1d4ed8" : enemy.enraged ? "#ef5b4b" : "#120c08";
  R(eyeColor, 0.2, eyeY, 1, 1.1);
  R(eyeColor, 1.9, eyeY, 1, 1.1);
  if (L.bones) R("#120c08", 0.4, eyeY + 1.8, 2.4, 0.5);
  if (L.horns) {
    R(type.accent, -hw / 2 - 0.4, headTop - 1.6, 1.2, 2);
    R(type.accent, hw / 2 - 0.8, headTop - 1.6, 1.2, 2);
  }
  if (L.ears) {
    R(type.color, -hw / 2 - 1.6, headTop + 1, 1.8, 1);
    R(type.color, hw / 2 - 0.2, headTop + 1, 1.8, 1);
  }
  if (L.beard) R("#d6d6c2", -0.6, headTop + hh - 0.6, 3.6, 2.6);
  if (L.mustache) R("#f2f2e6", -0.4, headTop + hh * 0.7, 3.8, 0.8);
  if (L.headdress) {
    R("#f6c85f", -hw / 2 - 0.8, headTop - 0.6, hw + 1.6, 1.2);
    R("#1d4ed8", -hw / 2 - 0.8, headTop + 0.6, 1, hh);
    R("#f6c85f", -hw / 2 - 0.8, headTop + 1.6, 1, 0.6);
  }
  if (L.plume) {
    R("#bcc3cc", -hw / 2, headTop + hh * 0.35, hw, 0.6);
    R("#ef5b4b", -1, headTop - 2.6, 2, 2.4);
  }
  if (!L.plume) drawBossCrown(g, u, 0, L.kind === "blob" ? torsoTop : headTop);

  // Front arm and weapon.
  const front = limb(armColor, tw / 2 - 0.6, torsoTop + 0.8, armLen, armThick, L.weapon === "bow" ? 1.55 : armAngle);
  if (L.weapon === "fists") drawFist(g, u, front, type.accent);
  else if (weapon) drawBossWeapon(g, u, weapon, front, L.weapon === "bow" ? 0 : weaponAngle, type, t, busy);
  if (L.shield) {
    R("#120c08", backHand.x - 1.9, backHand.y - 3, 3.8, 5);
    R(type.accent, backHand.x - 1.5, backHand.y - 2.6, 3, 4.2);
    R("#ef5b4b", backHand.x - 0.4, backHand.y - 1.6, 0.8, 2.2);
  }
  g.restore();
}

function drawBossCrown(g, u, x, top) {
  g.fillStyle = "#f6c85f";
  g.fillRect((x - 2.2) * u, (top - 1.6) * u, 4.4 * u, 1.4 * u);
  g.fillRect((x - 2.2) * u, (top - 2.6) * u, 1 * u, 1.2 * u);
  g.fillRect((x - 0.5) * u, (top - 3) * u, 1 * u, 1.6 * u);
  g.fillRect((x + 1.2) * u, (top - 2.6) * u, 1 * u, 1.2 * u);
  g.fillStyle = "#ef5b4b";
  g.fillRect((x - 0.4) * u, (top - 1.4) * u, 0.8 * u, 0.8 * u);
}

function drawFist(g, u, hand, color) {
  g.fillStyle = "#120c08";
  g.fillRect((hand.x - 1.8) * u, (hand.y - 1.2) * u, 3.6 * u, 3.4 * u);
  g.fillStyle = color;
  g.fillRect((hand.x - 1.4) * u, (hand.y - 0.8) * u, 2.8 * u, 2.6 * u);
  g.fillStyle = "rgba(255,255,255,0.6)";
  g.fillRect((hand.x - 1) * u, (hand.y - 0.6) * u, 0.8 * u, 0.8 * u);
}

// Each weapon is drawn pointing "up" from the hand, then tilted by angle.
function drawBossWeapon(g, u, kind, hand, angle, type, t, busy) {
  g.save();
  g.translate(hand.x * u, hand.y * u);
  g.rotate(angle);
  const R = (color, x, y, w, h) => {
    g.fillStyle = color;
    g.fillRect(x * u, y * u, w * u, h * u);
  };
  const wood = "#6b4226";
  const metal = "#cfd6de";
  const glow = busy ? "#ffffff" : null;
  switch (kind) {
    case "club":
      R(wood, -0.4, -6, 0.9, 7);
      R("#120c08", -1.4, -8.4, 2.9, 3.6);
      R("#7c5a3a", -1.1, -8.1, 2.3, 3);
      R("#9a9a9a", -1.6, -7.4, 0.6, 0.6);
      R("#9a9a9a", 1, -6.4, 0.6, 0.6);
      break;
    case "bow":
      g.strokeStyle = wood;
      g.lineWidth = 0.8 * u;
      g.beginPath();
      g.arc(-2 * u, 0, 4 * u, -1.1, 1.1);
      g.stroke();
      g.strokeStyle = "#f2f2e6";
      g.lineWidth = 0.3 * u;
      g.beginPath();
      g.moveTo(0, -3.6 * u);
      g.lineTo(busy ? -2 * u : 0, 0);
      g.lineTo(0, 3.6 * u);
      g.stroke();
      if (busy) R("#f2f2e6", -2, -0.2, 6, 0.4);
      break;
    case "mallet":
      R("#3c8f41", -0.4, -5, 0.9, 6);
      R("#120c08", -2.4, -8, 4.8, 3.4);
      R(type.color, -2, -7.6, 4, 2.6);
      R("rgba(255,255,255,0.45)", -1.6, -7.2, 1, 0.8);
      break;
    case "trident":
      R("#8a5a2b", -0.3, -8, 0.7, 9);
      R("#ffd166", -1.8, -9, 3.6, 0.7);
      R("#ffd166", -1.8, -11, 0.7, 2.4);
      R("#ffd166", -0.3, -11.6, 0.7, 3);
      R("#ffd166", 1.1, -11, 0.7, 2.4);
      if (Math.sin(t * 20) > 0) R("#ff742e", -0.5, -12.6, 1, 1);
      break;
    case "scepter":
      R("#e6f7ff", -0.3, -7, 0.7, 8);
      R("#120c08", -1.4, -9.6, 2.8, 2.8);
      R("#90e2ff", -1.1, -9.3, 2.2, 2.2);
      R("#ffffff", -0.6, -8.9, 0.8, 0.8);
      break;
    case "khopesh":
      R("#f6c85f", -0.4, -1, 0.9, 2.4);
      R(metal, -0.5, -5, 1, 4.2);
      R(metal, -0.5, -6.4, 2.8, 1.4);
      R(metal, 1.6, -6.4, 1.2, 2.6);
      break;
    case "spear":
      R(wood, -0.3, -9, 0.7, 11);
      R("#120c08", -1, -11.2, 2, 2.6);
      R("#9fb3a1", -0.7, -10.9, 1.4, 2);
      R("#a2c45a", -0.9, -8.6, 1.8, 0.6);
      break;
    case "axe":
      R(wood, -0.4, -8, 0.9, 10);
      R("#120c08", 0.2, -8.6, 4.6, 4.4);
      R("#9a9aa6", 0.5, -8.3, 3.9, 3.8);
      R("#e6e6ee", 3.6, -8.3, 0.8, 3.8);
      break;
    case "hammer":
      R(wood, -0.4, -7, 0.9, 9);
      R("#120c08", -2.8, -9.6, 5.6, 3.4);
      R("#7a756b", -2.5, -9.3, 5, 2.8);
      R("#a9a49a", -2.5, -9.3, 5, 0.7);
      break;
    case "scythe":
      R("#2a1b30", -0.3, -10, 0.7, 12);
      g.strokeStyle = "#b35cff";
      g.lineWidth = 1 * u;
      g.beginPath();
      g.arc(3 * u, -9 * u, 3.4 * u, Math.PI * 0.95, Math.PI * 1.75);
      g.stroke();
      break;
    case "sword":
      R("#f6c85f", -1.4, -0.6, 2.8, 0.7);
      R("#6b4226", -0.3, 0, 0.7, 1.6);
      R("#120c08", -0.75, -7.6, 1.5, 7.2);
      R(metal, -0.5, -7.4, 1, 6.8);
      R("#ffffff", -0.5, -7.4, 0.35, 6.8);
      break;
    case "claws":
    default:
      break;
  }
  if (glow && Math.sin(t * 30) > 0) {
    // A glint on the weapon while the boss winds up.
    g.fillStyle = glow;
    g.fillRect(-0.6 * u, -9 * u, 1.2 * u, 1.2 * u);
  }
  g.restore();
}

function drawDragon(g, d, t) {
  const x = d.x;
  const y = d.y;
  const s = d.size;
  const friendly = d.friendly;
  const flap = Math.sin(t * (friendly ? 4 : 7));
  const body = friendly ? "#ff8fb1" : "#c0395b";
  const wing = friendly ? "#f59ec0" : "#7a2848";

  g.fillStyle = "rgba(0, 0, 0, 0.3)";
  g.fillRect(x - s * 0.5, y + s * 0.55, s, 12);

  g.fillStyle = wing;
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(x + side * s * 0.3, y - s * 0.15);
    g.lineTo(x + side * s * 1.05, y - s * 0.5 - flap * s * 0.25);
    g.lineTo(x + side * s * 0.95, y + s * 0.15 - flap * s * 0.08);
    g.lineTo(x + side * s * 0.35, y + s * 0.2);
    g.closePath();
    g.fill();
  }

  g.fillStyle = body;
  g.fillRect(x + s * 0.3, y + s * 0.25, s * 0.35, s * 0.15);
  g.fillRect(x + s * 0.6, y + s * 0.15, s * 0.15, s * 0.15);
  g.fillRect(x - s * 0.4, y - s * 0.3, s * 0.8, s * 0.75);
  g.fillStyle = "#ffd28a";
  g.fillRect(x - s * 0.22, y - s * 0.08, s * 0.44, s * 0.48);
  g.fillStyle = "rgba(0, 0, 0, 0.12)";
  for (let i = 0; i < 4; i += 1) g.fillRect(x - s * 0.22, y + s * (0.02 + i * 0.1), s * 0.44, 3);

  g.fillStyle = body;
  g.fillRect(x - s * 0.3, y - s * 0.7, s * 0.6, s * 0.44);
  g.fillStyle = friendly ? "#ffb3c8" : "#d9577a";
  g.fillRect(x - s * 0.2, y - s * 0.38, s * 0.4, s * 0.16);
  g.fillStyle = "#3a1020";
  g.fillRect(x - s * 0.12, y - s * 0.35, 5, 5);
  g.fillRect(x + s * 0.12 - 5, y - s * 0.35, 5, 5);
  g.fillStyle = "#f6e7c1";
  g.fillRect(x - s * 0.32, y - s * 0.86, s * 0.1, s * 0.2);
  g.fillRect(x + s * 0.22, y - s * 0.86, s * 0.1, s * 0.2);

  if (friendly) {
    g.strokeStyle = "#3a1020";
    g.lineWidth = 4;
    g.beginPath();
    g.arc(x - s * 0.14, y - s * 0.5, 7, Math.PI * 1.1, Math.PI * 1.9);
    g.moveTo(x + s * 0.14 + 7, y - s * 0.5);
    g.arc(x + s * 0.14, y - s * 0.5, 7, Math.PI * 1.9, Math.PI * 1.1, true);
    g.stroke();
    g.fillStyle = "#ff6b9a";
    g.fillRect(x - s * 0.27, y - s * 0.45, 9, 5);
    g.fillRect(x + s * 0.27 - 9, y - s * 0.45, 9, 5);
  } else {
    g.fillStyle = "#ffffff";
    g.fillRect(x - s * 0.2, y - s * 0.6, 14, 12);
    g.fillRect(x + s * 0.2 - 14, y - s * 0.6, 14, 12);
    g.fillStyle = "#1a0a10";
    const looking = state.mode === "title" ? player : nearestPlayer(x, y);
    const lx = Math.round(((looking.x - x) / WIDTH) * 6);
    g.fillRect(x - s * 0.2 + 5 + lx, y - s * 0.6 + 4, 6, 7);
    g.fillRect(x + s * 0.2 - 11 + lx, y - s * 0.6 + 4, 6, 7);
    g.fillStyle = body;
    g.fillRect(x - s * 0.22, y - s * 0.64, 18, 4);
    g.fillRect(x + s * 0.22 - 18, y - s * 0.64, 18, 4);
    if (Math.random() < 0.08) burst(x + rand(-10, 10), y - s * 0.4, ["rgba(80,80,80,0.6)", "rgba(140,140,140,0.5)"], 1, 40, { lift: 40 });
  }

  g.fillStyle = shade(friendly ? "#ff8fb1" : "#c0395b", -0.3);
  g.fillRect(x - s * 0.35, y + s * 0.42, s * 0.18, s * 0.1);
  g.fillRect(x + s * 0.17, y + s * 0.42, s * 0.18, s * 0.1);
}

function drawFoes(room) {
  const count = room.enemies.length;
  for (let i = 0; i <= count; i += 1) {
    const enemy = i < count ? room.enemies[i] : room.boss;
    if (!enemy) continue;
    if (enemy.isDragon) {
      if (enemy.hp > 0 || enemy.friendly) {
        drawTelegraph(enemy);
        drawDragon(ctx, enemy, state.anim);
        if (enemy.flash > 0) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
          ctx.fillRect(enemy.x - enemy.size * 0.4, enemy.y - enemy.size * 0.7, enemy.size * 0.8, enemy.size * 1.15);
        }
      }
      continue;
    }
    if (enemy.hp <= 0) continue;
    drawTelegraph(enemy);
    if (enemy.transforming > 0) drawTransformAura(enemy);
    if (enemy.desperate) {
      ctx.strokeStyle = `rgba(255, 90, 61, ${0.4 + Math.sin(state.anim * 12) * 0.25})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.size * 0.85 + Math.sin(state.anim * 6) * 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (enemy.isBig) drawBigBossFoe(enemy);
    else drawEnemy(enemy);
    if (enemy.state === "tell") drawTell(enemy);
    if (isStunned(enemy)) drawStunStars(enemy.x, enemy.y - enemy.size * (enemy.isBig ? 0.95 : 0.7) - (enemy.hop || 0), enemy.isBoss ? 1.3 : 1);
  }
}

// A blocky sword held out from the boss's side.
function drawSword(boss, cx, cy) {
  const big = boss.isBig;
  const s = boss.size;
  const u = big ? 4 : 3;
  ctx.save();
  ctx.translate(cx, cy + s * 0.05);
  ctx.rotate(boss.swordAngle || 0);
  const start = s * 0.42;
  const len = big ? s * 0.95 : s * 1.05;
  ctx.fillStyle = "#4a2d1a";
  ctx.fillRect(start - u * 3, -u, u * 4, u * 2);
  ctx.fillStyle = boss.type.accent || "#f6c85f";
  ctx.fillRect(start, -u * 3, u * 2, u * 6);
  ctx.fillStyle = "#1a1410";
  ctx.fillRect(start + u * 2, -u * 1.5 - 1, len + 2, u * 3 + 2);
  ctx.fillStyle = big ? boss.shotColor : "#dfe7ef";
  ctx.fillRect(start + u * 2, -u * 1.5, len, u * 3);
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.fillRect(start + u * 2, -u * 1.5, len, u);
  ctx.fillStyle = big ? boss.shotColor : "#dfe7ef";
  ctx.fillRect(start + u * 2 + len, -u, u * 2, u * 2);
  ctx.restore();
}

function drawSlash(effect) {
  const k = clamp(effect.life / effect.max, 0, 1);
  const from = effect.kind === "spin" ? 0 : effect.angle - effect.spread * effect.side;
  const sweep = effect.kind === "spin" ? Math.PI * 2 : effect.spread * 2 * effect.side;
  const done = 1 - k * 0.6;
  ctx.globalAlpha = k;
  if (effect.kind === "thrust") {
    ctx.save();
    ctx.translate(effect.x, effect.y);
    ctx.rotate(effect.angle);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(10, -5, effect.reach, 10);
    ctx.fillStyle = effect.color;
    ctx.fillRect(10, -9, effect.reach * 0.8, 3);
    ctx.fillRect(10, 6, effect.reach * 0.8, 3);
    ctx.restore();
  } else {
    for (const [width, color, shrink] of [[effect.heavy ? 16 : 12, effect.color, 0], [5, "#ffffff", 6]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      if (sweep >= 0) ctx.arc(effect.x, effect.y, effect.reach - 8 - shrink, from, from + sweep * done);
      else ctx.arc(effect.x, effect.y, effect.reach - 8 - shrink, from + sweep * done, from);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

// A ring that shrinks onto the boss. When it closes, the attack comes.
function drawTell(boss) {
  const k = clamp(boss.stateTimer / boss.tellTime, 0, 1);
  const r = boss.size * 0.6 + k * 70;
  const pulse = boss.feint > 0 && k <= 0.15 ? Math.sin(state.anim * 40) * 0.3 : 0;
  ctx.strokeStyle = `rgba(255, 90, 61, ${0.55 + (1 - k) * 0.4 + pulse})`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(boss.x, boss.y - (boss.hop || 0), r, 0, Math.PI * 2);
  ctx.stroke();
  outlinedText("!", boss.x, boss.y - boss.size * (boss.isBig ? 1.05 : 0.8), { size: 26, align: "center", font: DISPLAY_FONT, color: "#ff5a3d" });
}

function drawStunStars(x, y, scale = 1) {
  for (let i = 0; i < 3; i += 1) {
    const a = state.anim * 5 + (i * Math.PI * 2) / 3;
    drawStar(ctx, x + Math.cos(a) * 18 * scale, y + Math.sin(a) * 6 * scale, 5 * scale, i % 2 ? "#ffffff" : "#f6c85f");
  }
}

function drawTransformAura(boss) {
  const t = boss.transforming;
  const r = boss.size * (0.9 + Math.sin(state.anim * 20) * 0.08) + (1.6 - t) * 40;
  ctx.fillStyle = `rgba(255, 90, 61, ${0.15 + Math.sin(state.anim * 25) * 0.08})`;
  ctx.beginPath();
  ctx.arc(boss.x, boss.y - 10, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = boss.shotColor || "#ffffff";
  ctx.lineWidth = 4;
  ctx.stroke();
}

function drawBigBossFoe(b) {
  const s = b.size;
  const lift = b.hop || 0;
  const shrink = 1 - Math.min(0.6, lift / 500);
  ctx.globalAlpha = b.alpha;
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.fillRect(b.x - s * 0.55 * shrink, b.y + s * 0.5, s * 1.1 * shrink, 12);
  const cx = b.x + (b.state === "windup" ? rand(-3, 3) : 0);
  const cy = b.y - lift;
  drawBigBoss(ctx, b.row, cx, cy, s, b.wobble, b);
  if (b.melee) drawSword(b, cx, cy);
  if (b.flash > 0) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.fillRect(cx - s * 0.45, cy - s * 0.8, s * 0.9, s * 1.35);
  }
  if (state.clock < b.slowUntil) {
    ctx.strokeStyle = "#b8f1ff";
    ctx.lineWidth = 3;
    ctx.strokeRect(cx - s * 0.5, cy - s * 0.85, s, s * 1.45);
  }
  if (isBurning(b)) {
    const flick = Math.floor(state.anim * 12) % 2;
    ctx.fillStyle = "#ff742e";
    ctx.fillRect(cx - 10, cy - s * 0.95 - flick, 7, 10 + flick);
    ctx.fillRect(cx + 4, cy - s * 0.98 + flick, 7, 12 - flick);
  }
  ctx.globalAlpha = 1;
}

// Each big boss is drawn from blocks on a grid of u-sized squares.
function drawBigBoss(g, row, x, y, s, t, b) {
  const u = s / 12;
  const angry = Boolean(b && b.enraged);
  const box = (color, bx, by, w, h) => {
    g.fillStyle = color;
    g.fillRect(x + bx * u, y + by * u, w * u, h * u);
  };
  const look = !b || state.mode === "title" ? 0 : clamp((nearestPlayer(x, y).x - x) / 200, -1, 1);
  switch (row) {
    case 0: { // King Bonecrown
      const sway = Math.sin(t * 2) * 0.3;
      box("#3d1a4d", -5.5, -2, 11, 8.2);
      box("#5b2a6e", -5, -2, 10, 7.7);
      box("#f6c85f", -5, -2, 10, 0.6);
      box("#e8e2cf", -2.2, 5.6, 1.4, 1.6);
      box("#e8e2cf", 0.8, 5.6, 1.4, 1.6);
      box("#d8d2bf", -3, -1, 6, 5);
      for (const ry of [0, 1.3, 2.6]) box("#2a2520", -2.4, ry, 4.8, 0.5);
      box("#e8e2cf", -0.4, -1, 0.8, 5);
      box("#e8e2cf", -3.2, -7.5, 6.4, 5.8);
      box("#d0c9b4", -3.2, -2.3, 6.4, 0.6);
      box("#1a1410", -2.4, -5.8, 1.8, 1.8);
      box("#1a1410", 0.6, -5.8, 1.8, 1.8);
      box(angry ? "#ff4b4b" : "#7cf2ff", -2 + look * 0.3, -5.3, 0.9, 0.9);
      box(angry ? "#ff4b4b" : "#7cf2ff", 1 + look * 0.3, -5.3, 0.9, 0.9);
      box("#1a1410", -0.3, -3.9, 0.6, 0.6);
      box("#1a1410", -2, -2.9, 4, 0.5);
      box("#8a5f12", -3.6, -9, 7.2, 1.8);
      box("#f6c85f", -3.4, -8.9, 6.8, 1.5);
      box("#f6c85f", -3.4, -10.4, 1.2, 1.5);
      box("#f6c85f", -0.6, -11, 1.2, 2.1);
      box("#f6c85f", 2.2, -10.4, 1.2, 1.5);
      box("#c084fc", -2.4, -8.6, 0.8, 0.8);
      box("#ef5b4b", -0.4, -8.6, 0.8, 0.8);
      box("#c084fc", 1.6, -8.6, 0.8, 0.8);
      box("#8a5f12", 4.6, -5 + sway, 0.7, 9);
      box("#e8e2cf", 3.9, -6.8 + sway, 2.1, 1.9);
      box("#1a1410", 4.3, -6.2 + sway, 0.5, 0.5);
      box("#1a1410", 5.1, -6.2 + sway, 0.5, 0.5);
      box("#e8e2cf", 3.6, 0 + sway, 1.6, 1);
      box("#e8e2cf", -5.2, 0, 1.6, 1);
      break;
    }
    case 1: { // Magmaw the Lava Golem
      const glow = angry ? "#ffe45c" : "#ff7a2e";
      const blink = Math.sin(t * 5) > 0.2;
      const fist = Math.sin(t * 3) * 0.4;
      box("#3a2520", -7.4, -1 + fist, 2.6, 3);
      box("#3a2520", 4.8, -1 - fist, 2.6, 3);
      box("#7a5244", -7.8, 1.6 + fist, 3.2, 2.8);
      box("#7a5244", 4.6, 1.6 - fist, 3.2, 2.8);
      box(glow, -7.2, 2.4 + fist, 0.6, 1.2);
      box(glow, 6.6, 2.4 - fist, 0.6, 1.2);
      box("#3a2520", -4, 5, 3, 2.2);
      box("#3a2520", 1, 5, 3, 2.2);
      box("#1e100c", -5, -6, 10, 11.5);
      box("#6b4a3e", -4.6, -5.6, 9.2, 10.8);
      box("#8f6253", -4.6, -5.6, 9.2, 1.2);
      box("#1a0a06", -3.4, -4.4, 2.4, 1.6);
      box("#1a0a06", 1, -4.4, 2.4, 1.6);
      box(blink ? "#ffe45c" : glow, -3 + look * 0.3, -4, 1.4, 0.9);
      box(blink ? "#ffe45c" : glow, 1.4 + look * 0.3, -4, 1.4, 0.9);
      box("#1a0a06", -2.5, -2.2, 5, 1.4);
      box(glow, -2.2, -1.9, 4.4, 0.8);
      box(glow, -3.5, 0.6, 2.5, 0.5);
      box(glow, -1.5, 0.6, 0.5, 2);
      box(glow, 1.5, 1.4, 2.6, 0.5);
      box(glow, 2.2, 1.4, 0.5, 2.5);
      box(glow, -3, 3.4, 2, 0.5);
      if (b && state.mode === "playing" && Math.random() < 0.12) burst(x + rand(-s / 2, s / 2), y + s * 0.2, [glow, "#ffd166"], 1, 40);
      break;
    }
    case 2: { // Queen Frostbite
      const yb = Math.sin(t * 2.2) * 0.5;
      box("#5fb8e0", -2.5, 0 + yb, 5, 1.5);
      box("#8fd3f0", -3.5, 1.5 + yb, 7, 1.8);
      box("#bfeaff", -4.5, 3.3 + yb, 9, 1.8);
      box("#e6f8ff", -5.5, 5.1 + yb, 11, 1.6);
      box("#ffffff", -5.5, 6.4 + yb, 11, 0.4);
      box("#5fb8e0", -2.2, -3 + yb, 4.4, 3.2);
      box("#ffffff", -0.4, -3 + yb, 0.8, 3.2);
      box("#bfeaff", -3.6, -2.6 + yb, 1.4, 3.4);
      box("#bfeaff", 2.2, -2.6 + yb, 1.4, 3.4);
      box("#e6f8ff", -2.6, -7.4 + yb, 5.2, 1.4);
      box("#e6f8ff", -2.6, -6.2 + yb, 0.8, 4);
      box("#e6f8ff", 1.8, -6.2 + yb, 0.8, 4);
      box("#f2fbff", -2, -6.6 + yb, 4, 3.6);
      box(angry ? "#1d4ed8" : "#2a6fb0", -1.3 + look * 0.2, -5.4 + yb, 0.8, 0.9);
      box(angry ? "#1d4ed8" : "#2a6fb0", 0.5 + look * 0.2, -5.4 + yb, 0.8, 0.9);
      box("#7cc4e8", -0.5, -3.9 + yb, 1, 0.4);
      [[-2.6, 1.4], [-1.5, 2.6], [-0.45, 3.6], [0.6, 2.6], [1.7, 1.4]].forEach(([cx, h], i) => {
        box(i % 2 === 0 ? "#bdf1ff" : "#ffffff", cx, -7.4 + yb - h, 0.9, h);
      });
      for (let i = 0; i < 3; i += 1) {
        const a = t * 1.6 + i * 2.094;
        g.save();
        g.translate(x + Math.cos(a) * 6.5 * u, y + (Math.sin(a) * 2.5 - 2) * u);
        g.rotate(Math.PI / 4);
        g.fillStyle = "#bdf1ff";
        g.fillRect(-u * 0.6, -u * 0.6, u * 1.2, u * 1.2);
        g.restore();
      }
      break;
    }
    case 3: { // Count Shadowfang
      const flap = Math.sin(t * 3) * 0.6;
      for (const [color, k] of [["#1a1226", 1], ["#8a1838", 0.78]]) {
        g.fillStyle = color;
        for (const side of [-1, 1]) {
          g.beginPath();
          g.moveTo(x + side * 1.5 * u, y - 4 * u);
          g.lineTo(x + side * (7.5 + flap) * k * u, y - (6 + flap) * k * u);
          g.lineTo(x + side * 6.5 * k * u, y + 1 * u);
          g.lineTo(x + side * 7 * k * u, y + 5 * k * u);
          g.lineTo(x + side * 2 * u, y + 6 * k * u);
          g.closePath();
          g.fill();
        }
      }
      box("#120c1a", -2.6, -3, 5.2, 8.5);
      box("#f2f2f2", -0.9, -3, 1.8, 3.5);
      box("#c0254a", -1, -2.8, 2, 0.8);
      box("#120c1a", -2.2, 5.5, 1.6, 1.6);
      box("#120c1a", 0.6, 5.5, 1.6, 1.6);
      box("#8a1838", -3.6, -6.4, 1.2, 3.4);
      box("#8a1838", 2.4, -6.4, 1.2, 3.4);
      box("#e6e0ef", -2.2, -7.8, 4.4, 4.4);
      box("#120c1a", -2.4, -8.4, 4.8, 1.2);
      box("#120c1a", -0.5, -7.4, 1, 0.8);
      box("#1a0a10", -1.6, -6.4, 1.2, 1);
      box("#1a0a10", 0.4, -6.4, 1.2, 1);
      box(angry ? "#ff2a2a" : "#e0457f", -1.4 + look * 0.2, -6.2, 0.7, 0.7);
      box(angry ? "#ff2a2a" : "#e0457f", 0.6 + look * 0.2, -6.2, 0.7, 0.7);
      box("#5a1830", -1, -4.6, 2, 0.3);
      box("#ffffff", -0.9, -4.4, 0.4, 0.7);
      box("#ffffff", 0.5, -4.4, 0.4, 0.7);
      for (let i = 0; i < 2; i += 1) {
        const a = t * 2 + i * Math.PI;
        const bx = Math.cos(a) * 7;
        const by = -8 + Math.sin(a * 2);
        const up = Math.sin(t * 16 + i) > 0 ? -0.5 : 0;
        box("#2a1f3d", bx - 0.5, by, 1, 0.8);
        box("#2a1f3d", bx - 1.4, by + up, 0.9, 0.5);
        box("#2a1f3d", bx + 0.5, by + up, 0.9, 0.5);
      }
      break;
    }
    default: { // Crystal Colossus
      const dark = "#5b3fc4";
      const mid = "#8f6cff";
      const light = "#d6c7ff";
      const beat = Math.sin(t * 4) > 0;
      box(dark, -4, 4, 3, 3);
      box(dark, 1, 4, 3, 3);
      box(dark, -7, -2, 2, 5);
      box(dark, 5, -2, 2, 5);
      box(dark, -5, -4, 10, 8.5);
      box(mid, -4.6, -3.6, 9.2, 7.8);
      box("rgba(255, 255, 255, 0.18)", -4.6, -3.6, 3, 7.8);
      box(angry ? "#ff6bd5" : "#ffe45c", -1.4, -1, 2.8, 2.8);
      box(beat ? "#ffffff" : light, -0.7, -0.3, 1.4, 1.4);
      box(mid, -7, -6, 2, 4);
      box(light, -6.6, -8, 1.2, 2);
      box(mid, 5, -6, 2, 4);
      box(light, 5.4, -8, 1.2, 2);
      box(dark, -2.6, -8, 5.2, 4.2);
      box(mid, -2.3, -7.7, 4.6, 3.6);
      box(light, -0.6, -10.2, 1.2, 2.2);
      box(light, -2.4, -9.2, 1, 1.2);
      box(light, 1.4, -9.2, 1, 1.2);
      box("#ffffff", -1.8 + look * 0.2, -6.4, 1.2, 0.8);
      box("#ffffff", 0.6 + look * 0.2, -6.4, 1.2, 0.8);
      for (let i = 0; i < 4; i += 1) {
        const a = t * 1.2 + (i * Math.PI) / 2;
        box(light, Math.cos(a) * 7.5 - 0.4, Math.sin(a) * 3 - 1.8, 0.8, 1.6);
      }
      break;
    }
  }
}

function drawTelegraph(enemy) {
  if (enemy.state === "swing" && enemy.swings && enemy.swings[0]) {
    // A red wedge shows where the sword is about to land.
    const kind = enemy.swings[0].kind;
    const k = clamp(enemy.stateTimer / enemy.swingTotal, 0, 1);
    const angle = Math.atan2(enemy.lockY, enemy.lockX);
    const spread = swingSpread(kind);
    ctx.fillStyle = `rgba(239, 91, 75, ${0.1 + (1 - k) * 0.25})`;
    ctx.beginPath();
    ctx.moveTo(enemy.x, enemy.y);
    ctx.arc(enemy.x, enemy.y, swingReach(enemy, kind), angle - spread, angle + spread);
    ctx.closePath();
    ctx.fill();
  }
  if (enemy.state === "leap") {
    const k = clamp(enemy.stateTimer / enemy.leapTime, 0, 1);
    ctx.fillStyle = `rgba(239, 91, 75, ${0.12 + (1 - k) * 0.25})`;
    ctx.beginPath();
    ctx.arc(enemy.leapX, enemy.leapY, enemy.melee && !enemy.isBig ? enemy.leapRadius || 90 : 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(239, 91, 75, 0.85)";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (enemy.state === "windup") {
    const length = enemy.isBoss ? 420 : 140;
    const width = enemy.size * 0.9;
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(Math.atan2(enemy.lockY, enemy.lockX));
    ctx.fillStyle = `rgba(239, 91, 75, ${0.18 + Math.sin(state.anim * 30) * 0.08})`;
    ctx.fillRect(0, -width / 2, length, width);
    ctx.restore();
  }
  if (enemy.state === "fuse") {
    ctx.strokeStyle = `rgba(239, 91, 75, ${0.5 + Math.sin(state.anim * 30) * 0.3})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, 85, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/* Monster bodies. Everything is drawn on a grid of "u" units (size / 12)
   around the monster's center, so the same drawing works at any size. */
function drawMonster(g, type, cx, cy, size, t, look, enemy) {
  const u = size / 12;
  const state_ = enemy ? enemy.state : "move";
  const tell = state_ === "windup";
  const dash = state_ === "dash";
  const face = look.x < -0.1 ? -1 : 1;
  const R = (color, x, y, w, h) => {
    g.fillStyle = color;
    g.fillRect(x * u, y * u, w * u, h * u);
  };
  const P = (color, pts) => {
    g.fillStyle = color;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x * u, y * u) : g.moveTo(x * u, y * u)));
    g.closePath();
    g.fill();
  };
  const C = (color, x, y, r) => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(x * u, y * u, r * u, 0, Math.PI * 2);
    g.fill();
  };
  // A soft glow that fades out at the edge.
  const glow = (color, x, y, r, alpha) => {
    const n = parseInt(color.slice(1), 16);
    const rgb = `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
    const fade = g.createRadialGradient(x * u, y * u, 0, x * u, y * u, r * u);
    fade.addColorStop(0, `rgba(${rgb}, ${Math.min(1, alpha * 2)})`);
    fade.addColorStop(1, `rgba(${rgb}, 0)`);
    g.fillStyle = fade;
    g.beginPath();
    g.arc(x * u, y * u, r * u, 0, Math.PI * 2);
    g.fill();
  };
  g.save();
  g.translate(cx, cy);
  const mirrored = !["shard", "eye", "gargoyle", "lantern"].includes(type.behavior);
  if (mirrored) g.scale(face, 1);
  g.lineCap = "round";
  g.lineJoin = "round";

  switch (type.behavior) {
    case "pack": {
      const run = Math.sin(t * 14);
      const lunge = dash ? 1.5 : 0;
      g.strokeStyle = "#1b1d30";
      g.lineWidth = 1.8 * u;
      g.beginPath();
      g.moveTo(-5.5 * u, -1 * u);
      g.quadraticCurveTo(-9 * u, -2 * u, -9.5 * u, (-6 + run) * u);
      g.stroke();
      R("#1b1d30", -5, 2, 1.6, 4 + run * 0.8);
      R("#1b1d30", 2.6, 2, 1.6, 4 - run * 0.8);
      R(type.color, -3.4, 2, 1.6, 4 - run * 0.8);
      R(type.color, 4.2 + lunge * 0.4, 2, 1.6, 4 + run * 0.8);
      P(type.color, [[-6, -2], [4, -3], [5.5, 1], [3, 3], [-5, 3], [-6.5, 1]]);
      P("#1b1d30", [[-4.5, -2.4], [-3.5, -5.2], [-2.4, -2.8], [-1.2, -5.8], [0, -3], [1.2, -5.4], [2.4, -3.1]]);
      P(type.color, [[3, -5 - lunge * 0.3], [7, -5], [10.5 + lunge, -3.2], [10.5 + lunge, -1.6], [7, -1 + lunge * 0.4], [4, 0]]);
      P("#1b1d30", [[4, -4.8], [5, -8.4], [6.2, -4.8]]);
      P("#11131f", [[9.6 + lunge, -3.6], [10.6 + lunge, -3.6], [10.6 + lunge, -2.6]]);
      glow(type.accent, 7, -3.6, 1.6, 0.35);
      R(type.accent, 6.4, -4.2, 1.4, 1);
      if (tell || dash) {
        R("#ffffff", 8, -1.7 + lunge * 0.3, 0.5, 0.9);
        R("#ffffff", 9.3, -1.6 + lunge * 0.3, 0.5, 0.8);
      }
      break;
    }
    case "serpent": {
      const sway = Math.sin(t * 4);
      const hx = tell ? -0.5 : dash ? 6.5 : 2 + sway * 0.5;
      const hy = tell ? -4 : dash ? -2 : -5;
      const body = () => {
        g.beginPath();
        g.moveTo(-7 * u, 5.5 * u);
        g.bezierCurveTo(-2 * u, (7 + sway) * u, -6 * u, -1 * u, -1 * u, (0.5 + sway * 0.5) * u);
        g.quadraticCurveTo(3 * u, 1 * u, hx * u, (hy + 1.5) * u);
        g.stroke();
      };
      g.strokeStyle = "#173d22";
      g.lineWidth = 4 * u;
      body();
      g.strokeStyle = type.color;
      g.lineWidth = 2.8 * u;
      body();
      g.strokeStyle = type.accent;
      g.lineWidth = 0.7 * u;
      g.setLineDash([u * 1.2, u * 1.2]);
      body();
      g.setLineDash([]);
      P(type.color, [[hx - 3, hy], [hx - 1.5, hy - 3.8], [hx + 1.5, hy - 3.6], [hx + 2.6, hy + 1.6], [hx, hy + 2.6], [hx - 2.4, hy + 2.4]]);
      R(type.accent, hx - 1.6, hy - 1.6, 0.9, 0.9);
      R(type.accent, hx - 1.6, hy + 0.6, 0.9, 0.9);
      P("#1f5a30", [[hx - 0.6, hy - 2.2], [hx + 3.8, hy - 1.6], [hx + 4.4, hy - 0.2], [hx - 0.2, hy + 0.8]]);
      glow("#ff3030", hx + 1.8, hy - 1, 1.2, 0.35);
      R("#ff3030", hx + 1.4, hy - 1.5, 0.9, 0.9);
      if (Math.sin(t * 9) > 0.3 || tell) {
        g.strokeStyle = "#ff3a5c";
        g.lineWidth = 0.45 * u;
        g.beginPath();
        g.moveTo((hx + 4.2) * u, (hy - 0.4) * u);
        g.lineTo((hx + 6) * u, (hy - 0.4) * u);
        g.lineTo((hx + 6.8) * u, (hy - 1.1) * u);
        g.moveTo((hx + 6) * u, (hy - 0.4) * u);
        g.lineTo((hx + 6.8) * u, (hy + 0.3) * u);
        g.stroke();
      }
      break;
    }
    case "shard": {
      const bob = Math.sin(t * 3) * 0.8;
      glow(type.color, 0, bob, 7.5, 0.22);
      P(type.color, [[0, -8 + bob], [3.6, -1 + bob], [0, 8 + bob], [-3.6, -1 + bob]]);
      P("#1f9a8c", [[0, -8 + bob], [3.6, -1 + bob], [0, 8 + bob], [0.8, bob]]);
      P(type.accent, [[0, -7 + bob], [-1.4, -1 + bob], [-0.6, 3 + bob], [-2.6, -1 + bob]]);
      R("#0d3b37", -1.7, -1.2 + bob, 0.8, 1.8);
      R("#0d3b37", 0.9, -1.2 + bob, 0.8, 1.8);
      for (let k = 0; k < 3; k += 1) {
        const a = t * 2 + k * 2.1;
        const x = Math.cos(a) * 6.2;
        const y = Math.sin(a) * 2.6 + bob;
        P(Math.sin(a) > 0 ? type.accent : type.color, [[x, y - 1.3], [x + 0.8, y], [x, y + 1.3], [x - 0.8, y]]);
      }
      break;
    }
    case "eye": {
      const charging = state_ === "aim" || state_ === "beam";
      g.strokeStyle = "#3b2a6e";
      g.lineWidth = 1 * u;
      for (let k = 0; k < 5; k += 1) {
        const x0 = -3 + k * 1.5;
        g.beginPath();
        g.moveTo(x0 * u, 3 * u);
        g.quadraticCurveTo((x0 + Math.sin(t * 5 + k) * 1.5) * u, 6 * u, (x0 + Math.sin(t * 4 + k * 2) * 2) * u, 9 * u);
        g.stroke();
      }
      for (let k = 0; k < 8; k += 1) {
        const a = (k / 8) * Math.PI * 2 + t * 0.6;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        P("#3b2a6e", [[ca * 5 - sa * 1.1, sa * 5 + ca * 1.1], [ca * 7.6, sa * 7.6], [ca * 5 + sa * 1.1, sa * 5 - ca * 1.1]]);
      }
      if (charging) glow(type.accent, 0, 0, 8 + Math.sin(t * 30), 0.35);
      C(type.color, 0, 0, 5.6);
      C("#f4eefc", 0, 0, 3.8);
      g.strokeStyle = "#e6a3c8";
      g.lineWidth = 0.35 * u;
      g.beginPath();
      g.moveTo(-3.6 * u, 0.6 * u);
      g.lineTo(-2.2 * u, 0.2 * u);
      g.moveTo(3.4 * u, -1.2 * u);
      g.lineTo(2.2 * u, -0.6 * u);
      g.stroke();
      const ix = look.x * 1.3;
      const iy = look.y * 1.3;
      C(type.accent, ix, iy, charging ? 2.4 : 1.8);
      R("#120a1c", ix - 0.35, iy - 1.3, 0.7, 2.6);
      R("#ffffff", ix + 0.5, iy - 1.2, 0.6, 0.6);
      break;
    }
    case "ember": {
      const flick = Math.sin(t * 18);
      const flame = (color, k, dy) => {
        g.fillStyle = color;
        g.beginPath();
        g.moveTo(0, (-9 + flick * 0.6) * k * u + dy * u);
        g.quadraticCurveTo(5 * k * u, -3 * k * u + dy * u, 4.6 * k * u, 2 * k * u + dy * u);
        g.quadraticCurveTo(4 * k * u, 6.5 * k * u + dy * u, 0, 6.5 * k * u + dy * u);
        g.quadraticCurveTo(-4 * k * u, 6.5 * k * u + dy * u, -4.6 * k * u, 2 * k * u + dy * u);
        g.quadraticCurveTo(-5 * k * u, -3 * k * u + dy * u, 0, (-9 + flick * 0.6) * k * u + dy * u);
        g.fill();
      };
      glow(type.color, 0, 1, 8, 0.25);
      P(type.color, [[3, -3], [6, -7 - flick], [4.6, -1]]);
      P(type.color, [[-3, -2], [-5.6, -6 + flick], [-4.6, 0]]);
      flame(type.color, 1, 0);
      flame(type.accent, 0.68, 1.8);
      flame("#fff6c2", 0.35, 3.6);
      P("#3a0d00", [[-2.8, -0.4], [-0.6, 0.4], [-0.8, 1.6], [-2.6, 1.2]]);
      P("#3a0d00", [[2.8, -0.4], [0.6, 0.4], [0.8, 1.6], [2.6, 1.2]]);
      P("#3a0d00", [[-1.6, 3], [1.6, 3], [0.8, 4.2], [-0.8, 4.2]]);
      break;
    }
    case "wraith": {
      const bob = Math.sin(t * 2.5) * 0.8;
      const reach = tell ? -5 : 1 + Math.sin(t * 3) * 0.6;
      glow(type.accent, 0, bob, 8.5, 0.18);
      g.strokeStyle = "#e8e2d0";
      g.lineWidth = 0.9 * u;
      g.beginPath();
      g.moveTo(3 * u, (0 + bob) * u);
      g.lineTo(8 * u, (reach + bob) * u);
      g.moveTo(-3 * u, (0.5 + bob) * u);
      g.lineTo(-6.5 * u, (reach + 1 + bob) * u);
      g.stroke();
      for (const [hx, side] of [[8, 1], [-6.5, -1]]) {
        for (let k = -1; k <= 1; k += 1) {
          g.beginPath();
          g.moveTo(hx * u, ((side > 0 ? reach : reach + 1) + bob) * u);
          g.lineTo((hx + side * 1.6) * u, ((side > 0 ? reach : reach + 1) + bob + k * 1.1) * u);
          g.stroke();
        }
      }
      g.fillStyle = type.color;
      g.beginPath();
      g.moveTo(0, (-9 + bob) * u);
      g.quadraticCurveTo(5.5 * u, (-8.5 + bob) * u, 5.2 * u, (-1 + bob) * u);
      g.lineTo(6 * u, (6 + bob) * u);
      for (let k = 0; k <= 6; k += 1) {
        const x = 6 - k * 2;
        g.lineTo(x * u, (6 + (k % 2 ? 3 : 0) + Math.sin(t * 6 + k) * 0.8 + bob) * u);
      }
      g.lineTo(-5.2 * u, (-1 + bob) * u);
      g.quadraticCurveTo(-5.5 * u, (-8.5 + bob) * u, 0, (-9 + bob) * u);
      g.fill();
      P("#8f97c9", [[-5.2, -1 + bob], [-2, 1 + bob], [-3, 6 + bob], [-6, 6 + bob]]);
      g.fillStyle = "#140f2a";
      g.beginPath();
      g.ellipse(0.8 * u, (-4 + bob) * u, 3.2 * u, 3.1 * u, 0, 0, Math.PI * 2);
      g.fill();
      glow(type.accent, 0.8, -4.2 + bob, 2.6, 0.4);
      R(tell ? "#ff4d5e" : "#d9ccff", -0.8, -5 + bob, 1, 1.4);
      R(tell ? "#ff4d5e" : "#d9ccff", 1.6, -5 + bob, 1, 1.4);
      break;
    }
    case "gargoyle": {
      const stone = enemy ? enemy.stone : false;
      const body = stone ? "#8a8794" : type.color;
      const wing = stone ? "#77737f" : "#433f4f";
      const horn = stone ? "#a6a2ad" : "#d8cfb8";
      const flap = stone ? 0 : Math.sin(t * 12) * 2;
      if (stone) {
        P(wing, [[-2.5, -4], [-6, -7], [-6.5, 3], [-3, 4]]);
        P(wing, [[2.5, -4], [6, -7], [6.5, 3], [3, 4]]);
      } else {
        P(wing, [[-2, -3], [-9, -9 + flap], [-11, -2 + flap], [-8, -3 + flap * 0.5], [-7, 1], [-5, -0.5], [-3, 2]]);
        P(wing, [[2, -3], [9, -9 + flap], [11, -2 + flap], [8, -3 + flap * 0.5], [7, 1], [5, -0.5], [3, 2]]);
      }
      R(body, -3, 5, 2, 3);
      R(body, 1, 5, 2, 3);
      R(horn, -3.4, 7.4, 0.8, 0.8);
      R(horn, -1.6, 7.4, 0.8, 0.8);
      R(horn, 0.8, 7.4, 0.8, 0.8);
      R(horn, 2.6, 7.4, 0.8, 0.8);
      P(body, [[-3.4, -4], [3.4, -4], [4.2, 2], [2.2, 6], [-2.2, 6], [-4.2, 2]]);
      R(stone ? "#77737f" : "#4a4555", -2, -2, 4, 0.6);
      R(stone ? "#77737f" : "#4a4555", -1.6, 0, 3.2, 0.6);
      R(body, -2.6, -8.4, 5.2, 4.8);
      P(horn, [[-2.6, -7.8], [-4.8, -11.4], [-1.4, -8.4]]);
      P(horn, [[2.6, -7.8], [4.8, -11.4], [1.4, -8.4]]);
      if (!stone) {
        glow(type.accent, 0, -6.5, 2.6, 0.35);
        R(type.accent, -1.9, -7, 1.3, 1);
        R(type.accent, 0.6, -7, 1.3, 1);
        R("#ffffff", -1, -4.6, 0.5, 0.9);
        R("#ffffff", 0.5, -4.6, 0.5, 0.9);
      } else {
        R("#55515e", -1.9, -7, 1.3, 0.6);
        R("#55515e", 0.6, -7, 1.3, 0.6);
        g.strokeStyle = "#5d5868";
        g.lineWidth = 0.4 * u;
        g.beginPath();
        g.moveTo(-1 * u, -3 * u);
        g.lineTo(0.4 * u, -0.5 * u);
        g.lineTo(-0.6 * u, 2 * u);
        g.moveTo(2 * u, -7.8 * u);
        g.lineTo(1.2 * u, -6 * u);
        g.stroke();
      }
      break;
    }
    case "lantern": {
      const bob = Math.sin(t * 2.4) * 0.9;
      const pulse = 0.25 + Math.sin(t * 5) * 0.08;
      glow(type.accent, 0, -1 + bob, 9, pulse);
      g.strokeStyle = "#6b5a3a";
      g.lineWidth = 0.7 * u;
      g.beginPath();
      g.arc(0, (-8.6 + bob) * u, 2 * u, Math.PI, 0);
      g.stroke();
      P("#5a4a2e", [[-3, -8 + bob], [3, -8 + bob], [4.6, -6 + bob], [-4.6, -6 + bob]]);
      R("rgba(125, 255, 176, 0.35)", -3.6, -6 + bob, 7.2, 9);
      const fl = Math.sin(t * 14) * 0.5;
      P(type.accent, [[0, -5 + bob + fl], [2.2, -0.5 + bob], [0, 2 + bob], [-2.2, -0.5 + bob]]);
      P("#e9fff2", [[0, -2.6 + bob + fl], [1, 0 + bob], [0, 1.4 + bob], [-1, 0 + bob]]);
      R("#0d3b22", -1.2, -1 + bob, 0.6, 0.8);
      R("#0d3b22", 0.6, -1 + bob, 0.6, 0.8);
      R(type.color, -4, -6 + bob, 1, 9);
      R(type.color, 3, -6 + bob, 1, 9);
      R(type.color, -0.4, -6 + bob, 0.8, 9);
      P("#5a4a2e", [[-4.6, 3 + bob], [4.6, 3 + bob], [3, 5 + bob], [-3, 5 + bob]]);
      for (let k = 0; k < 2; k += 1) {
        const a = t * 1.8 + k * Math.PI;
        const x = Math.cos(a) * 7.5;
        const y = Math.sin(a) * 3 + bob;
        glow(type.accent, x, y, 1.6, 0.6);
        C("#e9fff2", x, y, 0.8);
      }
      break;
    }
    case "raven": {
      const flap = Math.sin(t * (enemy && enemy.small ? 18 : 12));
      glow(type.accent, 0, 0, 7, 0.15);
      P(type.color, [[-5, -1], [-9.5, -3], [-9, 0], [-9.5, 2], [-4, 2]]);
      R("#e0c060", -1, 2.6, 0.5, 2.4);
      R("#e0c060", 1.2, 2.6, 0.5, 2.4);
      P(type.color, [[-5, -1], [0, -3.6], [4, -2.2], [5, 0], [2, 3], [-4, 2.2]]);
      C(type.color, 4.6, -3.6, 2.6);
      P("#e0c060", [[6.6, -4.4], [9.8, -3.2], [6.6, -2.4]]);
      glow(type.accent, 5.3, -4.1, 1.5, 0.5);
      C(type.accent, 5.3, -4.1, 0.75);
      P("#2c1d4f", [[-3.4, -1.6], [2.6, -1.6], [-0.6, -1.6 - 7 * flap], [-5, -1.6 - 5 * flap]]);
      P(type.accent, [[-0.6, -1.6 - 7 * flap], [-5, -1.6 - 5 * flap], [-3.6, -1.6 - 4 * flap]]);
      break;
    }
  }
  g.restore();
}

// Warnings for monster attacks: a red line for a pounce, a circle for a
// wraith's claws, and a thin aiming line while an eye charges its beam.
function drawMonsterTell(enemy) {
  if (enemy.state === "windup" && ["pack", "serpent", "gargoyle"].includes(enemy.behavior)) {
    const reach = enemy.behavior === "serpent" ? 115 : enemy.behavior === "pack" ? 150 : 160;
    ctx.strokeStyle = "rgba(239, 91, 75, 0.75)";
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.moveTo(enemy.x, enemy.y);
    ctx.lineTo(enemy.x + enemy.lockX * reach, enemy.y + enemy.lockY * reach);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (enemy.state === "windup" && enemy.behavior === "wraith") {
    ctx.fillStyle = "rgba(123, 92, 255, 0.18)";
    ctx.strokeStyle = "rgba(239, 91, 75, 0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  if (enemy.behavior === "eye" && (enemy.state === "aim" || enemy.state === "beam")) {
    const ex = enemy.x + Math.cos(enemy.beamAngle) * EYE_BEAM;
    const ey = enemy.y + Math.sin(enemy.beamAngle) * EYE_BEAM;
    ctx.beginPath();
    ctx.moveTo(enemy.x, enemy.y);
    ctx.lineTo(ex, ey);
    if (enemy.state === "aim") {
      ctx.strokeStyle = `rgba(255, 79, 216, ${0.35 + Math.sin(state.anim * 30) * 0.2})`;
      ctx.lineWidth = 2 + (1.1 - enemy.stateTimer) * 4;
      ctx.setLineDash([12, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = "rgba(255, 79, 216, 0.85)";
      ctx.lineWidth = 26;
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 8;
      ctx.stroke();
    }
  }
}

// Scratch canvases for tinting a boss figure without ctx.filter.
const tintCanvas = document.createElement("canvas");
const tintCtx = tintCanvas.getContext("2d");
const tintMask = document.createElement("canvas");
const tintMaskCtx = tintMask.getContext("2d");

function drawTintedFigure(enemy, cx, cy, size, look, hue, flash) {
  const box = Math.ceil(size * 6);
  if (tintCanvas.width < box || tintCanvas.height < box) {
    tintCanvas.width = tintCanvas.height = box;
    tintMask.width = tintMask.height = box;
  }
  const n = tintCanvas.width;
  const half = n / 2;
  const left = Math.round(cx - half);
  const top = Math.round(cy - half);
  tintCtx.clearRect(0, 0, n, n);
  drawBossFigure(tintCtx, enemy, half + (cx - half - left), half + (cy - half - top), size, enemy.wobble, look);
  if (hue) {
    // A silhouette in the tint color, then blended in as "color" so shading stays.
    tintMaskCtx.globalCompositeOperation = "source-over";
    tintMaskCtx.clearRect(0, 0, n, n);
    tintMaskCtx.fillStyle = hue;
    tintMaskCtx.fillRect(0, 0, n, n);
    tintMaskCtx.globalCompositeOperation = "destination-in";
    tintMaskCtx.drawImage(tintCanvas, 0, 0);
    tintCtx.globalCompositeOperation = "color";
    tintCtx.globalAlpha = 0.8;
    tintCtx.drawImage(tintMask, 0, 0);
    tintCtx.globalAlpha = 1;
  }
  if (flash) {
    // Adding the figure onto itself almost doubles its brightness, like a hit flash.
    tintMaskCtx.globalCompositeOperation = "source-over";
    tintMaskCtx.clearRect(0, 0, n, n);
    tintMaskCtx.drawImage(tintCanvas, 0, 0);
    tintCtx.globalCompositeOperation = "lighter";
    tintCtx.globalAlpha = 0.9;
    tintCtx.drawImage(tintMask, 0, 0);
    tintCtx.globalAlpha = 1;
  }
  tintCtx.globalCompositeOperation = "source-over";
  ctx.drawImage(tintCanvas, left, top);
}

function drawEnemy(enemy) {
  const size = enemy.size;
  const shakeX = enemy.state === "windup" ? rand(-2, 2) : 0;
  const hover = enemy.behavior === "blink" || enemy.typeIndex === 8 ? Math.sin(enemy.wobble * 4) * 3 : 0;
  const cx = enemy.x + shakeX;
  const cy = enemy.y + hover;

  ctx.globalAlpha = enemy.alpha;
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.fillRect(enemy.x - size / 2 + 4, enemy.y + size / 2 - 2, size, 7);

  const target = nearestPlayer(enemy.x, enemy.y);
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const d = Math.hypot(dx, dy) || 1;
  const extra = { boss: enemy.isBoss, enemy };
  if (enemy.type.monster) drawMonsterTell(enemy);
  if (enemy.state === "fuse") extra.fuse = enemy.stateTimer / 0.9;
  const figure = enemy.isBoss && BOSS_LOOKS[enemy.typeIndex];
  if (figure) {
    // Figures flash, freeze and get poisoned by recoloring just their own pixels.
    // (ctx.filter looked the same but made boss fights about 20x slower to draw.)
    const look = { x: dx / d, y: dy / d };
    const frozen = state.clock < enemy.slowUntil;
    const poisoned = !frozen && state.clock < (enemy.poisonUntil || 0);
    if (enemy.flash > 0 || frozen || poisoned) drawTintedFigure(enemy, cx, cy, size, look, frozen ? "#6fd6ff" : poisoned ? "#8fdc4a" : null, enemy.flash > 0);
    else drawBossFigure(ctx, enemy, cx, cy, size, enemy.wobble, look);
  } else drawFoeBody(ctx, enemy.typeIndex, cx, cy, size, enemy.wobble, { x: dx / d, y: dy / d }, extra);

  if (enemy.flash > 0 && !figure) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
  }

  if (state.clock < enemy.slowUntil) {
    ctx.strokeStyle = "#b8f1ff";
    ctx.lineWidth = 3;
    if (!figure) {
      ctx.strokeRect(cx - size / 2 - 4, cy - size / 2 - 4, size + 8, size + 8);
      ctx.fillStyle = "rgba(184, 241, 255, 0.25)";
      ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
    }
  }

  if (state.clock < (enemy.poisonUntil || 0)) {
    ctx.fillStyle = "rgba(123, 211, 90, 0.3)";
    if (!figure) ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
    const rise = (state.anim * 2) % 1;
    ctx.fillStyle = "#b5e86b";
    ctx.fillRect(cx + size / 2 - 4, cy - size / 2 - rise * 12, 4, 4);
    ctx.fillRect(cx - size / 2, cy - size / 2 - ((rise + 0.5) % 1) * 12, 3, 3);
  }

  if (isBurning(enemy)) {
    const flick = Math.floor(state.anim * 12) % 2;
    ctx.fillStyle = "#ff742e";
    ctx.fillRect(cx - 6, cy - size / 2 - 8 - flick, 5, 7 + flick);
    ctx.fillRect(cx + 2, cy - size / 2 - 10 + flick, 5, 9 - flick);
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(cx - 5, cy - size / 2 - 4, 3, 3);
    ctx.fillRect(cx + 3, cy - size / 2 - 5, 3, 3);
  }

  if (enemy.melee) drawSword(enemy, cx, cy);

  if (enemy.behavior === "ranged" && enemy.attackTimer < 0.4 && !enemy.isBoss) {
    outlinedText("!", cx, cy - size / 2 - 16, { size: 18, color: "#ffd166", align: "center" });
  }

  if (!enemy.isBoss) {
    const barWidth = Math.max(24, size * 1.5);
    const hpPercent = Math.max(0, enemy.hp / enemy.maxHp);
    if (hpPercent < 1) {
      ctx.fillStyle = "#1b100c";
      ctx.fillRect(enemy.x - barWidth / 2, cy - size / 2 - 10, barWidth, 5);
      ctx.fillStyle = "#7ee36f";
      ctx.fillRect(enemy.x - barWidth / 2, cy - size / 2 - 10, barWidth * hpPercent, 5);
    }
  }
  ctx.globalAlpha = 1;
}

function drawPlayer(p) {
  const look = state.looks[p.index];
  if (p.hp <= 0) {
    drawGhost(p, look);
    return;
  }
  const blink = p.invulnerable > 0 && p.dashTime <= 0 && Math.floor(state.anim * 16) % 2 === 0;
  if (!blink || state.mode !== "playing") {
    drawWizard(ctx, p.x, p.y, look.robe, p.dirX, p.dirY, state.anim + p.index * 0.7, p.moving, look.hat);
  }
  if (p.shield > 0) {
    const fade = p.shield < 1 ? (Math.sin(state.anim * 30) > 0 ? 0.4 : 0.9) : 0.9;
    const colors = ["#ef5b4b", "#ffd166", "#a3e635", "#55aaff", "#c084fc"];
    ctx.globalAlpha = fade;
    colors.forEach((color, i) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 6, 32 + i * 2.5, state.anim * 2 + i, state.anim * 2 + i + Math.PI * 1.6);
      ctx.stroke();
    });
    ctx.fillStyle = "rgba(255, 159, 243, 0.12)";
    ctx.beginPath();
    ctx.arc(p.x, p.y - 6, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (evoIs("shield", "fortress")) {
      orbSpots(p).forEach((s, k) => {
        ctx.fillStyle = "#1a0a18";
        ctx.fillRect(s.x - 12, s.y - 12, 24, 24);
        ctx.fillStyle = ["#ef5b4b", "#ffd166", "#55aaff", "#4ade80", "#c084fc"][k];
        ctx.fillRect(s.x - 10, s.y - 10, 20, 20);
        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
        ctx.fillRect(s.x - 7, s.y - 7, 6, 6);
      });
    }
  }
  if (p.blocking) drawGuard(p);
  if (p.stun > 0) drawStunStars(p.x, p.y - 44, 0.8);
  if (p.drinking > 0) {
    drawSpellIcon("estus", p.x + p.dirX * 16, p.y - 30, "#ef5b4b", 0.6);
  }
  if (state.twoPlayer) drawPlayerTag(p, robes[look.robe]);
}

// A shield of light in front of the wizard. It flashes gold while a parry would work.
function drawGuard(p) {
  const parryOn = !p.parryUsed && state.time - p.blockStart <= PARRY_WINDOW;
  const len = Math.hypot(p.dirX, p.dirY) || 1;
  const dx = p.dirX / len;
  const dy = p.dirY / len;
  const cx = p.x + dx * 24;
  const cy = p.y - 6 + dy * 24;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.fillStyle = parryOn ? "#f6c85f" : p.stamina < 25 ? "rgba(255, 139, 125, 0.75)" : "rgba(155, 231, 255, 0.75)";
  ctx.fillRect(-4, -20, 9, 40);
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.fillRect(-2, -16, 3, 32);
  ctx.restore();
}

// "P1" / "P2" name tags with a tiny health bar, so siblings know who is who.
function drawPlayerTag(p, robe) {
  const y = p.y - 54;
  outlinedText(`P${p.index + 1}`, p.x, y, { size: 14, align: "center", font: DISPLAY_FONT, color: shade(robe.robe, 0.45) });
  if (p.hp > 0) {
    ctx.fillStyle = "#120c08";
    ctx.fillRect(p.x - 16, y + 3, 32, 6);
    ctx.fillStyle = p.hp / stats.maxHp < 0.3 ? "#ff8b7d" : "#7ee36f";
    ctx.fillRect(p.x - 15, y + 4, 30 * clamp(p.hp / stats.maxHp, 0, 1), 4);
  }
}

function drawGhost(p, look) {
  const float = Math.sin(state.anim * 3 + p.index) * 4;
  ctx.globalAlpha = 0.45;
  drawWizard(ctx, p.x, p.y + float - 6, look.robe, p.dirX, p.dirY, state.anim, false, look.hat);
  ctx.globalAlpha = 1;
  const progress = clamp(p.revive / REVIVE_TIME, 0, 1);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(p.x, p.y - 6, 30, 0, Math.PI * 2);
  ctx.stroke();
  if (progress > 0) {
    ctx.strokeStyle = "#ff9ff3";
    ctx.beginPath();
    ctx.arc(p.x, p.y - 6, 30, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.stroke();
  }
  drawPlayerTag(p, robes[look.robe]);
  const pulse = Math.floor(state.anim * 3) % 2 === 0;
  outlinedText(progress > 0 ? "Helping!" : `Help! ${Math.ceil(p.downTimer)}`, p.x, p.y + 38, { size: 13, align: "center", color: pulse ? "#ff9ff3" : "#f8ead2" });
}

// Things lying on the floor, like the frosty puddle Frost Nova leaves behind.
function drawCampfire(room) {
  const { x, y } = CAMPFIRE;
  const lit = state.checkpoint === room.index;
  ctx.fillStyle = "rgba(255, 170, 60, 0.12)";
  ctx.beginPath();
  ctx.arc(x, y, 60 + Math.sin(state.anim * 6) * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4a2d1a";
  ctx.fillRect(x - 22, y + 6, 44, 8);
  ctx.fillStyle = "#6b4226";
  ctx.fillRect(x - 18, y + 2, 36, 7);
  ctx.fillStyle = "#7c7c7c";
  for (const sx of [-26, -14, 8, 20]) ctx.fillRect(x + sx, y + 12, 8, 6);
  const f = Math.floor(state.anim * 10) % 3;
  ctx.fillStyle = "#ff742e";
  ctx.fillRect(x - 12, y - 14 - f, 24, 18 + f);
  ctx.fillStyle = "#ffd166";
  ctx.fillRect(x - 7, y - 8 - (2 - f), 14, 12 + (2 - f));
  ctx.fillStyle = "#fff3b0";
  ctx.fillRect(x - 3, y - 2, 6, 6);
  if (Math.random() < 0.15) burst(x + rand(-8, 8), y - 14, ["#ffd166", "#ff742e"], 1, 30, { lift: 50 });
  outlinedText(lit ? "Campfire (resting spot)" : "Campfire", x, y + 36, { size: 12, align: "center", color: lit ? "#f6c85f" : "#f8ead2" });
}

function drawLostCoins(room) {
  const lost = state.lostCoins;
  if (!lost || lost.room !== room.index) return;
  const bob = Math.sin(state.anim * 4) * 3;
  ctx.fillStyle = `rgba(246, 200, 95, ${0.2 + Math.sin(state.anim * 5) * 0.1})`;
  ctx.beginPath();
  ctx.arc(lost.x, lost.y, 28, 0, Math.PI * 2);
  ctx.fill();
  const coins = [[-10, 4], [6, 6], [-2, -4], [10, -6], [-12, -8]];
  for (const [cx, cy] of coins) {
    ctx.fillStyle = "#8a5f12";
    ctx.fillRect(lost.x + cx - 6, lost.y + cy - 6 + bob, 12, 12);
    ctx.fillStyle = "#f6c85f";
    ctx.fillRect(lost.x + cx - 4, lost.y + cy - 4 + bob, 8, 8);
  }
  outlinedText(`${lost.amount} coins`, lost.x, lost.y - 24 + bob, { size: 13, align: "center", color: "#f6c85f" });
}

function drawGroundEffects() {
  for (const effect of effects) {
    if (effect.type === "emberfire") {
      const fade = clamp(effect.life / 0.5, 0, 1);
      const flick = Math.sin(state.anim * 20 + effect.x) * 2;
      ctx.globalAlpha = fade * 0.35;
      ctx.fillStyle = "#ff6a1f";
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = fade;
      ctx.fillStyle = "#ff8a2a";
      ctx.fillRect(effect.x - 6, effect.y - 9 + flick, 5, 9 - flick);
      ctx.fillRect(effect.x + 1, effect.y - 12 - flick, 5, 12 + flick);
      ctx.fillStyle = "#ffd23f";
      ctx.fillRect(effect.x - 4, effect.y - 4, 3, 4);
      ctx.fillRect(effect.x + 2, effect.y - 6, 3, 6);
      ctx.globalAlpha = 1;
      continue;
    }
    if (effect.type === "firetrail") {
      drawFireTrail(effect);
      continue;
    }
    if (effect.type === "meteor") {
      drawMeteorShadow(effect);
      continue;
    }
    if (effect.type === "poison") {
      const fade = clamp(Math.min(effect.life / 0.5, (effect.max - effect.life) / 0.2), 0, 1);
      ctx.globalAlpha = fade * 0.45;
      ctx.fillStyle = "#5fa83a";
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = fade * 0.85;
      ctx.strokeStyle = "#b5e86b";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius - 2, -state.anim * 0.5, -state.anim * 0.5 + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      const bubbles = Math.round(effect.radius / 10);
      for (let i = 0; i < bubbles; i += 1) {
        const angle = effect.seed + i * 2.4;
        const r = effect.radius * (0.15 + ((i * 53) % 80) / 100);
        const rise = (state.anim * 1.4 + i * 0.37) % 1;
        ctx.fillStyle = i % 3 === 0 ? "#d9f99d" : "#7bd35a";
        const size = 3 + (i % 3) * 2;
        ctx.fillRect(effect.x + Math.cos(angle) * r - size / 2, effect.y + Math.sin(angle) * r - rise * 10 - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      continue;
    }
    if (effect.type === "hazard") {
      const progress = 1 - effect.life / effect.max;
      ctx.fillStyle = `rgba(239, 91, 75, ${0.1 + progress * 0.25})`;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius * (0.3 + progress * 0.7), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(239, 91, 75, ${0.5 + progress * 0.4})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      continue;
    }
    if (effect.type !== "frostfield") continue;
    const fade = clamp(Math.min(effect.life / 0.6, (effect.max - effect.life) / 0.2), 0, 1);
    ctx.globalAlpha = fade * 0.5;
    ctx.fillStyle = "#bfefff";
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = fade * 0.8;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.radius - 2, state.anim * 0.4, state.anim * 0.4 + Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 7; i += 1) {
      const angle = effect.seed + i * 0.9;
      const r = effect.radius * (0.25 + ((i * 37) % 60) / 100);
      ctx.fillRect(effect.x + Math.cos(angle) * r - 2, effect.y + Math.sin(angle) * r - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }
}

/* ---------- drawing: projectiles, pickups, effects ---------- */

function drawProjectiles() {
  for (const p of projectiles) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.owner === "enemy") {
      ctx.rotate(p.spin);
      ctx.fillStyle = "#1a0a18";
      ctx.fillRect(-p.r - 2, -p.r - 2, p.r * 2 + 4, p.r * 2 + 4);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
      ctx.fillRect(-p.r + 2, -p.r + 2, p.r * 0.7, p.r * 0.7);
    } else if (p.kind === "phoenix") {
      ctx.rotate(Math.atan2(p.vy, p.vx));
      const flap = Math.sin(p.spin * 2.5) * 10;
      ctx.fillStyle = "rgba(255, 140, 40, 0.35)";
      ctx.fillRect(-22, -16, 40, 32);
      ctx.fillStyle = "#ffd166";
      ctx.beginPath();
      ctx.moveTo(-2, -4);
      ctx.lineTo(-14, -20 - flap);
      ctx.lineTo(6, -5);
      ctx.moveTo(-2, 4);
      ctx.lineTo(-14, 20 + flap);
      ctx.lineTo(6, 5);
      ctx.fill();
      ctx.fillStyle = "#ff742e";
      ctx.fillRect(-12, -6, 22, 12);
      ctx.fillRect(8, -5, 9, 9);
      ctx.fillStyle = "#ef5b4b";
      ctx.fillRect(-24, -4, 12, 8);
      ctx.fillStyle = "#1a120c";
      ctx.fillRect(12, -3, 3, 3);
      ctx.fillStyle = "#ffd166";
      ctx.fillRect(16, -1, 5, 3);
    } else if (p.kind === "icicle") {
      ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(p.r * 1.8, 0);
      ctx.lineTo(-p.r, -p.r * 0.7);
      ctx.lineTo(-p.r, p.r * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#7dd3fc";
      ctx.fillRect(-p.r, -2, p.r * 1.6, 4);
    } else if (p.kind === "fireball") {
      ctx.rotate(p.spin * 0.5);
      ctx.fillStyle = "rgba(255, 140, 40, 0.35)";
      ctx.fillRect(-p.r - 6, -p.r - 6, p.r * 2 + 12, p.r * 2 + 12);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
      ctx.fillStyle = "#ffd166";
      ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r);
    } else {
      ctx.rotate(p.spin);
      ctx.fillStyle = p.kind === "staff" ? "rgba(255, 242, 163, 0.35)" : "rgba(255, 255, 255, 0.25)";
      ctx.fillRect(-p.r - 4, -p.r - 4, p.r * 2 + 8, p.r * 2 + 8);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.fillRect(-p.r + 2, -p.r + 2, 4, 4);
    }
    ctx.restore();
  }
}

function drawPickups() {
  for (const item of pickups) {
    const bob = Math.sin(state.anim * 6 + item.x * 0.1) * 2;
    const x = item.x;
    const y = item.y + bob;
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    ctx.fillRect(x - 6, item.y + 7, 12, 3);
    if (item.kind === "coin") {
      const squeeze = Math.abs(Math.cos(state.anim * 5 + item.x));
      const w = Math.max(2, 12 * squeeze);
      ctx.fillStyle = "#8a5f12";
      ctx.fillRect(x - w / 2 - 1, y - 7, w + 2, 14);
      ctx.fillStyle = "#f6c85f";
      ctx.fillRect(x - w / 2, y - 6, w, 12);
      ctx.fillStyle = "#fff3b0";
      ctx.fillRect(x - w / 4, y - 4, Math.max(1, w / 4), 4);
    } else if (item.kind === "gem") {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = "#1a3f7a";
      ctx.fillRect(-8, -8, 16, 16);
      ctx.fillStyle = "#55e0ff";
      ctx.fillRect(-6, -6, 12, 12);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-4, -4, 4, 4);
      ctx.restore();
    } else if (item.kind === "heart") {
      drawHeart(ctx, x, y, 3, "#ef5b4b");
    } else if (item.kind === "star") {
      drawStar(ctx, x, y, 9, "#6bc4ff");
    }
  }
}

function drawHeart(g, x, y, px, color) {
  const shape = ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000"];
  const left = x - px * 3.5;
  const top = y - px * 3;
  for (const pass of [0, 1]) {
    shape.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx += 1) {
        if (row[rx] !== "1") continue;
        if (pass === 0) {
          g.fillStyle = "#3a1010";
          g.fillRect(left + rx * px - 1, top + ry * px - 1, px + 2, px + 2);
        } else {
          g.fillStyle = ry === 1 && rx === 1 ? "#ffd0d0" : color;
          g.fillRect(left + rx * px, top + ry * px, px, px);
        }
      }
    });
  }
}

function drawStar(g, x, y, r, color) {
  g.fillStyle = "#123a5a";
  g.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? r + 2 : r * 0.5 + 1;
    g.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  g.closePath();
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? r : r * 0.45;
    g.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  g.closePath();
  g.fill();
}

function drawFireTrail(f) {
  const fade = clamp(f.life / 0.6, 0, 1);
  ctx.globalAlpha = fade * 0.35;
  ctx.fillStyle = "#ff742e";
  ctx.beginPath();
  ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = fade;
  for (let i = 0; i < 4; i += 1) {
    const flick = Math.sin(state.anim * 14 + f.seed + i * 2) * 4;
    const fx = f.x - 12 + i * 8;
    ctx.fillStyle = i % 2 === 0 ? "#ff742e" : "#ffd166";
    ctx.fillRect(fx - 3, f.y - 8 - flick, 6, 10 + flick);
  }
  ctx.globalAlpha = 1;
}

function drawMeteorShadow(m) {
  const progress = 1 - m.life / m.max;
  ctx.fillStyle = `rgba(0, 0, 0, ${0.15 + progress * 0.3})`;
  ctx.beginPath();
  ctx.ellipse(m.x, m.y, m.radius * (0.3 + progress * 0.7), m.radius * (0.2 + progress * 0.45), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(239, 91, 75, ${0.5 + Math.sin(state.anim * 30) * 0.3})`;
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawMeteorRock(m) {
  const fall = m.life / m.max;
  const x = m.x + fall * 160;
  const y = m.y - fall * 460;
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "#ffd166";
  ctx.fillRect(x + 8, y - 30, 14, 14);
  ctx.fillStyle = "#ff742e";
  ctx.fillRect(x + 2, y - 20, 18, 18);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ff5a3d";
  ctx.fillRect(x - 22, y - 22, 44, 44);
  ctx.fillStyle = "#5a3b1c";
  ctx.fillRect(x - 18, y - 18, 36, 36);
  ctx.fillStyle = "#8a5f12";
  ctx.fillRect(x - 12, y - 12, 12, 12);
  ctx.fillRect(x + 4, y + 2, 8, 8);
  if (Math.random() < 0.8) particles.push({ x: x + rand(-14, 14), y: y + rand(-14, 14), vx: rand(20, 80), vy: rand(-120, -60), life: 0.4, max: 0.4, size: rand(5, 9), color: pick(["#ff742e", "#ffd166", "#ef5b4b"]), gravity: 0, drag: 0.9, spin: 0, angle: 0 });
}

function drawBlizzard(b) {
  const fade = clamp(Math.min(b.life / 0.5, (b.max - b.life) / 0.3), 0, 1);
  ctx.globalAlpha = fade * 0.18;
  ctx.fillStyle = "#d7f4ff";
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = fade * 0.9;
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 26; i += 1) {
    const ring = 0.3 + ((i * 37) % 70) / 100;
    const angle = state.anim * (2.5 - ring) + i * 2.4;
    const size = i % 3 === 0 ? 5 : 3;
    ctx.fillRect(b.x + Math.cos(angle) * b.radius * ring - size / 2, b.y + Math.sin(angle) * b.radius * ring - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
}

// Blocky drawings for the five new pets. u is one "pixel" of the sprite.
function drawNewPet(g, kind, x, y, face, hop, t, self = {}) {
  const u = 3;
  const bob = Math.abs(Math.sin(hop)) * 3;
  const box = (color, bx, by, w, h) => {
    g.fillStyle = color;
    g.fillRect(x + (face < 0 ? -bx - w : bx) * u, y - bob + by * u, w * u, h * u);
  };
  g.fillStyle = "rgba(0, 0, 0, 0.25)";
  g.fillRect(x - 9, y + 12, 18, 4);
  if (kind === "owl") {
    const flap = Math.sin(t * 14) > 0 ? -1 : 0;
    box("#3a2516", -4, -5, 8, 9);
    box("#8a6a43", -3, -5, 6, 8);
    box("#e8d2a6", -2, -1, 4, 4);
    box("#8a6a43", -4, -7, 2, 2);
    box("#8a6a43", 2, -7, 2, 2);
    box("#ffffff", -3, -4, 3, 3);
    box("#ffffff", 0, -4, 3, 3);
    box("#120c08", -2, -3, 1, 1);
    box("#120c08", 1, -3, 1, 1);
    box("#f6a03a", -1, -1, 2, 1);
    box("#6b4f30", -5, -2 + flap, 1, 4);
    box("#6b4f30", 4, -2 + flap, 1, 4);
  } else if (kind === "hatchling") {
    box("#1a0a08", -4, -4, 8, 8);
    box("#ef5b4b", -3, -4, 6, 7);
    box("#ffd166", -2, 0, 4, 3);
    box("#ef5b4b", 3, -6, 3, 3);
    box("#ffffff", 4, -6, 1, 1);
    box("#120c08", 5, -6, 1, 1);
    box("#ffd166", 3, -7, 1, 1);
    box("#b33a2e", -5, -3 + (Math.sin(t * 10) > 0 ? -1 : 0), 2, 3);
    box("#ef5b4b", -5, 1, 2, 1);
    box("#ffb347", 6, -5, 1, 1);
  } else if (kind === "turtle") {
    const ready = !(self.blockCd > 0);
    box("#2f5e2f", -5, -4, 10, 6);
    box(ready ? "#4ade80" : "#3a8a50", -4, -5, 8, 5);
    box("#a7f3b0", -2, -4, 2, 2);
    box("#a7f3b0", 1, -3, 2, 2);
    box("#86c06c", 5, -2, 3, 3);
    box("#120c08", 7, -2, 1, 1);
    box("#86c06c", -4, 1, 2, 2);
    box("#86c06c", 2, 1, 2, 2);
    if (ready) {
      g.strokeStyle = "rgba(74, 222, 128, 0.5)";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y - bob - 4, 18, 0, Math.PI * 2);
      g.stroke();
    }
  } else if (kind === "slime") {
    const squash = Math.sin(t * 8) * 0.5;
    g.fillStyle = "rgba(125, 211, 252, 0.85)";
    g.fillRect(x - (5 + squash) * u, y - (7 - squash) * u, (10 + squash * 2) * u, (8 - squash) * u);
    g.fillStyle = "rgba(255, 255, 255, 0.6)";
    g.fillRect(x - 4 * u, y - 6 * u, 2 * u, 2 * u);
    box("#0e2a3a", -2, -4, 1, 2);
    box("#0e2a3a", 1, -4, 1, 2);
    box("#ff9ff3", -1, -9 - Math.floor((t * 2) % 2), 2, 2);
  } else if (kind === "bat") {
    const flap = Math.sin(t * 18) > 0 ? 1 : -1;
    box("#2a1b3d", -3, -6, 6, 6);
    box("#c084fc", -2, -6, 4, 5);
    box("#f5d0fe", -1, -5, 2, 2);
    box("#ff9ff3", -2, -3, 1, 1);
    box("#ff9ff3", 1, -3, 1, 1);
    box("#7c3aed", -7, -6 + flap, 4, 2);
    box("#7c3aed", 3, -6 + flap, 4, 2);
    box("#c084fc", -8, -5 + flap * 2, 2, 2);
    box("#c084fc", 6, -5 + flap * 2, 2, 2);
  }
}

function drawPetBreath(effect) {
  const k = clamp(effect.life / effect.max, 0, 1);
  ctx.save();
  ctx.translate(effect.x, effect.y);
  ctx.rotate(effect.angle);
  ctx.globalAlpha = k;
  ctx.fillStyle = "rgba(255, 116, 46, 0.55)";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, effect.reach * (1.1 - k * 0.3), -0.5, 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255, 209, 102, 0.7)";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, effect.reach * 0.55, -0.3, 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawEffects() {
  for (const effect of effects) {
    if (effect.type === "healbeam") {
      ctx.globalAlpha = effect.life / effect.max;
      ctx.strokeStyle = "#7dffb0";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(effect.x, effect.y);
      ctx.lineTo(effect.tx, effect.ty);
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
      continue;
    }
    if (effect.type === "petbreath") {
      drawPetBreath(effect);
      continue;
    }
    if (effect.type === "slash") {
      drawSlash(effect);
      continue;
    }
    if (effect.type === "meteor") {
      drawMeteorRock(effect);
      continue;
    }
    if (effect.type === "blizzard") {
      drawBlizzard(effect);
      continue;
    }
    if (effect.type === "hazard") {
      drawFallingThing(effect);
      continue;
    }
    if (effect.type === "flask") {
      const k = 1 - effect.life / effect.max;
      const fx = effect.sx + (effect.x - effect.sx) * k;
      const fy = effect.sy + (effect.y - effect.sy) * k - Math.sin(k * Math.PI) * 90;
      ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
      ctx.fillRect(effect.sx + (effect.x - effect.sx) * k - 6, effect.sy + (effect.y - effect.sy) * k + 10, 12, 4);
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(k * 9);
      drawSpellIcon("poison", 0, 0, "#7bd35a", 0.75);
      ctx.restore();
      continue;
    }
    if (effect.type === "orb") {
      const pulse = 1 + Math.sin(state.anim * 20) * 0.12;
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#ffe45c";
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius * 1.8 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#ffe45c";
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(effect.x - effect.radius * 0.4, effect.y - effect.radius * 0.4, effect.radius * 0.5, effect.radius * 0.5);
      if (Math.random() < 0.5) burst(effect.x + rand(-10, 10), effect.y + rand(-10, 10), ["#ffe45c", "#ffffff"], 1, 90);
      continue;
    }
    const progress = 1 - effect.life / effect.max;
    if (effect.type === "ring") {
      ctx.globalAlpha = Math.max(0, 1 - progress);
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = effect.width;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, Math.max(1, effect.radius * progress), 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    } else if (effect.type === "bolt") {
      ctx.globalAlpha = Math.max(0, 1 - progress);
      for (const [color, width] of [["#ffe45c", 8], ["#ffffff", 3]]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        for (let i = 0; i < effect.points.length - 1; i += 1) {
          const a = effect.points[i];
          const b = effect.points[i + 1];
          ctx.moveTo(a.x, a.y);
          for (let s = 1; s <= 5; s += 1) {
            const t = s / 5;
            const jitter = s === 5 ? 0 : 12;
            ctx.lineTo(a.x + (b.x - a.x) * t + rand(-jitter, jitter), a.y + (b.y - a.y) * t + rand(-jitter, jitter));
          }
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}

// Whatever the big boss drops from the ceiling: bones, lava rocks, icicles,
// moon shards or crystals, all in the boss's own colour.
function drawFallingThing(effect) {
  const left = effect.life / effect.max;
  if (left > 0.6) return;
  const height = (left / 0.6) * 340;
  const x = effect.x;
  const y = effect.y - height;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(effect.row === 2 ? 0 : height * 0.02);
  if (effect.row === 2) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-6, -22, 12, 22);
    ctx.fillStyle = effect.color;
    ctx.fillRect(-4, 0, 8, 8);
    ctx.fillRect(-2, 8, 4, 6);
  } else {
    ctx.fillStyle = "#120c08";
    ctx.fillRect(-12, -12, 24, 24);
    ctx.fillStyle = effect.color;
    ctx.fillRect(-10, -10, 20, 20);
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.fillRect(-10, -10, 20, 5);
  }
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    if (p.heart) {
      drawHeart(ctx, p.x, p.y, 2, p.color);
      continue;
    }
    ctx.fillStyle = p.color;
    if (p.spin) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    } else {
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }
  ctx.globalAlpha = 1;
}

// Damage numbers repeat a lot, so each one is drawn once into a small image and reused.
const floatTextCache = new Map();

function floatTextImage(text, size, color) {
  const key = `${text}|${size}|${color}`;
  let img = floatTextCache.get(key);
  if (img) return img;
  if (floatTextCache.size > 300) floatTextCache.clear();
  const font = `700 ${size}px ${BODY_FONT}`;
  const line = Math.max(3, size / 5);
  const pad = Math.ceil(line);
  const canvasImg = document.createElement("canvas");
  const g = canvasImg.getContext("2d");
  g.font = font;
  canvasImg.width = Math.ceil(g.measureText(text).width + pad * 2);
  canvasImg.height = Math.ceil(size * 1.5 + pad * 2);
  g.font = font;
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.lineJoin = "round";
  g.lineWidth = line;
  g.strokeStyle = "#120c08";
  const baseline = Math.ceil(size * 1.1) + pad;
  g.strokeText(text, canvasImg.width / 2, baseline);
  g.fillStyle = color;
  g.fillText(text, canvasImg.width / 2, baseline);
  img = { canvas: canvasImg, ox: canvasImg.width / 2, oy: baseline };
  floatTextCache.set(key, img);
  return img;
}

function drawFloatTexts() {
  for (const t of floatTexts) {
    ctx.globalAlpha = clamp(t.life / 0.4, 0, 1);
    const img = floatTextImage(t.text, t.size, t.color);
    ctx.drawImage(img.canvas, Math.round(t.x - img.ox), Math.round(t.y - img.oy));
  }
  ctx.globalAlpha = 1;
}

/* ---------- drawing: text and UI ---------- */

function outlinedText(text, x, y, options = {}) {
  const { size = 16, color = "#ffffff", align = "left", font = BODY_FONT, weight = 700, outline = "#120c08", baseline = "alphabetic" } = options;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (outline) {
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, size / 5);
    ctx.strokeStyle = outline;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function wrapLines(text, maxWidth, font) {
  ctx.font = font;
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawPanel(x, y, w, h, fill = "rgba(28, 21, 16, 0.92)") {
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fillRect(x + 6, y + 8, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#5b412d";
  ctx.lineWidth = 4;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
  ctx.fillRect(x + 4, y + 4, w - 8, 4);
}

function isHover(x, y, w, h) {
  return mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
}

function drawButton(label, x, y, w, h, action, options = {}) {
  const hover = isHover(x, y, w, h);
  const primary = Boolean(options.primary);
  const disabled = Boolean(options.disabled);
  ctx.fillStyle = "#0d0a08";
  ctx.fillRect(x, y + 5, w, h);
  ctx.fillStyle = disabled ? "#3a2e25" : primary ? (hover ? "#ffd97a" : "#f6c85f") : hover ? "#4a3829" : "#30251d";
  ctx.fillRect(x, y + (hover && !disabled ? 2 : 0), w, h);
  ctx.strokeStyle = primary ? "#8a5f12" : "#5b412d";
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y + 1.5 + (hover && !disabled ? 2 : 0), w - 3, h - 3);
  outlinedText(label, x + w / 2, y + h / 2 + (hover && !disabled ? 2 : 0), {
    size: options.size || 20,
    color: disabled ? "#8a7a68" : primary ? "#241c17" : "#f8ead2",
    align: "center",
    baseline: "middle",
    font: DISPLAY_FONT,
    outline: primary ? null : "#120c08"
  });
  if (!disabled) hitRegions.push({ x, y, w, h, action });
}

function drawHud(room) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.fillRect(12, 12, 270, 70);
  outlinedText(room.final ? "Dragon's Lair" : room.arena ? "Big Boss Arena" : `Room ${room.index + 1} / ${ROOM_COUNT}`, 26, 40, { size: 20, font: DISPLAY_FONT, color: room.arena ? "#c084fc" : "#f8ead2" });
  outlinedText(room.biome.name, 26, 64, { size: 14, color: "#f6c85f" });
  const bossAlive = room.boss && room.boss.hp > 0;
  ctx.font = `700 14px ${BODY_FONT}`;
  const statusX = Math.max(146, 26 + ctx.measureText(room.biome.name).width + 14);
  outlinedText(bossAlive ? "Boss: awake" : "Boss: defeated", statusX, 64, { size: 14, color: bossAlive ? "#ff8b7d" : "#9ee49c" });

  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.fillRect(WIDTH - 152, 12, 140, 40);
  ctx.fillStyle = "#8a5f12";
  ctx.fillRect(WIDTH - 140, 22, 20, 20);
  ctx.fillStyle = "#f6c85f";
  ctx.fillRect(WIDTH - 138, 24, 16, 16);
  ctx.fillStyle = "#fff3b0";
  ctx.fillRect(WIDTH - 134, 27, 4, 7);
  outlinedText(String(state.coins), WIDTH - 110, 40, { size: 20, font: DISPLAY_FONT, color: "#f6c85f" });

  if (isRoomCleared(room) && !room.final) {
    ctx.fillStyle = "rgba(49, 91, 55, 0.8)";
    ctx.fillRect(WIDTH - 152, 58, 140, 30);
    outlinedText("Room Cleared", WIDTH - 82, 79, { size: 15, align: "center", color: "#ffffff" });
  }

  if (bossAlive) drawBossBar(room.boss);
  if (state.twoPlayer) {
    drawHotbar(players[0], 16, ["1", "2", "3", "4", "5", "LShift", "Q"], 44, true);
    drawHotbar(players[1], WIDTH - 16 - (7 * 44 + 6 * 6), ["7", "8", "9", "0", "-", "Enter", "/"], 44, true);
  } else {
    drawHotbar(player, null, ["1", "2", "3", "4", "5", "Shift", "Q"], 54, false);
  }

  if (state.messageTimer > 0 && state.message && state.mode === "playing") {
    ctx.font = `700 16px ${BODY_FONT}`;
    const w = Math.min(WIDTH - 80, ctx.measureText(state.message).width + 40);
    ctx.globalAlpha = clamp(state.messageTimer / 0.3, 0, 1);
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    const ty = state.twoPlayer ? HEIGHT - 178 : HEIGHT - 134;
    ctx.fillRect(WIDTH / 2 - w / 2, ty, w, 36);
    outlinedText(state.message, WIDTH / 2, ty + 24, { size: 16, align: "center" });
    ctx.globalAlpha = 1;
  }

  if (room.index === 0 && state.portalOpen && !state.won && Math.floor(state.anim * 2) % 2 === 0) {
    outlinedText("The golden portal is open in the middle of this room!", WIDTH / 2, 120, { size: 16, align: "center", color: "#f6c85f" });
  }
}

function drawBossBar(boss) {
  const big = boss.isBig;
  const w = big ? 400 : 360;
  const x = WIDTH / 2 - w / 2;
  const y = 22;
  const label = boss.desperate ? `LAST STAND: ${boss.name}` : big ? `${boss.phase2 ? "PHASE 2" : "BIG BOSS"}: ${boss.name}` : boss.name;
  outlinedText(label, WIDTH / 2, y + 2, { size: 17, align: "center", font: DISPLAY_FONT, color: boss.enraged ? "#ff8b7d" : big ? "#f6c85f" : "#f8ead2" });
  if (big) {
    ctx.fillStyle = "#f6c85f";
    ctx.fillRect(x - 6, y + 5, w + 12, 24);
  }
  ctx.fillStyle = "#120c08";
  ctx.fillRect(x - 3, y + 8, w + 6, 18);
  ctx.fillStyle = "#3a1712";
  ctx.fillRect(x, y + 11, w, 12);
  ctx.fillStyle = boss.enraged ? "#ff5a3d" : "#d94d3f";
  ctx.fillRect(x, y + 11, w * Math.max(0, boss.hp / boss.maxHp), 12);
  ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  ctx.fillRect(x, y + 11, w * Math.max(0, boss.hp / boss.maxHp), 3);
  if (!big) {
    ctx.fillStyle = "#120c08";
    ctx.fillRect(x + w / 2 - 1, y + 11, 2, 12);
  }
}

// One row of spell slots. In two-player mode each wizard gets their own row
// in a bottom corner, with their health and mana above it.
function drawHotbar(p, left, labels, slot, withBars) {
  const gap = withBars ? 6 : 8;
  const slots = [...spells.map((spell, i) => ({ spell, key: labels[i] })), { dash: true, key: labels[spells.length] }, { flask: true, key: labels[spells.length + 1] }];
  const total = slots.length * slot + (slots.length - 1) * gap;
  let x = left === null ? WIDTH / 2 - total / 2 : left;
  const y = HEIGHT - slot - 18;

  if (withBars) {
    const robe = robeOf(p);
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(x - 4, y - 42, total + 8, 38);
    outlinedText(`P${p.index + 1}`, x + 2, y - 16, { size: 18, font: DISPLAY_FONT, color: shade(robe.robe, 0.45) });
    const bx = x + 32;
    const bw = total - 34;
    ctx.fillStyle = "#120c08";
    ctx.fillRect(bx, y - 38, bw, 11);
    ctx.fillRect(bx, y - 24, bw, 8);
    ctx.fillRect(bx, y - 14, bw, 7);
    ctx.fillStyle = "#ef5b4b";
    ctx.fillRect(bx + 1, y - 37, (bw - 2) * clamp(p.hp / stats.maxHp, 0, 1), 9);
    ctx.fillStyle = "#6bc4ff";
    ctx.fillRect(bx + 1, y - 23, (bw - 2) * clamp(p.mana / stats.maxMana, 0, 1), 6);
    ctx.fillStyle = staminaColor(p);
    ctx.fillRect(bx + 1, y - 13, (bw - 2) * clamp(p.stamina / stats.maxStamina, 0, 1), 5);
    if (p.hp <= 0) outlinedText("Bonked!", bx + bw / 2, y - 26, { size: 12, align: "center", color: "#ff9ff3" });
  } else {
    // The stamina bar sits right above the spell slots.
    ctx.fillStyle = "#120c08";
    ctx.fillRect(x, y - 14, total, 9);
    ctx.fillStyle = staminaColor(p);
    ctx.fillRect(x + 1, y - 13, (total - 2) * clamp(p.stamina / stats.maxStamina, 0, 1), 7);
  }

  for (const item of slots) {
    ctx.fillStyle = "rgba(16, 13, 11, 0.8)";
    ctx.fillRect(x, y, slot, slot);
    let ready = true;
    let locked = false;
    let fraction = 0;
    let color = dashColor();
    let id = stats.dash === "normal" ? "dash" : `dash-${stats.dash}`;
    const evolved = item.flask ? false : item.dash ? stats.dash !== "normal" : Boolean(stats.evo[item.spell.id]);
    const mega = item.flask ? false : item.dash ? stats.dashMega : Boolean(stats.mega[item.spell.id]);
    if (item.flask) {
      ctx.fillStyle = "rgba(16, 13, 11, 0.8)";
      drawSpellIcon("estus", x + slot / 2, y + slot / 2 + 2, p.flasks > 0 ? "#ef5b4b" : "#5b4a3c", slot / 54);
      ctx.strokeStyle = p.flasks > 0 ? "#ef5b4b" : "#5b412d";
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1.5, y + 1.5, slot - 3, slot - 3);
      outlinedText(item.key, x + 5, y + 15, { size: item.key.length > 1 ? 10 : 13, color: "#f8ead2" });
      outlinedText(String(p.flasks), x + slot - 5, y + slot - 5, { size: 15, align: "right", font: DISPLAY_FONT, color: p.flasks > 0 ? "#ffffff" : "#8a6f5a" });
      x += slot + gap;
      continue;
    }
    if (item.dash) {
      fraction = p.dashCd / stats.dashCooldown;
      ready = p.dashCd <= 0 && p.stamina >= DASH_STAMINA;
    } else {
      const spell = item.spell;
      color = spellLook(spell).color;
      id = stats.evo[spell.id] || spell.id;
      locked = state.bossesDefeated < spell.unlockAt;
      fraction = p.cooldowns[spell.id] / spellCooldown(spell);
      ready = !locked && fraction <= 0 && p.mana >= spellCost(spell);
    }

    drawSpellIcon(id, x + slot / 2, y + slot / 2 + 2, locked ? "#5b4a3c" : color, slot / 54);
    if (fraction > 0) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(x, y, slot, slot * fraction);
    }
    if (!item.dash && !locked && p.mana < spellCost(item.spell)) {
      ctx.fillStyle = "rgba(30, 60, 120, 0.55)";
      ctx.fillRect(x, y, slot, slot);
    }
    if (locked) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(x, y, slot, slot);
      ctx.fillStyle = "#c5a988";
      ctx.fillRect(x + slot / 2 - 7, y + slot / 2 - 2, 14, 11);
      ctx.strokeStyle = "#c5a988";
      ctx.lineWidth = 3;
      ctx.strokeRect(x + slot / 2 - 4, y + slot / 2 - 9, 8, 8);
    }
    ctx.strokeStyle = ready ? color : "#5b412d";
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, slot - 3, slot - 3);
    if (evolved) drawStar(ctx, x + slot - 9, y + 9, 6, "#f6c85f");
    if (mega) drawStar(ctx, x + slot - 9, y + 22, 6, "#ff9ff3");
    outlinedText(item.key, x + 5, y + 15, { size: item.key.length > 1 ? 10 : 13, color: "#f8ead2" });
    x += slot + gap;
  }
}

function staminaColor(p) {
  return p.stamina < DASH_STAMINA ? "#e7a33a" : "#7bd35a";
}

function drawSpellIcon(id, x, y, color, scale = 1) {
  if (scale !== 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    drawSpellIcon(id, 0, 0, color, 1);
    ctx.restore();
    return;
  }
  if (id === "estus") {
    ctx.fillStyle = "#1a0a08";
    ctx.fillRect(x - 11, y - 6, 22, 20);
    ctx.fillRect(x - 5, y - 16, 10, 12);
    ctx.fillStyle = color;
    ctx.fillRect(x - 9, y - 4, 18, 16);
    ctx.fillStyle = "#c5a988";
    ctx.fillRect(x - 3, y - 14, 6, 10);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x - 6, y - 1, 4, 5);
    return;
  }
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  if (id === "fireball") {
    ctx.fillRect(x - 9, y - 6, 18, 16);
    ctx.fillRect(x - 5, y - 13, 8, 8);
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(x - 4, y - 1, 8, 8);
  } else if (id === "frost") {
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 0; i < 3; i += 1) {
      const angle = (i * Math.PI) / 3;
      ctx.moveTo(x - Math.cos(angle) * 13, y - Math.sin(angle) * 13);
      ctx.lineTo(x + Math.cos(angle) * 13, y + Math.sin(angle) * 13);
    }
    ctx.stroke();
  } else if (id === "lightning") {
    ctx.beginPath();
    ctx.moveTo(x + 3, y - 15);
    ctx.lineTo(x - 9, y + 2);
    ctx.lineTo(x - 1, y + 2);
    ctx.lineTo(x - 4, y + 15);
    ctx.lineTo(x + 9, y - 3);
    ctx.lineTo(x + 1, y - 3);
    ctx.closePath();
    ctx.fill();
  } else if (id === "shield") {
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.fillRect(x - 6, y - 7, 4, 4);
  } else if (id === "meteor") {
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(x - 14, y - 15, 6, 6);
    ctx.fillRect(x - 9, y - 10, 6, 6);
    ctx.fillStyle = color;
    ctx.fillRect(x - 6, y - 6, 8, 8);
    ctx.fillRect(x - 4, y - 4, 20, 20);
    ctx.fillStyle = "#8a4a1c";
    ctx.fillRect(x - 2, y - 2, 16, 16);
    ctx.fillStyle = "#c08850";
    ctx.fillRect(x + 1, y + 1, 6, 6);
    ctx.fillStyle = color;
    ctx.fillRect(x + 10, y + 3, 4, 4);
  } else if (id === "blizzard") {
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 3; i += 1) {
      const angle = (i * Math.PI) / 3;
      ctx.moveTo(x - Math.cos(angle) * 9, y - Math.sin(angle) * 9);
      ctx.lineTo(x + Math.cos(angle) * 9, y + Math.sin(angle) * 9);
    }
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    for (const [dx, dy] of [[-13, -12], [12, -9], [-11, 11], [13, 12], [0, -15]]) ctx.fillRect(x + dx - 2, y + dy - 2, 4, 4);
  } else if (id === "storm") {
    ctx.fillStyle = "#8d8a82";
    ctx.fillRect(x - 14, y - 15, 28, 8);
    ctx.fillRect(x - 9, y - 19, 14, 5);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + 2, y - 7);
    ctx.lineTo(x - 7, y + 4);
    ctx.lineTo(x - 1, y + 4);
    ctx.lineTo(x - 4, y + 15);
    ctx.lineTo(x + 7, y + 1);
    ctx.lineTo(x + 1, y + 1);
    ctx.closePath();
    ctx.fill();
  } else if (id === "phoenix") {
    const flap = Math.sin(state.anim * 10) * 4;
    ctx.fillRect(x - 5, y - 4, 12, 9);
    ctx.fillRect(x + 6, y - 7, 7, 6);
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.moveTo(x - 2, y - 2);
    ctx.lineTo(x - 15, y - 12 - flap);
    ctx.lineTo(x - 7, y + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ef5b4b";
    ctx.fillRect(x - 15, y + 1, 10, 4);
    ctx.fillRect(x - 18, y + 5, 7, 3);
    ctx.fillStyle = "#1a120c";
    ctx.fillRect(x + 9, y - 5, 2, 2);
  } else if (id === "glacier") {
    for (let i = 0; i < 6; i += 1) {
      const angle = (i * Math.PI) / 3;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = i % 2 ? "#ffffff" : color;
      ctx.beginPath();
      ctx.moveTo(4, -3);
      ctx.lineTo(16, 0);
      ctx.lineTo(4, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x - 3, y - 3, 6, 6);
  } else if (id === "orb") {
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x - 4, y - 4, 4, 4);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const a of [0.4, 2.3, 4.2]) {
      ctx.moveTo(x + Math.cos(a) * 11, y + Math.sin(a) * 11);
      ctx.lineTo(x + Math.cos(a + 0.3) * 15, y + Math.sin(a + 0.3) * 15);
      ctx.lineTo(x + Math.cos(a) * 18, y + Math.sin(a) * 18);
    }
    ctx.stroke();
  } else if (id === "heal") {
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillRect(x - 2, y - 8, 4, 16);
    ctx.fillRect(x - 8, y - 2, 16, 4);
  } else if (id === "poison" || id === "cluster") {
    const flask = (fx, fy, s) => {
      ctx.fillStyle = "#e8e2cf";
      ctx.fillRect(fx - 2 * s, fy - 11 * s, 4 * s, 3 * s);
      ctx.fillStyle = "#cfe9f2";
      ctx.fillRect(fx - 3 * s, fy - 8 * s, 6 * s, 4 * s);
      ctx.fillRect(fx - 7 * s, fy - 4 * s, 14 * s, 12 * s);
      ctx.fillStyle = color;
      ctx.fillRect(fx - 6 * s, fy, 12 * s, 7 * s);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(fx - 4 * s, fy + 2 * s, 2 * s, 2 * s);
    };
    if (id === "poison") flask(x, y + 2, 1.15);
    else {
      flask(x - 8, y + 6, 0.7);
      flask(x + 8, y + 6, 0.7);
      flask(x, y - 4, 0.7);
    }
  } else if (id === "swamp") {
    ctx.fillRect(x - 15, y + 2, 30, 10);
    ctx.fillRect(x - 11, y - 1, 22, 4);
    ctx.fillStyle = "#3f6b2a";
    ctx.fillRect(x - 9, y + 5, 6, 3);
    ctx.fillRect(x + 4, y + 7, 7, 3);
    ctx.fillStyle = "#d9f99d";
    ctx.fillRect(x - 6, y - 8, 5, 5);
    ctx.fillRect(x + 4, y - 13, 4, 4);
    ctx.fillRect(x + 1, y - 5, 3, 3);
  } else if (id === "fortress") {
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ["#ef5b4b", "#ffd166", "#55aaff"].forEach((c, i) => {
      const angle = (i * Math.PI * 2) / 3 - Math.PI / 2;
      ctx.fillStyle = c;
      ctx.fillRect(x + Math.cos(angle) * 14 - 3, y + Math.sin(angle) * 14 - 3, 6, 6);
    });
  } else {
    // Dash, in its plain or evolved style.
    ctx.fillRect(x - 12, y - 3, 10, 6);
    ctx.fillRect(x - 2, y - 6, 14, 12);
    ctx.globalAlpha = 0.5;
    ctx.fillRect(x - 20, y - 2, 6, 4);
    ctx.globalAlpha = 1;
    if (id === "dash-fire") {
      ctx.fillStyle = "#ffd166";
      ctx.fillRect(x - 18, y - 9, 5, 5);
      ctx.fillRect(x - 10, y + 6, 5, 5);
      ctx.fillRect(x + 2, y - 2, 6, 4);
    } else if (id === "dash-frost") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x - 18, y - 9, 4, 4);
      ctx.fillRect(x - 9, y + 7, 4, 4);
      ctx.fillRect(x + 3, y - 2, 5, 4);
    } else if (id === "dash-thunder") {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(x + 4, y - 14);
      ctx.lineTo(x - 2, y - 1);
      ctx.lineTo(x + 3, y - 1);
      ctx.lineTo(x - 1, y + 13);
      ctx.lineTo(x + 8, y - 4);
      ctx.lineTo(x + 3, y - 4);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawUpgradeIcon(icon, x, y, color) {
  if (icon.startsWith("spell:")) {
    drawSpellIcon(icon.slice(6), x, y, color, 2);
    return;
  }
  if (icon.startsWith("pet:")) {
    drawUpgradeIcon("pet", x, y, color);
    return;
  }
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  switch (icon) {
    case "heart":
      drawHeart(ctx, x, y, 6, color);
      break;
    case "gem":
    case "boom":
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-16, -16, 32, 32);
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.fillRect(-12, -12, 10, 10);
      ctx.restore();
      if (icon === "boom") {
        ctx.fillStyle = "#ffd166";
        ctx.fillRect(x - 6, y - 6, 12, 12);
      }
      break;
    case "staff":
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = "#8b5a2b";
      ctx.fillRect(-4, -8, 8, 36);
      ctx.fillStyle = color;
      ctx.fillRect(-10, -26, 20, 20);
      ctx.restore();
      break;
    case "bolt":
      ctx.beginPath();
      ctx.moveTo(x + 6, y - 26);
      ctx.lineTo(x - 14, y + 4);
      ctx.lineTo(x - 1, y + 4);
      ctx.lineTo(x - 6, y + 26);
      ctx.lineTo(x + 14, y - 6);
      ctx.lineTo(x + 1, y - 6);
      ctx.closePath();
      ctx.fill();
      break;
    case "multi":
      for (const dx of [-14, 0, 14]) {
        ctx.fillRect(x + dx - 5, y - 18 + Math.abs(dx) * 0.6, 10, 10);
        ctx.fillRect(x + dx - 2, y - 6 + Math.abs(dx) * 0.6, 4, 22);
      }
      break;
    case "snow":
      ctx.lineWidth = 6;
      ctx.beginPath();
      for (let i = 0; i < 3; i += 1) {
        const angle = (i * Math.PI) / 3;
        ctx.moveTo(x - Math.cos(angle) * 24, y - Math.sin(angle) * 24);
        ctx.lineTo(x + Math.cos(angle) * 24, y + Math.sin(angle) * 24);
      }
      ctx.stroke();
      break;
    case "boot":
      ctx.fillRect(x - 10, y - 22, 16, 30);
      ctx.fillRect(x - 10, y + 2, 28, 12);
      ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      ctx.fillRect(x - 10, y + 10, 28, 4);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x - 20, y - 12, 8, 3);
      ctx.fillRect(x - 24, y - 4, 10, 3);
      break;
    case "magnet":
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(x, y - 2, 16, Math.PI, 0, true);
      ctx.stroke();
      ctx.fillStyle = "#ef5b4b";
      ctx.fillRect(x - 21, y - 6, 10, 12);
      ctx.fillStyle = "#e8e8e8";
      ctx.fillRect(x + 11, y - 6, 10, 12);
      break;
    case "shield":
      ctx.beginPath();
      ctx.moveTo(x - 20, y - 22);
      ctx.lineTo(x + 20, y - 22);
      ctx.lineTo(x + 20, y + 2);
      ctx.lineTo(x, y + 24);
      ctx.lineTo(x - 20, y + 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.fillRect(x - 3, y - 18, 6, 32);
      break;
    case "clover":
      ctx.fillStyle = "#2f7e43";
      ctx.fillRect(x - 2, y + 4, 4, 24);
      ctx.fillStyle = color;
      for (const [dx, dy] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) {
        ctx.fillRect(x + dx - 8, y + dy - 8, 16, 16);
        ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
        ctx.fillRect(x + dx - 6, y + dy - 6, 5, 5);
        ctx.fillStyle = color;
      }
      break;
    case "book":
      ctx.fillStyle = "#3a1d5c";
      ctx.fillRect(x - 22, y - 18, 44, 36);
      ctx.fillStyle = color;
      ctx.fillRect(x - 20, y - 16, 19, 32);
      ctx.fillRect(x + 1, y - 16, 19, 32);
      ctx.fillStyle = "#f8ead2";
      for (const dy of [-10, -4, 2, 8]) {
        ctx.fillRect(x - 16, y + dy, 12, 2);
        ctx.fillRect(x + 4, y + dy, 12, 2);
      }
      ctx.fillStyle = "#ffe45c";
      ctx.fillRect(x - 3, y - 26, 6, 6);
      ctx.fillRect(x + 12, y - 30, 4, 4);
      ctx.fillRect(x - 16, y - 28, 4, 4);
      break;
    case "clock":
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillRect(x - 2, y - 14, 4, 16);
      ctx.fillRect(x - 2, y - 2, 12, 4);
      ctx.fillRect(x - 4, y - 30, 8, 6);
      break;
    case "fox":
      drawPet(ctx, x, y + 8, 1, 0, state.anim);
      break;
    case "pet": {
      const [, evo, mega] = icon.split(":");
      ctx.save();
      ctx.translate(x, y + 10);
      ctx.scale(2.2, 2.2);
      drawPet(ctx, 0, 0, 1, 0, state.anim, { evo, mega: mega === "mega" });
      ctx.restore();
      break;
    }
    default:
      ctx.fillRect(x - 16, y - 16, 32, 32);
  }
}

function drawBanner() {
  if (!banners.length || state.mode === "title") return;
  const b = banners[0];
  const age = b.max - b.time;
  const alpha = clamp(Math.min(age / 0.25, b.time / 0.4), 0, 1);
  const slide = (1 - clamp(age / 0.25, 0, 1)) * -30;
  ctx.globalAlpha = alpha;
  ctx.font = `700 34px ${DISPLAY_FONT}`;
  const w = Math.max(ctx.measureText(b.title).width, 300) + 80;
  const y = 120 + slide;
  ctx.fillStyle = "rgba(10, 7, 5, 0.75)";
  ctx.fillRect(WIDTH / 2 - w / 2, y, w, 82);
  ctx.fillStyle = b.color;
  ctx.fillRect(WIDTH / 2 - w / 2, y, w, 4);
  ctx.fillRect(WIDTH / 2 - w / 2, y + 78, w, 4);
  outlinedText(b.title, WIDTH / 2, y + 40, { size: 34, align: "center", font: DISPLAY_FONT, color: b.color });
  outlinedText(b.subtitle, WIDTH / 2, y + 66, { size: 16, align: "center", color: "#f8ead2" });
  ctx.globalAlpha = 1;
}

// Letterbox bars, the arena name and a big name card for the boss.
function drawIntro() {
  const intro = state.intro;
  if (!intro) return;
  const big = bigBosses[intro.row];
  const t = intro.time;
  const bars = 76 * clamp(t / 0.4, 0, 1) * clamp((intro.max - t) / 0.3, 0, 1);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, WIDTH, bars);
  ctx.fillRect(0, HEIGHT - bars, WIDTH, bars);
  if (bars > 40) {
    ctx.globalAlpha = clamp((bars - 40) / 30, 0, 1);
    outlinedText(big.biome.name.toUpperCase(), 28, bars - 26, { size: 18, font: DISPLAY_FONT, color: big.accent });
    outlinedText(touch.enabled ? "Tap to skip" : "Space to skip", WIDTH - 28, HEIGHT - bars + 44, { size: 14, align: "right", color: "#c5a988" });
    ctx.globalAlpha = 1;
  }
  const appear = clamp((t - 1.5) / 0.35, 0, 1);
  const card = appear * clamp((intro.max - t) / 0.3, 0, 1);
  if (card > 0) {
    const slide = (1 - appear) * 260;
    const cy = 452;
    ctx.globalAlpha = card;
    ctx.fillStyle = "rgba(10, 7, 5, 0.72)";
    ctx.fillRect(0, cy - 64, WIDTH, 100);
    ctx.fillStyle = big.accent;
    ctx.fillRect(0, cy - 64, WIDTH, 4);
    ctx.fillRect(0, cy + 32, WIDTH, 4);
    outlinedText("BIG BOSS", WIDTH / 2 - slide, cy - 36, { size: 18, align: "center", font: DISPLAY_FONT, color: "#ff8b7d" });
    outlinedText(big.name, WIDTH / 2 + slide, cy + 4, { size: 46, align: "center", font: DISPLAY_FONT, color: "#f6c85f" });
    outlinedText(big.title, WIDTH / 2 - slide, cy + 26, { size: 16, align: "center", color: "#f8ead2" });
    ctx.globalAlpha = 1;
  }
}

function dim(alpha = 0.6) {
  ctx.fillStyle = `rgba(10, 7, 5, ${alpha})`;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawTitle() {
  dim(0.5);
  const wave = Math.sin(state.anim * 2) * 4;
  outlinedText("Block Dungeon", WIDTH / 2, 98 + wave, { size: 68, align: "center", font: DISPLAY_FONT, color: "#f6c85f", outline: "#120c08" });
  outlinedText("Spell Runner", WIDTH / 2, 150 + wave, { size: 44, align: "center", font: DISPLAY_FONT, color: "#f8ead2" });
  outlinedText("Clear 30 rooms. Beat 30 bosses. Find out what waits at the end.", WIDTH / 2, 186, { size: 16, align: "center", color: "#c5a988" });

  const two = state.twoPlayer;
  const spots = two ? [WIDTH / 2 - 160, WIDTH / 2 + 160] : [WIDTH / 2];
  spots.forEach((cx, index) => {
    const look = state.looks[index];
    ctx.save();
    ctx.translate(cx, two ? 296 : 292);
    ctx.scale(two ? 2 : 2.3, two ? 2 : 2.3);
    drawWizard(ctx, 0, 0, look.robe, Math.cos(state.anim + index * 2), 0.2, state.anim + index, false, look.hat);
    ctx.restore();
    if (two) outlinedText(`Player ${index + 1}`, cx, 210, { size: 18, align: "center", font: DISPLAY_FONT, color: shade(robes[look.robe].robe, 0.45) });
    drawPicker(cx, 348, `${robes[look.robe].name} robe`, () => chooseRobe(index, -1), () => chooseRobe(index, 1));
    drawPicker(cx, 386, hats[look.hat].name, () => chooseHat(index, -1), () => chooseHat(index, 1));
  });
  // The pet picker: the chosen pet, big, with arrows to flip through all six.
  const pick = petTypes[state.petPick];
  const petX = two ? WIDTH / 2 : 200;
  ctx.save();
  ctx.translate(petX, two ? 300 : 300);
  ctx.scale(2.4, 2.4);
  if (state.petPick === "pixel") drawPet(ctx, 0, 0, 1, state.anim * 6, state.anim, { evo: null, mega: false });
  else drawNewPet(ctx, state.petPick, 0, 0, 1, state.anim * 6, state.anim);
  ctx.restore();
  drawPicker(petX, two ? 214 : 348, pick.name, () => cyclePet(-1), () => cyclePet(1));
  if (!two) outlinedText(pick.desc, petX, 400, { size: 12, align: "center", color: "#c5a988" });
  if (!two) drawFoeBody(ctx, 8, 760, 282, 40, state.anim, { x: -1, y: 0 });

  drawButton(two ? "Players: 2" : "Players: 1", WIDTH / 2 - 220, 430, 210, 38, togglePlayers, { size: 16 });
  drawButton(`Difficulty: ${difficulty().name}`, WIDTH / 2 + 10, 430, 210, 38, cycleDifficulty, { size: 16 });

  if (state.hasSave) {
    drawButton("Continue", WIDTH / 2 - 230, 486, 220, 52, () => { loadGame() || startNewGame(); }, { primary: true });
    drawButton(state.confirmNew ? "Tap again to restart" : "New adventure", WIDTH / 2 + 10, 486, 220, 52, () => {
      if (state.confirmNew) startNewGame();
      else state.confirmNew = true;
    }, { size: state.confirmNew ? 17 : 20 });
  } else {
    drawButton("Start adventure", WIDTH / 2 - 130, 486, 260, 52, startNewGame, { primary: true });
  }

  outlinedText(`Hats collected: ${state.hatsUnlocked.size} / ${hats.length}  ·  Combos found: ${state.combosFound.size} / ${combos.length}`, WIDTH / 2, 568, { size: 15, align: "center", color: "#f6c85f" });
  let hint = "Enter to start  ·  A/D robe, W/S hat, Q/E pet  ·  2 for two players  ·  M sound";
  if (two) hint = "P1: WASD, Space, LShift, 1-4   ·   P2: arrows, fires by itself, Enter, 7 8 9 0";
  if (touch.enabled) hint = "Tap a button to begin. Use the pad to move; your staff aims by itself.";
  outlinedText(hint, WIDTH / 2, 600, { size: 14, align: "center", color: "#c5a988" });
}

// A "< label >" row for flipping through robes and hats.
function drawPicker(cx, y, label, onLeft, onRight) {
  const w = 230;
  const x = cx - w / 2;
  ctx.fillStyle = "rgba(13, 10, 8, 0.8)";
  ctx.fillRect(x, y, w, 32);
  outlinedText(label, cx, y + 17, { size: 15, align: "center", baseline: "middle", color: "#f8ead2" });
  drawArrowButton(x, y, -1, onLeft);
  drawArrowButton(x + w - 32, y, 1, onRight);
}

function drawArrowButton(x, y, dir, action) {
  const hover = isHover(x, y, 32, 32);
  ctx.fillStyle = hover ? "#ffd97a" : "#f6c85f";
  ctx.fillRect(x, y, 32, 32);
  ctx.fillStyle = "#241c17";
  ctx.beginPath();
  ctx.moveTo(x + 16 + dir * 7, y + 16);
  ctx.lineTo(x + 16 - dir * 5, y + 8);
  ctx.lineTo(x + 16 - dir * 5, y + 24);
  ctx.closePath();
  ctx.fill();
  hitRegions.push({ x, y, w: 32, h: 32, action });
}

function drawUpgradeScreen() {
  dim(0.7);
  const heading = state.picksLeft > 1 ? "Huge reward! Pick 2 power-ups" : state.picksLeft === 1 ? "One more power-up!" : "Boss defeated! Pick a power-up";
  outlinedText(heading, WIDTH / 2, 112, { size: 38, align: "center", font: DISPLAY_FONT, color: "#f6c85f" });
  const choices = state.upgradeChoices;
  const cw = 240;
  const ch = 250;
  const gap = 24;
  const start = WIDTH / 2 - (choices.length * cw + (choices.length - 1) * gap) / 2;
  choices.forEach((upgrade, i) => {
    const x = start + i * (cw + gap);
    const hover = isHover(x, 150, cw, ch);
    const y = 150 - (hover ? 6 : 0);
    drawPanel(x, y, cw, ch, hover ? "rgba(58, 44, 32, 0.97)" : "rgba(36, 28, 23, 0.97)");
    ctx.strokeStyle = hover ? upgrade.color : "#5b412d";
    if (upgrade.evo) ctx.strokeStyle = Math.floor(state.anim * 4) % 2 === 0 ? "#f6c85f" : upgrade.color;
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 2, y + 2, cw - 4, ch - 4);
    if (upgrade.evo) {
      const ribbon = upgrade.mega ? 170 : 124;
      ctx.fillStyle = upgrade.mega ? "#ff9ff3" : "#f6c85f";
      ctx.fillRect(x + cw / 2 - ribbon / 2, y - 12, ribbon, 24);
      outlinedText(upgrade.mega ? "MEGA EVOLUTION" : "EVOLUTION", x + cw / 2, y + 1, { size: 15, align: "center", baseline: "middle", font: DISPLAY_FONT, color: "#241c17", outline: null });
    }
    outlinedText(String(i + 1), x + 18, y + 30, { size: 20, font: DISPLAY_FONT, color: "#c5a988" });
    drawUpgradeIcon(upgrade.icon, x + cw / 2, y + 78, upgrade.color);
    outlinedText(upgrade.name, x + cw / 2, y + 146, { size: 22, align: "center", font: DISPLAY_FONT, color: upgrade.color });
    const lines = wrapLines(upgrade.desc, cw - 36, `600 15px ${BODY_FONT}`);
    lines.forEach((line, n) => outlinedText(line, x + cw / 2, y + 176 + n * 20, { size: 15, align: "center", weight: 600, color: "#f8ead2" }));
    const owned = state.upgradeCounts[upgrade.id] || 0;
    if (owned) outlinedText(`Have ${owned}`, x + cw / 2, y + ch - 16, { size: 13, align: "center", color: "#c5a988" });
    hitRegions.push({ x, y, w: cw, h: ch, action: () => chooseUpgrade(i) });
  });

  const canReroll = state.coins >= state.rerollCost;
  drawButton(`Reroll for ${state.rerollCost} coins`, WIDTH / 2 - 130, 438, 260, 46, rerollUpgrades, { disabled: !canReroll, size: 18 });
  outlinedText(touch.enabled ? "Tap a card to take it" : "Click a card or press 1, 2 or 3  ·  R rerolls", WIDTH / 2, 530, { size: 15, align: "center", color: "#c5a988" });
}

function drawPauseScreen() {
  dim(0.6);
  const rows = activePlayers().length;
  const height = 348 + rows * 64;
  const top = Math.round((HEIGHT - height) / 2);
  drawPanel(WIDTH / 2 - 250, top, 500, height);
  outlinedText("Paused", WIDTH / 2, top + 58, { size: 44, align: "center", font: DISPLAY_FONT, color: "#f6c85f" });
  let y = top + 84;
  drawButton("Resume", WIDTH / 2 - 130, y, 260, 46, togglePause, { primary: true });
  y += 56;
  drawButton(soundLabels[audio.mode], WIDTH / 2 - 130, y, 260, 46, cycleSound);
  y += 56;
  drawButton(`Difficulty: ${difficulty().name}`, WIDTH / 2 - 130, y, 260, 46, cycleDifficulty);
  y += 64;
  outlinedText(`Hat closet (${state.hatsUnlocked.size} / ${hats.length})`, WIDTH / 2, y, { size: 15, align: "center", color: "#c5a988" });
  y += 12;
  for (const p of activePlayers()) {
    const look = state.looks[p.index];
    ctx.save();
    ctx.translate(WIDTH / 2 - 190, y + 44);
    ctx.scale(1.3, 1.3);
    drawWizard(ctx, 0, 0, look.robe, 1, 0.2, state.anim, false, look.hat);
    ctx.restore();
    drawPicker(WIDTH / 2 + 20, y + 10, hats[look.hat].name, () => chooseHat(p.index, -1), () => chooseHat(p.index, 1));
    if (rows === 2) outlinedText(`P${p.index + 1}`, WIDTH / 2 - 140, y + 32, { size: 16, font: DISPLAY_FONT, color: shade(robes[look.robe].robe, 0.45) });
    y += 64;
  }
  drawButton("Save and quit", WIDTH / 2 - 130, y + 6, 260, 46, quitToTitle);
}

function drawDeadScreen() {
  ctx.fillStyle = "rgba(30, 10, 8, 0.72)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  outlinedText(state.twoPlayer ? "Oops! You both got bonked!" : "Oops! You got bonked!", WIDTH / 2, HEIGHT / 2 - 40, { size: 46, align: "center", font: DISPLAY_FONT, color: "#ff8b7d" });
  const lostLine = state.lastLost > 0 ? `You dropped ${state.lastLost} coins where you fell. Go back and grab them!` : "The boss healed back up. Try a different plan!";
  outlinedText(lostLine, WIDTH / 2, HEIGHT / 2, { size: 17, align: "center", color: "#f6c85f" });
  drawButton("Wake up at campfire (R)", WIDTH / 2 - 150, HEIGHT / 2 + 30, 300, 52, restartInRoom, { primary: true });
}

function drawVictoryScreen() {
  dim(0.55);
  outlinedText("Dungeon Complete!", WIDTH / 2, 96, { size: 60, align: "center", font: DISPLAY_FONT, color: "#f6c85f" });
  outlinedText("Blocky the Dragon is your friend now.", WIDTH / 2, 134, { size: 20, align: "center", color: "#ff9ff3" });

  ctx.save();
  ctx.translate(WIDTH / 2 + 120, 270);
  ctx.scale(1.2, 1.2);
  drawDragon(ctx, { x: 0, y: 0, size: 96, friendly: true }, state.anim);
  ctx.restore();
  activePlayers().forEach((p, i) => {
    const look = state.looks[p.index];
    ctx.save();
    ctx.translate(WIDTH / 2 - 110 - i * 90, 300 + i * 12);
    ctx.scale(2.2, 2.2);
    drawWizard(ctx, 0, 0, look.robe, 1, 0, state.anim + i, false, look.hat);
    ctx.restore();
  });
  if (state.petUnlocked) {
    ctx.save();
    ctx.translate(WIDTH / 2 - (state.twoPlayer ? 320 : 200), 330);
    ctx.scale(1.8, 1.8);
    drawPet(ctx, 0, 0, 1, state.anim * 4, state.anim);
    ctx.restore();
  }

  drawPanel(WIDTH / 2 - 220, 384, 440, 144);
  const lines = [
    ["Time", formatTime(state.time)],
    ["Coins collected", String(state.coins)],
    ["Enemies poofed", String(state.enemiesDefeated)],
    ["Power-ups", String(Object.values(state.upgradeCounts).reduce((a, b) => a + b, 0))],
    ["Big bosses beaten", `${state.bigBeaten.size} / ${bigBosses.length}`]
  ];
  lines.forEach(([label, value], i) => {
    outlinedText(label, WIDTH / 2 - 190, 416 + i * 24, { size: 16, color: "#c5a988" });
    outlinedText(value, WIDTH / 2 + 190, 416 + i * 24, { size: 16, align: "right", color: "#f8ead2" });
  });
  drawButton("Play again", WIDTH / 2 - 120, 542, 240, 52, () => {
    writeStorage(SAVE_KEY, null);
    state.hasSave = false;
    state.mode = "title";
  }, { primary: true });
}

function draw() {
  hitRegions.length = 0;
  const room = state.mode === "title" ? rooms[0] : currentRoom();

  ctx.save();
  if (state.shake > 0) ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));
  drawRoom(room);
  drawAmbient();
  if (state.mode !== "title" && state.mode !== "victory") {
    drawGroundEffects();
    if (hasCampfire(room)) drawCampfire(room);
    drawLostCoins(room);
    drawPickups();
    drawCrates(room);
    drawFoes(room);
    if (pet && state.petChoice === "pixel") drawPet(ctx, pet.x, pet.y, pet.face, pet.hop, state.anim);
    else if (pet) drawNewPet(ctx, state.petChoice, pet.x, pet.y, pet.face, pet.hop, state.anim, pet);
    for (const p of activePlayers()) {
      if (p.hp > 0 || state.twoPlayer) drawPlayer(p);
    }
    drawProjectiles();
    drawEffects();
  }
  drawParticles();
  if (state.mode !== "title" && state.mode !== "victory") drawFloatTexts();
  ctx.restore();

  if (state.slowmo > 0) {
    ctx.fillStyle = `rgba(90, 150, 255, ${Math.min(0.18, state.slowmo * 0.3)})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  if (state.hurtFlash > 0) {
    ctx.fillStyle = `rgba(217, 77, 63, ${state.hurtFlash * 0.6})`;
    ctx.fillRect(0, 0, WIDTH, 10);
    ctx.fillRect(0, HEIGHT - 10, WIDTH, 10);
    ctx.fillRect(0, 0, 10, HEIGHT);
    ctx.fillRect(WIDTH - 10, 0, 10, HEIGHT);
  }

  if (state.mode !== "title" && state.mode !== "victory" && state.mode !== "intro") drawHud(room);
  if (state.mode === "playing") drawBanner();
  if (state.mode === "intro") drawIntro();

  if (state.mode === "title") drawTitle();
  if (state.mode === "upgrade") drawUpgradeScreen();
  if (state.mode === "paused") drawPauseScreen();
  if (state.mode === "dead") drawDeadScreen();
  if (state.mode === "victory") {
    drawVictoryScreen();
    drawParticles();
  }

  if (state.fade > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${state.fade * 0.8})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  const hovering = hitRegions.some((r) => isHover(r.x, r.y, r.w, r.h));
  canvas.style.cursor = hovering ? "pointer" : state.mode === "playing" ? "crosshair" : "default";
}

/* ---------- side panel ---------- */

// Six rooms per row, then that row's big boss arena in a seventh column.
function createMiniMap() {
  ui.miniMap.innerHTML = "";
  for (let row = 0; row < ROOM_ROWS; row += 1) {
    for (let col = 0; col <= ROOM_COLS; col += 1) {
      const index = col < ROOM_COLS ? row * ROOM_COLS + col : ARENA_START + row;
      const cell = document.createElement("div");
      cell.className = "map-cell";
      cell.title = col < ROOM_COLS ? `Room ${index + 1}` : `Big boss: ${bigBosses[row].name}`;
      ui.miniMap.appendChild(cell);
      mapCells[index] = cell;
    }
  }
}

function createSpellCards() {
  ui.spellList.innerHTML = "";
  spells.forEach((spell, i) => {
    const card = document.createElement("div");
    card.className = "spell-card";
    card.innerHTML = `<div class="spell-head"><i class="spell-swatch" style="--c:${spell.color}"></i><strong>${i + 1}. ${spell.name}</strong><span class="spell-status">Ready</span></div><p>${spell.desc}</p>`;
    ui.spellList.appendChild(card);
    spell.card = card;
    spell.status = card.querySelector(".spell-status");
  });
}

function createBestiary() {
  ui.bestiary.innerHTML = "";
  const total = document.getElementById("bestiaryTotal");
  if (total) total.textContent = String(enemyTypes.length);
  enemyTypes.forEach((type) => {
    const icon = document.createElement("canvas");
    icon.width = 48;
    icon.height = 48;
    icon.title = "Not discovered yet";
    ui.bestiary.appendChild(icon);
    type.icon = icon;
  });
}

function renderBestiary() {
  enemyTypes.forEach((type, i) => {
    const g = type.icon.getContext("2d");
    g.clearRect(0, 0, 48, 48);
    if (state.seenTypes.has(i)) {
      type.icon.classList.add("found");
      type.icon.title = type.monster ? `${type.name}: ${type.quirk}` : `${type.name} (boss: ${type.boss})`;
      drawFoeBody(g, i, 24, 27, 22, 0.5, { x: 0, y: 0.2 });
    } else {
      type.icon.classList.remove("found");
      type.icon.title = "Not discovered yet";
      g.fillStyle = "#3a2c20";
      g.fillRect(13, 15, 22, 22);
      g.fillStyle = "#c5a988";
      g.font = `700 18px ${BODY_FONT}`;
      g.textAlign = "center";
      g.fillText("?", 24, 32);
    }
  });
  ui.bestiaryCount.textContent = String(state.seenTypes.size);
  state.shownBestiary = state.seenTypes.size;
}

function createHatGrid() {
  ui.hatGrid.innerHTML = "";
  hats.forEach((hat, id) => {
    const icon = document.createElement("canvas");
    icon.width = 48;
    icon.height = 48;
    icon.addEventListener("click", () => {
      if (!state.hatsUnlocked.has(id)) return;
      initAudio();
      wearHat(0, id);
    });
    ui.hatGrid.appendChild(icon);
    hat.icon = icon;
  });
}

function createPetGrid() {
  ui.petGrid.innerHTML = "";
  state.petIcons = PET_IDS.map((id) => {
    const icon = document.createElement("canvas");
    icon.width = 48;
    icon.height = 48;
    icon.addEventListener("click", () => {
      initAudio();
      choosePet(id);
    });
    ui.petGrid.appendChild(icon);
    return icon;
  });
}

function renderPets() {
  PET_IDS.forEach((id, i) => {
    const icon = state.petIcons[i];
    const g = icon.getContext("2d");
    g.clearRect(0, 0, 48, 48);
    const owned = state.petsOwned.has(id);
    icon.classList.toggle("found", owned);
    icon.classList.toggle("worn", owned && shownPet() === id);
    const type = petTypes[id];
    if (owned) {
      icon.title = `${type.name}: ${type.desc} Pick it on the title screen.`;
      if (id === "pixel") drawPet(g, 24, 30, 1, 0, 0);
      else drawNewPet(g, id, 24, 30, 1, 0, 0);
    } else {
      icon.title = `Beat ${id === "pixel" ? type.from : bigBosses[type.row].name} to meet this pet`;
      g.fillStyle = "#3a2c20";
      g.fillRect(13, 15, 22, 22);
      g.fillStyle = "#c5a988";
      g.font = `700 18px ${BODY_FONT}`;
      g.textAlign = "center";
      g.fillText("?", 24, 32);
    }
  });
  ui.petCount.textContent = petTypes[shownPet()].name;
  state.shownPets = shownPet();
}

// On the title screen the den shows the pet you're picking; in a run, the one with you.
function shownPet() {
  return state.mode === "title" ? state.petPick : state.petChoice;
}

// Player 1 can click any collected hat here to wear it.
function renderHats() {
  const look = state.looks[0];
  hats.forEach((hat, id) => {
    const g = hat.icon.getContext("2d");
    g.clearRect(0, 0, 48, 48);
    const owned = state.hatsUnlocked.has(id);
    hat.icon.classList.toggle("found", owned);
    hat.icon.classList.toggle("worn", owned && look.hat === id);
    if (owned) {
      hat.icon.title = `${hat.name} (from ${hat.from}). Click to wear it.`;
      drawWizard(g, 24, 44, look.robe, 0, 0.3, 0, false, id);
    } else {
      hat.icon.title = id === DRAGON_HAT ? "A secret hat. Who could have it?" : `Beat ${hat.from} to win this hat`;
      g.fillStyle = "#3a2c20";
      g.fillRect(13, 15, 22, 22);
      g.fillStyle = "#c5a988";
      g.font = `700 18px ${BODY_FONT}`;
      g.textAlign = "center";
      g.fillText("?", 24, 32);
    }
  });
  ui.hatCount.textContent = String(state.hatsUnlocked.size);
  state.shownHats = `${state.hatsUnlocked.size}-${look.hat}-${look.robe}`;
}

function renderCombos() {
  ui.comboList.innerHTML = "";
  for (const combo of combos) {
    const li = document.createElement("li");
    const found = state.combosFound.has(combo.id);
    li.className = found ? "found" : "";
    li.style.setProperty("--c", combo.color);
    li.innerHTML = found
      ? `<strong>${combo.name}</strong><span>${combo.recipe}</span><p>${combo.desc}</p>`
      : `<strong>???</strong><span>${combo.recipe.replace(/ \+ .*/, " + ???")}</span><p>${combo.hint}</p>`;
    ui.comboList.appendChild(li);
  }
  ui.comboCount.textContent = String(state.combosFound.size);
  state.shownCombos = state.combosFound.size;
}

function renderUpgradeList() {
  ui.upgradeList.innerHTML = "";
  const owned = upgrades.filter((upgrade) => state.upgradeCounts[upgrade.id]);
  if (state.petUnlocked) {
    const li = document.createElement("li");
    li.innerHTML = `<i style="--c:${stats.petEvo ? petKinds[stats.petEvo].color : "#fb923c"}"></i>${petName()}<b>Lv ${stats.petLevel}</b>`;
    ui.upgradeList.appendChild(li);
  }
  if (!owned.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Beat a boss to pick your first power-up.";
    ui.upgradeList.appendChild(li);
  }
  for (const upgrade of owned) {
    const li = document.createElement("li");
    li.innerHTML = `<i style="--c:${upgrade.color}"></i>${upgrade.name}<b>x${state.upgradeCounts[upgrade.id]}</b>`;
    ui.upgradeList.appendChild(li);
  }
  state.shownUpgradesVersion = state.upgradesVersion;
}

function updateInterface(dt) {
  ui.hpBar.style.width = `${(player.hp / stats.maxHp) * 100}%`;
  ui.manaBar.style.width = `${(player.mana / stats.maxMana) * 100}%`;
  ui.hpText.textContent = `${Math.ceil(player.hp)}/${stats.maxHp}`;
  ui.manaText.textContent = `${Math.floor(player.mana)}/${stats.maxMana}`;
  ui.coinText.textContent = String(state.coins);
  const two = state.twoPlayer;
  if (ui.p2Meters.hidden === two) ui.p2Meters.hidden = !two;
  const hpLabel = two ? "P1 HP" : "HP";
  if (ui.hpLabel.textContent !== hpLabel) {
    ui.hpLabel.textContent = hpLabel;
    ui.manaLabel.textContent = two ? "P1 Mana" : "Mana";
  }
  if (two) {
    const p2 = players[1];
    ui.hp2Bar.style.width = `${(p2.hp / stats.maxHp) * 100}%`;
    ui.mana2Bar.style.width = `${(p2.mana / stats.maxMana) * 100}%`;
    ui.hp2Text.textContent = p2.hp > 0 ? `${Math.ceil(p2.hp)}/${stats.maxHp}` : "Bonked";
    ui.mana2Text.textContent = `${Math.floor(p2.mana)}/${stats.maxMana}`;
  }

  state.uiTimer -= dt;
  if (state.uiTimer > 0) return;
  state.uiTimer = 0.15;

  const room = currentRoom();
  for (let i = 0; i < ROOM_COUNT; i += 1) {
    const r = rooms[i];
    let cls = "map-cell";
    if (r.visited) cls += " seen";
    if (r.visited && r.boss && r.boss.hp > 0) cls += " boss-alive";
    if (r.visited && isRoomCleared(r)) cls += " cleared";
    if (i === 0 && state.portalOpen && !state.won) cls += " portal";
    if (i === state.roomIndex && state.mode !== "title") cls += " current";
    if (mapCells[i].className !== cls) mapCells[i].className = cls;
  }
  for (let row = 0; row < ROOM_ROWS; row += 1) {
    const index = ARENA_START + row;
    let cls = "map-cell arena";
    if (state.bigBeaten.has(row)) cls += " beaten";
    else if (gateOpen(row)) cls += " open";
    else cls += " locked";
    if (index === state.roomIndex && state.mode !== "title") cls += " current";
    if (mapCells[index].className !== cls) mapCells[index].className = cls;
  }

  const bossAlive = room.boss && room.boss.hp > 0;
  const nearby = room.enemies.filter((enemy) => enemy.hp > 0).length;
  ui.trackRoom.textContent = room.final ? "Dragon's Lair" : room.arena ? "Big Boss Arena" : `${room.index + 1} / ${ROOM_COUNT}`;
  ui.trackBiome.textContent = room.biome.name;
  ui.trackBoss.textContent = !room.boss ? "Waiting" : bossAlive ? `${room.boss.name}: ${Math.ceil(room.boss.hp)} HP` : "Defeated";
  ui.trackEnemies.textContent = `${state.enemiesDefeated} poofed, ${nearby} nearby`;
  ui.trackBosses.textContent = `${state.bossesDefeated} / ${ROOM_COUNT}`;
  ui.trackBig.textContent = `${state.bigBeaten.size} / ${bigBosses.length}`;
  ui.trackTime.textContent = formatTime(state.time);

  let goal = "Defeat this room boss";
  if (state.mode === "title") goal = "Press start";
  else if (state.won) goal = "You won!";
  else if (room.final) goal = "Calm down Blocky the Dragon";
  else if (room.arena) goal = bossAlive ? `Beat ${room.boss.name}!` : "Head back through the left door";
  else if (state.portalOpen) goal = "Enter the golden portal in Room 1";
  else if (bossAlive) goal = "Defeat this room boss";
  else if (nearby > 0) goal = "Clear the remaining enemies";
  else goal = "Choose the next room";
  ui.trackGoal.textContent = goal;

  spells.forEach((spell, i) => {
    const evolved = Boolean(stats.evo[spell.id]);
    const shown = `${stats.evo[spell.id] || ""}-${Boolean(stats.mega[spell.id])}`;
    if (spell.shownEvo !== shown) {
      const look = spellLook(spell);
      const stars = !evolved ? "" : stats.mega[spell.id] ? " ★★" : " ★";
      spell.card.querySelector("strong").textContent = `${i + 1}. ${look.name}${stars}`;
      spell.card.querySelector("p").textContent = evolved ? look.desc : `${spell.desc} Evolves into ${spell.evos[0].name} or ${spell.evos[1].name} later.`;
      spell.card.querySelector(".spell-swatch").style.setProperty("--c", look.color);
      spell.shownEvo = shown;
    }
    const locked = state.bossesDefeated < spell.unlockAt;
    const cooldown = player.cooldowns[spell.id];
    let text = "Ready";
    let cls = "spell-status";
    if (locked) text = `Beat ${spell.unlockAt} bosses`;
    else if (cooldown > 0) {
      text = `${cooldown.toFixed(1)}s`;
      cls += " cooling";
    } else if (player.mana < spellCost(spell)) {
      text = "Need mana";
      cls += " empty";
    }
    if (spell.status.textContent !== text) spell.status.textContent = text;
    if (spell.status.className !== cls) spell.status.className = cls;
    spell.card.classList.toggle("locked", locked);
  });

  if (state.shownUpgradesVersion !== state.upgradesVersion || (state.petUnlocked && !ui.upgradeList.textContent.includes(petName()))) renderUpgradeList();
  if (state.shownBestiary !== state.seenTypes.size) renderBestiary();
  if (state.shownHats !== `${state.hatsUnlocked.size}-${state.looks[0].hat}-${state.looks[0].robe}`) renderHats();
  if (state.shownPets !== shownPet()) renderPets();
  if (state.shownCombos !== state.combosFound.size) renderCombos();
}

/* ---------- boot ---------- */

let lastTime = performance.now();

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;
  try {
    update(dt);
    draw();
    updateInterface(dt);
  } catch (err) {
    console.error(err);
  }
  requestAnimationFrame(frame);
}

function boot() {
  const prefs = readStorage(PREFS_KEY);
  if (prefs) {
    audio.mode = clamp(prefs.sound | 0, 0, 2);
    state.looks[0].robe = clamp(prefs.robe | 0, 0, robes.length - 1);
    if (typeof prefs.difficulty === "number") state.difficulty = clamp(prefs.difficulty, 0, difficulties.length - 1);
    state.twoPlayer = prefs.twoPlayer === true;
    if (petTypes[prefs.pet]) state.petPick = prefs.pet;
    if (Array.isArray(prefs.hats)) {
      for (const id of prefs.hats) {
        if (Number.isInteger(id) && hats[id]) state.hatsUnlocked.add(id);
      }
    }
    if (Array.isArray(prefs.combos)) {
      for (const id of prefs.combos) {
        if (combos.some((c) => c.id === id)) state.combosFound.add(id);
      }
    }
    if (Array.isArray(prefs.looks)) {
      prefs.looks.slice(0, 2).forEach((saved, i) => {
        if (!saved) return;
        state.looks[i].robe = clamp(saved.robe | 0, 0, robes.length - 1);
        const hat = saved.hat | 0;
        state.looks[i].hat = state.hatsUnlocked.has(hat) ? hat : 0;
      });
    }
  }
  const save = readStorage(SAVE_KEY);
  state.hasSave = Boolean(save && save.v === 2);

  applySoundMode();
  createMiniMap();
  createSpellCards();
  createBestiary();
  renderBestiary();
  createHatGrid();
  renderHats();
  createPetGrid();
  renderPets();
  renderCombos();
  renderUpgradeList();
  renderRoomBackground(rooms[0]);
  if (document.fonts && document.fonts.load) document.fonts.load(`700 40px "Pixelify Sans"`).catch(() => {});
  requestAnimationFrame(frame);
}

// A small handle for testing and tinkering from the browser console.
window.blockDungeon = {
  state,
  player,
  players,
  hats,
  combos,
  get rooms() { return rooms; },
  get stats() { return stats; },
  startNewGame,
  enterRoom,
  defeatEnemy,
  openUpgrade,
  chooseUpgrade,
  castSpell,
  hurtPlayer,
  togglePlayers,
  wearHat,
  unlockHat
};

boot();
