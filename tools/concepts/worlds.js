/**
 * Level 1 (RUN) and Level 2 (DRIVE) for each of the four worlds, so every
 * theme is a complete, connected game: run → drive → fight in one place.
 * Runs: Kai sprints toward camera (+z), the Handler behind him.
 * Drives: both cars head toward camera, Kai ahead, the Handler closing.
 */
import * as THREE from 'three';
import { model, place, pbr, rng, sky, particles, lightShaft, sign, PACK } from './scene.js';
import { craggy, prayerFlags, cactus, oceanSurface, mist } from './themes.js';
import { car } from './story.js';

const RU = 0.016;

/* ------------------------------------------------------------ helpers */

function lights(world, { sunDir, sun, sunI, hemiSky, hemiGround, hemiI, size = 40 }) {
  world.add(new THREE.HemisphereLight(hemiSky, hemiGround, hemiI));
  const l = new THREE.DirectionalLight(sun, sunI);
  l.position.copy(sunDir.clone().normalize().multiplyScalar(80));
  l.castShadow = true;
  l.shadow.mapSize.set(4096, 4096);
  const c = l.shadow.camera;
  c.left = c.bottom = -size; c.right = c.top = size; c.near = 1; c.far = 220;
  l.shadow.bias = -0.0003; l.shadow.normalBias = 0.03;
  l.target.position.set(0, 0, -10);
  world.add(l, l.target);
}

function plane(world, w, d, mat, { x = 0, y = 0, z = 0 } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true;
  world.add(m);
  return m;
}

function strip(prefix, w, d, { tint = 0xffffff, rough = 1, tile = 4, normalScale = 0.6 } = {}) {
  const m = pbr(prefix, { tint, rough, normalScale });
  for (const t of [m.map, m.normalMap, m.roughnessMap]) t.repeat.set(w / tile, d / tile);
  return m;
}

/** Scatter clones of `srcs` in a band either side of the path. */
function scatter(world, srcs, n, r, { x0, x1, z0, z1, s0, s1, y = 0, both = true, shadow = false }) {
  for (let i = 0; i < n; i++) {
    const side = both ? (r() < 0.5 ? -1 : 1) : 1;
    const x = side * (x0 + r() * (x1 - x0)), z = z0 + r() * (z1 - z0);
    place(world, srcs[Math.floor(r() * srcs.length)], x, y, z, { s: s0 + r() * (s1 - s0), ry: r() * 6.28, shadow });
  }
}

function postSign(world, lines, opts, x, z, ry = 0, h = 1.7) {
  const s = sign(lines, { glow: 1, basic: false, ...opts });
  s.position.set(x, h, z + 0.04); s.rotation.y = ry; world.add(s);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, h, 6), new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.9 }));
  post.position.set(x, h / 2, z); post.castShadow = true; world.add(post);
}

const RUN_CAST = (hz = -9) => [
  { who: 'kai', pos: [0, 0, 0.6], ry: 0, pose: 'run', t: 0.24, key: true },
  { who: 'handler', pos: [0.4, 0, hz], ry: 0, pose: 'run', t: 0.62 },
];
const RUN_CAM = { pos: [1.4, 0.85, 6.6], look: [-0.4, 1.7, -8], fov: 44 };

function chase(world, kaiX, himX, { kaiZ = 5, himZ = -3 } = {}) {
  [kaiX, himX] = [-1.9, 2.0];
  const kai = car({ color: 0x35c9ff }); kai.rotation.y = Math.PI; kai.position.set(kaiX, 0, kaiZ); world.add(kai);
  const him = car({ color: 0x5a1410, suv: true }); him.rotation.y = Math.PI - 0.05; him.position.set(himX, 0, himZ); world.add(him);
  for (const c of [kai, him]) c.traverse((o) => { if (o.isSpotLight) o.intensity = 60; });
}
const DRIVE_CAM = { pos: [3.9, 1.15, 15.5], look: [-0.6, 1.2, -8], fov: 42 };

/* ============================================================ SHRINE */

