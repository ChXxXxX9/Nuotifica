// Atleti che hanno chiesto di non comparire (o "Solo risultati"), gestiti dall'admin in Firestore:
//   privato/nascosti      { atleti: { chiave: { n, il } } }   scheda tolta: dati cancellati ovunque, mai più caricati
//   privato/inAttesa      { atleti: { chiave: { n, il } } }   richiesta da verificare: fuori dalla ricerca
//   privato/soloRisultati { atleti: { chiave: { n, il } } }   niente avvisi "è negli elenchi"
// privato/* lo leggono solo l'admin e il controllore. Per l'app si pubblica config/nascosti con le sole
// impronte delle chiavi (h = nascosti, r = fuori dalla ricerca), mai i nomi.
// A ogni giro il controllore legge l'elenco (caricaPrivato) e cancella i dati dei nascosti nuovi (pulisciNascosti).
import { createHash } from 'node:crypto';
import { chiaviRicerca, rigaRicerca } from './dati-italia.js';
import { prefissi, chiaveSquadra, vocePrefisso } from './ricerca.js';
import { comeData } from './firestore.js';

export const NOME_NASCOSTO = 'Atleta nascosto';
export const NASCOSTI = new Map();
export const IN_ATTESA = new Map();
export const SOLO_RISULTATI = new Map();

export const eNascosto = (k) => Boolean(k) && NASCOSTI.has(k);
export const fuoriRicerca = (k) => Boolean(k) && (NASCOSTI.has(k) || IN_ATTESA.has(k));
export const soloRisultati = (k) => Boolean(k) && SOLO_RISULTATI.has(k);

/** Impronta di una chiave (le prime 16 cifre esadecimali dello SHA-256): l'app la ricalcola uguale. */
export const impronta = (k) => createHash('sha256').update(String(k)).digest('hex').slice(0, 16);

const riempi = (mappa, doc) => {
  mappa.clear();
  for (const [k, x] of Object.entries(doc?.atleti ?? {})) if (k) mappa.set(k, x ?? {});
};

/** Legge gli elenchi (una volta per giro). Se non riesce, restano quelli di prima. */
export async function caricaPrivato(db) {
  const letti = await db.leggiTanti(['privato/nascosti', 'privato/inAttesa', 'privato/soloRisultati']);
  riempi(NASCOSTI, letti.get('privato/nascosti'));
  riempi(IN_ATTESA, letti.get('privato/inAttesa'));
  riempi(SOLO_RISULTATI, letti.get('privato/soloRisultati'));
  return { nascosti: NASCOSTI.size, inAttesa: IN_ATTESA.size, soloRisultati: SOLO_RISULTATI.size };
}

/** Una riga di gara (n, s, y, k…) con il nome tolto: restano tempo, posizione, corsia, parziali. */
export function rigaNascosta(riga) {
  const {
    k, y, s, n, ...resto
  } = riga;
  return { ...resto, n: NOME_NASCOSTO };
}

const iniziale = (k) => (/^[a-z]/.test(k) ? k[0] : '_');
// Rileggendo un documento le date arrivano come testo: si rimettono date prima di riscriverlo.
const CAMPI_DATA = ['agg', 'aggiornato', 'creato'];
const conDate = (dati) => {
  for (const c of CAMPI_DATA) if (typeof dati[c] === 'string') dati[c] = comeData(dati[c]);
  return dati;
};
const via = (testo, k) => String(testo ?? '').split('~').filter((r) => r && !r.startsWith(`${k}|`)).join('~');

