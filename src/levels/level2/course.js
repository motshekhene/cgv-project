import * as THREE from 'three';
import { createSign, createLightShaft } from '../level1/jungleWorld.js';
import { populateJungleChunk, partsOf } from './JungleRoadside.js';
import { createWaterMaterial } from '../../shaders/water.js';
import { River, shore } from './river.js';
import { createWaterfallMaterial } from '../../shaders/waterfall.js';

/**
 * The River Road's course — Member 2A
 *
 * The road is a journey now, not an endless loop: ~4 km of jungle trail with
 * distance signs ("FALLS 2 KM"), then the last 200 m become a stone causeway
 * across the river, and at COURSE_END the causeway — and the river with it —
 * goes over the edge. The car goes over too: Level02 plays the fall, the
 * splash in the pool far below — where Level 2 ends. (Level 3 opens with
 * Kai waking in that waterfall pool.)
 *
 * Built from the team's own pieces: Level 1's signs, light shafts and jungle
 * kit, and Level 3's waterfall + water shaders (src/shaders, from mahlatse/level3).
 *
 *   const course = new Course(root, { endZ: COURSE_END, roadWidth: 24 });
 *   course.build(kit, mats);          // once the jungle kit is loaded
 *   course.update(dt, camera);        // every frame
 *   course.splash(position);          // the car hits the pool
 */
export const COURSE_END = 4100;   // a road-chunk boundary (chunks are 200 m, centred on multiples of 200)
export const DROP = 48;           // the pool is this far below the road

/** Level 3's waterfall shader, plus scene fog so it fades in with everything else. */
function foggyWaterfall(opts) {
  const m = createWaterfallMaterial(opts);
  m.fog = true;
  m.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, m.uniforms]);
  m.vertexShader = m.vertexShader
    .replace('varying vec2 vUv;', 'varying vec2 vUv;\n#include <fog_pars_vertex>')
    .replace('gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
      'vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);\n    gl_Position = projectionMatrix * mvPosition;\n    #include <fog_vertex>');
  m.fragmentShader = m.fragmentShader
    .replace('varying vec2 vUv;', 'varying vec2 vUv;\n#include <fog_pars_fragment>')
    .replace('#include <colorspace_fragment>', '#include <colorspace_fragment>\n    #include <fog_fragment>');
  return m;
}

