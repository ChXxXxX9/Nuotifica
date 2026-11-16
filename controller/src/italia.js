// Tutta Italia, tutte le stagioni, nel Realtime Database (nessun limite di scritture al giorno).
// Per ogni stagione, vasca, sesso e gara si legge prima la graduatoria nazionale (una richiesta);
// solo se arriva al limite di righe si legge regione per regione. La regione di chi compare solo
// nella nazionale si ricava dalla sua società.
import { chiaveAtleta } from './tempi.js';
import { punti } from './punti.js';
import { comeData } from './firestore.js';
import { chiaveSquadra } from './ricerca.js';
import {
  CODICI, TUTTE_LE_REGIONI, leggiGraduatoria, dividiNome, tempoValido,
} from './graduatorie.js';
import {
  rigaInfo, rigaStagione, chiaviRicerca, rigaRicerca, rigaSquadra, riassuntoSquadra,
} from './dati-italia.js';

const LIMITE = 5000;
// Se la nazionale arriva quasi al limite potrebbe essere tagliata: allora si legge per regione.
const QUASI_PIENA = 4_900;
export const VASCHE = [[25, '1'], [50, '2']];

/** Aggiunge una riga di graduatoria agli atleti della stagione (stessa forma per Lazio e Italia). */
export function aggiungiRiga(atleti, r, {
  sesso, vasca, codice, st, reg = null,
}) {
  if (!tempoValido(r.turno)) return;
  const { cognome, nome } = dividiNome(r.nome);
  const k = chiaveAtleta(cognome, nome, r.anno);
  if (!k) return;
  if (!atleti.has(k)) {
    atleti.set(k, {
      n: `${nome} ${cognome}`.trim(), y: r.anno, sx: sesso, societa: new Set(), fin: r.idAtleta, reg, risultati: [],
    });
  }
  const a = atleti.get(k);
  if (!a.reg && reg) a.reg = reg;
  r.societa.forEach((s) => a.societa.add(s));
  const voce = {
    i: `fg${r.idEvento ?? ''}-${codice}-${r.idTurno ?? ''}`,
    gn: r.luogo || 'Gara FIN',
    l: r.luogo,
    d: r.data ?? `${st}-12-31`,
    c: codice,
    v: vasca,
    t: r.ms,
    f: 1,
  };
  if (r.idEvento) voce.g = `n${r.idEvento}`;
  const pt = punti(r.ms, codice, sesso, vasca, voce.d);
  if (pt) voce.pt = pt;
  a.risultati.push(voce);
}

const campi = (st, sesso, idVasca, codFin, reg, anni = null) => ({
  'solr[sesso]': sesso,
  'solr[id_lunghezza_vasca]': idVasca,
  'solr[kindtime]': '3',
  'solr[stagione]': String(st),
  'solr[codice_gara]': codFin.padStart(2, '0'),
  'solr[id_comitato]': reg,
  'solr[limit]': String(LIMITE),
  ...(anni ? { 'solr[dalyob]': String(anni.dal), 'solr[alyob]': String(anni.al) } : {}),
});

/** Anni di nascita, uno per uno dai più giovani (6 anni) ai 24 anni, poi tutti i più grandi insieme. */
export function fasceAnni(st) {
  const fasce = [];
  for (let y = Number(st) - 5; y >= Number(st) - 24; y--) fasce.push({ dal: y, al: y });
  fasce.push({ dal: 1900, al: Number(st) - 25 });
  return fasce;
}

/**
 * Una stagione di tutta Italia. `regioniSquadre`: id squadra -> regione già nota (dalle stagioni lette prima).
 * Restituisce { atleti, richieste, errori }.
 */
