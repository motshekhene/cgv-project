/**
 * JUNGLE AUDIO — the one sound world for THE SILENT HORN, the whole jungle run.
 * Owner: the sound engineer. Everything a level, the intro or a cutscene
 * needs comes from here and nowhere else, so a coin collected in Level 1
 * and a repair grabbed in Level 2 come from the same buffers, with the same
 * style, the same quality and the same headroom. Almost all of it is
 * synthesised; the recorded assets (the theme loop, the coin chime, the
 * traffic wreck — Pixabay, see public/assets/audio/CREDITS.md) load through
 * the loader below and are peak-normalised to the voices they replace, so
 * the volume contract survives the swap.
 *
 * Exports:
 *
 *   createJungleCueBuffers(ctx)         the one-shot palette (Map of buffers)
 *   createJungleMusicBuffer(ctx, kind)  the synthesised music loops:
 *                                       'intro' | 'pursuit' | 'drive' | 'battle'
 *   loadJungleTheme(ctx)                the recorded theme loop (async)
 *   loadAudioFileBuffer(ctx, url, peak) any recorded asset, normalised
 *   class JungleBed                     the ambient bed
 *
 * The music is one adventure theme in four arrangements — the same chords and
 * melody everywhere, one tempo and texture per level — so the whole game
 * speaks a single musical language. The bed is deliberately simple and quiet:
 * wind through the leaves, the river, rain and the road, plus distant
 * wildlife — a low insect shimmer, far-off birds, the odd monkey call — so
 * sparse it reads as backdrop, never foreground. It crossfades
 * instead of cutting when the world changes: Level 1 blends it to the
 * logging camp's idling engine at the Level 2 handoff; Level 2 shifts it
 * toward road and rain as the run goes on.
 *
 * Nothing here loads a file, owns a DOM element or depends on three.js, so
 * any AudioContext can host it: Level 1 passes the shared THREE.AudioListener
 * input (pause/mute keep working), Level 2 and Level 3 their own master bus,
 * the intro its own little context.
 *
 * Volume contract (so the levels sit at the same loudness):
 *   master  0.75   Level 2's existing master, now also the intro's and Level 3's
 *   music   0.32   the levels' music buses land here (they divide by their
 *                  master; Level 1 sets it straight on the THREE.Audio track)
 *   bed     0.55   the ambience layer, always under the music and the cues
 */

export const AUDIO_LEVELS = {
  master: 0.75,
  music: 0.32,
  bed: 0.55,
};

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ================================================================ the cues */

/**
 * One-shot feedback and world sounds. Level 1's original procedural set is
 * kept voice-for-voice (it was tuned by ear against that level's mix), the
 * new gameplay cues follow the same recipe: short, readable, and normalised
 * against their siblings so nothing is suddenly the loudest thing in the game.
 *
 * Every entry is a pure function of sample time, so a cue always sounds the
 * same in every context that hosts it.
 */
