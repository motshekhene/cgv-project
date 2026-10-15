import '../style.css';
import { setMuted } from '../audio/masterMute.js'; // first: every AudioContext the levels make goes through it
import * as THREE from 'three';
import { AssetRegistry } from '../core/AssetRegistry.js';
import { settings } from '../core/settings.js';
import { ensureDialogueFont, DIALOGUE_FONT } from '../ui/dialogue.js';
import { LoadingScreen } from '../ui/LoadingScreen.js';
import { THEME_CSS } from '../ui/theme.js';
import { GAME_TITLE } from '../ui/brand.js';
import { Director } from './Director.js';
import { Overlay } from './Overlay.js';
import { Score } from './score.js';
import { STAGES, SHOTS, CARDS, FADES, BARS, LENGTH, SKIP_TO } from './edit.js';

/**
 * THE SILENT HORN — the trailer, on its own page (trailer/index.html,
 * `npm run trailer`). It plays the game's own levels (see Director.js and
 * edit.js), so nothing in the game is changed to make it.
 *
 *   Space    play / pause          M   sound on / off
 *   R        replay                S   skip to the title
 *   H        hide the controls (for recording)
 *
 * URL options:
 *   ?t=42      start 42 s in            ?hold=42   freeze on that frame
 *   ?clean     no controls, no cursor, the frame fills the window (recording)
 *   ?autoplay  start without the PLAY button (the sound still needs a click
 *              in most browsers; it comes in on the first click or key)
 *   ?muted     start with the sound off
 *   ?music=<file in assets/audio/>  a licensed music track under the trailer's own score
 *   ?export    frame-by-frame export mode, driven by tools/render-trailer.mjs
 */
const q = new URLSearchParams(location.search);
const num = (k) => (q.has(k) ? parseFloat(q.get(k)) : undefined);
const OPTS = {
  start: num('t') ?? 0,
  hold: num('hold'),
  clean: q.has('clean') || q.has('export'),
  autoplay: q.has('autoplay') || q.has('hold') || q.has('export'),
  muted: q.has('muted'),
  exporting: q.has('export'),
  music: q.get('music'),
  width: num('w'),
  height: num('h'),
};

/* ------------------------------------------------------------ keep the levels quiet and out of sight */

// The levels make their own sound (engines, the fire, the forest, music). The
// trailer has its own score, cut to the picture (score.js), so every audio
// context a level makes is held suspended, and each level's music bus starts
// at zero. Media elements are muted too.
settings.music = 0; // in memory only: the player's saved options are not touched
const levelContexts = new Set();
const GameAudio = window.AudioContext;
const NativeAudio = GameAudio.__masterMute ? Object.getPrototypeOf(GameAudio) : GameAudio; // the trailer's own sound skips both
class HeldAudio extends GameAudio {
  constructor(...a) {
    super(...a);
    levelContexts.add(this);
    super.suspend().catch(() => {});
  }
  resume() { return Promise.resolve(); }
}
window.AudioContext = HeldAudio;
if (window.webkitAudioContext) window.webkitAudioContext = HeldAudio;
setMuted(true); // and if one does get through, master volume says nothing

