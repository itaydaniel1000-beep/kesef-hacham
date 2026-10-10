/* ===== נוף לכל מסלול: עצים, קקטוסים, אנשי שלג, יציע, עננים והרים ברקע ===== */

import * as THREE from "three";
import { PALETTE, toon, outlined } from "./toon.js";
import { WALL_OFFSET } from "./track.js";

const geo = {
  trunk: new THREE.CylinderGeometry(0.35, 0.45, 2.4, 6),
  cone: new THREE.ConeGeometry(2.2, 4.6, 7),
  snowCap: new THREE.ConeGeometry(1.25, 2.1, 7),
  round: new THREE.IcosahedronGeometry(2.1, 0),
  rock: new THREE.DodecahedronGeometry(1.2, 0),
  cactus: new THREE.CylinderGeometry(0.55, 0.6, 5, 8),
  arm: new THREE.CylinderGeometry(0.38, 0.38, 2, 8),
  ball: new THREE.SphereGeometry(1, 12, 10),
  carrot: new THREE.ConeGeometry(0.16, 0.7, 6),
  dune: new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  mountain: new THREE.ConeGeometry(1, 1, 6),
  mesa: new THREE.CylinderGeometry(0.85, 1, 1, 7),
  cloud: new THREE.SphereGeometry(1, 10, 8),
  step: new THREE.BoxGeometry(3, 1.2, 40),
  fan: new THREE.SphereGeometry(0.55, 8, 6)
};

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
    const c = track.clearance(x, z);
    if (c < 1) continue;
    const thing = maker(rand);
    thing.scale.multiplyScalar(0.8 + rand() * 0.7);
    thing.rotation.y = rand() * Math.PI * 2;
    thing.position.set(x, 0, z);
    chunkAt(x, z).add(thing);
    placed++;
  }
  track.chunks = [...chunks.values()];

  /* שמיים: הרים ועננים בטבעת שנעה יחד עם המצלמה — במסלול ענק הם תמיד באופק */
  const sky = new THREE.Group();
  g.add(sky);
  track.sky = sky;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rand() * 0.2;
    const r = 300 + rand() * 40;
    const far = backdrop(track.def.scenery, rand);
    far.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    sky.add(far);
  }
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  const n = track.theme.clouds;
  for (let i = 0; i < n; i++) {
    const cloud = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const puff = new THREE.Mesh(geo.cloud, cloudMat);
      puff.scale.set(9 + k * 2, 5 + (k % 2) * 2, 7);
      puff.position.set(k * 9 - 13, (k % 2) * 2, 0);
      cloud.add(puff);
    }
    const a = (i / n) * Math.PI * 2 + 0.3;
    cloud.position.set(Math.cos(a) * 280, 70 + (i % 3) * 12, Math.sin(a) * 280);
    cloud.lookAt(0, cloud.position.y, 0);
    sky.add(cloud);
  }

  buildStand(track);
}

function forestThing(rand) {
  const t = new THREE.Group();
  const kind = rand();
  if (kind < 0.12) {
    const rock = outlined(geo.rock, 0xc9ced8, 0.08);
    rock.position.y = 0.7;
    rock.rotation.set(rand(), rand(), rand());
    t.add(rock);
    return t;
  }
  const trunk = outlined(geo.trunk, 0x8a5a3b, 0.08);
  trunk.position.y = 1.2;
  const crowns = [PALETTE.brand, PALETTE.grassDark, 0x2f9a6e];
  const crown = outlined(kind < 0.55 ? geo.cone : geo.round, crowns[Math.floor(rand() * 3)], 0.1);
  crown.position.y = kind < 0.55 ? 4.4 : 4;
  t.add(trunk, crown);
  return t;
}

function desertThing(rand) {
  const t = new THREE.Group();
  const kind = rand();
  if (kind < 0.5) {
    const green = 0x3f9a5a;
    const body = outlined(geo.cactus, green, 0.08);
    body.position.y = 2.5;
    t.add(body);
    for (const s of [1, -1]) {
      if (rand() < 0.25) continue;
      const h = 2.2 + rand() * 1.6;
      const elbow = outlined(geo.arm, green, 0.08);
      elbow.rotation.z = Math.PI / 2;
      elbow.scale.y = 0.7;
      elbow.position.set(s * 1, h, 0);
      const up = outlined(geo.arm, green, 0.08);
      up.position.set(s * 1.6, h + 0.9, 0);
      t.add(elbow, up);
    }
  } else if (kind < 0.8) {
    const rock = outlined(geo.rock, rand() < 0.5 ? 0xd88a3f : 0xc2703a, 0.08);
    rock.scale.set(1.4, 0.9, 1.2);
    rock.position.y = 0.6;
    rock.rotation.set(rand(), rand(), rand());
    t.add(rock);
  } else {
    const dune = outlined(geo.dune, 0xe8c27a, 0.025);
    dune.scale.set(7, 2.2, 5);
    t.add(dune);
  }
  return t;
}

