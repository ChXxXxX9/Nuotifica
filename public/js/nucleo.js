// Il "nucleo" dell'app: stato condiviso, collegamento al backend, pezzi di interfaccia comuni.
import { CONFIG } from './config.js';
import { AVVISO_NON_UFFICIALE } from './costanti.js';

export const radice = document.getElementById('app');
const parametri = new URLSearchParams(location.search);
export const configurato = Boolean(CONFIG.firebase.apiKey && CONFIG.firebase.projectId);
export const modoDemo = parametri.has('demo') || !configurato;
export const pocoMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const stato = {
  utente: undefined, // undefined = ancora non si sa; null = non ha fatto l'accesso
  profilo: undefined,
  posts: null,
  statoSito: null,
  eventoInstalla: null,
  passi: 0, // pagine visitate dentro l'app in questa sessione
  filtro: 'tutto',
  gare: null, // elenco delle gare
  cache: new Map(), // documenti già letti in questa sessione
};

// Il backend (Firebase o demo) si carica in parallelo: ogni chiamata ad `api` aspetta da sola.
let backendPronto;
export const promessaBackend = new Promise((r) => { backendPronto = r; });
export const backendCaricato = (b) => backendPronto(b);
export const api = new Proxy({}, {
  get: (_, nome) => async (...argomenti) => (await promessaBackend)[nome](...argomenti),
});

/**
 * Legge un dato una volta per un po' (le pagine si riaprono subito). `carica` riceve una funzione
 * da chiamare se, dopo aver risposto con la copia salvata sul telefono, arriva un dato più fresco:
 * in quel caso si aggiorna la memoria e si avvisa con l'evento "cloro:fresco".
 */
const inCorsoCache = new Map();
export async function conCache(chiave, carica, { durata = 60_000 } = {}) {
  const c = stato.cache.get(chiave);
  if (c && Date.now() - c.quando < durata) return c.valore;
  if (inCorsoCache.has(chiave)) return inCorsoCache.get(chiave);
  const fresco = (valore) => {
    stato.cache.set(chiave, { valore, quando: Date.now() });
    window.dispatchEvent(new CustomEvent('cloro:fresco', { detail: { chiave } }));
  };
  const promessa = (async () => {
    try {
      const valore = await carica(fresco);
      stato.cache.set(chiave, { valore, quando: Date.now() });
      return valore;
    } finally {
      inCorsoCache.delete(chiave);
    }
  })();
  inCorsoCache.set(chiave, promessa);
  return promessa;
}
export const giaInCache = (chiave) => stato.cache.get(chiave)?.valore;

/* ---------- utilità ---------- */

