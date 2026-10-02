import * as THREE from "three";

/**
 * MODEL BUILDERS — detailed multi-part 3D assemblies for Level 01 props.
 *
 * Each builder returns a THREE.Group made of multiple meshes composed together
 * so the result reads as a recognizable object rather than a flat box. When
 * real .glb files arrive from Blender, swap the builder call for an
 * assets.model() load — the group hierarchy and userData stay the same.
 *
 * PBR textures from Poly Haven / ambientCG drop into the material slots:
 * pass loaded textures as the `textures` option to each builder.
 */

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function mat(color, { roughness = 0.7, metalness = 0.1, emissive = 0x000000, emissiveIntensity = 0 } = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive,
    emissiveIntensity,
  });
}

function box(w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(rTop, rBot, h, seg, material) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// tunnel segment ( modular chunk — repeat along z to build the tunnel )
// ---------------------------------------------------------------------------

/**
 * A 4 m tunnel chunk: floor + two walls + ceiling + wall panel details.
 * Clone and repeat along z. The walls accept the speed-warp shader material
 * via the `wallMat` option.
 */
export function buildTunnelSegment({ length = 4, wallMat = null, floorMat, ceilingMat, wallPanelMat } = {}) {
  const group = new THREE.Group();
  group.name = "tunnel-segment";

  const halfL = length / 2;

  // floor
  const floor = box(12, 0.4, length, floorMat);
  floor.position.y = -0.2;
  floor.receiveShadow = true;
  group.add(floor);

  // ceiling
  const ceil = box(12.4, 0.3, length, ceilingMat);
  ceil.position.y = 6.9;
  group.add(ceil);

  // walls
  for (const side of [-1, 1]) {
    const wall = box(1, 7, length, wallMat || floorMat);
    wall.position.set(side * 6.2, 3.3, 0);
    wall.receiveShadow = true;
    group.add(wall);

    // wall panels — recessed rectangles that break up the flat surface
    if (wallPanelMat) {
      for (let i = 0; i < 2; i++) {
        const panel = box(0.08, 2.2, length * 0.35, wallPanelMat);
        panel.position.set(side * 5.68, 2.0 + i * 2.8, 0);
        group.add(panel);
      }
    }
  }

  return group;
}

// ---------------------------------------------------------------------------
// platform segment
// ---------------------------------------------------------------------------

export function buildPlatformSegment({ length = 4, platformMat, safetyLineMat } = {}) {
  const group = new THREE.Group();
  group.name = "platform-segment";

  // raised platform
  const platform = box(1.2, 0.5, length, platformMat);
  platform.position.set(-5.3, 0.05, 0);
  platform.receiveShadow = true;
  platform.castShadow = true;
  group.add(platform);

  // safety line — worn yellow strip along the track edge
  if (safetyLineMat) {
    const line = box(0.15, 0.02, length, safetyLineMat);
    line.position.set(-4.72, 0.31, 0);
    group.add(line);
  }

  // platform edge lip
  const lip = box(0.12, 0.5, length, platformMat);
  lip.position.set(-4.68, 0.05, 0);
  group.add(lip);

  return group;
}

// ---------------------------------------------------------------------------
// pipe / duct variation
// ---------------------------------------------------------------------------

export function buildPipeSegment({ length = 4, pipeMat, bracketMat } = {}) {
  const group = new THREE.Group();
  group.name = "pipe-segment";

  // main overhead pipe
  const pipe = cyl(0.15, 0.15, length, 8, pipeMat);
  pipe.rotation.x = Math.PI / 2;
  pipe.position.set(5.5, 5.9, 0);
  pipe.castShadow = true;
  group.add(pipe);

  // secondary smaller pipe
  const pipe2 = cyl(0.08, 0.08, length, 6, pipeMat);
  pipe2.rotation.x = Math.PI / 2;
  pipe2.position.set(5.1, 6.2, 0);
  group.add(pipe2);

  // wall brackets every 2 m
  if (bracketMat) {
    const count = Math.floor(length / 2);
    for (let i = 0; i < count; i++) {
      const z = -length / 2 + 1 + i * 2;
      const bracket = box(0.6, 0.08, 0.08, bracketMat);
      bracket.position.set(5.5, 6.1, z);
      group.add(bracket);

      const vert = box(0.08, 0.4, 0.08, bracketMat);
      vert.position.set(5.8, 5.9, z);
      group.add(vert);
    }
  }

  return group;
}

// ---------------------------------------------------------------------------
// ticket barrier (obstacle)
// ---------------------------------------------------------------------------

/**
 * A subway ticket barrier: two upright posts with a flap gate between them,
 * plus a small card-reader box on top.
 */
export function buildTicketBarrier({ barrierMat } = {}) {
  const group = new THREE.Group();
  group.name = "ticket-barrier";

  const postMat = barrierMat || mat(0x8a9297, { roughness: 0.5, metalness: 0.4 });
  const flapMat = mat(0x5a6268, { roughness: 0.6, metalness: 0.3 });
  const readerMat = mat(0x2a2e32, { roughness: 0.3, metalness: 0.5 });
  const ledMat = mat(0x00ff88, { roughness: 0.2, emissive: 0x00ff88, emissiveIntensity: 0.5 });

  // two upright posts
  for (const side of [-0.4, 0.4]) {
    const post = box(0.08, 1.0, 0.08, postMat);
    post.position.set(side, 0.5, 0);
    group.add(post);

    // post cap
    const cap = box(0.12, 0.04, 0.12, postMat);
    cap.position.set(side, 1.02, 0);
    group.add(cap);
  }

  // flap gate (the part that swings)
  const flap = box(0.7, 0.06, 0.35, flapMat);
  flap.position.set(0, 0.7, 0);
  group.add(flap);

  // card reader box on top
  const reader = box(0.18, 0.12, 0.14, readerMat);
  reader.position.set(0, 1.08, 0);
  group.add(reader);

  // LED indicator
  const led = box(0.04, 0.02, 0.04, ledMat);
  led.position.set(0, 1.15, 0.06);
  group.add(led);

  // base plate
  const base = box(1.0, 0.04, 0.4, postMat);
  base.position.set(0, 0.02, 0);
  group.add(base);

  group.userData.isObstacle = true;
  group.userData.kind = "barrier";
  return group;
}

// ---------------------------------------------------------------------------
// luggage trolley (obstacle)
// ---------------------------------------------------------------------------

/**
 * A subway luggage trolley: a frame on wheels with a handle and a couple of
 * suitcase shapes on it.
 */
export function buildLuggageTrolley({ vehicleMat } = {}) {
  const group = new THREE.Group();
  group.name = "luggage-trolley";

  const frameMat = vehicleMat || mat(0x566269, { roughness: 0.5, metalness: 0.35 });
  const wheelMat = mat(0x1a1a1a, { roughness: 0.9, metalness: 0.1 });
  const suitcaseMat1 = mat(0x3a4a5a, { roughness: 0.7 });
  const suitcaseMat2 = mat(0x5a3a2a, { roughness: 0.65 });
  const handleMat = mat(0x888888, { roughness: 0.4, metalness: 0.6 });

  // base platform
  const base = box(0.9, 0.06, 0.6, frameMat);
  base.position.set(0, 0.22, 0);
  group.add(base);

  // four wheels
  for (const x of [-0.35, 0.35]) {
    for (const z of [-0.22, 0.22]) {
      const wheel = cyl(0.1, 0.1, 0.06, 8, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.1, z);
      group.add(wheel);
    }
  }

  // upright frame / handle post
  const post = box(0.05, 1.8, 0.05, handleMat);
  post.position.set(0, 1.15, -0.25);
  group.add(post);

  // handle bar
  const handle = box(0.6, 0.05, 0.05, handleMat);
  handle.position.set(0, 2.0, -0.25);
  group.add(handle);

  // suitcases stacked on the platform
  const case1 = box(0.5, 0.35, 0.35, suitcaseMat1);
  case1.position.set(-0.05, 0.43, 0.05);
  group.add(case1);

  const case2 = box(0.4, 0.28, 0.3, suitcaseMat2);
  case2.position.set(0.1, 0.65, -0.05);
  case2.rotation.y = 0.15;
  group.add(case2);

  // small bag on top
  const bag = box(0.25, 0.18, 0.2, suitcaseMat1);
  bag.position.set(-0.1, 0.82, 0.08);
  bag.rotation.z = 0.1;
  group.add(bag);

  group.userData.isObstacle = true;
  group.userData.kind = "trolley";
  return group;
}

// ---------------------------------------------------------------------------
// ceiling duct (obstacle)
// ---------------------------------------------------------------------------

/**
 * A ceiling-mounted HVAC duct / cable tray. Full tunnel width, with mounting
 * brackets and a warning-striped face.
 */
export function buildCeilingDuct({ vehicleMat } = {}) {
  const group = new THREE.Group();
  group.name = "ceiling-duct";

  const ductMat = vehicleMat
    ? vehicleMat.clone()
    : mat(0x566269, { roughness: 0.5, metalness: 0.3 });
  ductMat.emissive = new THREE.Color(0xff8a3d);
  ductMat.emissiveIntensity = 0.22;

  const bracketMat = mat(0x444444, { roughness: 0.6, metalness: 0.5 });
  const stripeMat = mat(0xff8a3d, { roughness: 0.5, emissive: 0xff8a3d, emissiveIntensity: 0.3 });

  // main duct body — full tunnel width
  const duct = box(11.8, 1.2, 0.7, ductMat);
  duct.position.set(0, 4.5, 0);
  group.add(duct);

  // top flange
  const flange = box(12.0, 0.08, 0.8, bracketMat);
  flange.position.set(0, 5.12, 0);
  group.add(flange);

  // bottom face with warning stripes
  const face = box(11.8, 0.06, 0.72, stripeMat);
  face.position.set(0, 3.88, 0);
  group.add(face);

  // mounting brackets every 3 m
  for (const x of [-5, -2, 1, 4]) {
    const bracket = box(0.1, 1.8, 0.1, bracketMat);
    bracket.position.set(x, 5.8, 0);
    group.add(bracket);
  }

  // cable runs along the top
  for (const x of [-4, 0, 4]) {
    const cable = cyl(0.04, 0.04, 11.8, 6, bracketMat);
    cable.rotation.z = Math.PI / 2;
    cable.position.set(0, 5.2, x * 0.05);
    group.add(cable);
  }

  group.userData.isObstacle = true;
  group.userData.kind = "duct";
  return group;
}

// ---------------------------------------------------------------------------
// oncoming train (southbound)
// ---------------------------------------------------------------------------

/**
 * A multi-car subway train: proper body shell, roof unit, windows, headlight
 * housings, wheels, undercarriage skirt. The group origin is the NOSE center.
 */
export function buildOncomingTrain({
  cars = 3,
  carLen = 15,
  carGap = 0.8,
  halfX = 1.9,
  vehicleMat,
} = {}) {
  const group = new THREE.Group();
  group.name = "oncoming-train";

  const shellMat = vehicleMat
    ? vehicleMat.clone()
    : mat(0x39434f, { roughness: 0.6, metalness: 0.3 });
  shellMat.color = new THREE.Color(0x39434f);

  const roofMat = mat(0x2a3038, { roughness: 0.7, metalness: 0.2 });
  const glassMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0, fog: false });
  const skirtMat = mat(0x1a1e22, { roughness: 0.8, metalness: 0.2 });
  const wheelMat = mat(0x222222, { roughness: 0.4, metalness: 0.7 });
  const stripeMat = mat(0x6be2ff, { roughness: 0.3, emissive: 0x6be2ff, emissiveIntensity: 0.4 });

  for (let i = 0; i < cars; i++) {
    const zc = -(carLen / 2 + i * (carLen + carGap));
    const carGroup = new THREE.Group();
    carGroup.position.z = zc;

    // main body shell
    const body = box(halfX * 2, 3.0, carLen, shellMat);
    body.position.y = 1.7;
    carGroup.add(body);

    // roof — slightly narrower, rounded look via a thinner box
    const roof = box(halfX * 1.6, 0.25, carLen - 0.4, roofMat);
    roof.position.y = 3.35;
    carGroup.add(roof);

    // roof-mounted AC unit
    const acUnit = box(1.2, 0.2, 2.5, roofMat);
    acUnit.position.set(0, 3.55, 0);
    carGroup.add(acUnit);

    // cyan stripe along the body
    const stripe = box(halfX * 2 + 0.02, 0.12, carLen - 1, stripeMat);
    stripe.position.y = 2.6;
    carGroup.add(stripe);

    // windows on both sides
    const windowCount = Math.floor(carLen / 2.2);
    for (const side of [-1, 1]) {
      for (let w = 0; w < windowCount; w++) {
        const wz = -carLen / 2 + 1.5 + w * 2.2;
        const win = box(0.06, 0.7, 1.4, glassMat);
        win.position.set(side * (halfX + 0.02), 2.3, wz);
        carGroup.add(win);
      }
    }

    // undercarriage skirt
    const skirt = box(halfX * 2 - 0.2, 0.3, carLen - 0.6, skirtMat);
    skirt.position.y = 0.15;
    carGroup.add(skirt);

    // wheels (visible through the skirt gap)
    for (const side of [-1, 1]) {
      for (const wz of [-carLen / 2 + 2, carLen / 2 - 2]) {
        const wheel = cyl(0.25, 0.25, 0.12, 8, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(side * (halfX - 0.2), 0.25, wz);
        carGroup.add(wheel);
      }
    }

    // door outlines (recessed rectangles)
    for (const side of [-1, 1]) {
      for (const dz of [-carLen / 2 + 3.5, carLen / 2 - 3.5]) {
        const door = box(0.04, 2.2, 1.2, skirtMat);
        door.position.set(side * (halfX + 0.01), 1.3, dz);
        carGroup.add(door);
      }
    }

    group.add(carGroup);
  }

  // nose headlamps — on the first car
  for (const off of [-1.5, 1.5]) {
    // lamp housing
    const housing = box(0.6, 0.45, 0.15, shellMat);
    housing.position.set(off, 1.25, 0.08);
    group.add(housing);

    // lamp lens
    const lens = box(0.5, 0.35, 0.06, lampMat);
    lens.position.set(off, 1.25, 0.16);
    group.add(lens);
  }

  // nose coupling / bumper
  const bumper = box(2.4, 0.4, 0.2, skirtMat);
  bumper.position.set(0, 0.4, 0.1);
  group.add(bumper);

  // headlamp point light
  const head = new THREE.PointLight(0xfff2d0, 0, 95, 2);
  head.position.set(0, 1.8, 2.2);
  group.add(head);

  group.userData.isTrain = true;
  group.trainLight = head;
  return group;
}

