import { CONFIG } from './config.js';
import {
  SETTORI, GRUPPI, TIPI, NOME_SETTORE, TIPO_BREVE, GIORNI_NOVITA, AVVISO_NON_UFFICIALE,
} from './costanti.js';

const radice = document.getElementById('app');
const parametri = new URLSearchParams(location.search);
const configurato = Boolean(CONFIG.firebase.apiKey && CONFIG.firebase.projectId);
const modoDemo = parametri.has('demo') || !configurato;

const stato = {
  utente: undefined, // undefined = ancora non si sa; null = non ha fatto l'accesso
  profilo: undefined,
  posts: null,
  statoSito: null,
  eventoInstalla: null,
  passi: 0, // pagine visitate dentro l'app in questa sessione
};
let api;

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
const fmtMese = new Intl.DateTimeFormat('it-IT', { month: 'short' });
const fmtRel = new Intl.RelativeTimeFormat('it-IT', { numeric: 'auto' });

function quando(data) {
  if (!data) return '';
  const minuti = Math.round((Date.now() - data.getTime()) / 60_000);
  if (minuti < 1) return 'adesso';
  if (minuti < 60) return fmtRel.format(-minuti, 'minute');
  const oggi = new Date();
  const ieri = new Date(Date.now() - 86_400_000);
  if (data.toDateString() === oggi.toDateString()) return `oggi alle ${fmtOra.format(data)}`;
  if (data.toDateString() === ieri.toDateString()) return `ieri alle ${fmtOra.format(data)}`;
  return `${fmtGiorno.format(data)} alle ${fmtOra.format(data)}`;
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

function eRecente(data) {
  return data && Date.now() - data.getTime() < GIORNI_NOVITA * 86_400_000;
}

function visti() {
  return memoria('visti') ?? {};
}

function segnaVisto(post) {
  const elenco = visti();
  elenco[post.id] = post.ultimoCambio?.toISOString() ?? new Date().toISOString();
  // teniamo solo gli ultimi 200
  const chiavi = Object.keys(elenco);
  if (chiavi.length > 200) chiavi.slice(0, chiavi.length - 200).forEach((k) => delete elenco[k]);
  memoria('visti', elenco);
}

/** Il post ha novità che l'utente non ha ancora aperto? */
function targhettaPost(post) {
  const n = post.novita;
  if (!n?.quando || !eRecente(n.quando)) return null;
  const visto = visti()[post.id];
  if (visto && new Date(visto) >= n.quando) return null;
  if (n.tipo === 'nuovo') return 'Nuovo';
  const aggiunti = post.file.filter((f) => n.fileIds?.includes(f.id));
  return aggiunti.some((f) => f.aggiornato) ? 'Aggiornato' : 'Nuovi file';
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
  const el = document.createElement('div');
  el.className = `avviso avviso-${tipo}`;
  el.setAttribute('role', tipo === 'errore' ? 'alert' : 'status');
  el.textContent = testo;
  document.body.append(el);
  setTimeout(() => el.classList.add('via'), 3800);
  setTimeout(() => el.remove(), 4300);
}

function mostraErrore(contenitore, errore) {
  const box = contenitore.querySelector('[data-errore]');
  if (box) {
    box.textContent = errore?.message ?? String(errore);
    box.hidden = false;
  } else {
    avviso(errore?.message ?? String(errore), 'errore');
  }
}

async function conAttesa(bottone, fn) {
  bottone.disabled = true;
  bottone.setAttribute('aria-busy', 'true');
  try {
    return await fn();
  } finally {
    bottone.disabled = false;
    bottone.removeAttribute('aria-busy');
  }
}

/* ---------- pezzi comuni ---------- */

const ICONE = {
  ingranaggio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4.9a7.5 7.5 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.4A7.5 7.5 0 0 0 7 6.4l-2.4-.9-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-.9a7.5 7.5 0 0 0 2.6 1.5l.4 2.4h4l.4-2.4a7.5 7.5 0 0 0 2.6-1.5l2.4.9 2-3.4-2-1.6Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  indietro: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  condividi: '<svg viewBox="0 0 24 24" class="icona-inline" aria-label="Condividi"><path d="M12 3v12M8 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  piu: '<svg viewBox="0 0 24 24" class="icona-inline" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  menu: '<svg viewBox="0 0 24 24" class="icona-inline" aria-hidden="true"><circle cx="12" cy="5" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="19" r="1.8" fill="currentColor"/></svg>',
  documento: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 3v4h4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  google: '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>',
};

function corda() {
  const dischi = (n) => '<i></i>'.repeat(n);
  return `<div class="corda" aria-hidden="true"><span class="corda-fine">${dischi(5)}</span><span class="corda-mezzo">${dischi(140)}</span><span class="corda-fine">${dischi(5)}</span></div>`;
}

function testata({ indietro = false, impostazioni = true } = {}) {
  return `
    <header class="testata">
      ${indietro
    ? `<button class="tasto-icona" data-azione="indietro" aria-label="Indietro">${ICONE.indietro}</button>`
    : '<span class="tasto-icona-vuoto"></span>'}
      <a class="marchio" href="#/">Nuotifica</a>
      ${stato.utente && impostazioni
    ? `<a class="tasto-icona" href="#/impostazioni" aria-label="Impostazioni">${ICONE.ingranaggio}</a>`
    : '<span class="tasto-icona-vuoto"></span>'}
    </header>
    ${corda()}
    ${modoDemo ? `<p class="striscia-demo">Anteprima con dati di esempio${configurato ? '' : ': Firebase non è ancora collegato'}.</p>` : ''}`;
}

function piede() {
  return `
    <footer class="piede">
      <p>${esc(AVVISO_NON_UFFICIALE)}</p>
      <p><a href="#/privacy">Privacy</a></p>
    </footer>`;
}

function disegna(html, collega) {
  radice.innerHTML = html;
  radice.querySelector('[data-azione="indietro"]')?.addEventListener('click', () => {
    // Se si è arrivati da una notifica non c'è una pagina precedente nell'app: si va alla home.
    if (stato.passi > 0) history.back();
    else location.hash = '#/';
  });
  collega?.(radice);
  window.scrollTo(0, 0);
  const titolo = radice.querySelector('h1');
  document.title = titolo && titolo.textContent.trim() !== 'Nuotifica'
    ? `${titolo.textContent.trim()} – Nuotifica`
    : 'Nuotifica';
}

function caricamento(testo = 'Un attimo…') {
  radice.innerHTML = `${testata()}<main class="pagina"><p class="caricamento" role="status">${esc(testo)}</p></main>`;
}

/* ---------- viste ---------- */

function vistaOspite() {
  const { inApp } = dispositivo();
  disegna(`
    <main class="ospite">
      ${corda()}
      ${modoDemo ? '<p class="striscia-demo">Anteprima con dati di esempio.</p>' : ''}
      <h1 class="marchio-grande">Nuotifica</h1>
      <p class="sottotitolo">Ti avvisa quando sul sito della FIN Lazio escono ammessi, start list, orari e risultati delle tue gare.</p>

      <figure class="esempio-notifica">
        <div class="notifica-finta">
          <img src="/icons/icon-192.png" alt="" width="38" height="38">
          <div>
            <p class="nf-testa"><strong>Nuotifica</strong><span>ora</span></p>
            <p class="nf-titolo">Finali Campionato Regionale Estivo di Categoria</p>
            <p class="nf-corpo">Aggiornato: Elenco atleti ammessi alle gare</p>
          </div>
        </div>
        <figcaption>Tocchi la notifica e trovi subito il PDF.</figcaption>
      </figure>

      <div class="blocco-accesso">
        <button class="bottone bottone-google" data-azione="google">${ICONE.google}<span>Continua con Google</span></button>
        <button class="bottone bottone-secondario" data-azione="mostra-email">Usa la tua email</button>
        ${inApp ? '<p class="nota">Nell\'app installata, se Google non funziona usa l\'email e la password.</p>' : ''}

        <form class="modulo" data-modulo="email" hidden novalidate>
          <h2 data-titolo-modulo>Entra con la tua email</h2>
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
        <p class="errore" data-errore-google hidden></p>
      </div>
      ${piede()}
    </main>`, (el) => {
    let modoRegistrazione = false;
    const modulo = el.querySelector('[data-modulo="email"]');
    const erroreGoogle = el.querySelector('[data-errore-google]');
    const errRedirect = api.prendiErroreAccesso();
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
    el.querySelector('[data-azione="mostra-email"]').addEventListener('click', () => {
      modulo.hidden = false;
      modulo.querySelector('input').focus();
    });
    el.querySelector('[data-azione="cambia-modo"]').addEventListener('click', (e) => {
      modoRegistrazione = !modoRegistrazione;
      el.querySelector('[data-titolo-modulo]').textContent = modoRegistrazione ? 'Crea il tuo account' : 'Entra con la tua email';
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
  });
}

function vistaVerifica() {
  disegna(`
    ${testata()}
    <main class="pagina">
      <h1>Conferma la tua email</h1>
      <p>Ti abbiamo mandato un'email a <strong>${esc(stato.utente.email)}</strong>. Apri il link che contiene, poi torna qui e tocca "Ho confermato".</p>
      <p class="nota">Se non la trovi, guarda nella cartella spam.</p>
      <p class="errore" data-errore hidden></p>
      <div class="pila">
        <button class="bottone" data-azione="controlla">Ho confermato</button>
        <button class="bottone bottone-secondario" data-azione="rimanda">Mandala di nuovo</button>
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

function opzioniSpunta(nome, elenco, scelti, { tipo = 'checkbox', classe = 'gettone' } = {}) {
  return elenco.map((o) => `
    <label class="${classe}">
      <input type="${tipo}" name="${nome}" value="${esc(o.id)}" ${scelti.includes(o.id) ? 'checked' : ''}>
      <span class="${classe}-testo">${esc(o.nome)}${o.dettaglio ? `<small>${esc(o.dettaglio)}</small>` : ''}</span>
    </label>`).join('');
}

function vistaImpostazioni({ primaVolta = false } = {}) {
  const p = stato.profilo ?? {};
  const settori = p.settori ?? ['nuoto'];
  const gruppi = p.gruppi?.length ? p.gruppi : ['categoria', 'esordienti'];
  const tipi = p.tipi?.length ? p.tipi : ['tutti'];
  const tutto = tipi.includes('tutti');
  let canale = 'push';
  if (p.emailOn && p.pushOn) canale = 'entrambi';
  else if (p.emailOn) canale = 'email';
  const d = dispositivo();
  const tokenQui = memoria('token');

  disegna(`
    ${testata({ indietro: !primaVolta, impostazioni: !primaVolta })}
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
          <legend>Cosa vuoi ricevere</legend>
          <div class="opzioni-grandi due">
            <label class="opzione"><input type="radio" name="quanto" value="tutto" ${tutto ? 'checked' : ''}><span class="opzione-testo">Tutto<small>Ogni novità dei tuoi sport</small></span></label>
            <label class="opzione"><input type="radio" name="quanto" value="scelta" ${tutto ? '' : 'checked'}><span class="opzione-testo">Solo alcune cose<small>Scegli tu i documenti</small></span></label>
          </div>
          <div class="gettoni" data-tipi ${tutto ? 'hidden' : ''}>${opzioniSpunta('tipi', TIPI, tutto ? [] : tipi)}</div>
        </fieldset>

        <fieldset>
          <legend>Come ti avvisiamo</legend>
          <div class="opzioni-grandi">
            <label class="opzione"><input type="radio" name="canale" value="push" ${canale === 'push' ? 'checked' : ''}>
              <span class="opzione-testo">Notifiche sul telefono <em class="consigliato">Consigliato</em><small>Arrivano subito. Serve aggiungere Nuotifica alla schermata Home: ti spieghiamo come.</small></span></label>
            <label class="opzione"><input type="radio" name="canale" value="email" ${canale === 'email' ? 'checked' : ''}>
              <span class="opzione-testo">Email<small>A ${esc(stato.utente.email)}</small></span></label>
            <label class="opzione"><input type="radio" name="canale" value="entrambi" ${canale === 'entrambi' ? 'checked' : ''}>
              <span class="opzione-testo">Tutte e due</span></label>
          </div>
        </fieldset>

        <p class="errore" data-errore hidden></p>
        <button class="bottone" type="submit">${primaVolta ? 'Salva e continua' : 'Salva'}</button>
      </form>

      ${primaVolta ? '' : `
      <section class="sezione-account">
        <h2>Notifiche su questo dispositivo</h2>
        <p>${tokenQui ? 'Attive.' : (d.pushPossibile || d.ios ? 'Non attive.' : 'Questo browser non le supporta.')}</p>
        <div class="pila">
          ${tokenQui
    ? '<button class="bottone bottone-secondario" data-azione="prova">Manda una notifica di prova</button><button class="link" data-azione="spegni-qui">Disattiva su questo dispositivo</button>'
    : '<a class="bottone bottone-secondario" href="#/installa">Attiva le notifiche</a>'}
        </div>

        <h2>Account</h2>
        <p>${esc(stato.utente.email)}</p>
        <div class="pila">
          <button class="bottone bottone-secondario" data-azione="esci">Esci</button>
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
        pushOn: ['push', 'entrambi'].includes(modulo.canale.value),
        emailOn: ['email', 'entrambi'].includes(modulo.canale.value),
      };
      if (!nuovi.settori.length) return mostraErrore(el, new Error('Scegli almeno uno sport.'));
      if (nuovi.settori.includes('nuoto') && !nuovi.gruppi.length) {
        return mostraErrore(el, new Error('Per il nuoto scegli Categoria, Esordienti o tutte e due.'));
      }
      if (!nuovi.tipi.length) return mostraErrore(el, new Error('Scegli almeno un tipo di documento, oppure "Tutto".'));
      if (!nuovi.gruppi.length) nuovi.gruppi = ['categoria', 'esordienti'];

      try {
        await conAttesa(e.submitter ?? modulo.querySelector('[type="submit"]'), () => api.salvaProfilo(stato.utente.uid, nuovi));
        stato.profilo = { ...(stato.profilo ?? {}), ...nuovi };
        stato.posts = null;
        avviso('Impostazioni salvate.');
        location.hash = nuovi.pushOn && !memoria('token') ? '#/installa' : '#/';
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
      if (!window.confirm('Eliminare l\'account? Cancelliamo email, preferenze e dispositivi collegati. Non si può annullare.')) return;
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
      body: 'Le notifiche funzionano. Ti avviseremo qui quando esce qualcosa.',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: 'prova',
      data: { url: `${location.origin}/#/` },
    });
  } catch {
    avviso('Non sono riuscito a mostrare la notifica di prova.', 'errore');
  }
}

function passiInstallazione(d) {
  if (d.ios && d.browserInterno) {
    return `
      <p>Stai usando il browser interno di un'altra app. Su iPhone le notifiche funzionano solo dall'app installata con Safari.</p>
      <ol class="passi">
        <li>Tocca ${ICONE.menu} o il menu dell'app e scegli <strong>Apri in Safari</strong>.</li>
        <li>In Safari, torna su questa pagina e segui i passaggi.</li>
      </ol>`;
  }
  if (d.ios) {
    return `
      <p>Su iPhone e iPad è <strong>obbligatorio</strong>: Apple fa arrivare le notifiche solo alle app aggiunte alla schermata Home.</p>
      <ol class="passi">
        <li>Tocca il tasto Condividi ${ICONE.condividi} nella barra di Safari.</li>
        <li>Scorri e scegli <strong>Aggiungi alla schermata Home</strong> ${ICONE.piu}, poi <strong>Aggiungi</strong>.</li>
        <li>Apri <strong>Nuotifica</strong> dall'icona sulla Home ed entra con lo stesso account.</li>
        <li>Nell'app tocca <strong>Attiva le notifiche</strong> e poi <strong>Consenti</strong>.</li>
      </ol>`;
  }
  if (d.android) {
    return `
      <p>Aggiungila alla schermata Home: le notifiche arrivano anche ad app chiusa e la trovi come un'app normale.</p>
      ${stato.eventoInstalla ? '<button class="bottone" data-azione="installa">Installa Nuotifica</button>' : ''}
      <ol class="passi">
        <li>Tocca ${ICONE.menu} in alto a destra in Chrome.</li>
        <li>Scegli <strong>Aggiungi a schermata Home</strong> oppure <strong>Installa app</strong>.</li>
        <li>Apri <strong>Nuotifica</strong> dall'icona e tocca <strong>Attiva le notifiche</strong>.</li>
      </ol>`;
  }
  return '<p>Sul computer le notifiche funzionano anche direttamente dal browser.</p>';
}

function vistaInstalla() {
  const d = dispositivo();
  const tokenQui = memoria('token');
  // Su iPhone il permesso si può chiedere solo dall'app installata.
  const puoAttivareQui = d.pushPossibile && (d.inApp || !d.ios);
  const mostraPassi = !d.inApp && (d.ios || d.android);

  disegna(`
    ${testata({ indietro: true })}
    <main class="pagina">
      <h1>${tokenQui ? 'Notifiche attive' : 'Attiva le notifiche'}</h1>
      ${tokenQui ? `
        <p>Su questo dispositivo è tutto pronto: quando esce qualcosa che ti interessa, ti arriva una notifica.</p>
        <div class="pila">
          <button class="bottone bottone-secondario" data-azione="prova">Manda una notifica di prova</button>
          <a class="bottone" href="#/">Vai alle novità</a>
        </div>` : `
        ${mostraPassi ? passiInstallazione(d) : ''}
        ${puoAttivareQui ? `
          <div class="riquadro-attiva">
            ${mostraPassi && d.android ? '<p class="nota">Oppure attivale subito in questo browser:</p>' : ''}
            <button class="bottone" data-azione="attiva">Attiva le notifiche</button>
          </div>` : ''}
        ${!d.pushPossibile && !d.ios ? '<p>Questo browser non supporta le notifiche. Prova con Chrome, Edge, Firefox o Safari aggiornati, oppure ricevi gli avvisi via email.</p>' : ''}
        <p class="errore" data-errore hidden></p>
        <div class="pila">
          <button class="link" data-azione="email">Preferisco ricevere le email</button>
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
            : 'Le notifiche sono bloccate per questo sito. Sbloccale dalle impostazioni del browser (icona accanto all\'indirizzo) e riprova.');
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
    el.querySelector('[data-azione="email"]')?.addEventListener('click', async (e) => {
      try {
        await conAttesa(e.currentTarget, () => api.salvaProfilo(stato.utente.uid, { emailOn: true, pushOn: false }));
        Object.assign(stato.profilo, { emailOn: true, pushOn: false });
        avviso(`Ti scriveremo a ${stato.utente.email}.`);
        location.hash = '#/';
      } catch (err) {
        mostraErrore(el, err);
      }
    });
  });
}

