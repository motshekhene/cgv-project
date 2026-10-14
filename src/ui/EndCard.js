import { THEME_CSS, END_CSS, showEndScreen } from './theme.js';

/**
 * A full-screen end card in the team's look (ui/theme.js), for levels that
 * do not already have a FightHUD or StoryOverlay to show it on.
 *
 *   const card = showEndCard({
 *     kind: 'win',                       // 'win' (gold) | 'lose' (ember)
 *     title: 'ESCAPED',
 *     sub: 'The gate held him back.',
 *     lines: [{ text: '1200 M  ·  CLOSEST CALL 2.4 M' }],
 *     action: { label: 'CONTINUE', key: 'SPACE', onClick },
 *     extra: [{ label: 'RELOAD GAME', onClick }],   // more buttons on the same row
 *   });
 *   card.destroy();
 *
 * A button's key works once the button has faded in. Set `bindKey: false` for
 * a key Game already handles itself (R restarts the level globally).
 */
const CSS = THEME_CSS + END_CSS + `
.endcard { position:fixed; inset:0; z-index:9999; pointer-events:auto; }
.endcard .end-btn + .end-btn { margin-left:14px; }
`;

const KEY_NAMES = { SPACE: ' ', ENTER: 'enter', ESC: 'escape' };
const keyOf = (label) => KEY_NAMES[label] ?? label.toLowerCase();

export function showEndCard({ kind = 'win', title, sub = '', lines = [], action = null, extra = [] }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const host = document.createElement('div');
  host.className = 'endcard so'; // .so: the theme's colour variables
  const end = document.createElement('div');
  host.appendChild(end);
  document.body.appendChild(host);

  showEndScreen(end, { kind, title, sub, lines, action });
  const first = end.querySelector('.end-btn');
  for (const b of extra) {
    const btn = document.createElement('button');
    btn.className = 'end-btn';
    btn.textContent = b.label;
    btn.style.setProperty('--d', first ? first.style.getPropertyValue('--d') : '1s');
    if (b.key) {
      const k = document.createElement('kbd');
      k.textContent = b.key;
      btn.appendChild(k);
    }
    btn.addEventListener('click', () => b.onClick?.());
    (first ? first.parentNode : end.querySelector('.end-in')).appendChild(btn);
  }

  // keys only count once the buttons are on screen, so a held key from the
  // level (Space is jump) cannot skip the card before it is read
  const readyAt = performance.now() + 1000 * parseFloat(first?.style.getPropertyValue('--d') || '1');
  const bound = [action, ...extra].filter((b) => b && b.key && b.bindKey !== false);
  const onKey = (e) => {
    if (e.repeat || performance.now() < readyAt) return;
    const b = bound.find((x) => keyOf(x.key) === e.key.toLowerCase());
    if (!b) return;
    e.preventDefault();
    b.onClick?.();
  };
  window.addEventListener('keydown', onKey);

  return {
    el: host,
    destroy() {
      window.removeEventListener('keydown', onKey);
      host.remove();
      style.remove();
    },
  };
}

/**
 * The one losing card, the same in every level: what happened, then TRY AGAIN
 * (R: the level from the top) and MAIN MENU, the pair the pause menu offers.
 *
 *   this._loseCard = showLoseCard(this.game, { title: 'CAUGHT', sub, lines });
 *   this._loseCard?.destroy();   // in teardown()
 *
 * R is Game's own restart key, so the card leaves it to Game (bindKey: false).
 * onRetry / onMenu run first, for a level with something to set on the way out.
 */
export function showLoseCard(game, { title, sub = '', lines = [], onRetry = null, onMenu = null }) {
  const card = showEndCard({
    kind: 'lose',
    title,
    sub,
    lines,
    action: {
      label: 'TRY AGAIN',
      key: 'R',
      bindKey: false,
      onClick: () => {
        card.destroy();
        onRetry?.();
        game?.restart();
      },
    },
    extra: [{
      label: 'MAIN MENU',
      onClick: () => {
        card.destroy();
        onMenu?.();
        game?.setPaused(false, 'switch');
        game?.setLevel('title');
      },
    }],
  });
  return card;
}
