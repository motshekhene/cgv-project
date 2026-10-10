import * as THREE from 'three';
import { Level } from '../core/Level.js';
import { CombatController } from './level3/CombatController.js';
import { HandlerBoss } from './level3/HandlerBoss.js';
import { ShrineArena, WALK_R } from './level3/ShrineArena.js';
import { LetterDrops } from './level3/Letters.js';
import { ShrineGifts } from './level3/Awards.js';
import { WaterFX, Wetness } from './level3/Wetness.js';
import { Wreck } from './level3/Wreck.js';
import { Storm } from './level3/Storm.js';
import { KeyVision } from './level3/KeyVision.js';
import { StrikeTrail, Shockwaves } from './level3/Trails.js';
import { Fireflies } from './level3/Fireflies.js';
import { Level3Sound } from './level3/sound.js';
import { FightHUD } from '../ui/FightHUD.js';
import { TouchControls } from '../ui/TouchControls.js';
import { StoryOverlay } from '../ui/StoryOverlay.js';
import { StyleMeter } from './level3/StyleMeter.js';
import { loadRig } from '../player/rig.js';
import { attachHorn, poseHorn, HORN_HAND } from '../intros/cast.js';
import { SPEAKERS, ensureDialogueFont } from '../ui/dialogue.js';

/**
 * Level 03 — FIGHT, "The Falls".
 *
 * The shrine courtyard by the waterfall, golden hour. The end of the horn
 * story the prologue starts: Kai went over the falls with the horn still in
 * his hand, and the Marshal (the company's man in the armoured coat and the
 * carved mask, who has hunted him since the stone) comes down off the arch
 * for it. When the mask comes off in phase II it is Baba Zwane: the man at the
 * fire who sent Kai up the ridge. The company paid Baba Zwane to get the horn
 * off the stone and into their hands; he used Kai as the bait. Same split Level02 uses:
 * CombatController and HandlerBoss own their own logic and never touch each
 * other, ShrineArena owns the world, and this file is the only place that
 * reads all of them — it resolves hits/parries/dodges, runs the story beats,
 * and publishes to the shared GameState (health, stamina, phase, handlerState,
 * handlerHelmetOff, letters, timeScale).
 *
 * Beats (docs/JUNGLE_SHRINE_IMPLEMENTATION.md, section 6):
 *   INTRO     Kai wakes in the pool among his car's wreckage (level3/Wreck.js),
 *             wades out, steps up onto the path (level3/FootPlant.js) and
 *             gets the water off (level3/DustOff.js), runs
 *             through the gate dripping; the Marshal jumps down off the arch
 *             behind him, and they trade a few lines, typed out on screen,
 *             before it starts (Kai still thinks he is taking the horn to
 *             Baba Zwane). Skippable; skipped on restarts. He stays soaked
 *             into the fight and dries over ~40 s (level3/Wetness.js).
 *   FIGHT     a VS splash, then four health-gated phases. Phase II pops the
 *             helmet (REVEAL: a slow-mo reaction shot, then Kai sees who it is
 *             and the two of them have it out, line by line: REVEAL_TALK;
 *             from then on the boss bar says BABA ZWANE);
 *             phase III turns the sky to dusk, lights the torches, runs the
 *             pool red and brings a storm in (level3/Storm.js). A perfect
 *             dodge bends time (FOCUS_*, drawn by level3/KeyVision.js). The
 *             fight isn't penned in: Kai can break for the jungle ring, where
 *             three shrines each give one gift (Awards.js), with the Handler
 *             after him. From the second loss on, each makes the next
 *             attempt's Marshal weaker.
 *   SNATCH    at a quarter of his health Baba Zwane tears the horn off Kai's
 *             hip and lifts it himself, the thing he told Kai he never dared
 *             do (SNATCH_TALK). Phase IV: THE HORN. He fights with it (the
 *             horn blast) and the forest comes for him for it: every few
 *             seconds a bolt comes down on him and leaves him reeling, which
 *             is Kai's opening. When he falls the horn falls with him, and
 *             Kai goes and takes it back before anything else.
 *   FINAL     the killing blow in slow motion, the camera arcing round them.
 *   EPILOGUE  the storm passes and fireflies come out while the camera circles
 *             the fallen Baba Zwane, then the VICTORY card: the horn goes back
 *             to the stone. PLAY AGAIN.
 */
function shortestAngle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The Handler's leap off the arch, read from his jump clip's foot track
 * (Fighter.footTrack, sampled at 30 fps). Mixamo's Jumping Down starts on a
 * ledge and the build keeps it, so the clip stands him ~1.1 m above his root:
 * `lower(t)` is how far to drop the model at clip time t so a planted foot
 * is on the ground (the arch before the leap, the courtyard after it); in the
 * air it slides evenly from one to the other. off/on: when his feet leave
 * and when they land.
 */
function leapProfile(feet, rest) {
  const at = (t) => {
    const i = Math.min(feet.length - 1, Math.max(0, t * 30));
    const i0 = Math.floor(i), i1 = Math.min(feet.length - 1, i0 + 1);
    return feet[i0] + (feet[i1] - feet[i0]) * (i - i0);
  };
  const lift = feet.findIndex((y) => y > feet[0] + 0.03);
  if (lift < 0) return null;
  let land = lift;
  for (let i = lift; i < feet.length; i++) if (feet[i] < feet[land]) land = i;
  const off = (lift - 1) / 30, on = land / 30;
  return {
    off, on,
    lower(t) {
      if (t <= off || t >= on) return at(t) - rest;
      const k = (t - off) / (on - off);
      return at(off) - rest + (at(on) - at(off)) * k;
    },
  };
}

/** What CombatController sees while a cutscene owns Kai. */
const NO_INPUT = { axis: () => 0, isDown: () => false, pressed: () => false };

const FIGHT_FOV = 62;
const KAI_START = new THREE.Vector3(-0.4, 0, -0.6); // where the intro leaves Kai
const BOSS_LAND = new THREE.Vector3(-3.0, 0, -11.2); // where the Handler lands off the arch
// intro shot A: Kai is out of the water and up on the path at WADE_OUT, stands easy, and gets the water off (DustOff, ~2.45 s)
const WADE_OUT = 5.55;
const SHAKE_AT = 5.8;
const A_END = 8.5;
const SHAKE_BEAT = A_END - 5.6; // how much longer that made the intro (shot A used to end at 5.6)
// intro shot C: the Handler on the keystone from C_AT, his leap clip already under way (from LEAP_FROM s in, as he crouches)
const C_AT = 9.7;
const LEAP_FROM = 0.3;
const LEAP_G = 13; // m/s²: a touch more than gravity, or a man falling 9 m reads as floating on screen
// intro shot D: face to face before the fight, each line typed out on screen. pose: what the speaker does with it
// the masked Marshal until phase II; Baba Zwane (the prologue's amber) once the mask is off
// names and colours are the prologue's (ui/dialogue.js), so a line reads the same in every level
const WHO = {
  handler: { name: 'THE MARSHAL', color: SPEAKERS['THE MARSHAL'] },
  zwane: { name: 'BABA ZWANE', color: SPEAKERS['BABA ZWANE'] },
  kai: { name: 'KAI', color: SPEAKERS.KAI },
};
// Kai still has no idea who is under the mask: he thinks he is carrying the horn back to Baba Zwane
const TALK = [
  { who: 'handler', text: 'Down a mountain. Over the falls. And you still haven\u2019t let go of it.' },
  { who: 'kai', text: 'You\u2019ve been on me since the stone. Who are you?' },
  { who: 'handler', text: 'The company\u2019s Marshal. That horn is company property now. Hand it over, guide.', pose: 'angry' },
  { who: 'kai', text: 'The whole forest went quiet when I took it. I\u2019m taking it to Baba Zwane. He\u2019ll know what to do.' },
  { who: 'handler', text: 'Will he.' },
];
// Phase II: the mask comes off, and it is the man from the fire
const REVEAL_TALK = [
  { who: 'kai', text: 'Baba Zwane\u2026?' },
  { who: 'zwane', text: 'You were never meant to see this face again, Kai.' },
  { who: 'kai', text: 'You taught me every path in this forest. Last night you sat with me at the fire.' },
  { who: 'zwane', text: 'And you listened. You always listened. That is why it had to be you.' },
  { who: 'kai', text: 'You sent me up that ridge knowing what would wake.' },
  { who: 'zwane', text: 'The company paid me to put that horn in their hands. If I had lifted it myself, the forest would have come for me.' },
  { who: 'zwane', text: 'A guide on the paths at dawn \u2014 nobody looks twice. You drew it off. You were the bait.', pose: 'angry' },
  { who: 'kai', text: 'The last crew. The ones who went past the stone and never came back.' },
  { who: 'kai', text: 'Did you send them too?' },
  { who: 'zwane', text: '\u2026They didn\u2019t listen.' },
  { who: 'kai', text: 'A year\u2019s wages. That\u2019s what this whole forest was worth to you?' },
  { who: 'zwane', text: 'Everything is worth something, boy. Give me the horn, and walk away.' },
  { who: 'kai', text: 'It\u2019s going back on the stone. Even if I have to go through you.' },
];
// a retry: he has seen the face before, so just the beat of it
const REVEAL_AGAIN = [
  { who: 'kai', text: 'Baba Zwane.' },
  { who: 'zwane', text: 'The horn, Kai.' },
];
// Phase IV: down to a quarter, he tears the horn off Kai's hip and lifts it himself
const SNATCH_TALK = [
  { who: 'kai', text: 'Baba, don\u2019t! You said it yourself \u2014 lift it, and the forest comes for you.' },
  { who: 'zwane', text: 'Then let it come. I have been afraid of this forest my whole life.', pose: 'angry' },
  { who: 'zwane', text: 'Feel that, boy? It answers to whoever holds it.' },
  { who: 'kai', text: 'It doesn\u2019t answer to anyone. It remembers.' },
];
// down, after he had the horn: before the last words, what it did to him
const EPILOGUE_TAKEN = [
  { who: 'zwane', text: 'It burned\u2026 It would not let me hold it.' },
  { who: 'kai', text: 'It was never yours to carry. Or mine.' },
];
// He is down. Last words, then Kai blows the horn and the forest answers
const EPILOGUE_TALK = [
  { who: 'zwane', text: 'The company\u2026 will only send others.' },
  { who: 'kai', text: 'Let them come. They\u2019ll find the horn back on its stone.' },
  { who: 'zwane', text: 'And the forest awake. You always did believe the old stories.' },
  { who: 'kai', text: 'Someone had to.' },
];
// mid-fight, without stopping it: what they shout at each other (once each)
const BARKS = {
  desperation: [{ who: 'zwane', text: 'I taught you every path in this forest! I know where you\u2019ll step before you do!' }],
  kaiLow: [
    { who: 'zwane', text: 'Give it up, Kai. The forest won\u2019t thank you.' },
    { who: 'kai', text: 'It doesn\u2019t have to.' },
  ],
  kaiLowMasked: [{ who: 'handler', text: 'Hand it over, guide, and this ends here.' }],
  bossLow: [
    { who: 'zwane', text: 'Wait! Half \u2014 I\u2019ll give you half of it!' },
    { who: 'kai', text: 'Keep your money.' },
  ],
  forest: [
    { who: 'zwane', text: 'Aagh! The sky itself\u2026!' },
    { who: 'kai', text: 'It knows whose hand it\u2019s in.' },
  ],
  hornLow: [{ who: 'zwane', text: 'It\u2019s burning\u2026 the horn is burning my hand!' }],
};
// phase IV: the forest strikes him every FOREST_EVERY s (a warning glow under him FOREST_WARN s before)
const FOREST_EVERY = [6.5, 9];
const FOREST_WARN = 0.9;
const FOREST_STAGGER = 2.2; // he reels this long: the opening
const FOREST_SPLASH = 2.2; // m: stand this close and it catches Kai too
const FOREST_SPLASH_DAMAGE = 8;
// the zip line he comes down on, from the cliff edge beside the falls to the keystone of the arch
const ROPE_TOP = new THREE.Vector3(-3.9, 18.3, -33.0); // on the lip of the falls, where Level 2 left him
const ROPE_HANG = 2.15; // the pulley rides this far above his feet
const ROPE_T = 2.6; // seconds down the line
// the horn raised to his lips: the base end in his fist up by his mouth, the curl out in front of him
const HORN_BLOW = { bone: 'PalmR', pos: [0.0, 0.06, 0.04], rot: [0, 0.6, Math.PI / 2 + 0.5] };
const TALK_AFTER = 1.6; // shot D starts this long after he lands
// a perfect dodge: started this close (s) before the blow lands, it bends time round Kai for FOCUS_TIME (real) s:
// the world runs at FOCUS_SCALE, Kai at FOCUS_KAI, and his hits do FOCUS_DAMAGE x (KeyVision draws it)
const PERFECT_DODGE = 0.2;
const FOCUS_TIME = 1.6;
const FOCUS_SCALE = 0.25;
const FOCUS_KAI = 0.9;
const FOCUS_DAMAGE = 1.5;
// lost to him more than once (`losses`)? from the second loss on he starts each new attempt this much
// weaker, down to EASE_MIN of his health. The first retry is the same fight: learn it.
const EASE_PER_LOSS = 0.1;
const EASE_MIN = 0.7;
const VS_TIME = 1.75; // the VS splash, then FIGHT
const PAUSE_TIP = 'Dodge at the very last instant for a perfect dodge: time slows for everyone but Kai, and his hits land harder.';
const TOTAL_PAGES = 6; // three on Level 1's trail, three here
const LETTER_SPOTS = {
  'l3-1': new THREE.Vector3(-9.6, 0, -3.6), // in the courtyard from the start
  'l3-3': new THREE.Vector3(-3.2, 0, -10.2), // the shrine gives it up at dusk
};
/** What the Strategy gift tells you about each of the Marshal's attacks. */
const TELLS = {
  lunge: { name: 'LUNGE', advice: 'dodge sideways or block', color: '#ff9a4a' },
  sweep: { name: 'SWEEP', advice: 'dodge out \u2014 a block only halves it', color: '#ff5a6a' },
  combo: { name: 'COMBO', advice: 'two hits: block or parry both', color: '#c78bff' },
  spin: { name: 'SPIN KICK', advice: 'two kicks all round him: back off, or dodge both', color: '#3fe0b4' },
  blast: { name: 'HORN BLAST', advice: 'a ring all round him: dodge through it, or be well clear', color: '#4fd6e0' },
};
const CREDITS =
  'Ruins, nature and characters: Quaternius (CC0) · Textures: ambientCG (CC0) · ' +
  'Props: Poly by Google (CC0) · Car parts: Kenney (CC0) · ' +
  'Steering wheel: Poly by Google (CC-BY 3.0, via Poly Pizza) · Built with three.js';

