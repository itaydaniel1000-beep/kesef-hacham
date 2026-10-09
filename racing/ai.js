/* ===== נהג מחשב: עוקב אחרי נקודה קדימה על המסלול ומאט לפני עיקולים ===== */

export class Driver {
  constructor(car, { line = 0, caution = 1 } = {}) {
    this.car = car;
    this.line = line;        // היסט צדדי מועדף מהמרכז
    this.caution = caution;  // כמה הוא מאט בעיקולים (גבוה = זהיר יותר)
    this.wobble = Math.random() * 10;
  }

  update(dt, track, boost = 1) {
    const car = this.car;
    this.wobble += dt;

    const lookahead = 9 + Math.round(Math.abs(car.speed) * 0.35);
    const ti = track.wrap(car.trackIndex + lookahead);
    const p = track.points[ti], l = track.lefts[ti];
    /* בעיקול נצמדים לצד הפנימי, ובישר חוזרים לקו האישי */
    const sway = Math.sin(this.wobble * 0.7) * 1.2;
    const offset = this.line + sway;
    const tx = p.x + l.x * offset, tz = p.z + l.z * offset;

    let diff = Math.atan2(tx - car.x, tz - car.z) - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 3));

    /* מהירות יעד לפי חדות העיקול שלפנינו */
    const bend = Math.max(track.curvature(car.trackIndex, 22), track.curvature(car.trackIndex + 12, 26));
    const target = car.maxSpeed * boost * Math.max(0.42, 1 - bend * 0.95 * this.caution);

    car.input.steer = steer;
    if (car.speed < target - 0.5) {
      car.input.gas = 1;
      car.input.brake = 0;
    } else if (car.speed > target + 3) {
      car.input.gas = 0;
      car.input.brake = 0.6;
    } else {
      car.input.gas = 0;
      car.input.brake = 0;
    }
  }
}
