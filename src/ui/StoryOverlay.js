import { THEME_CSS, END_CSS, showEndScreen, hideEndScreen } from './theme.js';

/**
 * StoryOverlay — the cinematic layer for Level 3 (3B, story/UI): letterbox
 * bars, title cards, the skip hint, letter pop-ups, the Handler's phone in the
 * epilogue and the end card with credits. Same rules as FightHUD: lives in
 * #hud, injects scoped styles, removes everything on dispose().
 */
const CSS = THEME_CSS + END_CSS + `
.so { position:absolute; inset:0; font-family:var(--sans); color:var(--ink); user-select:none; pointer-events:none; }
.so * { box-sizing:border-box; }
.so-bar { position:absolute; left:0; right:0; height:11vh; background:#000; transform:scaleY(0); transition:transform .6s ease; }
.so-bar.top { top:0; transform-origin:top; } .so-bar.bot { bottom:0; transform-origin:bottom; }
.so.cine .so-bar { transform:scaleY(1); }
.so-card { position:absolute; left:0; right:0; bottom:16vh; text-align:center; opacity:0; transition:opacity .8s ease; }
.so-card.show { opacity:1; }
.so-card h2 { margin:0; font-family:var(--serif); font-weight:700; font-size:clamp(28px,4.6vw,58px); letter-spacing:.34em; text-indent:.34em;
  color:var(--ink); text-shadow:0 3px 0 rgba(0,0,0,.55), 0 0 26px rgba(0,0,0,.7); }
.so-card.show h2 { animation:soTrack 1.6s cubic-bezier(.2,.7,.2,1) both; }
.so-card hr { width:min(320px,50vw); height:1px; margin:12px auto 10px; border:0; background:linear-gradient(90deg, transparent, var(--gold), transparent); transform:scaleX(0); }
.so-card.show hr { animation:soLine 1s cubic-bezier(.2,.7,.2,1) .35s forwards; }
.so-card p { margin:0; font-family:var(--serif); font-size:clamp(13px,1.5vw,17px); letter-spacing:.08em; color:var(--ink); font-style:italic;
  text-shadow:0 2px 8px #000; opacity:0; }
.so-card.show p { animation:soUp .8s ease .7s forwards; }
.so-skip { position:absolute; right:22px; bottom:calc(11vh + 14px); font-size:11px; font-weight:600; letter-spacing:.25em; color:var(--gold);
  opacity:0; transition:opacity .4s; pointer-events:auto; cursor:pointer; text-shadow:0 1px 2px #000; }
.so.cine .so-skip.on { opacity:1; }
.so-letter { position:absolute; left:50%; bottom:20vh; width:min(440px,84vw); transform:translate(-50%,20px) rotate(-1.2deg); opacity:0;
  transition:opacity .45s ease, transform .45s ease; background:#efe6d2; color:#2b2219; padding:18px 22px 16px; border-radius:2px;
  box-shadow:0 10px 30px #0009; font-family:Georgia,'Times New Roman',serif; }
.so-letter.show { opacity:1; transform:translate(-50%,0) rotate(-1.2deg); }
.so-letter small { display:block; font-family:var(--sans); font-size:10px; font-weight:600; letter-spacing:.28em; color:#8a5a26; margin-bottom:8px; }
.so-letter q { font-size:19px; line-height:1.35; quotes:'\\201C' '\\201D'; }
.so-phone { position:absolute; left:50%; top:50%; width:min(300px,78vw); height:min(560px,82vh); transform:translate(-50%,-46%) scale(.96); opacity:0;
  transition:opacity .6s ease, transform .6s ease; background:#0b0d10; border:3px solid #2a2e35; border-radius:34px; padding:46px 18px 22px;
  box-shadow:0 20px 60px #000d, inset 0 0 0 2px #000; overflow:hidden; }
.so-phone.show { opacity:1; transform:translate(-50%,-50%) scale(1); }
.so-phone::before { content:''; position:absolute; top:14px; left:50%; width:84px; height:18px; margin-left:-42px; background:#000; border-radius:10px; }
.so-ph-time { text-align:center; font-size:46px; font-weight:300; color:#e8eef5; letter-spacing:.04em; }
.so-ph-date { text-align:center; font-size:12px; color:#9aa6b4; margin-bottom:18px; }
.so-note { background:#1b2028ee; border-radius:14px; padding:10px 12px; margin-bottom:9px; opacity:0; transform:translateY(10px); transition:all .4s ease; }
.so-note.show { opacity:1; transform:none; }
.so-note b { display:block; font-size:10px; letter-spacing:.14em; color:#8fa0b3; margin-bottom:3px; }
.so-note span { font-size:13px; color:#e9edf2; line-height:1.35; }
.so-note.red span { color:#ff8a7a; }
.so-award { position:absolute; left:50%; top:max(22%, 110px); display:flex; align-items:center; gap:14px; padding:10px 22px 11px 14px;
  transform:translate(-50%, -10px) scale(.96); opacity:0; transition:opacity .4s ease, transform .4s cubic-bezier(.2,.9,.3,1.3); }
.so-award.show { opacity:1; transform:translate(-50%, 0) scale(1); }
.so-award i { font-style:normal; font-size:30px; line-height:1; color:var(--c); text-shadow:0 0 14px var(--c); width:34px; text-align:center; }
.so-award small { display:block; font-size:9px; font-weight:600; letter-spacing:.32em; color:var(--ink-dim); }
.so-award b { display:block; font-family:var(--serif); font-size:20px; letter-spacing:.22em; color:var(--c); margin:1px 0 2px; }
.so-award span { display:block; font-size:12px; color:var(--ink); letter-spacing:.04em; }
@keyframes soTrack { from { opacity:0; letter-spacing:.9em; text-indent:.9em; filter:blur(6px); } to { opacity:1; } }
@keyframes soLine { to { transform:scaleX(1); } }
@keyframes soUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
`;

