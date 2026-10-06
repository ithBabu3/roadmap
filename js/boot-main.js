// Auth guard + startup for index.html: login check → load user data from Firestore → start the app.
import { watchUser, usernameOf } from "./auth.js";
import { Cloud } from "./cloud-store.js";
import "./pwa.js";

const msg = t => { const m = document.getElementById("boot-msg"); if (m) m.textContent = t; };
let started = false;

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
    const s = document.createElement("script");
    s.src = "js/app.js";
    s.onload = async () => {
      try { await import("./features.js"); } catch (e) { console.error("features failed", e); }
      try { await import("./ui.js"); } catch (e) { console.error("ui layer failed", e); }
      document.getElementById("boot-overlay").remove();
    };
    s.onerror = () => msg("Could not load the app script.");
    document.body.appendChild(s);
  } catch (e) {
    console.error(e);
    msg("Could not reach Firebase: " + (e.message || e));
    document.querySelector(".boot-bar")?.remove();
    document.getElementById("boot-actions").style.display = "block";
    started = false;
  }
});
