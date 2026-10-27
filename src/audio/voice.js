import { settings, onSettings } from '../core/settings.js';
import { isMuted, onMuteChange } from './masterMute.js';

/**
 * Voice — the game's narrator: hints, tips and warnings (the goal, a hazard
 * ahead, the horn being ready) read aloud with the browser's own
 * text-to-speech (the Web Speech API), so the player hears them without
 * taking their eyes off the trail. The characters themselves (Kai, Baba
 * Zwane, the Marshal) are text only. A South African English voice is used
 * when the computer has one.
 *
 * OPTIONS > VOICE HINTS turns it off; it follows the master volume and the mute.
 *
 *   hint('A torn page ahead · run through it to pick it up');
 *   hush();                               // a level tearing down
 */
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

// pitch 0..2, rate 0.1..10 (1 = normal); `prefer` ranks the installed voices
const CAST = {
  KAI: { pitch: 1.05, rate: 1.04, prefer: /male|david|guy|mark|daniel|james|ryan|luke/i },
  'BABA ZWANE': { pitch: 0.72, rate: 0.86, prefer: /male|david|guy|mark|daniel|george|james/i },
  'THE MARSHAL': { pitch: 0.5, rate: 0.9, prefer: /male|david|guy|mark|george|daniel/i },
  NARRATOR: { pitch: 0.9, rate: 0.95, prefer: /./ },
};

let voices = [];
function loadVoices() {
  if (!synth) return;
  voices = synth.getVoices().filter((v) => /^en/i.test(v.lang));
}
if (synth) {
  loadVoices();
  synth.addEventListener?.('voiceschanged', loadVoices);
}

/** The best installed voice for a speaker: South African English first, then any English one they'd suit. */
function voiceFor(who) {
  if (!voices.length) loadVoices();
  if (!voices.length) return null;
  const want = (CAST[who] || CAST.NARRATOR).prefer;
  // South African English first (Edge has natural en-ZA voices), then the natural
  // online voices over the robotic local ones, then one that suits the speaker
  const score = (v) => (/en[-_]ZA/i.test(v.lang) ? 4 : 0) + (/natural|online|google/i.test(v.name) ? 3 : 0)
    + (want.test(v.name) ? 2 : 0) + (/female|zira|susan|hazel|linda|aria|jenny|leah|libby|sonia/i.test(v.name) ? -3 : 0);
  return voices.slice().sort((a, b) => score(b) - score(a))[0];
}

const enabled = () => !!synth && settings.voices !== false && !isMuted() && settings.master > 0;

/**
 * Say a line. Dialogue (the default) cuts off what came before, the way the
 * next subtitle replaces the last; `thought: true` queues behind it instead,
 * a little quieter.
 */
export function speak(text, who = 'KAI', { thought = false } = {}) {
  if (!enabled() || !text) return;
  const clean = String(text).replace(/<[^>]+>/g, ' ').replace(/[—–]/g, ', ').replace(/\s+/g, ' ').trim();
  if (!clean) return;
  if (!thought) synth.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  const c = CAST[who] || CAST.NARRATOR;
  const v = voiceFor(who);
  if (v) { u.voice = v; u.lang = v.lang; }
  u.pitch = c.pitch;
  u.rate = c.rate * (thought ? 0.97 : 1);
  u.volume = Math.min(1, settings.master * (thought ? 0.7 : 1));
  synth.speak(u);
}

/**
 * A hint, tip or warning, said by the narrator. Banner text is written in
 * capitals with · between the parts: said as a sentence with pauses. A new
 * hint cuts off the one before.
 */
export function hint(text) {
  const said = String(text).replace(/\u00b7|·/g, ',').replace(/\s+—\s+|\s+-\s+/g, ', ').toLowerCase();
  speak(said, 'NARRATOR');
}

/** Hold the line mid-word while the game is paused, and carry on after. */
export function pauseVoice(on) {
  if (!synth) return;
  if (on) synth.pause();
  else synth.resume();
}

/** Stop talking now. */
export function hush() {
  synth?.cancel();
}

// switching voices off, or muting, stops the line mid-word
onSettings((s, key) => {
  if ((key === 'voices' && !s.voices) || (key === 'master' && s.master === 0)) hush();
});
onMuteChange((m) => m && hush());
