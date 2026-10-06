// Firestore is the source of truth. Layout:
//   users/{uid}/data/{key}   one doc per localStorage "dotnet_*" key  ({v} or chunked {n})
//   users/{uid}/media/{id}   images / PDFs as data-URLs (chunked to stay under the 1 MB doc limit)
// localStorage / IndexedDB are only a cache; every localStorage write is auto-saved.
import { db } from "./firebase-init.js";
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const CHUNK = 240000;                  // chars per doc (safe even for 4-byte characters)
const IDB_NAME = "dotnet_roadmap_media", IDB_STORE = "media";
const LOCAL_ONLY = new Set(["dotnet_uid", "dotnet_pending", "dotnet_sync_banner_dismissed"]);
export const isSyncedKey = k => typeof k === "string" && k.startsWith("dotnet_") && !LOCAL_ONLY.has(k);

const origSet = Storage.prototype.setItem, origRemove = Storage.prototype.removeItem;
let uid = null, timer = null, running = null;
const dirty = new Set(), lastSent = new Map(), chunkCounts = new Map();
const col = name => collection(db, "users", uid, name);
const safeId = k => String(k).replace(/[\/\s]/g, "_");

// ---------- generic chunked value read / write ----------
async function writeValue(name, id, str) {
  const c = col(name), meta = doc(c, id), ck = name + "/" + id;
  const prevN = chunkCounts.has(ck) ? chunkCounts.get(ck) : ((await getDoc(meta)).data()?.n || 0);
  let n = 0;
  if (str.length <= CHUNK) {
    await setDoc(meta, { v: str, n: 0, t: Date.now() });
  } else {
    n = Math.ceil(str.length / CHUNK);
    for (let i = 0; i < n; i += 6) {
      const b = writeBatch(db);
      for (let j = i; j < Math.min(i + 6, n); j++) b.set(doc(c, `${id}~${j}`), { v: str.slice(j * CHUNK, (j + 1) * CHUNK) });
      await b.commit();
    }
    await setDoc(meta, { n, t: Date.now() });
  }
  for (let j = n; j < prevN; j++) await deleteDoc(doc(c, `${id}~${j}`));
  chunkCounts.set(ck, n);
}
async function readValue(name, id) {
  const c = col(name), m = await getDoc(doc(c, id));
  if (!m.exists()) return null;
  const d = m.data();
  if (!d.n) return d.v ?? "";
  const parts = await Promise.all(Array.from({ length: d.n }, (_, i) => getDoc(doc(c, `${id}~${i}`))));
  return parts.map(p => p.data()?.v ?? "").join("");
}
async function removeValue(name, id) {
  const c = col(name), ck = name + "/" + id, meta = doc(c, id);
  const n = chunkCounts.has(ck) ? chunkCounts.get(ck) : ((await getDoc(meta)).data()?.n || 0);
  for (let j = 0; j < n; j++) await deleteDoc(doc(c, `${id}~${j}`));
  await deleteDoc(meta);
  chunkCounts.delete(ck);
}
async function loadAllData() {
  const snap = await getDocs(col("data")), docs = {};
  snap.forEach(d => { docs[d.id] = d.data(); });
  const out = {};
  for (const [id, d] of Object.entries(docs)) {
    if (id.includes("~")) continue;
    chunkCounts.set("data/" + id, d.n || 0);
    out[id] = d.n ? Array.from({ length: d.n }, (_, i) => docs[`${id}~${i}`]?.v ?? "").join("") : (d.v ?? "");
  }
  return out;
}

// ---------- sync badge ----------
export function status(state, text) {
  const b = document.getElementById("sync-badge"), t = document.getElementById("sync-badge-text");
  if (!b || !t) return;
  b.classList.remove("synced", "error");
  if (state === "synced") b.classList.add("synced");
  if (state === "error") b.classList.add("error");
  t.textContent = text;
}

