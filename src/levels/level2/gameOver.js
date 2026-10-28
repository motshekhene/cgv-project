import { showLoseCard } from '../../ui/EndCard.js';

/**
 * End cards — Member 2A
 *
 *   createGameOverScreen   the "WRECKED" card: how far, how fast, how long
 *
 * It is the losing card every level shows (ui/EndCard.js showLoseCard: the
 * team's carved-letter end screen with TRY AGAIN and MAIN MENU), with Level
 * 2's numbers on it. Gameplay is frozen behind it (Level02 gates update());
 * destroy() removes it.
 */
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function createGameOverScreen(game, { topSpeedKmh, distance, time, onRetry = null, onMenu = null }) {
  return showLoseCard(game, {
    title: 'WRECKED',
    sub: 'The Marshal ran you off the River Road.',
    lines: [
      { stats: [
        { label: 'DRIVEN', value: Math.round(distance), unit: 'M' },
        { label: 'TOP SPEED', value: Math.round(topSpeedKmh), unit: 'KM/H' },
        { label: 'TIME', value: fmtTime(time) },
      ] },
    ],
    onRetry,
    onMenu,
  });
}
