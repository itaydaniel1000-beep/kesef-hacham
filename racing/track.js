/* ===== המסלול: עקומה סגורה, כביש, שוליים, קיר, עצים וקו סיום ===== */

import * as THREE from "three";
import { PALETTE, toon, outlined } from "./toon.js";

export const ROAD_HALF = 7;          // חצי רוחב הכביש
export const WALL_OFFSET = ROAD_HALF + 7; // איפה עומד הקיר מהמרכז
const SAMPLES = 900;

/* נקודות הבקרה של המסלול (x, z). הנקודה הראשונה היא קו הסיום, והמכוניות נוסעות לכיוון +z */
const CONTROL = [
  [0, 0], [0, 110], [18, 175], [75, 205], [140, 180], [165, 120],
  [220, 92], [282, 122], [325, 80], [312, 0], [262, -62], [185, -58],
  [140, -18], [92, -70], [32, -86]
];

export class Track {
  constructor() {
    const curve = new THREE.CatmullRomCurve3(
      CONTROL.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      "centripetal"
    );
    this.length = curve.getLength();
    this.count = SAMPLES;
    this.points = curve.getSpacedPoints(SAMPLES).slice(0, SAMPLES);
    this.tangents = this.points.map((_, i) => curve.getTangentAt(i / SAMPLES).setY(0).normalize());
    /* שמאל ביחס לכיוון הנסיעה */
    this.lefts = this.tangents.map((t) => new THREE.Vector3(t.z, 0, -t.x));
    this.headings = this.tangents.map((t) => Math.atan2(t.x, t.z));
    this.group = new THREE.Group();
  }

  wrap(i) {
    return ((i % this.count) + this.count) % this.count;
  }

