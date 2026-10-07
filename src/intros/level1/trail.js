import * as THREE from 'three';
import { RU, TINT, place, sign, rng } from '../../levels/jungle/props.js';
import { TRAIL_MORNING } from '../../levels/jungle/palette.js';
import { smooth } from '../Cutscene.js';
import { Pollen } from '../fx.js';
import { safeProp, safePbr, loadJungleKit, buildSkyAndLights, buildGround, plantJungle, addShafts, pathStrip, box } from '../world.js';

/**
 * The Level 1 trail, shared by both Level 1 scenes: a dry mud trail about
 * 7.5 m wide running toward -z, mossy ruins every ~11 m alternating sides,
 * wooden "SITE 7 →" arrows, jungle either side, light shafts and pollen in
 * the morning mist. Implementation guide section 4, look from shrineRun.
 */
export const TRAIL_W = 7.5;

/** Flat on the trail, rolling gently up into the jungle either side. */
export function trailHeight(x, z) {
  const off = smooth(5, 16, Math.abs(x));
  return off * (0.6 + Math.sin(x * 0.13) * Math.cos(z * 0.11) * 0.5 + Math.sin(x * 0.31 + z * 0.17) * 0.2) + Math.max(0, Math.abs(x) - 30) * 0.04;
}

/** Wooden trail arrow on a post: the first of the signs that lead to Site 7. */
export function trailSign(root, x, z, ry = 0, text = 'SITE 7 →') {
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3b22, roughness: 0.9 });
  const panel = sign([text], { w: 1.5, h: 0.42, bg: '#6b4a2b', fg: '#f3e2bd', border: '#3a2614', font: 'Georgia, serif' });
  panel.position.set(0, 1.45, 0.08);
  panel.castShadow = true;
  const g = new THREE.Group();
  g.add(box(0.13, 1.7, 0.13, wood, 0, 0.85, 0), panel);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  root.add(g);
  return g;
}

/**
 * Build the trail between z0 (near end, +z) and z1 (far end, -z).
 *   keep(x, z)   false where nothing may grow (a building, the gate)
 *   markers      [z...] where ruins stand beside the trail (default: every 11 m)
 *   near         points where trees should cast shadows (where the action is)
 */
export async function buildTrail(root, scene, assets, { z0, z1, keep = () => true, markers = null, near = [], seed = 41, archAt = null }) {
  const [kit, mud, floorMat, col, colShort, wallO, stag, fox, archR, pot] = await Promise.all([
    loadJungleKit(assets),
    safePbr(assets, 'mud', { repeat: 1, tint: 0xc8a27a, roughness: 1, normalScale: 0.8 }),
    safePbr(assets, 'forest-floor', { repeat: 60, tint: 0x9fb07a }),
    safeProp(assets, 'ruins/column-round.fbx', TINT.stone),
    safeProp(assets, 'ruins/column-round-short.fbx', TINT.stone),
    safeProp(assets, 'ruins/wall-overgrown.fbx', TINT.stone),
    safeProp(assets, 'ruins/statue-stag.fbx', TINT.statue),
    safeProp(assets, 'ruins/statue-fox.fbx', TINT.statue),
    safeProp(assets, 'ruins/arch-round.fbx', TINT.stone),
    safeProp(assets, 'ruins/pot-2-broken.fbx'),
  ]);

  const light = buildSkyAndLights(root, scene, TRAIL_MORNING, { shadowSize: 28 });
  const len = Math.abs(z0 - z1);
  buildGround(root, floorMat, { w: 200, d: len + 120, cz: (z0 + z1) / 2, seg: 120, heightFn: trailHeight });
  pathStrip(root, mud, { z0, z1, width: TRAIL_W + 2.4, soft: 0.18, repeat: [2.5, len / 3.2] });

  // ruins beside the trail: columns (some snapped or leaning), overgrown wall stubs, a guardian now and then
  const r = rng(seed);
  const at = markers ?? Array.from({ length: Math.floor(len / 11) }, (_, i) => z0 - 8 - i * 11);
  at.forEach((z, i) => {
    const side = i % 2 ? 1 : -1;
    const x = side * (5.6 + r() * 1.4);
    if (!keep(x, z)) return;
    const kind = i % 7;
    if (kind === 0 || kind === 3) place(root, col, x, 0, z, { s: RU * (0.9 + r() * 0.2), rz: kind === 3 ? side * 0.12 : 0 });
    else if (kind === 1 || kind === 5) place(root, colShort, x, 0, z, { s: RU * 1.2 });
    else if (kind === 2) place(root, wallO, x + side * 0.8, 0, z, { s: RU, ry: Math.PI / 2 + (r() - 0.5) * 0.3 });
    else if (kind === 4) place(root, stag, x + side * 1.2, 0, z, { s: RU * 0.6, ry: side > 0 ? -Math.PI / 2 + 0.4 : Math.PI / 2 - 0.4 });
    else place(root, fox, x + side * 0.6, 0, z, { s: RU * 0.8, ry: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
    if (pot && r() < 0.35) place(root, pot, x - side * 0.9, 0, z + 1.2, { s: RU, ry: r() * 6 });
  });
  // an old arch straddling the trail further on, the kind of gate the runner will slide under later
  const archZ = archAt ?? z0 - len * 0.55;
  if (archR && keep(0, archZ)) place(root, archR, 0, 0, archZ, { s: RU * 1.45 });

  plantJungle(root, kit, {
    area: [-70, 70, z1 - 30, z0 + 30],
    keep: (x, z, kind) => {
      const ax = Math.abs(x);
      if (!keep(x, z)) return false;
      if (kind === 'tree') return ax > 7.5;
      if (kind === 'bush') return ax > 4.9 && ax < 26;
      if (kind === 'grass') return ax > 3.6 && ax < 22;
      return ax > 4.6 && ax < 14;
    },
    heightFn: trailHeight,
    trees: Math.round(len * 1.6),
    bushes: Math.round(len * 1.1),
    grass: Math.round(len * 3),
    rocks: Math.round(len * 0.12),
    near,
    seed: seed + 1,
  });

  const shafts = addShafts(
    root,
    light.sunDir,
    Array.from({ length: Math.floor(len / 14) }, (_, i) => [(i % 2 ? 1 : -1) * (1 + r() * 4), z0 - 6 - i * 14 - r() * 6, 1.6 + r() * 1.2]),
  );
  const pollen = new Pollen(root, { count: 320, box: [26, 6, 44] });

  return { kit, light, shafts, pollen };
}
