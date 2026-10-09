import * as THREE from 'three';

/**
 * JungleRoadside — Member 2B world (built on the shared Level 1 jungle kit)
 *
 * Fills each 200 m road chunk with jungle instead of city blocks: a wall of
 * trees either side, bushes and grass along the verge, boulders, and now and
 * then a mossy ruin — a column, a stag or fox statue, a broken wall — so the
 * road reads as cutting through the same jungle as Level 1 and Level 3.
 *
 * Performance: every placement is an *instance*. For each kit model and each
 * of its sub-meshes there is ONE InstancedMesh per chunk, so a chunk with
 * ~250 plants costs a few dozen draw calls instead of several hundred. Chunks
 * are recycled by RoadSystem, so nothing is created while driving.
 *
 *   const kit  = await loadJungleKit(assets);          // level1/jungleWorld.js
 *   const mats = await createJungleMaterials(assets);
 *   road.decorate((chunk, seed) => populateJungleChunk(chunk, kit, { ... , seed }));
 */

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Flattens a prototype into [{ geometry, material, local matrix }]. */
const _partsCache = new WeakMap();
export function partsOf(proto) {
  if (_partsCache.has(proto)) return _partsCache.get(proto);
  const root = proto.clone(true);
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    parts.push({ geometry: o.geometry, material: o.material, local: o.matrixWorld.clone() });
  });
  _partsCache.set(proto, parts);
  return parts;
}

/**
 * Builds the instanced meshes for one chunk.
 * @param {THREE.Group} chunk   RoadSystem chunk (centred on its own z = 0)
 * @param {object} kit          loadJungleKit() result
 * @param {object} o            { length, roadWidth, seed }
 */
export function populateJungleChunk(chunk, kit, { length = 200, roadWidth = 24, seed = 1 } = {}) {
  const r = rng(seed);
  const half = roadWidth / 2;
  const L = length;
  const placements = new Map();   // proto -> [Matrix4]
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  const put = (proto, x, z, scale, { y = 0, tilt = 0 } = {}) => {
    if (!proto) return;
    q.setFromAxisAngle(up, r() * Math.PI * 2);
    if (tilt) q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * tilt, 0, (r() - 0.5) * tilt)));
    s.setScalar(scale);
    p.set(x, y, z);
    m.compose(p, q, s);
    if (!placements.has(proto)) placements.set(proto, []);
    placements.get(proto).push(m.clone());
  };
  const pick = (list) => list[Math.floor(r() * list.length)];
  const side = () => (r() < 0.5 ? -1 : 1);

  const trees = [kit.tree1, kit.tree2, kit.tree3, kit.tree4, kit.ruinTree].filter(Boolean);
  const bushes = [kit.bush1, kit.bush2, kit.bush3].filter(Boolean);
  const grass = [kit.grass1, kit.grass2, kit.grass3].filter(Boolean);
  const rocks = [kit.rock1, kit.rock2, kit.rock3].filter(Boolean);

  for (const sd of [-1, 1]) {
    // the near tree wall: close enough to feel like a corridor through the jungle
    for (let z = -L / 2; z < L / 2; z += 6 + r() * 5) {
      put(pick(trees), sd * (half + 6 + r() * 9), z, 0.020 + r() * 0.012);      // Level 1's tree sizes
    }
    // the deep jungle behind it, bigger and sparser, out into the fog
    for (let z = -L / 2; z < L / 2; z += 9 + r() * 8) {
      put(pick(trees), sd * (half + 16 + r() * 40), z, 0.024 + r() * 0.010);
    }
    // small trees / clusters filling gaps in the canopy
    for (let z = -L / 2; z < L / 2; z += 18 + r() * 14) {
      put(pick([kit.treeSmall1, kit.treeSmall2, kit.treeCluster]), sd * (half + 9 + r() * 14), z, 6 + r() * 3);
    }
    // bushes hugging the verge
    for (let z = -L / 2; z < L / 2; z += 3.5 + r() * 3) {
      put(pick(bushes), sd * (half + 3 + r() * 7), z, 0.012 + r() * 0.008);
    }
    // grass tufts right at the edge of the mud
    for (let z = -L / 2; z < L / 2; z += 2 + r() * 2.5) {
      put(pick(grass), sd * (half + 1.6 + r() * 4), z, 0.011 + r() * 0.008);
    }
    // boulders
    for (let z = -L / 2; z < L / 2; z += 25 + r() * 30) {
      put(pick(rocks), sd * (half + 4 + r() * 12), z, 0.008 + r() * 0.008, { y: -0.1 });
    }
  }

  // Level 1's shrine ruins: a column on one side and a column or broken wall
  // on the other, every 60 m, just off the trail (same kit, same scales)
  for (let z = -L / 2 + 20; z < L / 2; z += 60) {
    put(z % 120 < 60 ? kit.column : kit.columnShort, -(half + 4.6), z + (r() - 0.5) * 10, z % 120 < 60 ? 0.016 : 0.019, { tilt: 0.12 });
    put(r() < 0.4 ? kit.wall : kit.columnShort, half + 5, z + (r() - 0.5) * 10, 0.017, { tilt: 0.06 });
  }

  // one or two landmarks per chunk: the shrine is near, the jungle remembers it
  const landmarks = [
    [kit.column, 0.016], [kit.columnShort, 0.016], [kit.stag, 0.02], [kit.fox, 0.02],
    [kit.wall, 0.016], [kit.arch, 0.016], [kit.deadTree, 0.03],
  ].filter(([k]) => k);
  const nLandmarks = 1 + Math.floor(r() * 2);
  for (let i = 0; i < nLandmarks; i++) {
    const [proto, sc] = pick(landmarks);
    put(proto, side() * (half + 5 + r() * 6), -L / 2 + r() * L, sc * (0.9 + r() * 0.3), { tilt: 0.08 });
  }
  // a logging-camp pile now and then (the guide's "Kai takes the jeep here")
  if (r() < 0.45) put(pick([kit.logs, kit.crates, kit.barrel, kit.cutTrees].filter(Boolean)), side() * (half + 4 + r() * 4), -L / 2 + r() * L, 4 + r() * 2);

  // ---- build the instanced meshes ----
  const group = new THREE.Group();
  group.name = 'jungle-roadside';
  for (const [proto, mats] of placements) {
    for (const part of partsOf(proto)) {
      const inst = new THREE.InstancedMesh(part.geometry, part.material, mats.length);
      const tmp = new THREE.Matrix4();
      mats.forEach((pm, i) => inst.setMatrixAt(i, tmp.multiplyMatrices(pm, part.local)));
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.castShadow = false;
      inst.receiveShadow = false;
      group.add(inst);
    }
  }
  chunk.add(group);
  return group;
}
