/**
 * probe-audio.mjs — duration/bitrate probe for the mp3s in public/assets/audio.
 * Parses MPEG frame headers (no decoder needed) so we can decide, before
 * wiring a file into the game, whether it's a one-shot cue or a scene.
 *
 *   node tools/probe-audio.mjs path/to/file.mp3 [more.mp3 ...]
 */
import { readFileSync } from 'node:fs';

const V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const RATES = [[44100, 48000, 32000], [22050, 24000, 16000], [11025, 12000, 8000]];

function probe(path) {
  const buf = readFileSync(path);
  let i = 0;
  if (buf.length > 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    i = 10 + ((buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]); // skip ID3v2
  }
  const audioBytes = buf.length - i;
  let rate = 0;
  let frames = 0;
  let samples = 0;
  while (i + 4 <= buf.length) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) {
      const v = (buf[i + 1] >> 3) & 3; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
      const layer = (buf[i + 1] >> 1) & 3; // 1=Layer III
      const rIdx = (buf[i + 2] >> 2) & 3;
      if (layer === 1 && rIdx !== 3 && v !== 1) {
        const vr = v === 3 ? 0 : v === 2 ? 1 : 2;
        if (!rate) rate = RATES[vr][rIdx];
        if (RATES[vr][rIdx] === rate) {
          const spf = vr === 0 ? 1152 : 576;
          const kbps = (vr === 0 ? V1_L3 : V2_L3)[(buf[i + 2] >> 4) & 15];
          const pad = (buf[i + 2] >> 1) & 1;
          if (!kbps) { i++; continue; }
          frames++;
          samples += spf;
          i += Math.floor((spf * kbps * 1000) / 8 / rate) + pad;
          continue;
        }
      }
    }
    i++;
  }
  const dur = rate ? samples / rate : 0;
  const kbps = dur > 0 ? Math.round((audioBytes * 8) / dur / 1000) : 0;
  console.log(
    `${path.split(/[\\/]/).pop()}: ${(dur || 0).toFixed(2)} s, ${rate || '?'} Hz, ~${kbps} kbps, ${frames} frames`,
  );
}

for (const p of process.argv.slice(2)) {
  try { probe(p); } catch (e) { console.log(`${p}: ${e.message}`); }
}
