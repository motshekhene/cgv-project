import { THEME_CSS, END_CSS, showEndScreen } from './theme.js';

/**
 * FightHUD — DOM overlay for the Level 3 fight. Lives inside the shared #hud
 * div, injects its own scoped styles and removes everything on dispose(), so
 * it leaves nothing behind between levels or restarts.
 *
 * Layout: one three-column grid across the top. Kai's slim plaque takes the
 * left column, the Handler's the middle, and the right column is kept clear
 * for the round lock-on icon (TouchControls), so nothing can slide under
 * anything else however narrow the window gets. Below 640 px it stacks.
 *
 * Kai's plaque widens with his max health (setPlayer's maxScale), and three
 * icon slots light up as the forest shrines' gifts are collected (setAwards).
 */
const CSS = THEME_CSS + END_CSS + `
.fh { position:absolute; inset:0; font-family:var(--sans); color:var(--ink); user-select:none; transition:opacity .5s ease; }
.fh * { box-sizing:border-box; }
.fh-top { position:absolute; top:12px; left:12px; right:12px; display:grid; column-gap:14px; row-gap:6px; align-items:start;
  grid-template-columns:minmax(150px, 1fr) minmax(200px, 420px) minmax(150px, 1fr); transition:opacity .6s ease, transform .6s ease; }
.fh.ended .fh-top, .fh.ended .fh-tell { opacity:0; transform:translateY(-10px); }

.fh-player { position:relative; grid-column:1; justify-self:start; width:calc(180px * var(--hpw, 1)); max-width:100%; padding:4px 10px 6px;
  transition:width .9s cubic-bezier(.2,.8,.2,1), border-color .3s; }
.fh-name { display:flex; align-items:center; justify-content:space-between; height:14px; margin-bottom:3px;
  font-family:var(--serif); font-weight:700; font-size:10px; letter-spacing:.3em; color:var(--gold); text-shadow:0 1px 0 #000; }
.fh-awards { display:flex; gap:5px; font-family:var(--sans); font-style:normal; letter-spacing:0; }
.fh-awards i { font-style:normal; font-size:11px; line-height:1; color:var(--ink-dim); opacity:.28; transition:opacity .4s, transform .4s, color .4s, text-shadow .4s; }
.fh-awards i.got { opacity:1; color:var(--c); text-shadow:0 0 6px var(--c); }
.fh-awards i.new { animation:fhGot 1s ease-out; }

.fh-bar { position:relative; height:7px; background:rgba(0,0,0,.6); border-radius:2px; overflow:hidden;
  box-shadow:inset 0 1px 2px rgba(0,0,0,.8), 0 0 0 1px rgba(0,0,0,.7); }
.fh-bar.thin { height:3px; margin-top:3px; }
.fh-bar > div { position:absolute; left:0; top:0; bottom:0; width:100%; }
.fh-lag { background:#f3dfae; opacity:.85; transition:width .7s cubic-bezier(.3,0,.2,1) .35s; }
.fh-hp { background:linear-gradient(180deg, rgba(255,255,255,.3), transparent 60%), linear-gradient(90deg, var(--ember), var(--ember-hi));
  transition:width .1s linear; }
.fh-st { background:linear-gradient(90deg, var(--moss), var(--moss-hi)); }
.fh-player.low .fh-hp { animation:fhLow .8s ease-in-out infinite; }
.fh-player.low { border-color:rgba(242,147,79,.75); }

.fh-boss { position:relative; grid-column:2; padding:4px 12px 6px; }
.fh-boss-head { display:flex; align-items:baseline; justify-content:space-between; gap:10px; height:14px; margin-bottom:3px; white-space:nowrap; }
.fh-boss-name { font-family:var(--serif); font-weight:700; font-size:11px; letter-spacing:.34em; color:var(--ink); text-shadow:0 1px 0 #000; }
.fh-boss-phase { font-size:9px; font-weight:600; letter-spacing:.22em; color:var(--ember-hi); overflow:hidden; text-overflow:ellipsis; }
.fh-fill { background:linear-gradient(180deg, rgba(255,255,255,.22), transparent 60%), linear-gradient(90deg, var(--blood), var(--ember) 60%, var(--ember-hi));
  transition:width .12s linear; }
.fh-tick { position:absolute; top:-1px; bottom:-1px; width:2px; margin-left:-1px; background:rgba(0,0,0,.75); }
.fh-boss.flash { animation:fhFlash .9s ease-out; }

/* Strategy gift: what the Handler is about to do, under his bar */
.fh-tell { position:absolute; top:62px; left:50%; transform:translate(-50%, -4px); padding:4px 14px 5px; white-space:nowrap; opacity:0;
  font-size:10px; font-weight:600; letter-spacing:.2em; transition:opacity .2s ease, transform .2s ease; }
.fh-tell.show { opacity:1; transform:translate(-50%, 0); }
.fh-tell b { color:var(--c, var(--gold)); margin-right:8px; letter-spacing:.26em; text-shadow:0 0 8px var(--c, transparent); }
.fh-tell span { color:var(--ink-dim); }

.fh-toast { position:absolute; left:50%; bottom:24%; transform:translate(-50%, 8px); padding:7px 16px; opacity:0; white-space:nowrap;
  font-size:11px; font-weight:600; letter-spacing:.2em; color:var(--ink); transition:opacity .3s ease, transform .3s ease; }
.fh-toast b { color:var(--gold); margin-right:10px; }
.fh-toast.show { opacity:1; transform:translate(-50%, 0); }

/* off-screen pointer to the Handler: sits on an ellipse round the screen centre, points outward */
.fh-ptr { position:absolute; width:34px; height:34px; margin:-17px 0 0 -17px; display:none; place-items:center; pointer-events:none;
  color:var(--ember-hi); font-size:28px; line-height:1; text-shadow:0 0 12px rgba(242,147,79,.95), 0 1px 2px #000; }
.fh-ptr.show { display:grid; animation:fhPtr 1.1s ease-in-out infinite; }
.fh.ended .fh-ptr { display:none; }

.fh-pop { position:absolute; left:50%; top:38%; transform:translate(-50%,-50%); font-family:var(--serif); font-size:clamp(24px, 3.6vw, 38px);
  font-weight:700; letter-spacing:.2em; opacity:0; white-space:nowrap; -webkit-text-stroke:1px rgba(0,0,0,.45);
  text-shadow:0 3px 0 rgba(0,0,0,.65), 0 0 18px currentColor; }
.fh-pop.show { animation:fhpop .75s ease-out forwards; }
.fh-flash { position:absolute; inset:0; background:radial-gradient(ellipse at center, transparent 48%, rgba(150,22,12,.78) 100%); opacity:0; transition:opacity .35s ease-out; }
/* lightning (phase III's storm): the whole frame washes cold white for a beat */
.fh-bolt { position:absolute; inset:0; pointer-events:none; opacity:0; mix-blend-mode:screen;
  background:linear-gradient(180deg, rgba(228,236,255,.9), rgba(205,218,255,.45) 55%, rgba(205,218,255,.2)); }

@media (max-width: 640px) {
  .fh-top { grid-template-columns:minmax(0, 1fr) 44px; }
  .fh-boss { grid-column:1; grid-row:1; }
  .fh-player { grid-column:1; grid-row:2; }
  .fh-tell { top:100px; }
}
@media (max-height: 500px) {
  .fh-toast { bottom:auto; top:104px; }
}
@keyframes fhpop { 0% { opacity:0; transform:translate(-50%,-30%) scale(.7); } 20% { opacity:1; transform:translate(-50%,-50%) scale(1.08); }
  100% { opacity:0; transform:translate(-50%,-85%) scale(1); } }
@keyframes fhLow { 50% { filter:brightness(1.6); } }
@keyframes fhFlash { 0% { box-shadow:0 0 0 1px var(--ember-hi), 0 0 30px rgba(242,147,79,.8); } 100% { box-shadow:0 4px 14px rgba(0,0,0,.45); } }
@keyframes fhPtr { 50% { opacity:.55; } }
@keyframes fhGot { 0% { transform:scale(2.6); } 60% { transform:scale(.9); } 100% { transform:scale(1); } }
`;