// ---------------------------------------------------------------------------
// sector seal gate (hero object)
// ---------------------------------------------------------------------------

/**
 * The sector seal gate: a heavy industrial frame with two vertical rails,
 * a motor housing at the top, and horizontal bars that slide down between
 * the rails. The bars live in a child group (`slide`) so the slam animation
 * only moves one y-offset.
 */
export function buildSectorSealGate({ gateMat } = {}) {
  const group = new THREE.Group();
  group.name = "sector-seal-gate";

  const frameMat = gateMat || mat(0xc88434, { roughness: 0.5, metalness: 0.55, emissive: 0x4a2600, emissiveIntensity: 0.6 });
  const railMat = mat(0x555555, { roughness: 0.4, metalness: 0.7 });
  const motorMat = mat(0x3a3a3a, { roughness: 0.5, metalness: 0.6 });
  const housingMat = mat(0x4a4a4a, { roughness: 0.5, metalness: 0.5 });

  // two vertical rails (the tracks the bars slide down)
  for (const side of [-1, 1]) {
    const rail = box(0.12, 7, 0.12, railMat);
    rail.position.set(side * 5.8, 3.5, 0);
    rail.castShadow = true;
    group.add(rail);

    // rail mounting brackets
    for (const y of [1, 3.5, 6]) {
      const bracket = box(0.3, 0.1, 0.2, housingMat);
      bracket.position.set(side * 5.8, y, 0);
      group.add(bracket);
    }
  }

  // top housing — the motor + mechanism the bars retract into
  const housing = box(12.6, 0.8, 0.6, housingMat);
  housing.position.set(0, 6.6, 0);
  housing.castShadow = true;
  group.add(housing);

  // motor box on one side of the housing
  const motor = box(0.8, 0.6, 0.5, motorMat);
  motor.position.set(5.2, 6.9, 0);
  motor.castShadow = true;
  group.add(motor);

  // warning stripes on the housing
  const stripeMat = mat(0xff8a3d, { roughness: 0.5, emissive: 0xff8a3d, emissiveIntensity: 0.3 });
  const stripe = box(12.6, 0.1, 0.62, stripeMat);
  stripe.position.set(0, 6.18, 0);
  group.add(stripe);

  // the bars — in their own sub-group for the slam animation
  const slide = new THREE.Group();
  slide.position.y = 6.9; // starts retracted up

  const barCount = 8;
  for (let i = 0; i < barCount; i++) {
    const bar = box(0.15, 6, 0.15, frameMat);
    bar.position.set(-6.2 + (i / (barCount - 1)) * 12.4, 3, 0);
    bar.castShadow = true;
    slide.add(bar);
  }

  // horizontal cross-bar at the top of the bar assembly
  const crossBar = box(12.4, 0.12, 0.12, frameMat);
  crossBar.position.set(0, 6, 0);
  slide.add(crossBar);

  // bottom rail of the bar assembly (the part that hits the floor)
  const bottomRail = box(12.4, 0.15, 0.18, frameMat);
  bottomRail.position.set(0, 0.08, 0);
  slide.add(bottomRail);

  group.add(slide);

  // amber warning light
  const gateLight = new THREE.PointLight(0xffa63d, 1.4, 30, 2);
  gateLight.position.set(0, 4, 1);
  group.add(gateLight);

  group.userData.isSecurityGate = true;
  group.userData.open = true;
  group.slide = slide;
  group.gateLight = gateLight;
  return group;
}