function bloccoData(data) {
  if (!data) return '<span class="blocco"></span>';
  return `
    <span class="blocco" aria-hidden="true">
      <span class="blocco-giorno">${data.getDate()}</span>
      <span class="blocco-mese">${esc(fmtMese.format(data).replace('.', ''))}</span>
    </span>`;
}

function rigaPost(post) {
  const targhetta = targhettaPost(post);
  const tipi = [...new Set(post.file.map((f) => f.tipo))];
  const settore = post.settori.map((s) => NOME_SETTORE[s] ?? s).join(', ');
  return `
    <li>
      <a class="corsia ${targhetta ? 'corsia-nuova' : ''}" href="#/post/${esc(post.id)}">
        ${bloccoData(post.ultimoCambio)}
        <span class="corsia-corpo">
          <span class="corsia-meta">
            <span>${esc(settore)}, ${esc(quando(post.ultimoCambio))}</span>
            ${targhetta ? `<span class="galleggiante">${esc(targhetta)}</span>` : ''}
          </span>
          <span class="corsia-titolo">${esc(titoloPulito(post.titolo))}</span>
          ${tipi.length ? `<span class="tipi">${tipi.map((t) => `<span class="tipo">${esc(TIPO_BREVE[t] ?? t)}</span>`).join('')}</span>` : ''}
        </span>
      </a>
    </li>`;
}

