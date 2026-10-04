/**
 * Level 03 placeholder HUD.
 *
 * @3B owns the real UI — this exists so the fight is legible without
 * them. It only ever reads GameState (plus ctx events the level passes
 * in), never the level's internals, and every class is prefixed `l3-`
 * so the real HUD can't collide with it. dispose() removes every DOM
 * node it created, including the <style> tag.
 */

const STYLE = `
.l3-root { position: absolute; inset: 0; pointer-events: none;
  font-family: 'Segoe UI', Arial, sans-serif; color: #e8dcc8;
  text-shadow: 0 1px 3px rgba(0,0,0,0.8); user-select: none; }

.l3-vitals { position: absolute; left: 26px; right: 26px; bottom: 24px;
  display: flex; flex-direction: column; gap: 8px; max-width: 380px; }
.l3-bar { height: 14px; background: rgba(10,6,4,0.72);
  border: 1px solid rgba(255,182,72,0.35); position: relative; }
.l3-bar-fill { position: absolute; inset: 2px; transform-origin: left;
  transition: transform 0.12s linear; }
.l3-hp .l3-bar-fill { background: linear-gradient(90deg, #b8402a, #ff8a4a); }
.l3-sp .l3-bar-fill { background: linear-gradient(90deg, #7a5a20, #e8c25a); }
.l3-bar-label { position: absolute; left: 6px; top: -16px;
  font-size: 10px; letter-spacing: 2px; opacity: 0.75; }

.l3-boss { position: absolute; left: 50%; top: 26px; transform: translateX(-50%);
  width: min(520px, 70vw); text-align: center; transition: opacity 0.4s; }
.l3-boss-name { font-size: 13px; letter-spacing: 6px; margin-bottom: 6px;
  color: #ffb648; }
.l3-boss-phase { display: flex; gap: 6px; justify-content: center; margin-top: 6px; }
.l3-pip { width: 26px; height: 4px; background: rgba(255,255,255,0.18); }
.l3-pip.on { background: #ff5a2a; }

.l3-letter { position: absolute; right: 26px; bottom: 96px; max-width: 300px;
  background: rgba(16,10,6,0.85); border-left: 3px solid #ffb648;
  padding: 10px 14px; font-size: 13px; line-height: 1.5; color: #d9c9a8;
  opacity: 0; transform: translateX(20px); transition: all 0.35s; }
.l3-letter.show { opacity: 1; transform: none; }
.l3-letter b { color: #ffcf87; display: block; font-size: 10px;
  letter-spacing: 3px; margin-bottom: 4px; }

.l3-title { position: absolute; left: 0; right: 0; top: 34%;
  text-align: center; opacity: 0; transition: opacity 0.5s; }
.l3-title.show { opacity: 1; }
.l3-title-main { font-size: clamp(28px, 5vw, 52px); font-weight: 700;
  letter-spacing: 10px; color: #ffcf87; }
.l3-title-sub { font-size: clamp(12px, 1.6vw, 17px); letter-spacing: 4px;
  color: #b7a58c; margin-top: 12px; }
.l3-title-hint { font-size: 11px; letter-spacing: 3px; color: #7d6f5c;
  margin-top: 26px; animation: l3-pulse 1.6s infinite; }
@keyframes l3-pulse { 50% { opacity: 0.25; } }

.l3-controls { position: absolute; left: 26px; top: 24px; font-size: 11px;
  line-height: 1.9; letter-spacing: 1px; color: #a89678;
  background: rgba(10,6,4,0.55); padding: 10px 14px;
  transition: opacity 1s; }
.l3-controls b { color: #e8dcc8; }

.l3-ability { position: absolute; right: 26px; bottom: 24px; width: 46px;
  height: 46px; border: 1px solid rgba(102,224,255,0.5);
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; color: #9ce8ff; background: rgba(8,14,20,0.6);
  position: absolute; }
.l3-ability-cd { position: absolute; inset: 0; background: rgba(4,8,12,0.85);
  transform-origin: bottom; }
.l3-ability.ready { box-shadow: 0 0 14px rgba(102,224,255,0.45); }
.l3-slowmo .l3-root::after { content: ''; }

.l3-upload { position: absolute; left: 50%; bottom: 130px;
  transform: translateX(-50%); width: 300px; text-align: center; }
.l3-upload-label { font-size: 12px; letter-spacing: 4px; margin-bottom: 8px;
  color: #9ce8ff; }
.l3-upload .l3-bar { border-color: rgba(102,224,255,0.5); }
.l3-upload .l3-bar-fill { background: linear-gradient(90deg, #1e7a9a, #66e0ff); }

.l3-overlay { position: absolute; inset: 0; display: flex;
  flex-direction: column; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at center, rgba(20,6,2,0.0) 30%, rgba(8,2,0,0.85));
  opacity: 0; transition: opacity 1.2s; }
.l3-overlay.show { opacity: 1; }
.l3-overlay-main { font-size: clamp(30px, 6vw, 60px); font-weight: 700;
  letter-spacing: 12px; }
.l3-overlay-sub { font-size: 14px; letter-spacing: 4px; color: #b7a58c;
  margin-top: 16px; }
`;

