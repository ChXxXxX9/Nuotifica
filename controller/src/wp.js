// Lettura delle API pubbliche WordPress del sito degli avvisi (indirizzo nel secret FONTI).
import { PER_PAGINA } from './config.js';
import { USER_AGENT } from './fonti.js';

const CAMPI_POST = 'id,date_gmt,modified_gmt,title,link,categories,content';

async function attendi(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

export function creaWp({ fetchFn = fetch, base } = {}) {
  async function richiesta(percorso) {
    let ultimoErrore;
    for (let tentativo = 1; tentativo <= 3; tentativo++) {
      try {
        const risposta = await fetchFn(`${base}${percorso}`, {
          headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
          signal: AbortSignal.timeout(30_000),
        });
        // page oltre l'ultima: WordPress risponde 400 rest_post_invalid_page_number.
        if (risposta.status === 400) return { dati: [], totalePagine: 0 };
        if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`);
        return {
          dati: await risposta.json(),
          totalePagine: Number(risposta.headers.get('x-wp-totalpages') ?? 1),
        };
      } catch (e) {
        ultimoErrore = e;
        if (tentativo < 3) await attendi(2000 * tentativo);
      }
    }
    throw new Error(`Sito degli avvisi non raggiungibile: ${ultimoErrore?.message}`);
  }

  return {
    async categorie() {
      const tutte = [];
      for (let pagina = 1; pagina <= 5; pagina++) {
        const { dati, totalePagine } = await richiesta(
          `/categories?per_page=100&page=${pagina}&_fields=id,slug,parent,name`,
        );
        tutte.push(...dati);
        if (pagina >= totalePagine) break;
      }
      return tutte;
    },

    /**
     * Controllo rapido: solo id e data di modifica dell'ultimo post toccato.
     * Se non è cambiato dall'ultima volta, sul sito non è successo niente.
     */
    async ultimaModifica() {
      const { dati } = await richiesta('/posts?orderby=modified&order=desc&per_page=1&_fields=id,modified_gmt');
      const p = dati?.[0];
      return p ? { id: String(p.id), modificato: p.modified_gmt } : null;
    },

    /** Una pagina di post ordinati per "modified" o per "date", dal più recente. */
    async paginaPost(ordine, pagina, perPagina = PER_PAGINA) {
      const { dati } = await richiesta(
        `/posts?orderby=${ordine}&order=desc&per_page=${perPagina}&page=${pagina}&_fields=${CAMPI_POST}`,
      );
      return dati;
    },
  };
}
