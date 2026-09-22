/**
 * Game-over overlay — Member 2A
 *
 * Shown when health hits 0. Freezes gameplay behind it (Level02._gameOver
 * gates update()) and only lets go once the player picks RETRY, CONTINUE or
 * QUIT — there's no dismiss-and-drift-back-into-play path. Same visual
 * language as the car picker (createCarPicker) so the two don't look like
 * they came from different screens. Purely DOM — no scene objects, nothing
 * for teardown to dispose beyond the element and its listeners.
 */
export function createGameOverScreen({
  health, topSpeedKmh, distance, time, onRestart, onContinue, onQuit,
}) {
  const el = document.createElement('div');
  el.id = 'level2-gameover';
  el.style.cssText = `
    position: fixed; inset: 0; z-index: 30; display: flex; align-items: center;
    justify-content: center; background: radial-gradient(ellipse at center, rgba(40,4,4,0.6), rgba(2,2,4,0.92));
    font-family: 'Segoe UI', system-ui, sans-serif; color: #e8eef3;`;

  const row = (label, value) => `
    <div style="display:flex;justify-content:space-between;gap:32px;padding:6px 0;
      border-bottom:1px solid rgba(255,255,255,0.08);font-size:14px">
      <span style="color:#9fb4c2">${label}</span><span style="font-weight:700">${value}</span>
    </div>`;

  const btn = (cls, bg, fg, label, hint) => `
    <button class="${cls}" style="display:block;width:100%;background:${bg};color:${fg};border:0;
      border-radius:7px;padding:15px 28px;font-weight:800;letter-spacing:1.5px;cursor:pointer;
      font-size:15px;margin-top:12px;transition:transform .12s ease, filter .12s ease;">
      ${label}<span style="opacity:.65;font-weight:600;font-size:11px;margin-left:8px">${hint}</span>
    </button>`;

  el.innerHTML = `
    <div style="text-align:center;background:rgba(8,4,6,0.75);border:1px solid rgba(255,80,80,0.4);
      border-radius:12px;padding:40px 44px;min-width:320px;backdrop-filter:blur(8px);
      box-shadow:0 0 70px rgba(255,40,40,0.18)">
      <div style="font-size:12px;letter-spacing:5px;color:#ff8f8f;margin-bottom:8px">REDLINE</div>
      <div style="font-size:42px;font-weight:900;letter-spacing:3px;color:#ff4d4d;margin-bottom:4px;
        text-shadow:0 0 26px rgba(255,60,60,0.55)">GAME OVER</div>
      <div style="font-size:13px;letter-spacing:1.5px;color:#ffb3b3;margin-bottom:22px">
        PURSUIT LOST — THE CAR IS DESTROYED</div>
      <div style="text-align:left;margin-bottom:6px">
        ${row('Health', Math.round(health))}
        ${row('Top speed', Math.round(topSpeedKmh) + ' km/h')}
        ${row('Distance covered', Math.round(distance) + ' m')}
        ${row('Time survived', time.toFixed(1) + 's')}
      </div>
      ${btn('retry', '#ff4d4d', '#0a0507', 'RETRY', '(R)')}
      ${btn('continue', '#3ddc84', '#062412', 'CONTINUE', '(C)')}
      ${btn('quit', '#3a4552', '#e8eef3', 'QUIT', '(Q)')}
    </div>`;

  const retryBtn = el.querySelector('.retry');
  const continueBtn = el.querySelector('.continue');
  const quitBtn = el.querySelector('.quit');

  for (const b of [retryBtn, continueBtn, quitBtn]) {
    b.addEventListener('mouseenter', () => { b.style.transform = 'scale(1.035)'; b.style.filter = 'brightness(1.12)'; });
    b.addEventListener('mouseleave', () => { b.style.transform = 'scale(1)'; b.style.filter = 'none'; });
  }

  retryBtn.addEventListener('click', () => onRestart && onRestart());
  continueBtn.addEventListener('click', () => onContinue && onContinue());
  quitBtn.addEventListener('click', () => onQuit && onQuit());

  // Keyboard shortcuts for CONTINUE/QUIT only. RETRY already has its own
  // global 'r' binding in Game._frame (independent of this overlay existing
  // at all) — adding a second listener for the same key here would fire
  // game.restart() twice off one keypress and race itself. Escape is left
  // out too, since it's already the shared pause key.
  const onKey = (e) => {
    const k = e.key.toLowerCase();
    if (k === 'c') { onContinue && onContinue(); }
    else if (k === 'q') { onQuit && onQuit(); }
  };
  window.addEventListener('keydown', onKey);

  document.body.appendChild(el);
  return { el, destroy: () => { window.removeEventListener('keydown', onKey); el.remove(); } };
}
