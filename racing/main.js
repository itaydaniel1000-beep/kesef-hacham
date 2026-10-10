/* ===== מירוץ תלת-ממד — לולאת המשחק, מוסך ואפקטים ===== */

import * as THREE from "three";
import { PALETTE } from "./toon.js";
import { Track } from "./track.js";
import { TRACKS, findTrack } from "./tracks.js";
import { Car, CAR_TYPES, resolveCollisions } from "./car.js";
import { Driver } from "./ai.js";
import { Input } from "./input.js";
import { Race, formatTime } from "./race.js";
import { Particles } from "./particles.js";
import { GameAudio } from "./audio.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
/* לבדיקות: ?autopilot נותן למחשב לנהוג גם במכונית שלך, ?speed=4 מריץ מהר יותר, ?track=snow בוחר מסלול */
const AUTOPILOT = params.has("autopilot");
const TIME_SCALE = Math.min(10, Math.max(0.1, Number(params.get("speed")) || 1));

const hex = (c) => "#" + c.toString(16).padStart(6, "0");

/* ---------- הגדרות שנשמרות בין ביקורים ---------- */

const COLORS = [
  { color: PALETTE.brand, name: "ירוקי" },
  { color: PALETTE.gold, name: "זהבי" },
  { color: PALETTE.sky, name: "תכלת" },
  { color: PALETTE.berry, name: "אדומי" },
  { color: PALETTE.purple, name: "סגולי" },
  { color: 0xf08a24, name: "כתומי" },
  { color: 0xe86aa6, name: "ורודי" },
  { color: 0x1fb5a8, name: "טורקיז" },
  { color: 0x8cc63f, name: "ליים" },
  { color: 0x2f4ea8, name: "כחולי" }
];

const RIVALS = 8;

/* קושי: מהירות היריבים, כמה קרוב לגבול הם נוסעים בפניות (skill),
   וכמה הגומייה עוזרת לך (ahead = כמה מאט מי שבורח, behind = כמה מאיץ מי שמאחור) */
const LEVELS = {
  easy: { name: "קל", ai: 0.96, skill: 0.88, ahead: 0.04, behind: 0.02 },
  normal: { name: "בינוני", ai: 1.04, skill: 0.94, ahead: 0, behind: 0.05 },
  hard: { name: "קשה", ai: 1.1, skill: 0.98, ahead: 0, behind: 0.08 }
};

const settings = { track: "forest", type: "grip", color: PALETTE.brand, level: "normal", muted: false, music: true };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem("racing-settings") || "{}"));
} catch {
  /* אחסון חסום — מתחילים מברירת המחדל */
}
settings.track = findTrack(settings.track).id;
/* ?track= בוחר מסלול לביקור הזה בלבד — לא נשמר כברירת מחדל */
let currentTrackId = findTrack(params.get("track") || settings.track).id;
if (!CAR_TYPES[settings.type]) settings.type = "grip";
if (!LEVELS[settings.level]) settings.level = "normal";
if (!COLORS.some((c) => c.color === settings.color)) settings.color = PALETTE.brand;

function saveSettings() {
  try {
    localStorage.setItem("racing-settings", JSON.stringify(settings));
  } catch {
    /* מצב גלישה פרטית — ממשיכים בלי שמירה */
  }
}

/* ---------- סצנה ---------- */

const canvas = $("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color();
scene.fog = new THREE.Fog(0xffffff, 140, 330);

const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 900);

const hemi = new THREE.HemisphereLight(0xffffff, 0x7fae6f, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.9);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
const sc = sun.shadow.camera;
sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 160;
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);

const particles = new Particles(scene);
const confetti = new Particles(scene, 100); // מאגר נפרד, כדי שעשן ולהבות לא ימחקו את קונפטי הניצחון
const audio = new GameAudio();
audio.muted = settings.muted;
audio.musicOn = settings.music;

/* ---------- מסלול ומכוניות ---------- */

const trackData = new Map(TRACKS.map((def) => [def.id, new Track(def)]));
let track = null;

