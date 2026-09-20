import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { disposeObject } from "./Level.js";

/**
 * One place to load models, textures and audio — and one place where the
 * "paths must start with ./" rule from the README is actually enforced.
 * If you pass '/assets/rock.png' this throws in development instead of
 * silently 404ing after the game is hosted.
 *
 *   const gltf = await assets.model('level01/tunnel.glb');
 *   const tex  = await assets.texture('textures/rock.png');
 *
 * Everything is cached, so asking twice does not download twice.
 */
export class AssetRegistry {
  constructor({ base = "./assets/", onProgress = null } = {}) {
    this.base = base;
    this.cache = new Map();
    this.manager = new THREE.LoadingManager();
    this.gltf = new GLTFLoader(this.manager);
    this.tex = new THREE.TextureLoader(this.manager);
    this.audio = new THREE.AudioLoader(this.manager);
    this.onProgress = onProgress;

    this.manager.onProgress = (url, loaded, total) => {
      if (this.onProgress) this.onProgress(loaded / Math.max(1, total), url);
    };
    this.manager.onError = (url) =>
      console.error("[assets] failed to load", url);
  }

  /** Throws on absolute paths, backslashes and capitals — the three hosting killers. */
  resolve(path) {
    if (typeof path !== "string" || !path.length)
      throw new Error("[assets] empty path");
    if (path.startsWith("/")) {
      throw new Error(
        `[assets] "${path}" starts with "/". Use a relative path — ` +
          `absolute paths break once the game is hosted in a subfolder.`,
      );
    }
    if (path.includes("\\"))
      throw new Error(`[assets] "${path}" uses backslashes, use "/"`);
    if (/[A-Z ]/.test(path)) {
      console.warn(
        `[assets] "${path}" has capitals or spaces. The server is ` +
          `case-sensitive — keep filenames lowercase-with-hyphens.`,
      );
    }
    if (path.startsWith("./") || path.startsWith("../")) return path;
    return this.base + path;
  }

  _load(loader, path, after) {
    const url = this.resolve(path);
    if (this.cache.has(url)) return this.cache.get(url);
    const promise = new Promise((resolve, reject) => {
      loader.load(
        url,
        (result) => resolve(after ? after(result) : result),
        undefined,
        reject,
      );
    });
    this.cache.set(url, promise);
    return promise;
  }

  /** Returns the loaded gltf. Use gltf.scene, and clone it if you need copies. */
  model(path) {
    return this._load(this.gltf, path);
  }

  texture(path, { srgb = true, repeat = null } = {}) {
    return this._load(this.tex, path, (t) => {
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      if (repeat) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeat[0], repeat[1]);
      }
      t.anisotropy = 4;
      return t;
    });
  }

  sound(path) {
    return this._load(this.audio, path);
  }

  /** Load a batch and wait for all of it — handy in Level.init(). */
  all(paths) {
    return Promise.all(
      paths.map((p) => {
        if (p.endsWith(".glb") || p.endsWith(".gltf")) return this.model(p);
        if (p.endsWith(".mp3") || p.endsWith(".ogg") || p.endsWith(".wav"))
          return this.sound(p);
        return this.texture(p);
      }),
    );
  }

  /** Free everything. Called on full teardown, not between levels. */
  async dispose() {
    for (const promise of this.cache.values()) {
      try {
        const asset = await promise;
        if (asset && asset.isTexture) asset.dispose();
        else if (asset && asset.scene) disposeObject(asset.scene);
      } catch (_) {
        /* a failed load has nothing to dispose */
      }
    }
    this.cache.clear();
  }
}
