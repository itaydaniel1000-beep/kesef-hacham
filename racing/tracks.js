/* ===== הגדרות המסלולים: צורה, גובה, צבעים ותוספות ===== */

import { PALETTE } from "./toon.js";

/* מסלול השלג הוא שמינייה: x = sin t, z = sin 2t. בחצייה השנייה הכביש עולה על גשר */
function figureEight() {
  const pts = [];
  const steps = 52;
  const start = -0.4; // קו הסיום לפני הצומת, בקטע התחתון
  for (let k = 0; k < steps; k++) {
    const t = start + (k / steps) * Math.PI * 2;
    const fromBridge = Math.abs(Math.atan2(Math.sin(t - Math.PI), Math.cos(t - Math.PI)));
    const ramp = Math.min(1, Math.max(0, (0.75 - fromBridge) / 0.4));
    const y = 8.5 * ramp * ramp * (3 - 2 * ramp);
    /* גלים קטנים לאורך הלולאות — עוד פניות, ומסלול ארוך יותר */
    const wiggle = 48 * Math.sin(3 * t) * Math.min(1, fromBridge / 0.9) * Math.min(1, Math.abs(Math.sin(t)) * 2.5);
    pts.push([-520 * Math.sin(t), 290 * Math.sin(2 * t) + wiggle, y]);
  }
  return pts;
}

export const TRACKS = [
  {
    id: "forest",
    name: "יער",
    emoji: "🌲",
    blurb: "גבעות ירוקות ויציע מלא",
    control: [
      [0, 0, 0], [0, 234, 0], [39, 338, 2], [143, 390, 5], [260, 364, 7], [325, 286, 6],
      [429, 260, 3], [546, 325, 1], [611, 442, 0], [728, 481, 0], [832, 416, 2], [845, 299, 4],
      [780, 195, 5], [806, 78, 4], [910, 13, 2], [988, -104, 0], [936, -221, 0], [806, -260, 1],
      [676, -195, 3], [559, -260, 4], [429, -234, 2], [338, -143, 0], [234, -182, 0], [130, -286, 0],
      [26, -260, 0], [-52, -156, 0], [-39, -65, 0]
    ],
    boosts: [[0.07, 0], [0.43, -3], [0.83, 3]],
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
    blurb: "עלייה תלולה וקפיצה מעל דיונה",
    control: [
      [0, 0, 0], [0, 218, 0], [29, 348, 4], [116, 450, 9], [246, 478, 9.5], [362, 435, 6],
      [420, 334, 2], [420, 218, 0], [493, 130, 0], [624, 116, 0], [725, 160, 0], [812, 261, 2],
      [928, 290, 3], [1044, 218, 1], [1073, 87, 0], [1076, 29, 0],
      /* הקפיצה: רמפה של כ-22% עד שפה חדה, ואז הכביש נופל — המכונית עפה מעל הדיונה */
      [1077, 13, 1.4], [1077, -1, 4.6], [1077, -6, 5.6], [1077, -13, 3.2], [1076, -25, 0], [1072, -41, 0],
      [1044, -130, 0], [957, -188, 0], [841, -174, 0], [754, -87, 0], [638, -72, 0], [551, -160, 0],
      [435, -246, 0], [290, -232, 0], [203, -145, 0], [87, -174, 0], [14, -102, 0]
    ],
    boosts: [[0.05, 3], [0.36, 0], [0.6, -2.5]],
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
    blurb: "שמינייה עם גשר ומשטחי קרח",
    control: figureEight(),
    boosts: [[0.2, -3], [0.7, 3]],
    ice: [[0.24, 0.31], [0.74, 0.8]],
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
