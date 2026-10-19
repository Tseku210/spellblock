/* ---------- hazards: frozen shots, void rifts, sandworms ----------
   Load after classes.js. Three things players asked for:
   - Blizzard no longer deletes enemy shots. Shots that enter the storm freeze:
     they slow down once and turn icy, and they still hurt if you stand in them.
   - A boss fight that drags on opens a void rift at the room's edge. Void imps
     climb out every few seconds until the boss falls; then the rift closes.
   - Sand Crypt rooms have a sandworm. Shaking sand follows a wizard, stops,
     and a worm bursts up, biting every wizard and monster in the circle.
   Hooks wrap globals and always call through to the previous function. */
(() => {
"use strict";

/* ---------- tuning (index = state.difficulty: Easy, Normal, Hard) ---------- */

const FREEZE = { slow: 0.32, lifeStretch: 1.5, maxLife: 4.5, ice: "#bdf1ff" };

const VOID = {
  limit: { room: 45, big: 90, dragon: 90 },
  scale: [1.6, 1, 0.8],
  warnAhead: 10,
  openTime: 0.8,
  closeTime: 0.6,
  every: [5, 3.6, 2.8],
  cap: [3, 4, 5],
  impSpeed: [125, 150, 160],
  impDamage: [5, 9, 12],
  impHp: 0.6
};

const WORM = [
  { every: [8, 12], follow: 70, lock: 0.85, r: 48, dmg: 6, tierDmg: 0, bossCut: 0.05 },
  { every: [6, 10], follow: 95, lock: 0.5, r: 54, dmg: 16, tierDmg: 0.015, bossCut: 0.035 },
  { every: [4.5, 7.5], follow: 115, lock: 0.4, r: 60, dmg: 22, tierDmg: 0.015, bossCut: 0.03 }
];
const STALK_TIME = 1.2;
const BURST_TIME = 0.9;
const SAND_CRYPT = biomes[4];
const NO_WORM_GROUND = new Set(["water", "chasm", "lava", "bridge"]);
const WORM_HIT = { unparryHit: true, hp: 0 };

const TIPS = {
  freeze: "Blizzard freezes enemy shots! They slow down, but they still hurt.",
  rift: "A void rift! Imps keep coming until the boss is beaten. Be quick!",
  worm: "Shaking sand means a sandworm! Dash away before it bites."
};
const TIP_KEY = "spellblock-hazards-v1";

function diffIndex() {
  return clamp(state.difficulty | 0, 0, 2);
}

/* ---------- first-time tips, kept across runs under our own key ---------- */

const seenTips = (() => {
  const saved = readStorage(TIP_KEY);
  return new Set(saved && Array.isArray(saved.tips) ? saved.tips : []);
})();

function tipOnce(id, time = 4) {
  if (seenTips.has(id)) return;
  seenTips.add(id);
  writeStorage(TIP_KEY, { tips: [...seenTips] });
  toast(TIPS[id], time);
}

/* ---------- tiny pixel painter (1 cell = 1 sprite pixel, drawn at 2x) ---------- */

const OUT = "#1d1a2f";
const V = { core: "#1d1a2f", v0: "#241a3a", v1: "#2e1f4a", v2: "#4a2a78", v3: "#7a3fc0", v4: "#c06bff", v5: "#f0c8ff" };
const D = { d0: "#3a2430", d1: "#5b3934", d2: "#87573b", d3: "#b07e4e", d4: "#d4a96f", d5: "#efd29b", b1: "#55332f" };
const R = { r0: "#5c1f3a", r1: "#9e2f4a", r2: "#d6455d", r3: "#f2808a" };
const WH = "#f4f4f8";
const Y = { y1: "#e08a2e", y2: "#f5c542", y3: "#fff0a3" };
const FROST_MAP = { [V.v0]: "#16213f", [V.v1]: "#1f3c73", [V.v2]: "#2862a8", [V.v3]: "#78c9ea", [V.v4]: "#e6f5f0", [V.v5]: "#ffffff" };

function grid(w, h) {
  return { w, h, a: new Array(w * h).fill(null) };
}

function put(g, x, y, c) {
  x = Math.round(x);
  y = Math.round(y);
  if (x >= 0 && y >= 0 && x < g.w && y < g.h) g.a[y * g.w + x] = c;
}

function at(g, x, y) {
  return x >= 0 && y >= 0 && x < g.w && y < g.h ? g.a[y * g.w + x] : null;
}

// Dark navy outline around every filled pixel, so sprites read on any floor.
function outline(g, skip = null) {
  const add = [];
  for (let y = 0; y < g.h; y += 1) {
    for (let x = 0; x < g.w; x += 1) {
      if (at(g, x, y)) continue;
      const n = [at(g, x - 1, y), at(g, x + 1, y), at(g, x, y - 1), at(g, x, y + 1)];
      if (n.some((c) => c && c !== skip)) add.push(x, y);
    }
  }
  for (let i = 0; i < add.length; i += 2) put(g, add[i], add[i + 1], OUT);
}

function bake(g, map = null) {
  const c = document.createElement("canvas");
  c.width = g.w;
  c.height = g.h;
  const cx = c.getContext("2d");
  for (let i = 0; i < g.a.length; i += 1) {
    let color = g.a[i];
    if (!color) continue;
    if (map) color = map(color);
    cx.fillStyle = color;
    cx.fillRect(i % g.w, Math.floor(i / g.w), 1, 1);
  }
  return c;
}

function blit(img, x, y, scale = 2, flip = false) {
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const w = img.width * scale;
  const h = img.height * scale;
  if (flip) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(img, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
  }
  ctx.imageSmoothingEnabled = smooth;
}

function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/* ---------- void imp: 6 frames, body bobs, horns lag, tail sways late ---------- */

const BOB = [0, -1, -1, 0, 1, 1];
const SWAY = [0, 1, 1, 0, -1, -1];

function paintImp(f) {
  const g = grid(17, 19);
  const bob = BOB[f];
  const hornBob = BOB[(f + 5) % 6];
  const squash = bob === 1 ? 1 : 0;
  const cx = 8.5;
  const cy = 9 + bob;
  const rx = 4.8 + squash * 0.7;
  const ry = 4.4 - squash * 0.6;
  // Tail wisp first so the body sits over its root.
  for (let k = 0; k < 4; k += 1) {
    const sx = SWAY[(f + 6 - k) % 6];
    const color = [V.v1, V.v2, V.v3, V.v4][k];
    if (k === 3 && f % 2) continue;
    put(g, 8 + sx + (k === 3 ? 1 : 0), cy + 4 + k, color);
  }
  for (let y = 0; y < g.h; y += 1) {
    for (let x = 0; x < g.w; x += 1) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const lit = (x + 0.5 - cx) * 0.6 + (y + 0.5 - cy);
      put(g, x, y, dy < -0.7 ? V.v3 : lit < -1.6 ? V.v2 : lit > 2.6 ? V.v0 : V.v1);
    }
  }
  // Little horns, a beat behind the body.
  const top = Math.round(9 + hornBob - 4.4);
  put(g, 5, top, V.v2);
  put(g, 4, top - 1, V.v2);
  put(g, 4, top - 2, V.v4);
  put(g, 11, top, V.v2);
  put(g, 12, top - 1, V.v2);
  put(g, 12, top - 2, V.v4);
  // Claws wave on alternate beats.
  const arm = Math.round(cy + 1) + (f % 3 === 0 ? -1 : 0);
  put(g, 3, arm, V.v2);
  put(g, 2, arm - 1, V.v3);
  put(g, 13, arm, V.v2);
  put(g, 14, arm - 1, V.v3);
  // Glowing eyes (blink on frame 4) and a one-fang grin.
  const ey = Math.round(cy - 1);
  const blink = f === 4;
  for (const ex of [6, 10]) {
    put(g, ex, ey, blink ? V.v4 : WH);
    put(g, ex + 1, ey, V.v5);
    if (!blink) {
      put(g, ex, ey + 1, V.v5);
      put(g, ex + 1, ey + 1, V.v4);
    }
  }
  const my = Math.round(cy + 2);
  put(g, 7, my, OUT);
  put(g, 8, my, OUT);
  put(g, 9, my, OUT);
  put(g, 8, my + 1, WH);
  outline(g);
  // A spark orbiting outside the outline.
  const a = (f / 6) * Math.PI * 2;
  put(g, 8.5 + Math.cos(a) * 7.6, 9 + Math.sin(a) * 7.6, V.v4);
  return g;
}

/* ---------- void rift: a jagged tear with a swirling core, 6 frames ---------- */

function paintRift(f) {
  const g = grid(22, 34);
  const cx = 11;
  const cy = 17;
  for (let y = 1; y < 33; y += 1) {
    const jag = (((y * 7 + f * 13) % 5) - 2) * 0.35;
    const hw = 8.6 * Math.pow(Math.sin((Math.PI * (y - 0.5)) / 32), 0.8) + jag;
    for (let x = 0; x < g.w; x += 1) {
      const d = Math.abs(x + 0.5 - cx);
      if (d > hw) continue;
      const edge = hw - d;
      let color;
      if (edge < 1) color = (x + y + f) % 3 === 0 ? V.v5 : V.v4;
      else if (edge < 2) color = V.v3;
      else if (edge < 3.2) color = V.v2;
      else {
        const ang = Math.atan2(y + 0.5 - cy, (x + 0.5 - cx) * 1.7) + (f * Math.PI) / 3;
        const rr = Math.hypot((x + 0.5 - cx) * 1.7, y + 0.5 - cy);
        color = Math.sin(ang * 2 + rr * 0.55) > 0.55 ? V.v1 : V.core;
      }
      put(g, x, y, color);
    }
  }
  outline(g);
  for (let k = 0; k < 3; k += 1) {
    const a = ((f + k * 2) / 6) * Math.PI * 2;
    put(g, cx + Math.cos(a) * 10, cy + Math.sin(a) * 15.5, k === 0 ? V.v5 : V.v4);
  }
  return g;
}

/* ---------- sandworm: round ringed body, flaps that fan open, 4 frames ---------- */

const WORM_W = 44;
const WORM_H = 62;
const RING = [D.d1, D.d4, D.d3, D.d3, D.d2, D.d2, D.d2];
const LIT = { [D.d1]: D.d2, [D.d2]: D.d3, [D.d3]: D.d4, [D.d4]: D.d5 };
const DIM = { [D.d1]: D.b1, [D.d2]: D.d1, [D.d3]: D.d2, [D.d4]: D.d3 };

function paintWorm(f) {
  const open = [0, 0.45, 1, 0.85][f];
  const g = grid(WORM_W, WORM_H);
  const cx = 22;
  const neck = 24;
  // Body: rings bow down in the middle so the tube looks round; lit on the left.
  for (let y = neck - 4; y < WORM_H; y += 1) {
    const hw = 11 + ((y - neck) / (WORM_H - neck)) * 2.5;
    for (let x = 0; x < WORM_W; x += 1) {
      const xr = (x + 0.5 - cx) / hw;
      if (Math.abs(xr) > 1) continue;
      const yy = y + 2.2 * (1 - xr * xr) + f;
      let color = RING[Math.floor(yy) % RING.length];
      if (xr < -0.5) color = LIT[color] || color;
      else if (xr > 0.45) color = DIM[color] || color;
      if (xr > 0.8) color = DIM[color] || color;
      put(g, x, y, color);
    }
  }
  if (open < 0.2) {
    // Closed: a pointed dome with three seams meeting at the tip.
    for (let y = 7; y < neck; y += 1) {
      const hw = 11.2 * Math.sqrt((y - 7) / (neck - 7));
      for (let x = 0; x < WORM_W; x += 1) {
        const xr = (x + 0.5 - cx) / Math.max(hw, 0.5);
        if (Math.abs(xr) > 1) continue;
        put(g, x, y, xr < -0.45 ? D.d4 : xr > 0.45 ? D.d2 : D.d3);
      }
    }
    for (let k = 0; k < 16; k += 1) {
      const t = k / 16;
      put(g, cx - 0.5 - t * 6, 8 + t * 15, D.d1);
      put(g, cx - 0.5 + t * 6, 8 + t * 15, D.d1);
    }
  } else {
    const mx = 6 + 9.5 * open;
    const my = 2.5 + 6.5 * open;
    const mcy = 17 - open * 2;
    // Flaps fan out around the mouth like a big sand flower.
    const flaps = [-2.5, -1.6, -0.8, 0, 0.8, 1.6, 2.5];
    for (const ang of flaps) {
      const a = -Math.PI / 2 + ang * 0.55 * (0.6 + open * 0.5);
      const tipX = cx + Math.cos(a) * (mx + 9 * open) - 0.5;
      const tipY = mcy + Math.sin(a) * (my + 8 * open);
      const side = a + Math.PI / 2;
      const bx = Math.cos(side) * 4;
      const by = Math.sin(side) * 4;
      const baseX = cx + Math.cos(a) * mx * 0.7;
      const baseY = mcy + Math.sin(a) * my * 0.7;
      for (let y = 0; y < 32; y += 1) {
        for (let x = 0; x < WORM_W; x += 1) {
          if (!inTriangle(x + 0.5, y + 0.5, baseX - bx, baseY - by, baseX + bx, baseY + by, tipX, tipY)) continue;
          put(g, x, y, Math.hypot(x + 0.5 - tipX, y + 0.5 - tipY) < 2.2 ? D.d4 : x < cx ? D.d3 : D.d2);
        }
      }
    }
    // Mouth: lips, rows of teeth, a dark throat.
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < WORM_W; x += 1) {
        const dx = (x + 0.5 - cx) / mx;
        const dy = (y + 0.5 - mcy) / my;
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        put(g, x, y, d > 0.78 ? (dy < 0 ? R.r2 : R.r1) : d > 0.3 ? R.r0 : OUT);
      }
    }
    const spin = f === 3 ? 0.2 : 0;
    for (const [ring, count] of [[0.74, 16], [0.48, 10]]) {
      for (let k = 0; k < count; k += 1) {
        const a = (k / count) * Math.PI * 2 + spin;
        const tx = cx - 0.5 + Math.cos(a) * mx * ring;
        const ty = mcy - 0.5 + Math.sin(a) * my * ring;
        put(g, tx, ty, WH);
        put(g, tx - Math.cos(a) * 0.9, ty - Math.sin(a) * 0.9, ring > 0.6 ? "#b3bccb" : WH);
      }
    }
  }
  // Angry little eyes on the neck.
  const ey = neck + 2;
  for (const ex of [cx - 8, cx + 6]) {
    put(g, ex - 1, ey - 1, D.b1);
    put(g, ex, ey - 1, D.b1);
    put(g, ex + 1, ey - 1, D.b1);
    put(g, ex, ey, Y.y3);
    put(g, ex + 1, ey, Y.y2);
    put(g, ex, ey + 1, Y.y2);
    put(g, ex + 1, ey + 1, Y.y1);
  }
  outline(g);
  return g;
}

