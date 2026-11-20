/* ===== מוד טקסטורות =====
   מקש ח (או J באנגלית):
   - לחיצה קצרה: מדליקה / מכבה את הטקסטורה שנבחרה.
   - לחיצה ארוכה: פותחת תפריט לבחירת טקסטורה ועוצמה.
   בטלפון יש כפתור עגול בפינה שעובד באותה צורה.
   הטקסטורה היא שכבה שקופה מעל כל האתר, ולא חוסמת לחיצות.
   הבחירה נשמרת בדפדפן. */

(function () {
  "use strict";

  const LONG_PRESS_MS = 450;
  const STORE_KEY = "kesef.textures";

  /* ---------- ציור הטקסטורות ---------- */

  /* מייצר אריח קטן על קנבס ומחזיר אותו כתמונה שאפשר לחזור עליה */
  function tile(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d"), w, h);
    return `url(${c.toDataURL()})`;
  }

  /* מספר אקראי קבוע לפי זרע, כדי שהרעש ייראה אותו דבר בכל פעם */
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  const TEXTURES = [
    {
      id: "paper",
      name: "נייר ישן",
      icon: "📜",
      blend: "multiply",
      make: () => tile(160, 160, (ctx, w, h) => {
        const r = rng(7);
        ctx.fillStyle = "#f3e6c8";
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 2600; i++) {
          const g = 170 + Math.floor(r() * 70);
          ctx.fillStyle = `rgba(${g},${g - 20},${g - 60},${0.15 + r() * 0.25})`;
          ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
        }
        /* סיבים */
        ctx.strokeStyle = "rgba(150,120,80,.18)";
        for (let i = 0; i < 40; i++) {
          const x = r() * w, y = r() * h;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + (r() - 0.5) * 18, y + (r() - 0.5) * 18);
          ctx.stroke();
        }
      })
    },
    {
      id: "crt",
      name: "טלוויזיה ישנה",
      icon: "📺",
      blend: "multiply",
      make: () => tile(3, 4, (ctx) => {
        /* פסים אופקיים + רשת אדום-ירוק-כחול */
        ctx.fillStyle = "rgb(255,200,200)"; ctx.fillRect(0, 0, 1, 3);
        ctx.fillStyle = "rgb(200,255,200)"; ctx.fillRect(1, 0, 1, 3);
        ctx.fillStyle = "rgb(200,200,255)"; ctx.fillRect(2, 0, 1, 3);
        ctx.fillStyle = "rgb(90,90,90)"; ctx.fillRect(0, 3, 3, 1);
      }),
      size: "3px 4px"
    },
    {
      id: "grain",
      name: "סרט קולנוע",
      icon: "🎞️",
      blend: "overlay",
      animated: true,
      make: () => tile(200, 200, (ctx, w, h) => {
        const img = ctx.createImageData(w, h);
        const r = rng(42);
        for (let i = 0; i < img.data.length; i += 4) {
          const v = Math.floor(r() * 255);
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
          img.data[i + 3] = 90;
        }
        ctx.putImageData(img, 0, 0);
      })
    },
    {
      id: "fabric",
      name: "בד ארוג",
      icon: "🧵",
      blend: "multiply",
      make: () => tile(8, 8, (ctx) => {
        ctx.fillStyle = "#efe7da";
        ctx.fillRect(0, 0, 8, 8);
        ctx.fillStyle = "#cdbfa8";
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            /* חוטי שתי וערב לסירוגין */
            const over = ((x >> 2) + (y >> 2)) % 2 === 0;
            if (over ? y % 4 === 0 : x % 4 === 0) ctx.fillRect(x, y, 1, 1);
          }
        }
      })
    },
    {
      id: "comic",
      name: "קומיקס",
      icon: "💥",
      blend: "multiply",
      make: () => tile(8, 8, (ctx) => {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, 8, 8);
        ctx.fillStyle = "#b9b9c9";
        ctx.beginPath(); ctx.arc(2, 2, 1.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(6, 6, 1.4, 0, Math.PI * 2); ctx.fill();
      })
    },
    {
      id: "wood",
      name: "עץ",
      icon: "🪵",
      blend: "multiply",
      make: () => tile(240, 120, (ctx, w, h) => {
        const r = rng(3);
        ctx.fillStyle = "#e8c896";
        ctx.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y++) {
          const wave = Math.sin(y * 0.09) * 6 + Math.sin(y * 0.031) * 10;
          for (let x = 0; x < w; x += 2) {
            const ring = Math.sin((x + wave * 3) * 0.12 + Math.sin(y * 0.05) * 2);
            const a = 0.08 + (ring > 0.6 ? 0.18 : 0) + r() * 0.05;
            ctx.fillStyle = `rgba(120,70,30,${a})`;
            ctx.fillRect(x, y, 2, 1);
          }
        }
      })
    },
    {
      id: "pixel",
      name: "פיקסלים",
      icon: "👾",
      blend: "multiply",
      make: () => tile(6, 6, (ctx) => {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, 6, 6);
        ctx.fillStyle = "#c4c4d0";
        ctx.fillRect(5, 0, 1, 6);
        ctx.fillRect(0, 5, 6, 1);
      }),
      size: "6px 6px"
    },
    {
      id: "night",
      name: "ראיית לילה",
      icon: "🌙",
      blend: "multiply",
      vignette: true,
      make: () => tile(2, 3, (ctx) => {
        ctx.fillStyle = "rgb(120,255,140)"; ctx.fillRect(0, 0, 2, 2);
        ctx.fillStyle = "rgb(60,140,70)"; ctx.fillRect(0, 2, 2, 1);
      }),
      size: "2px 3px"
    }
  ];

  /* ---------- מצב ---------- */

  const state = { id: "paper", on: false, strength: 60 };

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (saved && TEXTURES.some(t => t.id === saved.id)) Object.assign(state, saved);
    } catch (e) { /* אין אחסון - מתחילים מברירת מחדל */ }
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* לא נורא */ }
  }

  const cache = {};
  function imageOf(t) {
    if (!cache[t.id]) cache[t.id] = t.make();
    return cache[t.id];
  }

  /* ---------- עיצוב ---------- */

  const css = `
  #texOverlay {
    position: fixed; inset: 0; z-index: 2147483000;
    pointer-events: none; opacity: 0; transition: opacity .25s ease;
    image-rendering: pixelated;
  }
  #texOverlay.on { opacity: var(--tex-strength, .6); }
  #texOverlay.animated { animation: texGrain .5s steps(5) infinite; }
  #texOverlay.vignette::after {
    content: ""; position: absolute; inset: 0;
    background: radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,.7) 100%);
  }
  @keyframes texGrain {
    0% { background-position: 0 0; } 20% { background-position: -37px 21px; }
    40% { background-position: 53px -14px; } 60% { background-position: -18px -49px; }
    80% { background-position: 29px 41px; } 100% { background-position: 0 0; }
  }
  @media (prefers-reduced-motion: reduce) { #texOverlay.animated { animation: none; } }

  #texMenu {
    position: fixed; inset: 0; z-index: 2147483100;
    display: flex; align-items: center; justify-content: center;
    background: rgba(22,35,58,.45); padding: 16px;
    font-family: "Heebo", "Assistant", system-ui, sans-serif;
  }
  #texMenu.hidden { display: none; }
  #texMenu .tex-card {
    background: var(--surface, #fff); color: var(--ink, #16233a);
    border-radius: var(--radius, 18px); box-shadow: var(--shadow-lift, 0 18px 40px rgba(0,0,0,.2));
    width: min(520px, 100%); max-height: calc(100vh - 32px); overflow: auto;
    padding: 20px; direction: rtl;
  }
  #texMenu h2 { margin: 0 0 4px; font-size: 1.4rem; font-weight: 900; }
  #texMenu .tex-hint { margin: 0 0 14px; color: var(--ink-soft, #5a6b86); font-size: .92rem; }
  #texMenu .tex-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 10px;
  }
  #texMenu .tex-pick {
    border: 2px solid var(--line, #e2e8f2); border-radius: 14px; background: #fff;
    padding: 0; cursor: pointer; overflow: hidden; font: inherit; color: inherit;
    display: flex; flex-direction: column; transition: transform .12s, border-color .12s;
  }
  #texMenu .tex-pick:hover { transform: translateY(-2px); }
  #texMenu .tex-pick:focus-visible { outline: 3px solid var(--blue, #2f6fd0); outline-offset: 2px; }
  #texMenu .tex-pick.selected { border-color: var(--brand, #1f7a5a); box-shadow: 0 0 0 3px var(--brand-soft, #e4f4ed); }
  #texMenu .tex-swatch {
    height: 64px; display: flex; align-items: center; justify-content: center;
    font-size: 1.8rem; background-color: #8fc7e8; image-rendering: pixelated;
    background-blend-mode: multiply;
  }
  #texMenu .tex-name { padding: 6px 4px; font-weight: 700; font-size: .95rem; }
  #texMenu .tex-row {
    display: flex; align-items: center; gap: 12px; margin-top: 16px; flex-wrap: wrap;
  }
  #texMenu .tex-row label { font-weight: 700; }
  #texMenu input[type=range] { flex: 1; min-width: 140px; accent-color: var(--brand, #1f7a5a); }
  #texMenu .tex-actions { display: flex; gap: 10px; margin-top: 18px; }
  #texMenu .tex-btn {
    flex: 1; border: 0; border-radius: 12px; padding: 10px 14px; font: inherit;
    font-weight: 800; cursor: pointer;
  }
  #texMenu .tex-btn.primary { background: var(--brand, #1f7a5a); color: #fff; }
  #texMenu .tex-btn.ghost { background: var(--brand-soft, #e4f4ed); color: var(--brand-strong, #145c43); }

  #texToast {
    position: fixed; bottom: 24px; left: 50%; transform: translate(-50%, 20px);
    z-index: 2147483200; background: var(--ink, #16233a); color: #fff;
    padding: 8px 18px; border-radius: 999px; font-weight: 700; direction: rtl;
    font-family: "Heebo", "Assistant", system-ui, sans-serif;
    opacity: 0; pointer-events: none; transition: opacity .2s, transform .2s;
  }
  #texToast.show { opacity: 1; transform: translate(-50%, 0); }

  #texFab {
    position: fixed; bottom: 16px; left: 16px; z-index: 2147483050;
    width: 48px; height: 48px; border-radius: 50%; border: 0;
    background: var(--surface, #fff); box-shadow: var(--shadow-lift, 0 8px 20px rgba(0,0,0,.2));
    font-size: 1.4rem; cursor: pointer; touch-action: none; user-select: none;
    -webkit-user-select: none; -webkit-touch-callout: none;
    display: flex; align-items: center; justify-content: center;
  }
  #texFab.on { background: var(--brand-soft, #e4f4ed); outline: 3px solid var(--brand, #1f7a5a); }
  #texFab.charging { animation: texCharge ${LONG_PRESS_MS}ms linear forwards; }
  @keyframes texCharge { from { box-shadow: 0 0 0 0 var(--accent, #f5a623); } to { box-shadow: 0 0 0 8px var(--accent, #f5a623); } }
  @media (hover: hover) and (pointer: fine) { #texFab { width: 40px; height: 40px; font-size: 1.1rem; opacity: .75; } }
  `;

  /* ---------- בניית הרכיבים ---------- */

  let overlay, menu, toast, fab, slider, toastTimer;

  function build() {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    overlay = document.createElement("div");
    overlay.id = "texOverlay";
    overlay.setAttribute("aria-hidden", "true");
    document.body.appendChild(overlay);

    toast = document.createElement("div");
    toast.id = "texToast";
    toast.setAttribute("role", "status");
    document.body.appendChild(toast);

    fab = document.createElement("button");
    fab.id = "texFab";
    fab.type = "button";
    fab.title = "טקסטורות — לחיצה קצרה: הדלקה/כיבוי · לחיצה ארוכה: תפריט (מקש ח)";
    fab.setAttribute("aria-label", "טקסטורות");
    document.body.appendChild(fab);

    menu = document.createElement("div");
    menu.id = "texMenu";
    menu.className = "hidden";
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-modal", "true");
    menu.setAttribute("aria-labelledby", "texMenuTitle");
    menu.innerHTML = `
      <div class="tex-card">
        <h2 id="texMenuTitle">🎨 טקסטורות</h2>
        <p class="tex-hint">בחרו טקסטורה. אחר כך לחיצה קצרה על <b>ח</b> מדליקה ומכבה אותה.</p>
        <div class="tex-grid">
          ${TEXTURES.map(t => `
            <button type="button" class="tex-pick" data-id="${t.id}">
              <span class="tex-swatch">${t.icon}</span>
              <span class="tex-name">${t.name}</span>
            </button>`).join("")}
        </div>
        <div class="tex-row">
          <label for="texStrength">עוצמה</label>
          <input id="texStrength" type="range" min="10" max="100" step="5">
          <span id="texStrengthVal"></span>
        </div>
        <div class="tex-actions">
          <button type="button" class="tex-btn ghost" data-act="off">כיבוי</button>
          <button type="button" class="tex-btn primary" data-act="close">סגירה</button>
        </div>
      </div>`;
    document.body.appendChild(menu);

    menu.querySelectorAll(".tex-pick").forEach(btn => {
      const t = TEXTURES.find(x => x.id === btn.dataset.id);
      const sw = btn.querySelector(".tex-swatch");
      sw.style.backgroundImage = imageOf(t);
      if (t.size) sw.style.backgroundSize = t.size;
      btn.addEventListener("click", () => {
        state.id = t.id;
        state.on = true;
        apply();
        save();
      });
    });

    slider = menu.querySelector("#texStrength");
    slider.addEventListener("input", () => {
      state.strength = Number(slider.value);
      if (!state.on) state.on = true;
      apply();
      save();
    });

    menu.querySelector('[data-act="off"]').addEventListener("click", () => {
      state.on = false;
      apply();
      save();
      closeMenu();
    });
    menu.querySelector('[data-act="close"]').addEventListener("click", closeMenu);
    menu.addEventListener("click", e => { if (e.target === menu) closeMenu(); });
  }

  function current() {
    return TEXTURES.find(t => t.id === state.id) || TEXTURES[0];
  }

  function apply() {
    const t = current();
    overlay.style.backgroundImage = imageOf(t);
    overlay.style.backgroundSize = t.size || "";
    overlay.style.mixBlendMode = t.blend;
    overlay.style.setProperty("--tex-strength", String(state.strength / 100));
    overlay.classList.toggle("on", state.on);
    overlay.classList.toggle("animated", !!t.animated);
    overlay.classList.toggle("vignette", !!t.vignette);

    fab.textContent = state.on ? t.icon : "🎨";
    fab.classList.toggle("on", state.on);

    menu.querySelectorAll(".tex-pick").forEach(b => {
      const sel = b.dataset.id === t.id;
      b.classList.toggle("selected", sel);
      b.setAttribute("aria-pressed", String(sel && state.on));
    });
    slider.value = String(state.strength);
    menu.querySelector("#texStrengthVal").textContent = `${state.strength}%`;
  }

  function showToast(text) {
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1400);
  }

  /* ---------- פעולות ---------- */

  function toggle() {
    state.on = !state.on;
    apply();
    save();
    const t = current();
    showToast(state.on ? `${t.icon} ${t.name} — דולק` : "טקסטורה כבויה");
  }

  let returnFocus = null;

  function openMenu() {
    if (!menuOpen()) returnFocus = document.activeElement;
    menu.classList.remove("hidden");
    const sel = menu.querySelector(".tex-pick.selected") || menu.querySelector(".tex-pick");
    if (sel) sel.focus();
  }

  function closeMenu() {
    menu.classList.add("hidden");
    if (returnFocus && returnFocus.focus) returnFocus.focus();
    returnFocus = null;
  }

  function menuOpen() {
    return !menu.classList.contains("hidden");
  }

  /* ---------- לחיצה קצרה / ארוכה ---------- */

  /* מחזיר אובייקט עם down/up: אם עבר זמן ארוך - תפריט, אחרת - הדלקה/כיבוי */
  function pressDetector(onCharge, onDischarge) {
    let timer = null;
    let fired = false;
    return {
      down() {
        if (timer) return;
        fired = false;
        onCharge && onCharge();
        timer = setTimeout(() => {
          fired = true;
          timer = null;
          onDischarge && onDischarge();
          openMenu();
        }, LONG_PRESS_MS);
      },
      up() {
        if (timer) {
          clearTimeout(timer);
          timer = null;
          onDischarge && onDischarge();
          toggle();
        }
        fired = false;
      },
      cancel() {
        if (timer) clearTimeout(timer);
        timer = null;
        onDischarge && onDischarge();
      },
      get active() { return !!timer || fired; }
    };
  }

  function isTypingTarget(el) {
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
  }

  /* מקש ח בפריסה עברית יושב על J. בודקים גם את התו וגם את המקש הפיזי,
     כך שזה עובד גם כשהמקלדת על אנגלית. */
  function isTexKey(e) {
    return e.key === "ח" || e.code === "KeyJ";
  }

  function wire() {
    const keyPress = pressDetector();

    document.addEventListener("keydown", e => {
      if (menuOpen() && e.key === "Escape") {
        e.preventDefault();
        closeMenu();
        return;
      }
      if (!isTexKey(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      if (e.repeat) return;
      keyPress.down();
    });

    document.addEventListener("keyup", e => {
      if (!isTexKey(e)) return;
      if (!keyPress.active) return;
      e.preventDefault();
      keyPress.up();
    });

    window.addEventListener("blur", () => keyPress.cancel());

    /* כפתור המגע */
    const fabPress = pressDetector(
      () => fab.classList.add("charging"),
      () => fab.classList.remove("charging"));
    fab.addEventListener("pointerdown", e => {
      e.preventDefault();
      fab.setPointerCapture && fab.setPointerCapture(e.pointerId);
      fabPress.down();
    });
    fab.addEventListener("pointerup", e => { e.preventDefault(); fabPress.up(); });
    fab.addEventListener("pointercancel", () => fabPress.cancel());
    fab.addEventListener("contextmenu", e => e.preventDefault());
    /* מקלדת על הכפתור עצמו: Enter/רווח = הדלקה/כיבוי */
    fab.addEventListener("click", e => { if (e.detail === 0) toggle(); });
  }

  function init() {
    load();
    build();
    apply();
    wire();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.KesefTextures = { toggle, openMenu, closeMenu, list: TEXTURES.map(t => t.id) };
})();
