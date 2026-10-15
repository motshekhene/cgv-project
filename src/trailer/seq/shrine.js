import * as THREE from 'three';
import { between, ease, handheld, jolt } from '../camera.js';
import { hornCallShot } from './trail.js';

/**
 * Sequences 5 and 6 — THE TRUTH and THE POWER AWAKENS, on Level 3, the
 * shrine at the foot of the falls (levels/Level03.js).
 *
 *   the pool        Kai coming to in the shallows among his car's wreckage
 *   the line        the Marshal riding the zip line down off the falls and
 *                   dropping off the arch into the courtyard
 *   the mask        the carved mask, close
 *   the reveal      the blow that knocks it off, and the face under it: Baba
 *                   Zwane, the man from the fire (the level's own lines)
 *   the snatch      dusk and the storm; he tears the horn off Kai's hip and
 *                   lifts it, and the sky answers at once
 *   the forest      the bolt that comes down on him for holding it
 *   the stag        the killing blow, slowed; then the stone stag at the gate
 *                   cracking open and coming down off its plinth
 *
 * Level 3's story runs by itself in its beats (INTRO, REVEAL, SNATCH, FINAL,
 * RISE). The fight in between is the player's, so the director moves the
 * story on the way the fight would: the blows that take the Marshal's health
 * past a phase are dealt straight to him (HandlerBoss.takeDamage), and the
 * conversations are cut short where the trailer has what it needs.
 */
function lv(st) {
  return st.level;
}

/** Game furniture off: the torn pages he drops and the spirit-shrine markers. */
function dressShrine(L) {
  if (L._trailerDressed) return;
  L._trailerDressed = true;
  L.letters.spawn = () => {};
  L.gifts.setMarkersVisible(false);
  L.gifts.setMarkersVisible = () => {};
}

/** Nothing gets to kill Kai while the director is running the fight. */
function keepAlive(st) {
  const s = st.state;
  s.health = s.maxHealth;
  s.stamina = s.maxStamina;
}

/** Deal the Marshal enough to take him to `frac` of his health (a phase change fires what it fires). */
function bringTo(L, frac) {
  const b = L.boss;
  if (b.state === 'TRANSITION') b._enter('APPROACH');
  const want = b.maxHealth * frac;
  const vuln = b.vulnerable ? 1.6 : 1;
  if (b.health > want) b.takeDamage((b.health - want) / vuln);
}

/** Up to a fighter's face (the head bone, or a fair guess at it). */
const _f = new THREE.Vector3();
function faceOf(fighter, root, out = _f) {
  const head = fighter.headBone || fighter.bone?.('Head');
  if (head) return head.getWorldPosition(out).add(_up.set(0, 0.06, 0));
  return out.copy(root.position).add(_up.set(0, 1.62, 0));
}
const _up = new THREE.Vector3();

function hornPos(L, out = new THREE.Vector3()) {
  return L.keyItem ? L.keyItem.getWorldPosition(out) : out.copy(L.boss.root.position).setY(1.2);
}

export const TRUTH_AT = 51.1;
export const SNATCH_AT = 64.0;

