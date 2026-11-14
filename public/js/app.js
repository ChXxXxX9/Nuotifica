import { CONFIG } from './config.js';
import {
  SETTORI, GRUPPI, TIPI, NOME_SETTORE, TIPO_BREVE, GIORNI_NOVITA, AVVISO_NON_UFFICIALE,
} from './costanti.js';
import {
  stato, api, backendCaricato, modoDemo, pocoMovimento, esc, memoria, dispositivo, percorso,
  avviso, mostraErrore, conAttesa, ICONE, tessera, barraTop, tabBar, piede, disegna, caricamento,
  paginaErrore, conCache, radice,
} from './nucleo.js';
import {
  tempo, nomeGara, periodo, quando, inCorso, iniziali, giorno, oggi,
} from './formato.js';
import { vistaGare, vistaGara, delLazio } from './viste-gare.js';
import { vistaAtleti, vistaAtleta, leggiSeguiti } from './viste-atleti.js';
import { forseBenvenuto } from './benvenuto.js';

stato.filtro = memoria('filtro') ?? 'tutto';

/* ---------- copia locale: l'app si apre subito con gli ultimi dati ---------- */

const VERSIONE_COPIA = 2;

export function salvaCopia() {
  if (modoDemo || !stato.utente) return;
  memoria('copia', {
    v: VERSIONE_COPIA,
    utente: stato.utente,
    profilo: stato.profilo ?? null,
    posts: stato.posts,
    statoSito: stato.statoSito,
    gare: stato.gare,
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
    gare: Array.isArray(c.gare) ? c.gare : null,
  };
}

function improntaPosts(posts) {
  return (posts ?? []).map((p) => `${p.id}:${p.ultimoCambio?.getTime?.() ?? ''}:${p.file?.length ?? 0}`).join('|');
}

/* ---------- avvisi del Comitato ---------- */

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

function fileNovita(post) {
  const ids = post.novita?.fileIds ?? [];
  return post.file.filter((f) => ids.includes(f.id));
}

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

function rigaAvviso(post) {
  const targhetta = targhettaPost(post);
  const tipi = [...new Set(post.file.map((f) => f.tipo))];
  const settore = post.settori.map((s) => NOME_SETTORE[s] ?? s).join(' / ');
  const ultimi = targhetta && post.novita?.tipo !== 'nuovo' ? fileNovita(post) : [];
  return `
    <li>
      <a class="avviso-post ${targhetta ? 'nuovo' : ''}" href="#/post/${esc(post.id)}">
        <span class="avviso-post-testa">
          <span class="sport">${esc(settore)}</span>
          <span>${esc(quando(post.ultimoCambio))}</span>
          ${targhetta ? `<span class="bollino">${esc(targhetta)}</span>` : ''}
        </span>
        <span class="avviso-post-titolo">${esc(titoloPulito(post.titolo))}</span>
        ${ultimi.length ? `
          <span class="avviso-post-novita"><b>${ultimi[0].aggiornato ? 'Aggiornato' : 'Aggiunto'}:</b> ${esc(etichettaLeggibile(ultimi[0].etichetta))}${ultimi.length > 1 ? ` e altri ${ultimi.length - 1}` : ''}</span>`
    : (tipi.length ? `<span class="tipi">${tipi.map((t) => `<span class="tipo">${esc(TIPO_BREVE[t] ?? t)}</span>`).join('')}</span>` : '')}
      </a>
    </li>`;
}

function barraStato() {
  const s = stato.statoSito;
  if (!s?.ultimoControllo) return '';
  if (s.esito === 'sito-non-raggiungibile') {
    return '<p class="barra-stato ko"><span class="pallino" aria-hidden="true"></span>Il sito del Comitato non risponde: riproviamo da soli.</p>';
  }
  return `<p class="barra-stato"><span class="pallino" aria-hidden="true"></span>Avvisi controllati ${esc(quando(s.ultimoControllo))}</p>`;
}

/* ---------- prima schermata (ospite) ---------- */

function vistaOspite() {
  const { inApp } = dispositivo();
  disegna(`
    ${modoDemo ? '<p class="striscia-demo">Anteprima con dati di esempio</p>' : ''}
    <main class="ospite">
      <div class="ospite-marchio">${tessera()}<span class="logo-parola">cloro</span></div>
      <h1>Il nuoto, <em>in diretta</em>.</h1>
      <ul class="punti-forti">
        <li>${ICONE.cronometro}<div><strong>Gare quasi in diretta</strong><span>Batterie, corsie, tempi e parziali man mano che arrivano.</span></div></li>
        <li>${ICONE.persone}<div><strong>Schede atleta</strong><span>Personali, punti e progressi. Segui chi vuoi: il suo tempo ti arriva sul telefono.</span></div></li>
        <li>${ICONE.campana}<div><strong>Avvisi del Comitato</strong><span>Ammessi, start list, orari e risultati: una notifica appena escono.</span></div></li>
      </ul>

      <div class="blocco-accesso">
        <button class="bottone bottone-google" data-azione="google">${ICONE.google}<span>Continua con Google</span></button>
        <button class="bottone bottone-secondario" data-azione="mostra-email">Entra con email e password</button>
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
          <p class="riga-link"><button type="button" class="link" data-azione="cambia-modo">Non hai un account? Creane uno</button></p>
          <p class="riga-link"><button type="button" class="link" data-azione="password-dimenticata">Ho dimenticato la password</button></p>
        </form>
      </div>
      ${piede()}
    </main>`, (el) => {
    let modoRegistrazione = false;
    const modulo = el.querySelector('[data-modulo="email"]');
    const erroreGoogle = el.querySelector('[data-errore-google]');
    api.prendiErroreAccesso?.().then?.((errRedirect) => {
      if (errRedirect) {
        erroreGoogle.textContent = errRedirect.message;
        erroreGoogle.hidden = false;
      }
    });

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
  }, { classeBody: 'senza-tab' });
}

function vistaVerifica() {
  disegna(`
    ${barraTop()}
    <main class="pagina">
      <h1 class="titolo-pagina">Conferma la tua email</h1>
      <p class="intro">Ti abbiamo mandato un link a <strong>${esc(stato.utente.email)}</strong>. Aprilo, poi torna qui e tocca "Ho confermato".</p>
      <p class="nota">Non la trovi? Guarda nello spam.</p>
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
  }, { classeBody: 'senza-tab' });
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
    ? '<button class="bottone bottone-secondario" data-azione="prova">Manda una notifica di prova</button><button class="link" data-azione="spegni-qui">Disattiva su questo dispositivo</button>'
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
    ${barraTop({ indietro: !primaVolta, titolo: primaVolta ? '' : 'Impostazioni' })}
    <main class="pagina">
      <h1 class="titolo-pagina">${primaVolta ? 'Quali avvisi vuoi?' : 'Impostazioni'}</h1>
      ${primaVolta ? '<p class="intro">Scegli gli avvisi del Comitato che ti interessano. Puoi cambiarlo quando vuoi.</p>' : ''}
      <form class="modulo-impostazioni" novalidate>
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
          <div class="gettoni" data-tipi ${tutto ? 'hidden' : ''} style="margin-top:12px">${opzioniSpunta('tipi', TIPI, tutto ? [] : tipi)}</div>
        </fieldset>
        <p class="errore" data-errore hidden style="margin-top:16px"></p>
        <div class="salva-fisso">
          <button class="bottone" type="submit">${primaVolta ? 'Salva e continua' : 'Salva'}</button>
        </div>
      </form>

      ${primaVolta ? '' : `
      ${riquadroNotifiche()}
      <section class="riquadro">
        <h2>Account</h2>
        <p class="nota">${esc(stato.utente.email ?? '')}</p>
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
      if (!window.confirm('Eliminare l\'account? Cancelliamo preferenze, atleti seguiti e dispositivi collegati. Non si può annullare.')) return;
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
  }, { classeBody: 'senza-tab' });
}

