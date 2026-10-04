import * as THREE from 'three';

/**
 * Lights for the cars — Member 2A
 *
 *  CarLights     player car: two shadow-casting headlight SpotLights, glowing
 *                head/tail lamps, tail lamps brighten when braking.
 *  PoliceLights  Handler: red/blue lightbar that flashes faster on TELEGRAPH,
 *                so the ram is announced by colour as well as by sound.
 *
 * Both are children of the vehicle's holder Group, so they move with it, and
 * both are re-placed by fit(bounds) whenever a new model is swapped in
 * (bounds come from attachModel: model.userData.bounds).
 * Every visible lamp is flagged userData.keep so attachModel never removes it.
 *
 * Tuning knobs are at the top — spot/point intensities are in candela
 * (three r155+ physical units), so they look large.
 */
export const HEADLIGHT = {
  color: 0xfff0d0, intensity: 600, distance: 90, angle: 0.5, penumbra: 0.6,
  decay: 2, shadowMapSize: 512, shadowFar: 60,
};
export const POLICE = { intensity: 90, telegraphIntensity: 180, distance: 26, slowHz: 4, fastHz: 12 };

/**
 * Gives the model's OWN lamp materials (named "Headlights", "TailLights",
 * "BlueLights"...) a glow, cloned per car so copies don't share it.
 * Returns the cloned materials, or [] if the model has none.
 */
function glowMaterials(model, test, emissive, intensity) {
  const out = [];
  if (!model) return out;
  model.traverse((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const next = list.map((m) => {
      if (!m || !test.test(m.name || '')) return m;
      const c = m.clone();
      c.emissive = new THREE.Color(emissive);
      c.emissiveIntensity = intensity;
      c.toneMapped = false;
      out.push(c);
      return c;
    });
    o.material = Array.isArray(o.material) ? next : next[0];
  });
  return out;
}

function lamp(color, keep = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color }));
  m.userData.keep = keep;
  return m;
}

export class CarLights {
  constructor(holder) {
    this.holder = holder;
    this.heads = [lamp(0xfff6dc), lamp(0xfff6dc)];
    this.tails = [lamp(0x8a0d0d), lamp(0x8a0d0d)];
    this.spots = [];
    for (let i = 0; i < 2; i++) {
      const s = new THREE.SpotLight(
        HEADLIGHT.color, HEADLIGHT.intensity, HEADLIGHT.distance,
        HEADLIGHT.angle, HEADLIGHT.penumbra, HEADLIGHT.decay
      );
      s.castShadow = true;
      s.shadow.mapSize.set(HEADLIGHT.shadowMapSize, HEADLIGHT.shadowMapSize);
      s.shadow.camera.near = 0.5;
      s.shadow.camera.far = HEADLIGHT.shadowFar;
      s.shadow.bias = -0.0004;
      holder.add(s, s.target);
      this.spots.push(s);
    }
    holder.add(...this.heads, ...this.tails);
    this._braking = null;
    this.fit({ min: new THREE.Vector3(-0.9, 0, -1.8), max: new THREE.Vector3(0.9, 1.1, 1.8) });
  }

  /**
   * Re-places everything for a newly loaded model. If the model has its own
   * lamp materials they are made to glow and the fallback lamp boxes are
   * hidden (they used to stick out in front of the new cars).
   */
  fit({ min, max }, model = null) {
    const hw = (max.x - min.x) / 2, cx = (min.x + max.x) / 2, h = max.y - min.y;
    const y = min.y + h * 0.32, x = hw * 0.62;
    this._headMats = glowMaterials(model, /head/i, 0xfff2d0, 2.2);
    this._tailMats = glowMaterials(model, /tail|brake/i, 0xff1a1a, 0.7);
    // any real model brings its own lamps (textured ones like the Supercar
    // have them painted on), so the boxes are only for the placeholder car
    const boxes = !model;
    [...this.heads, ...this.tails].forEach((m) => { m.visible = boxes; });
    this._braking = null;
    [-1, 1].forEach((side, i) => {
      const px = cx + side * x;
      this.heads[i].position.set(px, y, max.z + 0.02);
      this.heads[i].scale.set(hw * 0.28, h * 0.09, 0.06);
      this.tails[i].position.set(px, y + h * 0.03, min.z - 0.02);
      this.tails[i].scale.set(hw * 0.3, h * 0.08, 0.06);
      this.spots[i].position.set(px, y, max.z - 0.1);
      this.spots[i].target.position.set(cx + side * x * 0.4, 0.2, max.z + 24);
    });
  }

