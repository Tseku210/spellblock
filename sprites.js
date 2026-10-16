/* ---------- hand-made pixel sprites ----------
   Load this file after script.js. It replaces drawWizard, drawPet and
   drawNewPet with pixel-art versions.

   How it works:
   - A sprite is a list of text rows. Each letter is one pixel, a space is
     see-through, and a palette says which color each letter is.
   - pixelSheet() turns rows and a palette into a small canvas only once,
     then reuses it every frame (that's the cache).
   - Animations are made by picking a different set of rows each frame
     (walk steps, blinks, wing flaps), and by nudging parts by a pixel or two. */

const pixelCache = new Map();

// Draw rows of letters into a canvas, once per rows + palette combination.
function pixelSheet(key, rows, pal) {
  let sheet = pixelCache.get(key);
  if (sheet) return sheet;
  const width = Math.max(...rows.map((row) => row.length));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = rows.length;
  const g = canvas.getContext("2d");
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const color = pal[row[x]];
      if (!color) continue;
      g.fillStyle = color;
      g.fillRect(x, y, 1, 1);
    }
  });
  // A mirrored copy for facing left, and an all-white copy for the hit flash.
  const flip = document.createElement("canvas");
  flip.width = width;
  flip.height = rows.length;
  const fg = flip.getContext("2d");
  fg.scale(-1, 1);
  fg.drawImage(canvas, -width, 0);
  const white = document.createElement("canvas");
  white.width = width;
  white.height = rows.length;
  const wg = white.getContext("2d");
  wg.drawImage(canvas, 0, 0);
  wg.globalCompositeOperation = "source-in";
  wg.fillStyle = "#ffffff";
  wg.fillRect(0, 0, width, rows.length);
  const whiteFlip = document.createElement("canvas");
  whiteFlip.width = width;
  whiteFlip.height = rows.length;
  const wfg = whiteFlip.getContext("2d");
  wfg.scale(-1, 1);
  wfg.drawImage(white, -width, 0);
  sheet = { canvas, flip, white, whiteFlip, width, height: rows.length };
  pixelCache.set(key, sheet);
  return sheet;
}

// Put a sheet on screen with its top-left at (x, y), snapped to whole pixels.
function blit(g, sheet, x, y, flipped = false, white = false) {
  const image = white ? (flipped ? sheet.whiteFlip : sheet.white) : flipped ? sheet.flip : sheet.canvas;
  const smooth = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  g.drawImage(image, Math.round(x), Math.round(y));
  g.imageSmoothingEnabled = smooth;
}

