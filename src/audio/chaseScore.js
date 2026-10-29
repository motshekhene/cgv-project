/**
 * The game's own music, one score per level, written for this story instead
 * of a stock track. Kai is carrying a forest's horn, so it is hand drums,
 * mbira and marimba rather than synth pads, and the prologue's mbira tune
 * from the fire runs through all three, the same story in a new place:
 *
 *   'run'    Level 1, down the mountain on foot. 12/8 djembe (a low bass
 *            stroke, open tones, sharp slaps) that keeps rolling forward, a
 *            shaker, talking-drum bends every fourth bar, a low drone on D
 *            and A, and from the fifth bar the fire's mbira tune, faster.
 *   'drive'  Level 2, the River Road at dusk into the storm. A straight,
 *            pushing 4/4 at car speed: syncopated low drums, a pulsing bass
 *            in eighths, a marimba ostinato, and the fire's tune high and
 *            sparse over the top from bar nine, like it's out of the window.
 *   'fight'  Level 3, the falls, the fight with the Marshal. Big low toms
 *            on a fast 12/8 with rolls into each bar, the shaker, a war
 *            horn swelling every four bars (the horn's own sound), and the
 *            fire's tune at full speed: it has become a fight song.
 *
 * Everything is synthesised (no files to download or credit) by rendering
 * one 16-bar loop into an AudioBuffer with an OfflineAudioContext, so each
 * plays like any recorded loop and keeps every volume, duck and mute its
 * level already has.
 *
 *   renderScore('drive', ctx.sampleRate).then((buffer) => { src.buffer = buffer; });
 */
const BARS = 16;
// D minor pentatonic, the prologue's scale (Prologue.js SCALE)
const SCALE = [146.83, 174.61, 196.0, 220.0, 261.63, 293.66, 349.23, 392.0, 440.0, 523.25, 587.33];
// the tune from the fire: [lead, answering line] (Prologue.js MBIRA)
const MBIRA = [
  [7, 4], [5, -1], [6, 3], [5, 2], [4, -1], [5, 3],
  [8, 5], [6, -1], [5, 4], [6, 3], [4, -1], [3, 1],
  [7, 4], [6, -1], [4, 2], [5, 4], [3, -1], [4, 2],
  [6, 3], [5, -1], [3, 1], [4, 2], [2, -1], [3, 0],
];
// the bass under each pair of bars: D, D, F, C... (as in the prologue)
const ROOTS = [73.42, 73.42, 87.31, 65.41, 73.42, 73.42, 87.31, 110.0];
// each score's pulse (s) and pulses to the bar
const METER = { run: [0.18, 12], drive: [0.115, 16], fight: [0.15, 12] };

