/**
 * One mute for the whole game: M in every level, and every level's own sound
 * button, all flip the same switch, and it carries from level to level.
 *
 * Each level brings its own sound (three.js's listener on Level 1, Web Audio
 * graphs built by hand on Levels 2 and 3 and the prologue, an <audio> element
 * for the title music). Rather than teach every one of them about M, each
 * AudioContext the game makes gets a master volume between it and the
 * speakers, and its `destination` is that master volume: whatever a level
 * connects "to the speakers" goes through it. Media elements are muted as
 * they start playing.
 *
 * The same master volume carries the OPTIONS volume (core/settings.js:
 * `master`), and musicVolumeNode(ctx) is the music's own volume, for each
 * level to put on its music bus.
 *
 * Import this before anything makes an AudioContext (main.js does it first).
 *
 *   toggleMuted();              // Game does this on M
 *   isMuted();
 *   onMuteChange((muted) => …); // returns an unsubscribe
 *   music.connect(musicVolumeNode(ctx)).connect(master);
 */
import { settings, onSettings } from "../core/settings.js";

const contexts = new Set();
const media = new Set();
const listeners = new Set();
let muted = false;

function patchContext(name) {
  const Base = window[name];
  if (!Base || Base.__masterMute) return;
  class MasterMuted extends Base {
    constructor(...args) {
      super(...args);
      const master = this.createGain();
      master.gain.value = muted ? 0 : settings.master;
      master.connect(super.destination);
      Object.defineProperty(this, "destination", { value: master, configurable: true });
      this.__master = master;
      contexts.add(this);
    }
    close() {
      contexts.delete(this);
      return super.close();
    }
  }
  MasterMuted.__masterMute = true;
  window[name] = MasterMuted;
}

if (typeof window !== "undefined") {
  patchContext("AudioContext");
  patchContext("webkitAudioContext");
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    media.add(this);
    this.muted = muted;
    return play.apply(this, args);
  };
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  value = !!value;
  if (value === muted) return;
  muted = value;
  applyMaster();
  for (const el of media) el.muted = muted;
  for (const f of listeners) f(muted);
  showToast(muted ? "SOUND OFF" : "SOUND ON");
}

/** Every context's master volume to where M and the OPTIONS volume say. */
function applyMaster() {
  for (const ctx of contexts) {
    if (ctx.state === "closed") contexts.delete(ctx);
    else ctx.__master.gain.setTargetAtTime(muted ? 0 : settings.master, ctx.currentTime, 0.03);
  }
}
if (typeof window !== "undefined") onSettings((s, key) => key === "master" && applyMaster());

/**
 * A gain node that follows the OPTIONS music volume: a level puts it on its
 * music bus (music -> this -> master), so the slider moves the music alone.
 */
export function musicVolumeNode(ctx) {
  const node = ctx.createGain();
  node.gain.value = settings.music;
  const off = onSettings((s, key) => {
    if (key !== "music") return;
    if (ctx.state === "closed") off();
    else node.gain.setTargetAtTime(s.music, ctx.currentTime, 0.05);
  });
  return node;
}

export function toggleMuted() {
  setMuted(!muted);
}

export function onMuteChange(f) {
  listeners.add(f);
  return () => listeners.delete(f);
}

// a small pill at the top of the screen, so M always shows that it did something
let toast = null;
let toastTimer = 0;
function showToast(text) {
  if (typeof document === "undefined") return;
  if (!toast) {
    toast = document.createElement("div");
    Object.assign(toast.style, {
      position: "fixed", top: "84px", left: "50%", transform: "translateX(-50%)", zIndex: "10050",
      padding: "6px 16px", borderRadius: "999px", background: "rgba(12,16,14,.78)", color: "#f1e6c8",
      font: "600 11px/1.4 'Segoe UI',system-ui,sans-serif", letterSpacing: ".24em", pointerEvents: "none",
      border: "1px solid rgba(241,230,200,.25)", transition: "opacity .25s", opacity: "0",
    });
    document.body.appendChild(toast);
  }
  toast.textContent = `${muted ? "\u{1F507}" : "\u{1F50A}"}  ${text}  ·  M`;
  toast.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.opacity = "0"; }, 1300);
}
