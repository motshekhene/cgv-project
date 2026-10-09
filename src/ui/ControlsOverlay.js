/**
 * ControlsOverlay — what the inputs do, one keypress away.
 *
 * Every level reads its inputs from Input.DEFAULT_BINDINGS, but until now the
 * only place a player could learn that SHIFT is boost or SPACE is the level-2
 * handbrake was the source code. Levels hint locally (level 01 has labelled
 * on-screen buttons, the prologue prompts E when there is something to use),
 * but nothing says the whole picture, and level 03 said nothing at all.
 *
 * This is the whole picture. Press H — or click the "H · CONTROLS" pill in the
 * bottom-right corner — for the current level's bindings. The keys column is
 * generated from the live Input bindings at open time, so if a binding moves,
 * this panel cannot lie about it.
 *
 *   import { mountControlsOverlay } from './ui/ControlsOverlay.js';
 *   const controls = mountControlsOverlay(game);          // in main.js
 *   game.onControlsToggle = () => controls.toggle();      // H (Game polls it)
 *   game.onLevelChanged = (name) => controls.setLevel(name);
 *
 * Per-level content lives in LEVEL_CONTROLS below. A row either resolves its
 * keys from a binding action (`action: 'boost'`) or states them literally
 * (`keys: 'MOUSE'`) for things that are not bindings, like mouse-look.
 */

const ACCENT = '#9ed36a';   // the jungle accent
const DIM = '#8f9bb0';
const PANEL_BG = 'rgba(8,11,17,.94)';

/** Pretty-print one Input code the way it is drawn on a keyboard. */
const KEY_LABELS = {
  ' ': 'SPACE',
  arrowup: '\u2191',
  arrowdown: '\u2193',
  arrowleft: '\u2190',
  arrowright: '\u2192',
  control: 'CTRL',
  shift: 'SHIFT',
  enter: 'ENTER',
  escape: 'ESC',
  tab: 'TAB',
  mouse0: 'LMB',
  mouse1: 'MMB',
  mouse2: 'RMB',
};

function keyLabel(code) {
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  return code.replace('key', '').toUpperCase();
}

/** Keys text for a row: either the literal string, or resolved from bindings. */
function keysFor(game, row) {
  if (row.keys) return row.keys;
  const codes = game.input.codesFor(row.action);
  return codes.map(keyLabel).join(' \u00b7 ');
}

/**
 * What each level is played with. `action` rows read the live Input bindings;
 * `keys` rows are for inputs that are not bindings (mouse-look, conventions).
 * Unknown levels fall through to the shared rows only.
 */
const LEVEL_CONTROLS = {
  title: {
    title: 'MAIN MENU',
    rows: [
      { label: 'CHOOSE', keys: '↑ / ↓ · W / S' },
      { label: 'SELECT', keys: 'ENTER · CLICK' },
      { label: 'BACK', keys: 'ESC' },
    ],
  },
  prologue: {
    title: 'PROLOGUE',
    rows: [
      { label: 'LOOK', keys: 'MOUSE' },
      { label: 'WALK', keys: 'W A S D' },
      { label: 'USE \u00b7 CONFIRM', action: 'interact' },
      { label: 'REFUSE', action: 'decline' },
      { label: 'SKIP THE INTRO', action: 'skipScene' },
    ],
  },
  level01: {
    title: 'LEVEL 1 \u2014 THE OLD TRAIL',
    rows: [
      { label: 'STEER', keys: 'A / D \u00b7 \u2190 / \u2192' },
      { label: 'JUMP', action: 'jump' },
      { label: 'SLIDE', action: 'slide' },
      { label: 'BOOST', action: 'boost' },
      { label: 'LOOK BACK', action: 'lookBack' },
      { label: 'RESTART', action: 'restart' },
    ],
  },
  'level02-intro': {
    title: 'THE RIVER ROAD \u2014 DRIVE-OUT',
    rows: [{ label: 'SKIP', action: 'skip' }],
  },
  level02: {
    title: 'LEVEL 2 \u2014 THE RIVER ROAD',
    rows: [
      { label: 'DRIVE / REVERSE', keys: 'W / S' },
      { label: 'STEER', keys: 'A / D \u00b7 \u2190 / \u2192' },
      { label: 'BOOST', action: 'boost' },
      { label: 'HANDBRAKE', keys: 'SPACE' },
      { label: 'CAR PICKER', action: 'changeCar' },
      { label: 'PICKER: PAINT', keys: 'Q / E' },
    ],
  },
  level03: {
    title: 'LEVEL 3 \u2014 THE FALLS',
    rows: [
      { label: 'ATTACK', action: 'attack' },
      { label: 'KICK', action: 'kick' },
      { label: 'BLOCK', action: 'block' },
      { label: 'DODGE', action: 'dodge' },
      { label: 'THE HORN \u00b7 SLOW TIME', action: 'ability' },
      { label: 'CAMERA \u00b7 LOCK ON', action: 'lockOn' },
      { label: 'NEXT LINE', action: 'skip' },
      { label: 'INTERACT', action: 'interact' },
      { label: 'RESTART', action: 'restart' },
    ],
  },
};

