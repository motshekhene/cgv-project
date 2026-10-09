import * as THREE from 'three';
import { Fighter } from './Fighter.js';

/**
 * HandlerBoss — the three-phase boss (Member 3A).
 *
 * Phases are health-gated and each fights differently:
 *   PURSUIT      lunge only
 *   STAND        lunge + sweep (helmet comes off on entry)
 *   DESPERATION  sweep + 2-hit combo + lunge + spin kick (two kicks all round him), faster
 * Every attack telegraphs with its own colour: orange = lunge (dodge or block),
 * red = sweep (dodge — block only half-works), purple = combo (two hits). On
 * the monk it's only his mask's eye slits, burning up to the colour as he
 * winds up (no body flash: his wind-up clip is the tell, and once the mask is
 * off, that's all you get). A well-timed parry staggers him and opens a damage window.
 * He won't soak a flurry, though: land three or four hits in a row while he
 * isn't attacking and he counters at once, with barely any wind-up, so
 * button-mashing gets you hit. Hit, back off, wait for his move.
 *
 * Two Handlers: the old Quaternius one in his helmet (punch / swordslash clips,
 * leans posed by hand), and the Mixamo shrine monk from tools/build-character.py
 * in a carved stone mask: real lunge, spinning-kick sweep and punch-combo
 * clips timed into the telegraph (clipAttacks), dazed when parried, rounding on
 * Kai with a pointed finger when the mask is knocked off, a real recoil when hit.
 *
 * He never touches the player: when a strike connects he calls onStrike() and
 * Level03 answers 'hit' | 'blocked' | 'parried' | 'dodged'.
 */
// difficulty lives in these numbers (+ MAX_HEALTH and COUNTER_AFTER below)
const PHASES = [
  { name: 'PURSUIT', speed: 4.4, attacks: ['lunge'], pace: 1.0, rest: [0.3, 0.7] },
  { name: 'STAND', speed: 5.0, attacks: ['lunge', 'sweep'], pace: 0.82, rest: [0.2, 0.5] },
  { name: 'DESPERATION', speed: 6.0, attacks: ['sweep', 'combo', 'lunge', 'spin'], pace: 0.64, rest: [0.1, 0.3] },
];

const ATTACKS = {
  lunge: {
    tell: 0xff7a1a, telegraph: 0.75, recover: 0.95, engage: 5.2, clip: 'punch', clipSpeed: 2.6,
    hits: [{ dur: 0.3, move: 14, reach: 1.9, damage: 17 }],
  },
  sweep: {
    tell: 0xff1133, telegraph: 0.9, recover: 1.05, engage: 2.6, clip: 'swordslash', clipSpeed: 2.8, blockMul: 0.65,
    hits: [{ dur: 0.36, move: 0, radius: 3.4, damage: 22 }],
  },
  // the capoeira cartwheel kick: two kicks that catch anything round him as he comes on
  spin: {
    tell: 0x2fe0b0, telegraph: 0.8, recover: 1.0, engage: 3.0, clip: 'swordslash', clipSpeed: 2.4, blockMul: 0.5,
    hits: [
      { dur: 0.28, move: 5, radius: 2.6, damage: 12 },
      { gap: 0.3, dur: 0.28, move: 5, radius: 2.6, damage: 14 },
    ],
  },
  combo: {
    tell: 0xb04dff, telegraph: 0.62, recover: 0.9, engage: 3.4, clip: 'punch', clipSpeed: 3.2,
    hits: [
      { dur: 0.26, move: 9, reach: 2.0, damage: 13 },
      { gap: 0.22, dur: 0.26, move: 9, reach: 2.0, damage: 13 },
    ],
  },
};

const MAX_HEALTH = 420;
const STAGGER_TIME = 1.7;
const TRANSITION_TIME = 1.5;
// he won't stand there and soak a flurry: this many hits in quick succession (per phase) while he isn't
// attacking, and he hits straight back, with a much shorter wind-up (COUNTER_TELL of the usual)
const COUNTER_AFTER = [4, 3, 3];
const COUNTER_GAP = 1.4; // seconds: hits further apart than this don't count toward it
const COUNTER_TELL = 0.4;

/**
 * The shrine mask's look, painted on canvases: weathered stone with carved
 * brows, nose and mouth, red ochre stripes down through the eyes (the paint
 * on the face beneath), moss and cracks; and a glow map that is just the eye
 * slits. Top of the canvas = brow, the middle columns = the middle of the face.
 */
