/**
 * The shared story beats that lead into Level 3:
 *   prologue → metro-hero / metro-play (L1) → gate (Interlude I)
 *   → highway-hero / highway-play (L2) → bridge (Interlude II)
 * Each entry builds its world and returns { cast, camera, hud?, views?, bloom? }.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { model, place, pbr, rng, sky, particles, lightShaft, sign, PACK } from './scene.js';

const CYAN = 0x38e1ff, AMBER = 0xffb547, MAGENTA = 0xff4fa3;

/* ------------------------------------------------------------- helpers */

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

const glowMat = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });

/** Mirror under a semi-transparent surface = wet floor / wet road. */
function wetFloor(world, w, d, surface, { y = 0, x = 0, z = 0, tint = 0x8a96a2 } = {}) {
  const mirror = new Reflector(new THREE.PlaneGeometry(w, d), { textureWidth: 1024, textureHeight: 1024, color: tint });
  mirror.rotation.x = -Math.PI / 2; mirror.position.set(x, y, z);
  world.add(mirror);
  surface.transparent = true;
  const top = new THREE.Mesh(new THREE.PlaneGeometry(w, d), surface);
  top.rotation.x = -Math.PI / 2; top.position.set(x, y + 0.01, z); top.receiveShadow = true;
  world.add(top);
  return top;
}

/** Low-poly car; front faces -z. Kai drives cyan-blue, the Handler a dark red SUV (Level 2 colours). */
export function car({ color, suv = false, beams = true, beamLen = 40 }) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.42, envMapIntensity: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a1016, metalness: 0.85, roughness: 0.1 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.9 });
  const W = 1.9, L = suv ? 4.7 : 4.4, H = suv ? 0.85 : 0.6, cabH = suv ? 0.72 : 0.52;
  const body = new THREE.Mesh(new RoundedBoxGeometry(W, H, L, 4, 0.16), paint);
  body.position.y = 0.36 + H / 2; body.castShadow = true; g.add(body);
  const cab = new THREE.Mesh(new RoundedBoxGeometry(W * 0.84, cabH, L * (suv ? 0.62 : 0.5), 4, 0.15), glass);
  cab.position.set(0, 0.36 + H + cabH / 2 - 0.06, suv ? 0.25 : 0.2); cab.castShadow = true; g.add(cab);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 18), tyre);
    w.rotation.z = Math.PI / 2; w.position.set(sx * (W / 2 - 0.05), 0.36, sz * L * 0.32); g.add(w);
  }
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.05), glowMat(9, 8.5, 7));
    hl.position.set(sx * 0.6, 0.36 + H * 0.62, -L / 2 - 0.01); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.05), glowMat(5, 0.25, 0.2));
    tl.position.set(sx * 0.62, 0.36 + H * 0.7, L / 2 + 0.01); g.add(tl);
  }
  if (beams) {
    const spot = new THREE.SpotLight(0xfff1d8, 120, beamLen, 0.42, 0.6, 1.4);
    spot.position.set(0, 0.8, -L / 2); spot.target.position.set(0, 0, -L / 2 - 14);
    g.add(spot, spot.target);
  }
  return g;
}

function truck(color = 0xe8e4dc) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2 });
  g.add(box(2.5, 2.6, 2.4, paint, 0, 1.75, -6.3));
  g.add(box(2.6, 3.4, 11, new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.7, metalness: 0.3 }), 0, 2.3, 0.6));
  for (const sx of [-1, 1]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.05), glowMat(5, 0.3, 0.2));
    tl.position.set(sx * 1.05, 0.9, 6.12); g.add(tl);
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.05), glowMat(8, 7.5, 6));
    hl.position.set(sx * 0.9, 1.0, -7.52); g.add(hl);
  }
  const tyre = new THREE.MeshStandardMaterial({ color: 0x111214 });
  for (const z of [-6.4, -0.5, 1.5, 4.5]) for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 14), tyre);
    w.rotation.z = Math.PI / 2; w.position.set(sx * 1.1, 0.5, z); g.add(w);
  }
  return g;
}

function drone() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1c20, metalness: 0.6, roughness: 0.4 });
  g.add(box(0.5, 0.14, 0.5, dark));
  for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 12), new THREE.MeshStandardMaterial({ color: 0x2c2f35, transparent: true, opacity: 0.6 }));
    r.position.set(x, 0.1, z); g.add(r);
  }
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), glowMat(6, 0.3, 0.2));
  eye.position.set(0, -0.05, -0.26); g.add(eye);
  return g;
}

function streetlight(world, x, z, side, lit = true, y0 = 0) {
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3e44, metalness: 0.6, roughness: 0.5 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 9, 8), metal);
  pole.position.set(x, y0 + 4.5, z); world.add(pole);
  const arm = box(2.4, 0.12, 0.12, metal, x - side * 1.1, y0 + 8.9, z); world.add(arm);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.32), glowMat(6, 3.2, 1.1));
  head.position.set(x - side * 2.2, y0 + 8.8, z); world.add(head);
  if (lit) {
    const l = new THREE.PointLight(0xffa64a, 60, 26, 1.8);
    l.position.set(x - side * 2.2, y0 + 8.4, z); world.add(l);
  }
}