/** Icon + colour per forest gift (ids match level3/Awards.js). */
const AWARD_ICONS = [
  ['vitality', '♥', '#ff6b5a'],
  ['strategy', '◈', '#8fd0ff'],
  ['power', '✸', '#ffb347'],
];

export class FightHUD {
  constructor(host = document.getElementById('hud') || document.body) {
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    this.el = document.createElement('div');
    this.el.className = 'fh';
    this.el.innerHTML = `
      <div class="fh-bolt"></div>
      <div class="fh-flash"></div>
      <div class="fh-top">
        <div class="fh-player plaque">
          <div class="fh-name">KAI <span class="fh-awards">${AWARD_ICONS.map(([id, ch, c]) => `<i data-id="${id}" style="--c:${c}">${ch}</i>`).join('')}</span></div>
          <div class="fh-bar"><div class="fh-lag"></div><div class="fh-hp"></div></div>
          <div class="fh-bar thin"><div class="fh-st"></div></div>
        </div>
        <div class="fh-boss plaque">
          <div class="fh-boss-head"><span class="fh-boss-name">THE HANDLER</span><span class="fh-boss-phase"></span></div>
          <div class="fh-bar"><div class="fh-lag"></div><div class="fh-fill"></div>
            <i class="fh-tick" style="left:33.3%"></i><i class="fh-tick" style="left:66.6%"></i></div>
        </div>
      </div>
      <div class="fh-tell plaque"></div>
      <div class="fh-ptr" title="The Handler">▲</div>
      <div class="fh-toast plaque"></div>
      <div class="fh-pop"></div>
      <div class="end"></div>`;
    host.appendChild(this.el);

    const q = (s) => this.el.querySelector(s);
    this.player = q('.fh-player');
    this.boss = q('.fh-boss');
    this.bossFill = q('.fh-fill');
    this.bossLag = q('.fh-boss .fh-lag');
    this.bossPhase = q('.fh-boss-phase');
    this.hp = q('.fh-hp');
    this.hpLag = q('.fh-player .fh-lag');
    this.st = q('.fh-st');
    this.pop = q('.fh-pop');
    this.flashEl = q('.fh-flash');
    this.boltEl = q('.fh-bolt');
    this._bolt = 0;
    this.tell = q('.fh-tell');
    this.toastEl = q('.fh-toast');
    this.ptr = q('.fh-ptr');
    this._ptrOn = false;
    this.banner = q('.end');
    this._phase = null;
    this._lock = null;
    this._tellText = '';
    this._hpw = 1;
  }

