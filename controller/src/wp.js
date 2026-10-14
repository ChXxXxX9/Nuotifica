// Lettura delle API pubbliche WordPress del sito finlazio.it.
import { WP_BASE, USER_AGENT, PER_PAGINA } from './config.js';

const CAMPI_POST = 'id,date_gmt,modified_gmt,title,link,categories,content';

async function attendi(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

export function creaWp({ fetchFn = fetch, base = WP_BASE } = {}) {
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
    throw new Error(`Sito FIN Lazio non raggiungibile (${percorso}): ${ultimoErrore?.message}`);
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

    /** Una pagina di post ordinati per "modified" o per "date", dal più recente. */
    async paginaPost(ordine, pagina, perPagina = PER_PAGINA) {
      const { dati } = await richiesta(
        `/posts?orderby=${ordine}&order=desc&per_page=${perPagina}&page=${pagina}&_fields=${CAMPI_POST}`,
      );
      return dati;
    },
  };
}
