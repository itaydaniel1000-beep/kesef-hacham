/* ===== מטבעות זהב על המסלול: נאספים רק על ידי השחקן, ונכנסים לקופה בסוף המירוץ ===== */

import * as THREE from "three";

const COUNT = 60;
const HIT = 2.2;
const hidden = new THREE.Matrix4().makeScale(0, 0, 0);

export class Coins {
  constructor(track) {
    this.track = track;
    const geo = new THREE.CylinderGeometry(0.6, 0.6, 0.14, 24).rotateX(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffc83a, metalness: 1, roughness: 0.22, emissive: 0x4a3000, emissiveIntensity: 0.5 });
    this.mesh = new THREE.InstancedMesh(geo, mat, COUNT);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    track.group.add(this.mesh);
    /* פזורים לאורך המסלול, בשלושה נתיבים */
    let seed = 11;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    this.spots = [];
    for (let k = 0; k < COUNT; k++) {
      const index = Math.floor(track.count * (0.04 + 0.92 * (k + rand() * 0.6) / COUNT));
      const lateral = [-4, 0, 4][Math.floor(rand() * 3)];
      const p = track.points[index], l = track.lefts[index];
      this.spots.push({ x: p.x + l.x * lateral, y: p.y + 1.3, z: p.z + l.z * lateral, taken: false });
    }
    this.time = 0;
    this.reset();
  }

  reset() {
    for (const s of this.spots) s.taken = false;
    this.collected = 0;
  }

  /* מסתובבים; ומי שעובר דרכם (רק השחקן) אוסף. מחזיר כמה נאספו עכשיו */
  update(dt, player, enabled) {
    this.time += dt;
    this.mesh.visible = enabled;
    if (!enabled) return 0;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.time * 3);
    let got = 0;
    this.spots.forEach((s, i) => {
      if (!s.taken && player && !player.finished) {
        const dx = player.x - s.x, dz = player.z - s.z;
        if (dx * dx + dz * dz < HIT * HIT && Math.abs(player.y + 1 - s.y) < 3) {
          s.taken = true;
          got++;
        }
      }
      if (s.taken) this.mesh.setMatrixAt(i, hidden);
      else this.mesh.setMatrixAt(i, m.compose(v.set(s.x, s.y + Math.sin(this.time * 2 + i) * 0.2, s.z), q, one));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.collected += got;
    return got;
  }
}
