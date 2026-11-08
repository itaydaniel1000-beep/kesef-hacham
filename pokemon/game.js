/* ===== פוקימון על שולחן הפוקר =====
   משחק שיתופי ל-1 עד 5 שחקנים על מכשיר אחד.
   כל המצב נמצא ב-S ונשמר בדפדפן אחרי כל פעולה. */

const SAVE_KEY = "pokemon-poker-save";
let S = null;           // מצב המשחק
let ui = {busy: false, carousel: 0, setupCount: 3, rolling: null};

const $ = sel => document.querySelector(sel);
const rnd = n => Math.floor(Math.random() * n);
const shuffle = arr => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));

/* ---------- חוקים ---------- */

function makeMon(id) {
  const hp = POKEMON[id].hp * CONFIG.hpScale;
  return {id, hp, maxHp: hp};
}

/* לתוקף עם שני סוגים - הסוג הטוב מבין השניים */
function typeMultiplier(atkTypes, defTypes) {
  let best = 0;
  for (const a of atkTypes) {
    let m = 1;
    for (const d of defTypes) {
      const v = TYPE_CHART[a][d];
      if (v !== undefined) m *= v;
    }
    best = Math.max(best, m);
  }
  return best;
}

function damageOf(attackerId, defenderId) {
  const mult = typeMultiplier(POKEMON[attackerId].types, POKEMON[defenderId].types);
  return {mult, dmg: Math.round(POKEMON[attackerId].power * mult)};
}

function catchChance(wild) {
  const base = POKEMON[wild.id].catch || 0;
  const lost = 1 - wild.hp / wild.maxHp;
  return Math.min(CONFIG.catchMax, base + (1 - base) * lost * CONFIG.catchGrowth);
}

const alive = p => p.team.filter(m => m.hp > 0);
const anyAlive = () => S.players.some(p => alive(p).length > 0);

function multText(mult) {
  if (mult === 0) return "אין השפעה";
  if (mult >= 2) return `יעיל מאוד! פי ${mult}`;
  if (mult === 0.5) return "לא יעיל - חצי כוח";
  if (mult < 0.5) return "לא יעיל - רבע כוח";
  return "רגיל";
}

function log(text) {
  S.log.unshift(text);
  S.log.length = Math.min(S.log.length, 30);
}

/* ---------- זרימת המשחק ---------- */

function newGame(names) {
  S = {
    players: names.map(name => ({name, team: [], roll: null})),
    deck: shuffle(WILD_DECK),
    starterPool: STARTERS.slice(),
    wild: null,
    order: [],
    pos: 0,
    resolved: 0,
    phase: "starterRoll",
    message: null,
    log: []
  };
  log("ההרפתקה מתחילה!");
  save();
  render();
}

/* הטלת קוביות: הגבוה ראשון. בשוויון - הכרעה אקראית ביניהם */
function rollOrder() {
  const rolls = S.players.map(() => rnd(6) + 1);
  const tie = S.players.map(() => Math.random());
  S.order = S.players.map((_, i) => i).sort((a, b) => rolls[b] - rolls[a] || tie[b] - tie[a]);
  S.players.forEach((p, i) => (p.roll = rolls[i]));
  S.pos = 0;
}

function doRoll(after) {
  if (ui.busy) return;
  ui.busy = true;
  rollOrder();
  const final = S.players.map(p => p.roll);
  let ticks = 0;
  ui.rolling = setInterval(() => {
    S.players.forEach(p => (p.roll = rnd(6) + 1));
    renderTable();
    if (++ticks > 9) {
      clearInterval(ui.rolling);
      S.players.forEach((p, i) => (p.roll = final[i]));
      ui.busy = false;
      const names = S.order.map(i => S.players[i].name).join(" ← ");
      log(`קוביות: ${names}`);
      after();
    }
  }, 80);
}

function startStarterPick() {
  S.phase = "starterPick";
  ui.carousel = 0;
  save();
  render();
}

