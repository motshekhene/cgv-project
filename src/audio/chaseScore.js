/**
 * The chase: Level 1's music, written for this story instead of a stock
 * track. Kai is running down a mountain forest with the horn, so it is
 * hand drums and an mbira, not synth pads:
 *
 *   - djembe: a low bass stroke, open tones and sharp slaps in a 12/8
 *     pattern that keeps rolling forward (the run)
 *   - a shaker on every pulse, leaning on the beats
 *   - a talking drum's falling bends at the end of every fourth bar
 *   - a low drone on D and A under it all, the filter slowly breathing
 *   - from the fifth bar, the prologue's mbira tune from the fire, faster
 *     now, with its answering line: the same story, running
 *
 * Everything is synthesised (no files to download or credit) by rendering
 * one 16-bar loop into an AudioBuffer with an OfflineAudioContext, so it
 * plays like any recorded loop and keeps every volume, duck and mute the
 * level already has.
 *
 *   renderChaseScore(ctx.sampleRate).then((buffer) => track.setBuffer(buffer));
 */
const PULSE = 0.18; // seconds per pulse; 12 pulses a bar
const BARS = 16;
const BAR = PULSE * 12;
// D minor pentatonic, the prologue's scale (Prologue.js SCALE)
const SCALE = [146.83, 174.61, 196.0, 220.0, 261.63, 293.66, 349.23, 392.0, 440.0, 523.25, 587.33];
const MBIRA = [
  [7, 4], [5, -1], [6, 3], [5, 2], [4, -1], [5, 3],
  [8, 5], [6, -1], [5, 4], [6, 3], [4, -1], [3, 1],
  [7, 4], [6, -1], [4, 2], [5, 4], [3, -1], [4, 2],
  [6, 3], [5, -1], [3, 1], [4, 2], [2, -1], [3, 0],
];
// the bass under each pair of bars: D, D, F, C (as in the prologue)
const ROOTS = [73.42, 73.42, 87.31, 65.41, 73.42, 73.42, 87.31, 110.0];

function noiseBuffer(ctx, seconds) {
  const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

export async function renderChaseScore(sampleRate = 44100) {
  const seconds = BARS * BAR;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const out = ctx.createDynamicsCompressor(); // glue, and no clipping
  out.threshold.value = -14;
  out.ratio.value = 3;
  const trim = ctx.createGain(); // a little headroom under the compressor
  trim.gain.value = 0.75;
  out.connect(trim);
  trim.connect(ctx.destination);
  const noise = noiseBuffer(ctx, 1);

  const pan = (v) => {
    const p = ctx.createStereoPanner();
    p.pan.value = v;
    p.connect(out);
    return p;
  };
  const drums = pan(0.05), shaker = pan(0.35), mbiraBus = pan(-0.2), low = pan(0);

  /** A pitched drum hit: a sine falling from f0 to f1, plus a click of filtered noise. */
  const drum = (t, f0, f1, decay, amp, clickHz = 0, clickAmp = 0, dest = drums) => {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + decay * 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + decay + 0.02);
    if (clickAmp > 0) {
      const n = ctx.createBufferSource(); n.buffer = noise;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = clickHz; bp.Q.value = 1.2;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(clickAmp, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      n.connect(bp); bp.connect(ng); ng.connect(dest);
      n.start(t, Math.random() * 0.8, 0.08);
    }
  };
  const shake = (t, amp) => {
    const n = ctx.createBufferSource(); n.buffer = noise;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    n.connect(hp); hp.connect(g); g.connect(shaker);
    n.start(t, Math.random() * 0.8, 0.09);
  };
  const tine = (t, f, amp) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.004);
    g.gain.exponentialRampToValueAtTime(amp * 0.25, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    g.connect(mbiraBus);
    const o = ctx.createOscillator(); o.frequency.value = f;
    o.connect(g); o.start(t); o.stop(t + 1.5);
    const p = ctx.createOscillator(); p.frequency.value = f * 4.07;
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(amp * 0.35, t);
    pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    p.connect(pg); pg.connect(mbiraBus); p.start(t); p.stop(t + 0.12);
  };

  // the drone: D2 and A2, a slow filter swell over the whole loop
  {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(220, 0);
    lp.frequency.linearRampToValueAtTime(520, seconds / 2);
    lp.frequency.linearRampToValueAtTime(220, seconds);
    const g = ctx.createGain(); g.gain.value = 0.16;
    lp.connect(g); g.connect(low);
    for (const f of [73.42, 110.0]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      o.connect(lp); o.start(0); o.stop(seconds);
    }
  }

  for (let bar = 0; bar < BARS; bar++) {
    const t0 = bar * BAR;
    const at = (pulse) => t0 + pulse * PULSE;
    // djembe: bass strokes, open tones, slaps
    for (const p of [0, 7]) drum(at(p), 95, 55, 0.32, 0.9, 400, 0.15);
    if (bar % 2) drum(at(10), 95, 55, 0.28, 0.6, 400, 0.12);
    for (const p of [3, 6, 9]) drum(at(p), 260, 210, 0.16, 0.35, 1800, 0.18);
    for (const p of [4, 11]) drum(at(p), 420, 330, 0.08, 0.22, 3400, 0.45);
    // the shaker on every pulse, leaning on the beats
    for (let p = 0; p < 12; p++) shake(at(p), p % 3 === 0 ? 0.16 : 0.07);
    // the bass: a plucked root each bar
    drum(at(0), ROOTS[Math.floor(bar / 2) % ROOTS.length], ROOTS[Math.floor(bar / 2) % ROOTS.length] * 0.98, 0.9, 0.35, 0, 0, low);
    // a talking drum's falling bends to close every fourth bar
    if (bar % 4 === 3) for (const p of [6, 8, 10]) drum(at(p), 230, 130, 0.22, 0.4, 900, 0.1);
    // the mbira from the fire, from the fifth bar: one note every two pulses
    if (bar >= 4) {
      for (let p = 0; p < 12; p += 2) {
        const i = ((bar - 4) * 6 + p / 2) % MBIRA.length;
        const [lead, answer] = MBIRA[i];
        tine(at(p), SCALE[lead], 0.12);
        if (answer >= 0) tine(at(p + 1), SCALE[answer], 0.07);
      }
    }
  }

  return ctx.startRendering();
}
