/**
 * HUD — the readouts every level shares.
 *
 * GameState has carried health, stamina, distance, handlerGap and the rest
 * since day one, but nothing was ever drawing them, which is why a level can
 * run a whole chase and show the player nothing. This is that missing piece.
 * It reads GameState and ONLY GameState, so the numbers on screen are the
 * numbers the level is actually using — if your bar is wrong, your state is
 * wrong, and that is a much easier bug to find.
 *
 * Three lines to add it to a level:
 *
 *   import { Hud } from '../core/Hud.js';          // at the top
 *   this.hud = Hud.forLevel('level01').mount();    // in init()
 *   this.hud.update(state);                        // in update(), every frame
 *   this.hud.unmount();                            // in teardown()
 *
 * That is the whole integration. No CSS file, no markup to paste into
 * index.html, nothing to position. It builds its own DOM inside #hud (or the
 * body if you have no #hud) and removes every node again on unmount.
 *
 * WHAT EACH LEVEL GETS BY DEFAULT
 *
 *   level01  gap · distance · stamina · letters
 *            Level 1 has no damage model — the comment in GameState is right,
 *            handlerGap IS the health bar, so it gets the big bar and the
 *            CLOSING / LOSING GROUND readout underneath it.
 *   level02  integrity (health) · boost heat · distance · gap · letters
 *   level03  health · the Handler's health · awards
 *
 * Override any of it:  Hud.forLevel('level01', { show: ['gap', 'distance'] })
 * or build your own:   new Hud({ show: [...], labels: { health: 'ARMOUR' } })
 *
 * PERFORMANCE
 *
 * update() runs every frame but only touches the DOM when a value has actually
 * changed enough to see. Writing innerHTML or a style on sixty frames a second
 * for a number that moves once a second is how a HUD ends up costing more than
 * the scene behind it.
 */

const ACCENT = '#9ed36a';   // the jungle accent, used across the game
const CYAN = '#4fd6e0';     // the Key
const AMBER = '#ffb03a';    // warning
const DANGER = '#ff6b6b';   // about to lose
const DIM = '#8f9bb0';

const PRESETS = {
  prologue: { show: [] },
  level01: { show: ['gap', 'stamina', 'distance', 'letters'] },
  level02: {
    show: ['health', 'boost', 'gap', 'distance', 'letters'],
    labels: { health: 'INTEGRITY', boost: 'BOOST', gap: 'PURSUIT' },
  },
  level03: {
    show: ['health', 'enemy', 'awards'],
    labels: { health: 'KAI', enemy: 'HANDLER' },
  },
};

const DEFAULT_LABELS = {
  health: 'HEALTH',
  stamina: 'STAMINA',
  boost: 'BOOST',
  gap: 'HANDLER',
  enemy: 'HANDLER',
  distance: 'DISTANCE',
  letters: 'LETTERS',
  awards: 'AWARDS',
};

/** What the gap meter says underneath itself, by GameState.handlerState. */
const GAP_TEXT = {
  IDLE: ['—', DIM],
  LOSING_GROUND: ['PULLING AWAY', ACCENT],
  CLOSING: ['CLOSING', AMBER],
  CAUGHT: ['CAUGHT', DANGER],
  SEALED: ['CLEAR', CYAN],
};

export class Hud {
  /**
   * @param {object} opts
   * @param {string[]} opts.show      which readouts to draw, in order
   * @param {object}   opts.labels    override any label text
   * @param {number}   opts.gapMax    metres that count as a full gap bar
   * @param {string}   opts.lettersIn letter-id prefix for this level, e.g. 'l1-'
   */
  constructor(opts = {}) {
    this.show = opts.show || ['health', 'distance'];
    this.labels = { ...DEFAULT_LABELS, ...(opts.labels || {}) };
    this.gapMax = opts.gapMax ?? 40;
    this.lettersIn = opts.lettersIn || null;
    this.lettersTotal = opts.lettersTotal ?? 3;

    this.host = null;
    this.root = null;
    this.parts = {};
    this._last = {};
  }

