// Classifiche nazionali e delle altre regioni, preparate su richiesta dall'app.
// L'app scrive richieste/{id} (Firestore); il controllore legge la graduatoria COMPLETA (se supera le
// 5000 righe la divide per anno di nascita) e la salva nel Realtime Database in cl/{id}
// ({ righe: "chiave|nome|anno|società|tempo|data[|tipo]~…", agg, parziale, b, bd, p }), dove la leggono tutti.
// Per la stagione in corso si rifanno ogni giorno. Se la fonte non risponde si riprova (3 volte), poi si
// scrive l'errore così l'app non resta ad aspettare.
//
// id = {stagione}-{vasca}-{gara}-{sesso}-{regione}-{categoria}
//   regione: "it" (tutta Italia) o il numero del comitato regionale; categoria: "tutte" o EB, EA, R, J, C, S
// (la categoria serve solo per l'Italia: le regioni si scaricano intere e si filtrano nell'app).
import {
  leggiGraduatoria, dividiNome, CODICI, aggiungiMovimenti, tempoValido, tipoTempo,
} from './graduatorie.js';
import { chiaveAtleta, oggiRoma } from './tempi.js';
import { stagione } from './gare.js';
import { REGOLE_BASE, anniCodice, etaCodice } from './categorie.js';
import { eNascosto } from './nascosti.js';

export const COMITATI = {
  1: 'Piemonte', 3: 'Lombardia', 5: 'Veneto', 6: 'Friuli Venezia Giulia', 7: 'Liguria', 8: 'Emilia Romagna', 9: 'Toscana',
  10: 'Umbria', 11: 'Marche', 12: 'Lazio', 13: 'Abruzzo', 14: 'Molise', 15: 'Campania', 16: 'Puglia', 17: 'Basilicata',
  18: 'Calabria', 19: 'Sicilia', 20: 'Sardegna', 21: 'Bolzano', 22: 'Trento',
};
const CODICE_FIN = Object.fromEntries(Object.entries(CODICI).map(([fin, c]) => [c, fin.padStart(2, '0')]));
const CODICI_CAT = ['EB', 'EA', 'R', 'R14', 'R1', 'R2', 'J', 'J1', 'J2', 'C', 'S'];
const MAX_PER_GIRO = 4;
const LIMITE = 5000;
// Una graduatoria che arriva quasi al limite potrebbe essere tagliata: si divide per anno di nascita.
const PIENA = 4_900;
const TENTATIVI = 3;

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
/**
 * Una graduatoria intera: se arriva al limite (e si può) si divide per anni di nascita, a metà ogni volta,
 * finché ogni pezzo sta sotto il limite. `anni`: { dal, al } già fissati (categoria) o null.
 */
export async function leggiIntera(chiedi, campi, { anni = null, primo, ultimo, dividi = true } = {}) {
  const conAnni = anni ? { ...campi, 'solr[dalyob]': String(anni.dal), 'solr[alyob]': String(anni.al) } : campi;
  const righe = leggiGraduatoria(await chiedi(conAnni));
  if (righe.length < PIENA || !dividi) return { righe, piena: righe.length >= PIENA };
  const da = anni?.dal ?? primo;
  const a = anni?.al ?? ultimo;
  if (da == null || a == null || da >= a) return { righe, piena: true };
  const meta = Math.floor((da + a) / 2);
  const x = await leggiIntera(chiedi, campi, { anni: { dal: da, al: meta }, dividi });
  const y = await leggiIntera(chiedi, campi, { anni: { dal: meta + 1, al: a }, dividi });
  return { righe: [...x.righe, ...y.righe], piena: x.piena || y.piena };
}

