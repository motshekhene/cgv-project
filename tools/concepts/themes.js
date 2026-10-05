/**
 * The four Level 3 arena themes from LEVEL3_THEME_REDESIGN.md.
 * Each build() dresses the world and returns fighter spots + camera framings.
 * Convention (matches Level03): the fight runs along z, Kai on +z, Handler on -z,
 * main backdrop on the -z / -x side so both shots see it.
 */
import * as THREE from 'three';
import { model, place, pbr, rng, sky, particles, lightShaft, sign, PACK, NOISE_GLSL } from './scene.js';

const RU = 0.016; // ruins pack is in cm on a 2 m grid → 3.2 m modules next to a 1.8 m fighter
const TILE = 199 * RU;

/* Shared fighter layouts / cameras: hero = 3/4 low cinematic, play = game's own over-shoulder orbit. */
const FIGHTERS = {
  hero: { kai: [0.4, 0, 1.25], handler: [-0.3, 0, -1.05] },
  play: { kai: [1.0, 0, 0.15], handler: [-0.45, 0, -0.65] },
};

function sun(world, dir, color, intensity, { size = 26, mapSize = 4096 } = {}) {
  const l = new THREE.DirectionalLight(color, intensity);
  l.position.copy(dir.clone().normalize().multiplyScalar(60));
  l.castShadow = true;
  l.shadow.mapSize.set(mapSize, mapSize);
  const c = l.shadow.camera;
  c.left = c.bottom = -size; c.right = c.top = size; c.near = 1; c.far = 160;
  l.shadow.bias = -0.0003;
  l.shadow.normalBias = 0.03;
  l.shadow.radius = 3;
  world.add(l, l.target);
  return l;
}

function fill(world, dir, color, intensity) {
  const l = new THREE.DirectionalLight(color, intensity);
  l.position.copy(dir.clone().normalize().multiplyScalar(40));
  world.add(l);
  return l;
}

/* ============================================================ A — SHRINE */

