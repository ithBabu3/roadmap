import "./pwa.js";
import { isConfigured } from "./firebase-init.js";
import { signIn, signUp, friendlyError, watchUser, passwordScore, lockRemaining, normalizeUsername } from "./auth.js";

const $ = id => document.getElementById(id);
let mode = "login", busy = false;

if (!isConfigured) $("cfg-warning").style.display = "block";
watchUser(u => { if (u && !busy) location.replace("index.html"); });

function setMode(m) {
  mode = m;
  $("tab-login").classList.toggle("active", m === "login");
  $("tab-signup").classList.toggle("active", m === "signup");
  $("confirm-wrap").style.display = m === "signup" ? "block" : "none";
  $("submit-text").textContent = m === "signup" ? "Create account" : "Sign in";
  $("password").autocomplete = m === "signup" ? "new-password" : "current-password";
  $("error").style.display = "none";
  $("strength").style.display = m === "signup" ? "flex" : "none";
}
const showError = t => { $("error").textContent = t; $("error").style.display = "block"; };

$("tab-login").onclick = () => setMode("login");
$("tab-signup").onclick = () => setMode("signup");
$("toggle-pw").onclick = () => {
  const p = $("password"), show = p.type === "password";
  p.type = show ? "text" : "password";
  $("toggle-pw").innerHTML = `<i class="bi bi-eye${show ? "-slash" : ""}"></i>`;
};

$("password").addEventListener("input", () => {
  const sc = passwordScore($("password").value, normalizeUsername($("username").value));
  document.querySelectorAll("#strength i").forEach((el, i) => { el.style.background = i < sc ? ["#dc2626","#d97706","#65a30d","#16a34a"][sc - 1] : "#e5e7eb"; });
  $("strength-label").textContent = $("password").value ? ["Weak","Weak","Okay","Good","Strong"][sc] : "";
});
$("auth-form").addEventListener("submit", async e => {
  e.preventDefault();
  if (busy) return;
  const username = $("username").value, password = $("password").value;
  if (mode === "signup" && password !== $("confirm").value) return showError("Passwords don't match.");
  const wait = lockRemaining();
  if (mode === "login" && wait) return showError(`Too many failed attempts. Try again in ${Math.ceil(wait / 1000)}s.`);
  busy = true; $("submit-btn").disabled = true; $("error").style.display = "none";
  try {
    await (mode === "signup" ? signUp(username, password) : signIn(username, password));
    location.replace("index.html");
  } catch (err) {
    showError(friendlyError(err));
    busy = false; $("submit-btn").disabled = false;
  }
});
