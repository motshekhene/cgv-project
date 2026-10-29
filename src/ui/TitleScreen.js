import { THEME_CSS } from './theme.js';
import { DIALOGUE_FONT, ensureDialogueFont } from './dialogue.js';
import { CHAPTERS } from './LoadingScreen.js';
import { GAME_TITLE, TAGLINE } from './brand.js';
import { settings, onSettings } from '../core/settings.js';
import { isMuted } from '../audio/masterMute.js';
import { CURRENCY, balance, owns } from '../core/wallet.js';
import { CARS } from '../levels/level2/carSelect.js';
import { CARDS, foundCount, todaysCard } from '../cards/cards.js';
import { PLAYERS, currentPlayer, savePlayer } from '../player/roster.js';
import { LandingHorn } from './LandingHorn.js';
import { lastChapter } from '../core/progress.js';

/**
 * TitleScreen — over the title level (levels/TitleScene.js: the glade at
 * dawn, the horn on its stone), in two parts:
 *
 *   THE LANDING   first thing on opening the game, while the game is still
 *                 loading (there is no loading screen before it): the horn
 *                 alone in the dark (ui/LandingHorn.js), turning slowly,
 *                 glowing, mist and motes round it; the title fades in under
 *                 it in gold with light running across it, the tagline, and a
 *                 thin gold line under the words filling as it loads, with
 *                 LOADING · 42% under it (progress); when it has (ready),
 *                 they give way to PRESS ANY KEY. The press is
 *                 the horn being blown: a deep call, the horn blazing, a
 *                 flash, and the dark fading away onto the glade
 *                 (TitleScene.wake: the horn flares there, a ring of its light
 *                 running out), where the menu is. It is also the gesture
 *                 browsers want before they will play sound, so the theme
 *                 comes up with the menu.
 *   THE MENU      the title small at the top left, the menu under it with a
 *                 line about whichever item is picked, and in the corner where
 *                 you stand: Forest Lights to spend, cars, spirit cards, and
 *                 whether today's card is still out there. That rises in a row
 *                 at a time, and whatever has changed since it was last shown
 *                 counts on from what it was, the difference beside it.
 *
 *   CONTINUE   the start of the last chapter played (core/progress.js); only
 *              there once a story is under way, and the one selected
 *   NEW GAME   the prologue, from the fire
 *   CHAPTERS   jump to any part of the story
 *   PLAYER     who you play (player/roster.js), each standing at the stone as
 *              you move through them; the choice is kept for next time
 *   PLAYBOOK   the rules, what everything does, and the places, with pictures (ui/Playbook.js)
 *   SPIRIT CARDS  the card album (ui/CardAlbum.js)
 *   RECORDS    each level's bests (ui/RecordsMenu.js, core/records.js)
 *   MAP        every landmark in the valley and the three levels (ui/GameMap.js)
 *   OPTIONS    volume, mouse, graphics (ui/OptionsMenu.js)
 *   CONTROLS   every chapter's controls (ui/ControlsMenu.js)
 *   CREDITS    the team, the cast, the music, and every asset with links (ui/CreditsMenu.js)
 *
 * Arrow keys / W S and Enter, or the mouse, each with its own small sound
 * (_sound): a pluck as the selection moves, a deeper one choosing, a falling
 * one going back. It never touches Game itself:
 * main.js passes onStart(levelName), the panels' openers, onPlayer(id) to show
 * a player at the stone (null to put them away) and onEnter(instant) for the
 * scene's wake. Back from a level (skipPress) it opens straight on the menu.
 */

const THEME_MUSIC = './assets/audio/sounduniversestudio-repeat-gaming-background-music-instrumental-218942.mp3';

const MENU = [
  { id: 'new', label: 'NEW GAME', about: 'Begin at the fire, with Baba Zwane.' },
  { id: 'chapters', label: 'CHAPTERS', about: 'Go straight to any part of the story.' },
  { id: 'player', label: 'PLAYER', about: 'Who you play. They stand at the stone as you choose.' },
  { id: 'playbook', label: 'PLAYBOOK', about: 'How to play, what everything does, and every place.' },
  { id: 'cards', label: 'SPIRIT CARDS', about: 'Your album. One card hides somewhere in the game each day.' },
  { id: 'records', label: 'RECORDS', about: 'Your best times and runs, level by level.' },
  { id: 'map', label: 'MAP', about: 'The valley and all three levels, every place named.' },
  { id: 'options', label: 'OPTIONS', about: 'Volume, mouse and graphics.' },
  { id: 'controls', label: 'CONTROLS', about: 'Every chapter’s keys.' },
  { id: 'credits', label: 'CREDITS', about: 'The team, the cast, the music, and everyone else.' },
];
const CHAPTER_LIST = ['prologue', 'level01', 'level02', 'level03', 'epilogue'];
const THEME_LEVEL = 0.4; // the theme's volume here, before the OPTIONS volumes
const themeVolume = () => THEME_LEVEL * settings.music * settings.master;
const SEEN_KEY = 'silent-horn.seen'; // what YOUR JOURNEY showed last time, so it can count on from there
// 'THE FIRE AND THE STONE' -> 'The Fire and the Stone', 'LEVEL 2' -> 'Level 2'
const SMALL_WORDS = new Set(['a', 'and', 'of', 'the', 'to']);
const titleCase = (s) => s.toLowerCase().split(' ')
  .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');


