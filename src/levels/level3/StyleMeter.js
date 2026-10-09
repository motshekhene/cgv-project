/**
 * StyleMeter — the D-to-S rank for fighting clean. Landing hits, parrying and
 * dodging (perfect dodges most of all) build it; taking a hit breaks it on
 * the spot; standing about lets it drain. The level reports what happened
 * (add / hurt), FightHUD.setStyle() shows it.
 *
 *   const style = new StyleMeter(hud);
 *   style.add('parry');  style.hurt();  style.update(dt);
 */
const RANKS = [
  { need: 3, letter: 'D', word: 'DECENT', color: '#c9bfa6' },
  { need: 7, letter: 'C', word: 'CLEAN', color: '#bcd96a' },
  { need: 12, letter: 'B', word: 'BRUTAL', color: '#e3bb62' },
  { need: 18, letter: 'A', word: 'AWESOME', color: '#f2934f' },
  { need: 26, letter: 'S', word: 'SAVAGE', color: '#6fe3ff' },
];
const POINTS = { hit: 1, finisher: 2, crit: 1, dodge: 1, parry: 4, perfect: 4 };
const CAP = 34; // a little headroom past S, so one slip of decay doesn't drop the rank
const IDLE = 3; // seconds without doing anything before it starts to drain
const DRAIN = 1.6; // points a second

export class StyleMeter {
  constructor(hud) {
    this.hud = hud;
    this.points = 0;
    this.idle = 0;
    this.rank = -1;
  }

  add(kind) {
    this.points = Math.min(CAP, this.points + (POINTS[kind] || 0));
    this.idle = 0;
    this._show();
  }

  /** Kai took a hit: the rank breaks. */
  hurt() {
    const had = this.rank >= 0;
    this.points = 0;
    this.rank = -1;
    if (had) this.hud.setStyle(null, 0, { broke: true });
  }

  update(dt) {
    this.idle += dt;
    if (this.idle > IDLE && this.points > 0) {
      this.points = Math.max(0, this.points - DRAIN * dt);
      this._show();
    }
  }

  _show() {
    let r = -1;
    while (r + 1 < RANKS.length && this.points >= RANKS[r + 1].need) r++;
    const lo = r >= 0 ? RANKS[r].need : 0;
    const hi = r + 1 < RANKS.length ? RANKS[r + 1].need : CAP;
    const frac = Math.min(1, (this.points - lo) / Math.max(1, hi - lo));
    const up = r > this.rank;
    this.rank = r;
    this.hud.setStyle(r >= 0 ? RANKS[r] : null, frac, { up });
  }
}