const CSS = THEME_CSS + `
body.trailer > :not(.tr-keep) { display:none !important; }
body.trailer { background:#000; }
.tr-frame { position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); background:#000; overflow:hidden; }
.tr-frame canvas { position:absolute; inset:0; width:100%; height:100%; }
.tr-gl { filter:contrast(1.06) saturate(.93); }
.tr-ui { position:fixed; inset:0; pointer-events:none; font-family:${DIALOGUE_FONT}; color:#efe4c8; z-index:20; }
.tr-gate { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px;
  background:radial-gradient(ellipse at 50% 45%, rgba(20,32,28,.55) 0%, rgba(2,3,3,.92) 70%); pointer-events:auto; transition:opacity .6s; }
.tr-gate.gone { opacity:0; pointer-events:none; }
.tr-gate .k { font:600 12px var(--sans); letter-spacing:.5em; text-indent:.5em; color:var(--gold); }
.tr-gate h1 { margin:0; font-weight:600; letter-spacing:.12em; font-size:clamp(34px, 5.4vw, 78px); color:transparent;
  -webkit-background-clip:text; background-clip:text; background-image:linear-gradient(180deg, #fff6dc 0%, #e8c06a 52%, #8a6226 100%);
  filter:drop-shadow(0 3px 0 rgba(0,0,0,.65)) drop-shadow(0 0 30px rgba(227,187,98,.28)); }
.tr-play { margin-top:22px; font:600 17px ${DIALOGUE_FONT}; letter-spacing:.34em; text-indent:.34em; color:#f2e8d5; cursor:pointer;
  padding:14px 34px; border:1px solid rgba(227,187,98,.55); border-radius:2px; background:rgba(0,0,0,.35); }
.tr-play:hover { border-color:#e3bb62; background:rgba(227,187,98,.12); }
.tr-gate .note { font:500 15px ${DIALOGUE_FONT}; font-style:italic; color:#b8aa8a; }
.tr-gate .alt { font:600 10px var(--sans); letter-spacing:.3em; color:#8a8070; cursor:pointer; text-decoration:underline; text-underline-offset:4px; }
.tr-bar { position:absolute; left:50%; bottom:22px; transform:translateX(-50%); display:flex; gap:8px; align-items:center; padding:8px 10px;
  border:1px solid rgba(227,187,98,.35); border-radius:3px; background:linear-gradient(180deg, rgba(38,44,28,.78), rgba(13,17,11,.85));
  box-shadow:0 4px 14px rgba(0,0,0,.45); pointer-events:auto; opacity:0; transition:opacity .4s; font:600 11px var(--sans); letter-spacing:.18em; }
.tr-ui.awake .tr-bar { opacity:1; }
.tr-ui.hidden .tr-bar { display:none; }
.tr-bar button { font:inherit; letter-spacing:inherit; color:#efe4c8; background:rgba(0,0,0,.3); border:1px solid rgba(227,187,98,.4);
  border-radius:2px; padding:7px 12px; cursor:pointer; white-space:nowrap; }
.tr-bar button:hover { border-color:#e3bb62; }
.tr-bar .time { min-width:92px; white-space:nowrap; text-align:center; color:#b8aa8a; font-variant-numeric:tabular-nums; }
.tr-bar .track { width:min(260px, 26vw); height:3px; background:rgba(227,187,98,.2); }
.tr-bar .track b { display:block; height:100%; width:0; background:#e3bb62; }
.tr-end { position:absolute; left:50%; bottom:24px; transform:translateX(-50%); display:none; gap:10px; pointer-events:auto; }
.tr-end.show { display:flex; }
.tr-end a, .tr-end button { font:600 12px var(--sans); letter-spacing:.2em; color:#efe4c8; text-decoration:none; cursor:pointer; padding:9px 16px;
  border:1px solid rgba(227,187,98,.45); border-radius:2px; background:rgba(0,0,0,.4); }
.tr-error { position:absolute; inset:0; display:none; align-items:center; justify-content:center; flex-direction:column; gap:12px; background:#050505;
  pointer-events:auto; text-align:center; padding:0 24px; }
.tr-error.show { display:flex; }
.tr-error h2 { margin:0; font-weight:600; letter-spacing:.24em; color:#f2934f; }
.tr-error pre { max-width:720px; white-space:pre-wrap; font:12px/1.5 ui-monospace, monospace; color:#b8aa8a; }
body.tr-clean, body.tr-clean * { cursor:none !important; }
`;

/* ------------------------------------------------------------ the page */

ensureDialogueFont();
const style = document.createElement('style');
style.textContent = CSS;
document.head.appendChild(style);
document.body.classList.add('trailer');
if (OPTS.clean) document.body.classList.add('tr-clean');

const frameEl = document.createElement('div');
frameEl.className = 'tr-frame tr-keep';
document.body.appendChild(frameEl);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: OPTS.exporting });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.className = 'tr-gl';
frameEl.appendChild(renderer.domElement);

const overlay = new Overlay({ cards: CARDS, fades: FADES, bars: BARS });
frameEl.appendChild(overlay.canvas);