const CUES = {
  /* --- ported from Level 1: the chase and the world --- */

  // Dirt footfall: a low heel thump plus a short gritty transient.
  footstep: {
    seconds: 0.22,
    fn: (t) => {
      const thump = Math.sin(t * TAU * 72) * Math.exp(-t * 22) * 0.62;
      const grit =
        Math.sin(t * TAU * 1680) * Math.sin(t * TAU * 2330) * Math.exp(-t * 42) * 0.24;
      return thump + grit;
    },
  },

  // Heavy single blow — big hits and kills, not the everyday stumble.
  impact: {
    seconds: 0.32,
    fn: (t) => ((Math.random() * 2 - 1) * 0.4 + Math.sin(t * TAU * 58) * 0.75) * Math.exp(-t * 16),
  },

  gateSlam: {
    seconds: 0.9,
    fn: (t) => ((Math.random() * 2 - 1) * 0.55 + Math.sin(t * TAU * 43) * 0.8) * Math.exp(-t * 6.5),
  },

  // The Handler's breathing loop (played positionally on his silhouette).
  handlerBreath: {
    seconds: 2.4,
    peak: 0.16,
    fn: (t) => {
      const phase = (t % 1.2) / 1.2;
      return (Math.random() * 2 - 1) * 0.12 * Math.pow(Math.sin(Math.PI * phase), 2);
    },
  },

  // Getting caught: a falling stab plus a sub boom so the loss lands in the
  // chest as well as the ears.
  handlerCatch: {
    seconds: 0.55,
    fn: (t) => {
      const e = Math.exp(-t * 8);
      return (
        Math.sin(t * TAU * (95 - t * 70)) * 0.7 +
        Math.sin(t * TAU * 38) * 0.5 * Math.exp(-t * 5) +
        (Math.random() * 2 - 1) * 0.2
      ) * e;
    },
  },

  guardianRoar: {
    seconds: 1.15,
    fn: (t) => {
      const e = Math.exp(-t * 2.6);
      const growl =
        Math.sin(t * TAU * (58 - t * 18)) * 0.42 + Math.sin(t * TAU * 31) * 0.26;
      return (growl + (Math.random() * 2 - 1) * 0.22) * e;
    },
  },

  treeCreak: {
    seconds: 0.8,
    fn: (t) => (
      Math.sin(t * TAU * (115 - t * 55)) * 0.23 +
      Math.sin(t * TAU * 37) * 0.12 +
      (Math.random() * 2 - 1) * 0.08
    ) * Math.exp(-t * 2.2),
  },

  treeCrash: {
    seconds: 0.72,
    fn: (t) => (Math.sin(t * TAU * 48) * 0.45 + (Math.random() * 2 - 1) * 0.65) * Math.exp(-t * 7.5),
  },

  stoneGrind: {
    seconds: 1.0,
    fn: (t) => (
      Math.sin(t * TAU * 34) * 0.28 +
      Math.sin(t * TAU * 71) * 0.16 +
      (Math.random() * 2 - 1) * 0.22
    ) * Math.exp(-t * 2.7),
  },

  // Collecting a story letter — the glowing cyan shard.
  shrinePulse: {
    seconds: 0.75,
    fn: (t) => (
      Math.sin(t * TAU * (160 - t * 55)) * 0.27 + Math.sin(t * TAU * 80) * 0.13
    ) * Math.exp(-t * 4.0),
  },

  bridgeCrack: {
    seconds: 0.62,
    fn: (t) => ((Math.random() * 2 - 1) * 0.58 + Math.sin(t * TAU * 52) * 0.34) * Math.exp(-t * 8.5),
  },

  jetpackIgnite: {
    seconds: 0.72,
    fn: (t) => {
      const rise = Math.min(1, t * 7);
      const fall = Math.exp(-t * 2.9);
      return (Math.sin(t * TAU * (86 + t * 90)) * 0.2 + (Math.random() * 2 - 1) * 0.18) * rise * fall;
    },
  },

  // The southbound mine tram: a two-tone horn over rail rumble. Level 1 has
  // been asking for this buffer since the hazard was wired (it warned "no
  // buffer loaded" into the console every dispatch).
  train: {
    seconds: 1.7,
    fn: (t) => {
      const env = smoothstep(0, 0.05, t) * (1 - smoothstep(0.9, 1.45, t));
      const horn = (Math.sin(t * TAU * 196) + 0.6 * Math.sin(t * TAU * 147)) * 0.26 * env;
      const rail = (Math.random() * 2 - 1) * 0.14 * env;
      const shake = Math.sin(t * TAU * 38) * 0.18 * env;
      return horn + rail + shake;
    },
  },

  // Looping tension layer — quiet by design; it is played at very low volume
  // under everything and must never poke through.
  tension: {
    seconds: 4.0,
    peak: 0.09,
    fn: (t) => {
      const beat = Math.pow(Math.max(0, Math.sin(t * TAU * 1.0)), 10);
      const sub = Math.sin(t * TAU * 44) * 0.065;
      const drone = Math.sin(t * TAU * 71) * 0.022;
      return sub * beat + drone;
    },
  },

  /* --- new gameplay cues: short, readable feedback --- */

  // Tripping a barrier: a gritty scuff, a doubled heel thud and a breath
  // puff. Distinct from `impact` on purpose — the player should hear the
  // difference between a stumble and a real hit.
  stumble: {
    seconds: 0.34,
    fn: (t) => {
      const scuff = (Math.random() * 2 - 1) * Math.exp(-t * 30) * 0.32;
      const thud = (t0) => {
        const lt = t - t0;
        return lt < 0 ? 0 : Math.sin(lt * TAU * 74) * Math.exp(-lt * 20) * 0.55;
      };
      const breathT = smoothstep(0.06, 0.12, t) * (1 - smoothstep(0.16, 0.3, t));
      const breath = (Math.random() * 2 - 1) * breathT * 0.1;
      return thud(0) + thud(0.11) + scuff + breath;
    },
  },

  // Health loss: a body-blow thump with a falling minor-second tone over it
  // — the "that cost you" cue.
  hurt: {
    seconds: 0.5,
    fn: (t) => {
      const thump = Math.sin(t * TAU * 92) * Math.exp(-t * 14) * 0.65;
      const drop = Math.sin(t * TAU * (392 - t * 160)) * 0.22 * Math.exp(-t * 7);
      const tick = (Math.random() * 2 - 1) * Math.exp(-t * 90) * 0.3;
      return thump + drop + tick;
    },
  },

  // The gold temple rings: a struck coin — bright, metallic, inharmonic
  // partials with a faint second strike for sparkle.
  coin: {
    seconds: 0.34,
    fn: (t) => {
      const strike = (t0, amp) => {
        const lt = t - t0;
        if (lt < 0) return 0;
        const f = 1567;
        return (
          Math.sin(lt * TAU * f) * Math.exp(-lt * 26) * 0.5 +
          Math.sin(lt * TAU * f * 2.76) * Math.exp(-lt * 38) * 0.3 +
          Math.sin(lt * TAU * f * 5.4) * Math.exp(-lt * 60) * 0.14
        ) * amp;
      };
      return strike(0, 1) + strike(0.065, 0.45);
    },
  },

  // Winning a level: a drum flam into a rising marimba fanfare on the same
  // pentatonic scale the music lives in, plus a shimmer tail.
  win: {
    seconds: 1.5,
    fn: (t) => {
      const marimba = (t0, f, amp) => {
        const lt = t - t0;
        if (lt < 0) return 0;
        return (Math.sin(lt * TAU * f) * 0.6 + Math.sin(lt * TAU * f * 2.4) * 0.18)
          * Math.exp(-lt * 5.5) * amp;
      };
      const drum = (t0, amp) => {
        const lt = t - t0;
        return lt < 0 ? 0 : (Math.sin(lt * TAU * 70) + 0.4 * Math.sin(lt * TAU * 128))
          * Math.exp(-lt * 16) * amp;
      };
      const shimmer = Math.sin(t * TAU * 2093) * Math.exp(-t * 1.8) * 0.045;
      return (
        drum(0, 0.5) + drum(0.08, 0.32) +
        marimba(0.16, 440, 0.6) +
        marimba(0.3, 523.25, 0.62) +
        marimba(0.44, 659.26, 0.66) +
        marimba(0.62, 880, 0.7) +
        shimmer
      );
    },
  },

  // Losing: a dark falling stab and a wash — the Handler's world closing in.
  defeat: {
    seconds: 1.3,
    fn: (t) => {
      const boom = Math.sin(t * TAU * (96 - t * 40)) * Math.exp(-t * 5) * 0.7;
      const sub = Math.sin(t * TAU * 44) * Math.exp(-t * 4) * 0.4;
      const wash = (Math.random() * 2 - 1) * Math.exp(-t * 3) * 0.16;
      return boom + sub + wash;
    },
  },

  /* --- pickups: each one reads as what it is --- */

  // The life-saver: a warm major kit snapping open and rising.
  pickupRepair: {
    seconds: 0.65,
    fn: (t) => {
      const note = (t0, f, amp) => {
        const lt = t - t0;
        if (lt < 0) return 0;
        const attack = Math.min(1, lt * 80);
        return Math.sin(lt * TAU * f) * attack * Math.exp(-lt * 4.5) * amp;
      };
      const snap = (Math.random() * 2 - 1) * Math.exp(-t * 120) * 0.2;
      return note(0, 261.63, 0.4) + note(0.08, 329.63, 0.42) + note(0.16, 392, 0.45)
        + note(0.26, 523.25, 0.5) + snap;
    },
  },

  // The shrine heart: higher and brighter — a golden sparkle.
  pickupHeart: {
    seconds: 0.7,
    fn: (t) => {
      const note = (t0, f, amp) => {
        const lt = t - t0;
        if (lt < 0) return 0;
        return (Math.sin(lt * TAU * f) * 0.6 + Math.sin(lt * TAU * f * 2) * 0.2)
          * Math.min(1, lt * 90) * Math.exp(-lt * 5) * amp;
      };
      const shimmer = Math.sin(t * TAU * 2637) * Math.exp(-t * 4) * 0.05;
      return note(0, 440, 0.45) + note(0.09, 659.26, 0.5) + note(0.18, 880, 0.55)
        + note(0.3, 987.77, 0.5) + shimmer;
    },
  },

  // Nitro: a rush of air that opens up as it goes.
  pickupNitro: {
    seconds: 0.55,
    fn: (t) => {
      const rise = smoothstep(0, 0.3, t);
      const body = (Math.random() * 2 - 1) * 0.5 * rise * (1 - smoothstep(0.3, 0.55, t));
      const tone = Math.sin(t * TAU * (300 + t * 1400)) * 0.18 * rise * Math.exp(-t * 3);
      const hiss = (Math.random() * 2 - 1) * Math.exp(-(t - 0.28 > 0 ? t - 0.28 : 0) * 9) * 0.12;
      return body + tone + hiss;
    },
  },

  // Shield: a glassy chord that swells — the bubble going up.
  pickupShield: {
    seconds: 0.7,
    fn: (t) => {
      const swell = smoothstep(0, 0.18, t) * (1 - smoothstep(0.4, 0.7, t));
      const chord =
        Math.sin(t * TAU * 293.66) * 0.4 +
        Math.sin(t * TAU * 440.3) * 0.3 +
        Math.sin(t * TAU * 587.9) * 0.25;
      const beat = Math.sin(t * TAU * 3) * 0.08;
      return (chord + beat) * swell;
    },
  },

  /* --- intro cutscene --- */

  // The data-centre door sliding open: a servo rush that ends in a thunk.
  doorSlide: {
    seconds: 1.0,
    fn: (t) => {
      const env = smoothstep(0, 0.18, t) * (1 - smoothstep(0.7, 0.92, t));
      const servo = (Math.random() * 2 - 1) * (0.5 + 0.5 * Math.sin(t * TAU * 9)) * 0.3 * env;
      const lt = t - 0.84;
      const thunk = lt < 0 ? 0 : Math.sin(lt * TAU * 95) * Math.exp(-lt * 30) * 0.5;
      return servo + thunk;
    },
  },

  // The handoff sting under the "RUN" popup: a drum hit and a quick rising
  // marimba run — same voices as the music, so it feels like the level
  // answering the cutscene.
  handoff: {
    seconds: 0.9,
    fn: (t) => {
      const marimba = (t0, f, amp) => {
        const lt = t - t0;
        if (lt < 0) return 0;
        return (Math.sin(lt * TAU * f) * 0.6 + Math.sin(lt * TAU * f * 2.4) * 0.18)
          * Math.exp(-lt * 7) * amp;
      };
      const drum = t < 0 ? 0 : (Math.sin(t * TAU * 72) + 0.4 * Math.sin(t * TAU * 130))
        * Math.exp(-t * 15) * 0.55;
      return drum + marimba(0.1, 440, 0.5) + marimba(0.19, 587.33, 0.55) + marimba(0.28, 880, 0.6);
    },
  },

  /* --- Level 3: the fight at Site 7 --- */

  // A dodge, or a swing passing by: a quick rush of air.
  whoosh: {
    seconds: 0.34,
    fn: (t) => {
      const swell = Math.sin(Math.PI * Math.min(1, t / 0.34));
      const air = (Math.random() * 2 - 1) * 0.55 * swell;
      const glide = Math.sin(TAU * (420 - 700 * t) * t) * 0.2 * swell;
      return air + glide;
    },
  },

  // Parry: blade on blade — a hard click into a bright metallic ring.
  parry: {
    seconds: 0.42,
    fn: (t) => {
      const click = (Math.random() * 2 - 1) * Math.exp(-t * 120) * 0.5;
      const ring = (
        Math.sin(TAU * 1244 * t) * 0.4 +
        Math.sin(TAU * 1244 * 2.41 * t) * 0.25 +
        Math.sin(TAU * 1244 * 3.17 * t) * 0.12
      ) * Math.exp(-t * 14);
      return click + ring;
    },
  },

  // Block: a heavy, dull stop — wood and bone, not metal.
  block: {
    seconds: 0.3,
    fn: (t) => (
      Math.sin(TAU * 118 * t) * Math.exp(-t * 24) * 0.62 +
      Math.sin(TAU * 236 * t) * Math.exp(-t * 30) * 0.2 +
      (Math.random() * 2 - 1) * Math.exp(-t * 55) * 0.3
    ),
  },

  // Kai's fists landing: a meaty thwack — body thump, slap, a little sub.
  punch: {
    seconds: 0.26,
    fn: (t) => {
      const thump = Math.sin(TAU * 96 * t) * Math.exp(-t * 21) * 0.66;
      const sub = Math.sin(TAU * 52 * t) * Math.exp(-t * 12) * 0.3;
      const slap = (Math.random() * 2 - 1) * Math.exp(-t * 60) * 0.4;
      return thump + sub + slap;
    },
  },

  /* --- the sound plan's additions: movement, voices, water, wreck detail --- */

  // Leaving the ground: a short rush of air rising past.
  jump: {
    seconds: 0.2,
    fn: (t) => {
      const e = smoothstep(0, 0.03, t) * (1 - smoothstep(0.07, 0.2, t));
      const air = (Math.random() * 2 - 1) * 0.45 * e;
      const rise = Math.sin(TAU * (280 + t * 1500) * t) * 0.2 * e;
      return air + rise;
    },
  },

  // Coming back down: a soft dirt thump, gentler than a stumble.
  land: {
    seconds: 0.28,
    fn: (t) => {
      const thump = Math.sin(TAU * 84 * t) * Math.exp(-t * 26) * 0.58;
      const grit = (Math.random() * 2 - 1) * Math.exp(-t * 46) * 0.28;
      return thump + grit;
    },
  },

  // A short body "oof": a vocal rasp on grunts and body blows.
  grunt: {
    seconds: 0.26,
    fn: (t) => {
      const e = smoothstep(0, 0.02, t) * (1 - smoothstep(0.09, 0.26, t));
      const rasp = 0.6 + 0.4 * Math.sin(TAU * 30 * t);
      return (Math.sin(TAU * 145 * t) * 0.5 * rasp + (Math.random() * 2 - 1) * 0.12) * e;
    },
  },

  // The Handler's shout — a man's voice carrying through the trees.
  shout: {
    seconds: 0.48,
    fn: (t) => {
      const e = smoothstep(0, 0.03, t) * (1 - smoothstep(0.28, 0.48, t));
      const f = 235 - t * 95;
      const voice = Math.sin(TAU * f * t) * 0.55 + Math.sin(TAU * f * 2 * t) * 0.18;
      const rasp = (Math.random() * 2 - 1) * 0.2 * (0.6 + 0.4 * Math.sin(TAU * 27 * t));
      return (voice + rasp) * e;
    },
  },

  // A pea whistle: two sharp trills.
  whistle: {
    seconds: 0.42,
    fn: (t) => {
      const trill = (t0) => {
        const lt = t - t0;
        if (lt < 0) return 0;
        const f = 2350 + Math.sin(lt * TAU * 36) * 130;
        return Math.sin(TAU * f * lt) * Math.exp(-lt * 8) * 0.5;
      };
      return trill(0) + trill(0.19);
    },
  },

  // Radio crackle: squelch, a clipped voice-band burst, squelch again.
  radio: {
    seconds: 0.4,
    fn: (t) => {
      const squelch = (t0) => {
        const lt = t - t0;
        return lt < 0 || lt > 0.03 ? 0 : (Math.random() * 2 - 1) * Math.exp(-lt * 150) * 0.55;
      };
      const voice = t > 0.05 && t < 0.27 ? (Math.random() * 2 - 1) * 0.32 : 0;
      return squelch(0) + voice + squelch(0.31);
    },
  },

  // A splash: the slap of water, a body thump, droplet pings.
  splash: {
    seconds: 0.55,
    fn: (t) => {
      const body = (Math.random() * 2 - 1) * Math.exp(-t * 6) * 0.5 * smoothstep(0, 0.02, t);
      const thump = Math.sin(TAU * 130 * t) * Math.exp(-t * 13) * 0.3;
      const drops = Math.sin(TAU * (800 + t * 700) * t) * Math.exp(-t * 4.5) * 0.12;
      return body + thump + drops;
    },
  },

  // Glass letting go: a scatter of bright pings over a shard wash.
  glass: {
    seconds: 0.38,
    fn: (t) => {
      let pings = 0;
      for (let i = 0; i < 5; i++) {
        const lt = t - (i * 0.028 + ((i * 7919) % 23) * 0.001);
        if (lt < 0) continue;
        pings += Math.sin(TAU * (2600 + i * 870 + ((i * 6151) % 400)) * lt)
          * Math.exp(-lt * (28 + i * 8)) * 0.2;
      }
      const wash = (Math.random() * 2 - 1) * Math.exp(-t * 24) * 0.3;
      return pings + wash;
    },
  },

  // A body hitting wet rock: heavy and dead, with the roll after.
  bodyFall: {
    seconds: 0.5,
    fn: (t) => {
      const thud = Math.sin(TAU * 66 * t) * Math.exp(-t * 13) * 0.72;
      const wet = (Math.random() * 2 - 1) * Math.exp(-t * 28) * 0.3;
      const lt = t - 0.13;
      const roll = lt < 0 ? 0 : Math.sin(TAU * 112 * lt) * Math.exp(-lt * 18) * 0.18;
      return thud + wet + roll;
    },
  },
};

