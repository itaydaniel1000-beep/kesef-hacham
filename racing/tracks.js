/* ===== הגדרות המסלולים: צורה, גובה, צבעים ותוספות ===== */

import { PALETTE } from "./toon.js";

/* מסלול השלג הוא שמינייה: x = sin t, z = sin 2t. בחצייה השנייה הכביש עולה על גשר */
function figureEight() {
  const pts = [];
  const steps = 22;
  const start = -0.55; // קו הסיום לפני הצומת, בקטע התחתון
  for (let k = 0; k < steps; k++) {
    const t = start + (k / steps) * Math.PI * 2;
    const fromBridge = Math.abs(Math.atan2(Math.sin(t - Math.PI), Math.cos(t - Math.PI)));
    const ramp = Math.min(1, Math.max(0, (1.15 - fromBridge) / 0.6));
    const y = 8.5 * ramp * ramp * (3 - 2 * ramp);
    pts.push([-200 * Math.sin(t), 105 * Math.sin(2 * t), y]);
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
      [0, 0, 0], [0, 110, 0], [18, 175, 2.5], [75, 205, 5], [140, 180, 6], [165, 120, 3.5],
      [220, 92, 0.5], [282, 122, 0], [325, 80, 1.5], [312, 0, 4.5], [262, -62, 3], [185, -58, 0.5],
      [140, -18, 0], [92, -70, 0], [32, -86, 0]
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
      [0, 0, 0], [0, 90, 0], [10, 150, 4], [40, 200, 9], [90, 225, 9.5], [150, 215, 6],
      [185, 170, 2], [190, 110, 0], [230, 70, 0], [290, 62, 0], [326, 28, 0], [332, -8, 0],
      /* הקפיצה: רמפה של כ-22% עד שפה חדה, ואז הכביש נופל — המכונית עפה מעל הדיונה */
      [333, -24, 1.4], [333, -38, 4.6], [333, -43, 5.6], [333, -50, 3.2], [332, -62, 0],
      [328, -78, 0], [312, -102, 0],
      [250, -138, 0], [175, -132, 0], [130, -82, 0],
      [82, -112, 0], [30, -92, 0]
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
