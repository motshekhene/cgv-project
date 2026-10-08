import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { DustOff } from './DustOff.js';
import { FootPlant } from './FootPlant.js';

/**
 * Fighter — visual + animation layer shared by Kai and the Handler.
 *
 * Wraps a rigged model in root > visual > pivot > model. `root` is what
 * gameplay moves; `pivot` is what procedural effects (roll, lean, flinch)
 * rotate around the body's centre. If no model is supplied it falls back to a
 * capsule so the level is always playable.
 *
 * Two rigs:
 *   Quaternius FBX ("HumanArmature", the Handler and the intros' Kai). Clips:
 *     idle, walk, run, punch, swordslash, death, jump. There is no block / kick
 *     clip, so the guard and the kicks are posed by hand here.
 *   Mixamo (Level 3's Kai and Handler, built by tools/build-character.py). Real clips for
 *     everything; the guard is the block clip's pose, held (guardPose).
 * bone('PalmR') etc. finds a bone by its Quaternius name on either rig.
 */
const MODEL_HEIGHT_UNITS = 482.7; // measured: the Quaternius FBX is authored in centimetres
const CENTRE_Y = 0.9;

// Quaternius bone names -> Mixamo's (GLTFLoader drops the ':' from "mixamorig:Hips")
const MIXAMO = {
  Head: 'Head', Hips: 'Hips', Torso: 'Spine2', PalmL: 'LeftHand', PalmR: 'RightHand',
  FingersL: 'LeftHandMiddle1', FingersR: 'RightHandMiddle1', LowerArmL: 'LeftForeArm', LowerArmR: 'RightForeArm',
  LowerLegL: 'LeftLeg', LowerLegR: 'RightLeg', FootL: 'LeftFoot', FootR: 'RightFoot',
};
const MIXAMO_ARMS = /^mixamorig(Left|Right)(Shoulder|Arm|ForeArm|Hand)/; // shoulders down to the fingertips

// Guard pose: offsets applied on top of the playing clip so both fists sit in
// front of the chin. Solved against the rig's bone axes (XYZ Euler, degrees).
const D = Math.PI / 180;
const GUARD = {
  UpperArmL: [0, 40, -40],
  LowerArmL: [80, -40, -100],
  UpperArmR: [-40, 20, 20],
  LowerArmR: [-40, 100, -100],
};

// Kick pose per leg (front kick, thigh level with the hip, shin extended).
// The foot is an IK-style bone hanging off the root, so it is moved along with the shin.
const KICK = {
  R: { up: 'UpperLegR', lo: 'LowerLegR', end: 'LowerLegR_end', foot: 'FootR', upE: [-90, 120, 10], loE: [-30, -10, -10] },
  L: { up: 'UpperLegL', lo: 'LowerLegL', end: 'LowerLegL_end', foot: 'FootL', upE: [-90, 60, 10], loE: [-60, -70, -40] },
};

const _q = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qf = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _pf = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);

export class Fighter {
  /**
   * modelHeight: the model's own height in its units (the Quaternius FBX default
   * if omitted). guardPose: { clip, at }, a clip and time whose arm pose is the
   * guard, for rigs with a block clip instead of the hand-posed one.
   */
  constructor(parent, {
    source = null, height = 1.8, capsuleColor = 0xdfe8ee, darken = 1, palette = {},
    modelHeight = MODEL_HEIGHT_UNITS, guardPose = null,
  } = {}) {
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
    this.materials = [];
    this.lean = 0;
    this.leanTarget = 0;
    this.flinchT = 0;
    this.rollT = 0;
    this.rollDur = 0;
    this.flashT = 0;
    this.flashColor = new THREE.Color(0xffffff);
    this.guard = 0;
    this.guardTarget = 0;
    this.guardBones = [];
    this.kickRig = null;
    this._modified = []; // bones we posed last frame, restored before the mixer runs
    this.kickSide = 'R';
    this.kickWeight = 0;
    this.shakeT = 0;
    this.shakeDur = 0;
    this.shakeAmp = 0; // eased 0..1, so a cancelled shake settles instead of snapping
    this.headBone = null;
    this.bones = {};
    this.rig = 'none';

    if (source) this._buildFromModel(source, height, darken, palette, modelHeight, guardPose);
    else this._buildCapsule(height, capsuleColor);
  }