/**
 * Generates the whole palette into a context. Cheap enough to call once per
 * level instance (the synths run in well under a millisecond).
 */
export function createJungleCueBuffers(ctx) {
  const out = {};
  for (const [name, def] of Object.entries(CUES)) {
    out[name] = sampleBuffer(ctx, def.seconds, def.fn, def.peak ?? 0.9);
  }
  return out;
}

/* ================================================================ the music */

/**
 * The game's music. In play now: one recorded loop (loadJungleTheme) on
 * every level — the strongest game-wide consistency there is. These four
 * arrangements of the same material are the fallback: they play instantly
 * while the file decodes, and stand in if it ever fails to load:
 *
 *   intro    the cutscenes: warm pads and a sparse plucked arpeggio, slow
 *   pursuit  Level 1's chase: the theme with a soft heartbeat pulse
 *   drive    Level 2's road: the same chords and melody, moving with a
 *            firm kick and a walking bass — adventure flat out
 *   battle   Level 3's fight: the theme with a firm pulse and a walking bass
 *
 * All four run the same eight bars of Am–F–C–G; the melody sings on bars
 * 1–4 and rests on 5–8. Every voice is a sine or soft triangle with slow
 * envelopes — warm, simple, consistent.
 */
const MUSIC_TEMPO = { intro: 76, pursuit: 92, drive: 116, battle: 104 };
const MUSIC_BARS = 8;
// one chord per bar: [bass root, pad voicing]
const MUSIC_CHORDS = [
  { bass: 110.0, pad: [220.0, 261.63, 329.63] }, // Am
  { bass: 87.31, pad: [174.61, 220.0, 261.63] }, // F
  { bass: 130.81, pad: [196.0, 261.63, 329.63] }, // C
  { bass: 98.0, pad: [196.0, 246.94, 293.66] }, // G
];
// the melody: [bar-beat, frequency, length in beats, loudness]
const MUSIC_MELODY = [
  [0, 329.63, 1.0, 1.0], [1, 440.0, 0.5, 0.85], [1.5, 392.0, 0.5, 0.8], [2, 329.63, 1.8, 0.9],
  [4, 349.23, 1.0, 0.9], [5, 329.63, 1.0, 0.85], [6, 293.66, 1.8, 0.85],
  [8, 329.63, 1.5, 1.0], [9.5, 392.0, 0.5, 0.85], [10, 523.25, 1.8, 1.0],
  [12, 493.88, 1.0, 0.95], [13, 440.0, 1.0, 0.9], [14, 392.0, 1.8, 0.9],
];

