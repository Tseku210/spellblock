// Game version and "What's new" notes.
// Lives on its own so it never has to touch script.js. It shows the version
// on the title screen, the pause menu and the top bar, and pops up the notes
// once for returning players after an update.
//
// To ship an update: bump VERSION and add an entry to the top of CHANGES,
// written for kids. Load this file last in index.html: it wraps drawTitle and
// drawPauseScreen, which other files replace.
(() => {
  const VERSION = "1.11";
  const CHANGES = [
    { version: "1.11", date: "Oct 21", notes: ["A new final boss! The golden portal now leads to the Black Keep, where Sir Grimhelm the Dread Knight waits. He is fast, smart and hits hard. Beat him to win the Dread Helm hat."] },
    { version: "1.10", date: "Oct 21", notes: ["The dungeon can now be redesigned room by room. Keep your eyes open for new ponds, lava rivers and secret corners!"] },
    { version: "1.9", date: "Oct 20", notes: ["Ideas from your feedback! Armor drops from bosses, campfire travel (press T), a sandworm in the desert, void rifts in long boss fights, a Blizzard that freezes shots, and a secret boss hiding in the mines..."] },
    { version: "1.8", date: "Oct 20", notes: ["The game now shows its version number. After every update, this box tells you what's new."] },
    { version: "1.7", date: "Oct 17", notes: ["Every boss has its own special moves, and bosses fight smarter and harder."] },
    { version: "1.6", date: "Oct 17", notes: ["New pixel-art props in every room, and the world has more depth."] },
    { version: "1.5", date: "Oct 16", notes: ["Every room has its own terrain: ponds, lava, ice and chasms."] },
    { version: "1.4", date: "Oct 16", notes: ["Monsters and bosses are much tougher on Normal and Hard."] },
    { version: "1.3", date: "Oct 16", notes: ["Five worlds, magic staffs, a shop, and hand-made pixel sprites."] },
    { version: "1.2", date: "Oct 16", notes: ["Boss fights run much smoother."] },
    { version: "1.1", date: "Oct 16", notes: ["A Feedback button to send us ideas and bug reports."] },
    { version: "1.0", date: "Oct 16", notes: ["Spellblock is out!"] }
  ];
  const SEEN_KEY = "spellblock-seen-version";
  const GAME_KEYS = ["block-dungeon-spell-runner-prefs", "block-dungeon-spell-runner-save-v2"];
  const FIRST_POPUP_COUNT = 2;
  const LABEL = `v${VERSION}`;

  function readKey(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function writeKey(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (err) {
      /* Storage can be blocked; the notes just show again next time. */
    }
  }

  function newer(a, b) {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    }
    return false;
  }

  /* ---------- the "What's new" box ---------- */

  const dialog = document.createElement("dialog");
  dialog.className = "feedback-dialog version-dialog";
  dialog.setAttribute("aria-labelledby", "versionTitle");
  dialog.innerHTML = `
    <div class="feedback-form">
      <h2 id="versionTitle">What's new</h2>
      <p class="feedback-sub">You're playing version ${VERSION}.</p>
      <ol class="version-list"></ol>
      <div class="feedback-actions">
        <button type="button" class="chip-btn feedback-send" data-close>Let's play!</button>
      </div>
    </div>
  `;
  const list = dialog.querySelector(".version-list");

  function fill(entries) {
    list.replaceChildren(...entries.map((entry) => {
      const item = document.createElement("li");
      const head = document.createElement("strong");
      head.textContent = `Version ${entry.version}`;
      const date = document.createElement("span");
      date.className = "version-date";
      date.textContent = entry.date;
      const notes = document.createElement("ul");
      for (const note of entry.notes) {
        const line = document.createElement("li");
        line.textContent = note;
        notes.appendChild(line);
      }
      item.append(head, " ", date, notes);
      return item;
    }));
  }

  function open(entries = CHANGES) {
    const state = window.blockDungeon && window.blockDungeon.state;
    if (state && state.mode === "playing") document.getElementById("pauseBtn")?.click();
    fill(entries);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    dialog.querySelector("[data-close]").focus();
  }

  function close() {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  // The game listens for keys on window; keep Enter or Space here from also
  // starting a run behind the box.
  for (const type of ["keydown", "keyup", "keypress"]) {
    dialog.addEventListener(type, (event) => event.stopPropagation());
  }
  dialog.querySelector("[data-close]").addEventListener("click", close);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });

  /* ---------- version label in the top bar ---------- */

  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "version-chip";
  chip.textContent = `${LABEL} · What's new`;
  chip.title = "See what changed in the latest updates";
  chip.addEventListener("click", () => {
    open();
    chip.blur();
  });

  /* ---------- version label on the canvas ---------- */

  function drawVersionLabel() {
    const text = `${LABEL} · What's new`;
    const x = WIDTH - 14;
    const y = HEIGHT - 14;
    ctx.font = `700 14px ${BODY_FONT}`;
    const w = ctx.measureText(text).width;
    const hover = isHover(x - w - 6, y - 18, w + 12, 26);
    outlinedText(text, x, y, { size: 14, align: "right", color: hover ? "#f6c85f" : "#c5a988" });
    hitRegions.push({ x: x - w - 6, y: y - 18, w: w + 12, h: 26, action: () => open() });
  }

  for (const name of ["drawTitle", "drawPauseScreen"]) {
    const base = window[name];
    if (typeof base !== "function") continue;
    window[name] = function drawWithVersion(...args) {
      const result = base.apply(this, args);
      drawVersionLabel();
      return result;
    };
  }

  /* ---------- show the notes once after an update ---------- */

  function start() {
    document.querySelector(".title-block h1")?.after(chip);
    document.body.appendChild(dialog);

    const seen = readKey(SEEN_KEY);
    const returning = GAME_KEYS.some((key) => readKey(key) !== null);
    writeKey(SEEN_KEY, VERSION);
    if (!returning) return;
    if (seen && !newer(VERSION, seen)) return;
    const fresh = seen ? CHANGES.filter((entry) => newer(entry.version, seen)) : CHANGES.slice(0, FIRST_POPUP_COUNT);
    if (fresh.length) open(fresh);
  }

  window.blockDungeonVersion = { version: VERSION, changes: CHANGES, open };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
