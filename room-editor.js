/* ---------- room editor ----------
   Load after terrain.js and props.js. Every player gets the admin's rooms
   from the game server (functions/api/rooms.js) when the page loads.
   The admin opens the site with ?admin once and types the admin key (the
   feedback inbox key); after that an "Edit rooms" button opens a full-screen
   editor for any dungeon room: paint ground (water, lava, ice...), plant
   props, build bridges, remove things and undo. Every change is saved to the
   server for everyone a moment later. ?admin=off forgets the key.
   The room data and rules live in terrain.js (window.roomPlans); this file is
   the screen and the syncing. */

(() => {
  const api = window.roomPlans;
  if (!api) return;
  const G = api.ground;
  const { W, H, T } = api;

  const GROUND = [
    { kind: G.FLOOR, name: "Floor", color: "#8f7a4a", hint: "Paint floor to rub out water, lava and the rest." },
    { kind: G.WATER, name: "Water", color: "#3d8fd8", hint: "Water slows you down." },
    { kind: G.LAVA, name: "Lava", color: "#ff6a1e", hint: "Lava burns! Add a bridge so you can cross." },
    { kind: G.ICE, name: "Ice", color: "#bfe9ff", hint: "Ice is slippery." },
    { kind: G.CHASM, name: "Hole", color: "#1d1430", hint: "Fall in a hole and you lose a little health." },
    { kind: G.QUICK, name: "Quicksand", color: "#c49a58", hint: "Quicksand pulls you in." },
    { kind: G.SNOW, name: "Snow", color: "#f2f8fb", hint: "Deep snow slows you down." }
  ];
  const BRUSHES = [["S", 10], ["M", 22], ["L", 40]];
  const SIZES = [["Small", 0.7], ["Normal", 1], ["Big", 1.4]];
  const PROP_NAMES = {
    oak: "Tree", willow: "Willow", pine: "Pine tree", rocks: "Rock pile", stone: "Boulder", statue: "Statue",
    dragon: "Dragon statue", brazier: "Fire bowl", cart: "Mine cart", barrel: "Barrel", pyramid: "Pyramid",
    crystals: "Crystals", cactus: "Cactus", palm: "Palm tree", deadTree: "Dead tree", snowman: "Snowman",
    iceRock: "Ice rock", stump: "Stump", log: "Log", column: "Column", fallen: "Fallen column", grave: "Gravestone",
    mushroomTree: "Giant mushroom", stalagmite: "Stalagmite", sandColumn: "Sand column"
  };
  const propName = (tpl) => (tpl.k === "oak" && tpl.args[1] ? "Apple tree" : PROP_NAMES[tpl.k] || tpl.k);

  // What the editor is doing. tool is one of:
  // { type: "ground", ground } | { type: "prop", tpl } | { type: "bridge" } | { type: "remove" }
  const ed = {
    room: null,
    plan: null,
    undo: [],
    tool: { type: "ground", ground: GROUND[1] },
    brush: 22,
    size: 1,
    stroke: null,
    hover: null,
    pausedGame: false,
    view: null
  };

  /* ---------- the screen ---------- */
  const button = document.createElement("button");
  button.type = "button";
  button.className = "chip-btn room-editor-btn";
  button.textContent = "Edit rooms";

  const dialog = document.createElement("dialog");
  dialog.className = "room-editor";
  dialog.setAttribute("aria-label", "Room editor");
  dialog.innerHTML = `
    <header class="re-top">
      <h2>Room editor</h2>
      <select class="re-room" aria-label="Room to edit"></select>
      <span class="re-sync" role="status"></span>
      <div class="re-actions">
        <button type="button" class="chip-btn" data-act="undo">Undo</button>
        <button type="button" class="chip-btn" data-act="empty">Empty room</button>
        <button type="button" class="chip-btn" data-act="reset">Start over</button>
        <button type="button" class="chip-btn re-done" data-act="done">Done</button>
      </div>
    </header>
    <div class="re-body">
      <aside class="re-tools">
        <section>
          <h3>Ground</h3>
          <div class="re-ground"></div>
          <div class="re-row"><span>Brush</span><span class="re-brush"></span></div>
        </section>
        <section>
          <h3>Tools</h3>
          <div class="re-row">
            <button type="button" class="re-tool" data-tool="bridge">Bridge</button>
            <button type="button" class="re-tool" data-tool="remove">Remove</button>
          </div>
        </section>
        <section>
          <h3>Things</h3>
          <div class="re-row"><span>Size</span><span class="re-size"></span></div>
          <p class="re-label">From this world</p>
          <div class="re-props" data-group="here"></div>
          <p class="re-label">From other worlds</p>
          <div class="re-props" data-group="other"></div>
        </section>
      </aside>
      <div class="re-stage">
        <canvas class="re-canvas" width="${W}" height="${H}"></canvas>
        <p class="re-hint" role="status"></p>
      </div>
    </div>
  `;
  const $ = (sel) => dialog.querySelector(sel);
  const canvas = $(".re-canvas");
  const g = canvas.getContext("2d");
  const roomSelect = $(".re-room");
  const hint = $(".re-hint");
  const view = document.createElement("canvas");
  view.width = W;
  view.height = H;
  ed.view = view;

  function say(text) {
    hint.textContent = text;
  }

  /* ---------- tools ---------- */
  function pickTool(tool) {
    ed.tool = tool;
    for (const el of dialog.querySelectorAll("[data-pick]")) el.classList.remove("on");
    const on = tool.type === "ground" ? tool.ground.el : tool.type === "prop" ? tool.tpl.el : $(`[data-tool="${tool.type}"]`);
    if (on) on.classList.add("on");
    if (tool.type === "ground") say(`${tool.ground.name}: click and drag to paint. ${tool.ground.hint}`);
    if (tool.type === "prop") say(`${propName(tool.tpl)}: click to put one down. The dotted places stay clear.`);
    if (tool.type === "bridge") say("Bridge: click on water, lava or a hole to build a bridge across it, left to right.");
    if (tool.type === "remove") say("Remove: click a tree, rock or bridge to take it away.");
    draw();
  }

  for (const ground of GROUND) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "re-swatch";
    el.dataset.pick = "";
    el.style.setProperty("--c", ground.color);
    el.textContent = ground.name;
    el.addEventListener("click", () => pickTool({ type: "ground", ground }));
    ground.el = el;
    $(".re-ground").appendChild(el);
  }
  for (const el of dialog.querySelectorAll("[data-tool]")) {
    el.dataset.pick = "";
    el.addEventListener("click", () => pickTool({ type: el.dataset.tool }));
  }
  function choice(holder, options, current, set) {
    for (const [label, value] of options) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "re-choice" + (value === current ? " on" : "");
      el.textContent = label;
      el.addEventListener("click", () => {
        for (const other of holder.children) other.classList.remove("on");
        el.classList.add("on");
        set(value);
        draw();
      });
      holder.appendChild(el);
    }
  }
  choice($(".re-brush"), BRUSHES, ed.brush, (v) => { ed.brush = v; });
  choice($(".re-size"), SIZES, ed.size, (v) => { ed.size = v; });

  // Prop buttons, with pictures drawn a few at a time so the editor opens quickly.
  let propsFor = -1;
  function fillProps() {
    const bi = biomes.indexOf(ed.room.biome);
    if (propsFor === bi) return;
    propsFor = bi;
    const here = $('[data-group="here"]'), other = $('[data-group="other"]');
    here.textContent = "";
    other.textContent = "";
    const list = api.templates(ed.room);
    const queue = [];
    for (const tpl of list) {
      if (!tpl.el) {
        tpl.el = document.createElement("button");
        tpl.el.type = "button";
        tpl.el.className = "re-prop";
        tpl.el.dataset.pick = "";
        tpl.el.title = propName(tpl);
        tpl.el.setAttribute("aria-label", propName(tpl));
        tpl.el.addEventListener("click", () => pickTool({ type: "prop", tpl }));
        queue.push(tpl);
      }
      (tpl.biome === bi ? here : other).appendChild(tpl.el);
    }
    const next = () => {
      for (const tpl of queue.splice(0, 6)) {
        tpl.icon = api.icon(tpl);
        if (!tpl.icon) continue;
        const pic = document.createElement("canvas");
        const s = Math.min(1, 48 / Math.max(tpl.icon.img.width, tpl.icon.img.height));
        pic.width = Math.max(2, Math.round(tpl.icon.img.width * s));
        pic.height = Math.max(2, Math.round(tpl.icon.img.height * s));
        const pg = pic.getContext("2d");
        pg.imageSmoothingEnabled = false;
        pg.drawImage(tpl.icon.img, 0, 0, pic.width, pic.height);
        tpl.el.appendChild(pic);
      }
      if (queue.length) requestAnimationFrame(next);
    };
    next();
  }

  /* ---------- rooms ---------- */
  function fillRooms() {
    roomSelect.textContent = "";
    worlds.forEach((world, row) => {
      const group = document.createElement("optgroup");
      group.label = `World ${row + 1}: ${world.name}`;
      for (let col = 0; col < ROOM_COLS; col += 1) {
        const room = rooms[row * ROOM_COLS + col];
        if (!api.editable(room)) continue;
        const option = document.createElement("option");
        option.value = room.index;
        option.textContent = `Room ${col + 1}: ${room.biome.name}${api.edited(room) ? " (changed)" : ""}`;
        group.appendChild(option);
      }
      roomSelect.appendChild(group);
    });
    roomSelect.value = ed.room.index;
  }
  function loadRoom(room) {
    ed.room = room;
    ed.plan = api.plan(room);
    ed.undo = [];
    fillRooms();
    fillProps();
    refresh();
  }
  roomSelect.addEventListener("change", () => loadRoom(rooms[Number(roomSelect.value)]));

  // Repaint the room picture from the game's own painter.
  function refresh() {
    view.getContext("2d").drawImage(api.render(ed.room), 0, 0);
    $('[data-act="undo"]').disabled = !ed.undo.length;
    draw();
  }
  function commit() {
    queueSync(ed.room.index, api.save(ed.room, ed.plan));
    const option = roomSelect.querySelector(`option[value="${ed.room.index}"]`);
    if (option && !option.textContent.endsWith("(changed)")) option.textContent += " (changed)";
    refresh();
  }
  const remember = () => {
    ed.undo.push(api.copy(ed.plan));
    if (ed.undo.length > 40) ed.undo.shift();
  };

  /* ---------- drawing the editor view ---------- */
  function draw() {
    if (!ed.room) return;
    g.drawImage(view, 0, 0);
    const t = ed.tool;
    // Doorways and the campfire stay clear: show them while painting or placing.
    if (t.type === "prop" || (t.type === "ground" && t.ground.kind !== G.FLOOR)) {
      g.save();
      g.fillStyle = "rgba(255, 255, 255, 0.12)";
      g.strokeStyle = "rgba(255, 255, 255, 0.45)";
      g.setLineDash([6, 6]);
      g.lineWidth = 2;
      for (const z of api.clearZones(ed.room)) {
        g.beginPath();
        if (z.r) g.arc(z.x, z.y, z.r, 0, Math.PI * 2);
        else g.rect(Math.max(z.x0, 2), z.y0, Math.min(z.x1, W - 2) - Math.max(z.x0, 2), z.y1 - z.y0);
        g.fill();
        g.stroke();
      }
      g.restore();
    }
    if (ed.stroke) g.drawImage(ed.stroke, 0, 0);
    const h = ed.hover;
    if (!h) return;
    if (t.type === "ground") {
      g.strokeStyle = "#ffffff";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(h.x, h.y, ed.brush, 0, Math.PI * 2);
      g.stroke();
    } else if (t.type === "prop" && t.tpl.icon) {
      const ok = api.fits(ed.room, t.tpl, ed.size, h.x, h.y);
      const { img, baseX, baseY } = t.tpl.icon;
      const s = ed.size;
      g.globalAlpha = 0.7;
      g.imageSmoothingEnabled = false;
      g.drawImage(img, h.x - baseX * s, h.y - baseY * s, img.width * s, img.height * s);
      g.globalAlpha = 1;
      g.fillStyle = ok ? "#7bd35a" : "#ff4a3a";
      g.fillRect(h.x - 5, h.y - 2, 10, 4);
    } else if (t.type === "remove") {
      const hit = api.hit(ed.plan, ed.room, h.x, h.y);
      if (hit) {
        g.strokeStyle = "#ff4a3a";
        g.lineWidth = 3;
        g.strokeRect(...hit.box);
      }
    } else if (t.type === "bridge") {
      g.fillStyle = "#f6c85f";
      g.fillRect(h.x - 30, h.y - 2, 60, 4);
    }
  }

  /* ---------- mouse and touch ---------- */
  function toRoom(event) {
    const r = canvas.getBoundingClientRect();
    return { x: ((event.clientX - r.left) / r.width) * W, y: ((event.clientY - r.top) / r.height) * H };
  }
  function strokeTo(p) {
    const from = ed.stroke.last || p;
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - from.x, p.y - from.y) / (ed.brush / 2)));
    const sg = ed.stroke.getContext("2d");
    sg.fillStyle = ed.tool.ground.color;
    for (let i = 1; i <= steps; i += 1) {
      const x = from.x + ((p.x - from.x) * i) / steps, y = from.y + ((p.y - from.y) * i) / steps;
      if (api.paint(ed.plan, ed.room, x, y, ed.brush, ed.tool.ground.kind)) ed.stroke.changed = true;
      sg.beginPath();
      sg.arc(x, y, ed.brush, 0, Math.PI * 2);
      sg.fill();
    }
    ed.stroke.last = p;
  }
  const TOOLS = {
    ground: {
      down(p) {
        remember();
        ed.stroke = document.createElement("canvas");
        ed.stroke.width = W;
        ed.stroke.height = H;
        const sg = ed.stroke.getContext("2d");
        sg.globalAlpha = 0.75;
        sg.beginPath();
        sg.rect(T, T, W - 2 * T, H - 2 * T);
        sg.clip();
        strokeTo(p);
      },
      move(p) {
        if (ed.stroke) strokeTo(p);
      },
      up() {
        if (!ed.stroke) return;
        const changed = ed.stroke.changed;
        ed.stroke = null;
        if (changed) commit();
        else {
          ed.undo.pop();
          draw();
        }
      }
    },
    prop: {
      down(p) {
        remember();
        if (api.addProp(ed.plan, ed.room, ed.tool.tpl, ed.size, p.x, p.y)) commit();
        else {
          ed.undo.pop();
          say("Not there! Keep the doorways and the campfire clear, and stay inside the walls.");
        }
      }
    },
    bridge: {
      down(p) {
        remember();
        const result = api.addBridge(ed.plan, p.x, p.y);
        if (result === "ok") return commit();
        ed.undo.pop();
        say(result === "too-wide" ? "That's too wide for a bridge. Try a narrower spot." : "Click on water, lava or a hole to build a bridge across it.");
      }
    },
    remove: {
      down(p) {
        const hit = api.hit(ed.plan, ed.room, p.x, p.y);
        if (!hit) return;
        remember();
        api.remove(ed.plan, hit);
        commit();
      }
    }
  };
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button > 0) return;
    canvas.setPointerCapture(event.pointerId);
    ed.hover = toRoom(event);
    TOOLS[ed.tool.type].down(ed.hover);
    draw();
  });
  canvas.addEventListener("pointermove", (event) => {
    ed.hover = toRoom(event);
    if (canvas.hasPointerCapture(event.pointerId) && TOOLS[ed.tool.type].move) TOOLS[ed.tool.type].move(ed.hover);
    draw();
  });
  const lift = (event) => {
    if (TOOLS[ed.tool.type].up) TOOLS[ed.tool.type].up(toRoom(event));
  };
  canvas.addEventListener("pointerup", lift);
  canvas.addEventListener("pointercancel", lift);
  canvas.addEventListener("pointerleave", () => {
    ed.hover = null;
    draw();
  });

  /* ---------- buttons ---------- */
  const ACTIONS = {
    undo() {
      if (!ed.undo.length) return;
      ed.plan = ed.undo.pop();
      commit();
    },
    empty() {
      remember();
      ed.plan.grid.fill(G.FLOOR);
      ed.plan.props = [];
      ed.plan.bridges = [];
      commit();
      say("Empty room! Now paint and build whatever you like.");
    },
    reset() {
      remember();
      api.reset(ed.room);
      queueSync(ed.room.index, null);
      ed.plan = api.plan(ed.room);
      const option = roomSelect.querySelector(`option[value="${ed.room.index}"]`);
      if (option) option.textContent = option.textContent.replace(" (changed)", "");
      refresh();
      say("The room is back the way it was. Undo brings your changes back.");
    },
    done() {
      dialog.close();
    }
  };
  for (const el of dialog.querySelectorAll("[data-act]")) el.addEventListener("click", () => ACTIONS[el.dataset.act]());

  // Keys typed in the editor must not move the wizard. Key-up still reaches the
  // game, so a key held while the editor opened doesn't stay pressed.
  for (const type of ["keydown", "keypress"]) dialog.addEventListener(type, (event) => event.stopPropagation());
  dialog.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && event.target.tagName !== "TEXTAREA") {
      event.preventDefault();
      ACTIONS.undo();
    }
  });

  /* ---------- open and close ---------- */
  const state = () => window.blockDungeon.state;
  function open() {
    button.blur();
    ed.pausedGame = state().mode === "playing";
    if (ed.pausedGame) document.getElementById("pauseBtn").click();
    const here = currentRoom();
    dialog.showModal();
    loadRoom(api.editable(here) ? here : rooms[0]);
    pickTool(ed.tool);
  }
  dialog.addEventListener("close", () => {
    sendSync();
    ed.stroke = null;
    ed.hover = null;
    if (ed.pausedGame && state().mode === "paused") document.getElementById("pauseBtn").click();
  });
  button.addEventListener("click", open);

  /* ---------- sharing rooms through the game server ---------- */
  const KEY_STORE = "spellblock-feedback-key";
  const syncLabel = $(".re-sync");
  const pending = {};
  let sending = false;
  let timer = 0;
  const readKey = () => {
    try {
      return localStorage.getItem(KEY_STORE) || "";
    } catch {
      return "";
    }
  };
  const writeKey = (key) => {
    try {
      if (key) localStorage.setItem(KEY_STORE, key);
      else localStorage.removeItem(KEY_STORE);
    } catch {
      /* Storage blocked: the key lasts until the page closes. */
    }
  };
  let adminKey = readKey();

  function showSync(text, tone = "") {
    syncLabel.textContent = text;
    syncLabel.dataset.tone = tone;
  }
  // Changes go to the server a moment after the last one, all rooms at once.
  function queueSync(index, encoded) {
    pending[index] = encoded;
    showSync("Saving...");
    clearTimeout(timer);
    timer = setTimeout(sendSync, 1200);
  }
  async function sendSync() {
    clearTimeout(timer);
    if (sending || !Object.keys(pending).length) return;
    sending = true;
    const rooms = { ...pending };
    for (const index of Object.keys(rooms)) delete pending[index];
    try {
      const res = await fetch("api/rooms", {
        method: "PUT",
        keepalive: JSON.stringify(rooms).length < 60000,
        headers: { "content-type": "application/json", authorization: `Bearer ${adminKey}` },
        body: JSON.stringify({ rooms })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `The server said ${res.status}.`);
      showSync("Saved for everyone", "ok");
    } catch (err) {
      // Keep them for the next try, unless newer changes to the same room came in meanwhile.
      for (const [index, plan] of Object.entries(rooms)) if (!(index in pending)) pending[index] = plan;
      showSync(`Not saved yet: ${err.message || "no internet?"} It tries again with your next change.`, "error");
    } finally {
      sending = false;
      if (Object.keys(pending).length && syncLabel.dataset.tone !== "error") timer = setTimeout(sendSync, 1200);
    }
  }
  addEventListener("pagehide", sendSync);

  // Everyone loads the shared rooms; the admin also gets the Edit rooms button.
  async function start() {
    const ask = new URLSearchParams(location.search).get("admin");
    if (ask === "off") writeKey((adminKey = ""));
    else if (ask !== null && !adminKey) adminKey = (prompt("Admin key for the room editor:") || "").trim();
    let data = null;
    try {
      const res = await fetch("api/rooms", { cache: "no-store", headers: adminKey ? { authorization: `Bearer ${adminKey}` } : {} });
      if (res.ok) data = await res.json();
    } catch {
      /* Offline or opened as a file: play the normal rooms. */
    }
    if (data && data.rooms) api.loadShared(data.rooms);
    if (!adminKey) return;
    if (data && data.admin) {
      writeKey(adminKey);
      document.body.appendChild(dialog);
      const row = document.querySelector(".stat-row");
      const pause = document.getElementById("pauseBtn");
      if (row && pause) row.insertBefore(button, pause.nextSibling);
      else document.body.appendChild(button);
    } else if (data && ask !== null) {
      writeKey("");
      alert("That admin key didn't work.");
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