// Lighter or darker version of a hex color, as a hex color.
function tint(hex, amount) {
  const rgb = shade(hex, amount).match(/\d+/g).map(Number);
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// Change some rows of a sprite: edits is { rowNumber: "new row" }.
function withRows(rows, edits) {
  return rows.map((row, i) => (edits[i] !== undefined ? edits[i] : row));
}

// Move the pixels of one letter left or right inside some rows (used for eyes).
function shiftLetter(rows, letter, from, to, dx, fill) {
  return rows.map((row, i) => {
    if (i < from || i > to || !dx) return row;
    const chars = [...row];
    const spots = [];
    chars.forEach((ch, x) => {
      if (ch === letter) {
        spots.push(x);
        chars[x] = fill;
      }
    });
    spots.forEach((x) => (chars[x + dx] = letter));
    return chars.join("");
  });
}

// Pixel-perfect thick line, used for the staff so it can point any way.
function pixelLine(g, x0, y0, x1, y1, color, size) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  g.fillStyle = color;
  const half = Math.floor(size / 2);
  for (let guard = 0; guard < 200; guard += 1) {
    g.fillRect(x0 - half, y0 - half, size, size);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/* ---------- 2x pixels ----------
   Every sprite pixel is drawn as a 2 x 2 block on screen, and sprites are
   placed on even screen pixels, so all art in the game shares one pixel
   grid. */

const PX = 2;
const snap = (v) => Math.round(v / PX) * PX;

// Put a sheet on screen at 2x with its top-left at (x, y).
function blit2(g, sheet, x, y, flipped = false, white = false) {
  const image = white ? (flipped ? sheet.whiteFlip : sheet.white) : flipped ? sheet.flip : sheet.canvas;
  const smooth = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  g.drawImage(image, snap(x), snap(y), sheet.width * PX, sheet.height * PX);
  g.imageSmoothingEnabled = smooth;
}

// A line of 2 x 2 blocks on the shared grid (for the staff, which can point
// any way). size is in sprite pixels.
function pixelLine2(g, x0, y0, x1, y1, color, size = 1) {
  let ax = Math.round(x0 / PX);
  let ay = Math.round(y0 / PX);
  const bx = Math.round(x1 / PX);
  const by = Math.round(y1 / PX);
  const dx = Math.abs(bx - ax);
  const dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx + dy;
  const half = Math.floor(size / 2);
  g.fillStyle = color;
  for (let guard = 0; guard < 100; guard += 1) {
    g.fillRect((ax - half) * PX, (ay - half) * PX, size * PX, size * PX);
    if (ax === bx && ay === by) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      ax += sx;
    }
    if (e2 <= dx) {
      err += dx;
      ay += sy;
    }
  }
}

/* ---------- the wizard ----------
   16 x 23 sprite pixels (32 x 46 on screen). Letters:
   o outline, H/h/j hat (base, shadow, light), Y/y gold, S/s skin,
   w/e eye white and pupil, c cheeks, W/V beard and hair,
   R/r/l robe (base, shadow, light), B boots. */

const WIZ_FRONT = [
  "         oo     ",
  "        ojHo    ",
  "       ojHho    ",
  "       oHHho    ",
  "      ojHHhho   ",
  "      oHHYHho   ",
  "     ojHYYYhho  ",
  "    oyYYYYYYyo  ",
  "  oojjjHHHHhhhoo",
  "  oohhhhhhhhhhoo",
  "   oSSSSSSSSso  ",
  "   oSweSSSweso  ",
  "   oSweSSSweso  ",
  "   ocSSSSSSSco  ",
  "   oWWWsssWWVo  ",
  "  oRoWWWWWWVoRo ",
  " olRRoWWWWVoRrro",
  " oSRRRoWWVoRRrSo",
  " oyYYYYoooYYYyyo",
  " olRRRRRRRRRRrro",
  " orrrrrrrrrrrrro",
  "  oBBo    oBBo  ",
  "  oooo    oooo  "
];

// Back view: white hair where the face was, and no beard.
const WIZ_BACK = withRows(WIZ_FRONT, {
  10: "   oWWWWWWWWVo  ",
  11: "   oWWWWWWWWVo  ",
  12: "   oWWWWWWWWVo  ",
  13: "   oVWWWWWWVVo  ",
  14: "   oVWWWWWWVVo  ",
  15: "  oRoVVWWVVoRo ",
  16: " olRRooVVVooRrro",
  17: " oSRRRRoooRRRrSo",
  18: " oyYYYYYYYYYYyyo"
});

// Without the pointy hat (when wearing a trophy hat): a tuft of white hair.
const HATLESS = {
  0: "", 1: "", 2: "", 3: "", 4: "", 5: "", 6: "", 7: "",
  8: "    ooooooooo   ",
  9: "   oWWWWWWWWVo  "
};

// Walking: one boot tucks under the robe, then the other.
const WIZ_STEPS = [
  null,
  { 21: "  oBBo    oooo  ", 22: "  oooo          " },
  null,
  { 21: "  oooo    oBBo  ", 22: "          oooo  " }
];

function wizardSheet(robeIndex, view, opts) {
  const robe = robes[robeIndex] || robes[0];
  const key = `wiz2|${robeIndex}|${view}|${opts.hatless ? 1 : 0}|${opts.eyes}|${opts.blink ? 1 : 0}|${opts.sway ? 1 : 0}|${opts.step}`;
  if (pixelCache.has(key)) return pixelCache.get(key);
  let rows = view === "back" ? WIZ_BACK : WIZ_FRONT;
  if (view === "front") {
    if (opts.blink) rows = withRows(rows, { 11: "   oSSSSSSSSso  ", 12: "   oSssSSSssso  " });
    else if (opts.eyes === 0) rows = withRows(rows, { 11: "   oSweSSewSso  ", 12: "   oSweSSewSso  " });
  }
  if (WIZ_STEPS[opts.step]) rows = withRows(rows, WIZ_STEPS[opts.step]);
  if (opts.hatless) rows = withRows(rows, HATLESS);
  else if (opts.sway) rows = rows.map((row, i) => (i < 5 ? ` ${row}` : row));
  const pal = {
    o: "#1b1226",
    H: robe.hat,
    h: tint(robe.hat, -0.32),
    j: tint(robe.hat, 0.3),
    Y: "#f6c85f",
    y: "#b9862c",
    S: "#f0c78a",
    s: "#c9925c",
    w: "#ffffff",
    e: "#2a1b11",
    c: "#f2a0a0",
    W: "#f4f1ea",
    V: "#c4bdb0",
    R: robe.robe,
    r: robe.trim,
    l: tint(robe.robe, 0.35),
    B: "#6b4226"
  };
  return pixelSheet(key, rows, pal);
}

// Remembers what each wizard was doing last frame, to spot a cast or a hit.
const wizardMemory = new WeakMap();

function wizardActivity(x, y) {
  const p = players.find((who) => Math.abs(who.x - x) < 0.5 && Math.abs(who.y - y) < 0.5);
  if (!p) return null;
  let memo = wizardMemory.get(p);
  if (!memo) {
    memo = { shot: 0, inv: 0, castAt: -9, hurtAt: -9 };
    wizardMemory.set(p, memo);
  }
  const now = state.anim;
  if (p.shotCooldown > memo.shot + 0.05) memo.castAt = now;
  if (p.invulnerable > memo.inv + 0.3 && p.dashTime <= 0) memo.hurtAt = now;
  memo.shot = p.shotCooldown;
  memo.inv = p.invulnerable;
  return { p, cast: now - memo.castAt, hurt: now - memo.hurtAt };
}

function drawWizard(g, x, y, robeIndex, dirX, dirY, t, moving, hatId = 0) {
  const act = wizardActivity(x, y);
  const back = dirY < -0.45;
  const face = dirX < -0.2 ? -1 : 1;
  const casting = act && act.cast < 0.18;
  const hurt = act && act.hurt < 0.14;
  const dashing = act && act.p.dashTime > 0;

  // Walking: 4 steps with a little bob; standing still: slow breathing.
  const step = moving ? Math.floor(t * 9) % 4 : 0;
  let bob = moving ? (step % 2 ? -PX : 0) : Math.floor(t * 1.6) % 2 ? PX : 0;
  if (casting) bob += PX;
  const blink = !moving && t % 3.3 < 0.13;
  const look = back ? 0 : Math.abs(dirX) > 0.35 ? 1 : 0;
  const sheet = wizardSheet(robeIndex, back ? "back" : "front", {
    hatless: hatId !== 0,
    eyes: look,
    blink,
    step,
    sway: !moving && Math.floor(t * 1.2) % 2 === 1
  });

  // Shadow.
  g.fillStyle = "rgba(0, 0, 0, 0.25)";
  g.fillRect(snap(x - 12), snap(y + 14), 24, 4);

  const left = snap(x - 16);
  const top = snap(y + 16 - 46) + bob;

  // Dash: two fading copies trail behind.
  if (dashing) {
    const px = act.p.dashX || dirX;
    const py = act.p.dashY || dirY;
    for (let k = 2; k >= 1; k -= 1) {
      g.globalAlpha = 0.18 * (3 - k);
      blit2(g, sheet, left - px * 10 * k, top - py * 10 * k, face < 0);
    }
    g.globalAlpha = 1;
  }

  const hand = { x: x + face * 13, y: top + 35 };
  const staff = act && act.p.staff && typeof staffInfo === "function" ? { id: act.p.staff.id, ...staffInfo(act.p.staff) } : null;
  if (back) drawPixelStaff(g, hand, dirX, dirY, t, casting, staff);
  blit2(g, sheet, left, top, face < 0, hurt);
  if (hatId !== 0) drawPixelHat(g, hatId, x, top + 36, face, t, robeIndex);
  if (!back) drawPixelStaff(g, hand, dirX, dirY, t, casting, staff);
}

// Trophy hats are drawn by the game in screen pixels. Draw each one once
// into a spare canvas, keep every other pixel, and show it with 2x pixels
// like everything else (kept per hat, facing and animation frame).
const hatScratch = document.createElement("canvas");
hatScratch.width = 64;
hatScratch.height = 64;
const hatScratchCtx = hatScratch.getContext("2d", { willReadFrequently: true });

function drawPixelHat(g, id, x, y, face, t, robeIndex) {
  const frame = Math.floor(t * 8) % 48;
  const key = `hat2|${id}|${face}|${robeIndex}|${frame}`;
  let sheet = pixelCache.get(key);
  if (!sheet) {
    const q = hatScratchCtx;
    q.clearRect(0, 0, 64, 64);
    drawHat(q, id, 32, 52, face, frame / 8, robes[robeIndex] || robes[0]);
    const src = q.getImageData(0, 0, 64, 64).data;
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const c = canvas.getContext("2d");
    const out = c.createImageData(32, 32);
    for (let j = 0; j < 32; j += 1) {
      for (let i = 0; i < 32; i += 1) {
        const si = ((j * 2 + 1) * 64 + i * 2 + 1) * 4;
        const di = (j * 32 + i) * 4;
        if (src[si + 3] < 128) continue;
        out.data[di] = src[si];
        out.data[di + 1] = src[si + 1];
        out.data[di + 2] = src[si + 2];
        out.data[di + 3] = 255;
      }
    }
    c.putImageData(out, 0, 0);
    sheet = { canvas, width: 32, height: 32 };
    pixelCache.set(key, sheet);
  }
  blit2(g, sheet, x - 32, y - 52);
}

// The staff points where you aim. Casting makes the gem flash. Found staffs
// keep their own wood and gem colors.
function drawPixelStaff(g, hand, dirX, dirY, t, casting, staff = null) {
  const wood = staff ? staff.wood : "#8b5a2b";
  const gemColor = staff ? staff.gem : "#fff2a3";
  const [gr, gg, gb] = hexRgb(gemColor);
  const len = Math.hypot(dirX, dirY) || 1;
  const ux = dirX / len;
  const uy = dirY / len;
  const kick = casting ? -2 : 0;
  const bx = hand.x - ux * 10 + ux * kick;
  const by = hand.y - uy * 10 + 6 + uy * kick;
  const tx = hand.x + ux * (14 + kick);
  const ty = hand.y + uy * (14 + kick);
  pixelLine2(g, bx, by, tx, ty, "#1b1226", 3);
  pixelLine2(g, bx, by, tx, ty, wood, 1);
  if (staff && staff.id === "cactus") {
    g.fillStyle = "#2f6b37";
    g.fillRect(snap(bx + (tx - bx) * 0.5 - 4), snap(by + (ty - by) * 0.5), 2, 2);
  } else if (staff && staff.id === "bone") {
    g.fillStyle = "#e8e2cf";
    g.fillRect(snap(bx - 2), snap(by - 2), 4, 4);
  } else if (staff && staff.id === "storm") {
    g.fillStyle = "#ffe45c";
    g.fillRect(snap(bx + (tx - bx) * 0.5), snap(by + (ty - by) * 0.5), 2, 2);
  }
  // Hand.
  const hx = snap(hand.x - 3);
  const hy = snap(hand.y - 2);
  g.fillStyle = "#1b1226";
  g.fillRect(hx - 2, hy - 2, 8, 8);
  g.fillStyle = "#f0c78a";
  g.fillRect(hx, hy, 4, 4);
  // Gem with a soft glow.
  const gx = snap(tx + ux * 4);
  const gy = snap(ty + uy * 4);
  const pulse = casting ? 1 : 0.35 + Math.sin(t * 8) * 0.15;
  const glow = g.createRadialGradient(gx, gy, 0, gx, gy, casting ? 18 : 12);
  glow.addColorStop(0, `rgba(${gr}, ${gg}, ${gb}, ${pulse})`);
  glow.addColorStop(1, `rgba(${gr}, ${gg}, ${gb}, 0)`);
  g.fillStyle = glow;
  g.fillRect(gx - 18, gy - 18, 36, 36);
  const gem = pixelSheet(casting ? "gem2-cast" : `gem2${gemColor}`, casting ? [" o ", "oqo", " o "] : [" o ", "oGo", " o "], {
    o: "#1b1226",
    q: "#ffffff",
    G: gemColor
  });
  blit2(g, gem, gx - 3, gy - 3);
  if (!casting) {
    g.fillStyle = "rgba(255, 255, 255, 0.8)";
    g.fillRect(snap(gx - 1), snap(gy - 1), 2, 2);
  }
}

/* ---------- pets ----------
   Same 2x pixels. "hop" moves forward while the pet runs, so the frame
   number comes from it; "t" is the clock for idle wiggles. */

// Pixel the fox, facing right. Two tail positions for wagging.
const FOX_A = [
  "          o  o  ",
  "         oFooFo ",
  "         oFFFFFo",
  "  ooo   oFFEFFEo",
  " oTFFo  oFFFFWNo",
  "oTTFFFoooFFWWWoo",
  "oTTFFFFFFFFWWo  ",
  " ooFFFFFFFFFFo  ",
  "   oFWWWWWWFFo  ",
  "   ofWWWWWWffo  "
];
const FOX_B = withRows(FOX_A, {
  2: " oo      oFFFFFo",
  3: "oTFo    oFFEFFEo",
  4: "oTTFo   oFFFFWNo",
  5: "oTTFFooooFFWWWoo",
  6: " oFFFFFFFFFWWo  "
});
const FOX_LEGS = [
  ["   oFo oFo oFo  ", "   ooo ooo ooo  "],
  ["  oFo  oFo  oFo ", "  ooo  ooo  ooo "]
];
const FOX_TAIL = [" ooo ", "oTFFo", "oTTFFo", "oTTFFo", " ooo"];

function foxPalette(look) {
  const kind = look.evo ? petKinds[look.evo] : null;
  const body = kind ? kind.color : "#fb923c";
  return {
    o: "#2a160c",
    F: body,
    f: tint(body, -0.3),
    W: "#fde7d0",
    T: kind ? kind.tip : "#ffffff",
    P: "#ffb3a7",
    E: "#1a120c",
    N: "#1a120c"
  };
}

function drawPet(g, x, y, face, hop, t, look = { evo: stats.petEvo, mega: stats.petMega }) {
  const pal = foxPalette(look);
  const key = `fox2|${look.evo || "base"}`;
  const flame = look.evo === "flame" && Math.floor(t * 8) % 2 === 0;
  const lift = Math.abs(Math.sin(hop)) > 0.5 ? PX * 2 : Math.abs(Math.sin(hop)) > 0.15 ? PX : 0;
  const running = Math.abs(Math.sin(hop)) > 0.05;
  const frame = running && Math.sin(hop * 2) > 0 ? 1 : 0;
  const blink = t % 2.7 < 0.12;
  const wag = Math.floor(t * 6) % 2;
  g.fillStyle = "rgba(0, 0, 0, 0.25)";
  g.fillRect(snap(x - 12), snap(y + 8), 24, 4);
  const flip = face < 0;
  const left = snap(x - 16);
  const top = snap(y - 14) - lift;
  const bodyPal = flame ? { ...pal, T: "#ff742e" } : pal;
  // The nine-tailed form fans four more tails out behind.
  if (look.mega) {
    const tail = pixelSheet(`${key}|tail|${flame ? 1 : 0}`, FOX_TAIL, bodyPal);
    for (const off of [-6, -2, 2, 6]) {
      const tx = flip ? left + 22 + Math.abs(off) * 0.5 : left - 2 - Math.abs(off) * 0.5;
      blit2(g, tail, tx, top + 4 + off + (wag ? PX : 0), flip);
    }
  }
  const legs = pixelSheet(`${key}|legs${frame}`, FOX_LEGS[frame], pal);
  blit2(g, legs, left, top + 20, flip);
  let body = wag ? FOX_B : FOX_A;
  if (blink) body = withRows(body, { 3: body[3].replace(/E/g, "F") });
  if (look.mega) body = withRows(body, { 1: "         oToaTo ".replace("a", "o") });
  const sheet = pixelSheet(`${key}|body|${wag}|${blink ? 1 : 0}|${look.mega ? 1 : 0}|${flame ? 1 : 0}`, body, bodyPal);
  blit2(g, sheet, left, top, flip);
}

const PET_ART = {
  owl: {
    pal: { o: "#2a1a0e", B: "#8a6a43", b: "#6b4f30", L: "#b08a5c", W: "#ffffff", E: "#120c08", Y: "#f6a03a", C: "#e8d2a6", c: "#c9ae80" },
    frames: [
      [
        " oo     oo ",
        " oLoooooLo ",
        "oBBBBBBBBBo",
        "oBWWWBWWWBo",
        "oBWEWBWEWBo",
        "oBWWoYoWWBo",
        "obBBBYBBBbo",
        "obCcCCCcCbo",
        "obCCcCcCCbo",
        " obCCCCCbo ",
        "  oYo oYo  ",
        "  ooo ooo  "
      ]
    ],
    blink: { 4: "oBbbbBbbbBo" },
    wings: [["ob", "obb", "obb", "ob"], ["o", "ob", "obb", "obbo"]]
  },
  hatchling: {
    pal: { o: "#1a0a08", R: "#ef5b4b", r: "#b33a2e", L: "#ff8a75", Y: "#ffd166", y: "#e0a63c", W: "#ffffff", E: "#120c08", H: "#ffd166" },
    frames: [
      [
        "        oo   ",
        "       oHLo  ",
        "      oLRRRo ",
        "      oRRWEoo",
        " oo   oRRRRRRo",
        "oRRo  oRRRrrro",
        "oRRRooooRRoooo",
        " oRRRRRRRRo  ",
        " oRRRYYYYRo  ",
        "  oRYyYyYRo  ",
        "   oRRRRRo   ",
        "   oRo oRo   ",
        "   ooo ooo   "
      ],
      [
        "        oo   ",
        "       oHLo  ",
        "      oLRRRo ",
        "      oRRWEoo",
        " oo   oRRRRRRo",
        "oRRo  oRRRrrro",
        "oRRRooooRRoooo",
        " oRRRRRRRRo  ",
        " oRRRYYYYRo  ",
        "  oRYyYyYRo  ",
        "   oRRRRRo   ",
        "    oRooRo   ",
        "    ooooo    "
      ]
    ],
    wings: [[" oo", "oLro", "oro"], ["", "oLro", "orrro", " ooo"]]
  },
  turtle: {
    pal: { o: "#183018", G: "#4ade80", g: "#2f8a4f", L: "#a7f3b0", D: "#2f5e2f", S: "#86c06c", s: "#5e9a4a", E: "#120c08", Y: "#d9c27a" },
    frames: [
      [
        "   oooooo     ",
        "  oGLLGGGo    ",
        " oGLGGgGGGo ooo",
        " oGgGGGgGLGooSSo",
        "oDDDDDDDDDDDoSESo",
        "oYYYYYYYYYYYoSSso",
        " oSSoooooSSooooo",
        " oooo    oooo"
      ],
      [
        "   oooooo     ",
        "  oGLLGGGo    ",
        " oGLGGgGGGo ooo",
        " oGgGGGgGLGooSSo",
        "oDDDDDDDDDDDoSESo",
        "oYYYYYYYYYYYoSSso",
        "  oSSooooooSSoooo",
        "  oooo     oooo"
      ]
    ]
  },
  slime: {
    pal: { o: "#0e2a3a", B: "rgba(125, 211, 252, 0.9)", b: "rgba(70, 160, 210, 0.9)", W: "rgba(255, 255, 255, 0.85)", E: "#0e2a3a", P: "#ff9ff3" },
    frames: [
      [
        "    oPo    ",
        "    oPo    ",
        "  ooooooo  ",
        " oWWBBBBBo ",
        "oBWBBEBEBBo",
        "oBBBBEBEBBo",
        "obBBBBBBBbo",
        " obbbbbbbo ",
        "  ooooooo  "
      ],
      [
        "           ",
        "    oPo    ",
        "    oPo    ",
        "  ooooooooo ",
        " oWWBBBBBBBo",
        "oBWBBBEBEBBBo",
        "obBBBBEBEBBbo",
        " obbbbbbbbbo ",
        "  ooooooooo  "
      ]
    ]
  },
  bat: {
    pal: { o: "#1a0d2e", V: "#c084fc", v: "#7c3aed", L: "#f5d0fe", P: "#ff9ff3", W: "#ffffff", E: "#2a1b3d" },
    frames: [
      [
        "oo oo  oo oo",
        "ovooVooVoovo",
        "ovvoVVVVovvo",
        "ovVoEVVEoVvo",
        "oovoVPPVovoo",
        "   ooVVoo   ",
        "     oo     "
      ],
      [
        "   oo  oo   ",
        "   oVooVo   ",
        "  ooVVVVoo  ",
        " ovoEVVEovo ",
        "ovVoVPPVoVvo",
        "ovvooVVoovvo",
        "oo   oo   oo"
      ]
    ]
  }
};

function drawNewPet(g, kind, x, y, face, hop, t, self = {}) {
  const art = PET_ART[kind];
  if (!art) return;
  const lift = Math.abs(Math.sin(hop)) > 0.4 ? PX : 0;
  g.fillStyle = "rgba(0, 0, 0, 0.25)";
  g.fillRect(snap(x - 10), snap(y + 12), 20, 4);
  const flip = face < 0;
  // Fliers flap all the time; walkers step when they move.
  let frame = 0;
  if (kind === "bat") frame = Math.floor(t * 9) % 2;
  else if (kind === "slime") frame = Math.floor(t * 4) % 2;
  else if (art.frames.length > 1) frame = Math.abs(Math.sin(hop)) > 0.05 && Math.sin(hop * 2) > 0 ? 1 : 0;
  let rows = art.frames[frame];
  const blink = kind === "owl" && t % 3 < 0.15;
  if (blink) rows = withRows(rows, art.blink);
  const shy = kind === "turtle" && self.blockCd > 0;
  if (shy) rows = rows.map((row) => row.replace(/L/g, "g"));
  const sheet = pixelSheet(`pet2|${kind}|${frame}|${blink ? 1 : 0}|${shy ? 1 : 0}`, rows, art.pal);
  const hover = kind === "bat" || kind === "owl" ? (Math.sin(t * 4) > 0 ? PX : 0) : 0;
  const w = sheet.width * PX;
  const h = sheet.height * PX;
  const left = snap(x - w / 2);
  const top = snap(y + 12 - h) - lift + hover - (kind === "bat" ? 8 : 0);
  if (art.wings && kind === "owl") {
    const f = Math.floor(t * 8) % 2;
    const wing = pixelSheet(`pet2|owl|wing|${f}`, art.wings[f], art.pal);
    blit2(g, wing, left - 2 * PX, top + 6 * PX, false);
    blit2(g, wing, left + w - wing.width * PX + 2 * PX, top + 6 * PX, true);
  }
  if (art.wings && kind === "hatchling") {
    const f = Math.floor(t * 10) % 2;
    const wing = pixelSheet(`pet2|hatch|wing|${f}`, art.wings[f], art.pal);
    blit2(g, wing, flip ? left + w - 7 * PX : left + 3 * PX, top + 3 * PX, flip);
  }
  blit2(g, sheet, left, top, flip);
  if (kind === "turtle" && !(self.blockCd > 0)) {
    g.strokeStyle = "rgba(74, 222, 128, 0.5)";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(x, y - lift - 4, 18, 0, Math.PI * 2);
    g.stroke();
  }
}

/* ---------- pixel painter for monsters ----------
   Monsters are painted with simple pixel shapes (rect, disc, line...) on a
   small grid. Then two automatic passes make them look like pixel art:
   1. shading: pixels on the top edge get lighter, bottom edge darker;
   2. outline: every empty pixel touching the monster becomes a dark,
      slightly colored outline.
   Details painted with flat = true (eyes, teeth, glints) are never shaded. */

function hexRgb(color) {
  if (color[0] === "#") {
    const n = parseInt(color.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return color.match(/\d+/g).slice(0, 3).map(Number);
}

function paintPixels(w, h, paint, opts = {}) {
  const cells = new Array(w * h).fill(null);
  const put = (x, y, c, flat) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    cells[y * w + x] = c ? { c, flat: Boolean(flat) } : null;
  };
  const api = {
    px: (c, x, y, flat) => put(x, y, c, flat),
    rect: (c, x, y, rw, rh, flat) => {
      for (let j = 0; j < rh; j += 1) for (let i = 0; i < rw; i += 1) put(x + i, y + j, c, flat);
    },
    oval: (c, cx, cy, rx, ry, flat) => {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
          const dx = (x - cx) / (rx + 0.5);
          const dy = (y - cy) / (ry + 0.5);
          if (dx * dx + dy * dy <= 1) put(x, y, c, flat);
        }
      }
    },
    line: (c, x0, y0, x1, y1, flat, thick = 1) => {
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let s = 0; s <= steps; s += 1) {
        const x = x0 + ((x1 - x0) * s) / steps;
        const y = y0 + ((y1 - y0) * s) / steps;
        for (let j = 0; j < thick; j += 1) for (let i = 0; i < thick; i += 1) put(x + i - Math.floor(thick / 2), y + j - Math.floor(thick / 2), c, flat);
      }
    },
    poly: (c, pts, flat) => {
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y += 1) {
        for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x += 1) {
          let inside = false;
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
            const [xi, yi] = pts[i];
            const [xj, yj] = pts[j];
            if (yi > y + 0.5 !== yj > y + 0.5 && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
          }
          if (inside) put(x, y, c, flat);
        }
      }
    },
    erase: (x, y, rw = 1, rh = 1) => {
      for (let j = 0; j < rh; j += 1) for (let i = 0; i < rw; i += 1) put(x + i, y + j, null);
    }
  };
  paint(api);
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? null : cells[y * w + x]);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  const img = g.createImageData(w, h);
  const set = (x, y, rgb, a = 255) => {
    const i = (y * w + x) * 4;
    img.data[i] = rgb[0];
    img.data[i + 1] = rgb[1];
    img.data[i + 2] = rgb[2];
    img.data[i + 3] = a;
  };
  const alphaOf = (c) => (c.startsWith("rgba") ? Math.round(parseFloat(c.split(",")[3]) * 255) : 255);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const cell = at(x, y);
      if (cell) {
        let rgb = hexRgb(cell.c);
        if (!cell.flat && opts.shade !== false) {
          let k = 0;
          const up = at(x, y - 1);
          const down = at(x, y + 1);
          if (!up || (up.flat && !at(x, y - 2))) k += 0.28;
          else if (!down) k -= 0.3;
          if (!at(x - 1, y)) k += 0.1;
          if (!at(x + 1, y)) k -= 0.14;
          k -= (y / h) * 0.12;
          rgb = rgb.map((v) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)))));
        }
        set(x, y, rgb, alphaOf(cell.c));
        continue;
      }
      if (opts.outline === false) continue;
      const near = at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1);
      if (near) {
        const base = hexRgb(near.c);
        set(x, y, base.map((v) => Math.round(v * 0.18 + 12)));
      }
    }
  }
  g.putImageData(img, 0, 0);
  return canvas;
}

// A painted sprite plus its mirrored and white (hit flash) copies, cached.
function paintedSheet(key, w, h, paint, opts) {
  let sheet = pixelCache.get(key);
  if (sheet) return sheet;
  const canvas = paintPixels(w, h, paint, opts);
  const make = (fn) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    fn(c.getContext("2d"));
    return c;
  };
  const flip = make((g) => {
    g.scale(-1, 1);
    g.drawImage(canvas, -w, 0);
  });
  const white = make((g) => {
    g.drawImage(canvas, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, w, h);
  });
  const whiteFlip = make((g) => {
    g.scale(-1, 1);
    g.drawImage(white, -w, 0);
  });
  sheet = { canvas, flip, white, whiteFlip, width: w, height: h };
  pixelCache.set(key, sheet);
  if (pixelCache.size > 3000) pixelCache.clear();
  return sheet;
}

