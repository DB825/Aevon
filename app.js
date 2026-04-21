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

// New: timer type, countdown, goal, modal
const typeButtons      = [...document.querySelectorAll(".type-btn")];
const presetButtons    = [...document.querySelectorAll(".preset-btn")];
const countdownPresets = document.querySelector("#countdown-presets");
const countdownCustom  = document.querySelector("#countdown-custom");
const manualLogBtn     = document.querySelector("#manual-log-btn");
const goalRingFg       = document.querySelector("#goal-ring-fg");
const goalRingText     = document.querySelector("#goal-ring-text");
const goalProgressText = document.querySelector("#goal-progress-text");
const goalEditBtn      = document.querySelector("#goal-edit-btn");
const modalRoot        = document.querySelector("#modal-root");
const modalBody        = document.querySelector("#modal-body");
const modalTitle       = document.querySelector("#modal-title");
const themeToggleBtn   = document.querySelector("#theme-toggle");
const exportCsvBtn     = document.querySelector("#export-csv");

// ─── State ────────────────────────────────────────────────

let currentMode  = "study";
let elapsedMs    = 0;
let startedAt    = null;
let rafId        = null;
let sessions     = loadSessionsLocal();

let currentUser  = null;   // { id, name, avatar }
let clerkSession = null;   // Clerk Session object (used to get fresh JWTs)

// Timer type: "stopwatch" | "countdown"
const goalKey       = "aevon.goalMinutes.v1";
const timerTypeKey  = "aevon.timerType.v1";
const cdTargetKey   = "aevon.countdownMinutes.v1";
const themeKey      = "aevon.theme.v1";
const pauseBlurKey  = "aevon.pauseOnBlur.v1";
let timerType       = localStorage.getItem(timerTypeKey) || "stopwatch";
let countdownTarget = Number(localStorage.getItem(cdTargetKey)) || 45;  // minutes
let countdownDone   = false;
let dailyGoalMin    = Number(localStorage.getItem(goalKey)) || 240;     // 4h default
let theme           = localStorage.getItem(themeKey) ||
  (matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark");
let pauseOnBlur     = localStorage.getItem(pauseBlurKey) === "true"; // opt-in
let blurTimer       = null;
let prefsSyncTimer  = null; // debounce outbound pref writes

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
    tags:      Array.isArray(row.tags) ? row.tags : [],
  };
}

