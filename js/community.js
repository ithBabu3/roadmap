// Opt-in public profile: aggregates only (progress, streak, avatar). Notes/files are never shared.
import { db } from "./firebase-init.js";
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, orderBy, limit }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export const Community = {
  async get(username) { const s = await getDoc(doc(db, "publicProfiles", username)); return s.exists() ? s.data() : null; },
  async top(n = 25) {
    const s = await getDocs(query(collection(db, "publicProfiles"), orderBy("done", "desc"), limit(n)));
    return s.docs.map(d => d.data());
  },
  publish(p) {
    const clean = { uid: p.uid, username: p.username, name: String(p.name || p.username).slice(0, 40),
      emoji: String(p.emoji || "🙂").slice(0, 16), color: p.color || "#4f46e5",
      done: p.done | 0, total: p.total | 0, streak: p.streak | 0, best: p.best | 0, updatedAt: Date.now() };
    return setDoc(doc(db, "publicProfiles", p.username), clean);
  },
  remove: username => deleteDoc(doc(db, "publicProfiles", username)),
  link: username => new URL("community.html?u=" + encodeURIComponent(username), location.href).href
};
