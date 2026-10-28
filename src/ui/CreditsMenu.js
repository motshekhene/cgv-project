import { THEME_CSS } from './theme.js';
import { DIALOGUE_FONT } from './dialogue.js';
import { GAME_TITLE } from './brand.js';
import { CREDIT_SECTIONS, LICENCES, TEAM, CAST, CAST_CREDIT, SCORE } from './credits.js';

/**
 * CreditsMenu — CREDITS on the main menu, in four tabs, one on screen at a
 * time so none of it is a long scroll away (the lists are ui/credits.js):
 *
 *   THE TEAM            the five developers, each on a medallion of their initials
 *   THE CAST            who's in the story, each in the colour of their lines
 *   THE MUSIC           the score written for the game, one piece per chapter
 *   ASSETS AND TOOLS    everything the team did not make: who made it, its
 *                       licence, where it is in the game and a link to it
 *
 * It used to be a paragraph on the last card of the game; here it can be
 * found without finishing it, and every link can be followed. Each tab deals
 * its cards in, one after another (none of that with reduced motion).
 *
 *   const credits = new CreditsMenu();
 *   credits.open();          // over the title screen
 *
 * ← → / A D / 1-4 or a click change tab; ↑ ↓ / W S / the wheel scroll, Space
 * pages down; Esc, Backspace, Enter or BACK (or a click outside the panel)
 * closes it. Links open in a new tab. While it's open it keeps every key to
 * itself, so nothing underneath moves.
 */
