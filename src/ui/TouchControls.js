/**
 * TouchControls — on-screen joystick, action buttons and the 360° view widgets.
 *
 * Everything feeds the shared Input (input.stick, input.setVirtual), so the
 * game code cannot tell a tap from a key press. Works with mouse and touch
 * (pointer events). Self-contained: injects its own styles and removes
 * everything on dispose().
 *
 * 360° view: while enabled, dragging the canvas, holding the side arrows or
 * using the wheel produces orbit input; the level reads it with consumeOrbit().
 */
import { THEME_CSS } from './theme.js';

const CSS = THEME_CSS + `
.tc { position:absolute; inset:0; pointer-events:none; font-family:var(--sans); color:var(--ink); }
.tc * { touch-action:none; user-select:none; -webkit-user-select:none; box-sizing:border-box; }
.tc-joy { position:absolute; left:36px; bottom:36px; width:136px; height:136px; border-radius:50%; pointer-events:auto;
  background:radial-gradient(circle, rgba(38,44,28,.55), rgba(13,17,11,.35)); border:1px solid var(--line);
  box-shadow:0 4px 14px rgba(0,0,0,.4), inset 0 0 0 5px rgba(0,0,0,.18); }
.tc-joy::before { content:''; position:absolute; inset:34px; border-radius:50%; border:1px dashed rgba(227,187,98,.3); }
.tc-knob { position:absolute; left:50%; top:50%; width:58px; height:58px; margin:-29px 0 0 -29px; border-radius:50%;
  background:radial-gradient(circle at 35% 30%, #fff1cf, var(--gold) 55%, var(--gold-dim)); box-shadow:0 0 14px rgba(227,187,98,.55), 0 2px 6px rgba(0,0,0,.5); }
.tc-btn { position:absolute; pointer-events:auto; border-radius:50%; border:1px solid var(--line); color:var(--ink); font-weight:700;
  letter-spacing:.1em; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; cursor:pointer;
  background:radial-gradient(circle at 35% 30%, rgba(60,66,44,.72), rgba(13,17,11,.68)); backdrop-filter:blur(2px);
  box-shadow:0 4px 12px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.08); text-shadow:0 1px 0 #000; transition:transform .08s ease; }
.tc-btn small { display:block; font-size:9px; font-weight:600; color:var(--ink-dim); letter-spacing:.12em; }
.tc-btn.on, .tc-btn:active { background:radial-gradient(circle at 35% 30%, #fff1cf, var(--gold) 60%, var(--gold-dim)); color:#21180a;
  text-shadow:none; border-color:#fff1cf; transform:scale(.94); }
.tc-btn.on small, .tc-btn:active small { color:#3a2c12; }
.tc-atk { right:36px; bottom:36px; width:98px; height:98px; font-size:15px; border-color:rgba(242,147,79,.7); }
.tc-kick { right:152px; bottom:44px; width:78px; height:78px; font-size:13px; border-color:rgba(242,147,79,.55); }
.tc-dodge { right:170px; bottom:136px; width:68px; height:68px; font-size:12px; }
.tc-block { right:44px; bottom:148px; width:72px; height:72px; font-size:12px; }
.tc-key { right:52px; bottom:232px; width:56px; height:56px; font-size:11px; border-color:rgba(111,227,255,.65); color:var(--key); }
.tc-key.on, .tc-key:active { background:radial-gradient(circle at 35% 30%, #e6fbff, var(--key) 60%, #2a8fae); color:#062430; }

/* the lock indicator: one round icon in the HUD grid's right-hand column */
.tc-view { position:absolute; top:12px; right:12px; width:38px; height:38px; padding:0; border-radius:50%; pointer-events:auto; cursor:pointer;
  display:grid; place-items:center; border:1px solid var(--line); background:radial-gradient(circle at 35% 30%, rgba(60,66,44,.85), rgba(13,17,11,.85));
  box-shadow:0 4px 12px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.08); color:var(--gold); transition:border-color .2s, box-shadow .2s, color .2s; }
.tc-view:hover { border-color:var(--gold); box-shadow:0 0 14px rgba(227,187,98,.4); }
.tc-view i { font-style:normal; font-size:20px; line-height:1; }
.tc.orbit .tc-view { color:var(--key); border-color:rgba(111,227,255,.6); }

/* phones in landscape: shrink the pad and buttons toward their corners */
@media (max-height: 500px) { .tc-joy, .tc-btn { zoom:.7; } }

.tc-arrow { position:absolute; top:max(24%, 120px); bottom:40%; width:58px; display:none; pointer-events:auto; align-items:center; justify-content:center;
  font-size:24px; color:var(--gold); cursor:pointer; text-shadow:0 1px 2px #000; }
.tc-arrow.l { left:0; background:linear-gradient(90deg, rgba(13,17,11,.6), transparent); border-radius:0 40px 40px 0; }
.tc-arrow.r { right:0; background:linear-gradient(270deg, rgba(13,17,11,.6), transparent); border-radius:40px 0 0 40px; }
.tc.orbit .tc-arrow { display:flex; }
.tc-arrow.held { background:linear-gradient(90deg, rgba(227,187,98,.45), transparent); }
.tc-arrow.r.held { background:linear-gradient(270deg, rgba(227,187,98,.45), transparent); }
`;

