/* ---------- boss personalities ----------
   Load this file after script.js, sprites.js and terrain.js. It gives every
   room boss its own personality and moves (see boss-roster.md).

   How it works:
   - BOSS_KITS says, per boss, how it thinks (mood), which old attacks it keeps
     (basic), its two signature moves, its ultimate and its passive trick.
   - runBossPattern is wrapped by a "brain" that picks the next move from what
     is happening (how far away you are, your habits, what it just did) instead
     of looping a fixed list. Angry bosses chain moves with no breather.
   - Three phases: the second signature unlocks at 66% HP, the ultimate at 33%.
     The second time you meet a boss (tier 15+) it has everything from the start.
   - Signature moves run in a new "sig" state. Each one is a small step machine
     in SIGS with start() and update(); update() returns true when it's done.
   - Things a move leaves behind live in bossFx (fire, webs, warning circles,
     laser lines). Things you can break (eggs, coffins, mirrors) are real
     enemies with behavior "bossprop", so every spell can hit them.
   Easy keeps the same moves with longer warnings, softer hits and no chains. */

/* ---------- tuning ---------- */

// Per difficulty: tele = warning length, chain = chance to link moves,
// pace = time between attacks, rest = breather after a move, slow = how hard slows bite,
// dmg = how hard boss hits land, speed = how fast bosses move, links = most moves in one chain.
const BOSS_TUNE = [
  { tele: 1.5, chain: 0, pace: 1.15, rest: 1.5, slow: 0.5, dmg: 1, speed: 1, links: 0 },
  { tele: 0.85, chain: 1.6, pace: 0.66, rest: 0.55, slow: 1.1, dmg: 1.3, speed: 1.15, links: 2 },
  { tele: 0.7, chain: 2.2, pace: 0.55, rest: 0.4, slow: 1.25, dmg: 1.5, speed: 1.25, links: 3 }
];
const PHASE_PACE = [1, 0.85, 0.7];
const ELDER_TIER = 15;

function bossTune() {
  return BOSS_TUNE[state.difficulty] || BOSS_TUNE[1];
}

function tele(seconds) {
  return seconds * bossTune().tele;
}

function easyMode() {
  return state.difficulty === 0;
}

/* ---------- small helpers ---------- */

function angleTo(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function turnToward(now, want, maxStep) {
  return now + clamp(Math.atan2(Math.sin(want - now), Math.cos(want - now)), -maxStep, maxStep);
}

function inArena(x, y, pad = 40) {
  return { x: clamp(x, TILE + pad, WIDTH - TILE - pad), y: clamp(y, TILE + pad, HEIGHT - TILE - pad) };
}

function randomSpot(pad = 70) {
  return { x: rand(TILE + pad, WIDTH - TILE - pad), y: rand(TILE + pad, HEIGHT - TILE - pad) };
}

// enemyShot needs something with x, y and size; this fires from any point.
function shotFrom(x, y, angle, speed, damage, options = {}) {
  enemyShot({ x, y, size: 0, damage }, angle, speed, options);
}

// how: "parry" lets a perfect block stun the boss, "zone" can be blocked but
// not parried, "unblock" goes through blocks (dash only).
const UNBLOCKABLE = { unparryHit: true, hp: 0 };
function strike(p, damage, x, y, boss, how = "parry") {
  const attacker = how === "parry" ? boss : how === "unblock" ? UNBLOCKABLE : null;
  return hurtPlayer(p, damage, x, y, attacker);
}

function hitCircle(x, y, r, damage, boss, how) {
  for (const p of livingPlayers()) {
    if (Math.hypot(p.x - x, p.y - y) < r + p.r * 0.5) strike(p, damage, x, y, boss, how);
  }
}

function segmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy || 1;
  const k = clamp(((px - x1) * dx + (py - y1) * dy) / len, 0, 1);
  return Math.hypot(px - (x1 + dx * k), py - (y1 + dy * k));
}

// Where a ray from (x, y) at angle leaves the room.
function rayToWall(x, y, angle) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = 2000;
  if (dx > 0.001) best = Math.min(best, (WIDTH - TILE - x) / dx);
  if (dx < -0.001) best = Math.min(best, (TILE - x) / dx);
  if (dy > 0.001) best = Math.min(best, (HEIGHT - TILE - y) / dy);
  if (dy < -0.001) best = Math.min(best, (TILE - y) / dy);
  const hitX = x + dx * best;
  const hitY = y + dy * best;
  const vertical = Math.abs(hitX - TILE) < 1 || Math.abs(hitX - (WIDTH - TILE)) < 1;
  return { x: hitX, y: hitY, dist: best, vertical };
}

function shout(boss, text, color) {
  floatText(boss.x, boss.y - boss.size - 14 - (boss.hop || 0), text, color || boss.type.accent || "#ffffff", 17);
}

function livingTemps(room) {
  return room.enemies.filter((enemy) => enemy.hp > 0 && enemy.temp).length;
}

function spawnHelper(room, typeIndex, x, y, small = true) {
  if (livingTemps(room) >= 9) return null;
  const spot = inArena(x, y, 40);
  const minion = makeEnemy(typeIndex, spot.x, spot.y, { tier: Math.min(room.tier, 22), temp: true, small });
  minion.attackTimer = 1;
  room.enemies.push(minion);
  state.seenTypes.add(typeIndex);
  burst(spot.x, spot.y, [minion.type.color, "#ffffff"], 8, 120);
  return minion;
}

/* ---------- the kits ----------
   mood: pace (lower = attacks sooner), rest (breather after a move),
   cunning (extra fake-outs), chain (how much it loves linking moves).
   basic: old attacks it keeps. Sword bosses keep their sword moves too. */
const BOSS_KITS = {
  0: { name: "King Zombo", sword: true, mood: { pace: 1, rest: 0.6, cunning: 0.2, chain: 0.5 }, basic: ["slam", "summon"], moves: ["rise", "rotbreath"], ult: "horde", passive: "relentless", lines: ["Brains... and BLADES!", "The Horde never sleeps!"] },
  1: { name: "Sir Rattlebones", mood: { pace: 0.9, rest: 0.8, cunning: 0.5, chain: 0.5 }, basic: ["aim", "aim"], moves: ["snipe", "curtain"], ult: "volleylines", passive: "fakedeath", lines: ["Too slow!", "Bones heal, you know."] },
  2: { name: "Mama Webby", mood: { pace: 1.05, rest: 1, cunning: 0.9, chain: 0.4 }, basic: ["aim", "summon"], moves: ["webshot", "ceilingdrop"], ult: "brood", passive: "webrunner", lines: ["Come into my parlor...", "My babies are hungry!"] },
  3: { name: "Big Wobble", sword: true, mood: { pace: 0.9, rest: 0.7, cunning: 1, chain: 0.6 }, basic: [], moves: ["bellybounce", "jiggle"], ult: "blobstorm", passive: "rubbery", lines: ["Boing boing!", "Wobble wobble!"] },
  4: { name: "Imp-eror Blaze", mood: { pace: 0.85, rest: 0.7, cunning: 0.6, chain: 0.5 }, basic: ["spiral", "aim"], moves: ["hopscotch", "juggle"], ult: "firering", passive: "footprints", lines: ["Catch me if you can!", "Feel the heat!"] },
  5: { name: "The Wispy Queen", mood: { pace: 0.95, rest: 0.8, cunning: 0.7, chain: 0.5 }, basic: ["ring", "teleport"], moves: ["icewaltz", "snowflake"], ult: "frozenmirrors", passive: "chill", lines: ["Dance with me.", "So cold, so lovely."] },
  6: { name: "Pharaoh Husk", sword: true, mood: { pace: 1, rest: 0.8, cunning: 0.7, chain: 0.5 }, basic: [], moves: ["wraps", "curse"], ult: "sarcophagus", passive: "sandstorm", lines: ["Kneel before the Pharaoh!", "The tomb remembers you."] },
  7: { name: "Chief Mossbeard", mood: { pace: 1, rest: 0.9, cunning: 0.8, chain: 0.5 }, basic: ["summon", "aim"], moves: ["vines", "mushrooms"], ult: "wardrums", passive: "bushhide", lines: ["The forest fights with me!", "Hear the drums!"] },
  8: { name: "Count Batula", mood: { pace: 0.9, rest: 0.7, cunning: 0.9, chain: 0.6 }, basic: ["aim", "summon"], moves: ["batswarm", "drain"], ult: "screech", passive: "lifesteal", lines: ["I vant your HP!", "Bleh bleh!"] },
  9: { name: "Crystal Crusher", sword: true, mood: { pace: 1, rest: 0.6, cunning: 0.3, chain: 0.5 }, basic: [], moves: ["prism", "cage"], ult: "mirrorclones", passive: "shardslash", lines: ["Perfectly cut.", "Shatter!"] },
  10: { name: "Brute-zilla", mood: { pace: 0.8, rest: 1, cunning: 0.2, chain: 0.7 }, basic: ["charge", "slam"], moves: ["bullrush", "groundpound"], ult: "stampede", passive: "rage", lines: ["SMASH!", "BRUTE ANGRY!"] },
  11: { name: "Grandpa Golem", mood: { pace: 1.2, rest: 0.8, cunning: 0.2, chain: 0.5 }, basic: ["ring", "slam"], moves: ["boulder", "stomp"], ult: "avalanche", passive: "stonefront", lines: ["Back in my day...", "Hmmph. Rocks."] },
  12: { name: "The Shadow Shifter", sword: true, mood: { pace: 0.9, rest: 0.6, cunning: 1, chain: 0.6 }, basic: [], moves: ["copycat", "echoslash"], ult: "lightsout", passive: "shadowclones", lines: ["Which one is me?", "Your magic tastes nice."] },
  13: { name: "Mega Mud Puff", mood: { pace: 1, rest: 0.9, cunning: 0.5, chain: 0.5 }, basic: ["aim", "ring"], moves: ["mudmines", "geysers"], ult: "puffup", passive: "touchy", lines: ["Puff puff... BOOM!", "Watch your step!"] },
  14: { name: "Quartz Commander", mood: { pace: 1, rest: 0.7, cunning: 0.6, chain: 0.5 }, basic: ["aim", "charge"], moves: ["shieldwall", "phalanx"], ult: "archers", passive: "counter", lines: ["Formation!", "Hold the line!"] }
};

// Old attacks: where they work best. Used to score moves.
const BASIC_INFO = {
  aim: { range: "far" }, ring: { range: "near" }, spiral: { range: "any" }, summon: { range: "far" }, charge: { range: "far" },
  slam: { range: "mid" }, rain: { range: "any", tags: ["area"] }, teleport: { range: "near" }, barrage: { range: "far" },
  combo: { range: "near" }, thrust: { range: "mid" }, slash: { range: "near" }, leapslash: { range: "far" }, spin: { range: "near" }, retreat: { range: "near" }
};

function kitFor(boss) {
  if (!boss || !boss.isBoss || boss.friendly) return null;
  if (boss.isDragon) return DRAGON_KIT;
  if (boss.isBig) return BIG_KITS[boss.row] || null;
  return BOSS_KITS[boss.typeIndex] || null;
}

// The brain's memory for one fight. resetBoss clears it.
function brainOf(boss, room) {
  if (boss.brain) return boss.brain;
  const kit = kitFor(boss);
  // Bosses whose moves need a sword always get one (Spirit Tree waves pick types at random).
  if (kit.sword && !boss.melee) makeSwordBoss(boss, room.tier || 0);
  // Sword bosses keep their sword moves; others swap the generic loop for their own basics.
  const basic = boss.isBig || boss.isDragon ? [...new Set(boss.patterns)] : boss.melee ? boss.patterns.filter((p) => p !== "slash" || Math.random() < 0.5) : kit.basic.slice();
  if (!boss.melee && boss.patterns.includes("barrage")) basic.push("barrage");
  boss.brain = {
    basic,
    phase: 1,
    elder: !boss.isBig && !boss.isDragon && (room.tier || 0) >= ELDER_TIER,
    last: null,
    last2: null,
    chained: 0,
    ultAt: 0,
    baseSpeed: boss.speed,
    baseSize: boss.size,
    passiveAt: state.clock + rand(4, 7),
    face: angleTo(boss, bossTarget(boss)),
    rage: 0,
    dmgMult: bossTune().dmg
  };
  boss.damage *= boss.brain.dmgMult;
  return boss.brain;
}

function bossPhase(boss) {
  if (boss.isBig) return boss.desperate ? 3 : boss.phase2 ? 2 : 1;
  if (boss.desperate) return 3;
  const f = boss.hp / boss.maxHp;
  return f < 0.33 ? 3 : f < 0.66 ? 2 : 1;
}

function rangeFit(range, d) {
  if (range === "near") return d < 170 ? 2.2 : d < 260 ? 0.8 : 0.35;
  if (range === "far") return d > 240 ? 2 : d > 160 ? 0.9 : 0.4;
  if (range === "mid") return d > 120 && d < 300 ? 1.8 : 0.6;
  return 1;
}

function unlockedSigs(boss, kit, brain) {
  const unlock = kit.unlock || [1, 2];
  return kit.moves.filter((id, i) => brain.elder || brain.phase >= unlock[i]);
}

function chooseMove(boss, kit, brain) {
  const target = bossTarget(boss);
  const d = Math.hypot(target.x - boss.x, target.y - boss.y);
  const pool = [];
  for (const id of brain.basic) pool.push({ id, w: 1 });
  for (const id of unlockedSigs(boss, kit, brain)) pool.push({ id, w: easyMode() ? 1.8 : 2.6 });
  if ((brain.phase >= 3 || brain.elder) && state.clock > brain.ultAt) pool.push({ id: kit.ult, w: 0.9 });
  let total = 0;
  for (const option of pool) {
    const info = SIGS[option.id] || BASIC_INFO[option.id] || {};
    option.w *= rangeFit(info.range, d);
    if (option.id === brain.last) option.w = 0;
    else if (option.id === brain.last2) option.w *= 0.35;
    const tags = info.tags || [];
    // It notices your habits: parry-spammers get unblockable moves, dash-spammers get floor traps.
    if (tags.includes("unblock") && state.habits.parry > 3) option.w *= 1.8;
    if (tags.includes("area") && state.habits.dash > 3) option.w *= 1.6;
    total += option.w;
  }
  let roll = Math.random() * total;
  for (const option of pool) {
    roll -= option.w;
    if (roll <= 0) return option.id;
  }
  return pool.length ? pool[0].id : "aim";
}

// Run one of the old attacks by name, through the original code.
function runBasic(boss, id, phase2, room, ux, uy) {
  const saved = boss.patterns;
  const index = boss.patternIndex;
  boss.patterns = [id];
  boss.patternIndex = 0;
  try {
    baseRunBossPattern(boss, phase2, room, ux, uy);
  } finally {
    boss.patterns = saved;
    boss.patternIndex = index;
  }
}

const baseRunBossPattern = runBossPattern;
runBossPattern = function (boss, phase2, room, ux, uy) {
  const kit = kitFor(boss);
  if (!kit || boss.opener || boss.punish) return baseRunBossPattern(boss, phase2, room, ux, uy);
  const brain = brainOf(boss, room);
  const id = brain.queued || chooseMove(boss, kit, brain);
  brain.queued = null;
  brain.last2 = brain.last;
  brain.last = id;
  if (id === kit.ult) brain.ultAt = state.clock + (brain.elder ? 9 : 12);
  if (SIGS[id]) startSig(boss, id, room);
  else runBasic(boss, id, phase2, room, ux, uy);

  // Tempo: each boss has its own pace, and angry bosses chain moves.
  const tune = bossTune();
  const berserk = state.clock < (brain.berserkUntil || 0) ? 0.55 : 1;
  boss.attackTimer *= kit.mood.pace * tune.pace * PHASE_PACE[brain.phase - 1] * berserk;
  // Chains start in phase one now, and get likelier every phase.
  const chain = kit.mood.chain * tune.chain * (brain.phase - 0.5) * 0.5 + (brain.elder ? 0.12 * tune.chain : 0);
  brain.chain = brain.chained < tune.links && Math.random() < chain;
  brain.chained = brain.chain ? brain.chained + 1 : 0;
  if (brain.chain && !SIGS[id]) boss.attackTimer = rand(0.12, 0.3);
};

const baseFeintChance = feintChance;
feintChance = function (boss, room) {
  const kit = kitFor(boss);
  const base = baseFeintChance(boss, room);
  if (!kit || easyMode() || boss.punish) return base;
  return Math.min(0.75, base + kit.mood.cunning * 0.18);
};

/* ---------- signature move state ---------- */

function startSig(boss, id, room) {
  const def = SIGS[id];
  boss.sig = { id, t: 0, step: 0, timer: 0 };
  boss.state = "sig";
  boss.sigHidden = false;
  boss.sigInvuln = false;
  if (def.name) shout(boss, def.name);
  def.start(boss, boss.sig, room);
  // Some moves just hand off to old code (sword swings), so they never stay in "sig".
  if (def.instant) {
    boss.sig = null;
    if (boss.state === "sig") boss.state = "move";
  }
}

function clearSig(boss) {
  const s = boss.sig;
  if (s && SIGS[s.id].clear) SIGS[s.id].clear(boss, s);
  boss.sig = null;
  boss.sigHidden = false;
  boss.sigInvuln = false;
  boss.alpha = 1;
  boss.hop = 0;
}

function endSig(boss, room) {
  const brain = boss.brain;
  clearSig(boss);
  if (brain && brain.chain) {
    // No breather: straight into the next move.
    brain.chain = false;
    boss.state = "tell";
    boss.tellTime = 0.16;
    boss.stateTimer = 0.16;
    boss.feint = 0;
    return;
  }
  const kit = kitFor(boss);
  boss.state = "recover";
  boss.stateTimer = (kit ? kit.mood.rest : 1) * bossTune().rest * [0.9, 0.75, 0.6][(brain ? brain.phase : 1) - 1];
}

function watchPhase(boss, kit, brain, room) {
  const phase = bossPhase(boss);
  if (phase <= brain.phase) return;
  brain.phase = phase;
  addShake(6);
  addRing(boss.x, boss.y, 150, boss.type.accent, 0.5, 10);
  sfx.roar();
  shout(boss, kit.lines[phase === 3 ? 1 : 0], "#ff8b7d");
  // Big bosses swap in sword moves when they transform, so their old attacks change too.
  if (boss.isBig || boss.isDragon) brain.basic = [...new Set(boss.patterns)];
  const fresh = kit.moves.filter((id, i) => (kit.unlock || [1, 2])[i] === phase);
  if (fresh.length && !brain.elder) toast(`${boss.name} learned ${SIGS[fresh[0]].name.replace("!", "")}!`, 2.2);
  if (phase === 3) {
    // The ultimate comes right away the first time.
    toast(`${boss.name}'s ultimate: ${SIGS[kit.ult].name.replace("!", "")}`, 2.6);
    brain.queued = kit.ult;
    boss.attackTimer = Math.min(boss.attackTimer, 0.35);
  }
}

const baseUpdateBoss = updateBoss;
updateBoss = function (boss, dt, ux, uy, dist, slow, room) {
  const kit = kitFor(boss);
  if (!kit || boss.transforming > 0) return baseUpdateBoss(boss, dt, ux, uy, dist, slow, room);
  const brain = brainOf(boss, room);
  watchPhase(boss, kit, brain, room);
  runPassive(boss, kit, brain, dt, room, dist);
  if (boss.state === "sig" && boss.sig) {
    const s = boss.sig;
    s.t += dt;
    s.slow = slow;
    // A move that somehow can't finish (blocked by a pond or wall) gives up after 20s.
    const done = s.t > 20 || SIGS[s.id].update(boss, s, dt, room);
    // "handoff": the move went straight into an old attack, which now owns the state.
    if (done === "handoff") clearSig(boss);
    else if (done) endSig(boss, room);
    return;
  }
  if (boss.sig) clearSig(boss);
  if (boss.state === "sig") boss.state = "move";
  baseUpdateBoss(boss, dt, ux, uy, dist, slow, room);
};

/* ---------- things on the floor and in the air ----------
   Every bossFx entry has a kind, a life in seconds, and lives in FX[kind]:
   update(fx, dt) runs each frame, draw(fx) paints it. ground: true draws it
   under monsters and wizards. */

const bossFx = [];
let bossFxRoom = -1;

function addFx(fx) {
  fx.t = 0;
  fx.max = fx.life;
  bossFx.push(fx);
  return fx;
}

function clearBossFx() {
  bossFx.length = 0;
}

function updateBossFx(dt) {
  if (bossFxRoom !== state.roomIndex) {
    bossFxRoom = state.roomIndex;
    clearBossFx();
  }
  const room = currentRoom();
  if (bossFx.length && (!room.boss || room.boss.hp <= 0)) clearBossFx();
  for (const fx of bossFx) {
    fx.t += dt;
    fx.life -= dt;
    const def = FX[fx.kind];
    if (def.update && fx.life > 0) def.update(fx, dt);
    if (fx.life <= 0 && def.end && !fx.ended) {
      fx.ended = true;
      def.end(fx);
    }
  }
  for (let i = bossFx.length - 1; i >= 0; i -= 1) {
    if (bossFx[i].life <= 0) bossFx.splice(i, 1);
  }
}

function drawBossFx(ground) {
  for (const fx of bossFx) {
    const def = FX[fx.kind];
    if (Boolean(def.ground) === ground) def.draw(fx);
  }
}

// A circle on the floor that hurts after a warning. style picks the picture.
function warnCircle(x, y, r, warn, damage, style, extra = {}) {
  return addFx(Object.assign({ kind: "pop", x, y, r, life: warn, damage, style, how: "zone" }, extra));
}

// A line that hurts after a warning (lasers, arrows, whips).
function warnLine(x1, y1, x2, y2, width, warn, damage, style, extra = {}) {
  return addFx(Object.assign({ kind: "line", x1, y1, x2, y2, width, life: warn + 0.25, warn, damage, style, how: "zone", hit: new Set() }, extra));
}

// A patch on the floor that stays: fire burns, webs and slime slow you down.
const ZONE_LOOK = {
  fire: { slow: 1, tick: 0.5, dmg: 0.35 },
  web: { slow: 0.45, tick: 0, dmg: 0 },
  slime: { slow: 0.55, tick: 0, dmg: 0 },
  spore: { slow: 0.6, tick: 0.6, dmg: 0.2 },
  poison: { slow: 0.85, tick: 0.5, dmg: 0.3 },
  mud: { slow: 0.6, tick: 0, dmg: 0 },
  spikes: { slow: 1, tick: 0.6, dmg: 0.5 }
};

function addZone(x, y, r, life, style, boss) {
  const look = ZONE_LOOK[style];
  const spot = inArena(x, y, 10);
  return addFx({ kind: "zone", x: spot.x, y: spot.y, r, life, style, slow: look.slow, tick: look.tick, damage: Math.max(1, Math.round((boss ? boss.damage : 10) * look.dmg)), cd: [0, 0], seed: Math.random() * 100 });
}

function playerSlow(p) {
  let slow = 1;
  for (const fx of bossFx) {
    if (fx.kind === "zone" && fx.slow < 1 && Math.hypot(p.x - fx.x, p.y - fx.y) < fx.r) slow = Math.min(slow, fx.slow);
  }
  if (p.chill > 0) {
    p.chill = Math.max(0, p.chill - (state.clock - (p.chillSeen || state.clock)) / 2.5);
    slow = Math.min(slow, 1 - 0.08 * Math.ceil(p.chill));
  }
  p.chillSeen = state.clock;
  return 1 - (1 - slow) * bossTune().slow;
}

