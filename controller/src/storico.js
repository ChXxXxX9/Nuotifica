// Storico gara per gara degli atleti seguiti: tutte le gare di ogni specialità, in entrambe le vasche.
// Si scarica appena qualcuno segue un atleta (richiesteStorico/{chiave}) e poi una volta a settimana.
// Si salva nel Realtime Database:
//   st/{chiave}  { agg, f: id dell'atleta nella fonte, g: { "100SL": "vasca|tempo|data|luogo|evento~…" } }
import { inMs, chiaveAtleta } from './tempi.js';
import {
  CODICI, dataIso, dividiNome, leggiGraduatoria,
} from './graduatorie.js';

const testo = (h = '') => h.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
const contenuto = (json) => {
  const d = typeof json === 'string' ? JSON.parse(json) : json;
  return d?.content ?? '';
};
const pulisci = (x) => String(x ?? '').replace(/[|~]/g, ' ').trim();
export const GIORNI_STORICO = 7;

/** Pagina dei personali: le specialità nuotate (codici della fonte). */
export function leggiSpecialita(json) {
  const html = contenuto(json);
  return [...new Set([...html.matchAll(/data-id="(\d{2})"\s+data-view="grspecialitaatleta"/g)].map((m) => m[1]))]
    .filter((c) => CODICI[c]);
}

/** Pagina di una specialità: tutte le gare, vasca per vasca. */
export function leggiGareSpecialita(json) {
  const html = contenuto(json);
  const gare = [];
  for (const blocco of html.split(/<h4>/).slice(1)) {
    const vasca = Number(blocco.match(/^\s*Vasca da (\d+)/)?.[1]);
    if (![25, 50].includes(vasca)) continue;
    for (const riga of blocco.split(/class="row"/).slice(1)) {
      const t = inMs(riga.match(/class="tempo"><span>([^<]*)/)?.[1]);
      const d = dataIso(testo(riga.match(/class="data"><span>([^<]*)/)?.[1] ?? ''));
      if (!t || !d) continue;
      const luogo = riga.match(/data-id="(\d+)[^"]*"\s+data-view="grevento">([^<]*)</);
      gare.push({
        v: vasca, t, d, l: testo(luogo?.[2] ?? ''), ev: luogo?.[1] ?? '',
      });
    }
  }
  return gare;
}

export const rigaStorico = (gare) => gare
  .sort((a, b) => b.d.localeCompare(a.d) || a.t - b.t)
  .map((x) => [x.v, x.t, x.d, pulisci(x.l), x.ev].join('|')).join('~');

/**
 * Id dell'atleta nella fonte: da Firestore (schede del Lazio), dal Realtime Database, oppure cercandolo
 * nella graduatoria di una sua stagione (stessa gara, vasca, sesso e anno di nascita).
 */
export async function trovaIdFin({
  db, rtdb, chiedi, k,
}) {
  const scheda = await db.leggi(`atleti/${k}`).catch(() => null);
  const daScheda = [...(scheda?.fin ?? [])].reverse().find(Boolean);
  if (daScheda) return { id: String(daScheda), info: scheda };
  const a = await rtdb.leggi(`a/${k}`);
  if (!a) return { id: null, info: null };
  if (a.f) return { id: String(a.f), info: a };
  const [, y, sx] = String(a.i ?? '').split('|');
  const stagioni = Object.keys(a).filter((x) => /^s\d{4}$/.test(x)).sort().reverse();
  for (const s of stagioni.slice(0, 2)) {
    const [testa, primo] = a[s].split('~');
    const reg = testa.split('|')[1] ?? '';
    const [c, v] = String(primo ?? '').split('|');
    const codFin = Object.entries(CODICI).find(([, x]) => x === c)?.[0];
    if (!codFin || !y) continue;
    const righe = leggiGraduatoria(await chiedi({
      view: 'grricerca',
      'solr[sesso]': sx,
      'solr[id_lunghezza_vasca]': v === '50' ? '2' : '1',
      'solr[kindtime]': '3',
      'solr[stagione]': s.slice(1),
      'solr[codice_gara]': codFin,
      'solr[id_comitato]': reg,
      'solr[dalyob]': y,
      'solr[alyob]': y,
      'solr[limit]': '5000',
    }));
    const trovata = righe.find((r) => {
      const { cognome, nome } = dividiNome(r.nome);
      return chiaveAtleta(cognome, nome, r.anno) === k;
    });
    if (trovata?.idAtleta) return { id: trovata.idAtleta, info: a };
  }
  return { id: null, info: a };
}

