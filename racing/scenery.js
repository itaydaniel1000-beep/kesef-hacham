/* ===== נוף לכל מסלול: עצים, קקטוסים, אנשי שלג, יציע, עננים והרים ברקע ===== */

import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { toon, outlined, shared } from "./toon.js";
import { WALL_OFFSET } from "./track.js";

/* זרע קבוע לעיוותים של הגאומטריות המשותפות */
let gseed = 3;
const grand = () => (gseed = (gseed * 16807) % 2147483647) / 2147483647;

/* מזיז כל קודקוד קצת, אבל קודקודים באותו מקום זזים יחד — בלי חורים */
function jitter(geometry, amount, { keepBottom = false } = {}) {
  const pos = geometry.attributes.position;
  const moved = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!moved.has(key)) moved.set(key, [(grand() - 0.5) * amount, (grand() - 0.5) * amount, (grand() - 0.5) * amount]);
    const [dx, dy, dz] = moved.get(key);
    if (keepBottom && pos.getY(i) <= -0.49) continue;
    pos.setXYZ(i, pos.getX(i) + dx, pos.getY(i) + dy, pos.getZ(i) + dz);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/* אורן: שלוש קומות של ענפים, כל אחת צרה מהקודמת */
function pine() {
  const parts = [[2.5, 3, 3.4], [2, 2.7, 5], [1.4, 2.4, 6.5]].map(([r, h, y]) =>
    jitter(new THREE.ConeGeometry(r, h, 9, 2).toNonIndexed().translate(0, y, 0), 0.25));
  return mergeGeometries(parts);
}

/* עץ נשיר: כמה גושי עלווה בגדלים שונים */
function leafy() {
  const parts = [[0, 4.2, 0, 2.1], [1.1, 4.8, 0.4, 1.5], [-1, 4.6, -0.5, 1.6], [0.2, 5.6, -0.2, 1.4]].map(([x, y, z, r]) =>
    jitter(mergeVertices(new THREE.IcosahedronGeometry(r, 2).deleteAttribute("uv").deleteAttribute("normal")).translate(x, y, z), 0.35).toNonIndexed());
  return mergeGeometries(parts);
}

const geo = {
  trunk: new THREE.CylinderGeometry(0.28, 0.42, 2.8, 7),
  pine: pine(),
  leafy: leafy(),
  snowCap: jitter(new THREE.ConeGeometry(1.5, 1.8, 9, 1).toNonIndexed().translate(0, 6.9, 0), 0.15),
  rock: jitter(new THREE.DodecahedronGeometry(1.2, 1), 0.5),
  cactus: new THREE.CylinderGeometry(0.5, 0.58, 5, 12),
  arm: new THREE.CylinderGeometry(0.34, 0.34, 2, 10),
  ball: new THREE.SphereGeometry(1, 16, 12),
  carrot: new THREE.ConeGeometry(0.16, 0.7, 8),
  dune: new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  mesa: jitter(new THREE.CylinderGeometry(0.85, 1, 1, 14, 4), 0.06, { keepBottom: true }),
  step: new THREE.BoxGeometry(3, 1.2, 40),
  fanBody: new THREE.BoxGeometry(0.42, 0.75, 0.6),
  fanHead: new THREE.SphereGeometry(0.2, 10, 8)
};
for (const g of Object.values(geo)) shared(g);

/* הר ברקע: חרוט מעוות ברזולוציה גבוהה, עם שלג בפסגה (צבעי קודקודים), דהוי באובך */
const mountainGeos = new Map();
function mountainGeo(kind, haze) {
  const key = kind + haze;
  if (!mountainGeos.has(key)) {
    const g = jitter(new THREE.ConeGeometry(1, 1, 40, 14), 0.08, { keepBottom: true });
    const pos = g.attributes.position;
    const rock = new THREE.Color(kind === "snow" ? 0x6f7f92 : 0x5f7360);
    const snow = new THREE.Color(0xf4f7fb);
    const mist = new THREE.Color(haze);
    const snowLine = kind === "snow" ? 0.05 : 0.22;
    const col = [];
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      c.copy(y > snowLine + (grand() - 0.5) * 0.08 ? snow : rock);
      /* למטה האובך סמיך יותר — ההר נבלע באופק */
      c.lerp(mist, 0.35 + 0.35 * (0.5 - y));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    mountainGeos.set(key, shared(g));
  }
  return mountainGeos.get(key);
}

