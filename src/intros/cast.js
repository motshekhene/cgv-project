import * as THREE from 'three';
import { Fighter } from '../levels/level3/Fighter.js';
import { dressAsHandler } from '../levels/level3/HandlerBoss.js';
import { loadRig } from '../player/rig.js';
import { mergeGroups } from '../levels/jungle/props.js';
import { createLightShaft } from '../shaders/lightshaft.js';
import { dotTexture } from './fx.js';

/**
 * Kai and the Handler for the cutscenes and the chase: the same characters
 * Level 3 uses (the Mixamo builds, see player/rig.js; the old Quaternius FBXs
 * if they're missing), on the same Fighter rig, plus what each one carries
 * after the prologue: the horn in Kai's hand (the one he took off the stone),
 * and Baba Zwane's Handler kit (dressAsHandler: the armoured coat and the
 * helmet round the carved stone mask, which only comes off in Level 3) and,
 * in Level 1, his torch.
 *
 * Clips both builds have: idle, run, death. Kai also has walk; the old
 * Quaternius rigs have walk, jump, punch, sitting, standing... as well.
 */
export const KAI_LOOK = { Skin: 0x9a6538, Hair: 0x1c1512, Shirt: 0x2f8fb5, Pants: 0x8a7658, Socks: 0xe6dfd6, Shoes: 0x2a2320 };
export const HANDLER_LOOK = { Skin: 0x7a5233, Hair: 0xb4b4bc, Shirt: 0x3a3d4d, Pants: 0x2f3240, Details: 0xefe9e0, TieTexture: 0xb02323, Shoes: 0x1a1a1e };
export const HORN_CYAN = 0x4fd6e0; // the horn's glow: the only cyan in the game
export const KEY_CYAN = HORN_CYAN; // older name, kept for callers
const LEAP_AT = 0.05; // s into the Mixamo run: both legs flung wide, mid-stride

export async function loadCast(assets) {
  const safe = (p) =>
    p.catch((e) => {
      console.warn('[intros] character missing, using a capsule:', e?.message || e);
      return null;
    });
  const [kai, handler] = await Promise.all([
    safe(loadRig(assets, 'kai-bryce', 'kai.fbx')),
    safe(loadRig(assets, 'handler-monk', 'handler.fbx')),
  ]);
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

/** Fighter options for a loadRig() result (or a bare FBX scene, as older callers pass). */
function rigOptions(rig) {
  const { source, meta } = rig && rig.source !== undefined ? rig : { source: rig, meta: null };
  // the Mixamo builds are in metres and already lean on draw calls; the FBXs need their groups merged
  return meta ? { source, modelHeight: meta.height } : { source: mergeRig(source) };
}

export function makeKai(parent, rig) {
  const f = new Fighter(parent, { ...rigOptions(rig), capsuleColor: 0xdfe8ee, palette: KAI_LOOK });
  f.horn = f.key = attachHorn(f);
  // the Mixamo Kai was built for the fight. Out here he stands easy (the end of his 'relax' clip)
  // instead of in his fighting stance, and, with no jump of his own, leaps in a held stride from
  // his run (Level 1 plays 'jump' while he's in the air)
  if (f.actions.relax && f.pose('idle', 'relax', f.clipDuration('relax'))) f.play('idle', { fade: 0 });
  if (!f.actions.jump && !f.actions.runningjump) f.pose('jump', 'run', LEAP_AT);
  return f;
}

export function makeHandler(parent, rig, { helmet = true } = {}) {
  const f = new Fighter(parent, { ...rigOptions(rig), capsuleColor: 0xff5533, palette: HANDLER_LOOK });
  for (const m of f.materials) if (m.emissive) m.userData.baseEmissive.set(0x2a1210);
  // the chase, not the fire: Baba Zwane in the company Handler's coat and helmet
  if (helmet && !(f.rig === 'mixamo' && dressAsHandler(f))) attachHelmet(f);
  return f;
}

/** A bone by its Quaternius name ('PalmR', 'Head'), on either rig. */
function bone(fighter, name) {
  return fighter.bone ? fighter.bone(name) : null;
}

/**
 * The horn's shape: a round tube swept along a bending spine, fat at the base
 * and tapering to a fine point. A kudu curl in one piece, resting on its belly
 * (shifted so its lowest point is y 0). The prologue's stone and Kai's hand
 * share it, so it is the same horn all the way through.
 */
export function hornGeometry() {
  const RINGS = 30, SIDES = 12, SWEEP = 0.28, A0 = -2.3, A1 = 1.6;
  const baseY = SWEEP * (1 - Math.cos(A0));
  const pos = [], nor = [], idx = [];
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS;
    const a = A0 + (A1 - A0) * t;
    const px = SWEEP * Math.sin(a);
    const py = SWEEP * (1 - Math.cos(a)) - baseY;
    const r = 0.045 * Math.pow(1 - t, 1.15) + 0.003;
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let k = 0; k <= SIDES; k++) {
      const b = (k / SIDES) * Math.PI * 2, cb = Math.cos(b), sb = Math.sin(b);
      pos.push(px + ca * cb * r, py + sa * cb * r, sb * r);
      nor.push(ca * cb, sa * cb, sb);
    }
  }
  for (let i = 0; i < RINGS; i++) {
    for (let k = 0; k < SIDES; k++) {
      const a0 = i * (SIDES + 1) + k, b0 = a0 + SIDES + 1;
      idx.push(a0, a0 + 1, b0, b0 + 1, b0, a0 + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  geo.computeBoundingBox();
  geo.translate(0, -geo.boundingBox.min.y, 0);
  return geo;
}

/**
 * The horn, lit, in Kai's right hand: pale keratin with the cyan woken in it
 * the moment it left the stone, and a soft glow that reads from across a
 * clearing. Gripped near the thick end, the curl standing up out of his fist.
 * `horn.userData.glow` is the sprite, `horn.userData.material` the horn itself
 * (levels pulse it when its power is used).
 */
export function attachHorn(fighter, { scale = 0.42 } = {}) {
  const palm = bone(fighter, 'PalmR');
  const horn = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0xb3a488, roughness: 0.32, metalness: 0.05, emissive: HORN_CYAN, emissiveIntensity: 0.4,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(hornGeometry(), material);
  mesh.castShadow = true;
  mesh.scale.setScalar(scale);
  // the thick end in the fist: the curl's base sits at x -0.21 (sweep 0.28, from -2.3 rad), so shift it to the grip
  mesh.position.set(0.13 * scale, -0.02, 0);
  mesh.rotation.set(0, Math.PI / 2, 0);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: dotTexture(), color: 0x7fe9f0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.4, fog: false }),
  );
  glow.scale.setScalar(0.3);
  glow.position.y = 0.08;
  horn.add(mesh, glow);
  if (palm) {
    fighter.root.updateMatrixWorld(true);
    const s = palm.getWorldScale(new THREE.Vector3()).x || 1;
    horn.scale.setScalar(1 / s);
    horn.position.set(0, 0.08 / s, 0.03 / s);
    palm.add(horn);
  } else {
    horn.position.set(0.3, 0.1, 0.2);
    fighter.pivot.add(horn);
  }
  horn.userData.glow = glow;
  horn.userData.material = material;
  return horn;
}

/** The plain helmet, for the old Quaternius rig only (no Mixamo bones for the Handler kit to ride). */
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
