const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const STORAGE_KEY = "focusFlow_v1";
const todayKey = new Date().toLocaleDateString("en-CA");
const ringCircumference = 2 * Math.PI * 98;

let state = {
  tasks: [],
  notes: "",
  focusSecondsToday: 0,
  focusDate: todayKey,
  totalCompleted: 0,
  darkMode: false
};
let currentFilter = "all";
let timerDuration = 25 * 60;
let timerRemaining = timerDuration;
let timerInterval = null;
let timerRunning = false;
let currentMode = "Focus";
let toastTimeout;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") state = { ...state, ...saved };
  } catch (error) {
    console.warn("Saved workspace data could not be read.", error);
  }
  if (state.focusDate !== todayKey) {
    state.focusDate = todayKey;
    state.focusSecondsToday = 0;
  }
  if (!Array.isArray(state.tasks)) state.tasks = [];
  if (typeof state.notes !== "string") state.notes = "";
  document.body.classList.toggle("dark", Boolean(state.darkMode));
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    showToast("Could not save data in this browser.");
  }
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 2300);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(date);
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

function renderTasks() {
  const visibleTasks = state.tasks.filter((task) => {
    if (currentFilter === "active") return !task.done;
    if (currentFilter === "done") return task.done;
    return true;
  });
  $("#taskList").innerHTML = visibleTasks.map((task) => `
    <div class="task-item ${task.done ? "completed" : ""}" data-id="${task.id}">
      <input class="task-check" type="checkbox" aria-label="Mark ${escapeHTML(task.title)} as complete" ${task.done ? "checked" : ""}>
      <span class="priority-dot ${task.priority === "high" ? "high" : ""}" title="${task.priority === "high" ? "High priority" : "Normal priority"}"></span>
      <span class="task-title">${escapeHTML(task.title)}</span>
      <button class="delete-task" aria-label="Delete task" title="Delete task">×</button>
    </div>`).join("");

  const total = state.tasks.length;
  const done = state.tasks.filter((task) => task.done).length;
  const active = total - done;
  $("#allCount").textContent = total;
  $("#activeCount").textContent = active;
  $("#doneCount").textContent = done;
  $("#taskNavCount").textContent = active;
  $("#taskHeadingCount").textContent = active;
  $("#completedStat").innerHTML = `${done} <small>/ ${total}</small>`;
  $("#taskProgress").style.width = `${total ? (done / total) * 100 : 0}%`;
  $("#streakStat").textContent = state.totalCompleted;
  $("#emptyState").classList.toggle("show", visibleTasks.length === 0);
  $("#taskList").style.display = visibleTasks.length ? "grid" : "none";
}

function addTask(title, priority) {
  state.tasks.unshift({
    id: (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    title: title.trim(),
    priority,
    done: false,
    createdAt: Date.now()
  });
  saveState();
  renderTasks();
}

$("#taskForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("#taskInput");
  const title = input.value.trim();
  if (!title) return;
  addTask(title, $("#taskPriority").value);
  input.value = "";
  input.focus();
  showToast("Task added to your list.");
});

$("#taskList").addEventListener("change", (event) => {
  if (!event.target.matches(".task-check")) return;
  const row = event.target.closest(".task-item");
  const task = state.tasks.find((item) => item.id === row.dataset.id);
  if (!task) return;
  task.done = event.target.checked;
  if (task.done) {
    state.totalCompleted += 1;
    showToast("Nice work — one step forward!");
  }
  saveState();
  renderTasks();
});

$("#taskList").addEventListener("click", (event) => {
  const button = event.target.closest(".delete-task");
  if (!button) return;
  const row = button.closest(".task-item");
  state.tasks = state.tasks.filter((task) => task.id !== row.dataset.id);
  saveState();
  renderTasks();
  showToast("Task removed.");
});

$$(".filter-btn").forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    $$(".filter-btn").forEach((item) => item.classList.toggle("active", item === button));
    renderTasks();
  });
});