// The sand ring the worm bursts through, drawn in front of its base.
function paintMound() {
  const g = grid(52, 14);
  for (let y = 0; y < g.h; y += 1) {
    for (let x = 0; x < g.w; x += 1) {
      const dx = (x + 0.5 - 26) / 25;
      const dy = (y + 0.5 - 6) / 6.5;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      const inner = ((x + 0.5 - 26) / 15) ** 2 + ((y + 0.5 - 4.5) / 3.6) ** 2;
      if (inner < 1) continue;
      const front = y > 6;
      put(g, x, y, front ? (y > 10 ? D.d2 : D.d3) : (x + y) % 7 === 0 ? D.d5 : D.d4);
    }
  }
  for (const [x, y] of [[6, 7], [13, 11], [40, 10], [46, 6], [30, 12]]) put(g, x, y, D.d1);
  outline(g);
  return g;
}

let art = null;
function sprites() {
  if (art) return art;
  const imps = [0, 1, 2, 3, 4, 5].map(paintImp);
  art = {
    imp: imps.map((g) => bake(g)),
    impFrost: imps.map((g) => bake(g, (c) => FROST_MAP[c] || c)),
    impFlash: imps.map((g) => bake(g, (c) => (c === OUT ? OUT : WH))),
    rift: [0, 1, 2, 3, 4, 5].map((f) => bake(paintRift(f))),
    worm: [0, 1, 2, 3].map((f) => bake(paintWorm(f))),
    mound: bake(paintMound())
  };
  return art;
}

