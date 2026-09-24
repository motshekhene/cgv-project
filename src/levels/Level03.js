import * as THREE from 'three';
import { Level } from '../core/Level.js';
import { CombatController } from './level3/CombatController.js';
import { HandlerBoss } from './level3/HandlerBoss.js';
import { createLavaMaterial } from '../shaders/lava.js';
import { FightHUD } from '../ui/FightHUD.js';
import { TouchControls } from '../ui/TouchControls.js';

/**
 * Level 03 — Deephold (fight MVP).
 *
 * A clean arena: a dark stone platform ringed by animated lava, lit from below,
 * with Kai and the Handler on it. Same split Level02 uses — CombatController
 * and HandlerBoss own their own logic and never touch each other; this file is
 * the only place that reads both, resolves hits/parries/dodges, and publishes
 * to the shared GameState (health, stamina, phase, handlerState, timeScale).
 *
 * Deliberately not here yet: the Level 2->3 transition, the mine/bridge art,
 * story cards, the arena-collapse in phase 3, audio. Everything visual below
 * is placeholder-clean so it can be restyled later without touching the fight.
 */
function shortestAngle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const safe = (p) => p.catch((e) => {
  console.warn('[level03] asset missing, using fallback:', e?.message || e);
  return null;
});

export class Level03 extends Level {
  constructor() {
    super('level03');
    this.time = 0;
    this.lockOn = true; // true = lock-on combat cam, false = free 360° orbit view
    this.camYaw = 0;
    this.orbitPitch = 0.55;
    this.orbitDist = 11;
    this.shake = 0;
    this._shakeOff = new THREE.Vector3();
    this._hitStopUntil = 0;
    this._endTimer = -1;
    this._ended = false;
    this._abilityWas = false;
  }

  async init(scene, assets, input, state) {
    super.init(scene, assets, input, state);

    const [kaiSrc, handlerSrc, lavaColor, lavaEmission] = await Promise.all([
      safe(assets.fbx('characters/kai.fbx')),
      safe(assets.fbx('characters/handler.fbx')),
      safe(assets.texture('textures/lava-color.jpg')),
      safe(assets.texture('textures/lava-emission.jpg')),
    ]);
    if (!this.scene) return; // level was torn down while loading

    scene.background = new THREE.Color(0x140705);
    scene.fog = new THREE.Fog(0x1a0805, 28, 95);

    this._buildLights();
    this._buildArena(lavaColor, lavaEmission);

    this.combat = new CombatController(this.root, kaiSrc);
    this.boss = new HandlerBoss(this.root, this.combat, handlerSrc);
    this._wireBoss(state);

    this.hud = new FightHUD();
    this.hud.setLock(this.lockOn);
    this.touch = new TouchControls(input, {
      canvas: this.game.renderer.domElement,
      onToggleView: () => this._toggleView(),
    });

    this.camYaw = Math.PI; // start looking toward -z, where the boss stands
    const cam = this.game.camera;
    cam.position.set(0, 3.6, 12.5);
    this._camLook = new THREE.Vector3(0, 1.4, 0);
    this._tmp = new THREE.Vector3();
    this._toBoss = new THREE.Vector3();
  }

  /* ---------------------------------------------------------------- world */

  _buildLights() {
    this.root.add(new THREE.HemisphereLight(0xffb088, 0x3a1a10, 0.85));

    this.key = new THREE.DirectionalLight(0xffc9a0, 1.05);
    this.key.position.set(9, 16, 10);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    const sc = this.key.shadow.camera;
    sc.left = -17; sc.right = 17; sc.top = 17; sc.bottom = -17; sc.near = 1; sc.far = 50;
    this.key.shadow.bias = -0.0004;
    this.root.add(this.key, this.key.target);

    const rim = new THREE.DirectionalLight(0x5a78ff, 0.55);
    rim.position.set(-10, 8, -12);
    this.root.add(rim);

    this.lavaLights = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const l = new THREE.PointLight(0xff5a1a, 90, 30, 2);
      l.position.set(Math.cos(a) * 15, -0.6, Math.sin(a) * 15);
      this.root.add(l);
      this.lavaLights.push(l);
    }

