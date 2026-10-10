/* ===== נהג מחשב: קו מירוץ מחושב, תכנון מהירות לפי גבולות המכונית, עקיפות וניטרו ===== */

import { ROAD_HALF, angleDiff } from "./track.js";

const LINE_LIMIT = ROAD_HALF - 2.2; // כמה רחוק מהמרכז קו המירוץ מרשה לעצמו (חצי מכונית + שוליים)
const BRAKE = 30;                   // האטה שהנהג מתכנן איתה — קצת פחות מהבלם המלא, ליתר ביטחון

/* קו המירוץ: מתחילים מאמצע הכביש ו"מותחים" אותו כמו גומייה — כל נקודה נמשכת לממוצע של
   השכנות שלה. כך הקו חותך לפנים כל פנייה (אייפקס) ומתיישר בישורות. מחושב פעם אחת לכל מסלול */
function racingLine(track) {
  if (track.raceLine) return track.raceLine;
  const n = track.count, P = track.points, L = track.lefts;
  const off = new Float32Array(n);
  const k = Math.max(4, Math.round(14 / track.spacing));
  for (let iter = 0; iter < 500; iter++) {
    for (let i = 0; i < n; i++) {
      const a = track.wrap(i - k), b = track.wrap(i + k);
      const ax = P[a].x + L[a].x * off[a], az = P[a].z + L[a].z * off[a];
      const bx = P[b].x + L[b].x * off[b], bz = P[b].z + L[b].z * off[b];
      const want = ((ax + bx) / 2 - P[i].x) * L[i].x + ((az + bz) / 2 - P[i].z) * L[i].z;
      off[i] = Math.max(-LINE_LIMIT, Math.min(LINE_LIMIT, off[i] + 0.5 * (want - off[i])));
    }
  }
  /* עקמומיות הקו בכל נקודה (1 חלקי רדיוס הסיבוב) */
  const curv = new Float32Array(n);
  const s = Math.max(2, Math.round(5 / track.spacing));
  const at = (i) => [P[i].x + L[i].x * off[i], P[i].z + L[i].z * off[i]];
  for (let i = 0; i < n; i++) {
    const [x0, z0] = at(track.wrap(i - s)), [x1, z1] = at(i), [x2, z2] = at(track.wrap(i + s));
    const h1 = Math.atan2(x1 - x0, z1 - z0), h2 = Math.atan2(x2 - x1, z2 - z1);
    const d = angleDiff(h2, h1);
    curv[i] = Math.abs(d) / Math.max(0.1, Math.hypot(x1 - x0, z1 - z0) / 2 + Math.hypot(x2 - x1, z2 - z1) / 2);
  }
  /* מחליקים מעט — כדי שרעש קטן בקו לא ייראה כמו פנייה */
  const smooth = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let j = -s; j <= s; j++) m = Math.max(m, curv[track.wrap(i + j)]);
    smooth[i] = m;
  }
  track.raceLine = { off, curv: smooth };
  return track.raceLine;
}

/* תכנון מהירות: כמה מהר אפשר לעבור כל נקודה, ואיפה צריך להתחיל לבלום לפני כל פנייה */
function speedPlan(track, car, skill) {
  const key = `${car.maxSpeed.toFixed(2)}|${car.turn}|${skill}`;
  track.plans ??= new Map();
  if (track.plans.has(key)) return track.plans.get(key);
  const { curv } = racingLine(track);
  const n = track.count;
  const v = new Float32Array(n);
  /* מהפיזיקה של המכונית (car.js): קצב הפנייה = turn × (1 − 0.3·v/vmax), ולכן הרדיוס הקטן ביותר
     במהירות v הוא v / קצב. מכאן המהירות המרבית לעקמומיות נתונה. skill = כמה קרוב לגבול נוסעים */
  const turn = car.turn * skill;
  for (let i = 0; i < n; i++) {
    const corner = turn / (curv[i] + (0.3 * turn) / car.maxSpeed);
    v[i] = Math.min(car.maxSpeed, corner) * (track.isIce[i] ? 0.8 : 1);
  }
  /* מעבר אחורה: אי אפשר להגיע לפנייה מהר יותר ממה שאפשר לבלום עד אליה */
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const next = v[track.wrap(i + 1)];
      v[i] = Math.min(v[i], Math.sqrt(next * next + 2 * BRAKE * track.spacing));
    }
  }
  track.plans.set(key, v);
  return v;
}

