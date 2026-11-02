import { CONFIG } from './config.js';
import {
  SETTORI, GRUPPI, TIPI, NOME_SETTORE, TIPO_BREVE, GIORNI_NOVITA, AVVISO_NON_UFFICIALE,
} from './costanti.js';

const radice = document.getElementById('app');
const parametri = new URLSearchParams(location.search);
const configurato = Boolean(CONFIG.firebase.apiKey && CONFIG.firebase.projectId);
const modoDemo = parametri.has('demo') || !configurato;
const pocoMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const stato = {
  utente: undefined, // undefined = ancora non si sa; null = non ha fatto l'accesso
  profilo: undefined,
  posts: null,
  statoSito: null,
  eventoInstalla: null,
  passi: 0, // pagine visitate dentro l'app in questa sessione
  animaElenco: true, // l'elenco entra con l'animazione solo la prima volta
  filtro: 'tutto',
};
// Il backend (Firebase o demo) si carica in parallelo: l'app intanto mostra subito
// gli ultimi dati salvati sul telefono. Ogni chiamata ad `api` aspetta da sola che sia pronto.
let backend = null;
let backendPronto;
const promessaBackend = new Promise((r) => { backendPronto = r; });
const api = new Proxy({}, {
  get: (_, nome) => async (...argomenti) => (await promessaBackend)[nome](...argomenti),
});

/* ---------- utilità ---------- */

const esc = (t = '') => String(t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function memoria(chiave, valore) {
  try {
    if (valore === undefined) return JSON.parse(localStorage.getItem(`nuotifica.${chiave}`));
    if (valore === null) localStorage.removeItem(`nuotifica.${chiave}`);
    else localStorage.setItem(`nuotifica.${chiave}`, JSON.stringify(valore));
  } catch { /* archiviazione non disponibile: si va avanti senza */ }
  return null;
}
stato.filtro = memoria('filtro') ?? 'tutto';

/* ---------- copia locale: l'app si apre subito con gli ultimi dati ---------- */

const VERSIONE_COPIA = 1;

function salvaCopia() {
  if (modoDemo || !stato.utente) return;
  memoria('copia', {
    v: VERSIONE_COPIA,
    utente: stato.utente,
    profilo: stato.profilo ?? null,
    posts: stato.posts,
    statoSito: stato.statoSito,
  });
}

function leggiCopia() {
  const c = memoria('copia');
  if (!c || c.v !== VERSIONE_COPIA || !c.utente?.uid) return null;
  const data = (v) => (v ? new Date(v) : null);
  return {
    utente: c.utente,
    profilo: c.profilo ?? undefined,
    posts: Array.isArray(c.posts) ? c.posts.map((post) => ({
      ...post,
      data: data(post.data),
      ultimoCambio: data(post.ultimoCambio),
      novita: post.novita ? { ...post.novita, quando: data(post.novita.quando) } : null,
      file: (post.file ?? []).map((f) => ({ ...f, aggiuntoIl: data(f.aggiuntoIl) })),
    })) : null,
    statoSito: c.statoSito ? { ...c.statoSito, ultimoControllo: data(c.statoSito.ultimoControllo) } : null,
  };
}

/** Impronta dei post: se non cambia, non serve ridisegnare l'elenco. */
function improntaPosts(posts) {
  return (posts ?? []).map((p) => `${p.id}:${p.ultimoCambio?.getTime?.() ?? ''}:${p.file?.length ?? 0}`).join('|');
}

function dispositivo() {
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /android/i.test(ua);
  const inApp = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const browserInterno = /Instagram|FBAN|FBAV|TikTok|Line\/|Snapchat|WhatsApp/i.test(ua);
  const pushPossibile = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  return { ios, android, inApp, browserInterno, pushPossibile };
}

const fmtOra = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });
const fmtGiorno = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' });
const fmtRel = new Intl.RelativeTimeFormat('it-IT', { numeric: 'auto' });

function quando(data) {
  if (!data) return '';
  const minuti = Math.round((Date.now() - data.getTime()) / 60_000);
  if (minuti < 1) return 'adesso';
  if (minuti < 60) return fmtRel.format(-minuti, 'minute');
  const ieri = new Date(Date.now() - 86_400_000);
  if (data.toDateString() === new Date().toDateString()) return `oggi, ${fmtOra.format(data)}`;
  if (data.toDateString() === ieri.toDateString()) return `ieri, ${fmtOra.format(data)}`;
  return `${fmtGiorno.format(data).replace('.', '')}, ${fmtOra.format(data)}`;
}

/** Ora per il tabellone: "14:32" se è di oggi, altrimenti "12 ott". */
function oraTabellone(data) {
  if (!data) return '';
  if (data.toDateString() === new Date().toDateString()) return fmtOra.format(data);
  return fmtGiorno.format(data).replace('.', '');
}

/** Toglie dal titolo il prefisso del settore, che mostriamo già a parte. */
function titoloPulito(titolo = '') {
  return titolo
    .replace(/^\s*(nuoto artistico( propaganda)?|propaganda( nuoto| nu)?|pallanuoto|salvamento|master|tuffi|fondo|nuoto|nu)\s*[:–—-]\s*/i, '')
    .trim() || titolo;
}

/** Stessa pulizia delle etichette usata nelle notifiche. */
function etichettaLeggibile(etichetta = '') {
  let aggiornato = false;
  const pulita = etichetta
    .replace(/^\s*comun\s*\d+\s*(aggiornato)?\s*[-–—:]\s*/i, (_, agg) => {
      aggiornato = Boolean(agg);
      return '';
    })
    .replace(/^\s*[A-Z][A-Za-z]{2,7}\s*[-–—]\s+/, '')
    .trim();
  if (!pulita) return etichetta;
  return aggiornato ? `Aggiornato – ${pulita}` : pulita;
}

const eRecente = (data) => data && Date.now() - data.getTime() < GIORNI_NOVITA * 86_400_000;
const visti = () => memoria('visti') ?? {};

function segnaVisto(post) {
  const elenco = visti();
  elenco[post.id] = post.ultimoCambio?.toISOString() ?? new Date().toISOString();
  const chiavi = Object.keys(elenco);
  if (chiavi.length > 200) chiavi.slice(0, chiavi.length - 200).forEach((k) => delete elenco[k]);
  memoria('visti', elenco);
}