async function shrineRun({ scene, world }) {
  const sunDir = new THREE.Vector3(-0.35, 0.55, -0.75);
  scene.fog = new THREE.FogExp2(0xcfd6a8, 0.014);
  world.add(sky({ top: 0x6aa6d8, horizon: 0xf0e2b0, bottom: 0x6f7d4a, sunDir, sunColor: 0xffd59a, sunSize: 1400, clouds: 0.3 }));
  lights(world, { sunDir, sun: 0xffd29a, sunI: 4.5, hemiSky: 0xbfdcff, hemiGround: 0x4a5a26, hemiI: 0.6 });
  const r = rng(41);
  const moss = { Main: 0x7a7c66, Highlights: 0x908f78, Green: 0x5f9a2e };
  const [t1, t2, t3, t4, tr, bush, bushL, g1, g2, col, colS, arch, wall, stag] = await Promise.all([
    model(PACK.nature + 'Tree1.fbx'), model(PACK.nature + 'Tree2.fbx'), model(PACK.nature + 'Tree3.fbx'), model(PACK.nature + 'Tree4.fbx'),
    model(PACK.ruins + 'Tree_1.fbx'), model(PACK.nature + 'Bush1.fbx'), model(PACK.ruins + 'Bush_Large.fbx'),
    model(PACK.nature + 'Grass1.fbx'), model(PACK.nature + 'Grass2.fbx'),
    model(PACK.ruins + 'Column_Round.fbx', moss), model(PACK.ruins + 'Column_Round_Short.fbx', moss),
    model(PACK.ruins + 'Arch_Round.fbx', moss), model(PACK.ruins + 'Wall_Overgrown.fbx', moss), model(PACK.ruins + 'Statue_Stag.fbx', { Stone: 0xa9a892 }),
  ]);
  plane(world, 400, 400, strip('Ground040_1K-JPG', 400, 400, { tint: 0x9fb07a, tile: 5 }), { y: -0.02, z: -100 });
  plane(world, 3.6, 260, strip('Ground051_1K-JPG', 3.6, 260, { tint: 0xc8a27a, tile: 3 }), { z: -100 });
  scatter(world, [t1, t2, t3, t4, tr], 120, r, { x0: 5, x1: 45, z0: -150, z1: 20, s0: 0.024, s1: 0.036 });
  scatter(world, [bush, bushL], 60, r, { x0: 2.4, x1: 7, z0: -90, z1: 14, s0: 0.012, s1: 0.02 });
  scatter(world, [g1, g2], 260, r, { x0: 1.9, x1: 14, z0: -70, z1: 14, s0: 0.01, s1: 0.02 });
  for (let z = -6; z > -80; z -= 11) for (const side of [-1, 1]) {
    const tall = r() < 0.55;
    place(world, tall ? col : colS, side * (3.2 + r() * 0.6), 0, z + r() * 3, { s: RU * (tall ? 1.05 : 1.3), rz: (r() - 0.5) * 0.15, shadow: true });
  }
  place(world, arch, 0, 0, -24, { s: RU * 1.35, shadow: true });
  place(world, wall, -6.5, 0, -14, { s: RU * 1.4, ry: 0.4, shadow: true });
  place(world, wall, 7, 0, -32, { s: RU * 1.4, ry: -0.3, shadow: true });
  place(world, stag, 6.5, 0, -9, { s: RU * 0.7, ry: -0.6, shadow: true });
  postSign(world, ['SITE 7 →'], { w: 1.1, h: 0.42, bg: '#6b4a2e', fg: '#f1e2c2' }, -2.6, -3, 0.4, 1.4);
  const sd = sunDir.clone().normalize();
  for (const [x, z, w] of [[-1, -4, 1.6], [2, -16, 2], [-3, -28, 1.8]]) {
    const to = new THREE.Vector3(x, 0, z);
    world.add(lightShaft(to.clone().addScaledVector(sd, 30), to, w, 0xffd9a0, 0.13));
  }
  world.add(particles(500, { center: [0, 3, -10], spread: [16, 6, 34], size: 0.06, color: 0xffe2a0, opacity: 0.9, seed: 9 }));
  return { cast: RUN_CAST(), camera: RUN_CAM, envIntensity: 0.35 };
}

