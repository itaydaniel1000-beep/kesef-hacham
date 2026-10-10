/* ===== המסלול: עקומה סגורה עם גובה, כביש, שוליים, קיר, סוללות, גשר וקו סיום ===== */

import * as THREE from "three";
import { PALETTE, toon, outlined } from "./toon.js";
import { buildScenery } from "./scenery.js";

export const ROAD_HALF = 7;               // חצי רוחב הכביש
export const WALL_OFFSET = ROAD_HALF + 7; // איפה עומד הקיר מהמרכז
const SAMPLES = 900;
const EMBANK_SLOPE = 1.6;                 // כמה רחוק יוצאת הסוללה לכל יחידת גובה

export class Track {
  constructor(def) {
    this.def = def;
    this.theme = def.theme;
    const curve = new THREE.CatmullRomCurve3(
      def.control.map(([x, z, y = 0]) => new THREE.Vector3(x, y, z)),
      true,
      "centripetal"
    );
    this.count = SAMPLES;
    this.points = curve.getSpacedPoints(SAMPLES).slice(0, SAMPLES);
    this.length = curve.getLength();
    this.spacing = this.length / SAMPLES;

    const full = this.points.map((_, i) => curve.getTangentAt(i / SAMPLES));
    this.tangents = full.map((t) => t.clone().setY(0).normalize());
    /* שיפוע: כמה עולים לכל יחידה אופקית */
    this.slopes = full.map((t) => t.y / Math.max(0.001, Math.hypot(t.x, t.z)));
    /* שמאל ביחס לכיוון הנסיעה */
    this.lefts = this.tangents.map((t) => new THREE.Vector3(t.z, 0, -t.x));
    this.headings = this.tangents.map((t) => Math.atan2(t.x, t.z));
    /* עקמומיות אנכית: כמה מהר השיפוע משתנה לאורך הדרך. שלילי חזק = פסגה חדה שאפשר לעוף ממנה */
    this.vcurv = this.slopes.map((_, i) =>
      (this.slopes[this.wrap(i + 3)] - this.slopes[this.wrap(i - 3)]) / (6 * this.spacing));

    const minY = def.bridge?.minY ?? Infinity;
    this.isBridge = this.points.map((p) => p.y >= minY);
    this.isIce = new Array(SAMPLES).fill(false);
    for (const [a, b] of def.ice) {
      for (let i = Math.floor(a * SAMPLES); i < b * SAMPLES; i++) this.isIce[this.wrap(i)] = true;
    }
    this.boosts = def.boosts.map(([f, lateral]) => ({ index: Math.floor(f * SAMPLES), lateral }));

    this.group = new THREE.Group();
  }

  wrap(i) {
    return ((i % this.count) + this.count) % this.count;
  }

