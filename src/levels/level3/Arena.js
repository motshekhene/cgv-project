import * as THREE from "three";
import {
  fbm2,
  makeRockMaterial,
  makeLavaMaterial,
  makeHeatHazeMaterial,
  makeDissolve,
  makeEmissive,
  makeGlowSprite,
  makeBoardTexture,
} from "./materials.js";

/**
 * The DEEPHOLD environment.
 *
 * Layout along z: shaft-bottom station (the teammate's GLB kit) around
 * z +6, a drift corridor down to z -20, then the lava arena centred at
 * z -38. The arena floor is eight wedges so phase 3 can eat it one
 * sector at a time; four steam vents, five server monoliths, the uplink
 * console at the far end, and three letters from the pitch.
 *
 * Collision is analytic — circles and clamps, no physics lib. That is a
 * deliberate team decision (physics engine still undecided) and circles
 * are all a top-down-ish melee needs.
 */

export const ARENA_CENTER = new THREE.Vector3(0, 0, -38);
const POOL_R = 7.0;
const ARENA_R = 18.2;

const LETTERS = [
  {
    id: "level03-1",
    pos: new THREE.Vector3(-3.2, 1.05, 8.2),
    text: "You were meant to find it.",
  },
  {
    id: "level03-2",
    pos: new THREE.Vector3(1.55, 1.05, -12.5),
    text: "He wrote your recruitment letter. Compare the handwriting.",
  },
  {
    id: "level03-3",
    pos: new THREE.Vector3(-2.9, 1.05, -45.9),
    text: "Eleven more keys. Eleven more of you.",
  },
];

/* ------------------------------------------------------------------ *
 * Steam vent — E triggers it under the Handler, the Handler triggers
 * it under you. Telegraph, blast, cooldown.
 * ------------------------------------------------------------------ */

const STEAM_VERT = /* glsl */ `
  attribute vec3 aSeed;
  uniform float uTime;
  uniform float uIntensity;
  varying float vA;
  void main() {
    float h = 5.5;
    float y = mod(aSeed.y * h + uTime * (1.4 + aSeed.z * 1.6), h);
    vec3 p = position;
    p.y = y;
    float spread = 0.18 + y * 0.14;
    p.x += sin(uTime * (1.2 + aSeed.x) + aSeed.z * 30.0) * spread;
    p.z += cos(uTime * (1.0 + aSeed.z) + aSeed.x * 30.0) * spread;
    vA = uIntensity * smoothstep(0.0, 1.2, y) * smoothstep(h, h - 2.2, y);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (30.0 + aSeed.x * 26.0) * (90.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const STEAM_FRAG = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.1, d) * vA * 0.16;
    if (a < 0.01) discard;
    gl_FragColor = vec4(0.86, 0.88, 0.92, a);
  }
`;