export const esc = (t = '') => String(t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function memoria(chiave, valore) {
  try {
    if (valore === undefined) return JSON.parse(localStorage.getItem(`nuotifica.${chiave}`));
    if (valore === null) localStorage.removeItem(`nuotifica.${chiave}`);
    else localStorage.setItem(`nuotifica.${chiave}`, JSON.stringify(valore));
  } catch { /* archiviazione non disponibile: si va avanti senza */ }
  return null;
}

/** L'app è aperta dalla schermata Home (installata) e non in una scheda del browser? */
export function installata() {
  return ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay']
    .some((m) => window.matchMedia(`(display-mode: ${m})`).matches) || navigator.standalone === true;
}

/** Cloro si usa solo come app installata. Con ?demo si può provare nel browser (?soloapp per vedere il blocco). */
export function deveInstallare() {
  return (!modoDemo || parametri.has('soloapp')) && !installata();
}

export function dispositivo() {
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /android/i.test(ua);
  const inApp = installata();
  const browserInterno = /Instagram|FBAN|FBAV|TikTok|Line\/|Snapchat|WhatsApp|Telegram|LinkedInApp/i.test(ua);
  const browser = /CriOS/.test(ua) ? 'chrome-ios'
    : /FxiOS/.test(ua) ? 'firefox-ios'
      : /EdgiOS/.test(ua) ? 'edge-ios'
        : /SamsungBrowser/.test(ua) ? 'samsung'
          : /Firefox/.test(ua) ? 'firefox'
            : /EdgA?\//.test(ua) ? 'edge'
              : /Chrome/.test(ua) ? 'chrome'
                : /Safari/.test(ua) ? 'safari' : 'altro';
  const telefono = ios || android;
  const pushPossibile = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  return {
    ios, android, inApp, browserInterno, browser, telefono, pushPossibile,
  };
}

export function percorso() {
  return location.hash.replace(/^#\/?/, '').split('?')[0];
}
export function parametriHash() {
  return new URLSearchParams(location.hash.split('?')[1] ?? '');
}

export function avviso(testo, tipo = 'info') {
  document.querySelectorAll('.avviso').forEach((v) => v.remove());
  const el = document.createElement('div');
  el.className = `avviso avviso-${tipo}`;
  el.setAttribute('role', tipo === 'errore' ? 'alert' : 'status');
  el.textContent = testo;
  document.body.append(el);
  setTimeout(() => el.classList.add('via'), 3600);
  setTimeout(() => el.remove(), 4100);
}

export function mostraErrore(contenitore, errore) {
  const box = contenitore.querySelector('[data-errore]');
  if (box) {
    box.textContent = errore?.message ?? String(errore);
    box.hidden = false;
    box.scrollIntoView({ block: 'nearest', behavior: pocoMovimento ? 'auto' : 'smooth' });
  } else {
    avviso(errore?.message ?? String(errore), 'errore');
  }
}

export async function conAttesa(bottone, fn) {
  if (!bottone) return fn();
  bottone.disabled = true;
  bottone.setAttribute('aria-busy', 'true');
  try {
    return await fn();
  } finally {
    bottone.disabled = false;
    bottone.removeAttribute('aria-busy');
  }
}

/* ---------- icone (tratto, colore del testo) ---------- */

const svg = (corpo, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${corpo}</svg>`;

export const ICONE = {
  indietro: svg('<path d="M15 18l-6-6 6-6"/>'),
  ingranaggio: svg('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.4"/><circle cx="10" cy="17" r="2.4"/>'),
  cuore: svg('<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/>'),
  cronometro: svg('<circle cx="12" cy="14" r="7"/><path d="M12 14V10M10 3h4M12 3v4"/>'),
  barre: svg('<path d="M5 20V10M12 20V4M19 20v-7"/>'),
  persone: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>'),
  campana: svg('<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
  freccia: svg('<path d="M7 17L17 7M9 7h8v8"/>'),
  cerca: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
  stella: svg('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
  stellaPiena: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  onde: svg('<path d="M2 8c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 14c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 20c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/>'),
  documento: svg('<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>'),
  tribuna: svg('<path d="M3 20h18M5 20v-4h4v-4h4V8h4v12"/>'),
  aggiorna: svg('<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/>'),
  sole: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  luna: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  scudo: svg('<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  lampadina: svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>'),
  invia: svg('<path d="M4 12l16-8-6 16-2-7z"/>'),
  condividi: '<svg viewBox="0 0 24 24" class="icona-inline" role="img" aria-label="Condividi" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5v10h14V11h-1"/></svg>',
  piu: '<svg viewBox="0 0 24 24" class="icona-inline" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/></svg>',
  menu: '<svg viewBox="0 0 24 24" class="icona-inline" role="img" aria-label="Menu"><circle cx="12" cy="5" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="19" r="1.8" fill="currentColor"/></svg>',
  google: '<svg viewBox="0 0 48 48" class="g" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>',
};

/* ---------- pezzi comuni ---------- */

export const tessera = (classe = '') => `<span class="tessera ${classe}" aria-hidden="true">Cl</span>`;

/** Barra in alto: logo (o tasto indietro) e azioni a destra. */
export function barraTop({ indietro = false, titolo = '', azioni = '' } = {}) {
  const sinistra = indietro
    ? `<button class="tasto-icona" data-azione="indietro" aria-label="Indietro">${ICONE.indietro}</button>
       ${titolo ? `<span class="titolo-barra">${esc(titolo)}</span>` : '<span class="spazio"></span>'}`
    : `<a class="logo" href="#/" aria-label="Cloro, vai a Per te">${tessera()}<span class="logo-parola">cloro</span></a><span class="spazio"></span>`;
  return `
    ${modoDemo ? `<p class="striscia-demo">Anteprima con dati di esempio${configurato ? '' : ': Firebase non collegato'}</p>` : ''}
    <header class="barra-top">${sinistra}${azioni}</header>`;
}

const SCHEDE = [
  { id: '', nome: 'Per te', icona: 'cuore' },
  { id: 'gare', nome: 'Gare', icona: 'cronometro' },
  { id: 'classifiche', nome: 'Classifiche', icona: 'barre' },
  { id: 'atleti', nome: 'Atleti', icona: 'persone' },
];

/** Barra delle sezioni in basso. `attiva` è l'id della sezione. */
export function tabBar(attiva) {
  return `
    <nav class="tab-bar" aria-label="Sezioni">
      ${SCHEDE.map((s) => `<a class="tab" href="#/${s.id}" ${s.id === attiva ? 'aria-current="page"' : ''}>${ICONE[s.icona]}${s.nome}</a>`).join('')}
    </nav>`;
}

export function piede() {
  return `
    <footer class="piede">
      <p>${esc(AVVISO_NON_UFFICIALE)}</p>
      <p><a href="#/privacy">Privacy</a></p>
    </footer>`;
}

/**
 * Disegna una pagina. `collega` aggancia gli eventi. Con `aggiornamento` la pagina resta dove era
 * (stesso scroll, niente animazione di passaggio).
 */
export function disegna(html, collega, { classeBody = '', aggiornamento = false, scrollA = 0 } = {}) {
  const scrollPrima = window.scrollY;
  const fai = () => {
    document.body.className = classeBody;
    radice.innerHTML = html;
    radice.querySelector('[data-azione="indietro"]')?.addEventListener('click', () => {
      // Arrivati da una notifica non c'è una pagina precedente nell'app.
      if (stato.passi > 0) history.back();
      else location.hash = '#/';
    });
    collega?.(radice);
    window.scrollTo(0, aggiornamento ? scrollPrima : scrollA);
    const titolo = radice.querySelector('h1');
    const testo = titolo?.textContent.trim();
    document.title = testo && testo.toLowerCase() !== 'cloro' ? `${testo} – Cloro` : 'Cloro';
  };
  // Niente animazioni di passaggio tra pagine: la pagina nuova compare subito.
  fai();
}

export function caricamento(testo = 'Un attimo…', { tab = null } = {}) {
  disegna(`${barraTop()}<main class="pagina"><p class="caricamento" role="status">${esc(testo)}</p></main>${tab !== null ? tabBar(tab) : ''}`);
}

/** Pagina d'errore con "Riprova". */
export function paginaErrore(err, { tab = null, indietro = true } = {}) {
  disegna(`
    ${barraTop({ indietro })}
    <main class="pagina">
      <p class="errore" style="margin-top:16px">${esc(err?.message ?? String(err))}</p>
      <div class="pila"><button class="bottone bottone-secondario" data-azione="riprova">Riprova</button></div>
    </main>
    ${tab !== null ? tabBar(tab) : ''}`, (el) => {
    el.querySelector('[data-azione="riprova"]').addEventListener('click', () => window.dispatchEvent(new HashChangeEvent('hashchange')));
  });
}
