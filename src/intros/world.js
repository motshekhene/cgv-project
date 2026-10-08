import * as THREE from 'three';
import { RU, TINT, loadProp, scatter, pbr, rng } from '../levels/jungle/props.js';
import { createSky } from '../levels/jungle/sky.js';
import { createLightShaft } from '../shaders/lightshaft.js';

/**
 * Set-building helpers shared by the four cutscenes: sky and lights from a
 * palette entry (jungle/palette.js), a ground mesh that follows a height
 * function, the jungle kit loaded in one go, and tree/bush belts either side
 * of a path. Same props.js helpers as Level 3, so everything is matte PBR,
 * merged and instanced.
 */

/** Load a prop, but log and carry on if it's missing: a cutscene shouldn't die over one bush. */
export function safeProp(assets, path, tint) {
  return loadProp(assets, path, tint).catch((e) => {
    console.warn('[intros] prop missing, skipping:', path, e?.message || e);
    return null;
  });
}

export function safePbr(assets, set, opts) {
  return pbr(assets, set, opts).catch((e) => {
    console.warn('[intros] texture set missing:', set, e?.message || e);
    return new THREE.MeshStandardMaterial({ color: opts?.tint ?? 0x777777, roughness: 1 });
  });
}

/** The trees, bushes, grass and rocks every jungle set uses. */
export async function loadJungleKit(assets) {
  const P = (p, t) => safeProp(assets, p, t);
  const [tree1, tree2, tree3, tree4, treeR, bush1, bush2, bushL, grass1, grass2, rock1, rock2, rock3] = await Promise.all([
    P('nature/tree-1.fbx'), P('nature/tree-2.fbx'), P('nature/tree-3.fbx'), P('nature/tree-4.fbx'), P('ruins/tree-1.fbx'),
    P('nature/bush-1.fbx'), P('nature/bush-2.fbx'), P('ruins/bush-large.fbx'),
    P('nature/grass-1.fbx'), P('nature/grass-2.fbx'),
    P('nature/rock-1.fbx', TINT.rock), P('nature/rock-2.fbx', { Rock: 0x737a6a }), P('nature/rock-3.fbx', TINT.rock),
  ]);
  return {
    trees: [tree1, tree2, tree3, tree4, treeR],
    bushes: [bush1, bush2, bushL],
    grass: [grass1, grass2],
    rocks: [rock1, rock2, rock3],
  };
}

/** Per-model scale ranges (assets/jungle/README.md): trees 10-14 m, bushes 1.2-3 m, ankle-high grass. */
const TREE_S = [0.026, 0.026, 0.026, 0.026, 0.03];
const BUSH_S = [0.016, 0.016, RU];

/**
 * Sky dome, fog, hemisphere, sun (with a shadow box you move with follow())
 * and fill light, all from one palette entry.
 */
