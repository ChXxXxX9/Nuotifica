// Service worker di Cloro: mostra le notifiche e tiene in cache l'app per aprirla subito.
const VERSIONE = 'cloro-v19';
// Librerie di Firebase: l'indirizzo contiene la versione, quindi non cambiano mai e si tengono in memoria.
const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/';
const CACHE_SDK = 'nuotifica-sdk';
const GUSCIO = [
  '/',
  '/css/app.css',
  '/js/app.js',
  '/js/config.js',
  '/js/costanti.js',
  '/js/backend-firebase.js',
  '/js/nucleo.js',
  '/js/formato.js',
  '/js/viste-gare.js',
  '/js/viste-atleti.js',
  '/js/benvenuto.js',
  '/js/installazione.js',
  '/js/tema.js',
  '/js/viste-consigli.js',
  '/js/viste-squadre.js',
  '/js/viste-classifiche.js',
  '/js/categorie.js',
  '/js/punti.js',
  '/js/coriandoli.js',
  '/js/posizioni.js',
  '/js/tabella-limiti.js',
  '/js/dati-italia.js',
  '/js/annata.js',
  '/js/spiegazioni.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/badge-96.png',
  '/icons/favicon-64.png',
  '/fonts/unbounded.woff2',
  '/fonts/manrope.woff2',
];
// Impronta di ogni file, scritta alla pubblicazione (strumenti/impronte.mjs). A un aggiornamento si
// riscaricano solo i file cambiati: gli altri (caratteri, icone, pezzi di codice uguali) si copiano dalla
// versione già sul telefono. Vuoto in sviluppo: si scarica tutto.
const IMPRONTE = {};
// Voce interna della cache: le impronte di quello che c'è davvero dentro.
const INDICE = '/.impronte';

/** Impronta di un file (le prime 16 cifre esadecimali dello SHA-256), come in strumenti/impronte.mjs. */
async function impronta(risposta) {
  const hash = await crypto.subtle.digest('SHA-256', await risposta.clone().arrayBuffer());
  return [...new Uint8Array(hash)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** La versione già sul telefono (quella in uso), con le impronte dei suoi file. */
async function copiaPrecedente() {
  for (const nome of await caches.keys()) {
    if (!nome.startsWith('cloro-') || nome === VERSIONE || nome === 'cloro-rtdb') continue;
    const cache = await caches.open(nome);
    const indice = await cache.match(INDICE);
    if (indice) return { cache, impronte: await indice.json().catch(() => ({})) };
  }
  return { cache: null, impronte: {} };
}

async function preparaVersione() {
  const nuova = await caches.open(VERSIONE);
  const vecchia = await copiaPrecedente();
  const salvate = {};
  await Promise.all(GUSCIO.map(async (u) => {
    if (IMPRONTE[u] && vecchia.impronte[u] === IMPRONTE[u]) {
      const copia = await vecchia.cache.match(u);
      if (copia) {
        await nuova.put(u, copia);
        salvate[u] = IMPRONTE[u];
        return;
      }
    }
    // Sempre dalla rete (non dalla cache HTTP del browser): è la versione nuova appena pubblicata.
    const risposta = await fetch(new Request(u, { cache: 'reload' }));
    if (!risposta.ok) throw new Error(`${u}: ${risposta.status}`);
    // Si segna l'impronta di quello che è arrivato davvero: se fosse una copia vecchia, al prossimo
    // aggiornamento non coinciderebbe e il file si riscaricherebbe.
    salvate[u] = await impronta(risposta);
    await nuova.put(u, risposta);
  }));
  await nuova.put(INDICE, new Response(JSON.stringify(salvate), { headers: { 'content-type': 'application/json' } }));
}

self.addEventListener('install', (evento) => {
  evento.waitUntil(preparaVersione().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const chiavi = await caches.keys();
    await Promise.all(chiavi.filter((k) => k !== VERSIONE && k !== CACHE_SDK && k !== 'cloro-rtdb').map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// File dell'app: si risponde subito con la copia sul telefono, senza scaricarli di nuovo a ogni apertura.
// Cambiano solo quando si pubblica: allora cambia anche questo file e il telefono prende i file nuovi
// in un colpo (vedi preparaVersione). Senza copia si va in rete (per esempio la sezione Admin, che si
// scarica solo quando si apre).
async function primaLaCopia(richiesta) {
  const navigazione = richiesta.mode === 'navigate';
  const cache = await caches.open(VERSIONE);
  const inCache = await cache.match(navigazione ? '/' : richiesta, { ignoreSearch: navigazione });
  if (inCache) return inCache;
  try {
    const risposta = await fetch(richiesta);
    if (risposta.ok) await cache.put(navigazione ? '/' : richiesta, risposta.clone());
    return risposta;
  } catch {
    return Response.error();
  }
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
  evento.respondWith(primaLaCopia(richiesta));
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
    titolo: d.titolo ?? d.title ?? 'Cloro',
    corpo: d.corpo ?? d.body ?? 'C\'è una novità: apri Cloro per vederla.',
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