class Vent {
  constructor(root, pos) {
    this.pos = pos.clone();
    this.state = "idle";
    this.t = 0;
    this.cd = 0;

    // grate
    const grate = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.14, 1.15),
      new THREE.MeshStandardMaterial({
        color: 0x2c2f33,
        metalness: 0.8,
        roughness: 0.5,
      }),
    );
    grate.position.set(pos.x, 0.07, pos.z);
    grate.castShadow = true;
    grate.receiveShadow = true;
    root.add(grate);
    const slots = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.02, 0.85),
      makeEmissive(0xff8a3a, 1.4),
    );
    slots.position.set(pos.x, 0.15, pos.z);
    root.add(slots);

    // steam column
    const COUNT = 90;
    const positions = new Float32Array(COUNT * 3);
    const seeds = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.5;
      positions[i * 3] = Math.sin(a) * r;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = Math.cos(a) * r;
      seeds[i * 3] = Math.random();
      seeds[i * 3 + 1] = Math.random();
      seeds[i * 3 + 2] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 3));
    this.steamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0.5 },
      },
      vertexShader: STEAM_VERT,
      fragmentShader: STEAM_FRAG,
    });
    const points = new THREE.Points(geo, this.steamMat);
    points.position.set(pos.x, 0.15, pos.z);
    points.frustumCulled = false;
    root.add(points);

    // the light that sells the blast
    this.light = new THREE.PointLight(0xffa050, 2, 9, 2);
    this.light.position.set(pos.x, 0.8, pos.z);
    root.add(this.light);
  }

  trigger(byPlayer = false) {
    if (this.state !== "idle") return false;
    this.state = "telegraph";
    this.t = 0;
    this.byPlayer = byPlayer;
    return true;
  }

  update(dt, time, effects, onBlast) {
    this.steamMat.uniforms.uTime.value = time;

    switch (this.state) {
      case "idle":
        this.cd = Math.max(0, this.cd - dt);
        this.steamMat.uniforms.uIntensity.value =
          0.28 + Math.sin(time * 2.1 + this.pos.x) * 0.08;
        this.light.intensity = 2;
        break;
      case "telegraph":
        this.t += dt;
        this.steamMat.uniforms.uIntensity.value =
          0.5 + Math.min(1, this.t / 0.85) * 1.2;
        this.light.intensity = 2 + (this.t / 0.85) * 8;
        if (this.t >= 0.85) {
          this.state = "blast";
          this.t = 0;
          effects.spawnRing(this.pos, {
            maxR: 3.4,
            dur: 0.5,
            color: 0xffd0a0,
          });
          effects.burstSparks(this.pos, 30, 0xffc080, 9);
          effects.addTrauma(0.22);
          if (onBlast) onBlast(this.pos, this.byPlayer);
        }
        break;
      case "blast":
        this.t += dt;
        this.steamMat.uniforms.uIntensity.value = Math.max(
          0.6,
          2.2 - this.t * 3,
        );
        this.light.intensity = Math.max(2, 46 - this.t * 90);
        if (this.t >= 0.5) {
          this.state = "idle";
          this.cd = 6;
        }
        break;
    }
  }
}

/* ------------------------------------------------------------------ *
 * The arena itself
 * ------------------------------------------------------------------ */

export class Arena {
  constructor(root, kitGltf, effects) {
    this.root = root;
    this.effects = effects;
    this.time = 0;
    this.gateSealed = false;
    this.colliders = []; // { x, z, r }
    this.vents = [];
    this.wedges = [];
    this.letters = [];
    this.uplink = { pos: new THREE.Vector3(0, 0, -51.5) };

    this._buildCave();
    this._buildPool();
    this._buildStation(kitGltf);
    this._buildCorridor(kitGltf);
    this._buildMonoliths();
    this._buildVents();
    this._buildWedges();
    this._buildLetters();
    this._buildUplink();
    this._buildBoards();
  }

  /* ---------------- cave shell ---------------- */