// ---- the voices (pure functions of note-local time) ----

/** A soft string pad: the fundamental with a detuned twin, swelling in. */
function padVoice(lt, f, amp) {
  const e = Math.min(1, lt / 0.55);
  return (
    (Math.sin(TAU * f * lt) * 0.5 +
      Math.sin(TAU * f * 1.004 * lt) * 0.28 +
      Math.sin(TAU * f * 2 * lt) * 0.1) *
    e * amp
  );
}

/** A plucked string: quick attack, ringing decay. */
function pluckVoice(lt, f, amp) {
  const e = Math.min(1, lt / 0.012) * Math.exp(-lt * 4.2);
  return (Math.sin(TAU * f * lt) * 0.6 + Math.sin(TAU * f * 2 * lt) * 0.16) * e * amp;
}

/** The lead: a round, fluting tone with a gentle vibrato. */
function leadVoice(lt, f, amp, dur) {
  const vib = f * (1 + 0.004 * Math.sin(TAU * 5.2 * lt));
  const e = Math.min(1, lt / 0.06) * Math.min(1, (dur - lt) / 0.15);
  return (Math.sin(TAU * vib * lt) * 0.58 + Math.sin(TAU * vib * 3 * lt) * 0.07) * e * amp;
}

/** A soft heartbeat pulse. */
function kickVoice(lt, amp) {
  return Math.sin(TAU * (42 + 55 * Math.exp(-lt * 28)) * lt) * Math.exp(-lt * 11) * amp;
}