export class StoryOverlay {
  constructor(host = document.getElementById('hud') || document.body) {
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    this.el = document.createElement('div');
    this.el.className = 'so';
    this.el.innerHTML = `
      <div class="so-bar top"></div><div class="so-bar bot"></div>
      <div class="so-card"><h2></h2><hr><p></p></div>
      <div class="so-skip">SPACE / CLICK TO SKIP &#9656;</div>
      <div class="so-letter"><small></small><q></q></div>
      <div class="so-award plaque"><i></i><div><small>SHRINE GIFT · ONCE ONLY</small><b></b><span></span></div></div>
      <div class="so-phone"><div class="so-ph-time"></div><div class="so-ph-date"></div><div class="so-ph-list"></div></div>
      <div class="end"></div>`;
    host.appendChild(this.el);

    const q = (s) => this.el.querySelector(s);
    this.card = q('.so-card');
    this.skipEl = q('.so-skip');
    this.letterEl = q('.so-letter');
    this.awardEl = q('.so-award');
    this.phone = q('.so-phone');
    this.end = q('.end');
    this._timers = [];
    this.onSkip = null;
    this.skipEl.addEventListener('pointerdown', () => this.onSkip && this.onSkip());
  }

  _later(ms, fn) {
    this._timers.push(setTimeout(fn, ms));
  }

  /** Letterbox bars on/off; skip shows the "skip" hint while they're up. */
  setCinematic(on, skip = false) {
    this.el.classList.toggle('cine', on);
    this.skipEl.classList.toggle('on', on && skip);
  }

  showCard(title, sub = '') {
    this.card.querySelector('h2').textContent = title;
    this.card.querySelector('p').textContent = sub;
    this.card.classList.remove('show');
    void this.card.offsetWidth; // restart the animation for back-to-back cards
    this.card.classList.add('show');
  }

  hideCard() {
    this.card.classList.remove('show');
  }

  /** A dead-drop letter, shown for a few seconds without pausing the fight. */
  showLetter(label, text, seconds = 5) {
    this.letterEl.querySelector('small').textContent = label;
    this.letterEl.querySelector('q').textContent = text;
    this.letterEl.classList.add('show');
    clearTimeout(this._letterTimer);
    this._letterTimer = setTimeout(() => this.letterEl.classList.remove('show'), seconds * 1000);
  }

  /** A forest shrine's gift: icon, name, what it does. */
  showAward(icon, title, desc, color, seconds = 4) {
    this.awardEl.style.setProperty('--c', color);
    this.awardEl.querySelector('i').textContent = icon;
    this.awardEl.querySelector('b').textContent = title;
    this.awardEl.querySelector('span').textContent = desc;
    this.awardEl.classList.add('show');
    clearTimeout(this._awardTimer);
    this._awardTimer = setTimeout(() => this.awardEl.classList.remove('show'), seconds * 1000);
  }

  hideLetter() {
    clearTimeout(this._letterTimer);
    this.letterEl.classList.remove('show');
  }

  /** The Handler's phone: lock screen, then notifications arriving one by one. */
  showPhone(notes, { time = '19:42', date = 'SITE 7 · NO SERVICE', gap = 1100 } = {}) {
    this.phone.querySelector('.so-ph-time').textContent = time;
    this.phone.querySelector('.so-ph-date').textContent = date;
    const list = this.phone.querySelector('.so-ph-list');
    list.innerHTML = '';
    this.phone.classList.add('show');
    notes.forEach((n, i) => {
      const d = document.createElement('div');
      d.className = 'so-note' + (n.red ? ' red' : '');
      d.innerHTML = `<b></b><span></span>`;
      d.querySelector('b').textContent = n.from;
      d.querySelector('span').textContent = n.text;
      list.appendChild(d);
      this._later(500 + i * gap, () => d.classList.add('show'));
    });
  }

  hidePhone() {
    this.phone.classList.remove('show');
  }

  /** Final card: title, line, letters found, credits, and a PLAY AGAIN button (R also works). */
  showEnd({ title, sub, letters, credits, action }) {
    const lines = [];
    if (letters) lines.push({ text: letters, cls: 'end-meta' });
    if (credits) lines.push({ text: credits, cls: 'end-credits' });
    showEndScreen(this.end, { kind: 'win', title, sub, lines, action });
  }

  hideEnd() {
    hideEndScreen(this.end);
  }

  dispose() {
    for (const t of this._timers) clearTimeout(t);
    clearTimeout(this._letterTimer);
    clearTimeout(this._awardTimer);
    this.el.remove();
    this.style.remove();
  }
}
