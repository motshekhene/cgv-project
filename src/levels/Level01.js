import * as THREE from "three";
import { Level } from "../core/Level.js";
import { createJungleSpeedWarpMaterial, updateJungleSpeedWarp } from "../shaders/jungleSpeedWarpShader.js";
import { AudioSystem } from "../audio/audioSystem.js";
import {
  loadJungleKit,
  createJungleMaterials,
  buildTrailBase,
  updateTrailChunks,
  createJungleSky,
  createSign,
  createLightShaft,
  createPollen,
  cloneProp,
  makeJungleObstacle,
} from "./level1/jungleWorld.js";

/**
 * Level 01 — The Trail (Jungle Shrine theme).
 *
 * Member 1B owns the environment layer here: world art, lighting/fog,
 * textured materials, Shader 1, atmosphere/audio, obstacle visuals, the
 * collapsing ruin gate and the Level 2 logging-camp handoff.
 *
 * Member 1A's controller contract is intentionally preserved: three lanes,
 * jump, slide, boost/stamina, chase camera, look-back camera, distance-based
 * Handler gap and the three-metre penalty for clipping an obstacle. The old
 * internal obstacle keys (barrier/trolley/duct) remain only so that collision
 * code does not need to change; visually they are a fallen log, a boulder /
 * broken column and a low ruined arch.
 *
 * The selected Jungle Shrine asset bundle lives under assets/jungle and is
 * loaded through AssetRegistry. FBX props are converted to matte PBR materials
 * in level1/jungleWorld.js, while the trail and forest floor use the supplied
 * normal/roughness texture sets.
 */
const LANE_X = [-2.4, 0, 2.4];

/**
 * Tiny seeded PRNG (mulberry32). The obstacle layout is generated rather than
 * hand-placed, but it must be the SAME layout every run — a course you cannot
 * learn is not a course, it is a slot machine.
 */
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- the runway ---
// The pitch sells a "3-4 min first clean run". The old 600 m tunnel ran out in
// 32 s, which is where that claim was dying. With the ramp below, a clean run
// is ~126 s accelerating over the first 2 km and ~59 s at the cap: ~3.1 min.
// The shell runs ~300 m past the finish line so the fog wall always has tunnel
// behind it; without that overhang the last stretch fades into nothing.
const TUNNEL_LENGTH = 3600;
const TUNNEL_START_Z = 40; // shell overhangs the spawn so Kai isn't stood on an edge
const TUNNEL_END_Z = TUNNEL_START_Z - TUNNEL_LENGTH;
const SHELL_CENTER_Z = TUNNEL_START_Z - TUNNEL_LENGTH / 2;
const MAP_REPEAT_Z = TUNNEL_LENGTH / 4; // one texture repeat per 4 m, same as the materials

const SPEED_BASE = 11;

/**
 * Four gears, not one long creep.
 *
 * The old model was SPEED_BASE + a single linear ramp to 22 m/s over 2 km,
 * which is technically "not constant" and reads as constant: 5.5 m/s of change
 * per kilometre is below the threshold where you notice you got faster.
 *
 * These are knots in a piecewise curve, smoothstepped WITHIN each segment. The
 * smoothstep is the whole point — it eases out at the top of a gear so the
 * tunnel settles into a cruise, then surges into the next one. Four distinct
 * sensations instead of one slow drift:
 *
 *   0–300 m     11 m/s    slow    — flat, and long enough to find the controls
 *   300–700      → 16       medium  — first surge; obstacles start mattering
 *   700–1500     → 22       fast    — the old ceiling is now only third gear
 *   1500–2500    → 30       super   — tops out ~650 m before the seal
 *
 * The knots are deliberately front-loaded. A first draft put them at 900 /
 * 1800 / 2900 and the whole run only came out 7 s quicker, because holding
 * 11 m/s for the first 300 m then easing gently upwards left the 300–900 m
 * stretch actually SLOWER than the old linear ramp had been. Pulling each knot
 * in means the only stretch below the old curve is the opening 300 m, which is
 * the bit that is supposed to be slow.
 *
 * The Handler runs at baseSpeed too, so the pursuit balance is untouched: the
 * gap still only moves on a clip or a boost, at every gear.
 */
const SPEED_GEARS = [
  { at: 0, speed: SPEED_BASE },
  { at: 300, speed: SPEED_BASE },
  { at: 700, speed: 16 },
  { at: 1500, speed: 22 },
  { at: 2500, speed: 30 },
];
const SPEED_TOP = SPEED_GEARS[SPEED_GEARS.length - 1].speed;
const BOOST_TOP = 10; // m/s boost adds on top of whatever gear he is in

/** Base speed at `distance` metres in, walking the gear table above. */
function speedForDistance(distance) {
  if (distance <= SPEED_GEARS[0].at) return SPEED_GEARS[0].speed;
  for (let i = 1; i < SPEED_GEARS.length; i++) {
    const a = SPEED_GEARS[i - 1];
    const b = SPEED_GEARS[i];
    if (distance < b.at) {
      const t = THREE.MathUtils.smoothstep(distance, a.at, b.at);
      return THREE.MathUtils.lerp(a.speed, b.speed, t);
    }
  }
  return SPEED_TOP;
}

// --- emergency strips ---
// These are pooled, not placed. 30 strips over 600 m meant 10 point lights;
// the same density over 3.6 km would have been 180 strips and 60 lights, and
// the risk slide budgets one shadow-caster and a lab GPU. Instead a fixed
// handful leapfrog ahead of Kai, which is the chunk streamer in miniature.
const STRIP_SPACING = 20;
const STRIP_BEHIND = 40; // metres kept lit behind Kai
// The pool's forward reach is (POOL - 1) * SPACING - BEHIND - r, where r is how
// far Kai is into his current 20 m slot. At POOL = 12 that bottomed out at
// 160 m, just short of the 165 m fog wall, so strips popped into view in the
// haze. 13 keeps the worst case at 180 m.
const STRIP_POOL = 13;
// A cap, not a count: the loop assigns lights to lit slots nearest-first, so
// the fourth-nearest is the furthest that gets one and anything past it is deep
// in fog anyway. Fixing the cap is what keeps the live light count constant.
const STRIP_LIGHT_POOL = 4;

