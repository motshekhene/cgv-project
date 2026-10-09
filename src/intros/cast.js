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
 * The horn: a kudu horn, the spiral horn blown across southern Africa. An open
 * corkscrew a little over a turn and a half long, fat and ringed at the base
 * and tapering to a fine point, with the keel ridge running round the spiral;
 * bark-brown at the base, warming through tan to ivory at the tip (vertex
 * colours). Built along +X from the base (at the origin) to the tip, about
 * 0.62 m. The prologue's stone and Kai's sling share it, so it is the same
 * horn all the way through.
 */
export function hornGeometry() {
  const RINGS = 72, SIDES = 18, LEN = 0.5, TURNS = 1.15;
  const pts = [];
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS;
    const a = TURNS * Math.PI * 2 * t;
    const A = 0.012 + 0.085 * t * t; // tight at the base, the spiral opening out toward the tip
    pts.push(new THREE.Vector3(LEN * t, A * Math.sin(a) + 0.06 * t * t, A * (1 - Math.cos(a))));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const frames = curve.computeFrenetFrames(RINGS, false);
  const cBase = new THREE.Color(0x5b3b22), cMid = new THREE.Color(0xa47a4c), cTip = new THREE.Color(0xf3e9d0);
  const c = new THREE.Color();
  const pos = [], col = [], idx = [];
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS;
    const p = curve.getPointAt(t);
    const N = frames.normals[i], B = frames.binormals[i];
    // thick at the base, a fine point at the tip; rings pressed into the first half
    const groove = Math.pow(0.5 + 0.5 * Math.cos(t * Math.PI * 2 * 13), 5) * Math.pow(1 - t, 1.2);
    const r = (0.062 * Math.pow(1 - t, 1.25) + 0.003) * (1 - 0.16 * groove);
    if (t < 0.5) c.copy(cBase).lerp(cMid, t / 0.5);
    else c.copy(cMid).lerp(cTip, (t - 0.5) / 0.5);
    for (let k = 0; k <= SIDES; k++) {
      const th = (k / SIDES) * Math.PI * 2;
      // the keel: one edge of the cross-section drawn out into a ridge
      const keel = 1 + 0.28 * Math.pow(Math.max(0, Math.cos(th)), 4) * (1 - t * 0.5);
      const rr = r * keel;
      pos.push(
        p.x + (N.x * Math.cos(th) + B.x * Math.sin(th)) * rr,
        p.y + (N.y * Math.cos(th) + B.y * Math.sin(th)) * rr,
        p.z + (N.z * Math.cos(th) + B.z * Math.sin(th)) * rr,
      );
      const shade = 0.82 + 0.18 * Math.cos(th - 1); // a little darker in the curl's shadow side
      col.push(c.r * shade, c.g * shade, c.b * shade);
    }
  }
  for (let i = 0; i < RINGS; i++) {
    for (let k = 0; k < SIDES; k++) {
      const a0 = i * (SIDES + 1) + k, b0 = a0 + SIDES + 1;
      idx.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  return geo;
}

/** The horn's material: its own colours, with the cyan woken in it (emissiveIntensity 0 while it sleeps on the stone). */
export function hornMaterial(glow = 0.02) {
  return new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.42, metalness: 0.04,
    emissive: HORN_CYAN, emissiveIntensity: glow, side: THREE.DoubleSide,
  });
}

/**
 * The horn and its glow as one piece, in metres: `horn.userData.material` is
 * the horn's, `horn.userData.glow` the soft cyan halo round its tip half.
 */
export function makeHorn({ glow = 0.02 } = {}) {
  const horn = new THREE.Group();
  const material = hornMaterial(glow);
  const mesh = new THREE.Mesh(hornGeometry(), material);
  mesh.castShadow = true;
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: dotTexture(), color: 0x7fe9f0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35, fog: false }),
  );
  halo.scale.setScalar(0.3);
  halo.position.set(0.34, 0.08, 0.04);
  const mouth = new THREE.Mesh(
    new THREE.CircleGeometry(0.056, 18),
    new THREE.MeshStandardMaterial({ color: 0x120c07, roughness: 0.9, side: THREE.DoubleSide }),
  );
  mouth.rotation.y = Math.PI / 2;
  mouth.position.x = 0.002;
  horn.add(mesh, mouth, halo);
  horn.userData.material = material;
  horn.userData.glow = halo;
  return horn;
}

