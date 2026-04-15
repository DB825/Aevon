const modes = [
  { id: "study",         label: "Study",         productive: true  },
  { id: "projects",      label: "Projects",      productive: true  },
  { id: "work",          label: "Work",          productive: true  },
  { id: "entertainment", label: "Entertainment", productive: false },
];

const storageKey = "aevon.sessions.v1";

// Timer UI
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

// Today
const todayTotal     = document.querySelector("#today-total");
const yesterdayTotal = document.querySelector("#yesterday-total");
const dailyDelta     = document.querySelector("#daily-delta");
const bestHourEl     = document.querySelector("#best-hour");
const productivityEl = document.querySelector("#productivity-score");

// Insights
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

// History
const emptyState     = document.querySelector("#empty-state");
const sessionList    = document.querySelector("#session-list");

// Header
const headerStreak   = document.querySelector("#header-streak");
const streakPill     = document.querySelector("#streak-pill");
const headerDate     = document.querySelector("#header-date");

let currentMode = "study";
let elapsedMs   = 0;
let startedAt   = null;
let rafId       = null;
let sessions    = loadSessions();
let recognition = null;
let voiceEnabled = false;

// ─── Storage ──────────────────────────────────────────────

function loadSessions() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSessions() {
  localStorage.setItem(storageKey, JSON.stringify(sessions));
}

// ─── Time helpers ─────────────────────────────────────────

function getElapsedMs() {
  return startedAt ? elapsedMs + (Date.now() - startedAt) : elapsedMs;
}

function formatClock(ms) {
  const total   = Math.floor(ms / 1000);
  const hours   = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((v) => String(v).padStart(2, "0")).join(":");
}

function formatDuration(ms) {
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 1) return "0m";
  const hours   = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0)   return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function getDayKey(date) {
  return date.toLocaleDateString("en-CA");
}

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
  elapsedMs = 0;
  startedAt = null;
  cancelAnimationFrame(rafId);
  timeOutput.textContent = "00:00:00";
  startPauseBtn.textContent = "Start";
  startPauseBtn.classList.remove("is-running");
  timerWidget.classList.remove("is-running");
  runStatus.textContent = "Ready when you are.";
}

// ─── Session logic ────────────────────────────────────────

function getModeLabel(modeId) {
  return modes.find((m) => m.id === modeId)?.label || "Focus";
}