function rigaStatoSito() {
  const s = stato.statoSito;
  if (!s?.ultimoControllo) return '';
  if (s.esito === 'sito-non-raggiungibile') {
    return `<p class="stato-sito stato-sito-ko">Il sito della FIN Lazio non risponde (${esc(quando(s.ultimoControllo))}). Riproviamo da soli ogni 15 minuti.</p>`;
  }
  return `<p class="stato-sito"><span class="pallino" aria-hidden="true"></span>Sito della FIN Lazio controllato ${esc(quando(s.ultimoControllo))}</p>`;
}

async function vistaHome() {
  const d = dispositivo();
  const p = stato.profilo;
  const mancaPush = p.pushOn && !memoria('token') && (d.pushPossibile || d.ios);

  const corpo = () => {
    if (stato.posts === null) return '<p class="caricamento" role="status">Carico le novità…</p>';
    const miei = stato.posts.filter((post) => interessa(post, p));
    if (!miei.length) {
      return `<div class="vuoto"><p>Non c'è ancora niente per i tuoi sport.</p><p>Appena il Comitato pubblica qualcosa lo trovi qui${p.pushOn ? ' e ti arriva una notifica' : ''}.</p><a class="bottone bottone-secondario" href="#/impostazioni">Cambia sport</a></div>`;
    }
    return `<ol class="corsie">${miei.map(rigaPost).join('')}</ol>`;
  };

  const ridisegna = () => disegna(`
    ${testata()}
    <main class="pagina pagina-elenco">
      ${rigaStatoSito()}
      ${mancaPush ? `<a class="richiamo" href="#/installa"><strong>Notifiche non attive su questo dispositivo.</strong> <span>Attivale</span></a>` : ''}
      <h1 class="nascosto">Le tue novità</h1>
      ${corpo()}
      ${piede()}
    </main>`);

  ridisegna();
  try {
    const [posts, statoSito] = await Promise.all([
      api.leggiPost(p.settori ?? []),
      api.leggiStato(),
    ]);
    stato.posts = posts;
    stato.statoSito = statoSito;
    if (percorso() === '') ridisegna();
  } catch (err) {
    if (percorso() === '') {
      radice.querySelector('.caricamento')?.replaceWith(Object.assign(document.createElement('p'), {
        className: 'errore', textContent: err.message,
      }));
    }
  }
}