/* ---------- 1. Blizzard freezes shots instead of deleting them ---------- */

function freezeShot(shot) {
  shot.hzFrozen = true;
  shot.vx *= FREEZE.slow;
  shot.vy *= FREEZE.slow;
  shot.life = Math.min(shot.life * FREEZE.lifeStretch, FREEZE.maxLife);
  if (shot.kind !== "cannon" && shot.kind !== "boomerang") shot.color = FREEZE.ice;
  burst(shot.x, shot.y, ["#ffffff", "#9be7ff"], 3, 70);
  tipOnce("freeze");
}

function bossUp(room) {
  return Boolean(room.boss && room.boss.hp > 0 && !room.boss.friendly);
}

const heldShots = [];
const baseUpdateBlizzard = updateBlizzard;
updateBlizzard = function updateBlizzardFreezing(b, dt) {
  for (const shot of projectiles) {
    if (shot.owner === "enemy" && shot.life > 0 && !shot.hzFrozen && Math.hypot(shot.x - b.x, shot.y - b.y) < b.radius) freezeShot(shot);
  }
  // The old storm deletes enemy shots it touches; hide them while it runs.
  heldShots.length = 0;
  let keep = 0;
  for (const shot of projectiles) {
    if (shot.owner === "enemy") heldShots.push(shot);
    else projectiles[keep++] = shot;
  }
  projectiles.length = keep;
  const room = currentRoom();
  const bossBefore = bossUp(room);
  try {
    return baseUpdateBlizzard.apply(this, arguments);
  } finally {
    // A boss beaten by the storm clears enemy shots; the hidden ones go too.
    const cleared = bossBefore && !bossUp(room);
    for (const shot of heldShots) {
      if (cleared) shot.life = 0;
      projectiles.push(shot);
    }
    heldShots.length = 0;
  }
};

