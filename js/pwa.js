// Registers the service worker and exposes the "Install app" prompt.
let deferred = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; document.dispatchEvent(new Event('pwa-installable')); });
export const canInstall = () => !!deferred;
export async function installApp() { if (!deferred) return false; deferred.prompt(); const r = await deferred.userChoice; deferred = null; return r.outcome === 'accepted'; }
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(console.warn));
