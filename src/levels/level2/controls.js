import { THEME_CSS } from '../../ui/theme.js';

/**
 * On-screen driving controls — Member 2A
 *
 * Click-and-hold buttons for mouse (and touch) players, in the Jungle Shrine
 * look of Level 3's TouchControls (same round stone buttons, gold when held):
 *
 *   left, above the rear-view mirror     ◀ STEER ▶
 *   right, above the minimap             GAS · BRAKE · BOOST · DRIFT
 *   top right, under the Handler plaque  CAR · MUSIC · MUTE
 *
 * Pointer capture means a held button stays held even if the mouse slides
 * off it, and lets go when the button is released anywhere. Level02 ORs
 * `controls.state` into the keyboard input every frame, and calls
 * `controls.reflect(input)` so the buttons also light up for the keys.
 */
const CSS = THEME_CSS + `
.dc { position:fixed; inset:0; pointer-events:none; font-family:var(--sans); color:var(--ink); z-index:14; }
.dc * { touch-action:none; user-select:none; -webkit-user-select:none; box-sizing:border-box; }
.dc-b { position:absolute; pointer-events:auto; border-radius:50%; border:1px solid var(--line); color:var(--ink); font:700 12px var(--sans);
  letter-spacing:.12em; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; cursor:pointer;
  background:radial-gradient(circle at 35% 30%, rgba(60,66,44,.78), rgba(13,17,11,.74)); backdrop-filter:blur(2px);
  box-shadow:0 4px 12px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.08); text-shadow:0 1px 0 #000; transition:transform .08s ease, box-shadow .15s; }
.dc-b:hover { border-color:var(--gold); box-shadow:0 4px 12px rgba(0,0,0,.45), 0 0 14px rgba(227,187,98,.35); }
.dc-b i { font-style:normal; font-size:22px; line-height:1; }
.dc-b small { display:block; margin-top:2px; font-size:8px; font-weight:600; color:var(--ink-dim); letter-spacing:.14em; }
.dc-b.on { background:radial-gradient(circle at 35% 30%, #fff1cf, var(--gold) 60%, var(--gold-dim)); color:#21180a; text-shadow:none;
  border-color:#fff1cf; transform:scale(.94); }
.dc-b.on small { color:#3a2c12; }

.dc-steer { position:absolute; left:calc(2% + 4px); bottom:calc(20% + 14px); display:flex; gap:12px; }
.dc-steer .dc-b { position:relative; width:78px; height:78px; }
.dc-pedals { position:absolute; right:calc(2% + 4px); bottom:calc(27% + 14px); width:210px; height:176px; }
.dc-gas   { right:0; bottom:0; width:94px; height:94px; border-color:rgba(188,217,106,.7); }
.dc-brake { right:106px; bottom:4px; width:74px; height:74px; border-color:rgba(242,147,79,.6); }
.dc-boost { right:8px; bottom:106px; width:66px; height:66px; border-color:rgba(111,227,255,.65); color:var(--key); }
.dc-boost.on { background:radial-gradient(circle at 35% 30%, #e6fbff, var(--key) 60%, #2a8fae); color:#062430; }
.dc-drift { right:96px; bottom:92px; width:60px; height:60px; }

.dc-menu { position:absolute; top:84px; right:12px; display:flex; gap:6px; }
.dc-m { position:relative; pointer-events:auto; cursor:pointer; padding:5px 10px 6px; font:700 9px var(--sans); letter-spacing:.2em;
  color:var(--ink); border:1px solid var(--line); border-radius:2px; background:linear-gradient(180deg, var(--stone-hi), var(--stone)); }
.dc-m:hover { border-color:var(--gold); color:var(--gold); }
.dc-m.off { color:var(--ink-dim); text-decoration:line-through; }

@media (max-height: 640px) { .dc-steer, .dc-pedals { zoom:.75; } }
@media (max-width: 760px) { .dc-menu { top:118px; } }
`;

const ACTIONS = ['left', 'right', 'forward', 'backward', 'boost', 'handbrake'];

export class DriveControls {
  constructor({ onCar, onMusic, onMute } = {}) {
    this.state = Object.fromEntries(ACTIONS.map((a) => [a, false]));
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    this.el = document.createElement('div');
    this.el.className = 'dc tc';           // .tc: the theme's colour variables
    this.el.innerHTML = `
      <div class="dc-steer">
        <button class="dc-b" data-a="left"><i>◀</i><small>STEER</small></button>
        <button class="dc-b" data-a="right"><i>▶</i><small>STEER</small></button>
      </div>
      <div class="dc-pedals">
        <button class="dc-b dc-gas" data-a="forward"><i>▲</i>GAS</button>
        <button class="dc-b dc-brake" data-a="backward"><i>▼</i>BRAKE</button>
        <button class="dc-b dc-boost" data-a="boost">BOOST<small>SHIFT</small></button>
        <button class="dc-b dc-drift" data-a="handbrake">DRIFT<small>SPACE</small></button>
      </div>
      <div class="dc-menu">
        <button class="dc-m" data-m="car">CAR</button>
        <button class="dc-m" data-m="music">MUSIC</button>
        <button class="dc-m" data-m="mute">SOUND</button>
      </div>`;
    (document.getElementById('hud') || document.body).appendChild(this.el);

    this.buttons = {};
    for (const b of this.el.querySelectorAll('.dc-b')) {
      const a = b.dataset.a;
      this.buttons[a] = b;
      const down = (e) => {
        e.preventDefault();
        try { b.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
        this.state[a] = true;
      };
      const up = () => { this.state[a] = false; };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    this.menu = {};
    for (const m of this.el.querySelectorAll('.dc-m')) {
      this.menu[m.dataset.m] = m;
      m.addEventListener('click', (e) => {
        e.currentTarget.blur();              // keep the keyboard on the game
        if (m.dataset.m === 'car') onCar?.();
        if (m.dataset.m === 'music') onMusic?.();
        if (m.dataset.m === 'mute') onMute?.();
      });
    }
  }

  /** Light the buttons for whatever is held, keyboard included. */
  reflect(input) {
    for (const a of ACTIONS) this.buttons[a].classList.toggle('on', !!input[a]);
  }

  setFlags({ music, muted }) {
    if (music !== undefined) this.menu.music.classList.toggle('off', !music);
    if (muted !== undefined) this.menu.mute.classList.toggle('off', muted);
  }

  release() { for (const a of ACTIONS) this.state[a] = false; }

  setVisible(v) { this.el.style.display = v ? '' : 'none'; if (!v) this.release(); }

  destroy() { this.el.remove(); this.style.remove(); }
}
