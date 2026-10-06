// UI layer on top of app.js + features.js:
// theme, progress ring, "Up next", command palette (Ctrl/⌘+K), focus timer,
// mobile notes drawer, milestone celebrations, tab memory, keyboard shortcuts.
// Everything here is local to the device (keys without the "dotnet_" prefix are never synced).

const $ = id => document.getElementById(id);
const root = document.documentElement;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full / blocked */ } };
const tabBtns = () => [...document.querySelectorAll(".tab-btn-nav")];

// ---------------------------------------------------------------- toast + confetti
function toast(msg, icon = "bi-check-circle-fill") {
  let stack = $("toast-stack");
  if (!stack) { stack = document.createElement("div"); stack.id = "toast-stack"; stack.className = "toast-stack"; document.body.appendChild(stack); }
  const t = document.createElement("div");
  t.className = "toast-item"; t.innerHTML = `<i class="bi ${icon}"></i><span>${esc(msg)}</span>`;
  stack.appendChild(t); setTimeout(() => t.remove(), 3400);
}
function confetti(n = 70) {
  const colors = ["#6366f1", "#8b5cf6", "#06b6d4", "#22c55e", "#f59e0b", "#ef4444", "#ec4899"];
  for (let i = 0; i < n; i++) {
    const c = document.createElement("i"); c.className = "confetti";
    c.style.left = Math.random() * 100 + "vw"; c.style.background = colors[i % colors.length];
    c.style.setProperty("--dx", (Math.random() * 240 - 120) + "px"); c.style.setProperty("--rot", (Math.random() * 720 - 360) + "deg");
    c.style.animationDuration = 1.8 + Math.random() * 1.6 + "s"; c.style.animationDelay = Math.random() * .4 + "s";
    document.body.appendChild(c); setTimeout(() => c.remove(), 4200);
  }
}

// ---------------------------------------------------------------- theme
function paintTheme() {
  const dark = root.getAttribute("data-theme") === "dark";
  const b = $("theme-toggle"); if (b) b.firstElementChild.className = "bi " + (dark ? "bi-sun" : "bi-moon-stars");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0c0e19" : "#4f46e5");
}
function setTheme(t) { root.setAttribute("data-theme", t); try { localStorage.setItem("dn_theme", t); } catch (e) { /* ignore */ } paintTheme(); }
const toggleTheme = () => setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
$("theme-toggle")?.addEventListener("click", toggleTheme);
paintTheme();

// ---------------------------------------------------------------- progress ring + top bar
const CIRC = 2 * Math.PI * 52;
function paintProgress() {
  const pct = Math.round(done.size / TOTAL * 100);
  const fg = $("ring-fg"); if (fg) { fg.style.strokeDasharray = CIRC; fg.style.strokeDashoffset = CIRC * (1 - pct / 100); }
  if ($("ring-pct")) $("ring-pct").textContent = pct + "%";
  if ($("top-prog-fill")) $("top-prog-fill").style.width = pct + "%";
  paintLevel();
}
const baseStats = window.updateStats;
window.updateStats = function () { baseStats.apply(this, arguments); paintProgress(); };

// ---------------------------------------------------------------- greeting
const baseGreet = window.updateGreeting;
function greet() {
  const el = $("roadmap-greeting"); if (!el) return;
  const h = new Date().getHours(), part = h < 5 ? "Burning the midnight oil" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const name = localStorage.getItem("dotnet_display_name") || window.Cloud?.user?.username || "";
  el.textContent = `${part}${name ? ", " + name : ""} 👋`;
}
window.updateGreeting = function () { baseGreet?.apply(this, arguments); greet(); };