function useTrack(id) {
  const next = trackData.get(findTrack(id).id);
  if (next === track) return;
  /* כל מסלול נבנה פעם אחת; החלפה רק מוציאה מהסצנה את הקודם ומכניסה את הבא */
  if (track) scene.remove(track.group);
  track = next;
  if (track.built) scene.add(track.group);
  else track.build(scene);
  const th = track.theme;
  scene.background.set(th.sky);
  scene.fog.color.set(th.sky);
  scene.fog.near = th.fog[0];
  scene.fog.far = th.fog[1];
  hemi.groundColor.set(th.hemiGround);
  prepareMinimap();
  /* קו המירוץ ותכנון המהירות מחושבים ברקע בזמן שאתה במוסך, כדי שהלחיצה על "יוצאים" לא תקפא */
  const forTrack = track;
  setTimeout(() => {
    if (track === forTrack && state === "menu") for (const d of drivers) d.prepare(track);
  }, 50);
}

let player = null;
let rivals = [];
let drivers = [];
let cars = [];
let autopilot = null;
let cooldownDriver = null;

function buildCars() {
  for (const car of cars) {
    scene.remove(car.mesh);
    car.dispose();
  }
  const level = LEVELS[settings.level];
  const mine = COLORS.find((c) => c.color === settings.color);
  player = new Car({ name: "אני", color: mine.color, type: settings.type });
  player.brakeDrifts = true;
  /* היריבים מקבלים את הצבעים שלא בחרת. כל אחד מעט שונה: סוג מכונית, מהירות, נטייה בקו ואומץ בפניות */
  const others = COLORS.filter((c) => c !== mine);
  const types = ["speed", "grip", "accel"];
  rivals = [];
  drivers = [];
  for (let i = 0; i < RIVALS; i++) {
    const car = new Car({
      name: others[i].name, color: others[i].color, type: types[i % 3],
      speedScale: (1 - i * 0.004) * level.ai
    });
    rivals.push(car);
    drivers.push(new Driver(car, { lane: ((i % 5) - 2) * 0.5, skill: level.skill - (i % 4) * 0.005 }));
  }
  autopilot = AUTOPILOT ? new Driver(player, { skill: 0.88 }) : null;
  /* אחרי קו הסיום המחשב לוקח את ההגה ומאט בעדינות */
  cooldownDriver = new Driver(player);
  cars = [...rivals, player];
  for (const car of cars) scene.add(car.mesh);
  gridUp();
}

/* גריד הזינוק: שלוש מכוניות בשורה, השחקן מתחיל אחרון */
function gridUp() {
  cars.forEach((car, i) => {
    const row = Math.floor(i / 3), col = (i % 3) - 1;
    const back = Math.round(-(4 + row * 7.5 + (col === 0 ? 1.5 : 0) + (car === player ? 3 : 0)) / track.spacing);
    car.placeAt(track, track.wrap(back), col * 4.6);
  });
  particles.clear();
  confetti.clear();
}

/* ---------- מוסך ---------- */