// --- security gate (Interlude I) ---
const GATE_Z = -3150; // near the end, so the slam reads as the way out closing
const GATE_OPEN_Y = 6.9; // bars retracted above the ceiling underside (6.75)
const GATE_WARN_RANGE = 48; // metres out where the amber telegraph starts
// Fires the instant Kai crosses the gate PLANE, not three metres past it.
// That three metres was the whole reason the seal was unreliable: the Handler
// sits at Kai's z + gap, so a trigger at GATE_Z - 3 meant he was only behind
// the bars if the gap happened to exceed ~3.3 m, and a player being chased
// closely — the one case worth watching — got no seal at all. Firing at the
// plane means any gap above zero puts him on the approach side, and a gap of
// zero is a catch, so there is no gap left where it can fail.
const GATE_TRIGGER_Z = GATE_Z;

// --- the look-back camera ---
// The camera pivot orbits the player about his own Y axis: 0 rad is the usual
// chase position behind him, PI rad is in FRONT of him looking back down the
// tunnel. Blending through the side gives a whip pan rather than a cut.
const CAM_RADIUS = 7.4; // matches the original pivot offset, so forward view is unchanged
const CAM_RADIUS_BACK = 5.6; // pulled in when facing backwards, so Kai still frames
const CAM_HEIGHT = 2.5;
const CAM_HEIGHT_BACK = 3.0; // lifted so the view is over his shoulder, not through him
const LOOK_SWING_RATE = 5.4; // per second; ~0.35 s to complete the swing
// The gate slams behind Kai, so without taking the camera the whole interlude
// is an amber flash on the walls. The pitch sanctions exactly this: "the camera
// is only taken away from you at the exact moment you win." Long enough to see
// the bars fall (0.64 s), both rebounds, and the Handler arrive at them.
const AUTO_LOOK_TIME = 2.4;

// --- the southbound ---
// "HE CATCHES YOU, OR THE SOUTHBOUND DOES." This is not a mistake you pay
// three metres for — it is the run. It fills two of the three lanes, which
// keeps it inside the existing lane system and is the read players already
// have, and the surviving lane is always an outer one so the blocked pair is
// a single contiguous box.
const TRAIN_TRIGGERS = [-800, -1700, -2550]; // Kai's z when each southbound is dispatched
const TRAIN_SPAWN_AHEAD = 300; // metres down-tunnel it appears — well past the 165 m fog wall
const TRAIN_SPEED = 24;
const TRAIN_CARS = 3;
const TRAIN_CAR_LEN = 15;
const TRAIN_CAR_GAP = 0.8;
const TRAIN_LEN = TRAIN_CARS * TRAIN_CAR_LEN + (TRAIN_CARS - 1) * TRAIN_CAR_GAP;
const TRAIN_HALF_X = 1.9; // covers two lane centres and leaves 0.86 m of clearance in the third
const TRAIN_CENTER_OFFSET = 1.2; // so the box spans -0.7..3.1 (or the mirror), hugging one wall
const TRAIN_TOP_Y = 3.6; // a jump apex only lifts Kai's feet to 2.07, so it is not jumpable
const TRAIN_DESPAWN_BEHIND = 70; // metres past Kai before the pool is recycled
// Obstacles are deleted from this window past each trigger. Where Kai and the
// train actually meet depends on his speed — 94 m past the trigger at the base
// 11 m/s, 171 m at a boosted 32 — and a barrier sitting in the one surviving
// lane inside that window would be unsurvivable through no fault of the player.
// The far edge is set past the meeting point on purpose: at 32 m/s the rake
// clears the 165 m fog wall while its nose is still 242 m past the trigger, and
// a train visibly passing THROUGH a barrier is worse than an empty stretch.
const TRAIN_ZONE_NEAR = 55;
const TRAIN_ZONE_FAR = 250;

// --- the way out ---
const BAY_Z = -3260; // service bay, ~110 m past the seal: a beat to breathe
// Fires at the mouth of the bay rather than at the vehicle, because he needs
// ~7 m to pull up from full speed and stopping ten metres past the thing you
// were running for reads as an overshoot, not an arrival.
const ESCAPE_Z = BAY_Z + 4;
const ESCAPE_DECEL = 34; // m/s^2; ~0.65 s and 7 m to a standstill
// He pulls up in 0.65 s, so this is the beat AFTER that: long enough to read
// the bay, the work light and the vehicle he is about to steal before Redline
// takes over. Reaching the vehicle is not an ending, it is the handoff — level
// 02 is the same chase in a van.
const ESCAPE_HANDOFF_TIME = 2.2;

// --- boost / stamina tuning ---
const BOOST_DRAIN = 28; // stamina per second while boosting
const BOOST_REGEN = 22; // stamina per second while not
const BOOST_UNLOCK = 0.45; // fraction of the pool needed to boost again after running dry
const SLIDE_TIME = 0.6; // seconds a slide lasts

// --- obstacle clipping ---
// Kai is a capsule of radius 0.34 whose base rests 0.31 above the rig origin
// and whose crown reaches 1.79. A slide squashes that band to 0.15..0.85.
const PLAYER_RADIUS = 0.34;
const PLAYER_FEET_Y = 0.31;
const PLAYER_HEAD_Y = 1.79;
const SLIDE_FEET_Y = 0.15;
const SLIDE_HEAD_Y = 0.85;
const CLIP_PAD_X = PLAYER_RADIUS; // added to each kind's own half-extent
const CLIP_PAD_Z = PLAYER_RADIUS;

/**
 * Jungle Shrine obstacle collision bands. Internal keys are kept for
 * compatibility with 1A's existing collision code:
 *   barrier -> fallen log: jump or change lane
 *   trolley -> boulder / broken column: change lane
 *   duct    -> low ruined arch: slide
 */
const OBSTACLE_KINDS = {
  // Internal names stay unchanged so 1A's collision/controller code is untouched.
  // Visually these are Jungle Shrine hazards: log, boulder/column and low arch.
  barrier: { halfX: 0.72, halfZ: 0.45, loY: 0, hiY: 0.95, meshY: 0 },
  trolley: { halfX: 0.72, halfZ: 0.62, loY: 0, hiY: 2.25, meshY: 0 },
  duct: { halfX: 3.8, halfZ: 0.5, loY: 1.05, hiY: 5.2, meshY: 0 },
};