function pickStarter(id) {
  const p = S.players[S.order[S.pos]];
  p.team.push(makeMon(id));
  S.starterPool = S.starterPool.filter(x => x !== id);
  log(`${p.name} בחר ב${POKEMON[id].he}`);
  S.pos++;
  ui.carousel = 0;
  if (S.pos >= S.order.length) drawWild();
  else { save(); render(); }
}

function drawWild() {
  if (S.deck.length === 0) return startBoss();
  const id = S.deck.shift();
  S.wild = makeMon(id);
  S.phase = "roundRoll";
  log(`פוקימון פראי הופיע: ${POKEMON[id].he}!`);
  showMessage(`פוקימון פראי הופיע!`, `${POKEMON[id].he} קופץ מהחבילה אל השולחן.`, "roundRoll");
}

function startBoss() {
  const b = CONFIG.boss;
  const hp = b.hpPerPlayer * S.players.length;
  S.wild = {id: b.id, hp, maxHp: hp, boss: true};
  if (b.healBefore) healAll();
  log("הקרב האחרון!");
  showMessage("הקרב האחרון!", `החבילה נגמרה. ${POKEMON[b.id].he} מופיע. אם תנצחו - כולם מנצחים את ההרפתקה. אם לאף אחד לא יישאר פוקימון חי - כולם מפסידים.${b.healBefore ? " לפני הקרב כל הפוקימונים מתרפאים." : ""}`, "roundRoll");
}

function startTurns() {
  S.phase = "turn";
  skipDead();
}

/* מדלגים על שחקן שאין לו פוקימון חי */
function skipDead() {
  while (S.pos < S.order.length && alive(S.players[S.order[S.pos]]).length === 0) {
    log(`${S.players[S.order[S.pos]].name} מדלג - אין לו פוקימון חי`);
    S.pos++;
  }
  if (S.pos >= S.order.length) return wildTurn();
  S.phase = "turn";
  save();
  render();
}

function nextTurn() {
  S.pos++;
  skipDead();
}

function attack(monIndex) {
  const p = S.players[S.order[S.pos]];
  const mon = p.team[monIndex];
  if (!mon || mon.hp <= 0) return;
  const {mult, dmg} = damageOf(mon.id, S.wild.id);
  S.wild.hp = Math.max(0, S.wild.hp - dmg);
  log(`${p.name}: ${POKEMON[mon.id].he} תוקף - ${dmg} (${multText(mult)})`);
  S.phase = "turn";
  render();
  flashDamage(".wild-card", dmg, mult);
  ui.busy = true;
  setTimeout(() => {
    ui.busy = false;
    if (S.wild.hp <= 0) wildFainted();
    else nextTurn();
  }, 1100);
}

function wildFainted() {
  const w = S.wild;
  if (w.boss) return endGame(true);
  const at = rnd(S.deck.length + 1);
  S.deck.splice(at, 0, w.id);
  log(`${POKEMON[w.id].he} התעלף וחזר לחבילה`);
  S.wild = null;
  resolveWild(`${POKEMON[w.id].he} התעלף!`, "הוא חוזר למקום אקראי בחבילה.");
}

function caught() {
  const p = S.players[S.order[S.pos]];
  const w = S.wild;
  p.team.push({id: w.id, hp: w.hp, maxHp: w.maxHp});
  log(`${p.name} תפס את ${POKEMON[w.id].he}!`);
  S.wild = null;
  resolveWild(`${p.name} תפס את ${POKEMON[w.id].he}!`, "הפוקימון מצטרף אליו ונשאר אצלו.");
}

function resolveWild(title, text) {
  S.resolved++;
  if (S.resolved % CONFIG.clinicEvery === 0) {
    healAll();
    log("ביקור במרפאה - כולם מתרפאים");
    text += ` אחרי ${CONFIG.clinicEvery} פוקימונים פראיים הולכים למרפאה: כל הפוקימונים חוזרים לחיים מלאים. 🏥`;
  }
  showMessage(title, text, "drawWild");
}

function healAll() {
  S.players.forEach(p => p.team.forEach(m => (m.hp = m.maxHp)));
}

/* תור הפוקימון הפראי: תוקף פוקימון חי אקראי.
   הבוס תוקף פעם אחת לכל שחקן.
   אם לאף שחקן לא נשאר פוקימון חי - כולם מפסידים. */
