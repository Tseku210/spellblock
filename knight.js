/* ---------- Sir Grimhelm, the Dread Knight ----------
   The final boss, in the Black Keep behind the golden portal. Design:
   final-knight-design.md. Load after knight-art.js (his sprite sheet) and
   after bosses.js, hazards.js, gear.js and stone-golem.js, because it wraps
   functions those files already wrapped.

   He is a sword boss (combo, thrust, leap slash, spin, slash come from the
   old sword code) with his own brain kit on top:
   - Lightning Lunge: a red line shows the path, then he crosses the room.
     Once in phase 1, twice in phase 2, three times in phase 3.
   - Skyfall: jumps off screen, a red ring hunts you, then he crashes down.
   - Riposte: sword up; spells that hit him from the front bounce back.
   - Crescent Cleave and Ground Rend join in phase 2.
   - Thousand Cuts (last stand): five red lines, he zips along each, then a
     giant X on you, then he kneels out of breath for a few seconds.
   - Iron Will: stuns on him are short.
   At 66% he tears off his cape and gets faster; below 33% his armor cracks
   and glows. Big moves end with a short out-of-breath window. */

const KNIGHT_KIT = {
  name: "Sir Grimhelm",
  sword: true,
  mood: { pace: 0.6, rest: 0.35, cunning: 0.8, chain: 0.85 },
  moves: ["kLunge", "kSkyfall", "kRiposte", "kCleave", "kRend"],
  unlock: [1, 1, 1, 2, 2],
  ult: "kThousand",
  passive: "ironwill",
  lines: ["No more holding back!", "ENOUGH!"]
};

const KNIGHT_LINES = ["None pass.", "Too slow.", "Again!", "You fight well... for a child."];

function makeKnight() {
  const hp = bossMaxHp({ final: true });
  return {
    typeIndex: -1,
    type: { color: "#3a3854", accent: "#d6455d", name: "Knight", boss: "Sir Grimhelm" },
    name: "Sir Grimhelm the Dread Knight",
    x: WIDTH / 2,
    y: 210,
    homeX: WIDTH / 2,
    homeY: 210,
    size: 46,
    hp,
    maxHp: hp,
    speed: 110 * (difficulty().speed || 1),
    damage: Math.round(26 * difficulty().damage * (difficulty().bossHit || 1)),
    behavior: "knight",
    isBoss: true,
    isKnight: true,
    melee: true,
    small: false,
    temp: false,
    hitCooldown: 0,
    attackTimer: 2.2,
    slowUntil: 0,
    flash: 0,
    state: "move",
    stateTimer: 0,
    lockX: 0,
    lockY: 1,
    wobble: 0,
    strafe: 1,
    alpha: 1,
    patterns: ["combo", "thrust", "leapslash", "spin", "combo", "slash"],
    patternIndex: 0,
    spiralTime: 0,
    spiralTick: 0,
    spiralAngle: 0,
    // He has no guards or totems: his phases are the cape and the cracks.
    enraged: true,
    totemDone: true,
    furious: false,
    dodgeTimer: 2,
    swordAngle: Math.PI / 2,
    swingSide: 1,
    shotColor: "#d6455d",
    row: 4,
    kFace: 1,
    kSpeed: 0,
    trail: []
  };
}

function knightLook(boss) {
  const phase = boss.brain ? boss.brain.phase : 1;
  if (phase >= 3 || boss.desperate) return "blaze";
  return boss.capeOff ? "bare" : "cape";
}

/* ---------- hooks: brain, phases, death ---------- */

const kitForBeforeKnight = kitFor;
kitFor = function (boss) {
  if (boss && boss.isKnight) return boss.fallen ? null : KNIGHT_KIT;
  return kitForBeforeKnight(boss);
};

const brainOfBeforeKnight = brainOf;
brainOf = function (boss, room) {
  const fresh = !boss.brain;
  const brain = brainOfBeforeKnight(boss, room);
  // The Black Keep is tier 30, which would make him an "elder" with every move
  // from the start. He learns his moves phase by phase instead.
  if (fresh && boss.isKnight) brain.elder = false;
  return brain;
};

const isFinalBeforeKnight = isFinal;
isFinal = function (boss) {
  return isFinalBeforeKnight(boss) || Boolean(boss && boss.isKnight);
};

const stunEnemyBeforeKnight = stunEnemy;
stunEnemy = function (enemy, seconds) {
  if (enemy && enemy.isKnight) seconds = Math.min(seconds, easyMode() ? 0.7 : 0.45);
  return stunEnemyBeforeKnight(enemy, seconds);
};

// Last stand without helpers or falling rocks: Thousand Cuts is his last stand.
const startLastStandBeforeKnight = startLastStand;
startLastStand = function (boss, room) {
  if (!boss.isKnight) return startLastStandBeforeKnight(boss, room);
  boss.desperate = true;
  boss.speed *= 1.1;
  boss.rainTimer = 1e9;
  state.slowmo = 0.6;
  addShake(12);
  sfx.roar();
  addRing(boss.x, boss.y, 240, BX.r2, 0.7, 14);
  banners.length = 0;
  banner("LAST STAND!", "Sir Grimhelm is giving it everything!", "#ff5a3d", 3);
};

const meleeHitBeforeKnight = meleeHit;
meleeHit = function (boss, swing) {
  if (boss.isKnight) {
    boss.kSlashAt = state.clock;
    boss.kSlashKind = swing.kind;
  }
  return meleeHitBeforeKnight(boss, swing);
};

