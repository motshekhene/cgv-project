import { THEME_CSS } from './theme.js';
import { DIALOGUE_FONT } from './dialogue.js';
import { ART_CSS, forestBackdrop, hornEmblem, Fireflies } from './artwork.js';

/**
 * LoadingScreen — the one loading screen in the game, used for every level
 * switch (main.js hangs it on game.onLevelLoading), so they all look alike:
 *
 *   the valley at dawn behind it (ui/artwork.js, the title screen's art),
 *   the horn in the middle, filling with its cyan from the base to the tip
 *   as the level loads, the chapter's name under it, a line from the story,
 *   and a thin gold bar.
 *
 *   const loading = new LoadingScreen();
 *   loading.show('level01');   loading.progress(0.4);   loading.hide();
 */

/** What each chapter is called, and a line from its part of the story. */
export const CHAPTERS = {
  prologue: { kicker: 'PROLOGUE', title: 'THE FIRE AND THE STONE',
    lore: 'They say if the horn ever leaves the stone, the whole forest goes silent.' },
  level01: { kicker: 'LEVEL 1', title: 'THE OLD TRAIL',
    lore: 'The last crew that went past the stone never came back.' },
  'level02-intro': { kicker: 'LEVEL 2', title: 'THE RIVER ROAD',
    lore: 'A year of the company’s wages, for one morning’s work.' },
  level02: { kicker: 'LEVEL 2', title: 'THE RIVER ROAD',
    lore: 'A year of the company’s wages, for one morning’s work.' },
  level03: { kicker: 'LEVEL 3', title: 'THE FALLS',
    lore: 'Nobody looks twice at a guide on the paths at dawn.' },
};

const CSS = THEME_CSS + ART_CSS + `
.ld { position:fixed; inset:0; z-index:10000; overflow:hidden; background:#05070a; opacity:0; visibility:hidden;
  transition:opacity .35s ease, visibility 0s linear .35s; pointer-events:none; }
.ld.show { opacity:1; visibility:visible; transition:opacity .35s ease; pointer-events:auto; }
.ld .art-forest { filter:brightness(.55) saturate(.9); }
.ld-in { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px;
  font-family:${DIALOGUE_FONT}; color:#f2e8d5; text-align:center; padding:0 16px; }
.ld-horn { width:min(220px, 46vw); margin-bottom:10px; animation:ldBreathe 2.4s ease-in-out infinite; }
.ld-kicker { font-size:13px; letter-spacing:.5em; text-indent:.5em; color:var(--gold); }
.ld-title { font-size:clamp(26px, 4.4vw, 46px); font-weight:600; letter-spacing:.28em; text-indent:.28em;
  text-shadow:0 2px 0 rgba(0,0,0,.5), 0 0 28px rgba(255,176,58,.25); }
.ld-lore { max-width:560px; margin-top:14px; font-size:19px; font-style:italic; color:#e8ddc8; opacity:.9;
  text-shadow:0 2px 14px rgba(0,0,0,.95); }
.ld-bar { width:min(320px, 64vw); height:2px; margin-top:26px; background:rgba(227,187,98,.2); overflow:hidden; }
.ld-bar b { display:block; height:100%; width:0; background:linear-gradient(90deg, var(--gold-dim), var(--gold)); transition:width .2s; }
.ld-pct { margin-top:8px; font:600 10px var(--sans); letter-spacing:.32em; color:var(--ink-dim); }
@keyframes ldBreathe { 50% { filter:drop-shadow(0 0 18px rgba(79,214,224,.55)); transform:translateY(-3px); } }
`;

export class LoadingScreen {
  constructor() {
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);
    this.el = document.createElement('div');
    this.el.className = 'ld fh'; // .fh: the theme's colour variables
    this.el.innerHTML = `
      ${forestBackdrop()}
      <canvas class="art-motes"></canvas>
      <div class="art-vignette"></div>
      <div class="ld-in">
        <div class="ld-horn">${hornEmblem({ fill: true, id: 'ld-horn' })}</div>
        <div class="ld-kicker"></div>
        <div class="ld-title"></div>
        <div class="ld-lore"></div>
        <div class="ld-bar"><b></b></div>
        <div class="ld-pct">LOADING</div>
      </div>`;
    document.body.appendChild(this.el);
    const q = (s) => this.el.querySelector(s);
    this.kicker = q('.ld-kicker');
    this.title = q('.ld-title');
    this.lore = q('.ld-lore');
    this.bar = q('.ld-bar b');
    this.pct = q('.ld-pct');
    this.fill = q('.horn-fill');
    this.motes = new Fireflies(q('.art-motes'), 50);
    this.visible = false;
  }

  /** Cover the screen for `name` (a registered level). Chapters without an entry just say LOADING. */
  show(name) {
    const c = CHAPTERS[name] || { kicker: '', title: 'LOADING', lore: '' };
    this.kicker.textContent = c.kicker;
    this.title.textContent = c.title;
    this.lore.textContent = c.lore ? `“${c.lore}”` : '';
    this.progress(0);
    this.el.classList.add('show');
    this.motes.start();
    this.visible = true;
  }

  /** 0..1: the horn fills base to tip, the bar left to right. */
  progress(p) {
    const k = Math.max(0, Math.min(1, p));
    this.bar.style.width = `${Math.round(k * 100)}%`;
    this.fill.setAttribute('width', String(Math.round(40 + k * 200))); // the horn spans x 30..230
    this.pct.textContent = k > 0 ? `LOADING · ${Math.round(k * 100)}%` : 'LOADING';
  }

  hide() {
    this.progress(1);
    this.el.classList.remove('show');
    this.visible = false;
    setTimeout(() => { if (!this.visible) this.motes.stop(); }, 400);
  }
}