function isProductive(session) {
  return modes.find((m) => m.id === session.mode)?.productive !== false;
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `s-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createSession(duration, mode, note) {
  const now   = new Date();
  const start = new Date(now.getTime() - duration);
  return {
    id:        createId(),
    mode,
    note,
    duration,
    startedAt: start.toISOString(),
    endedAt:   now.toISOString(),
    day:       getDayKey(now),
    hour:      start.getHours(),
  };
}

function storeSession(session) {
  sessions = [session, ...sessions].slice(0, 200);
  persistSessions();
}

function setMode(modeId) {
  if (!modes.some((m) => m.id === modeId) || modeId === currentMode) return;

  const wasRunning       = Boolean(startedAt);
  const previousMode     = currentMode;
  const previousDuration = getElapsedMs();

  if (wasRunning && previousDuration >= 1000) {
    storeSession(createSession(previousDuration, previousMode, noteInput.value.trim()));
    noteInput.value = "";
    elapsedMs  = 0;
    startedAt  = Date.now();
  }

  currentMode = modeId;
  activeLabel.textContent = `Tracking ${getModeLabel(modeId).toLowerCase()}`;

  modeButtons.forEach((btn) => {
    const active = btn.dataset.mode === modeId;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-checked", String(active));
  });

  if (startedAt) {
    const savedNote =
      wasRunning && previousDuration >= 1000
        ? `Saved ${formatDuration(previousDuration)} of ${getModeLabel(previousMode).toLowerCase()}. `
        : "";
    runStatus.textContent = `${savedNote}Running ${getModeLabel(modeId).toLowerCase()}.`;
    render();
  }
}

function saveSession() {
  const duration = getElapsedMs();
  if (duration < 1000) {
    runStatus.textContent = "Track at least a second before saving.";
    return;
  }
  storeSession(createSession(duration, currentMode, noteInput.value.trim()));
  noteInput.value = "";
  resetTimer();
  runStatus.textContent = `Saved ${formatDuration(duration)} of ${getModeLabel(currentMode).toLowerCase()}.`;
  render();
}

// ─── Data helpers ─────────────────────────────────────────

function getSessionsForDay(dayKey) {
  return sessions.filter((s) => s.day === dayKey);
}

function sumDuration(list) {
  return list.reduce((t, s) => t + s.duration, 0);
}

function getBestHour(list) {
  const totals = new Map();
  list.forEach((s) => totals.set(s.hour, (totals.get(s.hour) || 0) + s.duration));
  const [hour] = [...totals.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  if (hour === undefined) return "—";
  return new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function getStreak() {
  const productiveDays = new Set(sessions.filter(isProductive).map((s) => s.day));
  if (!productiveDays.size) return 0;

  let streak = 0;
  const date = new Date();
  date.setHours(0, 0, 0, 0);

  if (!productiveDays.has(getDayKey(date))) {
    date.setDate(date.getDate() - 1);
  }

  while (productiveDays.has(getDayKey(date))) {
    streak++;
    date.setDate(date.getDate() - 1);
  }

  return streak;
}

function getLongestStreak() {
  const productiveDays = [...new Set(sessions.filter(isProductive).map((s) => s.day))].sort();
  if (!productiveDays.length) return 0;

  let longest = 1;
  let current = 1;

  for (let i = 1; i < productiveDays.length; i++) {
    const prev = parseLocalDate(productiveDays[i - 1]);
    const curr = parseLocalDate(productiveDays[i]);
    const diff = Math.round((curr - prev) / 86400000);
    if (diff === 1) {
      current++;
      if (current > longest) longest = current;
    } else {
      current = 1;
    }
  }

  return longest;
}

function getWeeklyData() {
  const now    = new Date();
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key  = getDayKey(date);
    const ms   = sumDuration(getSessionsForDay(key).filter(isProductive));
    result.push({
      key,
      dayName: date.toLocaleDateString("en-US", { weekday: "short" }),
      ms,
      isToday: i === 0,
    });
  }
  return result;
}

function getDaysActiveThisWeek() {
  return getWeeklyData().filter((d) => d.ms > 0).length;
}

function getProductivityScore() {
  const todaySessions = getSessionsForDay(getDayKey(new Date()));
  const total = sumDuration(todaySessions);
  if (!total) return null;
  return Math.round((sumDuration(todaySessions.filter(isProductive)) / total) * 100);
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

function getAvgSession() {
  const productive = sessions.filter(isProductive);
  if (!productive.length) return "—";
  return formatDuration(sumDuration(productive) / productive.length);
}

function escapeHtml(value) {
  return value
    .replaceAll("&",  "&amp;")
    .replaceAll("<",  "&lt;")
    .replaceAll(">",  "&gt;")
    .replaceAll('"',  "&quot;")
    .replaceAll("'",  "&#039;");
}

// ─── Render functions ─────────────────────────────────────

function renderHeader() {
  const streak = getStreak();

  headerDate.textContent = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month:   "long",
    day:     "numeric",
  });

  headerStreak.textContent = streak;
  streakPill.classList.toggle("has-streak", streak > 0);
}

function renderStats() {
  const now          = new Date();
  const todayKey     = getDayKey(now);
  const yesterdayKey = getDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const todaySessions     = getSessionsForDay(todayKey).filter(isProductive);
  const yesterdaySessions = getSessionsForDay(yesterdayKey).filter(isProductive);
  const todayMs     = sumDuration(todaySessions);
  const yesterdayMs = sumDuration(yesterdaySessions);
  const delta       = todayMs - yesterdayMs;

  todayTotal.textContent     = formatDuration(todayMs);
  yesterdayTotal.textContent = formatDuration(yesterdayMs);

  if (todayMs === 0 && yesterdayMs === 0) {
    dailyDelta.textContent = "— vs yesterday";
  } else {
    dailyDelta.textContent =
      `${delta >= 0 ? "+" : "-"}${formatDuration(Math.abs(delta))} vs yesterday`;
  }

  bestHourEl.textContent = getBestHour(todaySessions);

  const score = getProductivityScore();
  productivityEl.textContent = score === null ? "—" : `${score}%`;
}

function renderBreakdown() {
  const todaySessions = getSessionsForDay(getDayKey(new Date()));
  const total         = Math.max(sumDuration(todaySessions), 1);

  breakdownList.innerHTML = modes
    .map((mode) => {
      const duration = sumDuration(todaySessions.filter((s) => s.mode === mode.id));
      const percent  = Math.round((duration / total) * 100);
      return `
        <div class="breakdown-track">
          <div class="breakdown-topline">
            <span>${mode.label}</span>
            <strong>${formatDuration(duration)}</strong>
          </div>
          <div class="bar-shell" aria-hidden="true">
            <div class="bar-fill" style="width: ${percent}%"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderWeeklyChart() {
  const data     = getWeeklyData();
  const maxMs    = Math.max(...data.map((d) => d.ms), 1);
  const weekTotal = sumDuration(data.map((d) => ({ duration: d.ms })));

  weeklyBadge.textContent = `${formatDuration(weekTotal)} this week`;

  weeklyChart.innerHTML = data
    .map((d) => {
      const heightPct = Math.round((d.ms / maxMs) * 100);
      const barStyle  = `height: ${heightPct}%`;
      return `
        <div class="chart-col${d.isToday ? " is-today" : ""}${d.ms === 0 ? " is-empty" : ""}">
          <div class="chart-bar-outer">
            <div class="chart-bar" style="${barStyle}" title="${formatDuration(d.ms)}"></div>
          </div>
          <span class="chart-day">${d.dayName}</span>
        </div>
      `;
    })
    .join("");
}

function renderInsights() {
  const streak  = getStreak();
  const longest = getLongestStreak();
  const active  = getDaysActiveThisWeek();

  // Streak card
  streakNumber.textContent   = streak;
  longestStreak.textContent  = longest + (longest === 1 ? " day" : " days");
  daysThisWeek.textContent   = active  + (active  === 1 ? " day" : " days");

  if (streak === 0) {
    streakMsg.textContent = "Log a session today to start your streak.";
  } else if (streak === 1) {
    streakMsg.textContent = "Day one. Keep it going tomorrow.";
  } else {
    streakMsg.textContent = `${streak} days strong. Don't break the chain.`;
  }

  // Peak patterns
  bestDayEl.textContent  = getBestDayOfWeek();
  bestHour2.textContent  = getBestHour(sessions.filter(isProductive));
  avgSessionEl.textContent = getAvgSession();
  totalAllTime.textContent = sessions.length
    ? formatDuration(sumDuration(sessions))
    : "—";

  renderWeeklyChart();
}

function renderHistory() {
  emptyState.classList.toggle("is-hidden", sessions.length > 0);
  sessionList.innerHTML = sessions
    .slice(0, 14)
    .map((session) => {
      const endedAt  = new Date(session.endedAt);
      const timeLabel = endedAt.toLocaleString([], {
        month:   "short",
        day:     "numeric",
        hour:    "numeric",
        minute:  "2-digit",
      });
      return `
        <li class="session-item">
          <span class="session-mode" data-mode="${session.mode}">${getModeLabel(session.mode)}</span>
          <div class="session-info">
            <div class="session-meta">${timeLabel}</div>
            <div class="session-note${session.note ? "" : " is-empty"}">${escapeHtml(session.note || "No note added")}</div>
          </div>
          <strong class="session-duration">${formatDuration(session.duration)}</strong>
        </li>
      `;
    })
    .join("");
}

function render() {
  renderHeader();
  renderStats();
  renderBreakdown();
  renderInsights();
  renderHistory();
}

// ─── Voice ────────────────────────────────────────────────

function setupVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    voiceButton.disabled     = true;
    voiceButton.textContent  = "No voice";
    voiceButton.title        = "Voice commands not supported in this browser.";
    return;
  }

  recognition               = new SR();
  recognition.continuous    = true;
  recognition.interimResults = false;
  recognition.lang          = "en-US";

  recognition.addEventListener("result", (event) => {
    const transcript = [...event.results]
      .slice(event.resultIndex)
      .map((r) => r[0].transcript)
      .join(" ")
      .toLowerCase();
    handleVoiceCommand(transcript);
  });

  recognition.addEventListener("end", () => {
    if (voiceEnabled) startVoiceRecognition();
  });
}