/** Tutte le cancellazioni nel Realtime Database per un atleta. Restituisce le squadre toccate. */
async function pulisciRtdb({ rtdb, k, n, squadreRegione, log }) {
  const doc = await rtdb.leggi(`a/${k}`).catch(() => null);
  const stagioni = Object.keys(doc ?? {}).filter((x) => /^[sx]\d{4}$/.test(x)).map((x) => x.slice(1));
  const sx = String(doc?.i ?? '').split('|')[2] || null;
  const nome = n || String(doc?.i ?? '').split('|')[0];
  // Squadre candidate: quelle scritte nella scheda più quelle della sua regione (chi cambia società).
  const regioni = new Set();
  const candidate = new Set();
  for (const x of Object.keys(doc ?? {}).filter((y) => /^s\d{4}$/.test(y))) {
    const [s, reg] = String(doc[x]).split('~')[0].split('|');
    if (s) candidate.add(chiaveSquadra(s));
    if (reg) regioni.add(reg);
  }
  for (const [id, reg] of squadreRegione) if (regioni.has(reg)) candidate.add(id);
  const toccate = new Set();
  for (const id of candidate) {
    for (const st of new Set(stagioni)) {
      const m = await rtdb.leggi(`sqs/${id}/s${st}/m`).catch(() => null);
      if (!m || !String(m).split('~').some((r) => r.startsWith(`${k}|`))) continue;
      const sq = await rtdb.leggi(`sqs/${id}/s${st}`);
      const t = Object.fromEntries(Object.entries(sq.t ?? {}).map(([kt, righe]) => [kt, via(righe, k)]).filter(([, r]) => r));
      await rtdb.scrivi(`sqs/${id}/s${st}`, { ...sq, m: via(sq.m, k), t });
      toccate.add(id);
    }
  }
  // Classifiche su richiesta: quelle del suo sesso, delle sue stagioni e di sempre.
  const ids = [...await rtdb.chiavi('cl').catch(() => [])];
  for (const id of ids) {
    const [st, , , sesso] = id.split('-');
    if ((sx && sesso !== sx) || !(st === 'tutte' || stagioni.includes(st))) continue;
    const righe = await rtdb.leggi(`cl/${id}/righe`).catch(() => null);
    if (!righe || !String(righe).split('~').some((r) => r.startsWith(`${k}|`))) continue;
    await rtdb.aggiorna({ [`cl/${id}/righe`]: via(righe, k), [`cl/${id}/b/${k}`]: null, [`cl/${id}/p/${k}`]: null });
  }
  // Ricerca, scheda, storico.
  const voci = { [`a/${k}`]: null, [`st/${k}`]: null };
  for (const chiave of chiaviRicerca(nome)) voci[`c/${chiave}~${k}`] = null;
  await rtdb.aggiorna(voci);
  log(`Nascosto ${k}: Realtime Database pulito (${stagioni.length} stagioni, ${toccate.size} squadre).`);
  return toccate;
}

/** Toglie l'atleta dagli indici di ricerca del Realtime Database (in attesa di verifica). */
export async function togliDallaRicerca({ rtdb, db, k, n }) {
  const voci = {};
  for (const chiave of chiaviRicerca(n)) voci[`c/${chiave}~${k}`] = null;
  if (rtdb) await rtdb.aggiorna(voci);
  await pulisciRicercaFirestore({ db, k, n });
}

/**
 * Rimette l'atleta nella ricerca (richiesta respinta o scaduta): le voci c/ si rifanno dalla sua scheda nel
 * Realtime Database (nome, anno, società e regione dell'ultima stagione), ricerca/ dalla scheda in Firestore.
 */
export async function ripristinaRicerca({ rtdb, db, k }) {
  if (rtdb) {
    const doc = await rtdb.leggi(`a/${k}`).catch(() => null);
    if (doc?.i) {
      const [n, y] = String(doc.i).split('|');
      const ultima = Object.keys(doc).filter((x) => /^s\d{4}$/.test(x)).sort().pop();
      const [s = '', reg = ''] = ultima ? String(doc[ultima]).split('~')[0].split('|') : [];
      const voci = {};
      for (const chiave of chiaviRicerca(n)) voci[`c/${chiave}~${k}`] = rigaRicerca(k, { n, y, s, reg });
      if (Object.keys(voci).length) await rtdb.aggiorna(voci);
    }
  }
  const scheda = await db.leggi(`atleti/${k}`);
  if (!scheda?.n) return;
  const voce = vocePrefisso(k, scheda);
  for (const p of prefissi(scheda.n)) {
    const d = await db.leggi(`ricerca/${p}`);
    if (d?.l?.some((r) => String(r).startsWith(`${k}|`))) continue;
    await db.scrivi(`ricerca/${p}`, conDate({ ...(d ?? {}), l: [...(d?.l ?? []), voce] }));
  }
}