// ---------------------------------------------------------------------------
// maintenance vehicle
// ---------------------------------------------------------------------------

/**
 * A subway maintenance vehicle / utility truck: cab with windshield, flatbed
 * with tool racks, wheels, and a work light on top.
 */
export function buildMaintenanceVehicle({ vehicleMat } = {}) {
  const group = new THREE.Group();
  group.name = "maintenance-vehicle";

  const bodyMat = vehicleMat || mat(0x566269, { roughness: 0.5, metalness: 0.3 });
  const cabMat = mat(0x4a5660, { roughness: 0.5, metalness: 0.3 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x88bbdd,
    roughness: 0.1,
    metalness: 0.3,
    transparent: true,
    opacity: 0.6,
  });
  const wheelMat = mat(0x1a1a1a, { roughness: 0.9, metalness: 0.1 });
  const rimMat = mat(0x666666, { roughness: 0.3, metalness: 0.7 });
  const toolMat = mat(0x3a3a3a, { roughness: 0.6, metalness: 0.5 });
  const lightMat = mat(0xffe8b0, { roughness: 0.2, emissive: 0xffe8b0, emissiveIntensity: 0.6 });

  // cab body
  const cab = box(1.8, 1.2, 2.0, cabMat);
  cab.position.set(0, 0.9, 1.0);
  group.add(cab);

  // windshield
  const windshield = box(1.6, 0.7, 0.06, glassMat);
  windshield.position.set(0, 1.2, 2.02);
  group.add(windshield);

  // side windows
  for (const side of [-1, 1]) {
    const sideWin = box(0.06, 0.5, 0.8, glassMat);
    sideWin.position.set(side * 0.92, 1.2, 0.8);
    group.add(sideWin);
  }

  // cab roof
  const cabRoof = box(1.9, 0.08, 2.1, cabMat);
  cabRoof.position.set(0, 1.54, 1.0);
  group.add(cabRoof);

  // flatbed
  const bed = box(2.0, 0.15, 2.4, bodyMat);
  bed.position.set(0, 0.55, -0.8);
  group.add(bed);

  // flatbed sides
  for (const side of [-1, 1]) {
    const sidePanel = box(0.08, 0.4, 2.4, bodyMat);
    sidePanel.position.set(side * 0.96, 0.82, -0.8);
    group.add(sidePanel);
  }

  // back panel
  const backPanel = box(2.0, 0.4, 0.08, bodyMat);
  backPanel.position.set(0, 0.82, -2.0);
  group.add(backPanel);

  // tool boxes on the flatbed
  const toolbox1 = box(0.5, 0.35, 0.8, toolMat);
  toolbox1.position.set(-0.5, 0.8, -0.8);
  group.add(toolbox1);

  const toolbox2 = box(0.4, 0.25, 0.6, toolMat);
  toolbox2.position.set(0.5, 0.75, -1.2);
  group.add(toolbox2);

  // work light on cab roof
  const workLightHousing = cyl(0.1, 0.1, 0.12, 8, toolMat);
  workLightHousing.position.set(0, 1.64, 0.5);
  group.add(workLightHousing);

  const workLightLens = cyl(0.08, 0.08, 0.04, 8, lightMat);
  workLightLens.position.set(0, 1.72, 0.5);
  group.add(workLightLens);

  // wheels
  for (const x of [-0.85, 0.85]) {
    for (const z of [1.2, -0.4, -1.6]) {
      const tire = cyl(0.28, 0.28, 0.18, 10, wheelMat);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(x, 0.28, z);
      group.add(tire);

      const rim = cyl(0.14, 0.14, 0.2, 6, rimMat);
      rim.rotation.z = Math.PI / 2;
      rim.position.set(x, 0.28, z);
      group.add(rim);
    }
  }

  // front bumper
  const bumper = box(1.9, 0.2, 0.12, toolMat);
  bumper.position.set(0, 0.4, 2.06);
  group.add(bumper);

  // headlights
  for (const side of [-0.7, 0.7]) {
    const headlight = box(0.2, 0.15, 0.06, lightMat);
    headlight.position.set(side, 0.7, 2.04);
    group.add(headlight);
  }

  group.userData.isServiceVehicle = true;
  group.userData.startsLevel2 = true;
  return group;
}

