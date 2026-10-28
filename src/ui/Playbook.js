import { THEME_CSS } from './theme.js';
import { DIALOGUE_FONT } from './dialogue.js';
import { LANDMARKS } from '../levels/prologue/places.js';

/**
 * PLAYBOOK, from the main menu and the pause menu: everything a new player
 * needs, in one place, so the game itself doesn't have to stop and explain.
 * Four tabs, in the same dress as CREDITS and CONTROLS:
 *
 *   HOW TO PLAY   a card per chapter, in its own colour: a picture of it, what
 *                 you're doing, how you lose, and the keys that matter as keycaps
 *   THINGS        what you'll find and what it does, with a picture from the game
 *   PLACES        the named places in every chapter, with a picture of each
 *   MAP           opens the game map (ui/GameMap.js)
 *
 * The pictures are frames taken from the game itself (public/assets/guide/).
 * ← → / A D / 1-4 or a click change tab; Esc, Backspace or BACK closes it.
 *
 *   const book = new Playbook({ onMap: () => map.open() });  book.open();
 */
const IMG = (name) => `./assets/guide/${name}.jpg`;

// keys: [keys, what they do]; 'A D / ← →' is two ways of doing it
const CHAPTERS = [
  {
    no: '00', kicker: 'PROLOGUE', title: 'The Fire and the Stone', color: '#ffb03a', img: 'p-camp',
    goal: 'Hear Baba Zwane out at the fire, then walk up the old path to the stone and take the horn (E). Q leaves it there for a moment, but the story only goes on with the horn.',
    lose: 'Nothing chases you yet. The valley is open: wander off the path to its landmarks, and press N for the map.',
    keys: [['W A S D', 'walk'], ['MOUSE', 'look'], ['E', 'take the horn'], ['Q', 'leave it'], ['N', 'map'], ['X', 'skip']],
  },
  {
    no: '01', kicker: 'LEVEL 1', title: 'The Old Trail', color: '#9ed36a', img: 'l1-fork',
    goal: 'Run down the mountain to the company’s camp with the Marshal behind you. Switch lanes, jump and slide past what’s on the trail.',
    lose: 'He always gains a little: hold SHIFT to sprint away, until your stamina runs dry (it refills when you let go). Every hit costs health and lets him jump closer. You lose if he catches you (the red dot reaches yours on the chase meter), if your health runs out, if you fall through the bridge, or if the stone guardian or a hazard hits you.',
    keys: [['A D / ← →', 'lanes'], ['SPACE', 'jump'], ['CTRL', 'slide'], ['SHIFT', 'sprint'], ['V', 'blow the horn'], ['RMB', 'look back']],
  },
  {
    no: '02', kicker: 'LEVEL 2', title: 'The River Road', color: '#7fc8e8', img: 'l2-road',
    goal: 'Drive the company’s car down the River Road to the falls with the Marshal hunting you in his own car. Find the gap in the company’s barricades.',
    lose: 'The car breaks down if it takes too much damage: from the Marshal’s rams, traffic, animals and barricades.',
    keys: [['W S', 'drive'], ['A D', 'steer'], ['SHIFT', 'boost'], ['Q', 'drift'], ['SPACE', 'handbrake'], ['C', 'view']],
  },
  {
    no: '03', kicker: 'LEVEL 3', title: 'The Falls', color: '#f2934f', img: 'l3-yard',
    goal: 'Face the Marshal and his men in the courtyard below the falls. Dodge, block, parry and fight back; the spirit shrines in the jungle ring help you.',
    lose: 'Your health runs out. Dodge just before a hit for a perfect dodge that slows time.',
    keys: [['W A S D', 'move'], ['LMB / ENTER', 'attack'], ['K', 'kick'], ['RMB / B', 'block'], ['C', 'dodge'], ['TAB', 'lock on'], ['V', 'the horn: slow time'], ['N', 'map']],
  },
];
const ANY_TIME = [['ESC', 'pause (and this playbook)'], ['H', 'the controls'], ['M', 'mute'], ['R', 'restart the level']];