/** Skyline: boxes with a lit-window texture. */
function skyline(world, { z0 = -340, spread = 900, count = 70, seed = 4, tint = 0x1a1c2c } = {}) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d'); g.fillStyle = '#05060a'; g.fillRect(0, 0, 128, 256);
  const r = rng(seed);
  for (let y = 6; y < 256; y += 12) for (let x = 6; x < 128; x += 14) {
    if (r() < 0.38) { g.fillStyle = r() < 0.7 ? '#ffd9a0' : '#9fd8ff'; g.fillRect(x, y, 7, 6); }
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  for (let i = 0; i < count; i++) {
    const w = 18 + r() * 30, h = 30 + r() * 140, d = 18 + r() * 20;
    const t = tex.clone(); t.repeat.set(w / 30, h / 60); t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: tint, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.3, roughness: 0.9 }));
    m.position.set((r() - 0.5) * spread, h / 2 - 2, z0 - r() * 160);
    world.add(m);
  }
}

function rain(world, center, spread, count = 7000, color = 0xaecbff) {
  const r = rng(77), pos = new Float32Array(count * 6);
  for (let i = 0; i < count; i++) {
    const x = center[0] + (r() - 0.5) * spread[0], y = center[1] + (r() - 0.5) * spread[1], z = center[2] + (r() - 0.5) * spread[2];
    pos.set([x, y, z, x + 0.03, y - 0.55, z + 0.08], i * 6);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  world.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false })));
}

/* ------------------------------------------------------------- HUD bits */

function hudStyle(host, accent, css) {
  const st = document.createElement('style');
  st.textContent = `.sh{position:absolute;inset:0;font-family:'Segoe UI',system-ui,sans-serif;color:#eaf2f8}
    .sh .lab{font-size:10px;letter-spacing:.25em;color:#b9c7d2;margin:8px 0 3px}
    .sh .bar{height:10px;background:#0b1016;border:1px solid #ffffff22;border-radius:2px;overflow:hidden}
    .sh .fill{height:100%;background:linear-gradient(90deg,${accent}88,${accent})}
    .sh .big{font:700 30px Bahnschrift,'Segoe UI',sans-serif;letter-spacing:.06em;color:${accent};text-shadow:0 0 14px ${accent}88}
    ${css}`;
  document.head.appendChild(st);
  const el = document.createElement('div'); el.className = 'sh'; host.appendChild(el);
  document.body.classList.add('play');
  return el;
}

/* ============================================================ PROLOGUE */

async function prologue({ scene, world }) {
  scene.background = new THREE.Color(0x05080d);
  scene.fog = new THREE.FogExp2(0x0a1620, 0.018);
  world.add(new THREE.HemisphereLight(0x5f8fb8, 0x0a0d12, 0.35));

  const floor = pbr('Concrete042C_1K-JPG', { repeat: 8, tint: 0x55606e });
  wetFloor(world, 8, 40, floor, { z: -10, tint: 0x3a434e });
  const dark = new THREE.MeshStandardMaterial({ color: 0x10141a, metalness: 0.5, roughness: 0.5 });
  world.add(box(8, 0.2, 40, dark, 0, 3.6, -10));

  // rack fronts: one LED texture, reused
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const gx = c.getContext('2d'); gx.fillStyle = '#07090c'; gx.fillRect(0, 0, 128, 256);
  const r = rng(2);
  for (let y = 8; y < 256; y += 9) {
    gx.fillStyle = '#151a22'; gx.fillRect(6, y, 116, 6);
    for (let x = 10; x < 120; x += 9) if (r() < 0.32) { gx.fillStyle = r() < 0.75 ? '#3fe7ff' : (r() < 0.6 ? '#5cff8a' : '#ffb547'); gx.fillRect(x, y + 2, 3, 2); }
  }
  const leds = new THREE.CanvasTexture(c); leds.colorSpace = THREE.SRGBColorSpace;
  const front = new THREE.MeshStandardMaterial({ color: 0x0c0f14, emissive: 0xffffff, emissiveMap: leds, emissiveIntensity: 2.2, metalness: 0.4, roughness: 0.4 });
  for (const side of [-1, 1]) for (let i = 0; i < 16; i++) {
    const z = 3 - i * 1.25, x = side * 2.5;
    if (side === -1 && i === 2) continue; // the open rack
    world.add(box(0.9, 2.2, 1.2, dark, x, 1.1, z));
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 2.1), front);
    f.position.set(x - side * 0.451, 1.1, z); f.rotation.y = -side * Math.PI / 2; world.add(f);
  }
  // the "decommissioned" rack: door open, red integrity light, a console pulled out
  world.add(box(0.9, 2.2, 1.2, dark, -2.5, 1.1, 0.5));
  const door = box(0.05, 2.1, 1.1, dark, -1.75, 1.1, 1.35); door.rotation.y = -1.1; world.add(door);
  const red = new THREE.PointLight(0xff3a2a, 6, 4, 2); red.position.set(-1.9, 1.4, 0.5); world.add(red);
  const tag = sign(['DECOMMISSIONED', { t: 'DO NOT POWER ON', size: 0.6 }], { w: 0.7, h: 0.3, bg: '#ffb547', fg: '#1a1208', glow: 1, basic: false });
  tag.position.set(-2.04, 1.9, 0.5); tag.rotation.y = Math.PI / 2; world.add(tag);
  const screen = sign([
    { t: 'INTEGRITY CHECK COMPLETE · 01:48', size: 0.6, color: '#7fdcff' },
    { t: 'MANIFEST: BLACKOUT', size: 1.2, color: '#ff4a3a' },
    { t: 'CONTINENT-WIDE NETWORK KILL SWITCH', size: 0.6, color: '#e6eef5' },
    { t: 'STATUS: CONTRACTED · DELIVERY IN 9 DAYS', size: 0.6, color: '#ffb547' },
  ], { w: 0.9, h: 0.55, bg: '#060a10', glow: 1.8 });
  screen.position.set(-1.95, 1.35, 0.5); screen.rotation.y = Math.PI / 2 - 0.25; world.add(screen);
  const glow = new THREE.PointLight(0x9fdcff, 3, 3, 2); glow.position.set(-1.5, 1.4, 0.5); world.add(glow);

  // ceiling strips
  for (let i = 0; i < 9; i++) {
    const z = 2 - i * 4;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 2.6), glowMat(0.9, 1.4, 1.9));
    strip.position.set(0, 3.45, z); world.add(strip);
    if (i % 2 === 0) { const l = new THREE.PointLight(0x9fd0ff, 5, 9, 2); l.position.set(0, 3.1, z); world.add(l); }
  }

  // the door at the end of the hall opens — and someone is standing in it
  const back = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3), glowMat(1.1, 1.4, 1.7));
  back.position.set(0, 1.5, -22.2); world.add(back);
  world.add(box(1, 3.6, 0.3, dark, -1.6, 1.8, -22), box(1, 3.6, 0.3, dark, 1.6, 1.8, -22));
  const spill = new THREE.SpotLight(0xcfe6ff, 22, 30, 0.5, 0.7, 1.2);
  spill.position.set(0, 2.6, -22); spill.target.position.set(0, 0, -10); world.add(spill, spill.target);
  world.add(lightShaft(new THREE.Vector3(0, 2.4, -22.4), new THREE.Vector3(0, 0, -12), 2.2, 0xbfe0ff, 0.06));
  const hall = sign(['DC-3 · HALL B', { t: 'TIER IV · NO TAILGATING', size: 0.55 }], { w: 1.8, h: 0.5, fg: '#7fdcff', glow: 1.4 });
  hall.position.set(0, 3.1, -21.9); world.add(hall);
  world.add(particles(300, { center: [0, 1.8, -8], spread: [6, 3.5, 26], size: 0.03, color: 0xbfe6ff, opacity: 0.5, seed: 21 }));

  return {
    cast: [
      { who: 'kai', pos: [-0.85, 0, 1.05], face: [-2.2, 0, 0.4], pose: 'idle', t: 0.9, key: true },
      { who: 'handler', pos: [0, 0, -21.2], ry: 0, pose: 'idle', t: 1.6 },
    ],
    camera: { pos: [1.5, 1.55, 3.6], look: [-1.1, 1.3, -4], fov: 46 },
    bloom: { strength: 0.4, radius: 0.5, threshold: 0.9 },
    envIntensity: 0.12,
  };
}