function wildTurn() {
  if (!anyAlive()) return endGame(false);
  const hits = S.wild.boss ? S.players.length : 1;
  const lines = [];
  for (let k = 0; k < hits && anyAlive(); k++) {
    const targets = [];
    S.players.forEach(p => p.team.forEach(m => m.hp > 0 && targets.push({p, m})));
    const {p, m} = targets[rnd(targets.length)];
    const {mult, dmg} = damageOf(S.wild.id, m.id);
    m.hp = Math.max(0, m.hp - dmg);
    const ko = m.hp === 0 ? " - התעלף! 💫" : "";
    lines.push(`תוקף את ${POKEMON[m.id].he} של ${p.name}: ‎-${dmg} (${multText(mult)})${ko}`);
    log(`${POKEMON[S.wild.id].he} ${lines[lines.length - 1]}`);
  }
  // אין לאף שחקן פוקימון חי - מפסידים את ההרפתקה
  if (!anyAlive()) {
    return showMessage(`תור של ${POKEMON[S.wild.id].he}`, lines.join("\n"), "lose");
  }
  showMessage(`תור של ${POKEMON[S.wild.id].he}`, lines.join("\n") + "\n\nמטילים שוב קוביות לסבב הבא.", "roundRoll");
}

function endGame(win) {
  S.phase = "end";
  S.win = win;
  log(win ? "ניצחתם את ההרפתקה!" : "הפסדתם את ההרפתקה");
  save();
  render();
}

/* הודעה עם כפתור "המשך". next הוא שם השלב הבא - כך זה שורד שמירה */
function showMessage(title, text, next) {
  S.message = {title, text, next};
  S.phase = "message";
  save();
  render();
}

const NEXT = {
  roundRoll: () => { S.phase = "roundRoll"; save(); render(); },
  drawWild: () => drawWild(),
  lose: () => endGame(false)
};

function continueMessage() {
  const next = S.message.next;
  S.message = null;
  NEXT[next]();
}

/* ---------- שמירה ---------- */

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {}
}
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
}
function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
}

/* ---------- תצוגה ---------- */

const DIE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

function typeBadges(types) {
  return types.map(t => `<span class="type" style="background:${TYPES[t].color}">${TYPES[t].icon} ${TYPES[t].he}</span>`).join("");
}

function hpBar(m) {
  const pct = Math.round(100 * m.hp / m.maxHp);
  const cls = pct > 50 ? "good" : pct > 20 ? "mid" : "low";
  return `<div class="hp"><div class="hp-fill ${cls}" style="width:${pct}%"></div></div>
          <div class="hp-text">❤️ ${m.hp}/${m.maxHp}</div>`;
}

function cardHTML(m, extra = "") {
  const d = POKEMON[m.id];
  const t1 = TYPES[d.types[0]], t2 = TYPES[d.types[1] || d.types[0]];
  const dead = m.hp <= 0 ? " fainted" : "";
  return `<div class="card${dead}" style="--c1:${t1.color};--c2:${t2.color}">
    <div class="card-art"><img src="${ART_URL(d.dex)}" alt="${d.he}" onerror="this.replaceWith(document.createTextNode('${t1.icon}'))"></div>
    <div class="card-name">${d.he}</div>
    <div class="card-types">${typeBadges(d.types)}</div>
    ${hpBar(m)}
    <div class="card-power">⚔️ חוזק ${d.power}</div>
    ${extra}
  </div>`;
}

function seatPos(i, n) {
  const a = (90 + i * 360 / n) * Math.PI / 180;
  return {x: 50 + 42 * Math.cos(a), y: 50 + 41 * Math.sin(a)};
}