async function shrine({ scene, world, shot }) {
  const sunDir = new THREE.Vector3(-0.62, 0.62, -0.45);
  scene.fog = new THREE.FogExp2(0xd9d2a8, 0.0068);
  world.add(sky({ top: 0x5f9fd8, horizon: 0xf4e2b0, bottom: 0x6f7d4a, sunDir, sunColor: 0xffd59a, sunSize: 1400, clouds: 0.35 }));
  world.add(new THREE.HemisphereLight(0xbfdcff, 0x4a5a26, 0.55));
  sun(world, sunDir, 0xffcf94, 5.2);
  fill(world, new THREE.Vector3(0.7, 0.4, 0.8), 0x9fc0ff, 0.45);

  const moss = { Main: 0x7a7c66, Highlights: 0x908f78, Green: 0x5f9a2e };
  const [floor, floorH, col, colS, arch, wallO, wallA, wallAB, stag, fox, tree1, tree2, tree3, bush, bushL, grassR, stairs, pot, potB] = await Promise.all([
    model(PACK.ruins + 'Floor_Standard.fbx', moss), model(PACK.ruins + 'Floor_Squares.fbx', moss),
    model(PACK.ruins + 'Column_Round.fbx', moss), model(PACK.ruins + 'Column_Round_Short.fbx', moss),
    model(PACK.ruins + 'Arch_Round_RoundColumn.fbx', moss), model(PACK.ruins + 'Wall_Overgrown.fbx', moss),
    model(PACK.ruins + 'Wall_ArchRound_Overgrown.fbx', moss), model(PACK.ruins + 'Wall_ArchRound_Overgrown_Broken.fbx', moss),
    model(PACK.ruins + 'Statue_Stag.fbx', { Stone: 0xa9a892 }), model(PACK.ruins + 'Statue_Fox.fbx', { Stone: 0xa9a892 }),
    model(PACK.nature + 'Tree1.fbx'), model(PACK.nature + 'Tree2.fbx'), model(PACK.ruins + 'Tree_1.fbx'),
    model(PACK.nature + 'Bush1.fbx'), model(PACK.ruins + 'Bush_Large.fbx'), model(PACK.ruins + 'Grass.fbx'),
    model(PACK.ruins + 'Stairs.fbx', moss), model(PACK.ruins + 'Pot1.fbx'), model(PACK.ruins + 'Pot2_Broken.fbx'),
  ]);
  const [rock1, rock2, tree3n, tree4n, grass1, grass2] = await Promise.all([
    model(PACK.nature + 'Rock1.fbx', { Rock: 0x7d8274 }), model(PACK.nature + 'Rock2.fbx', { Rock: 0x737a6a }),
    model(PACK.nature + 'Tree3.fbx'), model(PACK.nature + 'Tree4.fbx'),
    model(PACK.nature + 'Grass1.fbx'), model(PACK.nature + 'Grass2.fbx'),
  ]);

  // forest floor
  const ground = new THREE.Mesh(new THREE.CircleGeometry(220, 64), pbr('Ground040_1K-JPG', { repeat: 70, tint: 0x9fb07a }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.32; ground.receiveShadow = true;
  world.add(ground);

  // the courtyard: a disc of stone tiles, a few missing or heaved up
  const r = rng(11);
  for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
    const x = i * TILE, z = j * TILE, d = Math.hypot(x, z);
    if (d > 12.4) continue;
    if (d > 6 && r() < 0.09) continue;
    const t = place(world, r() < 0.3 ? floorH : floor, x, -0.05 + (d > 8 ? (r() - 0.6) * 0.18 : 0), z,
      { s: RU, ry: Math.floor(r() * 4) * Math.PI / 2, rx: d > 9 ? (r() - 0.5) * 0.06 : 0 });
    t.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  }

  // ring of columns, some snapped short or leaning
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + 0.13;
    const x = Math.cos(a) * 13.6, z = Math.sin(a) * 13.6;
    const broken = k % 3 === 1;
    place(world, broken ? colS : col, x, 0, z, { s: RU * (broken ? 1.25 : 1.1), rz: k === 4 ? 0.14 : 0, rx: k === 8 ? -0.1 : 0 });
  }

  // shrine gate at the back with overgrown walls either side and guardian statues
  place(world, arch, -3, 0, -17, { s: RU * 1.6 });
  for (const [x, piece] of [[-10.2, wallA], [4.2, wallAB], [-16.6, wallO], [10.6, wallO], [-19.8, wallO]]) {
    place(world, piece, x, 0, -17.2, { s: RU * 1.6 });
  }
  place(world, stag, -8.6, 0, -13.6, { s: RU * 0.85, ry: 0.35 });
  place(world, fox, 2.6, 0, -13.8, { s: RU * 1.1, ry: -0.4 });
  place(world, stairs, -3, -0.3, -14.2, { s: RU * 1.6, ry: Math.PI });

  // waterfall cliff behind the gate (signature shader: flowing water)
  for (const [x, y, z, s, ry, src] of [
    [-24, -2, -42, 0.13, 0.4, rock1], [-4, -3, -46, 0.16, 2.1, rock2], [16, -2, -40, 0.12, 1.2, rock1],
    [-38, -2, -32, 0.1, 0.9, rock2], [30, -2, -32, 0.1, 2.7, rock2],
  ]) place(world, src, x, y, z, { s, ry });
  const fall = waterfall(7, 19);
  fall.position.set(-7, 9.2, -33.5);
  world.add(fall);
  const pool = waterSurface(0x2f7f7a, 0x9be0d2);
  pool.geometry = new THREE.CircleGeometry(11, 48);
  pool.rotation.x = -Math.PI / 2; pool.position.set(-7, -0.2, -28);
  world.add(pool);
  world.add(particles(220, { center: [-7, 1.5, -31], spread: [7, 3, 3], size: 0.5, color: 0xffffff, opacity: 0.35, seed: 4, additive: false }));

  // jungle ring
  const trees = [tree1, tree2, tree3n, tree4n, tree3];
  for (let k = 0; k < 70; k++) {
    const a = r() * Math.PI * 2, d = 19 + r() * 40;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (z < -24 && Math.abs(x + 7) < 9) continue; // keep the waterfall visible
    const src = trees[Math.floor(r() * trees.length)];
    place(world, src, x, -0.3, z, { s: (src === tree3 ? 0.03 : 0.028) * (0.8 + r() * 0.6), ry: r() * 6.28, shadow: false });
  }
  for (let k = 0; k < 40; k++) {
    const a = r() * Math.PI * 2, d = 14.5 + r() * 6;
    place(world, r() < 0.5 ? bush : bushL, Math.cos(a) * d, -0.3, Math.sin(a) * d, { s: (r() < 0.5 ? 0.016 : RU) * (0.8 + r() * 0.7), ry: r() * 6.28 });
  }
  for (let k = 0; k < 520; k++) {
    const a = r() * Math.PI * 2, d = 10.5 + r() * 24;
    place(world, [grass1, grass2][k % 2], Math.cos(a) * d, -0.3, Math.sin(a) * d, { s: 0.012 + r() * 0.01, ry: r() * 6.28 });
  }
  place(world, pot, 7.5, 0, -9, { s: RU }); place(world, potB, 8.4, 0, -8.2, { s: RU, ry: 1 });
  place(world, pot, -11, 0, 2, { s: RU * 1.2 });

  // sun shafts through the canopy + floating pollen
  const sd = sunDir.clone().normalize();
  for (const [x, z, w] of [[-4, -6, 2.2], [3, 2, 1.4], [-9, 4, 1.8], [6, -10, 1.6]]) {
    const to = new THREE.Vector3(x, 0, z);
    world.add(lightShaft(to.clone().addScaledVector(sd, 34), to, w, 0xffd9a0, 0.13));
  }
  world.add(particles(500, { center: [0, 3.5, -4], spread: [34, 7, 34], size: 0.07, color: 0xffe2a0, opacity: 0.9, seed: 9 }));

  // the shrine is wired: a laminated sign and a junction box zip-tied to the gate
  const site = sign(['SITE 7', { t: 'NO ENTRY \u00b7 AUTHORISED PERSONNEL', size: 0.6 }], { w: 1.3, h: 0.8, bg: '#e8e2d2', fg: '#a3231c', glow: 1, basic: false });
  site.position.set(-0.4, 1.7, -17.75); site.rotation.y = Math.PI; world.add(site);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 0.2), new THREE.MeshStandardMaterial({ color: 0x5b6266, metalness: 0.6, roughness: 0.4 }));
  box.position.set(-5.6, 1.2, -17.8); world.add(box);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 3, 2.6) }));
  led.position.set(-5.6, 1.35, -17.92); world.add(led);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x15181b }));
  cable.position.set(-5.6, 0.3, -17.85); world.add(cable);
  return {
    fighters: { ...FIGHTERS, wake: { kai: [-4.6, -0.3, -21.2], face: [-3, 0, -15] } },
    cameras: {
      wake: { pos: [-7.4, 0.95, -27], look: [-3.6, 2.4, -14.5], fov: 48 },
      hero: { pos: [3.7, 1.15, 4.1], look: [-1.4, 2.0, -3.2], fov: 44 },
      play: { pos: [2.3, 2.35, 3.9], look: [-0.9, 1.25, -2.2], fov: 50 },
    },
  };
}

export function waterfall(w, h) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: NOISE_GLSL + `
      uniform float time; varying vec2 vUv;
      void main(){
        float streak = fbm(vec2(vUv.x * 14., vUv.y * 2.2 + time * 2.4));
        float foam = smoothstep(.45, .8, streak);
        vec3 c = mix(vec3(.32,.62,.66), vec3(.95,1.,1.), foam);
        float edge = smoothstep(0., .14, vUv.x) * smoothstep(1., .86, vUv.x);
        float a = edge * (.72 + foam * .28) * smoothstep(0., .05, vUv.y);
        c += smoothstep(.12, 0., vUv.y) * .5;
        gl_FragColor = vec4(c, a);
      }`,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

