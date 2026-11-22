// Controllo dei tempi "da staffetta": devono essere solo prime frazioni.
// 1. Nelle graduatorie nazionali di alcune stagioni si contano tutte le diciture del turno (gara, passaggio,
//    frazioni di staffetta…) e come le tratta Cloro: tenuto come tempo individuale, tenuto "da staffetta",
//    scartato. Una frazione che non sia la prima non deve mai essere tenuta.
// 2. Una prima frazione può essere solo a stile libero o a dorso (la mista parte a dorso): altre gare con
//    "prima frazione" sono anomalie.
// 3. Ogni prima frazione trovata si confronta con la scheda dell'atleta nel Realtime Database (deve esserci
//    con l'etichetta "da staffetta", oppure un tempo migliore nella stessa gara).
// 4. Per alcune di queste si guarda lo storico gara per gara della fonte: come compare la stessa gara lì.
// Nei log solo i numeri; le diciture e gli esempi vanno nel file passato come argomento (poi cifrato).
import { writeFileSync } from 'node:fs';
import { leggiFonti, scarica } from './fonti.js';
import { leggiAccountServizio, creaGestoreToken, creaClientGoogle } from './google.js';
import { trovaUrlRtdb, creaRtdb } from './rtdb.js';
import {
  CODICI, leggiGraduatoria, dividiNome, tempoValido, tipoTempo,
} from './graduatorie.js';
import { chiaveAtleta, oggiRoma } from './tempi.js';
import { stagione } from './gare.js';
import { creaChiedi } from './storico.js';

const PRIME = new Set(['50SL', '100SL', '200SL', '50DO', '100DO']);
const GARE = ['00', '01', '02', '20', '21', '30', '31', '40', '41'];

