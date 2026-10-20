// Preview branch only (never ship to main): ?knight jumps straight to the
// Black Keep as soon as a game starts.
(() => {
  if (!new URLSearchParams(location.search).has("knight")) return;
  let done = false;
  const tick = () => {
    if (!done && window.blockDungeon && state.mode === "playing") {
      done = true;
      state.bossesDefeated = 30;
      enterDragonRoom();
    }
    if (!done) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();
