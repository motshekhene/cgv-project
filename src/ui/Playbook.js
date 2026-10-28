import { THEME_CSS } from './theme.js';
import { DIALOGUE_FONT } from './dialogue.js';
import { LANDMARKS } from '../levels/prologue/places.js';

/**
 * PLAYBOOK, from the main menu and the pause menu: everything a new player
 * needs, in one place, so the game itself doesn't have to stop and explain.
 * Four tabs:
 *
 *   HOW TO PLAY   each chapter: what you're doing, how you win and lose, the keys that matter
 *   THINGS        what you'll find and what it does, with a picture from the game
 *   PLACES        the named places in every chapter, with a picture of each
 *   MAP           opens the game map (ui/GameMap.js)
 *
 * The pictures are frames taken from the game itself (public/assets/guide/).
 *
 *   const book = new Playbook({ onMap: () => map.open() });  book.open();
 */
const IMG = (name) => `./assets/guide/${name}.jpg`;

const CHAPTERS = [
  {
    title: 'PROLOGUE · THE FIRE AND THE STONE',
    goal: 'Hear Baba Zwane out at the fire, then walk up the old path to the stone and take the horn (E). Q leaves it there for a moment, but the story only goes on with the horn.',
    lose: 'Nothing chases you yet. The valley is open: wander off the path to its landmarks, and press N for the map.',
    keys: 'W A S D walk · mouse look · E take the horn · Q leave it · N map · X skip',
  },
  {
    title: 'LEVEL 1 · THE OLD TRAIL',
    goal: 'Run down the mountain to the company’s camp with the Marshal behind you. Switch lanes, jump and slide past what’s on the trail.',
    lose: 'He always gains a little: hold SHIFT to sprint away, until your stamina runs dry (it refills when you let go). Every hit costs health and lets him jump closer. You lose if he catches you (the red dot reaches yours on the chase meter), if your health runs out, if you fall through the bridge, or if the stone guardian or a hazard hits you.',
    keys: 'A D or ← → lanes · SPACE jump · CTRL slide · SHIFT sprint · V blow the horn · right mouse look back',
  },
  {
    title: 'LEVEL 2 · THE RIVER ROAD',
    goal: 'Drive the company’s car down the River Road to the falls with the Marshal hunting you in his own car. Find the gap in the company’s barricades.',
    lose: 'The car breaks down if it takes too much damage: from the Marshal’s rams, traffic, animals and barricades.',
    keys: 'W S drive · A D steer · SHIFT boost · Q drift · SPACE handbrake · C view',
  },
  {
    title: 'LEVEL 3 · THE FALLS',
    goal: 'Face the Marshal and his men in the courtyard below the falls. Dodge, block, parry and fight back; the spirit shrines in the jungle ring help you.',
    lose: 'Your health runs out. Dodge just before a hit for a perfect dodge that slows time.',
    keys: 'W A S D move · left mouse / ENTER attack · K kick · right mouse / B block · C dodge · TAB lock on · V the horn (slow time) · N map',
  },
];

const THINGS = [
  { img: 'light', name: 'THE FOREST’S LIGHT', what: 'Glowing cyan lights floating over the trail. Run through them: 40 fill the horn. Some float high, only in reach with a jetpack.', where: 'Level 1' },
  { img: 'p-stone', name: 'THE HORN', what: 'Level 1 (V, when 40 lights fill it): smashes everything on the trail ahead and roots the Marshal for a moment. Level 3 (V): slows time for 3 seconds.', where: 'Levels 1 and 3' },
  { img: 'page', name: 'TORN PAGES', what: 'The company’s own papers. Run through one to read it. On the trail, TORN PAGE AHEAD says which side one is on as you get close. Find all 6 (3 on the trail, 3 at the falls) for the true ending.', where: 'Levels 1 and 3' },
  { img: 'card', name: 'SPIRIT CARDS', what: 'One card hides somewhere in the game each day. Where it sleeps is only said in the game: by Baba Zwane, in Kai’s thoughts, or on a sign. Find the place on the map, then go there and touch it. See SPIRIT CARDS on the main menu.', where: 'Anywhere' },
  { img: 'health', name: 'HEALTH PACKS', what: 'Red-and-white kits on the trail. Run through one for 25 health.', where: 'Level 1' },
  { img: 'marshal', name: 'THE MARSHAL', what: 'The company’s man in the hard hat and mask. He chases you on foot, then in his car, then fights you at the falls.', where: 'Levels 1, 2, 3' },
  { img: 'chase', name: 'THE CHASE METER', what: 'Top right: your green dot and his red dot. When red reaches green, he has you. When he’s close, the edges of the screen burn and beat.', where: 'Level 1' },
  { img: 'l3-stag', name: 'SPIRIT SHRINES', what: 'Three shrines in the jungle ring round the courtyard. Step onto one: the Stag heals you (and wakes again), the Fox shows where his blows will land, the Ember makes you hit harder.', where: 'Level 3' },
];

