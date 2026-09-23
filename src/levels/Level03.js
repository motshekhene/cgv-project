import * as THREE from "three";
import { Level } from "../core/Level.js";
import { makeEnvMap } from "./level3/materials.js";
import { loadCharacter } from "./level3/characters.js";
import { Arena, ARENA_CENTER } from "./level3/Arena.js";
import { PlayerCombat } from "./level3/PlayerCombat.js";
import { HandlerBoss } from "./level3/HandlerBoss.js";
import { Effects } from "./level3/Effects.js";
import { Hud } from "./level3/Hud.js";

/**
 * Level 03 — DEEPHOLD. The chase inverts: you stop running, turn around,
 * and put him down.
 *
 * This file is the director, not the game: it owns the camera, the pacing
 * (intro -> walk -> boss intro -> fight -> uplink -> epilogue), the Key's
 * slow-mo pulse, hit-stop, and the win/lose flow. Everything else lives
 * in ./level3/ — arena, player, boss, effects, hud — all of it under
 * this.root so teardown stays one call.
 */

const EPILOGUE = (letters) => [
  { main: "UPLOAD COMPLETE", sub: "the key is public — BLACKOUT is worthless" },
  { main: "YOU KNOW THE FACE", sub: "the man who signed you on — the man who came to bury it" },
  {
    main: `SIGNALS RECOVERED — ${letters} / 3`,
    sub: letters >= 3 ? "the lore terminal unlocks — the true ending" : "find the letters, find the whole story",
  },
  { main: "ELEVEN MORE KEYS", sub: "eleven more of you" },
  { main: "BLACKOUT PROTOCOL", sub: "level 03 — deephold — complete", hint: "thank you for playing" },
];

export class Level03 extends Level {
  constructor() {
    super("level03");
  }

  async init(scene, assets, input, state) {
    super.init(scene, assets, input, state);

    scene.background = new THREE.Color(0x050302);
    scene.fog = new THREE.FogExp2(0x0d0705, 0.026);

    this._baseFov = this.game.camera.fov;

    // image-based light: warm below, cold above — sells "lit by lava"
    this._envRT = makeEnvMap(this.game.renderer);
    scene.environment = this._envRT.texture;
    scene.environmentIntensity = 0.5;

    // systems
    this.effects = new Effects(this.root);
    const kit = await assets.model("level03/model.glb");
    this.arena = new Arena(this.root, kit, this.effects);

    const kaiRig = await loadCharacter(assets, "kai");
    this.root.add(kaiRig.group);
    this.player = new PlayerCombat(this.root, kaiRig, this.effects);

    const handlerRig = await loadCharacter(assets, "handler");
    this.root.add(handlerRig.group);
    this.boss = new HandlerBoss(this.root, handlerRig, this.effects);
    this.boss.rig.group.visible = false; // he arrives when you reach the arena

    this.hud = new Hud();

    // combat wiring — the level mediates every hit
    this.player.onAttack = (kind) => this._resolvePlayerAttack(kind);
    this.player.onParry = () => {
      this.hitStop = 0.09;
    };
    this.player.onDeath = () => this._onPlayerDeath();
    this.boss.onPlayerHit = (dmg, from, kind) => this._resolveBossHit(dmg, from, kind);
    this.boss.onPhaseChange = (n) => this._onPhaseChange(n);
    this.boss.onDeath = () => this._onBossDeath();

    // director + timing state
    this.director = "intro";
    this.directorT = 0;
    this.time = 0;
    this.hitStop = 0;
    this.slowmoT = 0;
    this.abilityCd = 0;
    this.upload = 0;
    this.epilogueIndex = -1;
    this.collapseTimer = -1;

    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._look = new THREE.Vector3(0, 1.4, 6);
    this._mid = new THREE.Vector3();
    this._shakeOff = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);

