import * as THREE from 'three';
import { Level } from '../core/Level.js';

/**
 * PROLOGUE — Noctis Data Services, Sublevel 2, 01:41.
 *
 * First person. Kai walks to a terminal, reads something he was never meant
 * to read, copies it, turns around, and finds a man in the doorway.
 *
 * Deliberate design notes:
 *  - First person means no character model, no rig, no animation clips. It is
 *    also a second view mode alongside the chase camera (Viewing, 10%).
 *  - The terminal text is drawn to a CanvasTexture and lives on the monitor
 *    in the 3D world, not as an HTML overlay. A texture doing more than
 *    colour (3D Effects, 15%).
 *  - The Handler is a black silhouette, never a face. This preserves the
 *    level 03 reveal and costs us nothing to build.
 *
 * TWO PLANTS THAT PAY OFF LATER — do not change these without telling the team:
 *  1. B. INGRAM appears twice. Level 03's reveal MUST use the same name.
 *  2. SHAFT 7 appears in the relay site list. Level 03 depends on the player
 *     having seen it here.
 */

const HANDLER_NAME = 'B. INGRAM';

const ROOM = { w: 26, d: 20, h: 5 };
const EYE = 1.7;
const WALK = 3.4;
const LOOK = 0.0022;          // radians per pixel of mouse movement

export class Prologue extends Level {
  constructor() {
    super('prologue');

    // player
    this.px = 0;
    this.pz = 7.5;
    this.yaw = 0;              // yaw 0 looks down -Z, which is toward the terminal
    this.pitch = 0;
    this.locked = false;

    // sequence
    this.phase = 'intro';
    this.t = 0;
    this.leaving = false;

    // terminal text
    this.lines = [];           // lines currently on the monitor
    this.pending = null;       // line being typed out
    this.pendingChars = 0;
    this.queue = [];           // lines still to type

    this.blockers = [];
    this._tmp = new THREE.Vector3();
  }

  /* ==================================================== build */
  init(scene, assets, input, state) {
    super.init(scene, assets, input, state);

    scene.background = new THREE.Color(0x04060a);
    scene.fog = new THREE.FogExp2(0x04060a, 0.035);

    this._buildRoom();
    this._buildRacks();
    this._buildTerminal();
    this._buildHandler();
    this._buildHud();

    // mouse look needs pointer lock, which needs a click to start
    this._onClick = () => {
      const el = this.game.renderer.domElement;
      if (!this.locked && el.requestPointerLock) el.requestPointerLock();
    };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.game.renderer.domElement;
      this.hud.lock.style.opacity = this.locked ? '0' : '1';
    };
    this.game.renderer.domElement.addEventListener('click', this._onClick);
    document.addEventListener('pointerlockchange', this._onLockChange);

