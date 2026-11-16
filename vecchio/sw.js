// Vecchio indirizzo di Cloro: questo service worker sostituisce quello di prima e si spegne da solo.
// Toglie l'iscrizione alle notifiche (così non arrivano doppie), cancella le copie salvate e manda al nuovo indirizzo.
const NUOVO = 'https://cloro.web.app/';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    try {
      const iscrizione = await self.registration.pushManager.getSubscription();
      if (iscrizione) await iscrizione.unsubscribe();
    } catch { /* niente */ }
    try {
      for (const k of await caches.keys()) await caches.delete(k);
    } catch { /* niente */ }
    const finestre = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await self.registration.unregister();
    for (const f of finestre) {
      try {
        await f.navigate(NUOVO);
      } catch { /* la pagina si sposta da sola */ }
    }
  })());
});

// Niente copie: tutto dalla rete (la pagina del vecchio indirizzo manda al nuovo).
self.addEventListener('fetch', () => {});
