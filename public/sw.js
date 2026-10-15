// Service worker di Nuotifica: mostra le notifiche e tiene in cache l'app per aprirla subito.
const VERSIONE = 'nuotifica-v2';
const GUSCIO = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/app.js',
  '/js/config.js',
  '/js/costanti.js',
  '/js/backend-firebase.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/badge-96.png',
  '/fonts/saira.woff2',
  '/fonts/saira-italic.woff2',
  '/fonts/doto.woff2',
  '/img/caustiche-a.png',
  '/img/caustiche-b.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(VERSIONE).then((c) => c.addAll(GUSCIO)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const chiavi = await caches.keys();
    await Promise.all(chiavi.filter((k) => k !== VERSIONE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Prima la rete (così gli aggiornamenti arrivano subito), la cache solo senza connessione.
self.addEventListener('fetch', (evento) => {
  const richiesta = evento.request;
  if (richiesta.method !== 'GET') return;
  const url = new URL(richiesta.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/__/')) return;
  evento.respondWith((async () => {
    try {
      const risposta = await fetch(richiesta);
      if (risposta.ok) {
        const copia = risposta.clone();
        caches.open(VERSIONE).then((c) => c.put(richiesta, copia));
      }
      return risposta;
    } catch {
      const inCache = await caches.match(richiesta, { ignoreSearch: richiesta.mode === 'navigate' });
      return inCache ?? (richiesta.mode === 'navigate' ? caches.match('/index.html') : Response.error());
    }
  })());
});

function leggiMessaggio(evento) {
  let dati = {};
  try {
    dati = evento.data?.json() ?? {};
  } catch {
    dati = { corpo: evento.data?.text() };
  }
  // Firebase Cloud Messaging mette i nostri campi in "data".
  const d = dati.data ?? dati.notification ?? dati;
  return {
    titolo: d.titolo ?? d.title ?? 'Nuotifica',
    corpo: d.corpo ?? d.body ?? 'C\'è una novità sul sito della FIN Lazio.',
    url: d.url ?? dati.fcmOptions?.link ?? '/',
    tag: d.tag ?? undefined,
  };
}

self.addEventListener('push', (evento) => {
  const m = leggiMessaggio(evento);
  // Su iPhone ogni push deve mostrare una notifica, altrimenti il permesso può essere revocato.
  evento.waitUntil(self.registration.showNotification(m.titolo, {
    body: m.corpo,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: m.tag,
    renotify: Boolean(m.tag),
    data: { url: m.url },
  }));
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const url = new URL(evento.notification.data?.url ?? '/', self.location.origin).href;
  evento.waitUntil((async () => {
    const finestre = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const finestra of finestre) {
      if (new URL(finestra.url).origin === self.location.origin && 'focus' in finestra) {
        await finestra.focus();
        finestra.postMessage({ tipo: 'apri', url });
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