async function vistaPost(id) {
  caricamento('Apro il post…');
  let post;
  try {
    post = await api.leggiUnPost(id);
  } catch (err) {
    disegna(`${testata({ indietro: true })}<main class="pagina"><p class="errore">${esc(err.message)}</p></main>`);
    return;
  }
  if (!post) {
    disegna(`${testata({ indietro: true })}<main class="pagina"><h1>Post non trovato</h1><p>Forse è stato tolto dal sito. Torna alle <a href="#/">novità</a>.</p></main>`);
    return;
  }
  const vistoPrima = visti()[post.id] ? new Date(visti()[post.id]) : null;
  segnaVisto(post);
  const { inApp } = dispositivo();
  const destinazione = inApp ? '' : ' target="_blank" rel="noopener"';

  const novi = (f) => eRecente(f.aggiuntoIl) && (!vistoPrima || f.aggiuntoIl > vistoPrima);
  const file = [...post.file].sort((a, b) => (b.aggiuntoIl?.getTime() ?? 0) - (a.aggiuntoIl?.getTime() ?? 0));

  disegna(`
    ${testata({ indietro: true })}
    <main class="pagina">
      <article class="post">
        <p class="post-meta">${esc(post.settori.map((s) => NOME_SETTORE[s] ?? s).join(', '))}, aggiornato ${esc(quando(post.ultimoCambio))}</p>
        <h1>${esc(titoloPulito(post.titolo))}</h1>
        ${file.length ? `
          <ul class="documenti">
            ${file.map((f) => `
              <li>
                <a class="documento ${novi(f) ? 'documento-nuovo' : ''}" href="${esc(f.url)}"${destinazione}>
                  <span class="documento-icona">${ICONE.documento}</span>
                  <span class="documento-corpo">
                    <span class="documento-riga">
                      <span class="tipo">${esc(TIPO_BREVE[f.tipo] ?? 'Documento')}</span>
                      ${novi(f) ? `<span class="galleggiante">${f.aggiornato ? 'Aggiornato' : 'Nuovo'}</span>` : ''}
                    </span>
                    <span class="documento-nome">${esc(etichettaLeggibile(f.etichetta))}</span>
                    <span class="documento-quando">Pubblicato ${esc(quando(f.aggiuntoIl))}</span>
                  </span>
                </a>
              </li>`).join('')}
          </ul>` : '<p class="nota">Questo post non ha documenti allegati: è un avviso. Il testo completo è sul sito della FIN Lazio.</p>'}
        <a class="bottone bottone-secondario originale" href="${esc(post.link)}"${destinazione}>Apri il post originale su finlazio.it</a>
      </article>
      ${piede()}
    </main>`);
}

