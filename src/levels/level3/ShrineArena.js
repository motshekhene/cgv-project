import * as THREE from 'three';
import { RU, TINT, loadProp, place, scatter, pbr, rng, sign } from '../jungle/props.js';
import { createSky } from '../jungle/sky.js';
import { SHRINE_DAY, SHRINE_DUSK } from '../jungle/palette.js';
import { createWaterfallMaterial } from '../../shaders/waterfall.js';
import { createWaterMaterial } from '../../shaders/water.js';
import { createLightShaft } from '../../shaders/lightshaft.js';

/**
 * ShrineArena — the Site 7 courtyard where Level 3's fight happens (3B, world).
 *
 * Layout follows themes.js -> shrine and the guide's section 6: a disc of
 * mossy tiles (r ~12.4, same footprint the combat code clamps to), a ring of
 * twelve columns, the shrine gate on the -z side with guardian statues, and
 * behind it the waterfall cliff and the pool Kai wakes up in. Jungle all round.
 *
 * Owns its lights, sky and fog. Knows nothing about the fight: Level03 calls
 * update() each frame, setFocus() so the sun's shadow box follows the fight,
 * setDuskTarget(1) when phase III starts, and collide()/fighterY() to keep
 * both fighters on the ground and out of trees, bushes, statues and walls when the
 * fight spills out of the courtyard into the jungle.
 *
 * Budget notes (measured on an Intel UHD 620 at 720p): every light is paid
 * for on every pixel, even at intensity 0, so the torches are emissive flames
 * with no point lights, and there's no stage spotlight or HDRI environment
 * map; the hemisphere + fill lights carry the fighters instead. FBX material
 * groups are merged (props.js) and the jungle is instanced.
 */
const TILE = 199 * RU;
export const GATE = new THREE.Vector3(-3, 0, -17);
export const POOL = { x: -7, z: -28, r: 11, y: -0.18 };
const FALL = { x: -7, z: -33.5, w: 7, h: 19 };
const WALL_Z = -17.2;
const GATE_S = RU * 1.6;
export const WALK_R = 34; // how far into the jungle Kai (and the Handler after him) can go
const KEEP_R = 2.0; // a tree or bush whose edge is this close to Kai stays on screen (never shrinks for the camera)

const _mat = new THREE.Matrix4();
const _rot = new THREE.Matrix4();
const _axis = new THREE.Vector3();

/** Clearings in the jungle ring where the shrine gifts stand (level3/Awards.js). */
export const GIFT_SPOTS = {
  vitality: new THREE.Vector3(-25.5, 0, 9.5),
  strategy: new THREE.Vector3(25, 0, 10.5),
  power: new THREE.Vector3(-2.5, 0, 27.5),
};

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const BARK = /bark|trunk|^tree$/i;

/**
 * Where a model stands, measured from its own geometry (in the model's units, so
 * it scales with each copy): the centre and radius of its vertices between
 * heights `above` and `below`, optionally only those of materials matching
 * `match`, and its full height `top`. `pct` < 1 ignores the outermost few
 * vertices (a stray leaf shouldn't widen a bush). Null if nothing matched.
 *
 * Trees: the bark between knee and hip height. The five jungle trees range from
 * ~17 to ~32 units, 0.5 m to 1.2 m once placed, and the bushes from 0.5 m to
 * over 2 m, which no fixed collision circle can cover.
 */
