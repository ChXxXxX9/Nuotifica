// Consigli (chiunque manda un'idea o segnala un problema) e sezione Admin (solo per chi gestisce Cloro).
import {
  stato, api, esc, barraTop, disegna, caricamento, paginaErrore, ICONE, dispositivo, avviso, conAttesa,
  mostraErrore, percorso,
} from './nucleo.js';
import { quando } from './formato.js';

const TIPI = [
  { id: 'idea', nome: 'Idea' },
  { id: 'problema', nome: 'Problema' },
  { id: 'altro', nome: 'Altro' },
];
const NOME_TIPO = Object.fromEntries(TIPI.map((t) => [t.id, t.nome]));
const STATI = { nuovo: 'Inviato', letto: 'Letto', fatto: 'Fatto!' };

export async function eAdmin() {
  try {
    return Boolean(await api.sonoAdmin(stato.utente.uid));
  } catch {
    return false;
  }
}

/* ---------- consigli ---------- */

export async function vistaConsigli() {
  let miei = null;
  const ridisegna = () => disegna(`
    ${barraTop({ indietro: true, titolo: 'Consigli' })}
    <main class="pagina">
      <h1 class="titolo-pagina">Consigli</h1>
      <p class="intro">Cosa ti piacerebbe trovare in Cloro? Qualcosa non funziona? Scrivilo qui: lo leggiamo davvero.</p>
      <form class="modulo" novalidate>
        <div class="filtri" role="radiogroup" aria-label="Di cosa si tratta" style="padding-bottom:4px">
          ${TIPI.map((t, i) => `<label class="gettone"><input type="radio" name="tipo" value="${t.id}" ${i === 0 ? 'checked' : ''}><span class="gettone-testo">${t.nome}</span></label>`).join('')}
        </div>
        <label class="campo">Il tuo consiglio
          <textarea name="testo" rows="5" maxlength="1000" placeholder="Es. vorrei vedere anche…" required></textarea>
        </label>
        <p class="nota" data-conta>0/1000</p>
        <p class="errore" data-errore hidden></p>
        <button class="bottone" type="submit">${ICONE.invia}<span>Manda</span></button>
      </form>
      <section class="sezione">
        <div class="sezione-testa"><h2 class="sezione-titolo">I tuoi consigli</h2></div>
        ${miei === null ? '<p class="caricamento">Carico…</p>' : miei.length ? `
          <ul class="elenco">${miei.map((c) => `
            <li class="scheda consiglio">
              <div class="consiglio-testa"><span class="tipo">${esc(NOME_TIPO[c.tipo] ?? 'Altro')}</span><span>${esc(quando(c.creato))}</span><span class="stato-consiglio stato-${esc(c.stato)}">${esc(STATI[c.stato] ?? c.stato)}</span></div>
              <p>${esc(c.testo)}</p>
              ${c.risposta ? `<p class="risposta"><b>Risposta:</b> ${esc(c.risposta)}</p>` : ''}
            </li>`).join('')}</ul>` : '<p class="nota">Ancora nessuno: il primo è il più importante.</p>'}
      </section>
    </main>`, (el) => {
    const modulo = el.querySelector('form');
    const conta = el.querySelector('[data-conta]');
    modulo.testo.addEventListener('input', () => { conta.textContent = `${modulo.testo.value.length}/1000`; });
    modulo.addEventListener('submit', async (e) => {
      e.preventDefault();
      el.querySelector('[data-errore]').hidden = true;
      const testo = modulo.testo.value.trim();
      if (testo.length < 3) {
        mostraErrore(el, new Error('Scrivi qualche parola in più.'));
        return;
      }
      const d = dispositivo();
      try {
        await conAttesa(modulo.querySelector('[type="submit"]'), () => api.mandaConsiglio(stato.utente.uid, {
          testo,
          tipo: modulo.tipo.value,
          dispositivo: d.ios ? 'iPhone' : d.android ? 'Android' : 'Computer',
        }));
        avviso('Grazie! Consiglio inviato.');
        miei = await api.mieiConsigli(stato.utente.uid).catch(() => miei);
        ridisegna();
      } catch (err) {
        mostraErrore(el, err);
      }
    });
  }, { classeBody: 'senza-tab' });
  ridisegna();
  try {
    miei = await api.mieiConsigli(stato.utente.uid);
  } catch {
    miei = [];
  }
  if (percorso() === 'consigli') ridisegna();
}

/* ---------- admin ---------- */