function waterSurface(deep, shallow) {
  return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({
    color: deep, roughness: 0.08, metalness: 0.1, emissive: shallow, emissiveIntensity: 0.08,
    transparent: true, opacity: 0.92,
  }));
}

/* ======================================================== B — MONASTERY */

async function monastery({ scene, world, shot }) {
  const sunDir = new THREE.Vector3(0.55, 0.62, -0.5);
  scene.fog = new THREE.FogExp2(0xd5e0ea, 0.0026);
  world.add(sky({ top: 0x3f74b8, horizon: 0xe3ebf2, bottom: 0xb9c6d4, sunDir, sunColor: 0xfff1dc, sunSize: 2000, clouds: 0.55 }));
  world.add(new THREE.HemisphereLight(0xd8e8ff, 0x5d6170, 0.7));
  sun(world, sunDir, 0xfff0dc, 3.6, { size: 30 });
  fill(world, new THREE.Vector3(-0.6, 0.3, 0.8), 0xaac4ff, 0.6);

  const stone = { Main: 0x9c988e, Highlights: 0xb3afa4, Green: 0x7f8f6a };
  const [floorD, wallG, archG, doorsG, flagG, colSq, rail, railC, torch, stairs, mtn1, mtn2, mtnL, pines, temple, tower, flagW] = await Promise.all([
    model(PACK.ruins + 'Floor_Diamond.fbx', stone), model(PACK.ruins + 'Wall_ArchGothic.fbx', stone),
    model(PACK.ruins + 'Arch_Gothic_RoundColumn.fbx', stone), model(PACK.ruins + 'Doors_GothicArch.fbx', stone),
    model(PACK.ruins + 'Flag_GothicArch.fbx', { Flag: 0xa3262a }), model(PACK.ruins + 'Column_Square.fbx', stone),
    model(PACK.ruins + 'Rail_Straight.fbx', stone), model(PACK.ruins + 'Rail_Corner.fbx', stone),
    model(PACK.ruins + 'Torch.fbx'), model(PACK.ruins + 'Stairs.fbx', stone),
    model(PACK.rts + 'Mountain_Group_1.gltf'), model(PACK.rts + 'Mountain_Group_2.gltf'), model(PACK.rts + 'MountainLarge_Single.gltf'),
    model(PACK.rts + 'Resource_PineTree_Group.gltf'), model(PACK.rts + 'Temple_SecondAge_Level3.gltf'),
    model(PACK.rts + 'WatchTower_SecondAge_Level3.gltf'), model(PACK.ruins + 'Flag_Wall.fbx', { Flag: 0xc9a227 }),
  ]);
  const [rockA, rockB] = await Promise.all([
    model(PACK.nature + 'Rock1.fbx', { Rock: 0x80848c }), model(PACK.nature + 'Rock3.fbx', { Rock: 0x8a8d94 }),
  ]);

  // terrace: diamond-tiled stone, cliff edge on -x (overlooking the valley)
  const r = rng(5);
  for (let i = -3; i <= 4; i++) for (let j = -4; j <= 3; j++) {
    const t = place(world, floorD, i * TILE, -0.05, j * TILE, { s: RU });
    t.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  }
  // balustrade along the cliff edge and the front
  for (let j = -4; j <= 3; j++) place(world, rail, -3.5 * TILE, 0, j * TILE, { s: RU, ry: Math.PI / 2 });
  for (let i = -3; i <= 0; i++) place(world, rail, i * TILE, 0, 3.5 * TILE, { s: RU });
  place(world, railC, -3.5 * TILE, 0, 3.5 * TILE, { s: RU });

  // cliff the terrace sits on
  const cliff = pbr('_source/downloads/rock064/Rock064_1K-JPG', { repeat: 6, tint: 0xa9adb8 });
  const base = new THREE.Mesh(craggy(26, 80, 9, 3), cliff);
  base.position.set(3, -40.3, -2);
  base.receiveShadow = base.castShadow = true;
  world.add(base);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    place(world, k % 2 ? rockA : rockB, 3 + Math.cos(a) * 22, -14 - r() * 20, -2 + Math.sin(a) * 22, { s: 0.09 + r() * 0.06, ry: r() * 6 });
  }

  // monastery façade at the back: gothic arcade, doors, banners, torches
  const zb = -4.5 * TILE;
  for (let i = -3; i <= 4; i++) {
    const x = i * TILE;
    const piece = i === 1 ? doorsG : wallG;
    place(world, piece, x, 0, zb, { s: RU });
    place(world, wallG, x, 3.18, zb, { s: RU });
    if (i % 2 === 0 && i !== 1) place(world, flagG, x, 0, zb + 0.35, { s: RU });
  }
  for (const x of [-2.5 * TILE, 4.5 * TILE]) place(world, colSq, x, 0, zb + 0.4, { s: RU * 1.7 });
  for (const x of [-0.5, 2.5]) place(world, torch, x * TILE, 2.1, zb + 0.4, { s: RU });
  for (const x of [-0.5, 2.5]) {
    const l = new THREE.PointLight(0xff9a4a, 12, 9, 2);
    l.position.set(x * TILE, 2.6, zb + 1.2);
    world.add(l);
  }
  // upper monastery buildings + towers on the rock behind
  place(world, temple, 5, 0, -25, { s: 11, ry: Math.PI });
  place(world, tower, -7, 0, -21, { s: 13 });
  place(world, tower, 17, 0, -19, { s: 11 });
  place(world, stairs, 9.5, 0, zb + 1.4, { s: RU * 1.2, ry: Math.PI });

  // prayer-flag lines across the terrace corner
  world.add(prayerFlags(new THREE.Vector3(-11, 5.6, -10), new THREE.Vector3(-11, 4.8, 9), 22, r));
  world.add(prayerFlags(new THREE.Vector3(-11, 5.6, -10), new THREE.Vector3(5, 7.8, -13.4), 18, r));

  // distant ranges
  const snow = { Snow: 0xf4f7fb, Stone: 0x8c94a3, Dirt: 0x6e7a6a };
  for (let k = 0; k < 16; k++) {
    const a = Math.PI * 0.35 + (k / 16) * Math.PI * 1.6, d = 120 + r() * 120;
    place(world, [mtn1, mtn2, mtnL][k % 3], Math.cos(a) * d, -95, Math.sin(a) * d, { s: 42 + r() * 40, ry: r() * 6.28 });
  }
  const valley = new THREE.Mesh(new THREE.CircleGeometry(1400, 48), new THREE.MeshStandardMaterial({ color: 0x5f7356, roughness: 1 }));
  valley.rotation.x = -Math.PI / 2; valley.position.y = -95;
  world.add(valley);
  for (let k = 0; k < 40; k++) {
    const a = Math.PI * 0.4 + r() * Math.PI * 1.4, d = 60 + r() * 150;
    place(world, pines, Math.cos(a) * d, -95, Math.sin(a) * d, { s: 22 + r() * 14, ry: r() * 6 });
  }
  void snow;

  // signature shader: drifting mist banks below and around the terrace
  for (const [y, s, o] of [[-12, 380, 0.75], [-26, 520, 0.9], [-45, 700, 1]]) {
    const m = mist(o);
    m.scale.setScalar(s); m.position.set(0, y, 0);
    world.add(m);
  }
  world.add(particles(500, { center: [0, 6, 0], spread: [44, 14, 44], size: 0.07, color: 0xffffff, opacity: 0.85, seed: 3, additive: false }));

  if (shot === 'wake') {
    const pass = sign(['PASS CLOSED', { t: 'NO SERVICE BEYOND THIS POINT', size: 0.6 }], { w: 1.8, h: 0.9, bg: '#f2c12e', fg: '#16130c', glow: 1, basic: false });
    pass.position.set(-1.6, 1.6, 6.3); world.add(pass);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0x3c3c40 }));
    post.position.set(-1.6, 0.8, 6.25); world.add(post);
  }
  return {
    fighters: { ...FIGHTERS, wake: { kai: [-4, 0, 10.1], face: [-1, 0, -14] } },
    cameras: {
      wake: { pos: [-2.7, 1.05, 13.3], look: [-1, 2.8, -14], fov: 46 },
      hero: { pos: [5.6, 1.7, 5.0], look: [-4.5, 2.2, -2.6], fov: 44 },
      play: { pos: [2.3, 2.35, 3.9], look: [-0.9, 1.25, -2.2], fov: 50 },
    },
  };
}

