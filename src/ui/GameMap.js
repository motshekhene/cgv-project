import { THEME_CSS } from './theme.js';
import { DIALOGUE_FONT } from './dialogue.js';
import { CARD, SPOTS, isFound, todaysSpirit, dayNumber } from '../cards/cards.js';

/**
 * MAP on the main menu: the whole game on one page, three panels drawn on
 * canvases. Level 1's trail from the stone down to the camp, Level 2's River
 * Road to the falls, and the courtyard at the falls from above, each with
 * its landmarks. The spirit cards you've found are marked where they were;
 * today's spirit is a pulsing gold circle round the area its riddle points
 * to (an area, not the exact spot: the riddle still has to be read).
 *
 *   const map = new GameMap();  map.open();
 */
const GOLD = '#e3bb62', INK = '#efe4c8', DIM = 'rgba(239,228,200,.55)', DAILY = '#ffd36a';

const L1 = {
  len: 4460, lanes: [-2.4, 0, 2.4],
  marks: [
    [0, 'THE STONE'], [720, 'THE FORK'], [1010, 'DARK SHRINE'], [1318, 'FALLING BRIDGE'], [1465, 'THE GUARDIAN'],
    [2950, 'HIGH RUINS'], [4350, 'THE GATE'], [4460, 'THE CAMP'],
  ],
};
const L2 = {
  len: 8100,
  marks: [[0, 'THE TRAILHEAD'], [4700, 'BARRICADES'], [5900, 'BARRICADES'], [6950, 'BARRICADES'], [8100, 'THE FALLS']],
};
const L3 = {
  x0: -34, x1: 34, z0: -40, z1: 34,
  places: [
    { x: -7, z: -28, r: 11, kind: 'pool', label: 'THE POOL' },
    { x: -7, z: -36, r: 0, kind: 'falls', label: 'THE FALLS' },
    { x: 0, z: 0, r: 13, kind: 'yard', label: 'COURTYARD' },
    { x: -25.5, z: 9.5, r: 2.5, kind: 'shrine', label: 'STAG SHRINE', color: '#8affb8' },
    { x: 25, z: 10.5, r: 2.5, kind: 'shrine', label: 'FOX SHRINE', color: '#8fd0ff' },
    { x: -2.5, z: 27.5, r: 2.5, kind: 'shrine', label: 'EMBER SHRINE', color: '#ffb347' },
  ],
};

const CSS = THEME_CSS + `
.gm { position:fixed; inset:0; z-index:9700; display:flex; align-items:center; justify-content:center; font-family:var(--sans); color:var(--ink);
  visibility:hidden; opacity:0; pointer-events:none; transition:opacity .2s ease, visibility 0s linear .2s; }
.gm.show { visibility:visible; opacity:1; pointer-events:auto; transition:opacity .2s ease; }
.gm::before { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at center, rgba(10,12,8,.72), rgba(4,5,3,.96)); backdrop-filter:blur(3px); }
.gm-in { background:linear-gradient(180deg, rgba(30,34,22,.97), rgba(12,14,9,.97)); border:1px solid rgba(227,187,98,.4); border-radius:6px; position:relative; width:min(980px, 96vw); max-height:calc(100vh - 24px); overflow-y:auto; padding:16px 20px 12px; text-align:center; }
.gm h2 { margin:0; font-family:${DIALOGUE_FONT}; font-weight:600; font-size:clamp(24px, 3.6vw, 36px); letter-spacing:.32em; text-indent:.32em; color:var(--gold); text-shadow:0 2px 0 #000; }
.gm-riddle { margin:6px auto 10px; max-width:760px; font:italic 16px ${DIALOGUE_FONT}; color:var(--ink); }
.gm-riddle b { font:700 11px var(--sans); letter-spacing:.24em; color:#ffd36a; font-style:normal; margin-right:6px; }
.gm-panels { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; }
.gm-panel { flex:1 1 260px; max-width:310px; }
.gm-panel h3 { margin:0 0 6px; font:700 11px var(--sans); letter-spacing:.28em; color:var(--gold); }
.gm-panel canvas { width:100%; border:1px solid rgba(227,187,98,.4); border-radius:4px; background:radial-gradient(ellipse at 40% 35%, rgba(52,44,30,.92), rgba(20,17,12,.94)); }
.gm-key { margin-top:8px; font:12px var(--sans); color:var(--ink-dim); letter-spacing:.08em; }
.gm-back { display:inline-block; margin-top:10px; padding:7px 28px; cursor:pointer; font:600 13px ${DIALOGUE_FONT}; letter-spacing:.3em; color:var(--gold); border:1px solid var(--line); border-radius:2px; background:rgba(227,187,98,.08); }
`;

