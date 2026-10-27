/**
 * How words look in this game, everywhere: the prologue's style, shared.
 *
 *   serif     Crimson Pro (one line from Google Fonts), Georgia behind it
 *   cream     the spoken line itself, no box, just shadows and a soft dark
 *             gradient at the bottom of the screen
 *   names     above each line, wide-spaced, in the speaker's colour:
 *             KAI moss green, BABA ZWANE amber (the fire, the lamp), THE
 *             MARSHAL ember (the colour of his mask's eyes)
 *   thoughts  Kai's own head: italic cream, no name, low in the frame
 *
 * The prologue's fire conversation, Level 3's face-offs and Kai's thoughts on
 * the run in Levels 1 and 2 all draw from here, so a line of dialogue reads
 * the same whichever level it is in.
 *
 *   import { kaiThinks } from '../ui/dialogue.js';
 *   kaiThinks('The whole forest just went quiet.');   // fades itself out
 */

import { hush } from '../audio/voice.js';

export const DIALOGUE_FONT = "'Crimson Pro', Georgia, 'Times New Roman', serif";
export const CREAM = '#f2e8d5';
export const SPEAKERS = {
  KAI: '#9ed36a',
  'BABA ZWANE': '#ffb03a',
  'THE MARSHAL': '#f2934f',
};

/** Load the dialogue serif once for the whole game; Georgia carries it if the network is gone. */
export function ensureDialogueFont() {
  if (typeof document === 'undefined' || document.getElementById('prologue-serif')) return;
  const link = document.createElement('link');
  link.id = 'prologue-serif'; // the prologue's own id, so it never loads twice
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,500;0,600;1,500&display=swap';
  document.head.appendChild(link);
}

let thoughtEl = null;
let thoughtTimer = 0;
let shown = null; // the thought on screen now
let holdUntil = 0; // performance.now() before which no thought shows
const queue = [];

/**
 * Something the player must read right now (a warning, a torn page) is on
 * screen: Kai's thoughts step aside for `secs`. The one on screen goes back
 * to the front of the queue and comes up again after, so nothing is lost and
 * nothing is read on top of anything else.
 */
export function holdThoughts(secs) {
  if (typeof document === 'undefined') return;
  holdUntil = Math.max(holdUntil, performance.now() + secs * 1000);
  if (shown) {
    queue.unshift(shown);
    shown = null;
  }
  if (thoughtEl) thoughtEl.style.opacity = '0';
  clearTimeout(thoughtTimer);
  thoughtTimer = setTimeout(next, holdUntil - performance.now());
}

/**
 * One of Kai's thoughts, the prologue's way: italic cream serif, low centre,
 * no speaker name. Queued, so two never land on top of each other; each one
 * stays up long enough to read (or `secs`). Safe to call from any level.
 * `onShow` runs when it actually comes up (a camera move timed to the line).
 *
 * A thought belongs to its moment: one still waiting `within` seconds after it
 * was asked for is dropped, never shown late about something long passed.
 * `now: true` is a reaction to what just happened on screen (a whistle, the
 * gate slamming): it cuts in at once, ahead of anything waiting.
 */
export function kaiThinks(text, secs = null, onShow = null, { now = false, within = 5 } = {}) {
  if (typeof document === 'undefined') return;
  ensureDialogueFont();
  const words = text.trim().split(/\s+/).length;
  const item = { text, secs: secs ?? Math.max(2.6, 1.4 + words * 0.32), onShow, at: performance.now(), within };
  if (now) {
    queue.unshift(item);
    holdUntil = 0;
    shown = null;
    clearTimeout(thoughtTimer);
    next();
    return;
  }
  queue.push(item);
  if (!thoughtTimer) next();
}

function next() {
  const wait = holdUntil - performance.now();
  if (wait > 0) {
    thoughtTimer = setTimeout(next, wait);
    return;
  }
  // a thought that never got its moment is let go (one a hold put back has been seen, and comes back)
  while (queue.length && !queue[0].seen && performance.now() - queue[0].at > queue[0].within * 1000) queue.shift();
  const n = queue.shift();
  shown = n || null;
  if (!n) {
    thoughtTimer = 0;
    if (thoughtEl) thoughtEl.style.opacity = '0';
    return;
  }
  if (!thoughtEl || !thoughtEl.isConnected) {
    thoughtEl = document.createElement('div');
    thoughtEl.style.cssText =
      'position:fixed;left:50%;bottom:22%;transform:translateX(-50%);max-width:min(680px,86vw);z-index:8600;' +
      `pointer-events:none;text-align:center;color:${CREAM};font-family:${DIALOGUE_FONT};font-size:22px;` +
      'font-style:italic;line-height:1.5;text-shadow:0 2px 14px rgba(0,0,0,.95), 0 0 30px rgba(0,0,0,.6);' +
      'opacity:0;transition:opacity .5s';
    document.body.appendChild(thoughtEl);
  }
  thoughtEl.textContent = n.text;
  thoughtEl.style.opacity = '1';
  n.seen = true;
  n.onShow?.();
  n.onShow = null; // once, even if a hold brings the line back
  thoughtTimer = setTimeout(() => {
    shown = null;
    if (thoughtEl) thoughtEl.style.opacity = '0';
    thoughtTimer = setTimeout(next, 550);
  }, n.secs * 1000);
}

/** Clear any thought on screen and everything queued (a level tearing down). */
export function clearThoughts() {
  queue.length = 0;
  shown = null;
  holdUntil = 0;
  hush();
  clearTimeout(thoughtTimer);
  thoughtTimer = 0;
  if (thoughtEl) {
    thoughtEl.remove();
    thoughtEl = null;
  }
}