  /** Build one from a level name. Pass overrides to change any of it. */
  static forLevel(levelName, overrides = {}) {
    const preset = PRESETS[levelName] || PRESETS.level01;
    const guessPrefix = { level01: 'l1-', level02: 'l2-', level03: 'l3-' }[levelName];
    return new Hud({ lettersIn: guessPrefix, ...preset, ...overrides });
  }

  mount(host = null) {
    if (this.root) return this;
    this.host = host || document.getElementById('hud') || document.body;

    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:absolute;inset:0;pointer-events:none;' +
      "font-family:ui-monospace,'JetBrains Mono',Menlo,monospace";

    // top-left stack: the bars that describe Kai
    this.left = this._box('left:26px;top:22px;width:230px');
    // top-centre: whatever is chasing or fighting him
    this.centre = this._box('left:50%;top:22px;width:360px;transform:translateX(-50%)');
    // top-right: the counters
    this.right = this._box('right:26px;top:22px;width:190px;text-align:right');

    for (const key of this.show) {
      if (key === 'health') this.parts.health = this._bar(this.left, this.labels.health, ACCENT);
      else if (key === 'stamina') this.parts.stamina = this._bar(this.left, this.labels.stamina, CYAN, true);
      else if (key === 'boost') this.parts.boost = this._bar(this.left, this.labels.boost, AMBER, true);
      else if (key === 'gap') this.parts.gap = this._gap(this.centre);
      else if (key === 'enemy') this.parts.enemy = this._bar(this.centre, this.labels.enemy, DANGER);
      else if (key === 'distance') this.parts.distance = this._stat(this.right, this.labels.distance);
      else if (key === 'letters') this.parts.letters = this._stat(this.right, this.labels.letters);
      else if (key === 'awards') this.parts.awards = this._stat(this.right, this.labels.awards);
    }

    this.host.appendChild(this.root);
    return this;
  }

  /**
   * Draw the current state. Call once a frame; it is cheap when nothing moved.
   * `extra` is for numbers that are not GameState's business — the Handler's
   * health in level 03, for instance, until someone adds it to GameState.
   */
  update(state, extra = {}) {
    if (!this.root || !state) return;
    const p = this.parts;

    if (p.health) this._setBar(p.health, state.health, state.maxHealth);
    if (p.stamina) this._setBar(p.stamina, state.stamina, state.maxStamina);
    if (p.boost) this._setBar(p.boost, (1 - (state.boostHeat || 0)) * 100, 100);

    if (p.enemy) {
      const hp = extra.enemyHealth ?? state.enemyHealth ?? 0;
      const max = extra.enemyMaxHealth ?? state.enemyMaxHealth ?? 100;
      this._setBar(p.enemy, hp, max);
    }

    if (p.gap) {
      // the bar FILLS as he pulls away, so a full bar is always "good" — the
      // same direction as every other bar on screen
      const frac = Math.max(0, Math.min(1, (state.handlerGap || 0) / this.gapMax));
      const [text, colour] = GAP_TEXT[state.handlerState] || GAP_TEXT.IDLE;
      this._write(p.gap.fill, 'width', (frac * 100).toFixed(1) + '%');
      this._write(p.gap.fill, 'background', colour);
      this._write(p.gap.value, 'text', Math.round(state.handlerGap || 0) + ' m');
      this._write(p.gap.state, 'text', text);
      this._write(p.gap.state, 'color', colour);
    }

    if (p.distance) this._write(p.distance.value, 'text', Math.round(state.distance || 0) + ' m');

    if (p.letters) {
      const n = this.lettersIn ? state.lettersInLevel(this.lettersIn) : (state.letters || []).length;
      this._write(p.letters.value, 'text', n + ' / ' + this.lettersTotal);
    }

    if (p.awards) this._write(p.awards.value, 'text', String((state.awards || []).length));
  }