const PLACES = [
  { title: 'PROLOGUE · THE VALLEY', items: [
    { img: 'p-camp', name: 'THE CAMP' }, { img: 'p-stone', name: 'THE STONE' },
    ...LANDMARKS.map((l) => ({ img: `p-${l.id}`, name: l.name })),
  ] },
  { title: 'LEVEL 1 · THE OLD TRAIL', items: [
    { img: 'l1-darkshrine', name: 'THE DARK SHRINE' }, { img: 'l1-bridge', name: 'THE FALLING BRIDGE' },
    { img: 'l1-ruins', name: 'THE HIGH RUINS' }, { img: 'l1-gate', name: 'THE GATE' },
  ] },
  { title: 'LEVEL 2 · THE RIVER ROAD', items: [{ img: 'l2-road', name: 'THE RIVER ROAD' }, { img: 'l2-barricade', name: 'THE COMPANY’S BARRICADES' }] },
  { title: 'LEVEL 3 · THE FALLS', items: [
    { img: 'l3-falls', name: 'THE FALLS AND THE POOL' }, { img: 'l3-stag', name: 'THE STAG’S SHRINE' },
    { img: 'l3-fox', name: 'THE FOX’S SHRINE' }, { img: 'l3-ember', name: 'THE EMBER’S SHRINE' },
  ] },
];

