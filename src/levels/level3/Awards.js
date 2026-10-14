import * as THREE from 'three';
import { RU, place } from '../jungle/props.js';
import { GIFT_SPOTS } from './ShrineArena.js';

/**
 * The forest's spirit shrines: three out in the jungle ring round the
 * courtyard, so the fight has somewhere to go, each an old stone spirit on a
 * carved rune circle. Kai takes a spirit's gift by stepping onto its circle,
 * with the Handler on his heels, and the spirit leaps out of the stone into him.
 *
 *   THE STAG   (vitality) heals HEAL of his life, then sleeps: its light
 *              climbs back up the stone over RECHARGE s, and it heals again
 *   THE FOX    (strategy) his next move called out, parries easier: this fight
 *   THE EMBER  (power)    fire in his fists, hits 40% harder: this fight
 *
 * A shrine that's ready glows from within (the light is in the statue's own
 * material: a shader fills it from the ground up, so a sleeping stag shows how
 * long it has left), its circle burns and spirit motes drift up round it; one
 * that's spent is plain stone. Off screen, a ready shrine has a marker at the
 * edge of the screen pointing the way, with how far it is.
 *
 * Every attempt starts with all three ready (Level03 clears state.awards):
 * the fox's and the ember's gifts last the fight, the stag's is for using.
 *
 *   gifts.update(dt, time, kaiPos, camera);   // -> onCollect(id, gift), onReady(id, gift)
 *   gifts.ready('vitality')                   // can the stag heal him right now?
 */
export const GIFTS = {
  vitality: {
    icon: '♥', name: 'THE STAG', color: 0x8affb8, css: '#8affb8', spirit: 'stag', heal: 0.5, recharge: 30,
    desc: 'The stag’s strength: half your life back. It sleeps, and wakes again.',
  },
  strategy: {
    icon: '◈', name: 'THE FOX', color: 0x8fd0ff, css: '#8fd0ff', spirit: 'fox',
    desc: 'The fox’s cunning: his next move is called out, and parries come easier. For this fight.',
  },
  power: {
    icon: '✸', name: 'THE EMBER', color: 0xffa040, css: '#ffb347', spirit: 'ember',
    desc: 'Fire in your fists: punches and kicks hit 40% harder. For this fight.',
  },
};

const PICKUP = 1.9; // m from the middle of the circle
const CIRCLE_R = 1.7;
const MOTES = 30;
const LEAP_TIME = 0.75; // s: the spirit out of the stone and into Kai
const MARK_NEAR = 16; // m: closer than this and on screen, it needs no marker

/** The carved circle: two rings and a band of runes, white on clear (tinted per shrine). */
function runeTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  g.shadowColor = '#fff';
  g.shadowBlur = 10;
  const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
  ring(S * 0.47, 6);
  ring(S * 0.4, 3);
  ring(S * 0.24, 4);
  // runes between the rings: a few strokes each, from a fixed seed so every shrine reads the same
  let seed = 9;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n = 18;
  for (let k = 0; k < n; k++) {
    g.save();
    g.rotate((k / n) * Math.PI * 2);
    g.translate(0, -S * 0.435);
    g.lineWidth = 4;
    g.beginPath();
    const strokes = 2 + Math.floor(rnd() * 3);
    for (let s = 0; s < strokes; s++) {
      const x0 = (rnd() - 0.5) * 22, y0 = (rnd() - 0.5) * 18;
      g.moveTo(x0, y0);
      g.lineTo(x0 + (rnd() - 0.5) * 26, y0 + (rnd() - 0.5) * 22);
    }
    g.stroke();
    g.restore();
  }
  // spokes from the inner ring to the outer
  g.lineWidth = 2;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    g.beginPath();
    g.moveTo(Math.cos(a) * S * 0.24, Math.sin(a) * S * 0.24);
    g.lineTo(Math.cos(a) * S * 0.4, Math.sin(a) * S * 0.4);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** One lick of fire: a teardrop, white-hot low down, fading out to its tip. */
