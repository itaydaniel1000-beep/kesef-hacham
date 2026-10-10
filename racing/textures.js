/* ===== טקסטורות שנוצרות בקוד (canvas): אספלט, דשא, חול, שלג וחישוקים — בלי קבצים לטעינה ===== */

import * as THREE from "three";

/* זרע קבוע — אותה טקסטורה בכל טעינה */
function random(seed) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

function canvasTexture(size, draw, { repeat = true } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  draw(canvas.getContext("2d"), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8; // three.js מגביל לבד למה שהכרטיס תומך
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

/* רעש: כל פיקסל מקבל סטייה קטנה מצבע הבסיס, ועליו כתמים רכים גדולים */
function noisy(base, { grain = 18, blotches = 40, blotchSize = 0.12, blotchShade = 0.12, seed = 1, specks = 0, speck = 0xffffff } = {}) {
  return (ctx, size) => {
    const rand = random(seed);
    const [r, g, b] = rgb(base);
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const n = (rand() - 0.5) * grain;
      img.data[i * 4] = r + n;
      img.data[i * 4 + 1] = g + n;
      img.data[i * 4 + 2] = b + n;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    /* כתמים — מצוירים גם בצד השני, כדי שהחזרה של הטקסטורה לא תיראה כתפר */
    for (let k = 0; k < blotches; k++) {
      const x = rand() * size, y = rand() * size, rad = size * blotchSize * (0.4 + rand());
      const dark = rand() < 0.5;
      const a = blotchShade * rand();
      for (const ox of [-size, 0, size]) {
        for (const oy of [-size, 0, size]) {
          const grad = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
          grad.addColorStop(0, dark ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`);
          grad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = grad;
          ctx.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
        }
      }
    }
    const [sr, sg, sb] = rgb(speck);
    for (let k = 0; k < specks; k++) {
      ctx.fillStyle = `rgba(${sr},${sg},${sb},${0.25 + rand() * 0.4})`;
      ctx.fillRect(rand() * size, rand() * size, 1 + rand(), 1 + rand());
    }
  };
}

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) {
    const tex = make();
    tex.userData.shared = true;
    cache.set(key, tex);
  }
  return cache.get(key);
}

/* אספלט: אפור כהה עם גרגרים בהירים, ופס כהה של צמיגים במרכז כל נתיב */
export const asphalt = () =>
  cached("asphalt", () =>
    canvasTexture(256, (ctx, size) => {
      noisy(0x4b4f57, { grain: 34, blotches: 30, blotchShade: 0.14, seed: 3, specks: 900, speck: 0xb8bcc4 })(ctx, size);
      /* עקבות צמיגים: שני פסים כהים לאורך (הטקסטורה נמתחת לרוחב הכביש) */
      for (const x of [0.3, 0.7]) {
        const grad = ctx.createLinearGradient((x - 0.08) * size, 0, (x + 0.08) * size, 0);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(0.5, "rgba(0,0,0,0.16)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
      }
    })
  );

/* קרקע לפי סוג המסלול. הצבע של הבסיס מגיע מהטקסטורה עצמה; החומר לבן */
const GROUNDS = {
  forest: { base: 0x6f9f4c, grain: 30, blotches: 60, blotchShade: 0.22, specks: 600, speck: 0x9fc46a, seed: 11 },
  desert: { base: 0xd9b07a, grain: 22, blotches: 50, blotchShade: 0.16, specks: 500, speck: 0x9a7650, seed: 12 },
  snow: { base: 0xe9eef4, grain: 10, blotches: 45, blotchShade: 0.1, specks: 200, speck: 0xc4d2e2, seed: 13 }
};
export const ground = (kind) =>
  cached(`ground-${kind}`, () => {
    const g = GROUNDS[kind] || GROUNDS.forest;
    return canvasTexture(256, noisy(g.base, g));
  });

/* פני החישוק: עיגול מתכת עם חמישה חישורים — רואים אותו מסתובב */
export const rimFace = () =>
  cached("rim", () =>
    canvasTexture(
      128,
      (ctx, size) => {
        const c = size / 2;
        ctx.fillStyle = "#1c1e22";
        ctx.fillRect(0, 0, size, size);
        const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
        grad.addColorStop(0, "#f2f4f7");
        grad.addColorStop(0.7, "#aeb4bd");
        grad.addColorStop(1, "#6d737c");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(c, c, c * 0.95, 0, Math.PI * 2);
        ctx.fill();
        /* החורים בין החישורים */
        ctx.fillStyle = "#24272c";
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(c + Math.cos(a - 0.42) * c * 0.3, c + Math.sin(a - 0.42) * c * 0.3);
          ctx.arc(c, c, c * 0.8, a - 0.5, a + 0.5);
          ctx.lineTo(c + Math.cos(a + 0.42) * c * 0.3, c + Math.sin(a + 0.42) * c * 0.3);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = "#8b9099";
        ctx.beginPath();
        ctx.arc(c, c, c * 0.16, 0, Math.PI * 2);
        ctx.fill();
      },
      { repeat: false }
    )
  );