/* ======================================================== L1 · DOWNLINE */

const LANES = [-2.4, 0, 2.4];

function metro(world, scene, r, { train = null, board = "HE'S STILL COMING" } = {}) {
  scene.background = new THREE.Color(0x020507);
  scene.fog = new THREE.FogExp2(0x041016, 0.028);
  world.add(new THREE.HemisphereLight(0x3d8fb0, 0x05080c, 0.4));

  const len = 200;
  const wall = pbr('Concrete042C_1K-JPG', { repeat: 1, tint: 0x46586a, normalScale: 0.45 });
  wall.map.repeat.set(len / 6, 1.2); wall.normalMap.repeat.set(len / 6, 1.2); wall.roughnessMap.repeat.set(len / 6, 1.2);
  const floor = pbr('Concrete042C_1K-JPG', { repeat: 1, tint: 0x3e4c55, rough: 0.6 });
  for (const t of [floor.map, floor.normalMap, floor.roughnessMap]) t.repeat.set(4, len / 3);
  floor.opacity = 0.72;
  wetFloor(world, 12.4, len, floor, { z: -len / 2 + 20, tint: 0x6f8794 });
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(len, 6.5), wall);
    w.rotation.y = side * -Math.PI / 2; w.position.set(side * 6.2, 3.25, -len / 2 + 20); w.receiveShadow = true;
    world.add(w);
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(12.4, len), new THREE.MeshStandardMaterial({ color: 0x0b1116, roughness: 1 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 6.5, -len / 2 + 20); world.add(ceil);

  // tracks
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa4ac, metalness: 0.9, roughness: 0.25 });
  const sleeperMat = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.95 });
  const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 0.12, 0.3), sleeperMat, 3 * 260);
  let n = 0;
  const m4 = new THREE.Matrix4();
  for (const x of LANES) {
    for (const dx of [-0.72, 0.72]) world.add(box(0.08, 0.14, len, steel, x + dx, 0.13, -len / 2 + 20));
    for (let z = 20; z > -len + 20 && n < sleepers.count; z -= 0.8) { m4.makeTranslation(x, 0.05, z); sleepers.setMatrixAt(n++, m4); }
  }
  sleepers.count = n; sleepers.receiveShadow = true; world.add(sleepers);

  // cyan emergency strips on both walls, amber hazard lamps
  for (let i = 0; i < 18; i++) {
    const z = 16 - i * 7;
    for (const side of [-1, 1]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 2.4), glowMat(0.5, 3.2, 4));
      s.position.set(side * 6.1, 2.7, z); world.add(s);
    }
    if (i % 2 === 0 && i < 12) { const l = new THREE.PointLight(CYAN, 14, 14, 1.8); l.position.set((i % 4 ? 1 : -1) * 5, 2.6, z); world.add(l); }
    if (i % 5 === 2) {
      const a = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), glowMat(5, 2.4, 0.4));
      a.position.set(-6.05, 4.2, z); world.add(a);
      const al = new THREE.PointLight(AMBER, 5, 7, 2); al.position.set(-5.6, 4.2, z); world.add(al);
    }
  }
  // signs
  const plat = sign(['PLATFORM 4', { t: 'SOUTHBOUND', size: 0.7 }], { w: 3.4, h: 1.1, fg: '#7fe6ff', glow: 1.8, border: '#2a5866' });
  plat.position.set(-3.2, 5.2, -9); world.add(plat);
  const dep = sign([{ t: '02:20  SOUTHBOUND  ·  DELAYED', size: 0.8 }, { t: board, size: 1 }], { w: 4.6, h: 1.0, bg: '#0a0703', fg: '#ffb547', glow: 2.2 });
  dep.position.set(2.6, 5.1, -22); world.add(dep);
  const rose = sign(['ROSEBANK'], { w: 3, h: 0.6, bg: '#e9eef2', fg: '#0d3e57', glow: 1, basic: false });
  rose.position.set(6.18, 3.6, -14); rose.rotation.y = -Math.PI / 2; world.add(rose);

  // obstacles: ticket barrier, luggage trolley, hanging duct
  const grey = new THREE.MeshStandardMaterial({ color: 0x7c868e, metalness: 0.6, roughness: 0.35 });
  for (const dx of [-0.75, 0.75]) world.add(box(0.3, 1.05, 1.4, grey, LANES[0] + dx, 0.52, -11));
  const flap = box(1.2, 0.3, 0.06, new THREE.MeshStandardMaterial({ color: 0xc8322a, emissive: 0x3a0806 }), LANES[0], 0.85, -11); world.add(flap);
  const trolley = new THREE.Group();
  trolley.add(box(1.0, 0.08, 1.5, grey, 0, 0.35, 0), box(0.9, 0.7, 0.6, new THREE.MeshStandardMaterial({ color: 0x5a3b2a }), 0, 0.75, 0.3), box(0.8, 0.5, 0.5, new THREE.MeshStandardMaterial({ color: 0x2f4f6a }), 0, 1.35, 0.2));
  trolley.position.set(LANES[2], 0, -18); trolley.rotation.y = 0.3; world.add(trolley);
  world.add(box(12, 0.8, 0.9, new THREE.MeshStandardMaterial({ color: 0x3a4148, metalness: 0.7, roughness: 0.4 }), 0, 4.9, -30));

  // the letter: a glowing envelope just off the safe line
  const env = sign(['✉'], { w: 0.5, h: 0.36, bg: '#ffe9a8', fg: '#7a5a10', glow: 2.6 });
  env.position.set(LANES[0], 1.1, -5.5); env.rotation.y = 0.35; world.add(env);
  world.add(particles(40, { center: [LANES[0], 1.1, -5.5], spread: [0.9, 0.9, 0.9], size: 0.05, color: 0xffe08a, opacity: 0.9, seed: 9 }));

  // flood mist + drips
  world.add(particles(900, { center: [0, 0.4, -20], spread: [12, 0.8, 80], size: 0.35, color: 0x5fb8d0, opacity: 0.09, seed: 5, additive: false }));
  world.add(particles(500, { center: [0, 3, -15], spread: [12, 6, 60], size: 0.03, color: 0xbfefff, opacity: 0.7, seed: 6 }));

  if (train) {
    const t = new THREE.Group();
    t.add(box(2.6, 3.4, 18, new THREE.MeshStandardMaterial({ color: 0x8b949c, metalness: 0.6, roughness: 0.4 }), 0, 1.9, 9));
    t.add(box(2.4, 1.1, 0.05, new THREE.MeshStandardMaterial({ color: 0x0a0d10, metalness: 0.9, roughness: 0.1 }), 0, 2.6, -0.01));
    for (const sx of [-0.8, 0.8]) {
      const h = new THREE.Mesh(new THREE.CircleGeometry(0.22, 18), glowMat(6, 5.6, 4.8));
      h.position.set(sx, 1.2, -0.03); h.rotation.y = Math.PI; t.add(h);
    }
    const beam = new THREE.SpotLight(0xfff3dc, 110, 90, 0.3, 0.5, 1.4);
    beam.position.set(0, 1.4, -0.2); beam.target.position.set(0, 0.5, -40); t.add(beam, beam.target);
    t.add(lightShaft(new THREE.Vector3(0, 1.3, -0.2), new THREE.Vector3(0, 0.3, -40), 3.2, 0xfff0d0, 0.04));
    t.position.set(train.x, 0, train.z); t.rotation.y = Math.PI; // nose faces +z, toward Kai
    world.add(t);
  }
}

