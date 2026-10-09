/* ===== מכונית: דגם מצורות פשוטות + פיזיקה ארקיידית ===== */

import * as THREE from "three";
import { PALETTE, toon, outlined } from "./toon.js";
import { ROAD_HALF, WALL_OFFSET } from "./track.js";

export const CAR_RADIUS = 1.7;

const bodyGeo = new THREE.BoxGeometry(2.1, 0.7, 4.2);
const noseGeo = new THREE.BoxGeometry(1.7, 0.45, 1.1);
const cabinGeo = new THREE.BoxGeometry(1.6, 0.62, 1.9);
const glassGeo = new THREE.BoxGeometry(1.64, 0.36, 1.5);
const wheelGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.42, 14);
const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.44, 8);
const wingGeo = new THREE.BoxGeometry(2.2, 0.14, 0.5);
const strutGeo = new THREE.BoxGeometry(0.14, 0.45, 0.14);
const stripeGeo = new THREE.BoxGeometry(0.5, 0.72, 4.22);

export class Car {
  constructor({ name, color, maxSpeed = 44, accel = 19 }) {
    this.name = name;
    this.color = color;
    this.maxSpeed = maxSpeed;
    this.accel = accel;

    this.x = 0;
    this.z = 0;
    this.heading = 0;
    this.speed = 0;
    this.steer = 0;          // מצב ההגה החלק בין -1 ל-1
    this.input = { gas: 0, brake: 0, steer: 0 };

    this.trackIndex = 0;
    this.lateral = 0;
    this.distance = 0;       // מרחק מצטבר לאורך המסלול בדגימות — ממנו נגזרות הקפות ומקומות
    this.finished = false;
    this.finishTime = 0;
    this.lapTimes = [];
    this.lapStart = 0;

    this.mesh = this.buildMesh();
  }

  buildMesh() {
    const car = new THREE.Group();
    const body = outlined(bodyGeo, this.color);
    body.position.y = 0.75;
    car.add(body);

    const stripe = new THREE.Mesh(stripeGeo, toon(PALETTE.surface));
    stripe.position.y = 0.75;
    car.add(stripe);

    const nose = outlined(noseGeo, this.color);
    nose.position.set(0, 0.55, 2.4);
    car.add(nose);

    const cabin = outlined(cabinGeo, PALETTE.surface);
    cabin.position.set(0, 1.4, -0.3);
    car.add(cabin);

    const glass = new THREE.Mesh(glassGeo, toon(PALETTE.ink));
    glass.position.set(0, 1.45, -0.25);
    car.add(glass);

    const wing = outlined(wingGeo, PALETTE.ink, 0.05);
    wing.position.set(0, 1.55, -1.95);
    car.add(wing);
    for (const s of [1, -1]) {
      const strut = new THREE.Mesh(strutGeo, wing.material);
      strut.position.set(s * 0.6, 1.25, -1.95);
      car.add(strut);
    }

    /* גלגלים: ציר היגוי (קדמיים) -> ציר סיבוב -> הגלגל */
    this.wheels = [];
    this.frontPivots = [];
    for (const [x, z, front] of [[1.1, 1.35, true], [-1.1, 1.35, true], [1.1, -1.35, false], [-1.1, -1.35, false]]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.46, z);
      const spin = new THREE.Group();
      const wheel = outlined(wheelGeo, PALETTE.ink, 0.04);
      wheel.rotation.z = Math.PI / 2;
      const hub = new THREE.Mesh(hubGeo, toon(PALETTE.gold));
      hub.rotation.z = Math.PI / 2;
      spin.add(wheel, hub);
      pivot.add(spin);
      car.add(pivot);
      this.wheels.push(spin);
      if (front) this.frontPivots.push(pivot);
    }

