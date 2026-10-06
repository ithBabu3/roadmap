// Extra features layered on top of app.js: streaks & daily goal, analytics, reminders,
// avatar/theme, public profile sharing, password change / account deletion, PWA install.
import { Cloud } from "./cloud-store.js";
import { Community } from "./community.js";
import { reauth, changePassword, removeAccount, passwordScore, friendlyError } from "./auth.js";
import { canInstall, installApp } from "./pwa.js";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = () => ymd(new Date());
const gap = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);
const EMOJIS = ["🧑‍💻", "🚀", "🦊", "🐼", "🦉", "🐙", "🔥", "⚡", "🎯", "🌟", "🧠", "🦄"];
const COLORS = ["#4f46e5", "#0891b2", "#16a34a", "#d97706", "#dc2626", "#db2777", "#7c3aed", "#0f766e"];

// ---------- completion log (date each day was finished) ----------
function syncLog() {
  const first = localStorage.getItem("dotnet_done_log") === null;
  const log = read("dotnet_done_log", {}), t = today(); let ch = first;
  done.forEach(n => { if (!(n in log)) { log[n] = first ? "legacy" : t; ch = true; } });   // pre-existing days have no date
  Object.keys(log).forEach(n => { if (!done.has(+n) && !done.has(n)) { delete log[n]; ch = true; } });
  if (ch) write("dotnet_done_log", log);
  return log;
}
function stats() {
  const log = syncLog(), counts = {};
  Object.values(log).forEach(d => { if (d !== "legacy") counts[d] = (counts[d] || 0) + 1; });
  let best = 0, run = 0, prev = null;
  Object.keys(counts).sort().forEach(d => { run = prev && gap(prev, d) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; });
  let cur = 0, d = new Date(); if (!counts[ymd(d)]) d = addDays(d, -1);
  while (counts[ymd(d)]) { cur++; d = addDays(d, -1); }
  const goal = read("dotnet_goal", 1), todayN = counts[today()] || 0;
  return { counts, cur, best, goal, todayN, total: done.size, legacy: Object.values(log).filter(v => v === "legacy").length };
}

// ---------- toast ----------
function toast(msg) {
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1e1b4b;color:#fff;padding:10px 18px;border-radius:24px;font-size:.85rem;z-index:6000;box-shadow:0 6px 20px rgba(0,0,0,.25)";
  document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
}

// ---------- avatar + accent ----------
const avatar = () => read("dotnet_avatar", { e: "🧑‍💻", c: "#4f46e5" });
function applyLook() {
  const a = avatar(), el = $("nav-avatar");
  if (el) { el.textContent = a.e; el.style.background = a.c; }
  const accent = read("dotnet_prefs", {}).accent; if (accent) document.documentElement.style.setProperty("--primary", accent);
}

// ---------- streak strip on the Roadmap tab ----------
function renderStrip() {
  const host = $("roadmap-greeting"); if (!host) return;
  let el = $("goal-strip"); if (!el) { el = document.createElement("div"); el.id = "goal-strip"; host.after(el); }
  const s = stats(), pct = Math.min(100, Math.round(s.todayN / s.goal * 100));
  el.innerHTML = `<span style="font-size:1.05rem">🔥 <b>${s.cur}</b>-day streak</span>
    <div class="gs-bar"><div class="small text-muted">Today's goal: <b>${s.todayN}/${s.goal}</b> ${s.todayN >= s.goal ? "✅" : ""}</div>
    <div class="progress-bar-main"><div class="fill" style="width:${pct}%"></div></div></div>
    <span class="small text-muted">Best ${s.best}</span>
    <button class="btn btn-sm btn-outline-primary" onclick="showTab('profile', document.querySelectorAll('.tab-btn-nav')[4])"><i class="bi bi-graph-up me-1"></i>Insights</button>`;
}

// ---------- public profile ----------
let pubTimer = null;
function schedulePublish() {
  if (!read("dotnet_share", {}).on || !Cloud.user) return;
  clearTimeout(pubTimer);
  pubTimer = setTimeout(() => {
    const s = stats(), a = avatar();
    Community.publish({ uid: Cloud.user.uid, username: Cloud.user.username, name: localStorage.getItem("dotnet_display_name") || Cloud.user.username,
      emoji: a.e, color: a.c, done: s.total, total: TOTAL, streak: s.cur, best: s.best }).catch(e => console.warn("publish failed", e));
  }, 3000);
}

