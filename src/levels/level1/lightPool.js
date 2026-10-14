import * as THREE from "three";

/**
 * A fixed handful of real point lights standing in for all of the level's
 * glows (pickups, letters, runes, the guardian's eyes, the jetpack...).
 *
 * three.js builds every material's shader for the number of lights in the
 * scene, and a light inside a hidden group drops out of that count. Level 1
 * shows and hides lit props all the time — health packs culled by distance,
 * letters and pickups collected, the guardian appearing and leaving — and
 * each change recompiled every material on screen: 6-7 s freezes on an
 * integrated GPU. Every pixel also paid for all ~22 point lights on the
 * course, kilometres away or not.
 *
 * So the level's own point lights no longer render. Each stays where it was
 * (on a layer no camera sees), still moved, dimmed and hidden by the code
 * that owns it, and every frame the pool's lights take on the nearest ones
 * that are actually showing. The count never changes, so nothing recompiles.
 *
 *   const pool = new LightPool(level.root);   // once everything is built
 *   pool.update(focus);                       // each frame, before rendering
 */
const _p = new THREE.Vector3();

export class LightPool {
  constructor(root, size = 8) {
    this.root = root;
    this.sources = [];
    root.traverse((o) => {
      if (!o.isPointLight) return;
      o.layers.disableAll();
      this.sources.push({ light: o, d: 0 });
    });
    this.lights = [];
    for (let i = 0; i < size; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 1, 2);
      l.name = "light-pool";
      root.add(l);
      this.lights.push(l);
    }
    this._live = [];
  }

  /** Hand the pool's lights to the glows nearest `focus` (a world position). */
  update(focus) {
    const live = this._live;
    live.length = 0;
    for (const s of this.sources) {
      const l = s.light;
      if (l.intensity <= 0 || !this._shown(l)) continue;
      l.getWorldPosition(_p);
      // a wide light reaches further, so it counts as that much nearer
      s.d = _p.distanceTo(focus) - (l.distance || 100);
      live.push(s);
    }
    live.sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.lights.length; i++) {
      const out = this.lights[i];
      const src = live[i]?.light;
      if (!src) {
        out.intensity = 0;
        continue;
      }
      src.updateWorldMatrix(true, false);
      out.position.copy(this.root.worldToLocal(src.getWorldPosition(_p)));
      out.color.copy(src.color);
      out.intensity = src.intensity;
      out.distance = src.distance;
      out.decay = src.decay;
    }
  }

  /** Visible all the way up, and still in the level at all. */
  _shown(o) {
    let p = o;
    for (; p && p !== this.root; p = p.parent) if (!p.visible) return false;
    return p === this.root;
  }
}
