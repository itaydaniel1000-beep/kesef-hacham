/* ===== קלט: מקלדת, ובטלפון הגה מסתובב ודוושות — ממופים לאותו מצב ===== */

const WHEEL_LOCK = 120; // כמה מעלות לכל צד עד היגוי מלא
const WHEEL_DEAD = 4;   // סיבוב קטן מזה לא נחשב

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
    this.touch = { gas: false, brake: false, drift: false, nitro: false, item: false, look: false };
    this.wheelAngle = 0;  // זווית ההגה במעלות (חיובי = עם כיוון השעון = ימינה)
    this.wheelEl = null;
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
    this.setWheel(0);
  }

  setWheel(angle) {
    this.wheelAngle = angle;
    if (this.wheelEl) this.wheelEl.style.transform = `rotate(${angle}deg)`;
  }

  /* הגה: האצבע תופסת אותו ומסובבת סביב המרכז; כשעוזבים הוא חוזר לאמצע */
  bindWheel(el) {
    this.wheelEl = el;
    let pointer = null, lastAngle = 0;
    const fingerAngle = (e) => {
      const r = el.getBoundingClientRect();
      return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
    };
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (pointer !== null) return;
      pointer = e.pointerId;
      el.setPointerCapture?.(e.pointerId);
      lastAngle = fingerAngle(e);
      el.classList.add("held");
    });
    el.addEventListener("pointermove", (e) => {
      if (e.pointerId !== pointer) return;
      const a = fingerAngle(e);
      let d = a - lastAngle;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      lastAngle = a;
      this.setWheel(Math.max(-WHEEL_LOCK, Math.min(WHEEL_LOCK, this.wheelAngle + d)));
    });
    const off = (e) => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      el.classList.remove("held");
      this.setWheel(0);
    };
    el.addEventListener("pointerup", off);
    el.addEventListener("pointercancel", off);
    el.addEventListener("lostpointercapture", off);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
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
    const a = this.wheelAngle;
    const wheel = Math.abs(a) < WHEEL_DEAD ? 0 : -(a - Math.sign(a) * WHEEL_DEAD) / (WHEEL_LOCK - WHEEL_DEAD);
    return {
      gas: k.gas || t.gas ? 1 : 0,
      brake: k.brake || t.brake ? 1 : 0,
      steer: Math.max(-1, Math.min(1, (k.left ? 1 : 0) - (k.right ? 1 : 0) + wheel)),
      drift: k.drift || t.drift ? 1 : 0,
      nitro: k.nitro || t.nitro ? 1 : 0
    };
  }
}
