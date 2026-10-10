/* ===== מכונית: דגם מצורות פשוטות + פיזיקה ארקיידית עם דריפט, ניטרו וקפיצות ===== */

import * as THREE from "three";
import { PALETTE, toon, outlined, shared, disposeTree } from "./toon.js";
import { ROAD_HALF, WALL_OFFSET, ROAD_TOP, angleDiff } from "./track.js";

export const CAR_RADIUS = 1.7;
const OFF_ROAD = ROAD_HALF + 1.2; // מעבר לאבני השפה = מחוץ לכביש
const GRAVITY = 26;

/* שלושה סוגי מכוניות: כל אחת חזקה במשהו אחר */
export const CAR_TYPES = {
  speed: {
    name: "מהירה", maxSpeed: 47, accel: 17, turn: 1.8, grip: 9,
    stats: { speed: 3, accel: 1, grip: 2 },
    shape: { len: 4.5, width: 2, height: 0.6, cabin: 1.7, wing: 2.4, wingY: 1.5 }
  },
  grip: {
    name: "אחיזה", maxSpeed: 44, accel: 19, turn: 2.2, grip: 13,
    stats: { speed: 2, accel: 2, grip: 3 },
    shape: { len: 4.1, width: 2.3, height: 0.7, cabin: 1.9, wing: 1.8, wingY: 1.4 }
  },
  accel: {
    name: "תאוצה", maxSpeed: 44.5, accel: 25, turn: 1.95, grip: 10,
    stats: { speed: 2, accel: 3, grip: 2 },
    shape: { len: 3.7, width: 2.1, height: 0.8, cabin: 1.6, wing: 0, wingY: 0 }
  }
};

const wheelGeo = shared(new THREE.CylinderGeometry(0.46, 0.46, 0.42, 14));
const hubGeo = shared(new THREE.CylinderGeometry(0.2, 0.2, 0.44, 8));
const strutGeo = shared(new THREE.BoxGeometry(0.14, 0.45, 0.14));
const flameGeo = shared(new THREE.ConeGeometry(0.28, 1.4, 8));

export class Car {
  constructor({ name, color, type = "grip", speedScale = 1 }) {
    const spec = CAR_TYPES[type];
    this.name = name;
    this.color = color;
    this.type = type;
    this.maxSpeed = spec.maxSpeed * speedScale;
    this.accel = spec.accel * speedScale;
    this.turn = spec.turn;
    this.gripRate = spec.grip;

    this.input = { gas: 0, brake: 0, steer: 0, drift: 0, nitro: 0 };
    this.brakeDrifts = false; // אצל השחקן: בלם + היגוי במהירות = דריפט (נוח בטלפון)
    this.mesh = this.buildMesh(spec.shape);
    this.reset();
  }

  reset() {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.vy = 0;
    this.grounded = true;
    this.heading = 0;        // לאן האף מצביע
    this.moveHeading = 0;    // לאן המכונית באמת נוסעת — בדריפט שני אלה נפרדים
    this.speed = 0;
    this.steer = 0;          // מצב ההגה החלק בין -1 ל-1
    this.drifting = false;
    this.slip = 0;
    this.nitro = 0.3;        // מד הניטרו, בין 0 ל-1
    this.nitroOn = false;
    this.padBoost = 0;       // זמן שנשאר מדחיפה של משטח האצה
    this.drafting = false;
    this.events = [];        // אירועים לקול ולחלקיקים: wall, bump, land, pad, nitro

    this.groundHeight = undefined;
    this.airCooldown = 0;
    this.hitWall = false;
    this.topScale = 1;       // עזרת השלמה לבוטים שמאחור (ai.js)
    this.input = { gas: 0, brake: 0, steer: 0, drift: 0, nitro: 0 };
    this.offRoad = false;
    this.trackIndex = 0;
    this.lateral = 0;
    this.distance = 0;       // מרחק מצטבר לאורך המסלול בדגימות — ממנו נגזרות הקפות ומקומות
    this.finished = false;
    this.finishTime = 0;
  }