export function craggy(radius, height, seed, radialSegs = 9) {
  const g = new THREE.CylinderGeometry(radius * 0.92, radius * 1.15, height, radialSegs, 6);
  const p = g.attributes.position, r = rng(seed);
  const jitter = Array.from({ length: 200 }, () => r());
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x), k = Math.floor(((a + Math.PI) / (Math.PI * 2)) * radialSegs) % radialSegs;
    const top = y > height / 2 - 0.01;
    const n = 1 + (jitter[Math.abs(k * 7 + Math.round(y)) % 200] - 0.5) * (top ? 0.12 : 0.3);
    p.setXYZ(i, x * n, top ? y : y + (jitter[(k * 3) % 200] - 0.5) * 2, z * n);
  }
  g.computeVertexNormals();
  return g;
}

export function prayerFlags(a, b, n, r) {
  const g = new THREE.Group();
  const colors = [0x2f6fd8, 0xf2f2f2, 0xd8352f, 0x2fa65a, 0xf2c12e];
  const line = new THREE.CatmullRomCurve3([a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -1.1, 0)), b]);
  const pts = line.getPoints(40);
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x3a3430 })));
  for (let i = 1; i < n; i++) {
    const p = line.getPoint(i / n);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.55), new THREE.MeshStandardMaterial({ color: colors[i % 5], side: THREE.DoubleSide, roughness: 0.9 }));
    f.position.copy(p).add(new THREE.Vector3(0, -0.3, 0));
    f.lookAt(p.clone().add(new THREE.Vector3(1, 0, 0.2)));
    f.rotation.z += (r() - 0.5) * 0.25;
    f.castShadow = true;
    g.add(f);
  }
  for (const p of [a, b]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, p.y + 0.3, 6), new THREE.MeshStandardMaterial({ color: 0x5a4632 }));
    pole.position.set(p.x, p.y / 2, p.z); pole.castShadow = true;
    g.add(pole);
  }
  return g;
}

export function mist(opacity) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { time: { value: 0 }, opacity: { value: opacity } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: NOISE_GLSL + `
      uniform float time, opacity; varying vec2 vUv;
      void main(){
        vec2 p = vUv * 9. + vec2(time * .05, time * .02);
        float n = fbm(p + fbm(p * .6));
        float a = smoothstep(.35, .75, n) * opacity * smoothstep(.5, .25, length(vUv - .5));
        gl_FragColor = vec4(vec3(.95,.97,1.), a);
      }`,
  }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

/* =========================================================== C — DESERT */

