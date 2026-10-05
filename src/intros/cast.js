import * as THREE from 'three';
import { Fighter } from '../levels/level3/Fighter.js';
import { mergeGroups } from '../levels/jungle/props.js';
import { createLightShaft } from '../shaders/lightshaft.js';
import { dotTexture } from './fx.js';

/**
 * Kai and the Handler for the cutscenes: the same Fighter rig and colours
 * Level 3 uses (CombatController / HandlerBoss), plus the props each one
 * carries before Site 7: the Key in Kai's hand, the Handler's helmet (it only
 * comes off in Level 3) and, in Level 1, his torch.
 *
 * Clips on both rigs: idle, walk, run, jump, runningjump, punch, sitting,
 * standing, death, clapping.
 */
export const KAI_LOOK = { Skin: 0x9a6538, Hair: 0x1c1512, Shirt: 0x2f8fb5, Pants: 0x8a7658, Socks: 0xe6dfd6, Shoes: 0x2a2320 };
export const HANDLER_LOOK = { Skin: 0x7a5233, Hair: 0xb4b4bc, Shirt: 0x3a3d4d, Pants: 0x2f3240, Details: 0xefe9e0, TieTexture: 0xb02323, Shoes: 0x1a1a1e };
export const KEY_CYAN = 0x2fd8ff;

export async function loadCast(assets) {
  const safe = (p) =>
    p.catch((e) => {
      console.warn('[intros] character missing, using a capsule:', e?.message || e);
      return null;
    });
  const [kai, handler] = await Promise.all([safe(assets.fbx('characters/kai.fbx')), safe(assets.fbx('characters/handler.fbx'))]);
  return { kai, handler };
}

/**
 * The character FBXs come in with ~170 material groups per mesh, and every
 * group is a draw call (twice with shadows): together the two rigs cost ~670
 * calls a frame. Merging groups by material (props.js) brings that to a
 * handful. Safe on the shared cached geometry, and only done once.
 */
function mergeRig(src) {
  if (!src || src.userData.merged) return src;
  src.traverse((o) => {
    if (o.isMesh) mergeGroups(o.geometry);
  });
  src.userData.merged = true;
  return src;
}

export function makeKai(parent, src) {
  const f = new Fighter(parent, { source: mergeRig(src), capsuleColor: 0xdfe8ee, palette: KAI_LOOK });
  f.key = attachKey(f);
  return f;
}

export function makeHandler(parent, src, { helmet = true } = {}) {
  const f = new Fighter(parent, { source: mergeRig(src), capsuleColor: 0xff5533, palette: HANDLER_LOOK });
  for (const m of f.materials) if (m.emissive) m.userData.baseEmissive.set(0x2a1210);
  if (helmet) attachHelmet(f);
  return f;
}

function bone(fighter, name) {
  let found = null;
  fighter.pivot.traverse((o) => {
    if (o.isBone && o.name === name) found = o;
  });
  return found;
}

/** The Key: a small dark slab in Kai's right palm with a cyan glow that reads from across a clearing. */
export function attachKey(fighter) {
  const palm = bone(fighter, 'PalmR');
  const key = new THREE.Group();
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.12, 0.025),
    new THREE.MeshStandardMaterial({ color: 0x141c26, emissive: KEY_CYAN, emissiveIntensity: 2.4, metalness: 0.6, roughness: 0.3 }),
  );
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: dotTexture(), color: 0x6fe3ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85, fog: false }),
  );
  glow.scale.setScalar(0.32);
  key.add(slab, glow);
  if (palm) {
    fighter.root.updateMatrixWorld(true);
    const s = palm.getWorldScale(new THREE.Vector3()).x || 1;
    key.scale.setScalar(1 / s);
    key.position.set(0, 0.07 / s, 0.02 / s);
    palm.add(key);
  } else {
    key.position.set(0.3, 0.1, 0.2);
    fighter.pivot.add(key);
  }
  key.userData.glow = glow;
  return key;
}

/** Same helmet HandlerBoss puts on him: in Levels 1 and 2 nobody has seen his face yet. */
export function attachHelmet(fighter) {
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 18, 14),
    new THREE.MeshStandardMaterial({ color: 0x0c0c10, metalness: 0.75, roughness: 0.28 }),
  );
  helmet.scale.set(1, 1.15, 1.05);
  helmet.castShadow = true;
  const head = bone(fighter, 'Head');
  if (head) {
    helmet.position.set(0, 0.28, 0.03);
    head.add(helmet);
  } else {
    helmet.scale.setScalar(0.22);
    helmet.position.y = 0.95;
    fighter.pivot.add(helmet);
  }
  return helmet;
}

/**
 * The Handler's torch (Level 1): a spotlight plus a visible beam through the
 * mist. It rides his right hand, but the scene aims it, so the beam sweeps
 * where the shot needs it instead of flailing with the run cycle.
 *
 *   const torch = attachTorch(handler, root);
 *   torch.update(aimPoint);   // every frame, after handler.update()
 */
export function attachTorch(fighter, parent, { range = 32, beam = 0.32, power = 32 } = {}) {
  const palm = bone(fighter, 'PalmR');
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.045, 0.28, 10),
    new THREE.MeshStandardMaterial({ color: 0x1c1d20, metalness: 0.6, roughness: 0.4 }),
  );
  body.rotation.x = Math.PI / 2;
  const lens = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: dotTexture(), color: 0xfff2d8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }),
  );
  lens.position.z = 0.16;
  lens.scale.setScalar(0.9);
  const shaft = createLightShaft(new THREE.Vector3(0, 0, 0.15), new THREE.Vector3(0, 0, range * 0.7), 2.8, 0xfff0d2, beam, 2.3);
  const spot = new THREE.SpotLight(0xfff0d0, power, range, 0.24, 0.6, 1.1);
  spot.position.z = 0.15;
  const target = new THREE.Object3D();
  g.add(body, lens, shaft, spot);
  parent.add(g, target);
  spot.target = target;

  const tmp = new THREE.Vector3();
  return {
    group: g,
    spot,
    shaft,
    lens,
    update(aim, time = 0) {
      if (palm) palm.getWorldPosition(tmp);
      else fighter.root.localToWorld(tmp.set(0.3, 1.2, 0.3));
      g.position.copy(tmp);
      g.lookAt(aim);
      target.position.copy(aim);
      shaft.material.uniforms.uTime.value = time;
    },
    setOn(on) {
      g.visible = on;
      spot.intensity = on ? power : 0;
    },
  };
}

/**
 * Put a fighter's clips at the right moment after a jump in the timeline, so a
 * scene started at ?t=7 doesn't show everyone frozen at frame 0.
 */
export function syncClip(fighter, s) {
  if (fighter.mixer) fighter.mixer.setTime(s);
}
