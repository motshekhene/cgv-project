import * as THREE from 'three';
import { makeHorn } from '../intros/cast.js';
import { dotTexture } from '../intros/fx.js';

/**
 * LandingHorn — the horn alone in the dark, for the title screen's landing
 * (ui/TitleScreen.js), on its own small renderer over a black page: the real
 * horn (intros/cast.js makeHorn), turning slowly, lit warm from the front and
 * cold cyan from behind so its curl reads, its own glow breathing, a little
 * teal mist drifting round it and cyan motes rising through the dark.
 * flare() is the horn being blown: it blazes, and dies back. dispose() frees
 * the renderer once the menu is up.
 *
 *   const stage = new LandingHorn(canvas);  stage.start();
 *   stage.flare();  ...  stage.dispose();
 */
const MOTES = 140;

function mistTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,.55)');
  gr.addColorStop(0.5, 'rgba(255,255,255,.18)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export class LandingHorn {
  constructor(canvas) {
    this.canvas = canvas;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch {
      this.renderer = null; // no second context to be had: the words still work over black
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.05, 30);
    this.camera.position.set(0, 0.2, 1.6);
    this.camera.lookAt(0, -0.12, 0); // the horn high in the frame: the title is under it

    this.scene.add(new THREE.HemisphereLight(0x8fa4b8, 0x0a0806, 0.35));
    const key = new THREE.DirectionalLight(0xffd2a0, 2.2); // warm, from the front left
    key.position.set(-1.4, 1.1, 1.6);
    const rim = new THREE.DirectionalLight(0x7fe9f0, 4.2); // cold cyan from behind: the outline of the curl
    rim.position.set(1.4, 0.8, -1.8);
    const under = new THREE.DirectionalLight(0x2fa8b4, 0.8);
    under.position.set(0, -1.5, 0.6);
    this.scene.add(key, rim, under);

    // the horn, turning about its middle
    this.horn = makeHorn({ glow: 0.2 });
    this.horn.userData.glow.scale.setScalar(0.55);
    this.horn.position.set(-0.17, -0.02, 0);
    this.pivot = new THREE.Group();
    this.pivot.add(this.horn);
    this.scene.add(this.pivot);
    this.light = new THREE.PointLight(0x4fd6e0, 1.5, 3, 2); // its own glow on the mist and the motes
    this.light.position.set(0.1, 0.05, 0.1);
    this.scene.add(this.light);

    // teal mist, drifting round and behind it
    const mist = mistTexture();
    this.mist = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mist, color: 0x1f5a62, transparent: true, opacity: 0.22, depthWrite: false }));
      const a = (i / 6) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.55, -0.15 + (i % 3) * 0.12, -0.4 + Math.sin(a) * 0.3);
      s.scale.setScalar(1.4 + (i % 3) * 0.5);
      s.userData.spin = (i % 2 ? 1 : -1) * (0.04 + i * 0.01);
      this.scene.add(s);
      this.mist.push(s);
    }

    // motes rising through the dark
    const pos = new Float32Array(MOTES * 3);
    this.seeds = new Float32Array(MOTES);
    for (let i = 0; i < MOTES; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 3;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 1.8;
      pos[i * 3 + 2] = -1.2 + Math.random() * 1.8;
      this.seeds[i] = Math.random() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(geo, new THREE.PointsMaterial({
      map: dotTexture(), color: 0x8ff0f6, size: 0.022, transparent: true, opacity: 0.8,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.scene.add(this.motes);

    this.t = 0;
    this._flare = 0;
    this._frame = this._frame.bind(this);
  }

  start() {
    if (!this.renderer || this._running) return;
    this._running = true;
    this._last = performance.now();
    requestAnimationFrame(this._frame);
  }

  /** The horn blown: it blazes, then dies back. */
  flare() {
    this._flare = 1;
  }

  _frame(now) {
    if (!this._running) return;
    requestAnimationFrame(this._frame);
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    this.t += dt;
    this._flare *= Math.exp(-dt * 1.6);
    const c = this.canvas;
    const w = c.clientWidth, h = c.clientHeight;
    if (w && h && (c.width !== Math.round(w * this.renderer.getPixelRatio()) || c.height !== Math.round(h * this.renderer.getPixelRatio()))) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      // keep the horn the same size on a narrow screen
      this.camera.position.z = 1.6 * Math.max(1, 1.5 / this.camera.aspect);
      this.camera.updateProjectionMatrix();
    }
    const t = this.t;
    // turning slowly to and fro through its side and three-quarter views (where the curl reads,
    // never end-on into the bell), rocking a little, breathing
    this.pivot.rotation.set(0.3 + Math.sin(t * 0.5) * 0.08, 0.35 + Math.sin(t * 0.3) * 1.05, -0.12 + Math.sin(t * 0.37) * 0.05);
    this.pivot.position.y = Math.sin(t * 0.8) * 0.015;
    const breath = 0.5 + 0.5 * Math.sin(t * 1.4);
    const f = this._flare;
    this.horn.userData.material.emissiveIntensity = 0.05 + 0.1 * breath + 2.6 * f; // low: the bone of it shows, lit
    this.horn.userData.glow.material.opacity = Math.min(1, 0.35 + 0.3 * breath + f);
    this.horn.userData.glow.scale.setScalar(0.55 + 0.9 * f);
    this.light.intensity = 1.2 + 1.2 * breath + 14 * f;
    for (const s of this.mist) {
      s.material.rotation += s.userData.spin * dt;
      s.material.opacity = 0.18 + 0.06 * Math.sin(t * 0.6 + s.userData.spin * 40) + 0.3 * f;
    }
    const p = this.motes.geometry.attributes.position;
    for (let i = 0; i < MOTES; i++) {
      let y = p.getY(i) + dt * (0.04 + (this.seeds[i] % 1) * 0.06);
      if (y > 0.9) y = -0.9;
      p.setY(i, y);
      p.setX(i, p.getX(i) + Math.sin(t * 0.7 + this.seeds[i]) * dt * 0.02);
    }
    p.needsUpdate = true;
    this.motes.material.opacity = 0.55 + 0.25 * Math.sin(t * 2.1) + 0.4 * f;
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Frees this renderer (the horn's geometry and the mote texture are shared
   * with the glade, so they stay). Its context goes when the browser collects
   * it: forcing it lost here held the menu still for a fifth of a second.
   */
  dispose() {
    this._running = false;
    if (!this.renderer) return;
    this.renderer.dispose();
    this.renderer = null;
  }
}