/** The theme in one of its arrangements, as a sample-time function. */
function themeSample(kind) {
  const bpm = MUSIC_TEMPO[kind];
  const beat = 60 / bpm;
  const barDur = beat * 4;
  const loop = barDur * MUSIC_BARS;
  const layers = {
    intro: { pad: 0.55, pluck: 0.16, step: 2, bass: 0.22, bassEvery: 2, kick: 0, lead: 0 },
    pursuit: { pad: 0.42, pluck: 0.22, step: 1, bass: 0.26, bassEvery: 2, kick: 0.05, lead: 0.5 },
    drive: { pad: 0.38, pluck: 0.28, step: 1, bass: 0.34, bassEvery: 1, kick: 0.14, lead: 0.58 },
    battle: { pad: 0.5, pluck: 0.2, step: 1, bass: 0.34, bassEvery: 1, kick: 0.12, lead: 0.45 },
  }[kind];
  const ARP = [0, 1, 2, 1, 0, 1, 2, 1]; // which chord tone, walking up and down

  return (t) => {
    let out = 0;
    const tl = t % loop;
    const barT = tl % barDur;
    const beatPos = tl / beat;
    const chord = MUSIC_CHORDS[Math.floor(beatPos / 4) % 4];

    // the pad: one chord per bar, swelled in and released before the change
    const rel = Math.min(1, (barDur - barT) / 0.6);
    for (let i = 0; i < 3; i++) out += padVoice(barT, chord.pad[i], (layers.pad * rel) / 3);

    // the arpeggio: chord tones an octave up, eighths (quarters on the intro)
    const stepDur = layers.step * beat;
    const noteI = Math.floor(barT / stepDur);
    out += pluckVoice(barT - noteI * stepDur, chord.pad[ARP[noteI % 8]] * 2, layers.pluck);

    // the bass: half notes, or a walking beat on the drive and battle loops
    const bI = Math.floor(beatPos / layers.bassEvery);
    const bT = tl - bI * layers.bassEvery * beat;
    const bDur = layers.bassEvery * beat * 0.95;
    if (bT < bDur) {
      out += (Math.sin(TAU * chord.bass * bT) * 0.62 + Math.sin(TAU * chord.bass * 2 * bT) * 0.1)
        * Math.min(1, bT / 0.04) * Math.min(1, (bDur - bT) / 0.12) * layers.bass;
    }

    // the pulse: every beat on the road and in the fight, a heartbeat in the chase
    if (layers.kick) {
      const every = kind === "drive" || kind === "battle" ? 1 : 2;
      const kI = Math.floor(beatPos / every);
      out += kickVoice(tl - kI * every * beat, layers.kick);
    }

    // the melody, bars 1–4
    for (const [at, f, len, amp] of MUSIC_MELODY) {
      const lt = tl - at * beat;
      if (lt < 0 || lt > len * beat) continue;
      out += leadVoice(lt, f, layers.lead * amp, len * beat);
    }
    return clamp(out, -0.85, 0.85);
  };
}