// where each thing is found, in that chapter's colour (several: the first)
const WHERE_COLOR = { 'Level 1': '#9ed36a', 'Levels 1 and 3': '#9ed36a', 'Levels 1, 2, 3': '#f2934f', 'Level 3': '#f2934f', Anywhere: '#4fd6e0' };

const THINGS = [
  { img: 'light', name: 'THE FOREST’S LIGHT', what: 'Glowing cyan lights floating over the trail. Run through them: 40 fill the horn. Some float high, only in reach with a jetpack.', where: 'Level 1' },
  { img: 'p-stone', name: 'THE HORN', what: 'Level 1 (V, when 40 lights fill it): smashes everything on the trail ahead and roots the Marshal for a moment. Level 3 (V): slows time for 3 seconds.', where: 'Levels 1 and 3' },
  { img: 'page', name: 'TORN PAGES', what: 'The company’s own papers. Run through one to read it. On the trail, TORN PAGE AHEAD says which side one is on as you get close. Find all 6 (3 on the trail, 3 at the falls) for the true ending.', where: 'Levels 1 and 3' },
  { img: 'card', name: 'SPIRIT CARDS', what: 'One card hides somewhere in the game each day. Where it sleeps is only said in the game: by Baba Zwane, in Kai’s thoughts, or on a sign. Find the place on the map, then go there and touch it. See SPIRIT CARDS on the main menu.', where: 'Anywhere' },
  { img: 'health', name: 'HEALTH PACKS', what: 'Red-and-white kits on the trail. Run through one for 25 health.', where: 'Level 1' },
  { img: 'marshal', name: 'THE MARSHAL', what: 'The company’s man in the hard hat, the hi-vis vest and the mask. He chases you on foot, then in his car, then fights you at the falls.', where: 'Levels 1, 2, 3' },
  { img: 'chase', name: 'THE CHASE METER', what: 'Top right: your green dot and his red dot. When red reaches green, he has you. When he’s close, the edges of the screen burn and beat.', where: 'Level 1' },
  { img: 'l3-stag', name: 'SPIRIT SHRINES', what: 'Three shrines in the jungle ring round the courtyard. Step onto one: the Stag heals you (and wakes again), the Fox shows where his blows will land, the Ember makes you hit harder.', where: 'Level 3' },
];

const PLACES = [
  { kicker: 'PROLOGUE', title: 'The Valley', color: '#ffb03a', items: [
    { img: 'p-camp', name: 'THE CAMP' }, { img: 'p-stone', name: 'THE STONE' },
    ...LANDMARKS.map((l) => ({ img: `p-${l.id}`, name: l.name })),
  ] },
  { kicker: 'LEVEL 1', title: 'The Old Trail', color: '#9ed36a', items: [
    { img: 'l1-darkshrine', name: 'THE DARK SHRINE' }, { img: 'l1-bridge', name: 'THE FALLING BRIDGE' },
    { img: 'l1-ruins', name: 'THE HIGH RUINS' }, { img: 'l1-gate', name: 'THE GATE' },
  ] },
  { kicker: 'LEVEL 2', title: 'The River Road', color: '#7fc8e8', items: [
    { img: 'l2-road', name: 'THE RIVER ROAD' }, { img: 'l2-barricade', name: 'THE COMPANY’S BARRICADES' },
  ] },
  { kicker: 'LEVEL 3', title: 'The Falls', color: '#f2934f', items: [
    { img: 'l3-falls', name: 'THE FALLS AND THE POOL' }, { img: 'l3-stag', name: 'THE STAG’S SHRINE' },
    { img: 'l3-fox', name: 'THE FOX’S SHRINE' }, { img: 'l3-ember', name: 'THE EMBER’S SHRINE' },
  ] },
];

const TABS = [['how', 'HOW TO PLAY'], ['things', 'THINGS'], ['places', 'PLACES'], ['map', 'MAP']];

/** 'A D / ← →' as keycaps: each key a cap, '/' between the two ways. */
const caps = (keys) => keys.split(' / ').map((alt) => alt.split(' ').map((k) => `<kbd>${k}</kbd>`).join('')).join('<i>/</i>');

