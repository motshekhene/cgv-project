/**
 * Settings — the player's options (the OPTIONS panel, ui/OptionsMenu.js),
 * saved in this browser and read wherever they matter:
 *
 *   master       0..1  every sound in the game (audio/masterMute.js)
 *   music        0..1  the music on its own (each level's music bus, the title's theme)
 *   sensitivity  x     mouse-look speed (the prologue, Level 3)
 *   invertY      bool  mouse-look up / down flipped
 *   quality      'low' | 'medium' | 'high'   resolution and shadows (Game.applyQuality)
 *   showFps      bool  the frame-rate counter (ui/FpsCounter.js)
 *   voices       bool  hints and warnings read aloud (audio/voice.js)
 *
 *   import { settings, setSetting, onSettings } from '../core/settings.js';
 *   setSetting('music', 0.5);
 *   const off = onSettings((s, key) => ...);   // returns an unsubscribe
 */
const KEY = 'silent-horn.settings';

export const QUALITIES = ['low', 'medium', 'high'];
export const SENSITIVITIES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

const DEFAULTS = { master: 1, music: 0.8, sensitivity: 1, invertY: false, quality: 'high', showFps: false, voices: true };

const clamp01 = (v, d) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : d);

/** true once the player has picked a GRAPHICS level themselves (saved); until then Game picks one for the machine. */
export let qualityChosen = false;

function load() {
  let s = {};
  try {
    s = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    s = {};
  }
  qualityChosen = QUALITIES.includes(s.quality);
  // anything missing or out of range falls back to the default
  return {
    master: clamp01(s.master, DEFAULTS.master),
    music: clamp01(s.music, DEFAULTS.music),
    sensitivity: SENSITIVITIES.includes(s.sensitivity) ? s.sensitivity : DEFAULTS.sensitivity,
    invertY: typeof s.invertY === 'boolean' ? s.invertY : DEFAULTS.invertY,
    quality: QUALITIES.includes(s.quality) ? s.quality : DEFAULTS.quality,
    showFps: typeof s.showFps === 'boolean' ? s.showFps : DEFAULTS.showFps,
    voices: typeof s.voices === 'boolean' ? s.voices : DEFAULTS.voices,
  };
}

export const settings = load();
const listeners = new Set();

export function setSetting(key, value) {
  if (settings[key] === value) return;
  settings[key] = value;
  if (key === 'quality') qualityChosen = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // storage blocked (private window): the setting holds for this session only
  }
  for (const f of listeners) f(settings, key);
}

export function onSettings(f) {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Mouse-look multipliers for x and y: the sensitivity, and y flipped if asked. */
export function lookScale() {
  return { x: settings.sensitivity, y: settings.sensitivity * (settings.invertY ? -1 : 1) };
}