async function metroHero({ scene, world }) {
  metro(world, scene, rng(1), {});
  // the Handler's torch, 15 m back
  const torch = new THREE.SpotLight(0xe8f4ff, 45, 40, 0.24, 0.5, 1.3);
  torch.position.set(0.15, 1.5, -14.3); torch.target.position.set(0, 0.6, 4); world.add(torch, torch.target);
  world.add(lightShaft(new THREE.Vector3(0.15, 1.5, -14.3), new THREE.Vector3(0, 0.4, 2), 1.6, 0xdff0ff, 0.06));
  return {
    cast: [
      { who: 'kai', pos: [0, 0, 0.6], ry: 0, pose: 'run', t: 0.24 },
      { who: 'handler', pos: [0.15, 0, -14.8], ry: 0, pose: 'run', t: 0.62 },
    ],
    camera: { pos: [1.1, 0.75, 6.4], look: [-0.3, 1.5, -8], fov: 44 },
    exposure: 1.4,
    bloom: { strength: 0.45, radius: 0.55, threshold: 0.9 },
    envIntensity: 0.1,
  };
}

async function metroPlay({ scene, world }) {
  metro(world, scene, rng(1), { train: { x: LANES[0], z: -70 }, board: 'SECTOR 2 CLEAR' });
  return {
    cast: [{ who: 'kai', pos: [0, 0, 0], ry: Math.PI, pose: 'run', t: 0.5 }],
    camera: { pos: [0, 3.0, 5.6], look: [0, 1.5, -10], fov: 55 },
    bloom: { strength: 0.55, radius: 0.55, threshold: 0.85 },
    envIntensity: 0.1,
    exposure: 1.6,
    hud: (host) => {
      const el = hudStyle(host, '#38e1ff', `
        .sh .dist{position:absolute;left:26px;top:22px;width:300px}
        .sh .let{position:absolute;right:26px;top:22px;text-align:right}
        .sh .let i{display:inline-block;width:26px;height:18px;margin-left:6px;border:1px solid #ffd27a;border-radius:2px;background:#ffd27a22}
        .sh .let i.on{background:#ffd27a;box-shadow:0 0 10px #ffd27a}
        .sh .card{position:absolute;right:26px;top:92px;width:330px;padding:12px 14px;background:#0a0f14d9;border-left:3px solid #ffd27a;font-size:13px;line-height:1.4;color:#f5ead0}
        .sh .keys{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);font-size:11px;letter-spacing:.25em;color:#9fdcf0}
        .sh .warn{position:absolute;left:50%;top:22px;transform:translateX(-50%);font:700 13px Bahnschrift,sans-serif;letter-spacing:.3em;color:#ffb547;text-shadow:0 0 10px #ffb54788}`);
      el.innerHTML = `
        <div class="dist"><div class="lab">HE IS</div><div class="big">15 m</div><div class="lab">BEHIND YOU</div><div class="bar"><div class="fill" style="width:38%"></div></div></div>
        <div class="warn">⚠ TRAIN · LEFT LANE</div>
        <div class="let"><div class="lab">LETTERS</div><i class="on"></i><i></i><i></i></div>
        <div class="card">“They told you that rack was decommissioned. It was signed for on Tuesday.”</div>
        <div class="keys">A / D LANE · SPACE JUMP · CTRL SLIDE · SHIFT SPRINT</div>`;
    },
  };
}

