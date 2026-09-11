import * as THREE from 'three';

/**
 * AUDIO SYSTEM
 * Owner: Member 1B — but this class is level-agnostic on purpose, so
 * Level 2 and Level 3 can reuse it for engine/cave sounds instead of
 * every pair writing their own audio plumbing.
 *
 * Setup (once, wherever the main camera is created — likely 1A's
 * Game.js, or here if 1A hasn't wired it up yet):
 *
 *   const audio = new AudioSystem(camera);
 *   await audio.loadAll({
 *     ambience: 'assets/audio/subway_ambience.mp3',
 *     footstep: 'assets/audio/footstep.mp3',
 *     handlerBreath: 'assets/audio/handler_breath.mp3',
 *     music_l1: 'assets/audio/music_downline.mp3',
 *     music_l2: 'assets/audio/music_redline.mp3',
 *   });
 *
 * Per-level use:
 *   audio.playAmbience('ambience', { loop: true, volume: 0.4 });
 *   audio.attachPositional(handlerMesh, 'handlerBreath', { loop: true, refDistance: 5 });
 *   audio.playFootstep(); // call on each footstep animation event / stride timer
 *   audio.crossfadeMusic('music_l1', 'music_l2', 2.5); // at the Interlude transition
 */
export class AudioSystem {
  constructor(camera) {
    // Game.js owns one camera across levels — reuse its listener instead
    // of stacking a new one on every level.init() call.
    if (camera.userData.audioListener) {
      this.listener = camera.userData.audioListener;
    } else {
      this.listener = new THREE.AudioListener();
      camera.add(this.listener);
      camera.userData.audioListener = this.listener;
    }

    this.buffers = new Map(); // name -> AudioBuffer
    this.loader = new THREE.AudioLoader();

    this.ambienceTrack = null; // THREE.Audio
    this.musicTrackA = null; // THREE.Audio (current)
    this.musicTrackB = null; // THREE.Audio (incoming, for crossfade)
    this.positionalSources = new Map(); // object.uuid -> THREE.PositionalAudio

    this.footstepPool = [];
    this.footstepIndex = 0;
    this._footstepCooldown = 0;
  }

  /**
   * Load a named table of { name: url } sounds. Call once at level init
   * (or game boot, if the shared AssetRegistry ends up owning this).
   */
  async loadAll(sources) {
    const entries = Object.entries(sources);
    await Promise.all(
      entries.map(
        ([name, url]) =>
          new Promise((resolve, reject) => {
            this.loader.load(
              url,
              (buffer) => {
                this.buffers.set(name, buffer);
                resolve();
              },
              undefined,
              (err) => {
                console.warn(`[AudioSystem] failed to load "${name}" from ${url}`, err);
                resolve(); // don't block the whole level on one missing file
              }
            );
          })
      )
    );
  }

  _getBuffer(name) {
    const buffer = this.buffers.get(name);
    if (!buffer) {
      console.warn(`[AudioSystem] no buffer loaded for "${name}"`);
    }
    return buffer;
  }

  /**
   * Non-positional looping ambience (tunnel drips/hum, highway wind,
   * cave rumble). Stops any existing ambience first.
   */
  playAmbience(name, { loop = true, volume = 0.4 } = {}) {
    const buffer = this._getBuffer(name);
    if (!buffer) return;

    if (this.ambienceTrack) {
      this.ambienceTrack.stop();
    }

    const track = new THREE.Audio(this.listener);
    track.setBuffer(buffer);
    track.setLoop(loop);
    track.setVolume(volume);
    track.play();

    this.ambienceTrack = track;
    return track;
  }

  stopAmbience() {
    if (this.ambienceTrack) {
      this.ambienceTrack.stop();
      this.ambienceTrack = null;
    }
  }

