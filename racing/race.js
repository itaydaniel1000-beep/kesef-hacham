/* ===== מעקב המירוץ: הקפות, מקומות וזמנים ===== */

/* הקפה אחת על מסלול ארוך */
export const LAPS = 1;

export class Race {
  constructor(track, cars, player) {
    this.track = track;
    this.cars = cars;
    this.player = player;
    this.time = 0;
    this.finishOrder = [];
  }

  /* מתקדמים לפי מרחק מצטבר, כך שקיצור דרך או נסיעה אחורה לא סופרים הקפה */
  update(dt) {
    this.time += dt;
    const n = this.track.count;
    for (const car of this.cars) {
      if (car.finished) continue;
      const lap = Math.floor(car.distance / n);
      if (lap > car.lapTimes.length && lap >= 1) {
        car.lapTimes.push(this.time - car.lapStart);
        car.lapStart = this.time;
        car.justLapped = true;
      }
      if (car.distance >= n * LAPS) {
        car.finished = true;
        car.finishTime = this.time;
        this.finishOrder.push(car);
      }
    }
  }

  standings() {
    return [...this.cars].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
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

  currentLap(car) {
    return Math.min(LAPS, Math.max(1, Math.floor(car.distance / this.track.count) + 1));
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
