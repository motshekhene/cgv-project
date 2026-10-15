import { DIALOGUE_FONT } from '../ui/dialogue.js';
import { GAME_TITLE } from '../ui/brand.js';
import { clamp01, smooth } from './camera.js';

/**
 * Everything drawn over the 3D picture, on one 2D canvas the size of the
 * frame: the letterbox, fades to black and flashes to white, the vignette,
 * a little film grain, and the words.
 *
 * It is a canvas rather than DOM so the trailer can be exported frame by
 * frame (trailer/README: recording): the exporter draws the WebGL frame and
 * then this canvas into one image, so what is recorded is exactly what plays.
 *
 * Every element is a function of the trailer clock, so a frame drawn at
 * t = 42.5 s looks the same whether the trailer played there or jumped there.
 *
 * The words use the game's own type: Crimson Pro, the serif the dialogue, the
 * chapter cards and the title screen share (ui/dialogue.js), in the title
 * screen's cream and its gold gradient (ui/TitleScreen.js).
 */
const CREAM = '#f2e8d5';
const GOLD = '#e3bb62';
const HORN = '#7fe9f0';

export class Overlay {
  constructor({ cards = [], fades = [], bars = null } = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'tr-overlay';
    this.ctx = this.canvas.getContext('2d');
    this.cards = cards;
    this.fades = fades;
    this.bars = bars; // (t) => 0..1, how far in the letterbox is
    this.grainOn = true;
    this._grain = makeGrain(160);
    this.w = 0;
    this.h = 0;
  }

  setSize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.w = w;
    this.h = h;
    this._vignette = null;
  }

  /** Draw frame `t` (trailer seconds). `frame` is a frame counter, for the grain. */
  draw(t, frame = 0) {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);

    // the vignette: the corners pulled down, the centre left alone
    if (!this._vignette) this._vignette = makeVignette(w, h);
    ctx.globalAlpha = 1;
    ctx.drawImage(this._vignette, 0, 0);

    // grain: a tile of noise, moved every frame, barely there
    if (this.grainOn) {
      ctx.globalAlpha = 0.045;
      ctx.globalCompositeOperation = 'overlay';
      const g = this._grain;
      const ox = (frame * 37) % g.width, oy = (frame * 53) % g.height;
      for (let y = -oy; y < h; y += g.height) for (let x = -ox; x < w; x += g.width) ctx.drawImage(g, x, y);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // fades: to black, to white, as the edit asks
    for (const f of this.fades) {
      const a = fadeAlpha(f, t);
      if (a <= 0.001) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color || '#000';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalAlpha = 1;

    // the letterbox: 2.39:1 inside the 16:9 frame
    const bar = this.barHeight(t);
    if (bar > 0.5) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, bar);
      ctx.fillRect(0, h - bar, w, bar);
    }

    for (const c of this.cards) {
      const local = t - c.at;
      if (local < 0 || local > c.dur) continue;
      drawCard(ctx, c, local, w, h);
    }
  }

  barHeight(t) {
    const k = this.bars ? clamp01(this.bars(t)) : 1;
    const full = Math.max(0, (this.h - this.w / 2.39) / 2);
    return full * k;
  }
}

/** A fade's alpha at time t: up over `in`, held, down over `out`. */
function fadeAlpha(f, t) {
  const end = f.at + f.dur;
  if (t < f.at || t > end) return 0;
  const a = f.peak ?? 1;
  const up = f.in ?? 0;
  const down = f.out ?? 0;
  let k = 1;
  if (up > 0) k = Math.min(k, smooth(f.at, f.at + up, t));
  else if (t < f.at) k = 0;
  if (down > 0) k = Math.min(k, 1 - smooth(end - down, end, t));
  return a * k;
}

/* ------------------------------------------------------------------ the words */

/**
 * One card. Kinds:
 *   line   a line of the story, wide-spaced cream serif, low-centre: fades
 *          up, the tracking opening out a little as it holds
 *   word   one hard word (RUN.), big, cut in on the beat and gone on the next
 *   title  THE SILENT HORN in the title screen's gold
 *   tag    the line under the title
 *   small  the last little line
 */