  /**
   * Attaches a looping PositionalAudio source to a mesh — use for the
   * Handler's breathing/footsteps on his silhouette, train rumble,
   * engine sounds on the car, cave vent hiss, etc.
   */
  attachPositional(object3D, name, { loop = true, volume = 0.8, refDistance = 6, maxDistance = 60 } = {}) {
    const buffer = this._getBuffer(name);
    if (!buffer) return null;

    const sound = new THREE.PositionalAudio(this.listener);
    sound.setBuffer(buffer);
    sound.setLoop(loop);
    sound.setVolume(volume);
    sound.setRefDistance(refDistance);
    sound.setMaxDistance(maxDistance);
    sound.setDistanceModel('linear');

    object3D.add(sound);
    sound.play();

    this.positionalSources.set(object3D.uuid, sound);
    return sound;
  }

  detachPositional(object3D) {
    const sound = this.positionalSources.get(object3D.uuid);
    if (sound) {
      sound.stop();
      object3D.remove(sound);
      this.positionalSources.delete(object3D.uuid);
    }
  }

  /**
   * Fires a one-shot footstep sound. Call this from a stride timer or
   * animation event in the player controller — decoupled with a small
   * cooldown so it can also be called every frame if it's easier for
   * whoever wires up the controller.
   *
   * Pass `dt` so the cooldown is real seconds. Without it the cooldown
   * drains per call rather than per second, so a caller that fires more
   * than 60 times a second (a stride timer at speed) throttles itself by
   * frame rate instead of by time.
   */
  playFootstep({ pitchVariance = 0.15, volume = 0.5, minInterval = 0.18, dt = 1 / 60 } = {}) {
    this._footstepCooldown -= dt;
    const buffer = this._getBuffer('footstep');
    if (!buffer) return;
    if (this._footstepCooldown > 0) return;

    const sound = new THREE.Audio(this.listener);
    sound.setBuffer(buffer);
    sound.setVolume(volume);
    sound.setPlaybackRate(1 + (Math.random() * 2 - 1) * pitchVariance);
    sound.play();

    this._footstepCooldown = minInterval;
  }

  /**
   * One-shot sting for Handler beats (gate slam, train horn, etc).
   */
  playOneShot(name, { volume = 0.7 } = {}) {
    const buffer = this._getBuffer(name);
    if (!buffer) return;
    const sound = new THREE.Audio(this.listener);
    sound.setBuffer(buffer);
    sound.setVolume(volume);
    sound.play();
    return sound;
  }

  /**
   * Music-layer transition between levels (e.g. Interlude I: subway
   * music fading into highway music). Runs a manual gain fade over
   * `duration` seconds — call once, then leave it alone; it cleans
   * itself up.
   */
  crossfadeMusic(fromName, toName, duration = 2.0) {
    const fromBuffer = this._getBuffer(fromName);
    const toBuffer = this._getBuffer(toName);
    if (!toBuffer) return;

    const incoming = new THREE.Audio(this.listener);
    incoming.setBuffer(toBuffer);
    incoming.setLoop(true);
    incoming.setVolume(0);
    incoming.play();

    const outgoing = this.musicTrackA;
    const startTime = performance.now();

    const step = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const t = Math.min(elapsed / duration, 1);

      incoming.setVolume(t);
      if (outgoing) outgoing.setVolume(1 - t);

      if (t < 1) {
        requestAnimationFrame(step);
      } else if (outgoing) {
        outgoing.stop();
      }
    };
    requestAnimationFrame(step);

    this.musicTrackA = incoming;
    if (!fromBuffer) {
      console.warn(`[AudioSystem] crossfade "from" track "${fromName}" not loaded — fading in "${toName}" alone`);
    }
  }

  /** Call from Level.teardown() to stop everything this level started. */
  teardown() {
    this.stopAmbience();
    if (this.musicTrackA) this.musicTrackA.stop();
    for (const sound of this.positionalSources.values()) {
      sound.stop();
    }
    this.positionalSources.clear();
  }
}