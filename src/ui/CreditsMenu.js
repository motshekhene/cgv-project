import { THEME_CSS } from './theme.js';
import { DIALOGUE_FONT } from './dialogue.js';
import { GAME_TITLE } from './brand.js';
import { CREDIT_SECTIONS, LICENCES } from './credits.js';

/**
 * CreditsMenu — CREDITS on the main menu: everything in the game the team
 * did not make, each with who made it, its licence, where it is in the game
 * and a link to where it came from (the list is ui/credits.js). It used to be
 * a paragraph on the last card of the game; here it can be found without
 * finishing it, and every link can be followed.
 *
 *   const credits = new CreditsMenu();
 *   credits.open();          // over the title screen
 *
 * ↑ ↓ / W S / the wheel scroll, Space pages down; Esc, Backspace, Enter or
 * BACK (or a click outside the panel) closes it. Links open in a new tab.
 * While it's open it keeps every key to itself, so nothing underneath moves.
 */
const host = (url) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

const CSS = THEME_CSS + `
.cm { position:fixed; inset:0; z-index:9700; display:flex; align-items:center; justify-content:center; font-family:var(--sans); color:var(--ink);
  visibility:hidden; opacity:0; pointer-events:none; transition:opacity .2s ease, visibility 0s linear .2s; }
.cm.show { visibility:visible; opacity:1; pointer-events:auto; transition:opacity .2s ease; }
.cm::before { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at center, rgba(10,12,8,.7), rgba(4,5,3,.95)); backdrop-filter:blur(3px); }
.cm-in { position:relative; width:min(780px, 94vw); max-height:calc(100vh - 40px); display:flex; flex-direction:column; padding:20px 26px 16px; text-align:center; }
.cm h2 { margin:0; font-family:${DIALOGUE_FONT}; font-weight:600; font-size:clamp(26px, 4vw, 38px); letter-spacing:.32em; text-indent:.32em;
  color:var(--gold); text-shadow:0 2px 0 #000, 0 0 18px rgba(227,187,98,.35); }
.cm hr { width:min(240px, 50vw); height:1px; margin:10px auto 8px; border:0; background:linear-gradient(90deg, transparent, var(--gold), transparent); }
.cm-sub { font:italic 15px ${DIALOGUE_FONT}; color:var(--ink-dim); margin-bottom:12px; }
.cm-sub b { font-style:normal; font-weight:600; letter-spacing:.14em; color:var(--ink); }
.cm-list { flex:1; min-height:0; overflow-y:auto; text-align:left; padding:2px 10px 6px 4px; scrollbar-color:var(--gold-dim) transparent; }
.cm-sec { margin:14px 0 6px; font:700 11px var(--sans); letter-spacing:.3em; color:var(--gold); border-bottom:1px solid rgba(227,187,98,.25); padding-bottom:5px; }
.cm-sec:first-child { margin-top:2px; }
.cm-item { display:grid; grid-template-columns:1fr auto; column-gap:14px; align-items:start; padding:7px 4px; border-bottom:1px solid rgba(239,228,200,.06); }
.cm-what { font:600 16px ${DIALOGUE_FONT}; color:var(--ink); }
.cm-what span { font-weight:500; color:var(--ink-dim); }
.cm-use { margin-top:1px; font:italic 14px ${DIALOGUE_FONT}; color:var(--ink-dim); }
.cm-url { display:inline-block; margin-top:3px; font:12px var(--sans); letter-spacing:.02em; color:var(--key); text-decoration:none; word-break:break-all; }
.cm-url:hover { text-decoration:underline; }
.cm-lic { align-self:center; padding:3px 8px; font:700 9px var(--sans); letter-spacing:.16em; white-space:nowrap; color:var(--moss-hi);
  border:1px solid rgba(188,217,106,.45); border-radius:2px; background:rgba(0,0,0,.3); text-decoration:none; }
.cm-lic:hover { border-color:var(--moss-hi); }
.cm-note { margin:8px 4px 0; font:italic 14px ${DIALOGUE_FONT}; color:var(--ink-dim); }
.cm-back { align-self:center; margin-top:14px; padding:7px 28px; cursor:pointer; font:600 13px ${DIALOGUE_FONT}; letter-spacing:.3em; color:var(--gold);
  border:1px solid var(--line); border-radius:2px; background:rgba(227,187,98,.08); }
.cm-back:hover { border-color:var(--gold); background:rgba(227,187,98,.16); }
.cm-keys { margin-top:8px; font-size:10px; letter-spacing:.2em; color:var(--ink-dim); }
`;

