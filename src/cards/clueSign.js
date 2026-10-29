import * as THREE from 'three';

/**
 * Where today's clue is written in the world (cards/cards.js CLUE_WAYS): a
 * painted wooden board on two posts by the trail or the road, or a carved
 * stone tablet at the falls. The words are drawn on a canvas, wrapped to fit,
 * and the board faces +z (turn the group to face the player's way).
 *
 *   const board = createClueBoard(line, { stone: false, width: 3.2 });
 *   board.position.set(x, 0, z); board.rotation.y = Math.PI; root.add(board);
 */
export function createClueBoard(text, { stone = false, width = 3.2, height = 1.6, raise = 1.1 } = {}) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = Math.round(1024 * (height / width));
  const g = c.getContext('2d');
  if (stone) {
    g.fillStyle = '#6d6f66';
    g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 900; i++) { // the grain of the stone
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.06})`;
      g.fillRect(Math.random() * c.width, Math.random() * c.height, 3 + Math.random() * 8, 2 + Math.random() * 5);
    }
  } else {
    g.fillStyle = '#6b4a2e';
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = 'rgba(40,25,12,.6)';
    g.lineWidth = 3;
    for (let y = 40; y < c.height; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y + 6); g.stroke(); } // planks
  }
  g.strokeStyle = stone ? '#4a4c44' : '#3f2a19';
  g.lineWidth = 22;
  g.strokeRect(11, 11, c.width - 22, c.height - 22);
  // the words: carved dark into stone, painted pale on wood
  g.fillStyle = stone ? '#2b2c27' : '#f1e2c2';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 64;
  let lines;
  do {
    g.font = `700 ${size}px Georgia, serif`;
    lines = wrap(g, text, c.width - 120);
    size -= 4;
  } while (lines.length * size * 1.25 > c.height - 100 && size > 26);
  const lh = (size + 4) * 1.25;
  lines.forEach((l, i) => g.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * lh));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const group = new THREE.Group();
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: stone ? 0.95 : 0.8 });
  const edge = new THREE.MeshStandardMaterial({ color: stone ? 0x5d5f57 : 0x4b321f, roughness: 1 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(width, height, stone ? 0.35 : 0.08), [edge, edge, edge, edge, face, edge]);
  board.position.y = raise + height / 2;
  board.castShadow = true;
  group.add(board);
  if (stone) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, raise, 0.6), edge);
    base.position.y = raise / 2;
    group.add(base);
  } else {
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, raise + height, 8), edge);
      post.position.set(side * (width / 2 - 0.15), (raise + height) / 2, -0.06);
      post.castShadow = true;
      group.add(post);
    }
  }
  return group;
}

function wrap(g, text, maxW) {
  const words = text.split(' ');
  const out = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test;
  }
  if (line) out.push(line);
  return out;
}