export class Hud {
  constructor(parent = document.getElementById("hud")) {
    this.parent = parent;
    this.root = document.createElement("div");
    this.root.className = "l3-root";

    this.style = document.createElement("style");
    this.style.textContent = STYLE;

    this.root.innerHTML = `
      <div class="l3-vitals">
        <div class="l3-bar l3-hp"><div class="l3-bar-fill"></div>
          <div class="l3-bar-label">INTEGRITY</div></div>
        <div class="l3-bar l3-sp"><div class="l3-bar-fill"></div>
          <div class="l3-bar-label">STAMINA</div></div>
      </div>
      <div class="l3-boss">
        <div class="l3-boss-name">THE HANDLER</div>
        <div class="l3-bar"><div class="l3-bar-fill" style="background:linear-gradient(90deg,#7a1e04,#ff5a2a)"></div></div>
        <div class="l3-boss-phase"><div class="l3-pip on"></div><div class="l3-pip"></div><div class="l3-pip"></div></div>
      </div>
      <div class="l3-controls"></div>
      <div class="l3-letter"><b>SIGNAL RECOVERED</b><span></span></div>
      <div class="l3-title"><div class="l3-title-main"></div>
        <div class="l3-title-sub"></div><div class="l3-title-hint"></div></div>
      <div class="l3-upload" style="display:none">
        <div class="l3-upload-label">UPLOADING</div>
        <div class="l3-bar"><div class="l3-bar-fill"></div></div></div>
      <div class="l3-ability"><div class="l3-ability-cd"></div>Q</div>
      <div class="l3-overlay"><div class="l3-overlay-main"></div>
        <div class="l3-overlay-sub"></div></div>
    `;

    this.parent.appendChild(this.style);
    this.parent.appendChild(this.root);

    this.hp = this.root.querySelector(".l3-hp .l3-bar-fill");
    this.sp = this.root.querySelector(".l3-sp .l3-bar-fill");
    this.boss = this.root.querySelector(".l3-boss");
    this.bossFill = this.root.querySelector(".l3-boss .l3-bar-fill");
    this.pips = [...this.root.querySelectorAll(".l3-pip")];
    this.controls = this.root.querySelector(".l3-controls");
    this.letter = this.root.querySelector(".l3-letter");
    this.letterText = this.letter.querySelector("span");
    this.title = this.root.querySelector(".l3-title");
    this.titleMain = this.title.querySelector(".l3-title-main");
    this.titleSub = this.title.querySelector(".l3-title-sub");
    this.titleHint = this.title.querySelector(".l3-title-hint");
    this.upload = this.root.querySelector(".l3-upload");
    this.uploadFill = this.upload.querySelector(".l3-bar-fill");
    this.ability = this.root.querySelector(".l3-ability");
    this.abilityCd = this.root.querySelector(".l3-ability-cd");
    this.overlay = this.root.querySelector(".l3-overlay");
    this.overlayMain = this.overlay.querySelector(".l3-overlay-main");
    this.overlaySub = this.overlay.querySelector(".l3-overlay-sub");

    this._letterTimer = null;
    this._titleTimer = null;
  }

  setControls(html, { fadeAfter = 0 } = {}) {
    this.controls.innerHTML = html;
    this.controls.style.opacity = "1";
    if (fadeAfter > 0) {
      clearTimeout(this._controlsTimer);
      this._controlsTimer = setTimeout(() => {
        this.controls.style.opacity = "0";
      }, fadeAfter * 1000);
    }
  }

  update(state, ctx = {}) {
    this.hp.style.transform = `scaleX(${Math.max(0, state.health) / state.maxHealth})`;
    this.sp.style.transform = `scaleX(${Math.max(0, state.stamina) / state.maxStamina})`;

    this.boss.style.opacity = ctx.bossVisible ? "1" : "0";
    if (ctx.bossVisible) {
      this.bossFill.style.transform =
        `scaleX(${Math.max(0, state.bossHealth) / state.bossMaxHealth})`;
      this.pips.forEach((pip, i) =>
        pip.classList.toggle("on", i < (state.phase || 1)),
      );
    }

    const cd = ctx.abilityCooldown ?? 0;
    this.abilityCd.style.transform = `scaleY(${Math.min(1, cd)})`;
    this.ability.classList.toggle("ready", cd <= 0 && ctx.abilityReady);

    if (ctx.upload !== null && ctx.upload !== undefined) {
      this.upload.style.display = ctx.upload > 0 ? "block" : "none";
      this.uploadFill.style.transform = `scaleX(${Math.min(1, ctx.upload)})`;
    } else {
      this.upload.style.display = "none";
    }
  }

  letterCard(text, holdMs = 5000) {
    this.letterText.textContent = text;
    this.letter.classList.add("show");
    clearTimeout(this._letterTimer);
    this._letterTimer = setTimeout(() => {
      this.letter.classList.remove("show");
    }, holdMs);
  }

  showTitle(main, sub = "", hint = "", holdMs = 3200) {
    this.titleMain.textContent = main;
    this.titleSub.textContent = sub;
    this.titleHint.textContent = hint;
    this.title.classList.add("show");
    clearTimeout(this._titleTimer);
    if (holdMs > 0) {
      this._titleTimer = setTimeout(() => {
        this.title.classList.remove("show");
      }, holdMs);
    }
  }

  hideTitle() {
    clearTimeout(this._titleTimer);
    this.title.classList.remove("show");
  }

  showOverlay(main, sub = "") {
    this.overlayMain.textContent = main;
    this.overlaySub.textContent = sub;
    this.overlay.classList.add("show");
  }

  hideOverlay() {
    this.overlay.classList.remove("show");
  }

  dispose() {
    clearTimeout(this._letterTimer);
    clearTimeout(this._titleTimer);
    clearTimeout(this._controlsTimer);
    this.root.remove();
    this.style.remove();
  }
}
