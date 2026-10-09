/**
 * Fireflies — a canvas of drifting amber and cyan motes, for the DOM screens
 * that sit over or between the levels (the loading screen).
 */

/** A small seeded RNG, so the motes start the same way every time. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Amber pollen and a few cyan sparks, drifting up. start()/stop() with the page. */
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
