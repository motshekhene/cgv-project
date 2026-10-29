import * as THREE from 'three';

/**
 * A torn page from the company's papers, made to be seen from down the trail:
 * a sheet of old paper ripped along its top edge, typed lines under a MEMO
 * heading, a red CONFIDENTIAL stamp and a ring where a mug stood, curled a
 * little like paper does, and lit from within (its own picture is its
 * emissive map, so it glows softly through the bloom in the dark forest).
 * Behind it a warm halo, so it reads as something to run for. Three tears
 * and layouts, by `seed`, drawn once each on a canvas and shared.
 *
 *   const page = createTornPage(seed);   // a Group about 0.46 x 0.6 m, facing +z
 *   page.userData.flutter(time);          // sway it like paper in moving air
 *
 * Levels 1 and 3 both use it (Level01 _buildStoryLetters, level3/Letters.js).
 */
const W = 384, H = 512;
const textures = new Map();
let haloTex = null;

function seeded(seed) {
  let s = (seed * 9301 + 49297) % 233280 || 1;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

function pageTexture(seed) {
  const key = seed % 3;
  if (textures.has(key)) return textures.get(key);
  const rnd = seeded(key + 7);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  // the sheet: torn along the top, the other edges a little worn
  const edge = [];
  for (let x = 10; x <= W - 10; x += 9) edge.push([x, 22 + (rnd() - 0.5) * 22 + (x % 27 === 0 ? 8 : 0)]);
  g.beginPath();
  g.moveTo(edge[0][0], edge[0][1]);
  for (const [x, y] of edge) g.lineTo(x, y);
  g.lineTo(W - 10 + (rnd() - 0.5) * 3, H - 12);
  g.lineTo(12, H - 10 + (rnd() - 0.5) * 3);
  g.closePath();
  const paper = g.createLinearGradient(0, 0, W, H);
  paper.addColorStop(0, '#f4ecd6');
  paper.addColorStop(1, '#ddcca2');
  g.fillStyle = paper;
  g.fill();
  g.save();
  g.clip();
  // age: a few stains, a mug ring, the fold across the middle
  for (let i = 0; i < 4; i++) {
    const x = rnd() * W, y = rnd() * H, r = 30 + rnd() * 70;
    const st = g.createRadialGradient(x, y, 0, x, y, r);
    st.addColorStop(0, 'rgba(150,108,48,.16)');
    st.addColorStop(1, 'rgba(150,108,48,0)');
    g.fillStyle = st;
    g.fillRect(0, 0, W, H);
  }
  g.strokeStyle = 'rgba(130,90,40,.22)';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(W * (0.62 + rnd() * 0.2), H * (0.72 + rnd() * 0.12), 44, 0.3, Math.PI * 1.85);
  g.stroke();
  const fold = g.createLinearGradient(0, H * 0.48, 0, H * 0.52);
  fold.addColorStop(0, 'rgba(0,0,0,0)');
  fold.addColorStop(0.5, 'rgba(90,70,40,.18)');
  fold.addColorStop(1, 'rgba(255,255,255,.12)');
  g.fillStyle = fold;
  g.fillRect(0, H * 0.48, W, H * 0.04);
  // MEMO, a rule, then typed lines (bars of ink that read as type from a few metres)
  g.fillStyle = '#2b2219';
  g.font = 'bold 30px "Courier New", Courier, monospace';
  g.fillText(['MEMO', 'CREW LOG', 'CONTRACT'][key], 34, 82);
  g.fillRect(34, 96, W - 68, 3);
  g.globalAlpha = 0.78;
  for (let y = 126; y < H - 40; y += 24) {
    let x = 34;
    const end = W - 34 - (rnd() < 0.2 ? 90 + rnd() * 120 : 0);
    while (x < end - 20) {
      const w = Math.min(end - x, 14 + rnd() * 52);
      g.fillRect(x, y, w, 7);
      x += w + 9;
    }
  }
  g.globalAlpha = 1;
  // the stamp
  g.save();
  g.translate(W * 0.58, H * 0.36);
  g.rotate(-0.24);
  g.strokeStyle = 'rgba(176,28,22,.8)';
  g.fillStyle = 'rgba(176,28,22,.8)';
  g.lineWidth = 5;
  g.strokeRect(-122, -26, 244, 52);
  g.font = 'bold 30px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('CONFIDENTIAL', 0, 2, 226);
  g.restore();
  g.restore();
  // the torn edge darker, as paper is where it's been ripped
  g.strokeStyle = 'rgba(120,88,46,.55)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(edge[0][0], edge[0][1]);
  for (const [x, y] of edge) g.lineTo(x, y);
  g.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  textures.set(key, tex);
  return tex;
}

function halo() {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,240,200,1)');
  gr.addColorStop(0.35, 'rgba(255,214,150,.4)');
  gr.addColorStop(1, 'rgba(255,214,150,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  haloTex = new THREE.CanvasTexture(c);
  return haloTex;
}

export function createTornPage(seed = 0) {
  const map = pageTexture(seed);
  const geo = new THREE.PlaneGeometry(0.46, 0.61, 10, 12);
  // curled: the sides lift toward the viewer, and a slow wave down its length
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, 0.06 * (x / 0.23) ** 2 - 0.03 + 0.015 * Math.sin(y * 9));
  }
  geo.computeVertexNormals();
  const sheet = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.92, metalness: 0,
    emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.42,
  }));
  sheet.castShadow = true;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: halo(), color: 0xffe2b0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glow.scale.setScalar(1.5);
  glow.position.z = -0.06;
  const page = new THREE.Group();
  page.add(glow, sheet);
  const phase = seed * 1.7;
  page.userData.flutter = (t) => {
    sheet.rotation.x = Math.sin(t * 1.9 + phase) * 0.18;
    sheet.rotation.z = Math.sin(t * 1.3 + phase + 1) * 0.12;
    glow.material.opacity = 0.45 + Math.sin(t * 2.6 + phase) * 0.12;
  };
  return page;
}
