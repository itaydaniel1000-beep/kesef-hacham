/* ===== מעקב המירוץ: הקפות, מקומות וזמנים ===== */

/* הקפה אחת על מסלול ארוך */
export const LAPS = 1;

export class Race {
  constructor(track, cars, player) {
    this.track = track;
    this.cars = cars;
    this.player = player;
    this.time = 0;
  }

  /* מתקדמים לפי מרחק מצטבר, כך שקיצור דרך או נסיעה אחורה לא סופרים הקפה */
  update(dt) {
    this.time += dt;
    const n = this.track.count;
    for (const car of this.cars) {
      if (car.finished) continue;
      if (car.distance >= n * LAPS) {
        car.finished = true;
        car.finishTime = this.time;
      }
    }
  }

  standings() {
    return [...this.cars].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime || b.distance - a.distance;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.distance - a.distance;
    });
  }

  placeOf(car) {
    return this.standings().indexOf(car) + 1;
  }

  /* כמה מהמירוץ עבר, מ-0 עד 1 */
  progress(car) {
    if (car.finished) return 1;
    return Math.min(1, Math.max(0, car.distance / (this.track.count * LAPS)));
  }

  /* זמן משוער למי שעוד לא סיים: לפי הקצב הממוצע שלו עד עכשיו */
  projectedTime(car) {
    if (car.finished) return car.finishTime;
    const total = this.track.count * LAPS;
    const done = Math.max(total * 0.05, car.distance); // מי שכמעט לא זז — בלי זמן הזוי
    return this.time * (total / done);
  }
}

export function formatTime(t) {
  const cs = Math.round(t * 100); // מעגלים קודם, כדי ש-59.996 יוצג 1:00.00 ולא 0:60.00
  const m = Math.floor(cs / 6000);
  const s = (cs - m * 6000) / 100;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}