export class Driver {
  constructor(car, { lane = 0, skill = 0.88 } = {}) {
    this.car = car;
    this.lane = lane;        // נטייה אישית קטנה מהקו, כדי שלא כולם ייסעו באותו מילימטר
    this.skill = skill;      // כמה קרוב לגבול האחיזה הוא נוסע בפניות
    this.reset();
  }

  /* מתחילים כל מירוץ נקי — בלי רוורס, עקיפה או ניטרו שנשארו מהמירוץ הקודם */
  reset() {
    this.avoid = 0;          // הזזה זמנית לצד, לעקיפה
    this.usingNitro = false;
    this.stuck = 0;
    this.reverse = 0;
    this.passing = null;     // את מי עוקפים עכשיו, ומאיזה צד
    this.passSide = 0;
    this.cruise = 0;         // מהירות שיוט אחרי הסיום (0 = מירוץ רגיל)
  }

  /* מחשבים מראש את קו המירוץ ותכנון המהירות — ברקע במוסך (main.js), ולכל המאוחר בלחיצה על "יוצאים" */
  prepare(track) {
    this.planTrack = track;
    this.plan = speedPlan(track, this.car, this.skill);
  }

  update(dt, track, boost = 1, others = []) {
    const car = this.car;
    const line = racingLine(track);
    if (this.planTrack !== track) this.prepare(track);
    const plan = this.plan;
    const i = car.trackIndex;
    const v = Math.abs(car.speed);

    /* חילוץ: אם נתקע בקיר — רוורס קצר עם הגה הפוך */
    if (this.reverse > 0) {
      this.reverse -= dt;
      Object.assign(car.input, { gas: 0, brake: 1, nitro: 0, drift: 0, steer: car.lateral > 0 ? 1 : -1 });
      /* ברוורס ההגה הפוך: כדי שהאף יתרחק מקיר שמשמאל (lateral חיובי) מסובבים שמאלה */
      return;
    }
    this.stuck = v < 2 && car.input.gas ? this.stuck + dt : 0;
    if (this.stuck > 1.2) {
      this.stuck = 0;
      this.reverse = 0.9;
    }

    /* עקיפה: מכונית איטית ממש לפנינו על אותו קו? עוברים לצד שיש בו יותר מקום */
    let want = 0;
    const ahead = 16 / track.spacing;
    /* הקרבה נמדדת מהקו הרגיל שלנו (בלי הזזת העקיפה), כדי שהעקיפה לא "תשכח" את המכונית באמצע ותתנדנד */
    const myLine = line.off[i] + this.lane;
    let slow = null;
    for (const o of others) {
      if (o === car) continue; // גם מכונית שסיימה עדיין על הכביש
      const gap = o.distance - car.distance;
      if (gap <= 0 || gap > ahead || Math.abs(o.y - car.y) > 2.5) continue;
      if (Math.abs(o.lateral - myLine) > 3 || o.speed > car.speed + 1.5) continue;
      slow = o;
      break;
    }
    if (slow) {
      /* הצד נבחר פעם אחת לכל עקיפה — לצד הרחב יותר — ולא מתחלף באמצע */
      if (this.passing !== slow) {
        this.passing = slow;
        this.passSide = slow.lateral > 0 ? -1 : 1;
      }
      want = slow.lateral + this.passSide * 3.6 - myLine;
    } else {
      this.passing = null;
    }
    this.avoid += (want - this.avoid) * Math.min(1, 3 * dt);

    /* היגוי: רודפים אחרי נקודה על הקו, רחוקה יותר ככל שנוסעים מהר */
    const look = 7 + v * 0.28;
    const ti = track.wrap(i + Math.round(look / track.spacing));
    const lat = Math.max(-ROAD_HALF + 1.2, Math.min(ROAD_HALF - 1.2, line.off[ti] + this.lane + this.avoid));
    const p = track.points[ti], l = track.lefts[ti];
    const tx = p.x + l.x * lat, tz = p.z + l.z * lat;
    const alpha = angleDiff(Math.atan2(tx - car.x, tz - car.z), car.heading);
    const dist = Math.max(3, Math.hypot(tx - car.x, tz - car.z));
    /* העקמומיות שצריך כדי להגיע לנקודה, חלקי העקמומיות שהמכונית מסוגלת לה במהירות הזאת */
    let need = (2 * Math.sin(alpha)) / dist;
    /* כשהמכונית מסתכלת אחורה, sin קטן מדי — מסובבים את ההגה עד הסוף כדי להסתובב */
    if (Math.abs(alpha) > Math.PI / 2) need = Math.sign(alpha) * 1e3;
    const can = (car.turn * Math.min(1, Math.max(v, 4) / 9) * (1 - 0.3 * Math.min(1, v / car.maxSpeed))) / Math.max(v, 4);
    car.input.steer = Math.max(-1, Math.min(1, need / can));
    car.input.drift = 0;

    /* מהירות: לפי התכנון, קצת קדימה (המכונית צריכה זמן להאט) */
    const plannedAhead = plan[track.wrap(i + Math.round((v * 0.15) / track.spacing) + 2)];
    /* עזרת ההשלמה (boost מעל 1) פועלת רק בישורות — בפנייה התכנון כבר על גבול האחיזה */
    const planned = Math.min(plan[i], plannedAhead);
    let target = boost > 1 && planned < car.maxSpeed * 0.97 ? planned : planned * boost;
    car.topScale = boost > 1 ? boost : 1; // הפיזיקה מגבילה למהירות המרבית — העזרה מרימה את התקרה עצמה
    if (this.avoid !== 0 && Math.abs(want) > 0) target *= 0.98; // באמצע עקיפה — בלי להתפרע

    /* ניטרו: רק כשלפנינו ישורת ארוכה שבה התכנון מרשה לנסוע מהר מהמהירות הנוכחית */
    const straight = 160 / track.spacing;
    let minAhead = Infinity;
    for (let j = 0; j < straight; j += 8) minAhead = Math.min(minAhead, plan[track.wrap(i + j)]);
    if (!this.usingNitro && car.nitro > 0.3 && minAhead >= car.maxSpeed * 0.97 && boost >= 0.98) this.usingNitro = true;
    if (this.usingNitro && (car.nitro < 0.03 || minAhead < car.maxSpeed * 0.9)) this.usingNitro = false;
    if (this.usingNitro || car.padBoost > 0) target = Math.max(target, Math.min(minAhead * 1.28, car.maxSpeed * 1.28));
    if (this.cruise) {
      /* אחרי הסיום: מגלגלים ומאטים בעדינות — בלי בלימת חירום מול מי שבא מאחור */
      this.usingNitro = false;
      car.topScale = 1;
      Object.assign(car.input, { nitro: 0, gas: v < this.cruise ? 1 : 0, brake: v > this.cruise + 15 ? 0.15 : 0 });
      return;
    }

    car.input.nitro = this.usingNitro ? 1 : 0;
    if (v < target - 0.3) {
      car.input.gas = 1;
      car.input.brake = 0;
    } else if (v > target + 0.8) {
      car.input.gas = 0;
      car.input.brake = Math.min(1, Math.max(0.3, (v - target) / 4));
      car.input.nitro = 0;
    } else {
      car.input.gas = v < target ? 1 : 0;
      car.input.brake = 0;
    }
  }
}
