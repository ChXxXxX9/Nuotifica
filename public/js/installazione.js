// Cloro si usa solo come app sulla schermata Home: istruzioni per installarla
// (dal browser) e per reinstallarla (chi aveva ancora l'app di Nuotifica).
import {
  stato, esc, ICONE, tessera, barraTop, disegna, piede, dispositivo, memoria, avviso, installata,
} from './nucleo.js';
import { eraNuotifica } from './benvenuto.js';

const indirizzo = () => location.host;

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
        <li><span>Tocca il tasto Condividi ${ICONE.condividi} ${altro ? 'in alto a destra, accanto all\'indirizzo' : 'nella barra di Safari'}.</span></li>
        <li><span>Scorri e scegli <strong>Aggiungi alla schermata Home</strong> ${ICONE.piu}, poi <strong>Aggiungi</strong>.</span></li>
        <li><span>Chiudi ${altro ? 'il browser' : 'Safari'} e apri <strong>Cloro</strong> dall'icona <strong>Cl</strong> sulla schermata Home.</span></li>
        <li><span>Entra con il tuo account e tocca <strong>Attiva le notifiche</strong>.</span></li>
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
        <li><span>Apri <strong>Cloro</strong> dall'icona <strong>Cl</strong> sulla schermata Home ed entra con il tuo account.</span></li>
      </ol>`;
  }
  return `
    <p class="intro">Cloro è fatta per il telefono. Apri questo indirizzo dal browser del tuo telefono (Safari su iPhone, Chrome su Android) e segui i passaggi che ti mostra:</p>
    <p class="titolo-pagina" style="font-size:24px;word-break:break-all">${esc(indirizzo())}</p>
    ${bottoneCopia()}`;
}

/** Pagina mostrata a chi apre Cloro nel browser invece che dall'app. */
export function vistaSoloApp() {
  const d = dispositivo();
  disegna(`
    <main class="ospite">
      <div class="ospite-marchio">${tessera()}<span class="logo-parola">cloro</span></div>
      <h1>Cloro si usa <em>come app</em>.</h1>
      <p class="intro">Si installa dal sito, gratis e senza App Store: la apri al volo dalla schermata Home e le notifiche arrivano davvero. Ci vuole un minuto.</p>
      <section class="scheda" style="padding:16px">
        <h2 class="sezione-titolo" style="margin-bottom:6px">${d.ios ? 'Su iPhone' : d.android ? 'Su Android' : 'Dal computer'}</h2>
        ${passiAggiunta(d)}
      </section>
      ${d.telefono ? '<p class="nota">Hai già aggiunto Cloro? Chiudi il browser e aprila dall\'icona <strong>Cl</strong> sulla schermata Home.</p>' : ''}
      ${piede()}
    </main>`, (el) => {
    collegaCopia(el);
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

/* ---------- reinstallare (chi ha ancora l'app di Nuotifica sulla Home) ---------- */

const GIORNI_RIMANDO = 3;

/** Va consigliato di reinstallare? Solo nell'app installata quando era ancora Nuotifica. */
export function serveReinstallare() {
  if (!installata() || !eraNuotifica || memoria('reinstallata')) return false;
  const rimandato = memoria('reinstalla-rimanda');
  return !rimandato || Date.now() - rimandato > GIORNI_RIMANDO * 86_400_000;
}

export function richiamoReinstalla() {
  if (!serveReinstallare()) return '';
  return `
    <a class="richiamo richiamo-secondario" href="#/reinstalla">
      ${ICONE.aggiorna}
      <span><strong>Reinstalla Cloro sulla Home</strong><small>Per l'icona nuova e l'app aggiornata. Ci vuole un minuto.</small></span>
    </a>`;
}

export function vistaReinstalla() {
  const d = dispositivo();
  const passi = d.ios ? `
      <li><span>Esci da qui. Sulla schermata Home <strong>tieni premuta l'icona di Nuotifica</strong>, tocca <strong>Rimuovi app</strong> e poi <strong>Elimina</strong>.</span></li>
      <li><span>Apri <strong>Safari</strong> e vai su <strong>${esc(indirizzo())}</strong> (puoi copiarlo qui sotto).</span></li>
      <li><span>Tocca Condividi ${ICONE.condividi} → <strong>Aggiungi alla schermata Home</strong> ${ICONE.piu} → <strong>Aggiungi</strong>.</span></li>
      <li><span>Apri <strong>Cloro</strong> dalla nuova icona <strong>Cl</strong> ed entra con lo stesso account (Google o email).</span></li>
      <li><span>Tocca <strong>Attiva le notifiche</strong> e poi <strong>Consenti</strong>: con l'app nuova vanno riattivate una volta.</span></li>`
    : `
      <li><span>Esci da qui. Sulla schermata Home <strong>tieni premuta l'icona di Nuotifica</strong> e scegli <strong>Disinstalla</strong> (o trascinala su <strong>Rimuovi</strong>).</span></li>
      <li><span>Apri <strong>Chrome</strong> e vai su <strong>${esc(indirizzo())}</strong> (puoi copiarlo qui sotto).</span></li>
      <li><span>Tocca ${ICONE.menu} in alto a destra → <strong>Installa app</strong> → <strong>Installa</strong>.</span></li>
      <li><span>Apri <strong>Cloro</strong> dalla nuova icona <strong>Cl</strong>. Se te lo chiede, entra con lo stesso account e riattiva le notifiche.</span></li>`;
  disegna(`
    ${barraTop({ indietro: true })}
    <main class="pagina">
      <h1 class="titolo-pagina">Reinstalla Cloro</h1>
      <p class="intro">L'app sulla tua schermata Home è ancora quella di Nuotifica. Togliendola e rimettendola hai l'icona nuova e l'app sempre aggiornata.</p>
      <ol class="passi">${passi}</ol>
      ${bottoneCopia()}
      <p class="nota" style="margin-top:14px">Atleti seguiti, avvisi scelti e preferenze restano: sono salvati nel tuo account, non sul telefono.</p>
      <div class="pila">
        <button class="bottone" data-azione="fatto">L'ho già fatto</button>
        <button class="link" data-azione="dopo">Più tardi</button>
      </div>
    </main>`, (el) => {
    collegaCopia(el);
    el.querySelector('[data-azione="fatto"]').addEventListener('click', () => {
      memoria('reinstallata', true);
      location.hash = '#/';
    });
    el.querySelector('[data-azione="dopo"]').addEventListener('click', () => {
      memoria('reinstalla-rimanda', Date.now());
      location.hash = '#/';
    });
  }, { classeBody: 'senza-tab' });
}