const CSS = THEME_CSS + `
.pb { position:fixed; inset:0; z-index:9750; display:flex; align-items:center; justify-content:center; font-family:var(--sans); color:var(--ink);
  visibility:hidden; opacity:0; pointer-events:none; transition:opacity .2s ease, visibility 0s linear .2s; }
.pb.show { visibility:visible; opacity:1; pointer-events:auto; transition:opacity .2s ease; }
.pb::before { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at center, rgba(10,12,8,.75), rgba(4,5,3,.96)); backdrop-filter:blur(3px); }
.pb-in { position:relative; width:min(1000px, 96vw); height:min(760px, calc(100vh - 24px)); display:flex; flex-direction:column; padding:16px 22px 12px;
  background:linear-gradient(180deg, rgba(30,34,22,.97), rgba(12,14,9,.97)); border:1px solid rgba(227,187,98,.4); border-radius:6px; }
.pb h2 { margin:0; text-align:center; font-family:${DIALOGUE_FONT}; font-weight:600; font-size:clamp(24px, 3.4vw, 34px); letter-spacing:.32em; text-indent:.32em; color:var(--gold); }
.pb-tabs { display:flex; gap:8px; justify-content:center; margin:10px 0 12px; flex-wrap:wrap; }
.pb-tabs button { padding:6px 16px; cursor:pointer; font:600 12px ${DIALOGUE_FONT}; letter-spacing:.24em; color:var(--ink-dim); background:rgba(0,0,0,.25); border:1px solid rgba(227,187,98,.25); border-radius:2px; }
.pb-tabs button.on { color:var(--gold); border-color:var(--gold); background:rgba(227,187,98,.12); }
.pb-body { flex:1; min-height:0; overflow-y:auto; padding:0 6px 6px; scrollbar-color:var(--gold-dim) transparent; }
.pb-ch { margin:0 0 14px; padding:10px 14px; border:1px solid rgba(227,187,98,.2); border-radius:4px; background:rgba(0,0,0,.2); }
.pb-ch h3, .pb-sec { margin:0 0 6px; font:700 12px var(--sans); letter-spacing:.24em; color:var(--gold); }
.pb-ch p { margin:4px 0; font:16px/1.45 ${DIALOGUE_FONT}; color:var(--ink); }
.pb-ch p b { font:700 11px var(--sans); letter-spacing:.18em; color:var(--moss-hi); margin-right:6px; }
.pb-ch .keys { font:13px var(--sans); color:var(--key); letter-spacing:.04em; }
.pb-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:12px; }
.pb-thing { display:flex; flex-direction:column; border:1px solid rgba(227,187,98,.22); border-radius:4px; overflow:hidden; background:rgba(0,0,0,.25); }
.pb-thing img { width:100%; aspect-ratio:16/9; object-fit:cover; display:block; }
.pb-thing div { padding:8px 10px 10px; }
.pb-thing b { display:block; font:700 12px var(--sans); letter-spacing:.2em; color:var(--gold); }
.pb-thing small { font:600 10px var(--sans); letter-spacing:.18em; color:var(--moss-hi); }
.pb-thing p { margin:5px 0 0; font:15px/1.4 ${DIALOGUE_FONT}; color:var(--ink); }
.pb-places { display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:10px; margin-bottom:14px; }
.pb-place { position:relative; border-radius:4px; overflow:hidden; border:1px solid rgba(227,187,98,.22); }
.pb-place img { width:100%; aspect-ratio:16/9; object-fit:cover; display:block; }
.pb-place span { position:absolute; left:0; right:0; bottom:0; padding:5px 8px; font:700 11px var(--sans); letter-spacing:.16em; color:#f2d58a; background:linear-gradient(transparent, rgba(0,0,0,.8)); }
.pb-map { text-align:center; padding:30px 10px; }
.pb-map p { font:16px ${DIALOGUE_FONT}; color:var(--ink); max-width:620px; margin:0 auto 16px; }
.pb-btn { display:inline-block; padding:8px 26px; cursor:pointer; font:600 13px ${DIALOGUE_FONT}; letter-spacing:.3em; color:var(--gold); border:1px solid var(--line); border-radius:2px; background:rgba(227,187,98,.08); }
.pb-btn:hover { border-color:var(--gold); background:rgba(227,187,98,.16); }
.pb-foot { text-align:center; margin-top:10px; }
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
        <div class="pb-tabs">
          <button data-tab="how">HOW TO PLAY</button><button data-tab="things">THINGS</button>
          <button data-tab="places">PLACES</button><button data-tab="map">MAP</button>
        </div>
        <div class="pb-body"></div>
        <div class="pb-foot"><span class="pb-btn" data-back>BACK</span></div>
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
      if (['Escape', 'Backspace'].includes(e.key)) { e.preventDefault(); this.close(); }
    };
    window.addEventListener('keydown', this._onKey, true);
  }

  get isOpen() {
    return this.el.classList.contains('show');
  }

  _tab(id) {
    for (const b of this.el.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === id);
    if (id === 'how') {
      this.body.innerHTML = CHAPTERS.map((c) => `<div class="pb-ch"><h3>${c.title}</h3>
        <p><b>GOAL</b>${c.goal}</p><p><b>WATCH OUT</b>${c.lose}</p><p class="keys">${c.keys}</p></div>`).join('')
        + '<div class="pb-ch"><h3>ANY TIME</h3><p>ESC pauses (and has this playbook) · H shows the controls · M mutes · R restarts the level.</p></div>';
    } else if (id === 'things') {
      this.body.innerHTML = `<div class="pb-grid">${THINGS.map((t) => `<div class="pb-thing">
        <img alt="" src="${IMG(t.img)}"><div><b>${t.name}</b><small>${t.where}</small><p>${t.what}</p></div></div>`).join('')}</div>`;
    } else if (id === 'places') {
      this.body.innerHTML = PLACES.map((g) => `<div class="pb-sec">${g.title}</div><div class="pb-places">${g.items.map((p) =>
        `<div class="pb-place"><img alt="" src="${IMG(p.img)}"><span>${p.name}</span></div>`).join('')}</div>`).join('');
    } else {
      this.body.innerHTML = `<div class="pb-map"><p>The map shows the valley and all three levels with every named place, so you can work out where today’s spirit card is from what you’ve heard and read in the game.</p>
        <span class="pb-btn" data-open-map>OPEN THE MAP</span></div>`;
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