function startVoiceRecognition() {
  try {
    recognition.start();
  } catch {
    voiceEnabled            = false;
    voiceButton.textContent = "Voice";
    voiceButton.classList.remove("is-active");
    runStatus.textContent   = "Voice could not start.";
  }
}

function handleVoiceCommand(transcript) {
  if (transcript.includes("start")  || transcript.includes("resume"))      startTimer();
  if (transcript.includes("pause")  || transcript.includes("stop"))        pauseTimer();
  if (transcript.includes("save")   || transcript.includes("log"))         saveSession();
  if (transcript.includes("reset")  || transcript.includes("clear"))       resetTimer();
  modes.forEach((mode) => {
    if (transcript.includes(mode.id) || transcript.includes(mode.label.toLowerCase())) {
      setMode(mode.id);
    }
  });
}

// ─── Event listeners ──────────────────────────────────────

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

startPauseBtn.addEventListener("click", () => {
  startedAt ? pauseTimer() : startTimer();
});

saveButton.addEventListener("click",  saveSession);
resetButton.addEventListener("click", resetTimer);

sessionForm.addEventListener("submit", (e) => {
  e.preventDefault();
  saveSession();
});

voiceButton.addEventListener("click", () => {
  if (!recognition) return;
  voiceEnabled = !voiceEnabled;

  if (voiceEnabled) {
    voiceButton.textContent = "Voice on";
    voiceButton.classList.add("is-active");
    runStatus.textContent   = "Voice: start, pause, save, reset, study, projects, work, entertainment.";
    startVoiceRecognition();
  } else {
    recognition.stop();
    voiceButton.textContent = "Voice";
    voiceButton.classList.remove("is-active");
    runStatus.textContent   = "Voice paused.";
  }
});

// ─── Init ─────────────────────────────────────────────────

setupVoice();
render();
