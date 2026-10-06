import { Community } from "./community.js";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const avatar = p => `<span class="lb-av" style="background:${esc(p.color || "#4f46e5")}">${esc(p.emoji || "🙂")}</span>`;
const bar = p => { const pct = Math.min(100, Math.round(p.done / (p.total || 175) * 100)); return `<div class="progress-bar-main"><div class="fill" style="width:${pct}%"></div></div><div class="small text-muted mt-1">${p.done}/${p.total || 175} days · ${pct}%</div>`; };

const u = (new URLSearchParams(location.search).get("u") || "").toLowerCase();
(async () => {
  try {
    if (u) {
      const p = await Community.get(u);
      document.getElementById("shared").innerHTML = p
        ? `<div class="phase-card" style="padding:1.1rem"><div class="d-flex align-items-center gap-3">${avatar(p)}<div class="flex-grow-1"><div class="fw-bold">${esc(p.name)} <span class="text-muted small">@${esc(p.username)}</span></div>
            <div class="small">🔥 ${p.streak}-day streak · best ${p.best || p.streak}</div></div></div><div class="mt-3">${bar(p)}</div></div>`
        : `<div class="alert alert-warning small">No public profile for <b>@${esc(u)}</b> (sharing may be turned off).</div>`;
    }
    const list = await Community.top(25);
    document.getElementById("board").innerHTML = list.length ? list.map((p, i) => `
      <div class="phase-card lb-row ${p.username === u ? "lb-me" : ""}"><div class="d-flex align-items-center gap-3">
        <div class="lb-rank">${["🥇","🥈","🥉"][i] || i + 1}</div>${avatar(p)}
        <div class="flex-grow-1" style="min-width:0"><a class="fw-bold text-decoration-none" href="?u=${encodeURIComponent(p.username)}">${esc(p.name)}</a>
          <span class="text-muted small">@${esc(p.username)}</span>${bar(p)}</div>
        <div class="text-end small fw-bold" style="white-space:nowrap">🔥 ${p.streak}</div></div></div>`).join("")
      : `<div class="text-muted small">Nobody has shared their progress yet — be the first from your Profile tab.</div>`;
  } catch (e) {
    console.error(e);
    document.getElementById("board").innerHTML = `<div class="alert alert-danger small">Couldn't load the leaderboard (${esc(e.message)}).</div>`;
  }
})();