export function buildSkyAndLights(root, scene, pal, { shadowSize = 26, sunSize = 1400 } = {}) {
  const sky = createSky({ ...pal.sky, sunDir: pal.sunDir, sunSize });
  root.add(sky);
  scene.background = null;
  scene.fog = new THREE.FogExp2(pal.fog, pal.fogDensity);

  const hemi = new THREE.HemisphereLight(pal.hemiSky, pal.hemiGround, pal.hemiIntensity);
  const sun = new THREE.DirectionalLight(pal.sun, pal.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera;
  c.left = c.bottom = -shadowSize;
  c.right = c.top = shadowSize;
  c.near = 1;
  c.far = 200;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  const fill = new THREE.DirectionalLight(pal.fill ?? 0x9fc0ff, pal.fillIntensity ?? 0.3);
  root.add(hemi, sun, sun.target, fill);

  const sunDir = pal.sunDir.clone().normalize();
  const snap = new THREE.Vector3(Infinity, 0, 0);
  return {
    sky, hemi, sun, fill, sunDir,
    /** Keep the shadow box on the action (snapped so static shadows don't crawl) and the sky round the camera. */
    follow(focus, camera, time) {
      const sx = Math.round(focus.x / 4) * 4;
      const sz = Math.round(focus.z / 4) * 4;
      if (sx !== snap.x || sz !== snap.z) {
        snap.set(sx, 0, sz);
        sun.target.position.set(sx, focus.y || 0, sz);
        sun.position.copy(sunDir).multiplyScalar(80).add(sun.target.position);
      }
      fill.position.copy(camera.position).add(new THREE.Vector3(0, 12, 0));
      fill.target.position.copy(focus);
      sky.position.copy(camera.position);
      sky.material.uniforms.uTime.value = time;
    },
  };
}

/** A ground plane whose height follows heightFn(x, z). */
export function buildGround(root, material, { w = 260, d = 260, cx = 0, cz = 0, seg = 130, heightFn = () => 0 } = {}) {
  const g = new THREE.PlaneGeometry(w, d, seg, seg);
  g.rotateX(-Math.PI / 2);
  g.translate(cx, 0, cz);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, heightFn(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const ground = new THREE.Mesh(g, material);
  ground.receiveShadow = true;
  root.add(ground);
  return ground;
}

/**
 * Trees, bushes and grass in a belt around a path. `keep(x, z)` says whether
 * a spot is allowed (return false for the path itself, clearings, buildings).
 * Only trees within shadowDist of one of the `near` points cast shadows.
 */
export function plantJungle(root, kit, { area, keep = () => true, heightFn = () => 0, trees = 200, bushes = 160, grass = 500, rocks = 0, seed = 21, near = null, shadowDist = 22, chunk = 40 }) {
  const r = rng(seed);
  const [x0, x1, z0, z1] = area;
  const pick = () => [x0 + r() * (x1 - x0), z0 + r() * (z1 - z0)];
  // one InstancedMesh per model per `chunk` metres of z, so the camera's frustum and far plane can skip whole stretches
  const scatterChunked = (src, spots, opts) => {
    const byChunk = new Map();
    for (const sp of spots) {
      const k = Math.floor(sp.z / chunk);
      if (!byChunk.has(k)) byChunk.set(k, []);
      byChunk.get(k).push(sp);
    }
    for (const list of byChunk.values()) scatter(root, src, list, opts);
  };

  const treeSpots = kit.trees.map(() => [[], []]);
  for (let k = 0, n = 0; k < trees * 6 && n < trees; k++) {
    const [x, z] = pick();
    if (!keep(x, z, 'tree')) continue;
    const t = Math.floor(r() * kit.trees.length);
    const close = near ? near.some((p) => Math.hypot(x - p.x, z - p.z) < shadowDist) : false;
    treeSpots[t][close ? 1 : 0].push({ x, y: heightFn(x, z) - 0.15, z, s: TREE_S[t] * (0.8 + r() * 0.6), ry: r() * 6.28 });
    n++;
  }
  kit.trees.forEach((src, t) => {
    if (!src) return;
    scatterChunked(src, treeSpots[t][0], { shadow: false });
    scatterChunked(src, treeSpots[t][1], { shadow: true });
  });

  const bushSpots = kit.bushes.map(() => []);
  for (let k = 0, n = 0; k < bushes * 4 && n < bushes; k++) {
    const [x, z] = pick();
    if (!keep(x, z, 'bush')) continue;
    const b = Math.floor(r() * kit.bushes.length);
    bushSpots[b].push({ x, y: heightFn(x, z) - 0.1, z, s: BUSH_S[b] * (0.8 + r() * 0.8), ry: r() * 6.28 });
    n++;
  }
  kit.bushes.forEach((src, b) => src && scatterChunked(src, bushSpots[b], { shadow: false }));

  const grassSpots = kit.grass.map(() => []);
  for (let k = 0, n = 0; k < grass * 4 && n < grass; k++) {
    const [x, z] = pick();
    if (!keep(x, z, 'grass')) continue;
    grassSpots[n % kit.grass.length].push({ x, y: heightFn(x, z) - 0.02, z, s: 0.012 + r() * 0.012, ry: r() * 6.28 });
    n++;
  }
  kit.grass.forEach((src, g) => src && scatterChunked(src, grassSpots[g], {}));

  const rockSpots = kit.rocks.map(() => []);
  for (let k = 0, n = 0; k < rocks * 6 && n < rocks; k++) {
    const [x, z] = pick();
    if (!keep(x, z, 'rock')) continue;
    const i = Math.floor(r() * kit.rocks.length);
    rockSpots[i].push({ x, y: heightFn(x, z) - 0.1, z, s: 0.006 + r() * 0.01, ry: r() * 6.28 });
    n++;
  }
  kit.rocks.forEach((src, i) => src && scatterChunked(src, rockSpots[i], { shadow: true }));
}

/** God-ray cones down `sunDir` onto each ground point. Returns them so the scene can drive uTime. */
export function addShafts(root, sunDir, spots, { color = 0xffd9a0, opacity = 0.13, height = 34 } = {}) {
  const sd = sunDir.clone().normalize();
  return spots.map(([x, z, w], i) => {
    const to = new THREE.Vector3(x, 0, z);
    const s = createLightShaft(to.clone().addScaledVector(sd, height), to, w, color, opacity, i * 1.7);
    root.add(s);
    return s;
  });
}

/** A soft-edged strip of ground texture (a trail, a road): the edges fade into the forest floor. */
export function pathStrip(root, material, { x = 0, z0, z1, width, y = 0.012, soft = 0.22, repeat = [2, 30] }) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 4;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, '#000');
  grad.addColorStop(soft, '#fff');
  grad.addColorStop(1 - soft, '#fff');
  grad.addColorStop(1, '#000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 4);
  const alpha = new THREE.CanvasTexture(c);
  const mat = material.clone();
  for (const k of ['map', 'normalMap', 'roughnessMap']) {
    if (!mat[k]) continue;
    mat[k] = mat[k].clone();
    mat[k].repeat.set(repeat[0], repeat[1]);
    mat[k].needsUpdate = true;
  }
  mat.alphaMap = alpha;
  mat.transparent = true;
  mat.depthWrite = false;
  const len = Math.abs(z1 - z0);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(width, len), mat);
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(x, y, (z0 + z1) / 2);
  strip.receiveShadow = true;
  strip.renderOrder = 1;
  root.add(strip);
  return strip;
}

/** Plain box with shadows, for the bits no pack has (doors, racks, posts, piers). */
export function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}