  setBoss(frac, phaseName) {
    const w = `${Math.max(0, frac) * 100}%`;
    this.bossFill.style.width = w;
    this.bossLag.style.width = w;
    if (phaseName !== this._phase) {
      if (this._phase !== null) this._replay(this.boss, 'flash');
      this._phase = phaseName;
      this.bossPhase.textContent = phaseName;
    }
  }

  /** maxScale = maxHealth / base max health: the life bar itself gets longer. */
  setPlayer(hpFrac, stFrac, maxScale = 1) {
    const w = `${Math.max(0, hpFrac) * 100}%`;
    this.hp.style.width = w;
    this.hpLag.style.width = w;
    this.st.style.width = `${Math.max(0, stFrac) * 100}%`;
    this.player.classList.toggle('low', hpFrac > 0 && hpFrac < 0.25);
    if (maxScale !== this._hpw) {
      this._hpw = maxScale;
      this.player.style.setProperty('--hpw', String(maxScale));
    }
  }

  /** ids = collected gift ids; `fresh` gets a little pop. */
  setAwards(ids, fresh = null) {
    for (const i of this.el.querySelectorAll('.fh-awards i')) {
      i.classList.toggle('got', ids.includes(i.dataset.id));
      if (i.dataset.id === fresh) this._replay(i, 'new');
    }
  }