const MUSIC = {};
for (const kind of Object.keys(MUSIC_TEMPO)) {
  MUSIC[kind] = {
    seconds: (MUSIC_BARS * 4 * 60) / MUSIC_TEMPO[kind],
    fn: themeSample(kind),
    peak: kind === "intro" ? 0.34 : kind === "pursuit" ? 0.38 : 0.4,
  };
}

export function createJungleMusicBuffer(ctx, kind = "pursuit") {
  const def = MUSIC[kind] ?? MUSIC.pursuit;
  return sampleBuffer(ctx, def.seconds, def.fn, def.peak);
}

/* ================================================================ the files */

/**
 * The recorded assets. Files in public/ are served from the site root, so
 * these URLs are the same in dev and in the build. Each is peak-normalised
 * on load (the cues to the palette's ceiling, the theme to its mix
 * position above the old arrangements) — that is what keeps one loudness
 * across the game when half the palette is synthesised and half recorded.
 * Decoding is per-AudioContext (an
 * AudioBuffer belongs to the context that decoded it) and cached per one.
 */
const THEME_FILE =
  "/assets/audio/sounduniversestudio-repeat-gaming-background-music-instrumental-218942.mp3";

const _fileCache = new WeakMap(); // ctx -> Map<url, Promise<AudioBuffer|null>>

/**
 * Fetches and decodes an audio file for one context, rescaled to `peak`.
 * Resolves null — never rejects — if the file is missing, so every caller
 * can fall back to its synthesised voice. A fetch failure drops the cache
 * entry so the next level init retries.
 */