function maskTextures() {
  const S = 256;
  const canvas = () => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    return c;
  };
  const rnd = (() => {
    let s = 7;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  })();
  const eyes = (g, fill) => {
    g.fillStyle = fill;
    for (const x of [S * 0.33, S * 0.67]) {
      g.beginPath();
      g.ellipse(x, S * 0.42, S * 0.1, S * 0.032, x < S / 2 ? 0.12 : -0.12, 0, Math.PI * 2);
      g.fill();
    }
  };

  const c = canvas();
  const g = c.getContext('2d');
  const base = g.createRadialGradient(S / 2, S * 0.45, S * 0.05, S / 2, S * 0.5, S * 0.62);
  base.addColorStop(0, '#bcb39c'); // the gate guardians' weathered stone
  base.addColorStop(0.7, '#9d947e');
  base.addColorStop(1, '#6f6857');
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1800; i++) { // grain
    g.fillStyle = rnd() < 0.5 ? 'rgba(40,34,26,0.18)' : 'rgba(220,210,190,0.12)';
    g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  for (let i = 0; i < 260; i++) { // moss creeping in from the edges
    const edge = rnd();
    const x = edge < 0.5 ? (rnd() < 0.5 ? rnd() * 30 : S - rnd() * 30) : rnd() * S;
    const y = edge < 0.5 ? rnd() * S : S - rnd() * 34;
    g.fillStyle = `rgba(${70 + rnd() * 30 | 0},${100 + rnd() * 40 | 0},45,${0.35 + rnd() * 0.4})`;
    g.beginPath();
    g.arc(x, y, 1 + rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // red ochre stripes, brow to cheek, through each eye
  g.strokeStyle = 'rgba(158,38,26,0.85)';
  g.lineCap = 'round';
  for (const x of [S * 0.33, S * 0.67]) {
    g.lineWidth = S * 0.045;
    g.beginPath();
    g.moveTo(x + (rnd() - 0.5) * 4, S * 0.04);
    g.bezierCurveTo(x - 3, S * 0.3, x + 4, S * 0.55, x + (x < S / 2 ? -6 : 6), S * 0.7);
    g.stroke();
  }
  // carving: brow ridges, nose, cheek grooves, a grim mouth
  g.strokeStyle = 'rgba(42,35,27,0.85)';
  g.lineWidth = 5;
  for (const x of [S * 0.33, S * 0.67]) {
    g.beginPath();
    g.arc(x, S * 0.42, S * 0.13, Math.PI * 1.15, Math.PI * 1.85);
    g.stroke();
  }
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(S * 0.47, S * 0.36); g.lineTo(S * 0.44, S * 0.6); g.lineTo(S * 0.5, S * 0.64); g.lineTo(S * 0.56, S * 0.6); g.lineTo(S * 0.53, S * 0.36);
  g.stroke();
  for (const [x0, x1] of [[0.3, 0.38], [0.7, 0.62]]) {
    g.beginPath();
    g.moveTo(S * x0, S * 0.58); g.lineTo(S * x1, S * 0.74);
    g.stroke();
  }
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(S * 0.36, S * 0.78); g.quadraticCurveTo(S * 0.5, S * 0.74, S * 0.64, S * 0.78);
  g.stroke();
  for (let i = 0; i < 5; i++) { // teeth notches
    g.beginPath();
    g.moveTo(S * (0.4 + i * 0.05), S * 0.765); g.lineTo(S * (0.4 + i * 0.05), S * 0.8);
    g.stroke();
  }
  g.lineWidth = 1.5; // cracks
  g.strokeStyle = 'rgba(30,25,20,0.7)';
  for (const [x, y] of [[0.78, 0.12], [0.2, 0.86], [0.6, 0.9]]) {
    g.beginPath();
    let px = S * x, py = S * y;
    g.moveTo(px, py);
    for (let k = 0; k < 5; k++) g.lineTo((px += (rnd() - 0.5) * 22), (py += (rnd() - 0.3) * 16));
    g.stroke();
  }
  eyes(g, '#120c08');

  const e = canvas();
  const ge = e.getContext('2d');
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, S, S);
  ge.filter = 'blur(2px)';
  eyes(ge, '#fff');

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const glow = new THREE.CanvasTexture(e);
  glow.colorSpace = THREE.SRGBColorSpace;
  return { map, glow };
}

/**
 * The same attacks on a rig with real clips (the Mixamo Handler, built by
 * tools/build-character.py; `meta` is its measurements). Each attack's clip
 * starts during the telegraph, `from` seconds in, at `speed`, so that the blow
 * at `hit` (clip time) lands `impact` seconds into the strike, when the game
 * deals it. The combo's speed lines its two punches up with the two hits.
 */
function clipAttacks(meta) {
  const c = meta.clips;
  const at = (clip, hit, lead, speed, impact) => ({ clip, hit, from: Math.max(0, hit - lead), speed, impact });
  // a charging blow only registers once he's closed in: from the engage range to his reach at the hit's speed
  const closing = (name) => {
    const a = ATTACKS[name], h = a.hits[0];
    return h.move && h.reach ? Math.max(0, (a.engage - h.reach) / h.move) : 0.1;
  };
  const sweep = c.sweep ? ['sweep', c.sweep.hits?.find((h) => h.t > 1.2)?.t ?? c.sweep.hit] : ['capoeira', c.capoeira?.hit];
  const [p1, p2] = (c.combo?.hits || []).filter((h, i, all) => i === 0 || h.limb !== all[i - 1].limb);
  const gap = ATTACKS.combo.hits[0].dur + ATTACKS.combo.hits[1].gap; // strike time between the combo's two hits
  // the spin: its first two kicks (by the clip) on the attack's two hits (each lands 0.1 s into its window)
  const k1 = c.capoeira?.hits?.find((h) => h.t > 0.8);
  const k2 = k1 && c.capoeira.hits.find((h) => h.t > k1.t + 0.5);
  const spinGap = ATTACKS.spin.hits[0].dur + ATTACKS.spin.hits[1].gap;
  return {
    lunge: c.lunge && at('lunge', c.lunge.hit, 0.3, 1.2, closing('lunge')),
    sweep: sweep[1] !== undefined && at(sweep[0], sweep[1], 0.5, 1.4, closing('sweep')),
    // the second punch lands on its window, which opens on time whatever the first one's closing took: split it
    combo: p1 && p2 && at('combo', p1.t, 0.3, (p2.t - p1.t) / gap, closing('combo') / 2),
    // with no Hurricane Kick the capoeira clip is the sweep, so the spin falls back to the hand-posed one
    spin: c.sweep && k1 && k2 && at('capoeira', k1.t, 0.55, (k2.t - k1.t) / spinGap, 0.1),
  };
}

/**
 * The shrine mask the Mixamo Handler wears (here, and in the cutscenes before
 * Site 7): a carved stone face like the gate's guardians, red ochre stripes
 * like the paint on his face beneath, bound on with a leather band. Its eye
 * slits smoulder (the material's emissive: HandlerBoss burns them with each
 * attack's tell colour). Returns { mask, material }, or null with no head bone.
 */
export function attachMask(fighter) {
  const head = fighter.bone('Head');
  if (!head) return null;
  const mask = new THREE.Group();
  const { map, glow } = maskTextures();
  const material = new THREE.MeshStandardMaterial({
    map, emissiveMap: glow, emissive: new THREE.Color(0xff5a1a), emissiveIntensity: 0.5,
    roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
  });
  // a slice of a sphere round the front of the head: brow to chin, cheek to cheek
  const plate = new THREE.Mesh(
    new THREE.SphereGeometry(0.125, 32, 20, Math.PI / 2 - 0.36 * Math.PI, 0.72 * Math.PI, 0.17 * Math.PI, 0.66 * Math.PI),
    material,
  );
  plate.scale.set(1, 1.18, 1.12);
  plate.castShadow = true;
  mask.add(plate);
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.118, 0.009, 6, 40),
    new THREE.MeshStandardMaterial({ color: 0x3a2716, roughness: 0.8 }),
  );
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.085; // round the brow, above the eye slits
  band.scale.set(1.04, 1.12, 1);
  mask.add(band);

  fighter.root.updateMatrixWorld(true);
  const s = head.getWorldScale(new THREE.Vector3()).x;
  mask.scale.setScalar(1 / s);
  mask.position.set(0, 0.1 / s, 0.015 / s); // from the top of the neck up to the middle of the head
  head.add(mask);
  return { mask, material };
}