/** File arrivati con l'ultima novità del post. */
function fileNovita(post) {
  const ids = post.novita?.fileIds ?? [];
  return post.file.filter((f) => ids.includes(f.id));
}

/** Il post ha novità che l'utente non ha ancora aperto? */
function targhettaPost(post) {
  const n = post.novita;
  if (!n?.quando || !eRecente(n.quando)) return null;
  const visto = visti()[post.id];
  if (visto && new Date(visto) >= n.quando) return null;
  if (n.tipo === 'nuovo') return 'Nuovo';
  return fileNovita(post).some((f) => f.aggiornato) ? 'Aggiornato' : 'Nuovi file';
}

/** Il post interessa i settori/gruppi dell'utente? (stessa regola del controllore) */
function interessa(post, profilo) {
  const comuni = post.settori.filter((s) => profilo.settori?.includes(s));
  if (!comuni.length) return false;
  if (comuni.every((s) => s === 'nuoto')) {
    const gruppi = profilo.gruppi?.length ? profilo.gruppi : ['categoria', 'esordienti'];
    return post.gruppi.some((g) => gruppi.includes(g));
  }
  return true;
}

function avviso(testo, tipo = 'info') {
  document.querySelectorAll('.avviso').forEach((v) => v.remove());
  const el = document.createElement('div');
  el.className = `avviso avviso-${tipo}`;
  el.setAttribute('role', tipo === 'errore' ? 'alert' : 'status');
  el.textContent = testo;
  document.body.append(el);
  setTimeout(() => el.classList.add('via'), 3600);
  setTimeout(() => el.remove(), 4100);
}

function mostraErrore(contenitore, errore) {
  const box = contenitore.querySelector('[data-errore]');
  if (box) {
    box.textContent = errore?.message ?? String(errore);
    box.hidden = false;
    box.scrollIntoView({ block: 'nearest', behavior: pocoMovimento ? 'auto' : 'smooth' });
  } else {
    avviso(errore?.message ?? String(errore), 'errore');
  }
}

