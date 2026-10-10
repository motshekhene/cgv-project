import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Level } from "../core/Level.js";
import { createJungleSpeedWarpMaterial, updateJungleSpeedWarp } from "../shaders/jungleSpeedWarpShader.js";
import { AudioSystem } from "../audio/audioSystem.js";
import { CARS, HANDLER_MODEL, loadSavedCar, loadSavedPaint } from "./level2/carSelect.js";
import { attachModel } from "./level2/attachModel.js";
import { CarLights } from "./level2/carLights.js";
import { CarDoor } from "./level1/carDoor.js";
import {
  createJungleCueBuffers,
  createJungleMusicBuffer,
  loadAudioFileBuffer,
  loadJungleTheme,
  JungleBed,
} from "../audio/jungleAudio.js";
import { showEndCard } from "../ui/EndCard.js";
import { THEME_CSS } from "../ui/theme.js";
import { kaiThinks, clearThoughts, DIALOGUE_FONT } from "../ui/dialogue.js";
import { loadCast, makeKai, makeHandler } from "../intros/cast.js";
import { dotTexture } from "../intros/fx.js";
import { PAINTS, applyPaint, detectPaint } from "./level2/paint.js";
import {
  loadJungleKit,
  createJungleMaterials,
  buildTrailBase,
  buildElevatedTrail,
  buildJungleBackdrop,
  createJungleWildlife,
  updateJungleWildlife,
  jungleCourseHeight,
  BRIDGE_GAPS,
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
const SERVICE_CAR_LOCAL_Z = -6;
// Fires at the mouth of the bay rather than at the vehicle, because he needs
// ~7 m to pull up from full speed and stopping ten metres past the thing you
// were running for reads as an overshoot, not an arrival. The finish scene
// then walks him the rest of the way to the driver's door.
const ESCAPE_Z = BAY_Z + 4;
const ESCAPE_DECEL = 34; // m/s^2; ~0.65 s and 7 m to a standstill

// --- the finish scene ---
// Reaching the bay takes the camera for a short scene instead of stopping Kai
// dead under a win card: he runs in and pulls up at the driver's door, turns
// to look back at the Marshal beating on the sealed gate, then opens the door,
// gets in the way anyone gets into a car (backside first, ducking in, legs
// swung in after him) and pulls it shut, and the headlights come on. The
// ESCAPED card lands over a slow orbit of the car, and CONTINUE carries on
// into the drive-out scene from the car's engine.
const FINALE_ARRIVE = 1.7; // run-in to the driver's door
const FINALE_LOOK = 3.8; // ...looking back at the gate until here
const FINALE_REACH = 4.3; // turned to the door, his hand on the handle
const FINALE_OPEN = 4.5; // the latch goes: the door swings out past him as he steps back
const FINALE_STEP = 5.1; // he steps round it into the gap
const FINALE_SIT = 5.6; // ...turns his back to the seat and sits, ducking in
const FINALE_SWING = 6.1; // legs swung in, facing the wheel
const FINALE_SHUT = 6.45; // he pulls the door after him
const FINALE_IN = 6.8; // ...and it slams: in the car, door shut
const FINALE_LIGHTS = 7.1; // headlights on
const FINALE_CARD = 7.9; // the ESCAPED card
const FINALE_BANGS = [2.35, 3.05]; // the Marshal hitting the bars
const SIT_HIPS = 0.534; // his hips above his feet in the 'sitting' clip (characters/kai-bryce.json)
const SIT_HEAD = 1.34; // the top of his head, seated

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
  // The original three keys remain for compatibility with 1A. Extra Jungle
  // variants use the same generic collision path, so no controller rewrite is
  // needed just to make the route feel richer.
  barrier: { halfX: 0.72, halfZ: 0.45, loY: 0, hiY: 0.95, meshY: 0 },
  trolley: { halfX: 0.72, halfZ: 0.62, loY: 0, hiY: 2.25, meshY: 0 },
  duct: { halfX: 3.8, halfZ: 0.5, loY: 1.05, hiY: 5.2, meshY: 0 },
  crate: { halfX: 0.78, halfZ: 0.72, loY: 0, hiY: 2.0, meshY: 0 },
  barrel: { halfX: 0.62, halfZ: 0.62, loY: 0, hiY: 1.7, meshY: 0 },
  trap: { halfX: 0.72, halfZ: 0.48, loY: 0, hiY: 0.48, meshY: 0 },
  wall: { halfX: 0.82, halfZ: 0.5, loY: 0, hiY: 2.5, meshY: 0 },
};

// --- obstacle placement ---
const OBSTACLE_FIRST_Z = -140; // a calm runway to find the controls in
const OBSTACLE_LAST_Z = GATE_Z + 90; // stop short of the seal so Interlude I is clean
const OBSTACLE_GAP_START = 48; // metres between sites at the top of the level...
// ...and by the end. This is the difficulty ramp, and it is spacing in METRES
// while difficulty is really spacing in SECONDS. 26 m was 1.18 s of reaction
// time at the old 22 m/s ceiling; at the new 30 m/s top gear the same 26 m is
// 0.87 s, and 0.65 s boosting, which is under human reaction time for a lane
// read. 34 m restores ~1.13 s at top gear, so the last gear is faster without
// also being unreadable — the speed is the difficulty, not the ambush.
const OBSTACLE_GAP_END = 31;
const OBSTACLE_SEED = 20260911;
// Meshes kept alive per kind. The busiest 240 m window of the generated course
// wants 9 barriers, so 8 was one short and the ninth silently went undrawn.
const OBSTACLE_POOL = 16;
const OBSTACLE_BEHIND = 30; // metres behind Kai a mesh stays drawn
const OBSTACLE_AHEAD = 210; // ...and ahead, past the fog wall

// --- falling-tree set pieces ---
// These are telegraphed well ahead of Kai and land as jumpable obstacles. They
// are deliberately placed on flatter stretches so the trunk visibly falls
// from the forest floor across the trail instead of spawning in mid-air.
const FALLING_TREE_EVENTS = [
  { z: -260, side: -1 },
  { z: -620, side: 1 },
  // This one waits until Kai has JUST passed, then crashes down behind him.
  // It is spectacle/pressure, not an unfair obstacle.
  { z: -1785, side: -1, behind: true },
  { z: -2910, side: 1 },
];
const FALL_TREE_TRIGGER_AHEAD = 62;
const FALL_TREE_TIME = 0.95;
const FALL_TREE_COLLIDE_FROM = 0.62;
const FALL_TREE_HALF_Z = 0.7;
const FALL_TREE_HI_Y = 0.95;

// --- authored adventure beats ------------------------------------------------
// The random obstacle field intentionally goes quiet through these sections.
// Each one has its own readable rule, so difficulty comes from decisions rather
// than foliage + random props hiding a reaction test.
const ROUTE_SPLIT_START_Z = -720;
const ROUTE_CHOICE_Z = -700;
const ROUTE_SPLIT_FULL_Z = -790;
const ROUTE_MERGE_START_Z = -930;
const ROUTE_SPLIT_END_Z = -1000;
const ROUTE_OFFSET = 5.6;

const DARK_SHRINE_START_Z = -1010;
const DARK_SHRINE_END_Z = -1185;
const DARK_SHRINE_FADE = 28;

const BRIDGE_START_Z = -1318;
const BRIDGE_END_Z = -1450;
// Panels start dropping almost immediately after Kai's feet clear them, so the
// bridge visibly peels away behind him instead of waiting several metres.
const BRIDGE_DROP_BEHIND = 2.2;

const BOULDER_Z = -1215;
const SWING_LOG_Z = -2165;
const FALLING_BLOCK_Z = -2285;
const CLOSING_DOOR_Z = -2365;
const ROTATING_BEAM_Z = -2480;

function scriptedSetPieceZone(z) {
  return (
    (z <= -660 && z >= -1245) ||
    (z <= -1270 && z >= -1635) ||
    (z <= -2110 && z >= -2535)
  );
}

// --- cursed shrine guardian ---
// A one-off head-on set piece on the high temple section. It wakes in Kai's
// current lane, charges straight at him and cannot be jumped or tanked: the
// only answer is to move lanes. Contact is an immediate level loss.
const GUARDIAN_TRIGGER_Z = -1465;
const GUARDIAN_SPAWN_Z = -1595;
const GUARDIAN_SPEED = 31;
const GUARDIAN_HALF_X = 0.82;
const GUARDIAN_HALF_Z = 1.35;
const GUARDIAN_CLEAR_NEAR_Z = -1270;
const GUARDIAN_CLEAR_FAR_Z = -1635;
const GUARDIAN_DESPAWN_BEHIND = 24;

// --- temple-run HUD, rewards & flight booster --------------------------------
// Keep these systems inside Level01 so they can be removed/merged without
// touching 1A's shared player controller or importing the experimental Kai
// character module.
const FINISH_DISTANCE = -ESCAPE_Z;
const REWARD_PICKUP_X = 0.86;
const REWARD_PICKUP_Y = 0.88;
const REWARD_PICKUP_Z = 1.05;
const REWARD_VISIBLE_AHEAD = 230;
const REWARD_VISIBLE_BEHIND = 24;

const JETPACK_PICKUPS = [
  { z: -1668, lane: 1 },
  { z: -2635, lane: 0 },
];
const JETPACK_DURATION = 6.0;
const JETPACK_HEIGHT = 6.2;
const JETPACK_SAFE_LIFT = 2.5;
const JETPACK_SPEED_BONUS = 7.5;
const JETPACK_RISE_RATE = 5.5;
const JETPACK_FALL_RATE = 3.8;

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

// --- health / damage ---------------------------------------------------------
// Kai now has a visible life bar. Each obstacle hit drains a fixed amount;
// hitting 0 HP triggers the caught overlay with a CONTINUE button (which
// refills health and resumes from the current position instead of reloading).
const MAX_HEALTH = 100;
const OBSTACLE_DAMAGE = 18;      // HP lost per standard obstacle clip
const SPECIAL_HAZARD_DAMAGE = 25; // HP lost per moving shrine hazard hit
const FALLING_TREE_DAMAGE = 22;   // HP lost per falling-tree hit
const HEALTH_PACK_HEAL = 35;     // HP restored by a life-saver pickup
const HEALTH_PACK_COUNT = 12;    // number of life-saver packs along the route
// Constant creep, m/s, on top of matching Kai's cruise. Zero means a clean run
// holds the gap forever and only mistakes threaten it, which is what the pitch
// describes. Raise it if playtests say a clean run has no tension — nothing
// else reads this.
const HANDLER_CREEP = 0;

// Moving shrine hazards make noise when they hit Kai. That noise now matters:
// the Handler gets an immediate burst of ground and then sprints for a short
// window. It is deliberately survivable from a healthy gap, but a second
// mistake while he is already close can turn into a catch.
const HANDLER_IMPACT_GAP_LOSS = 2.75;
const HANDLER_RAGE_TIME = 2.4;
const HANDLER_RAGE_SPEED = 3.25;
const IMPACT_LEAN_TIME = 0.34;

/**
 * Level 1's HUD in the team's Jungle Shrine look (ui/theme.js): the same
 * three plaques as Level 2's HUD and Level 3's FightHUD — KAI and his life bar
 * on the left, the trail in the middle, the Marshal on the right.
 */
const LEVEL1_HUD_CSS = `
.l1h { font-family:var(--sans); color:var(--ink); user-select:none; text-shadow:none; }
.l1h * { box-sizing:border-box; }
.l1h-top { position:absolute; top:12px; left:12px; right:12px; display:grid; column-gap:14px; align-items:start;
  grid-template-columns:minmax(170px, 1fr) minmax(220px, 420px) minmax(170px, 1fr); }
.l1h-name { display:flex; align-items:center; justify-content:space-between; gap:10px; height:14px; margin-bottom:4px; white-space:nowrap;
  font-family:var(--serif); font-weight:700; font-size:10px; letter-spacing:.3em; color:var(--gold); text-shadow:0 1px 0 #000; }
.l1h-name em { font-style:normal; font-family:var(--sans); font-weight:600; font-size:9px; letter-spacing:.18em; color:var(--ink-dim); }
.l1h-name b { color:var(--key); font-family:var(--sans); font-size:9px; letter-spacing:.2em; }
.l1h-bar { position:relative; height:7px; background:rgba(0,0,0,.6); border-radius:2px; overflow:visible;
  box-shadow:inset 0 1px 2px rgba(0,0,0,.8), 0 0 0 1px rgba(0,0,0,.7); }
.l1h-bar > div { position:absolute; left:0; top:0; bottom:0; width:100%; border-radius:2px; }
.l1h-hp { background:linear-gradient(180deg, rgba(255,255,255,.3), transparent 60%), linear-gradient(90deg, var(--ember), var(--ember-hi)); transition:width .25s ease; }
.l1h-flash { transition:background .12s; }
.l1h-route-fill { width:0; background:linear-gradient(180deg, rgba(255,255,255,.25), transparent 60%), linear-gradient(90deg, var(--gold-dim), var(--gold)); }
.l1h-bar > .l1h-dot { left:0; top:50%; bottom:auto; width:9px; height:9px; border-radius:50%; background:var(--ink); border:2px solid var(--gold-dim);
  transform:translate(-50%,-50%); box-shadow:0 0 8px rgba(227,187,98,.6); }
.l1h-pip { position:absolute; top:-2px; bottom:-2px; width:2px; background:rgba(0,0,0,.7); }
.l1h-row { display:flex; justify-content:space-between; align-items:baseline; gap:10px; white-space:nowrap; margin-top:5px; font-size:9px; letter-spacing:.2em; color:var(--ink-dim); }
.l1h-jet { color:var(--key); }
.l1h-player { position:relative; grid-column:1; justify-self:start; width:250px; max-width:100%; padding:5px 11px 7px; transition:border-color .3s; }
.l1h-player.low { border-color:rgba(242,147,79,.75); }
.l1h-player.low .l1h-hp { animation:l1hLow .8s ease-in-out infinite; }
.l1h-route { position:relative; grid-column:2; padding:5px 12px 7px; }
.l1h-route .l1h-name { color:var(--ink); }
.l1h-handler { position:relative; grid-column:3; justify-self:end; min-width:190px; margin-right:52px; padding:5px 12px 7px; transition:border-color .2s, box-shadow .2s; }
.l1h-handler .l1h-name { color:var(--ink); }
.l1h-state { font-size:10px; font-weight:700; letter-spacing:.22em; color:var(--ember-hi); white-space:nowrap; }
.l1h-handler.attack { border-color:rgba(242,147,79,.85); box-shadow:0 0 18px rgba(201,68,43,.45); }
.l1h-handler.attack .l1h-state { color:#ff7a5c; }
.l1h-handler.calm .l1h-state { color:var(--moss-hi); }
@media (max-width: 760px) {
  .l1h-top { grid-template-columns:1fr 1fr; row-gap:8px; }
  .l1h-route { grid-column:1 / span 2; grid-row:2; }
  .l1h-handler { grid-column:2; margin-right:0; }
}
@keyframes l1hLow { 50% { filter:brightness(1.6); } }
`;

/**
 * The horn stamped on the coins: its curl as a flat shape, extruded a few
 * millimetres proud of the field on both faces (the coin's faces sit at z
 * +-0.026), so it catches the light as the coin turns.
 */
function coinEmblemGeometry() {
  const k = 0.0011; // the shape is drawn on a 260-wide grid
  const sh = new THREE.Shape();
  sh.moveTo(38, 168);
  sh.bezierCurveTo(30, 104, 76, 42, 146, 40);
  sh.bezierCurveTo(196, 39, 226, 72, 224, 112);
  sh.bezierCurveTo(223, 138, 204, 154, 186, 150);
  sh.bezierCurveTo(204, 138, 206, 112, 192, 94);
  sh.bezierCurveTo(174, 72, 142, 66, 114, 78);
  sh.bezierCurveTo(84, 92, 70, 124, 76, 168);
  sh.closePath();
  const front = new THREE.ExtrudeGeometry(sh, { depth: 8, bevelEnabled: true, bevelThickness: 2, bevelSize: 2, bevelSegments: 1, curveSegments: 10 });
  front.translate(-131, -104, 0);
  front.scale(k, -k, k);
  front.translate(0, 0, 0.024);
  const back = front.clone();
  back.rotateY(Math.PI);
  const merged = mergeGeometries([front, back]);
  front.dispose();
  back.dispose();
  return merged;
}

