// Feedback button: lets players send ideas, bug reports and requests.
// Lives on its own so it never has to touch script.js. It adds a "Feedback"
// button next to Pause, opens a small form, and POSTs to /api/feedback
// (see functions/api/feedback.js).
(() => {
  const ENDPOINT = "/api/feedback";
  const DIFFICULTY = ["Easy", "Normal", "Hard"];

  const button = document.createElement("button");
  button.type = "button";
  button.id = "feedbackBtn";
  button.className = "chip-btn feedback-btn";
  button.textContent = "Feedback";
  button.title = "Send an idea or tell us about a bug";

  const dialog = document.createElement("dialog");
  dialog.className = "feedback-dialog";
  dialog.setAttribute("aria-labelledby", "feedbackTitle");
  dialog.innerHTML = `
    <form class="feedback-form" novalidate>
      <h2 id="feedbackTitle">Got an idea?</h2>
      <p class="feedback-sub">Tell us what to add, what to change, or what broke.</p>
      <fieldset class="feedback-kinds">
        <legend>This is</legend>
        <label><input type="radio" name="kind" value="idea" checked><span>An idea</span></label>
        <label><input type="radio" name="kind" value="bug"><span>A bug</span></label>
        <label><input type="radio" name="kind" value="other"><span>Something else</span></label>
      </fieldset>
      <label class="feedback-field">
        <span>Your message</span>
        <textarea name="message" rows="5" maxlength="1000" required
          placeholder="A boss that turns into a giant slime when you hit it..."></textarea>
        <small class="feedback-count" aria-live="polite">0 / 1000</small>
      </label>
      <label class="feedback-field">
        <span>Nickname (optional)</span>
        <input name="nickname" type="text" maxlength="40" autocomplete="off" placeholder="WizardKid">
        <small>Please use a nickname, not your real name.</small>
      </label>
      <label class="feedback-trap" aria-hidden="true">Website <input name="website" type="text" tabindex="-1" autocomplete="off"></label>
      <p class="feedback-status" role="status"></p>
      <div class="feedback-actions">
        <button type="button" class="chip-btn" data-close>Cancel</button>
        <button type="submit" class="chip-btn feedback-send">Send</button>
      </div>
    </form>
  `;

  const form = dialog.querySelector("form");
  const textarea = form.elements.message;
  const counter = dialog.querySelector(".feedback-count");
  const status = dialog.querySelector(".feedback-status");
  const sendBtn = dialog.querySelector(".feedback-send");

  function place() {
    const row = document.querySelector(".stat-row");
    const pause = document.getElementById("pauseBtn");
    if (row && pause) row.insertBefore(button, pause.nextSibling);
    else document.body.appendChild(button);
    document.body.appendChild(dialog);
  }

  // Typing in the form must not move the wizard or cast spells: the game
  // listens for keys on window, so stop them here before they bubble up.
  for (const type of ["keydown", "keyup", "keypress"]) {
    dialog.addEventListener(type, (event) => event.stopPropagation());
  }

  function game() {
    return window.blockDungeon && window.blockDungeon.state;
  }

  function gameContext() {
    const state = game();
    const context = { page: location.pathname };
    if (state) {
      context.screen = state.mode;
      context.room = (state.roomIndex || 0) + 1;
      context.bosses = state.bossesDefeated || 0;
      context.difficulty = DIFFICULTY[state.difficulty] || state.difficulty;
      context.players = state.twoPlayer ? 2 : 1;
    }
    context.touch = matchMedia("(pointer: coarse)").matches;
    context.screenSize = `${innerWidth}x${innerHeight}`;
    return context;
  }

  function setStatus(text, tone = "") {
    status.textContent = text;
    status.dataset.tone = tone;
  }

  function open() {
    // Pause a running game so nothing attacks while you type.
    const state = game();
    if (state && state.mode === "playing") document.getElementById("pauseBtn")?.click();
    if (form.dataset.sent === "yes") {
      form.reset();
      form.dataset.sent = "";
      counter.textContent = "0 / 1000";
    }
    setStatus("");
    sendBtn.disabled = false;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    textarea.focus();
    button.blur();
  }

  function close() {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  textarea.addEventListener("input", () => {
    counter.textContent = `${textarea.value.length} / 1000`;
  });

  dialog.querySelector("[data-close]").addEventListener("click", close);
  // Clicking the dark area around the form closes it too.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = textarea.value.trim();
    if (message.length < 2) {
      setStatus("Write a little more first!", "error");
      textarea.focus();
      return;
    }
    sendBtn.disabled = true;
    setStatus("Sending...");
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: form.elements.kind.value,
          message,
          nickname: form.elements.nickname.value.trim(),
          website: form.elements.website.value,
          context: gameContext()
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "Couldn't send it right now.");
      form.dataset.sent = "yes";
      setStatus("Thank you! Your message was sent.", "ok");
      setTimeout(() => {
        if (form.dataset.sent === "yes" && dialog.open) close();
      }, 1800);
    } catch (error) {
      const offline = error instanceof TypeError;
      setStatus(offline ? "Couldn't reach the server. Try again in a bit." : error.message, "error");
      sendBtn.disabled = false;
    }
  });

  button.addEventListener("click", open);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", place);
  else place();
})();
