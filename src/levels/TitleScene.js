import * as THREE from 'three';
import { Level } from '../core/Level.js';
import { loadJungleKit, cloneProp, createJungleSky, createLightShaft } from './level1/jungleWorld.js';
import { loadCast, makeHandler, makeHorn } from '../intros/cast.js';
import { dotTexture } from '../intros/fx.js';

/**
 * TitleScene — the world behind the title screen (ui/TitleScreen.js draws the
 * words and the menu over it).
 *
 * The glade at first light, before anyone has come for the horn: the old
 * stone in the middle with the horn lying on it, the cyan just stirring in
 * it; the stag and the fox standing guard behind; trees closing in, dawn
 * through them in shafts, mist, fireflies. The camera drifts slowly round the
 * stone. And far back in the mist, if you look, a man in a long coat and a
 * mask is standing very still, watching it.
 */
const STONE_AT = new THREE.Vector3(0, 0, 0);
const ORBIT_R = 6.2;
const ORBIT_SPEED = 0.035; // radians a second: a slow drift, never a spin

export class TitleScene extends Level {
  constructor() {
    super('title');
    this.t = 0;
  }

  async init(scene, assets, input, state) {
    super.init(scene, assets, input, state);
    const [kit, cast] = await Promise.all([loadJungleKit(assets), loadCast(assets)]);
    if (!this.scene) return; // torn down while loading
    this.kit = kit;

    // dawn: grey-gold air, the sun low behind the stone
    scene.fog = new THREE.FogExp2(0x8c8a72, 0.05);
    scene.background = new THREE.Color(0x8c8a72);
    const sky = createJungleSky();
    sky.material.uniforms.uTop.value.setHex(0x4b5d72);
    sky.material.uniforms.uHorizon.value.setHex(0xe9b97a);
    sky.material.uniforms.uBottom.value.setHex(0x343a2a);
    sky.material.uniforms.uSunDir.value.set(0.1, 0.12, -1).normalize();
    this.root.add(sky);

    this.root.add(new THREE.HemisphereLight(0x9fb0c4, 0x2a2416, 0.75));
    const sun = new THREE.DirectionalLight(0xffc888, 2.6);
    sun.position.set(-4, 7, -12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
    this.root.add(sun, sun.target);

    // the ground: dark moss, and a worn ring round the stone
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(60, 48),
      new THREE.MeshStandardMaterial({ color: 0x2f3b24, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.root.add(ground);
    const worn = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 2.2, 40),
      new THREE.MeshStandardMaterial({ color: 0x3d3626, roughness: 1, transparent: true, opacity: 0.45 }),
    );
    worn.rotation.x = -Math.PI / 2;
    worn.position.y = 0.01;
    this.root.add(worn);

    this._buildStone();
    this._buildForest();
    this._buildAir();
    this._buildWatcher(cast);

    const cam = this.game.camera;
    cam.fov = 48;
    cam.updateProjectionMatrix();
    this._look = new THREE.Vector3();
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
    // the horn, lying along the cap, the cyan just stirring in it
    this.horn = makeHorn({ glow: 0.12 });
    const minY = this.horn.children[0].geometry.boundingBox.min.y;
    this.horn.position.set(-0.22, 0.86 - minY, -0.02);
    this.horn.rotation.y = 0.25;
    g.add(this.horn);
    this.hornLight = new THREE.PointLight(0x4fd6e0, 3.2, 6, 2);
    this.hornLight.position.set(0, 1.15, 0);
    g.add(this.hornLight);
    this.root.add(g);

    // the guardians either side behind it, and the old cairns
    this._put(this.kit.stag, -2.6, -2.4, 2.1, 0.7);
    this._put(this.kit.fox, 2.5, -2.2, 1.7, -0.6);
    for (const [x, z] of [[-1.7, 1.6], [1.9, 1.3], [0.4, -3.2]]) {
      this._put([this.kit.rock1, this.kit.rock2, this.kit.rock3][Math.abs(Math.round(x * 3)) % 3], x, z, 0.6, x);
    }
  }

  _buildForest() {
    const r = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    const trees = [this.kit.tree1, this.kit.tree2, this.kit.tree3, this.kit.tree4, this.kit.ruinTree];
    const bushes = [this.kit.bush1, this.kit.bush2, this.kit.bush3];
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2;
      const d = 7.5 + r() * 16;
      this._put(trees[i % trees.length], Math.cos(a) * d, Math.sin(a) * d, 7 + r() * 6, r() * 6.28);
    }
    // nothing low on the camera's circle (ORBIT_R), or it sails past the lens: in close round the stone, or out past it
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2;
      const d = i % 3 === 0 ? 2.4 + r() * 1.8 : ORBIT_R + 2.2 + r() * 6;
      this._put(bushes[i % bushes.length], Math.cos(a) * d, Math.sin(a) * d, d < ORBIT_R ? 0.45 + r() * 0.35 : 0.9 + r() * 1.1, r() * 6.28);
    }
    for (let i = 0; i < 60; i++) {
      const a = r() * Math.PI * 2;
      const d = i % 2 ? 1.4 + r() * 3 : ORBIT_R + 1.8 + r() * 5;
      this._put([this.kit.grass1, this.kit.grass2, this.kit.grass3][i % 3], Math.cos(a) * d, Math.sin(a) * d, 0.35 + r() * 0.3, r() * 6.28);
    }
    this._put(this.kit.column, -5.4, -5.5, 3.6, 0.3);
    this._put(this.kit.columnShort, 5.2, -6.2, 2.2, 1.2);
    this._put(this.kit.deadTree, 6.4, 3.2, 5.5, 2.1);
  }

  _buildAir() {
    // dawn through the canopy, in shafts
    this.shafts = [];
    for (const [x, z, w, rz] of [[-3, -6, 2.4, -0.45], [2.5, -8, 1.8, -0.35], [0.5, -3.5, 1.4, -0.5]]) {
      const s = createLightShaft(w, 0xffd9a0, 0.14);
      s.position.set(x, 13, z);
      s.rotation.z = rz;
      this.root.add(s);
      this.shafts.push(s);
    }
    // fireflies and pollen drifting in the clearing
    const N = 160;
    const pos = new Float32Array(N * 3);
    this._seeds = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, d = 1 + Math.random() * 9;
      pos.set([Math.cos(a) * d, 0.3 + Math.random() * 3.2, Math.sin(a) * d], i * 3);
      this._seeds[i] = Math.random() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this._base = pos.slice();
    this.motes = new THREE.Points(geo, new THREE.PointsMaterial({
      map: dotTexture(), color: 0xffd38a, size: 0.12, transparent: true, opacity: 0.85,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.root.add(this.motes);
  }

  /** Far back in the mist: the Marshal, watching the stone. Never close, never lit. */
  async _buildWatcher(cast) {
    if (!cast.handler) return;
    const g = new THREE.Group();
    g.position.set(1.8, 0, -13.5);
    g.rotation.y = Math.PI + 0.12; // facing the stone
    const f = makeHandler(g, cast.handler);
    f.root.rotation.y = Math.PI;
    f.play('idle', { fade: 0 });
    this.watcher = f;
    this.root.add(g);
  }

  update(dt) {
    this.t += dt;
    const cam = this.game.camera;
    // a slow drift round the stone, low, the horn just right of centre (the menu sits on the left)
    const a = 0.6 + this.t * ORBIT_SPEED;
    cam.position.set(Math.sin(a) * ORBIT_R, 1.55 + Math.sin(this.t * 0.2) * 0.12, Math.cos(a) * ORBIT_R);
    const side = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)); // camera's right
    this._look.set(0, 1.05, 0).addScaledVector(side, -1.1);
    cam.lookAt(this._look);

    // the horn breathing, the motes drifting
    const breath = 0.5 + 0.5 * Math.sin(this.t * 1.3);
    this.horn.userData.material.emissiveIntensity = 0.08 + 0.1 * breath;
    this.horn.userData.glow.material.opacity = 0.25 + 0.2 * breath;
    this.hornLight.intensity = 2.4 + 1.2 * breath;
    const p = this.motes.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const s = this._seeds[i];
      p.setXYZ(i,
        this._base[i * 3] + Math.sin(this.t * 0.4 + s) * 0.4,
        this._base[i * 3 + 1] + Math.sin(this.t * 0.6 + s * 2) * 0.25,
        this._base[i * 3 + 2] + Math.cos(this.t * 0.35 + s) * 0.4);
    }
    p.needsUpdate = true;
    this.motes.material.opacity = 0.6 + 0.25 * Math.sin(this.t * 2.1);
    if (this.watcher) this.watcher.update(dt);
  }

  teardown() {
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
