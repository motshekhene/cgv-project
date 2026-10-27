import * as THREE from 'three';
import { cardsForLevel, collect, foundCount, CARDS } from './cards.js';
import { cardCanvas, cardBackCanvas } from './cardArt.js';

/**
 * The spirit cards hidden in one level (cards.js), as 3D pickups: each one a
 * card standing on edge in the air, its own art on the front and the shared
 * back behind, turning slowly and bobbing, with a soft glow round it in its
 * rarity's colour (gold for a legendary). Run (or drive) through it and it
 * is yours: it's saved, and the card flips up on screen.
 *
 *   this.cards = new CardPickups(this.root, 'level01', (spot) => worldPosition);
 *   this.cards.update(dt, playerPosition, radius);   // every frame
 *   this.cards.dispose();                              // teardown (the root's dispose frees the meshes)
 */
const GLOW = { 1: 0x9fd8a0, 2: 0xc89cff, 3: 0xffd36a };
const _v = new THREE.Vector3();

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class CardPickups {
  constructor(parent, level, place) {
    this.items = [];
    this.t = 0;
    const back = new THREE.CanvasTexture(cardBackCanvas());
    back.colorSpace = THREE.SRGBColorSpace;
    const glowTex = glowTexture();
    const geo = new THREE.PlaneGeometry(0.72, 1.01);
    for (const { card, spot, daily } of cardsForLevel(level)) {
      const tex = new THREE.CanvasTexture(cardCanvas(card));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const group = new THREE.Group();
      const front = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide }));
      const rear = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: back, side: THREE.FrontSide }));
      rear.rotation.y = Math.PI;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: GLOW[card.rarity] || 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85,
      }));
      glow.scale.setScalar(card.rarity >= 3 ? 3.2 : 2.2);
      group.add(glow, front, rear);
      group.position.copy(place(spot));
      group.scale.setScalar(card.rarity >= 3 ? 1.35 : 1.15);
      parent.add(group);
      this.items.push({ card, group, glow, daily, base: group.position.y, phase: Math.random() * 6, taken: false });
    }
  }

  /** `at`: the player (or the car); `radius`: how close counts as through it. */
  update(dt, at, radius = 1.2) {
    this.t += dt;
    for (const it of this.items) {
      if (it.taken) continue;
      it.group.rotation.y += dt * 1.4;
      it.group.position.y = it.base + Math.sin(this.t * 2 + it.phase) * 0.15;
      it.glow.material.opacity = 0.6 + 0.25 * Math.sin(this.t * 3 + it.phase);
      if (!at) continue;
      _v.copy(it.group.position).sub(at);
      if (Math.hypot(_v.x, _v.z) < radius && Math.abs(_v.y) < 2.6) {
        it.taken = true;
        it.group.visible = false;
        const got = collect(it.card.id);
        if (got) showCardReveal(it.card, got === 'again');
      }
    }
  }

  dispose() {
    this.items.length = 0;
  }
}

/* ---------------------------------------------------------------- the reveal */

let revealEl = null;
let revealTimer = 0;

/** NEW CARD! — the card flips up to the middle of the screen, then away. `again`: one already in the album. */
export function showCardReveal(card, again = false) {
  if (typeof document === 'undefined') return;
  if (!document.getElementById('card-reveal-css')) {
    const st = document.createElement('style');
    st.id = 'card-reveal-css';
    st.textContent = `
.cr { position:fixed; left:50%; top:50%; z-index:9300; transform:translate(-50%,-50%); pointer-events:none; text-align:center; perspective:900px; }
.cr img { width:min(220px, 42vw); border-radius:12px; box-shadow:0 0 40px var(--glow), 0 12px 40px #000; animation:cr-flip .9s cubic-bezier(.2,.9,.3,1.2) both; }
.cr b { display:block; margin-bottom:10px; font:700 26px 'Crimson Pro', Georgia, serif; letter-spacing:.25em; color:var(--glow); text-shadow:0 2px 0 #000, 0 0 18px var(--glow); animation:cr-pop .5s ease-out both; }
.cr small { display:block; margin-top:10px; font:600 12px 'Crimson Pro', Georgia, serif; letter-spacing:.28em; color:#efe4c8; text-shadow:0 2px 4px #000; }
.cr.out { transition:opacity .5s, transform .5s; opacity:0; transform:translate(-50%,-62%); }
@keyframes cr-flip { from { transform:rotateY(180deg) scale(.4); opacity:0 } 60% { opacity:1 } to { transform:rotateY(0) scale(1) } }
@keyframes cr-pop { from { transform:scale(.6); opacity:0 } to { transform:scale(1); opacity:1 } }`;
    document.head.appendChild(st);
  }
  revealEl?.remove();
  clearTimeout(revealTimer);
  const el = document.createElement('div');
  el.className = 'cr';
  el.style.setProperty('--glow', card.rarity >= 3 ? '#ffd36a' : card.rarity === 2 ? '#c89cff' : '#8fe8ff');
  const title = again ? 'ALREADY IN YOUR ALBUM' : card.rarity >= 3 ? 'LEGENDARY CARD!' : card.rarity === 2 ? 'RARE CARD!' : 'NEW CARD!';
  el.innerHTML = `<b>${title}</b><img alt="${card.name}" src="${cardCanvas(card).toDataURL()}"><small>${card.name} · ${foundCount()} / ${CARDS.length} SPIRIT CARDS · A NEW ONE HIDES TOMORROW</small>`;
  document.body.appendChild(el);
  revealEl = el;
  revealTimer = setTimeout(() => {
    el.classList.add('out');
    revealTimer = setTimeout(() => el.remove(), 600);
  }, 3200);
}
