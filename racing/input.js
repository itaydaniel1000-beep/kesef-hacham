/* ===== קלט: מקלדת וכפתורי מגע, ממופים לאותו מצב ===== */

const KEYS = {
  ArrowUp: "gas", KeyW: "gas",
  ArrowDown: "brake", KeyS: "brake",
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
  Space: "drift",
  ShiftLeft: "nitro", ShiftRight: "nitro", KeyN: "nitro"
};

export class Input {
  constructor() {
    this.keys = { gas: false, brake: false, left: false, right: false, drift: false, nitro: false };
    this.touch = { gas: false, brake: false, left: false, right: false, drift: false, nitro: false };

    addEventListener("keydown", (e) => {
      const k = KEYS[e.code];
      if (!k) return;
      this.keys[k] = true;
      e.preventDefault();
    });
    addEventListener("keyup", (e) => {
      const k = KEYS[e.code];
      if (k) this.keys[k] = false;
    });
    /* כשהחלון מאבד פוקוס, משחררים הכול — אחרת המכונית ממשיכה לנסוע לבד */
    addEventListener("blur", () => this.release());
  }

  /* משחררים את כל המקשים והכפתורים — בהשהיה, כדי שהמכונית לא תמשיך לנסוע כשחוזרים */
  release() {
    for (const k in this.keys) this.keys[k] = false;
    for (const k in this.touch) this.touch[k] = false;
  }

  bindTouch(root) {
    for (const btn of root.querySelectorAll("[data-key]")) {
      const key = btn.dataset.key;
      const on = (e) => {
        e.preventDefault();
        btn.setPointerCapture?.(e.pointerId);
        this.touch[key] = true;
        btn.classList.add("active");
      };
      const off = () => {
        this.touch[key] = false;
        btn.classList.remove("active");
      };
      btn.addEventListener("pointerdown", on);
      btn.addEventListener("pointerup", off);
      btn.addEventListener("pointercancel", off);
      btn.addEventListener("lostpointercapture", off);
      btn.addEventListener("contextmenu", (e) => e.preventDefault());
    }
  }

  read() {
    const k = this.keys, t = this.touch;
    const left = k.left || t.left, right = k.right || t.right;
    return {
      gas: k.gas || t.gas ? 1 : 0,
      brake: k.brake || t.brake ? 1 : 0,
      steer: (left ? 1 : 0) - (right ? 1 : 0),
      drift: k.drift || t.drift ? 1 : 0,
      nitro: k.nitro || t.nitro ? 1 : 0
    };
  }
}
