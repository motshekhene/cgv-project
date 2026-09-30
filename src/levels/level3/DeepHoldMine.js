import * as THREE from 'three';
import { createLavaMaterial } from '../../shaders/lava.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));

function makeStoneMaterial(map, normalMap, roughnessMap, color = 0x77716a) {
  return new THREE.MeshStandardMaterial({
    color,
    map: map || null,
    normalMap: normalMap || null,
    roughnessMap: roughnessMap || null,
    roughness: 0.96,
    metalness: 0.015,
  });
}

function makeSlabGeometry(width, depth, thickness, seed) {
  const points = [
    [-width * 0.48, -depth * 0.48],
    [-width * 0.2, -depth * 0.52],
    [width * 0.22, -depth * 0.49],
    [width * 0.49, -depth * 0.44],
    [width * 0.52, -depth * 0.12],
    [width * 0.48, depth * 0.27],
    [width * 0.44, depth * 0.5],
    [width * 0.08, depth * 0.53],
    [-width * 0.31, depth * 0.49],
    [-width * 0.51, depth * 0.36],
    [-width * 0.53, depth * 0.04],
    [-width * 0.49, -depth * 0.28],
  ];
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => {
    const n = 1 + Math.sin((i + 1) * (seed + 2.7)) * 0.018;
    if (i === 0) shape.moveTo(x * n, y * n);
    else shape.lineTo(x * n, y * n);
  });
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.12,
    bevelThickness: 0.1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -thickness - 0.1, 0);
  geometry.computeVertexNormals();
  return geometry;
}

function makeRadialTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 48, 2, 32, 48, 46);
  grad.addColorStop(0, 'rgba(220,225,224,.42)');
  grad.addColorStop(0.5, 'rgba(205,210,207,.2)');
  grad.addColorStop(1, 'rgba(180,185,183,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 96);
  const image = ctx.getImageData(0, 0, 64, 96);
  for (let i = 0; i < image.data.length; i += 4) {
    const grain = (Math.random() - 0.5) * 14;
    image.data[i] = Math.max(0, Math.min(255, image.data[i] + grain));
    image.data[i + 1] = Math.max(0, Math.min(255, image.data[i + 1] + grain));
    image.data[i + 2] = Math.max(0, Math.min(255, image.data[i + 2] + grain));
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class DeepHoldMine {
  constructor(parent, {
    rockModel = null,
    cliffModel = null,
    boulderModel = null,
    rockColor = null,
    rockNormal = null,
    rockRoughness = null,
    lavaColor = null,
    lavaEmission = null,
  } = {}) {
    this.root = new THREE.Group();
    this.root.name = 'deephold-mine';
    parent.add(this.root);
    this.rockModel = rockModel?.scene || null;
    this.cliffModel = cliffModel?.scene || null;
    this.boulderModel = boulderModel?.scene || null;
    this.colliders = [];
    this.vents = [];
    this.racks = [];
    this.lanterns = [];
    this.fissureLava = [];
    this.fissureMask = [];
    this.ledges = [];
    this.time = 0;
    this.collapse = 0;
    this.dropUsed = false;
    this.dropState = null;
    this.steamTexture = makeRadialTexture();

    const floorMap = rockColor?.clone() || null;
    const wallMap = rockColor?.clone() || null;
    const floorNormal = rockNormal?.clone() || null;
    const wallNormal = rockNormal?.clone() || null;
    const floorRoughness = rockRoughness?.clone() || null;
    const wallRoughness = rockRoughness?.clone() || null;
    for (const [map, x, y] of [
      [floorMap, 7, 5], [wallMap, 4, 2], [floorNormal, 7, 5], [wallNormal, 4, 2],
      [floorRoughness, 7, 5], [wallRoughness, 4, 2],
    ]) {
      if (!map) continue;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(x, y);
      if (map === floorNormal || map === wallNormal || map === floorRoughness || map === wallRoughness) {
        map.colorSpace = THREE.NoColorSpace;
      }
      map.needsUpdate = true;
    }
    this.floorMaterial = makeStoneMaterial(floorMap, floorNormal, floorRoughness, 0x706a62);
    this.wallMaterial = makeStoneMaterial(wallMap, wallNormal, wallRoughness, 0x514941);
    this.woodMaterial = new THREE.MeshStandardMaterial({ color: 0x49372a, roughness: 0.92 });
    this.metalMaterial = new THREE.MeshStandardMaterial({ color: 0x292b29, metalness: 0.55, roughness: 0.65 });
    this.rubberMaterial = new THREE.MeshStandardMaterial({ color: 0x171715, roughness: 0.98 });

    const hotColor = lavaColor?.clone() || null;
    const hotEmission = lavaEmission?.clone() || null;
    this.lavaMaterial = hotColor && hotEmission
      ? createLavaMaterial({ color: hotColor, emission: hotEmission, repeat: 5, glow: 0.75, tint: 0xff5820 })
      : new THREE.MeshBasicMaterial({ color: 0x9a3617 });

    this._buildLighting();
    this._buildCavernShell();
    this._buildFloor();
    this._buildFissures();
    this._buildTimbers();
    this._buildServers();
    this._buildRailAndCart();
    this._buildVents();
    this._buildRockfallWinch();
    this._buildSignage();
    this._buildRockWalls();
    this._buildCaveDust();
  }

  _buildLighting() {
    this.root.add(new THREE.HemisphereLight(0x82705c, 0x241a13, 0.7));
    const ambient = new THREE.AmbientLight(0x887965, 0.32);
    this.root.add(ambient);

    // A soft entrance-side fill lets players read faces, hands and footwork
    // while the caged lamps and geothermal seams keep the chamber warm.
    const entranceFill = new THREE.DirectionalLight(0xa7b0b3, 0.58);
    entranceFill.position.set(-4, 8, 7);
    entranceFill.target.position.set(0, 1, 0);
    this.root.add(entranceFill, entranceFill.target);

    this.lavaLight = new THREE.PointLight(0xff5922, 21, 13, 2);
    this.lavaLight.position.set(3.2, -0.1, 0.4);
    this.root.add(this.lavaLight);
    this.fissureLight = new THREE.PointLight(0xff4920, 4, 5, 2);
    this.fissureLight.position.set(4.0, 0.05, -2.7);
    this.root.add(this.fissureLight);
    this.wallLight = new THREE.PointLight(0xff6328, 15, 12, 2);
    this.wallLight.position.set(-1, 2.7, -8.2);
    this.root.add(this.wallLight);
  }

  _buildCavernShell() {
    // A low, closed rock dome keeps the chamber underground from every camera angle.
    const geometry = new THREE.SphereGeometry(1, 80, 52, 0, Math.PI * 2, 0, Math.PI / 2.04);
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      // Several spatial frequencies deform the actual wall silhouette. The
      // old two-percent ripple left the cave reading as a smooth planet dome.
      const rough = 1
        + 0.078 * Math.sin(x * 17 + z * 13) * Math.cos(y * 12 - z * 6)
        + 0.041 * Math.sin(y * 31 - x * 23 + z * 9)
        + 0.022 * Math.cos(z * 57 + y * 39 + x * 18);
      p.setXYZ(i, x * rough * 18.5, y * rough * 12.5, z * rough * 16.6);
    }
    geometry.computeVertexNormals();
    const shell = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: 0x49413a,
      map: this.wallMaterial.map,
      normalMap: this.wallMaterial.normalMap,
      roughnessMap: this.wallMaterial.roughnessMap,
      bumpMap: this.wallMaterial.map,
      bumpScale: 0.06,
      roughness: 1,
      side: THREE.BackSide,
    }));
    shell.name = 'rough-rock-ceiling';
    shell.position.y = -0.45;
    shell.receiveShadow = true;
    this.root.add(shell);
  }

  _buildFloor() {
    // A deep, hot void waits below the stone. It only becomes visible as the
    // arena slabs split and drop away during the last phase.
    this.collapseBasin = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 24),
      this.lavaMaterial,
    );
    this.collapseBasin.rotation.x = -Math.PI / 2;
    this.collapseBasin.position.y = -2.25;
    this.collapseBasin.name = 'lava-below-collapsing-floor';
    this.root.add(this.collapseBasin);

    const centre = new THREE.Mesh(makeSlabGeometry(16.8, 15.4, 1.45, 3), this.floorMaterial);
    centre.name = 'central-mine-floor';
    centre.receiveShadow = true;
    this.root.add(centre);
    this.centreFloor = centre;

    const shelves = [
      { kind: 'side', side: -1, x: -10.45, z: 0, w: 4.2, d: 15.4, seed: 5 },
      { kind: 'side', side: 1, x: 10.45, z: 0, w: 4.2, d: 15.4, seed: 7 },
      { kind: 'end', side: -1, x: 0, z: -8.65, w: 23.2, d: 2.65, seed: 9 },
      { kind: 'end', side: 1, x: 0, z: 8.65, w: 23.2, d: 2.65, seed: 11 },
    ];
    for (const item of shelves) {
      const group = new THREE.Group();
      group.name = `collapsing-${item.kind}-ledge`;
      group.position.set(item.x, 0, item.z);
      const slab = new THREE.Mesh(makeSlabGeometry(item.w, item.d, 1.5, item.seed), this.floorMaterial);
      slab.receiveShadow = true;
      group.add(slab);
      this.root.add(group);
      this.ledges.push({ ...item, group, base: group.position.clone() });
    }
  }

  _makeFissure(width, length, x, z, yaw = 0) {
    // Jagged, wandering seams sit in the rock instead of tracing a symmetric
    // arena outline. The narrow axis remains local X so the third-phase
    // collapse can widen each crack without stretching its length.
    const makeGeometry = (crackWidth, seed) => {
      const geometry = new THREE.PlaneGeometry(crackWidth, length, 2, 48);
      const vertices = geometry.attributes.position;
      for (let i = 0; i < vertices.count; i++) {
        const px = vertices.getX(i);
        const py = vertices.getY(i);
        const t = py / length + 0.5;
        const drift = Math.sin(t * 14 + seed) * crackWidth * 0.32
          + Math.sin(t * 31 + seed * 1.9) * crackWidth * 0.12;
        const half = crackWidth * (0.36 + 0.19 * Math.sin(t * 19 + seed * 0.7));
        const side = Math.sign(px);
        vertices.setX(i, drift + side * half * (Math.abs(px) / (crackWidth * 0.5)));
      }
      geometry.computeVertexNormals();
      return geometry;
    };
    const dark = new THREE.Mesh(
      makeGeometry(width * 1.8, x + z),
      new THREE.MeshBasicMaterial({ color: 0x110e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    dark.rotation.set(-Math.PI / 2, yaw, 0);
    dark.position.set(x, -0.075, z);
    dark.renderOrder = 3;
    this.root.add(dark);

    const hot = new THREE.Mesh(makeGeometry(width, x - z), this.lavaMaterial);
    hot.rotation.set(-Math.PI / 2, yaw, 0);
    hot.position.set(x, -0.095, z);
    hot.renderOrder = 1;
    this.root.add(hot);
    const core = new THREE.Mesh(
      makeGeometry(width * 0.68, z - x),
      new THREE.MeshBasicMaterial({
        color: 0xff3d12,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    core.rotation.set(-Math.PI / 2, yaw, 0);
    core.position.set(x, -0.055, z);
    core.renderOrder = 4;
    this.root.add(core);
    this.fissureLava.push({ mesh: hot, mask: dark, core, axis: 'x' });
    this.fissureMask.push(dark);
    return hot;
  }

  _buildFissures() {
    this._makeFissure(0.32, 10.6, -8.0, -0.15, 0.1);
    this._makeFissure(0.31, 8.4, 8.05, 2.1, -0.13);
    this._makeFissure(0.58, 6.3, 4.0, -2.7, 0.7);
    this._makeFissure(0.22, 7.8, 3.0, 5.3, -0.47);
  }

  _beam(a, b, radius, material = this.woodMaterial, parent = this.root) {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const direction = end.clone().sub(start);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.82, radius, direction.length(), 8), material);
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  _buildTimbers() {
    for (const z of [-6.1, -1.7, 2.7, 6.8]) {
      this._beam([-10.1, 0.15, z], [-10.1, 4.55, z], 0.21);
      this._beam([10.1, 0.15, z], [10.1, 4.55, z], 0.21);
      this._beam([-10.1, 4.55, z], [10.1, 4.55, z], 0.23);
      this._beam([-10.1, 0.15, z], [-7.2, 5.1, z], 0.16);
      this._beam([10.1, 0.15, z], [7.2, 5.1, z], 0.16);
      this._beam([-7.2, 5.1, z], [7.2, 5.1, z], 0.18);
      this.colliders.push({ x: -10.1, z, radius: 0.34 }, { x: 10.1, z, radius: 0.34 });
    }

    for (const z of [-5.7, -0.9, 4.5]) {
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.15, 6), this.metalMaterial);
      chain.position.set(0, 4.65, z);
      this.root.add(chain);
      const cage = new THREE.Group();
      cage.position.set(0, 3.95, z);
      this.root.add(cage);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({
        color: 0xd98a48, emissive: 0x9d4818, emissiveIntensity: 0.75, roughness: 0.55,
      }));
      cage.add(bulb);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.55, 5), this.metalMaterial);
        bar.position.set(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12);
        cage.add(bar);
      }
      const light = new THREE.PointLight(0xffb16b, 13, 11, 2);
      light.position.set(0, -0.1, 0);
      cage.add(light);
      this.lanterns.push({ bulb, light, seed: z });
    }
  }

  _buildServers() {
    const leds = [0x547e83, 0xb47747, 0x5e7869, 0x52667a];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const z = -4.3 + i * 4.15;
        const group = new THREE.Group();
        group.name = 'wall-mounted-server-monolith';
      group.position.set(side * 9.45, 1.6, z);
        group.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        this.root.add(group);

        const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.05, 3.05, 0.86), this.metalMaterial);
        cabinet.castShadow = true;
        cabinet.receiveShadow = true;
        group.add(cabinet);
        const front = new THREE.Mesh(new THREE.BoxGeometry(0.93, 2.91, 0.06), new THREE.MeshStandardMaterial({
          color: 0x111413, metalness: 0.48, roughness: 0.7,
        }));
        front.position.z = 0.46;
        group.add(front);
        for (let row = 0; row < 7; row++) {
          const y = 1.15 - row * 0.38;
          const tray = new THREE.Mesh(new THREE.BoxGeometry(0.73, 0.18, 0.08), new THREE.MeshStandardMaterial({
            color: row % 3 === 0 ? 0x292e2d : 0x202423,
            metalness: 0.38,
            roughness: 0.76,
          }));
          tray.position.set(-0.02, y, 0.52);
          group.add(tray);
          for (let led = 0; led < 2; led++) {
            const color = leds[(row + i + led) % leds.length];
            const dot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), new THREE.MeshBasicMaterial({ color }));
            dot.position.set(0.28 + led * 0.12, y, 0.57);
            group.add(dot);
          }
          const vents = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.018, 0.01), this.rubberMaterial);
          vents.position.set(-0.2, y, 0.57);
          group.add(vents);
        }
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 7), this.rubberMaterial);
        cable.position.set(-0.35, 2.2, -0.1);
        group.add(cable);
        this.racks.push(group);
        this.colliders.push({ x: side * 9.45, z, radius: 0.82 });
      }
    }
  }

  _buildRailAndCart() {
    for (const x of [-4.55, -3.45]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 13.6, 8), this.metalMaterial);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(x, 0.11, -0.6);
      rail.castShadow = true;
      this.root.add(rail);
    }
    for (let i = 0; i < 12; i++) {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 0.24), this.woodMaterial);
      tie.position.set(-4.0, -0.02, 5.8 - i * 1.1);
      tie.rotation.y = (i % 2 ? 1 : -1) * 0.015;
      this.root.add(tie);
    }

    const cart = new THREE.Group();
    cart.name = 'abandoned-mine-cart';
    cart.position.set(-4.0, 0.36, -1.2);
    this.root.add(cart);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.55, 1.35), this.metalMaterial);
    bed.position.y = 0.36;
    cart.add(bed);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.16, 1.45), this.woodMaterial);
    lip.position.y = 0.68;
    cart.add(lip);
    const ore = this._boulderClone(0.55) || this._rockClone(0.5);
    if (ore) {
      ore.position.set(0.15, 0.7, -0.1);
      ore.rotation.y = 0.5;
      cart.add(ore);
    }
    for (const x of [-0.64, 0.64]) {
      for (const z of [-0.46, 0.46]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.16, 12), this.metalMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.05, z);
        cart.add(wheel);
      }
    }
    this.colliders.push({ x: -4.0, z: -1.2, radius: 1.25 });
  }

  _buildValve(x, z, side) {
    const group = new THREE.Group();
    group.name = 'steam-pressure-valve';
    group.position.set(x, 0, z);
    this.root.add(group);

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.58, 0.52), this.metalMaterial);
    base.position.y = 0.29;
    base.castShadow = true;
    group.add(base);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.95, 10), this.metalMaterial);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(side * 0.38, 0.72, 0);
    group.add(pipe);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.36, 8), this.metalMaterial);
    stem.position.set(-side * 0.16, 0.75, 0);
    group.add(stem);
    const wheel = new THREE.Group();
    wheel.position.set(-side * 0.16, 0.96, 0);
    wheel.rotation.z = Math.PI / 2;
    group.add(wheel);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.035, 7, 16), this.metalMaterial);
    wheel.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 8), this.metalMaterial);
    hub.rotation.z = Math.PI / 2;
    wheel.add(hub);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.43, 5), this.metalMaterial);
      spoke.position.set(0, Math.cos(a) * 0.13, Math.sin(a) * 0.13);
      spoke.rotation.x = a;
      wheel.add(spoke);
    }
    const puffs = [];
    for (let i = 0; i < 14; i++) {
      const puff = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.steamTexture,
        color: 0x9daba8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }));
      puff.visible = false;
      group.add(puff);
      puffs.push({ sprite: puff, velocity: new THREE.Vector3(), life: 0, seed: i });
    }
    const light = new THREE.PointLight(0xff7b39, 4, 5, 2);
    light.position.set(0, 0.22, 0);
    group.add(light);

    const vent = { group, wheel, puffs, light, position: new THREE.Vector3(x, 0, z), timer: 0, cooldown: 0 };
    this.vents.push(vent);
    this.colliders.push({ x, z, radius: 0.53 });
  }

  _buildVents() {
    this._buildValve(-6.85, 0.4, -1);
    this._buildValve(6.85, 0.4, 1);
  }

  _buildRockfallWinch() {
    const winch = new THREE.Group();
    winch.name = 'rockfall-release-winch';
    winch.position.set(6.6, 0, -5.7);
    this.root.add(winch);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.55, 0.72), this.woodMaterial);
    post.position.y = 0.78;
    post.castShadow = true;
    winch.add(post);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.66, 12), this.metalMaterial);
    drum.rotation.z = Math.PI / 2;
    drum.position.set(-0.2, 1.34, 0);
    winch.add(drum);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 7), this.metalMaterial);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(0.15, 1.34, 0);
    winch.add(arm);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.18, 8), this.woodMaterial);
    handle.position.set(0.7, 1.34, 0);
    winch.add(handle);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 5.3, 6), this.metalMaterial);
    cable.position.set(0, 4.1, 0);
    winch.add(cable);
    this.winch = winch;
    this.winchHandle = arm;
    this.winchPosition = new THREE.Vector3(6.6, 0, -5.7);
    this.colliders.push({ x: 6.6, z: -5.7, radius: 0.65 });

    this.dropRock = this._boulderClone(1.6) || this._rockClone(0.72);
    if (!this.dropRock) {
      this.dropRock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85, 1), this.wallMaterial);
    }
    this.dropRock.name = 'released-ceiling-rock';
    this.dropRock.visible = false;
    this.dropRock.castShadow = true;
    this.dropRock.receiveShadow = true;
    this.root.add(this.dropRock);
  }

  _buildSignage() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#131412';
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#c8844f';
    ctx.fillRect(0, 0, 14, 256);
    ctx.strokeStyle = '#81735c';
    ctx.lineWidth = 5;
    ctx.strokeRect(19, 18, 475, 220);
    ctx.fillStyle = '#e3d7c6';
    ctx.font = 'bold 46px Arial';
    ctx.fillText('SHAFT 07', 42, 84);
    ctx.fillStyle = '#d18650';
    ctx.font = 'bold 29px Arial';
    ctx.fillText('DECOMMISSIONED', 42, 133);
    ctx.fillStyle = '#c1b7a6';
    ctx.font = '24px Arial';
    ctx.fillText('900 m  /  DO NOT DESCEND', 42, 187);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicMaterial({ map: texture }));
    panel.position.set(0, 4.9, -7.15);
    panel.castShadow = false;
    this.root.add(panel);
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.55, 0.14), this.metalMaterial);
    board.position.set(0, 4.9, -7.24);
    this.root.add(board);
    panel.position.z = -7.15;
    panel.renderOrder = 1;
  }

  _rockClone(scale = 1) {
    const clone = this._cloneRockSource(this.rockModel, scale);
    return clone;
  }

  _cloneRockSource(source, scale = 1) {
    if (!source) return null;
    const clone = source.clone(true);
    clone.scale.setScalar(scale);
    clone.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    return clone;
  }

  _boulderClone(diameter = 1.4) {
    if (!this.boulderModel) return null;
    this.boulderModel.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(this.boulderModel);
    const size = bounds.getSize(new THREE.Vector3());
    const sourceDiameter = Math.max(size.x, size.y, size.z, 0.001);
    return this._cloneRockSource(this.boulderModel, diameter / sourceDiameter);
  }

  _buildRockWalls() {
    // One photogrammetry cliff fills the back of the chamber. Separate, truly
    // rounded boulders interrupt the walls and sit among the mine supports;
    // this removes the repeated row of identical layered cliff cut-outs.
    if (this.cliffModel) {
      const cliff = this._cloneRockSource(this.cliffModel, 0.82);
      cliff.name = 'mountainside-photogrammetry-wall';
      cliff.position.set(0, 0, -12.6);
      cliff.rotation.y = Math.PI;
      cliff.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(cliff);
      cliff.position.y -= bounds.min.y;
      this.root.add(cliff);

      const shoulder = this._cloneRockSource(this.cliffModel, 0.7);
      shoulder.name = 'mountainside-broken-wall-shoulder';
      shoulder.position.set(-6.2, 0, -11.7);
      shoulder.rotation.y = Math.PI + 0.64;
      shoulder.rotation.z = -0.08;
      shoulder.updateMatrixWorld(true);
      const shoulderBounds = new THREE.Box3().setFromObject(shoulder);
      shoulder.position.y -= shoulderBounds.min.y;
      this.root.add(shoulder);
    }

    const placements = [
      [-5.9, -0.18, -7.45, 1.85, -0.42], [-4.05, -0.12, -8.25, 1.32, 0.83],
      [5.45, -0.15, -7.5, 2.05, -1.1], [3.95, -0.1, -8.5, 1.4, 0.76],
      [-8.55, -0.12, 7.1, 2.15, -0.45], [8.7, -0.18, 7.55, 1.85, 1.2],
      [-9.0, -0.1, -5.6, 1.6, 0.48], [9.1, -0.15, -6.0, 1.72, -0.7],
    ];
    for (const [x, y, z, diameter, yaw] of placements) {
      const rock = this._boulderClone(diameter) || this._rockClone(diameter * 0.7);
      if (!rock) {
        const fallback = new THREE.Mesh(new THREE.DodecahedronGeometry(diameter * 0.5, 2), this.wallMaterial);
        fallback.position.set(x, y + diameter * 0.3, z);
        fallback.scale.set(1.1, 0.78, 0.96);
        fallback.rotation.y = yaw;
        fallback.castShadow = true;
        fallback.receiveShadow = true;
        this.root.add(fallback);
      } else {
        rock.position.set(x, y, z);
        rock.rotation.set(0.08 * Math.sin(z), yaw, 0.05 * Math.cos(x));
        rock.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(rock);
        rock.position.y -= bounds.min.y - y;
        this.root.add(rock);
      }
      this.colliders.push({ x, z, radius: diameter * 0.53 });
    }
  }

  _buildCaveDust() {
    const count = 80;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions.set([
        (Math.random() - 0.5) * 20,
        0.5 + Math.random() * 6,
        (Math.random() - 0.5) * 16,
      ], i * 3);
      speeds[i] = 0.08 + Math.random() * 0.16;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({
      color: 0xb0987f,
      size: 0.035,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
    }));
    points.name = 'cave-dust';
    this.root.add(points);
    this.dust = points;
    this.dustSpeeds = speeds;
  }

  findInteraction(position) {
    let best = null;
    const check = (kind, source, name, detail, maxDistance) => {
      const d = position.distanceTo(source.position);
      if (d <= maxDistance && (!best || d < best.distance)) best = { kind, source, name, detail, distance: d };
    };
    for (const vent of this.vents) {
      if (vent.cooldown <= 0) check('valve', vent, 'TURN THE VALVE', 'VENT STEAM AT THE HANDLER', 2.35);
    }
    if (!this.dropUsed) check('rockfall', { position: this.winchPosition }, 'PULL THE RELEASE', 'DROP ROCK ON THE HANDLER', 2.45);
    return best;
  }

  activate(interaction, targetPosition) {
    if (!interaction) return null;
    if (interaction.kind === 'valve') {
      const vent = interaction.source;
      if (vent.cooldown > 0) return null;
      vent.cooldown = 17;
      vent.timer = 2.7;
      vent.wheel.rotation.x += Math.PI * 2;
      for (const puff of vent.puffs) {
        puff.life = 0.75 + Math.random() * 0.85;
        puff.sprite.visible = true;
        puff.sprite.position.set(
          (Math.random() - 0.5) * 0.3,
          1.0 + Math.random() * 0.35,
          (Math.random() - 0.5) * 0.3,
        );
        puff.sprite.scale.set(0.7, 1.0, 1);
        puff.sprite.material.opacity = 0.3;
        puff.velocity.set((Math.random() - 0.5) * 0.45, 1.0 + Math.random() * 0.55, (Math.random() - 0.5) * 0.45);
      }
      return { type: 'steam', position: vent.position.clone(), radius: 3.4 };
    }
    if (interaction.kind === 'rockfall' && !this.dropUsed) {
      this.dropUsed = true;
      this.dropRock.visible = true;
      this.dropRock.position.set(targetPosition.x, 7.8, targetPosition.z);
      this.dropRock.rotation.set(Math.random() * 0.25, Math.random() * Math.PI, Math.random() * 0.2);
      this.dropState = { velocity: 0, target: new THREE.Vector3(targetPosition.x, 0, targetPosition.z) };
      this.winchHandle.rotation.z += Math.PI * 1.4;
      return { type: 'rockfall-start' };
    }
    return null;
  }

  setCollapse(progress) {
    const t = clamp01(progress);
    this.collapse = t;
    const eased = t * t * (3 - 2 * t);
    // The safe middle becomes a visibly smaller stone island while the outer
    // slabs peel out of its rim and disappear below the fissure.
    this.centreFloor.scale.set(1 - 0.15 * eased, 1, 1 - 0.18 * eased);
    for (const ledge of this.ledges) {
      const amount = ledge.kind === 'side' ? 3.05 : 2.5;
      ledge.group.position.copy(ledge.base);
      ledge.group.position.x += ledge.kind === 'side' ? ledge.side * amount * eased : 0;
      ledge.group.position.z += ledge.kind === 'end' ? ledge.side * amount * eased : 0;
      ledge.group.position.y = -3.35 * eased;
      if (ledge.kind === 'side') ledge.group.rotation.z = -ledge.side * 0.09 * eased;
      else ledge.group.rotation.x = ledge.side * 0.085 * eased;
    }
    for (const crack of this.fissureLava) {
      const widthScale = 1 + eased * 3.4;
      crack.mesh.scale[crack.axis] = widthScale;
      crack.mask.scale[crack.axis] = widthScale;
      crack.core.scale[crack.axis] = widthScale;
    }
    this.lavaLight.intensity = 18 + eased * 13;
    this.wallLight.intensity = 13 + eased * 8;
  }

  update(dt, time) {
    this.time = time;
    if (this.lavaMaterial.uniforms?.uTime) this.lavaMaterial.uniforms.uTime.value = time;
    this.lavaLight.intensity = (18 + this.collapse * 13) + Math.sin(time * 1.8) * 1.7;
    this.wallLight.intensity = (13 + this.collapse * 8) + Math.sin(time * 1.2 + 0.8) * 1.1;
    for (const { bulb, light, seed } of this.lanterns) {
      const flicker = 0.92 + 0.045 * Math.sin(time * 6.4 + seed) + 0.025 * Math.sin(time * 14.2 + seed * 2);
      light.intensity = 9.2 * flicker;
      bulb.material.emissiveIntensity = 0.72 * flicker;
    }

    for (const vent of this.vents) {
      vent.cooldown = Math.max(0, vent.cooldown - dt);
      vent.timer = Math.max(0, vent.timer - dt);
      vent.light.intensity = vent.timer > 0 ? 2.5 : 0;
      for (const puff of vent.puffs) {
        if (!puff.sprite.visible) continue;
        puff.life -= dt;
        puff.sprite.position.addScaledVector(puff.velocity, dt);
        puff.sprite.scale.x += dt * 0.26;
        puff.sprite.scale.y += dt * 0.36;
        puff.sprite.material.opacity = Math.max(0, Math.min(0.3, puff.life * 0.24));
        if (puff.life <= 0) puff.sprite.visible = false;
      }
    }

    const position = this.dust.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i) + this.dustSpeeds[i] * dt;
      position.setY(i, y > 7 ? 0.2 : y);
      position.setX(i, position.getX(i) + Math.sin(time * 0.45 + i) * 0.006);
    }
    position.needsUpdate = true;

    if (this.dropState) {
      this.dropState.velocity += 25 * dt;
      this.dropRock.position.y -= this.dropState.velocity * dt;
      this.dropRock.rotation.x += dt * 1.8;
      this.dropRock.rotation.z += dt * 1.3;
      if (this.dropRock.position.y <= 0.45) {
        this.dropRock.position.y = 0.45;
        this.dropState = null;
        return { type: 'rockfall-impact', position: this.dropRock.position.clone() };
      }
    }
    return null;
  }
}