const ui = document.createElement('div');
ui.className = 'tr-ui tr-keep';
ui.innerHTML = `
  <div class="tr-gate gone">
    <div class="k">THE OFFICIAL TRAILER</div>
    <h1>${GAME_TITLE}</h1>
    <button class="tr-play" type="button">&#9654;&nbsp; PLAY TRAILER</button>
    <div class="note">Best with sound on and the window full screen</div>
    <div class="alt" role="button" tabindex="0">PLAY WITHOUT SOUND</div>
  </div>
  <div class="tr-bar">
    <button data-a="play" type="button">PAUSE</button>
    <div class="track"><b></b></div>
    <div class="time">0:00 / 0:00</div>
    <button data-a="sound" type="button">SOUND ON</button>
    <button data-a="replay" type="button">REPLAY</button>
    <button data-a="skip" type="button">SKIP</button>
  </div>
  <div class="tr-end">
    <button data-a="replay" type="button">REPLAY &#8635;</button>
    <a href="../">PLAY THE GAME &#9656;</a>
  </div>
  <div class="tr-error"><h2>THE TRAILER COULD NOT START</h2><div class="msg"></div><pre></pre>
    <a class="tr-play" href="../">PLAY THE GAME INSTEAD</a></div>`;
document.body.appendChild(ui);
if (OPTS.clean) ui.classList.add('hidden');
const $ = (s) => ui.querySelector(s);

const loading = new LoadingScreen();
loading.el.classList.add('tr-keep');

/* ------------------------------------------------------------ size: a 16:9 frame, as big as the window allows */

let W = 0, H = 0;
function fit() {
  const ww = window.innerWidth, wh = window.innerHeight;
  let w = OPTS.width ?? ww, h = OPTS.height ?? Math.round(w * 9 / 16);
  if (!OPTS.width) {
    if (h > wh) { h = wh; w = Math.round(h * 16 / 9); }
  }
  W = w; H = h;
  frameEl.style.width = `${w}px`;
  frameEl.style.height = `${h}px`;
  const pr = OPTS.exporting ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  overlay.setSize(Math.round(w * pr), Math.round(h * pr));
  director?.resize(w, h);
}
window.addEventListener('resize', fit);

/* ------------------------------------------------------------ playing */

const assets = new AssetRegistry({ base: '../assets/' });
let director = null;
const score = new Score({ AudioContext: NativeAudio, length: LENGTH, music: OPTS.music });
score.now = () => director?.t ?? 0; // where to pick up when the browser lets the sound start
let playing = false;
let ended = false;
let soundOn = !OPTS.muted;
let last = 0;

