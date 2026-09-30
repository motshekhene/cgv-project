import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

/**
 * Fighter v2 — visual + animation layer shared by Kai and the Handler.
 *
 * BACKWARD COMPATIBLE: CombatController and HandlerBoss keep working unchanged.
 * `new Fighter(parent, { source })` now accepts either
 *   - an FBX Group (assets.fbx)          -> has .animations on the group
 *   - a glTF result (assets.model)       -> has .scene and .animations
 *
 * What is new
 *   - Auto height: the model is measured and scaled to `height` metres, so any
 *     downloaded character works. No more magic 482.7. (Override with
 *     `modelHeightUnits` if a rig measures wrong.)
 *   - Clip aliases: clips are matched by name pattern, so "Standing Run
 *     Forward", "mixamo.com|Run" and "Man_Run" all become `run`.
 *   - `extraClips`: animation-only files (Mixamo "without skin") can be merged
 *     in as long as they share the character's rig.
 *   - `inPlace`: strips hip translation so Mixamo root motion cannot fight
 *     the gameplay code that moves `root`.
 *   - findBone() / findMesh(): look things up by pattern instead of an exact
 *     name (the boss uses this to find the head and a separate helmet mesh).
 *   - dispose(): frees cloned materials and stops the mixer. The old version
 *     leaked both on every restart.
 *
 * Canonical clip names gameplay can ask for:
 *   idle walk run punch swordslash death jump  (already used by the game)
 *   block hit roll heavy                       (new; optional, procedural
 *                                               fallback stays if missing)
 */
const MODEL_HEIGHT_UNITS_LEGACY = 482.7; // the old Quaternius FBX, in cm
const CENTRE_Y = 0.9;

// canonical name -> patterns tried in order against the lowercased clip name
const ALIASES = {
  idle: [/(^|[^a-z])idle/],
  walk: [/walk/],
  run: [/(^|[^a-z])run/, /jog/, /sprint/],
  punch: [/punch/, /jab/, /(^|[^a-z])attack[^a-z]*1/],
  swordslash: [/swordslash/, /slash/, /(^|[^a-z])attack[^a-z]*2/, /swing/],
  heavy: [/heavy/, /overhead/, /(^|[^a-z])attack[^a-z]*3/, /smash/],
  death: [/death/, /die/, /dying/],
  jump: [/jump/],
  block: [/block/, /guard/, /defen/],
  hit: [/hit[^a-z]*react/, /react/, /(^|[^a-z])hit/, /impact/, /flinch/],
  roll: [/roll/, /dodge/, /dive/],
};

export class Fighter {
  constructor(
    parent,
    {
      source = null,
      height = 1.8,
      capsuleColor = 0xdfe8ee,
      darken = 1,
      inPlace = true,
      extraClips = [],
      modelHeightUnits = null,
      aliases = {}, // e.g. { punch: [/mixamo.*jab/] } to override per character
    } = {},
  ) {
    this.root = new THREE.Group();
    this.visual = new THREE.Group();
    this.pivot = new THREE.Group();
    this.pivot.position.y = CENTRE_Y;
    this.root.add(this.visual);
    this.visual.add(this.pivot);
    parent.add(this.root);

    this.mixer = null;
    this.actions = {};
    this.current = null;
    this.currentName = null;
    this.materials = [];
    this.lean = 0;
    this.leanTarget = 0;
    this.flinchT = 0;
    this.rollT = 0;
    this.rollDur = 0;
    this.flashT = 0;
    this.flashColor = new THREE.Color(0xffffff);
    this._glow = 0;
    this._glowHex = 0;
    this._aliases = aliases;
    this._inPlace = inPlace;
    this._guard = false;
    this._procedural = null;
    this._poseOffsets = [];

    if (source) this._buildFromModel(source, { height, darken, extraClips, modelHeightUnits });
    else this._buildCapsule(height, capsuleColor);
  }

  /* ---------------------------------------------------------------- build */