function drawCard(ctx, c, local, w, h) {
  const fadeIn = c.fadeIn ?? 0.9;
  const fadeOut = c.fadeOut ?? 0.8;
  const a = Math.min(smooth(0, fadeIn, local), 1 - smooth(c.dur - fadeOut, c.dur, local));
  if (a <= 0.001) return;
  const u = local / c.dur;
  const S = h / 1080; // everything is laid out for 1080p and scaled

  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  if (c.kind === 'title') {
    titleCard(ctx, c, local, a, w, h, S);
  } else if (c.kind === 'word') {
    const size = (c.size ?? 168) * S;
    const scale = 1.06 - 0.06 * smooth(0, 0.35, local);
    ctx.translate(w / 2, h * (c.y ?? 0.5));
    ctx.scale(scale, scale);
    ctx.font = `600 ${size}px ${DIALOGUE_FONT}`;
    ctx.globalAlpha = a;
    ctx.shadowColor = 'rgba(0,0,0,.75)';
    ctx.shadowBlur = 30 * S;
    spaced(ctx, c.text, 0, 0, size * 0.18, CREAM);
  } else {
    const size = (c.size ?? (c.kind === 'small' ? 22 : c.kind === 'tag' ? 34 : 38)) * S;
    const track = size * ((c.track ?? (c.kind === 'small' ? 0.5 : 0.36)) + 0.06 * u); // the tracking opens out as it holds
    ctx.font = `${c.italic ? 'italic ' : ''}500 ${size}px ${DIALOGUE_FONT}`;
    ctx.globalAlpha = a * (c.alpha ?? 1);
    ctx.shadowColor = 'rgba(0,0,0,.9)';
    ctx.shadowBlur = 18 * S;
    ctx.shadowOffsetY = 2 * S;
    const y = h * (c.y ?? 0.5);
    spaced(ctx, c.text, w / 2, y, track, c.color || (c.kind === 'small' ? GOLD : CREAM));
    if (c.rule) {
      // a hairline in the title screen's gold, drawn out from the middle
      ctx.shadowBlur = 0;
      const k = smooth(0.2, 1.4, local);
      const half = 170 * S * k;
      const g = ctx.createLinearGradient(w / 2 - half, 0, w / 2 + half, 0);
      g.addColorStop(0, 'rgba(227,187,98,0)');
      g.addColorStop(0.5, 'rgba(227,187,98,.85)');
      g.addColorStop(1, 'rgba(227,187,98,0)');
      ctx.fillStyle = g;
      ctx.fillRect(w / 2 - half, y + size * 0.95, half * 2, Math.max(1, 1.2 * S));
    }
  }
  ctx.restore();
}

/** THE SILENT HORN: the title screen's gold, letters arriving one after another out of the dark. */
function titleCard(ctx, c, local, a, w, h, S) {
  const text = c.text || GAME_TITLE;
  const size = (c.size ?? 132) * S;
  ctx.font = `600 ${size}px ${DIALOGUE_FONT}`;
  const track = size * (0.1 + 0.05 * smooth(0, c.dur, local));
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((s, x) => s + x, 0) + track * (text.length - 1);
  const y = h * (c.y ?? 0.47);
  let x = w / 2 - total / 2;

  // the glow behind the letters: the horn's light, cyan, low
  const glowK = smooth(0.4, 2.2, local) * a;
  if (glowK > 0) {
    const g = ctx.createRadialGradient(w / 2, y, 0, w / 2, y, total * 0.62);
    g.addColorStop(0, `rgba(79,214,224,${0.16 * glowK})`);
    g.addColorStop(1, 'rgba(79,214,224,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  const grad = ctx.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
  grad.addColorStop(0, '#fff6dc');
  grad.addColorStop(0.52, '#e8c06a');
  grad.addColorStop(1, '#8a6226');
  const per = c.stagger ?? 0.07;
  [...text].forEach((ch, i) => {
    const k = smooth(i * per, i * per + 0.9, local);
    if (k > 0) {
      ctx.globalAlpha = a * k;
      ctx.shadowColor = 'rgba(0,0,0,.7)';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 3 * S;
      ctx.fillStyle = grad;
      const lift = (1 - k) * size * 0.08;
      ctx.fillText(ch, x, y + lift);
      ctx.shadowOffsetY = 0;
      ctx.shadowColor = 'rgba(227,187,98,.35)';
      ctx.shadowBlur = 30 * S;
      ctx.fillText(ch, x, y + lift);
    }
    x += widths[i] + track;
  });
}

/** Text drawn letter by letter with `track` px between letters, centred on x. */
function spaced(ctx, text, x, y, track, color) {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((s, v) => s + v, 0) + track * (chars.length - 1);
  let cx = x - total / 2;
  ctx.fillStyle = color;
  chars.forEach((ch, i) => {
    ctx.fillText(ch, cx, y);
    cx += widths[i] + track;
  });
}

function makeVignette(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const r = Math.hypot(w, h) / 2;
  const grad = g.createRadialGradient(w / 2, h / 2, r * 0.42, w / 2, h / 2, r);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.7, 'rgba(0,0,0,.22)');
  grad.addColorStop(1, 'rgba(0,0,0,.55)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  return c;
}

/** A square of grey noise, seeded so every run is the same film. */
function makeGrain(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  let s = 1234567;
  for (let i = 0; i < size * size; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const v = 128 + ((s >> 8) % 120) - 60;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export { CREAM, GOLD, HORN };
