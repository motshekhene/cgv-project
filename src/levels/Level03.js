import * as THREE from 'three';
import { Level } from '../core/Level.js';
import { CombatController } from './level3/CombatController.js';
import { HandlerBoss } from './level3/HandlerBoss.js';
import { ShrineArena, WALK_R } from './level3/ShrineArena.js';
import { Nav } from './level3/Nav.js';
import { Telegraphs } from './level3/Telegraphs.js';
import { EnforcerSquad } from './level3/Enforcers.js';
import { ShadowStag } from './level3/ShadowStag.js';
import { BodyIK, HIP_UP } from './level3/BodyIK.js';
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
import { showLoseCard } from '../ui/EndCard.js';
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
 *             three spirit shrines wait (Awards.js), with the Handler after
 *             him: the Stag heals and wakes again, the Fox and the Ember give
 *             their gift for the fight. All three are back on every attempt.
 *             From the second loss on, each makes the next attempt's Marshal weaker.
 *   SNATCH    at a quarter of his health Baba Zwane tears the horn off Kai's
 *             hip and lifts it himself, the thing he told Kai he never dared
 *             do (SNATCH_TALK). Phase IV: THE HORN. He fights with it (the
 *             horn blast) and the forest comes for him for it: every few
 *             seconds a bolt comes down on him and leaves him reeling, which
 *             is Kai's opening. When he falls the horn falls with him, and
 *             Kai goes and takes it back before anything else.
 *             The fight comes in three acts. I: the Marshal didn't come
 *             alone; his men go in first while he watches from the arch
 *             (level3/Enforcers.js). II: him. III: below.
 *   FINAL     the killing blow in slow motion, the camera arcing round them.
 *   RISE      the horn, tainted by his hand, isn't finished: the stone stag at
 *             the gate cracks open and comes down off its plinth, and Kai has
 *             to beat it (act III, level3/ShadowStag.js) before the horn is
 *             clean again and the epilogue can begin.
 *   EPILOGUE  the storm passes and fireflies come out while the camera circles
 *             the fallen Baba Zwane, then the VICTORY card; CONTINUE goes on to
 *             the game's epilogue (levels/Epilogue.js), the horn back on its stone.
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
  { who: 'kai', text: 'I was bringing it to you.' },
  { who: 'zwane', text: 'Bring it to me? There was never going to be a meeting, Kai. You\u2019d lift it, I\u2019d take it off you on the trail, and you\u2019d never know it was me.' },
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
  menIn: [{ who: 'handler', text: 'You think I came down that cliff alone? Take it off him.' }],
  menOut: [{ who: 'handler', text: 'Company money, wasted. Fine. I\u2019ll do it myself.' }],
  stagRage: [{ who: 'kai', text: 'It\u2019s getting angrier. Stay out of the thorns.' }],
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
// a perfect dodge: started this close (s) before the blow lands, it bends time round Kai for FOCUS_TIME (real) s:
// the world runs at FOCUS_SCALE, Kai at FOCUS_KAI, and his hits do FOCUS_DAMAGE x (KeyVision draws it)
const PERFECT_DODGE = 0.2;
// hit, Kai can't be hit again for this long (s, real time): the second blow of a combo, a spin's
// second kick or the forest's splash can't land on top of the first while he's still reeling
const HURT_GRACE = 0.75;
// a perfect parry leaves him reeling; the first blow Kai lands while he is is a RIPOSTE: this much
// harder again, with a heavy hit-stop, a gold shockwave and sparks. One per parry.
const RIPOSTE_DAMAGE = 1.5;
const FOCUS_TIME = 1.6;
const FOCUS_SCALE = 0.25;
const FOCUS_KAI = 0.9;
const FOCUS_DAMAGE = 1.5;
// lost to him more than once (`losses`)? from the second loss on he starts each new attempt this much
// weaker, down to EASE_MIN of his health. The first retry is the same fight: learn it.
const EASE_PER_LOSS = 0.1;
const EASE_MIN = 0.7;
const VS_TIME = 1.75; // the VS splash, then FIGHT
// act I: he stands off by the arch while his men come in under it (level3/Enforcers.js)
const BOSS_WATCH = BOSS_LAND.clone(); // he watches from where he landed off the arch
// the zip line: he comes down it first, then his men one after another, each dropping off the arch to here
const MEN_LAND = [new THREE.Vector3(-5.6, 0, -9.4), new THREE.Vector3(-0.6, 0, -9.6), new THREE.Vector3(-3.3, 0, -7.9)];
const MAN_ROPE_T = 1.8;
// out of the pool: Kai, to himself, before anyone comes
const SELF_TALK = [
  { who: 'kai', text: 'Over the falls\u2026 and still breathing.' },
  { who: 'kai', text: 'Whoever was on my tail, I lost them up there. Nobody follows you over a waterfall.' },
  { who: 'kai', text: '\u2026That\u2019s a relief. Now, Baba Zwane.' },
];
// the stag down, cold stone again: a few words over it before the end
const STAG_DOWN_TALK = [
  { who: 'kai', text: 'Easy\u2026 easy. It\u2019s over.' },
  { who: 'kai', text: 'You were only ever guarding it. I\u2019ll take it home. I promise.' },
];
// on the stag's back: open, and Kai beside it, he can leap on (E). It bucks to throw him: A / D keep his balance
const RIDE_REACH = 3.4;
const RIDE_TIME = 3.2;
const RIDE_HIT = 10; // a blow from its back, before the open x2.2
const RIDE_HIT_CD = 0.42;
const RIDE_THROWN = 8;
const LOOK = 0.0022; // radians of camera turn per pixel of mouse movement: the prologue's
const RIDE_LEAP = 0.45; // s up onto its back
const RIDE_OFF = 0.5; // s down off it
const MEN_NAME = 'THE COMPANY\u2019S MEN';
// act III: the stone stag at the gate comes down off its plinth (level3/ShadowStag.js)
const STAG_NAME = 'THE SHADOW STAG';
const STAG_PLINTH = new THREE.Vector3(-8.6, 1.5, -14.2);
const STAG_LAND = new THREE.Vector3(-6.4, 0, -10.2);
const RISE_AFTER = 2.6; // s after the killing blow
const RISE_TALK = [
  { who: 'zwane', text: 'The horn\u2026 it is not finished with us.' },
  { who: 'kai', text: 'What is that?' },
  { who: 'zwane', text: 'The forest\u2019s anger. It will not let the horn go home while it burns like this.' },
  { who: 'kai', text: 'Then let it burn at me.' },
];
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
    this.lookPitch = 0; // the follow camera's tilt, from the mouse (up is +)
    this._mouseIdle = 9; // s since the mouse last moved: left alone, the camera swings back behind Kai
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
    const stagModel = await assets.model('level2/animals/stag.glb').catch(() => null); // act III
    if (!this.scene) return; // level was torn down while loading

    this.kaiMeta = kai.meta;
    this.handlerMeta = handler.meta;
    this.combat = new CombatController(this.root, kai.source, kai.meta);
    this.kaiIK = BodyIK.for(this.combat.fighter); // the poses no clip has: astride the stag, down for the horn
    // the mouse looks round in the fight, as in the prologue: a click captures the pointer (Esc lets it go)
    this._onFightClick = () => {
      const el = this.game.renderer.domElement;
      if (this.mode !== 'FIGHT' || this._ended || this.camMode !== 'follow') return;
      if (document.pointerLockElement === el || !el.requestPointerLock) return;
      try {
        const req = el.requestPointerLock();
        if (req && req.catch) req.catch(() => {});
      } catch {
        // refused (a sandboxed frame): the mouse still turns the view as it moves over the game
      }
    };
    this.game.renderer.domElement.addEventListener('click', this._onFightClick);
    this.boss = new HandlerBoss(this.root, this.combat, handler.source, handler.meta);
    this.combat.arenaLimit = this.boss.arenaLimit = WALK_R; // ShrineArena.collide() does the real fencing
    this.boss.nav = new Nav(this.arena, 0.45); // his way round the trees after Kai (his collision radius, _collide below)
    // each loss so far takes a slice off his health for the next attempt (the phases scale with it)
    this._eased = Math.max(EASE_MIN, 1 - EASE_PER_LOSS * Math.max(0, losses - 1));
    this.boss.maxHealth = this.boss.health = Math.round(this.boss.maxHealth * this._eased);
    this.keyItem = attachHorn(this.combat.fighter); // the horn he took off the stone, slung at his hip, still lit
    this._wireBoss(state);
    // act I: the company's men, on his rig; act III: the Shadow Stag
    this.squad = handler.meta ? new EnforcerSquad(this.root, this.arena, this.combat, handler.source, handler.meta, 3) : null;
    if (this.squad) {
      this.squad.onStrike = (info, who) => this._resolveStrike(info, who);
      this.squad.onDown = (who) => {
        this._addShake(0.3);
        this.sound?.play('bodyFall', { volume: 0.7, rate: 1.05 });
        const left = this.squad.alive.length;
        this.hud.popup(left ? `${left} LEFT` : 'THEY\u2019RE DOWN', '#ffd9a8');
        this.style.add('finisher');
        void who;
      };
      this._menBodies = this.squad.men.map(() => ({ prev: null, plant: null }));
    }
    this.stag = stagModel ? new ShadowStag(this.root, this.arena, this.combat, stagModel) : null;
    if (this.stag) {
      this._wireStag();
      this._stagBody = { prev: null, plant: null };
    }
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
    this.zones = new Telegraphs(this.root, this.arena); // where his next blow lands, lit on the ground as he winds up
    this.flies = new Fireflies(this.root, this.arena); // out once the storm has passed
    this._fliesAmt = 0;
    if (this.handlerMeta?.clips.jump) {
      const bf = this.boss.fighter;
      const feet = bf.footTrack('jump');
      this.leap = feet && leapProfile(feet, Math.min(...bf.footTrack('idle')));
    }

    this._baseMaxHealth = state.maxHealth;
    this._baseParry = this.combat.parryWindow;
    state.awards.length = 0; // every attempt starts with all three spirits awake
    this.gifts = new ShrineGifts(this.arena, state, (id, gift) => this._onGift(id, gift));
    this.gifts.onReady = (id, gift) => {
      this.hud.toast(gift.name, 'its spirit has woken: it can heal you again', 3);
      this.sound?.play('shrinePulse', { volume: 0.5 });
      this._applyGifts();
    };

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
    this.story = new StoryOverlay(undefined, { letterbox: false }); // full-frame cutscenes, no black bars
    this.story.onSkip = () => this._skip();
    this.sound = new Level3Sound(); // the fight's audio: cues, bed, theme
    this._applyGifts();

    const cam = this.game.camera;
    cam.position.set(0, 3.6, 12.5);
    this._camLook = new THREE.Vector3(0, 1.4, 0);
    this._tmp = new THREE.Vector3();
    this._toBoss = new THREE.Vector3();
    this._kaiBody = { prev: null, plant: null }; // last position + the tree or bush each fighter is touching
    this._bossBody = { prev: null, plant: null };

    if (introSeen) this._startArrivalsOnly(); // a retry: no wake-up, but they still come down the line
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
    // his men ride the same line after him, each on his own
    this._menPulleys = (this.squad?.men || []).map(() => {
      const pulley = this._pulley.clone();
      pulley.visible = false;
      this.root.add(pulley);
      return pulley;
    });
  }

  /* ---------------------------------------------------------------- gifts */

  /**
   * Make Kai match the spirits' gifts. The HUD's icons: the fox's and the
   * ember's light up once taken (they last the fight); the stag's is lit
   * while its shrine is awake, i.e. a heal is waiting out there.
   */
  _applyGifts(fresh = null) {
    const has = (id) => this.state.awards.includes(id);
    const st = this.state;
    this.combat.parryWindow = this._baseParry * (has('strategy') ? 1.5 : 1);
    this.strategy = has('strategy');
    this.combat.damageMul = has('power') ? 1.4 : 1;
    this.power = has('power');
    this._setFistGlow(this.power);
    const lit = this.gifts?.ready('vitality') ? [...st.awards, 'vitality'] : st.awards;
    this.hud.setAwards(lit, fresh);
  }

  _onGift(id, gift) {
    if (gift.heal) {
      const before = this.state.health;
      this.state.heal(this.state.maxHealth * gift.heal);
      this.hud.popup(`+${Math.round(this.state.health - before)} LIFE`, gift.css);
    }
    this._applyGifts(id);
    this.sound?.play('pickupHeart', { volume: 0.7 });
    this.story.showAward(gift.icon, gift.name, gift.desc, gift.css, 4, gift.recharge ? 'SPIRIT SHRINE · WAKES AGAIN' : 'SPIRIT SHRINE · FOR THIS FIGHT');
    this._addShake(0.2);
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

    // a blow from anyone (the Marshal, one of his men, the stag): dodged, parried, blocked or taken
    this._resolveStrike = (info, attacker = this.boss) => {
      const c = this.combat;
      if (c.dead || this._ended || this.mode !== 'FIGHT') return 'dodged';
      if (this._hurtGrace > 0) return 'dodged';
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
        this._riposte = true; // his next blow while the Marshal reels is a riposte
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
        const bp = attacker.root.position, cp = c.root.position;
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
      this._hurtGrace = HURT_GRACE;
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

    this.boss.onStrike = (info) => this._resolveStrike(info, this.boss);

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
      if (this.stag) {
        this._riseIn = RISE_AFTER; // the horn isn't finished with them: act III
      } else {
        this.sound?.play('win', { volume: 0.85 });
        this._endTimer = 2.6;
        this._endKind = 'win';
        this.storm.clear();
      }
      this._startFinal();
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
    const foe = this.mode === 'FIGHT' && !this._ended ? this._foe() : null;
    if (!foe || foe.state === 'DOWN') {
      this.hud.setPointer(null);
      return;
    }
    const cam = this.game.camera;
    const v = this._ptr || (this._ptr = new THREE.Vector3());
    v.copy(foe.root.position);
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
  _damageNumber(amount, kind, at = this.boss.root.position) {
    const bp = at;
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
    // the pointer is only held while he's fighting in the follow view: cutscenes, cards and menus get it back
    const canvas = this.game.renderer.domElement;
    if (document.pointerLockElement === canvas && (this.mode !== 'FIGHT' || this._ended || this.camMode !== 'follow')) document.exitPointerLock();
    if (this._hurtGrace > 0) this._hurtGrace -= real;
    const input = this.input;

    if (input.pressed('skip') && (this.mode === 'INTRO' || (this.mode === 'EPILOGUE' && !this._talk))) {
      if (this._shot === 'D' || this._shot === 'A2') this._nextLine(true); // mid-conversation, space or a click moves it on a line
      else this._skip();
    } else if (input.pressed('skip') && (this.mode === 'REVEAL' || this.mode === 'SNATCH' || this.mode === 'EPILOGUE' || this.mode === 'RISE' || this.mode === 'STAGDOWN') && this._talk) {
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
    this.gifts.setMarkersVisible(this.mode === 'FIGHT' && !this._ended);
    this.gifts.update(dt, this.time, fighting && !this.combat.dead ? kp : null, this.game.camera);
    if (fighting || this.mode === 'RISE') {
      const bp = this._foePos || this.boss.root.position;
      this.arena.setFocus((kp.x + bp.x) / 2, (kp.z + bp.z) / 2);
    } else this.arena.setFocus(kp.x, kp.z);
    if (this._hornDrop) this._updateHornDrop(dt);
    if (this.keyItem && !this._hornHeld && !this._blowing) {
      // lying where he fell (burning red through act III), or on its way back to Kai's hand
      const lying = this._hornDrop || this._pickup || (this._hornTaken && !this._pickedUp && this.boss.state === 'DOWN');
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
    // who he's fighting this moment: one of the company's men, the Marshal, or the stag
    const foe = this._foe();
    const fp = foe ? foe.root.position : bp;
    this._foePos = fp;
    const orbit = this.touch.consumeOrbit();
    if (this.camMode === 'follow') {
      // the mouse looks round, as in the prologue: left / right turns the view, up / down tilts it
      const m = this.input.mouse;
      if (this.mode === 'FIGHT' && (m.dx || m.dy)) {
        this.camYaw -= m.dx * LOOK;
        this.lookPitch = Math.min(0.45, Math.max(-0.3, this.lookPitch - m.dy * LOOK));
        this._mouseIdle = 0;
      }
      this._mouseIdle += real;
      // and left alone while he moves (or rides), it swings back round behind him (never right round
      // to his front: walking toward the camera, it stays where it is)
      const behind = shortestAngle(this.camYaw, this.combat.heading);
      if (this._mouseIdle > 0.7 && (this.combat.moving || this._ride) && Math.abs(behind) < 2) {
        this.camYaw += behind * (1 - Math.exp(-2.4 * real));
      }
    } else if (this.camMode === 'lock') {
      const want = Math.atan2(fp.x - cp.x, fp.z - cp.z);
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
    // ...and while the horn sounds the world crawls round him but he doesn't: he keeps his own full pace
    const hornTime = this.combat.abilityActive && this.mode === 'FIGHT';
    const kaiDt = stopped ? dt : focus ? real * FOCUS_KAI : hornTime ? real : dt;
    // the stag open and Kai beside it: he can leap onto its back (E)
    const stp = this.stag?.root.position;
    this._canRide = this.act === 'STAG' && this.mode === 'FIGHT' && !this._ended && !this._ride && !!this.stag?.alive
      && this.stag.vulnerable && this.stag.state !== 'RIDDEN' && !this.combat.dead && !this.combat.attacking && !this.combat.dodging
      && Math.hypot(stp.x - cp.x, stp.z - cp.z) < RIDE_REACH;
    if (this._canRide && controls.pressed('interact')) this._startRide();
    if (this._ride) this._updateRide(kaiDt, controls, state);
    else if (this.mode !== 'STAGDOWN') this.combat.update(kaiDt, controls, state, { camYaw: this.camYaw, lockOn: this.lockOn, targetPos: fp, aim: this.camMode === 'follow' });
    this._updateTrail(kaiDt, focus);
    this.boss.counterOff = focus; // no counter-attacks out of bent time: that's Kai's window

    // Kai's swing
    if (this.combat.consumeHit() && foe && foe.alive !== false && foe.state !== 'DOWN') {
      // the stag is a tonne of stone: a blow barely shifts it
      const shove = foe === this.stag ? 0.12 : 1;
      this._toBoss.set(fp.x - cp.x, 0, fp.z - cp.z);
      const dist = this._toBoss.length();
      if (dist > 0.001) this._toBoss.divideScalar(dist);
      const facing = Math.sin(this.combat.heading) * this._toBoss.x + Math.cos(this.combat.heading) * this._toBoss.z;
      if (dist <= this.combat.attackRange && facing > 0.2) {
        const fin = this.combat.comboFinisher;
        // the blow straight after a parry, while he reels: the riposte
        const riposte = this._riposte && foe.vulnerable;
        if (riposte) this._riposte = false;
        const dealt = foe.takeDamage(this.combat.attackDamage * (focus ? FOCUS_DAMAGE : 1) * (riposte ? RIPOSTE_DAMAGE : 1));
        // a finisher catches every one of his men in reach, not just the one he aimed at
        if (fin && this.act === 'MEN') {
          for (const m of this.squad.alive) {
            if (m === foe) continue;
            const mx = m.root.position.x - cp.x, mz = m.root.position.z - cp.z;
            const md = Math.hypot(mx, mz);
            if (md <= this.combat.attackRange + 0.4 && Math.sin(this.combat.heading) * mx + Math.cos(this.combat.heading) * mz > 0.2 * md) {
              m.takeDamage(this.combat.attackDamage * 0.6);
            }
          }
        }
        if (dealt > 0 && foe === this.stag && foe.lastArmoured && this.time > (this._armourMsgAt || 0)) {
          this.hud.popup('ARMOURED', '#9aa3ad'); // it shrugs it off: wait till its veins burn cyan
          this._armourMsgAt = this.time + 1.6;
        }
        if (dealt > 0) {
          this.sound?.play('punch', {
            volume: foe.vulnerable ? 0.88 : fin ? 0.78 : 0.6,
            rate: 0.96 + Math.random() * 0.08,
          });
          // the big ones draw a grunt out of him
          if (foe.vulnerable || fin) {
            this.sound?.play('grunt', { volume: 0.5, rate: 0.82 + Math.random() * 0.06 });
          }
          fp.addScaledVector(this._toBoss, (fin ? 0.9 : 0.3) * (this.power ? 1.4 : 1) * shove);
          if (this.power) {
            this.arena.burst(fp.x - this._toBoss.x * 0.4, fp.z - this._toBoss.z * 0.4, {
              color: 0xffb347, count: fin ? 30 : 16, speed: fin ? 3.4 : 2.4, size: 0.2, y: fp.y + 1.1, lift: 1.4, additive: true,
            });
          }
          this._hitStop(fin ? 0.06 : 0.03);
          this._addShake(fin ? 0.28 : 0.1);
          if (fin) {
            this.waves.spawn(fp.x, fp.y, fp.z, {
              size: this.power ? 4.2 : 3.2, color: focus ? 0x8ff0ff : this.power ? 0xffb347 : 0xffe2b0,
            });
          }
          const crit = foe.vulnerable;
          if (riposte) {
            this.hud.popup('RIPOSTE!', '#ffd23a');
            this._hitStop(0.22);
            this._addShake(0.6);
            this.waves.spawn(fp.x, fp.y, fp.z, { size: 5.2, life: 0.55, color: 0xffd23a });
            this.waves.spawn(fp.x, fp.y, fp.z, { size: 2.6, life: 0.35, color: 0xfff4c0 });
            this.arena.burst(fp.x - this._toBoss.x * 0.4, fp.z - this._toBoss.z * 0.4, {
              color: 0xffd23a, count: 46, speed: 4.6, size: 0.24, y: fp.y + 1.2, lift: 2.2, additive: true,
            });
            fp.addScaledVector(this._toBoss, 0.8 * shove);
            this.sound?.play('parry', { volume: 0.7, rate: 0.75 });
            this.style.add('perfect');
          } else if (crit) this.hud.popup('CRITICAL', '#ffd23a');
          this._damageNumber(dealt, crit ? 'crit' : focus ? 'key' : fin ? 'big' : '', fp);
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
    // the men: their fight in act I, and after it, the fallen settling where they dropped
    if (this.squad) this.squad.update(dt);
    if (this.act === 'MEN' && this.squad && this.mode === 'FIGHT' && !this._ended && this.squad.done) this._startBossAct();
    if (this.act === 'STAG' && this.stag) this.stag.update(dt);
    if (this._ride) this._poseRider(); // on its back: posed to where it is now
    // a riposte is only ever the blow into the reel his parry opened
    if (this._riposte && foe && !foe.vulnerable && foe.state !== 'STRIKE') this._riposte = false;
    if (this.mode === 'FIGHT' && !this._ended && b.state !== 'DOWN' && this.act === 'BOSS') this.zones.update(dt, this.boss.threat, this.boss.root.position);
    else this.zones.hide();
    this._separate();
    // out in the jungle: trees, bushes, statues and walls are solid, and the ground isn't flat
    if (!this._ride) { // on the stag's back he goes where it goes
      this._collide(this._kaiBody, cp, 0.4, dt, this.combat.dodging);
      cp.y = this.arena.fighterY(cp.x, cp.z);
    }
    this._collide(this._bossBody, bp, 0.45, dt, false);
    bp.y = this.arena.fighterY(bp.x, bp.z);
    if (this.squad) {
      this.squad.men.forEach((m, i) => {
        if (!m.alive) return;
        const p = m.root.position;
        this._collide(this._menBodies[i], p, 0.42, dt, false);
        p.y = this.arena.fighterY(p.x, p.z);
      });
    }
    if (this.stag?.alive && this.stag.state !== 'RISE') this._collide(this._stagBody, this.stag.root.position, 1.1, dt, false);
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
      // the notes wait for the Marshal's opening line in act I, so they don't land on top of it
      if (this.act === 'MEN') this._toastsIn = 4.2;
      else for (const t of this._fightToasts) this.hud.toast(...t, { queue: true });
    }
    if (this._toastsIn > 0 && (this._toastsIn -= real) <= 0) for (const t of this._fightToasts) this.hud.toast(...t, { queue: true });
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
    else if (this.mode === 'RISE') this._updateRise(real);
    else if (this.mode === 'STAGDOWN') this._updateStagDown(real);
    // the killing blow has played out: act III
    if (this._riseIn > 0 && (this._riseIn -= real) <= 0) this._startRise();
    if (this._stagDownIn > 0 && (this._stagDownIn -= real) <= 0) this._startStagDown();

    // time scale: hit-stop beats the reveal's slow-mo beats the Key's slow-mo beats normal
    state.timeScale = stopped ? 0.12
      : this.mode === 'FINAL' ? 0.15 + 0.85 * smooth(0.5, 2.3, this.beatT)
      : this.mode === 'REVEAL' ? (this.beatT < 1.1 ? 0.45 : 1)
      : this.mode === 'SNATCH' ? (this.beatT > 0.3 && this.beatT < 0.9 ? 0.3 : 1)
      : focus ? FOCUS_SCALE
      : this.combat.abilityActive ? 0.35 : 1;

    // what they shout at each other as it turns
    if (this.mode === 'FIGHT' && !this._ended && this.act === 'BOSS') {
      if (state.health / state.maxHealth < 0.3) this._barkOnce(this.boss.helmetOff ? 'kaiLow' : 'kaiLowMasked');
      if (this.boss.helmetOff && this.boss.health / this.boss.maxHealth < 0.15 && this.boss.health > 0) this._barkOnce(this._hornHeld ? 'hornLow' : 'bossLow');
    }
    this._tickBark(real);
    if (this.act === 'MEN' && this.squad) {
      const left = this.squad.alive.length + this.squad.men.filter((m) => m.state === 'OFF').length;
      this.hud.setBoss(this.squad.fraction, left ? `${left} LEFT` : 'DOWN');
    } else if (this.act === 'STAG' && this.stag) {
      const s = this.stag;
      this.hud.setBoss(s.health / s.maxHealth, !s.alive ? 'DEFEATED' : s.vulnerable ? 'OPEN \u2014 STRIKE!' : s.enraged ? 'ENRAGED \u00b7 ARMOURED' : 'ARMOURED');
    } else this.hud.setBoss(this.boss.health / this.boss.maxHealth, b.state === 'DOWN' ? 'DEFEATED' : `PHASE ${this.boss.phaseIndex + 1} — ${b.phase}`);
    this.hud.setPlayer(state.health / state.maxHealth, state.stamina / state.maxStamina, state.maxHealth / this._baseMaxHealth);

    // Strategy gift: call his next move while he lines it up
    const tell = this.strategy && this.mode === 'FIGHT' && !this._ended && this.act === 'BOSS' && TELLS[this.boss.attackName];
    if (this._ride && !this._ride.off) {
      this.hud.setTell(this._rideBar(), 'A / D: lean against it \u00b7 PUNCH / KICK: strike it', '#7ff4ff');
    } else if (this._canRide) {
      this.hud.setTell('E \u00b7 LEAP ON ITS BACK', 'it\u2019s open: get on it, and hold on', '#7ff4ff');
    } else if (tell && (b.state === 'APPROACH' || b.state === 'TELEGRAPH')) {
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
    // a moves `share` of the overlap, b the rest
    const apart = (a, b, min, share = 0.5) => {
      const dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d >= min) return;
      const nx = d > 0.001 ? dx / d : 0, nz = d > 0.001 ? dz / d : 1;
      const over = min - d;
      a.x -= nx * over * share; a.z -= nz * over * share;
      b.x += nx * over * (1 - share); b.z += nz * over * (1 - share);
    };
    const k = this.combat.root.position;
    if (this.boss.state !== 'DOWN') apart(k, this.boss.root.position, 0.95);
    const men = this.squad ? this.squad.alive : [];
    for (let i = 0; i < men.length; i++) {
      apart(k, men[i].root.position, 0.9);
      for (let j = i + 1; j < men.length; j++) apart(men[i].root.position, men[j].root.position, 0.9);
      if (this.boss.state !== 'DOWN') apart(men[i].root.position, this.boss.root.position, 0.95);
    }
    if (this.stag?.alive && this.stag.state !== 'RISE' && !this._ride) apart(k, this.stag.root.position, 1.55, 0.9); // it barely gives
  }

  /** Who Kai is fighting this moment: the nearest of the company's men, the Marshal, or the Shadow Stag. */
  _foe() {
    if (this.act === 'MEN') return this.squad.target(this.combat.root.position, this.combat.heading);
    if (this.act === 'STAG') return this.stag?.alive ? this.stag : null;
    return this.boss;
  }

  /** Act II: his men are down, so he comes himself. */
  _startBossAct() {
    this.act = 'BOSS';
    const b = this.boss;
    b.watching = false;
    b.restFor = VS_TIME + 0.4;
    this.squad?.hideZones();
    this.hud.setBossName(WHO.handler.name);
    this.hud.versus(WHO.kai.name, WHO.handler.name);
    this._fightCall = VS_TIME;
    this._fightToasts = [];
    this.sound?.play('handoff', { volume: 0.6 });
    this._barkOnce('menOut');
  }

  /** The horn's light: clean (cyan) or tainted (the forest's anger, red). */
  _taintHorn(tainted) {
    const h = this.keyItem;
    if (!h) return;
    h.userData.material.emissive.setHex(tainted ? 0xff2a10 : 0x4fd6e0);
    h.userData.glow.material.color.setHex(tainted ? 0xff5a2a : 0x7fe9f0);
  }

  _wireStag() {
    const s = this.stag;
    s.onStrike = (info, who) => this._resolveStrike(info, who);
    s.onImpact = (kind, at) => {
      if (kind === 'stomp') {
        this.waves.spawn(at.x, at.y + 0.1, at.z, { size: 4.6, life: 0.45, color: 0xb070ff });
        this._addShake(0.45);
        this.sound?.play('bodyFall', { volume: 0.9, rate: 0.6 });
      } else if (kind === 'thorns') {
        this._addShake(0.35);
        this.sound?.play('whoosh', { volume: 0.7, rate: 0.55 });
      } else if (kind === 'stuck') {
        this.hud.popup('STUCK \u2014 STRIKE!', '#7ff4ff');
        this._addShake(0.5);
        this.arena.burst(at.x, at.z, { color: 0x6b5a44, count: 30, speed: 3, size: 0.3, y: at.y + 1.2 });
        this.sound?.play('bodyFall', { volume: 0.75, rate: 0.8 });
      } else if (kind === 'land') {
        this._addShake(0.55);
        this.waves.spawn(at.x, at.y + 0.1, at.z, { size: 3.6, life: 0.4, color: 0xff3a14 });
        this.sound?.play('bodyFall', { volume: 0.85, rate: 0.7 });
      }
    };
    s.onEnrage = () => {
      this.hud.popup('ENRAGED', '#ff5a3a');
      this.sound?.play('guardianRoar', { volume: 0.9, rate: 0.8 });
      this._addShake(0.4);
      this._barkOnce('stagRage');
    };
    s.onDown = () => {
      this._hitStop(0.15);
      this._addShake(0.6);
      this.sound?.play('guardianRoar', { volume: 0.7, rate: 0.6 });
      this.sound?.duck(0.85, 1.6);
      this.sound?.play('win', { volume: 0.85 });
      this.hud.popup('THE HORN IS CLEAN', '#7ff4ff');
      this._taintHorn(false);
      this.storm.clear();
      this._stagDownIn = 2.2; // let it fall, then a few words over it (_startStagDown)
    };
  }

  /**
   * Act III begins: the horn, lying where he fell, burns red, and the stone
   * stag at the gate cracks open and comes down off its plinth.
   */
  _startRise() {
    this._enterBeat('RISE');
    this.act = 'STAG';
    this._riseTalked = false;
    this._talk = this._talkDone = null;
    this.story.setCinematic(true, true);
    this.story.setSkipLabel('SPACE: NEXT LINE \u00b7 CLICK HERE: SKIP');
    this.hud.setVisible(false);
    this.hud.setTell('');
    this.touch.setVisible(false);
    this._taintHorn(true);
    const st = this.arena.guardianStag;
    if (st) {
      st.visible = false;
      const i = this.arena.obstacles.indexOf(this.arena.guardianStagObstacle);
      if (i >= 0) this.arena.obstacles.splice(i, 1);
    }
    this.arena.burst(STAG_PLINTH.x, STAG_PLINTH.z, { color: 0x8a8a76, count: 60, speed: 5, size: 0.45, y: 1.8, lift: 3 });
    this.arena.burst(STAG_PLINTH.x, STAG_PLINTH.z, { color: 0xff3a14, count: 40, speed: 3, size: 0.3, y: 2.2, lift: 2.5, additive: true });
    this._addShake(0.7);
    this.sound?.setVariant('battle');
    this.sound?.play('guardianRoar', { volume: 1, rate: 0.7 });
    this.sound?.duck(0.6, 2);
    this.stag.rise(STAG_PLINTH, STAG_LAND);
  }

  _updateRise(real) {
    const k = this.combat;
    const kp = k.root.position;
    const sp = this.stag.root.position;
    k.heading += shortestAngle(k.heading, Math.atan2(sp.x - kp.x, sp.z - kp.z)) * (1 - Math.exp(-6 * real));
    // from behind Kai, up at it
    const d = this._tmp.set(kp.x - sp.x, 0, kp.z - sp.z).normalize();
    const pos = new THREE.Vector3(kp.x + d.x * 3.4 + d.z * 1.3, kp.y + 2.1, kp.z + d.z * 3.4 - d.x * 1.3);
    this._setCine(pos, new THREE.Vector3(sp.x, sp.y + 2.3, sp.z), { fov: 42, rate: 3, cut: !this._riseCut });
    this._riseCut = true;
    if (!this._riseTalked && this.beatT > 1.7) {
      this._riseTalked = true;
      this._converse(RISE_TALK, () => this._startStagAct());
    }
    this._tickLine(real);
  }

  /** The talk's done (or skipped): Kai and the Shadow Stag. */
  _startStagAct() {
    if (this.mode !== 'RISE') return;
    this._talk = this._talkDone = null;
    this.story.hideLine();
    this.story.setSkipLabel();
    this._enterBeat('FIGHT');
    this.cine = null;
    this.story.setCinematic(false);
    this.hud.setVisible(true);
    this.touch.setVisible(true);
    this.hud.setBossName(STAG_NAME);
    this.hud.versus(WHO.kai.name, STAG_NAME);
    this._fightCall = VS_TIME;
    this.stag.begin();
    this.stag.restFor = VS_TIME + 0.4;
    this._fightToasts = [[STAG_NAME, 'armoured: strike when its cracks burn cyan \u00b7 open, E leaps onto its back \u00b7 lure its charge into a tree', 7]];
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
    this.hud.el.classList.add('ended');
    const who = this.boss.helmetOff ? 'Baba Zwane' : 'The Marshal';
    // the losing card every level shows (ui/EndCard.js)
    this._loseCard = showLoseCard(this.game, {
      title: 'DEFEATED',
      sub: `${who} stands over you, and the horn slips from your hand.`,
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
    else if (this.mode === 'RISE') this._startStagAct();
    else if (this.mode === 'STAGDOWN') this._endStagDown();
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
   * The shots, ~50 s if you let the talk play out: (A) Kai sits up in the
   * pool, seen from inside the gate, wades out and gets the water off as the
   * camera backs through the arch; (A2) a few words to himself: he's lost
   * whoever was after him; (B) cut to the courtyard as he runs through the
   * arch toward camera; (R) the line sings: the Marshal comes down the zip
   * line and drops off the arch, then his men, one after another
   * (_updateArrivals); (D) face to face, the dialogue (Space moves it on a
   * line); then the fight camera. A retry plays only R, then the fight.
   */
  _updateIntro(dt) {
    const k = this.combat;
    const kf = k.fighter;
    // Kai's few words to himself out of the water (A2) and the riders down the line run on their own clocks
    if (this._arrivals || this._shot === 'A2') {
      if (this._arrivals) this._updateArrivals(dt);
      else this._updateSelfTalk(dt);
      k.root.rotation.y = k.heading;
      kf.update(dt);
      return;
    }
    const bt = this.beatT - (this._held || 0); // the clock, less the time he spent talking to himself
    if (bt >= A_END && !this._selfTalked) {
      this._startSelfTalk();
      return;
    }
    // shot A runs on its own clock; B keeps its timings, just SHAKE_BEAT later
    let t = bt < A_END ? bt : bt - SHAKE_BEAT;
    const a = this.arena.anchors;
    const kp = k.root.position;

    if (bt < A_END) {
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
    } else if (!this._arrivals) {
      // ---- R: down the zip line, him and then his men (_updateArrivals)
      this._startArrivals(false);
    }
    k.root.rotation.y = k.heading;
    kf.update(dt);
  }

  /** Out of the pool, the water shaken off: a few words to himself, the camera in front of him. */
  _startSelfTalk() {
    this._shot = 'A2';
    this._selfTalked = true;
    this._converse(SELF_TALK, () => {
      this._held = this.beatT - A_END; // the intro's clock picks up where it stopped
      this._shot = null;
      this.story.setSkipLabel();
    });
  }

  _updateSelfTalk(dt) {
    const k = this.combat;
    const kp = k.root.position;
    const f = this._tmp.set(Math.sin(k.heading), 0, Math.cos(k.heading));
    const pos = new THREE.Vector3(kp.x + f.x * 2.3 + f.z * 0.6, kp.y + 1.6, kp.z + f.z * 2.3 - f.x * 0.6);
    this._setCine(pos, new THREE.Vector3(kp.x, kp.y + 1.5, kp.z), { fov: 38, rate: 3, cut: this._cine2 !== true });
    this._cine2 = true;
    this._tickLine(dt);
  }

  /** A retry: Kai already in the courtyard, and they come down the line again (skippable). */
  _startArrivalsOnly() {
    this._enterBeat('INTRO');
    this.sound?.setVariant('intro');
    this.story.setCinematic(true, true);
    this.hud.setVisible(false);
    this.touch.setVisible(false);
    this.boss.root.visible = false;
    const k = this.combat;
    k.root.position.copy(KAI_START);
    k.heading = Math.atan2(BOSS_LAND.x - KAI_START.x, BOSS_LAND.z - KAI_START.z);
    this._setCine(new THREE.Vector3(2.6, 2.1, 7.4), new THREE.Vector3(-1.4, 4.5, -6.5), { fov: 55, cut: true });
    this._startArrivals(true);
  }

  /**
   * Down the zip line, one after another: the Marshal first, then each of
   * his men on his own pulley, each letting go at the keystone and dropping
   * off the arch into the courtyard. Then the talk (or, on a retry, the fight).
   */
  _startArrivals(short) {
    const k = this.combat;
    if (!short) k.root.position.copy(KAI_START);
    k.fighter.play('idle', { fade: 0.3 });
    const riders = [{ who: this.boss, ride: ROPE_T, land: BOSS_LAND, pulley: this._pulley, card: [WHO.handler.name, 'He came over the edge after you.'], boss: true }];
    (this.squad?.men || []).forEach((m, i) => riders.push({
      who: m, ride: MAN_ROPE_T, land: MEN_LAND[i], pulley: this._menPulleys[i],
      card: i === 0 ? [MEN_NAME, 'He didn\u2019t come alone.'] : null,
    }));
    let at = 0;
    for (const r of riders) {
      r.start = at;
      at += short ? r.ride * 0.6 + 0.15 : r.ride * 0.85 + 0.35; // the next sets off as this one nears the bottom (closer on a retry)
      r.phase = 'wait';
      r.who.root.visible = false;
      r.pulley.position.copy(this._ropeA);
      r.pulley.visible = true;
    }
    this._arrivals = { riders, t: 0, short, doneAt: null };
    this._shot = 'R';
  }

  _updateArrivals(dt) {
    const A = this._arrivals;
    A.t += dt;
    const a = this.arena.anchors;
    const lp = this.leap;
    const k = this.combat;
    const kp = k.root.position;
    let focus = null;
    for (const r of A.riders) {
      const t = A.t - r.start;
      if (t < 0) continue;
      const w = r.who;
      const f = w.fighter;
      const root = w.root;
      if (r.phase === 'wait') {
        r.phase = 'ride';
        root.visible = true;
        r.mid = lp ? (lp.off + lp.on) / 2 : 0;
        if (lp) f.hold('jump', r.mid, 0); // mid-leap: arms up, legs tucked, the way you ride a line
        else f.play('idle', { fade: 0 });
        this.sound?.play('whoosh', { volume: 0.55, rate: 0.6 + Math.random() * 0.1 });
        if (r.card) this.story.showCard(...r.card);
        r.spark = 0;
      }
      if (r.phase === 'ride') {
        const u = Math.min(1, t / r.ride);
        // faster and faster down the line, then the brake at the bottom
        const e = u < 0.82 ? 0.95 * Math.pow(u / 0.82, 1.7) : 0.95 + 0.05 * smooth(0.82, 1, u);
        const p = (this._ropeP ||= new THREE.Vector3()).copy(this._ropeA).lerp(this._ropeB, e);
        r.pulley.position.copy(p);
        r.pulley.lookAt(this._ropeA);
        root.position.set(p.x, p.y - ROPE_HANG, p.z);
        w.heading = Math.atan2(this._ropeB.x - this._ropeA.x, this._ropeB.z - this._ropeA.z);
        r.spark -= dt;
        if (r.spark <= 0 && u < 0.97) {
          r.spark = 0.05;
          this.arena.burst(p.x, p.z, { color: 0xffb347, count: 5, speed: 2.4, size: 0.07, y: p.y, lift: 0.4, additive: true });
        }
        if (lp) f.visual.position.y = -lp.lower(r.mid);
        focus = root.position;
        if (u >= 1) {
          // the brake; he lets go, and drops off the arch
          r.phase = 'drop';
          r.dropT = 0;
          this._addShake(0.2);
          this.sound?.play('impact', { volume: 0.45, rate: 1.3 });
          r.landY = this.arena.fighterY(r.land.x, r.land.z);
          r.from = root.position.clone();
          r.fall = Math.sqrt((2 * Math.max(0.5, r.from.y - r.landY)) / LEAP_G);
          r.takeoff = lp ? lp.off - LEAP_FROM : 0.3;
          if (lp) f.hold('jump', LEAP_FROM, 0);
          r.pulley.visible = false;
        }
      } else if (r.phase === 'drop') {
        r.dropT += dt;
        const air = Math.min(1, Math.max(0, (r.dropT - r.takeoff) / r.fall));
        root.position.lerpVectors(r.from, r.land, air);
        root.position.y = r.from.y + (r.landY - r.from.y) * air * air;
        w.heading += shortestAngle(w.heading, Math.atan2(kp.x - root.position.x, kp.z - root.position.z)) * (1 - Math.exp(-4 * dt));
        if (lp) {
          // the clip's own crouch and spring at their speed; its time in the air stretched over the fall
          const s = r.dropT;
          const pre = lp.off - LEAP_FROM;
          const clipT = s < pre ? LEAP_FROM + s : s < pre + r.fall ? lp.off + ((s - pre) / r.fall) * (lp.on - lp.off) : lp.on + (s - pre - r.fall);
          const act = f.actions.jump;
          act.time = Math.min(clipT, act.getClip().duration);
          if (clipT > act.getClip().duration - 0.4 && f.current === act) f.play('idle', { fade: 0.4 });
        } else if (r.dropT >= r.takeoff && !r.jumped) {
          r.jumped = true;
          f.playOnce('jump', { speed: 1.3 });
        }
        focus = root.position;
        if (air >= 1 && !r.landed) {
          r.landed = true;
          r.phase = 'down';
          if (!lp) f.play('idle', { fade: 0.2 });
          this._addShake(r.boss ? 0.75 : 0.45);
          this.arena.burst(r.land.x, r.land.z);
          this.waves.spawn(r.land.x, r.landY, r.land.z, { size: r.boss ? 5.5 : 3.6, life: 0.6, color: 0xffe2b0 });
          this.sound?.play('impact', { volume: r.boss ? 0.9 : 0.6 });
          if (r.boss) this.sound?.duck(0.4, 0.8);
        }
      } else {
        // down: turned to Kai, up out of the crouch into his stance
        w.heading += shortestAngle(w.heading, Math.atan2(kp.x - root.position.x, kp.z - root.position.z)) * (1 - Math.exp(-5 * dt));
        const act = f.actions.jump;
        if (lp && act && f.current === act) {
          act.time = Math.min(act.time + dt, act.getClip().duration);
          if (act.time > act.getClip().duration - 0.4) f.play('idle', { fade: 0.4 });
        }
      }
      root.rotation.y = w.heading;
      f.update(dt);
      // lowered after the pose: the clip's ledge, faded out as it hands over to idle
      if (lp && r.phase !== 'ride' && f.actions.jump) f.visual.position.y = -lp.lower(f.actions.jump.time) * f.actions.jump.getEffectiveWeight();
    }
    // Kai hears the line sing and looks up at the arch; once the first one's down he turns to face them, guard up
    const firstDown = A.riders[0].landed;
    const look = firstDown ? BOSS_LAND : a.gateTop;
    k.heading += shortestAngle(k.heading, Math.atan2(look.x - kp.x, look.z - kp.z)) * (1 - Math.exp(-3 * dt));
    k.fighter.setGuard(firstDown, 0.8);
    // from behind Kai, up at whoever's coming down
    if (!focus) focus = A.riders[A.riders.length - 1].who.root.position;
    this.cine.pos.set(2.6, 2.1, 7.4);
    this.cine.look.lerp(this._tmp.set(focus.x, focus.y + 1.2, focus.z), 1 - Math.exp(-4 * dt));
    this.cine.fov = 40; // close enough to see who's on the line
    this.cine.rate = 3;
    // all down: the talk (first time), or straight into it (a retry)
    if (A.riders.every((r) => r.landed)) {
      A.doneAt ??= A.t;
      if (A.t - A.doneAt > (A.short ? 0.9 : 1.4)) {
        this._arrivals = null;
        if (A.short) this._startFight();
        else this._startTalk();
      }
    }
  }

  /** The stag's down and cold stone: a few words over it, then the epilogue. */
  _startStagDown() {
    if (this._ride) this._finishRide();
    this._enterBeat('STAGDOWN');
    this._downCut = false;
    this._downSide = null;
    this._downPose = null;
    this._talk = this._talkDone = null;
    this.story.setCinematic(true, true);
    this.story.setSkipLabel('SPACE: NEXT LINE \u00b7 CLICK HERE: SKIP');
    this.hud.setVisible(false);
    this.hud.setTell('');
    this.touch.setVisible(false);
    this.combat.fighter.setGuard(false);
    this.combat.fighter.visual.rotation.z = 0;
    this.combat.fighter.play('idle', { fade: 0.4 });
    this._converse(STAG_DOWN_TALK, () => this._endStagDown());
  }

  _updateStagDown(real) {
    const k = this.combat;
    const kf = k.fighter;
    const kp = k.root.position;
    const sp = this.stag.root.position;
    k.heading += shortestAngle(k.heading, Math.atan2(sp.x - kp.x, sp.z - kp.z)) * (1 - Math.exp(-4 * real));
    // he walks up to it, slowly, and stands easy over it: the fight's gone out of him too
    const gap = Math.hypot(sp.x - kp.x, sp.z - kp.z);
    if (gap > 2.4 && this.beatT > 0.4) {
      const step = Math.min(gap - 2.4, 1.3 * real);
      kp.x += ((sp.x - kp.x) / gap) * step;
      kp.z += ((sp.z - kp.z) / gap) * step;
      this.arena.collide(kp, 0.4);
      kp.y = this.arena.fighterY(kp.x, kp.z);
      kf.play('walk', { fade: 0.3 });
    } else if (this.beatT > 0.4 && this._downPose !== 'easy') {
      this._downPose = 'easy';
      if (kf.actions.relax) kf.hold('relax', kf.clipDuration('relax') - 0.01, 0.6);
      else kf.play('idle', { fade: 0.4 });
    }
    k.root.rotation.y = k.heading;
    kf.update(real);
    // side on, low: Kai on one side of the frame, the stone stag on the other
    const mid = this._tmp.set((kp.x + sp.x) / 2, 0, (kp.z + sp.z) / 2);
    const span = Math.max(3, Math.hypot(sp.x - kp.x, sp.z - kp.z));
    if (!this._downSide) {
      const d = new THREE.Vector3(sp.x - kp.x, 0, sp.z - kp.z).normalize();
      // the open side: toward the middle of the courtyard, away from the walls
      this._downSide = new THREE.Vector3(d.z, 0, -d.x);
      if (this._downSide.dot(new THREE.Vector3(-mid.x, 0, -mid.z)) < 0) this._downSide.negate();
    }
    const out = span * 1.15 + 3.4;
    const pos = new THREE.Vector3(mid.x + this._downSide.x * out, kp.y + 1.6, mid.z + this._downSide.z * out);
    this._setCine(pos, new THREE.Vector3(mid.x, kp.y + 0.85, mid.z), { fov: 45, rate: 2.5, cut: !this._downCut });
    this._downCut = true;
    this._tickLine(real);
  }

  _endStagDown() {
    if (this.mode !== 'STAGDOWN') return;
    this._talk = this._talkDone = null;
    this.story.hideLine();
    this.story.setSkipLabel();
    this._endTimer = 0.5;
    this._endKind = 'win';
  }

  /** Up onto the stag's back while it's open. */
  _startRide() {
    const k = this.combat;
    const kf = k.fighter;
    k.blocking = false;
    k.queued = null;
    kf.setGuard(false);
    k.root.updateMatrixWorld(true);
    const hips = kf.bone('Hips');
    this._ride = {
      t: 0, balance: 0, push: 0, pushT: 0.3, hitCD: RIDE_LEAP, punchT: 0, hands: 1,
      hipsFrom: hips ? hips.getWorldPosition(new THREE.Vector3()) : k.root.position.clone().setY(k.root.position.y + 0.95),
      qFrom: k.root.quaternion.clone(),
    };
    this._rideBase(0.15);
    this.stag.ride(RIDE_TIME);
    this.hud.popup('ON ITS BACK!', '#7ff4ff');
    this.sound?.play('whoosh', { volume: 0.6, rate: 0.8 });
    this.sound?.play('guardianRoar', { volume: 0.7, rate: 1.15 });
    this._addShake(0.3);
  }

  /** What he's doing under the pose on its back: standing easy (his legs and hands are laid over it, _poseRider). */
  _rideBase(fade) {
    const kf = this.combat.fighter;
    if (kf.actions.relax) kf.hold('relax', kf.clipDuration('relax') - 0.01, fade);
    else kf.play('idle', { fade });
  }

  /** On its back: it bucks to throw him one way and the other; he leans against it and lands blows. */
  _updateRide(dt, input, state) {
    const R = this._ride;
    R.t += dt;
    const k = this.combat;
    const kf = k.fighter;
    const s = this.stag;
    k.heading = s.heading;
    if (R.off) {
      // getting off: the arc down beside it is _poseRider's
      R.off.t += dt;
      kf.update(dt);
      return;
    }
    if (R.t >= RIDE_LEAP) {
      // it throws its weight one way, then the other; A / D lean against it
      R.pushT -= dt;
      if (R.pushT <= 0) {
        R.pushT = 0.5 + Math.random() * 0.35;
        R.push = (Math.random() < 0.5 ? -1 : 1) * (1.0 + Math.random() * 0.7);
      }
      const lean = input.axis('left', 'right');
      R.balance += (R.push + lean * 2.4) * dt * 0.5; // one buck alone won't throw him; two the same way will
      if (Math.abs(R.balance) >= 1) {
        this._endRide(true);
        kf.update(dt);
        return;
      }
      // blows from its back
      R.hitCD -= dt;
      if ((input.pressed('attack') || input.pressed('kick')) && R.hitCD <= 0) {
        R.hitCD = RIDE_HIT_CD;
        const dealt = s.takeDamage(RIDE_HIT * (this.power ? 1.4 : 1));
        this._damageNumber(dealt, 'crit', s.root.position);
        this._hitStop(0.05);
        this._addShake(0.25);
        this.sound?.play('punch', { volume: 0.85, rate: 0.9 + Math.random() * 0.1 });
        this.style.add('hit');
        const at = this._tmp.set(0, s.height * 0.62, 0.9).applyMatrix4(s.root.matrixWorld);
        this.arena.burst(at.x, at.z, { color: 0x7ff4ff, count: 16, speed: 2.6, size: 0.18, y: at.y, lift: 1.2, additive: true });
        if (kf.actions.cross) kf.playOnce('cross', { from: 0.95, speed: 1.9, fade: 0.05 });
        R.punchT = 0.32;
        if (!s.alive) {
          this._endRide(false);
          kf.update(dt);
          return;
        }
      }
      if (R.punchT > 0 && (R.punchT -= dt) <= 0) this._rideBase(0.12);
    }
    // a hand comes off it to throw a punch, and goes back
    R.hands += ((R.punchT > 0 ? 0 : 1) - R.hands) * (1 - Math.exp(-16 * dt));
    state.regenStamina(8, dt);
    if (R.t >= RIDE_TIME) this._endRide(false);
    kf.update(dt);
  }

  /**
   * Kai on the stag, posed once it has moved this frame (BodyIK over his
   * standing-easy clip): the leap up onto its back, his hips in an arc and
   * his legs swinging over; astride it, tipped with it as it bucks and leaning
   * with his balance, his legs down its flanks; or the arc down off it beside
   * it, the legs coming back under him as he drops.
   */
  _poseRider() {
    const R = this._ride;
    const k = this.combat;
    const kr = k.root;
    const s = this.stag;
    const ik = this.kaiIK;
    const seat = s.seat(this._rideSeat ||= new THREE.Vector3());
    const frame = s.root.getWorldQuaternion(this._rideQ ||= new THREE.Quaternion());
    const girth = (this._girth ||= (d) => this.stag.girth(d));
    if (R.off) {
      const O = R.off;
      const u = Math.min(1, O.t / RIDE_OFF);
      const e = smooth(0, 1, u);
      kr.quaternion.slerpQuaternions(O.qFrom, O.qTo, e);
      kr.position.lerpVectors(O.from, O.to, e);
      kr.position.y += Math.sin(u * Math.PI) * (O.thrown ? 0.5 : 0.8);
      kr.updateMatrixWorld(true);
      // the straddle let go of as he drops, carried along with him
      const carried = (this._rideArc ||= new THREE.Vector3()).copy(O.seat).add(kr.position).sub(O.from);
      ik?.straddle(carried, O.frame, girth, 1 - smooth(0, 0.75, u), { place: 0, lean: O.lean, hands: 0 });
      if (u >= 1) this._finishRide();
      return;
    }
    if (!ik) {
      kr.quaternion.copy(frame);
      kr.position.copy(seat).y -= 0.95;
      return;
    }
    if (R.t < RIDE_LEAP) {
      // the leap: his hips in an arc from where he stood, up and over onto its back
      const u = R.t / RIDE_LEAP;
      const e = smooth(0, 1, u);
      kr.quaternion.slerpQuaternions(R.qFrom, frame, e);
      const up = (this._rideUp ||= new THREE.Vector3()).set(0, 1, 0).applyQuaternion(frame);
      const arc = (this._rideArc ||= new THREE.Vector3()).copy(R.hipsFrom).addScaledVector(up, -HIP_UP).lerp(seat, e);
      arc.y += Math.sin(u * Math.PI) * 0.9;
      ik.straddle(arc, frame, girth, smooth(0, 0.3, u), { place: 1, hands: smooth(0.5, 1, u), tuck: 1 - smooth(0.45, 1, u) });
    } else {
      kr.quaternion.copy(frame);
      ik.straddle(seat, frame, girth, 1, { lean: R.balance * 0.5, hands: R.hands });
    }
  }

  /** Off its back: thrown (a fall, and it hurts), or he jumps clear when it tires. The drop itself is _poseRider's. */
  _endRide(thrown) {
    const R = this._ride;
    if (!R || R.off) return;
    const k = this.combat;
    const s = this.stag;
    const side = thrown ? Math.sign(R.balance) || 1 : 1;
    // down beside it, on the side he fell (its right is -x in its frame)
    const h = s.heading;
    const to = new THREE.Vector3(s.root.position.x - Math.cos(h) * side * 2.4, 0, s.root.position.z + Math.sin(h) * side * 2.4);
    this.arena.collide(to, 0.4);
    to.y = this.arena.fighterY(to.x, to.z);
    R.off = {
      t: 0, thrown, to,
      from: k.root.position.clone(),
      qFrom: k.root.quaternion.clone(),
      qTo: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, k.heading, 0)),
      seat: s.seat(new THREE.Vector3()),
      frame: s.root.getWorldQuaternion(new THREE.Quaternion()),
      lean: R.balance * 0.5,
    };
    if (s.alive) s.endRide();
    if (thrown) {
      this.state.damage(RIDE_THROWN);
      this._hurtGrace = HURT_GRACE;
      k.onHurt();
      this._addShake(0.4);
      this.hud.popup('THROWN!', '#ff8a5a');
      this.sound?.play('bodyFall', { volume: 0.7 });
      if (!this.state.alive) this._finishRide(); // it was the last of him: down at once, for the fall
      this._checkPlayerDeath(this.state);
    } else this.hud.popup('JUMPED CLEAR', '#7ff4ff');
  }

  /** Off it and on his feet beside it (at the end of the drop, or at once), back in the fight. */
  _finishRide() {
    const R = this._ride;
    if (!R) return;
    if (!R.off) this._endRide(false);
    this._ride = null;
    const k = this.combat;
    k.root.position.copy(R.off.to);
    k.root.rotation.set(0, k.heading, 0);
    k.fighter.visual.rotation.z = 0;
    if (!k.dead) k.fighter.play('idle', { fade: 0.2 });
  }

  /** Where his balance is, as a bar for the HUD: the marker drifts as it bucks. */
  _rideBar() {
    const n = 15;
    const i = Math.round(((this._ride.balance + 1) / 2) * (n - 1));
    let bar = '';
    for (let j = 0; j < n; j++) bar += j === i ? '\u25c6' : j === (n - 1) / 2 ? '|' : '\u2014';
    return `HOLD ON  ${bar}`;
  }

  /** Shot D: the two of them face to face, a few lines each, typed out on screen as they're said. */
  _startTalk() {
    this._shot = 'D';
    this.story.hideCard();
    const b = this.boss;
    b.fighter.visual.position.y = 0; // well off the leap clip by now
    b.root.position.copy(BOSS_LAND);
    b.root.position.y = this.arena.fighterY(BOSS_LAND.x, BOSS_LAND.z);
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
    for (const m of this.squad?.men || []) {
      if (!m.root.visible) continue;
      const mp = m.root.position;
      m.heading += shortestAngle(m.heading, Math.atan2(kp.x - mp.x, kp.z - mp.z)) * (1 - Math.exp(-5 * dt));
      m.root.rotation.y = m.heading;
      m.fighter.update(dt);
    }
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
    // the line: everyone's down it (or the intro was skipped), the pulleys at the bottom
    this._arrivals = null;
    for (const pl of [this._pulley, ...(this._menPulleys || [])]) {
      pl.position.copy(this._ropeB);
      pl.visible = pl === this._pulley;
    }
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
    // act I: his men go in first, while he stands off by the arch and watches
    this.act = this.squad ? 'MEN' : 'BOSS';
    if (this.act === 'MEN') {
      b.watching = true;
      b.root.position.copy(BOSS_WATCH);
      this.squad.arrive(MEN_LAND);
      this.hud.setBossName(MEN_NAME);
      this.hud.versus(WHO.kai.name, MEN_NAME);
      this._barkOnce('menIn');
    } else this.hud.versus(WHO.kai.name, WHO.handler.name);
    this._fightCall = VS_TIME;
    this.sound?.play('handoff', { volume: 0.6 });
    this.letters.spawn('l3-1', LETTER_SPOTS['l3-1']);
    // notes for the player, once FIGHT has been called
    this._fightToasts = [];
    this._fightToasts.push(['SPIRIT SHRINES', 'three spirits wait in the jungle \u00b7 the stag heals you, and wakes again', 5]);
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
      if (Math.hypot(cp.x - bp.x, cp.z - bp.z) < FOREST_SPLASH && !this.combat.dodging && !(this._hurtGrace > 0)) {
        state.damage(FOREST_SPLASH_DAMAGE);
        this._hurtGrace = HURT_GRACE;
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
    if (this.stag && this.stag.state !== 'OFF') this.stag.update(dt); // what's left of it, burning away
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
    this.cine.look.set(bp.x, bp.y + 0.4, bp.z);
    this.cine.rate = 3;
    // if he had the horn, it's lying where it fell: Kai goes and takes it back first
    const waiting = this._hornTaken && !this._pickedUp;
    if (waiting && this.beatT > 1.2) this._updatePickup(dt);
    const P = this._pickup;
    if (waiting && P) {
      // on him while he does it: following him over, then close and low on his right as he gets down to it
      const kp = k.root.position;
      const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
      const near = P.phase !== 'walk';
      const side = near ? 2.3 : 3.4, ahead = near ? 1.1 : -1.8;
      this.cine.pos.set(kp.x - fz * side + fx * ahead, kp.y + (near ? 0.95 : 1.7), kp.z + fx * side + fz * ahead);
      this.cine.look.set(kp.x + fx * 0.35, kp.y + (near ? 0.5 : 1.0), kp.z + fz * 0.35);
    }
    // a breath over him, then last words; then Kai blows the horn, the forest answers, and the card
    if (this.mode === 'EPILOGUE' && !this._epiTalked && !waiting && this.beatT > 2.2) {
      this._epiTalked = true;
      this._converse(this._hornTaken ? [...EPILOGUE_TAKEN, ...EPILOGUE_TALK] : EPILOGUE_TALK, () => this._blowHorn());
    }
    this._tickLine(dt);
    if (this.mode === 'EPILOGUE' && this._endAt && this.beatT > this._endAt) this._showEnd();
    k.fighter.update(dt);
    this._posePickup();
  }

  /**
   * Kai takes the horn back, the way anyone picks a thing up off the ground:
   * he walks over to it (round whatever's in the way, at a jog if it's far),
   * stops with it just ahead of his right foot, squats down over it, takes it
   * in his right hand and stands up with it. The squat and the reach are
   * BodyIK.stoop over his standing-easy pose (_posePickup, after the clip).
   */
  _updatePickup(dt) {
    const k = this.combat;
    const kf = k.fighter;
    const horn = this.keyItem;
    const palm = kf.bone('PalmR');
    if (!horn || !palm || this._hornDrop) return; // still falling
    const P = this._pickup || (this._pickup = { phase: 'walk', t: 0, w: 0, at: new THREE.Vector3(), stand: new THREE.Vector3(), root: new THREE.Vector3(), dir: new THREE.Vector3() });
    P.t += dt;
    const kp = k.root.position;
    if (P.phase === 'walk') {
      const hp = horn.getWorldPosition(P.at);
      const dx = hp.x - kp.x, dz = hp.z - kp.z;
      const dist = Math.max(1e-4, Math.hypot(dx, dz));
      // the way he comes at it, settled once he's close (or the spot to stand on would circle it as he moved)
      if (!P.f || dist > 1.6) P.f = { x: dx / dist, z: dz / dist };
      const fx = P.f.x, fz = P.f.z;
      // where to stand: a step short of it, with it just ahead of his right foot
      const stand = P.stand.set(hp.x - fx * 0.4 + fz * 0.15, 0, hp.z - fz * 0.4 - fx * 0.15);
      const sx = stand.x - kp.x, sz = stand.z - kp.z;
      const togo = Math.hypot(sx, sz);
      if (togo > 0.08 && P.t < 14) {
        const run = togo > 4;
        const dir = togo > 1.2 ? (this._kaiNav ||= new Nav(this.arena, 0.4)).steer(kp, stand, P.dir) : P.dir.set(sx / togo, 0, sz / togo);
        const step = Math.min(togo, (run ? 3.4 : 1.4) * dt);
        kp.x += dir.x * step;
        kp.z += dir.z * step;
        this.arena.collide(kp, 0.4);
        kp.y = this.arena.fighterY(kp.x, kp.z);
        kf.play(run ? 'run' : 'walk', { fade: 0.25 });
        // facing the way he's going, and for the last metre, the horn
        const face = togo > 0.9 ? Math.atan2(dir.x, dir.z) : Math.atan2(fx, fz);
        k.heading += shortestAngle(k.heading, face) * (1 - Math.exp(-8 * dt));
      } else {
        // there: he stands easy, square to it, and gets down to it
        P.phase = 'stoop';
        P.t = 0;
        P.root.copy(kp);
        P.face = Math.atan2(fx, fz);
        if (kf.actions.relax) kf.hold('relax', kf.clipDuration('relax') - 0.01, 0.25);
        else kf.play('idle', { fade: 0.25 });
      }
      k.root.rotation.y = k.heading;
      return;
    }
    // down to it, take it, back up: the squat is laid on afresh every frame, from where he stands
    kp.copy(P.root);
    if (P.phase === 'stoop') {
      k.heading += shortestAngle(k.heading, P.face) * (1 - Math.exp(-10 * dt));
      P.w = smooth(0.15, 0.85, P.t);
      if (!P.held && P.t >= 0.85) {
        // his hand round it
        P.held = true;
        palm.attach(horn);
        this.sound?.play('parry', { volume: 0.35, rate: 0.7 });
      }
      if (P.t >= 1.05) {
        P.phase = 'rise';
        P.t = 0;
      }
    } else if (P.phase === 'rise') {
      P.w = 1 - smooth(0, 0.8, P.t);
      if (P.t >= 0.8) {
        P.phase = 'hold';
        P.t = 0;
      }
    } else {
      P.w = 0;
      if (P.t > 0.4) this._pickedUp = true;
    }
    if (P.held) poseHorn(horn, palm, HORN_HAND, 1 - Math.exp(-9 * dt)); // settling into his grip
    k.root.rotation.y = k.heading;
  }

  /** The squat over the horn, laid over his standing-easy pose once the clip has run this frame. */
  _posePickup() {
    const P = this._pickup;
    if (!P || P.phase === 'walk' || P.w < 0.002 || !this.kaiIK) return;
    const kp = this.combat.root.position;
    this.kaiIK.stoop(P.at, P.w, this.arena.fighterY(kp.x, kp.z));
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
      sub: 'Baba Zwane is down, and the horn is Kai’s to carry home.',
      credits: CREDITS,
      // on to the epilogue: Kai takes it back up the mountain to its stone
      action: { label: 'CONTINUE', key: 'ENTER', onClick: () => this.game.setLevel('epilogue') },
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
      const bp = this._foePos || this.boss.root.position;
      let dist, height, fx, fz, fy;
      let lookY = 1.4;
      if (this.camMode === 'follow') {
        // over Kai's back, looking a couple of metres ahead of him: his left is the screen's left.
        // The mouse tilts it: looking up it drops behind him and lifts its eyes, looking down it rises
        dist = 7.4; height = 2.8 - this.lookPitch * 2.2;
        lookY = 1.4 + this.lookPitch * 3;
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
      this._tmp.set(fx, lookY + fy, fz);
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
    this._loseCard?.destroy();
    this.zones?.dispose();
    this.squad?.dispose();
    this.stag?.dispose();
    if (this.vision) this.vision.dispose();
    if (this.sound) { this.sound.dispose(); this.sound = null; }
    if (this.touch) this.touch.dispose();
    if (this.input) this.input.ignored.delete('mouse0');
    this.game?.renderer?.domElement.removeEventListener('click', this._onFightClick);
    if (document.pointerLockElement && document.pointerLockElement === this.game?.renderer?.domElement) document.exitPointerLock();
    // skinned meshes own a bone texture that disposeObject() does not free
    this.root.traverse((o) => {
      if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose();
    });
    if (this.hud) this.hud.dispose();
    if (this.story) this.story.dispose();
    if (this.letters) this.letters.dispose();
    if (this.gifts) this.gifts.dispose();
    if (this.state && this._baseMaxHealth) {
      // other levels see the normal max
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
