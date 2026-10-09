import * as THREE from 'three';
import { THEME_CSS } from './theme.js';
import { DIALOGUE_FONT } from './dialogue.js';
import { Fireflies } from './artwork.js';
import { makeHorn } from '../intros/cast.js';
import { GAME_TITLE } from './brand.js';

/**
 * LoadingScreen — the one loading screen in the game, used for every level
 * switch (main.js hangs it on game.onLevelLoading), so they all look alike:
 *
 *   the horn itself, in 3D, turning slowly in the dark with fireflies round
 *   it; its cyan wakes as the level loads, until it is lit when the level is
 *   ready. Under it the chapter's name, a line from the story, and a thin
 *   gold bar.
 *
 *   const loading = new LoadingScreen();
 *   loading.show('level01');   loading.progress(0.4);   loading.hide();
 */

/** What each chapter is called, and a line from its part of the story. */
export const CHAPTERS = {
  title: { kicker: '', title: GAME_TITLE, lore: '' },
  prologue: { kicker: 'PROLOGUE', title: 'THE FIRE AND THE STONE',
    lore: 'They say if the horn ever leaves the stone, the whole forest goes silent.' },
  level01: { kicker: 'LEVEL 1', title: 'THE OLD TRAIL',
    lore: 'The last crew that went past the stone never came back.' },
  'level02-intro': { kicker: 'LEVEL 2', title: 'THE RIVER ROAD',
    lore: 'A year of the company’s wages, for one morning’s work.' },
  level02: { kicker: 'LEVEL 2', title: 'THE RIVER ROAD',
    lore: 'A year of the company’s wages, for one morning’s work.' },
  level03: { kicker: 'LEVEL 3', title: 'THE FALLS',
    lore: 'Nobody looks twice at a guide on the paths at dawn.' },
};

const CSS = THEME_CSS + `
.ld { position:fixed; inset:0; z-index:10000; overflow:hidden; opacity:0; visibility:hidden;
  background:radial-gradient(ellipse at 50% 42%, #14201c 0%, #070b0a 55%, #020303 100%);
  transition:opacity .35s ease, visibility 0s linear .35s; pointer-events:none; }
.ld.show { opacity:1; visibility:visible; transition:opacity .35s ease; pointer-events:auto; }
.ld-motes { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; opacity:.7; }
.ld-in { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px;
  font-family:${DIALOGUE_FONT}; color:#f2e8d5; text-align:center; padding:0 16px; }
.ld-horn { width:min(420px, 80vw); height:min(240px, 46vw); }
.ld-kicker { margin-top:6px; font-size:13px; letter-spacing:.5em; text-indent:.5em; color:var(--gold); }
.ld-title { font-size:clamp(26px, 4.4vw, 46px); font-weight:600; letter-spacing:.28em; text-indent:.28em;
  text-shadow:0 2px 0 rgba(0,0,0,.5), 0 0 28px rgba(255,176,58,.25); }
.ld-lore { max-width:560px; margin-top:14px; font-size:19px; font-style:italic; color:#e8ddc8; opacity:.9;
  text-shadow:0 2px 14px rgba(0,0,0,.95); }
.ld-bar { width:min(320px, 64vw); height:2px; margin-top:26px; background:rgba(227,187,98,.2); overflow:hidden; }
.ld-bar b { display:block; height:100%; width:0; background:linear-gradient(90deg, var(--gold-dim), var(--gold)); transition:width .2s; }
.ld-pct { margin-top:8px; font:600 10px var(--sans); letter-spacing:.32em; color:var(--ink-dim); }
`;

export class LoadingScreen {
  constructor() {
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);
    this.el = document.createElement('div');
    this.el.className = 'ld fh'; // .fh: the theme's colour variables
    this.el.innerHTML = `
      <canvas class="ld-motes"></canvas>
      <div class="ld-in">
        <canvas class="ld-horn"></canvas>
        <div class="ld-kicker"></div>
        <div class="ld-title"></div>
        <div class="ld-lore"></div>
        <div class="ld-bar"><b></b></div>
        <div class="ld-pct">LOADING</div>
      </div>`;
    document.body.appendChild(this.el);
    const q = (s) => this.el.querySelector(s);
    this.kicker = q('.ld-kicker');
    this.title = q('.ld-title');
    this.lore = q('.ld-lore');
    this.bar = q('.ld-bar b');
    this.pct = q('.ld-pct');
    this.motes = new Fireflies(q('.ld-motes'), 50);
    this._buildHorn(q('.ld-horn'));
    this.visible = false;
    this._p = 0;
    this._frame = this._frame.bind(this);
  }

  /** The horn on its own little renderer: lit from the side and behind, turning slowly. */
  _buildHorn(canvas) {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch {
      this.renderer = null; // no second context to be had: the words and the bar still work
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.05, 20);
    this.camera.position.set(0, 0.1, 1.0);
    this.camera.lookAt(0, 0.04, 0);
    this.scene.add(new THREE.HemisphereLight(0xb8c4d0, 0x1a1410, 0.9));
    const key = new THREE.DirectionalLight(0xffd8a8, 2.4);
    key.position.set(-1.5, 1.2, 1.4);
    const rim = new THREE.DirectionalLight(0x7fe9f0, 2.0);
    rim.position.set(1.2, 0.6, -1.5);
    this.scene.add(key, rim);
    this.horn = makeHorn({ glow: 0.02 });
    this.horn.userData.glow.scale.setScalar(0.5);
    const pivot = new THREE.Group();
    this.horn.position.set(-0.25, -0.02, 0); // turn it about its middle, not its base
    pivot.add(this.horn);
    this.pivot = pivot;
    this.scene.add(pivot);
    this._canvas = canvas;
  }

  _frame(now) {
    if (!this.visible) return;
    requestAnimationFrame(this._frame);
    if (!this.renderer) return;
    const c = this._canvas;
    const w = c.clientWidth, h = c.clientHeight;
    if (w && h && (c.width !== Math.round(w * this.renderer.getPixelRatio()))) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    const t = now / 1000;
    this.pivot.rotation.set(0.25 + Math.sin(t * 0.7) * 0.08, t * 0.5, -0.1);
    // its light wakes with the level
    this.horn.userData.material.emissiveIntensity = 0.03 + this._p * 0.55;
    this.horn.userData.glow.material.opacity = 0.15 + this._p * 0.6;
    this.renderer.render(this.scene, this.camera);
  }

  /** Cover the screen for `name` (a registered level). Chapters without an entry just say LOADING. */
  show(name) {
    const c = CHAPTERS[name] || { kicker: '', title: 'LOADING', lore: '' };
    this.kicker.textContent = c.kicker;
    this.title.textContent = c.title;
    this.lore.textContent = c.lore ? `“${c.lore}”` : '';
    this.progress(0);
    this.el.classList.add('show');
    this.motes.start();
    if (!this.visible) {
      this.visible = true;
      requestAnimationFrame(this._frame);
    }
  }

  /** 0..1: the horn's light and the bar. */
  progress(p) {
    this._p = Math.max(0, Math.min(1, p));
    this.bar.style.width = `${Math.round(this._p * 100)}%`;
    this.pct.textContent = this._p > 0 ? `LOADING · ${Math.round(this._p * 100)}%` : 'LOADING';
  }

  hide() {
    this.progress(1);
    this.el.classList.remove('show');
    this.visible = false;
    setTimeout(() => { if (!this.visible) this.motes.stop(); }, 400);
  }
}
