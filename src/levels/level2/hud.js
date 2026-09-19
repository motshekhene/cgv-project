/**
 * Level 2 HUD — Member 2A
 *
 * Same panels as the standalone level2.html (speed, distance to the Handler,
 * heat, health, Handler state), built in code so they work inside the shared
 * engine too. Lives in #hud (index.html) and removes itself on teardown.
 */
export function createLevel2Hud() {
  const parent = document.getElementById('hud') || document.body;
  const root = document.createElement('div');
  root.id = 'level2-hud';
  root.style.cssText = `font-family:'Segoe UI',system-ui,sans-serif;pointer-events:none;`;

  const box = `background:rgba(5,10,15,0.55);border-radius:6px;position:fixed;
    backdrop-filter:blur(4px);pointer-events:none;`;
  root.innerHTML = `
    <div class="stats" style="${box}top:16px;left:16px;color:#d7e2ea;padding:12px 16px;
      border:1px solid rgba(120,200,255,0.25);font-size:13px;line-height:1.6">
      <div><b style="color:#7fd8ff">Speed:</b> <span data-k="speed">0</span></div>
      <div><b style="color:#7fd8ff">Distance to Handler:</b> <span data-k="dist">0</span> m</div>
      <div><b style="color:#7fd8ff">Heat:</b> <span data-k="heat">0</span>%</div>
      <div><b style="color:#7fd8ff">Health:</b> <span data-k="health">100</span></div>
    </div>
    <div class="handler" style="${box}top:16px;right:16px;color:#ffb37a;padding:10px 16px;
      border:1px solid rgba(255,150,80,0.3);font-size:13px;font-weight:600;letter-spacing:0.5px">
      HANDLER: <span data-k="state">APPROACH</span>
    </div>
    <div class="controls" style="${box}bottom:16px;left:16px;color:#8fa3b0;padding:8px 12px;font-size:12px">
      W/S accelerate/brake · A/D steer · SHIFT boost · V change car
    </div>`;
  parent.appendChild(root);

  const q = (k) => root.querySelector(`[data-k="${k}"]`);
  const speedEl = q('speed'), distEl = q('dist'), heatEl = q('heat');
  const healthEl = q('health'), stateEl = q('state');
  const handlerBox = root.querySelector('.handler');

  return {
    setVisible(v) { root.style.display = v ? '' : 'none'; },
    update({ speed, dist, heat, health, handlerState }) {
      speedEl.textContent = Math.round(Math.abs(speed) * 3.6);
      distEl.textContent = dist.toFixed(1);
      heatEl.textContent = Math.round(heat);
      healthEl.textContent = Math.round(health);
      stateEl.textContent = handlerState;
      handlerBox.style.color = handlerState === 'TELEGRAPH' ? '#ff5555' : '#ffb37a';
    },
    destroy() { root.remove(); },
  };
}