// ---------------------------------------------------------------------------
// Handler character
// ---------------------------------------------------------------------------

/**
 * The Handler: a dark figure in a long coat with a torch. Multi-part assembly
 * so he reads as a person rather than a capsule.
 */
export function buildHandlerCharacter() {
  const group = new THREE.Group();
  group.name = "handler";

  const coatMat = mat(0x1b2431, { roughness: 0.92, metalness: 0.05 });
  const skinMat = mat(0x8a7060, { roughness: 0.8, metalness: 0.0 });
  const bootMat = mat(0x111111, { roughness: 0.85, metalness: 0.1 });
  const torchMat = mat(0x333333, { roughness: 0.4, metalness: 0.6 });
  const torchLensMat = mat(0xffb066, { roughness: 0.2, emissive: 0xffb066, emissiveIntensity: 0.8, fog: false });

  // torso
  const torso = box(0.5, 0.7, 0.3, coatMat);
  torso.position.y = 1.25;
  group.add(torso);

  // coat skirt (long coat hanging down)
  const coatSkirt = box(0.55, 0.6, 0.32, coatMat);
  coatSkirt.position.y = 0.6;
  group.add(coatSkirt);

  // head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), skinMat);
  head.position.y = 1.78;
  head.castShadow = true;
  group.add(head);

  // hair / hat
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), coatMat);
  hat.position.y = 1.84;
  hat.scale.y = 0.6;
  group.add(hat);

  // arms
  for (const side of [-1, 1]) {
    const arm = box(0.12, 0.55, 0.12, coatMat);
    arm.position.set(side * 0.32, 1.15, 0);
    group.add(arm);
  }

  // legs
  for (const side of [-0.12, 0.12]) {
    const leg = box(0.14, 0.5, 0.14, coatMat);
    leg.position.set(side, 0.25, 0);
    group.add(leg);

    const boot = box(0.15, 0.12, 0.2, bootMat);
    boot.position.set(side, 0.06, 0.03);
    group.add(boot);
  }

  // torch in right hand
  const torch = cyl(0.04, 0.03, 0.2, 6, torchMat);
  torch.position.set(0.35, 0.95, -0.15);
  torch.rotation.x = -0.3;
  group.add(torch);

  const lens = cyl(0.035, 0.035, 0.02, 6, torchLensMat);
  lens.position.set(0.35, 0.88, -0.22);
  lens.rotation.x = -0.3;
  group.add(lens);

  // his amber glow — set BEHIND him so it backlights into a silhouette
  const glow = new THREE.PointLight(0xff8a3d, 0, 30, 2);
  glow.position.set(0, 2.4, 1.8);
  group.add(glow);

  group.userData.isHandler = true;
  group.handlerLight = glow;
  return group;
}

