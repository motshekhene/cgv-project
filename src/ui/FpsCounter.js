import { settings, onSettings } from '../core/settings.js';

/**
 * FpsCounter — frames per second at the left edge of the screen, when SHOW FPS
 * is on (OPTIONS). It counts the browser's own frames (the game draws one per
 * frame), averaged over half a second.
 *
 *   mountFpsCounter();   // once, from main.js
 */
export function mountFpsCounter() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed; left:10px; top:45%; z-index:9600; pointer-events:none;'
    + 'font:700 12px "Segoe UI", system-ui, sans-serif; letter-spacing:.12em; color:#e3bb62;'
    + 'text-shadow:0 1px 0 #000, 0 0 8px rgba(0,0,0,.8);';
  document.body.appendChild(el);
  let frames = 0;
  let from = performance.now();
  const show = () => { el.style.display = settings.showFps ? '' : 'none'; };
  show();
  onSettings(show);
  (function tick(now) {
    frames++;
    if (now - from >= 500) {
      el.textContent = `${Math.round((frames * 1000) / (now - from))} FPS`;
      frames = 0;
      from = now;
    }
    requestAnimationFrame(tick);
  })(performance.now());
  return el;
}