// ---------------------------------------------------------------- "Up next" card
function dayInfo(n) {
  for (const ph of PHASES) for (const w of ph.weeks) for (const d of w.days) if (d.n === n) return { d, w, ph };
  return null;
}
function renderUpNext() {
  const host = $("up-next"); if (!host) return;
  const n = typeof findNextDay === "function" ? findNextDay() : null;
  if (n == null) {
    host.innerHTML = `<div class="upnext all-done"><span class="upnext-ic"><i class="bi bi-trophy-fill"></i></span><div class="upnext-body"><small>Roadmap complete</small><b>You finished all ${TOTAL} days 🎉</b><span>Time to polish your resume and start interviewing.</span></div>
      <div class="upnext-actions"><button class="btn btn-primary btn-sm" onclick="document.querySelectorAll('.tab-btn-nav')[3].click()"><i class="bi bi-patch-question me-1"></i>Practice Q&amp;A</button></div></div>`;
    return;
  }
  const { d, w, ph } = dayInfo(n);
  host.innerHTML = `<div class="upnext"><span class="upnext-ic"><i class="bi bi-lightning-charge-fill"></i></span>
    <div class="upnext-body"><small>Up next · Day ${d.n} · ${esc(w.week)}</small><b>${esc(d.topic)}</b><span>${esc(d.desc)}</span></div>
    <div class="upnext-actions">
      <button class="btn btn-primary btn-sm" onclick="UI.complete(${d.n})"><i class="bi bi-check2-circle me-1"></i>Mark done</button>
      <button class="btn btn-ghost btn-sm" onclick="UI.goToDay(${d.n})"><i class="bi bi-crosshair"></i> Jump to day</button>
      <button class="btn btn-ghost btn-sm" onclick="UI.goToDay(${d.n}, true)"><i class="bi bi-sticky"></i> Note</button>
    </div></div>`;
}
const baseRender = window.render;
window.render = function () { baseRender.apply(this, arguments); renderUpNext(); decorateDays(); renderPins(); renderPhaseNav(); };

// ---------------------------------------------------------------- navigation helpers
function showRoadmapTab() { const b = tabBtns()[0]; if (b && $("tab-roadmap").style.display === "none") b.click(); }
function goToDay(n, openNote = false) {
  showRoadmapTab();
  const sb = $("search-box"); if (sb && sb.value) { sb.value = ""; filterDays(); }
  if (filter !== "all") setFilter("all", document.querySelector(".filter-btn"));
  const row = document.querySelector(`.day-row[data-day="${n}"]`); if (!row) return;
  const body = row.closest('[id^="body-"]'); if (body && body.style.display === "none") body.style.display = "";
  const card = row.closest(".week-card"); if (card?.classList.contains("collapsed")) toggleWeek(card.querySelector(".week-header"));
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  row.classList.remove("flash"); void row.offsetWidth; row.classList.add("flash");
  if (openNote) setTimeout(() => { const box = $("note-box-" + n); if (box && box.style.display !== "block") toggleNoteBox(n); }, 350);
}
function complete(n) { if (!done.has(n)) toggle(n); }
function toggleNotesDrawer(open) {
  const sb = $("notes-sidebar"), bk = $("drawer-backdrop"); if (!sb) return;
  const want = typeof open === "boolean" ? open : !sb.classList.contains("open");
  sb.classList.toggle("open", want); bk?.classList.toggle("show", want);
  document.body.style.overflow = want && innerWidth < 1300 ? "hidden" : "";
}
window.toggleNotesDrawer = toggleNotesDrawer;
$("open-notes")?.addEventListener("click", () => toggleNotesDrawer());
$("exp-all")?.addEventListener("click", () => setAllWeeks(true));
$("col-all")?.addEventListener("click", () => setAllWeeks(false));
addEventListener("resize", () => { if (innerWidth >= 1300) toggleNotesDrawer(false); });

// ---------------------------------------------------------------- tab memory + scroll reset
const baseShowTab = window.showTab;
window.showTab = function (tab, btn) {
  baseShowTab.apply(this, arguments);
  const i = tabBtns().indexOf(btn); if (i >= 0) lsSet("dn_tab", i);
  scrollTo({ top: 0, behavior: "instant" });
  const main = document.querySelector(".main-col"); if (main) { main.style.animation = "none"; void main.offsetWidth; main.style.animation = ""; }
};

// ---------------------------------------------------------------- milestone celebrations
let lastPct = Math.floor(done.size / TOTAL * 100);
const baseSave = window.save;
window.save = function () {
  baseSave.apply(this, arguments);
  const pct = Math.floor(done.size / TOTAL * 100);
  const hit = [100, 75, 50, 25].find(m => lastPct < m && pct >= m);
  if (hit) {
    confetti(hit === 100 ? 140 : 70);
    toast(hit === 100 ? "🏆 Roadmap complete — incredible work!" : `🎉 ${hit}% of the roadmap done!`, "bi-stars");
  }
  lastPct = pct;
};

