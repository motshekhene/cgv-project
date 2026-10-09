import { THEME_CSS, END_CSS, showEndScreen, hideEndScreen } from './theme.js';

/**
 * StoryOverlay — the cinematic layer for Level 3 (3B, story/UI): letterbox
 * bars, title cards, the skip hint, typed dialogue lines, letter and
 * shrine-gift pop-ups, and the VICTORY card with credits. Same rules as FightHUD: lives in
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
  box-shadow:0 10px 30px #0009; font-family:var(--serif); }
.so-letter.show { opacity:1; transform:translate(-50%,0) rotate(-1.2deg); }
.so-letter small { display:block; font-family:var(--sans); font-size:10px; font-weight:600; letter-spacing:.28em; color:#8a5a26; margin-bottom:8px; }
.so-letter q { font-size:19px; line-height:1.35; quotes:'\\201C' '\\201D'; }
.so-award { position:absolute; left:50%; top:max(22%, 110px); display:flex; align-items:center; gap:14px; padding:10px 22px 11px 14px;
  transform:translate(-50%, -10px) scale(.96); opacity:0; transition:opacity .4s ease, transform .4s cubic-bezier(.2,.9,.3,1.3); }
.so-award.show { opacity:1; transform:translate(-50%, 0) scale(1); }
.so-award i { font-style:normal; font-size:30px; line-height:1; color:var(--c); text-shadow:0 0 14px var(--c); width:34px; text-align:center; }
.so-award small { display:block; font-size:9px; font-weight:600; letter-spacing:.32em; color:var(--ink-dim); }
.so-award b { display:block; font-family:var(--serif); font-size:20px; letter-spacing:.22em; color:var(--c); margin:1px 0 2px; }
.so-award span { display:block; font-size:12px; color:var(--ink); letter-spacing:.04em; }
.so-flash { position:absolute; inset:0; background:var(--c, #fff6e0); opacity:0; pointer-events:none; }
.so-flash.go { animation:soFlash .7s ease-out forwards; }
@keyframes soFlash { 0% { opacity:.85; } 100% { opacity:0; } }
/* dialogue: the prologue's style (ui/dialogue.js) — name above in the speaker's colour, cream serif, no box */
.so-shade { position:absolute; left:0; right:0; bottom:0; height:42%; opacity:0; transition:opacity .6s;
  background:linear-gradient(to top, rgba(3,6,4,.78) 0%, rgba(3,6,4,.42) 55%, rgba(3,6,4,0) 100%); }
.so-shade.show { opacity:1; }
.so-talk { position:absolute; left:50%; bottom:calc(11vh + 40px); width:min(640px, 86vw); transform:translate(-50%, 10px); opacity:0;
  transition:opacity .35s ease, transform .35s ease; text-align:center; }
.so-talk.show { opacity:1; transform:translate(-50%, 0); }
.so-talk small { display:block; font-family:var(--serif); font-size:16px; font-weight:600; letter-spacing:.5em; text-indent:.5em;
  color:var(--who, var(--gold)); margin-bottom:8px; text-shadow:0 1px 10px rgba(0,0,0,.95), 0 0 26px rgba(0,0,0,.8); }
.so-talk p { margin:0; font-family:var(--serif); font-size:23px; line-height:1.45; color:#f2e8d5;
  text-shadow:0 2px 12px rgba(0,0,0,.95), 0 0 30px rgba(0,0,0,.6); }
