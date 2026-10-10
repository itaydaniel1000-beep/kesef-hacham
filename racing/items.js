/* ===== קופסאות הפתעה: בוסט (×3), מוקש ושיגור קדימה — לשחקן ולבוטים ===== */

import * as THREE from "three";
import { ROAD_HALF } from "./track.js";

export const ITEMS = {
  boost: { icon: "⚡", name: "בוסט" },
  mine: { icon: "💣", name: "מוקש" },
  warp: { icon: "🌀", name: "שיגור" },
  missile: { icon: "🚀", name: "טיל" },
  lightning: { icon: "⛈️", name: "ברקים" }
};

const BOOST_TIME = 5;      // שניות של בוסט לכל שימוש
const BOOST_CHARGES = 3;
const REWIND = 3;          // מי שעולה על מוקש חוזר 3 שניות אחורה
const WARP_AHEAD = 5;      // השיגור: לאן היית מגיע בעוד 5 שניות
const RESPAWN = 4;         // קופסה שנלקחה חוזרת אחרי 4 שניות
const BOX_HIT = 2.4, MINE_HIT = 1.9;
const HISTORY_STEP = 0.1;
const MINE_BEHIND = 4;     // כמה מטרים מאחורי המכונית המוקש נשאר
const OWNER_CLEAR = 8;     // המוקש שלך נדרך רק אחרי שהתרחקת ממנו כך
export const ROLL_TIME = 1.2; // גלגל המזל: כמה זמן מסתובבים האייקונים עד שהפריט נקבע
const MISSILE_SPEED = 28;  // כמה מהר מהמכונית שירתה (מטר לשנייה)
const MISSILE_LIFE = 9;
const STUN = 1.5, SLOW = 1.5;

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
const missileGeo = new THREE.ConeGeometry(0.28, 1.4, 12).rotateX(Math.PI / 2);
const missileMat = new THREE.MeshStandardMaterial({ color: 0xd8dde3, metalness: 0.7, roughness: 0.3, emissive: 0x331100 });
const flameGeo = new THREE.SphereGeometry(0.3, 8, 6);
const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
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
    this.net = null;    // מולטיפלייר: main.js מחבר לכאן שליחת אירועים (קופסה, מוקש, פגיעה)
    this.mineCounter = 0;
    this.missiles = [];
    this.enabled = true; // נגד השעון: בלי קופסאות

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
    for (const m of this.missiles) this.group.remove(m.mesh);
    this.missiles = [];
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
    this.cars = cars;
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
      m.light.material.color.setHex(Math.sin(this.time * 10) > 0 ? 0xff2a1a : 0x330000);
    }
    this.group.visible = this.enabled;
    if (!racing || !this.enabled) return;

    this.updateMissiles(dt, cars);
    for (const car of cars) {
      if (car.itemRoll > 0) car.itemRoll = Math.max(0, car.itemRoll - dt);
      if (car.remote) continue; // מכוניות של שחקנים אחרים: האיסוף והפגיעות נבדקים אצלם
      this.record(car, dt);
      if (car.item) car.itemAge += dt;
      if (car.finished) continue;
      /* איסוף קופסה: אם כבר יש לך פריט — לא מקבלים כלום (והקופסה בכל זאת נלקחת) */
      for (const b of this.boxes) {
        if (!b.mesh.visible) continue;
        const dx = car.x - b.mesh.position.x, dz = car.z - b.mesh.position.z;
        if (dx * dx + dz * dz > BOX_HIT * BOX_HIT || Math.abs(car.y + 1 - b.mesh.position.y) > 3) continue;
        this.hideBox(this.boxes.indexOf(b));
        this.net?.box(this.boxes.indexOf(b));
        if (!car.item) {
          const kinds = Object.keys(ITEMS);
          car.item = kinds[Math.floor(Math.random() * kinds.length)];
          car.itemCharges = car.item === "boost" ? BOOST_CHARGES : 1;
          car.itemAge = 0;
          car.itemRoll = ROLL_TIME; // גלגל המזל מסתובב — אי אפשר להשתמש עד שהוא נעצר
          this.fx("pickup", car);
        } else {
          this.fx("pickup-none", car);
        }
      }
      /* מוקשים */
      for (const m of this.mines) {
        if (m.hit) continue;
        const dx = car.x - m.mesh.position.x, dz = car.z - m.mesh.position.z;
        /* המוקש שלך לא תופס אותך עד שהתרחקת ממנו — גם אם נסעת לאט, נתקעת בקיר או נסעת אחורה */
        if (m.owner === car && !m.ownerClear) {
          if (dx * dx + dz * dz > OWNER_CLEAR * OWNER_CLEAR) m.ownerClear = true;
          continue;
        }
        if (dx * dx + dz * dz > MINE_HIT * MINE_HIT || Math.abs(car.y - m.mesh.position.y) > 2) continue;
        m.hit = true;
        this.net?.mineHit(m.id);
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

  hideBox(i) {
    const b = this.boxes[i];
    if (!b) return;
    b.mesh.visible = false;
    b.respawn = RESPAWN;
  }

  addMine(x, y, z, owner, id) {
    const mesh = new THREE.Mesh(mineGeo, mineMat);
    mesh.position.set(x, y + 0.55, z);
    mesh.castShadow = true;
    const light = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
    light.position.y = 0.5;
    mesh.add(light);
    this.group.add(mesh);
    const mine = { id, mesh, light, owner, ownerClear: false, hit: false };
    this.mines.push(mine);
    if (this.mines.length > 24) this.group.remove(this.mines.shift().mesh);
    return mine;
  }

  /* מוקש שמישהו אחר פגע בו (הודעה מהרשת) */
  removeMine(id) {
    const m = this.mines.find((mm) => mm.id === id);
    if (!m) return;
    this.group.remove(m.mesh);
    this.mines = this.mines.filter((mm) => mm !== m);
  }

  /* המכונית הקרובה ביותר שלפניך (לפי המרחק לאורך המסלול) */
  targetAhead(car, cars) {
    let best = null, gap = Infinity;
    for (const o of cars) {
      if (o === car || o.finished) continue;
      const d = o.distance - car.distance;
      if (d > 0 && d < gap) {
        gap = d;
        best = o;
      }
    }
    return best;
  }

  addMissile(id, owner, target, dist, lateral, speed) {
    const mesh = new THREE.Mesh(missileGeo, missileMat);
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.z = -0.85;
    mesh.add(flame);
    mesh.castShadow = true;
    this.group.add(mesh);
    const m = { id, owner, target, dist, lateral, speed, life: MISSILE_LIFE, mesh, hit: false };
    this.missiles.push(m);
    this.placeMissile(m);
    return m;
  }

  placeMissile(m) {
    const t = this.track;
    const i = t.wrap(Math.floor(m.dist));
    const p = t.points[i], l = t.lefts[i];
    m.mesh.position.set(p.x + l.x * m.lateral, p.y + 0.9, p.z + l.z * m.lateral);
    m.mesh.rotation.y = t.headings[i];
  }

  /* הטיל טס לאורך המסלול ומתקרב לצד של המטרה; הפגיעה נבדקת אצל מי שנוהג במטרה */
  updateMissiles(dt, cars) {
    for (const m of this.missiles) {
      m.life -= dt;
      m.dist += (m.speed * dt) / this.track.spacing;
      if (m.target) m.lateral += (m.target.lateral - m.lateral) * Math.min(1, dt * 4);
      this.placeMissile(m);
      if (m.target && !m.target.remote && !m.target.finished && m.dist >= m.target.distance - 0.5 && Math.abs(m.lateral - m.target.lateral) < 3) {
        m.hit = true;
        this.hitMissile(m.target, m.mesh.position, m.owner);
        this.net?.missileHit(m.id);
      }
      if (m.life <= 0) m.hit = true;
    }
    for (const m of this.missiles) if (m.hit) this.group.remove(m.mesh);
    this.missiles = this.missiles.filter((m) => !m.hit);
  }

  hitMissile(car, pos, owner) {
    car.stun = STUN;
    car.speed *= 0.3;
    car.drifting = false;
    this.fx("boom", car, pos.clone(), "missile");
    if (owner) this.fx("missileHit", owner);
  }

  removeMissile(id) {
    const m = this.missiles.find((mm) => mm.id === id);
    if (m) m.hit = true;
  }

  /* ברקים: כל מי שלפניך (אצלי — רק המכוניות שאני מריץ) מאט לחצי */
  strike(owner, ownerDistance = owner?.distance ?? 0) {
    for (const o of this.cars || []) {
      if (o === owner || o.remote || o.finished || o.distance <= ownerDistance) continue;
      o.slow = SLOW;
      this.fx("zapped", o);
    }
  }

  /* הפעלת הפריט (מקש ק) */
  use(car) {
    if (!car.item || car.finished || car.itemRoll > 0) return false;
    const kind = car.item;
    if (kind === "boost") {
      car.padBoost = BOOST_TIME;
      this.fx("boost", car);
    } else if (kind === "mine") {
      /* המוקש נשאר קצת מאחורי המכונית — לפי הכיוון שבו היא באמת נוסעת (גם מחוץ לכביש או ברוורס) */
      const dir = car.speed < -0.5 ? -1 : 1;
      const bx = car.x - Math.sin(car.moveHeading) * MINE_BEHIND * dir;
      const bz = car.z - Math.cos(car.moveHeading) * MINE_BEHIND * dir;
      const groundY = car.groundHeight ?? car.y; // הקרקע מתחת למכונית (גם כשהיא באוויר)
      const mine = this.addMine(bx, groundY, bz, car, `${car.netId || "local"}-${++this.mineCounter}`);
      this.net?.mine(mine.id, bx, groundY, bz, car.netId);
      this.fx("mine", car);
    } else if (kind === "warp") {
      this.warp(car);
      this.fx("warp", car);
    } else if (kind === "missile") {
      const target = this.targetAhead(car, this.cars || []);
      const id = `${car.netId || "local"}-m${++this.mineCounter}`;
      const speed = Math.max(car.speed, 20) + MISSILE_SPEED;
      this.addMissile(id, car, target, car.distance + 3 / this.track.spacing, car.lateral, speed);
      this.net?.missile(id, car.netId, target?.netId, car.distance + 3 / this.track.spacing, car.lateral, speed);
      this.fx("missile", car);
    } else if (kind === "lightning") {
      this.strike(car);
      this.net?.lightning(car.netId, car.distance);
      this.fx("lightning", car);
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
    if (!car.item || car.finished || car.itemAge < 0.8 || car.itemRoll > 0) return;
    if (car.item === "boost") {
      /* בוסט רק בישורת — בפנייה הוא היה זורק אותם לקיר */
      if (driver.onStraight && car.padBoost <= 0) this.use(car);
    } else if (car.item === "mine") {
      const behind = cars.some((o) => o !== car && !o.finished && (car.distance - o.distance) * this.track.spacing > 4 && (car.distance - o.distance) * this.track.spacing < 35);
      if (behind || car.itemAge > 12) this.use(car);
    } else if (car.item === "warp") {
      if (car.itemAge > 1.5 && car.speed > 15) this.use(car);
    } else if (car.item === "missile") {
      const t = this.targetAhead(car, cars);
      if ((t && (t.distance - car.distance) * this.track.spacing < 150) || car.itemAge > 8) this.use(car);
    } else if (car.item === "lightning") {
      if (cars.some((o) => o !== car && !o.finished && o.distance > car.distance) && car.itemAge > 1.2) this.use(car);
    }
  }
}