// ---------------------------------------------------------------- focus timer
const MODES = { focus: { label: "Focus", min: 25 }, short: { label: "Short break", min: 5 }, long: { label: "Long break", min: 15 } };
const T = { mode: "focus", total: 25 * 60, left: 25 * 60, running: false, endAt: 0, tick: null };
const todayKey = () => "dn_focus_" + new Date().toISOString().slice(0, 10);
const fmt = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
function buildTimer() {
  const pop = document.createElement("div"); pop.className = "timer-pop"; pop.id = "timer-pop";
  pop.innerHTML = `<div class="timer-modes">${Object.entries(MODES).map(([k, m]) => `<button data-m="${k}" class="${k === T.mode ? "active" : ""}">${m.label}</button>`).join("")}</div>
    <div class="timer-dial"><svg viewBox="0 0 120 120"><circle class="ring-bg" cx="60" cy="60" r="52"/><circle class="ring-fg" id="t-ring" cx="60" cy="60" r="52"/></svg>
      <div class="ring-center"><b id="t-time">25:00</b><small id="t-label">Focus</small></div></div>
    <div class="timer-btns"><button class="btn btn-primary" id="t-toggle"><i class="bi bi-play-fill me-1"></i>Start</button><button class="btn btn-ghost" id="t-reset"><i class="bi bi-arrow-counterclockwise"></i></button></div>
    <div class="timer-sessions" id="t-sessions"></div>`;
  document.body.appendChild(pop);
  pop.querySelectorAll(".timer-modes button").forEach(b => b.onclick = () => setMode(b.dataset.m));
  $("t-toggle").onclick = toggleTimer; $("t-reset").onclick = () => setMode(T.mode);
  paintTimer();
}
function setMode(m) {
  stopTick(); T.mode = m; T.total = T.left = MODES[m].min * 60; T.running = false;
  document.querySelectorAll(".timer-modes button").forEach(b => b.classList.toggle("active", b.dataset.m === m));
  paintTimer();
}
function stopTick() { clearInterval(T.tick); T.tick = null; }
function toggleTimer() {
  if (T.running) { T.left = Math.max(0, Math.round((T.endAt - Date.now()) / 1000)); T.running = false; stopTick(); }
  else {
    if (T.left <= 0) T.left = T.total;
    T.running = true; T.endAt = Date.now() + T.left * 1000; T.tick = setInterval(tickTimer, 500);
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
  }
  paintTimer();
}
function tickTimer() {
  T.left = Math.max(0, Math.round((T.endAt - Date.now()) / 1000)); paintTimer();
  if (T.left <= 0) {
    stopTick(); T.running = false;
    if (T.mode === "focus") lsSet(todayKey(), (lsGet(todayKey(), 0) || 0) + 1);
    beep(); toast(T.mode === "focus" ? "Focus session done — take a break ☕" : "Break over — back to it 💪", "bi-stopwatch");
    try { if ("Notification" in window && Notification.permission === "granted") new Notification(T.mode === "focus" ? "Focus session complete" : "Break finished", { body: T.mode === "focus" ? "Nice work. Time for a short break." : "Ready for the next session?", icon: "icons/icon-192.png" }); } catch (e) { /* some mobile browsers need a service worker */ }
    paintTimer();
  }
}
function beep() {
  try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain();
    o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.setValueAtTime(.15, a.currentTime); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + .8); o.start(); o.stop(a.currentTime + .8); } catch (e) { /* audio blocked */ }
}
function paintTimer() {
  const ring = $("t-ring"); if (!ring) return;
  ring.style.strokeDasharray = CIRC; ring.style.strokeDashoffset = CIRC * (1 - (T.total ? T.left / T.total : 0));
  $("t-time").textContent = fmt(T.left); $("t-label").textContent = MODES[T.mode].label;
  $("t-toggle").innerHTML = T.running ? '<i class="bi bi-pause-fill me-1"></i>Pause' : `<i class="bi bi-play-fill me-1"></i>${T.left < T.total && T.left > 0 ? "Resume" : "Start"}`;
  const n = lsGet(todayKey(), 0) || 0; $("t-sessions").textContent = n ? `${n} focus session${n > 1 ? "s" : ""} today 🔥` : "No focus sessions yet today";
  const live = $("timer-live"); if (live) live.textContent = T.running || T.left < T.total ? fmt(T.left) : "";
}
function toggleTimerPop(force) {
  if (!$("timer-pop")) buildTimer();
  const p = $("timer-pop"); p.classList.toggle("show", typeof force === "boolean" ? force : !p.classList.contains("show"));
}
$("open-timer")?.addEventListener("click", e => { e.stopPropagation(); toggleTimerPop(); });
document.addEventListener("click", e => { const p = $("timer-pop"); if (p?.classList.contains("show") && !p.contains(e.target) && !$("open-timer").contains(e.target)) p.classList.remove("show"); });