export const TRUTH = {
  shots: [
    {
      // the pool below the falls: he comes to in the shallows, the wreck of the car round him
      id: '5a', at: TRUTH_AT, stage: 'level03', native: true,
      enter(st) {
        dressShrine(lv(st));
      },
      prep: 1.5,
      drive: keepAlive,
    },
    {
      // the line sings: the Marshal rides it down off the falls and drops off the arch
      id: '5b', at: TRUTH_AT + 2.4, stage: 'level03', native: true,
      enter(st) {
        const L = lv(st);
        L.story.hideCard();
        L.combat.fighter.feet?.stop(true);
        L._startArrivals(false);
      },
      prep: 1.15,
      drive: keepAlive,
      camera(st, c, cam) {
        cam.fov = 24; // tighter than the level's 40: who's on the line, not just that someone is
      },
    },
    {
      // the mask: close, his breath, the courtyard behind him
      id: '5c', at: TRUTH_AT + 5.3, stage: 'level03',
      drive: keepAlive,
      camera(st, c, cam) {
        const L = lv(st);
        const b = L.boss;
        const face = faceOf(b.fighter, b.root);
        const fwd = _v.set(Math.sin(b.heading), 0, Math.cos(b.heading));
        const side = _w.set(fwd.z, 0, -fwd.x);
        between(cam,
          { pos: face.clone().addScaledVector(fwd, 2.4).addScaledVector(side, 0.55).add(_up.set(0, -0.12, 0)), look: face.clone(), fov: 30 },
          { pos: face.clone().addScaledVector(fwd, 1.55).addScaledVector(side, 0.35).add(_up.set(0, -0.08, 0)), look: face.clone(), fov: 26 },
          c.k, ease.linear);
        handheld(cam, c.t, 0.12);
      },
    },
    {
      // the blow that knocks it off: slowed right down as the helmet flies
      id: '5d', at: TRUTH_AT + 6.9, stage: 'level03',
      enter(st) {
        const L = lv(st);
        keepAlive(st);
        L._startFight();
        // straight to him: the company's men stand back for this one
        if (L.squad) for (const m of L.squad.men) { m.root.visible = false; m.root.position.set(40, -20, 40); }
        L._startBossAct();
        L.boss.root.position.set(-1.4, L.boss.root.position.y, -4.6);
        L.boss.heading = Math.atan2(L.combat.root.position.x + 1.4, L.combat.root.position.z + 4.6);
        L.boss.root.rotation.y = L.boss.heading;
      },
      prep: 0.1,
      rate: (k) => 0.35 + 0.15 * k,
      drive(st, c) {
        const L = lv(st);
        keepAlive(st);
        if (!L.boss.helmetOff && c.local > 0.15) {
          L.combat.fighter.flinch?.();
          bringTo(L, 0.74);
        }
      },
      camera(st, c, cam) {
        const L = lv(st);
        const b = L.boss;
        const face = faceOf(b.fighter, b.root);
        const fwd = _v.set(Math.sin(b.heading), 0, Math.cos(b.heading));
        const side = _w.set(fwd.z, 0, -fwd.x);
        cam.pos.copy(face).addScaledVector(fwd, 2.6).addScaledVector(side, 1.2).add(_up.set(0, -0.15, 0));
        cam.look.copy(face).add(_up.set(0, 0.3, 0));
        cam.fov = 36;
        jolt(cam, c.local - 0.2, 0.35, 5);
      },
    },
    {
      // Kai, seeing who it is
      id: '5e', at: TRUTH_AT + 8.4, stage: 'level03',
      enter(st) {
        const L = lv(st);
        L.story.hideLine();
      },
      drive: keepAlive,
      rate: 0.6,
      camera(st, c, cam) {
        const L = lv(st);
        const kp = faceOf(L.combat.fighter, L.combat.root);
        const bp = faceOf(L.boss.fighter, L.boss.root, _g);
        overShoulder(cam, bp, kp, c.k, 0.8);
      },
    },
    {
      // and the face: Baba Zwane, the man at the fire
      id: '5f', at: TRUTH_AT + 10.0, stage: 'level03',
      drive: keepAlive,
      camera(st, c, cam) {
        const L = lv(st);
        const kp = faceOf(L.combat.fighter, L.combat.root);
        const bp = faceOf(L.boss.fighter, L.boss.root, _g);
        overShoulder(cam, kp, bp, c.k, -0.8);
      },
    },
  ],
  cards: [
    { at: TRUTH_AT + 8.75, dur: 1.2, kind: 'small', text: 'BABA ZWANE…?', y: 0.84, color: '#f2e8d5', italic: true, size: 26, track: 0.18, fadeIn: 0.25, fadeOut: 0.3 },
    { at: TRUTH_AT + 10.35, dur: 2.45, kind: 'small', text: 'YOU WERE NEVER MEANT TO SEE THIS FACE AGAIN, KAI.', y: 0.84, color: '#f2e8d5', italic: true, size: 26, track: 0.18, fadeIn: 0.3, fadeOut: 0.5 },
  ],
  fades: [
    { at: TRUTH_AT - 0.2, dur: 0.95, in: 0.15, out: 0.6 },   // out of the water's dark
    { at: SNATCH_AT - 0.45, dur: 0.9, in: 0.4, out: 0.35 },  // the breath before it
  ],
};

