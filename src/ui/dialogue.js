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
const queue = [];

/**
 * One of Kai's thoughts, the prologue's way: italic cream serif, low centre,
 * no speaker name. Queued, so two never land on top of each other; each one
 * stays up long enough to read (or `secs`). Safe to call from any level.
 */
export function kaiThinks(text, secs = null) {
  if (typeof document === 'undefined') return;
  ensureDialogueFont();
  const words = text.trim().split(/\s+/).length;
  queue.push({ text, secs: secs ?? Math.max(2.6, 1.4 + words * 0.32) });
  if (!thoughtTimer) next();
}

function next() {
  const n = queue.shift();
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
  thoughtTimer = setTimeout(() => {
    if (thoughtEl) thoughtEl.style.opacity = '0';
    thoughtTimer = setTimeout(next, 550);
  }, n.secs * 1000);
}

/** Clear any thought on screen and everything queued (a level tearing down). */
export function clearThoughts() {
  queue.length = 0;
  clearTimeout(thoughtTimer);
  thoughtTimer = 0;
  if (thoughtEl) {
    thoughtEl.remove();
    thoughtEl = null;
  }
}