// --- obstacle placement ---
const OBSTACLE_FIRST_Z = -140; // a calm runway to find the controls in
const OBSTACLE_LAST_Z = GATE_Z + 90; // stop short of the seal so Interlude I is clean
const OBSTACLE_GAP_START = 58; // metres between sites at the top of the level...
// ...and by the end. This is the difficulty ramp, and it is spacing in METRES
// while difficulty is really spacing in SECONDS. 26 m was 1.18 s of reaction
// time at the old 22 m/s ceiling; at the new 30 m/s top gear the same 26 m is
// 0.87 s, and 0.65 s boosting, which is under human reaction time for a lane
// read. 34 m restores ~1.13 s at top gear, so the last gear is faster without
// also being unreadable — the speed is the difficulty, not the ambush.
const OBSTACLE_GAP_END = 34;
const OBSTACLE_SEED = 20260911;
// Meshes kept alive per kind. The busiest 240 m window of the generated course
// wants 9 barriers, so 8 was one short and the ninth silently went undrawn.
const OBSTACLE_POOL = 12;
const OBSTACLE_BEHIND = 30; // metres behind Kai a mesh stays drawn
const OBSTACLE_AHEAD = 210; // ...and ahead, past the fog wall

// --- the Handler ---
// "He does not run faster than you. He just never slows down." So he is a
// constant-speed follower matched to Kai's cruise, not an AI — there is no
// state machine here for whoever owns the pursuer to collide with.
const HANDLER_START_GAP = 15; // metres, straight off the pitch
const HANDLER_MAX_GAP = 24; // boosting must not make him irrelevant
const HANDLER_LIGHT_RANGE = 30; // gap at which his glow starts to register
const HANDLER_BAR_STANDOFF = 1.3; // where he ends up once the bars stop him
const HANDLER_SEAL_SPEED = 26; // he closes the last stretch to the bars at this
const HANDLER_SEALED_GLOW = 0.9; // fraction of full glow held at the bars, so he stays visible
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
    // Speed is no longer a constant, and no longer one linear creep either:
    // baseSpeed steps through SPEED_GEARS with distance and boost stacks on
    // top, so Shader 1's uSpeed sweeps its whole range across the level.
    this.baseSpeed = SPEED_BASE;
    this.boostSpeed = 0;
    this.speed = this.baseSpeed;
    // normalisation ceiling for the speed-warp uniform: top gear plus a full
    // boost, so uSpeed only reaches 1.0 boosting in the last gear
    this.maxSpeed = SPEED_TOP + BOOST_TOP;
    this.boosting = false;
    // Once stamina runs dry the boost locks out until it has regenerated to
    // BOOST_UNLOCK. Without this, spendStamina() fails and succeeds on
    // alternating frames and the boost (and the FOV kick) flickers at 30 Hz.
    this._boostLocked = false;
    // Handler pursuit — the whole of level 01's tension
    this.gap = HANDLER_START_GAP;
    // caught means "the run is lost", whichever of the two got him; failCause
    // is what tells them apart
    this.caught = false;
    this.failCause = null;
    this.escaped = false;
    this._escapeSpeed = 0; // the speed he arrived at the bay with, ramped to 0
    this._handOff = 0; // counts down once he has stopped, then Redline takes over
    this._handedOff = false;
    this._handlerSealed = false;
    this._handlerBarZ = 0; // latched when the bars fire, so he never pops backwards
    this._obsCursor = 0; // index of the nearest obstacle not yet behind Kai
    this._stumbleDebt = 0; // metres of ground still owed from clipping a barrier
    // speed the shader/lights follow, smoothed so the streaks ease rather than
    // snapping when Kai stumbles or gets caught
    this._displaySpeed = SPEED_BASE;
    this.lane = 1;
    this.laneFrom = 1;
    this.laneT = 1;
    this.y = 0;
    this.vy = 0;
    this.airborne = false;
    this.sliding = false;
    this._slideT = 0;
    this._bodySquash = 1;

    this.obstacles = [];
    this.securityGate = null;
    this.serviceVehicle = null;

    // the southbound — one pooled rake reused for every event, since two are
    // never on the track at once
    this.train = null;
    this._trainEvents = [];
    this._trainIdx = 0;
    this._trainActive = false;
    this._trainCenterX = 0; // which pair of lanes the live rake is filling

    // look-back camera: 0 is the chase view, 1 is facing the way he came
    this._lookBack = 0;
    this._autoLook = 0; // seconds of scripted look-back still owed

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

  async init(scene, assets, input, state) {
    super.init(scene, assets, input, state);

    scene.background = new THREE.Color(0xcfd6a8);
    scene.fog = new THREE.FogExp2(0xcfd6a8, 0.014);
    this.root.add(createJungleSky());

    const hemi = new THREE.HemisphereLight(0xbfdcff, 0x4a5a26, 0.6);
    this.root.add(hemi);

    this.key = new THREE.DirectionalLight(0xffd29a, 4.5);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.camera.left = -16;
    this.key.shadow.camera.right = 16;
    this.key.shadow.camera.top = 16;
    this.key.shadow.camera.bottom = -16;
    this.key.shadow.camera.near = 1;
    this.key.shadow.camera.far = 130;
    this.root.add(this.key, this.key.target);

    this._jungleKit = await loadJungleKit(assets);
    const mats = await createJungleMaterials(assets, TUNNEL_LENGTH);
    this._jungleMats = mats;
    this._buildTunnel(mats);
    this._trainEvents = [];
    this._trainActive = false;
    this._buildObstacles(mats);
    this._buildSecurityGate(mats);
    this._buildServiceArea(mats);
    this._buildHandler();

    // Player/camera hierarchy remains 1A-owned and is deliberately unchanged.
    this.player = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.34, 0.8, 4, 10),
      new THREE.MeshStandardMaterial({ color: 0x24384f, roughness: 0.55 }),
    );
    body.position.y = 1.05;
    body.castShadow = true;
    this.body = body;
    this.player.add(body);

    this.camPivot = new THREE.Object3D();
    this.camPivot.position.set(0, CAM_HEIGHT, CAM_RADIUS);
    this.player.add(this.camPivot);
    this.root.add(this.player);

    this._tmp = new THREE.Vector3();
    this._tmpAim = new THREE.Vector3();
    this._tmpBack = new THREE.Vector3();
    this._baseFov = this.game && this.game.camera ? this.game.camera.fov : 62;
    this._ensureAudio();
  }

  _buildTunnel(mats) {
    const world = buildTrailBase(this.root, this._jungleKit, mats, {
      length: TUNNEL_LENGTH,
      centerZ: SHELL_CENTER_Z,
    });
    this.floor = world.trail;
    this._trailChunks = world.chunks;

    const signs = [
      [-2.7, -72, "SITE 7 →"],
      [2.8, -1120, "SITE 7 →"],
      [-2.8, -2240, "SITE 7 →"],
    ];
    for (const [x, z, text] of signs) {
      const sign = createSign(text);
      sign.position.set(x, 0, z);
      sign.rotation.y = x < 0 ? 0.12 : -0.12;
      this.root.add(sign);
    }

    this.speedWarpMaterial = createJungleSpeedWarpMaterial();
    this._speedWarpGroup = new THREE.Group();
    const ribbonGeo = new THREE.PlaneGeometry(1.6, 220);
    for (const x of [-3.15, 3.15]) {
      const ribbon = new THREE.Mesh(ribbonGeo, this.speedWarpMaterial);
      ribbon.rotation.x = -Math.PI / 2;
      ribbon.position.set(x, 0.035, -90);
      this._speedWarpGroup.add(ribbon);
    }
    this.root.add(this._speedWarpGroup);

    this._shaftGroup = new THREE.Group();
    for (const [x, z, width] of [[-1.3, -15, 1.6], [2.4, -52, 2.1], [-2.5, -92, 1.8]]) {
      const shaft = createLightShaft(width);
      shaft.position.set(x, 28, z);
      this._shaftGroup.add(shaft);
    }
    this.root.add(this._shaftGroup);

    this._pollen = createPollen(500);
    this.root.add(this._pollen);
  }

  _updateTunnelDetail(pulse) {
    updateTrailChunks(this._trailChunks, this.z, 30);
    if (this._speedWarpGroup) this._speedWarpGroup.position.z = this.z;
    if (this._shaftGroup) {
      this._shaftGroup.position.z = this.z - 18;
      for (const shaft of this._shaftGroup.children) {
        if (shaft.material?.uniforms?.uOpacity) {
          shaft.material.uniforms.uOpacity.value = 0.11 + (pulse - 0.85) * 0.05;
        }
      }
    }
    if (this._pollen) {
      this._pollen.position.z = this.z - 48;
      this._pollen.rotation.y += 0.0008;
    }
  }

  _buildObstacles(mats) {
    const rng = makeRng(OBSTACLE_SEED);
    const span = OBSTACLE_LAST_Z - OBSTACLE_FIRST_Z;
    this.obstacles.length = 0;
    this._obsCursor = 0;

    let z = OBSTACLE_FIRST_Z;
    while (z > OBSTACLE_LAST_Z) {
      const t = THREE.MathUtils.clamp((z - OBSTACLE_FIRST_Z) / span, 0, 1);
      const roll = rng();
      let kind = "barrier";
      if (t > 0.28 && roll < 0.22) kind = "duct";
      else if (t > 0.12 && roll < 0.55) kind = "trolley";

      if (kind === "duct") {
        this._addObstacle("duct", 1, z);
      } else {
        const lane = Math.floor(rng() * 3);
        this._addObstacle(kind, lane, z);
        if (t > 0.45 && rng() < 0.3) {
          const other = (lane + 1 + Math.floor(rng() * 2)) % 3;
          this._addObstacle(rng() < 0.5 ? "barrier" : kind, other, z);
        }
      }

      let step = OBSTACLE_GAP_START + (OBSTACLE_GAP_END - OBSTACLE_GAP_START) * t;
      if (kind === "duct") step += 14;
      z -= step * (0.85 + rng() * 0.3);
    }

    this._obstacleMeshes = {};
    for (const kind of Object.keys(OBSTACLE_KINDS)) {
      const pool = [];
      for (let i = 0; i < OBSTACLE_POOL; i++) {
        const visual = makeJungleObstacle(kind, this._jungleKit, mats.stone);
        visual.visible = false;
        visual.userData.isObstacle = true;
        visual.userData.kind = kind;
        this.root.add(visual);
        pool.push(visual);
      }
      this._obstacleMeshes[kind] = pool;
    }
  }

  _addObstacle(kind, lane, z) {
    const spec = OBSTACLE_KINDS[kind];
    this.obstacles.push({
      kind,
      lane,
      z,
      x: LANE_X[lane],
      halfX: spec.halfX,
      halfZ: spec.halfZ,
      loY: spec.loY,
      hiY: spec.hiY,
      meshY: spec.meshY,
      clipped: false, // a barrier is only ever charged once
    });
  }

  /**
   * Hands the pooled meshes to whichever placements are near Kai, nearest
   * first. Also advances _obsCursor past anything well behind him, which is
   * what keeps _clipObstacles() O(few) rather than O(course).
   *
   * If a window ever wants more of one kind than the pool holds, the furthest
   * ones simply go undrawn — they are beyond the fog wall anyway.
   */
  _updateObstacleVisuals() {
    while (
      this._obsCursor < this.obstacles.length &&
      this.obstacles[this._obsCursor].z > this.z + OBSTACLE_BEHIND
    ) {
      this._obsCursor++;
    }

    const used = { barrier: 0, trolley: 0, duct: 0 };
    const horizon = this.z - OBSTACLE_AHEAD;

    for (let i = this._obsCursor; i < this.obstacles.length; i++) {
      const o = this.obstacles[i];
      if (o.z < horizon) break; // sorted, so nothing past this is in view either
      const pool = this._obstacleMeshes[o.kind];
      if (used[o.kind] >= pool.length) continue;
      const mesh = pool[used[o.kind]++];
      mesh.position.set(o.x, o.meshY, o.z);
      mesh.visible = true;
    }

    for (const kind of Object.keys(this._obstacleMeshes)) {
      const pool = this._obstacleMeshes[kind];
      for (let i = used[kind]; i < pool.length; i++) pool[i].visible = false;
    }
  }

  /**
   * The southbound. Plans where the trains are dispatched, then builds ONE rake
   * and reuses it — the triggers are far enough apart that two are never on the
   * track at the same time, so a pool of one is the whole pool.
   *
   * Unlike the barriers this is a moving hazard, so it gets its own swept test
   * in _updateTrain() rather than living in this.obstacles.
   */
  _buildTrain() {
    this._trainEvents = [];
    this._trainIdx = 0;
    this._trainActive = false;
    this.train = null;
  }

  _inTrainZone(z) {
    for (const ev of this._trainEvents) {
      if (z <= ev.triggerZ - TRAIN_ZONE_NEAR && z >= ev.triggerZ - TRAIN_ZONE_FAR) return true;
    }
    return false;
  }

  /**
   * Dispatches, drives and tests the southbound.
   *
   * @returns {boolean} true on the frame Kai is hit — which ends the run,
   *   rather than costing three metres like a barrier does.
   */
  _updateTrain(dt, x, prevZ) {
    if (
      !this._trainActive &&
      this._trainIdx < this._trainEvents.length &&
      this.z <= this._trainEvents[this._trainIdx].triggerZ
    ) {
      const ev = this._trainEvents[this._trainIdx++];
      // clear lane 0 means the rake hugs the +x wall, and the mirror for lane 2
      this._trainCenterX = ev.clearLane === 0 ? TRAIN_CENTER_OFFSET : -TRAIN_CENTER_OFFSET;
      this.train.position.set(this._trainCenterX, 0, this.z - TRAIN_SPAWN_AHEAD);
      this.train.visible = true;
      this._trainActive = true;
      if (this._audio) this._audio.playOneShot("train", { volume: 0.5 });
    }

    if (!this._trainActive) return false;

    const prevNose = this.train.position.z;
    const nose = prevNose + TRAIN_SPEED * dt; // it comes the other way, up +z
    this.train.position.z = nose;

    // headlamp swells as it closes, so the pass is a blast rather than a
    // constant glow. Squared, for the same reason the Handler's is.
    const closeness = 1 - THREE.MathUtils.clamp((this.z - nose) / 120, 0, 1);
    this.trainLight.intensity = 0.4 + closeness * closeness * 5.5;

    // recycled once the whole rake is clear behind him
    if (nose - TRAIN_LEN > this.z + TRAIN_DESPAWN_BEHIND) {
      this.train.visible = false;
      this.trainLight.intensity = 0;
      this._trainActive = false;
      return false;
    }

    if (this.caught || this.escaped) return false;

    // Both are moving, and toward each other, so test in the relative frame: g
    // is Kai's z minus the nose's and can only ever decrease. He is inside the
    // rake while g is within [-(TRAIN_LEN + pad), +pad], so this frame is a hit
    // if that band falls anywhere between g at the start and g at the end.
    // Closing speed peaks at 32 + 24 = 56 m/s, which is 2.8 m on a clamped
    // 0.05 s frame, so an end-position test would miss the nose outright.
    const pad = PLAYER_RADIUS;
    const gStart = prevZ - prevNose;
    const gEnd = this.z - nose;
    if (gEnd > pad) return false; // not reached yet
    if (gStart < -(TRAIN_LEN + pad)) return false; // already behind him

    if (Math.abs(x - this._trainCenterX) >= TRAIN_HALF_X + pad) return false; // in the clear lane
    // stated rather than assumed: nothing in the level lifts his feet to 3.6,
    // so this never saves him, but the test belongs here not in a comment
    const feet = this.y + (this.sliding ? SLIDE_FEET_Y : PLAYER_FEET_Y);
    if (feet >= TRAIN_TOP_Y) return false;

    return true;
  }

  /** Sector seal near the end of the tunnel. Starts retracted into the ceiling; _updateGate() slams it shut behind Kai as Interlude I. */
  _buildSecurityGate(mats) {
    const gateGroup = new THREE.Group();
    gateGroup.position.set(0, 0, GATE_Z);

    const arch = cloneProp(this._jungleKit.gateArch);
    arch.scale.setScalar(0.024);
    arch.position.y = -0.05;
    gateGroup.add(arch);

    const slide = new THREE.Group();
    slide.position.y = GATE_OPEN_Y;
    const door = cloneProp(this._jungleKit.gateDoor);
    door.scale.setScalar(0.024);
    door.position.y = -0.15;
    slide.add(door);
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.55, 0.65), mats.stone);
    crossbar.position.y = 1.1;
    crossbar.castShadow = true;
    slide.add(crossbar);
    gateGroup.add(slide);

    const warningMat = new THREE.MeshStandardMaterial({
      color: 0x7a4f23,
      emissive: 0xff8a3d,
      emissiveIntensity: 0.6,
      roughness: 0.7,
    });
    const warning = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.16, 0.18), warningMat);
    warning.position.set(0, 4.2, 0.25);
    gateGroup.add(warning);

    const gateLight = new THREE.PointLight(0xffa63d, 1.4, 28, 2);
    gateLight.position.set(0, 4.0, 1.5);
    gateGroup.add(gateLight);

    gateGroup.userData.isSecurityGate = true;
    gateGroup.userData.open = true;
    this.securityGate = gateGroup;
    this._gateSlide = slide;
    this._gateLight = gateLight;
    this._gateLightBase = 1.4;
    this._gateMaterial = warningMat;
    this.root.add(gateGroup);
  }

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
        // Take the camera. The gate is 3 m BEHIND him when it fires, so with the
        // camera left where it is the entire interlude is an amber flash on the
        // walls — which is exactly what it looked like. The pitch sanctions
        // this one grab: "the camera is only taken away from you at the exact
        // moment you win."
        this._autoLook = AUTO_LOOK_TIME;
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

  /** The maintenance bay + parked vehicle that Level 2 picks up from, and Level 1's finish line. */
  _buildServiceArea(mats) {
    const camp = new THREE.Group();
    camp.position.set(0, 0, BAY_Z);

    const clearingMat = mats.trail.clone();
    const clearing = new THREE.Mesh(new THREE.CircleGeometry(11, 32), clearingMat);
    clearing.rotation.x = -Math.PI / 2;
    clearing.position.y = 0.02;
    clearing.receiveShadow = true;
    camp.add(clearing);

    const propData = [
      [this._jungleKit.logs, -5.2, -4.0, 4.0, 0.4],
      [this._jungleKit.logs, 5.5, -8.0, 4.0, -0.25],
      [this._jungleKit.crates, -5.4, -8.5, 14.0, 0.6],
      [this._jungleKit.barrel, 4.7, -3.2, 14.0, -0.4],
      [this._jungleKit.cutTrees, 7.0, -11.0, 8.0, 0.2],
    ];
    for (const [proto, x, z, scale, ry] of propData) {
      const o = cloneProp(proto);
      o.position.set(x, 0, z);
      o.scale.setScalar(scale);
      o.rotation.y = ry;
      camp.add(o);
    }

    const vehicle = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a91b8, roughness: 0.55, metalness: 0.15 });
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x111315, roughness: 0.95 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.65, 4.1), bodyMat);
    base.position.y = 0.8;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 1.8), bodyMat);
    cab.position.set(0, 1.4, -0.65);
    vehicle.add(base, cab);
    for (const x of [-1.08, 1.08]) for (const z of [-1.25, 1.25]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.24, 14), tyreMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.5, z);
      vehicle.add(wheel);
    }
    vehicle.position.set(0, 0, -6);
    vehicle.rotation.y = Math.PI;
    vehicle.userData.isServiceVehicle = true;
    vehicle.userData.startsLevel2 = true;
    camp.add(vehicle);

    const workLight = new THREE.PointLight(0xffd39b, 2.1, 22, 2);
    workLight.position.set(0, 5, -6);
    camp.add(workLight);

    this.serviceVehicle = vehicle;
    this.root.add(camp);
  }

  _buildHandler() {
    const group = new THREE.Group();
    const coatMat = new THREE.MeshStandardMaterial({ color: 0x182018, roughness: 0.95, metalness: 0.02 });
    const coat = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.15, 6, 12), coatMat);
    coat.position.y = 1.15;
    coat.castShadow = true;
    group.add(coat);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), coatMat);
    head.position.y = 1.98;
    group.add(head);

    const torch = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffc477, fog: false }),
    );
    torch.position.set(0.28, 1.55, -0.4);
    group.add(torch);

    const beam = new THREE.SpotLight(0xffc071, 7.5, 34, 0.33, 0.55, 1.6);
    beam.position.set(0.25, 1.62, -0.35);
    beam.target.position.set(0, 0.9, -14);
    group.add(beam, beam.target);

    const glow = new THREE.PointLight(0xff9b51, 0, 26, 2);
    glow.position.set(0, 2.2, 1.2);
    group.add(glow);

    group.position.set(0, 0, HANDLER_START_GAP);
    group.userData.isHandler = true;
    this.handler = group;
    this.handlerLight = glow;
    this._handlerLightBase = 2.8;
    this.root.add(group);
  }

  _clipObstacles(x, prevZ) {
    const feet = this.y + (this.sliding ? SLIDE_FEET_Y : PLAYER_FEET_Y);
    const head = this.y + (this.sliding ? SLIDE_HEAD_Y : PLAYER_HEAD_Y);

    for (let i = this._obsCursor; i < this.obstacles.length; i++) {
      const o = this.obstacles[i];

      // he travels down -z, so the near face is the one with the greater z.
      // The list is sorted descending, so if he hasn't reached this one he
      // hasn't reached anything past it either.
      if (o.z + o.halfZ + CLIP_PAD_Z < this.z) break;

      if (o.clipped) continue; // already paid for this one
      if (prevZ <= o.z - o.halfZ - CLIP_PAD_Z) continue; // already behind him
      if (Math.abs(x - o.x) >= o.halfX + CLIP_PAD_X) continue; // dodged by lane
      if (feet >= o.hiY || head <= o.loY) continue; // jumped over it, or slid under

      o.clipped = true;
      return o;
    }
    return null;
  }

  /**
   * Advances the pursuit. The gap only moves because Kai is faster or slower
   * than the Handler's cruise, so boost buys metres and stumbling spends them
   * — there is no separate bookkeeping to disagree with the physics.
   */
  _updateHandler(dt, state) {
    // Interlude I takes him out of the race: "He doesn't make it. The seal
    // locks." The seal begins the moment the bars start FALLING rather than
    // once they have settled, because the point of the beat is watching him
    // arrive at them — pinning him only after the rebounds teleported him the
    // last twenty metres behind the impact flash, which is why it looked like
    // he simply blinked out.
    //
    // It is now UNCONDITIONAL. There used to be a `_handlerThrough` escape
    // hatch for the case where he was already past the bars' plane when they
    // fired, and it was reachable whenever the gap was under ~3.3 m — i.e.
    // exactly when he was close enough to be worth looking at. Worse, the
    // pursuit below is gated on `!this.escaped`, so a Handler who came through
    // had his gap frozen at the bay while the last line of this method kept
    // welding his z to Kai's: he slid to a halt three metres behind a stopped
    // player and stood there. Both of them parked at the vehicle, forever.
    //
    // GATE_TRIGGER_Z is now the gate plane itself, so a Handler at Kai's z plus
    // any positive gap is on the approach side by construction. He is sealed,
    // every time, at any gap.
    if (!this._handlerSealed && (this._gatePhase === "slamming" || this._gatePhase === "closed")) {
      this._handlerSealed = true;
      state.handlerState = "SEALED";
      // Where he comes to rest. Normally the standoff in front of the bars, but
      // never further back than he already is: a Handler who was 1 m off Kai's
      // heels is inside the standoff already, and walking him backwards to it
      // would be a visible pop with the camera swung round watching him.
      this._handlerBarZ = Math.min(this.handler.position.z, GATE_Z + HANDLER_BAR_STANDOFF);
    }

    if (this._handlerSealed) {
      // He keeps running until the bars stop him and then STAYS there, lit, so
      // the interlude reads as him being cut off. Zeroing his light here is
      // what made the seal look like a disappearing act.
      this.handler.position.z = Math.max(
        this._handlerBarZ,
        this.handler.position.z - HANDLER_SEAL_SPEED * dt,
      );
      this.gap = Math.max(0, this.handler.position.z - this.z);
      state.handlerGap = this.gap;
      // held, not faded with distance: he is the thing the camera has just been
      // swung round to look at
      this.handlerLight.intensity = this._handlerLightBase * HANDLER_SEALED_GLOW;
      return;
    }

    if (!this.caught && !this.escaped) {
      const handlerSpeed = this.baseSpeed + HANDLER_CREEP;
      this.gap = Math.min(HANDLER_MAX_GAP, this.gap + (this.speed - handlerSpeed) * dt);

      if (this.gap <= 0) {
        this.gap = 0;
        this.caught = true;
        this.failCause = "handler";
        this.finished = true; // no reader in Game yet — see the header note
        state.alive = false;
        state.failCause = "handler";
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

  /**
   * Hands the run to Redline. The service vehicle is the literal bridge between
   * the two levels — level 02 is Kai driving the thing parked in this bay — so
   * the chase continues rather than stopping on a win screen.
   *
   * Two hazards, both handled here rather than in Game.js:
   *
   *   1. setLevel() calls teardown() on THIS level, and we are inside its own
   *      update(). Disposing our geometry with our own stack frame still live
   *      would leave the rest of update() writing to freed objects, so the swap
   *      is deferred to a microtask — it lands after Game._frame() has finished
   *      rendering, between frames.
   *   2. setLevel() assigns this.level BEFORE awaiting init(), so an async
   *      init would leave Game updating a half-built level. Pausing across the
   *      swap closes that window; Level02's init is currently synchronous, but
   *      that is not a promise anyone made us.
   */
  _startLevel02() {
    const game = this.game;
    if (!game || !game.levels || !game.levels.has("level02")) {
      // running level 01 on its own, e.g. from a test page. Stay put rather
      // than throwing out of a rAF callback.
      console.warn("[level01] reached the vehicle, but no level02 is registered");
      return;
    }

    game.setPaused(true);
    Promise.resolve().then(async () => {
      try {
        await game.setLevel("level02");
      } catch (err) {
        console.error("[level01] handoff to level02 failed", err);
      } finally {
        game.setPaused(false);
      }
    });
  }

  /** Grabs the game camera for the AudioListener once it exists — safe to call every frame until it succeeds. */
  _ensureAudio() {
    if (this._audioReady) return;
    const camera = this.game && this.game.camera;
    if (!camera) return;

    this._audio = new AudioSystem(camera);
    this._audioReady = true;
    const ctx = this._audio.listener.context;

    const makeBuffer = (seconds, sampleFn) => {
      const rate = ctx.sampleRate;
      const n = Math.max(1, Math.floor(seconds * rate));
      const buffer = ctx.createBuffer(1, n, rate);
      const out = buffer.getChannelData(0);
      for (let i = 0; i < n; i++) out[i] = sampleFn(i / rate, i, n);
      return buffer;
    };

    let brown = 0;
    const ambience = makeBuffer(6, (t) => {
      brown = (brown + (Math.random() * 2 - 1) * 0.035) / 1.025;
      const insects = Math.sin(t * Math.PI * 2 * 3100) * (Math.sin(t * Math.PI * 2 * 0.73) > 0.84 ? 0.02 : 0);
      return THREE.MathUtils.clamp(brown * 0.09 + insects, -0.22, 0.22);
    });
    const footstep = makeBuffer(0.2, (t) => {
      const e = Math.exp(-t * 24);
      return ((Math.random() * 2 - 1) * 0.45 + Math.sin(t * Math.PI * 2 * 78) * 0.5) * e;
    });
    const impact = makeBuffer(0.32, (t) => {
      const e = Math.exp(-t * 16);
      return ((Math.random() * 2 - 1) * 0.4 + Math.sin(t * Math.PI * 2 * 58) * 0.75) * e;
    });
    const gateSlam = makeBuffer(0.9, (t) => {
      const e = Math.exp(-t * 6.5);
      return ((Math.random() * 2 - 1) * 0.55 + Math.sin(t * Math.PI * 2 * 43) * 0.8) * e;
    });
    const breath = makeBuffer(2.4, (t) => {
      const phase = (t % 1.2) / 1.2;
      const env = Math.pow(Math.sin(Math.PI * phase), 2);
      return (Math.random() * 2 - 1) * 0.12 * env;
    });
    const catchSting = makeBuffer(0.55, (t) => {
      const e = Math.exp(-t * 8);
      return (Math.sin(t * Math.PI * 2 * (95 - t * 70)) * 0.7 + (Math.random() * 2 - 1) * 0.2) * e;
    });

    this._audio.buffers.set("ambience", ambience);
    this._audio.buffers.set("footstep", footstep);
    this._audio.buffers.set("impact", impact);
    this._audio.buffers.set("gateSlam", gateSlam);
    this._audio.buffers.set("handlerBreath", breath);
    this._audio.buffers.set("handlerCatch", catchSting);

    const resume = () => ctx.resume();
    this._resumeAudio = resume;
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });

    this._audio.playAmbience("ambience", { volume: 0.28 });
    if (this.handler) {
      this._audio.attachPositional(this.handler, "handlerBreath", {
        volume: 0.6,
        refDistance: 7,
        maxDistance: HANDLER_LIGHT_RANGE,
      });
    }
  }

  update(dt, state) {
    const input = this.input;

    if (!this._audioReady) this._ensureAudio();

    // --- speed: the gear table + boost, both feeding Shader 1 ---
    // A single linear ramp to 22 m/s over 2 km was "not constant" on paper and
    // constant in the hand. speedForDistance() steps him through four gears
    // instead, easing within each one so every change of gear is felt.
    this.baseSpeed = speedForDistance(-this.z);

    // boost burns the shared stamina pool so 3B's HUD reads it for free
    const wantsBoost = input.isDown("boost");
    if (this._boostLocked && state.stamina >= state.maxStamina * BOOST_UNLOCK) {
      this._boostLocked = false;
    }
    this.boosting = wantsBoost && !this._boostLocked && state.spendStamina(BOOST_DRAIN * dt);
    // held the key but the pool just ran out — lock it until it recovers
    if (wantsBoost && !this.boosting && !this._boostLocked) this._boostLocked = true;
    if (!this.boosting) state.regenStamina(BOOST_REGEN, dt);

    const boostTarget = this.boosting ? BOOST_TOP : 0;
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
    } else if (this.escaped) {
      // He reaches the bay and pulls up; the camera flourish through the bars is
      // 3A's, this just stops him somewhere sensible. The ramp has to live in
      // its own field: this.speed is recomputed from cruise every frame just
      // above, so subtracting from it in place only ever took ESCAPE_DECEL * dt
      // off FULL speed and he coasted out through the end of the tunnel
      // at ~21.6 m/s instead of ever stopping.
      this._escapeSpeed = Math.max(0, this._escapeSpeed - ESCAPE_DECEL * dt);
      this.speed = this._escapeSpeed;
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

    // --- slide (CTRL) ---
    // @1A: input.slide was already bound but nothing read it, and the ceiling
    // ducts are impossible without it. Runs after the jump so airborne is
    // current: jumping out of a slide cancels it, which is what players expect.
    if (input.pressed("slide") && !this.airborne && !this.sliding) {
      this.sliding = true;
      this._slideT = SLIDE_TIME;
    }
    if (this.sliding) {
      this._slideT -= dt;
      if (this._slideT <= 0 || this.airborne) this.sliding = false;
    }
    // squash the capsule from its base, so the feet stay on the floor
    this._bodySquash +=
      ((this.sliding ? 0.42 : 1) - this._bodySquash) * (1 - Math.exp(-20 * dt));
    this.body.scale.y = this._bodySquash;
    this.body.position.y = 1.05 * this._bodySquash;

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

    // --- the southbound: the other way to lose ---
    // Runs even once he is dead, so the rake carries on over him and recycles
    // itself instead of parking on screen.
    if (this._updateTrain(dt, x, prevZ)) {
      this.caught = true;
      this.failCause = "southbound";
      this.finished = true; // no reader in Game yet — see the header note
      state.alive = false;
      state.failCause = "southbound";
      this._shake = 1;
      if (this._audio) this._audio.playOneShot("impact", { volume: 1 });
    }

    state.distance = -this.z;
    this.player.position.set(x, this.y, this.z);

    // --- the way out ---
    // Reaching the vehicle is not an ending, it is the handoff: level 02 is the
    // same chase in the van parked in this bay. Level 01 previously had no
    // ending at all, so Kai ran out through the end of the geometry forever;
    // then it had one that stopped him dead on a box with no way forward.
    if (!this.caught && !this.escaped && this.z <= ESCAPE_Z) {
      this.escaped = true;
      this._escapeSpeed = this.speed; // hand the ramp the speed he arrived with
      this._handOff = ESCAPE_HANDOFF_TIME;
      this.finished = true; // no reader in Game yet — see the header note
      state.handlerState = "SEALED";
    }

    // a beat at the vehicle, then Redline
    if (this.escaped && !this._handedOff) {
      this._handOff -= dt;
      if (this._handOff <= 0) {
        this._handedOff = true;
        this._startLevel02();
      }
    }

    // Interlude I — must run BEFORE _updateHandler, which reads this._gatePhase
    // to decide whether he is sealed. The other way round it saw the previous
    // frame's phase, and that one frame of lag was ~0.4 m of Kai's travel: it is
    // half the reason the seal used to need a 3 m gap to work at all. Also sets
    // this._shake, so it has to stay ahead of the camera either way.
    this._updateGate(dt);

    // the pursuit reads this.z, so it has to run after the clip is applied
    this._updateHandler(dt, state);

    // pooled scenery and obstacle meshes follow him; this also advances the
    // obstacle cursor, so it has to come after the clip test above
    this._updateObstacleVisuals();

    // shadow camera follows so shadows stay inside it
    this.key.position.set(x - 35, 55, this.z - 75);
    this.key.target.position.set(x, 0, this.z - 12);

    // --- look-back camera (mouse2 / C) ---
    // @1A: input.lookBack was bound in Input.js and unread. Holding it orbits
    // the pivot round Kai to face the way he came, which is the only way to see
    // the Handler at all. It deliberately costs the view ahead, so looking back
    // with a southbound inbound is a real decision rather than a free look.
    if (this._autoLook > 0) this._autoLook = Math.max(0, this._autoLook - dt);
    const wantLook = this._autoLook > 0 || input.isDown("lookBack") ? 1 : 0;
    this._lookBack += (wantLook - this._lookBack) * (1 - Math.exp(-LOOK_SWING_RATE * dt));
    if (this._lookBack < 0.002) this._lookBack = 0;

    // smoothstepped so the swing starts and ends soft; the orbit passes through
    // the side of him, which reads as a whip pan rather than a cut
    const swing = THREE.MathUtils.smoothstep(this._lookBack, 0, 1);
    const radius = THREE.MathUtils.lerp(CAM_RADIUS, CAM_RADIUS_BACK, swing);
    const angle = swing * Math.PI; // 0 behind him, PI in front of him looking back
    this.camPivot.position.set(
      Math.sin(angle) * radius,
      THREE.MathUtils.lerp(CAM_HEIGHT, CAM_HEIGHT_BACK, swing),
      Math.cos(angle) * radius,
    );

    // camera lerps toward the pivot rather than being parented to it. The follow
    // tightens during a swing, or the lerp cuts the chord and clips through him
    // instead of tracking the arc.
    const cam = this.game.camera;
    this.camPivot.getWorldPosition(this._tmp);
    cam.position.lerp(this._tmp, 1 - Math.exp(-(9 + swing * 9) * dt));

    // aim down-tunnel normally, and at whatever is behind him when swung round
    this._tmpAim.set(x * 0.7, 1.5, this.z - 9);
    if (swing > 0) {
      this._tmpBack.set(
        this.handler ? this.handler.position.x : 0,
        1.7,
        // his actual gap, so the aim tracks him closing rather than staring at a
        // fixed point; clamped so a sealed Handler 100 m back still frames
        this.z + THREE.MathUtils.clamp(this.gap + 2, 8, 60),
      );
      this._tmpAim.lerp(this._tmpBack, swing);
    }
    cam.lookAt(this._tmpAim);

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
    updateJungleSpeedWarp(this.speedWarpMaterial, dt, normalizedSpeed);

    // strip lights pulse a little faster as speed rises. The pool slide applies
    // it, since that is what decides which lights are live this frame.
    const pulse = 1.0 + Math.sin(performance.now() * 0.004 * (1 + normalizedSpeed)) * 0.15;
    this._updateTunnelDetail(pulse);

    // --- footsteps: trigger on stride distance, only while grounded ---
    if (!this.airborne && !this.sliding && !this.caught && this._audio) {
      this._strideDistance += this.speed * dt;
      if (this._strideDistance >= this._strideInterval) {
        this._strideDistance = 0;
        this._audio.playFootstep({ volume: 0.34, minInterval: 0, dt });
      }
    }
  }

  teardown() {
    if (this._audio) {
      this._audio.teardown();
      this._audio = null;
      this._audioReady = false;
    }
    if (this._resumeAudio) {
      window.removeEventListener("pointerdown", this._resumeAudio);
      window.removeEventListener("keydown", this._resumeAudio);
      this._resumeAudio = null;
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