import * as THREE from "three";

/**
 * The bay car's driver's door, cut out of the body so it can open.
 *
 * The car models are one mesh each (the Executive is a single
 * "Convertible_mesh"): none has a door of its own to swing. So the door is
 * cut out with clipping planes. The body is drawn with a box-shaped hole
 * where the door is (the intersection of five planes clipped), and a copy of
 * the body, drawn with only what is inside that box, hangs on a hinge at the
 * door's front edge and swings out. Closed, the two line up exactly, so
 * swapping them in (and back out once it's shut) can't be seen.
 *
 * Cars with no cabin modelled behind the door get a dark one, with a seat and
 * a wheel, so the opening never shows daylight through a hollow shell.
 *
 *   const door = new CarDoor(renderer, holder, model, bounds, CARS[i].door);
 *   door.set(0.6);   // 0 shut .. 1 wide open; call every frame it can move
 *   door.dispose();  // shut for good: the car's own materials back, the cut gone
 *
 * The door spec (CARS[].door) is in the car's own frame (+z forward, wheels on
 * y = 0, the driver's side at bounds.min.x: the car is right-hand drive):
 *   z: [rear edge, front edge], y: [sill, top], depth: how far in from the side
 *   the door goes, swing: 'out' (hinged at the front, the rear edge swings out)
 *   or 'up' (a scissor door, rising about its front edge), interior: true when
 *   the model has its own cabin behind the door, seat: where he sits
 *   ({ x: in from the side, z, y: the cushion's height }).
 */
export const DEFAULT_DOOR = { z: [-0.5, 0.6], y: [0.3, 1.1], depth: 0.3, swing: "out", interior: false };

const OPEN_OUT = THREE.MathUtils.degToRad(66);
const OPEN_UP = THREE.MathUtils.degToRad(72);

/** A copy of a material for this car alone, keeping the paint shader (paint.js makePaintable) hooked up. */
function ownMaterial(m) {
  const c = m.clone();
  c.onBeforeCompile = m.onBeforeCompile;
  c.customProgramCacheKey = m.customProgramCacheKey;
  c.userData = m.userData; // the paint uniforms are shared on purpose: it is the same paint
  return c;
}