export async function scaricaItalia({
  chiedi, st, log = console.log, regioniSquadre = {},
}) {
  const atleti = new Map();
  let richieste = 0;
  let errori = 0;
  const leggi = async (sesso, idVasca, codFin, reg, anni = null) => {
    try {
      const righe = leggiGraduatoria(await chiedi(campi(st, sesso, idVasca, codFin, reg, anni)));
      richieste++;
      return righe;
    } catch (e) {
      errori++;
      log(`Graduatoria ${st} ${CODICI[codFin]} ${sesso} (vasca ${idVasca}, regione ${reg || 'Italia'}${anni ? `, nati ${anni.dal}-${anni.al}` : ''}) non letta: ${e.message}`);
      return null;
    }
  };
  /** Una regione; se anche lei arriva al limite, anno di nascita per anno di nascita. */
  const leggiRegione = async (sesso, idVasca, codFin, reg) => {
    const righe = await leggi(sesso, idVasca, codFin, reg);
    if (!righe || righe.length < QUASI_PIENA) return righe ?? [];
    const tutte = [];
    for (const anni of fasceAnni(st)) tutte.push(...((await leggi(sesso, idVasca, codFin, reg, anni)) ?? []));
    return tutte;
  };
  for (const [vasca, idVasca] of VASCHE) {
    for (const sesso of ['M', 'F']) {
      for (const [codFin, codice] of Object.entries(CODICI)) {
        const nazionale = await leggi(sesso, idVasca, codFin, '');
        if (nazionale && nazionale.length < QUASI_PIENA) {
          for (const r of nazionale) {
            aggiungiRiga(atleti, r, {
              sesso, vasca, codice, st,
            });
          }
          continue;
        }
        // Troppe righe (o nazionale non letta): regione per regione.
        for (const reg of TUTTE_LE_REGIONI) {
          for (const r of await leggiRegione(sesso, idVasca, codFin, reg)) {
            aggiungiRiga(atleti, r, {
              sesso, vasca, codice, st, reg,
            });
          }
        }
      }
    }
  }
  completaRegioni(atleti, regioniSquadre);
  return { atleti, richieste, errori };
}

/** Chi non ha la regione la prende dalla società (regione della maggior parte dei suoi atleti). */
export function completaRegioni(atleti, regioniSquadre = {}) {
  const conti = new Map();
  for (const a of atleti.values()) {
    if (!a.reg) continue;
    for (const s of a.societa) {
      const id = chiaveSquadra(s);
      if (!conti.has(id)) conti.set(id, new Map());
      conti.get(id).set(a.reg, (conti.get(id).get(a.reg) ?? 0) + 1);
    }
  }
  const regioneDi = (id) => [...(conti.get(id) ?? [])].sort((x, y) => y[1] - x[1])[0]?.[0] ?? regioniSquadre[id] ?? null;
  for (const a of atleti.values()) {
    if (a.reg) continue;
    for (const s of a.societa) {
      const r = regioneDi(chiaveSquadra(s));
      if (r) {
        a.reg = r;
        break;
      }
    }
  }
}

/** Squadre della stagione: componenti e, per ogni gara, il miglior tempo di ognuno. */
export function squadreDellaStagione(atleti) {
  const perSquadra = new Map();
  for (const [k, a] of atleti) {
    for (const nome of a.societa) {
      const id = chiaveSquadra(nome);
      if (!perSquadra.has(id)) perSquadra.set(id, { n: nome, membri: new Map(), t: new Map(), regioni: new Map() });
      const sq = perSquadra.get(id);
      sq.membri.set(k, a);
      if (a.reg) sq.regioni.set(a.reg, (sq.regioni.get(a.reg) ?? 0) + 1);
      for (const v of a.risultati) {
        const kt = `${v.v}|${v.c}|${a.sx}`;
        if (!sq.t.has(kt)) sq.t.set(kt, new Map());
        const prima = sq.t.get(kt).get(k);
        if (!prima || v.t < prima.t) sq.t.get(kt).set(k, v);
      }
    }
  }
  for (const sq of perSquadra.values()) sq.reg = [...sq.regioni].sort((x, y) => y[1] - x[1])[0]?.[0] ?? '';
  return perSquadra;
}

/**
 * Le scritture per il Realtime Database di una stagione. `indice`: 'tutti' (stagione più recente: si
 * riscrive la voce di ricerca di tutti) oppure un Set di chiavi già presenti (si aggiungono solo le altre).
 */
export function vociStagione(atleti, st, { indice = 'tutti', squadre = squadreDellaStagione(atleti) } = {}) {
  const voci = {};
  for (const [k, a] of atleti) {
    const s = [...a.societa][0] ?? '';
    voci[`a/${k}/i`] = rigaInfo(a);
    if (a.fin) voci[`a/${k}/f`] = String(a.fin);
    voci[`a/${k}/s${st}`] = rigaStagione({ ...a, s });
    if (indice === 'tutti' || !indice.has(k)) {
      for (const chiave of chiaviRicerca(a.n)) voci[`c/${chiave}~${k}`] = rigaRicerca(k, { ...a, s });
    }
  }
  for (const [id, sq] of squadre) {
    voci[`sqs/${id}/s${st}`] = rigaSquadra(sq);
  }
  return voci;
}