  update(dt, { braking = false } = {}) {
    if (braking === this._braking) return;
    this._braking = braking;
    const c = braking ? 0xff2a2a : 0x8a0d0d;
    this.tails.forEach((t) => t.material.color.setHex(c));
    for (const m of this._tailMats || []) m.emissiveIntensity = braking ? 3.2 : 0.7;
  }
}

export class PoliceLights {
  constructor(holder) {
    this.t = 0;
    this.red = new THREE.PointLight(0xff2020, 0, POLICE.distance, 2);
    this.blue = new THREE.PointLight(0x2050ff, 0, POLICE.distance, 2);
    this.redLamp = lamp(0xff2222);
    this.blueLamp = lamp(0x2255ff);
    holder.add(this.red, this.blue, this.redLamp, this.blueLamp);
    this.fit({ min: new THREE.Vector3(-0.9, 0, -1.9), max: new THREE.Vector3(0.9, 1.3, 1.9) });
  }

  fit({ min, max }, model = null) {
    const hw = (max.x - min.x) / 2, cx = (min.x + max.x) / 2;
    const cz = (min.z + max.z) / 2 - 0.1, top = max.y;
    // the Quaternius police car has its own lightbar (BlueLights + WhiteLights):
    // flash those instead of stacking our boxes on top of it
    this._blueMats = glowMaterials(model, /blue.?light/i, 0x2a55ff, 0);
    this._redMats = glowMaterials(model, /(white|red).?light/i, 0xff2020, 0);
    const own = this._blueMats.length > 0;
    this.redLamp.visible = this.blueLamp.visible = !own;
    const dx = hw * 0.3;
    this.red.position.set(cx - dx, top + 0.3, cz);
    this.blue.position.set(cx + dx, top + 0.3, cz);
    this.redLamp.position.set(cx - dx, top + 0.02, cz);
    this.blueLamp.position.set(cx + dx, top + 0.02, cz);
    this.redLamp.scale.set(hw * 0.3, 0.1, 0.18);
    this.blueLamp.scale.copy(this.redLamp.scale);
  }

  /** handlerState is HandlerAI's state string. */
  update(dt, handlerState) {
    const fast = ['TELEGRAPH', 'SLAM', 'PIT', 'SHUNT', 'PIN', 'SHOOT', 'DRONE'].includes(handlerState);
    this.t += dt * (fast ? POLICE.fastHz : POLICE.slowHz);
    const p = this.t % 1;
    // double flash each side, like a real lightbar
    const redOn = p < 0.2 || (p >= 0.3 && p < 0.5);
    const blueOn = (p >= 0.5 && p < 0.7) || p >= 0.8;
    const power = fast ? POLICE.telegraphIntensity : POLICE.intensity;
    this.red.intensity = redOn ? power : 0;
    this.blue.intensity = blueOn ? power : 0;
    this.redLamp.material.color.setHex(redOn ? 0xff3030 : 0x2a0808);
    this.blueLamp.material.color.setHex(blueOn ? 0x3060ff : 0x08102a);
    for (const m of this._redMats || []) { m.emissiveIntensity = redOn ? 4 : 0; m.color.setHex(redOn ? 0xff6060 : 0x553333); }
    for (const m of this._blueMats || []) m.emissiveIntensity = blueOn ? 4 : 0;
  }
}