function drawTrackPreview(canvasEl, t) {
  const ctx = canvasEl.getContext("2d");
  const w = canvasEl.width, h = canvasEl.height;
  ctx.fillStyle = hex(t.theme.ground);
  ctx.fillRect(0, 0, w, h);
  const b = boundsOf(t);
  const scale = Math.min((w - 24) / (b.maxX - b.minX), (h - 24) / (b.maxZ - b.minZ));
  const map = (p) => [w / 2 - (p.x - b.cx) * scale, h / 2 - (p.z - b.cz) * scale];
  ctx.lineJoin = "round";
  for (const [lw, c] of [[8, "#1a1f2e"], [4, "#ffffff"]]) {
    ctx.beginPath();
    t.points.forEach((p, i) => {
      const [x, y] = map(p);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.lineWidth = lw;
    ctx.strokeStyle = c;
    ctx.stroke();
  }
  /* הגשר מצויר מעל, כדי שרואים מה עובר מעל מה */
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#7a5cc9";
  ctx.beginPath();
  t.points.forEach((p, i) => {
    if (!t.isBridge[i]) return;
    const [x, y] = map(p);
    t.isBridge[t.wrap(i - 1)] ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
  const [sx, sy] = map(t.points[0]);
  ctx.fillStyle = "#f5c542";
  ctx.strokeStyle = "#1a1f2e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx, sy, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

const boundsOf = (t) => ({ ...t.bounds });

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

function markSelected(container, match) {
  for (const b of container.children) b.classList.toggle("selected", match(b));
}

function buildGarage() {
  const tp = $("trackPicker");
  for (const def of TRACKS) {
    const btn = el("button", "pick");
    btn.dataset.id = def.id;
    const c = document.createElement("canvas");
    c.width = 240;
    c.height = 150;
    drawTrackPreview(c, trackData.get(def.id));
    btn.append(c, el("strong", null, `${def.emoji} ${def.name}`), el("small", null, def.blurb));
    btn.addEventListener("click", () => {
      settings.track = currentTrackId = def.id;
      saveSettings();
      markSelected(tp, (b) => b.dataset.id === def.id);
      useTrack(def.id);
      gridUp();
    });
    tp.appendChild(btn);
  }
  markSelected(tp, (b) => b.dataset.id === currentTrackId);

  const cp = $("carPicker");
  const labels = { speed: "מהירות", accel: "תאוצה", grip: "אחיזה" };
  for (const [id, spec] of Object.entries(CAR_TYPES)) {
    const btn = el("button", "pick");
    btn.dataset.id = id;
    const stats = el("div", "stats");
    for (const k of ["speed", "accel", "grip"]) {
      const bar = [1, 2, 3].map((n) => `<i class="${n <= spec.stats[k] ? "on" : ""}"></i>`).join("");
      stats.appendChild(el("div", "stat", `<span>${labels[k]}</span><span class="stat-bar">${bar}</span>`));
    }
    btn.append(el("strong", null, spec.name), stats);
    btn.addEventListener("click", () => {
      settings.type = id;
      saveSettings();
      markSelected(cp, (b) => b.dataset.id === id);
      buildCars();
    });
    cp.appendChild(btn);
  }
  markSelected(cp, (b) => b.dataset.id === settings.type);

  const sp = $("colorPicker");
  for (const c of COLORS) {
    const btn = el("button", "swatch-btn");
    btn.style.background = hex(c.color);
    btn.dataset.color = c.color;
    btn.setAttribute("aria-label", c.name);
    btn.addEventListener("click", () => {
      settings.color = c.color;
      saveSettings();
      markSelected(sp, (b) => Number(b.dataset.color) === c.color);
      buildCars();
    });
    sp.appendChild(btn);
  }
  markSelected(sp, (b) => Number(b.dataset.color) === settings.color);

  const lp = $("levelPicker");
  for (const [id, lv] of Object.entries(LEVELS)) {
    const btn = el("button", null, lv.name);
    btn.dataset.id = id;
    btn.addEventListener("click", () => {
      settings.level = id;
      saveSettings();
      markSelected(lp, (b) => b.dataset.id === id);
      buildCars();
    });
    lp.appendChild(btn);
  }
  markSelected(lp, (b) => b.dataset.id === settings.level);
}

/* ---------- קלט וממשק ---------- */

const input = new Input();
input.bindTouch($("touch"));
/* מכשיר מגע = מצביע "גס" (אצבע). מחשב נייד עם מסך מגע ועכבר נשאר עם מקלדת */
const isTouch = matchMedia("(pointer: coarse)").matches;
if (isTouch) document.body.classList.add("touch");

let state = "menu"; // menu | countdown | race | finished | paused
let pausedFrom = null; // לאיזה מצב חוזרים מהשהיה
let race = null;
let countdown = 0;
let resultsShownAt = 0;
let shake = 0;

function show(id, on) {
  $(id).classList.toggle("hidden", !on);
}

/* כפתור שנלחץ ואז הוסתר לא נשאר בפוקוס — אחרת Enter באמצע מירוץ היה "לוחץ" עליו שוב */
function dropFocus() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

function startRace() {
  dropFocus();
  input.release();
  gridUp();
  for (const d of [...drivers, autopilot, cooldownDriver]) {
    d?.reset();
    d?.prepare(track);
  }
  race = new Race(track, cars, player);
  state = "countdown";
  countdown = 3.999;
  resultsShownAt = 0;
  lastCount = "";
  pausedFrom = null;
  show("menu", false);
  show("results", false);
  show("pause", false);
  show("hud", true);
  show("pauseButton", true);
  show("touch", isTouch);
  show("countdown", true);
  audio.start();
}

/* הקול פעיל רק כשהמשחק לא בהשהיה והעמוד גלוי — מקום אחד שמחליט, ונקרא מכל מעבר מצב */
let windowFocused = true;
function syncAudio() {
  if (state === "paused" || document.hidden || !windowFocused) audio.suspend();
  else audio.resume();
}

function toGarage() {
  state = "menu";
  pausedFrom = null;
  gridUp();
  syncAudio();
  hudSet("lines", 0, (v) => (hud.speedlines.style.opacity = v));
  show("results", false);
  show("pause", false);
  show("hud", false);
  show("touch", false);
  show("menu", true);
}

/* השהיה: הפיזיקה והזמן עוצרים, הקול מושהה, והמקשים משתחררים */
const RACING = ["countdown", "race", "finished"];
function pause() {
  if (!RACING.includes(state)) return;
  if (state === "finished" && !resultsShownAt) return; // מסך התוצאות כבר פתוח
  pausedFrom = state;
  state = "paused";
  dropFocus();
  input.release();
  syncAudio();
  hudSet("lines", 0, (v) => (hud.speedlines.style.opacity = v));
  show("touch", false);
  show("countdown", false);
  show("pause", true);
}

function resume() {
  if (state !== "paused") return;
  state = pausedFrom;
  pausedFrom = null;
  dropFocus();
  syncAudio();
  show("pause", false);
  show("touch", isTouch && !player.finished);
  if (state === "countdown" || (state === "race" && countdown > 0.3)) {
    /* מפעילים מחדש את האנימציה — אחרת המספר נשאר שקוף אחרי שהיא נגמרה */
    const box = $("countdown");
    box.classList.remove("pop");
    void box.offsetWidth;
    box.classList.add("pop");
    show("countdown", true);
  }
}

$("startButton").addEventListener("click", startRace);
$("againButton").addEventListener("click", startRace);
$("garageButton").addEventListener("click", toGarage);
$("pauseButton").addEventListener("click", pause);
/* כפתורי הפינה לא שומרים פוקוס — אחרת רווח (דריפט) היה לוחץ עליהם שוב */
for (const id of ["pauseButton", "muteButton", "musicButton"]) $(id).addEventListener("click", (e) => e.currentTarget.blur());
$("resumeButton").addEventListener("click", resume);
$("restartButton").addEventListener("click", startRace);
$("quitButton").addEventListener("click", toGarage);
addEventListener("keydown", (e) => {
  if (e.code === "Escape" || e.code === "KeyP") {
    if (e.repeat) return; // מקש מוחזק לא מהבהב בין השהיה להמשך
    if (state === "paused") resume();
    else pause();
    return;
  }
  /* Enter מתחיל מירוץ, גם כשכפתור במוסך בפוקוס — ובלי ש"ילחץ" על הכפתור הזה */
  /* על "למוסך" או על "איך נוהגים?" Enter עושה את מה שהם עושים — לא מתחיל מירוץ */
  if (e.target instanceof Element && e.target.closest("#garageButton, summary")) return;
  if (e.code === "Enter" && (state === "menu" || (state === "finished" && !resultsShownAt))) {
    e.preventDefault();
    startRace();
  }
});

/* כשעוברים ללשונית, לחלון או לאפליקציה אחרת: באמצע מירוץ — השהיה; בכל מקרה — שקט */
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
  syncAudio();
});
addEventListener("blur", () => {
  windowFocused = false;
  pause();
  syncAudio();
});
addEventListener("focus", () => {
  windowFocused = true;
  syncAudio();
});

$("muteButton").textContent = settings.muted ? "🔇" : "🔊";
$("muteButton").addEventListener("click", () => {
  settings.muted = !settings.muted;
  audio.setMuted(settings.muted);
  $("muteButton").textContent = settings.muted ? "🔇" : "🔊";
  saveSettings();
});
$("musicButton").classList.toggle("off", !settings.music);
$("musicButton").addEventListener("click", () => {
  settings.music = !settings.music;
  audio.setMusic(settings.music);
  $("musicButton").classList.toggle("off", !settings.music);
  saveSettings();
});


let lastCount = "";
function updateCountdown() {
  const box = $("countdown");
  const n = Math.ceil(countdown - 1);
  const text = n > 0 ? String(n) : "צא!";
  if (text !== lastCount) {
    lastCount = text;
    box.textContent = text;
    box.classList.toggle("go", n <= 0);
    box.classList.remove("pop");
    void box.offsetWidth;
    box.classList.add("pop");
    audio.beep(n <= 0);
  }
}

/* רכיבי הלוח נשלפים פעם אחת, וכותבים לדף רק כשהערך באמת השתנה */
const hud = {
  place: $("hudPlace"), lap: $("hudLap"), time: $("hudTime"), speed: $("hudSpeed"),
  nitroFill: $("nitroFill"), nitro: document.querySelector(".nitro"),
  touchNitro: document.querySelector(".touch-nitro"), speedlines: $("speedlines"),
  last: {}
};
function hudSet(key, value, write) {
  if (hud.last[key] === value) return;
  hud.last[key] = value;
  write(value);
}

function updateHud() {
  hudSet("place", `${race.placeOf(player)}/${cars.length}`, (v) => (hud.place.textContent = v));
  hudSet("lap", `${Math.floor(race.progress(player) * 100)}%`, (v) => (hud.lap.textContent = v));
  hudSet("time", formatTime(player.finished ? player.finishTime : race.time), (v) => (hud.time.textContent = v));
  hudSet("speed", Math.round(Math.abs(player.speed) * 4.2), (v) => (hud.speed.textContent = v));
  hudSet("nitro", Math.round(player.nitro * 100), (v) => (hud.nitroFill.style.width = `${v}%`));
  const ready = player.nitro > 0.15;
  hudSet("ready", ready, (v) => hud.nitro.classList.toggle("ready", v));
  hudSet("touchReady", ready && !player.nitroOn, (v) => hud.touchNitro.classList.toggle("ready", v));
  hudSet("lines", player.nitroOn || player.padBoost > 0.3 ? 0.9 : 0, (v) => (hud.speedlines.style.opacity = v));
  drawMinimap();
}

function showResults() {
  show("pauseButton", false); // אין מה להשהות במסך הסיום
  const place = race.placeOf(player);
  const titles = ["ניצחת! 🏆", "מקום שני!", "מקום שלישי!"];
  $("resultTitle").textContent = titles[place - 1] || `מקום ${place} מתוך ${cars.length}`;
  $("resultBadge").textContent = ["🏆", "🥈", "🥉"][place - 1] || "🏁";
  const list = $("resultList");
  list.innerHTML = "";
  race.standings().forEach((car, i) => {
    const li = document.createElement("li");
    if (car === player) li.className = "me";
    const t = race.projectedTime(car);
    li.innerHTML = `<span class="pos">${i + 1}</span>
      <span class="swatch" style="background:${hex(car.color)}"></span>
      <span class="name"></span>
      <span class="time">${car.finished ? "" : "~"}${formatTime(t)}</span>`;
    li.querySelector(".name").textContent = car.name;
    list.appendChild(li);
  });
  $("bestLap").textContent = player.finished ? `הזמן שלך: ${formatTime(player.finishTime)}` : "";
  show("results", true);
  show("touch", false);
}

/* ---------- מפה קטנה ---------- */

const mini = $("minimap");
const mctx = mini.getContext("2d");
let miniBounds = null;
const miniBase = document.createElement("canvas");
miniBase.width = mini.width;
miniBase.height = mini.height;

/* המסלול עצמו מצויר פעם אחת לקנבס נפרד; בכל פריים רק מעתיקים ומוסיפים נקודות */
function prepareMinimap() {
  const b = boundsOf(track);
  b.scale = (mini.width - 28) / Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  miniBounds = b;
  const g = miniBase.getContext("2d");
  g.clearRect(0, 0, mini.width, mini.height);
  g.lineJoin = "round";
  for (const [w, c] of [[9, "#1a1f2e"], [5, "#ffffff"]]) {
    g.beginPath();
    track.points.forEach((p, i) => {
      const [x, y] = toMini(p.x, p.z);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.closePath();
    g.lineWidth = w;
    g.strokeStyle = c;
    g.stroke();
  }
}

/* מבט מלמעלה; משקפים את x כדי ששמאל במפה יהיה שמאל אמיתי */
const toMini = (x, z) => [
  mini.width / 2 - (x - miniBounds.cx) * miniBounds.scale,
  mini.height / 2 - (z - miniBounds.cz) * miniBounds.scale
];

function drawMinimap() {
  mctx.clearRect(0, 0, mini.width, mini.height);
  mctx.drawImage(miniBase, 0, 0);
  for (const car of cars) {
    const [x, y] = toMini(car.x, car.z);
    mctx.beginPath();
    mctx.arc(x, y, car === player ? 6 : 4.5, 0, Math.PI * 2);
    mctx.fillStyle = hex(car.color);
    mctx.fill();
    mctx.lineWidth = 2;
    mctx.strokeStyle = "#1a1f2e";
    mctx.stroke();
  }
}

/* ---------- אפקטים: חלקיקים, קול ורעידה לפי מה שקרה למכוניות ---------- */

function rearOf(car, side) {
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  const lx = Math.cos(car.heading), lz = -Math.sin(car.heading);
  return [car.x - fx * 1.9 + lx * side, car.y + 0.3, car.z - fz * 1.9 + lz * side];
}

let effectTimer = 0;
function effects(dt) {
  effectTimer += dt;
  const emitNow = effectTimer > 1 / 40; // לא יותר מ-40 פליטות בשנייה לכל מכונית
  if (emitNow) effectTimer = 0;
  const camDist = (car) => Math.hypot(car.x - camera.position.x, car.z - camera.position.z);

  for (const car of cars) {
    const near = car === player || camDist(car) < 70;
    for (const ev of car.events) {
      if (ev === "wall" || ev === "bump") {
        if (near) {
          for (let i = 0; i < 8; i++) {
            particles.emit("spark", car.x, car.y + 0.8, car.z, PALETTE.gold, { vy: 6, spread: 10 });
          }
        }
        if (car === player) {
          shake = Math.max(shake, ev === "wall" ? 0.5 : 0.35);
          audio.thump(ev === "wall" ? 1 : 0.7);
        }
      } else if (ev === "land" && car === player) {
        shake = Math.max(shake, 0.4);
        audio.thump(0.8);
        for (let i = 0; i < 10; i++) particles.emit("dust", car.x, car.y + 0.3, car.z, track.theme.dust, { spread: 8 });
      } else if (ev === "pad" && car === player) {
        audio.pad();
      } else if (ev === "nitro" && car === player) {
        audio.whoosh();
      }
    }
    car.events.length = 0;

    if (!emitNow || !near) continue;
    const vx = -Math.sin(car.moveHeading) * car.speed * 0.15, vz = -Math.cos(car.moveHeading) * car.speed * 0.15;
    if (car.drifting) {
      for (const side of [1, -1]) {
        const [x, y, z] = rearOf(car, side);
        particles.emit("smoke", x, y, z, 0xf2f4f8, { vx, vz });
      }
    }
    if (car.grounded && car.offRoad && Math.abs(car.speed) > 10) {
      const [x, y, z] = rearOf(car, 0);
      particles.emit("dust", x, y, z, track.theme.dust, { vx, vz, spread: 3 });
    }
    if (car.nitroOn || car.padBoost > 0.4) {
      for (const side of [0.45, -0.45]) {
        const [x, y, z] = rearOf(car, side);
        particles.emit("flame", x, y + 0.3, z, Math.random() < 0.5 ? PALETTE.gold : PALETTE.berry, { vx: vx * 2, vz: vz * 2, spread: 1 });
      }
    }
  }
  particles.update(dt);
  confetti.update(dt);
}

function celebrate() {
  /* קונפטי מעל המכונית ומסביבה */
  const colors = [PALETTE.berry, PALETTE.gold, PALETTE.sky, PALETTE.purple, PALETTE.brand];
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 12;
    confetti.emit("confetti", player.x + Math.cos(a) * r, player.y + 9 + Math.random() * 6, player.z + Math.sin(a) * r,
      colors[i % colors.length], { vy: -2, spread: 4 });
  }
}

/* ---------- מצלמה ---------- */

const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const wantPos = new THREE.Vector3();   // וקטורים לשימוש חוזר — בלי ליצור חדשים בכל פריים
const wantLook = new THREE.Vector3();
let camReady = false;
let camBack = 9.5;

function updateCamera(dt, target, orbit = 0) {
  /* במירוץ המצלמה צמודה מאחורי האף, בלי השהיה — גם בדריפט רואים את גב המכונית */
  const dir = target.heading + orbit;
  const fx = Math.sin(dir), fz = Math.cos(dir);
  camBack += ((target.nitroOn ? 10.5 : 9.5) - camBack) * Math.min(1, dt * 5); // המצלמה מתרחקת בניטרו בהדרגה
  const back = orbit ? 14 : camBack;
  wantPos.set(target.x - fx * back, target.y + (orbit ? 6 : 4.4), target.z - fz * back);
  wantLook.set(target.x + Math.sin(target.heading) * 6, target.y + 1.2, target.z + Math.cos(target.heading) * 6);
  if (!camReady || !orbit) {
    camPos.copy(wantPos);
    camLook.copy(wantLook);
    camReady = true;
  } else {
    /* במוסך המצלמה מסתובבת לאט סביב הגריד */
    camPos.lerp(wantPos, 1 - Math.exp(-dt * 7));
    camLook.lerp(wantLook, 1 - Math.exp(-dt * 10));
  }
  camera.position.copy(camPos);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 1.6);
  }
  camera.lookAt(camLook);
  /* שדה הראייה נפתח במהירות, ועוד יותר בניטרו */
  const fov = 62 + Math.min(1.2, Math.abs(target.speed) / target.maxSpeed) * 12 + (target.nitroOn ? 6 : 0);
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
  }
  /* במסלול ענק מציירים רק את הנוף הקרוב, והשמיים (הרים ועננים) נעים עם המצלמה */
  if (track.sky) track.sky.position.set(camera.position.x, 0, camera.position.z);
  if (track.sceneryChunks) {
    for (const c of track.sceneryChunks) {
      c.group.visible = Math.abs(c.x - camera.position.x) < 420 && Math.abs(c.z - camera.position.z) < 420;
    }
  }
  /* השמש וצלה עוקבים אחרי המכונית */
  sun.position.set(target.x + 30, target.y + 60, target.z + 20);
  sun.target.position.set(target.x, target.y, target.z);
}

/* ---------- לולאה ---------- */

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  /* שינוי גודל מוחק את התמונה; בהשהיה לא מציירים בכל פריים, אז מציירים פעם אחת עכשיו */
  if (state === "paused") renderer.render(scene, camera);
}
addEventListener("resize", resize);
resize();