/** Rows every level gets, after its own. */
const SHARED_ROWS = [
  { label: 'MUTE', action: 'mute' },
  { label: 'PAUSE', action: 'pause' },
];

/** The rows for one level, keys resolved from the live bindings: what the pause menu lists too. */
export function controlRows(game, levelName) {
  const spec = LEVEL_CONTROLS[levelName] || { title: 'CONTROLS', rows: [] };
  return [...spec.rows, ...SHARED_ROWS].map((row) => ({ label: row.label, keys: keysFor(game, row) }));
}

export function mountControlsOverlay(game) {
  const state = { levelName: game.levelName || null, visible: false };

  const root = document.createElement('div');
  root.style.cssText =
    // above the title screen (9500) and the pause menu (9300), below the loading screen
    'position:fixed;right:18px;bottom:18px;z-index:9700;pointer-events:none;' +
    "font-family:ui-monospace,'JetBrains Mono',Menlo,monospace";
  document.body.appendChild(root);

  const pill = document.createElement('div');
  pill.style.cssText =
    'pointer-events:auto;cursor:pointer;text-align:right;' +
    `color:${DIM};background:${PANEL_BG};border:1px solid rgba(143,155,176,.3);` +
    'border-radius:3px;padding:6px 10px;font-size:10px;letter-spacing:.22em;' +
    'user-select:none';
  pill.innerHTML = '<b style="color:' + ACCENT + '">H</b>&nbsp;&middot;&nbsp;CONTROLS';
  pill.addEventListener('click', () => toggle());
  root.appendChild(pill);

  // Click anywhere outside the panel and it gets out of the way again — so on
  // level 01, where the on-screen buttons share the bottom of the screen, the
  // panel never fences them off for longer than the player wants to read it.
  document.addEventListener('click', (e) => {
    if (!state.visible) return;
    if (panel.contains(e.target) || pill.contains(e.target)) return;
    hide();
  });

  const panel = document.createElement('div');
  panel.style.cssText =
    'pointer-events:auto;display:none;width:270px;margin-bottom:8px;' +
    `color:#eef2fb;background:${PANEL_BG};border:1px solid rgba(143,155,176,.3);` +
    'border-radius:4px;padding:14px 16px 10px;font-size:11px;letter-spacing:.08em;' +
    'max-height:min(70vh,520px);overflow-y:auto;user-select:none';
  root.appendChild(panel);

  function render() {
    const spec = LEVEL_CONTROLS[state.levelName] || { title: 'CONTROLS', rows: [] };
    const rows = state.levelName === 'title' ? spec.rows : [...spec.rows, ...SHARED_ROWS]; // nothing to pause or mute on the menu

    let html =
      `<div style="color:${ACCENT};font-size:10px;letter-spacing:.28em;margin-bottom:10px">` +
      `${spec.title} \u00b7 CONTROLS</div>`;
    for (const row of rows) {
      html +=
        '<div style="display:flex;justify-content:space-between;gap:14px;' +
        'padding:3px 0">' +
        `<span style="color:${DIM};letter-spacing:.16em">${row.label}</span>` +
        `<span style="color:#eef2fb;text-align:right">${keysFor(game, row)}</span>` +
        '</div>';
    }
    html +=
      `<div style="color:${DIM};opacity:.75;font-size:9px;letter-spacing:.22em;` +
      'margin-top:10px;border-top:1px solid rgba(143,155,176,.2);padding-top:8px">' +
      'H \u2014 OPEN / CLOSE</div>';
    panel.innerHTML = html;
  }

  function show() {
    render();
    panel.style.display = 'block';
    state.visible = true;
  }

  function hide() {
    panel.style.display = 'none';
    state.visible = false;
  }

  function toggle() {
    if (state.visible) hide();
    else show();
  }

  return {
    toggle,
    show,
    hide,
    get visible() { return state.visible; },
    /** Called on level change — the panel re-renders next time it opens. */
    setLevel(name) {
      state.levelName = name;
      if (state.visible) render();
    },
  };
}