async function desert({ scene, world, shot }) {
  const sunDir = new THREE.Vector3(-0.78, 0.3, 0.3);
  scene.fog = new THREE.FogExp2(0xf0cfa0, 0.0062);
  world.add(sky({ top: 0x3a76c4, horizon: 0xf6d6a6, bottom: 0xd8a674, sunDir, sunColor: 0xffc27a, sunSize: 1200, clouds: 0.18 }));
  world.add(new THREE.HemisphereLight(0xa9cbef, 0xc78b55, 1.15));
  sun(world, sunDir, 0xffc488, 3.8, { size: 32 });
  fill(world, new THREE.Vector3(0.6, 0.35, -0.5), 0x9fc3ff, 0.45);

  const sandstone = { '*': 0xc98a5a };
  const bleached = { '*': 0xd8c7a8 };
  const [crate, crates, barrel, deadT1, deadT2, cart, skull, pot, mtn, rockG, rocks] = await Promise.all([
    model(PACK.rts + 'Crate.gltf'), model(PACK.rts + 'Crate_Stack2.gltf'), model(PACK.rts + 'Barrel.gltf'),
    model(PACK.ruins + 'DeadTree_1.fbx', bleached), model(PACK.ruins + 'DeadTree_3.fbx', bleached),
    model(PACK.ruins + 'Cart.fbx'), model(PACK.ruins + 'Skull.fbx'), model(PACK.ruins + 'Pot3_Broken.fbx', { '*': 0xb87a52 }),
    model(PACK.rts + 'Mountain_Group_2.gltf', sandstone), model(PACK.rts + 'Rock_Group.gltf', sandstone), model(PACK.rts + 'Resource_Rock_2.gltf', sandstone),
  ]);
  const r = rng(21);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(600, 64), pbr('Ground051_1K-JPG', { repeat: 160, tint: 0xf2c79a }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  world.add(ground);

  // fighting pad: old cracked concrete slab of the relay compound
  const pad = new THREE.Mesh(new THREE.BoxGeometry(17, 0.25, 17), pbr('Concrete042C_1K-JPG', { repeat: 4, tint: 0xe2c9a8 }));
  pad.position.y = 0.06; pad.receiveShadow = true;
  world.add(pad);

  // canyon: layered sandstone mesas, open toward -z where the relay station sits
  const sand = pbr('_source/downloads/rock029/Rock029_1K-JPG', { repeat: 3, tint: 0xf0b98a });
  for (let k = 0; k < 22; k++) {
    const a = (k / 22) * Math.PI * 2 + r() * 0.1;
    const d = 44 + r() * 34;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = 18 + r() * 26;
    const mesa = new THREE.Mesh(craggy(9 + r() * 9, h, k + 3, 7), sand);
    mesa.position.set(x, h / 2 - 0.5, z);
    mesa.castShadow = mesa.receiveShadow = true;
    world.add(mesa);
  }
  for (let k = 0; k < 8; k++) {
    const a = r() * Math.PI * 2, d = 100 + r() * 120;
    place(world, mtn, Math.cos(a) * d, -1, Math.sin(a) * d, { s: 30 + r() * 20, ry: r() * 6 });
  }
  for (let k = 0; k < 18; k++) {
    const a = r() * Math.PI * 2, d = 11 + r() * 24;
    place(world, k % 2 ? rockG : rocks, Math.cos(a) * d, 0, Math.sin(a) * d, { s: 5 + r() * 6, ry: r() * 6 });
  }

  // relay station (where the hidden server room is)
  const station = relayStation(r);
  station.position.set(-9, 0, -16);
  station.rotation.y = 0.35;
  world.add(station);

  // set dressing around the pad
  for (const [x, z, src, s, ry] of [
    [7.5, -6, crates, 11, 0.3], [9, -3.5, crate, 14, 1.0], [8.2, 5, barrel, 17, 0], [9.2, 4.2, barrel, 17, 0],
    [-8.4, 6.5, crate, 18, 0.6], [-9.6, 4.8, barrel, 17, 0], [5, -10, cart, RU, 2.2], [-3, -9.6, skull, RU * 0.6, 0.4],
    [11, 9, deadT1, RU * 1.3, 0.6], [-13, -2, deadT2, RU * 1.4, 2.2], [6.5, 7.5, pot, RU, 1.4],
  ]) place(world, src, x, 0.18, z, { s, ry });
  for (const [x, z, h] of [[-12, 9, 3.2], [12.5, -4, 2.6], [-6, 12, 2.2], [15, 10, 3.6]]) world.add(cactus(x, z, h, r));

  // power line strung off into the canyon
  const poles = [[-14, -9], [-28, -2], [-44, 4], [-62, 8]].map(([x, z]) => new THREE.Vector3(x, 0, z));
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4231, roughness: 0.95 });
  for (const p of poles) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 8, 6), wood);
    pole.position.set(p.x, 4, p.z); pole.castShadow = true; world.add(pole);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 0.14), wood);
    bar.position.set(p.x, 7.6, p.z); bar.rotation.y = 0.4; world.add(bar);
  }
  for (let i = 0; i < poles.length - 1; i++) {
    const a = poles[i].clone().setY(7.7), b = poles[i + 1].clone().setY(7.7);
    const c = new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).setY(6.4), b);
    world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(c.getPoints(20)), new THREE.LineBasicMaterial({ color: 0x1d1712 })));
  }

  // signature shader stand-in for stills: heat-haze dust layer + drifting grit
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: NOISE_GLSL + `varying vec2 vUv; void main(){
      float n = fbm(vUv * vec2(18., 3.));
      float a = smoothstep(.0, .5, vUv.y) * smoothstep(1., .4, vUv.y) * (.25 + n * .3);
      gl_FragColor = vec4(vec3(1., .86, .66), a * .55); }`,
  }));
  haze.scale.set(500, 14, 1); haze.position.set(-60, 5, -120); haze.lookAt(0, 5, 0);
  world.add(haze);
  world.add(particles(420, { center: [0, 2, 0], spread: [40, 4, 40], size: 0.06, color: 0xf5d1a2, opacity: 0.7, seed: 12, additive: false }));

  if (shot === 'wake') {
    // the canyon river that carried him here from the bridge
    const river = new THREE.Mesh(new THREE.PlaneGeometry(160, 5), new THREE.MeshStandardMaterial({ color: 0x3f5a63, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.94 }));
    river.rotation.x = -Math.PI / 2; river.position.set(0, 0.03, 19.5); world.add(river);
    const relay = sign(['RELAY 7', { t: 'DECOMMISSIONED \u00b7 DO NOT ENTER', size: 0.6 }], { w: 1.6, h: 0.9, bg: '#d9d2c3', fg: '#a3231c', glow: 1, basic: false });
    relay.position.set(7, 1.5, 7); relay.rotation.y = 0.7; world.add(relay);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), new THREE.MeshStandardMaterial({ color: 0x4a3c30 }));
    post.position.set(7, 0.75, 6.96); world.add(post);
  }
  return {
    fighters: { ...FIGHTERS, wake: { kai: [13, 0, 15], face: [-9, 0, -16] } },
    cameras: {
      wake: { pos: [15.4, 1.0, 19.2], look: [-5, 4, -14], fov: 46 },
      hero: { pos: [6.2, 1.2, 5.4], look: [-2.2, 2.6, -4], fov: 42 },
      play: { pos: [2.3, 2.35, 3.9], look: [-0.9, 1.25, -2.2], fov: 50 },
    },
  };
}

