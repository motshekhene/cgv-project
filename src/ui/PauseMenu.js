import { THEME_CSS } from './theme.js';

/**
 * PauseMenu — what you see when Esc pauses the game (Game.setPaused calls the
 * level's onPause): the frame dimmed, PAUSED, every control with its keys, a
 * tip, and RESUME / RESTART buttons. Same theme as the HUD; lives in #hud and
 * removes everything on dispose(). Any level can use it with its own list.
 *
 *   const menu = new PauseMenu({ controls: [['W S', 'walk'], ...], tip, onResume, onRestart });
 *   menu.show(true);
 */
const CSS = THEME_CSS + `
.pm { position:absolute; inset:0; z-index:30; display:flex; align-items:center; justify-content:center; font-family:var(--sans); color:var(--ink);
  visibility:hidden; opacity:0; pointer-events:none; transition:opacity .22s ease, visibility 0s linear .22s; user-select:none; }
.pm.show { visibility:visible; opacity:1; pointer-events:auto; transition:opacity .22s ease; }
.pm::before { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at center, rgba(10,12,8,.6), rgba(4,5,3,.9)); }
.pm-in { position:relative; width:min(580px, 92vw); padding:22px 28px 24px; text-align:center;
  transform:translateY(10px) scale(.98); transition:transform .25s cubic-bezier(.2,.8,.2,1); }
.pm.show .pm-in { transform:none; }
.pm h2 { margin:0; font-family:var(--serif); font-weight:700; font-size:clamp(28px, 4vw, 40px); letter-spacing:.32em; text-indent:.32em;
  color:var(--gold); text-shadow:0 2px 0 #000, 0 0 18px rgba(227,187,98,.35); }
.pm hr { width:min(260px, 50vw); height:1px; margin:10px auto 16px; border:0; background:linear-gradient(90deg, transparent, var(--gold), transparent); }
.pm dl { display:grid; grid-template-columns:auto 1fr; gap:8px 16px; margin:0 auto 14px; max-width:460px; text-align:left; font-size:12px; line-height:1.35; }
.pm dt { text-align:right; white-space:nowrap; }
.pm dd { margin:0; color:var(--ink-dim); }
.pm kbd { display:inline-block; min-width:22px; padding:2px 6px; margin-left:4px; font:700 10px var(--sans); text-align:center; color:var(--gold);
  border:1px solid var(--line); border-radius:3px; background:rgba(0,0,0,.35); }
.pm-tip { margin:2px auto 18px; max-width:440px; font-size:11px; line-height:1.5; letter-spacing:.04em; color:var(--key); }
.pm-btns { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; }
.pm-btns button { display:inline-flex; align-items:center; gap:12px; padding:10px 16px 10px 24px; cursor:pointer; font:700 12px var(--sans);
  letter-spacing:.3em; color:var(--ink); border:1px solid var(--line); border-radius:2px;
  background:linear-gradient(180deg, rgba(64,56,32,.92), rgba(20,19,11,.95)); box-shadow:0 0 0 1px rgba(0,0,0,.6), 0 8px 22px rgba(0,0,0,.45); }
.pm-btns button:hover { border-color:var(--gold); box-shadow:0 0 0 1px rgba(0,0,0,.6), 0 0 20px rgba(227,187,98,.32); }
.pm-btns kbd { margin:0; }
@media (max-height: 540px) {
  .pm-in { padding:12px 20px 14px; }
  .pm h2 { font-size:22px; }
  .pm hr { margin:6px auto 8px; }
  .pm dl { gap:3px 12px; font-size:10px; margin-bottom:8px; }
  .pm-tip { margin-bottom:10px; font-size:10px; }
}
`;

export class PauseMenu {
  constructor({ controls = [], tip = '', onResume = null, onRestart = null, host = document.getElementById('hud') || document.body } = {}) {
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    this.el = document.createElement('div');
    this.el.className = 'pm';
    const inner = document.createElement('div');
    inner.className = 'pm-in plaque';
    inner.innerHTML = '<h2>PAUSED</h2><hr>';

    const dl = document.createElement('dl');
    for (const [keys, what] of controls) {
      const dt = document.createElement('dt');
      for (const k of keys.split(' ')) {
        const kbd = document.createElement('kbd');
        kbd.textContent = k;
        dt.appendChild(kbd);
      }
      const dd = document.createElement('dd');
      dd.textContent = what;
      dl.append(dt, dd);
    }
    inner.appendChild(dl);
    if (tip) {
      const p = document.createElement('p');
      p.className = 'pm-tip';
      p.textContent = tip;
      inner.appendChild(p);
    }
    const btns = document.createElement('div');
    btns.className = 'pm-btns';
    const button = (label, key, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      const k = document.createElement('kbd');
      k.textContent = key;
      b.appendChild(k);
      b.addEventListener('click', () => fn && fn());
      btns.appendChild(b);
    };
    button('RESUME', 'ESC', onResume);
    button('RESTART', 'R', onRestart);
    inner.appendChild(btns);
    this.el.appendChild(inner);
    host.appendChild(this.el);
  }

  show(on) {
    this.el.classList.toggle('show', on);
  }

  dispose() {
    this.el.remove();
    this.style.remove();
  }
}