// ---------------------------------------------------------------- command palette
let palSel = 0, palItems = [];
function actions() {
  const tabs = ["Roadmap", "Docs Hub", "Projects", "Interview Q&A", "Profile"], icons = ["bi-map", "bi-collection", "bi-folder2-open", "bi-patch-question", "bi-person-circle"];
  const a = tabs.map((t, i) => ({ g: "Go to", t: t, s: "Open the " + t + " section", i: icons[i], run: () => tabBtns()[i]?.click() }));
  a.push(
    { g: "Actions", t: "Jump to next day", s: "Scroll to your next pending day", i: "bi-lightning-charge", run: () => { const n = findNextDay(); if (n) goToDay(n); } },
    { g: "Actions", t: "Add a quick note", s: "Open the notes panel", i: "bi-sticky", run: () => { if (innerWidth < 1300) toggleNotesDrawer(true); const f = $("quick-note-form"); if (f && f.style.display !== "block") toggleQuickNoteForm(); } },
    { g: "Actions", t: "Start focus timer", s: "25-minute Pomodoro session", i: "bi-stopwatch", run: () => { toggleTimerPop(true); if (!T.running) toggleTimer(); } },
    { g: "Actions", t: "Toggle dark / light theme", s: "Switch appearance", i: "bi-moon-stars", run: toggleTheme },
    { g: "Actions", t: "Expand all weeks", s: "Roadmap", i: "bi-arrows-expand", run: () => { showRoadmapTab(); setAllWeeks(true); } },
    { g: "Actions", t: "Collapse all weeks", s: "Roadmap", i: "bi-arrows-collapse", run: () => { showRoadmapTab(); setAllWeeks(false); } },
    { g: "Actions", t: "Open leaderboard", s: "Community page", i: "bi-trophy", run: () => { location.href = "community.html"; } },
    { g: "Actions", t: "Show my level & XP", s: "Royal rank and progress to the next one", i: "bi-gem", run: showLevel },
    { g: "Actions", t: "Keyboard shortcuts", s: "See every shortcut", i: "bi-keyboard", run: showShortcuts },
    { g: "Actions", t: "Larger text", s: "Make everything easier to read", i: "bi-type", run: () => setFont(+1) },
    { g: "Actions", t: "Smaller text", s: "Fit more on screen", i: "bi-fonts", run: () => setFont(-1) },
    { g: "Actions", t: "Reset text size", s: "Back to default", i: "bi-arrow-counterclockwise", run: () => setFont(0) },
    { g: "Actions", t: "Sync now", s: "Save changes to the cloud", i: "bi-cloud-arrow-up", run: () => syncNow() },
    { g: "Actions", t: "Sign out", s: "Leave this account", i: "bi-box-arrow-right", run: () => signOutUser() }
  );
  return a;
}
function allDays() {
  const out = [];
  PHASES.forEach(ph => ph.weeks.forEach(w => w.days.forEach(d => out.push({ g: "Roadmap days", t: `Day ${d.n} — ${d.topic}`, s: d.desc, i: done.has(d.n) ? "bi-check-circle-fill" : "bi-circle", r: w.week, hay: (`day ${d.n} ${d.topic} ${d.desc} ${w.title}`).toLowerCase(), run: () => goToDay(d.n) }))));
  return out;
}
function palSearch(q) {
  q = q.trim().toLowerCase(); const acts = actions();
  if (!q) { const nx = allDays().filter(x => x.i === "bi-circle").slice(0, 4); return [...acts.slice(0, 5), ...acts.slice(5, 9), ...nx]; }
  const toks = q.split(/\s+/);
  const score = it => { const h = (it.hay || (it.t + " " + it.s).toLowerCase()); if (!toks.every(k => h.includes(k))) return -1; return (it.t.toLowerCase().includes(q) ? 10 : 0) + (it.t.toLowerCase().startsWith(q) ? 5 : 0) + 1; };
  return [...acts, ...allDays()].map(it => [score(it), it]).filter(x => x[0] >= 0).sort((a, b) => b[0] - a[0]).slice(0, 40).map(x => x[1]);
}
function palRender() {
  const q = $("pal-q").value, list = $("pal-list"); palItems = palSearch(q);
  if (!palItems.length) { list.innerHTML = `<div class="pal-empty"><i class="bi bi-search d-block fs-3 mb-2"></i>No results for “${esc(q)}”</div>`; return; }
  let html = "", g = "";
  palItems.forEach((it, i) => {
    if (it.g !== g) { g = it.g; html += `<div class="pal-group">${esc(g)}</div>`; }
    html += `<div class="pal-item ${i === palSel ? "sel" : ""}" data-i="${i}"><span class="pi"><i class="bi ${it.i}"></i></span><div class="pt"><b>${esc(it.t)}</b><small>${esc(it.s)}</small></div>${it.r ? `<span class="pr">${esc(it.r)}</span>` : ""}</div>`;
  });
  list.innerHTML = html;
  list.querySelector(".pal-item.sel")?.scrollIntoView({ block: "nearest" });
}
function palRun(i) { const it = palItems[i]; if (!it) return; closePalette(); setTimeout(it.run, 60); }
function buildPalette() {
  const back = document.createElement("div"); back.className = "pal-back"; back.id = "pal-back";
  back.innerHTML = `<div class="pal" role="dialog" aria-label="Quick search"><div class="pal-input"><i class="bi bi-search"></i><input id="pal-q" placeholder="Search days, jump to a section, run an action…" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div>
    <div class="pal-list" id="pal-list"></div>
    <div class="pal-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> navigate</span><span><kbd>Enter</kbd> select</span><span><kbd>/</kbd> search this page</span><span><kbd>Ctrl</kbd>+<kbd>K</kbd> open anywhere</span></div></div>`;
  document.body.appendChild(back);
  back.addEventListener("mousedown", e => { if (e.target === back) closePalette(); });
  $("pal-q").addEventListener("input", () => { palSel = 0; palRender(); });
  $("pal-list").addEventListener("click", e => { const it = e.target.closest(".pal-item"); if (it) palRun(+it.dataset.i); });
  $("pal-list").addEventListener("mousemove", e => { const it = e.target.closest(".pal-item"); if (it && +it.dataset.i !== palSel) { palSel = +it.dataset.i; $("pal-list").querySelectorAll(".pal-item").forEach(x => x.classList.toggle("sel", +x.dataset.i === palSel)); } });
  $("pal-q").addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); palSel = Math.min(palItems.length - 1, palSel + 1); palRender(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); palSel = Math.max(0, palSel - 1); palRender(); }
    else if (e.key === "Enter") { e.preventDefault(); palRun(palSel); }
  });
}
function openPalette() { if (!$("pal-back")) buildPalette(); $("pal-back").classList.add("show"); $("pal-q").value = ""; palSel = 0; palRender(); setTimeout(() => $("pal-q").focus(), 30); }
function closePalette() { $("pal-back")?.classList.remove("show"); }
$("open-palette")?.addEventListener("click", openPalette);