export class GameMap {
  constructor() {
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);
    this.el = document.createElement('div');
    this.el.className = 'gm';
    document.body.appendChild(this.el);
    this._onKey = (e) => {
      if (!this.el.classList.contains('show')) return;
      e.stopPropagation();
      if (['Escape', 'Backspace', 'Enter'].includes(e.key)) {
        e.preventDefault();
        this.close();
      }
    };
    window.addEventListener('keydown', this._onKey, true);
  }

  open() {
    const d = todaysSpirit();
    this.el.innerHTML = `
      <div class="gm-in plaque">
        <h2>THE MAP</h2>
        <div class="gm-riddle"><b>TODAY’S SPIRIT${d.found ? ' · FOUND ✓' : ''}</b>“${d.riddle}”</div>
        <div class="gm-panels">
          <div class="gm-panel"><h3>LEVEL 1 · THE OLD TRAIL</h3><canvas data-l="1" width="300" height="520"></canvas></div>
          <div class="gm-panel"><h3>LEVEL 2 · THE RIVER ROAD</h3><canvas data-l="2" width="300" height="520"></canvas></div>
          <div class="gm-panel"><h3>LEVEL 3 · THE FALLS</h3><canvas data-l="3" width="300" height="520"></canvas></div>
        </div>
        <div class="gm-key">◆ a spirit card you’ve found &nbsp; ○ gold circle: where today’s spirit hides &nbsp; · the others are still out there</div>
        <div class="gm-back" data-back>BACK</div>
      </div>`;
    this.el.querySelector('[data-back]').addEventListener('click', () => this.close());
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
    this.canvases = [...this.el.querySelectorAll('canvas')];
    this.el.classList.add('show');
    const loop = (t) => {
      if (!this.el.classList.contains('show')) return;
      this._draw(t / 1000);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  close() {
    cancelAnimationFrame(this._raf);
    this.el.classList.remove('show');
  }

  _draw(time) {
    const daily = todaysSpirit();
    const pulse = 0.5 + 0.5 * Math.sin(time * 3);
    for (const c of this.canvases) {
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      const l = c.dataset.l;
      if (l === '1') this._trail(g, c, daily, pulse);
      else if (l === '2') this._road(g, c, daily, pulse);
      else this._falls(g, c, daily, pulse);
    }
  }

  /** A route drawn top to bottom: distance along it -> y. */
  _route(g, c, len, marks, lanesX, toY, toX, roadW) {
    const top = 26, bot = c.height - 26;
    g.strokeStyle = 'rgba(227,187,98,.35)';
    g.lineWidth = roadW;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(c.width / 2, top); g.lineTo(c.width / 2, bot); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1;
    for (const lx of lanesX) { g.beginPath(); g.moveTo(toX(lx), top); g.lineTo(toX(lx), bot); g.stroke(); }
    g.font = `11px ${DIALOGUE_FONT}`;
    g.textBaseline = 'middle';
    for (const [d, label] of marks) {
      const y = toY(d);
      g.fillStyle = GOLD;
      g.fillRect(c.width / 2 - roadW / 2 - 6, y - 1, roadW + 12, 2);
      g.fillStyle = INK;
      g.textAlign = d % 2000 === 0 || label === 'THE CAMP' || label === 'THE FALLS' ? 'left' : 'left';
      g.fillText(label, c.width / 2 + roadW / 2 + 10, y);
      g.fillStyle = DIM;
      g.textAlign = 'right';
      g.fillText(`${(d / 1000).toFixed(1)} km`, c.width / 2 - roadW / 2 - 10, y);
    }
  }

  _cardMark(g, x, y, id) {
    const card = CARD[id];
    g.save();
    g.translate(x, y);
    g.rotate(Math.PI / 4);
    g.fillStyle = card.rarity >= 3 ? DAILY : '#8fe8ff';
    g.shadowColor = g.fillStyle; g.shadowBlur = 8;
    g.fillRect(-5, -5, 10, 10);
    g.restore();
  }

  /** The gold circle round today's spirit: centred near it, not on it. */
  _daily(g, x, y, r, pulse) {
    const n = dayNumber();
    const ox = Math.sin(n * 12.9898) * r * 0.45, oy = Math.cos(n * 78.233) * r * 0.45;
    g.strokeStyle = DAILY;
    g.lineWidth = 2;
    g.globalAlpha = 0.5 + 0.5 * pulse;
    g.setLineDash([5, 4]);
    g.beginPath(); g.arc(x + ox, y + oy, r, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 0.12 + 0.12 * pulse;
    g.fillStyle = DAILY;
    g.fill();
    g.globalAlpha = 1;
    g.fillStyle = DAILY;
    g.font = `700 16px ${DIALOGUE_FONT}`;
    g.textAlign = 'center';
    g.fillText('?', x + ox, y + oy);
  }

  _trail(g, c, daily, pulse) {
    const top = 26, bot = c.height - 26, mid = c.width / 2, W = 34;
    const toY = (d) => top + (d / L1.len) * (bot - top);
    const toX = (lx) => mid + (lx / 3.6) * (W / 2);
    this._route(g, c, L1.len, L1.marks, L1.lanes, toY, toX, W);
    for (const [id, s] of Object.entries(SPOTS)) if (s.level === 'level01' && isFound(id)) this._cardMark(g, toX(LANE(s.lane)), toY(-s.z), id);
    if (daily.spot.level === 'level01' && !daily.found) this._daily(g, mid, toY(-daily.spot.z), 26, pulse);
    if (daily.found && daily.spot.level === 'level01') this._cardMark(g, toX(LANE(daily.spot.lane)), toY(-daily.spot.z), daily.card.id);
  }

  _road(g, c, daily, pulse) {
    const top = 26, bot = c.height - 26, mid = c.width / 2, W = 44;
    const toY = (d) => top + (d / L2.len) * (bot - top);
    const toX = (x) => mid + (x / 12) * (W / 2);
    this._route(g, c, L2.len, L2.marks, [-6, 0, 6], toY, toX, W);
    for (const [id, s] of Object.entries(SPOTS)) if (s.level === 'level02' && isFound(id)) this._cardMark(g, toX(s.x), toY(s.z), id);
    if (daily.spot.level === 'level02' && !daily.found) this._daily(g, mid, toY(daily.spot.z), 28, pulse);
    if (daily.found && daily.spot.level === 'level02') this._cardMark(g, toX(daily.spot.x), toY(daily.spot.z), daily.card.id);
  }

  _falls(g, c, daily, pulse) {
    const pad = 20;
    const sx = (c.width - pad * 2) / (L3.x1 - L3.x0), sz = (c.height - pad * 2) / (L3.z1 - L3.z0);
    const k = Math.min(sx, sz);
    const toX = (x) => c.width / 2 + x * k;
    const toY = (z) => pad + (z - L3.z0) * k;
    g.font = `11px ${DIALOGUE_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // the jungle ring
    g.strokeStyle = 'rgba(111,191,74,.35)'; g.lineWidth = 18;
    g.beginPath(); g.arc(toX(0), toY(8), 27 * k, 0, Math.PI * 2); g.stroke();
    for (const p of L3.places) {
      const x = toX(p.x), y = toY(p.z);
      if (p.kind === 'pool') { g.fillStyle = 'rgba(79,180,224,.55)'; g.beginPath(); g.arc(x, y, p.r * k, 0, Math.PI * 2); g.fill(); }
      else if (p.kind === 'falls') { g.fillStyle = '#d8f4ff'; g.fillRect(x - 3.5 * k, y - 4, 7 * k, 8); }
      else if (p.kind === 'yard') { g.strokeStyle = GOLD; g.lineWidth = 2; g.beginPath(); g.arc(x, y, p.r * k, 0, Math.PI * 2); g.stroke(); }
      else { g.fillStyle = p.color; g.beginPath(); g.arc(x, y, p.r * k, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = INK;
      g.fillText(p.label, x, y + (p.kind === 'falls' ? -12 : p.kind === 'shrine' ? 16 : 0));
    }
    for (const [id, s] of Object.entries(SPOTS)) if (s.level === 'level03' && isFound(id)) this._cardMark(g, toX(s.x), toY(s.z), id);
    if (daily.spot.level === 'level03' && !daily.found) this._daily(g, toX(daily.spot.x), toY(daily.spot.z), 7 * k, pulse);
    if (daily.found && daily.spot.level === 'level03') this._cardMark(g, toX(daily.spot.x), toY(daily.spot.z), daily.card.id);
  }
}

const LANE = (lane) => [-2.4, 0, 2.4][lane] ?? 0;