    this.hud.setControls(
      "<b>WASD</b> move &nbsp;·&nbsp; <b>SPACE</b> dodge &nbsp;·&nbsp; <b>LMB</b> tap / hold — light / heavy<br>" +
        "<b>RMB</b> block — <i>parry the first instant</i><br>" +
        "<b>E</b> vent steam &nbsp;·&nbsp; <b>Q</b> the Key &nbsp;·&nbsp; <b>MMB</b> scan &nbsp;·&nbsp; <b>R</b> restart",
      { fadeAfter: 16 },
    );
    this.hud.showTitle("DEEPHOLD", "shaft 7 — nine hundred metres down", "", 3400);
  }

  /* ------------------------------------------------------------------ */

  update(dt, state) {
    const ts = state.timeScale ?? 1;
    const realDt = dt / ts;
    this.time += realDt;
    this.directorT += realDt;

    // slow-mo pulse bookkeeping (real time)
    this.abilityCd = Math.max(0, this.abilityCd - realDt);
    if (this.slowmoT > 0) {
      this.slowmoT -= realDt;
      if (this.slowmoT <= 0 && this.director !== "death") state.timeScale = 1;
    }

    // hit-stop — the world hitches for a breath on solid hits
    if (this.hitStop > 0) this.hitStop -= realDt;
    const combatScale = this.hitStop > 0 ? 0.06 : 1;
    const playerDt =
      dt * (this.slowmoT > 0 ? 0.8 / ts : 1) * combatScale;

    const input = this.input;
    const cam = this.game.camera;
    cam.getWorldDirection(this._fwd);
    this._fwd.y = 0;
    this._fwd.normalize();
    this._right.crossVectors(this._fwd, this._up);

    // camera basis feeds movement so WASD is always screen-relative
    const ctx = {
      input,
      state,
      moveFwd: this._fwd,
      moveRight: this._right,
      fightActive: this.director === "fight",
      bossPos: this.boss.rig.group.visible ? this.boss.pos : null,
      time: this.time,
    };

    switch (this.director) {
      case "intro":
        this.player.rig.update(dt);
        if (this.directorT >= 3) {
          this.director = "walk";
          this.directorT = 0;
        }
        break;

      case "walk":
        this.player.update(dt * combatScale, ctx);
        if (this.player.pos.z < -21.5) {
          this.arena.sealGate();
          this.director = "bossintro";
          this.directorT = 0;
          this.boss.rig.group.visible = true;
          this.boss.spawn();
          this.hud.showTitle("THE HANDLER", "this time he is in front of you", "", 2800);
        }
        break;

      case "bossintro":
        // he walks out of the dark by the uplink — no cutscene, just him
        this._dir.subVectors(this._mid.set(0, 0, -44), this.boss.pos).setY(0);
        if (this._dir.length() > 0.1) {
          this.boss.pos.addScaledVector(this._dir.normalize(), 2.1 * dt);
          this.boss.facing = Math.atan2(this._dir.x, this._dir.z);
        }
        this.boss.rig.group.rotation.y = this.boss.facing;
        this.boss.rig.play("walk");
        this.boss.rig.update(dt);
        this.player.rig.play("idle");
        this.player.rig.update(dt);
        if (this.directorT >= 2.6) {
          this.director = "fight";
          this.directorT = 0;
          this.boss.state = "pursue";
          this.boss.t = 0;
        }
        break;

      case "fight":
        this._fightInput(input, state);
        this.player.update(playerDt, ctx);
        this.boss.update(dt * combatScale, {
          state,
          player: this.player,
          arena: this.arena,
        });
        this.boss.updateHelmet(dt);

        // phase 3 eats the arena on a timer
        if (this.collapseTimer > 0) {
          this.collapseTimer -= dt;
          if (this.collapseTimer <= 0) {
            this.arena.collapseNextWedge();
            this.collapseTimer = 5.5;
          }
        }
        break;

      case "victory":
        this.player.update(dt * combatScale, { ...ctx, fightActive: false, bossPos: null });
        this.boss.update(dt, { state, player: this.player, arena: this.arena }); // dying path only
        this._updateUpload(input, state, dt);
        break;

      case "epilogue":
        this._advanceEpilogue(this.input);
        this.player.rig.update(dt);
        this.arena.update(dt, {});
        this.effects.update(dt);
        this._updateCamera(dt, state);
        this.hud.update(state, {
          bossVisible: false,
          abilityCooldown: this.abilityCd / 10,
          abilityReady: false,
          upload: null,
        });
        return; // epilogue stops here — nothing left to simulate

      case "end":
        this.player.rig.update(dt);
        this.arena.update(dt, {});
        this.effects.update(dt);
        this._updateCamera(dt, state);
        this.hud.update(state, {
          bossVisible: false,
          abilityCooldown: this.abilityCd / 10,
          abilityReady: false,
          upload: null,
        });
        return; // epilogue stops here — nothing left to simulate

      case "death":
        this.player.rig.update(dt);
        this.effects.update(dt);
        this.arena.update(dt, {});
        this._updateCamera(dt, state);
        this.hud.update(state, { bossVisible: true, abilityCooldown: 1, abilityReady: false, upload: null });
        return;
    }

    // hazards — the arena fights both of you
    const hz = this.arena.hazards(this.player.pos, playerDt);
    if (hz & 1) state.damage(Math.round(42 * playerDt)); // lava
    if (hz & 2) state.damage(Math.round(22 * playerDt)); // collapsed floor

    // letters
    const letter = this.arena.tryPickup(this.player.pos);
    if (letter) {
      state.collectLetter(letter.id);
      state.heal(20);
      this.hud.letterCard(letter.text);
    }

    // distance into the mine, for the shared HUD
    state.distance = Math.max(state.distance, 10.5 - this.player.pos.z);

    this.arena.update(dt, { onBlast: (pos, byPlayer) => this._onVentBlast(pos, byPlayer) });
    this.effects.update(dt);
    this._updateCamera(dt, state);

    this.hud.update(state, {
      bossVisible: this.director === "fight" || this.director === "death",
      abilityCooldown: this.abilityCd / 10,
      abilityReady:
        this.abilityCd <= 0 && this.slowmoT <= 0 && state.stamina >= 35,
      upload: this.director === "victory" ? this.upload : null,
    });
  }

  /* ------------------------------------------------------------------ *
   * fight-only input: the Key's slow-mo and the vent trigger
   * ------------------------------------------------------------------ */

  _fightInput(input, state) {
    if (input.pressed("ability") && this.abilityCd <= 0 && this.slowmoT <= 0) {
      if (state.spendStamina(35)) {
        this.slowmoT = 2.2;
        state.timeScale = 0.35;
        this.abilityCd = 10;
        this.effects.addTrauma(0.12);
        this.effects.spawnRing(this.player.pos, {
          maxR: 3.2,
          dur: 0.6,
          color: 0x66e0ff,
        });
      }
    }

    if (input.pressed("interact")) {
      const idx = this.arena.ventNear(this.player.pos);
      if (idx >= 0 && this.arena.triggerVent(idx, true)) {
        this.hud.letterCard("Vent pressure released.");
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * combat mediation
   * ------------------------------------------------------------------ */

  _resolvePlayerAttack(kind) {
    if (!this.boss.rig.group.visible || !this.boss.alive) return;
    const spec = this.player.attackSpec(kind);
    const p = this.player.pos;
    const b = this.boss.pos;

    this._desired.set(b.x - p.x, 0, b.z - p.z);
    const dist = this._desired.length();
    if (dist < 0.001) return;
    this._desired.divideScalar(dist);
    this.player.forward(this._right);
    if (dist < spec.reach + 0.85 && this._desired.dot(this._right) > Math.cos(spec.arc)) {
      const riposte = this.player.riposteActive(this.time);
      this.boss.takeHit(spec.dmg, kind === "heavy", p, riposte);
      this.hitStop = kind === "heavy" ? 0.07 : 0.045;
      this.effects.addTrauma(kind === "heavy" ? 0.16 : 0.09);
    }
  }

  _resolveBossHit(dmg, fromPos, kind) {
    const res = this.player.takeHit(dmg, fromPos, kind, this.time);
    if (res === "parried") {
      this.boss.stagger(2.4);
      this.hitStop = 0.09;
    } else if (res === "hit") {
      this.hitStop = 0.05;
    }
  }

  _onVentBlast(pos) {
    const pd = Math.hypot(
      this.player.pos.x - pos.x,
      this.player.pos.z - pos.z,
    );
    if (pd < 2.3) {
      this.player.takeHit(22, pos, "vent", this.time);
    }
    if (this.boss.rig.group.visible && this.boss.alive) {
      const bd = Math.hypot(this.boss.pos.x - pos.x, this.boss.pos.z - pos.z);
      if (bd < 2.7) {
        this.boss.takeHit(30, false, pos);
        this.boss.stagger(1.6);
      }
    }
  }

  _onPhaseChange(n) {
    if (n === 2) {
      this.hud.showTitle(
        "THE HELMET COMES OFF",
        "you know the face that signed you on",
        "",
        4200,
      );
    } else if (n === 3) {
      this.hud.showTitle("DESPERATION", "the floor is going — finish it", "", 4000);
      this.collapseTimer = 4;
    }
  }

  _onPlayerDeath() {
    this.director = "death";
    this.directorT = 0;
    this.state.timeScale = 0.45;
    this.effects.addTrauma(0.5);
    this.hud.showOverlay("HE CAUGHT YOU", "or the mine did — press R to go again");
  }

  _onBossDeath() {
    this.director = "victory";
    this.directorT = 0;
    this.upload = 0;
    this.collapseTimer = -1;
    this.slowmoT = 1.4; // a beat of glory in slow motion, then real time
    this.player.playVictory();
    this.hud.showTitle("HE'S DOWN", "", "get to the uplink — hold E", 5000);
  }

  /* ------------------------------------------------------------------ *
   * the uplink — hold E, watch the beam pay off
   * ------------------------------------------------------------------ */

  _updateUpload(input, state, dt) {
    const uplink = this.arena.uplink.pos;
    const d = Math.hypot(this.player.pos.x - uplink.x, this.player.pos.z - uplink.z);
    const holding = d < 2.9 && input.isDown("interact");

    if (holding) {
      this.upload = Math.min(1, this.upload + dt / 3);
    } else {
      this.upload = Math.max(0, this.upload - dt * 0.4);
    }

    this.arena.beamMat.uniforms.uIntensity.value = 0.35 + this.upload * 1.7;
    this.arena.uplinkGlow.scale.setScalar(1.6 + this.upload * 1.4);
    this.effects.addTrauma(this.upload > 0 && this.upload < 1 ? 0.006 : 0);

    if (this.upload >= 1) {
      this.director = "epilogue";
      this.epilogueIndex = 0;
      this._showEpilogueCard();
    }
  }

  _showEpilogueCard() {
    const cards = EPILOGUE(this.state.lettersInLevel("level03"));
    const card = cards[this.epilogueIndex];
    this.hud.showTitle(card.main, card.sub, card.hint || "press SPACE to continue", 0);
  }

  _advanceEpilogue(input) {
    if (
      !input.pressed("jump") &&
      !input.pressed("dodge") &&
      !input.pressed("interact")
    ) {
      return;
    }
    const cards = EPILOGUE(this.state.lettersInLevel("level03"));
    this.epilogueIndex++;
    if (this.epilogueIndex >= cards.length) {
      this.hud.hideTitle();
      this.hud.showOverlay("BLACKOUT PROTOCOL", "level 03 — deephold — complete");
      this.finished = true;
      this.director = "end";
    } else {
      this._showEpilogueCard();
    }
  }

  /* ------------------------------------------------------------------ *
   * camera — one rig per mood, all smoothing through the same lerps
   * ------------------------------------------------------------------ */

  _updateCamera(dt, state) {
    const cam = this.game.camera;
    const p = this.player.pos;
    const lerpK = 1 - Math.exp(-5.5 * dt);

    switch (this.director) {
      case "intro": {
        const t = Math.min(1, this.directorT / 3);
        const a = THREE.MathUtils.lerp(2.35, 0.85, t * t * (3 - 2 * t));
        this._desired.set(p.x + Math.sin(a) * 7.5, 3.6 - t * 0.7, p.z + Math.cos(a) * 7.5);
        this._look.set(p.x, 1.4, p.z - 2);
        cam.position.lerp(this._desired, lerpK);
        break;
      }

      case "walk": {
        this._desired.set(p.x * 0.6, 3.0, p.z + 7.2);
        this._look.set(p.x * 0.75, 1.5, p.z - 5);
        cam.position.lerp(this._desired, lerpK);
        break;
      }

      case "bossintro": {
        this._desired.set(p.x * 0.4, 2.0, -31);
        this._look.set(0, 1.7, -49);
        cam.position.lerp(this._desired, lerpK);
        break;
      }

      case "fight": {
        // lock-on framing: over Kai's shoulder, both fighters in frame
        const b = this.boss.pos;
        this._desired.set(p.x - b.x, 0, p.z - b.z);
        const dist = this._desired.length() || 1;
        this._desired.divideScalar(-dist); // from boss toward player
        const pull = dist < 3.4 ? 7.4 : 5.9;
        this._desired.multiplyScalar(pull).add(p);
        this._desired.y = 3.05;
        this._mid.copy(p).lerp(b, 0.42);
        this._look.set(this._mid.x, this._mid.y + 1.25, this._mid.z);
        cam.position.lerp(this._desired, lerpK);

        // scan view — hold MMB for the first-person read on him
        if (this.input.down.has("mouse1")) {
          this.player.forward(this._fwd);
          this._desired.set(p.x, p.y + 1.58, p.z).addScaledVector(this._fwd, 0.34);
          cam.position.lerp(this._desired, 1 - Math.exp(-14 * dt));
          this.boss.chest(this._look);
          cam.fov = THREE.MathUtils.lerp(cam.fov, 34, 1 - Math.exp(-8 * dt));
        } else if (cam.fov !== this._baseFov) {
          cam.fov = THREE.MathUtils.lerp(cam.fov, this._baseFov, 1 - Math.exp(-8 * dt));
        }
        cam.updateProjectionMatrix();
        break;
      }

      case "victory": {
        const a = this.time * 0.22;
        this._desired.set(p.x + Math.sin(a) * 6.5, 3.3, p.z + Math.cos(a) * 6.5);
        this._look.set(p.x, 1.5, p.z - 2);
        cam.position.lerp(this._desired, lerpK * 0.6);
        break;
      }

      case "epilogue":
      case "end": {
        const a = this.time * 0.05;
        this._desired.set(2.8 + Math.sin(a) * 1.2, 4.6, -46.5);
        this._look.set(0, 3.2, -51.5);
        cam.position.lerp(this._desired, lerpK * 0.4);
        break;
      }

      case "death": {
        // hold where it was — the shake does the talking
        break;
      }
    }

    cam.lookAt(this._look);

    // shake lands after framing so it never fights the lock-on
    this.effects.shake.getOffset(this._shakeOff);
    cam.position.add(this._shakeOff);

    // the one shadow caster tracks the action
    const focus =
      this.boss.rig.group.visible && this.boss.alive
        ? this._mid.copy(p).lerp(this.boss.pos, 0.5)
        : this._mid.copy(p);
    this.arena.spot.target.position.set(focus.x, 0.8, focus.z);
    this.arena.spot.position.set(focus.x + 3, 15.5, focus.z + 5);
  }

  /* ------------------------------------------------------------------ */

  teardown() {
    this.hud.dispose();
    this.scene.fog = null;
    this.scene.environment = null;
    this.scene.environmentIntensity = 1;
    if (this._envRT) {
      this._envRT.dispose();
      this._envRT = null;
    }
    // don't leak slow-mo or the scan FOV into other levels
    this.state.timeScale = 1;
    const cam = this.game.camera;
    cam.fov = this._baseFov;
    cam.updateProjectionMatrix();
    super.teardown();
  }
}
