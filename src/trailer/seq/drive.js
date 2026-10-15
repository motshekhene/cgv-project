import * as THREE from 'three';
import { handheld, jolt, smooth, mix } from '../camera.js';
import { COURSE_END, ROADBLOCKS } from '../../levels/level2/course.js';

/**
 * Sequence 4 — NO ESCAPE, on the drive out (intros/level2/DriveOutIntro.js)
 * and Level 2, the River Road (levels/Level02.js).
 *
 *   out of the trees  the drive-out scene's own shots: the headlights coming
 *                     up the logging track and past the lens, the car bursting
 *                     onto the River Road, the Marshal's lights in the trees
 *   the road          Level 2 driven by the autopilot below: low on the road as
 *                     it tears past in the rain, alongside at speed with the
 *                     company's ranger on its tail, then threading one of the
 *                     company's roadblocks
 *   the falls         the end of the road: the level's own fall cinematic, the
 *                     car going over the lip of the falls, and the splash
 *
 * The drive-out scene is a timeline, so a shot just seeks it (Cutscene._seek).
 * Level 2 runs on: a shot that needs a later stretch of road moves the car
 * (and the Marshal behind it) forward to it, and the road streams in round it
 * as it does when you drive.
 */
const LANES = [-9, -3, 3, 9]; // level2/obstacles.js, traffic.js

function lv(st) {
  return st.level;
}

/** Hide the game furniture: the pickups along the road. */
function dressRoad(L) {
  if (L._trailerDressed) return;
  L._trailerDressed = true;
  for (const it of L.pickups?.items || []) {
    const o = it.mesh || it.holder || it.group || it.object;
    if (o) o.scale.setScalar(0.0001);
  }
  L.pickups.update = () => []; // and nothing is picked up off-camera either
}

/** Put the car at z on the road at speed, the Marshal `gap` metres behind it. */
function placeCar(L, z, { x = 3, speed = 34, gap = 14, hx = x } = {}) {
  const car = L.car;
  car.mesh.position.set(x, car.mesh.position.y, z);
  car.heading = 0;
  car.steer = 0;
  car.speed = speed;
  car.lateralVel = car.yawVel = 0;
  car.health = car.maxHealth;
  car.heat = 0;
  car.overheated = false;
  const h = L.handler;
  h.mesh.position.set(hx, h.mesh.position.y, z - gap);
  h.speed = h.seenSpeed = speed;
  h.heading = 0;
  if (h.giveSpace) h.giveSpace(1.5);
  // the chase camera snaps rather than swinging in from the old stretch of road
  const cam = L.game.camera;
  cam.position.set(x, car.mesh.position.y + 3.7, z - 8.9);
  cam.lookAt(x, 1.1, z + 10);
  L._lookInit = false;
  if (L._camDesired) L._camDesired.copy(cam.position);
  for (let i = 0; i < 12; i++) L.road.update(car.mesh.position); // stream the road in round it
}

/**
 * The autopilot: holds the throttle, picks the lane, and steers for it. A lane
 * is good while nothing solid is in it for the next couple of seconds of road
 * (the obstacles' own blockAt); a roadblock's open lane is the only good one.
 */
function autopilot(st, L, { boost = false, lane: prefer } = {}) {
  const car = L.car;
  const p = car.mesh.position;
  const look = 30 + car.speed * 1.6;
  const free = (x) => L.obstacles.blockAt(x, 1.4, p.z, p.z + look) === Infinity;
  let target = L._apTarget ?? (prefer !== undefined ? LANES[prefer] : nearestLane(p.x));
  if (!free(target)) {
    const order = LANES.slice().sort((a, b) => Math.abs(a - p.x) - Math.abs(b - p.x));
    target = order.find(free) ?? target;
  }
  L._apTarget = target;
  // steer for the lane: aim the nose a little across, the way a driver does
  const want = THREE.MathUtils.clamp((target - p.x) * 0.045, -0.28, 0.28);
  const err = want - car.heading;
  st.hold('left', err > 0.025);
  st.hold('right', err < -0.025);
  st.hold('forward', true);
  st.hold('boost', boost);
}

function nearestLane(x) {
  return LANES.reduce((b, l) => (Math.abs(l - x) < Math.abs(b - x) ? l : b), LANES[0]);
}

function drive(opts = {}) {
  return (st) => autopilot(st, lv(st), opts);
}

const _c = new THREE.Vector3();
function carPos(L, out = _c) {
  return out.copy(L.car.mesh.position);
}
const _m = new THREE.Vector3();
function marshalPos(L, out = _m) {
  return out.copy(L.handler.mesh.position);
}

export const DRIVE_AT = 36.6;
export const FALL_AT = 46.93; // trailer time the car leaves the lip (the score's drop)

