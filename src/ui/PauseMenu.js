import { THEME_CSS } from './theme.js';
import { DIALOGUE_FONT } from './dialogue.js';

/**
 * PauseMenu — the one pause screen in the game. main.js owns it and shows it
 * whenever the player pauses (Esc, or a level's pause button), whatever the
 * level, so pausing looks and works the same everywhere:
 *
 *   PAUSED, the chapter you are in, that level's controls (the same rows the
 *   H panel shows, from ui/ControlsOverlay.js), an optional tip the level
 *   offers (level.pauseTip), and RESUME · RESTART · MAIN MENU.
 *
 *   const menu = new PauseMenu({ onResume, onRestart, onMenu });
 *   menu.show(true, { kicker: 'LEVEL 1', title: 'THE OLD TRAIL', rows, tip });
 */
const CSS = THEME_CSS + `
.pm { position:fixed; inset:0; z-index:9300; display:flex; align-items:center; justify-content:center; font-family:var(--sans); color:var(--ink);
  visibility:hidden; opacity:0; pointer-events:none; transition:opacity .22s ease, visibility 0s linear .22s; user-select:none; }
.pm.show { visibility:visible; opacity:1; pointer-events:auto; transition:opacity .22s ease; }
.pm::before { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at center, rgba(10,12,8,.62), rgba(4,5,3,.92));
  backdrop-filter:blur(3px) saturate(.7); }
.pm-in { position:relative; width:min(560px, 92vw); max-height:92vh; overflow:auto; padding:24px 30px 26px; text-align:center;
  transform:translateY(10px) scale(.98); transition:transform .25s cubic-bezier(.2,.8,.2,1); }
.pm.show .pm-in { transform:none; }
.pm-kicker { font-family:${DIALOGUE_FONT}; font-size:12px; letter-spacing:.5em; text-indent:.5em; color:var(--ink-dim); }
.pm h2 { margin:4px 0 0; font-family:${DIALOGUE_FONT}; font-weight:600; font-size:clamp(30px, 4.4vw, 44px); letter-spacing:.32em; text-indent:.32em;
  color:var(--gold); text-shadow:0 2px 0 #000, 0 0 18px rgba(227,187,98,.35); }
.pm-chapter { margin-top:2px; font-family:${DIALOGUE_FONT}; font-style:italic; font-size:16px; color:var(--ink); }
.pm hr { width:min(260px, 50vw); height:1px; margin:12px auto 16px; border:0; background:linear-gradient(90deg, transparent, var(--gold), transparent); }
.pm dl { display:grid; grid-template-columns:1fr 1fr; gap:7px 18px; margin:0 auto 14px; max-width:440px; text-align:left; font-size:12px; line-height:1.35; }
.pm dt { text-align:right; white-space:nowrap; color:var(--ink-dim); letter-spacing:.14em; font-size:11px; }
.pm dd { margin:0; color:var(--ink); }
.pm kbd { display:inline-block; min-width:22px; padding:2px 6px; font:700 10px var(--sans); text-align:center; color:var(--gold);
  border:1px solid var(--line); border-radius:3px; background:rgba(0,0,0,.35); }
.pm-tip { margin:2px auto 18px; max-width:440px; font-family:${DIALOGUE_FONT}; font-style:italic; font-size:15px; line-height:1.45; color:var(--key); }
.pm-btns { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; }
.pm-btns button { display:inline-flex; align-items:center; gap:12px; padding:10px 16px 10px 24px; cursor:pointer; font:600 13px ${DIALOGUE_FONT};
  letter-spacing:.3em; color:var(--ink); border:1px solid var(--line); border-radius:2px;
  background:linear-gradient(180deg, rgba(64,56,32,.92), rgba(20,19,11,.95)); box-shadow:0 0 0 1px rgba(0,0,0,.6), 0 8px 22px rgba(0,0,0,.45); }
.pm-btns button:hover { border-color:var(--gold); box-shadow:0 0 0 1px rgba(0,0,0,.6), 0 0 20px rgba(227,187,98,.32); }
@media (max-height: 540px) {
  .pm-in { padding:12px 20px 14px; }
  .pm h2 { font-size:24px; }
  .pm hr { margin:6px auto 8px; }
  .pm dl { gap:3px 12px; font-size:10px; margin-bottom:8px; }
  .pm-tip { margin-bottom:10px; font-size:12px; }
}
`;

export class PauseMenu {
  constructor({ onResume = null, onRestart = null, onMenu = null } = {}) {
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    this.el = document.createElement('div');
    this.el.className = 'pm';
    this.el.innerHTML = `
      <div class="pm-in plaque">
        <div class="pm-kicker"></div>
        <h2>PAUSED</h2>
        <div class="pm-chapter"></div>
        <hr>
        <dl></dl>
        <p class="pm-tip"></p>
        <div class="pm-btns"></div>
      </div>`;
    const q = (s) => this.el.querySelector(s);
    this.kicker = q('.pm-kicker');
    this.chapter = q('.pm-chapter');
    this.list = q('dl');
    this.tip = q('.pm-tip');
    const btns = q('.pm-btns');
    const button = (label, key, fn) => {
      const b = document.createElement('button');
      b.innerHTML = key ? `${label}<kbd>${key}</kbd>` : label;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        fn?.();
      });
      // a click on the menu is not also a punch, a jump or a "skip" in the level underneath
      b.addEventListener('mousedown', (e) => e.stopPropagation());
      btns.appendChild(b);
    };
    button('RESUME', 'ESC', onResume);
    button('RESTART', 'R', onRestart);
    button('MAIN MENU', '', onMenu);
    this.el.addEventListener('mousedown', (e) => e.stopPropagation());
    document.body.appendChild(this.el);
  }

  /** rows: [{ label, keys }] — what each input does on this level. */
  show(on, { kicker = '', title = '', rows = [], tip = '' } = {}) {
    if (on) {
      this.kicker.textContent = kicker;
      this.chapter.textContent = title ? title.charAt(0) + title.slice(1).toLowerCase() : '';
      this.chapter.style.textTransform = 'capitalize';
      this.list.innerHTML = '';
      for (const r of rows) {
        const dt = document.createElement('dt');
        dt.textContent = r.label;
        const dd = document.createElement('dd');
        for (const k of String(r.keys).split(' · ')) {
          const kbd = document.createElement('kbd');
          kbd.textContent = k;
          dd.appendChild(kbd);
          dd.append(' ');
        }
        this.list.append(dt, dd);
      }
      this.list.style.display = rows.length ? '' : 'none';
      this.tip.textContent = tip;
      this.tip.style.display = tip ? '' : 'none';
    }
    this.el.classList.toggle('show', on);
  }

  get visible() {
    return this.el.classList.contains('show');
  }

  dispose() {
    this.el.remove();
    this.style.remove();
  }
}