function drawFrostShell(p) {
  const r = Math.max(6, p.r + 3);
  const spin = state.anim * 1.6 + p.x * 0.01;
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = "#e6f5f0";
  ctx.fillRect(Math.round(p.x - r + 2), Math.round(p.y - r + 2), (r - 2) * 2, (r - 2) * 2);
  ctx.globalAlpha = 1;
  for (let k = 0; k < 6; k += 1) {
    const a = spin + (k * Math.PI) / 3;
    const sx = Math.round((p.x + Math.cos(a) * r) / 2) * 2;
    const sy = Math.round((p.y + Math.sin(a) * r) / 2) * 2;
    ctx.fillStyle = OUT;
    ctx.fillRect(sx - 3, sy - 3, 6, 6);
    ctx.fillStyle = k % 2 ? "#78c9ea" : "#e6f5f0";
    ctx.fillRect(sx - 2, sy - 2, 4, 4);
  }
}

const baseDrawProjectiles = drawProjectiles;
drawProjectiles = function drawProjectilesFrosted() {
  const result = baseDrawProjectiles.apply(this, arguments);
  for (const p of projectiles) {
    if (p.hzFrozen && p.owner === "enemy" && p.life > 0) drawFrostShell(p);
  }
  return result;
};

/* ---------- 2. void rift on a long boss fight ----------
   rift: null, or { phase: "warn" | "open" | "closing", t, x, y, flat, boss, roomIndex, spawnIn }.
   Fight time lives on the boss (hzVoidTime) so walking out and back in doesn't reset it. */

const hz = { rift: null, worm: null, wormWait: 0 };