// ---------------------------------------------------------------------------
// player character (Kai)
// ---------------------------------------------------------------------------

/**
 * Kai: a young runner. Multi-part assembly so he reads as a person.
 * The body mesh reference is kept so the slide squash still works.
 */
export function buildPlayerCharacter() {
  const group = new THREE.Group();
  group.name = "player";

  const skinMat = mat(0x9a8070, { roughness: 0.8, metalness: 0.0 });
  const hoodieMat = mat(0x24384f, { roughness: 0.7, metalness: 0.05 });
  const pantsMat = mat(0x1a2530, { roughness: 0.75, metalness: 0.05 });
  const shoeMat = mat(0x222222, { roughness: 0.85, metalness: 0.1 });
  const hairMat = mat(0x1a1008, { roughness: 0.9, metalness: 0.0 });

  // torso (hoodie)
  const torso = box(0.4, 0.5, 0.25, hoodieMat);
  torso.position.y = 1.15;
  torso.castShadow = true;
  group.add(torso);

  // head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), skinMat);
  head.position.y = 1.6;
  head.castShadow = true;
  group.add(head);

  // hair
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), hairMat);
  hair.position.y = 1.65;
  hair.scale.y = 0.7;
  group.add(hair);

  // hoodie hood (bunched at the back of the neck)
  const hood = box(0.3, 0.15, 0.15, hoodieMat);
  hood.position.set(0, 1.42, -0.12);
  group.add(hood);

  // arms
  for (const side of [-1, 1]) {
    const upperArm = box(0.1, 0.3, 0.1, hoodieMat);
    upperArm.position.set(side * 0.25, 1.2, 0);
    group.add(upperArm);

    const forearm = box(0.08, 0.25, 0.08, skinMat);
    forearm.position.set(side * 0.25, 0.92, 0.05);
    group.add(forearm);
  }

  // legs
  for (const side of [-0.1, 0.1]) {
    const thigh = box(0.13, 0.35, 0.13, pantsMat);
    thigh.position.set(side, 0.72, 0);
    group.add(thigh);

    const shin = box(0.11, 0.3, 0.11, pantsMat);
    shin.position.set(side, 0.4, 0);
    group.add(shin);

    const shoe = box(0.12, 0.1, 0.2, shoeMat);
    shoe.position.set(side, 0.05, 0.04);
    group.add(shoe);
  }

  group.userData.isPlayer = true;
  return group;
}