let introSeen = false; // restarts skip straight to the fight
let revealSeen = false; // the whole mask-off conversation plays once; a retry gets the short version
let losses = 0; // fights lost to him this session: each one starts the next with him weaker

export class Level03 extends Level {
  constructor() {
    super('level03');
    this.time = 0;
    // camera: 'follow' = rotational, behind Kai, turns as he turns (default)
    //         'lock'   = lock-on, aimed at the Handler, Kai strafes
    //         'orbit'  = free 360° view (drag / hold the side arrows / wheel)
    this.camMode = 'follow';
    this.camYaw = 0;
    this.orbitPitch = 0.55;
    this.orbitDist = 11;
    this.shake = 0;
    this._shakeOff = new THREE.Vector3();
    this._hitStopUntil = 0;
    this._endTimer = -1;
    this._ended = false;
    this._abilityWas = false;

    this._focusT = 0; // seconds of bent time left after a perfect dodge
    this.mode = 'LOADING'; // INTRO | FIGHT | REVEAL | EPILOGUE | END
    this.beatT = 0; // seconds into the current beat (real time, not slowed)
    this.cine = null; // { pos, look, fov, rate } while a cutscene owns the camera
  }

  async init(scene, assets, input, state) {
    super.init(scene, assets, input, state);

    this.arena = new ShrineArena(this.root, scene);
    this.wreck = new Wreck(this.root, this.arena); // his car, washed over the falls with him
    const [kai, handler] = await Promise.all([
      loadRig(assets, 'kai-bryce', 'kai.fbx'),
      loadRig(assets, 'handler-monk', 'handler.fbx'),
      this.arena.build(assets),
      this.wreck.build(assets),
    ]);
    if (!this.scene) return; // level was torn down while loading

    this.kaiMeta = kai.meta;
    this.handlerMeta = handler.meta;
    this.combat = new CombatController(this.root, kai.source, kai.meta);
    this.boss = new HandlerBoss(this.root, this.combat, handler.source, handler.meta);
    this.combat.arenaLimit = this.boss.arenaLimit = WALK_R; // ShrineArena.collide() does the real fencing
    // each loss so far takes a slice off his health for the next attempt (the phases scale with it)
    this._eased = Math.max(EASE_MIN, 1 - EASE_PER_LOSS * Math.max(0, losses - 1));
    this.boss.maxHealth = this.boss.health = Math.round(this.boss.maxHealth * this._eased);
    this.keyItem = attachHorn(this.combat.fighter); // the horn he took off the stone, slung at his hip, still lit
    this._wireBoss(state);
    // Kai comes out of the pool soaked; either of them gets soaked again wading back in
    this.water = new WaterFX(this.root, this.arena);
    this.kaiWet = new Wetness(this.combat.fighter, this.water, { autoShake: true });
    this.bossWet = new Wetness(this.boss.fighter, this.water);
    this.storm = new Storm(this.root, this.arena, this.water); // phase III's rain and lightning
    this._buildZipLine();
    this.storm.onBolt = () => this._addShake(0.12);
    this.vision = new KeyVision(); // the look of bent time (a perfect dodge, the Key)
    this.trail = new StrikeTrail(this.root); // the swoosh behind Kai's kicks and heavy punches
    this.waves = new Shockwaves(this.root); // rings across the ground from heavy blows and parries
    this.flies = new Fireflies(this.root, this.arena); // out once the storm has passed
    this._fliesAmt = 0;
    if (this.handlerMeta?.clips.jump) {
      const bf = this.boss.fighter;
      const feet = bf.footTrack('jump');
      this.leap = feet && leapProfile(feet, Math.min(...bf.footTrack('idle')));
    }

    this._baseMaxHealth = state.maxHealth;
    this._baseParry = this.combat.parryWindow;
    this.gifts = new ShrineGifts(this.arena, state, (id, gift) => this._onGift(id, gift));

    this.letters = new LetterDrops(this.root, state, (id, text) => {
      const found = state.letters.length;
      this.sound?.play('shrinePulse', { volume: 0.7 });
      this.story.showLetter(`TORN PAGE  \u00b7  ${found} / ${TOTAL_PAGES} FOUND`, text);
    });

    this.hud = new FightHUD();
    this.style = new StyleMeter(this.hud);
    this.pauseTip = PAUSE_TIP; // main.js's shared pause menu shows it under the controls
    this.touch = new TouchControls(input, {
      canvas: this.game.renderer.domElement,
      onToggleView: () => this._toggleView(),
    });
    this._applyCamMode(true);
    ensureDialogueFont();
    this.story = new StoryOverlay();
    this.story.onSkip = () => this._skip();
    this.sound = new Level3Sound(); // the fight's audio: cues, bed, theme
    this._applyGifts(); // gifts taken on an earlier attempt stay taken

    const cam = this.game.camera;
    cam.position.set(0, 3.6, 12.5);
    this._camLook = new THREE.Vector3(0, 1.4, 0);
    this._tmp = new THREE.Vector3();
    this._toBoss = new THREE.Vector3();
    this._kaiBody = { prev: null, plant: null }; // last position + the tree or bush each fighter is touching
    this._bossBody = { prev: null, plant: null };

    if (introSeen) this._startFight();
    else this._startIntro();
  }