/** Prepara una classifica: la scarica tutta, la ordina e (stagione in corso) aggiunge i movimenti. */
export async function preparaClassifica({
  rtdb, chiedi, r, adesso, regole,
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
    'solr[limit]': String(LIMITE),
  };
  let anni = null;
  if (r.cat !== 'tutte') {
    if (sempre) {
      // Di sempre per categoria: l'età al momento della gara.
      const eta = etaCodice(r.cat, r.sx, stagione(oggiRoma(adesso)), regole);
      if (eta) {
        campi['solr[daleta]'] = String(eta.da);
        campi['solr[aleta]'] = String(eta.a);
      }
    } else {
      anni = anniCategoria(r.cat, r.sx, r.st, regole);
    }
  }
  // Di sempre: i primi 5000 (tutta la storia sarebbe troppo). Una stagione: tutti, divisa per anni se serve.
  const { righe: lette, piena } = await leggiIntera(chiedi, campi, {
    anni, primo: 1900, ultimo: sempre ? null : Number(r.st) - 3, dividi: !sempre,
  });
  const valide = lette.filter((x) => tempoValido(x.turno));
  const visti = new Set();
  const righe = [];
  for (const x of valide.sort((a, b) => a.ms - b.ms)) {
    const { cognome, nome } = dividiNome(x.nome);
    const k = chiaveAtleta(cognome, nome, x.anno);
    if (!k || visti.has(k) || eNascosto(k)) continue;
    visti.add(k);
    righe.push({
      k, n: `${nome} ${cognome}`.trim(), y: x.anno, s: x.societa.join(' / '), valore: x.ms, d: x.data, tp: tipoTempo(x.turno),
    });
  }
  const id = idClassifica(r);
  const pulisci = (t) => String(t ?? '').replace(/[|~]/g, ' ');
  const dati = {
    righe: righe.map((x) => [x.k, pulisci(x.n), x.y ?? '', pulisci(x.s), x.valore, x.d ?? '', ...(x.tp ? [x.tp] : [])].join('|')),
    agg: adesso,
    parziale: piena,
  };
  if (String(r.st) === stagione(oggiRoma(adesso))) {
    const prima = await rtdb.leggi(`cl/${id}`).catch(() => null);
    aggiungiMovimenti(dati, righe, prima?.righe ? { ...prima, righe: String(prima.righe).split('~') } : prima, adesso);
  }
  await rtdb.scrivi(`cl/${id}`, { ...dati, righe: dati.righe.join('~') });
  return righe.length;
}

/**
 * Un giro: le richieste in coda, poche per volta (prima le più recenti, che qualcuno sta guardando, ma
 * anche la più vecchia, così nessuna resta indietro). Se la fonte non risponde la richiesta resta in coda
 * e si riprova; dopo 3 volte si scrive l'errore (l'app smette di aspettare e propone di riprovare).
 */
export async function eseguiRichieste({
  db, rtdb, fonti, scarica, adesso = new Date().toISOString(), log = console.log, max = MAX_PER_GIRO,
}) {
  if (!fonti?.naz || !rtdb) return 0;
  const coda = (await db.elenca('richieste')).sort((a, b) => String(b.creato ?? '').localeCompare(String(a.creato ?? '')));
  if (!coda.length) return 0;
  const scelte = coda.length > max ? [...coda.slice(0, max - 1), coda[coda.length - 1]] : coda;
  const regole = (await db.leggi('config/categorie'))?.regole ?? REGOLE_BASE;
  const chiedi = async (campi) => {
    await new Promise((ok) => { setTimeout(ok, 300); });
    return scarica(`${fonti.naz}&currentpage=1&format=json&view=grricerca`, {
      metodo: 'POST', timeout: 90, modulo: { 'solr[settore]': 'NUO', ...campi },
    });
  };
  let fatte = 0;
  for (const r of scelte) {
    const inizio = Date.now();
    if (!richiestaValida(r)) {
      log(`Classifica ${r.id}: richiesta non valida, tolta.`);
      await rtdb.scrivi(`cl/${r.id}`, { errore: 'non valida', agg: adesso }).catch(() => {});
      await db.elimina(`richieste/${r.id}`);
      continue;
    }
    try {
      const n = await preparaClassifica({
        rtdb, chiedi, r, adesso, regole,
      });
      log(`Classifica ${idClassifica(r)}: ${n} atleti in ${Math.round((Date.now() - inizio) / 1000)} s.`);
      fatte++;
      await db.elimina(`richieste/${r.id}`);
    } catch (e) {
      const tentativi = (Number(r.tentativi) || 0) + 1;
      log(`Classifica ${r.id}: tentativo ${tentativi} non riuscito (${e.message}).`);
      if (tentativi >= TENTATIVI) {
        const prima = await rtdb.leggi(`cl/${r.id}/agg`).catch(() => null);
        // Se c'è già una classifica (di ieri) la si lascia; altrimenti si scrive l'errore.
        if (!prima) await rtdb.scrivi(`cl/${r.id}`, { errore: 'fonte non raggiungibile', agg: adesso }).catch(() => {});
        await db.elimina(`richieste/${r.id}`);
      } else {
        const { id, ...campi } = r;
        await db.scrivi(`richieste/${id}`, { ...campi, tentativi });
      }
    }
  }
  return fatte;
}
