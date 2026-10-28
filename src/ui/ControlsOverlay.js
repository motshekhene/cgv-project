/**
 * ControlsOverlay — what every level is played with (LEVEL_CONTROLS, read
 * from the live Input bindings so it can never lie about a key), for the
 * pause menu's list and the main menu's CONTROLS (ui/ControlsMenu.js), and
 * the one thing every level shows of it: ESC · PAUSE, in a corner.
 *
 * The pill: when a level starts it opens out to PRESS ESC TO PAUSE for a few
 * seconds, glowing, then settles to ESC · PAUSE; it hides while the game is
 * paused (the pause menu has the keys) and while a level loads, and a click
 * on it pauses. A level with something of its own in that corner docks it
 * elsewhere (`dock: 'top'` in LEVEL_CONTROLS): Level 2's minimap is down
 * there, so on the River Road it sits top right, under the CAR · VIEW row.
 *
 *   import { mountPauseHint, controlRows } from './ui/ControlsOverlay.js';
 *   const hint = mountPauseHint(game);                    // in main.js
 *   game.onLevelChanged = (name) => hint.setLevel(name);
 *   game.onPaused = (paused) => hint.setPaused(paused);
 *
 * A row either resolves its keys from a binding action (`action: 'boost'`)
 * or states them literally (`keys: 'MOUSE'`) for things that are not
 * bindings, like mouse-look.
 */

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
      { label: 'MAP (BIGGER \u00b7 SMALLER)', keys: 'N' },
      { label: 'USE \u00b7 CONFIRM', action: 'interact' },
      { label: 'LEAVE THE HORN (TWICE: WALK AWAY)', action: 'decline' },
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
      { label: 'BLOW THE HORN (WHEN FULL)', action: 'ability' },
      { label: 'RESTART', action: 'restart' },
    ],
  },
  'level02-intro': {
    title: 'THE RIVER ROAD \u2014 DRIVE-OUT',
    rows: [{ label: 'SKIP', action: 'skip' }],
  },
  level02: {
    title: 'LEVEL 2 \u2014 THE RIVER ROAD',
    dock: 'top', // the minimap has the bottom-right corner
    rows: [
      { label: 'DRIVE / REVERSE', keys: 'W / S' },
      { label: 'STEER', keys: 'A / D \u00b7 \u2190 / \u2192' },
      { label: 'DRIFT (HOLD + STEER)', action: 'drift' },
      { label: 'HANDBRAKE', action: 'handbrake' },
      { label: 'BOOST', action: 'boost' },
      { label: 'THE CAR YARD', action: 'changeCar' },
      { label: 'VIEW · FIRST PERSON', action: 'view' },
      { label: 'PICKER: PAINT', keys: 'Q / E' },
      { label: 'MUSIC ON / OFF', keys: 'N' },
    ],
  },
  level03: {
    title: 'LEVEL 3 \u2014 THE FALLS',
    rows: [
      { label: 'LOOK', keys: 'MOUSE' },
      { label: 'MOVE', keys: 'W A S D' },
      { label: 'ATTACK', action: 'attack' },
      { label: 'KICK', action: 'kick' },
      { label: 'BLOCK', action: 'block' },
      { label: 'DODGE', action: 'dodge' },
      { label: 'THE HORN \u00b7 SLOW TIME', action: 'ability' },
      { label: 'CAMERA \u00b7 LOCK ON', action: 'lockOn' },
      { label: 'NEXT LINE', action: 'skip' },
      { label: 'SHRINES · PAGES', keys: 'WALK INTO THEM' },
      { label: 'MAP (BIGGER · SMALLER)', keys: 'N' },
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

/**
 * ESC · PAUSE, in the corner of every level (not the main menu): opens out to
 * PRESS ESC TO PAUSE as each level starts, hides while paused or loading.
 */
export function mountPauseHint(game) {
  const style = document.createElement('style');
  style.textContent = `
.ph { position:fixed; z-index:9200; display:flex; align-items:center; gap:10px; padding:6px 13px 6px 7px; cursor:pointer; user-select:none;
  font:700 10px 'Segoe UI', system-ui, sans-serif; letter-spacing:.24em; color:#efe4c8;
  background:linear-gradient(180deg, rgba(38,44,28,.88), rgba(13,17,11,.86)); border:1px solid rgba(227,187,98,.45); border-radius:999px;
  box-shadow:0 4px 14px rgba(0,0,0,.45); transition:opacity .35s ease, box-shadow .4s ease, border-color .4s ease; }
.ph:hover { border-color:#e3bb62; }
.ph kbd { padding:3px 7px 4px; font:700 10px 'Segoe UI', system-ui, sans-serif; letter-spacing:.06em; color:#f6e7c1;
  border:1px solid rgba(227,187,98,.6); border-bottom-width:2px; border-radius:4px; background:rgba(0,0,0,.4); }
.ph b { font-weight:700; white-space:nowrap; }
.ph b span { display:inline-block; max-width:0; overflow:hidden; vertical-align:bottom; transition:max-width .6s ease; }
.ph.big { box-shadow:0 0 22px rgba(227,187,98,.45), 0 4px 14px rgba(0,0,0,.45); border-color:#e3bb62; animation:phPulse 1.1s ease-in-out infinite alternate; }
.ph.big b span { max-width:14em; }
.ph.off { opacity:0; pointer-events:none; }
@keyframes phPulse { to { box-shadow:0 0 34px rgba(227,187,98,.75), 0 4px 14px rgba(0,0,0,.45); } }
`;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.className = 'ph off';
  el.innerHTML = '<kbd>ESC</kbd><b><span>PRESS ESC TO&nbsp;</span>PAUSE</b>';
  el.title = 'Pause the game';
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (game.level && !game.loading) game.setPaused(true, 'user');
  });
  document.body.appendChild(el);

  const state = { level: null, paused: false, timer: 0 };
  const place = () => {
    const top = (LEVEL_CONTROLS[state.level] || {}).dock === 'top';
    Object.assign(el.style, top
      ? { top: `${window.innerWidth <= 760 ? 152 : 116}px`, bottom: 'auto', right: '12px' }
      : { top: 'auto', bottom: '8px', right: '14px' });
  };
  const show = () => el.classList.toggle('off', !state.level || state.level === 'title' || state.paused);
  window.addEventListener('resize', place);

  return {
    /** A level has started: say it big for a few seconds, then small. */
    setLevel(name) {
      state.level = name;
      state.paused = false;
      place();
      show();
      clearTimeout(state.timer);
      el.classList.toggle('big', !!name && name !== 'title');
      state.timer = setTimeout(() => el.classList.remove('big'), 5000);
    },
    /** A level is loading: out of the way. */
    loading() {
      state.level = null;
      show();
    },
    setPaused(paused) {
      state.paused = paused;
      show();
    },
  };
}
