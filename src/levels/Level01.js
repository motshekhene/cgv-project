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
 *   constant speed            → baseSpeed ramps with distance + boost/stamina, so Shader 1 sweeps
 *   static security gate      → Interlude I slam: telegraph strobe, fall, impact, sting, camera shake
 *   obstacles were scenery    → clipping one stumbles Kai and hands the Handler three metres
 *   no pursuer                → the Handler: 15 m head start, constant-speed follower, fail state at 0
 *   single directional light  → hemi + key + a few point lights (emergency strips) + fog tuned cyan
 *   (nothing)                 → pipes, platform ledge, ticket-barrier obstacles, security gate, service bay
 *   (nothing)                 → AudioSystem: ambience, footsteps tied to stride, gate/train stings
 *
 * Level 01's economy comes straight off the pitch: "the only currency is
 * distance", "every clipped barrier hands him three metres", and the health
 * bar does not appear until level 02. So nothing here calls state.damage() —
 * mistakes are paid for in metres of gap, and the run ends when the gap
 * reaches zero.
 *
 * this.finished is set on a catch, but NOTHING IN Game._frame() READS IT yet,
 * so a catch currently stops Kai and goes quiet instead of showing a fail
 * screen. That hook is shared-systems work, not Level 01's.
 */
const LANE_X = [-2.4, 0, 2.4];

// --- security gate (Interlude I) ---
const GATE_Z = -230;
const GATE_OPEN_Y = 6.9; // bars retracted above the ceiling underside (6.75)
const GATE_WARN_RANGE = 48; // metres out where the amber telegraph starts
const GATE_TRIGGER_Z = GATE_Z - 3; // slams once Kai is just past it, sealing the tunnel behind him

// --- boost / stamina tuning ---
const BOOST_DRAIN = 28; // stamina per second while boosting
const BOOST_REGEN = 22; // stamina per second while not
const BOOST_UNLOCK = 0.45; // fraction of the pool needed to boost again after running dry

// --- obstacle clipping ---
// Barriers are BoxGeometry(1, 1, 0.4) sitting on the floor at y = 0.5, and
// Kai is a capsule of radius 0.34 whose base rests 0.31 above the rig origin.
const PLAYER_RADIUS = 0.34;
const PLAYER_FEET_Y = 0.31;
const OBSTACLE_TOP_Y = 1.0;
const CLIP_HALF_X = 0.5 + PLAYER_RADIUS; // barrier half-width + capsule radius
const CLIP_HALF_Z = 0.2 + PLAYER_RADIUS; // barrier half-depth + capsule radius

// --- the Handler ---
// "He does not run faster than you. He just never slows down." So he is a
// constant-speed follower matched to Kai's cruise, not an AI — there is no
// state machine here for whoever owns the pursuer to collide with.
const HANDLER_START_GAP = 15; // metres, straight off the pitch
const HANDLER_MAX_GAP = 60; // boosting must not make him irrelevant
const HANDLER_LIGHT_RANGE = 40; // gap at which his glow starts to register
// A clip costs the pitch's three metres. It is charged as a debt in metres
// that is paid off as a speed deficit, rather than as a straight subtraction
// from the gap: the stumble the player feels and the ground they lose are then
// the same thing. Debt is only decremented by the deficit actually applied, so
// the total is exactly CLIP_PENALTY regardless of frame rate. Decaying a m/s
// deficit directly instead would leak ~3.06 m at 60 fps and ~3.17 m at 20 fps.
const CLIP_PENALTY = 3;
const STUMBLE_TAU = 0.45; // seconds; recovery time constant
// Constant creep, m/s, on top of matching Kai's cruise. Zero means a clean run
// holds the gap forever and only mistakes threaten it, which is what the pitch
// describes. Raise it if playtests say a clean run has no tension — nothing
// else reads this.
const HANDLER_CREEP = 0;