/* ---------- things you can break ----------
   Eggs, coffins, mushrooms, mirrors and clones are real enemies, so all
   spells hit them. PROPS[kind] has update(prop, dt, room) and draw(prop). */

function addProp(boss, room, kind, x, y, options = {}) {
  const spot = inArena(x, y, 30);
  const prop = makeEnemy(boss.typeIndex >= 0 ? boss.typeIndex : 0, spot.x, spot.y, { tier: room.tier, temp: true });
  Object.assign(prop, {
    behavior: "bossprop",
    bossProp: kind,
    propOf: boss,
    homeX: spot.x,
    homeY: spot.y,
    name: options.name || "Trap",
    size: options.size || 24,
    maxHp: Math.max(4, Math.round(boss.maxHp * (options.hp || 0.02))),
    hitCooldown: 9,
    attackTimer: 99,
    born: state.clock,
    speed: options.speed || 0
  }, options.data || {});
  prop.hp = prop.maxHp;
  room.enemies.push(prop);
  return prop;
}

function propsOf(boss, kind) {
  return currentRoom().enemies.filter((enemy) => enemy.bossProp === kind && enemy.hp > 0 && enemy.propOf === boss);
}

function clearProps(boss) {
  for (const enemy of currentRoom().enemies) {
    if (enemy.bossProp && enemy.propOf === boss) enemy.hp = 0;
  }
}

const baseUpdateMinion = updateMinion;
updateMinion = function (enemy, dt, ux, uy, dist, step, room, target) {
  if (!enemy.bossProp) return baseUpdateMinion(enemy, dt, ux, uy, dist, step, room, target);
  enemy.hitCooldown = 9;
  const def = PROPS[enemy.bossProp];
  if (!enemy.propOf || enemy.propOf.hp <= 0) {
    enemy.hp = 0;
    return;
  }
  if (!def.moves) {
    enemy.x = enemy.homeX;
    enemy.y = enemy.homeY;
  }
  def.update(enemy, dt, room);
};

const baseDrawEnemy = drawEnemy;
drawEnemy = function (enemy) {
  if (enemy.bossProp) {
    PROPS[enemy.bossProp].draw(enemy);
    return;
  }
  baseDrawEnemy(enemy);
};

function popProp(prop) {
  prop.hp = 0;
  burst(prop.x, prop.y, [prop.type.color, "#ffffff", "#1d1a2f"], 14, 200);
  sfx.pop();
  const def = PROPS[prop.bossProp];
  if (def.pop) def.pop(prop);
}

/* ---------- hooks into the rest of the game ---------- */

function roomBossWithKit() {
  const boss = currentRoom().boss;
  return boss && boss.hp > 0 && kitFor(boss) ? boss : null;
}

// Is the wizard who's hitting the boss standing in front of it?
function hitFromFront(boss) {
  const p = nearestPlayer(boss.x, boss.y);
  const brain = boss.brain;
  const face = brain ? brain.face : angleTo(boss, p);
  const diff = Math.atan2(Math.sin(angleTo(boss, p) - face), Math.cos(angleTo(boss, p) - face));
  return Math.abs(diff) < 1.2;
}

const baseDamageEnemy = damageEnemy;
damageEnemy = function (enemy, amount, source = "staff") {
  if (enemy.hp > 0 && enemy.isBoss && enemy.state === "sig" && enemy.sigInvuln) {
    if (state.clock > (enemy.immuneText || 0)) {
      enemy.immuneText = state.clock + 0.6;
      floatText(enemy.x, enemy.y - enemy.size, "Immune!", "#c9c4d2", 14);
    }
    return;
  }
  const kit = kitFor(enemy);
  if (kit && enemy.hp > 0 && enemy.brain) {
    const brain = enemy.brain;
    const dot = source === "burn" || source === "poison";
    brain.lastHit = state.clock;
    if (kit.passive === "counter" && brain.shieldUp && !dot && hitFromFront(enemy)) {
      shieldBlock(enemy);
      return;
    }
    if (kit.passive === "stonefront" && !dot && hitFromFront(enemy)) {
      amount *= easyMode() ? 0.6 : 0.3;
      if (state.clock > (brain.tinkAt || 0)) {
        brain.tinkAt = state.clock + 0.5;
        floatText(enemy.x, enemy.y - enemy.size, "Tink! Hit his back!", "#b3bccb", 13);
      }
    }
    if (kit.passive === "rubbery" && source === "staff" && Math.random() < 0.25 && state.clock > (brain.bounceAt || 0)) {
      brain.bounceAt = state.clock + 0.35;
      const p = nearestPlayer(enemy.x, enemy.y);
      shotFrom(enemy.x, enemy.y, angleTo(enemy, p), bulletSpeed(currentRoom()) * 1.1, Math.round(enemy.damage * 0.6), { color: "#65d66b", r: 7 });
      floatText(enemy.x, enemy.y - enemy.size, "Boing!", "#65d66b", 13);
    }
    if (propsOf(enemy, "orbitbat").length) {
      if (state.clock > (enemy.immuneText || 0)) {
        enemy.immuneText = state.clock + 0.6;
        floatText(enemy.x, enemy.y - enemy.size, "Bats shield him!", "#e0457f", 14);
      }
      return;
    }
    if (!dot && propsOf(enemy, "orbit").length) {
      amount *= 0.3;
      if (Math.random() < 0.15) floatText(enemy.x, enemy.y - enemy.size, "Shielded!", BX.v3, 13);
    }
    if (!dot && state.clock < (brain.reflectUntil || 0)) {
      // Refraction: most of the hit bounces back at you.
      const p = nearestPlayer(enemy.x, enemy.y);
      shotFrom(enemy.x, enemy.y, angleTo(enemy, p), bulletSpeed(currentRoom()) * 1.1, Math.round(Math.min(amount, enemy.damage) * 0.6), { color: BX.v3, r: 7 });
      amount *= 0.25;
    }
    if (kit.passive === "rage" && !dot) brain.rage = Math.min(1, brain.rage + (amount / enemy.maxHp) * 6);
    if (brain.puff !== undefined) brain.puff += amount;
  }
  if (enemy.bossProp && PROPS[enemy.bossProp].hit) PROPS[enemy.bossProp].hit(enemy, amount, source);
  return baseDamageEnemy(enemy, amount, source);
};

const baseDefeatEnemy = defeatEnemy;
defeatEnemy = function (enemy) {
  if (enemy.bossProp) {
    popProp(enemy);
    return;
  }
  const kit = kitFor(enemy);
  if (kit && kit.passive === "fakedeath" && enemy.brain && !enemy.brain.rebuilt) {
    enemy.brain.rebuilt = true;
    enemy.hp = 1;
    clearSig(enemy);
    startSig(enemy, "rebuild", currentRoom());
    return;
  }
  if (kit) {
    clearProps(enemy);
    clearBossFx();
    if (enemy.brain) enemy.size = enemy.brain.baseSize;
  }
  return baseDefeatEnemy(enemy);
};

const baseHurtPlayer = hurtPlayer;
hurtPlayer = function (p, amount, fromX, fromY, attacker = null) {
  const before = p.hp;
  const result = baseHurtPlayer(p, amount, fromX, fromY, attacker);
  const boss = before > p.hp ? roomBossWithKit() : null;
  if (boss) {
    const kit = kitFor(boss);
    if (kit.passive === "lifesteal" || (boss.brain && state.clock < (boss.brain.bloodUntil || 0))) {
      const heal = Math.round((before - p.hp) * (easyMode() ? 0.6 : 1.5));
      boss.hp = Math.min(boss.maxHp, boss.hp + heal);
      floatText(boss.x, boss.y - boss.size, `+${heal}`, "#e0457f", 14);
    }
    if (kit.passive === "chill") {
      p.chill = Math.min(4, (p.chill || 0) + 1);
      p.chillSeen = state.clock;
      burst(p.x, p.y, ["#bdf1ff", "#ffffff"], 6, 90);
    }
  }
  return result;
};

const baseUpdatePlayer = updatePlayer;
updatePlayer = function (p, dt) {
  const slow = bossFx.length || p.chill > 0 ? playerSlow(p) : 1;
  const icy = bossFx.some((fx) => fx.kind === "icefloor") && p.hp > 0 && !(p.dashTime > 0);
  const fromX = p.x;
  const fromY = p.y;
  const room = state.roomIndex;
  const speed = stats.speed;
  stats.speed = speed * Math.min(1, slow);
  let result;
  try {
    result = baseUpdatePlayer(p, dt);
  } finally {
    stats.speed = speed;
  }
  if (icy && !result && room === state.roomIndex && dt > 0) {
    // Absolute Zero: you keep sliding and turn slowly, like on real ice.
    const k = Math.min(1, dt * (easyMode() ? 4 : 2));
    p.slideX = (p.slideX || 0) + ((p.x - fromX) / dt - (p.slideX || 0)) * k;
    p.slideY = (p.slideY || 0) + ((p.y - fromY) / dt - (p.slideY || 0)) * k;
    p.x = fromX;
    p.y = fromY;
    moveWithWalls(p, p.r, p.slideX * dt, p.slideY * dt, false);
    pushOutOfCrates(p, p.r);
  } else {
    p.slideX = 0;
    p.slideY = 0;
  }
  return result;
};

const baseCastSpell = castSpell;
castSpell = function (p, index) {
  if (typeof p === "number") {
    index = p;
    p = player;
  }
  if (p && state.clock < (p.silencedUntil || 0) && state.mode === "playing") {
    if (state.clock > (p.silenceText || 0)) {
      p.silenceText = state.clock + 0.6;
      floatText(p.x, p.y - 44, "Silenced!", "#e0457f", 16);
    }
    sfx.nope();
    return;
  }
  const spell = spells[index];
  const before = spell && p ? p.cooldowns[spell.id] || 0 : 0;
  const result = baseCastSpell(p, index);
  if (spell && p && (p.cooldowns[spell.id] || 0) > before) state.bossLastSpell = spell.id;
  return result;
};

const baseMeleeHit = meleeHit;
meleeHit = function (boss, swing) {
  baseMeleeHit(boss, swing);
  const kit = kitFor(boss);
  if (!kit || !boss.brain) return;
  const angle = Math.atan2(boss.lockY, boss.lockX);
  if (kit.passive === "shardslash") {
    // Crystal slashes leave shards hanging in the air for a moment.
    for (const k of [-0.7, 0, 0.7]) {
      const reach = swingReach(boss, swing.kind) * 0.85;
      addFx({ kind: "shard", x: boss.x + Math.cos(angle + k) * reach, y: boss.y + Math.sin(angle + k) * reach, life: easyMode() ? 0.7 : 1.3, damage: Math.round(boss.damage * 0.5), cd: [0, 0] });
    }
  }
  if (state.clock < (boss.brain.echoUntil || 0)) {
    addFx({ kind: "echo", x: boss.x, y: boss.y, lockX: boss.lockX, lockY: boss.lockY, size: boss.size, damage: Math.round(boss.damage * 0.8), swing: Object.assign({}, swing, { unparry: false }), life: 0.9, type: boss.type });
  }
};

const baseStunEnemy = stunEnemy;
stunEnemy = function (enemy, seconds) {
  const kit = kitFor(enemy);
  if (kit && kit.passive === "relentless") seconds = Math.min(seconds, easyMode() ? 0.9 : 0.45);
  if (enemy.sig) clearSig(enemy);
  return baseStunEnemy(enemy, seconds);
};

const baseResetBoss = resetBoss;
resetBoss = function (room) {
  const boss = room.boss;
  if (boss && boss.brain) {
    boss.size = boss.brain.baseSize;
    boss.speed /= boss.brain.speedMult || 1;
    boss.damage /= boss.brain.dmgMult || 1;
  }
  if (boss) {
    clearSig(boss);
    boss.brain = null;
  }
  clearBossFx();
  return baseResetBoss(room);
};

const baseUpdateEffects = updateEffects;
updateEffects = function (dt) {
  baseUpdateEffects(dt);
  updateBossFx(dt);
};

const baseDrawEffects = drawEffects;
drawEffects = function () {
  baseDrawEffects();
  drawBossFx(false);
  const boss = roomBossWithKit();
  if (boss && boss.state === "sig" && boss.sig && SIGS[boss.sig.id].draw) SIGS[boss.sig.id].draw(boss, boss.sig);
};

const baseDrawFoes = drawFoes;
drawFoes = function (room) {
  drawBossFx(true);
  const boss = room && room.boss;
  const kit = kitFor(boss);
  if (kit && boss.hp > 0 && boss.state === "sig" && boss.sigHidden) {
    room.boss = null;
    try {
      baseDrawFoes(room);
    } finally {
      room.boss = boss;
    }
  } else {
    baseDrawFoes(room);
  }
  if (kit && boss.hp > 0 && boss.brain) drawPassiveMarks(boss, kit, boss.brain);
};

/* ---------- pixel drawing for boss effects ----------
   Same rules as sprites.js: 2x pixels on one grid, navy outlines, colors from
   the shared ramps, no blur or filters. */

const BX = {
  out: "#1d1a2f", wh: "#f4f4f8",
  r0: "#5c1f3a", r1: "#9e2f4a", r2: "#d6455d", r3: "#f2808a",
  y0: "#a35a26", y1: "#e08a2e", y2: "#f5c542", y3: "#fff0a3",
  s0: "#221f36", s1: "#3a3854", s2: "#59597a", s3: "#8189a3", s4: "#b3bccb", s5: "#e1e7ea",
  g1: "#28553a", g2: "#367540", g3: "#4a9446", g4: "#68b350", g5: "#a5d65e",
  L1: "#1f4a3a", L2: "#2c6b40", L3: "#43914a", L4: "#6fbb55", L5: "#b4e176",
  d0: "#3a2430", d1: "#5b3934", d2: "#87573b", d3: "#b07e4e", d4: "#d4a96f", d5: "#efd29b",
  w1: "#1f3c73", w2: "#2862a8", w3: "#3a8fd0", w4: "#78c9ea", w5: "#e6f5f0",
  W1: "#b4bad4", W2: "#f2f3f8", H2: "#3d58d0", H3: "#6a92f2", p1: "#c2549a", p2: "#f08fc0",
  v0: "#3b2470", v1: "#5b3fb8", v2: "#8f6cff", v3: "#d6c7ff"
};

function block(x, y, size, color) {
  ctx.fillStyle = color;
  ctx.fillRect(snap(x - size / 2), snap(y - size / 2), size, size);
}

// A ring of blocks. dash > 0 leaves gaps that march around.
function blockRing(x, y, r, color, size = 4, dash = 0, march = 0) {
  const n = Math.max(10, Math.floor((Math.PI * 2 * r) / (size * 1.4)));
  for (let i = 0; i < n; i += 1) {
    if (dash && (i + Math.floor(march)) % (dash * 2) >= dash) continue;
    const a = (i / n) * Math.PI * 2;
    block(x + Math.cos(a) * r, y + Math.sin(a) * r, size, color);
  }
}

// A filled oval drawn as 2-pixel rows, so its edge steps like pixel art.
function blockDisc(x, y, r, color, squash = 1) {
  ctx.fillStyle = color;
  const rows = Math.ceil((r * squash) / PX);
  for (let i = -rows; i <= rows; i += 1) {
    const dy = (i * PX) / squash;
    const w = Math.sqrt(Math.max(0, r * r - dy * dy));
    if (w < 1) continue;
    ctx.fillRect(snap(x - w), snap(y + i * PX), snap(w * 2), PX);
  }
}

function blockLine(x1, y1, x2, y2, color, size = 4) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(len / (size * 0.8)));
  ctx.fillStyle = color;
  for (let i = 0; i <= steps; i += 1) {
    const k = i / steps;
    ctx.fillRect(snap(x1 + (x2 - x1) * k - size / 2), snap(y1 + (y2 - y1) * k - size / 2), size, size);
  }
}

// The warning every floor attack shows: a navy ring with a red dashed ring
// that marches, blinking white when it's about to hit.
function warnRing(x, y, r, k) {
  const blink = k > 0.7 && Math.floor(state.anim * 16) % 2 === 0;
  blockRing(x, y, r, BX.out, 6);
  blockRing(x, y, r, blink ? BX.wh : BX.r2, 4, 3, state.anim * 10);
  const s = 4 + Math.round(k * 4) * 2;
  block(x, y, s + 4, BX.out);
  block(x, y, s, blink ? BX.wh : BX.r2);
}

function sprite(key, rows, pal) {
  return pixelSheet(`boss-${key}`, rows, Object.assign({ o: BX.out }, pal));
}

function drawSprite(key, rows, pal, x, y, flip = false) {
  const sheet = sprite(key, rows, pal);
  blit2(ctx, sheet, x - sheet.width, y - sheet.height * PX, flip);
}

const SPIKE_ROWS = ["  oo  ", " oLLo ", " oLlo ", "oLLlLo", "oLllLo", "oLlllo", "oLLllo", "oooooo"];
const HAND_ROWS = [" o o o  ", "oGoGoGo ", "oGGGGGoo", "oGGGGGGo", " oGGGGo ", "  oGgo  ", "  oGgo  ", " oddddo "];
const EGG_ROWS = ["  oooooo  ", " oWWWWWWo ", "oWWrWWWWWo", "oWWWWWrWWo", "oWrWWWWWWo", "oWWWWrWWWo", "oWWWWWWWWo", " oWWWWWWo ", "  oooooo  "];
const SHROOM_ROWS = ["  oooooo  ", " orrRrrro ", "orRrrrrRro", "orrrrRrrro", "oooooooooo", "   oWWo   ", "   oWWo   ", "  oWWWWo  ", "  oooooo  "];
const MINE_ROWS = ["   oo   ", " oooooo ", "oddDdddo", "odDdddDo", "oddddddo", " oooooo "];
const COFFIN_ROWS = ["   oooooo   ", "  oyyyyyyo  ", " oyyKKKKyyo ", " oyKoKKoKyo ", " oyKKKKKKyo ", " oyyKKKKyyo ", "oyHHyyyyHHyo", "oyHHHyyHHHyo", "oyyHHHHHHyyo", "oyyyyyyyyyyo", "oyHyHyHyHyyo", "oyyyyyyyyyyo", " oyHyHyHyHo ", " oyyyyyyyyo ", " oyHyHyHyyo ", "  oyyyyyyo  ", "  oyyyyyyo  ", "   oooooo   "];
const CRYSTAL_ROWS = ["  oo  ", " oWPo ", " oWPo ", "oWWPPo", "oWPPPo", "oWPPPo", "oWPPpo", " oPpo ", " oPpo ", "  oo  "];
const MIRROR_ROWS = (() => {
  const rows = [];
  for (let y = 0; y < 20; y += 1) {
    let row = "";
    for (let x = 0; x < 12; x += 1) {
      const edge = y === 0 || y === 19 || x === 0 || x === 11;
      const frame = y === 1 || y === 18 || x === 1 || x === 10;
      const shine = (x - y + 20) % 9 === 0 && !frame;
      row += edge ? ((x === 0 || x === 11) && (y === 0 || y === 19) ? " " : "o") : frame ? "F" : shine ? "S" : y < 6 ? "G" : "g";
    }
    rows.push(row);
  }
  return rows;
})();

function drawFlame(x, y, size, seed) {
  const f = Math.floor(state.anim * 10 + seed) % 3;
  const h = size + (f === 1 ? 2 : f === 2 ? -2 : 0);
  ctx.fillStyle = BX.out;
  ctx.fillRect(snap(x - size / 2 - 2), snap(y - h - 2), size + 4, h + 4);
  ctx.fillStyle = BX.r1;
  ctx.fillRect(snap(x - size / 2), snap(y - h), size, h);
  ctx.fillStyle = BX.y1;
  ctx.fillRect(snap(x - size / 2 + 2), snap(y - h * 0.7), size - 4, h * 0.7);
  ctx.fillStyle = BX.y3;
  ctx.fillRect(snap(x - 1 + (f - 1) * 2), snap(y - h * 0.4), 2, h * 0.4);
}

/* ---------- the effect kinds ---------- */

const POP_LOOK = {
  hand: { rows: HAND_ROWS, pal: { G: BX.g3, g: BX.g2, d: BX.d1 } },
  thorn: { rows: SPIKE_ROWS, pal: { L: BX.L3, l: BX.L5 } },
  ice: { rows: SPIKE_ROWS, pal: { L: BX.w4, l: BX.w5 } },
  bone: { rows: SPIKE_ROWS, pal: { L: BX.W1, l: BX.W2 } },
  crystal: { rows: CRYSTAL_ROWS, pal: { W: BX.v3, P: BX.v2, p: BX.v1 } }
};

