/* ===== קופסאות הפתעה: בוסט (×3), מוקש ושיגור קדימה — לשחקן ולבוטים ===== */

import * as THREE from "three";
import { ROAD_HALF } from "./track.js";

export const ITEMS = {
  boost: { icon: "🚀", name: "בוסט" },
  mine: { icon: "💣", name: "מוקש" },
  warp: { icon: "🌀", name: "שיגור" }
};

const BOOST_TIME = 5;      // שניות של בוסט לכל שימוש
const BOOST_CHARGES = 3;
const REWIND = 3;          // מי שעולה על מוקש חוזר 3 שניות אחורה
const WARP_AHEAD = 5;      // השיגור: לאן היית מגיע בעוד 5 שניות
const RESPAWN = 4;         // קופסה שנלקחה חוזרת אחרי 4 שניות
const BOX_HIT = 2.4, MINE_HIT = 1.9;
const HISTORY_STEP = 0.1;

/* טקסטורת "?" לקופסה */
function boxTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, "#ff4fd8");
  grad.addColorStop(0.5, "#ffc400");
  grad.addColorStop(1, "#00c2ff");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "rgba(255,255,255,.9)";
  g.lineWidth = 8;
  g.strokeRect(4, 4, 120, 120);
  g.fillStyle = "#fff";
  g.font = "900 92px Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("?", 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const boxGeo = new THREE.BoxGeometry(1.7, 1.7, 1.7);
const mineGeo = new THREE.SphereGeometry(0.55, 16, 12);
const lightGeo = new THREE.SphereGeometry(0.16, 8, 6);
let boxMat = null;
const mineMat = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.4, metalness: 0.7 });

export class ItemSystem {
  constructor(track) {
    this.track = track;
    this.group = new THREE.Group();
    track.group.add(this.group);
    boxMat ||= new THREE.MeshPhysicalMaterial({
      map: boxTexture(), transparent: true, opacity: 0.88, roughness: 0.15, clearcoat: 1, emissive: 0x332244, emissiveIntensity: 0.6
    });
    this.boxes = [];
    this.mines = [];
    this.time = 0;
    this.fx = () => {}; // main.js מחבר לכאן קול וחלקיקים

    /* שורות של שלוש קופסאות לרוחב הכביש, מפוזרות לאורך המסלול (לא על הזינוק, לא על משטחי האצה או קרח) */
    const rows = 8;
    for (let r = 0; r < rows; r++) {
      let index = Math.floor(track.count * (0.07 + (0.88 * (r + 0.5)) / rows));
      for (let tries = 0; tries < 10; tries++) {
        const nearPad = track.boosts.some((p) => Math.abs(p.index - index) < 25);
        if (!nearPad && !track.isIce[index]) break;
        index = track.wrap(index + 30);
      }
      for (const lateral of [-4, 0, 4]) {
        const mesh = new THREE.Mesh(boxGeo, boxMat);
        const p = track.points[index], l = track.lefts[index];
        mesh.position.set(p.x + l.x * lateral, p.y + 1.6, p.z + l.z * lateral);
        mesh.castShadow = true;
        this.group.add(mesh);
        this.boxes.push({ mesh, index, lateral, respawn: 0 });
      }
    }
  }

  /* מירוץ חדש: כל הקופסאות חוזרות, המוקשים נעלמים, ולאף אחד אין פריט */
  reset(cars) {
    for (const b of this.boxes) {
      b.respawn = 0;
      b.mesh.visible = true;
    }
    for (const m of this.mines) this.group.remove(m.mesh);
    this.mines = [];
    for (const car of cars) {
      car.item = null;
      car.itemCharges = 0;
      car.itemAge = 0;
      car.history = [];
      car.historyTimer = 0;
    }
  }

  update(dt, cars, racing) {
    this.time += dt;
    /* הקופסאות מסתובבות ומרחפות */
    for (const b of this.boxes) {
      if (b.respawn > 0) {
        b.respawn -= dt;
        if (b.respawn <= 0) b.mesh.visible = true;
      }
      b.mesh.rotation.y += dt * 1.6;
      b.mesh.rotation.x = Math.sin(this.time * 1.3 + b.index) * 0.3;
      b.mesh.position.y = this.track.points[b.index].y + 1.6 + Math.sin(this.time * 2 + b.lateral) * 0.25;
    }
    /* מוקשים מהבהבים */
    for (const m of this.mines) {
      m.arm -= dt;
      m.light.material.color.setHex(Math.sin(this.time * 10) > 0 ? 0xff2a1a : 0x330000);
    }
    if (!racing) return;

    for (const car of cars) {
      this.record(car, dt);
      if (car.item) car.itemAge += dt;
      if (car.finished) continue;
      /* איסוף קופסה: אם כבר יש לך פריט — לא מקבלים כלום (והקופסה בכל זאת נלקחת) */
      for (const b of this.boxes) {
        if (!b.mesh.visible) continue;
        const dx = car.x - b.mesh.position.x, dz = car.z - b.mesh.position.z;
        if (dx * dx + dz * dz > BOX_HIT * BOX_HIT || Math.abs(car.y + 1 - b.mesh.position.y) > 3) continue;
        b.mesh.visible = false;
        b.respawn = RESPAWN;
        if (!car.item) {
          const kinds = Object.keys(ITEMS);
          car.item = kinds[Math.floor(Math.random() * kinds.length)];
          car.itemCharges = car.item === "boost" ? BOOST_CHARGES : 1;
          car.itemAge = 0;
          this.fx("pickup", car);
        } else {
          this.fx("pickup-none", car);
        }
      }
      /* מוקשים */
      for (const m of this.mines) {
        if (m.hit) continue;
        if (m.owner === car && m.arm > 0) continue; // המוקש שלך לא תופס אותך ברגע שהנחת אותו
        const dx = car.x - m.mesh.position.x, dz = car.z - m.mesh.position.z;
        if (dx * dx + dz * dz > MINE_HIT * MINE_HIT || Math.abs(car.y - m.mesh.position.y) > 2) continue;
        m.hit = true;
        this.fx("boom", car, m.mesh.position);
        this.rewind(car);
      }
    }
    for (const m of this.mines) if (m.hit) this.group.remove(m.mesh);
    this.mines = this.mines.filter((m) => !m.hit);
  }

