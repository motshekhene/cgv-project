/**
 * Level 2 HUD — Member 2A
 *
 * Speed, distance to the Handler, heat and health, plus the Handler's state.
 * Health, heat and speed are drawn as bars — a number alone doesn't read at
 * a glance mid-chase, and a bar's colour doing the "you're in trouble"
 * signalling means the player doesn't have to read text while driving.
 * Lives in #hud (index.html) and removes itself on teardown.
 */
function bar(label, id, fillColor) {
  return `
    <div class="row" style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;font-size:12px;color:#9fb4c2;margin-bottom:3px">
        <span>${label}</span><span data-k="${id}Text">0</span>
      </div>
      <div style="width:190px;height:9px;border-radius:5px;background:rgba(255,255,255,0.08);
        border:1px solid rgba(255,255,255,0.12);overflow:hidden">
        <div data-k="${id}Fill" style="height:100%;width:0%;background:${fillColor};
          border-radius:5px;transition:width 0.12s linear, background-color 0.2s linear"></div>
      </div>
    </div>`;
}

export function createLevel2Hud() {
  const parent = document.getElementById('hud') || document.body;
  const root = document.createElement('div');
  root.id = 'level2-hud';
  root.style.cssText = `font-family:'Segoe UI',system-ui,sans-serif;pointer-events:none;`;

  const box = `background:rgba(5,10,15,0.55);border-radius:6px;position:fixed;
    backdrop-filter:blur(4px);pointer-events:none;`;
  root.innerHTML = `
    <div class="stats" style="${box}top:16px;left:16px;color:#d7e2ea;padding:12px 16px;
      border:1px solid rgba(120,200,255,0.25);font-size:13px">
      ${bar('HEALTH', 'health', '#3ddc6a')}
      ${bar('HEAT', 'heat', '#7fd8ff')}
      ${bar('SPEED', 'speed', '#ffd166')}
      <div style="margin-top:2px"><b style="color:#7fd8ff">Distance to Handler:</b> <span data-k="dist">0</span> m</div>
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
  const els = {
    healthFill: q('healthFill'), healthText: q('healthText'),
    heatFill: q('heatFill'), heatText: q('heatText'),
    speedFill: q('speedFill'), speedText: q('speedText'),
    dist: q('dist'), state: q('state'),
  };
  const handlerBox = root.querySelector('.handler');

  return {
    setVisible(v) { root.style.display = v ? '' : 'none'; },
    update({ speed, dist, heat, health, handlerState, maxHeat = 100, maxHealth = 100, maxSpeed = 42 }) {
      const hPct = THREE_clamp01(health / maxHealth) * 100;
      els.healthFill.style.width = hPct + '%';
      els.healthFill.style.background = hPct > 50 ? '#3ddc6a' : hPct > 20 ? '#ffb020' : '#ff3b3b';
      els.healthText.textContent = Math.round(health);

      const heatPct = THREE_clamp01(heat / maxHeat) * 100;
      els.heatFill.style.width = heatPct + '%';
      els.heatFill.style.background = heatPct > 85 ? '#ff5c33' : '#7fd8ff';
      els.heatText.textContent = Math.round(heatPct) + '%';

      const speedKmh = Math.abs(speed) * 3.6;
      const speedPct = THREE_clamp01(Math.abs(speed) / maxSpeed) * 100;
      els.speedFill.style.width = speedPct + '%';
      els.speedText.textContent = Math.round(speedKmh) + ' km/h';

      els.dist.textContent = dist.toFixed(1);
      els.state.textContent = handlerState;
      handlerBox.style.color = handlerState === 'TELEGRAPH' ? '#ff5555' : '#ffb37a';
    },
    destroy() { root.remove(); },
  };
}

function THREE_clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