/** Over the near one's shoulder onto the far one's face (the level's own reveal framing, held longer). */
function overShoulder(cam, near, far, k, sideways) {
  const d = _v.set(near.x - far.x, 0, near.z - far.z).normalize();
  const right = _w.set(d.z, 0, -d.x);
  cam.pos.copy(near).addScaledVector(d, 1.5 - 0.25 * k).addScaledVector(right, sideways).add(_up.set(0, 0.1, 0));
  cam.look.copy(far).add(_up.set(0, -0.12, 0));
  // a lens for a head-and-shoulders on the far face, whatever the distance between them
  const dist = cam.pos.distanceTo(cam.look);
  cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan((0.62 - 0.08 * k) / dist));
}

export const POWER = {
  shots: [
    {
      // dusk, the storm: he goes for Kai and tears the horn off his hip, and the sky answers
      id: '6a', at: SNATCH_AT, stage: 'level03', native: true,
      enter(st) {
        const L = lv(st);
        L._endReveal();
        L.arena.setDuskTarget(1);
        L.arena.setDusk(1);
        L.story.hideLine();
        keepAlive(st);
        bringTo(L, 0.24); // phase IV: the snatch
      },
      drive: keepAlive,
    },
    {
      // the horn in his fist, held up into the rain
      id: '6b', at: SNATCH_AT + 2.1, stage: 'level03',
      drive: keepAlive,
      camera(st, c, cam) {
        const L = lv(st);
        const h = hornPos(L);
        const bp = L.boss.root.position;
        const fwd = _v.set(Math.sin(L.boss.heading), 0, Math.cos(L.boss.heading));
        const side = _w.set(fwd.z, 0, -fwd.x);
        between(cam,
          { pos: _g.copy(bp).addScaledVector(fwd, 2.3).addScaledVector(side, 1.0).setY(bp.y + 0.55), look: h, fov: 40 },
          { pos: _g.copy(bp).addScaledVector(fwd, 1.9).addScaledVector(side, 0.8).setY(bp.y + 0.45), look: h, fov: 34 },
          c.k, ease.linear);
        handheld(cam, c.t, 0.25);
      },
    },
    {
      // the forest comes for him: a glow under him, and the bolt
      id: '6c', at: SNATCH_AT + 3.6, stage: 'level03',
      enter(st) {
        const L = lv(st);
        L._endSnatch();
        L.story.hideLine();
        L._forestT = 1.05;
        L._forestWarned = false;
      },
      drive: keepAlive,
      camera(st, c, cam) {
        const L = lv(st);
        const bp = L.boss.root.position;
        const kp = L.combat.root.position;
        const mid = _g.copy(kp).lerp(bp, 0.6);
        const d = _v.set(bp.x - kp.x, 0, bp.z - kp.z).normalize();
        const side = _w.set(-d.z, 0, d.x);
        cam.pos.copy(mid).addScaledVector(side, 7.5).addScaledVector(d, -2.5).setY(mid.y + 1.4);
        cam.look.copy(mid).setY(mid.y + 2.2);
        cam.fov = 46;
        jolt(cam, c.local - 1.05, 0.7, 5);
      },
    },
    {
      // the killing blow, slowed to nothing, the camera arcing round them (the level's FINAL)
      id: '6d', at: SNATCH_AT + 5.3, stage: 'level03', native: true,
      enter(st) {
        const L = lv(st);
        keepAlive(st);
        L.combat.fighter.play?.('kick', { fade: 0.05 });
        bringTo(L, 0);
      },
      drive: keepAlive,
    },
    {
      // the stone stag at the gate cracks open and comes down off its plinth
      id: '6e', at: SNATCH_AT + 7.2, stage: 'level03', native: true,
      prep: 0.9,
      drive(st) {
        const L = lv(st);
        keepAlive(st);
        if (L.mode === 'RISE') L.story.hideLine();
      },
      camera(st, c, cam) {
        cam.fov = 30;
      },
    },
    // ---- the rapid cuts
    {
      // its head, close and low: the cracks burning
      id: '6f', at: SNATCH_AT + 9.6, stage: 'level03',
      enter(st) {
        const L = lv(st);
        L.story.hideLine();
        L._startStagAct();
        if (L.stag) L.stag.restFor = 0.35;
      },
      drive: keepAlive,
      camera(st, c, cam) {
        const L = lv(st);
        const s = L.stag.root.position;
        const kp = L.combat.root.position;
        const d = _v.set(kp.x - s.x, 0, kp.z - s.z).normalize();
        const side = _w.set(d.z, 0, -d.x);
        cam.pos.copy(s).addScaledVector(d, 6.2).addScaledVector(side, 2.2).setY(s.y + 0.9);
        cam.look.copy(s).setY(s.y + 2.5).addScaledVector(d, 1.2);
        cam.fov = 38 - 6 * c.k;
        handheld(cam, c.t, 0.35);
      },
    },
    hornCallShot(SNATCH_AT + 10.45),
    {
      // it comes for him: low on the stones as it charges
      id: '6h', at: SNATCH_AT + 11.8, stage: 'level03',
      drive: keepAlive,
      camera(st, c, cam) {
        const L = lv(st);
        const s = L.stag.root.position;
        const kp = L.combat.root.position;
        const d = _v.set(s.x - kp.x, 0, s.z - kp.z).normalize();
        const side = _w.set(d.z, 0, -d.x);
        cam.pos.copy(kp).addScaledVector(d, -3.4).addScaledVector(side, 1.7).setY(kp.y + 0.8);
        cam.look.copy(s).setY(s.y + 1.4);
        cam.fov = 44;
        handheld(cam, c.t, 0.6);
      },
    },
    {
      // the sky splits over the shrine
      id: '6i', at: SNATCH_AT + 12.9, stage: 'level03',
      enter(st) {
        const L = lv(st);
        const s = L.stag.root.position;
        L.storm.strikeAt(s.x + 4, s.z - 6, st.camera);
      },
      drive: keepAlive,
      camera(st, c, cam) {
        const L = lv(st);
        const kp = L.combat.root.position;
        const s = L.stag.root.position;
        cam.pos.set(kp.x + 9, kp.y + 2.2, kp.z + 9);
        cam.look.copy(kp).lerp(s, 0.5).setY(4.5);
        cam.fov = 52;
        jolt(cam, c.local, 0.5, 6);
      },
    },
    {
      // the last frame: the two of them in the storm, the horn burning at his hip. Then nothing.
      id: '6j', at: SNATCH_AT + 13.6, stage: 'level03',
      rate: 0.5,
      drive: keepAlive,
      camera(st, c, cam) {
        const L = lv(st);
        const kp = L.combat.root.position;
        const s = L.stag.root.position;
        const d = _v.set(s.x - kp.x, 0, s.z - kp.z).normalize();
        const side = _w.set(d.z, 0, -d.x);
        const mid = _g.copy(kp).lerp(s, 0.45);
        cam.pos.copy(mid).addScaledVector(side, 5.8 - c.k * 0.6).addScaledVector(d, -0.8).setY(0.55);
        cam.look.copy(mid).setY(1.7);
        cam.fov = 40;
      },
    },
  ],
  cards: [
    { at: SNATCH_AT + 2.35, dur: 1.5, kind: 'small', text: 'IT ANSWERS TO WHOEVER HOLDS IT.', y: 0.84, color: '#f2e8d5', italic: true, size: 26, track: 0.18, fadeIn: 0.25, fadeOut: 0.35 },
  ],
  fades: [
    { at: SNATCH_AT + 4.62, dur: 0.22, in: 0.02, out: 0.2, color: '#eef3ff', peak: 0.85 }, // the bolt
    { at: SNATCH_AT + 12.9, dur: 0.18, in: 0.01, out: 0.17, color: '#eef3ff', peak: 0.9 },  // and again
    { at: SNATCH_AT + 9.55, dur: 0.12, in: 0.03, out: 0.09, color: '#eef3ff', peak: 0.6 },  // the cuts start on a flash
  ],
};

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _g = new THREE.Vector3();