function sessionToRow(session) {
  const row = {
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
  // Only include tags if the column exists / we have any — harmless if schema is up-to-date
  if (Array.isArray(session.tags) && session.tags.length) row.tags = session.tags;
  return row;
}

async function loadSessionsFromSupabase() {
  const db = await getDb();
  if (!db) return null;

  // Try with tags column; fall back if the column doesn't exist yet
  let { data, error } = await db
    .from("sessions")
    .select("id, mode, note, duration, started_at, ended_at, day, hour, tags")
    .eq("user_id", currentUser.id)
    .order("ended_at", { ascending: false })
    .limit(200);

  if (error && /tags/i.test(error.message || "")) {
    ({ data, error } = await db
      .from("sessions")
      .select("id, mode, note, duration, started_at, ended_at, day, hour")
      .eq("user_id", currentUser.id)
      .order("ended_at", { ascending: false })
      .limit(200));
  }

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

// ─── Preferences sync ─────────────────────────────────────
// Fails gracefully if the `preferences` table doesn't exist yet.

async function loadPreferencesFromSupabase() {
  const db = await getDb();
  if (!db) return null;
  const { data, error } = await db
    .from("preferences")
    .select("goal_minutes, timer_type, countdown_minutes, theme, pause_on_blur")
    .eq("user_id", currentUser.id)
    .maybeSingle();
  if (error) {
    if (!/does not exist|relation/i.test(error.message || "")) {
      console.warn("Preferences load:", error.message);
    }
    return null;
  }
  return data;
}

async function savePreferencesToSupabase() {
  if (!currentUser) return;
  const db = await getDb();
  if (!db) return;
  const row = {
    user_id:            currentUser.id,
    goal_minutes:       dailyGoalMin,
    timer_type:         timerType,
    countdown_minutes:  countdownTarget,
    theme:              theme,
    pause_on_blur:      pauseOnBlur,
    updated_at:         new Date().toISOString(),
  };
  const { error } = await db.from("preferences").upsert(row, { onConflict: "user_id" });
  if (error && !/does not exist|relation/i.test(error.message || "")) {
    console.warn("Preferences save:", error.message);
  }
}

// Debounced sync — each prefs change writes once per 400ms
function schedulePrefsSync() {
  if (!currentUser) return;
  clearTimeout(prefsSyncTimer);
  prefsSyncTimer = setTimeout(savePreferencesToSupabase, 400);
}

function applyPreferencesFromRow(prefs) {
  if (!prefs) return;
  if (typeof prefs.goal_minutes      === "number") { dailyGoalMin    = prefs.goal_minutes; }
  if (typeof prefs.countdown_minutes === "number") { countdownTarget = prefs.countdown_minutes; }
  if (prefs.timer_type === "stopwatch" || prefs.timer_type === "countdown") { timerType = prefs.timer_type; }
  if (prefs.theme === "light" || prefs.theme === "dark")                    { theme     = prefs.theme;     }
  if (typeof prefs.pause_on_blur === "boolean")                             { pauseOnBlur = prefs.pause_on_blur; }
  // Mirror to localStorage so signed-out devices start with the last-known values
  localStorage.setItem(goalKey,      String(dailyGoalMin));
  localStorage.setItem(cdTargetKey,  String(countdownTarget));
  localStorage.setItem(timerTypeKey, timerType);
  localStorage.setItem(themeKey,     theme);
  localStorage.setItem(pauseBlurKey, String(pauseOnBlur));
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
    // Wait for the Clerk CDN script (loaded with `async`) to populate window.Clerk
    const start = Date.now();
    while (!window.Clerk && Date.now() - start < 10000) {
      await new Promise(r => setTimeout(r, 50));
    }
    if (!window.Clerk) throw new Error("Clerk SDK failed to load");

    const clerk = window.Clerk;
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

    // Load preferences from Supabase (if the table exists); reflect in UI
    const prefs = await loadPreferencesFromSupabase();
    if (prefs) {
      applyPreferencesFromRow(prefs);
      syncTimerTypeUI();
      applyTheme();
    } else {
      // No remote prefs yet — push current local values up so this becomes "device-of-record"
      savePreferencesToSupabase();
    }
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

function countdownTargetMs() { return countdownTarget * 60 * 1000; }

function displayMs() {
  const elapsed = getElapsedMs();
  if (timerType !== "countdown") return elapsed;
  return Math.max(0, countdownTargetMs() - elapsed);
}

function updateTimer() {
  const remaining = displayMs();
  timeOutput.textContent = formatClock(remaining);

  if (timerType === "countdown") {
    // Warning under 60s, auto-save at zero
    timeOutput.classList.toggle("is-warning", remaining > 0 && remaining <= 60_000);
    if (!countdownDone && getElapsedMs() >= countdownTargetMs()) {
      countdownDone = true;
      timeOutput.classList.remove("is-warning");
      timeOutput.classList.add("is-done");
      playChime();
      // Auto-save the completed session
      const dur = countdownTargetMs();
      storeSession(createSession(dur, currentMode, noteInput.value.trim()));
      noteInput.value = "";
      resetTimerInternal();
      runStatus.textContent = `Done! Logged ${formatDuration(dur)} of ${getModeLabel(currentMode).toLowerCase()}.`;
      render();
      return;
    }
  }
  rafId = requestAnimationFrame(updateTimer);
}

function startTimer() {
  if (startedAt) return;
  if (timerType === "countdown" && elapsedMs >= countdownTargetMs()) elapsedMs = 0;
  countdownDone = false;
  timeOutput.classList.remove("is-done");
  startedAt = Date.now();
  startPauseBtn.textContent = "Pause";
  startPauseBtn.classList.add("is-running");
  timerWidget.classList.add("is-running");
  runStatus.textContent = timerType === "countdown"
    ? `Counting down ${getModeLabel(currentMode).toLowerCase()}.`
    : `Running ${getModeLabel(currentMode).toLowerCase()}.`;
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
  timeOutput.textContent = formatClock(displayMs());
}

function resetTimerInternal() {
  elapsedMs = 0; startedAt = null;
  countdownDone = false;
  cancelAnimationFrame(rafId);
  timeOutput.classList.remove("is-warning", "is-done");
  timeOutput.textContent    = timerType === "countdown"
    ? formatClock(countdownTargetMs()) : "00:00:00";
  startPauseBtn.textContent = "Start";
  startPauseBtn.classList.remove("is-running");
  timerWidget.classList.remove("is-running");
}

function resetTimer() {
  resetTimerInternal();
  runStatus.textContent = "Ready when you are.";
}

// Short pleasant chime via Web Audio (no asset needed)
function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx  = new Ctx();
    const now  = ctx.currentTime;
    [880, 1175, 1568].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type   = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.18;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.7);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start); osc.stop(start + 0.75);
    });
    setTimeout(() => ctx.close(), 2500);
  } catch {}
}