const meleeLandingBeforeKnight = meleeLanding;
meleeLanding = function (boss) {
  if (boss.isKnight) boss.kLandAt = state.clock;
  return meleeLandingBeforeKnight(boss);
};

const updateBossBeforeKnight = updateBoss;
updateBoss = function (boss, dt, ux, uy, dist, slow, room) {
  if (!boss.isKnight) return updateBossBeforeKnight(boss, dt, ux, uy, dist, slow, room);
  if (boss.fallen) return;
  const fromX = boss.x;
  const fromY = boss.y;
  // A sidestep doesn't slow him down: his next attack keeps winding up.
  if (boss.state === "dodge") boss.attackTimer -= dt;
  updateBossBeforeKnight(boss, dt, ux, uy, dist, slow, room);
  afterKnightUpdate(boss, dt, fromX, fromY, room);
};

function afterKnightUpdate(boss, dt, fromX, fromY, room) {
  const moved = dt > 0 ? Math.hypot(boss.x - fromX, boss.y - fromY) / dt : 0;
  boss.kSpeed += (moved - boss.kSpeed) * Math.min(1, dt * 12);
  // Fast moves leave afterimages.
  if (moved > 380 && !boss.sigHidden) boss.trail.push({ x: boss.x, y: boss.y, t: state.clock, frame: knightFrameName(boss), flip: boss.kFace < 0 });
  while (boss.trail.length && state.clock - boss.trail[0].t > 0.18) boss.trail.shift();

  const target = bossTarget(boss);
  const locked = boss.state === "swing" || boss.state === "charge" || boss.state === "dodge" || (boss.sig && boss.sig.lockFace);
  const dx = boss.sig && boss.sig.faceX !== undefined ? boss.sig.faceX : locked ? boss.lockX : target.x - boss.x;
  if (Math.abs(dx) > 2) boss.kFace = dx > 0 ? 1 : -1;

  if (!boss.greeted) {
    boss.greeted = true;
    shout(boss, KNIGHT_LINES[0], "#b3bccb");
  }
  const brain = boss.brain;
  if (brain && brain.phase >= 2 && !boss.capeOff) tearCape(boss);
  if (knightLook(boss) === "blaze" && Math.random() < dt * 10) {
    burst(boss.x + rand(-18, 18), boss.y - rand(0, 40), [BX.y1, BX.y2], 1, 30, { lift: 50 });
  }
  if (brain && state.clock > (boss.taunt || 0) + 9 && boss.state === "recover" && Math.random() < dt * 2) {
    boss.taunt = state.clock;
    shout(boss, KNIGHT_LINES[1 + Math.floor(Math.random() * 3)], "#b3bccb");
  }
}

function tearCape(boss) {
  boss.capeOff = true;
  boss.speed *= 1.2;
  addShake(6);
  sfx.slash(true);
  addFx({ kind: "kcapefall", x: boss.x - boss.kFace * 16, y: boss.y - 30, vx: -boss.kFace * 70, floor: boss.y + 22, life: 0.9 });
}

const damageEnemyBeforeKnight = damageEnemy;
damageEnemy = function (enemy, amount, source = "staff") {
  if (enemy && enemy.isKnight && enemy.hp > 0 && enemy.sig && enemy.sig.id === "kRiposte" && enemy.state === "sig") {
    const dot = source === "burn" || source === "poison";
    if (!dot && hitFromFront(enemy)) {
      riposteBlock(enemy, enemy.sig);
      return;
    }
  }
  return damageEnemyBeforeKnight(enemy, amount, source);
};

function riposteBlock(boss, s) {
  s.blocked += 1;
  const p = nearestPlayer(boss.x, boss.y);
  const a = angleTo(boss, p);
  addFx({ kind: "kspark", x: boss.x + Math.cos(a) * 26, y: boss.y - 18 + Math.sin(a) * 18, life: 0.22 });
  if (state.clock < (s.nextBounce || 0)) return;
  s.nextBounce = state.clock + 0.25;
  sfx.block();
  floatText(boss.x, boss.y - boss.size - 8, easyMode() ? "Blocked!" : "Riposte!", "#f6c85f", 15);
  if (easyMode()) return;
  if (Math.hypot(p.x - boss.x, p.y - boss.y) < 90) {
    // Too close: he answers with the sword.
    strike(p, Math.round(boss.damage * 0.8), boss.x, boss.y, boss, "parry");
    return;
  }
  shotFrom(boss.x, boss.y - 10, a, bulletSpeed(currentRoom()) * 1.15, Math.round(boss.damage * 0.6), { color: BX.H3, r: 7 });
}

const defeatEnemyBeforeKnight = defeatEnemy;
defeatEnemy = function (enemy) {
  if (!enemy.isKnight) return defeatEnemyBeforeKnight(enemy);
  if (enemy.sig) clearSig(enemy);
  clearBossFx();
  enemy.hp = 0;
  state.enemiesDefeated += 1;
  knightFalls(enemy);
};