  /** Flash a bar — call when the player takes a hit, so damage is felt. */
  pulse(which = 'health') {
    const part = this.parts[which];
    if (!part || !part.wrap) return;
    part.wrap.style.transition = 'none';
    part.wrap.style.boxShadow = '0 0 0 2px rgba(255,107,107,.85)';
    // one frame later, let it fade back out
    requestAnimationFrame(() => {
      if (!part.wrap) return;
      part.wrap.style.transition = 'box-shadow .45s ease-out';
      part.wrap.style.boxShadow = '0 0 0 0 rgba(255,107,107,0)';
    });
  }

  unmount() {
    if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    this.root = null;
    this.parts = {};
    this._last = {};
    this.left = this.centre = this.right = null;
  }

  /* ---------------------------------------------------------------- build */

  _box(css) {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;' + css;
    this.root.appendChild(el);
    return el;
  }

  _bar(parent, label, colour, thin = false) {
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom:' + (thin ? '8px' : '12px');

    const cap = document.createElement('div');
    cap.style.cssText =
      `color:${DIM};font-size:10px;letter-spacing:.22em;margin-bottom:5px`;
    cap.textContent = label;
    row.appendChild(cap);

    const wrap = document.createElement('div');
    wrap.style.cssText =
      `height:${thin ? 4 : 9}px;background:rgba(10,14,20,.72);border-radius:2px;` +
      'border:1px solid rgba(143,155,176,.28);overflow:hidden';

    const fill = document.createElement('div');
    fill.style.cssText =
      `height:100%;width:100%;background:${colour};transition:width .18s linear`;
    wrap.appendChild(fill);
    row.appendChild(wrap);
    parent.appendChild(row);
    return { row, wrap, fill, colour };
  }

  _gap(parent) {
    const row = document.createElement('div');
    row.style.cssText = 'text-align:center';

    const head = document.createElement('div');
    head.style.cssText =
      'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px';
    const cap = document.createElement('div');
    cap.style.cssText = `color:${DIM};font-size:10px;letter-spacing:.22em`;
    cap.textContent = this.labels.gap;
    const value = document.createElement('div');
    value.style.cssText = 'color:#eef2fb;font-size:12px;letter-spacing:.1em';
    head.appendChild(cap); head.appendChild(value);
    row.appendChild(head);

    const wrap = document.createElement('div');
    wrap.style.cssText =
      'height:7px;background:rgba(10,14,20,.72);border-radius:2px;' +
      'border:1px solid rgba(143,155,176,.28);overflow:hidden';
    const fill = document.createElement('div');
    fill.style.cssText =
      `height:100%;width:0%;background:${ACCENT};transition:width .16s linear`;
    wrap.appendChild(fill);
    row.appendChild(wrap);

    const state = document.createElement('div');
    state.style.cssText =
      `color:${DIM};font-size:10px;letter-spacing:.24em;margin-top:6px`;
    row.appendChild(state);

    parent.appendChild(row);
    return { row, wrap, fill, value, state };
  }

  _stat(parent, label) {
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom:11px';
    const cap = document.createElement('div');
    cap.style.cssText = `color:${DIM};font-size:10px;letter-spacing:.22em`;
    cap.textContent = label;
    const value = document.createElement('div');
    value.style.cssText =
      'color:#eef2fb;font-size:17px;letter-spacing:.06em;margin-top:2px';
    row.appendChild(cap); row.appendChild(value);
    parent.appendChild(row);
    return { row, value };
  }

  /* ---------------------------------------------------------------- draw */

  _setBar(part, value, max) {
    const frac = Math.max(0, Math.min(1, (value || 0) / (max || 1)));
    this._write(part.fill, 'width', (frac * 100).toFixed(1) + '%');
    // the bar turns amber then red on its own, so a level does not have to
    // remember to colour it
    const colour = frac > 0.55 ? part.colour : (frac > 0.25 ? AMBER : DANGER);
    this._write(part.fill, 'background', colour);
  }

  /** Only touch the DOM when the value actually changed. */
  _write(el, prop, value) {
    if (!el) return;
    const key = (el.__hudId || (el.__hudId = ++_id)) + ':' + prop;
    if (this._last[key] === value) return;
    this._last[key] = value;
    if (prop === 'text') el.textContent = value;
    else el.style[prop] = value;
  }
}

let _id = 0;