async function shrineDrive({ scene, world }) {
  const sunDir = new THREE.Vector3(-0.6, 0.35, -0.7);
  scene.fog = new THREE.FogExp2(0xd8cfa0, 0.009);
  world.add(sky({ top: 0x5f9fd8, horizon: 0xf4dca8, bottom: 0x6f7d4a, sunDir, sunColor: 0xffc890, sunSize: 1200, clouds: 0.35 }));
  lights(world, { sunDir, sun: 0xffcf94, sunI: 4.2, hemiSky: 0xbfdcff, hemiGround: 0x4a5a26, hemiI: 0.6, size: 50 });
  const r = rng(43);
  const [t1, t2, t3, t4, bush, rock1, rock2, g1] = await Promise.all([
    model(PACK.nature + 'Tree1.fbx'), model(PACK.nature + 'Tree2.fbx'), model(PACK.nature + 'Tree3.fbx'), model(PACK.nature + 'Tree4.fbx'),
    model(PACK.nature + 'Bush2.fbx'), model(PACK.nature + 'Rock1.fbx', { Rock: 0x7d8274 }), model(PACK.nature + 'Rock2.fbx', { Rock: 0x737a6a }),
    model(PACK.nature + 'Grass1.fbx'),
  ]);
  plane(world, 500, 500, strip('Ground040_1K-JPG', 500, 500, { tint: 0x9fb07a, tile: 5 }), { y: -0.02, z: -150 });
  // muddy jungle road along a river
  plane(world, 8, 400, strip('Ground051_1K-JPG', 8, 400, { tint: 0x8a6a4a, rough: 0.7, tile: 4 }), { z: -150 });
  const river = plane(world, 22, 400, new THREE.MeshStandardMaterial({ color: 0x2f6f6a, roughness: 0.08, metalness: 0.3 }), { x: -17, y: -0.3, z: -150 });
  river.receiveShadow = false;
  plane(world, 4, 400, strip('Ground051_1K-JPG', 4, 400, { tint: 0x9a8160, tile: 3 }), { x: -5.8, y: -0.01, z: -150 });
  scatter(world, [t1, t2, t3, t4], 90, r, { x0: 7, x1: 40, z0: -200, z1: 25, s0: 0.026, s1: 0.038, both: false });
  for (let i = 0; i < 40; i++) place(world, [t1, t2, t3, t4][i % 4], -30 - r() * 30, 0, -200 + r() * 220, { s: 0.026 + r() * 0.01, ry: r() * 6 });
  scatter(world, [bush, rock1, rock2], 40, r, { x0: 5, x1: 9, z0: -120, z1: 2, s0: 0.008, s1: 0.016, both: false });
  scatter(world, [g1], 160, r, { x0: 5.5, x1: 16, z0: -80, z1: 8, s0: 0.012, s1: 0.02, both: false });
  for (let i = 0; i < 6; i++) place(world, [rock1, rock2][i % 2], -8 - r() * 4, -0.4, -10 - i * 18, { s: 0.012 + r() * 0.01, ry: r() * 6 });
  chase(world, 1.8, -1.6);
  postSign(world, ['SITE 7', { t: '12 km', size: 0.7 }], { w: 1.2, h: 0.75, bg: '#6b4a2e', fg: '#f1e2c2' }, 5.2, -4, -0.3, 1.8);
  world.add(particles(220, { center: [0, 0.4, 0], spread: [8, 0.8, 20], size: 0.12, color: 0x6a4a30, opacity: 0.8, seed: 3, additive: false }));
  world.add(particles(300, { center: [0, 4, -20], spread: [30, 8, 50], size: 0.06, color: 0xffe2a0, opacity: 0.8, seed: 5 }));
  return { cast: [], camera: DRIVE_CAM, envIntensity: 0.35 };
}

/* ========================================================= MONASTERY */

async function monasteryRun({ scene, world }) {
  const sunDir = new THREE.Vector3(0.5, 0.35, -0.8);
  scene.fog = new THREE.FogExp2(0xd9e3ee, 0.005);
  world.add(sky({ top: 0x3f74b8, horizon: 0xf0d8c8, bottom: 0xb9c6d4, sunDir, sunColor: 0xffe2c4, sunSize: 1800, clouds: 0.5 }));
  lights(world, { sunDir, sun: 0xffe6cc, sunI: 3.6, hemiSky: 0xd8e8ff, hemiGround: 0x7a808c, hemiI: 0.9 });
  const r = rng(51);
  const stone = { Main: 0x9c988e, Highlights: 0xb3afa4, Green: 0x7f8f6a };
  const [pines, pine, m1, m2, mL, stairs, colSq, tower, temple, rockA] = await Promise.all([
    model(PACK.rts + 'Resource_PineTree_Group.gltf'), model(PACK.rts + 'Resource_PineTree.gltf'),
    model(PACK.rts + 'Mountain_Group_1.gltf'), model(PACK.rts + 'Mountain_Group_2.gltf'), model(PACK.rts + 'MountainLarge_Single.gltf'),
    model(PACK.ruins + 'Stairs.fbx', stone), model(PACK.ruins + 'Column_Square.fbx', stone),
    model(PACK.rts + 'WatchTower_SecondAge_Level3.gltf'), model(PACK.rts + 'Temple_SecondAge_Level3.gltf'),
    model(PACK.nature + 'Rock1.fbx', { Rock: 0x8a8d94 }),
  ]);
  const snow = new THREE.MeshStandardMaterial({ color: 0xf2f5fa, roughness: 0.85 });
  plane(world, 600, 600, snow, { z: -200 });
  plane(world, 3.4, 300, strip('Concrete042C_1K-JPG', 3.4, 300, { tint: 0xd0ccc4, tile: 3 }), { y: 0.01, z: -130 });
  scatter(world, [pines, pine], 90, r, { x0: 6, x1: 60, z0: -200, z1: 20, s0: 9, s1: 15 });
  scatter(world, [rockA], 30, r, { x0: 2.6, x1: 12, z0: -80, z1: 14, s0: 0.006, s1: 0.016 });
  // stone stairs climbing toward the monastery
  for (let i = 0; i < 6; i++) place(world, stairs, 0, i * 1.47, -40 - i * 3.4, { s: RU * 1.1, ry: Math.PI, shadow: true });
  for (const z of [-8, -20, -32]) for (const side of [-1, 1]) place(world, colSq, side * 2.6, 0, z, { s: RU * 1.1, shadow: true });
  world.add(prayerFlags(new THREE.Vector3(-2.6, 3.4, -8), new THREE.Vector3(2.6, 3.4, -8), 12, r));
  world.add(prayerFlags(new THREE.Vector3(-2.6, 3.4, -20), new THREE.Vector3(2.6, 3.4, -20), 12, r));
  // monastery on the ridge above, mountains beyond
  const ridge = new THREE.Mesh(craggy(30, 30, 12, 9), pbr('_source/downloads/rock064/Rock064_1K-JPG', { repeat: 6, tint: 0xa9adb8 }));
  ridge.position.set(0, -4, -80); world.add(ridge);
  place(world, temple, 0, 11, -82, { s: 13, ry: Math.PI });
  place(world, tower, -14, 11, -76, { s: 14 }); place(world, tower, 15, 11, -78, { s: 12 });
  for (let k = 0; k < 14; k++) {
    const a = Math.PI * 1.15 + (k / 14) * Math.PI * 0.7, d = 200 + r() * 160;
    place(world, [m1, m2, mL][k % 3], Math.cos(a) * d, -10, Math.sin(a) * d, { s: 60 + r() * 50, ry: r() * 6 });
  }
  postSign(world, ['MONASTERY ↑', { t: 'PASS CLOSED', size: 0.7, color: '#a3231c' }], { w: 1.2, h: 0.7, bg: '#f2c12e', fg: '#16130c' }, -2.4, -2, 0.4, 1.6);
  world.add(particles(1600, { center: [0, 5, -10], spread: [30, 12, 40], size: 0.06, color: 0xffffff, opacity: 0.9, seed: 3, additive: false }));
  return { cast: RUN_CAST(), camera: { ...RUN_CAM, look: [-0.4, 2.4, -8] }, envIntensity: 0.45 };
}

