import { DIALOGUE_FONT } from './dialogue.js';

/**
 * TrailMap — the old map of the way to the stone, in a corner of the screen
 * on the prologue's walk: the winding path, the camp and its fire, the last
 * crew's camp, the stag, the gates, and the stone with the horn on it (the
 * one cyan thing). Kai is the arrow, pointing the way he is walking. Only
 * the part of the path he has walked is inked in; the rest is faint, as if
 * drawn from memory. N makes it big, and small again.
 *
 * A plain 2D canvas, drawn only when something on it changes.
 *
 *   const map = new TrailMap({ path, marks });
 *   map.show(true);
 *   map.update(x, z, heading, walkedMetres);
 *   map.dispose();
 */
const SMALL = 190;
const BIG = 420;

export class TrailMap {
  /**
   * path:  [{ x, z, s }] the walk, in order (s: metres along it)
   * marks: [{ x, z, kind: 'fire' | 'camp' | 'stag' | 'gate' | 'stone', label }]
   */
  constructor({ path, marks = [] }) {
    this.path = path;
    this.marks = marks;
    this.big = false;
    this._last = '';
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of [...path, ...marks]) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }
    const pad = 6;
    this.box = { x0: x0 - pad, x1: x1 + pad, z0: z0 - pad, z1: z1 + pad };

    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:fixed;left:18px;bottom:18px;z-index:8500;pointer-events:none;opacity:0;transition:opacity .5s,width .25s,height .25s;' +
      'background:radial-gradient(ellipse at 40% 35%, rgba(52,44,30,.92), rgba(20,17,12,.94));border:1px solid rgba(227,187,98,.55);' +
      'box-shadow:0 6px 24px rgba(0,0,0,.55), inset 0 0 22px rgba(0,0,0,.6);border-radius:6px;overflow:hidden';
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%';
    this.el.appendChild(this.canvas);
    this.caption = document.createElement('div');
    this.caption.style.cssText = `position:absolute;left:0;right:0;bottom:4px;text-align:center;font-family:${DIALOGUE_FONT};` +
      'font-size:11px;letter-spacing:.22em;color:rgba(227,187,98,.85);text-shadow:0 1px 3px #000';
    this.el.appendChild(this.caption);
    document.body.appendChild(this.el);
    this._size();

    this._onKey = (e) => {
      if (e.code === 'KeyN' && this.visible) {
        this.big = !this.big;
        this._size();
      }
    };
    window.addEventListener('keydown', this._onKey);
  }

  _size() {
    const aspect = (this.box.x1 - this.box.x0) / (this.box.z1 - this.box.z0);
    const h = Math.min(this.big ? BIG : SMALL, window.innerHeight * 0.7);
    const w = Math.max(110, h * aspect);
    this.el.style.width = `${w}px`;
    this.el.style.height = `${h}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.caption.textContent = this.big ? 'THE OLD PATH  ·  N TO CLOSE' : 'N · MAP';
    this._last = '';
  }

  show(on) {
    this.visible = on;
    this.el.style.opacity = on ? '1' : '0';
  }

  /** World x/z to canvas pixels: north (-z) up. */
  _px(x, z) {
    const b = this.box, c = this.canvas;
    return [((x - b.x0) / (b.x1 - b.x0)) * c.width, ((z - b.z0) / (b.z1 - b.z0)) * c.height];
  }

  update(x, z, heading, walked) {
    if (!this.visible) return;
    const key = `${x.toFixed(1)},${z.toFixed(1)},${heading.toFixed(2)},${Math.round(walked)},${this.canvas.width}`;
    if (key === this._last) return;
    this._last = key;
    const c = this.canvas, g = c.getContext('2d');
    const k = c.height / 190; // line widths scale with the map
    g.clearRect(0, 0, c.width, c.height);

    // the path: faint ahead, inked where he has been
    const line = (from, to, style, width, dash = []) => {
      g.beginPath();
      let first = true;
      for (const p of this.path) {
        if (p.s < from || p.s > to) continue;
        const [px, py] = this._px(p.x, p.z);
        if (first) { g.moveTo(px, py); first = false; } else g.lineTo(px, py);
      }
      g.strokeStyle = style;
      g.lineWidth = width;
      g.lineCap = g.lineJoin = 'round';
      g.setLineDash(dash);
      g.stroke();
      g.setLineDash([]);
    };
    line(0, Infinity, 'rgba(227,187,98,.28)', 3 * k, [4 * k, 4 * k]);
    line(0, walked, 'rgba(240,214,150,.9)', 3.2 * k);

    for (const m of this.marks) {
      const [px, py] = this._px(m.x, m.z);
      g.save();
      g.translate(px, py);
      if (m.kind === 'stone') {
        g.shadowColor = '#4fd6e0'; g.shadowBlur = 10 * k;
        g.fillStyle = '#4fd6e0';
        g.beginPath(); g.arc(0, 0, 4.5 * k, 0, Math.PI * 2); g.fill();
      } else if (m.kind === 'fire') {
        g.fillStyle = '#ff9a3a';
        g.beginPath(); g.moveTo(0, -5 * k); g.quadraticCurveTo(4 * k, 0, 0, 4 * k); g.quadraticCurveTo(-4 * k, 0, 0, -5 * k); g.fill();
      } else if (m.kind === 'gate') {
        g.strokeStyle = 'rgba(227,187,98,.8)'; g.lineWidth = 1.6 * k;
        g.beginPath(); g.arc(0, 1.5 * k, 3.5 * k, Math.PI, 0); g.stroke();
      } else {
        g.fillStyle = m.kind === 'camp' ? 'rgba(180,160,120,.85)' : 'rgba(200,200,190,.85)';
        g.fillRect(-2.5 * k, -2.5 * k, 5 * k, 5 * k);
      }
      g.restore();
      if (this.big && m.label) {
        g.font = `${10 * k * 0.7}px ${DIALOGUE_FONT}`;
        g.fillStyle = 'rgba(240,226,190,.8)';
        g.fillText(m.label, px + 7 * k * 0.7, py + 3 * k * 0.7);
      }
    }

    // Kai: an arrow the way he's facing
    const [kx, ky] = this._px(x, z);
    g.save();
    g.translate(kx, ky);
    g.rotate(heading);
    g.fillStyle = '#9ed36a';
    g.shadowColor = '#000'; g.shadowBlur = 4 * k;
    g.beginPath();
    g.moveTo(0, -7 * k); g.lineTo(4.5 * k, 5 * k); g.lineTo(0, 2.5 * k); g.lineTo(-4.5 * k, 5 * k);
    g.closePath(); g.fill();
    g.restore();
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey);
    this.el.remove();
  }
}