// The ending: his sword shatters, he drops to one knee, and the dungeon is yours.
function knightFalls(boss) {
  const room = currentRoom();
  boss.fallen = true;
  boss.fallenAt = state.clock;
  boss.state = "move";
  boss.hop = 0;
  boss.trail.length = 0;
  state.won = true;
  for (const enemy of room.enemies) {
    if (enemy.hp > 0) {
      enemy.hp = 0;
      burst(enemy.x, enemy.y, [enemy.type.color, "#ffffff"], 12, 180);
    }
  }
  projectiles.length = 0;
  const sx = boss.x + boss.kFace * 22;
  burst(sx, boss.y - 10, [BX.s4, BX.s5, BX.s2, BX.r2], 30, 300);
  burst(boss.x, boss.y, [BX.y2, BX.y3], 16, 200);
  addShake(14);
  sfx.slam();
  confetti(boss.x, boss.y - 40, 140);
  sfx.fanfare();
  shout(boss, "...You are worthy.", "#e1e7ea");
  banner("You did it!", "The Dread Knight has fallen!", "#f6c85f", 4);
  unlockHat(DREAD_HAT);
  for (const p of activePlayers()) {
    if (p.hp <= 0) revivePlayer(p, 0.5);
  }
  state.victoryTimer = 4.2;
  writeStorage(SAVE_KEY, null);
  state.hasSave = false;
}

/* ---------- his moves ---------- */

function knightDamage(boss, k) {
  return Math.round(boss.damage * k);
}

function aimLunge(boss, s) {
  const target = leadPoint(bossTarget(boss), 0.15);
  const a = angleTo(boss, target);
  const d = Math.hypot(target.x - boss.x, target.y - boss.y);
  const wall = rayToWall(boss.x, boss.y, a);
  const len = Math.max(120, Math.min(wall.dist - 30, d + 170));
  s.a = a;
  s.fromX = boss.x;
  s.fromY = boss.y;
  const end = inArena(boss.x + Math.cos(a) * len, boss.y + Math.sin(a) * len, 34);
  s.toX = end.x;
  s.toY = end.y;
  s.faceX = Math.cos(a);
  boss.lockX = Math.cos(a);
  boss.lockY = Math.sin(a);
}

// Out of breath: he leans on his sword. This is the window to hit him hard.
function winded(boss, s, seconds) {
  s.step = 99;
  s.pose = "winded";
  s.timer = seconds * (easyMode() ? 1.4 : 1);
  s.faceX = undefined;
}

function windedDone(s, dt) {
  return s.step === 99 && countdown(s, dt);
}

const BREATH = () => [0.75, 0.65, 0.55][state.difficulty] || 0.65;

// A red dashed path on the floor, like warnLine but drawn by the move itself.
function drawPath(x1, y1, x2, y2, k) {
  const blink = k > 0.7 && Math.floor(state.anim * 16) % 2 === 0;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const n = Math.floor(len / 14);
  for (let i = 0; i < n; i += 1) {
    if ((i + Math.floor(state.anim * 12)) % 3 === 0) continue;
    const kk = i / n;
    block(x1 + (x2 - x1) * kk, y1 + (y2 - y1) * kk + 22, 8, BX.out);
    block(x1 + (x2 - x1) * kk, y1 + (y2 - y1) * kk + 22, 4, blink ? BX.wh : BX.r2);
  }
  const a = Math.atan2(y2 - y1, x2 - x1);
  for (let i = 0; i < 3; i += 1) {
    block(x2 - Math.cos(a) * i * 6 + Math.cos(a + 1.57) * i * 4, y2 + 22 - Math.sin(a) * i * 6 + Math.sin(a + 1.57) * i * 4, 6, BX.r2);
    block(x2 - Math.cos(a) * i * 6 - Math.cos(a + 1.57) * i * 4, y2 + 22 - Math.sin(a) * i * 6 - Math.sin(a + 1.57) * i * 4, 6, BX.r2);
  }
}

Object.assign(POP_LOOK, { rend: { rows: SPIKE_ROWS, pal: { L: BX.s3, l: BX.s5 } } });