// ---------------------------------------------------------------- keyboard shortcuts
function currentSearchInput() {
  const vis = id => $(id) && $(id).style.display !== "none";
  if (vis("tab-roadmap")) return $("search-box");
  if (vis("tab-author")) return $("docs-search-input");
  if (vis("tab-interview")) return $("qa-search-input");
  return null;
}
addEventListener("keydown", e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("pal-back")?.classList.contains("show") ? closePalette() : openPalette(); return; }
  if (e.key === "Escape") { closePalette(); $("sc-back")?.classList.remove("show"); $("speed-dial")?.classList.remove("open"); $("sd-scrim")?.classList.remove("show"); toggleTimerPop(false); if ($("notes-sidebar")?.classList.contains("open")) toggleNotesDrawer(false); return; }
  if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.key === "?") { e.preventDefault(); showShortcuts(); return; }
    if (e.key === "n") { e.preventDefault(); if (innerWidth < 1300) toggleNotesDrawer(true); const f = $("quick-note-form"); if (f && f.style.display !== "block") toggleQuickNoteForm(); return; }
    if (e.key === "d") { toggleTheme(); return; }
    if (e.key === "f") { toggleTimerPop(); return; }
  }
  if (!typing && e.key === "/" && !e.ctrlKey && !e.metaKey) { const s = currentSearchInput(); if (s) { e.preventDefault(); s.focus(); s.select?.(); } }
});


