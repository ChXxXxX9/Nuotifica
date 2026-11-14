// Testo dei documenti PDF del Comitato, pagina per pagina: nell'app si può cercare dentro
// (nell'app installata il "Trova nella pagina" del browser non c'è).
//   testi/{id}      { p: [testo di ogni pagina], n: pagine, agg }
//   meta/testi      documenti già letti
import { execFile } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { impronta } from './tempi.js';
import { comeData } from './firestore.js';
import { USER_AGENT } from './fonti.js';

const esegui = promisify(execFile);
const MAX_PER_GIRO = 6;
const MAX_BYTE = 900_000; // un documento Firestore arriva a 1 MB

export const idTesto = (url) => impronta(url);
export const ePdf = (url = '') => /\.pdf(\?|#|$)/i.test(url);

/** Pulisce il testo di una pagina: spazi in fondo alle righe e righe vuote ripetute. */
export function pulisciPagina(t = '') {
  return t.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

/** Scarica un PDF e ne estrae il testo (una voce per pagina). */
export async function testoPdf(url) {
  const cartella = await mkdtemp(join(tmpdir(), 'cloro-'));
  try {
    const file = join(cartella, 'd.pdf');
    await esegui('curl', ['-sS', '-L', '--max-time', '60', '-A', USER_AGENT, '-o', file, url]);
    if ((await stat(file)).size < 100) throw new Error('documento vuoto');
    const { stdout } = await esegui('pdftotext', ['-layout', '-enc', 'UTF-8', file, '-'], { maxBuffer: 64 * 1024 * 1024 });
    return stdout.split('\f').map(pulisciPagina).filter((p, i, tutte) => p || i < tutte.length - 1);
  } finally {
    await rm(cartella, { recursive: true, force: true });
  }
}

function elencoDaFare(posts, stato) {
  const tempo = (v) => new Date(v ?? 0).getTime();
  return posts
    .flatMap((p) => (p.file ?? []).map((f) => ({ url: f.url, quando: tempo(f.aggiuntoIl ?? p.ultimoCambio) })))
    .filter((f) => ePdf(f.url) && !stato.fatti?.[idTesto(f.url)])
    .sort((a, b) => b.quando - a.quando);
}

/** Quanti PDF aspettano il testo (per decidere se installare il lettore di PDF). */
export async function testiDaFare(db) {
  const posts = (await db.leggi('meta/avvisi'))?.posts ?? [];
  const stato = (await db.leggi('meta/testi')) ?? {};
  return elencoDaFare(posts, stato).length;
}

/** Un giro: i PDF degli avvisi recenti ancora senza testo, dai più nuovi. */
export async function aggiornaTesti({ db, adesso, log = console.log, estrai = testoPdf }) {
  const posts = (await db.leggi('meta/avvisi'))?.posts ?? [];
  const stato = (await db.leggi('meta/testi')) ?? {};
  stato.fatti ??= {};
  const daFare = elencoDaFare(posts, stato).slice(0, MAX_PER_GIRO);
  if (!daFare.length) return 0;
  let fatti = 0;
  for (const f of daFare) {
    const id = idTesto(f.url);
    try {
      let pagine = await estrai(f.url);
      // Documenti enormi: si tengono le prime pagine che stanno nel limite.
      let byte = 0;
      pagine = pagine.filter((p) => {
        byte += Buffer.byteLength(p);
        return byte < MAX_BYTE;
      });
      await db.scrivi(`testi/${id}`, { p: pagine, n: pagine.length, agg: comeData(adesso) });
      stato.fatti[id] = adesso;
      fatti++;
    } catch (e) {
      log(`Testo di un documento non estratto: ${e.message}`);
      stato.fatti[id] = `errore ${adesso}`;
    }
  }
  // Si ricordano solo i documenti ancora negli avvisi recenti (l'elenco non cresce all'infinito).
  const attuali = new Set(posts.flatMap((p) => (p.file ?? []).map((f) => idTesto(f.url))));
  for (const id of Object.keys(stato.fatti)) if (!attuali.has(id)) delete stato.fatti[id];
  await db.scrivi('meta/testi', stato);
  return fatti;
}
