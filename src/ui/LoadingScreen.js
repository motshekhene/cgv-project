import { THEME_CSS } from './theme.js';
import { DIALOGUE_FONT } from './dialogue.js';
import { Fireflies } from './artwork.js';
import { GAME_TITLE } from './brand.js';

/**
 * LoadingScreen — the one loading screen in the game, used for every level
 * switch (main.js hangs it on game.onLevelLoading), so they all look alike:
 *
 *   the chapter's own picture (a frame from the game, public/assets/guide/)
 *   filling the screen under a slow zoom, darkened toward the bottom left;
 *   there the chapter's number and name, a line from its part of the story,
 *   and a thin gold line along the bottom of the screen for how far it has
 *   loaded. Fireflies drift over it.
 *
 *   const loading = new LoadingScreen();
 *   loading.show('level01');   loading.progress(0.4);   loading.hide();
 */

/** What each chapter is called, a line from its part of the story, and its picture. */
export const CHAPTERS = {
  title: { kicker: '', title: GAME_TITLE, lore: '', img: 'ch-prologue' },
  prologue: { kicker: 'PROLOGUE', title: 'THE FIRE AND THE STONE', img: 'ch-prologue',
    lore: 'They say if the horn ever leaves the stone, the whole forest goes silent.' },
  level01: { kicker: 'LEVEL 1', title: 'THE OLD TRAIL', img: 'ch-level01',
    lore: 'The last crew that went past the stone never came back.' },
  'level02-intro': { kicker: 'LEVEL 2', title: 'THE RIVER ROAD', img: 'tr-road',
    lore: 'A year of the company’s wages, for one morning’s work.' },
  level02: { kicker: 'LEVEL 2', title: 'THE RIVER ROAD', img: 'ch-level02',
    lore: 'A year of the company’s wages, for one morning’s work.' },
  level03: { kicker: 'LEVEL 3', title: 'THE FALLS', img: 'ch-level03',
    lore: 'Nobody looks twice at a guide on the paths at dawn.' },
  epilogue: { kicker: 'EPILOGUE', title: 'THE STONE', img: 'ch-epilogue',
    lore: 'Some things only belong in one place.' },
};
const IMG = (name) => `./assets/guide/${name}.jpg`;

const CSS = THEME_CSS + `
.ld { position:fixed; inset:0; z-index:10000; overflow:hidden; opacity:0; visibility:hidden; background:#040504;
  transition:opacity .35s ease, visibility 0s linear .35s; pointer-events:none; }
.ld.show { opacity:1; visibility:visible; transition:opacity .35s ease; pointer-events:auto; }
.ld-pic { position:absolute; inset:-3%; background-size:cover; background-position:center; opacity:0; transition:opacity .8s ease; }
.ld-pic.on { opacity:1; animation:ldKen 14s ease-out forwards; }
.ld::after { content:''; position:absolute; inset:0; pointer-events:none;
  background:linear-gradient(20deg, rgba(3,4,3,.95) 0%, rgba(3,4,3,.75) 30%, rgba(3,4,3,.15) 60%, rgba(3,4,3,.35) 100%),
             radial-gradient(ellipse at 60% 40%, rgba(0,0,0,0) 40%, rgba(0,0,0,.5) 100%); }
.ld-motes { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; opacity:.6; z-index:1; }
.ld-in { position:absolute; left:clamp(24px, 7vw, 110px); right:24px; bottom:clamp(40px, 12vh, 110px); z-index:2;
  font-family:${DIALOGUE_FONT}; color:#f2e8d5; }
.ld-kicker { font:700 12px var(--sans); letter-spacing:.5em; color:var(--gold); text-shadow:0 2px 8px #000; }
.ld-title { margin-top:8px; font-size:clamp(32px, 5.4vw, 64px); font-weight:600; line-height:1; letter-spacing:.14em; color:transparent;
  -webkit-background-clip:text; background-clip:text; background-image:linear-gradient(180deg, #fff6dc 0%, #e8c06a 55%, #a07430 100%);
  filter:drop-shadow(0 3px 0 rgba(0,0,0,.65)) drop-shadow(0 0 26px rgba(227,187,98,.25)); }
.ld-lore { max-width:560px; margin-top:14px; font-size:clamp(16px, 1.6vw, 20px); font-style:italic; color:#e8ddc8; text-shadow:0 2px 14px rgba(0,0,0,.95); }
.ld-pct { margin-top:20px; font:600 10px var(--sans); letter-spacing:.34em; color:var(--ink-dim); }
.ld-bar { position:absolute; left:0; right:0; bottom:0; height:3px; z-index:2; background:rgba(227,187,98,.14); }
.ld-bar b { display:block; height:100%; width:0; background:linear-gradient(90deg, var(--gold-dim), var(--gold)); box-shadow:0 0 12px rgba(227,187,98,.7); transition:width .25s ease; }
.ld.show .ld-in > * { animation:ldUp .7s ease both; }
.ld.show .ld-title { animation-delay:.08s; } .ld.show .ld-lore { animation-delay:.18s; } .ld.show .ld-pct { animation-delay:.26s; }
@keyframes ldKen { from { transform:scale(1.03); } to { transform:scale(1.12) translate(-1%, -1%); } }
@keyframes ldUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
@media (prefers-reduced-motion: reduce) { .ld * { animation:none !important; } }
`;

