import { THEME_CSS } from './theme.js';
import { DIALOGUE_FONT } from './dialogue.js';
import { settings, setSetting, onSettings, QUALITIES, SENSITIVITIES } from '../core/settings.js';

/**
 * OptionsMenu — the OPTIONS panel, opened from the title menu and the pause
 * menu. Volume, music, mouse-look, graphics and the frame-rate counter; every
 * change applies at once and is saved (core/settings.js).
 *
 *   const options = new OptionsMenu();
 *   options.open();          // over whatever is on screen
 *   options.onClose = () => ...;
 *
 * Up / down (or W / S) pick a row, left / right (A / D) change it, Enter or
 * Space on BACK (or Esc) closes it; or click the arrows. While it's open it
 * keeps every key to itself, so nothing underneath reacts.
 */
const pct = (v) => `${Math.round(v * 100)}%`;
const step = (v, d) => Math.round(Math.min(1, Math.max(0, v + d * 0.1)) * 10) / 10;
const next = (list, v, d) => list[Math.min(list.length - 1, Math.max(0, list.indexOf(v) + d))];

const ROWS = [
  { key: 'master', label: 'MASTER VOLUME', show: pct, change: (v, d) => step(v, d), bar: true,
    help: 'Every sound in the game.' },
  { key: 'music', label: 'MUSIC VOLUME', show: pct, change: (v, d) => step(v, d), bar: true,
    help: 'The music on its own, under the sound effects.' },
  { key: 'sensitivity', label: 'MOUSE SENSITIVITY', show: (v) => `${v.toFixed(2).replace(/0$/, '')}×`,
    change: (v, d) => next(SENSITIVITIES, v, d), help: 'How fast the camera turns when you look around with the mouse.' },
  { key: 'invertY', label: 'INVERT MOUSE Y', show: (v) => (v ? 'ON' : 'OFF'), change: (v) => !v,
    help: 'Mouse up looks down, as in a flight game.' },
  { key: 'quality', label: 'GRAPHICS', show: (v) => v.toUpperCase(), change: (v, d) => next(QUALITIES, v, d),
    help: { low: 'No shadows, a lower resolution: for slower computers.', medium: 'Shadows at half detail, normal resolution.',
      high: 'Full shadows, full resolution.' } },
  { key: 'voices', label: 'VOICE HINTS', show: (v) => (v ? 'ON' : 'OFF'), change: (v) => !v,
    help: 'Tips and warnings read aloud, so you hear them without looking away.' },
  { key: 'showFps', label: 'SHOW FPS', show: (v) => (v ? 'ON' : 'OFF'), change: (v) => !v,
    help: 'A frame-rate counter at the left of the screen.' },
  { key: 'back', label: 'BACK', help: 'Esc closes this panel too.' },
];

const CSS = THEME_CSS + `
.om { position:fixed; inset:0; z-index:9700; display:flex; align-items:center; justify-content:center; font-family:var(--sans); color:var(--ink);
  visibility:hidden; opacity:0; pointer-events:none; transition:opacity .2s ease, visibility 0s linear .2s; user-select:none; }
.om.show { visibility:visible; opacity:1; pointer-events:auto; transition:opacity .2s ease; }
.om::before { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at center, rgba(10,12,8,.66), rgba(4,5,3,.94)); backdrop-filter:blur(3px); }
.om-in { position:relative; width:min(560px, 92vw); padding:22px 28px 22px; text-align:center; }
.om h2 { margin:0; font-family:${DIALOGUE_FONT}; font-weight:600; font-size:clamp(26px, 4vw, 38px); letter-spacing:.32em; text-indent:.32em;
  color:var(--gold); text-shadow:0 2px 0 #000, 0 0 18px rgba(227,187,98,.35); }
.om hr { width:min(240px, 50vw); height:1px; margin:10px auto 14px; border:0; background:linear-gradient(90deg, transparent, var(--gold), transparent); }
.om-row { display:grid; grid-template-columns:1fr auto; align-items:center; gap:14px; padding:7px 12px; margin:2px 0; cursor:pointer;
  border:1px solid transparent; border-radius:2px; text-align:left; }
.om-row.on { border-color:var(--line); background:rgba(227,187,98,.08); }
.om-label { font:600 13px ${DIALOGUE_FONT}; letter-spacing:.24em; color:var(--ink-dim); }
.om-row.on .om-label { color:var(--gold); }
.om-val { display:flex; align-items:center; gap:10px; font:700 12px var(--sans); letter-spacing:.12em; }
.om-val b { min-width:64px; text-align:center; color:var(--ink); }
.om-arrow { width:24px; height:24px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; color:var(--gold);
  border:1px solid var(--line); border-radius:2px; background:rgba(0,0,0,.35); font-size:11px; }
.om-arrow:hover { border-color:var(--gold); background:rgba(227,187,98,.15); }
.om-bar { display:inline-flex; gap:2px; }
.om-bar i { width:7px; height:12px; background:rgba(239,228,200,.16); }
.om-bar i.f { background:var(--gold); }
.om-row.back { grid-template-columns:1fr; text-align:center; margin-top:10px; }
.om-row.back .om-label { letter-spacing:.3em; }
.om-help { min-height:20px; margin-top:12px; font-family:${DIALOGUE_FONT}; font-style:italic; font-size:15px; color:var(--key); }
.om-keys { margin-top:6px; font-size:10px; letter-spacing:.2em; color:var(--ink-dim); }
`;

