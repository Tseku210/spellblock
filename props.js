/* ---------- props in the house pixel style ----------
   Load after terrain.js. Hand-made 32 x 32 sprites on the shared palette
   (see research/pixel-style/), drawn at the game's 2x pixel size:
   - Breakable crates become barrels (frosty lids in snow rooms, a split
     plank once hit).
   - Lulu's stall gets a bubbling cauldron and an anvil next to it.
   - Room bosses leave a treasure chest. Walk into it to open it for coins
     and gems.
   - The campfire, Lulu's stall, stone pillars and the room trees are
     redrawn in the same style, and every other terrain prop is painted
     with the shared palette (see window.houseProps below).
   Every sprite is painted once into a cached canvas (per animation frame),
   so drawing costs one drawImage per prop. No ctx.filter. */
(() => {
  "use strict";
  /* ---------- palette (same ramps as research/pixel-style/sample.js) ---------- */
const COLORS = [null];
const IDX = {};
function defColors(obj) {
  for (const [k, v] of Object.entries(obj)) {
    IDX[k] = COLORS.length;
    COLORS.push(v);
  }
}
defColors({
  out: "#1d1a2f",
  g0: "#1b3a30", g1: "#28553a", g2: "#367540", g3: "#4a9446", g4: "#68b350", g5: "#a5d65e",
  L0: "#16302e", L1: "#1f4a3a", L2: "#2c6b40", L3: "#43914a", L4: "#6fbb55", L5: "#b4e176",
  d0: "#3a2430", d1: "#5b3934", d2: "#87573b", d3: "#b07e4e", d4: "#d4a96f", d5: "#efd29b",
  w0: "#16213f", w1: "#1f3c73", w2: "#2862a8", w3: "#3a8fd0", w4: "#78c9ea", w5: "#e6f5f0",
  s0: "#221f36", s1: "#3a3854", s2: "#59597a", s3: "#8189a3", s4: "#b3bccb", s5: "#e1e7ea",
  b0: "#2e1d28", b1: "#55332f", b2: "#82513a", b3: "#b07a4c",
  r0: "#5c1f3a", r1: "#9e2f4a", r2: "#d6455d", r3: "#f2808a",
  y0: "#a35a26", y1: "#e08a2e", y2: "#f5c542", y3: "#fff0a3",
  p1: "#c2549a", p2: "#f08fc0", wh: "#f4f4f8",
  H0: "#1c1d52", H1: "#2b3594", H2: "#3d58d0", H3: "#6a92f2", H4: "#a8cfff",
  k0: "#6e3436", k1: "#c47358", k2: "#eeb08a", k3: "#ffd9b8", ck: "#e8807e",
  W0: "#6f7398", W1: "#b4bad4", W2: "#f2f3f8",
  O0: "#1a5f9c", O1: "#2fb3e0", O2: "#8cf2ff", O3: "#ffffff",
  v0: "#2a1b45", v1: "#4b2c7a", v2: "#7442b0", v3: "#a46ee0", v4: "#d4b0ff"
});

// Each color's next darker (shadow) and next lighter neighbor in its ramp.
const SHADOW = new Uint16Array(COLORS.length);
const LIGHT = new Uint16Array(COLORS.length);
for (let i = 0; i < COLORS.length; i += 1) {
  SHADOW[i] = i;
  LIGHT[i] = i;
}
for (const ramp of ["g", "L", "d", "w", "s", "b", "y", "H", "k", "W", "O", "r", "v"]) {
  const names = Object.keys(IDX).filter((n) => n[0] === ramp && /^\w\d$/.test(n));
  names.sort();
  for (let i = 0; i < names.length; i += 1) {
    if (i > 0) SHADOW[IDX[names[i]]] = IDX[names[i - 1]];
    if (i < names.length - 1) LIGHT[IDX[names[i]]] = IDX[names[i + 1]];
  }
}

class Pix {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.a = new Uint16Array(w * h);
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.a[y * this.w + x];
  }
  set(x, y, c) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.a[y * this.w + x] = typeof c === "string" ? IDX[c] : c;
  }
  clone() {
    const p = new Pix(this.w, this.h);
    p.a.set(this.a);
    return p;
  }
}

function blitPix(dst, src, ox, oy, flip = false) {
  for (let y = 0; y < src.h; y += 1) {
    for (let x = 0; x < src.w; x += 1) {
      const c = src.a[y * src.w + (flip ? src.w - 1 - x : x)];
      if (c) dst.set(ox + x, oy + y, c);
    }
  }
}

// Rows of letters -> Pix. map: letter -> color name. Space and "." are clear.
function rowsToPix(rows, map) {
  const w = Math.max(...rows.map((r) => r.length));
  const p = new Pix(w, rows.length);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const ch = row[x];
      if (ch === " " || ch === ".") continue;
      if (!(ch in map)) throw new Error(`no color for "${ch}" in ${row}`);
      p.set(x, y, map[ch]);
    }
  });
  return p;
}

// Small deterministic hash noise.
function hash(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// Canopy made of overlapping leaf clumps, each lit from the top left, with a
// shadow line where a clump sits over the one behind it, and a dark outline.
function canopy(clumps, w, h, sway = 0, ramp = ["L0", "L1", "L2", "L3", "L4", "L5"], berries = 0) {
  const owner = new Int16Array(w * h).fill(-1);
  const top = Math.min(...clumps.map((c) => c[1] - c[2]));
  const bottom = Math.max(...clumps.map((c) => c[1] + c[2]));
  const placed = clumps
    .map((c, i) => {
      const lift = 1 - (c[1] - top) / Math.max(1, bottom - top);
      return [c[0] + Math.round(sway * lift * 1.6), c[1], c[2], i];
    })
    .sort((a, b) => a[1] - b[1]);
  placed.forEach(([cx, cy, r], k) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y += 1) {
      for (let x = Math.floor(cx - r); x <= cx + r; x += 1) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) owner[y * w + x] = k;
      }
    }
  });
  const P = new Pix(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const k = owner[y * w + x];
      if (k < 0) continue;
      const [cx, cy, r] = placed[k];
      const dx = (x + 0.5 - cx) / r;
      const dy = (y + 0.5 - cy) / r;
      const lit = -dx * 0.55 - dy * 0.85;
      let c = lit > 0.5 ? 4 : lit > 0.05 ? 3 : lit > -0.45 ? 2 : 1;
      // Leaf texture: little notches in the lit part.
      if (c >= 3 && hash(x >> 1, y, 51) > 0.86) c -= 1;
      if (c === 4 && hash(x, y, 52) > 0.9 && lit > 0.7) c = 5;
      // Shadow under a clump that overlaps the one behind it.
      const below = y + 1 < h ? owner[(y + 1) * w + x] : -1;
      const below2 = y + 2 < h ? owner[(y + 2) * w + x] : -1;
      if (below >= 0 && below !== k && placed[below][1] < cy) c = Math.min(c, 1);
      if (below2 >= 0 && below2 !== k && below === k && placed[below2][1] < cy && dy > 0) c = Math.min(c, 2);
      P.set(x, y, ramp[c]);
    }
  }
  // Outline.
  const O = P.clone();
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (P.get(x, y)) continue;
      if (P.get(x - 1, y) || P.get(x + 1, y) || P.get(x, y - 1) || P.get(x, y + 1)) O.set(x, y, ramp[0]);
    }
  }
  for (let i = 0; i < berries; i += 1) {
    const bx = 3 + Math.floor(hash(i, 1, 61) * (w - 6));
    const by = 3 + Math.floor(hash(i, 2, 61) * (h - 6));
    if (O.get(bx, by) && O.get(bx, by) !== IDX[ramp[0]] && O.get(bx + 1, by + 1) && O.get(bx + 1, by + 1) !== IDX[ramp[0]]) {
      O.set(bx, by, "r3");
      O.set(bx + 1, by, "r2");
      O.set(bx, by + 1, "r2");
      O.set(bx + 1, by + 1, "r1");
    }
  }
  return O;
}