export function loadAudioFileBuffer(ctx, url, { peak = 0.9 } = {}) {
  if (!ctx) return Promise.resolve(null);
  let cache = _fileCache.get(ctx);
  if (!cache) _fileCache.set(ctx, (cache = new Map()));
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status} ${url}`))))
        .then((b) => ctx.decodeAudioData(b))
        .then((buf) => {
          scaleBufferToPeak(buf, peak);
          return buf;
        })
        .catch(() => {
          cache.delete(url);
          return null;
        }),
    );
  }
  return cache.get(url);
}

/**
 * The game's theme: the one recorded loop, on every level. It peaks above
 * the synthesised arrangements (0.55 vs 0.34–0.4) — at their ceiling the
 * recording sat under the effects palette. This one number is the game-wide
 * music-to-effects balance; every level shares the same decoded buffer.
 */
export function loadJungleTheme(ctx) {
  return loadAudioFileBuffer(ctx, THEME_FILE, { peak: 0.55 });
}

/** Rescales a decoded buffer in place so its loudest sample is `peak`. */
function scaleBufferToPeak(buffer, peak) {
  let max = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > max) max = a;
    }
  }
  const k = max > 0.0001 ? peak / max : 1;
  if (k === 1) return;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= k;
  }
}

/* ============================================================ the ambient bed */

/**
 * JungleBed — the ambient bed, procedural, quiet and deliberately simple:
 * wind through the leaves and the river's hush, with rain, road and the
 * camp's idling engine riding on top as the world changes. The wildlife is
 * back, but distant: a low insect shimmer, a far-off bird now and then,
 * the odd monkey hoot rarer still — sparse enough to be backdrop, never
 * the foreground the old up-close chirps were.
 *
 *   leaves   wind through leaves: two filtered noise sides gusting on slow
 *            LFOs, plus a high leaf-hiss band that rides the gusts
 *   river    a steady low hush, panned to the left where Level 2's river runs
 *   road     tyre-on-dirt rumble and grit, tied to the car's speed
 *   wind     the speed wind on top of the leaves
 *   rain     a rain bed with a fluttering patter band (matches Level 2's
 *            visual rain ramp)
 *   camp     the parked vehicle idling in Level 1's logging camp — the bridge
 *            into Level 2's engine atmosphere
 *
 * update(dt, params) every frame; params (all optional, all remembered):
 *   night 0..1  the leaves settle a little   rain 0..1   rain loudness
 *   river 0..1  river proximity             road 0..1   road bed level
 *   wind 0..1   speed wind                   camp 0..1   idling engine
 *   birds 0..1  the distant wildlife's density (insects, birds, monkeys)
 */
export class JungleBed {
  constructor(ctx, destination, { level = AUDIO_LEVELS.bed } = {}) {
    this.ctx = ctx;
    this.disposed = false;
    this._night = 0;
    this._rain = 0;
    this._river = 0;
    this._road = 0;
    this._wind = 0;
    this._camp = 0;
    this._birds = 0;
    this._birdT = 4;
    this._monkeyT = 20;
    this._tickT = 3;

    this.out = ctx.createGain();
    this.out.gain.value = level;
    this.out.connect(destination);

    this.noise = makeNoiseBuffer(ctx, 2);
    this._sources = [];

    // ---- leaves ----
    this.leavesMaster = ctx.createGain();
    this.leavesMaster.gain.value = 0.42;
    this.leavesMaster.connect(this.out);
    const leafSide = (freq, pan) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = freq;
      filter.Q.value = 0.8;
      const gain = ctx.createGain();
      gain.gain.value = 0.06;
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      src.connect(filter).connect(gain).connect(panner).connect(this.leavesMaster);
      src.start();
      this._sources.push(src);
      return gain;
    };
    this.leafL = leafSide(520, -0.4);
    this.leafR = leafSide(660, 0.4);
    // gusts: slow audio-rate LFOs nudge the two sides in and out of phase
    this._lfo(0.05, 0.03, this.leafL.gain);
    this._lfo(0.083, 0.03, this.leafR.gain);
    // the hiss of leaves themselves, riding the same gusts
    const hissSrc = ctx.createBufferSource();
    hissSrc.buffer = this.noise;
    hissSrc.loop = true;
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = "highpass";
    hissFilter.frequency.value = 2600;
    this.leafHiss = ctx.createGain();
    this.leafHiss.gain.value = 0.008;
    hissSrc.connect(hissFilter).connect(this.leafHiss).connect(this.leavesMaster);
    hissSrc.start();
    this._sources.push(hissSrc);
    this._lfo(0.06, 0.008, this.leafHiss.gain);

    // ---- insects: a low, distant shimmer, not up-close chirps ----
    this.insects = this._noiseLayer("bandpass", 1500, 2.4, 0, (g) => {
      const am = ctx.createGain();
      am.gain.value = 0.55;
      this._lfo(10.5, 0.4, am.gain);
      g.disconnect();
      g.connect(am).connect(this.out);
    });

    // ---- river (Level 2's river runs on the left of the road) ----
    this.riverGain = this._noiseLayer("lowpass", 400, 0.7, 0, (g) => {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = -0.6;
      g.disconnect();
      g.connect(panner).connect(this.out);
      this._lfo(0.35, 0.15, g.gain, 0.06);
    });

    // ---- road: rumble + grit, both tied to speed in update() ----
    this.roadGain = this._noiseLayer("lowpass", 120, 0.7, 0);
    this.gritGain = this._noiseLayer("bandpass", 560, 1.1, 0);

    // ---- speed wind ----
    this.windGain = this._noiseLayer("lowpass", 650, 0.6, 0);

    // ---- rain ----
    this.rainGain = this._noiseLayer("highpass", 1400, 0.7, 0);
    const flutterSrc = ctx.createBufferSource();
    flutterSrc.buffer = this.noise;
    flutterSrc.loop = true;
    const flutterFilter = ctx.createBiquadFilter();
    flutterFilter.type = "bandpass";
    flutterFilter.frequency.value = 3800;
    flutterFilter.Q.value = 3;
    const flutterAm = ctx.createGain();
    flutterAm.gain.value = 0.5;
    this._lfo(6.5, 0.5, flutterAm.gain);
    this.rainFlutter = ctx.createGain();
    this.rainFlutter.gain.value = 0;
    flutterSrc.connect(flutterFilter).connect(flutterAm).connect(this.rainFlutter).connect(this.out);
    flutterSrc.start();
    this._sources.push(flutterSrc);

    // ---- camp: the idling service vehicle ----
    this.campGain = ctx.createGain();
    this.campGain.gain.value = 0;
    this.campGain.connect(this.out);
    const campFilter = ctx.createBiquadFilter();
    campFilter.type = "lowpass";
    campFilter.frequency.value = 170;
    campFilter.Q.value = 0.6;
    campFilter.connect(this.campGain);
    const campOsc = ctx.createOscillator();
    campOsc.type = "sawtooth";
    campOsc.frequency.value = 45;
    const campOsc2 = ctx.createOscillator();
    campOsc2.type = "sine";
    campOsc2.frequency.value = 90.5;
    const campMix = ctx.createGain();
    campMix.gain.value = 0.5;
    campOsc.connect(campMix);
    campOsc2.connect(campMix);
    campMix.connect(campFilter);
    campOsc.start();
    campOsc2.start();
    this._sources.push(campOsc, campOsc2);
    this._lfo(3.1, 3, campOsc.frequency, 45); // idle wobble
  }

  /** A looped noise source through a filter and a gain, into the bed. */
  _noiseLayer(type, freq, q, gain, after) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(this.out);
    src.start();
    this._sources.push(src);
    if (after) after(g);
    return g;
  }

  /** Oscillator → depth → an AudioParam (adds to its setTargetAtTime value). */
  _lfo(rate, depth, param, base) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.frequency.value = rate;
    const d = ctx.createGain();
    d.gain.value = depth;
    osc.connect(d).connect(param);
    osc.start();
    this._sources.push(osc);
    void base;
  }

  update(dt, s = {}) {
    if (this.disposed || !this.ctx || this.ctx.state === "closed") return;
    const t = this.ctx.currentTime;
    const set = (param, value, tc) => param.setTargetAtTime(value, t, tc);

    const night = (this._night = s.night ?? this._night);
    const rain = (this._rain = s.rain ?? this._rain);
    const river = (this._river = s.river ?? this._river);
    const road = (this._road = s.road ?? this._road);
    const wind = (this._wind = s.wind ?? this._wind);
    const camp = (this._camp = s.camp ?? this._camp);
    const birds = (this._birds = s.birds ?? this._birds);

    // leaves settle a little at night and lift under rain (rain on leaves)
    set(this.leavesMaster.gain, 0.42 * (1 - 0.35 * night) + 0.15 * rain, 1.2);
    set(this.riverGain.gain, 0.06 * river, 0.8);
    set(this.roadGain.gain, 0.09 * road, 0.15);
    set(this.gritGain.gain, 0.05 * road, 0.15);
    set(this.windGain.gain, 0.07 * wind, 0.25);
    set(this.rainGain.gain, 0.045 * rain, 1.0);
    set(this.rainFlutter.gain, 0.03 * rain, 1.0);
    set(this.campGain.gain, 0.11 * camp, 0.6);
    set(this.insects.gain, 0.02 * birds, 2.0);

    // ---- the distant wildlife: a far-off bird now and then, a monkey hoot
    // rarer still. The intervals scale with the density param, so 0.5 in
    // Level 1 is a call every ~20 s — backdrop, not foreground. ----
    this._birdT -= dt;
    if (this._birdT <= 0) {
      this._birdT = birds <= 0.02 ? 9 : (9 + Math.random() * 11) / Math.max(0.2, birds);
      if (birds > 0.02) {
        const f = 1700 + Math.random() * 700;
        this._blip(t, 0.08, f, 0.008 * birds);
        this._blip(t + 0.13, 0.06, f * 0.84, 0.006 * birds);
      }
    }
    this._monkeyT -= dt;
    if (this._monkeyT <= 0) {
      this._monkeyT = 24 + Math.random() * 30;
      if (birds > 0.15) {
        const f = 400 + Math.random() * 140;
        this._blip(t, 0.16, f, 0.011);
        this._blip(t + 0.22, 0.2, f * 1.12, 0.01);
        this._blip(t + 0.5, 0.13, f * 0.94, 0.007);
      }
    }

    // ---- the idling engine's cooling ticks ----
    if (camp > 0.05) {
      this._tickT -= dt;
      if (this._tickT <= 0) {
        this._tickT = 2 + Math.random() * 2.5;
        this._blip(t, 0.03, 2700, 0.1 * camp, 0, "sine");
      }
    }
  }

  /**
   * A single synthesised blip (the camp's cooling ticks): fast attack,
   * quick decay.
   */
  _blip(at, dur, freq, vol) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, at);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(this.out);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const src of this._sources) {
      try { src.stop(); } catch { /* already stopped */ }
    }
    this._sources.length = 0;
    try { this.out.disconnect(); } catch { /* already gone */ }
  }
}

/* ================================================================ internals */

function sampleBuffer(ctx, seconds, sampleFn, peak = 0.9) {
  const rate = ctx.sampleRate;
  const n = Math.max(1, Math.floor(seconds * rate));
  const buffer = ctx.createBuffer(1, n, rate);
  const out = buffer.getChannelData(0);
  let max = 0;
  for (let i = 0; i < n; i++) {
    const v = sampleFn(i / rate, i, n);
    out[i] = v;
    const a = Math.abs(v);
    if (a > max) max = a;
  }
  // peak-normalise so every cue sits at the same ceiling — the levels the
  // levels play them at then mean the same thing everywhere
  const k = max > 0.0001 ? Math.min(peak / max, 4) : 1;
  if (k !== 1) for (let i = 0; i < n; i++) out[i] *= k;
  return buffer;
}

function makeNoiseBuffer(ctx, seconds) {
  const rate = ctx.sampleRate;
  const n = Math.floor(seconds * rate);
  const buffer = ctx.createBuffer(1, n, rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