export class TouchControls {
  constructor(input, { host = document.getElementById('hud') || document.body, canvas = null, onToggleView = null } = {}) {
    this.input = input;
    this.canvas = canvas;
    this.onToggleView = onToggleView;
    this.orbitEnabled = false;
    this.dragDX = 0;
    this.dragDY = 0;
    this.zoom = 0;
    this.strip = 0;
    this._cleanup = [];

    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    this.el = document.createElement('div');
    this.el.className = 'tc';
    this.el.innerHTML = `
      <div class="tc-arrow l">&#9664;</div>
      <div class="tc-arrow r">&#9654;</div>
      <button class="tc-view"><i></i></button>
      <div class="tc-joy"><div class="tc-knob"></div></div>
      <div class="tc-btn tc-atk" data-a="attack">PUNCH<small>ENTER</small></div>
      <div class="tc-btn tc-kick" data-a="kick">KICK<small>K</small></div>
      <div class="tc-btn tc-dodge" data-a="dodge">DODGE<small>C</small></div>
      <div class="tc-btn tc-block" data-a="block">BLOCK<small>B · TAP=PARRY</small></div>
      <div class="tc-btn tc-key" data-a="ability">KEY<small>V</small></div>`;
    host.appendChild(this.el);

    this._initJoystick();
    for (const b of this.el.querySelectorAll('.tc-btn')) this._initButton(b);
    this._initArrows();
    this._initViewToggle();
    this._initCanvas();
    this.setOrbitEnabled(false);
  }