export class CreditsMenu {
  constructor() {
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    this.el = document.createElement('div');
    this.el.className = 'cm';
    const link = (url, cls, text) => `<a class="${cls}" href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    const sections = CREDIT_SECTIONS.map((s) => {
      const items = s.items.map((it) => {
        const lic = LICENCES[it.licence];
        return `<div class="cm-item">
          <div>
            <div class="cm-what">${it.title} <span>— ${it.by}</span></div>
            <div class="cm-use">${it.use}</div>
            ${link(it.url, 'cm-url', host(it.url) + ' ↗')}
          </div>
          ${link(lic.url ?? it.url, 'cm-lic', lic.name)}
        </div>`;
      }).join('');
      return `<div class="cm-sec">${s.title}</div>${items}${s.note ? `<div class="cm-note">${s.note}</div>` : ''}`;
    }).join('');
    this.el.innerHTML = `
      <div class="cm-in plaque">
        <h2>CREDITS</h2>
        <hr>
        <div class="cm-sub"><b>${GAME_TITLE}</b> · a COMS3006A group project, built on the work of these artists and tools</div>
        <div class="cm-list">${sections}</div>
        <div class="cm-back">BACK</div>
        <div class="cm-keys">↑ ↓ SCROLL · CLICK A LINK TO OPEN IT · ESC BACK</div>
      </div>`;
    this.list = this.el.querySelector('.cm-list');
    this.onClose = null;

    // a click here is not also a click on the menu underneath
    for (const t of ['mousedown', 'pointerdown', 'click']) this.el.addEventListener(t, (e) => e.stopPropagation());
    this.el.querySelector('.cm-back').addEventListener('click', () => this.close());
    // a click on the dimmed backdrop, outside the panel, closes it too
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
    this._onKey = this._onKey.bind(this);
    window.addEventListener('keydown', this._onKey, true); // capture: ahead of the title menu and the game
    document.body.appendChild(this.el);
  }

  get visible() {
    return this.el.classList.contains('show');
  }

  open() {
    if (document.pointerLockElement) document.exitPointerLock();
    this.list.scrollTop = 0;
    this.el.classList.add('show');
  }

  close() {
    if (!this.visible) return;
    this.el.classList.remove('show');
    this.onClose?.();
  }

  _onKey(e) {
    if (!this.visible) return;
    const k = e.key.toLowerCase();
    const page = this.list.clientHeight * 0.85;
    if (k === 'arrowdown' || k === 's') this.list.scrollBy({ top: 70, behavior: 'smooth' });
    else if (k === 'arrowup' || k === 'w') this.list.scrollBy({ top: -70, behavior: 'smooth' });
    else if (k === ' ' || k === 'pagedown') this.list.scrollBy({ top: page, behavior: 'smooth' });
    else if (k === 'pageup') this.list.scrollBy({ top: -page, behavior: 'smooth' });
    else if (k === 'home') this.list.scrollTo({ top: 0, behavior: 'smooth' });
    else if (k === 'end') this.list.scrollTo({ top: this.list.scrollHeight, behavior: 'smooth' });
    else if (k === 'escape' || k === 'backspace' || k === 'enter') this.close();
    // every key stays here while the panel is up (including the ones it doesn't use)
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey, true);
    this.el.remove();
    this.style.remove();
  }
}
