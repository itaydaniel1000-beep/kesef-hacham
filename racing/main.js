/* ===== מירוץ תלת-ממד — לולאת המשחק ===== */

import * as THREE from "three";
import { PALETTE } from "./toon.js";
import { Track } from "./track.js";
import { Car, resolveCollisions } from "./car.js";
import { Driver } from "./ai.js";
import { Input } from "./input.js";
import { Race, LAPS, formatTime } from "./race.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
/* לבדיקות: ?autopilot נותן למחשב לנהוג גם במכונית שלך, ?speed=4 מריץ מהר יותר */
const AUTOPILOT = params.has("autopilot");
const TIME_SCALE = Math.min(10, Math.max(0.1, Number(params.get("speed")) || 1));

/* ---------- סצנה ---------- */

const canvas = $("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.skyBg);
scene.fog = new THREE.Fog(PALETTE.skyBg, 140, 330);

const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 600);

scene.add(new THREE.HemisphereLight(0xffffff, 0x7fae6f, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.9);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
const sc = sun.shadow.camera;
sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 160;
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);

/* עננים שטוחים בסגנון מדבקה */
{
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const geo = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < 14; i++) {
    const cloud = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const puff = new THREE.Mesh(geo, cloudMat);
      puff.scale.set(9 + k * 2, 5 + (k % 2) * 2, 7);
      puff.position.set(k * 9 - 13, (k % 2) * 2, 0);
      cloud.add(puff);
    }
    const a = (i / 14) * Math.PI * 2;
    cloud.position.set(160 + Math.cos(a) * 380, 70 + (i % 3) * 14, 60 + Math.sin(a) * 380);
    cloud.lookAt(160, cloud.position.y, 60);
    scene.add(cloud);
  }
}

const track = new Track();
track.build(scene);

/* ---------- מכוניות ---------- */

const ROSTER = [
  { name: "זהבי", color: PALETTE.gold, maxSpeed: 41.5, line: 2.5, caution: 1.05 },
  { name: "תכלת", color: PALETTE.sky, maxSpeed: 42.5, line: -2.5, caution: 1 },
  { name: "אדומי", color: PALETTE.berry, maxSpeed: 43.5, line: 0.5, caution: 0.95 }
];

const player = new Car({ name: "אני", color: PALETTE.brand, maxSpeed: 45 });
const rivals = ROSTER.map((r) => new Car(r));
const drivers = rivals.map((car, i) => new Driver(car, ROSTER[i]));
const autopilot = AUTOPILOT ? new Driver(player, { line: 0, caution: 0.95 }) : null;
/* אחרי קו הסיום המחשב לוקח את ההגה ומאט בעדינות */
const cooldownDriver = new Driver(player);
const cars = [...rivals, player];
for (const car of cars) scene.add(car.mesh);

/* גריד הזינוק: שתי שורות לפני הקו, השחקן מתחיל אחרון */
function gridUp() {
  const slots = [[-5, 3], [-5, -3], [-13, 3], [-13, -3]];
  cars.forEach((car, i) => {
    const [back, side] = slots[i];
    car.placeAt(track, track.wrap(back), side);
  });
}

/* ---------- קלט וממשק ---------- */

const input = new Input();
input.bindTouch($("touch"));
const isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
if (isTouch) document.body.classList.add("touch");

let state = "menu"; // menu | countdown | race | finished
let race = null;
let countdown = 0;
let resultsShownAt = 0;

function show(id, on) {
  $(id).classList.toggle("hidden", !on);
}

function startRace() {
  gridUp();
  race = new Race(track, cars, player);
  state = "countdown";
  countdown = 3.999;
  resultsShownAt = 0;
  show("menu", false);
  show("results", false);
  show("hud", true);
  show("touch", isTouch);
  show("countdown", true);
  audio.start();
}

$("startButton").addEventListener("click", startRace);
$("againButton").addEventListener("click", startRace);
addEventListener("keydown", (e) => {
  if (e.code === "Enter" && (state === "menu" || state === "finished")) startRace();
});

let lastCount = "";
function updateCountdown() {
  const el = $("countdown");
  const n = Math.ceil(countdown - 1);
  const text = n > 0 ? String(n) : "צא!";
  if (text !== lastCount) {
    lastCount = text;
    el.textContent = text;
    el.classList.toggle("go", n <= 0);
    el.classList.remove("pop");
    void el.offsetWidth;
    el.classList.add("pop");
    audio.beep(n > 0 ? 440 : 880);
  }
}

