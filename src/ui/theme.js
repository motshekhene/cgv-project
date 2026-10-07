/**
 * The Jungle Shrine look for the DOM UI (FightHUD, StoryOverlay, TouchControls, PauseMenu):
 * dark moss-stone plaques with an aged-gold hairline, parchment text, a carved
 * serif for titles, ember for harm, moss for stamina, cyan for the Key.
 *
 * Each component puts THEME_CSS (+ END_CSS if it shows an end screen) in front
 * of its own styles, so they all read the same variables. Plain system fonts
 * only, so nothing has to download on the lab machines.
 */
export const THEME_CSS = `
.fh, .so, .tc, .pm {
  --ink: #efe4c8; --ink-dim: #b8aa8a; --gold: #e3bb62; --gold-dim: #9c7d3c;
  --stone: rgba(13, 17, 11, .78); --stone-hi: rgba(38, 44, 28, .82); --line: rgba(227, 187, 98, .45);
  --ember: #c9442b; --ember-hi: #f2934f; --blood: #7c1610; --moss: #5f8a2e; --moss-hi: #bcd96a;
  --key: #6fe3ff;
  --serif: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
  --sans: 'Segoe UI', system-ui, -apple-system, sans-serif;
}
/* give .plaque elements a position yourself (relative/absolute): the theme sheet is injected by several
   components, so a position set here would override theirs depending on injection order */
.plaque { background:linear-gradient(180deg, var(--stone-hi), var(--stone)); border:1px solid var(--line);
  border-radius:3px; box-shadow:0 4px 14px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.07); backdrop-filter:blur(3px); }
.plaque::before, .plaque::after { content:''; position:absolute; top:50%; width:6px; height:6px; margin-top:-3px;
  background:var(--gold); transform:rotate(45deg); box-shadow:0 0 6px rgba(227,187,98,.6); }
.plaque::before { left:-3px; } .plaque::after { right:-3px; }
`;

/** Full-screen end card: DEFEATED / VICTORY / the epilogue's last word. */
export const END_CSS = `
.end { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; visibility:hidden; opacity:0;
  transition:opacity .9s ease, visibility 0s linear .9s; font-family:var(--sans); color:var(--ink); }
.end.show { visibility:visible; opacity:1; transition:opacity .9s ease; }
.end::before { content:''; position:absolute; inset:0;
  background:radial-gradient(ellipse at center, rgba(22,20,12,.45) 0%, rgba(8,9,6,.88) 68%, rgba(0,0,0,.95) 100%); }
.end.lose::before { background:radial-gradient(ellipse at center, rgba(70,12,6,.4) 0%, rgba(14,4,3,.9) 68%, #000 100%); }
.end.lose.show { backdrop-filter:grayscale(.85) blur(2px); }
.end-in { position:relative; text-align:center; padding:0 20px; width:min(940px, 96vw); }
.end-orn { display:flex; align-items:center; gap:14px; width:min(440px, 72vw); margin:0 auto 14px; color:var(--gold); }
.end-orn i { flex:1; height:1px; background:linear-gradient(270deg, var(--gold), transparent); transform:scaleX(0); transform-origin:right; }
.end-orn i + b + i { background:linear-gradient(90deg, var(--gold), transparent); transform-origin:left; }
.end-orn b { width:9px; height:9px; background:var(--gold); transform:rotate(45deg) scale(0); box-shadow:0 0 10px var(--gold); }
.end.lose .end-orn { color:var(--ember-hi); }
.end.lose .end-orn i { background:linear-gradient(270deg, var(--ember-hi), transparent); }
.end.lose .end-orn i + b + i { background:linear-gradient(90deg, var(--ember-hi), transparent); }
.end.lose .end-orn b { background:var(--ember-hi); box-shadow:0 0 10px var(--ember); }
.end.show .end-orn i { animation:endLine 1s cubic-bezier(.2,.7,.2,1) .2s forwards; }
.end.show .end-orn b { animation:endGem .5s cubic-bezier(.3,1.6,.5,1) .15s forwards; }
.end h1 { margin:0; font-family:var(--serif); font-weight:700; line-height:1.05; white-space:nowrap; letter-spacing:.12em;
  font-size:min(96px, calc(min(90vw, 900px) / (var(--n) * .92)));
  filter:drop-shadow(0 3px 0 rgba(0,0,0,.6)) drop-shadow(0 0 22px rgba(227,187,98,.3)); }
.end.lose h1 { filter:drop-shadow(0 3px 0 rgba(0,0,0,.7)) drop-shadow(0 0 26px rgba(201,68,43,.5)); }
.end h1 span { display:inline-block; opacity:0; color:transparent; -webkit-background-clip:text; background-clip:text;
  background-image:linear-gradient(180deg, #fff4d8 0%, var(--gold) 52%, #7d5a22 100%); }
.end.lose h1 span { background-image:linear-gradient(180deg, #ffd9c2 0%, var(--ember-hi) 30%, var(--ember) 62%, var(--blood) 100%); }
.end.show h1 span { animation:endLetter .75s cubic-bezier(.2,.8,.2,1) forwards; animation-delay:calc(.35s + var(--i) * .065s); }
.end-sub { margin:16px 0 0; font-family:var(--serif); font-style:italic; font-size:clamp(14px, 1.9vw, 20px); letter-spacing:.04em; color:var(--ink); }
.end-meta { margin:20px 0 0; font-size:12px; letter-spacing:.3em; color:var(--key); }
.end-credits { margin:22px auto 0; max-width:600px; font-size:11px; letter-spacing:.1em; line-height:1.9; color:var(--ink-dim); }
.end-sub, .end-meta, .end-credits, .end-btn { opacity:0; }
.end.show .end-sub, .end.show .end-meta, .end.show .end-credits { animation:endUp .7s ease forwards; animation-delay:var(--d); }
.end-btn { pointer-events:auto; display:inline-flex; align-items:center; gap:14px; margin-top:30px; padding:12px 18px 12px 30px; cursor:pointer;
  font:700 13px var(--sans); letter-spacing:.32em; color:var(--ink); border:1px solid var(--line); border-radius:2px;
  background:linear-gradient(180deg, rgba(64,56,32,.9), rgba(20,19,11,.94)); box-shadow:0 0 0 1px rgba(0,0,0,.6), 0 8px 22px rgba(0,0,0,.5); }
.end-btn:hover { border-color:var(--gold); box-shadow:0 0 0 1px rgba(0,0,0,.6), 0 0 22px rgba(227,187,98,.35); }
.end-btn kbd { font:700 11px var(--sans); letter-spacing:0; padding:3px 7px; border:1px solid var(--line); border-radius:3px; color:var(--gold); background:rgba(0,0,0,.35); }
.end.lose .end-btn:hover { border-color:var(--ember-hi); box-shadow:0 0 0 1px rgba(0,0,0,.6), 0 0 22px rgba(242,147,79,.35); }
.end.show .end-btn { animation:endUp .7s ease forwards, endPulse 2.6s ease-in-out infinite; animation-delay:var(--d), calc(var(--d) + .7s); }
@keyframes endLine { to { transform:scaleX(1); } }
@keyframes endGem { to { transform:rotate(45deg) scale(1); } }
@keyframes endLetter { 0% { opacity:0; transform:translateY(-.4em) scale(1.3); filter:blur(10px); } 100% { opacity:1; transform:none; filter:blur(0); } }
@keyframes endUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }
@keyframes endPulse { 0%,100% { box-shadow:0 0 0 1px rgba(0,0,0,.6), 0 8px 22px rgba(0,0,0,.5); } 50% { box-shadow:0 0 0 1px rgba(0,0,0,.6), 0 0 26px rgba(227,187,98,.32); } }
`;

