/* ===== יכולת מיוחדת לכל רכב: המד מתמלא תוך כדי נהיגה, ומקש ק מפעיל — לשחקן ולבוטים ===== */

import { CAR_TYPES } from "./car.js";

export const ABILITIES = {
  turbo: { icon: "🔥", name: "טורבו", text: "בוסט חזק ל-3 שניות" },
  shield: { icon: "🛡️", name: "מגן", text: "4 שניות ששום דבר לא פוגע בך" },
  push: { icon: "💨", name: "דחיפה", text: "הודף הצידה את המכוניות הקרובות" },
  jump: { icon: "🦘", name: "קפיצה", text: "קפיצה גבוהה מעל מכשולים ומכוניות" },
  emp: { icon: "⚡", name: "EMP", text: "מאט את כל מי שקרוב אליך" }
};
export const abilityOf = (type) => CAR_TYPES[type]?.ability || "turbo";

const FILL_TIME = 15;      // שניות עד שהמד מתמלא בנהיגה רגילה
const PASS_BONUS = 0.08;   // עקיפה (קטן — בבלגן של הזינוק מתחלפים הרבה מקומות)
const LAND_BONUS = 0.1;    // נחיתה מקפיצה
const TURBO_TIME = 3;
const SHIELD_TIME = 4;
const JUMP_VY = 12;
const PUSH_RANGE = 8, EMP_RANGE = 15;
const EMP_SLOW = 1.5, PUSH_STUN = 0.35;

export class AbilitySystem {
  constructor(track) {
    this.track = track;
    this.fx = () => {};  // main.js מחבר לכאן קול וחלקיקים
    this.net = null;     // מולטיפלייר: main.js מחבר לכאן שליחת אירוע "יכולת"
    this.enabled = true; // נגד השעון: בלי יכולות
    this.cars = [];
  }

  /* מירוץ חדש: המד ריק לכולם */
  reset(cars) {
    this.cars = cars;
    for (const car of cars) {
      car.ability = abilityOf(car.type);
      car.charge = 0;
      car.chargeFull = 0;  // כמה זמן המד כבר מלא (לבוטים)
      car.shield = 0;
      car.turbo = 0;
      car.rank = null;
      car.wasGrounded = true;
    }
  }

  bonus(car, amount) {
    if (!this.enabled || car.remote || car.finished) return;
    car.charge = Math.min(1, car.charge + amount);
  }

  update(dt, cars, racing) {
    this.cars = cars;
    if (!racing || !this.enabled) return;
    /* כמה מכוניות לפני כל אחת — עקיפה ממלאת את המד */
    for (const car of cars) {
      if (car.remote || car.finished) continue;
      let rank = 0;
      for (const o of cars) if (o !== car && !o.gone && o.distance > car.distance) rank++;
      if (car.rank !== null && rank < car.rank) car.charge += PASS_BONUS * (car.rank - rank);
      car.rank = rank;
      if (car.grounded && !car.wasGrounded) car.charge += LAND_BONUS;
      car.wasGrounded = car.grounded;
      car.charge = Math.min(1, car.charge + dt / FILL_TIME);
      car.chargeFull = car.charge >= 1 ? car.chargeFull + dt : 0;
    }
  }

  /* הפעלה (מקש ק, או בוט). מחזיר כמה מכוניות נפגעו, או false אם אי אפשר עכשיו */
  use(car) {
    if (!this.enabled || car.finished || car.charge < 1) return false;
    if (car.ability === "jump" && !car.grounded) return false; // באוויר אי אפשר לקפוץ — לא מבזבזים את המד
    car.charge = 0;
    car.chargeFull = 0;
    const hits = this.apply(car, car.ability);
    this.net?.ability(car.netId, car.ability);
    return hits;
  }

  /* מה היכולת עושה. על מכוניות של אחרים (remote) לא נוגעים — אצלם זה נבדק במחשב שלהם */
  apply(owner, kind) {
    if (!owner) return 0;
    let hits = 0;
    if (kind === "turbo") {
      if (!owner.remote) {
        owner.turbo = TURBO_TIME;
        owner.padBoost = Math.max(owner.padBoost, TURBO_TIME);
      }
    } else if (kind === "shield") {
      owner.shield = SHIELD_TIME;
    } else if (kind === "jump") {
      if (!owner.remote && owner.grounded) {
        owner.grounded = false;
        owner.vy = JUMP_VY;
        owner.drifting = false;
      }
    } else if (kind === "push" || kind === "emp") {
      const range = kind === "push" ? PUSH_RANGE : EMP_RANGE;
      for (const o of this.cars) {
        if (o === owner || o.finished || o.gone || Math.abs(o.y - owner.y) > 3) continue;
        const dx = o.x - owner.x, dz = o.z - owner.z;
        const d = Math.hypot(dx, dz);
        if (d > range) continue;
        if (o.shield > 0) {
          this.fx("blocked", o);
          continue;
        }
        hits++;
        if (o.remote) continue; // הפגיעה עצמה קורית אצל מי שנוהג בה
        if (kind === "push") {
          const k = (PUSH_RANGE + 1 - d) * 0.45 / Math.max(d, 0.5);
          o.x += dx * k;
          o.z += dz * k;
          o.speed *= 0.6;
          o.stun = Math.max(o.stun, PUSH_STUN);
          o.drifting = false;
          o.heading += (Math.random() - 0.5) * 0.5;
          this.fx("pushed", o);
        } else {
          o.slow = Math.max(o.slow, EMP_SLOW);
          this.fx("zapped", o);
        }
      }
    }
    this.fx(kind, owner);
    return hits;
  }

  /* בוטים: מתי להפעיל */
  think(car, driver, cars) {
    if (!this.enabled || car.finished || car.charge < 1) return;
    const late = car.chargeFull > 10; // מחכים יותר מדי — מפעילים בכל זאת
    const obstacle = this.track.obstacles?.rowAhead(car, 30);
    const near = (range) => cars.some((o) => o !== car && !o.finished && !o.gone && o.shield <= 0 && Math.hypot(o.x - car.x, o.z - car.z) < range);
    let go = late;
    if (car.ability === "turbo") go ||= driver.onStraight && car.padBoost <= 0;
    else if (car.ability === "shield") go ||= !!obstacle || near(6);
    else if (car.ability === "push") go ||= near(PUSH_RANGE - 1.5);
    else if (car.ability === "jump") go ||= car.grounded && car.speed > 15 && obstacle && obstacle.meters > 8 && obstacle.meters < 18;
    else if (car.ability === "emp") go ||= near(EMP_RANGE - 3);
    if (go) this.use(car);
  }
}