function renderTable() {
  const t = $("#table");
  if (!S) { t.innerHTML = ""; return; }
  const n = S.players.length;
  const current = (S.phase === "turn" || S.phase === "starterPick") ? S.order[S.pos] : -1;
  const seats = S.players.map((p, i) => {
    const {x, y} = seatPos(i, n);
    const dots = p.team.map(m => `<i class="dot${m.hp <= 0 ? " dead" : ""}" style="background:${TYPES[POKEMON[m.id].types[0]].color}"></i>`).join("");
    const die = p.roll ? `<span class="die">${DIE[p.roll]}</span>` : "";
    return `<button class="seat${i === current ? " active" : ""}" style="left:${x}%;top:${y}%" onclick="showTeam(${i})">
      <div class="seat-name">${esc(p.name)} ${die}</div>
      <div class="seat-team">${dots || "<span class='muted'>אין עדיין</span>"}</div>
    </button>`;
  }).join("");

  let center = "";
  if (S.wild) {
    const chance = S.wild.boss ? "" : `<div class="chance">🎯 תפיסה ${Math.round(catchChance(S.wild) * 100)}%</div>`;
    center = `<div class="wild-card${S.wild.boss ? " boss" : ""}">${cardHTML(S.wild, chance)}</div>`;
  } else {
    center = `<div class="logo">פוקימון<br><small>שולחן ההרפתקה</small></div>`;
  }
  const untilClinic = CONFIG.clinicEvery - (S.resolved % CONFIG.clinicEvery);
  t.innerHTML = `
    <div class="felt">
      <div class="center">${center}</div>
      <div class="deck" title="חבילה"><div class="deck-back">🎴</div><div>${S.deck.length}</div></div>
      <div class="clinic" title="מרפאה">🏥 בעוד ${untilClinic}</div>
    </div>
    ${seats}`;
}

function renderPanel() {
  const el = $("#panel");
  if (!S) return renderSetup(el);
  const cur = S.players[S.order[S.pos]];
  switch (S.phase) {
    case "starterRoll":
      el.innerHTML = `<h2>מי בוחר ראשון?</h2>
        <p>כל שחקן מטיל קובייה. מי שמקבל הכי הרבה בוחר ראשון פוקימון התחלתי.</p>
        <button class="btn primary" onclick="doRoll(startStarterPick)">🎲 הטילו קוביות</button>`;
      break;
    case "starterPick":
      el.innerHTML = `<h2>${esc(cur.name)}, בחר פוקימון התחלתי</h2>` +
        carouselHTML(S.starterPool.map(makeMon), "pickStarterAt", false);
      break;
    case "roundRoll":
      el.innerHTML = `<h2>מי ראשון בסבב?</h2>
        <p>מטילים קוביות כדי לקבוע את סדר התורות מול ${POKEMON[S.wild.id].he}.</p>
        <button class="btn primary" onclick="doRoll(startTurns)">🎲 הטילו קוביות</button>`;
      break;
    case "turn":
      el.innerHTML = `<h2>התור של ${esc(cur.name)}</h2>
        <p>מה תעשה מול ${POKEMON[S.wild.id].he}?</p>
        <div class="row">
          <button class="btn attack" onclick="openAttack()">⚔️ תקוף</button>
          ${S.wild.boss ? "" : `<button class="btn catch" onclick="openCatch()">🔴 תפוס</button>`}
        </div>`;
      break;
    case "attack":
      el.innerHTML = `<h2>${esc(cur.name)}: עם מי לתקוף?</h2>` +
        carouselHTML(cur.team, "attackAt", true);
      break;
    case "message":
      el.innerHTML = `<h2>${esc(S.message.title)}</h2>
        <p class="pre">${esc(S.message.text)}</p>
        <button class="btn primary" onclick="continueMessage()">המשך</button>`;
      break;
    case "end":
      el.innerHTML = `<h2>${S.win ? "🏆 ניצחתם את ההרפתקה!" : "💫 הפסדתם את ההרפתקה"}</h2>
        <p>${S.win ? `כל הכבוד! ${POKEMON[CONFIG.boss.id].he} הובס.` : "לאף שחקן לא נשאר פוקימון חי."} מתחילים מחדש.</p>
        <div class="row">
          <button class="btn primary" onclick="newGame(S.players.map(p => p.name))">הרפתקה חדשה</button>
          <button class="btn" onclick="resetToSetup()">שחקנים אחרים</button>
        </div>`;
      break;
  }
  el.innerHTML += S.log.length ? `<details class="log"><summary>מה קרה עד עכשיו</summary><ul>${S.log.map(l => `<li>${esc(l)}</li>`).join("")}</ul></details>` : "";
}

