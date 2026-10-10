/* ===== הגדרות המסלולים: צורה, גובה, צבעים ותוספות =====
   המסלולים מקוריים, ונכתבים כמו שמעצבי מסלולים במשחקי מרוצים חושבים: רצף של קטעים בעלי שם —
   ישורת, פנייה, סיכת ראש, פיתולי S, שיקנה, קפיצה. "צב" עובר לאורך הקטעים ומפיל נקודות בקרה,
   ובסוף עקומה חלקה סוגרת את הלולאה בחזרה לקו הזינוק. */

import { PALETTE } from "./toon.js";

const STEP = 12;               // מרחק בין נקודות בקרה
const DEG = Math.PI / 180;

class Pen {
  constructor() {
    this.x = 0;
    this.z = 0;
    this.y = 0;
    this.h = 0;                 // כיוון: 0 = לאורך ‎+z, כמו בכל המשחק
    this.pts = [[0, 0, 0]];
  }

  dot(y) {
    this.pts.push([Math.round(this.x * 10) / 10, Math.round(this.z * 10) / 10, Math.round(y * 10) / 10]);
  }

  /* ישורת, עם גובה יעד בסופה */
  straight(len, y = this.y) {
    const n = Math.max(1, Math.ceil(len / STEP));
    const y0 = this.y;
    for (let k = 1; k <= n; k++) {
      this.x += (Math.sin(this.h) * len) / n;
      this.z += (Math.cos(this.h) * len) / n;
      this.dot(y0 + ((y - y0) * k) / n);
    }
    this.y = y;
    return this;
  }

  /* פנייה: מעלות חיוביות = שמאלה, שליליות = ימינה */
  turn(deg, radius, y = this.y) {
    const total = deg * DEG;
    const n = Math.max(2, Math.ceil((Math.abs(total) * radius) / STEP));
    const d = total / n;
    const chord = 2 * radius * Math.sin(Math.abs(d) / 2);
    const y0 = this.y;
    for (let k = 1; k <= n; k++) {
      const mid = this.h + d / 2;
      this.x += Math.sin(mid) * chord;
      this.z += Math.cos(mid) * chord;
      this.h += d;
      this.dot(y0 + ((y - y0) * k) / n);
    }
    this.y = y;
    return this;
  }

  /* סיכת ראש: פנייה של 180 מעלות, הדוקה */
  hairpin(dir, radius = 26, y) {
    return this.turn(180 * dir, radius, y);
  }

  /* פיתולי S: פניות לסירוגין */
  esses(count, deg, radius, y) {
    const y0 = this.y;
    for (let i = 0; i < count; i++) {
      const sign = i % 2 ? -1 : 1;
      const first = i === 0 || i === count - 1 ? 0.5 : 1; // חצי פנייה בהתחלה ובסוף, כדי לצאת באותו כיוון
      this.turn(sign * deg * first, radius, y0 + ((y ?? y0) - y0) * ((i + 1) / count));
    }
    return this;
  }

  /* שיקנה: ימינה-שמאלה-ימינה קצר, כדי לשבור ישורת */
  chicane(dir, deg = 40, radius = 34) {
    return this.turn(deg * dir, radius).turn(-2 * deg * dir, radius).turn(deg * dir, radius);
  }

  /* קפיצה: אותה רמפה שנבדקה — 22% עד שפה חדה, ואז הכביש נופל */
  jump() {
    const ramp = [[16, 1.4], [30, 4.6], [35, 5.6], [42, 3.2], [54, 0], [70, 0]];
    let done = 0;
    for (const [d, y] of ramp) {
      this.x += Math.sin(this.h) * (d - done);
      this.z += Math.cos(this.h) * (d - done);
      done = d;
      this.dot(y);
    }
    this.y = 0;
    return this;
  }

  /* סגירת הלולאה: עקומת הרמיט מהמקום והכיוון הנוכחיים אל קו הזינוק, שנכנסת אליו בכיוון ‎+z */
  close(y = 0) {
    const x0 = this.x, z0 = this.z, y0 = this.y;
    const dist = Math.hypot(x0, z0);
    const m = dist * 0.9;
    const t0x = Math.sin(this.h) * m, t0z = Math.cos(this.h) * m;
    const t1x = 0, t1z = m;
    const n = Math.max(3, Math.ceil((dist * 1.3) / STEP));
    for (let k = 1; k < n; k++) {
      const s = k / n, s2 = s * s, s3 = s2 * s;
      const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
      this.x = h00 * x0 + h10 * t0x + h11 * t1x;
      this.z = h00 * z0 + h10 * t0z + h11 * t1z;
      this.dot(y0 + (y - y0) * s);
    }
    return this.pts;
  }
}

/* ---------- יער: גראנד-פרי טכני עם גבעות ----------
   לולאה עם ארבע פינות ימינה; בכל צלע תוספת שלא משנה את הכיוון הכללי */