  _displace(geo, fn) {
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      fn(v);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  _buildCave() {
    const rockMat = makeRockMaterial({
      color: 0x4a3b30,
      normalScale: 1.5,
      repeat: 7,
    });
    rockMat.side = THREE.BackSide;

    // wall — open cylinder, noise-swollen, with a mouth where the drift enters
    const wallGeo = new THREE.CylinderGeometry(19, 19, 24, 56, 9, true);
    this._displace(wallGeo, (v) => {
      const a = Math.atan2(v.x, v.z);
      const n = fbm2(a * 2.4 + 11.3, v.y * 0.22) * 3.6 - 1.8;
      let r = 19 + n;
      // entrance mouth: push out hard near the +z direction, lower half only
      const wrapped = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(wrapped) < 0.42 && v.y < 7) r = 24.5;
      const k = r / 19;
      v.x *= k;
      v.z *= k;
      v.y += (fbm2(v.x * 0.1, v.z * 0.1) - 0.5) * 1.4;
    });
    const wall = new THREE.Mesh(wallGeo, rockMat);
    wall.position.set(0, 9, -38);
    wall.receiveShadow = true;
    this.root.add(wall);

    // ceiling dome
    const domeGeo = new THREE.SphereGeometry(21, 44, 16, 0, Math.PI * 2, 0, Math.PI / 2.1);
    this._displace(domeGeo, (v) => {
      const a = Math.atan2(v.x, v.z);
      const k = 1 + (fbm2(a * 2.6 + 3.7, v.y * 0.16) - 0.5) * 0.22;
      v.multiplyScalar(k);
    });
    const dome = new THREE.Mesh(domeGeo, rockMat);
    dome.position.set(0, 12.5, -38);
    this.root.add(dome);

    // floor ring around the pool, cratering down toward the lava
    const floorGeo = new THREE.RingGeometry(6.6, 19.6, 64, 8);
    floorGeo.rotateX(-Math.PI / 2);
    this._displace(floorGeo, (v) => {
      const r = Math.hypot(v.x, v.z);
      v.y += (fbm2(v.x * 0.16, v.z * 0.16) - 0.5) * 0.55;
      if (r < 8.2) v.y -= (8.2 - r) * 0.26;
    });
    const floorMat = makeRockMaterial({
      color: 0x554539,
      normalScale: 1.2,
      repeat: 11,
    });
    this.floor = new THREE.Mesh(floorGeo, floorMat);
    this.floor.position.set(0, 0, -38);
    this.floor.receiveShadow = true;
    this.root.add(this.floor);

    // one cool key light from a ceiling shaft — the single shadow caster
    this.spot = new THREE.SpotLight(0xcfe0ff, 420, 0, 0.6, 0.55, 1.9);
    this.spot.position.set(3, 15.5, -33);
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(1024, 1024);
    this.spot.shadow.camera.far = 40;
    this.spot.shadow.bias = -0.0006;
    this.spot.target.position.set(0, 0, -38);
    this.root.add(this.spot, this.spot.target);

    this.root.add(
      new THREE.HemisphereLight(0x362417, 0x090403, 0.55),
    );
  }

  /* ---------------- lava pool ---------------- */

  _buildPool() {
    this.lavaMat = makeLavaMaterial({ scale: 3.4, speed: 0.4 });
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(POOL_R + 0.15, 48),
      this.lavaMat,
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, -0.62, -38);
    this.root.add(pool);