    this.fill = new THREE.PointLight(0xffe2c0, 14, 16, 2);
    this.fill.position.set(0, 4.5, 0);
    this.root.add(this.fill);
  }

  _buildArena(lavaColor, lavaEmission) {
    // stone platform
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(14, 14.8, 1.2, 56),
      new THREE.MeshStandardMaterial({ color: 0x51473f, roughness: 0.9, metalness: 0.05 }),
    );
    platform.position.y = -0.6;
    platform.receiveShadow = true;
    this.root.add(platform);

    const edge = new THREE.Mesh(
      new THREE.TorusGeometry(14.02, 0.1, 8, 120),
      new THREE.MeshBasicMaterial({ color: 0xff7a2a }),
    );
    edge.rotation.x = Math.PI / 2;
    edge.position.y = 0.02;
    this.root.add(edge);

    const inner = new THREE.Mesh(
      new THREE.RingGeometry(5.9, 6.0, 96),
      new THREE.MeshBasicMaterial({ color: 0x6a3a22, side: THREE.DoubleSide }),
    );
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.015;
    this.root.add(inner);

    // lava sea
    if (lavaColor && lavaEmission) {
      this.lavaMat = createLavaMaterial({ color: lavaColor, emission: lavaEmission, repeat: 36 });
    } else {
      this.lavaMat = new THREE.MeshBasicMaterial({ color: 0xff5a1a });
    }
    const lava = new THREE.Mesh(new THREE.PlaneGeometry(220, 220, 80, 80), this.lavaMat);
    lava.rotation.x = -Math.PI / 2;
    lava.position.y = -1.5;
    this.root.add(lava);

    // distant rock spires, one instanced mesh
    const spires = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: 0x2c1d18, emissive: 0x1a0803, roughness: 1, flatShading: true }),
      26,
    );
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.sin(i * 12.9898) * 0.15;
      const r = 30 + ((i * 37) % 19);
      const h = 5 + ((i * 53) % 10);
      const w = 1.4 + ((i * 29) % 4) * 0.6;
      e.set(0, a * 3, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(Math.cos(a) * r, h * 0.35 - 2, Math.sin(a) * r), q, new THREE.Vector3(w, h, w));
      spires.setMatrixAt(i, m);
    }
    this.root.add(spires);

    // embers rising off the lava
    const N = 320;
    const pos = new Float32Array(N * 3);
    this.emberSpeed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * 38;
      pos.set([Math.cos(a) * r, -1 + Math.random() * 14, Math.sin(a) * r], i * 3);
      this.emberSpeed[i] = 0.5 + Math.random() * 1.6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const cx = c.getContext('2d');
    const grad = cx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = grad;
    cx.fillRect(0, 0, 32, 32);
    this.embers = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        color: 0xff9a4a, size: 0.16, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.root.add(this.embers);
  }

  /* ---------------------------------------------------------------- fight */

  _wireBoss(state) {
    const hud = () => this.hud;

    this.boss.onStrike = (info) => {
      const c = this.combat;
      if (c.dead || this._ended) return 'dodged';
      if (c.dodging) {
        hud().popup('DODGE', '#8fe8ff');
        return 'dodged';
      }
      if (c.parryReady()) {
        state.stamina = Math.min(state.maxStamina, state.stamina + 25);
        this._hitStop(0.17);
        this._addShake(0.4);
        hud().popup('PARRY!', '#ffe066');
        return 'parried';
      }
      if (c.blocking) {
        state.damage(info.damage * info.blockMul);
        state.spendStamina(info.damage * 0.7);
        this._addShake(0.14);
        hud().popup('BLOCKED', '#c9d6e0');
        this._checkPlayerDeath(state);
        return 'blocked';
      }
      state.damage(info.damage);
      c.onHurt();
      this._hitStop(0.06);
      this._addShake(0.32);
      hud().damageFlash();
      this._checkPlayerDeath(state);
      return 'hit';
    };

    this.boss.onHelmetOff = () => {
      // TODO(3A/3B): the real reveal — camera cut, story card, VO. For now a shake and a flag.
      this._hitStop(0.2);
      this._addShake(0.5);
      hud().popup('HELMET OFF', '#ffffff');
    };
    this.boss.onPhaseChange = (n) => {
      if (n > 2) hud().popup('DESPERATION', '#ff5a3a');
      else if (n === 2) hud().popup('PHASE 2', '#ff8a4a');
    };
    this.boss.onDefeated = () => {
      this._hitStop(0.3);
      this._addShake(0.5);
      this._endTimer = 1.6;
      this._endKind = 'win';
    };
  }

  /** Tab / the VIEW button: lock-on combat cam <-> free 360° orbit. */
  _toggleView() {
    this.lockOn = !this.lockOn;
    this.hud.setLock(this.lockOn);
    this.touch.setOrbitEnabled(!this.lockOn);
    // while dragging the camera with the mouse, left-click must not also attack
    if (this.lockOn) this.input.ignored.delete('mouse0');
    else this.input.ignored.add('mouse0');
  }

  _checkPlayerDeath(state) {
    if (state.alive || this.combat.dead) return;
    this.combat.die();
    state.deaths++;
    this._endTimer = 1.4;
    this._endKind = 'lose';
  }

  _hitStop(seconds) {
    this._hitStopUntil = Math.max(this._hitStopUntil, performance.now() + seconds * 1000);
  }

  _addShake(v) {
    this.shake = Math.min(1, Math.max(this.shake, v));
  }

  update(dt, state) {
    if (!this.combat) return;
    this.time += dt;
    const input = this.input;

    if (input.pressed('lockOn') && !this._ended) this._toggleView();

    // camera yaw: aim at the boss when locked on, otherwise the player orbits freely
    const cp = this.combat.root.position;
    const bp = this.boss.root.position;
    const orbit = this.touch.consumeOrbit();
    if (this.lockOn) {
      const want = Math.atan2(bp.x - cp.x, bp.z - cp.z);
      this.camYaw += shortestAngle(this.camYaw, want) * (1 - Math.exp(-7 * dt));
    } else {
      // dt is game time (slowed by hit-stop), so use real frame time for camera input
      this.camYaw += orbit.dx * 0.006 + orbit.strip * 1.7 * (dt / Math.max(this.state.timeScale, 0.2));
      this.orbitPitch = Math.min(1.2, Math.max(0.12, this.orbitPitch + orbit.dy * 0.004));
      this.orbitDist = Math.min(24, Math.max(6, this.orbitDist + orbit.zoom * 1.2));
    }

    this.combat.update(dt, input, state, { camYaw: this.camYaw, lockOn: this.lockOn, targetPos: bp });

    // Kai's swing
    if (this.combat.consumeHit() && this.boss.state !== 'DOWN') {
      this._toBoss.set(bp.x - cp.x, 0, bp.z - cp.z);
      const dist = this._toBoss.length();
      if (dist > 0.001) this._toBoss.divideScalar(dist);
      const facing = Math.sin(this.combat.heading) * this._toBoss.x + Math.cos(this.combat.heading) * this._toBoss.z;
      if (dist <= this.combat.attackRange && facing > 0.2) {
        const fin = this.combat.comboFinisher;
        const dealt = this.boss.takeDamage(this.combat.attackDamage);
        if (dealt > 0) {
          this.boss.root.position.addScaledVector(this._toBoss, fin ? 0.9 : 0.3);
          this._hitStop(fin ? 0.1 : 0.055);
          this._addShake(fin ? 0.28 : 0.1);
          if (this.boss.vulnerable) this.hud.popup('CRITICAL', '#ffd23a');
        }
      }
    }

    const b = this.boss.update(dt);
    this._separate();

    // the Key: popup on activation
    if (this.combat.abilityActive && !this._abilityWas) this.hud.popup('THE KEY', '#7fd8ff');
    this._abilityWas = this.combat.abilityActive;

    // time scale: hit-stop beats the Key's slow-mo beats normal
    state.timeScale = performance.now() < this._hitStopUntil ? 0.04 : this.combat.abilityActive ? 0.35 : 1;

    this._updateCamera(dt);
    this._updateWorld(dt);

    // shared state for whoever reads it (HUD, other levels' UI)
    state.handlerState = b.state;
    state.phase = this.boss.phaseIndex + 1;
    state.handlerHelmetOff = this.boss.helmetOff;

    this.hud.setBoss(this.boss.health / this.boss.maxHealth, b.state === 'DOWN' ? 'DEFEATED' : `PHASE ${state.phase} — ${b.phase}`);
    this.hud.setPlayer(state.health / state.maxHealth, state.stamina / state.maxStamina);

    if (this._endTimer >= 0 && !this._ended) {
      this._endTimer -= dt / Math.max(state.timeScale, 0.2);
      if (this._endTimer < 0) this._finish(state);
    }
  }

  /** Fighters are solid: never let them stand inside each other. */
  _separate() {
    const a = this.combat.root.position;
    const b = this.boss.root.position;
    const dx = b.x - a.x, dz = b.z - a.z;
    const d = Math.hypot(dx, dz);
    const min = 0.95;
    if (d >= min) return;
    const nx = d > 0.001 ? dx / d : 0, nz = d > 0.001 ? dz / d : 1;
    const push = (min - d) / 2;
    a.x -= nx * push; a.z -= nz * push;
    b.x += nx * push; b.z += nz * push;
  }

  _finish(state) {
    this._ended = true;
    this.finished = true;
    state.timeScale = 1;
    if (this._endKind === 'win') this.hud.showBanner('VICTORY', 'THE HANDLER FALLS  ·  PRESS R TO PLAY AGAIN', '#ffd9a8');
    else this.hud.showBanner('DEFEATED', 'PRESS R TO TRY AGAIN', '#ff5a5a');
  }

  _updateCamera(dt) {
    const cam = this.game.camera;
    const cp = this.combat.root.position;
    const bp = this.boss.root.position;
    let dist, height, bias;
    if (this.lockOn) {
      dist = 6.4; height = 3.5; bias = 0.32;
    } else {
      dist = this.orbitDist * Math.cos(this.orbitPitch);
      height = this.orbitDist * Math.sin(this.orbitPitch) + 1;
      bias = 0.5; // orbit around the midpoint so both fighters stay in frame
    }
    const fx = cp.x + (bp.x - cp.x) * bias;
    const fz = cp.z + (bp.z - cp.z) * bias;

    this._tmp.set(fx - Math.sin(this.camYaw) * dist, height, fz - Math.cos(this.camYaw) * dist);
    cam.position.sub(this._shakeOff);
    cam.position.lerp(this._tmp, 1 - Math.exp(-9 * dt));

    const target = new THREE.Vector3(fx, 1.4, fz);
    this._camLook.lerp(target, 1 - Math.exp(-10 * dt));
    cam.lookAt(this._camLook);

    this.shake *= Math.exp(-8 * dt);
    if (this.shake < 0.002) this.shake = 0;
    this._shakeOff.set(
      (Math.random() - 0.5) * this.shake * 0.55,
      (Math.random() - 0.5) * this.shake * 0.4,
      (Math.random() - 0.5) * this.shake * 0.55,
    );
    cam.position.add(this._shakeOff);
  }

  _updateWorld(dt) {
    if (this.lavaMat && this.lavaMat.uniforms) this.lavaMat.uniforms.uTime.value = this.time;
    this.lavaLights.forEach((l, i) => {
      l.intensity = 90 + Math.sin(this.time * 2.1 + i * 1.7) * 18 + Math.sin(this.time * 5.3 + i) * 8;
    });

    const cp = this.combat.root.position;
    const bp = this.boss.root.position;
    this.fill.position.set((cp.x + bp.x) / 2, 4.5, (cp.z + bp.z) / 2);
    this.key.position.set(cp.x + 9, 16, cp.z + 10);
    this.key.target.position.set(cp.x, 0, cp.z);

    const p = this.embers.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) + this.emberSpeed[i] * dt;
      if (y > 14) y = -1;
      p.setY(i, y);
      p.setX(i, p.getX(i) + Math.sin(this.time * 0.7 + i) * 0.12 * dt);
    }
    p.needsUpdate = true;
  }

  teardown() {
    if (this.touch) this.touch.dispose();
    if (this.input) this.input.ignored.delete('mouse0');
    // skinned meshes own a bone texture that disposeObject() does not free
    this.root.traverse((o) => {
      if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose();
    });
    if (this.hud) this.hud.dispose();
    if (this.state) this.state.timeScale = 1;
    if (this.scene) this.scene.fog = null;
    super.teardown();
  }
}