function snowThing(rand) {
  const t = new THREE.Group();
  const kind = rand();
  if (kind < 0.1) {
    /* איש שלג */
    for (const [r, y] of [[1.3, 1.2], [0.95, 3], [0.65, 4.4]]) {
      const ball = outlined(geo.ball, PALETTE.surface, 0.07);
      ball.scale.setScalar(r);
      ball.position.y = y;
      t.add(ball);
    }
    const nose = new THREE.Mesh(geo.carrot, toon(0xf08a24));
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 4.4, 0.85);
    t.add(nose);
    return t;
  }
  if (kind < 0.2) {
    const rock = outlined(geo.rock, 0xa9c3dd, 0.08);
    rock.position.y = 0.7;
    rock.rotation.set(rand(), rand(), rand());
    t.add(rock);
    return t;
  }
  const trunk = outlined(geo.trunk, 0x7a5236, 0.08);
  trunk.position.y = 1.2;
  const crown = outlined(geo.cone, 0x2c7a5e, 0.1);
  crown.position.y = 4.4;
  const cap = outlined(geo.snowCap, PALETTE.surface, 0.08);
  cap.position.y = 5.9;
  t.add(trunk, crown, cap);
  return t;
}

function backdrop(kind, rand) {
  const t = new THREE.Group();
  if (kind === "desert") {
    const mesa = outlined(geo.mesa, rand() < 0.5 ? 0xd27a3c : 0xe09a52, 0.015);
    const h = 25 + rand() * 30;
    mesa.scale.set(30 + rand() * 30, h, 25 + rand() * 20);
    mesa.position.y = h / 2;
    t.add(mesa);
    return t;
  }
  const h = 60 + rand() * 50;
  const w = 45 + rand() * 30;
  const mountain = outlined(geo.mountain, kind === "snow" ? 0x9fb7d1 : 0x6fa58a, 0.012);
  mountain.scale.set(w, h, w);
  mountain.position.y = h / 2;
  t.add(mountain);
  const cap = outlined(geo.mountain, PALETTE.surface, 0.012);
  const capH = h * (kind === "snow" ? 0.45 : 0.28);
  cap.scale.set(w * (capH / h) * 1.02, capH, w * (capH / h) * 1.02);
  cap.position.y = h - capH / 2 + 0.3;
  t.add(cap);
  return t;
}

/* יציע צופים צבעוני ליד קו הסיום, בצד שבו יש מקום */
function buildStand(track) {
  const p0 = track.points[0], l0 = track.lefts[0];
  for (const side of [-1, 1]) {
    const cx = p0.x + l0.x * side * (WALL_OFFSET + 9), cz = p0.z + l0.z * side * (WALL_OFFSET + 9);
    if (track.blocksLowerRoad(cx, cz, 0)) continue;
    const stand = new THREE.Group();
    const colors = [PALETTE.berry, PALETTE.gold, PALETTE.sky, PALETTE.purple, PALETTE.brand];
    for (let row = 0; row < 4; row++) {
      const step = outlined(geo.step, PALETTE.surface, 0.08);
      step.position.set(row * 3, 0.6 + row * 1.2, 0);
      stand.add(step);
      for (let k = 0; k < 12; k++) {
        const fan = outlined(geo.fan, colors[(row * 3 + k) % colors.length], 0.08);
        fan.position.set(row * 3, 1.8 + row * 1.2, -16.5 + k * 3);
        stand.add(fan);
      }
    }
    stand.position.set(p0.x + l0.x * side * (WALL_OFFSET + 3), p0.y, p0.z + l0.z * side * (WALL_OFFSET + 3));
    /* השורה הראשונה ליד הקיר, והשורות הבאות מתרחקות מהכביש */
    stand.rotation.y = track.headings[0] + (side < 0 ? Math.PI : 0);
    track.group.add(stand);
    return;
  }
}