function syncTimerTypeUI() {
  typeButtons.forEach((btn) => {
    const active = btn.dataset.type === timerType;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  countdownPresets.hidden = timerType !== "countdown";
  presetButtons.forEach((btn) =>
    btn.classList.toggle("is-active", Number(btn.dataset.minutes) === countdownTarget));
  if (!startedAt) {
    timeOutput.textContent = timerType === "countdown"
      ? formatClock(countdownTargetMs()) : formatClock(elapsedMs || 0);
  }
}

// ─── Theme ────────────────────────────────────────────────

function applyTheme() {
  document.documentElement.setAttribute("data-theme", theme);
}

function toggleTheme() {
  theme = theme === "dark" ? "light" : "dark";
  localStorage.setItem(themeKey, theme);
  applyTheme();
  schedulePrefsSync();
}

// ─── CSV export ───────────────────────────────────────────

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv() {
  if (!sessions.length) return;
  const rows = [["id","mode","note","tags","duration_minutes","started_at","ended_at","day"]];
  // Oldest first reads more naturally in a spreadsheet
  [...sessions].reverse().forEach((s) => {
    rows.push([
      s.id, s.mode, s.note || "", (s.tags || []).join(" "),
      Math.round(s.duration / 60000),
      s.startedAt, s.endedAt, s.day,
    ]);
  });
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `aevon-sessions-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Tags ─────────────────────────────────────────────────

function parseTags(raw) {
  if (!raw) return [];
  return [...new Set(
    raw.split(/[\s,]+/)
       .map((t) => t.trim().replace(/^#+/, "").toLowerCase())
       .filter((t) => t.length > 0 && t.length <= 32)
  )].slice(0, 6);
}

// ─── Pause on blur ────────────────────────────────────────
// If the timer is running and the tab is hidden for more than 5 minutes,
// auto-pause. The "away" duration is discarded (so your log reflects only
// actually-focused time).

const BLUR_PAUSE_MS = 5 * 60 * 1000;

function onVisibilityChange() {
  if (!pauseOnBlur) return;
  if (document.hidden) {
    if (startedAt) {
      clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        if (startedAt) {
          // Rewind elapsedMs so the hidden time doesn't count
          elapsedMs = Math.max(0, getElapsedMs() - BLUR_PAUSE_MS);
          startedAt = null;
          cancelAnimationFrame(rafId);
          startPauseBtn.textContent = "Resume";
          startPauseBtn.classList.remove("is-running");
          timerWidget.classList.remove("is-running");
          timeOutput.textContent = formatClock(displayMs());
          runStatus.textContent = "Auto-paused — you stepped away.";
        }
      }, BLUR_PAUSE_MS);
    }
  } else {
    clearTimeout(blurTimer);
  }
}

function setTimerType(type) {
  if (type === timerType) return;
  if (startedAt) pauseTimer();
  timerType = type;
  localStorage.setItem(timerTypeKey, type);
  syncTimerTypeUI();
  resetTimerInternal();
  runStatus.textContent = type === "countdown"
    ? `Countdown set to ${countdownTarget}m. Press Start.`
    : "Ready when you are.";
  schedulePrefsSync();
}

function setCountdownTarget(minutes, source = "preset") {
  const m = Math.max(1, Math.min(600, Math.round(Number(minutes) || 0)));
  if (!m) return;
  countdownTarget = m;
  localStorage.setItem(cdTargetKey, String(m));
  presetButtons.forEach((btn) =>
    btn.classList.toggle("is-active",
      source === "preset" && Number(btn.dataset.minutes) === m));
  if (!startedAt) resetTimerInternal();
  schedulePrefsSync();
}

// ─── Session logic ────────────────────────────────────────

function getModeLabel(id) { return modes.find((m) => m.id === id)?.label || "Focus"; }
function isProductive(s)  { return modes.find((m) => m.id === s.mode)?.productive !== false; }

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `s-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createSession(duration, mode, note, tags = []) {
  const now = new Date(), start = new Date(now - duration);
  return { id: createId(), mode, note, duration, tags,
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

// ─── Manual log / update / delete ─────────────────────────

function logManualSession({ mode, duration, startedAt: startIso, note, tags }) {
  const start = startIso ? new Date(startIso) : new Date(Date.now() - duration);
  const end   = new Date(start.getTime() + duration);
  const session = {
    id: createId(), mode, note: note || "", duration,
    tags: tags || [],
    startedAt: start.toISOString(), endedAt: end.toISOString(),
    day: getDayKey(end), hour: start.getHours(),
  };
  storeSession(session);
  render();
  return session;
}

function updateSession(id, patch) {
  const idx = sessions.findIndex((s) => s.id === id);
  if (idx === -1) return;
  const prev = sessions[idx];
  const next = { ...prev, ...patch };
  // Re-derive day/hour if duration or start changed
  if (patch.duration !== undefined || patch.startedAt !== undefined) {
    const start = new Date(next.startedAt);
    const end   = new Date(start.getTime() + next.duration);
    next.endedAt = end.toISOString();
    next.day     = getDayKey(end);
    next.hour    = start.getHours();
  }
  sessions[idx] = next;
  saveSessionsLocal(sessions);
  if (currentUser) saveSessionToSupabase(next);
  render();
}

async function deleteSession(id) {
  sessions = sessions.filter((s) => s.id !== id);
  saveSessionsLocal(sessions);
  if (currentUser) {
    const db = await getDb();
    if (db) await db.from("sessions").delete().eq("id", id);
  }
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

  // Goal ring
  const goalMs   = dailyGoalMin * 60 * 1000;
  const rawPct   = goalMs > 0 ? (todayMs / goalMs) * 100 : 0;
  const pct      = Math.max(0, Math.min(100, rawPct));
  goalRingFg.setAttribute("stroke-dasharray", `${pct.toFixed(2)} 100`);
  goalRingFg.setAttribute("stroke", rawPct >= 100 ? "var(--amber)" : "var(--green)");
  goalRingText.textContent    = `${Math.round(rawPct)}%`;
  goalProgressText.textContent = `${formatDuration(todayMs)} of ${formatDuration(goalMs)}`;
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
  if (exportCsvBtn) exportCsvBtn.disabled = sessions.length === 0;
  sessionList.innerHTML = sessions.slice(0, 14).map((s) => {
    const time = new Date(s.endedAt).toLocaleString([], { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" });
    const tagsHtml = (s.tags || []).length
      ? `<div class="session-tags">${s.tags.map((t) => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join("")}</div>`
      : "";
    return `<li class="session-item" data-session-id="${s.id}">
      <span class="session-mode" data-mode="${s.mode}">${getModeLabel(s.mode)}</span>
      <div class="session-info">
        <div class="session-meta">${time}</div>
        <div class="session-note${s.note ? "" : " is-empty"}">${escapeHtml(s.note || "No note added")}</div>
        ${tagsHtml}
      </div>
      <strong class="session-duration">${formatDuration(s.duration)}</strong>
      <button class="session-edit" type="button" data-edit-id="${s.id}" aria-label="Edit session">Edit</button>
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

// ─── Modal ────────────────────────────────────────────────

let modalCleanup = null;

function openModal(title, bodyHtml, onMount) {
  modalTitle.textContent = title;
  modalBody.innerHTML    = bodyHtml;
  modalRoot.hidden       = false;
  modalRoot.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  modalCleanup = typeof onMount === "function" ? onMount() : null;
  // focus first field
  setTimeout(() => {
    const first = modalBody.querySelector("input, select, textarea, button");
    first?.focus();
  }, 20);
}

function closeModal() {
  if (modalRoot.hidden) return;
  if (typeof modalCleanup === "function") { try { modalCleanup(); } catch {} }
  modalCleanup = null;
  modalRoot.hidden = true;
  modalRoot.setAttribute("aria-hidden", "true");
  modalBody.innerHTML = "";
  document.body.style.overflow = "";
}

modalRoot.addEventListener("click", (e) => {
  if (e.target.closest("[data-modal-close]")) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modalRoot.hidden) closeModal();
});

// ─── Manual log dialog ────────────────────────────────────

function nowLocalDatetimeValue() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function openManualLogModal() {
  const modeOptions = modes.map((m) =>
    `<option value="${m.id}"${m.id === currentMode ? " selected" : ""}>${m.label}</option>`).join("");

  openModal("Log a past session", `
    <div class="field">
      <label class="field-label" for="ml-mode">Mode</label>
      <select class="field-select" id="ml-mode">${modeOptions}</select>
    </div>
    <div class="field">
      <label class="field-label">Duration</label>
      <div class="field-row">
        <input class="field-input" id="ml-hours"   type="number" min="0" max="24" step="1" placeholder="Hours"   inputmode="numeric" />
        <input class="field-input" id="ml-minutes" type="number" min="0" max="59" step="1" placeholder="Minutes" inputmode="numeric" />
      </div>
    </div>
    <div class="field">
      <label class="field-label" for="ml-when">Ended at</label>
      <input class="field-input" id="ml-when" type="datetime-local" value="${nowLocalDatetimeValue()}" />
    </div>
    <div class="field">
      <label class="field-label" for="ml-note">Note (optional)</label>
      <input class="field-input" id="ml-note" type="text" placeholder="What were you working on?" />
    </div>
    <div class="field">
      <label class="field-label" for="ml-tags">Tags (optional)</label>
      <input class="field-input" id="ml-tags" type="text" placeholder="math, client-x, deep-work" />
      <span class="tag-hint">Space or comma separated, up to 6.</span>
    </div>
    <div class="modal-actions">
      <button class="btn-ghost" type="button" data-modal-close>Cancel</button>
      <button class="btn-primary" id="ml-save" type="button">Log session</button>
    </div>
  `, () => {
    const save = document.getElementById("ml-save");
    save.addEventListener("click", () => {
      const mode    = document.getElementById("ml-mode").value;
      const hours   = Number(document.getElementById("ml-hours").value)   || 0;
      const minutes = Number(document.getElementById("ml-minutes").value) || 0;
      const whenVal = document.getElementById("ml-when").value;
      const note    = document.getElementById("ml-note").value.trim();
      const tags    = parseTags(document.getElementById("ml-tags").value);
      const duration = (hours * 3600 + minutes * 60) * 1000;
      if (duration < 1000) {
        runStatus.textContent = "Enter a duration before logging.";
        return;
      }
      const endedAt = whenVal ? new Date(whenVal) : new Date();
      const startedIso = new Date(endedAt.getTime() - duration).toISOString();
      logManualSession({ mode, duration, startedAt: startedIso, note, tags });
      runStatus.textContent = `Logged ${formatDuration(duration)} of ${getModeLabel(mode).toLowerCase()}.`;
      closeModal();
    });
  });
}

// ─── Edit session dialog ──────────────────────────────────

function openEditSessionModal(id) {
  const s = sessions.find((x) => x.id === id);
  if (!s) return;
  const modeOptions = modes.map((m) =>
    `<option value="${m.id}"${m.id === s.mode ? " selected" : ""}>${m.label}</option>`).join("");
  const totalMin = Math.round(s.duration / 60000);
  const hours    = Math.floor(totalMin / 60);
  const minutes  = totalMin % 60;

  const tagValue = (s.tags || []).join(" ");

  openModal("Edit session", `
    <div class="field">
      <label class="field-label" for="ed-mode">Mode</label>
      <select class="field-select" id="ed-mode">${modeOptions}</select>
    </div>
    <div class="field">
      <label class="field-label">Duration</label>
      <div class="field-row">
        <input class="field-input" id="ed-hours"   type="number" min="0" max="24" step="1" value="${hours}"   inputmode="numeric" />
        <input class="field-input" id="ed-minutes" type="number" min="0" max="59" step="1" value="${minutes}" inputmode="numeric" />
      </div>
    </div>
    <div class="field">
      <label class="field-label" for="ed-note">Note</label>
      <input class="field-input" id="ed-note" type="text" value="${escapeHtml(s.note || "")}" placeholder="What were you working on?" />
    </div>
    <div class="field">
      <label class="field-label" for="ed-tags">Tags</label>
      <input class="field-input" id="ed-tags" type="text" value="${escapeHtml(tagValue)}" placeholder="math, client-x, deep-work" />
      <span class="tag-hint">Space or comma separated, up to 6.</span>
    </div>
    <div class="modal-actions">
      <button class="btn-danger"  id="ed-delete" type="button">Delete</button>
      <button class="btn-primary" id="ed-save"   type="button">Save</button>
    </div>
  `, () => {
    document.getElementById("ed-save").addEventListener("click", () => {
      const mode    = document.getElementById("ed-mode").value;
      const h       = Number(document.getElementById("ed-hours").value)   || 0;
      const m       = Number(document.getElementById("ed-minutes").value) || 0;
      const note    = document.getElementById("ed-note").value.trim();
      const tags    = parseTags(document.getElementById("ed-tags").value);
      const duration = (h * 3600 + m * 60) * 1000;
      if (duration < 1000) return;
      updateSession(id, { mode, duration, note, tags });
      closeModal();
    });
    document.getElementById("ed-delete").addEventListener("click", () => {
      if (confirm("Delete this session? This cannot be undone.")) {
        deleteSession(id);
        closeModal();
      }
    });
  });
}

// ─── Daily goal dialog ────────────────────────────────────

function openGoalModal() {
  const hours   = Math.floor(dailyGoalMin / 60);
  const minutes = dailyGoalMin % 60;
  openModal("Preferences", `
    <div class="field">
      <label class="field-label">Daily focus goal</label>
      <div class="field-row">
        <input class="field-input" id="g-hours"   type="number" min="0" max="24" step="1" value="${hours}"   inputmode="numeric" />
        <input class="field-input" id="g-minutes" type="number" min="0" max="59" step="1" value="${minutes}" inputmode="numeric" />
      </div>
      <span class="tag-hint">Productive time target each day (hours / minutes).</span>
    </div>
    <label class="toggle-row" for="g-pause">
      <div class="toggle-row-copy">
        <span class="toggle-row-title">Pause on inactivity</span>
        <span class="toggle-row-sub">Auto-pause if you tab away for 5+ minutes.</span>
      </div>
      <span class="switch">
        <input id="g-pause" type="checkbox" ${pauseOnBlur ? "checked" : ""} />
        <span class="switch-track"><span class="switch-thumb"></span></span>
      </span>
    </label>
    <div class="modal-actions">
      <button class="btn-ghost"   type="button" data-modal-close>Cancel</button>
      <button class="btn-primary" id="g-save"   type="button">Save</button>
    </div>
  `, () => {
    document.getElementById("g-save").addEventListener("click", () => {
      const h       = Number(document.getElementById("g-hours").value)   || 0;
      const m       = Number(document.getElementById("g-minutes").value) || 0;
      const newPause = document.getElementById("g-pause").checked;
      const total   = Math.max(0, h * 60 + m);
      if (total === 0) return;
      dailyGoalMin = total;
      pauseOnBlur  = newPause;
      localStorage.setItem(goalKey, String(total));
      localStorage.setItem(pauseBlurKey, String(newPause));
      schedulePrefsSync();
      render();
      closeModal();
    });
  });
}

// ─── Event listeners ──────────────────────────────────────

modeButtons.forEach((btn) => btn.addEventListener("click", () => setMode(btn.dataset.mode)));
startPauseBtn.addEventListener("click",  () => startedAt ? pauseTimer() : startTimer());
saveButton.addEventListener("click",     saveSession);
resetButton.addEventListener("click",    resetTimer);
sessionForm.addEventListener("submit",   (e) => { e.preventDefault(); saveSession(); });

// Timer type tabs
typeButtons.forEach((btn) => btn.addEventListener("click", () => setTimerType(btn.dataset.type)));

// Countdown presets
presetButtons.forEach((btn) =>
  btn.addEventListener("click", () => {
    countdownCustom.value = "";
    setCountdownTarget(Number(btn.dataset.minutes));
  }));
countdownCustom.addEventListener("input", () => {
  if (countdownCustom.value) setCountdownTarget(countdownCustom.value, "custom");
});

// Manual log
manualLogBtn.addEventListener("click", openManualLogModal);

// Goal edit
goalEditBtn.addEventListener("click", openGoalModal);

// Session edit (delegated)
sessionList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-edit-id]");
  if (btn) openEditSessionModal(btn.dataset.editId);
});

// Theme toggle
themeToggleBtn.addEventListener("click", toggleTheme);

// CSV export
exportCsvBtn.addEventListener("click", exportCsv);

// Pause-on-blur listener (checks `pauseOnBlur` flag internally)
document.addEventListener("visibilitychange", onVisibilityChange);

// ─── Keyboard shortcuts ───────────────────────────────────
// space = start/pause, s = save, r = reset, n = focus note,
// m = manual log, g = goal/preferences, t = toggle theme.
// Ignored while typing in inputs or while a modal is open.

function isTypingTarget(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!modalRoot.hidden) return;                // modal handles its own keys
  if (isTypingTarget(document.activeElement)) return;

  switch (e.key) {
    case " ":
    case "Spacebar":
      e.preventDefault();
      startedAt ? pauseTimer() : startTimer();
      break;
    case "s": e.preventDefault(); saveSession(); break;
    case "r": e.preventDefault(); resetTimer();  break;
    case "n": e.preventDefault(); noteInput.focus(); break;
    case "m": e.preventDefault(); openManualLogModal(); break;
    case "g": e.preventDefault(); openGoalModal();      break;
    case "t": e.preventDefault(); toggleTheme();        break;
  }
});
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

// Apply theme before first paint
applyTheme();

// Initialize timer type UI to match persisted state
syncTimerTypeUI();

setupVoice();
renderBrandClock();
render();
setInterval(() => { renderBrandClock(); renderClock(); }, 60000);
initAuth();