/* קרוסלה: פוקימון אחד בכל פעם, חצים ימינה ושמאלה, חזור */
function carouselHTML(mons, onPick, withBack) {
  if (!mons.length) return "";
  ui.carousel = (ui.carousel + mons.length) % mons.length;
  const m = mons[ui.carousel];
  let vs = "";
  if (S.wild && withBack) {
    const {mult, dmg} = damageOf(m.id, S.wild.id);
    vs = `<div class="vs ${mult > 1 ? "up" : mult < 1 ? "down" : ""}">מוריד ${dmg} • ${multText(mult)}</div>`;
  }
  const disabled = m.hp <= 0 ? "disabled" : "";
  return `<div class="carousel">
      <button class="arrow" onclick="moveCarousel(-1)" aria-label="הקודם">▶</button>
      <div class="carousel-card">${cardHTML(m, vs)}<div class="count">${ui.carousel + 1} מתוך ${mons.length}</div></div>
      <button class="arrow" onclick="moveCarousel(1)" aria-label="הבא">◀</button>
    </div>
    <div class="row">
      ${withBack ? `<button class="btn" onclick="backToTurn()">↩ חזור</button>` : ""}
      <button class="btn primary" ${disabled} onclick="${onPick}(${ui.carousel})">${m.hp <= 0 ? "התעלף" : "בחר"}</button>
    </div>`;
}

function moveCarousel(d) { ui.carousel += d; renderPanel(); }
function pickStarterAt(i) { pickStarter(S.starterPool[i]); }
function attackAt(i) { if (!ui.busy) attack(i); }
function openAttack() { if (ui.busy) return; S.phase = "attack"; ui.carousel = 0; renderPanel(); }
function backToTurn() { S.phase = "turn"; renderPanel(); }

/* תפיסה: "בטוח?" עם הסיכויים מעל, ואז גלגל מזל */
function openCatch() {
  if (ui.busy) return;
  const pct = Math.round(catchChance(S.wild) * 100);
  modal(`<div class="odds">סיכויי תפיסה: <b>${pct}%</b></div>
    <h2>בטוח?</h2>
    <p>לתפוס את ${POKEMON[S.wild.id].he}?</p>
    <div class="row">
      <button class="btn" onclick="closeModal()">לא</button>
      <button class="btn primary" onclick="spinWheel()">כן</button>
    </div>`);
}

function spinWheel() {
  const chance = catchChance(S.wild);
  const success = Math.random() < chance;
  const greenDeg = chance * 360;
  // נקודת נחיתה בתוך האזור הנכון, רחוק מהקצוות
  const margin = Math.min(8, greenDeg / 4, (360 - greenDeg) / 4);
  const land = success
    ? margin + Math.random() * (greenDeg - 2 * margin)
    : greenDeg + margin + Math.random() * (360 - greenDeg - 2 * margin);
  const turn = 360 * 6 + (360 - land);

  modal(`<h2>גלגל המזל</h2>
    <div class="wheel-wrap"><div class="pointer">▼</div><canvas id="wheel" width="520" height="520"></canvas></div>
    <div id="wheelResult" class="wheel-result">&nbsp;</div>`);
  drawWheel($("#wheel"), chance);
  ui.busy = true;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $("#wheel").style.transform = `rotate(${turn}deg)`;
  }));
  setTimeout(() => {
    ui.busy = false;
    $("#wheelResult").innerHTML = success
      ? `<b class="ok">נתפס! 🎉</b><button class="btn primary" onclick="catchDone(true)">המשך</button>`
      : `<b class="bad">ברח! 💨</b><button class="btn primary" onclick="catchDone(false)">המשך</button>`;
  }, 3600);
}

function catchDone(success) {
  closeModal();
  if (success) return caught();
  log(`${S.players[S.order[S.pos]].name} ניסה לתפוס ונכשל`);
  nextTurn();
}