// Campfire: logs plus a hand-drawn 4 frame flame.
const LOGS = rowsToPix(
  ["  oo     oo  ", " o32oo oo23o ", "o3222o3o2223o", "oo1222o2221oo", "  oooooooo   "],
  { o: "b0", 3: "b3", 2: "b2", 1: "b1" }
);
const FLAME_MAP = { z: "y3", Y: "y2", O: "y1", R: "r2", r: "r1" };
const FLAMES = [
  [
    "    R    ",
    "   RO    ",
    "   ROR   ",
    "  ROYOR  ",
    "  RYzYO  ",
    " ROYzzYR ",
    " ROYzzYOR",
    " RYzzzYOr",
    "  rOYYOr "
  ],
  [
    "         ",
    "     R   ",
    "    ROR  ",
    "  R OYOR ",
    " ROROzYR ",
    " ROYzzYOR",
    " RYzzzYOR",
    " rOYzzYOr",
    "  rOYYOr "
  ],
  [
    "   R     ",
    "  ROR    ",
    "  ROR  R ",
    "  OYOROR ",
    " RYzYOYR ",
    " ROYzzYOR",
    "RROYzzzYR",
    " rOYzzYOr",
    "  rOYYOr "
  ],
  [
    "         ",
    "    R    ",
    "   ROR   ",
    "  ROYOR  ",
    " ROYzYOR ",
    " RYzzzYR ",
    " ROYzzzOR",
    " rOYzzYOr",
    "  rOYYOr "
  ]
].map((rows) => rowsToPix(rows, FLAME_MAP));