function relayStation(r) {
  const g = new THREE.Group();
  const metal = pbr('Metal022_1K-JPG', { repeat: 2, tint: 0xe0d2bd });
  const rust = pbr('Metal022_1K-JPG', { repeat: 2, tint: 0xb89a80 });
  // shed
  const shed = new THREE.Mesh(new THREE.BoxGeometry(8, 4.2, 6), metal);
  shed.position.y = 2.1; shed.castShadow = shed.receiveShadow = true; g.add(shed);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.25, 6.8), rust);
  roof.position.y = 4.3; roof.rotation.z = 0.05; roof.castShadow = true; g.add(roof);
  // open door with the glowing server rack inside
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 3), new THREE.MeshBasicMaterial({ color: 0x07090c }));
  door.position.set(1.4, 1.5, 3.01); g.add(door);
  const rack = new THREE.Group();
  for (let i = 0; i < 18; i++) {
    const led = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.05), new THREE.MeshBasicMaterial({ color: i % 4 ? new THREE.Color(0.2, 2.6, 2.2) : new THREE.Color(2.8, 0.6, 0.3) }));
    led.position.set(1.0 + (i % 3) * 0.32, 0.6 + Math.floor(i / 3) * 0.38, 3.02);
    rack.add(led);
  }
  g.add(rack);
  const glow = new THREE.PointLight(0x4ff0d8, 6, 6, 2); glow.position.set(1.4, 1.6, 3.6); g.add(glow);
  // satellite dish
  const dish = new THREE.Mesh(new THREE.SphereGeometry(2.6, 28, 12, 0, Math.PI * 2, 0, 0.75), new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }));
  dish.position.set(-2.5, 6.2, 0); dish.rotation.set(-0.9, 0.6, 0); dish.castShadow = true; g.add(dish);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 2.4, 8), rust);
  stem.position.set(-2.5, 5, 0); g.add(stem);
  // lattice antenna tower with red/white bands and a beacon
  const tower = new THREE.Group();
  const H = 22, legs = [[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]];
  for (let s = 0; s < 11; s++) {
    const y0 = s * 2, k0 = 1 - y0 / H * 0.7, k1 = 1 - (y0 + 2) / H * 0.7;
    const mat = new THREE.MeshStandardMaterial({ color: s % 2 ? 0xd23a2a : 0xf1ece4, roughness: 0.6, metalness: 0.4 });
    for (let l = 0; l < 4; l++) {
      const a = new THREE.Vector3(legs[l][0] * k0, y0, legs[l][1] * k0), b = new THREE.Vector3(legs[l][0] * k1, y0 + 2, legs[l][1] * k1);
      const n = legs[(l + 1) % 4], c = new THREE.Vector3(n[0] * k1, y0 + 2, n[1] * k1);
      for (const [p, q] of [[a, b], [a, c]]) {
        const len = p.distanceTo(q);
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 4), mat);
        bar.position.copy(p).lerp(q, 0.5);
        bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), q.clone().sub(p).normalize());
        bar.castShadow = true;
        tower.add(bar);
      }
    }
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.4, 0.2) }));
  beacon.position.y = H + 0.2; tower.add(beacon);
  tower.position.set(5.5, 0, -2.5);
  g.add(tower);
  void r;
  return g;
}

export function cactus(x, z, h, r) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x5f8a45, roughness: 0.8 });
  const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, h, 4, 8), mat);
  trunk.position.y = h / 2 + 0.3; trunk.castShadow = true; g.add(trunk);
  for (const side of [-1, 1]) {
    if (r() < 0.25) continue;
    const ah = h * (0.3 + r() * 0.25), ay = h * (0.35 + r() * 0.3);
    const elbow = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.6, 4, 8), mat);
    elbow.rotation.z = Math.PI / 2; elbow.position.set(side * 0.55, ay, 0); elbow.castShadow = true; g.add(elbow);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, ah, 4, 8), mat);
    arm.position.set(side * 0.9, ay + ah / 2, 0); arm.castShadow = true; g.add(arm);
  }
  g.position.set(x, 0, z);
  g.rotation.y = r() * 6;
  return g;
}

/* ============================================================ D — COAST */

