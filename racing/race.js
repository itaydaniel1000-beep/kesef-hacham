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
    const done = Math.max(1, car.distance);
    return this.time * (total / done);
  }
}

export function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}
