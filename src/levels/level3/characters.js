import * as THREE from "three";
import { makeGlowSprite } from "./materials.js";

/**
 * Character rigs for level 03 — Kai and the Handler.
 *
 * The plan: real rigged GLBs eventually live at
 *   public/assets/level03/characters/kai.glb
 *   public/assets/level03/characters/handler.glb
 * (Mixamo -> Blender -> export, animations embedded, helmet as its own
 * node for the phase-2 reveal). Until those files exist, loadCharacter()
 * falls back to the procedural rigs below so combat is testable today —
 * the pitch's "greybox it in week two, capsules" plan, honoured.
 *
 * Both paths return the same CharacterRig API, so combat code never
 * branches on where the body came from.
 *
 * NOTE: we deliberately do NOT clone GLB scenes here (skinned meshes need
 * SkeletonUtils.clone, and re-using the cached scene is fine because a
 * level only ever places one copy of each character).
 */

const MANIFEST = {
  kai: {
    path: "level03/characters/kai.glb",
    height: 1.78,
  },
  handler: {
    path: "level03/characters/handler.glb",
    height: 2.02,
  },
};

// names we ask the GLB to provide; play() falls back gracefully if absent
const CLIP_KEYS = [
  "idle", "walk", "run", "attack", "attack_heavy", "dodge", "block",
  "hurt", "death", "victory", "swipe", "lunge", "shockwave", "stagger",
  "roar",
];

const ONE_SHOT = new Set([
  "attack", "attack_heavy", "dodge", "hurt", "stagger", "death",
  "victory", "swipe", "lunge", "shockwave", "roar",
]);

export class CharacterRig {
  constructor(group, { isFallback, mixer = null, clips = null, parts = {} }) {
    this.group = group;
    this.isFallback = isFallback;
    this.mixer = mixer;
    this.parts = parts;
    this.action = "idle";
    this.t = 0;
    this.timeScale = 1;
    this._current = null;
    this._clips = clips || new Map();
    this._warned = new Set();
  }

  play(name) {
    if (this.action === name) return;
    this.action = name;
    this.t = 0;
    if (!this.mixer) return; // procedural rigs animate from this.t instead

    const clip = this._clips.get(name);
    if (!clip) {
      if (!this._warned.has(name)) {
        this._warned.add(name);
        console.warn(`[level03] rig has no clip "${name}" — holding pose`);
      }
      if (this._current) this._current.fadeOut(0.16);
      this._current = null;
      return;
    }
    const next = this.mixer.clipAction(clip);
    next.reset();
    if (ONE_SHOT.has(name)) {
      next.setLoop(THREE.LoopOnce, Infinity);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
    }
    if (this._current && this._current !== next) {
      this._current.fadeOut(0.16);
      next.fadeIn(0.16);
    }
    next.play();
    this._current = next;
  }

  update(dt) {
    if (this.mixer) {
      this.mixer.update(dt * this.timeScale);
    } else {
      this.t += dt * this.timeScale;
      poseRig(this, this.t);
    }
  }
}

/* ------------------------------------------------------------------ *
 * GLB path
 * ------------------------------------------------------------------ */

function matchClips(animations) {
  const map = new Map();
  for (const clip of animations || []) {
    const name = clip.name.toLowerCase().replace(/[^a-z]/g, "");
    for (const key of CLIP_KEYS) {
      if (!map.has(key) && name.includes(key)) {
        map.set(key, clip);
        break;
      }
    }
  }
  return map;
}

function rigFromGLB(gltf, def) {
  const model = gltf.scene;

  // Mixamo exports can arrive in cm or m — normalize by bounding box
  const box = new THREE.Box3().setFromObject(model);
  const h = box.max.y - box.min.y;
  if (h > 0.01) model.scale.setScalar(def.height / h);
  const grounded = new THREE.Box3().setFromObject(model);
  model.position.y -= grounded.min.y; // feet on y=0 whatever the rig's origin

  let helmet = null;
  model.traverse((obj) => {
    if (obj.isMesh || obj.isSkinnedMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      if (obj.isSkinnedMesh) obj.frustumCulled = false;
    }
    if (!helmet && /helmet/i.test(obj.name)) helmet = obj;
  });

  const mixer = new THREE.AnimationMixer(model);
  return new CharacterRig(model, {
    isFallback: false,
    mixer,
    clips: matchClips(gltf.animations),
    parts: { helmet },
  });
}

/* ------------------------------------------------------------------ *
 * Procedural fallback path — articulated capsules with pose tables
 * ------------------------------------------------------------------ */

function limbBox(w, h, d, mat, offsetY) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.y = offsetY;
  mesh.castShadow = true;
  return mesh;
}

