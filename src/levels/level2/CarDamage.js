import * as THREE from 'three';

/**
 * CarDamage — what the crashes do to the car you're driving, so you can see it.
 *
 *   - a real hit knocks a few bits off it (a panel, a bumper corner, a mirror,
 *     a lamp, glass, a hubcap): they tumble off, bounce down the road and lie
 *     there a while. Only a few, more for a bigger hit
 *   - the more it's been hurt the worse the engine gets: a thin white smoke
 *     from under the bonnet, then thick black smoke, then flames. Smoke and
 *     flames are let go with most of the car's speed, so they stream back
 *     over the roof instead of being left in the air behind it
 *   - when it's done for it blows up: a fireball, flame and smoke thrown out
 *     all round, its parts everywhere, a flash of light; it's thrown up, comes
 *     down burnt black, and burns where it stops
 *
 * Particles are two Points clouds (smoke; and fire, not tone-mapped so it
 * stays orange against the bright, foggy sky), each with a size per particle,
 * so the whole lot is two draw calls. Nothing
 * is allocated while driving: pools, built once.
 *
 *   const damage = new CarDamage(root);
 *   damage.fit(model, paintColor);           // the car model (again after a repaint or a new car)
 *   damage.crash(car, strength, at);         // a hit: bits fly off
 *   damage.update(dt, car, healthFraction);  // smoke and fire from the engine -> damage.stage 0..3
 *   damage.explode(car);                     // health gone
 */

const UP_G = 16; // m/s², the bits falling

/** A soft round dot, for both clouds. */
function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * A pool of particles in one Points: each has a life, a velocity, a size that
 * grows (or shrinks) over its life, and a colour and alpha that fade between
 * two values.
 */
class Cloud {
  constructor(parent, n, { blending, map, rise = 0, drag = 0.6, toneMapped = true }) {
    this.n = n;
    this.rise = rise;
    this.drag = drag;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.size = new Float32Array(n);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.s0 = new Float32Array(n);
    this.s1 = new Float32Array(n);
    this.c0 = new Float32Array(n * 4);
    this.c1 = new Float32Array(n * 4);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.PointsMaterial({
      size: 1, map, vertexColors: true, transparent: true, depthWrite: false, blending, sizeAttenuation: true, toneMapped,
    });
    // a size per particle on top of the material's
    this.mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aSize;') // a size for each particle (vertex attribute)
        .replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;'); // vertex stage: each point drawn at its own size
    };
    this.mat.customProgramCacheKey = () => 'car-damage-cloud' + (toneMapped ? '' : '-hot');
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    parent.add(this.points);
    this.next = 0;
    this.live = 0;
  }

  /** One particle: from p, moving v, living `life` s, size s0 -> s1, colour c0 -> c1 ([r, g, b, a]). */
  emit(p, v, life, s0, s1, c0, c1) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = this.max[i] = life;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.c0.set(c0, i * 4);
    this.c1.set(c1, i * 4);
    this.live = Math.max(this.live, 1);
  }

  update(dt) {
    if (!this.live) return;
    let any = 0;
    const damp = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; continue; }
      any++;
      this.life[i] -= dt;
      const k = 1 - Math.max(0, this.life[i]) / this.max[i]; // 0 -> 1 over its life
      const j = i * 3;
      this.vel[j] *= damp; this.vel[j + 2] *= damp;
      this.vel[j + 1] = this.vel[j + 1] * damp + this.rise * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      for (let c = 0; c < 4; c++) this.col[i * 4 + c] = this.c0[i * 4 + c] + (this.c1[i * 4 + c] - this.c0[i * 4 + c]) * k;
      // in quickly, out slowly
      this.col[i * 4 + 3] *= Math.min(1, k / 0.08);
    }
    this.live = any;
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.color.needsUpdate = a.aSize.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}