Object.assign(SIGS, {
  kLunge: {
    name: "Lightning Lunge!", range: "far",
    start(boss, s) {
      const phase = boss.brain ? boss.brain.phase : 1;
      s.left = easyMode() ? Math.min(phase, 2) : phase;
      s.lockFace = true;
      s.pose = "windup";
      aimLunge(boss, s);
      s.timer = tele(0.6);
      s.warn = s.timer;
    },
    update(boss, s, dt) {
      if (s.step === 99) return windedDone(s, dt);
      if (s.step === 0) {
        if (s.timer > 0.12) aimLunge(boss, s);
        if (!countdown(s, dt)) return false;
        s.step = 1;
        s.k = 0;
        s.dur = Math.max(0.12, Math.hypot(s.toX - s.fromX, s.toY - s.fromY) / (easyMode() ? 1100 : 1500));
        s.hit = new Set();
        s.pose = "dash";
        sfx.dash();
        addShake(3);
        return false;
      }
      if (s.step === 1) {
        s.k = Math.min(1, s.k + dt / s.dur);
        const px = boss.x;
        const py = boss.y;
        boss.x = s.fromX + (s.toX - s.fromX) * s.k;
        boss.y = s.fromY + (s.toY - s.fromY) * s.k;
        for (const p of livingPlayers()) {
          if (s.hit.has(p.index)) continue;
          if (segmentDistance(p.x, p.y, px, py, boss.x, boss.y) > boss.size * 0.5 + p.r * 0.6) continue;
          s.hit.add(p.index);
          strike(p, knightDamage(boss, 1.25), boss.x, boss.y, boss, "parry");
        }
        if (s.k < 1) return false;
        burst(boss.x, boss.y + 20, [BX.s3, BX.wh], 10, 160);
        s.step = 2;
        s.timer = 0.2;
        s.pose = "slash";
        return false;
      }
      if (!countdown(s, dt)) return false;
      s.left -= 1;
      if (s.left > 0) {
        s.step = 0;
        s.pose = "windup";
        aimLunge(boss, s);
        s.timer = tele(0.4);
        s.warn = s.timer;
        return false;
      }
      winded(boss, s, BREATH());
      return false;
    },
    draw(boss, s) {
      if (s.step === 0) drawPath(s.fromX, s.fromY, s.toX, s.toY, 1 - s.timer / s.warn);
    }
  },

  kSkyfall: {
    name: "Skyfall!", range: "any", tags: ["area"],
    start(boss, s) {
      s.timer = 0.3;
      s.pose = "windup";
      sfx.dash();
    },
    update(boss, s, dt) {
      if (s.step === 99) return windedDone(s, dt);
      const target = bossTarget(boss);
      if (s.step === 0) {
        if (!countdown(s, dt)) return false;
        s.step = 1;
        s.timer = 0.3;
        s.pose = "leap";
        burst(boss.x, boss.y + 22, [BX.s3, BX.wh], 12, 200);
        return false;
      }
      if (s.step === 1) {
        boss.hop = (1 - s.timer / 0.3) * 520;
        if (!countdown(s, dt)) return false;
        boss.sigHidden = true;
        boss.sigInvuln = true;
        s.x = boss.x;
        s.y = boss.y;
        s.step = 2;
        s.timer = tele(easyMode() ? 1.6 : 1.2);
        return false;
      }
      if (s.step === 2) {
        const a = Math.atan2(target.y - s.y, target.x - s.x);
        const d = Math.hypot(target.x - s.x, target.y - s.y);
        const move = Math.min(d, (easyMode() ? 190 : 280) * dt);
        s.x += Math.cos(a) * move;
        s.y += Math.sin(a) * move;
        if (countdown(s, dt)) {
          s.step = 3;
          s.timer = tele(0.45);
          s.lock = s.timer;
        }
        return false;
      }
      if (s.step === 3) {
        if (!countdown(s, dt)) return false;
        boss.x = s.x;
        boss.y = s.y;
        boss.sigHidden = false;
        boss.sigInvuln = false;
        s.step = 4;
        s.timer = 0.16;
        return false;
      }
      if (s.step === 4) {
        boss.hop = Math.max(0, s.timer / 0.16) * 420;
        if (!countdown(s, dt)) return false;
        boss.hop = 0;
        hitCircle(boss.x, boss.y, 95, knightDamage(boss, 1.4), null, "zone");
        addShockwave(boss, easyMode() ? 1 : 2);
        addFx({ kind: "kcracks", x: boss.x, y: boss.y + 22, life: 2.6, seed: Math.random() * 1000 });
        addShake(12);
        sfx.slam();
        s.step = 5;
        s.timer = 0.3;
        s.pose = "slam";
        return false;
      }
      if (!countdown(s, dt)) return false;
      winded(boss, s, BREATH() + 0.2);
      return false;
    },
    draw(boss, s) {
      if (s.step < 2 || s.step > 3) return;
      blockDisc(s.x, s.y + 22, 34, BX.s0, 0.4);
      warnRing(s.x, s.y + 6, 95, s.step === 3 ? 1 - s.timer / s.lock : 0.3);
    }
  },

  kRiposte: {
    name: "Riposte!", range: "mid", tags: ["unblock"],
    start(boss, s) {
      s.timer = easyMode() ? 1.6 : 1.2;
      s.pose = "guard";
      s.blocked = 0;
    },
    update(boss, s, dt, room) {
      if (Math.random() < dt * 6) addFx({ kind: "kspark", x: boss.x + boss.kFace * rand(14, 26), y: boss.y - rand(30, 60), life: 0.12, small: true });
      if (!countdown(s, dt)) return false;
      if (s.blocked > 0 && !easyMode()) {
        // He saw your spells coming: straight into a lunging stab.
        startSwings(boss, [{ kind: "thrust", delay: 0.14, far: true }]);
        return "handoff";
      }
      return true;
    }
  },

  kCleave: {
    name: "Crescent Cleave!", range: "far",
    start(boss, s) {
      s.timer = tele(0.5);
      s.pose = "windup";
      s.lockFace = true;
      const target = bossTarget(boss);
      s.a = angleTo(boss, target);
      s.faceX = Math.cos(s.a);
      boss.lockX = Math.cos(s.a);
      boss.lockY = Math.sin(s.a);
    },
    update(boss, s, dt) {
      if (s.step === 0) {
        const target = bossTarget(boss);
        if (s.timer > 0.15) s.a = angleTo(boss, target);
        s.faceX = Math.cos(s.a);
        if (!countdown(s, dt)) return false;
        const fan = boss.brain && boss.brain.phase >= 3 && !easyMode() ? [-0.38, 0, 0.38] : [0];
        for (const k of fan) {
          const a = s.a + k;
          addFx({ kind: "kcleave", x: boss.x + Math.cos(a) * 34, y: boss.y + Math.sin(a) * 34, a, speed: easyMode() ? 320 : 430, r: 62, life: 1.8, damage: knightDamage(boss, 1.05), hit: new Set() });
        }
        sfx.slash(true);
        addShake(4);
        s.step = 1;
        s.timer = 0.35;
        s.pose = "slash";
        return false;
      }
      return countdown(s, dt);
    }
  },

  kRend: {
    name: "Ground Rend!", range: "mid", tags: ["area"],
    start(boss, s, room) {
      s.timer = tele(0.4);
      s.pose = "windup";
      s.lockFace = true;
      s.a = angleTo(boss, bossTarget(boss));
      s.faceX = Math.cos(s.a);
    },
    update(boss, s, dt) {
      if (s.step === 0) {
        if (!countdown(s, dt)) return false;
        const lines = boss.brain && boss.brain.phase >= 3 && !easyMode() ? [-0.32, 0, 0.32] : [0];
        const count = easyMode() ? 6 : 8;
        for (const k of lines) {
          const a = s.a + k;
          for (let i = 0; i < count; i += 1) {
            const d = 54 + i * 46;
            const x = boss.x + Math.cos(a) * d;
            const y = boss.y + 16 + Math.sin(a) * d;
            if (x < TILE + 20 || x > WIDTH - TILE - 20 || y < TILE + 20 || y > HEIGHT - TILE - 20) break;
            warnCircle(x, y, 30, tele(0.3) + i * 0.07, knightDamage(boss, 1), "rend");
          }
        }
        sfx.rumble();
        s.step = 1;
        s.timer = 0.5;
        s.pose = "slash";
        return false;
      }
      return countdown(s, dt);
    }
  },

  kThousand: {
    name: "THOUSAND CUTS!", range: "any", tags: ["area", "unblock"],
    start(boss, s) {
      const target = bossTarget(boss);
      const n = easyMode() ? 3 : 5;
      const base = Math.random() * Math.PI;
      const gap = easyMode() ? 0.75 : 0.42;
      s.zips = [];
      for (let i = 0; i < n; i += 1) {
        const a = base + (i * Math.PI) / n + (i % 2 ? 0.2 : -0.2);
        const cx = target.x + rand(-40, 40);
        const cy = target.y + rand(-40, 40);
        const one = rayToWall(cx, cy, a);
        const two = rayToWall(cx, cy, a + Math.PI);
        const warn = tele(0.6) + i * gap;
        warnLine(two.x, two.y, one.x, one.y, 40, warn, knightDamage(boss, 1), "cut", { boss: null });
        s.zips.push({ at: warn, x1: two.x, y1: two.y, x2: one.x, y2: one.y });
      }
      s.xAt = s.zips[n - 1].at + 0.45;
      s.pose = "dash";
      boss.sigHidden = true;
      boss.sigInvuln = true;
      sfx.roar();
      addShake(6);
    },
    update(boss, s, dt) {
      if (s.step === 99) return windedDone(s, dt);
      s.zip = null;
      for (const z of s.zips) {
        if (s.t >= z.at - 0.02 && s.t < z.at + 0.14) {
          const k = clamp((s.t - z.at + 0.02) / 0.16, 0, 1);
          s.zip = { x: z.x1 + (z.x2 - z.x1) * k, y: z.y1 + (z.y2 - z.y1) * k, flip: z.x2 < z.x1 };
          if (!z.done) {
            z.done = true;
            sfx.slash(true);
          }
        }
      }
      if (s.step === 0 && s.t >= s.xAt) {
        // The finale: a giant X right where you stand.
        const target = bossTarget(boss);
        const w = easyMode() ? 50 : 70;
        for (const a of [Math.PI / 4, -Math.PI / 4]) {
          const one = rayToWall(target.x, target.y, a);
          const two = rayToWall(target.x, target.y, a + Math.PI);
          warnLine(two.x, two.y, one.x, one.y, w, tele(0.9), knightDamage(boss, 1.5), "cut", { boss: null });
        }
        s.cx = target.x;
        s.cy = target.y;
        s.step = 1;
        s.timer = tele(0.9) + 0.05;
        return false;
      }
      if (s.step === 1 && countdown(s, dt)) {
        const spot = inArena(s.cx, s.cy - 70, 40);
        boss.x = spot.x;
        boss.y = spot.y;
        boss.sigHidden = false;
        boss.sigInvuln = false;
        addShake(14);
        sfx.slam();
        burst(boss.x, boss.y, [BX.r2, BX.wh, BX.y2], 24, 260);
        winded(boss, s, [3.5, 3, 2.5][state.difficulty] || 3);
      }
      return false;
    },
    draw(boss, s) {
      if (s.step === 99) return;
      drawCutsDark();
      if (s.zip) drawKnightAt(s.zip.x, s.zip.y, `${knightLook(boss)}.dash`, s.zip.flip, { ghost: true });
    }
  }
});