async function build() {
  loading.show('title');
  loading.kicker.textContent = 'THE OFFICIAL TRAILER';
  loading.title.textContent = GAME_TITLE;
  loading.lore.textContent = '“When the horn leaves the stone, the forest falls silent.”';
  const scoreReady = score.prepare(assets).catch((e) => console.warn('[trailer] score', e)); // renders while the levels build
  director = new Director({ renderer, assets, stages: STAGES, shots: SHOTS, overlay, width: W, height: H });
  director.length = LENGTH;
  let stageP = 0;
  assets.onProgress = (p) => loading.progress(0.1 + 0.8 * Math.max(stageP, p * 0.5 + stageP * 0.5));
  await director.build((p) => { stageP = p; loading.progress(0.1 + 0.8 * p); });
  await Promise.race([document.fonts?.load(`600 40px ${DIALOGUE_FONT}`), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
  await scoreReady;
  loading.progress(1);
  if (OPTS.start > 0) director.seek(OPTS.start);
  director.draw();
  loading.hide();
}

function setSound(on) {
  soundOn = on;
  $('[data-a="sound"]').textContent = on ? 'SOUND ON' : 'SOUND OFF';
  score.setMuted(!on);
}

function play() {
  if (ended) return replay();
  playing = true;
  $('[data-a="play"]').textContent = 'PAUSE';
  score.play(director.t);
  last = performance.now();
}

function pause() {
  playing = false;
  $('[data-a="play"]').textContent = 'PLAY';
  score.pause();
}

async function replay() {
  pause();
  ended = false;
  $('.tr-end').classList.remove('show');
  director.dispose();
  await build();
  play();
}

function skip() {
  if (!director) return;
  director.seek(SKIP_TO, { fast: true });
  score.play(director.t);
  if (!playing) play();
}

function finish() {
  ended = true;
  playing = false;
  score.pause();
  $('[data-a="play"]').textContent = 'PLAY';
  if (!OPTS.clean) $('.tr-end').classList.add('show');
}

function fmt(s) {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function loop(now) {
  requestAnimationFrame(loop);
  if (!director || OPTS.exporting) return;
  if (playing) {
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // the sound is the clock: the picture keeps to the score. A slow frame is
    // caught up in fixed steps (the levels run as they would have); a machine
    // that can't keep up at all pulls the sound back to the picture instead
    const want = score.time();
    if (want !== null) {
      const lag = want - director.t;
      if (lag > 1.5 || lag < -0.3) score.play(director.t + dt);
      else dt = Math.max(0, Math.min(lag, 0.6));
    }
    if (OPTS.hold !== undefined) dt = Math.max(0, Math.min(dt, OPTS.hold - director.t));
    const target = Math.min(LENGTH, director.t + dt);
    while (director.t + 1 / 30 < target) director.advance(1 / 30);
    director.update(Math.max(0, target - director.t));
    if (target >= LENGTH) finish();
  }
  $('.track b').style.width = `${(100 * director.t) / LENGTH}%`;
  $('.time').textContent = `${fmt(director.t)} / ${fmt(LENGTH)}`;
}

/* ------------------------------------------------------------ controls */

function wake() {
  ui.classList.add('awake');
  clearTimeout(wake.timer);
  wake.timer = setTimeout(() => ui.classList.remove('awake'), 2200);
}
window.addEventListener('mousemove', wake);
ui.addEventListener('click', (e) => {
  const a = e.target.closest('[data-a]')?.dataset.a;
  if (a === 'play') (playing ? pause() : play());
  if (a === 'sound') setSound(!soundOn);
  if (a === 'replay') replay();
  if (a === 'skip') skip();
});
window.addEventListener('keydown', (e) => {
  if (!director || !$('.tr-gate').classList.contains('gone')) return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); playing ? pause() : play(); }
  if (k === 'm') setSound(!soundOn);
  if (k === 'r') replay();
  if (k === 's' || k === 'escape') skip();
  if (k === 'h') ui.classList.toggle('hidden');
  score.unlock(); // a key is a gesture: the sound can start now if it was waiting
});
window.addEventListener('pointerdown', () => score.unlock());

function startFromGate(withSound) {
  $('.tr-gate').classList.add('gone');
  setSound(withSound);
  score.unlock();
  play();
}
$('.tr-play').addEventListener('click', () => startFromGate(true));
$('.alt').addEventListener('click', () => startFromGate(false));

function fail(err) {
  console.error('[trailer]', err);
  loading.hide();
  $('.tr-error').classList.add('show');
  $('.tr-error .msg').textContent = 'Something the trailer needs did not load. The game itself may still run.';
  $('.tr-error pre').textContent = String(err?.message || err);
}

/* ------------------------------------------------------------ export: frame by frame, for tools/render-trailer.mjs */

window.trailerExport = {
  ready: false,
  length: LENGTH,
  /** Step to frame i at `fps` and return it composited (the 3D frame + the overlay) as a data URL. */
  async frame(i, fps = 60, type = 'image/jpeg', quality = 0.93) {
    const t = i / fps;
    if (t < director.t - 1e-6) throw new Error('frames go forward only');
    while (director.t + 1 / fps <= t + 1e-6) director.advance(1 / fps);
    if (t > director.t) director.advance(t - director.t);
    director.draw();
    const c = this._c || (this._c = document.createElement('canvas'));
    c.width = overlay.canvas.width;
    c.height = overlay.canvas.height;
    const g = c.getContext('2d');
    g.filter = 'contrast(1.06) saturate(0.93)';
    g.drawImage(renderer.domElement, 0, 0, c.width, c.height);
    g.filter = 'none';
    g.drawImage(overlay.canvas, 0, 0);
    return c.toDataURL(type, quality);
  },
  /** The score rendered offline, as a 16-bit stereo WAV (base64). */
  async audio() {
    return score.renderWav(assets);
  },
};

/* ------------------------------------------------------------ go */

fit();
requestAnimationFrame(loop);
try {
  await build();
  window.trailer = { get director() { return director; }, score, play, pause, skip, replay };
  window.trailerExport.ready = true;
  if (OPTS.exporting) {
    // the exporter drives the clock
  } else if (OPTS.autoplay) {
    $('.tr-gate').classList.add('gone');
    setSound(soundOn);
    play();
  } else {
    $('.tr-gate').classList.remove('gone');
  }
} catch (err) {
  fail(err);
}
