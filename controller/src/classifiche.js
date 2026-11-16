// Classifiche nazionali e delle altre regioni, preparate su richiesta dall'app.
// L'app scrive richieste/{id}; il controllore (a ogni giro, poche per volta) legge la graduatoria
// e la salva in classifiche/{id}, dove la leggono tutti. Per la stagione in corso si rifanno ogni giorno.
//
// id = {stagione}-{vasca}-{gara}-{sesso}-{regione}-{categoria}
//   regione: "it" (tutta Italia) o il numero del comitato regionale; categoria: "tutte" o EB, EA, R, J, C, S
// (la categoria serve solo per l'Italia: le regioni si scaricano intere e si filtrano nell'app).
import { leggiGraduatoria, dividiNome, CODICI, aggiungiMovimenti } from './graduatorie.js';
import { chiaveAtleta, oggiRoma } from './tempi.js';
import { comeData } from './firestore.js';
import { stagione } from './gare.js';
import { REGOLE_BASE, anniCodice, etaCodice } from './categorie.js';

export const COMITATI = {
  1: 'Piemonte', 3: 'Lombardia', 5: 'Veneto', 6: 'Friuli Venezia Giulia', 7: 'Liguria', 8: 'Emilia Romagna', 9: 'Toscana',
  10: 'Umbria', 11: 'Marche', 12: 'Lazio', 13: 'Abruzzo', 14: 'Molise', 15: 'Campania', 16: 'Puglia', 17: 'Basilicata',
  18: 'Calabria', 19: 'Sicilia', 20: 'Sardegna', 21: 'Bolzano', 22: 'Trento',
};
const CODICE_FIN = Object.fromEntries(Object.entries(CODICI).map(([fin, c]) => [c, fin.padStart(2, '0')]));
const CODICI_CAT = ['EB', 'EA', 'R', 'R14', 'R1', 'R2', 'J', 'J1', 'J2', 'C', 'S'];
const MAX_PER_GIRO = 4;
const LIMITE = { it: 3000, regione: 5000 };

export const idClassifica = ({
  st, v, c, sx, reg, cat,
}) => `${st}-${v}-${c}-${sx}-${reg}-${cat}`;

/** Una richiesta ha senso? (l'app la scrive, ma non ci fidiamo a occhi chiusi). */
export function richiestaValida(r) {
  return (r.st === 'tutte' || (/^\d{4}$/.test(String(r.st)) && Number(r.st) >= 1967))
    && [25, 50].includes(Number(r.v)) && CODICE_FIN[r.c] && ['M', 'F'].includes(r.sx)
    && (r.reg === 'it' || COMITATI[r.reg]) && (r.cat === 'tutte' || (r.reg === 'it' && CODICI_CAT.includes(r.cat)));
}

/** Anni di nascita di una categoria (o di un suo anno, es. R14) in una stagione. */
export const anniCategoria = (cat, sx, st, regole = REGOLE_BASE) => anniCodice(cat, sx, st, regole);

/** Prepara una classifica: la scarica, la ordina e (stagione in corso) aggiunge i movimenti. */
export async function preparaClassifica({
  db, chiedi, r, adesso, regole,
}) {
  const sempre = r.st === 'tutte';
  const campi = {
    'solr[sesso]': r.sx,
    'solr[id_lunghezza_vasca]': Number(r.v) === 25 ? '1' : '2',
    // "Di sempre": tutte le stagioni; altrimenti la stagione agonistica scelta.
    'solr[kindtime]': sempre ? '1' : '3',
    ...(sempre ? {} : { 'solr[stagione]': String(r.st) }),
    'solr[codice_gara]': CODICE_FIN[r.c],
    'solr[id_comitato]': r.reg === 'it' ? '' : String(r.reg),
    'solr[limit]': String(r.reg === 'it' ? LIMITE.it : LIMITE.regione),
  };
  if (r.cat !== 'tutte') {
    if (sempre) {
      // Di sempre per categoria: l'età al momento della gara.
      const eta = etaCodice(r.cat, r.sx, stagione(oggiRoma(adesso)), regole);
      if (eta) {
        campi['solr[daleta]'] = String(eta.da);
        campi['solr[aleta]'] = String(eta.a);
      }
    } else {
      const anni = anniCategoria(r.cat, r.sx, r.st, regole);
      if (anni) {
        campi['solr[dalyob]'] = String(anni.dal);
        campi['solr[alyob]'] = String(anni.al);
      }
    }
  }
  const lette = leggiGraduatoria(await chiedi(campi)).filter((x) => !x.turno || /individuale/i.test(x.turno));
  const visti = new Set();
  const righe = [];
  for (const x of lette.sort((a, b) => a.ms - b.ms)) {
    const { cognome, nome } = dividiNome(x.nome);
    const k = chiaveAtleta(cognome, nome, x.anno);
    if (!k || visti.has(k)) continue;
    visti.add(k);
    righe.push({
      k, n: `${nome} ${cognome}`.trim(), y: x.anno, s: x.societa.join(' / '), valore: x.ms, d: x.data,
    });
  }
  const id = idClassifica(r);
  const dati = {
    righe: righe.map((x) => [x.k, x.n, x.y ?? '', x.s, x.valore, x.d ?? ''].join('|')),
    agg: comeData(adesso),
    parziale: lette.length >= Number(campi['solr[limit]']),
  };
  if (String(r.st) === stagione(oggiRoma(adesso))) {
    aggiungiMovimenti(dati, righe, await db.leggi(`classifiche/${id}`), adesso);
  }
  await db.scrivi(`classifiche/${id}`, dati);
  return righe.length;
}

/** Un giro: le richieste più vecchie, poche per volta. */
export async function eseguiRichieste({
  db, fonti, scarica, adesso = new Date().toISOString(), log = console.log, max = MAX_PER_GIRO,
}) {
  if (!fonti?.naz) return 0;
  // Prima le più recenti: è la classifica che qualcuno sta guardando adesso (le altre subito dopo).
  const richieste = (await db.elenca('richieste'))
    .sort((a, b) => String(b.creato ?? '').localeCompare(String(a.creato ?? '')))
    .slice(0, max);
  if (!richieste.length) return 0;
  const regole = (await db.leggi('config/categorie'))?.regole ?? REGOLE_BASE;
  const chiedi = (campi) => scarica(`${fonti.naz}&currentpage=1&format=json&view=grricerca`, {
    metodo: 'POST', timeout: 90, modulo: { 'solr[settore]': 'NUO', ...campi },
  });
  let fatte = 0;
  for (const r of richieste) {
    try {
      if (richiestaValida(r)) {
        const n = await preparaClassifica({
          db, chiedi, r, adesso, regole,
        });
        log(`Classifica ${idClassifica(r)}: ${n} atleti.`);
        fatte++;
      }
    } catch (e) {
      log(`Classifica ${r.id} non preparata: ${e.message}`);
    }
    await db.elimina(`richieste/${r.id}`);
  }
  return fatte;
}
