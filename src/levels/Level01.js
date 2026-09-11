import * as THREE from "three";
import { Level } from "../core/Level.js";
import { createSpeedWarpMaterial, updateSpeedWarp } from "../shaders/speedWarpShader.js";
import { AudioSystem } from "../audio/audioSystem.js";
import { createSubwayMaterials } from "./level1/subwayTextures.js";

/**
 * Level 01 — Downline.
 *
 * @1A: your player rig, lane logic, jump physics and camera pivot are
 * untouched below — I only replaced the placeholder tunnel and lighting
 * with the real subway art, and added obstacles / the security gate /
 * the service-vehicle handoff to Level 2, plus Shader 1 (speed-warp)
 * and the audio layer that were on my list.
 *
 * What changed vs. the shell:
 *   floorMat / wallMat        → real materials + the speed-warp ShaderMaterial on walls
 *   colour-only materials     → procedural albedo/normal/roughness maps (level1/subwayTextures.js)
 *   single directional light  → hemi + key + a few point lights (emergency strips) + fog tuned cyan
 *   (nothing)                 → pipes, platform ledge, ticket-barrier obstacles, security gate, service bay
 *   (nothing)                 → AudioSystem: ambience, footsteps tied to stride, gate/train stings
 *
 * Obstacles and the security gate are placed with userData flags so
 * whoever wires up collision (you / 3A) can just read them off
 * this.obstacles / this.securityGate — I haven't touched collision logic.
 */
const LANE_X = [-2.4, 0, 2.4];

export class Level01 extends Level {
  constructor() {
    super("level01");
    this.z = 0;
    this.speed = 12;
    this.maxSpeed = 24; // used only to normalise the speed-warp shader uniform
    this.lane = 1;
    this.laneFrom = 1;
    this.laneT = 1;
    this.y = 0;
    this.vy = 0;
    this.airborne = false;

    this.obstacles = [];
    this.securityGate = null;
    this.serviceVehicle = null;

    this._audio = null;
    this._audioReady = false;
    this._strideDistance = 0;
    this._strideInterval = 0.42; // world units between footstep triggers
  }