const RIFT_SPOTS = [
  { x: WIDTH * 0.25, y: TILE + 14, flat: true },
  { x: WIDTH * 0.5, y: TILE + 14, flat: true },
  { x: WIDTH * 0.75, y: TILE + 14, flat: true },
  { x: WIDTH * 0.25, y: HEIGHT - TILE - 14, flat: true },
  { x: WIDTH * 0.5, y: HEIGHT - TILE - 14, flat: true },
  { x: WIDTH * 0.75, y: HEIGHT - TILE - 14, flat: true },
  { x: TILE + 14, y: HEIGHT * 0.25, flat: false },
  { x: TILE + 14, y: HEIGHT * 0.75, flat: false },
  { x: WIDTH - TILE - 14, y: HEIGHT * 0.25, flat: false },
  { x: WIDTH - TILE - 14, y: HEIGHT * 0.75, flat: false }
];
const RAVEN_TYPE = enemyTypes.findIndex((type) => type.name === "Void Raven");

function fightBoss(room) {
  if (state.treeMode || room.tree || !bossUp(room)) return null;
  return room.boss;
}

function voidLimit(boss, room) {
  const kind = boss.isDragon || room.final ? "dragon" : boss.isBig || room.arena ? "big" : "room";
  return VOID.limit[kind] * VOID.scale[diffIndex()];
}

function farthestSpot() {
  const heroes = livingPlayers();
  let best = RIFT_SPOTS[0];
  let bestD = -1;
  for (const spot of RIFT_SPOTS) {
    let d = 9999;
    for (const p of heroes) d = Math.min(d, Math.hypot(p.x - spot.x, p.y - spot.y));
    if (d > bestD) {
      bestD = d;
      best = spot;
    }
  }
  return best;
}

function impsIn(room) {
  let n = 0;
  for (const enemy of room.enemies) if (enemy.voidImp && enemy.hp > 0) n += 1;
  return n;
}

function spawnImp(room) {
  const rift = hz.rift;
  const inX = rift.flat ? 0 : rift.x < WIDTH / 2 ? 1 : -1;
  const inY = rift.flat ? (rift.y < HEIGHT / 2 ? 1 : -1) : 0;
  const x = rift.x + inX * 22 + rand(-6, 6);
  const y = rift.y + inY * 22 + rand(-6, 6);
  const d = diffIndex();
  const tier = Math.min(room.tier || 0, 29);
  const imp = makeEnemy(RAVEN_TYPE, x, y, { tier, temp: true, small: true });
  const hp = Math.max(4, Math.round(imp.maxHp * VOID.impHp));
  Object.assign(imp, {
    voidImp: true,
    behavior: "voidimp",
    name: "Void Imp",
    size: 22,
    maxHp: hp,
    hp,
    speed: VOID.impSpeed[d] * (difficulty().speed || 1) * (1 + tier * 0.01),
    damage: Math.round(VOID.impDamage[d] * (1 + tier * 0.03)),
    attackTimer: 99,
    hitCooldown: 0.6,
    alpha: 0.2,
    face: inX || (Math.random() < 0.5 ? -1 : 1)
  });
  room.enemies.push(imp);
  burst(x, y, [V.v4, V.v3, "#ffffff"], 8, 120);
  addRing(x, y, 22, V.v4, 0.3, 4);
  return imp;
}

function vanishImps(room) {
  for (const enemy of room.enemies) {
    if (!enemy.voidImp || enemy.hp <= 0) continue;
    enemy.hp = 0;
    burst(enemy.x, enemy.y, [V.v4, V.v2, "#ffffff"], 10, 150);
  }
  room.enemies = room.enemies.filter((enemy) => !enemy.voidImp);
}

function closeRift() {
  const rift = hz.rift;
  if (!rift || rift.phase === "closing") return;
  const room = rooms[rift.roomIndex];
  if (room) vanishImps(room);
  if (room && !state.treeMode && !room.cleared && isRoomCleared(room)) {
    room.cleared = true;
    toast("Room cleared! Pick a door to explore.", 3);
  }
  if (rift.phase === "warn") {
    hz.rift = null;
    return;
  }
  rift.phase = "closing";
  rift.t = 0;
  burst(rift.x, rift.y, [V.v5, V.v4, "#ffffff"], 18, 200);
  tone(660, 0.25, { type: "triangle", volume: 0.05, slide: 500 });
}

function openRift() {
  const rift = hz.rift;
  rift.phase = "open";
  rift.t = 0;
  rift.spawnIn = VOID.openTime;
  addShake(6);
  burst(rift.x, rift.y, [V.v4, V.v3, V.v5], 20, 220);
  [262, 233, 196, 147].forEach((f, i) => tone(f, 0.3, { type: "sawtooth", volume: 0.045, delay: i * 0.12 }));
  banner("A void rift opened!", "Beat the boss to close it!", V.v4, 2.4);
  tipOnce("rift", 4.5);
}