async function conAttesa(bottone, fn) {
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

/* ---------- icone ---------- */

const ICONE = {
  ingranaggio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="7" r="2.4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="10" cy="17" r="2.4" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  indietro: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  campana: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" fill="currentColor"/><path d="M10 20.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  freccia: '<svg viewBox="0 0 24 24" class="documento-freccia" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  condividi: '<svg viewBox="0 0 24 24" class="icona-inline" role="img" aria-label="Condividi"><path d="M12 3v12M8 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  piu: '<svg viewBox="0 0 24 24" class="icona-inline" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  menu: '<svg viewBox="0 0 24 24" class="icona-inline" role="img" aria-label="Menu"><circle cx="12" cy="5" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="19" r="1.8" fill="currentColor"/></svg>',
  google: '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>',
};

/* ---------- pezzi comuni ---------- */

function testata({ indietro = false, impostazioni = true } = {}) {
  return `
    <header class="testata">
      <div class="testata-riga">
        ${indietro
    ? `<button class="tasto-icona" data-azione="indietro" aria-label="Indietro">${ICONE.indietro}</button>`
    : '<span class="tasto-icona-vuoto"></span>'}
        <a class="marchio" href="#/" aria-label="Nuotifica, torna alle novità">Nuotifica</a>
        ${stato.utente && impostazioni
    ? `<a class="tasto-icona" href="#/impostazioni" aria-label="Impostazioni">${ICONE.ingranaggio}</a>`
    : '<span class="tasto-icona-vuoto"></span>'}
      </div>
      <div class="corda" aria-hidden="true"></div>
      ${modoDemo ? `<p class="striscia-demo">Anteprima con dati di esempio${configurato ? '' : ': Firebase non collegato'}</p>` : ''}
    </header>`;
}

function piede() {
  return `
    <footer class="piede">
      <p>${esc(AVVISO_NON_UFFICIALE)}</p>
      <p><a href="#/privacy">Privacy</a></p>
    </footer>`;
}

function tabellone(righe, { titolo = 'FIN LAZIO', anima = false, dalVivo = true } = {}) {
  return `
    <div class="tabellone ${anima && !pocoMovimento ? 'tabellone-anima' : ''}" role="img" aria-label="${esc(righe.map((r) => `${r.tipo} ${r.nome} ${r.ora ?? ''}`).join(', '))}">
      <div class="tabellone-testa" aria-hidden="true">
        <span>${esc(titolo)}</span>
        ${dalVivo ? '<span class="tabellone-dal-vivo">LIVE</span>' : ''}
      </div>
      <ol class="tabellone-righe" aria-hidden="true">
        ${righe.map((r) => `
          <li class="tabellone-riga">
            <span class="tipo-led">${esc(r.tipo)}</span>
            <span class="nome">${esc(r.nome)}</span>
            ${r.ora ? `<span class="ora">${esc(r.ora)}</span>` : ''}
          </li>`).join('')}
      </ol>
    </div>`;
}

function disegna(html, collega, { classeBody = '', aggiornamento = false, scrollA = 0 } = {}) {
  const scrollPrima = window.scrollY;
  const fai = () => {
    document.body.className = classeBody;
    radice.innerHTML = html;
    radice.querySelector('[data-azione="indietro"]')?.addEventListener('click', () => {
      // Arrivati da una notifica non c'è una pagina precedente nell'app: si va alle novità.
      if (stato.passi > 0) history.back();
      else location.hash = '#/';
    });
    collega?.(radice);
    window.scrollTo(0, aggiornamento ? scrollPrima : scrollA);
    const titolo = radice.querySelector('h1');
    const testo = titolo?.textContent.trim();
    document.title = testo && testo.toLowerCase() !== 'nuotifica' ? `${testo} – Nuotifica` : 'Nuotifica';
  };
  if (document.startViewTransition && !pocoMovimento && !aggiornamento && radice.childElementCount) {
    document.startViewTransition(fai);
  } else {
    fai();
  }
}

function caricamento(testo = 'Un attimo…') {
  radice.innerHTML = `${testata()}<main class="pagina"><p class="caricamento" role="status">${esc(testo)}</p></main>`;
}

/* ---------- prima schermata ---------- */

function vistaOspite() {
  const { inApp } = dispositivo();
  const righe = [
    { tipo: 'AMMESSI', nome: 'Finali Categoria', ora: '18:42' },
    { tipo: 'STARTLIST', nome: 'Assoluti v.c.', ora: '17:05' },
    { tipo: 'ORARI', nome: 'Esordienti A', ora: '12:30' },
    { tipo: 'RISULTATI', nome: 'Master', ora: '09:15' },
  ];
  disegna(`
    <main class="ospite">
      <div class="corda" aria-hidden="true"></div>
      ${modoDemo ? '<p class="striscia-demo">Anteprima con dati di esempio</p>' : ''}
      <h1 class="marchio-grande">Nuotifica</h1>
      <p class="sottotitolo">Ammessi, start list, orari e risultati della <strong>FIN Lazio</strong>. Ti arrivano sul telefono appena escono.</p>
      ${tabellone(righe, { anima: true })}

      <div class="blocco-accesso">
        <button class="bottone bottone-google" data-azione="google"><span class="g">${ICONE.google}</span><span>Continua con Google</span></button>
        <button class="bottone bottone-vetro" data-azione="mostra-email">Entra con email e password</button>
        ${inApp ? '<p class="nota">Se l\'accesso con Google non si apre, usa email e password.</p>' : ''}
        <p class="errore" data-errore-google hidden></p>

        <form class="modulo" data-modulo="email" hidden novalidate>
          <h2 data-titolo-modulo>Entra</h2>
          <label class="campo">Email
            <input type="email" name="email" autocomplete="email" inputmode="email" required>
          </label>
          <label class="campo">Password
            <input type="password" name="password" autocomplete="current-password" minlength="6" required>
          </label>
          <p class="errore" data-errore hidden></p>
          <button class="bottone" type="submit" data-invio>Entra</button>
          <p class="riga-link">
            <button type="button" class="link" data-azione="cambia-modo">Non hai un account? Creane uno</button>
          </p>
          <p class="riga-link">
            <button type="button" class="link" data-azione="password-dimenticata">Ho dimenticato la password</button>
          </p>
        </form>
      </div>
      ${piede()}
    </main>`, (el) => {
    let modoRegistrazione = false;
    const modulo = el.querySelector('[data-modulo="email"]');
    const erroreGoogle = el.querySelector('[data-errore-google]');
    const errRedirect = backend?.prendiErroreAccesso?.();
    if (errRedirect) {
      erroreGoogle.textContent = errRedirect.message;
      erroreGoogle.hidden = false;
    }

    el.querySelector('[data-azione="google"]').addEventListener('click', async (e) => {
      erroreGoogle.hidden = true;
      try {
        await conAttesa(e.currentTarget, () => api.accediGoogle());
      } catch (err) {
        erroreGoogle.textContent = err.message;
        erroreGoogle.hidden = false;
      }
    });
    el.querySelector('[data-azione="mostra-email"]').addEventListener('click', (e) => {
      modulo.hidden = false;
      e.currentTarget.hidden = true;
      modulo.querySelector('input').focus();
    });
    el.querySelector('[data-azione="cambia-modo"]').addEventListener('click', (e) => {
      modoRegistrazione = !modoRegistrazione;
      el.querySelector('[data-titolo-modulo]').textContent = modoRegistrazione ? 'Crea il tuo account' : 'Entra';
      el.querySelector('[data-invio]').textContent = modoRegistrazione ? 'Crea account' : 'Entra';
      e.currentTarget.textContent = modoRegistrazione ? 'Hai già un account? Entra' : 'Non hai un account? Creane uno';
      modulo.password.autocomplete = modoRegistrazione ? 'new-password' : 'current-password';
    });
    el.querySelector('[data-azione="password-dimenticata"]').addEventListener('click', async () => {
      const email = modulo.email.value.trim();
      if (!email) {
        mostraErrore(modulo, new Error('Scrivi la tua email qui sopra, poi tocca di nuovo "Ho dimenticato la password".'));
        return;
      }
      try {
        await api.recuperaPassword(email);
        avviso('Ti ho mandato un\'email per scegliere una nuova password.');
      } catch (err) {
        mostraErrore(modulo, err);
      }
    });
    modulo.addEventListener('submit', async (e) => {
      e.preventDefault();
      modulo.querySelector('[data-errore]').hidden = true;
      const email = modulo.email.value.trim();
      const password = modulo.password.value;
      if (!email || !password) {
        mostraErrore(modulo, new Error('Scrivi email e password.'));
        return;
      }
      try {
        await conAttesa(modulo.querySelector('[data-invio]'), () => (modoRegistrazione
          ? api.registrati(email, password)
          : api.accediEmail(email, password)));
      } catch (err) {
        mostraErrore(modulo, err);
      }
    });
  }, { classeBody: 'su-ospite' });
}

function vistaVerifica() {
  disegna(`
    ${testata()}
    <main class="pagina">
      <h1>Conferma la tua email</h1>
      <p>Ti abbiamo mandato un link a <strong>${esc(stato.utente.email)}</strong>. Aprilo, poi torna qui e tocca "Ho confermato".</p>
      <p class="nota">Non la trovi? Guarda nello spam.</p>
      <p class="errore" data-errore hidden></p>
      <div class="pila">
        <button class="bottone" data-azione="controlla">Ho confermato</button>
        <button class="bottone bottone-vetro" data-azione="rimanda">Mandala di nuovo</button>
        <button class="link" data-azione="esci">Esci e usa un altro account</button>
      </div>
    </main>`, (el) => {
    el.querySelector('[data-azione="controlla"]').addEventListener('click', async (e) => {
      const ok = await conAttesa(e.currentTarget, () => api.ricaricaUtente());
      if (ok) {
        stato.utente.verificata = true;
        mostra();
      } else {
        mostraErrore(el, new Error('L\'indirizzo non risulta ancora confermato. Apri il link nell\'email e riprova.'));
      }
    });
    el.querySelector('[data-azione="rimanda"]').addEventListener('click', async (e) => {
      try {
        await conAttesa(e.currentTarget, () => api.rimandaVerifica());
        avviso('Email mandata di nuovo.');
      } catch (err) {
        mostraErrore(el, err);
      }
    });
    el.querySelector('[data-azione="esci"]').addEventListener('click', () => api.esci());
  });
}

/* ---------- impostazioni ---------- */

function opzioniSpunta(nome, elenco, scelti, { tipo = 'checkbox', classe = 'gettone' } = {}) {
  return elenco.map((o) => `
    <label class="${classe}">
      <input type="${tipo}" name="${nome}" value="${esc(o.id)}" ${scelti.includes(o.id) ? 'checked' : ''}>
      <span class="${classe}-testo">${esc(o.nome)}${o.dettaglio ? `<small>${esc(o.dettaglio)}</small>` : ''}</span>
    </label>`).join('');
}

function riquadroNotifiche() {
  const d = dispositivo();
  const tokenQui = memoria('token');
  let testo = 'Non attive su questo dispositivo.';
  let classe = 'spente';
  if (tokenQui) { testo = 'Attive su questo dispositivo.'; classe = 'attive'; }
  else if (!d.pushPossibile && !d.ios) { testo = 'Questo browser non le supporta.'; classe = ''; }
  return `
    <section class="riquadro">
      <h2>Notifiche</h2>
      <p class="stato-notifiche ${classe}">${testo}</p>
      <div class="pila">
        ${tokenQui
    ? '<button class="bottone bottone-vetro" data-azione="prova">Manda una notifica di prova</button><button class="link" data-azione="spegni-qui">Disattiva su questo dispositivo</button>'
    : '<a class="bottone" href="#/installa">Attiva le notifiche</a>'}
      </div>
    </section>`;
}

function vistaImpostazioni({ primaVolta = false } = {}) {
  const p = stato.profilo ?? {};
  const settori = p.settori ?? ['nuoto'];
  const gruppi = p.gruppi?.length ? p.gruppi : ['categoria', 'esordienti'];
  const tipi = p.tipi?.length ? p.tipi : ['tutti'];
  const tutto = tipi.includes('tutti');

  disegna(`
    ${testata({ indietro: !primaVolta, impostazioni: false })}
    <main class="pagina">
      <h1>${primaVolta ? 'Cosa vuoi sapere?' : 'Impostazioni'}</h1>
      ${primaVolta ? '<p class="intro">Scegli cosa seguire. Puoi cambiarlo quando vuoi.</p>' : ''}
      <form class="modulo modulo-impostazioni" novalidate>
        <fieldset>
          <legend>Sport</legend>
          <div class="gettoni">${opzioniSpunta('settori', SETTORI, settori)}</div>
        </fieldset>

        <fieldset data-gruppi>
          <legend>Gare di nuoto</legend>
          <div class="opzioni-grandi">${opzioniSpunta('gruppi', GRUPPI, gruppi, { classe: 'opzione' })}</div>
        </fieldset>

        <fieldset>
          <legend>Cosa ti avvisiamo</legend>
          <div class="opzioni-grandi due">
            <label class="opzione"><input type="radio" name="quanto" value="tutto" ${tutto ? 'checked' : ''}><span class="opzione-testo">Tutto<small>Ogni novità dei tuoi sport</small></span></label>
            <label class="opzione"><input type="radio" name="quanto" value="scelta" ${tutto ? '' : 'checked'}><span class="opzione-testo">Scelgo io<small>Solo i documenti che vuoi</small></span></label>
          </div>
          <div class="gettoni" data-tipi ${tutto ? 'hidden' : ''}>${opzioniSpunta('tipi', TIPI, tutto ? [] : tipi)}</div>
        </fieldset>

        <p class="errore" data-errore hidden></p>
        <div class="salva-fisso">
          <button class="bottone" type="submit">${primaVolta ? 'Salva e continua' : 'Salva'}</button>
        </div>
      </form>

      ${primaVolta ? '' : `
      ${riquadroNotifiche()}
      <section class="riquadro">
        <h2>Account</h2>
        <p>${esc(stato.utente.email ?? '')}</p>
        <div class="pila">
          <button class="bottone bottone-vetro" data-azione="esci">Esci</button>
          <button class="link link-pericolo" data-azione="elimina">Elimina il mio account</button>
        </div>
      </section>
      ${piede()}`}
    </main>`, (el) => {
    const modulo = el.querySelector('form');
    const blocchiGruppi = el.querySelector('[data-gruppi]');
    const blocchiTipi = el.querySelector('[data-tipi]');
    const aggiornaVisibili = () => {
      blocchiGruppi.hidden = !modulo.querySelector('input[name="settori"][value="nuoto"]').checked;
      blocchiTipi.hidden = modulo.quanto.value !== 'scelta';
    };
    aggiornaVisibili();
    modulo.addEventListener('change', aggiornaVisibili);

    modulo.addEventListener('submit', async (e) => {
      e.preventDefault();
      el.querySelector('[data-errore]').hidden = true;
      const valori = (nome) => [...modulo.querySelectorAll(`input[name="${nome}"]:checked`)].map((i) => i.value);
      const nuovi = {
        settori: valori('settori'),
        gruppi: valori('gruppi'),
        tipi: modulo.quanto.value === 'tutto' ? ['tutti'] : valori('tipi'),
        pushOn: true,
      };
      if (!nuovi.settori.length) return mostraErrore(el, new Error('Scegli almeno uno sport.'));
      if (nuovi.settori.includes('nuoto') && !nuovi.gruppi.length) {
        return mostraErrore(el, new Error('Per il nuoto scegli Categoria, Esordienti o tutte e due.'));
      }
      if (!nuovi.tipi.length) return mostraErrore(el, new Error('Scegli almeno un tipo di documento, oppure "Tutto".'));
      if (!nuovi.gruppi.length) nuovi.gruppi = ['categoria', 'esordienti'];

      try {
        await conAttesa(modulo.querySelector('[type="submit"]'), () => api.salvaProfilo(stato.utente.uid, nuovi));
        stato.profilo = { ...(stato.profilo ?? {}), ...nuovi };
        stato.posts = null;
        stato.aggiornatoIl = 0;
        salvaCopia();
        avviso('Salvato.');
        location.hash = memoria('token') ? '#/' : '#/installa';
      } catch (err) {
        mostraErrore(el, err);
      }
      return null;
    });

    el.querySelector('[data-azione="esci"]')?.addEventListener('click', async () => {
      await api.esci();
      memoria('token', null);
      location.hash = '#/';
    });
    el.querySelector('[data-azione="elimina"]')?.addEventListener('click', async (e) => {
      // eslint-disable-next-line no-alert
      if (!window.confirm('Eliminare l\'account? Cancelliamo preferenze e dispositivi collegati. Non si può annullare.')) return;
      try {
        await conAttesa(e.currentTarget, () => api.eliminaAccount(stato.utente.uid));
        memoria('token', null);
        memoria('visti', null);
        avviso('Account eliminato.');
        location.hash = '#/';
      } catch (err) {
        mostraErrore(el, err);
      }
    });
    el.querySelector('[data-azione="prova"]')?.addEventListener('click', notificaDiProva);
    el.querySelector('[data-azione="spegni-qui"]')?.addEventListener('click', async (e) => {
      try {
        await conAttesa(e.currentTarget, () => api.disattivaPushQui(stato.utente.uid, memoria('token')));
        memoria('token', null);
        avviso('Notifiche disattivate su questo dispositivo.');
        vistaImpostazioni();
      } catch (err) {
        mostraErrore(el, err);
      }
    });
  });
}

async function notificaDiProva() {
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification('Nuotifica', {
      body: 'Funziona! Ti avvisiamo qui appena esce qualcosa.',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: 'prova',
      data: { url: `${location.origin}/#/` },
    });
  } catch {
    avviso('Non sono riuscito a mostrare la notifica di prova.', 'errore');
  }
}