const host = (url) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
const initials = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
// a colour per developer card, from the spirit cards' types (cards/cards.js TYPES)
const TEAM_COLOURS = ['#4fd6e0', '#ff8a3a', '#6fbf4a', '#d89cf0', '#4fb4e0', '#f2e27a'];
const STILL = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const CSS = THEME_CSS + `
.cm { position:fixed; inset:0; z-index:9700; display:flex; align-items:center; justify-content:center; font-family:var(--sans); color:var(--ink);
  visibility:hidden; opacity:0; pointer-events:none; transition:opacity .2s ease, visibility 0s linear .2s; }
.cm.show { visibility:visible; opacity:1; pointer-events:auto; transition:opacity .2s ease; }
.cm::before { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at center, rgba(10,12,8,.7), rgba(4,5,3,.95)); backdrop-filter:blur(3px); }
.cm-in { position:relative; box-sizing:border-box; width:min(880px, 94vw); height:min(720px, calc(100vh - 96px)); display:flex; flex-direction:column; padding:20px 26px 16px; text-align:center; }
.cm h2 { margin:0; font-family:${DIALOGUE_FONT}; font-weight:600; font-size:clamp(26px, 4vw, 38px); letter-spacing:.32em; text-indent:.32em;
  color:var(--gold); text-shadow:0 2px 0 #000, 0 0 18px rgba(227,187,98,.35); }
.cm hr { width:min(240px, 50vw); height:1px; margin:10px auto 8px; border:0; background:linear-gradient(90deg, transparent, var(--gold), transparent); }
.cm-sub { font:italic 15px ${DIALOGUE_FONT}; color:var(--ink-dim); margin-bottom:6px; }
.cm-sub b { font-style:normal; font-weight:600; letter-spacing:.14em; color:var(--ink); }
.cm-list { flex:1; min-height:0; overflow-y:auto; text-align:left; padding:4px 10px 6px 4px; scrollbar-color:var(--gold-dim) transparent; }

/* the tabs: one part at a time, the one open lit gold with a diamond under it */
.cm-tabs { display:flex; justify-content:center; flex-wrap:wrap; gap:6px; margin:4px 0 12px; }
.cm-tab { position:relative; padding:8px 16px 9px; cursor:pointer; font:700 11px var(--sans); letter-spacing:.28em; color:var(--ink-dim);
  border:1px solid rgba(227,187,98,.22); border-radius:2px; background:rgba(0,0,0,.28); transition:color .15s, border-color .15s, background .15s; }
.cm-tab:hover { color:var(--ink); border-color:rgba(227,187,98,.5); }
.cm-tab.on { color:var(--gold); border-color:var(--gold); background:linear-gradient(180deg, rgba(227,187,98,.2), rgba(227,187,98,.05)); box-shadow:0 0 16px rgba(227,187,98,.18); }
.cm-tab.on::after { content:'\\25C6'; position:absolute; left:50%; bottom:-9px; transform:translateX(-50%); font-size:9px; color:var(--gold); }
.cm-pane { display:none; }
.cm-pane.on { display:block; }
.cm-lead { margin:2px 0 16px; text-align:center; font:italic 15px ${DIALOGUE_FONT}; color:var(--ink-dim); }

/* THE TEAM: a card each, like the spirit cards: its own colour, a frame,
   a number, a medallion with a turning ring, a holographic shine sweeping
   across it, and a tilt toward the pointer */
.cm-team { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:16px; perspective:900px; }
@media (max-width:700px) { .cm-team { grid-template-columns:repeat(2, minmax(0, 1fr)); } }
.cm-dev { --mx:50%; --my:30%; position:relative; padding:30px 12px 16px; text-align:center; border-radius:10px; overflow:hidden;
  border:1px solid color-mix(in srgb, var(--c) 55%, transparent);
  background:
    radial-gradient(circle at var(--mx) var(--my), color-mix(in srgb, var(--c) 26%, transparent), transparent 55%),
    linear-gradient(160deg, color-mix(in srgb, var(--c) 16%, #141810), #0b0d09 75%);
  box-shadow:0 10px 26px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,255,255,.04);
  transform-style:preserve-3d; transition:transform .25s ease, box-shadow .25s ease; }
.cm-dev:hover { box-shadow:0 16px 34px rgba(0,0,0,.6), 0 0 26px color-mix(in srgb, var(--c) 45%, transparent); }
.cm-dev::after { content:''; position:absolute; inset:6px; border-radius:6px; pointer-events:none;
  border:1px solid color-mix(in srgb, var(--c) 30%, transparent); }
.cm-dev::before { content:''; position:absolute; inset:0; pointer-events:none; mix-blend-mode:screen; opacity:.9;
  background:linear-gradient(115deg, transparent 32%, rgba(255,255,255,.16) 44%, color-mix(in srgb, var(--c) 40%, transparent) 50%, rgba(255,255,255,.12) 56%, transparent 68%);
  background-size:260% 100%; animation:cm-holo 5.5s ease-in-out infinite; animation-delay:calc(var(--i, 0) * -.9s); }
.cm-no-card { position:absolute; top:12px; left:14px; font:700 9px var(--sans); letter-spacing:.22em; color:color-mix(in srgb, var(--c) 80%, #fff); opacity:.85; }
.cm-gem { position:absolute; top:11px; right:14px; font-size:10px; color:var(--c); text-shadow:0 0 8px var(--c); }
.cm-medal { position:relative; width:82px; height:82px; margin:0 auto 14px; border-radius:50%; display:grid; place-items:center;
  font:600 28px ${DIALOGUE_FONT}; letter-spacing:.06em; color:#fff6dc; text-shadow:0 0 14px var(--c), 0 0 2px #000;
  background:radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--c) 45%, transparent), rgba(14,17,10,.96) 68%);
  box-shadow:0 0 26px color-mix(in srgb, var(--c) 40%, transparent), inset 0 0 16px rgba(0,0,0,.75); transform:translateZ(30px); }
.cm-medal::before { content:''; position:absolute; inset:-4px; border-radius:50%; padding:2px;
  background:conic-gradient(var(--c), transparent 26%, var(--gold) 50%, transparent 76%, var(--c));
  -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite:xor; mask-composite:exclude;
  animation:cm-spin 7s linear infinite; }
.cm-dev:nth-child(even) .cm-medal::before { animation-direction:reverse; }
.cm-dev b { display:block; font:600 18px/1.25 ${DIALOGUE_FONT}; color:var(--ink); text-shadow:0 2px 6px #000; transform:translateZ(20px); }
.cm-dev small { display:inline-block; margin-top:9px; padding:3px 9px; font:700 9px var(--sans); letter-spacing:.3em; color:var(--c);
  border:1px solid color-mix(in srgb, var(--c) 50%, transparent); border-radius:999px; background:rgba(0,0,0,.35); transform:translateZ(14px); }
@keyframes cm-holo { 0% { background-position:130% 0; } 55%, 100% { background-position:-30% 0; } }

/* THE CAST: a card each, edged in the colour of their lines */
.cm-cast { display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:10px; }
.cm-role { position:relative; padding:12px 14px 13px 18px; border-radius:4px; overflow:hidden; border:1px solid rgba(239,228,200,.08);
  background:linear-gradient(135deg, color-mix(in srgb, var(--c) 12%, transparent), rgba(0,0,0,.28) 60%); }
.cm-role::before { content:''; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--c); box-shadow:0 0 14px var(--c); }
.cm-role b { display:block; font:700 13px var(--sans); letter-spacing:.24em; color:var(--c); }
.cm-role em { display:block; margin:2px 0 6px; font:italic 14px ${DIALOGUE_FONT}; color:var(--ink-dim); }
.cm-role p { margin:0; font:15px/1.4 ${DIALOGUE_FONT}; color:var(--ink); }

/* THE MUSIC: a track list, each with its own little level meter */
.cm-track { display:grid; grid-template-columns:30px 20px 1fr auto; column-gap:14px; align-items:center; padding:11px 8px; border-bottom:1px solid rgba(239,228,200,.07); }
.cm-no { font:600 19px ${DIALOGUE_FONT}; color:var(--gold-dim); text-align:right; }
.cm-eq { display:flex; gap:2px; align-items:flex-end; height:16px; }
.cm-eq i { width:3px; height:100%; background:var(--c); box-shadow:0 0 6px var(--c); transform-origin:bottom; animation:cm-eq .9s ease-in-out infinite alternate; }
.cm-eq i:nth-child(2) { animation-duration:.62s; animation-delay:-.3s; }
.cm-eq i:nth-child(3) { animation-duration:1.1s; animation-delay:-.5s; }
.cm-tt { font:600 18px ${DIALOGUE_FONT}; color:var(--ink); }
.cm-tt small { display:block; margin-top:1px; font:italic 14px/1.35 ${DIALOGUE_FONT}; color:var(--ink-dim); }
.cm-where { padding:3px 8px; font:700 9px var(--sans); letter-spacing:.2em; white-space:nowrap; color:var(--c); border:1px solid var(--c); border-radius:2px; background:rgba(0,0,0,.3); }

/* ASSETS AND TOOLS: the full list, with licences and links */
.cm-sec { margin:16px 0 6px; font:700 11px var(--sans); letter-spacing:.3em; color:var(--gold); border-bottom:1px solid rgba(227,187,98,.25); padding-bottom:5px; }
.cm-item { display:grid; grid-template-columns:1fr auto; column-gap:14px; align-items:start; padding:7px 4px; border-bottom:1px solid rgba(239,228,200,.06); }
.cm-what { font:600 16px ${DIALOGUE_FONT}; color:var(--ink); }
.cm-what span { font-weight:500; color:var(--ink-dim); }
.cm-use { margin-top:1px; font:italic 14px ${DIALOGUE_FONT}; color:var(--ink-dim); }
.cm-url { display:inline-block; margin-top:3px; font:12px var(--sans); letter-spacing:.02em; color:var(--key); text-decoration:none; word-break:break-all; }
.cm-url:hover { text-decoration:underline; }
.cm-lic { align-self:center; padding:3px 8px; font:700 9px var(--sans); letter-spacing:.16em; white-space:nowrap; color:var(--moss-hi);
  border:1px solid rgba(188,217,106,.45); border-radius:2px; background:rgba(0,0,0,.3); text-decoration:none; }
.cm-lic:hover { border-color:var(--moss-hi); }
.cm-note { margin:8px 4px 0; font:italic 14px ${DIALOGUE_FONT}; color:var(--ink-dim); }
.cm-note a { color:var(--key); }

.cm-end { margin:28px 0 8px; text-align:center; font:600 clamp(17px, 2.4vw, 22px) ${DIALOGUE_FONT}; letter-spacing:.34em; color:var(--gold);
  text-shadow:0 0 18px rgba(227,187,98,.4); }
.cm-end small { display:block; margin-top:6px; font:italic 14px ${DIALOGUE_FONT}; letter-spacing:.04em; color:var(--ink-dim); text-shadow:none; }

.cm-back { align-self:center; margin-top:14px; padding:7px 28px; cursor:pointer; font:600 13px ${DIALOGUE_FONT}; letter-spacing:.3em; color:var(--gold);
  border:1px solid var(--line); border-radius:2px; background:rgba(227,187,98,.08); }
.cm-back:hover { border-color:var(--gold); background:rgba(227,187,98,.16); }
.cm-keys { margin-top:8px; font-size:10px; letter-spacing:.2em; color:var(--ink-dim); }

/* opening a tab deals its cards in, one after another */
/* (backwards, not both: once dealt, nothing holds the transform, so the team's cards can tilt) */
.cm.show .cm-pane.on .cm-deal { animation:cm-up .5s cubic-bezier(.2,.8,.3,1) backwards; animation-delay:calc(var(--i, 0) * 70ms + 60ms); }
@keyframes cm-up { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:none; } }
@keyframes cm-spin { to { transform:rotate(360deg); } }
@keyframes cm-eq { from { transform:scaleY(.25); } to { transform:scaleY(1); } }
@media (max-width:560px) {
  .cm-track { grid-template-columns:24px 18px 1fr; }
  .cm-where { grid-column:3; justify-self:start; margin-top:6px; }
}
/* a laptop-height screen: everything closes up, and the team's cards lie on
   their side (medallion left, name right) so all six fit without scrolling */
@media (max-height:860px) {
  .cm-in { padding:14px 22px 12px; }
  .cm h2 { font-size:28px; }
  .cm hr { margin:6px auto 5px; }
  .cm-sub { margin-bottom:2px; font-size:13px; }
  .cm-tabs { margin:4px 0 12px; }
  .cm-tab { padding:6px 13px 7px; }
  .cm-lead { margin:0 0 10px; }
  .cm-team { gap:10px; }
  .cm-dev { display:grid; grid-template-columns:auto 1fr; column-gap:14px; align-items:center; padding:24px 14px 14px; text-align:left; }
  .cm-medal { grid-row:1 / span 2; width:58px; height:58px; margin:0; font-size:21px; }
  .cm-dev b { grid-column:2; align-self:end; font-size:16px; }
  .cm-dev small { grid-column:2; justify-self:start; align-self:start; margin-top:6px; }
  .cm-end { margin:16px 0 4px; font-size:17px; }
  .cm-back { margin-top:8px; padding:5px 24px; }
  .cm-keys { margin-top:5px; }
}
@media (prefers-reduced-motion: reduce) {
  .cm *, .cm *::before { animation:none !important; transition:none !important; }
}
`;