// The cut lines: red warning, then a white-hot slash.
Object.assign(FX, {
  kcleave: {
    update(fx, dt) {
      fx.x += Math.cos(fx.a) * fx.speed * dt;
      fx.y += Math.sin(fx.a) * fx.speed * dt;
      if (fx.x < TILE || fx.x > WIDTH - TILE || fx.y < TILE || fx.y > HEIGHT - TILE) fx.life = 0;
      const nx = -Math.sin(fx.a);
      const ny = Math.cos(fx.a);
      for (const p of livingPlayers()) {
        if (fx.hit.has(p.index)) continue;
        if (segmentDistance(p.x, p.y, fx.x - nx * fx.r, fx.y - ny * fx.r, fx.x + nx * fx.r, fx.y + ny * fx.r) > 14 + p.r * 0.5) continue;
        fx.hit.add(p.index);
        strike(p, fx.damage, fx.x, fx.y, null, "zone");
      }
    },
    draw(fx) {
      const nx = -Math.sin(fx.a);
      const ny = Math.cos(fx.a);
      const dx = Math.cos(fx.a);
      const dy = Math.sin(fx.a);
      const steps = 16;
      for (const [size, colors] of [[14, [BX.out, BX.out]], [10, [BX.r2, BX.s4]], [4, [BX.wh, BX.wh]]]) {
        for (let i = -steps; i <= steps; i += 1) {
          const k = i / steps;
          const bulge = Math.cos(k * Math.PI * 0.5) * 18;
          const thin = 1 - Math.abs(k) * 0.6;
          const x = fx.x + nx * fx.r * k + dx * bulge;
          const y = fx.y + ny * fx.r * k + dy * bulge;
          block(x, y, Math.max(2, snap(size * thin)), Math.abs(k) < 0.6 ? colors[1] : colors[0]);
        }
      }
    }
  },
  kspark: {
    draw(fx) {
      const s = fx.small ? 2 : 4;
      const n = fx.small ? 2 : 4;
      for (let i = -n; i <= n; i += 1) {
        const c = Math.abs(i) < 2 ? BX.wh : BX.y3;
        block(fx.x + i * s, fx.y, s, c);
        block(fx.x, fx.y + i * s, s, c);
      }
    }
  },
  kcracks: {
    ground: true,
    draw(fx) {
      if (fx.life < 0.6 && Math.floor(state.anim * 12) % 2) return;
      let seed = fx.seed;
      const rnd = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
      for (let i = 0; i < 8; i += 1) {
        let a = (i / 8) * Math.PI * 2 + rnd() * 0.6;
        let x = fx.x;
        let y = fx.y;
        for (let j = 0; j < 9; j += 1) {
          a += rnd() - 0.5;
          x += Math.cos(a) * 8;
          y += Math.sin(a) * 4.5;
          block(x, y, 4, BX.out);
          if (j % 3 === 1) block(x + 4, y, 2, BX.s0);
        }
      }
    }
  },
  kcapefall: {
    update(fx, dt) {
      fx.x += fx.vx * dt;
      fx.y += ((fx.floor - fx.y) / Math.max(0.05, fx.life)) * dt;
    },
    draw(fx) {
      drawCape(fx.x, fx.y, false, fx.t);
    },
    end(fx) {
      addFx({ kind: "kcapefloor", x: fx.x, y: fx.floor, life: 600 });
    }
  },
  kcapefloor: {
    ground: true,
    draw(fx) {
      drawCape(fx.x, fx.y, true, 0);
    }
  }
});