/* ====================================================== INTERLUDE I · GATE */

async function gate({ scene, world }) {
  metro(world, scene, rng(1), { train: { x: 0, z: -42 }, board: 'NO SERVICE BEYOND THIS POINT' });
  const steel = new THREE.MeshStandardMaterial({ color: 0x4d555d, metalness: 0.6, roughness: 0.55 });
  // hazard-striped frame
  const c = document.createElement('canvas'); c.width = 256; c.height = 32;
  const g = c.getContext('2d');
  for (let x = -32; x < 256; x += 32) { g.fillStyle = '#f2c12e'; g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 32); g.lineTo(x + 32, 0); g.lineTo(x + 16, 0); g.fill(); g.fillStyle = '#121212'; g.beginPath(); g.moveTo(x + 16, 32); g.lineTo(x + 32, 32); g.lineTo(x + 48, 0); g.lineTo(x + 32, 0); g.fill(); }
  const stripes = new THREE.CanvasTexture(c); stripes.colorSpace = THREE.SRGBColorSpace; stripes.wrapS = THREE.RepeatWrapping; stripes.repeat.set(4, 1);
  const hz = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.6 });
  world.add(box(12.4, 0.6, 0.6, hz, 0, 6.1, 0));
  for (const x of [-5.9, 5.9]) world.add(box(0.6, 6.4, 0.6, steel, x, 3.2, 0));
  for (let x = -5.5; x <= 5.5; x += 0.36) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 5.8, 8), steel);
    bar.position.set(x, 2.95, 0); bar.castShadow = true; world.add(bar);
  }
  world.add(box(12, 0.18, 0.2, steel, 0, 1.2, 0), box(12, 0.18, 0.2, steel, 0, 3.6, 0));
  const seal = sign(['SECTOR SEAL 043'], { w: 3.2, h: 0.5, bg: '#121212', fg: '#f2c12e', glow: 1, basic: false });
  seal.position.set(0, 6.1, 0.31); world.add(seal);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), glowMat(6, 0.3, 0.2));
  lamp.position.set(5.9, 6.6, 0.3); world.add(lamp);
  const red = new THREE.PointLight(0xff2a1a, 14, 10, 2); red.position.set(5, 5.5, 1.5); world.add(red);
  return {
    cast: [
      { who: 'kai', pos: [1.1, 0, 1.9], face: [0.2, 0, -0.5], pose: 'idle', t: 2.6, lean: 0.12 },
      { who: 'handler', pos: [0.2, 0, -0.55], ry: 0, pose: 'punch', t: 0.3 },
    ],
    camera: { pos: [3.4, 1.35, 4.6], look: [-0.4, 1.6, -1.2], fov: 38 },
    bloom: { strength: 0.45, radius: 0.6, threshold: 0.9 },
    envIntensity: 0.1,
  };
}

