import * as THREE from 'three';
import { AssetRegistry } from '../../core/AssetRegistry.js';
import { VehicleController } from './VehicleController.js';
import { HandlerAI } from './HandlerAI.js';
import { CarLights, PoliceLights } from './carLights.js';
import { Traffic } from './traffic.js';
import { Skids, Smoke } from './skids.js';
import { CARS, HANDLER_MODEL, createCarPicker, loadSavedCar, saveCar } from './carSelect.js';
import { createLevel2Hud } from './hud.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e14);
scene.fog = new THREE.Fog(0x0a0e14, 60, 220);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

scene.add(new THREE.HemisphereLight(0x8fb3ff, 0x1a1008, 0.9));
const sun = new THREE.DirectionalLight(0xffcf9e, 1.1);
sun.position.set(-40, 60, -20);
scene.add(sun);

const roadLength = 4000;
const roadMid = roadLength / 2 - 50;
const road = new THREE.Mesh(
  new THREE.PlaneGeometry(24, roadLength),
  new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.9 }),
);
road.rotation.x = -Math.PI / 2;
road.position.z = roadMid;
road.receiveShadow = true;
scene.add(road);

const stripeGeo = new THREE.PlaneGeometry(0.3, 3);
const stripeMat = new THREE.MeshBasicMaterial({ color: 0x6fa8ff });
for (let z = -30; z < roadLength - 50; z += 10) {
  const stripe = new THREE.Mesh(stripeGeo, stripeMat);
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.set(0, 0.01, z);
  scene.add(stripe);
}

const railMat = new THREE.MeshStandardMaterial({ color: 0x2a3138 });
for (const side of [-12, 12]) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, roadLength), railMat);
  rail.position.set(side, 0.4, roadMid);
  scene.add(rail);
}

const input = { forward: false, backward: false, left: false, right: false, boost: false };
const pressed = new Set();
const gameKeys = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyV', 'Enter',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight',
]);

window.addEventListener('keydown', (event) => {
  if (gameKeys.has(event.code)) event.preventDefault();
  setKey(event.code, true);
  if (!event.repeat) pressed.add(event.code);
});
window.addEventListener('keyup', (event) => {
  if (gameKeys.has(event.code)) event.preventDefault();
  setKey(event.code, false);
});
window.addEventListener('blur', () => {
  Object.keys(input).forEach((key) => { input[key] = false; });
  pressed.clear();
});

function setKey(code, value) {
  if (code === 'KeyW' || code === 'ArrowUp') input.forward = value;
  if (code === 'KeyS' || code === 'ArrowDown') input.backward = value;
  if (code === 'KeyA' || code === 'ArrowLeft') input.left = value;
  if (code === 'KeyD' || code === 'ArrowRight') input.right = value;
  if (code === 'ShiftLeft' || code === 'ShiftRight') input.boost = value;
}

function wasPressed(...codes) {
  return codes.some((code) => pressed.has(code));
}

function clearDrivingInput() {
  Object.keys(input).forEach((key) => { input[key] = false; });
}

const assets = new AssetRegistry();
const car = new VehicleController(scene);
const handler = new HandlerAI(scene, car);
handler.onAttackResolved = () => car.takeDamage(12);

const carLights = new CarLights(car.mesh);
const policeLights = new PoliceLights(handler.mesh);
const skids = new Skids(scene);
const smoke = new Smoke(scene);
const traffic = new Traffic(scene, assets);

let shake = 0;
let picker = null;
let hud = null;
let carIndex = 0;
let selectingCar = false;
let confirmingCar = false;
let orbit = 0;
let modelSwap = Promise.resolve();

function selectCar(index) {
  carIndex = (index + CARS.length) % CARS.length;
  picker?.setIndex(carIndex);
  const selected = CARS[carIndex];
  modelSwap = modelSwap.then(async () => {
    const model = await car.attachModel(assets, selected.path);
    if (!model) return;

    const bounds = model.userData.bounds;
    carLights.fit(bounds);
    skids.setDims(bounds);
    car.bounds = {
      halfW: (bounds.max.x - bounds.min.x) * 0.45,
      halfL: (bounds.max.z - bounds.min.z) * 0.46,
    };
  });
  return modelSwap;
}

