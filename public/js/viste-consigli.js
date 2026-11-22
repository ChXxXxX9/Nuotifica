// Consigli (chiunque manda un'idea o segnala un problema) e sezione Admin (solo per chi gestisce Cloro).
import {
  stato, api, esc, barraTop, disegna, caricamento, paginaErrore, ICONE, dispositivo, avviso, conAttesa,
  mostraErrore, percorso, parametriHash,
} from './nucleo.js';
import { quando } from './formato.js';

const TIPI = [
  { id: 'idea', nome: 'Idea' },
  { id: 'problema', nome: 'Problema' },
  { id: 'altro', nome: 'Altro' },
  { id: 'errore', nome: 'Errore nei dati' },
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
  // "Segnala un errore" da un tempo o da una scheda: arriva con il riferimento.
  const p = parametriHash();
  const rif = (p.get('rif') ?? '').slice(0, 200);
  const tipoScelto = p.get('tipo') === 'errore' ? 'errore' : 'idea';
  const ridisegna = () => disegna(`
    ${barraTop({ indietro: true, titolo: 'Consigli' })}
    <main class="pagina">
      <h1 class="titolo-pagina">Consigli</h1>
      <p class="intro">Cosa ti piacerebbe trovare in Cloro? Qualcosa non funziona? Scrivilo qui: lo leggiamo davvero.</p>
      <form class="modulo" novalidate>
        <div class="filtri" role="radiogroup" aria-label="Di cosa si tratta" style="padding-bottom:4px">
          ${TIPI.map((t) => `<label class="gettone"><input type="radio" name="tipo" value="${t.id}" ${t.id === tipoScelto ? 'checked' : ''}><span class="gettone-testo">${t.nome}</span></label>`).join('')}
        </div>
        ${rif ? `<p class="nota">Riguarda: <b>${esc(rif)}</b></p>` : ''}
        <label class="campo">Il tuo consiglio
          <textarea name="testo" rows="5" maxlength="1000" placeholder="${rif ? 'Cosa non torna? Es. il tempo giusto è…' : 'Es. vorrei vedere anche…'}" required></textarea>
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
          rif: modulo.tipo.value === 'errore' ? rif : '',
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

/* ---------- admin: vedi viste-admin.js ---------- */

export { vistaAdmin } from './viste-admin.js';
