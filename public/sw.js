// Service worker di Nuotifica: mostra le notifiche e tiene in cache l'app per aprirla subito.
const VERSIONE = 'nuotifica-v3';
// Librerie di Firebase: l'indirizzo contiene la versione, quindi non cambiano mai e si tengono in memoria.
const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/';
const CACHE_SDK = 'nuotifica-sdk';
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
    await Promise.all(chiavi.filter((k) => k !== VERSIONE && k !== CACHE_SDK).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// File dell'app: si risponde subito con la copia sul telefono e intanto si scarica la versione nuova
// (che si vedrà alla prossima apertura). Senza copia si va in rete.
async function primaLaCopia(evento) {
  const richiesta = evento.request;
  const navigazione = richiesta.mode === 'navigate';
  const cache = await caches.open(VERSIONE);
  const inCache = await cache.match(navigazione ? '/' : richiesta, { ignoreSearch: navigazione });
  const dallaRete = fetch(richiesta).then((risposta) => {
    if (risposta.ok) cache.put(navigazione ? '/' : richiesta, risposta.clone());
    return risposta;
  }).catch(() => null);
  if (inCache) {
    evento.waitUntil(dallaRete);
    return inCache;
  }
  return (await dallaRete) ?? (navigazione ? cache.match('/index.html') : Response.error());
}

// Librerie di Firebase: una volta scaricate, sempre dalla memoria.
async function sempreDallaCopia(richiesta) {
  const cache = await caches.open(CACHE_SDK);
  const inCache = await cache.match(richiesta);
  if (inCache) return inCache;
  const risposta = await fetch(richiesta);
  if (risposta.ok) cache.put(richiesta, risposta.clone());
  return risposta;
}

self.addEventListener('fetch', (evento) => {
  const richiesta = evento.request;
  if (richiesta.method !== 'GET') return;
  if (richiesta.url.startsWith(FIREBASE_SDK)) {
    evento.respondWith(sempreDallaCopia(richiesta));
    return;
  }
  const url = new URL(richiesta.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/__/')) return;
  evento.respondWith(primaLaCopia(evento));
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