/* ענן: כתמים רכים חופפים על canvas, מוצג כספרייט שתמיד פונה למצלמה */
let cloudTex = null;
function cloudTexture() {
  if (cloudTex) return cloudTex;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  let seed = 5;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 26; k++) {
    const x = 50 + r() * 156, y = 50 + r() * 40, rad = 18 + r() * 34;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const shade = y > 75 ? 225 : 255; // הבטן של הענן קצת אפורה
    grad.addColorStop(0, `rgba(${shade},${shade},${shade + 5 > 255 ? 255 : shade + 5},0.55)`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);
  }
  cloudTex = new THREE.CanvasTexture(canvas);
  cloudTex.colorSpace = THREE.SRGBColorSpace;
  return cloudTex;
}

export function buildScenery(track) {
  const g = track.group;
  /* זרע קבוע = אותו נוף בכל טעינה */
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  /* הנוף מחולק לאזורים; בכל פריים מציירים רק את האזורים הקרובים למצלמה (ראו main.js) */
  const CHUNK = 220;
  const chunks = new Map();
  const chunkAt = (x, z) => {
    const key = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
    if (!chunks.has(key)) {
      const group = new THREE.Group();
      g.add(group);
      chunks.set(key, { group, x: (Math.floor(x / CHUNK) + 0.5) * CHUNK, z: (Math.floor(z / CHUNK) + 0.5) * CHUNK });
    }
    return chunks.get(key).group;
  };

  const maker = { forest: forestThing, desert: desertThing, snow: snowThing }[track.def.scenery];
  /* מפזרים לאורך המסלול: נקודה אקראית על המסלול, ומשם הצידה אל מחוץ לקיר */
  const want = Math.round(track.length / 11);
  let placed = 0;
  for (let tries = 0; tries < want * 6 && placed < want; tries++) {
    const i = Math.floor(rand() * track.count);
    const p = track.points[i], l = track.lefts[i];
    const side = rand() < 0.5 ? -1 : 1;
    const dist = WALL_OFFSET + 6 + p.y * 1.6 + rand() * 75;
    const x = p.x + l.x * side * dist, z = p.z + l.z * side * dist;
    const thing = maker(rand);
    const scale = 0.8 + rand() * 0.7;
    /* גם הקצה של עצם רחב (דיונה) צריך להישאר מחוץ לקיר, לא רק המרכז שלו */
    if (track.clearance(x, z) < 1 + (thing.userData.radius || 0) * scale) continue;
    thing.scale.multiplyScalar(scale);
    thing.rotation.y = rand() * Math.PI * 2;
    thing.position.set(x, 0, z);
    chunkAt(x, z).add(thing);
    placed++;
  }
  track.sceneryChunks = [...chunks.values()];

  /* שמיים: הרים ועננים בטבעת שנעה יחד עם המצלמה — במסלול ענק הם תמיד באופק */
  const sky = new THREE.Group();
  g.add(sky);
  track.sky = sky;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rand() * 0.2;
    const r = 380 + rand() * 40; // רחוק מעבר לכל מה שנראה — ובלי ערפל; האובך כבר צבוע בהרים
    const far = backdrop(track.def.scenery, rand, track.theme.haze);
    far.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    sky.add(far);
  }
  const cloudMat = new THREE.SpriteMaterial({ map: cloudTexture(), fog: false, depthWrite: false, transparent: true });
  const n = track.theme.clouds;
  for (let i = 0; i < n; i++) {
    const cloud = new THREE.Sprite(cloudMat);
    const w = 110 + rand() * 90;
    cloud.scale.set(w, w * 0.4, 1);
    const a = (i / n) * Math.PI * 2 + rand() * 0.4;
    const r = 260 + rand() * 60;
    cloud.position.set(Math.cos(a) * r, 95 + rand() * 50, Math.sin(a) * r);
    sky.add(cloud);
  }

  buildStand(track);
}

function rock(color, rand) {
  const m = outlined(geo.rock, color);
  m.position.y = 0.5;
  m.rotation.set(rand() * 6, rand() * 6, rand() * 6);
  return m;
}

const FOREST_GREENS = [0x2f5a2a, 0x3b6b31, 0x46793a, 0x2c4f2c];

function forestThing(rand) {
  const t = new THREE.Group();
  const kind = rand();
  if (kind < 0.12) {
    t.add(rock(0x8b8984, rand));
    return t;
  }
  const trunk = outlined(geo.trunk, 0x5a3e28);
  trunk.position.y = 1.4;
  const crown = outlined(kind < 0.55 ? geo.pine : geo.leafy, FOREST_GREENS[Math.floor(rand() * FOREST_GREENS.length)]);
  t.add(trunk, crown);
  return t;
}

