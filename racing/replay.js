/* ===== שידור חוזר: מקליטים את כל המכוניות 10 פעמים בשנייה, ומנגנים אחר כך במהירות כפולה ===== */

const STEP = 0.1;           // שניות בין דגימות
const MAX_FRAMES = 9000;    // 15 דקות — יותר ממירוץ של 5 הקפות
export const REPLAY_SPEED = 2;

const lerp = (a, b, f) => a + (b - a) * f;
const angleLerp = (a, b, f) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * f;

export class Replay {
  constructor() {
    this.reset();
  }

  reset() {
    this.frames = [];       // כל דגימה: מערך של netState() לכל מכונית, באותו סדר כמו cars
    this.timer = 0;
    this.time = 0;          // נקודת הניגון (בשניות של המירוץ)
  }

  get duration() {
    return Math.max(0, (this.frames.length - 1) * STEP);
  }

  record(cars, dt) {
    this.timer += dt;
    if (this.timer < STEP && this.frames.length) return;
    this.timer = Math.max(0, this.timer - STEP);
    if (this.frames.length < MAX_FRAMES) this.frames.push(cars.map((c) => c.netState()));
  }

  /* מציבים את כל המכוניות בנקודה t של ההקלטה (עם החלקה בין שתי דגימות) */
  apply(cars, t) {
    const n = this.frames.length;
    if (!n) return;
    const pos = Math.max(0, Math.min(n - 1, t / STEP));
    const i = Math.floor(pos), j = Math.min(n - 1, i + 1), f = pos - i;
    const A = this.frames[i], B = this.frames[j];
    cars.forEach((car, k) => {
      const a = A[k], b = B[k];
      if (!a || !b) return;
      car.x = lerp(a[0], b[0], f);
      car.y = lerp(a[1], b[1], f);
      car.z = lerp(a[2], b[2], f);
      car.heading = angleLerp(a[3], b[3], f);
      car.moveHeading = angleLerp(a[4], b[4], f);
      car.speed = lerp(a[5], b[5], f);
      car.distance = lerp(a[6], b[6], f);
      car.trackIndex = f < 0.5 ? a[7] : b[7];
      car.lateral = lerp(a[8], b[8], f);
      car.steer = lerp(a[11], b[11], f);
      car.nitroOn = !!a[12];
      car.padBoost = a[13];
      car.drifting = !!a[14];
      car.groundHeight = lerp(a[15], b[15], f);
      car.grounded = Math.abs(car.y - car.groundHeight) < 0.3;
      if (a[16] !== undefined) car.damage = a[16];
    });
  }
}
