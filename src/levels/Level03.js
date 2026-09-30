import * as THREE from 'three';
import { Level } from '../core/Level.js';
import { CombatController } from './level3/CombatController.js';
import { HandlerBoss } from './level3/HandlerBoss.js';
import { createLavaMaterial } from '../shaders/lava.js';
import { FightHUD } from '../ui/FightHUD.js';
import { TouchControls } from '../ui/TouchControls.js';
import { LevelAudio } from './level3/LevelAudio.js';
import { DeepHoldMine } from './level3/DeepHoldMine.js';

/**
 * Level 03 — Deephold, a third-person boss encounter.
 *
 * Shaft 07 is a dead gold mine repurposed as a buried server vault. This level
 * owns the mine hazards and story beats while the two fighter controllers
 * remain separate; this is the only place that resolves hits between them.
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


const MIXAMO_TO_KAI = {
  'mixamorig:Hips': 'pelvis', 'mixamorig:Spine': 'spine_01',
  'mixamorig:Spine1': 'spine_02', 'mixamorig:Spine2': 'spine_03',
  'mixamorig:Neck': 'neck', 'mixamorig:Head': 'head',
  'mixamorig:LeftShoulder': 'clavicle_l', 'mixamorig:RightShoulder': 'clavicle_r',
  'mixamorig:LeftArm': 'upperarm_l', 'mixamorig:LeftForeArm': 'lowerarm_l',
  'mixamorig:LeftHand': 'hand_l', 'mixamorig:RightArm': 'upperarm_r',
  'mixamorig:RightForeArm': 'lowerarm_r', 'mixamorig:RightHand': 'hand_r',
  'mixamorig:LeftUpLeg': 'thigh_l', 'mixamorig:LeftLeg': 'calf_l',
  'mixamorig:LeftFoot': 'foot_l', 'mixamorig:LeftToeBase': 'toe_l',
  'mixamorig:RightUpLeg': 'thigh_r', 'mixamorig:RightLeg': 'calf_r',
  'mixamorig:RightFoot': 'foot_r', 'mixamorig:RightToeBase': 'toe_r',
};
function namedClips(entries) {
  return entries.flatMap(([asset, name]) => (asset?.animations || []).map((clip) => {
    const copy = clip.clone(); copy.name = name; return copy;
  }));
}
function retargetClips(clips, targetNames, upperBodyOnly = false) {
  const upperBody = new Set([
    'spine_01', 'spine_02', 'spine_03', 'neck', 'head',
    'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r',
    'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r',
  ]);
  return clips.map((clip) => {
    const copy = clip.clone();
    copy.tracks = copy.tracks.filter((track) => {
      const dot = track.name.lastIndexOf('.');
      if (dot < 0) return false;
      const target = MIXAMO_TO_KAI[track.name.slice(0, dot)];
      if (!target || !targetNames.has(target)) return false;
      // Kai's suit GLB already ships with its own walk/run clips. Retarget only
      // punches and guards above the waist so foreign leg axes cannot invert.
      if (upperBodyOnly && !upperBody.has(target)) return false;
      track.name = target + track.name.slice(dot);
      return true;
    });
    return copy;
  });
}

export class Level03 extends Level {
  constructor() {
    super('level03');
    this.time = 0;
    this.lockOn = true; // true = lock-on combat cam, false = free 360° orbit view
    this.camYaw = 0;
    this.orbitPitch = 0.55;
    this.orbitDist = 9;
    this.shake = 0;
    this._shakeOff = new THREE.Vector3();
    this._hitStopUntil = 0;
    this._endTimer = -1;
    this._ended = false;
    this._abilityWas = false;
    this.worldColliders = [];
    this.mine = null;
    this.audio = null;
    this._wasAttacking = false;
    this._lastBossState = null;
    this.arenaHalfWidth = 10.25;
    this.arenaHalfDepth = 8.2;
    this.arenaCollapsed = false;
    this.collapseT = 0;
    this.currentInteraction = null;
  }

  _attachShieldedDrive() {
    const hand = this.combat?.fighter?.findBone(/hand_l$/i);
    if (!hand) return;
    const drive = new THREE.Group();
    drive.name = 'blackout-master-key-drive';
    const casing = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.14, 0.025),
      new THREE.MeshStandardMaterial({ color: 0x1b2020, metalness: 0.68, roughness: 0.42 }),
    );
    casing.castShadow = true;
    drive.add(casing);
    const collar = new THREE.Mesh(
      new THREE.BoxGeometry(0.082, 0.025, 0.033),
      new THREE.MeshStandardMaterial({ color: 0x77766e, metalness: 0.78, roughness: 0.3 }),
    );
    collar.position.y = 0.055;
    drive.add(collar);
    this.keyDriveLED = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 6, 5),
      new THREE.MeshStandardMaterial({ color: 0x916a39, emissive: 0x5c3413, emissiveIntensity: 0.35 }),
    );
    this.keyDriveLED.position.set(0, -0.045, 0.014);
    drive.add(this.keyDriveLED);
    drive.position.set(0, 0.025, 0.055);
    drive.rotation.set(0.12, 0.1, 0.08);
    hand.add(drive);
    this.keyDrive = drive;
  }

  async init(scene, assets, input, state) {
    super.init(scene, assets, input, state);

    const [
      kaiSrc, handlerSrc, fightIdle, walking, running, bodyJab, hookPunch,
      comboPunch, meleePunch, blocking, hitReact, runningRoll, aerialEvade,
      rockModel, lavaColor, lavaEmission, rockColor, rockNormal, rockRoughness,
    ] = await Promise.all([
      safe(assets.model('characters/level3/kai-suited.glb')),
      safe(assets.model('characters/level3/handler-soldier.glb')),
      safe(assets.model('characters/level3/fight-idle.glb')),
      safe(assets.model('characters/level3/walking.glb')),
      safe(assets.model('characters/level3/running.glb')),
      safe(assets.model('characters/level3/body-jab-cross.glb')),
      safe(assets.model('characters/level3/hook-punch.glb')),
      safe(assets.model('characters/level3/combo-punch.glb')),
      safe(assets.model('characters/level3/standing-melee-punch.glb')),
      safe(assets.model('characters/level3/blocking.glb')),
      safe(assets.model('characters/level3/big-hit-to-head.glb')),
      safe(assets.model('characters/level3/running-dive-roll.glb')),
      safe(assets.model('characters/level3/aerial-evade.glb')),
      safe(assets.model('models/rock-face-01/rock_face_01_1k.gltf')),
      safe(assets.texture('textures/lava-color.jpg')),
      safe(assets.texture('textures/lava-emission.jpg')),
      safe(assets.texture('textures/rock-color.jpg', { repeat: [4, 4] })),
      safe(assets.texture('textures/rock-normal.jpg', { srgb: false, repeat: [4, 4] })),
      safe(assets.texture('textures/rock-roughness.jpg', { srgb: false, repeat: [4, 4] })),
    ]);
    if (!this.scene) return; // level was torn down while loading

    scene.background = new THREE.Color(0x090806);
    scene.fog = new THREE.Fog(0x100d0a, 15, 42);

    this.mine = new DeepHoldMine(this.root, {
      rockModel,
      rockColor,
      rockNormal,
      rockRoughness,
      lavaColor,
      lavaEmission,
    });
    this.worldColliders = this.mine.colliders;
    const animationEntries = [
      [fightIdle, 'fight-idle'], [walking, 'walking'], [running, 'running'],
      [bodyJab, 'body-jab-cross'], [hookPunch, 'hook-punch'],
      [comboPunch, 'combo-punch'], [meleePunch, 'standing-melee-punch'],
      [blocking, 'blocking'], [hitReact, 'big-hit-to-head'],
      [runningRoll, 'running-dive-roll'], [aerialEvade, 'aerial-evade'],
    ];
    const sharedClips = namedClips(animationEntries);
    const kaiBoneNames = new Set();
    kaiSrc?.scene?.traverse((object) => { if (object.isBone) kaiBoneNames.add(object.name); });
    const kaiClips = retargetClips(sharedClips, kaiBoneNames, true);

    this.combat = new CombatController(this.root, kaiSrc, {
      extraClips: kaiClips,
      aliases: {
        punch: [/body-jab-cross/],
        swordslash: [/hook-punch/, /standing-melee-punch/],
        heavy: [/combo-punch/],
      },
    });
    this._attachShieldedDrive();
    this.boss = new HandlerBoss(this.root, this.combat, handlerSrc, {
      extraClips: sharedClips,
      // The GLB scene already contains its centimetre-to-metre transform.
      // Its skinned bind-pose bounds are tiny, so automatic fit multiplies it
      // hundreds of times and sends the soldier outside the camera.
      modelHeightUnits: 1.8,
      aliases: {
        idle: [/fight-idle/], punch: [/body-jab-cross/],
        swordslash: [/hook-punch/, /standing-melee-punch/],
        heavy: [/combo-punch/], block: [/blocking/],
        hit: [/big-hit-to-head/], roll: [/aerial-evade/, /running-dive-roll/],
      },
    });
    this._wireBoss(state);

    this.audio = new LevelAudio();
    this.audio.attachUnlock([window]);
    this.hud = new FightHUD({ game: this.game, onSoundToggle: (muted) => this.audio?.setMuted(muted) });
    this.hud.setCredits([
      { title: 'Three.js and Vite', html: 'Rendering and build tools. <a href="https://github.com/mrdoob/three.js/blob/dev/LICENSE" target="_blank" rel="noreferrer">MIT</a> · <a href="https://github.com/vitejs/vite/blob/main/LICENSE" target="_blank" rel="noreferrer">MIT</a>' },
      { title: 'Kai — suited character', html: 'Generated with MakeHuman/MPFB2 from the VSim asset library. MakeHuman states generated characters from bundled assets are CC0. <a href="https://github.com/kunalkushwaha/vsim/blob/main/packages/assets/library/CREDITS.md" target="_blank" rel="noreferrer">VSim asset credits</a> · <a href="https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md" target="_blank" rel="noreferrer">MakeHuman asset terms</a>' },
      { title: 'Handler — Vanguard', html: 'Vanguard by T. Choonyung, distributed in the Three.js Soldier example; Mixamo characters may be used royalty-free in video games under Adobe’s terms. <a href="https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/Soldier.glb" target="_blank" rel="noreferrer">Model file</a> · <a href="https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html" target="_blank" rel="noreferrer">Mixamo use terms</a>' },
      { title: 'Fight animations', html: 'Mixamo humanoid clips converted to GLB by MisterYI; Mixamo permits royalty-free use in video games. <a href="https://github.com/MisterYI/deevid-mixamo-assets" target="_blank" rel="noreferrer">Clip source</a> · <a href="https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html" target="_blank" rel="noreferrer">Mixamo use terms</a>' },
      { title: 'Rock Face 01', html: 'Scanned model by Dario Barresi, Poly Haven, CC0. <a href="https://polyhaven.com/a/rock_face_01" target="_blank" rel="noreferrer">Asset page</a>' },
      { title: 'Ground and lava materials', html: 'Ground 051 and Lava 004 texture maps by ambientCG, CC0. <a href="https://ambientcg.com/view?id=Ground051" target="_blank" rel="noreferrer">Ground 051</a> · <a href="https://ambientcg.com/view?id=Lava004" target="_blank" rel="noreferrer">Lava 004</a>' },
      { title: 'Original Level 3 work', html: 'DeepHold mine layout, collapsing ledges, fissure lava shader, procedural Web Audio sound, interface, collision, camera and combat by the project team.' },
    ]);
    this.hud.setLock(this.lockOn);
    this.touch = new TouchControls(input, {
      canvas: this.game.renderer.domElement,
      onToggleView: () => this._toggleView(),
    });

    this.camYaw = Math.PI; // the Handler waits at the far end of the mine chamber
    const cam = this.game.camera;
    cam.position.set(0, 2.4, 8.3);
    this._camLook = new THREE.Vector3(0, 1.25, 0);
    this._tmp = new THREE.Vector3();
    this._toBoss = new THREE.Vector3();
  }

  /* ---------------------------------------------------------------- world */

  _createSoftParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.34, 'rgba(255,255,255,0.88)');
    gradient.addColorStop(0.72, 'rgba(255,255,255,0.2)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  _buildRealRockObstacles(asset) {
    if (!asset?.scene) return;
    const placements = [
      [-7.5, -7.5, -0.65], [7.5, -7.5, 0.65],
      [-7.5, 7.5, 0.35], [7.5, 7.5, -0.35],
    ];
    for (const [x, z, yaw] of placements) {
      const model = asset.scene.clone(true);
      model.scale.setScalar(0.5);
      model.position.set(x, 0, z);
      model.rotation.y = yaw;
      model.traverse((object) => {
        if (!object.isMesh) return;
        object.geometry = object.geometry.clone();
        const source = Array.isArray(object.material) ? object.material : [object.material];
        const materials = source.map((material) => {
          const copy = material.clone();
          for (const key of Object.keys(copy)) {
            if (copy[key]?.isTexture) copy[key] = copy[key].clone();
          }
          return copy;
        });
        object.material = Array.isArray(object.material) ? materials : materials[0];
        object.castShadow = true;
        object.receiveShadow = true;
      });
      model.updateMatrixWorld(true);
      let bounds = new THREE.Box3().setFromObject(model);
      model.position.y -= bounds.min.y;
      model.updateMatrixWorld(true);
      bounds = new THREE.Box3().setFromObject(model);
      this.root.add(model);
      const size = bounds.getSize(new THREE.Vector3());
      this.realRocks.push(model);
      this.worldColliders.push({ x, z, radius: Math.hypot(size.x * 0.5, size.z * 0.5) * 0.98 });
    }
  }

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

  _buildArena(lavaColor, lavaEmission, rockColor, rockNormal, rockRoughness, rockModel) {
    // stone platform
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(14, 14.8, 1.2, 56),
      new THREE.MeshStandardMaterial({
        color: 0x77716a, map: rockColor, normalMap: rockNormal, roughnessMap: rockRoughness,
        roughness: 0.96, metalness: 0.02,
      }),
    );
    platform.position.y = -0.6;
    platform.receiveShadow = true;
    this.platform = platform;
    this.root.add(platform);

    const edge = new THREE.Mesh(
      new THREE.TorusGeometry(14.02, 0.1, 8, 120),
      new THREE.MeshBasicMaterial({ color: 0xff7a2a }),
    );
    edge.rotation.x = Math.PI / 2;
    edge.position.y = 0.02;
    this.edge = edge;
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

    // Natural cavern silhouette built from the same scanned rock asset as the
    // collision props. Geometry and textures are shared across the clones.
    this.backdropRocks = [];
    if (rockModel?.scene) {
      const prototype = rockModel.scene.clone(true);
      prototype.traverse((object) => {
        if (!object.isMesh) return;
        object.geometry = object.geometry.clone();
        const source = Array.isArray(object.material) ? object.material : [object.material];
        const copies = source.map((material) => {
          const copy = material.clone();
          for (const key of Object.keys(copy)) {
            if (copy[key]?.isTexture) copy[key] = copy[key].clone();
          }
          return copy;
        });
        object.material = Array.isArray(object.material) ? copies : copies[0];
      });
      const count = 16;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + (i % 2 ? 0.08 : -0.06);
        const radius = 22 + ((i * 7) % 5);
        const scale = 1.05 + ((i * 11) % 7) * 0.13;
        const rock = prototype.clone(true);
        rock.scale.setScalar(scale);
        rock.position.set(Math.sin(angle) * radius, -2.5, Math.cos(angle) * radius);
        rock.rotation.set((i % 3 - 1) * 0.1, angle + (i % 4) * 0.32, (i % 5 - 2) * 0.07);
        rock.traverse((object) => {
          if (object.isMesh) { object.castShadow = false; object.receiveShadow = false; }
        });
        rock.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(rock);
        rock.position.y -= bounds.min.y + 2.5;
        this.root.add(rock);
        this.backdropRocks.push(rock);
      }
    }

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
        this.audio?.play('parry');
        return 'parried';
      }
      if (c.blocking) {
        this.audio?.play('block');
        state.damage(info.damage * info.blockMul);
        state.spendStamina(info.damage * 0.7);
        this._addShake(0.14);
        hud().popup('BLOCKED', '#c9d6e0');
        this._checkPlayerDeath(state);
        return 'blocked';
      }
      this.audio?.play('damage');
      state.damage(info.damage);
      c.onHurt();
      this._hitStop(0.06);
      this._addShake(0.32);
      hud().damageFlash();
      this._checkPlayerDeath(state);
      return 'hit';
    };

    this.boss.onHelmetOff = () => {
      this._hitStop(0.2);
      this._addShake(0.5);
      hud().showStoryBeat('THE HANDLER', 'You recognize the signature. He hired you six months ago.');
    };
    this.boss.onPhaseChange = (n) => {
      this.audio?.play('phase');
      if (n > 2) {
        this.arenaCollapsed = true;
        this.collapseT = 0;
        this.audio?.play('collapse');
        hud().showStoryBeat('DESPERATION', 'The fissures split the floor. He has stopped holding back.');
      }
      else if (n === 2) hud().popup('HELMET CRACKED', '#d9a36e');
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
    const attackingNow = this.combat.attacking;
    if (attackingNow && !this._wasAttacking) this.audio?.play('swing');
    this._wasAttacking = attackingNow;

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
          this.audio?.play('hit');
          this.boss.root.position.addScaledVector(this._toBoss, fin ? 0.9 : 0.3);
          this._hitStop(fin ? 0.1 : 0.055);
          this._addShake(fin ? 0.28 : 0.1);
          if (this.boss.vulnerable) this.hud.popup('CRITICAL', '#ffd23a');
        }
      }
    }

    const b = this.boss.update(dt);
    if (this.boss.state === 'TELEGRAPH' && this._lastBossState !== 'TELEGRAPH') this.audio?.play('tell');
    this._lastBossState = this.boss.state;
    this._separate();
    this._resolveWorldCollisions();

    // Diegetic interactions: Kai can turn a pressure valve or release the roof winch.
    this.currentInteraction = this.mine.findInteraction(this.combat.root.position);
    this.hud.setInteractPrompt(
      this.currentInteraction?.name || '',
      this.currentInteraction?.detail || '',
    );
    this.touch.setInteractEnabled(!!this.currentInteraction, this.currentInteraction);
    if (input.pressed('interact') && this.currentInteraction) {
      this._activateMineInteraction(this.currentInteraction);
    }

    // The shielded drive called the Key emits a short focus pulse, as specified
    // by the pitch. Only its tiny indicator lights; neither fighter glows.
    if (this.combat.abilityActive && !this._abilityWas) {
      this.hud.popup('THE KEY', '#d9a36e');
      this.audio?.play('key');
    }
    this._abilityWas = this.combat.abilityActive;
    if (this.keyDriveLED) this.keyDriveLED.material.emissiveIntensity = this.combat.abilityActive ? 2.2 : 0.35;

    state.timeScale = performance.now() < this._hitStopUntil
      ? 0.04
      : this.combat.abilityActive ? 0.35 : 1;

    this._updateCamera(dt);
    const mineEvent = this.mine.update(dt, this.time);
    if (mineEvent?.type === 'rockfall-impact') this._resolveRockfall(mineEvent.position);
    this._updateArenaCollapse(dt);

    // shared state for whoever reads it (HUD, other levels' UI)
    state.handlerState = b.state;
    state.phase = this.boss.phaseIndex + 1;
    state.handlerHelmetOff = this.boss.helmetOff;

    this.hud.setBoss(this.boss.health / this.boss.maxHealth, b.state === 'DOWN' ? 'DEFEATED' : `PHASE ${state.phase} — ${b.phase}`);
    this.hud.setPlayer(state.health / state.maxHealth, state.stamina / state.maxStamina);
    this.hud.setKey(1 - Math.max(0, this.combat.abilityCD) / 9);
    this.hud.setParryWindow(this.combat.parryReady());

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

  _updateArenaCollapse(dt) {
    if (!this.arenaCollapsed) return;
    this.collapseT += dt;
    const t = THREE.MathUtils.clamp(this.collapseT / 5.2, 0, 1);
    const eased = t * t * (3 - 2 * t);
    this.mine.setCollapse(eased);
    this.arenaHalfWidth = 10.25 - 2.05 * eased;
    this.arenaHalfDepth = 8.2 - 1.55 * eased;
  }

  _resolveWorldCollisions() {
    const actors = [
      { root: this.combat.root, radius: 0.48 },
      { root: this.boss.root, radius: 0.52 },
    ];
    for (const { root, radius } of actors) {
      const p = root.position;
      for (let pass = 0; pass < 2; pass++) {
        for (const rock of this.worldColliders) {
          const dx = p.x - rock.x, dz = p.z - rock.z;
          const distance = Math.hypot(dx, dz), minimum = radius + rock.radius;
          if (distance >= minimum) continue;
          const nx = distance > 0.001 ? dx / distance : 1;
          const nz = distance > 0.001 ? dz / distance : 0;
          p.x += nx * (minimum - distance);
          p.z += nz * (minimum - distance);
        }
      }
      const halfWidth = Math.max(6.4, this.arenaHalfWidth - radius);
      const halfDepth = Math.max(5.3, this.arenaHalfDepth - radius);
      p.x = THREE.MathUtils.clamp(p.x, -halfWidth, halfWidth);
      p.z = THREE.MathUtils.clamp(p.z, -halfDepth, halfDepth);
    }
  }

  _activateMineInteraction(interaction) {
    const result = this.mine.activate(interaction, this.boss.root.position);
    if (!result) return;
    if (result.type === 'steam') {
      this.audio?.play('valve');
      const bossPos = this.boss.root.position;
      const dx = bossPos.x - result.position.x;
      const dz = bossPos.z - result.position.z;
      if (Math.hypot(dx, dz) <= result.radius) {
        this.boss.takeDamage(18);
        this.boss.stagger(2.15);
        this._hitStop(0.07);
        this._addShake(0.22);
        this.hud.popup('STEAM BLINDS HIM', '#d9a36e');
      } else {
        this.hud.popup('STEAM RELEASED', '#d9a36e');
      }
    } else if (result.type === 'rockfall-start') {
      this.audio?.play('valve');
      this.hud.popup('ROOF RELEASED', '#d9a36e');
    }
  }

  _resolveRockfall(position) {
    this.audio?.play('collapse');
    this._addShake(0.5);
    const bossPos = this.boss.root.position;
    const distance = Math.hypot(bossPos.x - position.x, bossPos.z - position.z);
    if (distance <= 2.3 && this.boss.state !== 'DOWN') {
      this.boss.takeDamage(42);
      this.boss.stagger(2.0);
      this._hitStop(0.12);
      this.hud.popup('ROCKFALL HIT', '#d9a36e');
    } else {
      this.hud.popup('ROCKFALL MISSED', '#c7b7a5');
    }
  }

  _finish(state) {
    this._ended = true;
    this.finished = true;
    state.timeScale = 1;
    if (this._endKind === 'win') { this.audio?.play('victory'); this.hud.showBanner('ELEVEN MORE KEYS', 'The upload starts. The Handler put you on the contract. Eleven other Keys remain.', '#e4c6a1'); }
    else { this.audio?.play('defeat'); this.hud.showBanner('DEFEATED', 'PRESS R TO TRY AGAIN', '#ff5a5a'); }
  }

  _updateCamera(dt) {
    const cam = this.game.camera;
    const cp = this.combat.root.position;
    const bp = this.boss.root.position;
    let dist, height, bias;
    if (this.lockOn) {
      dist = 6.4; height = 2.75; bias = 0.42;
    } else {
      dist = this.orbitDist * Math.cos(this.orbitPitch);
      height = this.orbitDist * Math.sin(this.orbitPitch) + 1;
      bias = 0.5; // orbit around the midpoint so both fighters stay in frame
    }
    const fx = cp.x + (bp.x - cp.x) * bias;
    const fz = cp.z + (bp.z - cp.z) * bias;

    const shoulder = this.lockOn ? 1.25 : 0;
    this._tmp.set(
      fx - Math.sin(this.camYaw) * dist - Math.cos(this.camYaw) * shoulder,
      height,
      fz - Math.cos(this.camYaw) * dist + Math.sin(this.camYaw) * shoulder,
    );
    this._tmp.x = THREE.MathUtils.clamp(this._tmp.x, -13.5, 13.5);
    this._tmp.z = THREE.MathUtils.clamp(this._tmp.z, -13.5, 13.5);
    this._tmp.y = THREE.MathUtils.clamp(this._tmp.y, 1.5, 8.2);
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
    this.audio?.dispose();
    if (this.state) this.state.timeScale = 1;
    if (this.scene) this.scene.fog = null;
    this.softParticleTexture?.dispose();
    super.teardown();
  }
}
