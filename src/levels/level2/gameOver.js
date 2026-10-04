import { THEME_CSS, END_CSS, showEndScreen } from '../../ui/theme.js';

/**
 * End cards — Member 2A
 *
 * Both use the team's end-screen look from Level 3 (src/ui/theme.js): the
 * carved letters dropping in one by one, the gold ornament, the stone buttons.
 *
 *   createGameOverScreen   ember "WRECKED" card: RETRY (R) · CONTINUE (C) · QUIT (Q)
 *   createFinishScreen     gold "THE FALLS" card after the plunge: ENTER → Level 3
 *
 * Gameplay is frozen behind them (Level02 gates update()), and they only let
 * go once a button is picked. Purely DOM; destroy() removes everything.
 */
const CSS = THEME_CSS + END_CSS + `
.l2end { position:fixed; inset:0; z-index:30; pointer-events:auto; }
.l2end .end-btn + .end-btn { margin-left:14px; }
`;

function mount() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const host = document.createElement('div');
  host.className = 'l2end so';        // .so: the theme's colour variables
  const end = document.createElement('div');
  host.appendChild(end);
  document.body.appendChild(host);
  return { style, host, end };
}

/** Extra buttons next to showEndScreen's single action, animated in after it. */
function addButton(end, label, key, onClick) {
  const first = end.querySelector('.end-btn');
  const btn = document.createElement('button');
  btn.className = 'end-btn';
  btn.textContent = label;
  btn.style.setProperty('--d', first ? first.style.getPropertyValue('--d') : '1s');
  const k = document.createElement('kbd');
  k.textContent = key;
  btn.appendChild(k);
  btn.addEventListener('click', onClick);
  (first ? first.parentNode : end.querySelector('.end-in')).appendChild(btn);   // same row as the first
  return btn;
}

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function createGameOverScreen({ topSpeedKmh, distance, time, onRestart, onContinue, onQuit }) {
  const { style, host, end } = mount();
  showEndScreen(end, {
    kind: 'lose',
    title: 'WRECKED',
    sub: 'The Handler ran you off the River Road.',
    lines: [
      { text: `${Math.round(distance)} M DRIVEN  ·  TOP SPEED ${Math.round(topSpeedKmh)} KM/H  ·  ${fmtTime(time)}` },
    ],
    action: { label: 'RETRY', key: 'R', onClick: () => onRestart?.() },
  });
  addButton(end, 'CONTINUE', 'C', () => onContinue?.());
  addButton(end, 'QUIT', 'Q', () => onQuit?.());

  // CONTINUE/QUIT keys only: R already restarts globally (Game._frame), and
  // Escape is the shared pause key.
  const onKey = (e) => {
    const k = e.key.toLowerCase();
    if (k === 'c') onContinue?.();
    else if (k === 'q') onQuit?.();
  };
  window.addEventListener('keydown', onKey);
  return { el: host, destroy: () => { window.removeEventListener('keydown', onKey); host.remove(); style.remove(); } };
}

export function createFinishScreen({ time, topSpeedKmh, rewards, rewardsTotal, health, maxHealth, onNext }) {
  const { style, host, end } = mount();
  showEndScreen(end, {
    kind: 'win',
    title: 'THE FALLS',
    sub: 'The road ends where the river does. Kai goes over with it, and the shrine waits below.',
    lines: [
      { text: `${fmtTime(time)}  ·  TOP SPEED ${Math.round(topSpeedKmh)} KM/H  ·  REWARDS ${rewards} / ${rewardsTotal}  ·  HEALTH ${Math.ceil(health)} / ${maxHealth}` },
      { cls: 'end-credits', text: 'LEVEL 2 COMPLETE — THE RIVER ROAD' },
    ],
    action: { label: 'ENTER THE SHRINE', key: 'ENTER', onClick: () => go() },
  });
  let done = false;
  const go = () => { if (done) return; done = true; onNext?.(); };
  const onKey = (e) => { if (e.key === 'Enter') go(); };
  window.addEventListener('keydown', onKey);
  return { el: host, destroy: () => { window.removeEventListener('keydown', onKey); host.remove(); style.remove(); } };
}
