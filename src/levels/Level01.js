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
 *   the slam was off-screen   → the camera takes itself and swings round to watch it land
 *   fixed chase camera        → input.lookBack (mouse2 / C) orbits the camera to face the way he came
 *   the Handler vanished at the seal → he runs up to the bars, hits them, and stays there lit
 *   the seal only held if he was 3 m back → the bars now come down between them at ANY gap
 *   one long linear speed creep → four gears: slow / medium / fast / super fast
 *   reaching the vehicle froze the game → it hands off to level 02 (Redline) and the chase continues
 *   (nothing)                 → the southbound: an oncoming train filling two of three lanes. Instant loss.
 *   obstacles were scenery    → clipping one stumbles Kai and hands the Handler three metres
 *   4 hand-placed barriers    → ~80 seeded placements of the three kinds the pitch names
 *   no pursuer                → the Handler: 15 m head start, constant-speed follower, fail state at 0
 *   600 m of tunnel (32 s)    → 3.4 km and a ~3 min clean run, with strips/lights/obstacles pooled
 *   ran off the end of the world → reaching the service vehicle ends the level
 *   single directional light  → hemi + key + a few point lights (emergency strips) + fog tuned cyan
 *   (nothing)                 → pipes, platform ledge, ticket-barrier obstacles, security gate, service bay
 *   (nothing)                 → AudioSystem: ambience, footsteps tied to stride, gate/train stings
 *
 * Level 01's economy comes straight off the pitch: "the only currency is
 * distance", "every clipped barrier hands him three metres", and the health
 * bar does not appear until level 02. So nothing here calls state.damage() —
 * mistakes are paid for in metres of gap.
 *
 * The southbound is the one exception, and the pitch is explicit about why:
 * "HE CATCHES YOU, OR THE SOUTHBOUND DOES". A train is not a mistake you pay
 * three metres for, so it ends the run outright. state.failCause says which of
 * the two got you.
 *
 * @1A the slide is implemented here. input.slide was already bound in
 * Input.js but nothing read it, and the ceiling ducts below are impossible
 * without it while Player.js is still empty. It is deliberately one flag and
 * one timer in update(), so lift it straight out when you build the real
 * controller — nothing else depends on where it lives.
 *
 * this.finished is set on both outcomes, and NOTHING IN Game._frame() READS IT.
 * That no longer matters for the win — reaching the vehicle now calls
 * game.setLevel('level02') itself, so the run continues into Redline instead of
 * freezing on a box. It still matters for the LOSS: being caught stops Kai and
 * sets state.alive = false, but nothing draws a fail screen, so R (Game's own
 * restart binding) is currently the only way out. That hook is shared-systems
 * work, not Level 01's.
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
 * The three kinds the pitch names for level 01, and what each one asks of you.
 * Each carries its own collision band so _clipObstacles() stays generic.
 *
 *   barrier  ticket barrier — jump it, or change lane
 *   trolley  luggage trolley — lane only. A jump apex of 9.2^2 / (2*24) =
 *            1.76 m lifts Kai's feet to 2.07, so 2.2 m tall is deliberately
 *            just out of reach: it must not be jumpable.
 *   duct     ceiling duct — spans the full tunnel width, so no lane helps and
 *            the only answer is to slide. This is the one that teaches CTRL.
 */