async function monasteryDrive({ scene, world }) {
  const sunDir = new THREE.Vector3(0.6, 0.45, -0.6);
  scene.fog = new THREE.FogExp2(0xd5e0ea, 0.002);
  world.add(sky({ top: 0x3f74b8, horizon: 0xe3ebf2, bottom: 0xb9c6d4, sunDir, sunColor: 0xfff1dc, sunSize: 2000, clouds: 0.5 }));
  lights(world, { sunDir, sun: 0xfff0dc, sunI: 3.6, hemiSky: 0xd8e8ff, hemiGround: 0x5d6170, hemiI: 0.8, size: 50 });
  const r = rng(53);
  const [pines, m1, m2, mL] = await Promise.all([
    model(PACK.rts + 'Resource_PineTree_Group.gltf'),
    model(PACK.rts + 'Mountain_Group_1.gltf'), model(PACK.rts + 'Mountain_Group_2.gltf'), model(PACK.rts + 'MountainLarge_Single.gltf'),
  ]);
  // a ledge road: rock wall on the right, sheer drop on the left
  plane(world, 9, 400, strip('Concrete042C_1K-JPG', 9, 400, { tint: 0x5a5a60, tile: 6 }), { z: -150 });
  const dash = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.25, 0.6) });
  for (let z = 20; z > -300; z -= 6) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 2.5), dash); d.rotation.x = -Math.PI / 2; d.position.set(0, 0.02, z); world.add(d); }
  const rock = pbr('_source/downloads/rock064/Rock064_1K-JPG', { repeat: 1, tint: 0xa9adb8 });
  for (const t of [rock.map, rock.normalMap, rock.roughnessMap]) t.repeat.set(40, 3);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(14, 30, 400, 2, 6, 80), rock);
  const pa = wall.geometry.attributes.position;
  for (let i = 0; i < pa.count; i++) if (pa.getX(i) < 0) pa.setX(i, pa.getX(i) + Math.sin(pa.getZ(i) * 0.15) * 1.2 + Math.sin(pa.getY(i) * 0.5) * 0.6);
  wall.geometry.computeVertexNormals();
  wall.position.set(11.5, 13, -150); wall.castShadow = wall.receiveShadow = true; world.add(wall);
  const cliff = new THREE.Mesh(new THREE.BoxGeometry(6, 60, 400), rock);
  cliff.position.set(-7.5, -30.05, -150); world.add(cliff);
  const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.7, roughness: 0.35 });
  for (let z = 20; z > -200; z -= 3) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), steel); p.position.set(-4.6, 0.4, z); world.add(p); }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 220), steel); rail.position.set(-4.6, 0.7, -90); world.add(rail);
  // valley far below: mist, pines, ranges
  const floor = plane(world, 3000, 3000, new THREE.MeshStandardMaterial({ color: 0x5f7356, roughness: 1 }), { y: -110 });
  floor.receiveShadow = false;
  for (let k = 0; k < 40; k++) place(world, pines, -60 - r() * 300, -110, -300 + r() * 360, { s: 30 + r() * 20, ry: r() * 6 });
  for (let k = 0; k < 14; k++) {
    const a = Math.PI * 0.6 + (k / 14) * Math.PI * 0.9, d = 260 + r() * 200;
    place(world, [m1, m2, mL][k % 3], Math.cos(a) * d, -110, Math.sin(a) * d, { s: 70 + r() * 50, ry: r() * 6 });
  }
  for (const [y, s, o] of [[-30, 600, 0.7], [-60, 900, 0.9]]) { const m = mist(o); m.scale.setScalar(s); m.position.set(-200, y, -100); world.add(m); }
  chase(world, 2.2, -1.8);
  postSign(world, ['THE PASS', { t: '4 km · NO SERVICE', size: 0.6 }], { w: 1.6, h: 0.8, bg: '#0e5a2e', fg: '#ffffff', border: '#ffffff' }, 6, -8, -0.2, 2.2);
  world.add(particles(900, { center: [0, 5, -10], spread: [30, 12, 50], size: 0.05, color: 0xffffff, opacity: 0.85, seed: 2, additive: false }));
  return { cast: [], camera: { pos: [3.6, 1.3, 16], look: [-3, 0.8, -12], fov: 44 }, envIntensity: 0.45 };
}