export const NO_ESCAPE = {
  shots: [
    {
      // the drive-out's shot B: low on the logging track, the headlights come up it and the car roars past
      id: '4a', at: DRIVE_AT, stage: 'intro2', native: true,
      enter(st) {
        lv(st)._seek(3.4);
      },
    },
    {
      // shot C: across the River Road as it bursts out of the treeline and swings away
      id: '4b', at: DRIVE_AT + 2.0, stage: 'intro2', native: true,
      enter(st) {
        lv(st)._seek(6.45);
      },
    },
    {
      // C2: standing in the road, looking back down the track: his lights coming through the trees
      id: '4c', at: DRIVE_AT + 3.4, stage: 'intro2', native: true,
      enter(st) {
        lv(st)._seek(8.0);
      },
    },
    {
      // Level 2: low on the road in the rain, the car tearing past the lens with the ranger on it
      id: '4d', at: DRIVE_AT + 4.5, stage: 'level02',
      enter(st) {
        const L = lv(st);
        dressRoad(L);
        L._apTarget = 3;
        placeCar(L, 1450, { x: 3, speed: 36, gap: 11, hx: -1 });
        L._camZ = 1450 + 36 * 1.05;
      },
      prep: 0.4,
      drive: drive({ boost: true }),
      camera(st, c, cam) {
        const L = lv(st);
        const p = carPos(L);
        cam.pos.set(-1.2, 0.45, L._camZ);
        cam.look.set(mix(p.x, -1.2, 0.2), 0.9, Math.min(p.z, L._camZ - 2));
        cam.fov = 38;
        // it goes by: the lens whips after it
        const past = smooth(L._camZ - 9, L._camZ + 2, p.z);
        cam.look.lerp(_v.set(p.x, 0.9, p.z + 8), past);
        handheld(cam, c.t, 0.2);
      },
    },
    {
      // alongside at speed: the car, the spray, the police lights right behind it
      id: '4e', at: DRIVE_AT + 6.1, stage: 'level02',
      prep: 0.3,
      drive: drive({ boost: true }),
      camera(st, c, cam) {
        const L = lv(st);
        const p = carPos(L);
        const m = marshalPos(L);
        cam.pos.set(p.x - 5.4, 1.2, p.z + 2.2 - c.k * 3.5);
        cam.look.set(mix(p.x, m.x, 0.35), 0.95, mix(p.z, m.z, 0.42));
        cam.fov = 44;
        handheld(cam, c.t, 0.5);
      },
    },
    {
      // the company's roadblock: trucks and logs across the road, one lane open, and he threads it
      id: '4f', at: DRIVE_AT + 7.6, stage: 'level02',
      enter(st) {
        const L = lv(st);
        const rb = ROADBLOCKS[0];
        L._apTarget = LANES[rb.gap];
        placeCar(L, rb.z - 58, { x: LANES[rb.gap] + 2.5, speed: 38, gap: 12, hx: LANES[rb.gap] - 3 });
      },
      prep: 0.35,
      drive: drive({ boost: true }),
      camera(st, c, cam) {
        const L = lv(st);
        const p = carPos(L);
        const rb = ROADBLOCKS[0];
        // beyond the barricade, low, beside the gap: he comes through it at us
        cam.pos.set(LANES[rb.gap] + 2.1, 0.95, rb.z + 12);
        cam.look.set(mix(p.x, LANES[rb.gap], 0.4), 1.0, Math.min(p.z, rb.z + 4));
        cam.fov = 36;
        handheld(cam, c.t, 0.3);
        jolt(cam, c.local - 1.05, 0.5, 6);
      },
    },
    {
      // the last stretch: the river beside the road, the roar coming up, and then no road at all
      id: '4g', at: DRIVE_AT + 9.0, stage: 'level02',
      enter(st) {
        const L = lv(st);
        L._apTarget = 3;
        placeCar(L, COURSE_END - 62, { x: 3, speed: 32, gap: 20, hx: -3 });
      },
      prep: 0.2,
      drive(st, c) {
        autopilot(st, lv(st));
        markFall(lv(st), c);
      },
      camera(st, c, cam) {
        const L = lv(st);
        const p = carPos(L);
        // high off the edge of the falls, looking back up the road as it comes
        cam.pos.set(p.x - 9 + c.k * 3, 6.5 + c.k * 1.5, COURSE_END + 16);
        cam.look.set(p.x, 0.6, p.z + 6);
        cam.fov = 42;
        handheld(cam, c.t, 0.3);
      },
    },
    {
      // over: the level's own shot, riding down with it, slow as it tips
      id: '4h', at: FALL_AT, stage: 'level02', native: true,
      drive(st, c) {
        const L = lv(st);
        if (!L._finale) autopilot(st, L);
        else for (const a of ['forward', 'left', 'right', 'boost']) st.hold(a, false);
        markFall(L, c);
      },
    },
    {
      // the splash, from downstream: the falls behind it, the car going under
      id: '4i', at: FALL_AT + 2.75, stage: 'level02', native: true,
      prep: 0.5,
    },
  ],
  cards: [
    { at: DRIVE_AT + 8.7, dur: 3.2, kind: 'line', text: 'THERE IS NOWHERE LEFT TO RUN.', y: 0.8, fadeOut: 0.7 },
  ],
  fades: [
    { at: DRIVE_AT - 0.15, dur: 0.55, out: 0.45 },                 // up out of the black under RUN.
    { at: FALL_AT + 3.6, dur: 0.9, in: 0.45, out: 0.2 },           // into the water, and the dark
  ],
};

const _v = new THREE.Vector3();

/** The car leaving the lip is a beat the score hits. */
function markFall(L, c) {
  if (L._finale && !L._markedFall && !c.prepping) {
    L._markedFall = true;
    c.director.mark('fall', c.t, FALL_AT);
  }
}