/* ---------- the monsters ----------
   Each painter gets (a, f): a is the pixel painter, f says what to draw:
   f.step (0 or 1, walking), f.pose ("move", "windup", "dash", ...),
   f.anim (0-3, for flapping, flickering and spinning) and f.lookX / f.lookY
   (-1, 0 or 1, where the eyes point). Everything faces right; the game
   mirrors it when the monster faces left. Canvas sizes are w x h; the feet
   stand on the bottom row unless fly is true. */

const MONSTER_ART = {
  "Zombie Block": {
    w: 32, h: 32,
    paint(a, f) {
      const G = "#5aa45c", D = "#345d36", S = "#4a6fa5", P = "#3b3046";
      const s = f.step;
      const reach = f.pose === "windup" ? -3 : f.pose === "dash" ? 2 : 0;
      a.rect(P, 11, 23, 4, 6 - s);
      a.rect(P, 17, 23, 4, 5 + s);
      a.rect("#2a2030", 10, 29 - s, 5, 2);
      a.rect("#2a2030", 17, 28 + s, 5, 2);
      a.rect(G, 20, 15 + reach, 9, 3);
      a.rect(S, 10, 14, 12, 10);
      a.rect(G, 12, 21, 3, 2);
      a.erase(10, 23, 2, 1);
      a.erase(20, 23, 1, 1);
      a.rect(G, 9, 3, 13, 11);
      a.rect(D, 9, 3, 6, 2);
      a.rect(D, 18, 3, 2, 1);
      a.rect(D, 10, 9, 2, 2);
      a.rect("#f4f7d0", 15, 7, 3, 3, true);
      a.px("#c81e1e", 16, 8, true);
      a.rect("#f4f7d0", 19, 7, 2, 2, true);
      a.px("#c81e1e", 20, 8, true);
      a.rect("#2a1a10", 15, 11, 6, 1, true);
      a.px("#f4f7d0", 16, 11, true);
      a.px("#f4f7d0", 19, 11, true);
      a.rect(G, 18, 18 - reach, 11, 3);
    }
  },
  "Skeleton Archer": {
    w: 32, h: 32,
    paint(a, f) {
      const B = "#ecebdc", W = "#8b5a2b";
      const s = f.step;
      const pull = f.pose === "windup" ? 3 : 0;
      a.line(B, 13, 21, 12 - s, 28, false, 2);
      a.line(B, 17, 21, 18 + s, 28, false, 2);
      a.rect(B, 10 - s, 29, 4, 1);
      a.rect(B, 17 + s, 29, 4, 1);
      a.rect(B, 12, 19, 7, 2);
      a.rect(B, 15, 12, 2, 8);
      for (const y of [12, 14, 16]) a.rect(B, 11, y, 10, 1);
      a.oval(B, 15, 6, 5, 5);
      a.rect(B, 12, 9, 7, 3);
      a.rect("#1a1a1a", 13, 5, 2, 2, true);
      a.rect("#1a1a1a", 17, 5, 2, 2, true);
      a.px("#ff6b4a", 14, 6, true);
      a.px("#ff6b4a", 18, 6, true);
      a.px("#1a1a1a", 14, 10, true);
      a.px("#1a1a1a", 16, 10, true);
      for (let y = 5; y <= 24; y += 1) {
        const x = 24 + Math.round(3.5 * Math.sin((Math.PI * (y - 5)) / 19));
        a.rect(W, x, y, 2, 1);
      }
      a.line("#f2f2f2", 24, 5, 23 - pull, 14, true);
      a.line("#f2f2f2", 23 - pull, 14, 24, 24, true);
      a.line(B, 16, 13, 26, 14, false, 1);
      a.line(B, 16, 15, 22 - pull, 14, false, 1);
      if (f.pose === "windup") {
        a.line("#c9a26b", 20 - pull, 14, 30, 14, true);
        a.px("#dfe6ee", 31, 14, true);
      }
    }
  },
  "Cave Spider": {
    w: 32, h: 28,
    paint(a, f) {
      const C = "#34243b", L = "#4a3654", R = "#e0457f";
      const low = f.pose === "windup" ? 2 : 0;
      for (let i = 0; i < 4; i += 1) {
        const up = (i + f.step) % 2;
        const bx = 11 + i * 3;
        const kx = bx - 2 + i * 2;
        const ky = 11 + up * 2 + low;
        const fx = bx - 7 + i * 5 + (f.pose === "dash" ? 2 : 0);
        a.line(L, bx, 18 + low, kx, ky, false, 2);
        a.line(L, kx, ky, fx, 26 - up, false, 1);
      }
      a.oval(C, 10, 17 + low, 7, 6);
      a.rect(R, 8, 15 + low, 4, 1, true);
      a.rect(R, 9, 16 + low, 2, 2, true);
      a.rect(R, 8, 18 + low, 4, 1, true);
      a.oval(C, 20, 19 + low, 4, 3);
      a.px(R, 22, 18 + low, true);
      a.px(R, 23, 19 + low, true);
      a.px(R, 21, 17 + low, true);
      a.px(R, 23, 17 + low, true);
      a.px("#f0e0e8", 24, 21 + low, true);
      a.px("#f0e0e8", 22, 22 + low, true);
    }
  },
  "Slime Cube": {
    w: 32, h: 30,
    paint(a, f) {
      const sq = f.anim % 2;
      const w = 18 + sq * 2;
      const h = 16 - sq * 2;
      const x = 16 - Math.floor(w / 2);
      const y = 29 - h;
      a.rect("rgba(101, 214, 107, 0.88)", x, y, w, h);
      a.rect("rgba(60, 143, 65, 0.95)", x + 4, y + Math.floor(h / 2) - 1, 6, 5);
      a.rect("rgba(255, 255, 255, 0.85)", x + 2, y + 2, 3, 2, true);
      a.px("rgba(255, 255, 255, 0.85)", x + 2, y + 5, true);
      a.rect("#0c2a10", x + w - 9, y + 4, 2, 3, true);
      a.rect("#0c2a10", x + w - 5, y + 4, 2, 3, true);
      a.rect("#0c2a10", x + w - 8, y + 9, 4, 1, true);
      a.px("rgba(101, 214, 107, 0.88)", x + 3, y + h);
      a.px("rgba(101, 214, 107, 0.88)", x + w - 4, y + h);
    }
  },
  "Ember Imp": {
    w: 32, h: 32,
    paint(a, f) {
      const R = "#d75833", W = "#8a2a1a";
      const s = f.step;
      const flap = f.anim % 2 ? 2 : 0;
      a.poly(W, [[12, 15], [3, 8 + flap], [5, 13 + flap], [3, 18], [12, 19]]);
      a.line(R, 11, 22, 5, 19 + s, false, 1);
      a.poly(R, [[2, 17 + s], [6, 17 + s], [4, 21 + s]]);
      a.rect(R, 13, 23, 2, 5 - s);
      a.rect(R, 17, 23, 2, 4 + s);
      a.rect("#2a0d06", 12, 28 - s, 3, 2);
      a.rect("#2a0d06", 17, 27 + s, 3, 2);
      a.oval(R, 15, 19, 5, 5);
      a.oval("#ef8a5a", 16, 20, 2, 3);
      a.oval(R, 17, 10, 5, 5);
      a.poly("#ffb347", [[13, 8], [10, 2], [15, 6]]);
      a.poly("#ffb347", [[20, 6], [23, 1], [22, 8]]);
      a.poly("#ffd166", [[15, 5], [17, 0 + (f.anim % 2)], [19, 5]], true);
      a.rect("#ffe45c", 18, 9, 2, 2, true);
      a.px("#1a0a00", 19, 10, true);
      a.rect("#ffe45c", 21, 9, 1, 2, true);
      a.rect("#3a0d00", 17, 13, 5, 1, true);
      a.px("#ffffff", 18, 13, true);
      a.px("#ffffff", 20, 13, true);
      const raise = f.pose === "windup" ? 5 : 0;
      a.line(R, 19, 17, 24, 20 - raise, false, 2);
      if (f.pose === "windup") a.oval("#ffb347", 25, 13, 2, 2, true);
    }
  },
  "Frost Wisp": {
    w: 30, h: 32, fly: true, glow: "#90e2ff",
    paint(a, f) {
      const C = "#90e2ff";
      const k = f.anim;
      a.poly(C, [[9, 17], [15, 3 + (k % 2)], [21, 17]]);
      a.poly(C, [[17, 8], [22, 4 - (k % 2)], [21, 13]]);
      a.oval(C, 15, 18, 7, 6);
      a.poly(C, [[9, 21], [10 + (k % 2), 30], [14, 23]]);
      a.poly(C, [[13, 23], [15 - (k % 2), 31], [18, 23]]);
      a.poly(C, [[17, 22], [21 + (k % 2), 29], [21, 20]]);
      a.oval("#e8faff", 14, 19, 3, 3);
      a.rect("#1d4ed8", 15, 15, 2, 3, true);
      a.rect("#1d4ed8", 19, 15, 2, 3, true);
      a.px("#ffffff", 15, 15, true);
      a.px("#ffffff", 19, 15, true);
    }
  },
  "Sand Husk": {
    w: 32, h: 32,
    paint(a, f) {
      const C = "#c5a15c", A = "#8a6e40";
      const s = f.step;
      const reach = f.pose === "windup" ? -3 : 0;
      a.line(C, 11, 6, 6, 9 + s, false, 2);
      a.rect(C, 12, 23, 4, 6 - s);
      a.rect(C, 17, 23, 4, 5 + s);
      a.rect(C, 20, 14 + reach, 9, 3);
      a.rect(C, 11, 12, 10, 12);
      for (const [y0, y1] of [[14, 16], [18, 17], [21, 22]]) a.line(A, 11, y0, 20, y1);
      a.line(A, 12, 26, 15, 25);
      a.line(A, 17, 26, 20, 27);
      a.rect(C, 11, 2, 10, 10);
      a.line(A, 11, 4, 20, 5);
      a.line(A, 11, 10, 20, 9);
      a.rect("#2a1a10", 14, 6, 7, 2, true);
      a.px("#ffd166", 16, 6, true);
      a.px("#ffd166", 19, 6, true);
      a.rect(C, 18, 18 - reach, 10, 3);
    }
  },
  "Moss Goblin": {
    w: 32, h: 32,
    paint(a, f) {
      const C = "#608c39", M = "#a2c45a", T = "#6b4f30";
      const s = f.step;
      const stab = f.pose === "windup" ? -4 : f.pose === "dash" ? 2 : 0;
      a.rect(C, 13, 24, 3, 5 - s);
      a.rect(C, 17, 24, 3, 4 + s);
      a.rect("#3a2516", 12, 29 - s, 4, 1);
      a.rect("#3a2516", 17, 28 + s, 4, 1);
      a.poly(T, [[11, 16], [21, 16], [22, 25], [10, 25]]);
      a.rect(M, 11, 16, 11, 2);
      a.oval(C, 16, 10, 6, 5);
      a.poly(C, [[11, 9], [3, 5], [11, 12]]);
      a.poly(C, [[21, 8], [28, 3], [21, 12]]);
      a.rect(M, 13, 5, 6, 1);
      a.px(M, 15, 4);
      a.rect("#ffe45c", 17, 9, 2, 2, true);
      a.px("#120c08", 18, 10, true);
      a.rect("#ffe45c", 20, 9, 2, 2, true);
      a.px("#120c08", 21, 10, true);
      a.rect("#2a1a10", 17, 13, 5, 1, true);
      a.px("#ffffff", 18, 13, true);
      a.line(C, 20, 18, 24, 20 + stab / 2, false, 2);
      a.line("#cfd6dc", 24, 19 + stab / 2, 29 + (stab < 0 ? -2 : 0), 15 + stab, true);
    }
  },
  "Bat Miner": {
    w: 34, h: 30, fly: true,
    paint(a, f) {
      const C = "#4b465c", W = "#3a3550";
      const up = f.anim % 2 === 0;
      if (up) {
        a.poly(W, [[12, 15], [3, 6], [1, 15], [5, 13], [7, 19]]);
        a.poly(W, [[22, 15], [31, 6], [33, 15], [29, 13], [27, 19]]);
      } else {
        a.poly(W, [[12, 15], [2, 21], [5, 19], [7, 24], [12, 19]]);
        a.poly(W, [[22, 15], [32, 21], [29, 19], [27, 24], [22, 19]]);
      }
      a.oval(C, 17, 17, 5, 6);
      a.oval("#b8aacb", 17, 19, 3, 3);
      a.rect("#e3b23c", 11, 10, 12, 3);
      a.rect("#e3b23c", 12, 7, 10, 3);
      a.rect("#fff2a3", 15, 6, 4, 2, true);
      a.px("#ffd166", 15, 15, true);
      a.px("#ffd166", 19, 15, true);
      a.px("#ffffff", 16, 19, true);
      a.px("#ffffff", 18, 19, true);
      a.px(C, 15, 24);
      a.px(C, 19, 24);
    }
  },
  "Crystal Crawler": {
    w: 32, h: 30,
    paint(a, f) {
      const C = "#8f6cff", K = "#d6c7ff", D = "#5b3fd6";
      for (let i = 0; i < 3; i += 1) {
        const up = (i + f.step) % 2;
        a.line(D, 10 + i * 5, 24, 8 + i * 6 + up, 28 - up, false, 1);
      }
      a.oval(C, 15, 22, 9, 5);
      const glow = f.pose === "windup" ? "#ffffff" : K;
      a.poly(K, [[8, 20], [10, 9], [13, 20]]);
      a.poly("#b9a2ff", [[12, 19], [16, 4], [20, 19]]);
      a.poly(K, [[18, 20], [21, 11], [24, 20]]);
      a.line(glow, 16, 7, 15, 17, true);
      a.line(glow, 10, 12, 10, 18, true);
      a.oval(D, 25, 23, 3, 3);
      a.px("#ffffff", 26, 22, true);
      a.px(D, 28, 25);
      a.px(D, 29, 24);
    }
  },
  "Nether Brute": {
    w: 34, h: 32,
    paint(a, f) {
      const C = "#8d2d25", A = "#2a1110";
      const s = f.step;
      const smash = f.pose === "windup" ? -7 : f.pose === "dash" ? 3 : 0;
      a.rect(C, 10, 24, 5, 5 - s);
      a.rect(C, 18, 24, 5, 4 + s);
      a.rect(A, 9, 29 - s, 6, 2);
      a.rect(A, 18, 28 + s, 6, 2);
      a.oval(C, 15, 17, 9, 8);
      a.oval("#a8433a", 15, 20, 5, 4);
      a.rect(C, 15, 6, 10, 7);
      a.poly("#e8d8b0", [[15, 8], [11, 1], [17, 6]]);
      a.poly("#e8d8b0", [[22, 6], [25, 0], [25, 8]]);
      a.rect(A, 18, 8, 6, 1, true);
      a.rect("#ffb347", 19, 9, 2, 1, true);
      a.rect("#ffb347", 23, 9, 1, 1, true);
      a.px("#f0e6d0", 19, 12, true);
      a.px("#f0e6d0", 23, 12, true);
      a.line(C, 19, 15, 26, 21 + smash, false, 3);
      a.rect(C, 25, 19 + smash, 6, 6);
      a.rect(A, 25, 22 + smash, 6, 1, true);
    }
  },
  "Iron Golemling": {
    w: 32, h: 32,
    paint(a, f) {
      const C = "#a9a49a", D = "#5c5850";
      const s = f.step;
      const lift = f.pose === "windup" ? -5 : 0;
      a.rect(C, 10, 23, 5, 6 - s);
      a.rect(C, 17, 23, 5, 5 + s);
      a.rect(C, 6, 12, 3, 13);
      a.rect(C, 9, 11, 14, 13);
      a.rect("#8a857c", 9, 17, 14, 1);
      for (const [x, y] of [[10, 12], [21, 12], [10, 22], [21, 22]]) a.px(D, x, y, true);
      a.rect(C, 12, 3, 9, 8);
      a.rect(D, 13, 5, 7, 1, true);
      a.rect("#ffb347", 14, 6, 2, 1, true);
      a.rect("#ffb347", 18, 6, 2, 1, true);
      a.rect(C, 16, 7, 2, 4);
      a.line("#4a8a3a", 20, 3, 21, 15);
      a.px("#6fbf4f", 22, 8, true);
      a.px("#6fbf4f", 21, 12, true);
      a.rect(C, 23, 12 + lift, 3, 13);
    }
  },
  "Ender Shade": {
    w: 32, h: 32, fly: true, glow: "#b35cff",
    paint(a, f) {
      const C = "#201827", P = "#b35cff";
      const k = f.anim;
      for (let i = 0; i < 4; i += 1) a.line(C, 10 + i * 4, 23, 9 + i * 4 + ((i + k) % 2) * 2, 29, false, 2);
      a.poly(C, [[11, 8], [21, 8], [23, 24], [9, 24]]);
      a.oval(C, 16, 7, 5, 5);
      const reach = f.pose === "fadein" ? 3 : 0;
      a.line(C, 10, 11, 6 - reach, 22, false, 2);
      a.line(C, 22, 11, 26 + reach, 22, false, 2);
      a.rect(P, 13, 6, 2, 1, true);
      a.rect(P, 18, 6, 2, 1, true);
      a.px(P, 6 + k, 4, true);
      a.px(P, 26 - k, 14, true);
      a.px(P, 4, 18 + k, true);
    }
  },
  "Mud Creeper": {
    w: 32, h: 32,
    paint(a, f) {
      const C = "#6c5b38", M = "#2f7e43", K = "#1a120a";
      const s = f.step;
      a.rect(C, 10, 24, 4, 5 - s);
      a.rect(C, 18, 24, 4, 4 + s);
      a.rect(C, 10, 8, 12, 17);
      a.rect(M, 11, 9, 3, 3);
      a.rect(M, 18, 20, 3, 2);
      a.rect(M, 20, 10, 2, 2);
      a.rect(M, 12, 18, 2, 2);
      a.rect(K, 12, 12, 3, 3, true);
      a.rect(K, 17, 12, 3, 3, true);
      a.rect(K, 15, 15, 2, 3, true);
      a.rect(K, 14, 17, 1, 3, true);
      a.rect(K, 17, 17, 1, 3, true);
    }
  },
  "Quartz Knight": {
    w: 32, h: 34,
    paint(a, f) {
      const C = "#eee4cf", G = "#c09a63", R = "#d94d3f";
      const s = f.step;
      a.rect(C, 12, 25, 4, 6 - s);
      a.rect(C, 17, 25, 4, 5 + s);
      a.rect(G, 11, 30 - s, 5, 2);
      a.rect(G, 17, 29 + s, 5, 2);
      a.rect("#c9b88f", 5, 15, 7, 10);
      a.rect(R, 7, 18, 3, 4, true);
      a.rect(C, 11, 15, 11, 11);
      a.rect(G, 11, 22, 11, 1);
      a.rect(C, 11, 5, 11, 10);
      a.rect("#3a2e22", 15, 9, 7, 1, true);
      a.px("#55aaff", 19, 9, true);
      a.poly(R, [[13, 5], [10, 0], [17, 1], [19, 5]]);
      if (f.pose === "windup") {
        a.rect(C, 20, 14, 3, 4);
        a.line("#dfe6ee", 21, 13, 13, 2, false, 2);
      } else if (f.pose === "dash") {
        a.rect(C, 21, 17, 4, 3);
        a.line("#dfe6ee", 24, 18, 31, 18, false, 2);
      } else {
        a.rect(C, 21, 17, 4, 3);
        a.line("#dfe6ee", 24, 18, 24, 5, false, 2);
        a.rect(G, 22, 18, 5, 1);
      }
    }
  },

  // The 9 scary monsters.
  "Shadow Wolf": {
    w: 40, h: 28,
    paint(a, f) {
      const D = "#2d3150", K = "#1d2038";
      const s = f.step;
      const dash = f.pose === "dash";
      const crouch = f.pose === "windup" ? 2 : 0;
      const legs = dash ? [[11, 6, -4], [14, 6, -3], [27, 34, 3], [30, 36, 4]] : [[11, 9 + s * 2, 0], [14, 15 - s * 2, 0], [26, 24 + s * 2, 0], [29, 30 - s * 2, 0]];
      for (const [x, fx, tilt] of legs) a.line(K, x, 17 + crouch, fx, 26 + Math.min(0, tilt / 2), false, 2);
      a.line(D, 8, 13 + crouch, 3, 7 + s * 2, false, 2);
      a.oval(D, 19, 15 + crouch, 11, 5);
      for (let i = 0; i < 4; i += 1) a.poly(K, [[10 + i * 4, 12 + crouch], [12 + i * 4, 6 + (i % 2) + crouch], [14 + i * 4, 12 + crouch]]);
      a.poly(D, [[26, 10 + crouch], [32, 8 + crouch], [38, 12 + crouch], [38, 15 + crouch], [31, 17 + crouch], [26, 16 + crouch]]);
      a.poly(D, [[28, 10 + crouch], [29, 3 + crouch], [32, 9 + crouch]]);
      a.rect("#ff4d5e", 32, 11 + crouch, 2, 1, true);
      if (f.pose !== "move") {
        a.px("#ffffff", 34, 15 + crouch, true);
        a.px("#ffffff", 36, 15 + crouch, true);
        a.rect("#7a1f2b", 33, 14 + crouch, 4, 1, true);
      }
    }
  },
  "Venom Cobra": {
    w: 34, h: 32,
    paint(a, f) {
      const G = "#2f7a43", Y = "#f2d65c";
      const coil = f.pose === "windup";
      const strike = f.pose === "dash";
      a.oval(G, 13, 26, 10, 4);
      a.oval(G, 13, 22, 7, 3);
      for (let i = 0; i < 5; i += 1) a.px(Y, 7 + i * 3, 26, true);
      const hx = strike ? 27 : coil ? 17 : 21;
      const hy = strike ? 14 : coil ? 12 : 9;
      a.line(G, 17, 20, hx - 2, hy + 3, false, 3);
      a.oval(G, hx - 1, hy, 5, 5);
      a.px(Y, hx - 3, hy - 1, true);
      a.px(Y, hx - 3, hy + 2, true);
      a.oval("#1f5a30", hx + 3, hy - 1, 3, 2);
      a.px("#ff3030", hx + 3, hy - 2, true);
      if (f.anim % 2 || coil) {
        a.line("#ff3a5c", hx + 6, hy, hx + 8, hy, true);
        a.px("#ff3a5c", hx + 9, hy - 1, true);
        a.px("#ff3a5c", hx + 9, hy + 1, true);
      }
    }
  },
  "Crystal Shard": {
    w: 32, h: 34, fly: true, glow: "#4fe3d0",
    paint(a, f) {
      a.poly("#4fe3d0", [[16, 3], [21, 16], [16, 31], [11, 16]]);
      a.poly("#1f9a8c", [[16, 3], [21, 16], [16, 31], [17, 16]], true);
      a.poly("#e9fffb", [[16, 5], [14, 16], [15, 22], [12, 16]], true);
      a.rect("#0d3b37", 13, 14, 1, 3, true);
      a.rect("#0d3b37", 18, 14, 1, 3, true);
      for (let k = 0; k < 3; k += 1) {
        const ang = (f.anim / 4) * Math.PI * 2 + k * 2.1;
        const x = 16 + Math.round(Math.cos(ang) * 13);
        const y = 17 + Math.round(Math.sin(ang) * 5);
        a.poly(Math.sin(ang) > 0 ? "#e9fffb" : "#4fe3d0", [[x, y - 2], [x + 1, y], [x, y + 2], [x - 1, y]]);
      }
    }
  },
  "Watcher Eye": {
    w: 34, h: 38, fly: true,
    paint(a, f) {
      const P = "#22184a", Q = "#3b2a6e";
      for (let k = 0; k < 4; k += 1) {
        const base = 11 + k * 4;
        for (let y = 24; y < 36; y += 1) {
          const x = base + Math.round(Math.sin(y * 0.5 + k * 1.7 + f.anim * 1.5) * 1.5);
          a.rect(Q, x, y, y < 31 ? 2 : 1, 1);
        }
      }
      for (let k = 0; k < 8; k += 1) {
        const ang = (k / 8) * Math.PI * 2 + 0.2;
        const cx = 17 + Math.cos(ang) * 11;
        const cy = 16 + Math.sin(ang) * 11;
        a.poly(Q, [[17 + Math.cos(ang - 0.25) * 9, 16 + Math.sin(ang - 0.25) * 9], [cx + Math.cos(ang) * 3, cy + Math.sin(ang) * 3], [17 + Math.cos(ang + 0.25) * 9, 16 + Math.sin(ang + 0.25) * 9]]);
      }
      a.oval(P, 17, 16, 10, 10);
      a.oval("#f4eefc", 17, 16, 6, 6, true);
      a.oval("#c9bfe0", 18, 18, 4, 3, true);
      a.oval("#f4eefc", 17, 15, 5, 4, true);
      const ix = 17 + f.lookX * 2;
      const iy = 16 + f.lookY * 2;
      const big = f.pose === "aim" || f.pose === "beam";
      a.oval(big ? "#ff8ae8" : "#ff4fd8", ix, iy, big ? 3 : 2, big ? 3 : 2, true);
      a.rect("#120a1c", ix, iy - 2, 1, 5, true);
      a.px("#ffffff", ix + 1, iy - 2, true);
      a.line("#e6a3c8", 11, 17, 13, 16, true);
      a.line("#e6a3c8", 22, 12, 21, 14, true);
    }
  },
  "Ember Spirit": {
    w: 28, h: 30, fly: true, glow: "#ff6a1f",
    paint(a, f) {
      const k = f.anim % 3;
      a.poly("#ff6a1f", [[14, 2 + k], [21, 13], [21, 21], [14, 27], [7, 21], [7, 13]]);
      a.poly("#ff6a1f", [[19, 9], [23, 3 + (k % 2) * 2], [21, 14]]);
      a.poly("#ff6a1f", [[9, 10], [5, 5 + k], [7, 15]]);
      a.poly("#ffd23f", [[14, 9 + k], [18, 16], [18, 22], [14, 25], [10, 22], [10, 16]], true);
      a.poly("#fff6c2", [[14, 16], [16, 21], [14, 24], [12, 21]], true);
      a.poly("#3a0d00", [[10, 15], [13, 16], [13, 18], [10, 17]], true);
      a.poly("#3a0d00", [[18, 15], [15, 16], [15, 18], [18, 17]], true);
      a.rect("#3a0d00", 12, 20, 4, 1, true);
    }
  },
  Wraith: {
    w: 34, h: 36, fly: true, glow: "#7b5cff",
    paint(a, f) {
      const C = "#c9d3ff", B = "#e8e2d0";
      const claws = f.pose === "windup";
      const ay = claws ? 6 : 15;
      a.line(B, 22, 15, 29, ay, false, 1);
      a.line(B, 11, 15, 4, ay, false, 1);
      for (const [hx, side] of [[29, 1], [4, -1]]) {
        for (let k = -1; k <= 1; k += 1) a.line(B, hx, ay, hx + side * 2, ay + k * 2, true);
      }
      a.poly(C, [[17, 2], [24, 6], [24, 16], [26, 28], [10, 28], [10, 16], [10, 6]]);
      for (let i = 0; i < 5; i += 1) {
        const x = 10 + i * 4;
        a.poly(C, [[x, 27], [x + 2, 32 + ((i + f.anim) % 2) * 2], [x + 4, 27]]);
      }
      a.poly("#8f97c9", [[10, 16], [14, 18], [12, 28], [10, 28]]);
      a.oval("#140f2a", 17, 10, 5, 5, true);
      const eye = claws ? "#ff4d5e" : "#f2ecff";
      a.rect(eye, 14, 9, 2, 2, true);
      a.rect(eye, 19, 9, 2, 2, true);
    }
  },
  Gargoyle: {
    w: 40, h: 34,
    paint(a, f) {
      const stone = f.pose === "stone";
      const B = stone ? "#8a8794" : "#5d5868";
      const W = stone ? "#77737f" : "#433f4f";
      const H = stone ? "#a6a2ad" : "#d8cfb8";
      if (stone) {
        a.poly(W, [[16, 10], [11, 6], [10, 22], [15, 24]]);
        a.poly(W, [[24, 10], [29, 6], [30, 22], [25, 24]]);
      } else {
        const fl = f.anim % 2 ? 4 : 0;
        a.poly(W, [[17, 12], [5, 2 + fl], [1, 14 + fl], [7, 12 + fl], [9, 19], [13, 16], [16, 21]]);
        a.poly(W, [[23, 12], [35, 2 + fl], [39, 14 + fl], [33, 12 + fl], [31, 19], [27, 16], [24, 21]]);
      }
      a.rect(B, 15, 26, 3, 6);
      a.rect(B, 22, 26, 3, 6);
      a.rect(H, 14, 31, 5, 1, true);
      a.rect(H, 21, 31, 5, 1, true);
      a.poly(B, [[14, 12], [26, 12], [27, 22], [24, 28], [16, 28], [13, 22]]);
      a.rect(W, 17, 16, 6, 1, true);
      a.rect(W, 17, 19, 6, 1, true);
      a.rect(B, 15, 4, 10, 9);
      a.poly(H, [[15, 6], [11, 0], [17, 4]]);
      a.poly(H, [[25, 6], [29, 0], [23, 4]]);
      if (stone) {
        a.rect("#55515e", 17, 7, 2, 1, true);
        a.rect("#55515e", 21, 7, 2, 1, true);
        a.line("#5d5868", 18, 14, 20, 19, true);
        a.line("#5d5868", 20, 19, 19, 23, true);
      } else {
        a.rect("#ff9a3c", 17, 7, 2, 2, true);
        a.rect("#ff9a3c", 21, 7, 2, 2, true);
        a.px("#ffffff", 18, 11, true);
        a.px("#ffffff", 21, 11, true);
      }
    }
  },
  "Spirit Lantern": {
    w: 26, h: 32, fly: true, glow: "#7dffb0",
    paint(a, f) {
      const M = "#5a4a2e";
      a.line("#6b5a3a", 10, 4, 13, 1, true);
      a.line("#6b5a3a", 13, 1, 16, 4, true);
      a.poly(M, [[9, 5], [17, 5], [20, 8], [6, 8]]);
      a.rect("rgba(125, 255, 176, 0.45)", 7, 8, 12, 14, true);
      const k = f.anim % 2;
      a.poly("#7dffb0", [[13, 10 + k], [16, 16], [13, 20], [10, 16]], true);
      a.poly("#e9fff2", [[13, 14 + k], [14, 17], [13, 19], [12, 17]], true);
      a.px("#0d3b22", 12, 16, true);
      a.px("#0d3b22", 14, 16, true);
      a.rect("#3a3428", 6, 8, 1, 14);
      a.rect("#3a3428", 19, 8, 1, 14);
      a.rect("#3a3428", 13, 8, 1, 3);
      a.poly(M, [[6, 22], [20, 22], [18, 25], [8, 25]]);
      a.px("#e9fff2", 2 + k * 2, 14 - k * 3, true);
      a.px("#e9fff2", 23 - k * 2, 20 + k * 2, true);
    }
  },
  "Void Raven": {
    w: 36, h: 28, fly: true,
    paint(a, f) {
      const C = "#1c1233", W = "#2c1d4f", P = "#c06bff";
      const up = f.anim % 2 === 0;
      a.poly(C, [[9, 14], [2, 11], [3, 15], [2, 19], [9, 18]]);
      a.rect("#e0c060", 16, 20, 1, 4, true);
      a.rect("#e0c060", 19, 20, 1, 4, true);
      a.poly(C, [[8, 14], [16, 10], [24, 12], [25, 16], [20, 20], [10, 19]]);
      a.oval(C, 25, 10, 4, 4);
      a.poly("#e0c060", [[28, 9], [34, 11], [28, 12]]);
      a.px(P, 26, 9, true);
      if (up) {
        a.poly(W, [[12, 13], [20, 13], [14, 2], [7, 4]]);
        a.poly(P, [[14, 2], [7, 4], [10, 7]], true);
      } else {
        a.poly(W, [[12, 14], [20, 14], [16, 25], [9, 22]]);
        a.poly(P, [[16, 25], [9, 22], [12, 21]], true);
      }
    }
  }
};