/* ============================================================ DESERT */

const SAND = { '*': 0xd9b48a };

async function desertRun({ scene, world }) {
  const sunDir = new THREE.Vector3(-0.5, 0.7, -0.4);
  scene.fog = new THREE.FogExp2(0xf2d6ac, 0.008);
  world.add(sky({ top: 0x3a76c4, horizon: 0xf6dcb0, bottom: 0xd8a674, sunDir, sunColor: 0xffd28a, sunSize: 1600, clouds: 0.12 }));
  lights(world, { sunDir, sun: 0xffd6a0, sunI: 4.2, hemiSky: 0xa9cbef, hemiGround: 0xc78b55, hemiI: 0.9 });
  const r = rng(61);
  const [h1, h2, h3, mk, crates, crate, barrel, dead, rockG] = await Promise.all([
    model(PACK.rts + 'Houses_FirstAge_1_Level2.gltf', SAND), model(PACK.rts + 'Houses_FirstAge_2_Level2.gltf', SAND),
    model(PACK.rts + 'Houses_FirstAge_3_Level2.gltf', SAND), model(PACK.rts + 'Market_FirstAge_Level2.gltf'),
    model(PACK.rts + 'Crate_Stack2.gltf'), model(PACK.rts + 'Crate.gltf'), model(PACK.rts + 'Barrel.gltf'),
    model(PACK.ruins + 'DeadTree_1.fbx', { '*': 0xd8c7a8 }), model(PACK.rts + 'Rock_Group.gltf', { '*': 0xc98a5a }),
  ]);
  plane(world, 600, 600, strip('Ground051_1K-JPG', 600, 600, { tint: 0xf2c79a, tile: 4 }), { z: -200 });
  // a dusty town street, houses both sides
  for (let i = 0; i < 9; i++) for (const side of [-1, 1]) {
    const z = 2 - i * 10 + r() * 3;
    place(world, i === 2 && side === 1 ? mk : [h1, h2, h3][Math.floor(r() * 3)], side * (8 + r() * 2), 0, z, { s: 9 + r() * 2, ry: side > 0 ? -Math.PI / 2 : Math.PI / 2, shadow: true });
  }
  for (const [x, z, src, s] of [[3.8, -3, crates, 12], [-4, -9, barrel, 15], [-3.6, -10, barrel, 15], [4.2, -16, crate, 15], [-4.3, -22, crates, 11]]) place(world, src, x, 0, z, { s, ry: r() * 3, shadow: true });
  for (const [x, z, h] of [[5, 2, 2.6], [-5.5, -30, 3]]) world.add(cactus(x, z, h, r));
  place(world, dead, -5, 0, 3, { s: RU * 1.1, shadow: true });
  // power line down the street
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4231, roughness: 0.95 });
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 8, 6), wood); p.position.set(5.2, 4, -6 - i * 16); p.castShadow = true; world.add(p);
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.12), wood); b.position.set(5.2, 7.6, -6 - i * 16); world.add(b);
  }
  // mesas at the end of the street
  const sand = pbr('_source/downloads/rock029/Rock029_1K-JPG', { repeat: 3, tint: 0xf0b98a });
  for (let k = 0; k < 9; k++) {
    const h = 24 + r() * 30, m = new THREE.Mesh(craggy(14 + r() * 10, h, k + 9, 7), sand);
    m.position.set(-80 + k * 22 + r() * 8, h / 2 - 0.5, -140 - r() * 60); world.add(m);
  }
  scatter(world, [rockG], 10, r, { x0: 12, x1: 30, z0: -80, z1: 10, s0: 5, s1: 9 });
  const hang = sign(['RELAY 7 · 9 km', { t: 'LAST WATER', size: 0.6 }], { w: 2.4, h: 0.8, bg: '#d9d2c3', fg: '#7a2a1a', glow: 1, basic: false });
  hang.position.set(-6.5, 3.4, -6); hang.rotation.y = Math.PI / 2 - 0.5; world.add(hang);
  world.add(particles(600, { center: [0, 1.5, -10], spread: [16, 3, 40], size: 0.07, color: 0xf5d1a2, opacity: 0.8, seed: 12, additive: false }));
  return { cast: RUN_CAST(), camera: RUN_CAM, envIntensity: 0.3 };
}