/* ---------- installazione e notifiche ---------- */

function passiInstallazione(d) {
  if (d.ios && d.browserInterno) {
    return `
      <p>Stai usando il browser interno di un'altra app. Su iPhone le notifiche funzionano solo dall'app aggiunta con Safari.</p>
      <ol class="passi">
        <li><span>Tocca ${ICONE.menu} e scegli <strong>Apri in Safari</strong>.</span></li>
        <li><span>In Safari, segui i passaggi che trovi in questa pagina.</span></li>
      </ol>`;
  }
  if (d.ios) {
    return `
      <p>Su iPhone e iPad è <span class="obbligatorio">obbligatorio</span>: Apple manda le notifiche solo alle app aggiunte alla schermata Home.</p>
      <ol class="passi">
        <li><span>Tocca il tasto Condividi ${ICONE.condividi} nella barra di Safari.</span></li>
        <li><span>Scorri e scegli <strong>Aggiungi alla schermata Home</strong> ${ICONE.piu}, poi <strong>Aggiungi</strong>.</span></li>
        <li><span>Apri <strong>Nuotifica</strong> dall'icona sulla Home ed entra con lo stesso account.</span></li>
        <li><span>Tocca <strong>Attiva le notifiche</strong> e poi <strong>Consenti</strong>.</span></li>
      </ol>`;
  }
  if (d.android) {
    return `
      <p>Aggiungi Nuotifica alla schermata Home: la apri come un'app e le notifiche arrivano anche quando è chiusa.</p>
      ${stato.eventoInstalla ? '<button class="bottone" data-azione="installa">Installa Nuotifica</button>' : `
      <ol class="passi">
        <li><span>Tocca ${ICONE.menu} in alto a destra in Chrome.</span></li>
        <li><span>Scegli <strong>Aggiungi a schermata Home</strong> oppure <strong>Installa app</strong>.</span></li>
        <li><span>Apri <strong>Nuotifica</strong> dall'icona e tocca <strong>Attiva le notifiche</strong>.</span></li>
      </ol>`}`;
  }
  return '';
}