/**
 * THE HANDLER'S KIT — what Baba Zwane puts on to hunt Kai for the company.
 *
 * At the fire in the prologue he is a man in his robes, face bare. Every time
 * after that, until Level 3 knocks it off, he is this: a long armoured coat
 * (dark oiled canvas, gunmetal plates on the chest and shoulders, a company
 * amber stripe) and a helmet shell closed round the carved stone mask. Kai
 * never sees past it, so he never puts the two together.
 *
 * Level 1's chaser and Level 3's boss both come from here, so it is the same
 * coat and the same helmet every time. Rigid pieces ride the bones (no
 * skinning): the coat skirt is split at the front so his knees come through
 * it on the run. Returns { helmet, maskMat }. The helmet group holds the mask
 * and the shell, so popping it bares his face. On the old Quaternius rig
 * (no Mixamo bones) it returns null and the caller falls back to the plain helmet.
 */
export function dressAsHandler(fighter) {
  const worn = attachMask(fighter);
  if (!worn) return null;
  const b = (n) => fighter.bones['mixamorig' + n] || null;
  const head = fighter.bone('Head');
  const hips = b('Hips');
  if (!hips) return { helmet: worn.mask, maskMat: worn.material };
  fighter.root.updateMatrixWorld(true);
  const tmp = new THREE.Vector3();
  const scaleOf = (bone) => bone.getWorldScale(tmp).x || 1;

  const canvas = new THREE.MeshStandardMaterial({ color: 0x23251f, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });
  const plate = new THREE.MeshStandardMaterial({ color: 0x3a3e43, roughness: 0.38, metalness: 0.75 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x8a6a2e, roughness: 0.45, metalness: 0.6 });
  const stripe = new THREE.MeshStandardMaterial({ color: 0x2a1a08, emissive: 0xffb03a, emissiveIntensity: 0.55, roughness: 0.6 });
  const pieces = [];
  const add = (bone, mesh) => {
    mesh.castShadow = true;
    bone.add(mesh);
    pieces.push(mesh);
    return mesh;
  };

  /** A tube from one bone to another, in metres, riding the first. */
  const segment = (fromName, toName, r0, r1, mat, { squash = 1, open = false } = {}) => {
    const from = b(fromName), to = b(toName);
    if (!from || !to) return null;
    const s = scaleOf(from);
    const end = from.worldToLocal(to.getWorldPosition(new THREE.Vector3()));
    const len = end.length();
    if (len < 1e-4) return null;
    const geo = new THREE.CylinderGeometry(r1 / s, r0 / s, len, 14, 1, open);
    geo.translate(0, len / 2, 0);
    const m = new THREE.Mesh(geo, mat);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().normalize());
    m.scale.set(1, 1, squash);
    return add(from, m);
  };

  // the coat body: hips to the base of the neck, wider than he is
  segment('Hips', 'Spine2', 0.19, 0.2, canvas, { squash: 0.78 });
  segment('Spine2', 'Neck', 0.205, 0.15, canvas, { squash: 0.8 });
  // the chest plate, and the amber company stripe under it
  {
    const s = scaleOf(b('Spine2'));
    const chest = new THREE.Mesh(
      // a curved slice centred on +Z, his front
      new THREE.SphereGeometry(0.2 / s, 18, 10, Math.PI / 2 - 0.6, 1.2, 0.3 * Math.PI, 0.42 * Math.PI),
      plate,
    );
    chest.scale.set(1.05, 1.05, 0.9);
    chest.position.y = 0.04 / s;
    add(b('Spine2'), chest);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.188 / s, 0.012 / s, 6, 28), stripe);
    band.rotation.x = Math.PI / 2;
    band.scale.set(1, 0.8, 1);
    add(b('Spine1') || b('Spine2'), band);
  }
  // the skirt: an open cone off the hips down past the knees, split at the front so he can run in it
  {
    const s = scaleOf(hips);
    const len = 0.66 / s;
    const geo = new THREE.CylinderGeometry(0.205 / s, 0.33 / s, len, 20, 1, true, 0.32, Math.PI * 2 - 0.64);
    geo.translate(0, -len / 2 + 0.06 / s, 0);
    const skirt = new THREE.Mesh(geo, canvas);
    skirt.scale.set(1, 1, 0.82);
    add(hips, skirt);
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.205 / s, 0.014 / s, 6, 28), trim);
    hem.rotation.x = Math.PI / 2;
    hem.position.y = 0.06 / s;
    hem.scale.set(1, 0.82, 1);
    add(hips, hem); // the belt
  }
  // sleeves, and a gunmetal pauldron on each shoulder
  for (const side of ['Left', 'Right']) {
    segment(side + 'Arm', side + 'ForeArm', 0.075, 0.065, canvas);
    segment(side + 'ForeArm', side + 'Hand', 0.064, 0.058, canvas);
    const arm = b(side + 'Arm');
    if (arm) {
      const s = scaleOf(arm);
      // round, so it reads the same whichever way the arm bone's axes point
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.1 / s, 14, 10), plate);
      pad.scale.set(1.05, 0.8, 1.05);
      pad.position.y = 0.03 / s;
      add(arm, pad);
    }
  }

  // the helmet: a gunmetal shell closed round the back of the mask, with a crest. Mask and shell are one
  // group, so when it comes off in Level 3 his whole head is bare
  const helmet = new THREE.Group();
  if (head) {
    const s = scaleOf(head);
    head.add(helmet);
    helmet.position.copy(worn.mask.position);
    worn.mask.position.set(0, 0, 0);
    helmet.add(worn.mask);
    // big enough to swallow the monk's ears and crown; open only where the mask is
    const R = 0.168;
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(R / s, 28, 18, Math.PI / 2 + 0.33 * Math.PI, 1.34 * Math.PI, 0, 0.76 * Math.PI), // down over the jaw, framing the mask
      plate,
    );
    shell.scale.set(1.12, 1.18, 1.12);
    shell.position.y = 0.025 / s;
    shell.castShadow = true;
    helmet.add(shell);
    // and its brow: the crown over the face opening, down to the top of the mask
    const brow = new THREE.Mesh(
      new THREE.SphereGeometry(R / s, 16, 6, Math.PI / 2 - 0.33 * Math.PI, 0.66 * Math.PI, 0, 0.3 * Math.PI),
      plate,
    );
    brow.scale.copy(shell.scale);
    brow.position.copy(shell.position);
    brow.castShadow = true;
    helmet.add(brow);
    // the bevor: a gunmetal guard from under the mask down over the jaw and throat, so not a hair of
    // his beard shows. It comes off with the mask, which is when Kai sees the beard and knows him
    {
      const h = 0.24;
      const geo = new THREE.CylinderGeometry(0.118 / s, 0.15 / s, h / s, 24, 1, true); // closed all round: no gap for a wisp to show through
      const bevor = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: 0x3a3e43, roughness: 0.4, metalness: 0.75, side: THREE.DoubleSide,
      }));
      bevor.position.set(0, -(0.1 + h / 2) / s, 0.012 / s);
      bevor.scale.set(1.05, 1, 1.12);
      bevor.castShadow = true;
      helmet.add(bevor);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.118 / s, 0.009 / s, 6, 28), trim);
      lip.rotation.x = Math.PI / 2; // the brass edge along its top, under the mask's chin
      lip.position.set(0, -0.1 / s, 0.012 / s);
      lip.scale.set(1.05, 1.12, 1);
      helmet.add(lip);
    }
    // a brass ridge from brow to nape, hugging the shell
    const crest = new THREE.Mesh(new THREE.TorusGeometry((R * 1.15) / s, 0.012 / s, 6, 24, Math.PI), trim);
    crest.rotation.y = Math.PI / 2;
    crest.scale.set(1, 1.03, 0.98);
    crest.position.y = 0.025 / s;
    crest.castShadow = true;
    helmet.add(crest);
  }
  fighter.handlerKit = pieces;
  return { helmet: head ? helmet : worn.mask, maskMat: worn.material };
}