function updateHud() {
  $("hudPlace").textContent = `${race.placeOf(player)}/${cars.length}`;
  $("hudLap").textContent = `${race.currentLap(player)}/${LAPS}`;
  $("hudTime").textContent = formatTime(player.finished ? player.finishTime : race.time);
  $("hudSpeed").textContent = Math.round(Math.abs(player.speed) * 4.2);
  drawMinimap();
}

function showResults() {
  const place = race.placeOf(player);
  const titles = ["ניצחת! 🏆", "מקום שני!", "מקום שלישי!", "מקום רביעי"];
  $("resultTitle").textContent = titles[place - 1];
  $("resultBadge").textContent = ["🏆", "🥈", "🥉", "🏁"][place - 1];
  const list = $("resultList");
  list.innerHTML = "";
  race.standings().forEach((car, i) => {
    const li = document.createElement("li");
    if (car === player) li.className = "me";
    const t = race.projectedTime(car);
    li.innerHTML = `<span class="pos">${i + 1}</span>
      <span class="swatch" style="background:#${car.color.toString(16).padStart(6, "0")}"></span>
      <span class="name"></span>
      <span class="time">${car.finished ? "" : "~"}${formatTime(t)}</span>`;
    li.querySelector(".name").textContent = car.name;
    list.appendChild(li);
  });
  const best = Math.min(...player.lapTimes);
  $("bestLap").textContent = Number.isFinite(best) ? `ההקפה הכי טובה שלך: ${formatTime(best)}` : "";
  show("results", true);
  show("touch", false);
}

/* ---------- מפה קטנה ---------- */

const mini = $("minimap");
const mctx = mini.getContext("2d");
const bounds = (() => {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of track.points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const scale = (mini.width - 28) / Math.max(maxX - minX, maxZ - minZ);
  return { minX, maxX, minZ, maxZ, scale };
})();
/* המפה מוצגת כאילו מסתכלים מלמעלה כשצפון = +z, ומשקפים את x כדי ששמאל במפה יהיה שמאל אמיתי */
const toMini = (x, z) => [
  mini.width / 2 - (x - (bounds.minX + bounds.maxX) / 2) * bounds.scale,
  mini.height / 2 - (z - (bounds.minZ + bounds.maxZ) / 2) * bounds.scale
];

function drawMinimap() {
  mctx.clearRect(0, 0, mini.width, mini.height);
  mctx.lineJoin = "round";
  for (const [w, c] of [[9, "#1a1f2e"], [5, "#ffffff"]]) {
    mctx.beginPath();
    track.points.forEach((p, i) => {
      const [x, y] = toMini(p.x, p.z);
      i ? mctx.lineTo(x, y) : mctx.moveTo(x, y);
    });
    mctx.closePath();
    mctx.lineWidth = w;
    mctx.strokeStyle = c;
    mctx.stroke();
  }
  for (const car of [...rivals, player]) {
    const [x, y] = toMini(car.x, car.z);
    mctx.beginPath();
    mctx.arc(x, y, car === player ? 6 : 4.5, 0, Math.PI * 2);
    mctx.fillStyle = "#" + car.color.toString(16).padStart(6, "0");
    mctx.fill();
    mctx.lineWidth = 2;
    mctx.strokeStyle = "#1a1f2e";
    mctx.stroke();
  }
}

/* ---------- קול מנוע (נוצר בדפדפן, בלי קבצים) ---------- */

const audio = {
  ctx: null,
  muted: false,
  start() {
    if (this.ctx) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 600;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(filter).connect(gain).connect(ctx.destination);
      osc.start();
      Object.assign(this, { ctx, osc, gain, filter });
    } catch {
      /* אין תמיכה בקול — המשחק ממשיך בשקט */
    }
  },
  engine(speed, gas) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const rpm = Math.abs(speed) / player.maxSpeed;
    this.osc.frequency.setTargetAtTime(55 + rpm * 150 + gas * 15, t, 0.08);
    this.filter.frequency.setTargetAtTime(400 + rpm * 900, t, 0.1);
    const vol = this.muted || state !== "race" && state !== "countdown" ? 0 : 0.035 + rpm * 0.04;
    this.gain.gain.setTargetAtTime(vol, t, 0.1);
  },
  beep(freq) {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.12, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);
    o.connect(g).connect(this.ctx.destination);
    o.start();
    o.stop(this.ctx.currentTime + 0.4);
  }
};

