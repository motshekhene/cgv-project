import { THEME_CSS } from '../../ui/theme.js';

/**
 * Level 2 HUD — Member 2A
 *
 * Now in the team's Jungle Shrine look (src/ui/theme.js, from Level 3): dark
 * moss-stone plaques with a gold hairline, parchment text, a carved serif for
 * names. Same three-column top bar as Level 3's FightHUD:
 *
 *   left    KAI · car name — health (ember, with the pale "lag" bar that
 *           shows what a hit just cost), heat underneath, speed; the plaque
 *           widens as shrine hearts raise max health; active rewards below
 *   middle  THE RIVER ROAD — how far to the falls
 *   right   THE MARSHAL — what he's doing, how close he is
 *
 * Lives in #hud and removes itself (and its <style>) on destroy().
 */
const CSS = THEME_CSS + `
.l2h { position:fixed; inset:0; pointer-events:none; font-family:var(--sans); color:var(--ink); user-select:none; z-index:12; }
.l2h * { box-sizing:border-box; }
.l2h-top { position:absolute; top:12px; left:12px; right:12px; display:grid; column-gap:14px; align-items:start;
  grid-template-columns:minmax(170px, 1fr) minmax(220px, 420px) minmax(170px, 1fr); }
.l2h-name { display:flex; align-items:center; justify-content:space-between; gap:10px; height:14px; margin-bottom:4px; white-space:nowrap;
  font-family:var(--serif); font-weight:700; font-size:10px; letter-spacing:.3em; color:var(--gold); text-shadow:0 1px 0 #000; }
.l2h-name em { font-style:normal; font-family:var(--sans); font-weight:600; font-size:9px; letter-spacing:.18em; color:var(--ink-dim); }
.l2h-bar { position:relative; height:7px; background:rgba(0,0,0,.6); border-radius:2px; overflow:hidden;
  box-shadow:inset 0 1px 2px rgba(0,0,0,.8), 0 0 0 1px rgba(0,0,0,.7); }
.l2h-bar.thin { height:3px; margin-top:4px; }
.l2h-bar > div { position:absolute; left:0; top:0; bottom:0; width:100%; }
.l2h-lag { background:#f3dfae; opacity:.85; transition:width .7s cubic-bezier(.3,0,.2,1) .35s; }
.l2h-hp { background:linear-gradient(180deg, rgba(255,255,255,.3), transparent 60%), linear-gradient(90deg, var(--ember), var(--ember-hi)); transition:width .1s linear; }
.l2h-heat { background:linear-gradient(90deg, var(--moss), var(--moss-hi)); transition:width .1s linear; }
.l2h-heat.hot { background:linear-gradient(90deg, var(--ember), var(--ember-hi)); }
.l2h-route-fill { background:linear-gradient(180deg, rgba(255,255,255,.25), transparent 60%), linear-gradient(90deg, var(--gold-dim), var(--gold)); transition:width .2s linear; }

.l2h-player { position:relative; grid-column:1; justify-self:start; width:calc(200px * var(--hpw, 1)); max-width:100%; padding:5px 11px 7px;
  transition:width .9s cubic-bezier(.2,.8,.2,1), border-color .3s; }
.l2h-player.low { border-color:rgba(242,147,79,.75); }
.l2h-player.low .l2h-hp { animation:l2hLow .8s ease-in-out infinite; }
.l2h-row { display:flex; justify-content:space-between; align-items:baseline; margin-top:5px; font-size:9px; letter-spacing:.2em; color:var(--ink-dim); }
.l2h-speed { font-family:var(--serif); font-weight:700; font-size:20px; letter-spacing:.04em; color:var(--ink); text-shadow:0 1px 0 #000; }
.l2h-speed small { font-family:var(--sans); font-size:9px; letter-spacing:.2em; color:var(--ink-dim); margin-left:4px; }
.l2h-buffs { display:flex; gap:6px; margin-top:6px; min-height:0; }
.l2h-buffs span { position:relative; padding:2px 8px 3px; font-size:9px; font-weight:700; letter-spacing:.18em; color:var(--c);
  border:1px solid var(--c); border-radius:2px; background:rgba(0,0,0,.45); text-shadow:0 0 6px var(--c); }

.l2h-route { position:relative; grid-column:2; padding:5px 12px 7px; }
.l2h-route .l2h-name { color:var(--ink); justify-content:space-between; }
.l2h-route b { color:var(--key); font-family:var(--sans); font-size:9px; letter-spacing:.2em; }
.l2h-route .l2h-pip { position:absolute; top:-2px; bottom:-2px; width:2px; background:rgba(0,0,0,.7); }

.l2h-handler { position:relative; grid-column:3; justify-self:end; min-width:190px; padding:5px 12px 7px; transition:border-color .2s; }
.l2h-handler .l2h-name { color:var(--ink); }
.l2h-state { font-size:10px; font-weight:700; letter-spacing:.22em; color:var(--ember-hi); white-space:nowrap; }
.l2h-handler.attack { border-color:rgba(242,147,79,.85); box-shadow:0 0 18px rgba(201,68,43,.45); }
.l2h-handler.attack .l2h-state { color:#ff7a5c; }
.l2h-handler.calm .l2h-state { color:var(--moss-hi); }

.l2h-keys { position:absolute; left:50%; bottom:8px; transform:translateX(-50%); padding:4px 14px 5px; font-size:9px; letter-spacing:.18em;
  color:var(--ink-dim); white-space:nowrap; }
.l2h-keys b { color:var(--gold); font-weight:700; }

@media (max-width: 760px) {
  .l2h-top { grid-template-columns:1fr 1fr; row-gap:8px; }
  .l2h-route { grid-column:1 / span 2; grid-row:2; }
  .l2h-handler { grid-column:2; }
  .l2h-keys { display:none; }
}
@keyframes l2hLow { 50% { filter:brightness(1.6); } }
`;