// Work out which frame to show for a monster this instant.
function monsterFrame(type, enemy, t, look) {
  const state = enemy ? enemy.state : "move";
  let pose = "move";
  if (state === "windup" || state === "tell") pose = "windup";
  else if (state === "dash" || state === "lunge") pose = "dash";
  else if (state === "aim" || state === "beam") pose = state;
  else if (state === "fadein") pose = "fadein";
  if (enemy && enemy.stone) pose = "stone";
  return {
    step: Math.floor(t * 8) % 2,
    anim: Math.floor(t * 8) % 4,
    pose,
    lookX: look.x > 0.4 ? 1 : look.x < -0.4 ? -1 : 0,
    lookY: look.y > 0.4 ? 1 : look.y < -0.4 ? -1 : 0
  };
}

// The flash, slow and poison colors for the monster being drawn right now.
let pixelTint = null;

// The painter, but every shape shrunk by k (for drawing a 32-pixel design
// on a smaller grid). Shapes snap to whole pixels; nothing goes below 1.
function scaledPainter(a, k) {
  const edge = (v) => Math.round(v * k);
  const span = (v, w) => Math.max(1, edge(v + w) - edge(v));
  return {
    px: (c, x, y, flat) => a.rect(c, Math.floor(x * k), Math.floor(y * k), 1, 1, flat),
    rect: (c, x, y, w, h, flat) => a.rect(c, edge(x), edge(y), span(x, w), span(y, h), flat),
    oval: (c, cx, cy, rx, ry, flat) => a.oval(c, (cx + 0.5) * k - 0.5, (cy + 0.5) * k - 0.5, Math.max(0.5, rx * k), Math.max(0.5, ry * k), flat),
    line: (c, x0, y0, x1, y1, flat, thick = 1) => a.line(c, Math.round(x0 * k), Math.round(y0 * k), Math.round(x1 * k), Math.round(y1 * k), flat, Math.max(1, Math.round(thick * k))),
    poly: (c, pts, flat) => a.poly(c, pts.map(([x, y]) => [x * k, y * k]), flat),
    erase: (x, y, w = 1, h = 1) => a.erase(edge(x), edge(y), span(x, w), span(y, h))
  };
}