$("muteButton").addEventListener("click", () => {
  audio.muted = !audio.muted;
  $("muteButton").textContent = audio.muted ? "🔇" : "🔊";
});

/* ---------- מצלמה ---------- */

const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let camReady = false;

function updateCamera(dt, target, orbit = 0) {
  const fx = Math.sin(target.heading + orbit), fz = Math.cos(target.heading + orbit);
  const back = orbit ? 14 : 9.5;
  const wantPos = new THREE.Vector3(target.x - fx * back, orbit ? 6 : 4.4, target.z - fz * back);
  const wantLook = new THREE.Vector3(target.x + Math.sin(target.heading) * 6, 1.2, target.z + Math.cos(target.heading) * 6);
  if (!camReady) {
    camPos.copy(wantPos);
    camLook.copy(wantLook);
    camReady = true;
  }
  const k = 1 - Math.exp(-dt * 7);
  camPos.lerp(wantPos, k);
  camLook.lerp(wantLook, 1 - Math.exp(-dt * 10));
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  /* שדה הראייה נפתח מעט במהירות גבוהה */
  const fov = 62 + Math.min(1, Math.abs(target.speed) / target.maxSpeed) * 12;
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
  }
  /* השמש וצלה עוקבים אחרי המכונית */
  sun.position.set(target.x + 30, 60, target.z + 20);
  sun.target.position.set(target.x, 0, target.z);
}

/* ---------- לולאה ---------- */

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

const STEP = 1 / 120;
let acc = 0;
let last = performance.now();
let orbit = 0;

function step(dt) {
  if (state === "countdown") {
    countdown -= dt;
    updateCountdown();
    if (countdown <= 1) state = "race";
  }
  if (state === "countdown") {
    for (const car of cars) car.syncMesh(dt);
    return;
  }
  if (state === "race") {
    countdown -= dt;
    if (countdown < 0.3) show("countdown", false);
  }

  if (state === "race" || state === "finished") {
    if (player.finished || autopilot) {
      (autopilot || cooldownDriver).update(dt, track);
      if (player.finished) {
        player.input.gas = 0;
        player.input.brake = player.speed > 6 ? 0.4 : 0;
      }
    } else {
      Object.assign(player.input, input.read());
    }
    for (const d of drivers) {
      /* גומייה עדינה: מי שבורח רחוק מאט מעט, מי שנשאר הרחק מאחור מקבל דחיפה */
      const gap = (d.car.distance - player.distance) / track.count;
      const boost = d.car.finished || player.finished ? 0.8 : 1 - Math.max(-0.06, Math.min(0.07, gap * 0.25));
      d.update(dt, track, boost);
      if (d.car.finished) d.car.input.gas = d.car.speed < 15 ? 1 : 0;
    }
    for (const car of cars) car.update(dt, track);
    resolveCollisions(cars);
    race.update(dt);
    if (player.finished && state === "race") {
      state = "finished";
      resultsShownAt = race.time + 1.6;
    }
    if (state === "finished" && resultsShownAt && race.time >= resultsShownAt) {
      resultsShownAt = 0;
      showResults();
    }
  }
}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000) * TIME_SCALE;
  last = now;

  if (state === "menu") {
    /* מסך פתיחה: המצלמה מסתובבת לאט סביב המכוניות בגריד */
    orbit += dt * 0.25;
    for (const car of cars) car.syncMesh(dt);
    updateCamera(dt, player, orbit + Math.PI);
  } else {
    acc += dt;
    while (acc >= STEP) {
      step(STEP);
      acc -= STEP;
    }
    updateCamera(dt, player);
    updateHud();
    audio.engine(player.speed, player.input.gas);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

gridUp();
requestAnimationFrame(frame);

/* חשיפה לבדיקות אוטומטיות */
window.__race = {
  get state() { return state; },
  get race() { return race; },
  player,
  cars,
  start: startRace
};