  init(scene, assets, input, state) {
    super.init(scene, assets, input, state);

    scene.background = new THREE.Color(0x05070d);
    // cold cyan emergency-light haze, closes down visibility a bit faster
    // than the shell's fog so the tunnel reads as claustrophobic
    scene.fog = new THREE.Fog(0x061013, 35, 165);

    const hemi = new THREE.HemisphereLight(0x4e8fa6, 0x121a26, 1.15);
    this.root.add(hemi);

    this.key = new THREE.DirectionalLight(0xbfe6ff, 1.35);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.camera.left = -14;
    this.key.shadow.camera.right = 14;
    this.key.shadow.camera.top = 14;
    this.key.shadow.camera.bottom = -14;
    this.root.add(this.key, this.key.target);

    // one set of procedurally generated materials shared by the builders below
    const mats = createSubwayMaterials();
    this._buildTunnel(mats);
    this._buildObstacles(mats);
    this._buildSecurityGate(mats);
    this._buildServiceArea(mats);

    // the player rig — camera hangs off a pivot on the rig, never on the mesh
    this.player = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.34, 0.8, 4, 10),
      new THREE.MeshStandardMaterial({ color: 0x24384f, roughness: 0.55 }),
    );
    body.position.y = 1.05;
    body.castShadow = true;
    this.player.add(body);

    this.camPivot = new THREE.Object3D();
    this.camPivot.position.set(0, 2.5, 7.4);
    this.player.add(this.camPivot);
    this.root.add(this.player);

    this._tmp = new THREE.Vector3();

    // Audio listener needs the active camera, which Game.js owns. If
    // this.game.camera isn't set yet at this point, update() will pick
    // it up on the first frame instead — see _ensureAudio().
    this._ensureAudio();
  }

  /** Builds the real subway art: walls (speed-warp shader), floor, ceiling, platform edge, pipes, strip lights. */
  _buildTunnel(mats) {
    // Shader 1 still owns the walls — now sampling a procedural glazed-tile
    // map instead of flat colour. mapRepeat does the tiling, because a raw
    // ShaderMaterial ignores texture.repeat; one repeat is 4 m of tunnel
    // length × 2.8 m of wall height.
    this.wallMaterial = createSpeedWarpMaterial({
      map: mats.wallMap,
      mapRepeat: [150, 2.5],
      baseColor: 0xffffff, // white tint — the tile texture carries the colour
      streakColor: 0x6be2ff,
    });

    const floorGeo = new THREE.BoxGeometry(12, 0.4, 600);
    this.floor = new THREE.Mesh(floorGeo, mats.floorMat);
    this.floor.position.set(0, -0.2, -260);
    this.floor.receiveShadow = true;
    this.root.add(this.floor);

    const wallGeo = new THREE.BoxGeometry(1, 7, 600);
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(wallGeo, this.wallMaterial);
      wall.position.set(side * 6.2, 3.3, -260);
      wall.receiveShadow = true;
      this.root.add(wall);
    }

    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.3, 600), mats.ceilingMat);
    ceiling.position.set(0, 6.9, -260);
    this.root.add(ceiling);

    // raised platform ledge, one side, outside the playable lanes —
    // its texture carries the worn yellow safety line along the track edge
    const platform = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 600), mats.platformMat);
    platform.position.set(-5.3, 0.05, -260);
    platform.receiveShadow = true;
    platform.castShadow = true;
    this.root.add(platform);

    // overhead pipes, other side — rust-streaked, with weld seams every 4 m
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 600, 8), mats.pipeMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(5.5, 5.9, -260);
    pipe.castShadow = true;
    this.root.add(pipe);

    // emergency strips: unlit emissive-look meshes (already in the shell) +
    // real point lights every third one so the tunnel actually gets lit
    // by them instead of just showing a bright rectangle
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xcfefff });
    this.stripLights = [];
    for (let i = 0; i < 30; i++) {
      const z = -i * 20;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.6), stripMat);
      strip.position.set(0, 6.3, z);
      this.root.add(strip);

      if (i % 3 === 0) {
        const point = new THREE.PointLight(0x6be2ff, 1.1, 14, 2);
        point.position.set(0, 6.0, z);
        this.root.add(point);
        this.stripLights.push(point);
      }
    }
  }

  /** Greyboxed ticket barriers / trolleys along the lanes — collision is 1A/3A's to wire up, these just exist with userData flags. */
  _buildObstacles(mats) {
    const barrierGeo = new THREE.BoxGeometry(1, 1, 0.4);

    const placements = [
      { lane: 0, z: -60 },
      { lane: 2, z: -95 },
      { lane: 1, z: -140 },
      { lane: 0, z: -190 },
    ];

    for (const { lane, z } of placements) {
      const barrier = new THREE.Mesh(barrierGeo, mats.barrierMat);
      barrier.position.set(LANE_X[lane], 0.5, z);
      barrier.castShadow = true;
      barrier.receiveShadow = true;
      barrier.userData.isObstacle = true;
      barrier.userData.lane = lane;
      barrier.userData.z = z;
      this.obstacles.push(barrier);
      this.root.add(barrier);
    }
  }

  /** Sector seal near the end of the tunnel — Interlude I animates this closing; geometry/placement only, no animation here. */
  _buildSecurityGate(mats) {
    const gateGroup = new THREE.Group();
    gateGroup.position.set(0, 0, -230);

    // gateMat keeps the orange emissive glow; the maps add scratched,
    // worn paint on top of it

    const barCount = 8;
    for (let i = 0; i < barCount; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.15, 6, 0.15), mats.gateMat);
      bar.position.set(-6.2 + (i / (barCount - 1)) * 12.4, 3, 0);
      gateGroup.add(bar);
    }

    const gateLight = new THREE.PointLight(0xffa63d, 1.4, 16, 2);
    gateLight.position.set(0, 4, 1);
    gateGroup.add(gateLight);

    gateGroup.userData.isSecurityGate = true;
    gateGroup.userData.open = true; // Interlude I closes it
    this.securityGate = gateGroup;
    this.root.add(gateGroup);
  }

  /** The maintenance bay + parked vehicle that Level 2 picks up from. */
  _buildServiceArea(mats) {
    const serviceGroup = new THREE.Group();
    serviceGroup.position.set(0, 0, -255);

    // the bay reuses the wet-concrete floor look, retiled for a 14 × 20 m slab
    const bayFloor = new THREE.Mesh(new THREE.PlaneGeometry(14, 20), mats.bayFloorMat);
    bayFloor.rotation.x = -Math.PI / 2;
    bayFloor.receiveShadow = true;
    serviceGroup.add(bayFloor);

    // TODO(art): swap for the real maintenance vehicle .glb
    const vehicle = new THREE.Mesh(new THREE.BoxGeometry(2, 1.4, 4.2), mats.vehicleMat);
    vehicle.position.set(0, 0.7, -6);
    vehicle.castShadow = true;
    vehicle.userData.isServiceVehicle = true;
    vehicle.userData.startsLevel2 = true;
    serviceGroup.add(vehicle);

    const workLight = new THREE.PointLight(0xffe8b0, 2.0, 20, 2);
    workLight.position.set(0, 5, -6);
    workLight.castShadow = true;
    serviceGroup.add(workLight);

    this.serviceVehicle = vehicle;
    this.root.add(serviceGroup);
  }

  /** Grabs the game camera for the AudioListener once it exists — safe to call every frame until it succeeds. */
  _ensureAudio() {
    if (this._audioReady) return;
    const camera = this.game && this.game.camera;
    if (!camera) return;

    this._audio = new AudioSystem(camera);
    this._audioReady = true;

    this._audio
      .loadAll({
        ambience: "assets/audio/level01/subway_ambience.mp3",
        footstep: "assets/audio/shared/footstep_concrete.mp3",
        gateSlam: "assets/audio/level01/gate_slam.mp3",
        train: "assets/audio/level01/train_rumble.mp3",
        music_l1: "assets/audio/level01/music_downline.mp3",
      })
      .then(() => {
        this._audio.playAmbience("ambience", { volume: 0.35 });
      });
  }

  update(dt, state) {
    const input = this.input;

    if (!this._audioReady) this._ensureAudio();

    // forward motion
    this.z -= this.speed * dt;
    state.distance = -this.z;

    // lanes
    if (input.pressed("left") && this.lane > 0) {
      this.laneFrom = this.lane;
      this.lane--;
      this.laneT = 0;
    }
    if (input.pressed("right") && this.lane < 2) {
      this.laneFrom = this.lane;
      this.lane++;
      this.laneT = 0;
    }
    if (this.laneT < 1) this.laneT = Math.min(1, this.laneT + dt / 0.16);
    const x = THREE.MathUtils.lerp(
      LANE_X[this.laneFrom],
      LANE_X[this.lane],
      THREE.MathUtils.smoothstep(this.laneT, 0, 1),
    );

    // jump
    if (input.pressed("jump") && !this.airborne) {
      this.airborne = true;
      this.vy = 9.2;
    }
    if (this.airborne) {
      this.vy -= 24 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.airborne = false;
      }
    }

    this.player.position.set(x, this.y, this.z);

    // shadow camera follows so shadows stay inside it
    this.key.position.set(x + 6, 14, this.z + 10);
    this.key.target.position.set(x, 0, this.z - 6);

    // camera lerps toward the pivot rather than being parented to it
    const cam = this.game.camera;
    this.camPivot.getWorldPosition(this._tmp);
    cam.position.lerp(this._tmp, 1 - Math.exp(-9 * dt));
    cam.lookAt(x * 0.7, 1.5, this.z - 9);

    // --- shader 1: speed-warp, driven by current forward speed ---
    updateSpeedWarp(this.wallMaterial, dt, THREE.MathUtils.clamp(this.speed / this.maxSpeed, 0, 1));

    // strip lights pulse a little faster as speed rises
    const pulse = 1.0 + Math.sin(performance.now() * 0.004 * (1 + this.speed / this.maxSpeed)) * 0.15;
    for (const light of this.stripLights) light.intensity = 1.1 * pulse;

    // --- footsteps: trigger on stride distance, only while grounded ---
    if (!this.airborne && this._audio) {
      this._strideDistance += this.speed * dt;
      if (this._strideDistance >= this._strideInterval) {
        this._strideDistance = 0;
        this._audio.playFootstep({ volume: 0.4 });
      }
    }
  }

  teardown() {
    if (this._audio) {
      this._audio.teardown();
      this._audio = null;
      this._audioReady = false;
    }
    this.scene.fog = null;
    super.teardown();
  }
}