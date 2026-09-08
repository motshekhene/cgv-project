import * as THREE from 'three';
import { VehicleController } from './VehicleController.js';
import { HandlerAI } from './HandlerAI.js';

// ---------- Scene / Camera / Renderer ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e14);
scene.fog = new THREE.Fog(0x0a0e14, 60, 220);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

// ---------- Placeholder road (2B/1A own the real chunk system) ----------
const roadLength = 4000;
const road = new THREE.Mesh(
  new THREE.PlaneGeometry(24, roadLength),
  new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.9 })
);
road.rotation.x = -Math.PI / 2;
road.position.z = -roadLength / 2 + 50;
scene.add(road);

const stripeGeo = new THREE.PlaneGeometry(0.3, 3);
const stripeMat = new THREE.MeshBasicMaterial({ color: 0x6fa8ff });
for (let z = 30; z > -roadLength + 50; z -= 10) {
  const s = new THREE.Mesh(stripeGeo, stripeMat);
  s.rotation.x = -Math.PI / 2;
  s.position.set(0, 0.01, z);
  scene.add(s);
}

const railMat = new THREE.MeshStandardMaterial({ color: 0x2a3138 });
for (const side of [-12, 12]) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, roadLength), railMat);
  rail.position.set(side, 0.4, -roadLength / 2 + 50);
  scene.add(rail);
}

// ---------- Input (stand-in for shared Input system) ----------
const input = { forward: false, backward: false, left: false, right: false, boost: false };
window.addEventListener('keydown', e => setKey(e.code, true));
window.addEventListener('keyup', e => setKey(e.code, false));
function setKey(code, val) {
  if (code === 'KeyW' || code === 'ArrowUp') input.forward = val;
  if (code === 'KeyS' || code === 'ArrowDown') input.backward = val;
  if (code === 'KeyA' || code === 'ArrowLeft') input.left = val;
  if (code === 'KeyD' || code === 'ArrowRight') input.right = val;
  if (code === 'ShiftLeft' || code === 'ShiftRight') input.boost = val;
}

// ---------- Instantiate ----------
const car = new VehicleController(scene);
const handler = new HandlerAI(scene, car);
handler.onAttackResolved = () => car.takeDamage(12); // placeholder ram damage

// ---------- Chase camera ----------
function updateCamera() {
  const camOffset = new THREE.Vector3(Math.sin(car.heading) * -8, 4.2, Math.cos(car.heading) * -8);
  const desiredPos = car.mesh.position.clone().add(camOffset);
  camera.position.lerp(desiredPos, 0.12);
  const lookAt = car.mesh.position.clone();
  lookAt.y += 1;
  camera.lookAt(lookAt);
}

// ---------- HUD ----------
const speedEl = document.getElementById('speedVal');
const distEl = document.getElementById('distVal');
const heatEl = document.getElementById('heatVal');
const healthEl = document.getElementById('healthVal');
const stateEl = document.getElementById('state');

// ---------- Main loop ----------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  car.update(dt, input);
  const { dist, state } = handler.update(dt);
  updateCamera();

  speedEl.textContent = Math.round(Math.abs(car.speed) * 3.6);
  distEl.textContent = dist.toFixed(1);
  heatEl.textContent = Math.round(car.heat);
  healthEl.textContent = Math.round(car.health);
  stateEl.textContent = 'HANDLER: ' + state;
  stateEl.style.color = state === 'TELEGRAPH' ? '#ff5555' : '#ffb37a';

  renderer.render(scene, camera);
}
animate();