export class HandlerBoss {
  /** meta: tools/build-character.py's measurements when `source` is the Mixamo Handler, else null. */
  constructor(parent, target, source, meta = null) {
    this.target = target;
    this.levelRoot = parent;
    this.meta = source && meta;
    this.fighter = new Fighter(parent, {
      source,
      capsuleColor: 0xff5533,
      palette: { Skin: 0x7a5233, Hair: 0xb4b4bc, Shirt: 0x3a3d4d, Pants: 0x2f3240, Details: 0xefe9e0, TieTexture: 0xb02323, Shoes: 0x1a1a1e },
      ...(this.meta && { modelHeight: meta.height }),
    });
    for (const m of this.fighter.materials) if (m.emissive) m.userData.baseEmissive.set(0x2a1210);
    this.clips = this.meta ? clipAttacks(this.meta) : null;
    this.hurtT = 0; // the hit clip is playing (Kai landed one): don't override it with idle/run
    this.root = this.fighter.root;
    this.root.position.set(0, 0, -4.5);
    this.root.rotation.y = 0;

    this.maxHealth = MAX_HEALTH;
    this.health = this.maxHealth;
    this.flurry = 0; // Kai's hits in quick succession (COUNTER_AFTER)
    this.flurryT = 0;
    this.countering = false;
    this.counterOff = false; // the level can hold his counters off (Kai's perfect-dodge window)
    this.phaseIndex = 0;
    this.helmetOff = false;

    this.state = 'APPROACH';
    this.t = 0;
    this.attackName = null;
    this.hitIndex = 0;
    this.hitT = 0;
    this.hitResolved = false;
    this.restFor = 0;
    this.strikeDir = new THREE.Vector3(0, 0, 1);
    this.heading = 0;
    this.staggered = false;
    this.flying = null; // the helmet, once it comes off
    this.arenaLimit = 13.4; // he follows Kai anywhere inside this radius

    this.onStrike = null;
    this.onCounter = null;
    this.onHelmetOff = null;
    this.onPhaseChange = null;
    this.onDefeated = null;

    this._pickAttack();
    this._attachHelmet();
    this._to = new THREE.Vector3();
  }