async function notificaDiProva() {
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification('Cloro', {
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
        <li><span>Apri <strong>Cloro</strong> dall'icona sulla Home ed entra con lo stesso account.</span></li>
        <li><span>Tocca <strong>Attiva le notifiche</strong> e poi <strong>Consenti</strong>.</span></li>
      </ol>`;
  }
  if (d.android) {
    return `
      <p>Aggiungi Cloro alla schermata Home: la apri come un'app e le notifiche arrivano anche quando è chiusa.</p>
      ${stato.eventoInstalla ? '<button class="bottone" data-azione="installa">Installa Cloro</button>' : `
      <ol class="passi">
        <li><span>Tocca ${ICONE.menu} in alto a destra in Chrome.</span></li>
        <li><span>Scegli <strong>Aggiungi a schermata Home</strong> oppure <strong>Installa app</strong>.</span></li>
        <li><span>Apri <strong>Cloro</strong> dall'icona e tocca <strong>Attiva le notifiche</strong>.</span></li>
      </ol>`}`;
  }
  return '';
}

function vistaInstalla() {
  const d = dispositivo();
  const tokenQui = memoria('token');
  const puoAttivareQui = d.pushPossibile && (d.inApp || !d.ios);
  const mostraPassi = !d.inApp && (d.ios || d.android);
  const bloccate = 'Notification' in window && Notification.permission === 'denied' && (d.inApp || !d.ios);

  disegna(`
    ${barraTop({ indietro: true })}
    <main class="pagina">
      <h1 class="titolo-pagina">${tokenQui ? 'Notifiche attive' : 'Attiva le notifiche'}</h1>
      ${tokenQui ? `
        <p class="intro">Su questo dispositivo è tutto pronto: quando esce qualcosa che segui, ti arriva una notifica.</p>
        <div class="pila">
          <button class="bottone bottone-secondario" data-azione="prova">Manda una notifica di prova</button>
          <a class="bottone" href="#/">Vai a Per te</a>
        </div>` : `
        ${mostraPassi ? passiInstallazione(d) : '<p class="intro">Un tocco e ci siamo: ti avvisiamo appena escono ammessi, start list e i tempi degli atleti che segui.</p>'}
        ${bloccate ? `<p class="errore">Le notifiche sono bloccate. ${d.ios
    ? 'Apri Impostazioni → Notifiche → Cloro e attiva "Consenti notifiche".'
    : 'Sbloccale dalle impostazioni del sito (l\'icona accanto all\'indirizzo), poi ricarica la pagina.'}</p>` : ''}
        ${puoAttivareQui && !bloccate ? `
          <div class="pila">
            ${mostraPassi && d.android ? '<p class="nota">Oppure attivale subito in questo browser:</p>' : ''}
            <button class="bottone" data-azione="attiva">${ICONE.campana}<span>Attiva le notifiche</span></button>
          </div>` : ''}
        ${!d.pushPossibile && !d.ios ? '<p>Questo browser non supporta le notifiche. Prova con Chrome, Edge, Firefox o Safari aggiornati.</p>' : ''}
        <p class="errore" data-errore hidden></p>
        <div class="pila"><a class="link" href="#/">Più tardi</a></div>`}
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
        let permesso = Notification.permission;
        if (permesso === 'default') permesso = await Notification.requestPermission();
        if (permesso !== 'granted') {
          throw new Error(d.ios
            ? 'Le notifiche sono bloccate. Apri Impostazioni → Notifiche → Cloro e attiva "Consenti notifiche", poi riprova.'
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
  }, { classeBody: 'senza-tab' });
}

/* ---------- Per te ---------- */

function cartaGara(g) {
  const live = inCorso(g);
  return `
    <a class="carta-gara ${live ? 'in-corso' : ''}" href="#/gara/${esc(g.id)}">
      <span class="carta-gara-testa">
        <span class="carta-gara-info">${esc(periodo(g.dal, g.al))} · ${esc(g.luogo ?? '')}</span>
        ${live ? (g.fonte === 'italia' ? '<span class="badge badge-tenue">IN CORSO</span>' : '<span class="live">LIVE</span>') : ''}
      </span>
      <span class="carta-gara-nome">${esc(g.nome)}</span>
      <span class="carta-gara-info">${g.vasca ? `Vasca ${esc(g.vasca)} m` : ''}${g.conta ? ` · ${g.conta} risultati` : (g.fonte === 'italia' ? ' · risultati a gara finita' : '')}</span>
    </a>`;
}

function rigaSeguito(a) {
  const ultimo = a.ultimo;
  return `
    <li>
      <a class="atleta-seguito" href="#/atleta/${encodeURIComponent(a.k)}">
        <span class="iniziali" aria-hidden="true">${esc(iniziali(a.n))}</span>
        <span style="min-width:0">
          <span class="nome" style="display:block">${esc(a.n)}</span>
          <span class="info" style="display:block">${ultimo ? `${esc(nomeGara(ultimo.c, { breve: true }))} · ${esc(giorno(ultimo.d))}` : esc(a.s ?? '')}</span>
        </span>
        <span class="destra">
          ${ultimo?.t ? `<span class="tempo">${esc(tempo(ultimo.t))}</span>` : ''}
          ${ultimo?.b ? `<span class="badge ${ultimo.b === 'PB' ? 'badge-pb' : 'badge-sb'}">${ultimo.b}</span>` : (ultimo?.pt ? `<span class="punti">${ultimo.pt} pt</span>` : '')}
        </span>
      </a>
    </li>`;
}

async function vistaPerTe() {
  const d = dispositivo();
  const p = stato.profilo;
  const mancaPush = !memoria('token') && (d.pushPossibile || d.ios);

  const sezioneGare = () => {
    if (!stato.gare?.length) return '';
    const lazio = stato.gare.filter((g) => delLazio(g) && g.dal <= oggi());
    const inGara = lazio.filter((g) => inCorso(g) && g.fonte === 'diretta');
    const elenco = inGara.length ? inGara : lazio.slice(0, 4);
    if (!elenco.length) return '';
    return `
      <section class="sezione">
        <div class="sezione-testa">
          <h2 class="sezione-titolo">${inGara.length ? 'In vasca adesso' : 'Ultime gare'}</h2>
          <a href="#/gare">Tutte</a>
        </div>
        <div class="carosello">${elenco.map(cartaGara).join('')}</div>
      </section>`;
  };

  const sezioneSeguiti = () => {
    const seguiti = p.seguiti ?? [];
    if (!seguiti.length) {
      return `
        <section class="sezione">
          <div class="sezione-testa"><h2 class="sezione-titolo">I tuoi atleti</h2></div>
          <div class="vuoto"><strong>Segui un atleta</strong>Te stesso, tuo figlio, un compagno: appena esce un suo tempo ti arriva una notifica.
            <a class="bottone bottone-piccolo" href="#/atleti">Cerca un atleta</a></div>
        </section>`;
    }
    const schede = stato.seguitiDati;
    return `
      <section class="sezione">
        <div class="sezione-testa"><h2 class="sezione-titolo">I tuoi atleti</h2><a href="#/atleti">Cerca</a></div>
        ${schede ? `<ul class="elenco">${schede.map(rigaSeguito).join('')}</ul>` : '<p class="caricamento">Carico i tuoi atleti…</p>'}
      </section>`;
  };

  const sezioneAvvisi = () => {
    if (stato.posts === null) return '<section class="sezione"><p class="caricamento" role="status">Carico gli avvisi…</p></section>';
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
    return `
      <section class="sezione">
        <div class="sezione-testa"><h2 class="sezione-titolo">Avvisi del Comitato</h2><a href="#/impostazioni">Scegli</a></div>
        ${miei.length ? `
          <div class="filtri" role="toolbar" aria-label="Filtra gli avvisi">
            ${filtri.map((f) => `<button class="chip" data-filtro="${esc(f.id)}" aria-pressed="${stato.filtro === f.id}">${esc(f.nome)}${f.conta ? `<span class="conta">${f.conta}</span>` : ''}</button>`).join('')}
          </div>
          ${mostrati.length
    ? `<ul class="elenco">${mostrati.map(rigaAvviso).join('')}</ul>`
    : '<div class="vuoto"><strong>Sei in pari</strong>Hai già visto tutti gli avvisi.</div>'}`
    : '<div class="vuoto"><strong>Per ora niente</strong>Appena il Comitato pubblica qualcosa per i tuoi sport lo trovi qui.</div>'}
        ${barraStato()}
      </section>`;
  };

  const scrollA = stato.scrollHome ?? 0;
  stato.scrollHome = 0;
  const ridisegna = (aggiornamento = false) => disegna(`
    ${barraTop({ azioni: `<a class="tasto-icona" href="#/impostazioni" aria-label="Impostazioni">${ICONE.ingranaggio}</a>` })}
    <main class="pagina">
      <h1 class="nascosto">Per te</h1>
      ${mancaPush ? `<a class="richiamo" href="#/installa">${ICONE.campana}<span><strong>Attiva le notifiche</strong><small>Tempi dei tuoi atleti e avvisi appena escono.</small></span></a>` : ''}
      ${sezioneGare()}
      ${sezioneSeguiti()}
      ${sezioneAvvisi()}
      ${piede()}
    </main>
    ${tabBar('')}`, (el) => {
    el.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => {
      stato.filtro = b.dataset.filtro;
      memoria('filtro', stato.filtro);
      ridisegna(true);
    }));
  }, { aggiornamento, scrollA });

  ridisegna();

  // Dati freschi al massimo ogni 20 secondi.
  if (stato.aggiornatoIl && Date.now() - stato.aggiornatoIl < 20_000) return;
  stato.aggiornatoIl = Date.now();
  const prima = `${improntaPosts(stato.posts)}#${JSON.stringify(stato.gare)}#${JSON.stringify(stato.seguitiDati)}`;
  try {
    const [posts, statoSito, gare, seguitiDati] = await Promise.all([
      api.leggiAvvisi(p.settori ?? []),
      api.leggiStato(),
      api.leggiGare().catch(() => stato.gare ?? []),
      leggiSeguiti(p.seguiti ?? []).catch(() => stato.seguitiDati ?? []),
    ]);
    stato.posts = posts;
    stato.statoSito = statoSito;
    stato.gare = gare;
    stato.seguitiDati = seguitiDati;
    salvaCopia();
    if (percorso() !== '') return;
    const dopo = `${improntaPosts(posts)}#${JSON.stringify(gare)}#${JSON.stringify(seguitiDati)}`;
    if (dopo === prima && radice.querySelector('.elenco, .vuoto')) {
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

/* ---------- un avviso ---------- */

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
  caricamento('Apro l\'avviso…');
  let post;
  try {
    post = await api.leggiUnPost(id);
  } catch (err) {
    paginaErrore(err);
    return;
  }
  if (percorso() !== `post/${id}`) return;
  if (!post) {
    disegna(`${barraTop({ indietro: true })}<main class="pagina"><h1 class="titolo-pagina">Avviso non trovato</h1><p class="intro">Forse è stato tolto. Torna a <a href="#/">Per te</a>.</p></main>`);
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

  disegna(`
    ${barraTop({ indietro: true })}
    <main class="pagina">
      <article>
        <p class="post-meta"><span class="sport">${esc(post.settori.map((s) => NOME_SETTORE[s] ?? s).join(' / '))}</span><span>aggiornato ${esc(quando(post.ultimoCambio))}</span></p>
        <h1 class="titolo-pagina" style="font-size:22px;letter-spacing:-.5px">${esc(titoloPulito(post.titolo))}</h1>
        ${recenti.length ? `
          <div class="novita-box">
            <strong>${post.novita.tipo === 'nuovo' ? 'NUOVO' : 'ULTIMA NOVITÀ'} · ${esc(quando(post.novita.quando)).toUpperCase()}</strong>
            <ul>${recenti.slice(0, 4).map((f) => `<li>${f.aggiornato ? 'Aggiornato: ' : ''}${esc(etichettaLeggibile(f.etichetta))}</li>`).join('')}</ul>
          </div>` : ''}
        ${file.length ? `
          <ul class="documenti">
            ${file.map((f) => `
              <li>
                <a class="documento ${novi(f) ? 'documento-nuovo' : ''}" href="${esc(f.url)}"${destinazione}>
                  <span class="documento-icona" aria-hidden="true">${esc((f.url.match(/\.(pdf|xlsx?|docx?|zip)(\?|#|$)/i)?.[1] ?? 'LINK').toUpperCase())}</span>
                  <span>
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
          </ul>` : '<p class="nota" style="margin:14px 0">Questo avviso non ha documenti allegati: il testo completo è nella pagina originale.</p>'}
        <a class="bottone bottone-secondario" href="${esc(post.link)}"${destinazione}>Apri la pagina originale</a>
      </article>
      ${piede()}
    </main>`, null, { aggiornamento, classeBody: 'senza-tab' });
}

/* ---------- classifiche (in arrivo) ---------- */

function vistaClassifiche() {
  disegna(`
    ${barraTop()}
    <main class="pagina">
      <div class="presto">
        ${tessera()}
        <h1>Classifiche in arrivo</h1>
        <p class="intro">Stiamo preparando la prossima parte di Cloro.</p>
        <ul>
          <li>Graduatorie del Lazio con chi sale e chi scende, come le classifiche musicali</li>
          <li>Tempi limite di Regionali, Criteria e Assoluti: quanto ti manca</li>
          <li>"Quanto vale questo tempo?": punti e posizione di un tempo qualsiasi</li>
          <li>"Sei in start list": ti avvisiamo quando compare il tuo nome</li>
        </ul>
      </div>
    </main>
    ${tabBar('classifiche')}`);
}

/* ---------- privacy ---------- */

function vistaPrivacy() {
  disegna(`
    ${barraTop({ indietro: true })}
    <main class="pagina testo-lungo">
      <h1 class="titolo-pagina">Privacy</h1>
      <p>Cloro è un servizio gratuito e non ufficiale: raccoglie risultati, tempi e avvisi già pubblicati online da federazioni, comitati e organizzatori delle gare, e te li mostra in un unico posto, con notifiche.</p>
      <h2>Chi gestisce i dati</h2>
      <p>Il titolare del trattamento è ${CONFIG.titolare ? esc(CONFIG.titolare) : 'il gestore di Cloro'}${CONFIG.contatto ? `, contattabile a <a href="mailto:${esc(CONFIG.contatto)}">${esc(CONFIG.contatto)}</a>` : ''}.</p>
      <h2>I dati del tuo account</h2>
      <ul>
        <li>Il tuo indirizzo email, solo per farti entrare (con Google o con email e password).</li>
        <li>Le tue scelte: avvisi che vuoi ricevere e atleti che segui.</li>
        <li>Un codice tecnico per ogni dispositivo su cui attivi le notifiche.</li>
      </ul>
      <p>Non usiamo pubblicità, non tracciamo cosa fai e non cediamo i dati a nessuno. Servono solo a farti entrare e a mandarti le notifiche che hai chiesto; la base giuridica è il servizio che richiedi registrandoti.</p>
      <h2>I dati sportivi degli atleti</h2>
      <p>Nomi, anno di nascita, società, gare, tempi e posizioni provengono da risultati pubblicati online da federazioni, comitati e organizzatori. Li mostriamo solo a chi ha fatto l'accesso, senza foto, per permettere di consultare risultati e progressi sportivi (legittimo interesse). Se sei un atleta, o il genitore di un atleta minorenne, puoi chiedere in qualsiasi momento di non comparire: scrivi al gestore e togliamo la scheda.</p>
      <h2>Dove stanno</h2>
      <p>Account, preferenze e risultati sono salvati su Firebase (Google). Le notifiche passano da Firebase Cloud Messaging e, su iPhone, dal servizio di Apple.</p>
      <h2>Per quanto tempo</h2>
      <p>I dati dell'account finché lo tieni: se lo elimini dalle Impostazioni cancelliamo subito preferenze, atleti seguiti e dispositivi collegati.</p>
      <h2>I tuoi diritti</h2>
      <p>Puoi chiedere accesso, rettifica, cancellazione o opposizione scrivendo al gestore e, se lo ritieni, rivolgerti al Garante per la protezione dei dati personali.</p>
      <h2>Minori</h2>
      <p>Se hai meno di 14 anni, chiedi a un genitore di registrarsi al posto tuo.</p>
      <p class="nota" style="margin-top:20px">${esc(AVVISO_NON_UFFICIALE)}</p>
    </main>`, null, { classeBody: 'senza-tab' });
}

/* ---------- navigazione ---------- */

async function mostra() {
  const p = percorso();
  let m;

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
      paginaErrore(err, { indietro: false });
      return null;
    }
  }
  if (!stato.profilo) return vistaImpostazioni({ primaVolta: true });

  forseBenvenuto();

  if (p === 'impostazioni') return vistaImpostazioni();
  if (p === 'installa') return vistaInstalla();
  if (p === 'gare') return vistaGare();
  if ((m = p.match(/^gara\/([\w-]+)$/))) return vistaGara(m[1]);
  if (p === 'atleti') return vistaAtleti();
  if ((m = p.match(/^atleta\/(.+)$/))) return vistaAtleta(decodeURIComponent(m[1]));
  if (p === 'classifiche') return vistaClassifiche();
  return vistaPerTe();
}
export { mostra };

/** Rilegge il profilo in silenzio (potrebbe essere cambiato su un altro telefono). */
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

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && percorso() === '' && stato.profilo) {
      stato.aggiornatoIl = 0;
      vistaPerTe();
    }
  });

  // 1) Se abbiamo una copia dell'ultima volta, l'app si apre subito con quella.
  const copia = modoDemo ? null : leggiCopia();
  if (copia) {
    stato.utente = copia.utente;
    stato.profilo = copia.profilo;
    stato.posts = copia.posts;
    stato.statoSito = copia.statoSito;
    stato.gare = copia.gare;
    mostra();
  } else {
    caricamento();
  }

  // 2) Intanto carichiamo Firebase (o i dati di prova).
  let backend;
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
      disegna(`${barraTop()}<main class="pagina"><h1 class="titolo-pagina">Connessione assente</h1><p class="intro">Non riesco a caricare Cloro. Controlla internet e riprova.</p><div class="pila"><button class="bottone" onclick="location.reload()">Riprova</button></div></main>`);
    } else {
      avviso('Sei offline: vedi gli ultimi dati salvati.', 'errore');
    }
    return;
  }
  backendCaricato(backend);

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
      stato.gare = null;
      stato.seguitiDati = null;
      stato.aggiornatoIl = 0;
      stato.cache.clear();
    }
    if (eraLaCopia) {
      salvaCopia();
      aggiornaProfiloInSilenzio();
      return;
    }
    mostra();
  });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
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
  avviso('Cloro è installata: aprila dalla schermata Home.');
});

// Per i moduli delle sezioni (evita import circolari): ridisegna la pagina corrente.
window.addEventListener('cloro:ridisegna', () => mostra());

if (!pocoMovimento) document.documentElement.classList.add('animazioni');
avvia();