$("#clearDoneBtn").addEventListener("click", () => {
  const before = state.tasks.length;
  state.tasks = state.tasks.filter((task) => !task.done);
  saveState();
  renderTasks();
  showToast(before === state.tasks.length ? "No completed tasks to clear." : "Completed tasks cleared.");
});

function renderTimer() {
  const minutes = Math.floor(timerRemaining / 60).toString().padStart(2, "0");
  const seconds = (timerRemaining % 60).toString().padStart(2, "0");
  $("#timerDisplay").textContent = `${minutes}:${seconds}`;
  $("#timerModeLabel").textContent = currentMode.toUpperCase() === "FOCUS" ? "TIME TO FOCUS" : currentMode.toUpperCase();
  $("#timerStatus").textContent = timerRunning ? "You're doing great. Stay with it." : (timerRemaining === 0 ? "Session complete!" : "Ready when you are");
  $("#timerStart").textContent = timerRunning ? "Ⅱ Pause timer" : (timerRemaining === 0 ? "↻ Start again" : "▶ Start focus");
  const progress = timerDuration ? 1 - timerRemaining / timerDuration : 0;
  $("#timerProgress").style.strokeDasharray = ringCircumference;
  $("#timerProgress").style.strokeDashoffset = ringCircumference * progress;
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerRunning = false;
}

function setTimerMode(mode, minutes) {
  stopTimer();
  currentMode = mode;
  timerDuration = minutes * 60;
  timerRemaining = timerDuration;
  $$(".mode-btn").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  renderTimer();
}

function startTimer() {
  if (timerRunning) {
    stopTimer();
    renderTimer();
    return;
  }
  if (timerRemaining <= 0) timerRemaining = timerDuration;
  timerRunning = true;
  renderTimer();
  timerInterval = setInterval(() => {
    if (timerRemaining > 0) {
      timerRemaining -= 1;
      if (currentMode === "Focus") {
        state.focusSecondsToday += 1;
        if (state.focusDate !== todayKey) {
          state.focusDate = todayKey;
          state.focusSecondsToday = 1;
        }
        if (state.focusSecondsToday % 15 === 0) saveState();
        updateFocusStats();
      }
      renderTimer();
    }
    if (timerRemaining <= 0) {
      stopTimer();
      renderTimer();
      saveState();
      showToast(currentMode === "Focus" ? "Focus session complete. Take a short break!" : "Break complete. Ready for another round?");
      try {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Focus Flow", { body: `${currentMode} session complete. Nice work!` });
        }
      } catch (_) { }
    }
  }, 1000);
}

function updateFocusStats() {
  $("#focusMinutesStat").textContent = Math.floor(state.focusSecondsToday / 60);
}

$$(".mode-btn").forEach((button) => {
  button.addEventListener("click", () => setTimerMode(button.dataset.mode, Number(button.dataset.minutes)));
});
$("#timerStart").addEventListener("click", startTimer);
$("#timerReset").addEventListener("click", () => {
  stopTimer();
  timerRemaining = timerDuration;
  renderTimer();
});

$("#notesInput").addEventListener("input", () => {
  state.notes = $("#notesInput").value;
  $("#notesCharCount").textContent = `${state.notes.length} / 3000`;
  $("#notesSaveState").textContent = "Saving…";
  saveState();
  $("#notesSaveState").textContent = "Saved automatically";
});

$("#themeToggle").addEventListener("click", () => {
  state.darkMode = !state.darkMode;
  document.body.classList.toggle("dark", state.darkMode);
  saveState();
  showToast(state.darkMode ? "Dark mode enabled." : "Light mode enabled.");
});

function init() {
  loadState();
  $("#todayDate").textContent = formatDate(new Date());
  $("#notesInput").value = state.notes;
  $("#notesCharCount").textContent = `${state.notes.length} / 3000`;
  renderTasks();
  updateFocusStats();
  renderTimer();
}

window.addEventListener("beforeunload", () => {
  if (timerRunning) stopTimer();
  saveState();
});

init();
