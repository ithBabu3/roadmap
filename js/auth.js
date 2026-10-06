// Username + password login on top of Firebase Auth.
// Firebase only knows email/password, so the username is mapped to a private pseudo-email.
// No real email is collected and sendEmailVerification() is never called.
import { auth } from "./firebase-init.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as fbSignOut,
  onAuthStateChanged, updateProfile, EmailAuthProvider, reauthenticateWithCredential, updatePassword, deleteUser
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const EMAIL_DOMAIN = "users.dotnet-roadmap.app";
export const USERNAME_RE = /^[a-z0-9_.-]{3,20}$/;
export const normalizeUsername = u => String(u || "").trim().toLowerCase();
const toEmail = u => `${u}@${EMAIL_DOMAIN}`;
export const usernameOf = user => user?.displayName || (user?.email || "").split("@")[0];

// ---- brute-force protection (client side; Firebase Auth also throttles server side) ----
const LOCK = "dn_login_lock";
const lockState = () => { try { return JSON.parse(localStorage.getItem(LOCK) || "{}"); } catch (e) { return {}; } };
export const lockRemaining = () => Math.max(0, (lockState().until || 0) - Date.now());
function recordFail() { const s = lockState(); s.fails = (s.fails || 0) + 1; if (s.fails >= 5) s.until = Date.now() + Math.min(15 * 60e3, 30e3 * 2 ** (s.fails - 5)); localStorage.setItem(LOCK, JSON.stringify(s)); }
const clearFails = () => localStorage.removeItem(LOCK);

export function passwordScore(p, username = "") {   // 0–4
  let s = 0; if (p.length >= 8) s++; if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++; if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(4, s);
}
export function checkPassword(p, username = "") {
  if (p.length < 8) throw new Error("Password must be at least 8 characters.");
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) throw new Error("Use letters and at least one number.");
}

const MESSAGES = {
  "auth/email-already-in-use": "That username is already taken.",
  "auth/invalid-credential": "Wrong username or password.",
  "auth/user-not-found": "Wrong username or password.",
  "auth/wrong-password": "Wrong username or password.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/too-many-requests": "Too many attempts. Please wait a bit and try again.",
  "auth/network-request-failed": "Network error. Check your connection.",
  "auth/operation-not-allowed": "Enable Email/Password sign-in in the Firebase console (Authentication → Sign-in method).",
  "auth/configuration-not-found": "Enable Authentication in the Firebase console first.",
  "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "Invalid Firebase config — check js/firebase-config.js."
};
export const friendlyError = e => MESSAGES[e?.code] || e?.message || "Something went wrong.";

function checkUsername(u) {
  if (!USERNAME_RE.test(u)) throw new Error("Username must be 3–20 characters: letters, numbers, . _ -");
}

export async function signUp(rawUsername, password) {
  const username = normalizeUsername(rawUsername);
  checkUsername(username); checkPassword(password, username);
  const cred = await createUserWithEmailAndPassword(auth, toEmail(username), password);
  await updateProfile(cred.user, { displayName: username });
  return cred.user;
}

export async function signIn(rawUsername, password) {
  const username = normalizeUsername(rawUsername);
  checkUsername(username);
  const wait = lockRemaining();
  if (wait) throw new Error(`Too many failed attempts. Try again in ${Math.ceil(wait / 1000)}s.`);
  try { const u = (await signInWithEmailAndPassword(auth, toEmail(username), password)).user; clearFails(); return u; }
  catch (e) { if (/invalid-credential|wrong-password|user-not-found/.test(e.code || "")) recordFail(); throw e; }
}

export const signOutUser = () => fbSignOut(auth);
export const watchUser = cb => onAuthStateChanged(auth, cb);

// ---- account management (needs the current password) ----
export async function reauth(currentPassword) {
  const u = auth.currentUser;
  await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, currentPassword));
  return u;
}
export async function changePassword(current, next) {
  const u = await reauth(current); checkPassword(next, usernameOf(u));
  await updatePassword(u, next);
}
export const removeAccount = () => deleteUser(auth.currentUser);
