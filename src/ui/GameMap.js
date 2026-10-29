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
 * Every place is a round picture of it, taken in the game
 * (public/assets/guide/); point at one (or tap it) to see it big.
 *
 *   const map = new GameMap();  map.open();
 */
const GOLD = '#e3bb62', INK = '#efe4c8', DIM = 'rgba(239,228,200,.55)', DAILY = '#ffd36a';

// [metres along, name, picture]
const L1 = {
  len: 4460, lanes: [-2.4, 0, 2.4],
  marks: [
    [0, 'THE STONE', 'p-stone'], [720, 'THE FORK', 'l1-fork'], [1010, 'DARK SHRINE', 'l1-darkshrine'],
    [1318, 'FALLING BRIDGE', 'l1-bridge'], [1465, 'THE GUARDIAN', 'l1-guardian'],
    [2950, 'HIGH RUINS', 'l1-ruins'], [4350, 'THE GATE', 'l1-gate'], [4460, 'THE CAMP', 'l1-camp'],
  ],
};
const L2 = {
  len: 8100,
  marks: [[0, 'THE TRAILHEAD', 'l2-road'], [4700, 'BARRICADES', 'l2-barricade'], [5900, 'BARRICADES', 'l2-barricade'],
    [6950, 'BARRICADES', 'l2-barricade'], [8100, 'THE FALLS', 'l3-falls']],
};

// the pictures, loaded once (public/assets/guide/)
const PICS = {};
const pic = (name) => {
  if (!PICS[name]) { PICS[name] = new Image(); PICS[name].src = `./assets/guide/${name}.jpg`; }
  return PICS[name];
};
const L3 = {
  x0: -34, x1: 34, z0: -40, z1: 34,
  places: [
    { x: -7, z: -28, r: 11, kind: 'pool', label: 'THE POOL', pic: 'l3-falls' },
    { x: -7, z: -36, r: 0, kind: 'falls', label: 'THE FALLS', pic: 'l3-falls' },
    { x: 0, z: 0, r: 13, kind: 'yard', label: 'COURTYARD', pic: 'l3-yard' },
    { x: -25.5, z: 9.5, r: 2.5, kind: 'shrine', label: 'STAG SHRINE', color: '#8affb8', pic: 'l3-stag' },
    { x: 25, z: 10.5, r: 2.5, kind: 'shrine', label: 'FOX SHRINE', color: '#8fd0ff', pic: 'l3-fox' },
    { x: -2.5, z: 27.5, r: 2.5, kind: 'shrine', label: 'EMBER SHRINE', color: '#ffb347', pic: 'l3-ember' },
  ],
};

