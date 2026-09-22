/**
 * Game-over overlay — Member 2A
 *
 * Shown when health hits 0. Same visual language as the car picker
 * (createCarPicker) so the two don't look like they came from different
 * screens. Purely DOM — no scene objects, nothing for teardown to dispose.
 */
export function createGameOverScreen({ health, topSpeedKmh, distance, time, onRestart }) {
  const el = document.createElement('div');
  el.id = 'level2-gameover';
  el.style.cssText = `
    position: fixed; inset: 0; z-index: 30; display: flex; align-items: center;
    justify-content: center; background: radial-gradient(ellipse at center, rgba(40,4,4,0.55), rgba(2,2,4,0.88));
    font-family: 'Segoe UI', system-ui, sans-serif; color: #e8eef3;`;

  const row = (label, value) => `
    <div style="display:flex;justify-content:space-between;gap:32px;padding:6px 0;
      border-bottom:1px solid rgba(255,255,255,0.08);font-size:14px">
      <span style="color:#9fb4c2">${label}</span><span style="font-weight:700">${value}</span>
    </div>`;

  el.innerHTML = `
    <div style="text-align:center;background:rgba(8,4,6,0.7);border:1px solid rgba(255,80,80,0.35);
      border-radius:10px;padding:32px 40px;min-width:280px;backdrop-filter:blur(6px)">
      <div style="font-size:12px;letter-spacing:4px;color:#ff8f8f;margin-bottom:6px">REDLINE</div>
      <div style="font-size:28px;font-weight:800;letter-spacing:2px;color:#ff4d4d;margin-bottom:18px">
        PURSUIT LOST</div>
      <div style="text-align:left;margin-bottom:20px">
        ${row('Health', Math.round(health))}
        ${row('Top speed', Math.round(topSpeedKmh) + ' km/h')}
        ${row('Distance covered', Math.round(distance) + ' m')}
        ${row('Time survived', time.toFixed(1) + 's')}
      </div>
      <button class="retry" style="background:#ff4d4d;color:#0a0507;border:0;border-radius:5px;
        padding:10px 28px;font-weight:700;letter-spacing:1px;cursor:pointer;font-size:14px">
        TRY AGAIN</button>
      <div style="margin-top:10px;font-size:11px;color:#8fa3b0">or press R</div>
    </div>`;

  el.querySelector('.retry').addEventListener('click', () => onRestart && onRestart());
  document.body.appendChild(el);
  return { el, destroy: () => el.remove() };
}
