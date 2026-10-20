// Cloudflare Pages Function: /api/rooms
//
// GET  the rooms the admin built in the room editor, for every player.
//      With the admin key it also answers whether that key is right.
// PUT  saves or clears rooms (needs the admin key):
//      { rooms: { "3": { g, p, b }, "7": null } }  null puts a room back to normal.
//
// Uses the same D1 binding (FEEDBACK_DB) and secret (FEEDBACK_KEY) as the
// feedback button, so there is nothing new to set up. The game checks every
// room again when it loads it (decodePlan in terrain.js).

const ROOMS = 30;
const MAX_PLAN = 200000;

const SCHEMA = `CREATE TABLE IF NOT EXISTS room_plans (
  room INTEGER PRIMARY KEY,
  plan TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

async function sha256(text) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function isAdmin(request, env) {
  const expected = env.FEEDBACK_KEY;
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  // Compare hashes so the check takes the same time whatever was typed.
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  return a === b && given.length > 0;
}

const isPlan = (p) => p && typeof p === "object" && typeof p.g === "string" && Array.isArray(p.p) && Array.isArray(p.b);

export async function onRequestGet({ request, env }) {
  if (!env.FEEDBACK_DB) return json({ ok: true, admin: false, rooms: {} });
  const db = env.FEEDBACK_DB;
  await db.prepare(SCHEMA).run();
  const { results } = await db.prepare("SELECT room, plan FROM room_plans").all();
  const rooms = {};
  for (const row of results) {
    try {
      rooms[row.room] = JSON.parse(row.plan);
    } catch {
      /* A broken row is skipped; that room plays normally. */
    }
  }
  const admin = request.headers.has("authorization") ? await isAdmin(request, env) : false;
  return json({ ok: true, admin, rooms });
}

export async function onRequestPut({ request, env }) {
  if (!env.FEEDBACK_DB) return json({ ok: false, error: "Rooms can't be saved yet (no FEEDBACK_DB binding)." }, 503);
  if (!(await isAdmin(request, env))) return json({ ok: false, error: "Wrong or missing admin key." }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "That didn't look like rooms." }, 400);
  }
  const entries = Object.entries((body && body.rooms) || {});
  if (!entries.length || entries.length > ROOMS) return json({ ok: false, error: "No rooms to save." }, 400);

  const db = env.FEEDBACK_DB;
  await db.prepare(SCHEMA).run();
  const now = Date.now();
  const steps = [];
  for (const [key, plan] of entries) {
    const room = Number(key);
    if (!Number.isInteger(room) || room < 0 || room >= ROOMS) return json({ ok: false, error: `No room ${key}.` }, 400);
    if (plan === null) {
      steps.push(db.prepare("DELETE FROM room_plans WHERE room = ?").bind(room));
      continue;
    }
    const text = JSON.stringify(plan);
    if (!isPlan(plan) || text.length > MAX_PLAN) return json({ ok: false, error: `Room ${key} doesn't look right.` }, 400);
    steps.push(
      db.prepare("INSERT INTO room_plans (room, plan, updated_at) VALUES (?, ?, ?) ON CONFLICT(room) DO UPDATE SET plan = excluded.plan, updated_at = excluded.updated_at")
        .bind(room, text, now)
    );
  }
  await db.batch(steps);
  return json({ ok: true, saved: entries.length });
}