  /* הנקודה הקרובה ביותר על המסלול, חיפוש מקומי סביב רמז כדי שלא נקפוץ לקטע אחר של המסלול */
  locate(x, z, hint, range = 40) {
    let best = hint;
    let bestD = Infinity;
    for (let k = -range; k <= range; k++) {
      const i = this.wrap(hint + k);
      const p = this.points[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    const p = this.points[best];
    const l = this.lefts[best];
    const lateral = (x - p.x) * l.x + (z - p.z) * l.z;
    return { index: best, lateral };
  }

  /* חיפוש מלא — רק לאתחול ולבדיקות פיזור עצים */
  distanceToCenter(x, z) {
    let bestD = Infinity;
    for (const p of this.points) bestD = Math.min(bestD, (p.x - x) ** 2 + (p.z - z) ** 2);
    return Math.sqrt(bestD);
  }

  /* זווית הפנייה בין i לבין i+ahead — מדד לחדות העיקול */
  curvature(i, ahead) {
    let a = this.headings[this.wrap(i + ahead)] - this.headings[this.wrap(i)];
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return Math.abs(a);
  }

  build(scene) {
    scene.add(this.group);
    this.buildGround();
    this.buildRoad();
    this.buildWalls();
    this.buildStartLine();
    this.buildScenery();
  }

  buildGround() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), toon(PALETTE.grass));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(160, -0.02, 60);
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  /* רצועה לאורך המסלול בין שני היסטים צדדיים. צבע לכל מקטע, כדי לקבל פסים חדים */
  ribbon(fromOffset, toOffset, y, colorAt, step = 1) {
    const pos = [];
    const col = [];
    const c = new THREE.Color();
    for (let i = 0; i < this.count; i += step) {
      const j = this.wrap(i + step);
      const a = this.points[i], b = this.points[j];
      const la = this.lefts[i], lb = this.lefts[j];
      const a1 = [a.x + la.x * fromOffset, y, a.z + la.z * fromOffset];
      const a2 = [a.x + la.x * toOffset, y, a.z + la.z * toOffset];
      const b1 = [b.x + lb.x * fromOffset, y, b.z + lb.z * fromOffset];
      const b2 = [b.x + lb.x * toOffset, y, b.z + lb.z * toOffset];
      pos.push(...a1, ...b1, ...a2, ...a2, ...b1, ...b2);
      c.set(colorAt(i));
      for (let v = 0; v < 6; v++) col.push(c.r, c.g, c.b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide }));
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  buildRoad() {
    const stripe = (a, b) => (i) => (Math.floor(i / 6) % 2 ? a : b);
    /* פס דיו סביב הכביש — אותו קו מתאר כמו בשאר העולם */
    this.ribbon(-ROAD_HALF - 1.6, ROAD_HALF + 1.6, 0.005, () => PALETTE.ink);
    this.ribbon(-ROAD_HALF, ROAD_HALF, 0.02, () => PALETTE.road);
    this.ribbon(ROAD_HALF - 0.05, ROAD_HALF + 1.4, 0.03, stripe(PALETTE.berry, PALETTE.surface));
    this.ribbon(-ROAD_HALF - 1.4, -ROAD_HALF + 0.05, 0.03, stripe(PALETTE.berry, PALETTE.surface));
    /* קו מרוסק באמצע */
    const dash = new THREE.PlaneGeometry(0.45, 3.2);
    const dashes = new THREE.InstancedMesh(dash, toon(PALETTE.surface), Math.ceil(this.count / 8));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    let n = 0;
    for (let i = 0; i < this.count; i += 8) {
      const p = this.points[i];
      e.set(-Math.PI / 2, 0, this.headings[i], "YXZ");
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(p.x, 0.04, p.z), q, new THREE.Vector3(1, 1, 1));
      dashes.setMatrixAt(n++, m);
    }
    dashes.count = n;
    dashes.receiveShadow = true;
    this.group.add(dashes);
  }

  buildWalls() {
    /* קיר צמיג נמוך משני הצדדים: פסים כחולים ולבנים */
    for (const side of [1, -1]) {
      const pos = [];
      const col = [];
      const c = new THREE.Color();
      const step = 2;
      const h = 1.1;
      for (let i = 0; i < this.count; i += step) {
        const j = this.wrap(i + step);
        const a = this.points[i], b = this.points[j];
        const la = this.lefts[i], lb = this.lefts[j];
        const ax = a.x + la.x * WALL_OFFSET * side, az = a.z + la.z * WALL_OFFSET * side;
        const bx = b.x + lb.x * WALL_OFFSET * side, bz = b.z + lb.z * WALL_OFFSET * side;
        pos.push(ax, 0, az, bx, 0, bz, ax, h, az, ax, h, az, bx, 0, bz, bx, h, bz);
        c.set(Math.floor(i / 6) % 2 ? PALETTE.sky : PALETTE.surface);
        for (let v = 0; v < 6; v++) col.push(c.r, c.g, c.b);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      geo.computeVertexNormals();
      const wall = new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide }));
      wall.castShadow = true;
      this.group.add(wall);
      /* קו דיו עבה על ראש הקיר */
      const top = [];
      for (let i = 0; i <= this.count; i += step) {
        const k = this.wrap(i);
        const p = this.points[k], l = this.lefts[k];
        top.push(new THREE.Vector3(p.x + l.x * WALL_OFFSET * side, h, p.z + l.z * WALL_OFFSET * side));
      }
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(top, true), this.count / step, 0.12, 4, true),
        new THREE.MeshBasicMaterial({ color: PALETTE.ink })
      );
      this.group.add(tube);
    }
  }

  buildStartLine() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 2; y++) {
        ctx.fillStyle = (x + y) % 2 ? "#1a1f2e" : "#ffffff";
        ctx.fillRect(x * 16, y * 16, 16, 16);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    const line = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 1.8), new THREE.MeshBasicMaterial({ map: tex }));
    line.rotation.set(-Math.PI / 2, this.headings[0], 0, "YXZ");
    line.position.set(this.points[0].x, 0.05, this.points[0].z);
    this.group.add(line);

    /* קשת קו הסיום */
    const arch = new THREE.Group();
    const postGeo = new THREE.BoxGeometry(0.9, 8, 0.9);
    for (const s of [1, -1]) {
      const post = outlined(postGeo, PALETTE.surface);
      post.position.set(s * (ROAD_HALF + 2.2), 4, 0);
      arch.add(post);
    }
    const bannerCanvas = document.createElement("canvas");
    bannerCanvas.width = 512;
    bannerCanvas.height = 96;
    const b = bannerCanvas.getContext("2d");
    b.fillStyle = "#f5c542";
    b.fillRect(0, 0, 512, 96);
    b.fillStyle = "#1a1f2e";
    b.font = "900 62px Heebo, Arial, sans-serif";
    b.textAlign = "center";
    b.textBaseline = "middle";
    b.direction = "rtl";
    b.fillText("🏁 קו סיום 🏁", 256, 52);
    const bannerTex = new THREE.CanvasTexture(bannerCanvas);
    bannerTex.colorSpace = THREE.SRGBColorSpace;
    const bannerMats = [toon(PALETTE.gold), toon(PALETTE.gold), toon(PALETTE.gold), toon(PALETTE.gold),
      new THREE.MeshBasicMaterial({ map: bannerTex }), new THREE.MeshBasicMaterial({ map: bannerTex })];
    const banner = outlined(new THREE.BoxGeometry((ROAD_HALF + 2.6) * 2, 2.2, 0.6), PALETTE.gold);
    banner.material = bannerMats;
    banner.position.y = 8;
    arch.add(banner);
    arch.position.copy(this.points[0]);
    arch.rotation.y = this.headings[0];
    this.group.add(arch);
    this.arch = arch;
  }

  buildScenery() {
    /* עצים ואבנים בפיזור קבוע (זרע קבוע = אותו נוף בכל טעינה) */
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.45, 2.4, 6);
    const crownGeo = new THREE.ConeGeometry(2.2, 4.6, 7);
    const roundGeo = new THREE.IcosahedronGeometry(2.1, 0);
    const rockGeo = new THREE.DodecahedronGeometry(1.2, 0);
    const crowns = [PALETTE.brand, PALETTE.grassDark, 0x2f9a6e];
    let placed = 0;
    for (let tries = 0; tries < 2400 && placed < 170; tries++) {
      const x = -120 + rand() * 560;
      const z = -180 + rand() * 470;
      const d = this.distanceToCenter(x, z);
      if (d < WALL_OFFSET + 4 || d > 95) continue;
      const tree = new THREE.Group();
      const kind = rand();
      if (kind < 0.12) {
        const rock = outlined(rockGeo, 0xc9ced8, 0.08);
        rock.position.y = 0.7;
        rock.rotation.set(rand(), rand(), rand());
        tree.add(rock);
      } else {
        const trunk = outlined(trunkGeo, 0x8a5a3b, 0.08);
        trunk.position.y = 1.2;
        tree.add(trunk);
        const crown = outlined(kind < 0.55 ? crownGeo : roundGeo, crowns[Math.floor(rand() * crowns.length)], 0.1);
        crown.position.y = kind < 0.55 ? 4.4 : 4;
        tree.add(crown);
      }
      const s = 0.8 + rand() * 0.7;
      tree.scale.setScalar(s);
      tree.position.set(x, 0, z);
      this.group.add(tree);
      placed++;
    }

    /* יציע צופים צבעוני ליד קו הסיום */
    const p0 = this.points[0], l0 = this.lefts[0];
    const stand = new THREE.Group();
    const colors = [PALETTE.berry, PALETTE.gold, PALETTE.sky, PALETTE.purple, PALETTE.brand];
    for (let row = 0; row < 4; row++) {
      const step = outlined(new THREE.BoxGeometry(3, 1.2, 40), PALETTE.surface, 0.08);
      step.position.set(row * 3, 0.6 + row * 1.2, 0);
      stand.add(step);
      for (let k = 0; k < 12; k++) {
        const fan = outlined(new THREE.SphereGeometry(0.55, 8, 6), colors[(row * 3 + k) % colors.length], 0.08);
        fan.position.set(row * 3, 1.8 + row * 1.2, -16.5 + k * 3);
        stand.add(fan);
      }
    }
    stand.position.set(p0.x - l0.x * (WALL_OFFSET + 3), 0, p0.z - l0.z * (WALL_OFFSET + 3));
    stand.rotation.y = this.headings[0] + Math.PI;
    this.group.add(stand);
  }
}