async function pulisciRicercaFirestore({ db, k, n }) {
  for (const p of prefissi(n)) {
    const d = await db.leggi(`ricerca/${p}`);
    if (d?.l?.some((r) => String(r).startsWith(`${k}|`))) await db.scrivi(`ricerca/${p}`, conDate({ ...d, l: d.l.filter((r) => !String(r).startsWith(`${k}|`)) }));
  }
}

/** Tutte le cancellazioni in Firestore per un gruppo di atleti (una sola passata sulle raccolte). */
async function pulisciFirestore({ db, atleti, log }) {
  const chiavi = new Set(atleti.keys());
  const haChiave = (r) => chiavi.has(String(r).split('|')[0]);
  // Schede, richieste di storico, ricerca, conosciuti.
  const gare = new Set();
  for (const [k, { n }] of atleti) {
    const scheda = await db.leggi(`atleti/${k}`);
    for (const v of scheda?.r ?? []) if (v.g) gare.add(v.g);
    await db.elimina(`atleti/${k}`);
    await db.elimina(`richiesteStorico/${k}`);
    await pulisciRicercaFirestore({ db, k, n: n || scheda?.n || '' });
    const noti = await db.leggi(`noti/${iniziale(k)}`);
    if (noti?.k?.includes(k)) await db.scrivi(`noti/${iniziale(k)}`, conDate({ ...noti, k: noti.k.filter((x) => x !== k) }));
  }
  // Primati (PB e SB delle gare in diretta).
  for (const d of await db.elenca('primati')) {
    const tolti = Object.keys(d.atleti ?? {}).filter((k) => chiavi.has(k));
    if (!tolti.length) continue;
    const { id, ...dati } = d;
    for (const k of tolti) delete dati.atleti[k];
    await db.scrivi(`primati/${id}`, conDate(dati));
  }
  // Classifiche del Lazio preparate di notte.
  for (const d of await db.elenca('classifiche')) {
    if (!(d.righe ?? []).some(haChiave)) continue;
    const { id, ...dati } = d;
    dati.righe = dati.righe.filter((r) => !haChiave(r));
    for (const campo of ['b', 'p']) if (dati[campo]) for (const k of chiavi) delete dati[campo][k];
    await db.scrivi(`classifiche/${id}`, conDate(dati));
  }
  // Squadre del Lazio (Firestore).
  for (const d of await db.elenca('squadre')) {
    const { id, ...dati } = d;
    let cambiata = false;
    if ((dati.m ?? []).some(haChiave)) {
      dati.m = dati.m.filter((r) => !haChiave(r));
      cambiata = true;
    }
    for (const [kt, righe] of Object.entries(dati.t ?? {})) {
      if (Array.isArray(righe) && righe.some(haChiave)) {
        dati.t[kt] = righe.filter((r) => !haChiave(r));
        cambiata = true;
      }
    }
    if (cambiata) await db.scrivi(`squadre/${id}`, conDate(dati));
    for (const s of await db.elenca(`squadre/${id}/stagioni`)) {
      const { id: st, ...ds } = s;
      let cambiataSt = false;
      for (const [kt, righe] of Object.entries(ds.t ?? {})) {
        if (Array.isArray(righe) && righe.some(haChiave)) {
          ds.t[kt] = righe.filter((r) => !haChiave(r));
          cambiataSt = true;
        }
      }
      if (cambiataSt) await db.scrivi(`squadre/${id}/stagioni/${st}`, conDate(ds));
    }
  }
  // Gare: al posto del nome "Atleta nascosto" (restano tempo e posizione). Tutte le gare salvate.
  const tutteGare = new Set([...gare, ...(await db.elenca('gare')).map((g) => g.id)]);
  let righeGare = 0;
  for (const g of tutteGare) {
    for (const c of await db.elenca(`gare/${g}/categorie`)) {
      let cambiata = false;
      const { id, ...dati } = c;
      for (const e of dati.eventi ?? []) {
        for (const b of e.b ?? []) {
          b.r = (b.r ?? []).map((r) => {
            if (!r.k || !chiavi.has(r.k)) return r;
            cambiata = true;
            righeGare++;
            return rigaNascosta(r);
          });
        }
      }
      if (cambiata) await db.scrivi(`gare/${g}/categorie/${id}`, conDate(dati));
    }
  }
  log(`Nascosti: Firestore pulito per ${chiavi.size} atleti (${righeGare} righe di gara anonime).`);
}