const CSS = THEME_CSS + `
.ts { position:fixed; inset:0; z-index:9500; overflow:hidden; user-select:none; font-family:${DIALOGUE_FONT}; color:#f2e8d5;
  transition:opacity .9s ease; }
.ts.out { opacity:0; pointer-events:none; }

/* ---- the landing: the horn alone in the dark, the words under it ---- */
.ts-land { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; text-align:center;
  padding-bottom:12vh; background:radial-gradient(ellipse at 50% 38%, #071214 0%, #020405 45%, #000 100%);
  transition:opacity 1.3s ease .5s, filter 1.3s ease .3s; }
.ts.menu .ts-land { opacity:0; filter:brightness(2.2) blur(3px); pointer-events:none; }
.ts-stage { position:absolute; inset:0; width:100%; height:100%; opacity:0; animation:tsUp 2.4s ease .2s forwards; }
.ts-land > :not(.ts-stage) { position:relative; }
/* the flash when the horn is blown */
.ts-flash { position:absolute; inset:0; pointer-events:none; opacity:0; background:radial-gradient(ellipse at 50% 50%, rgba(200,255,255,.9), rgba(79,214,224,.45) 30%, rgba(79,214,224,0) 70%); }
.ts.blown .ts-flash { animation:tsFlash 1.4s ease-out forwards; }
.ts-big { margin:10px 0 0; font-weight:600; line-height:1; letter-spacing:.08em; white-space:nowrap; font-size:clamp(40px, 8.4vw, 128px);
  filter:drop-shadow(0 4px 0 rgba(0,0,0,.7)) drop-shadow(0 0 40px rgba(227,187,98,.35)); }
/* each letter lands, then a band of light runs across the whole word every few seconds */
.ts-big span { display:inline-block; opacity:0; color:transparent; -webkit-background-clip:text; background-clip:text;
  background-image:linear-gradient(105deg, rgba(255,255,255,0) 42%, rgba(255,253,240,.95) 50%, rgba(255,255,255,0) 58%), linear-gradient(180deg, #fff6dc 0%, #e8c06a 52%, #8a6226 100%);
  background-size:900% 100%, 100% 100%; background-position:110% 0, 0 0;
  animation:tsLetter 1s cubic-bezier(.2,.8,.2,1) forwards, tsShine 6s ease-in-out infinite;
  animation-delay:calc(1.4s + var(--i) * .07s), calc(3.4s + var(--i) * .045s); }
.ts-land .ts-rule { width:min(380px, 60vw); height:1px; margin:18px auto 14px; border:0; background:linear-gradient(90deg, transparent, var(--gold), transparent);
  transform:scaleX(0); animation:tsLine 1.2s ease 2.4s forwards; }
.ts-land .ts-tag { max-width:560px; text-wrap:balance; font-size:clamp(16px, 1.7vw, 21px); font-style:italic; line-height:1.45; color:#e8ddc8;
  text-shadow:0 2px 14px rgba(0,0,0,.95); opacity:0; animation:tsUp .9s ease 2.7s forwards; }
/* under the words: the gold line while it loads, then PRESS ANY KEY in its place */
.ts-foot-land { position:relative; display:flex; justify-content:center; align-items:center; height:30px; margin-top:28px; width:100%; }
.ts-load { position:absolute; left:50%; top:50%; width:min(300px, 56vw); height:2px; margin:-1px 0 0 calc(min(300px, 56vw) / -2);
  background:rgba(227,187,98,.16); overflow:hidden; opacity:0; animation:tsUp .8s ease 2.4s forwards; transition:opacity .45s ease; }
.ts-load b { display:block; height:100%; width:0; background:linear-gradient(90deg, rgba(227,187,98,.4), #e3bb62, #fff1c8);
  box-shadow:0 0 12px rgba(227,187,98,.8); transition:width .3s ease; }
.ts-pct { position:absolute; left:0; right:0; top:calc(50% + 12px); font:600 10px var(--sans); letter-spacing:.32em; text-indent:.32em;
  color:rgba(232,221,200,.7); opacity:0; animation:tsUp .8s ease 2.4s forwards; transition:opacity .45s ease; }
.ts:not(.loading) .ts-load, .ts:not(.loading) .ts-pct { opacity:0 !important; animation:none; }
.ts.loading .ts-press { visibility:hidden; animation:none; }
.ts-press { display:flex; align-items:center; gap:16px; font:600 14px var(--sans); letter-spacing:.42em; text-indent:.42em; color:#e8f6f0;
  text-shadow:0 0 14px rgba(79,214,224,.6); opacity:0; animation:tsUp .8s ease .15s forwards; }
.ts-press b { font-weight:600; animation:tsPulse 2.2s ease-in-out 4s infinite; }
.ts-press i { width:8px; height:8px; background:#4fd6e0; transform:rotate(45deg); box-shadow:0 0 10px #4fd6e0; animation:tsPulse 2.2s ease-in-out 4s infinite; }

/* ---- the menu: the left of the screen darkens for it; the scene keeps the right ---- */
.ts-page { position:absolute; inset:0; opacity:0; pointer-events:none; transition:opacity .8s ease .35s; }
.ts.menu .ts-page { opacity:1; pointer-events:auto; }
.ts-page::before { content:''; position:absolute; inset:0; pointer-events:none;
  background:linear-gradient(90deg, rgba(4,6,4,.92) 0%, rgba(4,6,4,.74) 28%, rgba(4,6,4,.2) 55%, rgba(4,6,4,0) 70%),
             radial-gradient(ellipse at 70% 55%, rgba(0,0,0,0) 40%, rgba(2,4,3,.55) 100%); }
.ts-in { position:absolute; left:clamp(28px, 7vw, 120px); top:0; bottom:0; width:min(620px, 88vw); display:flex; flex-direction:column; justify-content:center; }
.ts-title { margin:0; font-weight:600; line-height:.95; letter-spacing:.06em; white-space:nowrap; font-size:clamp(30px, 4.2vw, 62px); color:transparent;
  -webkit-background-clip:text; background-clip:text; background-image:linear-gradient(180deg, #fff6dc 0%, #e8c06a 52%, #8a6226 100%);
  filter:drop-shadow(0 3px 0 rgba(0,0,0,.65)) drop-shadow(0 0 26px rgba(227,187,98,.26)); }
.ts-page .ts-rule { width:min(300px, 60vw); height:1px; margin:16px 0 12px; border:0; background:linear-gradient(90deg, var(--gold), transparent); }
.ts-menu { display:flex; flex-direction:column; align-items:flex-start; gap:2px; }
.ts-btn { position:relative; padding:7px 0 7px 30px; cursor:pointer; font:600 19px ${DIALOGUE_FONT}; letter-spacing:.28em;
  color:rgba(242,232,213,.6); text-shadow:0 2px 10px rgba(0,0,0,.9); opacity:0; transition:color .15s, letter-spacing .25s, transform .2s; }
.ts.menu .ts-btn { animation:tsUp .5s ease forwards; animation-delay:calc(.5s + var(--d)); }
.ts-btn::before { content:''; position:absolute; left:4px; top:50%; width:9px; height:9px; margin-top:-5px; background:var(--gold);
  transform:rotate(45deg) scale(0); transition:transform .18s; box-shadow:0 0 10px rgba(227,187,98,.8); }
.ts-btn::after { content:''; position:absolute; left:30px; right:-40px; bottom:2px; height:1px; background:linear-gradient(90deg, rgba(227,187,98,.6), transparent);
  transform:scaleX(0); transform-origin:left; transition:transform .25s ease; }
.ts-btn.on { color:#fff4d8; letter-spacing:.34em; transform:translateX(4px); }
.ts-btn.on::before { transform:rotate(45deg) scale(1); }
.ts-btn.on::after { transform:scaleX(1); }
.ts-btn small { display:block; margin-top:2px; font:500 14px ${DIALOGUE_FONT}; font-style:italic; letter-spacing:.04em; color:var(--ink-dim); }
.ts-about { min-height:22px; margin:14px 0 0 30px; font-size:16px; font-style:italic; color:#e8ddc8; text-shadow:0 2px 10px rgba(0,0,0,.9); transition:opacity .2s; }
/* where you stand, in the corner: what you've got to spend, cars, cards, today's card. It rises
   in after the menu a row at a time; what has changed since it was last shown counts on (_count) */
.ts-status { position:absolute; right:clamp(18px, 3vw, 40px); bottom:54px; width:250px; padding:14px 16px 12px; border-radius:8px;
  background:linear-gradient(160deg, rgba(30,34,22,.82), rgba(10,12,8,.88)); border:1px solid rgba(227,187,98,.32);
  box-shadow:0 12px 30px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.05); backdrop-filter:blur(4px); opacity:0; }
.ts.menu .ts-status { animation:tsUp .6s ease .9s forwards; }
.ts-status h4 { margin:0 0 10px; font:700 10px var(--sans); letter-spacing:.32em; color:var(--gold); }
.ts-stat { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:6px 0; border-top:1px solid rgba(239,228,200,.08);
  font:700 10px var(--sans); letter-spacing:.2em; color:var(--ink-dim); opacity:0; }
.ts.menu .ts-stat { animation:tsUp .45s ease forwards; animation-delay:calc(1.1s + var(--r) * .12s); }
.ts-stat b { display:inline-block; font:600 18px ${DIALOGUE_FONT}; letter-spacing:.02em; color:#fff4d8; font-variant-numeric:tabular-nums; }
.ts-stat b small { font:500 12px ${DIALOGUE_FONT}; color:var(--ink-dim); margin-left:2px; }
.ts-stat .n { display:inline-block; text-align:right; } /* as wide as it ends up, so the chip by it doesn't shift as it counts */
/* a number that's counting glows, and swells as it lands */
.ts-stat.moved b { animation:tsBump 1.5s ease calc(1.3s + var(--r) * .12s); }
.ts-stat.lights b { color:#e8fdff; text-shadow:0 0 10px rgba(79,214,224,.7); }
.ts-stat.lights > span::before { content:''; display:inline-block; width:8px; height:8px; margin-right:7px; border-radius:50%; background:#8ff0f6; box-shadow:0 0 8px #4fd6e0; vertical-align:0;
  animation:tsPulse 2.4s ease-in-out infinite; }
.ts-stat em { display:inline-block; font:italic 13px ${DIALOGUE_FONT}; letter-spacing:.02em; color:#bcd96a; text-transform:none; }
.ts-stat em.hunt { animation:tsHunt 3s ease-in-out 2s infinite; }
.ts-stat em.stamp { animation:tsStamp .6s cubic-bezier(.2,1.6,.4,1) calc(1.4s + var(--r) * .12s) both; }
.ts-stat em.hunt.stamp { animation:tsStamp .6s cubic-bezier(.2,1.6,.4,1) calc(1.4s + var(--r) * .12s) both, tsHunt 3s ease-in-out 2.6s infinite; }
/* the difference since last time (+45, −60), by the number, rising away after a while */
.ts-delta { margin-left:auto; padding:2px 7px; border-radius:10px; font:700 10px var(--sans); font-style:normal; letter-spacing:.08em; opacity:0;
  color:#ffe6a8; background:rgba(227,187,98,.14); border:1px solid rgba(227,187,98,.4);
  animation:tsDelta 5s ease calc(1.3s + var(--r) * .12s) forwards; }
.ts-stat.lights .ts-delta.up { color:#c8fbff; background:rgba(79,214,224,.14); border-color:rgba(79,214,224,.5); }
.ts-delta.down { color:#ffb08a; background:rgba(255,138,58,.12); border-color:rgba(255,138,58,.4); }
.ts-foot { position:absolute; left:clamp(28px, 7vw, 120px); bottom:22px; font:600 10px var(--sans); letter-spacing:.3em; color:rgba(184,170,138,.65); }

/* nine items: on a laptop-height screen everything closes up so the last one clears the foot */
@media (max-height:860px) {
  .ts-in { padding-bottom:30px; }
  .ts-page .ts-rule { margin:12px 0 8px; }
  .ts-btn { padding:5px 0 5px 30px; font-size:17px; }
  .ts-about { margin-top:8px; }
  .ts-foot-land { margin-top:20px; }
}
@media (max-height:640px) {
  .ts-land .ts-tag, .ts-about { display:none; }
  .ts-btn { padding:3px 0 3px 28px; font-size:15px; }
  .ts-status { display:none; }
}
@media (max-width:900px) { .ts-status { display:none; } }
@media (prefers-reduced-motion: reduce) { .ts * , .ts *::before, .ts *::after { animation-duration:.01s !important; animation-iteration-count:1 !important; } }
@keyframes tsLetter { from { opacity:0; transform:translateY(-.3em) scale(1.25); filter:blur(8px); } to { opacity:1; transform:none; filter:blur(0); } }
@keyframes tsLine { to { transform:scaleX(1); } }
@keyframes tsUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
@keyframes tsPulse { 0%,100% { opacity:1; } 50% { opacity:.35; } }
@keyframes tsShine { 0%, 62% { background-position:110% 0, 0 0; } 100% { background-position:-10% 0, 0 0; } }
@keyframes tsFlash { 0% { opacity:0; } 8% { opacity:1; } 100% { opacity:0; } }
@keyframes tsBump { 0%, 100% { transform:none; filter:none; } 20% { filter:brightness(1.3) drop-shadow(0 0 6px rgba(227,187,98,.6)); }
  80% { transform:scale(1.15); filter:brightness(1.6) drop-shadow(0 0 9px rgba(227,187,98,.9)); } }
@keyframes tsDelta { 0% { opacity:0; transform:translateY(8px) scale(.7); } 8% { opacity:1; transform:none; } 85% { opacity:1; transform:none; }
  100% { opacity:0; transform:translateY(-10px); } }
@keyframes tsStamp { from { opacity:0; transform:scale(1.7) rotate(-8deg); filter:blur(2px); } to { opacity:1; transform:none; filter:none; } }
@keyframes tsHunt { 50% { opacity:.55; } }
`;

