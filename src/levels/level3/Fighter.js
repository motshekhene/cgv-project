import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

/**
 * Fighter — visual + animation layer shared by Kai and the Handler.
 *
 * Wraps a Quaternius FBX (same "HumanArmature" rig on every character, so clip
 * names match) in root > visual > pivot > model. `root` is what gameplay moves;
 * `pivot` is what procedural effects (roll, lean, flinch) rotate around the
 * body's centre. If no model is supplied it falls back to a capsule so the
 * level is always playable.
 *
 * Clips available on the rig: idle, walk, run, punch, swordslash, death, jump.
 * There is no block / dodge / hit clip, so those are procedural here.
 */
const MODEL_HEIGHT_UNITS = 482.7; // measured: the FBX is authored in centimetres
const CENTRE_Y = 0.9;

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
  constructor(parent, { source = null, height = 1.8, capsuleColor = 0xdfe8ee, darken = 1, palette = {} } = {}) {
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

    if (source) this._buildFromModel(source, height, darken, palette);
    else this._buildCapsule(height, capsuleColor);
  }

  _buildFromModel(source, height, darken, palette) {
    const model = cloneSkinned(source);
    const s = height / MODEL_HEIGHT_UNITS;
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
        const c = new THREE.MeshStandardMaterial({
          name: m.name,
          color: palette[m.name] !== undefined ? new THREE.Color(palette[m.name]) : m.color ? m.color.clone() : new THREE.Color(0xffffff),
          map: m.map || null,
          roughness: 0.92,
          metalness: 0,
        });
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

    const byName = {};
    model.traverse((o) => { if (o.isBone) byName[o.name] = o; });
    this.headBone = byName.Head || null;
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

  /** Restart a one-shot clip from the beginning even if it is already current. */
  playOnce(name, { fade = 0.04, speed = 1 } = {}) {
    const next = this.actions[name];
    if (!next) return 0;
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
    next.timeScale = speed;
    next.reset().fadeIn(fade).play();
    if (this.current && this.current !== next) this.current.fadeOut(fade);
    this.current = next;
    this.currentName = name;
    return next.getClip().duration / speed;
  }

  clipDuration(name) {
    return this.actions[name] ? this.actions[name].getClip().duration : 0;
  }

  roll(duration) {
    this.rollT = 0;
    this.rollDur = duration;
  }

  flinch() {
    this.flinchT = 0.25;
    this.flash(0xffffff, 0.12);
  }

  /** Shake off water like a dog: the body twists side to side, the head whips a beat behind. */
  shake(duration) {
    this.shakeT = 0;
    this.shakeDur = duration;
  }

  stopShake() {
    this.shakeDur = 0;
  }

  get shaking() {
    return this.shakeDur > 0;
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
    for (const m of this._modified) {
      m.bone.position.copy(m.p);
      m.bone.quaternion.copy(m.q);
    }
    this._modified.length = 0;
    if (this.mixer) this.mixer.update(dt);
    this.guard += (this.guardTarget - this.guard) * (1 - Math.exp(-18 * dt));
    if (this.kickRig && this.kickWeight > 0.005) this._applyKick();
    if (this.guard > 0.01) {
      for (const g of this.guardBones) {
        this._stash(g.bone);
        _q.identity().slerp(g.offset, this.guard);
        g.bone.quaternion.multiply(_q);
      }
    }

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

    // shake-off: no clip for it on the rig, so it's procedural like the roll
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