  /* היסטוריה של כל מכונית — כדי שאפשר יהיה להחזיר אותה 3 שניות אחורה */
  record(car, dt) {
    car.historyTimer += dt;
    if (car.historyTimer < HISTORY_STEP) return;
    car.historyTimer = 0;
    car.history.push({
      x: car.x, y: car.y, z: car.z, heading: car.heading, moveHeading: car.moveHeading, speed: car.speed,
      trackIndex: car.trackIndex, distance: car.distance, lateral: car.lateral
    });
    const keep = Math.ceil((REWIND + 1) / HISTORY_STEP);
    if (car.history.length > keep) car.history.splice(0, car.history.length - keep);
  }

  rewind(car) {
    const back = Math.round(REWIND / HISTORY_STEP);
    const s = car.history[Math.max(0, car.history.length - back)];
    if (!s) return;
    Object.assign(car, s);
    car.vy = 0;
    car.grounded = true;
    car.groundHeight = s.y;
    car.drifting = false;
    car.slip = 0;
    car.padBoost = 0;
    car.history.length = 0; // שלא יחזור לנקודה שבה עלה על המוקש
  }

  /* הפעלת הפריט (מקש ק) */
  use(car) {
    if (!car.item || car.finished) return false;
    const kind = car.item;
    if (kind === "boost") {
      car.padBoost = BOOST_TIME;
      this.fx("boost", car);
    } else if (kind === "mine") {
      /* המוקש נשאר קצת מאחורי המכונית, על הכביש */
      const i = this.track.wrap(car.trackIndex - Math.round(4 / this.track.spacing));
      const p = this.track.points[i], l = this.track.lefts[i];
      const lat = Math.max(-ROAD_HALF + 1, Math.min(ROAD_HALF - 1, car.lateral));
      const mesh = new THREE.Mesh(mineGeo, mineMat);
      mesh.position.set(p.x + l.x * lat, p.y + 0.55, p.z + l.z * lat);
      mesh.castShadow = true;
      const light = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
      light.position.y = 0.5;
      mesh.add(light);
      this.group.add(mesh);
      this.mines.push({ mesh, light, owner: car, arm: 1.2, hit: false });
      if (this.mines.length > 24) this.group.remove(this.mines.shift().mesh);
      this.fx("mine", car);
    } else if (kind === "warp") {
      this.warp(car);
      this.fx("warp", car);
    }
    car.itemCharges--;
    if (car.itemCharges <= 0) car.item = null;
    car.itemAge = 0;
    return true;
  }

  /* שיגור: למקום שבו כנראה היית בעוד 5 שניות — במהירות הנוכחית (ולפחות במהירות סבירה) */
  warp(car) {
    const t = this.track;
    const meters = Math.max(car.speed, car.maxSpeed * 0.6) * WARP_AHEAD;
    const steps = Math.round(meters / t.spacing);
    const i = t.wrap(car.trackIndex + steps);
    const lat = Math.max(-ROAD_HALF + 1.5, Math.min(ROAD_HALF - 1.5, car.lateral));
    const p = t.points[i], l = t.lefts[i];
    car.x = p.x + l.x * lat;
    car.z = p.z + l.z * lat;
    car.y = p.y;
    car.vy = 0;
    car.grounded = true;
    car.groundHeight = p.y;
    car.heading = car.moveHeading = t.headings[i];
    car.drifting = false;
    car.slip = 0;
    car.trackIndex = i;
    car.lateral = lat;
    car.distance += steps;
  }

  /* בוטים: מתי להפעיל */
  think(car, driver, cars) {
    if (!car.item || car.finished || car.itemAge < 0.8) return;
    if (car.item === "boost") {
      /* בוסט רק בישורת — בפנייה הוא היה זורק אותם לקיר */
      if (driver.onStraight && car.padBoost <= 0) this.use(car);
    } else if (car.item === "mine") {
      const behind = cars.some((o) => o !== car && !o.finished && (car.distance - o.distance) * this.track.spacing > 4 && (car.distance - o.distance) * this.track.spacing < 35);
      if (behind || car.itemAge > 12) this.use(car);
    } else if (car.item === "warp") {
      if (car.itemAge > 1.5 && car.speed > 15) this.use(car);
    }
  }
}