/**
 * Indice annata: per ogni vasca, gara, sesso e anno di nascita, la media dei 10 migliori d'Italia della stagione.
 * { "vasca|gara|sesso|anno": "media in ms|quanti" } (solo con almeno 3 atleti).
 */
export function annateStagione(atleti) {
  const gruppi = new Map();
  for (const a of atleti.values()) {
    if (!a.y) continue;
    const migliori = new Map();
    for (const v of a.risultati) {
      const k = `${v.v}|${v.c}`;
      if (!migliori.has(k) || v.t < migliori.get(k)) migliori.set(k, v.t);
    }
    for (const [k, t] of migliori) {
      const g = `${k}|${a.sx}|${a.y}`;
      if (!gruppi.has(g)) gruppi.set(g, []);
      gruppi.get(g).push(t);
    }
  }
  const annate = {};
  for (const [g, tempi] of gruppi) {
    if (tempi.length < 3) continue;
    const primi = tempi.sort((x, y) => x - y).slice(0, 10);
    annate[g] = `${Math.round(primi.reduce((x, t) => x + t, 0) / primi.length)}|${primi.length}`;
  }
  return annate;
}

/** Aggiorna l'elenco delle squadre per l'app (un documento Firestore): "nome|atleti|massimo|ultima stagione|regione". */
export function aggiornaElenco(elenco, squadre, st) {
  for (const [id, sq] of squadre) {
    const [n0, att0, tot0, ult0, reg0] = String(elenco[id] ?? '').split('|');
    const ultima = Number(ult0) || 0;
    const quanti = sq.membri.size;
    if (Number(st) >= ultima) {
      elenco[id] = `${sq.n}|${quanti}|${Math.max(quanti, Number(tot0) || 0)}|${st}|${sq.reg || reg0 || ''}`;
    } else {
      elenco[id] = `${n0}|${att0}|${Math.max(quanti, Number(tot0) || 0)}|${ultima}|${reg0 || sq.reg || ''}`;
    }
  }
  return elenco;
}

/** Scrive una stagione nel Realtime Database e aggiorna l'elenco delle squadre. */
export async function scriviStagione({
  db, rtdb, atleti, st, adesso, indice = 'tutti', annate = false,
}) {
  const squadre = squadreDellaStagione(atleti);
  const voci = vociStagione(atleti, st, { indice, squadre });
  if (annate) voci[`ann/s${st}`] = annateStagione(atleti);
  await rtdb.aggiorna(voci);
  const elenco = (await db.leggi('meta/squadre'))?.squadre ?? {};
  await db.scrivi('meta/squadre', { squadre: aggiornaElenco(elenco, squadre, st), aggiornato: comeData(adesso) });
  return { voci: Object.keys(voci).length, squadre: squadre.size, ids: [...squadre.keys()] };
}

/**
 * Riassunto di ogni squadra (sqx/{squadra}): si rilegge tutta la squadra (tutte le stagioni) e si
 * riscrive il riassunto che l'app scarica. Qualche lettura in parallelo.
 */
export async function aggiornaRiassunti({ rtdb, ids, log = console.log }) {
  const coda = [...ids];
  let voci = {};
  let fatti = 0;
  const svuota = async () => {
    const pezzo = voci;
    voci = {};
    if (Object.keys(pezzo).length) await rtdb.aggiorna(pezzo);
  };
  const lavora = async () => {
    while (coda.length) {
      const id = coda.shift();
      try {
        const r = riassuntoSquadra(await rtdb.leggi(`sqs/${id}`), punti);
        if (r) {
          voci[`sqx/${id}`] = r;
          fatti++;
        }
      } catch (e) {
        log(`Riassunto ${id} non preparato: ${e.message}`);
      }
      if (Object.keys(voci).length >= 150) await svuota();
    }
  };
  await Promise.all(Array.from({ length: 6 }, lavora));
  await svuota();
  return fatti;
}
