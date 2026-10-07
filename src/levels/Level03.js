import * as THREE from 'three';
import { Level } from '../core/Level.js';
import { CombatController } from './level3/CombatController.js';
import { HandlerBoss } from './level3/HandlerBoss.js';
import { ShrineArena, WALK_R } from './level3/ShrineArena.js';
import { LetterDrops } from './level3/Letters.js';
import { ShrineGifts } from './level3/Awards.js';
import { WaterFX, Wetness } from './level3/Wetness.js';
import { Wreck } from './level3/Wreck.js';
import { FightHUD } from '../ui/FightHUD.js';
import { TouchControls } from '../ui/TouchControls.js';
import { StoryOverlay } from '../ui/StoryOverlay.js';

/**
 * Level 03 — FIGHT, "Site 7".
 *
 * The shrine courtyard by the waterfall, golden hour. Same split Level02 uses:
 * CombatController and HandlerBoss own their own logic and never touch each
 * other, ShrineArena owns the world, and this file is the only place that
 * reads all of them — it resolves hits/parries/dodges, runs the story beats,
 * and publishes to the shared GameState (health, stamina, phase, handlerState,
 * handlerHelmetOff, letters, timeScale).
 *
 * Beats (docs/JUNGLE_SHRINE_IMPLEMENTATION.md, section 6):
 *   INTRO     Kai wakes in the pool among his car's wreckage (level3/Wreck.js),
 *             wades out and gets the water off (level3/DustOff.js), runs
 *             through the gate dripping; the Handler jumps down off the arch
 *             behind him, and they trade a few lines, typed out on screen,
 *             before it starts. Skippable; skipped on restarts. He stays soaked
 *             into the fight and dries over ~40 s (level3/Wetness.js).
 *   FIGHT     three health-gated phases. Phase II pops the helmet (REVEAL:
 *             a slow-mo reaction shot over Kai's shoulder); phase III turns the
 *             sky to dusk, lights the torches and runs the pool red. The fight
 *             isn't penned in: Kai can break for the jungle ring, where three
 *             shrines each give one gift (Awards.js), with the Handler after him.
 *   EPILOGUE  the camera circles the fallen Handler, then a plain VICTORY card
 *             ("You won") with PLAY AGAIN. No story text after the win.
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
const WHO = {
  handler: { name: 'THE HANDLER', color: '#f2934f' },
  kai: { name: 'KAI', color: '#6fe3ff' },
};
const TALK = [
  { who: 'handler', text: 'Twelve kilometres. A river. A waterfall. And you’re still holding it.' },
  { who: 'kai', text: 'You ran me off a bridge. What did you think would happen?' },
  { who: 'handler', text: 'Give me the Key, Kai. You don’t even know what it opens.', pose: 'angry' },
  { who: 'kai', text: 'Then I guess I’ll find out.' },
  { who: 'handler', text: 'Not today.' },
];
const TALK_AFTER = 1.6; // shot D starts this long after he lands
const LETTER_SPOTS = {
  'l3-1': new THREE.Vector3(-9.6, 0, -3.6), // in the courtyard from the start
  'l3-3': new THREE.Vector3(-3.2, 0, -10.2), // the shrine gives it up at dusk
};
/** What the Strategy gift tells you about each of the Handler's attacks. */
const TELLS = {
  lunge: { name: 'LUNGE', advice: 'dodge sideways or block', color: '#ff9a4a' },
  sweep: { name: 'SWEEP', advice: 'dodge out \u2014 a block only halves it', color: '#ff5a6a' },
  combo: { name: 'COMBO', advice: 'two hits: block or parry both', color: '#c78bff' },
};
const CREDITS =
  'Ruins, nature and characters: Quaternius (CC0) · Textures: ambientCG (CC0) · ' +
  'Props: Poly by Google (CC0) · Car parts: Kenney (CC0) · ' +
  'Steering wheel: Poly by Google (CC-BY 3.0, via Poly Pizza) · Built with three.js';

