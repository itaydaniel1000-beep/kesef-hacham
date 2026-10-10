/* ===== הגדרות המסלולים: צורה, גובה, צבעים ותוספות =====
   המסלולים ארוכים מאוד (כ-34,000 יחידות), ולכן הם נבנים מנוסחה ולא נקודה-נקודה:
   לולאה גדולה ולא סימטרית, ועליה קטעים של פיתולים חדים לסירוגין עם קטעים מהירים. */

import { PALETTE } from "./toon.js";

const TAU = Math.PI * 2;
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* לולאה סביב מרכז: כל זווית מקבלת רדיוס אחד בלבד, ולכן המסלול אף פעם לא חוצה את עצמו.
   הפיתולים הם גלים ברדיוס (פנימה-החוצה), ו"שער" קובע איפה יש פיתולים ואיפה קטע מהיר */
function meanderLoop({ R0, shape, waves, amp, sections, height = () => 0, perWave = 16 }) {
  const K = waves * perWave;
  const pts = [];
  for (let k = 0; k < K; k++) {
    const th = (k / K) * TAU;
    let r = R0;
    for (const [n, a, ph] of shape) r += R0 * a * Math.sin(n * th + ph);
    /* שער: 0 בקטעים המהירים (כולל קו הסיום בזווית 0), 1 בקטעי הפיתולים */
    const gate = smooth(0.15, 0.55, 0.5 - 0.5 * Math.cos(sections * th));
    /* אורך הגל משתנה מעט לאורך המסלול, כדי שכל קטע פיתולים ירגיש אחר */
    r += amp * gate * Math.sin(waves * th + 0.6 * Math.sin(3 * th + 0.4));
    pts.push({ th, x: r * Math.sin(th), z: r * Math.cos(th), y: height(th, gate) });
  }
  return pts;
}

/* מכניס קפיצה (רמפה עם שפה חדה) לקטע מהיר: מוחק את נקודות הבקרה שבאזור ושם במקומן את הרמפה */
function addJump(pts, th) {
  let i = 0;
  while (i < pts.length - 1 && pts[i + 1].th < th) i++;
  const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const tx = (b.x - a.x) / len, tz = (b.z - a.z) / len;
  const p = pts[i];
  /* אותה רמפה שנבדקה במסלול הקודם: כ-22% עד השפה ואז נפילה */
  const ramp = [[-70, 0], [-16, 0], [0, 1.4], [14, 4.6], [19, 5.6], [26, 3.2], [38, 0], [54, 0], [110, 0]];
  const keep = pts.filter((q) => {
    const d = (q.x - p.x) * tx + (q.z - p.z) * tz;
    const side = Math.abs((q.x - p.x) * tz - (q.z - p.z) * tx);
    return !(d > -95 && d < 135 && side < 60);
  });
  const at = keep.findIndex((q) => (q.x - p.x) * tx + (q.z - p.z) * tz > 0 && q.th > th - 0.2);
  const inserted = ramp.map(([d, y]) => ({ th, x: p.x + tx * d, z: p.z + tz * d, y }));
  keep.splice(at < 0 ? keep.length : at, 0, ...inserted);
  return keep;
}

/* שמינייה ענקית: x = sin t, z = sin 2t, ועליה פיתולים לאורך הלולאות. בחצייה השנייה — גשר */
function figureEight({ A, B, waves, amp }) {
  const K = waves * 16;
  const pts = [];
  const start = -0.12; // קו הסיום ממש לפני הצומת, בקטע התחתון
  for (let k = 0; k < K; k++) {
    const t = start + (k / K) * TAU;
    const toCross = Math.min(Math.abs(Math.sin(t)), 1);            // 0 בשני מעברי הצומת
    const fromBridge = Math.abs(Math.atan2(Math.sin(t - Math.PI), Math.cos(t - Math.PI)));
    const rampT = Math.min(1, Math.max(0, (0.13 - fromBridge) / 0.08));
    const y = 8.5 * rampT * rampT * (3 - 2 * rampT);
    /* נקודה על השמינייה, והכיוון הניצב לה — הפיתולים זזים לאורך הניצב */
    const x0 = -A * Math.sin(t), z0 = B * Math.sin(2 * t);
    const dx = -A * Math.cos(t), dz = 2 * B * Math.cos(2 * t);
    const dl = Math.hypot(dx, dz);
    const gate = smooth(0.32, 0.6, toCross) * smooth(0.25, 0.75, 0.5 - 0.5 * Math.cos(6 * t + 0.5));
    const w = amp * gate * Math.sin(waves * t + 0.5 * Math.sin(2 * t));
    pts.push({ th: t, x: x0 + (dz / dl) * w, z: z0 - (dx / dl) * w, y });
  }
  return pts;
}

const asControl = (pts) => pts.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10, Math.round(p.y * 10) / 10]);

/* משטחי האצה פזורים לאורך המסלול, לסירוגין בצדדים */
const padsEvery = (n, offset = 0) =>
  Array.from({ length: n }, (_, i) => [(offset + (i + 0.5) / n) % 1, [3, 0, -3][i % 3]]);

const forest = meanderLoop({
  R0: 4000,
  shape: [[2, 0.16, 0.7], [3, 0.09, 2.1], [5, 0.04, 0.3]],
  waves: 60,
  amp: 112,
  sections: 3,
  /* גבעות: עולות ויורדות לאורך כל המסלול */
  height: (th) => Math.max(0, 6.5 * Math.sin(9 * th + 0.8)) * smooth(0.05, 0.2, Math.min(th, TAU - th))
});

const desert = addJump(addJump(meanderLoop({
  R0: 4000,
  shape: [[2, 0.12, 2.4], [3, 0.12, 0.2], [4, 0.05, 1.3]],
  waves: 60,
  amp: 118,
  sections: 3,
  /* דיונות גבוהות בקטעי הפיתולים */
  height: (th, gate) => Math.max(0, 8 * Math.sin(7 * th + 2)) * gate
}), TAU / 3), (2 * TAU) / 3);

const snow = figureEight({ A: 4500, B: 2450, waves: 66, amp: 96 });

export const TRACKS = [
  {
    id: "forest",
    name: "יער",
    emoji: "🌲",
    blurb: "מסלול ענק: גבעות, ישורות מהירות ושלושה קטעי פיתולים",
    control: asControl(forest),
    boosts: padsEvery(18),
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
    name: "מדבר",
    emoji: "🌵",
    blurb: "דיונות, פיתולים ושתי קפיצות על הישורות",
    control: asControl(desert),
    boosts: padsEvery(18, 0.02),
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
    name: "שלג",
    emoji: "❄️",
    blurb: "שמינייה ענקית עם פיתולים, גשר ומשטחי קרח",
    control: asControl(snow),
    boosts: padsEvery(16, 0.04),
    ice: [[0.1, 0.13], [0.3, 0.33], [0.6, 0.63], [0.82, 0.85]],
    /* מכל גובה כזה ומעלה הכביש הוא גשר: בלי סוללת עפר, עם עמודים */
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