  /**
   * How the Marshal gets down to the shrine after Kai: he stopped at the top
   * of the falls (Level 2's end), ran a line from the cliff edge beside them
   * down to the keystone of the arch, and rode it. The rope stays rigged for
   * the whole fight; the pulley rides it in the intro.
   */
  _buildZipLine() {
    const a = this.arena.anchors;
    this._ropeA = ROPE_TOP.clone();
    this._ropeB = a.gateTop.clone().add(new THREE.Vector3(0, ROPE_HANG, 0));
    const mat = new THREE.MeshStandardMaterial({ color: 0x3b2c1c, roughness: 0.85 });
    const seg = (p, q, r = 0.022) => {
      const len = p.distanceTo(q);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mat);
      m.position.copy(p).lerp(q, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), q.clone().sub(p).normalize());
      m.castShadow = true;
      this.root.add(m);
    };
    seg(this._ropeA, this._ropeB);
    seg(this._ropeB, a.gateTop.clone().add(new THREE.Vector3(0, 0.15, 0))); // tied off on the keystone
    const metal = new THREE.MeshStandardMaterial({ color: 0x55595e, roughness: 0.4, metalness: 0.8 });
    const anchor = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 8), metal);
    anchor.position.copy(this._ropeA).add(new THREE.Vector3(0, -0.2, 0));
    this.root.add(anchor);
    // the pulley he rides: a wheel in a cheek plate, and the strap he hangs from
    this._pulley = new THREE.Group();
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.025, 8, 16), metal);
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.18), metal);
    cheek.position.y = -0.05;
    const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 6), mat);
    strap.position.y = -0.35;
    this._pulley.add(wheel, cheek, strap);
    this._pulley.position.copy(this._ropeB);
    this._pulley.lookAt(this._ropeA);
    this.root.add(this._pulley);
  }

  /** Shot R: down the line from the cliff to the keystone, sparks off the pulley; Kai looks up at the sound. */
  _updateRope(s, dt) {
    const b = this.boss, bf = b.fighter;
    const k = this.combat, kf = k.fighter, kp = k.root.position;
    if (this._shot !== 'R') {
      this._shot = 'R';
      kp.copy(KAI_START);
      kf.play('idle', { fade: 0.3 });
      b.root.visible = true;
      this._ropeMid = this.leap ? (this.leap.off + this.leap.on) / 2 : 0;
      if (this.leap) bf.hold('jump', this._ropeMid, 0); // mid-leap: arms up, legs tucked, the way you ride a line
      else bf.play('idle', { fade: 0 });
      this.sound?.play('whoosh', { volume: 0.6, rate: 0.6 });
      this._sparkT = 0;
      this.story.showCard('THE MARSHAL', 'He came over the edge after you.');
    }
    const u = Math.min(1, s / ROPE_T);
    // faster and faster down the line, then the brake at the bottom
    const e = u < 0.82 ? 0.95 * Math.pow(u / 0.82, 1.7) : 0.95 + 0.05 * smooth(0.82, 1, u);
    const p = this._tmp.copy(this._ropeA).lerp(this._ropeB, e);
    this._pulley.position.copy(p);
    b.root.position.set(p.x, p.y - ROPE_HANG, p.z);
    b.heading = Math.atan2(this._ropeB.x - this._ropeA.x, this._ropeB.z - this._ropeA.z);
    b.root.rotation.y = b.heading;
    this._sparkT -= dt;
    if (this._sparkT <= 0 && u < 0.97) {
      this._sparkT = 0.05;
      this.arena.burst(p.x, p.z, { color: 0xffb347, count: 5, speed: 2.4, size: 0.07, y: p.y, lift: 0.4, additive: true });
    }
    if (u >= 1 && !this._ropeBraked) {
      this._ropeBraked = true;
      this._addShake(0.25);
      this.sound?.play('impact', { volume: 0.5, rate: 1.3 });
    }
    // Kai hears the line sing and looks up at the arch
    if (s > 0.5) {
      const want = Math.atan2(this.arena.anchors.gateTop.x - kp.x, this.arena.anchors.gateTop.z - kp.z);
      k.heading += shortestAngle(k.heading, want) * (1 - Math.exp(-3 * dt));
    }
    // from behind Kai, up at the arch and the cliff, following him down
    this.cine.pos.set(2.6, 2.1, 7.4);
    this.cine.look.set(b.root.position.x, b.root.position.y + 1.2, b.root.position.z);
    this.cine.fov = 55;
    this.cine.rate = 4;
    bf.update(dt);
    if (this.leap) bf.visual.position.y = -this.leap.lower(this._ropeMid);
  }

  /* ---------------------------------------------------------------- gifts */

  /** Make Kai match state.awards. Safe to call again after each new gift. */
  _applyGifts(fresh = null) {
    const has = (id) => this.state.awards.includes(id);
    const st = this.state;
    const max = this._baseMaxHealth * (has('vitality') ? 1.4 : 1);
    if (max !== st.maxHealth || fresh === 'vitality') {
      st.maxHealth = max;
      st.health = max; // the gift heals as it grows the bar
    }
    this.combat.parryWindow = this._baseParry * (has('strategy') ? 1.5 : 1);
    this.strategy = has('strategy');
    this.combat.damageMul = has('power') ? 1.4 : 1;
    this.power = has('power');
    this._setFistGlow(this.power);
    this.hud.setAwards(st.awards, fresh);
  }

  _onGift(id, gift) {
    this._applyGifts(id);
    this.sound?.play('pickupHeart', { volume: 0.7 });
    this.story.showAward(gift.icon, gift.name, gift.desc, gift.css);
    this._addShake(0.2);
    const left = this.gifts.remaining;
    if (left > 0) this.hud.toast('SHRINES', `${left} more gift${left > 1 ? 's' : ''} in the jungle`, 3);
  }

  /** Power gift: embers in both fists. */
  _setFistGlow(on) {
    if (!this._fists) {
      if (!on) return;
      this._fists = [];
      const f = this.combat.fighter;
      f.root.updateMatrixWorld(true);
      for (const o of [f.bone('PalmL'), f.bone('PalmR')]) {
        if (!o) continue;
        const s = o.getWorldScale(new THREE.Vector3()).x;
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.arena.dot, color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85,
        }));
        glow.scale.setScalar(0.42 / s);
        glow.position.set(0, 0.06 / s, 0);
        o.add(glow);
        this._fists.push(glow);
      }
    }
    for (const f of this._fists) f.visible = on;
  }

  /* ---------------------------------------------------------------- fight */

  _wireBoss(state) {
    const hud = () => this.hud;

    this.boss.onStrike = (info) => {
      const c = this.combat;
      if (c.dead || this._ended || this.mode !== 'FIGHT') return 'dodged';
      if (c.dodging) {
        if (c.dodgeDuration - c.dodgeT <= PERFECT_DODGE) this._perfectDodge(state);
        else {
          hud().popup('DODGE', '#8fe8ff');
          this.style.add('dodge');
        }
        this.sound?.play('whoosh', { volume: 0.4 });
        return 'dodged';
      }
      if (c.parryReady()) {
        state.stamina = Math.min(state.maxStamina, state.stamina + 25);
        this._hitStop(0.09);
        this._addShake(0.4);
        hud().popup('PARRY!', '#ffe066');
        this.style.add('parry');
        this.waves.spawn(c.root.position.x, c.root.position.y, c.root.position.z, { size: 2.2, life: 0.35, color: 0xffe066 });
        this.sound?.play('parry', { volume: 0.75 });
        this.sound?.duck(0.3, 0.4);
        return 'parried';
      }
      if (c.blocking) {
        state.damage(info.damage * info.blockMul);
        state.spendStamina(info.damage * 0.7);
        this._addShake(0.14);
        // the blow lands on his forearms: he rocks back with it, and it sparks off the guard
        const bp = this.boss.root.position, cp = c.root.position;
        c.onBlocked(bp.x, bp.z);
        this.arena.burst(cp.x + (bp.x - cp.x) * 0.25, cp.z + (bp.z - cp.z) * 0.25, {
          color: 0xffe2a8, count: 18, speed: 2.6, size: 0.14, y: cp.y + 1.35, lift: 1.2, additive: true,
        });
        hud().popup('BLOCKED', '#c9d6e0');
        this.sound?.play('block', { volume: 0.7 });
        this._checkPlayerDeath(state);
        return 'blocked';
      }
      state.damage(info.damage);
      c.onHurt();
      this.style.hurt();
      this._hitStop(0.035);
      this._addShake(0.32);
      hud().damageFlash();
      this.sound?.play('hurt', { volume: 0.85, rate: 0.96 + Math.random() * 0.08 });
      this.sound?.play('grunt', { volume: 0.45, rate: 1.02 + Math.random() * 0.06 });
      this.sound?.duck(0.45, 0.4);
      this._checkPlayerDeath(state);
      return 'hit';
    };

    this.boss.onCounter = () => {
      hud().popup('COUNTER!', '#ff5a3a');
      this._addShake(0.15);
    };
    this.boss.onHelmetOff = () => {
      this._hitStop(0.12);
      this._addShake(0.5);
      this.sound?.play('guardianRoar', { volume: 0.85 });
      this.sound?.duck(0.5, 1.2);
      this._startReveal();
    };
    this.boss.onPhaseChange = (n) => {
      if (n === 4) this._startSnatch();
      else if (n === 3) {
        this._barkOnce('desperation');
        hud().popup('DESPERATION', '#ff5a3a');
        this.sound?.play('guardianRoar', { volume: 0.7 });
        this.arena.setDuskTarget(1); // the sun goes down on Site 7
        this.letters.spawn('l3-3', LETTER_SPOTS['l3-3']);
      } else if (n === 2) hud().popup('PHASE 2', '#ff8a4a');
    };
    this.boss.onDefeated = () => {
      if (this._hornHeld) this._dropHorn(); // it falls out of his hand with him
      this._hitStop(0.12);
      this._addShake(0.55);
      // the quiet moment at the final blow: the music drops away, his body
      // comes down on the wet rock and the pool takes him — then the fanfare
      this.sound?.play('bodyFall', { volume: 0.9 });
      this.sound?.play('splash', { volume: 0.65, rate: 0.92 });
      this.sound?.duck(0.85, 1.6);
      this.sound?.play('win', { volume: 0.85 });
      this._endTimer = 2.6;
      this._endKind = 'win';
      this._startFinal();
      this.storm.clear();
    };
  }

  get lockOn() {
    return this.camMode === 'lock';
  }

  /** Tab / the corner icon: follow -> lock-on -> 360° view -> follow. */
  _toggleView() {
    if (this.mode !== 'FIGHT') return;
    const order = ['follow', 'lock', 'orbit'];
    this.camMode = order[(order.indexOf(this.camMode) + 1) % order.length];
    this._applyCamMode();
  }

  _applyCamMode(silent = false) {
    const m = this.camMode;
    this.touch.setMode(m);
    if (!silent) this.hud.setCamMode(m);
    // while dragging the camera with the mouse, left-click must not also attack
    if (m === 'orbit') this.input.ignored.add('mouse0');
    else this.input.ignored.delete('mouse0');
  }

  /** An arrow on the screen edge toward the Handler whenever he's out of shot. */
  _updatePointer() {
    if (this.mode !== 'FIGHT' || this._ended || this.boss.state === 'DOWN') {
      this.hud.setPointer(null);
      return;
    }
    const cam = this.game.camera;
    const v = this._ptr || (this._ptr = new THREE.Vector3());
    v.copy(this.boss.root.position);
    v.y += 1.2;
    v.applyMatrix4(cam.matrixWorldInverse); // camera space: +x right, -z ahead
    const a = Math.atan2(v.x, -v.z); // 0 = dead ahead, +pi/2 = to the right, pi = behind
    const halfFov = Math.atan(Math.tan((cam.fov * Math.PI) / 360) * cam.aspect) * 0.92;
    this.hud.setPointer(Math.abs(a) < halfFov ? null : a);
  }

  /**
   * The swoosh: while a kick or a heavy finisher is in its swing, the limb it
   * lands with (by the build's measurements) sweeps a ribbon. Warm white;
   * ember with the Power gift, cyan in bent time.
   */
  _updateTrail(dt, focus) {
    const c = this.combat;
    const a = c.attackDef;
    const swing = a && this.mode === 'FIGHT' && (a.type === 'kick' || a.finisher)
      && c.attackT >= a.windup - 0.12 && c.attackT <= a.windup + a.active + 0.06;
    let bones = null;
    if (swing) {
      const limb = this.kaiMeta?.clips[a.clip]?.limb || (a.type === 'kick' ? 'RightFoot' : 'RightHand');
      bones = (this._trailBones ||= {})[limb];
      if (bones === undefined) {
        const side = limb.startsWith('Left') ? 'Left' : 'Right';
        const b = (n) => c.fighter.bones['mixamorig' + side + n];
        const pair = limb.endsWith('Foot') ? [b('Leg'), b('ToeBase')] : [b('ForeArm'), b('HandMiddle1')];
        bones = this._trailBones[limb] = pair[0] && pair[1] ? pair : null;
      }
      this.trail.setColor(focus ? 0x8ff0ff : this.power ? 0xffa040 : 0xffd88a);
    }
    this.trail.update(dt, bones);
  }

  /** A damage number off the Handler's head, wherever that is on screen. */
  _damageNumber(amount, kind) {
    const bp = this.boss.root.position;
    const v = (this._dmgV ||= new THREE.Vector3()).set(bp.x, bp.y + 1.8, bp.z).project(this.game.camera);
    if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return; // behind the camera or off screen
    this.hud.damageNumber((v.x * 0.5 + 0.5) * window.innerWidth, (-v.y * 0.5 + 0.5) * window.innerHeight, amount, kind);
  }

  /** Dodged at the last instant: time bends round Kai. The world slows right down; he barely does. */
  _perfectDodge(state) {
    this._focusT = FOCUS_TIME;
    state.stamina = Math.min(state.maxStamina, state.stamina + 20);
    this.hud.popup('PERFECT DODGE', '#7fe8ff');
    this.style.add('perfect');
    this._addShake(0.12);
  }

  _checkPlayerDeath(state) {
    if (state.alive || this.combat.dead) return;
    this.combat.die();
    state.deaths++;
    losses++;
    this.sound?.play('defeat', { volume: 0.85 });
    this.sound?.play('bodyFall', { volume: 0.55, rate: 1.12 });
    this.sound?.duck(0.6, 1.5);
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
    // dt arrives already slowed by state.timeScale; cutscenes and the camera run on real time
    const real = dt / Math.max(state.timeScale, 0.05);
    this.time += real;
    this.beatT += real;
    const input = this.input;

    if (input.pressed('skip') && (this.mode === 'INTRO' || (this.mode === 'EPILOGUE' && !this._talk))) {
      if (this._shot === 'D') this._nextLine(true); // mid-conversation, space or a click moves it on a line
      else this._skip();
    } else if (input.pressed('skip') && (this.mode === 'REVEAL' || this.mode === 'SNATCH' || this.mode === 'EPILOGUE') && this._talk) {
      this._nextLine(true); // and through the mask-off conversation the same way
    }

    if (this.mode === 'INTRO') this._updateIntro(dt);
    else if (this.mode === 'EPILOGUE' || this.mode === 'END') this._updateEpilogue(dt);
    else this._updateFight(dt, real, state);

    // dripping, prints, splashes; left idle in the fight, a soaked Kai shakes himself off
    const idle = this.mode === 'FIGHT' && !this._ended ? this.combat.still : null;
    const rain = this.storm.level;
    this.kaiWet.update(dt, { still: idle, rain });
    if (this.boss.root.visible) this.bossWet.update(dt, { rain });
    this.wreck.update(dt, this.time, this.water);
    this.waves.update(dt);
    // the storm has passed: fireflies come out round the fallen Handler
    const flies = this.mode === 'EPILOGUE' || this.mode === 'END' ? 1 : 0;
    this._fliesAmt += (flies - this._fliesAmt) * (1 - Math.exp(-0.5 * real));
    this.flies.update(this.time, this._fliesAmt);
    this.water.update(dt);

    // bent time (a perfect dodge, the Key's slow-mo) shows: KeyVision fades in and out
    const bent = this.mode === 'FIGHT' && !this._ended && (this._focusT > 0 || this.combat.abilityActive);
    this.vision.strength += ((bent ? 1 : 0) - this.vision.strength) * (1 - Math.exp(-(bent ? 12 : 5) * real));
    if (!bent && this.vision.strength < 0.003) this.vision.strength = 0;

    this._updateCamera(real);
    this._updatePointer();
    this.arena.updateOcclusion(real, this.game.camera.position, this._camLook, this.combat.root.position);
    this.arena.update(dt, this.time, this.game.camera);
    this.storm.update(dt, real, this.game.camera, this.combat.root.position);
    this.hud.lightning(this.arena.flash);
    if (this.sound) this.sound.update(dt);
    const fighting = this.mode === 'FIGHT' || this.mode === 'REVEAL';
    const kp = this.combat.root.position;
    this.letters.update(dt, this.time, fighting ? kp : null);
    this.gifts.update(dt, this.time, fighting && !this.combat.dead ? kp : null);
    if (fighting) {
      const bp = this.boss.root.position;
      this.arena.setFocus((kp.x + bp.x) / 2, (kp.z + bp.z) / 2);
    } else this.arena.setFocus(kp.x, kp.z);
    if (this._hornDrop) this._updateHornDrop(dt);
    if (this.keyItem && !this._hornHeld && !this._blowing) {
      const lying = this._hornDrop || this._pickup;
      this.keyItem.userData.material.emissiveIntensity = this.combat.abilityActive ? 0.9 + Math.sin(this.time * 18) * 0.35
        : lying ? 0.45 + Math.sin(this.time * 4) * 0.25 : 0.05;
      this.keyItem.userData.glow.material.opacity = this.combat.abilityActive || lying ? 0.95 : 0.4;
    }

    // shared state for whoever reads it (HUD, other levels' UI)
    state.handlerState = this.boss.state;
    state.phase = this.boss.phaseIndex + 1;
    state.handlerHelmetOff = this.boss.helmetOff;
  }

  _updateFight(dt, real, state) {
    const input = this.input;
    if (input.pressed('lockOn') && !this._ended) this._toggleView();

    // camera yaw: swing round behind Kai (follow), aim at the boss (lock-on), or the player orbits freely
    const cp = this.combat.root.position;
    const bp = this.boss.root.position;
    const orbit = this.touch.consumeOrbit();
    if (this.camMode === 'follow') {
      this.camYaw += shortestAngle(this.camYaw, this.combat.heading) * (1 - Math.exp(-7 * dt));
    } else if (this.camMode === 'lock') {
      const want = Math.atan2(bp.x - cp.x, bp.z - cp.z);
      this.camYaw += shortestAngle(this.camYaw, want) * (1 - Math.exp(-7 * dt));
    } else {
      this.camYaw += orbit.dx * 0.006 + orbit.strip * 1.7 * real;
      this.orbitPitch = Math.min(1.2, Math.max(0.12, this.orbitPitch + orbit.dy * 0.004));
      this.orbitDist = Math.min(24, Math.max(6, this.orbitDist + orbit.zoom * 1.2));
    }

    // the reveal shot holds Kai still for a beat; the key that skipped the intro doesn't also punch
    const controls = this.mode === 'FIGHT' && !this._muteInput ? input : NO_INPUT;
    this._muteInput = false;
    // after a perfect dodge Kai keeps (nearly) his own pace while everything else crawls; hit-stop still freezes him
    if (this._focusT > 0) this._focusT -= real;
    const focus = this._focusT > 0 && this.mode === 'FIGHT';
    const stopped = performance.now() < this._hitStopUntil;
    const kaiDt = focus && !stopped ? real * FOCUS_KAI : dt;
    this.combat.update(kaiDt, controls, state, { camYaw: this.camYaw, lockOn: this.lockOn, targetPos: bp, steer: this.camMode === 'follow' });
    this._updateTrail(kaiDt, focus);
    this.boss.counterOff = focus; // no counter-attacks out of bent time: that's Kai's window

    // Kai's swing
    if (this.combat.consumeHit() && this.boss.state !== 'DOWN') {
      this._toBoss.set(bp.x - cp.x, 0, bp.z - cp.z);
      const dist = this._toBoss.length();
      if (dist > 0.001) this._toBoss.divideScalar(dist);
      const facing = Math.sin(this.combat.heading) * this._toBoss.x + Math.cos(this.combat.heading) * this._toBoss.z;
      if (dist <= this.combat.attackRange && facing > 0.2) {
        const fin = this.combat.comboFinisher;
        const dealt = this.boss.takeDamage(this.combat.attackDamage * (focus ? FOCUS_DAMAGE : 1));
        if (dealt > 0) {
          this.sound?.play('punch', {
            volume: this.boss.vulnerable ? 0.88 : fin ? 0.78 : 0.6,
            rate: 0.96 + Math.random() * 0.08,
          });
          // the big ones draw a grunt out of him
          if (this.boss.vulnerable || fin) {
            this.sound?.play('grunt', { volume: 0.5, rate: 0.82 + Math.random() * 0.06 });
          }
          this.boss.root.position.addScaledVector(this._toBoss, (fin ? 0.9 : 0.3) * (this.power ? 1.4 : 1));
          if (this.power) {
            this.arena.burst(bp.x - this._toBoss.x * 0.4, bp.z - this._toBoss.z * 0.4, {
              color: 0xffb347, count: fin ? 30 : 16, speed: fin ? 3.4 : 2.4, size: 0.2, y: bp.y + 1.1, lift: 1.4, additive: true,
            });
          }
          this._hitStop(fin ? 0.06 : 0.03);
          this._addShake(fin ? 0.28 : 0.1);
          if (fin) {
            this.waves.spawn(bp.x, bp.y, bp.z, {
              size: this.power ? 4.2 : 3.2, color: focus ? 0x8ff0ff : this.power ? 0xffb347 : 0xffe2b0,
            });
          }
          const crit = this.boss.vulnerable;
          if (crit) this.hud.popup('CRITICAL', '#ffd23a');
          this._damageNumber(dealt, crit ? 'crit' : focus ? 'key' : fin ? 'big' : '');
          this.style.add(fin ? 'finisher' : 'hit');
          if (crit) this.style.add('crit');
        }
      }
    }

    // wet footsteps, on stride distance: Kai's soft slaps on the soaked
    // stone, the Handler's heavier and quieter with distance
    if (!this.combat.dead) {
      if (!this._stepPrev) this._stepPrev = cp.clone();
      this._stepDist = (this._stepDist || 0) + cp.distanceTo(this._stepPrev);
      if (this._stepDist >= 1.05) {
        this._stepDist = 0;
        this.sound?.play('footstep', { volume: 0.32, rate: 0.86 + Math.random() * 0.1 });
      }
      this._stepPrev.copy(cp);
      if (!this._bossStepPrev) this._bossStepPrev = bp.clone();
      this._bossStepDist = (this._bossStepDist || 0) + bp.distanceTo(this._bossStepPrev);
      if (this._bossStepDist >= 1.3 && this.boss.state !== 'DOWN') {
        this._bossStepDist = 0;
        this.sound?.play('footstep', {
          volume: 0.5 / (1 + cp.distanceTo(bp) / 9),
          rate: 0.62 + Math.random() * 0.05,
        });
      }
      this._bossStepPrev.copy(bp);
    }

    const b = this.boss.update(dt);
    this._separate();
    // out in the jungle: trees, bushes, statues and walls are solid, and the ground isn't flat
    this._collide(this._kaiBody, cp, 0.4, dt, this.combat.dodging);
    this._collide(this._bossBody, bp, 0.45, dt, false);
    cp.y = this.arena.fighterY(cp.x, cp.z);
    bp.y = this.arena.fighterY(bp.x, bp.z);
    // HandlerBoss glows orange through his phase transition; for the reveal close-up
    // we want his face, so put his materials back to their resting look
    if (this._hornHeld) this._updateHornPhase(dt, real, state);
    if (this.mode === 'REVEAL' || this.mode === 'SNATCH') {
      for (const m of this.boss.fighter.materials) {
        m.emissive.copy(m.userData.baseEmissive);
        m.emissiveIntensity = 1;
      }
    }

    // the VS splash clears, then FIGHT
    if (this._fightCall > 0 && (this._fightCall -= real) <= 0) {
      this.hud.popup('FIGHT', '#ffd9a8');
      for (const t of this._fightToasts) this.hud.toast(...t, { queue: true });
    }
    this.style.update(real);
    this.touch.setKey(1 - this.combat.abilityCD / this.combat.abilityRecharge);

    // the horn: popup on activation
    if (this.combat.abilityActive && !this._abilityWas) {
      this.hud.popup('THE HORN', '#7fd8ff');
      this.sound?.play('whoosh', { volume: 0.5 });
      this.sound?.duck(0.35, 0.6);
    }
    this._abilityWas = this.combat.abilityActive;

    if (this.mode === 'REVEAL') this._updateReveal(real);
    else if (this.mode === 'SNATCH') this._updateSnatch(dt, real);
    else if (this.mode === 'FINAL') this._updateFinal();

    // time scale: hit-stop beats the reveal's slow-mo beats the Key's slow-mo beats normal
    state.timeScale = stopped ? 0.12
      : this.mode === 'FINAL' ? 0.15 + 0.85 * smooth(0.5, 2.3, this.beatT)
      : this.mode === 'REVEAL' ? (this.beatT < 1.1 ? 0.45 : 1)
      : this.mode === 'SNATCH' ? (this.beatT > 0.3 && this.beatT < 0.9 ? 0.3 : 1)
      : focus ? FOCUS_SCALE
      : this.combat.abilityActive ? 0.35 : 1;

    // what they shout at each other as it turns
    if (this.mode === 'FIGHT' && !this._ended) {
      if (state.health / state.maxHealth < 0.3) this._barkOnce(this.boss.helmetOff ? 'kaiLow' : 'kaiLowMasked');
      if (this.boss.helmetOff && this.boss.health / this.boss.maxHealth < 0.15 && this.boss.health > 0) this._barkOnce(this._hornHeld ? 'hornLow' : 'bossLow');
    }
    this._tickBark(real);
    this.hud.setBoss(this.boss.health / this.boss.maxHealth, b.state === 'DOWN' ? 'DEFEATED' : `PHASE ${this.boss.phaseIndex + 1} — ${b.phase}`);
    this.hud.setPlayer(state.health / state.maxHealth, state.stamina / state.maxStamina, state.maxHealth / this._baseMaxHealth);

    // Strategy gift: call his next move while he lines it up
    const tell = this.strategy && this.mode === 'FIGHT' && !this._ended && TELLS[this.boss.attackName];
    if (tell && (b.state === 'APPROACH' || b.state === 'TELEGRAPH')) {
      this.hud.setTell(b.state === 'TELEGRAPH' ? `${tell.name} \u2014 NOW` : `NEXT \u00b7 ${tell.name}`, tell.advice, tell.color);
    } else this.hud.setTell('');

    if (this._endTimer >= 0 && !this._ended) {
      this._endTimer -= real;
      if (this._endTimer < 0) this._finish(state);
    }
  }

  /**
   * Keep one fighter out of the scenery. Running into a tree or bush (a fresh contact,
   * not leaning on it) rocks it and shakes leaves loose; Kai rolling into
   * one also thumps the camera.
   */
  _collide(body, pos, rad, dt, rolling) {
    const speed = body.prev ? Math.hypot(pos.x - body.prev.x, pos.z - body.prev.z) / Math.max(dt, 1e-4) : 0;
    const plant = this.arena.collide(pos, rad);
    if (plant && plant !== body.plant && speed > 1.5) {
      this.arena.shakePlant(plant, pos.x, pos.z, Math.min(1, speed / 6) * (rolling ? 1.5 : 1));
      if (rolling) this._addShake(0.22);
    }
    body.plant = plant;
    (body.prev ||= new THREE.Vector3()).copy(pos);
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
    if (this._endKind === 'win') {
      this._startEpilogue();
      return;
    }
    // clear the screen for the defeat card: no bars, no buttons, no lock widget
    this.touch.setVisible(false);
    const who = this.boss.helmetOff ? 'Baba Zwane' : 'The Marshal';
    this.hud.showBanner('DEFEATED', `${who} stands over you, and the horn slips from your hand.`, null, {
      kind: 'lose',
      action: { label: 'TRY AGAIN', key: 'R', onClick: () => this.game.restart() },
    });
  }

  /* ---------------------------------------------------------------- beats */

  _setCine(pos, look, { fov = FIGHT_FOV, rate = 3, cut = false } = {}) {
    if (!this.cine) this.cine = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov, rate };
    this.cine.pos.copy(pos);
    this.cine.look.copy(look);
    this.cine.fov = fov;
    this.cine.rate = rate;
    if (cut) {
      this._shakeOff.set(0, 0, 0);
      this.game.camera.position.copy(pos);
      this._camLook.copy(look);
      this.game.camera.fov = fov;
      this.game.camera.updateProjectionMatrix();
    }
  }

  _enterBeat(mode) {
    this.mode = mode;
    this.beatT = 0;
    this._shot = null;
  }

  /** Space / Enter / click, or the on-screen hint: jump to the end of the current cutscene. */
  _skip() {
    if (this.mode === 'INTRO') this._startFight();
    else if (this.mode === 'REVEAL') this._endReveal();
    else if (this.mode === 'SNATCH') this._endSnatch();
    else if (this.mode === 'EPILOGUE') this._showEnd();
  }

  _startIntro() {
    this._enterBeat('INTRO');
    this.sound?.setVariant('intro');
    this.story.setCinematic(true, true);
    this.hud.setVisible(false);
    this.touch.setVisible(false);
    this.boss.root.visible = false;
    const k = this.combat;
    k.root.position.copy(this.arena.anchors.wake);
    k.heading = 0.36; // facing the gate
    k.root.rotation.y = k.heading;
    // the Mixamo Kai lies washed up in the shallows (the first frame of his getting-up clip); the old one sits
    if (this.kaiMeta) k.fighter.playOnce('standing', { fade: 0, speed: 0 });
    else k.fighter.play('sitting', { fade: 0 });
    this.kaiWet.setWet(1); // soaked even if the intro is skipped on its first frame
  }

  /**
   * Five shots, ~30 s if you let the talk play out: (A) Kai sits up in the
   * pool, seen from inside the gate, wades out and gets the water off as the
   * camera backs through the arch; (B) cut to the courtyard as he runs through
   * the arch toward camera; (C) the Handler leaps off the arch behind him, Kai
   * turns; (D) face to face, the dialogue (Space moves it on a line); then
   * the fight camera.
   */
  _updateIntro(dt) {
    // shot A runs on its own clock; B and C keep their timings, just SHAKE_BEAT later
    let t = this.beatT < A_END ? this.beatT : this.beatT - SHAKE_BEAT;
    const k = this.combat;
    const kf = k.fighter;
    const a = this.arena.anchors;
    const kp = k.root.position;

    if (this.beatT < A_END) {
      // ---- A: the wake-up
      if (this._shot !== 'A') {
        this._shot = 'A';
        this._setCine(new THREE.Vector3(-3.25, 1.0, -17.7), new THREE.Vector3(-4.5, 0.55, -21.0), { fov: 50, cut: true });
        this.story.showCard('THE FALLS', 'The river took him over the edge. The horn is still in his hand.');
      }
      const floor = this.arena.groundHeight(kp.x, kp.z);
      const sink = this.kaiMeta ? 0 : 0.45; // the old Kai's sitting clip sits on thin air: lower him onto the bed
      if (t < 2.2) {
        kp.y = floor - sink; // on the pool bed
      } else if (t < 3.6) {
        if (this._pose !== 'stand') {
          this._pose = 'stand';
          if (this.kaiMeta) kf.setSpeed(1.6); // the getting-up clip, held on its first frame till now
          else kf.playOnce('standing', { fade: 0.15, speed: 0.6 });
          this.kaiWet.stream(1.6); // the pool pours off him as he gets up
          this.water.ripple(kp.x, kp.z, 2.2, 0.55, 2.4);
        }
        kp.y = floor - sink * (1 - smooth(2.2, 3.5, t));
      } else if (t < WADE_OUT) {
        if (this._pose !== 'walk') {
          this._pose = 'walk';
          // paced to the 1.35 m/s he wades at; no walk clip? walking backwards, played in reverse, walks forwards
          const pace = (clip) => 1.35 / (this.kaiMeta?.clips[clip]?.speed || 1.35);
          if (kf.actions.walk) kf.play('walk', { fade: 0.25, speed: pace('walk') });
          else kf.play('walkback', { fade: 0.25, speed: -pace('walkback') });
          // the path's last slab stands ~0.4 m proud of the pool bed: he steps up onto it, a foot at a time
          kf.feet?.start((x, z) => Math.max(this.arena.groundHeight(x, z), this.arena.pavingY(x, z)));
        }
        kp.x += Math.sin(k.heading) * 1.35 * dt;
        kp.z += Math.cos(k.heading) * 1.35 * dt;
        if (!kf.feet) {
          // the old Kai has no legs to place: the pool bed, then eased up onto the slab
          const y = Math.max(this.arena.groundHeight(kp.x, kp.z), this.arena.pavingY(kp.x, kp.z));
          kp.y = y > kp.y ? kp.y + (y - kp.y) * (1 - Math.exp(-14 * dt)) : y;
        }
      } else {
        // out on the path: stop, stand easy (not in his fighting stance), and get the water off:
        // shake the head, wipe the face and hair back, shake the hands out
        if (this._pose !== 'shake') {
          this._pose = 'shake';
          kf.feet?.stop();
          if (kf.actions.relax) kf.hold('relax', kf.clipDuration('relax') - 0.01, 0.35);
          else kf.play('idle', { fade: 0.3 });
        }
        if (t >= SHAKE_AT && !this._shook) this._shook = this.kaiWet.shakeOff('full');
      }
      if (t > 3.6) this.story.hideCard();
      // slow push-in, lift to follow him up, then back out through the arch as he comes out of the water
      const back = smooth(3.9, 6.0, t);
      this.cine.pos.set(
        -3.25 + smooth(0, 5.6, t) * 0.15 + back * 1.3,
        1.0 + smooth(1.5, 5.0, t) * 0.55,
        -17.7 + smooth(0, 5.6, t) * 0.5 + back * 2.4,
      );
      // ...and ease back in a little once he stops, so the spray reads
      this.cine.pos.lerp(this._tmp.set(kp.x, this.cine.pos.y, kp.z), smooth(5.8, 7.6, t) * 0.3);
      this.cine.look.set(kp.x, kp.y + 0.55 + smooth(2.2, 3.6, t) * 0.75, kp.z);
      this.cine.rate = 4;
    } else if (t < C_AT) {
      // ---- B: through the gate and down the path, running toward camera
      if (this._shot !== 'B') {
        this._shot = 'B';
        this._introPath = [new THREE.Vector3(-3.18, 0, -17.6), new THREE.Vector3(-3.18, 0, -11.6), KAI_START.clone()];
        this._setCine(new THREE.Vector3(3.4, 1.6, 6.8), new THREE.Vector3(-2.6, 1.6, -12), { fov: 55, cut: true });
        kf.play('run', { fade: 0.1 });
      }
      const s = smooth(5.6, 9.7, t) * 0.22 + ((t - 5.6) / 4.1) * 0.78; // ease out at the end
      this._alongPath(this._introPath, Math.min(1, s));
      this._tmp.set(kp.x, 1.5, kp.z);
      this.cine.look.set(-2.6, 1.6, -12).lerp(this._tmp, 0.55);
      this.cine.rate = 5;
    } else if (this._shot === 'D') {
      // ---- D: face to face, a few words before it starts
      this._updateTalk(dt);
    } else if (t < C_AT + ROPE_T) {
      // ---- R: down the zip line to the keystone
      this._updateRope(t - C_AT, dt);
    } else {
      // ---- C: he lets go of the line, and jumps down off the arch behind Kai
      t -= ROPE_T;
      const b = this.boss;
      const bf = b.fighter;
      const lp = this.leap;
      if (this._shot !== 'C') {
        this._shot = 'C';
        kp.copy(KAI_START);
        kf.play('idle', { fade: 0.3 });
        b.root.visible = true;
        b.root.position.copy(a.gateTop);
        b.heading = Math.atan2(KAI_START.x - a.gateTop.x, KAI_START.z - a.gateTop.z);
        b.root.rotation.y = b.heading;
        // the leap clip, scrubbed by hand below; no clip to read, the old Handler stands and plays his jump on take-off
        if (lp) bf.hold('jump', LEAP_FROM, 0);
        else bf.play('idle', { fade: 0 });
        this._landed = false;
        const landY = this.arena.fighterY(BOSS_LAND.x, BOSS_LAND.z);
        const fall = Math.sqrt((2 * (a.gateTop.y - landY)) / LEAP_G);
        const takeoff = C_AT + (lp ? lp.off - LEAP_FROM : 0.3);
        this._leapAt = { takeoff, fall, land: takeoff + fall, landY };
      }
      const L = this._leapAt;
      // in the air: carried forward evenly, falling from a standstill (y = top - g t²/2)
      const air = Math.min(1, Math.max(0, (t - L.takeoff) / L.fall));
      b.root.position.lerpVectors(a.gateTop, BOSS_LAND, air);
      b.root.position.y = a.gateTop.y + (L.landY - a.gateTop.y) * air * air;
      if (lp) {
        // the clip's own crouch and spring play at their speed; its time in the air is stretched over the fall
        const s = t - C_AT;
        const pre = lp.off - LEAP_FROM;
        const clipT = s < pre ? LEAP_FROM + s
          : s < pre + L.fall ? lp.off + ((s - pre) / L.fall) * (lp.on - lp.off)
          : lp.on + (s - pre - L.fall);
        const act = bf.actions.jump;
        act.time = Math.min(clipT, act.getClip().duration);
        if (clipT > act.getClip().duration - 0.4 && bf.current === act) bf.play('idle', { fade: 0.4 }); // up out of the crouch: into his stance
      } else if (t >= L.takeoff && !this._jumped) {
        this._jumped = true;
        bf.playOnce('jump', { speed: 1.3 });
        this.sound?.play('whoosh', { volume: 0.3 });
      }
      if (air >= 1 && !this._landed) {
        this._landed = true;
        if (!lp) bf.play('idle', { fade: 0.2 }); // the real leap rises out of its own landing
        this._addShake(0.75);
        this.arena.burst(BOSS_LAND.x, BOSS_LAND.z);
        this.waves.spawn(BOSS_LAND.x, L.landY, BOSS_LAND.z, { size: 5.5, life: 0.6, color: 0xffe2b0 });
        this.sound?.play('impact', { volume: 0.9 });
        this.sound?.duck(0.4, 0.8);
        this.story.showCard('THE MARSHAL', 'The company\u2019s man. He has not slowed down since the stone.');
        this._pulley.visible = false; // left hanging at the top of the line
      }
      // Kai hears him land and turns round
      if (t > L.land - 0.25) {
        const want = Math.atan2(BOSS_LAND.x - kp.x, BOSS_LAND.z - kp.z);
        k.heading += shortestAngle(k.heading, want) * (1 - Math.exp(-6 * dt));
        kf.setGuard(t > L.land + 0.15, 0.8);
      }
      // the camera, already behind Kai's stop point, re-aims at the gate and follows him down
      this.cine.pos.set(2.6, 2.1, 7.4);
      this.cine.look.set(-1.4, 1.6 + (1 - air * air) * 3.5, -6.5);
      this.cine.fov = 55;
      this.cine.rate = 2.6;
      bf.update(dt);
      // lowered after the pose is applied: the clip's ledge, faded out as it hands over to idle
      if (lp) bf.visual.position.y = -lp.lower(bf.actions.jump.time) * bf.actions.jump.getEffectiveWeight();
      if (t > L.land + TALK_AFTER) this._startTalk();
    }
    k.root.rotation.y = k.heading;
    kf.update(dt);
  }

  /** Shot D: the two of them face to face, a few lines each, typed out on screen as they're said. */
  _startTalk() {
    this._shot = 'D';
    this.story.hideCard();
    const b = this.boss;
    b.fighter.visual.position.y = 0; // well off the leap clip by now
    b.root.position.copy(BOSS_LAND);
    b.root.position.y = this._leapAt.landY;
    this._converse(TALK, () => this._startFight());
  }

  /** Start a conversation (TALK before the fight, REVEAL_TALK when the mask comes off); `done` runs after its last line. */
  _converse(lines, done) {
    this.story.setSkipLabel('SPACE: NEXT LINE \u00b7 CLICK HERE: SKIP');
    this._talk = lines;
    this._talkDone = done;
    this._line = -1;
    this._nextLine();
  }

  /** On to the next line (the player pressing on while one is still typing just finishes it); after the last, `done`. */
  _nextLine(player = false) {
    if (!this._talk) return;
    if (player && !this.story.lineDone) {
      this.story.finishLine();
      return;
    }
    this._line++;
    const line = this._talk[this._line];
    if (!line) {
      const done = this._talkDone;
      this._talk = this._talkDone = null;
      this.story.hideLine();
      if (done) done();
      return;
    }
    this._lineT = 0;
    this._lineHold = 0;
    const who = WHO[line.who];
    this.story.showLine(who.name, line.text, who.color);
    const bf = this.boss.fighter;
    if (line.pose && bf.actions[line.pose]) bf.playOnce(line.pose, { fade: 0.25 });
    const prev = this._talk[this._line - 1];
    if (this.mode === 'INTRO') this._talkShot(line.who, !prev || prev.who !== line.who);
    else this._cutNext = !prev || prev.who !== line.who; // the reveal cuts between them too
  }

  /** A shout mid-fight (BARKS[key]), once per attempt: typed over the action, nothing stops for it. */
  _barkOnce(key) {
    if ((this._barked ||= new Set()).has(key) || this._talk) return;
    this._barked.add(key);
    (this._barks ||= []).push(...BARKS[key]);
  }

  _tickBark(dt) {
    if (this._talk || this.mode !== 'FIGHT') {
      if (this._bark) { this._bark = null; this.story.hideLine(); }
      return;
    }
    if (!this._bark && this._barks?.length) {
      this._bark = this._barks.shift();
      this._barkT = 1.6 + this._bark.text.length * 0.045;
      const who = WHO[this._bark.who];
      this.story.showLine(who.name, this._bark.text, who.color, 60);
    }
    if (!this._bark) return;
    this.story.updateLine(dt);
    if ((this._barkT -= dt) <= 0) {
      this._bark = null;
      if (!this._barks.length) this.story.hideLine();
    }
  }

  /** Type the current line out; once it has been up long enough to read, move on. */
  _tickLine(dt) {
    const line = this._talk?.[this._line];
    if (!line) return;
    this._lineT += dt;
    if (this.story.updateLine(dt)) {
      this._lineHold += dt;
      if (this._lineHold > 0.9 + line.text.length * 0.028) this._nextLine();
    }
  }

  _updateTalk(dt) {
    const line = this._talk?.[this._line];
    const k = this.combat;
    const kp = k.root.position;
    const bp = this.boss.root.position;
    const bf = this.boss.fighter;
    k.heading += shortestAngle(k.heading, Math.atan2(bp.x - kp.x, bp.z - kp.z)) * (1 - Math.exp(-6 * dt));
    const b = this.boss;
    b.heading += shortestAngle(b.heading, Math.atan2(kp.x - bp.x, kp.z - bp.z)) * (1 - Math.exp(-6 * dt));
    b.root.rotation.y = b.heading;
    if (bf.currentName !== 'idle' && !bf.current?.isRunning()) bf.play('idle', { fade: 0.35 }); // the point done: back in his stance
    // his mask's eyes smoulder brighter while he talks
    b._glowMask(0xff5a1a, line?.who === 'handler' ? 1.3 : 0.6);
    bf.update(dt);
    if (!line) return;
    // the shot creeps in over the line
    this.cine.fov = 14 - Math.min(1, this._lineT / 4) * 1.6;
    this._tickLine(dt);
  }

  /**
   * Over the listener's shoulder onto whoever's talking, on a long lens (they
   * stand ~11 m apart). Both set-ups sit on the same side of the line between
   * them, so they stay screen left and right as it cuts back and forth.
   */
  _talkShot(who, cut) {
    const kp = this.combat.root.position;
    const bp = this.boss.root.position;
    const d = new THREE.Vector3(bp.x - kp.x, 0, bp.z - kp.z).normalize(); // Kai -> Handler
    const right = new THREE.Vector3(-d.z, 0, d.x);
    const [near, far, back] = who === 'handler' ? [kp, bp, -1.8] : [bp, kp, 1.8];
    const pos = near.clone().addScaledVector(d, back).addScaledVector(right, 0.8);
    pos.y = near.y + 1.78;
    this._setCine(pos, new THREE.Vector3(far.x, far.y + 1.52, far.z), { fov: 14, rate: 6, cut });
  }

  /** Put Kai at fraction s along a polyline, facing along it. */
  _alongPath(pts, s) {
    let total = 0;
    const lens = [];
    for (let i = 1; i < pts.length; i++) {
      lens.push(pts[i].distanceTo(pts[i - 1]));
      total += lens[i - 1];
    }
    let d = s * total;
    const k = this.combat;
    for (let i = 1; i < pts.length; i++) {
      if (d <= lens[i - 1] || i === pts.length - 1) {
        const f = Math.min(1, d / lens[i - 1]);
        k.root.position.lerpVectors(pts[i - 1], pts[i], f);
        const want = Math.atan2(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
        k.heading += shortestAngle(k.heading, want) * 0.2;
        return;
      }
      d -= lens[i - 1];
    }
  }

  /** Hand control over: everyone on their marks, HUD in, boss off the leash after a beat. */
  _startFight() {
    introSeen = true;
    this._enterBeat('FIGHT');
    this.sound?.setVariant('battle');
    this._muteInput = true;
    this.cine = null;
    this.story.setCinematic(false);
    this.story.hideCard();
    this.story.hideLine();
    this.story.setSkipLabel();
    this._talk = this._talkDone = null;
    this.hud.setVisible(true);
    this.touch.setVisible(true);
    this.hud.setBossName(WHO.handler.name); // nobody knows who he is yet

    const k = this.combat;
    const b = this.boss;
    k.fighter.feet?.stop(true); // a skipped intro can catch him stepping out of the pool
    k.root.position.copy(KAI_START);
    k.fighter.setGuard(false);
    b.root.visible = true;
    b.root.position.copy(BOSS_LAND);
    b.fighter.visual.position.y = 0; // off the leap clip's ledge (a skipped intro can catch him mid-leap)
    if (b.fighter.currentName === 'jump') b.fighter.play('idle', { fade: 0 });
    k.heading = Math.atan2(BOSS_LAND.x - KAI_START.x, BOSS_LAND.z - KAI_START.z);
    k.root.rotation.y = k.heading;
    b.heading = k.heading + Math.PI;
    b.root.rotation.y = b.heading;
    b.restFor = VS_TIME + 0.5; // he waits out the splash
    this.camYaw = k.heading;
    this.hud.versus(WHO.kai.name, WHO.handler.name);
    this._fightCall = VS_TIME;
    this.sound?.play('handoff', { volume: 0.6 });
    this.letters.spawn('l3-1', LETTER_SPOTS['l3-1']);
    // notes for the player, once FIGHT has been called
    this._fightToasts = [];
    const left = this.gifts.remaining;
    if (left > 0) this._fightToasts.push(['SHRINES', `${left} gift${left > 1 ? 's glow' : ' glows'} in the jungle \u00b7 each can be taken once`, 5]);
    if (this._eased < 1) {
      const pct = Math.round((1 - this._eased) * 100);
      this._fightToasts.push(['WEAKENED', `he still feels the last fight \u00b7 ${pct}% less health this time`, 4.5]);
    }
  }

  /**
   * Phase II: the helmet comes off. A slow-mo look at his face over Kai's
   * shoulder, then Kai knows him: the man from the fire. They have it out,
   * line by line (REVEAL_TALK; the short REVEAL_AGAIN on a retry), the camera
   * cutting to whoever is talking, and the fight picks up where it was.
   */
  _startReveal() {
    this._enterBeat('REVEAL');
    this._cutNext = true;
    this._revealTalked = false;
    this._talk = this._talkDone = null;
    this.story.setCinematic(true, true);
    this.story.setSkipLabel('SPACE: NEXT LINE \u00b7 CLICK HERE: SKIP');
    this.hud.setVisible(false);
    this.touch.setVisible(false);
    // he drops a letter as the helmet goes
    const bp = this.boss.root.position;
    const kp = this.combat.root.position;
    const side = new THREE.Vector3(kp.z - bp.z, 0, bp.x - kp.x).normalize().multiplyScalar(1.8);
    const at = bp.clone().add(side);
    const r = Math.hypot(at.x, at.z);
    if (r > 11.5) at.multiplyScalar(11.5 / r);
    this.letters.spawn('l3-2', at, { from: new THREE.Vector3(bp.x, 1.3, bp.z) });
  }

  _updateReveal(real) {
    const k = this.combat;
    const kp = k.root.position;
    const bp = this.boss.root.position;
    // the reaction first (slowed), then the words: from here on the bar has his name on it
    if (!this._revealTalked && this.beatT > 1.1) {
      this._revealTalked = true;
      this.hud.setBossName(WHO.zwane.name);
      this._converse(revealSeen ? REVEAL_AGAIN : REVEAL_TALK, () => this._endReveal());
      revealSeen = true;
    }
    // he stands and has it out with Kai instead of swinging; Kai faces him
    this.boss.restFor = Math.max(this.boss.restFor, 0.5);
    k.heading += shortestAngle(k.heading, Math.atan2(bp.x - kp.x, bp.z - kp.z)) * (1 - Math.exp(-6 * real));
    this._tickLine(real);
    // over Kai's shoulder onto Baba Zwane's face; over his shoulder onto Kai's when Kai speaks
    const kaiTalking = this._talk?.[this._line]?.who === 'kai';
    const [near, far] = kaiTalking ? [bp, kp] : [kp, bp];
    const d = this._tmp.set(near.x - far.x, 0, near.z - far.z).normalize();
    const right = new THREE.Vector3(d.z, 0, -d.x);
    const pos = near.clone().addScaledVector(d, 1.5).addScaledVector(right, 0.8).setY(near.y + 1.75);
    const look = new THREE.Vector3(far.x, far.y + 1.62, far.z);
    this._setCine(pos, look, { fov: 30, rate: 8, cut: this._cutNext });
    this._cutNext = false;
  }

  /** The conversation is over (or clicked past): back to the fight. */
  _endReveal() {
    if (this.mode !== 'REVEAL') return;
    this._talk = this._talkDone = null;
    this.story.hideLine();
    this.story.setSkipLabel();
    if (!this._revealTalked) this.hud.setBossName(WHO.zwane.name);
    this._revealTalked = true;
    this._enterBeat('FIGHT');
    this.cine = null;
    this.story.setCinematic(false);
    this.hud.setVisible(true);
    this.touch.setVisible(true);
    this.boss.restFor = Math.max(this.boss.restFor, 0.6);
  }

  /**
   * Phase IV. He lunges, tears the horn off Kai's hip and has it in his fist
   * before Kai knows it's gone; Kai is thrown back, and they have it out
   * (SNATCH_TALK), the camera low beside the two of them. From here he fights
   * with it, and the forest comes for him for it (_updateHornPhase).
   */
  _startSnatch() {
    this._enterBeat('SNATCH');
    this._snatch = { taken: false, talked: false, cut: false };
    this._talk = this._talkDone = null;
    this.story.setCinematic(true, true);
    this.story.setSkipLabel('SPACE: NEXT LINE · CLICK HERE: SKIP');
    this.hud.setVisible(false);
    this.hud.setTell('');
    this.touch.setVisible(false);
    if (this.boss.fighter.actions.lunge) this.boss.fighter.playOnce('lunge', { speed: 1.3, fade: 0.08 });
    this.sound?.play('whoosh', { volume: 0.6 });
  }

  _updateSnatch(dt, real) {
    const S = this._snatch;
    const k = this.combat;
    const kp = k.root.position;
    const bp = this.boss.root.position;
    const d = this._tmp.set(kp.x - bp.x, 0, kp.z - bp.z);
    const dist = d.length() || 1;
    d.divideScalar(dist);
    this.boss.restFor = Math.max(this.boss.restFor, 0.6);
    if (!S.taken) {
      // he closes on Kai...
      if (dist > 0.95) bp.addScaledVector(d, Math.min(dist - 0.95, 9 * real));
      this.boss.heading = Math.atan2(d.x, d.z);
      this.boss.root.rotation.y = this.boss.heading;
      if (this.beatT > 0.35) {
        // ...and it's in his fist
        S.taken = true;
        const horn = this.keyItem;
        const palm = this.boss.fighter.bone('PalmR');
        if (horn && palm) palm.attach(horn);
        if (horn?.userData.strap) horn.userData.strap.visible = false; // torn off its strap
        this._hornHeld = this._hornTaken = true;
        S.push = d.clone();
        k.fighter.flinch();
        this._hitStop(0.1);
        this._addShake(0.55);
        this.sound?.play('hurt', { volume: 0.7 });
        this.sound?.play('guardianRoar', { volume: 0.6, rate: 0.8 });
        this.sound?.duck(0.6, 1.4);
        this.storm.strikeAt(bp.x + d.z * 9, bp.z - d.x * 9, this.game.camera); // the sky answers at once
      }
    } else if (this.beatT < 0.9) {
      kp.addScaledVector(S.push, 3.2 * real); // thrown back from him
    }
    // Kai faces him
    k.heading += shortestAngle(k.heading, Math.atan2(bp.x - kp.x, bp.z - kp.z)) * (1 - Math.exp(-6 * real));
    if (!S.talked && this.beatT > 1.3) {
      S.talked = true;
      this._converse(SNATCH_TALK, () => this._endSnatch());
    }
    this._tickLine(real);
    // low and side-on to the two of them, him with the horn nearer the camera
    const mid = kp.clone().lerp(bp, 0.6);
    const side = new THREE.Vector3(-d.z, 0, d.x);
    const pos = mid.clone().addScaledVector(side, 3.6).addScaledVector(d, -1.2).setY(mid.y + 1.25);
    this._setCine(pos, new THREE.Vector3(mid.x, mid.y + 1.3, mid.z), { fov: 40, rate: 6, cut: !S.cut });
    S.cut = true;
  }

  /** The conversation is over (or clicked past): back to the fight, phase IV. */
  _endSnatch() {
    if (this.mode !== 'SNATCH') return;
    if (!this._snatch.taken) {
      const palm = this.boss.fighter.bone('PalmR');
      if (this.keyItem && palm) palm.attach(this.keyItem);
      if (this.keyItem?.userData.strap) this.keyItem.userData.strap.visible = false;
      this._hornHeld = this._hornTaken = true;
    }
    this._talk = this._talkDone = null;
    this.story.hideLine();
    this.story.setSkipLabel();
    this._enterBeat('FIGHT');
    this.cine = null;
    this.story.setCinematic(false);
    this.hud.setVisible(true);
    this.touch.setVisible(true);
    this.boss.restFor = Math.max(this.boss.restFor, 0.6);
    this._forestT = 4.5; // the first bolt comes quickly, so the player learns what it means
    this._forestWarned = false;
    this.hud.popup('PHASE 4 — THE HORN', '#4fd6e0');
    this.hud.toast('THE HORN', 'He has it, and the forest will make him pay: when the lightning hits him, he’s yours.', 5.5);
  }

  /**
   * Phase IV, every frame: the horn in his fist, burning brighter as he winds
   * up a blast and going off in a ring when it lands; Kai's own slow-mo gone
   * with it (it was the horn's); and the forest's lightning. A glow under
   * him first, then the bolt: he reels (FOREST_STAGGER s, open to everything
   * Kai has), and anyone standing too close to him is caught by it too.
   */
  _updateHornPhase(dt, real, state) {
    const b = this.boss;
    const horn = this.keyItem;
    const palm = b.fighter.bone('PalmR');
    const bp = b.root.position;
    const cp = this.combat.root.position;
    if (horn && palm && horn.parent === palm) poseHorn(horn, palm, HORN_HAND, 1 - Math.exp(-10 * dt));
    if (horn) {
      const winding = b.attackName === 'blast' && b.state === 'TELEGRAPH';
      const flare = winding ? 0.6 + 1.6 * Math.min(1, b.t / 0.55) : 0.35 + Math.sin(this.time * 6) * 0.15;
      horn.userData.material.emissiveIntensity = flare;
      horn.userData.glow.material.opacity = Math.min(1, 0.3 + 0.45 * flare);
      horn.userData.glow.scale.setScalar(0.3 + 0.35 * flare);
    }
    this.combat.abilityCD = Math.max(this.combat.abilityCD, 0.5); // the slow-mo was the horn's: not while he has it
    // the blast going off: a ring of the horn's light all round him
    if (b.attackName === 'blast' && b.state === 'STRIKE' && !this._blastOut) {
      this._blastOut = true;
      this.waves.spawn(bp.x, bp.y + 0.2, bp.z, { size: 5.4, life: 0.55, color: 0x4fd6e0 });
      this.arena.burst(bp.x, bp.z, { color: 0x9ff3ff, count: 26, speed: 6, size: 0.14, y: bp.y + 0.4, lift: 1.5, additive: true });
      this._addShake(0.35);
      this.sound?.play('guardianRoar', { volume: 0.55, rate: 1.3 });
    }
    if (b.state !== 'STRIKE') this._blastOut = false;
    if (this.mode !== 'FIGHT' || this._ended || b.state === 'DOWN' || b.state === 'TRANSITION') return;
    this._forestT -= real;
    if (this._forestT <= FOREST_WARN && !this._forestWarned) {
      this._forestWarned = true;
      this.waves.spawn(bp.x, bp.y + 0.05, bp.z, { size: FOREST_SPLASH, life: FOREST_WARN, color: 0xdfe8ff });
    }
    if (this._forestT <= 0) {
      this._forestT = FOREST_EVERY[0] + Math.random() * (FOREST_EVERY[1] - FOREST_EVERY[0]);
      this._forestWarned = false;
      this.storm.strikeAt(bp.x, bp.z, this.game.camera);
      this.arena.burst(bp.x, bp.z, { color: 0xdfe8ff, count: 34, speed: 4.5, size: 0.16, y: bp.y + 0.3, lift: 3, additive: true });
      this._addShake(0.55);
      this._hitStop(0.08);
      this.sound?.play('impact', { volume: 0.9, rate: 0.7 });
      b.stagger(FOREST_STAGGER);
      b.fighter.flash(0xdfe8ff, 0.3);
      this.hud.popup('THE FOREST STRIKES', '#dfe8ff');
      this._barkOnce('forest');
      if (Math.hypot(cp.x - bp.x, cp.z - bp.z) < FOREST_SPLASH && !this.combat.dodging) {
        state.damage(FOREST_SPLASH_DAMAGE);
        this.combat.onHurt();
        this.hud.damageFlash();
        this._checkPlayerDeath(state);
      }
    }
  }

  /** He's down: the horn drops out of his hand, glowing, and lies where it lands. */
  _dropHorn() {
    this._hornHeld = false;
    const horn = this.keyItem;
    if (!horn) return;
    this.root.attach(horn);
    this._hornDrop = {
      vel: new THREE.Vector3((Math.random() - 0.5) * 2, 3.2, (Math.random() - 0.5) * 2),
      spin: new THREE.Vector3(5, 3, 4),
    };
  }

  _updateHornDrop(dt) {
    const H = this._hornDrop;
    const horn = this.keyItem;
    H.vel.y -= 14 * dt;
    horn.position.addScaledVector(H.vel, dt);
    horn.rotation.x += H.spin.x * dt;
    horn.rotation.y += H.spin.y * dt;
    horn.rotation.z += H.spin.z * dt;
    const floor = this.arena.surfaceY(horn.position.x, horn.position.z) + 0.08;
    if (horn.position.y < floor) {
      horn.position.y = floor;
      if (H.vel.y < -1.5) {
        H.vel.y *= -0.3;
        H.vel.x *= 0.5;
        H.vel.z *= 0.5;
        H.spin.multiplyScalar(0.4);
      } else {
        // at rest, on its side
        horn.rotation.set(0, horn.rotation.y, 0.25);
        this._hornDrop = null;
      }
    }
  }

  /**
   * The blow that drops him: a white flash, the bars come in and time all but
   * stops, then eases back up while the camera, low and side-on to the two of
   * them, drifts round. The epilogue's slow circle takes over from there.
   */
  _startFinal() {
    this._enterBeat('FINAL');
    this._focusT = 0;
    this.story.setCinematic(true, false);
    this.story.flash();
    this.hud.setVisible(false);
    this.hud.setTell('');
    this.touch.setVisible(false);
    const kp = this.combat.root.position;
    const bp = this.boss.root.position;
    const d = new THREE.Vector3(bp.x - kp.x, 0, bp.z - kp.z).normalize();
    const side = new THREE.Vector3(-d.z, 0, d.x);
    // from whichever side the camera was already on, so the cut doesn't flip them round
    const mid = kp.clone().lerp(bp, 0.55);
    const cam = this.game.camera.position;
    if ((cam.x - mid.x) * side.x + (cam.z - mid.z) * side.z < 0) side.negate();
    const sep = Math.hypot(bp.x - kp.x, bp.z - kp.z);
    this._final = { mid, d, side, dist: Math.max(3.4, sep * 0.9 + 2.2) };
    this._updateFinal(true);
  }

  _updateFinal(cut = false) {
    const { mid, d, side, dist } = this._final;
    const a = -0.35 + this.beatT * 0.22; // a slow arc round them
    const out = side.clone().multiplyScalar(Math.cos(a)).addScaledVector(d, Math.sin(a));
    const pos = mid.clone().addScaledVector(out, dist);
    pos.y = mid.y + 1.05;
    this._setCine(pos, new THREE.Vector3(mid.x, mid.y + 0.95, mid.z), { fov: 36, rate: 9, cut });
  }

  _startEpilogue() {
    this._enterBeat('EPILOGUE');
    this.flies.centre(this.boss.root.position.x, this.boss.root.position.z);
    this.sound?.setVariant('intro');
    this.story.setCinematic(true, true);
    this.story.hideLetter();
    this.hud.setVisible(false);
    this.touch.setVisible(false);
    if (this.camMode === 'orbit') {
      this.camMode = 'follow';
      this._applyCamMode(true);
    }
    this.input.ignored.delete('mouse0'); // a click skips the epilogue
  }

  /** The Handler is down: the camera circles him, no words, then VICTORY (it keeps circling behind the card). */
  _updateEpilogue(dt) {
    const k = this.combat;
    const bp = this.boss.root.position;
    this.boss.update(dt);
    if (this._shot !== 'E0') {
      this._shot = 'E0';
      this._orbitFrom = this.time;
      // start across him from Kai: the Handler down in front, Kai standing over him beyond
      const kp = k.root.position;
      this._orbitA0 = Math.atan2(kp.z - bp.z, kp.x - bp.x) + Math.PI + 0.55;
      k.fighter.play('idle', { fade: 0.3 });
      k.fighter.setGuard(false);
      const a0 = this._orbitA0;
      this._setCine(new THREE.Vector3(bp.x + Math.cos(a0) * 3.8, bp.y + 1.4, bp.z + Math.sin(a0) * 3.8), new THREE.Vector3(bp.x, bp.y + 0.4, bp.z), { fov: 45, cut: true });
    }
    // the horn at his lips, blazing
    if (this._blowing) {
      const B = this._blowing;
      B.t += dt;
      poseHorn(B.horn, B.palm, HORN_BLOW, 1 - Math.exp(-6 * dt));
      const flare = Math.min(1, B.t / 0.4) * Math.max(0, 1 - Math.max(0, B.t - 2.6) / 1.2);
      B.horn.userData.material.emissiveIntensity = 0.05 + 1.6 * flare;
      B.horn.userData.glow.material.opacity = 0.35 + 0.6 * flare;
      B.horn.userData.glow.scale.setScalar(0.3 + 0.9 * flare);
    }
    const s = this.time - this._orbitFrom;
    const a = this._orbitA0 + s * 0.18;
    this.cine.pos.set(bp.x + Math.cos(a) * 3.8, bp.y + 1.4 + Math.min(s, 6) * 0.12, bp.z + Math.sin(a) * 3.8);
    this.cine.rate = 3;
    // if he had the horn, it's lying where it fell: Kai goes and takes it back first
    const waiting = this._hornTaken && !this._pickedUp;
    if (waiting && this.beatT > 1.2) this._updatePickup(dt);
    // a breath over him, then last words; then Kai blows the horn, the forest answers, and the card
    if (this.mode === 'EPILOGUE' && !this._epiTalked && !waiting && this.beatT > 2.2) {
      this._epiTalked = true;
      this._converse(this._hornTaken ? [...EPILOGUE_TAKEN, ...EPILOGUE_TALK] : EPILOGUE_TALK, () => this._blowHorn());
    }
    this._tickLine(dt);
    if (this.mode === 'EPILOGUE' && this._endAt && this.beatT > this._endAt) this._showEnd();
    k.fighter.update(dt);
  }

  /**
   * Kai takes the horn back. He walks over to where it fell and holds out his
   * hand, and it lifts off the ground and comes to him, glowing, the way it
   * came up off the stone into his hand at the start: it was always his to
   * carry home.
   */
  _updatePickup(dt) {
    const k = this.combat;
    const kf = k.fighter;
    const horn = this.keyItem;
    const palm = kf.bone('PalmR');
    if (!horn || !palm || this._hornDrop) return; // still falling
    const P = this._pickup || (this._pickup = { phase: 'walk', t: 0, from: new THREE.Vector3(), to: new THREE.Vector3() });
    P.t += dt;
    const kp = k.root.position;
    const hp = horn.getWorldPosition(P.to);
    const dx = hp.x - kp.x, dz = hp.z - kp.z;
    const dist = Math.hypot(dx, dz);
    if (P.phase !== 'hold') {
      k.heading += shortestAngle(k.heading, Math.atan2(dx, dz)) * (1 - Math.exp(-8 * dt));
      k.root.rotation.y = k.heading;
    }
    if (P.phase === 'walk') {
      if (dist > 1.05) {
        kf.play('walk', { fade: 0.25 });
        kp.x += (dx / dist) * 1.5 * dt;
        kp.z += (dz / dist) * 1.5 * dt;
        kp.y = this.arena.fighterY(kp.x, kp.z);
      } else {
        P.phase = 'call';
        P.t = 0;
        P.from.copy(hp);
        P.spin = horn.rotation.clone();
        if (!kf.actions.reach) kf.pose('reach', 'cross', 1.133); // his right arm out at full stretch, as at the stone
        kf.play('reach', { fade: 0.4 });
        this.sound?.play('whoosh', { volume: 0.45, rate: 0.7 });
      }
    } else if (P.phase === 'call') {
      const u = smooth(0.35, 1.6, P.t);
      palm.getWorldPosition(P.to);
      horn.position.lerpVectors(P.from, P.to, u);
      horn.position.y += Math.sin(u * Math.PI) * 0.45;
      horn.rotation.set(P.spin.x * (1 - u), P.spin.y + u * Math.PI * 2, P.spin.z * (1 - u));
      this.root.worldToLocal(horn.position);
      const glow = Math.sin(Math.min(1, P.t / 1.6) * Math.PI);
      horn.userData.material.emissiveIntensity = 0.5 + 1.4 * glow;
      horn.userData.glow.material.opacity = 0.6 + 0.4 * glow;
      if (P.t >= 1.6) {
        palm.attach(horn);
        P.phase = 'hold';
        P.t = 0;
        kf.play('idle', { fade: 0.6 });
        this.sound?.play('parry', { volume: 0.4, rate: 0.6 });
      }
    } else {
      poseHorn(horn, palm, HORN_HAND, 1 - Math.exp(-10 * dt));
      if (P.t > 0.7) this._pickedUp = true;
    }
  }

  /**
   * The last thing he does in the game: lifts the horn from his hip and
   * blows it. A long low call over the falls, the horn blazing with its
   * light, and the birds come back.
   */
  _blowHorn() {
    this._endAt = this.beatT + 3.6;
    const horn = this.keyItem;
    const kf = this.combat.fighter;
    const palm = kf.bone('PalmR');
    if (horn && palm) {
      palm.attach(horn);
      this._blowing = { horn, palm, t: 0 };
    }
    if (kf.actions.block) kf.hold('block', 0.9, 0.35); // hands up to his face
    this._hornCall();
  }

  /** The call itself: a low brass note that swells and falls away, with its octaves (Web Audio, nothing to load). */
  _hornCall() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const t0 = ctx.currentTime + 0.05;
      const out = ctx.createGain();
      out.gain.setValueAtTime(0, t0);
      out.gain.linearRampToValueAtTime(0.32, t0 + 0.35);
      out.gain.setValueAtTime(0.32, t0 + 2.0);
      out.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.4);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.9;
      lp.frequency.setValueAtTime(380, t0);
      lp.frequency.linearRampToValueAtTime(1300, t0 + 0.5);
      lp.frequency.linearRampToValueAtTime(700, t0 + 3.2);
      lp.connect(out).connect(ctx.destination);
      for (const [f, g] of [[98, 0.55], [196, 0.28], [294, 0.12], [392, 0.05]]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * 0.93, t0);
        o.frequency.linearRampToValueAtTime(f, t0 + 0.3);
        const gg = ctx.createGain();
        gg.gain.value = g;
        o.connect(gg).connect(lp);
        o.start(t0);
        o.stop(t0 + 3.5);
      }
      setTimeout(() => ctx.close(), 4000);
    } catch {
      // no audio: the light still tells it
    }
  }

  _showEnd() {
    this._enterBeat('END');
    this._shot = 'E0'; // keep the same slow circle going behind the card
    this.story.setCinematic(false);
    this.story.showEnd({
      title: 'VICTORY',
      sub: 'Baba Zwane is down. The horn goes back on the stone, and the forest wakes.',
      credits: CREDITS,
      action: { label: 'PLAY AGAIN', key: 'R', onClick: () => this.game.restart() },
    });
  }

  /* ---------------------------------------------------------------- camera */

  _updateCamera(dt) {
    const cam = this.game.camera;
    cam.position.sub(this._shakeOff);

    if (this.cine) {
      const c = this.cine;
      const k = 1 - Math.exp(-c.rate * dt);
      cam.position.lerp(c.pos, k);
      this._camLook.lerp(c.look, k);
      if (Math.abs(cam.fov - c.fov) > 0.01) {
        cam.fov += (c.fov - cam.fov) * (1 - Math.exp(-6 * dt));
        cam.updateProjectionMatrix();
      }
    } else {
      const cp = this.combat.root.position;
      const bp = this.boss.root.position;
      let dist, height, fx, fz, fy;
      if (this.camMode === 'follow') {
        // over Kai's back, looking a couple of metres ahead of him: his left is the screen's left
        dist = 7.4; height = 2.8;
        fx = cp.x + Math.sin(this.camYaw) * 2.2;
        fz = cp.z + Math.cos(this.camYaw) * 2.2;
        fy = cp.y;
      } else {
        let bias;
        if (this.lockOn) {
          dist = 6.4; height = 3.5; bias = 0.32;
        } else {
          dist = this.orbitDist * Math.cos(this.orbitPitch);
          height = this.orbitDist * Math.sin(this.orbitPitch) + 1;
          bias = 0.5; // orbit around the midpoint so both fighters stay in frame
        }
        // lead toward the Handler, but never so far that the camera ends up in front of Kai
        const sep = Math.hypot(bp.x - cp.x, bp.z - cp.z);
        const lead = this.lockOn ? Math.min(sep * bias, 3) : sep * bias;
        const k = sep > 0.001 ? lead / sep : 0;
        fx = cp.x + (bp.x - cp.x) * k;
        fz = cp.z + (bp.z - cp.z) * k;
        fy = (cp.y + bp.y) / 2;
      }
      // slowed with the game during hit-stop, so impacts freeze the camera too
      const gameDt = dt * Math.max(this.state.timeScale, 0.05);
      this._tmp.set(fx - Math.sin(this.camYaw) * dist, height + fy, fz - Math.cos(this.camYaw) * dist);
      this.arena.pullCamera(cp, this._tmp); // a trunk right behind Kai: come in front of it rather than hide it
      cam.position.lerp(this._tmp, 1 - Math.exp(-15 * gameDt));
      this._tmp.set(fx, 1.4 + fy, fz);
      this._camLook.lerp(this._tmp, 1 - Math.exp(-10 * gameDt));
      if (Math.abs(cam.fov - FIGHT_FOV) > 0.01) {
        cam.fov += (FIGHT_FOV - cam.fov) * (1 - Math.exp(-6 * dt));
        cam.updateProjectionMatrix();
      }
    }
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

  /** Game's draw call: straight to the screen, or through KeyVision while time is bent. */
  render(renderer, scene, camera) {
    if (this.vision?.active) this.vision.render(renderer, scene, camera, this.time);
    else renderer.render(scene, camera);
  }

  teardown() {
    if (this.vision) this.vision.dispose();
    if (this.sound) { this.sound.dispose(); this.sound = null; }
    if (this.touch) this.touch.dispose();
    if (this.input) this.input.ignored.delete('mouse0');
    // skinned meshes own a bone texture that disposeObject() does not free
    this.root.traverse((o) => {
      if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose();
    });
    if (this.hud) this.hud.dispose();
    if (this.story) this.story.dispose();
    if (this.letters) this.letters.dispose();
    if (this.gifts) this.gifts.dispose();
    if (this.state && this._baseMaxHealth) {
      // Vitality is re-applied from state.awards on the next init; other levels see the normal max
      this.state.maxHealth = this._baseMaxHealth;
      this.state.health = Math.min(this.state.health, this.state.maxHealth);
    }
    if (this.arena) this.arena.dispose();
    if (this.state) this.state.timeScale = 1;
    if (this.game) {
      this.game.camera.fov = FIGHT_FOV;
      this.game.camera.updateProjectionMatrix();
    }
    super.teardown();
  }
}
