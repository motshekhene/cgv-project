import * as THREE from 'three';
import { Level } from '../core/Level.js';
import { loadJungleKit, cloneProp, createJungleSky, createLightShaft } from './level1/jungleWorld.js';
import { loadCast, makeKai, poseHorn, HORN_HAND } from '../intros/cast.js';
import { dotTexture } from '../intros/fx.js';
import { kaiThinks, clearThoughts, DIALOGUE_FONT } from '../ui/dialogue.js';
import { showEndCard } from '../ui/EndCard.js';
import { Sfx } from './Prologue.js';

/**
 * EPILOGUE — THE STONE.
 *
 * The morning after the falls. Kai walks back up the old path into the glade
 * with the horn at his hip, and the forest is as the horn left it: not a bird,
 * not a breath of wind. He takes it from his hip, and lays it back on its
 * stone, exactly where it lay when Baba Zwane sent him up for it. A ring of
 * its light runs out across the glade, and the forest wakes: the wind comes
 * back up in the leaves, the birds start, a flock goes up out of the trees,
 * the mist lifts. He listens, and walks away down the path, and the camera
 * stays with the stone. THE END.
 *
 * A cutscene, not a level: nothing to play, ~22 s, Space / click skips to the
 * card. The glade is the title scene's (TitleScene.js), in full morning light;
 * the sound is the prologue's own forest (Prologue.js Sfx), started silent and
 * woken.
 *
 *   0.0   fade up: THE NEXT MORNING. Kai walking up into the silent glade
 *   6.6   at the stone. The horn comes off his hip into his hand
 *   8.4   he reaches and lays it on the cap; its light flares as it settles
 *   10.6  THE FOREST WAKES: the ring, the wind, the birds, the flock
 *   16.8  he turns and walks away down the path
 *   21.5  THE END
 */

const STONE_AT = new THREE.Vector3(0, 0, 0);
const KAI_FROM = new THREE.Vector3(0.45, 0, 12.5);
const KAI_STAND = new THREE.Vector3(0.12, 0, 1.75); // in front of the stone, an arm's length from the cap
const KAI_LEAVE = new THREE.Vector3(0.6, 0, 14);
const T = {
  arrive: 6.6, unsling: 6.9, reach: 8.4, placed: 9.9, rise: 10.3, wake: 10.6, leave: 16.8, card: 21.5,
};
const HORN_REST = { pos: new THREE.Vector3(-0.22, 0, -0.02), rotY: 0.25 }; // y from the horn's own height (the title scene's)
const CREDITS =
  'Ruins, nature and characters: Quaternius (CC0) · Characters animated with Mixamo · Textures: ambientCG (CC0) · ' +
  'Props: Poly by Google (CC0 / CC-BY 3.0) · Cars: Quaternius, Poly by Google, IvOfficial, theking1322 (CC-BY 3.0) · ' +
  'Built with three.js';

const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);

export class Epilogue extends Level {
  constructor() {
    super('epilogue');
    this.t = 0;
    this.woken = false;
    this.pauseTip = 'Space or a click skips to the end.';
  }