async function coast({ scene, world, shot }) {
  const sunDir = new THREE.Vector3(-0.62, 0.085, -0.78);
  scene.fog = new THREE.FogExp2(0xd99a86, 0.0026);
  world.add(sky({ top: 0x25335e, horizon: 0xf6a774, bottom: 0x1d2c44, sunDir, sunColor: 0xffb26b, sunSize: 2600, clouds: 0.65, cloudColor: 0x8a6d86 }));
  world.add(new THREE.HemisphereLight(0xb0b4ec, 0x4a3a40, 1.25));
  sun(world, sunDir, 0xffa66a, 2.9, { size: 28 });
  fill(world, new THREE.Vector3(0.5, 0.45, 0.8), 0xffc6b0, 1.5);

  const [rock1, rock2, rock3, grass1, grass2, tower, port, rockG] = await Promise.all([
    model(PACK.nature + 'Rock1.fbx', { Rock: 0x55565e }), model(PACK.nature + 'Rock2.fbx', { Rock: 0x4c4d55 }),
    model(PACK.nature + 'Rock3.fbx', { Rock: 0x5d5c62 }),
    model(PACK.nature + 'Grass1.fbx', { '*': 0x8f9a52 }), model(PACK.nature + 'Grass2.fbx', { '*': 0x9aa258 }),
    model(PACK.rts + 'WatchTower_SecondAge_Level1.gltf'), model(PACK.rts + 'Port_SecondAge_Level2.gltf'),
    model(PACK.rts + 'Rock_Group.gltf', { Stone: 0x4f5058 }),
  ]);
  const r = rng(31);
  const CX = 1.5, CZ = 7; // shelf centre: puts the fight ~8 m from the seaward (-z) drop

  // the rock shelf: a craggy column rising out of the sea
  const rock = pbr('_source/downloads/rock064/Rock064_1K-JPG', { repeat: 5, tint: 0x9c9aa4 });
  const shelf = new THREE.Mesh(craggy(15, 60, 17, 11), rock);
  shelf.position.set(CX, -30.05, CZ); shelf.castShadow = shelf.receiveShadow = true;
  world.add(shelf);
  const top = new THREE.Mesh(new THREE.CircleGeometry(15.5, 40), pbr('_source/downloads/rock064/Rock064_1K-JPG', { repeat: 7, tint: 0x9a9298, normalScale: 0.6, roughMap: false }));
  top.rotation.x = -Math.PI / 2; top.position.set(CX, 0.0, CZ); top.receiveShadow = true;
  world.add(top);
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2 + r() * 0.2;
    place(world, [rock1, rock2, rock3][k % 3], CX + Math.cos(a) * 16.5, -31.5 - r() * 2, CZ + Math.sin(a) * 16.5, { s: 0.05 + r() * 0.03, ry: r() * 6 });
  }
  for (let k = 0; k < 8; k++) {
    const a = r() * Math.PI * 2, d = 10 + r() * 4;
    place(world, [rock1, rock3][k % 2], CX + Math.cos(a) * d, -0.2, CZ + Math.sin(a) * d, { s: 0.003 + r() * 0.004, ry: r() * 6 });
  }
  for (let k = 0; k < 90; k++) {
    const a = r() * Math.PI * 2, d = 7 + r() * 8;
    place(world, k % 2 ? grass1 : grass2, CX + Math.cos(a) * d, 0, CZ + Math.sin(a) * d, { s: 0.01 + r() * 0.008, ry: r() * 6 });
  }

  // cliff bunker with the uplink (server room glow in the slit)
  const bunker = coastBunker();
  bunker.position.set(-8.5, 0, 3.5); bunker.rotation.y = 1.25;
  world.add(bunker);
  // rusted railing posts along the edge, a few missing
  const rail = new THREE.MeshStandardMaterial({ color: 0x6b4a36, roughness: 0.7, metalness: 0.5 });
  for (let k = 0; k < 26; k++) {
    if (k % 7 === 3) continue;
    const a = -Math.PI * 0.95 + (k / 26) * Math.PI * 0.9, d = 14.2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), rail);
    post.position.set(CX + Math.cos(a) * d, 0.55, CZ + Math.sin(a) * d); post.castShadow = true;
    world.add(post);
  }

  // sea stacks, a distant headland with a lighthouse, a small harbour
  for (let k = 0; k < 12; k++) {
    const a = -Math.PI * 0.95 + r() * Math.PI * 0.9, d = 120 + r() * 200;
    const s = 0.05 + r() * 0.06;
    place(world, [rock1, rock2, rock3][k % 3], Math.cos(a) * d, -31, Math.sin(a) * d, { s, sy: s * (1.2 + r() * 0.8), ry: r() * 6 });
  }
  const head = new THREE.Mesh(craggy(40, 70, 41, 9), rock);
  head.position.set(-150, -38, -230); world.add(head);
  place(world, tower, -150, -3, -230, { s: 18 });
  const beam = new THREE.PointLight(0xfff0c8, 400, 60, 2); beam.position.set(-150, 12, -228); world.add(beam);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5, 3.5) }));
  lamp.position.set(-150, 11.5, -230); world.add(lamp);
  place(world, port, 70, -30.4, -110, { s: 16, ry: 2.4 });
  place(world, rockG, 40, -30.5, -60, { s: 30, ry: 1 });

  // signature shader: the ocean
  const ocean = oceanSurface(sunDir);
  ocean.position.y = -30;
  world.add(ocean);

  // gulls + sea spray
  for (let k = 0; k < 9; k++) world.add(gull(new THREE.Vector3(-30 + r() * 40, 8 + r() * 14, -30 - r() * 50), 0.6 + r() * 0.5, r));
  world.add(particles(300, { center: [CX, 2.5, CZ], spread: [34, 6, 34], size: 0.06, color: 0xffd7c0, opacity: 0.6, seed: 15 }));

  if (shot === 'wake') {
    // the strip of shingle under the cliff where the sea drops him
    const beach = new THREE.Mesh(new THREE.CircleGeometry(9, 32), pbr('Ground051_1K-JPG', { repeat: 6, tint: 0x7a7068 }));
    beach.rotation.x = -Math.PI / 2; beach.position.set(-3, -29.75, -27); beach.receiveShadow = true; world.add(beach);
    const st = sign(['STATION 7', { t: 'RESTRICTED \u00b7 KEEP OUT', size: 0.6 }], { w: 1.5, h: 0.85, bg: '#e6e1d8', fg: '#a3231c', glow: 1, basic: false });
    st.position.set(0.4, -28.3, -24.5); st.rotation.y = Math.PI + 0.5; world.add(st);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0x4a3a32 }));
    post.position.set(0.42, -28.95, -24.47); world.add(post);
  }
  return {
    fighters: { ...FIGHTERS, wake: { kai: [-3, -29.7, -27], face: [1.5, -29.7, 7] } },
    bloom: { strength: 0.3, radius: 0.5, threshold: 0.95 },
    cameras: {
      wake: { pos: [-6.2, -28.4, -34.5], look: [0, -17, 0], fov: 50 },
      hero: { pos: [4.6, 3.0, 7.2], look: [-2.6, 0.5, -9], fov: 44 },
      play: { pos: [2.3, 2.35, 3.9], look: [-0.9, 1.25, -2.2], fov: 50 },
    },
  };
}

