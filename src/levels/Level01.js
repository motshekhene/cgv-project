import * as THREE from "three";
import { Level } from "../core/Level.js";

/**
 * Level 01 — Downline. This is the shell, not the finished level:
 * a lit corridor, three lanes, a box you can move between them, and a camera
 * on a pivot hanging off the player rig.
 *
 * It exists to prove the contract works end to end. 1A grows this into the
 * real controller and chunk streamer; 1B replaces the placeholder geometry
 * with the actual subway art.
 */
const LANE_X = [-2.4, 0, 2.4];

export class Level01 extends Level {
  constructor() {
    super("level01");
    this.z = 0;
    this.speed = 12;
    this.lane = 1;
    this.laneFrom = 1;
    this.laneT = 1;
    this.y = 0;
    this.vy = 0;
    this.airborne = false;
  }

  init(scene, assets, input, state) {
    super.init(scene, assets, input, state);

    scene.background = new THREE.Color(0x05070d);
    scene.fog = new THREE.Fog(0x05070d, 45, 185);

    const hemi = new THREE.HemisphereLight(0x4e8fa6, 0x121a26, 1.15);
    this.root.add(hemi);

    this.key = new THREE.DirectionalLight(0xbfe6ff, 1.35);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.camera.left = -14;
    this.key.shadow.camera.right = 14;
    this.key.shadow.camera.top = 14;
    this.key.shadow.camera.bottom = -14;
    this.root.add(this.key, this.key.target);

    // placeholder tunnel — 1B replaces this with the real art
    const floorGeo = new THREE.BoxGeometry(12, 0.4, 600);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x18293c,
      roughness: 0.9,
    });
    this.floor = new THREE.Mesh(floorGeo, floorMat);
    this.floor.position.set(0, -0.2, -260);
    this.floor.receiveShadow = true;
    this.root.add(this.floor);

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x14202e,
      roughness: 0.95,
    });
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 7, 600), wallMat);
      wall.position.set(side * 6.2, 3.3, -260);
      this.root.add(wall);
    }
    for (let i = 0; i < 30; i++) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 0.1, 0.6),
        new THREE.MeshBasicMaterial({ color: 0xcfefff }),
      );
      strip.position.set(0, 6.3, -i * 20);
      this.root.add(strip);
    }

    // the player rig — camera hangs off a pivot on the rig, never on the mesh
    this.player = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.34, 0.8, 4, 10),
      new THREE.MeshStandardMaterial({ color: 0x24384f, roughness: 0.55 }),
    );
    body.position.y = 1.05;
    body.castShadow = true;
    this.player.add(body);

    this.camPivot = new THREE.Object3D();
    this.camPivot.position.set(0, 2.5, 7.4);
    this.player.add(this.camPivot);
    this.root.add(this.player);

    this._tmp = new THREE.Vector3();
  }

  update(dt, state) {
    const input = this.input;

    // forward motion
    this.z -= this.speed * dt;
    state.distance = -this.z;

    // lanes
    if (input.pressed("left") && this.lane > 0) {
      this.laneFrom = this.lane;
      this.lane--;
      this.laneT = 0;
    }
    if (input.pressed("right") && this.lane < 2) {
      this.laneFrom = this.lane;
      this.lane++;
      this.laneT = 0;
    }
    if (this.laneT < 1) this.laneT = Math.min(1, this.laneT + dt / 0.16);
    const x = THREE.MathUtils.lerp(
      LANE_X[this.laneFrom],
      LANE_X[this.lane],
      THREE.MathUtils.smoothstep(this.laneT, 0, 1),
    );

    // jump
    if (input.pressed("jump") && !this.airborne) {
      this.airborne = true;
      this.vy = 9.2;
    }
    if (this.airborne) {
      this.vy -= 24 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.airborne = false;
      }
    }

    this.player.position.set(x, this.y, this.z);

    // shadow camera follows so shadows stay inside it
    this.key.position.set(x + 6, 14, this.z + 10);
    this.key.target.position.set(x, 0, this.z - 6);

    // camera lerps toward the pivot rather than being parented to it
    const cam = this.game.camera;
    this.camPivot.getWorldPosition(this._tmp);
    cam.position.lerp(this._tmp, 1 - Math.exp(-9 * dt));
    cam.lookAt(x * 0.7, 1.5, this.z - 9);
  }

  teardown() {
    this.scene.fog = null;
    super.teardown();
  }
}
