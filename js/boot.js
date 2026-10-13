// Auth guard + startup for index.html: login check → load user data from Firestore → start the app.
import { watchUser, usernameOf } from "./auth.js";
import { Cloud } from "./cloud-store.js";
import "./pwa.js";

const msg = t => { const m = document.getElementById("boot-msg"); if (m) m.textContent = t; };
let started = false, appLoaded = false;

watchUser(async user => {
  if (!user) { location.replace("login.html"); return; }
  if (started) return;
  started = true;
  try {
    msg("Loading your data from Firebase…");
    const username = usernameOf(user);
    await Cloud.init(user, username);
    const nav = document.getElementById("nav-username");
    if (nav) nav.textContent = username;
    // Classic scripts, in order: safe.js (helpers) -> app.js (the app). Then the two ES-module layers.
    const loadScript = src => new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = src; s.onload = ok; s.onerror = () => fail(new Error("Could not load " + src));
      document.body.appendChild(s);
    });
    if (!appLoaded) {              // never load app.js twice (its top-level `let`s would throw)
      appLoaded = true;
      await loadScript("js/safe.js");
      await loadScript("js/app.js");
      await loadScript("js/feed.js");
    }
    try { await import("./features.js"); } catch (e) { console.error("features failed", e); }
    try { await import("./ui.js"); } catch (e) { console.error("ui layer failed", e); }
    document.getElementById("boot-overlay")?.remove();
  } catch (e) {
    console.error(e);
    msg("Couldn't start the app: " + (e.message || e));
    document.querySelector(".boot-bar")?.remove();
    const act = document.getElementById("boot-actions"); if (act) act.style.display = "block";
    started = false;
  }
});