// The torn-off cape: fluttering in the air, then lying on the floor.
function drawCape(x, y, flat, t) {
  const rows = flat ? 4 : 9;
  const w = flat ? 30 : 20;
  for (let r = 0; r < rows; r += 1) {
    const sway = flat ? 0 : snap(Math.sin(t * 14 + r * 0.7) * 3);
    const width = w + (flat ? (r % 2) * 4 : r * 1.5);
    const rx = x - width / 2 + sway;
    const ry = y - (flat ? 6 : 18) + r * 4;
    ctx.fillStyle = BX.out;
    ctx.fillRect(snap(rx - 2), snap(ry - 2), snap(width + 4), 8);
  }
  for (let r = 0; r < rows; r += 1) {
    const sway = flat ? 0 : snap(Math.sin(t * 14 + r * 0.7) * 3);
    const width = w + (flat ? (r % 2) * 4 : r * 1.5);
    const rx = x - width / 2 + sway;
    const ry = y - (flat ? 6 : 18) + r * 4;
    ctx.fillStyle = r % 3 === 1 ? BX.r0 : BX.r1;
    ctx.fillRect(snap(rx), snap(ry), snap(width), 4);
    ctx.fillStyle = BX.r2;
    ctx.fillRect(snap(rx), snap(ry), 4, 2);
  }
}

// Thousand Cuts darkens the edges of the room (a dither, so no see-through paint).
let cutsDark = null;
function drawCutsDark() {
  if (!cutsDark) {
    cutsDark = document.createElement("canvas");
    cutsDark.width = WIDTH;
    cutsDark.height = HEIGHT;
    const g = cutsDark.getContext("2d");
    g.fillStyle = BX.out;
    const band = 90;
    for (let y = TILE; y < HEIGHT - TILE; y += 2) {
      for (let x = TILE; x < WIDTH - TILE; x += 2) {
        const edge = Math.min(x - TILE, WIDTH - TILE - x, y - TILE, HEIGHT - TILE - y);
        if (edge > band) continue;
        const level = edge < band / 3 ? 3 : edge < (band * 2) / 3 ? 2 : 1;
        const cell = ((x / 2) % 2) + ((y / 2) % 2) * 2;
        if ([[0], [0, 3], [0, 1, 3]][level - 1].includes(cell)) g.fillRect(x, y, 2, 2);
      }
    }
  }
  ctx.drawImage(cutsDark, 0, 0);
}

/* ---------- drawing him ---------- */

const knightSheet = new Image();
knightSheet.src = KNIGHT_ART.src;
const knightFrames = new Map();