  get phase() {
    return PHASES[this.phaseIndex];
  }

  get vulnerable() {
    return this.state === 'STAGGER';
  }

  _attachHelmet() {
    // the same coat and helmet he chased Kai in through Level 1 (dressAsHandler)
    const worn = this.fighter.rig === 'mixamo' && dressAsHandler(this.fighter);
    if (worn) {
      this.helmet = worn.helmet; // phase II knocks it off, mask and all: Baba Zwane's face underneath
      this.maskMat = worn.maskMat; // its eye slits carry the tells (_glowMask)
      return;
    }
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 18, 14),
      new THREE.MeshStandardMaterial({ color: 0x0c0c10, metalness: 0.75, roughness: 0.28 }),
    );
    helmet.scale.set(1, 1.15, 1.05);
    helmet.castShadow = true;
    this.helmet = helmet;
    let head = null;
    this.fighter.pivot.traverse((o) => {
      if (o.isBone && o.name === 'Head') head = o;
    });
    if (head) {
      helmet.position.set(0, 0.28, 0.03);
      head.add(helmet);
    } else {
      helmet.scale.setScalar(0.22);
      helmet.position.y = 0.95;
      this.fighter.pivot.add(helmet);
    }
  }


  /** The mask's eye slits: an ember while he watches, the attack's tell colour as he winds up. */
  _glowMask(hex, intensity) {
    if (!this.maskMat || !this.helmet) return;
    this.maskMat.emissive.setHex(hex);
    this.maskMat.emissiveIntensity = intensity;
  }

  _popHelmet() {
    if (!this.helmet) return;
    this.levelRoot.attach(this.helmet);
    this.flying = {
      mesh: this.helmet,
      vel: new THREE.Vector3((Math.random() - 0.5) * 3, 5.5, (Math.random() - 0.5) * 3),
      spin: new THREE.Vector3(6, 4, 8),
      life: 2.2,
    };
    this.helmet = null;
  }

  _pickAttack() {
    const list = this.phase.attacks;
    let pick = list[Math.floor(Math.random() * list.length)];
    if (pick === this.attackName && list.length > 1 && Math.random() < 0.6) {
      pick = list[(list.indexOf(pick) + 1) % list.length];
    }
    this.attackName = pick;
  }

  _enter(state) {
    this.state = state;
    this.t = 0;
  }

  takeDamage(amount) {
    if (this.health <= 0 || this.state === 'TRANSITION') return 0;
    const dealt = amount * (this.vulnerable ? 1.6 : 1);
    this.health = Math.max(0, this.health - dealt);
    this._react();

    if (this.health <= 0) {
      this.state = 'DOWN';
      this.fighter.setGlow(0, 0);
      this.fighter.setLean(0);
      this.fighter.playOnce('death', { fade: 0.1 });
      if (this.onDefeated) this.onDefeated();
      return dealt;
    }

    const frac = this.health / this.maxHealth;
    const wanted = frac > 0.66 ? 0 : frac > 0.33 ? 1 : 2;
    if (wanted > this.phaseIndex) {
      this.phaseIndex = wanted;
      this._enter('TRANSITION');
      this.countering = false;
      this.flurry = 0;
      if (this.meta) this.fighter.playOnce('angry', { speed: 1.2, fade: 0.15 }); // he rounds on Kai and points
      this.attackName = null;
      this._pickAttack();
      if (wanted >= 1 && !this.helmetOff) { // even if one heavy blow skips phase II, the mask still comes off
        this.helmetOff = true;
        this._popHelmet();
        if (this.onHelmetOff) this.onHelmetOff();
      }
      if (this.onPhaseChange) this.onPhaseChange(wanted + 1);
      return dealt;
    }

    this.flurry = this.flurryT > 0 ? this.flurry + 1 : 1;
    this.flurryT = COUNTER_GAP;
    if (!this.counterOff && this.flurry >= COUNTER_AFTER[this.phaseIndex] && (this.state === 'APPROACH' || this.state === 'RECOVER')) this._counter();
    return dealt;
  }

  /** Enough: straight back at Kai with a quick lunge (a combo once he's desperate). */
  _counter() {
    this.flurry = 0;
    this.countering = true;
    this.attackName = this.phaseIndex >= 2 ? 'combo' : 'lunge';
    this.restFor = 0;
    this.hurtT = 0;
    this._enter('TELEGRAPH');
    this.clipStarted = false;
    if (this.onCounter) this.onCounter();
  }

  /** Kai landed one: a real recoil if he isn't mid-attack (the hit clip), else the old flinch. */
  _react() {
    const hit = this.meta?.clips.hit;
    const busy = this.state === 'TELEGRAPH' || this.state === 'STRIKE' || this.state === 'TRANSITION';
    if (hit && !busy) {
      this.fighter.playOnce('hit', { from: Math.max(0, hit.peak - 0.3), speed: 1.6, fade: 0.05 });
      this.fighter.flash(0xffffff, 0.12);
      this.hurtT = 0.35;
    } else {
      this.fighter.flinch();
    }
  }

  /** Called by Level03 when a strike was parried. */
  stagger() {
    this._enter('STAGGER');
    this.countering = false;
    this.hitIndex = 0;
    this.fighter.setGlow(0xffd23a, this.meta ? 0.18 : 1.4);
    this.fighter.setLean(this.meta ? 0 : 0.35);
    this.fighter.play(this.meta ? 'stunned' : 'idle', { fade: 0.15 });
  }

  update(dt) {
    const f = this.fighter;
    this._updateHelmet(dt);
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.flurryT > 0) this.flurryT -= dt;
    const lean = (v) => f.setLean(this.meta ? 0 : v); // real clips carry their own weight shifts
    const glow = (hex, k) => f.setGlow(hex, k);
    if (this.state === 'DOWN') {
      f.update(dt);
      return { dist: 0, state: 'DOWN', phase: this.phase.name };
    }

    if (this.target.dead) {
      f.play('idle');
      f.setGlow(0, 0);
      f.setLean(0);
      f.update(dt);
      return { dist: 0, state: 'IDLE', phase: this.phase.name };
    }

    const p = this.phase;
    const tp = this.target.root.position;
    this._to.set(tp.x - this.root.position.x, 0, tp.z - this.root.position.z);
    const dist = this._to.length();
    const dir = dist > 0.001 ? this._to.clone().divideScalar(dist) : new THREE.Vector3(0, 0, 1);
    this.t += dt;

    const atk = ATTACKS[this.attackName];
    const face = (rate) => {
      const want = Math.atan2(dir.x, dir.z);
      let d = (want - this.heading) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this.heading += d * (1 - Math.exp(-rate * dt));
    };

    switch (this.state) {
      case 'APPROACH': {
        face(9);
        f.setLean(0);
        f.setGlow(0, 0);
        this._glowMask(0xff5a1a, 0.5 + Math.sin(this.t * 3) * 0.2);
        const anim = this.hurtT <= 0; // let the hit clip finish
        if (this.restFor > 0) {
          this.restFor -= dt;
          if (anim) f.play('idle');
        } else if (dist > atk.engage) {
          this.root.position.addScaledVector(dir, p.speed * dt);
          // the Mixamo run is paced to his speed so his feet don't skate
          const run = this.meta?.clips.run?.speed;
          if (anim) f.play('run', { speed: run ? p.speed / run : 0.9 + p.speed * 0.05 });
        } else {
          this._enter('TELEGRAPH');
          this.clipStarted = false;
        }
        break;
      }
      case 'TELEGRAPH': {
        const dur = atk.telegraph * p.pace * (this.countering ? COUNTER_TELL : 1);
        if (this.t < dur * 0.75) face(6);
        const cl = this.clips?.[this.attackName];
        if (cl) {
          // the attack's clip winds up inside the telegraph, timed so its blow lands as the strike opens
          const startAt = dur + cl.impact - (cl.hit - cl.from) / cl.speed;
          if (!this.clipStarted && this.t >= startAt) this._startClip(cl, this.t - startAt);
          else if (!this.clipStarted) f.play('idle');
        } else {
          f.play('idle', { speed: 1.5 });
        }
        lean(-0.3);
        // the old Handler has no wind-up clip to read, so he flashes the tell colour all over; the monk's
        // mask eyes just burn up to it as he winds up (no flashing: the clip itself is the tell)
        if (!this.meta) glow(atk.tell, 1.1 + Math.sin(this.t * 18) * 0.5);
        const k = Math.min(1, this.t / dur);
        this._glowMask(atk.tell, 0.6 + 3.4 * k * k);
        if (this.t >= dur) {
          this.strikeDir.copy(dir);
          this.hitIndex = 0;
          this._beginHit(atk);
        }
        break;
      }
      case 'STRIKE': {
        const hit = atk.hits[this.hitIndex];
        this.hitT += dt;
        lean(0.2);
        if (this.hitT >= (hit.gap || 0)) {
          if (!this.hitStarted) {
            this.hitStarted = true;
            const cl = this.clips?.[this.attackName];
            if (!cl) f.playOnce(atk.clip, { speed: atk.clipSpeed });
            else if (!this.clipStarted) this._startClip(cl, 0); // (one clip covers every hit of the attack)
          }
          const k = this.hitT - (hit.gap || 0);
          if (hit.move) this.root.position.addScaledVector(this.strikeDir, hit.move * dt);
          this._resolve(hit, atk, dist, k);
          if (k >= hit.dur) {
            if (this.hitIndex + 1 < atk.hits.length) {
              this.hitIndex++;
              this._beginHit(atk);
            } else {
              this._enter('RECOVER');
              this.countering = false;
            }
          }
        }
        break;
      }
      case 'RECOVER': {
        // a real clip follows through before he settles back into his stance
        if (!this.meta || (this.t > 0.3 && this.hurtT <= 0)) f.play('idle', { fade: this.meta ? 0.3 : 0.1 });
        lean(0.1);
        f.setGlow(0, 0);
        this._glowMask(0xff5a1a, 0.6);
        if (this.t >= atk.recover * p.pace) {
          this._pickAttack();
          this.restFor = p.rest[0] + Math.random() * (p.rest[1] - p.rest[0]);
          this._enter('APPROACH');
        }
        break;
      }
      case 'STAGGER': {
        f.play(this.meta ? 'stunned' : 'idle', { speed: this.meta ? 1 : 0.5 }); // dazed
        this._glowMask(0xffd23a, 0.4);
        if (this.t >= STAGGER_TIME) {
          f.setGlow(0, 0);
          this.restFor = 0.3;
          this._enter('APPROACH');
        }
        break;
      }
      case 'TRANSITION': {
        if (!this.meta) f.play('idle'); // the Mixamo Handler is pointing at Kai (the angry clip)
        lean(-0.2);
        if (!this.meta) glow(0xff9a55, 0.8 + Math.sin(this.t * 14) * 0.3);
        if (this.t >= TRANSITION_TIME) {
          f.setGlow(0, 0);
          this.restFor = 0.4;
          this._enter('APPROACH');
        }
        break;
      }
    }

    const r = Math.hypot(this.root.position.x, this.root.position.z);
    if (r > this.arenaLimit) {
      const k = this.arenaLimit / r;
      this.root.position.x *= k;
      this.root.position.z *= k;
    }
    this.root.rotation.y = this.heading;
    f.update(dt);
    return { dist, state: this.state, phase: p.name };
  }

  /** Start the attack's clip, `late` seconds behind schedule (started further in to catch up). */
  _startClip(cl, late) {
    this.clipStarted = true;
    this.fighter.playOnce(cl.clip, { from: cl.from + late * cl.speed, speed: cl.speed, fade: 0.1 });
  }

  _beginHit(atk) {
    this._enter('STRIKE');
    this.hitT = 0;
    this.hitResolved = false;
    this.hitStarted = false;
  }

  _resolve(hit, atk, dist, k) {
    if (this.hitResolved) return;
    const inRange = hit.radius ? k > 0.1 && dist <= hit.radius : dist <= hit.reach;
    if (!inRange) return;
    this.hitResolved = true;
    if (!this.onStrike) return;
    const outcome = this.onStrike({
      type: this.attackName,
      damage: hit.damage,
      blockMul: atk.blockMul ?? 0.25,
    });
    if (outcome === 'parried') this.stagger();
  }

  _updateHelmet(dt) {
    const h = this.flying;
    if (!h) return;
    h.life -= dt;
    h.vel.y -= 16 * dt;
    h.mesh.position.addScaledVector(h.vel, dt);
    h.mesh.rotation.x += h.spin.x * dt;
    h.mesh.rotation.y += h.spin.y * dt;
    h.mesh.rotation.z += h.spin.z * dt;
    if (h.mesh.position.y < 0.2 && h.vel.y < 0) {
      h.mesh.position.y = 0.2;
      h.vel.y *= -0.35;
      h.vel.x *= 0.6;
      h.vel.z *= 0.6;
      h.spin.multiplyScalar(0.5);
    }
    if (h.life <= 0) {
      h.mesh.visible = false;
      this.flying = null;
    }
  }
}
