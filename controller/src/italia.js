// Tutta Italia, tutte le stagioni, nel Realtime Database (nessun limite di scritture al giorno).
// Per ogni stagione, vasca, sesso e gara si legge prima la graduatoria nazionale (una richiesta);
// solo se arriva al limite di righe si legge regione per regione. La regione di chi compare solo
// nella nazionale si ricava dalla sua società.
import { chiaveAtleta } from './tempi.js';
import { punti } from './punti.js';
import { comeData } from './firestore.js';
import { chiaveSquadra } from './ricerca.js';
import {
  CODICI, TUTTE_LE_REGIONI, leggiGraduatoria, dividiNome,
} from './graduatorie.js';
import {
  rigaInfo, rigaStagione, chiaviRicerca, rigaRicerca, rigaSquadra,
} from './dati-italia.js';

const LIMITE = 5000;
export const VASCHE = [[25, '1'], [50, '2']];

/** Aggiunge una riga di graduatoria agli atleti della stagione (stessa forma per Lazio e Italia). */
export function aggiungiRiga(atleti, r, {
  sesso, vasca, codice, st, reg = null,
}) {
  if (!/individuale/i.test(r.turno) && r.turno) return;
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

const campi = (st, sesso, idVasca, codFin, reg) => ({
  'solr[sesso]': sesso,
  'solr[id_lunghezza_vasca]': idVasca,
  'solr[kindtime]': '3',
  'solr[stagione]': String(st),
  'solr[codice_gara]': codFin.padStart(2, '0'),
  'solr[id_comitato]': reg,
  'solr[limit]': String(LIMITE),
});

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
  const leggi = async (sesso, idVasca, codFin, reg) => {
    try {
      const righe = leggiGraduatoria(await chiedi(campi(st, sesso, idVasca, codFin, reg)));
      richieste++;
      return righe;
    } catch (e) {
      errori++;
      log(`Graduatoria ${st} ${CODICI[codFin]} ${sesso} (vasca ${idVasca}, regione ${reg || 'Italia'}) non letta: ${e.message}`);
      return null;
    }
  };
  for (const [vasca, idVasca] of VASCHE) {
    for (const sesso of ['M', 'F']) {
      for (const [codFin, codice] of Object.entries(CODICI)) {
        const nazionale = await leggi(sesso, idVasca, codFin, '');
        if (nazionale && nazionale.length < LIMITE) {
          for (const r of nazionale) {
            aggiungiRiga(atleti, r, {
              sesso, vasca, codice, st,
            });
          }
          continue;
        }
        // Troppe righe (o nazionale non letta): regione per regione.
        for (const reg of TUTTE_LE_REGIONI) {
          for (const r of (await leggi(sesso, idVasca, codFin, reg)) ?? []) {
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
  db, rtdb, atleti, st, adesso, indice = 'tutti',
}) {
  const squadre = squadreDellaStagione(atleti);
  const voci = vociStagione(atleti, st, { indice, squadre });
  await rtdb.aggiorna(voci);
  const elenco = (await db.leggi('meta/squadre'))?.squadre ?? {};
  await db.scrivi('meta/squadre', { squadre: aggiornaElenco(elenco, squadre, st), aggiornato: comeData(adesso) });
  return { voci: Object.keys(voci).length, squadre: squadre.size };
}
