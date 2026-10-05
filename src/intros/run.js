import '../style.css';
import { Game } from '../core/Game.js';

/**
 * Runs one cutscene on its own page (the pages in intros/), inside the same
 * Game the real levels use.
 *
 *   ?t=6.5     start 6.5 seconds in
 *   ?hold=7    stop the clock at 7 s, to look at one frame
 *
 * R replays from the start, Space / Enter / a click skips to the end, Esc pauses.
 * When an intro hands over (or a win card's CONTINUE is pressed) a panel
 * offers a replay and the next scene in the story.
 */
const CSS = `
.ic-load { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:14px;
  background:#07080a; color:#e3bb62; font:700 13px 'Segoe UI', system-ui, sans-serif; letter-spacing:.32em; transition:opacity .5s; z-index:5; }
.ic-load i { display:block; width:min(260px, 60vw); height:2px; background:rgba(227,187,98,.2); }
.ic-load i b { display:block; height:100%; width:0; background:#e3bb62; transition:width .2s; }
.ic-load.done { opacity:0; pointer-events:none; }
.ic-panel { position:fixed; left:50%; bottom:28px; transform:translate(-50%, 12px); display:flex; gap:10px; align-items:center; opacity:0;
  pointer-events:none; transition:opacity .4s, transform .4s; z-index:4; font:600 12px 'Segoe UI', system-ui, sans-serif; letter-spacing:.18em; color:#efe4c8;
  padding:10px 12px; border:1px solid rgba(227,187,98,.45); border-radius:3px; background:linear-gradient(180deg, rgba(38,44,28,.86), rgba(13,17,11,.9));
  box-shadow:0 4px 14px rgba(0,0,0,.45); }
.ic-panel.show { opacity:1; transform:translate(-50%, 0); pointer-events:auto; }
.ic-panel span { color:#b8aa8a; padding:0 6px; }
.ic-panel button, .ic-panel a { font:inherit; letter-spacing:inherit; color:#efe4c8; text-decoration:none; cursor:pointer; padding:8px 14px;
  border:1px solid rgba(227,187,98,.45); border-radius:2px; background:rgba(0,0,0,.3); }
.ic-panel button:hover, .ic-panel a:hover { border-color:#e3bb62; }
`;

export async function runCutscene(Scene, { next = null, nextLabel = 'NEXT SCENE', handoffNote = '' } = {}) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const q = new URLSearchParams(location.search);
  const num = (k) => (q.has(k) ? parseFloat(q.get(k)) : undefined);

  const loading = document.createElement('div');
  loading.className = 'ic-load';
  loading.innerHTML = '<div>LOADING</div><i><b></b></i>';
  document.body.appendChild(loading);
  const bar = loading.querySelector('b');

  const panel = document.createElement('div');
  panel.className = 'ic-panel';
  panel.innerHTML = `${handoffNote ? `<span>${handoffNote}</span>` : ''}<button type="button">REPLAY · R</button>${next ? `<a href="${next}">${nextLabel} &#9656;</a>` : ''}`;
  document.body.appendChild(panel);

  const game = new Game();
  game.assets.base = '../assets/'; // these pages live one folder down from the project root
  game.onLoadProgress = (p) => (bar.style.width = `${Math.round(p * 100)}%`);
  panel.querySelector('button').addEventListener('click', () => game.restart());

  let first = true;
  game.registerLevel('cutscene', () => {
    const opts = {
      onDone: () => panel.classList.add('show'),
      onContinue: () => (next ? (location.href = next) : panel.classList.add('show')),
    };
    if (first) {
      opts.start = num('t');
      opts.hold = num('hold');
      first = false;
    }
    return new Scene(opts);
  });
  game.onLevelChanged = () => {
    loading.classList.add('done');
    panel.classList.remove('show');
  };

  await game.setLevel('cutscene');
  game.start();
  window.game = game; // poke at it from the console: game.level.t, game.level.shot
}