  buildMesh(s) {
    const car = new THREE.Group();
    const body = new THREE.Group();   // החלק שמתנדנד ונוטה; הגלגלים נשארים על הקרקע
    car.add(body);
    this.body = body;

    const box = (w, h, d, color, x, y, z, line = 0.07) => {
      const m = outlined(new THREE.BoxGeometry(w, h, d), color, line);
      m.position.set(x, y, z);
      body.add(m);
      return m;
    };

    box(s.width, s.height, s.len, this.color, 0, 0.45 + s.height / 2, 0);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, s.height + 0.02, s.len + 0.02), toon(PALETTE.surface));
    stripe.position.y = 0.45 + s.height / 2;
    body.add(stripe);
    box(s.width * 0.8, 0.45, 1.1, this.color, 0, 0.6, s.len / 2 + 0.25);
    const top = 0.45 + s.height;
    box(s.width * 0.76, 0.62, s.cabin, PALETTE.surface, 0, top + 0.3, -0.3);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(s.width * 0.78, 0.36, s.cabin * 0.8), toon(PALETTE.ink));
    glass.position.set(0, top + 0.35, -0.25);
    body.add(glass);

    if (s.wing) {
      const wing = box(s.wing, 0.14, 0.5, PALETTE.ink, 0, s.wingY, -s.len / 2 + 0.2, 0.05);
      for (const side of [1, -1]) {
        const strut = new THREE.Mesh(strutGeo, wing.material);
        strut.position.set(side * 0.6, s.wingY - 0.3, -s.len / 2 + 0.2);
        body.add(strut);
      }
    } else {
      /* מכונית התאוצה: סקופ אוויר על הגג במקום כנף */
      box(0.7, 0.35, 0.8, PALETTE.ink, 0, top + 0.78, 0.1, 0.05);
    }

    /* להבות ניטרו מהאגזוז */
    this.flames = new THREE.Group();
    for (const side of [0.45, -0.45]) {
      const flame = outlined(flameGeo, PALETTE.gold, 0.05);
      flame.rotation.x = -Math.PI / 2;
      flame.position.set(side, 0.75, -s.len / 2 - 0.7);
      this.flames.add(flame);
    }
    this.flames.visible = false;
    body.add(this.flames);

    /* גלגלים: ציר היגוי (קדמיים) -> ציר סיבוב -> הגלגל */
    this.wheels = [];
    this.frontPivots = [];
    const wx = s.width / 2 + 0.05, wz = s.len / 2 - 0.75;
    for (const [x, z, front] of [[wx, wz, true], [-wx, wz, true], [wx, -wz, false], [-wx, -wz, false]]) {
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

    /* צל עגול רך מתחת למכונית — נשאר על הקרקע גם כשהמכונית באוויר */
    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 20),
      new THREE.MeshBasicMaterial({ color: PALETTE.ink, transparent: true, opacity: 0.25, depthWrite: false })
    );
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.scale.set(0.75, 1.15, 1);
    this.blob.position.y = 0.1;
    car.add(this.blob);

    car.rotation.order = "YXZ";
    return car;
  }

  /* שחרור הגאומטריות והחומרים של המכונית הזאת (כשבונים מכוניות חדשות במוסך) */
  dispose() {
    disposeTree(this.mesh);
  }

  placeAt(track, index, lateral) {
    this.reset();
    const p = track.points[index], l = track.lefts[index];
    this.x = p.x + l.x * lateral;
    this.z = p.z + l.z * lateral;
    this.y = p.y;
    this.groundHeight = p.y;
    this.heading = this.moveHeading = track.headings[index];
    this.trackIndex = index;
    this.lateral = lateral;
    /* מתחילים מעט לפני קו הסיום, לכן המרחק שלילי */
    this.distance = index > track.count / 2 ? index - track.count : index;
    this.syncMesh(0, track);
  }

  update(dt, track, others) {
    const { gas, brake, steer, drift, nitro } = this.input;
    const onIce = track.isIce[this.trackIndex] && Math.abs(this.lateral) < ROAD_HALF;
    const offRoad = Math.abs(this.lateral) > OFF_ROAD;
    this.offRoad = offRoad; // הקול והאבק קוראים את אותו כלל

    /* ההגה זז לכיוון הקלט בהדרגה, כך שגם מקלדת מרגישה חלקה */
    this.steer += (steer - this.steer) * Math.min(1, (steer === 0 ? 7 : 5) * dt);

    /* דריפט: מקש ייעודי, או בלם תוך כדי פנייה במהירות */
    const sp = Math.abs(this.speed);
    const driftInput = drift || (this.brakeDrifts && brake && Math.abs(steer) > 0.3);
    /* נכנסים לדריפט מעל 16, ומחזיקים בו עד 12 — כדי שלא ייקטע באמצע פנייה איטית */
    if (driftInput && !this.drifting && sp > 16 && this.grounded && Math.abs(this.steer) > 0.25) this.drifting = true;
    /* דריפט שהתחיל מהבלם (ולא ממקש הדריפט) ממשיך לבלום — אחרת אי אפשר להאט בפנייה */
    const brakeDrift = this.drifting && !drift;
    if (this.drifting && (!driftInput || sp < 12 || !this.grounded)) this.drifting = false;

    /* ניטרו: מחזיקים את המקש כל עוד יש במד */
    if (nitro && this.nitro > 0.02 && (this.nitroOn || this.nitro > 0.15)) {
      if (!this.nitroOn) this.events.push("nitro");
      this.nitroOn = true;
      this.nitro = Math.max(0, this.nitro - dt * 0.38);
    } else {
      this.nitroOn = false;
    }
    this.padBoost = Math.max(0, this.padBoost - dt);
    const boosted = this.nitroOn || this.padBoost > 0;

    let top = this.maxSpeed * this.topScale * (offRoad ? 0.48 : 1) * (boosted ? 1.28 : 1) * (this.drafting ? 1.04 : 1);

    if (this.grounded) {
      if (gas > 0 || boosted) {
        /* תאוצה שנחלשת ככל שמתקרבים למהירות המרבית */
        const room = Math.max(0, 1 - this.speed / top);
        this.speed += this.accel * Math.max(gas, boosted ? 1 : 0) * (boosted ? 1.8 : 1) * (0.35 + 0.65 * room) * dt;
      }
      if (brake > 0 && (!this.drifting || brakeDrift)) {
        if (this.speed > 0.5) this.speed -= 38 * brake * (this.drifting ? 0.6 : 1) * dt;
        else this.speed = Math.min(this.speed, Math.max(-12, this.speed - 12 * brake * dt)); // בלי לקפוץ אם כבר מתגלגלים אחורה מהר
      }
      if (!gas && !brake && !boosted) {
        const drag = 7 * dt;
        this.speed = Math.abs(this.speed) < drag ? 0 : this.speed - Math.sign(this.speed) * drag;
      }
      /* עלייה מאטה, ירידה מאיצה */
      this.speed -= track.slopes[this.trackIndex] * 9 * dt;
      if (this.speed > top) this.speed = Math.max(top, this.speed - (offRoad ? 45 : 20) * dt);
    }

    /* פנייה: אפס בעמידה, הכי חד במהירות בינונית, קצת פחות במהירות גבוהה; בדריפט חד יותר */
    const grip = Math.min(1, sp / 9) * (1 - 0.3 * Math.min(1, sp / this.maxSpeed));
    const air = this.grounded ? 1 : 0.25;
    const turnRate = this.turn * (this.drifting ? 1.45 : 1) * (onIce ? 0.8 : 1);
    this.heading += this.steer * turnRate * grip * Math.sign(this.speed) * air * dt;

    /* כיוון התנועה נגרר אחרי האף. אחיזה חלשה = החלקה */
    const hold = this.drifting ? 1.6 : onIce ? 2.2 : this.gripRate;
    const slipBefore = angleDiff(this.heading, this.moveHeading);
    this.moveHeading += slipBefore * Math.min(1, hold * air * dt);
    this.slip = angleDiff(this.heading, this.moveHeading);
    /* החלקה עולה מהירות, ובדריפט ממלאת את הניטרו */
    this.speed -= Math.abs(this.slip) * (this.drifting ? 6 : 10) * dt * Math.sign(this.speed);
    if (this.drifting) this.nitro = Math.min(1, this.nitro + dt * 0.24 * Math.min(1, Math.abs(this.slip) * 3));
    this.nitro = Math.min(1, this.nitro + dt * 0.012);

    this.x += Math.sin(this.moveHeading) * this.speed * dt;
    this.z += Math.cos(this.moveHeading) * this.speed * dt;

    this.follow(track);
    this.checkPads(track);
    this.checkDraft(others, dt);

    /* גובה: צמודים לכביש, אלא אם הכביש מתעקל למטה מהר יותר ממה שהכובד מושך — אז עפים */
    const ground = this.groundHeight;
    this.airCooldown = Math.max(0, (this.airCooldown || 0) - dt);
    if (this.grounded) {
      const fling = this.speed * this.speed * track.vcurv[this.trackIndex];
      if (fling < -GRAVITY && this.speed > 20 && this.airCooldown <= 0) {
        this.grounded = false;
        /* יוצאים בשיפוע של הרמפה שלפני השפה, ועוד קצת — כדי שהרגע ירגיש */
        let ramp = 0;
        for (let k = 0; k <= 8; k++) ramp = Math.max(ramp, track.slopes[track.wrap(this.trackIndex - k)]);
        this.vy = this.speed * ramp + 1.5;
        this.y = ground;
      } else {
        this.y = ground;
        this.vy = this.speed * track.slopes[this.trackIndex];
      }
    } else {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= ground) {
        if (this.vy < -7) this.events.push("land");
        this.y = ground;
        this.vy = 0;
        this.grounded = true;
        this.airCooldown = 0.6;
      }
    }

    /* הקיר: מחזירים פנימה ומאבדים מהירות */
    const limit = WALL_OFFSET - CAR_RADIUS * 0.7;
    if (Math.abs(this.lateral) > limit) {
      const p = track.points[this.trackIndex], l = track.lefts[this.trackIndex], t = track.tangents[this.trackIndex];
      const clamped = Math.sign(this.lateral) * limit;
      /* מחזירים רק את הרכיב הצדדי — ההתקדמות לאורך המסלול נשמרת, כך שהמכונית מחליקה לאורך הקיר */
      const along = (this.x - p.x) * t.x + (this.z - p.z) * t.z;
      this.x = p.x + t.x * along + l.x * clamped;
      this.z = p.z + t.z * along + l.z * clamped;
      this.lateral = clamped;
      if (!this.hitWall && this.speed > 14) this.events.push("wall");
      this.speed *= Math.exp(-1.2 * dt); // שפשוף בקיר: כ-30% מהמהירות בשנייה
      /* מיישרים קצת את האף בחזרה לכיוון המסלול */
      const diff = angleDiff(track.headings[this.trackIndex], this.heading);
      if (Math.abs(diff) < Math.PI / 2) {
        this.heading += diff * Math.min(1, 4 * dt);
        this.moveHeading += angleDiff(track.headings[this.trackIndex], this.moveHeading) * Math.min(1, 6 * dt);
      }
      this.drifting = false;
      this.hitWall = true;
    } else {
      this.hitWall = false;
    }

    this.syncMesh(dt, track);
  }

  /* עדכון מיקום על המסלול והמרחק המצטבר */
  follow(track) {
    const { index, lateral, height } = track.locate(this.x, this.z, this.trackIndex);
    let delta = index - this.trackIndex;
    if (delta > track.count / 2) delta -= track.count;
    if (delta < -track.count / 2) delta += track.count;
    this.distance += delta;
    this.trackIndex = index;
    this.lateral = lateral;
    this.groundHeight = height;
  }

  checkPads(track) {
    if (!this.grounded) return;
    for (const pad of track.boosts) {
      let d = this.trackIndex - pad.index;
      if (d > track.count / 2) d -= track.count;
      if (d < -track.count / 2) d += track.count;
      if (d >= -2 && d <= 2 && Math.abs(this.lateral - pad.lateral) < 2.6) {
        if (this.padBoost < 0.6) this.events.push("pad");
        this.padBoost = 1.1;
      }
    }
  }

  /* נסיעה צמוד מאחורי מכונית אחרת: פחות התנגדות אוויר וטעינת ניטרו */
  checkDraft(others, dt) {
    this.drafting = false;
    if (!others || this.speed < 25) return;
    const fx = Math.sin(this.moveHeading), fz = Math.cos(this.moveHeading);
    for (const o of others) {
      if (o === this) continue;
      const dx = o.x - this.x, dz = o.z - this.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (ahead > 3 && ahead < 16 && side < 2.2 && Math.abs(o.y - this.y) < 2) {
        this.drafting = true;
        this.nitro = Math.min(1, this.nitro + dt * 0.1);
        return;
      }
    }
  }

  syncMesh(dt, track) {
    this.mesh.position.set(this.x, this.y + ROAD_TOP, this.z);
    this.mesh.rotation.y = this.heading;
    /* נטייה קדימה/אחורה לפי שיפוע הכביש; באוויר האף צונח לאט */
    const slope = track ? track.slopes[this.trackIndex] : 0;
    const pitchTarget = this.grounded ? -Math.atan(slope) : Math.max(-0.4, Math.min(0.4, -this.vy * 0.02));
    this.mesh.rotation.x += (pitchTarget - this.mesh.rotation.x) * Math.min(1, 10 * dt);
    /* הטיה קלה בפנייה — נותן תחושת מהירות; בדריפט יותר */
    const lean = -this.steer * Math.min(1, Math.abs(this.speed) / this.maxSpeed) * (this.drifting ? 0.12 : 0.06);
    this.body.rotation.z += (lean - this.body.rotation.z) * Math.min(1, 8 * dt);
    for (const w of this.wheels) w.rotation.x += (this.speed * dt) / 0.46;
    for (const p of this.frontPivots) p.rotation.y = this.steer * 0.45 - (this.drifting ? this.slip * 0.6 : 0);
    /* הצל נשאר על הכביש גם בקפיצה */
    const lift = this.y - (this.groundHeight ?? this.y);
    this.blob.position.y = 0.1 - lift;
    this.blob.material.opacity = Math.max(0.08, 0.25 - lift * 0.03);

    const flaming = this.nitroOn || this.padBoost > 0.4;
    this.flames.visible = flaming;
    if (flaming) {
      const f = 0.8 + Math.random() * 0.5;
      for (const fl of this.flames.children) fl.scale.set(1, f, 1);
    }
  }
}

/* דחיפה הדדית בין מכוניות שנוגעות זו בזו (ולא כשאחת על הגשר והשנייה מתחתיו) */
export function resolveCollisions(cars) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (Math.abs(a.y - b.y) > 2.5) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = CAR_RADIUS * 2 * 0.85;
      if (d > 0.001 && d < min) {
        const push = (min - d) / 2;
        const nx = dx / d, nz = dz / d;
        a.x -= nx * push; a.z -= nz * push;
        b.x += nx * push; b.z += nz * push;
        const rel = Math.abs(a.speed - b.speed);
        const avg = (a.speed + b.speed) / 2;
        a.speed = a.speed * 0.6 + avg * 0.4;
        b.speed = b.speed * 0.6 + avg * 0.4;
        if (rel > 4) {
          a.events.push("bump");
          b.events.push("bump");
        }
      }
    }
  }
}
