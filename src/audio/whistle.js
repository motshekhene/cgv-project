/**
 * Baba Zwane's whistle: two notes, high then low, falling off at the end of
 * each, a man calling across a valley. The prologue plays it live at the
 * fire (Prologue.js Sfx.whistle). This is the same call baked into an
 * AudioBuffer, so a level can play it from somewhere in the world: in
 * Level 1 it comes from the masked Marshal behind Kai, a clue to who he is.
 */
export function makeWhistleBuffer(ctx) {
  const sr = ctx.sampleRate;
  const len = Math.ceil(sr * 1.15);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  // [start s, pitch Hz, length s], as at the fire
  for (const [at, f, dur] of [[0.0, 1318, 0.34], [0.52, 988, 0.46]]) {
    let phase = 0;
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr);
    for (let i = 0; i < n && i0 + i < len; i++) {
      const t = i / sr;
      const k = t / dur;
      // a glide from a touch sharp to a touch flat, and a mouth's vibrato
      const freq = f * (1.04 + (0.97 - 1.04) * k) + 9 * Math.sin(2 * Math.PI * 5.6 * t);
      phase += (2 * Math.PI * freq) / sr;
      const env = Math.min(1, t / 0.05) * (k < 0.8 ? 1 : Math.max(0, (1 - k) / 0.2));
      d[i0 + i] += Math.sin(phase) * env * 0.6;
    }
  }
  return buf;
}