// Touch-ups for designs that lose a detail when shrunk to half size
// (coordinates here are on the small grid).
const HALF_FIX = {
  "Iron Golemling": (a) => {
    a.rect("#5c5850", 6, 2, 4, 1, true);
    a.px("#ffb347", 7, 3, true);
    a.px("#ffb347", 9, 3, true);
  },
  "Mud Creeper": (a) => {
    a.rect("#6c5b38", 6, 5, 5, 6, true);
    for (const [x, y] of [[6, 6], [9, 6], [7, 7], [8, 7], [6, 8], [7, 8], [8, 8], [9, 8]]) a.px("#1a120a", x, y, true);
  }
};

const drawFoeBodyOld = drawFoeBody;
drawFoeBody = function (g, typeIndex, cx, cy, size, t, look = { x: 0, y: 0 }, extra = {}) {
  const type = enemyTypes[typeIndex];
  const art = type && MONSTER_ART[type.name];
  if (!art) return drawFoeBodyOld(g, typeIndex, cx, cy, size, t, look, extra);
  const enemy = extra.enemy;
  const f = monsterFrame(type, enemy, t, look);
  const symmetric = type.behavior === "eye" || type.behavior === "shard" || type.behavior === "lantern" || type.behavior === "gargoyle";
  // Designs are 32 pixels; normal monsters use them at half size, small
  // ones at a third, big ones at full size. Every size is drawn with the
  // same 2x pixels.
  const k = size >= 36 ? 1 : size < 20 ? 0.34 : 0.5;
  const aw = Math.ceil(art.w * k);
  const ah = Math.ceil(art.h * k);
  const key = `mon2|${type.name}|${k}|${f.step}|${f.anim}|${f.pose}|${symmetric ? `${f.lookX},${f.lookY}` : ""}`;
  const sheet = paintedSheet(key, aw, ah, (a) => {
    art.paint(k === 1 ? a : scaledPainter(a, k), f);
    if (k === 0.5 && HALF_FIX[type.name]) HALF_FIX[type.name](a, f);
  });
  const w = aw * PX;
  const h = ah * PX;
  const hover = art.fly && Math.sin(t * 4) > 0 ? PX : 0;
  const y = snap(art.fly ? cy - h / 2 - hover : cy + size / 2 + 2 - h);
  const flip = !symmetric && look.x < -0.1;
  if (art.glow) {
    const r = Math.max(w, h) * 0.6;
    const n = parseInt(art.glow.slice(1), 16);
    const rgb = `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
    const glow = g.createRadialGradient(cx, y + h / 2, 0, cx, y + h / 2, r);
    glow.addColorStop(0, `rgba(${rgb}, 0.35)`);
    glow.addColorStop(1, `rgba(${rgb}, 0)`);
    g.fillStyle = glow;
    g.fillRect(cx - r, y + h / 2 - r, r * 2, r * 2);
  }
  const tint = pixelTint;
  const swell = extra.fuse !== undefined ? 1 + (1 - extra.fuse) * 0.25 : 1;
  const flashFuse = extra.fuse !== undefined && Math.sin(t * 40) > 0;
  let image;
  if ((tint && tint.flash) || flashFuse) image = flip ? sheet.whiteFlip : sheet.white;
  else if (tint && tint.slow) image = tintedImage(sheet, "#6fd6ff", flip);
  else if (tint && tint.poison) image = tintedImage(sheet, "#8fdc4a", flip);
  else image = flip ? sheet.flip : sheet.canvas;
  const smooth = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  const sw = snap(w * swell);
  const sh = snap(h * swell);
  g.drawImage(image, snap(cx - sw / 2), y - (sh - h), sw, sh);
  g.imageSmoothingEnabled = smooth;
};

// A frozen or poisoned copy of a sheet, made once and kept. (Canvas filters
// would do the same job but are very slow to draw every frame.)
function tintedImage(sheet, color, flipped) {
  sheet.tints = sheet.tints || {};
  const key = color + (flipped ? "f" : "");
  if (sheet.tints[key]) return sheet.tints[key];
  const c = document.createElement("canvas");
  c.width = sheet.width;
  c.height = sheet.height;
  const g = c.getContext("2d");
  g.drawImage(flipped ? sheet.flip : sheet.canvas, 0, 0);
  g.globalCompositeOperation = "source-atop";
  g.globalAlpha = 0.5;
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  sheet.tints[key] = c;
  return c;
}

// drawEnemy paints square overlays for flashes, slows and poison. For pixel
// monsters, hide those for a moment and tint the sprite itself instead.
const drawEnemyOld = drawEnemy;
drawEnemy = function (enemy) {
  const art = !enemy.isBoss && enemy.type && MONSTER_ART[enemy.type.name];
  if (!art) return drawEnemyOld(enemy);
  const saved = [enemy.flash, enemy.slowUntil, enemy.poisonUntil];
  pixelTint = { flash: enemy.flash > 0, slow: state.clock < enemy.slowUntil, poison: state.clock < (enemy.poisonUntil || 0) };
  enemy.flash = 0;
  enemy.slowUntil = 0;
  enemy.poisonUntil = 0;
  try {
    drawEnemyOld(enemy);
  } finally {
    [enemy.flash, enemy.slowUntil, enemy.poisonUntil] = saved;
    pixelTint = null;
  }
  if (state.clock < (enemy.poisonUntil || 0)) {
    const rise = (state.anim * 2) % 1;
    ctx.fillStyle = "#b5e86b";
    ctx.fillRect(enemy.x + enemy.size / 2 - 4, enemy.y - enemy.size / 2 - rise * 12, 4, 4);
    ctx.fillRect(enemy.x - enemy.size / 2, enemy.y - enemy.size / 2 - ((rise + 0.5) % 1) * 12, 3, 3);
  }
};

/* ---------- room bosses ----------
   A boss is its monster drawn twice as big (shapes are painted at double
   size, but outlines and shading stay one pixel thin, so it has more
   detail), plus a crown and its own weapon. */

const BOSS_PIXEL = {
  0: { weapon: "club", hand: [27, 17], crown: [15, 3] },
  1: { crown: [15, 1] },
  2: { crown: [11, 11] },
  3: { weapon: "mallet", hand: [25, 20], crown: [15, 13] },
  4: { weapon: "trident", hand: [24, 18], crown: [17, 5] },
  5: { weapon: "scepter", hand: [22, 19], crown: [15, 4] },
  6: { weapon: "khopesh", hand: [27, 15], crown: [16, 2] },
  7: { weapon: "spear", hand: [23, 19], crown: [16, 5] },
  8: { crown: [17, 7] },
  9: { crown: [16, 4] },
  10: { weapon: "axe", hand: [29, 22], crown: [20, 6] },
  11: { weapon: "hammer", hand: [25, 23], crown: [16, 3] },
  12: { weapon: "scythe", hand: [26, 20], crown: [16, 2] },
  13: { weapon: "bomb", hand: [23, 16], crown: [16, 8] },
  14: { crown: [16, 4] }
};

// Weapons are drawn around the hand. angle 0 points up, 1.57 points forward.
function paintWeapon(a, kind, hx, hy, angle, anim) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const p = (x, y) => [hx + x * cos - y * sin, hy + x * sin + y * cos];
  const line = (c, x0, y0, x1, y1, thick, flat) => {
    const [ax, ay] = p(x0, y0);
    const [bx, by] = p(x1, y1);
    a.line(c, ax, ay, bx, by, flat, thick);
  };
  const poly = (c, pts, flat) => a.poly(c, pts.map(([x, y]) => p(x, y)), flat);
  const wood = "#8b5a2b";
  const iron = "#9aa3ad";
  switch (kind) {
    case "club":
      line(wood, 0, 4, 0, -10, 3);
      poly("#a0703a", [[-3, -9], [3, -9], [5, -21], [-5, -21]]);
      for (const [x, y] of [[-5, -14], [5, -17], [-4, -19], [4, -12]]) {
        const [px, py] = p(x, y);
        a.px("#e8e2d0", px, py, true);
      }
      break;
    case "mallet":
      line(wood, 0, 4, 0, -14, 2);
      poly("#e8508a", [[-8, -13], [8, -13], [8, -22], [-8, -22]]);
      poly("#ffffff", [[-6, -20], [-3, -20], [-3, -19], [-6, -19]], true);
      break;
    case "trident":
      line("#f6c85f", 0, 6, 0, -22, 2);
      line("#f6c85f", -5, -18, 5, -18, 2);
      line("#f6c85f", -5, -18, -5, -26, 2);
      line("#f6c85f", 5, -18, 5, -26, 2);
      line("#f6c85f", 0, -22, 0, -30, 2);
      break;
    case "scepter":
      line("#d8e4ee", 0, 4, 0, -16, 2);
      poly("#b8f1ff", [[0, -26], [5, -20], [0, -14], [-5, -20]]);
      poly("#ffffff", [[0, -24], [2, -21], [0, -19], [-1, -21]], true);
      break;
    case "khopesh":
      line("#7f6438", 0, 4, 0, -4, 2);
      poly("#d8dde3", [[-1, -4], [2, -13], [7, -19], [11, -19], [7, -14], [3, -6]]);
      break;
    case "spear":
      line(wood, 0, 8, 0, -20, 2);
      poly(iron, [[0, -29], [3, -21], [0, -19], [-3, -21]]);
      line("#d94d3f", -2, -19, 2, -19, 1, true);
      break;
    case "axe":
      line(wood, 0, 6, 0, -22, 2);
      poly("#5c6670", [[1, -22], [11, -27], [12, -12], [1, -16]]);
      poly("#c9d2db", [[10, -26], [12, -26], [12, -13], [10, -14]], true);
      break;
    case "hammer":
      line(wood, 0, 6, 0, -16, 2);
      poly("#7d7a72", [[-8, -16], [8, -16], [8, -25], [-8, -25]]);
      poly("#5c5850", [[-8, -18], [8, -18], [8, -17], [-8, -17]], true);
      break;
    case "scythe":
      line("#3a2e40", 0, 10, 0, -26, 2);
      poly("#b9a8d6", [[0, -26], [15, -24], [20, -17], [11, -21], [0, -22]]);
      break;
    case "bomb": {
      const [bx, by] = p(0, -5);
      a.oval("#2a2a33", bx, by, 5, 5);
      a.px("#ffffff", bx - 2, by - 2, true);
      a.line("#c9a26b", bx + 2, by - 5, bx + 4, by - 8, true);
      a.px(anim % 2 ? "#ffd166" : "#ff742e", bx + 4, by - 9, true);
      break;
    }
    default:
      break;
  }
}

function paintCrown(a, x, y) {
  a.rect("#f6c85f", x - 7, y, 14, 4);
  a.poly("#f6c85f", [[x - 7, y], [x - 7, y - 5], [x - 4, y]]);
  a.poly("#f6c85f", [[x - 2, y], [x, y - 6], [x + 2, y]]);
  a.poly("#f6c85f", [[x + 4, y], [x + 7, y - 5], [x + 7, y]]);
  a.px("#ef5b4b", x, y + 1, true);
  a.px("#5aa45c", x - 4, y + 1, true);
  a.px("#55aaff", x + 4, y + 1, true);
}

// The painter, but every shape is twice as big and shifted by (ox, oy).
function doubled(a, ox, oy) {
  const X = (x) => x * 2 + ox;
  const Y = (y) => y * 2 + oy;
  return {
    px: (c, x, y, flat) => a.rect(c, X(x), Y(y), 2, 2, flat),
    rect: (c, x, y, w, h, flat) => a.rect(c, X(x), Y(y), w * 2, h * 2, flat),
    oval: (c, cx, cy, rx, ry, flat) => a.oval(c, X(cx) + 0.5, Y(cy) + 0.5, rx * 2 + 0.5, ry * 2 + 0.5, flat),
    line: (c, x0, y0, x1, y1, flat, thick = 1) => a.line(c, X(x0), Y(y0), X(x1), Y(y1), flat, thick * 2),
    poly: (c, pts, flat) => a.poly(c, pts.map(([x, y]) => [X(x), Y(y)]), flat),
    erase: (x, y, w = 1, h = 1) => a.erase(X(x), Y(y), w * 2, h * 2)
  };
}

const drawBossFigureOld = drawBossFigure;
drawBossFigure = function (g, enemy, cx, cy, size, t, look) {
  const type = enemy.type;
  const art = type && MONSTER_ART[type.name];
  const extra = BOSS_PIXEL[enemy.typeIndex];
  if (!art || !extra) return drawBossFigureOld(g, enemy, cx, cy, size, t, look);
  const busy = ["tell", "windup", "swing"].includes(enemy.state);
  const strike = ["lunge", "charge", "dash", "leap"].includes(enemy.state) || (enemy.state === "recover" && enemy.stateTimer > 0.35);
  const pose = busy ? "windup" : strike ? "dash" : "move";
  const f = { step: busy || strike ? 0 : Math.floor(t * 6) % 2, anim: Math.floor(t * 8) % 4, pose, lookX: 1, lookY: 0 };
  // The full 32-pixel monster design, with a crown and a weapon painted on
  // the same grid, all drawn with 2x pixels.
  const mx = 10;
  const top = 9;
  const w = art.w + mx * 2;
  const h = art.h + top;
  const weapon = enemy.melee ? null : extra.weapon;
  const key = `boss2|${type.name}|${f.step}|${f.anim}|${pose}|${weapon || ""}`;
  const sheet = paintedSheet(key, w, h, (a) => {
    const shifted = {
      px: (c, x, y, fl) => a.px(c, x + mx, y + top, fl),
      rect: (c, x, y, rw, rh, fl) => a.rect(c, x + mx, y + top, rw, rh, fl),
      oval: (c, ox, oy, rx, ry, fl) => a.oval(c, ox + mx, oy + top, rx, ry, fl),
      line: (c, x0, y0, x1, y1, fl, th) => a.line(c, x0 + mx, y0 + top, x1 + mx, y1 + top, fl, th),
      poly: (c, pts, fl) => a.poly(c, pts.map(([x, y]) => [x + mx, y + top]), fl),
      erase: (x, y, ew, eh) => a.erase(x + mx, y + top, ew, eh)
    };
    art.paint(shifted, f);
    paintCrown(scaledPainter(a, 0.5), extra.crown[0] * 2 + mx * 2, extra.crown[1] * 2 + top * 2 - 2);
    if (weapon) {
      const angle = pose === "windup" ? -0.9 : pose === "dash" ? 1.6 : 0.3 + (f.step ? 0.08 : 0);
      paintWeapon(scaledPainter(a, 0.5), weapon, extra.hand[0] * 2 + mx * 2, extra.hand[1] * 2 + top * 2, angle, f.anim);
    }
  });
  const face = look.x < -0.1;
  const dw = w * PX;
  const dh = h * PX;
  const x = snap(cx - dw / 2);
  const y = snap(art.fly ? cy - dh / 2 - 6 + (Math.sin(t * 4) > 0 ? PX : 0) : cy + size / 2 + 4 - dh);
  if (art.glow) {
    const r = dh * 0.5;
    const n = parseInt(art.glow.slice(1), 16);
    const rgb = `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
    const glow = g.createRadialGradient(cx, y + dh / 2, 0, cx, y + dh / 2, r);
    glow.addColorStop(0, `rgba(${rgb}, 0.35)`);
    glow.addColorStop(1, `rgba(${rgb}, 0)`);
    g.fillStyle = glow;
    g.fillRect(cx - r, y + dh / 2 - r, r * 2, r * 2);
  }
  // Angry bosses get a red glow around them.
  if (enemy.furious || enemy.enraged) {
    const r = dh * 0.55;
    const glow = g.createRadialGradient(cx, y + dh * 0.55, 0, cx, y + dh * 0.55, r);
    glow.addColorStop(0, `rgba(255, 70, 50, ${0.18 + Math.sin(t * 10) * 0.08})`);
    glow.addColorStop(1, "rgba(255, 70, 50, 0)");
    g.fillStyle = glow;
    g.fillRect(cx - r, y + dh * 0.55 - r, r * 2, r * 2);
  }
  const smooth = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  g.drawImage(face ? sheet.flip : sheet.canvas, x, y, dw, dh);
  g.imageSmoothingEnabled = smooth;
};