// ---------- reminders (while the app is open or installed & running) ----------
async function notify(title, body) {
  const reg = await navigator.serviceWorker?.getRegistration();
  if (reg) reg.showNotification(title, { body, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "daily-goal" });
  else new Notification(title, { body });
}
setInterval(() => {
  const r = read("dotnet_reminder", {});
  if (!r.on || !("Notification" in window) || Notification.permission !== "granted") return;
  const now = new Date(), hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (hhmm < (r.time || "20:00") || localStorage.getItem("dn_last_reminder") === today()) return;
  const s = stats(); if (s.todayN >= s.goal) return;
  localStorage.setItem("dn_last_reminder", today());
  notify("Keep your streak alive 🔥", `You've done ${s.todayN}/${s.goal} today. One more day of the roadmap?`);
}, 30000);

// ---------- charts ----------
function weeklyChart(counts, goal) {
  const mon = d => addDays(d, -((d.getDay() + 6) % 7)), start = addDays(mon(new Date()), -49), weeks = [];
  for (let w = 0; w < 8; w++) { let n = 0; for (let i = 0; i < 7; i++) n += counts[ymd(addDays(start, w * 7 + i))] || 0; weeks.push({ n, d: addDays(start, w * 7) }); }
  const max = Math.max(goal * 7, ...weeks.map(w => w.n), 1);
  const bars = weeks.map((w, i) => { const h = Math.round(w.n / max * 80), x = 10 + i * 38;
    return `<rect x="${x}" y="${100 - h}" width="28" height="${h}" rx="5" fill="var(--primary)" opacity="${i === 7 ? 1 : .55}"/>
      <text x="${x + 14}" y="${95 - h}" font-size="10" text-anchor="middle" fill="#6b7280">${w.n || ""}</text>
      <text x="${x + 14}" y="116" font-size="9" text-anchor="middle" fill="#9ca3af">${w.d.getDate()}/${w.d.getMonth() + 1}</text>`; }).join("");
  return `<svg class="ins-chart" viewBox="0 0 320 124" role="img" aria-label="Days completed per week">${bars}</svg>`;
}
function heatmap(counts) {
  const mon = d => addDays(d, -((d.getDay() + 6) % 7)), start = addDays(mon(new Date()), -77), now = ymd(new Date()); let cells = "";
  for (let w = 0; w < 12; w++) for (let i = 0; i < 7; i++) {
    const d = addDays(start, w * 7 + i), k = ymd(d); if (k > now) continue;
    const n = counts[k] || 0, col = n === 0 ? "#ede9fe" : n === 1 ? "#c4b5fd" : n === 2 ? "#8b5cf6" : "var(--primary)";
    cells += `<rect x="${w * 17}" y="${i * 17}" width="14" height="14" rx="3" fill="${col}"><title>${k}: ${n} day${n === 1 ? "" : "s"}</title></rect>`; }
  return `<svg class="ins-chart" viewBox="0 0 204 118" role="img" aria-label="Activity over the last 12 weeks">${cells}</svg>`;
}
function insightsCard() {
  const s = stats(), last28 = Array.from({ length: 28 }, (_, i) => s.counts[ymd(addDays(new Date(), -i))] || 0).reduce((a, b) => a + b, 0);
  const rate = last28 / 28, left = TOTAL - s.total;
  const eta = left <= 0 ? "Done 🎉" : rate > 0 ? addDays(new Date(), Math.ceil(left / rate)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
  const tile = (n, l, bg, c) => `<div class="col-6 col-md-3"><div class="stat-box" style="background:${bg};padding:.7rem"><div class="num" style="color:${c};font-size:1.2rem">${n}</div><div class="lbl">${l}</div></div></div>`;
  return `<div class="phase-card mb-3" style="padding:1rem"><h6 class="fw-bold mb-2" style="font-size:.85rem"><i class="bi bi-graph-up me-2 text-primary"></i>Insights</h6>
    <div class="row g-2 mb-3">${tile(Math.round(s.total / TOTAL * 100) + "%", "Complete", "#f5f4ff", "#4f46e5")}${tile(s.cur, "Current streak", "#fff7ed", "#ea580c")}
      ${tile(s.best, "Best streak", "#f0f9ff", "#0891b2")}${tile((last28 / 4).toFixed(1), "Days / week (4 wk)", "#f0fdf4", "#16a34a")}</div>
    <div class="small fw-semibold mb-1">Days completed per week</div>${weeklyChart(s.counts, s.goal)}
    <div class="small fw-semibold mt-3 mb-1">Last 12 weeks</div><div style="max-width:300px">${heatmap(s.counts)}</div>
    <p class="small mt-3 mb-0">At your recent pace you'd finish around <b>${eta}</b>.${s.legacy ? ` <span class="text-muted">(${s.legacy} earlier day${s.legacy > 1 ? "s were" : " was"} completed before dates were tracked.)</span>` : ""}</p></div>`;
}

// ---------- settings cards ----------
const card = (title, icon, inner) => `<div class="phase-card mb-3" style="padding:1rem"><h6 class="fw-bold mb-2" style="font-size:.85rem"><i class="bi ${icon} me-2 text-primary"></i>${title}</h6>${inner}</div>`;
function looksCard() {
  const a = avatar(), acc = read("dotnet_prefs", {}).accent || COLORS[0];
  return card("Avatar & look", "bi-emoji-smile", `
    <div class="d-flex align-items-center gap-2 mb-2"><span class="nav-av" style="width:44px;height:44px;font-size:1.5rem;background:${a.c}">${a.e}</span><span class="small text-muted">@${esc(Cloud.user.username)}</span></div>
    <div class="small text-muted mb-1">Emoji</div><div class="d-flex flex-wrap gap-1 mb-2">${EMOJIS.map(e => `<button class="sw ${e === a.e ? "sel" : ""}" onclick="F.avatar('e','${e}')">${e}</button>`).join("")}</div>
    <div class="small text-muted mb-1">Avatar colour</div><div class="d-flex flex-wrap gap-1 mb-2">${COLORS.map(c => `<button class="sw ${c === a.c ? "sel" : ""}" style="background:${c}" onclick="F.avatar('c','${c}')" aria-label="${c}"></button>`).join("")}</div>
    <div class="small text-muted mb-1">App accent colour</div><div class="d-flex flex-wrap gap-1">${COLORS.map(c => `<button class="sw ${c === acc ? "sel" : ""}" style="background:${c}" onclick="F.accent('${c}')" aria-label="${c}"></button>`).join("")}</div>`);
}
function goalCard() {
  const g = read("dotnet_goal", 1), r = read("dotnet_reminder", { on: false, time: "20:00" });
  return card("Daily goal & reminder", "bi-bullseye", `
    <div class="d-flex align-items-center gap-2 mb-3 flex-wrap"><label class="small mb-0">Days to complete per day</label>
      <select class="form-select form-select-sm" style="width:80px" onchange="F.goal(this.value)">${[1, 2, 3, 4, 5].map(n => `<option ${n === g ? "selected" : ""}>${n}</option>`).join("")}</select></div>
    <div class="d-flex align-items-center gap-2 flex-wrap"><div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" id="rem-on" ${r.on ? "checked" : ""} onchange="F.reminder()"><label class="form-check-label small" for="rem-on">Remind me at</label></div>
      <input type="time" id="rem-time" class="form-control form-control-sm" style="width:120px" value="${r.time}" onchange="F.reminder()">
      <button class="btn btn-sm btn-outline-secondary" onclick="F.testNotify()">Test</button></div>
    <p class="small text-muted mt-2 mb-0" id="rem-msg">Reminders fire while the app is open or installed and running (no server push).</p>`);
}
function shareCard() {
  const on = read("dotnet_share", {}).on, link = Community.link(Cloud.user.username);
  return card("Community & sharing", "bi-trophy", `
    <div class="form-check form-switch mb-2"><input class="form-check-input" type="checkbox" id="share-on" ${on ? "checked" : ""} onchange="F.share()"><label class="form-check-label small" for="share-on">Show me on the leaderboard and make my progress link public</label></div>
    <p class="small text-muted mb-2">Shares only your name, avatar, days done and streak — never notes or files.</p>
    <div class="input-group input-group-sm mb-2" ${on ? "" : 'style="display:none"'} id="share-link-wrap"><input class="form-control" readonly value="${esc(link)}" id="share-link"><button class="btn btn-outline-primary" onclick="F.copy()">Copy</button></div>
    <a class="btn btn-sm btn-outline-primary" href="community.html"><i class="bi bi-trophy me-1"></i>Open leaderboard</a>`);
}
function securityCard() {
  const inp = (id, ph, ac) => `<input type="password" id="${id}" class="form-control form-control-sm mb-2" placeholder="${ph}" autocomplete="${ac}">`;
  return card("Account & security", "bi-shield-lock", `
    <div class="small fw-semibold mb-1">Change password</div>${inp("pw-cur", "Current password", "current-password")}${inp("pw-new", "New password (8+ chars, with a number)", "new-password")}
    <div class="pw-meter" id="pw-meter"><i></i><i></i><i></i><i></i></div>
    <button class="btn btn-sm btn-primary" onclick="F.changePw()">Update password</button><div class="small mt-2" id="pw-msg"></div>
    <hr><div class="small fw-semibold mb-1 text-danger">Delete account</div>
    <p class="small text-muted mb-2">Permanently deletes your login, all progress, notes, uploads and public profile.</p>
    ${inp("del-pw", "Your password", "current-password")}<input id="del-confirm" class="form-control form-control-sm mb-2" placeholder='Type DELETE to confirm'>
    <button class="btn btn-sm btn-outline-danger" onclick="F.deleteAcct()">Delete my account</button><div class="small mt-2" id="del-msg"></div>`);
}
function appCard() {
  return card("App & offline", "bi-phone", `<p class="small text-muted mb-2">Install it like a native app. After the first load it opens offline; changes sync when you're back online.</p>
    <button class="btn btn-sm btn-outline-primary" id="install-btn" onclick="F.install()" ${canInstall() ? "" : "disabled"}><i class="bi bi-download me-1"></i>${canInstall() ? "Install app" : "Install via your browser menu"}</button>`);
}

// ---------- handlers ----------
const msg = (id, text, ok) => { const e = $(id); if (e) { e.textContent = text; e.style.color = ok ? "#16a34a" : "#dc2626"; } };
window.F = {
  avatar(k, v) { const a = avatar(); a[k] = v; write("dotnet_avatar", a); applyLook(); renderProfile(); schedulePublish(); },
  accent(c) { write("dotnet_prefs", { ...read("dotnet_prefs", {}), accent: c }); applyLook(); renderProfile(); },
  goal(v) { write("dotnet_goal", +v); renderStrip(); },
  async reminder() {
    const on = $("rem-on").checked, time = $("rem-time").value || "20:00";
    if (on) {
      if (!("Notification" in window)) { $("rem-on").checked = false; return msg("rem-msg", "This browser doesn't support notifications.", false); }
      if (Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted") { $("rem-on").checked = false; return msg("rem-msg", "Notifications are blocked — allow them in your browser settings.", false); }
    }
    write("dotnet_reminder", { on, time }); msg("rem-msg", on ? `Reminder set for ${time} (only if today's goal isn't met).` : "Reminder off.", true);
  },
  async testNotify() {
    if (!("Notification" in window)) return msg("rem-msg", "Notifications aren't supported here.", false);
    if (Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted") return msg("rem-msg", "Notifications are blocked.", false);
    notify("It works 🎉", "Daily reminders will look like this.");
  },
  async share() {
    const on = $("share-on").checked; write("dotnet_share", { on }); $("share-link-wrap").style.display = on ? "flex" : "none";
    try { if (on) { schedulePublish(); toast("You're on the leaderboard"); } else await Community.remove(Cloud.user.username); } catch (e) { console.warn(e); toast("Couldn't update sharing"); }
  },
  copy() { navigator.clipboard?.writeText($("share-link").value); toast("Link copied"); },
  async changePw() {
    try { await changePassword($("pw-cur").value, $("pw-new").value); msg("pw-msg", "Password updated.", true); $("pw-cur").value = $("pw-new").value = ""; }
    catch (e) { msg("pw-msg", friendlyError(e), false); }
  },
  async deleteAcct() {
    if ($("del-confirm").value !== "DELETE") return msg("del-msg", "Type DELETE to confirm.", false);
    try {
      await reauth($("del-pw").value);
      await Community.remove(Cloud.user.username).catch(() => {});
      await Cloud.deleteAllData(); await removeAccount(); Cloud.wipeLocal(); location.replace("login.html");
    } catch (e) { msg("del-msg", friendlyError(e), false); }
  },
  async install() { if (await installApp()) toast("Installed 🎉"); }
};

// ---------- wire into app.js ----------
const baseRender = window.renderProfile;
window.renderProfile = function () {
  baseRender();
  const c = $("profile-container"); if (!c || !c.children[0]) return;
  c.children[0].insertAdjacentHTML("afterend", insightsCard() + goalCard() + looksCard() + shareCard() + appCard() + securityCard());
  $("pw-new")?.addEventListener("input", e => { const sc = passwordScore(e.target.value, Cloud.user.username);
    document.querySelectorAll("#pw-meter i").forEach((el, i) => { el.style.background = i < sc ? ["#dc2626", "#d97706", "#65a30d", "#16a34a"][sc - 1] : "#e5e7eb"; }); });
};
const baseSave = window.save;
window.save = function () {
  const before = stats().todayN; baseSave.apply(this, arguments);
  const s = stats(); renderStrip(); schedulePublish();
  if (before < s.goal && s.todayN >= s.goal) toast("🎯 Daily goal reached!");
};
const baseName = window.saveDisplayName;
window.saveDisplayName = function () { baseName.apply(this, arguments); schedulePublish(); };

const nav = $("nav-username");
if (nav && !$("nav-avatar")) nav.insertAdjacentHTML("beforebegin", '<span class="nav-av" id="nav-avatar"></span>');
document.addEventListener("pwa-installable", () => { const b = $("install-btn"); if (b) { b.disabled = false; b.lastChild.textContent = "Install app"; } });
document.addEventListener("visibilitychange", () => { if (!document.hidden) renderStrip(); });
applyLook(); renderStrip(); schedulePublish();