/**
 * I nascosti non ancora puliti (meta/nascosti-puliti tiene il conto): si cancellano ovunque. Poi si
 * pubblicano le impronte per l'app (config/nascosti) e si tolgono dalla ricerca quelli in attesa.
 */
export async function pulisciNascosti({
  db, rtdb, log = console.log, aggiornaRiassunti = null,
}) {
  const fatti = (await db.leggi('meta/nascosti-puliti')) ?? {};
  fatti.atleti ??= {};
  fatti.ricerca ??= {};
  const nuovi = new Map([...NASCOSTI].filter(([k]) => !fatti.atleti[k]));
  if (nuovi.size) {
    const elenco = (await db.leggi('meta/squadre'))?.squadre ?? {};
    const squadreRegione = new Map(Object.entries(elenco).map(([id, riga]) => [id, String(riga).split('|')[4]]));
    const toccate = new Set();
    if (rtdb) {
      for (const [k, x] of nuovi) {
        for (const id of await pulisciRtdb({
          rtdb, k, n: x.n, squadreRegione, log,
        })) toccate.add(id);
      }
      if (toccate.size && aggiornaRiassunti) await aggiornaRiassunti({ rtdb, ids: [...toccate], log });
    }
    await pulisciFirestore({ db, atleti: nuovi, log });
    for (const k of nuovi.keys()) fatti.atleti[k] = new Date().toISOString();
  }
  // In attesa di verifica: fuori dalla ricerca (una volta).
  for (const [k, x] of IN_ATTESA) {
    if (fatti.ricerca[k] || NASCOSTI.has(k)) continue;
    await togliDallaRicerca({
      rtdb, db, k, n: x.n ?? '',
    });
    fatti.ricerca[k] = new Date().toISOString();
  }
  // Chi non è più in attesa né nascosto (richiesta respinta o scaduta) torna subito cercabile.
  for (const k of Object.keys(fatti.ricerca)) {
    if (IN_ATTESA.has(k) || NASCOSTI.has(k)) continue;
    try {
      await ripristinaRicerca({ rtdb, db, k });
      log(`Richiesta chiusa: ${k} di nuovo nella ricerca.`);
    } catch (e) {
      log(`Ricerca di ${k} non rimessa (${e.message}): si riprova al prossimo giro.`);
      continue;
    }
    delete fatti.ricerca[k];
  }
  for (const k of Object.keys(fatti.atleti)) if (!NASCOSTI.has(k)) delete fatti.atleti[k];
  await db.scrivi('meta/nascosti-puliti', fatti);
  // Impronte per l'app (solo se cambiate).
  const h = [...NASCOSTI.keys()].map(impronta).sort();
  const r = [...IN_ATTESA.keys()].map(impronta).sort();
  const ora = await db.leggi('config/nascosti');
  if (JSON.stringify(ora?.h ?? []) !== JSON.stringify(h) || JSON.stringify(ora?.r ?? []) !== JSON.stringify(r) || ora?.n || ora?.k) {
    await db.scrivi('config/nascosti', { h, r, aggiornato: new Date() });
  }
  return nuovi.size;
}
