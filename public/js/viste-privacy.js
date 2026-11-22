// "Sei questo atleta o un suo genitore?": richiesta per togliere una scheda o per "Solo risultati".
// La richiesta la leggono solo l'admin (e il controllore, che avvisa l'admin). Niente foto o documenti:
// quelli arrivano via email.
import {
  stato, api, esc, barraTop, disegna, caricamento, mostraErrore, conAttesa, percorso, piede,
} from './nucleo.js';
import { leggiAtleta } from './viste-atleti.js';

export async function vistaRichiesta(k) {
  const qui = () => percorso() === `richiesta/${encodeURIComponent(k)}` || percorso() === `richiesta/${k}`;
  caricamento();
  const a = await leggiAtleta(k, { italia: true }).catch(() => null);
  if (!qui()) return;
  const nome = a?.n ?? k.replace(/-\d{4}$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const email = stato.utente?.email ?? '';
  disegna(`
    ${barraTop({ indietro: true })}
    <main class="pagina">
      <h1 class="titolo-pagina">Richiesta per la scheda di ${esc(nome)}</h1>
      <form class="modulo modulo-richiesta" novalidate>
        <fieldset>
          <legend>Cosa vuoi chiedere?</legend>
          <label class="opzione"><input type="radio" name="tipo" value="togli" checked><span class="opzione-testo">Togli questa scheda</span></label>
          <label class="opzione"><input type="radio" name="tipo" value="solo-risultati"><span class="opzione-testo">Solo risultati<small>niente avvisi quando compare negli elenchi</small></span></label>
        </fieldset>
        <fieldset>
          <legend>Chi sei?</legend>
          <label class="opzione"><input type="radio" name="chi" value="atleta"><span class="opzione-testo">Sono l'atleta (almeno 14 anni)</span></label>
          <label class="opzione"><input type="radio" name="chi" value="genitore"><span class="opzione-testo">Sono un genitore</span></label>
        </fieldset>
        <label class="campo">Come possiamo verificarlo? Scrivi il numero della tessera federale, oppure come preferisci dimostrarlo (foto della tessera, conferma della società).
          <textarea name="prova" rows="4" maxlength="300" required></textarea>
        </label>
        <label class="campo">Email per risponderti
          <input type="email" name="email" maxlength="120" autocomplete="email" value="${esc(email)}" required>
        </label>
        <p class="nota">Mentre verifichiamo, la scheda viene tolta dalla ricerca. Dopo la verifica la richiesta si applica entro 48 ore.</p>
        <p class="errore" data-errore hidden></p>
        <button class="bottone" type="submit">Invia richiesta</button>
      </form>
      ${piede()}
    </main>`, (el) => {
    const modulo = el.querySelector('form');
    modulo.addEventListener('submit', async (e) => {
      e.preventDefault();
      el.querySelector('[data-errore]').hidden = true;
      const dati = {
        atleta: k,
        nome: String(nome).slice(0, 80),
        tipo: modulo.tipo.value,
        chi: modulo.chi.value,
        prova: modulo.prova.value.trim().slice(0, 300),
        email: modulo.email.value.trim().slice(0, 120),
      };
      if (!dati.chi) return mostraErrore(el, new Error('Dicci se sei l\'atleta o un genitore.'));
      if (dati.prova.length < 3) return mostraErrore(el, new Error('Scrivi come possiamo verificarlo.'));
      if (!/^\S+@\S+\.\S+$/.test(dati.email)) return mostraErrore(el, new Error('Scrivi un\'email valida per risponderti.'));
      try {
        await conAttesa(modulo.querySelector('[type="submit"]'), () => api.inviaRichiestaPrivacy(stato.utente.uid, dati));
        disegna(`
          ${barraTop({ indietro: true })}
          <main class="pagina">
            <h1 class="titolo-pagina">Richiesta inviata</h1>
            <p class="intro">Richiesta inviata. Se serve altro ti scriviamo a ${esc(dati.email)}.</p>
            <a class="bottone bottone-secondario" href="#/">Torna a Per te</a>
          </main>`, null, { classeBody: 'senza-tab' });
      } catch (err) {
        mostraErrore(el, err);
      }
      return null;
    });
  }, { classeBody: 'senza-tab' });
}
