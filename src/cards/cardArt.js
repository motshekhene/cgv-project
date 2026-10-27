import { TYPES } from './cards.js';

/**
 * Draws a spirit card, trading-card style, on a 2D canvas: a frame in its
 * type's colour (gold for legendaries), the name and power across the top,
 * the creature's art in the window, the type and rarity stars, and its lore
 * in italics at the bottom. One canvas per card, cached: the 3D pickups use
 * it as a texture, the album and the reveal as an image.
 *
 *   const canvas = cardCanvas(CARD.kudu);   // 256 x 360
 *   const back = cardBackCanvas();           // the same back for every card
 */
const W = 256, H = 360;
const cache = new Map();
let backCache = null;

const SERIF = "'Crimson Pro', Georgia, serif";

function frame(g, fill, edge) {
  g.fillStyle = edge;
  roundRect(g, 0, 0, W, H, 16);
  g.fill();
  g.fillStyle = fill;
  roundRect(g, 8, 8, W - 16, H - 16, 11);
  g.fill();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** The art in the window: a simple silhouette per creature, in the type's colour, on a glowing ground. */
function art(g, kind, color, x, y, w, h) {
  const cx = x + w / 2, cy = y + h / 2;
  const glow = g.createRadialGradient(cx, cy, 4, cx, cy, w * 0.7);
  glow.addColorStop(0, color);
  glow.addColorStop(0.35, 'rgba(255,255,255,0.08)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = 'rgba(0,0,0,.55)';
  g.fillRect(x, y, w, h);
  g.globalAlpha = 0.55;
  g.fillStyle = glow;
  g.fillRect(x, y, w, h);
  g.globalAlpha = 1;
  // sun rays behind it
  g.save();
  g.translate(cx, cy);
  g.strokeStyle = 'rgba(255,255,255,0.08)';
  g.lineWidth = 6;
  for (let i = 0; i < 12; i++) {
    g.rotate(Math.PI / 6);
    g.beginPath(); g.moveTo(0, 18); g.lineTo(0, w); g.stroke();
  }
  g.restore();

  g.save();
  g.translate(cx, cy);
  g.fillStyle = '#0c0c0c';
  g.strokeStyle = '#0c0c0c';
  g.lineCap = g.lineJoin = 'round';
  const s = w / 200;
  g.scale(s, s);
  switch (kind) {
    case 'antlers': {
      // a stag's head and its branching antlers
      g.beginPath(); g.ellipse(0, 30, 22, 34, 0, 0, Math.PI * 2); g.fill();
      g.lineWidth = 9;
      for (const side of [-1, 1]) {
        g.beginPath();
        g.moveTo(side * 12, 0); g.quadraticCurveTo(side * 40, -30, side * 52, -78);
        g.moveTo(side * 30, -26); g.lineTo(side * 62, -40);
        g.moveTo(side * 42, -52); g.lineTo(side * 26, -84);
        g.moveTo(side * 48, -66); g.lineTo(side * 74, -76);
        g.stroke();
        g.beginPath(); g.ellipse(side * 30, 10, 14, 7, side * 0.5, 0, Math.PI * 2); g.fill(); // ears
      }
      break;
    }
    case 'tusks': {
      g.beginPath(); g.ellipse(0, 10, 60, 40, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(-62, 18, 26, 22, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#f2ead8'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(-78, 26); g.quadraticCurveTo(-96, 10, -86, -6); g.stroke();
      g.fillStyle = '#0c0c0c';
      for (const lx of [-34, -14, 22, 42]) g.fillRect(lx, 40, 10, 34);
      g.strokeStyle = '#0c0c0c'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(58, 0); g.lineTo(66, -36); g.stroke(); // the tail, straight up
      break;
    }
    case 'bird': {
      g.beginPath(); g.ellipse(0, 10, 44, 24, -0.2, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(-36, -4); g.quadraticCurveTo(-60, -10, -92, 8); g.lineTo(-44, 10); g.fill(); // the long bill
      g.fillStyle = '#e8b04a';
      g.beginPath(); g.moveTo(-40, -10); g.quadraticCurveTo(-62, -26, -84, -6); g.quadraticCurveTo(-60, -14, -40, -4); g.fill(); // the casque
      g.fillStyle = '#0c0c0c';
      g.beginPath(); g.moveTo(10, 0); g.quadraticCurveTo(50, -70, 90, -60); g.quadraticCurveTo(60, -20, 30, 20); g.fill(); // the wing
      g.beginPath(); g.moveTo(36, 22); g.lineTo(88, 50); g.lineTo(80, 30); g.fill();
      break;
    }
    case 'glow': {
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4, r = 30 + (i % 3) * 22;
        const gx = Math.cos(a) * r, gy = Math.sin(a) * r;
        const gr = g.createRadialGradient(gx, gy, 1, gx, gy, 18);
        gr.addColorStop(0, '#fffbe0'); gr.addColorStop(1, 'rgba(255,240,140,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(gx, gy, 18, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#0c0c0c';
      g.beginPath(); g.ellipse(0, 0, 10, 22, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(220,240,255,.6)';
      g.beginPath(); g.ellipse(-16, -12, 16, 8, -0.5, 0, Math.PI * 2); g.ellipse(16, -12, 16, 8, 0.5, 0, Math.PI * 2); g.fill();
      const tail = g.createRadialGradient(0, 22, 1, 0, 22, 22);
      tail.addColorStop(0, '#fffbe0'); tail.addColorStop(1, 'rgba(255,240,140,0)');
      g.fillStyle = tail; g.beginPath(); g.arc(0, 22, 22, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'tree': {
      g.beginPath(); g.moveTo(-26, 80); g.quadraticCurveTo(-34, 0, -20, -30); g.lineTo(20, -30); g.quadraticCurveTo(34, 0, 26, 80); g.fill();
      g.lineWidth = 10;
      for (const [x1, y1] of [[-70, -70], [-40, -86], [0, -92], [40, -86], [70, -70]]) {
        g.beginPath(); g.moveTo(0, -30); g.quadraticCurveTo(x1 * 0.5, -40, x1, y1); g.stroke();
      }
      break;
    }
    case 'wave': {
      g.lineWidth = 12;
      for (let row = 0; row < 3; row++) {
        g.beginPath();
        for (let xx = -90; xx <= 90; xx += 6) g.lineTo(xx, -30 + row * 32 + Math.sin(xx / 16 + row) * 10);
        g.stroke();
      }
      break;
    }
    case 'mbira': {
      roundRect(g, -60, -40, 120, 100, 14); g.fill();
      g.fillStyle = '#d8d8d8';
      for (let i = 0; i < 9; i++) {
        const len = 70 - Math.abs(i - 4) * 9;
        g.fillRect(-50 + i * 12, -34, 6, len);
      }
      g.fillStyle = '#0c0c0c';
      g.beginPath(); g.arc(0, 40, 12, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'mask': {
      g.beginPath(); g.ellipse(0, 0, 52, 70, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ff5a3a';
      for (const side of [-1, 1]) { g.beginPath(); g.ellipse(side * 20, -10, 12, 6, side * 0.3, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = '#444'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(0, -60); g.lineTo(0, 50); g.moveTo(-20, 30); g.lineTo(20, 30); g.stroke();
      break;
    }
    case 'fox': {
      g.beginPath(); g.moveTo(0, 50); g.lineTo(-50, -10); g.lineTo(-44, -70); g.lineTo(-16, -30); g.lineTo(16, -30); g.lineTo(44, -70); g.lineTo(50, -10); g.closePath(); g.fill();
      g.fillStyle = '#8fd0ff';
      for (const side of [-1, 1]) { g.beginPath(); g.ellipse(side * 20, -6, 7, 4, side * 0.4, 0, Math.PI * 2); g.fill(); }
      break;
    }
    case 'flame': {
      g.fillStyle = '#ffb347';
      g.beginPath(); g.moveTo(0, 70); g.bezierCurveTo(-70, 40, -40, -20, 0, -80); g.bezierCurveTo(10, -30, 70, 0, 40, 50); g.closePath(); g.fill();
      g.fillStyle = '#fff1b0';
      g.beginPath(); g.moveTo(0, 64); g.bezierCurveTo(-30, 40, -20, 0, 0, -30); g.bezierCurveTo(6, 0, 30, 20, 16, 50); g.closePath(); g.fill();
      break;
    }
    case 'falls': {
      g.fillStyle = '#0c0c0c';
      g.fillRect(-90, -80, 50, 160); g.fillRect(40, -80, 50, 160);
      g.fillStyle = '#d8f4ff';
      for (let i = 0; i < 7; i++) g.fillRect(-36 + i * 11, -80, 6, 150);
      g.beginPath(); g.ellipse(0, 72, 70, 16, 0, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'horn': {
      g.fillStyle = '#4fd6e0';
      g.beginPath();
      g.moveTo(-80, 30); g.quadraticCurveTo(-60, -60, 30, -70); g.quadraticCurveTo(90, -70, 80, -20);
      g.quadraticCurveTo(70, -50, 30, -46); g.quadraticCurveTo(-30, -40, -50, 40); g.closePath(); g.fill();
      g.fillStyle = '#0c0c0c'; roundRect(g, -70, 40, 140, 30, 6); g.fill(); // its stone
      break;
    }
    case 'storm': {
      g.beginPath(); g.ellipse(-30, -40, 50, 30, 0, 0, Math.PI * 2); g.ellipse(30, -46, 56, 34, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff6a0';
      g.beginPath(); g.moveTo(0, -20); g.lineTo(-22, 30); g.lineTo(-2, 26); g.lineTo(-16, 82); g.lineTo(26, 14); g.lineTo(6, 18); g.lineTo(22, -20); g.closePath(); g.fill();
      break;
    }
    case 'eyes': {
      g.fillStyle = '#050505';
      g.beginPath(); g.ellipse(0, 0, 90, 60, 0, 0, Math.PI * 2); g.fill();
      for (const side of [-1, 1]) {
        const gr = g.createRadialGradient(side * 32, 0, 1, side * 32, 0, 22);
        gr.addColorStop(0, '#fff6c0'); gr.addColorStop(0.5, '#ffb030'); gr.addColorStop(1, 'rgba(255,140,0,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(side * 32, 0, 22, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#050505'; g.beginPath(); g.ellipse(side * 32, 0, 3, 11, 0, 0, Math.PI * 2); g.fill();
      }
      break;
    }
    case 'butterfly': {
      g.fillStyle = '#d8f0e8';
      for (const side of [-1, 1]) {
        g.beginPath(); g.ellipse(side * 34, -22, 34, 28, side * 0.5, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(side * 26, 26, 22, 20, -side * 0.4, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#0c0c0c';
      g.beginPath(); g.ellipse(0, 0, 6, 40, 0, 0, Math.PI * 2); g.fill();
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, -38); g.lineTo(-14, -60); g.moveTo(0, -38); g.lineTo(14, -60); g.stroke();
      break;
    }
    case 'beetle': {
      g.beginPath(); g.arc(40, -30, 34, 0, Math.PI * 2); g.fillStyle = '#5a3a1a'; g.fill(); // its ball
      g.fillStyle = '#0c0c0c';
      g.beginPath(); g.ellipse(-20, 20, 40, 28, 0.3, 0, Math.PI * 2); g.fill();
      g.lineWidth = 5;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-30 + i * 18, 40); g.lineTo(-40 + i * 22, 66); g.stroke(); }
      break;
    }
    case 'snake': {
      g.lineWidth = 20;
      g.beginPath();
      g.moveTo(-80, 50); g.bezierCurveTo(-40, -10, 0, 80, 30, 10); g.bezierCurveTo(50, -40, 80, -10, 70, -50);
      g.stroke();
      g.beginPath(); g.ellipse(72, -56, 16, 11, -0.6, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'paw': {
      g.beginPath(); g.ellipse(0, 20, 34, 30, 0, 0, Math.PI * 2); g.fill();
      for (const [x, y] of [[-40, -26], [-14, -46], [14, -46], [40, -26]]) { g.beginPath(); g.ellipse(x, y, 13, 17, 0, 0, Math.PI * 2); g.fill(); }
      break;
    }
    case 'leaf': {
      g.beginPath(); g.moveTo(0, 80); g.bezierCurveTo(-90, 20, -40, -70, 0, -86); g.bezierCurveTo(40, -70, 90, 20, 0, 80); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, 80); g.lineTo(0, -80);
      for (let i = -60; i < 60; i += 22) { g.moveTo(0, i); g.lineTo(-30, i - 18); g.moveTo(0, i); g.lineTo(30, i - 18); }
      g.stroke();
      break;
    }
    case 'mushroom': {
      g.fillStyle = '#c8ffd0';
      g.shadowColor = '#8affb8'; g.shadowBlur = 20;
      g.beginPath(); g.ellipse(0, -10, 70, 40, 0, Math.PI, 0); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#e8f0e0';
      g.fillRect(-14, -10, 28, 70);
      break;
    }
    case 'feather': {
      g.fillStyle = '#1a1a24';
      g.beginPath(); g.moveTo(-50, 80); g.bezierCurveTo(-60, 0, 0, -80, 50, -84); g.bezierCurveTo(40, -20, 0, 40, -50, 80); g.fill();
      g.fillStyle = '#e8e8f0';
      for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(-30 + (i % 4) * 16 + (i / 4) * 8, 40 - Math.floor(i / 4) * 30 - (i % 4) * 6, 3, 0, Math.PI * 2); g.fill(); }
      break;
    }
    case 'drum': {
      g.beginPath(); g.moveTo(-50, -50); g.lineTo(50, -50); g.lineTo(30, 70); g.lineTo(-30, 70); g.closePath(); g.fill();
      g.fillStyle = '#c8b090'; g.beginPath(); g.ellipse(0, -50, 50, 14, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#c8b090'; g.lineWidth = 2;
      for (let i = -40; i <= 40; i += 16) { g.beginPath(); g.moveTo(i, -44); g.lineTo(i * 0.6, 66); g.stroke(); }
      break;
    }
    case 'stone': {
      for (const [y, w] of [[50, 70], [16, 54], [-14, 40], [-40, 26]]) { g.beginPath(); g.ellipse(0, y, w, 16, 0, 0, Math.PI * 2); g.fill(); }
      break;
    }
    case 'moon': {
      g.fillStyle = '#f4f0dc';
      g.shadowColor = '#f4f0dc'; g.shadowBlur = 24;
      g.beginPath(); g.arc(0, 0, 56, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(0,0,0,.12)';
      for (const [x, y, r] of [[-18, -14, 12], [20, 10, 9], [-6, 26, 7]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
      break;
    }
    default:
      g.beginPath(); g.arc(0, 0, 40, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

export function cardCanvas(card) {
  if (cache.has(card.id)) return cache.get(card.id);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const t = TYPES[card.type] || TYPES.FOREST;
  const legendary = card.rarity >= 3;
  const edge = legendary ? '#e3bb62' : t.color;
  frame(g, t.dark, edge);
  if (legendary) {
    // a foil shimmer across the legendary cards
    const foil = g.createLinearGradient(0, 0, W, H);
    foil.addColorStop(0, 'rgba(255,255,255,0)'); foil.addColorStop(0.45, 'rgba(255,240,200,.18)'); foil.addColorStop(0.55, 'rgba(160,240,255,.18)'); foil.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = foil; roundRect(g, 8, 8, W - 16, H - 16, 11); g.fill();
  }
  // name and power
  g.fillStyle = '#f4ead2';
  g.font = `700 ${card.name.length > 12 ? 17 : 20}px ${SERIF}`;
  g.textBaseline = 'middle';
  g.fillText(card.name, 18, 30);
  g.textAlign = 'right';
  g.fillStyle = edge;
  g.font = `700 18px ${SERIF}`;
  g.fillText(`✦ ${card.power}`, W - 18, 30);
  g.textAlign = 'left';
  // the art window
  g.strokeStyle = edge; g.lineWidth = 3;
  roundRect(g, 18, 48, W - 36, 170, 6);
  g.save(); g.clip();
  art(g, card.art, t.color, 18, 48, W - 36, 170);
  g.restore();
  g.stroke();
  // type and rarity
  g.fillStyle = edge;
  g.font = `700 12px ${SERIF}`;
  g.fillText(`${card.type} TYPE`, 18, 236);
  g.textAlign = 'right';
  g.fillText('★'.repeat(card.rarity) + '☆'.repeat(3 - card.rarity), W - 18, 236);
  g.textAlign = 'left';
  // the lore, wrapped
  g.fillStyle = '#d8ccb0';
  g.font = `italic 15px ${SERIF}`;
  wrap(g, card.lore, 18, 262, W - 36, 19);
  g.fillStyle = 'rgba(244,234,210,.45)';
  g.font = `600 10px ${SERIF}`;
  g.textAlign = 'center';
  g.fillText(legendary ? 'LEGENDARY SPIRIT · THE SILENT HORN' : 'SPIRIT CARD · THE SILENT HORN', W / 2, H - 20);
  cache.set(card.id, c);
  return c;
}

function wrap(g, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y);
      line = w;
      y += lh;
    } else line = test;
  }
  if (line) g.fillText(line, x, y);
}

/** The back every card shares: dark green, gold border, the horn in the middle. */
export function cardBackCanvas() {
  if (backCache) return backCache;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  frame(g, '#14200f', '#e3bb62');
  g.strokeStyle = 'rgba(227,187,98,.5)'; g.lineWidth = 2;
  roundRect(g, 20, 20, W - 40, H - 40, 8); g.stroke();
  g.save();
  g.translate(W / 2, H / 2 - 10);
  g.fillStyle = '#4fd6e0';
  g.shadowColor = '#4fd6e0'; g.shadowBlur = 18;
  g.beginPath();
  g.moveTo(-60, 22); g.quadraticCurveTo(-45, -45, 22, -52); g.quadraticCurveTo(68, -52, 60, -15);
  g.quadraticCurveTo(52, -37, 22, -34); g.quadraticCurveTo(-22, -30, -37, 30); g.closePath(); g.fill();
  g.restore();
  g.fillStyle = '#e3bb62';
  g.font = `700 16px ${SERIF}`;
  g.textAlign = 'center';
  g.fillText('SPIRIT CARD', W / 2, H - 70);
  cache.set('__back', c);
  backCache = c;
  return c;
}