async function principale() {
  const fileEsiti = process.argv[2] ?? null;
  const quanteStagioni = Number(process.argv[3]) || 3;
  const fonti = leggiFonti();
  const account = leggiAccountServizio(process.env.FIREBASE_SERVICE_ACCOUNT);
  const chiama = creaClientGoogle(creaGestoreToken(account));
  const rtdb = creaRtdb(chiama, await trovaUrlRtdb(chiama, account.project_id));
  const chiedi = creaChiedi({ fonti, scarica, attesa: 500 });
  const corrente = Number(stagione(oggiRoma(new Date().toISOString())));
  const stagioni = [corrente, corrente - 1, corrente - 2, corrente - 4, corrente - 7].slice(0, quanteStagioni);

  const turni = new Map();
  const anomalie = [];
  const prime = [];
  let richieste = 0;
  let errori = 0;
  for (const st of stagioni) {
    for (const codFin of GARE) {
      const c = CODICI[codFin];
      for (const [v, idv] of [[25, '1'], [50, '2']]) {
        for (const sx of ['M', 'F']) {
          let righe;
          try {
            righe = leggiGraduatoria(await chiedi({
              view: 'grricerca',
              'solr[sesso]': sx,
              'solr[id_lunghezza_vasca]': idv,
              'solr[kindtime]': '3',
              'solr[stagione]': String(st),
              'solr[codice_gara]': codFin,
              'solr[id_comitato]': '',
              'solr[limit]': '5000',
            }));
            richieste++;
          } catch {
            errori++;
            continue;
          }
          for (const r of righe) {
            const chiave = r.turno || '(vuoto)';
            if (!turni.has(chiave)) {
              turni.set(chiave, {
                n: 0, tenuto: tempoValido(r.turno), tipo: tipoTempo(r.turno) || 'individuale', gare: new Set(),
              });
            }
            const x = turni.get(chiave);
            x.n++;
            x.gare.add(c);
            const tp = tipoTempo(r.turno);
            // Una frazione di staffetta tenuta come tempo deve essere "prima frazione".
            if (tempoValido(r.turno) && /frazion|staffett|lanciat/i.test(r.turno) && tp !== 'f') {
              anomalie.push({
                motivo: 'frazione tenuta senza "prima frazione"', turno: r.turno, c, v, sx, st, nome: r.nome, t: r.ms, data: r.data,
              });
            }
            if (tp === 'f') {
              if (!PRIME.has(c)) {
                anomalie.push({
                  motivo: 'prima frazione in una gara che non apre staffette', turno: r.turno, c, v, sx, st, nome: r.nome, t: r.ms, data: r.data,
                });
              }
              const { cognome, nome } = dividiNome(r.nome);
              prime.push({
                k: chiaveAtleta(cognome, nome, r.anno), nome: r.nome, c, v, sx, st, t: r.ms, data: r.data, turno: r.turno, idAtleta: r.idAtleta, codFin,
              });
            }
          }
        }
      }
    }
  }

  // Le prime frazioni nelle nostre schede: c'è il tempo con l'etichetta, o uno migliore nella stessa gara.
  const conti = {
    conEtichetta: 0, migliore: 0, senzaEtichetta: 0, manca: 0, nascostoOAssente: 0,
  };
  const esempi = [];
  for (const p of prime) {
    const doc = await rtdb.leggi(`a/${p.k}`).catch(() => null);
    const riga = doc?.[`s${p.st}`];
    if (!riga) {
      conti.nascostoOAssente++;
      continue;
    }
    const voce = String(riga).split('~').slice(1).find((x) => x.startsWith(`${p.c}|${p.v}|`));
    const [, , t, , , tp] = String(voce ?? '').split('|');
    let esito;
    if (!voce) esito = 'manca';
    else if (Number(t) === p.t && tp === 'f') esito = 'conEtichetta';
    else if (Number(t) < p.t) esito = 'migliore';
    else esito = 'senzaEtichetta';
    conti[esito]++;
    if (esito !== 'conEtichetta' && esito !== 'migliore' && esempi.length < 60) esempi.push({ ...p, esito, nostra: voce ?? null });
  }

  // Storico gara per gara della fonte: come compare la stessa prima frazione (dicitura del turno, se c'è).
  const storico = [];
  for (const p of prime.filter((x) => x.idAtleta).sort(() => Math.random() - 0.5).slice(0, 12)) {
    try {
      const json = await chiedi({
        view: 'grspecialitaatleta', 'solr[id_atleta]': p.idAtleta, 'solr[codice_gara]': p.codFin, 'solr[limit]': '2000',
      });
      const html = (typeof json === 'string' ? JSON.parse(json) : json)?.content ?? '';
      const righe = html.split(/class="row"/).slice(1);
      const intestazioni = [...new Set([...html.matchAll(/class="([a-z-]+)"><span/g)].map((m) => m[1]))];
      const stessa = righe.find((r) => r.includes(String(p.data ?? '').split('-').reverse().join('/')) || r.includes(p.data ?? '§'));
      storico.push({
        k: p.k,
        c: p.c,
        data: p.data,
        t: p.t,
        colonne: intestazioni,
        turnoNelloStorico: stessa?.match(/class="turno"><span title="([^"]*)"/)?.[1] ?? null,
        riga: stessa ? stessa.replace(/\s+/g, ' ').slice(0, 1200) : null,
      });
    } catch (e) {
      storico.push({ k: p.k, errore: String(e.message).slice(0, 200) });
    }
  }

  const elencoTurni = [...turni].map(([turno, x]) => ({ turno, ...x, gare: [...x.gare] })).sort((a, b) => b.n - a.n);
  const testo = `${richieste} graduatorie lette (${errori} non riuscite), ${elencoTurni.length} diciture del turno, `
    + `${prime.length} prime frazioni, ${anomalie.length} anomalie. Nelle schede: ${conti.conEtichetta} con etichetta, `
    + `${conti.migliore} con un tempo migliore, ${conti.senzaEtichetta} senza etichetta, ${conti.manca} mancanti, ${conti.nascostoOAssente} senza scheda della stagione.`;
  console.log(process.env.GITHUB_ACTIONS ? `::notice title=Staffette::${testo}` : testo);
  if (fileEsiti) {
    writeFileSync(fileEsiti, JSON.stringify({
      turni: elencoTurni, anomalie: anomalie.slice(0, 200), conti, esempi, storico,
    }, null, 1));
  }
}

if (process.argv[1]?.endsWith('controlla-staffette.js')) {
  principale().catch((e) => {
    console.log(`::error title=Staffette::${String(e.message).slice(0, 300)}`);
    process.exit(1);
  });
}