/**
 * Where the horn rides on Kai once it is his, in metres from the bone:
 *   SLING  at his left hip on its strap like a powder horn, the base up by
 *          the belt and the curl running forward along his thigh
 *   HAND   gripped by the base in his right fist, curl up and forward
 * The prologue eases the horn from the stone into HAND and then into SLING;
 * the levels start with it slung.
 */
export const HORN_SLING = { bone: 'Hips', pos: [0.21, 0.03, -0.12], rot: [0, -Math.PI / 2 + 0.35, -0.6] };
export const HORN_HAND = { bone: 'PalmR', pos: [0.0, 0.07, 0.03], rot: [0, 0, Math.PI / 2 - 0.35] };

/** Put `horn` (already a child of `bone`) at a HORN_* pose; k < 1 eases it part of the way from where it is. */
export function poseHorn(horn, bone, spec, k = 1) {
  const s = bone.getWorldScale(_hv).x || 1;
  _hp.set(spec.pos[0] / s, spec.pos[1] / s, spec.pos[2] / s);
  _hq.setFromEuler(_he.set(spec.rot[0], spec.rot[1], spec.rot[2]));
  horn.position.lerp(_hp, k);
  horn.quaternion.slerp(_hq, k);
  horn.scale.lerp(_hv.setScalar(1 / s), k);
}
const _hv = new THREE.Vector3(), _hp = new THREE.Vector3(), _hq = new THREE.Quaternion(), _he = new THREE.Euler();

/**
 * The strap the horn hangs from: a leather band across Kai's chest, over the
 * right shoulder and down to the left hip, with a brass buckle at the front.
 */
export function attachHornStrap(fighter) {
  const spine = bone(fighter, 'Torso');
  if (!spine) return null;
  fighter.root.updateMatrixWorld(true);
  const s = spine.getWorldScale(new THREE.Vector3()).x || 1;
  const strap = new THREE.Group();
  const leather = new THREE.MeshStandardMaterial({ color: 0x4a2f1a, roughness: 0.8 });
  // a loop round his body in the plane of the diagonal: stood on edge (Y turn), then tipped 45 degrees
  // so it runs over the right shoulder, across his chest and back, and down to the left hip
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.2 / s, 0.013 / s, 6, 44), leather);
  band.scale.set(0.62, 1.45, 1); // through his chest front to back, long from shoulder to hip
  band.quaternion
    .setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 4)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
  band.position.set(0, -0.06 / s, 0.01 / s);
  const buckle = new THREE.Mesh(
    new THREE.BoxGeometry(0.05 / s, 0.04 / s, 0.012 / s),
    new THREE.MeshStandardMaterial({ color: 0xc89a46, roughness: 0.35, metalness: 0.8 }),
  );
  buckle.position.set(0, -0.06 / s, 0.135 / s);
  buckle.rotation.z = -Math.PI / 4;
  strap.add(band, buckle);
  strap.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  spine.add(strap);
  return strap;
}

/**
 * The horn on Kai, the way he carries it from the stone on: slung at his hip
 * on its strap. Returns the horn (userData.material / userData.glow pulse it);
 * horn.userData.strap is the strap. With no bones (the capsule stand-in) it
 * just rides in front of him.
 */
export function attachHorn(fighter) {
  const horn = makeHorn();
  const hips = bone(fighter, HORN_SLING.bone);
  if (hips) {
    fighter.root.updateMatrixWorld(true);
    hips.add(horn);
    poseHorn(horn, hips, HORN_SLING);
    horn.userData.strap = attachHornStrap(fighter);
  } else {
    horn.position.set(0.3, 0.1, 0.2);
    fighter.pivot.add(horn);
  }
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
