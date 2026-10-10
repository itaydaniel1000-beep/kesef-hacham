/* ===== חלקיקים: עשן, אבק, ניצוצות, להבות וקונפטי — מאגר קבוע של ספרייטים ===== */

import * as THREE from "three";

/* כתם רך (שקוף בשוליים) — נצבע לפי סוג החלקיק: עשן, אבק, ניצוץ */
const texture = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 31);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.45, "rgba(255,255,255,.7)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

const KINDS = {
  smoke:    { life: 0.8,  size: [0.5, 1.7], rise: 1.2,  gravity: 0,   opacity: 0.55 },
  dust:     { life: 0.6,  size: [0.5, 1.6], rise: 0.8,  gravity: 0,   opacity: 0.7 },
  spark:    { life: 0.45, size: [0.45, 0.1], rise: 0,   gravity: 22,  opacity: 1 },
  flame:    { life: 0.25, size: [0.8, 0.2], rise: 0,    gravity: 0,   opacity: 1 },
  confetti: { life: 2.6,  size: [0.7, 0.7], rise: 0,    gravity: 6,   opacity: 1 }
};

export class Particles {
  constructor(scene, max = 220) {
    this.pool = [];
    for (let i = 0; i < max; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
      s.visible = false;
      s.userData = { life: 0, max: 1, vx: 0, vy: 0, vz: 0, kind: KINDS.smoke };
      scene.add(s);
      this.pool.push(s);
    }
    this.next = 0;
  }

  emit(kind, x, y, z, color, { vx = 0, vy = 0, vz = 0, spread = 1 } = {}) {
    const s = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    const k = KINDS[kind];
    const d = s.userData;
    d.kind = k;
    d.life = d.max = k.life * (0.75 + Math.random() * 0.5);
    d.vx = vx + (Math.random() - 0.5) * spread;
    d.vy = vy + k.rise + (Math.random() - 0.5) * spread * 0.5;
    d.vz = vz + (Math.random() - 0.5) * spread;
    s.position.set(x, y, z);
    s.material.color.set(color);
    s.material.opacity = k.opacity;
    s.visible = true;
  }

  update(dt) {
    for (const s of this.pool) {
      if (!s.visible) continue;
      const d = s.userData;
      d.life -= dt;
      if (d.life <= 0) {
        s.visible = false;
        continue;
      }
      const k = d.kind;
      const t = 1 - d.life / d.max; // 0 בהתחלה, 1 בסוף
      d.vy -= k.gravity * dt;
      s.position.x += d.vx * dt;
      s.position.y += d.vy * dt;
      s.position.z += d.vz * dt;
      s.scale.setScalar(k.size[0] + (k.size[1] - k.size[0]) * t);
      s.material.opacity = k.opacity * (t > 0.6 ? (1 - t) / 0.4 : 1);
    }
  }

  clear() {
    for (const s of this.pool) s.visible = false;
  }
}