.so-talk .rest { visibility:hidden; }
.so-talk .caret { display:none; } /* the prologue's lines have no cursor either */
.so-talk.typed .caret { animation:soBlink 1s steps(1) infinite; }
@keyframes soBlink { 50% { opacity:0; } }
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
      <div class="so-flash"></div>
      <div class="so-bar top"></div><div class="so-bar bot"></div>
      <div class="so-card"><h2></h2><hr><p></p></div>
      <div class="so-skip">SPACE / CLICK TO SKIP &#9656;</div>
      <div class="so-shade"></div>
      <div class="so-talk"><small></small><p><span class="typed-part"></span><i class="caret"></i><span class="rest"></span></p></div>
      <div class="so-letter"><small></small><q></q></div>
      <div class="so-award plaque"><i></i><div><small>SHRINE GIFT · ONCE ONLY</small><b></b><span></span></div></div>
      <div class="end"></div>`;
    host.appendChild(this.el);

    const q = (s) => this.el.querySelector(s);
    this.card = q('.so-card');
    this.skipEl = q('.so-skip');
    this.letterEl = q('.so-letter');
    this.awardEl = q('.so-award');
    this.talkEl = q('.so-talk');
    this.shadeEl = q('.so-shade');
    this.flashEl = q('.so-flash');
    this.end = q('.end');
    this.onSkip = null;
    this.skipEl.addEventListener('pointerdown', () => this.onSkip && this.onSkip());
    this.skipEl.addEventListener('mousedown', (e) => e.stopPropagation()); // not also a click on the game (Input listens on window)
    this.line = null;
  }

  /** Letterbox bars on/off; skip shows the "skip" hint while they're up. */
  setCinematic(on, skip = false) {
    this.el.classList.toggle('cine', on);
    this.skipEl.classList.toggle('on', on && skip);
  }

  /** A white flash over the whole frame (the final blow). */
  flash(color = '#fff6e0') {
    this.flashEl.style.setProperty('--c', color);
    this.flashEl.classList.remove('go');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('go');
  }

  /** The skip hint's wording (it always skips the whole cutscene when clicked). */
  setSkipLabel(text = 'SPACE / CLICK TO SKIP') {
    this.skipEl.innerHTML = `${text} &#9656;`;
  }

  /**
   * A line of dialogue, typed out letter by letter like a film's subtitle
   * terminal: who's speaking (in their colour) over the line. The full line
   * is laid out from the start (the untyped rest is invisible), so the words
   * never jump as they wrap. Driven by updateLine(dt) with game time, so it
   * pauses with the game.
   */
  showLine(who, text, color, cps = 38) {
    this.line = { text, t: 0, cps, shown: -1 };
    this.talkEl.style.setProperty('--who', color);
    this.talkEl.querySelector('small').textContent = who;
    this.talkEl.classList.remove('typed');
    this._typeTo(0);
    this.talkEl.classList.add('show');
    this.shadeEl.classList.add('show');
  }

  /** Advance the typing; true once the whole line is out. */
  updateLine(dt) {
    const l = this.line;
    if (!l) return true;
    l.t += dt;
    this._typeTo(Math.min(l.text.length, Math.floor(l.t * l.cps)));
    return this.lineDone;
  }

  get lineDone() {
    return !this.line || this.line.shown >= this.line.text.length;
  }

  /** Type the rest of the line at once (the player is reading ahead). */
  finishLine() {
    if (this.line) this._typeTo(this.line.text.length);
  }

  hideLine() {
    this.line = null;
    this.talkEl.classList.remove('show');
    this.shadeEl.classList.remove('show');
  }

  _typeTo(n) {
    const l = this.line;
    if (n === l.shown) return;
    l.shown = n;
    l.t = Math.max(l.t, n / l.cps);
    this.talkEl.querySelector('.typed-part').textContent = l.text.slice(0, n);
    this.talkEl.querySelector('.rest').textContent = l.text.slice(n);
    this.talkEl.classList.toggle('typed', n >= l.text.length); // the caret only blinks once it's waiting
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

  /** Final card: title, one line, credits, and a PLAY AGAIN button (R also works). */
  showEnd({ title, sub, credits, action }) {
    const lines = credits ? [{ text: credits, cls: 'end-credits' }] : [];
    showEndScreen(this.end, { kind: 'win', title, sub, lines, action });
  }

  hideEnd() {
    hideEndScreen(this.end);
  }

  dispose() {
    clearTimeout(this._letterTimer);
    clearTimeout(this._awardTimer);
    this.el.remove();
    this.style.remove();
  }
}