  _buildFromModel(source, { height, darken, extraClips, modelHeightUnits }) {
    const isGltf = !!source.scene;
    const template = isGltf ? source.scene : source;
    const clips = [...(source.animations || []), ...extraClips.flatMap((c) => c.animations || c)];

    const model = cloneSkinned(template);

    // ---- scale to the requested height ----
    if (modelHeightUnits) {
      model.scale.setScalar(height / modelHeightUnits);
    } else {
      const box = new THREE.Box3().setFromObject(model);
      const h = box.max.y - box.min.y;
      model.scale.setScalar(h > 0.0001 ? height / h : height / MODEL_HEIGHT_UNITS_LEGACY);
    }
    // stand the feet on y = 0 of the root (pivot sits CENTRE_Y above it)
    model.updateMatrixWorld(true);
    const scaled = new THREE.Box3().setFromObject(model);
    model.position.y = -CENTRE_Y - scaled.min.y;

    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.frustumCulled = false;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      const cloned = list.map((m) => {
        const c = m.clone();
        if (darken !== 1 && c.color) c.color.multiplyScalar(darken);
        c.userData.baseEmissive = c.emissive ? c.emissive.clone() : new THREE.Color(0);
        this.materials.push(c);
        return c;
      });
      o.material = Array.isArray(o.material) ? cloned : cloned[0];
    });
    this.pivot.add(model);
    this.model = model;

    this.mixer = new THREE.AnimationMixer(model);
    this.addClips(clips);
    this.play('idle');
  }

  _buildCapsule(height, color) {
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.4, height - 0.8, 4, 10),
      new THREE.MeshStandardMaterial({ color, roughness: 0.5 }),
    );
    body.position.y = 0;
    body.castShadow = true;
    this.pivot.add(body);
    const m = body.material;
    m.userData.baseEmissive = m.emissive.clone();
    this.materials.push(m);
    this.model = null;
  }

  /** Merge more clips (same rig) after construction. Safe to call repeatedly. */
  addClips(clips) {
    if (!this.mixer) return;
    for (const raw of clips) {
      const clip = this._inPlace ? this._stripRootMotion(raw.clone()) : raw;
      const lower = clip.name.toLowerCase();
      // 1) legacy Quaternius naming: "HumanArmature|Man_Run" -> "run"
      const legacy = clip.name.split('Man_').pop().toLowerCase();
      const action = this.mixer.clipAction(clip);
      this.actions[legacy] = this.actions[legacy] || action;
      // 2) alias patterns -> canonical names
      for (const [canon, pats] of Object.entries(ALIASES)) {
        const custom = this._aliases[canon];
        const list = custom ? [...custom, ...pats] : pats;
        if (list.some((re) => re.test(lower))) {
          if (!this.actions[canon]) this.actions[canon] = action;
        }
      }
    }
  }

  /** Remove hip / root translation so gameplay code owns all movement. */
  _stripRootMotion(clip) {
    clip.tracks = clip.tracks.filter((t) => !/(hips|root|pelvis)[^.]*\.position$/i.test(t.name));
    return clip;
  }

  /* -------------------------------------------------------------- lookups */

  hasClip(name) {
    return !!this.actions[name];
  }

  /** First bone whose name matches, e.g. findBone(/head$/i). Works for any rig. */
  findBone(re) {
    let found = null;
    (this.model || this.pivot).traverse((o) => {
      if (!found && o.isBone && re.test(o.name)) found = o;
    });
    return found;
  }

  /** First mesh whose name matches, e.g. findMesh(/helmet/i). */
  findMesh(re) {
    let found = null;
    (this.model || this.pivot).traverse((o) => {
      if (!found && o.isMesh && re.test(o.name)) found = o;
    });
    return found;
  }

  /* ------------------------------------------------------------ animation */

  play(name, { loop = true, fade = 0.15, speed = 1 } = {}) {
    if (name !== this._procedural?.name) this._procedural = null;
    const next = this.actions[name];
    if (!next) return;
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = !loop;
    next.timeScale = speed;
    if (this.current === next) return;
    next.reset().fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = next;
    this.currentName = name;
  }

  /** Restart a one-shot clip from the beginning even if it is already current. */
  playOnce(name, { fade = 0.08, speed = 1 } = {}) {
    const next = this.actions[name];
    if (!next) {
      if (['punch', 'swordslash', 'heavy'].includes(name)) {
        const duration = name === 'heavy' ? 0.62 : name === 'swordslash' ? 0.5 : 0.42;
        this._procedural = { name, t: 0, duration: duration / speed };
        return this._procedural.duration;
      }
      return 0;
    }
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
    next.timeScale = speed;
    next.reset().fadeIn(fade).play();
    if (this.current && this.current !== next) this.current.fadeOut(fade);
    this.current = next;
    this.currentName = name;
    this._procedural = null;
    return next.getClip().duration / speed;
  }

  /** A short authored body mechanic layered over the current rig animation. */
  playPose(name, { duration = 0.58 } = {}) {
    this._procedural = { name, t: 0, duration };
    return duration;
  }

  clipDuration(name) {
    return this.actions[name] ? this.actions[name].getClip().duration : 0;
  }

  roll(duration) {
    if (this.actions.roll) {
      const d = this.actions.roll.getClip().duration;
      this.playOnce('roll', { fade: 0.05, speed: d / Math.max(0.05, duration) });
      this.rollDur = 0;
      return;
    }
    // Keep a grounded evasive crouch if this rig has no roll animation.
    this.rollT = 0;
    this.rollDur = duration;
  }

  flinch() {
    this.flinchT = this.actions.hit ? 0 : 0.25;
    if (this.actions.hit) this.playOnce('hit', { fade: 0.05, speed: 1.4 });
  }

  flash(hex, seconds = 0.12) {
    this.flashColor.set(hex);
    this.flashT = seconds;
  }

  /** Continuous glow, e.g. the boss's attack tell. 0 turns it off. */
  setGlow(hex, intensity) {
    this._glowHex = hex;
    this._glow = intensity;
  }

  setLean(radians) {
    this.leanTarget = radians;
  }

  setGuard(active) {
    this._guard = !!active;
    if (this._guard && !this.actions.block) this._procedural = null;
  }

  _applyRigPose() {
    for (const item of this._poseOffsets) item.bone.quaternion.multiply(item.offset.clone().invert());
    this._poseOffsets.length = 0;
    if (!this.model) return;

    const add = (bone, x = 0, y = 0, z = 0, weight = 1) => {
      if (!bone || weight <= 0) return;
      const offset = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(x * weight, y * weight, z * weight, 'XYZ'),
      );
      bone.quaternion.multiply(offset);
      this._poseOffsets.push({ bone, offset });
    };
    const leftArm = this.findBone(/(?:LeftArm|upperarm_l)$/i);
    const leftFore = this.findBone(/(?:LeftForeArm|lowerarm_l)$/i);
    const rightArm = this.findBone(/(?:RightArm|upperarm_r)$/i);
    const rightFore = this.findBone(/(?:RightForeArm|lowerarm_r)$/i);
    const spine = this.findBone(/(?:Spine2|spine_03|spine_02)$/i);

    if (this._guard) {
      add(leftArm, -0.8, 0, 0.28, 0.65);
      add(leftFore, -0.45, 0, 0, 0.65);
      add(rightArm, -0.72, 0, -0.22, 0.65);
      add(rightFore, -0.42, 0, 0, 0.65);
    }

    if (this._procedural) {
      const p = this._procedural;
      p.t += this._lastDt || 0;
      const u = Math.max(0, Math.min(1, p.t / p.duration));
      const envelope = Math.sin(Math.PI * u);
      const ramp = (a, b, v) => {
        const x = Math.max(0, Math.min(1, (v - a) / (b - a)));
        return x * x * (3 - 2 * x);
      };
      const strike = ramp(0.18, 0.48, u) * (1 - ramp(0.76, 1, u));
      const load = 1 - ramp(0.02, 0.32, u);
      switch (p.name) {
        case 'swordslash':
        case 'hook':
          add(rightArm, -0.32 * strike, 0.46 * strike, -1.12 * strike);
          add(rightFore, -0.72 * strike, 0, -0.28 * strike);
          add(spine, 0, -0.46 * strike, 0.08 * strike);
          break;
        case 'cross':
        case 'jab':
          add(rightArm, -1.08 * strike, 0.08 * strike, -0.12 * strike);
          add(rightFore, -0.55 * strike, 0, 0);
          add(spine, 0, -0.18 * strike, 0.04 * strike);
          break;
        case 'hammer':
          add(rightArm, -1.05 * load - 0.42 * strike, 0, -0.58 * load);
          add(leftArm, -0.86 * load - 0.25 * strike, 0, 0.54 * load);
          add(rightFore, -0.64 * strike, 0, 0);
          add(spine, 0.12 * load + 0.24 * strike, 0, 0.08 * strike);
          break;
        case 'sweep':
          add(rightArm, -0.3 * strike, 0.74 * strike, -0.78 * strike);
          add(rightFore, -0.26 * strike, 0, -0.52 * strike);
          add(leftArm, -0.25 * strike, -0.24 * strike, 0.62 * strike, 0.8);
          add(spine, 0.26 * strike, -0.7 * strike, 0.04 * strike);
          break;
        case 'heavy':
          add(rightArm, -1.12 * envelope, 0, -0.38 * envelope);
          add(rightFore, -0.52 * envelope, 0, 0);
          add(spine, 0.2 * envelope, 0, 0.05 * envelope);
          break;
        default:
          add(rightArm, -0.95 * envelope, 0.05 * envelope, -0.28 * envelope);
          add(rightFore, -0.5 * envelope, 0, 0);
          add(spine, 0, -0.24 * envelope, 0.05 * envelope);
      }
      if (!['hammer', 'sweep'].includes(p.name)) add(leftArm, -0.55 * envelope, 0, 0.25 * envelope, 0.45);
      if (u >= 1) this._procedural = null;
    }
  }


  setVisible(v) {
    this.root.visible = v;
  }

  update(dt) {
    // Remove last frame's local pose offsets before the animation mixer samples
    // the next frame; this avoids rotations accumulating over time.
    for (const item of this._poseOffsets) item.bone.quaternion.multiply(item.offset.clone().invert());
    this._poseOffsets.length = 0;
    if (this.mixer) this.mixer.update(dt);
    this._lastDt = dt;

    this.lean += (this.leanTarget - this.lean) * (1 - Math.exp(-14 * dt));
    let pitch = this.lean;
    if (this.flinchT > 0) {
      this.flinchT -= dt;
      pitch += Math.sin((Math.max(0, this.flinchT) / 0.25) * Math.PI) * 0.25;
    }
    let py = CENTRE_Y;
    if (this.rollDur > 0) {
      this.rollT += dt;
      const k = Math.min(1, this.rollT / this.rollDur);
      pitch += -0.28 * Math.sin(k * Math.PI);
      py = CENTRE_Y - Math.sin(k * Math.PI) * 0.22;
      if (k >= 1) this.rollDur = 0;
    }
    this.pivot.rotation.x = pitch;
    this.pivot.position.y = py;

    this._applyRigPose();
    if (this.flashT > 0) this.flashT -= dt;
    const flashing = this.flashT > 0;
    for (const m of this.materials) {
      if (!m.emissive) continue;
      if (flashing) {
        m.emissive.copy(this.flashColor);
        m.emissiveIntensity = 1.6;
      } else if (this._glow) {
        m.emissive.set(this._glowHex);
        m.emissiveIntensity = this._glow;
      } else {
        m.emissive.copy(m.userData.baseEmissive);
        m.emissiveIntensity = 1;
      }
    }
  }

  /* -------------------------------------------------------------- cleanup */

  /** Call from Level03.teardown() for both fighters. */
  dispose() {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.model);
      this.mixer = null;
    }
    for (const m of this.materials) m.dispose();
    this.materials.length = 0;
    this.root.traverse((o) => {
      if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose();
      if (o.isMesh && o.geometry && !this.model) o.geometry.dispose();
    });
    this.root.removeFromParent();
  }
}
