import { THEME_CSS, END_CSS, showEndScreen } from './theme.js';

/**
 * FightHUD — DOM overlay for the Level 3 fight. Lives inside the shared #hud
 * div, injects its own scoped styles and removes everything on dispose(), so
 * it leaves nothing behind between levels or restarts.
 *
 * Layout: one three-column grid across the top. Kai's plaque takes the left
 * column, the Handler's the middle, and the right column is kept clear for
 * the VIEW toggle (TouchControls), so nothing can slide under anything else
 * however narrow the window gets. Below 760 px it stacks.
 */
const CSS = THEME_CSS + END_CSS + `
.fh { position:absolute; inset:0; font-family:var(--sans); color:var(--ink); user-select:none; transition:opacity .5s ease; }
.fh * { box-sizing:border-box; }
.fh-top { position:absolute; top:14px; left:14px; right:14px; display:grid; column-gap:16px; row-gap:8px; align-items:start;
  grid-template-columns:minmax(178px, 1fr) minmax(220px, 540px) minmax(178px, 1fr); transition:opacity .6s ease, transform .6s ease; }
.fh.ended .fh-top { opacity:0; transform:translateY(-10px); }

.fh-player { grid-column:1; justify-self:start; width:min(290px, 100%); padding:7px 14px 10px; }
.fh-name { display:flex; align-items:baseline; justify-content:space-between; font-family:var(--serif); font-weight:700;
  font-size:14px; letter-spacing:.3em; color:var(--gold); text-shadow:0 1px 0 #000; margin-bottom:6px; }
.fh-name small { font-family:var(--sans); font-weight:600; font-size:9px; letter-spacing:.25em; color:var(--ink-dim); }

.fh-bar { position:relative; height:12px; background:rgba(0,0,0,.6); border-radius:2px; overflow:hidden;
  box-shadow:inset 0 1px 3px rgba(0,0,0,.8), 0 0 0 1px rgba(0,0,0,.7); }
.fh-bar.thin { height:6px; margin-top:5px; }
.fh-bar > div { position:absolute; left:0; top:0; bottom:0; width:100%; }
.fh-lag { background:#f3dfae; opacity:.85; transition:width .7s cubic-bezier(.3,0,.2,1) .35s; }
.fh-hp { background:linear-gradient(180deg, rgba(255,255,255,.28), transparent 55%), linear-gradient(90deg, var(--ember), var(--ember-hi));
  transition:width .1s linear; }
.fh-st { background:linear-gradient(180deg, rgba(255,255,255,.25), transparent 55%), linear-gradient(90deg, var(--moss), var(--moss-hi)); }
.fh-player.low .fh-hp { animation:fhLow .8s ease-in-out infinite; }
.fh-player.low { border-color:rgba(242,147,79,.7); }

.fh-boss { grid-column:2; padding:7px 16px 11px; text-align:center; }
.fh-boss-name { font-family:var(--serif); font-weight:700; font-size:15px; letter-spacing:.42em; text-indent:.42em; color:var(--ink);
  text-shadow:0 1px 0 #000, 0 0 12px rgba(201,68,43,.45); }
.fh-boss-phase { font-size:10px; font-weight:600; letter-spacing:.3em; text-indent:.3em; color:var(--ember-hi); margin:2px 0 6px; min-height:13px; }
.fh-boss .fh-bar { height:11px; }
.fh-fill { background:linear-gradient(180deg, rgba(255,255,255,.22), transparent 55%), linear-gradient(90deg, var(--blood), var(--ember) 60%, var(--ember-hi));
  transition:width .12s linear; }
.fh-tick { position:absolute; top:-1px; bottom:-1px; width:2px; margin-left:-1px; background:rgba(0,0,0,.75); box-shadow:1px 0 0 rgba(227,187,98,.35); }
.fh-boss.flash { animation:fhFlash .9s ease-out; }

.fh-toast { position:absolute; left:50%; bottom:24%; transform:translate(-50%, 8px); padding:8px 18px; opacity:0; white-space:nowrap;
  font-size:11px; font-weight:600; letter-spacing:.24em; color:var(--ink); transition:opacity .3s ease, transform .3s ease; }
.fh-toast b { color:var(--gold); margin-right:10px; }
.fh-toast.show { opacity:1; transform:translate(-50%, 0); }

.fh-pop { position:absolute; left:50%; top:38%; transform:translate(-50%,-50%); font-family:var(--serif); font-size:clamp(26px, 4vw, 40px);
  font-weight:700; letter-spacing:.2em; opacity:0; white-space:nowrap; -webkit-text-stroke:1px rgba(0,0,0,.45);
  text-shadow:0 3px 0 rgba(0,0,0,.65), 0 0 18px currentColor; }
.fh-pop.show { animation:fhpop .75s ease-out forwards; }
.fh-flash { position:absolute; inset:0; background:radial-gradient(ellipse at center, transparent 48%, rgba(150,22,12,.78) 100%); opacity:0; transition:opacity .35s ease-out; }

@media (max-width: 760px) {
  .fh-top { grid-template-columns:minmax(0, 1fr) 150px; }
  .fh-boss { grid-column:1; grid-row:1; }
  .fh-player { grid-column:1; grid-row:2; width:min(250px, 100%); }
}
@keyframes fhpop { 0% { opacity:0; transform:translate(-50%,-30%) scale(.7); } 20% { opacity:1; transform:translate(-50%,-50%) scale(1.08); }
  100% { opacity:0; transform:translate(-50%,-85%) scale(1); } }
@keyframes fhLow { 50% { filter:brightness(1.6); } }
@keyframes fhFlash { 0% { box-shadow:0 0 0 1px var(--ember-hi), 0 0 34px rgba(242,147,79,.8); } 100% { box-shadow:0 4px 14px rgba(0,0,0,.45); } }
`;