let introSeen = false; // restarts skip straight to the fight

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

    this.mode = 'LOADING'; // INTRO | FIGHT | REVEAL | EPILOGUE | END
    this.beatT = 0; // seconds into the current beat (real time, not slowed)
    this.cine = null; // { pos, look, fov, rate } while a cutscene owns the camera
  }

  async init(scene, assets, input, state) {
    super.init(scene, assets, input, state);

    this.arena = new ShrineArena(this.root, scene);
    this.wreck = new Wreck(this.root, this.arena); // his car, washed over the falls with him
    const [kai, handler] = await Promise.all([
      this._loadFighter(assets, 'kai-bryce', 'kai.fbx'),
      this._loadFighter(assets, 'handler-monk', 'handler.fbx'),
      this.arena.build(assets),
      this.wreck.build(assets),
    ]);
    if (!this.scene) return; // level was torn down while loading

    this.kaiMeta = kai.meta;
    this.handlerMeta = handler.meta;
    this.combat = new CombatController(this.root, kai.source, kai.meta);
    this.boss = new HandlerBoss(this.root, this.combat, handler.source, handler.meta);
    this.combat.arenaLimit = this.boss.arenaLimit = WALK_R; // ShrineArena.collide() does the real fencing
    this.keyItem = this._attachKey(this.combat.fighter);
    this._wireBoss(state);
    // Kai comes out of the pool soaked; either of them gets soaked again wading back in
    this.water = new WaterFX(this.root, this.arena);
    this.kaiWet = new Wetness(this.combat.fighter, this.water, { autoShake: true });
    this.bossWet = new Wetness(this.boss.fighter, this.water);
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
      this.story.showLetter(`DEAD DROP ${id.toUpperCase()}  ·  ${found} / 9 FOUND`, text);
    });

    this.hud = new FightHUD();
    this.touch = new TouchControls(input, {
      canvas: this.game.renderer.domElement,
      onToggleView: () => this._toggleView(),
    });
    this._applyCamMode(true);
    this.story = new StoryOverlay();
    this.story.onSkip = () => this._skip();
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
   * A fighter: the Mixamo build (assets/characters/<name>.glb + .json, from
   * tools/build-character.py: Kai is Bryce, the Handler the shrine monk) with
   * real fight moves, or the old Quaternius model (`fallback`) if it hasn't
   * been built. meta is the build's measurements of each move.
   */
  async _loadFighter(assets, name, fallback) {
    try {
      const [gltf, meta] = await Promise.all([
        assets.model(`characters/${name}.glb`),
        fetch(assets.resolve(`characters/${name}.json`)).then((r) => {
          if (!r.ok) throw new Error(`${name}.json: ${r.status}`);
          return r.json();
        }),
      ]);
      gltf.scene.animations = gltf.animations;
      return { source: gltf.scene, meta };
    } catch (e) {
      console.warn(`[level03] no ${name} build, using the Quaternius ${fallback}:`, e?.message || e);
      return { source: await safe(assets.fbx(`characters/${fallback}`)), meta: null };
    }
  }

  /** The Key: a shielded drive glowing cyan in Kai's right hand, in every level. */
  _attachKey(fighter) {
    const palm = fighter.bone('PalmR');
    if (!palm) return null;
    fighter.root.updateMatrixWorld(true);
    const s = palm.getWorldScale(new THREE.Vector3()).x;
    const key = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.12, 0.025),
      new THREE.MeshStandardMaterial({ color: 0x141c26, emissive: 0x2fd8ff, emissiveIntensity: 2.4, metalness: 0.6, roughness: 0.3 }),
    );
    key.scale.setScalar(1 / s);
    key.position.set(0, 0.07 / s, 0.02 / s);
    palm.add(key);
    return key;
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
        hud().popup('DODGE', '#8fe8ff');
        return 'dodged';
      }
      if (c.parryReady()) {
        state.stamina = Math.min(state.maxStamina, state.stamina + 25);
        this._hitStop(0.09);
        this._addShake(0.4);
        hud().popup('PARRY!', '#ffe066');
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
        this._checkPlayerDeath(state);
        return 'blocked';
      }
      state.damage(info.damage);
      c.onHurt();
      this._hitStop(0.035);
      this._addShake(0.32);
      hud().damageFlash();
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
      this._startReveal();
    };
    this.boss.onPhaseChange = (n) => {
      if (n > 2) {
        hud().popup('DESPERATION', '#ff5a3a');
        this.arena.setDuskTarget(1); // the sun goes down on Site 7
        this.letters.spawn('l3-3', LETTER_SPOTS['l3-3']);
      } else if (n === 2) hud().popup('PHASE 2', '#ff8a4a');
    };
    this.boss.onDefeated = () => {
      this._hitStop(0.2);
      this._addShake(0.5);
      this._endTimer = 1.6;
      this._endKind = 'win';
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
    // dt arrives already slowed by state.timeScale; cutscenes and the camera run on real time
    const real = dt / Math.max(state.timeScale, 0.05);
    this.time += real;
    this.beatT += real;
    const input = this.input;

    if (input.pressed('skip') && (this.mode === 'INTRO' || this.mode === 'EPILOGUE')) {
      if (this._shot === 'D') this._nextLine(true); // mid-conversation, space or a click moves it on a line
      else this._skip();
    }

    if (this.mode === 'INTRO') this._updateIntro(dt);
    else if (this.mode === 'EPILOGUE' || this.mode === 'END') this._updateEpilogue(dt);
    else this._updateFight(dt, real, state);

    // dripping, prints, splashes; left idle in the fight, a soaked Kai shakes himself off
    const idle = this.mode === 'FIGHT' && !this._ended ? this.combat.still : null;
    this.kaiWet.update(dt, { still: idle });
    if (this.boss.root.visible) this.bossWet.update(dt);
    this.wreck.update(dt, this.time, this.water);
    this.water.update(dt);

    this._updateCamera(real);
    this._updatePointer();
    this.arena.updateOcclusion(real, this.game.camera.position, this._camLook, this.combat.root.position);
    this.arena.update(dt, this.time, this.game.camera);
    const fighting = this.mode === 'FIGHT' || this.mode === 'REVEAL';
    const kp = this.combat.root.position;
    this.letters.update(dt, this.time, fighting ? kp : null);
    this.gifts.update(dt, this.time, fighting && !this.combat.dead ? kp : null);
    if (fighting) {
      const bp = this.boss.root.position;
      this.arena.setFocus((kp.x + bp.x) / 2, (kp.z + bp.z) / 2);
    } else this.arena.setFocus(kp.x, kp.z);
    if (this.keyItem) {
      this.keyItem.material.emissiveIntensity = this.combat.abilityActive ? 5 + Math.sin(this.time * 18) * 1.5 : 2.4;
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
    this.combat.update(dt, controls, state, { camYaw: this.camYaw, lockOn: this.lockOn, targetPos: bp, steer: this.camMode === 'follow' });

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
          this.boss.root.position.addScaledVector(this._toBoss, (fin ? 0.9 : 0.3) * (this.power ? 1.4 : 1));
          if (this.power) {
            this.arena.burst(bp.x - this._toBoss.x * 0.4, bp.z - this._toBoss.z * 0.4, {
              color: 0xffb347, count: fin ? 30 : 16, speed: fin ? 3.4 : 2.4, size: 0.2, y: bp.y + 1.1, lift: 1.4, additive: true,
            });
          }
          this._hitStop(fin ? 0.06 : 0.03);
          this._addShake(fin ? 0.28 : 0.1);
          if (this.boss.vulnerable) this.hud.popup('CRITICAL', '#ffd23a');
        }
      }
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
    if (this.mode === 'REVEAL') {
      for (const m of this.boss.fighter.materials) {
        m.emissive.copy(m.userData.baseEmissive);
        m.emissiveIntensity = 1;
      }
    }

    // the Key: popup on activation
    if (this.combat.abilityActive && !this._abilityWas) this.hud.popup('THE KEY', '#7fd8ff');
    this._abilityWas = this.combat.abilityActive;

    if (this.mode === 'REVEAL') this._updateReveal();

    // time scale: hit-stop beats the reveal's slow-mo beats the Key's slow-mo beats normal
    state.timeScale = performance.now() < this._hitStopUntil ? 0.12
      : this.mode === 'REVEAL' ? 0.45
      : this.combat.abilityActive ? 0.35 : 1;

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
    this.hud.showBanner('DEFEATED', 'The Handler stands over you. The Key is still in your hand.', null, {
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
    else if (this.mode === 'EPILOGUE') this._showEnd();
  }

  _startIntro() {
    this._enterBeat('INTRO');
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
    const t = this.beatT < A_END ? this.beatT : this.beatT - SHAKE_BEAT;
    const k = this.combat;
    const kf = k.fighter;
    const a = this.arena.anchors;
    const kp = k.root.position;

    if (this.beatT < A_END) {
      // ---- A: the wake-up
      if (this._shot !== 'A') {
        this._shot = 'A';
        this._setCine(new THREE.Vector3(-3.25, 1.0, -17.7), new THREE.Vector3(-4.5, 0.55, -21.0), { fov: 50, cut: true });
        this.story.showCard('SITE 7', 'The current carried him over the falls.');
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
        }
        kp.x += Math.sin(k.heading) * 1.35 * dt;
        kp.z += Math.cos(k.heading) * 1.35 * dt;
        kp.y = this.arena.groundHeight(kp.x, kp.z);
      } else {
        // out on the path: stop, stand easy (not in his fighting stance), and get the water off:
        // shake the head, wipe the face and hair back, shake the hands out
        if (this._pose !== 'shake') {
          this._pose = 'shake';
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
    } else {
      // ---- C: he jumps down off the arch and lands behind Kai
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
      }
      if (air >= 1 && !this._landed) {
        this._landed = true;
        if (!lp) bf.play('idle', { fade: 0.2 }); // the real leap rises out of its own landing
        this._addShake(0.75);
        this.arena.burst(BOSS_LAND.x, BOSS_LAND.z);
        this.story.showCard('THE HANDLER', 'He never slows down.');
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
    this.story.setSkipLabel('SPACE: NEXT LINE · CLICK HERE: SKIP');
    const b = this.boss;
    b.fighter.visual.position.y = 0; // well off the leap clip by now
    b.root.position.copy(BOSS_LAND);
    b.root.position.y = this._leapAt.landY;
    this._line = -1;
    this._nextLine();
  }

  /** On to the next line (the player pressing on while one is still typing just finishes it); after the last, fight. */
  _nextLine(player = false) {
    if (player && !this.story.lineDone) {
      this.story.finishLine();
      return;
    }
    this._line++;
    const line = TALK[this._line];
    if (!line) {
      this._startFight();
      return;
    }
    this._lineT = 0;
    this._lineHold = 0;
    const who = WHO[line.who];
    this.story.showLine(who.name, line.text, who.color);
    const bf = this.boss.fighter;
    if (line.pose && bf.actions[line.pose]) bf.playOnce(line.pose, { fade: 0.25 });
    const prev = TALK[this._line - 1];
    this._talkShot(line.who, !prev || prev.who !== line.who);
  }

  _updateTalk(dt) {
    const line = TALK[this._line];
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
    this._lineT += dt;
    this.cine.fov = 14 - Math.min(1, this._lineT / 4) * 1.6;
    if (this.story.updateLine(dt)) {
      this._lineHold += dt;
      if (this._lineHold > 0.9 + line.text.length * 0.028) this._nextLine();
    }
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
    this._muteInput = true;
    this.cine = null;
    this.story.setCinematic(false);
    this.story.hideCard();
    this.story.hideLine();
    this.story.setSkipLabel();
    this.hud.setVisible(true);
    this.touch.setVisible(true);

    const k = this.combat;
    const b = this.boss;
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
    b.restFor = 0.9;
    this.camYaw = k.heading;
    this.hud.popup('FIGHT', '#ffd9a8');
    this.letters.spawn('l3-1', LETTER_SPOTS['l3-1']);
    const left = this.gifts.remaining;
    if (left > 0) this.hud.toast('SHRINES', `${left} gift${left > 1 ? 's glow' : ' glows'} in the jungle \u00b7 each can be taken once`, 5);
  }

  /** Phase II: the helmet comes off. A slow-mo look at his face over Kai's shoulder. */
  _startReveal() {
    this._enterBeat('REVEAL');
    this._cutNext = true;
    this.story.setCinematic(true, false);
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

  _updateReveal() {
    const kp = this.combat.root.position;
    const bp = this.boss.root.position;
    const d = this._tmp.set(kp.x - bp.x, 0, kp.z - bp.z).normalize();
    const right = new THREE.Vector3(d.z, 0, -d.x);
    const pos = kp.clone().addScaledVector(d, 1.5).addScaledVector(right, 0.8).setY(kp.y + 1.75);
    const look = new THREE.Vector3(bp.x, bp.y + 1.62, bp.z);
    this._setCine(pos, look, { fov: 30, rate: 8, cut: this._cutNext });
    this._cutNext = false;
    if (this.boss.state !== 'TRANSITION' || this.beatT > 2.8) {
      this._enterBeat('FIGHT');
      this.cine = null;
      this.story.setCinematic(false);
      this.hud.setVisible(true);
      this.touch.setVisible(true);
    }
  }

  _startEpilogue() {
    this._enterBeat('EPILOGUE');
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
      k.fighter.play('idle', { fade: 0.3 });
      k.fighter.setGuard(false);
      this._setCine(new THREE.Vector3(bp.x + 3.4, bp.y + 1.5, bp.z + 2.6), new THREE.Vector3(bp.x, bp.y + 0.4, bp.z), { fov: 45, cut: true });
    }
    const s = this.time - this._orbitFrom;
    const a = 0.65 + s * 0.18;
    this.cine.pos.set(bp.x + Math.cos(a) * 3.8, bp.y + 1.4 + Math.min(s, 6) * 0.12, bp.z + Math.sin(a) * 3.8);
    this.cine.rate = 3;
    if (this.mode === 'EPILOGUE' && this.beatT > 3) this._showEnd();
    k.fighter.update(dt);
  }

  _showEnd() {
    this._enterBeat('END');
    this._shot = 'E0'; // keep the same slow circle going behind the card
    this.story.setCinematic(false);
    this.story.showEnd({
      title: 'VICTORY',
      sub: 'You won. The Handler is down.',
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

  teardown() {
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
