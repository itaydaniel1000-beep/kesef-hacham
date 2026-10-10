/* ===== קלט: מקלדת וכפתורי מגע, ממופים לאותו מצב ===== */

const KEYS = {
  ArrowUp: "gas", KeyW: "gas",
  ArrowDown: "brake", KeyS: "brake",
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
  Space: "drift",
  KeyC: "look",
  ShiftLeft: "nitro", ShiftRight: "nitro", KeyN: "nitro"
};

export class Input {
  constructor() {
    this.keys = { gas: false, brake: false, left: false, right: false, drift: false, nitro: false, look: false };
    this.touch = { gas: false, brake: false, left: false, right: false, drift: false, nitro: false, item: false, look: false };
    this.capture = false; // main.js מדליק את זה בזמן מירוץ

    this.itemPressed = false;
    addEventListener("keydown", (e) => {
      /* כשכותבים בצ'אט — המקשים לא נוהגים */
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      /* ק (במקלדת עברית — אותו מקש פיזי כמו E): הפעלת הפריט, פעם אחת לכל לחיצה */
      if (e.code === "KeyE") {
        if (!e.repeat) this.itemPressed = true;
        if (this.capture) e.preventDefault();
        return;
      }
      const k = KEYS[e.code];
      if (!k) return;
      this.keys[k] = true;
      if (this.capture) e.preventDefault();
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
    this.itemPressed = false;
    for (const k in this.keys) this.keys[k] = false;
    for (const k in this.touch) this.touch[k] = false;
    for (const btn of this.buttons || []) btn.classList.remove("active");
  }

  bindTouch(root) {
    this.buttons = [...root.querySelectorAll("[data-key]")];
    for (const btn of this.buttons) {
      const key = btn.dataset.key;
      const on = (e) => {
        e.preventDefault();
        if (key === "item") this.itemPressed = true;
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

  /* האם לחצו על ק מאז הפעם הקודמת */
  takeItem() {
    const pressed = this.itemPressed;
    this.itemPressed = false;
    return pressed;
  }

  /* מבט אחורה (C / כפתור במגע) — מחזיקים כדי לראות מי מתקרב */
  lookingBack() {
    return this.keys.look || this.touch.look;
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