async function desertDrive({ scene, world }) {
  const sunDir = new THREE.Vector3(-0.8, 0.22, -0.5);
  scene.fog = new THREE.FogExp2(0xf0cfa0, 0.0045);
  world.add(sky({ top: 0x3a6cb8, horizon: 0xf7c890, bottom: 0xd8a674, sunDir, sunColor: 0xffb070, sunSize: 1200, clouds: 0.18 }));
  lights(world, { sunDir, sun: 0xffbe84, sunI: 4, hemiSky: 0xa9cbef, hemiGround: 0xc78b55, hemiI: 0.8, size: 50 });
  const r = rng(63);
  plane(world, 1200, 1200, strip('Ground051_1K-JPG', 1200, 1200, { tint: 0xf2c79a, tile: 5 }), { z: -300 });
  plane(world, 9, 800, strip('Concrete042C_1K-JPG', 9, 800, { tint: 0x5a5452, tile: 6 }), { y: 0.01, z: -300 });
  const yellow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.25, 0.3) });
  for (let z = 20; z > -500; z -= 7) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 3), yellow); d.rotation.x = -Math.PI / 2; d.position.set(0, 0.02, z); world.add(d); }
  // dunes + mesas
  const dune = new THREE.MeshStandardMaterial({ color: 0xe8b884, roughness: 1 });
  for (let i = 0; i < 26; i++) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), dune);
    const side = r() < 0.5 ? -1 : 1;
    d.scale.set(10 + r() * 10, 3 + r() * 5, 10 + r() * 16);
    d.position.set(side * (30 + r() * 50), -1, -r() * 300 - 10); d.receiveShadow = true; world.add(d);
  }
  const sand = pbr('_source/downloads/rock029/Rock029_1K-JPG', { repeat: 3, tint: 0xf0b98a });
  for (let k = 0; k < 10; k++) {
    const h = 30 + r() * 40, m = new THREE.Mesh(craggy(18 + r() * 14, h, k + 21, 7), sand);
    m.position.set((r() < 0.5 ? -1 : 1) * (70 + r() * 120), h / 2 - 1, -200 - r() * 200); world.add(m);
  }
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4231, roughness: 0.95 });
  for (let i = 0; i < 14; i++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 8, 6), wood); p.position.set(-8, 4, 10 - i * 30); p.castShadow = true; world.add(p);
  }
  for (const [x, z, h] of [[8, -2, 3], [12, -20, 2.4], [-11, -12, 3.4]]) world.add(cactus(x, z, h, r));
  chase(world, 2.2, -1.8);
  world.add(particles(500, { center: [-1.8, 0.8, -12], spread: [6, 1.6, 16], size: 0.25, color: 0xe2b88a, opacity: 0.35, seed: 7, additive: false }));
  postSign(world, ['RELAY 7', { t: '3 km · DEAD END', size: 0.6 }], { w: 1.6, h: 0.8, bg: '#d9d2c3', fg: '#7a2a1a' }, 6, -6, -0.2, 2);
  return { cast: [], camera: DRIVE_CAM, envIntensity: 0.3 };
}

/* ============================================================= COAST */

function ocean(world, sunDir, { y = -1.2, horizon = 0xf6a774, top = 0x3a4a7c } = {}) {
  const o = oceanSurface(sunDir);
  o.material.uniforms.skyHorizon.value.set(horizon);
  o.material.uniforms.skyTop.value.set(top);
  o.position.y = y; world.add(o);
}