function vistaInstalla() {
  const d = dispositivo();
  const tokenQui = memoria('token');
  // Su iPhone il permesso si può chiedere solo dall'app aggiunta alla Home.
  const puoAttivareQui = d.pushPossibile && (d.inApp || !d.ios);
  const mostraPassi = !d.inApp && (d.ios || d.android);
  const bloccate = 'Notification' in window && Notification.permission === 'denied' && (d.inApp || !d.ios);

  disegna(`
    ${testata({ indietro: true })}
    <main class="pagina">
      <h1>${tokenQui ? 'Notifiche attive' : 'Attiva le notifiche'}</h1>
      ${tokenQui ? `
        <p class="intro">Su questo dispositivo è tutto pronto: quando esce qualcosa che segui, ti arriva una notifica.</p>
        <div class="pila">
          <button class="bottone bottone-vetro" data-azione="prova">Manda una notifica di prova</button>
          <a class="bottone" href="#/">Vai alle novità</a>
        </div>` : `
        ${mostraPassi ? passiInstallazione(d) : '<p class="intro">Un tocco e ci siamo: ti avvisiamo appena escono ammessi, start list e risultati.</p>'}
        ${bloccate ? `<p class="errore">Le notifiche sono bloccate. ${d.ios
    ? 'Apri Impostazioni → Notifiche → Nuotifica e attiva "Consenti notifiche".'
    : 'Sbloccale dalle impostazioni del sito (l\'icona accanto all\'indirizzo), poi ricarica la pagina.'}</p>` : ''}
        ${puoAttivareQui && !bloccate ? `
          <div class="pila">
            ${mostraPassi && d.android ? '<p class="nota">Oppure attivale subito in questo browser:</p>' : ''}
            <button class="bottone" data-azione="attiva">${ICONE.campana}<span>Attiva le notifiche</span></button>
          </div>` : ''}
        ${!d.pushPossibile && !d.ios ? '<p>Questo browser non supporta le notifiche. Prova con Chrome, Edge, Firefox o Safari aggiornati.</p>' : ''}
        <p class="errore" data-errore hidden></p>
        <div class="pila">
          <a class="link" href="#/">Più tardi</a>
        </div>`}
    </main>`, (el) => {
    el.querySelector('[data-azione="prova"]')?.addEventListener('click', notificaDiProva);
    el.querySelector('[data-azione="installa"]')?.addEventListener('click', async () => {
      const evento = stato.eventoInstalla;
      if (!evento) return;
      evento.prompt();
      await evento.userChoice;
      stato.eventoInstalla = null;
    });
    el.querySelector('[data-azione="attiva"]')?.addEventListener('click', async (e) => {
      const bottone = e.currentTarget;
      try {
        // Il permesso va chiesto subito, dentro il tocco.
        let permesso = Notification.permission;
        if (permesso === 'default') permesso = await Notification.requestPermission();
        if (permesso !== 'granted') {
          throw new Error(d.ios
            ? 'Le notifiche sono bloccate. Apri Impostazioni → Notifiche → Nuotifica e attiva "Consenti notifiche", poi riprova.'
            : 'Le notifiche sono bloccate per questo sito. Sbloccale dalle impostazioni del browser e riprova.');
        }
        await conAttesa(bottone, async () => {
          const reg = await navigator.serviceWorker.ready;
          const token = await api.attivaPush(stato.utente.uid, reg);
          memoria('token', token);
          if (stato.profilo) stato.profilo.pushOn = true;
        });
        avviso('Notifiche attivate.');
        vistaInstalla();
      } catch (err) {
        mostraErrore(el, err);
      }
    });
  });
}

