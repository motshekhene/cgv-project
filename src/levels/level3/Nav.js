import * as THREE from 'three';
import { WALK_R } from './ShrineArena.js';

/**
 * Nav — finding a way through the jungle ring, for the Handler (3A, AI).
 *
 * He used to run in a straight line at Kai, so a tree between them pinned him
 * against its trunk, running on the spot until Kai came back round it. Now:
 *
 *   - a grid of CELL m squares over the walkable disc, a square blocked when a
 *     fighter of radius `rad` standing on it would overlap a trunk, bush,
 *     column, statue, rock, shrine or wall (ShrineArena.obstacles / walls);
 *   - while the straight line to Kai is clear he takes it, as before;
 *   - when it isn't, A* over the grid, and he heads for the furthest point on
 *     that path he can walk to in a straight line, so he rounds a tree in one
 *     smooth arc rather than stepping square to square;
 *   - the path is kept and only worked out again when Kai has moved to
 *     another square, every REPLAN s, or when he has been held up (stuck()).
 *
 * The grid is built on first use (by then every obstacle is in), and again if
 * the number of obstacles changes. Everyone of the same radius shares one
 * (the company's men all walk the same grid); each keeps its own path.
 *
 *   const nav = new Nav(arena, 0.45);
 *   nav.clear(from, to)          // can he walk straight there?
 *   nav.steer(from, to, outDir)  // which way to walk to get there (unit vector, y = 0)
 *   nav.stuck()                  // he isn't getting anywhere: drop the path and find another
 */
const CELL = 0.5;
const MARGIN = 0.08; // a little room to spare round everything, so a path doesn't graze a trunk
const REPLAN = 0.35; // s
const LOOK = 14; // path points ahead to try for a straight line to
const SQRT2 = Math.SQRT2;

export class Nav {
  constructor(arena, rad = 0.45) {
    this.arena = arena;
    this.rad = rad;
    this.size = Math.ceil((WALK_R * 2) / CELL) + 2;
    this.origin = -WALK_R - CELL; // world x / z of cell 0's corner
    this.blocked = null;
    this._builtFor = -1;
    this.path = []; // world points, from him to Kai
    this._goalCell = -1;
    this._age = Infinity;
    this._last = performance.now();
  }

  /* ------------------------------------------------------------ the grid */