const STEP = 1 / 120;
let acc = 0;
let last = performance.now();
let orbit = 0;
let lastPausedDraw = 0;

function step(dt) {
  if (state === "countdown") {
    countdown -= dt;
    updateCountdown();
    if (countdown <= 1) state = "race";
    for (const car of cars) car.syncMesh(dt, track);
    return;
  }
  if (state === "race") {
    countdown -= dt;
    if (countdown < 0.3 && countdown + dt >= 0.3) show("countdown", false);
  }

  const level = LEVELS[settings.level];
  if (player.finished || autopilot) {
    /* אחרי הסיום ממשיכים לגלגל לאט (cruise) — מכונית עומדת על הקו הייתה חוסמת את מי שמסיים אחריך */
    const driver = autopilot || cooldownDriver;
    player.brakeDrifts = false; // בלם+היגוי=דריפט רק כשאדם נוהג
    driver.cruise = player.finished ? 25 : 0;
    driver.update(dt, track, 1, cars);
  } else {
    player.brakeDrifts = isTouch; // בטלפון אין מקש דריפט — שם בלם+היגוי מחליק; במקלדת יש רווח
    Object.assign(player.input, input.read());
  }
  for (const d of drivers) {
    /* גומייה עדינה: מי שבורח רחוק מאט מעט, מי שנשאר הרחק מאחור מקבל דחיפה */
    const gap = (d.car.distance - player.distance) / track.count;
    const boost = player.finished ? 1 : 1 - Math.max(-level.behind, Math.min(level.ahead, gap * 0.8));
    d.cruise = d.car.finished ? 25 : 0;
    d.update(dt, track, boost, cars);
  }
  for (const car of cars) car.update(dt, track, cars);
  resolveCollisions(cars);
  race.update(dt);

  if (player.finished && state === "race") {
    state = "finished";
    show("touch", false); // מעכשיו המחשב נוהג — הכפתורים כבר לא עושים כלום
    resultsShownAt = race.time + 1.8;
    audio.fanfare(race.placeOf(player) === 1);
    if (race.placeOf(player) <= 3) celebrate(); // קונפטי רק על הפודיום
  }
  if (state === "finished" && resultsShownAt && race.time >= resultsShownAt) {
    resultsShownAt = 0;
    showResults();
  }
}