export class OptionsMenu {
  constructor() {
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    this.el = document.createElement('div');
    this.el.className = 'om';
    this.el.innerHTML = `
      <div class="om-in plaque">
        <h2>OPTIONS</h2>
        <hr>
        <div class="om-rows"></div>
        <div class="om-help"></div>
        <div class="om-keys">↑ ↓ CHOOSE · ← → CHANGE · ESC BACK</div>
      </div>`;
    this.rowsEl = this.el.querySelector('.om-rows');
    this.helpEl = this.el.querySelector('.om-help');
    this.rows = ROWS.map((r, i) => this._row(r, i));
    this.sel = 0;
    this.onClose = null;

    // a click here is not also a punch, a jump or a "skip" in the level underneath
    for (const t of ['mousedown', 'pointerdown', 'click']) this.el.addEventListener(t, (e) => e.stopPropagation());
    this._onKey = this._onKey.bind(this);
    window.addEventListener('keydown', this._onKey, true); // capture: ahead of the title menu and the game
    this._off = onSettings(() => this._refresh());
    document.body.appendChild(this.el);
    this._refresh();
  }

  get visible() {
    return this.el.classList.contains('show');
  }

  open() {
    if (document.pointerLockElement) document.exitPointerLock(); // the cursor back, for the panel
    this.el.classList.add('show');
    this._select(0);
  }

  close() {
    if (!this.visible) return;
    this.el.classList.remove('show');
    this.onClose?.();
  }

  _row(r, i) {
    const el = document.createElement('div');
    el.className = 'om-row' + (r.key === 'back' ? ' back' : '');
    el.innerHTML = r.key === 'back'
      ? `<span class="om-label">${r.label}</span>`
      : `<span class="om-label">${r.label}</span>
         <span class="om-val"><span class="om-arrow" data-d="-1">◀</span>${r.bar ? '<span class="om-bar"></span>' : ''}<b></b><span class="om-arrow" data-d="1">▶</span></span>`;
    el.addEventListener('pointerenter', () => this._select(i));
    el.addEventListener('click', (e) => {
      const d = Number(e.target?.dataset?.d || 0);
      if (r.key === 'back') this.close();
      else this._change(r, d || 1);
    });
    this.rowsEl.appendChild(el);
    return { ...r, el, val: el.querySelector('b'), bar: r.bar ? el.querySelector('.om-bar') : null };
  }

  _change(r, d) {
    if (!r.change) return;
    setSetting(r.key, r.change(settings[r.key], d));
  }

  _select(i) {
    const n = this.rows.length;
    this.sel = (i + n) % n;
    this.rows.forEach((r, j) => r.el.classList.toggle('on', j === this.sel));
    this._help();
  }

  _help() {
    const r = this.rows[this.sel];
    this.helpEl.textContent = typeof r.help === 'object' ? r.help[settings[r.key]] : r.help;
  }

  _refresh() {
    for (const r of this.rows) {
      if (!r.val) continue;
      r.val.textContent = r.show(settings[r.key]);
      if (r.bar) {
        const filled = Math.round(settings[r.key] * 10);
        r.bar.innerHTML = Array.from({ length: 10 }, (_, k) => `<i${k < filled ? ' class="f"' : ''}></i>`).join('');
      }
    }
    this._help();
  }

  _onKey(e) {
    if (!this.visible) return;
    const k = e.key.toLowerCase();
    const r = this.rows[this.sel];
    if (k === 'arrowdown' || k === 's') this._select(this.sel + 1);
    else if (k === 'arrowup' || k === 'w') this._select(this.sel - 1);
    else if (k === 'arrowleft' || k === 'a') this._change(r, -1);
    else if (k === 'arrowright' || k === 'd') this._change(r, 1);
    else if (k === 'enter' || k === ' ') {
      if (r.key === 'back') this.close();
      else this._change(r, 1);
    } else if (k === 'escape' || k === 'backspace') this.close();
    // every key stays here while the panel is up (including the ones it doesn't use)
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey, true);
    this._off();
    this.el.remove();
    this.style.remove();
  }
}
