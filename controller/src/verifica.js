// Verifica: i nostri tempi contro quelli della federazione.
// Si prendono a caso graduatorie (stagione, vasca, sesso, gara, anno di nascita) e per ogni tempo si
// controlla che sia uguale:
//   1. nella scheda dell'atleta (a/{chiave}/s{stagione});
//   2. nella tabella della sua squadra in quella stagione (sqs/{squadra}/s{stagione});
//   3. nei migliori di sempre della squadra (sqx/{squadra}): lì ci dev'essere quel tempo o uno migliore.
// Nei log solo i numeri; gli esempi (con nomi e tempi) vanno nel file passato come argomento.
import { writeFileSync } from 'node:fs';
import { leggiFonti, scarica } from './fonti.js';
import { leggiAccountServizio, creaGestoreToken, creaClientGoogle } from './google.js';
import { creaFirestore } from './firestore.js';
import { trovaUrlRtdb, creaRtdb } from './rtdb.js';
import {
  CODICI, leggiGraduatoria, dividiNome, tempoValido,
} from './graduatorie.js';
import { chiaveAtleta, oggiRoma } from './tempi.js';
import { chiaveSquadra } from './ricerca.js';
import { stagione } from './gare.js';

const caso = (n) => Math.floor(Math.random() * n);
const pausa = (ms) => new Promise((r) => { setTimeout(r, ms); });

/** Il tempo di un atleta in una gara e vasca, dalla sua scheda di quella stagione (o null). */
export function tempoScheda(doc, st, c, v) {
  const riga = doc?.[`s${st}`];
  if (!riga) return null;
  const voce = String(riga).split('~').slice(1).find((x) => x.startsWith(`${c}|${v}|`));
  return voce ? Number(voce.split('|')[2]) : null;
}

/** Il tempo di un atleta in una tabella "chiave|tempo|…~…" (o null). */
export function tempoTabella(testo, k) {
  const riga = String(testo ?? '').split('~').find((x) => x.startsWith(`${k}|`));
  return riga ? Number(riga.split('|')[1]) : null;
}

/**
 * Confronta una riga della federazione con i nostri dati. `leggi(percorso)` legge dal Realtime Database.
 * Restituisce { scheda, squadra, sempre } con "ok", "manca", "diverso" (o "dopo" se il tempo è arrivato
 * dopo il nostro ultimo aggiornamento di quella stagione).
 */
export async function controllaRiga({
  r, st, c, v, sx, leggi, aggiornata,
}) {
  const { cognome, nome } = dividiNome(r.nome);
  const k = chiaveAtleta(cognome, nome, r.anno);
  const dopo = aggiornata && r.data && r.data > aggiornata.slice(0, 10);
  const esito = { k, t: r.ms };
  const scheda = tempoScheda(await leggi(`a/${k}`), st, c, v);
  esito.scheda = scheda === r.ms ? 'ok' : dopo ? 'dopo' : scheda === null ? 'manca' : 'diverso';
  esito.tempoNostro = scheda;
  // Squadra: una delle società della riga (la federazione ne scrive più di una se l'atleta ha cambiato).
  let squadra = 'manca';
  let sempre = 'manca';
  for (const s of r.societa) {
    const id = chiaveSquadra(s);
    const tab = await leggi(`sqs/${id}/s${st}`);
    const t = tempoTabella(tab?.t?.[`${v}|${c}|${sx}`], k);
    if (t === r.ms) squadra = 'ok';
    else if (t !== null && squadra !== 'ok') squadra = 'diverso';
    const tutto = await leggi(`sqx/${id}`);
    const ts = tempoTabella(tutto?.t?.[`${v}|${c}|${sx}`], k);
    if (ts !== null && ts <= r.ms) sempre = 'ok';
    else if (ts !== null && sempre !== 'ok') sempre = 'diverso';
  }
  esito.squadra = squadra === 'ok' || !dopo ? squadra : 'dopo';
  esito.sempre = sempre === 'ok' || !dopo ? sempre : 'dopo';
  return esito;
}