async function coastRun({ scene, world }) {
  const sunDir = new THREE.Vector3(-0.5, 0.32, -0.8);
  scene.fog = new THREE.FogExp2(0xf0c8a0, 0.004);
  world.add(sky({ top: 0x4a6aa8, horizon: 0xf8c89a, bottom: 0x2a3a50, sunDir, sunColor: 0xffc88a, sunSize: 1600, clouds: 0.45, cloudColor: 0xe8d0d0 }));
  lights(world, { sunDir, sun: 0xffc896, sunI: 3.8, hemiSky: 0xb8c4f0, hemiGround: 0x5a4a40, hemiI: 1.0 });
  const r = rng(71);
  const [port, port2, dock, crates, crate, barrel, h1, h2, tower] = await Promise.all([
    model(PACK.rts + 'Port_SecondAge_Level2.gltf'), model(PACK.rts + 'Port_FirstAge_Level3.gltf'), model(PACK.rts + 'Dock_FirstAge.gltf'),
    model(PACK.rts + 'Crate_Stack2.gltf'), model(PACK.rts + 'Crate.gltf'), model(PACK.rts + 'Barrel.gltf'),
    model(PACK.rts + 'Houses_SecondAge_1_Level2.gltf'), model(PACK.rts + 'Houses_SecondAge_2_Level2.gltf'),
    model(PACK.rts + 'WatchTower_SecondAge_Level1.gltf'),
  ]);
  ocean(world, sunDir, { horizon: 0xf8c89a, top: 0x4a6aa8 });
  // a long wooden pier out over the water
  const planks = strip('WoodFloor041_1K-JPG', 5, 140, { tint: 0xb89878, tile: 3 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(5, 0.4, 140), planks);
  pier.position.set(0, -0.2, -50); pier.receiveShadow = pier.castShadow = true; world.add(pier);
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.9 });
  for (let z = 18; z > -120; z -= 4) for (const x of [-2.6, 2.6]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 6), wood); p.position.set(x, -0.8, z); world.add(p);
    if (z % 8 === 2) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 0.14), wood); post.position.set(x, 0.55, z); post.castShadow = true; world.add(post); }
  }
  for (let z = 10; z > -110; z -= 18) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.6, 6), new THREE.MeshStandardMaterial({ color: 0x2a2e34, metalness: 0.6 }));
    lamp.position.set(2.4, 1.8, z); world.add(lamp);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.6, 1.6) }));
    bulb.position.set(2.4, 3.65, z); world.add(bulb);
  }
  for (const [x, z, src, s, ry] of [[1.6, -4, crates, 11, 0.4], [-1.7, -11, barrel, 14, 0], [-1.5, -12, barrel, 14, 0], [1.7, -20, crate, 14, 1]]) place(world, src, x, 0, z, { s, ry, shadow: true });
  // harbour: docks and boats on both sides, the town on the shore behind
  place(world, port, -14, -0.8, -24, { s: 14, ry: 1.2, shadow: true });
  place(world, port2, 15, -0.8, -40, { s: 14, ry: -2.2, shadow: true });
  place(world, dock, 10, -0.8, -8, { s: 14, ry: -1.6 });
  for (let i = 0; i < 8; i++) place(world, [h1, h2][i % 2], -60 + i * 16, 0.5, -130 - r() * 10, { s: 13, ry: r() * 6 });
  const shore = new THREE.Mesh(new THREE.BoxGeometry(260, 4, 30), pbr('Ground051_1K-JPG', { repeat: 20, tint: 0xb8a088 }));
  shore.position.set(0, -1.4, -140); world.add(shore);
  const head = new THREE.Mesh(craggy(26, 46, 41, 9), pbr('_source/downloads/rock064/Rock064_1K-JPG', { repeat: 6, tint: 0x8a8890 }));
  head.position.set(-110, -6, -220); world.add(head);
  place(world, tower, -110, 17, -220, { s: 16 });
  postSign(world, ['STATION 7 FERRY', { t: 'CANCELLED', size: 0.7, color: '#a3231c' }], { w: 1.6, h: 0.75, bg: '#e6e1d8', fg: '#163a5a' }, -2.2, -2, 0.35, 1.6);
  const m = new THREE.MeshBasicMaterial({ color: 0x1e1a22, side: THREE.DoubleSide });
  for (let k = 0; k < 8; k++) {
    const g = new THREE.Group();
    for (const side of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.16), m); w.position.x = side * 0.42; w.rotation.z = side * 0.3; g.add(w); }
    g.position.set(-20 + r() * 40, 8 + r() * 12, -20 - r() * 50); g.scale.setScalar(0.6 + r() * 0.5); world.add(g);
  }
  world.add(particles(260, { center: [0, 2, -10], spread: [16, 4, 40], size: 0.05, color: 0xffe0c8, opacity: 0.7, seed: 15 }));
  return { cast: RUN_CAST(), camera: RUN_CAM, envIntensity: 0.3, bloom: { strength: 0.35, radius: 0.5, threshold: 0.92 } };
}