function noiseBuffer(ctx, seconds) {
  const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** Level 1's score (the first one written; kept under its old name). */
export function renderChaseScore(sampleRate = 44100) {
  return renderScore('run', sampleRate);
}

export async function renderScore(kind = 'run', sampleRate = 44100) {
  const [PULSE, PER_BAR] = METER[kind] || METER.run;
  const BAR = PULSE * PER_BAR;
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
  const drums = pan(0.05), shaker = pan(0.35), mbiraBus = pan(-0.2), low = pan(0), keys = pan(0.25);

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
  /** A struck tine (mbira) or bar (marimba): a sine and a short, bright upper partial. */
  const tine = (t, f, amp, { ring = 1.4, partial = 4.07, dest = mbiraBus } = {}) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.004);
    g.gain.exponentialRampToValueAtTime(amp * 0.25, t + ring * 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ring);
    g.connect(dest);
    const o = ctx.createOscillator(); o.frequency.value = f;
    o.connect(g); o.start(t); o.stop(t + ring + 0.1);
    const p = ctx.createOscillator(); p.frequency.value = f * partial;
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(amp * 0.35, t);
    pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    p.connect(pg); pg.connect(dest); p.start(t); p.stop(t + 0.12);
  };
  /** A held, low note through a lowpass that opens from `f0` to `f1` Hz and closes again (a drone, a war horn). */
  const swell = (t, dur, freqs, f0, f1, amp, type = 'triangle') => {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(f0, t);
    lp.frequency.linearRampToValueAtTime(f1, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(f0, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(amp, t + Math.min(0.6, dur * 0.3));
    g.gain.setValueAtTime(amp, t + dur * 0.75);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    lp.connect(g); g.connect(low);
    for (const f of freqs) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.05);
    }
  };
  const root = (bar) => ROOTS[Math.floor(bar / 2) % ROOTS.length];

  // under everything: the drone on D and A, breathing over the whole loop
  swell(0, seconds, [73.42, 110.0], 220, kind === 'fight' ? 700 : 520, kind === 'drive' ? 0.1 : 0.16);

  for (let bar = 0; bar < BARS; bar++) {
    const t0 = bar * BAR;
    const at = (pulse) => t0 + pulse * PULSE;

    if (kind === 'drive') {
      // syncopated low drums, open tones on the backbeat, slaps pushing ahead
      for (const p of [0, 6, 8, 14]) drum(at(p), 90, 50, 0.28, 0.85, 400, 0.12);
      for (const p of [4, 12]) drum(at(p), 260, 210, 0.16, 0.4, 1800, 0.2);
      for (const p of [10, 15]) drum(at(p), 420, 330, 0.07, 0.2, 3400, 0.45);
      for (let p = 0; p < 16; p++) shake(at(p), p % 4 === 0 ? 0.15 : 0.06);
      // the bass pulsing in eighths, an octave hop on the offbeats
      for (let p = 0; p < 16; p += 2) drum(at(p), root(bar) * (p % 4 ? 2 : 1), root(bar) * (p % 4 ? 2 : 1) * 0.99, 0.22, 0.3, 0, 0, low);
      // the marimba: a rolling arpeggio from bar three
      if (bar >= 2) {
        const arp = [0, 2, 4, 2, 5, 4, 2, 4];
        for (let p = 0; p < 16; p += 2) tine(at(p), SCALE[arp[(p / 2) % 8] + (bar % 4 === 3 ? 1 : 0)], 0.085, { ring: 0.55, partial: 3.9, dest: keys });
      }
      // the fire's tune, high and sparse, from bar nine
      if (bar >= 8) {
        for (let p = 0; p < 16; p += 4) {
          const [lead] = MBIRA[((bar - 8) * 4 + p / 4) % MBIRA.length];
          tine(at(p), SCALE[lead] * 2, 0.07, { ring: 1.6 });
        }
      }
      // a cymbal-like wash of noise into every fourth bar
      if (bar % 4 === 3) shake(at(14), 0.3);
    } else if (kind === 'fight') {
      // big low toms on the beats, mid toms answering, a roll into each bar
      for (const p of [0, 6]) drum(at(p), 72, 42, 0.65, 1.0, 300, 0.2);
      for (const p of [3, 9]) drum(at(p), 140, 100, 0.3, 0.55, 900, 0.15);
      for (const p of [10, 11]) drum(at(p), 160 + p * 4, 115, 0.2, 0.45, 1100, 0.12);
      for (const p of [4, 7]) drum(at(p), 420, 330, 0.08, 0.25, 3400, 0.5);
      for (let p = 0; p < 12; p++) shake(at(p), p % 3 === 0 ? 0.17 : 0.07);
      drum(at(0), root(bar), root(bar) * 0.98, 0.8, 0.4, 0, 0, low);
      // the war horn: a low brass swell on D and A every four bars
      if (bar % 4 === 0) swell(t0, BAR * 2.2, [73.42, 110.0, 146.83], 260, 1300, 0.11, 'sawtooth');
      // the fire's tune at full speed: lead and answer on every pulse, from bar five
      if (bar >= 4) {
        for (let p = 0; p < 12; p += 2) {
          const [lead, answer] = MBIRA[((bar - 4) * 6 + p / 2) % MBIRA.length];
          tine(at(p), SCALE[lead], 0.11);
          if (answer >= 0) tine(at(p + 1), SCALE[answer], 0.07);
        }
      }
    } else {
      // 'run': djembe bass strokes, open tones, slaps
      for (const p of [0, 7]) drum(at(p), 95, 55, 0.32, 0.9, 400, 0.15);
      if (bar % 2) drum(at(10), 95, 55, 0.28, 0.6, 400, 0.12);
      for (const p of [3, 6, 9]) drum(at(p), 260, 210, 0.16, 0.35, 1800, 0.18);
      for (const p of [4, 11]) drum(at(p), 420, 330, 0.08, 0.22, 3400, 0.45);
      // the shaker on every pulse, leaning on the beats
      for (let p = 0; p < 12; p++) shake(at(p), p % 3 === 0 ? 0.16 : 0.07);
      // the bass: a plucked root each bar
      drum(at(0), root(bar), root(bar) * 0.98, 0.9, 0.35, 0, 0, low);
      // a talking drum's falling bends to close every fourth bar
      if (bar % 4 === 3) for (const p of [6, 8, 10]) drum(at(p), 230, 130, 0.22, 0.4, 900, 0.1);
      // the mbira from the fire, from the fifth bar: one note every two pulses
      if (bar >= 4) {
        for (let p = 0; p < 12; p += 2) {
          const [lead, answer] = MBIRA[((bar - 4) * 6 + p / 2) % MBIRA.length];
          tine(at(p), SCALE[lead], 0.12);
          if (answer >= 0) tine(at(p + 1), SCALE[answer], 0.07);
        }
      }
    }
  }

  return ctx.startRendering();
}