const CSS = THEME_CSS + `
.gm { position:fixed; inset:0; z-index:9700; display:flex; align-items:center; justify-content:center; font-family:var(--sans); color:var(--ink);
  visibility:hidden; opacity:0; pointer-events:none; transition:opacity .2s ease, visibility 0s linear .2s; }
.gm.show { visibility:visible; opacity:1; pointer-events:auto; transition:opacity .2s ease; }
.gm::before { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at center, rgba(10,12,8,.72), rgba(4,5,3,.96)); backdrop-filter:blur(3px); }
.gm-in { background:linear-gradient(180deg, rgba(30,34,22,.97), rgba(12,14,9,.97)); border:1px solid rgba(227,187,98,.4); border-radius:6px; position:relative; box-sizing:border-box; width:min(980px, 96vw); max-height:calc(100vh - 96px); overflow-y:auto; overflow-x:hidden; padding:16px 20px 12px; text-align:center; }
.gm h2 { margin:0; font-family:${DIALOGUE_FONT}; font-weight:600; font-size:clamp(24px, 3.6vw, 36px); letter-spacing:.32em; text-indent:.32em; color:var(--gold); text-shadow:0 2px 0 #000; }
.gm-riddle { margin:6px auto 10px; max-width:760px; font:italic 16px ${DIALOGUE_FONT}; color:var(--ink); }
.gm-riddle b { font:700 11px var(--sans); letter-spacing:.24em; color:#ffd36a; font-style:normal; margin-right:6px; }
.gm-panels { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; }
.gm-panel { flex:1 1 200px; max-width:240px; }
.gm-panel h3 { margin:0 0 6px; font:700 11px var(--sans); letter-spacing:.28em; color:var(--gold); }
.gm-panel canvas { width:100%; border:1px solid rgba(227,187,98,.4); border-radius:4px; background:radial-gradient(ellipse at 40% 35%, rgba(52,44,30,.92), rgba(20,17,12,.94)); }
.gm-key { margin-top:8px; font:12px var(--sans); color:var(--ink-dim); letter-spacing:.08em; }
.gm-panel canvas.over { cursor:pointer; }
.gm-pop { position:absolute; z-index:2; width:300px; pointer-events:none; border:1px solid var(--gold); border-radius:4px; overflow:hidden;
  background:#0c0e09; box-shadow:0 10px 30px rgba(0,0,0,.7); opacity:0; transition:opacity .12s; }
.gm-pop.show { opacity:1; }
.gm-pop img { display:block; width:100%; aspect-ratio:16/9; object-fit:cover; }
.gm-pop span { display:block; padding:6px 10px; font:700 12px var(--sans); letter-spacing:.2em; color:var(--gold); text-align:left; }
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
        <div class="gm-key">point at a place (or tap it) to see it \u00b7 ◆ today’s card, where you found it</div>
        <div class="gm-pop"><img alt=""><span></span></div>
        <div class="gm-back" data-back>BACK</div>
      </div>`;
    this.el.querySelector('[data-back]').addEventListener('click', () => this.close());
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
    this.canvases = [...this.el.querySelectorAll('canvas')];
    this._spots = new Map();
    this._hover = null;
    const pop = this.el.querySelector('.gm-pop'), box = this.el.querySelector('.gm-in');
    const point = (c, e) => {
      const rc = c.getBoundingClientRect();
      const mx = (e.clientX - rc.left) * (c.width / rc.width), my = (e.clientY - rc.top) * (c.height / rc.height);
      let best = null, bd = 18 * 18;
      for (const s of this._spots.get(c) || []) {
        const d = (s.x - mx) ** 2 + (s.y - my) ** 2;
        if (d < bd) { bd = d; best = s; }
      }
      this._hover = best && { c, label: best.label };
      c.classList.toggle('over', !!best);
      if (!best) { pop.classList.remove('show'); return; }
      pop.querySelector('img').src = pic(best.pic).src;
      pop.querySelector('span').textContent = best.label;
      // beside the place, inside the map's box
      const rb = box.getBoundingClientRect();
      let left = e.clientX - rb.left + box.scrollLeft + 18, top = e.clientY - rb.top + box.scrollTop - 90;
      if (left + 300 > box.clientWidth) left -= 336;
      top = Math.max(box.scrollTop + 4, Math.min(top, box.scrollTop + box.clientHeight - 210));
      pop.style.left = `${left}px`; pop.style.top = `${top}px`;
      pop.classList.add('show');
    };
    for (const c of this.canvases) {
      c.addEventListener('pointermove', (e) => point(c, e));
      c.addEventListener('pointerdown', (e) => point(c, e));
      c.addEventListener('pointerleave', () => { this._hover = null; c.classList.remove('over'); pop.classList.remove('show'); });
    }
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
      this._spots.set(c, []);
      this._c = c;
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
    // names on the right, pushed apart where places sit close together, a line back to the road
    const ly = [];
    marks.forEach(([d], i) => { ly[i] = Math.max(toY(d), i ? ly[i - 1] + 28 : -Infinity); });
    for (let i = marks.length - 1; i >= 0; i--) ly[i] = Math.min(ly[i], i < marks.length - 1 ? ly[i + 1] - 28 : bot + 6);
    const R = 17, right = c.width / 2 + roadW / 2;
    marks.forEach(([d, label, name], i) => {
      const y = toY(d);
      g.fillStyle = GOLD;
      g.fillRect(c.width / 2 - roadW / 2 - 6, y - 1, roadW + 12, 2);
      g.strokeStyle = 'rgba(227,187,98,.5)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(right + 6, y); g.lineTo(right + 14, ly[i]); g.stroke();
      g.fillStyle = INK;
      g.textAlign = 'left';
      g.fillText(label, right + 18, ly[i] - 5);
      g.fillStyle = DIM;
      g.fillText(`${(d / 1000).toFixed(1)} km`, right + 18, ly[i] + 7);
      // its picture, left of the road; close neighbours stagger so none hide another
      const px = c.width / 2 - roadW / 2 - R - 6 - (i % 2) * (R * 2 + 4);
      g.beginPath(); g.moveTo(px + R, y); g.lineTo(c.width / 2 - roadW / 2 - 6, y); g.stroke();
      this._pin(g, px, y, label, name, R);
    });
  }

  /** A place as a round picture with a gold ring; remembered so pointing at it shows it big. */
  _pin(g, x, y, label, name, r = 13) {
    const img = pic(name);
    const on = this._hover && this._hover.c === this._c && this._hover.label === label;
    g.save();
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = '#1a1710'; g.fill();
    if (img.complete && img.naturalWidth) {
      g.clip();
      const h = r * 2, w = h * (img.naturalWidth / img.naturalHeight);
      g.drawImage(img, x - w / 2, y - h / 2, w, h);
    }
    g.restore();
    g.strokeStyle = on ? '#fff3c8' : GOLD; g.lineWidth = on ? 3 : 2;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    this._spots.get(this._c).push({ x, y, label, pic: name });
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
    const spot = (x, z, name, label, dx = 0, dy = 20, align = 'center') => {
      this._pin(g, toX(x), toY(z), label, name, 12);
      g.fillStyle = INK; g.textAlign = align; g.fillText(label, toX(x) + dx, toY(z) + dy); g.textAlign = 'center';
    };
    spot(0, 8, 'p-camp', 'THE CAMP');
    spot(0, -96.6, 'p-stone', 'THE STONE', 0, -19);
    spot(-6.9, -18.6, 'p-crew', 'LAST CREW', -15, 0, 'right');
    spot(5, -27, 'p-stag', 'STAG STATUE', -15, 0, 'right');
    for (const L of LANDMARKS) spot(L.x, L.z, `p-${L.id}`, L.name);
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
      // its picture: beside the pool, over the falls, at the middle of the rest
      const ox = p.kind === 'pool' ? p.r * k + 16 : 0, oy = p.kind === 'falls' ? -2 : 0;
      this._pin(g, x + ox, y + oy, p.label, p.pic, 15);
      g.fillStyle = INK;
      g.fillText(p.label, x + ox, y + oy + (p.kind === 'falls' ? -23 : 24));
    }
    if (daily.taken && daily.spot.level === 'level03') this._cardMark(g, toX(daily.spot.x), toY(daily.spot.z), daily.card.id);
  }
}

const LANE = (lane) => [-2.4, 0, 2.4][lane] ?? 0;
