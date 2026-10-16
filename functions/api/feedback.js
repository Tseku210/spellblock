// Cloudflare Pages Function: /api/feedback
//
// POST   saves one idea/bug from the in-game feedback form (anyone can send).
// GET    lists saved feedback, newest first (needs the inbox key).
// DELETE ?id=123 removes one entry (needs the inbox key).
//
// Needs two things set in the Cloudflare Pages project settings:
//   FEEDBACK_DB   a D1 database binding (the table is created automatically)
//   FEEDBACK_KEY  a secret; the inbox page asks for it before showing anything

const KINDS = ["idea", "bug", "other"];
const MAX_MESSAGE = 1000;
const MAX_NICK = 40;
const MAX_CONTEXT = 600;
// Each player (by hashed IP) can send this many messages per window.
const RATE_LIMIT = 8;
const RATE_WINDOW_MS = 10 * 60 * 1000;

const SCHEMA = `CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  nickname TEXT,
  context TEXT,
  ip_hash TEXT
)`;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function clean(value, max) {
  if (typeof value !== "string") return "";
  // Drop control characters except newlines and tabs, then trim.
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

async function sha256(text) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function ensureTable(db) {
  await db.prepare(SCHEMA).run();
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

function missingSetup(env) {
  if (!env.FEEDBACK_DB) return json({ ok: false, error: "Feedback isn't set up yet (no FEEDBACK_DB binding)." }, 503);
  return null;
}

export async function onRequestPost({ request, env }) {
  const notReady = missingSetup(env);
  if (notReady) return notReady;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "That didn't look like a feedback message." }, 400);
  }

  // Bots fill in every field; people never see this one.
  if (body && typeof body.website === "string" && body.website.trim()) return json({ ok: true });

  const kind = KINDS.includes(body.kind) ? body.kind : "other";
  const message = clean(body.message, MAX_MESSAGE);
  const nickname = clean(body.nickname, MAX_NICK) || null;
  let context = null;
  if (body.context && typeof body.context === "object") {
    context = JSON.stringify(body.context).slice(0, MAX_CONTEXT);
  }
  if (message.length < 2) return json({ ok: false, error: "Write a little more first!" }, 400);

  const db = env.FEEDBACK_DB;
  await ensureTable(db);

  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const ipHash = (await sha256(`${ip}|${env.FEEDBACK_KEY || "spellblock"}`)).slice(0, 16);
  const now = Date.now();
  const recent = await db
    .prepare("SELECT COUNT(*) AS n FROM feedback WHERE ip_hash = ? AND created_at > ?")
    .bind(ipHash, now - RATE_WINDOW_MS)
    .first();
  if (recent && recent.n >= RATE_LIMIT) {
    return json({ ok: false, error: "Whoa, lots of ideas! Wait a few minutes and send more." }, 429);
  }

  await db
    .prepare("INSERT INTO feedback (created_at, kind, message, nickname, context, ip_hash) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(now, kind, message, nickname, context, ipHash)
    .run();

  return json({ ok: true });
}

export async function onRequestGet({ request, env }) {
  const notReady = missingSetup(env);
  if (notReady) return notReady;
  if (!(await isAdmin(request, env))) return json({ ok: false, error: "Wrong or missing inbox key." }, 401);

  await ensureTable(env.FEEDBACK_DB);
  const url = new URL(request.url);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 200));
  const { results } = await env.FEEDBACK_DB
    .prepare("SELECT id, created_at, kind, message, nickname, context FROM feedback ORDER BY id DESC LIMIT ?")
    .bind(limit)
    .all();
  const items = results.map((row) => ({
    ...row,
    context: row.context ? safeParse(row.context) : null
  }));
  return json({ ok: true, items });
}

export async function onRequestDelete({ request, env }) {
  const notReady = missingSetup(env);
  if (notReady) return notReady;
  if (!(await isAdmin(request, env))) return json({ ok: false, error: "Wrong or missing inbox key." }, 401);

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return json({ ok: false, error: "Which one? Add ?id=" }, 400);
  await ensureTable(env.FEEDBACK_DB);
  await env.FEEDBACK_DB.prepare("DELETE FROM feedback WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
