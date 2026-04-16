const modes = [
  { id: "study",         label: "Study",         productive: true,  color: "#4ade80" },
  { id: "projects",      label: "Projects",      productive: true,  color: "#fb7185" },
  { id: "work",          label: "Work",          productive: true,  color: "#a78bfa" },
  { id: "entertainment", label: "Entertainment", productive: false, color: "#fbbf24" },
];

const storageKey = "aevon.sessions.v1";

// ─── DOM refs ─────────────────────────────────────────────

const modeButtons    = [...document.querySelectorAll(".mode-btn")];
const timerWidget    = document.querySelector("#timer-widget");
const timeOutput     = document.querySelector("#time-output");
const activeLabel    = document.querySelector("#active-label");
const runStatus      = document.querySelector("#run-status");
const startPauseBtn  = document.querySelector("#start-pause");
const saveButton     = document.querySelector("#save-session");
const resetButton    = document.querySelector("#reset-session");
const voiceButton    = document.querySelector("#voice-toggle");
const sessionForm    = document.querySelector("#session-form");
const noteInput      = document.querySelector("#session-note");
const todayTotal     = document.querySelector("#today-total");
const yesterdayTotal = document.querySelector("#yesterday-total");
const dailyDelta     = document.querySelector("#daily-delta");
const bestHourEl     = document.querySelector("#best-hour");
const productivityEl = document.querySelector("#productivity-score");
const weeklyChart    = document.querySelector("#weekly-chart");
const weeklyBadge    = document.querySelector("#weekly-badge");
const breakdownList  = document.querySelector("#breakdown-list");
const streakNumber   = document.querySelector("#streak-number");
const streakMsg      = document.querySelector("#streak-msg");
const longestStreak  = document.querySelector("#longest-streak");
const daysThisWeek   = document.querySelector("#days-this-week");
const bestDayEl      = document.querySelector("#best-day");
const bestHour2      = document.querySelector("#best-hour-2");
const avgSessionEl   = document.querySelector("#avg-session");
const totalAllTime   = document.querySelector("#total-all-time");
const emptyState     = document.querySelector("#empty-state");
const sessionList    = document.querySelector("#session-list");
const headerStreak   = document.querySelector("#header-streak");
const streakPill     = document.querySelector("#streak-pill");
const headerDate     = document.querySelector("#header-date");
const authArea       = document.querySelector("#auth-area");

// ─── State ────────────────────────────────────────────────

let currentMode  = "study";
let elapsedMs    = 0;
let startedAt    = null;
let rafId        = null;
let sessions     = loadSessionsLocal();

let currentUser  = null;   // { id, name, avatar }
let clerkSession = null;   // Clerk Session object (used to get fresh JWTs)

// ─── Supabase helpers ─────────────────────────────────────

function supabaseConfigured() {
  return typeof SUPABASE_URL !== "undefined" &&
    SUPABASE_URL !== "YOUR_SUPABASE_URL";
}

// Always build the client with a fresh Clerk JWT so it never expires
async function getDb() {
  if (!clerkSession || !supabaseConfigured()) return null;
  const token = await clerkSession.getToken();
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { persistSession: false },
  });
}

function rowToSession(row) {
  return {
    id:        row.id,
    mode:      row.mode,
    note:      row.note || "",
    duration:  row.duration,
    startedAt: row.started_at,
    endedAt:   row.ended_at,
    day:       row.day,
    hour:      row.hour,
  };
}

function sessionToRow(session) {
  return {
    id:         session.id,
    user_id:    currentUser.id,
    mode:       session.mode,
    note:       session.note || "",
    duration:   session.duration,
    started_at: session.startedAt,
    ended_at:   session.endedAt,
    day:        session.day,
    hour:       session.hour,
  };
}