/* ======================================================== L2 · REDLINE */

function highway(world, { dusk = true, wet = false } = {}) {
  const len = 1400;
  const asphalt = pbr('Concrete042C_1K-JPG', { repeat: 1, tint: dusk ? 0x3c3a42 : 0x2c2c34, rough: wet ? 0.5 : 1, normalScale: 0.5 });
  for (const t of [asphalt.map, asphalt.normalMap, asphalt.roughnessMap]) t.repeat.set(4, len / 8);
  if (wet) { asphalt.roughness = 0.32; asphalt.metalness = 0.15; asphalt.normalScale.set(0.4, 0.4); }
  {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(32, len), asphalt);
    road.rotation.x = -Math.PI / 2; road.position.z = -len / 2 + 60; road.receiveShadow = true; world.add(road);
  }
  // lane markings: 6 lanes (3 each way) + median
  const dash = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.2, 1.15) });
  const dashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.18, 3), dash, 4 * 160);
  const m4 = new THREE.Matrix4(), rot = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  let n = 0;
  for (const x of [-10, -5, 5, 10]) for (let z = 50; z > -len + 60 && n < dashes.count; z -= 9) { m4.makeTranslation(x, 0.02, z).multiply(rot); dashes.setMatrixAt(n++, m4); }
  dashes.count = n; world.add(dashes);
  const median = new THREE.MeshStandardMaterial({ color: 0x8a8e94, roughness: 0.7 });
  world.add(box(0.6, 0.9, len, median, 0, 0.45, -len / 2 + 60));
  const rail = pbr('Metal022_1K-JPG', { repeat: 1, tint: 0xb0b4ba });
  for (const x of [-16, 16]) world.add(box(0.2, 0.4, len, rail, x, 0.75, -len / 2 + 60));
  const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(len, 400), new THREE.MeshStandardMaterial({ color: dusk ? 0x2a2a24 : 0x101210, roughness: 1 }));
  shoulder.rotation.x = -Math.PI / 2; shoulder.rotation.z = Math.PI / 2; shoulder.position.set(0, -0.05, -len / 2 + 60); world.add(shoulder);
  for (let i = 0; i < 16; i++) { streetlight(world, 16.6, 30 - i * 45, 1, i < 7); streetlight(world, -16.6, 8 - i * 45, -1, i < 7); }
}

async function highwayHero({ scene, world }) {
  const sunDir = new THREE.Vector3(0.1, 0.06, -1);
  scene.fog = new THREE.FogExp2(0x6a3a6e, 0.0045);
  world.add(sky({ top: 0x1d1a4a, horizon: 0xff7a7a, bottom: 0x2a1830, sunDir, sunColor: 0xff9a5a, sunSize: 1600, clouds: 0.55, cloudColor: 0x7a4a7e }));
  world.add(new THREE.HemisphereLight(0xc08ad8, 0x241820, 0.6));
  const sun = new THREE.DirectionalLight(0xff9a6a, 2.2); sun.position.set(-10, 8, -60); world.add(sun);
  const fill = new THREE.DirectionalLight(0x8a7aff, 0.6); fill.position.set(20, 10, 30); world.add(fill);
  highway(world, { dusk: true });
  skyline(world, { z0: -380, spread: 1000, count: 80, tint: 0x241c34 });
  const mtn = await model(PACK.rts + 'Mountain_Group_2.gltf', { '*': 0x2a2236 });
  const r = rng(9);
  for (let k = 0; k < 10; k++) place(world, mtn, (r() < 0.5 ? -1 : 1) * (140 + r() * 200), -2, -200 - r() * 400, { s: 50 + r() * 40, ry: r() * 6 });

  // cars head toward the camera (+z): Kai in front, the Handler closing, a truck boxed in behind
  const kai = car({ color: 0x35c9ff }); kai.rotation.y = Math.PI; kai.position.set(7.5, 0, 6); world.add(kai);
  const him = car({ color: 0x5a1410, suv: true }); him.rotation.y = Math.PI - 0.06; him.position.set(3.6, 0, -6.5); world.add(him);
  world.add(lightShaft(new THREE.Vector3(3.6, 0.9, -4.2), new THREE.Vector3(5, 0.2, 18), 3, 0xfff0d8, 0.1));
  const tr = truck(); tr.rotation.y = Math.PI; tr.position.set(12.5, 0, -34); world.add(tr);
  const oncoming = car({ color: 0xd8d4cc, beams: false }); oncoming.position.set(-7.5, 0, -60); world.add(oncoming);
  const d = drone(); d.position.set(4.6, 4.2, -2.5); d.rotation.y = Math.PI; world.add(d);
  return {
    cast: [],
    camera: { pos: [15.2, 1.1, 17.5], look: [3.5, 1.6, -8], fov: 40 },
    bloom: { strength: 0.5, radius: 0.55, threshold: 0.88 },
    envIntensity: 0.3,
  };
}