export class CreditsMenu {
  constructor() {
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    this.el = document.createElement('div');
    this.el.className = 'cm';
    const link = (url, cls, text) => `<a class="${cls}" href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;

    const team = TEAM.map((name, i) => `<div class="cm-dev cm-deal" style="--i:${i};--c:${TEAM_COLOURS[i % TEAM_COLOURS.length]}">
        <span class="cm-no-card">${String(i + 1).padStart(2, '0')} / ${String(TEAM.length).padStart(2, '0')}</span><span class="cm-gem">◆</span>
        <div class="cm-medal">${initials(name)}</div><b>${name}</b><small>DEVELOPER</small>
      </div>`).join('');

    const castLic = LICENCES[CAST_CREDIT.licence];
    const cast = CAST.map((c, i) => `<div class="cm-role cm-deal" style="--c:${c.color};--i:${i}">
        <b>${c.name}</b><em>${c.role}</em><p>${c.line}</p>
      </div>`).join('');

    const score = SCORE.map((t, i) => `<div class="cm-track cm-deal" style="--c:${t.color};--i:${i}">
        <span class="cm-no">${String(i + 1).padStart(2, '0')}</span>
        <span class="cm-eq"><i></i><i></i><i></i></span>
        <div class="cm-tt">${t.title}<small>${t.what}</small></div>
        <span class="cm-where">${t.where}</span>
      </div>`).join('');

    const assets = CREDIT_SECTIONS.map((s) => {
      const items = s.items.map((it) => {
        const lic = LICENCES[it.licence];
        return `<div class="cm-item">
          <div>
            <div class="cm-what">${it.title} <span>— ${it.by}</span></div>
            <div class="cm-use">${it.use}</div>
            ${link(it.url, 'cm-url', host(it.url) + ' ↗')}
          </div>
          ${link(lic.url ?? it.url, 'cm-lic', lic.name)}
        </div>`;
      }).join('');
      return `<div class="cm-sec">${s.title}</div>${items}${s.note ? `<div class="cm-note">${s.note}</div>` : ''}`;
    }).join('');

    const TABS = [
      ['team', 'THE TEAM', `<div class="cm-lead">Six of us, one forest.</div><div class="cm-team">${team}</div>
        <div class="cm-end">THE FOREST REMEMBERS<small>Every name here carried a piece of the horn.</small></div>`],
      ['cast', 'THE CAST', `<div class="cm-lead">Who you’ll meet between the fire and the falls.</div><div class="cm-cast">${cast}</div>
        <div class="cm-note">${CAST_CREDIT.title}: ${CAST_CREDIT.by}, ${link(castLic.url, '', castLic.name.toLowerCase())}.</div>`],
      ['music', 'THE MUSIC', `<div class="cm-lead">Written for this game and synthesised in code, every note of it. The tune from the fire runs through all four.</div>${score}`],
      ['assets', 'ASSETS AND TOOLS', `<div class="cm-lead">Everything in the game we didn’t make ourselves, with thanks.</div>${assets}`],
    ];
    this.el.innerHTML = `
      <div class="cm-in plaque">
        <h2>CREDITS</h2>
        <hr>
        <div class="cm-sub"><b>${GAME_TITLE}</b></div>
        <div class="cm-tabs">${TABS.map(([id, label]) => `<span class="cm-tab" data-tab="${id}">${label}</span>`).join('')}</div>
        <div class="cm-list">${TABS.map(([id, , html]) => `<div class="cm-pane" data-pane="${id}">${html}</div>`).join('')}</div>
        <div class="cm-back">BACK</div>
        <div class="cm-keys">← → TAB · ↑ ↓ SCROLL · CLICK A LINK TO OPEN IT · ESC BACK</div>
      </div>`;
    this.list = this.el.querySelector('.cm-list');
    this.tabs = TABS.map(([id]) => id);
    for (const t of this.el.querySelectorAll('.cm-tab')) t.addEventListener('click', () => this.show(t.dataset.tab));
    // the team's cards tilt toward the pointer, and their light follows it
    for (const card of this.el.querySelectorAll('.cm-dev')) {
      if (STILL) break;
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
        card.style.transform = `rotateX(${((0.5 - v) * 14).toFixed(1)}deg) rotateY(${((u - 0.5) * 16).toFixed(1)}deg) translateY(-4px)`;
        card.style.setProperty('--mx', `${(u * 100).toFixed(0)}%`);
        card.style.setProperty('--my', `${(v * 100).toFixed(0)}%`);
      });
      card.addEventListener('pointerleave', () => {
        card.style.transform = '';
        card.style.removeProperty('--mx');
        card.style.removeProperty('--my');
      });
    }
    this.show('team');
    this.onClose = null;

    // a click here is not also a click on the menu underneath
    for (const t of ['mousedown', 'pointerdown', 'click']) this.el.addEventListener(t, (e) => e.stopPropagation());
    this.el.querySelector('.cm-back').addEventListener('click', () => this.close());
    // a click on the dimmed backdrop, outside the panel, closes it too
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
    this._onKey = this._onKey.bind(this);
    window.addEventListener('keydown', this._onKey, true); // capture: ahead of the title menu and the game
    document.body.appendChild(this.el);
  }

  get visible() {
    return this.el.classList.contains('show');
  }

  /** One tab on screen: 'team', 'cast', 'music' or 'assets'. */
  show(id) {
    this.tab = id;
    for (const t of this.el.querySelectorAll('.cm-tab')) t.classList.toggle('on', t.dataset.tab === id);
    for (const p of this.el.querySelectorAll('.cm-pane')) p.classList.toggle('on', p.dataset.pane === id);
    this.list.scrollTop = 0;
  }

  open() {
    if (document.pointerLockElement) document.exitPointerLock();
    this.show('team');
    this.el.classList.add('show');
  }

  close() {
    if (!this.visible) return;
    this.el.classList.remove('show');
    this.onClose?.();
  }

  _onKey(e) {
    if (!this.visible) return;
    const k = e.key.toLowerCase();
    const page = this.list.clientHeight * 0.85;
    const at = this.tabs.indexOf(this.tab);
    if (k === 'arrowright' || k === 'd' || k === 'tab') this.show(this.tabs[(at + 1) % this.tabs.length]);
    else if (k === 'arrowleft' || k === 'a') this.show(this.tabs[(at + this.tabs.length - 1) % this.tabs.length]);
    else if (k >= '1' && k <= String(this.tabs.length)) this.show(this.tabs[+k - 1]);
    else if (k === 'arrowdown' || k === 's') this.list.scrollBy({ top: 70, behavior: 'smooth' });
    else if (k === 'arrowup' || k === 'w') this.list.scrollBy({ top: -70, behavior: 'smooth' });
    else if (k === ' ' || k === 'pagedown') this.list.scrollBy({ top: page, behavior: 'smooth' });
    else if (k === 'pageup') this.list.scrollBy({ top: -page, behavior: 'smooth' });
    else if (k === 'home') this.list.scrollTo({ top: 0, behavior: 'smooth' });
    else if (k === 'end') this.list.scrollTo({ top: this.list.scrollHeight, behavior: 'smooth' });
    else if (k === 'escape' || k === 'backspace' || k === 'enter') this.close();
    // every key stays here while the panel is up (including the ones it doesn't use)
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey, true);
    this.el.remove();
    this.style.remove();
  }
}