const OBSTACLE_KINDS = {
  barrier: { halfX: 0.5, halfZ: 0.2, loY: 0, hiY: 1.0, size: [1, 1, 0.4], meshY: 0.5 },
  trolley: { halfX: 0.6, halfZ: 0.45, loY: 0, hiY: 2.2, size: [1.2, 2.2, 0.9], meshY: 1.1 },
  duct: { halfX: 6, halfZ: 0.35, loY: 1.5, hiY: 6.75, size: [11.8, 5.25, 0.7], meshY: 4.125 },
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

    // one set of procedurally generated materials shared by the builders below,
    // tiled for this level's runway rather than the shell's original 600 m
    const mats = createSubwayMaterials({ tunnelLength: TUNNEL_LENGTH });
    this._buildTunnel(mats);
    // trains before obstacles: _buildTrain plans where the southbounds are
    // dispatched, and the course generator deletes placements inside those
    // windows so a train is never stacked on a barrier
    this._buildTrain(mats);
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
    this.body = body; // the slide squashes this, so keep the handle
    this.player.add(body);

    this.camPivot = new THREE.Object3D();
    this.camPivot.position.set(0, CAM_HEIGHT, CAM_RADIUS);
    this.player.add(this.camPivot);
    this.root.add(this.player);

    this._tmp = new THREE.Vector3();
    // look target scratch: the forward aim point, and the one behind him it
    // blends toward during a look-back
    this._tmpAim = new THREE.Vector3();
    this._tmpBack = new THREE.Vector3();

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
      mapRepeat: [MAP_REPEAT_Z, 2.5],
      baseColor: 0xffffff, // white tint — the tile texture carries the colour
      streakColor: 0x6be2ff,
    });

    // The shell itself is four long boxes — about 40 vertices for the whole
    // 3.4 km — so there is nothing to gain from chunking it. Only the repeated
    // detail below is worth pooling.
    const floorGeo = new THREE.BoxGeometry(12, 0.4, TUNNEL_LENGTH);
    this.floor = new THREE.Mesh(floorGeo, mats.floorMat);
    this.floor.position.set(0, -0.2, SHELL_CENTER_Z);
    this.floor.receiveShadow = true;
    this.root.add(this.floor);

    const wallGeo = new THREE.BoxGeometry(1, 7, TUNNEL_LENGTH);
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(wallGeo, this.wallMaterial);
      wall.position.set(side * 6.2, 3.3, SHELL_CENTER_Z);
      wall.receiveShadow = true;
      this.root.add(wall);
    }

    const ceiling = new THREE.Mesh(
      new THREE.BoxGeometry(12.4, 0.3, TUNNEL_LENGTH),
      mats.ceilingMat,
    );
    ceiling.position.set(0, 6.9, SHELL_CENTER_Z);
    this.root.add(ceiling);

    // raised platform ledge, one side, outside the playable lanes —
    // its texture carries the worn yellow safety line along the track edge
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.5, TUNNEL_LENGTH),
      mats.platformMat,
    );
    platform.position.set(-5.3, 0.05, SHELL_CENTER_Z);
    platform.receiveShadow = true;
    platform.castShadow = true;
    this.root.add(platform);

    // overhead pipes, other side — rust-streaked, with weld seams every 4 m
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, TUNNEL_LENGTH, 8),
      mats.pipeMat,
    );
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(5.5, 5.9, SHELL_CENTER_Z);
    pipe.castShadow = true;
    this.root.add(pipe);

    // Emergency strips: unlit emissive-look meshes + real point lights every
    // third one, so the tunnel is actually lit by them instead of just showing
    // bright rectangles. A fixed pool leapfrogs ahead of Kai in
    // _updateTunnelDetail(), so the light and draw-call count is the same at
    // 3 km as it was at 200 m. One shared geometry, one shared material.
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xcfefff });
    const stripGeo = new THREE.BoxGeometry(2.6, 0.1, 0.6);
    this._strips = [];
    this.stripLights = [];
    for (let i = 0; i < STRIP_POOL; i++) {
      const strip = new THREE.Mesh(stripGeo, stripMat);
      strip.position.set(0, 6.3, 0);
      this.root.add(strip);
      this._strips.push(strip);
    }
    for (let i = 0; i < STRIP_LIGHT_POOL; i++) {
      const point = new THREE.PointLight(0x6be2ff, 1.1, 14, 2);
      point.position.set(0, 6.0, 0);
      this.root.add(point);
      this.stripLights.push(point);
    }
  }

  /**
   * Slides the strip pool along so it always straddles Kai. Each pooled mesh
   * takes the strip "slot" (a fixed 20 m grid in world space) at its index,
   * and the lights go to whichever visible slots are multiples of three — keyed
   * off the slot rather than the pool index, so the lit pattern stays put in
   * the world instead of strobing as the pool rotates.
   */
  _updateTunnelDetail(pulse) {
    const startSlot = Math.floor((-this.z - STRIP_BEHIND) / STRIP_SPACING);
    let lit = 0;

    for (let k = 0; k < this._strips.length; k++) {
      const slot = startSlot + k;
      const z = -slot * STRIP_SPACING;
      const strip = this._strips[k];
      const inside = z <= TUNNEL_START_Z && z >= TUNNEL_END_Z;
      strip.visible = inside;
      if (!inside) continue;
      strip.position.z = z;

      if (slot % 3 === 0 && lit < this.stripLights.length) {
        const light = this.stripLights[lit++];
        light.position.z = z;
        light.visible = true;
        light.intensity = 1.1 * pulse;
      }
    }

    // park anything the window didn't need; three.js skips invisible lights
    for (let i = lit; i < this.stripLights.length; i++) this.stripLights[i].visible = false;
  }

  /**
   * Lays out the course. Two separate things live here:
   *
   *   this.obstacles      plain data, and the sole authority for collision.
   *                       Sorted by descending z, i.e. in the order Kai meets
   *                       them, which is what lets _clipObstacles() scan a
   *                       couple of entries instead of the whole course.
   *   this._obstacleMeshes a small pool of meshes per kind, repositioned every
   *                       frame onto whichever placements are in view.
   *
   * Splitting them is what makes ~80 obstacles cost the same as 24. It also
   * means collision no longer depends on anything being drawn.
   */
  _buildObstacles(mats) {
    const rng = makeRng(OBSTACLE_SEED);
    const span = OBSTACLE_LAST_Z - OBSTACLE_FIRST_Z;

    // safe if a level instance is ever re-init'd rather than reconstructed
    this.obstacles.length = 0;
    this._obsCursor = 0;

    let z = OBSTACLE_FIRST_Z;
    while (z > OBSTACLE_LAST_Z) {
      // 0 at the first obstacle, 1 at the seal — the difficulty curve
      const t = THREE.MathUtils.clamp((z - OBSTACLE_FIRST_Z) / span, 0, 1);

      // Kinds unlock in the order the player can learn them: barriers alone
      // for the first stretch, then trolleys once jumping is not enough, then
      // ducts once there is a reason to find CTRL.
      const roll = rng();
      let kind = "barrier";
      if (t > 0.28 && roll < 0.22) kind = "duct";
      else if (t > 0.12 && roll < 0.55) kind = "trolley";

      if (kind === "duct") {
        // full width, so the lane is irrelevant; centre it and be honest
        this._addObstacle("duct", 1, z);
      } else {
        const lane = Math.floor(rng() * 3);
        this._addObstacle(kind, lane, z);

        // Later on, a second obstacle abreast forces one specific lane rather
        // than leaving two outs. Offsetting by 1 or 2 mod 3 guarantees the
        // third lane stays clear, so a site is never unsurvivable.
        if (t > 0.45 && rng() < 0.3) {
          const other = (lane + 1 + Math.floor(rng() * 2)) % 3;
          this._addObstacle(rng() < 0.5 ? "barrier" : kind, other, z);
        }
      }

      let step = OBSTACLE_GAP_START + (OBSTACLE_GAP_END - OBSTACLE_GAP_START) * t;
      if (kind === "duct") step += 14; // room to stand up again before the next one
      z -= step * (0.85 + rng() * 0.3); // jitter, so the course isn't a metronome
    }

    // Carve the southbound windows back out. Anything left in there could sit
    // in the one surviving lane, and a duct is worse still — sliding gets you
    // under the duct but not under the train, so the site would have no answer.
    this.obstacles = this.obstacles.filter((o) => !this._inTrainZone(o.z));

    // --- the visual pool ---
    // The duct gets a tinted clone of the vehicle maps plus a faint amber
    // emissive, which is the palette rule doing work: amber only ever appears
    // where something is about to hurt you, and this is the one obstacle whose
    // answer is not obvious.
    const ductMat = mats.vehicleMat.clone();
    ductMat.emissive = new THREE.Color(0xff8a3d);
    ductMat.emissiveIntensity = 0.22;

    const kindMats = { barrier: mats.barrierMat, trolley: mats.vehicleMat, duct: ductMat };

    this._obstacleMeshes = {};
    for (const [kind, spec] of Object.entries(OBSTACLE_KINDS)) {
      const geo = new THREE.BoxGeometry(...spec.size); // one geometry per kind
      const pool = [];
      for (let i = 0; i < OBSTACLE_POOL; i++) {
        const mesh = new THREE.Mesh(geo, kindMats[kind]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.visible = false;
        mesh.userData.isObstacle = true;
        mesh.userData.kind = kind;
        this.root.add(mesh);
        pool.push(mesh);
      }
      this._obstacleMeshes[kind] = pool;
    }
  }

  /** Pushes one placement onto the collision list, baking its kind's bounds in. */
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
  _buildTrain(mats) {
    // Planned first, because _buildObstacles() deletes placements inside these
    // windows and it runs after this.
    const rng = makeRng(OBSTACLE_SEED ^ 0x5bd1);
    this._trainEvents = TRAIN_TRIGGERS.map((triggerZ) => ({
      triggerZ,
      // Only an OUTER lane can be the survivor. If the middle one were clear,
      // the two blocked lanes would not be adjacent and the train would have to
      // be two boxes with a Kai-sized hole between them.
      clearLane: rng() < 0.5 ? 0 : 2,
    }));

    const group = new THREE.Group();

    // grimier than the maintenance vehicle, so the two don't read as one prop
    const shell = mats.vehicleMat.clone();
    shell.color = new THREE.Color(0x39434f);

    const carGeo = new THREE.BoxGeometry(TRAIN_HALF_X * 2, 3.4, TRAIN_CAR_LEN);
    const glassGeo = new THREE.BoxGeometry(0.06, 0.7, TRAIN_CAR_LEN - 3);
    const glassMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff });

    // the group's origin is the NOSE, since that is the end that matters; the
    // cars hang backwards off it down -z
    for (let i = 0; i < TRAIN_CARS; i++) {
      const zc = -(TRAIN_CAR_LEN / 2 + i * (TRAIN_CAR_LEN + TRAIN_CAR_GAP));
      const car = new THREE.Mesh(carGeo, shell);
      car.position.set(0, 1.8, zc); // spans y 0.1..3.5, under the 3.6 collision top
      car.castShadow = true;
      group.add(car);

      // lit windows: these are what actually streak as it goes past, and the
      // streak is most of what sells the speed of the pass
      for (const side of [-1, 1]) {
        const glass = new THREE.Mesh(glassGeo, glassMat);
        glass.position.set(side * (TRAIN_HALF_X + 0.02), 2.3, zc);
        group.add(glass);
      }
    }

    // Headlamps, deliberately fog: false. The fog wall is at 165 m and the
    // train is dispatched from 300 m, so fogged lamps would give no warning at
    // all until it emerged from the haze ~3.6 s out. Unfogged they read as two
    // hot dots far down the tunnel, which is how you spot a train coming.
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0, fog: false });
    for (const off of [-1.5, 1.5]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.12), lampMat);
      lamp.position.set(off, 1.25, 0.08);
      group.add(lamp);
    }

    // The near-field blast. This is the cue that tells you WHICH wall it is
    // hugging, because the near wall washes far brighter than the far one.
    const head = new THREE.PointLight(0xfff2d0, 0, 95, 2);
    head.position.set(0, 1.8, 2.2);
    group.add(head);

    group.visible = false;
    group.userData.isTrain = true;
    this.train = group;
    this.trainLight = head;
    this.root.add(group);
  }

  /** True if z sits inside any southbound's danger window, where obstacles must not be. */
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
    const serviceGroup = new THREE.Group();
    serviceGroup.position.set(0, 0, BAY_Z);

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
    // deliberately NOT a shadow caster: the risk slide budgets one per level
    // and this.key already spends it. A second shadow map here doubled the
    // depth passes for a light the player sees for the last four seconds.
    serviceGroup.add(workLight);

    this.serviceVehicle = vehicle;
    this.root.add(serviceGroup);
  }

  /**
   * The Handler, greyboxed. "On foot he is a shape at the edge of the tunnel
   * lights" — so he is a dark figure plus an amber glow, amber because the
   * palette rule is cyan everywhere and amber only where something is about
   * to hurt you.
   *
   * He sits behind the camera, so the look-back swing in update() is what makes
   * him visible at all. Two things had to change for that to be worth doing:
   * his coat was 0x090c11, near enough to black that he was a hole in the
   * tunnel rather than a figure; and his light sat ON him, which lights the
   * walls but leaves the figure flat. Set back behind him it rims him instead.
   *
   * Deliberately NOT shadow-casting: the risk slide budgets one shadow-casting
   * light per level and the key light already spends it.
   */
  _buildHandler() {
    const group = new THREE.Group();

    const coatMat = new THREE.MeshStandardMaterial({
      color: 0x1b2431,
      roughness: 0.92,
      metalness: 0.05,
    });

    const coat = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.15, 6, 12), coatMat);
    coat.position.y = 1.15;
    group.add(coat);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), coatMat);
    head.position.y = 1.98;
    group.add(head);

    // His torch, facing the way he is running. fog: false, so it stays a single
    // hot dot at any range — which means looking back always finds him, even
    // pinned at the bars a hundred metres back with the fog closed over him.
    const torch = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffb066, fog: false }),
    );
    torch.position.set(0.3, 1.55, -0.42);
    group.add(torch);

    // Set BEHIND him (greater z) rather than on him: from Kai's side of the
    // tunnel that backlights the figure into a silhouette, which is what the
    // pitch describes, and it still washes the tunnel the same amount.
    const glow = new THREE.PointLight(0xff8a3d, 0, 30, 2);
    glow.position.set(0, 2.4, 1.8);
    group.add(glow);

    group.position.set(0, 0, HANDLER_START_GAP);
    group.userData.isHandler = true;

    this.handler = group;
    this.handlerLight = glow;
    this._handlerLightBase = 3.4;
    this.root.add(group);
  }

  /**
   * Did Kai clip something this frame? Unlike a blocking test this never moves
   * him — the pitch's economy is that a clip costs ground, not progress, so he
   * runs on through and pays for it in gap.
   *
   * Swept against prevZ rather than tested at the end position: at the 22 m/s
   * cap on a clamped 0.05 s frame he covers 1.1 m, wider than a barrier's
   * overlap band, so a position-only test would miss the hit entirely on a
   * stuttering frame.
   *
   * The vertical test is a band overlap, not a floor check, because the three
   * kinds fail in opposite directions: you clear a barrier by getting your feet
   * above it and a duct by getting your head under it, and a trolley is sized
   * so that neither works.
   *
   * @param {number} x lane-interpolated x for this frame
   * @param {number} prevZ this.z before this frame's forward integration
   * @returns {object|null} the placement he clipped, or null if he got past clean
   */
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
    this.key.position.set(x + 6, 14, this.z + 10);
    this.key.target.position.set(x, 0, this.z - 6);

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
    updateSpeedWarp(this.wallMaterial, dt, normalizedSpeed);

    // strip lights pulse a little faster as speed rises. The pool slide applies
    // it, since that is what decides which lights are live this frame.
    const pulse = 1.0 + Math.sin(performance.now() * 0.004 * (1 + normalizedSpeed)) * 0.15;
    this._updateTunnelDetail(pulse);

    // --- footsteps: trigger on stride distance, only while grounded ---
    if (!this.airborne && !this.sliding && !this.caught && this._audio) {
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