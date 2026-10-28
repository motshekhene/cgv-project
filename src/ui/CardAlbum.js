import { THEME_CSS } from './theme.js';
import { DIALOGUE_FONT } from './dialogue.js';
import { CARDS, isFound, foundCount, todaysCard, RARITY_NAME } from '../cards/cards.js';
import { cardCanvas, cardBackCanvas } from '../cards/cardArt.js';

/**
 * SPIRIT CARDS on the main menu: the album. Every card in the game, common
 * to legendary, the found ones face up and the rest face down with their
 * rarity; at the top, today's card: how rare it is (never where: that is
 * only told in the game), or that it's been found and a new one hides tomorrow. Click a found card to see it big.
 *
 *   const album = new CardAlbum({ onMap: () => map.open() });
 *   album.open();
 *
 * Esc, Backspace or BACK closes it; it keeps every key to itself while open.
 */

const CSS = THEME_CSS + `
.ca { position:fixed; inset:0; z-index:9700; display:flex; align-items:center; justify-content:center; font-family:var(--sans); color:var(--ink);
  visibility:hidden; opacity:0; pointer-events:none; transition:opacity .2s ease, visibility 0s linear .2s; }
.ca.show { visibility:visible; opacity:1; pointer-events:auto; transition:opacity .2s ease; }
.ca::before { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at center, rgba(10,12,8,.72), rgba(4,5,3,.96)); backdrop-filter:blur(3px); }
.ca-in { background:linear-gradient(180deg, rgba(30,34,22,.97), rgba(12,14,9,.97)); border:1px solid rgba(227,187,98,.4); border-radius:6px; position:relative; width:min(900px, 95vw); max-height:calc(100vh - 30px); display:flex; flex-direction:column; padding:18px 22px 14px; text-align:center; }
.ca h2 { margin:0; font-family:${DIALOGUE_FONT}; font-weight:600; font-size:clamp(24px, 3.6vw, 36px); letter-spacing:.32em; text-indent:.32em; color:var(--gold); text-shadow:0 2px 0 #000, 0 0 18px rgba(227,187,98,.35); }
.ca-count { font:italic 15px ${DIALOGUE_FONT}; color:var(--ink-dim); margin:4px 0 10px; }
.ca-daily { display:flex; gap:14px; align-items:center; text-align:left; margin:0 auto 12px; padding:10px 14px; max-width:720px; border:1px solid rgba(255,211,106,.45); border-radius:4px; background:rgba(60,45,10,.35); }
.ca-daily img { width:64px; border-radius:6px; box-shadow:0 0 16px rgba(255,211,106,.5); }
.ca-daily b { display:block; font:700 12px var(--sans); letter-spacing:.24em; color:#ffd36a; }
.ca-daily p { margin:4px 0 0; font:italic 16px ${DIALOGUE_FONT}; color:var(--ink); }
.ca-daily a { color:var(--key); cursor:pointer; font:600 12px var(--sans); letter-spacing:.14em; }
.ca-grid { flex:1; min-height:0; overflow-y:auto; display:grid; grid-template-columns:repeat(auto-fill, minmax(118px, 1fr)); gap:12px; padding:4px 6px 8px; }
.ca-card { position:relative; cursor:default; }
.ca-card img { width:100%; border-radius:8px; display:block; box-shadow:0 6px 16px rgba(0,0,0,.6); transition:transform .15s; }
.ca-card.found { cursor:pointer; }
.ca-card.found:hover img { transform:translateY(-4px) scale(1.03); }
.ca-card.missing img { filter:grayscale(1) brightness(.45); }
.ca-card span { position:absolute; left:0; right:0; bottom:38%; font:700 11px var(--sans); letter-spacing:.2em; color:var(--ink); text-shadow:0 1px 3px #000; }
.ca-big { position:fixed; inset:0; z-index:9800; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.7); cursor:pointer; }
.ca-big img { width:min(300px, 70vw); border-radius:14px; box-shadow:0 0 40px rgba(143,232,255,.4); }
.ca-back { align-self:center; margin-top:12px; padding:7px 28px; cursor:pointer; font:600 13px ${DIALOGUE_FONT}; letter-spacing:.3em; color:var(--gold); border:1px solid var(--line); border-radius:2px; background:rgba(227,187,98,.08); }
.ca-back:hover { border-color:var(--gold); background:rgba(227,187,98,.16); }
`;

export class CardAlbum {
  constructor({ onMap = null } = {}) {
    this.onMap = onMap;
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);
    this.el = document.createElement('div');
    this.el.className = 'ca';
    document.body.appendChild(this.el);
    this._onKey = (e) => {
      if (!this.el.classList.contains('show')) return;
      e.stopPropagation();
      if (['Escape', 'Backspace', 'Enter'].includes(e.key)) {
        e.preventDefault();
        if (this._big) this._closeBig();
        else this.close();
      }
    };
    window.addEventListener('keydown', this._onKey, true);
  }

  _render() {
    const today = todaysCard();
    const back = cardBackCanvas().toDataURL();
    const cards = CARDS.map((c) => {
      const found = isFound(c.id);
      return `<div class="ca-card ${found ? 'found' : 'missing'}" data-id="${c.id}">
        <img alt="${found ? c.name : 'not found yet'}" src="${found ? cardCanvas(c).toDataURL() : back}">
        ${found ? '' : `<span>${RARITY_NAME[c.rarity]}</span>`}
      </div>`;
    }).join('');
    const kind = RARITY_NAME[today.card.rarity];
    this.el.innerHTML = `
      <div class="ca-in plaque">
        <h2>SPIRIT CARDS</h2>
        <div class="ca-count">${foundCount()} of ${CARDS.length} found \u00b7 one card hides in the game each day: rare ones about one day in six, legendary about one in thirty</div>
        <div class="ca-daily">
          <img alt="" src="${today.taken ? cardCanvas(today.card).toDataURL() : back}">
          <div>
            ${today.taken
              ? `<b>TODAY\u2019S CARD \u00b7 FOUND \u2713</b><p>${today.card.name}. A new card hides somewhere tomorrow.</p>`
              : `<b>TODAY\u2019S CARD \u00b7 A ${kind} CARD IS HIDING</b><p>Where it sleeps is said somewhere in the game today: listen to Baba Zwane and Kai, and read the signs. Then find the place.</p>${this.onMap ? '<a data-map>OPEN THE MAP \u2192</a>' : ''}`}
          </div>
        </div>
        <div class="ca-grid">${cards}</div>
        <div class="ca-back" data-back>BACK</div>
      </div>`;
    this.el.querySelector('[data-back]').addEventListener('click', () => this.close());
    this.el.querySelector('[data-map]')?.addEventListener('click', () => { this.close(); this.onMap?.(); });
    for (const card of this.el.querySelectorAll('.ca-card.found')) {
      card.addEventListener('click', () => this._showBig(card.querySelector('img').src));
    }
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
  }

  _showBig(src) {
    this._big = document.createElement('div');
    this._big.className = 'ca-big';
    this._big.innerHTML = `<img alt="" src="${src}">`;
    this._big.addEventListener('click', () => this._closeBig());
    document.body.appendChild(this._big);
  }

  _closeBig() {
    this._big?.remove();
    this._big = null;
  }

  open() {
    this._render();
    this.el.classList.add('show');
  }

  close() {
    this._closeBig();
    this.el.classList.remove('show');
  }

  get isOpen() {
    return this.el.classList.contains('show');
  }
}