function tickVoid(dt) {
  const room = currentRoom();
  const boss = fightBoss(room);
  const rift = hz.rift;
  if (rift && (rift.boss !== boss || rift.roomIndex !== room.index)) closeRift();
  if (hz.rift && hz.rift.phase === "closing") {
    hz.rift.t += dt;
    if (hz.rift.t >= VOID.closeTime) hz.rift = null;
  }
  if (!boss) return;
  boss.hzVoidTime = (boss.hzVoidTime || 0) + dt;
  const limit = voidLimit(boss, room);
  if (!hz.rift && boss.hzVoidTime >= limit - VOID.warnAhead) {
    const spot = farthestSpot();
    hz.rift = { phase: "warn", t: 0, x: spot.x, y: spot.y, flat: spot.flat, boss, roomIndex: room.index, spawnIn: 0 };
    if (boss.hzVoidTime < limit) {
      toast("The void is getting restless...", 3.5);
      sfx.rumble();
    }
  }
  const live = hz.rift;
  if (!live || live.boss !== boss) return;
  live.t += dt;
  if (live.phase === "warn" && boss.hzVoidTime >= limit) openRift();
  if (live.phase !== "open") return;
  live.spawnIn -= dt;
  if (live.spawnIn > 0) return;
  const d = diffIndex();
  live.spawnIn = VOID.every[d];
  if (impsIn(room) < VOID.cap[d] + (state.twoPlayer ? 1 : 0)) spawnImp(room);
}

// Imps fade in, then zig-zag straight at the nearest wizard.
const baseUpdateMinion = updateMinion;
updateMinion = function updateMinionWithImps(enemy, dt, ux, uy, dist, step) {
  if (!enemy.voidImp) return baseUpdateMinion.apply(this, arguments);
  enemy.alpha = Math.min(1, enemy.alpha + dt * 2.5);
  enemy.attackTimer = 99;
  const wig = Math.sin(state.clock * 7 + enemy.wobble) * 0.45;
  const mx = ux - uy * wig;
  const my = uy + ux * wig;
  const len = Math.hypot(mx, my) || 1;
  if (dist > 6) {
    enemy.x += (mx / len) * step;
    enemy.y += (my / len) * step;
  }
  if (Math.abs(ux) > 0.15) enemy.face = ux > 0 ? 1 : -1;
};

function drawImp(enemy) {
  const a = sprites();
  const f = Math.floor(state.anim * 10 + enemy.wobble * 3) % 6;
  const set = enemy.flash > 0 ? a.impFlash : state.clock < enemy.slowUntil ? a.impFrost : a.imp;
  ctx.globalAlpha = 0.28 * enemy.alpha;
  ctx.fillStyle = OUT;
  ctx.fillRect(Math.round(enemy.x - 10), Math.round(enemy.y + 14), 20, 4);
  ctx.globalAlpha = enemy.alpha;
  blit(set[f], enemy.x, enemy.y, 2, enemy.face < 0);
  ctx.globalAlpha = 1;
}

const baseDrawEnemy = drawEnemy;
drawEnemy = function drawEnemyWithImps(enemy) {
  if (enemy.voidImp) {
    drawImp(enemy);
    return;
  }
  return baseDrawEnemy.apply(this, arguments);
};

function drawRift(rift) {
  const a = sprites();
  let s;
  if (rift.phase === "warn") s = 0.22 + Math.abs(Math.sin(state.anim * 9)) * 0.12;
  else if (rift.phase === "open") s = Math.min(1, 0.3 + (rift.t / VOID.openTime) * 0.7);
  else s = Math.max(0, 1 - rift.t / VOID.closeTime);
  if (s <= 0) return;
  const img = a.rift[Math.floor(state.anim * 8) % 6];
  const w = Math.max(2, Math.round((img.width * 2 * s) / 2) * 2);
  const h = Math.max(2, Math.round((img.height * 2 * s) / 2) * 2);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.translate(Math.round(rift.x), Math.round(rift.y));
  if (rift.flat) ctx.rotate(Math.PI / 2);
  ctx.globalAlpha = rift.phase === "warn" ? 0.55 + Math.sin(state.anim * 23) * 0.25 : 1;
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
  ctx.imageSmoothingEnabled = smooth;
  if (rift.phase === "open" && Math.random() < 0.25) {
    burst(rift.x + rand(-18, 18), rift.y + rand(-18, 18), [V.v4, V.v3], 1, 40, { lift: 20 });
  }
}

/* ---------- 3. sandworm in Sand Crypt rooms ----------
   worm: null, or { phase: "stalk" | "lock" | "burst", t, x, y, r, target }.
   It only hunts while monsters or the boss are still up; a cleared room is calm. */

function sandRoom(room) {
  return !state.treeMode && !room.tree && !room.arena && !room.final && room.biome === SAND_CRYPT;
}

function roomBusy(room) {
  if (bossUp(room)) return true;
  return room.enemies.some((enemy) => enemy.hp > 0 && !enemy.friendly);
}

function groundOk(x, y) {
  const look = window.blockDungeon && window.blockDungeon.terrainAt;
  return !look || !NO_WORM_GROUND.has(look(x, y));
}

function wormTune() {
  return WORM[diffIndex()];
}

