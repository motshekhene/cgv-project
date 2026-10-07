import * as THREE from 'three';
import { Rain } from '../../intros/fx.js';
import { POOL } from './ShrineArena.js';

/**
 * Storm — phase III's weather. The rain comes in with the dusk (`level`
 * follows arena.dusk, 0..1): streaks all round the camera, rings all over the
 * pool, little splashes jumping off the stones round the fight, and both
 * fighters soaked through again (Wetness reads `level`). Every few seconds,
 * lightning: a forked bolt over the jungle and the courtyard lit cold white
 * for a beat (ShrineArena.setFlash), sometimes twice; onBolt() lets the level
 * kick the camera.
 *
 * The rain falls in game time, so the Key's slow-mo (and a perfect dodge)
 * hangs it in the air; the lightning keeps real time.
 *
 *   const storm = new Storm(root, arena, waterFX);
 *   storm.update(gameDt, realDt, camera, kaiPosition);   // after arena.update()
 */
const BOLT_DIST = 85; // m from the camera: out over the jungle
const BOLT_TOP = 46; // m up: low enough to be in the fight camera's sky, between the treetops
const _v = new THREE.Vector3();

export class Storm {
  constructor(root, arena, fx) {
    this.root = root;
    this.arena = arena;
    this.fx = fx;
    this.level = 0;
    this.time = 0; // game time: the rain's clock
    this.rain = new Rain(root, { count: 2000, box: [40, 24, 40], speed: 26, length: 1.0, wind: [2.4, 0, -1.5], color: 0xc4d2e6, opacity: 0 });
    this.rain.lines.visible = false;
    this._ripples = 0;
    this._splashes = 0;
    this.nextBolt = 2.5;
    this.boltAge = 99;
    this.double = false;
    this.onBolt = null;

    this.bolt = new THREE.Group();
    this.bolt.visible = false;
    this.boltMat = new THREE.MeshBasicMaterial({
      color: 0xeef3ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide,
    });
    this.glowMat = this.boltMat.clone();
    this.glowMat.color.setHex(0x8fa8ff);
    root.add(this.bolt);
  }

  update(dt, real, camera, focus) {
    this.time += dt;
    this.level = this.arena.dusk;
    const k = this.level;
    const on = k > 0.02;
    this.rain.lines.visible = on;
    if (!on) {
      this.arena.setFlash(0);
      return;
    }
    this.rain.lines.material.opacity = 0.42 * k;
    this.rain.update(this.time, camera.position);
    this._rainOnWater(dt, k, focus);

    // lightning keeps real time: it shouldn't crawl when the fight slows down
    this.nextBolt -= real;
    if (this.nextBolt <= 0 && k > 0.6) {
      this.nextBolt = 3.5 + Math.random() * 5;
      this._strike(camera);
    }
    this.boltAge += real;
    const a = this.boltAge;
    let f = a < 0.7 ? Math.exp(-a * 8) * (0.7 + 0.3 * Math.sin(a * 64)) : 0;
    if (this.double && a > 0.2 && a < 0.8) f = Math.max(f, 0.8 * Math.exp(-(a - 0.2) * 9) * (0.7 + 0.3 * Math.sin(a * 71)));
    f = Math.max(0, f) * k;
    this.arena.setFlash(f < 0.004 ? 0 : f);
    this.bolt.visible = a < 0.45 || (this.double && a > 0.2 && a < 0.5);
    this.boltMat.opacity = Math.min(1, f * 1.6);
    this.glowMat.opacity = Math.min(0.45, f * 0.6);
  }

  /** A fresh forked bolt somewhere in front of the camera, facing it. */
  _strike(camera) {
    const r = Math.random;
    camera.getWorldDirection(_v);
    const az = Math.atan2(_v.x, _v.z) + (r() - 0.5) * 1.1;
    this.bolt.position.set(
      camera.position.x + Math.sin(az) * BOLT_DIST,
      BOLT_TOP + r() * 8,
      camera.position.z + Math.cos(az) * BOLT_DIST,
    );
    this.bolt.lookAt(camera.position.x, this.bolt.position.y, camera.position.z);
    for (const m of [...this.bolt.children]) {
      m.geometry.dispose();
      this.bolt.remove(m);
    }
    const lines = forks(r);
    this.bolt.add(new THREE.Mesh(ribbon(lines, 7), this.glowMat));
    this.bolt.add(new THREE.Mesh(ribbon(lines, 1.7), this.boltMat));
    this.boltAge = 0;
    this.double = r() < 0.5;
    if (this.onBolt) this.onBolt();
  }

  /** Rings popping up all over the pool, and splashes off the stones round the fight. */
  _rainOnWater(dt, k, focus) {
    this._ripples += dt * 10 * k;
    while (this._ripples >= 1) {
      this._ripples -= 1;
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * (POOL.r - 0.8);
      this.fx.ripple(POOL.x + Math.cos(a) * d, POOL.z + Math.sin(a) * d, 0.22 + Math.random() * 0.2, 0.32, 0.8);
    }
    this._splashes += dt * 50 * k;
    while (this._splashes >= 1) {
      this._splashes -= 1;
      const a = Math.random() * Math.PI * 2, d = 0.5 + Math.random() * 8;
      const x = focus.x + Math.cos(a) * d, z = focus.z + Math.sin(a) * d;
      const y = this.arena.surfaceY(x, z) + 0.02;
      this.fx.drop(x, y, z, (Math.random() - 0.5) * 0.6, 0.7 + Math.random() * 0.7, (Math.random() - 0.5) * 0.6);
    }
  }
}

/** A lightning bolt in its own plane (x across, y up, metres): a jagged main channel and a couple of forks. */
function forks(r) {
  const main = [[0, 0]];
  let x = 0, y = 0;
  for (let i = 0; i < 15; i++) {
    y -= 3.5 + r() * 2.2;
    x += (r() - 0.5) * 7;
    main.push([x, y]);
  }
  const out = [main];
  for (let b = 0; b < 2; b++) {
    let [bx, by] = main[3 + Math.floor(r() * 8)];
    const dir = r() < 0.5 ? -1 : 1;
    const fork = [[bx, by]];
    for (let i = 0, n = 3 + Math.floor(r() * 3); i < n; i++) {
      by -= 2.5 + r() * 2;
      bx += dir * (1.5 + r() * 3);
      fork.push([bx, by]);
    }
    out.push(fork);
  }
  return out;
}

/** Flat strips along the lines, `width` wide (the forks half as wide), as one geometry. */
function ribbon(lines, width) {
  const pos = [];
  lines.forEach((pts, li) => {
    const w = (li === 0 ? width : width * 0.5) / 2;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const len = Math.hypot(x1 - x0, y1 - y0) || 1;
      const nx = (-(y1 - y0) / len) * w, ny = ((x1 - x0) / len) * w;
      pos.push(x0 - nx, y0 - ny, 0, x1 - nx, y1 - ny, 0, x1 + nx, y1 + ny, 0, x0 - nx, y0 - ny, 0, x1 + nx, y1 + ny, 0, x0 + nx, y0 + ny, 0);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}