function vistaPrivacy() {
  disegna(`
    ${testata({ indietro: true })}
    <main class="pagina testo-lungo">
      <h1>Privacy</h1>
      <p>Nuotifica è un servizio gratuito e non ufficiale che controlla il sito pubblico del Comitato Regionale Lazio della Federazione Italiana Nuoto (finlazio.it) e ti avvisa quando escono documenti che ti interessano.</p>
      <h2>Chi gestisce i dati</h2>
      <p>Il titolare del trattamento è ${CONFIG.titolare ? esc(CONFIG.titolare) : 'il gestore di Nuotifica'}${CONFIG.contatto ? `, contattabile a <a href="mailto:${esc(CONFIG.contatto)}">${esc(CONFIG.contatto)}</a>` : ''}.</p>
      <h2>Quali dati usiamo</h2>
      <ul>
        <li>Il tuo indirizzo email e, se entri con Google, il nome del tuo account.</li>
        <li>Le tue scelte: sport, gare, tipi di documento e come vuoi essere avvisato.</li>
        <li>Un codice tecnico per ogni dispositivo su cui attivi le notifiche.</li>
      </ul>
      <p>Non usiamo pubblicità, non tracciamo cosa fai e non vendiamo né cediamo i dati a nessuno.</p>
      <h2>Perché</h2>
      <p>Solo per mandarti gli avvisi che hai chiesto e per farti accedere al tuo account. La base giuridica è il servizio che richiedi registrandoti.</p>
      <h2>Dove stanno</h2>
      <p>Account e preferenze sono salvati su Firebase (Google). Le notifiche passano da Firebase Cloud Messaging e, su iPhone, dal servizio di Apple. Le email vengono spedite tramite Brevo (Sendinblue SAS, Francia).</p>
      <h2>Per quanto tempo</h2>
      <p>Finché hai un account. Se lo elimini dalle Impostazioni, cancelliamo subito email, preferenze e dispositivi collegati.</p>
      <h2>I tuoi diritti</h2>
      <p>Puoi vedere e cambiare le tue scelte dalle Impostazioni, smettere di ricevere email con il link in fondo a ogni messaggio ed eliminare l'account quando vuoi. Puoi anche chiedere accesso, rettifica o cancellazione scrivendo al gestore e, se lo ritieni, rivolgerti al Garante per la protezione dei dati personali.</p>
      <h2>Minori</h2>
      <p>Se hai meno di 14 anni, chiedi a un genitore di registrarsi al posto tuo.</p>
      <p class="nota">${esc(AVVISO_NON_UFFICIALE)}</p>
    </main>`);
}

