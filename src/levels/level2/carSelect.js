export const CARS = [
  { id: 'sedan-sports', name: 'Sports Sedan', path: 'level2/cars/sedan-sports.glb' },
  { id: 'hatchback-sports', name: 'Sports Hatch', path: 'level2/cars/hatchback-sports.glb' },
  { id: 'race', name: 'GT Racer', path: 'level2/cars/race.glb' },
  { id: 'race-future', name: 'Future Racer', path: 'level2/cars/race-future.glb' },
];

export const HANDLER_MODEL = 'level2/handler-car.glb';

const KEY = 'blackout.level2.car';

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

export function createCarPicker({ startIndex = 0, onChange, onConfirm }) {
  const root = document.createElement('div');
  root.id = 'car-picker';
  root.style.cssText = `
    position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:20;
    max-width:calc(100vw - 32px);padding:16px 20px;border:1px solid rgba(120,200,255,.3);
    border-radius:8px;background:rgba(5,10,15,.72);color:#d7e2ea;text-align:center;
    font-family:'Segoe UI',system-ui,sans-serif;backdrop-filter:blur(4px);`;
  root.innerHTML = `
    <div style="margin-bottom:10px;color:#7fd8ff;font-size:11px;letter-spacing:3px">CHOOSE YOUR CAR</div>
    <div class="cars" style="display:flex;flex-wrap:wrap;justify-content:center;gap:8px"></div>
    <div style="margin-top:12px"><button class="go" style="cursor:pointer;border:0;border-radius:4px;background:#7fd8ff;color:#05070a;padding:8px 22px;font-weight:700;letter-spacing:1px">DRIVE</button></div>
    <div style="margin-top:10px;color:#8fa3b0;font-size:11px">A / D or ← / → to browse · Enter to drive · V to change car</div>`;

  const buttons = CARS.map((car, index) => {
    const button = document.createElement('button');
    button.textContent = car.name;
    button.style.cssText = 'cursor:pointer;border:1px solid rgba(120,200,255,.3);border-radius:4px;background:transparent;color:#d7e2ea;padding:8px 14px;font-size:13px';
    button.addEventListener('click', () => onChange?.(index));
    root.querySelector('.cars').appendChild(button);
    return button;
  });
  root.querySelector('.go').addEventListener('click', () => onConfirm?.());

  function setIndex(index) {
    buttons.forEach((button, buttonIndex) => {
      const selected = buttonIndex === index;
      button.style.background = selected ? 'rgba(127,216,255,.22)' : 'transparent';
      button.style.borderColor = selected ? '#7fd8ff' : 'rgba(120,200,255,.3)';
      button.style.color = selected ? '#fff' : '#d7e2ea';
    });
  }

  setIndex(startIndex);
  document.body.appendChild(root);
  return { setIndex, destroy: () => root.remove() };
}
