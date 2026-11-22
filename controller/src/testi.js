// Testo dei documenti PDF del Comitato, pagina per pagina: nell'app si può cercare dentro
// (nell'app installata il "Trova nella pagina" del browser non c'è).
//   testi/{id}      { p: [testo di ogni pagina], n: pagine, agg }
//   meta/testi      documenti già letti
import { tokensAttivi } from './invio.js';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { impronta } from './tempi.js';
import { comeData } from './firestore.js';
import { USER_AGENT } from './fonti.js';
import { eNascosto, soloRisultati } from './nascosti.js';
import { stagioneDi } from './categorie.js';

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
    .flatMap((p) => (p.file ?? []).map((f, indice) => ({
      url: f.url, quando: tempo(f.aggiuntoIl ?? p.ultimoCambio), post: String(p.id), indice, etichetta: f.etichetta ?? '', tipo: f.tipo ?? '',
    })))
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
  if (!daFare.length) return [];
  const letti = [];
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
      letti.push({ ...f, pagine });
    } catch (e) {
      log(`Testo di un documento non estratto: ${e.message}`);
      stato.fatti[id] = `errore ${adesso}`;
    }
  }
  // Si ricordano solo i documenti ancora negli avvisi recenti (l'elenco non cresce all'infinito).
  const attuali = new Set(posts.flatMap((p) => (p.file ?? []).map((f) => idTesto(f.url))));
  for (const id of Object.keys(stato.fatti)) if (!attuali.has(id)) delete stato.fatti[id];
  await db.scrivi('meta/testi', stato);
  return letti;
}

/* ---------- "Sei in start list" ---------- */

const pulito = (t = '') => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  .replace(/['’`]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim();

/** I modi in cui un nome può comparire in un elenco: "MARCO ROSSI", "ROSSI MARCO", "DE ROSSI MARIA CHIARA"… */
export function formeNome(nome = '') {
  const parole = pulito(nome).split(' ').filter(Boolean);
  const forme = new Set();
  for (let i = 0; i < parole.length; i++) forme.add([...parole.slice(i), ...parole.slice(0, i)].join(' '));
  return [...forme].filter((f) => f.length >= 5);
}

/**
 * Cerca un atleta nel testo di un documento. Se le righe con il nome hanno anche un anno di nascita,
 * deve essere il suo (così due omonimi non si confondono). Restituisce la forma trovata o null.
 */
export function trovaAtleta(pagine, { n, y }) {
  const forme = formeNome(n);
  for (const pagina of pagine) {
    for (const riga of pagina.split('\n')) {
      const r = ` ${pulito(riga)} `;
      const forma = forme.find((f) => r.includes(` ${f} `));
      if (!forma) continue;
      const anni = r.match(/\b(19|20)\d{2}\b/g);
      if (!anni || !y || anni.includes(String(y))) return forma;
    }
  }
  return null;
}

/** Sotto i 14 anni: età = anno di fine stagione meno anno di nascita (come le categorie). */
export function sotto14(anno, oggi = new Date().toISOString().slice(0, 10)) {
  if (!anno) return false;
  return stagioneDi(oggi) + 1 - Number(anno) < 14;
}

const TIPI_ELENCO = { ammessi: 'è tra gli ammessi', startlist: 'è in start list', iscritti: 'è tra gli iscritti' };

/** Avvisa chi segue un atleta che compare in un elenco appena uscito (ammessi, start list, iscritti). */
export async function avvisaElenchi({
  db, invio, sito, letti, log = console.log,
}) {
  const elenchi = letti.filter((d) => TIPI_ELENCO[d.tipo] || /ammess|start|iscritt|batteri/i.test(d.etichetta));
  if (!elenchi.length) return 0;
  const utenti = (await db.elenca('users')).filter((u) => u.seguiti?.length && u.pushOn !== false && u.tokens?.length);
  const chiavi = [...new Set(utenti.flatMap((u) => u.seguiti))];
  if (!chiavi.length) return 0;
  const schede = await db.leggiTanti(chiavi.map((k) => `atleti/${k}`));
  const trovati = new Map(); // chiave -> [{ doc, forma }]
  for (const k of chiavi) {
    // Nascosti e "Solo risultati": nessun avviso sugli elenchi.
    if (eNascosto(k) || soloRisultati(k)) continue;
    const a = schede.get(`atleti/${k}`);
    if (!a?.n) continue;
    for (const d of elenchi) {
      const forma = trovaAtleta(d.pagine, a);
      if (forma) {
        if (!trovati.has(k)) trovati.set(k, []);
        trovati.get(k).push({
          d, forma, nome: a.n, piccolo: sotto14(a.y),
        });
      }
    }
  }
  let inviate = 0;
  for (const u of utenti) {
    const loro = u.seguiti.flatMap((k) => trovati.get(k) ?? []);
    if (!loro.length) continue;
    // Sotto i 14 anni: notifica discreta, senza il titolo del documento (si vede aprendo l'app).
    let messaggi = loro.map(({
      d, nome, piccolo,
    }) => ({
      titolo: (piccolo ? `${nome} è in un elenco nuovo` : `${nome} ${TIPI_ELENCO[d.tipo] ?? 'è in un elenco nuovo'}`).slice(0, 60),
      corpo: piccolo ? 'Tocca per vederlo in Cloro.' : `${d.etichetta || 'Documento del Comitato'}: tocca per vederlo.`.slice(0, 180),
      url: `${sito}/#/post/${encodeURIComponent(d.post)}`,
      tag: `elenco-${idTesto(d.url)}-${nome}`.slice(0, 60),
    }));
    if (messaggi.length > 3) {
      messaggi = [{
        titolo: `I tuoi atleti sono in ${new Set(loro.map((x) => x.d.url)).size} elenchi nuovi`,
        corpo: `${[...new Set(loro.map((x) => x.nome.split(' ')[0]))].slice(0, 4).join(', ')}: apri Cloro per vederli.`,
        url: `${sito}/#/`,
        tag: 'elenchi-nuovi',
      }];
    }
    for (const token of tokensAttivi(u)) for (const m of messaggi) if (await invio.push(token, m) === 'ok') inviate++;
  }
  log(`Elenchi: ${elenchi.length} documenti, ${trovati.size} atleti seguiti trovati, ${inviate} notifiche.`);
  return inviate;
}