function flameTexture() {
  const W = 64, H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(W / 2, H * 0.72, 2, W / 2, H * 0.62, H * 0.5);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,.75)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(W / 2, 4);
  g.bezierCurveTo(W * 0.62, H * 0.3, W * 0.98, H * 0.55, W * 0.82, H * 0.8);
  g.bezierCurveTo(W * 0.7, H * 0.98, W * 0.3, H * 0.98, W * 0.18, H * 0.8);
  g.bezierCurveTo(W * 0.02, H * 0.55, W * 0.38, H * 0.3, W / 2, 4);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The statue's own material, with the spirit's light in it: below the fill
 * line (0 = the ground, 1 = the top of the statue) a faint tint and a bright
 * rim round its edges (a fresnel term), so it still reads as carved stone with
 * something alive inside; a brighter seam at the line while it climbs.
 */
function spiritMaterial(src, u) {
  const m = src.clone();
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vSpiritY;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvSpiritY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFill, uGlow, uBaseY, uHeight;\nuniform vec3 uSpirit;\nvarying float vSpiritY;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float hN = clamp((vSpiritY - uBaseY) / uHeight, 0.0, 1.0);
        float below = 1.0 - smoothstep(uFill - 0.05, uFill, hN);
        float seam = (1.0 - abs(hN - uFill) / 0.045) * step(uFill, 0.995);
        float rim = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.2);
        totalEmissiveRadiance += uSpirit * (below * uGlow * (0.06 + 1.5 * rim) + max(seam, 0.0) * 1.3);`);
  };
  m.customProgramCacheKey = () => 'spirit-statue';
  return m;
}

export class ShrineGifts {
  constructor(arena, state, onCollect) {
    this.arena = arena;
    this.state = state;
    this.onCollect = onCollect;
    this.onReady = null;
    this.shrines = [];
    this.leaps = [];
    this._geos = [];
    this._mats = [];

    this.runeTex = runeTexture();
    this.flameTex = flameTexture();
    this.circleGeo = new THREE.PlaneGeometry(CIRCLE_R * 2, CIRCLE_R * 2);
    this.circleGeo.rotateX(-Math.PI / 2);
    this.daisGeo = new THREE.CylinderGeometry(CIRCLE_R + 0.05, CIRCLE_R + 0.25, 0.14, 28);
    this.daisMat = new THREE.MeshStandardMaterial({ color: 0x8b8a72, roughness: 0.95, flatShading: true });
    this._geos.push(this.circleGeo, this.daisGeo);
    this._mats.push(this.daisMat);

    for (const [id, gift] of Object.entries(GIFTS)) this._build(id, gift, GIFT_SPOTS[id]);
    this._buildMarkers();
  }

  /* ------------------------------------------------------------ building */

  _build(id, gift, at) {
    const arena = this.arena;
    const y = arena.groundHeight(at.x, at.z);
    const group = new THREE.Group();
    group.position.set(at.x, y, at.z);
    arena.root.add(group);
    // facing the courtyard, so the spirit looks at whoever comes out of it
    const face = Math.atan2(-at.x, -at.z);

    const dais = new THREE.Mesh(this.daisGeo, this.daisMat);
    dais.position.y = -0.03;
    dais.receiveShadow = true;
    group.add(dais);

    const color = new THREE.Color(gift.color);
    const ringMat = new THREE.MeshBasicMaterial({
      map: this.runeTex, color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const ring = new THREE.Mesh(this.circleGeo, ringMat);
    ring.position.y = 0.05;
    ring.renderOrder = 2;
    group.add(ring);
    this._mats.push(ringMat);

    const u = {
      uFill: { value: 1 }, uGlow: { value: 0.5 }, uBaseY: { value: y }, uHeight: { value: 2 },
      uSpirit: { value: color.clone() },
    };
    const shrine = { id, gift, group, ring, u, color, charge: 1, taken: false, face, flames: [], statue: null };
    const t = arena.templates || {};
    if (gift.spirit === 'ember') this._buildEmber(shrine, t);
    else this._buildStatue(shrine, gift.spirit === 'stag' ? t.stag : t.fox, gift.spirit === 'stag' ? 0.55 : 0.72);
    this._buildMotes(shrine);
    arena.obstacles.push({ x: at.x, z: at.z, r: 0.7 });
    this.shrines.push(shrine);
  }

  _buildStatue(shrine, template, scale) {
    if (!template) return;
    const statue = place(shrine.group, template, 0, 0.04, 0, { s: RU * scale, ry: shrine.face });
    statue.traverse((o) => {
      if (!o.isMesh) return;
      o.material = Array.isArray(o.material) ? o.material.map((m) => spiritMaterial(m, shrine.u)) : spiritMaterial(o.material, shrine.u);
      this._mats.push(...[].concat(o.material));
    });
    statue.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(statue);
    shrine.u.uBaseY.value = box.min.y;
    shrine.u.uHeight.value = Math.max(0.5, box.max.y - box.min.y);
    shrine.statue = statue;
    shrine.top = box.max.y - shrine.group.position.y;
  }

  /** The ember: a stone brazier with a fire in it that never goes out while it's ready. */
  _buildEmber(shrine, t) {
    let topY = 0.9;
    if (t.pot) {
      const pot = place(shrine.group, t.pot, 0, 0.04, 0, { s: RU * 1.25, ry: shrine.face });
      const stone = (m) => {
        const c = spiritMaterial(m, shrine.u);
        c.color.set(0x4c4a45); // carved dark stone, not painted clay
        c.map = null;
        c.vertexColors = false;
        return c;
      };
      pot.traverse((o) => {
        if (!o.isMesh) return;
        o.material = Array.isArray(o.material) ? o.material.map(stone) : stone(o.material);
        this._mats.push(...[].concat(o.material));
      });
      pot.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(pot);
      shrine.u.uBaseY.value = box.min.y;
      shrine.u.uHeight.value = Math.max(0.4, box.max.y - box.min.y);
      topY = box.max.y - shrine.group.position.y;
      shrine.statue = pot;
    }
    // a fire of five licks: a white-hot heart, orange round it, red at the tips
    const licks = [[0xfff0c0, 0, 0.22, 1.0], [0xffb347, -0.14, 0.38, 1.25], [0xffb347, 0.15, 0.36, 1.2], [0xff6a1a, 0, 0.62, 1.15], [0xff3a10, 0.05, 0.9, 0.85]];
    for (const [col, x, yy, size] of licks) {
      const mat = new THREE.SpriteMaterial({
        map: this.flameTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      });
      const f = new THREE.Sprite(mat);
      f.center.set(0.5, 0.15); // grows up from its base
      f.position.set(x, topY + yy * 0.4, 0);
      f.userData.size = size;
      f.userData.y = topY + yy * 0.4;
      shrine.group.add(f);
      shrine.flames.push(f);
      this._mats.push(mat);
    }
    shrine.top = topY + 0.8;
  }

  /** Motes of the spirit's colour, drifting up round it in a slow spiral. */
  _buildMotes(shrine) {
    const pos = new Float32Array(MOTES * 3);
    const seed = new Float32Array(MOTES);
    for (let i = 0; i < MOTES; i++) seed[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      map: this.arena.dot, color: shrine.color, size: 0.16, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    shrine.group.add(pts);
    shrine.motes = { pts, seed };
    this._geos.push(geo);
    this._mats.push(mat);
  }

  /* ------------------------------------------------------------ state */

  /** Can that shrine give its gift right now? */
  ready(id) {
    const s = this.shrines.find((x) => x.id === id);
    return !!s && !s.taken && s.charge >= 1;
  }

  /** How many gifts are ready to be taken. */
  get remaining() {
    return this.shrines.filter((s) => !s.taken && s.charge >= 1).length;
  }

  /* ------------------------------------------------------------ per frame */

  update(dt, time, kaiPos, camera = null) {
    for (const s of this.shrines) {
      // a sleeping stag wakes over its recharge time
      if (!s.taken && s.charge < 1 && s.gift.recharge) {
        s.charge = Math.min(1, s.charge + dt / s.gift.recharge);
        if (s.charge >= 1) {
          this.arena.burst(s.group.position.x, s.group.position.z, {
            color: s.gift.color, count: 30, speed: 2.4, size: 0.26, y: s.group.position.y + 1.2, lift: 2.2, additive: true,
          });
          this.onReady?.(s.id, s.gift);
        }
      }
      const ready = !s.taken && s.charge >= 1;
      const pulse = 0.5 + 0.5 * Math.sin(time * 2.2 + s.group.position.x);
      s.u.uFill.value = s.taken ? 0 : s.charge;
      // the ember's spirit is its fire: the brazier only catches a little of the glow
      s.u.uGlow.value = (ready ? 0.75 + 0.35 * pulse : 0.45) * (s.flames.length ? 0.3 : 1);
      s.ring.material.opacity = ready ? 0.55 + 0.25 * pulse : 0.06 + 0.2 * (s.taken ? 0 : s.charge);
      s.ring.rotation.y = time * 0.12;
      this._updateMotes(s, time, ready, dt);
      for (let k = 0; k < s.flames.length; k++) {
        const f = s.flames[k];
        const flick = 0.8 + 0.2 * Math.sin(time * (11 + k * 3.7) + k * 2.1) + Math.random() * 0.1;
        // burning while it's ready; a bed of embers once its gift is given
        const sway = Math.sin(time * 5.3 + k * 1.7) * 0.06;
        f.scale.set(f.userData.size * (ready ? 0.6 : 0.3) * flick, f.userData.size * (ready ? 1.4 : 0.3) * flick, 1);
        f.material.rotation = ready ? sway : 0;
        f.position.y = f.userData.y + (ready ? 0 : -0.15);
        f.material.opacity = ready ? 0.9 : 0.45;
      }

      if (ready && kaiPos && Math.hypot(kaiPos.x - s.group.position.x, kaiPos.z - s.group.position.z) < PICKUP) {
        this._take(s, kaiPos);
      }
    }
    this._updateLeaps(dt, kaiPos);
    this._updateMarkers(kaiPos, camera);
  }

  _take(s, kaiPos) {
    if (!s.gift.recharge && !this.state.collectAward(s.id)) return;
    if (s.gift.recharge) s.charge = 0;
    else s.taken = true;
    const p = s.group.position;
    this.arena.burst(p.x, p.z, { color: s.gift.color, count: 44, speed: 3.4, size: 0.3, y: p.y + 1.2, lift: 2.6, additive: true });
    this._leap(s, kaiPos);
    this.onCollect?.(s.id, s.gift);
  }

  _updateMotes(s, time, ready, dt) {
    const { pts, seed } = s.motes;
    const a = pts.geometry.attributes.position;
    const h = (s.top || 1.6) + 0.6;
    for (let i = 0; i < MOTES; i++) {
      const k = (seed[i] + time * (0.08 + seed[i] * 0.05)) % 1; // 0 at the circle, 1 above the spirit
      const ang = seed[i] * 40 + time * (0.5 + seed[i] * 0.4);
      const r = CIRCLE_R * (0.95 - 0.55 * k);
      a.setXYZ(i, Math.cos(ang) * r, 0.1 + k * h, Math.sin(ang) * r);
    }
    a.needsUpdate = true;
    const want = ready ? 0.85 : 0;
    pts.material.opacity += (want - pts.material.opacity) * (1 - Math.exp(-4 * dt));
    pts.visible = pts.material.opacity > 0.02;
  }

  /* ------------------------------------------------------------ the spirit leaps */

  /** A ghost of the spirit, out of the stone and into Kai. */
  _leap(s, kaiPos) {
    if (!kaiPos) return;
    let ghost;
    const mat = new THREE.MeshBasicMaterial({
      color: s.color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    if (s.statue && s.gift.spirit !== 'ember') {
      ghost = s.statue.clone();
      ghost.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; } });
      s.statue.getWorldPosition(ghost.position);
      ghost.quaternion.copy(s.statue.getWorldQuaternion(new THREE.Quaternion()));
      ghost.scale.copy(s.statue.getWorldScale(new THREE.Vector3()));
    } else {
      // the ember's spirit is a ball of its fire
      const smat = new THREE.SpriteMaterial({ map: this.arena.dot, color: s.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
      ghost = new THREE.Sprite(smat);
      ghost.scale.setScalar(1.4);
      ghost.position.set(s.group.position.x, s.group.position.y + (s.top || 1), s.group.position.z);
      this._mats.push(smat);
    }
    this.arena.root.add(ghost);
    this._mats.push(mat);
    this.leaps.push({ ghost, mat, from: ghost.position.clone(), scale: ghost.scale.clone(), t: 0, color: s.gift.color });
  }

  _updateLeaps(dt, kaiPos) {
    for (let i = this.leaps.length - 1; i >= 0; i--) {
      const L = this.leaps[i];
      L.t += dt / LEAP_TIME;
      const k = Math.min(1, L.t);
      const e = k * k * (3 - 2 * k);
      if (kaiPos) {
        L.ghost.position.set(
          L.from.x + (kaiPos.x - L.from.x) * e,
          L.from.y + (kaiPos.y + 1.1 - L.from.y) * e + Math.sin(k * Math.PI) * 1.6,
          L.from.z + (kaiPos.z - L.from.z) * e,
        );
        // a bound: it faces where it's going
        if (L.ghost.isMesh || L.ghost.isGroup) L.ghost.rotation.y = Math.atan2(kaiPos.x - L.from.x, kaiPos.z - L.from.z);
      }
      L.ghost.scale.copy(L.scale).multiplyScalar(1 - 0.65 * e);
      const op = 0.85 * (1 - Math.max(0, (k - 0.6) / 0.4));
      if (L.ghost.isSprite) L.ghost.material.opacity = op; else L.mat.opacity = op;
      if (k >= 1) {
        if (kaiPos) this.arena.burst(kaiPos.x, kaiPos.z, { color: L.color, count: 26, speed: 2.2, size: 0.22, y: kaiPos.y + 1.1, lift: 1.4, additive: true });
        this.arena.root.remove(L.ghost);
        this.leaps.splice(i, 1);
      }
    }
  }

  /* ------------------------------------------------------------ markers */

  _buildMarkers() {
    if (typeof document === 'undefined') return;
    const layer = document.createElement('div');
    Object.assign(layer.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '40' });
    document.body.appendChild(layer);
    this.markerLayer = layer;
    for (const s of this.shrines) {
      const el = document.createElement('div');
      Object.assign(el.style, {
        position: 'absolute', transform: 'translate(-50%,-50%)', display: 'none', textAlign: 'center',
        font: "600 10px/1.2 'Segoe UI',system-ui,sans-serif", letterSpacing: '.12em', color: s.gift.css,
        textShadow: '0 1px 2px #000, 0 0 8px ' + s.gift.css,
      });
      el.innerHTML = `<div style="width:28px;height:28px;margin:0 auto 2px;border-radius:50%;border:1.5px solid ${s.gift.css};`
        + `background:rgba(10,14,12,.6);box-shadow:0 0 10px ${s.gift.css}88;display:flex;align-items:center;justify-content:center;font-size:14px">${s.gift.icon}</div><span></span>`;
      layer.appendChild(el);
      s.marker = el;
      s.markerDist = el.querySelector('span');
    }
    this._ndc = new THREE.Vector3();
  }

  /**
   * A ready shrine that's off screen (or far) gets a marker: over it when it's
   * in view, else on an ellipse round the middle of the screen in its
   * direction, which keeps clear of the bars at the top and the buttons in the
   * corners. Behind the camera, it goes to the bottom of the ellipse.
   */
  _updateMarkers(kaiPos, camera) {
    if (!this.markerLayer) return;
    const W = window.innerWidth, H = window.innerHeight;
    const RX = 0.72, RY = 0.6; // the ellipse, in NDC
    for (const s of this.shrines) {
      const el = s.marker;
      const ready = !s.taken && s.charge >= 1;
      if (!ready || !kaiPos || !camera || this.hidden) { el.style.display = 'none'; continue; }
      const p = s.group.position;
      const dist = Math.hypot(p.x - kaiPos.x, p.z - kaiPos.z);
      const v = this._ndc.set(p.x, p.y + 1.2, p.z).project(camera);
      const behind = v.z > 1;
      const inView = !behind && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95;
      if (inView && dist < MARK_NEAR) { el.style.display = 'none'; continue; }
      let x = v.x, y = v.y;
      if (inView) {
        y = Math.min(0.75, y + 0.12); // just over it
      } else {
        if (behind) { x = -x; y = -Math.abs(y) - 0.5; }
        const m = Math.hypot(x / RX, y / RY) || 1;
        x /= m; y /= m;
      }
      el.style.display = 'block';
      el.style.left = `${(x * 0.5 + 0.5) * W}px`;
      el.style.top = `${(-y * 0.5 + 0.5) * H}px`;
      s.markerDist.textContent = `${Math.round(dist)} M`;
    }
  }

  /** Hide the markers (cutscenes, the end). */
  setMarkersVisible(v) {
    this.hidden = !v;
    if (!v && this.markerLayer) for (const s of this.shrines) s.marker.style.display = 'none';
  }

  dispose() {
    for (const g of this._geos) g.dispose();
    for (const m of this._mats) m.dispose();
    this.runeTex.dispose();
    this.flameTex.dispose();
    this.markerLayer?.remove();
  }
}