export class FightHUD {
  constructor(host = document.getElementById('hud') || document.body) {
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    this.el = document.createElement('div');
    this.el.className = 'fh';
    this.el.innerHTML = `
      <div class="fh-flash"></div>
      <div class="fh-top">
        <div class="fh-player plaque">
          <div class="fh-name">KAI <small>HEALTH · STAMINA</small></div>
          <div class="fh-bar"><div class="fh-lag"></div><div class="fh-hp"></div></div>
          <div class="fh-bar thin"><div class="fh-st"></div></div>
        </div>
        <div class="fh-boss plaque">
          <div class="fh-boss-name">THE HANDLER</div>
          <div class="fh-boss-phase"></div>
          <div class="fh-bar"><div class="fh-lag"></div><div class="fh-fill"></div>
            <i class="fh-tick" style="left:33.3%"></i><i class="fh-tick" style="left:66.6%"></i></div>
        </div>
      </div>
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
    this.toast = q('.fh-toast');
    this.banner = q('.end');
    this._phase = null;
    this._lock = null;
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

  setPlayer(hpFrac, stFrac) {
    const w = `${Math.max(0, hpFrac) * 100}%`;
    this.hp.style.width = w;
    this.hpLag.style.width = w;
    this.st.style.width = `${Math.max(0, stFrac) * 100}%`;
    this.player.classList.toggle('low', hpFrac > 0 && hpFrac < 0.25);
  }

  /** Fade the whole HUD out for cutscenes. */
  setVisible(on) {
    this.el.style.opacity = on ? '1' : '0';
  }

  /** The VIEW button shows the current mode; this just confirms a switch with a short toast. */
  setLock(on) {
    const first = this._lock === null;
    this._lock = on;
    if (first) return;
    this.toast.innerHTML = on
      ? '<b>LOCK-ON</b>camera follows the fight'
      : '<b>FREE VIEW</b>drag · hold ◀ ▶ · wheel to zoom · TAB to lock on';
    this.toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toast.classList.remove('show'), 2400);
  }

  popup(text, color = '#ffffff') {
    this.pop.textContent = text;
    this.pop.style.color = color;
    this._replay(this.pop, 'show');
  }

  damageFlash() {
    this.flashEl.style.transition = 'none';
    this.flashEl.style.opacity = '1';
    void this.flashEl.offsetWidth;
    this.flashEl.style.transition = 'opacity .35s ease-out';
    this.flashEl.style.opacity = '0';
  }

  /**
   * End-of-fight card. The bars and toasts get out of the way first.
   * opts = { kind: 'win' | 'lose', action: { label, key, onClick } }.
   */
  showBanner(title, sub, color, { kind = 'win', action = null } = {}) {
    this.el.classList.add('ended');
    this.toast.classList.remove('show');
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
