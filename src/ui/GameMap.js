import { THEME_CSS } from './theme.js';
import { DIALOGUE_FONT } from './dialogue.js';
import { CARD, todaysCard } from '../cards/cards.js';
import { VALLEY, LANDMARKS, WALK_PTS } from '../levels/prologue/places.js';

/**
 * MAP on the main menu: the whole game on one page, four panels drawn on
 * canvases, every landmark named: the prologue's valley (the camp, the old
 * path, the stone, and the places off it), Level 1's trail down to the camp,
 * Level 2's River Road to the falls, and the courtyard at the falls from
 * above. There is no riddle and no marked spot here: today's spirit card is
 * hinted at only in the game (cards/cards.js), and this is where you work out
 * where those words point. Today's card is marked once you've found it.
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
.gm-panels { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; }
.gm-panel { flex:1 1 200px; max-width:240px; }
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
    const d = todaysCard();
    this.el.innerHTML = `
      <div class="gm-in plaque">
        <h2>THE MAP</h2>
        ${d.taken ? `<div class="gm-riddle"><b>TODAY\u2019S CARD \u00b7 FOUND \u2713</b>${d.card.name}, marked where you found it.</div>` : '<div class="gm-riddle">&nbsp;</div>'}
        <div class="gm-panels">
          <div class="gm-panel"><h3>PROLOGUE · THE VALLEY</h3><canvas data-l="0" width="300" height="520"></canvas></div>
          <div class="gm-panel"><h3>LEVEL 1 · THE OLD TRAIL</h3><canvas data-l="1" width="300" height="520"></canvas></div>
          <div class="gm-panel"><h3>LEVEL 2 · THE RIVER ROAD</h3><canvas data-l="2" width="300" height="520"></canvas></div>
          <div class="gm-panel"><h3>LEVEL 3 · THE FALLS</h3><canvas data-l="3" width="300" height="520"></canvas></div>
        </div>
        <div class="gm-key">◆ today’s card, where you found it</div>
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
    const daily = todaysCard();
    const pulse = 0.5 + 0.5 * Math.sin(time * 3);
    for (const c of this.canvases) {
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      const l = c.dataset.l;
      if (l === '0') this._valley(g, c, daily);
      else if (l === '1') this._trail(g, c, daily, pulse);
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

  /** The prologue's valley from above: the camp, the old path to the stone, the trail out east, and the places off it. */
  _valley(g, c, daily) {
    const pad = 16;
    const x0 = VALLEY.x0, x1 = 58, z0 = VALLEY.z0, z1 = VALLEY.z1;
    const k = Math.min((c.width - pad * 2) / (x1 - x0), (c.height - pad * 2) / (z1 - z0));
    const toX = (x) => pad + (x - x0) * k;
    const toY = (z) => pad + (z - z0) * k;
    g.font = `11px ${DIALOGUE_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // the forest, and the valley's edge
    g.fillStyle = 'rgba(111,191,74,.18)';
    g.fillRect(toX(VALLEY.x0), toY(VALLEY.z0), (VALLEY.x1 - VALLEY.x0) * k, (VALLEY.z1 - VALLEY.z0) * k);
    // the old path, the trail east from the stone
    g.strokeStyle = 'rgba(227,187,98,.75)';
    g.lineWidth = 4;
    g.lineCap = g.lineJoin = 'round';
    g.beginPath();
    WALK_PTS.forEach(([x, z], i) => (i ? g.lineTo(toX(x), toY(z)) : g.moveTo(toX(x), toY(z))));
    g.stroke();
    g.beginPath(); g.moveTo(toX(0), toY(-94)); g.lineTo(toX(58), toY(-94)); g.stroke();
    g.fillStyle = DIM; g.fillText('TO THE OLD TRAIL \u2192', toX(44), toY(-98.5));
    // the camp and its fire, the stone in its glade
    const spot = (x, z, color, label, dx = 0, dy = 13, align = 'center') => {
      g.fillStyle = color; g.beginPath(); g.arc(toX(x), toY(z), 4.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = INK; g.textAlign = align; g.fillText(label, toX(x) + dx, toY(z) + dy); g.textAlign = 'center';
    };
    spot(0, 8, '#ff9a3a', 'THE CAMP');
    spot(0, -96.6, '#4fd6e0', 'THE STONE', 0, -12);
    spot(0.5, -18.6, 'rgba(200,190,160,.9)', 'LAST CREW', -8, 0, 'right');
    spot(-1.5, -27, 'rgba(200,200,190,.9)', 'STAG STATUE', 8, 0, 'left');
    for (const L of LANDMARKS) {
      g.strokeStyle = GOLD; g.lineWidth = 1.5;
      g.beginPath(); g.arc(toX(L.x), toY(L.z), 5, 0, Math.PI * 2); g.stroke();
      g.fillStyle = INK;
      g.fillText(L.name, toX(L.x), toY(L.z) + 13);
    }
    if (daily.taken && daily.spot.level === 'prologue') this._cardMark(g, toX(daily.spot.x), toY(daily.spot.z), daily.card.id);
  }

  _trail(g, c, daily, pulse) {
    const top = 26, bot = c.height - 26, mid = c.width / 2, W = 34;
    const toY = (d) => top + (d / L1.len) * (bot - top);
    const toX = (lx) => mid + (lx / 3.6) * (W / 2);
    this._route(g, c, L1.len, L1.marks, L1.lanes, toY, toX, W);
    if (daily.taken && daily.spot.level === 'level01') this._cardMark(g, toX(LANE(daily.spot.lane)), toY(-daily.spot.z), daily.card.id);
  }

  _road(g, c, daily, pulse) {
    const top = 26, bot = c.height - 26, mid = c.width / 2, W = 44;
    const toY = (d) => top + (d / L2.len) * (bot - top);
    const toX = (x) => mid + (x / 12) * (W / 2);
    this._route(g, c, L2.len, L2.marks, [-6, 0, 6], toY, toX, W);
    if (daily.taken && daily.spot.level === 'level02') this._cardMark(g, toX(daily.spot.x), toY(daily.spot.z), daily.card.id);
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
    if (daily.taken && daily.spot.level === 'level03') this._cardMark(g, toX(daily.spot.x), toY(daily.spot.z), daily.card.id);
  }
}

const LANE = (lane) => [-2.4, 0, 2.4][lane] ?? 0;