/* ---------- big bosses ----------
   The five big bosses are painted at full size (one sprite pixel is one
   screen pixel at their normal size of 84). Shapes are placed on the same
   grid the old block drawing used: one unit is 1/12 of the boss size, with
   (0, 0) at the boss's middle. */

const BIG_U = 3.5;
const BIG_W = 70;
const BIG_H = 70;
const BIG_OX = 35;
const BIG_OY = 42;

// The pixel painter, but measured in units around a middle point.
// k shrinks the sizes given in pixels (dots, line widths) along with u.
function unitPainter(a, ox, oy, u, k = 1) {
  const n = (v) => Math.max(1, Math.round(v * k));
  const X = (v) => Math.round(ox + v * u);
  const Y = (v) => Math.round(oy + v * u);
  return {
    X,
    Y,
    box: (c, x, y, w, h, flat) => a.rect(c, X(x), Y(y), Math.max(1, X(x + w) - X(x)), Math.max(1, Y(y + h) - Y(y)), flat),
    dot: (c, x, y, w = 1, h = w, flat = true) => a.rect(c, X(x), Y(y), n(w), n(h), flat),
    oval: (c, cx, cy, rx, ry, flat) => a.oval(c, ox + cx * u, oy + cy * u, rx * u, ry * u, flat),
    poly: (c, pts, flat) => a.poly(c, pts.map(([x, y]) => [ox + x * u, oy + y * u]), flat),
    line: (c, x0, y0, x1, y1, flat, thick = 1) => a.line(c, X(x0), Y(y0), X(x1), Y(y1), flat, n(thick)),
    raw: a,
    k
  };
}

const mirror = (pts) => pts.map(([x, y]) => [-x, y]);

function paintBonecrown(P, f) {
  const bone = "#e8e2cf";
  const eye = f.angry ? "#ff4b4b" : "#7cf2ff";
  const sway = [0, 0.15, 0.3, 0.15][f.anim];
  // Cape, robe and its folds.
  P.poly("#7a1f2b", [[-4.4, -2.4], [4.4, -2.4], [6, 6.4], [-6, 6.4]]);
  P.poly("#5b2a6e", [[-3.8, -2], [3.8, -2], [5.3, 6.2], [-5.3, 6.2]]);
  P.line("#47205a", -2.6, 0.8, -3.6, 5.8, true, 2);
  P.line("#47205a", 2.6, 0.8, 3.6, 5.8, true, 2);
  P.line("#47205a", -1.1, 3.8, -1.3, 5.8, true, 1);
  P.line("#47205a", 1.1, 3.8, 1.3, 5.8, true, 1);
  P.box("#f6c85f", -5.2, 5.6, 10.4, 0.45, true);
  P.box("#f6c85f", -0.3, 3.8, 0.6, 1.9, true);
  P.box(bone, -2.3, 6.2, 1.4, 0.9);
  P.box(bone, 0.9, 6.2, 1.4, 0.9);
  // Ribs.
  P.box("#d8d2bf", -2.7, -1.4, 5.4, 5.1);
  for (const ry of [-0.4, 0.8, 2, 3.1]) P.box("#2a2520", -2.2, ry, 4.4, 0.35, true);
  P.box(bone, -0.4, -1.4, 0.8, 5.1);
  // Left hand resting on the robe.
  P.line("#5b2a6e", -3.6, -1.6, -4.8, 0.6, false, 7);
  P.box(bone, -5.4, 0.4, 1.4, 1.1);
  P.dot("#2a2520", -5, 1.1, 1, 2);
  P.dot("#2a2520", -4.6, 1.1, 1, 2);
  // Ermine collar: white fur with black tips.
  P.box("#f4f1ea", -4.6, -2.9, 9.2, 1.3);
  for (let i = -4; i <= 4; i += 1.6) P.dot("#1a1410", i, -2.5, 2, 2);
  // The skull.
  P.oval(bone, 0, -4.9, 3.1, 2.7);
  P.box(bone, -2.1, -3.2, 4.2, 1.3);
  P.box("#d0c9b4", -2.1, -2.3, 4.2, 0.45);
  for (let k = 0; k < 5; k += 1) P.dot("#2a2520", -1.6 + k * 0.8, -3, 1, 4);
  P.oval("#1a1410", -1.35, -4.9, 0.95, 0.85, true);
  P.oval("#1a1410", 1.35, -4.9, 0.95, 0.85, true);
  for (const ex of [-1.35, 1.35]) {
    P.dot(eye, ex - 0.2 + f.look * 0.3, -5.1, 3, 3);
    P.dot("#ffffff", ex - 0.2 + f.look * 0.3, -5.1, 1, 1);
    if (f.angry) {
      const lick = (f.anim + (ex > 0 ? 2 : 0)) % 4;
      P.dot("#ff8a3d", ex - 0.1, -6.1 - lick * 0.12, 2, 2);
      P.dot("#ffd166", ex, -6.5 - lick * 0.12, 1, 1);
    }
  }
  P.poly("#1a1410", [[-0.45, -3.9], [0.45, -3.9], [0, -3.3]], true);
  P.line("#a39c88", 1.1, -7.4, 1.7, -6.5, true, 1);
  P.line("#a39c88", 1.7, -6.5, 1.3, -6.1, true, 1);
  // The crown.
  P.box("#f6c85f", -3.2, -8.4, 6.4, 1.3);
  P.box("#8a5f12", -3.2, -7.3, 6.4, 0.3, true);
  P.poly("#f6c85f", [[-3.2, -8.4], [-3.2, -10.3], [-1.9, -8.4]]);
  P.poly("#f6c85f", [[-0.8, -8.4], [0, -11], [0.8, -8.4]]);
  P.poly("#f6c85f", [[1.9, -8.4], [3.2, -10.3], [3.2, -8.4]]);
  P.dot("#fff3c4", -3.25, -10.6, 2, 2);
  P.dot("#fff3c4", -0.15, -11.3, 2, 2);
  P.dot("#fff3c4", 2.95, -10.6, 2, 2);
  P.oval("#c084fc", -2, -7.8, 0.35, 0.35, true);
  P.oval("#ef5b4b", 0, -7.8, 0.4, 0.4, true);
  P.oval("#c084fc", 2, -7.8, 0.35, 0.35, true);
  // The skull scepter in the right hand.
  let hx = 4.5;
  let hy = 0.2;
  let angle = sway * 0.4;
  if (f.pose === "windup") {
    hy = -2.6;
    angle = -0.35;
  } else if (f.pose === "dash") {
    hx = 5.4;
    hy = -0.6;
    angle = 0.95;
  }
  const ux = Math.sin(angle);
  const uy = -Math.cos(angle);
  P.line("#5b2a6e", 3.5, -1.8, hx - 0.3, hy + 0.2, false, 7);
  P.line("#8a5f12", hx - ux * 3, hy - uy * 3, hx + ux * 5.6, hy + uy * 5.6, false, 3);
  const tx = hx + ux * 6.6;
  const ty = hy + uy * 6.6;
  P.oval(bone, tx, ty, 1.1, 1, false);
  P.dot("#1a1410", tx - 0.55, ty - 0.2, 2, 2);
  P.dot("#1a1410", tx + 0.2, ty - 0.2, 2, 2);
  P.dot(eye, tx - 0.15, ty + 0.55, 2, 1);
  P.box(bone, hx - 0.8, hy - 0.5, 1.6, 1.1);
  P.dot("#2a2520", hx - 0.3, hy + 0.1, 1, 2);
}

function paintMagmaw(P, f) {
  const glow = f.angry ? "#ffe45c" : f.anim % 2 ? "#ff9a3e" : "#ff7a2e";
  const hot = f.angry ? "#fffbe0" : "#ffd166";
  const bob = [0, 0.3, 0.45, 0.15][f.anim];
  let lf = [-6.4, 2.8 + bob];
  let rf = [6.4, 2.8 - bob];
  if (f.pose === "windup") {
    lf = [-6, -6.6];
    rf = [6, -6.6];
  } else if (f.pose === "dash") {
    lf = [-4.6, 4.9];
    rf = [4.6, 4.9];
  }
  // Legs.
  P.box("#3a2520", -4.1, 4.6, 3, 2.6);
  P.box("#3a2520", 1.1, 4.6, 3, 2.6);
  P.dot(glow, -3.2, 6.2, 3, 1);
  P.dot(glow, 2.2, 6.2, 3, 1);
  // Arms behind the body.
  P.line("#4a3029", -4.9, -2.8, lf[0], lf[1], false, 12);
  P.line("#4a3029", 4.9, -2.8, rf[0], rf[1], false, 12);
  // Body: one big rock with a lighter top.
  P.poly("#6b4a3e", [[-4.2, -5.9], [4.2, -5.9], [5.2, -3.6], [5, 3.6], [3.7, 5.3], [-3.7, 5.3], [-5, 3.6], [-5.2, -3.6]]);
  P.poly("#8f6253", [[-4.2, -5.9], [4.2, -5.9], [4.7, -4.8], [-4.7, -4.8]]);
  P.poly("#5a3d33", [[-5, 3.6], [-3.7, 5.3], [3.7, 5.3], [5, 3.6], [3.8, 4.3], [-3.8, 4.3]], true);
  // Shoulder boulders.
  P.oval("#7a5244", -5.1, -3.8, 1.8, 1.6);
  P.oval("#7a5244", 5.1, -3.8, 1.8, 1.6);
  P.dot("#a7786a", -5.8, -4.8, 3, 1);
  P.dot("#a7786a", 4.4, -4.8, 3, 1);
  // Face: brow, burning eyes, a mouth full of fire.
  P.box("#3a2520", -3.9, -5, 7.8, 0.6, true);
  P.box("#1a0a06", -3.4, -4.4, 2.4, 1.6, true);
  P.box("#1a0a06", 1, -4.4, 2.4, 1.6, true);
  const eyeColor = f.blink ? hot : glow;
  P.box(eyeColor, -3 + f.look * 0.3, -4, 1.5, 0.8, true);
  P.box(eyeColor, 1.5 + f.look * 0.3, -4, 1.5, 0.8, true);
  P.dot("#fffbe0", -2.6 + f.look * 0.3, -4, 1, 1);
  P.dot("#fffbe0", 1.9 + f.look * 0.3, -4, 1, 1);
  P.box("#1a0a06", -2.6, -2.3, 5.2, 1.5, true);
  P.box(glow, -2.2, -1.85, 4.4, 0.7, true);
  for (let k = 0; k < 5; k += 1) P.dot("#c8b0a4", -2.3 + k * 1.1, -2.3, 2, 2);
  // Lava cracks and a glowing heart.
  const cracks = [[-3.6, 0.6, -1.2, 0.5], [-1.4, 0.5, -1.1, 2.8], [1.4, 1.4, 4, 1.1], [2.2, 1.3, 2.6, 4], [-3.2, 3.4, -1, 3.9]];
  if (f.angry) cracks.push([-4.4, -2, -2.4, -0.6], [3.4, -2.4, 4.6, -0.4]);
  for (const [x0, y0, x1, y1] of cracks) P.line(glow, x0, y0, x1, y1, true, 2);
  P.oval(glow, 0.2, 1.6, 0.9, 0.9, true);
  P.oval(hot, 0.2, 1.6, 0.4, 0.4, true);
  // Fists in front.
  for (const [fx, fy] of [lf, rf]) {
    P.oval("#7a5244", fx, fy, 1.75, 1.55);
    P.dot("#3a2520", fx - 0.9, fy - 0.2, 1, 4);
    P.dot("#3a2520", fx, fy - 0.2, 1, 4);
    P.dot("#3a2520", fx + 0.9, fy - 0.2, 1, 4);
    P.dot(glow, fx - 0.5, fy + 0.6, 2, 1);
  }
}