/* ---------- novità ---------- */

function rigaGara(post) {
  const targhetta = targhettaPost(post);
  const tipi = [...new Set(post.file.map((f) => f.tipo))];
  const settore = post.settori.map((s) => NOME_SETTORE[s] ?? s).join(' / ');
  const ultimi = targhetta && post.novita?.tipo !== 'nuovo' ? fileNovita(post) : [];
  return `
    <li>
      <a class="gara ${targhetta ? 'gara-nuova' : ''}" href="#/post/${esc(post.id)}">
        <span class="gara-testa">
          <span class="gara-sport">${esc(settore)}</span>
          <span class="gara-quando">${esc(quando(post.ultimoCambio))}</span>
          ${targhetta ? `<span class="bollino">${esc(targhetta)}</span>` : ''}
        </span>
        <span class="gara-titolo">${esc(titoloPulito(post.titolo))}</span>
        ${ultimi.length ? `
          <span class="gara-novita"><b>${ultimi[0].aggiornato ? 'Aggiornato' : 'Aggiunto'}</b><span>${esc(etichettaLeggibile(ultimi[0].etichetta))}${ultimi.length > 1 ? ` e altri ${ultimi.length - 1}` : ''}</span></span>`
    : (tipi.length ? `<span class="tipi">${tipi.map((t) => `<span class="tipo">${esc(TIPO_BREVE[t] ?? t)}</span>`).join('')}</span>` : '')}
      </a>
    </li>`;
}

function barraStato() {
  const s = stato.statoSito;
  if (!s?.ultimoControllo) return '';
  if (s.esito === 'sito-non-raggiungibile') {
    return `<p class="barra-stato ko"><span class="pallino" aria-hidden="true"></span>Il sito della FIN Lazio non risponde. Riproviamo da soli.</p>`;
  }
  return `<p class="barra-stato"><span class="pallino" aria-hidden="true"></span>Sito FIN Lazio controllato ${esc(quando(s.ultimoControllo))}</p>`;
}

async function vistaHome() {
  const d = dispositivo();
  const p = stato.profilo;
  const mancaPush = !memoria('token') && (d.pushPossibile || d.ios);

  const corpo = () => {
    if (stato.posts === null) return '<p class="caricamento" role="status">Carico le novità…</p>';
    const miei = stato.posts.filter((post) => interessa(post, p));
    const nuovi = miei.filter((post) => targhettaPost(post));
    const sport = (p.settori ?? []).filter((s) => miei.some((post) => post.settori.includes(s)));
    if (stato.filtro !== 'tutto' && stato.filtro !== 'nuovi' && !sport.includes(stato.filtro)) stato.filtro = 'tutto';

    let mostrati = miei;
    if (stato.filtro === 'nuovi') mostrati = nuovi;
    else if (stato.filtro !== 'tutto') mostrati = miei.filter((post) => post.settori.includes(stato.filtro));

    const filtri = [
      { id: 'tutto', nome: 'Tutto' },
      { id: 'nuovi', nome: 'Da vedere', conta: nuovi.length },
      ...(sport.length > 1 ? sport.map((s) => ({ id: s, nome: NOME_SETTORE[s] })) : []),
    ];

    if (!miei.length) {
      return `<div class="vuoto"><strong>Per ora niente</strong><p>Appena il Comitato pubblica qualcosa per i tuoi sport lo trovi qui e ti arriva una notifica.</p><a class="bottone bottone-vetro" href="#/impostazioni">Cambia sport</a></div>`;
    }
    const anima = stato.animaElenco && !pocoMovimento;
    stato.animaElenco = false;
    return `
      <div class="filtri" role="toolbar" aria-label="Filtra le novità">
        ${filtri.map((f) => `<button class="filtro" data-filtro="${esc(f.id)}" aria-pressed="${stato.filtro === f.id}">${esc(f.nome)}${f.conta ? `<span class="conta">${f.conta}</span>` : ''}</button>`).join('')}
      </div>
      ${mostrati.length
    ? `<ol class="gare ${anima ? 'gare-anima' : ''}">${mostrati.map(rigaGara).join('')}</ol>`
    : '<div class="vuoto"><strong>Sei in pari</strong><p>Hai già visto tutte le novità.</p></div>'}`;
  };

  // Tornando da un post si riparte dal punto dell'elenco in cui si era.
  const scrollA = stato.scrollHome ?? 0;
  stato.scrollHome = 0;
  const ridisegna = (aggiornamento = false) => disegna(`
    ${testata()}
    <main class="pagina pagina-elenco">
      ${barraStato()}
      ${mancaPush ? `<a class="richiamo" href="#/installa"><span class="richiamo-icona">${ICONE.campana}</span><span class="richiamo-testo"><strong>Attiva le notifiche</strong><small>Così gli ammessi ti arrivano appena escono.</small></span></a>` : ''}
      <h1 class="nascosto">Le tue novità</h1>
      ${corpo()}
      ${piede()}
    </main>`, (el) => {
    el.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => {
      stato.filtro = b.dataset.filtro;
      memoria('filtro', stato.filtro);
      ridisegna(true);
    }));
  }, { aggiornamento, scrollA });

  ridisegna();

  // Dati freschi al massimo ogni 20 secondi (tornando indietro dai post non si ricarica tutto).
  if (stato.aggiornatoIl && Date.now() - stato.aggiornatoIl < 20_000) return;
  stato.aggiornatoIl = Date.now();
  try {
    const prima = improntaPosts(stato.posts);
    const [posts, statoSito] = await Promise.all([
      api.leggiPost(p.settori ?? []),
      api.leggiStato(),
    ]);
    stato.posts = posts;
    stato.statoSito = statoSito;
    salvaCopia();
    if (percorso() !== '') return;
    if (improntaPosts(posts) === prima && radice.querySelector('.gare, .vuoto')) {
      // Niente di nuovo: aggiorniamo solo la riga "controllato X minuti fa".
      const barra = radice.querySelector('.barra-stato');
      const nuova = barraStato();
      if (barra && nuova) barra.outerHTML = nuova;
    } else {
      ridisegna(true);
    }
  } catch (err) {
    stato.aggiornatoIl = 0;
    if (percorso() === '' && radice.querySelector('.caricamento')) {
      radice.querySelector('.caricamento').replaceWith(Object.assign(document.createElement('p'), {
        className: 'errore', textContent: err.message,
      }));
    }
  }
}

