/* ===== מכשולים קבועים על הכביש, לפי המסלול: מחסומים ביער, בורות במדבר, ערימות שלג בשלג =====
   כל שורה חוסמת רק חלק מהכביש ומשאירה מעבר. המיקום קבוע — אותו דבר אצל כל השחקנים, בלי רשת */

import * as THREE from "three";
import { ROAD_HALF, ROAD_TOP } from "./track.js";

const ROWS = 7;
const PATTERNS = ["left", "right", "center", "right", "left", "center", "right"];
const BLOCK = { left: [0.5, ROAD_HALF], right: [-ROAD_HALF, -0.5], center: [-3, 3] };
const CAR_R = 0.9;          // "רדיוס" המכונית לבדיקת פגיעה
const NEAR_MISS = 1.8;      // עברת במרחק כזה מהמכשול בלי לפגוע — בונוס למד היכולת
const KIND_OF = { forest: "barrier", desert: "pit", snow: "snow" };

/* ===== טקסטורות ===== */
function canvasTex(size, draw) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* מחסום בטון: פסים אדומים-לבנים באלכסון, עם לכלוך ושריטות */
const stripeTex = () => canvasTex(256, (g, s) => {
  g.fillStyle = "#e9e6df";
  g.fillRect(0, 0, s, s);
  g.fillStyle = "#c8221a";
  for (let k = -4; k < 8; k += 2) {
    g.beginPath();
    g.moveTo(k * 40, 0);
    g.lineTo(k * 40 + 40, 0);
    g.lineTo(k * 40 + 40 + s * 0.6, s);
    g.lineTo(k * 40 + s * 0.6, s);
    g.fill();
  }
  let seed = 3;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(40,30,20,${rand() * 0.12})`;
    g.fillRect(rand() * s, rand() * s, 1 + rand() * 3, 1 + rand() * 3);
  }
  const dirt = g.createLinearGradient(0, s, 0, s * 0.55);
  dirt.addColorStop(0, "rgba(60,45,30,.55)");
  dirt.addColorStop(1, "rgba(60,45,30,0)");
  g.fillStyle = dirt;
  g.fillRect(0, 0, s, s);
});

/* בור בחול: כהה במרכז, ומתמזג לחול בשוליים */
const pitTex = () => canvasTex(256, (g, s) => {
  const r = s / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, "rgba(28,18,10,1)");
  grad.addColorStop(0.45, "rgba(58,38,20,1)");
  grad.addColorStop(0.78, "rgba(140,98,56,.95)");
  grad.addColorStop(1, "rgba(196,150,96,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 1400; i++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r * 0.9;
    g.fillStyle = `rgba(${rand() > 0.5 ? "230,190,140" : "20,12,6"},${rand() * 0.25})`;
    g.fillRect(r + Math.cos(a) * d, r + Math.sin(a) * d, 1.5, 1.5);
  }
});

let mats = null;
function materials() {
  if (mats) return mats;
  mats = {
    barrier: new THREE.MeshStandardMaterial({ map: stripeTex(), roughness: 0.78, metalness: 0 }),
    pit: new THREE.MeshStandardMaterial({ map: pitTex(), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -4 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xc89a62, roughness: 1 }),
    snow: new THREE.MeshPhysicalMaterial({ color: 0xf6f9ff, roughness: 0.82, sheen: 0.6, sheenColor: 0xbfd8ff, emissive: 0x1a2533, emissiveIntensity: 0.25 })
  };
  return mats;
}

/* מחסום "ניו ג'רזי": פרופיל (אורך × גובה) שנמתח לרוחב הכביש */
function barrierGeo(width) {
  const shape = new THREE.Shape([
    [-0.42, 0], [0.42, 0], [0.42, 0.16], [0.2, 0.34], [0.13, 1.0], [-0.13, 1.0], [-0.2, 0.34], [-0.42, 0.16]
  ].map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(Math.PI / 2); // הפרופיל לאורך המסלול, המתיחה לרוחב
  /* טקסטורה לפי המיקום בעולם — הפסים לא נמתחים */
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + pos.getZ(i)) * 0.45, pos.getY(i) * 0.9);
  return geo;
}

/* ערימת שלג: חצי כדור עם בליטות */
function snowGeo(seedStart) {
  const geo = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  let seed = seedStart;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const bumps = Array.from({ length: 6 }, () => [rand() * Math.PI * 2, 0.6 + rand() * 1.4, rand() * 0.12]);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    let k = 1;
    for (const [ph, f, amp] of bumps) k += Math.sin(a * f * 3 + ph) * amp * (0.4 + y);
    k += (rand() - 0.5) * 0.04;
    pos.setXYZ(i, x * k, y * (0.9 + (k - 1) * 0.6), z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

export class Obstacles {
  constructor(track) {
    this.track = track;
    this.kind = KIND_OF[track.def.id] || "barrier";
    this.group = new THREE.Group();
    track.group.add(this.group);
    this.onHit = () => {};      // main.js: קול, חלקיקים, סטטיסטיקה
    this.onNearMiss = () => {}; // main.js: בונוס למד היכולת
    this.rows = [];
    const m = materials();

    for (let r = 0; r < ROWS; r++) {
      /* כמו הקופסאות של פעם: לאורך המסלול, לא על הזינוק, לא ליד משטחי האצה או קרח */
      let index = Math.floor(track.count * (0.1 + (0.84 * (r + 0.5)) / ROWS));
      for (let tries = 0; tries < 12; tries++) {
        const nearPad = track.boosts.some((p) => Math.abs(p.index - index) < 25);
        const steep = Math.abs(track.vcurv?.[index] ?? 0) > 0.01;
        if (!nearPad && !track.isIce[index] && !steep) break;
        index = track.wrap(index + 25);
      }
      const pattern = PATTERNS[r % PATTERNS.length];
      const [a, b] = BLOCK[pattern];
      const p = track.points[index], l = track.lefts[index], t = track.tangents[index];
      const row = { index, pattern, a, b, pieces: [], p, l, t, heading: track.headings[index] };
      const place = (mesh, lat, along = 0) => {
        mesh.position.set(p.x + l.x * lat + t.x * along, p.y + ROAD_TOP, p.z + l.z * lat + t.z * along);
        mesh.rotation.y = row.heading;
        mesh.castShadow = mesh.receiveShadow = this.kind !== "pit";
        this.group.add(mesh);
        return mesh;
      };
      if (this.kind === "barrier") {
        /* מקטעים של 2.2 מ' עם רווח קטן ביניהם */
        const n = Math.max(1, Math.round((b - a) / 2.2));
        const w = (b - a) / n;
        for (let k = 0; k < n; k++) {
          const lat = a + w * (k + 0.5);
          place(new THREE.Mesh(barrierGeo(w - 0.12), m.barrier), lat);
          row.pieces.push({ lat, along: 0, halfLat: w / 2, halfAlong: 0.42, height: 1.0, shape: "box" });
        }
      } else if (this.kind === "pit") {
        /* בור אחד אליפטי לכל הרוחב החסום */
        const halfLat = (b - a) / 2, halfAlong = 2.3, lat = (a + b) / 2;
        const disk = place(new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), m.pit), lat);
        disk.scale.set(halfLat * 1.12, 1, halfAlong * 1.12);
        disk.position.y += 0.02;
        const rim = place(new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 6, 48).rotateX(Math.PI / 2), m.rim), lat);
        rim.scale.set(halfLat, 1.4, halfAlong);
        rim.position.y += 0.02;
        rim.castShadow = false;
        row.pieces.push({ lat, along: 0, halfLat: halfLat * 0.85, halfAlong: halfAlong * 0.8, height: 0.3, shape: "ellipse" });
      } else {
        /* ערימות שלג בגדלים שונים */
        const n = Math.max(2, Math.round((b - a) / 2.6));
        const w = (b - a) / n;
        for (let k = 0; k < n; k++) {
          const lat = a + w * (k + 0.5);
          const rr = w * 0.62 + ((r + k) % 3) * 0.12;
          const along = ((k % 2) - 0.5) * 0.8;
          const pile = place(new THREE.Mesh(snowGeo(17 + r * 7 + k), m.snow), lat, along);
          pile.scale.set(rr, rr * 0.62, rr * 0.9);
          pile.rotation.y += k * 1.7;
          row.pieces.push({ lat, along, halfLat: rr * 0.9, halfAlong: rr * 0.8, height: rr * 0.55, shape: "ellipse" });
        }
      }
      this.rows.push(row);
    }
  }

  /* המעבר בשורה: איפה כדאי לנסוע (לבוטים) */
  gapOf(row, lateral) {
    if (row.pattern === "left") return (row.a - ROAD_HALF) / 2;
    if (row.pattern === "right") return (row.b + ROAD_HALF) / 2;
    return lateral >= 0 ? (row.b + ROAD_HALF) / 2 : (row.a - ROAD_HALF) / 2;
  }

  /* השורה הקרובה לפניך (עד maxMeters) — לבוטים וליכולות */
  rowAhead(car, maxMeters) {
    const t = this.track;
    let best = null;
    for (const row of this.rows) {
      let d = row.index - car.trackIndex;
      if (d < 0) d += t.count;
      const meters = d * t.spacing;
      if (meters > maxMeters || d > t.count / 2) continue;
      if (!best || meters < best.meters) best = { row, meters, gap: this.gapOf(row, car.lateral) };
    }
    return best;
  }

  /* נתיב פנוי למטבעות — לא בתוך מכשול */
  freeLateral(index, lateral) {
    for (const row of this.rows) {
      let d = Math.abs(row.index - index);
      d = Math.min(d, this.track.count - d) * this.track.spacing;
      if (d < 6 && lateral > row.a - 1.5 && lateral < row.b + 1.5) return this.gapOf(row, lateral);
    }
    return lateral;
  }

  update(dt, cars) {
    const t = this.track;
    for (const car of cars) {
      if (car.remote || car.finished || car.gone) continue;
      car.obsCooldown = Math.max(0, (car.obsCooldown || 0) - dt);
      car.obsD ||= new Array(this.rows.length).fill(null);
      this.rows.forEach((row, r) => {
        /* איפה המכונית ביחס לשורה: לאורך המסלול (along) ולרוחב (lat) */
        const dx = car.x - row.p.x, dz = car.z - row.p.z;
        const along = dx * row.t.x + dz * row.t.z;
        const lat = dx * row.l.x + dz * row.l.z;
        const prev = car.obsD[r];
        car.obsD[r] = Math.abs(along) < 12 ? along : null;
        if (along > 4 && car.obsHitRow === r) car.obsHitRow = null;
        if (Math.abs(along) > 4 || Math.abs(car.y - row.p.y) > 3) return;
        const lift = car.y - row.p.y; // גובה מעל הכביש — בקפיצה עוברים מעל
        let hit = null;
        for (const pc of row.pieces) {
          if (lift > pc.height + 0.1 || lift < -2) continue;
          const u = lat - pc.lat, v = along - pc.along;
          const inside = pc.shape === "box"
            ? Math.abs(u) < pc.halfLat + CAR_R && Math.abs(v) < pc.halfAlong + CAR_R
            : (u / (pc.halfLat + CAR_R * 0.6)) ** 2 + (v / (pc.halfAlong + CAR_R * 0.6)) ** 2 < 1;
          if (inside) {
            hit = { pc, u, v };
            break;
          }
        }
        if (hit) {
          car.obsHitRow = r;
          if (car.shield > 0) {
            if (car.obsCooldown <= 0) {
              car.obsCooldown = 0.8;
              this.onHit(car, this.kind, true);
            }
            return;
          }
          if (this.kind === "barrier") {
            /* מחסום הוא קיר: לא עוברים דרכו — מחזירים את המכונית לצד שממנו הגיעה */
            const side = prev !== null && prev !== undefined ? Math.sign(prev - hit.pc.along) || -1 : Math.sign(hit.v) || -1;
            const push = side * (hit.pc.halfAlong + CAR_R + 0.05) - hit.v;
            car.x += row.t.x * push;
            car.z += row.t.z * push;
            car.obsD[r] = hit.pc.along + side * (hit.pc.halfAlong + CAR_R + 0.05);
          }
          if (car.obsCooldown > 0) return;
          car.obsCooldown = this.kind === "barrier" ? 1 : 1.4;
          if (this.kind === "barrier") {
            car.speed = Math.sign(car.speed) * Math.min(Math.abs(car.speed) * 0.25, 7);
            car.stun = Math.max(car.stun, 0.5);
            car.damage = Math.min(1, car.damage + 0.1);
          } else if (this.kind === "pit") {
            car.speed *= 0.4;
            car.slow = Math.max(car.slow, 0.7);
          } else {
            car.speed *= 0.55;
          }
          car.drifting = false;
          car.padBoost = Math.min(car.padBoost, 0.3);
          car.turbo = 0;
          this.onHit(car, this.kind, false);
          return;
        }
        /* עברת את השורה בלי לפגוע, ממש ליד המכשול — בונוס */
        if (prev !== null && prev !== undefined && prev < 0 && along >= 0 && car.obsHitRow !== r) {
          const edge = Math.min(...row.pieces.map((pc) => Math.abs(lat - pc.lat) - pc.halfLat));
          if (edge < NEAR_MISS) this.onNearMiss(car);
        }
      });
    }
  }
}
