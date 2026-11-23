// Cloro si usa solo come app sulla schermata Home: istruzioni per installarla dal browser,
// trasloco dal vecchio indirizzo. Nel browser Cloro non si apre per nessuno (neanche per l'admin).
import {
  stato, api, esc, ICONE, tessera, disegna, piede, dispositivo, memoria, avviso, installata,
} from './nucleo.js';
import { CONFIG } from './config.js';

const indirizzo = () => (vecchioIndirizzo() ? CONFIG.indirizzo : location.host);

/** L'app è aperta dal vecchio indirizzo (prima del trasloco)? */
export function vecchioIndirizzo() {
  const host = location.hostname;
  return Boolean(CONFIG.trasferimento && CONFIG.indirizzo && host !== CONFIG.indirizzo
    && /\.(web\.app|firebaseapp\.com)$/.test(host));
}

const bottoneCopia = () => `
  <button class="bottone bottone-secondario" data-copia>
    <span>Copia l'indirizzo <b>${esc(indirizzo())}</b></span>
  </button>`;

function collegaCopia(el) {
  el.querySelectorAll('[data-copia]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(`https://${indirizzo()}/`);
      avviso('Indirizzo copiato.');
    } catch {
      avviso(`L'indirizzo è ${indirizzo()}`);
    }
  }));
}

/** I passaggi per aggiungere Cloro alla schermata Home, a seconda di telefono e browser. */
export function passiAggiunta(d) {
  if (d.browserInterno) {
    return `
      <p class="intro">Sei nel browser interno di un'altra app (Instagram, WhatsApp…): da qui non si può installare.</p>
      <ol class="passi">
        <li><span>Tocca ${ICONE.menu} e scegli <strong>Apri in ${d.ios ? 'Safari' : 'Chrome'}</strong>. Se non c'è, copia l'indirizzo qui sotto e incollalo in ${d.ios ? 'Safari' : 'Chrome'}.</span></li>
        <li><span>Lì segui i passaggi che trovi in questa pagina.</span></li>
      </ol>
      ${bottoneCopia()}`;
  }
  if (d.ios) {
    const altro = ['chrome-ios', 'firefox-ios', 'edge-ios'].includes(d.browser);
    return `
      <ol class="passi">
        <li><span>Tocca il tasto Condividi ${ICONE.condividi} ${altro ? 'in alto a destra, accanto all\'indirizzo' : 'nella barra di Safari. Con iOS 26 è dentro il menu <strong>···</strong> accanto all\'indirizzo'}.</span></li>
        <li><span>Scorri e scegli <strong>Aggiungi alla schermata Home</strong> ${ICONE.piu}. Se vedi l'opzione per aprirla come app web, lasciala attiva. Poi tocca <strong>Aggiungi</strong>.</span></li>
        <li><span>Chiudi ${altro ? 'il browser' : 'Safari'} e apri <strong>Cloro</strong> dall'icona <strong>Cl</strong> sulla schermata Home.</span></li>
        <li><span>Entra con Google o con email e password (se non hai un account, lo crei lì), poi tocca <strong>Attiva le notifiche</strong>.</span></li>
      </ol>
      ${altro ? '<p class="nota">Non trovi "Aggiungi alla schermata Home"? Aggiorna iOS oppure apri questo indirizzo in Safari.</p>' : ''}`;
  }
  if (d.android) {
    const menu = d.browser === 'samsung'
      ? `<li><span>Tocca il menu ${ICONE.menu} in basso a destra, poi <strong>Aggiungi pagina a</strong> → <strong>Schermata Home</strong>.</span></li>`
      : `<li><span>Tocca ${ICONE.menu} in alto a destra e scegli <strong>Installa app</strong> (o <strong>Aggiungi a schermata Home</strong>).</span></li>`;
    return `
      ${stato.eventoInstalla ? '<button class="bottone" data-azione="installa">Installa Cloro</button><p class="nota" style="margin-top:8px">Oppure, a mano:</p>' : ''}
      <ol class="passi">
        ${menu}
        <li><span>Conferma con <strong>Installa</strong> o <strong>Aggiungi</strong>.</span></li>
        <li><span>Apri <strong>Cloro</strong> dall'icona <strong>Cl</strong> sulla schermata Home ed entra con Google o con email e password (se non hai un account, lo crei lì).</span></li>
      </ol>`;
  }
  return `
    <p class="intro">Cloro è fatta per il telefono. Apri questo indirizzo dal browser del tuo telefono (Safari su iPhone, Chrome su Android) e segui i passaggi che ti mostra:</p>
    <p class="titolo-pagina" style="font-size:24px;word-break:break-all">${esc(indirizzo())}</p>
    ${bottoneCopia()}
    <h3 class="sezione-titolo" style="margin:18px 0 6px">Sul computer (per chi gestisce Cloro)</h3>
    ${stato.eventoInstalla ? '<button class="bottone" data-azione="installa">Installa Cloro</button><p class="nota" style="margin-top:8px">Oppure, a mano:</p>' : ''}
    <ol class="passi">
      <li><span>Apri questo indirizzo con <strong>Chrome</strong> o <strong>Edge</strong>.</span></li>
      <li><span>Clicca l'icona <strong>Installa</strong> ${ICONE.piu} a destra nella barra dell'indirizzo (oppure menu ${ICONE.menu} → <strong>Trasmetti, salva e condividi</strong> → <strong>Installa pagina come app</strong>).</span></li>
      <li><span>Apri <strong>Cloro</strong> dalla finestra che si apre (o dal menu Start / Applicazioni) ed entra con il tuo account.</span></li>
    </ol>`;
}