export class TitleScreen {
  constructor({ onStart, onOptions, onControls, onCredits, onCards, onMap, onPlaybook, onRecords, onPlayer, onEnter, skipPress = false, loading = false }) {
    this.loading = loading; // the game still loading behind the landing: no key yet
    this._born = performance.now();
    this.onRecords = onRecords;
    this.onPlayer = onPlayer;
    this.onEnter = onEnter;
    this.onCards = onCards;
    this.onMap = onMap;
    this.onPlaybook = onPlaybook;
    ensureDialogueFont();
    this.onStart = onStart;
    this.onOptions = onOptions;
    this.onControls = onControls;
    this.onCredits = onCredits;
    // the theme follows the OPTIONS volumes as they're changed
    this._offSettings = onSettings((s, key) => {
      if ((key === 'music' || key === 'master') && this.music && !this._leaving) {
        clearInterval(this._fadeTimer);
        this.music.volume = themeVolume();
      }
    });
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    const letters = [...GAME_TITLE].map((ch, i) => `<span style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
    this.el = document.createElement('div');
    this.el.className = `ts fh${loading ? ' loading' : ''}`;
    this.el.innerHTML = `
      <div class="ts-land">
        <canvas class="ts-stage"></canvas>
        <h1 class="ts-big">${letters}</h1>
        <hr class="ts-rule">
        <div class="ts-tag">${TAGLINE}</div>
        <div class="ts-foot-land">
          <div class="ts-load"><b></b></div>
          <div class="ts-pct">LOADING</div>
          <div class="ts-press"><i></i><b>PRESS ANY KEY</b><i></i></div>
        </div>
      </div>
      <div class="ts-flash"></div>
      <div class="ts-page">
        <div class="ts-in">
          <h1 class="ts-title">${GAME_TITLE}</h1>
          <hr class="ts-rule">
          <div class="ts-menu"></div>
          <div class="ts-about"></div>
        </div>
        <div class="ts-status"></div>
        <div class="ts-foot">↑ ↓ CHOOSE · ENTER SELECT</div>
      </div>`;
    document.body.appendChild(this.el);

    this.menuEl = this.el.querySelector('.ts-menu');
    this.aboutEl = this.el.querySelector('.ts-about');
    this.inMenu = false;
    this.items = [];
    this.sel = 0;

    this._onKey = this._onKey.bind(this);
    this._onPress = this._onPress.bind(this);
    window.addEventListener('keydown', this._onKey);
    this.el.addEventListener('pointerdown', this._onPress);
    if (skipPress) this._openMenu(true);
    else {
      this.stage = new LandingHorn(this.el.querySelector('.ts-stage'));
      this.stage.start();
    }
  }

  /** The dark's horn, done with once the menu is up. */
  _endStage() {
    this.stage?.dispose();
    this.stage = null;
  }

  /* ---------------------------------------------------------------- input */

  /** 0..1: how far the game has loaded, on the landing's gold line. */
  progress(p) {
    const pct = Math.round(Math.max(0, Math.min(1, p)) * 100);
    const bar = this.el.querySelector('.ts-load b');
    if (bar) bar.style.width = `${pct}%`;
    const text = this.el.querySelector('.ts-pct');
    if (text) text.textContent = pct > 0 ? `LOADING · ${pct}%` : 'LOADING';
  }

  /** The game has loaded: the line fills, and PRESS ANY KEY comes up in its place. */
  ready() {
    this.progress(1);
    // the line fills first; and never before the title has finished landing
    const wait = Math.max(450, 3300 - (performance.now() - this._born));
    setTimeout(() => {
      this.loading = false;
      this.el.classList.remove('loading');
    }, wait);
  }

  _onPress(e) {
    if (this.loading) return; // not before it's ready
    if (!this.inMenu) {
      e.preventDefault();
      this._openMenu();
    }
  }

  _onKey(e) {
    const k = e.key.toLowerCase();
    if (!this.inMenu) {
      if (this.loading || ['shift', 'control', 'alt', 'meta'].includes(k)) return;
      e.preventDefault();
      this._openMenu();
      return;
    }
    if (k === 'arrowdown' || k === 's') this._select(this.sel + 1);
    else if (k === 'arrowup' || k === 'w') this._select(this.sel - 1);
    else if (k === 'enter' || k === ' ') this._activate(this.items[this.sel]);
    else if ((k === 'escape' || k === 'backspace') && this._page !== 'main') {
      this._sound('back');
      this._showMain(this._page);
    }
    else return;
    e.preventDefault();
  }

  /* ---------------------------------------------------------------- menus */

  /** The landing's key (or, `instant`, straight back from a level): the horn is blown, and the menu comes up. */
  _openMenu(instant = false) {
    this.inMenu = true;
    this.el.classList.add('menu');
    this.stage?.flare();
    setTimeout(() => this._endStage(), 2000); // once the dark has faded away
    this.onEnter?.(instant);
    if (!instant) {
      this.el.classList.add('blown');
      this._hornCall();
    }
    this._startMusic();
    this._showStatus();
    this._showMain();
  }

  /**
   * Where you stand: Forest Lights to spend, cars, spirit cards, and today's card.
   * Each number counts on from what it was the last time this was shown (from
   * nothing, the very first time), with the difference by it: +45 lights caught,
   * −60 spent on a car. Today's card is stamped in when it's news: found since,
   * or a new day's card out there.
   */
  _showStatus() {
    let today = null;
    try {
      today = todaysCard();
    } catch {
      today = null;
    }
    const now = {
      lights: balance(),
      cars: CARS.filter((c) => owns(c.id)).length,
      cards: foundCount(),
      day: today?.day ?? null,
      taken: !!today?.taken,
    };
    let seen = null;
    try {
      seen = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null');
      localStorage.setItem(SEEN_KEY, JSON.stringify(now));
    } catch {
      // storage blocked: it counts up from nothing each time
    }
    const was = (k) => (Number.isFinite(seen?.[k]) ? seen[k] : 0);
    const rows = [
      { key: 'lights', label: CURRENCY, cls: 'lights' },
      { key: 'cars', label: 'CARS', of: CARS.length },
      { key: 'cards', label: 'SPIRIT CARDS', of: CARDS.length },
    ];
    let html = '<h4>YOUR JOURNEY</h4>';
    rows.forEach((r, i) => {
      const d = seen ? now[r.key] - was(r.key) : 0; // the first time, there's no difference to show
      const chip = d ? `<i class="ts-delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : '−'}${Math.abs(d)}</i>` : '';
      const moved = was(r.key) !== now[r.key] ? ' moved' : '';
      html += `<div class="ts-stat ${r.cls || ''}${moved}" style="--r:${i}"><span>${r.label}</span>${chip}`
        + `<b><span class="n" style="min-width:${String(Math.max(was(r.key), now[r.key])).length}ch">${was(r.key)}</span>${r.of ? `<small>/ ${r.of}</small>` : ''}</b></div>`;
    });
    if (today) {
      const newDay = seen && seen.day !== now.day && !now.taken;
      const justFound = now.taken && !(seen?.day === now.day && seen.taken);
      const cls = now.taken ? (justFound ? 'stamp' : '') : `hunt${newDay ? ' stamp' : ''}`;
      html += `<div class="ts-stat" style="--r:3"><span>TODAY’S CARD</span>`
        + `<em class="${cls}">${now.taken ? 'found today ✓' : 'out there somewhere…'}</em></div>`;
    }
    const box = this.el.querySelector('.ts-status');
    box.innerHTML = html;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nums = box.querySelectorAll('.ts-stat .n');
    rows.forEach((r, i) => {
      if (still) nums[i].textContent = now[r.key];
      else if (was(r.key) !== now[r.key]) this._count(nums[i], was(r.key), now[r.key], 1300 + i * 120); // with its row's chip (CSS)
    });
  }

  /** Roll `el`'s number from a to b over a second and a bit, starting in `delay` ms. */
  _count(el, a, b, delay) {
    const t0 = performance.now() + delay;
    const step = (t) => {
      if (!this.el.isConnected) return;
      const k = Math.min(1, Math.max(0, (t - t0) / 1200));
      el.textContent = Math.round(a + (b - a) * (1 - (1 - k) ** 3));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** `from`: the page coming back from, so its item is the one selected. */
  _showMain(from = null) {
    this._page = 'main';
    this.onPlayer?.(null);
    // the chosen player's name under PLAYER
    const items = MENU.map((m) => ({ ...m, sub: m.id === 'player' ? currentPlayer().name : m.sub }));
    // a story under way: CONTINUE on top, and selected, with the chapter it picks up at
    const last = lastChapter();
    if (last && CHAPTERS[last]) {
      const c = CHAPTERS[last];
      const name = titleCase(c.title);
      items.unshift({ id: 'continue', chapter: last, label: 'CONTINUE', sub: `${titleCase(c.kicker)} · ${name}`, about: `Back to the start of ${name}.` });
    }
    this._build(items, Math.max(0, items.findIndex((m) => m.id === from)));
  }

  /** Every player, with their line; the one already chosen is selected (and at the stone). */
  _showPlayers() {
    this._page = 'player';
    const list = PLAYERS.map((p) => ({ id: 'pick', player: p, label: p.name.toUpperCase(), sub: p.line, about: 'Enter to play as them.' }));
    list.push({ id: 'back', label: 'BACK', about: 'Back to the menu.' });
    this._build(list, PLAYERS.indexOf(currentPlayer()));
  }

  _showChapters() {
    this._page = 'chapters';
    const list = CHAPTER_LIST.map((name) => ({
      id: 'chapter', name, label: CHAPTERS[name].title,
      sub: CHAPTERS[name].kicker.charAt(0) + CHAPTERS[name].kicker.slice(1).toLowerCase(),
    }));
    list.push({ id: 'back', label: 'BACK', about: 'Back to the menu.' });
    this._build(list);
  }

  _build(items, start = 0) {
    this.items = items;
    this.menuEl.innerHTML = '';
    items.forEach((it, i) => {
      const b = document.createElement('div');
      b.className = 'ts-btn';
      b.style.setProperty('--d', `${(i * 0.06).toFixed(2)}s`);
      b.innerHTML = it.sub ? `${it.label}<small>${it.sub}</small>` : it.label;
      b.addEventListener('pointerenter', () => this._select(i));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this._activate(it);
      });
      it.el = b;
      this.menuEl.appendChild(b);
    });
    this._select(start, true);
  }

  /** `quiet`: a page just built, not the player moving, so no sound. */
  _select(i, quiet = false) {
    const n = this.items.length;
    const to = (i + n) % n;
    if (!quiet && to !== this.sel) this._sound('move');
    this.sel = to;
    this.items.forEach((it, j) => it.el.classList.toggle('on', j === this.sel));
    this.aboutEl.textContent = this.items[this.sel].about || '';
    // on the PLAYER page, whoever is selected stands at the stone (BACK: the one already chosen)
    if (this._page === 'player') this.onPlayer?.((this.items[this.sel].player || currentPlayer()).id);
  }

  _activate(it) {
    if (!it || this._leaving) return;
    this._sound(it.id === 'back' ? 'back' : 'pick');
    if (it.id === 'continue') this._start(it.chapter);
    else if (it.id === 'new') this._start('prologue');
    else if (it.id === 'chapters') this._showChapters();
    else if (it.id === 'player') this._showPlayers();
    else if (it.id === 'pick') {
      savePlayer(it.player.id);
      this._showMain('player');
    }
    else if (it.id === 'options') this.onOptions?.();
    else if (it.id === 'controls') this.onControls?.();
    else if (it.id === 'credits') this.onCredits?.();
    else if (it.id === 'cards') this.onCards?.();
    else if (it.id === 'records') this.onRecords?.();
    else if (it.id === 'map') this.onMap?.();
    else if (it.id === 'playbook') this.onPlaybook?.();
    else if (it.id === 'back') this._showMain(this._page);
    else if (it.id === 'chapter') this._start(it.name);
  }

  /* ---------------------------------------------------------------- music */

  /**
   * The horn, blown: a deep brass call (two notes a fifth apart, the low one
   * under it, the brightness swelling as the breath does), with the
   * horn's own shimmer on top, through its own small graph, gone in a few
   * seconds. Follows the OPTIONS master volume and M.
   */
  _hornCall() {
    if (isMuted()) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this._callCtx = new AC());
    const t = ctx.currentTime + 0.02;
    const out = ctx.createGain();
    out.gain.value = 0.32 * settings.master;
    const comp = ctx.createDynamicsCompressor();
    out.connect(comp).connect(ctx.destination);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 3;
    lp.frequency.setValueAtTime(180, t);
    lp.frequency.exponentialRampToValueAtTime(1500, t + 0.45);
    lp.frequency.exponentialRampToValueAtTime(700, t + 2.2);
    lp.frequency.exponentialRampToValueAtTime(200, t + 3.6);
    const body = ctx.createGain();
    body.gain.setValueAtTime(0.0001, t);
    body.gain.exponentialRampToValueAtTime(1, t + 0.35);
    body.gain.setValueAtTime(1, t + 1.9);
    body.gain.exponentialRampToValueAtTime(0.0001, t + 3.8);
    lp.connect(body).connect(out);
    for (const [f, g] of [[73.42, 0.5], [110, 0.38], [146.83, 0.18], [55, 0.3]]) {
      const o = ctx.createOscillator();
      o.type = f < 60 ? 'sine' : 'sawtooth';
      o.frequency.setValueAtTime(f * 0.97, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.25); // the lip settling onto the note
      const vib = ctx.createOscillator();
      vib.frequency.value = 4.6;
      const depth = ctx.createGain();
      depth.gain.value = f * 0.004;
      vib.connect(depth).connect(o.frequency);
      const gain = ctx.createGain();
      gain.gain.value = g;
      o.connect(gain).connect(lp);
      o.start(t); vib.start(t);
      o.stop(t + 4); vib.stop(t + 4);
    }
    // the horn's shimmer, high over it, as its light runs out
    const sh = ctx.createOscillator();
    sh.type = 'sine';
    sh.frequency.setValueAtTime(880, t + 0.2);
    sh.frequency.exponentialRampToValueAtTime(1320, t + 2.4);
    const shg = ctx.createGain();
    shg.gain.setValueAtTime(0.0001, t + 0.2);
    shg.gain.exponentialRampToValueAtTime(0.05, t + 0.6);
    shg.gain.exponentialRampToValueAtTime(0.0001, t + 3);
    sh.connect(shg).connect(out);
    sh.start(t + 0.2);
    sh.stop(t + 3.1);
    setTimeout(() => ctx.close().catch(() => {}), 4500);
  }

  /**
   * The menu's small sounds, made here like the horn call: a pluck like an
   * mbira's tine (a sine, with the tine's bright overtone dying fast) as the
   * selection moves; a lower, fuller one with a soft knock under it on
   * choosing; two falling notes going back. Quiet, under the theme. One
   * AudioContext for all of them, made on the first (the landing's key has let
   * the page make sound by then); like every context in the game it goes
   * through the OPTIONS master volume and M (audio/masterMute.js).
   */
  _sound(kind) {
    if (this._leaving) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = this._uiCtx || (this._uiCtx = new AC());
      if (ctx.state === 'suspended') ctx.resume();
      const t = ctx.currentTime + 0.005;
      const pluck = (f, at, len, vol) => {
        for (const [mul, g, decay] of [[1, 1, len], [5.4, 0.22, len * 0.18]]) {
          const o = ctx.createOscillator();
          o.frequency.value = f * mul;
          const e = ctx.createGain();
          e.gain.setValueAtTime(0.0001, t + at);
          e.gain.exponentialRampToValueAtTime(vol * g, t + at + 0.004);
          e.gain.exponentialRampToValueAtTime(0.0001, t + at + decay);
          o.connect(e).connect(ctx.destination);
          o.start(t + at);
          o.stop(t + at + decay + 0.02);
        }
      };
      if (kind === 'move') pluck(784, 0, 0.22, 0.07); // G
      else if (kind === 'back') {
        pluck(587, 0, 0.2, 0.07); // D, falling to
        pluck(392, 0.07, 0.32, 0.07); // G
      } else {
        pluck(392, 0, 0.65, 0.12); // G and the D over it
        pluck(587, 0.045, 0.5, 0.07);
        const knock = ctx.createOscillator();
        knock.frequency.setValueAtTime(130, t);
        knock.frequency.exponentialRampToValueAtTime(62, t + 0.14);
        const kg = ctx.createGain();
        kg.gain.setValueAtTime(0.16, t);
        kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        knock.connect(kg).connect(ctx.destination);
        knock.start(t);
        knock.stop(t + 0.2);
      }
    } catch {
      // no sound to be had: the menu works the same
    }
  }

  _startMusic() {
    if (this.music) return;
    const a = new Audio(THEME_MUSIC);
    a.loop = true;
    a.volume = 0;
    this.music = a;
    a.play().then(() => this._fadeMusic(themeVolume(), 2.5)).catch(() => {});
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
    this._endStage();
    window.removeEventListener('keydown', this._onKey);
    this._offSettings();
    clearInterval(this._fadeTimer);
    // always stopped here: leaving, the fade-out (0.9 s) is cut short by this
    // (0.65 s), and its own pause at the end never ran, so the theme used to
    // carry on, quietly, under the prologue
    if (this.music) this.music.pause();
    // the choosing pluck is still ringing as the page goes: let it finish
    if (this._uiCtx) setTimeout(() => this._uiCtx.close().catch(() => {}), 800);
    this.el.remove();
    this.style.remove();
  }
}