function footprintOf(prop, { above = -Infinity, below = Infinity, match = null, pct = 1 } = {}) {
  prop.updateMatrixWorld(true);
  const inv = prop.matrixWorld.clone().invert();
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const pts = [];
  let top = 0;
  prop.traverse((o) => {
    if (!o.isMesh) return;
    const mats = [].concat(o.material);
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const groups = o.geometry.groups.length ? o.geometry.groups : [{ start: 0, count: idx ? idx.count : pos.count, materialIndex: 0 }];
    m.multiplyMatrices(inv, o.matrixWorld);
    for (const g of groups) {
      const wanted = !match || match.test(mats[g.materialIndex]?.name || '');
      for (let i = g.start; i < g.start + g.count; i++) {
        v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m);
        top = Math.max(top, v.y);
        if (wanted && v.y > above && v.y < below) pts.push(v.x, v.z);
      }
    }
  });
  if (!pts.length) return null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]);
    z0 = Math.min(z0, pts[i + 1]); z1 = Math.max(z1, pts[i + 1]);
  }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const ds = [];
  for (let i = 0; i < pts.length; i += 2) ds.push(Math.hypot(pts[i] - cx, pts[i + 1] - cz));
  ds.sort((a, b) => a - b);
  return { cx, cz, r: ds[Math.floor((ds.length - 1) * pct)], top };
}

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.35, 'rgba(255,255,255,.55)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class ShrineArena {
  constructor(root, scene) {
    this.root = root;
    this.scene = scene;
    this.dusk = 0;
    this.duskTarget = 0;
    this.flowTime = 0;
    this.dot = dotTexture();
    this._c = new THREE.Color();
    this.bursts = [];
    this.obstacles = []; // { x, z, r } circles: trunks, columns, statues, cliff rocks, altars
    this.plants = []; // solid trees and bushes: obstacles that also know their instance (occ, i), so a bump can rock it
    this.occluders = []; // instanced trees/bushes that shrink out of the camera's way
    this.swaying = new Set(); // plants still rocking from a bump
    this.leaves = null; // falling-leaf particles, built on the first bump
    this.walls = [ // the gate wall line, open under the arch
      { ax: -22.4, bx: -5.1, z: WALL_Z - 0.25, r: 0.5 },
      { ax: -0.9, bx: 13.2, z: WALL_Z - 0.25, r: 0.5 },
    ];

    /** Story beats need to know where things are. */
    this.anchors = {
      wake: new THREE.Vector3(-4.6, 0, -21.2), // where the current left Kai (in the pool)
      gate: GATE.clone(),
      gateTop: new THREE.Vector3(GATE.x, 9.0, GATE.z + 0.2), // top of the arch: the Handler drops from here
      box: new THREE.Vector3(1.45, 1.25, -16.45), // junction box beside the gate's right column
    };
  }

  /** Floor height under (x, z). The courtyard is flat at ~0; the jungle rolls; the pool is a basin. */
  groundHeight(x, z) {
    const r = Math.hypot(x, z);
    const dp = Math.hypot(x - POOL.x, z - POOL.z);
    let y = -0.06;
    const hill = smooth(15, 26, r) * smooth(POOL.r + 2, POOL.r + 10, dp) * smooth(4, 10, Math.abs(z - WALL_Z));
    y += hill * (0.35 + Math.sin(x * 0.11) * Math.cos(z * 0.09) * 0.45 + Math.sin(x * 0.27 + z * 0.19) * 0.2);
    if (dp < POOL.r) y -= 0.7 * Math.pow(1 - (dp / POOL.r) ** 2, 1.2);
    return y;
  }

  async build(assets) {
    const safe = (p) =>
      p.catch((e) => {
        console.warn('[shrine] asset missing, skipping:', e?.message || e);
        return null;
      });
    const L = (path, tint) => safe(loadProp(assets, path, tint));
    const [
      floor, floorSq, col, colShort, arch, wallO, wallA, wallAB, stag, fox, pot, potB, torch,
      tree1, tree2, tree3, tree4, treeR, bush, bushL, grass1, grass2, rock1, rock2, groundMat,
    ] = await Promise.all([
      L('ruins/floor-standard.fbx', TINT.stone),
      L('ruins/floor-squares.fbx', TINT.stone),
      L('ruins/column-round.fbx', TINT.stone),
      L('ruins/column-round-short.fbx', TINT.stone),
      L('ruins/arch-round-round-column.fbx', TINT.stone),
      L('ruins/wall-overgrown.fbx', TINT.stone),
      L('ruins/wall-arch-round-overgrown.fbx', TINT.stone),
      L('ruins/wall-arch-round-overgrown-broken.fbx', TINT.stone),
      L('ruins/statue-stag.fbx', TINT.statue),
      L('ruins/statue-fox.fbx', TINT.statue),
      L('ruins/pot-1.fbx'),
      L('ruins/pot-2-broken.fbx'),
      L('ruins/torch.fbx'),
      L('nature/tree-1.fbx'),
      L('nature/tree-2.fbx'),
      L('nature/tree-3.fbx'),
      L('nature/tree-4.fbx'),
      L('ruins/tree-1.fbx'),
      L('nature/bush-1.fbx'),
      L('ruins/bush-large.fbx'),
      L('nature/grass-1.fbx'),
      L('nature/grass-2.fbx'),
      L('nature/rock-1.fbx', TINT.rock),
      L('nature/rock-2.fbx', { Rock: 0x737a6a }),
      safe(pbr(assets, 'forest-floor', { repeat: 70, tint: 0x9fb07a })),
    ]);

    const add = (prop, x, y, z, opts) => (prop ? place(this.root, prop, x, y, z, opts) : null);
    const r = rng(11);

    this._buildSky();
    this._buildLights();
    this._buildGround(groundMat);

    // ---- the courtyard: a disc of stone tiles, a few missing or heaved near the edge
    const tiles = { std: [], sq: [] };
    for (let i = -4; i <= 4; i++) {
      for (let j = -4; j <= 4; j++) {
        const x = i * TILE, z = j * TILE, d = Math.hypot(x, z);
        if (d > 12.4) continue;
        if (d > 9 && r() < 0.08) continue;
        const spot = {
          x, z, s: RU,
          y: -0.05 + (d > 8 ? (r() - 0.6) * 0.12 : 0),
          ry: (Math.floor(r() * 4) * Math.PI) / 2,
          rx: d > 9 ? (r() - 0.5) * 0.05 : 0,
        };
        (r() < 0.3 ? tiles.sq : tiles.std).push(spot);
      }
    }
    if (floor) scatter(this.root, floor, tiles.std);
    if (floorSq) scatter(this.root, floorSq, tiles.sq);

    // ---- ring of columns, some snapped short or leaning; torches on the tall ones
    this.torchSpots = [];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + 0.13;
      const x = Math.cos(a) * 13.6, z = Math.sin(a) * 13.6;
      const broken = k % 3 === 1;
      add(broken ? colShort : col, x, 0, z, { s: RU * (broken ? 1.25 : 1.1), rz: k === 4 ? 0.14 : 0, rx: k === 8 ? -0.1 : 0 });
      this.obstacles.push({ x, z, r: broken ? 0.62 : 0.72 }); // square plinths: 0.49 / 0.58 to a side, more to a corner
      if (!broken && k !== 4 && k !== 8) this.torchSpots.push(a);
    }

    // ---- shrine gate, overgrown walls either side, guardians, steps
    add(arch, GATE.x, 0, GATE.z, { s: GATE_S });
    // the arch's two columns stand ~0.3 m proud of the wall line: give them their own footing
    this.obstacles.push({ x: GATE.x - 3.38, z: GATE.z - 0.3, r: 0.72 }, { x: GATE.x + 3.38, z: GATE.z - 0.3, r: 0.72 });
    for (const [x, piece] of [[-10.2, wallA], [4.2, wallAB], [-16.6, wallO], [10.6, wallO], [-19.8, wallO]]) {
      add(piece, x, 0, WALL_Z, { s: GATE_S });
    }
    add(stag, -8.6, 0, -14.2, { s: RU * 0.85, ry: 0.35 });
    add(fox, 3.2, 0, -14.4, { s: RU * 1.1, ry: -0.4 });
    this.obstacles.push({ x: -8.6, z: -14.2, r: 1.5 }, { x: 3.2, z: -14.4, r: 1.5 });
    this.templates = { pedestal: colShort };
    // paved path from the courtyard edge, under the arch, to the pool's rim
    if (floor) scatter(this.root, floor, [-12.7, -15.9, -19.1].map((z, i) => ({ x: -TILE, y: -0.05 - i * 0.02, z, s: RU, ry: i * Math.PI / 2 })));
    for (const [src, x, z, s, ry] of [[pot, 8.9, -9.9, RU, 0], [potB, 9.9, -9.0, RU, 1], [pot, -12.6, 2.2, RU * 1.2, 0]]) {
      add(src, x, 0, z, { s, ry });
      const fp = src && footprintOf(src, { below: 1.8 / s }); // the urns are round: their base is their footprint
      if (fp) this.obstacles.push({ x: x + fp.cx * s, z: z + fp.cz * s, r: fp.r * s });
    }

    this._buildSite7();
    this._buildTorches(torch);

    // ---- waterfall cliff behind the gate, the fall itself, and the pool
    for (const [x, y, z, s, ry, src] of [
      [-24, -2, -42, 0.13, 0.4, rock1], [-4, -3, -46, 0.16, 2.1, rock2], [16, -2, -40, 0.12, 1.2, rock1],
      [-38, -2, -32, 0.1, 0.9, rock2], [30, -2, -32, 0.1, 2.7, rock2],
    ]) {
      add(src, x, y, z, { s, ry });
      this.obstacles.push({ x, z, r: 0.8 * s * (src === rock1 ? 130 : 102) });
    }
    this._buildWater();

    // ---- jungle ring (instanced: one draw call per model, not per tree)
    // Trees and bushes are solid like the columns: collision circles measured
    // from each model (_solidify), and the camera never shrinks one Kai is next to.
    const treeSrc = [tree1, tree2, tree3, tree4, treeR];
    const treeSpots = treeSrc.map(() => []);
    for (let k = 0; k < 80; k++) {
      const a = r() * Math.PI * 2, d = 19 + r() * 42;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (z < -22 && Math.abs(x - FALL.x) < 10) continue; // keep the waterfall in view
      if (Math.hypot(x - POOL.x, z - POOL.z) < POOL.r + 1) continue;
      if (Object.values(GIFT_SPOTS).some((g) => Math.hypot(x - g.x, z - g.z) < 5)) continue; // shrine clearings
      const t = Math.floor(r() * treeSrc.length);
      const s = (t === 4 ? 0.03 : 0.028) * (0.8 + r() * 0.6);
      treeSpots[t].push({ x, y: this.groundHeight(x, z) - 0.15, z, s, ry: r() * 6.28 });
    }
    treeSrc.forEach((src, t) => {
      if (!src) return;
      const occ = this._occluder(scatter(this.root, src, treeSpots[t]), treeSpots[t], () => 1.9);
      // the trunk: bark between knee and hip height; the furthest vertices are the polygon's corners, so sit just inside them
      const trunk = footprintOf(src, { match: BARK, above: 12, below: 50 });
      this._solidify(occ, trunk, { fit: 0.92, leaves: (p) => ({ y: [2.6, 5], r: [p.r + 0.3, p.r + 2.1], n: 1 }) });
    });

    const bushSpots = [[], []];
    const ringSpots = [[], []];
    // a thick ring of undergrowth marks how far into the jungle the fight can go (no shadows: it's all edge)
    for (let k = 0; k < 70; k++) {
      const a = (k / 70) * Math.PI * 2 + r() * 0.06, d = WALK_R + 1.2 + r() * 2.5;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (z < -17 && x > -24 && x < 15) continue; // behind the shrine: the cliffs close it off
      const big = r() < 0.6;
      ringSpots[big ? 1 : 0].push({ x, y: this.groundHeight(x, z) - 0.1, z, s: (big ? RU * 1.3 : 0.02) * (0.9 + r() * 0.5), ry: r() * 6.28 });
    }
    for (let k = 0; k < 44; k++) {
      const a = r() * Math.PI * 2, d = 14.6 + r() * 6;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.abs(x - GATE.x) < 4 && z < -13 && z > -19) continue; // keep the gate clear
      const big = r() < 0.5;
      bushSpots[big ? 1 : 0].push({ x, y: this.groundHeight(x, z) - 0.1, z, s: (big ? RU : 0.016) * (0.8 + r() * 0.7), ry: r() * 6.28 });
    }
    // bushes: as wide as their foliage below head height (90% of it: a stray leaf shouldn't count),
    // a touch inside that, so Kai brushes the edge of the leaves as they stop him
    const bushFit = { fit: 0.9, give: 1.6, leaves: (p) => ({ y: [p.top * 0.35, p.top * 0.85], r: [0, p.r * 1.1], n: 0.6 }) };
    for (const [src, spots, shadow, reach] of [
      [bush, bushSpots[0], true, 54], [bushL, bushSpots[1], true, 100], [bush, ringSpots[0], false, 54], [bushL, ringSpots[1], false, 100],
    ]) {
      if (!src) continue;
      const occ = this._occluder(scatter(this.root, src, spots, { shadow }), spots, (sp) => sp.s * reach + 0.3);
      this._solidify(occ, footprintOf(src, { below: 100, pct: 0.9 }), bushFit);
    }

    const grassSpots = [[], []];
    for (let k = 0; k < 560; k++) {
      const a = r() * Math.PI * 2, d = 10.8 + r() * 26;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.hypot(x - POOL.x, z - POOL.z) < POOL.r * 0.82) continue; // reeds at the rim only
      grassSpots[k % 2].push({ x, y: this.groundHeight(x, z) - 0.02, z, s: 0.012 + r() * 0.01, ry: r() * 6.28 });
    }
    if (grass1) scatter(this.root, grass1, grassSpots[0]);
    if (grass2) scatter(this.root, grass2, grassSpots[1]);

    this._buildAtmosphere();
    this.setDusk(0);
  }

  /* ------------------------------------------------------------ pieces */

  _buildSky() {
    const d = SHRINE_DAY;
    this.sky = createSky({ ...d.sky, sunDir: d.sunDir, sunSize: 1400 });
    this.root.add(this.sky);
    this.scene.background = null;
    this.scene.fog = new THREE.FogExp2(d.fog, d.fogDensity);
  }

  _buildLights() {
    const d = SHRINE_DAY;
    this.hemi = new THREE.HemisphereLight(d.hemiSky, d.hemiGround, d.hemiIntensity);
    this.root.add(this.hemi);

    // warm sun from behind the gate, shadow box sized to the courtyard + gate
    this.sun = new THREE.DirectionalLight(d.sun, d.sunIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const c = this.sun.shadow.camera;
    c.left = c.bottom = -24;
    c.right = c.top = 24;
    c.near = 1;
    c.far = 140;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.target.position.set(0, 0, -3);
    this.root.add(this.sun, this.sun.target);

    // from behind the camera: cool skylight by day, warm "torchlight" on the fighters at dusk
    this.fill = new THREE.DirectionalLight(d.fill, d.fillIntensity);
    this.fill.position.set(14, 16, 32);
    this.root.add(this.fill);
  }

  _buildGround(mat) {
    const g = new THREE.PlaneGeometry(260, 260, 130, 130);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, this.groundHeight(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    const ground = new THREE.Mesh(g, mat || new THREE.MeshStandardMaterial({ color: 0x5d6b3a, roughness: 1 }));
    ground.receiveShadow = true;
    this.root.add(ground);
  }

  /** The shrine is wired: a laminated sign, a junction box with a cyan LED, and the cable into the gate. */
  _buildSite7() {
    const b = this.anchors.box;
    const site = sign(['SITE 7', { t: 'NO ENTRY · AUTHORISED PERSONNEL', size: 0.55 }], {
      w: 1.1, h: 0.7, bg: '#e8e2d2', fg: '#a3231c', border: '#a3231c',
    });
    site.position.set(-6.15, 1.85, -16.5);
    this.root.add(site);

    const metal = new THREE.MeshStandardMaterial({ color: 0x5b6266, metalness: 0.6, roughness: 0.4 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.22), metal);
    box.position.copy(b);
    box.castShadow = true;
    this.root.add(box);
    this.led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 3, 2.6) }));
    this.led.position.set(b.x + 0.15, b.y + 0.2, b.z + 0.12);
    this.root.add(this.led);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, b.y, 6), new THREE.MeshStandardMaterial({ color: 0x15181b }));
    cable.position.set(b.x - 0.12, b.y / 2 - 0.3, b.z);
    this.obstacles.push({ x: b.x - 0.12, z: b.z, r: 0.08 }); // it runs down to the ground, just proud of the wall
    this.root.add(cable);

    // tiny screen on the box: blank until the epilogue's upload
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = 256;
    this.screenCanvas.height = 128;
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.21),
      new THREE.MeshBasicMaterial({ map: this.screenTex, color: new THREE.Color(1.6, 1.6, 1.6) }),
    );
    this.screen.position.set(b.x, b.y + 0.08, b.z + 0.115);
    this.root.add(this.screen);
    this.setUpload(-1);
  }

  /** frac < 0 = idle screen; 0..1 = upload progress. */
  setUpload(frac, label = 'UPLOADING') {
    const g = this.screenCanvas.getContext('2d');
    const W = 256, H = 128;
    g.fillStyle = '#04110f';
    g.fillRect(0, 0, W, H);
    g.font = '700 22px Consolas, monospace';
    g.fillStyle = '#5ff2d6';
    if (frac < 0) {
      g.fillText('UPLINK  ●  IDLE', 18, 50);
      g.fillStyle = '#2b6e62';
      g.fillText('INSERT KEY', 18, 88);
    } else {
      g.fillText(`${label}  ${Math.round(frac * 100)}%`, 18, 44);
      g.strokeStyle = '#5ff2d6';
      g.lineWidth = 3;
      g.strokeRect(18, 66, W - 36, 30);
      g.fillRect(22, 70, (W - 44) * Math.min(1, frac), 22);
    }
    this.screenTex.needsUpdate = true;
  }

  _buildTorches(torch) {
    this.flames = [];
    if (!torch) return;
    torch.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) if (/fire/i.test(m.name)) this.fireMat = m;
    });
    const fireMat = new THREE.SpriteMaterial({ map: this.dot, color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
    this.flameMat = fireMat;
    this.torchSpots.forEach((a) => {
      const r = 13.0;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const ry = Math.atan2(Math.cos(a), Math.sin(a)); // torch's -z (its arm) points at the centre
      place(this.root, torch, x, 2.3, z, { s: RU * 0.85, ry, shadow: false });
      const tip = new THREE.Vector3(Math.cos(a) * (r - 0.38), 3.65, Math.sin(a) * (r - 0.38));
      const flame = new THREE.Sprite(fireMat);
      flame.position.copy(tip);
      flame.scale.setScalar(0.9);
      this.root.add(flame);
      this.flames.push(flame);
    });
  }

  _buildWater() {
    this.fallMat = createWaterfallMaterial();
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(FALL.w, FALL.h, 1, 24), this.fallMat);
    fall.position.set(FALL.x, FALL.h / 2 - 0.3, FALL.z);
    this.root.add(fall);

    this.poolMat = createWaterMaterial({
      sunDir: SHRINE_DAY.sunDir,
      foamAt: new THREE.Vector3(FALL.x, FALL.z + 0.6, 3.2),
    });
    const pool = new THREE.Mesh(new THREE.CircleGeometry(POOL.r, 64), this.poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(POOL.x, POOL.y, POOL.z);
    this.root.add(pool);

    // spray where the fall hits the pool
    this.mist = this._particles(160, [FALL.x, 1.4, FALL.z + 1.6], [7, 3, 3], { size: 0.55, color: 0xffffff, opacity: 0.3, additive: false, seed: 4 });
    this.mistSpeed = Float32Array.from({ length: 160 }, (_, i) => 0.4 + ((i * 37) % 17) / 17);
  }

  _buildAtmosphere() {
    // sun shafts through the canopy
    const sd = SHRINE_DAY.sunDir.clone().normalize();
    this.shafts = [];
    [[-4, -6, 2.2], [3, 2, 1.4], [-9, 4, 1.8], [6, -10, 1.6]].forEach(([x, z, w], i) => {
      const to = new THREE.Vector3(x, 0, z);
      const s = createLightShaft(to.clone().addScaledVector(sd, 34), to, w, 0xffd9a0, 0.13, i * 1.7);
      this.root.add(s);
      this.shafts.push(s);
    });
    // drifting pollen
    this.pollen = this._particles(300, [0, 3.5, -4], [36, 7, 36], { size: 0.07, color: 0xffe2a0, opacity: 0.9, seed: 9 });
    this.pollenBase = this.pollen.geometry.attributes.position.array.slice();
  }

  _particles(count, center, spread, { size, color, opacity, seed = 7, additive = true }) {
    const r = rng(seed);
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = center[0] + (r() - 0.5) * spread[0];
      pos[i * 3 + 1] = center[1] + (r() - 0.5) * spread[1];
      pos[i * 3 + 2] = center[2] + (r() - 0.5) * spread[2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({
      map: this.dot, size, color, transparent: true, opacity, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    pts.userData.center = center;
    pts.userData.spread = spread;
    this.root.add(pts);
    return pts;
  }

  /* ------------------------------------------------------------ runtime */

  /** A ring of dust kicked up at (x, z), e.g. where the Handler lands. */
  burst(x, z, { count = 46, color = 0xcbb894, speed = 4.2, size = 0.5, y = 0.15, lift = 1.6, additive = false } = {}) {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const v = speed * (0.6 + Math.random() * 0.6);
      pos.set([x, y + Math.random() * 0.3, z], i * 3);
      vel.set([Math.cos(a) * v, 0.6 + Math.random() * lift, Math.sin(a) * v], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({
      map: this.dot, size, color, transparent: true, opacity: 0.8, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    this.root.add(pts);
    this.bursts.push({ pts, vel, life: 1.1, max: 1.1, size });
  }

  /** Keep the sun's shadow box over the fight (snapped, so static shadows don't crawl). */
  setFocus(x, z) {
    const sx = Math.round(x / 4) * 4, sz = Math.round(z / 4) * 4 - 3;
    const t = this.sun.target.position;
    if (t.x === sx && t.z === sz) return;
    t.set(sx, 0, sz);
    this.sun.position.copy(this.sky.material.uniforms.uSunDir.value).multiplyScalar(60).add(t);
  }

  _occluder(group, spots, radius) {
    const meshes = group.children.filter((m) => m.isInstancedMesh);
    if (!meshes.length) return null;
    const n = spots.length;
    const o = {
      meshes, spots, radius: spots.map(radius),
      base: meshes.map((m) => m.instanceMatrix.array.slice()),
      k: new Float32Array(n).fill(1),
      keep: new Float32Array(n), // > 0 for solid ones: never shrink while Kai is this close to the root
      // bump sway: tilt angle, its rate, and the (unit) direction the top leans
      tilt: new Float32Array(n), spin: new Float32Array(n), dirX: new Float32Array(n), dirZ: new Float32Array(n),
    };
    this.occluders.push(o);
    return o;
  }

  /**
   * Make the copies in an occluder solid wherever the fight can reach them: a
   * collision circle from the model's footprint (`fp`, model units, times
   * `fit`), linked back to its instance so a bump can rock it (`give`: how
   * much), kept on screen while Kai is next to it, and `leaves(plant)` saying
   * where a bump shakes leaves loose from ({ y, r } ranges, n = how many).
   */
  _solidify(occ, fp, { fit = 1, give = 1, leaves }) {
    if (!occ) return;
    occ.spots.forEach((sp, i) => {
      const c = Math.cos(sp.ry || 0), sn = Math.sin(sp.ry || 0);
      const p = {
        x: fp ? sp.x + (fp.cx * c + fp.cz * sn) * sp.s : sp.x,
        z: fp ? sp.z + (-fp.cx * sn + fp.cz * c) * sp.s : sp.z,
        r: fp ? fp.r * fit * sp.s : 0.55,
        top: fp ? fp.top * sp.s : 4,
        occ, i, give,
      };
      if (Math.hypot(p.x, p.z) - p.r > WALK_R + 0.5) return; // beyond the walkable ring: nothing reaches it
      p.leaves = leaves(p);
      occ.keep[i] = p.r + KEEP_R;
      this.plants.push(p);
      this.obstacles.push(p);
    });
  }

  /** Write instance i of an occluder: its base matrix, shrunk by k and leaning by its tilt. */
  _pose(o, i) {
    const k = o.k[i], tilt = o.tilt[i], sp = o.spots[i];
    if (tilt) _rot.makeRotationAxis(_axis.set(o.dirZ[i], 0, -o.dirX[i]), tilt);
    o.meshes.forEach((m, mi) => {
      const j = i * 16;
      const e = _mat.fromArray(o.base[mi], j).elements;
      for (const c of [0, 1, 2, 4, 5, 6, 8, 9, 10]) e[c] *= k;
      if (tilt) {
        // lean about the plant's root, not the world origin
        e[12] -= sp.x; e[13] -= sp.y; e[14] -= sp.z;
        _mat.premultiply(_rot);
        e[12] += sp.x; e[13] += sp.y; e[14] += sp.z;
      }
      _mat.toArray(m.instanceMatrix.array, j);
      m.instanceMatrix.needsUpdate = true;
    });
  }

  /**
   * Camera cut-away: any tree or bush standing between the camera and what it
   * looks at shrinks away (and grows back once the camera has passed), so the
   * fight stays visible when it spills into the jungle. Only the 3x3 part of
   * each instance matrix is scaled, so it shrinks about its own root.
   *
   * A solid tree or bush within KEEP_R of `keep` (Kai) never shrinks: those
   * are the ones he can walk into, and one that vanishes as he reaches it reads
   * as walking through it. If one of them is behind him, pullCamera() brings
   * the camera in front of it instead.
   */
  updateOcclusion(dt, from, to, keep = null) {
    const ax = from.x, az = from.z;
    const dx = to.x - ax, dz = to.z - az;
    const len2 = dx * dx + dz * dz || 1e-6;
    const len = Math.sqrt(len2);
    for (const o of this.occluders) {
      for (let i = 0; i < o.spots.length; i++) {
        const sp = o.spots[i];
        const t = Math.min(1, Math.max(0, ((sp.x - ax) * dx + (sp.z - az) * dz) / len2));
        const px = ax + dx * t - sp.x, pz = az + dz * t - sp.z;
        const kept = keep && o.keep[i] > 0 && (sp.x - keep.x) ** 2 + (sp.z - keep.z) ** 2 < o.keep[i] * o.keep[i];
        const blocks = !kept && px * px + pz * pz < o.radius[i] * o.radius[i] && (1 - t) * len > 0.8;
        const k = o.k[i];
        const nk = blocks ? Math.max(0.0001, k - dt * 6) : Math.min(1, k + dt * 3);
        if (nk === k) continue;
        o.k[i] = nk;
        if (!o.tilt[i]) this._pose(o, i); // a swaying plant is re-posed every frame anyway
      }
    }
  }

  /**
   * Keep the camera (`cam`, moved in place) on Kai's side of any tree or bush
   * standing between him (`from`) and it: the third-person-camera answer to
   * one behind him, instead of hiding it. Only the ones updateOcclusion() keeps
   * on screen are checked (the rest get out of the way themselves), and a bush
   * low enough for the camera to see over is left alone.
   */
  pullCamera(from, cam, minDist = 1.2) {
    const dx = cam.x - from.x, dz = cam.z - from.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) return;
    const ux = dx / len, uz = dz / len;
    let near = len;
    for (const o of this.plants) {
      const ox = o.x - from.x, oz = o.z - from.z;
      const keep = o.r + KEEP_R;
      if (ox * ox + oz * oz > keep * keep) continue;
      const along = ox * ux + oz * uz;
      if (along <= 0) continue;
      const R = o.r + 0.35;
      const perp2 = ox * ox + oz * oz - along * along;
      if (perp2 > R * R) continue;
      const sight = 1.4 + (cam.y - from.y - 1.4) * Math.min(1, along / len); // the line from Kai's chest to the camera, there
      if (o.top < sight - 0.15) continue;
      near = Math.min(near, along - Math.sqrt(R * R - perp2));
    }
    if (near >= len) return;
    const f = Math.max(minDist, near) / len;
    cam.x = from.x + dx * f;
    cam.z = from.z + dz * f;
    cam.y = from.y + 1.9 + (cam.y - from.y - 1.9) * f; // drop a little as it comes in, so it isn't looking straight down
  }

  /**
   * Something ran into a tree or bush: it rocks away from (fromX, fromZ) on a
   * damped spring (a bush gives more than a trunk) and drops a few leaves.
   * strength 0..~1.6 (a roll hits hardest).
   */
  shakePlant(plant, fromX, fromZ, strength = 1) {
    const o = plant.occ;
    if (!o) return;
    const i = plant.i;
    let dx = plant.x - fromX, dz = plant.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    // add the kick along the new direction to whatever sway is still going
    const kick = 0.65 * strength * plant.give;
    const vx = o.dirX[i] * o.spin[i] + dx * kick;
    const vz = o.dirZ[i] * o.spin[i] + dz * kick;
    const tx = o.dirX[i] * o.tilt[i], tz = o.dirZ[i] * o.tilt[i];
    const v = Math.hypot(vx, vz) || 1;
    o.dirX[i] = vx / v; o.dirZ[i] = vz / v;
    o.spin[i] = Math.min(1.1 * plant.give, v);
    o.tilt[i] = tx * o.dirX[i] + tz * o.dirZ[i];
    this.swaying.add(plant);
    this._dropLeaves(plant, Math.round((8 + 10 * Math.min(1.5, strength)) * plant.leaves.n));
  }

  _updateSway(dt) {
    const w = 10, zeta = 0.17; // ~1.6 Hz, rings for a second or two
    const h = Math.min(dt, 1 / 30);
    for (const plant of this.swaying) {
      const o = plant.occ, i = plant.i;
      o.spin[i] += (-w * w * o.tilt[i] - 2 * zeta * w * o.spin[i]) * h;
      o.tilt[i] += o.spin[i] * h;
      if (Math.abs(o.tilt[i]) < 2e-4 && Math.abs(o.spin[i]) < 2e-3) {
        o.tilt[i] = o.spin[i] = 0;
        this.swaying.delete(plant);
      }
      this._pose(o, i);
    }
  }

  _buildLeaves() {
    const n = 220;
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(16, 16, 6, 13, 0.6, 0, Math.PI * 2);
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3).fill(-999), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      map: tex, size: 0.16, vertexColors: true, transparent: true, alphaTest: 0.4, depthWrite: true,
    }));
    pts.frustumCulled = false;
    this.root.add(pts);
    this.leaves = {
      pts, tex, n, next: 0,
      life: new Float32Array(n), vel: new Float32Array(n * 3), phase: new Float32Array(n),
      floor: new Float32Array(n),
    };
  }

  _dropLeaves(plant, count) {
    if (!this.leaves) this._buildLeaves();
    const L = this.leaves;
    const pos = L.pts.geometry.attributes.position;
    const col = L.pts.geometry.attributes.color;
    const greens = [0x5f8a2a, 0x7da03a, 0x4a6e22, 0x9a8f3c, 0x86a843];
    const { y: [y0, y1], r: [r0, r1] } = plant.leaves;
    for (let k = 0; k < count; k++) {
      const i = L.next;
      L.next = (L.next + 1) % L.n;
      const a = Math.random() * Math.PI * 2, d = r0 + Math.random() * (r1 - r0);
      const x = plant.x + Math.cos(a) * d, z = plant.z + Math.sin(a) * d;
      pos.setXYZ(i, x, y0 + Math.random() * (y1 - y0) + this.groundHeight(x, z), z);
      this._c.setHex(greens[Math.floor(Math.random() * greens.length)]);
      col.setXYZ(i, this._c.r, this._c.g, this._c.b);
      L.vel.set([(Math.random() - 0.5) * 0.6, -(0.55 + Math.random() * 0.5), (Math.random() - 0.5) * 0.6], i * 3);
      L.phase[i] = Math.random() * 10;
      L.life[i] = 7;
      L.floor[i] = this.groundHeight(x, z) + 0.03;
    }
    col.needsUpdate = true;
  }

  _updateLeaves(dt, time) {
    const L = this.leaves;
    if (!L) return;
    const pos = L.pts.geometry.attributes.position;
    let moved = false;
    for (let i = 0; i < L.n; i++) {
      if (L.life[i] <= 0) continue;
      moved = true;
      L.life[i] -= dt;
      let y = pos.getY(i);
      if (y <= L.floor[i]) {
        // settled: lie on the ground a moment, then go
        if (L.life[i] > 1.2) L.life[i] = 1.2;
        if (L.life[i] <= 0) pos.setY(i, -999);
        continue;
      }
      // flutter: side to side as they fall, a little faster on the down-swing
      const p = L.phase[i];
      const sway = Math.sin(time * 3.1 + p);
      pos.setX(i, pos.getX(i) + (L.vel[i * 3] + sway * 0.9) * dt);
      pos.setZ(i, pos.getZ(i) + (L.vel[i * 3 + 2] + Math.cos(time * 2.3 + p) * 0.6) * dt);
      y += L.vel[i * 3 + 1] * (1 + Math.abs(sway) * 0.5) * dt;
      pos.setY(i, Math.max(L.floor[i], y));
      if (L.life[i] <= 0) pos.setY(i, -999);
    }
    if (moved) pos.needsUpdate = true;
  }

  /** How deep the pool is at (x, z): 0 outside it, or where its bed is above the surface. */
  waterDepth(x, z) {
    if ((x - POOL.x) ** 2 + (z - POOL.z) ** 2 >= POOL.r * POOL.r) return 0;
    return Math.max(0, POOL.y - this.groundHeight(x, z));
  }

  /** What a falling drop lands on: the pool's surface, or the floor a fighter stands on. */
  surfaceY(x, z) {
    return this.waterDepth(x, z) > 0 ? POOL.y : this.fighterY(x, z);
  }

  /** Height a fighter stands at: the tiles in the courtyard, the real ground (hills, pool bed) outside. */
  fighterY(x, z) {
    const k = smooth(12.4, 13.6, Math.hypot(x, z));
    return k > 0 ? (this.groundHeight(x, z) + 0.04) * k : 0;
  }

  /**
   * Push a fighter at `pos` (radius `rad`) out of every obstacle and back inside
   * the walkable ring. Returns the tree or bush it was pushed off, if any (for shakePlant()).
   *
   * Repeated until nothing overlaps (a few passes at most): with things close
   * together, being pushed out of one can push a fighter into the next, e.g.
   * between a bush and the pot beside it, and a single pass would leave him there.
   */
  collide(pos, rad = 0.4) {
    let plant = null;
    for (let pass = 0; pass < 4; pass++) {
      let pushed = false;
      for (const o of this.obstacles) {
        const dx = pos.x - o.x, dz = pos.z - o.z;
        const min = o.r + rad;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min - 1e-6) continue;
        const d = Math.sqrt(d2) || 0.0001;
        pos.x = o.x + (dx / d) * min;
        pos.z = o.z + (dz / d) * min;
        pushed = true;
        if (o.occ !== undefined) plant = o;
      }
      for (const w of this.walls) {
        const cx = Math.min(w.bx, Math.max(w.ax, pos.x));
        const dx = pos.x - cx, dz = pos.z - w.z;
        const min = w.r + rad;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min - 1e-6) continue;
        const d = Math.sqrt(d2) || 0.0001;
        pos.x = cx + (dx / d) * min;
        pos.z = w.z + (d2 > 1e-8 ? dz / d : 1) * min;
        pushed = true;
      }
      const r = Math.hypot(pos.x, pos.z);
      if (r > WALK_R + 1e-6) {
        pos.x *= WALK_R / r;
        pos.z *= WALK_R / r;
        pushed = true;
      }
      if (!pushed) break;
    }
    return plant;
  }

  _updateBursts(dt) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      const p = b.pts.geometry.attributes.position;
      const drag = Math.exp(-3.2 * dt);
      for (let j = 0; j < p.count; j++) {
        b.vel[j * 3] *= drag;
        b.vel[j * 3 + 2] *= drag;
        b.vel[j * 3 + 1] -= 1.2 * dt;
        p.setXYZ(j, p.getX(j) + b.vel[j * 3] * dt, Math.max(0.05, p.getY(j) + b.vel[j * 3 + 1] * dt), p.getZ(j) + b.vel[j * 3 + 2] * dt);
      }
      p.needsUpdate = true;
      b.pts.material.opacity = 0.8 * Math.max(0, b.life / b.max);
      b.pts.material.size = b.size * (1 + (1 - b.life / b.max) * 1.8);
      if (b.life <= 0) {
        this.root.remove(b.pts);
        b.pts.geometry.dispose();
        b.pts.material.dispose();
        this.bursts.splice(i, 1);
      }
    }
  }

  /** 0 = golden hour (phases I-II), 1 = dusk (phase III). Eased in update(). */
  setDuskTarget(k) {
    this.duskTarget = k;
  }

  setDusk(k) {
    this.dusk = k;
    const a = SHRINE_DAY, b = SHRINE_DUSK;
    const lerp = (x, y) => x + (y - x) * k;
    const col = (out, x, y) => out.setHex(x).lerp(this._c.setHex(y), k);

    col(this.scene.fog.color, a.fog, b.fog);
    this.scene.fog.density = lerp(a.fogDensity, b.fogDensity);

    const u = this.sky.material.uniforms;
    col(u.uTop.value, a.sky.top, b.sky.top);
    col(u.uHorizon.value, a.sky.horizon, b.sky.horizon);
    col(u.uBottom.value, a.sky.bottom, b.sky.bottom);
    col(u.uSunColor.value, a.sky.sunColor, b.sky.sunColor);
    col(u.uCloudColor.value, a.sky.cloudColor, b.sky.cloudColor);
    u.uClouds.value = lerp(a.sky.clouds, b.sky.clouds);
    u.uSunDir.value.lerpVectors(a.sunDir, b.sunDir, k).normalize();

    col(this.sun.color, a.sun, b.sun);
    this.sun.intensity = lerp(a.sunIntensity, b.sunIntensity);
    this.sun.position.copy(u.uSunDir.value).multiplyScalar(60).add(this.sun.target.position);
    col(this.hemi.color, a.hemiSky, b.hemiSky);
    col(this.hemi.groundColor, a.hemiGround, b.hemiGround);
    this.hemi.intensity = lerp(a.hemiIntensity, b.hemiIntensity);
    col(this.fill.color, a.fill, b.fill);
    this.fill.intensity = lerp(a.fillIntensity, b.fillIntensity);

    const shafts = lerp(a.shafts, b.shafts);
    for (const s of this.shafts || []) s.material.uniforms.uStrength.value = shafts;
    if (this.poolMat) {
      this.poolMat.uniforms.uTint.value = k * 0.75;
      this.poolMat.uniforms.uSunDir.value.copy(u.uSunDir.value);
      this.poolMat.uniforms.uSunColor.value.copy(u.uSunColor.value);
      col(this.poolMat.uniforms.uSky.value, 0xcfe3e8, 0xb06a58);
    }
    if (this.fallMat) this.fallMat.uniforms.uTint.value = k * 0.55;

    this.torchLevel = lerp(a.torches, b.torches);
    if (this.fireMat) {
      col(this.fireMat.color, 0x2a2018, 0xffb060);
      this.fireMat.emissiveIntensity = 4 * this.torchLevel;
    }
    if (this.flameMat) this.flameMat.opacity = this.torchLevel;
  }

  update(dt, time, camera) {
    if (Math.abs(this.duskTarget - this.dusk) > 0.0005) {
      const step = dt / 3.5; // ~3.5 s from golden hour to dusk
      this.setDusk(this.dusk + Math.sign(this.duskTarget - this.dusk) * Math.min(step, Math.abs(this.duskTarget - this.dusk)));
    }

    this.sky.position.copy(camera.position);
    this.sky.material.uniforms.uTime.value = time;

    // phase III: the river behind the shrine floods, the fall speeds up
    this.flowTime += dt * (1 + this.dusk * 0.9);
    this.fallMat.uniforms.uTime.value = this.flowTime;
    this.poolMat.uniforms.uTime.value = this.flowTime;
    for (const s of this.shafts) s.material.uniforms.uTime.value = time;

    // torches flicker once lit
    if (this.torchLevel > 0.001) {
      this.flames.forEach((f, i) => {
        f.scale.setScalar(0.75 + 0.18 * Math.sin(time * 17 + i * 1.3) + 0.08 * Math.sin(time * 41 + i));
      });
    }

    // pollen drifts on slow loops around where it started
    const pp = this.pollen.geometry.attributes.position;
    const base = this.pollenBase;
    for (let i = 0; i < pp.count; i++) {
      const o = i * 3;
      pp.array[o] = base[o] + Math.sin(time * 0.21 + i * 1.7) * 0.9;
      pp.array[o + 1] = base[o + 1] + Math.sin(time * 0.37 + i * 0.9) * 0.45;
      pp.array[o + 2] = base[o + 2] + Math.cos(time * 0.17 + i * 2.3) * 0.9;
    }
    pp.needsUpdate = true;

    // spray rises off the pool and resets
    const mp = this.mist.geometry.attributes.position;
    const [, cy, cz] = this.mist.userData.center;
    for (let i = 0; i < mp.count; i++) {
      let y = mp.getY(i) + this.mistSpeed[i] * dt * (1 + this.dusk);
      let z = mp.getZ(i) + this.mistSpeed[i] * dt * 0.35;
      if (y > cy + 3.2) {
        y = cy - 1.4;
        z = cz - 1.2;
      }
      mp.setY(i, y);
      mp.setZ(i, z);
    }
    mp.needsUpdate = true;

    this._updateBursts(dt);
    this._updateSway(dt);
    this._updateLeaves(dt, time);
    this.led.visible = Math.sin(time * 5) > -0.6;
  }

  dispose() {
    if (this.scene) this.scene.fog = null;
    this.dot.dispose();
    if (this.leaves) this.leaves.tex.dispose();
  }
}
