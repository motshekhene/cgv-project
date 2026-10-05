import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { dotTexture } from './fx.js';
import { KEY_CYAN } from './cast.js';

/**
 * Stand-in vehicles for the Level 2 scenes until jeep.glb / suv.glb are sourced
 * (assets/jungle/README.md, "Not in the repo yet"). Same colours as the level:
 * Kai's jeep cyan-blue 0x35c9ff, the Handler's SUV dark red 0x5a1410.
 * Front faces -z, like tools/concepts/story.js -> car().
 *
 *   const jeep = makeJeep();  root.add(jeep.group);
 *   jeep.setLights(1);         // 0..1, headlights and their spotlight
 *   jeep.spin(distance);       // roll the wheels by distance travelled
 */
const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });
const _p = new THREE.Vector3();

function flare(color, size) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: dotTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }),
  );
  s.scale.setScalar(size);
  return s;
}

function vehicle({ color, suv }) {
  const g = new THREE.Group();
  const body = new THREE.Group(); // bounces and tilts on top of the wheels
  g.add(body);
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.42 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.5, roughness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a1016, metalness: 0.85, roughness: 0.12 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.9 });
  const W = suv ? 2.0 : 1.85;
  const L = suv ? 4.8 : 4.0;
  const H = suv ? 0.95 : 0.7;
  const base = 0.42;
  let driverSeat = null;

  const hull = new THREE.Mesh(new RoundedBoxGeometry(W, H, L, 3, 0.14), paint);
  hull.position.y = base + H / 2;
  body.add(hull);
  if (suv) {
    // tall closed cabin with dark glass all round, and a steel bull bar for ramming
    const cab = new THREE.Mesh(new RoundedBoxGeometry(W * 0.92, 0.8, L * 0.62, 3, 0.12), glass);
    cab.position.set(0, base + H + 0.38, 0.35);
    body.add(cab);
    const roof = new THREE.Mesh(new RoundedBoxGeometry(W * 0.94, 0.08, L * 0.6, 2, 0.04), paint);
    roof.position.set(0, base + H + 0.8, 0.35);
    body.add(roof);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(W * 0.95, 0.5, 0.12), dark);
    bar.position.set(0, base + 0.35, -L / 2 - 0.12);
    body.add(bar);
  } else {
    // open-top jeep: windscreen frame, roll bar, seats, spare wheel on the back
    const screen = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, 0.55, 0.04), new THREE.MeshStandardMaterial({ color: 0xa8c8d8, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.22 }));
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(W * 0.94, 0.06, 0.07), dark);
    frameTop.position.set(0, base + H + 0.53, -0.38);
    frameTop.rotation.x = -0.25;
    body.add(frameTop);
    screen.position.set(0, base + H + 0.27, -0.45);
    screen.rotation.x = -0.25;
    body.add(screen);
    const rollGeo = new THREE.CylinderGeometry(0.045, 0.045, 1, 8);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(rollGeo, dark);
      post.scale.y = 0.9;
      post.position.set(sx * W * 0.42, base + H + 0.45, 0.85);
      body.add(post);
    }
    const top = new THREE.Mesh(rollGeo, dark);
    top.scale.y = W * 0.84;
    top.rotation.z = Math.PI / 2;
    top.position.set(0, base + H + 0.9, 0.85);
    body.add(top);
    const seat = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.9 });
    for (const sx of [-0.45, 0.45]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.5), seat);
      s.position.set(sx, base + H - 0.1, 0.35);
      body.add(s);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.12), seat);
      back.position.set(sx, base + H + 0.3, 0.62);
      body.add(back);
    }
    driverSeat = new THREE.Vector3(-0.45, base + H + 0.05, 0.32); // top of the left seat cushion
    const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.25, 18), tyre);
    spare.rotation.x = Math.PI / 2;
    spare.position.set(0, base + H * 0.7, L / 2 + 0.16);
    body.add(spare);
  }

  // the Key sits on the dash: the one cyan light in every Level 2 shot
  const key = flare(0x6fe3ff, 0.5);
  key.material.opacity = 0.9;
  key.position.set(0.35, base + H + 0.12, suv ? -0.6 : -0.2);
  const keyBox = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.14), new THREE.MeshStandardMaterial({ color: 0x141c26, emissive: KEY_CYAN, emissiveIntensity: 2.4 }));
  keyBox.position.copy(key.position);
  if (!suv) body.add(key, keyBox);

  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 18);
  const hubGeo = new THREE.BoxGeometry(0.46, 0.34, 0.09); // a bar across the hub, so you can see them turn
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.7, roughness: 0.4 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(wheelGeo, tyre);
      w.add(new THREE.Mesh(hubGeo, hubMat));
      w.rotation.z = Math.PI / 2;
      w.rotation.order = 'ZXY';
      w.position.set(sx * (W / 2 + 0.02), 0.42, sz * L * 0.32);
      w.castShadow = true;
      g.add(w);
      wheels.push(w);
    }
  }

  const heads = [];
  const headMat = glow(0.25, 0.24, 0.22);
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.05), headMat);
    hl.position.set(sx * W * 0.32, base + H * 0.62, -L / 2 - 0.03);
    body.add(hl);
    const f = flare(0xfff1d8, suv ? 2.6 : 2.0);
    f.userData.size = suv ? 2.6 : 2.0;
    f.position.copy(hl.position).add(new THREE.Vector3(0, 0, -0.1));
    body.add(f);
    heads.push(f);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.05), glow(4, 0.25, 0.2));
    tl.position.set(sx * W * 0.34, base + H * 0.7, L / 2 + 0.03);
    body.add(tl);
  }
  const spot = new THREE.SpotLight(0xfff1d8, 0, 45, 0.45, 0.6, 1.3);
  spot.position.set(0, base + H * 0.6, -L / 2);
  spot.target.position.set(0, 0, -L / 2 - 14);
  body.add(spot, spot.target);

  g.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });

  return {
    group: g,
    body,
    length: L,
    width: W,
    key,
    driverSeat, // jeep only: where a seated driver's hips go, in body space
    /** 0..1: lamps, flares and the spotlight together. */
    setLights(k) {
      headMat.color.setRGB(0.25 + k * 9, 0.24 + k * 8.6, 0.22 + k * 7.4);
      for (const f of heads) f.material.opacity = k * 0.95;
      spot.intensity = k * (suv ? 90 : 75);
    },
    /** Scale the headlight flares with distance, so they read far off without whiting out a close-up. */
    flaresFor(camera, near = 28) {
      for (const f of heads) {
        f.getWorldPosition(_p);
        f.scale.setScalar(f.userData.size * Math.min(5, Math.max(0.3, _p.distanceTo(camera.position) / near))); // small up close, never a pinprick far off
      }
    },
    /** Roll the wheels by the distance travelled (metres). */
    spin(distance) {
      for (const w of wheels) w.rotation.y = -distance / 0.42; // order ZXY: y is the axle once the wheel is laid down
    },
  };
}

export const makeJeep = () => vehicle({ color: 0x35c9ff, suv: false });
export const makeSuv = () => vehicle({ color: 0x5a1410, suv: true });

/**
 * A path a vehicle follows, sampled by distance: place(vehicle, d) puts it d
 * metres along, facing along the curve.
 */
export class Route {
  constructor(points, { tension = 0.5 } = {}) {
    this.curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', tension);
    this.length = this.curve.getLength();
    this._p = new THREE.Vector3();
    this._t = new THREE.Vector3();
  }

  place(obj, d) {
    const u = Math.min(1, Math.max(0, d / this.length));
    this.curve.getPointAt(u, this._p);
    this.curve.getTangentAt(u, this._t);
    obj.position.copy(this._p);
    obj.rotation.set(0, Math.atan2(-this._t.x, -this._t.z), 0); // front is -z
    return obj;
  }
}