const FX = {
  // A circle that hurts when its timer runs out.
  pop: {
    ground: true,
    draw(fx) {
      const k = 1 - fx.life / fx.max;
      warnRing(fx.x, fx.y, fx.r, k);
      if (fx.style === "fireball" || fx.style === "rock" || fx.style === "mud") {
        // Something is flying in: it arcs from where it was thrown (or the ceiling).
        const sx = fx.sx !== undefined ? fx.sx : fx.x;
        const sy = fx.sy !== undefined ? fx.sy : fx.y - 400;
        const bx = sx + (fx.x - sx) * k;
        const by = sy + (fx.y - sy) * k - Math.sin(k * Math.PI) * (fx.sx !== undefined ? 160 : 0);
        const color = fx.style === "fireball" ? BX.y1 : fx.style === "mud" ? BX.d2 : BX.s3;
        blockDisc(bx, by, 13, BX.out);
        blockDisc(bx, by, 10, color);
        block(bx - 3, by - 3, 4, fx.style === "fireball" ? BX.y3 : BX.s5);
      }
    },
    end(fx) {
      hitCircle(fx.x, fx.y, fx.r, fx.damage, fx.boss, fx.how);
      const colors = { fire: [BX.y1, BX.r2, BX.y3], fireball: [BX.y1, BX.r2, BX.y3], rock: [BX.s3, BX.s2, BX.d2], mud: [BX.d2, BX.d3, BX.d1], geyser: [BX.d2, BX.d3, BX.w4], hand: [BX.d1, BX.g3], thorn: [BX.L3, BX.L5], ice: [BX.w4, BX.wh], bone: [BX.W1, BX.wh], crystal: [BX.v2, BX.v3], curse: [BX.v2, BX.p2], blood: [BX.r1, BX.r2, BX.r0] }[fx.style] || [BX.wh, BX.r2];
      burst(fx.x, fx.y, colors, 10, 170);
      if (fx.style !== "hand" && fx.style !== "thorn") addShake(2);
      if (POP_LOOK[fx.style] || fx.style === "geyser") addFx({ kind: "flash", x: fx.x, y: fx.y, style: fx.style, life: 0.4, r: fx.r });
      if (fx.after) fx.after(fx);
    }
  },
  // The picture left after a pop: a hand, thorns, spikes or a mud geyser.
  flash: {
    ground: true,
    draw(fx) {
      const k = fx.t / fx.max;
      if (fx.style === "geyser") {
        const h = Math.sin(Math.min(1, k * 2.5) * Math.PI * 0.5) * 70 * (1 - k * 0.6);
        ctx.fillStyle = BX.out;
        ctx.fillRect(snap(fx.x - 14), snap(fx.y - h - 2), 28, h + 4);
        ctx.fillStyle = BX.d2;
        ctx.fillRect(snap(fx.x - 12), snap(fx.y - h), 24, h);
        ctx.fillStyle = BX.d3;
        ctx.fillRect(snap(fx.x - 6), snap(fx.y - h), 6, h);
        return;
      }
      const look = POP_LOOK[fx.style];
      const rise = Math.min(1, k * 4);
      const spots = fx.style === "hand" ? [[0, 0]] : [[-10, 4], [8, -2], [0, 8]];
      for (const [ox, oy] of spots) {
        drawSprite(fx.style, look.rows, look.pal, fx.x + ox, fx.y + oy + (1 - rise) * 10);
      }
    }
  },
  // A line that hurts after a warning: lasers, arrows, whips, lightning.
  line: {
    update(fx) {
      if (!fx.fired && fx.t >= fx.warn) {
        fx.fired = true;
        if (fx.style === "laser" || fx.style === "zap") addShake(3);
        for (const p of livingPlayers()) {
          if (segmentDistance(p.x, p.y, fx.x1, fx.y1, fx.x2, fx.y2) > fx.width / 2 + p.r * 0.5) continue;
          const result = strike(p, fx.damage, fx.x1, fx.y1, fx.boss, fx.how);
          if (fx.onHit && result && result !== "dodge" && result !== "parry") fx.onHit(p);
        }
        if (fx.after) fx.after(fx);
      }
    },
    draw(fx) {
      const { x1, y1, x2, y2 } = fx;
      if (!fx.fired) {
        const k = fx.t / Math.max(0.01, fx.warn);
        const blink = k > 0.7 && Math.floor(state.anim * 16) % 2 === 0;
        const len = Math.hypot(x2 - x1, y2 - y1);
        const n = Math.floor(len / 14);
        for (let i = 0; i < n; i += 1) {
          if ((i + Math.floor(state.anim * 12)) % 3 === 0) continue;
          const kk = i / n;
          block(x1 + (x2 - x1) * kk, y1 + (y2 - y1) * kk, 6, BX.out);
          block(x1 + (x2 - x1) * kk, y1 + (y2 - y1) * kk, 4, blink ? BX.wh : BX.r2);
        }
        return;
      }
      const fade = 1 - (fx.t - fx.warn) / 0.25;
      if (fade <= 0) return;
      const w = Math.max(4, snap(fx.width * fade));
      const looks = {
        laser: [BX.v1, BX.v3], zap: [BX.y2, BX.y3], arrow: [BX.d3, BX.W2], wrap: [BX.d4, BX.d5], dark: [BX.v0, BX.v2], bone: [BX.W1, BX.W2], fire: [BX.y1, BX.y3]
      }[fx.style] || [BX.r2, BX.wh];
      blockLine(x1, y1, x2, y2, BX.out, w + 4);
      blockLine(x1, y1, x2, y2, looks[0], w);
      blockLine(x1, y1, x2, y2, looks[1], Math.max(2, snap(w / 3)));
      if (fx.style === "arrow") {
        const a = Math.atan2(y2 - y1, x2 - x1);
        for (let i = 0; i < 4; i += 1) {
          const kk = (i + 0.5) / 4;
          const ax = x1 + (x2 - x1) * kk;
          const ay = y1 + (y2 - y1) * kk;
          block(ax + Math.cos(a) * 8, ay + Math.sin(a) * 8, 6, BX.s4);
        }
      }
    }
  },
  // A patch on the floor that stays a while.
  zone: {
    ground: true,
    update(fx, dt) {
      if (!fx.tick) return;
      for (const p of livingPlayers()) {
        fx.cd[p.index] = Math.max(0, fx.cd[p.index] - dt);
        if (fx.cd[p.index] > 0 || Math.hypot(p.x - fx.x, p.y - fx.y) > fx.r) continue;
        fx.cd[p.index] = fx.tick;
        strike(p, fx.damage, fx.x, fx.y, null, "zone");
      }
    },
    draw(fx) {
      const fade = fx.life < 0.5 ? fx.life / 0.5 : 1;
      const r = fx.r * (fx.t < 0.15 ? fx.t / 0.15 : 1) * (0.6 + 0.4 * fade);
      if (fx.style === "fire") {
        blockDisc(fx.x, fx.y, r, BX.d0, 0.6);
        for (let i = 0; i < 3; i += 1) {
          const a = fx.seed + i * 2.1;
          drawFlame(fx.x + Math.cos(a) * r * 0.45, fx.y + Math.sin(a) * r * 0.25, 8, fx.seed + i);
        }
      } else if (fx.style === "web") {
        for (let i = 0; i < 8; i += 1) {
          const a = (i / 8) * Math.PI * 2 + fx.seed;
          blockLine(fx.x, fx.y + 2, fx.x + Math.cos(a) * r, fx.y + Math.sin(a) * r * 0.7 + 2, BX.s1, 2);
          blockLine(fx.x, fx.y, fx.x + Math.cos(a) * r, fx.y + Math.sin(a) * r * 0.7, BX.s4, 2);
        }
        for (const k of [0.4, 0.75, 1]) {
          for (let i = 0; i < 8; i += 1) {
            const a = (i / 8) * Math.PI * 2 + fx.seed;
            const b = ((i + 1) / 8) * Math.PI * 2 + fx.seed;
            blockLine(fx.x + Math.cos(a) * r * k, fx.y + Math.sin(a) * r * k * 0.7, fx.x + Math.cos(b) * r * k, fx.y + Math.sin(b) * r * k * 0.7, BX.s5, 2);
          }
        }
      } else {
        const ramp = { slime: [BX.g1, BX.g3, BX.g5], mud: [BX.d0, BX.d2, BX.d3], poison: [BX.L1, BX.L2, BX.L5], spore: [BX.r0, BX.p1, BX.p2], spikes: [BX.s1, BX.s2, BX.W2] }[fx.style];
        blockDisc(fx.x, fx.y, r, ramp[0], 0.6);
        blockDisc(fx.x, fx.y - 2, r - 4, ramp[1], 0.6);
        for (let i = 0; i < 4; i += 1) {
          const a = fx.seed + i * 1.7;
          const bob = fx.style === "poison" || fx.style === "spore" ? ((state.anim * 20 + i * 9) % 16) : 0;
          block(fx.x + Math.cos(a) * r * 0.5, fx.y + Math.sin(a) * r * 0.28 - bob, 4, ramp[2]);
        }
      }
    }
  },
  // Something that rolls or flies and hurts on touch: boulders, web balls.
  mover: {
    update(fx, dt) {
      fx.x += fx.vx * dt;
      fx.y += fx.vy * dt;
      fx.travel = (fx.travel || 0) + Math.hypot(fx.vx, fx.vy) * dt;
      fx.spin = (fx.spin || 0) + dt * 8;
      if (fx.trail) fx.trail(fx);
      const hitX = fx.x < TILE + fx.r || fx.x > WIDTH - TILE - fx.r;
      const hitY = fx.y < TILE + fx.r || fx.y > HEIGHT - TILE - fx.r;
      if (hitX || hitY) {
        if (fx.bounces > 0) {
          fx.bounces -= 1;
          if (hitX) fx.vx *= -1;
          if (hitY) fx.vy *= -1;
          fx.x = clamp(fx.x, TILE + fx.r, WIDTH - TILE - fx.r);
          fx.y = clamp(fx.y, TILE + fx.r, HEIGHT - TILE - fx.r);
          addShake(4);
          sfx.slam();
        } else {
          fx.life = 0;
          return;
        }
      }
      if (fx.range && fx.travel >= fx.range) {
        fx.life = 0;
        return;
      }
      for (const p of livingPlayers()) {
        fx.cd[p.index] = Math.max(0, fx.cd[p.index] - dt);
        if (fx.cd[p.index] > 0 || Math.hypot(p.x - fx.x, p.y - fx.y) > fx.r + p.r * 0.6) continue;
        fx.cd[p.index] = 0.8;
        strike(p, fx.damage, fx.x, fx.y, null, "zone");
        if (fx.stopOnHit) fx.life = 0;
      }
    },
    end(fx) {
      if (fx.after) fx.after(fx);
    },
    draw(fx) {
      if (fx.style === "boulder") {
        blockDisc(fx.x, fx.y + fx.r * 0.7, fx.r, BX.s0, 0.35);
        blockDisc(fx.x, fx.y, fx.r + 2, BX.out);
        blockDisc(fx.x, fx.y, fx.r, BX.s2);
        blockDisc(fx.x - fx.r * 0.25, fx.y - fx.r * 0.25, fx.r * 0.55, BX.s3);
        for (let i = 0; i < 3; i += 1) {
          const a = fx.spin + i * 2.1;
          block(fx.x + Math.cos(a) * fx.r * 0.6, fx.y + Math.sin(a) * fx.r * 0.6, 4, BX.s1);
        }
      } else if (fx.style === "fist") {
        blockDisc(fx.x, fx.y, fx.r + 2, BX.out);
        blockDisc(fx.x, fx.y, fx.r, BX.d1);
        blockDisc(fx.x - 4, fx.y - 4, fx.r * 0.6, BX.d2);
        for (let i = -1; i <= 1; i += 1) block(fx.x + i * 8 + Math.sign(fx.vx) * 10, fx.y - 6, 6, BX.y1);
      } else {
        blockDisc(fx.x, fx.y, fx.r + 2, BX.out);
        blockDisc(fx.x, fx.y, fx.r, BX.s4);
        block(fx.x - 2, fx.y - 2, 4, BX.s5);
      }
    }
  },
  // Ring of Fire: closes in on you with one turning gap.
  firering: {
    update(fx, dt) {
      const k = Math.min(1, fx.t / fx.max);
      fx.radius = fx.r0 + (fx.r1 - fx.r0) * k;
      fx.gap += fx.spin * dt;
      for (const p of livingPlayers()) {
        fx.cd[p.index] = Math.max(0, fx.cd[p.index] - dt);
        const d = Math.hypot(p.x - fx.x, p.y - fx.y);
        if (fx.cd[p.index] > 0 || Math.abs(d - fx.radius) > 14 + p.r * 0.4) continue;
        const a = Math.atan2(p.y - fx.y, p.x - fx.x);
        if (Math.abs(Math.atan2(Math.sin(a - fx.gap), Math.cos(a - fx.gap))) < fx.gapSize / 2) continue;
        fx.cd[p.index] = 0.6;
        strike(p, fx.damage, fx.x, fx.y, null, "zone");
      }
    },
    draw(fx) {
      const r = fx.radius || fx.r0;
      const n = Math.floor((Math.PI * 2 * r) / 18);
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * Math.PI * 2;
        if (Math.abs(Math.atan2(Math.sin(a - fx.gap), Math.cos(a - fx.gap))) < fx.gapSize / 2) continue;
        drawFlame(fx.x + Math.cos(a) * r, fx.y + Math.sin(a) * r + 6, 12, i * 3.7);
      }
    }
  },
  // Crystal shards a sword slash leaves hanging in the air.
  shard: {
    update(fx, dt) {
      for (const p of livingPlayers()) {
        fx.cd[p.index] = Math.max(0, fx.cd[p.index] - dt);
        if (fx.cd[p.index] > 0 || Math.hypot(p.x - fx.x, p.y - fx.y) > 14 + p.r * 0.5) continue;
        fx.cd[p.index] = 0.8;
        strike(p, fx.damage, fx.x, fx.y, null, "zone");
      }
    },
    draw(fx) {
      const look = POP_LOOK.crystal;
      drawSprite("crystal", look.rows, look.pal, fx.x, fx.y + 10 + Math.sin(state.anim * 6 + fx.x) * 2);
    }
  },
  // The Shadow Shifter's sword swings again a moment later from where it was.
  echo: {
    draw(fx) {
      if (Math.floor(state.anim * 12) % 2) return;
      blockRing(fx.x, fx.y, fx.size * 0.5, BX.v1, 4, 2, state.anim * 8);
    },
    end(fx) {
      baseMeleeHit({ x: fx.x, y: fx.y, lockX: fx.lockX, lockY: fx.lockY, size: fx.size, damage: fx.damage, type: fx.type, shotColor: BX.v2, hp: 0 }, fx.swing);
    }
  },
  // Pharaoh's curse rides on your head, then sinks to the floor and explodes.
  curse: {
    update(fx) {
      if (fx.life > fx.lock) {
        fx.x = fx.p.x;
        fx.y = fx.p.y;
      }
    },
    draw(fx) {
      const locked = fx.life <= fx.lock;
      if (locked) warnRing(fx.x, fx.y, fx.r, 1 - fx.life / fx.lock);
      const y = locked ? fx.y : fx.y - 52;
      const spin = state.anim * 4;
      for (let i = 0; i < 6; i += 1) {
        const a = spin + (i / 6) * Math.PI * 2;
        block(fx.x + Math.cos(a) * 14, y + Math.sin(a) * 6, 6, BX.out);
        block(fx.x + Math.cos(a) * 14, y + Math.sin(a) * 6, 4, BX.v2);
      }
      block(fx.x, y, 8, BX.out);
      block(fx.x, y, 4, BX.y2);
      if (!locked) outlinedText(String(Math.ceil(fx.life - fx.lock)), fx.x, y - 14, { size: 14, align: "center", font: DISPLAY_FONT, color: "#d6c7ff" });
    },
    end(fx) {
      hitCircle(fx.x, fx.y, fx.r, fx.damage, null, "unblock");
      burst(fx.x, fx.y, [BX.v2, BX.d4, BX.y2], 18, 240);
      addShake(5);
      sfx.boom();
    }
  },
  // A thorny root snaking along the floor. When it stops, thorns burst up along it.
  vine: {
    ground: true,
    update(fx, dt) {
      const target = nearestPlayer(fx.x, fx.y);
      fx.angle = turnToward(fx.angle, angleTo(fx, target), dt * 1.4);
      const step = fx.speed * dt;
      fx.x += Math.cos(fx.angle) * step;
      fx.y += Math.sin(fx.angle) * step;
      fx.travel += step;
      if (fx.travel - fx.lastPoint >= 34) {
        fx.lastPoint = fx.travel;
        fx.points.push({ x: fx.x, y: fx.y });
      }
      const wall = fx.x < TILE + 20 || fx.x > WIDTH - TILE - 20 || fx.y < TILE + 20 || fx.y > HEIGHT - TILE - 20;
      if (wall || fx.travel >= fx.reach) fx.life = 0;
    },
    end(fx) {
      fx.points.forEach((point, i) => warnCircle(point.x, point.y, 26, 0.16 + i * 0.035, fx.damage, "thorn"));
    },
    draw(fx) {
      let prev = fx.points[0] || fx;
      for (const point of fx.points) {
        blockLine(prev.x, prev.y + 2, point.x, point.y + 2, BX.L1, 6);
        blockLine(prev.x, prev.y, point.x, point.y, BX.L3, 4);
        block(point.x + 5, point.y - 4, 4, BX.L5);
        prev = point;
      }
      blockLine(prev.x, prev.y, fx.x, fx.y, BX.L3, 4);
    }
  },
  // Batula's scream: a ring of sound. If it hits you, no spells for a moment.
  screech: {
    update(fx, dt) {
      fx.radius += fx.speed * dt;
      for (const p of livingPlayers()) {
        if (fx.hit.has(p)) continue;
        if (Math.abs(Math.hypot(p.x - fx.x, p.y - fx.y) - fx.radius) > 14 + p.r * 0.5) continue;
        fx.hit.add(p);
        const result = strike(p, fx.damage, fx.x, fx.y, null, "zone");
        if (result === "hit" || result === "block") {
          p.silencedUntil = state.clock + (easyMode() ? 1.2 : 2.4);
          floatText(p.x, p.y - 50, "Silenced!", "#e0457f", 18);
        }
      }
    },
    draw(fx) {
      blockRing(fx.x, fx.y, fx.radius, BX.out, 8);
      blockRing(fx.x, fx.y, fx.radius, BX.p1, 4, 2, state.anim * 6);
      blockRing(fx.x, fx.y, fx.radius - 10, BX.p2, 2, 3, -state.anim * 6);
    }
  },
  // A crystal cage around where you stand. Get out before it closes.
  cage: {
    ground: true,
    update(fx, dt) {
      if (!fx.closed && fx.t >= fx.warn) {
        fx.closed = true;
        addShake(4);
        sfx.slam();
        for (const p of livingPlayers()) {
          if (Math.hypot(p.x - fx.x, p.y - fx.y) < fx.r + 8) strike(p, fx.damage, fx.x, fx.y, null, "zone");
        }
      }
      if (fx.closed) {
        for (const p of livingPlayers()) {
          fx.cd[p.index] = Math.max(0, fx.cd[p.index] - dt);
          if (fx.cd[p.index] > 0 || Math.abs(Math.hypot(p.x - fx.x, p.y - fx.y) - fx.r) > 16) continue;
          fx.cd[p.index] = 0.7;
          strike(p, fx.damage * 0.5, fx.x, fx.y, null, "zone");
        }
      }
    },
    end(fx) {
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        shotFrom(fx.x + Math.cos(a) * fx.r, fx.y + Math.sin(a) * fx.r, a, bulletSpeed(currentRoom()) * 0.7, Math.round(fx.damage * 0.5), { color: BX.v3, r: 6 });
      }
    },
    draw(fx) {
      const k = Math.min(1, fx.t / fx.warn);
      if (!fx.closed) warnRing(fx.x, fx.y, fx.r, k);
      const look = POP_LOOK.crystal;
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        const grow = fx.closed ? 1 : k;
        if (grow < 0.3) continue;
        drawSprite("crystal", look.rows, look.pal, fx.x + Math.cos(a) * fx.r, fx.y + Math.sin(a) * fx.r + 10 + (1 - grow) * 12);
      }
    }
  },
  // A shadow copy that dashes along a line.
  dasher: {
    update(fx) {
      if (!fx.going && fx.t >= fx.warn) fx.going = true;
      if (fx.going) {
        const k = Math.min(1, (fx.t - fx.warn) / 0.28);
        fx.x = fx.sx + (fx.ex - fx.sx) * k;
        fx.y = fx.sy + (fx.ey - fx.sy) * k;
        for (const p of livingPlayers()) {
          if (fx.hit.has(p) || Math.hypot(p.x - fx.x, p.y - fx.y) > fx.size * 0.45 + p.r) continue;
          fx.hit.add(p);
          strike(p, fx.damage, fx.x, fx.y, null, "zone");
        }
        if (k >= 1) fx.life = Math.min(fx.life, 0.15);
      }
    },
    draw(fx) {
      if (!fx.going) {
        const n = Math.floor(Math.hypot(fx.ex - fx.sx, fx.ey - fx.sy) / 16);
        for (let i = 0; i < n; i += 2) {
          const k = i / n;
          block(fx.sx + (fx.ex - fx.sx) * k, fx.sy + (fx.ey - fx.sy) * k, 4, BX.v1);
        }
      }
      drawCopyOf(fx.boss, fx.x, fx.y, 0.75);
    }
  },
  // Darkness or a sandstorm: only a circle around each wizard stays clear.
  dark: {
    draw(fx) {
      const fade = Math.min(1, fx.t / 0.4, fx.life / 0.4);
      drawDarkness(fx.radius / Math.max(0.35, fade), fx.mode);
    }
  }
};

// Draw a boss somewhere else (clones, mirrors, shadow copies).
function drawCopyOf(boss, x, y, alpha = 1, size = boss && boss.size) {
  if (!boss || boss.hp <= 0) return;
  const saved = [boss.x, boss.y, boss.alpha, boss.state, boss.hop, boss.flash, boss.size];
  boss.x = x;
  boss.y = y;
  boss.alpha = alpha;
  boss.state = "move";
  boss.hop = 0;
  boss.flash = 0;
  boss.size = size;
  try {
    if (boss.isBig) drawBigBossFoe(boss);
    else baseDrawEnemy(boss);
  } finally {
    [boss.x, boss.y, boss.alpha, boss.state, boss.hop, boss.flash, boss.size] = saved;
    ctx.globalAlpha = 1;
  }
}

// One dark layer for the whole room, with a clear hole around each wizard.
// The hole's edge is a dithered checkerboard, like old pixel games.
const darkLayer = { canvas: null, holes: new Map() };
function darkHole(radius) {
  const key = Math.round(radius / 8) * 8;
  let hole = darkLayer.holes.get(key);
  if (hole) return hole;
  hole = document.createElement("canvas");
  hole.width = hole.height = key * 2;
  const g = hole.getContext("2d");
  g.fillStyle = "#000000";
  for (let y = 0; y < key * 2; y += 4) {
    for (let x = 0; x < key * 2; x += 4) {
      const d = Math.hypot(x + 2 - key, y + 2 - key);
      const edge = (key - d) / 28;
      if (edge >= 1 || (edge > 0.5 && (x + y) % 8 === 0) || (edge > 0 && (x % 8 === 0 && y % 8 === 0))) g.fillRect(x, y, 4, 4);
    }
  }
  darkLayer.holes.set(key, hole);
  return hole;
}

function drawDarkness(radius, mode) {
  if (!darkLayer.canvas) {
    darkLayer.canvas = document.createElement("canvas");
    darkLayer.canvas.width = WIDTH;
    darkLayer.canvas.height = HEIGHT;
  }
  const g = darkLayer.canvas.getContext("2d");
  g.globalCompositeOperation = "source-over";
  g.fillStyle = mode === "sand" ? BX.d2 : mode === "blood" ? BX.r0 : "#0d0b1a";
  g.fillRect(0, 0, WIDTH, HEIGHT);
  if (mode === "sand") {
    g.fillStyle = BX.d3;
    for (let i = 0; i < 70; i += 1) {
      const x = (i * 97 + state.anim * 160) % WIDTH;
      const y = (i * 53 + Math.sin(state.anim + i) * 20) % HEIGHT;
      g.fillRect(snap(x), snap(y), 6, 2);
    }
  }
  g.globalCompositeOperation = "destination-out";
  const hole = darkHole(radius);
  for (const p of livingPlayers()) g.drawImage(hole, snap(p.x - hole.width / 2), snap(p.y - hole.height / 2));
  g.globalCompositeOperation = "source-over";
  ctx.drawImage(darkLayer.canvas, 0, 0);
}

/* ---------- things you can break ---------- */