export class CarDoor {
  constructor(renderer, holder, model, bounds, spec = DEFAULT_DOOR) {
    this.renderer = renderer;
    this.holder = holder;
    this.model = model;
    this.spec = { ...DEFAULT_DOOR, ...spec };
    const { min, max } = bounds;
    const [z0, z1] = this.spec.z;
    const [y0, y1] = this.spec.y;
    const xIn = min.x + this.spec.depth;
    this.length = z1 - z0;

    this._clipWas = renderer.localClippingEnabled;
    renderer.localClippingEnabled = true;

    // the hole in the body: inside all five at once is cut away
    this._holeLocal = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -xIn), // x < xIn (outward of it, on the driver's side)
      new THREE.Plane(new THREE.Vector3(0, -1, 0), y0), // y > sill
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -y1), // y < top
      new THREE.Plane(new THREE.Vector3(0, 0, -1), z0), // z > rear edge
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -z1), // z < front edge
    ];
    // the door itself: outside any one of them is cut away
    this._keepLocal = this._holeLocal.map((p) => p.clone().negate());
    this._holeWorld = this._holeLocal.map((p) => p.clone());
    this._keepWorld = this._keepLocal.map((p) => p.clone());

    // the hinge, on the side skin at the door's front edge; its pivot is
    // high up for a scissor door, which rises about a pin by the windscreen
    this.hinge = new THREE.Group();
    this.hinge.position.set(min.x, this.spec.swing === "up" ? y0 + (y1 - y0) * 0.55 : 0, z1);
    this.piece = new THREE.Group();
    this.piece.position.copy(this.hinge.position).negate(); // inside it, the car's own frame
    this.hinge.add(this.piece);
    holder.add(this.hinge);

    // the box the door is, in the car's frame, to skip meshes that don't reach it (the wheels)
    const doorBox = new THREE.Box3(new THREE.Vector3(min.x - 0.5, y0, z0), new THREE.Vector3(xIn, y1, z1));
    holder.updateWorldMatrix(true, true);
    const toHolder = new THREE.Matrix4().copy(holder.matrixWorld).invert();
    const rel = new THREE.Matrix4();
    const box = new THREE.Box3();
    this._swapped = [];
    this._trim = new THREE.MeshStandardMaterial({ color: 0x2b2724, roughness: 0.92, side: THREE.BackSide });
    this._trim.clippingPlanes = this._keepWorld;
    model.traverse((o) => {
      if (!o.isMesh) return;
      const was = o.material;
      const list = Array.isArray(was) ? was : [was];
      const body = list.map((m) => {
        const c = ownMaterial(m);
        c.clippingPlanes = this._holeWorld;
        c.clipIntersection = true;
        c.clipShadows = true;
        return c;
      });
      o.material = Array.isArray(was) ? body : body[0];
      this._swapped.push({ mesh: o, material: was, body });

      rel.multiplyMatrices(toHolder, o.matrixWorld);
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      if (!box.copy(o.geometry.boundingBox).applyMatrix4(rel).intersectsBox(doorBox)) return;
      const door = list.map((m) => {
        const c = ownMaterial(m);
        c.clippingPlanes = this._keepWorld;
        c.clipShadows = true;
        return c;
      });
      const copy = new THREE.Mesh(o.geometry, Array.isArray(was) ? door : door[0]);
      rel.decompose(copy.position, copy.quaternion, copy.scale);
      copy.castShadow = true;
      copy.receiveShadow = true;
      // most models' doors are the outer skin alone: open, you'd see straight
      // through it from behind. Its back is drawn as the door's inside, in trim
      const inside = new THREE.Mesh(o.geometry, this._trim);
      inside.position.copy(copy.position);
      inside.quaternion.copy(copy.quaternion);
      inside.scale.copy(copy.scale);
      inside.receiveShadow = true;
      this.piece.add(copy, inside);
    });

    if (!this.spec.interior) this._buildCabin(min, max, xIn);
    this.set(0);
  }

  /**
   * A dark cabin behind the door for models that are a hollow shell: its walls
   * face inward (BackSide), so from outside only the far side and the floor
   * show through the opening, never its near wall; a seat and the wheel in it.
   */
  _buildCabin(min, max, xIn) {
    const [z0, z1] = this.spec.z;
    const [y0, y1] = this.spec.y;
    const seat = this.seatLocal();
    const trim = new THREE.MeshStandardMaterial({ color: 0x24211e, roughness: 0.95, side: THREE.BackSide });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x3a3631, roughness: 0.9 });
    const cabin = new THREE.Group();
    // only as long as the door: a pickup's cab ends just behind it
    const w = max.x - min.x - 0.24, h = y1 - y0 - 0.06, l = this.length + 0.3;
    const shell = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), trim);
    shell.position.set((min.x + max.x) / 2, y0 + 0.04 + h / 2, (z0 + z1) / 2 - 0.05);
    cabin.add(shell);
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), cloth);
    cushion.position.set(seat.x, seat.y - 0.06, seat.z + 0.05);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.12), cloth);
    back.position.set(seat.x, seat.y + 0.3, seat.z - 0.25);
    back.rotation.x = -0.22;
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 20), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 }));
    wheel.position.set(seat.x, seat.y + 0.42, seat.z + 0.62);
    wheel.rotation.x = -0.45;
    cabin.add(cushion, back, wheel);
    cabin.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    this.cabin = cabin;
    this.holder.add(cabin);
    void xIn;
  }

  /** Where he sits, in the car's frame: the middle of the driver's seat, at cushion height. */
  seatLocal(out = new THREE.Vector3()) {
    const [z0, z1] = this.spec.z;
    const [y0] = this.spec.y;
    const s = this.spec.seat || {};
    const min = this.hinge.position.x; // the side skin
    return out.set(min + (s.x ?? 0.44), s.y ?? y0 + 0.18, s.z ?? (z0 + z1) / 2 - 0.2);
  }

  /** 0 shut .. 1 open. Moves the door and keeps both cuts where they belong. */
  set(k) {
    this.k = k;
    if (this.spec.swing === "up") {
      this.hinge.rotation.set(OPEN_UP * k, -0.12 * k, 0); // rises about its front edge, tipping out a little
    } else {
      this.hinge.rotation.set(0, OPEN_OUT * k, 0); // the rear edge swings out, toward -x
    }
    this.sync();
  }

  /** The clipping planes are in world space: move them with the car and the door. */
  sync() {
    this.holder.updateWorldMatrix(true, true);
    const body = this.holder.matrixWorld;
    const door = this.piece.matrixWorld;
    for (let i = 0; i < 5; i++) {
      this._holeWorld[i].copy(this._holeLocal[i]).applyMatrix4(body);
      this._keepWorld[i].copy(this._keepLocal[i]).applyMatrix4(door);
    }
  }

  /** Where the rear edge of the door is, at handle height, in world space (for his hand). */
  handleWorld(out = new THREE.Vector3()) {
    const [z0] = this.spec.z;
    const [y0, y1] = this.spec.y;
    out.set(this.hinge.position.x, y0 + (y1 - y0) * 0.62, z0 + 0.12);
    this.piece.updateWorldMatrix(true, false);
    return this.piece.localToWorld(out);
  }

  /** The door is shut for good: the car's own materials back, the copy and the cabin gone. */
  dispose() {
    for (const s of this._swapped) {
      s.mesh.material = s.material;
      for (const m of s.body) m.dispose();
    }
    this._swapped.length = 0;
    this.piece.traverse((o) => {
      if (o.isMesh) for (const m of [].concat(o.material)) m.dispose();
    });
    this._trim.dispose();
    this.holder.remove(this.hinge);
    if (this.cabin) {
      this.cabin.traverse((o) => {
        if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
      });
      this.holder.remove(this.cabin);
    }
    this.renderer.localClippingEnabled = this._clipWas;
  }
}
