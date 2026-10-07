import { PAINTS } from './paint.js';

/**
 * Player cars. Every car trades something for something:
 *   speed     top speed, m/s (the Handler cruises at 46)
 *   accel     m/s² off the line
 *   handling  steering rate multiplier
 *   strength  armour + weight: damage taken is divided by it, and a heavier
 *             car is shoved less by the Handler and by traffic
 */
// Models: Quaternius "Cars Bundle" (CC0) + "CAR Model" by Ignition Labs (CC BY 3.0).
// `length` is the car's real-world length in metres; everything (lights,
// skid marks, collisions) is fitted to it. See public/assets/level2/CREDITS.md
export const CARS = [
  {
    // "Convertible" by Poly by Google, CC BY 3.0
    id: 'executive', name: 'Executive', path: 'level2/cars/executive.glb', length: 4.9,
    blurb: 'All-rounder — quick, comfortable, nothing to prove', stats: { speed: 43, accel: 22, handling: 1.0, strength: 1.0 },
  },
  {
    // "Toyota AE86" by IvOfficial, CC BY 3.0
    // white body painted into its texture: no separate paint colour to target, factory only
    id: 'drifter', name: 'Drifter', path: 'level2/cars/drifter.glb', length: 4.2, paintable: false,
    blurb: 'Light, nimble, born to slide — Space to drift', stats: { speed: 40, accel: 26, handling: 1.3, strength: 0.8 },
  },
  {
    // "Car" by theking1322, CC BY 3.0 (modelled side-on: turned to face +Z)
    // its body has stray vertices well below the tyres: stand it on the wheels,
    // which are separate meshes called Cylinder001-004
    id: 'muscle', name: 'Muscle', path: 'level2/cars/muscle.glb', length: 4.8, yaw: Math.PI / 2,
    ground: /^Cylinder00[1-4]$/, wheels: /^Cylinder00[1-4]$/,
    blurb: 'Big engine, heavy body — wins the shoving matches', stats: { speed: 45, accel: 23, handling: 0.85, strength: 1.2 },
  },
  {
    id: 'street-racer', name: 'Street Racer', path: 'level2/cars/street-racer.glb', length: 4.4,
    blurb: 'Very fast, very fragile', stats: { speed: 48, accel: 25, handling: 1.0, strength: 0.75 },
  },
  {
    id: 'supercar', name: 'Supercar', path: 'level2/cars/supercar.glb', length: 4.8,
    blurb: 'Fastest car here — one bad PIT and it is in pieces', stats: { speed: 50, accel: 24, handling: 0.9, strength: 0.65 },
  },
  {
    // "Pickup Truck" by Quaternius, CC0
    id: 'bruiser', name: 'Bruiser', path: 'level2/traffic/pickup.glb', length: 5.3,
    blurb: 'Pickup truck: slow, heavy, shrugs off rams — and shoves back', stats: { speed: 37, accel: 17, handling: 0.8, strength: 1.6 },
  },
];

// the Handler drives an expedition Range Rover ("Range Rover" by IvOfficial,
// CC BY 3.0) in its own tan, with the red/blue light bar on the roof rack.
// Its wheels are Tire1-4 (the "Spare Tire" on the back door must not spin).
export const HANDLER_MODEL = 'level2/handler-ranger.glb';
export const HANDLER_OPTIONS = { length: 4.9, wheels: /^Tire\d$/ };

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

// jungle-shrine palette: carved dark wood + moss, gold trim, leaf-green highlights
const J = {
  panel: 'linear-gradient(160deg, rgba(34,30,18,.94) 0%, rgba(20,28,16,.94) 55%, rgba(14,20,12,.95) 100%)',
  gold: '#d9b45a',
  goldDim: 'rgba(217,180,90,.35)',
  leaf: '#8fc25a',
  leafDim: 'rgba(143,194,90,.18)',
  text: '#ece2c6',
  muted: '#b3a98b',
  serif: "'Cinzel', 'Trajan Pro', Georgia, 'Times New Roman', serif",
  sans: "'Segoe UI', system-ui, sans-serif",
};

