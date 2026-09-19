/**
 * carSelect — Member 2A
 *
 * The list of cars the player can drive in Level 2, the remembered choice,
 * and the little picker panel shown over the 3D preview.
 * Cosmetic only: every car uses the same VehicleController numbers.
 *
 * To add a car: drop a .glb in public/assets/level2/cars/ (lowercase, no
 * spaces, texture embedded) and add a line to CARS.
 */
export const CARS = [
  { id: 'sedan-sports',     name: 'Sports Sedan',  path: 'level2/cars/sedan-sports.glb' },
  { id: 'hatchback-sports', name: 'Sports Hatch',  path: 'level2/cars/hatchback-sports.glb' },
  { id: 'race',             name: 'GT Racer',      path: 'level2/cars/race.glb' },
  { id: 'race-future',      name: 'Future Racer',  path: 'level2/cars/race-future.glb' },
];

export const HANDLER_MODEL = 'level2/handler-car.glb';

const KEY = 'blackout.level2.car';

/** Index of the car the player picked last time (0 if none / storage blocked). */
export function loadSavedCar() {
  try {
    const i = CARS.findIndex((c) => c.id === localStorage.getItem(KEY));
    return i >= 0 ? i : 0;
  } catch (_) {
    return 0;
  }
}

export function saveCar(index) {
  try { localStorage.setItem(KEY, CARS[index].id); } catch (_) { /* private mode etc. */ }
}

/**
 * Builds the picker panel. Keyboard is handled by the level through the shared
 * Input; this only owns the DOM and the mouse.
 *
 *   const picker = createCarPicker({ startIndex, onChange, onConfirm });
 *   picker.setIndex(2);
 *   picker.destroy();
 */
export function createCarPicker({ startIndex = 0, onChange, onConfirm }) {
  const el = document.createElement('div');
  el.id = 'car-picker';
  el.style.cssText = `
    position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%);
    z-index: 20; color: #d7e2ea; text-align: center;
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: rgba(5,10,15,0.72); border: 1px solid rgba(120,200,255,0.3);
    border-radius: 8px; padding: 16px 20px; backdrop-filter: blur(4px);
    max-width: calc(100vw - 32px);`;

  el.innerHTML = `
    <div style="font-size:11px;letter-spacing:3px;color:#7fd8ff;margin-bottom:10px">CHOOSE YOUR CAR</div>
    <div class="cars" style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"></div>
    <div style="margin-top:12px">
      <button class="go" style="background:#7fd8ff;color:#05070a;border:0;border-radius:4px;
        padding:8px 22px;font-weight:700;letter-spacing:1px;cursor:pointer">DRIVE</button>
    </div>
    <div style="margin-top:10px;font-size:11px;color:#8fa3b0">
      A / D or ← → to browse · Enter to drive · V in game to change car</div>`;

  const row = el.querySelector('.cars');
  const buttons = CARS.map((car, i) => {
    const b = document.createElement('button');
    b.textContent = car.name;
    b.style.cssText = `background:transparent;color:#d7e2ea;border:1px solid rgba(120,200,255,0.3);
      border-radius:4px;padding:8px 14px;cursor:pointer;font-size:13px`;
    b.addEventListener('click', () => onChange && onChange(i));
    row.appendChild(b);
    return b;
  });
  el.querySelector('.go').addEventListener('click', () => onConfirm && onConfirm());

  function setIndex(index) {
    buttons.forEach((b, i) => {
      const on = i === index;
      b.style.background = on ? 'rgba(127,216,255,0.22)' : 'transparent';
      b.style.borderColor = on ? '#7fd8ff' : 'rgba(120,200,255,0.3)';
      b.style.color = on ? '#ffffff' : '#d7e2ea';
    });
  }
  setIndex(startIndex);
  document.body.appendChild(el);

  return { el, setIndex, destroy: () => el.remove() };
}