function buildProceduralRig(kind) {
  const handler = kind === "handler";
  const s = handler ? 1.14 : 1.0;

  const cloth = new THREE.MeshStandardMaterial({
    color: handler ? 0x1a1c21 : 0x3a5a78,
    roughness: 0.85,
  });
  const pants = new THREE.MeshStandardMaterial({
    color: handler ? 0x14161a : 0x232a33,
    roughness: 0.9,
  });
  const armor = new THREE.MeshStandardMaterial({
    color: 0x2c3038,
    metalness: 0.65,
    roughness: 0.45,
  });
  const skin = new THREE.MeshStandardMaterial({
    color: 0xd1a186,
    roughness: 0.6,
  });

  const group = new THREE.Group();
  const body = new THREE.Group(); // rolls, leans, falls — without moving the feet origin
  group.add(body);

  const parts = { body };

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.19 * s, 0.52 * s, 4, 10),
    cloth,
  );
  torso.position.y = 1.18 * s;
  torso.castShadow = true;
  body.add(torso);
  parts.torso = torso;

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.145 * s, 16, 12),
    skin,
  );
  head.position.y = 1.63 * s;
  head.castShadow = true;
  body.add(head);
  parts.head = head;

  const hips = limbBox(0.34 * s, 0.17 * s, 0.23 * s, pants, 0.88 * s);
  body.add(hips);

  const armGeo = { w: 0.09 * s, h: 0.58 * s, d: 0.1 * s };
  const legGeo = { w: 0.11 * s, h: 0.86 * s, d: 0.12 * s };
  for (const side of [-1, 1]) {
    const armPivot = new THREE.Group();
    armPivot.position.set(side * 0.28 * s, 1.46 * s, 0);
    armPivot.add(limbBox(armGeo.w, armGeo.h, armGeo.d, cloth, -armGeo.h / 2));
    body.add(armPivot);
    parts[side < 0 ? "armL" : "armR"] = armPivot;

    const legPivot = new THREE.Group();
    legPivot.position.set(side * 0.12 * s, 0.9 * s, 0);
    legPivot.add(limbBox(legGeo.w, legGeo.h, legGeo.d, pants, -legGeo.h / 2));
    body.add(legPivot);
    parts[side < 0 ? "legL" : "legR"] = legPivot;
  }

  if (handler) {
    // shoulder plates + chest plate — reads as "armoured", not "capsule"
    for (const side of [-1, 1]) {
      const pad = limbBox(0.16 * s, 0.08 * s, 0.2 * s, armor, 1.52 * s);
      pad.position.x = side * 0.3 * s;
      body.add(pad);
    }
    const chest = limbBox(0.3 * s, 0.3 * s, 0.06 * s, armor, 1.28 * s);
    chest.position.z = 0.17 * s;
    body.add(chest);

    // the helmet — its own node so phase 2 can dissolve it
    const helmet = new THREE.Group();
    helmet.position.y = 1.63 * s;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.165 * s, 16, 12),
      armor,
    );
    dome.castShadow = true;
    helmet.add(dome);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.2 * s, 0.05 * s, 0.05 * s),
      new THREE.MeshStandardMaterial({
        color: 0x05070a,
        emissive: 0x7fd8ff,
        emissiveIntensity: 3,
      }),
    );
    visor.position.set(0, -0.02 * s, 0.14 * s);
    helmet.add(visor);
    body.add(helmet);
    parts.helmet = helmet;
    parts.visor = visor;
  } else {
    // Kai carries the Key — bolted to his back since level 01
    const drive = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.28, 0.1),
      new THREE.MeshStandardMaterial({
        color: 0x11141a,
        emissive: 0x66e0ff,
        emissiveIntensity: 1.6,
        metalness: 0.5,
        roughness: 0.35,
      }),
    );
    drive.position.set(0, 1.3 * s, -0.2 * s);
    body.add(drive);
    const glow = makeGlowSprite(0x66e0ff, 0.55);
    glow.position.copy(drive.position);
    body.add(glow);
    parts.keyDrive = drive;
  }

  return new CharacterRig(group, { isFallback: true, parts });
}

/* ------------------------------------------------------------------ *
 * Pose tables — every pose writes absolute values, so switching
 * actions can never leave a limb stuck mid-rotation
 * ------------------------------------------------------------------ */

const lerp = THREE.MathUtils.lerp;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeOut = (p) => 1 - Math.pow(1 - p, 3);

function reset(r) {
  r.parts.body.rotation.set(0, 0, 0);
  r.parts.body.position.set(0, 0, 0);
  r.parts.armL.rotation.set(0, 0, 0.1);
  r.parts.armR.rotation.set(0, 0, -0.1);
  r.parts.legL.rotation.set(0, 0, 0);
  r.parts.legR.rotation.set(0, 0, 0);
  r.parts.head.rotation.set(0, 0, 0);
}