    this.game.camera.fov = 70;
    this.game.camera.near = 0.1;
    this.game.camera.updateProjectionMatrix();
  }

  _buildRoom() {
    const { w, d, h } = ROOM;

    this.matFloor = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.85 });
    this.matWall = new THREE.MeshStandardMaterial({ color: 0x0d1118, roughness: 0.95 });
    this.matTrim = new THREE.MeshBasicMaterial({ color: 0x1d5f6b });

    const box = new THREE.BoxGeometry(1, 1, 1);
    this.geoBox = box;

    const floor = new THREE.Mesh(box, this.matFloor);
    floor.scale.set(w, 0.4, d);
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    this.root.add(floor);

    const ceil = new THREE.Mesh(box, this.matWall);
    ceil.scale.set(w, 0.4, d);
    ceil.position.y = h + 0.2;
    this.root.add(ceil);

    // walls, with a gap left in the north wall for the terminal alcove
    const mkWall = (sx, sy, sz, x, y, z) => {
      const m = new THREE.Mesh(box, this.matWall);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      m.receiveShadow = true;
      this.root.add(m);
      return m;
    };
    mkWall(0.6, h, d, -w / 2, h / 2, 0);        // west (stairwell is cut into this)
    mkWall(0.6, h, d, w / 2, h / 2, 0);         // east
    mkWall(w, h, 0.6, 0, h / 2, -d / 2);        // north (terminal)
    mkWall(w / 2 - 2, h, 0.6, -(w / 4 + 1), h / 2, d / 2);   // south, left of door
    mkWall(w / 2 - 2, h, 0.6, (w / 4 + 1), h / 2, d / 2);    // south, right of door

    // floor guide strip — the only thing leading anywhere
    const strip = new THREE.Mesh(box, this.matTrim);
    strip.scale.set(0.12, 0.02, d - 2);
    strip.position.set(0, 0.02, 0);
    this.root.add(strip);

    // the south doorway Kai came in through — the Handler will fill it
    this.doorLight = new THREE.SpotLight(0xffd9a8, 0, 26, 0.7, 0.6, 1.2);
    this.doorLight.position.set(0, 3.4, d / 2 + 1.5);
    this.doorLight.target.position.set(0, 1, 0);
    this.root.add(this.doorLight, this.doorLight.target);

    // the west stairwell — dark until it matters
    this.matExit = new THREE.MeshBasicMaterial({ color: 0x1b3a44 });
    this.exitSign = new THREE.Mesh(box, this.matExit);
    this.exitSign.scale.set(0.12, 0.5, 2.2);
    this.exitSign.position.set(-w / 2 + 0.4, 2.6, 0);
    this.root.add(this.exitSign);

    this.exitLight = new THREE.PointLight(0x4fd6e0, 0, 14, 2);
    this.exitLight.position.set(-w / 2 + 1.6, 2.4, 0);
    this.root.add(this.exitLight);

    // ambient fill, kept low so the monitor is the brightest thing in the room
    this.root.add(new THREE.HemisphereLight(0x2b4458, 0x070a10, 0.55));

    this.ceilingLight = new THREE.PointLight(0x8fb6d8, 18, 30, 2);
    this.ceilingLight.position.set(0, h - 0.6, 2);
    this.root.add(this.ceilingLight);

    // walls as collision
    const t = 0.9;
    this.blockers.push({ x0: -w / 2, x1: -w / 2 + t, z0: -d / 2, z1: d / 2 });
    this.blockers.push({ x0: w / 2 - t, x1: w / 2, z0: -d / 2, z1: d / 2 });
    this.blockers.push({ x0: -w / 2, x1: w / 2, z0: -d / 2, z1: -d / 2 + t });
    this.blockers.push({ x0: -w / 2, x1: w / 2, z0: d / 2 - t, z1: d / 2 });
  }

  _buildRacks() {
    // one geometry and two materials shared across every rack — cheaper than
    // a new geometry per object, which is what the brief warns about
    this.geoRack = new THREE.BoxGeometry(1.6, 3.2, 1.1);
    this.geoLed = new THREE.BoxGeometry(1.2, 0.06, 0.05);
    this.matRack = new THREE.MeshStandardMaterial({ color: 0x191f29, roughness: 0.6, metalness: 0.4 });
    this.matLedOn = new THREE.MeshBasicMaterial({ color: 0x4fd6e0 });
    this.matLedOff = new THREE.MeshBasicMaterial({ color: 0x1a2630 });

    this.rowWest = [];
    this.rowEast = [];

    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const x = side * 6.5;
        const z = -5 + i * 3.1;

        const rack = new THREE.Mesh(this.geoRack, this.matRack);
        rack.position.set(x, 1.6, z);
        rack.castShadow = true;
        this.root.add(rack);

        const leds = [];
        for (let k = 0; k < 7; k++) {
          const led = new THREE.Mesh(this.geoLed, this.matLedOn);
          led.position.set(x - side * 0.58, 0.5 + k * 0.38, z);
          led.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
          this.root.add(led);
          leds.push(led);
        }
        (side < 0 ? this.rowWest : this.rowEast).push({ rack, leds });

        this.blockers.push({ x0: x - 1, x1: x + 1, z0: z - 0.8, z1: z + 0.8 });
      }
    }

    // rack 14 — the one that should not be running
    const tag = new THREE.Mesh(this.geoBox, new THREE.MeshBasicMaterial({ color: 0xffb03a }));
    tag.scale.set(0.5, 0.26, 0.03);
    tag.position.set(-5.9, 2.4, 1.2);
    this.matTag = tag.material;
    this.root.add(tag);
  }

  _buildTerminal() {
    // desk
    this.matDesk = new THREE.MeshStandardMaterial({ color: 0x1c222c, roughness: 0.7 });
    const desk = new THREE.Mesh(this.geoBox, this.matDesk);
    desk.scale.set(4.4, 0.18, 1.6);
    desk.position.set(0, 0.95, -8.2);
    desk.castShadow = true;
    this.root.add(desk);
    this.blockers.push({ x0: -2.6, x1: 2.6, z0: -9.2, z1: -7.4 });

    for (const sx of [-1.9, 1.9]) {
      const leg = new THREE.Mesh(this.geoBox, this.matDesk);
      leg.scale.set(0.16, 0.95, 1.2);
      leg.position.set(sx, 0.48, -8.2);
      this.root.add(leg);
    }

    // the screen — a canvas texture, redrawn whenever the text changes
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 576;
    this.ctx = this.canvas.getContext('2d');
    this.screenTex = new THREE.CanvasTexture(this.canvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.matScreen = new THREE.MeshBasicMaterial({ map: this.screenTex });

    const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8), this.matScreen);
    screen.position.set(0, 2.1, -8.78);
    this.root.add(screen);
    this.geoScreen = screen.geometry;

    const bezel = new THREE.Mesh(this.geoBox, this.matDesk);
    bezel.scale.set(3.5, 2.1, 0.12);
    bezel.position.set(0, 2.1, -8.86);
    this.root.add(bezel);

    this.screenLight = new THREE.PointLight(0x7fd4ff, 14, 12, 2);
    this.screenLight.position.set(0, 2.1, -7.6);
    this.root.add(this.screenLight);

    // the drive, sitting on the desk — goes gold when the key is copied
    this.matDrive = new THREE.MeshStandardMaterial({
      color: 0x2a2f3a, emissive: 0x000000, roughness: 0.4, metalness: 0.5
    });
    this.drive = new THREE.Mesh(this.geoBox, this.matDrive);
    this.drive.scale.set(0.34, 0.1, 0.5);
    this.drive.position.set(1.3, 1.09, -8.1);
    this.root.add(this.drive);

    this._drawScreen();
  }

  _buildHandler() {
    this.matDark = new THREE.MeshBasicMaterial({ color: 0x05070b });
    this.handler = new THREE.Group();

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.95, 4, 10), this.matDark);
    torso.position.y = 1.12;
    this.handler.add(torso);
    this.geoTorso = torso.geometry;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), this.matDark);
    head.position.y = 1.88;
    this.handler.add(head);
    this.geoHead = head.geometry;

    const coat = new THREE.Mesh(this.geoBox, this.matDark);
    coat.scale.set(0.9, 1.5, 0.45);
    coat.position.y = 0.78;
    this.handler.add(coat);

    this.handler.position.set(0, 0, ROOM.d / 2 + 0.6);
    this.handler.visible = false;
    this.root.add(this.handler);
  }

  /* ==================================================== hud
     Built here and removed in teardown, with inline styles, so nothing of
     this leaks into 3B's HUD or style.css. 3B can restyle it later. */
  _buildHud() {
    const host = document.getElementById('hud') || document.body;
    this.hudHost = host;
    const mk = (css, html = '') => {
      const el = document.createElement('div');
      el.style.cssText = css;
      el.innerHTML = html;
      host.appendChild(el);
      return el;
    };

    const mono = "font-family:ui-monospace,'JetBrains Mono',Menlo,monospace";
    const base = 'position:absolute;pointer-events:none;';

    this.hud = {};

    this.hud.stamp = mk(
      base + mono + ';left:34px;top:34px;color:#7fd4ff;font-size:13px;letter-spacing:.22em;' +
      'opacity:0;transition:opacity .8s',
      '01:41 &middot; SUBLEVEL 2 &middot; DATA HALL C'
    );

    this.hud.ticket = mk(
      base + mono + ';left:34px;bottom:34px;color:#8f9bb0;font-size:12.5px;line-height:1.7;' +
      'border-left:2px solid #2e6b7a;padding:4px 0 4px 12px;opacity:0;transition:opacity .8s',
      `TICKET 4471 &middot; SUBLEVEL 2 &middot; DATA HALL C<br>` +
      `RACK 14 — INTEGRITY CHECK<br>` +
      `ASSIGNED BY: <span style="color:#c6d2e4">${HANDLER_NAME}</span>`
    );

    this.hud.prompt = mk(
      base + mono + ';left:50%;bottom:120px;transform:translateX(-50%);color:#eef2fb;' +
      'font-size:14px;letter-spacing:.14em;text-align:center;opacity:0;transition:opacity .2s;' +
      'background:rgba(5,8,14,.6);border:1px solid rgba(79,214,224,.45);border-radius:6px;' +
      'padding:10px 18px'
    );

    this.hud.lock = mk(
      base + mono + ';left:50%;top:50%;transform:translate(-50%,-50%);color:#8f9bb0;' +
      'font-size:12.5px;letter-spacing:.2em;transition:opacity .3s',
      'CLICK TO LOOK AROUND'
    );

    this.hud.skip = mk(
      base + mono + ';right:34px;bottom:34px;color:#5b6379;font-size:11.5px;letter-spacing:.2em',
      'K — SKIP PROLOGUE'
    );

    this.hud.fade = mk(
      'position:absolute;inset:0;background:#04060a;pointer-events:none;opacity:0;' +
      'transition:opacity .9s'
    );
  }

  /* ==================================================== screen text */
  _drawScreen() {
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    c.fillStyle = '#060b12';
    c.fillRect(0, 0, W, H);

    // scanlines, because it is a monitor and it costs four lines
    c.fillStyle = 'rgba(255,255,255,0.025)';
    for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 1);

    c.font = '21px ui-monospace, Menlo, monospace';
    c.textBaseline = 'top';

    let y = 26;
    const draw = (text) => {
      if (text.startsWith('!')) c.fillStyle = '#ffb03a';
      else if (text.startsWith('>')) c.fillStyle = '#ff6b6b';
      else c.fillStyle = '#7fd4ff';
      c.fillText(text.replace(/^[!>]/, ''), 28, y);
      y += 26;
    };

    for (const line of this.lines) draw(line);
    if (this.pending !== null) {
      draw(this.pending.slice(0, this.pendingChars) + '█');
    }
    this.screenTex.needsUpdate = true;
  }

  _type(lines) {
    this.queue = lines.slice();
    this._next();
  }

  _next() {
    if (this.queue.length === 0) { this.pending = null; return false; }
    this.pending = this.queue.shift();
    this.pendingChars = 0;
    return true;
  }

  /* ==================================================== movement */
  _blocked(x, z) {
    const r = 0.45;
    for (const b of this.blockers) {
      if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1) return true;
    }
    return false;
  }

  _move(dt) {
    const i = this.input;
    let f = (i.isDown('forward') ? 1 : 0) - (i.isDown('back') ? 1 : 0);
    let s = (i.isDown('right') ? 1 : 0) - (i.isDown('left') ? 1 : 0);
    const len = Math.hypot(f, s);
    if (len > 0) { f /= len; s /= len; }

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const dx = (-sin * f + cos * s) * WALK * dt;
    const dz = (-cos * f - sin * s) * WALK * dt;

    // axes tested separately, which gives sliding along walls for free
    if (!this._blocked(this.px + dx, this.pz)) this.px += dx;
    if (!this._blocked(this.px, this.pz + dz)) this.pz += dz;
  }

  _look() {
    if (!this.locked) return;
    this.yaw -= this.input.mouse.dx * LOOK;
    this.pitch -= this.input.mouse.dy * LOOK;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.2, 1.2);
  }

  _distToDesk() {
    return Math.hypot(this.px - 0, this.pz - (-7.0));
  }

  _prompt(html) {
    this.hud.prompt.innerHTML = html;
    this.hud.prompt.style.opacity = html ? '1' : '0';
  }

  /* ==================================================== update */
  update(dt, state) {
    this.t += dt;

    if (this.input.isDown('skip') && !this.leaving) { this._exit(state); return; }

    this._look();
    if (this.phase !== 'done') this._move(dt);

    // type out any pending screen text
    if (this.pending !== null) {
      this.pendingChars += dt * 95;
      if (this.pendingChars >= this.pending.length) {
        this.lines.push(this.pending);
        this.pendingChars = 0;
        if (!this._next()) this.pending = null;
      }
      this._drawScreen();
    }

    switch (this.phase) {
      case 'intro': {
        this.hud.stamp.style.opacity = '1';
        this.hud.ticket.style.opacity = '1';
        if (this.t > 4.5) {
          this.hud.stamp.style.opacity = '0';
          this.phase = 'explore';
        }
        break;
      }

      case 'explore': {
        if (this._distToDesk() < 2.6) {
          this._prompt('<b style="color:#4fd6e0">E</b> &nbsp; READ THE TERMINAL');
          if (this.input.pressed('interact')) {
            this._prompt('');
            this.hud.ticket.style.opacity = '0';
            this.phase = 'check';
            this.t = 0;
            this._type([
              'NOCTIS DATA SERVICES — SUBLEVEL 2',
              'TICKET 4471 / RACK 14 / INTEGRITY CHECK',
              '',
              'RUNNING .............................. 97%',
              'RUNNING ............................. 100%',
              '',
              'CHECK COMPLETE',
              '!RACK 14 · STATUS: DECOMMISSIONED 14 MAR',
              `!CHECK AUTHORISED BY: ${HANDLER_NAME}`,
            ]);
          }
        } else {
          this._prompt('');
        }
        break;
      }

      case 'check': {
        if (this.pending === null && this.lines.length >= 9) {
          this.phase = 'spill';
          this.t = 0;
        }
        break;
      }

      case 'spill': {
        if (this.t > 1.4) {
          this.lines = [];
          this.phase = 'manifest';
          this._type([
            '> UNEXPECTED PAYLOAD ON DECOMMISSIONED VOLUME',
            '> MOUNTING ARCHIVE ...',
            '',
            'PROJECT BLACKOUT — DEPLOYMENT MANIFEST',
            'CLASSIFICATION: ORANGE / NO FOREIGN',
            '',
            'SCOPE    : CONTINENTAL NETWORK INTERDICT',
            'STATUS   : CONTRACTED',
            '!DELIVERY : T-9 DAYS',
            '',
            'RELAY SITES',
            '  01  HARBOUR EXCHANGE',
            '  02  NORTHGATE SUBSTATION',
            '  07  SHAFT 7 — DEEPHOLD',
            '  11  CAPE LANDING',
            '',
            '!MASTER KEY: PRESENT ON THIS VOLUME',
          ]);
        }
        break;
      }

      case 'manifest': {
        if (this.pending === null && this.queue.length === 0) {
          this.phase = 'choice';
          this.t = 0;
        }
        break;
      }

      case 'choice': {
        this._prompt(
          '<b style="color:#ffc857">E</b> &nbsp; COPY THE KEY' +
          '<span style="opacity:.4"> &nbsp;&nbsp;|&nbsp;&nbsp; </span>' +
          '<b style="color:#8f9bb0">Q</b> &nbsp; WALK AWAY'
        );
        if (this.input.pressed('ability')) {       // Q — he tries to leave
          this.lines.push('');
          this.lines.push('!Nine days.');
          this._drawScreen();
          this.phase = 'refused';
          this.t = 0;
          this._prompt('');
        }
        if (this.input.pressed('interact')) this._copy(state);
        break;
      }

      case 'refused': {
        if (this.t > 1.8) { this.phase = 'choice'; }
        break;
      }

      case 'copied': {
        // one rack row dies, the room dims, the drive glows
        const k = Math.min(1, this.t / 1.2);
        this.ceilingLight.intensity = 18 * (1 - k * 0.75);
        this.matDrive.emissive.setHex(0xffc857);
        this.matDrive.emissiveIntensity = 0.6 + Math.sin(this.t * 6) * 0.25;
        if (this.t > 2.0) {
          this.phase = 'turn';
          this.t = 0;
          this.handler.visible = true;
          this.doorLight.intensity = 70;
        }
        break;
      }

      case 'turn': {
        // he waits in the doorway until the player has seen him, then steps in
        const seen = this._facingHandler();
        if (seen || this.t > 5) {
          this.phase = 'flee';
          this.t = 0;
          this.exitLight.intensity = 22;
          this.matExit.color.setHex(0x7ff0ff);
        }
        break;
      }

      case 'flee': {
        this.handler.position.z = THREE.MathUtils.lerp(
          this.handler.position.z, 4.0, 1 - Math.exp(-0.9 * dt)
        );
        this._prompt('<b style="color:#4fd6e0">RUN</b>');

        const atExit = this.px < -ROOM.w / 2 + 2.6 && Math.abs(this.pz) < 2.0;
        const caught = Math.hypot(this.px - this.handler.position.x,
                                  this.pz - this.handler.position.z) < 1.2;
        if (atExit || caught) this._exit(state);
        break;
      }
    }

    this._updateCamera();
  }

  _facingHandler() {
    // is the Handler roughly in front of the camera?
    const dx = this.handler.position.x - this.px;
    const dz = this.handler.position.z - this.pz;
    const toHandler = Math.atan2(-dx, -dz);
    let diff = toHandler - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.abs(diff) < 0.6;
  }

  _copy(state) {
    this.phase = 'copied';
    this.t = 0;
    this._prompt('');
    this.lines.push('');
    this.lines.push('!KEY COPIED TO EXTERNAL VOLUME');
    this._drawScreen();

    state.hasKey = true;                       // add this to GameState.reset()

    // the row nearest rack 14 goes dark
    for (const r of this.rowWest) for (const led of r.leds) led.material = this.matLedOff;
    this.matTag.color.setHex(0xff4d4d);
  }

  _exit(state) {
    if (this.leaving) return;
    this.leaving = true;
    this.phase = 'done';
    this._prompt('');
    this.hud.fade.style.opacity = '1';
    if (document.exitPointerLock) document.exitPointerLock();
    setTimeout(() => this.game.setLevel('level01'), 950);
  }

  _updateCamera() {
    const cam = this.game.camera;
    cam.position.set(this.px, EYE, this.pz);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.pitch, this.yaw, 0);
  }

  /* ==================================================== teardown */
  teardown() {
    this.game.renderer.domElement.removeEventListener('click', this._onClick);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    if (document.pointerLockElement) document.exitPointerLock();

    for (const el of Object.values(this.hud)) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }
    this.hud = {};

    // Level.teardown disposes everything under this.root, including the
    // canvas texture on the screen material
    this.scene.fog = null;
    this.game.camera.fov = 62;
    this.game.camera.rotation.set(0, 0, 0);
    this.game.camera.updateProjectionMatrix();
    super.teardown();
  }
}