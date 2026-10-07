import * as THREE from 'three';
import { POOL } from './ShrineArena.js';

/**
 * Wetness — Kai coming out of the pool (and anyone who wades back in).
 *
 * WaterFX owns the shared effects, all pooled so nothing is allocated per
 * frame: drops (drips, run-off, splashes, the shake-off spray), sun glints in
 * the spray, wet footprints and ripple rings on the pool. One per level.
 *
 * Wetness is one fighter's state. `wet` (0..1) darkens and glosses their
 * clothes, sets how fast they drip and whether their steps leave prints.
 * Standing in the pool soaks them (with splashes underfoot and rings round
 * their legs); out of it they dry in ~40 s. shakeOff() is the dog-style
 * shake (Fighter.shake) that throws a spray of water; with autoShake, a
 * soaked fighter left standing still does it on their own, and any movement
 * cancels it, so it never costs the player control.
 *
 *   const fx = new WaterFX(root, arena);
 *   const wet = new Wetness(fighter, fx, { autoShake: true });
 *   // each frame, after the fighter has moved and animated:
 *   wet.update(dt, { still });  fx.update(dt);
 */
const DROPS = 360;
const SPRAY = 320;
const GLINTS = 140;
const PRINTS = 64;
const RIPPLES = 20;
const DRY_TIME = 40; // seconds from soaked to dry
const PRINT_LIFE = 14; // seconds a fresh print takes to fade (less as the feet dry)
const SHAKE_TIME = 0.95;
const FLICK_BEAT = 0.15; // up, snap, up, snap

// what each of the rig's materials looks like soaked: colour multiplier, roughness
const WET_LOOK = {
  Skin: [0.82, 0.42],
  Hair: [0.55, 0.25],
  Eyes: [1, null],
  Shirt: [0.5, 0.4],
  Pants: [0.5, 0.45],
  Socks: [0.62, 0.5],
  Shoes: [0.7, 0.35],
  '*': [0.62, 0.45],
};

// where water runs off a body, and how much of it: [bone, weight]
const DRIP_FROM = [
  ['FingersL', 3], ['FingersR', 3], ['Head', 1.2], ['Torso', 1.4], ['Hips', 2],
  ['LowerArmL', 1], ['LowerArmR', 1], ['LowerLegL', 0.7], ['LowerLegR', 0.7],
];
const SPRAY_FROM = ['Head', 'Head', 'Torso', 'Torso', 'Hips', 'FingersL', 'FingersR', 'LowerArmL', 'LowerArmR'];

const _a = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const rand = (a, b) => a + Math.random() * (b - a);

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A fixed pool of falling points: emit() reuses the oldest slot. */
class Drops {
  constructor(root, n, material) {
    this.n = n;
    this.next = 0;
    this.live = 0;
    this.vel = new Float32Array(n * 3);
    this.floor = new Float32Array(n);
    this.alive = new Uint8Array(n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3).fill(-999), 3));
    this.pos = geo.attributes.position;
    this.pts = new THREE.Points(geo, material);
    this.pts.frustumCulled = false;
    root.add(this.pts);
  }

  emit(x, y, z, vx, vy, vz, floor) {
    const i = this.next;
    this.next = (i + 1) % this.n;
    if (!this.alive[i]) this.live++;
    this.alive[i] = 1;
    this.pos.setXYZ(i, x, y, z);
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.floor[i] = floor;
  }

  update(dt, onLand) {
    if (!this.live) return;
    const p = this.pos.array, v = this.vel;
    const drag = Math.exp(-1.2 * dt);
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) continue;
      const j = i * 3;
      v[j] *= drag;
      v[j + 2] *= drag;
      v[j + 1] -= 9.8 * dt;
      p[j] += v[j] * dt;
      p[j + 1] += v[j + 1] * dt;
      p[j + 2] += v[j + 2] * dt;
      if (p[j + 1] <= this.floor[i]) {
        if (onLand) onLand(p[j], p[j + 2]);
        p[j + 1] = -999;
        this.alive[i] = 0;
        this.live--;
      }
    }
    this.pos.needsUpdate = true;
  }
}