async function loadSessionsFromSupabase() {
  const db = await getDb();
  if (!db) return null;

  const { data, error } = await db
    .from("sessions")
    .select("id, mode, note, duration, started_at, ended_at, day, hour")
    .eq("user_id", currentUser.id)
    .order("ended_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return data.map(rowToSession);
}

async function saveSessionToSupabase(session) {
  const db = await getDb();
  if (!db) return;
  const { error } = await db.from("sessions").upsert(sessionToRow(session));
  if (error) console.error("Supabase write failed:", error.message);
}

async function migrateLocalToSupabase() {
  const local = loadSessionsLocal();
  if (!local.length) return;
  const db = await getDb();
  if (!db) return;
  const { error } = await db.from("sessions").upsert(local.map(sessionToRow));
  if (!error) localStorage.removeItem(storageKey);
}

// ─── Local storage ────────────────────────────────────────

function loadSessionsLocal() {
  try {
    const p = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(p) ? p : [];
  } catch { return []; }
}

function saveSessionsLocal(list) {
  localStorage.setItem(storageKey, JSON.stringify(list));
}

// Always write local backup + Supabase when logged in
function persistNewSession(session) {
  saveSessionsLocal(sessions);
  if (currentUser) saveSessionToSupabase(session);
}

// ─── Auth (Clerk) ─────────────────────────────────────────

async function initAuth() {
  const isConfigured =
    typeof CLERK_PUBLISHABLE_KEY !== "undefined" &&
    CLERK_PUBLISHABLE_KEY !== "YOUR_CLERK_PUBLISHABLE_KEY";

  if (!isConfigured) {
    // No Clerk key yet — run locally with localStorage
    renderAuthUI(null);
    render();
    return;
  }

  try {
    const clerk = new window.Clerk(CLERK_PUBLISHABLE_KEY);
    await clerk.load({
      appearance: {
        variables: {
          colorPrimary:         "#4ade80",
          colorBackground:      "#0c1810",
          colorText:            "#daf0e3",
          colorTextSecondary:   "#567065",
          colorInputBackground: "#141f18",
          colorInputText:       "#daf0e3",
          borderRadius:         "10px",
        },
      },
    });

    window.__clerk = clerk;

    clerk.addListener(async ({ user, session }) => {
      if (user && session) {
        currentUser  = { id: user.id, name: user.firstName || user.fullName || "User", avatar: user.imageUrl || "" };
        clerkSession = session;
        await connectDatabase();
      } else {
        currentUser  = null;
        clerkSession = null;
        sessions = loadSessionsLocal();
        renderAuthUI(null);
        render();
      }
    });
  } catch (err) {
    console.error("Clerk init failed:", err);
    renderAuthUI(null);
    render();
  }
}

async function connectDatabase() {
  try {
    if (!supabaseConfigured()) throw new Error("Supabase not configured");

    let data = await loadSessionsFromSupabase();

    if (data.length === 0) {
      // First sign-in — migrate any localStorage sessions up to Supabase
      await migrateLocalToSupabase();
      data = await loadSessionsFromSupabase();
    }

    sessions = data;
  } catch (err) {
    console.error("Database connect failed, using localStorage:", err.message);
    sessions = loadSessionsLocal();
  }

  renderAuthUI(currentUser);
  render();
}

function renderAuthUI(user) {
  const configured =
    typeof CLERK_PUBLISHABLE_KEY !== "undefined" &&
    CLERK_PUBLISHABLE_KEY !== "YOUR_CLERK_PUBLISHABLE_KEY";

  if (!configured) { authArea.innerHTML = ""; return; }

  if (user) {
    authArea.innerHTML = `
      <div class="user-info">
        ${user.avatar ? `<img src="${escapeHtml(user.avatar)}" class="user-avatar" alt="" referrerpolicy="no-referrer"/>` : ""}
        <span class="user-name">${escapeHtml(user.name)}</span>
        <button class="btn-signout" id="btn-signout">Sign out</button>
      </div>`;
    document.getElementById("btn-signout").addEventListener("click", () => window.__clerk?.signOut());
  } else {
    authArea.innerHTML = `
      <button class="btn-signin" id="btn-signin">
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Sign in with Google
      </button>`;
    document.getElementById("btn-signin").addEventListener("click", () => {
      window.__clerk?.openSignIn({
        afterSignInUrl: window.location.href,
        afterSignUpUrl: window.location.href,
        appearance: {
          variables: {
            colorPrimary:         "#4ade80",
            colorBackground:      "#0c1810",
            colorText:            "#daf0e3",
            colorTextSecondary:   "#567065",
            colorInputBackground: "#141f18",
            borderRadius:         "10px",
          },
        },
      });
    });
  }
}

// ─── Clock helpers ────────────────────────────────────────

function polarToCart(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function timeToAngle(dateStr) {
  const d = new Date(dateStr);
  return ((d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600) / 24) * 360;
}

function arcStroke(cx, cy, r, strokeW, startAngle, endAngle, color, opacity = 0.9) {
  const C      = 2 * Math.PI * r;
  const span   = ((endAngle - startAngle) / 360) * C;
  const offset = -((startAngle / 360) * C);
  return `<circle cx="${cx}" cy="${cy}" r="${r}"
    fill="none" stroke="${color}" stroke-width="${strokeW}"
    stroke-dasharray="${span.toFixed(2)} ${(C - span).toFixed(2)}"
    stroke-dashoffset="${offset.toFixed(2)}"
    stroke-linecap="butt" opacity="${opacity}"
    transform="rotate(-90 ${cx} ${cy})"/>`;
}

// ─── 24h activity clock ───────────────────────────────────

function renderClock() {
  const svgEl = document.getElementById("day-clock");
  if (!svgEl) return;

  const cx = 140, cy = 140, OR = 132, IR = 110, faceR = 98;
  const now = new Date();
  const today = getSessionsForDay(getDayKey(now));
  const hourAngle24 = ((now.getHours() + now.getMinutes() / 60) / 24) * 360;
  const minuteAngle = (now.getMinutes() / 60) * 360;
  const midR = (OR + IR) / 2, ringW = OR - IR - 2;

  const p = [];

  // Ring track
  p.push(arcStroke(cx, cy, midR, OR - IR, 0, 360, "#1a2b1f", 1));

  // Session arcs
  for (const s of today) {
    const sa    = timeToAngle(s.startedAt);
    const ea    = timeToAngle(s.endedAt);
    const color = modes.find((m) => m.id === s.mode)?.color ?? "#4ade80";
    if (ea >= sa && ea - sa >= 0.4) {
      p.push(arcStroke(cx, cy, midR, ringW, sa, ea, color));
    } else if (ea < sa) {
      if (sa < 360) p.push(arcStroke(cx, cy, midR, ringW, sa, 360, color));
      if (ea > 0)   p.push(arcStroke(cx, cy, midR, ringW, 0,  ea,  color));
    }
  }

  // Face
  p.push(`<circle cx="${cx}" cy="${cy}" r="${faceR}" fill="#0b1510" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>`);

  // Tick marks
  for (let h = 0; h < 24; h++) {
    const angle   = (h / 24) * 360;
    const isMajor = h % 6 === 0;
    const p1 = polarToCart(cx, cy, faceR, angle);
    const p2 = polarToCart(cx, cy, faceR - (isMajor ? 14 : 6), angle);
    p.push(`<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}"
      stroke="${isMajor ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.13)"}"
      stroke-width="${isMajor ? 2 : 1}" stroke-linecap="round"/>`);
  }

  // Labels
  [["0", 0], ["6", 90], ["12", 180], ["18", 270]].forEach(([label, angle]) => {
    const pt = polarToCart(cx, cy, faceR - 26, angle);
    p.push(`<text x="${pt.x.toFixed(1)}" y="${pt.y.toFixed(1)}"
      text-anchor="middle" dominant-baseline="middle"
      fill="rgba(255,255,255,0.38)" font-size="9.5"
      font-family="Inter,system-ui,sans-serif" font-weight="700">${label}</text>`);
  });

  // Progress shading (elapsed time today)
  if (hourAngle24 > 0.5) p.push(arcStroke(cx, cy, midR, OR - IR, 0, hourAngle24, "rgba(255,255,255,0.04)", 1));

  // Hands
  const hEnd = polarToCart(cx, cy, 48, hourAngle24);
  const mEnd = polarToCart(cx, cy, 66, minuteAngle);
  p.push(`<line x1="${cx}" y1="${cy}" x2="${hEnd.x.toFixed(1)}" y2="${hEnd.y.toFixed(1)}" stroke="rgba(255,255,255,0.9)" stroke-width="3" stroke-linecap="round"/>`);
  p.push(`<line x1="${cx}" y1="${cy}" x2="${mEnd.x.toFixed(1)}" y2="${mEnd.y.toFixed(1)}" stroke="rgba(255,255,255,0.55)" stroke-width="2" stroke-linecap="round"/>`);
  p.push(`<circle cx="${cx}" cy="${cy}" r="5" fill="#4ade80" stroke="#0b1510" stroke-width="2"/>`);

  svgEl.innerHTML = p.join("\n");
}

function renderClockLegend() {
  const el = document.getElementById("clock-legend");
  if (!el) return;
  const today = getSessionsForDay(getDayKey(new Date()));
  el.innerHTML = modes.map((mode) => `
    <li class="clock-legend-item">
      <span class="clock-legend-swatch" style="background:${mode.color}"></span>
      ${mode.label}
      <span>${formatDuration(sumDuration(today.filter((s) => s.mode === mode.id)))}</span>
    </li>`).join("");
}

function renderBrandClock() {
  const el = document.getElementById("brand-clock-hands");
  if (!el) return;
  const now = new Date();
  const cx = 12, cy = 12;
  const hAngle = ((now.getHours() % 12 + now.getMinutes() / 60) / 12) * 360;
  const mAngle = (now.getMinutes() / 60) * 360;
  const hEnd = polarToCart(cx, cy, 5, hAngle);
  const mEnd = polarToCart(cx, cy, 7, mAngle);
  el.innerHTML = `
    <line x1="${cx}" y1="${cy}" x2="${hEnd.x.toFixed(1)}" y2="${hEnd.y.toFixed(1)}" stroke="white" stroke-width="1.6" stroke-linecap="round"/>
    <line x1="${cx}" y1="${cy}" x2="${mEnd.x.toFixed(1)}" y2="${mEnd.y.toFixed(1)}" stroke="rgba(255,255,255,0.65)" stroke-width="1" stroke-linecap="round"/>`;
}

// ─── Time helpers ─────────────────────────────────────────

function getElapsedMs() {
  return startedAt ? elapsedMs + (Date.now() - startedAt) : elapsedMs;
}

function formatClock(ms) {
  const t = Math.floor(ms / 1000);
  return [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60]
    .map((v) => String(v).padStart(2, "0")).join(":");
}

function formatDuration(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return "0m";
  const h = Math.floor(m / 60), min = m % 60;
  if (h === 0)   return `${min}m`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}m`;
}

function getDayKey(date) { return date.toLocaleDateString("en-CA"); }

function parseLocalDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// ─── Timer controls ───────────────────────────────────────

function updateTimer() {
  timeOutput.textContent = formatClock(getElapsedMs());
  rafId = requestAnimationFrame(updateTimer);
}

function startTimer() {
  if (startedAt) return;
  startedAt = Date.now();
  startPauseBtn.textContent = "Pause";
  startPauseBtn.classList.add("is-running");
  timerWidget.classList.add("is-running");
  runStatus.textContent = `Running ${getModeLabel(currentMode).toLowerCase()}.`;
  updateTimer();
}

function pauseTimer() {
  if (!startedAt) return;
  elapsedMs = getElapsedMs();
  startedAt = null;
  startPauseBtn.textContent = "Resume";
  startPauseBtn.classList.remove("is-running");
  timerWidget.classList.remove("is-running");
  runStatus.textContent = "Paused. Save it or keep going.";
  cancelAnimationFrame(rafId);
  timeOutput.textContent = formatClock(elapsedMs);
}

function resetTimer() {
  elapsedMs = 0; startedAt = null;
  cancelAnimationFrame(rafId);
  timeOutput.textContent    = "00:00:00";
  startPauseBtn.textContent = "Start";
  startPauseBtn.classList.remove("is-running");
  timerWidget.classList.remove("is-running");
  runStatus.textContent = "Ready when you are.";
}

// ─── Session logic ────────────────────────────────────────

function getModeLabel(id) { return modes.find((m) => m.id === id)?.label || "Focus"; }
function isProductive(s)  { return modes.find((m) => m.id === s.mode)?.productive !== false; }

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `s-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createSession(duration, mode, note) {
  const now = new Date(), start = new Date(now - duration);
  return { id: createId(), mode, note, duration,
           startedAt: start.toISOString(), endedAt: now.toISOString(),
           day: getDayKey(now), hour: start.getHours() };
}

function storeSession(session) {
  sessions = [session, ...sessions].slice(0, 200);
  persistNewSession(session);
}

function setMode(modeId) {
  if (!modes.some((m) => m.id === modeId) || modeId === currentMode) return;
  const wasRunning = Boolean(startedAt), prev = currentMode, prevMs = getElapsedMs();
  if (wasRunning && prevMs >= 1000) {
    storeSession(createSession(prevMs, prev, noteInput.value.trim()));
    noteInput.value = ""; elapsedMs = 0; startedAt = Date.now();
  }
  currentMode = modeId;
  activeLabel.textContent = `Tracking ${getModeLabel(modeId).toLowerCase()}`;
  modeButtons.forEach((btn) => {
    const active = btn.dataset.mode === modeId;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-checked", String(active));
  });
  if (startedAt) {
    const note = wasRunning && prevMs >= 1000
      ? `Saved ${formatDuration(prevMs)} of ${getModeLabel(prev).toLowerCase()}. ` : "";
    runStatus.textContent = `${note}Running ${getModeLabel(modeId).toLowerCase()}.`;
    render();
  }
}

function saveSession() {
  const duration = getElapsedMs();
  if (duration < 1000) { runStatus.textContent = "Track at least a second before saving."; return; }
  storeSession(createSession(duration, currentMode, noteInput.value.trim()));
  noteInput.value = "";
  resetTimer();
  runStatus.textContent = `Saved ${formatDuration(duration)} of ${getModeLabel(currentMode).toLowerCase()}.`;
  render();
}

// ─── Data helpers ─────────────────────────────────────────

function getSessionsForDay(key) { return sessions.filter((s) => s.day === key); }
function sumDuration(list)      { return list.reduce((t, s) => t + s.duration, 0); }

function getBestHour(list) {
  const totals = new Map();
  list.forEach((s) => totals.set(s.hour, (totals.get(s.hour) || 0) + s.duration));
  const [hour] = [...totals.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  if (hour === undefined) return "—";
  return new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function getStreak() {
  const days = new Set(sessions.filter(isProductive).map((s) => s.day));
  if (!days.size) return 0;
  let streak = 0;
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (!days.has(getDayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(getDayKey(d))) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

function getLongestStreak() {
  const days = [...new Set(sessions.filter(isProductive).map((s) => s.day))].sort();
  if (!days.length) return 0;
  let longest = 1, current = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = Math.round((parseLocalDate(days[i]) - parseLocalDate(days[i - 1])) / 86400000);
    if (diff === 1) { current++; if (current > longest) longest = current; } else current = 1;
  }
  return longest;
}

function getWeeklyData() {
  const now = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
    const key  = getDayKey(date);
    return { key, dayName: date.toLocaleDateString("en-US", { weekday: "short" }),
             ms: sumDuration(getSessionsForDay(key).filter(isProductive)), isToday: i === 6 };
  });
}

function getProductivityScore() {
  const today = getSessionsForDay(getDayKey(new Date()));
  const total = sumDuration(today);
  if (!total) return null;
  return Math.round((sumDuration(today.filter(isProductive)) / total) * 100);
}

function getBestDayOfWeek() {
  const totals = new Map();
  sessions.filter(isProductive).forEach((s) => {
    const day = new Date(s.startedAt).toLocaleDateString("en-US", { weekday: "long" });
    totals.set(day, (totals.get(day) || 0) + s.duration);
  });
  const [best] = [...totals.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  return best || "—";
}

function escapeHtml(v) {
  return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

// ─── Render ───────────────────────────────────────────────

function renderHeader() {
  const streak = getStreak();
  headerDate.textContent   = new Date().toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" });
  headerStreak.textContent = streak;
  streakPill.classList.toggle("has-streak", streak > 0);
}

function renderStats() {
  const now      = new Date();
  const todayKey = getDayKey(now);
  const yestKey  = getDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const todayMs  = sumDuration(getSessionsForDay(todayKey).filter(isProductive));
  const yestMs   = sumDuration(getSessionsForDay(yestKey).filter(isProductive));
  const delta    = todayMs - yestMs;

  todayTotal.textContent     = formatDuration(todayMs);
  yesterdayTotal.textContent = formatDuration(yestMs);
  dailyDelta.textContent     = todayMs === 0 && yestMs === 0 ? "— vs yesterday"
    : `${delta >= 0 ? "+" : "-"}${formatDuration(Math.abs(delta))} vs yesterday`;
  bestHourEl.textContent     = getBestHour(getSessionsForDay(todayKey).filter(isProductive));
  const score                = getProductivityScore();
  productivityEl.textContent = score === null ? "—" : `${score}%`;
}

function renderBreakdown() {
  const today = getSessionsForDay(getDayKey(new Date()));
  const total = Math.max(sumDuration(today), 1);
  breakdownList.innerHTML = modes.map((mode) => {
    const dur     = sumDuration(today.filter((s) => s.mode === mode.id));
    const percent = Math.round((dur / total) * 100);
    return `<div class="breakdown-track">
      <div class="breakdown-topline"><span>${mode.label}</span><strong>${formatDuration(dur)}</strong></div>
      <div class="bar-shell" aria-hidden="true"><div class="bar-fill" style="width:${percent}%"></div></div>
    </div>`;
  }).join("");
}

function renderWeeklyChart() {
  const data      = getWeeklyData();
  const maxMs     = Math.max(...data.map((d) => d.ms), 1);
  const weekTotal = sumDuration(data.map((d) => ({ duration: d.ms })));
  weeklyBadge.textContent = `${formatDuration(weekTotal)} this week`;
  weeklyChart.innerHTML   = data.map((d) => `
    <div class="chart-col${d.isToday ? " is-today" : ""}${d.ms === 0 ? " is-empty" : ""}">
      <div class="chart-bar-outer">
        <div class="chart-bar" style="height:${Math.round((d.ms / maxMs) * 100)}%" title="${formatDuration(d.ms)}"></div>
      </div>
      <span class="chart-day">${d.dayName}</span>
    </div>`).join("");
}

function renderInsights() {
  const streak  = getStreak(), longest = getLongestStreak();
  const active  = getWeeklyData().filter((d) => d.ms > 0).length;

  streakNumber.textContent  = streak;
  longestStreak.textContent = `${longest} ${longest === 1 ? "day" : "days"}`;
  daysThisWeek.textContent  = `${active} ${active === 1 ? "day" : "days"}`;
  streakMsg.textContent     = streak === 0 ? "Log a session today to start your streak."
    : streak === 1 ? "Day one. Keep it going tomorrow."
    : `${streak} days strong. Don't break the chain.`;

  bestDayEl.textContent    = getBestDayOfWeek();
  bestHour2.textContent    = getBestHour(sessions.filter(isProductive));
  avgSessionEl.textContent = (() => {
    const p = sessions.filter(isProductive);
    return p.length ? formatDuration(sumDuration(p) / p.length) : "—";
  })();
  totalAllTime.textContent = sessions.length ? formatDuration(sumDuration(sessions)) : "—";

  renderWeeklyChart();
  renderClock();
  renderClockLegend();
}

function renderHistory() {
  emptyState.classList.toggle("is-hidden", sessions.length > 0);
  sessionList.innerHTML = sessions.slice(0, 14).map((s) => {
    const time = new Date(s.endedAt).toLocaleString([], { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" });
    return `<li class="session-item">
      <span class="session-mode" data-mode="${s.mode}">${getModeLabel(s.mode)}</span>
      <div class="session-info">
        <div class="session-meta">${time}</div>
        <div class="session-note${s.note ? "" : " is-empty"}">${escapeHtml(s.note || "No note added")}</div>
      </div>
      <strong class="session-duration">${formatDuration(s.duration)}</strong>
    </li>`;
  }).join("");
}

function render() {
  renderHeader();
  renderStats();
  renderBreakdown();
  renderInsights();
  renderHistory();
  renderBrandClock();
}

// ─── Voice ────────────────────────────────────────────────

let recognition = null, voiceEnabled = false;

function setupVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { voiceButton.disabled = true; voiceButton.textContent = "No voice"; return; }
  recognition = new SR();
  recognition.continuous = true; recognition.interimResults = false; recognition.lang = "en-US";
  recognition.addEventListener("result", (e) => {
    const t = [...e.results].slice(e.resultIndex).map((r) => r[0].transcript).join(" ").toLowerCase();
    if (t.includes("start")  || t.includes("resume"))  startTimer();
    if (t.includes("pause")  || t.includes("stop"))    pauseTimer();
    if (t.includes("save")   || t.includes("log"))     saveSession();
    if (t.includes("reset")  || t.includes("clear"))   resetTimer();
    modes.forEach((m) => { if (t.includes(m.id) || t.includes(m.label.toLowerCase())) setMode(m.id); });
  });
  recognition.addEventListener("end", () => { if (voiceEnabled) recognition.start(); });
}

// ─── Event listeners ──────────────────────────────────────

modeButtons.forEach((btn) => btn.addEventListener("click", () => setMode(btn.dataset.mode)));
startPauseBtn.addEventListener("click",  () => startedAt ? pauseTimer() : startTimer());
saveButton.addEventListener("click",     saveSession);
resetButton.addEventListener("click",    resetTimer);
sessionForm.addEventListener("submit",   (e) => { e.preventDefault(); saveSession(); });
voiceButton.addEventListener("click", () => {
  if (!recognition) return;
  voiceEnabled = !voiceEnabled;
  if (voiceEnabled) {
    voiceButton.textContent = "Voice on"; voiceButton.classList.add("is-active");
    runStatus.textContent   = "Voice: start, pause, save, reset, study, projects, work, entertainment.";
    try { recognition.start(); } catch {}
  } else {
    recognition.stop(); voiceButton.textContent = "Voice"; voiceButton.classList.remove("is-active");
    runStatus.textContent = "Voice paused.";
  }
});

// ─── Init ─────────────────────────────────────────────────

setupVoice();
renderBrandClock();
render();
setInterval(() => { renderBrandClock(); renderClock(); }, 60000);
initAuth();