const _flyQ = new THREE.Quaternion();
const _flyQ2 = new THREE.Quaternion();
// the flight pose's legs, radians about each bone's own hinge (from the rest pose)
const FLY_HIP = -0.3;
const FLY_KNEE = -1.1;
const FLY_ANKLE = -0.55;
const _flyE = new THREE.Euler();

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
    this.maxSpeed = SPEED_TOP + Math.max(BOOST_TOP, JETPACK_SPEED_BONUS);
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
    this._handedOff = false;
    this._finale = null; // the finish scene, once he reaches the bay
    this._bendQ = new THREE.Quaternion();
    this._bendX = new THREE.Vector3(1, 0, 0);
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
    this._fallingTrees = [];

    // Authored Level 1B set pieces. The fork is now an actual risk choice:
    // left is the readable relic path; right is the faster-feeling shrine trial
    // with denser combinations and much less recovery space.
    this._routeSide = 0; // -1 left, +1 right, 0 not chosen yet
    this._lastRouteIntent = 0;
    this._worldX = 0;
    this._routeCueShown = false;
    this._darkFactor = 0;
    this._bridgeCueShown = false;
    this._bridgeGapHits = new Set();
    this._specialHazards = [];
    this._guardianTeases = [];
    this._wildlife = null;
    this._backdrop = null;
    this._worldTime = 0;
    this._storyLetters = [];
    this._handlerPressureEvents = [];
    this._transientBanner = null;
    this._storyCard = null;

    // Temple-run style rewards + HUD. These are level-local on purpose: no
    // Kai model/controller code is imported or replaced.
    this._rewardItems = [];
    this._rewardMesh = null;
    this._rewardDiscMesh = null; // the horn emblem on the coins
    this._rewardDummy = new THREE.Object3D();
    this._rewardTime = 0;
    this.rewardCount = 0;
    this.rewardScore = 0;
    this._jetpackPickups = [];
    this._jetpackActive = false;
    this._jetpackT = 0;
    this._flightLift = 0;
    this._jetpackFx = null;
    this._templeHud = null;
    this._hudControls = {};
    this._hudButtons = {};
    this._hudHandlerDist = null;
    this._hudHandlerState = null;
    this._hudHandlerPanel = null;
    this._virtualPressed = Object.create(null);
    this._virtualHeld = new Set();
    this._soundEnabled = true;
    this._soundButton = null;
    this._pauseButton = null;
    this._pauseHook = null;
    this._previousOnPaused = null;

    // A hit from a moving/flying shrine hazard provokes the Handler instead of
    // behaving like a silent scenery clip. _specialImpactType is set by the
    // exact moving object that touched Kai; _handlerRageT drives the short
    // chase burst, and the lean gives the hit visible body feedback.
    this._specialImpactType = null;
    this._specialImpactX = 0;
    this._handlerRageT = 0;
    this._impactLeanT = 0;
    this._impactLeanDir = 0;

    // --- stumble / trip animation ---
    // When Kai hits an obstacle the body pitches forward, one leg kicks up and
    // the whole mesh wobbles for ~0.5 s before settling back. _stumbleT counts
    // down from STUMBLE_ANIM_DURATION to 0; the update loop reads it.
    this._stumbleT = 0;
    this._stumbleDuration = 0.52;
    this._stumbleDir = 0; // -1 left, +1 right, 0 centre

    // --- health ---
    // Separate from GameState.health so the level is self-contained. The HUD
    // reads this._health directly; the continue button resets it.
    this._health = MAX_HEALTH;
    this._healthFlashT = 0; // brief red pulse when damage lands

    // --- life-saver packs ---
    this._healthPacks = [];
    this._healthPackMesh = null;

    // Cursed shrine guardian set piece. It is dormant until Kai reaches the
    // temple-top approach, then it charges from ahead in the lane he is using.
    this.guardian = null;
    this._guardianActive = false;
    this._guardianResolved = false;
    this._guardianLaneX = 0;
    this._guardianZ = GUARDIAN_SPAWN_Z;
    this._guardianPhase = 0;

    this._caughtOverlay = null;
    this._floorY = 0;
    this.securityGate = null;
    this.serviceVehicle = null;

    this._level2Preload = null;

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
    this._musicTrack = null;
    this._bed = null; // JungleBed — the living ambient bed
    this._musicDuck = 1; // music dip under big cues; recovers in update()
    this._strideDistance = 0;
    // one stride ≈ 1.6 m of ground covered, so the footstep rate rises with
    // the speed ramp on its own instead of needing its own curve
    this._strideInterval = 1.6;
  }

  async init(scene, assets, input, state) {
    super.init(scene, assets, input, state);
    state.templeRewards = 0;
    state.templeScore = 0;

    scene.background = new THREE.Color(0xcfd6a8);
    scene.fog = new THREE.FogExp2(0xcfd6a8, 0.014);
    this.root.add(createJungleSky());

    const hemi = new THREE.HemisphereLight(0xbfdcff, 0x4a5a26, 0.6);
    this.hemi = hemi;
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
    this._backdrop = buildJungleBackdrop(this.root, this._jungleKit, mats);
    this._wildlife = createJungleWildlife(this.root);
    this._buildRouteSplit(mats);
    this._buildDarkShrine(mats);
    this._buildAdventureHazards(mats);
    this._buildGuardianTeases();
    this._buildStoryLetters();
    this._buildHandlerPressureProps();
    this._trainEvents = [];
    this._trainActive = false;
    this._buildObstacles(mats);
    this._buildTempleRewards();
    this._buildJetpackPickups();
    this._buildHealthPacks();
    this._buildFallingTrees();
    this._buildSecurityGate(mats);
    this._buildServiceArea(mats);
    this._buildHandler();
    this._buildShrineGuardian();

    // Preload Level 02's cars in the background. This is intentionally not
    // awaited, so Level 01 starts normally but the eventual car picker is
    // normally already cached when Kai reaches the blue car.
    this._level2Preload = Promise.allSettled(
      [HANDLER_MODEL, ...CARS.map((c) => c.path)].map((path) => assets.model(path)),
    );

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
    await this._buildKai();
    await this._buildHandlerModel();

    // In the dark shrine the route is readable from Kai's own small torch and
    // the emissive runes. Outside that section it fades almost completely out.
    this.kaiTorch = new THREE.SpotLight(0xc9fff0, 0, 24, 0.48, 0.6, 1.4);
    this.kaiTorch.position.set(0, 1.55, -0.25);
    this.kaiTorch.target.position.set(0, 0.9, -9);
    this.player.add(this.kaiTorch, this.kaiTorch.target);

    this.camPivot = new THREE.Object3D();
    this.camPivot.position.set(0, CAM_HEIGHT, CAM_RADIUS);
    this.player.add(this.camPivot);
    this.root.add(this.player);

    this._tmp = new THREE.Vector3();
    this._tmpAim = new THREE.Vector3();
    this._tmpBack = new THREE.Vector3();
    this._baseFov = this.game && this.game.camera ? this.game.camera.fov : 62;
    this._buildJetpackFx();
    this._buildTempleRunHUD();
    this._ensureAudio();

    // The shared readout, so the chase shows its numbers like every other
    // level. Level 1 has no damage model — the comment in GameState holds:
    // the pursuit gap IS the health bar, and the state line under it (CLOSING
    // / LOSING GROUND / CAUGHT) is the health status. The letter ids here are
    // "level01-N", not the preset's "l1-N" guess, so pass the prefix through.
  }

  _buildTunnel(mats) {
    const world = buildTrailBase(this.root, this._jungleKit, mats, {
      length: TUNNEL_LENGTH,
      centerZ: SHELL_CENTER_Z,
    });
    this.floor = world.trail;
    this._trailChunks = world.chunks;
    this._elevatedCourse = buildElevatedTrail(this.root, this._jungleKit, mats);
    this._bridgePanels = this._elevatedCourse.userData.bridgePanels || [];

    // Keep signage outside the three running lanes. The earlier positions sat
    // close enough to the trail to compete with obstacle silhouettes, which
    // was especially distracting on a climb with the Handler close behind.
    const signs = [
      [-5.4, -72, "THE CAMP →"],
      [5.4, -1120, "THE CAMP →"],
      [-5.4, -2240, "THE CAMP →"],
    ];
    for (const [x, z, text] of signs) {
      const sign = createSign(text);
      sign.position.set(x, jungleCourseHeight(z), z);
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
    const routeX = this._routeOffsetAt(this.z);
    if (this._speedWarpGroup) {
      this._speedWarpGroup.position.z = this.z;
      this._speedWarpGroup.position.y = this._floorY;
      this._speedWarpGroup.position.x = routeX;
    }
    if (this._shaftGroup) {
      this._shaftGroup.position.z = this.z - 18;
      this._shaftGroup.position.y = this._floorY;
      this._shaftGroup.position.x = routeX;
      for (const shaft of this._shaftGroup.children) {
        if (shaft.material?.uniforms?.uOpacity) {
          shaft.material.uniforms.uOpacity.value = 0.11 + (pulse - 0.85) * 0.05;
        }
      }
    }
    if (this._pollen) {
      this._pollen.position.z = this.z - 48;
      this._pollen.position.y = this._floorY;
      this._pollen.position.x = routeX;
      this._pollen.rotation.y += 0.0008;
    }
  }

  _routeOffsetMagnitude(z) {
    const d = -z;
    const start = -ROUTE_SPLIT_START_Z;
    const full = -ROUTE_SPLIT_FULL_Z;
    const merge = -ROUTE_MERGE_START_Z;
    const end = -ROUTE_SPLIT_END_Z;
    if (d <= start || d >= end) return 0;
    if (d < full) {
      const t = THREE.MathUtils.smoothstep(d, start, full);
      return ROUTE_OFFSET * t;
    }
    if (d <= merge) return ROUTE_OFFSET;
    const t = THREE.MathUtils.smoothstep(d, merge, end);
    return ROUTE_OFFSET * (1 - t);
  }

  _routeOffsetAt(z, side = this._routeSide) {
    return side * this._routeOffsetMagnitude(z);
  }

  _buildRouteSplit(mats) {
    const group = new THREE.Group();
    group.name = "risk-choice-route-split";
    const step = 8;

    for (const side of [-1, 1]) {
      for (let z0 = ROUTE_SPLIT_START_Z; z0 > ROUTE_SPLIT_END_Z; z0 -= step) {
        const z1 = Math.max(ROUTE_SPLIT_END_Z, z0 - step);
        const x0 = side * this._routeOffsetMagnitude(z0);
        const x1 = side * this._routeOffsetMagnitude(z1);
        const y0 = jungleCourseHeight(z0);
        const y1 = jungleCourseHeight(z1);
        const dx = x1 - x0;
        const dz = z1 - z0;
        const dy = y1 - y0;
        const length = Math.hypot(dx, dz, dy);
        const deck = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.16, length + 0.06), mats.trail);
        deck.position.set((x0 + x1) * 0.5, (y0 + y1) * 0.5 - 0.08, (z0 + z1) * 0.5);
        deck.rotation.x = Math.atan2(dy, Math.hypot(dx, dz));
        deck.rotation.y = Math.atan2(dx, -dz);
        deck.receiveShadow = true;
        group.add(deck);
      }
    }

    // A ruined island splits the trail visually. It is deliberately narrow
    // enough that a player can commit left or right without foliage hiding the
    // first mirrored obstacle.
    const island = new THREE.Group();
    island.position.set(0, jungleCourseHeight(-758), -758);
    const marker = cloneProp(this._jungleKit.stag);
    marker.scale.setScalar(0.0105);
    marker.position.y = 0.05;
    island.add(marker);
    for (const x of [-0.72, 0.72]) {
      const col = cloneProp(this._jungleKit.columnShort);
      col.scale.setScalar(0.011);
      col.position.set(x, 0, 0.6);
      island.add(col);
    }
    group.add(island);

    const left = createSign("LEFT: RELIC", { width: 2.5, height: 0.72 });
    left.position.set(-5.3, jungleCourseHeight(-686), -686);
    left.rotation.y = 0.12;
    group.add(left);
    const right = createSign("RIGHT: TRIAL", { width: 2.6, height: 0.72 });
    right.position.set(5.3, jungleCourseHeight(-686), -686);
    right.rotation.y = -0.12;
    group.add(right);

    this._routeSplitGroup = group;
    this.root.add(group);
  }

  _updateRouteChoice(localX) {
    if (!this._routeCueShown && this.z <= -620) {
      this._routeCueShown = true;
      this._showTransientBanner("FORK AHEAD — LEFT IS SAFER • RIGHT IS THE SHRINE TRIAL", 2.8);
    }
    if (this._routeSide !== 0 || this.z > ROUTE_CHOICE_Z) return;

    if (this.lane === 0 || localX < -0.6) this._routeSide = -1;
    else if (this.lane === 2 || localX > 0.6) this._routeSide = 1;
    else if (this._lastRouteIntent) this._routeSide = this._lastRouteIntent;
    else if (this.z <= ROUTE_SPLIT_START_Z - 15) this._routeSide = -1; // last-resort fallback
    else return;

    this._showTransientBanner(
      this._routeSide < 0 ? "RELIC PATH — KEEP MOVING" : "SHRINE TRIAL — NO EASY LINE",
      1.4,
    );
  }

  _buildDarkShrine(mats) {
    const group = new THREE.Group();
    group.name = "dark-shrine-corridor";
    this._darkRuneLights = [];

    const wallMat = mats.stone;
    for (let z = DARK_SHRINE_START_Z; z >= DARK_SHRINE_END_Z; z -= 18) {
      const floor = jungleCourseHeight(z);
      const arch = cloneProp(this._jungleKit.arch);
      arch.position.set(0, floor, z);
      arch.scale.setScalar(0.025);
      group.add(arch);

      for (const side of [-1, 1]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(0.45, 4.6, 14.0), wallMat);
        wall.position.set(side * 4.15, floor + 2.25, z - 5.5);
        wall.receiveShadow = true;
        group.add(wall);
      }

      const roof = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.38, 14.0), wallMat);
      roof.position.set(0, floor + 4.45, z - 5.5);
      group.add(roof);
    }

    const runeMat = new THREE.MeshStandardMaterial({
      color: 0x263e35,
      emissive: new THREE.Color(0x61ffd0),
      emissiveIntensity: 3.0,
      roughness: 0.7,
    });
    for (let z = DARK_SHRINE_START_Z - 18; z > DARK_SHRINE_END_Z + 6; z -= 32) {
      const floor = jungleCourseHeight(z);
      for (const side of [-1, 1]) {
        const rune = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, 1.15), runeMat);
        rune.position.set(side * 3.86, floor + 1.55, z);
        group.add(rune);
      }
      const light = new THREE.PointLight(0x5dffd2, 1.8, 17, 2);
      light.position.set(0, floor + 1.9, z);
      group.add(light);
      this._darkRuneLights.push(light);
    }

    this._darkShrine = group;
    this.root.add(group);
  }

  _updateDarkShrine(dt) {
    const d = -this.z;
    const start = -DARK_SHRINE_START_Z;
    const end = -DARK_SHRINE_END_Z;
    const enter = THREE.MathUtils.smoothstep(d, start, start + DARK_SHRINE_FADE);
    const exit = 1 - THREE.MathUtils.smoothstep(d, end - DARK_SHRINE_FADE, end);
    const target = THREE.MathUtils.clamp(enter * exit, 0, 1);
    this._darkFactor += (target - this._darkFactor) * (1 - Math.exp(-7 * dt));

    if (this.key) this.key.intensity = THREE.MathUtils.lerp(4.5, 0.38, this._darkFactor);
    if (this.hemi) this.hemi.intensity = THREE.MathUtils.lerp(0.6, 0.10, this._darkFactor);
    if (this.kaiTorch) this.kaiTorch.intensity = 5.2 * this._darkFactor;
    if (this.handlerLight) {
      this.handlerLight.color.setRGB(
        THREE.MathUtils.lerp(1.0, 1.0, this._darkFactor),
        THREE.MathUtils.lerp(0.61, 0.20, this._darkFactor),
        THREE.MathUtils.lerp(0.32, 0.10, this._darkFactor),
      );
    }
    if (this.scene?.fog?.isFogExp2) {
      this.scene.fog.density = THREE.MathUtils.lerp(0.014, 0.031, this._darkFactor);
      const base = new THREE.Color(0xcfd6a8);
      const dark = new THREE.Color(0x111a18);
      this.scene.fog.color.copy(base).lerp(dark, this._darkFactor);
    }
    for (let i = 0; i < (this._darkRuneLights?.length || 0); i++) {
      this._darkRuneLights[i].intensity = (1.4 + Math.sin(performance.now() * 0.004 + i) * 0.35) * (0.35 + this._darkFactor);
    }
  }

  _buildObstacles(mats) {
    const rng = makeRng(OBSTACLE_SEED);
    const span = OBSTACLE_LAST_Z - OBSTACLE_FIRST_Z;
    this.obstacles.length = 0;
    this._obsCursor = 0;

    const laneKinds = ["barrier", "trolley", "crate", "barrel", "trap", "wall"];

    let z = OBSTACLE_FIRST_Z;
    while (z > OBSTACLE_LAST_Z) {
      const t = THREE.MathUtils.clamp((z - OBSTACLE_FIRST_Z) / span, 0, 1);

      // Authored set pieces get clean sight-lines. Random props would make the
      // fork, dark shrine, bridge gaps and moving traps unreadable at speed.
      if (scriptedSetPieceZone(z) || (z <= GUARDIAN_CLEAR_NEAR_Z && z >= GUARDIAN_CLEAR_FAR_Z)) {
        const clearStep = OBSTACLE_GAP_START +
          (OBSTACLE_GAP_END - OBSTACLE_GAP_START) * t;
        z -= clearStep;
        continue;
      }

      const roll = rng();

      // Sliding arches stay rarer because they occupy all three lanes; the
      // rest rotate through logs, rocks, crates, barrels, traps and broken
      // shrine walls so the route stops reading as the same three props.
      let kind = laneKinds[Math.floor(rng() * laneKinds.length)];
      if (t > 0.2 && roll < 0.16) kind = "duct";

      if (kind === "duct") {
        this._addObstacle("duct", 1, z);
      } else {
        const lane = Math.floor(rng() * 3);
        this._addObstacle(kind, lane, z);

        // Increasingly common two-lane combinations force a deliberate read
        // without making every obstacle a twitch reaction.
        if (t > 0.2 && rng() < (0.26 + t * 0.28)) {
          const other = (lane + 1 + Math.floor(rng() * 2)) % 3;
          const secondKind = laneKinds[Math.floor(rng() * laneKinds.length)];
          this._addObstacle(secondKind, other, z);
        }
      }

      let step = OBSTACLE_GAP_START + (OBSTACLE_GAP_END - OBSTACLE_GAP_START) * t;
      if (kind === "duct") step += 10;
      z -= step * (0.84 + rng() * 0.32);
    }

    // The fork is now a meaningful risk choice. LEFT is still active play —
    // four clean reads, including a jump and slide — but gives the player more
    // recovery space. RIGHT is the Shrine Trial: tighter spacing and several
    // two-lane combinations, while always preserving one fair answer.
    const leftPath = [
      { z: -808, kind: "barrier", lane: 1 },
      { z: -850, kind: "trolley", lane: 0 },
      { z: -892, kind: "duct", lane: 1 },
      { z: -925, kind: "crate", lane: 2 },
    ];
    for (const spec of leftPath) {
      const offset = -this._routeOffsetMagnitude(spec.z);
      this._addObstacle(spec.kind, spec.lane, spec.z, offset);
    }

    const rightPath = [
      { z: -800, items: [["trolley", 0], ["crate", 2]] },
      { z: -826, items: [["barrier", 1]] },
      { z: -852, items: [["trap", 1], ["wall", 2]] },
      { z: -878, items: [["duct", 1]] },
      { z: -904, items: [["barrel", 0], ["trolley", 1]] },
      { z: -928, items: [["crate", 0], ["barrier", 2]] },
    ];
    for (const site of rightPath) {
      const offset = this._routeOffsetMagnitude(site.z);
      for (const [kind, lane] of site.items) this._addObstacle(kind, lane, site.z, offset);
    }

    this.obstacles.sort((a, b) => b.z - a.z);

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

  _addObstacle(kind, lane, z, offsetX = 0) {
    const spec = OBSTACLE_KINDS[kind];
    this.obstacles.push({
      kind,
      lane,
      z,
      x: LANE_X[lane] + offsetX,
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

    const used = Object.fromEntries(Object.keys(this._obstacleMeshes).map((kind) => [kind, 0]));
    const horizon = this.z - OBSTACLE_AHEAD;

    for (let i = this._obsCursor; i < this.obstacles.length; i++) {
      const o = this.obstacles[i];
      if (o.z < horizon) break; // sorted, so nothing past this is in view either
      const pool = this._obstacleMeshes[o.kind];
      if (used[o.kind] >= pool.length) continue;
      const mesh = pool[used[o.kind]++];
      mesh.position.set(o.x, jungleCourseHeight(o.z) + o.meshY, o.z);
      mesh.visible = true;
    }

    for (const kind of Object.keys(this._obstacleMeshes)) {
      const pool = this._obstacleMeshes[kind];
      for (let i = used[kind]; i < pool.length; i++) pool[i].visible = false;
    }
  }

  _buildAdventureHazards(mats) {
    this._specialHazards.length = 0;

    // 1) Boulder sweeps across the trail just after the dark shrine. The long
    // telegraph makes it a near-miss read, not an off-screen punishment.
    const boulder = cloneProp(this._jungleKit.rock2);
    boulder.scale.setScalar(0.026);
    boulder.position.set(-7.6, jungleCourseHeight(BOULDER_Z) + 0.75, BOULDER_Z);
    this.root.add(boulder);
    this._specialHazards.push({
      type: "boulder", object: boulder, z: BOULDER_Z, triggerZ: BOULDER_Z + 52,
      active: false, t: 0, hit: false,
    });

    // 2) Ancient pendulum. The beam is intentionally bright stone against the
    // greenery and has a full 55 m warning window.
    const swing = new THREE.Group();
    swing.position.set(0, jungleCourseHeight(SWING_LOG_Z) + 3.6, SWING_LOG_Z);
    const swingBeam = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.55, 0.62), mats.stone);
    swingBeam.position.y = -2.15;
    swingBeam.castShadow = true;
    swing.add(swingBeam);
    const swingCap = cloneProp(this._jungleKit.columnShort);
    swingCap.scale.setScalar(0.011);
    swingCap.position.y = -0.3;
    swing.add(swingCap);
    this.root.add(swing);
    this._specialHazards.push({
      type: "swing", object: swing, z: SWING_LOG_Z, triggerZ: SWING_LOG_Z + 58,
      active: false, t: 0, hit: false,
    });

    // 3) One telegraphed falling block. Dust/rumble begins before the stone
    // drops into lane 2, so the answer is simply "move".
    const block = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.75, 1.75), mats.stone);
    block.castShadow = true;
    block.position.set(LANE_X[2], jungleCourseHeight(FALLING_BLOCK_Z) + 8.2, FALLING_BLOCK_Z);
    this.root.add(block);
    this._specialHazards.push({
      type: "fallingBlock", object: block, z: FALLING_BLOCK_Z,
      triggerZ: FALLING_BLOCK_Z + 48, active: false, t: 0, hit: false,
    });

    // 4) Closing shrine doors squeeze the side lanes and leave the centre open.
    const doors = new THREE.Group();
    doors.position.set(0, jungleCourseHeight(CLOSING_DOOR_Z), CLOSING_DOOR_Z);
    const leftDoor = new THREE.Mesh(new THREE.BoxGeometry(3.0, 4.4, 0.75), mats.stone);
    const rightDoor = leftDoor.clone();
    leftDoor.position.set(-5.2, 2.2, 0);
    rightDoor.position.set(5.2, 2.2, 0);
    leftDoor.castShadow = rightDoor.castShadow = true;
    doors.add(leftDoor, rightDoor);
    this.root.add(doors);
    this._specialHazards.push({
      type: "doors", object: doors, leftDoor, rightDoor, z: CLOSING_DOOR_Z,
      triggerZ: CLOSING_DOOR_Z + 55, active: false, t: 0, hit: false,
    });

    // 5) Rotating sweep arm: readable from far away because it never hides in
    // foliage. Jumping cleanly over it or timing the gap both work.
    const rotor = new THREE.Group();
    rotor.position.set(0, jungleCourseHeight(ROTATING_BEAM_Z) + 1.15, ROTATING_BEAM_Z);
    const post = cloneProp(this._jungleKit.columnShort);
    post.scale.setScalar(0.012);
    post.position.y = -1.1;
    rotor.add(post);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.34, 0.34), mats.stone);
    beam.castShadow = true;
    rotor.add(beam);
    this.root.add(rotor);
    this._specialHazards.push({
      type: "rotor", object: rotor, z: ROTATING_BEAM_Z,
      triggerZ: ROTATING_BEAM_Z + 65, active: false, t: 0, hit: false,
    });
  }

  _updateAdventureHazards(dt, x, prevZ) {
    let clipped = false;
    this._specialImpactType = null;
    this._specialImpactX = x;
    const feet = this._flightLift + this.y + (this.sliding ? SLIDE_FEET_Y : PLAYER_FEET_Y);
    const head = this._flightLift + this.y + (this.sliding ? SLIDE_HEAD_Y : PLAYER_HEAD_Y);

    const registerHit = (h, hitX = x) => {
      if (this._flightLift >= JETPACK_SAFE_LIFT) return;
      h.hit = true;
      clipped = true;
      this._specialImpactType = h.type;
      this._specialImpactX = hitX;
    };

    for (const h of this._specialHazards) {
      // The pendulum is part of the world, not a one-shot animation. It keeps
      // swinging even before Kai reaches its warning range, so the player can
      // read the rhythm and choose a lane / jump instead of watching it move
      // once and freeze.
      if (h.type === "swing") {
        h.swingT = (h.swingT || 0) + dt;
        h.swingAngle = Math.sin(h.swingT * 2.55) * 1.08;
        h.object.rotation.z = h.swingAngle;
      }

      if (!h.active && this.z <= h.triggerZ) {
        h.active = true;
        h.t = 0;
        if (this._audio) this._audio.playOneShot("stoneGrind", { volume: h.type === "boulder" ? 0.52 : 0.38 });
        if (h.type === "swing") this._showTransientBanner("SWINGING STONE — TIME THE GAP", 1.7);
      }
      if (!h.active) continue;
      h.t += dt;

      if (h.type === "boulder") {
        const u = THREE.MathUtils.clamp(h.t / 1.55, 0, 1);
        const e = THREE.MathUtils.smoothstep(u, 0, 1);
        h.object.position.x = THREE.MathUtils.lerp(-7.6, 7.6, e);
        h.object.rotation.z -= dt * 5.6;
        h.object.rotation.x += dt * 2.4;
        if (!h.hit && Math.abs(this.z - h.z) < 1.35 && Math.abs(x - h.object.position.x) < 1.2) {
          registerHit(h, h.object.position.x);
        }
      } else if (h.type === "swing") {
        const angle = h.swingAngle || 0;
        const crossed = prevZ >= h.z - 0.82 && this.z <= h.z + 0.82;
        if (!h.hit && crossed) {
          // Exact 2D beam segment in X/Y. Because the pendulum swings through
          // more than sixty degrees, one side of the trail can be high while
          // the other is low: lane choice, jump and slide all become legitimate
          // dodges instead of a binary "beam happened to be low" test.
          const floor = jungleCourseHeight(h.z);
          const pivotY = floor + 3.6;
          const half = 3.8;
          const localY = -2.15;
          const c = Math.cos(angle);
          const sn = Math.sin(angle);
          const ax = -half * c - localY * sn;
          const ay = pivotY + (-half * sn + localY * c);
          const bx = half * c - localY * sn;
          const by = pivotY + (half * sn + localY * c);
          const vx = bx - ax;
          const vy = by - ay;
          const len2 = vx * vx + vy * vy;
          const samples = [
            floor + feet + 0.12,
            floor + (feet + head) * 0.5,
            floor + head - 0.12,
          ];
          let minDist = Infinity;
          for (const py of samples) {
            const u = THREE.MathUtils.clamp(((x - ax) * vx + (py - ay) * vy) / len2, 0, 1);
            const qx = ax + vx * u;
            const qy = ay + vy * u;
            minDist = Math.min(minDist, Math.hypot(x - qx, py - qy));
          }
          if (minDist < 0.50) registerHit(h, x);
        }
      } else if (h.type === "fallingBlock") {
        const u = THREE.MathUtils.clamp(h.t / 0.95, 0, 1);
        const drop = u * u;
        const floor = jungleCourseHeight(h.z);
        h.object.position.y = THREE.MathUtils.lerp(floor + 8.2, floor + 0.88, drop);
        h.object.rotation.x += dt * 1.4;
        if (!h.hit && u > 0.58 && Math.abs(this.z - h.z) < 1.1 && Math.abs(x - LANE_X[2]) < 1.0 && head > 0.05) {
          registerHit(h, LANE_X[2]);
        }
      } else if (h.type === "doors") {
        const u = THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(h.t / 1.2, 0, 1), 0, 1);
        const lx = THREE.MathUtils.lerp(-5.2, -2.75, u);
        const rx = -lx;
        h.leftDoor.position.x = lx;
        h.rightDoor.position.x = rx;
        const crossed = prevZ >= h.z - 0.65 && this.z <= h.z + 0.65;
        const innerEdge = Math.abs(lx) - 1.5;
        if (!h.hit && crossed && Math.abs(x) + PLAYER_RADIUS > innerEdge) {
          registerHit(h, Math.sign(x || 1) * innerEdge);
        }
      } else if (h.type === "rotor") {
        h.object.rotation.y += dt * 2.45;
        const crossed = prevZ >= h.z - 0.65 && this.z <= h.z + 0.65;
        if (!h.hit && crossed && feet < 1.48) {
          // Distance from Kai to the rotating 7.4 m line segment in XZ.
          const a = h.object.rotation.y;
          const hx = Math.cos(a) * 3.7;
          const hz = Math.sin(a) * 3.7;
          const px = x;
          const pz = this.z - h.z;
          const len2 = hx * hx + hz * hz;
          const t = THREE.MathUtils.clamp((px * hx + pz * hz) / len2, -1, 1);
          const dx = px - hx * t;
          const dz = pz - hz * t;
          if (Math.hypot(dx, dz) < 0.58) {
            registerHit(h, x);
          }
        }
      }
    }

    return clipped;
  }

  _triggerHandlerFromMovingImpact(type, hitX, state) {
    if (this.caught || this.escaped || this._handlerSealed || !this.handler) return;

    // A moving shrine object is a loud mistake: the impact itself costs normal
    // stumble distance, then the noise gives the Handler a short aggressive
    // burst. We clamp above zero so this event does not secretly become an
    // instant-kill mechanic; the Handler still has to physically close the gap.
    this.gap = Math.max(1.15, this.gap - HANDLER_IMPACT_GAP_LOSS);
    this._handlerRageT = Math.max(this._handlerRageT, HANDLER_RAGE_TIME);

    // Make the collision read on Kai, not just in a number. The body kicks away
    // from the side the moving object arrived from and settles back naturally.
    const relative = this._worldX - hitX;
    this._impactLeanDir = Math.sign(relative || (this.lane === 0 ? 1 : -1));
    this._impactLeanT = IMPACT_LEAN_TIME;

    // Give the player a very quick involuntary glance behind: long enough to
    // see the red light surge, short enough that we do not steal the camera
    // during the next obstacle read.
    this._autoLook = Math.max(this._autoLook, 0.42);
    this._shake = Math.max(this._shake, 0.72);
    this.handlerLight.intensity = Math.max(this.handlerLight.intensity, this._handlerLightBase * 1.35);

    state.handlerState = "TRIGGERED";
    state.handlerGap = this.gap;
    this._showTransientBanner("IMPACT ALERTED THE MARSHAL — RUN!", 1.25);
  }

  _buildHandlerPressureProps() {
    this._handlerPressureEvents.length = 0;
    const defs = [
      { z: -1885, side: 1 },
      { z: -2705, side: -1 },
    ];
    for (const def of defs) {
      const pivot = new THREE.Group();
      pivot.position.set(def.side * 4.7, jungleCourseHeight(def.z), def.z);
      const column = cloneProp(this._jungleKit.column);
      column.scale.setScalar(0.018);
      column.position.y = 0;
      pivot.add(column);
      this.root.add(pivot);
      this._handlerPressureEvents.push({ ...def, pivot, active: false, t: 0 });
    }
  }

  _updateHandlerPressure(dt) {
    if (!this.handler) return;
    for (const ev of this._handlerPressureEvents) {
      if (!ev.active && this.handler.position.z <= ev.z + 5) {
        ev.active = true;
        ev.t = 0;
        if (this._audio) this._audio.playOneShot("stoneGrind", { volume: 0.48 });
      }
      if (!ev.active || ev.t >= 1) continue;
      ev.t = Math.min(1, ev.t + dt / 0.8);
      const t = THREE.MathUtils.smoothstep(ev.t, 0, 1);
      ev.pivot.rotation.z = ev.side * 1.15 * t;
      if (ev.t > 0.72) this._shake = Math.max(this._shake, 0.12);
    }
  }

  _buildFallingTrees() {
    this._fallingTrees.length = 0;

    for (const def of FALLING_TREE_EVENTS) {
      const pivot = new THREE.Group();
      pivot.position.set(def.side * 4.8, jungleCourseHeight(def.z), def.z);

      const tree = cloneProp(this._jungleKit.deadTree || this._jungleKit.tree4);
      tree.scale.setScalar(0.034);
      tree.rotation.y = def.side < 0 ? 0.25 : -0.25;
      pivot.add(tree);

      // A tiny dust/leaf marker at the base makes the source of the motion
      // readable before the trunk starts sweeping across the path.
      const base = cloneProp(this._jungleKit.bush1);
      base.scale.setScalar(0.015);
      base.position.x = -def.side * 0.25;
      pivot.add(base);

      this.root.add(pivot);
      this._fallingTrees.push({
        ...def,
        pivot,
        phase: "waiting",
        t: 0,
        clipped: false,
        landedSound: false,
      });
    }
  }

  /**
   * Trees begin falling while they are still well ahead of Kai. Once low
   * enough, the trunk becomes a full-width jump obstacle.
   */
  _updateFallingTrees(dt, prevZ) {
    let collision = null;

    for (const ev of this._fallingTrees) {
      const treeTrigger = ev.behind ? ev.z - 4 : ev.z + FALL_TREE_TRIGGER_AHEAD;
      if (ev.phase === "waiting" && this.z <= treeTrigger) {
        ev.phase = "falling";
        ev.t = 0;
        if (this._audio) this._audio.playOneShot("treeCreak", { volume: ev.behind ? 0.72 : 0.55 });
      }

      if (ev.phase === "falling") {
        ev.t = Math.min(1, ev.t + dt / FALL_TREE_TIME);
        const t = THREE.MathUtils.smoothstep(ev.t, 0, 1);
        ev.pivot.rotation.z = ev.side * (Math.PI / 2) * t;

        if (ev.t >= 1) {
          ev.phase = "landed";
          if (!ev.landedSound && this._audio) {
            ev.landedSound = true;
            this._audio.playOneShot("treeCrash", { volume: 0.78 });
            this._shake = Math.max(this._shake, 0.22);
          }
        }
      }

      const active = ev.phase === "landed" || (ev.phase === "falling" && ev.t >= FALL_TREE_COLLIDE_FROM);
      if (ev.behind || !active || ev.clipped) continue;

      // swept z test, same logic as the static obstacle course
      if (ev.z + FALL_TREE_HALF_Z + CLIP_PAD_Z < this.z) continue;
      if (prevZ <= ev.z - FALL_TREE_HALF_Z - CLIP_PAD_Z) continue;

      const feet = this._flightLift + this.y + (this.sliding ? SLIDE_FEET_Y : PLAYER_FEET_Y);
      if (feet >= FALL_TREE_HI_Y) continue; // jumped it

      ev.clipped = true;
      collision = ev;
    }

    return collision;
  }

  _buildGuardianTeases() {
    this._guardianTeases.length = 0;
    const defs = [
      { z: -540, x: 8.2, side: 1, smash: false },
      { z: -1095, x: -5.4, side: -1, smash: false },
      { z: -1270, x: 5.7, side: 1, smash: true },
    ];

    for (const def of defs) {
      const group = new THREE.Group();
      group.position.set(def.x, jungleCourseHeight(def.z), def.z);
      const beast = cloneProp(this._jungleKit.stag);
      beast.scale.setScalar(0.0115);
      beast.rotation.y = def.side > 0 ? -0.7 : 0.7;
      group.add(beast);

      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2a14, fog: false });
      for (const ex of [-0.11, 0.11]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 7, 5), eyeMat);
        eye.position.set(ex, 1.22, 0.36);
        group.add(eye);
      }
      const glow = new THREE.PointLight(0xff2a14, 0, 13, 2);
      glow.position.set(0, 1.25, 0.4);
      group.add(glow);

      let wallPieces = null;
      if (def.smash) {
        wallPieces = [];
        for (const y of [0.8, 2.3]) {
          const piece = cloneProp(this._jungleKit.wall);
          piece.scale.setScalar(0.009);
          piece.position.set(-def.side * 0.4, y - 1.0, -0.4);
          group.add(piece);
          wallPieces.push(piece);
        }
      }

      this.root.add(group);
      this._guardianTeases.push({ ...def, group, beast, glow, wallPieces, awake: false, t: 0 });
    }
  }

  _updateGuardianTeases(dt) {
    for (const tease of this._guardianTeases) {
      const dz = Math.abs(this.z - tease.z);
      if (!tease.awake && dz < 85) {
        tease.awake = true;
        tease.t = 0;
        if (this._audio) this._audio.playOneShot("shrinePulse", { volume: tease.smash ? 0.65 : 0.32 });
      }
      if (!tease.awake) continue;

      tease.t += dt;
      const proximity = 1 - THREE.MathUtils.clamp(dz / 85, 0, 1);
      tease.glow.intensity = 0.4 + proximity * 4.6 + Math.sin(tease.t * 7) * 0.2;

      // The statue turns toward Kai as he passes. That small motion is enough
      // to make the first two sightings unsettling before the real charge.
      const dx = this._worldX - tease.group.position.x;
      const dzToPlayer = this.z - tease.group.position.z;
      const targetYaw = Math.atan2(dx, dzToPlayer);
      tease.beast.rotation.y += (targetYaw - tease.beast.rotation.y) * (1 - Math.exp(-2.8 * dt));

      if (tease.smash && tease.wallPieces) {
        const smash = THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(tease.t / 0.7, 0, 1), 0, 1);
        for (let i = 0; i < tease.wallPieces.length; i++) {
          const p = tease.wallPieces[i];
          p.position.x = -tease.side * (0.4 + smash * (1.6 + i * 0.4));
          p.rotation.z = tease.side * smash * (0.55 + i * 0.2);
          p.rotation.y = smash * (i ? -0.5 : 0.45);
        }
        if (smash > 0.6) this._shake = Math.max(this._shake, 0.10);
      }

      if (this.z < tease.z - 28) {
        tease.glow.intensity *= 0.92;
        if (this.z < tease.z - 70) tease.group.visible = false;
      }
    }
  }

  _buildStoryLetters() {
    const branchLetterOffset = this._routeOffsetMagnitude(-780);
    const defs = [
      // Same dead drop on BOTH fork routes: equal difficulty and equal reward.
      { id: "level01-1", lane: 1, x: -branchLetterOffset, z: -780, text: "Crew log, day 3: We went past the stone. The birds stopped. Nobody has spoken since." },
      { id: "level01-1", lane: 1, x: branchLetterOffset, z: -780, text: "Crew log, day 3: We went past the stone. The birds stopped. Nobody has spoken since." },
      { id: "level01-2", lane: 0, z: -1115, text: "Company memo: The men will not cross the ridge while the horn sits on that stone. Find someone the forest trusts." },
      { id: "level01-3", lane: 2, z: -1260, text: "Company memo: Our man at the fire has agreed. His fee is paid when the horn is in our hands \u2014 not before." },
    ];

    for (const def of defs) {
      const group = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({
        color: 0xd6fff2,
        emissive: new THREE.Color(0x4fffd0),
        emissiveIntensity: 2.8,
        roughness: 0.3,
        metalness: 0.15,
      });
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), mat);
      shard.rotation.z = Math.PI * 0.25;
      group.add(shard);
      const halo = new THREE.PointLight(0x53ffd2, 2.2, 9, 2);
      group.add(halo);
      group.position.set(def.x ?? LANE_X[def.lane], jungleCourseHeight(def.z) + 1.2, def.z);
      group.visible = !this.state?.letters?.includes(def.id);
      this.root.add(group);
      this._storyLetters.push({ ...def, group, collected: !group.visible, spin: Math.random() * Math.PI * 2 });
    }
  }

  _updateStoryLetters(dt, state, x, prevZ) {
    for (const letter of this._storyLetters) {
      if (letter.collected) continue;
      letter.spin += dt * 2.4;
      letter.group.rotation.y = letter.spin;
      letter.group.position.y = jungleCourseHeight(letter.z) + 1.2 + Math.sin(letter.spin * 1.7) * 0.12;

      const crossed = prevZ >= letter.z - 0.7 && this.z <= letter.z + 0.7;
      const targetX = letter.x ?? LANE_X[letter.lane];
      if (crossed && Math.abs(x - targetX) < 0.95) {
        state.collectLetter(letter.id);
        for (const same of this._storyLetters) {
          if (same.id === letter.id) {
            same.collected = true;
            same.group.visible = false;
          }
        }
        this._showStoryCard(letter.text, state.letters.length);
        if (this._audio) this._audio.playOneShot("shrinePulse", { volume: 0.46 });
      }
    }
  }

  _updateCollapsingBridge(dt, x, prevZ, state) {
    if (!this._bridgeCueShown && this.z <= BRIDGE_START_Z + 34) {
      this._bridgeCueShown = true;
      this._showTransientBanner("BRIDGE COLLAPSING — DODGE THE GAPS AND DON'T STOP", 2.3);
    }

    if (this._flightLift < JETPACK_SAFE_LIFT) {
      for (const gap of BRIDGE_GAPS) {
        const key = `${gap.lane}:${gap.z}`;
        if (this._bridgeGapHits.has(key)) continue;
        const overlapZ = prevZ >= gap.z - gap.halfZ && this.z <= gap.z + gap.halfZ;
        if (!overlapZ) continue;
        if (Math.abs(x - LANE_X[gap.lane]) <= 0.95) {
          this._bridgeGapHits.add(key);
          this._instantLose(state, "bridge", "Kai fell through the collapsing shrine bridge. Restart the level to try again.");
          return true;
        }
      }
    }

    for (const panel of this._bridgePanels || []) {
      const pz = panel.userData.bridgeZ;
      if (panel.userData.collapseT < 0 && this.z < pz - BRIDGE_DROP_BEHIND) {
        panel.userData.collapseT = 0;
        if (!this._bridgeLastCrackZ || Math.abs(pz - this._bridgeLastCrackZ) > 18) {
          this._bridgeLastCrackZ = pz;
          if (this._audio) this._audio.playOneShot("bridgeCrack", { volume: 0.42 });
          this._shake = Math.max(this._shake, 0.08);
        }
      }
      if (panel.userData.collapseT >= 0 && panel.visible) {
        panel.userData.collapseT += dt;
        const t = THREE.MathUtils.clamp(panel.userData.collapseT / 0.82, 0, 1);
        panel.position.y = panel.userData.baseY - t * t * 24;
        panel.rotation.x = panel.userData.baseRotX + t * (0.9 + panel.userData.bridgeLane * 0.22);
        panel.rotation.z = (panel.userData.bridgeLane - 1) * t * 0.62;
        if (t >= 1) panel.visible = false;
      }
    }
    return false;
  }

  _instantLose(state, cause, message) {
    if (this.caught || this.escaped) return;
    this.caught = true;
    this.failCause = cause;
    this.finished = true;
    state.alive = false;
    state.failCause = cause;
    state.handlerState = cause === "guardian" ? "GUARDIAN" : "CAUGHT";
    this.speed = 0;
    this.boostSpeed = 0;
    this._shake = 1;
    if (this._audio) this._audio.playOneShot("handlerCatch", { volume: 1 });
    this._duckMusic(0.85);
    this._showCaughtOverlay(message);
  }

  _buildTempleRewards() {
    const rewards = [];
    const rng = makeRng(20261004);

    const add = (x, z, yOffset = 1.12, value = 10, color = 0xffd76b) => {
      rewards.push({
        x, z, yOffset, value, color,
        collected: false,
        phase: rng() * Math.PI * 2,
      });
    };

    const laneAt = (lane, z, side = this._routeSide) =>
      LANE_X[lane] + this._routeOffsetAt(z, side);

    // Main course: alternating straight lines, lane weaves and jump arcs.
    // High tokens sit around 2.7 m above the trail, so the capsule has to jump
    // to bring its centre through them.
    let site = 0;
    for (let d = 170; d <= 3050; d += 48 + Math.floor(rng() * 15)) {
      const z = -d;
      if (z <= ROUTE_SPLIT_START_Z + 25 && z >= ROUTE_SPLIT_END_Z - 20) continue;
      if (scriptedSetPieceZone(z) && site % 3 === 1) {
        site++;
        continue;
      }

      const lane = site % 3;
      const pattern = site % 5;

      if (pattern === 1 || pattern === 4) {
        const ys = [1.12, 1.62, 2.18, 2.72, 2.18, 1.62, 1.12];
        for (let i = 0; i < ys.length; i++) {
          const rz = z - i * 2.25;
          add(laneAt(lane, rz, 0), rz, ys[i], ys[i] > 2.5 ? 25 : 10, ys[i] > 2.5 ? 0x7fffd1 : 0xffd76b);
        }
      } else if (pattern === 2) {
        for (let i = 0; i < 5; i++) {
          const l = (lane + i) % 3;
          const rz = z - i * 2.7;
          add(laneAt(l, rz, 0), rz, 1.12, 10, 0xffd76b);
        }
      } else {
        for (let i = 0; i < 4; i++) {
          const rz = z - i * 2.6;
          add(laneAt(lane, rz, 0), rz, 1.12, 10, 0xffd76b);
        }
      }
      site++;
    }

    // Fork rewards: the left path is the easier route with a readable line.
    for (let z = -748; z >= -958; z -= 18) {
      add(LANE_X[1] + this._routeOffsetAt(z, -1), z, 1.12, 10, 0xffd76b);
    }

    // The Shrine Trial is harder, so it pays better: dense alternating lanes
    // and several high-value jump tokens.
    let n = 0;
    for (let z = -748; z >= -958; z -= 11.5) {
      const lane = n % 2 === 0 ? 0 : 2;
      const high = n % 3 === 1;
      add(
        LANE_X[lane] + this._routeOffsetAt(z, 1),
        z,
        high ? 2.68 : 1.12,
        high ? 30 : 15,
        high ? 0x80ffe0 : 0xffb84f,
      );
      n++;
    }

    // Aerial reward ribbons after each booster. If the booster is missed these
    // are intentionally out of reach, making the pickup feel like a real
    // alternate layer rather than only a speed change.
    for (const booster of JETPACK_PICKUPS) {
      for (let i = 0; i < 22; i++) {
        const z = booster.z - 12 - i * 5.0;
        const lane = (booster.lane + (i > 7 && i < 14 ? 1 : 0)) % 3;
        const x = LANE_X[lane] + this._routeOffsetAt(z, 0);
        add(x, z, JETPACK_HEIGHT + 1.05 + Math.sin(i * 0.55) * 0.35, 20, 0x8cecff);
      }
    }

    // The coins: struck gold, the horn on both faces. A lathe-turned body (a
    // raised rim, a recessed field, a domed centre) and the horn in relief on
    // each face, as two instanced meshes driven by the same matrices; a
    // reflection map so the gold reads as metal and not as yellow plastic.
    // Each instance's colour tints it: gold, or the rare high coins' teal.
    const body = new THREE.LatheGeometry([
      [0, 0.034], [0.085, 0.034], [0.095, 0.026], [0.19, 0.026], [0.205, 0.038], [0.25, 0.038],
      [0.27, 0.026], [0.27, -0.026], [0.25, -0.038], [0.205, -0.038], [0.19, -0.026], [0.095, -0.026],
      [0.085, -0.034], [0, -0.034],
    ].map(([r, y]) => new THREE.Vector2(r, y)), 44);
    body.rotateX(Math.PI / 2); // stood on edge, facing down the trail
    const emblem = coinEmblemGeometry();
    const metal = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.26, metalness: 0.9,
      emissive: new THREE.Color(0x4a3000), emissiveIntensity: 0.45,
      envMap: this._coinEnvMap(), envMapIntensity: 1.25,
    });
    const mesh = new THREE.InstancedMesh(body, metal, rewards.length);
    mesh.name = "temple-run-rewards";
    const discMesh = new THREE.InstancedMesh(emblem, metal, rewards.length);
    discMesh.name = "temple-run-rewards-emblem";
    for (const m of [mesh, discMesh]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.castShadow = true;
    }
    for (let i = 0; i < rewards.length; i++) {
      const c = new THREE.Color(rewards[i].color === 0xffd76b ? 0xffc23a : rewards[i].color);
      mesh.setColorAt(i, c);
      discMesh.setColorAt(i, c);
    }
    mesh.instanceColor.needsUpdate = true;
    discMesh.instanceColor.needsUpdate = true;

    this._rewardItems = rewards;
    this._rewardMesh = mesh;
    this._rewardDiscMesh = discMesh;
    this.root.add(mesh);
    this.root.add(discMesh);
    this._updateRewardInstances(0);
  }

  /** A soft studio reflection for the coins' gold, made once from three's RoomEnvironment. */
  _coinEnvMap() {
    if (this._coinEnv) return this._coinEnv;
    const renderer = this.game?.renderer;
    if (!renderer) return null;
    const pmrem = new THREE.PMREMGenerator(renderer);
    this._coinEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    return this._coinEnv;
  }

  _updateRewardInstances(dt) {
    if (!this._rewardMesh) return;
    this._rewardTime += dt;
    const dummy = this._rewardDummy;

    for (let i = 0; i < this._rewardItems.length; i++) {
      const r = this._rewardItems[i];
      const visible =
        !r.collected &&
        r.z >= this.z - REWARD_VISIBLE_AHEAD &&
        r.z <= this.z + REWARD_VISIBLE_BEHIND;

      if (!visible) {
        dummy.position.set(0, -500, 0);
        dummy.scale.setScalar(0.001);
        dummy.rotation.set(0, 0, 0);
      } else {
        // upright, bobbing, spinning on the spot like every runner's coins
        const bob = Math.sin(this._rewardTime * 3.6 + r.phase) * 0.11;
        dummy.position.set(r.x, jungleCourseHeight(r.z) + r.yOffset + bob, r.z);
        dummy.rotation.set(0, this._rewardTime * 3.2 + r.phase, 0);
        dummy.scale.setScalar(1.05);
      }
      dummy.updateMatrix();
      this._rewardMesh.setMatrixAt(i, dummy.matrix);
      this._rewardDiscMesh.setMatrixAt(i, dummy.matrix);
    }
    this._rewardMesh.instanceMatrix.needsUpdate = true;
    this._rewardDiscMesh.instanceMatrix.needsUpdate = true;
  }

  _updateTempleRewards(dt, x, prevZ, state) {
    const playerY = this._floorY + this.y + this._flightLift + 1.05;

    for (const r of this._rewardItems) {
      if (r.collected) continue;
      if (r.z > prevZ + REWARD_PICKUP_Z || r.z < this.z - REWARD_PICKUP_Z) continue;

      const crossed = prevZ >= r.z - REWARD_PICKUP_Z && this.z <= r.z + REWARD_PICKUP_Z;
      if (!crossed || Math.abs(x - r.x) > REWARD_PICKUP_X) continue;

      const rewardY = jungleCourseHeight(r.z) + r.yOffset;
      if (Math.abs(playerY - rewardY) > REWARD_PICKUP_Y) continue;

      r.collected = true;
      this.rewardCount++;
      this.rewardScore += r.value;
      state.templeRewards = this.rewardCount;
      state.templeScore = this.rewardScore;

      if (this._audio) this._audio.playOneShot("coin", { volume: 0.42, rate: 0.97 + Math.random() * 0.06 });
    }

    this._updateRewardInstances(dt);
  }

  _buildJetpackPickups() {
    const material = new THREE.MeshStandardMaterial({
      color: 0x9feaff,
      emissive: new THREE.Color(0x36caff),
      emissiveIntensity: 2.7,
      roughness: 0.22,
      metalness: 0.62,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x2c3d40,
      roughness: 0.5,
      metalness: 0.72,
    });

    for (const def of JETPACK_PICKUPS) {
      const group = new THREE.Group();
      group.name = "jetpack-booster-pickup";

      const core = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.55, 4, 8), material);
      core.rotation.z = Math.PI / 2;
      group.add(core);

      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.07, 8, 20), material);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);

      for (const side of [-1, 1]) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.62, 10), dark);
        tank.position.set(side * 0.34, -0.05, 0);
        tank.rotation.z = 0.18 * side;
        group.add(tank);
      }

      const x = LANE_X[def.lane] + this._routeOffsetAt(def.z, 0);
      group.position.set(x, jungleCourseHeight(def.z) + 1.45, def.z);
      const glow = new THREE.PointLight(0x54dfff, 2.6, 12, 2);
      group.add(glow);
      this.root.add(group);

      this._jetpackPickups.push({ ...def, x, group, collected: false, phase: Math.random() * Math.PI * 2 });
    }
  }

  /**
   * Life-saver packs: small red/white cross kits placed along the route.
   * Collecting one restores HEALTH_PACK_HEAL HP. They are spaced so a clean
   * run picks up ~6-8 of them, but a careless run can still reach 0.
   */
  _buildHealthPacks() {
    this._healthPacks.length = 0;
    const rng = makeRng(20261010);

    // Distribute packs evenly along the course, skipping the fork zone and
    // scripted set-piece zones where they would compete with obstacles.
    const spacing = Math.floor((-GATE_Z - 200) / HEALTH_PACK_COUNT);
    for (let i = 0; i < HEALTH_PACK_COUNT; i++) {
      const d = 180 + i * spacing + Math.floor(rng() * 30);
      const z = -d;
      if (z < GATE_Z + 50) continue;
      // Skip fork zone
      if (z <= ROUTE_SPLIT_START_Z + 10 && z >= ROUTE_SPLIT_END_Z - 10) continue;

      const lane = Math.floor(rng() * 3);
      const x = LANE_X[lane] + this._routeOffsetAt(z, 0);

      // Build a small red cross kit on a white background
      const group = new THREE.Group();
      group.name = "health-pack";

      // White box base
      const boxMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.4,
        metalness: 0.1,
      });
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.36, 0.48), boxMat);
      group.add(box);

      // Red cross on top (two thin bars)
      const crossMat = new THREE.MeshStandardMaterial({
        color: 0xff2222,
        emissive: new THREE.Color(0xff1111),
        emissiveIntensity: 0.6,
        roughness: 0.3,
      });
      const hBar = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.10), crossMat);
      hBar.position.y = 0.19;
      group.add(hBar);
      const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.06, 0.36), crossMat);
      vBar.position.y = 0.19;
      group.add(vBar);

      // Subtle glow so it is visible in fog
      const glow = new THREE.PointLight(0xff4444, 1.2, 6, 2);
      glow.position.y = 0.3;
      group.add(glow);

      group.position.set(x, jungleCourseHeight(z) + 1.0, z);
      this.root.add(group);

      this._healthPacks.push({
        x, z, lane, group, collected: false,
        phase: rng() * Math.PI * 2,
        healAmount: HEALTH_PACK_HEAL,
      });
    }
  }

  _updateHealthPacks(dt, x, prevZ) {
    const playerY = this._floorY + this.y + this._flightLift + 1.05;

    for (const p of this._healthPacks) {
      if (p.collected) continue;

      // Gentle spin and bob
      p.phase += dt * 2.2;
      p.group.rotation.y += dt * 1.8;
      const bob = Math.sin(p.phase * 1.5) * 0.08;
      p.group.position.y = jungleCourseHeight(p.z) + 1.0 + bob;

      // Visibility culling
      if (p.z < this.z - REWARD_VISIBLE_BEHIND || p.z > this.z + REWARD_VISIBLE_AHEAD) {
        p.group.visible = false;
        continue;
      }
      p.group.visible = true;

      // Pickup test (same shape as reward collection)
      const crossed = prevZ >= p.z - REWARD_PICKUP_Z && this.z <= p.z + REWARD_PICKUP_Z;
      if (!crossed) continue;
      if (Math.abs(x - p.x) > REWARD_PICKUP_X) continue;
      if (Math.abs(playerY - (jungleCourseHeight(p.z) + 1.0)) > REWARD_PICKUP_Y) continue;

      p.collected = true;
      p.group.visible = false;
      this._health = Math.min(MAX_HEALTH, this._health + p.healAmount);
      this._showTransientBanner(`+${p.healAmount} HP RESTORED`, 1.2);
      if (this._audio) this._audio.playOneShot("rewardChime", { volume: 0.42 });
    }
  }

  _buildJetpackFx() {
    if (!this.player) return;
    const group = new THREE.Group();
    group.name = "jetpack-flight-fx";
    group.position.set(0, 1.12, 0.24);

    const tankMat = new THREE.MeshStandardMaterial({
      color: 0x31454a,
      roughness: 0.5,
      metalness: 0.72,
    });
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x79eaff,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });

    this._jetpackFlames = [];
    for (const side of [-1, 1]) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.68, 10), tankMat);
      tank.position.set(side * 0.24, 0, 0);
      group.add(tank);

      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.75, 10), flameMat);
      flame.rotation.x = -Math.PI / 2;
      flame.position.set(side * 0.24, -0.28, 0.44);
      group.add(flame);
      this._jetpackFlames.push(flame);
    }

    const glow = new THREE.PointLight(0x61dfff, 0, 7, 2);
    glow.position.set(0, -0.15, 0.35);
    group.add(glow);
    this._jetpackGlow = glow;

    group.visible = false;
    this.player.add(group);
    this._jetpackFx = group;
    if (this.kai) this._buildKaiJetpack(); // Kai loaded first: give him the real pack now
  }

  _updateJetpackPickups(dt, x, prevZ) {
    for (const p of this._jetpackPickups) {
      if (p.collected) continue;
      p.phase += dt * 2.8;
      p.group.rotation.y += dt * 1.7;
      p.group.position.y = jungleCourseHeight(p.z) + 1.45 + Math.sin(p.phase) * 0.18;

      const crossed = prevZ >= p.z - 1.15 && this.z <= p.z + 1.15;
      if (!crossed || Math.abs(x - p.x) > 1.0 || this._flightLift > 1.0) continue;

      p.collected = true;
      p.group.visible = false;
      this._jetpackActive = true;
      this._jetpackT = JETPACK_DURATION;
      this.airborne = false;
      this.sliding = false;
      this.y = 0;
      this.vy = 0;
      this._showTransientBanner("JETPACK \u2014 FLY!", 1.6);
      if (this._audio) this._audio.playOneShot("jetpackIgnite", { volume: 0.48 });
    }
  }

  _updateJetpack(dt) {
    if (this._jetpackActive) {
      this._jetpackT = Math.max(0, this._jetpackT - dt);
      if (this._jetpackT <= 0) this._jetpackActive = false;
    }

    const targetLift = this._jetpackActive ? JETPACK_HEIGHT : 0;
    const rate = this._jetpackActive ? JETPACK_RISE_RATE : JETPACK_FALL_RATE;
    this._flightLift += (targetLift - this._flightLift) * (1 - Math.exp(-rate * dt));
    if (!this._jetpackActive && this._flightLift < 0.015) this._flightLift = 0;

    if (this._jetpackActive) {
      this.airborne = false;
      this.sliding = false;
      this.y = 0;
      this.vy = 0;
    }

    if (this._jetpackFx) {
      this._jetpackFx.visible = this._jetpackActive || this._flightLift > 0.18;
      if (this._jetpackGlow) this._jetpackGlow.intensity = this._jetpackActive ? 3.4 + Math.random() * 0.8 : 0.8;
      for (let i = 0; i < (this._jetpackFlames || []).length; i++) {
        const flame = this._jetpackFlames[i];
        const roar = this._jetpackActive ? 1 : 0.35;
        flame.scale.set(1, (0.8 + Math.sin(this._rewardTime * 23 + i * 1.7) * 0.18 + Math.random() * 0.08) * roar, 1);
        flame.material.opacity = this._jetpackActive ? 0.85 : 0.3;
      }
    }

    // The capsule tilts forward in flight. This is deliberately only the
    // existing placeholder body; it does not import or implement Kai.
    if (this.body) {
      const targetPitch = this._jetpackActive ? -0.34 : 0;
      this.body.rotation.x += (targetPitch - this.body.rotation.x) * (1 - Math.exp(-7 * dt));
    }
  }

  _buildTempleRunHUD() {
    if (typeof document === "undefined" || this._templeHud) return;

    const root = document.createElement("div");
    root.dataset.level01TempleHud = "true";
    Object.assign(root.style, {
      position: "fixed",
      inset: "0",
      zIndex: "8500",
      pointerEvents: "none",
    });

    // The team's Jungle Shrine look (ui/theme.js), laid out like Level 2's
    // HUD and Level 3's FightHUD: KAI on the left, the trail in the middle,
    // the Marshal on the right. Same plaques, same bars, same type.
    root.className = "l1h fh"; // .fh: picks up the theme's colour variables
    const css = document.createElement("style");
    css.textContent = THEME_CSS + LEVEL1_HUD_CSS;
    root.append(css);
    const top = document.createElement("div");
    top.className = "l1h-top";

    const stat = document.createElement("div");
    stat.className = "l1h-player plaque";
    stat.innerHTML = `
      <div class="l1h-name">KAI <em><span data-reward-count>0</span> TOKENS · <span data-reward-score>0</span></em></div>
      <div class="l1h-bar"><div class="l1h-hp" data-health-fill></div><div class="l1h-flash" data-health-flash></div></div>
      <div class="l1h-row"><span data-jetpack-status class="l1h-jet">JETPACK — FIND A BOOSTER</span><span data-health-text>100 / 100</span></div>
    `;

    const handlerPanel = document.createElement("div");
    handlerPanel.className = "l1h-handler plaque";
    handlerPanel.innerHTML = `
      <div class="l1h-name"><span>THE MARSHAL</span><em data-handler-dist>— m</em></div>
      <div class="l1h-state" data-handler-state>APPROACH</div>
    `;

    const progress = document.createElement("div");
    progress.className = "l1h-route plaque";
    const pip = (z, title) => `<i class="l1h-pip" title="${title}" style="left:${((-z / FINISH_DISTANCE) * 100).toFixed(1)}%"></i>`;
    progress.innerHTML = `
      <div class="l1h-name"><span>THE OLD TRAIL</span><b data-distance-left>${Math.round(FINISH_DISTANCE)} m LEFT</b></div>
      <div class="l1h-bar"><div class="l1h-route-fill" data-progress-fill></div>
        ${pip(ROUTE_SPLIT_START_Z, "Fork")}${pip(BRIDGE_START_Z, "Bridge")}${pip(GATE_Z, "Gate")}
        <div class="l1h-dot" data-progress-dot></div></div>
      <div class="l1h-row"><span>THE STONE</span><span data-progress-percent>0%</span><span>THE CAMP</span></div>
    `;
    top.append(stat, progress, handlerPanel);

    // Action controls are kept low-left so the centre remains readable. BOOST
    // is deliberately round with a gold rim; the faint labels underneath show
    // the physical keyboard equivalents without cluttering the buttons.
    const controls = document.createElement("div");
    Object.assign(controls.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      zIndex: "4",
    });

    const actionControls = document.createElement("div");
    Object.assign(actionControls.style, {
      position: "absolute",
      right: "27px",
      bottom: "48px", // clear of the H · CONTROLS pill in the corner
      width: "144px",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      gap: "12px",
      pointerEvents: "auto",
      touchAction: "none",
      filter: "drop-shadow(0 8px 14px rgba(0,0,0,.30))",
    });

    const boostStyle = "width:68px;height:68px;border-radius:50%;border:2px solid rgba(238,193,74,.95);background:radial-gradient(circle at 35% 28%,rgba(255,218,104,.19),rgba(22,24,10,.88) 68%);color:#ffe19a;font:950 11px system-ui;letter-spacing:.08em;cursor:pointer;box-shadow:0 0 0 2px rgba(255,206,89,.08),0 0 20px rgba(237,183,50,.22),inset 0 1px rgba(255,255,255,.12);transition:transform .08s,background .08s,border-color .08s;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px";
    const lookStyle = "width:64px;height:64px;border-radius:50%;border:1px solid rgba(227,187,98,.45);background:radial-gradient(circle at 35% 28%,rgba(255,255,255,.10),rgba(8,18,10,.88) 70%);color:#efe4c8;font:900 9px system-ui;letter-spacing:.06em;cursor:pointer;box-shadow:0 8px 22px rgba(0,0,0,.30),inset 0 1px rgba(255,255,255,.08);transition:transform .08s,background .08s,border-color .08s;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px";

    actionControls.innerHTML = `
      <button type="button" data-screen-hold="boost" data-gold-control="true" title="Hold to boost" style="${boostStyle}">
        <span>BOOST</span>
        <span style="font-size:7px;letter-spacing:.12em;opacity:.28;font-weight:700">SHIFT</span>
      </button>
      <button type="button" data-screen-hold="lookBack" title="Hold to look back" style="${lookStyle}">
        <span>LOOK<br>BACK</span>
        <span style="font-size:7px;letter-spacing:.12em;opacity:.28;font-weight:700">C</span>
      </button>
    `;

    // Proper D-pad at the bottom-right: each arrow sits in the direction it
    // represents instead of being laid out in one horizontal row.
    const dpad = document.createElement("div");
    Object.assign(dpad.style, {
      position: "absolute",
      right: "22px",
      bottom: "128px",
      width: "154px",
      height: "154px",
      display: "grid",
      gridTemplateColumns: "48px 48px 48px",
      gridTemplateRows: "48px 48px 48px",
      gap: "5px",
      pointerEvents: "auto",
      touchAction: "none",
      filter: "drop-shadow(0 8px 14px rgba(0,0,0,.34))",
    });
    const arrowStyle = "width:48px;height:48px;border:1px solid rgba(227,187,98,.45);background:rgba(13,17,11,.82);color:#efe4c8;border-radius:11px;font:950 22px system-ui;cursor:pointer;backdrop-filter:blur(5px);box-shadow:inset 0 1px rgba(255,255,255,.07);transition:transform .08s,background .08s,border-color .08s";
    dpad.innerHTML = `
      <button type="button" data-screen-action="jump" aria-label="jump" title="Jump" style="${arrowStyle};grid-column:2;grid-row:1">↑</button>
      <button type="button" data-screen-action="left" aria-label="move left" title="Move left" style="${arrowStyle};grid-column:1;grid-row:2">←</button>
      <div aria-hidden="true" style="grid-column:2;grid-row:2;width:34px;height:34px;align-self:center;justify-self:center;border-radius:50%;border:1px solid rgba(216,246,154,.15);background:rgba(216,246,154,.035)"></div>
      <button type="button" data-screen-action="right" aria-label="move right" title="Move right" style="${arrowStyle};grid-column:3;grid-row:2">→</button>
      <button type="button" data-screen-action="slide" aria-label="slide" title="Slide" style="${arrowStyle};grid-column:2;grid-row:3">↓</button>
    `;

    controls.append(actionControls, dpad);

    // Sound and pause are compact clickable icons in the top-right, stacked
    // below the handler panel so they never overlap.
    const topActions = document.createElement("div");
    Object.assign(topActions.style, {
      position: "absolute",
      right: "20px",
      top: "90px",
      display: "flex",
      gap: "8px",
      pointerEvents: "auto",
      zIndex: "6",
    });
    const iconStyle = "width:40px;height:40px;border-radius:50%;border:1px solid rgba(227,187,98,.45);background:rgba(13,17,11,.82);color:#efe4c8;font:900 17px system-ui;cursor:pointer;backdrop-filter:blur(6px);box-shadow:0 8px 22px rgba(0,0,0,.28);transition:transform .08s,background .08s,border-color .08s,opacity .12s";
    topActions.innerHTML = `
      <button type="button" data-sound-toggle aria-label="toggle sound" title="Sound on/off" style="${iconStyle}">🔊</button>
      <button type="button" data-pause-toggle aria-label="pause game" title="Pause" style="${iconStyle}">Ⅱ</button>
    `;

    root.append(top, controls, topActions);
    document.body.append(root);

    this._templeHud = root;
    this._hudRewardCount = stat.querySelector("[data-reward-count]");
    this._hudRewardScore = stat.querySelector("[data-reward-score]");
    this._hudJetpack = stat.querySelector("[data-jetpack-status]");
    this._hudHealthFill = stat.querySelector("[data-health-fill]");
    this._hudHealthFlash = stat.querySelector("[data-health-flash]");
    this._hudHealthText = stat.querySelector("[data-health-text]");
    this._hudHealthIcon = stat.querySelector("[data-health-icon]");
    this._hudHandlerDist = handlerPanel.querySelector("[data-handler-dist]");
    this._hudHandlerState = handlerPanel.querySelector("[data-handler-state]");
    this._hudHandlerPanel = handlerPanel;
    this._hudProgressFill = progress.querySelector("[data-progress-fill]");
    this._hudProgressDot = progress.querySelector("[data-progress-dot]");
    this._hudDistanceLeft = progress.querySelector("[data-distance-left]");
    this._hudProgressPercent = progress.querySelector("[data-progress-percent]");
    this._hudCamera = null;
    this._soundButton = topActions.querySelector("[data-sound-toggle]");
    this._pauseButton = topActions.querySelector("[data-pause-toggle]");

    const pressVisual = (button, down) => {
      if (!button) return;
      const gold = button.dataset.goldControl === "true";
      button.style.transform = down ? "translateY(2px) scale(.96)" : "translateY(0) scale(1)";
      if (gold) {
        button.style.background = down
          ? "radial-gradient(circle at 35% 28%,rgba(255,224,130,.34),rgba(58,42,10,.92) 70%)"
          : "radial-gradient(circle at 35% 28%,rgba(255,218,104,.19),rgba(22,24,10,.88) 68%)";
        button.style.borderColor = down ? "rgba(255,229,142,1)" : "rgba(238,193,74,.95)";
      } else {
        button.style.background = down ? "rgba(216,246,154,.20)" : "rgba(13,17,11,.82)";
        button.style.borderColor = down ? "rgba(216,246,154,.72)" : "rgba(227,187,98,.45)";
      }
    };

    controls.querySelectorAll("[data-screen-action]").forEach((button) => {
      const action = button.dataset.screenAction;
      this._hudButtons[action] = button;
      const fire = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.game?.paused) return;
        this._virtualPressed[action] = true;
        pressVisual(button, true);
        window.setTimeout(() => pressVisual(button, false), 110);
      };
      button.addEventListener("pointerdown", fire);
    });

    controls.querySelectorAll("[data-screen-hold]").forEach((button) => {
      const action = button.dataset.screenHold;
      this._hudButtons[action] = button;
      const down = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.game?.paused) return;
        this._virtualHeld.add(action);
        pressVisual(button, true);
        try { button.setPointerCapture(e.pointerId); } catch (_) {}
      };
      const up = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._virtualHeld.delete(action);
        pressVisual(button, false);
      };
      button.addEventListener("pointerdown", down);
      button.addEventListener("pointerup", up);
      button.addEventListener("pointercancel", up);
      button.addEventListener("lostpointercapture", () => {
        this._virtualHeld.delete(action);
        pressVisual(button, false);
      });
    });

    this._soundButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._setSoundEnabled(!this._soundEnabled);
    });

    const togglePause = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (this.game) this.game.setPaused(!this.game.paused);
    };
    this._pauseButton.addEventListener("click", togglePause);

    // Game already owns ESC pause. Wrap (rather than replace) its pause hook so
    // keyboard pause and the on-screen button drive the same overlay/audio state.
    if (this.game) {
      this._previousOnPaused = this.game.onPaused;
      this._pauseHook = (paused, reason) => {
        this._syncPauseUI(paused);
        if (this._previousOnPaused) this._previousOnPaused(paused, reason);
      };
      this.game.onPaused = this._pauseHook;
      this._syncPauseUI(!!this.game.paused);
    }
    this._setSoundEnabled(this._soundEnabled);
  }

  _consumeVirtual(action) {
    if (!this._virtualPressed[action]) return false;
    this._virtualPressed[action] = false;
    return true;
  }

  _virtualDown(action) {
    return this._virtualHeld.has(action);
  }

  _setSoundEnabled(enabled) {
    this._soundEnabled = !!enabled;
    if (this._soundButton) {
      this._soundButton.textContent = this._soundEnabled ? "🔊" : "🔇";
      this._soundButton.title = this._soundEnabled ? "Sound on — click to mute" : "Sound off — click to unmute";
      this._soundButton.setAttribute("aria-label", this._soundEnabled ? "mute sound" : "unmute sound");
      this._soundButton.style.color = this._soundEnabled ? "#f5ffe6" : "#879184";
      this._soundButton.style.opacity = this._soundEnabled ? "1" : ".48";
      this._soundButton.style.borderColor = this._soundEnabled ? "rgba(217,239,201,.35)" : "rgba(150,160,150,.22)";
    }
    this._applyAudioMuteState();
  }

  _applyAudioMuteState(paused = !!this.game?.paused) {
    // Master-volume muting is deliberately used in addition to AudioContext
    // suspension. Some browsers keep already-playing WebAudio nodes audible for
    // a short moment while suspend() resolves asynchronously; master volume 0
    // makes pause/mute immediate for ambience, footsteps, hazards and pursuer
    // sounds alike.
    const listener = this._audio?.listener;
    if (!listener) return;
    const muted = paused || !this._soundEnabled;
    if (typeof listener.setMasterVolume === "function") {
      listener.setMasterVolume(muted ? 0 : 1);
    } else if (listener.gain?.gain) {
      listener.gain.gain.value = muted ? 0 : 1;
    }
  }

  /**
   * Dips the music under one of the big cues — a catch, the gate slam, the
   * win sting — so gameplay feedback is always audible over the loop.
   * `depth` 0..1; update() recovers it at 0.7/s.
   */
  _duckMusic(depth = 0.5) {
    this._musicDuck = Math.min(this._musicDuck, Math.max(0, 1 - depth));
  }

  _syncPauseUI(paused) {
    this._virtualHeld.clear();
    this._virtualPressed = Object.create(null);
    if (this._pauseButton) {
      this._pauseButton.textContent = paused ? "▶" : "Ⅱ";
      this._pauseButton.title = paused ? "Resume" : "Pause";
      this._pauseButton.setAttribute("aria-label", paused ? "resume game" : "pause game");
    }

    // Pause ALL game audio immediately. Master-volume muting is synchronous;
    // AudioContext suspension is a second layer that also stops WebAudio work.
    this._applyAudioMuteState(paused);
    const context = this._audio?.listener?.context;
    if (context) {
      if (paused && context.state === "running") {
        context.suspend().catch(() => {});
      } else if (!paused && context.state === "suspended") {
        context.resume().then(() => this._applyAudioMuteState(false)).catch(() => {});
      }
    }
  }

  _updateTempleRunHUD() {
    if (!this._templeHud) return;

    const progress = THREE.MathUtils.clamp((-this.z) / FINISH_DISTANCE, 0, 1);
    const left = Math.max(0, FINISH_DISTANCE + this.z);

    if (this._hudRewardCount) this._hudRewardCount.textContent = String(this.rewardCount);
    if (this._hudRewardScore) this._hudRewardScore.textContent = String(this.rewardScore);

    // --- health bar ---
    if (this._hudHealthFill) {
      const pct = THREE.MathUtils.clamp(this._health / MAX_HEALTH, 0, 1);
      this._hudHealthFill.style.width = `${(pct * 100).toFixed(1)}%`;
      this._hudHealthFill.closest(".l1h-player")?.classList.toggle("low", pct < 0.3);
    }
    if (this._hudHealthText) {
      this._hudHealthText.textContent = `${Math.ceil(this._health)} / ${MAX_HEALTH}`;
    }
    if (this._hudHealthFlash) {
      // Red flash overlay fades out quickly after a hit
      const flashAlpha = Math.max(0, this._healthFlashT) * 0.7;
      this._hudHealthFlash.style.background = `rgba(255,60,40,${flashAlpha.toFixed(3)})`;
    }

    // --- handler panel (matches Level 2's handler box) ---
    if (this._hudHandlerDist) {
      const gap = this.state?.handlerGap ?? this.gap;
      this._hudHandlerDist.textContent = `${Math.round(gap)} m`;
    }
    if (this._hudHandlerState) {
      const hs = this.state?.handlerState || "APPROACH";
      // Map internal state names to readable labels, same as Level 2
      const labels = {
        IDLE: "APPROACH",
        LOSING_GROUND: "LOSING GROUND",
        CLOSING: "CLOSING",
        TRIGGERED: "TRIGGERED!",
        CAUGHT: "CAUGHT",
        SEALED: "SEALED",
        GUARDIAN: "GUARDIAN",
      };
      this._hudHandlerState.textContent = labels[hs] || hs;
      // ember when he is on you, moss when Kai is pulling away (Level 2's handler box does the same)
      const dangerous = /CAUGHT|TRIGGERED|GUARDIAN|CLOSING/.test(hs);
      this._hudHandlerPanel?.classList.toggle("attack", dangerous);
      this._hudHandlerPanel?.classList.toggle("calm", !dangerous);
    }

    if (this._hudProgressFill) this._hudProgressFill.style.width = `${(progress * 100).toFixed(2)}%`;
    if (this._hudProgressDot) this._hudProgressDot.style.left = `${(progress * 100).toFixed(2)}%`;
    if (this._hudDistanceLeft) this._hudDistanceLeft.textContent = `${Math.ceil(left)} m LEFT`;
    if (this._hudProgressPercent) this._hudProgressPercent.textContent = `${Math.floor(progress * 100)}%`;

    if (this._hudJetpack) {
      if (this._jetpackActive) {
        this._hudJetpack.textContent = `JETPACK — ${this._jetpackT.toFixed(1)} s`;
        this._hudJetpack.style.opacity = "1";
      } else if (this._flightLift > 0.2) {
        this._hudJetpack.textContent = "JETPACK — LANDING";
        this._hudJetpack.style.opacity = ".88";
      } else {
        this._hudJetpack.textContent = "JETPACK — FIND A BOOSTER";
        this._hudJetpack.style.opacity = ".55";
      }
    }

    // Physical keyboard presses light the matching on-screen arrows too. Touch
    // presses already animate themselves immediately through pointer events.
    const physical = {
      left: this.input?.isDown("left"),
      right: this.input?.isDown("right"),
      jump: this.input?.isDown("jump"),
      slide: this.input?.isDown("slide"),
    };
    for (const [name, down] of Object.entries(physical)) {
      const button = this._hudButtons[name];
      if (!button) continue;
      button.style.background = down ? "rgba(216,246,154,.20)" : "rgba(255,255,255,.08)";
      button.style.borderColor = down ? "rgba(216,246,154,.72)" : "rgba(244,255,219,.34)";
    }

    if (this._hudCamera) {
      this._hudCamera.textContent = this._jetpackActive || this._flightLift > 1
        ? "CAMERA: FLIGHT CHASE"
        : this._lookBack > 0.55
          ? "CAMERA: LOOK-BACK"
          : "CAMERA: THIRD-PERSON CHASE";
    }
  }

  _removeTempleRunHUD() {
    if (this.game && this._pauseHook && this.game.onPaused === this._pauseHook) {
      this.game.onPaused = this._previousOnPaused;
    }
    this._pauseHook = null;
    this._previousOnPaused = null;
    this._virtualHeld.clear();
    this._virtualPressed = Object.create(null);
    if (this._templeHud?.parentNode) this._templeHud.parentNode.removeChild(this._templeHud);
    this._templeHud = null;
    this._hudControls = {};
    this._hudButtons = {};
    this._hudHandlerDist = null;
    this._hudHandlerState = null;
    this._hudHandlerPanel = null;
    this._soundButton = null;
    this._pauseButton = null;
  }

  _showTransientBanner(text, seconds = 1.8) {
    if (typeof document === "undefined") return;
    if (this._transientBanner?.parentNode) this._transientBanner.parentNode.removeChild(this._transientBanner);
    if (this._bannerTimer) clearTimeout(this._bannerTimer);

    const el = document.createElement("div");
    el.textContent = text;
    Object.assign(el.style, {
      position: "fixed", left: "50%", top: "12%", transform: "translateX(-50%)",
      zIndex: "9000", padding: "9px 18px 10px", color: "#efe4c8",
      background: "linear-gradient(180deg, rgba(38,44,28,.86), rgba(13,17,11,.82))", border: "1px solid rgba(227,187,98,.45)",
      borderRadius: "3px", fontFamily: DIALOGUE_FONT, fontWeight: "600", fontSize: "15px", letterSpacing: ".16em", textAlign: "center",
      pointerEvents: "none", boxShadow: "0 4px 14px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.07)",
    });
    document.body.append(el);
    this._transientBanner = el;
    this._bannerTimer = setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
      if (this._transientBanner === el) this._transientBanner = null;
    }, seconds * 1000);
  }

  /** A torn page picked up off the trail: the same parchment card Level 3's pages use (StoryOverlay). */
  _showStoryCard(text, found = 0) {
    if (typeof document === "undefined") return;
    if (this._storyCard?.parentNode) this._storyCard.parentNode.removeChild(this._storyCard);
    if (this._storyTimer) clearTimeout(this._storyTimer);
    const card = document.createElement("div");
    card.innerHTML =
      `<div style="font:600 10px 'Segoe UI',system-ui,sans-serif;letter-spacing:.28em;color:#8a5a26;margin-bottom:8px">` +
      `TORN PAGE \u00b7 ${found} / 6 FOUND</div><div style="font-size:19px;line-height:1.35">\u201C${text}\u201D</div>`;
    Object.assign(card.style, {
      position: "fixed", left: "50%", bottom: "20vh", transform: "translateX(-50%) rotate(-1.2deg)",
      width: "min(440px, 84vw)", zIndex: "8999", padding: "18px 22px 16px", color: "#2b2219", background: "#efe6d2",
      borderRadius: "2px", fontFamily: DIALOGUE_FONT, boxShadow: "0 10px 30px #0009", pointerEvents: "none",
    });
    document.body.append(card);
    this._storyCard = card;
    this._storyTimer = setTimeout(() => {
      if (card.parentNode) card.parentNode.removeChild(card);
      if (this._storyCard === card) this._storyCard = null;
    }, 4200);
  }

  _showCaughtOverlay(title = "THE MARSHAL CAUGHT YOU") {
    if (this._caughtOverlay || typeof document === "undefined") return;

    // the team's shared end card (ui/theme.js), same as levels 02 and 03
    this._caughtOverlay = showEndCard({
      kind: "lose",
      title: "CAUGHT",
      sub: title,
      lines: [{ text: `${Math.round(this.state?.distance ?? 0)} M RUN` }],
      action: {
        label: "CONTINUE",
        key: "SPACE",
        onClick: () => {
          this._removeCaughtOverlay();
          this._health = MAX_HEALTH;
          this._healthFlashT = 0;
          this.caught = false;
          this.failCause = null;
          this.finished = false;
          if (this.state) {
            this.state.alive = true;
            this.state.failCause = null;
          }
          this._stumbleT = 0;
          this._stumbleDebt = 0;
          this.speed = this.baseSpeed;
          this.boostSpeed = 0;
          if (this.game) this.game.setPaused(false);
        },
      },
      extra: [
        {
          label: "RESTART LEVEL",
          key: "R",
          bindKey: false,
          onClick: async () => {
            this._removeCaughtOverlay();
            if (!this.game) return;
            this.game.setPaused(false);
            try {
              await this.game.restart();
            } catch (err) {
              console.error("[level01] restart failed", err);
            }
          },
        },
        { label: "RELOAD GAME", onClick: () => window.location.reload() },
      ],
    });
  }

  /** Kai reached the vehicle: the win card, and CONTINUE starts level 02. */
  _showEscapedCard() {
    if (this._escapedCard || typeof document === "undefined") return;
    // the win sting, ducking the music so it owns the moment
    if (this._audio) {
      this._audio.playOneShot("win", { volume: 0.8 });
      this._duckMusic(0.55);
    }
    const distance = Math.round(this.state?.distance ?? 0);
    const closest = Number.isFinite(this._closest) ? this._closest : this.gap;
    this._escapedCard = showEndCard({
      kind: "win",
      title: "ESCAPED",
      sub: "You got the horn off the mountain. The Marshal is still coming.",
      lines: [{ text: `${distance} M  ·  CLOSEST CALL ${Number(closest).toFixed(1)} M` }],
      action: {
        label: "CONTINUE",
        key: "SPACE",
        onClick: () => {
          this._removeEscapedCard();
          this._startLevel02();
        },
      },
    });
  }

  _removeEscapedCard() {
    this._escapedCard?.destroy();
    this._escapedCard = null;
  }

  _removeCaughtOverlay() {
    this._caughtOverlay?.destroy();
    this._caughtOverlay = null;
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
    const feet = this._flightLift + this.y + (this.sliding ? SLIDE_FEET_Y : PLAYER_FEET_Y);
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
        this._duckMusic(0.5);
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
    vehicle.position.set(3.3, 0, SERVICE_CAR_LOCAL_Z);
    vehicle.rotation.y = Math.PI;
    vehicle.userData.isServiceVehicle = true;
    vehicle.userData.startsLevel2 = true;
    camp.add(vehicle);

    const workLight = new THREE.PointLight(0xffd39b, 2.1, 22, 2);
    workLight.position.set(3.3, 5, SERVICE_CAR_LOCAL_Z);
    camp.add(workLight);

    this.serviceVehicle = vehicle;
    this._bayBox = [base, cab, ...vehicle.children.filter((c) => c.geometry?.type === "CylinderGeometry")];
    this._bayCar = { model: null, bounds: { min: new THREE.Vector3(-1.05, 0, -2.05), max: new THREE.Vector3(1.05, 1.85, 2.05) } };
    // headlights, off until Kai is in
    this._bayLights = new CarLights(vehicle);
    this._setBayLights(0);
    this._workLight = workLight;
    this.root.add(camp);
    // the car Level 2 hands you, in its paint, so the bay's car is the one he
    // drives out in. Loaded in the background: the blue van stands in for it
    // until it arrives, and for good if it can't be loaded.
    this._attachBayCar(vehicle);
  }

  async _attachBayCar(vehicle) {
    const def = CARS[loadSavedCar()] || CARS[0];
    if (!def || !this.assets) return;
    const model = await attachModel(this.assets, vehicle, def.path, {
      length: def.length, yaw: def.yaw || 0, ground: def.ground || null, wheels: def.wheels || null,
      keepPlaceholder: true,
    });
    if (!model || !this.serviceVehicle) return; // failed, or torn down meanwhile
    const paint = PAINTS[loadSavedPaint()];
    if (def.paintable !== false && paint) applyPaint(model, paint.color, detectPaint(model));
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    for (const m of this._bayBox) m.visible = false;
    this._bayCar = { model, bounds: model.userData.bounds };
    this._bayLights.fit(model.userData.bounds, model);
    this._setBayLights(this._finale && this._finale.t >= FINALE_LIGHTS ? 1 : 0);
  }

  /** 0 = off, 1 = on: the headlamps' glow. */
  _setBayLights(k) {
    const L = this._bayLights;
    if (!L) return;
    // lamps only: in the small bay the beams just burnt a white patch into
    // the mud in front of the camera
    for (const s of L.spots) s.visible = false;
    for (const m of L._headMats || []) m.emissiveIntensity = 2.2 * k;
    for (const m of L.heads) m.material.color.setScalar(0.25 + 0.75 * k);
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
    this._handlerStub = [coat, head]; // the stand-in, hidden once the monk loads (_buildHandlerModel)
    this._handlerTorch = torch;
    this._handlerBeam = beam;
    this.handler = group;
    this.handlerLight = glow;
    this._handlerLightBase = 2.8;
    this.root.add(group);
  }

  _buildShrineGuardian() {
    const group = new THREE.Group();
    group.name = "cursed-shrine-guardian";
    group.visible = false;

    // Use the Jungle Shrine's existing stag statue as a supernatural guardian
    // rather than introducing an external asset. Darkened stone, red glow and
    // a heavy charge turn it into a readable monster silhouette.
    const beast = cloneProp(this._jungleKit.stag);
    beast.scale.setScalar(0.0185);
    beast.rotation.y = 0;
    beast.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const converted = mats.map((src) => {
        const m = src.clone();
        if (m.color) m.color.multiplyScalar(0.24);
        if ("emissive" in m) {
          m.emissive = new THREE.Color(0x240000);
          m.emissiveIntensity = 0.55;
        }
        m.roughness = Math.max(0.78, m.roughness ?? 0.78);
        return m;
      });
      o.material = Array.isArray(o.material) ? converted : converted[0];
      o.castShadow = true;
    });
    group.add(beast);

    // Two simple emissive eyes are deliberately oversized: they are a gameplay
    // telegraph first and decoration second, especially in fog and at speed.
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2a14, fog: false });
    for (const x of [-0.16, 0.16]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), eyeMat);
      eye.position.set(x, 1.75, 0.62);
      group.add(eye);
    }

    const glow = new THREE.PointLight(0xff3118, 0, 18, 2);
    glow.position.set(0, 1.8, 0.4);
    group.add(glow);

    this.guardian = group;
    this.guardianGlow = glow;
    this.root.add(group);
  }

  _updateShrineGuardian(dt, x, prevZ, state) {
    if (!this.guardian || this._guardianResolved || this.caught || this.escaped) return false;

    if (!this._guardianActive) {
      if (this.z > GUARDIAN_TRIGGER_Z) return false;

      this._guardianActive = true;
      this._guardianLaneX = LANE_X[this.lane];
      this._guardianZ = GUARDIAN_SPAWN_Z;
      this._guardianPhase = 0;
      this.guardian.visible = true;
      this.guardian.position.set(
        this._guardianLaneX,
        jungleCourseHeight(this._guardianZ),
        this._guardianZ,
      );
      this.guardianGlow.intensity = 5.5;
      this._shake = Math.max(this._shake, 0.18);
      if (this._audio) this._audio.playOneShot("guardianRoar", { volume: 0.9 });
      this._duckMusic(0.45);
    }

    const oldGuardianZ = this._guardianZ;
    this._guardianZ += GUARDIAN_SPEED * dt; // +z is toward Kai
    this._guardianPhase += dt * 13;

    // Supernatural gallop: a small vertical thump and fore/aft pitch make the
    // otherwise static statue read as a charging creature instead of a prop
    // sliding along the floor.
    const floorY = jungleCourseHeight(this._guardianZ);
    const thump = Math.abs(Math.sin(this._guardianPhase)) * 0.16;
    this.guardian.position.set(this._guardianLaneX, floorY + thump, this._guardianZ);
    this.guardian.rotation.x = Math.sin(this._guardianPhase) * 0.045;
    this.guardianGlow.intensity = 4.5 + Math.abs(Math.sin(this._guardianPhase * 0.5)) * 2.5;

    // Swept head-on test. The beast is intentionally too tall/wide to jump;
    // changing lanes is the safe answer.
    const playerMinZ = Math.min(prevZ, this.z);
    const playerMaxZ = Math.max(prevZ, this.z);
    const beastMinZ = Math.min(oldGuardianZ, this._guardianZ);
    const beastMaxZ = Math.max(oldGuardianZ, this._guardianZ);
    const zOverlap =
      playerMinZ - GUARDIAN_HALF_Z <= beastMaxZ &&
      playerMaxZ + GUARDIAN_HALF_Z >= beastMinZ;
    const xOverlap = Math.abs(x - this._guardianLaneX) <= GUARDIAN_HALF_X + 0.34;

    if (zOverlap && xOverlap && this._flightLift < JETPACK_SAFE_LIFT) {
      this.caught = true;
      this.failCause = "guardian";
      this.finished = true;
      state.alive = false;
      state.failCause = "guardian";
      state.handlerState = "GUARDIAN";
      this.speed = 0;
      this.boostSpeed = 0;
      this._shake = 1;
      if (this._audio) this._audio.playOneShot("handlerCatch", { volume: 1 });
      this._duckMusic(0.85);
      this._showCaughtOverlay("The forest's guardian caught Kai. Restart the level to try again.");
      return true;
    }

    // Once it has thundered well past Kai, the encounter is complete.
    if (this._guardianZ > this.z + GUARDIAN_DESPAWN_BEHIND) {
      this._guardianResolved = true;
      this._guardianActive = false;
      this.guardian.visible = false;
      this.guardianGlow.intensity = 0;
    }

    return false;
  }

  _clipObstacles(x, prevZ) {
    const feet = this._flightLift + this.y + (this.sliding ? SLIDE_FEET_Y : PLAYER_FEET_Y);
    const head = this._flightLift + this.y + (this.sliding ? SLIDE_HEAD_Y : PLAYER_HEAD_Y);

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
  _handlerVaultOffset(z) {
    for (const center of [-260, -620, -1785, -2910]) {
      const d = Math.abs(z - center);
      if (d < 5.5) {
        const t = 1 - d / 5.5;
        return Math.sin(t * Math.PI) * 1.15;
      }
    }
    return 0;
  }

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
      kaiThinks("The gate! That won\u2019t hold him for long.");
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
      this.handler.position.y = jungleCourseHeight(this.handler.position.z) + this._handlerVaultOffset(this.handler.position.z);
      const sealedX = this._routeOffsetAt(this.handler.position.z, this._routeSide);
      this.handler.position.x += (sealedX - this.handler.position.x) * (1 - Math.exp(-6 * dt));
      this.handlerLight.intensity = this._handlerLightBase * HANDLER_SEALED_GLOW;
      return;
    }

    if (!this.caught && !this.escaped) {
      if (this._handlerRageT > 0) this._handlerRageT = Math.max(0, this._handlerRageT - dt);
      const rageBoost = this._handlerRageT > 0 ? HANDLER_RAGE_SPEED : 0;
      const handlerSpeed = this.baseSpeed + HANDLER_CREEP + rageBoost;
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
        this._duckMusic(0.85);
        this._showCaughtOverlay("The Marshal caught Kai. The horn is the company's now.");
      } else {
        state.handlerState = this._handlerRageT > 0
          ? "TRIGGERED"
          : (this.speed < handlerSpeed ? "CLOSING" : "LOSING_GROUND");
      }
    }

    state.handlerGap = this.gap;
    this._closest = Math.min(this._closest ?? Infinity, this.gap);
    this.handler.position.z = this.z + this.gap;
    this.handler.position.y = jungleCourseHeight(this.handler.position.z) + this._handlerVaultOffset(this.handler.position.z);
    const handlerRouteX = this._routeOffsetAt(this.handler.position.z, this._routeSide);
    this.handler.position.x += (handlerRouteX - this.handler.position.x) * (1 - Math.exp(-6 * dt));

    // squared so he is a faint wash for most of the run and a real presence
    // only once he is genuinely close
    const closeness = 1 - THREE.MathUtils.clamp(this.gap / HANDLER_LIGHT_RANGE, 0, 1);
    this.handlerLight.intensity = this._handlerLightBase * closeness * closeness;
  }

  /**
   * Hands the run on once the finish scene is over: Kai is in the car at the
   * logging camp, and the drive-out scene (level02-intro) takes it from there.
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
    // the drive-out scene (Kai takes the car out onto the River Road) when
    // it's registered, straight into level 02 when it isn't
    const next = game?.levels?.has("level02-intro") ? "level02-intro" : "level02";
    if (!game || !game.levels || !game.levels.has(next)) {
      // running level 01 on its own, e.g. from a test page. Stay put rather
      // than throwing out of a rAF callback.
      console.warn("[level01] reached the vehicle, but no level02 is registered");
      return;
    }

    game.setPaused(true, "switch");
    Promise.resolve().then(async () => {
      try {
        await game.setLevel(next);
      } catch (err) {
        console.error(`[level01] handoff to ${next} failed`, err);
      } finally {
        game.setPaused(false, "switch");
      }
    });
  }

  /* ------------------------------------------------------------ the finish scene */

  /** Kai has reached the bay: hand him and the camera to the finish scene. */
  _startFinale(x) {
    const vehicle = this.serviceVehicle;
    if (!vehicle) {
      this._showEscapedCard();
      return;
    }
    vehicle.updateWorldMatrix(true, false);
    const { min, max } = this._bayCar.bounds;
    const midZ = (min.z + max.z) / 2;
    // The driver's door is on the car's right-hand side (it faces +z in its
    // own frame, so that is min.x): cut out of the body so it can open
    // (level1/carDoor.js). The blue stand-in van has no model to cut.
    const def = this._bayCar.model ? CARS[loadSavedCar()] || CARS[0] : null;
    const carDoor = def ? new CarDoor(this.game.renderer, vehicle, this._bayCar.model, this._bayCar.bounds, def.door) : null;
    const [z0, z1] = carDoor ? carDoor.spec.z : [midZ - 0.2, midZ + 0.9];
    // in the car's frame: where he stands to open it (just behind its rear
    // edge, which swings out past him), where he steps back to as it comes,
    // where he stands in the gap, and the seat. Seated, his head stays under
    // the roof (the convertible has none).
    const local = {
      stand: new THREE.Vector3(min.x - 0.42, 0, z0 - 0.2),
      back: new THREE.Vector3(min.x - 0.7, 0, z0 - 0.3),
      seat: carDoor ? carDoor.seatLocal() : new THREE.Vector3(min.x * 0.35, 0.45, midZ + 0.35),
    };
    local.entry = new THREE.Vector3(min.x - 0.02, 0, local.seat.z);
    local.seat.y = Math.min(local.seat.y + 0.09 - SIT_HIPS, max.y - 0.06 - SIT_HEAD);
    const door = vehicle.localToWorld(local.stand.clone());
    const centre = vehicle.localToWorld(new THREE.Vector3(0, 0, midZ));
    const start = new THREE.Vector3(x, 0, this.z);
    // round the back of the car on the door side, so he never runs through it
    const wide = new THREE.Vector3(door.x + 1.1, 0, Math.max(door.z + 4.5, Math.min(start.z - 2, max.z + centre.z + 1.5)));
    // headings: a direction in the car's frame, turned into the world's
    const carYaw = vehicle.getWorldQuaternion(new THREE.Quaternion());
    const yaw = new THREE.Euler().setFromQuaternion(carYaw, "YXZ").y;
    const handle = new THREE.Vector3(min.x + 0.1, 0, z0 + 0.12);
    if (this.kai && !this.kai.actions.reach) this.kai.pose("reach", "cross", 1.133); // his right arm out at full stretch
    this._finaleV = new THREE.Vector3();
    this._finale = {
      t: 0,
      door, centre, carDoor,
      local, yaw,
      toWorld: (v, out = new THREE.Vector3()) => vehicle.localToWorld(out.copy(v)),
      // facing the handle, facing the gap, facing out of the car, facing the wheel
      faceHandle: yaw + Math.atan2(handle.x - local.stand.x, handle.z - local.stand.z),
      faceEntry: yaw + Math.atan2(local.entry.x - local.back.x, local.entry.z - local.back.z),
      faceOut: yaw - Math.PI / 2,
      faceWheel: yaw,
      sits: !!(this.kai && this.kai.actions.sitting),
      path: new THREE.CatmullRomCurve3([start, wide, door]),
      fogFrom: this.scene.fog ? this.scene.fog.density : 0,
      cam: this.game?.camera ? this.game.camera.position.clone() : new THREE.Vector3(),
      aim: new THREE.Vector3(x, this._floorY + 1.5, this.z - 9),
      shot: "",
      bangs: 0,
      stride: 0,
    };
    // Kai's own rig is posed by hand from here; undo any slide/jump lean
    this.airborne = false;
    this.sliding = false;
    this.y = 0;
    this._lookBack = 0;
    this._autoLook = 0;
    if (this.kai) {
      this.kai.visual.position.set(0, 0, 0);
      this.kai.visual.rotation.set(0, 0, 0);
    }
    if (this._templeHud) {
      this._templeHud.style.transition = "opacity .5s ease";
      this._templeHud.style.opacity = "0";
      this._templeHud.style.pointerEvents = "none";
    }
    this._showLetterbox(true);
  }

  /** Bent forward at the waist by `a` radians, spread down his spine, on top of whatever clip is playing. */
  _bendKai(kai, a) {
    for (const name of ["Spine", "Spine1", "Spine2"]) {
      const b = kai.bones["mixamorig" + name];
      if (!b) continue;
      kai._stash(b); // undone before the next frame's clip, like the prologue's reach
      b.quaternion.multiply(this._bendQ.setFromAxisAngle(this._bendX, a / 3));
    }
  }

  /** Cinema bars, so the scene reads as the game taking the camera. */
  _showLetterbox(on) {
    if (typeof document === "undefined") return;
    if (!this._letterbox) {
      if (!on) return;
      this._letterbox = [0, 1].map((i) => {
        const bar = document.createElement("div");
        Object.assign(bar.style, {
          position: "fixed", left: "0", right: "0", height: "11vh", background: "#000",
          zIndex: "40", pointerEvents: "none", transition: "transform .7s cubic-bezier(.2,.7,.2,1)",
          transform: `translateY(${i ? "100%" : "-100%"})`,
          [i ? "bottom" : "top"]: "0",
        });
        document.body.append(bar);
        return bar;
      });
      // let the closed position land before sliding in
      requestAnimationFrame(() => requestAnimationFrame(() => this._showLetterbox(true)));
      return;
    }
    this._letterbox.forEach((bar, i) => {
      bar.style.transform = on ? "translateY(0)" : `translateY(${i ? "100%" : "-100%"})`;
    });
  }

  _removeLetterbox() {
    for (const bar of this._letterbox || []) bar.remove();
    this._letterbox = null;
  }

  /**
   * The finish scene, run in place of the level's update once Kai is at the
   * bay. Four shots and a hold:
   *
   *   arrive  0.0  low by the car's nose, Kai sprints in and pulls up at the driver's door
   *   look    1.7  over his shoulder, long lens up the trail: the Handler at the
   *               sealed gate, beating on the bars (two flashes and a thud)
   *   door    3.8  behind him at the car: he opens the door, steps round it, sits
   *               in backside first and swings his legs in, and pulls it shut
   *   in      6.8  wide on the car as the door slams: the headlights come on
   *   hold    7.9  ESCAPED card over a slow orbit of the car, engine ticking over
   */
  _updateFinale(dt, state) {
    const F = this._finale;
    const f = (F.t += dt);
    const kai = this.kai;
    const { door, centre, local: L } = F;
    const smooth = (a, b, v) => THREE.MathUtils.smoothstep(v, a, b);
    const groundY = (z) => jungleCourseHeight(z);
    const turn = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k; // the short way round
    const vehicle = this.serviceVehicle;
    const at = (from, to, k) => F.toWorld(this._finaleV.lerpVectors(from, to, k), pos);

    // ---- Kai
    const pos = this.player.position;
    let heading = 0;
    let anim = "idle";
    let speed = 1;
    let bend = 0; // forward at the waist: reaching down for the handle, ducking in under the roof line
    let inCar = false;
    if (f < FINALE_ARRIVE) {
      // decelerating sprint: fast in, easing to a stop at the door
      const k = f / FINALE_ARRIVE;
      const u = 1 - (1 - k) * (1 - k);
      const p = F.path.getPointAt(u);
      const tan = F.path.getTangentAt(u);
      heading = Math.atan2(tan.x, tan.z);
      F.heading = heading;
      pos.set(p.x, groundY(p.z), p.z);
      anim = k < 0.88 ? "run" : "idle";
      const pace = (1 - k) * 2; // 2 -> 0, in path-lengths per second
      F.stride += pace * F.path.getLength() * dt;
      if (F.stride > 2.2 && anim === "run") {
        F.stride = 0;
        this._audio?.playFootstep({ volume: 0.45, pitchVariance: 0.08, minInterval: 0, dt });
      }
      speed = 0.55 + 0.85 * (1 - k);
    } else if (f < FINALE_LOOK) {
      // turns round at the door to look back the way he came
      const back = 0; // facing +z, up the trail
      heading = THREE.MathUtils.lerp(F.heading, back, smooth(FINALE_ARRIVE, FINALE_ARRIVE + 0.6, f));
      pos.set(door.x, groundY(door.z), door.z);
    } else if (f < FINALE_OPEN) {
      // round to the door, and his hand goes to the handle
      heading = turn(0, F.faceHandle, smooth(FINALE_LOOK, FINALE_LOOK + 0.4, f));
      pos.set(door.x, groundY(door.z), door.z);
      if (f > FINALE_REACH - 0.25) {
        anim = "reach";
        bend = 0.24 * smooth(FINALE_REACH - 0.25, FINALE_REACH, f);
      }
    } else if (f < FINALE_STEP) {
      // the latch goes and he pulls: the door swings out past him as he steps back from it
      const k = smooth(FINALE_OPEN + 0.05, FINALE_OPEN + 0.45, f);
      at(L.stand, L.back, k);
      heading = F.faceHandle;
      if (f < FINALE_OPEN + 0.2) {
        anim = "reach";
        bend = 0.24;
      } else if (k < 0.97) {
        anim = "walkback";
        speed = 0.7;
      }
    } else if (f < FINALE_SIT) {
      // round it into the gap, and his back to the seat as he gets there
      const k = smooth(FINALE_STEP, FINALE_SIT - 0.08, f);
      at(L.back, L.entry, k);
      heading = turn(F.faceHandle, F.faceEntry, smooth(FINALE_STEP, FINALE_STEP + 0.15, f));
      heading = turn(heading, F.faceOut, smooth(FINALE_SIT - 0.22, FINALE_SIT, f));
      if (k < 0.92) {
        anim = "walk";
        speed = 1.15;
      }
    } else if (F.sits) {
      // backside first onto the seat, his head ducked under the roof line, then
      // round on it to face the wheel with his legs swung in after him
      at(L.entry, L.seat, smooth(FINALE_SIT, FINALE_SWING, f));
      pos.y += vehicle.position.y; // the car ticking over, him in it
      heading = turn(F.faceOut, F.faceWheel, smooth(FINALE_SWING - 0.15, FINALE_SHUT + 0.1, f));
      anim = "sitting";
      bend = 0.32 * Math.sin(Math.PI * smooth(FINALE_SIT, FINALE_SWING + 0.15, f));
    } else {
      // a rig with no sitting clip: in through the gap, and gone
      at(L.entry, L.seat, smooth(FINALE_SIT, FINALE_SIT + 0.3, f));
      heading = F.faceWheel;
      inCar = f > FINALE_SIT + 0.25;
    }
    if (kai) {
      kai.root.visible = !inCar;
      kai.root.rotation.y = heading;
      const fade = anim === "sitting" ? 0.45 : anim === "run" ? 0.15 : 0.25;
      kai.play(anim, { fade, speed });
      kai.update(dt);
      if (bend > 0.001) this._bendKai(kai, bend);
    } else {
      this.body.visible = f < FINALE_SIT;
    }

    // ---- the door: open as he pulls it, after him once he's in, and a slam
    const D = F.carDoor;
    if (D) {
      let open = 0;
      if (f >= FINALE_SHUT) {
        const k = Math.min(1, (f - FINALE_SHUT) / (FINALE_IN - FINALE_SHUT));
        open = 1 - k * k; // pulled to: gathering speed until it slams
      } else if (f >= FINALE_OPEN) {
        const k = Math.min(1, (f - FINALE_OPEN) / (FINALE_STEP - FINALE_OPEN));
        open = 1 - (1 - k) * (1 - k) * (1 - k); // swung out hard, easing as it opens all the way
      }
      if (f < FINALE_IN) D.set(open);
      else {
        // shut: the car is whole again, in its own materials (the lamps light those)
        D.dispose();
        F.carDoor = null;
      }
    }
    if (!F.latched && f >= FINALE_OPEN) {
      F.latched = true;
      this._audio?.playOneShot("doorLatch", { volume: 0.5 });
    }

    // ---- the gate and the Handler behind it
    for (; F.bangs < FINALE_BANGS.length && f >= FINALE_BANGS[F.bangs]; F.bangs++) {
      this._gateFlash = Math.max(this._gateFlash, 0.85);
      this._shake = Math.max(this._shake, 0.1);
      this._audio?.playOneShot("gateSlam", { volume: 0.3 });
    }
    this._updateGate(dt);
    this._updateHandler(dt, state);

    // ---- the car: door slams, engine catches, headlights on
    if (F.slammed !== true && f >= FINALE_IN) {
      F.slammed = true;
      this._audio?.playOneShot(D ? "doorSlam" : "impact", { volume: D ? 0.55 : 0.35 });
      this._shake = Math.max(this._shake, 0.08);
    }
    const lights = smooth(FINALE_LIGHTS, FINALE_LIGHTS + 0.25, f) * (f < FINALE_LIGHTS + 0.12 ? 0.35 : 1);
    this._setBayLights(lights);
    vehicle.position.y = f > FINALE_LIGHTS ? Math.sin(f * 55) * 0.008 : 0; // ticking over
    vehicle.rotation.z = f > FINALE_LIGHTS ? Math.sin(f * 31) * 0.002 : 0;
    if (f > FINALE_LIGHTS && !F.revved) {
      F.revved = true;
      this._shake = Math.max(this._shake, 0.09);
    }

    // ---- camera
    const cy = groundY(centre.z);
    const cam = this.game.camera;
    let shot, want, look, fov, rate;
    if (f < FINALE_ARRIVE) {
      shot = "arrive";
      // eased in from the chase camera, ending low beside the car's nose
      want = new THREE.Vector3(centre.x + 2.6, cy + 1.9, centre.z - 7.5);
      look = new THREE.Vector3(pos.x, pos.y + 1.1, pos.z);
      fov = this._baseFov - 8;
      rate = THREE.MathUtils.lerp(2.2, 6, smooth(0, 1.2, f));
    } else if (f < FINALE_LOOK) {
      shot = "look";
      const k = smooth(FINALE_ARRIVE, FINALE_LOOK, f);
      want = new THREE.Vector3(door.x + 0.85, cy + 1.95 - k * 0.15, door.z - 2.6 + k * 0.5);
      const h = this.handler.position;
      look = new THREE.Vector3(h.x * 0.6 + door.x * 0.4, h.y + 1.6, h.z);
      fov = THREE.MathUtils.lerp(34, 24, k);
      rate = Infinity;
    } else if (f < FINALE_IN) {
      shot = "door";
      // behind him and to the side, a little above: the door swinging out
      // past him, the gap he steps into, and him in the seat, easing in on it
      const k = smooth(FINALE_LOOK, FINALE_IN, f);
      want = F.toWorld(this._finaleV.set(L.back.x - 2.3 + k * 0.4, 2.3 - k * 0.2, L.back.z - 0.8 + k * 0.2));
      look = F.toWorld(this._finaleV.set(L.entry.x + 0.15, 0.75, (L.back.z + L.seat.z) / 2 + 0.2));
      fov = this._baseFov - 8;
      rate = Infinity;
    } else if (f < FINALE_CARD) {
      shot = "in";
      const k = smooth(FINALE_IN, FINALE_CARD, f);
      want = new THREE.Vector3(centre.x + 4.6 - k * 0.6, cy + 3.0 + k * 0.4, centre.z - 8.4 + k * 0.6);
      look = new THREE.Vector3(centre.x + 0.4, cy + 0.9, centre.z);
      fov = this._baseFov - 10;
      rate = Infinity;
    } else {
      shot = "hold";
      // a slow orbit round the front of the car, carried on from the wide
      const a0 = Math.atan2(4.6 - 0.6, -8.4 + 0.6);
      const a = a0 + (f - FINALE_CARD) * 0.11;
      want = new THREE.Vector3(centre.x + Math.sin(a) * 8.6, cy + 3.4, centre.z + Math.cos(a) * 8.6);
      look = new THREE.Vector3(centre.x, cy + 0.9, centre.z);
      fov = this._baseFov - 10;
      rate = 4;
    }
    if (shot !== F.shot && F.shot !== "") rate = Infinity; // a cut, not a pan
    if (shot === "hold" && F.shot === "in") rate = 4; // the orbit carries on from the wide
    F.shot = shot;
    const k = rate === Infinity ? 1 : 1 - Math.exp(-rate * dt);
    F.cam.lerp(want, k);
    F.aim.lerp(look, rate === Infinity ? 1 : 1 - Math.exp(-(rate + 2) * dt));
    cam.position.copy(F.cam);
    if (this._shake > 0) {
      this._shake = Math.max(0, this._shake - dt * 1.6);
      const amp = this._shake * this._shake * 0.7;
      cam.position.x += (Math.random() * 2 - 1) * amp;
      cam.position.y += (Math.random() * 2 - 1) * amp;
    }
    cam.lookAt(F.aim);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = rate === Infinity ? fov : cam.fov + (fov - cam.fov) * (1 - Math.exp(-4 * dt));
      cam.updateProjectionMatrix();
    }

    // ---- the world round it
    // thin the fog for the long look back, so the gate reads at 100 m
    if (this.scene.fog) {
      const thin = smooth(FINALE_ARRIVE - 0.2, FINALE_ARRIVE + 0.1, f) * (1 - smooth(FINALE_LOOK, FINALE_LOOK + 0.01, f));
      this.scene.fog.density = THREE.MathUtils.lerp(F.fogFrom, 0.0055, thin);
    }
    this.key.position.set(centre.x - 35, 55 + cy, centre.z - 40);
    this.key.target.position.set(centre.x, cy, centre.z);
    this._displaySpeed *= Math.exp(-3 * dt);
    state.normalizedSpeed = THREE.MathUtils.clamp(this._displaySpeed / this.maxSpeed, 0, 1);
    updateJungleSpeedWarp(this.speedWarpMaterial, dt, state.normalizedSpeed);
    this._updateTunnelDetail(1);
    updateJungleWildlife(this._wildlife, dt, this.z, this._worldX);
    if (this._workLight) this._workLight.intensity = 2.1 + (f > FINALE_LIGHTS ? 0 : Math.sin(f * 23) * 0.05);
    if (this._musicTrack) this._musicTrack.setVolume(this._soundEnabled ? 0.12 : 0);
    if (this._tensionTrack) this._tensionTrack.setVolume(0);

    if (!this._handedOff && f >= FINALE_CARD) {
      this._handedOff = true;
      this._showLetterbox(false);
      this._showEscapedCard();
    }
  }

  /** Grabs the game camera for the AudioListener once it exists — safe to call every frame until it succeeds. */
  _ensureAudio() {
    if (this._audioReady) return;
    const camera = this.game && this.game.camera;
    if (!camera) return;

    this._audio = new AudioSystem(camera);
    this._audioReady = true;
    this._applyAudioMuteState(!!this.game?.paused);
    const ctx = this._audio.listener.context;

    // The whole one-shot palette now comes from the shared jungle engine
    // (src/audio/jungleAudio.js): Level 1's original synths, kept
    // voice-for-voice, plus the gameplay cues the pitch asked for — coin,
    // stumble, win — all peak-normalised against each other so nothing is
    // suddenly the loudest thing in the game. Level 2 and the intro draw
    // from the same buffers, which is what keeps the style, quality and
    // volume consistent across the whole run.
    for (const [name, buffer] of Object.entries(createJungleCueBuffers(ctx))) {
      this._audio.buffers.set(name, buffer);
    }
    const tension = this._audio.buffers.get("tension");

    // the recorded coin chime (Pixabay) swaps over the synthesised one by
    // name the moment it decodes — same headroom, so the volume is unchanged
    loadAudioFileBuffer(ctx, "/assets/audio/liecio-collect-points-190037.mp3", { peak: 0.9 })
      .then((b) => { if (b && this._audio) this._audio.buffers.set("coin", b); });

    // The living bed — birds, insects, wind through the leaves — routed
    // through the shared listener input, so the pause/mute master-volume
    // logic covers it with everything else. update() blends it toward the
    // logging camp's idling vehicle across the gate-to-bay stretch, which is
    // the audible half of the Level 2 handoff.
    this._bed = new JungleBed(ctx, this._audio.listener.getInput());

    // The pursuit arrangement covers the first moment; the recorded theme
    // (Pixabay) replaces it the moment it decodes.
    const music = createJungleMusicBuffer(ctx, "pursuit");

    const resume = () => {
      if (!this.game?.paused) {
        ctx.resume().then(() => this._applyAudioMuteState(false)).catch(() => {});
      }
    };
    this._resumeAudio = resume;
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });

    // The old flat ambience loop is gone — JungleBed is its living
    // replacement. Music starts at the volume contract's music level so
    // Level 1 and Level 2 sit at the same loudness (see jungleAudio.js).
    this._musicTrack = new THREE.Audio(this._audio.listener);
    this._musicTrack.setBuffer(music);
    this._musicTrack.setLoop(true);
    this._musicTrack.setVolume(0.3);
    this._musicTrack.play();

    // The recorded theme, on every level of the game. If it fails to load
    // the pursuit loop simply keeps playing.
    loadJungleTheme(this._audio.listener.context).then((buf) => {
      if (!buf || !this._musicTrack) return;
      this._musicTrack.stop();
      this._musicTrack.setBuffer(buf);
      this._musicTrack.play();
    });

    this._tensionTrack = new THREE.Audio(this._audio.listener);
    this._tensionTrack.setBuffer(tension);
    this._tensionTrack.setLoop(true);
    this._tensionTrack.setVolume(0.012);
    this._tensionTrack.play();
    if (this.handler) {
      this._audio.attachPositional(this.handler, "handlerBreath", {
        volume: 0.6,
        refDistance: 7,
        maxDistance: HANDLER_LIGHT_RANGE,
      });
    }
  }

  /**
   * Kai's thoughts on the run, in the prologue's style (ui/dialogue.js): the
   * silence he left behind him, and the masked man he has never seen before.
   */
  _storyBeats(dt, state) {
    this._storyT = (this._storyT || 0) + dt;
    if (!this._saidStart && this._storyT > 1.4) {
      this._saidStart = true;
      kaiThinks("Every sound in the forest stopped when I took it.");
      kaiThinks("And someone\u2019s on the trail behind me.");
    }
    if (!this._saidMarshal && state.handlerState === "CLOSING" && this._storyT > 8) {
      this._saidMarshal = true;
      kaiThinks("A company coat. A mask. Who sent him after me?");
    }
  }

  update(dt, state) {
    const input = this.input;

    if (!this._audioReady) this._ensureAudio();
    if (!this.caught && !this.escaped) this._storyBeats(dt, state);

    // the finish scene owns Kai and the camera once he's at the bay
    if (this._finale) {
      this._updateFinale(dt, state);
      return;
    }

    // --- speed: the gear table + boost, both feeding Shader 1 ---
    // A single linear ramp to 22 m/s over 2 km was "not constant" on paper and
    // constant in the hand. speedForDistance() steps him through four gears
    // instead, easing within each one so every change of gear is felt.
    this.baseSpeed = speedForDistance(-this.z);

    // boost burns the shared stamina pool so 3B's HUD reads it for free
    const wantsBoost = !this._jetpackActive && (input.isDown("boost") || this._virtualDown("boost"));
    if (this._boostLocked && state.stamina >= state.maxStamina * BOOST_UNLOCK) {
      this._boostLocked = false;
    }
    this.boosting = wantsBoost && !this._boostLocked && state.spendStamina(BOOST_DRAIN * dt);
    // held the key but the pool just ran out — lock it until it recovers
    if (wantsBoost && !this.boosting && !this._boostLocked) this._boostLocked = true;
    if (!this.boosting) state.regenStamina(BOOST_REGEN, dt);

    const boostTarget = this._jetpackActive
      ? JETPACK_SPEED_BONUS
      : (this.boosting ? BOOST_TOP : 0);
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
    this._floorY = jungleCourseHeight(this.z);

    // lanes
    if ((input.pressed("left") || this._consumeVirtual("left")) && this.lane > 0) {
      this._lastRouteIntent = -1;
      this.laneFrom = this.lane;
      this.lane--;
      this.laneT = 0;
    }
    if ((input.pressed("right") || this._consumeVirtual("right")) && this.lane < 2) {
      this._lastRouteIntent = 1;
      this.laneFrom = this.lane;
      this.lane++;
      this.laneT = 0;
    }
    if (this.laneT < 1) this.laneT = Math.min(1, this.laneT + dt / 0.16);
    const localX = THREE.MathUtils.lerp(
      LANE_X[this.laneFrom],
      LANE_X[this.lane],
      THREE.MathUtils.smoothstep(this.laneT, 0, 1),
    );
    this._updateRouteChoice(localX);
    const x = localX + this._routeOffsetAt(this.z);
    this._worldX = x;

    this._updateJetpackPickups(dt, x, prevZ);
    this._updateJetpack(dt);

    // jump
    const jumpPressed = input.pressed("jump") || this._consumeVirtual("jump");
    if (!this._jetpackActive && this._flightLift < 0.35 && jumpPressed && !this.airborne) {
      this.airborne = true;
      this.vy = 9.2;
      this._audio?.playOneShot("jump", { volume: 0.36, rate: 0.94 + Math.random() * 0.12 });
    }
    if (this.airborne) {
      this.vy -= 24 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.airborne = false;
        this._audio?.playOneShot("land", { volume: 0.48, rate: 0.9 + Math.random() * 0.2 });
      }
    }

    // --- slide (CTRL) ---
    // @1A: input.slide was already bound but nothing read it, and the ceiling
    // ducts are impossible without it. Runs after the jump so airborne is
    // current: jumping out of a slide cancels it, which is what players expect.
    const slidePressed = input.pressed("slide") || this._consumeVirtual("slide");
    if (this._flightLift < 0.35 && slidePressed && !this.airborne && !this.sliding) {
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

    // --- obstacles: a clip costs ground AND health ---
    const clipped = this._clipObstacles(x, prevZ);
    const fallingTreeClip = this._updateFallingTrees(dt, prevZ);
    const specialClip = this._updateAdventureHazards(dt, x, prevZ);
    if (clipped || fallingTreeClip || specialClip) {
      // the stumble debt IS the three metres; do not also subtract from the
      // gap for ordinary scenery. Moving shrine hazards are the deliberate
      // exception below: their noise actively provokes the Handler.
      this._stumbleDebt += CLIP_PENALTY;
      this.boostSpeed = 0;
      this._shake = Math.max(this._shake, fallingTreeClip ? 0.5 : specialClip ? 0.58 : 0.35);
      if (this._audio) {
        if (fallingTreeClip || specialClip) {
          // a real hit — trees and shrine hazards land heavy
          this._audio.playOneShot("impact", { volume: fallingTreeClip ? 0.8 : 0.9 });
        } else {
          // an ordinary trip: its own softer cue with a little pitch variety,
          // so repeated clips never read as one sample
          this._audio.playOneShot("stumble", { volume: 0.62, rate: 0.94 + Math.random() * 0.12 });
        }
      }

      // --- drain health on hit ---
      const dmg = specialClip ? SPECIAL_HAZARD_DAMAGE
        : fallingTreeClip ? FALLING_TREE_DAMAGE
        : OBSTACLE_DAMAGE;
      this._health = Math.max(0, this._health - dmg);
      this._healthFlashT = 0.35; // red flash duration

      // --- trip / stumble animation ---
      this._stumbleT = this._stumbleDuration;
      // Direction: which side the obstacle was on relative to Kai
      const hitObstacle = clipped || (specialClip ? { x: this._specialImpactX } : null);
      if (hitObstacle) {
        const rel = x - (hitObstacle.x || 0);
        this._stumbleDir = rel > 0.1 ? 1 : rel < -0.1 ? -1 : (Math.random() > 0.5 ? 1 : -1);
      } else {
        this._stumbleDir = Math.random() > 0.5 ? 1 : -1;
      }

      // Health depleted — game over
      if (this._health <= 0) {
        this._instantLose(state, "health", "Kai collapsed from exhaustion. The jungle claimed him.");
      }

      if (specialClip && this._specialImpactType) {
        this._triggerHandlerFromMovingImpact(this._specialImpactType, this._specialImpactX, state);
      }
    }

    // Visible hit reaction for moving/flying objects. It affects only Kai's
    // capsule mesh; lane coordinates and collision stay deterministic.
    if (this._impactLeanT > 0) {
      this._impactLeanT = Math.max(0, this._impactLeanT - dt);
      const u = this._impactLeanT / IMPACT_LEAN_TIME;
      this.body.rotation.z = this._impactLeanDir * 0.24 * Math.sin(u * Math.PI);
    } else {
      this.body.rotation.z *= Math.exp(-18 * dt);
      if (Math.abs(this.body.rotation.z) < 0.001) this.body.rotation.z = 0;
    }

    // --- stumble / trip animation ---
    // When Kai hits an obstacle the body pitches forward and tilts sideways
    // for ~0.5 s. The animation is layered on top of the slide squash and the
    // impact lean so multiple hits feel distinct.
    if (this._stumbleT > 0) {
      this._stumbleT = Math.max(0, this._stumbleT - dt);
      const u = this._stumbleT / this._stumbleDuration; // 1 -> 0
      // Forward pitch: a quick nose-dive that eases back
      const pitchEnv = Math.sin(u * Math.PI); // peaks at u=0.5
      this.body.rotation.x += this._stumbleDir * 0.18 * pitchEnv;
      // Sideways wobble: two oscillations over the duration
      const wobble = Math.sin(u * Math.PI * 3.5) * u;
      this.body.rotation.z += this._stumbleDir * 0.14 * wobble;
      // Slight vertical dip (legs buckle)
      this.body.position.y -= 0.12 * pitchEnv;
    }

    // Health flash overlay decay
    if (this._healthFlashT > 0) {
      this._healthFlashT = Math.max(0, this._healthFlashT - dt);
    }

    this._updateStoryLetters(dt, state, x, prevZ);
    this._updateGuardianTeases(dt);
    this._updateCollapsingBridge(dt, x, prevZ, state);

    // --- cursed shrine guardian: head-on contact is an instant loss ---
    this._updateShrineGuardian(dt, x, prevZ, state);

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
      this._duckMusic(0.85);
      this._showCaughtOverlay("Kai was hit by the oncoming hazard.");
    }

    state.distance = -this.z;
    state.phase = state.distance < 700 ? 1 : state.distance < 1230 ? 2 : 3;
    this.player.position.set(x, this._floorY + this.y + this._flightLift, this.z);
    this._updateKai(dt);
    this._updateTempleRewards(dt, x, prevZ, state);
    this._updateHealthPacks(dt, x, prevZ);
    this._updateTempleRunHUD();

    // --- the way out ---
    // The gate is NOT the level switch: reaching the bay is, and the finish
    // scene walks him the rest of the way to the car's door.
    if (!this.caught && !this.escaped && this.z <= ESCAPE_Z) {
      this.escaped = true;
      this._escapeSpeed = this.speed; // hand the ramp the speed he arrived with
      this.finished = true; // no reader in Game yet — see the header note
      state.level1Complete = true;
      state.level1RewardCount = this.rewardCount;
      state.level1RewardScore = this.rewardScore;
      state.handlerState = "SEALED";
      // from the next frame the finish scene takes over (see _updateFinale)
      this._startFinale(x);
    }


    // Interlude I — must run BEFORE _updateHandler, which reads this._gatePhase
    // to decide whether he is sealed. The other way round it saw the previous
    // frame's phase, and that one frame of lag was ~0.4 m of Kai's travel: it is
    // half the reason the seal used to need a 3 m gap to work at all. Also sets
    // this._shake, so it has to stay ahead of the camera either way.
    this._updateGate(dt);

    // the pursuit reads this.z, so it has to run after the clip is applied
    this._updateHandler(dt, state);
    this._updateHandlerModel(dt);
    this._updateHandlerPressure(dt);

    // pooled scenery and obstacle meshes follow him; this also advances the
    // obstacle cursor, so it has to come after the clip test above
    this._updateObstacleVisuals();

    // shadow camera follows so shadows stay inside it
    this.key.position.set(x - 35, 55 + this._floorY, this.z - 75);
    this.key.target.position.set(x, this._floorY, this.z - 12);

    // --- look-back camera (mouse2 / C) ---
    // @1A: input.lookBack was bound in Input.js and unread. Holding it orbits
    // the pivot round Kai to face the way he came, which is the only way to see
    // the Handler at all. It deliberately costs the view ahead, so looking back
    // with a southbound inbound is a real decision rather than a free look.
    if (this._autoLook > 0) this._autoLook = Math.max(0, this._autoLook - dt);
    const wantLook = this._autoLook > 0 || input.isDown("lookBack") || this._virtualDown("lookBack") ? 1 : 0;
    this._lookBack += (wantLook - this._lookBack) * (1 - Math.exp(-LOOK_SWING_RATE * dt));
    if (this._lookBack < 0.002) this._lookBack = 0;

    // smoothstepped so the swing starts and ends soft; the orbit passes through
    // the side of him, which reads as a whip pan rather than a cut
    const swing = THREE.MathUtils.smoothstep(this._lookBack, 0, 1);

    // Terrain-aware camera angle: on steep climbs the chase camera lifts and
    // backs out so upcoming obstacles stay visible instead of disappearing
    // behind the slope. Jetpack flight gets an even higher chase angle. The
    // normal third-person and look-back camera modes remain intact.
    const aheadY = jungleCourseHeight(this.z - 13);
    const slope = THREE.MathUtils.clamp((aheadY - this._floorY) / 13, -0.72, 0.72);
    const climb = Math.max(0, slope);
    const flightFactor = THREE.MathUtils.clamp(this._flightLift / JETPACK_HEIGHT, 0, 1);
    const radius =
      THREE.MathUtils.lerp(CAM_RADIUS, CAM_RADIUS_BACK, swing) +
      climb * 4.2 +
      flightFactor * 2.0;
    const camHeight =
      THREE.MathUtils.lerp(CAM_HEIGHT, CAM_HEIGHT_BACK, swing) +
      climb * 4.8 +
      flightFactor * 3.2;
    const angle = swing * Math.PI; // 0 behind him, PI in front of him looking back
    this.camPivot.position.set(
      Math.sin(angle) * radius,
      camHeight,
      Math.cos(angle) * radius,
    );

    // camera lerps toward the pivot rather than being parented to it. The follow
    // tightens during a swing, or the lerp cuts the chord and clips through him
    // instead of tracking the arc.
    const cam = this.game.camera;
    this.camPivot.getWorldPosition(this._tmp);
    cam.position.lerp(this._tmp, 1 - Math.exp(-(9 + swing * 9) * dt));

    // aim down-tunnel normally, and at whatever is behind him when swung round
    this._tmpAim.set(x * 0.7, this._floorY + this._flightLift + 1.5, this.z - 9);
    if (swing > 0) {
      this._tmpBack.set(
        this.handler ? this.handler.position.x : 0,
        (this.handler ? this.handler.position.y : this._floorY) + 1.7,
        // his actual gap, so the aim tracks him closing rather than staring at a
        // fixed point; clamped so a sealed Handler 100 m back still frames
        this.z + THREE.MathUtils.clamp(this.gap + 2, 8, 60),
      );
      this._tmpAim.lerp(this._tmpBack, swing);
    }
    cam.lookAt(this._tmpAim);

    // boost widens the FOV — cheapest honest way to sell acceleration.
    // Restored in teardown() since the camera belongs to Game, not the level.
    const fovTarget = this._baseFov + (this.boostSpeed / 10) * 7 + (this._jetpackActive ? 5 : 0);
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
    updateJungleWildlife(this._wildlife, dt, this.z, this._worldX);
    this._updateDarkShrine(dt);
    if (this._musicTrack) {
      // 0.3 against the peak-0.5 shared buffer sits where the old 0.15
      // against the raw one did, and matches Level 2's music bus.
      const phaseLift = state.phase === 1 ? 0 : state.phase === 2 ? 0.05 : 0.09;
      const chaseLift = this._handlerRageT > 0 ? 0.07 : 0;
      const calm = this.escaped ? 0.45 : 1; // let the win sting own the bay
      // the plan's "music adds layers as the guard closes": with one
      // recorded track there are no layers to add, so it leans in instead —
      // the music itself gets louder as he gains on you
      const close = this.caught || this.escaped
        ? 0
        : 1 - THREE.MathUtils.clamp((this.gap - 6) / 18, 0, 1);
      const lift = phaseLift + chaseLift;
      this._musicTrack.setVolume(
        this._soundEnabled ? (0.3 + lift) * calm * this._musicDuck * (1 + 0.22 * close) : 0,
      );
    }
    // big cues duck the music; it recovers here, ~1.4 s back to full
    if (this._musicDuck < 1) this._musicDuck = Math.min(1, this._musicDuck + dt * 0.7);
    if (this._tensionTrack) {
      const phaseLift = state.phase === 1 ? 0 : state.phase === 2 ? 0.012 : 0.025;
      const guardianLift = this._guardianActive ? 0.045 : 0;
      this._tensionTrack.setVolume(this._soundEnabled ? 0.008 + phaseLift + this._darkFactor * 0.03 + guardianLift : 0);
    }

    // --- the ambient bed ---
    // Jungle all the way, then the logging camp's idling vehicle swells in
    // through the gate-to-bay stretch — the audible half of the Level 2
    // handoff. The distant wildlife (birds, insects, the odd monkey) thins
    // toward the camp and goes quiet as the Handler closes in — the jungle
    // holds its breath.
    if (this._bed) {
      const travelled = -this.z;
      const camp = THREE.MathUtils.smoothstep(travelled, -GATE_Z + 6, -BAY_Z - 12);
      const pressure = 1 - THREE.MathUtils.clamp(this.gap / 26, 0, 1);
      this._bed.update(dt, {
        birds: 0.55 * (1 - camp * 0.85) * (1 - pressure * 0.45),
        camp,
      });
    }

    // --- footsteps: trigger on stride distance, only while grounded ---
    if (!this.airborne && !this.sliding && this._flightLift < 0.2 && !this.caught && this._audio) {
      this._strideDistance += this.speed * dt;
      if (this._strideDistance >= this._strideInterval) {
        this._strideDistance = 0;
        this._audio.playFootstep({ volume: 0.52, pitchVariance: 0.08, minInterval: 0, dt });
      }
    }

    // --- the Handler's feet and voice, all positional on him, so each one
    // is louder and closer as he gains — the player hears him catching up ---
    if (this._audio && this.handler && !this.caught && !this.escaped) {
      this._guardStepT = (this._guardStepT ?? 0.3) - dt;
      if (this.gap < HANDLER_LIGHT_RANGE * 0.9 && this._guardStepT <= 0) {
        // heavier than Kai's: the same footstep slowed right down
        this._guardStepT = this._handlerRageT > 0 ? 0.34 : 0.46;
        this._audio.playPositional(this.handler, "footstep", {
          volume: 0.9,
          rate: 0.66 + Math.random() * 0.05,
          refDistance: 6,
          maxDistance: HANDLER_LIGHT_RANGE,
        });
      }
      this._guardVoxT = (this._guardVoxT ?? 1.5) - dt;
      if (this._guardVoxT <= 0) {
        this._guardVoxT = 2.6 + Math.random() * 3.4;
        const opts = { refDistance: 9, maxDistance: HANDLER_LIGHT_RANGE };
        if (this.gap < 24) {
          const r = Math.random();
          if (r < 0.45) this._audio.playPositional(this.handler, "shout", { volume: 0.9, ...opts });
          else if (r < 0.75) this._audio.playPositional(this.handler, "whistle", { volume: 0.6, ...opts });
          else this._audio.playPositional(this.handler, "radio", { volume: 0.5, ...opts });
        } else {
          this._audio.playPositional(this.handler, "radio", { volume: 0.45, ...opts });
        }
      }
    }

  }

  /**
   * Kai himself — the same rig, colours and Key as the Level 1 intro
   * (intros/cast.js). The capsule stays as the invisible gameplay body:
   * jumps, slides, lane changes and collisions still move and squash it
   * exactly as before, and _updateKai() mirrors that onto the model.
   * If the character fails to load, the capsule simply stays visible.
   */
  async _buildKai() {
    const { kai } = await loadCast(this.assets);
    if (!kai) return;
    this.kai = makeKai(this.player, kai);
    this.kai.root.rotation.y = Math.PI; // facing down the trail (-z), as in the intro
    this.kai.root.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    this.body.visible = false;
    this._kaiWasAirborne = false;
    // flying: a still, legs-together frame of his idle, bent into shape in _flightPose()
    this.kai.pose("fly", "idle", 0.4);
    if (this._jetpackFx) this._buildKaiJetpack(); // otherwise _buildJetpackFx() calls it once the stand-in exists
  }

  /**
   * The jetpack on Kai's back, Subway Surfers style: two fat tanks on a
   * backplate, brass bands, nozzles at the bottom and long orange flames
   * roaring out of them, with an exhaust trail left hanging in the air
   * behind him. It rides his upper spine, so it tips with him as he leans
   * into the flight. Replaces the capsule's stand-in pack (_buildJetpackFx)
   * and keeps its names, so _updateJetpack() drives both the same way.
   */
  _buildKaiJetpack() {
    const spine = this.kai?.bone("Torso");
    if (!spine || this._kaiPack) return;
    this.kai.root.updateMatrixWorld(true);
    const s = spine.getWorldScale(new THREE.Vector3()).x || 1;
    const pack = new THREE.Group();
    pack.name = "kai-jetpack";
    pack.scale.setScalar(1 / s); // built in metres; the bone's units are the rig's
    pack.position.set(0, -0.06 / s, -0.05 / s);

    const metal = new THREE.MeshStandardMaterial({ color: 0x8a9196, roughness: 0.32, metalness: 0.85 });
    const paint = new THREE.MeshStandardMaterial({ color: 0xc8541f, roughness: 0.45, metalness: 0.35 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xd2a24a, roughness: 0.35, metalness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.6, metalness: 0.5 });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.05), dark);
    plate.position.set(0, 0, -0.12);
    pack.add(plate);
    this._jetpackFlames = [];
    this._jetpackNozzles = [];
    for (const side of [-1, 1]) {
      const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.24, 6, 14), paint);
      tank.position.set(side * 0.092, 0.01, -0.2);
      tank.castShadow = true;
      pack.add(tank);
      for (const y of [-0.08, 0.1]) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.077, 0.011, 6, 18), brass);
        band.rotation.x = Math.PI / 2;
        band.position.set(side * 0.092, y, -0.2);
        pack.add(band);
      }
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.062, 0.08, 14, 1, true), metal);
      nozzle.position.set(side * 0.092, -0.2, -0.2);
      pack.add(nozzle);
      // the flame: an orange sheath and a hot yellow core, tips pointing down and back
      const flame = new THREE.Group();
      flame.position.set(side * 0.092, -0.24, -0.2);
      flame.rotation.x = Math.PI + 0.25;
      const outer = new THREE.Mesh(
        new THREE.ConeGeometry(0.065, 0.62, 14, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xff7a1f, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      outer.position.y = 0.31;
      const core = new THREE.Mesh(
        new THREE.ConeGeometry(0.035, 0.36, 10, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      core.position.y = 0.18;
      flame.add(outer, core);
      flame.material = outer.material; // _updateJetpack() fades the sheath
      pack.add(flame);
      this._jetpackFlames.push(flame);
      this._jetpackNozzles.push(nozzle);
    }
    const glow = new THREE.PointLight(0xff9a3c, 0, 6, 2);
    glow.position.set(0, -0.45, -0.25);
    pack.add(glow);
    this._jetpackGlow = glow;
    pack.visible = false;
    spine.add(pack);
    if (this._jetpackFx) this._jetpackFx.removeFromParent(); // the capsule's stand-in pack
    this._jetpackFx = this._kaiPack = pack;

    // his legs fly from the rig's rest pose (straight, together), not his fighting stance
    this._legRest = new Map();
    let skeleton = null;
    this.kai.root.traverse((o) => { if (!skeleton && o.isSkinnedMesh) skeleton = o.skeleton; });
    if (skeleton) {
      const world = new Map();
      skeleton.bones.forEach((bone, i) => world.set(bone, new THREE.Matrix4().copy(skeleton.boneInverses[i]).invert()));
      for (const side of ["Left", "Right"]) {
        for (const part of ["UpLeg", "Leg", "Foot"]) {
          const bone = this.kai.bones["mixamorig" + side + part];
          const pw = bone && world.get(bone.parent);
          if (!bone || !pw) continue;
          const local = pw.clone().invert().multiply(world.get(bone));
          this._legRest.set(bone, new THREE.Quaternion().setFromRotationMatrix(local));
        }
      }
    }

    // exhaust: soft puffs left in the air where the nozzles were, growing and fading
    const tex = dotTexture();
    this._exhaust = [];
    this._exhaustT = 0;
    for (let i = 0; i < 36; i++) {
      const puff = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, color: 0xffb066, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      puff.visible = false;
      this.root.add(puff);
      this._exhaust.push({ sprite: puff, life: 0, max: 1 });
    }
    this._exhaustNext = 0;
    this._tmpNozzle = new THREE.Vector3();
  }

  /** Exhaust puffs: two a tick from the nozzles while the pack burns, drifting back and fading. */
  _updateExhaust(dt) {
    if (!this._exhaust) return;
    if (this._jetpackActive && this._jetpackNozzles) {
      this._exhaustT -= dt;
      if (this._exhaustT <= 0) {
        this._exhaustT = 0.035;
        for (const n of this._jetpackNozzles) {
          const e = this._exhaust[this._exhaustNext];
          this._exhaustNext = (this._exhaustNext + 1) % this._exhaust.length;
          n.getWorldPosition(this._tmpNozzle);
          this.root.worldToLocal(this._tmpNozzle);
          e.sprite.position.copy(this._tmpNozzle);
          e.sprite.position.y -= 0.25;
          e.life = e.max = 0.55 + Math.random() * 0.25;
          e.sprite.visible = true;
        }
      }
    }
    for (const e of this._exhaust) {
      if (e.life <= 0) continue;
      e.life -= dt;
      const k = 1 - Math.max(0, e.life) / e.max; // 0 -> 1 over its life
      e.sprite.scale.setScalar(0.25 + k * 1.1);
      e.sprite.material.opacity = 0.55 * (1 - k);
      e.sprite.material.color.setHex(k < 0.25 ? 0xffb066 : 0x9a8f86); // fire, then smoke
      e.sprite.position.y -= dt * 0.6;
      if (e.life <= 0) e.sprite.visible = false;
    }
  }

  /**
   * The flight pose on top of the held frame: thighs swept back, knees
   * folded so the feet trail, arms back along his sides, his head up to see
   * where he is going. `k` 0..1 blends it in as he lifts off and out as he lands.
   */
  _flightPose(kai, k) {
    const b = (n) => kai.bones["mixamorig" + n];
    const bend = (bone, x, y = 0, z = 0) => {
      if (!bone) return;
      kai._stash(bone);
      _flyQ.setFromEuler(_flyE.set(x * k, y * k, z * k));
      bone.quaternion.multiply(_flyQ);
    };
    // legs: from the rest pose, blended in by k, then folded back at the knee
    const fold = (bone, x) => {
      const rest = bone && this._legRest?.get(bone);
      if (!rest) return;
      kai._stash(bone);
      _flyQ2.copy(rest).multiply(_flyQ.setFromEuler(_flyE.set(x, 0, 0)));
      bone.quaternion.slerp(_flyQ2, k);
    };
    for (const [side, sgn] of [["Left", 1], ["Right", -1]]) {
      fold(b(side + "UpLeg"), FLY_HIP);
      fold(b(side + "Leg"), FLY_KNEE);
      fold(b(side + "Foot"), FLY_ANKLE);
      bend(b(side + "Arm"), -0.45, 0, sgn * 0.2);
      bend(b(side + "ForeArm"), 0, 0, sgn * 0.35);
    }
    bend(b("Neck"), -0.25);
  }

  /**
   * The Handler himself: the same monk Kai fights at Site 7 (intros/cast.js),
   * in his carved stone mask, so his face stays hidden till Level 3. He goes
   * inside the pursuit group, so the chase above moves him exactly as it moved
   * the capsule, which stays as the stand-in if he fails to load. His torch
   * goes into his right hand and the beam with it, still aimed down the trail.
   */
  async _buildHandlerModel() {
    const { handler } = await loadCast(this.assets);
    if (!handler?.source || !this.handler) return;
    const monk = makeHandler(this.handler, handler);
    monk.root.rotation.y = Math.PI; // running down the trail (-z), like Kai
    monk.root.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    for (const m of this._handlerStub) m.visible = false;
    this._handlerTorch.scale.setScalar(0.65); // a hand-held torch, not the stand-in's lamp
    this._handlerPalm = monk.bone("PalmR");
    this._handlerHand = new THREE.Vector3();
    this.handlerMonk = monk;
  }

  /** Runs with the chase; stopped at the bars, or over a caught Kai, he rounds on him and points. */
  _updateHandlerModel(dt) {
    const monk = this.handlerMonk;
    if (!monk) return;
    const stopped = this.caught || (this._handlerSealed && this.handler.position.z <= this._handlerBarZ + 0.05);
    if (stopped) {
      if (monk.currentName === "run") {
        if (monk.actions.angry) monk.playOnce("angry", { fade: 0.25 });
        else monk.play("idle", { fade: 0.25 });
      }
    } else {
      monk.play("run", { fade: 0.2 });
      const v = this.baseSpeed + (this._handlerRageT > 0 ? HANDLER_RAGE_SPEED : 0);
      monk.current.timeScale = 0.85 + 0.6 * THREE.MathUtils.clamp(v / SPEED_TOP, 0, 1.2);
    }
    monk.update(dt);
    if (this._handlerPalm) {
      this.handler.worldToLocal(this._handlerPalm.getWorldPosition(this._handlerHand));
      this._handlerTorch.position.copy(this._handlerHand);
      this._handlerBeam.position.copy(this._handlerHand);
    }
  }

  _updateKai(dt) {
    const kai = this.kai;
    if (!kai) return;

    const flying = this._jetpackActive || this._flightLift > 0.6;
    if (this.caught) {
      if (kai.currentName !== "death") kai.play("death", { loop: false, fade: 0.15 });
    } else if (flying && kai.actions.fly) {
      kai.play("fly", { fade: 0.3 });
    } else if (this.airborne) {
      // the rig's running jump (1.25 s), sped up to fit the 0.77 s hop
      if (!this._kaiWasAirborne) kai.playOnce(kai.actions.runningjump ? "runningjump" : "jump", { fade: 0.08, speed: 1.6 });
    } else if (this.speed < 0.5) {
      kai.play("idle", { fade: 0.3 });
    } else {
      kai.play("run", { fade: 0.15 });
      // stride rate follows his speed, from a jog at the start to a sprint
      kai.current.timeScale = 0.8 + 0.6 * THREE.MathUtils.clamp(this.speed / SPEED_TOP, 0, 1);
    }
    this._kaiWasAirborne = this.airborne;

    // the capsule's squash is the slide: lean him back and drop him with it
    const slide = THREE.MathUtils.clamp((1 - this._bodySquash) / 0.58, 0, 1);
    kai.visual.position.y = -0.55 * slide;
    // capsule tilts (jetpack pitch, side-on hits) carry over; Kai's root is
    // turned 180 degrees, so both flip sign in his frame
    kai.visual.rotation.set(-this.body.rotation.x - 1.1 * slide, 0, -this.body.rotation.z);

    // in the air: lean into it, bob on the thrust, bank into the lane changes
    const fk = THREE.MathUtils.clamp(this._flightLift / 2.2, 0, 1);
    const lateral = dt > 0 ? (this._worldX - (this._prevFlyX ?? this._worldX)) / dt : 0;
    this._prevFlyX = this._worldX;
    this._flyBank = (this._flyBank || 0) + (THREE.MathUtils.clamp(lateral * 0.09, -0.5, 0.5) - (this._flyBank || 0)) * (1 - Math.exp(-6 * dt));
    if (fk > 0) {
      kai.visual.rotation.x += 0.28 * fk; // on top of the capsule's own flight pitch: about 35 degrees all told
      kai.visual.rotation.z += this._flyBank * fk;
      kai.visual.position.y += Math.sin(this._rewardTime * 2.6) * 0.08 * fk;
    }

    kai.update(dt);
    if (fk > 0.01 && kai.currentName === "fly") this._flightPose(kai, fk);
    this._updateExhaust(dt);
  }

  teardown() {
    clearThoughts();
    this._finale?.carDoor?.dispose(); // left mid-scene: the renderer's clipping back as it was
    if (this._coinEnv) {
      this._coinEnv.dispose();
      this._coinEnv = null;
    }
    for (const f of [this.kai, this.handlerMonk]) {
      f?.root.traverse((o) => {
        if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose();
      });
    }
    this._removeCaughtOverlay();
    this._removeEscapedCard();
    this._removeLetterbox();
    this._removeTempleRunHUD();
    if (this._bannerTimer) clearTimeout(this._bannerTimer);
    if (this._storyTimer) clearTimeout(this._storyTimer);
    if (this._transientBanner?.parentNode) this._transientBanner.parentNode.removeChild(this._transientBanner);
    if (this._storyCard?.parentNode) this._storyCard.parentNode.removeChild(this._storyCard);
    this._transientBanner = null;
    this._storyCard = null;
    if (this._musicTrack) {
      if (this._musicTrack.isPlaying) this._musicTrack.stop();
      this._musicTrack = null;
    }
    if (this._tensionTrack) {
      if (this._tensionTrack.isPlaying) this._tensionTrack.stop();
      this._tensionTrack = null;
    }

    if (this._bed) {
      this._bed.dispose();
      this._bed = null;
    }
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