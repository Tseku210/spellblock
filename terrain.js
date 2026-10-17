/* ---------- room terrain ----------
   Load this file after script.js and sprites.js. It gives every dungeon room
   its own look and ground: ponds, lava rivers with stone bridges, frozen
   lakes, quicksand, chasms with rope bridges, rocks, trees, statues,
   pyramids and more, drawn on the same 2x pixel grid as the sprites.

   How it works:
   - Each room gets a layout once: a grid of 4x4 pixel cells saying what the
     ground is, plus a list of props (trees, rocks...). Solid props become
     invisible stone blocks in room.crates, so walking, bullets and the cannon
     boss's "hide behind a pillar" all work as before.
   - The background is painted once when you enter the room (same as before),
     so the terrain costs nothing per frame except a few grid lookups.
   - Gameplay: rocks and trees block, water and snow slow you, ice slides,
     quicksand pulls, lava burns and chasms drop you (a little damage, then
     you're back on safe ground). Dashing jumps over lava and chasms.
     Walking monsters stay out of lava and chasms; flyers and bosses don't care.
   - Arenas, the dragon's lair and the Spirit Tree keep their old look. */

(() => {
  const W = WIDTH, H = HEIGHT, T = TILE, C = 4;

  const P = 2;
  const snap = (v) => Math.round(v / 2) * 2;

  // Scale2x: doubles a sprite's detail while keeping the same 2px pixel grid (smooths diagonals).
  const bigCache = new Map();
  function scale2x(rows) {
    if (bigCache.has(rows)) return bigCache.get(rows);
    const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
    const at = (x, y) => (y < 0 || y >= h || x < 0 || x >= w ? " " : rows[y][x] || " ");
    const out = [];
    for (let y = 0; y < h; y += 1) {
      let r0 = "", r1 = "";
      for (let x = 0; x < w; x += 1) {
        const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
        r0 += (C === A && C !== D && A !== B ? A : P) + (A === B && A !== C && B !== D ? B : P);
        r1 += (D === C && D !== B && C !== A ? C : P) + (B === D && B !== A && D !== C ? D : P);
      }
      out.push(r0, r1);
    }
    bigCache.set(rows, out);
    return out;
  }
  // Draw rows of letters with (x, y) = bottom-centre of the sprite. big = Scale2x first.
  function stamp(g, rows, pal, x, y, flip = false, big = false) {
    if (house("stamp", g, STAMP_NAMES.get(rows), x, y, flip, big)) return;
    if (big) rows = scale2x(rows);
    const w = Math.max(...rows.map((r) => r.length));
    const x0 = snap(x - (w * P) / 2), y0 = snap(y - rows.length * P);
    rows.forEach((row, ry) => {
      for (let i = 0; i < row.length; i += 1) {
        const c = pal[row[i]];
        if (!c) continue;
        g.fillStyle = c;
        g.fillRect(x0 + (flip ? w - 1 - i : i) * P, y0 + ry * P, P, P);
      }
    });
  }
  function shadow(g, x, y, rx, ry, a = 0.28) {
    g.fillStyle = `rgba(0,0,0,${a})`;
    for (let yy = -ry; yy <= ry; yy += 2) for (let xx = -rx; xx <= rx; xx += 2) if ((xx / rx) ** 2 + (yy / ry) ** 2 <= 1) g.fillRect(snap(x + xx), snap(y + yy), 2, 2);
  }

  const S = {};
  S.oak = [
    "        kkkkkkkk        ",
    "     kkkGGGGGGGGkkk     ",
    "    kGGGLLLLGGGGGGGk    ",
    "   kGGLLLLLLGGGGgGGGk   ",
    "  kGGLLLHLLLGGrGGgGGGk  ",
    "  kGGLLLLLLGGGGGGGGGGk  ",
    " kGGGGLLLGGGGgGGLLGGGGk ",
    " kGgGGrGGGGGGGGLLLLGGGk ",
    " kGGgGGGGLLGGGGGLLGGgGk ",
    " kGGGGGGLLLLGGGGGGrggGk ",
    " kgGGGGGGLLGGGGgGGGGGgk ",
    "  kgGGGGGGGGGrGGGGGGgk  ",
    "  kggGGgGGGGGGGGGgGggk  ",
    "   kgggGGGGGGgGGGgggk   ",
    "    kkggggggggggggkk    ",
    "      kkkggggggkkk      ",
    "         kbBBbk         ",
    "         kbBBbk         ",
    "         kbBBbk         ",
    "        kbbBBbbk        ",
    "       kbbkkkkbbk       "
  ];
  S.oakPal = { k: "#173a1c", G: "#3f8a3a", L: "#6cc04f", H: "#a8e870", g: "#2a6a2e", b: "#5a3a22", B: "#8a5a32", r: "#e8443a" };
  S.willow = [
    "            kkkkkkkkk             ",
    "         kkkLLLLLLGGGkkk          ",
    "       kkLLLHLLLGGGGGGGGkk        ",
    "      kLLLLLGGGGGGGGGGGGGGk       ",
    "     kLLGGGGGgGGGGGGGgGGGGGk      ",
    "    kLGGGGgGGGGGgGGGGGGgGGGGk     ",
    "   kGGGGgGGGgGGGGGGgGGGGgGGGGk    ",
    "   kGGgGGGgGGGgGGGgGGGgGGGgGGk    ",
    "  kGGgGGgGGgGGGgGGgGGGgGGgGgGGk   ",
    "  kGgGGgGGgGGgGGGgGGgGGgGGgGgGk   ",
    "  kGgGgGGgGGgGbBBbGGgGgGGgGgGgk   ",
    "  kGgGgGgGgGgGbBBbgGgGgGgGgGgGk   ",
    "  GgGgGgG gGg bBBb gGg GgGgGgG    ",
    "  Gg GgG  gG  bBBb  Gg  GgG gG    ",
    "  G  Gg   gG  bBBb  Gg  Gg  G     ",
    "  G  G    gG  bBBb  G    G  g     ",
    "  g  G    g  bbBBbb g    g  g     ",
    "     g    g kbbBBbbk     g        ",
    "     g      kbbkkbbk              "
  ];
  S.willowPal = { k: "#1e4a2a", G: "#5aa848", L: "#8ad064", H: "#b8f08a", g: "#3a7a3a", b: "#5a3a22", B: "#8a5a32" };
  S.stump = [
    " kkkkkk ",
    "kTtTTtTk",
    "kTTttTTk",
    "kbTTTTbk",
    "kbbbbbbk",
    "kbBbbBbk",
    "kkbbbbkk"
  ];
  S.stumpPal = { k: "#2a1a0e", T: "#d8a868", t: "#a87a44", b: "#6a4428", B: "#8a5a32" };
  S.log = [
    " kkkkkkkkkkkkkk ",
    "kbbBbbbbBbbbbkTk",
    "kbBbbbBbbbbBbkttk",
    "kbbbbbbbbbBbbkTk",
    " kkkkkkkkkkkkkk "
  ];
  S.mushroom = [
    "  kkkk  ",
    " kRRWRk ",
    "kRWRRRWk",
    "kRRRRRRk",
    " kkWWkk ",
    "   WW   ",
    "  kWWk  "
  ];
  S.mushroomPal = { k: "#3a1010", R: "#e8443a", W: "#f8f0e0" };
  S.frog = [
    " kk  kk ",
    "kWkkkkWk",
    "kGGGGGGk",
    "kGgGGgGk",
    " kGGGGk ",
    "kG kk Gk"
  ];
  S.frogPal = { k: "#123a12", W: "#ffffff", G: "#5ac84a", g: "#3a8a2a" };
  S.duck = [
    "   kk   ",
    "  kWWk  ",
    "  kWkOO ",
    "kkkWWk  ",
    "kWWWWWk ",
    " kWWWWk ",
    "  kkkk  "
  ];
  S.duckPal = { k: "#3a3a3a", W: "#fff6e0", O: "#ff9a2a" };
  S.butterfly = ["p p", " k ", "p p"];
  // Mine
  S.oreCart = [
    "          kk   kkk        ",
    "     kk  kYYk kCCCk  kk   ",
    "    kYYkkYyYYkCcCCkkkGGk  ",
    "   kYyYYkYYYkGGkCCkYYkGgk ",
    "  kYYYYYkkkGGgGGkkYyYYkGk ",
    "  kYYyYkCCkGGGGkYYYYYYYkk ",
    " kkkkkkkkkkkkkkkkkkkkkkkkk",
    " kSHHHHHHHHHHHHHHHHHHHHHSk",
    " kSsSSSSSSSSSSSSSSSSSSSsSk",
    " kMbMMMbMMMMbMMMMbMMMbMMMk",
    " kMbMMMbMMMMbMMMMbMMMbMMMk",
    " kSsSSSSSSSSSSSSSSSSSSSsSk",
    " kMbMMMbMMMMbMMMMbMMMbMMMk",
    " kMbMMMbMMMMbMMMMbMMMbMMMk",
    " kSSSSSSSSSSSSSSSSSSSSSSSk",
    "  kkkkkkkkkkkkkkkkkkkkkkk ",
    "   kRRRk           kRRRk  ",
    "  kRrrRRk         kRrrRRk ",
    "  kRRrRRk         kRRrRRk ",
    "   kRRRk           kRRRk  ",
    "    kkk             kkk   "
  ];
  S.oreCartPal = { k: "#1a1612", Y: "#f6c85f", y: "#fff1a8", C: "#5fd8ec", c: "#c8fbff", G: "#8a8a92", g: "#b8b8c0", S: "#5a5e66", s: "#c8ccd2", H: "#9aa0a8", M: "#7a5030", b: "#5a3a22", R: "#2e2e34", r: "#8a8a94" };
  S.barrel = [
    " kkkkkk ",
    "kbBBBBbk",
    "kssssssk",
    "kbBBBBbk",
    "kbBBBBbk",
    "kssssssk",
    "kbBBBBbk",
    " kkkkkk "
  ];
  S.barrelPal = { k: "#2a1a0e", b: "#6a4428", B: "#9a6a3a", s: "#7a7a84" };
  S.lantern = [
    "  kk  ",
    " kYYk ",
    "kYyyYk",
    "kYyyYk",
    " kkkk ",
    "  bb  ",
    "  bb  ",
    "  bb  ",
    "  bb  ",
    " bbbb "
  ];
  S.lanternPal = { k: "#2a2a2a", Y: "#f6c85f", y: "#fff1a8", b: "#6a4428" };
  S.pickaxe = [
    " kkkk   ",
    "kSSSSk  ",
    "  kbk kS",
    "   kbk  ",
    "    kbk ",
    "     kbk"
  ];
  // Lava
  S.statue = [
    "        kkkk        ",
    "       kLLLLk       ",
    "      kLLHLLLk      ",
    "      kLkrrkLk      ",
    "      kLLLLLLk      ",
    "     kkkMMMMkkk     ",
    "    kLLLLLLLLLLk    ",
    "   kLLLLkSSkLLLLk   ",
    "  kLLkLLLSSLLLkLLk  ",
    "  kLk kLkSSkLLk kLk ",
    "  kLk kLLkkLLLk kLk ",
    "  kLLkkLLLLLLMkkLLk ",
    "   kk kLLLLLLMk kk  ",
    "      kLLLLLLMk     ",
    "      kLLLkLMMk     ",
    "      kLLLkLMMk     ",
    "      kLLLkLMMk     ",
    "     kkLLLkLMMkk    ",
    "    kkkkkkkkkkkkk   ",
    "   kLLLLLLLLLLLLLk  ",
    "   kLHHHHHHHHHHHMk  ",
    "   kLMMkMMMMMMMMDk  ",
    "   kLMMMkMMMMMMMDk  ",
    "   kDDDDDDDDDDDDDk  ",
    "    kkkkkkkkkkkkk   "
  ];
  S.statuePal = { k: "#1a1414", L: "#8a8290", H: "#b8b0bc", M: "#6a6270", D: "#4a4250", S: "#5a5260", r: "#ff5a1e" };
  S.dragonStatue = [
    "  kk              ",
    " kLLk    kk       ",
    " kLLLk  kLLk      ",
    "  kLLLkkLLLLkkk   ",
    "   kLLLLLLrLLLLk  ",
    "    kLLLLLLLLLMMk ",
    "    kLLLLLkkkkkMk ",
    "   kLLLLLk WkWkk  ",
    "   kLLLLMk        ",
    "  kLLLLLMMk       ",
    "  kLLLLLLMMk      ",
    " kkkkkkkkkkkkk    ",
    " kLHHHHHHHHHMk    ",
    " kLMMMMMMkMMDk    ",
    " kDDDDDDDDDDDk    ",
    "  kkkkkkkkkkk     "
  ];
  S.skull = [
    " kkkk ",
    "kWWWWk",
    "kWkkWk",
    "kWWWWk",
    " kWkWk",
    "  kkk "
  ];
  S.skullPal = { k: "#1a1414", W: "#e8e2cf" };
  S.brazier = [
    "  Y  y  ",
    " YyY YY ",
    " YyyyYY ",
    "kOYyyYOk",
    "kkkkkkkk",
    " kMMMMk ",
    "  kMMk  ",
    "  kMMk  ",
    " kMMMMk "
  ];
  S.brazierPal = { k: "#1a1414", Y: "#ff7a2e", y: "#ffd166", O: "#c8401c", M: "#5a5260" };
  S.obsidian = [
    "   k     ",
    "  kOk  k ",
    "  kOk kOk",
    " kOPOkkOk",
    " kOPOkOPk",
    "kOOPOkOOk",
    "kkkkkkkkk"
  ];
  S.obsidianPal = { k: "#0a0610", O: "#2a1a3a", P: "#6a4a8a" };
  // Desert
  S.deadTree = [
    "  k        k   k  ",
    "  bk      kb  kb  ",
    "   bk    kb  kb   ",
    " k  bk  kb  kb    ",
    " bk  bkkb  kb   k ",
    "  bk  bb  kb   kb ",
    "   bbbbb kb   kb  ",
    "      bbbbbbbbb   ",
    "      bbbbbb      ",
    "       bBbb       ",
    "       bBbb       ",
    "       bBbb       ",
    "       bBbb       ",
    "      bbBbbb      ",
    "     bbkbbkbb     "
  ];
  S.deadTreePal = { k: "#4a3a2a", b: "#7a6048", B: "#a08468" };
  S.cowSkull = [
    "k        k",
    "Wk      kW",
    " WWkkkkWW ",
    "  kWWWWk  ",
    "  WkWWkW  ",
    "   WWWW   ",
    "   kWWk   ",
    "    kk    "
  ];
  S.cowSkullPal = { k: "#4a3a2a", W: "#f2ead6" };
  S.urn = [
    "  kkkk  ",
    "  kOOk  ",
    " kOOOOk ",
    "kOoOPOOk",
    "kOoPPPOk",
    "kOOOPOOk",
    " kOOOOk ",
    "  kkkk  "
  ];
  S.urnPal = { k: "#3a2010", O: "#c06a3a", o: "#e8945a", P: "#3a8aa0" };
  S.cactus = [
    "    kpk    ",
    "   kGGGk   ",
    "   kGLGk   ",
    "k  kGLGk   ",
    "Gk kGLGk kk",
    "GLkkGLGk kG",
    "kGGGGLGk kG",
    " kkkGLGkkGk",
    "   kGLGGGk ",
    "   kGLGkk  ",
    "   kGLGk   ",
    "  kkGGGkk  "
  ];
  S.cactusPal = { k: "#1a4a22", G: "#3f9a4a", L: "#6fd06a", p: "#ff9ff3" };
  S.palm = [
    "    kkk   kkk     ",
    "  kkGGGk kGGGkk   ",
    " kGGkkGGkGGkkGGk  ",
    "kGk   kGGGk   kGk ",
    "Gk  kkGGbGGkk  kG ",
    "k  kGGk bb kGGk  k",
    "   kGk  bb   kGk  ",
    "   Gk   bb    kG  ",
    "        bB        ",
    "        bB        ",
    "       bbB        ",
    "       bB         ",
    "       bB         ",
    "      bbBb        "
  ];
  S.palmPal = { k: "#1a4a22", G: "#4fae4f", b: "#8a6a3a", B: "#b08a50" };
  // Ice
  S.snowman = [
    "    kkkk    ",
    "   kKKKKk   ",
    "  kkkkkkkk  ",
    "   kWkWWk   ",
    "   kWWOOO   ",
    "   kWWWWk   ",
    "  kRRRRRRk  ",
    " kWWWWWWWWk ",
    "bkWWkWWWWWkb",
    " kWWWWWWWWk ",
    " kWWkWWWWWk ",
    " kWWWWWWWBk ",
    "  kWWWWWBk  ",
    "   kkkkkk   "
  ];
  S.snowmanPal = { k: "#2a3a4a", K: "#2a2a34", W: "#ffffff", B: "#cfe2e8", O: "#ff8a2a", R: "#e8443a", b: "#6a4428" };
  S.fish = [
    "  kkkk  k",
    " kOOOOkkO",
    "kOkOOOOOk",
    " kOOOOkkO",
    "  kkkk  k"
  ];
  S.fishPal = { k: "#5a8aa0", O: "#7ab4cc" };
  S.iceRock = [
    "   kkkk   ",
    "  kWWWWk  ",
    " kWWWWWWk ",
    "kLWWWWWMMk",
    "kLLLMMMMDk",
    "kMMMMMMDDk",
    " kDDDDDDk ",
    "  kkkkkk  "
  ];
  S.iceRockPal = { k: "#3a4a5a", W: "#ffffff", L: "#a8b4c0", M: "#7a8a9a", D: "#5a6a7a" };

  // House style (props.js) can take over a prop painter or a stamped sprite by name.
  const STAMP_NAMES = new Map(Object.entries(S).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [v, k]));
  function house(name, ...args) {
    const f = window.houseProps && window.houseProps[name];
    return Boolean(f && f(...args));
  }

  // A boulder with an outline, a lit top, a dark side, cracks and maybe moss.
  function boulder(g, rng, cx, cy, r, pal, moss) {
    const pts = [];
    const n = 9;
    for (let i = 0; i < n; i += 1) pts.push(r * (0.78 + rng() * 0.3));
    const radius = (a) => {
      const f = ((a / (Math.PI * 2)) * n + n) % n;
      const i = Math.floor(f), t = f - i;
      return pts[i] * (1 - t) + pts[(i + 1) % n] * t;
    };
    const inside = (xx, yy, grow) => {
      const a = Math.atan2(yy * 1.35, xx);
      return Math.hypot(xx, yy * 1.35) <= radius(a) + grow;
    };
    shadow(g, cx + 6, cy + r * 0.62, r * 1.05, r * 0.28, 0.3);
    for (let yy = -r * 1.1; yy <= r; yy += 2) {
      for (let xx = -r * 1.3; xx <= r * 1.3; xx += 2) {
        if (!inside(xx, yy, 2)) continue;
        let col = pal.k;
        if (inside(xx, yy, 0)) {
          const lit = -xx / r * 0.8 - yy / r * 1.1;
          const top = yy < -r * 0.15 && Math.abs(xx) < r * 0.55 && yy > -r * 0.62;
          col = top ? pal.T : lit > 0.75 ? pal.H : lit > 0.0 ? pal.L : lit > -0.7 ? pal.M : pal.D;
        }
        g.fillStyle = col;
        g.fillRect(snap(cx + xx), snap(cy + yy), 2, 2);
      }
    }
    // Cracks.
    g.fillStyle = pal.k;
    for (let c = 0; c < 2; c += 1) {
      let x = cx + (rng() - 0.3) * r * 0.8, y = cy - r * 0.2 + rng() * r * 0.4;
      for (let s = 0; s < r * 0.25; s += 1) { g.fillRect(snap(x), snap(y), 2, 2); x += 2; y += rng() < 0.5 ? 2 : 0; if (rng() < 0.15) { g.fillRect(snap(x), snap(y - 2), 2, 2); } }
    }
    if (moss) {
      for (let i = 0; i < r * 1.6; i += 1) {
        const xx = (rng() - 0.5) * r * 1.2, yy = -r * 0.55 + rng() * r * 0.35;
        if (!inside(xx, yy, -2)) continue;
        g.fillStyle = rng() < 0.5 ? moss[0] : moss[1];
        g.fillRect(snap(cx + xx), snap(cy + yy), 4, 2);
      }
    }
  }

  // A faceted crystal spike: lit face, middle face with a shine line, dark face, outline.
  function crystalSpike(g, bx, by, w, h, tilt, pal) {
    const rows = [];
    for (let pass = 0; pass < 2; pass += 1) {
      const grow = pass === 0 ? 2 : 0;
      for (let py = 0; py <= h + grow; py += 2) {
        const v = py / h;
        const cx = bx + tilt * Math.min(v, 1);
        const hw = (w / 2) * (v < 0.72 ? 1 : Math.max(0, (1 - v) / 0.28)) + grow;
        for (let px = -hw; px <= hw; px += 2) {
          let col = pal.k;
          if (pass === 1) {
            const u = hw > 0 ? px / hw : 0;
            col = u < -0.4 ? pal.L : u < 0.3 ? pal.M : pal.D;
            if (Math.abs(u + 0.1) < 0.15 && v > 0.15 && v < 0.85) col = pal.H;
            if (v > 0.7 && u < 0.1) col = pal.L;
          }
          g.fillStyle = col;
          g.fillRect(snap(cx + px), snap(by - py), 2, 2);
        }
      }
    }
  }
  function crystalCluster(g, rng, x, y, s, pal) {
    // Glow on the floor.
    g.fillStyle = pal.glow;
    for (let yy = -16 * s; yy <= 16 * s; yy += 2) for (let xx = -34 * s; xx <= 34 * s; xx += 2) if ((xx / (34 * s)) ** 2 + (yy / (16 * s)) ** 2 <= 1 && ((xx + yy) / 2) % 2 === 0) g.fillRect(snap(x + xx), snap(y + yy), 2, 2);
    shadow(g, x + 4, y + 2, 22 * s, 6 * s, 0.35);
    const spikes = [[-14, 10, 22, -6], [14, 10, 26, 7], [-6, 12, 36, -3], [7, 12, 30, 3], [0, 14, 46, 0]];
    for (const [ox, w, h, t] of spikes) crystalSpike(g, snap(x + ox * s), snap(y), snap(w * s), snap(h * s), snap(t * s), pal);
    // Rock base.
    g.fillStyle = "#1a1430"; g.fillRect(snap(x - 20 * s), snap(y - 2), snap(40 * s), 6);
    g.fillStyle = "#3a3060"; g.fillRect(snap(x - 18 * s), snap(y - 2), snap(36 * s), 2);
    // Sparkle.
    g.fillStyle = "#ffffff";
    const sx = snap(x - 4 * s), sy = snap(y - 40 * s);
    g.fillRect(sx, sy - 4, 2, 10); g.fillRect(sx - 4, sy, 10, 2);
  }
  const CRY = {
    purple: { k: "#1c1238", L: "#c8b0ff", M: "#8f6cff", D: "#5a3ac0", H: "#ffffff", glow: "rgba(160,120,255,0.18)" },
    cyan: { k: "#0e2a38", L: "#c8fbff", M: "#5fd8ec", D: "#2a8aa8", H: "#ffffff", glow: "rgba(120,240,255,0.16)" },
    pink: { k: "#38102a", L: "#ffd0f0", M: "#ff7ac8", D: "#b83a8a", H: "#ffffff", glow: "rgba(255,140,220,0.16)" }
  };

  // A 3/4-view stepped pyramid with a door and a gold cap.
  function pyramid(g, cx, by, half, h) {
    g = g.raw || g; // keep its fine step shading off the house palette
    shadow(g, cx + half * 0.4, by + 4, half * 1.15, 12, 0.3);
    for (let py = 0; py < h; py += 2) {
      const w = half * (1 - py / h);
      const step = Math.floor(py / 8);
      const ws = snap(half * (1 - (step * 8) / h));
      for (let px = -ws; px <= ws; px += 2) {
        const right = px > 0;
        const brickRow = Math.floor(py / 4);
        const joint = (Math.floor((px + (brickRow % 2) * 6 + 400) / 12) * 12 - (brickRow % 2) * 6 - 400) === px;
        let col = right ? "#a8844a" : "#e6c27a";
        if (py % 4 === 0) col = right ? "#8a6a38" : "#c8a060";
        else if (joint) col = right ? "#957440" : "#d6b06a";
        if (Math.abs(px) >= ws - 1) col = "#6a5028";
        g.fillStyle = col;
        g.fillRect(snap(cx + px), snap(by - py), 2, 2);
      }
      if (py % 8 === 0) { g.fillStyle = "#f2d896"; g.fillRect(snap(cx - ws), snap(by - py), snap(ws), 2); }
    }
    // Capstone.
    for (let py = 0; py < 14; py += 2) { const w = snap(7 - py / 2); g.fillStyle = "#ffd84a"; g.fillRect(snap(cx - w), snap(by - h + 10 - py), w, 2); g.fillStyle = "#d8a020"; g.fillRect(snap(cx), snap(by - h + 10 - py), w, 2); }
    // Door.
    g.fillStyle = "#6a5028"; g.fillRect(snap(cx - 12), by - 30, 24, 30);
    g.fillStyle = "#1a1008"; g.fillRect(snap(cx - 8), by - 26, 16, 26);
    g.fillStyle = "#3a2810"; g.fillRect(snap(cx - 8), by - 26, 16, 4);
    // Hieroglyph eye above the door.
    g.fillStyle = "#3a8aa0"; g.fillRect(cx - 6, by - 40, 12, 4); g.fillStyle = "#1a1008"; g.fillRect(cx - 2, by - 40, 4, 4);
  }

  // Rails that follow a smooth path; sleepers across, two steel rails on top.
  function railPath(g, pts) {
    const samples = [];
    const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let t = 0; t < 1; t += 0.01) samples.push([cr(p0[0], p1[0], p2[0], p3[0], t), cr(p0[1], p1[1], p2[1], p3[1], t)]);
    }
    samples.push(pts[pts.length - 1]);
    let dist = 0;
    const out = [];
    for (let i = 1; i < samples.length; i += 1) {
      const [x0, y0] = samples[i - 1], [x1, y1] = samples[i];
      const len = Math.hypot(x1 - x0, y1 - y0);
      dist += len;
      const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
      out.push([x1, y1, nx, ny, dist]);
    }
    // Sleepers.
    let next = 0;
    for (const [x, y, nx, ny, d] of out) {
      if (d < next) continue;
      next = d + 14;
      for (let k = -14; k <= 14; k += 2) for (let w = -3; w <= 3; w += 2) {
        const tx = -ny, ty = nx;
        g.fillStyle = Math.abs(k) > 12 ? "#3a2614" : w < 0 ? "#8a5a32" : "#6a4428";
        g.fillRect(snap(x + nx * k + tx * w), snap(y + ny * k + ty * w), 2, 2);
      }
    }
    // Rails.
    for (const side of [-9, 9]) {
      for (const [x, y, nx, ny] of out) {
        g.fillStyle = "#4a4e56"; g.fillRect(snap(x + nx * side), snap(y + ny * side + 2), 2, 2);
      }
      for (const [x, y, nx, ny] of out) {
        g.fillStyle = "#c8ccd2"; g.fillRect(snap(x + nx * side), snap(y + ny * side), 2, 2);
      }
    }
    return out;
  }


  /* ---------- painting helpers ---------- */
  // Paint a mask on a 4px grid. style(x, y, depthFromEdge) -> color or null.
  function paintMask(g, inside, style, x0 = T, y0 = T, x1 = W - T, y1 = H - T) {
    const depth = (x, y) => {
      for (let d = 1; d <= 4; d += 1) {
        if (!inside(x - d * C, y) || !inside(x + d * C, y) || !inside(x, y - d * C) || !inside(x, y + d * C)) return d - 1;
      }
      return 4;
    };
    for (let y = y0; y < y1; y += C) {
      for (let x = x0; x < x1; x += C) {
        if (!inside(x + 2, y + 2)) continue;
        const col = style(x, y, depth(x + 2, y + 2));
        if (col) { g.fillStyle = col; g.fillRect(x, y, C, C); }
      }
    }
  }
  // Ring just outside a mask (for banks / shore / shadows).
  function paintRing(g, inside, width, color, offY = 0) {
    for (let y = T; y < H - T; y += C) {
      for (let x = T; x < W - T; x += C) {
        if (inside(x + 2, y + 2)) continue;
        let near = false;
        for (let d = 1; d <= width && !near; d += 1) {
          if (inside(x + 2 + d * C, y + 2 - offY) || inside(x + 2 - d * C, y + 2 - offY) || inside(x + 2, y + 2 + d * C - offY) || inside(x + 2, y + 2 - d * C - offY)) near = true;
        }
        if (near) { g.fillStyle = color; g.fillRect(x, y, C, C); }
      }
    }
  }
  function edgeShadow(g) {
    g.fillStyle = "rgba(0,0,0,0.28)";
    g.fillRect(T, T, W - 2 * T, 8);
    g.fillRect(T, T, 6, H - 2 * T);
    g.fillStyle = "rgba(0,0,0,0.14)";
    g.fillRect(T, T + 8, W - 2 * T, 6);
  }
  function bush(g, x, y, r, dark, mid, light) {
    for (const [col, k, oy] of [[dark, 1, 2], [mid, 0.82, 0], [light, 0.38, -r * 0.35]]) {
      g.fillStyle = col;
      const rr = r * k;
      for (let yy = -rr; yy <= rr; yy += 2) for (let xx = -rr; xx <= rr; xx += 2) if (xx * xx + yy * yy <= rr * rr) g.fillRect(snap(x + xx - (col === light ? r * 0.25 : 0)), snap(y + yy + oy), 2, 2);
    }
  }
  function lily(g, x, y, r, flower) {
    // Ripple ring, outline, pad with a notch, veins.
    g.fillStyle = "#6cb8e8";
    for (let a = 0; a < Math.PI * 2; a += 0.2) g.fillRect(snap(x + Math.cos(a) * (r + 5)), snap(y + Math.sin(a) * (r + 3) + 2), 2, 2);
    const pad = (xx, yy, rr) => xx * xx + yy * yy <= rr * rr && !(xx > 0 && Math.abs(yy) < xx * 0.5);
    for (let yy = -r - 2; yy <= r + 2; yy += 2) for (let xx = -r - 2; xx <= r + 2; xx += 2) {
      if (!pad(xx, yy, r + 2)) continue;
      g.fillStyle = !pad(xx, yy, r) ? "#14451c" : xx + yy < -r * 0.4 ? "#5ac84a" : xx + yy > r * 0.5 ? "#257a30" : "#2f8a3a";
      g.fillRect(snap(x + xx), snap(y + yy), 2, 2);
    }
    g.fillStyle = "#1e6a28";
    for (let k = 2; k < r; k += 2) { g.fillRect(snap(x - k), snap(y), 2, 2); g.fillRect(snap(x - k * 0.7), snap(y - k * 0.7), 2, 2); g.fillRect(snap(x - k * 0.7), snap(y + k * 0.7), 2, 2); }
    if (flower) {
      g.fillStyle = "#ff9ff3"; g.fillRect(snap(x - 2), snap(y - 4), 6, 6);
      g.fillStyle = "#ffffff"; g.fillRect(snap(x), snap(y - 4), 2, 2);
      g.fillStyle = "#ffd166"; g.fillRect(snap(x), snap(y - 2), 2, 2);
    }
  }
  function reeds(g, x, y) {
    for (let i = 0; i < 4; i += 1) {
      const xx = x + i * 4 - 6, h = 14 + (i % 2) * 6;
      g.fillStyle = "#2f6a2a"; g.fillRect(xx, y - h, 2, h);
      if (i % 2 === 0) { g.fillStyle = "#7a4a22"; g.fillRect(xx - 1 + 1, y - h - 6, 2, 6); g.fillRect(xx, y - h - 6, 2, 6); }
    }
  }
  function tallGrass(g, rng, cx, cy, n) {
    for (let i = 0; i < n; i += 1) {
      const x = snap(cx + (rng() - 0.5) * 70), y = snap(cy + (rng() - 0.5) * 44);
      g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(x - 4, y, 14, 2);
      g.fillStyle = "#3f7a35"; g.fillRect(x, y - 12, 2, 12); g.fillRect(x + 4, y - 16, 2, 16);
      g.fillStyle = "#7fd65a"; g.fillRect(x - 4, y - 10, 2, 10); g.fillRect(x + 8, y - 8, 2, 8); g.fillRect(x + 4, y - 16, 2, 4);
    }
  }
  function mushroomGlow(g, x, y) {
    g.fillStyle = "rgba(120,255,220,0.12)";
    for (let yy = -18; yy <= 18; yy += 2) for (let xx = -22; xx <= 24; xx += 2) if (xx * xx / 484 + yy * yy / 324 <= 1) g.fillRect(x + xx, y + yy, 2, 2);
    g.fillStyle = "rgba(120,255,220,0.12)";
    for (let yy = -10; yy <= 10; yy += 2) for (let xx = -14; xx <= 16; xx += 2) if (xx * xx / 196 + yy * yy / 100 <= 1) g.fillRect(x + xx, y + yy, 2, 2);
    g.fillStyle = "#e8dcc4"; g.fillRect(x, y, 4, 8);
    g.fillStyle = "#3de0c0"; g.fillRect(x - 6, y - 4, 16, 6); g.fillRect(x - 2, y - 6, 8, 2);
    g.fillStyle = "#c8fff4"; g.fillRect(x - 2, y - 4, 2, 2); g.fillRect(x + 4, y - 2, 2, 2);
  }
  // Cliff face along the top edge inside a sunken area (pond, lava, chasm) so it reads as lower ground.
  function paintFace(g, inside, cells, colorAt) {
    for (let y = T; y < H - T; y += C) for (let x = T; x < W - T; x += C) {
      if (!inside(x + 2, y + 2)) continue;
      for (let j = 1; j <= cells; j += 1) {
        if (!inside(x + 2, y + 2 - j * C)) { const c = colorAt(j, x, y); if (c) { g.fillStyle = c; g.fillRect(x, y, C, C); } break; }
      }
    }
  }
  // Dark outline just outside a mask, 2px wide.
  function outlineMask(g, inside, color) {
    for (let y = T; y < H - T; y += 2) for (let x = T; x < W - T; x += 2) {
      if (inside(x + 1, y + 1)) continue;
      if (inside(x + 3, y + 1) || inside(x - 1, y + 1) || inside(x + 1, y + 3) || inside(x + 1, y - 1)) { g.fillStyle = color; g.fillRect(x, y, 2, 2); }
    }
  }
  // Stone bridge seen from above: paved deck, parapets on both sides, arches over the lava, fire posts.
  function archBridge(g, x0, x1, y0, deck, overLava) {
    const y1 = y0 + deck;
    // Shadow and arches on the lava below the south side.
    g.fillStyle = "rgba(20,4,0,0.55)";
    g.fillRect(x0 + 6, y1 + 18, x1 - x0 - 6, 8);
    for (let y = y1; y < y1 + 20; y += 2) for (let x = x0; x < x1; x += 2) {
      // Front face of the bridge, with round arches where it crosses lava.
      const span = 36, local = ((x - x0) % span) - span / 2;
      const arch = overLava(x, y1 + 22) && y - y1 > 4 && local * local + (y - (y1 + 22)) ** 2 * 1.6 < 15 * 15;
      let col;
      if (arch) col = y > y1 + 16 ? "#a8380e" : y > y1 + 12 ? "#4a1608" : "#1a0806";
      else {
        const row = Math.floor((y - y1) / 6), joint = ((x - x0 + (row % 2) * 8) % 16) === 0;
        col = (y - y1) % 6 === 0 || joint ? "#2e2420" : y - y1 < 4 ? "#6a5a52" : "#54443e";
      }
      g.fillStyle = col; g.fillRect(x, y, 2, 2);
    }
    // Deck: rows of paving stones, worn lighter down the middle.
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      const row = Math.floor((y - y0) / 10), jx = ((x - x0 + (row % 3) * 7) % 14);
      const edge = (y - y0) % 10 === 0 || jx === 0;
      const mid = Math.abs(y - (y0 + deck / 2)) < deck * 0.22;
      const v = Math.sin(x * 0.37 + row * 1.7) > 0.6;
      g.fillStyle = edge ? "#3a2e2a" : mid ? (v ? "#a8988c" : "#9a8a80") : v ? "#86766e" : "#7a6a62";
      g.fillRect(x, y, 2, 2);
    }
    // Cracks.
    g.fillStyle = "#3a2e2a";
    for (const cx of [x0 + 40, x0 + (x1 - x0) * 0.6]) { let x = Math.round(cx / 2) * 2, y = y0 + 12; for (let i = 0; i < 8; i += 1) { g.fillRect(x, y, 2, 2); x += 2; y += i % 2 ? 2 : 0; } }
    // Parapets: top face light, front face with bricks.
    for (const [py, h] of [[y0 - 10, 10], [y1 - 4, 8]]) {
      g.fillStyle = "#2e2420"; g.fillRect(x0 - 2, py - 2, x1 - x0 + 4, h + 4);
      g.fillStyle = "#b8a89c"; g.fillRect(x0, py, x1 - x0, 4);
      g.fillStyle = "#d4c4b8"; g.fillRect(x0, py, x1 - x0, 2);
      g.fillStyle = "#6a5a52"; g.fillRect(x0, py + 4, x1 - x0, h - 4);
      g.fillStyle = "#3a2e2a"; for (let x = x0 + 6; x < x1; x += 12) g.fillRect(x, py + 4, 2, h - 4);
    }
    // End posts with fire bowls.
    for (const px of [x0 - 8, x1 - 8]) for (const py of [y0 - 22, y1 - 14]) {
      g.fillStyle = "#2e2420"; g.fillRect(px - 2, py - 2, 20, 26);
      g.fillStyle = "#8a7a72"; g.fillRect(px, py + 6, 16, 16);
      g.fillStyle = "#b8a89c"; g.fillRect(px, py + 6, 16, 4);
      g.fillStyle = "#54443e"; g.fillRect(px + 10, py + 10, 6, 12);
      g.fillStyle = "#3a2e2a"; g.fillRect(px + 2, py + 2, 12, 4);
      g.fillStyle = "#ff7a2e"; g.fillRect(px + 4, py - 4, 8, 6); g.fillRect(px + 2, py, 12, 2);
      g.fillStyle = "#ffd166"; g.fillRect(px + 6, py - 2, 4, 4);
      g.fillStyle = "#fff1a8"; g.fillRect(px + 6, py, 2, 2);
    }
  }
  // A layered pine with an outline, light and dark sides and snow on each tier.
  function pineTree(g, x, y, s, snowy) {
    if (house("pineTree", g, x, y, s, snowy)) return;
    shadow(g, x + 6, y + 2, 16 * s, 5 * s, 0.25);
    for (let yy = -10; yy <= 0; yy += 2) for (let xx = -4; xx <= 4; xx += 2) { g.fillStyle = Math.abs(xx) === 4 ? "#2a1a0e" : xx < 0 ? "#8a5a32" : "#5a3a22"; g.fillRect(snap(x + xx), snap(y + yy), 2, 2); }
    const tiers = [[-8, 18, 14], [-20, 15, 13], [-31, 12, 12], [-41, 8, 11]];
    for (const [oy, hw, th] of tiers) {
      const base = y + oy * s, w = hw * s, h = th * s;
      for (let pass = 0; pass < 2; pass += 1) for (let r = 0; r <= h; r += 2) {
        const ww = snap(w * (r / h)) + (pass ? 0 : 2);
        const yy = snap(base - h + r);
        for (let xx = -ww; xx <= ww; xx += 2) {
          let col = "#0e2a1e";
          if (pass) {
            const u = xx / (ww || 1);
            col = u < -0.45 ? "#3f8a5a" : u < 0.25 ? "#2a6a44" : "#1c4e32";
            if (r > h - 4) col = "#173e2a";
            if (snowy && r < h * 0.45 && u < 0.3) col = r < h * 0.25 ? "#ffffff" : "#d6eef8";
          }
          g.fillStyle = col; g.fillRect(snap(x + xx), yy - (pass ? 0 : 2), 2, 2);
        }
      }
      if (snowy) { g.fillStyle = "#ffffff"; g.fillRect(snap(x - w * 0.9), snap(base - 2), 6, 2); g.fillRect(snap(x + w * 0.5), snap(base - 2), 4, 2); }
    }
    if (snowy) { g.fillStyle = "#ffffff"; g.fillRect(snap(x - 2), snap(y - 52 * s), 4, 4); }
  }
  // Border made of shaded, outlined boulders.
  function boulderWall(g, rng, pal, extra) {
    g.fillStyle = pal.k;
    g.fillRect(0, 0, W, T); g.fillRect(0, H - T, W, T); g.fillRect(0, 0, T, H); g.fillRect(W - T, 0, T, H);
    const spots = [];
    for (let x = -10; x < W + 20; x += 22 + rng() * 10) { spots.push([x, 10 + rng() * 6, 14 + rng() * 6]); spots.push([x + 8, H - 14 - rng() * 4, 14 + rng() * 6]); }
    for (let y = 30; y < H - 20; y += 22 + rng() * 10) { spots.push([10 + rng() * 4, y, 13 + rng() * 5]); spots.push([W - 12 - rng() * 4, y, 13 + rng() * 5]); }
    spots.sort((a, b) => a[1] - b[1]);
    for (const [x, y, r] of spots) boulder(g, rng, x, y, r, pal);
    if (extra) extra();
    edgeShadow(g);
  }
  // Rope bridge: sagging planks with gaps you can see the void through, ropes and knots on both sides.
  function ropeBridge(g, x0, x1, y0, w) {
    const sag = (x) => snap(Math.sin(((x - x0) / (x1 - x0)) * Math.PI) * 8);
    for (let x = x0; x < x1; x += 10) {
      const dy = sag(x), tilt = (x * 7) % 3 === 0 ? 2 : 0;
      g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(x + 2, y0 + dy + 6, 8, w);
      g.fillStyle = "#2a1a0e"; g.fillRect(x, y0 + dy - 2 + tilt, 10, w + 4);
      g.fillStyle = "#8a5a32"; g.fillRect(x + 2, y0 + dy + tilt, 6, w);
      g.fillStyle = "#b07a44"; g.fillRect(x + 2, y0 + dy + tilt, 2, w);
      g.fillStyle = "#5a3a22"; g.fillRect(x + 6, y0 + dy + tilt, 2, w);
      g.fillStyle = "#3a2614"; g.fillRect(x + 4, y0 + dy + 4 + tilt, 2, 2); g.fillRect(x + 4, y0 + dy + w - 6 + tilt, 2, 2);
    }
    for (const ry of [y0 - 4, y0 + w + 2]) {
      for (let x = x0 - 6; x < x1 + 6; x += 2) {
        const dy = sag(Math.min(Math.max(x, x0), x1)) + (ry > y0 ? 2 : 0);
        g.fillStyle = "#3a2614"; g.fillRect(x, ry + dy + 2, 2, 2);
        g.fillStyle = (x / 2) % 3 === 0 ? "#c8a070" : "#a07a4a"; g.fillRect(x, ry + dy, 2, 2);
        if ((x - x0) % 30 === 0) { g.fillStyle = "#e8c890"; g.fillRect(x - 2, ry + dy - 2, 6, 6); g.fillStyle = "#a07a4a"; g.fillRect(x, ry + dy, 2, 2); }
      }
    }
    for (const px of [x0 - 10, x1 + 2]) for (const py of [y0 - 14, y0 + w - 4]) {
      g.fillStyle = "#1a0e06"; g.fillRect(px - 2, py - 2, 12, 22);
      g.fillStyle = "#7a5030"; g.fillRect(px, py, 8, 18);
      g.fillStyle = "#a87044"; g.fillRect(px, py, 2, 18); g.fillRect(px, py, 8, 2);
      g.fillStyle = "#c8a070"; g.fillRect(px, py + 8, 8, 2);
    }
  }
  // A round leafy tree: trunk plus a canopy of overlapping blobs with an outline and leaf clumps.
  function oakTree(g, rng, x, y, r, opts = {}) {
    if (house("oakTree", g, rng, x, y, r, opts)) return;
    const pal = opts.pal || { k: "#173a1c", D: "#2a6a2e", M: "#3f8a3a", L: "#6cc04f", H: "#a8e870" };
    shadow(g, x + 6, y + 2, r * 1.1, r * 0.35, 0.3);
    // Trunk.
    const th = r * 0.9;
    for (let yy = -th; yy <= 0; yy += 2) for (let xx = -8; xx <= 8; xx += 2) {
      const flare = yy > -8 ? 4 : 0;
      if (Math.abs(xx) > 6 + flare) continue;
      g.fillStyle = Math.abs(xx) >= 5 + flare ? "#2a1a0e" : xx < -1 ? "#9a6a3a" : xx < 3 ? "#7a5030" : "#5a3a22";
      g.fillRect(snap(x + xx), snap(y + yy), 2, 2);
    }
    const cy = y - th - r * 0.55;
    const blobs = [[0, 0, r * 0.75]];
    for (let i = 0; i < 6; i += 1) { const a = (i / 6) * Math.PI * 2 + rng() * 0.5; blobs.push([Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.32, r * (0.42 + rng() * 0.12)]); }
    const inside = (xx, yy, grow) => blobs.some(([bx, by, br]) => (xx - bx) ** 2 + (yy - by) ** 2 <= (br + grow) ** 2);
    for (let yy = -r * 1.2; yy <= r * 1.1; yy += 2) for (let xx = -r * 1.3; xx <= r * 1.3; xx += 2) {
      if (!inside(xx, yy, 2)) continue;
      let col = pal.k;
      if (inside(xx, yy, 0)) {
        // Shade by the nearest blob so each leaf clump has its own light side.
        let best = null, bd = 1e9;
        for (const b of blobs) { const d = Math.hypot(xx - b[0], yy - b[1]) - b[2]; if (d < bd) { bd = d; best = b; } }
        const lx = (xx - best[0]) / best[2], ly = (yy - best[1]) / best[2];
        const lit = -lx * 0.7 - ly + (-yy / r) * 0.5;
        col = lit > 0.9 ? pal.H : lit > 0.25 ? pal.L : lit > -0.5 ? pal.M : pal.D;
      }
      g.fillStyle = col;
      g.fillRect(snap(x + xx), snap(cy + yy), 2, 2);
    }
    if (opts.fruit) for (let i = 0; i < 6; i += 1) {
      const fx = snap(x + (rng() - 0.5) * r * 1.3), fy = snap(cy + (rng() - 0.3) * r * 0.9);
      if (!inside(fx - x, fy - cy, -4)) continue;
      g.fillStyle = "#8a1a1a"; g.fillRect(fx, fy, 6, 6);
      g.fillStyle = opts.fruit; g.fillRect(fx, fy, 4, 4);
      g.fillStyle = "#ffffff"; g.fillRect(fx, fy, 2, 2);
    }
  }
  // Weeping willow: a dome of leaves with long strands hanging almost to the ground.
  function willowTree(g, rng, x, y, r) {
    if (house("willowTree", g, rng, x, y, r)) return;
    shadow(g, x + 6, y + 2, r * 1.3, r * 0.4, 0.3);
    const top = y - r * 2.1;
    // Trunk, mostly hidden by strands.
    for (let yy = top + r * 0.6; yy <= y; yy += 2) for (let xx = -8; xx <= 8; xx += 2) {
      const lean = Math.round(((y - yy) / (r * 2)) * 6 / 2) * 2;
      g.fillStyle = Math.abs(xx) >= 7 ? "#2a1a0e" : xx < 0 ? "#8a6a42" : "#5a4026";
      g.fillRect(snap(x + xx + lean), snap(yy), 2, 2);
    }
    // Dome.
    const domeR = r * 1.05;
    const dcy = top + domeR * 0.75;
    for (let yy = -domeR; yy <= domeR * 0.35; yy += 2) for (let xx = -domeR * 1.3; xx <= domeR * 1.3; xx += 2) {
      const e = (xx / (domeR * 1.25)) ** 2 + (yy / domeR) ** 2;
      if (e > 1.08) continue;
      const lit = -xx / domeR * 0.5 - yy / domeR;
      g.fillStyle = e > 0.94 ? "#1e4a2a" : lit > 0.9 ? "#c4f08e" : lit > 0.35 ? "#8ad064" : lit > -0.2 ? "#5aa848" : "#3a7a3a";
      g.fillRect(snap(x + xx), snap(dcy + yy), 2, 2);
    }
    // Hanging strands, back row darker, front row lighter, with tiny leaves.
    for (const [row, cols] of [[0, ["#2e6a32", "#3a7a3a"]], [1, ["#5aa848", "#8ad064"]]]) {
      for (let xx = -domeR * 1.2; xx <= domeR * 1.2; xx += row ? 6 : 4) {
        if (row === 1 && Math.abs(xx) < 10) continue;
        const startY = dcy + Math.sqrt(Math.max(0, 1 - (xx / (domeR * 1.25)) ** 2)) * domeR * 0.3 - 6;
        const len = (y - startY) * (0.55 + rng() * 0.4) * (row ? 0.85 : 1);
        for (let s = 0; s < len; s += 2) {
          const sway = Math.round(Math.sin(s * 0.05 + xx) * 1.2) * 2;
          g.fillStyle = s % 8 < 2 ? cols[1] : cols[0];
          g.fillRect(snap(x + xx + sway), snap(startY + s), 2, 2);
          if (s % 8 === 4) { g.fillStyle = cols[1]; g.fillRect(snap(x + xx + sway + 2), snap(startY + s), 2, 2); }
        }
      }
    }
  }
  function flowerBed(g, rng, cx, cy, n, spread) {
    for (let i = 0; i < n; i += 1) {
      const x = snap(cx + (rng() - 0.5) * spread), y = snap(cy + (rng() - 0.5) * spread * 0.55);
      const kind = rng();
      g.fillStyle = "#2f6a2a"; g.fillRect(x + 2, y + 2, 2, 6);
      g.fillStyle = "#4f9a3e"; g.fillRect(x + 4, y + 4, 2, 2);
      if (kind < 0.35) {
        // Tulip.
        const c = pickColor(rng, ["#e8443a", "#ff9ff3", "#ffd166", "#ff7a2e"]);
        g.fillStyle = c; g.fillRect(x, y - 4, 6, 6); g.fillRect(x, y - 6, 2, 2); g.fillRect(x + 4, y - 6, 2, 2);
        g.fillStyle = "rgba(0,0,0,0.2)"; g.fillRect(x + 4, y - 4, 2, 6);
      } else if (kind < 0.7) {
        // Daisy.
        g.fillStyle = "#ffffff"; g.fillRect(x + 2, y - 6, 2, 2); g.fillRect(x, y - 4, 2, 2); g.fillRect(x + 4, y - 4, 2, 2); g.fillRect(x + 2, y - 2, 2, 2);
        g.fillStyle = "#ffd166"; g.fillRect(x + 2, y - 4, 2, 2);
      } else {
        // Bluebells.
        g.fillStyle = "#6a8aff"; g.fillRect(x, y - 4, 2, 4); g.fillRect(x + 4, y - 6, 2, 4);
        g.fillStyle = "#a8c0ff"; g.fillRect(x, y - 4, 2, 2);
      }
    }
  }
  function tunnel(g, x, y, w, h, vertical) {
    g.fillStyle = "#0a0806"; g.fillRect(x, y, w, h);
    g.fillStyle = "#6a4a2a";
    if (vertical) { g.fillRect(x - 6, y, 6, h); g.fillRect(x + w, y, 6, h); g.fillRect(x - 6, y + h - 6, w + 12, 8); g.fillStyle = "#9a7040"; g.fillRect(x - 6, y + h - 6, w + 12, 2); }
    else { g.fillRect(x, y - 6, w, 6); g.fillRect(x, y + h, w, 6); g.fillRect(x + w - 6, y - 6, 8, h + 12); g.fillStyle = "#9a7040"; g.fillRect(x + w - 6, y - 6, 2, h + 12); }
  }
  function gem(g, x, y, c) {
    g.fillStyle = "#1e1e22"; g.fillRect(x - 2, y - 2, 10, 10);
    g.fillStyle = c; g.fillRect(x, y, 6, 6);
    g.fillStyle = "#ffffff"; g.fillRect(x, y, 2, 2);
    g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(x + 4, y + 2, 2, 4);
  }
  function rockCluster(g, rng, cx, cy, size, pal, gems, moss) {
    const parts = [];
    const n = 3 + Math.floor(size / 30);
    for (let i = 0; i < n; i += 1) parts.push([cx + (rng() - 0.5) * size * 1.3, cy + (rng() - 0.5) * size * 0.5, size * (0.32 + rng() * 0.3)]);
    parts.push([cx, cy - size * 0.1, size * 0.6]);
    parts.sort((a, b) => a[1] + a[2] * 0.2 - (b[1] + b[2] * 0.2));
    for (const [x, y, r] of parts) boulder(g, rng, x, y, r, pal, moss);
    if (gems) for (let i = 0; i < 4; i += 1) gem(g, snap(cx + (rng() - 0.5) * size), snap(cy - size * 0.2 + (rng() - 0.5) * size * 0.4), gems[i % gems.length]);
    // Rubble.
    for (let i = 0; i < 10; i += 1) {
      const a = rng() * Math.PI * 2, d = size * (0.9 + rng() * 0.5);
      const x = snap(cx + Math.cos(a) * d), y = snap(cy + Math.sin(a) * d * 0.5 + size * 0.2);
      g.fillStyle = pal.k; g.fillRect(x - 2, y - 2, 8, 6);
      g.fillStyle = pal.L; g.fillRect(x, y - 2, 4, 2);
      g.fillStyle = pal.M; g.fillRect(x, y, 4, 2);
    }
  }

  /* ---------- more props ---------- */

  // A standing ruin column: fluted, broken at the top, with moss.
  function ruinColumn(g, rng, x, y, h) {
    shadow(g, x + 6, y + 2, 22, 6, 0.3);
    g.fillStyle = "#1e261c"; g.fillRect(x - 26, y - 14, 52, 16);
    g.fillStyle = "#8a9080"; g.fillRect(x - 24, y - 12, 48, 4);
    g.fillStyle = "#6a7064"; g.fillRect(x - 24, y - 8, 48, 8);
    const top = y - 10 - h;
    for (let yy = top; yy < y - 10; yy += 2) for (let xx = -18; xx <= 16; xx += 2) {
      const broken = yy < top + 8 && Math.sin(xx * 0.7 + x) * 4 + 4 > yy - top;
      if (broken) continue;
      let col = xx <= -18 || xx >= 16 ? "#1e261c" : xx < -8 ? "#a8b09c" : xx < 4 ? "#8a9080" : "#6a7064";
      if (xx > -18 && xx < 16 && (xx + 18) % 6 === 0) col = "#5a6054";
      g.fillStyle = col; g.fillRect(x + xx, yy, 2, 2);
    }
    for (let i = 0; i < 14; i += 1) {
      const mx = snap(x - 12 + rng() * 22), my = snap(top + 6 + rng() * h * 0.7);
      g.fillStyle = rng() < 0.5 ? "#4f8a3a" : "#6cb04a"; g.fillRect(mx, my, 4, 2);
    }
    g.fillStyle = "#4f8a3a"; g.fillRect(x - 18, y - 12, 12, 2); g.fillRect(x + 4, y - 12, 10, 2);
  }
  // A column lying on its side, in drums.
  function fallenColumn(g, rng, x, y) {
    shadow(g, x + 4, y + 2, 46, 8, 0.3);
    for (let d = 0; d < 3; d += 1) {
      const dx = x - 42 + d * 28 + (d === 2 ? 6 : 0), dy = y - 22 + (d === 1 ? 2 : 0);
      g.fillStyle = "#1e261c"; g.fillRect(dx - 2, dy - 2, 28, 24);
      g.fillStyle = "#8a9080"; g.fillRect(dx, dy, 24, 20);
      g.fillStyle = "#a8b09c"; g.fillRect(dx, dy, 24, 6);
      g.fillStyle = "#6a7064"; g.fillRect(dx, dy + 14, 24, 6);
      g.fillStyle = "#5a6054"; for (let k = 4; k < 20; k += 6) g.fillRect(dx, dy + k, 24, 2);
      g.fillStyle = "#6cb04a"; g.fillRect(dx + 4 + d * 4, dy, 8, 2);
    }
    g.fillStyle = "#b8c0ac"; g.fillRect(x + 42, y - 22, 4, 20);
  }
  function gravestone(g, rng, x, y, kind) {
    shadow(g, x + 4, y + 2, 14, 4, 0.35);
    g.fillStyle = "#3a3448"; g.fillRect(x - 14, y - 4, 28, 6);
    g.fillStyle = "#5a5470"; g.fillRect(x - 12, y - 4, 24, 2);
    if (kind === 0) {
      g.fillStyle = "#1a1624"; g.fillRect(x - 12, y - 32, 24, 30); g.fillRect(x - 8, y - 36, 16, 4);
      g.fillStyle = "#7a7490"; g.fillRect(x - 10, y - 30, 20, 26); g.fillRect(x - 6, y - 34, 12, 4);
      g.fillStyle = "#9a94b0"; g.fillRect(x - 10, y - 30, 4, 26); g.fillRect(x - 6, y - 34, 6, 2);
      g.fillStyle = "#4a4460"; g.fillRect(x - 2, y - 26, 4, 14); g.fillRect(x - 6, y - 22, 12, 4);
    } else {
      g.fillStyle = "#1a1624"; g.fillRect(x - 4, y - 40, 8, 38); g.fillRect(x - 14, y - 32, 28, 8);
      g.fillStyle = "#7a7490"; g.fillRect(x - 2, y - 38, 4, 36); g.fillRect(x - 12, y - 30, 24, 4);
      g.fillStyle = "#9a94b0"; g.fillRect(x - 2, y - 38, 2, 36); g.fillRect(x - 12, y - 30, 24, 2);
    }
    g.fillStyle = "#4f8a6a"; g.fillRect(x - 12, y - 6, 6, 2); g.fillRect(x + 6, y - 6, 4, 2);
  }
  function candle(g, x, y) {
    g.fillStyle = "rgba(255,210,120,0.16)"; for (let yy = -10; yy <= 6; yy += 2) for (let xx = -10; xx <= 10; xx += 2) if (xx * xx + yy * yy < 100) g.fillRect(x + xx, y - 8 + yy, 2, 2);
    g.fillStyle = "#2a2018"; g.fillRect(x - 2, y - 10, 6, 12);
    g.fillStyle = "#f2e6c8"; g.fillRect(x, y - 10, 2, 10);
    g.fillStyle = "#ffd166"; g.fillRect(x, y - 16, 2, 4);
    g.fillStyle = "#ff7a2e"; g.fillRect(x, y - 12, 2, 2);
  }
  // A huge glowing mushroom with spots.
  function giantMushroom(g, rng, x, y, s, cap, dark) {
    g.fillStyle = "rgba(120,255,220,0.10)";
    for (let yy = -30 * s; yy <= 10; yy += 2) for (let xx = -36 * s; xx <= 36 * s; xx += 2) if ((xx / (36 * s)) ** 2 + ((yy + 10 * s) / (30 * s)) ** 2 <= 1 && (xx + yy) % 4 === 0) g.fillRect(snap(x + xx), snap(y + yy), 2, 2);
    shadow(g, x + 4, y + 2, 14 * s, 4 * s, 0.3);
    for (let yy = -22 * s; yy <= 0; yy += 2) for (let xx = -6 * s; xx <= 6 * s; xx += 2) { g.fillStyle = Math.abs(xx) >= 5 * s ? "#2a3a38" : xx < 0 ? "#e8f4ee" : "#b8ccc4"; g.fillRect(snap(x + xx), snap(y + yy), 2, 2); }
    const cy = y - 24 * s;
    for (let pass = 0; pass < 2; pass += 1) for (let yy = -14 * s; yy <= 4 * s; yy += 2) for (let xx = -24 * s; xx <= 24 * s; xx += 2) {
      const e = (xx / (22 * s + (pass ? 0 : 2))) ** 2 + (yy / (14 * s + (pass ? 0 : 2))) ** 2;
      if (e > 1 || yy > 4 * s) continue;
      g.fillStyle = pass === 0 ? "#0a2a28" : yy > 1 * s ? dark : xx + yy < -10 * s ? "#c8fff4" : cap;
      g.fillRect(snap(x + xx), snap(cy + yy), 2, 2);
    }
    for (let i = 0; i < 5; i += 1) { const sx = snap(x + (rng() - 0.5) * 30 * s), sy = snap(cy - 4 * s - rng() * 6 * s); g.fillStyle = "#e8fffa"; g.fillRect(sx, sy, 4, 4); }
  }
  function stalagmite(g, x, y, h, pal) {
    shadow(g, x + 4, y + 2, 14, 4, 0.3);
    for (let yy = 0; yy < h; yy += 2) {
      const w = snap(12 * (1 - yy / h)) + 2;
      for (let xx = -w; xx <= w; xx += 2) {
        g.fillStyle = Math.abs(xx) >= w ? pal.k : xx < -w * 0.3 ? pal.L : xx < w * 0.4 ? pal.M : pal.D;
        g.fillRect(snap(x + xx), snap(y - yy), 2, 2);
      }
    }
  }
  function brokenColumnSand(g, x, y, h) {
    g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(x - 4, y, 40, 6);
    g.fillStyle = "#6a5028"; g.fillRect(x - 2, y - h - 2, 36, h + 4);
    g.fillStyle = "#b8925a"; g.fillRect(x, y - h, 32, h);
    g.fillStyle = "#e6c27a"; g.fillRect(x, y - h, 32, 8); g.fillRect(x + 4, y - h + 8, 4, h - 8);
    g.fillStyle = "#806030"; g.fillRect(x + 22, y - h + 8, 4, h - 8);
  }

  /* ---------- the terrain grid ----------
     Each room gets a grid of 4x4 pixel cells that says what the ground is:
     floor, water, lava, a chasm, ice, quicksand, snow or a bridge. It is built
     once per room, then used both to paint the background and to decide how
     things move. */
  const CELL = 4;
  const GW = W / CELL;
  const GH = H / CELL;
  const FLOOR = 0, WATER = 1, LAVA = 2, CHASM = 3, ICE = 4, QUICK = 5, SNOW = 6, BRIDGE = 7, PATH = 8;
  const SLOW = [1, 0.62, 1, 1, 1, 0.5, 0.72, 1, 1];
  const isHazard = (k) => k === LAVA || k === CHASM;

  function cellAt(L, x, y) {
    const cx = x >> 2, cy = y >> 2;
    if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return FLOOR;
    return L.grid[cy * GW + cx];
  }
  const ell = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const wob = (f, seed, amt) => (x, y) => f(x + Math.sin(y * 0.05 + seed) * amt, y + Math.cos(x * 0.04 + seed) * amt);
  const any = (...fs) => (x, y) => fs.some((f) => f(x, y));
  const rectFn = (x0, y0, x1, y1) => (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1;

  function inClear(L, x, y) {
    for (const z of L.clear) {
      if (z.r ? (x - z.x) ** 2 + (y - z.y) ** 2 < z.r * z.r : x >= z.x0 && x < z.x1 && y >= z.y0 && y < z.y1) return true;
    }
    return false;
  }
  // Mark the cells inside a shape. Shapes never cover the doorways or the campfire.
  function shape(L, kind, test, force = false) {
    for (let cy = T / CELL; cy < (H - T) / CELL; cy += 1) {
      for (let cx = T / CELL; cx < (W - T) / CELL; cx += 1) {
        const x = cx * CELL + 2, y = cy * CELL + 2;
        if (!test(x, y)) continue;
        if (!force && inClear(L, x, y)) continue;
        L.grid[cy * GW + cx] = kind;
        L.has[kind] = true;
      }
    }
  }
  // Bridges are safe ground over lava or a chasm, with railings you can't walk through.
  function addBridge(L, type, x0, x1, y0, h) {
    const midY = y0 + h / 2;
    let hx0 = -1, hx1 = -1;
    for (let x = x0; x < x1; x += CELL) if (isHazard(cellAt(L, x, midY))) { if (hx0 < 0) hx0 = x; hx1 = x; }
    for (let y = y0; y < y0 + h; y += CELL) for (let x = x0; x < x1; x += CELL) if (y >= T && y < H - T) L.grid[(y >> 2) * GW + (x >> 2)] = BRIDGE;
    if (hx0 >= 0) {
      L.solids.push([hx0 - 6, y0 - 10, hx1 - hx0 + 16, 8]);
      L.solids.push([hx0 - 6, y0 + h - 2, hx1 - hx0 + 16, 8]);
    }
    L.bridges.push({ type, x0, x1, y0, h });
  }

  // A prop is anything that stands on the floor. Solid ones become invisible stone blocks.
  function prop(L, x, y, r, box, draw, onRails = false) {
    x = snap(x); y = snap(y);
    if (x - r * 0.6 < T || x + r * 0.6 > W - T || y < T + 8 || y > H - T) return false;
    const pts = [[0, 0], [r, 0], [-r, 0], [0, -r * 0.5], [0, r * 0.4], [r * 0.7, -r * 0.4], [-r * 0.7, -r * 0.4]];
    for (const [dx, dy] of pts) {
      if (inClear(L, x + dx, y + dy)) return false;
      if (cellAt(L, x + dx, y + dy) !== FLOOR) return false;
    }
    // Far enough apart that neighbours don't pile onto each other.
    for (const q of L.props) if (Math.hypot(q.x - x, (q.y - y) * 1.3) < (q.r + r) * 1.25) return false;
    if (!onRails) for (const [kx, ky, kr] of L.keep) if (Math.hypot(kx - x, ky - y) < kr + r * 0.8) return false;
    L.props.push({ x, y, r, draw });
    if (box) L.solids.push([x + box[0], y + box[1], box[2], box[3]]);
    return true;
  }
  // Try a few nearby spots before giving up on a prop.
  function propNear(L, x, y, r, box, draw, tries = 8) {
    if (prop(L, x, y, r, box, draw)) return true;
    for (let i = 0; i < tries; i += 1) {
      const a = L.rng() * Math.PI * 2, d = 20 + L.rng() * 50;
      if (prop(L, x + Math.cos(a) * d, y + Math.sin(a) * d, r, box, draw)) return true;
    }
    return false;
  }

  /* prop helpers: each places one kind of thing with its collision box */
  const big = true;
  const add = {
    oak: (L, x, y, r, fruit) => propNear(L, x, y, r * 0.9, [-10, -14, 20, 16], (g, rng) => oakTree(g, rng, x, y, r, fruit ? { fruit: "#e8443a" } : {})),
    willow: (L, x, y, r) => propNear(L, x, y, r * 1.1, [-12, -16, 24, 18], (g, rng) => willowTree(g, rng, x, y, r)),
    pine: (L, x, y, s, snowy = true) => propNear(L, x, y, 18 * s, [-8, -10, 16, 12], (g) => pineTree(g, x, y, s, snowy)),
    rocks: (L, x, y, size, pal, gems, moss) => propNear(L, x, y, size * 1.05, [-size * 0.8, -size * 0.45, size * 1.6, size * 0.75], (g, rng) => rockCluster(g, rng, x, y, size, pal, gems, moss), 4),
    stone: (L, x, y, r, pal, moss) => propNear(L, x, y, r + 4, [-r, -r * 0.5, r * 2, r * 0.9], (g, rng) => boulder(g, rng, x, y, r, pal, moss)),
    statue: (L, x, y, flip, large) => prop(L, x, y, large ? 34 : 18, large ? [-28, -28, 56, 28] : [-14, -14, 28, 14], (g) => stamp(g, S.statue, L.statuePal || S.statuePal, x, y, flip, large)),
    dragon: (L, x, y) => prop(L, x, y, 34, [-34, -22, 56, 22], (g) => stamp(g, S.dragonStatue, S.statuePal, x, y, false, big)),
    brazier: (L, x, y) => propNear(L, x, y, 14, [-10, -14, 20, 14], (g) => stamp(g, S.brazier, S.brazierPal, x, y, false, big)),
    cart: (L, x, y) => prop(L, x, y, 46, [-46, -40, 92, 36], (g) => stamp(g, S.oreCart, S.oreCartPal, x, y, false, big), true),
    barrel: (L, x, y) => propNear(L, x, y, 16, [-14, -28, 28, 26], (g) => stamp(g, S.barrel, S.barrelPal, x, y, false, big)),
    pyramid: (L, x, y, half, h) => prop(L, x, y, half * 0.95, [-half * 0.85, -h * 0.42, half * 1.7, h * 0.42], (g) => pyramid(g, x, y, half, h)),
    crystals: (L, x, y, s, pal) => propNear(L, x, y, 24 * s, [-18 * s, -16, 36 * s, 16], (g, rng) => crystalCluster(g, rng, x, y, s, pal), 5),
    cactus: (L, x, y) => propNear(L, x, y, 16, [-8, -16, 16, 16], (g) => stamp(g, S.cactus, S.cactusPal, x, y, false, big)),
    palm: (L, x, y, flip) => propNear(L, x, y, 18, [-8, -12, 16, 12], (g) => stamp(g, S.palm, S.palmPal, x, y, flip, big)),
    deadTree: (L, x, y, flip, pal) => propNear(L, x, y, 22, [-10, -14, 20, 14], (g) => stamp(g, S.deadTree, pal || S.deadTreePal, x, y, flip, big)),
    snowman: (L, x, y) => propNear(L, x, y, 20, [-18, -24, 36, 24], (g) => stamp(g, S.snowman, S.snowmanPal, x, y, false, big)),
    iceRock: (L, x, y) => propNear(L, x, y, 18, [-18, -22, 36, 20], (g) => stamp(g, S.iceRock, S.iceRockPal, x, y, false, big)),
    stump: (L, x, y) => propNear(L, x, y, 16, [-14, -20, 28, 18], (g) => stamp(g, S.stump, S.stumpPal, x, y, false, big)),
    log: (L, x, y) => propNear(L, x, y, 30, [-30, -16, 60, 14], (g) => stamp(g, S.log, S.stumpPal, x, y, false, big)),
    column: (L, x, y, h) => propNear(L, x, y, 26, [-22, -16, 44, 16], (g, rng) => ruinColumn(g, rng, x, y, h)),
    fallen: (L, x, y) => propNear(L, x, y, 44, [-44, -22, 92, 22], (g, rng) => fallenColumn(g, rng, x, y)),
    grave: (L, x, y, kind) => prop(L, x, y, 14, [-12, -10, 24, 10], (g, rng) => gravestone(g, rng, x, y, kind)),
    mushroomTree: (L, x, y, s, cap, dark) => propNear(L, x, y, 20 * s, [-8 * s, -12, 16 * s, 12], (g, rng) => giantMushroom(g, rng, x, y, s, cap, dark)),
    stalagmite: (L, x, y, h, pal) => propNear(L, x, y, 14, [-10, -12, 20, 12], (g) => stalagmite(g, x, y, h, pal)),
    sandColumn: (L, x, y, h) => propNear(L, x, y, 20, [0, -16, 32, 16], (g) => brokenColumnSand(g, x, y, h))
  };

  /* ---------- painting the terrain kinds ---------- */
  // Distance (in cells) from every cell to the nearest cell of a kind, or, inside, to the nearest cell that isn't.
  function distField(L, kind, inside) {
    const d = new Uint8Array(GW * GH), g = L.grid;
    for (let i = 0; i < d.length; i += 1) d[i] = (g[i] === kind) === !inside ? 0 : 99;
    for (let y = 0; y < GH; y += 1) for (let x = 0; x < GW; x += 1) {
      const i = y * GW + x; let v = d[i];
      if (x > 0 && d[i - 1] + 1 < v) v = d[i - 1] + 1;
      if (y > 0 && d[i - GW] + 1 < v) v = d[i - GW] + 1;
      d[i] = v;
    }
    for (let y = GH - 1; y >= 0; y -= 1) for (let x = GW - 1; x >= 0; x -= 1) {
      const i = y * GW + x; let v = d[i];
      if (x < GW - 1 && d[i + 1] + 1 < v) v = d[i + 1] + 1;
      if (y < GH - 1 && d[i + GW] + 1 < v) v = d[i + GW] + 1;
      d[i] = v;
    }
    return d;
  }
  function fields(L, kind) {
    L.fields = L.fields || {};
    if (!L.fields[kind]) L.fields[kind] = { out: distField(L, kind, false), in: distField(L, kind, true) };
    return L.fields[kind];
  }
  // A band of cells just outside a kind, up to width cells away.
  function gRing(g, L, kind, width, color) {
    const d = fields(L, kind).out;
    g.fillStyle = color;
    for (let cy = T / CELL; cy < (H - T) / CELL; cy += 1) for (let cx = T / CELL; cx < (W - T) / CELL; cx += 1) {
      const v = d[cy * GW + cx];
      if (v > 0 && v <= width) g.fillRect(cx * CELL, cy * CELL, CELL, CELL);
    }
  }
  // Fill a kind, with style(x, y, depth) picking each cell's colour (depth 0 = the edge).
  function gFill(g, L, kind, style) {
    const d = fields(L, kind).in;
    for (let cy = 0; cy < GH; cy += 1) for (let cx = 0; cx < GW; cx += 1) {
      const v = d[cy * GW + cx];
      if (v === 0) continue;
      const col = style(cx * CELL, cy * CELL, Math.min(4, v - 1));
      if (col) { g.fillStyle = col; g.fillRect(cx * CELL, cy * CELL, CELL, CELL); }
    }
  }
  // The cliff face along the top edge inside a kind.
  function gFace(g, L, kind, cells, colorAt) {
    const grid = L.grid;
    for (let cy = 1; cy < GH; cy += 1) for (let cx = 0; cx < GW; cx += 1) {
      if (grid[cy * GW + cx] !== kind) continue;
      for (let j = 1; j <= cells && cy - j >= 0; j += 1) {
        if (grid[(cy - j) * GW + cx] !== kind) { const col = colorAt(j, cx * CELL, cy * CELL); if (col) { g.fillStyle = col; g.fillRect(cx * CELL, cy * CELL, CELL, CELL); } break; }
      }
    }
  }
  // A thin dark line around a kind.
  function gOutline(g, L, kind, color) {
    const grid = L.grid;
    g.fillStyle = color;
    for (let cy = 1; cy < GH - 1; cy += 1) for (let cx = 1; cx < GW - 1; cx += 1) {
      const i = cy * GW + cx;
      if (grid[i] === kind) continue;
      const x = cx * CELL, y = cy * CELL;
      if (grid[i - 1] === kind) g.fillRect(x, y, 2, CELL);
      if (grid[i + 1] === kind) g.fillRect(x + 2, y, 2, CELL);
      if (grid[i - GW] === kind) g.fillRect(x, y, CELL, 2);
      if (grid[i + GW] === kind) g.fillRect(x, y + 2, CELL, 2);
    }
  }

  const inKind = (L, kind) => (x, y) => cellAt(L, x, y) === kind;
  const inHazard = (L) => (x, y) => isHazard(cellAt(L, x, y));

  function paintWater(g, L, c, rng) {
    const m = inKind(L, WATER);
    gRing(g, L, WATER, 3, c.bank);
    gRing(g, L, WATER, 1, c.rim);
    gFill(g, L, WATER, (x, y, d) => (d === 0 ? c.edge : d === 1 ? c.shallow : d < 4 ? c.mid : c.deep));
    gFace(g, L, WATER, 3, (j) => (j === 1 ? c.face1 : j === 2 ? c.face2 : c.mid));
    gOutline(g, L, WATER, c.outline);
    g.fillStyle = c.shine;
    for (let i = 0; i < 70; i += 1) {
      const x = snap(T + rng() * (W - 2 * T)), y = snap(T + rng() * (H - 2 * T));
      if (m(x, y) && m(x + 14, y + 6) && m(x, y - 8)) { g.fillRect(x, y, 12, 2); g.fillRect(x + 4, y + 4, 6, 2); }
    }
  }
  function paintLava(g, L, rng) {
    const m = inKind(L, LAVA);
    gRing(g, L, LAVA, 5, "rgba(255,90,20,0.10)");
    gRing(g, L, LAVA, 3, "#5a2010");
    gRing(g, L, LAVA, 1, "#1a0e0a");
    gFill(g, L, LAVA, (x, y, d) => {
      if (d === 0) return "#c8401c";
      const flow = Math.sin(y * 0.09 + Math.sin(x * 0.07) * 2.2) + Math.sin(y * 0.031 - x * 0.05) * 0.6;
      if (d >= 2 && flow > 1.25) return "#ffd166";
      if (d >= 2 && flow > 0.95) return "#ffb347";
      if (flow < -1.3) return "#8a2a12";
      return d === 1 ? "#e8501c" : "#ff7a2e";
    });
    gFace(g, L, LAVA, 3, (j) => (j === 1 ? "#4a2a22" : j === 2 ? "#2e1a14" : "#7a2a10"));
    gOutline(g, L, LAVA, "#140806");
    for (let i = 0; i < 40; i += 1) {
      const x = snap(T + rng() * (W - 2 * T)), y = snap(T + rng() * (H - 2 * T));
      if (!m(x, y) || !m(x + 8, y + 8) || !m(x, y - 12)) continue;
      g.fillStyle = "#ffd166"; g.fillRect(x, y, 6, 6); g.fillStyle = "#c8401c"; g.fillRect(x + 2, y + 2, 2, 2); g.fillStyle = "#ffffff"; g.fillRect(x, y, 2, 2);
    }
  }
  function paintChasm(g, L, c, rng) {
    const m = inKind(L, CHASM);
    gRing(g, L, CHASM, 2, c.ring);
    gFill(g, L, CHASM, (x, y, d) => (d === 0 ? c.d0 : d === 1 ? c.d1 : c.d2));
    gFace(g, L, CHASM, 9, (j, x) => ((x / 4 + j) % 7 === 0 && j < 8 ? c.glint : c.bands[j - 1]));
    gOutline(g, L, CHASM, c.outline);
    for (let i = 0; i < 160; i += 1) {
      const x = snap(T + rng() * (W - 2 * T)), y = snap(T + rng() * (H - 2 * T));
      if (m(x, y) && m(x, y - 40)) { g.fillStyle = rng() < 0.7 ? c.star : "#ffffff"; g.fillRect(x, y, 2, 2); }
    }
  }
  function paintIce(g, L, c, rng) {
    const m = inKind(L, ICE);
    gRing(g, L, ICE, 2, c.lip);
    gRing(g, L, ICE, 1, c.rim);
    gFill(g, L, ICE, (x, y, d) => {
      if (d === 0) return "#f4fbff";
      const streak = (x + y * 0.6) % 150;
      if (streak < 6 && d > 2 && Math.sin(y * 0.05 + x * 0.01) > 0.2) return "#e8fbff";
      return d < 3 ? c.shallow : c.deep;
    });
    gFace(g, L, ICE, 2, (j) => (j === 1 ? "#ffffff" : c.face));
    gOutline(g, L, ICE, c.outline);
    for (let i = 0; i < 10; i += 1) {
      let x = snap(T + rng() * (W - 2 * T)), y = snap(T + rng() * (H - 2 * T));
      if (!m(x, y) || !m(x + 30, y)) continue;
      g.fillStyle = "#ffffff";
      for (let s = 0; s < 14; s += 1) { g.fillRect(x, y, 2, 2); x += 2 + (s % 3 === 0 ? 2 : 0); y += s % 2 ? 2 : -2; }
    }
    for (let i = 0; i < 12; i += 1) {
      const x = snap(T + rng() * (W - 2 * T)), y = snap(T + rng() * (H - 2 * T));
      if (m(x, y) && m(x + 20, y) && m(x - 10, y) && rng() < 0.6) stamp(g, S.fish, S.fishPal, x, y, rng() < 0.5);
    }
  }
  function paintQuick(g, L) {
    const m = inKind(L, QUICK);
    gRing(g, L, QUICK, 2, "#a8844a");
    gFill(g, L, QUICK, (x, y, d) => {
      let best = L.pits[0], bd = 1e9;
      for (const p of L.pits) { const dd = (x - p.x) ** 2 + (y - p.y) ** 2; if (dd < bd) { bd = dd; best = p; } }
      const dx = x - best.x, dy = (y - best.y) * 1.45, a = Math.atan2(dy, dx), r = Math.hypot(dx, dy);
      const swirl = Math.sin(a * 3 + r * 0.09);
      if (d >= 4 && r < 14) return "#5a4020";
      return swirl > 0.55 ? "#8a6a38" : swirl < -0.6 ? "#c49a58" : "#a8844a";
    });
    gFace(g, L, QUICK, 2, (j) => (j === 1 ? "#8a6a38" : "#6a5028"));
    gOutline(g, L, QUICK, "#6a5028");
  }
  function paintSnow(g, L) {
    const m = inKind(L, SNOW);
    gRing(g, L, SNOW, 1, "rgba(80,120,150,0.18)");
    gFill(g, L, SNOW, (x, y, d) => {
      const up = m(x, y - 12), down = m(x, y + 12);
      if (!down) return "#cfe2ec";
      if (!up) return d === 0 ? "#ffffff" : "#f8fdff";
      return d === 0 ? "#e2eff5" : "#f4fbff";
    });
    gOutline(g, L, SNOW, "#9cc0d0");
  }

  function paintBridges(g, L) {
    for (const b of L.bridges) {
      if (b.type === "stone") archBridge(g, b.x0, b.x1, b.y0, b.h, inHazard(L));
      else ropeBridge(g, b.x0, b.x1, b.y0 + 4, b.h - 8);
    }
  }

  /* ---------- floors and walls ---------- */
  function noiseFloor(g, rng, base, dots, n = 2600) {
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < n; i += 1) {
      g.fillStyle = dots[Math.floor(rng() * dots.length)];
      g.fillRect(snap(rng() * W), snap(rng() * H), 2 + 2 * Math.floor(rng() * 2), 2);
    }
  }
  function tileFloor(g, rng, size, a, b, line, crackChance) {
    g.fillStyle = line; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += size) for (let x = 0; x < W; x += size) {
      g.fillStyle = (x / size + y / size) % 2 ? a : b; g.fillRect(x + 2, y + 2, size - 4, size - 4);
      g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(x + 2, y + 2, size - 4, 2); g.fillRect(x + 2, y + 2, 2, size - 4);
      g.fillStyle = "rgba(0,0,0,0.14)"; g.fillRect(x + 2, y + size - 4, size - 4, 2); g.fillRect(x + size - 4, y + 2, 2, size - 4);
      if (rng() < crackChance) { g.fillStyle = "rgba(0,0,0,0.25)"; let cx = x + 6, cy = y + 6; for (let i = 0; i < 8; i += 1) { g.fillRect(cx, cy, 2, 2); cx += 2; cy += rng() < 0.5 ? 2 : 0; } }
    }
  }
  function cobbleFloor(g, rng, cols, gap) {
    g.fillStyle = gap; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 16) for (let x = (y / 16) % 2 ? -8 : 0; x < W; x += 16) {
      g.fillStyle = cols[Math.floor(rng() * cols.length)];
      g.fillRect(x + 2, y + 2, 12, 12);
      g.fillStyle = "rgba(255,255,255,0.07)"; g.fillRect(x + 2, y + 2, 12, 2);
      g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(x + 2, y + 12, 12, 2);
    }
  }
  function hedgeWall(g, rng, dark, mid, light, berry) {
    g.fillStyle = dark;
    g.fillRect(0, 0, W, T); g.fillRect(0, H - T, W, T); g.fillRect(0, 0, T, H); g.fillRect(W - T, 0, T, H);
    for (let x = -10; x < W + 20; x += 26) { bush(g, x, 14, 18, dark, mid, light); bush(g, x + 10, H - 12, 16, dark, mid, light); }
    for (let y = 0; y < H + 20; y += 26) { bush(g, 12, y, 16, dark, mid, light); bush(g, W - 12, y + 10, 16, dark, mid, light); }
    for (let x = 30; x < W; x += 54) { g.fillStyle = pickColor(rng, berry); g.fillRect(x, 10 + (x % 3) * 4, 4, 4); g.fillRect(x + 20, H - 18, 4, 4); }
    edgeShadow(g);
  }
  function iceBlockWall(g) {
    g.fillStyle = "#9cc8dc"; g.fillRect(0, 0, W, T); g.fillRect(0, H - T, W, T); g.fillRect(0, 0, T, H); g.fillRect(W - T, 0, T, H);
    for (let x = 0; x < W; x += 32) for (const y of [0, H - T]) { g.fillStyle = "#c8ecff"; g.fillRect(x + 2, y + 2, 28, 28); g.fillStyle = "#ffffff"; g.fillRect(x + 4, y + 4, 10, 4); g.fillStyle = "#9cc8dc"; g.fillRect(x + 2, y + 24, 28, 6); }
    for (let y = 0; y < H; y += 32) for (const x of [0, W - T]) { g.fillStyle = "#c8ecff"; g.fillRect(x + 2, y + 2, 28, 28); g.fillStyle = "#ffffff"; g.fillRect(x + 4, y + 4, 10, 4); g.fillStyle = "#9cc8dc"; g.fillRect(x + 2, y + 24, 28, 6); }
    edgeShadow(g);
    g.fillStyle = "#e8fbff";
    for (let x = 44; x < W - 40; x += 22 + (x % 3) * 6) { const h = 8 + (x % 5) * 3; for (let r = 0; r < h; r += 2) g.fillRect(x + Math.floor((r / h) * 3), T + r, 6 - Math.floor((r / h) * 6) + 2, 2); }
  }
  function wallCracks(g, glow) {
    const crack = (x, y, n, dx, dy) => { for (let i = 0; i < n; i += 1) { g.fillStyle = i % 3 ? glow[0] : glow[1]; g.fillRect(x, y, 2, 2); x += dx; y += i % 2 ? dy : 0; } };
    for (let x = 40; x < W; x += 90) { crack(x, 4, 12, 2, 2); crack(x + 30, H - 28, 10, 2, -2); }
    for (let y = 60; y < H; y += 110) { crack(4, y, 10, 2, 2); crack(W - 28, y + 40, 10, 2, 2); }
  }
  function snowCaps(g, rng) {
    for (let x = 0; x < W; x += 6) { const h = 4 + Math.floor(rng() * 3) * 2; g.fillStyle = "#ffffff"; g.fillRect(x, 0, 6, h); g.fillStyle = "#d6eef8"; g.fillRect(x, h, 6, 2); }
    for (let y = 0; y < H; y += 6) { g.fillStyle = "#ffffff"; g.fillRect(0, y, 6, 6); g.fillRect(W - 6, y, 6, 6); }
  }

  // Little things scattered on the floor, only where the ground is plain floor.
  function scatter(g, L, rng, n, fn) {
    for (let i = 0; i < n; i += 1) {
      const x = snap(T + 8 + rng() * (W - 2 * T - 16)), y = snap(T + 8 + rng() * (H - 2 * T - 16));
      if (cellAt(L, x, y) !== FLOOR || nearCamp(L, x, y)) continue;
      // Keep small details out from under tree canopies and off big props.
      if (L.props.some((q) => Math.abs(x - q.x) < q.r + 12 && y > q.y - q.r * 3.6 && y < q.y + 14)) continue;
      fn(x, y, rng);
    }
  }
  const PAL = {
    rock: { k: "#1e1e22", T: "#b8b8bc", H: "#d4d4d8", L: "#9a9aa0", M: "#74747c", D: "#4e4e56" },
    mine: { k: "#141416", T: "#8a8a92", H: "#9a9aa2", L: "#74747c", M: "#5a5a62", D: "#3e3e46" },
    volcano: { k: "#0e0806", T: "#6e4a40", H: "#7e5a4e", L: "#5a3a32", M: "#442822", D: "#2a1814" },
    sandstone: { k: "#4a3418", T: "#e6c88a", H: "#f2d896", L: "#d6b06a", M: "#b8925a", D: "#8a6a38" },
    purple: { k: "#0a0618", T: "#5a4a8a", H: "#6e5ea0", L: "#4a3a78", M: "#3a2c66", D: "#241a48" },
    ruin: { k: "#141a12", T: "#8a9080", H: "#a0a894", L: "#747a6c", M: "#5a6054", D: "#40463c" },
    tomb: { k: "#0c0a14", T: "#5e5872", H: "#706a86", L: "#4e4862", M: "#3c374e", D: "#2a2638" },
    grotto: { k: "#061416", T: "#3a6a70", H: "#4a7e84", L: "#2e5a60", M: "#22484e", D: "#16343a" },
    snowrock: { k: "#2a3440", T: "#ffffff", H: "#ffffff", L: "#a8b4c0", M: "#7a8a9a", D: "#5a6a7a" }
  };
  const WATERS = {
    pond: { bank: "#6a5530", rim: "#a08a58", edge: "#8ad0f0", shallow: "#4aa6dc", mid: "#3d8fd0", deep: "#2f74b4", face1: "#6a5530", face2: "#4e3e22", outline: "#3a2c16", shine: "#c8ecff" },
    swamp: { bank: "#3a4a28", rim: "#5a6a3a", edge: "#7aa070", shallow: "#4a6e48", mid: "#3e5e40", deep: "#2e4a34", face1: "#3a4a28", face2: "#2a3420", outline: "#1a2214", shine: "#9ac090" },
    oasis: { bank: "#6aa048", rim: "#8ac060", edge: "#8ad0f0", shallow: "#4aa6dc", mid: "#3d8fd0", deep: "#2f74b4", face1: "#8a6a38", face2: "#5a8a3a", outline: "#3a5a28", shine: "#c8ecff" },
    glow: { bank: "#16343a", rim: "#3de0c0", edge: "#a8fff0", shallow: "#3de0c0", mid: "#1e9a90", deep: "#0e5a5a", face1: "#16343a", face2: "#0e2428", outline: "#061416", shine: "#e8fffa" },
    puddle: { bank: "#4a4a50", rim: "#5a5a62", edge: "#6a8aa0", shallow: "#3a5a70", mid: "#2a4a60", deep: "#223a50", face1: "#3a3a40", face2: "#2a2a30", outline: "#1a1a1e", shine: "#9ab8cc" }
  };
  const CHASMS = {
    crystal: { ring: "#2a2050", d0: "#2a1a4a", d1: "#160e2c", d2: "#0a0618", glint: "#8f6cff", bands: ["#5a4a8a", "#4a3a78", "#3a2c66", "#4a3a78", "#2e2256", "#3a2c66", "#241a48", "#1c1438", "#140e2a"], outline: "#120c24", star: "#d6c7ff" },
    tomb: { ring: "#26222f", d0: "#1e1a28", d1: "#120f1a", d2: "#07060c", glint: "#7a6aa0", bands: ["#4e4862", "#3c374e", "#4e4862", "#2a2638", "#3c374e", "#221e2e", "#1a1724", "#14121c", "#0e0c14"], outline: "#0c0a14", star: "#a89cc8" }
  };
  const ICES = {
    snow: { lip: "#ffffff", rim: "#b8d4de", shallow: "#a6dcef", deep: "#8cc8e2", face: "#c8e4ee", outline: "#7aa8bc" },
    cave: { lip: "#e8fbff", rim: "#7ab4cc", shallow: "#7ac4e4", deep: "#5aaad0", face: "#a8dcef", outline: "#3a7a9a" }
  };

  /* ---------- the ten areas ----------
     Every area has three room layouts: k = 0, 1, 2 is the room's place in its
     chapter. Room 3 of a chapter (k = 2) holds a sword boss, so it stays open
     with nothing splitting the room in two. Rivers and chasms only appear in the
     middle room (k = 1), and always have bridges. */

  function lilies(g, L, rng, n) {
    let frog = false, ducks = 0;
    for (let i = 0; i < n * 6 && n > 0; i += 1) {
      const x = snap(T + rng() * (W - 2 * T)), y = snap(T + rng() * (H - 2 * T));
      const deep = [[0, 0], [14, 0], [-14, 0], [0, 12], [0, -14]].every(([dx, dy]) => cellAt(L, x + dx, y + dy) === WATER);
      if (!deep) continue;
      n -= 1;
      if (ducks < 2 && rng() < 0.25) { stamp(g, S.duck, S.duckPal, x, y, rng() < 0.5); ducks += 1; continue; }
      lily(g, x, y, 6 + Math.floor(rng() * 3), rng() < 0.4);
      if (!frog && rng() < 0.4) { stamp(g, S.frog, S.frogPal, x, y - 2); frog = true; }
    }
  }
  function shoreReeds(g, L, rng, n) {
    for (let i = 0; i < 400 && n > 0; i += 1) {
      const x = snap(T + rng() * (W - 2 * T)), y = snap(T + rng() * (H - 2 * T));
      if (cellAt(L, x, y) !== FLOOR || cellAt(L, x, y - 10) !== WATER) continue;
      reeds(g, x, y + 4);
      n -= 1;
    }
  }
  // Mossy pebbles along the edge of a pond.
  function shoreStones(g, L, rng, n) {
    for (let i = 0; i < 500 && n > 0; i += 1) {
      const x = snap(T + rng() * (W - 2 * T)), y = snap(T + rng() * (H - 2 * T));
      if (cellAt(L, x, y) !== FLOOR || nearCamp(L, x, y)) continue;
      if (![[10, 0], [-10, 0], [0, 10], [0, -10]].some(([dx, dy]) => cellAt(L, x + dx, y + dy) === WATER)) continue;
      boulder(g, rng, x, y, 5 + rng() * 4, PAL.rock, ["#4f9a3e", "#6cc04f"]);
      n -= 1;
    }
  }
  function grassDetails(g, L, rng, flowers) {
    scatter(g, L, rng, 160, (x, y) => { g.fillStyle = "#3a7a33"; g.fillRect(x, y, 2, 4); g.fillRect(x + 4, y - 2, 2, 6); g.fillStyle = "#6cb85a"; g.fillRect(x + 2, y + 2, 2, 2); });
    for (let i = 0; i < flowers; i += 1) {
      const x = T + 40 + rng() * (W - 2 * T - 80), y = T + 40 + rng() * (H - 2 * T - 80);
      if (cellAt(L, x, y) !== FLOOR || nearCamp(L, x, y)) continue;
      flowerBedSafe(g, L, rng, x, y, 18 + Math.floor(rng() * 16), 90);
    }
    flowerBedSafe(g, L, rng, W / 2, H / 2, 60, W - 120);
    for (let i = 0; i < 3; i += 1) { const x = T + 60 + rng() * (W - 2 * T - 120), y = T + 60 + rng() * (H - 2 * T - 120); if (cellAt(L, x, y) === FLOOR && !nearCamp(L, x, y)) tallGrass(g, rng, x, y, 14); }
    scatter(g, L, rng, 5, (x, y) => stamp(g, S.mushroom, S.mushroomPal, x, y, false, big));
    scatter(g, L, rng, 4, (x, y) => { const c = pickColor(rng, ["#ff9ff3", "#ffd166", "#9be7ff"]); g.fillStyle = c; g.fillRect(x, y, 4, 4); g.fillRect(x + 6, y, 4, 4); g.fillStyle = "#2a2a2a"; g.fillRect(x + 4, y + 2, 2, 4); });
  }
  function flowerBedSafe(g, L, rng, cx, cy, n, spread) {
    // Same as a flower bed, but flowers never land in water or on the campfire.
    for (let i = 0; i < n; i += 1) {
      const x = snap(cx + (rng() - 0.5) * spread), y = snap(cy + (rng() - 0.5) * spread * 0.55);
      if (cellAt(L, x, y) !== FLOOR || cellAt(L, x, y - 6) !== FLOOR || nearCamp(L, x, y) || x < T + 4 || x > W - T - 8 || y < T + 8 || y > H - T - 4) continue;
      flowerBed(g, rng, x, y, 1, 0);
    }
  }
  // A dirt path from door to door. It is part of the grid, so nothing gets put on it.
  function markPath(L, bend) {
    for (let cy = T / CELL; cy < (H - T) / CELL; cy += 1) for (let cx = 0; cx < GW; cx += 1) {
      const x = cx * CELL + 2, y = cy * CELL + 2, i = cy * GW + cx;
      if (L.grid[i] === FLOOR && Math.abs(y - (H / 2 + Math.sin((x / W) * Math.PI) * bend)) < 20 && !nearCamp(L, x, y)) L.grid[i] = PATH;
    }
  }
  function dirtPath(g, L) {
    gRing(g, L, PATH, 1, "#5f8a44");
    gFill(g, L, PATH, (x, y, d) => (d === 0 ? "#7a6a40" : (x * 7 + y * 3) % 23 === 0 ? "#a08a58" : (x * 3 + y * 5) % 31 === 0 ? "#6a5a34" : "#8f7a4a"));
  }
  const glowPal = (g, L, rng, n, color) => scatter(g, L, rng, n, (x, y) => { g.fillStyle = color; g.fillRect(x, y, 2, 2); });

  const KITS = [];

  // 0 Grass Vault: ponds, a weeping willow, apple trees, flowers.
  KITS[0] = {
    door: "#8f7a4a",
    water: WATERS.pond,
    build(L, k) {
      if (k === 0) {
        shape(L, WATER, wob(any(ell(530, 190, 130, 72), ell(630, 232, 74, 52)), 1.3, 10));
        markPath(L, 70);
        add.willow(L, 800, 190, 48);
        add.oak(L, 880, 500, 30); add.oak(L, 880, 580, 26, true); add.oak(L, 140, 560, 30, true); add.oak(L, 580, 480, 32); add.oak(L, 420, 120, 24);
      } else if (k === 1) {
        shape(L, WATER, wob(any(ell(300, 180, 110, 60), ell(390, 214, 60, 40)), 0.4, 9));
        shape(L, WATER, wob(any(ell(640, 470, 116, 60), ell(560, 500, 60, 36)), 2.2, 9));
        markPath(L, -60);
        add.willow(L, 490, 180, 46);
        add.oak(L, 860, 150, 36, true); add.oak(L, 130, 540, 34); add.oak(L, 690, 150, 28); add.oak(L, 330, 470, 28, true);
      } else {
        shape(L, WATER, wob(ell(170, 150, 90, 52), 3.1, 8));
        markPath(L, 70);
        add.willow(L, 300, 190, 40);
        add.oak(L, 860, 150, 36, true); add.oak(L, 870, 560, 32); add.oak(L, 140, 560, 30, true); add.oak(L, 520, 110, 26);
      }
      add.stump(L, 200 + L.rng() * 500, 440 + L.rng() * 80); add.log(L, 620 + L.rng() * 100, 300 + L.rng() * 180);
      for (let i = 0; i < 3; i += 1) add.stone(L, T + 80 + L.rng() * 760, T + 80 + L.rng() * 450, 10 + L.rng() * 4, PAL.rock, ["#4f9a3e", "#6cc04f"]);
    },
    floor(g, L, rng) { noiseFloor(g, rng, "#4e8c45", ["#46803e", "#5a9a4c", "#438039", "#5fa552"]); dirtPath(g, L); },
    details(g, L, rng) {
      grassDetails(g, L, rng, 5);
      shoreReeds(g, L, rng, 5);
      lilies(g, L, rng, 6);
      shoreStones(g, L, rng, 12);
    },
    walls(g, L, rng) { hedgeWall(g, rng, "#1f4a22", "#2f6a2e", "#4f9a3e", ["#e8443a", "#ffffff", "#ff9ff3"]); }
  };

  // 5 Mossy Ruin: a swamp, broken temple columns, mushrooms.
  KITS[5] = {
    door: "#4a5a3a",
    water: WATERS.swamp,
    build(L, k) {
      if (k === 0) {
        shape(L, WATER, wob(any(ell(380, 200, 120, 66), ell(480, 236, 70, 44)), 0.9, 10));
        add.column(L, 620, 190, 56); add.column(L, 720, 180, 40); add.column(L, 620, 470, 44); add.column(L, 780, 480, 60);
        add.fallen(L, 300, 480); add.willow(L, 230, 170, 40); add.oak(L, 860, 560, 28, false);
      } else if (k === 1) {
        shape(L, WATER, wob(ell(250, 470, 100, 54), 1.7, 8));
        shape(L, WATER, wob(ell(660, 170, 110, 58), 2.6, 8));
        add.column(L, 400, 260, 50); add.column(L, 560, 260, 34); add.column(L, 400, 420, 40); add.column(L, 560, 420, 56);
        add.willow(L, 830, 500, 42); add.fallen(L, 200, 150);
      } else {
        shape(L, WATER, wob(ell(200, 500, 90, 48), 0.3, 8));
        add.column(L, 120, 150, 50); add.column(L, 440, 120, 36); add.column(L, 840, 330 + 170, 46);
        add.fallen(L, 600, 520); add.willow(L, 360, 520, 36);
      }
      for (let i = 0; i < 3; i += 1) add.stone(L, T + 80 + L.rng() * 760, T + 80 + L.rng() * 450, 10 + L.rng() * 5, PAL.ruin, ["#4f8a3a", "#6cb04a"]);
      add.stump(L, 200 + L.rng() * 500, 300 + L.rng() * 200);
    },
    floor(g, L, rng) {
      noiseFloor(g, rng, "#415d38", ["#3a5432", "#4a6a40", "#364e2e", "#52744a"]);
      // Patches of old temple floor poking through the moss.
      for (let i = 0; i < 9; i += 1) {
        const px = snap(T + rng() * (W - 2 * T - 120)), py = snap(T + rng() * (H - 2 * T - 90));
        const cols = 2 + Math.floor(rng() * 3), rows = 1 + Math.floor(rng() * 3);
        for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
          if (rng() < 0.25) continue;
          const x = px + c * 34, y = py + r * 30;
          g.fillStyle = "#2e3a2a"; g.fillRect(x, y, 32, 28);
          g.fillStyle = rng() < 0.5 ? "#6a7064" : "#5e665a"; g.fillRect(x + 2, y + 2, 28, 24);
          g.fillStyle = "#7e8676"; g.fillRect(x + 2, y + 2, 28, 2);
          g.fillStyle = "#4f8a3a"; g.fillRect(x + 2 + Math.floor(rng() * 20), y + 20, 8, 4);
        }
      }
    },
    details(g, L, rng) {
      scatter(g, L, rng, 120, (x, y) => { g.fillStyle = "#2f4a28"; g.fillRect(x, y, 2, 4); g.fillRect(x + 4, y - 2, 2, 6); g.fillStyle = "#5a8a44"; g.fillRect(x + 2, y + 2, 2, 2); });
      scatter(g, L, rng, 10, (x, y) => stamp(g, S.mushroom, S.mushroomPal, x, y, false, big));
      scatter(g, L, rng, 6, (x, y) => mushroomGlow(g, x, y));
      for (let i = 0; i < 2; i += 1) { const x = T + 60 + rng() * (W - 2 * T - 120), y = T + 60 + rng() * (H - 2 * T - 120); if (cellAt(L, x, y) === FLOOR && !nearCamp(L, x, y)) tallGrass(g, rng, x, y, 12); }
      shoreReeds(g, L, rng, 8);
      lilies(g, L, rng, 7);
    },
    walls(g, L, rng) {
      boulderWall(g, rng, PAL.ruin, () => { for (let i = 0; i < 90; i += 1) { g.fillStyle = rng() < 0.5 ? "#4f8a3a" : "#6cb04a"; const side = rng(); const x = side < 0.5 ? snap(rng() * W) : side < 0.75 ? snap(rng() * 24) : snap(W - 24 + rng() * 20); const y = side < 0.5 ? (rng() < 0.5 ? snap(rng() * 20) : snap(H - 24 + rng() * 20)) : snap(rng() * H); g.fillRect(x, y, 6, 2); } });
    }
  };

  // 1 Stone Mine: rock mountains with gems, minecart tracks, ore carts.
  const ORE = ["#f6c85f", "#7ee7f0", "#ff6b9a"];
  KITS[1] = {
    door: "#5e5e64",
    water: WATERS.puddle,
    build(L, k) {
      let track;
      if (k === 0) {
        track = [[8, 520], [200, 520], [360, 500], [500, 460], [640, 452], [742, 392], [748, 300], [700, 210], [672, 120], [668, 8]];
        L.tunnels = [[0, 492, T, 56, false], [640, 0, 56, T, true]];
      } else if (k === 1) {
        track = [[8, 140], [180, 140], [330, 190], [440, 320], [560, 440], [700, 510], [820, 520], [952, 520]];
        L.tunnels = [[0, 112, T, 56, false], [W - T, 492, T, 56, false]];
      } else {
        track = [[8, 170], [952, 170]];
        L.tunnels = [[0, 142, T, 56, false], [W - T, 142, T, 56, false]];
      }
      L.rails = track;
      // Keep rocks off the rails: sample the track and mark it.
      for (let i = 0; i < track.length - 1; i += 1) {
        const [x0, y0] = track[i], [x1, y1] = track[i + 1];
        const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 20);
        for (let s = 0; s <= n; s += 1) L.keep.push([x0 + ((x1 - x0) * s) / n, y0 + ((y1 - y0) * s) / n, 18]);
      }
      if (k === 0) {
        add.cart(L, 130, 538); add.cart(L, 560, 474);
        add.rocks(L, 520, 250, 78, PAL.rock, ORE); add.rocks(L, 330, 380, 54, PAL.rock, ORE); add.rocks(L, 850, 150, 48, PAL.rock, ORE);
        shape(L, WATER, wob(ell(160, 420, 30, 12), 1, 2)); shape(L, WATER, wob(ell(840, 310, 24, 10), 2, 2));
      } else if (k === 1) {
        add.cart(L, 110, 152); add.cart(L, 860, 532);
        add.rocks(L, 250, 450, 66, PAL.rock, ORE); add.rocks(L, 640, 240, 62, PAL.rock, ORE); add.rocks(L, 500, 560 - 30, 40, PAL.rock, ORE);
        shape(L, WATER, wob(ell(820, 300, 26, 11), 1, 2));
      } else {
        add.cart(L, 280, 184); add.cart(L, 700, 184);
        add.rocks(L, 160, 500, 58, PAL.rock, ORE); add.rocks(L, 800, 500, 58, PAL.rock, ORE);
        shape(L, WATER, wob(ell(480, 470, 30, 12), 1, 2));
      }
      for (let i = 0; i < 4; i += 1) add.barrel(L, T + 60 + L.rng() * 780, T + 60 + L.rng() * 460);
      for (let i = 0; i < 2; i += 1) add.stone(L, T + 80 + L.rng() * 760, T + 80 + L.rng() * 450, 10 + L.rng() * 6, PAL.rock);
    },
    floor(g, L, rng) {
      cobbleFloor(g, rng, ["#56565c", "#5e5e64", "#68686e"], "#3e3e42");
      scatter(g, L, rng, 140, (x, y) => { g.fillStyle = rng() < 0.5 ? "#2e2e32" : "#7a7a80"; g.fillRect(x, y, 2, 2); });
      scatter(g, L, rng, 14, (x, y) => { g.fillStyle = "rgba(0,0,0,0.3)"; for (let i = 0; i < 6; i += 1) g.fillRect(x + i * 2, y + (i % 2) * 2, 2, 2); });
    },
    details(g, L, rng) {
      railPath(g, L.rails);
      scatter(g, L, rng, 5, (x, y) => stamp(g, S.lantern, S.lanternPal, x, y, false, big));
      scatter(g, L, rng, 3, (x, y) => stamp(g, S.skull, S.skullPal, x, y));
      scatter(g, L, rng, 1, (x, y) => stamp(g, S.pickaxe, { k: "#1a1612", S: "#9aa0a8", b: "#7a5030" }, x, y, false, big));
      scatter(g, L, rng, 2, (x, y) => { for (let i = 0; i < 14; i += 1) { const gx = snap(x + rng() * 26), gy = snap(y - rng() * 12); g.fillStyle = "#a07818"; g.fillRect(gx, gy + 2, 6, 2); g.fillStyle = "#f6c85f"; g.fillRect(gx, gy, 6, 2); } });
    },
    walls(g, L, rng) {
      boulderWall(g, rng, PAL.mine, () => {
        for (let x = 100; x < W - 60; x += 220) { if (L.tunnels.some((t) => t[4] && Math.abs(t[0] - x) < 110)) continue; g.fillStyle = "#6a4a2a"; g.fillRect(x, 0, 10, T + 6); g.fillRect(x + 60, 0, 10, T + 6); g.fillStyle = "#8a6a3a"; g.fillRect(x, T - 6, 70, 8); }
      });
      for (const t of L.tunnels) tunnel(g, ...t);
    }
  };

  // 2 Lava Keep: lava pools and a lava river with stone bridges, statues, fire.
  KITS[2] = {
    door: "#462620",
    build(L, k) {
      L.statuePal = S.statuePal;
      if (k === 0) {
        shape(L, LAVA, wob(ell(480, 180, 150, 56), 1.1, 8));
        shape(L, LAVA, wob(ell(250, 480, 80, 42), 2, 6));
        shape(L, LAVA, wob(ell(720, 470, 90, 46), 3, 6));
        add.statue(L, 360, 360, false, big); add.statue(L, 600, 360, true, big);
        add.dragon(L, 480, 560 - 20);
      } else if (k === 1) {
        const river = (x, y) => Math.abs(x - (500 + Math.sin(y * 0.018) * 60)) < 44 + Math.sin(y * 0.05) * 6;
        shape(L, LAVA, river);
        shape(L, LAVA, wob(ell(200, 500, 70, 40), 2, 6));
        for (const by of [146, 416]) {
          const mid = by + 26, c = 500 + Math.sin(mid * 0.018) * 60, half = 44 + Math.sin(mid * 0.05) * 6;
          const x0 = snap(c - half - 34), x1 = snap(c + half + 34);
          addBridge(L, "stone", x0, x1, by, 56);
          if (by < 300) { add.statue(L, x0 - 56, by + 64, false, big); add.statue(L, x1 + 36, by + 56, true, false); }
          else { add.statue(L, x1 + 56, by + 64, true, big); add.statue(L, x0 - 36, by + 56, false, false); }
        }
        add.dragon(L, 150, 446);
      } else {
        shape(L, LAVA, wob(ell(180, 190, 76, 42), 1.5, 6));
        shape(L, LAVA, wob(ell(200, 500, 88, 44), 2.5, 6));
        shape(L, LAVA, wob(ell(760, 500, 80, 40), 0.5, 6));
        add.statue(L, 480, 130, false, big); add.statue(L, 380, 520, false, false); add.statue(L, 580, 520, true, false);
      }
      for (const [x, y] of [[110, 130], [860, 130], [860, 560], [110, 560]]) add.brazier(L, x, y);
      add.rocks(L, 300 + L.rng() * 360, 250 + L.rng() * 140, 36, PAL.volcano);
      add.rocks(L, 760, 300 + L.rng() * 60, 34, PAL.volcano);
    },
    floor(g, L, rng) {
      noiseFloor(g, rng, "#3a201a", ["#2e1814", "#462620", "#4e2a22"]);
      g.fillStyle = "rgba(0,0,0,0.25)";
      for (let y = T; y < H; y += 48) g.fillRect(T, y, W - 2 * T, 2);
      for (let y = T; y < H; y += 48) for (let x = T + ((y / 48) % 2) * 32; x < W; x += 64) g.fillRect(x, y, 2, 48);
      for (let i = 0; i < 30; i += 1) {
        let x = snap(T + rng() * (W - 2 * T)), y = snap(T + rng() * (H - 2 * T));
        for (let s = 0; s < 8; s += 1) { g.fillStyle = s % 3 ? "#c8401c" : "#ff7a2e"; g.fillRect(x, y, 2, 2); x += 2; y += rng() < 0.5 ? 2 : -2; }
      }
    },
    details(g, L, rng) {
      scatter(g, L, rng, 4, (x, y) => stamp(g, S.obsidian, S.obsidianPal, x, y));
      scatter(g, L, rng, 4, (x, y) => stamp(g, S.skull, S.skullPal, x, y, false, big));
      scatter(g, L, rng, 4, (x, y) => { g.fillStyle = "#e8e2cf"; g.fillRect(x, y + 2, 14, 3); g.fillRect(x - 2, y, 4, 7); g.fillRect(x + 12, y, 4, 7); });
    },
    walls(g, L, rng) { boulderWall(g, rng, PAL.volcano, () => wallCracks(g, ["#ff7a2e", "#ffd166"])); }
  };

  // 6 Snowy Pass: a frozen lake you slide on, pine trees, snowdrifts, a snowman.
  KITS[6] = {
    door: "#cfe2e8",
    ice: ICES.snow,
    build(L, k) {
      if (k === 0) {
        shape(L, ICE, wob(any(ell(560, 360, 170, 96), ell(470, 300, 90, 60)), 0.7, 12));
        for (const [x, y, s] of [[880, 150, 1.3], [820, 120, 1.0], [140, 560, 1.2], [210, 520, 1.0], [880, 560, 1.1], [460, 110, 1.0]]) add.pine(L, x, y, s);
        shape(L, SNOW, wob(ell(800, 190, 50, 22), 1, 4)); shape(L, SNOW, wob(ell(300, 510, 56, 24), 2, 4));
        add.snowman(L, 300, 430);
      } else if (k === 1) {
        shape(L, ICE, wob(any(ell(480, 330, 220, 120), ell(340, 270, 100, 64)), 0.7, 12));
        for (const [x, y, s] of [[150, 170, 1.5], [210, 130, 1.1], [100, 120, 0.9], [830, 440, 1.4], [880, 500, 1.0], [880, 190, 1.2], [640, 120, 0.9]]) add.pine(L, x, y, s);
        shape(L, SNOW, wob(ell(170, 540, 40, 18), 1, 4)); shape(L, SNOW, wob(ell(780, 160, 36, 16), 2, 4)); shape(L, SNOW, wob(ell(760, 550, 34, 16), 3, 4));
        add.snowman(L, 250, 490);
      } else {
        shape(L, ICE, wob(ell(180, 160, 90, 50), 1, 8)); shape(L, ICE, wob(ell(780, 500, 90, 50), 2, 8));
        for (const [x, y, s] of [[480, 110, 1.2], [860, 160, 1.3], [120, 540, 1.3], [620, 120, 0.9], [300, 560, 1.0]]) add.pine(L, x, y, s);
        shape(L, SNOW, wob(ell(480, 520, 50, 20), 1, 4));
        add.snowman(L, 700, 300 + 160);
      }
      for (let i = 0; i < 3; i += 1) add.iceRock(L, T + 80 + L.rng() * 760, T + 80 + L.rng() * 450);
    },
    floor(g, L, rng) { noiseFloor(g, rng, "#dfeef2", ["#cfe2e8", "#e8f6fa", "#d6e8ee", "#ffffff"]); },
    details(g, L, rng) {
      scatter(g, L, rng, 2, (x, y) => { for (let i = 0; i < 9; i += 1) { g.fillStyle = "#b8d4de"; g.fillRect(x + i * 22, y + (i % 2) * 8, 6, 4); } });
      scatter(g, L, rng, 40, (x, y) => { g.fillStyle = "#ffffff"; g.fillRect(x, y, 2, 2); g.fillRect(x - 2, y + 2, 6, 2); });
    },
    walls(g, L, rng) { boulderWall(g, rng, PAL.snowrock); }
  };

  // 3 Ice Cavern: big ice sheets, ice crystals, frozen fish.
  KITS[3] = {
    door: "#9cc8dc",
    ice: ICES.cave,
    build(L, k) {
      if (k === 0) {
        shape(L, ICE, wob(ell(350, 200, 140, 70), 1, 10)); shape(L, ICE, wob(ell(620, 460, 150, 70), 2, 10));
        add.crystals(L, 720, 180, 1.5, CRY.cyan); add.crystals(L, 230, 470, 1.3, CRY.cyan); add.crystals(L, 860, 540, 0.9, CRY.cyan);
      } else if (k === 1) {
        shape(L, ICE, wob(ell(480, 320, 240, 120), 0.4, 12));
        add.crystals(L, 160, 150, 1.4, CRY.cyan); add.crystals(L, 800, 520, 1.6, CRY.cyan); add.crystals(L, 820, 150, 1.0, CRY.cyan); add.crystals(L, 160, 520, 1.0, CRY.cyan);
      } else {
        shape(L, ICE, wob(ell(220, 480, 110, 56), 1.2, 10)); shape(L, ICE, wob(ell(560, 330, 90, 50), 2.4, 8));
        add.crystals(L, 150, 150, 1.3, CRY.cyan); add.crystals(L, 470, 120, 1.0, CRY.cyan); add.crystals(L, 820, 500, 1.4, CRY.cyan);
      }
      for (let i = 0; i < 3; i += 1) add.iceRock(L, T + 80 + L.rng() * 760, T + 80 + L.rng() * 450);
      shape(L, SNOW, wob(ell(T + 100 + L.rng() * 700, T + 100 + L.rng() * 400, 40, 18), 1, 4));
    },
    floor(g, L, rng) {
      tileFloor(g, rng, 32, "#c4e8f4", "#b6e0ee", "#8cc0d4", 0.25);
      scatter(g, L, rng, 60, (x, y) => { g.fillStyle = "#ffffff"; g.fillRect(x, y, 2, 2); });
    },
    details(g, L, rng) { scatter(g, L, rng, 6, (x, y) => { g.fillStyle = "#e8fbff"; g.fillRect(x, y - 8, 4, 10); g.fillStyle = "#7ac4e4"; g.fillRect(x + 4, y - 4, 2, 6); }); },
    walls(g, L, rng) { iceBlockWall(g); }
  };

  // 4 Sand Crypt: pyramids, quicksand, an oasis with palms, dead trees, cacti.
  KITS[4] = {
    door: "#b08c4a",
    water: WATERS.oasis,
    build(L, k) {
      const pit = (x, y, rx, ry) => { shape(L, QUICK, ell(x, y, rx, ry)); L.pits.push({ x, y }); };
      if (k === 0) {
        add.pyramid(L, 620, 230, 100, 136);
        pit(480, 450, 96, 64);
        shape(L, WATER, wob(ell(180, 520, 54, 30), 3, 4)); add.palm(L, 250, 516); add.palm(L, 110, 500, true);
        add.deadTree(L, 860, 500); add.deadTree(L, 300, 470, true); add.cactus(L, 860, 140); add.cactus(L, 300, 300);
      } else if (k === 1) {
        add.pyramid(L, 360, 250, 110, 150); add.pyramid(L, 820, 200, 64, 88);
        pit(600, 390, 96, 66);
        shape(L, WATER, wob(ell(150, 480, 54, 30), 3, 4)); add.palm(L, 220, 476); add.palm(L, 92, 456, true);
        add.deadTree(L, 570, 210); add.deadTree(L, 870, 440, true); add.deadTree(L, 760, 560);
        add.cactus(L, 680, 130); add.cactus(L, 480, 310); add.cactus(L, 140, 150);
      } else {
        add.pyramid(L, 800, 180, 60, 82);
        pit(300, 200, 62, 40); pit(650, 470, 62, 40);
        add.deadTree(L, 160, 500); add.deadTree(L, 480, 120, true); add.cactus(L, 860, 400); add.cactus(L, 140, 160); add.cactus(L, 420, 520);
      }
      add.sandColumn(L, 200 + L.rng() * 500, 300 + L.rng() * 200, 24 + L.rng() * 10);
    },
    floor(g, L, rng) {
      g.fillStyle = "#caa55d"; g.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
        const r = Math.sin(x * 0.03 + Math.sin(y * 0.02) * 2 + y * 0.06);
        if (r > 0.93) { g.fillStyle = "#b08c4a"; g.fillRect(x, y, 2, 2); } else if (r < -0.96) { g.fillStyle = "#dcb870"; g.fillRect(x, y, 2, 2); }
      }
      for (let i = 0; i < 200; i += 1) { g.fillStyle = rng() < 0.5 ? "#a8844a" : "#e6c88a"; g.fillRect(snap(T + rng() * (W - 2 * T)), snap(T + rng() * (H - 2 * T)), 2, 2); }
    },
    details(g, L, rng) {
      scatter(g, L, rng, 2, (x, y) => stamp(g, S.cowSkull, S.cowSkullPal, x, y, false, big));
      scatter(g, L, rng, 3, (x, y) => stamp(g, S.urn, S.urnPal, x, y, false, big));
      scatter(g, L, rng, 3, (x, y) => { g.fillStyle = "#e8e2cf"; g.fillRect(x, y + 2, 14, 3); g.fillRect(x - 2, y, 4, 7); g.fillRect(x + 12, y, 4, 7); });
    },
    walls(g, L, rng) {
      boulderWall(g, rng, PAL.sandstone, () => { for (let x = 80; x < W; x += 140) { g.fillStyle = "#6a5028"; g.fillRect(x, 8, 4, 14); g.fillRect(x + 8, 8, 8, 4); g.fillRect(x + 8, 16, 8, 4); g.fillRect(x + 20, 10, 6, 10); } });
    }
  };

  // 7 Moon Tomb: gravestones, open pits, dead trees, candles.
  const tombTree = { k: "#1a1624", b: "#4e4862", B: "#7a7490" };
  KITS[7] = {
    door: "#322c45",
    chasm: CHASMS.tomb,
    build(L, k) {
      L.statuePal = { k: "#0c0a14", L: "#8a86a0", H: "#b0acc6", M: "#6a6680", D: "#4a4660", S: "#5a5670", r: "#a8f0ff" };
      const graves = (x0, y0, cols, rows) => { for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) add.grave(L, x0 + c * 56 + (r % 2) * 20, y0 + r * 70, (r + c) % 3 === 0 ? 1 : 0); };
      if (k === 0) {
        shape(L, CHASM, wob(ell(480, 190, 110, 58), 1.5, 8));
        graves(270, 330, 3, 2); graves(560, 330, 3, 2);
        add.deadTree(L, 840, 160, false, tombTree); add.deadTree(L, 140, 540, true, tombTree);
        add.statue(L, 480, 560, false, big);
      } else if (k === 1) {
        const river = (x, y) => Math.abs(x - (480 + Math.sin(y * 0.02 + 1) * 50)) < 52 + Math.sin(y * 0.06) * 6;
        shape(L, CHASM, wob(river, 1, 6));
        for (const by of [140, 420]) {
          const mid = by + 24, c = 480 + Math.sin(mid * 0.02 + 1) * 50, half = 58;
          addBridge(L, "rope", snap(c - half - 40), snap(c + half + 40), by, 48);
        }
        graves(120, 130, 2, 1); graves(700, 130, 2, 1); graves(140, 470, 2, 1); graves(720, 470, 2, 1);
        add.deadTree(L, 300, 320 + 40, false, tombTree); add.statue(L, 680, 330, true, big);
      } else {
        shape(L, CHASM, wob(ell(200, 480, 72, 40), 2, 6));
        graves(380, 470, 4, 1); graves(120, 140, 2, 1);
        add.deadTree(L, 470, 150, false, tombTree); add.deadTree(L, 840, 500, true, tombTree);
        add.statue(L, 840, 330, true, false);
      }
    },
    floor(g, L, rng) {
      tileFloor(g, rng, 32, "#3b3550", "#342e48", "#221e30", 0.3);
      scatter(g, L, rng, 80, (x, y) => { g.fillStyle = rng() < 0.5 ? "#4a6a7a" : "#2a2638"; g.fillRect(x, y, 4, 2); });
    },
    details(g, L, rng) {
      scatter(g, L, rng, 10, (x, y) => candle(g, x, y));
      scatter(g, L, rng, 4, (x, y) => stamp(g, S.skull, S.skullPal, x, y));
      scatter(g, L, rng, 3, (x, y) => { g.fillStyle = "#1a1624"; g.fillRect(x - 14, y - 6, 28, 14); g.fillStyle = "#4a3a2a"; g.fillRect(x - 12, y - 4, 24, 10); g.fillStyle = "#6a5440"; g.fillRect(x + 14, y - 4, 8, 6); });
    },
    walls(g, L, rng) { boulderWall(g, rng, PAL.tomb, () => { for (let x = 60; x < W; x += 130) candle(g, x, T - 2); }); }
  };

  // 8 Glow Grotto: glowing pools, giant mushrooms, crystals, stalagmites.
  KITS[8] = {
    door: "#1d3d44",
    water: WATERS.glow,
    build(L, k) {
      if (k === 0) {
        shape(L, WATER, wob(ell(560, 200, 130, 62), 1, 8)); shape(L, WATER, wob(ell(320, 480, 90, 46), 2, 7));
        add.mushroomTree(L, 800, 520, 1.6, "#3de0c0", "#1e9a90"); add.mushroomTree(L, 760, 150, 1.3, "#ff7ac8", "#b83a8a");
        add.crystals(L, 160, 520, 1.0, CRY.cyan);
      } else if (k === 1) {
        shape(L, WATER, wob(ell(250, 200, 100, 54), 1, 8)); shape(L, WATER, wob(ell(700, 460, 120, 58), 2, 8));
        add.crystals(L, 420, 330, 1.2, CRY.cyan); add.crystals(L, 570, 330, 1.0, CRY.purple);
        add.mushroomTree(L, 820, 160, 1.5, "#3de0c0", "#1e9a90"); add.mushroomTree(L, 150, 520, 1.3, "#ff7ac8", "#b83a8a");
      } else {
        shape(L, WATER, wob(ell(180, 500, 80, 42), 1, 7));
        add.mushroomTree(L, 140, 160, 1.4, "#3de0c0", "#1e9a90"); add.mushroomTree(L, 840, 520, 1.5, "#ff7ac8", "#b83a8a");
        add.crystals(L, 480, 120, 1.0, CRY.cyan);
      }
      for (let i = 0; i < 4; i += 1) add.stalagmite(L, T + 80 + L.rng() * 760, T + 80 + L.rng() * 450, 22 + L.rng() * 16, PAL.grotto);
    },
    floor(g, L, rng) {
      noiseFloor(g, rng, "#244a52", ["#1d3d44", "#2a5660", "#1a3a40"]);
      tileless(g, rng);
    },
    details(g, L, rng) {
      glowPal(g, L, rng, 120, "#3de0c0");
      scatter(g, L, rng, 9, (x, y) => mushroomGlow(g, x, y));
    },
    walls(g, L, rng) { boulderWall(g, rng, PAL.grotto, () => { for (let i = 0; i < 60; i += 1) { g.fillStyle = "#3de0c0"; g.fillRect(snap(rng() * W), rng() < 0.5 ? snap(rng() * 24) : snap(H - 24 + rng() * 20), 2, 2); } }); }
  };
  function tileless(g, rng) {
    // Cave floor cracks.
    for (let v = 0; v < 18; v += 1) {
      let x = snap(T + rng() * (W - 2 * T)), y = snap(T + rng() * (H - 2 * T));
      for (let i = 0; i < 16; i += 1) { g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(x, y, 2, 2); x += 2; y += rng() < 0.4 ? 2 : rng() < 0.5 ? -2 : 0; }
    }
  }

  // 9 Crystal Hollow: chasms with a rope bridge, big crystals, glowing veins.
  KITS[9] = {
    door: "#463874",
    chasm: CHASMS.crystal,
    build(L, k) {
      if (k === 0) {
        shape(L, CHASM, wob(ell(360, 200, 90, 54), 2.1, 10)); shape(L, CHASM, wob(ell(620, 460, 100, 54), 1.2, 10));
        add.crystals(L, 200, 470, 1.6, CRY.purple); add.crystals(L, 780, 180, 1.8, CRY.cyan); add.crystals(L, 620, 180, 1.0, CRY.pink); add.crystals(L, 860, 540, 1.1, CRY.pink);
      } else if (k === 1) {
        shape(L, CHASM, wob(any(rectFn(400, T, 560, H - T), ell(480, 320, 140, 200)), 2.1, 14));
        addBridge(L, "rope", 330, 630, 290, 48);
        add.crystals(L, 200, 220, 1.6, CRY.purple); add.crystals(L, 780, 500, 1.8, CRY.cyan); add.crystals(L, 820, 190, 1.3, CRY.pink);
        add.crystals(L, 160, 520, 1.1, CRY.cyan); add.crystals(L, 690, 120, 0.8, CRY.purple);
      } else {
        shape(L, CHASM, wob(ell(190, 500, 70, 40), 0.6, 6));
        add.crystals(L, 150, 160, 1.5, CRY.purple); add.crystals(L, 480, 120, 1.0, CRY.pink); add.crystals(L, 830, 500, 1.7, CRY.cyan); add.crystals(L, 480, 540, 0.9, CRY.cyan);
      }
      for (let i = 0; i < 3; i += 1) add.stone(L, T + 80 + L.rng() * 760, T + 80 + L.rng() * 450, 12 + L.rng() * 5, PAL.purple);
    },
    floor(g, L, rng) {
      tileFloor(g, rng, 32, "#4f3f80", "#463874", "#2e2456", 0.2);
      for (let v = 0; v < 7; v += 1) {
        let x = snap(T + rng() * (W - 2 * T)), y = snap(T + rng() * (H - 2 * T));
        for (let i = 0; i < 40; i += 1) { g.fillStyle = i % 5 ? "#8f6cff" : "#d6c7ff"; g.fillRect(x, y, 2, 2); x += 2; y += rng() < 0.4 ? 2 : rng() < 0.5 ? -2 : 0; }
      }
    },
    details(g, L, rng) {
      scatter(g, L, rng, 7, (x, y) => mushroomGlow(g, x, y));
      scatter(g, L, rng, 18, (x, y) => { const p = pickColor(rng, [CRY.purple, CRY.cyan, CRY.pink]); g.fillStyle = p.k; g.fillRect(x - 2, y - 8, 8, 10); g.fillStyle = p.M; g.fillRect(x, y - 6, 4, 6); g.fillStyle = p.L; g.fillRect(x, y - 6, 2, 4); });
    },
    walls(g, L, rng) { boulderWall(g, rng, PAL.purple, () => { for (let x = 60; x < W; x += 110) { g.fillStyle = "#8f6cff"; g.fillRect(x, T - 12, 6, 14); g.fillStyle = "#c8b0ff"; g.fillRect(x, T - 12, 2, 10); g.fillStyle = "#5a3ac0"; g.fillRect(x + 6, T - 6, 4, 8); } }); }
  };

  /* ---------- building a room's layout ---------- */
  const layouts = new Map();
  function nearCamp(L, x, y) {
    for (const z of L.camp) if ((x - z.x) ** 2 + (y - z.y) ** 2 < z.r * z.r) return true;
    return false;
  }
  function terrainRoom(room) {
    return room && !room.arena && !room.final && !room.tree && biomes.indexOf(room.biome) >= 0;
  }
  function layoutFor(room) {
    if (!terrainRoom(room)) return null;
    let L = layouts.get(room.index);
    if (L) return L;
    const bi = biomes.indexOf(room.biome);
    const k = (room.index % ROOM_COLS) % ROOM_PER_CHAPTER;
    L = { grid: new Uint8Array(GW * GH), has: [], solids: [], props: [], keep: [], pits: [], bridges: [], clear: [], camp: [], bi, k, rng: mulberry32(room.index * 7717 + 99), kit: KITS[bi] };
    // Doorways stay clear so you can always walk in and out.
    L.clear.push({ x0: 0, x1: 236, y0: H / 2 - DOOR_HALF - 24, y1: H / 2 + DOOR_HALF + 24 });
    L.clear.push({ x0: W - 236, x1: W, y0: H / 2 - DOOR_HALF - 24, y1: H / 2 + DOOR_HALF + 24 });
    if (hasCampfire(room)) {
      const fire = campfireSpot(room), stall = shopSpot(room);
      for (const p of [fire, stall]) { L.clear.push({ x: p.x, y: p.y, r: 92 }); L.camp.push({ x: p.x, y: p.y, r: 70 }); }
      L.clear.push({ x0: Math.min(fire.x, stall.x), x1: Math.max(fire.x, stall.x), y0: fire.y - 70, y1: fire.y + 70 });
    }
    L.kit.build(L, k);
    layouts.set(room.index, L);
    return L;
  }

  function paintRoom(room, L) {
    const g = bgCtx;
    const rng = mulberry32(room.index * 131 + 7);
    const kit = L.kit;
    g.clearRect(0, 0, W, H);
    kit.floor(g, L, rng);
    if (L.has[WATER]) paintWater(g, L, kit.water || WATERS.pond, rng);
    if (L.has[LAVA]) paintLava(g, L, rng);
    if (L.has[CHASM]) paintChasm(g, L, kit.chasm || CHASMS.crystal, rng);
    if (L.has[ICE]) paintIce(g, L, kit.ice || ICES.snow, rng);
    if (L.has[QUICK]) paintQuick(g, L);
    if (L.has[SNOW]) paintSnow(g, L);
    paintBridges(g, L);
    // Props and details snap to the house palette when props.js is loaded.
    const hg = window.houseProps ? window.houseProps.paletteCtx(g) : g;
    kit.details(hg, L, rng);
    const props = L.props.slice().sort((a, b) => a.y - b.y);
    // props.js paints each prop as its own sprite too, for depth sorting.
    if (!house("paintProps", g, props, rng, room)) for (const p of props) p.draw(hg, rng);
    kit.walls(g, L, rng);
    const doors = roomDoors(room);
    const doorBiome = { floor2: kit.door };
    if (doors.left) carveDoor(g, 0, H / 2 - DOOR_HALF, T, DOOR_HALF * 2, doorBiome);
    if (doors.right || isRowEnd(room)) carveDoor(g, W - T, H / 2 - DOOR_HALF, T, DOOR_HALF * 2, doorBiome);
  }

  const originalRender = window.renderRoomBackground;
  window.renderRoomBackground = function renderRoomBackgroundWithTerrain(room) {
    const L = layoutFor(room);
    if (!L) return originalRender(room);
    paintRoom(room, L);
    bgRoomIndex = room.index;
  };

  /* ---------- terrain in play ---------- */
  let lastRoom = null;
  let lastLayout = null;
  function currentLayout() {
    const room = currentRoom();
    if (room !== lastRoom) { lastRoom = room; lastLayout = layoutFor(room); }
    return lastLayout;
  }
  function blockedBySolid(room, x, y, r) {
    for (const c of room.crates) if (c.hp > 0 && circleHitsRect(x, y, r, c)) return true;
    return false;
  }
  // The closest spot that isn't lava, a chasm or inside something solid.
  function nearestSafe(L, room, x, y, r) {
    const ok = (px, py) => px > T + r && px < W - T - r && py > T + r && py < H - T - r && !isHazard(cellAt(L, px, py)) && !isHazard(cellAt(L, px + r, py)) && !isHazard(cellAt(L, px - r, py)) && !isHazard(cellAt(L, px, py + r)) && !isHazard(cellAt(L, px, py - r)) && !blockedBySolid(room, px, py, r);
    if (ok(x, y)) return { x, y };
    for (let d = 8; d < 420; d += 8) {
      for (let i = 0; i < 16; i += 1) {
        const a = (i / 16) * Math.PI * 2;
        const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
        if (ok(px, py)) return { x: px, y: py };
      }
    }
    return { x: W / 2, y: H / 2 };
  }
  const crateFree = (L, c) => {
    for (let y = c.y; y <= c.y + c.h; y += 8) for (let x = c.x; x <= c.x + c.w; x += 8) { const kind = cellAt(L, x, y); if (kind !== FLOOR && kind !== PATH) return false; }
    for (const s of L.solids) if (c.x < s[0] + s[2] + 6 && c.x + c.w > s[0] - 6 && c.y < s[1] + s[3] + 6 && c.y + c.h > s[1] - 6) return false;
    return true;
  };
  // After a room is filled with crates and monsters, add the terrain's solid
  // blocks, drop crates that landed in water or rocks, and move monsters onto
  // safe ground.
  function applyTerrain(room) {
    const L = layoutFor(room);
    if (!L) return;
    if (room.terrainFor !== room.crates) {
      const kept = room.crates.filter((c) => c.terrain || c.tree || crateFree(L, c));
      for (const s of L.solids) kept.push({ x: s[0], y: s[1], w: s[2], h: s[3], hp: 99, wobble: 0, stone: true, hidden: true, terrain: true });
      room.crates = kept;
      room.terrainFor = kept;
    }
    for (const e of room.enemies) {
      if (e.hp <= 0) continue;
      e.terrainX = undefined;
      const r = (e.size || 30) * 0.45;
      if (isHazard(cellAt(L, e.x, e.y)) || blockedBySolid(room, e.x, e.y, r)) {
        const spot = nearestSafe(L, room, e.x, e.y, r);
        e.x = spot.x; e.y = spot.y; e.homeX = spot.x; e.homeY = spot.y;
      }
    }
    const boss = room.boss;
    if (boss && boss.hp > 0 && !boss.dummy) {
      const r = (boss.size || 40) * 0.45;
      if (isHazard(cellAt(L, boss.x, boss.y)) || blockedBySolid(room, boss.x, boss.y, r)) {
        const spot = nearestSafe(L, room, boss.x, boss.y, r);
        boss.x = spot.x; boss.y = spot.y; boss.homeX = spot.x; boss.homeY = spot.y;
      }
    }
  }

  const tipsShown = new Set();
  const TIPS = [
    [LAVA, "Lava burns! Cross on the bridges, or dash over it."],
    [CHASM, "Mind the gap! Use the bridge, or dash across."],
    [ICE, "Ice is slippery. You'll slide!"],
    [QUICK, "Quicksand pulls you in. Dash out!"],
    [WATER, "Water slows you down."]
  ];
  const originalEnterRoom = window.enterRoom;
  window.enterRoom = function enterRoomWithTerrain(index, entry, silent = false) {
    const result = originalEnterRoom(index, entry, silent);
    const room = rooms[index];
    applyTerrain(room);
    for (const p of players) { p.terrainSafeX = p.x; p.terrainSafeY = p.y; p.iceVX = 0; p.iceVY = 0; }
    const L = layoutFor(room);
    if (L && !silent && !state.treeMode) {
      for (const [kind, text] of TIPS) {
        if (!L.has[kind] || tipsShown.has(kind)) continue;
        if (state.messageTimer > 0.5) break;
        tipsShown.add(kind);
        toast(text, 3.5);
        break;
      }
    }
    return result;
  };
  // The blocks for trees and rocks are drawn as part of the background, so hide them.
  const visibleCrates = new WeakMap();
  const originalDrawCrates = window.drawCrates;
  window.drawCrates = function drawCratesWithTerrain(room) {
    const list = room.crates;
    let view = visibleCrates.get(list);
    if (!view || view.count !== list.length) {
      view = { count: list.length, room: { crates: list.filter((c) => !c.hidden), biome: room.biome } };
      visibleCrates.set(list, view);
    }
    view.room.biome = room.biome;
    return originalDrawCrates(view.room);
  };

  // Water, snow and quicksand slow you; ice keeps you sliding; quicksand pulls you to its middle.
  let frameDt = 1 / 60;
  const originalMove = window.moveWithWalls;
  window.moveWithWalls = function moveWithTerrain(entity, r, dx, dy, canExit) {
    const L = canExit && entity.hp > 0 ? currentLayout() : null;
    if (L) {
      const kind = cellAt(L, entity.x, entity.y + 6);
      const dashing = entity.dashTime > 0;
      if (!dashing) {
        dx *= SLOW[kind];
        dy *= SLOW[kind];
        if (kind === QUICK && L.pits.length) {
          let best = L.pits[0];
          for (const p of L.pits) if ((p.x - entity.x) ** 2 + (p.y - entity.y) ** 2 < (best.x - entity.x) ** 2 + (best.y - entity.y) ** 2) best = p;
          const d = Math.hypot(best.x - entity.x, best.y - entity.y) || 1;
          dx += ((best.x - entity.x) / d) * 52 * frameDt;
          dy += ((best.y - entity.y) / d) * 52 * frameDt;
        }
      }
      if (kind === ICE && !dashing) {
        const k = Math.min(1, frameDt * 3.2);
        entity.iceVX = (entity.iceVX || 0) + (dx / frameDt - (entity.iceVX || 0)) * k;
        entity.iceVY = (entity.iceVY || 0) + (dy / frameDt - (entity.iceVY || 0)) * k;
        dx = entity.iceVX * frameDt;
        dy = entity.iceVY * frameDt;
      } else {
        entity.iceVX = dx / frameDt;
        entity.iceVY = dy / frameDt;
      }
    }
    return originalMove(entity, r, dx, dy, canExit);
  };

  // Lava burns and chasms drop you: a little damage, then you're back where you last stood safely.
  const originalUpdatePlayer = window.updatePlayer;
  window.updatePlayer = function updatePlayerWithTerrain(p, dt) {
    frameDt = dt || 1 / 60;
    const roomBefore = state.roomIndex;
    const result = originalUpdatePlayer(p, dt);
    if (result || state.roomIndex !== roomBefore || p.hp <= 0) return result;
    const L = currentLayout();
    if (!L) return result;
    const fx = p.x, fy = p.y + 6;
    const kind = cellAt(L, fx, fy);
    if (isHazard(kind) && !(p.dashTime > 0)) {
      if (kind === LAVA) {
        burst(p.x, p.y + 8, ["#ff7a2e", "#ffd166", "#c8401c"], 16, 170, { lift: 60 });
        floatText(p.x, p.y - 40, "Hot hot hot!", "#ffb347", 16);
        hurtPlayer(p, 8, p.x, p.y + 30);
      } else {
        burst(p.x, p.y, ["#8f6cff", "#ffffff"], 12, 120);
        floatText(p.x, p.y - 40, "Whoops!", "#d6c7ff", 16);
        hurtPlayer(p, 6, p.x, p.y + 30);
      }
      const back = p.terrainSafeX !== undefined && p.terrainSafeY !== undefined && !isHazard(cellAt(L, p.terrainSafeX, p.terrainSafeY + 6))
        ? { x: p.terrainSafeX, y: p.terrainSafeY }
        : nearestSafe(L, currentRoom(), p.x, p.y + 6, p.r + 4);
      p.x = back.x;
      p.y = back.y;
      p.kx = 0; p.ky = 0; p.iceVX = 0; p.iceVY = 0;
      p.invulnerable = Math.max(p.invulnerable, 0.5);
    } else if (!(p.dashTime > 0)) {
      const r = p.r + 4;
      if (!isHazard(cellAt(L, fx + r, fy)) && !isHazard(cellAt(L, fx - r, fy)) && !isHazard(cellAt(L, fx, fy + r)) && !isHazard(cellAt(L, fx, fy - r)) && !isHazard(kind)) {
        p.terrainSafeX = p.x;
        p.terrainSafeY = p.y;
      }
      if (p.moving && (kind === WATER || kind === SNOW || kind === QUICK) && Math.random() < dt * 9) {
        const colors = kind === WATER ? ["#c8ecff", "#8ad0f0"] : kind === SNOW ? ["#ffffff", "#e2eff5"] : ["#c49a58", "#8a6a38"];
        burst(p.x + rand(-6, 6), p.y + 12, colors, 2, 50, { lift: 30 });
      }
    }
    return result;
  };

  // Walking monsters stay out of lava and chasms and wade slowly through water.
  // Flying ones and bosses go wherever they like.
  const FLYERS = new Set(["Bat Miner", "Frost Wisp", "Ender Shade", "Watcher Eye", "Ember Spirit", "Wraith", "Gargoyle", "Spirit Lantern", "Void Raven"]);
  const flies = (e) => {
    const type = enemyTypes[e.typeIndex];
    return !type || FLYERS.has(type.name);
  };
  const originalUpdateFoes = window.updateFoes;
  window.updateFoes = function updateFoesWithTerrain(dt) {
    const L = currentLayout();
    const room = currentRoom();
    if (!L) return originalUpdateFoes(dt);
    for (const e of room.enemies) { if (e.hp > 0) { e.terrainX = e.x; e.terrainY = e.y; } }
    const result = originalUpdateFoes(dt);
    for (const e of room.enemies) {
      if (e.hp <= 0 || e.isBoss || e.friendly || flies(e)) continue;
      const kind = cellAt(L, e.x, e.y);
      const px = e.terrainX, py = e.terrainY;
      if (isHazard(kind)) {
        if (px === undefined || isHazard(cellAt(L, px, py))) {
          // Knocked in, or spawned there: lava hurts, a chasm hurts more. Then back to safe ground.
          if (px !== undefined) {
            if (kind === LAVA) { burst(e.x, e.y, ["#ff7a2e", "#ffd166"], 10, 140, { lift: 50 }); damageEnemy(e, 20, "burn"); }
            else { burst(e.x, e.y, ["#8f6cff", "#ffffff"], 10, 120); damageEnemy(e, 30); }
          }
          const spot = nearestSafe(L, room, e.x, e.y, (e.size || 30) * 0.45);
          e.x = spot.x; e.y = spot.y;
        } else if (!isHazard(cellAt(L, e.x, py))) e.y = py;
        else if (!isHazard(cellAt(L, px, e.y))) e.x = px;
        else { e.x = px; e.y = py; }
      } else if (px !== undefined && SLOW[kind] < 1) {
        e.x = px + (e.x - px) * SLOW[kind];
        e.y = py + (e.y - py) * SLOW[kind];
      }
    }
    return result;
  };

  // Coins and staffs that land in lava or a chasm wash up on the nearest safe ground.
  const originalUpdatePickups = window.updatePickups;
  window.updatePickups = function updatePickupsWithTerrain(dt) {
    const L = currentLayout();
    if (L) {
      const room = currentRoom();
      for (const item of pickups) if (isHazard(cellAt(L, item.x, item.y))) { const s = nearestSafe(L, room, item.x, item.y, 8); item.x = s.x; item.y = s.y; }
      for (const drop of room.staffDrops || []) if (isHazard(cellAt(L, drop.x, drop.y))) { const s = nearestSafe(L, room, drop.x, drop.y, 12); drop.x = s.x; drop.y = s.y; }
    }
    return originalUpdatePickups(dt);
  };

  // For tests: what the ground is at a spot in the current room.
  // blockDungeon.enterRoom pointed at the unwrapped function; point it at the wrapped one.
  window.blockDungeon.enterRoom = window.enterRoom;
  window.blockDungeon.terrainAt = (x, y) => { const L = currentLayout(); return L ? ["floor", "water", "lava", "chasm", "ice", "quicksand", "snow", "bridge", "path"][cellAt(L, x, y)] : "floor"; };
  window.blockDungeon.terrainLayout = (index) => layoutFor(rooms[index]);

  // The title screen was drawn before this file loaded; draw it again with terrain.
  bgRoomIndex = -1;
})();
