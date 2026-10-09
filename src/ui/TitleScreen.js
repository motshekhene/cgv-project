import { THEME_CSS } from './theme.js';
import { DIALOGUE_FONT, ensureDialogueFont } from './dialogue.js';
import { ART_CSS, forestBackdrop, hornEmblem, Fireflies } from './artwork.js';
import { CHAPTERS } from './LoadingScreen.js';

/**
 * TitleScreen — the front door, before the prologue.
 *
 * The valley at dawn in parallax layers that lean with the mouse, fireflies,
 * the horn glowing in the middle and the game's name in the dialogue serif.
 * "PRESS ANY KEY" first: that press is also the gesture browsers want before
 * they will play sound, so the theme comes up with the menu. Then:
 *
 *   NEW GAME   the prologue, from the fire
 *   CHAPTERS   jump to any part of the story
 *   CONTROLS   the same H panel every level has
 *
 * Arrow keys / W S and Enter, or the mouse. It never touches Game itself:
 * main.js passes onStart(levelName) and the H panel.
 *
 *   const title = new TitleScreen({ onStart: (name) => game.setLevel(name), onControls });
 */

const THEME_MUSIC = '/assets/audio/sounduniversestudio-repeat-gaming-background-music-instrumental-218942.mp3';

const MENU = [
  { id: 'new', label: 'NEW GAME' },
  { id: 'chapters', label: 'CHAPTERS' },
  { id: 'controls', label: 'CONTROLS' },
];
const CHAPTER_LIST = ['prologue', 'level01', 'level02', 'level03'];

const CSS = THEME_CSS + ART_CSS + `
.ts { position:fixed; inset:0; z-index:9500; overflow:hidden; background:#05070a; user-select:none;
  font-family:${DIALOGUE_FONT}; color:#f2e8d5; transition:opacity .9s ease; }
.ts.out { opacity:0; pointer-events:none; }
.ts-in { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:0 16px; text-align:center; }
.ts-horn { width:min(250px, 52vw); margin-bottom:6px; opacity:0; transform:translateY(10px);
  animation:tsIn 1.6s cubic-bezier(.2,.7,.2,1) .2s forwards, tsGlow 3.2s ease-in-out 1.8s infinite; }
.ts-title { margin:0; font-weight:600; letter-spacing:.3em; text-indent:.3em; line-height:1.05; white-space:nowrap;
  font-size:min(76px, calc(min(92vw, 1100px) / 11)); color:transparent; -webkit-background-clip:text; background-clip:text;
  background-image:linear-gradient(180deg, #fff4d8 0%, #e3bb62 55%, #7d5a22 100%);
  filter:drop-shadow(0 3px 0 rgba(0,0,0,.6)) drop-shadow(0 0 26px rgba(227,187,98,.3));
  opacity:0; animation:tsTrack 2s cubic-bezier(.2,.7,.2,1) .6s forwards; }
.ts-rule { width:min(420px, 70vw); height:1px; margin:16px auto 12px; border:0;
  background:linear-gradient(90deg, transparent, var(--gold), transparent); transform:scaleX(0); animation:tsLine 1.2s ease 1.3s forwards; }
.ts-tag { font-size:clamp(15px, 2vw, 20px); font-style:italic; color:#e8ddc8; text-shadow:0 2px 14px rgba(0,0,0,.95);
  opacity:0; animation:tsUp .9s ease 1.7s forwards; }
.ts-press { margin-top:44px; font-size:14px; letter-spacing:.42em; text-indent:.42em; color:#cfd6c4;
  text-shadow:0 2px 12px rgba(0,0,0,.95); opacity:0; animation:tsUp .8s ease 2.3s forwards, tsPulse 2.2s ease-in-out 3.1s infinite; }
.ts.menu .ts-press { display:none; }
.ts-menu { display:none; margin-top:34px; flex-direction:column; align-items:center; gap:10px; }
.ts.menu .ts-menu { display:flex; }
.ts-btn { position:relative; min-width:260px; padding:11px 26px 12px; cursor:pointer; text-align:center;
  font:600 15px ${DIALOGUE_FONT}; letter-spacing:.34em; text-indent:.34em; color:var(--ink);
  border:1px solid rgba(227,187,98,.28); border-radius:2px; background:linear-gradient(180deg, rgba(38,44,28,.72), rgba(13,17,11,.72));
  box-shadow:0 6px 18px rgba(0,0,0,.45); opacity:0; animation:tsUp .5s ease forwards; animation-delay:var(--d);
  transition:border-color .15s, box-shadow .15s, color .15s, transform .15s; }
.ts-btn::before, .ts-btn::after { content:''; position:absolute; top:50%; width:6px; height:6px; margin-top:-3px; background:var(--gold);
  transform:rotate(45deg) scale(0); transition:transform .15s; box-shadow:0 0 6px rgba(227,187,98,.6); }
.ts-btn::before { left:-3px; } .ts-btn::after { right:-3px; }
.ts-btn.on { border-color:var(--gold); color:#fff4d8; box-shadow:0 0 22px rgba(227,187,98,.32), 0 6px 18px rgba(0,0,0,.45); transform:translateY(-1px); }
.ts-btn.on::before, .ts-btn.on::after { transform:rotate(45deg) scale(1); }
.ts-btn small { display:block; margin-top:3px; font:500 12px ${DIALOGUE_FONT}; font-style:italic; letter-spacing:.06em; text-indent:0; color:var(--ink-dim); }
.ts-foot { position:absolute; left:0; right:0; bottom:18px; text-align:center; font:600 10px var(--sans); letter-spacing:.3em; color:rgba(184,170,138,.6); }
@keyframes tsIn { to { opacity:1; transform:none; } }
@keyframes tsGlow { 50% { filter:drop-shadow(0 0 22px rgba(79,214,224,.6)); } }
@keyframes tsTrack { from { opacity:0; letter-spacing:.8em; filter:blur(8px); } to { opacity:1; } }
@keyframes tsLine { to { transform:scaleX(1); } }
@keyframes tsUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
@keyframes tsPulse { 0%,100% { opacity:1; } 50% { opacity:.35; } }
`;

