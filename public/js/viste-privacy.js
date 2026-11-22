// "Sei questo atleta o un suo genitore?": richiesta per togliere una scheda o per "Solo risultati".
// La prova è per forza una foto della tessera federale (il numero da solo non basta). Richiesta e foto le
// leggono solo l'admin e il controllore; la foto si cancella 30 giorni dopo la chiusura della richiesta.
import {
  stato, api, esc, barraTop, disegna, caricamento, mostraErrore, conAttesa, percorso, piede,
} from './nucleo.js';
import { leggiAtleta } from './viste-atleti.js';
import { CONFIG } from './config.js';

// Il documento con la foto deve stare sotto 1 MB: la foto si rimpicciolisce finché ci sta.
const MAX_FOTO = 700_000;

/** Foto scelta dal telefono → JPEG ridotto in "data URL". */
export async function comprimiFoto(file) {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('Scegli una foto (JPG o PNG).');
  let img;
  try {
    img = await createImageBitmap(file);
  } catch {
    img = await new Promise((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error('Questa foto non si apre: prova con un\'altra (JPG o PNG).'));
      i.src = URL.createObjectURL(file);
    });
  }
  const larga = img.width;
  const alta = img.height;
  for (const lato of [1600, 1280, 1024, 800]) {
    const s = Math.min(1, lato / Math.max(larga, alta));
    const tela = document.createElement('canvas');
    tela.width = Math.round(larga * s);
    tela.height = Math.round(alta * s);
    const ctx = tela.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, tela.width, tela.height);
    ctx.drawImage(img, 0, 0, tela.width, tela.height);
    for (const q of [0.82, 0.7, 0.6]) {
      const url = tela.toDataURL('image/jpeg', q);
      if (url.length <= MAX_FOTO) return url;
    }
  }
  throw new Error('La foto è troppo pesante: prova a ritagliarla e riprova.');
}

export async function vistaRichiesta(k) {
  const qui = () => percorso() === `richiesta/${encodeURIComponent(k)}` || percorso() === `richiesta/${k}`;
  caricamento();
  const a = await leggiAtleta(k, { italia: true }).catch(() => null);
  if (!qui()) return;
  const nome = a?.n ?? k.replace(/-\d{4}$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const email = stato.utente?.email ?? '';
  const nostra = CONFIG.contatto;
  let foto = null;
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
        <fieldset class="campo-foto">
          <legend>Foto della tessera federale</legend>
          <p class="nota">Foto della tessera federale dell'atleta, in cui si vedano solo nome e numero (copri il resto). È obbligatoria: il numero da solo non basta.</p>
          <p class="nota">La vede solo chi gestisce Cloro e la cancelliamo ovunque entro 30 giorni dalla chiusura della richiesta.</p>
          <div class="anteprima-foto" data-anteprima hidden><img alt="Foto scelta"></div>
          <label class="bottone bottone-secondario scegli-foto">
            <input type="file" accept="image/*" data-foto>
            <span data-testo-foto>Scatta o scegli la foto</span>
          </label>
        </fieldset>
        <label class="campo">Vuoi aggiungere qualcosa? (facoltativo)
          <textarea name="prova" rows="3" maxlength="300"></textarea>
        </label>
        <label class="campo">Email per risponderti
          <input type="email" name="email" maxlength="120" autocomplete="email" value="${esc(email)}" required>
        </label>
        <p class="nota">Mentre verifichiamo, la scheda viene tolta dalla ricerca. Dopo la verifica la richiesta si applica entro 48 ore.</p>
        <p class="nota">Se ci servono altre informazioni ti scriviamo da <b>${esc(nostra)}</b>: la nostra email potrebbe finire nello spam, controlla anche lì.</p>
        <p class="errore" data-errore hidden></p>
        <button class="bottone" type="submit">Invia richiesta</button>
      </form>
      ${piede()}
    </main>`, (el) => {
    const modulo = el.querySelector('form');
    const scelta = el.querySelector('[data-foto]');
    const anteprima = el.querySelector('[data-anteprima]');
    scelta.addEventListener('change', async () => {
      el.querySelector('[data-errore]').hidden = true;
      const file = scelta.files?.[0];
      if (!file) return;
      el.querySelector('[data-testo-foto]').textContent = 'Preparo la foto…';
      try {
        foto = await comprimiFoto(file);
        anteprima.querySelector('img').src = foto;
        anteprima.hidden = false;
        el.querySelector('[data-testo-foto]').textContent = 'Cambia foto';
      } catch (err) {
        foto = null;
        anteprima.hidden = true;
        el.querySelector('[data-testo-foto]').textContent = 'Scatta o scegli la foto';
        mostraErrore(el, err);
      }
      scelta.value = '';
    });
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
        foto,
      };
      if (!dati.chi) return mostraErrore(el, new Error('Dicci se sei l\'atleta o un genitore.'));
      if (!dati.foto) return mostraErrore(el, new Error('Aggiungi la foto della tessera federale: senza la foto non possiamo verificare.'));
      if (!/^\S+@\S+\.\S+$/.test(dati.email)) return mostraErrore(el, new Error('Scrivi un\'email valida per risponderti.'));
      try {
        await conAttesa(modulo.querySelector('[type="submit"]'), () => api.inviaRichiestaPrivacy(stato.utente.uid, dati));
        foto = null;
        disegna(`
          ${barraTop({ indietro: true })}
          <main class="pagina">
            <h1 class="titolo-pagina">Richiesta inviata</h1>
            <p class="intro">Richiesta inviata. Se serve altro ti scriviamo a ${esc(dati.email)}.</p>
            <p class="nota">Ti scriviamo da <b>${esc(nostra)}</b>: se non vedi niente, controlla anche lo spam.</p>
            <a class="bottone bottone-secondario" href="#/" style="margin-top:16px">Torna a Per te</a>
          </main>`, null, { classeBody: 'senza-tab' });
      } catch (err) {
        mostraErrore(el, err);
      }
      return null;
    });
  }, { classeBody: 'senza-tab' });
}