async function highwayPlay({ scene, world, W, H }) {
  scene.background = new THREE.Color(0x05060b);
  scene.fog = new THREE.FogExp2(0x0b0b16, 0.012);
  world.add(new THREE.HemisphereLight(0x5a5a9a, 0x08080c, 0.35));
  highway(world, { dusk: false, wet: true });
  skyline(world, { z0: 260, spread: 900, count: 50, tint: 0x14121e });

  // Kai heading away from the camera (-z); traffic ahead; the Handler behind (seen in the mirror)
  const kai = car({ color: 0x35c9ff }); kai.position.set(7.5, 0, 0); kai.rotation.y = 0.06; world.add(kai);
  const tr = truck(); tr.position.set(12.5, 0, -32); world.add(tr);
  const c2 = car({ color: 0xc9c4b8, beams: false }); c2.position.set(2.5, 0, -48); world.add(c2);
  // he drives toward -z too, right on Kai's bumper
  const him = car({ color: 0x5a1410, suv: true }); him.position.set(5.5, 0, 13); world.add(him);
  him.traverse((o) => { if (o.isSpotLight) o.intensity = 35; });
  const d = drone(); d.position.set(9.5, 3.4, -9); world.add(d);
  const dl = new THREE.PointLight(0xff3020, 3, 6, 2); dl.position.copy(d.position); world.add(dl);

  // gantry over the road
  const steel = new THREE.MeshStandardMaterial({ color: 0x5a6068, metalness: 0.7, roughness: 0.4 });
  world.add(box(34, 0.5, 0.5, steel, 0, 7.6, -40), box(0.4, 7.6, 0.4, steel, -16.6, 3.8, -40), box(0.4, 7.6, 0.4, steel, 16.6, 3.8, -40));
  const g1 = sign([{ t: 'N3  SOUTH', size: 1 }, { t: 'TOLL PLAZA 2 km', size: 0.7 }], { w: 6, h: 2.2, bg: '#0e5a2e', fg: '#ffffff', glow: 1.2, border: '#ffffff' });
  g1.position.set(7.5, 6.4, -39.7); world.add(g1);
  const g2 = sign([{ t: 'NO SERVICE', size: 1 }, { t: 'BEYOND THIS POINT', size: 0.8 }], { w: 5, h: 2.2, bg: '#140808', fg: '#ff4fa3', glow: 2.2 });
  g2.position.set(-1.5, 6.4, -39.7); world.add(g2);
  rain(world, [6, 6, -6], [36, 14, 50], 3200);

  // rear-view mirror and minimap cameras
  const rear = new THREE.PerspectiveCamera(32, 480 / 150, 0.1, 400);
  rear.position.set(7.5, 1.6, 2.7); rear.lookAt(5.5, 1.0, 18);
  const mapCam = new THREE.OrthographicCamera(-30, 30, 40, -40, 1, 200);
  mapCam.position.set(4, 80, -12); mapCam.up.set(0, 0, -1); mapCam.lookAt(4, 0, -12);
  // big flat markers that only make sense from above
  const mk = (x, z, c, s = 2.6) => { const m = new THREE.Mesh(new THREE.CircleGeometry(s, 20), glowMat(...c)); m.rotation.x = -Math.PI / 2; m.position.set(x, 3, z); m.layers.set(1); world.add(m); };
  mapCam.layers.enable(1);
  mk(7.5, 0, [0.3, 2.6, 3.4]); mk(5, 16, [4, 0.3, 0.3]); mk(12.5, -32, [1.2, 1.2, 1.2], 2); mk(2.5, -48, [1.2, 1.2, 1.2], 2); mk(9.5, -9, [3.5, 0.6, 0.3], 1.4);

  return {
    cast: [],
    camera: { pos: [7.8, 3.1, 9.6], look: [7, 1.2, -14], fov: 58 },
    bloom: { strength: 0.6, radius: 0.6, threshold: 0.82 },
    envIntensity: 0.15,
    views: [
      { camera: rear, rect: [W / 2 - 240, 20, 480, 150] },
      { camera: mapCam, rect: [W - 236, H - 330, 210, 280] },
    ],
    hud: (host) => {
      const el = hudStyle(host, '#ff4fa3', `
        .sh .hp{position:absolute;left:26px;top:22px;width:300px}
        .sh .spd{position:absolute;left:26px;bottom:26px}
        .sh .spd b{font:700 54px Bahnschrift,sans-serif;color:#fff}
        .sh .heat{position:absolute;left:190px;bottom:36px;width:200px}
        .sh .heat .fill{background:linear-gradient(90deg,#ffb547,#ff4a2a)}
        .sh .mirror{position:absolute;left:50%;top:20px;width:480px;height:150px;transform:translateX(-50%);border:2px solid #ff4fa3aa;border-radius:6px;box-shadow:0 0 18px #ff4fa344}
        .sh .mirror span,.sh .map span{position:absolute;left:8px;top:-18px;font-size:10px;letter-spacing:.25em;color:#ffb3d6}
        .sh .map{position:absolute;right:26px;bottom:50px;width:210px;height:280px;border:2px solid #ffffff55;border-radius:6px}
        .sh .alert{position:absolute;left:50%;top:190px;transform:translateX(-50%);font:700 15px Bahnschrift,sans-serif;letter-spacing:.32em;color:#ff4a4a;text-shadow:0 0 12px #ff4a4aaa}`);
      el.innerHTML = `
        <div class="hp"><div class="lab">CAR INTEGRITY</div><div class="bar"><div class="fill" style="width:62%"></div></div></div>
        <div class="mirror"><span>REAR</span></div>
        <div class="alert">⚠ RAM INCOMING</div>
        <div class="spd"><b>184</b> <span class="lab">KM/H</span></div>
        <div class="heat"><div class="lab">BOOST HEAT</div><div class="bar"><div class="fill" style="width:71%"></div></div></div>
        <div class="map"><span>N3 · SOUTH</span></div>`;
    },
  };
}

