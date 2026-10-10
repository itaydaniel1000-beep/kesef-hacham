/* ===== חומרים בסגנון "מדבקה": צבע שטוח, שלושה גוונים, קו מתאר שחור ===== */

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

/* מפת גוונים קשיחה: שלוש מדרגות אור בלי מעבר רך */
const gradient = (() => {
  const data = new Uint8Array([90, 170, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();

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
      m.map?.dispose();
      m.dispose();
    }
  });
}

export function toon(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!cache.has(key)) cache.set(key, shared(new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...extra })));
  return cache.get(key);
}

const outlineMaterial = shared(new THREE.MeshBasicMaterial({ color: PALETTE.ink, side: THREE.BackSide }));

/* רשת עם קו מתאר: עותק הפוך ומוגדל קצת, בצבע הדיו */
export function outlined(geometry, color, thickness = 0.07) {
  const mesh = new THREE.Mesh(geometry, typeof color === "number" ? toon(color) : color);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  geometry.boundingBox.getSize(size);
  const shell = new THREE.Mesh(geometry, outlineMaterial);
  /* עובי קבוע בכל ציר, לא אחוז מהגודל — כדי שקופסה ארוכה לא תקבל קו עבה בקצוות */
  shell.scale.set(
    1 + (2 * thickness) / Math.max(size.x, 0.01),
    1 + (2 * thickness) / Math.max(size.y, 0.01),
    1 + (2 * thickness) / Math.max(size.z, 0.01)
  );
  mesh.add(shell);
  return mesh;
}
