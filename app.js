

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

// --- UI elements ---
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
};

let state = loadState();

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

function computeAvgMinutes(){
  if(state.count === 0) return null;
  return state.minutesSum / state.count; // לפי השיטה שסיכמנו: מחלקים במס' הסיגריות
}

// הוסף פונקציה חדשה אחרי computeAvgMinutes()


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

// --- Render ---
function render(){
  // inputs
  el.targetMinutes.value = state.targetMinutes ?? "";
  el.targetPuffs.value = state.targetPuffs ?? "";

  // stats
  el.statCount.textContent = state.count;
  el.statAvgMinutes.textContent = fmt(computeAvgMinutes());
  el.statAvgPuffs.textContent = fmt(computeAvgPuffs());
  const since = minutesSince(state.lastSmokeAt);
  el.sinceLast.textContent = since === null ? "—" : fmt(since);

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

  if(waitRemain === null){
    lines.push("לא הוגדר יעד דקות. קבע יעד כדי לקבל זמן המתנה מומלץ.");
  }else{
    lines.push(`מומלץ לחכות ~ ${fmt(waitRemain, 0)} דקות.`);
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
  if(!confirm("לאפס את כל הנתונים?")){
    return;
  }
  state = {
    targetMinutes: state.targetMinutes, // אפשר להשאיר יעדים אם תרצה
    targetPuffs: state.targetPuffs,
    count: 0,
    minutesSum: 0,
    puffsSum: 0,
    lastSmokeAt: null
  };
  saveState(state);
  render();
  el.advice.textContent = "נמחקו הנתונים. היעדים נשארו.";
});

// טיימר קטן שמעדכן "מאז הסיגריה האחרונה"
setInterval(() => {
  const since = minutesSince(state.lastSmokeAt);
  el.sinceLast.textContent = since === null ? "—" : fmt(since);
}, 10_000);

// init
render();
