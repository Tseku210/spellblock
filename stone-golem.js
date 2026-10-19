/* ---------- the secret stone golem king ----------
   Designed by Robin (approved by Tseku). Loads after classes.js and before
   feedback.js, and wraps game functions the same way bosses.js does.

   - Clear the Stone Mine room two rooms before Ember Mountain's big-boss gate
     and a swirling portal opens in the minecart tunnel on the right.
   - It leads to Golem's Hollow, a hidden arena with a pile of stones. Walk up
     to it, or hit it, and Rumblestone the Stone Golem King rises: stone spike
     lines, boulder throws, stomps and summoned golemlings, with a second
     phase where the stone cracks open. Stronger than a Hard big boss.
   - It drops the Stone Grimoire: a Legendary staff whose zaps are stone spikes
     from the ground, and whose special (E) calls Pebble, a 150 HP golem.

   Data: the boss keeps its fight in boss.g, a small state machine
   (sleep -> wake -> move/tell/attack -> transform -> move ...), and its moves
   live in the MOVES table. Pebbles live in golems[], spikes in spikes[], and
   what must survive a reload lives in golem (saved under data.stoneGolem). */

(() => {
  const ARENA_ROOM = TREE_ROOM + 1;
  const MINE_ROOM = 1 * ROOM_COLS + 2;
  const PORTAL = { x: WIDTH - TILE - 22, y: 170 };
  // The return portal sits above the hotbar, clear of both co-op hotbars too.
  const RETURN = { x: WIDTH / 2, y: HEIGHT - 120 };
  const ARRIVE = { x: WIDTH / 2, y: HEIGHT - 185 };
  const PILE_SPOT = { x: WIDTH / 2, y: 230 };
  const GOLEMLING = enemyTypes.findIndex((type) => type.name === "Iron Golemling");
  const BOSS_NAME = "Rumblestone the Stone Golem King";
  const PHASE2_NAME = "Rumblestone, Cracked Open";
  const PILE_NAME = "A pile of stones";
  // Fight length in staff-seconds per difficulty, and how hard a hit lands.
  // Normal and Hard beat a Hard big boss (34 s, 1.85x hp, 1.5x boss damage);
  // Easy lands near a Normal big boss.
  const GOLEM_SECONDS = [50, 44, 44];
  const GOLEM_HIT = [1.3, 1.75, 1.85];
  const PHASE1_SHARE = 0.55;
  const PEBBLE_HP = 150;
  const HOLLOW = { name: "Golem's Hollow", floor: "#4a4546", floor2: "#413c3d", wall: "#221e1f", ambient: "dust", root: 50 };

  Object.assign(staffTypes, {
    grimoire: { name: "Stone Grimoire", rarity: 3, gem: "#8189a3", wood: "#59597a", move: "Golem Friend", cooldown: 20, desc: "Stone spikes burst from the ground where you aim. The special calls Pebble, a 150 HP golem." }
  });

  const freshGolem = () => ({ beaten: false, tips: {}, lockUntil: 0 });
  let golem = freshGolem();
  const golems = [];
  const spikes = [];

  /* ---------- pixel painting (2x grid, stone ramp, navy outlines) ---------- */

  const C = {
    out: "#1d1a2f", s0: "#221f36", s1: "#3a3854", s2: "#59597a", s3: "#8189a3", s4: "#b3bccb", s5: "#e1e7ea",
    y1: "#e08a2e", y2: "#f5c542", y3: "#fff0a3", r2: "#d6455d", w4: "#78c9ea", v0: "#3b2470", v1: "#5b3fb8", v2: "#8f6cff", v3: "#d6c7ff", ore: "#7ee7f0"
  };
  const sheets = new Map();

  // A cached sprite canvas painted by `paint(g)` in sprite pixels; blit2 scales it 2x.
  function sheetOf(key, w, h, paint) {
    let sheet = sheets.get(key);
    if (sheet) return sheet;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    paint(canvas.getContext("2d"));
    const white = document.createElement("canvas");
    white.width = w;
    white.height = h;
    const wg = white.getContext("2d");
    wg.drawImage(canvas, 0, 0);
    wg.globalCompositeOperation = "source-in";
    wg.fillStyle = "#ffffff";
    wg.fillRect(0, 0, w, h);
    sheet = { canvas, flip: canvas, white, whiteFlip: white, width: w, height: h };
    sheets.set(key, sheet);
    return sheet;
  }

  // A rounded boulder: navy outline, lit top-left, shaded bottom-right, a crack.
  function boulder(g, cx, cy, rx, ry, pal, seed = 0) {
    cx = Math.round(cx);
    cy = Math.round(cy);
    for (let y = -ry - 1; y <= ry + 1; y += 1) {
      const inner = Math.abs(y) <= ry ? Math.round(rx * Math.sqrt(Math.max(0, 1 - (y / ry) ** 2))) : -1;
      const outer = Math.round((rx + 1) * Math.sqrt(Math.max(0, 1 - (y / (ry + 1)) ** 2)));
      if (outer <= 0) continue;
      g.fillStyle = pal.out;
      g.fillRect(cx - outer, cy + y, outer * 2 + 1, 1);
      if (inner < 0) continue;
      g.fillStyle = y > ry * 0.35 ? pal.dark : pal.base;
      g.fillRect(cx - inner, cy + y, inner * 2 + 1, 1);
      if (y < -ry * 0.2) {
        g.fillStyle = pal.light;
        g.fillRect(cx - inner, cy + y, Math.max(1, Math.round(inner * (y < -ry * 0.6 ? 1.6 : 0.9))), 1);
      }
      if (y > ry * 0.35) {
        g.fillStyle = pal.dark;
        g.fillRect(cx + Math.round(inner * 0.3), cy + y, Math.max(1, inner - Math.round(inner * 0.3) + 1), 1);
      }
    }
    g.fillStyle = pal.light2 || pal.light;
    g.fillRect(cx - Math.round(rx * 0.5), cy - Math.round(ry * 0.6), 2, 1);
    const k = (seed * 7) % 3;
    g.fillStyle = pal.dark;
    g.fillRect(cx + 1 + k, cy, 1, 2);
    g.fillRect(cx + 2 + k, cy + 2, 1, 1);
  }

  const STONE = { out: C.out, base: C.s3, light: C.s4, light2: C.s5, dark: C.s2 };
  const SLEEPY = { out: C.out, base: C.s2, light: C.s3, light2: C.s4, dark: C.s1 };
  const PEBBLE = { out: C.out, base: C.s3, light: C.s4, light2: C.s5, dark: C.s2 };

  /* The king is built from boulders. Each part has a spot in the sleeping pile
     and a spot in the standing golem; the wake-up slides between the two. */
  const PARTS = [
    { id: "legL", rx: 8, ry: 9, pile: [-12, -7], stand: [-12, -9] },
    { id: "legR", rx: 8, ry: 9, pile: [12, -7], stand: [12, -9] },
    { id: "armL", rx: 7, ry: 11, pile: [-30, -8], stand: [-30, -26] },
    { id: "armR", rx: 7, ry: 11, pile: [30, -8], stand: [30, -26] },
    { id: "body", rx: 20, ry: 15, pile: [0, -14], stand: [0, -30] },
    { id: "shL", rx: 9, ry: 8, pile: [-20, -22], stand: [-24, -42] },
    { id: "shR", rx: 9, ry: 8, pile: [20, -22], stand: [24, -42] },
    { id: "head", rx: 11, ry: 10, pile: [2, -30], stand: [0, -56] }
  ];
  const SHEET_W = 80;
  const SHEET_H = 84;
  const FEET_Y = 80;

  // pose: "pile" (asleep), "idle", "walk", "raise" (arms up), "slam" (fist down).
  // k slides from the pile (0) to standing (1). frame picks the animation step.
  function kingSheet(phase, pose, frame, k) {
    const key = `king|${phase}|${pose}|${frame}|${k.toFixed(2)}`;
    return sheetOf(key, SHEET_W, SHEET_H, (g) => {
      const cx = SHEET_W / 2;
      const pal = k < 0.3 ? SLEEPY : STONE;
      const bob = pose === "walk" ? (frame % 2 ? -2 : 0) : pose === "idle" ? [0, -1, -1, 0][frame % 4] : 0;
      const swing = pose === "walk" ? (frame % 2 ? 1 : -1) * 3 : pose === "idle" ? [0, 1, 0, -1][frame % 4] : 0;
      const spots = {};
      for (const part of PARTS) {
        let x = part.pile[0] + (part.stand[0] - part.pile[0]) * k;
        let y = part.pile[1] + (part.stand[1] - part.pile[1]) * k;
        if (k >= 1) {
          if (part.id !== "legL" && part.id !== "legR") y += bob;
          if (part.id === "armL") y += pose === "raise" ? -20 : pose === "slam" ? 10 : swing;
          if (part.id === "armR") y += pose === "raise" ? -20 : pose === "slam" ? -4 : -swing;
          if (part.id === "armL" && pose === "slam") x += 6;
          if (part.id === "legL" && pose === "walk") y += frame % 2 ? -3 : 0;
          if (part.id === "legR" && pose === "walk") y += frame % 2 ? 0 : -3;
        }
        spots[part.id] = [cx + x, FEET_Y + y];
        boulder(g, cx + x, FEET_Y + y, part.rx, part.ry, pal, PARTS.indexOf(part));
      }
      const [hx, hy] = spots.head;
      const [bx, by] = spots.body;
      if (k < 0.3) {
        // Ore glints on the sleeping pile, like every other rock in the mine.
        g.fillStyle = C.y2;
        g.fillRect(Math.round(bx) - 9, Math.round(by) - 4, 2, 2);
        g.fillStyle = C.ore;
        g.fillRect(Math.round(hx) + 4, Math.round(hy) + 1, 2, 2);
        g.fillStyle = C.s5;
        g.fillRect(Math.round(bx) - 9, Math.round(by) - 4, 1, 1);
        return;
      }
      const eye = phase === 2 ? C.r2 : C.y2;
      const glow = phase === 2 ? C.y1 : C.y2;
      g.fillStyle = C.out;
      g.fillRect(Math.round(hx) - 7, Math.round(hy) - 3, 5, 4);
      g.fillRect(Math.round(hx) + 2, Math.round(hy) - 3, 5, 4);
      g.fillStyle = eye;
      g.fillRect(Math.round(hx) - 6, Math.round(hy) - 2, 3, 2);
      g.fillRect(Math.round(hx) + 3, Math.round(hy) - 2, 3, 2);
      g.fillStyle = C.out;
      g.fillRect(Math.round(hx) - 4, Math.round(hy) + 4, 8, 1);
      // The crown.
      const crownY = Math.round(hy) - 10 - Math.round(k * 2);
      g.fillStyle = C.out;
      g.fillRect(Math.round(hx) - 9, crownY - 5, 18, 7);
      g.fillStyle = C.y1;
      g.fillRect(Math.round(hx) - 8, crownY - 1, 16, 2);
      g.fillStyle = C.y2;
      g.fillRect(Math.round(hx) - 8, crownY - 2, 16, 1);
      for (const px of [-8, -3, 2, 7]) {
        g.fillStyle = C.y2;
        g.fillRect(Math.round(hx) + px, crownY - 4, 2, 2);
      }
      g.fillStyle = C.r2;
      g.fillRect(Math.round(hx) - 1, crownY - 1, 2, 2);
      // Chest gem, plus glowing cracks once the king has cracked open.
      g.fillStyle = C.out;
      g.fillRect(Math.round(bx) - 3, Math.round(by) - 4, 6, 7);
      g.fillStyle = glow;
      g.fillRect(Math.round(bx) - 2, Math.round(by) - 3, 4, 5);
      g.fillStyle = C.y3;
      g.fillRect(Math.round(bx) - 2, Math.round(by) - 3, 1, 2);
      if (phase === 2) {
        g.fillStyle = C.y1;
        for (const [ox, oy, w, h] of [[-12, -6, 1, 5], [-11, -1, 3, 1], [8, -8, 1, 4], [9, -4, 2, 1], [4, 6, 5, 1], [-6, 8, 1, 3]]) g.fillRect(Math.round(bx) + ox, Math.round(by) + oy, w, h);
        for (const id of ["armL", "armR", "head"]) {
          const [ax, ay] = spots[id];
          g.fillRect(Math.round(ax) - 2, Math.round(ay) + 2, 1, 4);
          g.fillRect(Math.round(ax) - 1, Math.round(ay) + 5, 2, 1);
        }
      }
    });
  }

  // Pebble: a knee-high golem built the same way.
  const PEBBLE_PARTS = [
    { rx: 3, ry: 3, at: [-5, -3] }, { rx: 3, ry: 3, at: [5, -3] }, { rx: 8, ry: 6, at: [0, -10] }, { rx: 3, ry: 5, at: [-11, -9] }, { rx: 3, ry: 5, at: [11, -9] }, { rx: 5, ry: 4, at: [0, -19] }
  ];
  function pebbleSheet(frame) {
    return sheetOf(`pebble|${frame}`, 32, 28, (g) => {
      const cx = 16;
      const feet = 26;
      PEBBLE_PARTS.forEach((part, i) => {
        let [x, y] = part.at;
        if (i === 3 || i === 4) y += frame === 2 ? -7 : frame === 1 ? (i === 3 ? 2 : -2) : 0;
        if (i === 5 && frame === 1) y -= 1;
        if ((i === 0 && frame === 1) || (i === 1 && frame === 0)) y -= 1;
        boulder(g, cx + x, feet + y, part.rx, part.ry, PEBBLE, i + 3);
      });
      g.fillStyle = C.out;
      g.fillRect(cx - 4, feet - 20, 3, 3);
      g.fillRect(cx + 1, feet - 20, 3, 3);
      g.fillStyle = C.w4;
      g.fillRect(cx - 3, feet - 19, 2, 1);
      g.fillRect(cx + 2, feet - 19, 2, 1);
      g.fillStyle = C.out;
      g.fillRect(cx - 2, feet - 16, 4, 1);
      g.fillStyle = C.w4;
      g.fillRect(cx - 1, feet - 11, 2, 2);
    });
  }

  // The swirling portal in a stone arch, 6 frames.
  function portalSheet(frame) {
    return sheetOf(`portal|${frame}`, 24, 30, (g) => {
      g.fillStyle = C.out;
      g.fillRect(2, 2, 20, 27);
      for (const [x, y, w, h] of [[3, 3, 18, 25], [0, 26, 24, 4]]) {
        g.fillStyle = C.s2;
        g.fillRect(x, y, w, h);
      }
      g.fillStyle = C.s3;
      g.fillRect(3, 3, 18, 2);
      g.fillRect(3, 3, 2, 23);
      g.fillStyle = C.s1;
      g.fillRect(19, 5, 2, 21);
      g.fillRect(3, 24, 18, 2);
      g.fillStyle = C.out;
      g.fillRect(5, 5, 14, 20);
      g.fillStyle = C.v0;
      g.fillRect(6, 6, 12, 18);
      const cx = 12;
      const cy = 15;
      for (const [r, color, dir] of [[6, C.v1, 1], [4, C.v2, -1], [2, C.v3, 1]]) {
        const n = r * 4;
        for (let i = 0; i < n; i += 1) {
          if ((i + frame * dir + n) % 4 === 0) continue;
          const a = (i / n) * Math.PI * 2;
          const x = Math.round(cx + Math.cos(a) * r * 0.85);
          const y = Math.round(cy + Math.sin(a) * r * 1.3);
          g.fillStyle = color;
          g.fillRect(x, y, 1, 1);
        }
      }
      g.fillStyle = C.y3;
      g.fillRect(cx + ((frame * 5) % 7) - 3, cy + ((frame * 3) % 9) - 4, 1, 1);
      g.fillRect(cx, cy, 1, 1);
    });
  }

  const SPIKE_ROWS = ["   oo   ", "  oHLo  ", "  oHLo  ", " oHHLLo ", " oHHLLo ", " oHHLLo ", "oHHHLLLo", "oHHHLLLo", "oHHHLLLo", "oHHHLLLo", "oHHHLLLo", " oooooo "];
  const SHORT_SPIKE_ROWS = ["  oo  ", " oHLo ", " oHLo ", "oHHLLo", "oHHLLo", "oHHLLo", "oHHLLo", " oooo "];
  function spikeSheet(tall, foe) {
    const pal = foe ? { o: C.out, H: C.s3, L: C.s1 } : { o: C.out, H: C.s5, L: C.s3 };
    return pixelSheet(`golem-spike|${tall}|${foe}`, tall ? SPIKE_ROWS : SHORT_SPIKE_ROWS, pal);
  }

  /* ---------- the hidden arena room ---------- */

  function makeArenaRoom() {
    return { index: ARENA_ROOM, biome: HOLLOW, visited: false, populated: false, cleared: false, enemies: [], boss: null, crates: [], tier: 0, final: false, golemArena: true };
  }

  function arenaRoom() {
    return rooms[ARENA_ROOM] && rooms[ARENA_ROOM].golemArena ? rooms[ARENA_ROOM] : null;
  }

  function golemTotalHp(room) {
    return bossHpFor(room.tier, GOLEM_SECONDS[state.difficulty] || GOLEM_SECONDS[1], true);
  }

  function golemPhaseHp(room, phase) {
    return Math.round(golemTotalHp(room) * (phase === 1 ? PHASE1_SHARE : 1 - PHASE1_SHARE));
  }

  function makeGolemKing(room) {
    const d = state.difficulty;
    const hit = Math.round((19 + room.tier * 0.3) * 1.25 * difficulty().damage * (GOLEM_HIT[d] || GOLEM_HIT[1]));
    return {
      typeIndex: -1,
      type: { color: "#8189a3", accent: "#f5c542", name: "Stone Golem King" },
      name: PILE_NAME,
      x: PILE_SPOT.x,
      y: PILE_SPOT.y,
      homeX: PILE_SPOT.x,
      homeY: PILE_SPOT.y,
      size: 70,
      hp: golemPhaseHp(room, 1),
      maxHp: golemPhaseHp(room, 1),
      speed: 0,
      damage: Math.round(hit * 0.6),
      behavior: "golemking",
      isBoss: true,
      golemKing: true,
      small: false,
      temp: false,
      hitCooldown: 9,
      attackTimer: 99,
      slowUntil: 0,
      flash: 0,
      state: "move",
      stateTimer: 0,
      lockX: 0,
      lockY: 0,
      wobble: 0,
      strafe: 1,
      patterns: [],
      patternIndex: 0,
      spiralTime: 0,
      spiralTick: 0,
      spiralAngle: 0,
      enraged: false,
      furious: false,
      dodgeTimer: 99,
      hop: 0,
      // Asleep it reads as scenery: pets, auto-aim and allies leave it alone (alpha <= 0.3).
      alpha: 0.3,
      g: { state: "sleep", t: 0, phase: 1, hit, move: null, last: null, wait: 0, summonAt: 0, face: 1, walk: 0, pose: "pile" }
    };
  }

  function phaseTwo(boss) {
    return boss.g.phase === 2;
  }

  function kingSpeed(boss) {
    return 46 * bossTune().speed * (phaseTwo(boss) ? 1.3 : 1);
  }

  // Rubble, cracks and wall boulders on top of the plain floor.
  function decorateArena(room) {
    const g = bgCtx;
    const rng = mulberry32(room.index * 977 + 3);
    for (let i = 0; i < 90; i += 1) {
      const x = snap(TILE + 10 + rng() * (WIDTH - 2 * TILE - 20));
      const y = snap(TILE + 10 + rng() * (HEIGHT - 2 * TILE - 20));
      if (Math.hypot(x - RETURN.x, y - RETURN.y) < 60) continue;
      g.fillStyle = rng() < 0.5 ? C.s1 : C.s3;
      g.fillRect(x, y, 4, 2);
      g.fillStyle = C.out;
      g.fillRect(x, y + 2, 4, 2);
    }
    for (let i = 0; i < 14; i += 1) {
      const x = snap(TILE + 40 + rng() * (WIDTH - 2 * TILE - 80));
      const y = snap(TILE + 40 + rng() * (HEIGHT - 2 * TILE - 80));
      g.fillStyle = C.s0;
      for (let s = 0; s < 5; s += 1) g.fillRect(x + s * 4, y + (s % 2) * 2 + (rng() < 0.4 ? 2 : 0), 4, 2);
    }
    const scratch = sheetOf("hollow-boulders", 120, 36, (sg) => {
      boulder(sg, 16, 20, 14, 10, STONE, 11);
      boulder(sg, 48, 24, 10, 8, SLEEPY, 5);
      boulder(sg, 80, 18, 16, 12, STONE, 2);
      boulder(sg, 108, 24, 8, 7, SLEEPY, 8);
      sg.fillStyle = C.ore;
      sg.fillRect(78, 14, 2, 2);
      sg.fillStyle = C.y2;
      sg.fillRect(14, 16, 2, 2);
    });
    for (const [x, y] of [[TILE + 10, TILE + 2], [WIDTH - TILE - 250, TILE + 2], [TILE + 30, HEIGHT - TILE - 76], [WIDTH - TILE - 270, HEIGHT - TILE - 76]]) blit2(g, scratch, x, y);
    // A worn ring of flagstones where the king sleeps.
    g.fillStyle = "rgba(0, 0, 0, 0.18)";
    for (let a = 0; a < Math.PI * 2; a += 0.2) {
      const px = snap(PILE_SPOT.x + Math.cos(a) * 150);
      const py = snap(PILE_SPOT.y + 10 + Math.sin(a) * 90);
      g.fillRect(px, py, 6, 4);
    }
  }

  /* ---------- the king's fight ---------- */

  function kingTarget(boss) {
    return bossTarget(boss);
  }

  function spawnBossSpikes(x1, y1, x2, y2) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(1, Math.floor(len / 26));
    for (let i = 0; i <= n; i += 1) {
      const k = i / n;
      spikes.push({ x: x1 + (x2 - x1) * k, y: y1 + (y2 - y1) * k, t: -i * 0.02, foe: true, tall: i % 2 === 0, damage: 0, hits: null });
    }
  }

  // Every move is a small step machine: start() sets it up, update() returns true when it's done.
  const MOVES = {
    spikes: {
      weight(boss, dist) { return dist > 150 ? 2.2 : 1; },
      start(boss, s) {
        const target = kingTarget(boss);
        const base = Math.atan2(target.y - boss.y, target.x - boss.x);
        const offsets = phaseTwo(boss) ? [-0.5, -0.25, 0, 0.25, 0.5] : [-0.3, 0, 0.3];
        const warn = tele(1.0);
        for (const off of offsets) {
          const a = base + off;
          const x1 = boss.x + Math.cos(a) * 44;
          const y1 = boss.y + 20 + Math.sin(a) * 30;
          const end = rayToWall(x1, y1, a);
          const reach = Math.min(end.dist - 10, 460);
          const x2 = x1 + Math.cos(a) * reach;
          const y2 = y1 + Math.sin(a) * reach;
          const fx = warnLine(x1, y1, x2, y2, 36, warn, Math.round(boss.g.hit * 0.8), "stone", { boss, how: "zone", after: () => spawnBossSpikes(x1, y1, x2, y2) });
          fx.life = warn + 0.06;
        }
        s.done = warn + 0.55;
        boss.g.pose = "slam";
        tone(90, 0.4, { type: "sawtooth", volume: 0.05, slide: -40 });
      },
      update(boss, s) {
        if (s.t > s.done - 0.3) boss.g.pose = "idle";
        return s.t >= s.done;
      }
    },
    boulders: {
      weight(boss, dist) { return dist > 220 ? 2 : 0.7; },
      start(boss, s) {
        s.count = phaseTwo(boss) ? 4 : 2;
        s.thrown = 0;
        s.next = 0.25;
        s.done = 0.25 + s.count * 0.4 + 0.5;
        boss.g.pose = "raise";
      },
      update(boss, s) {
        if (s.thrown < s.count && s.t >= s.next) {
          s.thrown += 1;
          s.next += 0.4;
          const lead = leadPoint(kingTarget(boss), 0.35);
          const spot = inArena(lead.x + rand(-30, 30), lead.y + rand(-30, 30), 50);
          warnCircle(spot.x, spot.y, 48, tele(1.15), Math.round(boss.g.hit * 0.9), "rock", { boss, how: "zone", sx: boss.x, sy: boss.y - 90 });
          noiseBurst(0.12, { volume: 0.05, freq: 500 });
        }
        if (s.thrown >= s.count) boss.g.pose = "idle";
        return s.t >= s.done;
      }
    },
    stomp: {
      weight(boss, dist) { return dist < 260 ? 2.4 : 0.6; },
      start(boss, s) {
        const target = kingTarget(boss);
        const d = Math.hypot(target.x - boss.x, target.y - boss.y) || 1;
        const reach = Math.min(d, 260);
        const land = inArena(boss.x + ((target.x - boss.x) / d) * reach, boss.y + ((target.y - boss.y) / d) * reach, 60);
        s.from = { x: boss.x, y: boss.y };
        s.to = land;
        s.dur = 0.75;
        s.r = phaseTwo(boss) ? 150 : 120;
        s.done = s.dur + 0.7;
        boss.g.pose = "raise";
        warnCircle(land.x, land.y + 20, s.r, s.dur, Math.round(boss.g.hit * 1.0), "stomp", { boss, how: "parry", after: () => {
          addRing(land.x, land.y + 20, s.r, "#b3bccb", 0.35, 10);
          burst(land.x, land.y + 20, [C.s3, C.s4, C.s1], 26, 300, { gravity: 400 });
          addShake(12);
          sfx.slam();
        } });
      },
      update(boss, s) {
        const k = clamp(s.t / s.dur, 0, 1);
        boss.x = s.from.x + (s.to.x - s.from.x) * k;
        boss.y = s.from.y + (s.to.y - s.from.y) * k;
        boss.hop = Math.sin(k * Math.PI) * 130;
        if (k >= 1) {
          boss.hop = 0;
          boss.g.pose = "slam";
        }
        return s.t >= s.done;
      }
    },
    summon: {
      weight(boss, dist, room) { return state.clock > boss.g.summonAt && livingTemps(room) < 3 ? 3.2 : 0; },
      start(boss, s) {
        const n = phaseTwo(boss) ? 3 : 2;
        s.spots = [];
        for (let i = 0; i < n; i += 1) {
          const a = Math.PI / 2 + ((i - (n - 1) / 2) * Math.PI) / 2.2 + (boss.g.face < 0 ? Math.PI : 0);
          s.spots.push(inArena(boss.x + Math.cos(a) * 120, boss.y + 30 + Math.sin(a) * 80, 50));
        }
        s.rise = tele(0.9);
        s.done = s.rise + 0.5;
        s.risen = false;
        boss.g.pose = "raise";
        floatText(boss.x, boss.y - 130, "RISE!", "#f5c542", 24);
        sfx.rumble();
        boss.g.summonAt = state.clock + (phaseTwo(boss) ? 13 : 17);
      },
      update(boss, s, dt, room) {
        if (!s.risen && s.t >= s.rise) {
          s.risen = true;
          for (const spot of s.spots) {
            const minion = spawnHelper(room, GOLEMLING, spot.x, spot.y, false);
            if (minion) minion.name = "Golemling";
          }
          addShake(6);
          toast("The king called his golemlings!", 2);
          boss.g.pose = "idle";
        }
        return s.t >= s.done;
      },
      draw(boss, s) {
        if (s.risen) return;
        const k = s.t / s.rise;
        for (const spot of s.spots) {
          blockRing(spot.x, spot.y, 22 + k * 8, C.out, 6);
          blockRing(spot.x, spot.y, 22 + k * 8, k > 0.7 && Math.floor(state.anim * 16) % 2 === 0 ? C.s5 : C.y2, 4, 3, state.anim * 10);
        }
      }
    }
  };

  function chooseMove(boss, dist, room) {
    const ids = Object.keys(MOVES).filter((id) => id !== boss.g.last);
    const weights = ids.map((id) => MOVES[id].weight(boss, dist, room));
    let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < ids.length; i += 1) {
      roll -= weights[i];
      if (roll <= 0) return ids[i];
    }
    return ids[ids.length - 1];
  }

  function startMove(boss, id) {
    const s = { id, t: 0 };
    boss.g.move = s;
    boss.g.last = id;
    boss.g.state = "attack";
    MOVES[id].start(boss, s);
  }

  function wakeKing(boss) {
    if (boss.g.state !== "sleep") return;
    boss.g.state = "wake";
    boss.g.t = 0;
    boss.alpha = 1;
    sfx.rumble();
    addShake(6);
    toast("The stones are moving...", 2);
  }

  function roar(boss, subtitle) {
    sfx.roar();
    addShake(14);
    addRing(boss.x, boss.y, 200, "#f5c542", 0.5, 10);
    banners.length = 0;
    banner(boss.name, subtitle, "#f5c542", 3.2);
  }

  function startCrackedPhase(boss, room) {
    const g = boss.g;
    g.phase = 2;
    g.state = "transform";
    g.t = 0;
    g.move = null;
    g.pose = "raise";
    boss.maxHp = golemPhaseHp(room, 2);
    boss.hp = boss.maxHp;
    boss.name = PHASE2_NAME;
    boss.enraged = true;
    boss.hop = 0;
    boss.stunUntil = 0;
    for (const projectile of projectiles) {
      if (projectile.owner === "enemy") projectile.life = 0;
    }
    clearBossFx();
    state.slowmo = 0.7;
    addShake(10);
    burst(boss.x, boss.y - 40, [C.y1, C.y2, C.s3], 40, 320);
    banners.length = 0;
    banner(PHASE2_NAME, "Phase two! The stone cracks open!", "#ff5a3d", 3);
    toast("Rumblestone is cracking open! Watch out for more spikes.", 2.6);
  }

  function updateGolemKing(boss, dt, dist, room) {
    const g = boss.g;
    g.t += dt;
    boss.hitCooldown = Math.max(boss.hitCooldown, g.state === "sleep" || g.state === "wake" || g.state === "transform" ? 9 : 0);
    const target = kingTarget(boss);
    if (Math.abs(target.x - boss.x) > 20) g.face = target.x > boss.x ? 1 : -1;

    if (g.state === "sleep") {
      // Walking up wakes it, and so does a bolt or arrow aimed at the pile by hand.
      for (const shot of projectiles) {
        if (shot.owner !== "player" || shot.life <= 0 || Math.hypot(shot.x - boss.x, shot.y - boss.y) > shot.r + 34) continue;
        shot.life = 0;
        burst(shot.x, shot.y, [C.s3, "#ffffff"], 6, 120);
        wakeKing(boss);
      }
      if (dist < 170) wakeKing(boss);
      return;
    }
    if (g.state === "wake" || g.state === "transform") {
      for (const p of activePlayers()) p.invulnerable = Math.max(p.invulnerable, 0.4);
      const length = g.state === "wake" ? 2.8 : 1.8;
      if (g.state === "wake" && g.t < 1.6 && Math.random() < dt * 20) burst(boss.x + rand(-50, 50), boss.y + rand(-10, 20), [C.s3, C.s1, "#ffffff"], 1, 60, { lift: 40 });
      if (g.state === "transform" && Math.random() < dt * 30) burst(boss.x + rand(-40, 40), boss.y - rand(0, 100), [C.y1, C.y2], 1, 80, { lift: 60 });
      if (g.state === "wake" && !g.roared && g.t > 2.0) {
        g.roared = true;
        boss.name = BOSS_NAME;
        boss.size = 100;
        roar(boss, "The Stone Golem King wakes up!");
      }
      if (g.state === "transform" && !g.roared2 && g.t > 1.2) {
        g.roared2 = true;
        roar(boss, "Cracked open and angrier than ever!");
      }
      if (g.t >= length) {
        g.state = "move";
        g.pose = "idle";
        g.wait = 1.2;
        boss.speed = kingSpeed(boss);
        for (const p of activePlayers()) p.invulnerable = Math.max(p.invulnerable, 0.8);
      }
      return;
    }
    if (g.state === "attack") {
      const s = g.move;
      s.t += dt;
      if (MOVES[s.id].update(boss, s, dt, room) || s.t > 12) {
        g.move = null;
        g.state = "move";
        g.pose = "idle";
        boss.hop = 0;
        g.wait = (1.5 + rand(0, 0.7)) * bossTune().pace * (phaseTwo(boss) ? 0.8 : 1);
      }
      return;
    }
    // "move": close in when far, then pick the next move.
    g.wait -= dt;
    if (dist > 230) {
      const step = kingSpeed(boss) * dt;
      boss.x += ((target.x - boss.x) / dist) * step;
      boss.y += ((target.y - boss.y) / dist) * step;
      g.walk += dt;
      g.pose = "walk";
    } else {
      g.pose = "idle";
    }
    if (g.wait <= 0) startMove(boss, chooseMove(boss, dist, room));
  }

  function kingReward(boss, room) {
    for (const enemy of room.enemies) {
      if (enemy.hp > 0) {
        enemy.hp = 0;
        burst(enemy.x, enemy.y, [enemy.type.color, "#ffffff"], 12, 180);
      }
    }
    for (const projectile of projectiles) {
      if (projectile.owner === "enemy") projectile.life = 0;
    }
    clearBossFx();
    room.cleared = true;
    addShake(18);
    burst(boss.x, boss.y - 40, [C.s3, C.s4, C.y2, "#ffffff"], 60, 380, { gravity: 300 });
    confetti(boss.x, boss.y, 120);
    confetti(WIDTH * 0.25, 120, 50);
    confetti(WIDTH * 0.75, 120, 50);
    sfx.bigWin();
    dropLoot(boss.x, boss.y, "gem", 10);
    dropLoot(boss.x, boss.y, "heart", 2);
    dropLoot(boss.x, boss.y, "star", 2);
    dropLoot(boss.x, boss.y, "spirit", 4);
    dropStaff(room, boss.x, boss.y + 70, "grimoire", 1);
    for (const p of activePlayers()) {
      if (p.hp <= 0) revivePlayer(p, 1);
      p.hp = stats.maxHp;
      p.mana = stats.maxMana;
      burst(p.x, p.y, ["#ef5b4b", "#ffffff"], 14, 180, { heart: true });
    }
    state.picksLeft = 2;
    banners.length = 0;
    banner("SUPER BOSS DEFEATED!", "Rumblestone crumbled and dropped the Stone Grimoire!", "#f5c542", 4.2);
    toast("Stand on the Stone Grimoire to take it. Your old staff drops in its place.", 4);
    golem.beaten = true;
    saveGame();
  }

  /* ---------- Pebble and the stone spikes ---------- */

  function pebbleHp(p) {
    return PEBBLE_HP + 15 * ((p.staff && p.staff.level) - 1 || 0);
  }

  function summonPebble(p) {
    const spot = inArena(p.x + p.dirX * 44, p.y + p.dirY * 44, 20);
    let pebble = golems.find((a) => a.owner === p.index);
    if (pebble) {
      pebble.hp = pebble.maxHp;
      pebble.x = spot.x;
      pebble.y = spot.y;
      floatText(spot.x, spot.y - 40, "Patched up!", "#b3bccb", 15);
    } else {
      pebble = { owner: p.index, x: spot.x, y: spot.y, hp: pebbleHp(p), maxHp: pebbleHp(p), face: p.dirX < 0 ? -1 : 1, timer: 0.5, atk: -9, hop: 0, hurtAt: 0, rise: 0.4 };
      golems.push(pebble);
    }
    burst(spot.x, spot.y + 6, [C.s3, C.s4, C.s1], 16, 160, { gravity: 300 });
    addShake(3);
    tone(110, 0.3, { type: "square", volume: 0.05, slide: 60 });
    if (!golem.tips.pebble) {
      golem.tips.pebble = true;
      toast("Pebble the golem fights beside you until it crumbles or you leave the room.", 3.5);
    }
  }

  function pebbleTarget(a, owner) {
    let best = null;
    let bestD = Infinity;
    for (const enemy of livingFoes(currentRoom())) {
      if (enemy.alpha <= 0.3 || enemy.friendly || (enemy.golemKing && enemy.g.state === "sleep")) continue;
      if (Math.hypot(enemy.x - owner.x, enemy.y - owner.y) > 360) continue;
      const d = Math.hypot(enemy.x - a.x, enemy.y - a.y);
      if (d < bestD) {
        bestD = d;
        best = enemy;
      }
    }
    return best;
  }

  function movePebble(a, tx, ty, speed, dt) {
    const dx = tx - a.x;
    const dy = ty - a.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return false;
    const step = Math.min(d, speed * dt);
    a.x = clamp(a.x + (dx / d) * step, TILE + 12, WIDTH - TILE - 12);
    a.y = clamp(a.y + (dy / d) * step, TILE + 12, HEIGHT - TILE - 12);
    pushOutOfCrates(a, 11);
    if (Math.abs(dx) > 2) a.face = dx > 0 ? 1 : -1;
    return true;
  }

  function hurtPebble(a, amount, x, y) {
    const damage = Math.max(1, Math.round(amount));
    a.hp -= damage;
    floatText(a.x, a.y - 36, `-${damage}`, "#b3bccb", 13);
    burst(x, y, [C.s3, C.s1], 5, 120);
  }

  function updateGolems(dt) {
    const room = currentRoom();
    for (const a of golems) {
      const owner = players[a.owner];
      if (a.rise > 0) {
        a.rise -= dt;
        continue;
      }
      a.timer -= dt;
      const target = pebbleTarget(a, owner);
      let moving = false;
      if (target) {
        const reach = target.size / 2 + 22;
        const d = Math.hypot(target.x - a.x, target.y - a.y);
        if (d > reach) moving = movePebble(a, target.x, target.y, 125, dt);
        else {
          a.face = target.x >= a.x ? 1 : -1;
          if (a.timer <= 0) {
            a.timer = 0.9;
            a.atk = state.anim;
            damageEnemy(target, 14 * spellPower() * staffPower(owner), "staff");
            burst(target.x, target.y, [C.s4, "#ffffff"], 6, 140);
            noiseBurst(0.06, { volume: 0.04, freq: 700 });
          }
        }
      } else {
        const angle = Math.atan2(-owner.dirY, -owner.dirX) + 0.7;
        const tx = owner.x + Math.cos(angle) * 46;
        const ty = owner.y + 8 + Math.sin(angle) * 30;
        if (Math.hypot(tx - a.x, ty - a.y) > 16) moving = movePebble(a, tx, ty, Math.max(125, Math.hypot(tx - a.x, ty - a.y) * 3), dt);
      }
      a.hop += dt * (moving ? 10 : 2);
      if (state.clock > a.hurtAt) {
        for (const foe of livingFoes(room)) {
          if (foe.friendly || foe.alpha <= 0.5 || (foe.golemKing && foe.g.state !== "move" && foe.g.state !== "attack") || Math.hypot(foe.x - a.x, foe.y - a.y) > foe.size / 2 + 14) continue;
          a.hurtAt = state.clock + 0.9;
          hurtPebble(a, foe.damage * 0.5, a.x, a.y - 10);
          break;
        }
      }
      for (const shot of projectiles) {
        if (shot.owner !== "enemy" || shot.life <= 0 || Math.hypot(shot.x - a.x, shot.y - a.y + 8) > shot.r + 16) continue;
        shot.life = 0;
        hurtPebble(a, shot.damage, shot.x, shot.y);
      }
    }
    for (let i = golems.length - 1; i >= 0; i -= 1) {
      const a = golems[i];
      if (a.hp > 0) continue;
      burst(a.x, a.y, [C.s3, C.s2, C.s1, C.w4], 22, 220, { gravity: 350 });
      noiseBurst(0.2, { volume: 0.08, freq: 400 });
      toast("Pebble crumbled! Call it back when the special is ready.", 2.5);
      golems.splice(i, 1);
    }
  }

  function castSpikes(p) {
    if (p.shotCooldown > 0 || p.hp <= 0) return;
    const spot = landingSpot(p, 200);
    let dx = spot.x - p.x;
    let dy = spot.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > 260) {
      dx *= 260 / d;
      dy *= 260 / d;
    }
    const ux = dx / d;
    const uy = dy / d;
    const hits = new Set();
    const damage = stats.staffDamage * staffPower(p) * 2.6;
    for (let i = -1; i <= 1; i += 1) {
      const spot2 = inArena(p.x + dx + ux * i * 34, p.y + dy + uy * i * 34, 12);
      spikes.push({ x: spot2.x, y: spot2.y, t: -Math.abs(i) * 0.04, foe: false, tall: true, damage, hits, owner: p.index });
    }
    p.shotCooldown = stats.shotDelay * 1.8;
    noiseBurst(0.1, { volume: 0.05, freq: 350 });
    tone(150, 0.12, { type: "square", volume: 0.04, slide: -60 });
  }

  function updateSpikes(dt) {
    for (const s of spikes) {
      s.t += dt;
      if (!s.burst && s.t >= 0.1) {
        s.burst = true;
        burst(s.x, s.y, [C.s3, C.s1, C.s5], 5, 110, { gravity: 300 });
        if (!s.foe) {
          for (const enemy of livingFoes(currentRoom())) {
            if (s.hits.has(enemy) || enemy.alpha <= 0.3 || enemy.friendly || Math.hypot(enemy.x - s.x, enemy.y - s.y) > 28 + enemy.size * 0.3) continue;
            s.hits.add(enemy);
            damageEnemy(enemy, s.damage, "staff");
          }
        }
      }
    }
    for (let i = spikes.length - 1; i >= 0; i -= 1) {
      if (spikes[i].t > 0.95) spikes.splice(i, 1);
    }
  }

  function drawSpikes() {
    for (const s of spikes) {
      if (s.t < 0) continue;
      const sheet = spikeSheet(s.tall, s.foe);
      const w = sheet.width * PX;
      const h = sheet.height * PX;
      const k = Math.min(clamp(s.t / 0.18, 0, 1), clamp((0.95 - s.t) / 0.3, 0, 1));
      ctx.fillStyle = C.out;
      ctx.fillRect(snap(s.x - w / 2 - 2), snap(s.y - 2), w + 4, 4);
      if (k <= 0) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(snap(s.x - w / 2) - 2, snap(s.y - h) - 2, w + 4, h + 2);
      ctx.clip();
      blit2(ctx, sheet, s.x - w / 2, s.y - h * k);
      ctx.restore();
    }
  }

  /* ---------- drawing the king, Pebble and the portals ---------- */

  function drawGolemKing(boss) {
    const g = boss.g;
    let k = 1;
    let pose = g.pose;
    if (g.state === "sleep") {
      k = 0;
      pose = "pile";
    } else if (g.state === "wake") {
      k = clamp((g.t - 0.6) / 1.3, 0, 1);
      pose = k < 1 ? "pile" : "idle";
    }
    const frame = pose === "walk" ? Math.floor(g.walk * 6) % 2 : Math.floor(state.anim * 4) % 4;
    const jitter = (g.state === "wake" && g.t < 0.6) || g.state === "transform" ? (Math.floor(state.anim * 30) % 2 ? 2 : -2) : 0;
    const sheet = kingSheet(g.phase, pose, frame, Math.round(k * 8) / 8);
    const x = boss.x + jitter;
    const y = boss.y + 46 - (boss.hop || 0);
    ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
    const sw = k < 1 ? 90 : 110;
    ctx.fillRect(snap(boss.x - sw / 2), snap(boss.y + 40), sw, 10);
    const left = x - (SHEET_W * PX) / 2;
    const top = y - FEET_Y * PX;
    if (g.face < 0) {
      ctx.save();
      ctx.translate(snap(x) * 2, 0);
      ctx.scale(-1, 1);
      blit2(ctx, sheet, left, top, false, boss.flash > 0);
      ctx.restore();
    } else {
      blit2(ctx, sheet, left, top, false, boss.flash > 0);
    }
    if (g.phase === 2 && g.state !== "transform" && Math.random() < 0.25) burst(boss.x + rand(-30, 30), boss.y - rand(20, 90), [C.y1, C.y2], 1, 50, { lift: 70 });
    if (g.state === "attack" && g.move && MOVES[g.move.id].draw) MOVES[g.move.id].draw(boss, g.move);
    if (isStunned(boss)) drawStunStars(boss.x, boss.y - 130 - (boss.hop || 0), 1.4);
    if (g.state === "sleep" && Math.floor(state.anim * 2) % 2 === 0) outlinedText("zzz", boss.x + 50, boss.y - 40 + Math.sin(state.anim * 3) * 3, { size: 14, color: "#b3bccb", align: "center" });
  }

  function drawPebble(a) {
    const frame = state.anim - a.atk < 0.18 ? 2 : Math.floor(a.hop) % 2;
    const sheet = pebbleSheet(frame);
    const w = sheet.width * PX;
    const h = sheet.height * PX;
    ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
    ctx.fillRect(snap(a.x - 14), snap(a.y + 8), 28, 4);
    const left = a.x - w / 2;
    const top = a.y + 12 - h;
    if (a.rise > 0) {
      const k = clamp(1 - a.rise / 0.4, 0, 1);
      ctx.save();
      ctx.beginPath();
      ctx.rect(left - 4, top - 4, w + 8, h * k + 4);
      ctx.clip();
      blit2(ctx, sheet, left, top + h * (1 - k), a.face < 0);
      ctx.restore();
    } else if (a.face < 0) {
      ctx.save();
      ctx.translate(snap(a.x) * 2, 0);
      ctx.scale(-1, 1);
      blit2(ctx, sheet, left, top);
      ctx.restore();
    } else {
      blit2(ctx, sheet, left, top);
    }
    if (a.hp < a.maxHp) {
      ctx.fillStyle = C.out;
      ctx.fillRect(snap(a.x - 16), snap(top - 10), 32, 6);
      ctx.fillStyle = "#68b350";
      ctx.fillRect(snap(a.x - 15), snap(top - 9), Math.round(30 * Math.max(0, a.hp / a.maxHp)), 4);
    }
  }

  function drawStonePortal(x, y, label) {
    const sheet = portalSheet(Math.floor(state.anim * 8) % 6);
    blit2(ctx, sheet, x - sheet.width, y - sheet.height);
    if (Math.random() < 0.15) burst(x + rand(-10, 10), y + rand(-16, 16), [C.v2, C.v3, C.y3], 1, 40, { lift: 30 });
    outlinedText(label, clamp(x, 70, WIDTH - 70), y - 40, { size: 13, color: C.v3, align: "center", font: DISPLAY_FONT });
  }

  function portalOpen(room) {
    return room.index === MINE_ROOM && !state.treeMode && isRoomCleared(room);
  }

  // The way back seals while the king is up, so a knockback can't throw you out mid-fight.
  function returnOpen(room) {
    return Boolean(room.golemArena && room.boss && (room.boss.hp <= 0 || room.boss.g.state === "sleep"));
  }

  function enterArena() {
    const room = arenaRoom();
    if (!room) return;
    for (const p of activePlayers()) {
      if (p.hp <= 0) revivePlayer(p, 0.3);
      p.invulnerable = 1.5;
    }
    placePlayers(ARRIVE.x, ARRIVE.y);
    sfx.portal();
    golem.lockUntil = state.time + 1.5;
    enterRoom(ARENA_ROOM, { x: ARRIVE.x, y: ARRIVE.y });
  }

  function leaveArena() {
    const spot = { x: PORTAL.x - 60, y: PORTAL.y + 10 };
    placePlayers(spot.x, spot.y);
    sfx.portal();
    golem.lockUntil = state.time + 1.5;
    enterRoom(MINE_ROOM, spot);
  }

  /* ---------- hooks into the game ---------- */

  const base = {};
  for (const name of ["resetWorld", "populateRoom", "bossMaxHp", "resetBoss", "roomRow", "roomLabel", "roomDoors", "enterRoom", "changeRoom", "updatePlayer", "update", "updateBoss", "damageEnemy", "defeatEnemy", "stunEnemy", "drawRoom", "drawFoes", "drawBossBar", "drawProjectiles", "renderRoomBackground", "shootStaff", "useSpecial", "takeStaff", "saveGame", "loadGame", "updateInterface"]) {
    base[name] = window[name];
  }

  resetWorld = function resetWorldWithGolem() {
    base.resetWorld();
    rooms.push(makeArenaRoom());
    golem = freshGolem();
    golems.length = 0;
    spikes.length = 0;
  };

  populateRoom = function populateRoomWithGolem(room, entry, tier) {
    if (!room.golemArena) return base.populateRoom(room, entry, tier);
    room.tier = tier;
    room.populated = true;
    room.cleared = false;
    room.enemies = [];
    room.crates = [];
    room.boss = makeGolemKing(room);
  };

  bossMaxHp = function bossMaxHpWithGolem(room) {
    if (room.golemArena) return golemPhaseHp(room, room.boss ? room.boss.g.phase : 1);
    return base.bossMaxHp(room);
  };

  resetBoss = function resetBossWithGolem(room) {
    if (!room.golemArena) return base.resetBoss(room);
    if (room.boss && room.boss.hp > 0) room.boss = makeGolemKing(room);
    room.enemies = [];
    clearBossFx();
  };

  roomRow = function roomRowWithGolem(room) {
    return room.golemArena ? 1 : base.roomRow(room);
  };

  roomLabel = function roomLabelWithGolem(room, short = false) {
    if (!room.golemArena) return base.roomLabel(room, short);
    return short ? "World 2 · Secret" : "World 2 · Golem's Hollow";
  };

  roomDoors = function roomDoorsWithGolem(room) {
    if (room.golemArena) return { up: false, down: false, left: false, right: false };
    return base.roomDoors(room);
  };

  enterRoom = function enterRoomWithGolem(index, entry, silent = false) {
    golems.length = 0;
    spikes.length = 0;
    const room = rooms[index];
    if (!room || !room.golemArena) return base.enterRoom(index, entry, silent);
    const result = base.enterRoom(index, entry, true);
    banners.length = 0;
    state.fade = 1;
    const boss = room.boss;
    if (boss.hp > 0 && boss.g.state === "sleep") {
      boss.name = PILE_NAME;
      boss.alpha = 0.3;
      banner("Golem's Hollow", "Something sleeps under those stones...", "#b3bccb", 3);
      toast("Shh. A secret arena. Those stones look odd...", 3);
    } else if (boss.hp > 0) {
      // Back from the mine mid-fight: the king finishes nothing it was doing.
      Object.assign(boss.g, { state: "move", move: null, pose: "idle", wait: 1.5 });
      boss.hop = 0;
    }
    return result;
  };

  changeRoom = function changeRoomWithGolem(dx, dy, mover) {
    if (currentRoom().golemArena) {
      leaveArena();
      return true;
    }
    return base.changeRoom(dx, dy, mover);
  };

  updatePlayer = function updatePlayerWithGolem(p, dt) {
    const result = base.updatePlayer(p, dt);
    if (result || p.hp <= 0 || state.mode !== "playing" || state.time < golem.lockUntil) return result;
    const room = currentRoom();
    if (portalOpen(room) && Math.hypot(p.x - PORTAL.x, p.y - PORTAL.y) < 28) {
      enterArena();
      return true;
    }
    if (returnOpen(room) && Math.hypot(p.x - RETURN.x, p.y - RETURN.y) < 28) {
      leaveArena();
      return true;
    }
    return result;
  };

  update = function updateWithGolem(dt) {
    base.update(dt);
    if (state.mode !== "playing") return;
    const worldDt = state.slowmo > 0 ? dt * 0.35 : dt;
    updateGolems(worldDt);
    updateSpikes(worldDt);
    const room = currentRoom();
    if (portalOpen(room) && !golem.tips.portal) {
      golem.tips.portal = true;
      sfx.portal();
      banner("A secret portal!", "It opened in the minecart tunnel on the right...", "#8f6cff", 3.5);
      toast("A swirling portal hums in the tunnel. Walk into it if you dare!", 4);
    }
  };

  updateBoss = function updateBossWithGolem(boss, dt, ux, uy, dist, slow, room) {
    if (!boss.golemKing) return base.updateBoss(boss, dt, ux, uy, dist, slow, room);
    updateGolemKing(boss, dt, dist, room);
  };

  damageEnemy = function damageEnemyWithGolem(enemy, amount, source = "staff") {
    if (enemy.golemKing && enemy.hp > 0) {
      const s = enemy.g.state;
      if (s === "sleep") {
        wakeKing(enemy);
        return;
      }
      if (s === "wake" || s === "transform") return;
    }
    return base.damageEnemy(enemy, amount, source);
  };

  defeatEnemy = function defeatEnemyWithGolem(enemy) {
    if (!enemy.golemKing) return base.defeatEnemy(enemy);
    const room = currentRoom();
    if (enemy.g.phase === 1) {
      startCrackedPhase(enemy, room);
      return;
    }
    const result = base.defeatEnemy(enemy);
    kingReward(enemy, room);
    return result;
  };

  stunEnemy = function stunEnemyWithGolem(enemy, seconds) {
    if (enemy.golemKing) seconds = Math.min(seconds, 0.8);
    return base.stunEnemy(enemy, seconds);
  };

  drawRoom = function drawRoomWithGolem(room) {
    base.drawRoom(room);
    if (state.mode === "title") return;
    if (portalOpen(room) && !golem.beaten) drawStonePortal(PORTAL.x, PORTAL.y, "Secret portal");
    if (portalOpen(room) && golem.beaten) drawStonePortal(PORTAL.x, PORTAL.y, "Golem's Hollow");
    if (returnOpen(room)) drawStonePortal(RETURN.x, RETURN.y, "Back to the mine");
    else if (room.golemArena && Math.floor(state.anim * 2) % 2 === 0) outlinedText("The way back is sealed until the king falls!", WIDTH / 2, RETURN.y - 40, { size: 14, align: "center", color: C.s4 });
  };

  drawFoes = function drawFoesWithGolem(room) {
    const boss = room && room.boss && room.boss.golemKing ? room.boss : null;
    if (boss) room.boss = null;
    try {
      base.drawFoes(room);
    } finally {
      if (boss) room.boss = boss;
    }
    if (boss && boss.hp > 0) drawGolemKing(boss);
    for (const a of golems) drawPebble(a);
  };

  drawBossBar = function drawBossBarWithGolem(boss) {
    if (!boss.golemKing) return base.drawBossBar(boss);
    // No bar until the king has stood up and roared its name.
    if (boss.name === PILE_NAME) return;
    const w = 420;
    const x = WIDTH / 2 - w / 2;
    const y = 22;
    const label = `${boss.g.phase === 2 ? "PHASE 2" : "SECRET BOSS"}: ${boss.name}`;
    outlinedText(label, WIDTH / 2, y + 2, { size: 17, align: "center", font: DISPLAY_FONT, color: boss.g.phase === 2 ? "#ff8b7d" : "#b3bccb" });
    ctx.fillStyle = C.s4;
    ctx.fillRect(x - 6, y + 5, w + 12, 24);
    ctx.fillStyle = C.out;
    ctx.fillRect(x - 3, y + 8, w + 6, 18);
    ctx.fillStyle = "#3a1712";
    ctx.fillRect(x, y + 11, w, 12);
    ctx.fillStyle = boss.g.phase === 2 ? "#ff5a3d" : "#d94d3f";
    ctx.fillRect(x, y + 11, w * Math.max(0, boss.hp / boss.maxHp), 12);
    ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
    ctx.fillRect(x, y + 11, w * Math.max(0, boss.hp / boss.maxHp), 3);
  };

  drawProjectiles = function drawProjectilesWithGolem() {
    base.drawProjectiles();
    if (spikes.length) drawSpikes();
  };

  renderRoomBackground = function renderRoomBackgroundWithGolem(room) {
    base.renderRoomBackground(room);
    if (room.golemArena) decorateArena(room);
  };

  function holdsGrimoire(p) {
    return Boolean(p.staff && p.staff.id === "grimoire");
  }

  // Mages zap stone spikes with the grimoire. Other classes keep their own weapon
  // (the staff only boosts it) and get the golem summon on E like everyone.
  shootStaff = function shootStaffWithGolem(p) {
    if (holdsGrimoire(p) && (!p.cls || p.cls === "mage")) {
      castSpikes(p);
      return;
    }
    return base.shootStaff(p);
  };

  useSpecial = function useSpecialWithGolem(p) {
    if (typeof p === "number") p = players[p];
    if (!holdsGrimoire(p)) return base.useSpecial(p);
    if (state.mode !== "playing" || p.hp <= 0 || p.stun > 0 || p.drinking > 0) return;
    if (p.index === 1 && !state.twoPlayer) return;
    if (p.specialCd > 0) {
      floatText(p.x, p.y - 44, "Special not ready", "#c5a988", 13);
      sfx.nope();
      return;
    }
    summonPebble(p);
    p.specialCd = specialCooldown(p);
  };

  takeStaff = function takeStaffWithGolem(p, drop) {
    base.takeStaff(p, drop);
    if (holdsGrimoire(p) && !golem.tips.grimoire) {
      golem.tips.grimoire = true;
      banners.length = 0;
      const zaps = !p.cls || p.cls === "mage" ? "Your zaps are now stone spikes. " : "";
      banner("Stone Grimoire!", `${zaps}${specialKey(p)} calls Pebble, a 150 HP golem friend.`, "#f5c542", 4.2);
    }
  };

  saveGame = function saveGameWithGolem() {
    const inArena = state.roomIndex === ARENA_ROOM;
    if (inArena) state.roomIndex = MINE_ROOM;
    try {
      base.saveGame();
    } finally {
      if (inArena) state.roomIndex = ARENA_ROOM;
    }
    if (state.won || state.treeMode) return;
    const data = readStorage(SAVE_KEY);
    if (!data) return;
    data.stoneGolem = { beaten: golem.beaten, tips: golem.tips };
    writeStorage(SAVE_KEY, data);
  };

  loadGame = function loadGameWithGolem() {
    const data = readStorage(SAVE_KEY);
    const ok = base.loadGame();
    if (!ok) return ok;
    const saved = data && data.stoneGolem;
    if (saved) {
      golem.beaten = Boolean(saved.beaten);
      golem.tips = saved.tips && typeof saved.tips === "object" ? saved.tips : {};
    }
    const room = arenaRoom();
    if (golem.beaten && room) {
      room.visited = true;
      populateRoom(room, { x: WIDTH / 2, y: HEIGHT / 2 }, Math.min(state.bossesDefeated, 29));
      room.boss.hp = 0;
      room.cleared = true;
    }
    // The load itself saved a fresh record; write the restored one back.
    saveGame();
    return ok;
  };

  updateInterface = function updateInterfaceWithGolem(dt) {
    base.updateInterface(dt);
    if (state.mode === "title") return;
    const room = currentRoom();
    if (room.golemArena) {
      const boss = room.boss;
      ui.trackGoal.textContent = boss.hp <= 0 ? "Take your prize, then step back into the portal" : boss.g.state === "sleep" ? "Something sleeps under those stones..." : `Beat ${boss.name}!`;
      if (boss.hp > 0 && boss.g.state === "sleep") ui.trackBoss.textContent = "Sleeping?";
    } else if (portalOpen(room) && !golem.beaten) {
      ui.trackGoal.textContent = "A secret portal hums in the tunnel on the right";
    }
  };

  if (!arenaRoom()) rooms.push(makeArenaRoom());

  if (window.blockDungeon) {
    window.blockDungeon.enterRoom = enterRoom;
    window.blockDungeon.defeatEnemy = defeatEnemy;
    if (window.blockDungeon.saveGame) window.blockDungeon.saveGame = saveGame;
    if (window.blockDungeon.loadGame) window.blockDungeon.loadGame = loadGame;
    window.blockDungeon.useSpecial = useSpecial;
  }

  window.blockDungeonStoneGolem = {
    ARENA_ROOM,
    MINE_ROOM,
    PORTAL,
    RETURN,
    MOVES,
    golems,
    spikes,
    get golem() { return golem; },
    boss() { return arenaRoom() && arenaRoom().boss; },
    totalHp() { return golemTotalHp(arenaRoom()); },
    teleport() { enterArena(); },
    leave() { leaveArena(); },
    wake() { const boss = this.boss(); if (boss) wakeKing(boss); },
    // Jump straight to a fight phase: 1 = standing king, 2 = cracked open.
    setPhase(phase) {
      const boss = this.boss();
      const room = arenaRoom();
      if (!boss || !room) return;
      if (boss.g.state === "sleep" || boss.g.state === "wake") {
        boss.g.state = "move";
        boss.g.pose = "idle";
        boss.g.roared = true;
        boss.name = BOSS_NAME;
        boss.size = 100;
        boss.speed = kingSpeed(boss);
        boss.g.wait = 1;
      }
      if (phase === 2 && boss.g.phase === 1) {
        startCrackedPhase(boss, room);
        boss.g.state = "move";
        boss.g.roared2 = true;
        boss.g.pose = "idle";
      }
    },
    startMove(id) { const boss = this.boss(); if (boss) startMove(boss, id); },
    grant(index = 0) { giveStaff(players[index], "grimoire", 1); },
    summon(index = 0) { summonPebble(players[index]); }
  };
})();