async function principale() {
  const quante = Number(process.argv[2]) || 60;
  const perRichiesta = Number(process.argv[3]) || 40;
  const fileEsempi = process.argv[4] ?? null;
  const fonti = leggiFonti();
  const account = leggiAccountServizio(process.env.FIREBASE_SERVICE_ACCOUNT);
  const chiama = creaClientGoogle(creaGestoreToken(account));
  const db = creaFirestore(chiama, account.project_id);
  const rtdb = creaRtdb(chiama, await trovaUrlRtdb(chiama, account.project_id));
  const stato = (await db.leggi('meta/graduatorie')) ?? {};
  const corrente = Number(stagione(oggiRoma(new Date().toISOString())));
  const memo = new Map();
  const leggi = (p) => {
    if (!memo.has(p)) memo.set(p, rtdb.leggi(p).catch(() => null));
    return memo.get(p);
  };
  const conti = {
    righe: 0, scheda: {}, squadra: {}, sempre: {},
  };
  const esempi = [];
  const codici = Object.entries(CODICI);
  for (let i = 0; i < quante; i++) {
    // Più peso alle stagioni recenti (sono quelle che si guardano di più).
    const st = corrente - (Math.random() < 0.7 ? caso(4) : caso(20));
    const [codFin, c] = codici[caso(codici.length)];
    const [v, idv] = Math.random() < 0.65 ? [25, '1'] : [50, '2'];
    const sx = Math.random() < 0.5 ? 'M' : 'F';
    const y = st - 9 - caso(14);
    let righe;
    try {
      await pausa(500);
      righe = leggiGraduatoria(await scarica(`${fonti.naz}&currentpage=1&format=json&view=grricerca`, {
        metodo: 'POST',
        timeout: 90,
        modulo: {
          'solr[settore]': 'NUO', 'solr[sesso]': sx, 'solr[id_lunghezza_vasca]': idv, 'solr[kindtime]': '3', 'solr[stagione]': String(st),
          'solr[codice_gara]': codFin.padStart(2, '0'), 'solr[id_comitato]': '', 'solr[dalyob]': String(y), 'solr[alyob]': String(y), 'solr[limit]': '5000',
        },
      })).filter((r) => tempoValido(r.turno));
    } catch {
      continue;
    }
    const scelte = righe.sort(() => Math.random() - 0.5).slice(0, perRichiesta);
    const aggiornata = stato.rtdb?.[st] ?? null;
    await Promise.all(scelte.map(async (r) => {
      const e = await controllaRiga({
        r, st, c, v, sx, leggi, aggiornata,
      });
      conti.righe++;
      for (const campo of ['scheda', 'squadra', 'sempre']) conti[campo][e[campo]] = (conti[campo][e[campo]] ?? 0) + 1;
      if (['scheda', 'squadra', 'sempre'].some((campo) => !['ok', 'dopo'].includes(e[campo])) && esempi.length < 200) {
        esempi.push({
          ...e, nome: r.nome, st, c, v, sx, data: r.data, turno: r.turno, societa: r.societa,
        });
      }
    }));
  }
  const pct = (o) => `${o.ok ?? 0}/${Object.values(o).reduce((a, b) => a + b, 0)} giusti${Object.entries(o).filter(([x]) => x !== 'ok').map(([x, n]) => `, ${n} ${x}`).join('')}`;
  const testo = `${conti.righe} tempi controllati. Schede: ${pct(conti.scheda)}. Squadre (stagione): ${pct(conti.squadra)}. Squadre (di sempre): ${pct(conti.sempre)}.`;
  console.log(process.env.GITHUB_ACTIONS ? `::notice title=Verifica::${testo}` : testo);
  await db.scrivi('meta/verifica', { quando: new Date().toISOString(), conti, testo });
  if (fileEsempi) writeFileSync(fileEsempi, JSON.stringify(esempi, null, 1));
}

if (process.argv[1]?.endsWith('verifica.js')) {
  principale().catch((e) => {
    console.log(`::error title=Verifica::${e.message}`);
    process.exit(1);
  });
}
