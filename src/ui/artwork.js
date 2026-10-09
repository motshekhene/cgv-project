/**
 * The game's front-of-house artwork, shared by the title screen and the
 * loading screen so the two read as one thing:
 *
 *   forestBackdrop()   the valley at dawn in faceted low-poly layers (the
 *                      same look as the levels): far ridges, the canopy,
 *                      near trunks and ferns. Each layer is a <g data-depth>,
 *                      so a page can parallax it.
 *   hornEmblem()       the horn from the stone, as an SVG mark, ivory with the
 *                      cyan woken in it. With { fill: true } it carries a cyan
 *                      copy clipped by a rect you can grow (.horn-fill rect),
 *                      which the loading screen uses as its progress.
 *   Fireflies          a canvas of drifting amber and cyan motes.
 *
 * Nothing here downloads: it is all generated, so it is ready the instant
 * the page is.
 */

/** A small seeded RNG, so the forest is the same forest every time. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A faceted crown: an irregular polygon round (cx, cy), like the levels' low-poly trees. */
function crown(r, cx, cy, rad, sides = 7) {
  const pts = [];
  const a0 = r() * Math.PI;
  for (let i = 0; i < sides; i++) {
    const a = a0 + (i / sides) * Math.PI * 2;
    const k = rad * (0.78 + r() * 0.34);
    pts.push(`${(cx + Math.cos(a) * k).toFixed(1)},${(cy + Math.sin(a) * k * 0.82).toFixed(1)}`);
  }
  return pts.join(' ');
}

export function forestBackdrop() {
  const r = rng(20261009);
  // far ridges: two jagged bands against the dawn
  const ridge = (base, amp, step) => {
    let d = `M0,900 L0,${base}`;
    for (let x = 0; x <= 1600; x += step) d += ` L${x},${(base - r() * amp).toFixed(0)}`;
    return d + ' L1600,900 Z';
  };
  let canopy = '';
  for (let x = -40; x < 1680; x += 70 + r() * 50) {
    const y = 600 + r() * 50;
    const h = 120 + r() * 90;
    canopy += `<rect x="${(x - 5).toFixed(0)}" y="${(y - 10).toFixed(0)}" width="10" height="${(900 - y).toFixed(0)}" />`;
    canopy += `<polygon points="${crown(r, x, y - h * 0.35, 60 + r() * 40)}" />`;
    if (r() > 0.4) canopy += `<polygon points="${crown(r, x + 30, y - h * 0.55, 40 + r() * 25)}" />`;
  }
  let near = '';
  for (const [x, w, lean] of [[90, 34, -0.04], [250, 22, 0.05], [1330, 28, 0.03], [1510, 40, -0.05]]) {
    near += `<polygon points="${x - w / 2},900 ${x + w / 2},900 ${x + w * 0.3 + lean * 900},0 ${x - w * 0.3 + lean * 900},0" />`;
  }
  for (let x = -30; x < 1640; x += 55 + r() * 40) {
    near += `<polygon points="${crown(r, x, 880 + r() * 30, 70 + r() * 40, 6)}" />`;
  }
  return `
<svg class="art-forest" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <defs>
    <linearGradient id="art-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0a1416"/><stop offset=".45" stop-color="#1d3330"/>
      <stop offset=".7" stop-color="#6b5a3a"/><stop offset=".86" stop-color="#d79a52"/><stop offset="1" stop-color="#2b2a1c"/>
    </linearGradient>
    <radialGradient id="art-sun" cx=".5" cy=".72" r=".5">
      <stop offset="0" stop-color="#ffd38a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd38a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#art-sky)"/>
  <rect width="1600" height="900" fill="url(#art-sun)"/>
  <g data-depth="0.15" fill="#22362c" opacity=".85"><path d="${ridge(560, 160, 80)}"/></g>
  <g data-depth="0.3" fill="#172720"><path d="${ridge(640, 110, 60)}"/></g>
  <g data-depth="0.55" fill="#0f1c16">${canopy}</g>
  <g data-depth="1" fill="#070d0a">${near}</g>
</svg>`;
}