/** Scarica lo storico di un atleta. `chiedi(campi)`: richiesta alla fonte (campi.view = vista). */
export async function scaricaStorico({ chiedi, id }) {
  const personali = await chiedi({ view: 'gratleta', 'solr[id_atleta]': id });
  const specialita = leggiSpecialita(personali);
  const g = {};
  let gare = 0;
  for (const codFin of specialita) {
    const elenco = leggiGareSpecialita(await chiedi({
      view: 'grspecialitaatleta', 'solr[id_atleta]': id, 'solr[codice_gara]': codFin, 'solr[limit]': '2000',
    }));
    if (elenco.length) {
      g[CODICI[codFin]] = rigaStorico(elenco);
      gare += elenco.length;
    }
  }
  return { g, gare, specialita: specialita.length };
}

/** Lo storico di un atleta, salvato. Restituisce il numero di gare (o null se l'atleta non si trova). */
export async function aggiornaStorico({
  db, rtdb, chiedi, k, adesso, log = console.log,
}) {
  const { id } = await trovaIdFin({
    db, rtdb, chiedi, k,
  });
  if (!id) {
    await rtdb.scrivi(`st/${k}`, { agg: adesso, g: {}, nessuno: true });
    log(`Storico ${k}: atleta non trovato.`);
    return null;
  }
  const { g, gare } = await scaricaStorico({ chiedi, id });
  await rtdb.scrivi(`st/${k}`, { agg: adesso, f: id, g });
  await rtdb.aggiorna({ [`a/${k}/f`]: id }).catch(() => {});
  return gare;
}

/** Atleti seguiti da qualcuno (tutti gli utenti). */
export async function chiaviSeguite(db) {
  const utenti = await db.elenca('users');
  return [...new Set(utenti.flatMap((u) => u.seguiti ?? []))];
}

/**
 * Giro dello storico: prima le richieste (atleti appena seguiti), poi gli atleti seguiti con lo storico
 * più vecchio di una settimana, finché c'è tempo. `soloRichieste`: per il giro dei 5 minuti.
 */
export async function giroStorico({
  db, rtdb, chiedi, adesso = new Date().toISOString(), log = console.log, scadenza = Infinity, ora = () => Date.now(),
  soloRichieste = false, massimo = Infinity,
}) {
  const richieste = await db.elenca('richiesteStorico');
  const fatti = new Set();
  let gare = 0;
  for (const r of richieste) {
    if (fatti.size >= massimo || ora() > scadenza) break;
    const k = r.id;
    try {
      gare += (await aggiornaStorico({
        db, rtdb, chiedi, k, adesso, log,
      })) ?? 0;
    } catch (e) {
      log(`Storico ${k} non letto: ${e.message}`);
    }
    fatti.add(k);
    await db.elimina(`richiesteStorico/${k}`);
  }
  if (soloRichieste) return { atleti: fatti.size, gare };
  const vecchio = (agg) => !agg || (Date.parse(adesso) - Date.parse(agg)) / 86_400_000 > GIORNI_STORICO;
  for (const k of await chiaviSeguite(db)) {
    if (fatti.size >= massimo || ora() > scadenza) break;
    if (fatti.has(k)) continue;
    const prima = await rtdb.leggi(`st/${k}/agg`).catch(() => null);
    if (!vecchio(prima)) continue;
    try {
      gare += (await aggiornaStorico({
        db, rtdb, chiedi, k, adesso, log,
      })) ?? 0;
    } catch (e) {
      log(`Storico ${k} non letto: ${e.message}`);
    }
    fatti.add(k);
  }
  return { atleti: fatti.size, gare };
}

/** Richieste alla fonte per lo storico: `campi.view` è la vista, il resto i campi del modulo. */
export function creaChiedi({ fonti, scarica, attesa = 600 }) {
  return async ({ view, ...campi }) => {
    await new Promise((r) => { setTimeout(r, attesa); });
    return scarica(`${fonti.naz}&currentpage=1&format=json&view=${view}`, {
      metodo: 'POST', timeout: 120, modulo: { 'solr[settore]': 'NUO', ...campi },
    });
  };
}
