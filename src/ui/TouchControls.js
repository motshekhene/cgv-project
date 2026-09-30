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
const CSS = `
.tc { position:absolute; inset:0; pointer-events:none; color:#eee9df; font:600 10px/1.2 'Segoe UI',system-ui,sans-serif; }
.tc * { box-sizing:border-box; touch-action:none; user-select:none; -webkit-user-select:none; }
.tc-joy { display:none; position:absolute; left:20px; bottom:20px; width:112px; height:112px; border-radius:50%; pointer-events:auto; border:1px solid #ffffff42; background:#10110fb8; backdrop-filter:blur(3px); }
.tc-joy::before { content:''; position:absolute; inset:27px; border-radius:50%; border:1px solid #ffffff26; }
.tc-knob { position:absolute; left:50%; top:50%; width:46px; height:46px; margin:-23px 0 0 -23px; border-radius:50%; border:1px solid #ffffff91; background:linear-gradient(145deg,#d7d3c8,#77756d); box-shadow:0 2px 9px #0009; }
.tc-btn { display:flex; flex-direction:column; align-items:center; justify-content:center; position:absolute; pointer-events:auto; min-width:54px; min-height:54px; border:1px solid #ffffff72; border-radius:50%; background:#11120fd9; color:#eee9df; font:800 9px/1 'Segoe UI',system-ui,sans-serif; letter-spacing:.08em; text-align:center; cursor:pointer; box-shadow:0 2px 8px #0006; backdrop-filter:blur(2px); }
.tc-btn small { display:block; margin-top:5px; color:#bbb5aa; font-size:7px; font-weight:600; letter-spacing:.06em; }
.tc-btn.on,.tc-btn:active { border-color:#f5a45f; background:#36271e; color:#ffd9b2; transform:scale(.96); }
.tc-btn:focus-visible,.tc-view:focus-visible { outline:2px solid #f5a45f; outline-offset:2px; }
.tc-atk { right:22px; bottom:20px; width:78px; height:78px; border-color:#d1a277bb; background:#241d17e8; font-size:10px; }
.tc-dodge { right:112px; bottom:25px; width:58px; height:58px; }
.tc-block { right:31px; bottom:108px; width:58px; height:58px; }
.tc-key { right:112px; bottom:101px; width:50px; height:50px; border-color:#d1a27788; }
.tc-use { right:181px; bottom:106px; width:58px; height:58px; border-color:#8bbdb4a6; opacity:0; visibility:hidden; transition:opacity .18s ease; }
.tc-use.available { opacity:1; visibility:visible; }
.tc-view { display:none; position:absolute; top:65px; right:14px; pointer-events:auto; min-height:32px; padding:0 10px; border:1px solid #ffffff55; border-radius:3px; color:#e8e2d7; background:#11120fcf; font:700 8px/1 'Segoe UI',system-ui,sans-serif; letter-spacing:.12em; cursor:pointer; }
.tc-arrow { position:absolute; top:25%; bottom:43%; width:40px; display:none; pointer-events:auto; align-items:center; justify-content:center; color:#e9e2d7a8; font-size:18px; cursor:pointer; }
.tc-arrow.l { left:0; background:linear-gradient(90deg,#11120f88,transparent); border-radius:0 30px 30px 0; }
.tc-arrow.r { right:0; background:linear-gradient(270deg,#11120f88,transparent); border-radius:30px 0 0 30px; }
.tc-arrow.held { color:#f5a45f; background:linear-gradient(90deg,#f5a45f55,transparent); }
.tc-arrow.r.held { background:linear-gradient(270deg,#f5a45f55,transparent); }
.tc.touch-enabled .tc-joy { display:block; }
.tc.touch-enabled .tc-view { display:block; }
.tc.touch-enabled.orbit .tc-arrow { display:flex; }
@media(max-width:460px) {
  .tc-joy { left:12px; bottom:13px; width:96px; height:96px; }
  .tc-joy::before { inset:22px; }
  .tc-knob { width:42px; height:42px; margin:-21px 0 0 -21px; }
  .tc-atk { right:12px; bottom:13px; width:68px; height:68px; }
  .tc-dodge { right:88px; bottom:18px; width:52px; height:52px; }
  .tc-block { right:17px; bottom:91px; width:52px; height:52px; }
  .tc-key { right:85px; bottom:88px; width:46px; height:46px; }
  .tc-use { right:143px; bottom:89px; width:48px; height:48px; }
}
@media(prefers-reduced-motion:reduce) { .tc *, .tc *::before, .tc *::after { transition:none!important; } }
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
    const touchAvailable = (navigator.maxTouchPoints || 0) > 0 || window.matchMedia('(pointer: coarse)').matches;
    this.el.classList.toggle('touch-enabled', touchAvailable);
    this.el.innerHTML = `
      <div class="tc-arrow l">&#9664;</div>
      <div class="tc-arrow r">&#9654;</div>
      <button class="tc-view"></button>
      <div class="tc-joy"><div class="tc-knob"></div></div>
      <button class="tc-btn tc-atk" type="button" data-a="attack" aria-label="Attack">ATTACK<small>COMBO</small></button>
      <button class="tc-btn tc-dodge" type="button" data-a="dodge" aria-label="Dodge">DODGE</button>
      <button class="tc-btn tc-block" type="button" data-a="block" aria-label="Guard and parry">GUARD<small>HOLD / PARRY</small></button>
      <button class="tc-btn tc-key" type="button" data-a="ability" aria-label="Use the Key slow-motion pulse">Q<small>THE KEY</small></button>
      <button class="tc-btn tc-use" type="button" data-a="interact" aria-label="Use mine interaction">E<small>USE</small></button>`;
    host.appendChild(this.el);

    this._initJoystick();
    for (const b of this.el.querySelectorAll('.tc-btn')) this._initButton(b);
    this._initArrows();
    this._initViewToggle();
    this._initCanvas();
    this.setOrbitEnabled(false);
    this.setInteractEnabled(false);
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
    this.viewBtn.textContent = on ? 'VIEW: 360°' : 'VIEW: LOCK-ON';
    if (!on) this.strip = 0;
  }

  setInteractEnabled(on, interaction = null) {
    const button = this.el.querySelector('.tc-use');
    if (!button) return;
    button.classList.toggle('available', !!on);
    const action = interaction?.kind === 'valve' ? 'VENT' : interaction?.kind === 'rockfall' ? 'DROP' : 'USE';
    button.querySelector('small').textContent = action;
    button.setAttribute('aria-label', interaction ? `${interaction.name}: ${interaction.detail}` : 'Use mine interaction');
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
    for (const a of ['attack', 'dodge', 'block', 'ability', 'interact']) this.input.setVirtual(a, false);
    this.el.remove();
    this.style.remove();
  }
}
