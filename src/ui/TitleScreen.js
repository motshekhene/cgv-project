import { THEME_CSS } from './theme.js';
import { DIALOGUE_FONT, ensureDialogueFont } from './dialogue.js';
import { CHAPTERS } from './LoadingScreen.js';
import { GAME_TITLE, GAME_SUBTITLE, TAGLINE } from './brand.js';

/**
 * TitleScreen — the words and the menu over the title level (levels/
 * TitleScene.js: the glade at dawn, the horn on its stone, the camera
 * drifting round it). The left of the screen darkens for the text; the
 * scene keeps the right.
 *
 * "PRESS ANY KEY" first: that press is also the gesture browsers want before
 * they will play sound, so the theme comes up with the menu. Then:
 *
 *   NEW GAME   the prologue, from the fire
 *   CHAPTERS   jump to any part of the story
 *   CONTROLS   the same H panel every level has
 *
 * Arrow keys / W S and Enter, or the mouse. It never touches Game itself:
 * main.js passes onStart(levelName) and onControls.
 */

const THEME_MUSIC = '/assets/audio/sounduniversestudio-repeat-gaming-background-music-instrumental-218942.mp3';

const MENU = [
  { id: 'new', label: 'NEW GAME' },
  { id: 'chapters', label: 'CHAPTERS' },
  { id: 'controls', label: 'CONTROLS' },
];
const CHAPTER_LIST = ['prologue', 'level01', 'level02', 'level03'];

const CSS = THEME_CSS + `
.ts { position:fixed; inset:0; z-index:9500; overflow:hidden; user-select:none; font-family:${DIALOGUE_FONT}; color:#f2e8d5;
  transition:opacity .9s ease; }
.ts.out { opacity:0; pointer-events:none; }
.ts::before { content:''; position:absolute; inset:0; pointer-events:none;
  background:linear-gradient(90deg, rgba(4,6,4,.9) 0%, rgba(4,6,4,.72) 28%, rgba(4,6,4,.18) 55%, rgba(4,6,4,0) 70%),
             radial-gradient(ellipse at 70% 55%, rgba(0,0,0,0) 40%, rgba(2,4,3,.55) 100%); }
.ts-in { position:absolute; left:clamp(28px, 7vw, 120px); top:0; bottom:0; width:min(820px, 88vw);
  display:flex; flex-direction:column; justify-content:center; }
.ts-kicker { font-size:13px; letter-spacing:.5em; color:var(--gold); opacity:0; animation:tsUp .9s ease .3s forwards; }
.ts-title { margin:10px 0 0; font-weight:600; line-height:.95; letter-spacing:.06em; white-space:nowrap; padding-right:.1em;
  font-size:clamp(38px, 6.2vw, 92px); color:transparent; -webkit-background-clip:text; background-clip:text;
  background-image:linear-gradient(180deg, #fff6dc 0%, #e8c06a 52%, #8a6226 100%);
  filter:drop-shadow(0 3px 0 rgba(0,0,0,.65)) drop-shadow(0 0 30px rgba(227,187,98,.28));
  opacity:0; animation:tsTitle 1.8s cubic-bezier(.2,.7,.2,1) .5s forwards; }
.ts-sub { margin-top:6px; font-size:clamp(14px, 1.5vw, 18px); letter-spacing:.48em; color:var(--gold); opacity:0; animation:tsUp .9s ease 1s forwards; }
.ts-rule { width:min(300px, 60vw); height:1px; margin:20px 0 14px; border:0;
  background:linear-gradient(90deg, var(--gold), transparent); transform:scaleX(0); transform-origin:left;
  animation:tsLine 1.2s ease 1.2s forwards; }
.ts-tag { max-width:440px; font-size:clamp(16px, 1.6vw, 20px); font-style:italic; line-height:1.45; color:#e8ddc8;
  text-shadow:0 2px 14px rgba(0,0,0,.95); opacity:0; animation:tsUp .9s ease 1.6s forwards; }
.ts-press { margin-top:48px; font-size:14px; letter-spacing:.42em; color:#cfd6c4;
  opacity:0; animation:tsUp .8s ease 2.2s forwards, tsPulse 2.2s ease-in-out 3s infinite; }
.ts.menu .ts-press { display:none; }
.ts-menu { display:none; margin-top:40px; flex-direction:column; align-items:flex-start; gap:4px; }
.ts.menu .ts-menu { display:flex; }
.ts-btn { position:relative; padding:8px 0 8px 30px; cursor:pointer; font:600 19px ${DIALOGUE_FONT}; letter-spacing:.28em;
  color:rgba(242,232,213,.62); text-shadow:0 2px 10px rgba(0,0,0,.9); opacity:0; animation:tsUp .5s ease forwards; animation-delay:var(--d);
  transition:color .15s, letter-spacing .25s, transform .2s; }
.ts-btn::before { content:''; position:absolute; left:4px; top:50%; width:9px; height:9px; margin-top:-5px; background:var(--gold);
  transform:rotate(45deg) scale(0); transition:transform .18s; box-shadow:0 0 10px rgba(227,187,98,.8); }
.ts-btn.on { color:#fff4d8; letter-spacing:.34em; transform:translateX(4px); }
.ts-btn.on::before { transform:rotate(45deg) scale(1); }
.ts-btn small { display:block; margin-top:2px; font:500 14px ${DIALOGUE_FONT}; font-style:italic; letter-spacing:.04em; color:var(--ink-dim); }
.ts-foot { position:absolute; left:clamp(28px, 7vw, 120px); bottom:22px; font:600 10px var(--sans); letter-spacing:.3em; color:rgba(184,170,138,.65); }
@keyframes tsTitle { from { opacity:0; transform:translateY(14px); filter:blur(10px); } to { opacity:1; transform:none; } }
@keyframes tsLine { to { transform:scaleX(1); } }
@keyframes tsUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
@keyframes tsPulse { 0%,100% { opacity:1; } 50% { opacity:.35; } }
`;

export class TitleScreen {
  constructor({ onStart, onControls, skipPress = false }) {
    ensureDialogueFont();
    this.onStart = onStart;
    this.onControls = onControls;
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    this.el = document.createElement('div');
    this.el.className = 'ts fh';
    this.el.innerHTML = `
      <div class="ts-in">
        <div class="ts-kicker">A FOREST · A HORN · A DEBT</div>
        <h1 class="ts-title">${GAME_TITLE}</h1>
        ${GAME_SUBTITLE ? `<div class="ts-sub">${GAME_SUBTITLE}</div>` : ''}
        <hr class="ts-rule">
        <div class="ts-tag">${TAGLINE}</div>
        <div class="ts-press">PRESS ANY KEY</div>
        <div class="ts-menu"></div>
      </div>
      <div class="ts-foot">↑ ↓ CHOOSE · ENTER SELECT · H CONTROLS</div>`;
    document.body.appendChild(this.el);

    this.menuEl = this.el.querySelector('.ts-menu');
    this.inMenu = false;
    this.items = [];
    this.sel = 0;

    this._onKey = this._onKey.bind(this);
    this._onPress = this._onPress.bind(this);
    window.addEventListener('keydown', this._onKey);
    this.el.addEventListener('pointerdown', this._onPress);
    if (skipPress) this._openMenu();
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
      sub: CHAPTERS[name].kicker.charAt(0) + CHAPTERS[name].kicker.slice(1).toLowerCase(),
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
      b.style.setProperty('--d', `${(i * 0.07).toFixed(2)}s`);
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
    clearInterval(this._fadeTimer);
    if (this.music && !this._leaving) this.music.pause();
    this.el.remove();
    this.style.remove();
  }
}