/* ---------- un post ---------- */

async function vistaPost(id) {
  const giaInElenco = stato.posts?.find((x) => x.id === id);
  if (giaInElenco) {
    disegnaPost(giaInElenco);
    try {
      const fresco = await api.leggiUnPost(id);
      if (fresco && percorso() === `post/${id}`
        && fresco.ultimoCambio?.getTime() !== giaInElenco.ultimoCambio?.getTime()) {
        disegnaPost(fresco, { aggiornamento: true });
      }
    } catch { /* restiamo con quello che abbiamo */ }
    return;
  }
  caricamento('Apro il post…');
  let post;
  try {
    post = await api.leggiUnPost(id);
  } catch (err) {
    disegna(`${testata({ indietro: true })}<main class="pagina"><p class="errore">${esc(err.message)}</p></main>`);
    return;
  }
  if (percorso() !== `post/${id}`) return;
  if (!post) {
    disegna(`${testata({ indietro: true })}<main class="pagina"><h1>Post non trovato</h1><p>Forse è stato tolto dal sito. Torna alle <a href="#/">novità</a>.</p></main>`);
    return;
  }
  disegnaPost(post);
}

function disegnaPost(post, { aggiornamento = false } = {}) {
  const vistoPrima = aggiornamento ? stato.vistoPrimaPost : (visti()[post.id] ? new Date(visti()[post.id]) : null);
  stato.vistoPrimaPost = vistoPrima;
  segnaVisto(post);
  const { inApp } = dispositivo();
  const destinazione = inApp ? '' : ' target="_blank" rel="noopener"';

  const novi = (f) => eRecente(f.aggiuntoIl) && (!vistoPrima || f.aggiuntoIl > vistoPrima);
  const file = [...post.file].sort((a, b) => (b.aggiuntoIl?.getTime() ?? 0) - (a.aggiuntoIl?.getTime() ?? 0));
  const recenti = post.novita?.quando && eRecente(post.novita.quando) ? fileNovita(post) : [];
  const righeNovita = recenti.slice(0, 3).map((f) => ({
    tipo: f.aggiornato ? 'AGGIORNATO' : (post.novita.tipo === 'nuovo' ? 'NUOVO' : 'AGGIUNTO'),
    nome: etichettaLeggibile(f.etichetta),
  }));

  disegna(`
    ${testata({ indietro: true })}
    <main class="pagina">
      <article class="post">
        <p class="post-meta"><span class="gara-sport">${esc(post.settori.map((s) => NOME_SETTORE[s] ?? s).join(' / '))}</span><span>aggiornato ${esc(quando(post.ultimoCambio))}</span></p>
        <h1>${esc(titoloPulito(post.titolo))}</h1>
        ${righeNovita.length ? tabellone(righeNovita, { titolo: `ULTIMA NOVITÀ ${oraTabellone(post.novita.quando)}`, anima: true, dalVivo: false }) : ''}
        ${file.length ? `
          <ul class="documenti">
            ${file.map((f) => `
              <li>
                <a class="documento ${novi(f) ? 'documento-nuovo' : ''}" href="${esc(f.url)}"${destinazione}>
                  <span class="documento-icona" aria-hidden="true">${esc((f.url.match(/\.(pdf|xlsx?|docx?|zip)(\?|#|$)/i)?.[1] ?? 'LINK').toUpperCase())}</span>
                  <span class="documento-corpo">
                    <span class="documento-riga">
                      <span class="tipo">${esc(TIPO_BREVE[f.tipo] ?? 'Documento')}</span>
                      ${novi(f) ? `<span class="bollino">${f.aggiornato ? 'Aggiornato' : 'Nuovo'}</span>` : ''}
                    </span>
                    <span class="documento-nome">${esc(etichettaLeggibile(f.etichetta))}</span>
                    <span class="documento-quando">Pubblicato ${esc(quando(f.aggiuntoIl))}</span>
                  </span>
                  ${ICONE.freccia}
                </a>
              </li>`).join('')}
          </ul>` : '<p class="nota">Questo post non ha documenti allegati: è un avviso. Il testo completo è sul sito della FIN Lazio.</p>'}
        <a class="bottone bottone-vetro" href="${esc(post.link)}"${destinazione}>Apri il post su finlazio.it</a>
      </article>
      ${piede()}
    </main>`, null, { aggiornamento });
}

/* ---------- privacy ---------- */