function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export class Course {
  constructor(parent, { endZ = COURSE_END, roadWidth = 24 } = {}) {
    this.parent = parent;
    this.endZ = endZ;
    this.roadWidth = roadWidth;
    this.group = new THREE.Group();
    this.group.name = 'course';
    parent.add(this.group);
    this.time = 0;
    this.waters = [];
    this.falls = [];
    this._dot = softDot();
  }

  /** Distance left to the edge, and progress 0..1. */
  progress(z) {
    return { left: Math.max(0, this.endZ - z), t: THREE.MathUtils.clamp(z / this.endZ, 0, 1) };
  }

  /** 0..1: how loud the falls are from here. */
  roar(z) {
    return THREE.MathUtils.clamp(1 - (this.endZ - z) / 450, 0, 1);
  }

  build(kit, mats) {
    const E = this.endZ;
    const half = this.roadWidth / 2;
    const g = this.group;

    // ---------- Level 1 signage along the trail ----------
    const signs = [
      [60, 'SITE 7 →'], [E - 3000, 'FALLS 3 KM'], [E - 2000, 'FALLS 2 KM'],
      [E - 1000, 'FALLS 1 KM'], [E - 500, 'FALLS 500 M'], [E - 230, 'FALLS AHEAD'],
    ];
    signs.forEach(([z, text], i) => {
      const s = createSign(text, { width: 3.2, height: 1.0 });
      const sd = i % 2 === 0 ? 1 : -1;
      s.position.set(sd * (half + 3.2), 0, z);
      s.rotation.y = Math.PI + sd * 0.14;            // facing you as you come up the road
      g.add(s);
    });

    // mossy rock at a sane texel size on 100 m walls (the shared material tiles for a 2 m block)
    const tiled = (mat, rx, ry, shade = 1) => {
      const m = mat.clone();
      for (const k of ['map', 'normalMap', 'roughnessMap']) {
        if (!m[k]) continue;
        m[k] = m[k].clone();
        m[k].wrapS = m[k].wrapT = THREE.RepeatWrapping;
        m[k].repeat.set(rx, ry);
        m[k].needsUpdate = true;
      }
      m.color.multiplyScalar(shade);
      return m;
    };
    const stone = tiled(mats.stone, 3, 3, 0.8);
    const wallStone = tiled(mats.stone, 40, 6, 1.05);
    const darkStone = tiled(mats.stone, 60, 8, 0.45);
    const box = (w, h, d, x, y, z, mat = stone) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.receiveShadow = true;
      g.add(m);
      return m;
    };

    // ---------- the last 200 m: a causeway over the river ----------
    const z0 = E - 200;
    const wallX = half + 4.4;
    for (const sd of [-1, 1]) box(0.8, 3.2, 200, sd * wallX, -1.5, z0 + 100);       // causeway walls
    box(wallX * 2 + 0.8, 1.2, 6, 0, -0.6, E - 3);                                   // its broken end

    // the river: wandering banks sloping into a current that quickens and
    // whitens towards the lip (river.js)
    const river = new River(g, { endZ: E, wallX, forest: mats.forest });
    this.waters.push(river.material);
    const bedMat = new THREE.MeshStandardMaterial({ color: 0x2a3524, roughness: 1 });
    // the jungle stands back from the widest reach of the river
    const banks = new THREE.Group();
    banks.position.z = z0 + 100;
    populateJungleChunk(banks, kit, { length: 200, roadWidth: 290, seed: 4242 });
    g.add(banks);

    const r = (() => { let a = 99; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
    const rocks = [kit.rock1, kit.rock2, kit.rock3].filter(Boolean);
    const grass = [kit.grass1, kit.grass2, kit.grass3].filter(Boolean);
    const bushes = [kit.bush1, kit.bush2, kit.bush3].filter(Boolean);
    // all the bank props are instanced, one draw per part, like the roadside jungle
    const placed = new Map();
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _sv = new THREE.Vector3();
    const place = (proto, x, y, z, sc, ry) => {
      if (!placed.has(proto)) placed.set(proto, []);
      placed.get(proto).push(_m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _sv.setScalar(sc)).clone());
      return sc;
    };
    // boulders in the current, bigger towards the lip; the water breaks round them
    const inStream = [];
    for (let i = 0, tries = 0; i < 22 && rocks.length && tries < 200; tries++) {
      const sd = i % 2 ? 1 : -1;
      const x = sd * (wallX + 6 + r() * 95);
      const z = E - 8 - r() * 180;
      if (shore(x, z - E) < 4) continue;              // keep them in the water
      const proto = rocks[i % rocks.length];
      const sc = 0.012 + r() * 0.016 + (z > E - 40 ? 0.008 : 0);
      place(proto, x, -0.9, z, sc, r() * 6.3);
      const size = new THREE.Box3().setFromObject(proto).getSize(new THREE.Vector3()).multiplyScalar(sc / (proto.scale.x || 1));
      inStream.push({ x, z, r: Math.max(0.6, Math.max(size.x, size.z) * 0.45) });
      i++;
    }
    river.addRocks(inStream);
    // the banks: rocks at the waterline, reeds and bushes up the slope
    // and the jungle coming right down to the water, wherever the shore runs
    const trees = [kit.tree1, kit.tree2, kit.tree3, kit.tree4].filter(Boolean);
    const small = [kit.treeSmall1, kit.treeSmall2, kit.treeCluster].filter(Boolean);
    for (let i = 0; i < 520; i++) {
      const sd = r() < 0.5 ? -1 : 1;
      const z = E - 6 - r() * 192;
      // walk out from the road to the waterline, then up the bank
      let x = sd * (wallX + 2);
      while (Math.abs(x) < 160 && shore(x, z - E) > 0) x += sd;
      const up = r() < 0.6 ? r() * 8 : 8 + r() * 30;
      x += sd * up;
      if (Math.abs(x) > 150) continue;                // the roadside jungle takes over out there
      const y = -0.62 + 0.64 * Math.min(1, up / 9);
      const pick = r();
      if (up < 8) {
        if (pick < 0.25 && rocks.length) place(rocks[i % rocks.length], x, y - 0.15, z, 0.006 + r() * 0.008, r() * 6.3);
        else if (pick < 0.8 && grass.length) place(grass[i % grass.length], x, y, z, 0.011 + r() * 0.01, r() * 6.3);
        else if (bushes.length && up > 3) place(bushes[i % bushes.length], x, y, z, 0.012 + r() * 0.008, r() * 6.3);
      } else if (pick < 0.45 && trees.length) place(trees[i % trees.length], x, y, z, 0.02 + r() * 0.012, r() * 6.3);
      else if (pick < 0.65 && small.length) place(small[i % small.length], x, y, z, 6 + r() * 3, r() * 6.3);
      else if (bushes.length) place(bushes[i % bushes.length], x, y, z, 0.012 + r() * 0.008, r() * 6.3);
    }
    for (const [proto, mats] of placed) {
      for (const part of partsOf(proto)) {
        const inst = new THREE.InstancedMesh(part.geometry, part.material, mats.length);
        mats.forEach((m, i) => inst.setMatrixAt(i, _m.multiplyMatrices(m, part.local)));
        inst.instanceMatrix.needsUpdate = true;
        inst.computeBoundingSphere();
        inst.receiveShadow = true;
        g.add(inst);
      }
    }

    // ---------- the drop ----------
    // the cliff face the river pours over, the gorge walls either side of the
    // pool, and the far wall closing it off, jungle on every rim
    const POOL = 230;
    box(340, DROP + 4, 6, 0, -0.75 - (DROP + 4) / 2, E - 3, darkStone);
    for (const sd of [-1, 1]) box(70, DROP + 2, POOL, sd * 165, -(DROP + 2) / 2, E + POOL / 2, wallStone);
    box(400, DROP + 8, 30, 0, -DROP - 2 + (DROP + 8) / 2, E + POOL + 15, wallStone);
    for (const sd of [-1, 1]) {
      const top = new THREE.Mesh(new THREE.PlaneGeometry(300, POOL), mats.forest);
      top.rotation.x = -Math.PI / 2;
      top.position.set(sd * (130 + 150), 0.02, E + POOL / 2);
      g.add(top);
    }
    const farTop = new THREE.Mesh(new THREE.PlaneGeometry(700, 260), mats.forest);
    farTop.rotation.x = -Math.PI / 2;
    farTop.position.set(0, 6.02, E + POOL + 130);
    g.add(farTop);
    const rim = new THREE.Group();
    rim.position.z = E + POOL / 2;
    populateJungleChunk(rim, kit, { length: POOL, roadWidth: 262, seed: 777 });
    g.add(rim);
    const far = new THREE.Group();
    far.position.set(0, 6, E + POOL + 70);
    populateJungleChunk(far, kit, { length: 110, roadWidth: 0, seed: 991 });
    g.add(far);

    // the curtain: several overlapping sheets (the shader fades each one's
    // edges), so the streaks stay waterfall-sized across 260 m
    for (let i = 0; i < 8; i++) {
      const mat = foggyWaterfall({ water: 0x5aa6a0, foam: 0xf2ffff });
      mat.uniforms.uTime.value = i * 3.1;
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(42, DROP + 1.5, 1, 20), mat);
      sheet.position.set(-123 + i * 35, -0.7 - (DROP + 1.5) / 2, E + 0.4 + (i % 2) * 0.35);
      sheet.renderOrder = 2;
      g.add(sheet);
      this.falls.push(mat);
    }

    // the pool at the bottom (Level 3 opens in it)
    const poolMat = createWaterMaterial({
      deep: 0x174a48, shallow: 0x4f9e92, sky: 0x8fb3a6, sunDir: new THREE.Vector3(-0.35, 0.55, 0.75), foamAt: new THREE.Vector3(0, E + 6, 34),
    });
    this.waters.push(poolMat);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(300, POOL), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, -DROP, E + POOL / 2);
    g.add(pool);
    const poolBed = new THREE.Mesh(new THREE.PlaneGeometry(300, POOL), bedMat);
    poolBed.rotation.x = -Math.PI / 2;
    poolBed.position.set(0, -DROP - 4, E + POOL / 2);
    g.add(poolBed);

    // mist rolling off the base of the falls
    const N = 320;
    const pos = new Float32Array(N * 3);
    this._mistSeed = [];
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 250;
      pos[i * 3 + 1] = -DROP + Math.random() * 16;
      pos[i * 3 + 2] = E + 2 + Math.random() * 30;
      this._mistSeed.push(0.6 + Math.random() * 1.4);
    }
    const mistGeo = new THREE.BufferGeometry();
    mistGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mist = new THREE.Points(mistGeo, new THREE.PointsMaterial({
      size: 9, map: this._dot, color: 0xf4fbff, transparent: true, opacity: 0.32, depthWrite: false, sizeAttenuation: true,
    }));
    g.add(this.mist);

    // the spray cloud that boils up over the lip — how you see the falls
    // coming from the road, before you can see down into the gorge
    const C = 170;
    const cpos = new Float32Array(C * 3);
    this._cloudSeed = [];
    for (let i = 0; i < C; i++) {
      cpos[i * 3] = (Math.random() - 0.5) * 250;
      cpos[i * 3 + 1] = -24 + Math.random() * 34;
      cpos[i * 3 + 2] = E + 4 + Math.random() * 24;
      this._cloudSeed.push(0.7 + Math.random() * 0.8);
    }
    const cloudGeo = new THREE.BufferGeometry();
    cloudGeo.setAttribute('position', new THREE.BufferAttribute(cpos, 3));
    this.cloud = new THREE.Points(cloudGeo, new THREE.PointsMaterial({
      size: 16, map: this._dot, color: 0xf6fbff, transparent: true, opacity: 0.2, depthWrite: false, sizeAttenuation: true,
    }));
    g.add(this.cloud);

    // sun through the canopy over the river, like Level 1's shafts
    for (const [x, z, w] of [[-30, E - 60, 4], [24, E - 140, 3.4], [-8, E + 30, 5]]) {
      const shaft = createLightShaft(w, 0xffe2b0, 0.16);
      shaft.position.set(x, 30, z);
      g.add(shaft);
    }

    // splash particles (used once, at the end)
    const S = 260;
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(S * 3), 3));
    this.spray = new THREE.Points(sGeo, new THREE.PointsMaterial({
      size: 1.6, map: this._dot, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
    }));
    this.spray.frustumCulled = false;
    this._sprayVel = new Float32Array(S * 3);
    g.add(this.spray);
  }

  /** White-water burst where the car lands. */
  splash(at) {
    const p = this.spray.geometry.attributes.position.array;
    const v = this._sprayVel;
    for (let i = 0; i < p.length / 3; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random();
      p[i * 3] = at.x + Math.cos(a) * r * 2;
      p[i * 3 + 1] = at.y;
      p[i * 3 + 2] = at.z + Math.sin(a) * r * 2;
      v[i * 3] = Math.cos(a) * (2 + r * 7);
      v[i * 3 + 1] = 8 + Math.random() * 16;
      v[i * 3 + 2] = Math.sin(a) * (2 + r * 7);
    }
    this.spray.material.opacity = 1;
    this._sprayT = 0;
  }

  update(dt) {
    this.time += dt;
    for (const m of this.waters) m.uniforms.uTime.value = this.time;
    for (const m of this.falls) m.uniforms.uTime.value += dt * 0.5;

    if (this.mist) {
      const p = this.mist.geometry.attributes.position.array;
      for (let i = 0; i < p.length / 3; i++) {
        p[i * 3 + 1] += dt * this._mistSeed[i] * 1.6;
        p[i * 3 + 2] += dt * this._mistSeed[i] * 2.2;
        if (p[i * 3 + 1] > -DROP + 18) {
          p[i * 3 + 1] = -DROP + Math.random() * 2;
          p[i * 3 + 2] = this.endZ + 2 + Math.random() * 6;
        }
      }
      this.mist.geometry.attributes.position.needsUpdate = true;
    }

    if (this.cloud) {
      const p = this.cloud.geometry.attributes.position.array;
      for (let i = 0; i < p.length / 3; i++) {
        p[i * 3 + 1] += dt * this._cloudSeed[i] * 3;
        if (p[i * 3 + 1] > 10) { p[i * 3 + 1] = -24; p[i * 3 + 2] = this.endZ + 4 + Math.random() * 24; }
      }
      this.cloud.geometry.attributes.position.needsUpdate = true;
    }

    if (this._sprayT !== undefined && this.spray.material.opacity > 0) {
      this._sprayT += dt;
      const p = this.spray.geometry.attributes.position.array;
      const v = this._sprayVel;
      for (let i = 0; i < p.length / 3; i++) {
        v[i * 3 + 1] -= 22 * dt;
        p[i * 3] += v[i * 3] * dt;
        p[i * 3 + 1] = Math.max(-DROP, p[i * 3 + 1] + v[i * 3 + 1] * dt);
        p[i * 3 + 2] += v[i * 3 + 2] * dt;
      }
      this.spray.geometry.attributes.position.needsUpdate = true;
      this.spray.material.opacity = Math.max(0, 1 - this._sprayT / 2.2);
    }
  }

  /** Everything is under the level's root, so Level.teardown() frees it. */
  dispose() {
    this._dot.dispose();
  }
}