// ================================================================ NEW FEATURES
// ---------- helpers: log, streak, xp, level
function doneLog() { try { return JSON.parse(localStorage.getItem("dotnet_done_log") || "{}"); } catch (e) { return {}; } }
function streaks() {
  const counts = {}; Object.values(doneLog()).forEach(d => { if (d !== "legacy") counts[d] = 1; });
  const days = Object.keys(counts).sort(); let best = 0, run = 0, prev = null;
  const gap = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);
  days.forEach(d => { run = prev && gap(prev, d) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; });
  return { best };
}
function focusSessions() { let n = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("dn_focus_")) n += +localStorage.getItem(k) || 0; } return n; }
function notesCount() { try { return Object.keys(dayNotes || {}).length; } catch (e) { return 0; } }
const getPins = () => { try { return JSON.parse(localStorage.getItem("dotnet_pins") || "[]"); } catch (e) { return []; } };
const LEVELS = [["Page", 0], ["Squire", 100], ["Knight", 300], ["Baron", 600], ["Duke", 1000], ["Prince", 1500], ["King", 2200], ["Emperor", 3000]];
function xpInfo() {
  const xp = done.size * 10 + notesCount() * 5 + focusSessions() * 3;
  let lv = 0; LEVELS.forEach((l, i) => { if (xp >= l[1]) lv = i; });
  const next = LEVELS[lv + 1];
  return { xp, lv, name: LEVELS[lv][0], next, pct: next ? Math.round((xp - LEVELS[lv][1]) / (next[1] - LEVELS[lv][1]) * 100) : 100 };
}
function paintLevel() {
  const hostEyebrow = document.querySelector(".hero .eyebrow"); if (!hostEyebrow) return;
  let chip = $("level-chip");
  if (!chip) { chip = document.createElement("button"); chip.id = "level-chip"; chip.type = "button"; chip.className = "level-chip"; chip.onclick = showLevel; hostEyebrow.insertAdjacentElement("afterend", chip); }
  const x = xpInfo();
  chip.innerHTML = `<i class="bi bi-gem"></i><b>${x.name}</b><span>Lv ${x.lv + 1} · ${x.xp} XP</span>`;
  chip.title = x.next ? `${x.next[1] - x.xp} XP to ${x.next[0]}` : "Maximum rank reached";
}
function showLevel() {
  const x = xpInfo();
  openModal(`<div class="lvl-modal"><h5><i class="bi bi-gem me-2" style="color:var(--gold)"></i>${x.name} · Level ${x.lv + 1}</h5>
    <p class="small text-muted mb-2">${x.xp} XP earned — 10 per day completed, 5 per note, 3 per focus session.</p>
    <div class="progress-bar-main"><div class="fill" style="width:${x.pct}%;background:linear-gradient(90deg,var(--gold),var(--gold-3))"></div></div>
    <div class="small text-muted mt-1">${x.next ? `${x.next[1] - x.xp} XP to ${x.next[0]}` : "You have reached the highest rank 👑"}</div>
    <ul class="lvl-ladder">${LEVELS.map((l, i) => `<li class="${i === x.lv ? "cur" : i > x.lv ? "lock" : ""}"><i class="bi ${i <= x.lv ? "bi-check-circle-fill" : "bi-lock"}" style="color:${i <= x.lv ? "var(--gold)" : "var(--muted)"}"></i>${l[0]}<span>${l[1]} XP</span></li>`).join("")}</ul>
    <button class="btn btn-outline-secondary btn-sm mt-3" onclick="closeModal()">Close</button></div>`);
}