const forest = new Pen()
  .straight(1150)                         // ישורת הזינוק
  .turn(-90, 55)                          // פינה 1: בלימה חזקה
  .straight(260)
  .esses(5, 100, 45, 8)                   // פיתולי S בעלייה
  .straight(300, 10)                      // פסגה עיוורת
  .turn(-90, 150, 4)                      // פינה 2: ירידה מהירה בפנייה רחבה
  .straight(220, 0)
  .chicane(1)                             // שיקנה
  .straight(240)
  .turn(110, 75).turn(-110, 75)           // "קרוסלה": פנייה ארוכה שמאלה ומיד ימינה
  .straight(260)
  /* "אצבע": יציאה הצידה, סיכת ראש, וחזרה במקביל */
  .turn(90, 40).straight(240).hairpin(-1, 28).straight(240).turn(90, 40)
  .straight(260)
  .turn(-45, 70).straight(70).turn(-45, 70) // פינה 3: שני אייפקסים
  .straight(1350)                         // הישורת האחורית
  .esses(5, 90, 50)                       // עוד פיתולי S לפני הפינה האחרונה
  .straight(300)
  .turn(-90, 60)                          // פינה 4
  .close();

/* ---------- מדבר: מהיר, עם שתי קפיצות וקניון צפוף ---------- */
const desert = new Pen()
  .straight(650)
  .turn(-60, 160)
  .straight(220)
  .jump()                                 // קפיצה ראשונה
  .straight(260)
  .turn(-100, 120, 3)
  .straight(300, 6)                       // דיונה גבוהה
  .turn(80, 140, 2)
  .straight(250, 0)
  /* הקניון: פניות של 90 מעלות לסירוגין בין קירות סלע */
  .turn(-90, 34).straight(70).turn(90, 34).straight(70).turn(-90, 34).straight(70).turn(90, 34)
  .straight(160)
  .turn(-90, 34).straight(70).turn(90, 34)
  .straight(160)
  .turn(-90, 34).straight(70).turn(90, 34)
  .straight(520)
  .turn(-120, 110)
  .straight(800)
  .jump()                                 // קפיצה שנייה
  .straight(600)
  .turn(-75, 150)
  .straight(360)
  .chicane(-1, 35, 40)
  .straight(500)
  .close();

/* ---------- שלג: שמינייה עם גשר ----------
   לולאה ימנית, מעבר על גשר מעל ישורת הזינוק, ולולאה שמאלית עם סיכות ראש במעלה ההר */
const snow = new Pen()
  .straight(330)                          // ישורת הזינוק — הגשר יעבור מעליה
  .turn(-90, 140)
  .straight(260)
  .esses(6, 95, 48)
  .straight(160)
  .turn(-90, 140)
  .straight(850)
  .turn(-90, 140)
  .straight(150, 3)
  .straight(170, 8.5)                     // עולים לגשר
  .straight(260, 8.5)                     // הגשר — מעל ישורת הזינוק
  .straight(170, 3)
  .straight(150, 0)
  .turn(90, 140)
  /* במעלה ההר: אצבע עם סיכת ראש */
  .straight(200)
  .turn(90, 40).straight(230, 3).hairpin(-1, 30, 4).straight(230, 2).turn(90, 40, 0)
  .straight(300)
  .turn(90, 140)
  .straight(750)
  .turn(90, 140)
  .straight(200)
  .close();

const padsEvery = (n, offset = 0) =>
  Array.from({ length: n }, (_, i) => [(offset + (i + 0.5) / n) % 1, [3, 0, -3][i % 3]]);

export const TRACKS = [
  {
    id: "forest",
    name: "גראנד-פרי היער",
    emoji: "🌲",
    blurb: "סיכות ראש, פיתולי S בעלייה, שיקנה וישורת ארוכה",
    control: forest,
    boosts: padsEvery(5),
    ice: [],
    bridge: null,
    theme: {
      ground: PALETTE.grass, embank: 0x7dbd68, sky: 0xbfe0f7, fog: [140, 330],
      curbA: PALETTE.berry, curbB: PALETTE.surface, wallA: PALETTE.sky, wallB: PALETTE.surface,
      dust: 0x9a7b54, hemiGround: 0x7fae6f, clouds: 14
    },
    scenery: "forest"
  },
  {
    id: "desert",
    name: "קניון השמש",
    emoji: "🌵",
    blurb: "מהיר: שתי קפיצות, דיונות וקניון של פניות חדות",
    control: desert,
    boosts: padsEvery(5, 0.05),
    ice: [],
    bridge: null,
    theme: {
      ground: 0xf0cf8a, embank: 0xe0b56a, sky: 0xf8dcae, fog: [130, 320],
      curbA: PALETTE.berry, curbB: PALETTE.gold, wallA: 0xd88a3f, wallB: PALETTE.surface,
      dust: 0xd9a95c, hemiGround: 0xd9b070, clouds: 5
    },
    scenery: "desert"
  },
  {
    id: "snow",
    name: "פסגת הקרח",
    emoji: "❄️",
    blurb: "שמינייה עם גשר, סיכות ראש במעלה ההר וקרח",
    control: snow,
    boosts: padsEvery(4, 0.1),
    ice: [[0.62, 0.66], [0.86, 0.9]],
    /* מכל גובה כזה ומעלה הכביש הוא גשר (הגשר ב-8.5; סיכת הראש בהר נשארת מתחת, ב-4): בלי סוללת עפר, עם עמודים */
    bridge: { minY: 4.5 },
    theme: {
      ground: 0xeef3f8, embank: 0xdfe8f1, sky: 0xd3e5f5, fog: [120, 300],
      curbA: PALETTE.sky, curbB: PALETTE.surface, wallA: PALETTE.purple, wallB: PALETTE.surface,
      dust: 0xffffff, hemiGround: 0xc9d6e4, clouds: 10
    },
    scenery: "snow"
  }
];

export const findTrack = (id) => TRACKS.find((t) => t.id === id) || TRACKS[0];