async function coastDrive({ scene, world }) {
  const sunDir = new THREE.Vector3(-0.85, 0.12, -0.5);
  scene.fog = new THREE.FogExp2(0xe0a090, 0.0025);
  world.add(sky({ top: 0x2e3e6e, horizon: 0xf6a774, bottom: 0x1d2c44, sunDir, sunColor: 0xffb26b, sunSize: 2200, clouds: 0.6, cloudColor: 0x9a7a8e }));
  lights(world, { sunDir, sun: 0xffa66a, sunI: 3.4, hemiSky: 0xb0b4ec, hemiGround: 0x4a3a40, hemiI: 1.1, size: 50 });
  const r = rng(73);
  const [tower, grass, rock1] = await Promise.all([
    model(PACK.rts + 'WatchTower_SecondAge_Level1.gltf'), model(PACK.nature + 'Grass2.fbx', { '*': 0x9aa258 }),
    model(PACK.nature + 'Rock1.fbx', { Rock: 0x55565e }),
  ]);
  // cliff-top road: sea far below on the left, hillside on the right
  const rock = pbr('_source/downloads/rock064/Rock064_1K-JPG', { repeat: 1, tint: 0x9c9aa4 });
  for (const t of [rock.map, rock.normalMap, rock.roughnessMap]) t.repeat.set(40, 4);
  const cliff = new THREE.Mesh(new THREE.BoxGeometry(30, 40, 500, 4, 8, 100), rock);
  const pa = cliff.geometry.attributes.position;
  for (let i = 0; i < pa.count; i++) if (pa.getX(i) < 0) pa.setX(i, pa.getX(i) + Math.sin(pa.getZ(i) * 0.08) * 3 + Math.sin(pa.getY(i) * 0.3 + pa.getZ(i) * 0.05) * 1.5);
  cliff.geometry.computeVertexNormals();
  cliff.position.set(8, -20.05, -180); cliff.receiveShadow = true; world.add(cliff);
  plane(world, 9, 500, strip('Concrete042C_1K-JPG', 9, 500, { tint: 0x55525a, tile: 6 }), { z: -180 });
  const white = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.3, 1.25) });
  for (let z = 20; z > -400; z -= 7) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 3), white); d.rotation.x = -Math.PI / 2; d.position.set(0, 0.02, z); world.add(d); }
  plane(world, 20, 500, new THREE.MeshStandardMaterial({ color: 0x6a7040, roughness: 1 }), { x: 14.5, y: -0.03, z: -180 });
  const hill = new THREE.Mesh(new THREE.BoxGeometry(60, 18, 500), new THREE.MeshStandardMaterial({ color: 0x5a6038, roughness: 1 }));
  hill.position.set(48, 6, -180); hill.rotation.z = 0.35; world.add(hill);
  scatter(world, [grass], 220, r, { x0: 5, x1: 22, z0: -100, z1: 20, s0: 0.012, s1: 0.02, both: false });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb0b4ba, metalness: 0.7, roughness: 0.35 });
  for (let z = 20; z > -200; z -= 3) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), steel); p.position.set(-4.7, 0.4, z); world.add(p); }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 220), steel); rail.position.set(-4.7, 0.7, -90); world.add(rail);
  ocean(world, sunDir, { y: -40, horizon: 0xf6a774, top: 0x2e3e6e });
  for (let k = 0; k < 8; k++) place(world, rock1, -40 - r() * 160, -42, -40 - r() * 260, { s: 0.08 + r() * 0.1, sy: 0.2 + r() * 0.15, ry: r() * 6 });
  const head = new THREE.Mesh(craggy(30, 60, 41, 9), rock);
  head.position.set(-150, -40, -260); world.add(head);
  place(world, tower, -150, -10, -260, { s: 18 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5, 3.5) }));
  lamp.position.set(-150, 5, -260); world.add(lamp);
  chase(world, 2.2, -1.8);
  postSign(world, ['STATION 7', { t: '2 km', size: 0.7 }], { w: 1.4, h: 0.8, bg: '#163a5a', fg: '#ffffff', border: '#ffffff' }, 6, -6, -0.2, 2);
  return { cast: [], camera: { pos: [3.6, 1.4, 16], look: [-4, 0.6, -12], fov: 44 }, envIntensity: 0.25, bloom: { strength: 0.3, radius: 0.5, threshold: 0.95 } };
}

export const WORLDS = {
  'shrine-run': shrineRun, 'shrine-drive': shrineDrive,
  'monastery-run': monasteryRun, 'monastery-drive': monasteryDrive,
  'desert-run': desertRun, 'desert-drive': desertDrive,
  'coast-run': coastRun, 'coast-drive': coastDrive,
};