async function vistaDisiscriviti(uid, token) {
  caricamento('Ti tolgo dalle email…');
  try {
    await api.disiscriviEmail(uid, token);
    disegna(`${testata()}<main class="pagina"><h1>Fatto</h1><p>Non riceverai più email da Nuotifica.</p><p>Se avevi attivato le notifiche sul telefono, quelle continuano ad arrivare: puoi spegnerle dalle <a href="#/impostazioni">Impostazioni</a>.</p></main>`);
  } catch {
    disegna(`${testata()}<main class="pagina"><h1>Link non valido</h1><p>Questo link non funziona più. Puoi spegnere le email dalle <a href="#/impostazioni">Impostazioni</a>, dopo aver fatto l'accesso.</p></main>`);
  }
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
  if ((m = p.match(/^disiscriviti\/([^/]+)\/([^/]+)$/))) return vistaDisiscriviti(m[1], m[2]);
  if (stato.utente === undefined) return caricamento();
  if ((m = p.match(/^post\/([\w-]+)$/))) return vistaPost(m[1]);

  if (!stato.utente) return vistaOspite();
  if (!stato.utente.verificata && !stato.utente.conGoogle) return vistaVerifica();

  if (stato.profilo === undefined) {
    caricamento();
    try {
      stato.profilo = await api.leggiProfilo(stato.utente.uid);
    } catch (err) {
      disegna(`${testata()}<main class="pagina"><p class="errore">${esc(err.message)}</p><button class="bottone" onclick="location.reload()">Riprova</button></main>`);
      return null;
    }
  }
  if (!stato.profilo) return vistaImpostazioni({ primaVolta: true });

  if (p === 'impostazioni') return vistaImpostazioni();
  if (p === 'installa') return vistaInstalla();
  return vistaHome();
}

async function avvia() {
  caricamento();
  if (modoDemo) {
    const { creaBackendDemo } = await import('./backend-demo.js');
    api = creaBackendDemo();
  } else {
    try {
      const { creaBackendFirebase } = await import('./backend-firebase.js');
      api = await creaBackendFirebase(CONFIG);
    } catch {
      disegna(`${testata()}<main class="pagina"><h1>Connessione assente</h1><p>Non riesco a caricare Nuotifica. Controlla internet e riprova.</p><button class="bottone" onclick="location.reload()">Riprova</button></main>`);
      return;
    }
  }

  api.seguiAccesso((utente) => {
    const cambiato = stato.utente?.uid !== utente?.uid;
    stato.utente = utente;
    if (cambiato) {
      stato.profilo = undefined;
      stato.posts = null;
    }
    mostra();
  });
  window.addEventListener('hashchange', () => {
    stato.passi++;
    mostra();
  });

  // Quando si torna sull'app, ricarichiamo le novità.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && percorso() === '' && stato.profilo) {
      vistaHome();
    }
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
