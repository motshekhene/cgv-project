export function createLevel2Hud() {
  const root = document.createElement('div');
  root.id = 'level2-hud';
  root.style.cssText = "font-family:'Segoe UI',system-ui,sans-serif;pointer-events:none";

  const panel = `position:fixed;border-radius:6px;background:rgba(5,10,15,.55);backdrop-filter:blur(4px);pointer-events:none;`;
  root.innerHTML = `
    <div style="${panel}top:16px;left:16px;padding:12px 16px;border:1px solid rgba(120,200,255,.25);color:#d7e2ea;font-size:13px;line-height:1.6">
      <div><b style="color:#7fd8ff">Speed:</b> <span data-key="speed">0</span></div>
      <div><b style="color:#7fd8ff">Distance to Handler:</b> <span data-key="distance">0</span> m</div>
      <div><b style="color:#7fd8ff">Heat:</b> <span data-key="heat">0</span>%</div>
      <div><b style="color:#7fd8ff">Health:</b> <span data-key="health">100</span></div>
    </div>
    <div class="handler" style="${panel}top:16px;right:16px;padding:10px 16px;border:1px solid rgba(255,150,80,.3);color:#ffb37a;font-size:13px;font-weight:600;letter-spacing:.5px">
      HANDLER: <span data-key="state">APPROACH</span>
    </div>
    <div style="${panel}bottom:16px;left:16px;padding:8px 12px;color:#8fa3b0;font-size:12px">W/S accelerate/brake · A/D steer · Shift boost · V change car</div>`;
  document.body.appendChild(root);

  const get = (key) => root.querySelector(`[data-key="${key}"]`);
  const speed = get('speed');
  const distance = get('distance');
  const heat = get('heat');
  const health = get('health');
  const state = get('state');
  const handler = root.querySelector('.handler');

  return {
    setVisible(visible) {
      root.style.display = visible ? '' : 'none';
    },
    update({ speed: currentSpeed, dist, heat: currentHeat, health: currentHealth, handlerState }) {
      speed.textContent = Math.round(Math.abs(currentSpeed) * 3.6);
      distance.textContent = dist.toFixed(1);
      heat.textContent = Math.round(currentHeat);
      health.textContent = Math.round(currentHealth);
      state.textContent = handlerState;
      handler.style.color = handlerState === 'TELEGRAPH' ? '#ff5555' : '#ffb37a';
    },
  };
}