/* ====================================================== INTERLUDE II · FALL */

async function bridge({ scene, world }) {
  const moonDir = new THREE.Vector3(-0.4, 0.5, -0.75);
  scene.fog = new THREE.FogExp2(0x0d1426, 0.006);
  world.add(sky({ top: 0x060a1a, horizon: 0x26355a, bottom: 0x05070d, sunDir: moonDir, sunColor: 0xcfe0ff, sunSize: 9000, clouds: 0.5, cloudColor: 0x3a4666 }));
  world.add(new THREE.HemisphereLight(0x7a90c8, 0x10141c, 0.9));
  const moon = new THREE.DirectionalLight(0xb8ccff, 2.2); moon.position.copy(moonDir).multiplyScalar(80); world.add(moon);

  const deckY = 40;
  const conc = pbr('Concrete042C_1K-JPG', { repeat: 6, tint: 0x8a8e96 });
  world.add(box(140, 1.6, 12, conc, 0, deckY - 0.8, 0));
  for (const x of [-30, 30]) world.add(box(4, deckY, 4, conc, x, deckY / 2 - 1.6, 0));
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a9098, metalness: 0.8, roughness: 0.35 });
  for (const z of [-5.8, 5.8]) {
    for (let x = -70; x < 70; x += 2.5) if (!(z > 0 && x > -4 && x < 4)) world.add(box(0.12, 1, 0.12, steel, x, deckY + 0.5, z));
    world.add(box(64, 0.15, 0.15, steel, -36, deckY + 1, z));
    world.add(box(64, 0.15, 0.15, steel, z > 0 ? 36 : 4, deckY + 1, z));
  }
  // broken railing pieces flying
  const r = rng(13);
  for (let i = 0; i < 7; i++) {
    const p = box(0.12, 1, 0.12, steel, -2 + r() * 4, deckY - 1 - r() * 5, 7 + r() * 4);
    p.rotation.set(r() * 3, r() * 3, r() * 3); world.add(p);
  }
  world.add(particles(160, { center: [0, deckY - 3, 8], spread: [6, 6, 5], size: 0.08, color: 0xd8ecff, opacity: 0.85, seed: 3 }));
  for (let i = 0; i < 5; i++) streetlight(world, -50 + i * 25, -5.4, 1, i % 2 === 0, deckY);

  // ravine walls and the river far below
  const rock = pbr('_source/downloads/rock064/Rock064_1K-JPG', { repeat: 8, tint: 0x5a5e6a });
  // cliffs at both ends of the span; the valley stays open behind it
  for (const side of [-1, 1]) {
    const cliff = new THREE.Mesh(new THREE.BoxGeometry(60, 64, 160, 6, 10, 16), rock);
    const pa = cliff.geometry.attributes.position;
    for (let i = 0; i < pa.count; i++) pa.setX(i, pa.getX(i) + Math.sin(pa.getZ(i) * 0.09) * 5 + Math.sin(pa.getY(i) * 0.25 + pa.getZ(i) * 0.05) * 3);
    cliff.geometry.computeVertexNormals();
    cliff.position.set(side * 98, 8, 0); world.add(cliff);
  }
  const river = new THREE.Mesh(new THREE.PlaneGeometry(400, 60), new THREE.MeshStandardMaterial({ color: 0x0c1a2a, roughness: 0.05, metalness: 0.6 }));
  river.rotation.x = -Math.PI / 2; river.position.y = 0; world.add(river);
  const mtn = await model(PACK.rts + 'Mountain_Group_1.gltf', { '*': 0x1a2236 });
  for (let k = 0; k < 8; k++) place(world, mtn, -300 + k * 85, -5, -220 - r() * 80, { s: 60 + r() * 40, ry: r() * 6 });

  // Kai's car going through the barrier, nose down; the Handler's SUV stopped on the deck
  const kai = car({ color: 0x35c9ff, beamLen: 60 }); kai.position.set(0.5, deckY - 3.2, 9.5);
  kai.rotation.order = 'YXZ'; kai.rotation.set(0.95, Math.PI - 0.25, -0.3); // nose-down, through the rail
  world.add(kai);
  const him = car({ color: 0x5a1410, suv: true }); him.position.set(-7, deckY, 2.2); him.rotation.y = -Math.PI / 2 - 0.35; world.add(him);
  world.add(lightShaft(new THREE.Vector3(-4.8, deckY + 0.9, 3.1), new THREE.Vector3(14, deckY - 2, 10), 4, 0xfff0d8, 0.09));
  return {
    cast: [],
    camera: { pos: [6, deckY - 18, 44], look: [0, deckY - 8, 0], fov: 50 },
    bloom: { strength: 0.6, radius: 0.6, threshold: 0.85 },
    envIntensity: 0.15,
  };
}

import { WORLDS } from './worlds.js';

export const STORY = {
  ...WORLDS,
  prologue,
  'metro-hero': metroHero,
  'metro-play': metroPlay,
  gate,
  'highway-hero': highwayHero,
  'highway-play': highwayPlay,
  bridge,
};
