import * as THREE from 'three';

// ---------- Scene / Camera / Renderer ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070a);
scene.fog = new THREE.Fog(0x05070a, 10, 60);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Lighting ----------
const ambient = new THREE.AmbientLight(0x223344, 1.2);
scene.add(ambient);

const dirLight = new THREE.DirectionalLight(0x88ccff, 0.8);
dirLight.position.set(5, 10, -5);
dirLight.castShadow = true;
scene.add(dirLight);

// A couple of "emergency light" point lights for a tunnel feel
function addTunnelLight(z) {
  const light = new THREE.PointLight(0x00e5ff, 1.5, 12);
  light.position.set(0, 3, z);
  scene.add(light);
}
for (let z = -10; z > -200; z -= 15) addTunnelLight(z);

// ---------- Track ----------
const LANE_WIDTH = 3;
const lanes = [-LANE_WIDTH, 0, LANE_WIDTH];

const trackGeo = new THREE.PlaneGeometry(LANE_WIDTH * 3, 400);
const trackMat = new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 0.6, metalness: 0.2 });
const track = new THREE.Mesh(trackGeo, trackMat);
track.rotation.x = -Math.PI / 2;
track.position.z = -150;
track.receiveShadow = true;
scene.add(track);

// Simple lane-divider lines for visual reference
for (let i = 0; i < 2; i++) {
  const lineGeo = new THREE.PlaneGeometry(0.1, 400);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x2a3b4d });
  const line = new THREE.Mesh(lineGeo, lineMat);
  line.rotation.x = -Math.PI / 2;
  line.position.set(-LANE_WIDTH / 2 + i * LANE_WIDTH, 0.01, -150);
  scene.add(line);
}

// A few simple obstacle placeholders down the tunnel (visual only for now)
const obstacleGeo = new THREE.BoxGeometry(1, 1.6, 0.6);
const obstacleMat = new THREE.MeshStandardMaterial({ color: 0xff5533, emissive: 0x220000 });
for (let i = 1; i <= 8; i++) {
  const obs = new THREE.Mesh(obstacleGeo, obstacleMat);
  const lane = lanes[Math.floor(Math.random() * 3)];
  obs.position.set(lane, 0.8, -i * 20 - 10);
  obs.castShadow = true;
  scene.add(obs);
}

// ---------- Player (parent: rig, children: mesh + would-be camera anchor) ----------
const playerRig = new THREE.Group();
scene.add(playerRig);

const playerGeo = new THREE.BoxGeometry(0.8, 1.6, 0.8);
const playerMat = new THREE.MeshStandardMaterial({ color: 0x66ccff, emissive: 0x113355 });
const playerMesh = new THREE.Mesh(playerGeo, playerMat);
playerMesh.position.y = 0.8;
playerMesh.castShadow = true;
playerRig.add(playerMesh);

let currentLane = 1; // index into lanes[]
let targetX = lanes[currentLane];
let velocityY = 0;
let onGround = true;
const GRAVITY = -30;
const JUMP_SPEED = 9;

// ---------- Pursuer ("the Handler") ----------
const handlerGeo = new THREE.CapsuleGeometry(0.4, 1.2, 4, 8);
const handlerMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x330000 });
const handler = new THREE.Mesh(handlerGeo, handlerMat);
handler.position.set(0, 1, 12); // starts behind the player
handler.castShadow = true;
scene.add(handler);

// ---------- Camera rig: follows behind player, child-like offset ----------
const cameraOffset = new THREE.Vector3(0, 3.2, 7);

// ---------- Input ----------
const keys = {};
window.addEventListener('keydown', (e) => (keys[e.code] = true));
window.addEventListener('keyup', (e) => (keys[e.code] = false));

let lastLaneSwitch = 0;
function handleInput(time) {
  if ((keys['KeyA'] || keys['ArrowLeft']) && time - lastLaneSwitch > 200) {
    currentLane = Math.max(0, currentLane - 1);
    targetX = lanes[currentLane];
    lastLaneSwitch = time;
  }
  if ((keys['KeyD'] || keys['ArrowRight']) && time - lastLaneSwitch > 200) {
    currentLane = Math.min(2, currentLane + 1);
    targetX = lanes[currentLane];
    lastLaneSwitch = time;
  }
  if (keys['Space'] && onGround) {
    velocityY = JUMP_SPEED;
    onGround = false;
  }
}

// ---------- Game state ----------
let distance = 0;
const RUN_SPEED = 14; // units/sec forward
const distanceEl = document.getElementById('distance');

const clock = new THREE.Clock();
let started = false;

document.getElementById('startBtn').addEventListener('click', () => {
  document.getElementById('home').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  started = true;
  clock.getDelta(); // discard idle time spent sitting on the home screen
});

function animate() {
  requestAnimationFrame(animate);
  if (!started) return;

  const dt = Math.min(clock.getDelta(), 0.05);
  const time = performance.now();

  handleInput(time);

  // Move player forward (world scrolls toward camera; here we move the player -Z)
  playerRig.position.z -= RUN_SPEED * dt;
  distance += RUN_SPEED * dt;
  distanceEl.textContent = Math.floor(distance);

  // Smooth lane-switch
  playerRig.position.x += (targetX - playerRig.position.x) * Math.min(1, dt * 10);

  // Jump physics
  if (!onGround) {
    velocityY += GRAVITY * dt;
    playerMesh.position.y += velocityY * dt;
    if (playerMesh.position.y <= 0.8) {
      playerMesh.position.y = 0.8;
      velocityY = 0;
      onGround = true;
    }
  }

  // Handler always stays ~12 units behind the player, on its own lane logic
  const targetHandlerZ = playerRig.position.z + 12;
  handler.position.z += (targetHandlerZ - handler.position.z) * Math.min(1, dt * 3);
  handler.position.x += (playerRig.position.x - handler.position.x) * Math.min(1, dt * 2);

  // Chase camera follows player rig (acts like a child offset)
  const desiredCamPos = new THREE.Vector3(
    playerRig.position.x,
    0,
    playerRig.position.z
  ).add(cameraOffset);
  camera.position.lerp(desiredCamPos, Math.min(1, dt * 6));
  camera.lookAt(playerRig.position.x, 1.2, playerRig.position.z - 8);

  renderer.render(scene, camera);
}

camera.position.set(0, 3.2, 19);
camera.lookAt(0, 1.2, 4);
renderer.render(scene, camera); // idle frame behind the home screen

animate();