    // shaft below the pool so the lava reads as "deep", not "painted on"
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(POOL_R, POOL_R, 2.6, 32, 1, true),
      makeRockMaterial({ color: 0x241a14, repeat: 4 }),
    );
    shaft.material.side = THREE.BackSide;
    shaft.position.set(0, -1.9, -38);
    this.root.add(shaft);

    // heat haze shimmer above the surface
    this.hazeMat = makeHeatHazeMaterial({ opacity: 0.42 });
    const haze = new THREE.Mesh(
      new THREE.PlaneGeometry(13.5, 13.5),
      this.hazeMat,
    );
    haze.rotation.x = -Math.PI / 2;
    haze.position.set(0, 1.35, -38);
    this.root.add(haze);

    // two flickering warm lights standing in for the lava's radiance
    this.poolLights = [];
    for (const z of [-33.4, -42.6]) {
      const l = new THREE.PointLight(0xff5a1e, 55, 17, 2);
      l.position.set(0, 1.1, z);
      this.root.add(l);
      this.poolLights.push(l);
    }
  }

  /* ---------------- station from the kit ---------------- */

  _upgradeKitMaterials(clone) {
    const mats = {
      rock: makeRockMaterial({ color: 0x5c4a3c, normalScale: 1.0, repeat: 3 }),
      shotcrete: makeRockMaterial({
        color: 0x6b635a,
        normalScale: 0.7,
        repeat: 2,
      }),
      steel: (() => {
        const m = makeRockMaterial({
          color: 0x8b9099,
          normalScale: 0.5,
          repeat: 2,
        });
        m.metalness = 0.75;
        m.roughness = 0.45;
        return m;
      })(),
      timber: new THREE.MeshStandardMaterial({
        color: 0x6a4a2c,
        roughness: 0.9,
      }),
      dark: new THREE.MeshStandardMaterial({
        color: 0x14161a,
        roughness: 0.8,
        metalness: 0.3,
      }),
      lamp: makeEmissive(0xffc27a, 2.6),
      hiVis: new THREE.MeshStandardMaterial({
        color: 0xd97b1f,
        roughness: 0.6,
        emissive: 0x2a1400,
      }),
      paint: new THREE.MeshStandardMaterial({
        color: 0x9a3b2a,
        roughness: 0.6,
      }),
    };
    let lampCount = 0;
    clone.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      const name = obj.material && obj.material.name;
      if (mats[name]) obj.material = mats[name];
      // a few real point lights where the kit has lamps
      if (name === "lamp" && lampCount < 3) {
        const l = new THREE.PointLight(0xffb36b, 7, 9, 2);
        obj.getWorldPosition(l.position);
        l.position.y += 0.2;
        this.root.add(l);
        lampCount++;
      }
    });
  }

  _buildStation(kitGltf) {
    // clone, never the cached scene itself — restarts re-use the cache
    const station = kitGltf.scene.clone(true);
    station.position.set(0, 0, 6);
    this._upgradeKitMaterials(station);
    this.root.add(station);
  }

  /* ---------------- drift corridor ---------------- */

  _buildCorridor(kitGltf) {
    const find = (name) => {
      let found = null;
      kitGltf.scene.traverse((o) => {
        if (!found && o.name === name) found = o;
      });
      return found;
    };

    const drift = find("002-drift-straight-4m");
    const track = find("005-track-narrow-straight");
    const duct = find("020-vent-duct-run");
    const sign = find("017-warning-sign");

    const place = (node, x, y, z, rotY = 0) => {
      if (!node) return;
      const c = node.clone(true);
      c.position.set(x, y, z);
      c.rotation.y = rotY;
      this._upgradeKitMaterials(c);
      this.root.add(c);
    };

    // kit's own drifts reach world z ~-4; extend to the arena mouth
    for (const z of [-8, -12, -16, -19]) place(drift, 0, 0, z);
    for (const z of [-8, -12, -16]) {
      place(track, 0, 0.4, z);
      place(duct, -0.95, 1.65, z);
    }
    place(sign, 1.85, 0.4, -2.6, -0.5);

    // lava cracks lighting the walk down
    this.crackMat = makeLavaMaterial({ scale: 7.0, speed: 0.55 });
    const crackGeo = new THREE.PlaneGeometry(0.34, 15);
    for (const side of [-1, 1]) {
      const crack = new THREE.Mesh(crackGeo, this.crackMat);
      crack.rotation.x = -Math.PI / 2;
      crack.position.set(side * 1.52, 0.03, -10.5);
      this.root.add(crack);
    }
    for (const [x, z] of [
      [1.5, -7],
      [-1.5, -14],
    ]) {
      const l = new THREE.PointLight(0xff6a22, 6, 7, 2);
      l.position.set(x, 0.7, z);
      this.root.add(l);
    }
  }

  /* ---------------- server monoliths ---------------- */

  _buildMonoliths() {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x111418,
      metalness: 0.6,
      roughness: 0.5,
    });
    this.ledMats = [];
    const angles = [45, 100, 135, 225, 315];
    angles.forEach((deg, i) => {
      const a = (deg * Math.PI) / 180;
      const x = ARENA_CENTER.x + Math.sin(a) * 10.8;
      const z = ARENA_CENTER.z + Math.cos(a) * 10.8;

      const mono = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.15, 3.4, 0.75),
        bodyMat,
      );
      body.position.y = 1.7;
      body.castShadow = true;
      body.receiveShadow = true;
      mono.add(body);

      // server LEDs — cyan, the level-01 colour surviving down here
      const ledMat = makeEmissive(0x66d9ff, 2.2);
      this.ledMats.push(ledMat);
      for (let s = 0; s < 3; s++) {
        const led = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.18, 0.06),
          ledMat,
        );
        led.position.set(-0.32 + s * 0.32, 0.7 + (s % 2) * 2.0, 0.4);
        mono.add(led);
      }
      mono.position.set(x, 0, z);
      mono.lookAt(ARENA_CENTER.x, 0, ARENA_CENTER.z);
      this.root.add(mono);

      this.colliders.push({ x, z, r: 1.0 });
    });

    // one cyan fill so the servers actually colour the rock around them
    const led = new THREE.PointLight(0x66d9ff, 8, 8, 2);
    led.position.set(
      ARENA_CENTER.x + Math.sin(2.0) * 10.8,
      2.2,
      ARENA_CENTER.z + Math.cos(2.0) * 10.8,
    );
    this.root.add(led);
  }

  /* ---------------- steam vents ---------------- */

  _buildVents() {
    for (const deg of [70, 160, 250, 340]) {
      const a = (deg * Math.PI) / 180;
      const pos = new THREE.Vector3(
        ARENA_CENTER.x + Math.sin(a) * 8.6,
        0,
        ARENA_CENTER.z + Math.cos(a) * 8.6,
      );
      this.vents.push(new Vent(this.root, pos));
    }
  }

  /* ---------------- collapse wedges ---------------- */

  _buildWedges() {
    for (let i = 0; i < 8; i++) {
      const theta = (i * Math.PI) / 4; // +22.5° offset keeps mouth & uplink clear
      const geo = new THREE.RingGeometry(12.8, 18.2, 8, 2, theta, Math.PI / 4);
      geo.rotateX(-Math.PI / 2);
      this._displace(geo, (v) => {
        v.y += (fbm2(v.x * 0.16 + 50, v.z * 0.16) - 0.5) * 0.3;
      });
      const mat = makeRockMaterial({
        color: 0x554539,
        normalScale: 1.2,
        repeat: 11,
      });
      const dissolve = makeDissolve(mat, { color: 0xff5a1e, scale: 2.6 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, 0.035, -38);
      mesh.receiveShadow = true;
      this.root.add(mesh);

      // world-space sector direction, for the dot-product hazard test
      const alpha = theta + Math.PI / 8 + Math.PI / 2;
      this.wedges.push({
        mesh,
        dissolve,
        dir: new THREE.Vector2(Math.sin(alpha), Math.cos(alpha)),
        state: "alive",
        t: 0,
      });
    }
    // the order phase 3 eats them in
    this.wedgeOrder = [6, 2, 5, 0, 7, 3, 1, 4];
    this.wedgeCursor = 0;
  }

  /** Phase 3: drop the next wedge into the lava. */
  collapseNextWedge() {
    if (this.wedgeCursor >= this.wedgeOrder.length) return false;
    const w = this.wedges[this.wedgeOrder[this.wedgeCursor++]];
    w.state = "falling";
    w.t = 0;
    const p = new THREE.Vector3()
      .copy(ARENA_CENTER)
      .addScaledVector(new THREE.Vector3(w.dir.x, 0, w.dir.y), 15.5);
    this.effects.spawnRing(p, { maxR: 6, dur: 1.1, color: 0xff5a1e });
    this.effects.burstSparks(p, 40, 0xff7a2a, 7);
    this.effects.addTrauma(0.4);
    return true;
  }

  /* ---------------- letters ---------------- */

  _buildLetters() {
    for (const def of LETTERS) {
      const group = new THREE.Group();
      const shard = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.15, 0),
        makeEmissive(0xffb060, 2.4, 0x241205),
      );
      group.add(shard);
      group.add(makeGlowSprite(0xffb060, 0.9));
      const light = new THREE.PointLight(0xffb060, 4, 5, 2);
      group.add(light);
      group.position.copy(def.pos);
      this.root.add(group);
      this.letters.push({ ...def, group, shard, taken: false });
    }
  }

  /* ---------------- uplink ---------------- */

  _buildUplink() {
    const pos = this.uplink.pos;

    const consoleBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 1.15, 0.8),
      new THREE.MeshStandardMaterial({
        color: 0x181b20,
        metalness: 0.7,
        roughness: 0.4,
      }),
    );
    consoleBody.position.set(pos.x, 0.58, pos.z);
    consoleBody.castShadow = true;
    this.root.add(consoleBody);

    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.5, 0.06),
      makeEmissive(0x66e0ff, 2.8, 0x06222e),
    );
    screen.position.set(pos.x, 1.05, pos.z + 0.42);
    screen.rotation.x = -0.35;
    this.root.add(screen);

    // the upload beam — a shader gradient, bright when it matters
    this.beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0x66e0ff) },
        uIntensity: { value: 0.35 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uIntensity;
        varying vec2 vUv;
        void main() {
          float a = (1.0 - vUv.y) * uIntensity;
          a *= 0.55 + 0.45 * sin(uTime * 2.2 + vUv.y * 9.0);
          a *= smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.52, 9, 20, 1, true),
      this.beamMat,
    );
    beam.position.set(pos.x, 4.6, pos.z);
    this.root.add(beam);

    this.uplinkGlow = makeGlowSprite(0x66e0ff, 1.6);
    this.uplinkGlow.position.set(pos.x, 1.4, pos.z);
    this.root.add(this.uplinkGlow);

    const light = new THREE.PointLight(0x66e0ff, 14, 11, 2);
    light.position.set(pos.x, 2.2, pos.z);
    this.root.add(light);

    this.colliders.push({ x: pos.x, z: pos.z, r: 0.9 });
  }

  /* ---------------- diegetic boards ---------------- */

  _buildBoards() {
    const addBoard = (tex, x, y, z, rotY = 0) => {
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(2.7, 1.35),
        new THREE.MeshBasicMaterial({ map: tex }),
      );
      board.position.set(x, y, z);
      board.rotation.y = rotY;
      this.root.add(board);
    };
    addBoard(
      makeBoardTexture({
        title: "SHAFT 7 — DEEPHOLD",
        lines: ["maintenance access only", "descend 900 m"],
      }),
      0,
      2.35,
      -1.5,
    );
    addBoard(
      makeBoardTexture({
        title: "SECTOR 9 — UPLINK",
        lines: ["signal relay", "keep clear"],
        accent: "#66e0ff",
      }),
      0,
      2.45,
      -50.6,
    );
  }

  /* ------------------------------------------------------------------ *
   * queries the level asks every frame
   * ------------------------------------------------------------------ */

  /** Clamp a position into the walkable world. Mutates pos. */
  clampToWorld(pos, radius = 0.45) {
    if (pos.z < -20.2) {
      const dx = pos.x - ARENA_CENTER.x;
      const dz = pos.z - ARENA_CENTER.z;
      const d = Math.hypot(dx, dz) || 1e-6;
      const max = ARENA_R - radius;
      if (d > max) {
        pos.x = ARENA_CENTER.x + (dx / d) * max;
        pos.z = ARENA_CENTER.z + (dz / d) * max;
      }
      for (const c of this.colliders) {
        const cx = pos.x - c.x;
        const cz = pos.z - c.z;
        const cd = Math.hypot(cx, cz) || 1e-6;
        const min = c.r + radius;
        if (cd < min) {
          pos.x = c.x + (cx / cd) * min;
          pos.z = c.z + (cz / cd) * min;
        }
      }
    } else if (pos.z > -2.0) {
      // station hall
      pos.x = THREE.MathUtils.clamp(pos.x, -5.0 + radius, 5.0 - radius);
      pos.z = THREE.MathUtils.clamp(pos.z, -2.0, 12.4 - radius);
    } else {
      // drift corridor
      pos.x = THREE.MathUtils.clamp(pos.x, -1.72 + radius, 1.72 - radius);
      pos.z = Math.max(pos.z, -20.4);
    }
    if (this.gateSealed && pos.z > -21.5) pos.z = -21.5;
  }

  /**
   * Lava and collapse hazards. Pushes the position out of danger and
   * returns what the position is standing in — the level applies damage.
   */
  hazards(pos, dt, radius = 0.45) {
    let result = 0; // bitfield: 1 lava, 2 collapse
    const dx = pos.x - ARENA_CENTER.x;
    const dz = pos.z - ARENA_CENTER.z;
    const d = Math.hypot(dx, dz) || 1e-6;

    if (d < POOL_R + 0.15) {
      result |= 1;
      // wading is survivable for a moment — you get shoved back out
      pos.x += (dx / d) * 3.4 * dt;
      pos.z += (dz / d) * 3.4 * dt;
    }

    if (d > 12.6 && d < ARENA_R) {
      const nx = dx / d;
      const nz = dz / d;
      for (const w of this.wedges) {
        if (w.state === "alive") continue;
        if (w.dir.x * nx + w.dir.y * nz > 0.924) {
          result |= 2;
          pos.x -= nx * 3.2 * dt;
          pos.z -= nz * 3.2 * dt;
          break;
        }
      }
    }
    return result;
  }

  /** Nearest triggerable vent within reach — for the E key. */
  ventNear(pos, maxDist = 3.2) {
    let best = -1;
    let bestD = maxDist;
    this.vents.forEach((v, i) => {
      if (v.state !== "idle" || v.cd > 0) return;
      const d = Math.hypot(pos.x - v.pos.x, pos.z - v.pos.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  triggerVent(i, byPlayer) {
    if (i < 0 || i >= this.vents.length) return false;
    return this.vents[i].trigger(byPlayer);
  }

  tryPickup(pos) {
    for (const letter of this.letters) {
      if (letter.taken) continue;
      if (letter.group.position.distanceTo(pos) < 1.75) {
        letter.taken = true;
        letter.group.visible = false;
        this.effects.burstSparks(letter.group.position, 18, 0xffc27a, 4);
        return letter;
      }
    }
    return null;
  }

  sealGate() {
    if (this.gateSealed) return;
    this.gateSealed = true;
    const mouth = new THREE.Vector3(0, 1, -19.5);
    this.effects.spawnRing(mouth, { maxR: 5, dur: 0.9, color: 0xff5a1e });
    this.effects.burstSparks(mouth, 50, 0xff7a2a, 8);
    this.effects.addTrauma(0.45);
  }

  update(dt, { onBlast = null } = {}) {
    this.time += dt;

    this.lavaMat.uniforms.uTime.value = this.time;
    this.crackMat.uniforms.uTime.value = this.time;
    this.hazeMat.uniforms.uTime.value = this.time;
    this.beamMat.uniforms.uTime.value = this.time;

    // lava breathing — light, not texture, sells the flicker
    const flicker = 0.75 + 0.45 * fbm2(this.time * 1.7, 3.3);
    this.poolLights[0].intensity = 55 * flicker;
    this.poolLights[1].intensity = 55 * (1.5 - flicker * 0.5);

    // server LEDs doing data-centre things
    this.ledMats.forEach((m, i) => {
      m.emissiveIntensity = 2.1 + Math.sin(this.time * (5 + i * 2.3) + i) * 0.7;
    });

    for (const v of this.vents) {
      v.update(dt, this.time, this.effects, onBlast);
    }

    // letters bob and spin so they read as pickups, not props
    this.letters.forEach((l, i) => {
      if (l.taken) return;
      l.group.position.y = l.pos.y + Math.sin(this.time * 2 + i * 2.1) * 0.12;
      l.shard.rotation.y += dt * 1.4;
    });

    // wedges mid-collapse
    for (const w of this.wedges) {
      if (w.state !== "falling") continue;
      w.t += dt;
      const p = Math.min(1, w.t / 1.15);
      const eased = p * p;
      w.mesh.position.y = 0.035 - eased * 2.6;
      w.mesh.rotation.z = eased * 0.24 * w.dir.x;
      w.mesh.rotation.x = -eased * 0.24 * w.dir.y;
      w.dissolve.set(eased * 0.95);
      if (p >= 1) {
        w.state = "gone";
        w.mesh.visible = false;
      }
    }
  }
}
