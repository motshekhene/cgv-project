import * as THREE from 'three';
import { toStandard } from '../jungle/props.js';
import { POOL } from './ShrineArena.js';

/**
 * Wreck — what's left of Kai's car, washed over the falls with him (Level 2
 * ends with it going off the bridge into the river): a wheel half sunk in the
 * shallows, a loose tyre floating out in the pool, the steering wheel by where
 * he wakes, the bumper and an axle up on the bank. Plain parts, no paintwork,
 * so it reads as "his car" whatever Level 2 ends up driving.
 *
 * Models in assets/jungle/models/wreck/: Kenney's Car Kit (CC0) and a steering
 * wheel by Poly by Google (CC-BY 3.0, via Poly Pizza). Each piece is scaled to
 * a real size (its longest side, metres) and set down on the pool bed or the
 * bank, `bury` metres into it; the floating tyre rides the surface instead.
 *
 *   const wreck = new Wreck(root, arena);  await wreck.build(assets);
 *   wreck.update(dt, time, waterFX);       // the tyre bobs and turns, leaving rings
 */
const DIR = 'jungle/models/wreck/';
const DULL = { colormap: 0x9a958c, default: 0x8c8a84, Black: 0xffffff }; // toy-bright paint, dulled by the river
const PIECES = [
  // kept off the line Kai walks from the wake spot (-4.6, -21.2) up to the gate
  { file: 'steering-wheel.glb', size: 0.42, x: -5.55, z: -21.6, rx: 0.4, ry: 0.9, float: 0.06 },
  { file: 'wheel-truck.glb', size: 0.8, x: -6.7, z: -22.9, ry: -1.19, rz: 0.55, bury: 0.0, solid: 0.42 },
  { file: 'debris-tire.glb', size: 0.72, x: -6.6, z: -24.3, ry: 0.4, rz: Math.PI / 2, float: 0.07 },
  { file: 'debris-bumper.glb', size: 1.7, x: -1.35, z: -22.3, rx: 0.08, ry: -0.75, rz: 0.15, bury: 0.05, solid: 0.55 },
  { file: 'debris-drivetrain-axle.glb', size: 1.45, x: -9.1, z: -21.0, ry: 0.55, rz: 0.12, bury: 0.08 },
];

const _box = new THREE.Box3();
const _size = new THREE.Vector3();

export class Wreck {
  constructor(root, arena) {
    this.root = root;
    this.arena = arena;
    this.floating = [];
    this._ringT = 0;
  }

  async build(assets) {
    const loaded = await Promise.all(PIECES.map((p) => assets.model(DIR + p.file).then((g) => g.scene, (e) => {
      console.warn('[wreck] missing, skipping:', p.file, e?.message || e);
      return null;
    })));
    PIECES.forEach((p, i) => {
      if (loaded[i]) this._place(p, loaded[i].clone());
    });
  }

  _place(p, model) {
    toStandard(model, DULL);
    model.traverse((o) => {
      if (o.isMesh) o.receiveShadow = true;
    });
    // centred on its own middle, so it turns about it, then sized
    _box.setFromObject(model).getSize(_size);
    const inner = new THREE.Group();
    inner.add(model);
    model.position.sub(_box.getCenter(new THREE.Vector3()));
    inner.scale.setScalar(p.size / Math.max(_size.x, _size.y, _size.z));
    inner.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0, 'YXZ');
    const piece = new THREE.Group();
    piece.add(inner);
    piece.position.set(p.x, 0, p.z);
    this.root.add(piece);
    piece.updateMatrixWorld(true);
    _box.setFromObject(piece);
    const half = (_box.max.y - _box.min.y) / 2;
    if (p.float !== undefined) {
      // riding the surface, `float` of it above the water
      piece.position.y = POOL.y + p.float - half;
      this.floating.push({ piece, inner, base: piece.position.y, spin: (Math.random() - 0.5) * 0.15, phase: Math.random() * 6 });
    } else {
      piece.position.y = this.arena.groundHeight(p.x, p.z) - p.bury + half;
    }
    if (p.solid) this.arena.obstacles.push({ x: p.x, z: p.z, r: p.solid });
  }

  update(dt, time, fx) {
    for (const f of this.floating) {
      f.piece.position.y = f.base + Math.sin(time * 1.4 + f.phase) * 0.025;
      f.piece.rotation.y += f.spin * dt;
      f.piece.rotation.x = Math.sin(time * 0.9 + f.phase) * 0.05;
      f.piece.rotation.z = Math.sin(time * 1.1 + f.phase * 2) * 0.05;
    }
    // now and then a ring spreads out from the tyre
    this._ringT -= dt;
    if (fx && this.floating.length && this._ringT <= 0) {
      this._ringT = 1.6 + Math.random();
      const f = this.floating[Math.floor(Math.random() * this.floating.length)];
      fx.ripple(f.piece.position.x, f.piece.position.z, 0.9, 0.3, 2);
    }
  }
}