export class Level01 extends Level {
  constructor() {
    super("level01");
    this.z = 0;
    // Speed is no longer a constant. baseSpeed ramps with distance and boost
    // stacks on top, so Shader 1's uSpeed actually sweeps its range across the
    // level instead of sitting on one value the whole way down.
    this.baseSpeed = 11;
    this.boostSpeed = 0;
    this.speed = this.baseSpeed;
    this.maxSpeed = 30; // normalisation ceiling for the speed-warp uniform
    this.boosting = false;
    // Once stamina runs dry the boost locks out until it has regenerated to
    // BOOST_UNLOCK. Without this, spendStamina() fails and succeeds on
    // alternating frames and the boost (and the FOV kick) flickers at 30 Hz.
    this._boostLocked = false;
    // Handler pursuit — the whole of level 01's tension
    this.gap = HANDLER_START_GAP;
    this.caught = false;
    this._stumbleDebt = 0; // metres of ground still owed from clipping a barrier
    // speed the shader/lights follow, smoothed so the streaks ease rather than
    // snapping when Kai stumbles or gets caught
    this._displaySpeed = 11;
    this.lane = 1;
    this.laneFrom = 1;
    this.laneT = 1;
    this.y = 0;
    this.vy = 0;
    this.airborne = false;

    this.obstacles = [];
    this.securityGate = null;
    this.serviceVehicle = null;

    // gate slam animation — driven in _updateGate(), not an AnimationMixer,
    // because it's one axis of one group and physics reads better here
    this._gatePhase = "open"; // 'open' | 'warning' | 'slamming' | 'closed'
    this._gateY = GATE_OPEN_Y;
    this._gateVel = 0;
    this._gateImpacts = 0;
    this._gateFlash = 0;
    this._shake = 0; // camera shake, decays over ~0.6s after the slam

    this._audio = null;
    this._audioReady = false;
    this._strideDistance = 0;
    // one stride ≈ 1.6 m of ground covered, so the footstep rate rises with
    // the speed ramp on its own instead of needing its own curve
    this._strideInterval = 1.6;
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
    this._buildHandler();

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

    // the boost FOV kick writes to the shared camera, so remember the value
    // Game set and hand it back in teardown()
    this._baseFov = this.game && this.game.camera ? this.game.camera.fov : 62;

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

  /** Greyboxed ticket barriers / trolleys along the lanes — _clipObstacles() charges the pitch's three metres against these; userData flags are there for whoever adds more. */
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

  /** Sector seal near the end of the tunnel. Starts retracted into the ceiling; _updateGate() slams it shut behind Kai as Interlude I. */
  _buildSecurityGate(mats) {
    const gateGroup = new THREE.Group();
    gateGroup.position.set(0, 0, GATE_Z);

    // gateMat keeps the orange emissive glow; the maps add scratched,
    // worn paint on top of it

    // The bars live in their own sub-group so the slam animates one y offset
    // rather than eight bar positions, and so userData/collision code can
    // still treat gateGroup as the gate.
    const slide = new THREE.Group();
    slide.position.y = GATE_OPEN_Y;

    const barCount = 8;
    for (let i = 0; i < barCount; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.15, 6, 0.15), mats.gateMat);
      bar.position.set(-6.2 + (i / (barCount - 1)) * 12.4, 3, 0);
      bar.castShadow = true;
      slide.add(bar);
    }
    gateGroup.add(slide);

