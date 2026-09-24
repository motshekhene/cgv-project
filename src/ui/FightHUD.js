/**
 * FightHUD — DOM overlay for the Level 3 fight. Lives inside the shared #hud
 * div, injects its own scoped styles and removes everything on dispose(), so
 * it leaves nothing behind between levels or restarts.
 */
const CSS = `
.fh { position:absolute; inset:0; font-family:'Segoe UI',system-ui,sans-serif; color:#f3e9df; user-select:none; }
.fh * { box-sizing:border-box; }
.fh-boss { position:absolute; top:22px; left:50%; transform:translateX(-50%); width:min(560px,70vw); text-align:center; }
.fh-boss-name { font-size:13px; letter-spacing:.35em; color:#ffb98a; text-shadow:0 0 8px #ff5a1a88; }
.fh-boss-phase { font-size:11px; letter-spacing:.3em; color:#ff7a4a; margin-top:2px; min-height:14px; }
.fh-track { position:relative; height:12px; margin-top:6px; background:#1a0d0a; border:1px solid #ff7a3a55; border-radius:2px; overflow:hidden; }
.fh-fill { height:100%; width:100%; background:linear-gradient(90deg,#c22a10,#ff7a1a); transition:width .12s linear; }
.fh-tick { position:absolute; top:0; bottom:0; width:2px; background:#000a; }
.fh-player { position:absolute; left:26px; top:22px; width:min(260px,30vw); }
.fh-label { font-size:10px; letter-spacing:.25em; color:#c9b8a8; margin:8px 0 3px; }
.fh-bar { height:10px; background:#120b09; border:1px solid #ffffff22; border-radius:2px; overflow:hidden; }
.fh-hp { height:100%; background:linear-gradient(90deg,#b3122a,#ff4a5c); transition:width .1s linear; }
.fh-st { height:100%; background:linear-gradient(90deg,#1f9d6a,#6cf0b0); }
.fh-help { position:absolute; left:50%; transform:translateX(-50%); bottom:14px; font-size:11px; line-height:1.7; color:#b8a898aa; text-align:center; white-space:nowrap; }
.fh-help b { color:#ffcf9e; font-weight:600; }
.fh-pop { position:absolute; left:50%; top:38%; transform:translate(-50%,-50%); font-size:34px; font-weight:800; letter-spacing:.2em; opacity:0; text-shadow:0 0 18px currentColor; }
.fh-pop.show { animation:fhpop .7s ease-out forwards; }
@keyframes fhpop { 0%{opacity:0;transform:translate(-50%,-30%) scale(.7)} 20%{opacity:1;transform:translate(-50%,-50%) scale(1.1)} 100%{opacity:0;transform:translate(-50%,-80%) scale(1)} }
.fh-flash { position:absolute; inset:0; background:radial-gradient(ellipse at center,transparent 45%,#ff1a1acc 100%); opacity:0; transition:opacity .35s ease-out; }
.fh-banner { position:absolute; inset:0; display:none; flex-direction:column; align-items:center; justify-content:center; background:#000000a8; }
.fh-banner.show { display:flex; }
.fh-banner h1 { margin:0; font-size:64px; letter-spacing:.3em; text-indent:.3em; }
.fh-banner p { margin:14px 0 0; font-size:14px; letter-spacing:.3em; color:#d8c8b8; }
.fh-lock { position:absolute; left:26px; top:118px; font-size:11px; letter-spacing:.25em; color:#ffcf9e; }
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
      <div class="fh-boss">
        <div class="fh-boss-name">THE HANDLER</div>
        <div class="fh-boss-phase"></div>
        <div class="fh-track"><div class="fh-fill"></div><div class="fh-tick" style="left:33%"></div><div class="fh-tick" style="left:66%"></div></div>
      </div>
      <div class="fh-player">
        <div class="fh-label">HEALTH</div><div class="fh-bar"><div class="fh-hp"></div></div>
        <div class="fh-label">STAMINA</div><div class="fh-bar"><div class="fh-st"></div></div>
      </div>
      <div class="fh-lock"></div>
      <div class="fh-help">
        <b>WASD</b> / joystick move &nbsp; <b>LMB</b> attack (x3 combo)<br>
        <b>RMB</b> block &middot; tap just before impact = <b>PARRY</b><br>
        <b>SPACE</b> dodge roll &nbsp; <b>TAB</b> lock-on &nbsp; <b>Q</b> slow-mo &nbsp; <b>R</b> restart
      </div>
      <div class="fh-pop"></div>
      <div class="fh-banner"><h1></h1><p></p></div>`;
    host.appendChild(this.el);

    const q = (s) => this.el.querySelector(s);
    this.bossFill = q('.fh-fill');
    this.bossPhase = q('.fh-boss-phase');
    this.hp = q('.fh-hp');
    this.st = q('.fh-st');
    this.pop = q('.fh-pop');
    this.flashEl = q('.fh-flash');
    this.banner = q('.fh-banner');
    this.lock = q('.fh-lock');
  }

  setBoss(frac, phaseName) {
    this.bossFill.style.width = `${Math.max(0, frac) * 100}%`;
    this.bossPhase.textContent = phaseName;
  }

  setPlayer(hpFrac, stFrac) {
    this.hp.style.width = `${Math.max(0, hpFrac) * 100}%`;
    this.st.style.width = `${Math.max(0, stFrac) * 100}%`;
  }

  setLock(on) {
    this.lock.textContent = on ? 'LOCK-ON' : '360° VIEW — drag, hold ◀ ▶, or wheel';
  }

  popup(text, color = '#ffffff') {
    this.pop.textContent = text;
    this.pop.style.color = color;
    this.pop.classList.remove('show');
    void this.pop.offsetWidth;
    this.pop.classList.add('show');
  }

  damageFlash() {
    this.flashEl.style.transition = 'none';
    this.flashEl.style.opacity = '1';
    void this.flashEl.offsetWidth;
    this.flashEl.style.transition = 'opacity .35s ease-out';
    this.flashEl.style.opacity = '0';
  }

  showBanner(title, sub, color) {
    this.banner.querySelector('h1').textContent = title;
    this.banner.querySelector('h1').style.color = color;
    this.banner.querySelector('p').textContent = sub;
    this.banner.classList.add('show');
  }

  dispose() {
    this.el.remove();
    this.style.remove();
  }
}