const PROPS = {
  // Mama Webby's eggs hatch into spiderlings unless you pop them.
  egg: {
    update(prop, dt, room) {
      if (state.clock - prop.born < prop.fuse) return;
      prop.hp = 0;
      for (let i = 0; i < 2; i += 1) spawnHelper(room, 2, prop.x + (i ? 16 : -16), prop.y);
      burst(prop.x, prop.y, [BX.s4, BX.r2], 12, 160);
    },
    draw(prop) {
      const left = prop.fuse - (state.clock - prop.born);
      const shake = left < 1 ? Math.sin(state.anim * 50) * 2 : 0;
      const hot = left < 1 && Math.floor(state.anim * 10) % 2 === 0;
      blockDisc(prop.x, prop.y + 10, 12, BX.s0, 0.4);
      drawSprite(hot ? "egg-hot" : "egg", EGG_ROWS, { W: hot ? BX.r3 : BX.s4, r: BX.r2 }, prop.x + shake, prop.y + 12);
    }
  },
  // Mossbeard's mushrooms puff out slowing spores.
  mushroom: {
    update(prop) {
      if (state.clock < (prop.puffAt || 0)) return;
      prop.puffAt = state.clock + (easyMode() ? 3.6 : 2.6);
      addZone(prop.x, prop.y + 6, 58, 1.8, "spore", prop.propOf);
    },
    draw(prop) {
      const squish = state.clock > (prop.puffAt || 0) - 0.3 ? 2 : 0;
      blockDisc(prop.x, prop.y + 8, 12, BX.s0, 0.4);
      drawSprite("shroom", SHROOM_ROWS, { r: BX.r1, R: BX.wh, W: BX.d5 }, prop.x, prop.y + 10 + squish);
    }
  },
  // Pharaoh hides in a coffin while scarabs pour out.
  coffin: {
    update(prop, dt, room) {
      prop.x = prop.homeX = prop.propOf.x;
      prop.y = prop.homeY = prop.propOf.y;
      if (state.clock < (prop.spawnAt || 0)) return;
      prop.spawnAt = state.clock + (easyMode() ? 2 : 1.2);
      spawnHelper(room, 6, prop.x + rand(-40, 40), prop.y + rand(20, 40));
    },
    draw(prop) {
      blockDisc(prop.x, prop.y + 18, 22, BX.s0, 0.4);
      drawSprite("coffin", COFFIN_ROWS, { y: BX.y2, K: BX.d4, H: BX.H2 }, prop.x, prop.y + 20 + Math.sin(state.anim * 30) * (prop.flash > 0 ? 2 : 0));
    }
  },
  // The Wispy Queen hides in one of three mirrors.
  mirror: {
    update(prop) {
      if (state.clock < (prop.shootAt || 0)) return;
      prop.shootAt = state.clock + (easyMode() ? 2.4 : 1.6);
      const offset = Math.random() * Math.PI;
      for (let i = 0; i < 6; i += 1) shotFrom(prop.x, prop.y, offset + (i / 6) * Math.PI * 2, bulletSpeed(currentRoom()) * 0.6, Math.round(prop.propOf.damage * 0.6), { color: "#bdf1ff", r: 7 });
    },
    pop(prop) {
      if (prop.real) return;
      floatText(prop.x, prop.y - 40, "Wrong mirror!", "#bdf1ff", 16);
      for (let i = 0; i < 10; i += 1) shotFrom(prop.x, prop.y, (i / 10) * Math.PI * 2, bulletSpeed(currentRoom()) * 0.8, Math.round(prop.propOf.damage * 0.7), { color: "#bdf1ff", r: 7 });
    },
    draw(prop) {
      blockDisc(prop.x, prop.y + 20, 18, BX.s0, 0.4);
      drawSprite("mirror", MIRROR_ROWS, { F: BX.s5, G: BX.w4, g: BX.w3, S: BX.wh }, prop.x, prop.y + 20);
    }
  },
  // Crystal Crusher's copies shoot crystal fans and burst into splinters.
  clone: {
    update(prop) {
      if (state.clock - prop.born > prop.lifeTime) {
        prop.hp = 0;
        burst(prop.x, prop.y, [BX.v2, BX.v3], 10, 140);
        return;
      }
      if (state.clock < (prop.shootAt || prop.born + 0.8)) return;
      prop.shootAt = state.clock + tele(1.5);
      const p = nearestPlayer(prop.x, prop.y);
      for (const k of [-0.25, 0, 0.25]) shotFrom(prop.x, prop.y, angleTo(prop, p) + k, bulletSpeed(currentRoom()), Math.round(prop.propOf.damage * 0.7), { color: BX.v3, r: 7 });
    },
    pop(prop) {
      for (let i = 0; i < 6; i += 1) shotFrom(prop.x, prop.y, (i / 6) * Math.PI * 2, bulletSpeed(currentRoom()) * 0.8, Math.round(prop.propOf.damage * 0.5), { color: BX.v3, r: 6 });
    },
    draw(prop) {
      drawCopyOf(prop.propOf, prop.x, prop.y, 1);
      for (let i = 0; i < 3; i += 1) {
        const a = state.anim * 3 + i * 2.1;
        block(prop.x + Math.cos(a) * prop.size * 0.6, prop.y + Math.sin(a) * prop.size * 0.4, 4, BX.v3);
      }
    }
  },
  // Big Wobble's slime blobs chase you and merge into bigger blobs.
  blob: {
    moves: true,
    update(prop, dt, room) {
      const p = nearestPlayer(prop.x, prop.y);
      const a = angleTo(prop, p);
      prop.x += Math.cos(a) * prop.speed * dt;
      prop.y += Math.sin(a) * prop.speed * dt;
      for (const other of propsOf(prop.propOf, "blob")) {
        if (other === prop || other.hp <= 0 || Math.hypot(other.x - prop.x, other.y - prop.y) > (prop.size + other.size) * 0.4) continue;
        prop.size = Math.min(56, prop.size + other.size * 0.35);
        prop.maxHp += other.hp;
        prop.hp += other.hp;
        prop.merged = (prop.merged || 0) + 1;
        other.hp = 0;
        burst(prop.x, prop.y, [BX.g3, BX.g5], 8, 120);
      }
      const touching = livingPlayers().find((hero) => Math.hypot(hero.x - prop.x, hero.y - prop.y) < prop.size * 0.45 + hero.r);
      if (touching || state.clock - prop.born > 8) {
        if (touching) strike(touching, Math.round(prop.propOf.damage * (0.6 + 0.25 * (prop.merged || 0))), prop.x, prop.y, null, "zone");
        addZone(prop.x, prop.y, prop.size, 5, "slime", prop.propOf);
        prop.hp = 0;
      }
    },
    pop(prop) {
      addZone(prop.x, prop.y, prop.size * 0.7, 3, "slime", prop.propOf);
    },
    draw(prop) {
      const r = prop.size / 2;
      const wob = Math.sin(state.anim * 8 + prop.born) * 2;
      blockDisc(prop.x, prop.y + r * 0.6, r, BX.g1, 0.4);
      blockDisc(prop.x, prop.y, r + 2 + wob, BX.out, 0.85);
      blockDisc(prop.x, prop.y, r + wob, BX.g3, 0.85);
      block(prop.x - r * 0.35, prop.y - r * 0.35, 6, BX.g5);
      block(prop.x - 5, prop.y - 2, 4, BX.out);
      block(prop.x + 5, prop.y - 2, 4, BX.out);
    }
  },
  // Mega Mud Puff's mines: step close and they go off. Any hit sets them off too.
  mine: {
    update(prop, dt) {
      const armed = state.clock - prop.born > 0.7;
      if (prop.fuse === undefined && armed && livingPlayers().some((p) => Math.hypot(p.x - prop.x, p.y - prop.y) < 54)) {
        prop.fuse = 0.35;
        tone(900, 0.1, { type: "square", volume: 0.04 });
      }
      if (prop.fuse !== undefined) {
        prop.fuse -= dt;
        if (prop.fuse <= 0) mineBoom(prop);
      }
      if (state.clock - prop.born > 22) prop.hp = 0;
    },
    hit(prop) {
      if (prop.fuse === undefined || prop.fuse > 0.05) prop.fuse = 0.05;
    },
    pop(prop) {
      if (!prop.boomed) mineBoom(prop);
    },
    draw(prop) {
      const lit = prop.fuse !== undefined ? Math.floor(state.anim * 24) % 2 === 0 : Math.floor(state.anim * 3) % 2 === 0;
      blockDisc(prop.x, prop.y + 6, 10, BX.s0, 0.4);
      drawSprite("mine", MINE_ROWS, { d: BX.d2, D: BX.d3 }, prop.x, prop.y + 8);
      block(prop.x, prop.y - 6, 4, lit ? BX.r2 : BX.y0);
    }
  }
};

function mineBoom(prop) {
  if (prop.boomed) return;
  prop.boomed = true;
  prop.hp = 0;
  const r = 86;
  hitCircle(prop.x, prop.y, r, Math.round(prop.propOf.damage * 1.1), null, "zone");
  burst(prop.x, prop.y, [BX.d2, BX.d3, BX.y2], 18, 260);
  blockRingFlash(prop.x, prop.y, r);
  addShake(5);
  sfx.boom();
  for (const other of propsOf(prop.propOf, "mine")) {
    if (Math.hypot(other.x - prop.x, other.y - prop.y) < 120 && other.fuse === undefined) other.fuse = 0.12;
  }
}

function blockRingFlash(x, y, r) {
  addRing(x, y, r, BX.d3, 0.3, 8);
}

/* ---------- passives: tricks that are always on ---------- */

function runPassive(boss, kit, brain, dt, room, dist) {
  const target = bossTarget(boss);
  const turn = kit.passive === "stonefront" ? (easyMode() ? 0.7 : 1.1) : 2.6;
  brain.face = turnToward(brain.face, angleTo(boss, target), dt * turn);
  // A speed multiplier on top of whatever the rest of the game set (phase two, last stand).
  let speed = 1;
  if (state.clock < (brain.berserkUntil || 0)) speed *= 1.4;
  const idle = boss.state === "move";
  switch (kit.passive) {
    case "relentless":
      // King Zombo heals if you stop hitting him.
      if (state.clock - (brain.lastHit || 0) > 3 && boss.hp < boss.maxHp) {
        boss.hp = Math.min(boss.maxHp, boss.hp + boss.maxHp * (easyMode() ? 0.004 : 0.012) * dt);
        if (Math.random() < dt * 6) burst(boss.x + rand(-16, 16), boss.y - boss.size * 0.4, [BX.g4, BX.g5], 1, 40, { lift: 30 });
      }
      break;
    case "webrunner":
      if (bossFx.some((fx) => fx.kind === "zone" && fx.style === "web" && Math.hypot(boss.x - fx.x, boss.y - fx.y) < fx.r)) speed *= 1.8;
      break;
    case "footprints":
      if ((boss.state === "dodge" || boss.state === "charge" || (boss.sig && boss.sig.trail)) && state.clock > (brain.trailAt || 0)) {
        brain.trailAt = state.clock + 0.09;
        addZone(boss.x, boss.y + boss.size * 0.3, 18, 2.6, "fire", boss);
      }
      break;
    case "fakedeath":
      if (idle && dist < 120 && state.clock > brain.passiveAt) {
        brain.passiveAt = state.clock + rand(3, 5);
        startSig(boss, "backflip", room);
      }
      break;
    case "bushhide":
      if (idle && state.clock > brain.passiveAt) {
        brain.passiveAt = state.clock + rand(8, 11) * (easyMode() ? 1.5 : 1);
        startSig(boss, "bushhide", room);
      }
      break;
    case "rage":
      if (brain.rage >= 1) {
        brain.rage = 0;
        brain.berserkUntil = state.clock + (easyMode() ? 3 : 5);
        shout(boss, "BRUTE ANGRY!", "#ef5b4b");
        addRing(boss.x, boss.y, 120, BX.r2, 0.5, 10);
        sfx.roar();
        addShake(6);
      }
      break;
    case "sandstorm":
      if (brain.phase >= 2 || brain.elder) {
        let storm = bossFx.find((fx) => fx.kind === "dark" && fx.mode === "sand");
        if (!storm) storm = addFx({ kind: "dark", mode: "sand", radius: easyMode() ? 320 : 230, life: 1 });
        storm.life = Math.max(storm.life, 0.5);
      }
      break;
    case "shadowclones":
      if (idle && state.clock > brain.passiveAt) {
        brain.passiveAt = state.clock + (easyMode() ? 14 : rand(8, 10));
        shadowDashers(boss);
      }
      break;
  }
  speed *= bossTune().speed;
  boss.speed = (boss.speed / (brain.speedMult || 1)) * speed;
  brain.speedMult = speed;
}

function shadowDashers(boss) {
  const target = bossTarget(boss);
  const base = angleTo(target, boss);
  [-1, 1].forEach((side, i) => {
    const a = base + side * 1.6;
    const sx = target.x + Math.cos(a) * 230;
    const sy = target.y + Math.sin(a) * 230;
    const end = inArena(target.x - Math.cos(a) * 160, target.y - Math.sin(a) * 160, 30);
    const start = inArena(sx, sy, 30);
    addFx({ kind: "dasher", boss, sx: start.x, sy: start.y, ex: end.x, ey: end.y, x: start.x, y: start.y, size: boss.size, warn: tele(0.7) + i * 0.45, life: tele(0.7) + i * 0.45 + 0.5, damage: Math.round(boss.damage * 0.8), hit: new Set() });
  });
  shout(boss, "Which one is me?", BX.v3);
}

function shieldBlock(boss) {
  const brain = boss.brain;
  if (state.clock > (brain.tinkAt || 0)) {
    brain.tinkAt = state.clock + 0.4;
    floatText(boss.x, boss.y - boss.size, "Blocked!", "#f6c85f", 15);
    sfx.block();
  }
  if (state.clock < (brain.counterAt || 0)) return;
  brain.counterAt = state.clock + (easyMode() ? 1.6 : 0.9);
  // Counter Stance: hit the shield and he answers right away.
  const p = nearestPlayer(boss.x, boss.y);
  const lead = leadAngle(boss, p, bulletSpeed(currentRoom()) * 1.2);
  for (let i = -2; i <= 2; i += 1) shotFrom(boss.x, boss.y, lead + i * 0.16, bulletSpeed(currentRoom()) * 1.2, Math.round(boss.damage * 0.7), { color: "#f6c85f", r: 7 });
  shout(boss, "Counter!", "#f6c85f");
}

function drawPassiveMarks(boss, kit, brain) {
  const face = brain.face;
  if (kit.passive === "stonefront" || (kit.passive === "counter" && brain.shieldUp)) {
    // A stone (or gold) shield plate on the side the boss is facing.
    const quartz = kit.passive === "counter";
    const r = boss.size * 0.62;
    const colors = quartz ? [BX.y0, BX.y2, BX.y3] : [BX.s1, BX.s3, BX.s5];
    for (let i = -4; i <= 4; i += 1) {
      const a = face + i * 0.18;
      const x = boss.x + Math.cos(a) * r;
      const y = boss.y - boss.size * 0.1 + Math.sin(a) * r * 0.8 - (boss.hop || 0);
      block(x, y, 12, BX.out);
      block(x, y, 8, colors[1]);
      if (i === -1 || i === 0) block(x - 2, y - 2, 4, colors[2]);
    }
  }
  if (kit.passive === "rage") {
    const w = 40;
    const x = boss.x - w / 2;
    const y = boss.y - boss.size - 8 - (boss.hop || 0);
    ctx.fillStyle = BX.out;
    ctx.fillRect(snap(x - 2), snap(y - 2), w + 4, 8);
    ctx.fillStyle = BX.r0;
    ctx.fillRect(snap(x), snap(y), w, 4);
    ctx.fillStyle = state.clock < (brain.berserkUntil || 0) ? (Math.floor(state.anim * 12) % 2 ? BX.y2 : BX.r2) : BX.r2;
    ctx.fillRect(snap(x), snap(y), snap(w * (state.clock < (brain.berserkUntil || 0) ? 1 : brain.rage)), 4);
  }
  if (state.clock < (brain.berserkUntil || 0) && Math.floor(state.anim * 10) % 2) blockRing(boss.x, boss.y, boss.size * 0.75, BX.r2, 4, 2, state.anim * 10);
}

/* ---------- signature moves ----------
   name: what the boss shouts. range: where it likes to use it (near, mid,
   far, any). tags: "area" (floor traps, good against dashers) and "unblock"
   (good against parry spammers). update() returns true when done, or
   "handoff" when it passes straight into one of the old attacks. */

// Start one of the old attacks from inside a signature move.
function basic(boss, id, room) {
  const target = bossTarget(boss);
  const d = Math.hypot(target.x - boss.x, target.y - boss.y) || 1;
  runBasic(boss, id, boss.hp < boss.maxHp * 0.5, room, (target.x - boss.x) / d, (target.y - boss.y) / d);
  return "handoff";
}

function hopAlong(boss, s, k, height) {
  boss.x = s.fromX + (s.toX - s.fromX) * k;
  boss.y = s.fromY + (s.toY - s.fromY) * k;
  boss.hop = Math.sin(k * Math.PI) * height;
}

function setHop(boss, s, to) {
  s.fromX = boss.x;
  s.fromY = boss.y;
  const spot = inArena(to.x, to.y, 50);
  s.toX = spot.x;
  s.toY = spot.y;
}

function countdown(s, dt) {
  s.timer -= dt;
  return s.timer <= 0;
}

function strong(boss) {
  return boss.brain && (boss.brain.phase >= 3 || boss.brain.elder);
}

// A charge along a locked line. Returns "wall", "pillar" or null.
function chargeStep(boss, s, dt, speed, room) {
  boss.x += s.dirX * speed * dt;
  boss.y += s.dirY * speed * dt;
  const half = boss.size / 2;
  for (const p of livingPlayers()) {
    if (s.hit.has(p) || Math.hypot(p.x - boss.x, p.y - boss.y) > half + p.r) continue;
    s.hit.add(p);
    strike(p, boss.damage * 1.3, boss.x, boss.y, boss, "parry");
    p.kx *= s.shove || 1;
    p.ky *= s.shove || 1;
  }
  for (const crate of room.crates) {
    if (crate.hp > 0 && crate.stone && circleHitsRect(boss.x, boss.y, half, crate)) return "pillar";
  }
  if (boss.x < TILE + half + 2 || boss.x > WIDTH - TILE - half - 2 || boss.y < TILE + half + 2 || boss.y > HEIGHT - TILE - half - 2) return "wall";
  return null;
}

function bonk(boss) {
  pushOutOfCrates(boss, boss.size * 0.45);
  floatText(boss.x, boss.y - boss.size, "BONK!", "#f6c85f", 20);
  addShake(8);
  sfx.slam();
  stunEnemy(boss, 1.4);
}

function aimLock(boss, s, target, lead = 0.3) {
  const spot = leadPoint(target, lead);
  const d = Math.hypot(spot.x - boss.x, spot.y - boss.y) || 1;
  s.dirX = (spot.x - boss.x) / d;
  s.dirY = (spot.y - boss.y) / d;
}

function drawLane(boss, dirX, dirY, length, width) {
  const n = Math.floor(length / 18);
  const blink = Math.floor(state.anim * 14) % 2 === 0;
  for (let i = 1; i < n; i += 1) {
    if ((i + Math.floor(state.anim * 10)) % 3 === 0) continue;
    const x = boss.x + dirX * i * 18;
    const y = boss.y + dirY * i * 18;
    for (const side of [-1, 1]) {
      block(x - dirY * width * 0.5 * side, y + dirX * width * 0.5 * side, 6, BX.out);
      block(x - dirY * width * 0.5 * side, y + dirX * width * 0.5 * side, 4, blink ? BX.wh : BX.r2);
    }
  }
}

function drawWedge(x, y, angle, reach, spread) {
  const blink = Math.floor(state.anim * 14) % 2 === 0;
  const color = blink ? BX.wh : BX.r2;
  for (const side of [-1, 1]) {
    const a = angle + side * spread;
    for (let d = 30; d < reach; d += 14) block(x + Math.cos(a) * d, y + Math.sin(a) * d, 4, color);
  }
  for (let a = -spread; a <= spread; a += 0.08) block(x + Math.cos(angle + a) * reach, y + Math.sin(angle + a) * reach, 4, color);
}