    // housing the bars retract into, so the open gate reads as a mechanism
    // waiting to fire rather than an empty doorway
    const housing = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.6, 0.5), mats.gateMat);
    housing.position.set(0, 6.6, 0);
    housing.castShadow = true;
    gateGroup.add(housing);

    // Reach is deliberately long: Kai is already past the gate when it fires,
    // so the impact flash washing the tunnel around him is the only part of
    // the slam he can actually see. The strobe telegraph is what he sees
    // coming, the flash and the sting are what he gets on the way out.
    const gateLight = new THREE.PointLight(0xffa63d, 1.4, 30, 2);
    gateLight.position.set(0, 4, 1);
    gateGroup.add(gateLight);

    gateGroup.userData.isSecurityGate = true;
    gateGroup.userData.open = true; // _updateGate() flips this when it fires
    this.securityGate = gateGroup;
    this._gateSlide = slide;
    this._gateLight = gateLight;
    this._gateLightBase = 1.4;
    this._gateMaterial = mats.gateMat;
    this.root.add(gateGroup);
  }

  /**
   * Interlude I: the sector seal slams down once Kai is past it, cutting the
   * tunnel off behind him. Phases:
   *
   *   open     → retracted, nothing to do
   *   warning  → amber strobe telegraph as he closes on it
   *   slamming → accelerating fall, then impacts that rebound like steel
   *   closed   → settled, light bleeds back to a steady glow
   *
   * Each impact fires the gate_slam sting and shoves the camera; the first
   * one hits hardest.
   */
  _updateGate(dt) {
    if (this._gatePhase === "closed") {
      // ease the flash out and let the bars sit
      this._gateFlash = Math.max(0, this._gateFlash - dt * 2.4);
      this._gateLight.intensity = this._gateLightBase + this._gateFlash * 9;
      this._gateMaterial.emissiveIntensity = 0.6 + this._gateFlash * 1.4;
      return;
    }

    if (this._gatePhase === "open" && this.z - GATE_Z < GATE_WARN_RANGE) {
      this._gatePhase = "warning";
    }

    if (this._gatePhase === "warning") {
      // telegraph: strobe the housing light so the slam is readable, not a
      // cheap shock — the player should see it coming
      const strobe = 0.5 + 0.5 * Math.sin(performance.now() * 0.019);
      this._gateLight.intensity = this._gateLightBase + strobe * 2.8;
      this._gateMaterial.emissiveIntensity = 0.6 + strobe * 0.9;

      if (this.z <= GATE_TRIGGER_Z) {
        this._gatePhase = "slamming";
        this.securityGate.userData.open = false;
      }
      return;
    }

    // --- slamming: heavy steel under gravity, with rebounds ---
    if (this._gatePhase !== "slamming") return; // still open and out of range

    this._gateVel += 34 * dt;
    this._gateY -= this._gateVel * dt;
    this._gateFlash = Math.max(0, this._gateFlash - dt * 2.4);

    if (this._gateY <= 0) {
      this._gateY = 0;
      const impact = this._gateVel;
      this._gateImpacts++;

      if (this._gateImpacts === 1) {
        if (this._audio) this._audio.playOneShot("gateSlam", { volume: 0.85 });
        this._shake = 0.45;
        this._gateFlash = 1;
      } else {
        this._shake = Math.max(this._shake, 0.14);
        this._gateFlash = Math.max(this._gateFlash, 0.35);
      }

      // rebound twice, then settle
      if (this._gateImpacts <= 2 && impact > 6) {
        this._gateVel = -impact * 0.22;
      } else {
        this._gateVel = 0;
        this._gatePhase = "closed";
      }
    }

    this._gateSlide.position.y = this._gateY;
    this._gateLight.intensity = this._gateLightBase + this._gateFlash * 9;
    this._gateMaterial.emissiveIntensity = 0.6 + this._gateFlash * 1.4;
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

  /**
   * The Handler, greyboxed. "On foot he is a shape at the edge of the tunnel
   * lights" — so he is a dark capsule plus an amber glow, amber because the
   * palette rule is cyan everywhere and amber only where something is about
   * to hurt you.
   *
   * He sits behind the camera pivot, so the silhouette itself is not visible
   * until the look-back camera exists (input.lookBack is already bound and
   * unread). What the player actually reads is his light washing the tunnel
   * from behind and his breathing getting closer, which needs no new camera.
   *
   * Deliberately NOT shadow-casting: the risk slide budgets one shadow-casting
   * light per level and the key light already spends it.
   */
  _buildHandler() {
    const group = new THREE.Group();

    const coat = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.42, 1.15, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0x090c11, roughness: 0.95, metalness: 0 }),
    );
    coat.position.y = 1.15;
    group.add(coat);

    const glow = new THREE.PointLight(0xff8a3d, 0, 30, 2);
    glow.position.set(0, 2.1, 0.4);
    group.add(glow);

    group.position.set(0, 0, HANDLER_START_GAP);
    group.userData.isHandler = true;

    this.handler = group;
    this.handlerLight = glow;
    this._handlerLightBase = 3.4;
    this.root.add(group);
  }

  /**
   * Did Kai clip a barrier this frame? Unlike a blocking test this never moves
   * him — the pitch's economy is that a clip costs ground, not progress, so he
   * runs on through and pays for it in gap.
   *
   * The band is swept against prevZ rather than tested at the end position: at
   * maxSpeed on a clamped 0.05 s frame he covers 1.5 m, more than the 1.08 m
   * deep band, so a position-only test would miss the hit entirely on a
   * stuttering frame.
   *
   * @param {number} x lane-interpolated x for this frame
   * @param {number} prevZ this.z before this frame's forward integration
   * @returns {THREE.Mesh|null} the barrier he clipped, or null if he got past clean
   */
  _clipObstacles(x, prevZ) {
    for (const barrier of this.obstacles) {
      if (barrier.userData.clipped) continue; // already paid for this one

      const nearFace = barrier.position.z + CLIP_HALF_Z;
      const farFace = barrier.position.z - CLIP_HALF_Z;
      // he travels down -z, so he is level with it only once this frame ends
      // at or beyond the near face having started before the far one
      if (this.z > nearFace) continue;
      if (prevZ <= farFace) continue;

      if (Math.abs(x - barrier.position.x) >= CLIP_HALF_X) continue; // dodged by lane
      if (this.y + PLAYER_FEET_Y >= OBSTACLE_TOP_Y) continue; // jumped it

      barrier.userData.clipped = true;
      return barrier;
    }
    return null;
  }

  /**
   * Advances the pursuit. The gap only moves because Kai is faster or slower
   * than the Handler's cruise, so boost buys metres and stumbling spends them
   * — there is no separate bookkeeping to disagree with the physics.
   */
  _updateHandler(dt, state) {
    if (!this.caught) {
      const handlerSpeed = this.baseSpeed + HANDLER_CREEP;
      this.gap = Math.min(HANDLER_MAX_GAP, this.gap + (this.speed - handlerSpeed) * dt);

      if (this.gap <= 0) {
        this.gap = 0;
        this.caught = true;
        this.finished = true; // no reader in Game yet — see the header note
        state.alive = false;
        state.handlerState = "CAUGHT";
        this._shake = 0.6;
        if (this._audio) this._audio.playOneShot("handlerCatch", { volume: 0.9 });
      } else {
        state.handlerState = this.speed < handlerSpeed ? "CLOSING" : "LOSING_GROUND";
      }
    }

    state.handlerGap = this.gap;
    this.handler.position.z = this.z + this.gap;

    // squared so he is a faint wash for most of the run and a real presence
    // only once he is genuinely close
    const closeness = 1 - THREE.MathUtils.clamp(this.gap / HANDLER_LIGHT_RANGE, 0, 1);
    this.handlerLight.intensity = this._handlerLightBase * closeness * closeness;
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
        impact: "assets/audio/shared/impact_thud.mp3",
        handlerBreath: "assets/audio/level01/handler_breath.mp3",
        handlerCatch: "assets/audio/level01/handler_catch.mp3",
        train: "assets/audio/level01/train_rumble.mp3",
        music_l1: "assets/audio/level01/music_downline.mp3",
      })
      .then(() => {
        this._audio.playAmbience("ambience", { volume: 0.35 });
        // his breathing rides on the silhouette, so the listener's distance
        // model does the tension for free as the gap closes
        if (this.handler) {
          this._audio.attachPositional(this.handler, "handlerBreath", {
            volume: 0.9,
            refDistance: 8,
            maxDistance: HANDLER_LIGHT_RANGE,
          });
        }
      });
  }

  update(dt, state) {
    const input = this.input;

    if (!this._audioReady) this._ensureAudio();

    // --- speed: distance ramp + boost, both feeding Shader 1 ---
    // The tunnel gets faster the deeper Kai goes. Capped so the ramp alone
    // tops out around 20 and boost still has headroom under maxSpeed.
    this.baseSpeed = 11 + Math.min(9, -this.z * 0.035);

    // boost burns the shared stamina pool so 3B's HUD reads it for free
    const wantsBoost = input.isDown("boost");
    if (this._boostLocked && state.stamina >= state.maxStamina * BOOST_UNLOCK) {
      this._boostLocked = false;
    }
    this.boosting = wantsBoost && !this._boostLocked && state.spendStamina(BOOST_DRAIN * dt);
    // held the key but the pool just ran out — lock it until it recovers
    if (wantsBoost && !this.boosting && !this._boostLocked) this._boostLocked = true;
    if (!this.boosting) state.regenStamina(BOOST_REGEN, dt);

    const boostTarget = this.boosting ? 10 : 0;
    // attack faster than release, so boost feels responsive but bleeds off
    const boostRate = this.boosting ? 3.4 : 2.0;
    this.boostSpeed += (boostTarget - this.boostSpeed) * (1 - Math.exp(-boostRate * dt));

    // Pay down any stumble debt. The deficit is proportional to what is left
    // owed, so recovery is exponential with STUMBLE_TAU, and the debt only
    // drops by the deficit that actually landed — so the speed floor delays
    // the payment rather than cancelling part of it.
    const wantedDeficit = this._stumbleDebt / STUMBLE_TAU;
    const cruise = this.baseSpeed + this.boostSpeed;
    this.speed = Math.max(this.baseSpeed * 0.25, cruise - wantedDeficit);
    this._stumbleDebt = Math.max(0, this._stumbleDebt - (cruise - this.speed) * dt);
    if (this._stumbleDebt < 0.001) this._stumbleDebt = 0;

    if (this.caught) {
      this.speed = 0;
      this.boostSpeed = 0;
    }

    // forward motion — barriers are checked against this further down, once
    // this frame's lane and jump state are known
    const prevZ = this.z;
    this.z -= this.speed * dt;

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

    // --- obstacles: a clip costs ground, not health ---
    const clipped = this._clipObstacles(x, prevZ);
    if (clipped) {
      // the stumble debt IS the three metres; do not also subtract from the
      // gap or the barrier gets charged twice
      this._stumbleDebt += CLIP_PENALTY;
      this.boostSpeed = 0;
      this._shake = Math.max(this._shake, 0.35);
      if (this._audio) this._audio.playOneShot("impact", { volume: 0.6 });
    }

    state.distance = -this.z;
    this.player.position.set(x, this.y, this.z);

    // the pursuit reads this.z, so it has to run after the clip is applied
    this._updateHandler(dt, state);

    // Interlude I — may set this._shake, so run it before the camera
    this._updateGate(dt);

    // shadow camera follows so shadows stay inside it
    this.key.position.set(x + 6, 14, this.z + 10);
    this.key.target.position.set(x, 0, this.z - 6);

    // camera lerps toward the pivot rather than being parented to it
    const cam = this.game.camera;
    this.camPivot.getWorldPosition(this._tmp);
    cam.position.lerp(this._tmp, 1 - Math.exp(-9 * dt));
    cam.lookAt(x * 0.7, 1.5, this.z - 9);

    // boost widens the FOV — cheapest honest way to sell acceleration.
    // Restored in teardown() since the camera belongs to Game, not the level.
    const fovTarget = this._baseFov + (this.boostSpeed / 10) * 7;
    if (Math.abs(cam.fov - fovTarget) > 0.01) {
      cam.fov += (fovTarget - cam.fov) * (1 - Math.exp(-5 * dt));
      cam.updateProjectionMatrix();
    }

    // camera shake from the gate impact, applied after the lerp so it does
    // not fight the follow maths. Squared falloff lands harder up front.
    if (this._shake > 0) {
      this._shake = Math.max(0, this._shake - dt * 1.6);
      const amp = this._shake * this._shake * 0.7;
      cam.position.x += (Math.random() * 2 - 1) * amp;
      cam.position.y += (Math.random() * 2 - 1) * amp;
    }

    // --- shader 1: speed-warp, driven by current forward speed ---
    // follows a smoothed speed so a stumble or a catch eases the streaks down
    // rather than cutting them in a single frame
    this._displaySpeed += (this.speed - this._displaySpeed) * (1 - Math.exp(-8 * dt));
    const normalizedSpeed = THREE.MathUtils.clamp(this._displaySpeed / this.maxSpeed, 0, 1);
    state.normalizedSpeed = normalizedSpeed; // HUD / other levels can read it
    updateSpeedWarp(this.wallMaterial, dt, normalizedSpeed);

    // strip lights pulse a little faster as speed rises
    const pulse = 1.0 + Math.sin(performance.now() * 0.004 * (1 + normalizedSpeed)) * 0.15;
    for (const light of this.stripLights) light.intensity = 1.1 * pulse;

    // --- footsteps: trigger on stride distance, only while grounded ---
    if (!this.airborne && !this.caught && this._audio) {
      this._strideDistance += this.speed * dt;
      if (this._strideDistance >= this._strideInterval) {
        this._strideDistance = 0;
        this._audio.playFootstep({ volume: 0.4, dt });
      }
    }
  }

  teardown() {
    if (this._audio) {
      this._audio.teardown();
      this._audio = null;
      this._audioReady = false;
    }
    // hand the shared camera back exactly as Game set it up
    if (this.game && this.game.camera) {
      this.game.camera.fov = this._baseFov;
      this.game.camera.updateProjectionMatrix();
    }
    this.scene.fog = null;
    super.teardown();
  }
}