  _build() {
    const { arena, size, rad } = this;
    const shared = (arena._navGrids ||= {})[rad];
    if (shared && shared.builtFor === arena.obstacles.length) {
      this.blocked = shared.blocked;
      this._builtFor = shared.builtFor;
      this.path.length = 0;
      return;
    }
    const blocked = new Uint8Array(size * size);
    const lim = WALK_R - rad;
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const x = this.origin + (i + 0.5) * CELL, z = this.origin + (j + 0.5) * CELL;
        if (x * x + z * z > lim * lim) blocked[j * size + i] = 1;
      }
    }
    // stamp every circle and wall in, grown by his radius
    const stamp = (x0, x1, z0, z1, hit) => {
      const i0 = Math.max(0, Math.floor((x0 - this.origin) / CELL)), i1 = Math.min(size - 1, Math.floor((x1 - this.origin) / CELL));
      const j0 = Math.max(0, Math.floor((z0 - this.origin) / CELL)), j1 = Math.min(size - 1, Math.floor((z1 - this.origin) / CELL));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = this.origin + (i + 0.5) * CELL, z = this.origin + (j + 0.5) * CELL;
          if (hit(x, z)) blocked[j * size + i] = 1;
        }
      }
    };
    for (const o of arena.obstacles) {
      const r = o.r + rad + MARGIN;
      stamp(o.x - r, o.x + r, o.z - r, o.z + r, (x, z) => (x - o.x) ** 2 + (z - o.z) ** 2 < r * r);
    }
    for (const w of arena.walls) {
      const r = w.r + rad + MARGIN;
      stamp(w.ax - r, w.bx + r, w.z - r, w.z + r, (x, z) => {
        const cx = Math.min(w.bx, Math.max(w.ax, x));
        return (x - cx) ** 2 + (z - w.z) ** 2 < r * r;
      });
    }
    this.blocked = blocked;
    this._builtFor = arena.obstacles.length;
    arena._navGrids[rad] = { blocked, builtFor: this._builtFor };
    this.path.length = 0;
  }

  _cellOf(x, z) {
    const i = Math.floor((x - this.origin) / CELL), j = Math.floor((z - this.origin) / CELL);
    if (i < 0 || j < 0 || i >= this.size || j >= this.size) return -1;
    return j * this.size + i;
  }

  _free(c) {
    return c >= 0 && !this.blocked[c];
  }

  /** The nearest open square to `c` (it may be on one itself: pressed against a trunk, say). */
  _nearestFree(c) {
    if (this._free(c)) return c;
    const n = this.size;
    const ci = c % n, cj = (c / n) | 0;
    for (let r = 1; r <= 8; r++) {
      let best = -1, bestD = Infinity;
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= n || j >= n) continue;
          const k = j * n + i;
          const d = di * di + dj * dj;
          if (!this.blocked[k] && d < bestD) { best = k; bestD = d; }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /* ------------------------------------------------------------ queries */

  /** Can he walk from a to b in a straight line? */
  clear(a, b) {
    this._ensure();
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / (CELL * 0.5)));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const c = this._cellOf(a.x + dx * t, a.z + dz * t);
      if (c >= 0 && this.blocked[c]) {
        // the far end on a blocked square (Kai pressed to a tree) is fine: he only has to get next to it
        if (len * (1 - t) < this.rad + CELL) return true;
        return false;
      }
    }
    return true;
  }

  /** Which way to walk from `from` to reach `to` (written into `out`, unit length, y 0). */
  steer(from, to, out) {
    this._ensure();
    const now = performance.now();
    this._age += (now - this._last) / 1000;
    this._last = now;
    if (this.clear(from, to)) {
      this.path.length = 0;
      return out.set(to.x - from.x, 0, to.z - from.z).normalize();
    }
    const goal = this._cellOf(to.x, to.z);
    if (!this.path.length || goal !== this._goalCell || this._age > REPLAN) {
      this._plan(from, to);
      this._goalCell = goal;
      this._age = 0;
    }
    if (!this.path.length) return out.set(to.x - from.x, 0, to.z - from.z).normalize(); // nowhere to go: as before
    // drop the points he has reached, then aim for the furthest one in a straight line
    while (this.path.length > 1 && Math.hypot(this.path[0].x - from.x, this.path[0].z - from.z) < CELL * 0.75) this.path.shift();
    let aim = this.path[0];
    for (let k = Math.min(this.path.length - 1, LOOK); k > 0; k--) {
      if (this.clear(from, this.path[k])) { aim = this.path[k]; break; }
    }
    out.set(aim.x - from.x, 0, aim.z - from.z);
    if (out.lengthSq() < 1e-6) out.set(to.x - from.x, 0, to.z - from.z);
    return out.normalize();
  }

  /** He's been held up: find another way next time he asks. */
  stuck() {
    this.path.length = 0;
    this._age = Infinity;
  }

  _ensure() {
    if (!this.blocked || this._builtFor !== this.arena.obstacles.length) this._build();
  }

  /* ------------------------------------------------------------ A* */

  _plan(from, to) {
    const n = this.size;
    const start = this._nearestFree(this._cellOf(from.x, from.z));
    const goal = this._nearestFree(this._cellOf(to.x, to.z));
    this.path.length = 0;
    if (start < 0 || goal < 0) return;
    if (!this._g || this._g.length !== n * n) {
      this._g = new Float32Array(n * n);
      this._came = new Int32Array(n * n);
      this._seen = new Uint32Array(n * n);
      this._shut = new Uint32Array(n * n);
      this._stamp = 0;
      this._heap = new Heap(n * n);
    }
    const g = this._g, came = this._came, seen = this._seen, shut = this._shut, heap = this._heap;
    const run = ++this._stamp;
    const gi = goal % n, gj = (goal / n) | 0;
    const h = (c) => {
      const di = Math.abs((c % n) - gi), dj = Math.abs(((c / n) | 0) - gj);
      return (di + dj) + (SQRT2 - 2) * Math.min(di, dj);
    };
    heap.clear();
    g[start] = 0;
    came[start] = -1;
    seen[start] = run;
    heap.push(start, h(start));
    let found = false;
    while (heap.size) {
      const c = heap.pop();
      if (shut[c] === run) continue;
      shut[c] = run;
      if (c === goal) { found = true; break; }
      const ci = c % n, cj = (c / n) | 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= n || j >= n) continue;
          const k = j * n + i;
          if (this.blocked[k] || shut[k] === run) continue;
          // no cutting a corner past a blocked square
          if (di && dj && (this.blocked[cj * n + i] || this.blocked[j * n + ci])) continue;
          const ng = g[c] + (di && dj ? SQRT2 : 1);
          if (seen[k] === run && ng >= g[k]) continue;
          seen[k] = run;
          g[k] = ng;
          came[k] = c;
          heap.push(k, ng + h(k));
        }
      }
    }
    if (!found) return;
    const cells = [];
    for (let c = goal; c >= 0; c = came[c]) cells.push(c);
    cells.reverse();
    for (const c of cells) {
      this.path.push(new THREE.Vector3(this.origin + ((c % n) + 0.5) * CELL, 0, this.origin + (((c / n) | 0) + 0.5) * CELL));
    }
    // the last point is Kai himself, not the middle of his square
    this.path[this.path.length - 1].set(to.x, 0, to.z);
  }
}

/** A binary min-heap of cell indices by priority. */
class Heap {
  constructor(cap) {
    this.items = new Int32Array(cap * 4); // a square can go in more than once (a shorter way to it found later)
    this.pri = new Float32Array(cap * 4);
    this.size = 0;
  }

  clear() {
    this.size = 0;
  }

  push(item, p) {
    if (this.size >= this.items.length) return;
    let i = this.size++;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (this.pri[up] <= p) break;
      this.items[i] = this.items[up];
      this.pri[i] = this.pri[up];
      i = up;
    }
    this.items[i] = item;
    this.pri[i] = p;
  }

  pop() {
    const top = this.items[0];
    const item = this.items[--this.size], p = this.pri[this.size];
    let i = 0;
    for (;;) {
      let child = 2 * i + 1;
      if (child >= this.size) break;
      if (child + 1 < this.size && this.pri[child + 1] < this.pri[child]) child++;
      if (this.pri[child] >= p) break;
      this.items[i] = this.items[child];
      this.pri[i] = this.pri[child];
      i = child;
    }
    this.items[i] = item;
    this.pri[i] = p;
    return top;
  }
}