export class LoadingScreen {
  constructor() {
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);
    this.el = document.createElement('div');
    this.el.className = 'ld fh'; // .fh: the theme's colour variables
    this.el.innerHTML = `
      <div class="ld-pic"></div>
      <canvas class="ld-motes"></canvas>
      <div class="ld-in">
        <div class="ld-kicker"></div>
        <div class="ld-title"></div>
        <div class="ld-lore"></div>
        <div class="ld-pct">LOADING</div>
      </div>
      <div class="ld-bar"><b></b></div>`;
    document.body.appendChild(this.el);
    const q = (s) => this.el.querySelector(s);
    this.pic = q('.ld-pic');
    this.kicker = q('.ld-kicker');
    this.title = q('.ld-title');
    this.lore = q('.ld-lore');
    this.bar = q('.ld-bar b');
    this.pct = q('.ld-pct');
    this.motes = new Fireflies(q('.ld-motes'), 50);
    this.visible = false;
    this._p = 0;
    // every chapter's picture in early, so none of them arrives after its loading screen
    for (const c of Object.values(CHAPTERS)) if (c.img) new Image().src = IMG(c.img);
  }

  /** Cover the screen for `name` (a registered level). Chapters without an entry just say LOADING. */
  show(name) {
    const c = CHAPTERS[name] || { kicker: '', title: 'LOADING', lore: '' };
    this.kicker.textContent = c.kicker;
    this.title.textContent = c.title;
    this.lore.textContent = c.lore ? `“${c.lore}”` : '';
    // its picture, its slow zoom started again
    this.pic.classList.remove('on');
    this.pic.style.backgroundImage = c.img ? `url('${IMG(c.img)}')` : 'none';
    void this.pic.offsetWidth;
    if (c.img) this.pic.classList.add('on');
    this.progress(0);
    this.el.classList.remove('show');
    void this.el.offsetWidth; // the words come up again for each chapter
    this.el.classList.add('show');
    this.motes.start();
    this.visible = true;
  }

  /** 0..1: the line along the bottom. */
  progress(p) {
    this._p = Math.max(0, Math.min(1, p));
    this.bar.style.width = `${Math.round(this._p * 100)}%`;
    this.pct.textContent = this._p > 0 ? `LOADING · ${Math.round(this._p * 100)}%` : 'LOADING';
  }

  hide() {
    this.progress(1);
    this.el.classList.remove('show');
    this.visible = false;
    setTimeout(() => { if (!this.visible) this.motes.stop(); }, 400);
  }
}