    /* צל עגול רך מתחת למכונית, כדי שתיראה "על" הכביש גם כשמפת הצללים רחוקה */
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 20),
      new THREE.MeshBasicMaterial({ color: PALETTE.ink, transparent: true, opacity: 0.22, depthWrite: false })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.scale.set(0.75, 1.15, 1);
    blob.position.y = 0.06;
    car.add(blob);

    return car;
  }

  placeAt(track, index, lateral) {
    const p = track.points[index], l = track.lefts[index];
    this.x = p.x + l.x * lateral;
    this.z = p.z + l.z * lateral;
    this.heading = track.headings[index];
    this.speed = 0;
    this.steer = 0;
    this.trackIndex = index;
    this.trackCount = track.count;
    this.lateral = lateral;
    /* מתחילים מעט לפני קו הסיום, לכן המרחק שלילי */
    this.distance = index > track.count / 2 ? index - track.count : index;
    this.finished = false;
    this.finishTime = 0;
    this.lapTimes = [];
    this.lapStart = 0;
    this.syncMesh(0);
  }

  get lap() {
    return Math.floor(this.distance / this.trackCount);
  }

  update(dt, track) {
    const { gas, brake, steer } = this.input;

    /* ההגה זז לכיוון הקלט בהדרגה, כך שגם מקלדת מרגישה חלקה */
    const steerRate = steer === 0 ? 7 : 5;
    this.steer += (steer - this.steer) * Math.min(1, steerRate * dt);

    const offRoad = Math.abs(this.lateral) > ROAD_HALF + 1.2;
    const top = offRoad ? this.maxSpeed * 0.48 : this.maxSpeed;

    if (gas > 0) {
      /* תאוצה שנחלשת ככל שמתקרבים למהירות המרבית */
      const room = Math.max(0, 1 - this.speed / top);
      this.speed += this.accel * gas * (0.35 + 0.65 * room) * dt;
    }
    if (brake > 0) {
      if (this.speed > 0.5) this.speed -= 38 * brake * dt;
      else this.speed = Math.max(-12, this.speed - 12 * brake * dt);
    }
    if (!gas && !brake) {
      const drag = 7 * dt;
      this.speed = Math.abs(this.speed) < drag ? 0 : this.speed - Math.sign(this.speed) * drag;
    }
    if (this.speed > top) this.speed = Math.max(top, this.speed - (offRoad ? 45 : 20) * dt);

    /* כמה אפשר לפנות: אפס בעמידה, הכי חד במהירות בינונית, קצת פחות במהירות גבוהה */
    const sp = Math.abs(this.speed);
    const grip = Math.min(1, sp / 9) * (1 - 0.3 * Math.min(1, sp / this.maxSpeed));
    this.heading += this.steer * 1.9 * grip * Math.sign(this.speed) * dt;

    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;

    this.track(track);

    /* הקיר: מחזירים פנימה ומאבדים מהירות */
    const limit = WALL_OFFSET - CAR_RADIUS * 0.7;
    if (Math.abs(this.lateral) > limit) {
      const p = track.points[this.trackIndex], l = track.lefts[this.trackIndex];
      const clamped = Math.sign(this.lateral) * limit;
      this.x = p.x + l.x * clamped;
      this.z = p.z + l.z * clamped;
      this.lateral = clamped;
      this.speed *= 0.97;
      /* מיישרים קצת את האף בחזרה לכיוון המסלול */
      let diff = track.headings[this.trackIndex] - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) < Math.PI / 2) this.heading += diff * Math.min(1, 4 * dt);
      this.hitWall = true;
    } else {
      this.hitWall = false;
    }

    this.syncMesh(dt);
  }

  /* עדכון מיקום על המסלול והמרחק המצטבר */
  track(track) {
    const { index, lateral } = track.locate(this.x, this.z, this.trackIndex);
    let delta = index - this.trackIndex;
    if (delta > track.count / 2) delta -= track.count;
    if (delta < -track.count / 2) delta += track.count;
    this.distance += delta;
    this.trackIndex = index;
    this.lateral = lateral;
  }

  syncMesh(dt) {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    /* הטיה קלה בפנייה — נותן תחושת מהירות */
    const lean = -this.steer * Math.min(1, Math.abs(this.speed) / this.maxSpeed) * 0.06;
    this.mesh.rotation.z += (lean - this.mesh.rotation.z) * Math.min(1, 8 * dt);
    for (const w of this.wheels) w.rotation.x += (this.speed * dt) / 0.46;
    for (const p of this.frontPivots) p.rotation.y = this.steer * 0.45;
  }
}

/* דחיפה הדדית בין מכוניות שנוגעות זו בזו */
export function resolveCollisions(cars) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = CAR_RADIUS * 2 * 0.85;
      if (d > 0.001 && d < min) {
        const push = (min - d) / 2;
        const nx = dx / d, nz = dz / d;
        a.x -= nx * push; a.z -= nz * push;
        b.x += nx * push; b.z += nz * push;
        /* מי שמאחור מאט, מי שמקדימה מקבל דחיפה קטנה */
        const avg = (a.speed + b.speed) / 2;
        a.speed = a.speed * 0.6 + avg * 0.4;
        b.speed = b.speed * 0.6 + avg * 0.4;
        a.bumped = b.bumped = true;
      }
    }
  }
}
