import * as THREE from 'three';

/**
 * MudSplash — mud spray from wheels driving through the jungle trail.
 *
 * Two visual effects:
 *   1. **Spray** — brown particles that arc up and back from the rear wheels
 *      when the car is moving. Intensity scales with speed.
 *   2. **Wheel mud** — small dark clumps that stick to the wheels briefly
 *      and fly off, giving the impression of mud caked on the tyres.
 *
 * Uses the same sprite-pool pattern as Smoke (skids.js) for efficiency.
 *
 * Usage:
 *   const mud = new MudSplash(scene);
 *   // each frame:
 *   mud.update(dt, car, speed);
 */

// Procedural mud splatter texture — brown blob with irregular edges
function createMudTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');

  // Main brown blob
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 28);
  grad.addColorStop(0, 'rgba(120, 80, 40, 0.95)');
  grad.addColorStop(0.4, 'rgba(90, 60, 30, 0.8)');
  grad.addColorStop(0.7, 'rgba(70, 45, 20, 0.4)');
  grad.addColorStop(1, 'rgba(50, 30, 10, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);

  // Irregular splatter dots
  for (let i = 0; i < 12; i++) {
    const x = 20 + Math.random() * 24;
    const y = 20 + Math.random() * 24;
    const r = 2 + Math.random() * 6;
    const dotGrad = g.createRadialGradient(x, y, 0, x, y, r);
    dotGrad.addColorStop(0, `rgba(${80 + Math.random() * 40}, ${50 + Math.random() * 30}, ${20 + Math.random() * 20}, 0.7)`);
    dotGrad.addColorStop(1, 'rgba(60, 40, 15, 0)');
    g.fillStyle = dotGrad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Smaller, darker texture for wheel-clump mud
function createClumpTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 1, 16, 16, 14);
  grad.addColorStop(0, 'rgba(60, 35, 15, 0.9)');
  grad.addColorStop(0.6, 'rgba(45, 25, 10, 0.6)');
  grad.addColorStop(1, 'rgba(30, 15, 5, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class MudSplash {
  constructor(parent, { sprayCount = 60, clumpCount = 24 } = {}) {
    this.parent = parent;
    this.sprayTex = createMudTexture();
    this.clumpTex = createClumpTexture();

    // --- Spray particles (arc up and back from wheels) ---
    this.spray = [];
    for (let i = 0; i < sprayCount; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.sprayTex,
        transparent: true,
        depthWrite: false,
        opacity: 0,
        color: new THREE.Color().setHSL(0.07 + Math.random() * 0.03, 0.55 + Math.random() * 0.2, 0.25 + Math.random() * 0.1),
      }));
      s.visible = false;
      parent.add(s);
      this.spray.push({
        sprite: s, age: 0, life: 1, active: false,
        vx: 0, vy: 0, vz: 0, size: 1, rotSpeed: 0,
      });
    }
    this.sprayCursor = 0;
    this.sprayTimer = 0;

    // --- Clump particles (stick to wheel, fly off) ---
    this.clumps = [];
    for (let i = 0; i < clumpCount; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.clumpTex,
        transparent: true,
        depthWrite: false,
        opacity: 0,
        color: new THREE.Color().setHSL(0.06, 0.6, 0.15 + Math.random() * 0.1),
      }));
      s.visible = false;
      parent.add(s);
      this.clumps.push({
        sprite: s, age: 0, life: 1, active: false,
        vx: 0, vy: 0, vz: 0, size: 0.3,
        phase: 'stuck', // 'stuck' then 'flying'
        stuckTime: 0,
      });
    }
    this.clumpCursor = 0;
    this.clumpTimer = 0;

    // Rear wheel offsets (set by setDims or defaults)
    this.wheelX = 0.8;
    this.wheelZ = -1.2;
    this.wheelY = 0.25;
  }

  /** Update wheel positions after car model swap. */
  setDims({ min, max }) {
    this.wheelX = ((max.x - min.x) / 2) * 0.82;
    this.wheelZ = min.z + (max.z - min.z) * 0.2;
    this.wheelY = min.y + (max.y - min.y) * 0.15;
  }

  /** World position of a rear wheel (side: -1 = left, +1 = right). */
  _wheelWorld(car, side) {
    const h = car.heading, cos = Math.cos(h), sin = Math.sin(h);
    const lx = side * this.wheelX, lz = this.wheelZ;
    return new THREE.Vector3(
      car.mesh.position.x + lx * cos + lz * sin,
      this.wheelY,
      car.mesh.position.z - lx * sin + lz * cos
    );
  }

  /** Main update — call every frame with car reference. */
  update(dt, car, speed) {
    const absSpeed = Math.abs(speed);

    // --- Spray: emit when moving, intensity scales with speed ---
    if (absSpeed > 2) {
      const intensity = THREE.MathUtils.clamp((absSpeed - 2) / 25, 0, 1);
      // Emit rate: more particles at higher speed
      this.sprayTimer += dt;
      const emitInterval = 0.06 - intensity * 0.04; // faster emit at speed
      while (this.sprayTimer > emitInterval) {
        this.sprayTimer -= emitInterval;
        // Emit from both rear wheels
        const leftWheel = this._wheelWorld(car, -1);
        const rightWheel = this._wheelWorld(car, 1);
        this._emitSpray(leftWheel, car.heading, absSpeed, intensity);
        this._emitSpray(rightWheel, car.heading, absSpeed, intensity);
      }
    }

    // Update spray particles
    for (const p of this.spray) {
      if (!p.active) continue;
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        p.active = false;
        p.sprite.visible = false;
        continue;
      }
      // Physics: gravity pulls down, drag slows
      p.vy -= 6 * dt; // gravity
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;

      // Ground collision — splat
      if (p.sprite.position.y < 0.05) {
        p.sprite.position.y = 0.05;
        p.vy *= -0.15;
        p.vx *= 0.4;
        p.vz *= 0.4;
        // Shorten life on ground contact
        p.life = Math.min(p.life, p.age + 0.2);
      }

      // Scale: grow slightly then shrink
      const scale = p.size * (0.5 + k * 0.8) * (1 - k * 0.3);
      p.sprite.scale.set(scale, scale, 1);

      // Fade out
      p.sprite.material.opacity = 0.7 * (1 - k * k);

      // Spin
      p.sprite.material.rotation += p.rotSpeed * dt;
    }

    // --- Clumps: emit occasionally, stick then fly off ---
    if (absSpeed > 5) {
      this.clumpTimer += dt;
      const clumpInterval = 0.3 - THREE.MathUtils.clamp(absSpeed / 60, 0, 0.2);
      while (this.clumpTimer > clumpInterval) {
        this.clumpTimer -= clumpInterval;
        const side = Math.random() > 0.5 ? 1 : -1;
        const wheel = this._wheelWorld(car, side);
        this._emitClump(wheel, car.heading, absSpeed);
      }
    }

    // Update clump particles
    for (const c of this.clumps) {
      if (!c.active) continue;
      c.age += dt;

      if (c.phase === 'stuck') {
        c.stuckTime += dt;
        // Stick for a bit, then fly off
        if (c.stuckTime > 0.3 + Math.random() * 0.5) {
          c.phase = 'flying';
          // Launch outward from wheel
          const angle = Math.random() * Math.PI * 2;
          const force = 2 + Math.random() * 3;
          c.vx = Math.cos(angle) * force;
          c.vy = 1.5 + Math.random() * 2;
          c.vz = Math.sin(angle) * force - 1; // slight backward bias
        }
      } else {
        // Flying phase
        const k = c.age / c.life;
        if (k >= 1) {
          c.active = false;
          c.sprite.visible = false;
          continue;
        }
        c.vy -= 8 * dt;
        c.sprite.position.x += c.vx * dt;
        c.sprite.position.y += c.vy * dt;
        c.sprite.position.z += c.vz * dt;

        if (c.sprite.position.y < 0.05) {
          c.active = false;
          c.sprite.visible = false;
          continue;
        }

        const scale = c.size * (1 - k * 0.5);
        c.sprite.scale.set(scale, scale, 1);
        c.sprite.material.opacity = 0.8 * (1 - k);
      }
    }
  }

  _emitSpray(pos, heading, speed, intensity) {
    const p = this.spray[this.sprayCursor];
    this.sprayCursor = (this.sprayCursor + 1) % this.spray.length;

    p.active = true;
    p.age = 0;
    p.life = 0.4 + Math.random() * 0.4;
    p.sprite.visible = true;

    // Position at wheel with slight randomness
    const jitter = 0.15;
    p.sprite.position.set(
      pos.x + (Math.random() - 0.5) * jitter,
      pos.y + Math.random() * 0.1,
      pos.z + (Math.random() - 0.5) * jitter
    );

    // Velocity: up and backward (opposite to car direction)
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    const backForce = speed * 0.12 * (0.6 + Math.random() * 0.4);
    const upForce = 1.5 + Math.random() * 2.5 + intensity * 1.5;
    const sideForce = (Math.random() - 0.5) * 2;

    p.vx = -sin * backForce + cos * sideForce;
    p.vy = upForce;
    p.vz = -cos * backForce - sin * sideForce;

    p.size = 0.25 + Math.random() * 0.35 + intensity * 0.2;
    p.rotSpeed = (Math.random() - 0.5) * 8;

    p.sprite.material.rotation = Math.random() * Math.PI * 2;
  }

  _emitClump(pos, heading, speed) {
    const c = this.clumps[this.clumpCursor];
    this.clumpCursor = (this.clumpCursor + 1) % this.clumps.length;

    c.active = true;
    c.age = 0;
    c.life = 0.8 + Math.random() * 0.6;
    c.phase = 'stuck';
    c.stuckTime = 0;
    c.sprite.visible = true;

    // Position on the wheel
    c.sprite.position.set(pos.x, pos.y + 0.1, pos.z);
    c.size = 0.15 + Math.random() * 0.15;
    c.sprite.scale.set(c.size, c.size, 1);
    c.sprite.material.opacity = 0.85;
  }

  dispose() {
    this.sprayTex.dispose();
    this.clumpTex.dispose();
    for (const p of this.spray) {
      this.parent.remove(p.sprite);
      p.sprite.material.dispose();
    }
    for (const c of this.clumps) {
      this.parent.remove(c.sprite);
      c.sprite.material.dispose();
    }
  }
}