  async init(scene, assets, input, state) {
    super.init(scene, assets, input, state);
    const [kit, cast] = await Promise.all([loadJungleKit(assets), loadCast(assets)]);
    if (!this.scene) return; // torn down while loading
    this.kit = kit;

    // full morning: the mist still in the trees, the light gold
    this.fog = new THREE.FogExp2(0xa9a98b, 0.045);
    scene.fog = this.fog;
    scene.background = new THREE.Color(0xa9a98b);
    const sky = createJungleSky();
    sky.material.uniforms.uTop.value.setHex(0x6c8eb2);
    sky.material.uniforms.uHorizon.value.setHex(0xf2d29a);
    sky.material.uniforms.uBottom.value.setHex(0x3c4430);
    sky.material.uniforms.uSunDir.value.set(-0.3, 0.35, -1).normalize();
    this.root.add(sky);
    this.root.add(new THREE.HemisphereLight(0xbfd0e0, 0x3a3220, 0.9));
    this.sun = new THREE.DirectionalLight(0xffe0b0, 2.3);
    this.sun.position.set(-6, 9, -10);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 45 });
    this.root.add(this.sun, this.sun.target);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(60, 48),
      new THREE.MeshStandardMaterial({ color: 0x34422a, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.root.add(ground);
    // the old path up into the glade, worn into the moss, and the ring round the stone
    const worn = new THREE.MeshStandardMaterial({ color: 0x3d3626, roughness: 1, transparent: true, opacity: 0.55 });
    const path = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 16), worn);
    path.rotation.x = -Math.PI / 2;
    path.position.set(0.3, 0.012, 9.5);
    this.root.add(path);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 2.2, 40), worn);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    this.root.add(ring);

    this._buildStone();
    this._buildForest();
    this._buildAir();
    this._buildBirds();
    this._buildKai(cast);
    this._buildFade();

    this.sfx = new Sfx();
    this.sfx.startSilent(); // arriving from Level 3's card, a click has already happened: audio may start
    this._onClick = () => this._skip();
    this.game.renderer.domElement.addEventListener('click', this._onClick);

    const cam = this.game.camera;
    cam.fov = 46;
    cam.updateProjectionMatrix();
    this._look = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._bendQ = new THREE.Quaternion();
    this._bendX = new THREE.Vector3(1, 0, 0);
  }

  /** One kit prop, sized so its biggest side is `size` m, standing at (x, z). */
  _put(proto, x, z, size, ry = 0) {
    if (!proto) return null;
    const inner = new THREE.Group();
    inner.add(cloneProp(proto));
    inner.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner);
    const dim = box.getSize(new THREE.Vector3());
    const k = size / (Math.max(dim.x, dim.y, dim.z) || 1);
    inner.scale.setScalar(k);
    inner.position.set(-(box.min.x + box.max.x) * 0.5 * k, -box.min.y * k, -(box.min.z + box.max.z) * 0.5 * k);
    const g = new THREE.Group();
    g.add(inner);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.root.add(g);
    return g;
  }

  /** The stone, as the title scene has it, with nothing on its cap: the horn is on Kai's hip. */
  _buildStone() {
    const rock = new THREE.MeshStandardMaterial({ color: 0x6d6f62, roughness: 0.95, flatShading: true });
    const g = new THREE.Group();
    g.position.copy(STONE_AT);
    g.rotation.y = -0.5;
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.72, 1.05), rock);
    base.position.y = 0.36;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.16, 1.16), rock);
    cap.position.y = 0.78;
    cap.rotation.y = 0.06;
    const fallen = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.7), rock);
    fallen.position.set(-0.95, 0.2, 0.55);
    fallen.rotation.set(0.2, 0.5, 0.12);
    for (const m of [base, cap, fallen]) { m.castShadow = m.receiveShadow = true; g.add(m); }
    this.hornLight = new THREE.PointLight(0x4fd6e0, 0, 7, 2);
    this.hornLight.position.set(0, 1.15, 0);
    g.add(this.hornLight);
    this.stone = g;
    this.root.add(g);

    this._put(this.kit.stag, -2.6, -2.4, 2.1, 0.7);
    this._put(this.kit.fox, 2.5, -2.2, 1.7, -0.6);
    for (const [x, z] of [[-1.7, 1.6], [1.9, 1.3], [0.4, -3.2]]) {
      this._put([this.kit.rock1, this.kit.rock2, this.kit.rock3][Math.abs(Math.round(x * 3)) % 3], x, z, 0.6, x);
    }
  }

  /** The trees round the glade, with the old path up into it (+z) kept clear. */
  _buildForest() {
    const r = (() => { let s = 11; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    const trees = [this.kit.tree1, this.kit.tree2, this.kit.tree3, this.kit.tree4, this.kit.ruinTree];
    const bushes = [this.kit.bush1, this.kit.bush2, this.kit.bush3];
    const onPath = (x, z) => z > 1.5 && Math.abs(x - 0.3) < 2.6 + (z - 1.5) * 0.12;
    this.treeTops = [];
    for (let i = 0; i < 56; i++) {
      const a = r() * Math.PI * 2;
      const d = 7.5 + r() * 17;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (onPath(x, z)) continue;
      const h = 7 + r() * 6;
      this._put(trees[i % trees.length], x, z, h, r() * 6.28);
      this.treeTops.push(new THREE.Vector3(x, h * 0.75, z));
    }
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2;
      const d = i % 3 === 0 ? 2.6 + r() * 2 : 8 + r() * 7;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (onPath(x, z)) continue;
      this._put(bushes[i % bushes.length], x, z, d < 6 ? 0.45 + r() * 0.35 : 0.9 + r() * 1.1, r() * 6.28);
    }
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2;
      const d = 1.6 + r() * 12;
      this._put([this.kit.grass1, this.kit.grass2, this.kit.grass3][i % 3], Math.cos(a) * d, Math.sin(a) * d, 0.35 + r() * 0.3, r() * 6.28);
    }
    this._put(this.kit.column, -5.4, -5.5, 3.6, 0.3);
    this._put(this.kit.columnShort, 5.2, -6.2, 2.2, 1.2);
    this._put(this.kit.deadTree, 6.4, 3.2, 5.5, 2.1);
  }

  /** Morning through the canopy in shafts, and pollen in the air: dim while the forest is silent. */
  _buildAir() {
    this.shafts = [];
    for (const [x, z, w, rz] of [[-3, -6, 2.6, -0.45], [2.5, -8, 2.0, -0.35], [0.5, -3.5, 1.6, -0.5], [-1.5, 4, 1.8, -0.4]]) {
      const s = createLightShaft(w, 0xffdcaa, 0.06);
      s.position.set(x, 13, z);
      s.rotation.z = rz;
      this.root.add(s);
      this.shafts.push(s);
    }
    const N = 180;
    const pos = new Float32Array(N * 3);
    this._seeds = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, d = 1 + Math.random() * 11;
      pos.set([Math.cos(a) * d, 0.3 + Math.random() * 3.6, Math.sin(a) * d], i * 3);
      this._seeds[i] = Math.random() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this._base = pos.slice();
    this.motes = new THREE.Points(geo, new THREE.PointsMaterial({
      map: dotTexture(), color: 0xffe2a6, size: 0.1, transparent: true, opacity: 0.2,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.root.add(this.motes);

    // the ring of the horn's light that runs out across the glade when it's home
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x7fe9f2, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.pulses = [0, 0.45].map((delay) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), ringMat.clone());
      m.rotation.x = -Math.PI / 2;
      m.position.set(STONE_AT.x, 0.05, STONE_AT.z);
      m.visible = false;
      this.root.add(m);
      return { mesh: m, delay };
    });
  }

  /** A flock asleep in the treetops: when the forest wakes, it goes up all at once. */
  _buildBirds() {
    const mat = new THREE.MeshBasicMaterial({ color: 0x1f2a22, side: THREE.DoubleSide });
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.32, 0, -0.08, -0.12, 0, 0.12, 0, 0, 0, 0.32, 0, -0.08, 0.12, 0, 0.12], 3));
    this.birds = [];
    const tops = this.treeTops.length ? this.treeTops : [new THREE.Vector3(0, 8, -10)];
    for (let i = 0; i < 18; i++) {
      const from = tops[(i * 7) % tops.length].clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2));
      const b = new THREE.Mesh(wing, mat);
      b.position.copy(from);
      b.visible = false;
      const away = new THREE.Vector3(from.x, 0, from.z).normalize();
      this.root.add(b);
      this.birds.push({
        mesh: b, from, delay: Math.random() * 1.2, phase: Math.random() * 6,
        vel: new THREE.Vector3(away.x * (3 + Math.random() * 3), 4 + Math.random() * 3, away.z * (3 + Math.random() * 3)),
      });
    }
  }

  _buildKai(cast) {
    if (!cast.kai) return;
    this.kai = makeKai(this.root, cast.kai);
    this.kai.root.position.copy(KAI_FROM);
    this.kai.root.rotation.y = Math.PI; // walking up the path, toward the stone (-z)
    this.kai.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    if (!this.kai.actions.reach) this.kai.pose('reach', 'cross', 1.133); // his right arm out at full stretch
    this.kai.play('walk', { fade: 0 });
  }

  /** The black it fades up from, and the line over it. */
  _buildFade() {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;inset:0;z-index:9000;pointer-events:none;background:#000;transition:opacity 1.6s ease;
      display:flex;align-items:flex-start;justify-content:center;padding-top:16vh;font:600 15px ${DIALOGUE_FONT};
      letter-spacing:.5em;color:#e9d9b0;text-shadow:0 2px 12px #000`;
    el.innerHTML = '<span style="transition:opacity 1.2s ease">THE NEXT MORNING</span>';
    document.body.appendChild(el);
    this._fade = el;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.background = 'rgba(0,0,0,0)';
    }));
  }

  /* ---------------------------------------------------------------- the scene */

  update(dt) {
    if (!this.kai) return;
    if (!this._skipping && (this.input.pressed('skip') || this.input.pressed('interact'))) this._skip();
    this.t += dt;
    const t = this.t;
    const k = this.kai;
    const kp = k.root.position;
    const horn = k.horn;
    const palm = k.bone('PalmR');

    if (this._fade && t > 3.2 && !this._fadeOut) {
      this._fadeOut = true;
      this._fade.firstChild.style.opacity = '0';
    }
    if (!this._said1 && t > 1.4) { this._said1 = true; kaiThinks('Not a sound. Not one bird, the whole way up.'); }
    if (!this._said2 && t > 4.8) { this._said2 = true; kaiThinks('Back where you belong.'); }

    // ---- Kai
    let bend = 0;
    if (t < T.arrive) {
      kp.lerpVectors(KAI_FROM, KAI_STAND, smooth(0, T.arrive, t) * 0.25 + (t / T.arrive) * 0.75);
      k.play('walk', { fade: 0.2 });
    } else if (t < T.reach) {
      kp.copy(KAI_STAND);
      k.play('idle', { fade: 0.4 });
    } else if (t < T.rise) {
      // reaching over the cap, bent to it
      kp.copy(KAI_STAND).z -= 0.12 * smooth(T.reach, T.reach + 0.4, t);
      k.play('reach', { fade: 0.35 });
      bend = 0.42 * smooth(T.reach, T.reach + 0.5, t) * (1 - smooth(T.placed, T.rise, t));
    } else if (t < T.leave) {
      // a step back from it, then still: listening
      kp.copy(KAI_STAND).z += 0.55 * smooth(T.rise, T.rise + 0.8, t) - 0.12 * (1 - smooth(T.rise, T.rise + 0.8, t));
      k.play(t < T.rise + 0.8 ? 'walkback' : 'idle', { fade: 0.3, speed: 0.6 });
    } else {
      // and away down the path, the way he came
      const u = smooth(T.leave, T.leave + 0.8, t);
      k.root.rotation.y = Math.PI * (1 - u);
      if (u >= 1) {
        const leaveFrom = this._tmp.copy(KAI_STAND).setZ(KAI_STAND.z + 0.55);
        kp.lerpVectors(leaveFrom, KAI_LEAVE, Math.min(1, (t - T.leave - 0.8) / 7.6));
      }
      k.play(u > 0.3 ? 'walk' : 'idle', { fade: 0.3 });
    }
    k.update(dt);
    if (bend > 0.001) {
      for (const name of ['Spine', 'Spine1', 'Spine2']) {
        const b = k.bones['mixamorig' + name];
        if (!b) continue;
        k._stash(b); // undone before the next frame's clip
        b.quaternion.multiply(this._bendQ.setFromAxisAngle(this._bendX, bend / 3));
      }
    }

    // ---- the horn: hip, to his hand, to the stone
    if (horn && palm) {
      if (t >= T.unsling && !this._inHand && t < T.reach) {
        this._inHand = true;
        palm.attach(horn);
        if (horn.userData.strap) horn.userData.strap.visible = false; // off its strap: it's going home
      }
      if (this._inHand && !this._onStone) {
        poseHorn(horn, palm, HORN_HAND, 1 - Math.exp(-6 * dt));
        horn.userData.material.emissiveIntensity = 0.12 + 0.08 * Math.sin(t * 2);
      }
      if (t >= T.reach + 0.35 && !this._onStone) {
        // out of his hand and down onto the cap, exactly where it lay
        this._onStone = true;
        this.stone.attach(horn);
        const minY = horn.children[0]?.geometry?.boundingBox?.min.y ?? 0;
        this._place = {
          p0: horn.position.clone(), q0: horn.quaternion.clone(), s0: horn.scale.clone(),
          p1: new THREE.Vector3(HORN_REST.pos.x, 0.86 - minY, HORN_REST.pos.z),
          q1: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, HORN_REST.rotY, 0)),
        };
      }
      if (this._place) {
        const P = this._place;
        const u = smooth(T.reach + 0.35, T.placed, t);
        horn.position.lerpVectors(P.p0, P.p1, u);
        horn.quaternion.slerpQuaternions(P.q0, P.q1, u);
        horn.scale.lerpVectors(P.s0, this._tmp.set(1, 1, 1), u);
        // its light: flaring as it settles, then breathing, brighter once the forest is awake
        const settle = smooth(T.placed - 0.3, T.placed + 0.2, t) * (1 - smooth(T.placed + 0.4, T.wake + 1.5, t));
        const breath = 0.5 + 0.5 * Math.sin(t * 1.3);
        horn.userData.material.emissiveIntensity = 0.12 + 1.6 * settle + (this.woken ? 0.12 + 0.1 * breath : 0);
        horn.userData.glow.material.opacity = 0.3 + 0.6 * settle + (this.woken ? 0.2 * breath : 0);
        this.hornLight.intensity = 9 * settle + (this.woken ? 2.4 + 1.2 * breath : 0);
      }
    }

    // ---- the forest wakes
    if (!this.woken && t >= T.wake) this._wake();
    const w = this.woken ? smooth(T.wake, T.wake + 4, t) : 0;
    for (const P of this.pulses) {
      const u = (t - T.wake - P.delay) / 2.8;
      P.mesh.visible = u > 0 && u < 1;
      if (!P.mesh.visible) continue;
      P.mesh.scale.setScalar(1 + u * 27);
      P.mesh.material.opacity = 0.75 * (1 - u) * (P.delay ? 0.5 : 1);
    }
    for (const b of this.birds) {
      const u = t - T.wake - 0.4 - b.delay;
      b.mesh.visible = u > 0 && u < 9;
      if (!b.mesh.visible) continue;
      b.mesh.position.copy(b.from).addScaledVector(b.vel, u);
      b.mesh.lookAt(b.mesh.position.x + b.vel.x, b.mesh.position.y + b.vel.y * 0.3, b.mesh.position.z + b.vel.z);
      b.mesh.scale.set(1, 1, 0.4 + 0.6 * Math.abs(Math.sin(u * 14 + b.phase))); // flapping
    }
    for (const s of this.shafts) {
      if (s.material.uniforms?.uOpacity) s.material.uniforms.uOpacity.value = 0.06 + 0.12 * w;
    }
    this.fog.density = 0.045 - 0.02 * w; // the mist lifting
    this.sun.intensity = 2.3 + 1.2 * w;
    const p = this.motes.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const s = this._seeds[i];
      p.setXYZ(i,
        this._base[i * 3] + Math.sin(t * 0.4 + s) * 0.4,
        this._base[i * 3 + 1] + Math.sin(t * 0.6 + s * 2) * 0.25,
        this._base[i * 3 + 2] + Math.cos(t * 0.35 + s) * 0.4);
    }
    p.needsUpdate = true;
    this.motes.material.opacity = 0.2 + 0.55 * w;
    this.sfx.tickForest(dt);
    if (!this._said3 && t > T.wake + 1.6) { this._said3 = true; kaiThinks('Listen.'); }
    if (!this._said4 && t > T.wake + 3.8) { this._said4 = true; kaiThinks('Everything’s waking up.'); }

    this._updateCamera(dt, t, kp);
    if (!this._carded && t >= T.card) this._showCard();
  }

  _wake() {
    this.woken = true;
    this.sfx.wake();
  }

  /** Four shots: walking up beside him, over his shoulder at the stone, rising off the glade as it wakes, and low on the stone as he goes. */
  _updateCamera(dt, t, kp) {
    const cam = this.game.camera;
    let rate = 3;
    if (t < T.arrive - 0.4) {
      this._camPos.set(kp.x + 2.9, 1.45, kp.z + 1.6);
      this._look.set(kp.x - 0.4, 1.15, kp.z - 2.6);
      rate = t < 0.1 ? Infinity : 5;
    } else if (t < T.wake) {
      this._camPos.set(KAI_STAND.x + 1.05, 1.75, KAI_STAND.z + 1.95);
      this._look.set(-0.05, 0.92, 0);
      rate = this._shot !== 'B' ? Infinity : 4;
      this._shot = 'B';
    } else if (t < T.leave + 0.6) {
      const u = smooth(T.wake, T.leave, t);
      this._camPos.set(2.2 + 4.6 * u, 1.6 + 4.4 * u, 4.2 + 7.5 * u);
      this._look.set(0, 1 + 0.6 * u, -0.4 * u);
      rate = 2.5;
    } else {
      // behind the stone, between the stag and the cairn, the path running away past it
      this._camPos.set(-0.9, 1.45, -4.1);
      this._look.set(0.25, 0.95, 3);
      rate = this._shot !== 'D' ? Infinity : 3;
      this._shot = 'D';
    }
    if (rate === Infinity) cam.position.copy(this._camPos);
    else cam.position.lerp(this._camPos, 1 - Math.exp(-rate * dt));
    if (!this._lookAt || rate === Infinity) this._lookAt = this._look.clone();
    else this._lookAt.lerp(this._look, 1 - Math.exp(-(rate + 1) * dt));
    cam.lookAt(this._lookAt);
  }

  /** Space / click: straight to the end, the horn home and the forest awake. */
  _skip() {
    if (this._carded || this._skipping || !this.kai) return;
    this._skipping = true;
    // run the scene forward in big steps, so everything lands where it should
    while (this.t < T.leave + 0.9) this.update(0.5);
    this.t = Math.max(this.t, T.card - 0.01);
    this._skipping = false;
  }

  _showCard() {
    this._carded = true;
    clearThoughts();
    this._card = showEndCard({
      kind: 'win',
      title: 'THE END',
      sub: 'The horn is back on its stone, and the forest is awake.',
      lines: [{ text: CREDITS }],
      action: { label: 'MAIN MENU', key: 'ENTER', onClick: () => this.game.setLevel('title') },
      extra: [{ label: 'PLAY AGAIN', onClick: () => this.game.setLevel('prologue') }],
    });
  }

  teardown() {
    clearThoughts();
    this._card?.destroy();
    this._fade?.remove();
    this.sfx?.stop();
    this.game?.renderer.domElement.removeEventListener('click', this._onClick);
    this.root.traverse((o) => {
      if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose();
    });
    if (this.scene) {
      this.scene.fog = null;
      this.scene.background = null;
    }
    super.teardown();
  }
}
