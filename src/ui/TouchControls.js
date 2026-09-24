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
.tc { position:absolute; inset:0; pointer-events:none; font-family:'Segoe UI',system-ui,sans-serif; }
.tc * { touch-action:none; user-select:none; -webkit-user-select:none; box-sizing:border-box; }
.tc-joy { position:absolute; left:36px; bottom:36px; width:136px; height:136px; border-radius:50%; pointer-events:auto;
  background:radial-gradient(circle,#ffffff10,#ffffff06); border:2px solid #ffffff30; }
.tc-joy::before { content:''; position:absolute; inset:34px; border-radius:50%; border:1px dashed #ffffff22; }
.tc-knob { position:absolute; left:50%; top:50%; width:58px; height:58px; margin:-29px 0 0 -29px; border-radius:50%;
  background:radial-gradient(circle at 35% 30%,#ffd9a8,#ff8a3a); box-shadow:0 0 14px #ff7a2a88; }
.tc-btn { position:absolute; pointer-events:auto; border-radius:50%; border:2px solid #ffffff44; color:#fff; font-weight:700;
  letter-spacing:.08em; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; cursor:pointer;
  background:radial-gradient(circle at 35% 30%,#ffffff26,#ffffff0d); backdrop-filter:blur(2px); }
.tc-btn small { display:block; font-size:9px; font-weight:500; opacity:.7; letter-spacing:.12em; }
.tc-btn.on, .tc-btn:active { background:radial-gradient(circle at 35% 30%,#ffb066,#e2561a); border-color:#ffd9a8; transform:scale(.94); }
.tc-atk { right:36px; bottom:36px; width:98px; height:98px; font-size:15px; border-color:#ff8a3a99; }
.tc-dodge { right:152px; bottom:44px; width:72px; height:72px; font-size:12px; }
.tc-block { right:40px; bottom:152px; width:72px; height:72px; font-size:12px; }
.tc-key { right:140px; bottom:140px; width:58px; height:58px; font-size:11px; border-color:#7fd8ff88; }
.tc-view { position:absolute; top:18px; right:20px; pointer-events:auto; padding:9px 14px; border-radius:6px; font-size:11px;
  font-weight:700; letter-spacing:.2em; color:#ffe7cf; background:#00000066; border:1px solid #ff9a5a77; cursor:pointer; }
.tc-view:hover { background:#3a1a0aaa; }
.tc-arrow { position:absolute; top:24%; bottom:40%; width:58px; display:none; pointer-events:auto; align-items:center; justify-content:center;
  font-size:26px; color:#ffe7cf; cursor:pointer; }
.tc-arrow.l { left:0; background:linear-gradient(90deg,#ff7a2a55,transparent); border-radius:0 40px 40px 0; }
.tc-arrow.r { right:0; background:linear-gradient(270deg,#ff7a2a55,transparent); border-radius:40px 0 0 40px; }
.tc.orbit .tc-arrow { display:flex; }
.tc-arrow.held { background:linear-gradient(90deg,#ff7a2aaa,transparent); }
.tc-arrow.r.held { background:linear-gradient(270deg,#ff7a2aaa,transparent); }
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
      <button class="tc-view"></button>
      <div class="tc-joy"><div class="tc-knob"></div></div>
      <div class="tc-btn tc-atk" data-a="attack">ATTACK<small>COMBO</small></div>
      <div class="tc-btn tc-dodge" data-a="dodge">DODGE</div>
      <div class="tc-btn tc-block" data-a="block">BLOCK<small>TAP=PARRY</small></div>
      <div class="tc-btn tc-key" data-a="ability">KEY</div>`;
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
    this.viewBtn.textContent = on ? 'VIEW: 360°' : 'VIEW: LOCK-ON';
    if (!on) this.strip = 0;
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
    for (const a of ['attack', 'dodge', 'block', 'ability']) this.input.setVirtual(a, false);
    this.el.remove();
    this.style.remove();
  }
}