const SIGS = {
  /* ----- King Zombo ----- */
  rise: {
    name: "Rise, my subjects!", range: "mid", tags: ["area"],
    start(boss, s, room) {
      const target = leadPoint(bossTarget(boss), 0.4);
      const base = angleTo(boss, target);
      const lines = strong(boss) ? [base - 0.35, base, base + 0.35] : [base];
      let last = 0;
      for (const a of lines) {
        for (let i = 1; i <= 8; i += 1) {
          const spot = inArena(boss.x + Math.cos(a) * 46 * i, boss.y + Math.sin(a) * 46 * i, 20);
          const warn = tele(0.55) + i * 0.07;
          last = Math.max(last, warn);
          warnCircle(spot.x, spot.y, 30, warn, Math.round(boss.damage * 0.9), "hand", { after: i >= 7 && a === base ? (fx) => spawnHelper(room, 0, fx.x, fx.y) : null });
        }
      }
      s.timer = last + 0.15;
      sfx.rumble();
    },
    update: (boss, s, dt) => countdown(s, dt)
  },
  rotbreath: {
    name: "Rotten Breath!", range: "near", tags: ["area"],
    start(boss, s) {
      s.angle = angleTo(boss, bossTarget(boss));
      s.timer = tele(0.6);
    },
    update(boss, s, dt) {
      if (s.step === 0) {
        s.angle = turnToward(s.angle, angleTo(boss, bossTarget(boss)), dt * 2.2);
        if (!countdown(s, dt)) return false;
        s.step = 1;
        s.timer = 0.35;
        for (const p of livingPlayers()) {
          const d = Math.hypot(p.x - boss.x, p.y - boss.y);
          const diff = Math.atan2(Math.sin(angleTo(boss, p) - s.angle), Math.cos(angleTo(boss, p) - s.angle));
          if (d < 190 && Math.abs(diff) < 0.6) strike(p, boss.damage, boss.x, boss.y, null, "zone");
        }
        for (const dist of [70, 130, 190]) addZone(boss.x + Math.cos(s.angle) * dist, boss.y + Math.sin(s.angle) * dist, 34 + dist * 0.12, 4.5, "poison", boss);
        burst(boss.x + Math.cos(s.angle) * 40, boss.y + Math.sin(s.angle) * 40, [BX.L3, BX.L5, BX.g1], 20, 260);
        noiseBurst(0.3, { volume: 0.08, freq: 300 });
        return false;
      }
      return countdown(s, dt);
    },
    draw(boss, s) {
      if (s.step === 0) drawWedge(boss.x, boss.y, s.angle, 190, 0.6);
    }
  },
  horde: {
    name: "THE HORDE!", range: "any",
    start(boss, s) {
      s.left = easyMode() ? 3 : 6;
      sfx.roar();
      addShake(6);
    },
    update(boss, s, dt, room) {
      if (s.left > 0) {
        if (!countdown(s, dt)) return false;
        s.timer = 0.16;
        s.left -= 1;
        const side = Math.floor(Math.random() * 4);
        const x = side === 0 ? TILE + 30 : side === 1 ? WIDTH - TILE - 30 : rand(TILE + 60, WIDTH - TILE - 60);
        const y = side === 2 ? TILE + 30 : side === 3 ? HEIGHT - TILE - 30 : rand(TILE + 60, HEIGHT - TILE - 60);
        spawnHelper(room, 0, x, y, false);
        return false;
      }
      return basic(boss, "leapslash", room);
    }
  },

  /* ----- Sir Rattlebones ----- */
  snipe: {
    name: "Snipe!", range: "far",
    start(boss, s) {
      s.angle = angleTo(boss, bossTarget(boss));
      s.timer = tele(0.95);
      s.shots = strong(boss) ? 2 : 1;
    },
    update(boss, s, dt, room) {
      if (s.shots <= 0) return countdown(s, dt);
      const target = bossTarget(boss);
      if (s.timer > tele(0.25)) s.angle = turnToward(s.angle, leadAngle(boss, target, 900), dt * 1.8);
      if (!countdown(s, dt)) return false;
      const end = rayToWall(boss.x, boss.y, s.angle);
      warnLine(boss.x, boss.y, end.x, end.y, 18, 0, Math.round(boss.damage * 1.4), "arrow", { boss });
      sfx.slash(true);
      addShake(3);
      s.shots -= 1;
      s.timer = s.shots > 0 ? tele(0.45) : 0.25;
      return false;
    },
    draw(boss, s) {
      if (s.shots <= 0) return;
      const end = rayToWall(boss.x, boss.y, s.angle);
      const locked = s.timer <= tele(0.25);
      const color = locked && Math.floor(state.anim * 16) % 2 === 0 ? BX.wh : BX.r2;
      const n = Math.floor(end.dist / 10);
      for (let i = 2; i < n; i += 1) block(boss.x + Math.cos(s.angle) * i * 10, boss.y + Math.sin(s.angle) * i * 10, locked ? 4 : 2, color);
    }
  },
  curtain: {
    name: "Arrow Curtain!", range: "any", tags: ["area"],
    start(boss, s) {
      const cols = [];
      for (let x = TILE + 40; x < WIDTH - TILE - 20; x += 80) cols.push(x);
      if (boss.x > WIDTH / 2) cols.reverse();
      cols.forEach((x, i) => {
        const gap = rand(TILE + 80, HEIGHT - TILE - 80);
        const half = easyMode() ? 70 : 50;
        const warn = tele(0.7) + i * 0.11;
        warnLine(x, TILE, x, gap - half, 20, warn, Math.round(boss.damage * 0.9), "arrow");
        warnLine(x, gap + half, x, HEIGHT - TILE, 20, warn, Math.round(boss.damage * 0.9), "arrow");
        s.timer = warn + 0.3;
      });
    },
    update: (boss, s, dt) => countdown(s, dt)
  },
  volleylines: {
    name: "Volley!", range: "any", tags: ["area"],
    start(boss, s) {
      s.waves = easyMode() ? 2 : 3;
      s.timer = 0;
    },
    update(boss, s, dt) {
      if (s.waves <= 0) return countdown(s, dt);
      if (!countdown(s, dt)) return false;
      const target = bossTarget(boss);
      const ys = [target.y, rand(TILE + 40, HEIGHT - TILE - 40), rand(TILE + 40, HEIGHT - TILE - 40)];
      const xs = [target.x, rand(TILE + 40, WIDTH - TILE - 40), rand(TILE + 40, WIDTH - TILE - 40)];
      for (const y of ys) warnLine(TILE, y, WIDTH - TILE, y, 22, tele(0.75), Math.round(boss.damage * 0.9), "arrow");
      for (const x of xs) warnLine(x, TILE, x, HEIGHT - TILE, 22, tele(0.75), Math.round(boss.damage * 0.9), "arrow");
      s.waves -= 1;
      s.timer = s.waves > 0 ? tele(0.95) : tele(0.75) + 0.3;
      return false;
    }
  },
  backflip: {
    range: "near",
    start(boss, s) {
      const target = bossTarget(boss);
      const a = angleTo(target, boss);
      warnCircle(boss.x, boss.y, 42, tele(0.6), Math.round(boss.damage * 0.9), "bone");
      setHop(boss, s, { x: boss.x + Math.cos(a) * 160, y: boss.y + Math.sin(a) * 160 });
      s.timer = 0.32;
      shout(boss, "Too slow!", "#f2f2e6");
    },
    update(boss, s, dt) {
      s.timer -= dt;
      hopAlong(boss, s, 1 - Math.max(0, s.timer) / 0.32, 50);
      return s.timer <= 0;
    }
  },
  rebuild: {
    start(boss, s) {
      boss.sigHidden = true;
      boss.sigInvuln = true;
      s.timer = easyMode() ? 4 : 2.6;
      toast("Sir Rattlebones fell apart... wait, the bones are moving!", 2.6);
      burst(boss.x, boss.y, [BX.W1, BX.W2, BX.out], 26, 260);
      sfx.poof();
    },
    update(boss, s, dt, room) {
      if (Math.random() < dt * 8) burst(boss.x + rand(-20, 20), boss.y + 10, [BX.W1, BX.W2], 1, 60, { lift: 30 });
      if (!countdown(s, dt)) return false;
      boss.hp = Math.round(boss.maxHp * 0.3);
      for (let i = 0; i < 14; i += 1) enemyShot(boss, (i / 14) * Math.PI * 2, bulletSpeed(room) * 0.8, { color: "#f2f2e6", kind: "arrow" });
      addRing(boss.x, boss.y, 120, "#f2f2e6", 0.4, 10);
      shout(boss, "Did you miss me?", "#f2f2e6");
      sfx.roar();
      return true;
    },
    draw(boss, s) {
      for (let i = 0; i < 9; i += 1) {
        const a = i * 0.7 + s.t * (2 - i * 0.1);
        const r = 26 * Math.max(0, 1 - s.t / 3) + 6;
        const x = boss.x + Math.cos(a) * r;
        const y = boss.y + 12 + Math.sin(a) * r * 0.4;
        block(x, y, 10, BX.out);
        block(x, y, 6, BX.W2);
      }
      block(boss.x, boss.y + 2, 14, BX.out);
      block(boss.x, boss.y + 2, 10, BX.W1);
    }
  },

  /* ----- Mama Webby ----- */
  webshot: {
    name: "Web Shot!", range: "far", tags: ["area"],
    start(boss, s) {
      const count = strong(boss) ? 4 : 3;
      for (let i = 0; i < count; i += 1) {
        const target = livingPlayers()[i % livingPlayers().length] || bossTarget(boss);
        const spot = leadPoint(target, 0.4 + i * 0.25);
        spot.x += rand(-60, 60);
        spot.y += rand(-60, 60);
        const a = Math.atan2(spot.y - boss.y, spot.x - boss.x);
        const speed = 330;
        addFx({ kind: "mover", style: "webball", x: boss.x, y: boss.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 9, life: 4, range: Math.hypot(spot.x - boss.x, spot.y - boss.y), bounces: 0, damage: Math.round(boss.damage * 0.6), stopOnHit: true, cd: [0, 0], after: (fx) => {
          const webs = bossFx.filter((other) => other.kind === "zone" && other.style === "web" && other.life > 0);
          if (webs.length >= 8) webs[0].life = 0;
          addZone(fx.x, fx.y, 56, 60, "web", boss);
        } });
      }
      sfx.enemyShot();
      s.timer = 0.4;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },
  ceilingdrop: {
    name: "Surprise from above!", range: "any",
    start(boss, s) {
      s.timer = 0.35;
      sfx.dash();
    },
    update(boss, s, dt, room) {
      const target = bossTarget(boss);
      if (s.step === 0) {
        boss.hop = (1 - s.timer / 0.35) * 420;
        if (!countdown(s, dt)) return false;
        boss.sigHidden = true;
        boss.sigInvuln = true;
        s.x = target.x;
        s.y = target.y;
        s.step = 1;
        s.timer = tele(1.3);
        return false;
      }
      if (s.step === 1) {
        const a = Math.atan2(target.y - s.y, target.x - s.x);
        const d = Math.hypot(target.x - s.x, target.y - s.y);
        const move = Math.min(d, (easyMode() ? 160 : 240) * dt);
        s.x += Math.cos(a) * move;
        s.y += Math.sin(a) * move;
        boss.x = s.x;
        boss.y = s.y;
        if (countdown(s, dt)) {
          s.step = 2;
          s.timer = tele(0.4);
        }
        return false;
      }
      if (s.step === 2) {
        if (countdown(s, dt)) {
          s.step = 3;
          s.timer = 0.16;
          boss.sigHidden = false;
          boss.sigInvuln = false;
        }
        return false;
      }
      boss.hop = Math.max(0, s.timer / 0.16) * 300;
      if (!countdown(s, dt)) return false;
      boss.hop = 0;
      hitCircle(boss.x, boss.y, 74, Math.round(boss.damage * 1.4), boss, "parry");
      addShockwave(boss, 1);
      addShake(9);
      sfx.slam();
      burst(boss.x, boss.y + 10, [BX.s3, BX.d2, BX.wh], 22, 260);
      if (strong(boss)) for (let i = 0; i < 2; i += 1) spawnHelper(room, 2, boss.x + (i ? 40 : -40), boss.y + 20);
      return true;
    },
    draw(boss, s) {
      if (s.step < 1) return;
      const r = s.step === 1 ? 26 : 30 + (1 - s.timer / tele(0.4)) * 14;
      blockDisc(s.x, s.y + 8, r + 10, BX.s1, 0.45);
      blockDisc(s.x, s.y + 8, r, BX.s0, 0.45);
      if (s.step >= 2) warnRing(s.x, s.y, 74, 1 - s.timer / tele(0.4));
      if (s.step <= 2) blockLine(s.x, s.y - 400, s.x, s.y - 30, BX.s4, 2);
    }
  },
  brood: {
    name: "Hatch, my babies!", range: "any",
    start(boss, s, room) {
      const target = bossTarget(boss);
      const count = easyMode() ? 3 : 5;
      for (let i = 0; i < count; i += 1) {
        const a = (i / count) * Math.PI * 2 + Math.random();
        const d = rand(110, 230);
        addProp(boss, room, "egg", target.x + Math.cos(a) * d, target.y + Math.sin(a) * d, { name: "Egg Sac", size: 24, hp: 0.025, data: { fuse: tele(3.2) } });
      }
      sfx.pop();
      s.timer = 0.6;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },

  /* ----- Big Wobble ----- */
  bellybounce: {
    name: "Belly Bounce!", range: "mid",
    start(boss, s) {
      s.hops = strong(boss) ? 4 : 3;
      s.len = tele(0.5);
      setHop(boss, s, leadPoint(bossTarget(boss), 0.45));
      s.timer = s.len;
    },
    update(boss, s, dt) {
      if (s.step === 1) {
        if (!countdown(s, dt)) return false;
        s.step = 0;
        setHop(boss, s, leadPoint(bossTarget(boss), 0.45));
        s.timer = s.len;
        return false;
      }
      s.timer -= dt;
      hopAlong(boss, s, 1 - Math.max(0, s.timer) / s.len, 110);
      if (s.timer > 0) return false;
      boss.hop = 0;
      s.hops -= 1;
      hitCircle(boss.x, boss.y, 64, boss.damage, boss, "parry");
      addZone(boss.x, boss.y + 10, 52, 7, "slime", boss);
      burst(boss.x, boss.y + 14, [BX.g3, BX.g5], 16, 220);
      addShake(5);
      sfx.slam();
      if (s.hops <= 0) {
        addShockwave(boss, 1);
        return true;
      }
      s.step = 1;
      s.timer = 0.08;
      return false;
    },
    draw(boss, s) {
      if (s.step === 0) warnRing(s.toX, s.toY, 64, 1 - s.timer / s.len);
    }
  },
  jiggle: {
    name: "Jiggle Blade!", range: "near", tags: ["unblock"], instant: true,
    start(boss, s, room) {
      // The first swing wobbles for ages, the second is instant, the last comes whenever.
      const list = [{ kind: "arc", delay: tele(0.6) }, { kind: "arc", delay: 0.1 }, { kind: "arc", delay: rand(0.15, 0.8), heavy: true }];
      if ((room.tier >= 3 || strong(boss)) && Math.random() < 0.5) list[2].unparry = true;
      startSwings(boss, list);
    }
  },
  blobstorm: {
    name: "Blob Storm!", range: "any",
    start(boss, s, room) {
      const count = easyMode() ? 4 : 6;
      for (let i = 0; i < count; i += 1) {
        const a = (i / count) * Math.PI * 2;
        addProp(boss, room, "blob", boss.x + Math.cos(a) * 70, boss.y + Math.sin(a) * 70, { name: "Slime Blob", size: 22, hp: 0.012, speed: rand(85, 120) });
      }
      sfx.pop();
      s.timer = 0.8;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },

  /* ----- Imp-eror Blaze ----- */
  hopscotch: {
    name: "Fire Hopscotch!", range: "any", tags: ["area"],
    start(boss, s) {
      s.jumps = strong(boss) ? 4 : 3;
      s.side = Math.random() < 0.5 ? -1 : 1;
      this.pick(boss, s);
    },
    pick(boss, s) {
      const target = bossTarget(boss);
      const a = angleTo(target, boss) + s.side * rand(0.9, 1.4);
      s.side *= -1;
      const d = rand(120, 170);
      const spot = inArena(target.x + Math.cos(a) * d, target.y + Math.sin(a) * d, 50);
      s.x = spot.x;
      s.y = spot.y;
      s.timer = tele(0.28);
      s.trail = true;
    },
    update(boss, s, dt, room) {
      if (s.jumps > 0) {
        if (!countdown(s, dt)) return false;
        addZone(boss.x, boss.y + 10, 34, 4, "fire", boss);
        burst(boss.x, boss.y, [BX.y1, BX.r2], 10, 160);
        boss.x = s.x;
        boss.y = s.y;
        addRing(boss.x, boss.y, 40, BX.y2, 0.2, 5);
        tone(700, 0.08, { type: "square", volume: 0.04, slide: 300 });
        s.jumps -= 1;
        if (s.jumps > 0) this.pick(boss, s);
        else s.timer = 0.12;
        return false;
      }
      if (!countdown(s, dt)) return false;
      const lead = leadAngle(boss, bossTarget(boss), bulletSpeed(room));
      for (let i = -2; i <= 2; i += 1) enemyShot(boss, lead + i * 0.2, bulletSpeed(room), { color: "#ff9b3d", kind: "flame", r: 9 });
      sfx.fireball();
      return true;
    },
    draw(boss, s) {
      if (s.jumps > 0) warnRing(s.x, s.y, 30, 1 - s.timer / tele(0.28));
    }
  },
  juggle: {
    name: "Ember Juggle!", range: "far", tags: ["area"],
    start(boss, s, room) {
      const target = bossTarget(boss);
      let last = 0;
      for (let i = 0; i < 3; i += 1) {
        const spot = inArena(leadPoint(target, 0.55 + i * 0.25).x + rand(-30, 30), leadPoint(target, 0.55 + i * 0.25).y + rand(-30, 30), 30);
        const warn = tele(0.85) + i * 0.22;
        last = Math.max(last, warn);
        warnCircle(spot.x, spot.y, 44, warn, boss.damage, "fireball", { sx: boss.x, sy: boss.y - 30, after: (fx) => {
          for (let k = 0; k < 6; k += 1) shotFrom(fx.x, fx.y, (k / 6) * Math.PI * 2 + i, bulletSpeed(room) * 0.75, Math.round(boss.damage * 0.6), { color: "#ff9b3d", kind: "flame", r: 7 });
          addZone(fx.x, fx.y, 30, 3, "fire", boss);
          sfx.boom();
        } });
      }
      s.timer = 0.5;
      sfx.fireball();
    },
    update: (boss, s, dt) => countdown(s, dt)
  },
  firering: {
    name: "Ring of Fire!", range: "any",
    start(boss, s) {
      const target = bossTarget(boss);
      const life = tele(3.4);
      addFx({ kind: "firering", x: target.x, y: target.y, r0: 300, r1: 46, life, gap: Math.random() * Math.PI * 2, gapSize: easyMode() ? 1.5 : 0.95, spin: (Math.random() < 0.5 ? -1 : 1) * 1.05, damage: boss.damage, cd: [0, 0] });
      s.timer = life;
      s.shoot = 0.9;
      sfx.fireball();
    },
    update(boss, s, dt, room) {
      s.shoot -= dt;
      if (s.shoot <= 0) {
        s.shoot = easyMode() ? 1.6 : 1;
        const lead = leadAngle(boss, bossTarget(boss), bulletSpeed(room));
        for (const k of [-0.15, 0, 0.15]) enemyShot(boss, lead + k, bulletSpeed(room), { color: "#ff9b3d", kind: "flame" });
      }
      return countdown(s, dt);
    }
  },

  /* ----- The Wispy Queen ----- */
  icewaltz: {
    name: "Ice Waltz!", range: "any", tags: ["area"],
    start(boss, s) {
      const target = bossTarget(boss);
      s.cx = target.x;
      s.cy = target.y;
      s.radius = clamp(Math.hypot(boss.x - target.x, boss.y - target.y), 150, 230);
      s.angle = angleTo(target, boss);
      s.dir = Math.random() < 0.5 ? -1 : 1;
      s.timer = strong(boss) ? 2.2 : 1.7;
      s.drop = 0;
    },
    update(boss, s, dt) {
      const target = bossTarget(boss);
      const a = Math.atan2(target.y - s.cy, target.x - s.cx);
      const d = Math.hypot(target.x - s.cx, target.y - s.cy);
      s.cx += Math.cos(a) * Math.min(d, 70 * dt);
      s.cy += Math.sin(a) * Math.min(d, 70 * dt);
      s.angle += s.dir * 2.3 * dt * (s.slow || 1);
      const spot = inArena(s.cx + Math.cos(s.angle) * s.radius, s.cy + Math.sin(s.angle) * s.radius, 40);
      boss.x = spot.x;
      boss.y = spot.y;
      s.drop -= dt;
      if (s.drop <= 0) {
        s.drop = 0.09;
        warnCircle(boss.x, boss.y + 8, 24, tele(0.42), Math.round(boss.damage * 0.8), "ice");
      }
      return countdown(s, dt);
    }
  },
  snowflake: {
    name: "Snowflake Bloom!", range: "any",
    start(boss, s) {
      s.timer = 1.7;
      s.tick = 0;
      s.rot = Math.random() * Math.PI;
    },
    update(boss, s, dt, room) {
      s.tick -= dt;
      while (s.tick <= 0) {
        s.tick += easyMode() ? 0.14 : 0.085;
        const arms = strong(boss) ? 8 : 6;
        for (let i = 0; i < arms; i += 1) {
          const a = s.rot + (i / arms) * Math.PI * 2;
          enemyShot(boss, a, bulletSpeed(room) * 0.5, { color: "#bdf1ff", r: 7 });
          if (s.flip) enemyShot(boss, -a * 1.3, bulletSpeed(room) * 0.42, { color: "#ffffff", r: 6 });
        }
        s.flip = !s.flip;
        s.rot += 0.23;
      }
      return countdown(s, dt);
    }
  },
  frozenmirrors: {
    name: "Frozen Mirrors!", range: "any",
    start(boss, s, room) {
      boss.sigHidden = true;
      boss.sigInvuln = true;
      const target = bossTarget(boss);
      s.mirrors = [];
      const base = Math.random() * Math.PI * 2;
      for (let i = 0; i < 3; i += 1) {
        const a = base + (i / 3) * Math.PI * 2;
        s.mirrors.push(addProp(boss, room, "mirror", target.x + Math.cos(a) * 230, target.y + Math.sin(a) * 230, { name: "Ice Mirror", size: 36, hp: 0.03, data: { shootAt: state.clock + 1 + i * 0.4 } }));
      }
      s.real = s.mirrors[Math.floor(Math.random() * 3)];
      s.real.real = true;
      s.timer = easyMode() ? 7 : 9;
      burst(boss.x, boss.y, ["#bdf1ff", "#ffffff"], 20, 220);
      toast("One of the mirrors is the real Queen. Break it!", 2.6);
    },
    update(boss, s, dt, room) {
      boss.x = s.real.x;
      boss.y = s.real.y;
      if (s.real.hp <= 0) {
        boss.sigHidden = false;
        boss.sigInvuln = false;
        for (const m of s.mirrors) m.hp = 0;
        floatText(boss.x, boss.y - boss.size, "Found me!", "#bdf1ff", 18);
        damageEnemy(boss, boss.maxHp * 0.04, "staff");
        stunEnemy(boss, 1.3);
        return true;
      }
      if (!countdown(s, dt)) return false;
      for (const m of s.mirrors) m.hp = 0;
      for (let i = 0; i < 16; i += 1) enemyShot(boss, (i / 16) * Math.PI * 2, bulletSpeed(room) * 0.8, { color: "#bdf1ff" });
      shout(boss, "Too late!", "#bdf1ff");
      return true;
    }
  },

  /* ----- Pharaoh Husk ----- */
  wraps: {
    name: "Mummy Wraps!", range: "mid", tags: ["unblock"],
    start(boss, s) {
      s.whips = strong(boss) || (boss.brain && boss.brain.phase >= 2) ? 2 : 1;
      s.timer = 0;
    },
    update(boss, s, dt, room) {
      if (s.whips > 0) {
        if (!countdown(s, dt)) return false;
        const target = bossTarget(boss);
        const a = leadAngle(boss, target, 700);
        const end = inArena(boss.x + Math.cos(a) * 330, boss.y + Math.sin(a) * 330, 10);
        warnLine(boss.x, boss.y, end.x, end.y, 26, tele(0.5), Math.round(boss.damage * 0.7), "wrap", { how: "unblock", onHit: (p) => {
          const d = Math.hypot(boss.x - p.x, boss.y - p.y) || 1;
          p.kx = ((boss.x - p.x) / d) * 900;
          p.ky = ((boss.y - p.y) / d) * 900;
          p.stun = Math.max(p.stun || 0, 0.3);
          s.pulled = true;
          floatText(p.x, p.y - 46, "Pulled!", "#efd29b", 16);
        } });
        s.whips -= 1;
        s.timer = tele(0.5) + 0.3;
        return false;
      }
      if (!countdown(s, dt)) return false;
      return s.pulled && boss.melee ? basic(boss, "combo", room) : true;
    }
  },
  curse: {
    name: "Curse of the Tomb!", range: "any", tags: ["area"],
    start(boss, s) {
      const wait = tele(3.2);
      for (const p of livingPlayers()) addFx({ kind: "curse", p, x: p.x, y: p.y, life: wait + 0.55, lock: 0.55, r: 72, damage: Math.round(boss.damage * 1.5) });
      tone(180, 0.8, { type: "sawtooth", volume: 0.05, slide: -60 });
      s.timer = 0.5;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },
  sarcophagus: {
    name: "Sarcophagus!", range: "any",
    start(boss, s, room) {
      boss.sigHidden = true;
      boss.sigInvuln = true;
      s.coffin = addProp(boss, room, "coffin", boss.x, boss.y, { name: "Sarcophagus", size: 40, hp: 0.07, data: { spawnAt: state.clock + 0.6 } });
      s.timer = easyMode() ? 5 : 7;
      toast("Break the coffin before he bursts out!", 2.4);
      sfx.rumble();
    },
    update(boss, s, dt, room) {
      if (s.coffin.hp <= 0) {
        boss.sigHidden = false;
        boss.sigInvuln = false;
        floatText(boss.x, boss.y - boss.size, "My coffin!", "#efd29b", 18);
        damageEnemy(boss, boss.maxHp * 0.04, "staff");
        stunEnemy(boss, 1.5);
        return true;
      }
      if (!countdown(s, dt)) return false;
      s.coffin.hp = 0;
      boss.hp = Math.min(boss.maxHp, boss.hp + boss.maxHp * 0.06);
      for (let i = 0; i < 16; i += 1) enemyShot(boss, (i / 16) * Math.PI * 2, bulletSpeed(room) * 0.8, { color: "#efd29b" });
      addShake(8);
      shout(boss, "I RISE!", "#efd29b");
      sfx.roar();
      return true;
    }
  },

  /* ----- Chief Mossbeard ----- */
  vines: {
    name: "Thorn Vines!", range: "any", tags: ["area"],
    start(boss, s) {
      const targets = livingPlayers().slice();
      if (strong(boss) || (boss.brain && boss.brain.phase >= 2)) targets.push(leadPoint(bossTarget(boss), 0.8));
      for (const target of targets) {
        const a = angleTo(boss, target) + rand(-0.3, 0.3);
        addFx({ kind: "vine", x: boss.x, y: boss.y + 10, angle: a, speed: easyMode() ? 240 : 330, travel: 0, lastPoint: 0, reach: 460, points: [], life: 3, damage: Math.round(boss.damage * 0.9) });
      }
      sfx.rumble();
      s.timer = 1.6;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },
  mushrooms: {
    name: "Spore Garden!", range: "far", tags: ["area"],
    start(boss, s, room) {
      const target = bossTarget(boss);
      const old = propsOf(boss, "mushroom");
      const count = easyMode() ? 2 : 3;
      for (let i = 0; i < old.length + count - 5; i += 1) old[i].hp = 0;
      for (let i = 0; i < count; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const d = rand(70, 150);
        addProp(boss, room, "mushroom", target.x + Math.cos(a) * d, target.y + Math.sin(a) * d, { name: "Spore Shroom", size: 24, hp: 0.02, data: { puffAt: state.clock + 0.8 + i * 0.3 } });
      }
      sfx.pop();
      s.timer = 0.5;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },
  wardrums: {
    name: "War Drums!", range: "any",
    start(boss, s) {
      s.beats = 3;
      s.timer = 0.1;
    },
    update(boss, s, dt, room) {
      if (s.beats > 0) {
        boss.hop = Math.max(0, Math.sin((s.timer / 0.4) * Math.PI)) * 20;
        if (!countdown(s, dt)) return false;
        s.beats -= 1;
        s.timer = 0.4;
        effects.push({ type: "shockwave", x: boss.x, y: boss.y + boss.size * 0.3, radius: 20, speed: 280, life: 1.2, max: 1.2, damage: Math.round(boss.damage * 0.6), color: BX.L4, hit: new Set() });
        tone(110, 0.2, { type: "triangle", volume: 0.09 });
        addShake(4);
        return false;
      }
      boss.brain.berserkUntil = state.clock + (easyMode() ? 4 : 8);
      for (let i = 0; i < (easyMode() ? 1 : 3); i += 1) spawnHelper(room, 7, boss.x + rand(-80, 80), boss.y + rand(-80, 80), false);
      for (const enemy of room.enemies) if (enemy.temp && enemy.hp > 0 && !enemy.bossProp && !enemy.drummed) {
        enemy.drummed = true;
        enemy.speed *= 1.3;
      }
      toast("The drums make Mossbeard and his goblins faster!", 2.2);
      return true;
    }
  },
  bushhide: {
    range: "any",
    start(boss, s) {
      s.timer = easyMode() ? 1 : 1.4;
      boss.alpha = 0.15;
      burst(boss.x, boss.y, [BX.L3, BX.L5], 14, 160);
      shout(boss, "*rustle rustle*", BX.L5);
    },
    update(boss, s, dt, room) {
      const target = bossTarget(boss);
      const a = angleTo(boss, target);
      if (Math.hypot(target.x - boss.x, target.y - boss.y) > 90) {
        boss.x += Math.cos(a) * boss.speed * 1.6 * dt;
        boss.y += Math.sin(a) * boss.speed * 1.6 * dt;
      }
      if (Math.random() < dt * 12) burst(boss.x + rand(-14, 14), boss.y + 10, [BX.L3, BX.L4], 1, 50);
      if (!countdown(s, dt)) return false;
      boss.alpha = 1;
      shout(boss, "AMBUSH!", BX.L5);
      return basic(boss, "charge", room);
    },
    clear(boss) {
      boss.alpha = 1;
    }
  },

  /* ----- Count Batula ----- */
  batswarm: {
    name: "Bat Swarm!", range: "any",
    start(boss, s) {
      boss.sigHidden = true;
      boss.sigInvuln = true;
      s.passes = strong(boss) ? 2 : 1;
      s.x = boss.x;
      s.y = boss.y;
      this.aim(boss, s);
      sfx.dash();
    },
    aim(boss, s) {
      const target = bossTarget(boss);
      const a = Math.atan2(target.y - s.y, target.x - s.x);
      const end = inArena(target.x + Math.cos(a) * 160, target.y + Math.sin(a) * 160, 40);
      s.fromX = s.x;
      s.fromY = s.y;
      s.toX = end.x;
      s.toY = end.y;
      s.len = Math.max(0.25, Math.hypot(end.x - s.x, end.y - s.y) / (easyMode() ? 380 : 540));
      s.timer = tele(0.3) + s.len;
      s.warn = tele(0.3);
      s.hit = new Set();
    },
    update(boss, s, dt, room) {
      s.timer -= dt;
      const k = clamp(1 - s.timer / s.len, 0, 1);
      s.x = s.fromX + (s.toX - s.fromX) * k;
      s.y = s.fromY + (s.toY - s.fromY) * k;
      boss.x = s.x;
      boss.y = s.y;
      for (const p of livingPlayers()) {
        if (k <= 0 || s.hit.has(p) || Math.hypot(p.x - s.x, p.y - s.y) > 36 + p.r) continue;
        s.hit.add(p);
        strike(p, boss.damage, s.x, s.y, null, "zone");
      }
      if (s.timer > 0) return false;
      s.passes -= 1;
      if (s.passes > 0) {
        this.aim(boss, s);
        return false;
      }
      boss.sigHidden = false;
      boss.sigInvuln = false;
      for (let i = 0; i < 10; i += 1) enemyShot(boss, (i / 10) * Math.PI * 2, bulletSpeed(room) * 0.8, { color: boss.type.accent });
      sfx.enemyShot();
      return true;
    },
    draw(boss, s) {
      if (s.timer > s.len) drawLane({ x: s.fromX, y: s.fromY }, (s.toX - s.fromX) / (Math.hypot(s.toX - s.fromX, s.toY - s.fromY) || 1), (s.toY - s.fromY) / (Math.hypot(s.toX - s.fromX, s.toY - s.fromY) || 1), Math.hypot(s.toX - s.fromX, s.toY - s.fromY), 50);
      for (let i = 0; i < 10; i += 1) drawBat(s.x + Math.cos(i * 2.4 + state.anim * 9) * 22, s.y + Math.sin(i * 1.7 + state.anim * 11) * 16, i);
    }
  },
  drain: {
    name: "Blood Drain!", range: "mid",
    start(boss, s) {
      s.p = bossTarget(boss);
      s.timer = tele(0.45);
      s.tick = 0;
    },
    update(boss, s, dt) {
      const p = s.p;
      const d = Math.hypot(p.x - boss.x, p.y - boss.y);
      if (p.hp <= 0) return true;
      if (s.step === 0) {
        if (!countdown(s, dt)) return false;
        if (d > 330) return true;
        s.step = 1;
        s.timer = easyMode() ? 1.6 : 2.6;
        return false;
      }
      if (d > 340 || p.dashTime > 0) {
        floatText(p.x, p.y - 46, "Broke free!", "#ffffff", 16);
        return true;
      }
      boss.x += ((p.x - boss.x) / (d || 1)) * boss.speed * 0.5 * dt;
      boss.y += ((p.y - boss.y) / (d || 1)) * boss.speed * 0.5 * dt;
      s.tick -= dt;
      if (s.tick <= 0) {
        s.tick = 0.7;
        const result = strike(p, Math.round(boss.damage * 0.45), boss.x, boss.y, null, "unblock");
        if (result === "hit") {
          boss.hp = Math.min(boss.maxHp, boss.hp + boss.maxHp * (easyMode() ? 0.01 : 0.025));
          burst(boss.x, boss.y, [BX.r2, BX.r3], 6, 80);
        }
      }
      return countdown(s, dt);
    },
    draw(boss, s) {
      const p = s.p;
      const live = s.step === 1;
      const n = Math.floor(Math.hypot(p.x - boss.x, p.y - boss.y) / 12);
      for (let i = 1; i < n; i += 1) {
        if (!live && i % 2) continue;
        const k = i / n;
        const wob = live ? Math.sin(state.anim * 14 + i) * 4 : 0;
        block(boss.x + (p.x - boss.x) * k, boss.y + (p.y - boss.y) * k + wob, live ? 6 : 4, live ? BX.r1 : BX.r2);
        if (live && (i + Math.floor(state.anim * 20)) % 5 === 0) block(boss.x + (p.x - boss.x) * k, boss.y + (p.y - boss.y) * k + wob, 4, BX.r3);
      }
    }
  },
  screech: {
    name: "SCREEEECH!", range: "any",
    start(boss, s) {
      const rings = strong(boss) && !easyMode() ? 2 : 1;
      for (let i = 0; i < rings; i += 1) addFx({ kind: "screech", x: boss.x, y: boss.y, radius: 20 - i * 120, speed: 360, life: 1.9 + i * 0.35, damage: Math.round(boss.damage * 0.5), hit: new Set() });
      tone(1400, 0.6, { type: "sawtooth", volume: 0.05, slide: -900 });
      addShake(5);
      s.timer = 0.6;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },

  /* ----- Crystal Crusher ----- */
  prism: {
    name: "Prism Laser!", range: "far",
    start(boss, s) {
      s.angle = angleTo(boss, bossTarget(boss));
      s.timer = tele(1.1);
    },
    path(boss, angle) {
      const first = rayToWall(boss.x, boss.y, angle);
      const bounce = first.vertical ? Math.PI - angle : -angle;
      const second = rayToWall(first.x, first.y, bounce);
      const len = Math.min(second.dist, 620);
      return [boss.x, boss.y, first.x, first.y, first.x + Math.cos(bounce) * len, first.y + Math.sin(bounce) * len];
    },
    update(boss, s, dt) {
      if (s.step === 1) return countdown(s, dt);
      if (s.timer > tele(0.3)) s.angle = turnToward(s.angle, leadAngle(boss, bossTarget(boss), 900), dt * 1.6);
      if (!countdown(s, dt)) return false;
      const [x0, y0, x1, y1, x2, y2] = this.path(boss, s.angle);
      const damage = Math.round(boss.damage * 1.3);
      warnLine(x0, y0, x1, y1, 20, 0, damage, "laser");
      warnLine(x1, y1, x2, y2, 20, 0, damage, "laser");
      tone(1200, 0.3, { type: "sawtooth", volume: 0.05, slide: -600 });
      s.step = 1;
      s.timer = 0.3;
      return false;
    },
    draw(boss, s) {
      if (s.step === 1) return;
      const [x0, y0, x1, y1, x2, y2] = this.path(boss, s.angle);
      const locked = s.timer <= tele(0.3);
      const color = locked && Math.floor(state.anim * 16) % 2 === 0 ? BX.wh : BX.v2;
      for (const [ax, ay, bx, by] of [[x0, y0, x1, y1], [x1, y1, x2, y2]]) {
        const n = Math.floor(Math.hypot(bx - ax, by - ay) / 10);
        for (let i = 1; i < n; i += 1) block(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n, locked ? 4 : 2, color);
      }
    }
  },
  cage: {
    name: "Crystal Cage!", range: "any", tags: ["area"],
    start(boss, s) {
      const target = bossTarget(boss);
      const warn = tele(0.95);
      addFx({ kind: "cage", x: target.x, y: target.y, r: 105, warn, life: warn + 1.4, damage: Math.round(boss.damage * 1.3), cd: [0, 0] });
      sfx.chime();
      s.timer = 0.5;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },
  mirrorclones: {
    name: "Mirror Clones!", range: "any",
    start(boss, s, room) {
      const target = bossTarget(boss);
      const a = angleTo(target, boss);
      for (const side of [-1.2, 1.2]) {
        const d = Math.hypot(boss.x - target.x, boss.y - target.y);
        addProp(boss, room, "clone", target.x + Math.cos(a + Math.PI + side) * d, target.y + Math.sin(a + Math.PI + side) * d, { name: "Crystal Clone", size: boss.size, hp: 0.035, data: { lifeTime: 10 } });
      }
      burst(boss.x, boss.y, [BX.v2, BX.v3, BX.wh], 20, 220);
      s.timer = 0.5;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },

  /* ----- Brute-zilla ----- */
  bullrush: {
    name: "Bull Rush!", range: "far",
    start(boss, s) {
      s.charges = strong(boss) ? 4 : 3;
      this.wind(boss, s);
    },
    wind(boss, s) {
      aimLock(boss, s, bossTarget(boss), 0.3);
      s.step = 0;
      s.timer = tele(0.38);
      s.hit = new Set();
    },
    update(boss, s, dt, room) {
      if (s.step === 0) {
        if (!countdown(s, dt)) return false;
        s.step = 1;
        s.timer = 0.6;
        sfx.dash();
        return false;
      }
      if (s.step === 1) {
        const bump = chargeStep(boss, s, dt, easyMode() ? 470 : 640, room);
        if (Math.random() < 0.6) burst(boss.x, boss.y + boss.size / 2, [BX.d3, BX.s4], 1, 60);
        if (bump === "pillar") {
          bonk(boss);
          return true;
        }
        if (bump === "wall") {
          addShake(8);
          sfx.slam();
          for (let i = 0; i < 3; i += 1) warnCircle(boss.x + rand(-120, 120), boss.y + rand(-120, 120), 38, tele(0.5) + i * 0.1, Math.round(boss.damage * 0.8), "rock");
        }
        if (!bump && !countdown(s, dt)) return false;
        s.charges -= 1;
        if (s.charges <= 0) return true;
        s.step = 2;
        s.timer = 0.12;
        return false;
      }
      if (!countdown(s, dt)) return false;
      this.wind(boss, s);
      return false;
    },
    draw(boss, s) {
      if (s.step === 0) drawLane(boss, s.dirX, s.dirY, 380, boss.size);
    }
  },
  groundpound: {
    name: "Ground Pound!", range: "mid",
    start(boss, s) {
      setHop(boss, s, leadPoint(bossTarget(boss), 0.5));
      s.len = tele(0.6);
      s.timer = s.len;
      sfx.dash();
    },
    update(boss, s, dt) {
      s.timer -= dt;
      hopAlong(boss, s, 1 - Math.max(0, s.timer) / s.len, 160);
      if (s.timer > 0) return false;
      boss.hop = 0;
      for (const p of livingPlayers()) {
        if (Math.hypot(p.x - boss.x, p.y - boss.y) > 92 + p.r * 0.5) continue;
        strike(p, boss.damage * 1.4, boss.x, boss.y, boss, "parry");
        p.kx *= 2.4;
        p.ky *= 2.4;
      }
      addShockwave(boss, strong(boss) ? 2 : 1);
      addShake(10);
      sfx.slam();
      burst(boss.x, boss.y + 14, [BX.d2, BX.d3, BX.s4], 24, 280);
      return true;
    },
    draw(boss, s) {
      warnRing(s.toX, s.toY, 92, 1 - s.timer / s.len);
    }
  },
  stampede: {
    name: "STAMPEDE!", range: "any",
    start(boss, s) {
      s.runs = easyMode() ? 3 : 5;
      s.horizontal = Math.random() < 0.5;
      this.lane(boss, s);
      sfx.roar();
    },
    lane(boss, s) {
      const target = bossTarget(boss);
      s.horizontal = !s.horizontal;
      const fromLeft = boss.x < WIDTH / 2;
      const fromTop = boss.y < HEIGHT / 2;
      s.goX = s.horizontal ? (fromLeft ? TILE + 50 : WIDTH - TILE - 50) : clamp(target.x, TILE + 50, WIDTH - TILE - 50);
      s.goY = s.horizontal ? clamp(target.y, TILE + 50, HEIGHT - TILE - 50) : fromTop ? TILE + 50 : HEIGHT - TILE - 50;
      s.dirX = s.horizontal ? (fromLeft ? 1 : -1) : 0;
      s.dirY = s.horizontal ? 0 : fromTop ? 1 : -1;
      s.step = 0;
      s.moveT = 0;
      s.hit = new Set();
    },
    update(boss, s, dt, room) {
      if (s.step === 0) {
        const d = Math.hypot(s.goX - boss.x, s.goY - boss.y);
        const move = Math.min(d, 900 * dt);
        boss.x += ((s.goX - boss.x) / (d || 1)) * move;
        boss.y += ((s.goY - boss.y) / (d || 1)) * move;
        // Terrain can push it off its lane spot; charge from wherever it got to.
        s.moveT += dt;
        if (d < 4 || s.moveT > 1.2) {
          s.step = 1;
          s.timer = tele(0.42);
        }
        return false;
      }
      if (s.step === 1) {
        if (!countdown(s, dt)) return false;
        s.step = 2;
        sfx.dash();
        return false;
      }
      const bump = chargeStep(boss, s, dt, easyMode() ? 560 : 820, room);
      if (Math.random() < 0.7) burst(boss.x, boss.y + boss.size / 2, [BX.d3, BX.s4], 1, 60);
      if (bump === "pillar") {
        bonk(boss);
        return true;
      }
      if (!bump) return false;
      addShake(6);
      s.runs -= 1;
      if (s.runs <= 0) return true;
      this.lane(boss, s);
      return false;
    },
    draw(boss, s) {
      if (s.step === 1) drawLane(boss, s.dirX, s.dirY, s.horizontal ? WIDTH : HEIGHT, boss.size);
    }
  },

  /* ----- Grandpa Golem ----- */
  boulder: {
    name: "Boulder Roll!", range: "far",
    start(boss, s, room) {
      const target = bossTarget(boss);
      const count = strong(boss) ? 2 : 1;
      const speed = easyMode() ? 280 : 370;
      for (let i = 0; i < count; i += 1) {
        const a = leadAngle(boss, target, speed) + (i ? 0.5 : 0) * (Math.random() < 0.5 ? -1 : 1);
        addFx({ kind: "mover", style: "boulder", x: boss.x + Math.cos(a) * 40, y: boss.y + Math.sin(a) * 40, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 24, life: 7, bounces: 2, damage: Math.round(boss.damage * 1.2), cd: [0, 0] });
      }
      sfx.rumble();
      s.timer = 0.5;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },
  stomp: {
    name: "Triple Stomp!", range: "mid", tags: ["area"],
    start(boss, s) {
      s.stomps = 3;
      s.len = tele(0.55);
      s.timer = s.len;
    },
    update(boss, s, dt) {
      boss.hop = Math.sin(clamp(1 - s.timer / s.len, 0, 1) * Math.PI) * 34;
      if (!countdown(s, dt)) return false;
      boss.hop = 0;
      const n = 4 - s.stomps;
      effects.push({ type: "shockwave", x: boss.x, y: boss.y + boss.size * 0.3, radius: 20, speed: 230 + n * 90, life: 1.6, max: 1.6, damage: Math.round(boss.damage * 0.8), color: BX.s4, hit: new Set() });
      hitCircle(boss.x, boss.y, 70, boss.damage, boss, "parry");
      addShake(6 + n * 2);
      sfx.slam();
      s.stomps -= 1;
      if (s.stomps === 0) {
        const target = bossTarget(boss);
        for (let i = 0; i < 5; i += 1) warnCircle(target.x + rand(-110, 110), target.y + rand(-110, 110), 40, tele(0.7) + i * 0.08, boss.damage, "rock");
        return true;
      }
      s.timer = s.len;
      return false;
    }
  },
  avalanche: {
    name: "Avalanche!", range: "any", tags: ["area"],
    start(boss, s) {
      const rows = 5;
      const cols = 9;
      const stepY = (HEIGHT - TILE * 2 - 80) / (rows - 1);
      const stepX = (WIDTH - TILE * 2 - 80) / (cols - 1);
      let last = 0;
      for (let r = 0; r < rows; r += 1) {
        const gap = Math.floor(Math.random() * (cols - 1));
        for (let c = 0; c < cols; c += 1) {
          if (c === gap || c === gap + 1 || (easyMode() && c === gap + 2)) continue;
          const warn = tele(0.8) + r * 0.42;
          last = Math.max(last, warn);
          warnCircle(TILE + 40 + c * stepX, TILE + 40 + r * stepY, 46, warn, boss.damage, "rock");
        }
      }
      sfx.rumble();
      addShake(4);
      s.timer = last + 0.2;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },

  /* ----- The Shadow Shifter ----- */
  copycat: {
    name: "Copycat!", range: "any",
    start(boss, s, room) {
      const id = state.bossLastSpell;
      const family = spells.findIndex((spell) => spell.id === id || (spell.evos || []).some((evo) => evo.id === id));
      const target = bossTarget(boss);
      const speed = bulletSpeed(room);
      s.timer = 0.5;
      const names = ["Fireball", "Frost Nova", "Lightning", "Shield", "Poison"];
      shout(boss, family >= 0 ? `Your ${names[family]}? Mine now!` : "Show me a spell...", BX.v3);
      if (family === 0) {
        for (const k of [-0.25, 0, 0.25]) enemyShot(boss, leadAngle(boss, target, speed * 0.8) + k, speed * 0.8, { color: "#b35cff", r: 14, kind: "flame", damage: Math.round(boss.damage * 1.2) });
        sfx.fireball();
      } else if (family === 1) {
        for (let i = 0; i < 18; i += 1) enemyShot(boss, (i / 18) * Math.PI * 2, speed * 0.55, { color: "#bdf1ff" });
        addRing(boss.x, boss.y, 110, "#bdf1ff", 0.4, 10);
        sfx.nova();
      } else if (family === 2) {
        for (const p of livingPlayers()) {
          for (const off of [-70, 0, 70]) warnLine(p.x + off, TILE, p.x + off, HEIGHT - TILE, 24, tele(0.6), boss.damage, "zap");
        }
        sfx.zap();
      } else if (family === 3) {
        boss.sigInvuln = true;
        s.timer = 2;
        sfx.shield();
      } else if (family === 4) {
        for (let i = 0; i < 3; i += 1) {
          const spot = leadPoint(target, 0.3 + i * 0.3);
          warnCircle(spot.x + rand(-40, 40), spot.y + rand(-40, 40), 50, tele(0.6) + i * 0.15, Math.round(boss.damage * 0.8), "curse", { after: (fx) => addZone(fx.x, fx.y, 50, 5, "poison", boss) });
        }
      } else {
        const lead = leadAngle(boss, target, speed);
        for (let i = -3; i <= 3; i += 1) enemyShot(boss, lead + i * 0.15, speed, { color: "#b35cff" });
        sfx.enemyShot();
      }
    },
    update: (boss, s, dt) => countdown(s, dt),
    draw(boss, s) {
      if (boss.sigInvuln) blockRing(boss.x, boss.y, boss.size * 0.75, BX.p2, 4, 2, state.anim * 8);
    }
  },
  echoslash: {
    name: "Echo Slash!", range: "near", instant: true,
    start(boss) {
      boss.brain.echoUntil = state.clock + 2.2;
      startSwings(boss, [{ kind: "arc", delay: tele(0.35) }, { kind: "arc", delay: rand(0.18, 0.4) }, { kind: "thrust", delay: 0.3 }]);
    }
  },
  lightsout: {
    name: "Lights Out!", range: "any",
    start(boss, s) {
      addFx({ kind: "dark", mode: "dark", radius: easyMode() ? 170 : 120, life: easyMode() ? 4.5 : 7.5 });
      s.strikes = easyMode() ? 2 : 3;
      s.timer = 0.6;
      sfx.portal();
    },
    update(boss, s, dt) {
      if (s.step === 0) {
        boss.sigHidden = true;
        boss.sigInvuln = true;
        if (!countdown(s, dt)) return false;
        const target = bossTarget(boss);
        const a = Math.random() * Math.PI * 2;
        const spot = inArena(target.x + Math.cos(a) * 80, target.y + Math.sin(a) * 80, 40);
        boss.x = spot.x;
        boss.y = spot.y;
        s.step = 1;
        s.timer = tele(0.35);
        return false;
      }
      if (s.step === 1) {
        boss.sigHidden = false;
        boss.sigInvuln = false;
        const target = bossTarget(boss);
        const d = Math.hypot(target.x - boss.x, target.y - boss.y) || 1;
        boss.lockX = (target.x - boss.x) / d;
        boss.lockY = (target.y - boss.y) / d;
        if (!countdown(s, dt)) return false;
        boss.swingSide = -(boss.swingSide || 1);
        meleeHit(boss, { kind: "arc", heavy: true, side: boss.swingSide });
        s.strikes -= 1;
        if (s.strikes <= 0) return true;
        s.step = 0;
        s.timer = 0.55;
        return false;
      }
      return true;
    },
    draw(boss, s) {
      if (s.step !== 1) return;
      // Two red eyes glint in the dark just before it strikes.
      block(boss.x - 7, boss.y - boss.size * 0.35, 6, BX.r2);
      block(boss.x + 7, boss.y - boss.size * 0.35, 6, BX.r2);
    }
  },

  /* ----- Mega Mud Puff ----- */
  mudmines: {
    name: "Mud Mines!", range: "any", tags: ["area"],
    start(boss, s, room) {
      const target = bossTarget(boss);
      const old = propsOf(boss, "mine");
      const count = easyMode() ? 3 : 4;
      for (let i = 0; i < old.length + count - 9; i += 1) {
        old[i].boomed = true;
        old[i].hp = 0;
      }
      for (let i = 0; i < count; i += 1) {
        const a = (i / count) * Math.PI * 2 + Math.random();
        const d = rand(60, 170);
        const spot = inArena(target.x + Math.cos(a) * d, target.y + Math.sin(a) * d, 40);
        warnCircle(spot.x, spot.y, 20, 0.5, 0, "mud", { sx: boss.x, sy: boss.y, after: (fx) => addProp(boss, room, "mine", fx.x, fx.y, { name: "Mud Mine", size: 18, hp: 0.005 }) });
      }
      s.timer = 0.6;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },
  geysers: {
    name: "Mud Geysers!", range: "any", tags: ["area"],
    start(boss, s) {
      s.left = strong(boss) ? 8 : 6;
      s.timer = 0;
    },
    update(boss, s, dt) {
      if (s.left <= 0) return countdown(s, dt);
      if (!countdown(s, dt)) return false;
      const target = bossTarget(boss);
      warnCircle(target.x, target.y, 46, tele(0.55), boss.damage, "geyser", { after: (fx) => addZone(fx.x, fx.y, 40, 5, "mud", boss) });
      s.left -= 1;
      s.timer = s.left > 0 ? 0.22 : tele(0.55) + 0.2;
      return false;
    }
  },
  puffup: {
    name: "Puff... puff...", range: "any",
    start(boss, s) {
      boss.brain.puff = 0;
      s.len = tele(3);
      s.timer = s.len;
      tone(200, 2.5, { type: "sine", volume: 0.04, slide: 400 });
    },
    radius(s) {
      return 110 + 210 * clamp(1 - s.timer / s.len, 0, 1);
    },
    update(boss, s, dt, room) {
      const k = clamp(1 - s.timer / s.len, 0, 1);
      boss.size = boss.brain.baseSize * (1 + 0.8 * k);
      const early = boss.brain.puff >= boss.maxHp * 0.07;
      if (!countdown(s, dt) && !early) return false;
      const r = this.radius(s);
      floatText(boss.x, boss.y - boss.size, early ? "POP!" : "BOOOOM!", "#efd29b", early ? 18 : 26);
      hitCircle(boss.x, boss.y, r, Math.round(boss.damage * (1.2 + k)), null, "zone");
      for (let i = 0; i < 16; i += 1) enemyShot(boss, (i / 16) * Math.PI * 2, bulletSpeed(room) * 0.8, { color: BX.d3 });
      addRing(boss.x, boss.y, r, BX.d3, 0.4, 14);
      burst(boss.x, boss.y, [BX.d2, BX.d3, BX.y2], 40, 360);
      addShake(12);
      sfx.boom();
      boss.size = boss.brain.baseSize;
      boss.brain.puff = undefined;
      stunEnemy(boss, 1);
      return true;
    },
    clear(boss) {
      if (!boss.brain) return;
      boss.size = boss.brain.baseSize;
      boss.brain.puff = undefined;
    },
    draw(boss, s) {
      warnRing(boss.x, boss.y, this.radius(s), clamp(1 - s.timer / s.len, 0, 1));
      outlinedText("Hit it to pop it early!", boss.x, boss.y - boss.size - 20, { size: 13, align: "center", font: DISPLAY_FONT, color: "#efd29b" });
    }
  },

  /* ----- Quartz Commander ----- */
  shieldwall: {
    name: "Shield Wall!", range: "any",
    start(boss, s) {
      boss.brain.shieldUp = true;
      s.timer = 3.2;
      s.shoot = tele(0.6);
      sfx.shield();
    },
    update(boss, s, dt, room) {
      const target = bossTarget(boss);
      const a = angleTo(boss, target);
      if (Math.hypot(target.x - boss.x, target.y - boss.y) > 110) {
        boss.x += Math.cos(a) * boss.speed * 0.7 * dt * (s.slow || 1);
        boss.y += Math.sin(a) * boss.speed * 0.7 * dt * (s.slow || 1);
      }
      s.shoot -= dt;
      if (s.shoot <= 0) {
        s.shoot = tele(0.6);
        const lead = leadAngle(boss, target, bulletSpeed(room));
        for (const k of [-0.18, 0, 0.18]) enemyShot(boss, lead + k, bulletSpeed(room), { color: "#f6c85f", kind: "arrow" });
      }
      return countdown(s, dt);
    },
    clear(boss) {
      if (boss.brain) boss.brain.shieldUp = false;
    }
  },
  phalanx: {
    name: "Phalanx Charge!", range: "far",
    start(boss, s) {
      boss.brain.shieldUp = true;
      aimLock(boss, s, bossTarget(boss), 0.3);
      s.timer = tele(0.45);
      s.hit = new Set();
      s.shove = 2.5;
    },
    update(boss, s, dt, room) {
      if (s.step === 0) {
        boss.brain.face = Math.atan2(s.dirY, s.dirX);
        if (!countdown(s, dt)) return false;
        s.step = 1;
        s.timer = 0.55;
        sfx.dash();
        return false;
      }
      boss.brain.face = Math.atan2(s.dirY, s.dirX);
      const bump = chargeStep(boss, s, dt, easyMode() ? 440 : 600, room);
      if (bump === "pillar") {
        bonk(boss);
        return true;
      }
      return bump === "wall" || countdown(s, dt);
    },
    clear(boss) {
      if (boss.brain) boss.brain.shieldUp = false;
    },
    draw(boss, s) {
      if (s.step === 0) drawLane(boss, s.dirX, s.dirY, 340, boss.size);
    }
  },
  archers: {
    name: "Archers! Loose!", range: "any", tags: ["area"],
    start(boss, s) {
      s.waves = easyMode() ? 2 : 3;
      s.timer = 0;
    },
    update(boss, s, dt) {
      if (s.waves <= 0) return countdown(s, dt);
      if (!countdown(s, dt)) return false;
      const target = bossTarget(boss);
      const vertical = Math.random() < 0.5;
      const lanes = 7;
      const span = vertical ? WIDTH - TILE * 2 : HEIGHT - TILE * 2;
      const mine = Math.floor(((vertical ? target.x : target.y) - TILE) / (span / lanes));
      for (let i = 0; i < lanes; i += 1) {
        if (i !== mine && Math.random() < (easyMode() ? 0.6 : 0.4)) continue;
        const c = TILE + (i + 0.5) * (span / lanes);
        if (vertical) warnLine(c, TILE, c, HEIGHT - TILE, 22, tele(0.75), Math.round(boss.damage * 0.9), "arrow");
        else warnLine(TILE, c, WIDTH - TILE, c, 22, tele(0.75), Math.round(boss.damage * 0.9), "arrow");
      }
      s.waves -= 1;
      s.timer = s.waves > 0 ? tele(1) : tele(0.75) + 0.3;
      return false;
    }
  }
};

function drawBat(x, y, i) {
  const flap = Math.floor(state.anim * 14 + i) % 2;
  block(x, y, 8, BX.out);
  block(x, y, 4, BX.v1);
  block(x - 6, y - (flap ? 3 : -1), 6, BX.out);
  block(x + 6, y - (flap ? 3 : -1), 6, BX.out);
  block(x - 1, y - 1, 2, BX.r2);
}

/* ---------- big bosses and the dragon ----------
   Same brain, but phases follow their own story: phase 1 is the first health
   bar, phase 2 starts after they transform, and the last stand (desperate)
   brings the ultimate. unlock says which phase each move appears in. */

const BIG_KITS = [
  { name: "King Bonecrown", mood: { pace: 1, rest: 0.7, cunning: 0.5, chain: 0.6 }, moves: ["decree", "crowntoss", "bonethrone"], unlock: [1, 1, 2], ult: "armyofdead", passive: null, lines: ["The crown commands it!", "RISE, MY ARMY!"] },
  { name: "Magmaw", mood: { pace: 1, rest: 0.8, cunning: 0.3, chain: 0.6 }, moves: ["magmafist", "eruption", "lavaflood"], unlock: [1, 1, 2], ult: "coremeltdown", passive: null, lines: ["The volcano wakes!", "MELTDOWN!"] },
  { name: "Queen Frostbite", mood: { pace: 0.95, rest: 0.7, cunning: 0.7, chain: 0.6 }, moves: ["glacierwall", "hailstorm", "iceprison"], unlock: [1, 1, 2], ult: "absolutezero", passive: null, lines: ["Winter is my kingdom.", "ABSOLUTE ZERO!"] },
  { name: "Count Shadowfang", mood: { pace: 0.9, rest: 0.6, cunning: 0.9, chain: 0.7 }, moves: ["bloodsigils", "miststrike", "batcloak"], unlock: [1, 1, 2], ult: "bloodmoon", passive: null, lines: ["The night is young.", "BLOOD MOON!"] },
  { name: "Crystal Colossus", mood: { pace: 1, rest: 0.7, cunning: 0.4, chain: 0.6 }, moves: ["prismcross", "shardorbit", "refraction"], unlock: [1, 1, 2], ult: "shattersplit", passive: null, lines: ["I am the cathedral.", "SHATTER!"] }
];

const DRAGON_KIT = { name: "Blocky", mood: { pace: 1, rest: 0.6, cunning: 0.3, chain: 0.7 }, moves: ["winggust", "skydive", "meteorbreath"], unlock: [1, 1, 2], ult: "inferno", passive: null, lines: ["ROAAAR!", "INFERNO!"] };

Object.assign(BASIC_INFO, { breath: { range: "mid" } });

// Short blink-and-strike used by mist strikes: vanish, appear beside you, slash.
function blinkStrike(boss, s, dt, room) {
  if (s.step === 0) {
    boss.sigHidden = true;
    boss.sigInvuln = true;
    if (!countdown(s, dt)) return false;
    const target = bossTarget(boss);
    const a = Math.random() * Math.PI * 2;
    const spot = inArena(target.x + Math.cos(a) * (boss.size * 0.5 + 60), target.y + Math.sin(a) * (boss.size * 0.5 + 60), boss.size * 0.5);
    boss.x = spot.x;
    boss.y = spot.y;
    s.step = 1;
    s.timer = tele(0.32);
    burst(boss.x, boss.y, [BX.v1, BX.v2], 12, 160);
    return false;
  }
  boss.sigHidden = false;
  boss.sigInvuln = false;
  const target = bossTarget(boss);
  const d = Math.hypot(target.x - boss.x, target.y - boss.y) || 1;
  boss.lockX = (target.x - boss.x) / d;
  boss.lockY = (target.y - boss.y) / d;
  if (!countdown(s, dt)) return false;
  boss.swingSide = -(boss.swingSide || 1);
  meleeHit(boss, { kind: "arc", heavy: true, side: boss.swingSide });
  s.strikes -= 1;
  if (s.strikes <= 0) return true;
  s.step = 0;
  s.timer = 0.4;
  return false;
}

Object.assign(SIGS, {
  /* ----- King Bonecrown ----- */
  decree: {
    name: "Royal Decree!", range: "any", tags: ["area"],
    start(boss, s) {
      const target = bossTarget(boss);
      const warn = tele(0.85);
      const after = (fx) => {
        const len = Math.hypot(fx.x2 - fx.x1, fx.y2 - fx.y1);
        for (let d = 0; d < len; d += 56) addFx({ kind: "flash", style: "bone", x: fx.x1 + ((fx.x2 - fx.x1) * d) / len, y: fx.y1 + ((fx.y2 - fx.y1) * d) / len, life: 0.5, r: 30 });
      };
      warnLine(TILE, target.y, WIDTH - TILE, target.y, 56, warn, Math.round(boss.damage * 1.1), "bone", { after });
      warnLine(target.x, TILE, target.x, HEIGHT - TILE, 56, warn, Math.round(boss.damage * 1.1), "bone", { after });
      if (boss.phase2) {
        const y2 = target.y < HEIGHT / 2 ? target.y + 170 : target.y - 170;
        warnLine(TILE, y2, WIDTH - TILE, y2, 56, warn + 0.4, Math.round(boss.damage * 1.1), "bone", { after });
      }
      sfx.rumble();
      s.timer = warn + 0.6;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },
  crowntoss: {
    name: "Crown Toss!", range: "far",
    start(boss, s) {
      const target = bossTarget(boss);
      const speed = easyMode() ? 420 : 560;
      const base = leadAngle(boss, target, speed);
      const spread = boss.phase2 ? [-0.45, 0, 0.45] : [-0.3, 0.3];
      for (const k of spread) addFx({ kind: "boomer", home: boss, x: boss.x, y: boss.y - boss.size * 0.6, vx: Math.cos(base + k) * speed, vy: Math.sin(base + k) * speed, turn: 0.55, r: 18, life: 4, damage: Math.round(boss.damage * 0.9), cd: [0, 0] });
      sfx.slash(true);
      s.timer = 0.6;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },
  bonethrone: {
    name: "Bone Throne!", range: "any",
    start(boss, s, room) {
      const target = bossTarget(boss);
      const spot = { x: target.x < WIDTH / 2 ? WIDTH - TILE - 110 : TILE + 110, y: target.y < HEIGHT / 2 ? HEIGHT - TILE - 100 : TILE + 100 };
      if (!propsOf(boss, "throne").length) addProp(boss, room, "throne", spot.x, spot.y, { name: "Bone Throne", size: 44, hp: 0.06 });
      toast("The Bone Throne heals the king. Smash it!", 2.6);
      sfx.rumble();
      s.timer = 0.6;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },
  armyofdead: {
    name: "Army of the Dead!", range: "any",
    start(boss, s, room) {
      let raised = 0;
      for (const enemy of room.enemies) {
        if (raised >= 6 || enemy.hp > 0 || enemy.bossProp || enemy.typeIndex !== boss.minionType) continue;
        enemy.hp = Math.round(enemy.maxHp * 0.6);
        enemy.temp = true;
        enemy.attackTimer = 1;
        warnCircle(enemy.x, enemy.y, 26, 0.3, 0, "hand");
        raised += 1;
      }
      for (let i = raised; i < (easyMode() ? 2 : 4); i += 1) {
        const spot = randomSpot(80);
        warnCircle(spot.x, spot.y, 26, 0.4, 0, "hand", { after: (fx) => spawnHelper(room, boss.minionType, fx.x, fx.y, false) });
      }
      toast("Every skeleton you beat is getting back up!", 2.4);
      sfx.roar();
      s.timer = 0.8;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },

  /* ----- Magmaw ----- */
  magmafist: {
    name: "Magma Fist!", range: "far",
    start(boss, s) {
      aimLock(boss, s, bossTarget(boss), 0.25);
      s.timer = tele(0.55);
    },
    update(boss, s, dt) {
      if (s.step === 1) return countdown(s, dt);
      if (!countdown(s, dt)) return false;
      let last = 0;
      addFx({ kind: "mover", style: "fist", x: boss.x + s.dirX * 50, y: boss.y + s.dirY * 50, vx: s.dirX * 720, vy: s.dirY * 720, r: 24, life: 3, bounces: 0, damage: Math.round(boss.damage * 1.3), cd: [0, 0], trail: (fx) => {
        if (fx.travel - last < 44) return;
        last = fx.travel;
        addZone(fx.x, fx.y, 30, 4, "fire", boss);
      }, after: (fx) => {
        addShake(8);
        sfx.slam();
        for (let i = 0; i < 4; i += 1) warnCircle(fx.x + rand(-110, 110), fx.y + rand(-110, 110), 40, tele(0.5) + i * 0.08, boss.damage, "rock");
      } });
      sfx.fireball();
      s.step = 1;
      s.timer = 0.4;
      return false;
    },
    draw(boss, s) {
      if (s.step === 0) drawLane(boss, s.dirX, s.dirY, 520, 50);
    }
  },
  eruption: {
    name: "Eruption!", range: "any", tags: ["area"],
    start(boss, s) {
      const target = bossTarget(boss);
      const rings = [[150, 8], [80, 5], [0, 1]];
      rings.forEach(([r, n], wave) => {
        for (let i = 0; i < n; i += 1) {
          const a = (i / n) * Math.PI * 2 + wave;
          warnCircle(target.x + Math.cos(a) * r, target.y + Math.sin(a) * r, 42, tele(0.7) + wave * 0.38, boss.damage, "fire", { after: (fx) => addZone(fx.x, fx.y, 28, 3, "fire", boss) });
        }
      });
      sfx.rumble();
      s.timer = tele(0.7) + 1;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },
  lavaflood: {
    name: "Lava Flood!", range: "any", tags: ["area"],
    start(boss, s) {
      addFx({ kind: "flood", depth: 0, max: 0, rise: 2.5, hold: easyMode() ? 2.5 : 4.5, top: easyMode() ? 100 : 150, life: (easyMode() ? 2.5 : 4.5) + 3.5, damage: Math.round(boss.damage * 0.6), cd: [0, 0] });
      toast("Lava is rising! Stay in the middle!", 2.2);
      sfx.rumble();
      s.timer = 0.6;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },
  coremeltdown: {
    name: "Core Meltdown!", range: "any",
    start(boss, s) {
      s.timer = easyMode() ? 6 : 8;
      s.cycle = 0;
      s.open = false;
      s.vent = 0;
      toast("Only his glowing core can be hurt. Hit it when it opens!", 3);
    },
    update(boss, s, dt) {
      s.cycle -= dt;
      if (s.cycle <= 0) {
        s.open = !s.open;
        s.cycle = s.open ? (easyMode() ? 1.6 : 1.1) : tele(1.6);
        if (s.open) shout(boss, "HIT THE CORE!", BX.y2);
      }
      boss.sigInvuln = !s.open;
      s.vent -= dt;
      if (!s.open && s.vent <= 0) {
        s.vent = easyMode() ? 0.8 : 0.5;
        const target = bossTarget(boss);
        warnCircle(target.x + rand(-30, 30), target.y + rand(-30, 30), 40, tele(0.6), boss.damage, "fire");
      }
      return countdown(s, dt);
    },
    draw(boss, s) {
      const y = boss.y - boss.size * 0.3;
      if (s.open) {
        blockDisc(boss.x, y, 18, BX.out);
        blockDisc(boss.x, y, 14, Math.floor(state.anim * 12) % 2 ? BX.y3 : BX.y2);
      } else {
        blockRing(boss.x, boss.y, boss.size * 0.7, BX.r1, 4, 2, state.anim * 6);
      }
    }
  },

  /* ----- Queen Frostbite ----- */
  glacierwall: {
    name: "Glacier Wall!", range: "any",
    start(boss, s, room) {
      const target = bossTarget(boss);
      const vertical = Math.random() < 0.5;
      const blocks = [];
      const count = vertical ? 6 : 9;
      const gap = Math.floor(Math.random() * count);
      for (let i = 0; i < count; i += 1) {
        if (i === gap) continue;
        const x = vertical ? Math.round((target.x + (target.x < WIDTH / 2 ? 90 : -90)) / TILE) * TILE : TILE * 2 + i * TILE * 3;
        const y = vertical ? TILE * 2 + i * TILE * 2.4 : Math.round((target.y + (target.y < HEIGHT / 2 ? 80 : -80)) / TILE) * TILE;
        blocks.push({ x, y });
      }
      s.walls = blocks;
      s.timer = tele(0.6);
      s.room = room;
    },
    update(boss, s, dt) {
      if (s.step === 1) return countdown(s, dt);
      if (!countdown(s, dt)) return false;
      const made = [];
      for (const b of s.walls) {
        const wall = { x: b.x, y: b.y, w: TILE, h: TILE * 2, hp: 99, wobble: 0, stone: true, iceWall: true };
        if (livingPlayers().some((p) => circleHitsRect(p.x, p.y, p.r + 6, wall)) || circleHitsRect(boss.x, boss.y, boss.size * 0.5, wall)) continue;
        s.room.crates.push(wall);
        made.push(wall);
      }
      addFx({ kind: "icewalls", walls: made, room: s.room, life: easyMode() ? 4 : 7 });
      addShake(5);
      sfx.slam();
      s.step = 1;
      s.timer = 0.3;
      return false;
    },
    draw(boss, s) {
      if (s.step === 0) for (const b of s.walls) warnRing(b.x + TILE / 2, b.y + TILE, TILE * 0.7, 1 - s.timer / tele(0.6));
    }
  },
  hailstorm: {
    name: "Hailstorm!", range: "any", tags: ["area"],
    start(boss, s) {
      const target = bossTarget(boss);
      const count = easyMode() ? 10 : 16;
      let last = 0;
      for (let i = 0; i < count; i += 1) {
        const a = i * 0.75;
        const r = 20 + i * 14;
        const warn = tele(0.6) + i * 0.08;
        last = warn;
        warnCircle(target.x + Math.cos(a) * r, target.y + Math.sin(a) * r, 38, warn, boss.damage, "ice");
      }
      s.timer = last + 0.2;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },
  iceprison: {
    name: "Ice Prison!", range: "any",
    start(boss, s) {
      addFx({ kind: "stillcheck", life: 7, damage: Math.round(boss.damage * 0.7), still: [0, 0] });
      toast("Keep moving or you'll freeze solid!", 2.4);
      s.timer = 0.5;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },
  absolutezero: {
    name: "Absolute Zero!", range: "any",
    start(boss, s) {
      addFx({ kind: "icefloor", life: easyMode() ? 5 : 9 });
      toast("The whole floor froze! It's slippery!", 2.4);
      sfx.nova();
      addShake(6);
      s.timer = 0.6;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },

  /* ----- Count Shadowfang ----- */
  bloodsigils: {
    name: "Blood Sigils!", range: "any", tags: ["area"],
    start(boss, s) {
      const target = bossTarget(boss);
      const a = angleTo(boss, target);
      const count = easyMode() ? 6 : 9;
      let last = 0;
      for (let i = 0; i < count; i += 1) {
        const d = 60 + i * 52;
        const wob = Math.sin(i * 1.3) * 40;
        const warn = tele(0.6) + i * 0.1;
        last = warn;
        warnCircle(boss.x + Math.cos(a) * d - Math.sin(a) * wob, boss.y + Math.sin(a) * d + Math.cos(a) * wob, 44, warn, boss.damage, "blood");
      }
      if (boss.phase2) for (let i = 0; i < 5; i += 1) warnCircle(target.x + Math.cos(i * 1.26) * 110, target.y + Math.sin(i * 1.26) * 110, 40, last + 0.2, boss.damage, "blood");
      s.timer = last + 0.4;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },
  miststrike: {
    name: "Mist Strike!", range: "any",
    start(boss, s) {
      s.strikes = easyMode() ? 2 : 3;
      s.timer = 0.3;
    },
    update: (boss, s, dt, room) => blinkStrike(boss, s, dt, room),
    draw(boss, s) {
      if (s.step === 1) {
        block(boss.x - 9, boss.y - boss.size * 0.45, 8, BX.r2);
        block(boss.x + 9, boss.y - boss.size * 0.45, 8, BX.r2);
      }
    }
  },
  batcloak: {
    name: "Bat Cloak!", range: "any",
    start(boss, s, room) {
      const count = easyMode() ? 5 : 8;
      for (let i = 0; i < count; i += 1) addProp(boss, room, "orbitbat", boss.x, boss.y, { name: "Cloak Bat", size: 18, hp: 0.008, data: { angle: (i / count) * Math.PI * 2 } });
      boss.brain.cloakUntil = state.clock + 8;
      toast("Bats are shielding the Count. Hit the bats!", 2.4);
      s.timer = 0.6;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },
  bloodmoon: {
    name: "BLOOD MOON!", range: "any",
    start(boss, s) {
      const life = easyMode() ? 5 : 8;
      addFx({ kind: "dark", mode: "blood", radius: easyMode() ? 200 : 150, life });
      addFx({ kind: "bloodrain", life, boss, tick: 0 });
      boss.brain.bloodUntil = state.clock + life;
      sfx.roar();
      s.timer = 0.8;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },

  /* ----- Crystal Colossus ----- */
  prismcross: {
    name: "Prism Cross!", range: "any",
    start(boss, s) {
      addFx({ kind: "cross", boss, angle: angleTo(boss, bossTarget(boss)) + Math.PI / 4, spin: (Math.random() < 0.5 ? -1 : 1) * (easyMode() ? 0.4 : 0.65), arms: boss.phase2 ? 6 : 4, warn: tele(0.9), life: tele(0.9) + 3, damage: Math.round(boss.damage * 0.9), cd: [0, 0] });
      tone(900, 0.4, { type: "sawtooth", volume: 0.04, slide: 300 });
      s.timer = tele(0.9) + 3;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },
  shardorbit: {
    name: "Shard Orbit!", range: "any",
    start(boss, s, room) {
      for (const old of propsOf(boss, "orbit")) old.hp = 0;
      const count = easyMode() ? 4 : 6;
      for (let i = 0; i < count; i += 1) addProp(boss, room, "orbit", boss.x, boss.y, { name: "Orbit Shard", size: 22, hp: 0.012, data: { angle: (i / count) * Math.PI * 2 } });
      toast("Orbiting shards shield the Colossus. Break them!", 2.4);
      s.timer = 0.6;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },
  refraction: {
    name: "Refraction!", range: "any",
    start(boss, s) {
      boss.brain.reflectUntil = state.clock + (easyMode() ? 2.5 : 4);
      shout(boss, "Your magic bounces off me!", BX.v3);
      sfx.shield();
      s.timer = 0.5;
    },
    update: (boss, s, dt) => countdown(s, dt)
  },
  shattersplit: {
    name: "SHATTER!", range: "any",
    start(boss, s, room) {
      boss.sigHidden = true;
      boss.sigInvuln = true;
      s.clones = [];
      for (let i = 0; i < 3; i += 1) {
        const a = (i / 3) * Math.PI * 2;
        s.clones.push(addProp(boss, room, "mini", boss.x + Math.cos(a) * 120, boss.y + Math.sin(a) * 120, { name: "Crystal Shard Golem", size: boss.size * 0.55, hp: 0.05, speed: boss.speed * 1.2 }));
      }
      s.timer = easyMode() ? 9 : 12;
      burst(boss.x, boss.y, [BX.v2, BX.v3, BX.wh], 40, 320);
      addShake(10);
      sfx.boom();
    },
    update(boss, s, dt, room) {
      const alive = s.clones.filter((c) => c.hp > 0);
      if (alive.length) {
        boss.x = alive[0].x;
        boss.y = alive[0].y;
      }
      if (!alive.length) {
        boss.sigHidden = false;
        boss.sigInvuln = false;
        floatText(boss.x, boss.y - boss.size, "Cracked!", BX.v3, 20);
        damageEnemy(boss, boss.maxHp * 0.08, "staff");
        stunEnemy(boss, 1.4);
        return true;
      }
      if (!countdown(s, dt)) return false;
      boss.hp = Math.min(boss.maxHp, boss.hp + boss.maxHp * 0.05 * alive.length);
      for (const c of alive) c.hp = 0;
      shout(boss, "Whole again!", BX.v3);
      return true;
    }
  },

  /* ----- Blocky the Dragon ----- */
  winggust: {
    name: "Wing Gust!", range: "any",
    start(boss, s) {
      s.timer = easyMode() ? 1.2 : 1.8;
      s.debris = 0;
      sfx.dash();
      for (let i = 0; i < 4; i += 1) {
        const side = i % 2 ? TILE + 60 : WIDTH - TILE - 60;
        warnCircle(side, rand(TILE + 80, HEIGHT - TILE - 80), 50, tele(0.8) + i * 0.2, boss.damage, "fireball");
      }
    },
    update(boss, s, dt, room) {
      for (const p of livingPlayers()) {
        if (p.dashTime > 0) continue;
        const a = angleTo(boss, p);
        p.kx += Math.cos(a) * (easyMode() ? 500 : 900) * dt;
        p.ky += Math.sin(a) * (easyMode() ? 500 : 900) * dt;
      }
      s.debris -= dt;
      if (s.debris <= 0) {
        s.debris = 0.15;
        enemyShot(boss, angleTo(boss, bossTarget(boss)) + rand(-0.6, 0.6), bulletSpeed(room) * 0.9, { color: "#d4a96f", r: 6 });
      }
      if (Math.random() < dt * 30) burst(boss.x + rand(-60, 60), boss.y + 40, [BX.wh, BX.s5], 1, 300);
      return countdown(s, dt);
    }
  },
  skydive: {
    name: "Sky Dive!", range: "any",
    start(boss, s) {
      s.timer = 0.45;
      sfx.roar();
    },
    update(boss, s, dt, room) {
      const target = bossTarget(boss);
      if (s.step === 0) {
        boss.hop = (1 - s.timer / 0.45) * 500;
        if (!countdown(s, dt)) return false;
        boss.sigHidden = true;
        boss.sigInvuln = true;
        s.x = boss.x;
        s.y = boss.y;
        s.step = 1;
        s.timer = tele(1.5);
        return false;
      }
      if (s.step === 1) {
        const a = Math.atan2(target.y - s.y, target.x - s.x);
        const d = Math.hypot(target.x - s.x, target.y - s.y);
        const move = Math.min(d, (easyMode() ? 200 : 300) * dt);
        s.x += Math.cos(a) * move;
        s.y += Math.sin(a) * move;
        boss.x = s.x;
        boss.y = s.y;
        if (countdown(s, dt)) {
          s.step = 2;
          s.timer = tele(0.45);
        }
        return false;
      }
      if (s.step === 2) {
        if (countdown(s, dt)) {
          s.step = 3;
          s.timer = 0.2;
          boss.sigHidden = false;
          boss.sigInvuln = false;
        }
        return false;
      }
      boss.hop = Math.max(0, s.timer / 0.2) * 400;
      if (!countdown(s, dt)) return false;
      boss.hop = 0;
      hitCircle(boss.x, boss.y, 120, Math.round(boss.damage * 1.3), null, "zone");
      addShockwave(boss, 2);
      for (let i = 0; i < 8; i += 1) addZone(boss.x + Math.cos(i * 0.785) * 110, boss.y + Math.sin(i * 0.785) * 80, 28, 4, "fire", boss);
      addShake(14);
      sfx.slam();
      return true;
    },
    draw(boss, s) {
      if (s.step < 1) return;
      blockDisc(s.x, s.y + 10, 70, BX.s1, 0.45);
      blockDisc(s.x, s.y + 10, 52, BX.s0, 0.45);
      if (s.step >= 2) warnRing(s.x, s.y, 120, 1 - s.timer / tele(0.45));
    }
  },
  meteorbreath: {
    name: "Meteor Breath!", range: "mid", tags: ["area"],
    start(boss, s, room) {
      dragonBreath(boss, room);
      const target = bossTarget(boss);
      const a = angleTo(boss, target);
      for (let i = 0; i < 6; i += 1) {
        const d = 120 + i * 70;
        const spot = { x: boss.x + Math.cos(a + rand(-0.3, 0.3)) * d, y: boss.y + Math.sin(a + rand(-0.3, 0.3)) * d };
        warnCircle(spot.x, spot.y, 52, tele(0.9) + i * 0.12, boss.damage, "fireball", { after: (fx) => addZone(fx.x, fx.y, 34, 3.5, "fire", boss) });
      }
      s.timer = 0.6;
      s.again = 0.4;
    },
    update(boss, s, dt, room) {
      if (s.again > 0) {
        s.again -= dt;
        if (s.again <= 0) dragonBreath(boss, room);
      }
      return countdown(s, dt);
    }
  },
  inferno: {
    name: "INFERNO!", range: "any", tags: ["area"],
    start(boss, s) {
      s.waves = easyMode() ? 2 : 4;
      s.timer = 0;
      s.horizontal = Math.random() < 0.5;
    },
    update(boss, s, dt) {
      if (s.waves <= 0) return countdown(s, dt);
      if (!countdown(s, dt)) return false;
      s.horizontal = !s.horizontal;
      const lanes = 6;
      const span = s.horizontal ? HEIGHT - TILE * 2 : WIDTH - TILE * 2;
      const safe = Math.floor(Math.random() * lanes);
      const safe2 = (safe + 3) % lanes;
      for (let i = 0; i < lanes; i += 1) {
        if (i === safe || (easyMode() && i === safe2)) continue;
        const c = TILE + (i + 0.5) * (span / lanes);
        if (s.horizontal) warnLine(TILE, c, WIDTH - TILE, c, span / lanes - 8, tele(0.9), boss.damage, "fire");
        else warnLine(c, TILE, c, HEIGHT - TILE, span / lanes - 8, tele(0.9), boss.damage, "fire");
      }
      sfx.fireball();
      s.waves -= 1;
      s.timer = s.waves > 0 ? tele(1.15) : tele(0.9) + 0.3;
      return false;
    }
  }
});

Object.assign(FX, {
  // Bonecrown's crown: flies out, then curves back to his head.
  boomer: {
    update(fx, dt) {
      if (fx.t > fx.turn) {
        const home = fx.home;
        const a = Math.atan2(home.y - fx.y, home.x - fx.x);
        const speed = 600;
        fx.vx += (Math.cos(a) * speed - fx.vx) * Math.min(1, dt * 4);
        fx.vy += (Math.sin(a) * speed - fx.vy) * Math.min(1, dt * 4);
        if (Math.hypot(home.x - fx.x, home.y - fx.y) < 40) fx.life = 0;
      }
      fx.x = clamp(fx.x + fx.vx * dt, TILE + 10, WIDTH - TILE - 10);
      fx.y = clamp(fx.y + fx.vy * dt, TILE + 10, HEIGHT - TILE - 10);
      for (const p of livingPlayers()) {
        fx.cd[p.index] = Math.max(0, fx.cd[p.index] - dt);
        if (fx.cd[p.index] > 0 || Math.hypot(p.x - fx.x, p.y - fx.y) > fx.r + p.r * 0.5) continue;
        fx.cd[p.index] = 0.7;
        strike(p, fx.damage, fx.x, fx.y, null, "zone");
      }
    },
    draw(fx) {
      const spin = Math.floor(state.anim * 16) % 4;
      const w = [18, 12, 4, 12][spin];
      ctx.fillStyle = BX.out;
      ctx.fillRect(snap(fx.x - w / 2 - 2), snap(fx.y - 10), w + 4, 20);
      ctx.fillStyle = BX.y2;
      ctx.fillRect(snap(fx.x - w / 2), snap(fx.y - 4), w, 12);
      for (const k of [-1, 0, 1]) if (w > 8) ctx.fillRect(snap(fx.x + k * w * 0.35 - 2), snap(fx.y - 8), 4, 6);
      ctx.fillStyle = BX.r2;
      if (w > 8) ctx.fillRect(snap(fx.x - 2), snap(fx.y), 4, 4);
    }
  },
  // Lava creeping in from all four walls.
  flood: {
    ground: true,
    update(fx, dt) {
      const t = fx.t;
      const k = t < fx.rise ? t / fx.rise : t < fx.rise + fx.hold ? 1 : Math.max(0, fx.life / 1);
      fx.depth = fx.top * k;
      for (const p of livingPlayers()) {
        fx.cd[p.index] = Math.max(0, fx.cd[p.index] - dt);
        if (fx.cd[p.index] > 0 || p.dashTime > 0) continue;
        const inside = p.x < TILE + fx.depth || p.x > WIDTH - TILE - fx.depth || p.y < TILE + fx.depth || p.y > HEIGHT - TILE - fx.depth;
        if (!inside) continue;
        fx.cd[p.index] = 0.5;
        strike(p, fx.damage, p.x < WIDTH / 2 ? 0 : WIDTH, p.y, null, "zone");
      }
    },
    draw(fx) {
      const d = snap(fx.depth || 0);
      if (d < 2) return;
      const wave = (x) => snap(Math.sin(x * 0.08 + state.anim * 3) * 4);
      ctx.fillStyle = BX.r1;
      ctx.fillRect(TILE, TILE, WIDTH - TILE * 2, d);
      ctx.fillRect(TILE, HEIGHT - TILE - d, WIDTH - TILE * 2, d);
      ctx.fillRect(TILE, TILE, d, HEIGHT - TILE * 2);
      ctx.fillRect(WIDTH - TILE - d, TILE, d, HEIGHT - TILE * 2);
      for (let x = TILE; x < WIDTH - TILE; x += 8) {
        block(x, TILE + d + wave(x), 8, BX.y1);
        block(x, HEIGHT - TILE - d - wave(x), 8, BX.y1);
      }
      for (let y = TILE; y < HEIGHT - TILE; y += 8) {
        block(TILE + d + wave(y), y, 8, BX.y1);
        block(WIDTH - TILE - d - wave(y), y, 8, BX.y1);
      }
      for (let i = 0; i < 14; i += 1) {
        const x = TILE + ((i * 131 + state.anim * 30) % (WIDTH - TILE * 2));
        block(x, TILE + d * 0.5, 4, BX.y3);
        block(x, HEIGHT - TILE - d * 0.5, 4, BX.y3);
      }
    }
  },
  // Frostbite's ice walls melt away after a while.
  icewalls: {
    draw(fx) {
      for (const wall of fx.walls) {
        ctx.fillStyle = BX.out;
        ctx.fillRect(wall.x - 2, wall.y - 2, wall.w + 4, wall.h + 4);
        ctx.fillStyle = BX.w4;
        ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
        ctx.fillStyle = BX.w5;
        ctx.fillRect(wall.x + 4, wall.y + 4, 6, wall.h - 12);
        ctx.fillStyle = BX.w3;
        ctx.fillRect(wall.x, wall.y + wall.h - 8, wall.w, 8);
      }
    },
    end(fx) {
      fx.room.crates = fx.room.crates.filter((crate) => !fx.walls.includes(crate));
      for (const wall of fx.walls) burst(wall.x + TILE / 2, wall.y + TILE, [BX.w4, BX.wh], 6, 120);
    }
  },
  // Stand still too long and you freeze.
  stillcheck: {
    update(fx, dt) {
      for (const p of livingPlayers()) {
        const moving = Math.hypot(p.velX || 0, p.velY || 0) > 30 || p.dashTime > 0;
        fx.still[p.index] = moving ? Math.max(0, fx.still[p.index] - dt * 2) : fx.still[p.index] + dt;
        if (fx.still[p.index] < (easyMode() ? 2.2 : 1.5)) continue;
        fx.still[p.index] = 0;
        strike(p, fx.damage, p.x, p.y, null, "unblock");
        p.stun = Math.max(p.stun || 0, easyMode() ? 0.6 : 1.2);
        floatText(p.x, p.y - 46, "Frozen!", "#bdf1ff", 18);
        burst(p.x, p.y, [BX.w4, BX.wh], 16, 180);
      }
    },
    draw(fx) {
      for (const p of livingPlayers()) {
        const k = fx.still[p.index] / (easyMode() ? 2.2 : 1.5);
        if (k < 0.15) continue;
        blockRing(p.x, p.y, 34 - k * 14, k > 0.7 ? BX.wh : BX.w4, 4, 2, state.anim * 6);
      }
    }
  },
  // The whole floor turns to slippery ice.
  icefloor: {
    ground: true,
    draw(fx) {
      const fade = Math.min(1, fx.t / 0.4, fx.life / 0.5);
      if (fade < 0.5 && Math.floor(state.anim * 10) % 2) return;
      ctx.fillStyle = BX.w5;
      for (let y = TILE; y < HEIGHT - TILE; y += 32) {
        for (let x = TILE + ((y / 32) % 2) * 16; x < WIDTH - TILE; x += 32) {
          ctx.fillRect(x, y, 4, 4);
          ctx.fillRect(x + 4, y + 4, 8, 2);
        }
      }
      ctx.fillStyle = BX.w4;
      for (let i = 0; i < 20; i += 1) ctx.fillRect(snap(TILE + ((i * 151) % (WIDTH - TILE * 2))), snap(TILE + ((i * 97) % (HEIGHT - TILE * 2))), 24, 2);
    }
  },
  // Red rain during the Blood Moon.
  bloodrain: {
    update(fx, dt) {
      fx.tick -= dt;
      if (fx.tick > 0) return;
      fx.tick = easyMode() ? 0.9 : 0.5;
      const p = bossTarget(fx.boss);
      const spot = leadPoint(p, 0.5);
      warnCircle(spot.x + rand(-60, 60), spot.y + rand(-60, 60), 40, tele(0.7), Math.round(fx.boss.damage * 0.8), "blood");
    },
    draw() {}
  },
  // Colossus's turning cross of lasers.
  cross: {
    update(fx, dt) {
      const boss = fx.boss;
      if (boss.hp <= 0) {
        fx.life = 0;
        return;
      }
      if (fx.t < fx.warn) return;
      fx.angle += fx.spin * dt;
      for (const p of livingPlayers()) {
        fx.cd[p.index] = Math.max(0, fx.cd[p.index] - dt);
        if (fx.cd[p.index] > 0) continue;
        for (let i = 0; i < fx.arms; i += 1) {
          const a = fx.angle + (i / fx.arms) * Math.PI * 2;
          const end = rayToWall(boss.x, boss.y, a);
          if (segmentDistance(p.x, p.y, boss.x, boss.y, end.x, end.y) < 12 + p.r * 0.5) {
            fx.cd[p.index] = 0.5;
            strike(p, fx.damage, boss.x, boss.y, null, "zone");
            break;
          }
        }
      }
    },
    draw(fx) {
      const boss = fx.boss;
      const live = fx.t >= fx.warn;
      for (let i = 0; i < fx.arms; i += 1) {
        const a = fx.angle + (i / fx.arms) * Math.PI * 2;
        const end = rayToWall(boss.x, boss.y, a);
        if (live) {
          blockLine(boss.x, boss.y, end.x, end.y, BX.out, 16);
          blockLine(boss.x, boss.y, end.x, end.y, BX.v2, 12);
          blockLine(boss.x, boss.y, end.x, end.y, BX.v3, 4);
        } else {
          const n = Math.floor(end.dist / 14);
          for (let k = 2; k < n; k += 2) block(boss.x + Math.cos(a) * k * 14, boss.y + Math.sin(a) * k * 14, 4, Math.floor(state.anim * 14) % 2 ? BX.wh : BX.r2);
        }
      }
    }
  }
});

Object.assign(PROPS, {
  // Heals King Bonecrown while it stands.
  throne: {
    update(prop) {
      const boss = prop.propOf;
      boss.hp = Math.min(boss.maxHp, boss.hp + boss.maxHp * (easyMode() ? 0.004 : 0.01) / 60);
      if (state.clock > (prop.beamAt || 0)) {
        prop.beamAt = state.clock + 0.8;
        effects.push({ type: "healbeam", x: prop.x, y: prop.y - 20, tx: boss.x, ty: boss.y, life: 0.6, max: 0.6 });
      }
    },
    draw(prop) {
      const x = prop.x;
      const y = prop.y;
      blockDisc(x, y + 22, 26, BX.s0, 0.4);
      ctx.fillStyle = BX.out;
      ctx.fillRect(snap(x - 22), snap(y - 34), 44, 58);
      ctx.fillStyle = BX.W1;
      ctx.fillRect(snap(x - 20), snap(y - 32), 40, 54);
      ctx.fillStyle = BX.W2;
      for (let i = 0; i < 4; i += 1) ctx.fillRect(snap(x - 18 + i * 10), snap(y - 40), 6, 12);
      ctx.fillStyle = BX.r1;
      ctx.fillRect(snap(x - 14), snap(y - 4), 28, 14);
      ctx.fillStyle = BX.out;
      ctx.fillRect(snap(x - 10), snap(y - 24), 6, 6);
      ctx.fillRect(snap(x + 4), snap(y - 24), 6, 6);
    }
  },
  // Bats circling Count Shadowfang: while any are alive he can't be hurt.
  orbitbat: {
    moves: true,
    update(prop, dt) {
      const boss = prop.propOf;
      prop.angle += dt * 2.2;
      prop.x = boss.x + Math.cos(prop.angle) * 95;
      prop.y = boss.y + Math.sin(prop.angle) * 70;
      for (const p of livingPlayers()) {
        if (Math.hypot(p.x - prop.x, p.y - prop.y) < 14 + p.r && state.clock > (prop.biteAt || 0)) {
          prop.biteAt = state.clock + 0.8;
          strike(p, Math.round(boss.damage * 0.5), prop.x, prop.y, null, "zone");
        }
      }
    },
    draw(prop) {
      drawBat(prop.x, prop.y, prop.angle * 3);
    }
  },
  // Crystals circling the Colossus: while any are alive he takes much less damage.
  orbit: {
    moves: true,
    update(prop, dt) {
      const boss = prop.propOf;
      prop.angle += dt * 1.4;
      prop.x = boss.x + Math.cos(prop.angle) * 115;
      prop.y = boss.y + Math.sin(prop.angle) * 85;
      if (state.clock > (prop.shootAt || prop.born + 1)) {
        prop.shootAt = state.clock + rand(1.8, 2.6);
        shotFrom(prop.x, prop.y, Math.atan2(prop.y - boss.y, prop.x - boss.x), bulletSpeed(currentRoom()) * 0.8, Math.round(boss.damage * 0.5), { color: BX.v3, r: 6 });
      }
    },
    draw(prop) {
      const look = POP_LOOK.crystal;
      drawSprite("crystal", look.rows, look.pal, prop.x, prop.y + 10);
    }
  },
  // A small Colossus copy after Shatter Split.
  mini: {
    moves: true,
    update(prop, dt, room) {
      const p = nearestPlayer(prop.x, prop.y);
      const a = angleTo(prop, p);
      const d = Math.hypot(p.x - prop.x, p.y - prop.y);
      if (d > 140) {
        prop.x += Math.cos(a) * prop.speed * dt;
        prop.y += Math.sin(a) * prop.speed * dt;
      }
      if (state.clock > (prop.shootAt || prop.born + 1)) {
        prop.shootAt = state.clock + tele(1.6);
        const n = 8;
        const off = Math.random();
        for (let i = 0; i < n; i += 1) shotFrom(prop.x, prop.y, off + (i / n) * Math.PI * 2, bulletSpeed(room) * 0.75, Math.round(prop.propOf.damage * 0.6), { color: BX.v3, r: 7 });
      }
    },
    draw(prop) {
      drawCopyOf(prop.propOf, prop.x, prop.y, 1, prop.size);
    }
  }
});