function vistaPrivacy() {
  disegna(`
    ${testata({ indietro: true })}
    <main class="pagina testo-lungo">
      <h1>Privacy</h1>
      <p>Nuotifica è un servizio gratuito e non ufficiale che controlla il sito pubblico del Comitato Regionale Lazio della Federazione Italiana Nuoto (finlazio.it) e ti manda una notifica quando escono documenti che ti interessano.</p>
      <h2>Chi gestisce i dati</h2>
      <p>Il titolare del trattamento è ${CONFIG.titolare ? esc(CONFIG.titolare) : 'il gestore di Nuotifica'}${CONFIG.contatto ? `, contattabile a <a href="mailto:${esc(CONFIG.contatto)}">${esc(CONFIG.contatto)}</a>` : ''}.</p>
      <h2>Quali dati usiamo</h2>
      <ul>
        <li>Il tuo indirizzo email, solo per farti entrare nel tuo account (con Google o con email e password).</li>
        <li>Le tue scelte: sport, gare e tipi di documento.</li>
        <li>Un codice tecnico per ogni dispositivo su cui attivi le notifiche.</li>
      </ul>
      <p>Non mandiamo email pubblicitarie, non usiamo pubblicità, non tracciamo cosa fai e non cediamo i dati a nessuno.</p>
      <h2>Perché</h2>
      <p>Solo per mandarti le notifiche che hai chiesto e farti accedere al tuo account. La base giuridica è il servizio che richiedi registrandoti.</p>
      <h2>Dove stanno</h2>
      <p>Account e preferenze sono salvati su Firebase (Google). Le notifiche passano da Firebase Cloud Messaging e, su iPhone, dal servizio di Apple.</p>
      <h2>Per quanto tempo</h2>
      <p>Finché hai un account. Se lo elimini dalle Impostazioni, cancelliamo subito preferenze e dispositivi collegati.</p>
      <h2>I tuoi diritti</h2>
      <p>Puoi cambiare le tue scelte dalle Impostazioni ed eliminare l'account quando vuoi. Puoi anche chiedere accesso, rettifica o cancellazione scrivendo al gestore e, se lo ritieni, rivolgerti al Garante per la protezione dei dati personali.</p>
      <h2>Minori</h2>
      <p>Se hai meno di 14 anni, chiedi a un genitore di registrarsi al posto tuo.</p>
      <p class="nota">${esc(AVVISO_NON_UFFICIALE)}</p>
    </main>`);
}

/* ---------- navigazione ---------- */

function percorso() {
  return location.hash.replace(/^#\/?/, '').split('?')[0];
}

async function mostra() {
  const p = percorso();
  let m;

  // Pagine aperte a tutti.
  if (p === 'privacy') return vistaPrivacy();
  if (stato.utente === undefined) return caricamento();
  if ((m = p.match(/^post\/([\w-]+)$/))) return vistaPost(m[1]);

  if (!stato.utente) return vistaOspite();
  if (!stato.utente.verificata && !stato.utente.conGoogle) return vistaVerifica();

  if (stato.profilo === undefined) {
    caricamento();
    try {
      stato.profilo = await api.leggiProfilo(stato.utente.uid);
      salvaCopia();
    } catch (err) {
      disegna(`${testata()}<main class="pagina"><p class="errore">${esc(err.message)}</p><div class="pila"><button class="bottone" onclick="location.reload()">Riprova</button></div></main>`);
      return null;
    }
  }
  if (!stato.profilo) return vistaImpostazioni({ primaVolta: true });

  if (p === 'impostazioni') return vistaImpostazioni();
  if (p === 'installa') return vistaInstalla();
  return vistaHome();
}

/** Dopo l'accesso confermato: rilegge il profilo in silenzio (potrebbe essere cambiato su un altro telefono). */
async function aggiornaProfiloInSilenzio() {
  try {
    const fresco = await api.leggiProfilo(stato.utente.uid);
    if (JSON.stringify(fresco) === JSON.stringify(stato.profilo ?? null)) return;
    stato.profilo = fresco;
    stato.aggiornatoIl = 0;
    salvaCopia();
    if (!fresco || percorso() === '') mostra();
  } catch { /* si riprova alla prossima apertura */ }
}

async function avvia() {
  let percorsoAttuale = percorso();
  window.addEventListener('hashchange', () => {
    stato.passi++;
    if (percorsoAttuale === '') stato.scrollHome = window.scrollY;
    percorsoAttuale = percorso();
    mostra();
  });

  // Quando si torna sull'app, ricarichiamo le novità.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && percorso() === '' && stato.profilo) {
      stato.aggiornatoIl = 0;
      vistaHome();
    }
  });

  // 1) Se abbiamo una copia dell'ultima volta, l'app si apre subito con quella.
  const copia = modoDemo ? null : leggiCopia();
  if (copia) {
    stato.utente = copia.utente;
    stato.profilo = copia.profilo;
    stato.posts = copia.posts;
    stato.statoSito = copia.statoSito;
    mostra();
  } else {
    caricamento();
  }

  // 2) Intanto carichiamo Firebase (o i dati di prova).
  try {
    if (modoDemo) {
      const { creaBackendDemo } = await import('./backend-demo.js');
      backend = creaBackendDemo();
    } else {
      const { creaBackendFirebase } = await import('./backend-firebase.js');
      backend = await creaBackendFirebase(CONFIG);
    }
  } catch {
    if (!copia) {
      disegna(`${testata()}<main class="pagina"><h1>Connessione assente</h1><p>Non riesco a caricare Nuotifica. Controlla internet e riprova.</p><div class="pila"><button class="bottone" onclick="location.reload()">Riprova</button></div></main>`);
    } else {
      avviso('Sei offline: vedi le ultime novità salvate.', 'errore');
    }
    return;
  }
  backendPronto(backend);

  // 3) Accesso confermato da Firebase.
  let primaConferma = true;
  backend.seguiAccesso((utente) => {
    const cambiato = stato.utente?.uid !== utente?.uid;
    const eraLaCopia = primaConferma && copia && !cambiato;
    primaConferma = false;
    stato.utente = utente;
    if (!utente) memoria('copia', null);
    if (cambiato) {
      stato.profilo = undefined;
      stato.posts = null;
      stato.statoSito = null;
      stato.aggiornatoIl = 0;
    }
    if (eraLaCopia) {
      // È la stessa persona della copia: la pagina è già giusta, aggiorniamo solo i dati.
      salvaCopia();
      aggiornaProfiloInSilenzio();
      return;
    }
    mostra();
  });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
  // Notifica toccata con l'app già aperta: il service worker ci dice dove andare.
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.tipo === 'apri' && e.data.url) {
      const destinazione = new URL(e.data.url, location.origin);
      if (destinazione.origin === location.origin) location.hash = destinazione.hash || '#/';
    }
  });
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  stato.eventoInstalla = e;
});
window.addEventListener('appinstalled', () => {
  stato.eventoInstalla = null;
  avviso('Nuotifica è installata: aprila dalla schermata Home.');
});

avvia();