/** Pagina mostrata a chi apre Cloro nel browser invece che dall'app. */
export function vistaSoloApp() {
  const d = dispositivo();
  disegna(`
    <main class="ospite">
      <div class="ospite-marchio">${tessera()}<span class="logo-parola">cloro</span></div>
      <h1>Cloro si usa <em>come app</em>.</h1>
      <div>
        <p class="intro">Il nuoto in diretta sul telefono: gare con batterie e parziali, schede degli atleti, classifiche e una notifica quando escono ammessi, start list e i tempi di chi segui.</p>
        <p class="intro">Si installa dal sito, gratis e senza App Store: la apri al volo dalla schermata Home e le notifiche arrivano davvero. Ci vuole un minuto.</p>
      </div>
      <section class="scheda" style="padding:16px">
        <h2 class="sezione-titolo" style="margin-bottom:6px">${d.ios ? 'Su iPhone' : d.android ? 'Su Android' : 'Dal computer'}</h2>
        ${passiAggiunta(d)}
      </section>
      <p class="nota">${d.telefono ? 'Hai già aggiunto Cloro? Chiudi il browser e aprila dall\'icona <strong>Cl</strong> sulla schermata Home.' : 'Dal browser Cloro non si apre, nemmeno per chi la gestisce: si usa solo installata.'}</p>
      <p class="nota">Hai dei dubbi? Leggi le <a href="#/domande">Domande frequenti</a>.</p>
      ${piede()}
    </main>`, (el) => {
    collegaCopia(el);
    // Il vecchio permesso "dal computer" dell'admin non vale più.
    memoria('admin-pc', null);
    el.querySelector('[data-azione="installa"]')?.addEventListener('click', async () => {
      const evento = stato.eventoInstalla;
      if (!evento) return;
      evento.prompt();
      const { outcome } = await evento.userChoice;
      stato.eventoInstalla = null;
      if (outcome === 'accepted') avviso('Fatto! Ora apri Cloro dall\'icona sulla schermata Home.');
    });
  }, { classeBody: 'senza-tab' });
}

/* ---------- trasloco: dal vecchio indirizzo si passa per forza a quello nuovo ---------- */

/** Nel browser si va subito al nuovo indirizzo; nell'app installata si spiega come rimetterla. */
export function gestisciTrasloco() {
  if (!vecchioIndirizzo()) return false;
  if (!installata()) {
    location.replace(`https://${CONFIG.indirizzo}/${location.search}${location.hash}`);
    return true;
  }
  vistaTrasloco();
  return true;
}

export function vistaTrasloco() {
  const d = dispositivo();
  const nuovo = CONFIG.indirizzo;
  const passi = d.ios ? `
      <li><span>Tocca <strong>Copia l'indirizzo</strong> qui sotto.</span></li>
      <li><span>Apri <strong>Safari</strong>, incolla l'indirizzo in alto e vai.</span></li>
      <li><span>Tocca Condividi ${ICONE.condividi} → <strong>Aggiungi alla schermata Home</strong> ${ICONE.piu} → <strong>Aggiungi</strong>.</span></li>
      <li><span>Apri la nuova <strong>Cloro</strong>, entra con lo stesso account (Google o email) e tocca <strong>Attiva le notifiche</strong>.</span></li>
      <li><span>Infine togli questa: tieni premuta la vecchia icona → <strong>Rimuovi app</strong> → <strong>Elimina app</strong>.</span></li>`
    : d.android ? `
      <li><span>Tocca <strong>Copia l'indirizzo</strong> qui sotto.</span></li>
      <li><span>Apri <strong>Chrome</strong>, incolla l'indirizzo in alto e vai.</span></li>
      <li><span>Tocca ${ICONE.menu} in alto a destra → <strong>Installa app</strong> → <strong>Installa</strong>.</span></li>
      <li><span>Apri la nuova <strong>Cloro</strong>, entra con lo stesso account e tocca <strong>Attiva le notifiche</strong>.</span></li>
      <li><span>Infine togli questa: tieni premuta la vecchia icona → <strong>Disinstalla</strong>.</span></li>`
    : `
      <li><span>Apri <strong>${esc(nuovo)}</strong> dal browser e installa l'app da lì.</span></li>
      <li><span>Entra con lo stesso account, poi disinstalla questa versione.</span></li>`;
  disegna(`
    <main class="ospite trasloco">
      <div class="ospite-marchio">${tessera()}<span class="logo-parola">cloro</span></div>
      <h1>Cloro ha <em>cambiato casa</em>.</h1>
      <p class="intro">Ora si apre da <strong>${esc(nuovo)}</strong>. Questa versione non si aggiorna più: rimetti Cloro sulla Home dal nuovo indirizzo, ci vuole un minuto.</p>
      <section class="scheda" style="padding:16px">
        <ol class="passi">${passi}</ol>
        <button class="bottone" data-copia><span>Copia l'indirizzo <b>${esc(nuovo)}</b></span></button>
        <a class="link" style="display:block;text-align:center;margin-top:12px" href="https://${esc(nuovo)}/" target="_blank" rel="noopener">Oppure apri ${esc(nuovo)}</a>
      </section>
      <p class="nota">Atleti seguiti, avvisi scelti e preferenze restano: sono salvati nel tuo account, non sul telefono.</p>
      ${piede()}
    </main>`, collegaCopia, { classeBody: 'senza-tab' });
}
