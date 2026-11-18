// Giro delle graduatorie (workflow "Graduatorie"):
//   node src/giro-graduatorie.js            di notte: la stagione in corso del Lazio, poi tutta Italia finché c'è tempo
//   node src/giro-graduatorie.js tutto      tutta Italia, una stagione dopo l'altra (alla fine il workflow si rilancia)
//   node src/giro-graduatorie.js italia 2015   quella stagione di tutta Italia
//   node src/giro-graduatorie.js squadre    i riassunti di tutte le squadre (quello che l'app scarica), da zero
//   node src/giro-graduatorie.js 2024       quella stagione del Lazio con una scheda per atleta
// Firestore ha un tetto di scritture al giorno: le schede del Lazio partono solo se c'è spazio.
// Tutta Italia va nel Realtime Database, che quel tetto non ce l'ha.
import { appendFileSync } from 'node:fs';
import { leggiFonti, scarica } from './fonti.js';
import { leggiAccountServizio, creaGestoreToken, creaClientGoogle } from './google.js';
import { creaFirestore } from './firestore.js';
import { trovaUrlRtdb, creaRtdb } from './rtdb.js';
import { giroGraduatorie } from './graduatorie.js';
import { giroStorico, creaChiedi } from './storico.js';
import { giornoQuota } from './tempi.js';

// Il piano gratuito di Firestore permette 20.000 scritture al giorno (il giorno finisce alle 9 italiane):
// ci si ferma prima di questa soglia, contando anche quelle del controllore.
const STOP = 17_500;
// Dopo quanto non si comincia un'altra stagione (il workflow ha 6 ore; una stagione ne prende al massimo una).
const MINUTI = {
  tutto: 270, notte: 75, italia: 340, squadre: 300,
};

function annota(livello, testo) {
  const t = String(testo).replace(/%/g, '%25').replace(/\r?\n/g, '%0A');
  console.log(process.env.GITHUB_ACTIONS ? `::${livello} title=Graduatorie::${t}` : testo);
}

const nomeSt = (st) => `${st}/${String(Number(st) + 1).slice(2)}`;
const riassunto = (e) => (e.saltato ? `niente da fare (${e.saltato})`
  : e.italia ? `Italia ${nomeSt(e.stagione)}: ${e.atleti} atleti${e.squadre ? `, ${e.squadre} squadre` : ''}${e.vuota ? ' (prima stagione senza tempi: fine)' : ''}`
    : `Lazio ${nomeSt(e.stagione)}: ${e.atleti} atleti${e.nuovi !== undefined ? ` (${e.nuovi} nuovi)` : ''}, ${e.squadre ?? 0} squadre`);

async function principale() {
  const inizio = Date.now();
  const fonti = leggiFonti();
  const account = leggiAccountServizio(process.env.FIREBASE_SERVICE_ACCOUNT);
  const chiama = creaClientGoogle(creaGestoreToken(account));
  const db = creaFirestore(chiama, account.project_id);
  let rtdb = null;
  try {
    rtdb = creaRtdb(chiama, await trovaUrlRtdb(chiama, account.project_id));
  } catch (e) {
    annota('warning', `Realtime Database non raggiungibile: ${e.message}`);
  }
  const adesso = new Date().toISOString();
  const giorno = giornoQuota(adesso);
  const letti = await db.leggiTanti(['meta/budget', 'meta/budget-grad']);
  const grad = letti.get('meta/budget-grad') ?? {};
  const giaGrad = grad.giorno === giorno ? (grad.scritture ?? 0) : 0;
  /** Scritture Firestore di oggi (controllore + graduatorie): si rilegge il conto del controllore ogni volta. */
  const firestoreLibero = async (stima) => {
    const budget = (await db.leggi('meta/budget')) ?? {};
    const controllore = budget.giorno === giornoQuota(new Date().toISOString()) ? (budget.scritture ?? 0) : 0;
    const libero = controllore + giaGrad + db.conta.scritture + stima < STOP;
    if (!libero) console.log(`Firestore: oggi già ${controllore + giaGrad + db.conta.scritture} scritture, salto la parte in Firestore.`);
    return libero;
  };
  const argomenti = process.argv.slice(2).filter(Boolean);
  const lavoro = ['tutto', 'italia', 'squadre', 'pulisci-classifiche'].includes(argomenti[0]) ? argomenti[0] : 'notte';
  if (lavoro === 'pulisci-classifiche') {
    // Classifiche su richiesta salvate in Firestore (prima del Realtime Database): si tolgono. Restano
    // quelle del Lazio preparate di notte (stagione-vasca-gara-sesso e indice).
    const tenere = /^\d{4}-(\d+-[^-]+-[MF]|indice-[MF])$/;
    const docs = await db.elenca('classifiche');
    let tolte = 0;
    for (const d of docs) {
      if (tenere.test(d.id)) continue;
      await db.elimina(`classifiche/${d.id}`);
      tolte++;
    }
    annota('notice', `Classifiche da rifare: tolte ${tolte} su ${docs.length}.`);
    return;
  }
  const forza = Number(argomenti.find((x) => /^\d{4}$/.test(x))) || null;
  // Prima di tutto (di notte e nei giri di tutta Italia): lo storico degli atleti seguiti (aggiornato una volta a settimana), al massimo 30 minuti.
  if (['notte', 'tutto'].includes(lavoro) && !forza && rtdb && fonti.naz) {
    try {
      const s = await giroStorico({
        db, rtdb, chiedi: creaChiedi({ fonti, scarica }), adesso, scadenza: Date.now() + 30 * 60_000, log: (t) => console.log(t),
      });
      if (s.atleti) annota('notice', `Storico: ${s.atleti} atleti seguiti, ${s.gare} gare.`);
    } catch (e) {
      annota('warning', `Storico: ${e.message}`);
    }
  }
  try {
    const esito = await giroGraduatorie({
      db,
      rtdb,
      fonti,
      scarica,
      adesso,
      forza,
      lavoro,
      log: (t) => console.log(t),
      firestoreLibero,
      scadenza: inizio + (MINUTI[lavoro] ?? 75) * 60_000,
    });
    const elenco = esito.esiti ?? [esito];
    const minuti = Math.round((Date.now() - inizio) / 60_000);
    annota('notice', `${elenco.map(riassunto).join(' · ') || 'niente da fare'} — ${minuti} min, ${db.conta.scritture} scritture Firestore${rtdb ? `, ${rtdb.conta.scritture} invii al Realtime Database (${Math.round(rtdb.conta.byte / 1e6)} MB)` : ''}.`);
    if (esito.ancora && !forza) {
      annota('notice', 'Restano stagioni da leggere: riparto subito con un altro giro.');
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'ancora=si\n');
    }
  } catch (e) {
    // Un errore dopo un bel po' di lavoro (una connessione caduta) non deve fermare il ricaricamento:
    // si riparte con un altro giro. Se invece si ferma subito, è un problema vero e si lascia fermo.
    if (lavoro === 'tutto' && !forza && Date.now() - inizio > 20 * 60_000 && process.env.GITHUB_OUTPUT) {
      annota('warning', `Interrotto (${e.message}): riparto con un altro giro.`);
      appendFileSync(process.env.GITHUB_OUTPUT, 'ancora=si\n');
    }
    throw e;
  } finally {
    await db.scrivi('meta/budget-grad', { giorno, scritture: giaGrad + db.conta.scritture + 1 });
  }
}

principale().catch((e) => {
  annota('error', e.message ?? e);
  process.exit(1);
});
