// Cerca dentro un documento del Comitato: il testo del PDF (estratto dal controllore) con la ricerca,
// perché nell'app installata il "Trova nella pagina" del browser non c'è.
import {
  stato, api, esc, barraTop, disegna, caricamento, paginaErrore, percorso, ICONE, dispositivo,
} from './nucleo.js';

/** Stesso identificativo del controllore: i primi 16 caratteri dello SHA-1 dell'indirizzo. */
export async function idTesto(url) {
  const hash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(url));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

export const ePdf = (url = '') => /\.pdf(\?|#|$)/i.test(url);

const escRegex = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Lettere accentate e non accentate valgono uguale ("liberta" trova "libertà").
const VARIANTI = {
  a: 'aàáâä', e: 'eèéêë', i: 'iìíîï', o: 'oòóôö', u: 'uùúûü', c: 'cç', n: 'nñ',
};
function regexRicerca(q) {
  const base = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
  if (base.length < 2) return null;
  const corpo = [...base].map((ch) => (VARIANTI[ch] ? `[${VARIANTI[ch]}]` : ch === ' ' ? '\\s+' : escRegex(ch))).join('');
  return new RegExp(corpo, 'gi');
}

function evidenzia(testo, re) {
  if (!re) return esc(testo);
  let html = '';
  let ultimo = 0;
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(testo)) !== null) {
    if (!m[0]) {
      re.lastIndex++;
      continue;
    }
    html += `${esc(testo.slice(ultimo, m.index))}<mark>${esc(m[0])}</mark>`;
    ultimo = m.index + m[0].length;
  }
  return html + esc(testo.slice(ultimo));
}

export async function vistaDocumento(idPost, indice) {
  const qui = () => percorso() === `documento/${idPost}/${indice}`;
  let post = stato.posts?.find((x) => x.id === idPost);
  if (!post) {
    caricamento('Apro il documento…');
    try {
      post = await api.leggiUnPost(idPost);
    } catch (err) {
      if (qui()) paginaErrore(err);
      return;
    }
  }
  const file = post?.file?.[Number(indice)];
  if (!qui()) return;
  if (!file) {
    disegna(`${barraTop({ indietro: true })}<main class="pagina"><h1 class="titolo-pagina">Documento non trovato</h1><p class="intro">Forse è stato tolto. Torna a <a href="#/">Per te</a>.</p></main>`, null, { classeBody: 'senza-tab' });
    return;
  }
  const { inApp } = dispositivo();
  const destinazione = inApp ? '' : ' target="_blank" rel="noopener"';
  const nome = file.etichetta || 'Documento';

  caricamento('Preparo la ricerca nel documento…');
  let testo = null;
  try {
    testo = await api.leggiTesto(await idTesto(file.url));
  } catch { /* testo non disponibile */ }
  if (!qui()) return;

  if (!testo?.p?.length) {
    disegna(`
      ${barraTop({ indietro: true, titolo: 'Cerca nel documento' })}
      <main class="pagina">
        <h1 class="titolo-pagina" style="font-size:22px">${esc(nome)}</h1>
        <div class="vuoto" style="margin-top:14px"><strong>Testo non ancora pronto</strong>${ePdf(file.url)
    ? 'Lo stiamo preparando: di solito ci vogliono pochi minuti dopo la pubblicazione. Se il PDF è una scansione (una foto) non si può cercare dentro.'
    : 'Si può cercare solo dentro i PDF.'}</div>
        <a class="bottone" href="${esc(file.url)}"${destinazione} style="margin-top:14px">${ICONE.documento}<span>Apri il documento</span></a>
      </main>`, null, { classeBody: 'senza-tab' });
    return;
  }

  const pagine = testo.p;
  disegna(`
    ${barraTop({ indietro: true, titolo: 'Cerca nel documento' })}
    <main class="pagina pagina-documento">
      <h1 class="titolo-pagina" style="font-size:20px;letter-spacing:-.3px">${esc(nome)}</h1>
      <div class="barra-cerca-doc">
        <label class="cerca">
          <span class="nascosto">Cerca nel documento</span>
          ${ICONE.cerca}
          <input type="search" placeholder="Cognome, squadra, gara…" autocomplete="off" enterkeyhint="search" value="${esc(stato.cercaDoc ?? '')}">
        </label>
        <div class="naviga-doc">
          <span data-conto>${pagine.length} ${pagine.length === 1 ? 'pagina' : 'pagine'}</span>
          <button class="tasto-icona" data-su aria-label="Risultato precedente" disabled>${ICONE.indietro}</button>
          <button class="tasto-icona giu" data-giu aria-label="Risultato successivo" disabled>${ICONE.indietro}</button>
        </div>
      </div>
      <div class="testo-doc" data-testo></div>
      <a class="bottone bottone-secondario" href="${esc(file.url)}"${destinazione} style="margin-top:16px">Apri il PDF originale</a>
    </main>`, (el) => {
    const input = el.querySelector('input');
    const box = el.querySelector('[data-testo]');
    const conto = el.querySelector('[data-conto]');
    const su = el.querySelector('[data-su]');
    const giu = el.querySelector('[data-giu]');
    let segni = [];
    let attuale = -1;
    const vai = (i) => {
      if (!segni.length) return;
      segni[attuale]?.classList.remove('attuale');
      attuale = (i + segni.length) % segni.length;
      const m = segni[attuale];
      m.classList.add('attuale');
      m.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      conto.textContent = `${attuale + 1} di ${segni.length}`;
    };
    const mostra = () => {
      const q = input.value;
      stato.cercaDoc = q;
      const re = regexRicerca(q);
      box.innerHTML = pagine.map((p, i) => `
        <section class="pagina-doc">
          ${pagine.length > 1 ? `<h2>Pagina ${i + 1}</h2>` : ''}
          <pre>${evidenzia(p, re)}</pre>
        </section>`).join('');
      segni = [...box.querySelectorAll('mark')];
      attuale = -1;
      su.disabled = giu.disabled = segni.length < 2;
      if (!re) {
        conto.textContent = `${pagine.length} ${pagine.length === 1 ? 'pagina' : 'pagine'}`;
      } else if (!segni.length) {
        conto.textContent = 'Nessun risultato';
      } else {
        vai(0);
      }
    };
    let attesa;
    input.addEventListener('input', () => {
      clearTimeout(attesa);
      attesa = setTimeout(mostra, 180);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
        vai(attuale + 1);
      }
    });
    su.addEventListener('click', () => vai(attuale - 1));
    giu.addEventListener('click', () => vai(attuale + 1));
    mostra();
    if (!input.value) input.focus();
  }, { classeBody: 'senza-tab' });
}
