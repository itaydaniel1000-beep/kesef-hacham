/* ===== התקדמות השחקן: מטבעות, XP ורמה, שיאים, רוחות, חנות, מכוניות נעולות ואתגרים יומיים =====
   הכול נשמר בדפדפן (localStorage) */

const KEY = "racing-profile";
const DEFAULT = {
  coins: 0, xp: 0, wins: 0, races: 0,
  records: {},            // "מסלול:הקפות" -> הזמן הכי טוב
  ghosts: {},             // "מסלול:הקפות" -> ההקלטה של השיא (לנגד השעון)
  owned: ["metal"], finish: "metal",
  glows: [], glow: null,
  spoilerOwned: false, spoiler: false,
  daily: { date: "", done: [] }
};

function load() {
  try {
    return { ...structuredClone(DEFAULT), ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return structuredClone(DEFAULT);
  }
}

export const profile = load();

export function saveProfile() {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* אחסון מלא או חסום — ממשיכים בלי שמירה */
  }
}

/* רמה: כל רמה דורשת 25% יותר XP מהקודמת */
export function levelInfo(xp = profile.xp) {
  let level = 1, need = 120, rest = xp;
  while (rest >= need) {
    rest -= need;
    level++;
    need = Math.round(need * 1.25);
  }
  return { level, into: rest, need };
}

/* ===== חנות ===== */
export const FINISHES = [
  { id: "metal", name: "מטאלי", price: 0 },
  { id: "matte", name: "מט", price: 300 },
  { id: "gold", name: "זהב", price: 600 },
  { id: "chrome", name: "כרום", price: 900 },
  { id: "rainbow", name: "קשת", price: 1500 }
];
export const GLOWS = [
  { id: "blue", name: "ניאון כחול", color: 0x2a7bff, price: 400 },
  { id: "pink", name: "ניאון ורוד", color: 0xff2ad8, price: 400 },
  { id: "green", name: "ניאון ירוק", color: 0x2aff6a, price: 400 }
];
export const SPOILER_PRICE = 500;

export function buy(kind, id) {
  const item = kind === "finish" ? FINISHES.find((f) => f.id === id) : kind === "glow" ? GLOWS.find((g) => g.id === id) : { price: SPOILER_PRICE };
  if (!item || profile.coins < item.price) return false;
  profile.coins -= item.price;
  if (kind === "finish") {
    profile.owned.push(id);
    profile.finish = id;
  } else if (kind === "glow") {
    profile.glows.push(id);
    profile.glow = id;
  } else {
    profile.spoilerOwned = true;
    profile.spoiler = true;
  }
  saveProfile();
  return true;
}

/* ===== מכוניות שנפתחות בהישגים ===== */
export const UNLOCKS = {
  super: { test: () => profile.wins >= 3, text: "נפתחת אחרי 3 ניצחונות" },
  turbo: { test: () => levelInfo().level >= 10, text: "נפתחת ברמה 10" }
};
export const isUnlocked = (type) => !UNLOCKS[type] || UNLOCKS[type].test();