function campfireFrame(f) {
  const P = new Pix(13, 15);
  blitPix(P, FLAMES[f % 4], 2, 1);
  blitPix(P, LOGS, 0, 10);
  // Sparks rising.
  const s = f % 4;
  P.set(3 + (s % 2), 0 + (3 - s), "y3");
  P.set(9 - (s % 2), ((s + 2) % 4), "y2");
  return P;
}

  const put = (P, x, y, c) => P.set(Math.round(x), Math.round(y), c);
  function rect(P, x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) P.set(x + i, y + j, typeof c === "function" ? c(i, j) : c);
  }
  // Filled ellipse; shade(nx, ny) gets -1..1 coords and returns a color.
  function ell(P, cx, cy, rx, ry, shade) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) P.set(x, y, typeof shade === "function" ? shade(nx, ny, x, y) : shade);
      }
    }
  }
  function line(P, x0, y0, x1, y1, c) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) put(P, x0 + ((x1 - x0) * i) / (n || 1), y0 + ((y1 - y0) * i) / (n || 1), c);
  }
  // Navy outline around everything drawn so far.
  function outline(P, c = "out") {
    const src = P.clone();
    for (let y = 0; y < P.h; y++) {
      for (let x = 0; x < P.w; x++) {
        if (src.get(x, y)) continue;
        if (src.get(x - 1, y) || src.get(x + 1, y) || src.get(x, y - 1) || src.get(x, y + 1)) P.set(x, y, c);
      }
    }
    return P;
  }
  const lit = (nx, ny) => -nx * 0.6 - ny * 0.8; // light from the top left

  /* ---------- barrel ---------- */
  function barrel() {
    const P = new Pix(32, 32);
    const top = 7;
    const bot = 28;
    for (let y = top; y <= bot; y++) {
      const t = (y - top) / (bot - top);
      const half = 6 + Math.round(Math.sin(t * Math.PI) * 2.2);
      for (let x = 16 - half; x < 16 + half; x++) {
        const u = (x - (16 - half)) / (2 * half - 1); // 0 left .. 1 right
        let c = u < 0.2 ? "b3" : u < 0.7 ? "b2" : "b1";
        if (u > 0.12 && u < 0.22 && t > 0.2 && t < 0.8) c = "d4"; // shine
        // Plank seams follow the bulge (fixed fractions of the width).
        const seam = [0.36, 0.62, 0.86].some((s) => Math.abs(u - s) < 0.5 / (2 * half));
        if (seam) c = u < 0.5 ? "b1" : "b0";
        P.set(x, y, c);
      }
      // Hoops.
      if ([10, 11, 23, 24].includes(y)) {
        for (let x = 16 - half; x < 16 + half; x++) {
          const u = (x - (16 - half)) / (2 * half - 1);
          P.set(x, y, y === 10 || y === 23 ? (u < 0.3 ? "s5" : u < 0.7 ? "s4" : "s3") : u < 0.3 ? "s3" : u < 0.7 ? "s2" : "s1");
        }
      }
    }
    // Lid.
    ell(P, 15.5, top + 0.5, 7, 2.6, (nx, ny, x) => (Math.abs(ny) > 0.7 || Math.abs(nx) > 0.86 ? "b1" : (x % 3 === 0 ? "d2" : nx < 0 ? "d4" : "d3")));
    return outline(P);
  }

  /* ---------- treasure chest: 0 closed, 1 ajar, 2 open ---------- */
  function chest(f = 0) {
    const P = new Pix(32, 32);
    const x0 = 5;
    const w = 22;
    // Body.
    rect(P, x0, 16, w, 12, (i, j) => (j === 0 ? "b3" : j > 9 ? "b1" : i < 2 ? "b3" : i > w - 3 ? "b1" : j % 4 === 3 ? "b1" : "b2"));
    if (f === 0) {
      // Rounded lid.
      rect(P, x0, 9, w, 7, (i, j) => {
        if ((i === 0 || i === w - 1) && j === 0) return 0;
        return j === 0 ? "d4" : j === 1 ? "b3" : j === 6 ? "b0" : i < 2 ? "b3" : i > w - 3 ? "b1" : j === 3 ? "b1" : "b2";
      });
    } else {
      // Lid swung back: we see its dark inside; gold glows from the box.
      const lift = f === 1 ? 2 : 0;
      if (f === 1) {
        rect(P, x0, 9 + lift, w, 5, (i, j) => (j === 0 ? "d4" : j === 4 ? "b0" : i < 2 ? "b3" : i > w - 3 ? "b1" : "b2"));
        rect(P, x0 + 1, 14 + lift - 1, w - 2, 2, (i) => (i % 3 ? "y3" : "y2"));
      } else {
        rect(P, x0 + 1, 3, w - 2, 9, (i, j) => (j === 0 ? "b2" : j === 8 ? "b1" : "b0"));
        rect(P, x0 + 2, 4, w - 4, 7, (i, j) => (j < 2 ? "b1" : "b0"));
        // Heaped gold and a gem.
        for (let i = 0; i < w - 2; i++) {
          const hgt = 3 + Math.round(Math.sin((i / (w - 3)) * Math.PI) * 3);
          for (let j = 0; j < hgt; j++) P.set(x0 + 1 + i, 16 - j, j === hgt - 1 ? "y3" : (i + j) % 3 === 0 ? "y1" : "y2");
        }
        rect(P, 18, 12, 2, 2, (i, j) => (i + j === 0 ? "r3" : "r2"));
        rect(P, 11, 13, 2, 2, (i, j) => (i + j === 0 ? "w5" : "w4"));
      }
    }
    // Gold bands, corners and the lock.
    for (const bx of [x0 + 3, x0 + w - 5]) {
      for (let y = f === 2 ? 16 : f === 1 ? 11 : 9; y < 28; y++) {
        P.set(bx, y, "y2");
        P.set(bx + 1, y, "y0");
      }
    }
    if (f !== 2) {
      const ly = f === 0 ? 13 : 14;
      rect(P, 14, ly, 4, 5, (i, j) => (i === 0 || j === 0 ? "y3" : i === 3 || j === 4 ? "y0" : "y2"));
      P.set(15, ly + 2, "out");
      P.set(16, ly + 2, "out");
      P.set(15, ly + 3, "y0");
    } else {
      rect(P, 14, 17, 4, 3, (i, j) => (j === 0 ? "y3" : i === 3 ? "y0" : "y2"));
    }
    return outline(P);
  }

  /* ---------- cauldron over a campfire (4 frames) ---------- */
  const FLAME = campfireFrame;
  function cauldron(f = 0) {
    const P = new Pix(32, 32);
    // Tripod-style frame: two forked posts and a bar.
    for (const px of [4, 27]) {
      rect(P, px, 6, 2, 22, (i) => (i === 0 ? "b3" : "b1"));
      P.set(px - 1, 4, "b2");
      P.set(px - 1, 5, "b2");
      P.set(px + 2, 4, "b2");
      P.set(px + 2, 5, "b2");
    }
    rect(P, 3, 6, 26, 1, "b3");
    rect(P, 3, 7, 26, 1, "b1");
    // Chain.
    for (let y = 8; y < 11; y++) P.set(16, y, y % 2 ? "s3" : "s4");
    // Fire under the pot.
    const fire = FLAME(f);
    blitPix(P, fire, 10, 16);
    // Pot.
    ell(P, 16, 15, 7, 5.2, (nx, ny) => {
      const l = lit(nx, ny);
      return l > 0.45 ? "s3" : l > -0.1 ? "s2" : l > -0.6 ? "s1" : "s0";
    });
    rect(P, 9, 10, 15, 2, (i, j) => (j === 0 ? "s4" : i < 3 ? "s3" : "s2")); // rim
    // Bubbling green brew.
    const bubbles = [
      [12, 9], [17, 8], [20, 9], [14, 8]
    ];
    rect(P, 10, 10, 13, 1, (i) => ((i + f) % 4 === 0 ? "g5" : "g4"));
    bubbles.forEach(([bx, by], i) => {
      const k = (f + i) % 4;
      if (k === 0) P.set(bx, by + 1, "g5");
      if (k === 1) {
        P.set(bx, by, "g5");
        P.set(bx + 1, by, "g4");
      }
      if (k === 2) P.set(bx, by - 1, "g4");
    });
    // Rising steam/spark.
    P.set(13 + (f % 2), 3 + (f % 4 === 3 ? 1 : 0), "s4");
    P.set(19 - (f % 2), 5 - (f % 3 === 0 ? 1 : 0), "s5");
    return outline(P);
  }

  /* ---------- anvil on a stump ---------- */
  function anvil() {
    const P = new Pix(32, 32);
    // Stump.
    for (let y = 18; y < 30; y++) {
      for (let x = 9; x < 24; x++) {
        const u = (x - 9) / 14;
        let c = u < 0.2 ? "b3" : u < 0.65 ? "b2" : "b1";
        if ((x - 9) % 4 === 2 && y > 19) c = "b1";
        P.set(x, y, c);
      }
    }
    ell(P, 16, 18.5, 7.5, 2.2, (nx, ny) => (nx * nx + ny * ny > 0.55 ? "b3" : "d4"));
    rect(P, 8, 29, 2, 1, "b2");
    rect(P, 23, 29, 2, 1, "b1");
    // Anvil body: waist, face and horn.
    rect(P, 13, 11, 7, 6, (i) => (i === 0 ? "s3" : i > 4 ? "s0" : "s1"));
    rect(P, 11, 15, 11, 3, (i, j) => (j === 0 ? "s3" : i > 8 ? "s0" : "s1"));
    rect(P, 9, 7, 16, 4, (i, j) => (j === 0 ? "s5" : j === 1 ? "s4" : i > 13 ? "s1" : "s2"));
    for (let i = 0; i < 6; i++) {
      // Horn tapering to the left.
      const h = 3 - Math.floor(i / 2);
      for (let j = 0; j < h; j++) P.set(8 - i, 7 + j, j === 0 ? "s4" : "s2");
    }
    rect(P, 25, 7, 2, 2, (i, j) => (j === 0 ? "s4" : "s1"));
    return outline(P);
  }


  /* ---------- cached canvases ---------- */
  const PX = 2;
  const RGB = COLORS.map((h) => (h ? [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] : null));
  function toCanvas(pix) {
    const small = document.createElement("canvas");
    small.width = pix.w;
    small.height = pix.h;
    const sg = small.getContext("2d");
    const img = sg.createImageData(pix.w, pix.h);
    for (let i = 0; i < pix.a.length; i += 1) {
      const col = RGB[pix.a[i]];
      if (!col) continue;
      img.data.set([col[0], col[1], col[2], 255], i * 4);
    }
    sg.putImageData(img, 0, 0);
    const big = document.createElement("canvas");
    big.width = pix.w * PX;
    big.height = pix.h * PX;
    const bg = big.getContext("2d");
    bg.imageSmoothingEnabled = false;
    bg.drawImage(small, 0, 0, big.width, big.height);
    return big;
  }
  const cache = new Map();
  function sprite(key, make) {
    let c = cache.get(key);
    if (!c) {
      c = toCanvas(make());
      cache.set(key, c);
    }
    return c;
  }
  function blit(canvas, x, y) {
    ctx.drawImage(canvas, Math.round(x), Math.round(y));
  }
  // Soft oval shadow, also cached.
  const shadowCache = new Map();
  function drawShadow(cx, cy, w) {
    let c = shadowCache.get(w);
    if (!c) {
      c = document.createElement("canvas");
      c.width = w;
      c.height = Math.max(6, Math.round(w / 4));
      const g = c.getContext("2d");
      g.fillStyle = "rgba(0, 0, 0, 0.25)";
      g.beginPath();
      g.ellipse(c.width / 2, c.height / 2, c.width / 2, c.height / 2, 0, 0, Math.PI * 2);
      g.fill();
      shadowCache.set(w, c);
    }
    ctx.drawImage(c, Math.round(cx - c.width / 2), Math.round(cy - c.height / 2));
  }

  // Barrel variants: cracked after one hit, snow on the lid in snow rooms.
  function barrelPix(cracked, snowy) {
    const P = barrel();
    if (cracked) {
      for (const [x, y] of [[13, 13], [14, 14], [14, 15], [13, 16], [14, 17], [15, 18], [15, 19], [18, 20], [19, 21], [19, 22]]) P.set(x, y, "out");
      P.set(15, 15, "d4");
      P.set(16, 19, "d4");
    }
    if (snowy) {
      for (let x = 9; x < 23; x += 1) {
        for (let y = 4; y < 10; y += 1) {
          const c = P.get(x, y);
          if (c && c !== IDX.out) P.set(x, y, y < 6 || (x + y) % 3 ? "wh" : "s4");
        }
      }
      P.set(10, 10, "wh");
      P.set(21, 11, "wh");
      P.set(21, 12, "s4");
    }
    return P;
  }

  /* ---------- barrels instead of crates ---------- */
  // Replaces the whole crate drawing: stone pillars are drawn by drawPillar
  // (house style, below), hidden terrain blocks stay hidden.
  // Barrels are drawn in order of where their feet are, with any prop that
  // stands in front of one drawn over it again (see "depth" below).
  window.drawCrates = function drawCratesAsBarrels(room) {
    settleCrates(room);
    const snowy = room.biome && room.biome.ambient === "snow";
    const items = [];
    for (const crate of room.crates) {
      if (crate.hp <= 0 || crate.tree || crate.hidden) continue;
      if (crate.stone) {
        drawPillar(crate);
        continue;
      }
      const cracked = crate.hp === 1;
      const img = sprite(`barrel|${cracked ? 1 : 0}|${snowy ? 1 : 0}`, () => barrelPix(cracked, snowy));
      const wobble = crate.wobble > 0 ? Math.sin(crate.wobble * 60) * 2 : 0;
      const cx = crate.x + crate.w / 2;
      const bottom = crate.y + crate.h;
      // The barrel's feet sit on the crate's bottom edge (sprite row 28).
      items.push({ img, dx: Math.round(cx + wobble - 16 * PX), dy: Math.round(bottom - 29 * PX), ...standBox(cx, bottom, 18, 46), base: bottom, cx });
    }
    room.barrelSprites = items;
    const order = items.slice();
    for (const sp of room.propSprites || []) if (items.some((it) => sp.base > it.base && overlaps(sp, it))) order.push(sp);
    order.sort((a, b) => a.base - b.base);
    for (const it of order) {
      if (it.dx === undefined) ctx.drawImage(it.img, it.x, it.y);
      else {
        drawShadow(it.cx, it.base - 1, 30);
        ctx.drawImage(it.img, it.dx, it.dy);
      }
    }
    drawLootChest(room);
  };

  /* ---------- cauldron and anvil at Lulu's stall ---------- */
  // Ground the cauldron and anvil can stand on: not in water, lava, chasms
  // or quicksand, and not on or under a prop, barrel, campfire or the stall.
  const BAD_GROUND = new Set(["water", "lava", "chasm", "quicksand"]);
  function clearGround(room, x, y) {
    return spotClear(room, standBox(x, y, 26, 60));
  }
  // Pick spots once per room: beside the stall away from the campfire,
  // otherwise below the stall, otherwise leave them out.
  function stallPropSpots(room) {
    if (room.stallProps !== undefined) return room.stallProps;
    const spot = shopSpot(room);
    const fire = room.tree ? null : campfireSpot(room);
    const side = fire ? (spot.x >= fire.x ? 1 : -1) : 1;
    const baseY = spot.y + 38;
    const options = [
      [[spot.x + side * 90, baseY], [spot.x + side * 152, baseY]],
      [[spot.x - side * 90, baseY], [spot.x - side * 152, baseY]],
      [[spot.x - 36, baseY + 84], [spot.x + 36, baseY + 84]],
      [[spot.x + side * 90, baseY + 84], [spot.x + side * 152, baseY + 84]]
    ];
    room.stallProps = options.find(([a, b]) => clearGround(room, ...a) && clearGround(room, ...b)) || null;
    return room.stallProps;
  }

  /* ---------- boss treasure chest ---------- */
  const bossDownBefore = window.onBossDefeated;
  window.onBossDefeated = function onBossDefeatedWithChest(boss) {
    bossDownBefore(boss);
    if (state.treeMode || boss.isBig) return;
    const room = currentRoom();
    if (!room || room.tree || room.arena) return;
    room.lootChest = {
      x: clamp(boss.x, 80, WIDTH - 80),
      y: clamp(boss.y + 20, 120, HEIGHT - 70),
      open: 0, // 0 closed, then counts up while the lid swings
      paid: false,
      pop: 0.4 // grows in when it appears
    };
    const spot = nearestClear(room, room.lootChest.x, room.lootChest.y, 26, 56);
    if (spot) [room.lootChest.x, room.lootChest.y] = spot;
  };

  const updatePickupsBefore = window.updatePickups;
  window.updatePickups = function updatePickupsWithChest(dt) {
    updatePickupsBefore(dt);
    const room = currentRoom();
    const chest = room && room.lootChest;
    if (!chest) return;
    chest.pop = Math.max(0, chest.pop - dt);
    if (chest.open === 0) {
      const near = activePlayers().some((p) => p.hp > 0 && Math.hypot(p.x - chest.x, p.y - chest.y) < 40);
      if (near && chest.pop === 0) {
        chest.open = 0.001;
        sfx.chime();
      }
      return;
    }
    chest.open += dt;
    if (!chest.paid && chest.open > 0.18) {
      chest.paid = true;
      const row = Math.floor(room.index / ROOM_COLS);
      dropLoot(chest.x, chest.y - 10, "coin", 6 + row * 2);
      dropLoot(chest.x, chest.y - 10, "gem", 2);
      burst(chest.x, chest.y - 24, ["#fff0a3", "#f5c542", "#ffffff"], 16, 160);
      floatText(chest.x, chest.y - 50, "Treasure!", "#f5c542", 16);
      sfx.coin(4);
    }
  };

  function drawLootChest(room) {
    const chest = room.lootChest;
    if (!chest) return;
    const frame = chest.open === 0 ? 0 : chest.open < 0.18 ? 1 : 2;
    const img = sprite(`chest|${frame}`, () => chestPix(frame));
    const grow = chest.pop > 0 ? Math.round(chest.pop * 20) : 0;
    drawShadow(chest.x, chest.y + 1, 48);
    blit(img, chest.x - 16 * PX, chest.y - 28 * PX - grow);
    if (frame === 0 && chest.pop === 0) {
      // A twinkle on the lock now and then, so it reads as "come open me".
      const k = Math.floor(state.anim * 6) % 12;
      if (k < 2) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(Math.round(chest.x) + 1, Math.round(chest.y) - 34 - k * 2, 2, 2);
      }
    }
  }
  function chestPix(frame) {
    return chest(frame);
  }


  /* ---------- the rest of the world in the house style ----------
     terrain.js asks window.houseProps before painting a prop:
     - paletteCtx(g) wraps the background canvas so every colour the old
       painters pick snaps to the nearest colour of the shared palette (very
       dark ones become the navy outline). That restyles rocks, ruins,
       statues, carts, cacti and the rest in one go.
     - oakTree, willowTree, pineTree and the mine barrel are redrawn by hand
       here; returning true tells terrain.js to skip its old drawing.
     All of it runs once when a room is painted, never per frame. */

  // Colour distance in a rough perceptual space (CIE Lab).
  function toLab(hex) {
    const lin = (v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const r = lin(parseInt(hex.slice(1, 3), 16));
    const g = lin(parseInt(hex.slice(3, 5), 16));
    const b = lin(parseInt(hex.slice(5, 7), 16));
    const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.9505;
    const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.089;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  }
  // Skin tones stay out of the world.
  const WORLD_COLORS = Object.keys(IDX).filter((n) => !/^(k\d|ck)$/.test(n)).map((n) => COLORS[IDX[n]]);
  const WORLD_LAB = WORLD_COLORS.map(toLab);
  const nearCache = new Map();
  function nearest(hex) {
    let c = nearCache.get(hex);
    if (c) return c;
    const [l, a, b] = toLab(hex);
    if (l < 13) c = COLORS[IDX.out];
    else {
      let best = 1e9;
      WORLD_LAB.forEach(([l2, a2, b2], i) => {
        // Lightness matters a bit more than hue, so shading steps survive.
        const d = (l - l2) ** 2 * 1.4 + (a - a2) ** 2 + (b - b2) ** 2;
        if (d < best) {
          best = d;
          c = WORLD_COLORS[i];
        }
      });
    }
    nearCache.set(hex, c);
    return c;
  }
  function expandHex(v) {
    if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase();
    return null;
  }
  const wrapped = new WeakMap();
  function paletteCtx(g) {
    if (wrapped.has(g)) return wrapped.get(g);
    const bound = new Map();
    const proxy = new Proxy(g, {
      get(t, p) {
        if (p === "raw") return t;
        const v = t[p];
        if (typeof v !== "function") return v;
        let f = bound.get(p);
        if (!f) {
          f = v.bind(t);
          bound.set(p, f);
        }
        return f;
      },
      set(t, p, v) {
        if ((p === "fillStyle" || p === "strokeStyle") && typeof v === "string") {
          const hex = expandHex(v);
          t[p] = hex ? nearest(hex) : v;
        } else t[p] = v;
        return true;
      }
    });
    wrapped.set(g, proxy);
    return proxy;
  }

  const snap2 = (v) => Math.round(v / 2) * 2;
  // Put a Pix on a background canvas with (x, y) = its bottom centre.
  function stampPix(g, pix, x, y, flip = false) {
    const img = toCanvas(pix);
    const x0 = snap2(x - img.width / 2);
    const y0 = snap2(y - img.height);
    if (!flip) g.drawImage(img, x0, y0);
    else {
      g.save();
      g.translate(x0 + img.width, y0);
      g.scale(-1, 1);
      g.drawImage(img, 0, 0);
      g.restore();
    }
  }
  function softShadow(g, x, y, rx, ry) {
    g.fillStyle = "rgba(0,0,0,0.26)";
    for (let yy = -ry; yy <= ry; yy += 2) for (let xx = -rx; xx <= rx; xx += 2) if ((xx / rx) ** 2 + (yy / ry) ** 2 <= 1) g.fillRect(snap2(x + xx), snap2(y + yy), 2, 2);
  }

  // Tree trunk: bark lit on the left, flared roots, outline.
  function trunk(P, cx, top, bottom, half) {
    for (let y = top; y <= bottom; y += 1) {
      const hw = half + Math.max(0, y - (bottom - 3));
      for (let x = cx - hw; x < cx + hw; x += 1) {
        const u = (x - (cx - hw)) / (2 * hw - 1);
        let c = u < 0.3 ? "b3" : u < 0.7 ? "b2" : "b1";
        if ((x * 7 + y * 3) % 11 === 0 && u > 0.2) c = "b1";
        P.set(x, y, c);
      }
    }
  }

  function oakPix(r, fruit, seed) {
    const R = Math.max(8, Math.round(r / 2));
    const w = Math.ceil(R * 3) + 6;
    const th = Math.round(R * 0.9);
    const h = Math.ceil(th + R * 2.2) + 4;
    const cx = w / 2;
    const cy = h - 2 - th - R * 0.55;
    const base = [[0, -0.72, 0.5], [-0.48, -0.28, 0.45], [0.48, -0.28, 0.45], [-0.24, 0.26, 0.46], [0.3, 0.3, 0.44], [0, 0, 0.52], [-0.72, 0.3, 0.32], [0.72, 0.3, 0.32]];
    const clumps = base.map(([dx, dy, rr], i) => [
      cx + (dx + (hash(i, seed, 71) - 0.5) * 0.1) * R * 1.25,
      cy + (dy + (hash(i, seed, 72) - 0.5) * 0.1) * R * 1.15,
      rr * R * 1.2
    ]);
    const P = new Pix(w, h);
    const leaves = canopy(clumps, w, Math.ceil(cy + R * 1.0), 0, undefined, fruit ? Math.round(R / 2) : 0);
    const tr = new Pix(w, h);
    trunk(tr, Math.round(cx), Math.round(cy + R * 0.3), h - 2, 3);
    outline(tr, "b0");
    blitPix(P, tr, 0, 0);
    blitPix(P, leaves, 0, 0);
    return P;
  }

  function willowPix(r, seed) {
    const R = Math.max(10, Math.round(r / 2));
    const w = Math.ceil(R * 3) + 6;
    const h = Math.ceil(R * 2.5) + 4;
    const cx = w / 2;
    const base = h - 2;
    const domeY = base - R * 1.3;
    const P = new Pix(w, h);
    // Trunk, leaning a little.
    const tr = new Pix(w, h);
    trunk(tr, Math.round(cx + 1), Math.round(domeY), base, 3);
    outline(tr, "b0");
    blitPix(P, tr, 0, 0);
    // Back strands (darker), then the dome, then front strands (lighter).
    const strands = (front) => {
      for (let x = Math.round(cx - R * 1.15) + (front ? 1 : 0); x <= cx + R * 1.15; x += 2) {
        if (front && Math.abs(x - cx) < 3 && hash(x, seed, 83) < 0.6) continue;
        const u = (x - cx) / (R * 1.25);
        const start = domeY + Math.sqrt(Math.max(0, 1 - u * u)) * R * 0.32;
        const len = (base - start) * (0.7 + hash(x, seed, front ? 81 : 82) * 0.3) * (front ? 0.8 : 0.95);
        for (let s = 0; s < len; s += 1) {
          const sway = Math.round(Math.sin(s * 0.12 + x) * 0.6);
          const c = front ? (s % 4 === 0 ? "L4" : "L3") : s % 4 === 0 ? "L2" : "L1";
          P.set(x + sway, Math.round(start + s), c);
        }
        // Leaf tips.
        P.set(x, Math.round(start + len), front ? "L4" : "L2");
      }
    };
    strands(false);
    const clumps = [];
    for (let i = 0; i < 7; i += 1) {
      const u = (i - 3) / 3;
      clumps.push([cx + u * R * 0.85, domeY + Math.abs(u) * R * 0.18 - (1 - Math.abs(u)) * R * 0.25, R * (0.48 - Math.abs(u) * 0.08)]);
    }
    clumps.push([cx, domeY - R * 0.45, R * 0.55]);
    blitPix(P, canopy(clumps, w, h, 0), 0, 0);
    strands(true);
    return P;
  }

  function pinePix(s, snowy) {
    const k = s;
    const w = Math.ceil(20 * k) + 6;
    const h = Math.ceil(28 * k) + 6;
    const cx = Math.round(w / 2);
    const base = h - 2;
    const P = new Pix(w, h);
    const tr = new Pix(w, h);
    trunk(tr, cx, base - 6, base, 2);
    outline(tr, "b0");
    blitPix(P, tr, 0, 0);
    const tiers = [[-4, 9, 7], [-10, 7.5, 6.5], [-15.5, 6, 6], [-20.5, 4, 5.5]];
    const leaves = new Pix(w, h);
    for (const [oy, hw, th] of tiers) {
      const tb = base + oy * k;
      const W2 = hw * k;
      const H2 = th * k;
      for (let r = 0; r <= H2; r += 1) {
        const ww = Math.round(W2 * (r / H2));
        const y = Math.round(tb - H2 + r);
        for (let x = -ww; x <= ww; x += 1) {
          const u = x / (ww || 1);
          let c = u < -0.4 ? "L3" : u < 0.3 ? "L2" : "L1";
          if (r >= H2 - 1) c = "L1";
          if (snowy && r < H2 * 0.45 && u < 0.35) c = r < H2 * 0.22 ? "wh" : "s4";
          leaves.set(cx + x, y, c);
        }
      }
      // Jagged needle tips on the bottom edge.
      for (let x = -Math.round(W2); x <= W2; x += 2) leaves.set(cx + x, Math.round(tb) + 1, snowy && x < 0 ? "s4" : "L1");
    }
    outline(leaves, "L0");
    blitPix(P, leaves, 0, 0);
    return P;
  }

  // A cached house-style sprite per prop shape (same args, same sprite).
  const terrainCache = new Map();
  function cached(key, make) {
    let p = terrainCache.get(key);
    if (!p) {
      p = make();
      terrainCache.set(key, p);
    }
    return p;
  }

  window.houseProps = {
    paletteCtx,
    paintProps,
    oakTree(g, rng, x, y, r, opts = {}) {
      const seed = Math.floor(rng() * 1000);
      softShadow(g, x + 6, y + 2, r * 1.1, r * 0.35);
      stampPix(g, cached(`oak|${Math.round(r)}|${opts.fruit ? 1 : 0}|${seed % 5}`, () => oakPix(r, opts.fruit, seed % 5)), x, y + 4);
      return true;
    },
    willowTree(g, rng, x, y, r) {
      const seed = Math.floor(rng() * 1000);
      softShadow(g, x + 6, y + 2, r * 1.3, r * 0.4);
      stampPix(g, cached(`willow|${Math.round(r)}|${seed % 3}`, () => willowPix(r, seed % 3)), x, y + 4);
      return true;
    },
    pineTree(g, x, y, s, snowy) {
      softShadow(g, x + 6, y + 2, 16 * s, 5 * s);
      stampPix(g, cached(`pine|${s.toFixed(2)}|${snowy ? 1 : 0}`, () => pinePix(s, snowy)), x, y + 4);
      return true;
    },
    stamp(g, name, x, y, flip, big) {
      if (name === "barrel") {
        softShadow(g, x + 2, y - 2, 14, 4);
        stampPix(g, barrel(), x, y + 6, flip);
        return true;
      }
      return false;
    }
  };

  /* ---------- campfire, Lulu's stall and stone pillars ---------- */
  // Campfire: a ring of round stones around an ash bed, logs and the flame.
  function stonePix(rx, ry) {
    const P = new Pix(Math.ceil(rx * 2) + 2, Math.ceil(ry * 2) + 2);
    ell(P, rx + 1, ry + 1, rx, ry, (nx, ny) => {
      const l = lit(nx, ny);
      return ny > 0.6 ? "s2" : l > 0.45 ? "s5" : l > -0.25 ? "s4" : "s3";
    });
    return outline(P);
  }
  function campfirePix(f) {
    const P = new Pix(30, 24);
    ell(P, 15, 18, 11, 3.5, (nx) => (Math.abs(nx) < 0.5 ? "d1" : "b1"));
    for (const [x, y] of [[5, 14], [10, 13], [17, 13], [22, 14]]) blitPix(P, stonePix(2.5, 2), x, y);
    blitPix(P, campfireFrame(f), 8, 2);
    for (const [x, y] of [[1, 17], [6, 19], [12, 20], [18, 19], [24, 17]]) blitPix(P, stonePix(2.5, 2), x, y);
    return P;
  }
  window.drawCampfire = function drawCampfireHouse(room) {
    const { x, y } = campfireSpot(room);
    const lit = state.checkpoint === room.index;
    ctx.fillStyle = "rgba(255, 170, 60, 0.12)";
    ctx.beginPath();
    ctx.arc(x, y, 60 + Math.sin(state.anim * 6) * 4, 0, Math.PI * 2);
    ctx.fill();
    const f = Math.floor(state.anim * 8) % 4;
    blit(sprite(`campfire|${f}`, () => campfirePix(f)), x - 15 * PX, y + 20 - 24 * PX);
    if (Math.random() < 0.15) burst(x + rand(-8, 8), y - 14, ["#fff0a3", "#e08a2e"], 1, 30, { lift: 50 });
    outlinedText(lit ? "Campfire (resting spot)" : "Campfire", x, y + 36, { size: 12, align: "center", color: lit ? "#f6c85f" : "#f8ead2" });
  };

  // Lulu's stall: two posts behind the llama, then the plank counter with
  // wares and the striped awning in front of it.
  function stallPostsPix() {
    const P = new Pix(50, 34);
    for (const px of [2, 45]) rect(P, px, 1, 3, 32, (i) => (i === 0 ? "b3" : i === 1 ? "b2" : "b1"));
    return outline(P);
  }
  function awningPix() {
    const P = new Pix(50, 11);
    for (let x = 1; x < 49; x += 1) {
      const stripe = Math.floor((x - 1) / 6) % 2 === 0;
      for (let y = 1; y < 8; y += 1) P.set(x, y, stripe ? (y < 3 ? "r3" : y < 6 ? "r2" : "r1") : y < 3 ? "wh" : y < 6 ? "d5" : "d4");
      const sc = (x - 1) % 6;
      if (sc >= 1 && sc <= 4) P.set(x, 8, stripe ? "r1" : "d4");
      if (sc >= 2 && sc <= 3) P.set(x, 9, stripe ? "r0" : "d3");
    }
    return outline(P);
  }
  function counterPix() {
    const P = new Pix(50, 18);
    rect(P, 1, 4, 48, 12, (i, j) => {
      if (j === 0) return "d4";
      if (j === 1) return "b3";
      if (j === 11) return "b0";
      if (i % 9 === 4) return "b1";
      return j < 5 ? "b2" : "b1";
    });
    // Wares: a stack of gold, a blue potion, a red potion.
    rect(P, 6, 2, 4, 2, (i, j) => (j === 0 ? "y3" : i < 2 ? "y2" : "y1"));
    rect(P, 13, 1, 3, 3, (i, j) => (j === 0 ? "s4" : i === 0 ? "w4" : "w3"));
    rect(P, 19, 2, 2, 2, (i) => (i === 0 ? "r3" : "r2"));
    return outline(P);
  }
  window.drawShopStall = function drawShopStallHouse(room) {
    const { x, y } = shopSpot(room);
    const spots = stallPropSpots(room);
    if (spots) {
      const [[potX, potY], [anvX, anvY]] = spots;
      const f = Math.floor(state.anim * 8) % 4;
      drawShadow(potX, potY - 2, 46);
      drawShadow(anvX, anvY - 2, 34);
      blit(sprite(`cauldron|${f}`, () => cauldron(f)), potX - 16 * PX, potY - 30 * PX);
      blit(sprite("anvil", anvil), anvX - 16 * PX, anvY - 30 * PX);
    }
    drawShadow(x, y + 38, 96);
    blit(sprite("stallPosts", stallPostsPix), x - 25 * PX, y - 32);
    drawLlama(ctx, x + 6, y + 18, 40, state.anim);
    blit(sprite("stallCounter", counterPix), x - 25 * PX, y + 4);
    blit(sprite("stallAwning", awningPix), x - 25 * PX, y - 44);
    const near = activePlayers().some((p) => p.hp > 0 && Math.hypot(p.x - x, p.y - (y + 30)) < 90);
    outlinedText(near ? "Lulu's Stall: walk in!" : "Lulu's Stall", x, y + 52, { size: 12, align: "center", color: "#ffd166" });
  };

  // Stone pillar: capital, fluted shaft, base, a little moss.
  function pillarPix(w, h) {
    const W2 = Math.round(w / PX) + 4;
    const H2 = Math.round(h / PX) + 2;
    const P = new Pix(W2 + 2, H2 + 2);
    rect(P, 1, 1, W2, 3, (i, j) => (j === 0 ? "s5" : j === 1 ? "s4" : "s3"));
    rect(P, 3, 4, W2 - 4, H2 - 6, (i) => {
      const u = i / (W2 - 5);
      if (i % 3 === 2) return u < 0.5 ? "s3" : "s1";
      return u < 0.25 ? "s4" : u < 0.65 ? "s3" : "s2";
    });
    rect(P, 1, H2 - 2, W2, 3, (i, j) => (j === 0 ? "s4" : j === 1 ? "s2" : "s1"));
    P.set(4, 7, "g4");
    P.set(5, 7, "g3");
    P.set(4, 8, "g3");
    P.set(W2 - 3, H2 - 3, "g3");
    return outline(P);
  }
  window.drawPillar = function drawPillarHouse(crate) {
    const { x, y, w, h } = crate;
    drawShadow(x + w / 2 + 2, y + h, w + 10);
    blit(sprite(`pillar|${w}|${h}`, () => pillarPix(w, h)), x - 3 * PX, y - 3 * PX);
  };


  /* ---------- depth: props in front of or behind people ----------
     The room background still has every terrain prop baked in (no per-frame
     cost). paintProps also keeps each prop as its own small sprite, so:
     - a wizard, monster or pet standing behind a prop (feet above its base)
       gets that prop drawn over them again; tall props go see-through so
       you never lose sight of yourself or a monster;
     - barrels are drawn in base order and tucked behind props in front;
     - barrels, Lulu's cauldron and anvil, and boss chests never land on a
       prop: they move to the nearest clear spot when the room first shows. */
  const even = (v) => Math.round(v / 2) * 2;
  let scratch = null;
  // Paint one prop into a scratch canvas with its base at (w / 2, h - baseY).
  // Returns the image data, or null when the prop ran off the edge.
  function paintOne(p, rng, w, h, baseY) {
    if (!scratch || scratch.width < w || scratch.height < h) {
      scratch = document.createElement("canvas");
      scratch.width = Math.max(w, scratch ? scratch.width : 0);
      scratch.height = Math.max(h, scratch ? scratch.height : 0);
    }
    const sg = scratch.getContext("2d", { willReadFrequently: true });
    const ox = even(p.x - w / 2);
    const oy = even(p.y - (h - baseY));
    sg.setTransform(1, 0, 0, 1, 0, 0);
    sg.clearRect(0, 0, scratch.width, scratch.height);
    sg.setTransform(1, 0, 0, 1, -ox, -oy);
    p.draw(paletteCtx(sg), rng);
    sg.setTransform(1, 0, 0, 1, 0, 0);
    const img = sg.getImageData(0, 0, w, h);
    const d = img.data;
    for (let x = 0; x < w; x += 1) if (d[x * 4 + 3] || d[((h - 1) * w + x) * 4 + 3]) return null;
    for (let y = 0; y < h; y += 1) if (d[y * w * 4 + 3] || d[(y * w + w - 1) * 4 + 3]) return null;
    return { img, ox, oy };
  }
  function paintProps(g, props, rng, room) {
    const list = [];
    for (const p of props) {
      let w = even(Math.max(200, p.r * 5));
      let h = even(Math.max(240, p.r * 6));
      let baseY = even(Math.max(60, p.r * 1.4));
      // A prop draws with random numbers, so a retry must replay the same
      // ones: remember the generator's position by copying its draws.
      const draws = [];
      const rec = () => {
        const v = rng();
        draws.push(v);
        return v;
      };
      let got = paintOne(p, rec, w, h, baseY);
      while (!got && w < 2000) {
        w *= 2;
        h *= 2;
        baseY *= 2;
        let k = 0;
        got = paintOne(p, () => (k < draws.length ? draws[k++] : rec()), w, h, baseY);
      }
      if (!got) continue;
      const { img, ox, oy } = got;
      const d = img.data;
      let sx0 = w, sy0 = h, sx1 = -1, sy1 = -1;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const a = d[(y * w + x) * 4 + 3];
          if (!a) continue;
          if (a === 255) {
            if (x < sx0) sx0 = x;
            if (x > sx1) sx1 = x;
            if (y < sy0) sy0 = y;
            if (y > sy1) sy1 = y;
          }
        }
      }
      g.drawImage(scratch, 0, 0, w, h, ox, oy, w, h);
      if (sx1 < 0) continue;
      // The copy used for depth keeps only solid pixels: shadows stay on the ground.
      for (let i = 3; i < d.length; i += 4) if (d[i] !== 255) d[i] = 0;
      const sw = sx1 - sx0 + 1;
      const sh = sy1 - sy0 + 1;
      const solid = document.createElement("canvas");
      solid.width = sw;
      solid.height = sh;
      solid.getContext("2d").putImageData(img, -sx0, -sy0, sx0, sy0, sw, sh);
      list.push({ img: solid, x: ox + sx0, y: oy + sy0, w: sw, h: sh, base: p.y, tall: sh > 64 });
    }
    room.propSprites = list;
    return true;
  }

  const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  // Footprint of a barrel / chest / cauldron drawn with its feet at (cx, by).
  const standBox = (cx, by, half, tall) => ({ x: cx - half, y: by - tall, w: half * 2, h: tall });
  // A spot is clear when nothing solid, hazardous or already drawn there.
  function spotClear(room, box, skip) {
    if (box.x < 44 || box.x + box.w > WIDTH - 44 || box.y < 44 || box.y + box.h > HEIGHT - 40) return false;
    const at = window.blockDungeon.terrainAt;
    if (at) {
      for (let y = box.y + box.h * 0.5; y <= box.y + box.h; y += 8) {
        for (let x = box.x; x <= box.x + box.w; x += 8) if (BAD_GROUND.has(at(x, y))) return false;
      }
    }
    for (const s of room.propSprites || []) if (overlaps(box, { x: s.x - 6, y: s.y - 6, w: s.w + 12, h: s.h + 12 })) return false;
    for (const c of room.crates) {
      if (c === skip || c.hp <= 0) continue;
      const cb = c.stone || c.hidden ? c : standBox(c.x + c.w / 2, c.y + c.h, 18, 50);
      if (overlaps(box, { x: cb.x - 4, y: cb.y - 4, w: cb.w + 8, h: cb.h + 8 })) return false;
    }
    if (hasCampfire(room) && !room.tree) {
      const f = campfireSpot(room);
      if (overlaps(box, { x: f.x - 44, y: f.y - 40, w: 88, h: 84 })) return false;
    }
    if (hasShop(room)) {
      const sp = shopSpot(room);
      if (overlaps(box, { x: sp.x - 56, y: sp.y - 50, w: 112, h: 110 })) return false;
      for (const [px, py] of room.stallProps || []) if (overlaps(box, { x: px - 30, y: py - 62, w: 60, h: 66 })) return false;
    }
    // Keep doorways and the middle of the side walls free to walk through.
    if (box.y < HEIGHT / 2 + 70 && box.y + box.h > HEIGHT / 2 - 70 && (box.x < 110 || box.x + box.w > WIDTH - 110)) return false;
    return true;
  }
  // Nearest clear spot to (x, by) on a widening ring, or null.
  function nearestClear(room, x, by, half, tall, skip) {
    for (let d = 0; d < 360; d += 12) {
      const steps = d === 0 ? 1 : Math.max(8, Math.round(d / 6));
      for (let i = 0; i < steps; i += 1) {
        const a = (i / steps) * Math.PI * 2;
        const px = even(x + Math.cos(a) * d);
        const py = even(by + Math.sin(a) * d * 0.8);
        if (spotClear(room, standBox(px, py, half, tall), skip)) return [px, py];
      }
    }
    return null;
  }
  // Move barrels off props once, when the room's props are known.
  function settleCrates(room) {
    if (room.cratesSettled === room.propSprites) return;
    room.cratesSettled = room.propSprites;
    for (const c of room.crates) {
      if (c.hp <= 0 || c.stone || c.hidden || c.tree || c.terrain) continue;
      const cx = c.x + c.w / 2;
      const by = c.y + c.h;
      if (spotClear(room, standBox(cx, by, 18, 50), c)) continue;
      const spot = nearestClear(room, cx, by, 18, 50, c);
      if (!spot) continue;
      c.x = spot[0] - c.w / 2;
      c.y = spot[1] - c.h;
    }
  }

  // Props whose base is below `by` and that overlap `box` are in front of it.
  function drawPropsInFront(room, box, by, see) {
    for (const s of room.propSprites || []) {
      if (s.base <= by || s.drawn === drawStamp || !overlaps(box, s)) continue;
      s.drawn = drawStamp;
      if (see && s.tall) {
        ctx.globalAlpha = 0.55;
        ctx.drawImage(s.img, s.x, s.y);
        ctx.globalAlpha = 1;
      } else ctx.drawImage(s.img, s.x, s.y);
    }
  }
  let drawStamp = 0;
  // People (wizards, monsters, the pet): rough box and where their feet are.
  function bodies(room) {
    const out = [];
    for (const p of activePlayers()) out.push([p.x, p.y, 16, 34, 22]);
    for (const e of room.enemies) if (e.hp > 0) out.push([e.x, e.y, (e.size || 30) * 0.5, (e.size || 30) * 0.75, (e.size || 30) * 0.45]);
    const b = room.boss;
    if (b && (b.hp > 0 || b.friendly)) out.push([b.x, b.y, (b.size || 60) * 0.5, (b.size || 60) * 0.75, (b.size || 60) * 0.45]);
    if (pet) out.push([pet.x, pet.y, 14, 22, 10]);
    return out;
  }
  // Runs right after the wizards are drawn (just before projectiles).
  const drawProjectilesBefore = window.drawProjectiles;
  window.drawProjectiles = function drawProjectilesWithDepth() {
    const room = currentRoom();
    if (room && (room.propSprites || room.barrelSprites)) {
      drawStamp += 1;
      for (const [x, y, half, up, down] of bodies(room)) {
        const box = { x: x - half, y: y - up, w: half * 2, h: up + down };
        const feet = y + down;
        drawPropsInFront(room, box, feet, true);
        for (const s of room.barrelSprites || []) {
          if (s.base > feet && s.drawn !== drawStamp && overlaps(box, s)) {
            s.drawn = drawStamp;
            ctx.drawImage(s.img, s.dx, s.dy);
          }
        }
      }
    }
    drawProjectilesBefore();
  };

  // For tests and previews.
  window.blockDungeonProps = { spotClear, settleCrates, barrelPix, chest, cauldron, anvil, toCanvas, oakPix, willowPix, pinePix, campfirePix, pillarPix, paletteCtx };
})();
