import { PAINTS } from './paint.js';

/**
 * Player cars. Every car trades something for something:
 *   speed     top speed, m/s (the Handler cruises at 46)
 *   accel     m/s² off the line
 *   handling  steering rate multiplier
 *   strength  armour + weight: damage taken is divided by it, and a heavier
 *             car is shoved less by the Handler and by traffic
 */
export const CARS = [
  {
    id: 'sedan-sports', name: 'Sports Sedan', path: 'level2/cars/sedan-sports.glb',
    blurb: 'All-rounder', stats: { speed: 42, accel: 22, handling: 1.0, strength: 1.0 },
  },
  {
    id: 'hatchback-sports', name: 'Sports Hatch', path: 'level2/cars/hatchback-sports.glb',
    blurb: 'Nimble and quick off the line, but light', stats: { speed: 39, accel: 27, handling: 1.25, strength: 0.8 },
  },
  {
    id: 'race', name: 'GT Racer', path: 'level2/cars/race.glb',
    blurb: 'Fast, planted at speed', stats: { speed: 46, accel: 21, handling: 0.9, strength: 0.9 },
  },
  {
    id: 'race-future', name: 'Future Racer', path: 'level2/cars/race-future.glb',
    blurb: 'Very fast, very fragile', stats: { speed: 48, accel: 25, handling: 0.95, strength: 0.7 },
  },
  // "CAR Model" by Ignition Labs, CC BY 3.0 — see public/assets/level2/CREDITS.md
  {
    id: 'supercar', name: 'Supercar', path: 'level2/cars/supercar.glb',
    blurb: 'Fastest car here — one bad PIT and it is in pieces', stats: { speed: 50, accel: 24, handling: 0.9, strength: 0.65 },
  },
  {
    id: 'bruiser', name: 'Bruiser', path: 'level2/traffic/suv.glb',
    blurb: 'Slow, heavy, shrugs off rams — and shoves back', stats: { speed: 37, accel: 17, handling: 0.8, strength: 1.6 },
  },
];

export const HANDLER_MODEL = 'level2/handler-car.glb';

const KEY = 'blackout.level2.car';
const PAINT_KEY = 'blackout.level2.paint';

export function loadSavedCar() {
  try {
    const index = CARS.findIndex((car) => car.id === localStorage.getItem(KEY));
    return index >= 0 ? index : 0;
  } catch {
    return 0;
  }
}

export function saveCar(index) {
  try {
    localStorage.setItem(KEY, CARS[index].id);
  } catch {}
}

export function loadSavedPaint() {
  try {
    const index = PAINTS.findIndex((p) => p.id === localStorage.getItem(PAINT_KEY));
    return index >= 0 ? index : 0;
  } catch {
    return 0;
  }
}

export function savePaint(index) {
  try {
    localStorage.setItem(PAINT_KEY, PAINTS[index].id);
  } catch {}
}

// bar ranges, so the bars compare the cars with each other
const RANGES = {
  speed: [34, 50], accel: [15, 28], handling: [0.7, 1.3], strength: [0.55, 1.65],
};
const LABELS = { speed: 'SPEED', accel: 'ACCEL', handling: 'HANDLING', strength: 'STRENGTH' };