function drawWheel(c, chance) {
  const ctx = c.getContext("2d"), r = c.width / 2;
  const start = -Math.PI / 2;
  const segs = [[chance, "#2fbf71", "נתפס"], [1 - chance, "#e0464e", "ברח"]];
  let a = start;
  for (const [frac, color, label] of segs) {
    if (frac <= 0) continue;
    const b = a + frac * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(r, r); ctx.arc(r, r, r - 6, a, b); ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = "#fff"; ctx.stroke();
    if (frac > 0.08) {
      const mid = (a + b) / 2;
      ctx.save(); ctx.translate(r + Math.cos(mid) * r * .6, r + Math.sin(mid) * r * .6);
      ctx.rotate(mid + Math.PI / 2);
      ctx.fillStyle = "#fff"; ctx.font = "bold 40px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(label, 0, 0); ctx.restore();
    }
    a = b;
  }
  ctx.beginPath(); ctx.arc(r, r, 40, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
  ctx.beginPath(); ctx.arc(r, r, 40, 0, Math.PI * 2); ctx.lineWidth = 10; ctx.strokeStyle = "#222"; ctx.stroke();
}

function showTeam(i) {
  if (ui.busy) return;
  const p = S.players[i];
  modal(`<h2>הפוקימונים של ${esc(p.name)}</h2>
    <div class="team-grid">${p.team.map(m => cardHTML(m)).join("") || "<p>אין עדיין פוקימונים</p>"}</div>
    <button class="btn primary" onclick="closeModal()">סגור</button>`);
}

function modal(html) {
  $("#modal").innerHTML = `<div class="modal-box">${html}</div>`;
  $("#modal").hidden = false;
}
function closeModal() {
  if (ui.busy) return;
  $("#modal").hidden = true;
  $("#modal").innerHTML = "";
}

function flashDamage(sel, dmg, mult) {
  const el = $(sel);
  if (!el) return;
  el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit");
  const f = document.createElement("div");
  f.className = "float" + (mult > 1 ? " up" : mult < 1 ? " down" : "");
  f.textContent = mult === 0 ? "אין השפעה" : `‎-${dmg}`;
  el.appendChild(f);
}

/* ---------- מסך פתיחה ---------- */

function renderSetup(el) {
  const saved = loadSave();
  const n = ui.setupCount;
  const inputs = Array.from({length: n}, (_, i) =>
    `<input class="name" id="pn${i}" maxlength="12" placeholder="שחקן ${i + 1}" value="${esc(ui.names?.[i] || "")}">`).join("");
  el.innerHTML = `<h2>הרפתקה חדשה</h2>
    <p>כמה שחקנים סביב השולחן?</p>
    <div class="row counts">${[1, 2, 3, 4, 5].map(k => `<button class="btn ${k === n ? "primary" : ""}" onclick="setCount(${k})">${k}</button>`).join("")}</div>
    <div class="names">${inputs}</div>
    <button class="btn primary big" onclick="startFromSetup()">יוצאים להרפתקה</button>
    ${saved && saved.phase !== "end" ? `<button class="btn" onclick="resume()">המשך משחק שמור</button>` : ""}`;
}

function readNames() {
  return Array.from({length: ui.setupCount}, (_, i) => $("#pn" + i)?.value.trim() || "");
}
function setCount(k) { ui.names = readNames(); ui.setupCount = k; renderPanel(); renderTable(); }
function startFromSetup() {
  const names = readNames().map((s, i) => s || `שחקן ${i + 1}`);
  newGame(names);
}
function resume() { S = loadSave(); render(); }
function resetToSetup() { clearSave(); S = null; render(); }

function render() {
  renderTable();
  renderPanel();
  $("#newGameBtn").hidden = !S;
}

function confirmNewGame() {
  modal(`<h2>להתחיל מחדש?</h2><p>המשחק הנוכחי יימחק.</p>
    <div class="row"><button class="btn" onclick="closeModal()">לא</button>
    <button class="btn primary" onclick="closeModal(); resetToSetup()">כן</button></div>`);
}

document.addEventListener("DOMContentLoaded", render);
