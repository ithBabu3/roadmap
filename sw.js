// Offline support. Own files (html/js/css) are NETWORK-FIRST so a deploy is never mixed with stale
// cached files; the cache is only the offline fallback. Pinned CDN libraries are cache-first.
// Firebase API calls are never touched (Firestore has its own offline cache).
const CACHE = 'dotnet-roadmap-v6';
const SHELL = ['index.html','login.html','community.html','css/app.css','css/login.css','css/royal.css','manifest.webmanifest',
  'js/app.js','js/boot.js','js/boot-main.js','js/features.js','js/ui.js','js/auth.js','js/cloud-store.js','js/community.js','js/community-page.js',
  'js/firebase-init.js','js/firebase-config.js','js/login.js','js/pwa.js','icons/icon-192.png','icons/icon-512.png'];
const CDN = ['cdn.jsdelivr.net','fonts.googleapis.com','fonts.gstatic.com','www.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  const own = u.origin === location.origin;
  const cdn = CDN.includes(u.hostname) && (u.hostname !== 'www.gstatic.com' || u.pathname.includes('/firebasejs/'));
  if (!own && !cdn) return;

  e.respondWith(caches.open(CACHE).then(async cache => {
    const match = () => cache.match(r, { ignoreSearch: r.mode === 'navigate' });
    if (own) {                                   // network-first
      try {
        const res = await fetch(r);
        if (res && res.ok) cache.put(r, res.clone());
        return res;
      } catch (err) {
        const hit = await match();
        if (hit) return hit;
        throw err;
      }
    }
    const hit = await match();                   // CDN: cache-first, refresh in background
    const net = fetch(r).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(r, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('index.html')));
});