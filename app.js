

// --- Storage helpers ---
const KEY = "smokeTracker:v1";

function loadState(){
  const raw = localStorage.getItem(KEY);
  if(!raw){
    return {
      targetMinutes: null,   // יעד דקות בין סיגריות
      targetPuffs: null,     // יעד שכטות לסיגריה
      count: 0,              // N = מס' סיגריות
      minutesSum: 0,         // M = סכום הדקות שנצברו (לפי השיטה שלך)
      puffsSum: 0,           // P = סכום שכטות
      lastSmokeAt: null      // timestamp של הסיגריה האחרונה (ms)
    };
  }
  try { return JSON.parse(raw); }
  catch { return loadState(); }
}

function saveState(s){
  localStorage.setItem(KEY, JSON.stringify(s));
}

const el = {
  targetMinutes: document.getElementById("targetMinutes"),
  targetPuffs: document.getElementById("targetPuffs"),
  saveTargets: document.getElementById("saveTargets"),
  wantToSmoke: document.getElementById("wantToSmoke"),
  didSmoke: document.getElementById("didSmoke"),
  resetAll: document.getElementById("resetAll"),
  advice: document.getElementById("advice"),
  statCount: document.getElementById("statCount"),
  statAvgMinutes: document.getElementById("statAvgMinutes"),
  statAvgPuffs: document.getElementById("statAvgPuffs"),
  sinceLast: document.getElementById("sinceLast"),
  targetMinutesView: document.getElementById("targetMinutesView"),
  targetPuffsView: document.getElementById("targetPuffsView"),

  // חדשים:
  cycleWindow: document.getElementById("cycleWindow"),
  cycleCountdown: document.getElementById("cycleCountdown"),
  cycleCount: document.getElementById("cycleCount"),
  statAvgMinutesWords: document.getElementById("statAvgMinutesWords"),
  sinceLastWords: document.getElementById("sinceLastWords"),
  // ----- ריצה -----
  runStart: document.getElementById("runStart"),
  runStop: document.getElementById("runStop"),
  runTimer: document.getElementById("runTimer"),
  runAvgMinutes: document.getElementById("runAvgMinutes"),
  runAvgWords: document.getElementById("runAvgWords"),
  runTotalCount: document.getElementById("runTotalCount"),
  runWeekCount: document.getElementById("runWeekCount"),
};

let state = loadState();
// מיגרציה לשדות חדשים:

// מיגרציה לשדות חדשים קיימת כבר:
if (!state.smokeLog) state.smokeLog = []; // מערך אירועי עישון { ts, puffs }

// === ריצה: לוג ונקודת התחלה לריצה פעילה ===
if (!state.runLog) state.runLog = [];           // [{ startMs, endMs, durMs }]
if (!('currentRunStartMs' in state)) state.currentRunStartMs = null;
// מערך של אירועי עישון { ts, puffs }

// --- Derived helpers ---
function now(){ return Date.now(); }

function minutesSince(ts){
  if(!ts) return null;
  return (now() - ts) / 60000;
}