// ---------- pins (starred days) + phase navigator
function togglePin(n) {
  let pins = getPins(); pins = pins.includes(n) ? pins.filter(x => x !== n) : [...pins, n];
  localStorage.setItem("dotnet_pins", JSON.stringify(pins));       // synced like every other dotnet_* key
  document.querySelectorAll(`.day-row[data-day="${n}"] .pin-btn`).forEach(b => { const on = pins.includes(n); b.classList.toggle("on", on); b.firstElementChild.className = "bi bi-star" + (on ? "-fill" : ""); });
  renderPins(); toast(pins.includes(n) ? "Day pinned ⭐" : "Pin removed", "bi-star-fill");
}
function decorateDays() {
  const pins = getPins();
  document.querySelectorAll("#phases-container .day-row").forEach(r => {
    if (r.querySelector(".pin-btn")) return;
    const n = +r.dataset.day, on = pins.includes(n), b = document.createElement("button");
    b.type = "button"; b.className = "pin-btn" + (on ? " on" : ""); b.title = "Pin this day"; b.setAttribute("aria-label", "Pin day " + n);
    b.innerHTML = `<i class="bi bi-star${on ? "-fill" : ""}"></i>`; b.onclick = e => { e.stopPropagation(); togglePin(n); };
    const nb = r.querySelector(".day-note-btn"); nb ? r.insertBefore(b, nb) : r.appendChild(b);
  });
}
function quickRow(id, before) {
  let el = $(id); if (!el) { el = document.createElement("div"); el.id = id; el.className = "quick-row"; before.parentNode.insertBefore(el, before); } return el;
}
function renderPins() {
  const anchor = document.querySelector("#tab-roadmap .toolbar"); if (!anchor) return;
  const host = quickRow("pin-strip", anchor), pins = getPins().filter(n => dayInfo(n));
  if (!pins.length) { host.style.display = "none"; host.innerHTML = ""; return; }
  host.style.display = "";
  host.innerHTML = `<span class="qr-label"><i class="bi bi-star-fill"></i>Pinned</span>` + pins.map(n => { const { d } = dayInfo(n); return `<button class="chip-btn ${done.has(n) ? "done" : ""}" onclick="UI.goToDay(${n})"><i class="bi bi-star-fill"></i>Day ${n} · ${esc(d.topic.length > 24 ? d.topic.slice(0, 23) + "…" : d.topic)}</button>`; }).join("");
}
function renderPhaseNav() {
  const anchor = document.querySelector("#tab-roadmap .toolbar"); if (!anchor) return;
  const host = quickRow("phase-nav", anchor);
  host.innerHTML = `<span class="qr-label"><i class="bi bi-compass"></i>Jump to</span>` + PHASES.map((ph, i) => {
    let t = 0, d = 0; ph.weeks.forEach(w => w.days.forEach(x => { t++; if (done.has(x.n)) d++; }));
    return `<button class="chip-btn" onclick="UI.goToPhase('${ph.id}')"><span class="dot" style="background:${ph.color}"></span>${esc(ph.title.split("—")[0].trim())}<small>${Math.round(d / t * 100)}%</small></button>`;
  }).join("");
}
function goToPhase(id) {
  showRoadmapTab(); const body = $("body-" + id); if (!body) return;
  if (body.style.display === "none") togglePhase(id);
  body.closest(".phase-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- achievements (shown on Profile > Overview)
function badges() {
  const pct = done.size / TOTAL * 100, st = streaks().best, notes = notesCount(), fs = focusSessions(), pins = getPins().length;
  return [
    ["bi-flag", "First Step", "Complete 1 day", done.size >= 1], ["bi-fire", "On a Roll", "Complete 10 days", done.size >= 10],
    ["bi-shield-check", "Quarter Way", "25% complete", pct >= 25], ["bi-gem", "Halfway Hero", "50% complete", pct >= 50],
    ["bi-award", "Final Stretch", "75% complete", pct >= 75], ["bi-trophy-fill", "Roadmap Royalty", "100% complete", pct >= 100],
    ["bi-lightning-charge", "3-Day Streak", "3 days in a row", st >= 3], ["bi-lightning-charge-fill", "Week Warrior", "7 days in a row", st >= 7],
    ["bi-calendar2-heart", "Fortnight Focus", "14 days in a row", st >= 14], ["bi-bullseye", "Monthly Master", "30 days in a row", st >= 30],
    ["bi-sticky-fill", "Scribe", "Write 5 notes", notes >= 5], ["bi-journal-richtext", "Chronicler", "Write 25 notes", notes >= 25],
    ["bi-stopwatch", "Deep Worker", "5 focus sessions", fs >= 5], ["bi-hourglass-split", "Marathoner", "25 focus sessions", fs >= 25],
    ["bi-star-fill", "Curator", "Pin 3 days", pins >= 3]
  ];
}
function badgesCard() {
  const b = badges(), got = b.filter(x => x[3]).length;
  return `<div class="phase-card mb-3" style="padding:1rem"><h6 class="fw-bold mb-3" style="font-size:.9rem"><i class="bi bi-award me-2" style="color:var(--gold)"></i>Achievements <span class="text-muted fw-normal">· ${got}/${b.length} earned</span></h6>
    <div class="badge-grid">${b.map(x => `<div class="badge-tile ${x[3] ? "on" : ""}"><div class="bi-ic"><i class="bi ${x[0]}"></i></div><b>${x[1]}</b><small>${x[2]}</small></div>`).join("")}</div></div>`;
}
const baseProfile = window.renderProfile;
window.renderProfile = function () {
  baseProfile.apply(this, arguments);
  const c = $("profile-container"); if (c?.children[0]) c.children[0].insertAdjacentHTML("afterend", badgesCard());
};

// ---------- speed dial (quick actions, thumb-friendly)
function buildDial() {
  const stack = document.querySelector(".fab-stack"); if (!stack || $("speed-dial")) return;
  const scrim = document.createElement("div"); scrim.id = "sd-scrim"; scrim.className = "sd-scrim"; document.body.appendChild(scrim);
  const d = document.createElement("div"); d.id = "speed-dial"; d.className = "speed-dial";
  const items = [
    ["bi-check2-circle", "Complete next day", () => { const n = findNextDay(); if (n) { complete(n); toast("Day " + n + " completed ✔"); } }],
    ["bi-sticky", "Quick note", () => { if (innerWidth < 1300) toggleNotesDrawer(true); const f = $("quick-note-form"); if (f && f.style.display !== "block") toggleQuickNoteForm(); }],
    ["bi-stopwatch", "Focus timer", () => toggleTimerPop(true)],
    ["bi-search", "Search everything", openPalette]
  ];
  d.innerHTML = `<div class="sd-menu">${items.map((x, i) => `<button class="sd-item" data-i="${i}"><span>${x[1]}</span><i class="bi ${x[0]}"></i></button>`).join("")}</div><button class="sd-main" aria-label="Quick actions" aria-expanded="false"><i class="bi bi-plus-lg"></i></button>`;
  stack.insertBefore(d, stack.firstChild);
  const set = on => { d.classList.toggle("open", on); scrim.classList.toggle("show", on); d.querySelector(".sd-main").setAttribute("aria-expanded", on); };
  d.querySelector(".sd-main").onclick = () => set(!d.classList.contains("open"));
  scrim.onclick = () => set(false);
  d.querySelectorAll(".sd-item").forEach(b => b.onclick = () => { set(false); setTimeout(items[+b.dataset.i][2], 80); });
}

// ---------- keyboard shortcuts sheet
function showShortcuts() {
  let b = $("sc-back");
  if (!b) {
    b = document.createElement("div"); b.id = "sc-back"; b.className = "pal-back";
    const rows = [["Quick search / command palette", "Ctrl / ⌘ + K"], ["Search on the current tab", "/"], ["New quick note", "N"], ["Focus timer", "F"], ["Dark / light theme", "D"], ["Show this sheet", "?"], ["Close anything", "Esc"]];
    b.innerHTML = `<div class="pal" role="dialog" aria-label="Keyboard shortcuts"><div class="pal-input"><i class="bi bi-keyboard"></i><b style="flex:1;font-family:var(--display);font-size:1.05rem">Keyboard shortcuts</b><kbd>Esc</kbd></div><div class="sc-list">${rows.map(r => `<div><span>${r[0]}</span><kbd>${r[1]}</kbd></div>`).join("")}</div></div>`;
    b.addEventListener("mousedown", e => { if (e.target === b) b.classList.remove("show"); });
    document.body.appendChild(b);
  }
  b.classList.add("show");
}

// ---------- text size (accessibility) + daily thought
function setFont(dir) {
  let v = lsGet("dn_fs", 100); v = dir === 0 ? 100 : Math.max(88, Math.min(130, v + dir * 6));
  lsSet("dn_fs", v); root.style.fontSize = v + "%"; toast(dir === 0 ? "Text size reset" : `Text size ${v}%`, "bi-fonts");
}
root.style.fontSize = lsGet("dn_fs", 100) + "%";
const THOUGHTS = [
  "A crown is earned one small, steady day at a time.", "Every line of code you write today is a brick in your kingdom.",
  "Discipline is the quiet engine behind every great developer.", "Progress, not perfection, rules this realm.",
  "Today's practice is tomorrow's confidence.", "Stand up, sit down, ship something — repeat.",
  "The best architects started with a single console app.", "Curiosity is the royal road to mastery.",
  "Debug with patience; every bug is a lesson in disguise.", "Consistency beats intensity — keep the streak alive.",
  "Great engineers read more code than they write.", "Rest is part of the plan; return sharper.",
  "You are closer to the throne than you were yesterday.", "Build, break, learn, rebuild."
];
(function dailyThought() { const el = document.querySelector(".hero-sub"); if (!el) return; const d = Math.floor(Date.now() / 864e5); el.textContent = "“" + THOUGHTS[d % THOUGHTS.length] + "”"; })();

// ---------------------------------------------------------------- public handle + init
window.UI = { goToDay, goToPhase, complete, toast, confetti, setTheme, openPalette, togglePin, showLevel };

// the Docs Hub filter dropdown is only meaningful for community docs; sync its visibility on load
if (typeof filterDocsHub === "function") try { filterDocsHub(); } catch (e) { /* tab not rendered yet */ }

greet(); paintProgress(); renderUpNext(); decorateDays(); renderPins(); renderPhaseNav(); buildDial();
const savedTab = lsGet("dn_tab", 0);
if (savedTab > 0 && tabBtns()[savedTab]) tabBtns()[savedTab].click();