// ---------- auto-save ----------
const persistPending = () => origSet.call(localStorage, "dotnet_pending", JSON.stringify([...dirty]));
function queue(k) {
  dirty.add(k); persistPending();
  status("syncing", "Saving…");
  clearTimeout(timer); timer = setTimeout(flush, 1500);
}
async function runFlush() {
  const keys = [...dirty]; dirty.clear();
  let failed = false;
  for (const k of keys) {
    try {
      const v = localStorage.getItem(k);
      if (v === null) { await removeValue("data", k); lastSent.delete(k); }
      else if (lastSent.get(k) !== v) { await writeValue("data", k, v); lastSent.set(k, v); }
    } catch (e) { console.error("Save failed for", k, e); dirty.add(k); failed = true; }
  }
  persistPending();
  if (failed) { status("error", "Save failed — retrying"); timer = setTimeout(flush, 10000); }
  else status("synced", "Saved " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
}
export function flush() {
  clearTimeout(timer);
  if (running) return running.then(() => (dirty.size ? flush() : undefined));
  if (!uid || !dirty.size) return Promise.resolve();
  running = runFlush().finally(() => { running = null; });
  return running;
}
function installAutoSave() {
  Storage.prototype.setItem = function (k, v) { origSet.call(this, k, v); if (this === localStorage && isSyncedKey(k)) queue(k); };
  Storage.prototype.removeItem = function (k) { origRemove.call(this, k); if (this === localStorage && isSyncedKey(k)) queue(k); };
  addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  addEventListener("pagehide", flush);
  addEventListener("online", flush);
}

// ---------- local cache helpers ----------
const localKeys = () => Object.keys(localStorage).filter(isSyncedKey);
function clearLocal() {
  localKeys().forEach(k => origRemove.call(localStorage, k));
  LOCAL_ONLY.forEach(k => origRemove.call(localStorage, k));
  try { indexedDB.deleteDatabase(IDB_NAME); } catch (e) {}
}
function readLegacyMedia() {   // images/PDFs saved by the old local-only version
  return new Promise(resolve => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      const db0 = req.result, out = [];
      const cur = db0.transaction(IDB_STORE).objectStore(IDB_STORE).openCursor();
      cur.onsuccess = () => { const c = cur.result; if (c) { out.push([c.key, c.value]); c.continue(); } else { db0.close(); resolve(out); } };
      cur.onerror = () => { db0.close(); resolve(out); };
    };
  });
}

// ---------- public API ----------
export const Cloud = {
  user: null,
  flush,
  putMedia: (key, dataUrl) => writeValue("media", safeId(key), dataUrl),
  getMedia: key => readValue("media", safeId(key)),
  deleteMedia: key => removeValue("media", safeId(key)),

  async init(user, username) {
    uid = user.uid;
    Cloud.user = { uid, username };
    const stored = localStorage.getItem("dotnet_uid");
    if (stored && stored !== uid) clearLocal();                       // someone else used this browser

    let cloud;
    try { cloud = await loadAllData(); }
    catch (e) {                                                        // offline / Firebase unreachable
      if (stored === uid && localKeys().length) { cloud = null; status("error", "Offline — using your saved copy"); }
      else throw e;
    }
    const legacy = cloud && !stored && localKeys().length > 0;                 // data from the old local-only app
    const adopt = legacy && Object.keys(cloud).length === 0;
    if (!cloud) cloud = {};
    if (legacy && !adopt) clearLocal();

    let pending = [];
    try { pending = stored === uid ? JSON.parse(localStorage.getItem("dotnet_pending") || "[]") : []; } catch (e) {}
    pending.forEach(k => dirty.add(k));
    if (adopt) {
      status("syncing", "Uploading your existing data…");
      localKeys().forEach(k => dirty.add(k));
      for (const [k, v] of await readLegacyMedia()) { try { await Cloud.putMedia(k, v); } catch (e) { console.error(e); } }
    }

    // cloud wins, except for keys with unsaved local changes
    for (const [k, v] of Object.entries(cloud)) {
      lastSent.set(k, v);
      if (!dirty.has(k) && isSyncedKey(k)) origSet.call(localStorage, k, v);
    }
    if (Object.keys(cloud).length || !stored) localKeys().forEach(k => { if (!(k in cloud) && !dirty.has(k)) origRemove.call(localStorage, k); });
    origSet.call(localStorage, "dotnet_uid", uid);

    installAutoSave();
    if (!localStorage.getItem("dotnet_display_name")) localStorage.setItem("dotnet_display_name", username);
    if (dirty.size) flush(); else status("synced", "Saved");
  },

  detach() { uid = null; dirty.clear(); clearTimeout(timer); },
  wipeLocal: clearLocal,
  async deleteAllData() {            // used by "Delete account"
    for (const name of ["data", "media"]) {
      const snap = await getDocs(col(name));
      for (let i = 0; i < snap.docs.length; i += 400) {
        const b = writeBatch(db); snap.docs.slice(i, i + 400).forEach(d => b.delete(d.ref)); await b.commit();
      }
    }
    Cloud.detach();
  },

  async signOut() {
    status("syncing", "Saving…");
    await Promise.race([flush(), new Promise(r => setTimeout(r, 6000))]);
    if (dirty.size && !confirm("Some changes haven't reached Firebase yet and will be lost. Sign out anyway?")) return;
    const { signOutUser } = await import("./auth.js");
    await signOutUser();
    clearLocal();
    location.replace("login.html");
  }
};
window.Cloud = Cloud;
