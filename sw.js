// Offline support: app shell + CDN libraries are cached; Firebase API calls are never touched
// (Firestore has its own offline cache).
const CACHE = 'dotnet-roadmap-v5';   
const SHELL = ['index.html','login.html','community.html','css/app.css','css/login.css','css/royal.css','manifest.webmanifest',
  'js/app.js','js/boot.js', 'js/boot-main.js','js/features.js','js/ui.js','js/auth.js','js/cloud-store.js','js/community.js','js/community-page.js',
  'js/firebase-init.js','js/firebase-config.js','js/login.js','js/pwa.js','icons/icon-192.png','icons/icon-512.png'];
const CDN = ['cdn.jsdelivr.net','fonts.googleapis.com','fonts.gstatic.com','www.gstatic.com'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(()=>{})).then(()=>self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  const ok = u.origin === location.origin || (CDN.includes(u.hostname) && (u.hostname !== 'www.gstatic.com' || u.pathname.includes('/firebasejs/')));
  if (!ok) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(r, { ignoreSearch: r.mode === 'navigate' });
    const net = fetch(r).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(r, res.clone()); return res; }).catch(() => hit);
    return hit || net;     // stale-while-revalidate
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window'}).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('index.html')));
});