function frame(now) {
  /* מקשי המשחק "נבלעים" רק בזמן מירוץ; במוסך ובתוצאות רווח וחצים עובדים כרגיל על כפתורים */
  input.capture = RACING.includes(state) && !(state === "finished" && !resultsShownAt);
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)) * TIME_SCALE;
  last = now;

  if (state === "paused") {
    /* בהשהיה לא מציירים בכל פריים — רק פעמיים בשנייה, למקרה שהדפדפן ניקה את התמונה */
  } else if (state === "menu") {
    /* מוסך: המצלמה מסתובבת לאט סביב המכוניות בגריד */
    orbit += dt * 0.25;
    for (const car of cars) car.syncMesh(dt, track);
    updateCamera(dt, player, orbit + Math.PI);
    audio.engine(player, false, dt);
  } else {
    acc += dt;
    while (acc >= STEP) {
      step(STEP);
      acc -= STEP;
    }
    effects(dt);
    updateCamera(dt, player);
    updateHud();
    audio.engine(player, true, dt);
  }

  /* בהשהיה התמונה האחרונה נשארת על המסך — אין טעם לצייר אותה שוב 60 פעמים בשנייה */
  if (state !== "paused" || now - lastPausedDraw > 500) {
    renderer.render(scene, camera);
    if (state === "paused") lastPausedDraw = now;
  }
  requestAnimationFrame(frame);
}

useTrack(currentTrackId);
buildCars();
buildGarage();
requestAnimationFrame(frame);

/* חשיפה לבדיקות אוטומטיות */
window.__race = {
  get state() { return state; },
  get drivers() { return drivers; },
  get race() { return race; },
  get player() { return player; },
  get cars() { return cars; },
  get track() { return track; },
  audio,
  renderer,
  start: startRace
};