  /** Strategy gift: name the Handler's next move. Empty text hides it. */
  setTell(name, advice = '', color = '') {
    const text = name ? `${name}|${advice}` : '';
    if (text === this._tellText) return;
    this._tellText = text;
    if (!name) {
      this.tell.classList.remove('show');
      return;
    }
    this.tell.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = name;
    const s = document.createElement('span');
    s.textContent = advice;
    this.tell.append(b, s);
    this.tell.style.setProperty('--c', color || 'var(--gold)');
    this.tell.classList.add('show');
  }

  /** Fade the whole HUD out for cutscenes. */
  setVisible(on) {
    this.el.style.opacity = on ? '1' : '0';
  }

  /** The round icon (TouchControls) shows the camera mode; this confirms a switch with a short toast. */
  setCamMode(mode) {
    const help = {
      follow: ['FOLLOW', 'left / right turn Kai and the view · TAB: lock-on'],
      lock: ['LOCK-ON', 'camera stays on the Handler · left / right strafe · TAB: 360° view'],
      orbit: ['360° VIEW', 'drag · hold ◀ ▶ · wheel · TAB: follow'],
    }[mode];
    if (help) this.toast(help[0], help[1]);
  }

  /** Kept for older callers: true = lock-on, false = 360° view. */
  setLock(on) {
    const first = this._lock === null;
    this._lock = on;
    if (!first) this.setCamMode(on ? 'lock' : 'orbit');
  }

  /**
   * Point at the Handler from the screen edge. angle: 0 = ahead (top edge),
   * +pi/2 = to Kai's right, pi = behind (bottom edge). null hides it.
   */
  setPointer(angle) {
    const on = angle !== null && angle !== undefined;
    if (on !== this._ptrOn) {
      this._ptrOn = on;
      this.ptr.classList.toggle('show', on);
    }
    if (!on) return;
    this.ptr.style.left = `${50 + Math.sin(angle) * 44}%`;
    this.ptr.style.top = `${52 - Math.cos(angle) * 36}%`;
    this.ptr.style.transform = `rotate(${angle}rad)`;
  }

  /** Small plaque low in the middle of the screen: a gold label and a line of help. */
  toast(label, text, seconds = 2.4) {
    this.toastEl.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = label;
    this.toastEl.append(b, document.createTextNode(text));
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), seconds * 1000);
  }

  popup(text, color = '#ffffff') {
    this.pop.textContent = text;
    this.pop.style.color = color;
    this._replay(this.pop, 'show');
  }

  /** Lightning, 0..1 (ShrineArena.flash): the screen washes white with it. */
  lightning(k) {
    if (Math.abs(k - this._bolt) < 0.01 && (k > 0 || this._bolt === 0)) return;
    this._bolt = k;
    this.boltEl.style.opacity = (k * 0.55).toFixed(3);
  }

  damageFlash() {
    this.flashEl.style.transition = 'none';
    this.flashEl.style.opacity = '1';
    void this.flashEl.offsetWidth;
    this.flashEl.style.transition = 'opacity .35s ease-out';
    this.flashEl.style.opacity = '0';
  }

  /**
   * End-of-fight card. The bars, hints and toasts get out of the way first.
   * opts = { kind: 'win' | 'lose', action: { label, key, onClick } }.
   */
  showBanner(title, sub, color, { kind = 'win', action = null } = {}) {
    this.el.classList.add('ended');
    this.toastEl.classList.remove('show');
    this.el.style.opacity = '1';
    showEndScreen(this.banner, { kind, title, sub, action });
  }

  _replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  dispose() {
    clearTimeout(this._toastTimer);
    this.el.remove();
    this.style.remove();
  }
}