  /* הנקודה הקרובה ביותר על המסלול. חיפוש מקומי סביב רמז, כך שגם בצומת של השמינייה לא קופצים לקטע השני */
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
    const t = this.tangents[best];
    const lateral = (x - p.x) * l.x + (z - p.z) * l.z;
    const along = (x - p.x) * t.x + (z - p.z) * t.z;
    /* גובה הכביש בדיוק מתחת למכונית: אינטרפולציה לאורך הקטע לדגימה הבאה או הקודמת, כך שהגובה רציף */
    const q = this.points[this.wrap(best + (along >= 0 ? 1 : -1))];
    const height = p.y + (q.y - p.y) * Math.min(1, Math.abs(along) / this.spacing);
    return { index: best, lateral, height };
  }

  /* כמה מקום פנוי יש בנקודה מסוימת (שלילי = על הכביש או על הסוללה) — לפיזור נוף */
  clearance(x, z) {
    let best = Infinity;
    for (const p of this.points) {
      const d = Math.hypot(p.x - x, p.z - z) - (WALL_OFFSET + 3 + p.y * EMBANK_SLOPE);
      if (d < best) best = d;
    }
    return best;
  }

  /* זווית הפנייה בין i לבין i+ahead — מדד לחדות העיקול */
  curvature(i, ahead) {
    let a = this.headings[this.wrap(i + ahead)] - this.headings[this.wrap(i)];
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return Math.abs(a);
  }

  /* מטריצה שמניחה משטח שטוח על הכביש: X לרוחב, Y קדימה לאורך השיפוע, Z למעלה */
  surfaceMatrix(i, lateral, lift) {
    const p = this.points[i], l = this.lefts[i], t = this.tangents[i];
    const right = new THREE.Vector3(-l.x, 0, -l.z);
    const fwd = new THREE.Vector3(t.x, this.slopes[i], t.z).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd);
    const m = new THREE.Matrix4().makeBasis(right, fwd, up);
    m.setPosition(p.x + l.x * lateral, p.y + lift, p.z + l.z * lateral);
    return m;
  }

  build(scene) {
    scene.add(this.group);
    this.buildGround();
    this.buildRoad();
    this.buildWalls();
    this.buildEmbankments();
    this.buildPads();
    this.buildStartLine();
    buildScenery(this);
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((o) => {
      o.geometry?.dispose();
      /* חומרים משותפים נשמרים במטמון של toon.js — משחררים רק טקסטורות שנוצרו כאן */
      for (const m of [].concat(o.material || [])) m.map?.dispose();
    });
  }

  buildGround() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), toon(this.theme.ground));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(160, -0.05, 40);
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  /* רצועה לאורך המסלול בין שני היסטים צדדיים, בגובה הכביש. צבע לכל מקטע, כדי לקבל פסים חדים */
  ribbon(fromOffset, toOffset, lift, colorAt, { step = 1, from = 0, to = this.count, opacity = 1 } = {}) {
    const pos = [];
    const col = [];
    const c = new THREE.Color();
    for (let i = from; i < to; i += step) {
      const ii = this.wrap(i), j = this.wrap(i + step);
      const a = this.points[ii], b = this.points[j];
      const la = this.lefts[ii], lb = this.lefts[j];
      const a1 = [a.x + la.x * fromOffset, a.y + lift, a.z + la.z * fromOffset];
      const a2 = [a.x + la.x * toOffset, a.y + lift, a.z + la.z * toOffset];
      const b1 = [b.x + lb.x * fromOffset, b.y + lift, b.z + lb.z * fromOffset];
      const b2 = [b.x + lb.x * toOffset, b.y + lift, b.z + lb.z * toOffset];
      pos.push(...a1, ...b1, ...a2, ...a2, ...b1, ...b2);
      c.set(colorAt(ii));
      for (let v = 0; v < 6; v++) col.push(c.r, c.g, c.b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const extra = { vertexColors: true, side: THREE.DoubleSide };
    if (opacity < 1) Object.assign(extra, { transparent: true, opacity, depthWrite: false });
    const mesh = new THREE.Mesh(geo, toon(0xffffff, extra));
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  buildRoad() {
    const th = this.theme;
    const stripe = (a, b) => (i) => (Math.floor(i / 6) % 2 ? a : b);
    /* השוליים בין הכביש לקיר, בגובה הכביש */
    this.ribbon(-WALL_OFFSET, WALL_OFFSET, 0.0, () => th.embank, { step: 2 });
    /* פס דיו סביב הכביש — אותו קו מתאר כמו בשאר העולם */
    this.ribbon(-ROAD_HALF - 1.6, ROAD_HALF + 1.6, 0.02, () => PALETTE.ink);
    this.ribbon(-ROAD_HALF, ROAD_HALF, 0.04, () => PALETTE.road);
    this.ribbon(ROAD_HALF - 0.05, ROAD_HALF + 1.4, 0.05, stripe(th.curbA, th.curbB));
    this.ribbon(-ROAD_HALF - 1.4, -ROAD_HALF + 0.05, 0.05, stripe(th.curbA, th.curbB));

    /* משטחי קרח: תכלת שקוף על הכביש */
    for (const [a, b] of this.def.ice) {
      this.ribbon(-ROAD_HALF, ROAD_HALF, 0.06, (i) => (Math.floor(i / 3) % 2 ? 0xbfe6ff : 0xe3f5ff),
        { from: Math.floor(a * this.count), to: Math.floor(b * this.count), opacity: 0.85 });
    }

    /* קו מרוסק באמצע */
    const dash = new THREE.PlaneGeometry(0.45, 3.2);
    const dashes = new THREE.InstancedMesh(dash, toon(PALETTE.surface), Math.ceil(this.count / 8));
    let n = 0;
    for (let i = 0; i < this.count; i += 8) {
      if (this.isIce[i]) continue;
      dashes.setMatrixAt(n++, this.surfaceMatrix(i, 0, 0.07));
    }
    dashes.count = n;
    dashes.receiveShadow = true;
    this.group.add(dashes);
  }

  buildWalls() {
    const th = this.theme;
    /* קיר צמיג נמוך משני הצדדים, בפסים */
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
        pos.push(ax, a.y, az, bx, b.y, bz, ax, a.y + h, az, ax, a.y + h, az, bx, b.y, bz, bx, b.y + h, bz);
        c.set(Math.floor(i / 6) % 2 ? th.wallA : th.wallB);
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
      for (let i = 0; i < this.count; i += step) {
        const p = this.points[i], l = this.lefts[i];
        top.push(new THREE.Vector3(p.x + l.x * WALL_OFFSET * side, p.y + h, p.z + l.z * WALL_OFFSET * side));
      }
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(top, true), this.count / step, 0.12, 4, true),
        new THREE.MeshBasicMaterial({ color: PALETTE.ink })
      );
      this.group.add(tube);
    }
  }

  /* מתחת לכביש מוגבה: סוללת עפר משופעת, ובקטעי הגשר — דופן ועמודים */
  buildEmbankments() {
    const th = this.theme;
    const pos = [];
    const deck = [];
    const step = 2;
    for (let i = 0; i < this.count; i += step) {
      const j = this.wrap(i + step);
      const a = this.points[i], b = this.points[j];
      if (a.y < 0.05 && b.y < 0.05) continue;
      const bridge = this.isBridge[i] || this.isBridge[j];
      for (const side of [1, -1]) {
        const la = this.lefts[i], lb = this.lefts[j];
        const ta = WALL_OFFSET * side, tb = WALL_OFFSET * side;
        const top1 = [a.x + la.x * ta, a.y, a.z + la.z * ta];
        const top2 = [b.x + lb.x * tb, b.y, b.z + lb.z * tb];
        if (bridge) {
          /* דופן הגשר: 1.4 יחידות עובי */
          const d1 = [top1[0], a.y - 1.4, top1[2]], d2 = [top2[0], b.y - 1.4, top2[2]];
          deck.push(...top1, ...top2, ...d1, ...d1, ...top2, ...d2);
        } else {
          const oa = (WALL_OFFSET + a.y * EMBANK_SLOPE) * side, ob = (WALL_OFFSET + b.y * EMBANK_SLOPE) * side;
          const bot1 = [a.x + la.x * oa, 0, a.z + la.z * oa];
          const bot2 = [b.x + lb.x * ob, 0, b.z + lb.z * ob];
          pos.push(...top1, ...top2, ...bot1, ...bot1, ...top2, ...bot2);
        }
      }
      if (bridge) {
        /* תחתית הגשר */
        const la = this.lefts[i], lb = this.lefts[j];
        const w = WALL_OFFSET;
        const q = (p, l, s) => [p.x + l.x * w * s, p.y - 1.4, p.z + l.z * w * s];
        deck.push(...q(a, la, 1), ...q(b, lb, 1), ...q(a, la, -1), ...q(a, la, -1), ...q(b, lb, 1), ...q(b, lb, -1));
      }
    }
    for (const [arr, color] of [[pos, th.embank], [deck, 0xc9ced8]]) {
      if (!arr.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, toon(color, { side: THREE.DoubleSide }));
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      this.group.add(mesh);
    }

    /* עמודים מתחת לגשר — רק במקומות שלא חוסמים את הכביש שעובר מתחת */
    const pillarGeo = new THREE.BoxGeometry(1.6, 1, 1.6);
    for (let i = 0; i < this.count; i += 14) {
      if (!this.isBridge[i]) continue;
      for (const side of [1, -1]) {
        const p = this.points[i], l = this.lefts[i];
        const x = p.x + l.x * (WALL_OFFSET - 1.5) * side, z = p.z + l.z * (WALL_OFFSET - 1.5) * side;
        if (this.blocksLowerRoad(x, z, i)) continue;
        const h = p.y - 1.4;
        const pillar = outlined(pillarGeo, 0xc9ced8, 0.08);
        pillar.scale.y = h;
        pillar.position.set(x, h / 2, z);
        this.group.add(pillar);
      }
    }
  }

  /* האם נקודה נמצאת בתוך הפרוזדור של קטע מסלול אחר (רחוק באינדקס) */
  blocksLowerRoad(x, z, near) {
    for (let k = 0; k < this.count; k += 2) {
      const gap = Math.min(Math.abs(k - near), this.count - Math.abs(k - near));
      if (gap < 60) continue;
      const p = this.points[k];
      if (Math.hypot(p.x - x, p.z - z) < WALL_OFFSET + 3) return true;
    }
    return false;
  }

  /* משטחי האצה: חצים זהובים על הכביש */
  buildPads() {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f5c542";
    ctx.fillRect(0, 0, 64, 96);
    ctx.strokeStyle = "#1a1f2e";
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 58, 90);
    ctx.lineWidth = 9;
    ctx.lineJoin = "miter";
    for (const y of [22, 50, 78]) {
      ctx.beginPath();
      ctx.moveTo(12, y + 10);
      ctx.lineTo(32, y - 10);
      ctx.lineTo(52, y + 10);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const geo = new THREE.PlaneGeometry(4, 6);
    for (const pad of this.boosts) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(this.surfaceMatrix(pad.index, pad.lateral, 0.09));
      this.group.add(mesh);
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
    line.matrixAutoUpdate = false;
    line.matrix.copy(this.surfaceMatrix(0, 0, 0.08));
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
    const face = new THREE.MeshBasicMaterial({ map: bannerTex });
    const gold = toon(PALETTE.gold);
    const banner = outlined(new THREE.BoxGeometry((ROAD_HALF + 2.6) * 2, 2.2, 0.6), PALETTE.gold);
    banner.material = [gold, gold, gold, gold, face, face];
    banner.position.y = 8;
    arch.add(banner);
    arch.position.copy(this.points[0]);
    arch.rotation.y = this.headings[0];
    this.group.add(arch);
    this.arch = arch;
  }
}