export class TitleScreen {
  constructor({ onStart, onControls }) {
    ensureDialogueFont();
    this.onStart = onStart;
    this.onControls = onControls;
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    this.el = document.createElement('div');
    this.el.className = 'ts fh';
    this.el.innerHTML = `
      ${forestBackdrop()}
      <canvas class="art-motes"></canvas>
      <div class="art-vignette"></div>
      <div class="ts-in">
        <div class="ts-horn">${hornEmblem({ id: 'ts-horn' })}</div>
        <h1 class="ts-title">BLACKOUT PROTOCOL</h1>
        <hr class="ts-rule">
        <div class="ts-tag">The horn keeps the forest alive. Someone has been paid to take it.</div>
        <div class="ts-press">PRESS ANY KEY</div>
        <div class="ts-menu"></div>
      </div>
      <div class="ts-foot">ARROWS / W S TO CHOOSE · ENTER TO SELECT · H — CONTROLS</div>`;
    document.body.appendChild(this.el);

    this.menuEl = this.el.querySelector('.ts-menu');
    this.layers = [...this.el.querySelectorAll('.art-forest g[data-depth]')];
    this.motes = new Fireflies(this.el.querySelector('.art-motes'), 80);
    this.motes.start();
    this.inMenu = false;
    this.items = [];
    this.sel = 0;

    this._onKey = this._onKey.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onPress = this._onPress.bind(this);
    window.addEventListener('keydown', this._onKey);
    window.addEventListener('pointermove', this._onMove);
    this.el.addEventListener('pointerdown', this._onPress);
  }

  /* ---------------------------------------------------------------- input */

  _onPress(e) {
    if (!this.inMenu) {
      e.preventDefault();
      this._openMenu();
    }
  }