function nextWormWait(first = false) {
  const [lo, hi] = wormTune().every;
  return rand(lo, hi) * (first ? 0.6 : 1);
}

function startWorm(target = null) {
  const heroes = livingPlayers();
  const prey = target || (heroes.length ? pick(heroes) : null);
  if (!prey || !groundOk(prey.x, prey.y)) {
    hz.wormWait = 1;
    return null;
  }
  hz.worm = { phase: "stalk", t: 0, x: prey.x, y: prey.y + 6, r: wormTune().r, target: prey };
  noiseBurst(0.6, { volume: 0.07, freq: 260 });
  tipOnce("worm", 4);
  return hz.worm;
}

function wormBite(worm) {
  const tune = wormTune();
  const room = currentRoom();
  const tier = room.tier || 0;
  const dmg = Math.round(tune.dmg * (1 + tier * tune.tierDmg));
  for (const p of livingPlayers()) {
    if (Math.hypot(p.x - worm.x, p.y - worm.y) < worm.r + p.r * 0.5) hurtPlayer(p, dmg, worm.x, worm.y, WORM_HIT);
  }
  for (const enemy of livingFoes(room)) {
    if (enemy.friendly || Math.hypot(enemy.x - worm.x, enemy.y - worm.y) > worm.r + enemy.size * 0.4) continue;
    damageEnemy(enemy, enemy.isBoss ? enemy.maxHp * tune.bossCut : Math.max(12, enemy.maxHp * 0.35), "sand");
  }
  addShake(10);
  burst(worm.x, worm.y, [D.d4, D.d3, D.d5, D.d2], 26, 260, { lift: 80 });
  sfx.slam();
  tone(120, 0.35, { type: "sawtooth", volume: 0.06, slide: -60, delay: 0.05 });
}

function tickWorm(dt) {
  const room = currentRoom();
  if (!sandRoom(room)) {
    hz.worm = null;
    return;
  }
  if (!hz.worm) {
    if (!roomBusy(room)) return;
    hz.wormWait -= dt;
    if (hz.wormWait <= 0) startWorm();
    return;
  }
  const worm = hz.worm;
  const tune = wormTune();
  worm.t += dt;
  if (worm.phase === "stalk") {
    let prey = worm.target;
    if (!prey || prey.hp <= 0) prey = worm.target = livingPlayers()[0] || null;
    if (!prey) {
      hz.worm = null;
      hz.wormWait = nextWormWait();
      return;
    }
    const dx = prey.x - worm.x;
    const dy = prey.y + 6 - worm.y;
    const d = Math.hypot(dx, dy);
    const move = Math.min(d, tune.follow * dt);
    if (d > 0.5) {
      const nx = worm.x + (dx / d) * move;
      const ny = worm.y + (dy / d) * move;
      if (groundOk(nx, ny)) {
        worm.x = nx;
        worm.y = ny;
      }
    }
    if (Math.random() < dt * 10) burst(worm.x + rand(-worm.r, worm.r) * 0.7, worm.y + rand(-worm.r, worm.r) * 0.7, [D.d4, D.d3], 1, 40, { lift: 20 });
    if (worm.t >= STALK_TIME) {
      worm.phase = "lock";
      worm.t = 0;
      tone(90, 0.4, { type: "square", volume: 0.04, slide: 40 });
    }
  } else if (worm.phase === "lock") {
    if (worm.t >= tune.lock) {
      worm.phase = "burst";
      worm.t = 0;
      wormBite(worm);
    }
  } else if (worm.t >= BURST_TIME) {
    hz.worm = null;
    hz.wormWait = nextWormWait();
  }
}