function coastBunker() {
  const g = new THREE.Group();
  const conc = pbr('Concrete042C_1K-JPG', { repeat: 2, tint: 0xb9b3ad });
  const body = new THREE.Mesh(new THREE.BoxGeometry(7, 3.2, 5.5), conc);
  body.position.y = 1.5; body.castShadow = body.receiveShadow = true; g.add(body);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.5, 6.3), conc);
  lid.position.y = 3.3; lid.castShadow = true; g.add(lid);
  const slit = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 0.35), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 1.5, 1.3) }));
  slit.position.set(0, 2.3, 2.76); g.add(slit);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.2), pbr('Metal022_1K-JPG', { tint: 0x8a7468 }));
  door.position.set(2.4, 1.1, 2.77); g.add(door);
  const glow = new THREE.PointLight(0x4ff0d8, 4, 6, 2); glow.position.set(0, 2.3, 3.4); g.add(glow);
  const dstem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.4, 8), new THREE.MeshStandardMaterial({ color: 0x55555c, metalness: 0.5, roughness: 0.5 }));
  dstem.position.set(1.8, 4.1, -1); g.add(dstem);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 7, 6), new THREE.MeshStandardMaterial({ color: 0x3a3a40, metalness: 0.6, roughness: 0.4 }));
  mast.position.set(-2.4, 6.8, -1.5); mast.castShadow = true; g.add(mast);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.5, 0.3) }));
  tip.position.set(-2.4, 10.4, -1.5); g.add(tip);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 8, 0, Math.PI * 2, 0, 0.8), new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }));
  dish.position.set(1.8, 4.6, -1); dish.rotation.set(-1.0, 0.4, 0); dish.castShadow = true; g.add(dish);
  return g;
}

function gull(at, s, r) {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: 0x1e1a22, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.16), m);
    w.position.x = side * 0.42; w.rotation.z = side * (0.25 + r() * 0.2);
    g.add(w);
  }
  g.position.copy(at); g.scale.setScalar(s); g.rotation.y = r() * 0.6 - 0.3;
  return g;
}

export function oceanSurface(sunDir) {
  const mat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: {
      time: { value: 4.2 }, sunDir: { value: sunDir.clone().normalize() },
      deep: { value: new THREE.Color(0x0d2a46) }, shallow: { value: new THREE.Color(0x2a6a7a) },
      skyTop: { value: new THREE.Color(0x3a4a7c) }, skyHorizon: { value: new THREE.Color(0xf6a774) },
      sunColor: { value: new THREE.Color(0xffc48a) },
    },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: NOISE_GLSL + `
      uniform float time; uniform vec3 sunDir, deep, shallow, skyTop, skyHorizon, sunColor; varying vec3 vW;
      vec2 wave(vec2 p, vec2 d, float f, float a, float s){ float ph = dot(p, d) * f + time * s; return d * cos(ph) * f * a; }
      void main(){
        vec2 p = vW.xz;
        vec2 g = wave(p, normalize(vec2(1.,.3)), .08, .9, 1.1) + wave(p, normalize(vec2(-.4,1.)), .17, .4, 1.6)
               + wave(p, normalize(vec2(.7,-.8)), .43, .14, 2.3) + wave(p, normalize(vec2(-.9,-.2)), 1.1, .05, 3.1);
        g += (vec2(fbm(p * .35 + time * .2), fbm(p * .35 - time * .17)) - .5) * .35;
        vec3 n = normalize(vec3(-g.x, 1., -g.y));
        vec3 V = normalize(cameraPosition - vW);
        float dist = length(cameraPosition - vW);
        n = normalize(mix(n, vec3(0,1,0), clamp(dist / 900., 0., .85)));
        float fres = .02 + .98 * pow(1. - max(dot(n, V), 0.), 5.);
        vec3 R = reflect(-V, n);
        vec3 skyc = mix(skyHorizon, skyTop, pow(clamp(R.y, 0., 1.), .45));
        float sd = max(dot(R, sunDir), 0.);
        vec3 spec = sunColor * (pow(sd, 600.) * 9. + pow(sd, 60.) * .5);
        vec3 body = mix(deep, shallow, clamp(g.x * .6 + .35, 0., 1.) * .5);
        vec3 c = mix(body, skyc, fres) + spec;
        float foam = smoothstep(.62, .8, fbm(p * .9 + time * .3)) * clamp(1. - dist / 160., 0., 1.) * .5;
        c = mix(c, vec3(.92,.88,.86), foam);
        c = mix(c, skyHorizon * 1.05, smoothstep(250., 2600., dist));
        gl_FragColor = vec4(c, 1.);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000, 1, 1), mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}

export const THEMES = {
  shrine: { build: shrine, envIntensity: 0.35 },
  monastery: { build: monastery, envIntensity: 0.45 },
  desert: { build: desert, envIntensity: 0.3 },
  coast: { build: coast, envIntensity: 0.25, bloom: { strength: 0.3, radius: 0.5, threshold: 0.95 } },
};
