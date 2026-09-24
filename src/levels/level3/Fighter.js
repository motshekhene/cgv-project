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

export class Fighter {
  constructor(parent, { source = null, height = 1.8, capsuleColor = 0xdfe8ee, darken = 1 } = {}) {
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

    if (source) this._buildFromModel(source, height, darken);
    else this._buildCapsule(height, capsuleColor);
  }

  _buildFromModel(source, height, darken) {
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

  play(name, { loop = true, fade = 0.15, speed = 1 } = {}) {
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

  setVisible(v) {
    this.root.visible = v;
  }

  update(dt) {
    if (this.mixer) this.mixer.update(dt);

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