/* ===== אתגרים יומיים: 3 בכל יום, לפי התאריך ===== */
const CHALLENGES = [
  { id: "noWall", text: "סיים מירוץ בלי לפגוע בקיר", test: (r) => r.finished && r.stats.wallHits === 0 },
  { id: "winHard", text: "נצח בקושי קשה", test: (r) => r.place === 1 && r.level === "hard" && r.mode === "race" },
  { id: "podium", text: "סיים בשלישייה הראשונה", test: (r) => r.place <= 3 && r.mode === "race" },
  { id: "win", text: "נצח במירוץ", test: (r) => r.place === 1 && r.mode === "race" },
  { id: "drifts", text: "עשה 10 דריפטים במירוץ אחד", test: (r) => r.stats.drifts >= 10 },
  { id: "missiles", text: "פגע ב-2 טילים במירוץ אחד", test: (r) => r.stats.missileHits >= 2 },
  { id: "items", text: "השתמש ב-5 פריטים במירוץ אחד", test: (r) => r.stats.itemsUsed >= 5 },
  { id: "coins", text: "אסוף 15 מטבעות במירוץ אחד", test: (r) => r.stats.coins >= 15 },
  { id: "noMine", text: "סיים מירוץ בלי לעלות על מוקש", test: (r) => r.finished && r.mode === "race" && r.stats.minesHit === 0 },
  { id: "forest", text: "נצח בגראנד-פרי היער", test: (r) => r.place === 1 && r.track === "forest" && r.mode === "race" },
  { id: "desert", text: "נצח בקניון השמש", test: (r) => r.place === 1 && r.track === "desert" && r.mode === "race" },
  { id: "snow", text: "נצח בפסגת הקרח", test: (r) => r.place === 1 && r.track === "snow" && r.mode === "race" },
  { id: "laps3", text: "סיים מירוץ של 3 הקפות או יותר", test: (r) => r.finished && r.laps >= 3 },
  { id: "nitro", text: "השתמש בניטרו 15 שניות במירוץ אחד", test: (r) => r.stats.nitroTime >= 15 },
  { id: "trial", text: "סיים מירוץ נגד השעון", test: (r) => r.finished && r.mode === "trial" }
];
export const CHALLENGE_REWARD = { coins: 150, xp: 100 };

const today = () => new Date().toLocaleDateString("en-CA"); // 2026-10-10, לפי השעון המקומי
export function dailyChallenges() {
  const date = today();
  if (profile.daily.date !== date) profile.daily = { date, done: [] };
  /* בחירה קבועה לכל תאריך */
  let seed = [...date].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 2147483647, 7);
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pool = [...CHALLENGES];
  const picked = [];
  while (picked.length < 3) picked.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return picked.map((c) => ({ ...c, done: profile.daily.done.includes(c.id) }));
}

/* ===== סוף מירוץ: מטבעות, XP, שיא ואתגרים ===== */
const PLACE_COINS = [100, 80, 65, 50, 40, 30, 22, 15, 10];
export function finishRace(r) {
  const before = levelInfo().level;
  let coins = r.stats.coins;
  if (r.mode === "race") coins += PLACE_COINS[r.place - 1] ?? 10;
  else coins += 30;
  coins = Math.round(coins * (0.6 + 0.4 * r.laps)); // מירוץ ארוך יותר — יותר מטבעות
  let xp = Math.round(coins * 1.5);
  /* שיא */
  const key = `${r.track}:${r.laps}`;
  const newRecord = r.finished && (!profile.records[key] || r.time < profile.records[key]);
  if (newRecord) profile.records[key] = r.time;
  /* אתגרים */
  const completed = [];
  for (const c of dailyChallenges()) {
    if (c.done || !c.test(r)) continue;
    profile.daily.done.push(c.id);
    completed.push(c.text);
    coins += CHALLENGE_REWARD.coins;
    xp += CHALLENGE_REWARD.xp;
  }
  profile.coins += coins;
  profile.xp += xp;
  profile.races++;
  if (r.mode === "race" && r.place === 1) profile.wins++;
  saveProfile();
  const after = levelInfo().level;
  return { coins, xp, newRecord, completed, levelUp: after > before ? after : 0 };
}

export const recordOf = (track, laps) => profile.records[`${track}:${laps}`];

/* ===== רוח לנגד השעון: דגימות [x, y, z, heading] כל 0.1 שנייה, דחוסות ל-base64 ===== */
export function saveGhost(track, laps, samples) {
  const arr = new Float32Array(samples.flat());
  let bin = "";
  const bytes = new Uint8Array(arr.buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  profile.ghosts[`${track}:${laps}`] = btoa(bin);
  saveProfile();
}

export function loadGhost(track, laps) {
  const data = profile.ghosts[`${track}:${laps}`];
  if (!data) return null;
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}