export class WaterFX {
  constructor(root, arena) {
    this.root = root;
    this.arena = arena;
    this.time = 0;
    this._smallRipples = 0; // budget for rings from drops landing in the pool

    // drips: small and many
    this.drops = new Drops(root, DROPS, new THREE.PointsMaterial({
      map: arena.dot, size: 0.07, color: 0xd6ecf8, transparent: true, opacity: 0.9, depthWrite: false,
    }));
    // thrown water (the shake, flicks, splashes): fewer, bigger drops, so the burst reads from the fight camera
    this.spray = new Drops(root, SPRAY, new THREE.PointsMaterial({
      map: arena.dot, size: 0.13, color: 0xe2f2fb, transparent: true, opacity: 0.85, depthWrite: false,
    }));
    // the sun catching the spray: a few bright additive specks among the drops
    this.glints = new Drops(root, GLINTS, new THREE.PointsMaterial({
      map: arena.dot, size: 0.14, color: 0xfff0c8, transparent: true, opacity: 0.95, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this._buildPrints();
    this._buildRipples();
  }

  /* ---------------------------------------------------------- footprints */

  _buildPrints() {
    // a shoe sole: ball of the foot, a narrower arch, the heel; toe at the top of the canvas
    const map = canvasTexture(32, 64, (g) => {
      g.filter = 'blur(1.2px)';
      g.fillStyle = '#fff';
      for (const [x, y, rx, ry, rot] of [[16.5, 19, 9.5, 14, 0.06], [15, 49, 7.5, 10, 0]]) {
        g.beginPath();
        g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
        g.fill();
      }
      g.fillRect(10, 26, 11, 22);
    });
    const geo = new THREE.PlaneGeometry(0.15, 0.32).rotateX(-Math.PI / 2).rotateY(Math.PI); // flat, toe toward +z
    geo.setAttribute('aFade', new THREE.InstancedBufferAttribute(new Float32Array(PRINTS), 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: map }, uColor: { value: new THREE.Color(0x0e0c09) } }]),
      vertexShader: /* glsl */ `
        attribute float aFade;
        varying vec2 vUv;
        varying float vFade;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv;
          vFade = aFade;
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform vec3 uColor;
        varying vec2 vUv;
        varying float vFade;
        #include <fog_pars_fragment>
        void main() {
          float a = texture2D(uMap, vUv).a * vFade * 0.72;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor, a);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide, // left prints are mirrored with a negative scale
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.prints = new THREE.InstancedMesh(geo, mat, PRINTS);
    this.prints.frustumCulled = false;
    this.prints.renderOrder = 1;
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < PRINTS; i++) this.prints.setMatrixAt(i, _m);
    this.root.add(this.prints);
    this.printFade = geo.attributes.aFade;
    this.printAge = new Float32Array(PRINTS).fill(-1);
    this.printLife = new Float32Array(PRINTS);
    this.printStrength = new Float32Array(PRINTS);
    this.nextPrint = 0;
  }

  /** A wet print where a foot came down. strength 0..1 (how wet the foot was). */
  print(x, y, z, yaw, side, strength) {
    const i = this.nextPrint;
    this.nextPrint = (i + 1) % PRINTS;
    _q.setFromAxisAngle(_up, yaw);
    _m.compose(_a.set(x, y + 0.012, z), _q, _s.set(side === 'L' ? -1 : 1, 1, 1));
    this.prints.setMatrixAt(i, _m);
    this.prints.instanceMatrix.needsUpdate = true;
    this.printAge[i] = 0;
    this.printLife[i] = PRINT_LIFE * (0.4 + 0.6 * strength);
    this.printStrength[i] = Math.min(1, 0.35 + strength);
  }

  /* ---------------------------------------------------------- ripples */

  _buildRipples() {
    // a wave: a dark trough inside a bright crest, so it reads on the pale, foamy pool
    const map = canvasTexture(128, 128, (g, w) => {
      const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      r.addColorStop(0, 'rgba(14,62,72,0)');
      r.addColorStop(0.5, 'rgba(14,62,72,0)');
      r.addColorStop(0.66, 'rgba(14,62,72,.6)');
      r.addColorStop(0.76, 'rgba(255,255,255,.95)');
      r.addColorStop(0.86, 'rgba(255,255,255,.3)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, w, w);
    });
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.ripples = [];
    for (let i = 0; i < RIPPLES; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        map, transparent: true, opacity: 0, depthWrite: false, fog: true,
      }));
      mesh.visible = false;
      mesh.renderOrder = 5; // after the (transparent) pool surface
      this.root.add(mesh);
      this.ripples.push({ mesh, age: 0, life: 1, size: 1, strength: 0 });
    }
    this.nextRipple = 0;
  }

  /** A ring spreading on the pool at (x, z) out to radius `size`. */
  ripple(x, z, size = 1, strength = 0.5, life = 1.5) {
    const r = this.ripples[this.nextRipple];
    this.nextRipple = (this.nextRipple + 1) % RIPPLES;
    r.mesh.position.set(x, POOL.y + 0.015, z);
    r.mesh.visible = true;
    r.age = 0;
    r.life = life;
    r.size = size;
    r.strength = strength;
  }

  /** A foot (or a body) hitting the water: a crown of drops and a ring. */
  splash(x, z, power = 1) {
    const y = POOL.y + 0.02;
    const n = Math.round(9 + 9 * power);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = rand(0.35, 1.1) * power;
      this.spray.emit(x + Math.cos(a) * 0.08, y, z + Math.sin(a) * 0.08, Math.cos(a) * s, rand(1.3, 2.6) * power, Math.sin(a) * s, POOL.y);
    }
    this.ripple(x, z, 0.45 + 0.5 * power, 0.6, 1.3);
  }

  /** kind: 'drip' (falling off a body), 'spray' (thrown) or 'glint' (thrown, catching the sun). */
  drop(x, y, z, vx, vy, vz, kind = 'drip') {
    const pool = kind === 'glint' ? this.glints : kind === 'spray' ? this.spray : this.drops;
    pool.emit(x, y, z, vx, vy, vz, this.arena.surfaceY(x, z));
  }

  update(dt) {
    this.time += dt;
    this._smallRipples = Math.min(4, this._smallRipples + dt * 6);
    this.drops.update(dt, (x, z) => {
      // now and then a drop landing in the pool leaves its own small ring
      if (this._smallRipples >= 1 && Math.random() < 0.3 && this.arena.waterDepth(x, z) > 0) {
        this._smallRipples -= 1;
        this.ripple(x, z, rand(0.18, 0.32), 0.45, 0.8);
      }
    });
    this.spray.update(dt);
    this.glints.update(dt);
    this.glints.pts.material.opacity = 0.75 + 0.25 * Math.sin(this.time * 31); // twinkle

    for (const r of this.ripples) {
      if (!r.mesh.visible) continue;
      r.age += dt;
      const t = r.age / r.life;
      if (t >= 1) {
        r.mesh.visible = false;
        continue;
      }
      r.mesh.scale.setScalar(r.size * 2 * (0.15 + 0.85 * Math.sqrt(t)));
      r.mesh.material.opacity = r.strength * (1 - t) ** 1.6;
    }

    let dirty = false;
    for (let i = 0; i < PRINTS; i++) {
      if (this.printAge[i] < 0) continue;
      this.printAge[i] += dt;
      const t = this.printAge[i] / this.printLife[i];
      if (t >= 1) {
        this.printAge[i] = -1;
        this.printFade.setX(i, 0);
      } else {
        this.printFade.setX(i, this.printStrength[i] * (1 - t * t));
      }
      dirty = true;
    }
    if (dirty) this.printFade.needsUpdate = true;
  }
}

export class Wetness {
  constructor(fighter, fx, { autoShake = false } = {}) {
    this.f = fighter;
    this.fx = fx;
    this.arena = fx.arena;
    this.autoShake = autoShake;
    this.wet = 0;
    this.inWater = false;
    this.streamT = 0; // seconds of heavy run-off left (climbing out of the water)
    this.stillT = 0;
    this.shakeCD = 0;
    this.rippleT = 0;
    this._owed = 0; // fractional drips carried between frames
    this._shown = -1;

    this.looks = fighter.materials.map((m) => {
      const [k, rough] = WET_LOOK[m.name] || WET_LOOK['*'];
      return { m, dry: m.color.clone(), dryRough: m.roughness, k, rough: rough ?? m.roughness };
    });
    this.bones = {};
    fighter.model?.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
    });
    this.dripFrom = DRIP_FROM.filter(([n]) => this.bones[n]);
    this.dripTotal = this.dripFrom.reduce((s, [, w]) => s + w, 0);
    this.sprayFrom = SPRAY_FROM.map((n) => this.bones[n]).filter(Boolean);
    this.lifted = { L: false, R: false }; // each foot: off the ground since its last footfall
    this.lastStep = new THREE.Vector3(1e9, 0, 0);
  }

  get shaking() {
    return this.f.shaking;
  }

  setWet(v) {
    this.wet = Math.min(1, Math.max(0, v));
  }

  /** Water pouring off as they climb out (seconds). */
  stream(seconds) {
    this.streamT = seconds;
  }

  /** Shake the water off: a whole-body shimmy and a spray that catches the sun. */
  shakeOff() {
    if (this.wet < 0.05 || this.f.shaking) return false;
    this.f.shake(SHAKE_TIME);
    this._sprayFrom = this.wet;
    return true;
  }

  /**
   * Flick the water off his hands: fists up to the chest and snapped down,
   * twice, a spatter off the fingers on each snap. Uses the guard pose (the
   * rig has no clip for it), so only call it when nothing else is posing the guard.
   */
  flickHands() {
    this.flickT = 0;
  }

  _flick(dt) {
    if (this.flickT === undefined || this.flickT < 0) return;
    const was = Math.floor(this.flickT / FLICK_BEAT);
    this.flickT += dt;
    const beat = Math.floor(this.flickT / FLICK_BEAT);
    if (beat >= 4) {
      this.flickT = -1;
      this.f.setGuard(false);
      return;
    }
    this.f.setGuard(beat % 2 === 0, 0.8);
    if (beat !== was && beat % 2 === 1) {
      // the snap down: water comes off the fingertips
      for (const n of ['FingersL', 'FingersR']) {
        this._bonePos(this.bones[n], _a);
        for (let k = 0; k < 16; k++) {
          const a = Math.random() * Math.PI * 2, s = rand(0.6, 1.8);
          this.fx.drop(_a.x, _a.y, _a.z, Math.cos(a) * s, rand(-2.5, -0.6), Math.sin(a) * s, Math.random() < 0.25 ? 'glint' : 'spray');
        }
      }
    }
  }

  /** `still`: whether the player is leaving them idle; omit it while a cutscene drives them. */
  update(dt, { still = null } = {}) {
    const root = this.f.root;
    root.updateMatrixWorld(true);
    const p = root.position;
    this.inWater = this.arena.waterDepth(p.x, p.z) > 0.04;
    if (this.inWater) this.wet = 1;
    else this.wet = Math.max(0, this.wet - dt / DRY_TIME);
    if (this.streamT > 0) this.streamT -= dt;

    this._look();
    this._drip(dt);
    this._steps();

    // standing in the pool: rings spread out from the legs
    if (this.inWater) {
      this.rippleT -= dt;
      if (this.rippleT <= 0) {
        this.rippleT = rand(0.8, 1.2);
        this.fx.ripple(p.x, p.z, 0.8, 0.4, 1.8);
      }
    }

    if (this.f.shaking) this._spray(dt);
    this._flick(dt);

    if (this.autoShake && still !== null) {
      this.shakeCD -= dt;
      if (this.f.shaking && !still) this.f.stopShake();
      this.stillT = still && !this.inWater ? this.stillT + dt : 0;
      if (this.stillT > 1.3 && this.wet > 0.3 && this.shakeCD <= 0 && this.shakeOff()) this.shakeCD = 7;
    }
  }

  /** Soaked clothes go darker and shinier; they stay that way most of the way dry. */
  _look() {
    const w = Math.min(1, this.wet * 1.4);
    if (Math.abs(w - this._shown) < 0.004) return;
    this._shown = w;
    for (const l of this.looks) {
      l.m.color.copy(l.dry).multiplyScalar(1 + (l.k - 1) * w);
      l.m.roughness = l.dryRough + (l.rough - l.dryRough) * w;
    }
  }

  _bonePos(bone, out) {
    if (bone) return bone.getWorldPosition(out);
    return out.copy(this.f.root.position).setY(this.f.root.position.y + rand(0.3, 1.6)); // capsule fallback
  }

  _drip(dt) {
    if (this.wet <= 0 && this.streamT <= 0) return;
    const streaming = this.streamT > 0;
    this._owed += (this.wet ** 1.4 * 26 + (streaming ? 300 : 0)) * dt;
    while (this._owed >= 1) {
      this._owed -= 1;
      let pick = Math.random() * this.dripTotal, bone = null;
      for (const [n, w] of this.dripFrom) {
        pick -= w;
        bone = this.bones[n];
        if (pick <= 0) break;
      }
      this._bonePos(bone, _a);
      const spread = streaming ? 0.22 : 0.07;
      _a.x += rand(-spread, spread);
      _a.y += streaming ? rand(-0.3, 0.3) : 0;
      _a.z += rand(-spread, spread);
      if (this.inWater && _a.y < POOL.y + 0.05) continue; // that part is under water
      this.fx.drop(_a.x, _a.y, _a.z, rand(-0.12, 0.12), rand(-0.6, -0.1), rand(-0.12, 0.12));
    }
  }

  /**
   * Spray thrown off in the shake: outward from the body, a little upward, some
   * of it glinting. It comes in bursts, hardest where each twist whips round.
   */
  _spray(dt) {
    const whip = Math.abs(Math.cos(this.f.shakeT * Math.PI * 2 * 5.5)) ** 2;
    const rate = 700 * Math.max(0.25, this._sprayFrom || this.wet) * this.f.shakeAmp * whip;
    this.wet = Math.max(0.15, this.wet - dt * 0.32); // the shake flings off the surface water
    const root = this.f.root.position;
    this._owed += rate * dt;
    while (this._owed >= 1) {
      this._owed -= 1;
      const bone = this.sprayFrom[Math.floor(Math.random() * this.sprayFrom.length)];
      this._bonePos(bone, _a);
      let dx = _a.x - root.x, dz = _a.z - root.z;
      const d = Math.hypot(dx, dz);
      const a = d > 0.05 ? Math.atan2(dz, dx) + rand(-0.9, 0.9) : Math.random() * Math.PI * 2;
      dx = Math.cos(a);
      dz = Math.sin(a);
      const s = rand(1.8, 4.6);
      this.fx.drop(_a.x + dx * 0.12, _a.y, _a.z + dz * 0.12, dx * s, rand(0.4, 2.4), dz * s, Math.random() < 0.3 ? 'glint' : 'spray');
    }
  }

  /** Footfalls: a foot that has lifted clear and comes back down to the ground has landed a step. */
  _steps() {
    const root = this.f.root.position;
    for (const side of ['L', 'R']) {
      const bone = this.bones['Foot' + side];
      if (!bone) continue;
      bone.getWorldPosition(_a);
      const h = _a.y - root.y; // the foot bone is the ankle: ~0.02 when the foot is flat
      const lifted = this.lifted[side];
      if (h > 0.14) this.lifted[side] = true;
      if (!lifted || h > 0.06) continue;
      this.lifted[side] = false;
      if (Math.hypot(root.x - this.lastStep.x, root.z - this.lastStep.z) < 0.2) continue; // stepping on the spot
      this.lastStep.copy(root);
      if (this.inWater) {
        this.fx.splash(_a.x, _a.z, 0.75);
      } else if (this.wet > 0.06) {
        const yaw = this.f.root.rotation.y;
        // the print's centre is a little ahead of the ankle
        this.fx.print(_a.x + Math.sin(yaw) * 0.05, root.y, _a.z + Math.cos(yaw) * 0.05, yaw, side, this.wet);
      }
    }
  }
}