// One frame as its own canvas, cached per frame, facing and tint.
function knightFrame(name, flip, tint) {
  const key = `${name}|${flip ? 1 : 0}|${tint || ""}`;
  let canvas = knightFrames.get(key);
  if (canvas) return canvas;
  const at = KNIGHT_ART.frames[name];
  if (!at || !knightSheet.complete || !knightSheet.naturalWidth) return null;
  const [w, h] = KNIGHT_ART.cell;
  canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (flip) {
    g.translate(w, 0);
    g.scale(-1, 1);
  }
  g.drawImage(knightSheet, at[0], at[1], w, h, 0, 0, w, h);
  if (tint) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = tint;
    g.fillRect(0, 0, w, h);
  }
  knightFrames.set(key, canvas);
  return canvas;
}

function drawKnightAt(x, y, name, flip, options = {}) {
  const [w, h] = KNIGHT_ART.cell;
  const [ax, ay] = KNIGHT_ART.anchor;
  const left = snap(x - ax * PX);
  const top = snap(y + 24 - ay * PX - (options.hop || 0));
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (options.ghost) {
    for (const [dx, tint] of [[-36, "#1c1d52"], [-18, "#2b3594"]]) {
      const ghost = knightFrame(name, flip, tint);
      if (ghost) ctx.drawImage(ghost, left + (flip ? -dx : dx), top, w * PX, h * PX);
    }
  }
  const frame = knightFrame(name, flip, options.tint);
  if (frame) ctx.drawImage(frame, left, top, w * PX, h * PX);
  ctx.imageSmoothingEnabled = smooth;
}

function knightFrameName(boss) {
  const look = knightLook(boss);
  const t = state.clock;
  let pose = "idle";
  if (boss.state === "sig" && boss.sig) pose = boss.sig.pose || "idle";
  else if (isStunned(boss)) pose = "winded";
  else if (t - (boss.kLandAt || -9) < 0.3) pose = "slam";
  else if (t - (boss.kSlashAt || -9) < 0.2) pose = boss.kSlashKind === "thrust" ? "dash" : "slash";
  else if (boss.state === "tell" || boss.state === "windup" || boss.state === "swing") pose = "windup";
  else if (boss.state === "leap") pose = "leap";
  else if (boss.state === "charge" || boss.state === "dodge" || boss.state === "lunge") pose = "dash";
  else if (boss.kSpeed > 30) pose = "run";
  if (pose === "idle") return `${look}.idle${Math.floor(state.anim * 7) % 6}`;
  if (pose === "run") return `${look}.run${Math.floor(state.anim * 12) % 6}`;
  return `${look}.${pose}`;
}

function drawKnight(boss) {
  const hop = boss.hop || 0;
  blockDisc(boss.x, boss.y + 24, 24 - Math.min(14, hop / 30), BX.s0, 0.35);
  for (const ghost of boss.trail) {
    const age = state.clock - ghost.t;
    drawKnightAt(ghost.x, ghost.y, ghost.frame, ghost.flip, { tint: age < 0.09 ? "#2b3594" : "#1c1d52" });
  }
  let flip = boss.kFace < 0;
  // Spins flip him back and forth.
  if (state.clock - (boss.kSlashAt || -9) < 0.2 && boss.kSlashKind === "spin") flip = Math.floor(state.anim * 20) % 2 === 0;
  drawKnightAt(boss.x, boss.y, knightFrameName(boss), flip, { hop, tint: boss.flash > 0 ? "#f4f4f8" : null });
}

function drawFallenKnight(boss) {
  blockDisc(boss.x, boss.y + 24, 24, BX.s0, 0.35);
  drawKnightAt(boss.x, boss.y, "fallen", boss.kFace < 0);
  // The broken blade on the floor beside him.
  const bx = boss.x + boss.kFace * 46;
  const by = boss.y + 20;
  blockLine(bx - 16, by + 4, bx + 14, by - 2, BX.out, 8);
  blockLine(bx - 14, by + 4, bx + 12, by - 2, BX.s2, 4);
  block(bx + 2, by, 4, BX.r2);
}

const drawEnemyBeforeKnight = drawEnemy;
drawEnemy = function (enemy) {
  if (enemy.isKnight) {
    drawKnight(enemy);
    return;
  }
  drawEnemyBeforeKnight(enemy);
};

const drawFoesBeforeKnight = drawFoes;
drawFoes = function (room) {
  if (room && room.final) drawKeepTorches();
  drawFoesBeforeKnight(room);
  const boss = room && room.boss;
  if (boss && boss.isKnight && boss.fallen) drawFallenKnight(boss);
};

// For the victory screen: Sir Grimhelm kneels.
function drawKnightBow(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  drawKnightAt(0, 0, "fallen", true);
  ctx.restore();
}

/* ---------- the Black Keep ----------
   Dark flagstones, a blue carpet up the middle, red banners and torches.
   Painted once into the room background, like every room. */

const KEEP_TORCHES = [[TILE + 6, 200], [TILE + 6, HEIGHT - 200], [WIDTH - TILE - 6, 200], [WIDTH - TILE - 6, HEIGHT - 200], [WIDTH / 2 - 250, TILE - 6], [WIDTH / 2 + 250, TILE - 6]];
const KEEP_BANNERS = [WIDTH / 2 - 340, WIDTH / 2 - 150, WIDTH / 2 + 150, WIDTH / 2 + 340];

const renderRoomBackgroundBeforeKnight = renderRoomBackground;
renderRoomBackground = function (room) {
  renderRoomBackgroundBeforeKnight(room);
  if (room.final) paintKeep(bgCtx, room);
};