  _onKey(e) {
    const k = e.key.toLowerCase();
    if (k === 'h') return; // the controls panel is Game's, on every screen
    if (!this.inMenu) {
      if (['shift', 'control', 'alt', 'meta'].includes(k)) return;
      e.preventDefault();
      this._openMenu();
      return;
    }
    if (k === 'arrowdown' || k === 's') this._select(this.sel + 1);
    else if (k === 'arrowup' || k === 'w') this._select(this.sel - 1);
    else if (k === 'enter' || k === ' ') this._activate(this.items[this.sel]);
    else if ((k === 'escape' || k === 'backspace') && this._page === 'chapters') this._showMain();
    else return;
    e.preventDefault();
  }

  _onMove(e) {
    const x = e.clientX / window.innerWidth - 0.5;
    const y = e.clientY / window.innerHeight - 0.5;
    for (const g of this.layers) {
      const d = Number(g.dataset.depth);
      g.style.transform = `translate(${(-x * 40 * d).toFixed(1)}px, ${(-y * 18 * d).toFixed(1)}px)`;
    }
  }

  /* ---------------------------------------------------------------- menus */

  _openMenu() {
    this.inMenu = true;
    this.el.classList.add('menu');
    this._startMusic();
    this._showMain();
  }

  _showMain() {
    this._page = 'main';
    this._build(MENU.map((m) => ({ ...m })));
  }

  _showChapters() {
    this._page = 'chapters';
    const list = CHAPTER_LIST.map((name) => ({
      id: 'chapter', name, label: CHAPTERS[name].title,
      sub: `${CHAPTERS[name].kicker.charAt(0)}${CHAPTERS[name].kicker.slice(1).toLowerCase()}`,
    }));
    list.push({ id: 'back', label: 'BACK' });
    this._build(list);
  }

  _build(items) {
    this.items = items;
    this.menuEl.innerHTML = '';
    items.forEach((it, i) => {
      const b = document.createElement('div');
      b.className = 'ts-btn';
      b.style.setProperty('--d', `${(i * 0.08).toFixed(2)}s`);
      b.innerHTML = it.sub ? `${it.label}<small>${it.sub}</small>` : it.label;
      b.addEventListener('pointerenter', () => this._select(i));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this._activate(it);
      });
      it.el = b;
      this.menuEl.appendChild(b);
    });
    this._select(0);
  }

  _select(i) {
    const n = this.items.length;
    this.sel = (i + n) % n;
    this.items.forEach((it, j) => it.el.classList.toggle('on', j === this.sel));
  }

  _activate(it) {
    if (!it || this._leaving) return;
    if (it.id === 'new') this._start('prologue');
    else if (it.id === 'chapters') this._showChapters();
    else if (it.id === 'controls') this.onControls?.();
    else if (it.id === 'back') this._showMain();
    else if (it.id === 'chapter') this._start(it.name);
  }

  /* ---------------------------------------------------------------- music */

  _startMusic() {
    if (this.music) return;
    const a = new Audio(THEME_MUSIC);
    a.loop = true;
    a.volume = 0;
    this.music = a;
    a.play().then(() => this._fadeMusic(0.4, 2.5)).catch(() => {});
  }

  _fadeMusic(to, secs, done) {
    const a = this.music;
    if (!a) { done?.(); return; }
    clearInterval(this._fadeTimer);
    const from = a.volume;
    const t0 = performance.now();
    this._fadeTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
      a.volume = from + (to - from) * k;
      if (k >= 1) { clearInterval(this._fadeTimer); done?.(); }
    }, 30);
  }

  /* ---------------------------------------------------------------- leave */

  _start(name) {
    this._leaving = true;
    this._fadeMusic(0, 0.9, () => this.music?.pause());
    this.el.classList.add('out');
    setTimeout(() => {
      this.dispose();
      this.onStart?.(name);
    }, 650);
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('pointermove', this._onMove);
    clearInterval(this._fadeTimer);
    this.motes.stop();
    this.el.remove();
    this.style.remove();
  }
}