function drawSandCircle(worm) {
  const lock = worm.phase === "lock";
  const shake = lock ? 4 : 2;
  ctx.globalAlpha = lock ? 0.42 : 0.3;
  ctx.fillStyle = D.d0;
  ctx.beginPath();
  ctx.arc(worm.x, worm.y, worm.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  const warn = lock && Math.sin(state.anim * 30) > 0;
  const rings = [[worm.r, 22, 1], [worm.r * 0.6, 12, -1.4], [worm.r * 0.25, 6, 2]];
  for (const [rr, count, dir] of rings) {
    for (let k = 0; k < count; k += 1) {
      const a = (k / count) * Math.PI * 2 + state.anim * dir;
      const jx = (Math.random() - 0.5) * shake * 2;
      const jy = (Math.random() - 0.5) * shake * 2;
      const x = Math.round((worm.x + Math.cos(a) * rr + jx) / 2) * 2;
      const y = Math.round((worm.y + Math.sin(a) * rr + jy) / 2) * 2;
      ctx.fillStyle = rr === worm.r && warn ? R.r2 : rr === worm.r ? (k % 2 ? D.d1 : D.d5) : k % 2 ? D.d2 : D.d5;
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
  }
}

function drawWormHead(worm) {
  const a = sprites();
  const t = worm.t;
  const rise = t < 0.15 ? t / 0.15 : t > 0.6 ? Math.max(0, 1 - (t - 0.6) / 0.3) : 1;
  const frame = t < 0.15 ? 0 : t < 0.22 ? 1 : t < 0.6 ? (Math.floor(t * 12) % 2 ? 2 : 3) : t < 0.75 ? 1 : 0;
  const img = a.worm[frame];
  const rows = Math.round(WORM_H * rise);
  const baseY = Math.round(worm.y + 6);
  if (rows > 0) {
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, WORM_W, rows, Math.round(worm.x - WORM_W), baseY - rows * 2, WORM_W * 2, rows * 2);
    ctx.imageSmoothingEnabled = smooth;
  }
  blit(a.mound, worm.x, baseY + 2, 2);
}

/* ---------- hooks ---------- */

const baseUpdateEffects = updateEffects;
updateEffects = function updateEffectsWithHazards(dt) {
  const result = baseUpdateEffects.apply(this, arguments);
  if (state.mode === "playing") {
    tickVoid(dt);
    tickWorm(dt);
  }
  return result;
};

const baseDrawGround = drawGroundEffects;
drawGroundEffects = function drawGroundWithHazards() {
  const result = baseDrawGround.apply(this, arguments);
  if (hz.rift && hz.rift.roomIndex === state.roomIndex) drawRift(hz.rift);
  if (hz.worm && hz.worm.phase !== "burst") drawSandCircle(hz.worm);
  return result;
};

const baseDrawEffects = drawEffects;
drawEffects = function drawEffectsWithHazards() {
  const result = baseDrawEffects.apply(this, arguments);
  if (hz.worm && hz.worm.phase === "burst") drawWormHead(hz.worm);
  return result;
};

// Imps vanish before the game checks whether the room is clear, so beating
// the boss still clears the room. If the boss doesn't actually go down
// (a big boss's second phase, a fake death), the imps come back.
const baseDefeatEnemy = defeatEnemy;
defeatEnemy = function defeatEnemyWithRift(enemy) {
  const room = currentRoom();
  if (!enemy.isBoss || !hz.rift || hz.rift.boss !== enemy) return baseDefeatEnemy.apply(this, arguments);
  const imps = room.enemies.filter((e) => e.voidImp && e.hp > 0);
  const hp = imps.map((e) => e.hp);
  for (const imp of imps) imp.hp = 0;
  const result = baseDefeatEnemy.apply(this, arguments);
  if (bossUp(room) && room.boss === enemy) imps.forEach((imp, i) => { imp.hp = hp[i]; });
  else {
    for (const imp of imps) burst(imp.x, imp.y, [V.v4, V.v2, "#ffffff"], 10, 150);
    room.enemies = room.enemies.filter((e) => !e.voidImp);
    closeRift();
  }
  return result;
};

function clearHazards() {
  if (hz.rift) {
    const room = rooms[hz.rift.roomIndex];
    if (room) room.enemies = room.enemies.filter((e) => !e.voidImp);
  }
  hz.rift = null;
  hz.worm = null;
}

const baseEnterRoom = enterRoom;
enterRoom = function enterRoomWithHazards() {
  clearHazards();
  const result = baseEnterRoom.apply(this, arguments);
  const room = currentRoom();
  if (room.boss && room.boss.hp >= room.boss.maxHp) room.boss.hzVoidTime = 0;
  hz.wormWait = nextWormWait(true);
  return result;
};

const baseResetBoss = resetBoss;
resetBoss = function resetBossWithRift(room) {
  if (room.boss) room.boss.hzVoidTime = 0;
  const result = baseResetBoss.apply(this, arguments);
  if (room.boss) room.boss.hzVoidTime = 0;
  return result;
};

for (const name of ["loadGame", "startNewGame", "startTreeMode"]) {
  const base = window[name];
  window[name] = function () {
    clearHazards();
    const result = base.apply(this, arguments);
    clearHazards();
    hz.wormWait = nextWormWait(true);
    return result;
  };
}

/* ---------- test handle ---------- */

const bd = window.blockDungeon;
if (bd) {
  for (const name of ["enterRoom", "defeatEnemy", "loadGame", "startNewGame", "startTreeMode"]) {
    if (bd[name]) bd[name] = window[name];
  }
}

window.blockDungeonHazards = {
  FREEZE,
  VOID,
  WORM,
  get rift() { return hz.rift; },
  get worm() { return hz.worm; },
  get wormWait() { return hz.wormWait; },
  seenTips,
  imps: () => currentRoom().enemies.filter((e) => e.voidImp && e.hp > 0),
  voidLimit: () => {
    const room = currentRoom();
    return room.boss ? voidLimit(room.boss, room) : 0;
  },
  // Jump the current boss fight's clock to `left` seconds before the rift opens.
  forceVoid(left = 0) {
    const room = currentRoom();
    if (!room.boss) return false;
    room.boss.hzVoidTime = voidLimit(room.boss, room) - left;
    return true;
  },
  forceWorm(target) {
    hz.worm = null;
    return startWorm(target || null);
  },
  sandRoom: (index) => sandRoom(rooms[index]),
  sprites,
  clear: clearHazards
};
})();