function openCarPicker() {
  if (picker) return;
  selectingCar = true;
  orbit = 0;
  car.speed = 0;
  clearDrivingInput();
  hud?.setVisible(false);
  picker = createCarPicker({
    startIndex: carIndex,
    onChange: selectCar,
    onConfirm: confirmCar,
  });
}

async function confirmCar() {
  if (!selectingCar || confirmingCar) return;
  confirmingCar = true;
  await modelSwap;
  saveCar(carIndex);
  picker?.destroy();
  picker = null;
  selectingCar = false;
  confirmingCar = false;
  clearDrivingInput();
  hud?.setVisible(true);
}

function updateCarPicker(dt) {
  if (wasPressed('KeyA', 'ArrowLeft')) selectCar(carIndex - 1);
  if (wasPressed('KeyD', 'ArrowRight')) selectCar(carIndex + 1);
  if (wasPressed('Enter')) confirmCar();

  orbit += dt * 0.7;
  const radius = 6.5;
  const position = car.mesh.position;
  camera.position.set(
    position.x + Math.sin(orbit) * radius,
    2.4,
    position.z + Math.cos(orbit) * radius,
  );
  camera.lookAt(position.x, 0.8, position.z);
}

function updateCamera(dt) {
  const offset = new THREE.Vector3(
    Math.sin(car.heading) * -8,
    4.2,
    Math.cos(car.heading) * -8,
  );
  const desired = car.mesh.position.clone().add(offset);
  camera.position.lerp(desired, 0.12);
  const lookAt = car.mesh.position.clone();
  lookAt.y += 1;
  if (shake > 0.01) {
    lookAt.x += (Math.random() - 0.5) * shake;
    lookAt.y += (Math.random() - 0.5) * shake;
    shake *= Math.exp(-6 * dt);
  }
  camera.lookAt(lookAt);
}

function updateGame(dt) {
  const previousHeading = car.heading;
  car.update(dt, input);
  const { dist, state } = handler.update(dt);

  const headingRate = dt > 0 ? (car.heading - previousHeading) / dt : 0;
  const skidding = car.drifting ?? (
    (Math.abs(car.speed) > 16 && Math.abs(car.speed * headingRate) > 26)
    || (input.backward && car.speed > 14)
  );
  skids.update(dt, car, skidding);
  smoke.update(dt, skids.wheels(car), skidding);

  carLights.update(dt, { braking: input.backward && car.speed > 1 });
  policeLights.update(dt, state);
  for (const hit of traffic.update(dt, car)) {
    car.takeDamage(hit.damage);
    shake = Math.max(shake, 0.35 + hit.impact * 0.9);
  }

  updateCamera(dt);
  hud.update({
    speed: car.speed,
    dist,
    heat: car.heat,
    health: car.health,
    handlerState: state,
  });
}

const timer = new THREE.Timer();
timer.connect(document);
function animate() {
  requestAnimationFrame(animate);
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);

  if (wasPressed('KeyR')) {
    window.location.reload();
    return;
  }

  if (selectingCar) {
    updateCarPicker(dt);
  } else if (wasPressed('KeyV')) {
    openCarPicker();
  } else {
    updateGame(dt);
  }

  pressed.clear();
  renderer.render(scene, camera);
}

async function start() {
  await Promise.allSettled([HANDLER_MODEL, ...CARS.map((carConfig) => carConfig.path)].map((path) => assets.model(path)));
  carIndex = loadSavedCar();
  await Promise.all([
    selectCar(carIndex),
    handler.attachModel(assets, HANDLER_MODEL).then((model) => {
      if (model) policeLights.fit(model.userData.bounds);
    }),
  ]);
  await traffic.init(car.mesh.position.z);
  hud = createLevel2Hud();
  openCarPicker();
  animate();
}

start();