export async function vistaAdmin() {
  if (!stato.admin && !(await eAdmin())) {
    disegna(`${barraTop({ indietro: true })}<main class="pagina"><h1 class="titolo-pagina">Solo per chi gestisce Cloro</h1><p class="intro">Questa sezione non è disponibile per il tuo account.</p></main>`);
    return;
  }
  caricamento('Apro la sezione admin…');
  let dati;
  try {
    dati = await api.datiAdmin();
  } catch (err) {
    paginaErrore(err);
    return;
  }
  if (percorso() !== 'admin') return;
  const filtro = stato.filtroAdmin ?? 'nuovo';
  const consigli = dati.consigli.filter((c) => filtro === 'tutti' || c.stato === filtro);
  const s = dati.stato ?? {};
  const b = dati.budget ?? {};
  disegna(`
    ${barraTop({ indietro: true, titolo: 'Admin' })}
    <main class="pagina">
      <h1 class="titolo-pagina">Admin</h1>
      <div class="cifre" style="margin-top:10px">
        <div class="cifra"><b>${dati.utenti ?? '–'}</b><small>Iscritti</small></div>
        <div class="cifra"><b>${dati.atleti ?? '–'}</b><small>Atleti</small></div>
        <div class="cifra"><b>${dati.consigli.filter((c) => c.stato === 'nuovo').length}</b><small>Consigli nuovi</small></div>
      </div>

      <section class="sezione">
        <div class="sezione-testa"><h2 class="sezione-titolo">Sistema</h2></div>
        <ul class="elenco elenco-admin">
          <li class="scheda"><b>Ultimo controllo avvisi</b><span>${esc(s.ultimoControllo ? quando(new Date(s.ultimoControllo)) : '–')} · ${esc(s.esito ?? '')}</span></li>
          <li class="scheda"><b>Firestore oggi</b><span>${b.scritture ?? 0} scritture su 20.000 · ${b.letture ?? 0} letture del controllore</span></li>
          ${s.messaggio ? `<li class="scheda"><b>Ultimo messaggio</b><span>${esc(String(s.messaggio).slice(0, 200))}</span></li>` : ''}
        </ul>
      </section>

      <section class="sezione">
        <div class="sezione-testa"><h2 class="sezione-titolo">Annuncio a tutti</h2></div>
        <form class="modulo" data-annuncio novalidate>
          <label class="campo">Titolo<input name="titolo" maxlength="60" required placeholder="Es. Cloro ha un nuovo indirizzo"></label>
          <label class="campo">Testo<textarea name="corpo" rows="3" maxlength="180" required placeholder="Arriva come notifica a tutti gli iscritti"></textarea></label>
          <p class="errore" data-errore hidden></p>
          <button class="bottone" type="submit">${ICONE.campana}<span>Manda la notifica a tutti</span></button>
          <p class="nota">Parte al prossimo giro del controllore (entro 5 minuti).</p>
        </form>
        ${dati.annunci.length ? `<ul class="elenco elenco-admin" style="margin-top:12px">${dati.annunci.map((a) => `
          <li class="scheda"><b>${esc(a.titolo)}</b><span>${esc(a.stato === 'inviato' ? `Inviato ${quando(a.inviato)} · ${a.notifiche ?? 0} notifiche` : 'In attesa del prossimo giro')}</span></li>`).join('')}</ul>` : ''}
      </section>

      <section class="sezione">
        <div class="sezione-testa"><h2 class="sezione-titolo">Consigli</h2></div>
        <div class="filtri" role="toolbar" aria-label="Filtra i consigli">
          ${[['nuovo', 'Nuovi'], ['letto', 'Letti'], ['fatto', 'Fatti'], ['tutti', 'Tutti']].map(([id, nome]) => `<button class="chip" data-filtro-admin="${id}" aria-pressed="${filtro === id}">${nome}</button>`).join('')}
        </div>
        ${consigli.length ? `<ul class="elenco">${consigli.map((c) => `
          <li class="scheda consiglio" data-id="${esc(c.id)}">
            <div class="consiglio-testa"><span class="tipo">${esc(NOME_TIPO[c.tipo] ?? 'Altro')}</span><span>${esc(quando(c.creato))} · ${esc(c.dispositivo ?? '')}</span><span class="stato-consiglio stato-${esc(c.stato)}">${esc(STATI[c.stato] ?? c.stato)}</span></div>
            <p>${esc(c.testo)}</p>
            ${c.risposta ? `<p class="risposta"><b>Risposta:</b> ${esc(c.risposta)}</p>` : ''}
            <textarea rows="2" maxlength="500" placeholder="Rispondi (la vede chi l'ha scritto)" aria-label="Risposta">${esc(c.risposta ?? '')}</textarea>
            <div class="dettaglio-azioni">
              <button class="bottone bottone-secondario bottone-piccolo" data-segna="letto">Letto</button>
              <button class="bottone bottone-piccolo" data-segna="fatto">Fatto</button>
            </div>
          </li>`).join('')}</ul>` : '<p class="nota">Nessun consiglio qui.</p>'}
      </section>
    </main>`, (el) => {
    el.querySelectorAll('[data-filtro-admin]').forEach((x) => x.addEventListener('click', () => {
      stato.filtroAdmin = x.dataset.filtroAdmin;
      vistaAdmin();
    }));
    el.querySelectorAll('[data-segna]').forEach((x) => x.addEventListener('click', async () => {
      const li = x.closest('[data-id]');
      try {
        await conAttesa(x, () => api.aggiornaConsiglio(li.dataset.id, {
          stato: x.dataset.segna,
          risposta: li.querySelector('textarea').value.trim(),
        }));
        avviso('Salvato.');
        vistaAdmin();
      } catch (err) {
        avviso(err.message, 'errore');
      }
    }));
    const modulo = el.querySelector('[data-annuncio]');
    modulo.addEventListener('submit', async (e) => {
      e.preventDefault();
      const titolo = modulo.titolo.value.trim();
      const corpo = modulo.corpo.value.trim();
      if (!titolo || !corpo) {
        mostraErrore(modulo, new Error('Scrivi titolo e testo.'));
        return;
      }
      // eslint-disable-next-line no-alert
      if (!window.confirm(`Mandare "${titolo}" a tutti gli iscritti?`)) return;
      try {
        await conAttesa(modulo.querySelector('[type="submit"]'), () => api.creaAnnuncio({ titolo, corpo }));
        avviso('Annuncio in partenza.');
        vistaAdmin();
      } catch (err) {
        mostraErrore(modulo, err);
      }
    });
  }, { classeBody: 'senza-tab' });
}