  _buildFromModel(source, height, darken, palette, modelHeight, guardPose) {
    const model = cloneSkinned(source);
    const s = height / modelHeight;
    model.scale.setScalar(s);
    model.position.y = -CENTRE_Y;
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.frustumCulled = false;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      const cloned = list.map((m) => {
        // FBX imports as glossy Phong, which turns cloth into silver highlights.
        // Matte PBR keeps the clothes reading as their real colours.
        const cutout = m.transparent || m.alphaTest > 0; // hair cards and eyelashes: alpha-tested, both sides
        const c = new THREE.MeshStandardMaterial({
          name: m.name,
          color: palette[m.name] !== undefined ? new THREE.Color(palette[m.name]) : m.color ? m.color.clone() : new THREE.Color(0xffffff),
          map: m.map || null,
          normalMap: m.normalMap || null,
          roughness: 0.92,
          metalness: 0,
          alphaTest: cutout ? 0.5 : 0,
          side: cutout ? THREE.DoubleSide : THREE.FrontSide,
        });
        if (m.normalMap) c.normalScale.copy(m.normalScale);
        if (darken !== 1) c.color.multiplyScalar(darken);
        c.userData.baseEmissive = c.emissive.clone();
        this.materials.push(c);
        return c;
      });
      o.material = Array.isArray(o.material) ? cloned : cloned[0];
    });
    this.pivot.add(model);
    this.model = model;
    model.traverse((o) => {
      if (o.isBone && GUARD[o.name]) {
        const [x, y, z] = GUARD[o.name];
        this.guardBones.push({ bone: o, offset: new THREE.Quaternion().setFromEuler(new THREE.Euler(x * D, y * D, z * D)) });
      }
    });

    const byName = this.bones;
    model.traverse((o) => { if (o.isBone) byName[o.name] = o; });
    this.rig = byName.mixamorigHips ? 'mixamo' : 'quaternius';
    this.headBone = this.bone('Head');
    this.dust = this.rig === 'mixamo' ? DustOff.for(this) : null;
    this.feet = this.rig === 'mixamo' ? FootPlant.for(this) : null;
    if (byName.FootR && byName.UpperLegR && byName.LowerLegR && byName.LowerLegR_end) {
      this.kickRig = {};
      for (const side of ['R', 'L']) {
        const k = KICK[side];
        const e = (a) => new THREE.Quaternion().setFromEuler(new THREE.Euler(a[0] * D, a[1] * D, a[2] * D));
        this.kickRig[side] = {
          up: byName[k.up], lo: byName[k.lo], end: byName[k.end], foot: byName[k.foot],
          upQ: e(k.upE), loQ: e(k.loE),
        };
      }
    }

    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of source.animations) {
      const key = clip.name.split('Man_').pop().toLowerCase();
      this.actions[key] = this.mixer.clipAction(clip);
    }
    if (guardPose) this._guardFromClip(guardPose.clip, guardPose.at);
    this.play('idle');
  }

  /** A bone by its Quaternius name ('PalmR', 'FootL', 'Head'...), on either rig. */
  bone(name) {
    return this.bones[name] || this.bones['mixamorig' + (MIXAMO[name] || name)] || null;
  }

  /** Guard = the arms as they are `at` seconds into `clip` (e.g. the block, fully up). */
  _guardFromClip(name, at) {
    const clip = this.actions[name]?.getClip();
    if (!clip) return;
    for (const track of clip.tracks) {
      if (!track.name.endsWith('.quaternion')) continue;
      const boneName = track.name.slice(0, -'.quaternion'.length);
      const bone = this.bones[boneName];
      if (!bone || !MIXAMO_ARMS.test(boneName)) continue;
      const v = track.createInterpolant().evaluate(at);
      this.guardBones.push({ bone, target: new THREE.Quaternion(v[0], v[1], v[2], v[3]).normalize() });
    }
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
  }

  play(name, { loop = true, fade = 0.1, speed = 1 } = {}) {
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

  /** Restart a one-shot clip (from `from` seconds in) even if it is already current. */
  playOnce(name, { fade = 0.04, speed = 1, from = 0 } = {}) {
    const next = this.actions[name];
    if (!next) return 0;
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
    next.timeScale = speed;
    next.reset();
    next.time = from;
    next.fadeIn(fade).play();
    if (this.current && this.current !== next) this.current.fadeOut(fade);
    this.current = next;
    this.currentName = name;
    return (next.getClip().duration - from) / speed;
  }

  /** Change the playing clip's speed without restarting it (0 holds it still). */
  setSpeed(speed) {
    if (this.current) this.current.timeScale = speed;
  }

  /** Hold a clip still at `at` seconds, as a pose (e.g. the guard), fading into it unless it's already held. */
  hold(name, at, fade = 0.12) {
    const next = this.actions[name];
    if (!next || (this.current === next && next.timeScale === 0)) return;
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
    const already = this.current === next; // e.g. the blocked-hit recoil, which ends on this pose: no fade
    next.reset();
    next.time = at;
    next.timeScale = 0;
    next.play();
    if (!already) {
      next.fadeIn(fade);
      if (this.current) this.current.fadeOut(fade);
    }
    this.current = next;
    this.currentName = name;
  }

  clipDuration(name) {
    return this.actions[name] ? this.actions[name].getClip().duration : 0;
  }

  /**
   * Make `name` a held pose: clip `from` as it is `at` seconds in, frozen (a
   * still clip, so it plays like any other). For a move the rig has no clip
   * for, built from one it has. False if there's no `from`.
   */
  pose(name, from, at) {
    const clip = this.actions[from]?.getClip();
    if (!clip) return false;
    const tracks = clip.tracks.map((t) => {
      const v = Array.from(t.createInterpolant().evaluate(at));
      return new t.constructor(t.name, [0, 1], [...v, ...v]);
    });
    this.actions[name] = this.mixer.clipAction(new THREE.AnimationClip(`${name}-pose`, 1, tracks));
    return true;
  }

  /**
   * How high the lower foot sits above `root` through a clip, every 1/fps s:
   * where a move stands, leaves the ground and lands. Plays the clip on its own
   * to measure it, so call it before the fight starts; leaves idle playing.
   */
  footTrack(name, fps = 30) {
    const act = this.actions[name];
    const fl = this.bone('FootL'), fr = this.bone('FootR');
    if (!act || !fl || !fr) return null;
    const out = [];
    this.mixer.stopAllAction();
    act.reset().play();
    for (let i = 0, n = Math.floor(act.getClip().duration * fps); i <= n; i++) {
      act.time = i / fps;
      this.mixer.update(0);
      this.root.updateMatrixWorld(true);
      out.push(Math.min(fl.getWorldPosition(_p0).y, fr.getWorldPosition(_p1).y) - this.root.position.y);
    }
    act.stop();
    this.current = null;
    this.play('idle', { fade: 0 });
    return out;
  }

  roll(duration) {
    this.rollT = 0;
    this.rollDur = duration;
  }

  flinch() {
    this.flinchT = 0.25;
    this.flash(0xffffff, 0.12);
  }

  /**
   * Get the water off. The Mixamo rig does it like a person (DustOff: shakes
   * the head, wipes the face and hair, shakes the hands out; 'quick' skips the
   * wipe); the Quaternius one, with no arms to pose, twists side to side like a
   * dog, the head whipping a beat behind.
   */
  shake(duration, kind = 'full') {
    if (this.dust) {
      this.dust.start(kind);
      return;
    }
    this.shakeT = 0;
    this.shakeDur = duration;
  }

  stopShake() {
    this.shakeDur = 0;
    if (this.dust) this.dust.stop();
  }

  get shaking() {
    return this.shakeDur > 0 || !!this.dust?.active;
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

  /** Raise both fists in front of the face (blocking). Blended in and out. */
  setGuard(on, amount = 1) {
    this.guardTarget = on ? amount : 0;
  }

  /** side 'R' | 'L', weight 0..1 (driven per frame by the attack timeline). */
  setKick(side, weight) {
    if (side) this.kickSide = side;
    this.kickWeight = weight;
  }

  _applyKick() {
    const k = this.kickRig[this.kickSide];
    const w = this.kickWeight;
    this._stash(k.up);
    this._stash(k.lo);
    this._stash(k.foot);
    this.model.updateMatrixWorld(true);
    k.end.getWorldPosition(_p0);
    k.foot.getWorldPosition(_pf);
    k.lo.getWorldQuaternion(_qb);
    k.foot.getWorldQuaternion(_qf);

    _q.identity().slerp(k.upQ, w);
    k.up.quaternion.multiply(_q);
    _q.identity().slerp(k.loQ, w);
    k.lo.quaternion.multiply(_q);
    k.up.updateMatrixWorld(true);

    k.end.getWorldPosition(_p1);
    k.lo.getWorldQuaternion(_qa);
    _pf.add(_p1.sub(_p0));
    _qf.premultiply(_qa.multiply(_qb.invert()));

    k.foot.parent.worldToLocal(_pf);
    k.foot.position.copy(_pf);
    k.foot.parent.getWorldQuaternion(_qp);
    k.foot.quaternion.copy(_qp.invert().multiply(_qf));
  }

  setLean(radians) {
    this.leanTarget = radians;
  }

  setVisible(v) {
    this.root.visible = v;
  }

  // three.js only re-writes an animated bone when its keyframe value changes, so any
  // procedural offset must be undone by hand or it compounds on constant tracks.
  _stash(bone) {
    this._modified.push({ bone, p: bone.position.clone(), q: bone.quaternion.clone() });
  }

  update(dt) {
    // newest first: a bone posed by two layers was stashed twice, and the first stash is the clip's own pose
    for (let i = this._modified.length - 1; i >= 0; i--) {
      const m = this._modified[i];
      m.bone.position.copy(m.p);
      m.bone.quaternion.copy(m.q);
    }
    this._modified.length = 0;
    if (this.mixer) this.mixer.update(dt);
    if (this.feet) this.feet.apply(dt);
    this.guard += (this.guardTarget - this.guard) * (1 - Math.exp(-18 * dt));
    if (this.kickRig && this.kickWeight > 0.005) this._applyKick();
    if (this.guard > 0.01) {
      for (const g of this.guardBones) {
        this._stash(g.bone);
        if (g.target) {
          g.bone.quaternion.slerp(g.target, this.guard); // a held pose: blend the clip's arms toward it
        } else {
          _q.identity().slerp(g.offset, this.guard); // an offset: add it on top of the clip
          g.bone.quaternion.multiply(_q);
        }
      }
    }
    if (this.dust) this.dust.apply(dt);

    this.lean += (this.leanTarget - this.lean) * (1 - Math.exp(-14 * dt));
    let pitch = this.lean;
    if (this.flinchT > 0) {
      this.flinchT -= dt;
      pitch += Math.sin(Math.max(0, this.flinchT) / 0.25 * Math.PI) * 0.35;
    }
    let py = CENTRE_Y;
    if (this.rollDur > 0) {
      this.rollT += dt;
      const k = Math.min(1, this.rollT / this.rollDur);
      pitch += k * Math.PI * 2;
      py = CENTRE_Y - Math.sin(k * Math.PI) * 0.35;
      if (k >= 1) this.rollDur = 0;
    }
    this.pivot.rotation.x = pitch;
    this.pivot.position.y = py;

    // the Quaternius rig's shake-off: no clip for it, so it's procedural like the roll
    if (this.shakeDur > 0) {
      this.shakeT += dt;
      if (this.shakeT >= this.shakeDur) this.shakeDur = 0;
    }
    const env = this.shakeDur > 0 ? Math.sin((this.shakeT / this.shakeDur) * Math.PI) ** 0.6 : 0;
    this.shakeAmp += (env - this.shakeAmp) * (1 - Math.exp(-25 * dt));
    if (this.shakeAmp > 0.002) {
      const w = this.shakeT * Math.PI * 2 * 5.5;
      this.pivot.rotation.y = Math.sin(w) * 0.32 * this.shakeAmp;
      this.pivot.rotation.z = Math.sin(w + 1.3) * 0.06 * this.shakeAmp;
      if (this.headBone) {
        this._stash(this.headBone);
        _q.setFromAxisAngle(_Y, -Math.sin(w - 0.7) * 0.45 * this.shakeAmp);
        this.headBone.quaternion.multiply(_q);
      }
    } else {
      this.shakeAmp = 0;
      this.pivot.rotation.y = this.pivot.rotation.z = 0;
    }

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
}