  _on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._cleanup.push(() => target.removeEventListener(type, fn, opts));
  }

  _initJoystick() {
    const base = this.el.querySelector('.tc-joy');
    const knob = this.el.querySelector('.tc-knob');
    let id = null;
    const move = (e) => {
      const r = base.getBoundingClientRect();
      const R = r.width / 2 - 8;
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > R) { dx *= R / len; dy *= R / len; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const mag = Math.hypot(dx, dy) / R;
      if (mag < 0.15) { this.input.stick.x = 0; this.input.stick.y = 0; return; }
      this.input.stick.x = dx / R;
      this.input.stick.y = -dy / R;
    };
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      knob.style.transform = '';
      this.input.stick.x = 0;
      this.input.stick.y = 0;
    };
    this._on(base, 'pointerdown', (e) => { id = e.pointerId; base.setPointerCapture(id); move(e); e.preventDefault(); });
    this._on(base, 'pointermove', (e) => { if (e.pointerId === id) move(e); });
    this._on(base, 'pointerup', end);
    this._on(base, 'pointercancel', end);
  }

  _initButton(b) {
    const action = b.dataset.a;
    let id = null;
    const up = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      b.classList.remove('on');
      this.input.setVirtual(action, false);
    };
    this._on(b, 'pointerdown', (e) => {
      id = e.pointerId;
      b.setPointerCapture(id);
      b.classList.add('on');
      this.input.setVirtual(action, true);
      e.preventDefault();
    });
    this._on(b, 'pointerup', up);
    this._on(b, 'pointercancel', up);
  }

  _initArrows() {
    for (const [sel, dir] of [['.tc-arrow.l', -1], ['.tc-arrow.r', 1]]) {
      const a = this.el.querySelector(sel);
      let id = null;
      const end = (e) => {
        if (e.pointerId !== id) return;
        id = null;
        this.strip = 0;
        a.classList.remove('held');
      };
      this._on(a, 'pointerdown', (e) => {
        id = e.pointerId;
        a.setPointerCapture(id);
        this.strip = dir;
        a.classList.add('held');
        e.preventDefault();
      });
      this._on(a, 'pointerup', end);
      this._on(a, 'pointercancel', end);
    }
  }

  _initViewToggle() {
    this.viewBtn = this.el.querySelector('.tc-view');
    this._on(this.viewBtn, 'click', () => this.onToggleView && this.onToggleView());
  }

  _initCanvas() {
    const c = this.canvas;
    if (!c) return;
    c.style.touchAction = 'none';
    let id = null, lx = 0, ly = 0;
    this._on(c, 'pointerdown', (e) => {
      if (!this.orbitEnabled) return;
      id = e.pointerId;
      lx = e.clientX;
      ly = e.clientY;
      c.setPointerCapture(id);
    });
    this._on(c, 'pointermove', (e) => {
      if (e.pointerId !== id) return;
      this.dragDX += e.clientX - lx;
      this.dragDY += e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
    });
    const end = (e) => { if (e.pointerId === id) id = null; };
    this._on(c, 'pointerup', end);
    this._on(c, 'pointercancel', end);
    this._on(c, 'wheel', (e) => {
      if (!this.orbitEnabled) return;
      this.zoom += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
  }

  setOrbitEnabled(on) {
    this.orbitEnabled = on;
    this.el.classList.toggle('orbit', on);
    this.viewBtn.querySelector('i').textContent = on ? '⟲' : '◎';
    this.viewBtn.title = on ? 'Free view — drag to look around (Tab to lock on)' : 'Lock-on camera (Tab for free view)';
    if (!on) this.strip = 0;
  }

  /** Camera-mode icon on the corner button; drag/arrows/wheel only drive the camera in 360° view. */
  setMode(mode) {
    this.setOrbitEnabled(mode === 'orbit');
    const [icon, title] = {
      follow: ['➤', 'Follow camera — left/right turn Kai and the view (Tab: lock-on)'],
      lock: ['◎', 'Lock-on camera — stays on the Handler (Tab: 360° view)'],
      orbit: ['↻', '360° view — drag to look around (Tab: follow)'],
    }[mode] || ['◎', ''];
    this.viewBtn.querySelector('i').textContent = icon;
    this.viewBtn.title = title;
  }

  /** Hide every widget during cutscenes (and let go of anything held). */
  setVisible(on) {
    this.el.style.display = on ? '' : 'none';
    if (!on) {
      this.input.stick.x = 0;
      this.input.stick.y = 0;
      for (const a of ['attack', 'kick', 'dodge', 'block', 'ability']) this.input.setVirtual(a, false);
    }
  }

  /** Orbit input since the last call: drag pixels, held-arrow direction, wheel steps. */
  consumeOrbit() {
    const o = { dx: this.dragDX, dy: this.dragDY, strip: this.strip, zoom: this.zoom };
    this.dragDX = this.dragDY = this.zoom = 0;
    return o;
  }

  dispose() {
    for (const off of this._cleanup) off();
    this._cleanup.length = 0;
    this.input.stick.x = 0;
    this.input.stick.y = 0;
    for (const a of ['attack', 'kick', 'dodge', 'block', 'ability']) this.input.setVirtual(a, false);
    this.el.remove();
    this.style.remove();
  }
}