export class CarDamage {
  constructor(parent) {
    this.parent = parent;
    this.map = dotTexture();
    this.smoke = new Cloud(parent, 260, { blending: THREE.NormalBlending, map: this.map, rise: 1.1, drag: 0.9 });
    this.fire = new Cloud(parent, 220, { blending: THREE.NormalBlending, map: this.map, rise: 3.2, drag: 1.4, toneMapped: false });

    // the bits that come off: a few shapes, shared
    this.geos = {
      panel: new THREE.BoxGeometry(0.62, 0.04, 0.42),
      bumper: new THREE.BoxGeometry(0.8, 0.16, 0.12),
      mirror: new THREE.BoxGeometry(0.2, 0.13, 0.09),
      glass: new THREE.BoxGeometry(0.2, 0.015, 0.15),
      lamp: new THREE.BoxGeometry(0.26, 0.11, 0.07),
      hubcap: new THREE.CylinderGeometry(0.21, 0.21, 0.035, 16),
    };
    this.mats = {
      paint: new THREE.MeshStandardMaterial({ color: 0x8a9098, metalness: 0.45, roughness: 0.42 }),
      plastic: new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.8 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xa9c6d6, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.75 }),
      lamp: new THREE.MeshStandardMaterial({ color: 0xffb26a, emissive: 0x6a2a00, roughness: 0.2 }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 0.9, roughness: 0.25 }),
      burnt: new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 1 }),
    };
    // what each kind of bit is made of, and how often it comes off
    this.kinds = [
      ['panel', 'paint', 3], ['bumper', 'plastic', 3], ['mirror', 'paint', 1.5],
      ['glass', 'glass', 2.5], ['lamp', 'lamp', 1.5], ['hubcap', 'chrome', 1],
    ];
    this._kindTotal = this.kinds.reduce((a, k) => a + k[2], 0);
    this.bits = [];
    // dealt round every material to begin with (each is given its own when it's thrown): with
    // all of them on paint, the others' shaders were built the first time one flew off (a hitch)
    const mats = Object.values(this.mats);
    for (let i = 0; i < 44; i++) {
      const m = new THREE.Mesh(this.geos.panel, mats[i % mats.length]);
      m.castShadow = true;
      m.visible = false;
      parent.add(m);
      this.bits.push({ mesh: m, v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0, resting: false });
    }
    this.nextBit = 0;

    // the explosion: a fireball and its light (the light is always there, dark,
    // so it doesn't change the scene's light count and recompile everything)
    // a lumpy ball, not a perfect sphere
    const ballGeo = new THREE.IcosahedronGeometry(1, 3);
    const bp = ballGeo.attributes.position;
    const lump = new THREE.Vector3();
    for (let i = 0; i < bp.count; i++) {
      lump.fromBufferAttribute(bp, i);
      const k = 0.78 + 0.22 * (Math.sin(lump.x * 5.1) * Math.sin(lump.y * 4.3 + 1) * Math.sin(lump.z * 6.2 + 2) * 0.5 + 0.5 + Math.random() * 0.25);
      bp.setXYZ(i, lump.x * k, lump.y * k * 0.85, lump.z * k);
    }
    ballGeo.computeVertexNormals();
    this.ball = new THREE.Mesh(ballGeo,
      new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, depthWrite: false, toneMapped: false }));
    this.ball.visible = false;
    parent.add(this.ball);
    this.light = new THREE.PointLight(0xff8a3a, 0, 40, 1.6);
    parent.add(this.light);
    this.boomT = -1;

    this.stage = 0; // 0 fine, 1 smoking, 2 black smoke, 3 on fire, 4 wrecked
    this.engine = new THREE.Vector3(0, 0.9, 1.4); // in the car's own space (it faces +z)
    this.size = { halfW: 0.9, halfL: 1.8, top: 1.4 };
    this._smokeAcc = 0;
    this._fireAcc = 0;
    this._p = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._cv = new THREE.Vector3();
  }

  /**
   * The car model (bounds in its holder's space, facing +z, wheels on y = 0):
   * where its engine is, how big it is, and its paint for the bits.
   */
  fit(model, paintColor = null) {
    this.model = model;
    const b = model?.userData.bounds;
    if (b) {
      const len = b.max.z - b.min.z;
      this.engine.set((b.min.x + b.max.x) / 2, b.min.y + (b.max.y - b.min.y) * 0.68, b.max.z - len * 0.2);
      this.size = { halfW: (b.max.x - b.min.x) / 2, halfL: len / 2, top: b.max.y };
    }
    let color = paintColor;
    if (!color && model) {
      // no paint given: the material that covers most of it and isn't glass, tyre or trim
      const area = new Map();
      model.traverse((o) => {
        if (!o.isMesh) return;
        const n = o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count;
        for (const m of [].concat(o.material)) {
          if (!m.color || /glass|window|tire|tyre|wheel|rubber|light|lamp|chrome|black/i.test(m.name)) continue;
          const hsl = m.color.getHSL({});
          if (hsl.l < 0.08 || m.transparent) continue;
          area.set(m, (area.get(m) || 0) + n);
        }
      });
      let best = null, most = 0;
      for (const [m, n] of area) if (n > most) { most = n; best = m; }
      color = best?.color;
    }
    if (color) this.mats.paint.color.copy(color);
  }

  /** The car's velocity in the world, m/s. */
  _carVel(car, out) {
    const h = car.heading;
    return out.set(Math.sin(h) * car.speed + Math.cos(h) * (car.lateralVel || 0), 0, Math.cos(h) * car.speed - Math.sin(h) * (car.lateralVel || 0));
  }

  /** A hit of `strength` 0..1 at `at` (world; the car's middle if not given): a few bits come off. */
  crash(car, strength, at = null) {
    if (this.stage >= 4) return;
    let n = strength < 0.3 ? (Math.random() < 0.3 ? 1 : 0) : strength < 0.6 ? 1 + (Math.random() < 0.5 ? 1 : 0) : strength < 0.85 ? 2 + (Math.random() < 0.5 ? 1 : 0) : 3 + (Math.random() < 0.5 ? 1 : 0);
    if (!n) return;
    const from = at ? this._p.copy(at) : car.mesh.localToWorld(this._p.set(0, 0.7, 0));
    this._throw(car, from, n, 1);
  }

  _throw(car, from, n, power) {
    const cv = this._carVel(car, this._cv);
    const c = car.mesh.position;
    for (let i = 0; i < n; i++) {
      const b = this.bits[this.nextBit];
      this.nextBit = (this.nextBit + 1) % this.bits.length;
      let r = Math.random() * this._kindTotal, kind = this.kinds[0];
      for (const k of this.kinds) { if ((r -= k[2]) <= 0) { kind = k; break; } }
      b.mesh.geometry = this.geos[kind[0]];
      b.mesh.material = this.stage >= 4 ? this.mats.burnt : this.mats[kind[1]];
      b.mesh.visible = true;
      b.mesh.scale.setScalar(1);
      b.mesh.position.copy(from);
      b.mesh.position.x += (Math.random() - 0.5) * 0.4;
      b.mesh.position.z += (Math.random() - 0.5) * 0.4;
      b.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      // away from the car's middle, up, and carried on with some of its speed
      const ox = from.x - c.x, oz = from.z - c.z;
      const ol = Math.hypot(ox, oz) || 1;
      const out = (2 + Math.random() * 3.5) * power;
      b.v.set(cv.x * 0.55 + (ox / ol) * out + (Math.random() - 0.5) * 2.5 * power,
        (2.5 + Math.random() * 3.5) * power,
        cv.z * 0.55 + (oz / ol) * out + (Math.random() - 0.5) * 2.5 * power);
      b.w.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
      b.life = 7 + Math.random() * 3;
      b.resting = false;
    }
  }

  /** Up in flames: the wreck. */
  explode(car) {
    this.stage = 4;
    const c = car.mesh.position;
    const cv = this._carVel(car, this._cv);
    const p = this._p.set(c.x, (this.size.top || 1.4) * 0.6, c.z);
    this.ball.position.copy(p);
    this.ball.visible = true;
    this.boomT = 0;
    this.light.position.set(c.x, 2.5, c.z);
    // flame thrown out all round, and a wall of black smoke after it
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2, up = Math.random();
      const sp = 3 + Math.random() * 6;
      this._v.set(Math.cos(a) * sp * (1 - up * 0.5) + cv.x * 0.4, 1.5 + up * 7, Math.sin(a) * sp * (1 - up * 0.5) + cv.z * 0.4);
      const hot = Math.random() < 0.35;
      this.fire.emit(p, this._v, 0.55 + Math.random() * 0.6, (hot ? 1.6 : 2.4) + Math.random() * 1.2, 0.8,
        hot ? [1, 0.92, 0.6, 1] : [1, 0.55, 0.12, 0.95], [0.35, 0.08, 0.02, 0]);
    }
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 4;
      this._v.set(Math.cos(a) * sp + cv.x * 0.3, 1.5 + Math.random() * 3, Math.sin(a) * sp + cv.z * 0.3);
      this.smoke.emit(p, this._v, 2.2 + Math.random() * 1.6, 2, 6.5 + Math.random() * 3, [0.12, 0.1, 0.09, 0.9], [0.07, 0.07, 0.08, 0]);
    }
    // its parts everywhere
    this._throw(car, p, 12, 1.7);
    // thrown up and turned over a little, and down burnt black
    this.hop = { y: 0, vy: 6.5, roll: (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.25), t: 0 };
    if (this.model) {
      this.model.traverse((o) => {
        if (!o.isMesh || o.userData.charred) return;
        o.userData.charred = true;
        o.material = [].concat(o.material).map((m) => {
          const burnt = m.clone();
          if (burnt.color) burnt.color.multiplyScalar(0.12).lerp(new THREE.Color(0x1a1512), 0.5);
          if ('roughness' in burnt) burnt.roughness = 0.95;
          if ('metalness' in burnt) burnt.metalness = 0.1;
          if (burnt.emissive) burnt.emissive.setHex(0x000000);
          this._charred = (this._charred || []);
          this._charred.push(burnt);
          return burnt;
        });
        if (o.material.length === 1) o.material = o.material[0];
      });
    }
  }

  /**
   * Every frame: the engine by `health` (0..1), the bits, the explosion.
   * Sets `stage` (0 fine, 1 smoking, 2 black smoke, 3 on fire, 4 wrecked).
   */
  update(dt, car, health) {
    if (this.stage < 4) this.stage = health < 0.2 ? 3 : health < 0.4 ? 2 : health < 0.6 ? 1 : 0;
    const cv = this._carVel(car, this._cv);
    if (this.stage > 0) {
      const wreck = this.stage === 4;
      // from under the bonnet (or, a wreck, all over it)
      const at = wreck
        ? car.mesh.localToWorld(this._p.set((Math.random() - 0.5) * this.size.halfW * 1.4, (this.size.top || 1.4) * 0.7, (Math.random() - 0.5) * this.size.halfL * 1.4))
        : car.mesh.localToWorld(this._p.copy(this.engine));
      // smoke: a thin white, then a thick black, then black over the flames
      const rate = [0, 9, 20, 26, 34][this.stage];
      this._smokeAcc += dt * rate;
      while (this._smokeAcc > 1) {
        this._smokeAcc -= 1;
        const dark = this.stage >= 2;
        // let go with nearly the car's speed: it rises off the bonnet and streams back over the roof
        const keep = wreck ? 0 : 0.93;
        this._v.set(cv.x * keep + (Math.random() - 0.5) * 0.8, 1.6 + Math.random() * 1.1, cv.z * keep + (Math.random() - 0.5) * 0.8);
        const life = dark ? 1.3 + Math.random() * 0.6 : 0.9 + Math.random() * 0.5;
        const c0 = dark ? [0.1, 0.09, 0.09, 0.78] : [0.6, 0.61, 0.63, 0.5];
        const c1 = dark ? [0.06, 0.06, 0.07, 0] : [0.52, 0.53, 0.56, 0];
        this.smoke.emit(at, this._v, life, dark ? 1.0 : 0.7, dark ? 3.6 : 2.4, c0, c1);
      }
      // flames: hugging the engine, licking up and back
      if (this.stage >= 3) {
        this._fireAcc += dt * (wreck ? 60 : 46);
        while (this._fireAcc > 1) {
          this._fireAcc -= 1;
          const q = wreck
            ? car.mesh.localToWorld(this._p.set((Math.random() - 0.5) * this.size.halfW * 1.6, (this.size.top || 1.4) * 0.55, (Math.random() - 0.5) * this.size.halfL * 1.6))
            : car.mesh.localToWorld(this._p.copy(this.engine).add(this._v.set((Math.random() - 0.5) * 0.7, 0, (Math.random() - 0.5) * 0.5)));
          const keep = wreck ? 0 : 0.95;
          this._v.set(cv.x * keep + (Math.random() - 0.5) * 0.6, 2 + Math.random() * 1.6, cv.z * keep + (Math.random() - 0.5) * 0.6);
          const big = wreck ? 1.5 : 1;
          const hot = Math.random() < 0.3;
          this.fire.emit(q, this._v, 0.38 + Math.random() * 0.3, (hot ? 1.1 : 1.5 + Math.random() * 0.6) * big, 0.25,
            hot ? [1, 0.9, 0.55, 1] : [1, 0.5, 0.1, 0.95], [0.6, 0.1, 0.02, 0]);
        }
      }
    }
    this.smoke.update(dt);
    this.fire.update(dt);

    // the bits: tumble, bounce, lie still, and go (shrinking) after a while
    for (const b of this.bits) {
      if (b.life <= 0) continue;
      b.life -= dt;
      const m = b.mesh;
      if (b.life <= 0) { m.visible = false; continue; }
      if (b.life < 0.6) m.scale.setScalar(Math.max(0.01, b.life / 0.6));
      if (b.resting) continue;
      b.v.y -= UP_G * dt;
      m.position.addScaledVector(b.v, dt);
      m.rotation.x += b.w.x * dt; m.rotation.y += b.w.y * dt; m.rotation.z += b.w.z * dt;
      if (m.position.y < 0.04) {
        m.position.y = 0.04;
        b.v.set(b.v.x * 0.5, -b.v.y * 0.3, b.v.z * 0.5);
        b.w.multiplyScalar(0.5);
        if (Math.abs(b.v.y) < 0.6 && Math.hypot(b.v.x, b.v.z) < 0.6) {
          // lies flat where it stopped
          b.resting = true;
          m.rotation.x = Math.round(m.rotation.x / Math.PI) * Math.PI;
          m.rotation.z = Math.round(m.rotation.z / Math.PI) * Math.PI;
        }
      }
    }

    // the blast: the fireball swells and fades, the light flares and dies
    if (this.boomT >= 0) {
      this.boomT += dt;
      const k = this.boomT / 0.5;
      this.ball.scale.setScalar(0.6 + Math.pow(Math.min(1, k), 0.5) * 2.8);
      this.ball.rotation.y += dt * 2;
      this.ball.material.opacity = Math.max(0, 0.95 * (1 - k * k));
      this.ball.material.color.setHSL(0.1 - Math.min(1, k) * 0.07, 1, 0.6 - Math.min(1, k) * 0.28);
      this.light.intensity = Math.max(0, 260 * (1 - this.boomT / 1.1));
      if (k >= 1) this.ball.visible = false;
      if (this.boomT > 1.1) { this.boomT = -1; this.light.intensity = 0; }
    }
    // the wreck thrown up, and down on its wheels again (a little over)
    if (this.hop && this.model) {
      const h = this.hop;
      h.t += dt;
      h.vy -= 22 * dt;
      h.y = Math.max(0, h.y + h.vy * dt);
      if (h.y === 0 && h.vy < 0) h.vy = h.t < 0.9 ? -h.vy * 0.25 : 0;
      this.model.position.y = (this.model.userData.baseY ??= this.model.position.y) + h.y;
      this.model.rotation.z = h.roll * Math.min(1, h.t / 0.5);
    }
  }

  dispose() {
    this.smoke.dispose();
    this.fire.dispose();
    for (const g of Object.values(this.geos)) g.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
    for (const m of this._charred || []) m.dispose();
    this.ball.geometry.dispose();
    this.ball.material.dispose();
    this.map.dispose();
  }
}
