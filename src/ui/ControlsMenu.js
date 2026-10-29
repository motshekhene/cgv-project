import { THEME_CSS } from './theme.js';
import { DIALOGUE_FONT } from './dialogue.js';
import { controlRows } from './ControlsOverlay.js';

/**
 * ControlsMenu — CONTROLS on the main menu: every chapter's controls in a
 * panel like CREDITS and the PLAYBOOK, one chapter to a tab, each key drawn
 * as a keycap. The rows are ui/ControlsOverlay.js's (the H panel in the
 * corner during a level, and the pause menu), read from the live bindings, so
 * the three can never disagree.
 *
 *   const controls = new ControlsMenu(game);
 *   controls.open();          // over the title screen
 *
 * ← → / A D / 1-4 or a click change chapter; Esc, Backspace, Enter, H or
 * BACK (or a click outside the panel) closes it. While it's open it keeps
 * every key to itself, so nothing underneath moves.
 */
const CHAPTERS = [
  ['prologue', 'PROLOGUE', 'The fire and the stone: on foot through the valley.'],
  ['level01', 'LEVEL 1', 'The old trail: running from the Marshal.'],
  ['level02', 'LEVEL 2', 'The River Road: driving to the falls.'],
  ['level03', 'LEVEL 3', 'The falls: the fight.'],
];

const CSS = THEME_CSS + `
.km { position:fixed; inset:0; z-index:9700; display:flex; align-items:center; justify-content:center; font-family:var(--sans); color:var(--ink);
  visibility:hidden; opacity:0; pointer-events:none; transition:opacity .2s ease, visibility 0s linear .2s; }
.km.show { visibility:visible; opacity:1; pointer-events:auto; transition:opacity .2s ease; }
.km::before { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at center, rgba(10,12,8,.7), rgba(4,5,3,.95)); backdrop-filter:blur(3px); }
.km-in { position:relative; box-sizing:border-box; width:min(720px, 94vw); height:min(640px, calc(100vh - 96px)); display:flex; flex-direction:column;
  padding:20px 26px 16px; text-align:center; }
.km h2 { margin:0; font-family:${DIALOGUE_FONT}; font-weight:600; font-size:clamp(26px, 4vw, 36px); letter-spacing:.32em; text-indent:.32em;
  color:var(--gold); text-shadow:0 2px 0 #000, 0 0 18px rgba(227,187,98,.35); }
.km hr { width:min(240px, 50vw); height:1px; margin:10px auto 12px; border:0; background:linear-gradient(90deg, transparent, var(--gold), transparent); }
.km-tabs { display:flex; justify-content:center; flex-wrap:wrap; gap:6px; margin:0 0 14px; }
.km-tab { position:relative; padding:8px 16px 9px; cursor:pointer; font:700 11px var(--sans); letter-spacing:.28em; color:var(--ink-dim);
  border:1px solid rgba(227,187,98,.22); border-radius:2px; background:rgba(0,0,0,.28); transition:color .15s, border-color .15s, background .15s; }
.km-tab:hover { color:var(--ink); border-color:rgba(227,187,98,.5); }
.km-tab.on { color:var(--gold); border-color:var(--gold); background:linear-gradient(180deg, rgba(227,187,98,.2), rgba(227,187,98,.05)); box-shadow:0 0 16px rgba(227,187,98,.18); }
.km-tab.on::after { content:'\\25C6'; position:absolute; left:50%; bottom:-9px; transform:translateX(-50%); font-size:9px; color:var(--gold); }
.km-lead { margin:0 0 10px; font:italic 15px ${DIALOGUE_FONT}; color:var(--ink-dim); }
.km-list { flex:1; min-height:0; overflow-y:auto; text-align:left; padding:0 8px 4px 2px; scrollbar-color:var(--gold-dim) transparent; }
.km-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:8px 6px; border-bottom:1px solid rgba(239,228,200,.07);
  animation:km-in .35s ease backwards; animation-delay:calc(var(--i) * 28ms); }
.km-row:hover { background:rgba(227,187,98,.05); }
.km-what { font:600 12px var(--sans); letter-spacing:.2em; color:var(--ink); }
.km-keys { display:flex; flex-wrap:wrap; justify-content:flex-end; align-items:center; gap:5px; font:italic 13px ${DIALOGUE_FONT}; color:var(--ink-dim); }
.km-keys kbd { display:inline-block; min-width:16px; padding:4px 8px 5px; text-align:center; font:700 11px var(--sans); letter-spacing:.08em; color:#f6e7c1;
  border:1px solid rgba(227,187,98,.55); border-bottom-width:3px; border-radius:4px; background:linear-gradient(180deg, rgba(60,66,44,.95), rgba(22,26,16,.95));
  box-shadow:0 2px 6px rgba(0,0,0,.45); }
.km-keys i { font-style:normal; padding:0 2px; color:var(--gold-dim); }
.km-foot { margin-top:10px; font:italic 14px ${DIALOGUE_FONT}; color:var(--ink-dim); }
.km-foot b { font:700 11px var(--sans); letter-spacing:.14em; color:var(--gold); }
.km-back { align-self:center; margin-top:12px; padding:7px 28px; cursor:pointer; font:600 13px ${DIALOGUE_FONT}; letter-spacing:.3em; color:var(--gold);
  border:1px solid var(--line); border-radius:2px; background:rgba(227,187,98,.08); }
.km-back:hover { border-color:var(--gold); background:rgba(227,187,98,.16); }
.km-hint { margin-top:8px; font-size:10px; letter-spacing:.2em; color:var(--ink-dim); }
@keyframes km-in { from { opacity:0; transform:translateX(-8px); } to { opacity:1; transform:none; } }
@media (max-height:860px) {
  .km-in { padding:14px 22px 12px; }
  .km h2 { font-size:28px; }
  .km hr { margin:6px auto 10px; }
  .km-row { padding:6px 6px; }
  .km-back { margin-top:8px; padding:5px 24px; }
}
@media (prefers-reduced-motion: reduce) { .km-row { animation:none; } }
`;