const CSS = THEME_CSS + `
.pb { position:fixed; inset:0; z-index:9750; display:flex; align-items:center; justify-content:center; font-family:var(--sans); color:var(--ink);
  visibility:hidden; opacity:0; pointer-events:none; transition:opacity .2s ease, visibility 0s linear .2s; }
.pb.show { visibility:visible; opacity:1; pointer-events:auto; transition:opacity .2s ease; }
.pb::before { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at center, rgba(10,12,8,.75), rgba(4,5,3,.96)); backdrop-filter:blur(3px); }
.pb-in { position:relative; box-sizing:border-box; width:min(1000px, 96vw); height:min(760px, calc(100vh - 96px)); display:flex; flex-direction:column; padding:18px 24px 14px;
  background:linear-gradient(180deg, rgba(30,34,22,.97), rgba(12,14,9,.97)); border:1px solid rgba(227,187,98,.4); border-radius:6px;
  box-shadow:0 20px 60px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.03); }
.pb h2 { margin:0; text-align:center; font-family:${DIALOGUE_FONT}; font-weight:600; font-size:clamp(26px, 3.6vw, 36px); letter-spacing:.32em; text-indent:.32em;
  color:var(--gold); text-shadow:0 2px 0 #000, 0 0 18px rgba(227,187,98,.35); }
.pb hr { width:min(240px, 50vw); height:1px; margin:8px auto 12px; border:0; background:linear-gradient(90deg, transparent, var(--gold), transparent); }

/* the tabs: as in CREDITS, the open one lit gold with a diamond under it */
.pb-tabs { display:flex; gap:6px; justify-content:center; margin:0 0 14px; flex-wrap:wrap; }
.pb-tab { position:relative; padding:8px 16px 9px; cursor:pointer; font:700 11px var(--sans); letter-spacing:.28em; color:var(--ink-dim);
  border:1px solid rgba(227,187,98,.22); border-radius:2px; background:rgba(0,0,0,.28); transition:color .15s, border-color .15s, background .15s; }
.pb-tab:hover { color:var(--ink); border-color:rgba(227,187,98,.5); }
.pb-tab.on { color:var(--gold); border-color:var(--gold); background:linear-gradient(180deg, rgba(227,187,98,.2), rgba(227,187,98,.05)); box-shadow:0 0 16px rgba(227,187,98,.18); }
.pb-tab.on::after { content:'\\25C6'; position:absolute; left:50%; bottom:-9px; transform:translateX(-50%); font-size:9px; color:var(--gold); }
.pb-body { flex:1; min-height:0; overflow-y:auto; padding:2px 8px 6px 2px; scrollbar-color:var(--gold-dim) transparent; }
.pb-deal { animation:pb-up .45s cubic-bezier(.2,.8,.3,1) backwards; animation-delay:calc(var(--i, 0) * 60ms); }
@keyframes pb-up { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }

/* keycaps */
.pb kbd { display:inline-block; min-width:14px; padding:3px 7px 4px; text-align:center; font:700 10.5px var(--sans); letter-spacing:.06em; color:#f6e7c1;
  border:1px solid rgba(227,187,98,.55); border-bottom-width:3px; border-radius:4px; background:linear-gradient(180deg, rgba(60,66,44,.95), rgba(22,26,16,.95));
  box-shadow:0 2px 5px rgba(0,0,0,.45); }
.pb kbd + kbd { margin-left:3px; }
.pb-key { display:inline-flex; align-items:center; gap:7px; padding:4px 10px 4px 5px; border-radius:999px; background:rgba(0,0,0,.3); border:1px solid rgba(239,228,200,.08); }
.pb-key i { font-style:normal; color:var(--gold-dim); margin:0 2px; }
.pb-key em { font:italic 14px ${DIALOGUE_FONT}; color:var(--ink); white-space:nowrap; }
.pb-keys { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }

/* HOW TO PLAY: a card per chapter, its picture down the left */
.pb-ch { position:relative; display:grid; grid-template-columns:minmax(150px, 230px) 1fr; margin:0 0 14px; border-radius:6px; overflow:hidden;
  border:1px solid color-mix(in srgb, var(--c) 45%, transparent);
  background:linear-gradient(110deg, color-mix(in srgb, var(--c) 12%, rgba(0,0,0,.3)), rgba(0,0,0,.3) 45%); }
.pb-pic { position:relative; min-height:150px; background-size:cover; background-position:center; }
.pb-pic::after { content:''; position:absolute; inset:0; background:linear-gradient(90deg, transparent 40%, rgba(12,14,9,.95)), linear-gradient(0deg, color-mix(in srgb, var(--c) 30%, transparent), transparent 55%); }
.pb-no { position:absolute; left:12px; bottom:4px; z-index:1; font:600 54px/1 ${DIALOGUE_FONT}; color:var(--c); text-shadow:0 0 18px color-mix(in srgb, var(--c) 70%, transparent), 0 2px 0 #000; opacity:.95; }
.pb-txt { padding:12px 16px 14px 6px; }
.pb-kick { font:700 10px var(--sans); letter-spacing:.32em; color:var(--c); }
.pb-txt h3 { margin:1px 0 6px; font:600 24px/1.1 ${DIALOGUE_FONT}; color:var(--ink); }
.pb-txt p { margin:5px 0; font:15.5px/1.45 ${DIALOGUE_FONT}; color:var(--ink); }
.pb-txt p b { display:inline-block; min-width:86px; font:700 10px var(--sans); letter-spacing:.2em; color:var(--c); }
.pb-any { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:10px 14px; border-radius:6px; border:1px dashed rgba(227,187,98,.3); }
.pb-any > b { font:700 10px var(--sans); letter-spacing:.3em; color:var(--gold); margin-right:6px; }

/* THINGS: picture cards, the picture leaning in on hover */
.pb-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:14px; }
.pb-thing { position:relative; display:flex; flex-direction:column; border-radius:6px; overflow:hidden; border:1px solid rgba(227,187,98,.22); background:rgba(0,0,0,.3);
  transition:transform .2s ease, box-shadow .2s ease, border-color .2s ease; }
.pb-thing:hover { transform:translateY(-3px); border-color:color-mix(in srgb, var(--c) 70%, transparent); box-shadow:0 10px 26px rgba(0,0,0,.5), 0 0 20px color-mix(in srgb, var(--c) 30%, transparent); }
.pb-shot { position:relative; aspect-ratio:16/9; overflow:hidden; }
.pb-shot img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .5s ease; }
.pb-thing:hover .pb-shot img, .pb-place:hover img { transform:scale(1.07); }
.pb-shot::after { content:''; position:absolute; inset:0; background:linear-gradient(0deg, rgba(10,12,8,.9), transparent 55%); }
.pb-shot b { position:absolute; left:12px; bottom:9px; z-index:1; font:700 13px var(--sans); letter-spacing:.2em; color:#f6e7c1; text-shadow:0 2px 6px #000; }
.pb-where { position:absolute; top:9px; left:9px; z-index:1; padding:3px 8px; font:700 9px var(--sans); letter-spacing:.2em; color:var(--c);
  border:1px solid var(--c); border-radius:999px; background:rgba(0,0,0,.6); }
.pb-thing p { margin:0; padding:9px 12px 12px; font:15px/1.42 ${DIALOGUE_FONT}; color:var(--ink); }

/* PLACES: a header per chapter, then its places as pictures */
.pb-sec { display:flex; align-items:baseline; gap:12px; margin:6px 0 10px; padding-bottom:6px; border-bottom:1px solid color-mix(in srgb, var(--c) 40%, transparent); }
.pb-sec span { font:700 10px var(--sans); letter-spacing:.32em; color:var(--c); }
.pb-sec b { font:600 20px ${DIALOGUE_FONT}; color:var(--ink); }
.pb-sec small { margin-left:auto; font:italic 13px ${DIALOGUE_FONT}; color:var(--ink-dim); }
.pb-places { display:grid; grid-template-columns:repeat(auto-fill, minmax(190px, 1fr)); gap:10px; margin-bottom:18px; }
.pb-place { position:relative; border-radius:5px; overflow:hidden; border:1px solid rgba(227,187,98,.22); aspect-ratio:16/9; transition:border-color .2s, box-shadow .2s; }
.pb-place:hover { border-color:color-mix(in srgb, var(--c) 70%, transparent); box-shadow:0 0 18px color-mix(in srgb, var(--c) 30%, transparent); }
.pb-place img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .5s ease; }
.pb-place span { position:absolute; left:0; right:0; bottom:0; padding:14px 9px 6px; font:700 10.5px var(--sans); letter-spacing:.16em; color:#f6e7c1;
  background:linear-gradient(transparent, rgba(0,0,0,.85)); }

/* MAP: a banner over the valley, a compass turning, and the way in */
.pb-map { position:relative; box-sizing:border-box; display:grid; place-items:center; min-height:100%; padding:30px 20px; border-radius:8px; overflow:hidden; text-align:center; }
.pb-map::before { content:''; position:absolute; inset:0; background:url('${IMG('p-camp')}') center / cover; filter:blur(2px) brightness(.4) saturate(.8); transform:scale(1.05); }
.pb-map > div { position:relative; }
.pb-compass { position:relative; width:110px; height:110px; margin:0 auto 18px; border-radius:50%; border:1px solid rgba(227,187,98,.6);
  background:radial-gradient(circle, rgba(227,187,98,.18), rgba(10,12,8,.8) 70%); box-shadow:0 0 30px rgba(227,187,98,.25); }
.pb-compass::before { content:''; position:absolute; inset:8px; border-radius:50%; border:1px dashed rgba(227,187,98,.45); animation:pb-spin 30s linear infinite; }
.pb-compass::after { content:''; position:absolute; left:50%; top:50%; width:0; height:0; transform:translate(-50%, -50%); margin-top:-20px;
  border-left:10px solid transparent; border-right:10px solid transparent; border-bottom:40px solid var(--gold);
  filter:drop-shadow(0 0 6px rgba(227,187,98,.7)); } /* the needle, pointing north */
.pb-map h3 { margin:0 0 8px; font:600 26px ${DIALOGUE_FONT}; letter-spacing:.2em; color:var(--gold); }
.pb-map p { font:16px/1.5 ${DIALOGUE_FONT}; color:var(--ink); max-width:560px; margin:0 auto 18px; }
.pb-btn { display:inline-block; padding:8px 26px; cursor:pointer; font:600 13px ${DIALOGUE_FONT}; letter-spacing:.3em; color:var(--gold); border:1px solid var(--line); border-radius:2px; background:rgba(227,187,98,.08); }
.pb-btn:hover { border-color:var(--gold); background:rgba(227,187,98,.16); }
.pb-foot { text-align:center; margin-top:10px; }
.pb-hint { margin-top:7px; font-size:10px; letter-spacing:.2em; color:var(--ink-dim); text-align:center; }
@keyframes pb-spin { to { transform:rotate(360deg); } }
@media (max-width:640px) {
  .pb-ch { grid-template-columns:1fr; }
  .pb-pic { min-height:110px; }
  .pb-pic::after { background:linear-gradient(0deg, rgba(12,14,9,.95), transparent 70%); }
  .pb-txt { padding:4px 14px 14px; }
}
@media (max-height:860px) {
  .pb-in { padding:12px 20px 10px; }
  .pb h2 { font-size:28px; }
  .pb hr { margin:5px auto 9px; }
  .pb-tabs { margin-bottom:12px; }
  .pb-tab { padding:6px 13px 7px; }
  .pb-hint { display:none; }
}
@media (prefers-reduced-motion: reduce) { .pb *, .pb *::before { animation:none !important; transition:none !important; } }
`;