/**
 * Fill an `.end` element and play it in. kind = 'win' (gold) | 'lose' (ember).
 * lines = [{ text, cls: 'end-meta' | 'end-credits' }]; action = { label, key, onClick }.
 */
export function showEndScreen(el, { kind = 'win', title, sub = '', lines = [], action = null }) {
  el.className = `end ${kind}`;
  el.innerHTML = '';
  const inner = document.createElement('div');
  inner.className = 'end-in';
  inner.innerHTML = '<div class="end-orn"><i></i><b></b><i></i></div>';

  const h1 = document.createElement('h1');
  h1.style.setProperty('--n', String(Math.max(6, title.length)));
  [...title].forEach((ch, i) => {
    const s = document.createElement('span');
    s.textContent = ch === ' ' ? ' ' : ch;
    s.style.setProperty('--i', String(i));
    h1.appendChild(s);
  });
  inner.appendChild(h1);

  // everything after the title lands once the last letter has
  let d = 0.35 + title.length * 0.065 + 0.45;
  const add = (tag, cls, text) => {
    const e = document.createElement(tag);
    e.className = cls;
    e.textContent = text;
    e.style.setProperty('--d', `${d.toFixed(2)}s`);
    d += 0.3;
    inner.appendChild(e);
    return e;
  };
  if (sub) add('p', 'end-sub', sub);
  for (const l of lines) add('p', l.cls || 'end-meta', l.text);
  if (action) {
    const wrap = document.createElement('div');
    const btn = add('button', 'end-btn', action.label);
    wrap.appendChild(btn);
    inner.appendChild(wrap);
    if (action.key) {
      const k = document.createElement('kbd');
      k.textContent = action.key;
      btn.appendChild(k);
    }
    btn.addEventListener('click', () => action.onClick?.());
  }
  el.appendChild(inner);
  void el.offsetWidth; // let the hidden state paint first so the transition runs
  el.classList.add('show');
}

export function hideEndScreen(el) {
  el.classList.remove('show');
}