export function createLevel2Hud() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const parent = document.getElementById('hud') || document.body;
  const root = document.createElement('div');
  root.id = 'level2-hud';
  root.className = 'l2h fh';         // .fh: picks up the theme's colour variables
  root.innerHTML = `
    <div class="l2h-top">
      <div class="l2h-player plaque">
        <div class="l2h-name">KAI <em data-k="car"></em></div>
        <div class="l2h-bar"><div class="l2h-lag" data-k="lag"></div><div class="l2h-hp" data-k="hp"></div></div>
        <div class="l2h-bar thin"><div class="l2h-heat" data-k="heat"></div></div>
        <div class="l2h-row"><span class="l2h-speed"><span data-k="speed">0</span><small>KM/H</small></span><span data-k="hpText">100 / 100</span></div>
        <div class="l2h-buffs" data-k="buffs"></div>
      </div>
      <div class="l2h-route plaque">
        <div class="l2h-name"><span>THE RIVER ROAD</span><b data-k="left">4.1 KM TO THE FALLS</b></div>
        <div class="l2h-bar"><div class="l2h-route-fill" data-k="route"></div>
          <i class="l2h-pip" style="left:25%"></i><i class="l2h-pip" style="left:50%"></i><i class="l2h-pip" style="left:75%"></i></div>
      </div>
      <div class="l2h-handler plaque">
        <div class="l2h-name"><span>THE MARSHAL</span><em data-k="dist">— m</em></div>
        <div class="l2h-state" data-k="state">APPROACH</div>
      </div>
    </div>
    <div class="l2h-keys plaque"><b>W/S</b> drive · <b>A/D</b> steer · <b>SPACE</b> drift · <b>SHIFT</b> boost · <b>V</b> car · <b>M</b> mute · <b>N</b> music</div>`;
  parent.appendChild(root);

  const q = (k) => root.querySelector(`[data-k="${k}"]`);
  const els = {
    car: q('car'), lag: q('lag'), hp: q('hp'), heat: q('heat'), speed: q('speed'), hpText: q('hpText'),
    buffs: q('buffs'), left: q('left'), route: q('route'), dist: q('dist'), state: q('state'),
  };
  const player = root.querySelector('.l2h-player');
  const handlerBox = root.querySelector('.l2h-handler');
  let lastBuffs = '';

  return {
    setVisible(v) { root.style.display = v ? '' : 'none'; },
    setCar(name) { els.car.textContent = name ? `· ${name.toUpperCase()}` : ''; },
    update({ speed, dist, heat, health, handlerState, maxHeat = 100, maxHealth = 100, overheated = false,
      toEnd = null, progress = 0, buffs = [] }) {
      const hp = clamp01(health / maxHealth) * 100;
      els.hp.style.width = hp + '%';
      els.lag.style.width = hp + '%';
      els.hpText.textContent = `${Math.ceil(health)} / ${maxHealth}`;
      player.classList.toggle('low', hp < 30);
      player.style.setProperty('--hpw', String(Math.min(1.5, maxHealth / 100)));

      const h = clamp01(heat / maxHeat) * 100;
      els.heat.style.width = h + '%';
      els.heat.classList.toggle('hot', h > 85 || overheated);

      els.speed.textContent = Math.round(Math.abs(speed) * 3.6);

      if (toEnd !== null) {
        els.left.textContent = toEnd > 1000 ? `${(toEnd / 1000).toFixed(1)} KM TO THE FALLS`
          : toEnd > 1 ? `${Math.round(toEnd)} M TO THE FALLS` : 'THE FALLS';
        els.route.style.width = (clamp01(progress) * 100) + '%';
      }

      els.dist.textContent = `${Math.round(dist)} m`;
      els.state.textContent = handlerState;
      const attacking = /!|SLAM|PIT|SHUNT|PIN|TYRE|DRONE|TAILGATING/.test(handlerState);
      handlerBox.classList.toggle('attack', attacking);
      handlerBox.classList.toggle('calm', /DODGED|FALLING BACK/.test(handlerState));

      const key = buffs.map((b) => b.label + Math.ceil(b.t)).join('|');
      if (key !== lastBuffs) {
        lastBuffs = key;
        els.buffs.innerHTML = buffs.map((b) => `<span style="--c:${b.color}">${b.label} ${Math.ceil(b.t)}</span>`).join('');
      }
    },
    destroy() { root.remove(); style.remove(); },
  };
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