export class Playbook {
  constructor({ onMap = null } = {}) {
    this.onMap = onMap;
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);
    this.el = document.createElement('div');
    this.el.className = 'pb';
    this.el.innerHTML = `
      <div class="pb-in">
        <h2>PLAYBOOK</h2>
        <hr>
        <div class="pb-tabs">${TABS.map(([id, label]) => `<span class="pb-tab" data-tab="${id}">${label}</span>`).join('')}</div>
        <div class="pb-body"></div>
        <div class="pb-foot"><span class="pb-btn" data-back>BACK</span></div>
        <div class="pb-hint">← → TAB · ↑ ↓ SCROLL · ESC BACK</div>
      </div>`;
    document.body.appendChild(this.el);
    this.body = this.el.querySelector('.pb-body');
    for (const b of this.el.querySelectorAll('[data-tab]')) b.addEventListener('click', () => this._tab(b.dataset.tab));
    this.el.querySelector('[data-back]').addEventListener('click', () => this.close());
    this.el.addEventListener('mousedown', (e) => e.stopPropagation()); // not a punch or a jump in the level underneath
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
    this._onKey = (e) => {
      if (!this.isOpen) return;
      e.stopPropagation();
      const k = e.key.toLowerCase();
      const at = TABS.findIndex(([id]) => id === this.tab);
      if (k === 'escape' || k === 'backspace') this.close();
      else if (k === 'arrowright' || k === 'd') this._tab(TABS[(at + 1) % TABS.length][0]);
      else if (k === 'arrowleft' || k === 'a') this._tab(TABS[(at + TABS.length - 1) % TABS.length][0]);
      else if (k >= '1' && k <= String(TABS.length)) this._tab(TABS[+k - 1][0]);
      else if (k === 'arrowdown' || k === 's') this.body.scrollBy({ top: 80, behavior: 'smooth' });
      else if (k === 'arrowup' || k === 'w') this.body.scrollBy({ top: -80, behavior: 'smooth' });
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', this._onKey, true);
  }