function paintFrostbite(P, f) {
  const eye = f.angry ? "#1d4ed8" : "#2a6fb0";
  // Long hair behind the shoulders.
  P.poly("#8fcdf0", [[-2.8, -6.8], [2.8, -6.8], [3.4, -0.6], [-3.4, -0.6]]);
  // The gown: four layers of ice, each with icicles under its edge.
  const tiers = [["#5fb8e0", 2.4, 3.4, 0, 1.6], ["#8fd3f0", 3.4, 4.5, 1.5, 3.4], ["#bfeaff", 4.5, 5.6, 3.3, 5.2], ["#e6f8ff", 5.6, 6, 5.1, 6.6]];
  for (const [c, w0, w1, y0, y1] of tiers) {
    P.poly(c, [[-w0, y0], [w0, y0], [w1, y1], [-w1, y1]]);
    for (let x = -w1 + 0.5; x < w1 - 0.3; x += 1.1) P.poly(c, [[x - 0.4, y1 - 0.1], [x + 0.4, y1 - 0.1], [x, y1 + 0.55]]);
    P.box("#ffffff", -w0, y0, w0 * 2, 0.2, true);
    P.box("#4f9fcc", -w1 + 0.2, y1 - 0.15, w1 * 2 - 0.4, 0.15, true);
  }
  // Sparkles crawling over the gown.
  const spark = [[-2.6, 2.2], [3.2, 4], [-4.2, 5.8], [1.2, 2.6]][f.anim];
  P.dot("#ffffff", spark[0], spark[1] - 0.3, 1, 5);
  P.dot("#ffffff", spark[0] - 0.3, spark[1], 5, 1);
  // Bodice and the frost gem.
  P.box("#5fb8e0", -2.1, -3, 4.2, 3.2);
  P.box("#e6f8ff", -0.35, -3, 0.7, 3.2, true);
  P.oval("#bdf1ff", 0, -2.1, 0.5, 0.5, true);
  P.dot("#ffffff", -0.1, -2.4, 1, 1);
  // Left arm hangs, right arm holds the ice orb.
  P.box("#bfeaff", -3.5, -2.7, 1.3, 3.2);
  P.box("#f2fbff", -3.4, 0.5, 1.1, 0.8);
  let hand = [3, 0.4];
  if (f.pose === "windup") hand = [4.2, -5.4];
  else if (f.pose === "dash") hand = [5, -1.8];
  P.line("#bfeaff", 2.9, -2.4, hand[0], hand[1], false, 8);
  P.box("#f2fbff", hand[0] - 0.5, hand[1] - 0.2, 1.1, 0.9);
  const orb = [hand[0] + 0.1, hand[1] - 1.1];
  P.oval("#7fd8ff", orb[0], orb[1], 0.95, 0.95, false);
  P.oval("#e6fbff", orb[0] - 0.2, orb[1] - 0.2, 0.4, 0.4, true);
  if (f.pose !== "move") {
    P.dot("#ffffff", orb[0], orb[1] - 2, 1, 3);
    P.dot("#ffffff", orb[0] - 1.6, orb[1], 3, 1);
    P.dot("#ffffff", orb[0] + 1.2, orb[1], 3, 1);
  }
  // Face, framed by hair.
  P.box("#fdf3ee", -0.5, -3.7, 1, 0.8);
  P.oval("#fdf3ee", 0, -5, 1.9, 2);
  P.box("#a9dcf7", -2.6, -6.4, 0.8, 4);
  P.box("#a9dcf7", 1.8, -6.4, 0.8, 4);
  P.poly("#a9dcf7", [[-2.3, -7], [2.3, -7], [2.1, -5.8], [0.7, -6.4], [-0.3, -5.8], [-2.1, -6.3]]);
  for (const ex of [-0.9, 0.7]) {
    P.dot("#1b3c5c", ex - 0.2 + f.look * 0.2, -5.6, 3, 1);
    if (!f.blink) {
      P.dot(eye, ex - 0.1 + f.look * 0.2, -5.4, 2, 3);
      P.dot("#ffffff", ex - 0.1 + f.look * 0.2, -5.4, 1, 1);
    } else P.dot("#1b3c5c", ex - 0.1, -5.1, 2, 1);
  }
  P.dot("#f6c6d6", -1.6, -4.5, 2, 1);
  P.dot("#f6c6d6", 1.2, -4.5, 2, 1);
  P.dot(f.angry ? "#1d4ed8" : "#5a9ed8", -0.25, -3.95, 3, 1);
  // Ice crown.
  [[-2.4, 1.4], [-1.4, 2.6], [-0.3, 3.7], [0.8, 2.6], [1.8, 1.4]].forEach(([cx, h], i) => {
    P.poly(i % 2 ? "#ffffff" : "#bdf1ff", [[cx - 0.45, -7], [cx + 0.45, -7], [cx + 0.05, -7 - h]]);
  });
  P.box("#bdf1ff", -2.6, -7.4, 5.2, 0.6);
  P.dot("#55aaff", -0.15, -7.3, 2, 2);
}

function paintShadowfang(P, f) {
  let flap = [0, 0.4, 0.8, 0.4][f.anim];
  if (f.pose === "windup") flap = 1.3;
  else if (f.pose === "dash") flap = -0.8;
  // Bat wings: dark frame, red skin, and finger bones.
  for (const side of [-1, 1]) {
    const tip = [side * (7.5 + flap), -(6 + flap)];
    const pts = (k) => [[side * 1.5, -4], [tip[0] * k, tip[1] * k], [side * 6.5 * k, 1], [side * 7 * k, 5 * k], [side * 2, 6 * k]];
    P.poly("#1a1226", pts(1));
    P.poly("#8a1838", pts(0.82));
    for (const [bx, by] of [[tip[0], tip[1]], [side * 6.5, 1], [side * 7, 5]]) P.line("#1a1226", side * 1.6, -3.8, bx * 0.95, by * 0.95, true, 2);
    P.dot("#e6e0ef", tip[0] - (side > 0 ? 0.1 : 0), tip[1] - 0.2, 2, 2);
  }
  // Cape, shirt and a red jewel.
  P.poly("#120c1a", [[-2.4, -3.1], [2.4, -3.1], [3.4, 5.6], [-3.4, 5.6]]);
  P.line("#8a1838", -2.4, -3, -3.3, 5.5, true, 1);
  P.line("#8a1838", 2.4, -3, 3.3, 5.5, true, 1);
  P.poly("#f2f2f2", [[-0.9, -3.1], [0.9, -3.1], [0.4, 0.6], [-0.4, 0.6]]);
  P.box("#c0254a", -0.9, -3, 1.8, 0.7);
  P.oval("#ff4f7e", 0, -1.6, 0.4, 0.4, true);
  P.dot("#f6c85f", -0.15, -0.8, 2, 2);
  P.box("#120c1a", -2.2, 5.5, 1.6, 1.6);
  P.box("#120c1a", 0.6, 5.5, 1.6, 1.6);
  // Hands with claws: at the cape, or raised to strike.
  const hands = f.pose === "windup" ? [[-3.6, -3.2], [3.2, -3.2]] : f.pose === "dash" ? [[-2.2, -0.6], [3.6, -1.6]] : [[-2.9, 0.4], [2.3, 0.4]];
  for (const [hx, hy] of hands) {
    P.box("#e6e0ef", hx, hy, 0.8, 0.8);
    P.dot("#ffffff", hx, hy - 0.4, 1, 2);
    P.dot("#ffffff", hx + 0.5, hy - 0.4, 1, 2);
  }
  // High collar.
  P.poly("#8a1838", [[-2.1, -3], [-3.8, -3.4], [-4.1, -7.8], [-2.3, -5.6]]);
  P.poly("#8a1838", mirror([[-2.1, -3], [-3.8, -3.4], [-4.1, -7.8], [-2.3, -5.6]]));
  // Pale face with pointy ears, slicked hair, red eyes and fangs.
  P.poly("#d8d0e6", [[-1.9, -6.2], [-3.1, -7.4], [-1.9, -5]]);
  P.poly("#d8d0e6", mirror([[-1.9, -6.2], [-3.1, -7.4], [-1.9, -5]]));
  P.oval("#e6e0ef", 0, -5.7, 2.05, 2.3);
  P.poly("#120c1a", [[-2.3, -6.3], [-2.3, -7.7], [2.3, -7.7], [2.3, -6.3], [0.7, -7], [0, -6.2], [-0.7, -7]]);
  const eye = f.angry ? "#ff2a2a" : "#e0457f";
  P.line("#120c1a", -1.7, -6.5, -0.4, -6.1, true, 1);
  P.line("#120c1a", 1.7, -6.5, 0.4, -6.1, true, 1);
  for (const ex of [-1.2, 0.6]) {
    P.dot("#1a0a10", ex - 0.1, -5.9, 4, 3);
    P.dot(eye, ex + 0.05 + f.look * 0.15, -5.8, 2, 2);
  }
  if (f.angry) {
    P.dot("#ff8a8a", -1.1 + f.look * 0.15, -5.8, 1, 1);
    P.dot("#ff8a8a", 0.7 + f.look * 0.15, -5.8, 1, 1);
  }
  const open = f.pose !== "move";
  P.box("#5a1830", -0.9, -4.5, 1.8, open ? 0.6 : 0.3, true);
  P.dot("#ffffff", -0.8, -4.3, 1, open ? 3 : 2);
  P.dot("#ffffff", 0.6, -4.3, 1, open ? 3 : 2);
}

function paintColossus(P, f) {
  const dark = "#5b3fc4";
  const mid = "#8f6cff";
  const light = "#d6c7ff";
  const core = f.angry ? "#ff6bd5" : "#ffe45c";
  const bob = [0, 0.2, 0.35, 0.15][f.anim];
  let hands = [[-6.1, 2.4 + bob], [6.1, 2.4 - bob]];
  if (f.pose === "windup") hands = [[-6, -6.6], [6, -6.6]];
  else if (f.pose === "dash") hands = [[-4.6, 4.6], [4.6, 4.6]];
  // Legs.
  P.poly(dark, [[-4.1, 3.8], [-1, 3.8], [-1.3, 7.1], [-4.3, 7.1]]);
  P.poly(dark, mirror([[-4.1, 3.8], [-1, 3.8], [-1.3, 7.1], [-4.3, 7.1]]));
  P.poly("#7a5ee8", [[-3.9, 4], [-2.6, 4], [-3.4, 6.8], [-4.1, 6.8]], true);
  P.poly("#7a5ee8", [[1.3, 4], [2.6, 4], [1.9, 6.8], [1.1, 6.8]], true);
  // Arms: crystal pillars ending in crystal fists.
  for (const [hx, hy] of hands) {
    const side = Math.sign(hx);
    P.line(dark, side * 4.9, -2.6, hx, hy, false, 13);
    P.line("#7a5ee8", side * 4.6, -2.6, hx - side * 0.4, hy, true, 3);
  }
  // Body: a big gem with facets and seams.
  const bodyPts = [[-4.4, -4.3], [4.4, -4.3], [5.3, -1.4], [4.2, 4.4], [-4.2, 4.4], [-5.3, -1.4]];
  P.poly(mid, bodyPts);
  P.poly("#b6a0ff", [[-4.4, -4.3], [-1.4, -4.3], [-3, 0.2], [-5.3, -1.4]], true);
  P.poly("#7356e0", [[4.2, 4.4], [1.4, 4.4], [3, 0.6], [5.3, -1.4]], true);
  for (const [x, y] of bodyPts) P.line(f.angry ? "#ff6bd5" : "#6a4fd6", x * 0.3, y * 0.3 + 0.2, x * 0.92, y * 0.92, true, 1);
  P.oval(core, 0, 0.2, 1.55, 1.55, true);
  P.oval(f.anim % 2 ? "#ffffff" : light, 0, 0.2, 0.75, 0.75, true);
  if (f.anim % 2) {
    P.dot("#ffffff", -0.05, -1.9, 1, 2);
    P.dot("#ffffff", -0.05, 1.8, 1, 2);
    P.dot("#ffffff", -2, 0.15, 2, 1);
    P.dot("#ffffff", 1.75, 0.15, 2, 1);
  }
  // Shoulder crystals.
  const shoulder = [[-7.2, -1.8], [-4.9, -1.8], [-5.2, -5.6], [-6.2, -8.6], [-7.1, -5.6]];
  P.poly(mid, shoulder);
  P.poly(mid, mirror(shoulder));
  P.poly(light, [[-7.1, -5.6], [-6.2, -8.6], [-6.2, -2], [-7.1, -2]], true);
  P.poly(light, [[5.3, -5.6], [6.2, -8.6], [6.2, -2], [5.3, -2]], true);
  // Crystal fists.
  for (const [hx, hy] of hands) {
    P.poly(mid, [[hx, hy - 1.7], [hx + 1.4, hy], [hx, hy + 1.7], [hx - 1.4, hy]]);
    P.poly(light, [[hx, hy - 1.7], [hx - 1.4, hy], [hx, hy]], true);
  }
  // Head with crystal spikes and glowing eyes.
  P.poly(mid, [[-2.4, -8], [2.4, -8], [2.9, -5.8], [1.8, -4.2], [-1.8, -4.2], [-2.9, -5.8]]);
  P.poly("#b6a0ff", [[-2.4, -8], [-0.6, -8], [-1.6, -5.8], [-2.9, -5.8]], true);
  P.poly(light, [[-0.6, -8], [0, -10.6], [0.6, -8]]);
  P.poly(light, [[-2.3, -8], [-2, -9.6], [-1.3, -8]]);
  P.poly(light, mirror([[-2.3, -8], [-2, -9.6], [-1.3, -8]]));
  const eye = f.angry ? "#ff6bd5" : "#ffffff";
  P.box("#2b1a6e", -2, -6.6, 1.5, 0.9, true);
  P.box("#2b1a6e", 0.5, -6.6, 1.5, 0.9, true);
  P.box(eye, -1.8 + f.look * 0.25, -6.5, 1.1, 0.6, true);
  P.box(eye, 0.7 + f.look * 0.25, -6.5, 1.1, 0.6, true);
}

const BIG_PAINTERS = [paintBonecrown, paintMagmaw, paintFrostbite, paintShadowfang, paintColossus];

// Painting a big sprite takes a few milliseconds, so paint at most one new
// frame every 30 ms and reuse the last frame meanwhile (no stutter when a
// fight starts).
const lastBigSheet = new Map();
let lastBigPaint = 0;
function bigSheet(owner, key, w, h, paint) {
  const cached = pixelCache.get(key);
  const now = performance.now();
  if (!cached && lastBigSheet.has(owner) && now - lastBigPaint < 30) return lastBigSheet.get(owner);
  if (!cached) lastBigPaint = now;
  const sheet = cached || paintedSheet(key, w, h, paint);
  lastBigSheet.set(owner, sheet);
  return sheet;
}

// Small things that fly around some big bosses, painted once.
const ORBITERS = {
  ice: [["  o  ", " oLo ", "oLBBo", " oBo ", "  o  "]],
  shard: [[" o ", "oLo", "oBo", "oBo", "oDo", " o "]],
  bat: [["V     V", "VV V VV", "VVRVRVV", "  VVV  "], ["       ", " VVVVV ", "VVRVRVV", "V  V  V"]]
};
const ORBITER_PAL = {
  ice: { o: "#2a5f7a", L: "#ffffff", B: "#bdf1ff" },
  shard: { o: "#2b1a6e", L: "#ffffff", B: "#d6c7ff", D: "#a58cff" },
  bat: { V: "#2a1f3d", R: "#e0457f" }
};

function drawOrbiter(g, kind, frame, x, y) {
  const rows = ORBITERS[kind][frame] || ORBITERS[kind][0];
  const sheet = pixelSheet(`orb2|${kind}|${frame}`, rows, ORBITER_PAL[kind]);
  blit2(g, sheet, x - sheet.width, y - sheet.height);
}