/**
 * One row's keys as keycaps: 'A / D · ← / →' is two ways of doing it, each a
 * pair of keys; 'W A S D' is four keys; anything in words ('WALK INTO THEM')
 * stays words.
 */
function keycaps(keys) {
  const part = (p) => {
    const words = p.trim().split(/\s+/);
    if (words.length > 1 && words.some((w) => w.length > 1)) return `<span>${p.trim().toLowerCase()}</span>`;
    return words.map((w) => `<kbd>${w}</kbd>`).join('');
  };
  return keys.split(' · ').map((alt) => alt.split(' / ').map(part).join('<i>/</i>')).join('<i>or</i>');
}

export class ControlsMenu {
  constructor(game) {
    this.game = game;
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);
    this.el = document.createElement('div');
    this.el.className = 'km';
    this.el.innerHTML = `
      <div class="km-in plaque">
        <h2>CONTROLS</h2>
        <hr>
        <div class="km-tabs">${CHAPTERS.map(([id, label]) => `<span class="km-tab" data-tab="${id}">${label}</span>`).join('')}</div>
        <div class="km-lead"></div>
        <div class="km-list"></div>
        <div class="km-foot">In any level: <b>ESC</b> pauses (the pause menu lists that level’s keys) · the <b>PLAYBOOK</b> has the rules</div>
        <div class="km-back">BACK</div>
        <div class="km-hint">← → CHAPTER · ESC BACK</div>
      </div>`;
    this.list = this.el.querySelector('.km-list');
    this.lead = this.el.querySelector('.km-lead');
    for (const t of this.el.querySelectorAll('.km-tab')) t.addEventListener('click', () => this.show(t.dataset.tab));
    this.el.querySelector('.km-back').addEventListener('click', () => this.close());
    for (const t of ['mousedown', 'pointerdown', 'click']) this.el.addEventListener(t, (e) => e.stopPropagation()); // not a click on the menu underneath
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
    this._onKey = this._onKey.bind(this);
    window.addEventListener('keydown', this._onKey, true); // capture: ahead of the title menu and the game
    document.body.appendChild(this.el);
  }

  get visible() {
    return this.el.classList.contains('show');
  }

  /** One chapter on screen: 'prologue', 'level01', 'level02' or 'level03'. */
  show(id) {
    this.tab = id;
    for (const t of this.el.querySelectorAll('.km-tab')) t.classList.toggle('on', t.dataset.tab === id);
    this.lead.textContent = CHAPTERS.find(([c]) => c === id)?.[2] || '';
    // the live bindings, read now (a binding can change between visits)
    this.list.innerHTML = controlRows(this.game, id).map((r, i) =>
      `<div class="km-row" style="--i:${i}"><span class="km-what">${r.label}</span><span class="km-keys">${keycaps(r.keys)}</span></div>`).join('');
    this.list.scrollTop = 0;
  }

  open(tab = 'prologue') {
    if (document.pointerLockElement) document.exitPointerLock();
    this.show(tab);
    this.el.classList.add('show');
  }

  close() {
    if (!this.visible) return;
    this.el.classList.remove('show');
  }

  toggle() {
    if (this.visible) this.close();
    else this.open();
  }

  _onKey(e) {
    if (!this.visible) return;
    const k = e.key.toLowerCase();
    const ids = CHAPTERS.map(([id]) => id);
    const at = ids.indexOf(this.tab);
    if (k === 'arrowright' || k === 'd' || k === 'tab') this.show(ids[(at + 1) % ids.length]);
    else if (k === 'arrowleft' || k === 'a') this.show(ids[(at + ids.length - 1) % ids.length]);
    else if (k >= '1' && k <= String(ids.length)) this.show(ids[+k - 1]);
    else if (k === 'arrowdown' || k === 's') this.list.scrollBy({ top: 60, behavior: 'smooth' });
    else if (k === 'arrowup' || k === 'w') this.list.scrollBy({ top: -60, behavior: 'smooth' });
    else if (['escape', 'backspace', 'enter'].includes(k)) this.close();
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey, true);
    this.el.remove();
    this.style.remove();
  }
}
