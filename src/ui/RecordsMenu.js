import { THEME_CSS } from './theme.js';
import { DIALOGUE_FONT } from './dialogue.js';
import { CHAPTERS } from './LoadingScreen.js';
import { RECORDS, record, shown } from '../core/records.js';

/**
 * RecordsMenu — RECORDS on the main menu: each level's bests (core/records.js),
 * kept in this browser, in a panel like CONTROLS and CREDITS. The three levels
 * side by side, each record with when it was set, or what sets it if nothing
 * has yet. A NEW BEST on an end card is one of these being beaten.
 *
 *   const records = new RecordsMenu();
 *   records.open();          // over the title screen
 *
 * Esc, Backspace, Enter, BACK or a click outside the panel closes it. While
 * it's open it keeps every key to itself, so nothing underneath moves.
 */
const LEVELS = ['level01', 'level02', 'level03'];

const CSS = THEME_CSS + `
.rm { position:fixed; inset:0; z-index:9700; display:flex; align-items:center; justify-content:center; font-family:var(--sans); color:var(--ink);
  visibility:hidden; opacity:0; pointer-events:none; transition:opacity .2s ease, visibility 0s linear .2s; }
.rm.show { visibility:visible; opacity:1; pointer-events:auto; transition:opacity .2s ease; }
.rm::before { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at center, rgba(10,12,8,.7), rgba(4,5,3,.95)); backdrop-filter:blur(3px); }
.rm-in { position:relative; box-sizing:border-box; width:min(900px, 94vw); max-height:calc(100vh - 96px); display:flex; flex-direction:column;
  padding:20px 26px 16px; text-align:center; }
.rm h2 { margin:0; font-family:${DIALOGUE_FONT}; font-weight:600; font-size:clamp(26px, 4vw, 36px); letter-spacing:.32em; text-indent:.32em;
  color:var(--gold); text-shadow:0 2px 0 #000, 0 0 18px rgba(227,187,98,.35); }
.rm hr { width:min(240px, 50vw); height:1px; margin:10px auto 10px; border:0; background:linear-gradient(90deg, transparent, var(--gold), transparent); }
.rm-lead { margin:0 0 16px; font:italic 15px ${DIALOGUE_FONT}; color:var(--ink-dim); }
.rm-cols { flex:1; min-height:0; overflow-y:auto; display:grid; grid-template-columns:repeat(3, 1fr); gap:14px; text-align:left; padding:2px; }
.rm-col { padding:14px 16px 10px; border:1px solid rgba(227,187,98,.22); border-radius:4px; background:linear-gradient(180deg, rgba(38,44,28,.55), rgba(10,12,8,.6));
  animation:rm-in .4s ease backwards; animation-delay:calc(var(--i) * 70ms); }
.rm-col h3 { margin:0 0 2px; font:700 10px var(--sans); letter-spacing:.32em; color:var(--gold); }
.rm-col h4 { margin:0 0 10px; font:600 17px ${DIALOGUE_FONT}; letter-spacing:.12em; color:var(--ink); }
.rm-rec { padding:9px 0 8px; border-top:1px solid rgba(239,228,200,.08); }
.rm-rec span { display:block; font:700 9.5px var(--sans); letter-spacing:.24em; color:var(--ink-dim); }
.rm-rec b { display:block; margin-top:4px; font:700 26px/1 ${DIALOGUE_FONT}; color:#fff4d8; text-shadow:0 2px 0 rgba(0,0,0,.6), 0 0 14px rgba(227,187,98,.3); }
.rm-rec b small { margin-left:4px; font:700 10px var(--sans); letter-spacing:.14em; color:var(--ink-dim); text-shadow:none; }
.rm-rec em { display:block; margin-top:3px; font:italic 13px ${DIALOGUE_FONT}; color:var(--ink-dim); }
.rm-rec.lights span { color:#8ff0f6; }
.rm-rec.lights b { color:#e8fdff; text-shadow:0 2px 0 rgba(0,0,0,.6), 0 0 14px rgba(79,214,224,.6); }
.rm-rec.none b { color:rgba(239,228,200,.28); text-shadow:none; }
.rm-back { align-self:center; margin-top:14px; padding:7px 28px; cursor:pointer; font:600 13px ${DIALOGUE_FONT}; letter-spacing:.3em; color:var(--gold);
  border:1px solid var(--line); border-radius:2px; background:rgba(227,187,98,.08); }
.rm-back:hover { border-color:var(--gold); background:rgba(227,187,98,.16); }
.rm-hint { margin-top:8px; font-size:10px; letter-spacing:.2em; color:var(--ink-dim); }
@keyframes rm-in { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
@media (max-height:760px) {
  .rm-in { padding:14px 22px 12px; }
  .rm h2 { font-size:28px; }
  .rm hr { margin:6px auto 8px; }
  .rm-lead { margin-bottom:10px; }
  .rm-rec { padding:6px 0 5px; }
  .rm-rec b { font-size:22px; }
  .rm-back { margin-top:10px; padding:5px 24px; }
}
@media (max-width:760px) { .rm-cols { grid-template-columns:1fr; } }
@media (prefers-reduced-motion: reduce) { .rm-col { animation:none; } }
`;

const day = (ms) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export class RecordsMenu {
  constructor() {
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);
    this.el = document.createElement('div');
    this.el.className = 'rm';
    this.el.innerHTML = `
      <div class="rm-in plaque">
        <h2>RECORDS</h2>
        <hr>
        <div class="rm-lead">Your best runs, kept in this browser. Beat one and the end card says NEW BEST.</div>
        <div class="rm-cols"></div>
        <div class="rm-back">BACK</div>
        <div class="rm-hint">ESC BACK</div>
      </div>`;
    this.cols = this.el.querySelector('.rm-cols');
    this.el.querySelector('.rm-back').addEventListener('click', () => this.close());
    for (const t of ['mousedown', 'pointerdown', 'click']) this.el.addEventListener(t, (e) => e.stopPropagation()); // not a click on the menu underneath
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
    this._onKey = this._onKey.bind(this);
    window.addEventListener('keydown', this._onKey, true); // capture: ahead of the title menu and the game
    document.body.appendChild(this.el);
  }

  get visible() {
    return this.el.classList.contains('show');
  }

  /** Read fresh each time: a record can be set between visits. */
  _fill() {
    this.cols.innerHTML = LEVELS.map((lv, i) => {
      const c = CHAPTERS[lv];
      const rows = RECORDS.filter((r) => r.chapter === lv).map((def) => {
        const r = record(def.id);
        const cls = `rm-rec${def.kind ? ' ' + def.kind : ''}${r ? '' : ' none'}`;
        const value = r ? `${shown(def, r.value)}${def.unit ? `<small>${def.unit}</small>` : ''}` : '—';
        return `<div class="${cls}"><span>${def.label}</span><b>${value}</b><em>${r ? `set ${day(r.at)}` : def.how}</em></div>`;
      }).join('');
      return `<div class="rm-col" style="--i:${i}"><h3>${c.kicker}</h3><h4>${c.title}</h4>${rows}</div>`;
    }).join('');
  }

  open() {
    if (document.pointerLockElement) document.exitPointerLock();
    this._fill();
    this.cols.scrollTop = 0;
    this.el.classList.add('show');
  }

  close() {
    if (!this.visible) return;
    this.el.classList.remove('show');
  }

  _onKey(e) {
    if (!this.visible) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowdown' || k === 's') this.cols.scrollBy({ top: 60, behavior: 'smooth' });
    else if (k === 'arrowup' || k === 'w') this.cols.scrollBy({ top: -60, behavior: 'smooth' });
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