function desertThing(rand) {
  const t = new THREE.Group();
  const kind = rand();
  if (kind < 0.5) {
    const green = rand() < 0.5 ? 0x4f7a3a : 0x5c8442;
    const body = outlined(geo.cactus, green);
    body.position.y = 2.5;
    t.add(body);
    for (const s of [1, -1]) {
      if (rand() < 0.25) continue;
      const h = 2.2 + rand() * 1.6;
      const elbow = outlined(geo.arm, green);
      elbow.rotation.z = Math.PI / 2;
      elbow.scale.y = 0.7;
      elbow.position.set(s * 1, h, 0);
      const up = outlined(geo.arm, green);
      up.position.set(s * 1.6, h + 0.9, 0);
      t.add(elbow, up);
    }
  } else if (kind < 0.8) {
    const r = rock(rand() < 0.5 ? 0xa8673a : 0x93583a, rand);
    r.scale.set(1.4, 0.9, 1.2);
    t.add(r);
  } else {
    const dune = outlined(geo.dune, 0xd9b07a);
    dune.castShadow = false;
    dune.scale.set(7, 2.2, 5);
    t.add(dune);
    t.userData.radius = 7;
  }
  return t;
}

function snowThing(rand) {
  const t = new THREE.Group();
  const kind = rand();
  if (kind < 0.1) {
    /* איש שלג */
    for (const [r, y] of [[1.3, 1.2], [0.95, 3], [0.65, 4.4]]) {
      const ball = outlined(geo.ball, 0xf4f7fb);
      ball.scale.setScalar(r);
      ball.position.y = y;
      t.add(ball);
    }
    const nose = new THREE.Mesh(geo.carrot, toon(0xe0761c));
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 4.4, 0.85);
    t.add(nose);
    return t;
  }
  if (kind < 0.2) {
    t.add(rock(0x7d8794, rand));
    return t;
  }
  const trunk = outlined(geo.trunk, 0x4a3324);
  trunk.position.y = 1.4;
  const crown = outlined(geo.pine, 0x23482f);
  const cap = outlined(geo.snowCap, 0xf4f7fb);
  t.add(trunk, crown, cap);
  return t;
}

function backdrop(kind, rand, haze) {
  const t = new THREE.Group();
  if (kind === "desert") {
    const base = new THREE.Color(rand() < 0.5 ? 0xb9744a : 0xc98a5a).lerp(new THREE.Color(haze), 0.45);
    const mesa = new THREE.Mesh(geo.mesa, toon(base.getHex(), { fog: false }));
    const h = 25 + rand() * 30;
    mesa.scale.set(30 + rand() * 30, h, 25 + rand() * 20);
    mesa.position.y = h / 2;
    t.add(mesa);
    return t;
  }
  const h = 60 + rand() * 50;
  const w = 45 + rand() * 30;
  const mountain = new THREE.Mesh(mountainGeo(kind, haze), toon(0xffffff, { fog: false, vertexColors: true }));
  mountain.scale.set(w, h, w);
  mountain.position.y = h / 2;
  mountain.rotation.y = rand() * Math.PI * 2;
  t.add(mountain);
  return t;
}

/* יציע צופים צבעוני ליד קו הסיום, בצד שבו יש מקום */
function buildStand(track) {
  const p0 = track.points[0], l0 = track.lefts[0];
  for (const side of [-1, 1]) {
    const cx = p0.x + l0.x * side * (WALL_OFFSET + 9), cz = p0.z + l0.z * side * (WALL_OFFSET + 9);
    if (track.blocksLowerRoad(cx, cz, 0)) continue;
    const stand = new THREE.Group();
    /* צופים: גוף בבגדים בצבעים שונים וראש — שניים-שלושה בכל קטע של מושב */
    const shirts = [0xb83a32, 0x2f5fa8, 0xe0b23a, 0x3d7a46, 0x2b2d33, 0xe8e8e8, 0x7a4fa0];
    const skins = [0xe0b48f, 0xc68e64, 0x8d5a3b, 0xf0cba8];
    let k = 0;
    for (let row = 0; row < 4; row++) {
      const step = outlined(geo.step, 0xb9bdc4);
      step.position.set(row * 3, 0.6 + row * 1.2, 0);
      stand.add(step);
      for (let z = -18.5; z < 19; z += 1.3 + ((k * 7) % 5) * 0.25) {
        k++;
        const body = outlined(geo.fanBody, shirts[(k * 5 + row) % shirts.length]);
        body.position.set(row * 3, 1.65 + row * 1.2, z);
        const head = new THREE.Mesh(geo.fanHead, toon(skins[(k * 3) % skins.length]));
        head.position.set(row * 3, 2.2 + row * 1.2, z);
        stand.add(body, head);
      }
    }
    stand.position.set(p0.x + l0.x * side * (WALL_OFFSET + 3), p0.y, p0.z + l0.z * side * (WALL_OFFSET + 3));
    /* השורה הראשונה ליד הקיר, והשורות הבאות מתרחקות מהכביש */
    stand.rotation.y = track.headings[0] + (side < 0 ? Math.PI : 0);
    track.group.add(stand);
    return;
  }
}

