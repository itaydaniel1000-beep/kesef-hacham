/* ===== סימני צמיגים: רצועות כהות על הכביש בדריפט ובבלימה חזקה =====
   מאגר קבוע של מקטעים (InstancedMesh אחד); כשהוא מתמלא, הישנים ביותר מתחלפים בחדשים */

import * as THREE from "three";
import { ROAD_TOP } from "./track.js";

const MAX = 700;
const WIDTH = 0.32;
const zero = new THREE.Matrix4().makeScale(0, 0, 0);

export class Skids {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(WIDTH, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x0c0c0e, transparent: true, opacity: 0.5, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.next = 0;
    this.last = new Map(); // מכונית -> מיקומי הגלגלים האחוריים בפעם הקודמת
    this.clear();
  }

  clear() {
    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, zero);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.last.clear();
    this.next = 0;
  }

  /* קוראים לזה בכל פריים לכל מכונית קרובה */
  update(car) {
    const marking = car.grounded && !car.offRoad && Math.abs(car.speed) > 10 &&
      (car.drifting || (car.input.brake > 0 && car.speed > 18));
    if (!marking) {
      this.last.delete(car);
      return;
    }
    const s = Math.sin(car.heading), c = Math.cos(car.heading);
    const y = (car.groundHeight ?? car.y) + ROAD_TOP + 0.05;
    const wheels = [-0.85, 0.85].map((side) => [car.x - s * 1.4 + c * side, car.z - c * 1.4 - s * side]);
    const prev = this.last.get(car);
    this.last.set(car, wheels);
    if (!prev) return;
    for (let w = 0; w < 2; w++) {
      const [x0, z0] = prev[w], [x1, z1] = wheels[w];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.05 || len > 4) continue; // לא זז, או קפץ (שיגור / מוקש)
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3((x0 + x1) / 2, y, (z0 + z1) / 2),
        new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(x1 - x0, z1 - z0)),
        new THREE.Vector3(1, 1, len + 0.05)
      );
      this.mesh.setMatrixAt(this.next, m);
      this.next = (this.next + 1) % MAX;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