  get isOpen() {
    return this.el.classList.contains('show');
  }

  _tab(id) {
    this.tab = id;
    for (const b of this.el.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === id);
    const keyRow = (list) => list.map(([k, what]) => `<span class="pb-key">${caps(k)}<em>${what}</em></span>`).join('');
    if (id === 'how') {
      this.body.innerHTML = CHAPTERS.map((c, i) => `<div class="pb-ch pb-deal" style="--c:${c.color};--i:${i}">
          <div class="pb-pic" style="background-image:url('${IMG(c.img)}')"><span class="pb-no">${c.no}</span></div>
          <div class="pb-txt">
            <div class="pb-kick">${c.kicker}</div><h3>${c.title}</h3>
            <p><b>GOAL</b>${c.goal}</p><p><b>WATCH OUT</b>${c.lose}</p>
            <div class="pb-keys">${keyRow(c.keys)}</div>
          </div>
        </div>`).join('')
        + `<div class="pb-any pb-deal" style="--i:${CHAPTERS.length}"><b>ANY TIME</b>${keyRow(ANY_TIME)}</div>`;
    } else if (id === 'things') {
      this.body.innerHTML = `<div class="pb-grid">${THINGS.map((t, i) => `<div class="pb-thing pb-deal" style="--c:${WHERE_COLOR[t.where] || '#e3bb62'};--i:${i}">
          <div class="pb-shot"><img alt="" src="${IMG(t.img)}"><span class="pb-where">${t.where.toUpperCase()}</span><b>${t.name}</b></div>
          <p>${t.what}</p>
        </div>`).join('')}</div>`;
    } else if (id === 'places') {
      let n = 0;
      this.body.innerHTML = PLACES.map((g) => `<div class="pb-sec" style="--c:${g.color}"><span>${g.kicker}</span><b>${g.title}</b><small>${g.items.length} places</small></div>
        <div class="pb-places">${g.items.map((p) => `<div class="pb-place pb-deal" style="--c:${g.color};--i:${n++}"><img alt="" src="${IMG(p.img)}"><span>${p.name}</span></div>`).join('')}</div>`).join('');
    } else {
      this.body.innerHTML = `<div class="pb-map pb-deal"><div>
          <div class="pb-compass"></div>
          <h3>THE MAP</h3>
          <p>The valley and all three levels, with every named place, so you can work out where today’s spirit card is from what you’ve heard and read in the game.</p>
          <span class="pb-btn" data-open-map>OPEN THE MAP</span>
        </div></div>`;
      this.body.querySelector('[data-open-map]').addEventListener('click', () => { this.close(); this.onMap?.(); });
    }
    this.body.scrollTop = 0;
  }

  open(tab = 'how') {
    this._tab(tab);
    this.el.classList.add('show');
  }

  close() {
    this.el.classList.remove('show');
  }
}