export function createCarPicker({ startIndex = 0, startPaint = 0, onChange, onPaint, onConfirm }) {
  const root = document.createElement('div');
  root.id = 'car-picker';
  root.style.cssText = `
    position:fixed;left:28px;top:39%;transform:translateY(-50%);z-index:20;
    width:min(400px, 70vh, calc(100vw - 32px));aspect-ratio:1 / 1;overflow:hidden;box-sizing:border-box;
    display:flex;flex-direction:column;
    padding:16px 18px 12px;border:1px solid ${J.goldDim};border-radius:6px;
    background:${J.panel};color:${J.text};font-family:${J.sans};
    box-shadow:0 0 0 4px rgba(10,14,8,.55), 0 0 0 5px ${J.goldDim}, 0 18px 40px rgba(0,0,0,.55);
    animation:jp-in .35s ease-out;`;
  root.innerHTML = `
    <style>
      @keyframes jp-in { from { opacity:0; transform:translate(-14px,-50%); } to { opacity:1; transform:translate(0,-50%); } }
      #car-picker button { font-family:${J.sans}; }
      #car-picker .cars { display:grid;grid-template-columns:1fr 1fr;gap:5px; }
      #car-picker .car { cursor:pointer;display:flex;justify-content:space-between;align-items:center;width:100%;
        padding:7px 10px;margin:0;border:1px solid rgba(217,180,90,.22);border-radius:3px;
        background:rgba(0,0,0,.18);color:${J.text};font-size:13px;letter-spacing:.5px;text-align:left;
        transition:background .15s, border-color .15s, transform .15s; }
      #car-picker .car:hover { background:${J.leafDim};transform:translateX(3px); }
      #car-picker .car.sel { background:linear-gradient(90deg, rgba(143,194,90,.28), rgba(143,194,90,.06));
        border-color:${J.leaf};color:#fff; }
      #car-picker .car.sel::after { content:'◆';color:${J.gold};font-size:10px; }
      #car-picker .go { cursor:pointer;flex:1;margin:0;padding:9px 0;border:1px solid ${J.gold};border-radius:3px;
        background:linear-gradient(180deg,#e6c46c,#b38a32);color:#1d1708;font-family:${J.serif};font-weight:700;
        font-size:15px;letter-spacing:4px;box-shadow:0 0 18px rgba(217,180,90,.25);transition:filter .15s, transform .15s; }
      #car-picker .go:hover { filter:brightness(1.1);transform:translateY(-1px); }
      #car-picker .sw { cursor:pointer;width:26px;height:26px;border-radius:50%;padding:0;border:2px solid rgba(0,0,0,.4);
        box-shadow:0 0 0 1px ${J.goldDim};transition:transform .15s, box-shadow .15s; }
      #car-picker .sw.sel { transform:scale(1.15);box-shadow:0 0 0 2px ${J.gold}, 0 0 10px rgba(217,180,90,.5); }
      #car-picker .lbl { color:${J.gold};font-family:${J.serif};font-size:10px;letter-spacing:3px;margin:0 0 6px; }
    </style>
    <div style="text-align:center;font-family:${J.serif};color:${J.gold};font-size:12px;letter-spacing:5px">❦ THE RIVER ROAD ❦</div>
    <div style="text-align:center;font-family:${J.serif};font-size:19px;letter-spacing:3px;margin:3px 0 0;color:${J.text}">CHOOSE YOUR CAR</div>
    <div style="height:1px;margin:8px 0 10px;background:linear-gradient(90deg,transparent,${J.gold},transparent)"></div>
    <div class="cars"></div>
    <div class="blurb" style="margin:8px 2px 6px;color:${J.muted};font-size:11.5px;font-style:italic;min-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>
    <div class="stats" style="display:grid;grid-template-columns:70px 1fr;gap:5px 10px;align-items:center;font-size:9.5px;letter-spacing:1.5px;color:${J.muted}"></div>
    <div style="flex:1"></div>
    <div style="display:flex;align-items:flex-end;gap:14px;margin-top:10px">
      <div><div class="lbl">PAINT</div><div class="paints" style="display:flex;gap:8px"></div></div>
      <button class="go">DRIVE</button>
    </div>
    <div style="margin-top:8px;color:${J.muted};font-size:10px;text-align:center">
      A / D car · Q / E paint · Enter drive · V change car</div>`;

  const buttons = CARS.map((car, index) => {
    const button = document.createElement('button');
    button.className = 'car';
    button.innerHTML = `<span>${car.name}</span>`;
    button.addEventListener('click', () => onChange?.(index));
    root.querySelector('.cars').appendChild(button);
    return button;
  });

  const bars = {};
  for (const key of Object.keys(LABELS)) {
    const label = document.createElement('div');
    label.textContent = LABELS[key];
    const track = document.createElement('div');
    track.style.cssText = 'height:7px;border-radius:2px;background:rgba(0,0,0,.35);box-shadow:inset 0 0 0 1px rgba(217,180,90,.15);overflow:hidden';
    const fill = document.createElement('div');
    fill.style.cssText = `height:100%;width:0;border-radius:2px;background:linear-gradient(90deg,#5e8f34,${J.leaf});transition:width .3s ease`;
    track.appendChild(fill);
    root.querySelector('.stats').append(label, track);
    bars[key] = fill;
  }

  const swatches = PAINTS.map((paint, index) => {
    const s = document.createElement('button');
    s.className = 'sw';
    s.title = paint.name;
    s.setAttribute('aria-label', paint.name);
    s.style.background = paint.color === null
      ? `conic-gradient(${J.leaf} 0 25%, ${J.gold} 0 50%, #c8102e 0 75%, #3d8be0 0)`
      : '#' + paint.color.toString(16).padStart(6, '0');
    s.addEventListener('click', () => onPaint?.(index));
    root.querySelector('.paints').appendChild(s);
    return s;
  });

  root.querySelector('.go').addEventListener('click', () => onConfirm?.());
  // a clicked button keeps focus and would swallow Enter / Space (the game's
  // "drive" keys) — drop focus after every click, and never let them activate
  root.addEventListener('click', () => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') e.preventDefault(); });

  function setIndex(index) {
    buttons.forEach((b, i) => b.classList.toggle('sel', i === index));
    const car = CARS[index];
    root.querySelector('.blurb').textContent = car.blurb;
    const paintable = car.paintable !== false;
    swatches.forEach((s, i) => {
      const off = !paintable && i > 0;
      s.disabled = off;
      s.style.opacity = off ? '0.25' : '1';
      s.style.cursor = off ? 'not-allowed' : 'pointer';
      s.title = off ? 'This car only comes in its factory colour' : PAINTS[i].name;
    });
    for (const key of Object.keys(bars)) {
      const [lo, hi] = RANGES[key];
      bars[key].style.width = `${Math.round(Math.max(0.05, Math.min(1, (car.stats[key] - lo) / (hi - lo))) * 100)}%`;
    }
  }

  function setPaint(index) {
    swatches.forEach((s, i) => s.classList.toggle('sel', i === index));
  }

  setIndex(startIndex);
  setPaint(startPaint);
  document.body.appendChild(root);
  return { setIndex, setPaint, destroy: () => root.remove() };
}