function locomotion(r, t, freq, amp, lean) {
  const f = t * freq;
  reset(r);
  r.parts.legL.rotation.x = Math.sin(f) * amp;
  r.parts.legR.rotation.x = -Math.sin(f) * amp;
  r.parts.armL.rotation.x = -Math.sin(f) * amp * 0.9 - 0.15;
  r.parts.armR.rotation.x = Math.sin(f) * amp * 0.9 - 0.15;
  r.parts.body.rotation.x = lean;
  r.parts.body.position.y = Math.abs(Math.cos(f)) * amp * 0.09;
  r.parts.head.rotation.x = -lean * 0.5;
}

const POSES = {
  idle(r, t) {
    const b = Math.sin(t * 2.1);
    reset(r);
    r.parts.body.position.y = b * 0.012;
    r.parts.armL.rotation.x = 0.06 + b * 0.03;
    r.parts.armR.rotation.x = 0.06 - b * 0.03;
    r.parts.head.rotation.y = Math.sin(t * 0.7) * 0.08;
    r.parts.body.rotation.x = 0.04;
  },
  walk(r, t) {
    locomotion(r, t, 4.6, 0.5, 0.1);
  },
  run(r, t) {
    locomotion(r, t, 8.6, 0.95, 0.24);
  },
  attack(r, t) {
    const p = clamp01(t / 0.5);
    reset(r);
    r.parts.legL.rotation.x = 0.25;
    r.parts.legR.rotation.x = -0.25;
    if (p < 0.45) {
      const k = p / 0.45;
      r.parts.armR.rotation.x = lerp(-0.2, -2.3, k);
      r.parts.armR.rotation.y = lerp(0, 0.6, k);
      r.parts.body.rotation.y = lerp(0, 0.5, k);
    } else {
      const k = easeOut((p - 0.45) / 0.55);
      r.parts.armR.rotation.x = lerp(-2.3, 1.05, k);
      r.parts.armR.rotation.y = lerp(0.6, -0.2, k);
      r.parts.body.rotation.y = lerp(0.5, -0.15, k);
    }
    r.parts.body.rotation.x = 0.3;
  },
  attack_heavy(r, t) {
    const p = clamp01(t / 0.85);
    reset(r);
    r.parts.legL.rotation.x = 0.3;
    r.parts.legR.rotation.x = -0.3;
    if (p < 0.5) {
      const k = p / 0.5;
      r.parts.armL.rotation.x = lerp(-0.2, -2.9, k);
      r.parts.armR.rotation.x = lerp(-0.2, -2.9, k);
      r.parts.body.position.y = lerp(0, 0.06, k);
    } else {
      const k = easeOut((p - 0.5) / 0.5);
      r.parts.armL.rotation.x = lerp(-2.9, 0.6, k);
      r.parts.armR.rotation.x = lerp(-2.9, 0.6, k);
      r.parts.body.position.y = lerp(0.06, -0.14, k);
      r.parts.body.rotation.x = 0.45 * k;
    }
  },
  dodge(r, t) {
    const p = clamp01(t / 0.45);
    reset(r);
    r.parts.body.rotation.x = -p * Math.PI * 2; // forward roll
    r.parts.body.position.y = -Math.sin(p * Math.PI) * 0.24;
    r.parts.armL.rotation.x = -1.3;
    r.parts.armR.rotation.x = -1.3;
    r.parts.legL.rotation.x = -1.1;
    r.parts.legR.rotation.x = -1.1;
  },
  block(r, t) {
    reset(r);
    r.parts.armL.rotation.set(-1.8, 0.2, 0.6);
    r.parts.armR.rotation.set(-1.8, -0.2, -0.6);
    r.parts.legL.rotation.x = 0.28;
    r.parts.legR.rotation.x = -0.28;
    r.parts.body.rotation.x = 0.14;
    r.parts.head.rotation.x = 0.12;
  },
  hurt(r, t) {
    const p = clamp01(t / 0.35);
    reset(r);
    r.parts.body.rotation.x = -0.4 * (1 - p);
    r.parts.head.rotation.x = -0.3 * (1 - p);
    r.parts.armL.rotation.x = 0.4 * (1 - p);
    r.parts.armR.rotation.x = 0.4 * (1 - p);
  },
  stagger(r, t) {
    reset(r);
    r.parts.body.rotation.x = 0.5 + Math.sin(t * 3) * 0.05;
    r.parts.body.position.y = -0.12;
    r.parts.armL.rotation.x = 0.35;
    r.parts.armR.rotation.x = 0.35;
    r.parts.head.rotation.x = 0.35;
  },
  death(r, t) {
    const p = clamp01(t / 1.4);
    reset(r);
    r.parts.body.rotation.x = -easeOut(p) * Math.PI * 0.48;
    r.parts.body.position.y = -0.05 * p;
    r.parts.armL.rotation.z = 0.1 + p * 0.9;
    r.parts.armR.rotation.z = -0.1 - p * 0.9;
    r.parts.legL.rotation.x = 0.2 * p;
    r.parts.legR.rotation.x = -0.1 * p;
  },
  victory(r, t) {
    reset(r);
    const b = Math.sin(t * 3);
    r.parts.armL.rotation.x = -2.9 + b * 0.1;
    r.parts.armR.rotation.x = -2.9 - b * 0.1;
    r.parts.head.rotation.x = -0.2;
  },
  // --- Handler-only ---
  swipe(r, t) {
    const p = clamp01(t / 0.8);
    reset(r);
    if (p < 0.4) {
      const k = p / 0.4;
      r.parts.armR.rotation.x = lerp(-0.2, -1.4, k);
      r.parts.armR.rotation.y = lerp(0, -1.6, k);
      r.parts.body.rotation.y = lerp(0, -0.55, k);
    } else if (p < 0.65) {
      const k = easeOut((p - 0.4) / 0.25);
      r.parts.armR.rotation.x = -1.1;
      r.parts.armR.rotation.y = lerp(-1.6, 1.5, k);
      r.parts.body.rotation.y = lerp(-0.55, 0.45, k);
    } else {
      const k = (p - 0.65) / 0.35;
      r.parts.armR.rotation.x = lerp(-1.1, -0.3, k);
      r.parts.armR.rotation.y = lerp(1.5, 0.2, k);
      r.parts.body.rotation.y = lerp(0.45, 0, k);
    }
    r.parts.body.rotation.x = 0.22;
    r.parts.armL.rotation.x = 0.3;
  },
  lunge(r, t) {
    const p = clamp01(t / 0.55);
    reset(r);
    r.parts.body.rotation.x = 0.55;
    r.parts.body.position.y = -0.16;
    r.parts.armL.rotation.x = -1.5;
    r.parts.armR.rotation.x = -1.6;
    r.parts.legL.rotation.x = 0.5;
    r.parts.legR.rotation.x = -0.5;
  },
  shockwave(r, t) {
    const p = clamp01(t / 0.95);
    reset(r);
    if (p < 0.5) {
      const k = p / 0.5;
      r.parts.armL.rotation.x = lerp(-0.2, -2.95, k);
      r.parts.armR.rotation.x = lerp(-0.2, -2.95, k);
      r.parts.body.position.y = lerp(0, 0.05, k);
    } else if (p < 0.62) {
      const k = easeOut((p - 0.5) / 0.12);
      r.parts.armL.rotation.x = lerp(-2.95, -0.35, k);
      r.parts.armR.rotation.x = lerp(-2.95, -0.35, k);
      r.parts.body.position.y = lerp(0.05, -0.2, k);
      r.parts.body.rotation.x = 0.4 * k;
    } else {
      r.parts.armL.rotation.x = -0.35;
      r.parts.armR.rotation.x = -0.35;
      r.parts.body.position.y = -0.2;
      r.parts.body.rotation.x = 0.4;
    }
  },
  roar(r, t) {
    reset(r);
    const b = Math.sin(t * 9) * 0.04;
    r.parts.armL.rotation.set(-0.5, 0, 1.15 + b);
    r.parts.armR.rotation.set(-0.5, 0, -1.15 - b);
    r.parts.head.rotation.x = -0.3;
    r.parts.body.rotation.x = -0.16;
    r.parts.body.position.y = b * 0.5;
  },
};

function poseRig(rig, t) {
  const pose = POSES[rig.action];
  if (pose) pose(rig, t);
}

/* ------------------------------------------------------------------ *
 * Public entry point
 * ------------------------------------------------------------------ */

export async function loadCharacter(assets, kind) {
  const def = MANIFEST[kind];
  if (!def) throw new Error(`[level03] unknown character "${kind}"`);
  try {
    const gltf = await assets.model(def.path);
    return rigFromGLB(gltf, def);
  } catch (e) {
    // no GLB yet — that's the expected state until the character art lands
    console.info(
      `[level03] "${def.path}" not found, using the procedural ${kind} rig`,
    );
    return buildProceduralRig(kind);
  }
}

/** Apply fn(material) to every material under a rig (rim, dissolve, tint). */
export function applyToMaterials(root, fn) {
  root.traverse((obj) => {
    const mats = Array.isArray(obj.material)
      ? obj.material
      : obj.material
        ? [obj.material]
        : [];
    for (const m of mats) fn(m);
  });
}