// the horn: thick at the base (lower left), curling up and over to a fine point
const HORN_PATH =
  'M38,168 C30,104 76,42 146,40 C196,39 226,72 224,112 C223,138 204,154 186,150 ' +
  'C204,138 206,112 192,94 C174,72 142,66 114,78 C84,92 70,124 76,168 Z';
const HORN_RINGS = [
  'M44,140 C54,138 66,140 76,146', 'M50,110 C62,110 76,114 84,122', 'M66,82 C78,86 90,92 96,100',
  'M92,60 C100,68 108,76 112,84', 'M124,46 C126,56 128,66 128,76', 'M158,42 C156,54 154,64 150,72',
];

export function hornEmblem({ fill = false, id = 'horn' } = {}) {
  const rings = HORN_RINGS.map((d) => `<path d="${d}" />`).join('');
  return `
<svg class="art-horn" viewBox="0 0 260 200" aria-hidden="true">
  <defs>
    <linearGradient id="${id}-ivory" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#d9ccb0"/><stop offset=".6" stop-color="#b3a488"/><stop offset="1" stop-color="#8f8168"/>
    </linearGradient>
    <linearGradient id="${id}-cyan" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#d8fbff"/><stop offset=".5" stop-color="#4fd6e0"/><stop offset="1" stop-color="#1b8c99"/>
    </linearGradient>
    <filter id="${id}-glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    ${fill ? `<clipPath id="${id}-clip"><rect class="horn-fill" x="0" y="0" width="0" height="200"/></clipPath>` : ''}
  </defs>
  <path d="${HORN_PATH}" fill="url(#${id}-ivory)" opacity="${fill ? 0.35 : 1}"/>
  <g filter="url(#${id}-glow)" ${fill ? `clip-path="url(#${id}-clip)"` : ''}>
    <path d="${HORN_PATH}" fill="url(#${id}-cyan)" opacity="${fill ? 1 : 0.55}"/>
  </g>
  <g fill="none" stroke="#2b2219" stroke-opacity=".35" stroke-width="2.2" stroke-linecap="round">${rings}</g>
</svg>`;
}

/** Drifting motes over the art: amber pollen and a few cyan sparks. start()/stop() with the page. */
export class Fireflies {
  constructor(canvas, count = 70) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    const r = rng(7);
    this.motes = Array.from({ length: count }, () => ({
      x: r(), y: r(), s: 0.6 + r() * 1.8, sp: 0.004 + r() * 0.01, ph: r() * 6.28,
      cyan: r() < 0.18,
    }));
    this._frame = this._frame.bind(this);
    this._raf = 0;
  }

  start() {
    if (!this._raf) this._raf = requestAnimationFrame(this._frame);
  }

  stop() {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  _frame(now) {
    this._raf = requestAnimationFrame(this._frame);
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const t = now / 1000;
    for (const m of this.motes) {
      m.y -= m.sp * 0.016;
      if (m.y < -0.05) { m.y = 1.05; m.x = Math.random(); }
      const x = (m.x + Math.sin(t * 0.6 + m.ph) * 0.012) * w;
      const y = m.y * h;
      const tw = 0.45 + 0.55 * Math.sin(t * 2.2 + m.ph * 3);
      const rad = m.s * (m.cyan ? 1.6 : 1.2);
      const grad = g.createRadialGradient(x, y, 0, x, y, rad * 4);
      const col = m.cyan ? '111,227,240' : '255,206,120';
      grad.addColorStop(0, `rgba(${col},${0.85 * tw})`);
      grad.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, rad * 4, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** Shared CSS for the backdrop, emblem and motes (the title and loading screens both include it). */
export const ART_CSS = `
.art-forest { position:absolute; inset:0; width:100%; height:100%; }
.art-forest g { transition:transform .6s cubic-bezier(.2,.7,.2,1); }
.art-motes { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
.art-vignette { position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 35%, rgba(2,5,4,.55) 75%, rgba(2,5,4,.9) 100%); }
.art-horn { display:block; overflow:visible; }
`;