export function createCarPicker({ startIndex = 0, startPaint = 0, onChange, onPaint, onConfirm }) {
  const root = document.createElement('div');
  root.id = 'car-picker';
  root.style.cssText = `
    position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:20;
    width:min(640px, calc(100vw - 32px));box-sizing:border-box;padding:14px 18px;border:1px solid rgba(120,200,255,.3);
    border-radius:8px;background:rgba(5,10,15,.78);color:#d7e2ea;text-align:center;
    font-family:'Segoe UI',system-ui,sans-serif;backdrop-filter:blur(4px);`;
  root.innerHTML = `
    <div style="margin-bottom:10px;color:#7fd8ff;font-size:11px;letter-spacing:3px">CHOOSE YOUR CAR</div>
    <div class="cars" style="display:flex;flex-wrap:wrap;justify-content:center;gap:6px"></div>
    <div class="blurb" style="margin:10px 0 6px;color:#9fb4c2;font-size:12px;min-height:16px"></div>
    <div class="stats" style="display:grid;grid-template-columns:auto 1fr;gap:4px 10px;align-items:center;max-width:420px;margin:0 auto;font-size:10px;letter-spacing:1px;color:#8fa3b0"></div>
    <div style="margin:12px 0 6px;color:#7fd8ff;font-size:10px;letter-spacing:3px">PAINT</div>
    <div class="paints" style="display:flex;flex-wrap:wrap;justify-content:center;gap:6px"></div>
    <div style="margin-top:12px"><button class="go" style="cursor:pointer;border:0;border-radius:4px;background:#7fd8ff;color:#05070a;padding:8px 22px;font-weight:700;letter-spacing:1px">DRIVE</button></div>
    <div style="margin-top:8px;color:#8fa3b0;font-size:11px">A / D or ← / → car · Q / E paint · Enter to drive · V to change car</div>`;

  const buttons = CARS.map((car, index) => {
    const button = document.createElement('button');
    button.textContent = car.name;
    button.style.cssText = 'cursor:pointer;border:1px solid rgba(120,200,255,.3);border-radius:4px;background:transparent;color:#d7e2ea;padding:7px 12px;font-size:12px';
    button.addEventListener('click', () => onChange?.(index));
    root.querySelector('.cars').appendChild(button);
    return button;
  });

  const bars = {};
  for (const key of Object.keys(LABELS)) {
    const label = document.createElement('div');
    label.textContent = LABELS[key];
    label.style.textAlign = 'right';
    const track = document.createElement('div');
    track.style.cssText = 'height:6px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden';
    const fill = document.createElement('div');
    fill.style.cssText = 'height:100%;width:0;background:#7fd8ff;border-radius:3px;transition:width .25s';
    track.appendChild(fill);
    root.querySelector('.stats').append(label, track);
    bars[key] = fill;
  }

  const swatches = PAINTS.map((paint, index) => {
    const s = document.createElement('button');
    s.title = paint.name;
    s.setAttribute('aria-label', paint.name);
    const bg = paint.color === null
      ? 'linear-gradient(135deg,#7fd8ff 0 50%,#ffb020 50% 100%)'
      : '#' + paint.color.toString(16).padStart(6, '0');
    s.style.cssText = `cursor:pointer;width:24px;height:24px;border-radius:50%;border:2px solid transparent;background:${bg};padding:0`;
    s.addEventListener('click', () => onPaint?.(index));
    root.querySelector('.paints').appendChild(s);
    return s;
  });

  root.querySelector('.go').addEventListener('click', () => onConfirm?.());

  function setIndex(index) {
    buttons.forEach((button, buttonIndex) => {
      const selected = buttonIndex === index;
      button.style.background = selected ? 'rgba(127,216,255,.22)' : 'transparent';
      button.style.borderColor = selected ? '#7fd8ff' : 'rgba(120,200,255,.3)';
      button.style.color = selected ? '#fff' : '#d7e2ea';
    });
    const car = CARS[index];
    root.querySelector('.blurb').textContent = car.blurb;
    for (const key of Object.keys(bars)) {
      const [lo, hi] = RANGES[key];
      bars[key].style.width = `${Math.round(Math.max(0.05, Math.min(1, (car.stats[key] - lo) / (hi - lo))) * 100)}%`;
    }
  }

  function setPaint(index) {
    swatches.forEach((s, i) => { s.style.borderColor = i === index ? '#fff' : 'transparent'; });
  }

  setIndex(startIndex);
  setPaint(startPaint);
  document.body.appendChild(root);
  return { setIndex, setPaint, destroy: () => root.remove() };
}
