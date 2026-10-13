// Feed tab: everything you have added, as one endless scrolling feed.
// Classic script, loaded right after js/app.js (see js/boot-main.js), so it can use app.js globals.
// Storage (auto-synced to Firebase because the keys start with "dotnet_"):
//   dotnet_feed_posts  posts written directly in the feed
//   dotnet_feed_prefs  which sources/types show, hidden + pinned items, sort order
(function () {
  "use strict";

  const BATCH = 8;
  const $ = id => document.getElementById(id);

  const SOURCES = [
    { key: "posts", label: "My posts",        icon: "bi-pencil-square",     color: "#7c3aed", tab: "feed" },
    { key: "docs",  label: "Docs Hub",        icon: "bi-collection",        color: "#0891b2", tab: "author" },
    { key: "notes", label: "Day notes",       icon: "bi-stickies",          color: "#d97706", tab: "roadmap" },
    { key: "qa",    label: "My Q&A",          icon: "bi-patch-question",    color: "#16a34a", tab: "interview" },
    { key: "adv",   label: "My advanced topics", icon: "bi-lightning-charge-fill", color: "#be123c", tab: "projects" },
    { key: "links", label: "My resource links", icon: "bi-bookmark-star-fill", color: "#0a66c2", tab: "author" },
    { key: "builtin", label: "Built-in Q&A & topics", icon: "bi-journal-bookmark", color: "#6b7280", tab: "interview" },
  ];
  const SRC = Object.fromEntries(SOURCES.map(s => [s.key, s]));
  const POST_TYPES = ["Note", "Link", "Video", "Bullets", "Paragraph"];

  // ---------------- state ----------------
  const read = (k, d) => { try { return typeof lsJSON === "function" ? lsJSON(k, JSON.stringify(d)) : d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { alert("Could not save: browser storage is full."); return false; } };

  let posts = read("dotnet_feed_posts", []);
  if (!Array.isArray(posts)) posts = [];
  let prefs = read("dotnet_feed_prefs", {});
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) prefs = {};
  function normPrefs() {
    prefs.sources = prefs.sources && typeof prefs.sources === "object" ? prefs.sources : {};
    prefs.hidden = Array.isArray(prefs.hidden) ? prefs.hidden : [];
    prefs.pinned = Array.isArray(prefs.pinned) ? prefs.pinned : [];
    prefs.types = Array.isArray(prefs.types) ? prefs.types : [];      // empty = all types
    prefs.cardUrls = Array.isArray(prefs.cardUrls) ? prefs.cardUrls : [];   // links shown as a card instead of an embed
    prefs.previews = prefs.previews !== false;
    prefs.sort = ["new", "old", "shuffle", "source"].includes(prefs.sort) ? prefs.sort : "new";
  }
  normPrefs();
  const savePrefs = () => write("dotnet_feed_prefs", prefs);
  const savePosts = () => write("dotnet_feed_posts", posts);
  const srcOn = k => k in prefs.sources ? !!prefs.sources[k] : k !== "builtin";   // built-ins are off until you ask

  let query = "";
  let items = [];        // filtered + sorted, ready to show
  let shown = 0;
  let editingPostId = null;
  let seed = Date.now();
  let observer = null;

  // ---------------- gather everything ----------------
  const tsFromId = id => { const m = String(id || "").match(/(\d{12,13})(?!.*\d{12,13})/); return m ? Number(m[1]) : 0; };
  const plain = html => { const d = document.createElement("div"); d.innerHTML = String(html || ""); return (d.textContent || "").trim(); };

  function gather() {
    const all = [];
    posts.forEach(p => all.push({ fid: "post:" + p.id, src: "posts", type: p.type || "Note", title: p.title || "", ts: p.ts || tsFromId(p.id),
      summary: p.type === "Bullets" ? "" : p.text || "", points: p.type === "Bullets" ? String(p.text || "").split("\n").map(s => s.trim()).filter(Boolean) : null,
      url: p.url || "", plainBody: true, raw: p }));

    try {
      getAllAuthors().forEach(a => a.items.forEach(it => all.push({ fid: "doc:" + it.id, src: "docs", type: it.type, title: it.title, ts: tsFromId(it.id),
        summary: it.summary, points: it.points, steps: it.steps, url: it.url, mediaKey: it.mediaKey, mediaName: it.mediaName, id: it.id,
        by: a.name, section: it.section || "community", raw: it })));
    } catch (e) { console.error("feed: docs", e); }

    try {
      Object.keys(dayNotes || {}).forEach(n => {
        const note = dayNotes[n]; if (!note) return;
        const body = note.type === "bullets" ? "<ul>" + (note.points || []).map(p => "<li>" + esc(p) + "</li>").join("") + "</ul>" : (note.text || "");
        if (!plain(body) && !note.mediaKey) return;
        let topic = ""; try { topic = dayTopic(n) || ""; } catch (e) { /* ignore */ }
        all.push({ fid: "note:" + n, src: "notes", type: "Note", title: "Day " + n + (topic ? " — " + topic : ""), ts: note.updatedAt || 0,
          summary: body, mediaKey: note.mediaKey, id: "note-" + n, day: Number(n) });
      });
    } catch (e) { console.error("feed: notes", e); }

    try {
      getAllQAItems().forEach(q => {
        const mine = String(q.id).startsWith("qa-custom-");
        const it = { fid: "qa:" + q.id, src: mine ? "qa" : "builtin", type: q.type || "Q&A", title: q.q, ts: tsFromId(q.id), cat: q.cat, id: q.id, qsec: q.section };
        if (q.type) Object.assign(it, { summary: q.summary, points: q.points, steps: q.steps, url: q.url, mediaKey: q.mediaKey, mediaName: q.mediaName });
        else it.summary = q.a;
        all.push(it);
      });
    } catch (e) { console.error("feed: qa", e); }

    try {
      getAllAdvItems().forEach(t => all.push({ fid: "adv:" + t.id, src: String(t.id).startsWith("adv-seed-") ? "builtin" : "adv", type: t.type || "Bullets",
        title: t.title, ts: tsFromId(t.id), summary: t.summary, points: t.points, steps: t.steps, url: t.url, mediaKey: t.mediaKey, mediaName: t.mediaName, id: t.id }));
    } catch (e) { console.error("feed: adv", e); }

    try {
      (getAllResourceLinks() || []).forEach(r => all.push({ fid: "link:" + r.id, src: "links", type: "Link", title: r.name, ts: tsFromId(r.id),
        summary: "", url: r.url, cat: r.category, tag: r.label, id: r.id }));
    } catch (e) { console.error("feed: links", e); }

    return all;
  }

  function dayTopic(n) { for (const p of PHASES) for (const w of p.weeks) for (const d of w.days) if (d.n === Number(n)) return d.topic; return ""; }

  // ---------------- filter + sort ----------------
  function compute() {
    const all = gather();
    const q = query.trim().toLowerCase();
    const hidden = new Set(prefs.hidden), pinned = new Set(prefs.pinned);
    let list = all.filter(it => srcOn(it.src) && !hidden.has(it.fid) && (!prefs.types.length || prefs.types.includes(it.type)));
    if (q) list = list.filter(it => (it.title + " " + plain(it.summary) + " " + (it.points || []).join(" ") + " " + (it.cat || "") + " " + (it.by || "")).toLowerCase().includes(q));
    const order = new Map(all.map((it, i) => [it.fid, i]));
    const rnd = fid => { let h = seed; for (const c of fid) h = (h * 31 + c.charCodeAt(0)) >>> 0; h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; return (h >>> 0) / 4294967296; };
    const cmp = {
      new: (a, b) => (b.ts - a.ts) || (order.get(a.fid) - order.get(b.fid)),
      old: (a, b) => ((a.ts || Infinity) - (b.ts || Infinity)) || (order.get(a.fid) - order.get(b.fid)),
      shuffle: (a, b) => rnd(a.fid) - rnd(b.fid),
      source: (a, b) => (SOURCES.findIndex(s => s.key === a.src) - SOURCES.findIndex(s => s.key === b.src)) || (order.get(a.fid) - order.get(b.fid)),
    }[prefs.sort];
    list.sort(cmp);
    list.sort((a, b) => (pinned.has(b.fid) ? 1 : 0) - (pinned.has(a.fid) ? 1 : 0));   // stable: pinned float to the top
    return { all, list };
  }

  // ---------------- rendering ----------------
  const fmtDate = ts => { if (!ts) return ""; const d = new Date(ts), now = new Date(), diff = (now - d) / 36e5;
    if (diff < 1) return "just now"; if (diff < 24) return Math.floor(diff) + "h ago"; if (diff < 24 * 7) return Math.floor(diff / 24) + "d ago";
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" }); };

  // ---- text part (can be clamped) and media part (never clamped) ----
  function textHTML(it) {
    let h = "";
    if (it.summary) h += it.plainBody ? `<div class="feed-text">${esc(it.summary)}</div>` : `<div class="item-summary">${rich(it.summary)}</div>`;
    if (it.points && it.points.length) h += `<ul class="item-points">${it.points.map(p => `<li>${esc(p)}</li>`).join("")}</ul>`;
    if (it.type === "Diagram" && it.steps) h += `<div class="diagram-flow">${it.steps.map((s, i) => `<span class="diagram-step">${esc(s)}</span>${i < it.steps.length - 1 ? '<i class="bi bi-arrow-right diagram-arrow" aria-hidden="true"></i>' : ""}`).join("")}</div>`;
    if (it.steps && it.type !== "Diagram" && it.steps.length) h += `<ol class="item-points">${it.steps.map(s => `<li>${esc(typeof s === "string" ? s : s.text || s.title || "")}</li>`).join("")}</ol>`;
    return h;
  }

  // ---- links from any website: LinkedIn posts embed, everything else gets a rich preview card ----
  const LKEY = "dn_link_cache";            // device-local cache (not synced)
  let linkCache = {}; try { linkCache = JSON.parse(localStorage.getItem(LKEY) || "{}") || {}; } catch (e) { linkCache = {}; }
  const saveLinkCache = () => { try { const k = Object.keys(linkCache); if (k.length > 120) k.slice(0, k.length - 120).forEach(x => delete linkCache[x]); localStorage.setItem(LKEY, JSON.stringify(linkCache)); } catch (e) { /* full */ } };
  const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };
  const liUrn = u => { const m = String(u).match(/linkedin\.com.*?(activity|share|ugcPost)[-:](\d{15,})/i); if (!m) return ""; const t = m[1].toLowerCase(); return `urn:li:${t === "ugcpost" ? "ugcPost" : t}:${m[2]}`; };
  const embedHTML = (urn, url) => `<div class="feed-embedgroup"><div class="feed-embed"><iframe src="https://www.linkedin.com/embed/feed/update/${esc(urn)}" title="LinkedIn post" loading="lazy" allowfullscreen></iframe></div>
    <div class="feed-embed-bar"><a href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer"><i class="bi bi-linkedin"></i> Open on LinkedIn <i class="bi bi-box-arrow-up-right"></i></a>
    <button type="button" data-cardurl="${esc(url)}" onclick="Feed.asCard(this)" title="Use this if the post doesn't load (private posts can't be embedded)">Not loading? Show as card</button></div></div>`;
  function linkBlock(url, title) {
    const urn = liUrn(url);
    if (urn && !prefs.cardUrls.includes(url)) return embedHTML(urn, url);
    const host = hostOf(url), fallback = title || url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 90);
    return `<a class="feed-preview" data-url="${esc(url)}" href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">
      <span class="fp-img" hidden></span>
      <span class="fp-body">
        <span class="fp-site"><img class="fp-fav" alt="" width="16" height="16" referrerpolicy="no-referrer" src="https://www.google.com/s2/favicons?domain=${esc(host)}&sz=64" onerror="this.remove()"><span class="fp-host">${esc(host || "link")}</span></span>
        <span class="fp-title" data-own="${title ? 1 : 0}">${esc(fallback)}</span>
        <span class="fp-desc" hidden></span>
      </span><i class="bi bi-box-arrow-up-right fp-ext" aria-hidden="true"></i></a>`;
  }
  const lkQueue = []; let lkBusy = 0;
  const fetchMeta = url => new Promise(res => { lkQueue.push({ url, res }); pump(); });
  async function lookup(url) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 9000);
      try {
        const r = await fetch("https://api.microlink.io/?url=" + encodeURIComponent(url), { signal: ctl.signal });
        if (r.status === 429) return { fail: 600e3 };                      // rate-limited: retry in 10 minutes
        const j = await r.json().catch(() => null);
        const d = j && j.status === "success" ? j.data : null;
        if (!d) return { fail: 24 * 3600e3 };                              // site can't be read: don't keep asking today
        return { title: d.title || "", desc: d.description || "", img: (d.image && d.image.url) || (d.logo && d.logo.url) || "", site: d.publisher || "", final: d.url || "" };
      } catch (e) {
        if (attempt === 0) await new Promise(ok => setTimeout(ok, 1500)); // network blip: one quick retry
      } finally { clearTimeout(timer); }
    }
    return { fail: 600e3 };
  }
  function pump() {
    while (lkBusy < 2 && lkQueue.length) {
      const job = lkQueue.shift(); lkBusy++;
      lookup(job.url).then(job.res).finally(() => { lkBusy--; pump(); });
    }
  }
  function paintPreview(el, m) {
    if (!el.isConnected || !m || m.fail) return;
    if (m.final) { const urn = liUrn(m.final); if (urn && !prefs.cardUrls.includes(m.final)) { el.outerHTML = embedHTML(urn, m.final); return; } }   // short link (lnkd.in …) that turned out to be a LinkedIn post
    const t = el.querySelector(".fp-title");
    if (m.title && t.dataset.own !== "1") t.textContent = m.title;      // your own title wins over the site's
    if (m.site) el.querySelector(".fp-host").textContent = m.site;
    if (m.desc) { const d = el.querySelector(".fp-desc"); d.textContent = m.desc; d.hidden = false; }
    if (m.img && /^https:\/\//.test(m.img)) {
      const box = el.querySelector(".fp-img"), im = new Image();
      im.alt = ""; im.referrerPolicy = "no-referrer";
      im.onload = () => { box.replaceChildren(im); box.hidden = false; };
      im.src = m.img;
    }
  }
  function enhancePreviews(root) {
    root.querySelectorAll(".feed-preview[data-url]").forEach(el => {
      const url = el.dataset.url; delete el.dataset.url;
      const c = linkCache[url];
      if (c && !c.fail) { paintPreview(el, c); return; }
      if (c && c.fail && Date.now() < c.until) return;                   // recently failed: show the plain card
      if (!prefs.previews) return;
      fetchMeta(url).then(m => {
        linkCache[url] = m.fail ? { fail: 1, until: Date.now() + m.fail } : m;
        saveLinkCache(); paintPreview(el, m);
      });
    });
  }

  const ytId = src => { const m = String(src).match(/embed\/([\w-]+)/); return m ? m[1] : ""; };
  function mediaHTML(it) {
    let h = "";
    if (it.mediaKey && (it.type === "Image" || it.src === "notes")) h += `<img class="feed-img" data-media="${esc(it.mediaKey)}" alt="${esc(it.title)}" loading="lazy">`;
    if (it.mediaKey && it.type === "PDF") h += `<div class="item-pdf-box"><i class="bi bi-file-earmark-pdf-fill"></i><span class="item-pdf-name">${esc(it.mediaName || "Attached PDF")}</span><button class="btn btn-sm btn-outline-danger" onclick="downloadStoredMedia('${esc(it.id)}')"><i class="bi bi-download me-1"></i>Download</button></div>`;
    if (it.url && (it.type === "Video" || it.type === "Link" || it.src === "links")) {
      const vid = typeof getVideoEmbedInfo === "function" ? getVideoEmbedInfo(it.url) : null;
      if (vid && vid.kind === "iframe") {
        const yt = /youtube\.com/.test(vid.src), id = yt ? ytId(vid.src) : "";
        const poster = yt && id ? ` style="background-image:url('https://i.ytimg.com/vi/${esc(id)}/hqdefault.jpg')"` : "";
        h += `<div class="feed-player" data-kind="iframe" data-provider="${yt ? "youtube" : "vimeo"}" data-src="${esc(vid.src)}" data-title="${esc(it.title || "Video")}"${poster}>
          <button type="button" class="feed-play" aria-label="Play video"><i class="bi bi-play-fill"></i></button></div>`;
      } else if (vid && vid.kind === "video") {
        h += `<div class="feed-player file"><video class="feed-video" src="${esc(vid.src)}" controls muted loop playsinline preload="metadata"></video></div>`;
      } else {
        h += linkBlock(it.url, it.title);
      }
    } else if (it.url) {
      h += linkBlock(it.url, it.title);
    }
    return h;
  }

  function cardHTML(it) {
    const s = SRC[it.src], pinned = prefs.pinned.includes(it.fid), fid = esc(it.fid);
    const isPost = it.src === "posts";
    const sub = [it.by, it.cat, fmtDate(it.ts)].filter(Boolean).map(esc).join(" · ");
    const text = textHTML(it), media = mediaHTML(it);
    return `<article class="feed-card ${pinned ? "pinned" : ""}" data-fid="${fid}" style="--src:${s.color}">
      <header class="feed-card-head">
        <span class="feed-avatar" aria-hidden="true"><i class="bi ${s.icon}"></i></span>
        <div class="feed-head-meta"><b class="feed-src">${esc(s.label)}</b><span class="feed-sub">${sub}</span></div>
        ${pinned ? '<i class="bi bi-pin-angle-fill feed-pin-ic" title="Pinned" aria-label="Pinned"></i>' : ""}
        <span class="feed-type"><i class="bi ${TYPE_ICON[it.type] || "bi-file-text"}" aria-hidden="true"></i>${esc(it.type)}</span>
      </header>
      ${it.title ? `<h3 class="feed-title">${esc(it.title)}</h3>` : ""}
      ${text ? `<div class="feed-body">${text}</div><button type="button" class="feed-more" hidden onclick="Feed.toggleMore(this)">Show more</button>` : ""}
      ${media ? `<div class="feed-media">${media}</div>` : ""}
      ${!text && !media && !it.title ? `<div class="small text-muted">No details.</div>` : ""}
      <footer class="feed-actions">
        <button type="button" onclick="Feed.pin('${fid}')" aria-label="${pinned ? "Unpin" : "Pin to top"}"><i class="bi bi-pin-angle${pinned ? "-fill" : ""}"></i><span>${pinned ? "Unpin" : "Pin"}</span></button>
        <button type="button" onclick="Feed.hide('${fid}')" aria-label="Hide from feed"><i class="bi bi-eye-slash"></i><span>Hide</span></button>
        ${isPost ? `<button type="button" onclick="Feed.editPost('${esc(it.raw.id)}')" aria-label="Edit post"><i class="bi bi-pencil"></i><span>Edit</span></button>
        <button type="button" class="danger" onclick="Feed.deletePost('${esc(it.raw.id)}')" aria-label="Delete post"><i class="bi bi-trash"></i><span>Delete</span></button>`
        : `<button type="button" onclick="Feed.open('${fid}')" aria-label="Open where this lives"><i class="bi bi-box-arrow-up-right"></i><span>Open</span></button>`}
      </footer>
    </article>`;
  }

  // ---- video: lazy load, autoplay (muted) when mostly on screen, pause when scrolled away, one at a time ----
  const REDUCE = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let playerObs = null, activePlayer = null;
  const cmd = (el, c) => {
    const f = el.querySelector("iframe"); if (!f) return;
    try {
      if (el.dataset.provider === "youtube") f.contentWindow.postMessage(JSON.stringify({ event: "command", func: c + "Video", args: "" }), "https://www.youtube.com");
      else f.contentWindow.postMessage(JSON.stringify({ method: c }), "https://player.vimeo.com");
    } catch (e) { /* not ready yet */ }
  };
  function mountIframe(el, withSound) {
    if (el.dataset.mounted) return;
    el.dataset.mounted = "1";
    const yt = el.dataset.provider === "youtube", q = new URLSearchParams();
    q.set("autoplay", "1"); q.set("playsinline", "1");
    q.set(yt ? "mute" : "muted", withSound ? "0" : "1");
    if (yt) { q.set("rel", "0"); q.set("enablejsapi", "1"); if (/^https?:$/.test(location.protocol)) q.set("origin", location.origin); } else q.set("api", "1");
    const f = document.createElement("iframe");
    f.src = el.dataset.src + "?" + q;
    f.title = el.dataset.title || "Video"; f.loading = "lazy"; f.referrerPolicy = "strict-origin-when-cross-origin"; f.allowFullscreen = true;
    f.allow = "accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;fullscreen";
    el.appendChild(f);
    el.classList.add("playing");
  }
  function playPlayer(el) {
    if (activePlayer && activePlayer !== el) pausePlayer(activePlayer);
    activePlayer = el;
    const v = el.querySelector("video");
    if (v) { if (!REDUCE) v.play().catch(() => {}); return; }
    if (el.dataset.mounted) cmd(el, "play"); else if (!REDUCE) mountIframe(el, false);
  }
  function pausePlayer(el) {
    const v = el.querySelector("video");
    if (v) v.pause(); else if (el.dataset.mounted) cmd(el, "pause");
    if (activePlayer === el) activePlayer = null;
  }
  function setupPlayers(root) {
    if (!("IntersectionObserver" in window)) return;
    if (!playerObs) playerObs = new IntersectionObserver(es => es.forEach(e => {
      if (!e.target.isConnected) return;
      if (e.intersectionRatio >= 0.6) playPlayer(e.target); else if (e.intersectionRatio < 0.25) pausePlayer(e.target);
    }), { threshold: [0, 0.25, 0.6, 1] });
    root.querySelectorAll(".feed-player:not([data-obs])").forEach(el => {
      el.dataset.obs = "1"; playerObs.observe(el);
      const btn = el.querySelector(".feed-play");
      if (btn) btn.addEventListener("click", () => { if (activePlayer && activePlayer !== el) pausePlayer(activePlayer); activePlayer = el; mountIframe(el, true); });
    });
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden && activePlayer) pausePlayer(activePlayer); });

  function hydrate(root) {
    root.querySelectorAll("img[data-media]").forEach(img => {
      const key = img.dataset.media; delete img.dataset.media;
      idbGet(key).then(url => { if (url) img.src = url; else img.remove(); }).catch(() => img.remove());
    });
    root.querySelectorAll(".feed-card:not([data-clamped])").forEach(card => {
      card.dataset.clamped = "1";
      const body = card.querySelector(".feed-body"), btn = card.querySelector(".feed-more");
      if (!body || !btn) return;
      requestAnimationFrame(() => { if (body.scrollHeight > body.clientHeight + 24) { btn.hidden = false; body.classList.add("clamped"); } });
    });
    setupPlayers(root);
    enhancePreviews(root);
  }

  function more() {
    const list = $("feed-list"); if (!list) return;
    const next = items.slice(shown, shown + BATCH);
    if (next.length) {
      list.insertAdjacentHTML("beforeend", next.map(cardHTML).join(""));
      shown += next.length;
      hydrate(list);
    }
    $("feed-end").hidden = shown < items.length || !items.length;
    $("feed-sentinel").hidden = shown >= items.length;
    // The observer only fires when the sentinel *enters* view. If new cards are short and it is still
    // near the screen, load the next batch ourselves so scrolling never stalls.
    requestAnimationFrame(() => {
      const sn = $("feed-sentinel");
      if (shown < items.length && sn && !sn.hidden && sn.getBoundingClientRect().top < innerHeight + 600 && $("tab-feed").style.display !== "none") more();
    });
  }

  function renderPanel(all) {
    const counts = {}; all.forEach(it => { counts[it.src] = (counts[it.src] || 0) + 1; });
    const types = [...new Set(all.map(it => it.type))].sort();
    const hiddenItems = all.filter(it => prefs.hidden.includes(it.fid));
    $("feed-sources").innerHTML = SOURCES.map(s => `<label class="feed-toggle" style="--src:${s.color}">
      <input type="checkbox" ${srcOn(s.key) ? "checked" : ""} onchange="Feed.setSource('${s.key}',this.checked)">
      <span class="feed-toggle-box"><i class="bi ${s.icon}" aria-hidden="true"></i><b>${esc(s.label)}</b><small>${counts[s.key] || 0}</small></span></label>`).join("");
    $("feed-types").innerHTML = types.map(t => `<button type="button" class="feed-chip ${prefs.types.includes(t) ? "on" : ""}" onclick="Feed.toggleType('${esc(t)}')"><i class="bi ${TYPE_ICON[t] || "bi-file-text"}" aria-hidden="true"></i>${esc(t)}</button>`).join("")
      || `<span class="small text-muted">Nothing yet.</span>`;
    $("feed-sort").value = prefs.sort;
    $("feed-previews").checked = prefs.previews;
    $("feed-shuffle").style.display = prefs.sort === "shuffle" ? "" : "none";
    $("feed-hidden").innerHTML = hiddenItems.length
      ? hiddenItems.map(it => `<div class="feed-hidden-row"><span><i class="bi ${SRC[it.src].icon} me-1" style="color:${SRC[it.src].color}"></i>${esc(it.title || it.type)}</span><button type="button" class="btn btn-sm btn-ghost" onclick="Feed.unhide('${esc(it.fid)}')">Restore</button></div>`).join("")
        + `<button type="button" class="btn btn-sm btn-ghost mt-2" onclick="Feed.unhideAll()">Restore all</button>`
      : `<span class="small text-muted">No hidden items. Use “Hide” on a card to take it out of the feed.</span>`;
    $("feed-hidden-count").textContent = hiddenItems.length ? hiddenItems.length : "";
    const active = SOURCES.filter(s => srcOn(s.key) !== (s.key !== "builtin")).length + (prefs.types.length ? 1 : 0) + hiddenItems.length;
    $("feed-manage-dot").style.display = active ? "" : "none";
  }

  let lastSig = "";
  const signature = all => JSON.stringify([prefs, query, prefs.sort === "shuffle" ? seed : 0]) + "|" + all.map(i => [i.fid, i.title, String(i.summary || "").length, (i.points || []).length, i.url, i.ts].join(":")).join(",");
  function show() {                       // called when the tab opens: only rebuild if something changed
    if (!$("feed-list")) return;
    if ($("feed-list").children.length && signature(gather()) === lastSig) return;
    render();
  }
  function render() {
    if (!$("feed-list")) return;
    const { all, list } = compute();
    lastSig = signature(all);
    items = list; shown = 0;
    if (playerObs) { playerObs.disconnect(); playerObs = null; }
    activePlayer = null;
    $("feed-list").innerHTML = "";
    renderPanel(all);
    const empty = $("feed-empty");
    if (!list.length) {
      empty.hidden = false;
      empty.querySelector("b").textContent = all.length ? "Nothing to show" : "Your feed is empty";
      empty.querySelector("span").textContent = all.length ? "Your filters or search are hiding everything. Open Manage feed to change what shows." : "Write a post above, or add content in other tabs — it will appear here.";
    } else empty.hidden = true;
    $("feed-count").textContent = list.length + (list.length === 1 ? " item" : " items");
    $("feed-end").hidden = true;
    more();
    if (observer) observer.disconnect();
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) more(); }, { rootMargin: "600px 0px" });
      observer.observe($("feed-sentinel"));
    } else { // very old browsers: just show everything
      while (shown < items.length) more();
    }
  }

  // ---------------- composer ----------------
  function typeFields() {
    const t = $("feed-post-type").value;
    $("feed-post-url-wrap").style.display = (t === "Link" || t === "Video") ? "" : "none";
    $("feed-post-text").placeholder = t === "Bullets" ? "One point per line…" : t === "Link" || t === "Video" ? "Why is this worth keeping? (optional)" : "Write something…";
  }
  function openComposer(post) {
    editingPostId = post ? post.id : null;
    $("feed-composer").classList.add("open");
    $("feed-post-type").value = post ? post.type : "Note";
    $("feed-post-title").value = post ? post.title || "" : "";
    $("feed-post-text").value = post ? post.text || "" : "";
    $("feed-post-url").value = post ? post.url || "" : "";
    $("feed-post-save").innerHTML = post ? '<i class="bi bi-check2 me-1"></i>Save changes' : '<i class="bi bi-send me-1"></i>Post';
    typeFields();
    $("feed-post-title").focus();
  }
  function closeComposer() { editingPostId = null; $("feed-composer").classList.remove("open"); }
  function savePost() {
    const type = $("feed-post-type").value;
    const title = $("feed-post-title").value.trim().slice(0, 140);
    const text = $("feed-post-text").value.trim().slice(0, 8000);
    let url = ""; const rawUrl = $("feed-post-url").value;
    if (type === "Link" || type === "Video") {
      url = typeof normUrl === "function" ? normUrl(rawUrl) : rawUrl.trim();
      if (rawUrl.trim() && !url) { alert("That doesn't look like a valid web address (https://…)."); return; }
      if (!url) { alert("Please add a link."); return; }
    }
    if (!title && !text && !url) { alert("Write something first."); return; }
    if (editingPostId) {
      const i = posts.findIndex(p => p.id === editingPostId);
      if (i > -1) posts[i] = { ...posts[i], type, title, text, url };
    } else {
      posts.unshift({ id: String(Date.now()), type, title, text, url, ts: Date.now() });
    }
    if (!savePosts()) return;
    closeComposer();
    render();
    if (window.UI?.toast) window.UI.toast(editingPostId ? "Post updated" : "Posted to your feed");
  }

  // ---------------- public actions ----------------
  const find = fid => items.find(i => i.fid === fid) || gather().find(i => i.fid === fid);
  window.Feed = {
    render, show,
    asCard(btn) { const u = btn.dataset.cardurl; if (u && !prefs.cardUrls.includes(u)) { prefs.cardUrls.push(u); savePrefs(); } const g = btn.closest(".feed-embedgroup"); if (!g) return; g.outerHTML = linkBlock(u, ""); enhancePreviews($("feed-list")); },
    setSource(k, on) { prefs.sources[k] = !!on; savePrefs(); render(); },
    toggleType(t) { const i = prefs.types.indexOf(t); if (i > -1) prefs.types.splice(i, 1); else prefs.types.push(t); savePrefs(); render(); },
    clearTypes() { prefs.types = []; savePrefs(); render(); },
    setPreviews(on) { prefs.previews = !!on; savePrefs(); render(); },
    setSort(v) { prefs.sort = v; savePrefs(); render(); },
    reshuffle() { seed = Date.now(); render(); },
    search(v) { query = v; render(); },
    pin(fid) { const i = prefs.pinned.indexOf(fid); if (i > -1) prefs.pinned.splice(i, 1); else prefs.pinned.push(fid); savePrefs(); render(); },
    hide(fid) {
      if (!prefs.hidden.includes(fid)) prefs.hidden.push(fid);
      savePrefs();
      const card = document.querySelector(`.feed-card[data-fid="${CSS.escape(fid)}"]`);
      if (card) card.remove();
      items = items.filter(i => i.fid !== fid); shown = Math.max(0, shown - 1);
      $("feed-count").textContent = items.length + (items.length === 1 ? " item" : " items");
      renderPanel(gather());
      if (!items.length) render(); else if (document.querySelectorAll(".feed-card").length < 4) more();
    },
    unhide(fid) { prefs.hidden = prefs.hidden.filter(x => x !== fid); savePrefs(); render(); },
    unhideAll() { prefs.hidden = []; savePrefs(); render(); },
    resetPrefs() { if (!confirm("Reset feed settings? Your content is not touched.")) return; prefs = {}; normPrefs(); savePrefs(); render(); },
    toggleMore(btn) { const b = btn.parentElement.querySelector(".feed-body"); const open = b.classList.toggle("clamped") === false; btn.textContent = open ? "Show less" : "Show more"; },
    togglePanel() { const p = $("feed-panel"); const open = p.classList.toggle("open"); $("feed-manage-btn").setAttribute("aria-expanded", open); },
    compose() { openComposer(null); },
    closeComposer, typeFields, savePost,
    editPost(id) { const p = posts.find(x => x.id === id); if (p) { openComposer(p); window.scrollTo({ top: 0, behavior: "smooth" }); } },
    deletePost(id) { if (!confirm("Delete this post?")) return; posts = posts.filter(p => p.id !== id); prefs.pinned = prefs.pinned.filter(x => x !== "post:" + id); prefs.hidden = prefs.hidden.filter(x => x !== "post:" + id); savePosts(); savePrefs(); render(); },
    open(fid) {
      const it = find(fid); if (!it) return;
      const btn = document.querySelector(`.tab-btn-nav[onclick^="showTab('${SRC[it.src].tab}'"]`);
      if (it.src === "docs" || it.src === "links") {
        const key = it.src === "links" ? "resources" : it.section;
        if (docsSections.some(s => s.key === key)) { activeDocsSection = key; localStorage.setItem("dotnet_active_docs_section", key); }
      }
      if (it.src === "qa" || (it.src === "builtin" && it.fid.startsWith("qa:"))) { const k = it.qsec || (it.src === "qa" ? "custom" : "builtin"); if (typeof setQASubtab === "function") try { setQASubtab(k); } catch (e) { /* ignore */ } }
      if (btn) btn.click();
      if (it.src === "notes") setTimeout(() => { try { window.UI.goToDay(it.day); } catch (e) { /* ignore */ } }, 120);
    },
  };

  // ---------------- boot ----------------
  function mount() {
    const tab = $("tab-feed"); if (!tab || tab.dataset.ready) return; tab.dataset.ready = "1";
    $("feed-search").addEventListener("input", e => Feed.search(e.target.value));
  }
  mount();
  // Live-refresh when content changes elsewhere (Firebase pull, restore from backup).
  window.addEventListener("storage", () => { if ($("tab-feed")?.style.display !== "none") show(); });
})();