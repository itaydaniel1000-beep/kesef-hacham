/* ===== חומרים: PBR רגיל (MeshStandardMaterial) עם מטמון, ושחרור זיכרון ===== */

import * as THREE from "three";

export const PALETTE = {
  ink: 0x1a1f2e,
  surface: 0xffffff,
  brand: 0x16785c,
  brandSoft: 0xd8efe6,
  gold: 0xf5c542,
  sky: 0x3f8fd8,
  berry: 0xd8503f,
  purple: 0x7a5cc9,
  grass: 0x8fcf7a,
  grassDark: 0x6fb85e,
  road: 0x4a5163,
  skyBg: 0xbfe0f7
};

const cache = new Map();

/* משאבים משותפים (חומרים מהמטמון, גאומטריות של מודול) מסומנים, כדי ששחרור לא ימחק אותם */
export function shared(resource) {
  resource.userData.shared = true;
  return resource;
}

/* משחרר מהזיכרון של הכרטיס הגרפי כל מה שנבנה במיוחד עבור העצם הזה — ולא נוגע במשותף */
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.isInstancedMesh) o.dispose();
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    for (const m of [].concat(o.material || [])) {
      if (m.userData.shared) continue;
      if (m.map && !m.map.userData.shared) m.map.dispose();
      m.dispose();
    }
  });
}

/* חומר מט רגיל — רוב העולם (עץ, סלע, אדמה, צבע) מחזיר אור בלי ברק */
export function toon(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!cache.has(key)) cache.set(key, shared(new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, envMapIntensity: 0.6, ...extra })));
  return cache.get(key);
}

/* רשת עם צל (השם נשאר מהגרסה המצוירת; קו המתאר הוסר במראה הריאליסטי) */
export function outlined(geometry, color) {
  const mesh = new THREE.Mesh(geometry, typeof color === "number" ? toon(color) : color);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