function paintKeep(g, room) {
  let seed = 4242;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const box = (c, x, y, w, h) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  // Flagstones in staggered rows, each with a lit top-left lip and a dark joint.
  const S = 32;
  for (let y = TILE; y < HEIGHT - TILE; y += S) {
    const shift = ((y / S) % 2) * (S / 2);
    for (let x = TILE - shift; x < WIDTH - TILE; x += S) {
      const v = rnd();
      box(BX.s0, x, y, S, S);
      box(v < 0.15 ? BX.s2 : BX.s1, x + 2, y + 2, S - 4, S - 4);
      box(BX.s2, x + 2, y + 2, S - 4, 2);
      box(BX.s2, x + 2, y + 2, 2, S - 6);
      if (v > 0.8) {
        // A crack.
        const cx = x + 8 + Math.floor(rnd() * 8) * 2;
        box(BX.s0, cx, y + 8, 2, 6);
        box(BX.s0, cx + 2, y + 14, 2, 6);
        box(BX.s0, cx + 4, y + 18, 2, 4);
      }
    }
  }
  // The carpet runs from the door at the bottom up to the throne wall. It is
  // royal blue, not red, so red warning lines still show on it.
  const cw = 112;
  const cx = WIDTH / 2 - cw / 2;
  box(BX.out, cx - 4, TILE, cw + 8, HEIGHT - TILE * 2);
  box("#1c1d52", cx, TILE, cw, HEIGHT - TILE * 2);
  box("#2b3594", cx + 6, TILE, cw - 12, HEIGHT - TILE * 2);
  box(BX.y1, cx + 10, TILE, 4, HEIGHT - TILE * 2);
  box(BX.y1, cx + cw - 14, TILE, 4, HEIGHT - TILE * 2);
  for (let y = TILE + 24; y < HEIGHT - TILE; y += 56) {
    box(BX.y0, WIDTH / 2 - 6, y, 12, 4);
    box(BX.y0, WIDTH / 2 - 2, y - 4, 4, 12);
  }
  // Walls: dark bricks with lit tops.
  for (const [x, y, w, h] of [[0, 0, WIDTH, TILE], [0, HEIGHT - TILE, WIDTH, TILE], [0, 0, TILE, HEIGHT], [WIDTH - TILE, 0, TILE, HEIGHT]]) box(BX.out, x, y, w, h);
  for (let y = 0; y < HEIGHT; y += 16) {
    for (let x = 0; x < WIDTH; x += 32) {
      if (x >= TILE && x < WIDTH - TILE && y >= TILE && y < HEIGHT - TILE) continue;
      const bx = x + ((y / 16) % 2) * 16;
      box(BX.s0, bx + 2, y + 2, 28, 12);
      box(BX.s1, bx + 2, y + 2, 28, 2);
    }
  }
  box(BX.s2, TILE, TILE - 4, WIDTH - TILE * 2, 4);
  box(BX.out, TILE, TILE, WIDTH - TILE * 2, 6);
  // Banners with a gold horned-helm crest.
  for (const bx of KEEP_BANNERS) {
    const top = TILE - 20;
    box(BX.y0, bx - 30, top - 4, 60, 6);
    box(BX.out, bx - 24, top, 48, 92);
    box(BX.r1, bx - 22, top, 44, 82);
    box(BX.r0, bx + 10, top, 12, 82);
    for (let i = 0; i < 3; i += 1) box(BX.r1, bx - 22 + i * 16, top + 82, 12, 6);
    box(BX.y1, bx - 22, top + 6, 44, 4);
    box(BX.y2, bx - 8, top + 30, 16, 14);
    box(BX.r0, bx - 6, top + 36, 12, 2);
    box(BX.y2, bx - 14, top + 22, 4, 10);
    box(BX.y2, bx + 10, top + 22, 4, 10);
    box(BX.y3, bx - 6, top + 32, 4, 2);
  }
  // Torch brackets (the flames flicker each frame, see drawKeepTorches).
  for (const [tx, ty] of KEEP_TORCHES) {
    box(BX.out, tx - 8, ty - 2, 16, 14);
    box(BX.s2, tx - 6, ty, 12, 10);
    box(BX.s3, tx - 6, ty, 12, 2);
  }
}

function drawKeepTorches() {
  KEEP_TORCHES.forEach(([tx, ty], i) => drawFlame(tx, ty, 10, i * 3));
}

/* ---------- the Dread Helm (trophy hat) ---------- */

const drawHatBeforeKnight = drawHat;
drawHat = function (g, id, x, y, lean, t, robe) {
  if (id !== DREAD_HAT) return drawHatBeforeKnight(g, id, x, y, lean, t, robe);
  const box = (color, rx, ry, w, h) => {
    g.fillStyle = color;
    g.fillRect(x + rx, y + ry, w, h);
  };
  // Horns first, so the helm sits over their roots.
  box("#87573b", -16, -32, 6, 6);
  box("#b07e4e", -18, -38, 5, 7);
  box("#efd29b", -18, -42, 4, 5);
  box("#87573b", 10, -32, 6, 6);
  box("#b07e4e", 13, -38, 5, 7);
  box("#efd29b", 14, -42, 4, 5);
  box("#1d1a2f", -12, -36, 24, 16);
  box("#59597a", -11, -35, 22, 14);
  box("#8189a3", -9, -35, 14, 3);
  box("#3a3854", 5, -32, 6, 11);
  box("#1d1a2f", -11, -24, 22, 3);
  box("#f5c542", -6 + lean, -24, 3, 2);
  box("#fff0a3", 3 + lean, -24, 3, 2);
  box("#d6455d", -2, -31, 4, 3);
};
