/* ---------- armor and campfire fast travel ----------
   Load after classes.js. Two things the players asked for:
   - Armor: bosses drop a helmet, chest or boots. Each piece has a rarity
     (Common to Legendary, like staffs), a flat armor value that comes off
     every hit through stats.armor, and one small perk for its slot. Walk
     over a piece to wear it if it beats what you have, or it turns into
     coins. The whole team shares one set, like it shares stats.
   - Fast travel: at a campfire with no enemies around, press T (P2: O) or
     click "Travel" to jump to any campfire you have already visited.
   Sprites are painted once per frame into cached canvases (house palette,
   navy outlines, 2x pixels). No ctx.filter, no shadowBlur. */
(() => {
  "use strict";

  /* ---------- armor table ---------- */
  // Rarity indexes match STAFF_RARITY (0 Common, 1 Rare, 2 Epic, 3 Legendary).
  // A Legendary set is 6 armor in total, so hits still hurt on Normal and Hard.
  const ARMOR = {
    helmet: {
      label: "Helmet",
      names: ["Iron Cap", "Sky Helm", "Moon Helm", "Sun Crown"],
      armor: [0.5, 1, 1.5, 2],
      perk: { stat: "maxStamina", add: [5, 10, 15, 20], text: (n) => `+${n} stamina` }
    },
    chest: {
      label: "Chest",
      names: ["Iron Vest", "Sky Mail", "Moon Plate", "Sun Armor"],
      armor: [1, 1.5, 2, 2.5],
      perk: { stat: "maxHp", add: [5, 10, 15, 20], text: (n) => `+${n} max HP` }
    },
    boots: {
      label: "Boots",
      names: ["Iron Boots", "Sky Boots", "Moon Boots", "Sun Boots"],
      armor: [0.5, 0.5, 1, 1.5],
      perk: { stat: "dashCooldown", mul: [0.95, 0.92, 0.88, 0.85], text: (n) => `dash back ${Math.round((1 - n) * 100)}% sooner` }
    }
  };
  const SLOTS = Object.keys(ARMOR);
  const SALVAGE = [10, 20, 35, 60];
  // Chance that a room boss drops armor, by difficulty (Easy, Normal, Hard).
  const ROOM_DROP_CHANCE = [0.5, 0.35, 0.3];
  // Lowest rarity each kind of boss can drop. Big bosses and the dragon always drop.
  const MIN_RARITY = { room: 0, big: 1, dragon: 3 };
  const PICKUP_RADIUS = 26;

  // The team's worn set: slot -> rarity index, or null for an empty slot.
  let worn = emptySet();

  function emptySet() {
    return { helmet: null, chest: null, boots: null };
  }

  function pieceName(slot, rarity) {
    return ARMOR[slot].names[rarity];
  }

  function perkAmount(slot, rarity) {
    const perk = ARMOR[slot].perk;
    return (perk.add || perk.mul)[rarity];
  }

  function perkText(slot, rarity) {
    return ARMOR[slot].perk.text(perkAmount(slot, rarity));
  }

  function armorText(n) {
    return `+${n} armor`;
  }

  // What the worn set adds to stats: flat sums, and one product for dash cooldown.
  function setBonus(set) {
    const bonus = { armor: 0, maxHp: 0, maxStamina: 0, dashCooldown: 1 };
    for (const slot of SLOTS) {
      const rarity = set[slot];
      if (rarity === null) continue;
      bonus.armor += ARMOR[slot].armor[rarity];
      const perk = ARMOR[slot].perk;
      if (perk.add) bonus[perk.stat] += perk.add[rarity];
      else bonus[perk.stat] *= perk.mul[rarity];
    }
    return bonus;
  }

  /* ---------- keeping stats in step with the worn set ----------
     stats is rebuilt from scratch on a new run and on load (baseStats plus
     the owned cards). The bonus already folded into the current stats object
     lives under a symbol key, which JSON.stringify skips, so the save stays
     clean. A fresh stats object has no record, so the set is added exactly
     once; the same object only gets the difference. */
  const APPLIED = Symbol("gearApplied");
  const NO_BONUS = setBonus(emptySet());

  function syncStats() {
    const want = setBonus(worn);
    const sameObject = Boolean(stats[APPLIED]);
    const had = stats[APPLIED] || NO_BONUS;
    if (had.armor === want.armor && had.maxHp === want.maxHp && had.maxStamina === want.maxStamina && had.dashCooldown === want.dashCooldown) {
      stats[APPLIED] = want;
      return;
    }
    stats.armor += want.armor - had.armor;
    stats.maxHp += want.maxHp - had.maxHp;
    stats.maxStamina += want.maxStamina - had.maxStamina;
    stats.dashCooldown *= want.dashCooldown / had.dashCooldown;
    stats[APPLIED] = want;
    for (const p of players) {
      // A new chest piece fills the extra health it gives right away.
      if (sameObject && p.hp > 0 && want.maxHp > had.maxHp) p.hp += want.maxHp - had.maxHp;
      if (sameObject && want.maxStamina > had.maxStamina) p.stamina += want.maxStamina - had.maxStamina;
      p.hp = Math.min(p.hp, stats.maxHp);
      p.stamina = Math.min(p.stamina, stats.maxStamina);
    }
  }

  /* ---------- drops ---------- */
  function rollRarity(world, minRarity) {
    const odds = STAFF_ODDS[clamp(world, 0, STAFF_ODDS.length - 1)].map((w, i) => (i < minRarity ? 0 : w));
    if (odds.every((w) => w === 0)) odds[STAFF_RARITY.length - 1] = 1;
    let roll = Math.random() * odds.reduce((a, b) => a + b, 0);
    let rarity = 0;
    while (rarity < odds.length - 1 && roll >= odds[rarity]) {
      roll -= odds[rarity];
      rarity += 1;
    }
    return rarity;
  }

  // Prefer a slot the piece would upgrade, so a lucky drop is rarely wasted.
  function rollSlot(rarity) {
    const better = SLOTS.filter((slot) => worn[slot] === null || worn[slot] < rarity);
    return pick(better.length ? better : SLOTS);
  }

  // Same ground rules as props.js uses for its chest: no water, lava, chasm or
  // quicksand, and not under a tree, rock, crate, the campfire or Lulu's stall.
  const BAD_GROUND = new Set(["water", "lava", "chasm", "quicksand"]);
  const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  function spotFree(room, x, y) {
    if (x < TILE + 30 || x > WIDTH - TILE - 30 || y < TILE + 40 || y > HEIGHT - TILE - 30) return false;
    const at = window.blockDungeon && window.blockDungeon.terrainAt;
    if (at && [[0, 14], [-12, 14], [12, 14], [0, 0]].some(([dx, dy]) => BAD_GROUND.has(at(x + dx, y + dy)))) return false;
    const box = { x: x - 18, y: y - 26, w: 36, h: 46 };
    for (const s of room.propSprites || []) if (overlaps(box, s)) return false;
    for (const c of room.crates) if (c.hp > 0 && !c.hidden && overlaps(box, { x: c.x - 4, y: c.y - 4, w: c.w + 8, h: c.h + 8 })) return false;
    if (hasCampfire(room) && Math.hypot(x - campfireSpot(room).x, y - campfireSpot(room).y) < 70) return false;
    if (hasShop(room) && Math.hypot(x - shopSpot(room).x, y - shopSpot(room).y - 20) < 80) return false;
    if (room.lootChest && Math.hypot(x - room.lootChest.x, y - room.lootChest.y) < 56) return false;
    for (const d of room.staffDrops || []) if (Math.hypot(x - d.x, y - d.y) < 50) return false;
    for (const d of room.armorDrops || []) if (Math.hypot(x - d.x, y - d.y) < 50) return false;
    return true;
  }

  // The nearest free spot on a widening ring around (x, y).
  function clearSpot(room, x, y) {
    for (let d = 0; d < 360; d += 12) {
      const steps = d === 0 ? 1 : Math.max(8, Math.round(d / 6));
      for (let i = 0; i < steps; i += 1) {
        const a = (i / steps) * Math.PI * 2;
        const px = Math.round(x + Math.cos(a) * d);
        const py = Math.round(y + Math.sin(a) * d * 0.8);
        if (spotFree(room, px, py)) return { x: px, y: py };
      }
    }
    return { x: clamp(x, TILE + 30, WIDTH - TILE - 30), y: clamp(y, TILE + 40, HEIGHT - TILE - 30) };
  }

  function dropArmor(room, x, y, slot, rarity) {
    const spot = clearSpot(room, x, y);
    if (!room.armorDrops) room.armorDrops = [];
    const drop = { slot, rarity, x: spot.x, y: spot.y, t: 0 };
    room.armorDrops.push(drop);
    const color = STAFF_RARITY[rarity].color;
    floatText(drop.x, drop.y - 44, `${STAFF_RARITY[rarity].name} armor!`, color, 18);
    burst(drop.x, drop.y, [color, "#ffffff"], 16, 180, { lift: 40 });
    return drop;
  }

  function bossDrop(boss, kind) {
    const room = currentRoom();
    if (!room) return null;
    if (kind === "room" && Math.random() >= ROOM_DROP_CHANCE[clamp(state.difficulty, 0, 2)]) return null;
    const world = kind === "big" ? boss.row : roomRow(room);
    const rarity = rollRarity(world, MIN_RARITY[kind]);
    // Off to the side of the boss, clear of its staff and treasure chest.
    return dropArmor(room, boss.x + 56, boss.y - 10, rollSlot(rarity), rarity);
  }

  function takeArmor(p, drop) {
    drop.taken = true;
    const { slot, rarity } = drop;
    const info = STAFF_RARITY[rarity];
    const name = pieceName(slot, rarity);
    const who = state.twoPlayer ? `P${p.index + 1} found it: ` : "";
    const current = worn[slot];
    if (current === null || rarity > current) {
      worn[slot] = rarity;
      syncStats();
      banner(`${info.name} ${ARMOR[slot].label}!`, `${who}${name}: ${armorText(ARMOR[slot].armor[rarity])}, ${perkText(slot, rarity)}`, info.color, 3);
      burst(p.x, p.y, [info.color, "#ffffff"], 20, 200);
      sfx.fanfare();
    } else {
      const coins = SALVAGE[rarity];
      state.coins += coins;
      toast(`Your ${pieceName(slot, current)} is better, so the ${name} turned into ${coins} coins.`, 3.2);
      floatText(drop.x, drop.y - 30, `+${coins} coins`, "#f6c85f", 18);
      burst(drop.x, drop.y, ["#f6c85f", "#fff3b0"], 16, 180);
      sfx.coin(6);
    }
    state.upgradesVersion += 1;
    saveGame();
  }

  function updateArmorDrops(dt) {
    const room = currentRoom();
    if (!room || !room.armorDrops || !room.armorDrops.length) return;
    for (const drop of room.armorDrops) {
      drop.t += dt;
      if (drop.t < 0.6) continue;
      const p = livingPlayers().find((who) => Math.hypot(who.x - drop.x, who.y - drop.y) < PICKUP_RADIUS);
      if (p) takeArmor(p, drop);
    }
    room.armorDrops = room.armorDrops.filter((drop) => !drop.taken);
  }

  /* ---------- armor sprites (16 x 16, drawn at 2x) ----------
     Masks mark the shape; shading comes from where a pixel sits in its row
     (lit from the left) plus a lit top lip and a dark bottom edge.
     # metal, t trim, g gem, * shine, o dark inside. */
  const MASKS = {
    helmet: [
      "................",
      ".......tt.......",
      "......t**t......",
      ".....######.....",
      "....########....",
      "...##########...",
      "...##########...",
      "...##########...",
      "...ttttggtttt...",
      "...##oo##oo##...",
      "...##########...",
      "...##oooooo##...",
      "...##oooooo##...",
      "...###....###...",
      "................",
      "................"
    ],
    chest: [
      "................",
      "................",
      "..####....####..",
      ".######oo######.",
      ".##############.",
      "..############..",
      "...####gg####...",
      "...##########...",
      "...##########...",
      "...tttttttttt...",
      "...####tt####...",
      "....########....",
      "....##....##....",
      "................",
      "................",
      "................"
    ],
    boots: [
      "................",
      "................",
      "................",
      ".tgtt....tgtt...",
      ".####....####...",
      ".####....####...",
      ".####....####...",
      ".####....####...",
      ".#####...#####..",
      ".######..######.",
      ".######..######.",
      ".oooooo..oooooo.",
      "................",
      "................",
      "................",
      "................"
    ]
  };

  // House palette ramps per rarity: metal dark to light, then shine, trim, gem.
  const LOOKS = [
    { metal: ["#3a3854", "#59597a", "#8189a3", "#b3bccb"], shine: "#e1e7ea", trim: "#82513a", gem: "#b07e4e" },
    { metal: ["#1f3c73", "#2862a8", "#3a8fd0", "#78c9ea"], shine: "#e6f5f0", trim: "#b3bccb", gem: "#8cf2ff" },
    { metal: ["#4b2c7a", "#7442b0", "#a46ee0", "#d4b0ff"], shine: "#f4f4f8", trim: "#f5c542", gem: "#f08fc0" },
    { metal: ["#a35a26", "#e08a2e", "#f5c542", "#fff0a3"], shine: "#f4f4f8", trim: "#f4f4f8", gem: "#d6455d" }
  ];
  const EMPTY_LOOK = { metal: ["#221f36", "#2a2740", "#2a2740", "#3a3854"], shine: "#3a3854", trim: "#3a3854", gem: "#3a3854", dark: "#221f36", outline: "#221f36" };
  const OUTLINE = "#1d1a2f";
  const SPARKLE = [[], [[13, 2]], [[13, 1], [12, 2], [13, 2], [14, 2], [13, 3]], [[13, 2]]];
  const PX = 2;

  function paintPiece(slot, look, frame) {
    const mask = MASKS[slot];
    const size = 16;
    const colors = new Array(size * size).fill(null);
    const body = (x, y) => x >= 0 && y >= 0 && x < size && y < size && mask[y][x] === "#";
    for (let y = 0; y < size; y += 1) {
      let runStart = -1;
      for (let x = 0; x <= size; x += 1) {
        const inRun = x < size && body(x, y);
        if (inRun && runStart < 0) runStart = x;
        if (!inRun && runStart >= 0) {
          const width = x - runStart;
          for (let i = runStart; i < x; i += 1) {
            const u = width > 1 ? (i - runStart) / (width - 1) : 0.3;
            let shade = u < 0.25 ? 3 : u < 0.6 ? 2 : u < 0.85 ? 1 : 0;
            if (!body(i, y - 1)) shade = Math.min(3, shade + 1);
            if (!body(i, y + 1)) shade = Math.max(0, shade - 1);
            colors[y * size + i] = look.metal[shade];
          }
          runStart = -1;
        }
      }
      for (let x = 0; x < size; x += 1) {
        const c = mask[y][x];
        if (c === "t") colors[y * size + x] = look.trim;
        else if (c === "g") colors[y * size + x] = look.gem;
        else if (c === "*") colors[y * size + x] = look.shine;
        else if (c === "o") colors[y * size + x] = look.dark || OUTLINE;
      }
    }
    const filled = colors.slice();
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (filled[y * size + x]) continue;
        const near = (x > 0 && filled[y * size + x - 1]) || (x < size - 1 && filled[y * size + x + 1]) || (y > 0 && filled[(y - 1) * size + x]) || (y < size - 1 && filled[(y + 1) * size + x]);
        if (near) colors[y * size + x] = look.outline || OUTLINE;
      }
    }
    for (const [x, y] of SPARKLE[frame] || []) colors[y * size + x] = "#ffffff";
    const canvasOut = document.createElement("canvas");
    canvasOut.width = size * PX;
    canvasOut.height = size * PX;
    const g = canvasOut.getContext("2d");
    for (let i = 0; i < colors.length; i += 1) {
      if (!colors[i]) continue;
      g.fillStyle = colors[i];
      g.fillRect((i % size) * PX, Math.floor(i / size) * PX, PX, PX);
    }
    return canvasOut;
  }

  const spriteCache = new Map();
  function pieceSprite(slot, rarity, frame = 0) {
    const key = `${slot}|${rarity === null ? "e" : rarity}|${frame}`;
    let sprite = spriteCache.get(key);
    if (!sprite) {
      sprite = paintPiece(slot, rarity === null ? EMPTY_LOOK : LOOKS[rarity], rarity === null ? 0 : frame);
      spriteCache.set(key, sprite);
    }
    return sprite;
  }

  function drawPieceIcon(slot, rarity, cx, cy, frame = 0) {
    ctx.drawImage(pieceSprite(slot, rarity, frame), Math.round(cx - 8 * PX), Math.round(cy - 8 * PX));
  }

  function drawArmorDrops(room) {
    if (!room || !room.armorDrops) return;
    for (const drop of room.armorDrops) {
      const color = STAFF_RARITY[drop.rarity].color;
      const fall = drop.t < 0.4 ? (0.4 - drop.t) * 120 : 0;
      const frame = Math.floor(state.anim * 6 + drop.x) % 4;
      const bob = [0, -2, -4, -2][Math.floor(state.anim * 5 + drop.y) % 4];
      // Floor shadow and a pulsing rarity ring (plain strokes, no blur).
      ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
      ctx.beginPath();
      ctx.ellipse(drop.x, drop.y + 16, 14, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      const pulse = Math.sin(state.anim * 4 + drop.x) * 0.5 + 0.5;
      ctx.globalAlpha = 0.35 + pulse * 0.4;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(drop.x, drop.y + 16, 20 + pulse * 4, 7 + pulse * 1.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(drop.x, drop.y + 16, 27 + pulse * 4, 10 + pulse * 1.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      drawPieceIcon(drop.slot, drop.rarity, drop.x, drop.y - 4 + bob - fall, frame);
      if (drop.rarity >= 2 && Math.random() < 0.12) burst(drop.x + rand(-14, 14), drop.y + rand(-18, 8), [color, "#ffffff"], 1, 30, { lift: 30 });
      outlinedText(pieceName(drop.slot, drop.rarity), clamp(drop.x, 90, WIDTH - 90), drop.y - 30 + bob - fall, { size: 13, align: "center", color, font: DISPLAY_FONT });
    }
  }

  /* ---------- showing the worn set ---------- */
  const ICON_SLOT = 36;

  function totalArmor() {
    return setBonus(worn).armor;
  }

  function drawWornIcons(x, y) {
    SLOTS.forEach((slot, i) => {
      const sx = x + i * (ICON_SLOT + 4);
      const rarity = worn[slot];
      ctx.fillStyle = "rgba(16, 13, 11, 0.8)";
      ctx.fillRect(sx, y, ICON_SLOT, ICON_SLOT);
      drawPieceIcon(slot, rarity, sx + ICON_SLOT / 2, y + ICON_SLOT / 2);
      ctx.strokeStyle = rarity === null ? "#3a2e25" : STAFF_RARITY[rarity].color;
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 1, y + 1, ICON_SLOT - 2, ICON_SLOT - 2);
    });
  }

  function wornIconsWidth() {
    return SLOTS.length * ICON_SLOT + (SLOTS.length - 1) * 4;
  }

  // Next to the flask in one-player mode, between the two hotbars in co-op.
  function drawArmorHud() {
    const width = wornIconsWidth();
    let x;
    let y;
    if (state.twoPlayer) {
      x = Math.round(WIDTH / 2 - width / 2);
      y = HEIGHT - 44 - 18 + 4;
    } else {
      const hotbar = 8 * 54 + 7 * 8;
      x = Math.round(WIDTH / 2 + hotbar / 2 + 12);
      y = HEIGHT - 54 - 18 + 9;
    }
    drawWornIcons(x, y);
    const total = totalArmor();
    if (total > 0) outlinedText(`Armor ${total}`, x + width / 2, y - 5, { size: 12, align: "center", color: "#e6d6bd", font: DISPLAY_FONT });
  }

  function drawArmorPanel(top) {
    const x = 14;
    const w = 206;
    const h = 82 + SLOTS.length * 56;
    drawPanel(x, top, w, h);
    outlinedText("Armor", x + w / 2, top + 34, { size: 22, align: "center", font: DISPLAY_FONT, color: "#f6c85f" });
    SLOTS.forEach((slot, i) => {
      const y = top + 50 + i * 56;
      const rarity = worn[slot];
      ctx.fillStyle = "rgba(16, 13, 11, 0.8)";
      ctx.fillRect(x + 14, y, ICON_SLOT, ICON_SLOT);
      drawPieceIcon(slot, rarity, x + 14 + ICON_SLOT / 2, y + ICON_SLOT / 2);
      ctx.strokeStyle = rarity === null ? "#3a2e25" : STAFF_RARITY[rarity].color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 15, y + 1, ICON_SLOT - 2, ICON_SLOT - 2);
      if (rarity === null) {
        outlinedText(`No ${ARMOR[slot].label.toLowerCase()}`, x + 60, y + 16, { size: 14, font: DISPLAY_FONT, color: "#8a7a68" });
        outlinedText("Bosses drop armor", x + 60, y + 33, { size: 11, weight: 600, color: "#8a7a68" });
      } else {
        outlinedText(pieceName(slot, rarity), x + 60, y + 14, { size: 14, font: DISPLAY_FONT, color: STAFF_RARITY[rarity].color });
        outlinedText(armorText(ARMOR[slot].armor[rarity]), x + 60, y + 29, { size: 11, weight: 600, color: "#e6d6bd" });
        outlinedText(perkText(slot, rarity), x + 60, y + 43, { size: 11, weight: 600, color: "#c5a988" });
      }
    });
    const total = totalArmor();
    outlinedText(total > 0 ? `Every hit does ${total} less` : "Beat bosses to find armor", x + w / 2, top + h - 12, { size: 12, align: "center", weight: 600, color: "#c5a988" });
  }

  /* ---------- campfire fast travel ----------
     The menu is its own game mode ("travel"): update() only runs in
     "playing", so the world waits while it is open. */
  const menu = { options: [], index: 0, mouseX: -1, mouseY: -1 };

  function campLabel(room) {
    const row = roomRow(room);
    return { title: `World ${row + 1}: ${worlds[row].name}`, sub: room.index % ROOM_COLS === 0 ? "Start of the world" : "Before the big boss", color: worlds[row].color };
  }

  function foesAround(room) {
    return livingFoes(room).some((enemy) => !enemy.friendly);
  }

  function travelOptions() {
    return rooms.filter((room) => room.visited && hasCampfire(room)).map((room) => {
      const here = room.index === state.roomIndex;
      const awake = room.populated && foesAround(room);
      return { index: room.index, ...campLabel(room), ok: !here && !awake, tag: here ? "You are here" : awake ? "Boss awake" : state.checkpoint === room.index ? "Resting spot" : "" };
    });
  }

  // The team can travel from a campfire room with no enemies, standing near the fire.
  function travelReady() {
    if (state.mode !== "playing" || state.treeMode || state.won) return false;
    const room = currentRoom();
    if (!hasCampfire(room) || foesAround(room)) return false;
    const fire = campfireSpot(room);
    return livingPlayers().some((p) => Math.hypot(p.x - fire.x, p.y - fire.y) < 96);
  }

  function openTravel() {
    if (!travelReady()) return false;
    menu.options = travelOptions();
    if (!menu.options.some((option) => option.ok)) {
      toast("Visit another campfire first, then you can travel between them.", 3);
      sfx.nope();
      return false;
    }
    menu.index = menu.options.findIndex((option) => option.ok);
    menu.mouseX = mouse.x;
    menu.mouseY = mouse.y;
    state.mode = "travel";
    mouse.down = false;
    touch.fire = false;
    tone(520, 0.12, { type: "triangle", volume: 0.05 });
    return true;
  }

  function closeTravel() {
    if (state.mode !== "travel") return;
    state.mode = "playing";
    mouse.down = false;
  }

  function moveSelection(step) {
    const n = menu.options.length;
    for (let k = 1; k <= n; k += 1) {
      const i = (menu.index + step * k + n * k) % n;
      if (menu.options[i].ok) {
        menu.index = i;
        sfx.click();
        return;
      }
    }
  }

  function travelTo(index) {
    const room = rooms[index];
    if (!room || !hasCampfire(room) || !room.visited || index === state.roomIndex || foesAround(room)) return false;
    state.mode = "playing";
    state.checkpoint = index;
    const fire = campfireSpot(room);
    const spot = { x: fire.x + (fire.x < WIDTH / 2 ? 70 : -70), y: fire.y + 50 };
    placePlayers(spot.x, spot.y);
    for (const p of activePlayers()) {
      p.restedHere = false;
      p.invulnerable = Math.max(p.invulnerable, 1);
    }
    enterRoom(index, spot, true);
    state.fade = 1;
    sfx.portal();
    const label = campLabel(room);
    toast(`Traveled to the campfire in ${label.title.replace(":", ",")}. You'll wake up here now.`, 3.2);
    return true;
  }

  function confirmTravel() {
    const option = menu.options[menu.index];
    if (option && option.ok) travelTo(option.index);
    else sfx.nope();
  }

  function promptButton() {
    const fire = campfireSpot(currentRoom());
    return { x: Math.round(fire.x - 58), y: Math.round(fire.y + 44), w: 116, h: 28 };
  }

  function drawTravelPrompt() {
    if (!travelReady() || state.fade > 0.3) return;
    const b = promptButton();
    drawButton(state.twoPlayer ? "Travel (T/O)" : "Travel (T)", b.x, b.y, b.w, b.h, openTravel, { size: 14 });
  }

  function drawCampIcon(x, y) {
    ctx.fillStyle = "#55332f";
    ctx.fillRect(x - 10, y + 6, 20, 4);
    ctx.fillStyle = "#82513a";
    ctx.fillRect(x - 8, y + 4, 16, 3);
    ctx.fillStyle = "#e08a2e";
    ctx.fillRect(x - 6, y - 8, 12, 12);
    ctx.fillStyle = "#f5c542";
    ctx.fillRect(x - 4, y - 4, 8, 8);
    ctx.fillStyle = "#fff0a3";
    ctx.fillRect(x - 2, y, 4, 4);
  }

  function drawTravelMenu() {
    dim(0.65);
    const rowH = 40;
    const w = 520;
    const x0 = Math.round(WIDTH / 2 - w / 2);
    const h = 150 + menu.options.length * (rowH + 6);
    const top = Math.round((HEIGHT - h) / 2);
    drawPanel(x0, top, w, h);
    outlinedText("Fast Travel", WIDTH / 2, top + 44, { size: 32, align: "center", font: DISPLAY_FONT, color: "#ffd166" });
    outlinedText("Pick a campfire you have visited", WIDTH / 2, top + 66, { size: 14, align: "center", color: "#c5a988" });

    const moved = mouse.x !== menu.mouseX || mouse.y !== menu.mouseY;
    menu.mouseX = mouse.x;
    menu.mouseY = mouse.y;
    menu.options.forEach((option, i) => {
      const y = top + 82 + i * (rowH + 6);
      const rx = x0 + 20;
      const rw = w - 40;
      if (moved && option.ok && isHover(rx, y, rw, rowH)) menu.index = i;
      const selected = i === menu.index;
      ctx.fillStyle = selected ? "rgba(74, 56, 41, 0.95)" : "rgba(36, 28, 23, 0.95)";
      ctx.fillRect(rx, y, rw, rowH);
      ctx.strokeStyle = selected ? "#f6c85f" : option.ok ? "#5b412d" : "#3a2e25";
      ctx.lineWidth = selected ? 3 : 2;
      ctx.strokeRect(rx + 1, y + 1, rw - 2, rowH - 2);
      drawCampIcon(rx + 22, y + rowH / 2 - 1);
      outlinedText(option.title, rx + 44, y + 18, { size: 16, font: DISPLAY_FONT, color: option.ok ? option.color : "#8a7a68" });
      outlinedText(option.sub, rx + 44, y + 33, { size: 12, weight: 600, color: option.ok ? "#e6d6bd" : "#8a7a68" });
      if (option.tag) outlinedText(option.tag, rx + rw - 14, y + 26, { size: 13, align: "right", color: option.tag === "Boss awake" ? "#ff8b7d" : option.tag === "Resting spot" ? "#f6c85f" : "#c5a988" });
      if (option.ok) hitRegions.push({ x: rx, y, w: rw, h: rowH, action: () => travelTo(option.index) });
    });

    const by = top + h - 58;
    drawButton("Travel", WIDTH / 2 - 190, by, 180, 42, confirmTravel, { primary: true, size: 18 });
    drawButton("Close (Esc)", WIDTH / 2 + 10, by, 180, 42, closeTravel, { size: 18 });
    outlinedText(touch.enabled ? "Tap a campfire to go there" : "Up / Down to pick  ·  Enter to go  ·  Esc to close", WIDTH / 2, top + h + 22, { size: 13, align: "center", color: "#c5a988" });
  }

  const UP = new Set(["ArrowUp", "KeyW", "KeyI"]);
  const DOWN = new Set(["ArrowDown", "KeyS", "KeyK"]);
  const GO = new Set(["Enter", "NumpadEnter", "Space", "KeyE"]);
  const CLOSE = new Set(["Escape", "KeyT", "KeyO", "KeyQ"]);

  window.addEventListener("keydown", (event) => {
    const code = event.code || "";
    if (state.mode === "playing") {
      if (!event.repeat && (code === "KeyT" || code === "KeyO")) openTravel();
      return;
    }
    if (state.mode !== "travel") return;
    if (UP.has(code)) moveSelection(-1);
    else if (DOWN.has(code)) moveSelection(1);
    else if (event.repeat) return;
    else if (GO.has(code)) confirmTravel();
    else if (CLOSE.has(code)) closeTravel();
  });

  /* ---------- save data ---------- */
  function serialize() {
    return {
      worn: { ...worn },
      drops: rooms.flatMap((room) => (room.armorDrops || []).filter((drop) => !drop.taken).map((drop) => ({ room: room.index, slot: drop.slot, rarity: drop.rarity, x: Math.round(drop.x), y: Math.round(drop.y) })))
    };
  }

  const validRarity = (r) => Number.isInteger(r) && r >= 0 && r < STAFF_RARITY.length;

  function restore(saved) {
    worn = emptySet();
    if (!saved || typeof saved !== "object") return;
    for (const slot of SLOTS) {
      const r = saved.worn && saved.worn[slot];
      if (validRarity(r)) worn[slot] = r;
    }
    for (const drop of Array.isArray(saved.drops) ? saved.drops : []) {
      const room = rooms[drop.room];
      if (!room || !ARMOR[drop.slot] || !validRarity(drop.rarity)) continue;
      if (!room.armorDrops) room.armorDrops = [];
      room.armorDrops.push({ slot: drop.slot, rarity: drop.rarity, x: Number(drop.x) || WIDTH / 2, y: Number(drop.y) || HEIGHT / 2, t: 1 });
    }
  }

  /* ---------- hooking into the game ---------- */
  const before = {};
  for (const name of ["resetWorld", "saveGame", "loadGame", "onBossDefeated", "onBigBossDefeated", "befriendDragon", "updatePickups", "drawStaffDrops", "drawHud", "drawPauseScreen", "draw"]) {
    before[name] = window[name];
  }

  window.resetWorld = function resetWorldWithGear() {
    worn = emptySet();
    before.resetWorld();
    syncStats();
  };

  window.saveGame = function saveGameWithGear() {
    before.saveGame();
    if (state.won || state.treeMode) return;
    const data = readStorage(SAVE_KEY);
    if (!data) return;
    data.gear = serialize();
    writeStorage(SAVE_KEY, data);
  };

  // The base load rebuilds stats and clamps HP to the bare max, and its own
  // enterRoom saves before the armor is back. Read the save first, then put
  // the armor and the saved HP back and save again.
  window.loadGame = function loadGameWithGear() {
    const data = readStorage(SAVE_KEY);
    const ok = before.loadGame();
    if (!ok) return ok;
    restore(data && data.gear);
    syncStats();
    const hp = [data.hp, data.hp2];
    players.forEach((p, i) => {
      p.hp = clamp(Number(hp[i]) || stats.maxHp, 1, stats.maxHp);
      p.stamina = stats.maxStamina;
    });
    saveGame();
    return ok;
  };

  window.onBossDefeated = function onBossDefeatedWithArmor(boss) {
    const result = before.onBossDefeated(boss);
    if (!boss.isBig) bossDrop(boss, "room");
    return result;
  };

  window.onBigBossDefeated = function onBigBossDefeatedWithArmor(boss) {
    const result = before.onBigBossDefeated(boss);
    bossDrop(boss, "big");
    return result;
  };

  window.befriendDragon = function befriendDragonWithArmor(dragon) {
    const result = before.befriendDragon(dragon);
    bossDrop(dragon, "dragon");
    return result;
  };

  window.updatePickups = function updatePickupsWithArmor(dt) {
    before.updatePickups(dt);
    syncStats();
    updateArmorDrops(dt);
  };

  window.drawStaffDrops = function drawStaffDropsWithArmor(room) {
    before.drawStaffDrops(room);
    drawArmorDrops(room);
  };

  window.drawHud = function drawHudWithArmor(room) {
    before.drawHud(room);
    drawArmorHud();
  };

  window.drawPauseScreen = function drawPauseWithArmor() {
    before.drawPauseScreen();
    const height = 348 + activePlayers().length * 64;
    drawArmorPanel(Math.round((HEIGHT - height) / 2));
  };

  window.draw = function drawWithGear() {
    before.draw();
    if (state.mode === "playing") drawTravelPrompt();
    else if (state.mode === "travel") drawTravelMenu();
    else return;
    const hovering = hitRegions.some((r) => isHover(r.x, r.y, r.w, r.h));
    canvas.style.cursor = hovering ? "pointer" : state.mode === "playing" ? "crosshair" : "default";
  };

  if (window.blockDungeon) {
    if (window.blockDungeon.loadGame) window.blockDungeon.loadGame = window.loadGame;
    if (window.blockDungeon.saveGame) window.blockDungeon.saveGame = window.saveGame;
  }

  window.blockDungeonGear = {
    ARMOR,
    SLOTS,
    SALVAGE,
    ROOM_DROP_CHANCE,
    MIN_RARITY,
    get worn() { return { ...worn }; },
    get menu() { return menu; },
    totalArmor,
    setBonus,
    spawnDrop(slot, rarity, x = player.x + 80, y = player.y) {
      return dropArmor(currentRoom(), x, y, slot, rarity);
    },
    bossDrop,
    wear(slot, rarity) {
      worn[slot] = rarity;
      syncStats();
    },
    travelReady,
    travelOptions,
    openTravel,
    closeTravel,
    travelTo,
    promptButton
  };
})();