drawBigBoss = function (g, row, x, y, s, t, b) {
  const paint = BIG_PAINTERS[Math.min(row, BIG_PAINTERS.length - 1)];
  const u = s / 12;
  const scale = s / 84;
  const angry = Boolean(b && b.enraged);
  const lookRaw = !b || state.mode === "title" ? 0 : clamp((nearestPlayer(x, y).x - x) / 200, -1, 1);
  const look = lookRaw > 0.35 ? 1 : lookRaw < -0.35 ? -1 : 0;
  const st = b ? b.state : "move";
  const busy = ["tell", "windup", "swing", "retreat"].includes(st);
  const strike = ["lunge", "charge", "dash", "leap"].includes(st) || (st === "recover" && b.stateTimer > 0.35);
  const pose = busy ? "windup" : strike ? "dash" : "move";
  const anim = Math.floor(t * 6) % 4;
  const blink = Math.sin(t * 5) > 0.2 ? (row === 1 ? 1 : 0) : 0;
  const winks = row === 2 && (t % 3.2) < 0.12 ? 1 : 0;
  const f = { anim, look, angry, pose, blink: blink || winks };
  const key = `big|${row}|${anim}|${look}|${angry ? 1 : 0}|${pose}|${f.blink}`;
  const sheet = bigSheet(`big${row}`, key, BIG_W, BIG_H, (a) => paint(unitPainter(a, BIG_OX, BIG_OY, BIG_U, 0.5), f));
  const float = row === 2 ? Math.round(Math.sin(t * 2.2) * 0.5 * u) : 0;
  const left = snap(x - BIG_OX * PX);
  const top = snap(y - BIG_OY * PX + float);
  const w = BIG_W * PX;
  const h = BIG_H * PX;
  // Orbiters behind the boss.
  const orbit = (front) => {
    if (row === 2) {
      for (let i = 0; i < 3; i += 1) {
        const a = t * 1.6 + i * 2.094;
        if (Math.sin(a) > 0 === front) drawOrbiter(g, "ice", 0, x + Math.cos(a) * 6.5 * u, y + (Math.sin(a) * 2.5 - 2) * u);
      }
    } else if (row === 3) {
      for (let i = 0; i < 2; i += 1) {
        const a = t * 2 + i * Math.PI;
        if (Math.sin(a) > 0 === front) drawOrbiter(g, "bat", Math.sin(t * 16 + i) > 0 ? 1 : 0, x + Math.cos(a) * 7 * u, y + (-8 + Math.sin(a * 2)) * u);
      }
    } else if (row >= 4) {
      for (let i = 0; i < 4; i += 1) {
        const a = t * 1.2 + (i * Math.PI) / 2;
        if (Math.sin(a) > 0 === front) drawOrbiter(g, "shard", 0, x + Math.cos(a) * 7.5 * u, y + (Math.sin(a) * 3 - 1) * u);
      }
    }
  };
  orbit(false);
  if (angry) {
    const r = h * 0.55;
    const glow = g.createRadialGradient(x, y - u, 0, x, y - u, r);
    glow.addColorStop(0, `rgba(255, 70, 50, ${0.2 + Math.sin(t * 10) * 0.08})`);
    glow.addColorStop(1, "rgba(255, 70, 50, 0)");
    g.fillStyle = glow;
    g.fillRect(x - r, y - u - r, r * 2, r * 2);
  }
  const smooth = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  const frozen = b && state.clock < b.slowUntil;
  g.drawImage(frozen ? tintedImage(sheet, "#6fd6ff", false) : sheet.canvas, left, top, w, h);
  if (b && b.flash > 0) {
    const alpha = g.globalAlpha;
    g.globalAlpha = alpha * 0.75;
    g.drawImage(sheet.white, left, top, w, h);
    g.globalAlpha = alpha;
  }
  g.imageSmoothingEnabled = smooth;
  orbit(true);
  if (row === 1 && b && state.mode === "playing" && Math.random() < 0.12) burst(x + rand(-s / 2, s / 2), y + s * 0.2, [angry ? "#ffe45c" : "#ff7a2e", "#ffd166"], 1, 40);
};

// Same as before, minus the square flash and frozen box (the sprite itself
// flashes and freezes now).
drawBigBossFoe = function (b) {
  const s = b.size;
  const lift = b.hop || 0;
  const shrink = 1 - Math.min(0.6, lift / 500);
  ctx.globalAlpha = b.alpha;
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.beginPath();
  ctx.ellipse(b.x, b.y + s * 0.56, s * 0.55 * shrink, 7 * shrink, 0, 0, Math.PI * 2);
  ctx.fill();
  const cx = b.x + (b.state === "windup" ? rand(-3, 3) : 0);
  const cy = b.y - lift;
  drawBigBoss(ctx, b.row, cx, cy, s, b.wobble, b);
  if (b.melee) drawSword(b, cx, cy);
  if (isBurning(b)) {
    const flick = Math.floor(state.anim * 12) % 2;
    ctx.fillStyle = "#ff742e";
    ctx.fillRect(cx - 10, cy - s * 0.95 - flick, 7, 10 + flick);
    ctx.fillRect(cx + 4, cy - s * 0.98 + flick, 7, 12 - flick);
  }
  ctx.globalAlpha = 1;
};

/* ---------- the dragon ----------
   Painted at its real size (96), measured in fractions of its size like
   the old drawing. Friendly Blocky is pink and smiles; the angry dragon is
   red, glares at you and opens its mouth before it breathes fire. */

const DRAGON_W = 108;
const DRAGON_H = 80;
const DRAGON_OX = 54;
const DRAGON_OY = 47;

function paintDragon(P, f) {
  const fr = f.friendly;
  const body = fr ? "#ff8fb1" : "#c0395b";
  const dark = fr ? "#d9628a" : "#86203f";
  const wing = fr ? "#f59ec0" : "#7a2848";
  const skin = fr ? "#ffc4d8" : "#a8385e";
  const ink = "#3a1020";
  const flap = f.flap;
  // Wings: a dark frame, lighter skin, finger bones and a claw at the tip.
  for (const side of [-1, 1]) {
    const shoulder = [side * 0.3, -0.15];
    const tip = [side * 1.05, -0.5 - flap * 0.25];
    const low = [side * 0.95, 0.15 - flap * 0.08];
    const root = [side * 0.35, 0.2];
    P.poly(wing, [shoulder, tip, low, root]);
    const inset = (p, k) => [shoulder[0] + (p[0] - shoulder[0]) * k, shoulder[1] + (p[1] - shoulder[1]) * k];
    P.poly(skin, [inset(tip, 0.9), inset(low, 0.88), [side * 0.42, 0.16]], true);
    P.line(wing, shoulder[0], shoulder[1], tip[0], tip[1], false, 4);
    for (const k of [0.45, 0.75]) {
      const edge = [low[0] + (root[0] - low[0]) * (1 - k) * 0.9, low[1] + (root[1] - low[1]) * (1 - k) * 0.9];
      const joint = inset(tip, 0.85);
      P.line(dark, joint[0], joint[1], edge[0] * 0.5 + low[0] * 0.5 * k, edge[1], true, 2);
    }
    P.line(dark, inset(tip, 0.85)[0], inset(tip, 0.85)[1], low[0], low[1], true, 2);
    P.dot("#f6e7c1", tip[0] - (side > 0 ? 0.01 : 0), tip[1] - 0.04, 3, 4);
  }
  // Tail curling out to the right, with a spade tip.
  P.line(body, 0.25, 0.36, 0.55, 0.33, false, 14);
  P.line(body, 0.55, 0.33, 0.7, 0.16, false, 10);
  P.poly(dark, [[0.64, 0.14], [0.74, 0.0], [0.84, 0.12], [0.74, 0.18]]);
  for (const k of [0.32, 0.44, 0.56]) P.dot(wing, k, 0.27, 3, 3);
  // Body with a striped belly and a few scales.
  P.box(body, -0.4, -0.3, 0.8, 0.75);
  P.raw.erase(P.X(-0.4), P.Y(-0.3), 1, 1);
  P.raw.erase(P.X(0.4) - 1, P.Y(-0.3), 1, 1);
  P.oval("#ffd28a", 0, 0.16, 0.22, 0.25);
  for (let i = 0; i < 4; i += 1) P.box("#e0a95e", -0.18 + Math.abs(i - 1.5) * 0.015, 0.0 + i * 0.1, 0.36 - Math.abs(i - 1.5) * 0.03, 0.02, true);
  for (const [sx, sy] of [[-0.33, -0.12], [-0.31, 0.08], [-0.34, 0.26], [0.28, -0.1], [0.3, 0.12], [0.27, 0.3]]) {
    P.dot(dark, sx, sy, 3, 1);
    P.dot(dark, sx + 0.01, sy + 0.01, 1, 1);
  }
  // Little arms.
  P.box(body, -0.36, -0.02, 0.1, 0.16);
  P.box(body, 0.26, -0.02, 0.1, 0.16);
  P.dot("#f6e7c1", -0.35, 0.13, 2, 2);
  P.dot("#f6e7c1", 0.31, 0.13, 2, 2);
  // Feet with claws.
  P.box(dark, -0.36, 0.42, 0.19, 0.11);
  P.box(dark, 0.17, 0.42, 0.19, 0.11);
  for (const fx of [-0.34, -0.28, -0.22, 0.19, 0.25, 0.31]) P.dot("#f6e7c1", fx, 0.52, 2, 2);
  // Head: horns, ear fins and spikes first, then the face.
  P.poly("#f6e7c1", [[-0.3, -0.66], [-0.21, -0.68], [-0.27, -0.88], [-0.36, -0.82]]);
  P.poly("#f6e7c1", mirror([[-0.3, -0.66], [-0.21, -0.68], [-0.27, -0.88], [-0.36, -0.82]]));
  P.poly(wing, [[-0.29, -0.58], [-0.44, -0.66], [-0.38, -0.5], [-0.29, -0.45]]);
  P.poly(wing, mirror([[-0.29, -0.58], [-0.44, -0.66], [-0.38, -0.5], [-0.29, -0.45]]));
  for (const sx of [-0.08, 0.06]) P.poly(wing, [[sx - 0.035, -0.69], [sx + 0.005, -0.77], [sx + 0.045, -0.69]]);
  P.box(body, -0.3, -0.7, 0.6, 0.44);
  P.raw.erase(P.X(-0.3), P.Y(-0.7), 1, 1);
  P.raw.erase(P.X(0.3) - 1, P.Y(-0.7), 1, 1);
  // A shadow under the jaw so the head stands out from the body.
  P.box(dark, -0.28, -0.27, 0.56, 0.03, true);
  P.box(dark, -0.22, -0.24, 0.44, 0.02, true);
  // Snout with nostrils and the mouth.
  P.box(fr ? "#ffb3c8" : "#d9577a", -0.2, -0.39, 0.4, 0.17);
  P.dot(ink, -0.11, -0.36, 4, 3);
  P.dot(ink, 0.07, -0.36, 4, 3);
  if (f.open) {
    P.box(ink, -0.15, -0.28, 0.3, 0.09, true);
    P.box("#ff7a2e", -0.11, -0.25, 0.22, 0.04, true);
    P.dot("#ffd166", -0.04, -0.245, 8, 2);
    P.dot("#ffffff", -0.13, -0.28, 2, 3);
    P.dot("#ffffff", 0.11, -0.28, 2, 3);
  } else if (fr) {
    P.dot(ink, -0.1, -0.25, 2, 2);
    P.dot(ink, -0.08, -0.23, 15, 2);
    P.dot(ink, 0.08, -0.25, 2, 2);
  } else {
    P.dot(ink, -0.13, -0.245, 25, 2);
    P.dot("#ffffff", -0.12, -0.235, 2, 3);
    P.dot("#ffffff", 0.1, -0.235, 2, 3);
  }
  if (fr) {
    // Happy closed eyes and pink cheeks.
    for (const ex of [-0.14, 0.14]) {
      const cx = P.X(ex);
      const cy = P.Y(-0.5);
      const r = Math.round(6 * P.k);
      for (let i = -r; i <= r; i += 1) {
        const dy = Math.round(-Math.sqrt(Math.max(0, r * r - i * i)) * 0.7);
        P.raw.rect(ink, cx + i, cy + dy, 1, Math.max(1, Math.round(3 * P.k)), true);
      }
    }
    P.dot("#ff6b9a", -0.28, -0.45, 9, 5);
    P.dot("#ff6b9a", 0.27 - 9 / 96, -0.45, 9, 5);
  } else {
    // Wide eyes that follow you, under angry brows.
    for (const ex of [-0.2, 0.2 - 14 / 96]) {
      P.dot("#ffffff", ex, -0.6, 14, 12);
      if (f.blink) P.dot(ink, ex, -0.56, 14, 3);
      else {
        P.dot("#1a0a10", ex + (5 + f.look * 3) / 96, -0.6 + 4 / 96, 6, 7);
        P.dot("#ffffff", ex + (5 + f.look * 3) / 96, -0.6 + 4 / 96, 2, 2);
      }
    }
    P.line(dark, -0.24, -0.67, -0.06, -0.62, true, 4);
    P.line(dark, 0.24, -0.67, 0.06, -0.62, true, 4);
  }
}

drawDragon = function (g, d, t) {
  const s = d.size;
  const fr = Boolean(d.friendly);
  const scale = s / 96;
  const flapIndex = Math.round((Math.sin(t * (fr ? 4 : 7)) + 1) * 2.5);
  const st = d.state || "move";
  const open = !fr && ["tell", "windup", "charge", "swing", "lunge"].includes(st);
  let look = 0;
  if (!fr) {
    const looking = state.mode === "title" ? player : nearestPlayer(d.x, d.y);
    const lx = (looking.x - d.x) / WIDTH;
    look = lx > 0.12 ? 1 : lx < -0.12 ? -1 : 0;
  }
  const blink = !fr && t % 3.7 < 0.1 ? 1 : 0;
  const f = { friendly: fr, flap: flapIndex / 2.5 - 1, look, open, blink };
  const key = `dragon|${fr ? 1 : 0}|${flapIndex}|${look}|${open ? 1 : 0}|${blink}`;
  const sheet = bigSheet(`dragon${fr ? 1 : 0}`, key, DRAGON_W, DRAGON_H, (a) => paintDragon(unitPainter(a, DRAGON_OX, DRAGON_OY, 48, 0.5), f));
  g.fillStyle = "rgba(0, 0, 0, 0.3)";
  g.beginPath();
  g.ellipse(d.x, d.y + s * 0.6, s * 0.5, 6 * scale, 0, 0, Math.PI * 2);
  g.fill();
  const left = snap(d.x - DRAGON_OX * PX);
  const top = snap(d.y - DRAGON_OY * PX);
  const w = DRAGON_W * PX;
  const h = DRAGON_H * PX;
  const smooth = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  g.drawImage(sheet.canvas, left, top, w, h);
  if (d.pixelFlash > 0) {
    const alpha = g.globalAlpha;
    g.globalAlpha = alpha * 0.7;
    g.drawImage(sheet.white, left, top, w, h);
    g.globalAlpha = alpha;
  }
  g.imageSmoothingEnabled = smooth;
  if (!fr && state.mode === "playing" && Math.random() < 0.08) burst(d.x + rand(-10, 10), d.y - s * 0.4, ["rgba(80,80,80,0.6)", "rgba(140,140,140,0.5)"], 1, 40, { lift: 40 });
};

// drawFoes puts a white box over the dragon when it is hit. Hand the flash
// to the sprite instead, so the dragon itself flashes.
const drawFoesOld = drawFoes;
drawFoes = function (room) {
  const d = room && room.boss && room.boss.isDragon ? room.boss : null;
  if (!d) return drawFoesOld(room);
  const flash = d.flash;
  d.pixelFlash = flash;
  d.flash = 0;
  try {
    drawFoesOld(room);
  } finally {
    d.flash = flash;
    d.pixelFlash = 0;
  }
};

/* ---------- swords ----------
   The sword some bosses swing, drawn with the same 2x pixels: a handle, a
   cross guard and a blade, as lines of blocks along the sword's angle. */

drawSword = function (boss, cx, cy) {
  if (state.clock < (boss.swordOutUntil || 0)) return;
  const big = boss.isBig;
  const s = boss.size;
  const u = big ? 4 : 3;
  const angle = boss.swordAngle || 0;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const ox = cx;
  const oy = cy + s * 0.05;
  const at = (d, side = 0) => [ox + dx * d - dy * side, oy + dy * d + dx * side];
  const line = (from, to, color, size) => pixelLine2(ctx, from[0], from[1], to[0], to[1], color, size);
  const start = s * 0.42;
  const len = big ? s * 0.95 : s * 1.05;
  const blade = big ? boss.shotColor : "#dfe7ef";
  const width = big ? 3 : 2;
  line(at(start - u * 3), at(start), "#1a1410", 3);
  line(at(start - u * 3), at(start), "#4a2d1a", 1);
  line(at(start + u, -u * 3), at(start + u, u * 3), "#1a1410", 3);
  line(at(start + u, -u * 3), at(start + u, u * 3), boss.type.accent || "#f6c85f", 1);
  line(at(start + u * 2), at(start + u * 2 + len), "#1a1410", width + 2);
  line(at(start + u * 2), at(start + u * 2 + len), blade, width);
  line(at(start + u * 2, -2), at(start + u * 2 + len - 4, -2), "#ffffff", 1);
};
