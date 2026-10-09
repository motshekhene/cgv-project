import * as THREE from 'three';

/**
 * Gorge — Member 2A (Level 2 improvements)
 *
 * What the falls pour into: a rocky gorge instead of a box. The cliffs follow
 * a wandering outline (a wide plunge pool under the falls that narrows into a
 * river channel bending away downstream into the haze), lean back as they
 * rise, and are broken up into ledges and buttresses; they're dark and wet at
 * the waterline. The jungle floor runs from the cliff tops out to the horizon.
 *
 *   const gorge = new Gorge(group, { endZ: E, drop: DROP, stone, forest });
 *   gorge.halfWidth(zg), gorge.centre(zg)   // the outline, zg = z - endZ
 *   gorge.rim                               // [{ x, z, side }] points along the tops, for trees
 */

export const GORGE_LEN = 640;     // from the lip to where the channel fades out

const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// cheap smooth 2D value noise for the rock
function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x, y) {
  return vnoise(x, y) * 0.5 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.2;
}

export class Gorge {
  constructor(parent, { endZ, drop, stone, forest }) {
    this.endZ = endZ;
    this.drop = drop;
    this.rim = [];
    const group = new THREE.Group();
    group.name = 'level2-gorge';
    parent.add(group);

    const stoneMat = stone.clone();
    stoneMat.vertexColors = true;
    for (const k of ['map', 'normalMap', 'roughnessMap']) {
      if (!stoneMat[k]) continue;
      stoneMat[k] = stoneMat[k].clone();
      stoneMat[k].wrapS = stoneMat[k].wrapT = THREE.RepeatWrapping;
      stoneMat[k].repeat.set(1, 1);
      stoneMat[k].needsUpdate = true;
    }
    const groundMat = forest.clone();
    for (const k of ['map', 'normalMap', 'roughnessMap']) {
      if (!groundMat[k]) continue;
      groundMat[k] = groundMat[k].clone();
      groundMat[k].wrapS = groundMat[k].wrapT = THREE.RepeatWrapping;
      groundMat[k].repeat.set(1, 1);
      groundMat[k].needsUpdate = true;
    }

    for (const side of [-1, 1]) {
      const tops = [];
      group.add(this._cliff(side, stoneMat, tops));
      group.add(this._rimGround(side, groundMat, tops));
    }
  }

  /** Half the gorge's width at zg metres past the lip. */
  halfWidth(zg) {
    const pool = 150 + 22 * Math.sin(zg * 0.021 + 0.3) - 12 * sstep(60, 160, zg);
    const channel = 46 + 10 * Math.sin(zg * 0.017 + 1.1);
    return pool + (channel - pool) * sstep(170, 300, zg);
  }

  /** Where the gorge's middle is: straight under the falls, then it bends away. */
  centre(zg) {
    return 70 * Math.sin((zg - 200) * 0.0075) * sstep(180, 320, zg);
  }

  /**
   * One side's cliff: a grid running down the gorge (columns) and up the
   * face (rows), pushed in and out by noise so it reads as ledges and
   * buttresses, leaning back as it rises.
   */
  _cliff(side, mat, tops) {
    const D = this.drop;
    const STEP = 3, ROWS = 26;
    const cols = Math.ceil((GORGE_LEN + 8) / STEP) + 1;
    const pos = [], uv = [], col = [], idx = [];
    for (let i = 0; i < cols; i++) {
      const zg = -8 + i * STEP;
      // the face's line round the outline, measured along the ground for the texture
      for (let j = 0; j <= ROWS; j++) {
        const h = j / ROWS;                         // 0 at the foot (under water), 1 at the top
        const y = -D - 6 + h * (D + 6.2);
        const lean = h * h * 10;                    // steeper at the bottom, laid back at the top
        const ledges = fbm(zg * 0.045 + side * 13, y * 0.11) * 14 - 7;
        const buttress = (fbm(zg * 0.012 + side * 5, 0.5) - 0.5) * 22;
        const crumble = (vnoise(zg * 0.3, y * 0.35) - 0.5) * 2.2;
        const out = this.halfWidth(zg) + lean + ledges + buttress + crumble;
        const x = this.centre(zg) + side * Math.max(20, out);
        pos.push(x, y, this.endZ + zg);
        uv.push(zg / 9, y / 9);
        // wet and dark near the water, a little moss on the upper ledges
        const wet = 1 - sstep(-D, -D + 7, y);
        const moss = sstep(0.55, 0.9, h) * 0.25 * vnoise(zg * 0.1, y * 0.2);
        const shade = 0.78 + vnoise(zg * 0.07 + 3, y * 0.09) * 0.32 - wet * 0.45;
        col.push(shade * (1 - moss * 0.4), shade * (1 + moss * 0.3), shade * (1 - moss * 0.5));
      }
      // the top edge: where the rim ground starts, and the trees along it
      tops.push({ zg, x: pos[pos.length - 3] });
      if (i % 2 === 0) this.rim.push({ x: pos[pos.length - 3], z: this.endZ + zg, side });
    }
    for (let i = 0; i < cols - 1; i++) {
      for (let j = 0; j < ROWS; j++) {
        const a = i * (ROWS + 1) + j, b = a + ROWS + 1;
        // wind so the face looks into the gorge from either side
        if (side > 0) idx.push(a, b, a + 1, b, b + 1, a + 1);
        else idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  /** The jungle floor from the cliff's top edge out to the horizon on one side. */
  _rimGround(side, mat, tops) {
    const ACROSS = [0, 2, 6, 14, 30, 60, 110, 200, 320];
    const cols = tops.length;
    const pos = [], uv = [], idx = [];
    for (const { zg, x: edge } of tops) {
      for (const a of ACROSS) {
        const x = edge + side * a;
        // the ground rises a little away from the gorge
        const y = 0.2 - sstep(0, 2, a) * 0.18 + sstep(30, 300, a) * 6;
        pos.push(x, y, this.endZ + zg);
        uv.push(x / 5, zg / 5);
      }
    }
    const n = ACROSS.length;
    for (let i = 0; i < cols - 1; i++) {
      for (let j = 0; j < n - 1; j++) {
        const a = i * n + j, b = a + n;
        // facing up on both sides
        if (side > 0) idx.push(a, b, a + 1, b, b + 1, a + 1);
        else idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }
}