function fmt(n, digits=1){
  if(n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toFixed(digits);
}

function wordsOrDash(mins){
  if(mins === null || mins === undefined || Number.isNaN(mins)) return "—";
  return minutesToWords(mins);
}
function computeAvgMinutes(){
  if(state.count === 0) return null;
  return state.minutesSum / state.count; // לפי השיטה שסיכמנו: מחלקים במס' הסיגריות
}

function minutesToWords(totalMinutes) {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  let parts = [];
  if (hours > 0) {
    parts.push(hours === 1 ? "שעה" : `${hours} שעות`);
  }
  if (mins > 0) {
    parts.push(`${mins} דקות`);
  }
  if (parts.length === 0) {
    return "פחות מדקה";
  }
  return parts.join(" ו");
}

// ===== ריצה: עזרי זמן וחישובים =====
function formatHMSms(ms){
  // כמו formatHMS אך מקבל מילישניות
  return formatHMS(ms);
}

function weekStartMs(ref = new Date()){
  // שבוע מתחיל ביום ראשון 00:00
  const d = new Date(ref);
  const dow = d.getDay(); // 0=Sunday
  const diff = dow;       // כמה ימים לחזור אחורה עד ראשון
  const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
  const start = new Date(y, m, day - diff, 0, 0, 0, 0);
  return start.getTime();
}

function runAvgMinutes(){
  if (!state.runLog.length) return null;
  const totalMs = state.runLog.reduce((a, r) => a + (r.durMs || 0), 0);
  return totalMs / 60000 / state.runLog.length;
}

function runsThisWeek(){
  const ws = weekStartMs();
  return state.runLog.reduce((acc, r) => acc + (r.startMs >= ws ? 1 : 0), 0);
}

function renderRun(){
  // טיימר נוכחי
  if (state.currentRunStartMs){
    const elapsed = Date.now() - state.currentRunStartMs;
    if (el.runTimer) el.runTimer.textContent = formatHMSms(elapsed);
  } else {
    if (el.runTimer) el.runTimer.textContent = "—";
  }

  // ממוצע זמן ריצה
  const avg = runAvgMinutes();
  if (el.runAvgMinutes) el.runAvgMinutes.textContent = avg == null ? "—" : fmt(avg);
  if (el.runAvgWords)   el.runAvgWords.textContent   = avg == null ? "—" : minutesToWords(avg);

  // סה"כ והשבוע
  if (el.runTotalCount) el.runTotalCount.textContent = state.runLog.length;
  if (el.runWeekCount)  el.runWeekCount.textContent  = runsThisWeek();
}

function computeAvgPuffs(){
  if(state.count === 0) return null;
  return state.puffsSum / state.count;
}

function requiredWaitMinutes(){
  // X = T*(N+1) - M  (אם אין יעד, תחזיר null)
  if(!state.targetMinutes) return null;
  const T = Number(state.targetMinutes);
  const N = Number(state.count);
  const M = Number(state.minutesSum);
  return T * (N + 1) - M;
}

function totalWaitTarget(){
  // סך ה"זמן היעד" למרווח הנוכחי: מקס(T, T*(N+1) - M)
  const strict = requiredWaitMinutes();           // בלי הזמן שעבר כרגע
  const T = Number(state.targetMinutes) || 0;
  if(strict == null || T <= 0) return null;
  return Math.max(T, strict);
}

function remainingWaitNow(){
  // כמה נשאר לחכות מעכשיו: total - elapsed
  const total = totalWaitTarget();
  if(total == null) return null;
  const elapsed = Math.max(0, minutesSince(state.lastSmokeAt) || 0);
  return Math.max(0, total - elapsed);
}

function fullDebtWaitDisplay(){
  // מציגים תמיד: T + החוב המלא
  // החוב המלא = requiredWaitMinutes() - T (אם חיובי)
  // בפועל זה פשוט max(T, strict), כי:
  // strict = T*(N+1) - M
  const strict = requiredWaitMinutes();           // החישוב המדויק לממוצע מיידי
  const T = Number(state.targetMinutes) || 0;
  if(strict == null || T <= 0) return null;

  // אם strict קטן מ-T או שלילי — עדיין מציגים לפחות T (מינימום)
  return Math.max(T, strict);
}

function requiredNextPuffs(){
  // p_next = S*(N+1) - P
  if(!state.targetPuffs && state.targetPuffs !== 0) return null;
  const S = Number(state.targetPuffs);
  const N = Number(state.count);
  const P = Number(state.puffsSum);
  return S * (N + 1) - P;
}

// טיימר חי לריצה — רענון פעם בשנייה
setInterval(() => {
  if (state.currentRunStartMs && el.runTimer){
    const elapsed = Date.now() - state.currentRunStartMs;
    el.runTimer.textContent = formatHMSms(elapsed);
  }
  if (el.runWeekCount) el.runWeekCount.textContent = runsThisWeek();
}, 1000);

renderRun();

// ===== ריצה: התחלה/עצירה =====
if (el.runStart) {
  el.runStart.addEventListener("click", () => {
    if (state.currentRunStartMs) return;
    state.currentRunStartMs = Date.now();
    saveState(state);
    renderRun();
    if (el.advice) el.advice.textContent = "יצאת לריצה — בהצלחה!";
  });
}

if (el.runStop) {
  el.runStop.addEventListener("click", () => {
    if (!state.currentRunStartMs) { alert("לא התחלת ריצה."); return; }
    const end = Date.now();
    const dur = Math.max(0, end - state.currentRunStartMs);
    state.runLog.push({ startMs: state.currentRunStartMs, endMs: end, durMs: dur });
    state.currentRunStartMs = null;
    saveState(state);
    renderRun();
    if (el.advice) el.advice.textContent = "הריצה נשמרה. כל הכבוד!";
  });
}

function render(){
  // inputs
  el.targetMinutes.value = state.targetMinutes ?? "";
  el.targetPuffs.value = state.targetPuffs ?? "";

  // stats
  el.statCount.textContent = state.count;

  // ממוצע דקות — גם מספר וגם במילים
  el.statAvgMinutes.textContent = fmt(computeAvgMinutes());
  el.statAvgMinutesWords.textContent = wordsOrDash(computeAvgMinutes());

  el.statAvgPuffs.textContent = fmt(computeAvgPuffs());

  // זמן מאז הסיגריה האחרונה — גם מספר וגם במילים
  const since = minutesSince(state.lastSmokeAt);
  el.sinceLast.textContent = since === null ? "—" : fmt(since);
  el.sinceLastWords.textContent = wordsOrDash(since);

  el.targetMinutesView.textContent = state.targetMinutes ?? "—";
  el.targetPuffsView.textContent = state.targetPuffs ?? "—";
}

// --- Actions ---
el.saveTargets.addEventListener("click", () => {
  const tMin = el.targetMinutes.value.trim();
  const tPuf = el.targetPuffs.value.trim();

  state.targetMinutes = tMin === "" ? null : Math.max(1, Math.round(Number(tMin)));
  state.targetPuffs   = tPuf === "" ? null : Math.max(0, Math.round(Number(tPuf)));

  saveState(state);
  render();

  el.advice.textContent = "היעדים נשמרו.";
});

el.wantToSmoke.addEventListener("click", () => {
  const waitRemain = remainingWaitNow();   // כמה נשאר לחכות ממש עכשיו
  const nextPuffs  = requiredNextPuffs();

  let lines = [];

  if (waitRemain === null){
  lines.push("לא הוגדר יעד דקות. קבע יעד כדי לקבל זמן המתנה מומלץ.");
}else{
  const waitRounded = Math.round(waitRemain);
  const waitWords = minutesToWords(waitRounded);
  lines.push(`מומלץ לחכות ~ ${waitRounded} דקות (${waitWords}).`);
}

  if(nextPuffs === null){
    lines.push("לא הוגדר יעד שכטות. קבע יעד כדי לקבל שכטות מומלצות.");
  }else{
    const p = Math.max(0, Math.round(nextPuffs));
    lines.push(`כדי להתיישר ליעד השכטות: קח בסיגריה הבאה בערך ${p} שכטות.`);
  }

  el.advice.textContent = lines.join("\n");
});

el.didSmoke.addEventListener("click", () => {
  // שואל כמה שכטות לקחתי
  let inp = prompt("כמה שכטות לקחת בסיגריה הזו?", "8");
  if(inp === null) return; // ביטול
  let puffs = Number(inp);
  if(!Number.isFinite(puffs) || puffs < 0){
    alert("מספר שכטות לא תקין.");
    return;
  }
  puffs = Math.round(puffs);

  const t = now();

  // לוג חדש של עישון
state.smokeLog.push({ ts: t, puffs });
  
  if(state.count === 0){
    // סיגריה ראשונה: מתחילים ספירה, אין מרווח להוסיף
    state.count = 1;
    state.puffsSum += puffs;
    state.lastSmokeAt = t;
  }else{
    // סיגריה נוספת: מוסיפים מרווח מאז האחרונה + שכטות
    const deltaMin = minutesSince(state.lastSmokeAt);
    // אם משום מה דלתא שלילית/לא תקינה – אל תוסיף
    if(Number.isFinite(deltaMin) && deltaMin >= 0){
      state.minutesSum += deltaMin;
    }
    state.count += 1;
    state.puffsSum += puffs;
    state.lastSmokeAt = t;
  }

  saveState(state);
  render();

  el.advice.textContent = "עודכנו הנתונים. כל הכבוד על המעקב.";
});

el.resetAll.addEventListener("click", () => {
  if(!confirm("לאפס את כל הנתונים?")) return;
  state = {
    targetMinutes: state.targetMinutes,
    targetPuffs: state.targetPuffs,
    count: 0,
    minutesSum: 0,
    puffsSum: 0,
    lastSmokeAt: null,
    smokeLog: [],
    // שומרים את הריצה
    runLog: state.runLog,
    currentRunStartMs: state.currentRunStartMs
  };
  saveState(state);
  render();
  renderRun();
  updateCycleUI();
  el.advice.textContent = "נמחקו נתוני העישון. נתוני הריצה נשמרו.";
});
  
setInterval(updateCycleUI, 1_000);

function getCycleStartTimeMs(refDate = new Date()){
  // אם עכשיו לפני 08:00 — תחילת המעגל היא אתמול ב־08:00, אחרת היום ב־08:00.
  const d = new Date(refDate);
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();

  const eightAMToday = new Date(y, m, day, 8, 0, 0, 0).getTime();
  const nowMs = d.getTime();

  if (nowMs >= eightAMToday) {
    return eightAMToday; // 08:00 היום
  } else {
    // אתמול 08:00
    const yesterday = new Date(y, m, day - 1, 8, 0, 0, 0).getTime();
    return yesterday;
  }
}

function getCycleEndTimeMs(startMs){
  return startMs + 24 * 60 * 60 * 1000; // +24 שעות
}

function formatHMS(ms){
  let total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600); total -= h * 3600;
  const m = Math.floor(total / 60);   total -= m * 60;
  const s = total;
  const pad = n => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatCycleWindow(startMs, endMs){
  const s = new Date(startMs);
  const e = new Date(endMs);
  const optDay = { weekday: 'short' }; // לא חובה
  const pad = n => String(n).padStart(2, "0");
  const sLabel = `${pad(s.getHours())}:${pad(s.getMinutes())} ${s.toLocaleDateString()}`;
  const eLabel = `${pad(e.getHours())}:${pad(e.getMinutes())} ${e.toLocaleDateString()}`;
  return `${sLabel} → ${eLabel}`;
}

function countSmokesInWindow(startMs, endMs){
  if (!Array.isArray(state.smokeLog)) return 0;
  return state.smokeLog.reduce((acc, ev) => {
    return acc + (ev.ts >= startMs && ev.ts < endMs ? 1 : 0);
  }, 0);
}

function updateCycleUI(){
  const start = getCycleStartTimeMs();
  const end = getCycleEndTimeMs(start);
  const left = Math.max(0, end - now());

  // עדכוני UI
  if (el.cycleWindow)   el.cycleWindow.textContent   = formatCycleWindow(start, end);
  if (el.cycleCountdown) el.cycleCountdown.textContent = formatHMS(left);
  if (el.cycleCount)    el.cycleCount.textContent    = countSmokesInWindow(start, end);
}
// טיימר קטן שמעדכן "מאז הסיגריה האחרונה"
setInterval(() => {
  const since = minutesSince(state.lastSmokeAt);
  el.sinceLast.textContent = since === null ? "—" : fmt(since);
  el.sinceLastWords.textContent = wordsOrDash(since);
}, 10_000);

// init
render();
updateCycleUI();
