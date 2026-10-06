// Offline support for YOUR OWN files only (network-first; cache is just the offline fallback).
// CDN files (bootstrap, Firebase SDK) are NOT intercepted: the CSP header on this worker would block
// its fetches (connect-src), so the browser loads them directly instead.
const CACHE = 'dotnet-roadmap-v7';
const SHELL = ['index.html','login.html','community.html','css/app.css','css/login.css','css/royal.css','manifest.webmanifest',
  'js/app.js','js/boot.js','js/boot-main.js','js/features.js','js/ui.js','js/auth.js','js/cloud-store.js','js/community.js','js/community-page.js',
  'js/firebase-init.js','js/firebase-config.js','js/login.js','js/pwa.js','icons/icon-192.png','icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;   // let the browser handle everything else
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(r);
      if (res && res.ok) cache.put(r, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(r, { ignoreSearch: r.mode === 'navigate' });
      return hit || Response.error();
    }
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('index.html')));
});