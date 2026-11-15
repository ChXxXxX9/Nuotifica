// Giro delle graduatorie (workflow "Graduatorie"):
//   node src/giro-graduatorie.js            di notte: la stagione in corso del Lazio, poi una stagione di tutta Italia
//   node src/giro-graduatorie.js lazio      tutte le stagioni passate del Lazio nei pacchi (finché c'è spazio oggi)
//   node src/giro-graduatorie.js italia     una stagione di tutta Italia nei pacchi
//   node src/giro-graduatorie.js 2024       quella stagione del Lazio con una scheda per atleta
//   node src/giro-graduatorie.js italia 2024
// Sempre solo se nel limite giornaliero di scritture di Firestore c'è abbastanza spazio.
import { leggiFonti, scarica } from './fonti.js';
import { leggiAccountServizio, creaGestoreToken, creaClientGoogle } from './google.js';
import { creaFirestore } from './firestore.js';
import { giroGraduatorie } from './graduatorie.js';
import { giornoQuota } from './tempi.js';

// Si parte solo sotto questa soglia (tutti i lavori insieme, oggi); e ci si ferma prima di questa.
// Il piano gratuito ne permette 20.000; il giorno di Firestore finisce alle 9 di mattina italiane.
const SOGLIA = 11_000;
const STOP = 17_500;

function annota(livello, testo) {
  const t = String(testo).replace(/%/g, '%25').replace(/\r?\n/g, '%0A');
  console.log(process.env.GITHUB_ACTIONS ? `::${livello} title=Graduatorie::${t}` : testo);
}

const riassunto = (e) => (e.saltato ? `niente da fare (${e.saltato})`
  : `${e.italia ? 'Italia' : 'Lazio'} ${e.stagione}/${String(Number(e.stagione) + 1).slice(2)}: ${e.atleti} atleti${e.nuovi !== undefined ? ` (${e.nuovi} nuovi)` : ''}, ${e.squadre ?? 0} squadre`);

async function principale() {
  const fonti = leggiFonti();
  const account = leggiAccountServizio(process.env.FIREBASE_SERVICE_ACCOUNT);
  const db = creaFirestore(creaClientGoogle(creaGestoreToken(account)), account.project_id);
  const adesso = new Date().toISOString();
  const giorno = giornoQuota(adesso);
  const letti = await db.leggiTanti(['meta/budget', 'meta/budget-grad']);
  const budget = letti.get('meta/budget') ?? {};
  const grad = letti.get('meta/budget-grad') ?? {};
  const giaGrad = grad.giorno === giorno ? (grad.scritture ?? 0) : 0;
  const gia = (budget.giorno === giorno ? (budget.scritture ?? 0) : 0) + giaGrad;
  const argomenti = process.argv.slice(2).filter(Boolean);
  const lavoro = ['lazio', 'italia'].includes(argomenti[0]) ? argomenti[0] : 'notte';
  const forza = Number(argomenti.find((x) => /^\d{4}$/.test(x))) || null;
  if (gia > SOGLIA && !forza) {
    annota('notice', `Rimando: oggi già ${gia} scritture.`);
    return;
  }
  try {
    const esito = await giroGraduatorie({
      db, fonti, scarica, adesso, forza, lavoro, log: (t) => console.log(t), puoContinuare: (stima) => gia + db.conta.scritture + stima < STOP,
    });
    const elenco = esito.esiti ?? esito.lazio ?? [esito];
    annota('notice', `${elenco.map(riassunto).join(' · ') || 'niente da fare'} — ${db.conta.scritture} scritture.`);
  } finally {
    await db.scrivi('meta/budget-grad', { giorno, scritture: giaGrad + db.conta.scritture + 1 });
    if (gia + db.conta.scritture > STOP) annota('warning', `Oggi ${gia + db.conta.scritture} scritture: mi fermo qui.`);
  }
}

principale().catch((e) => {
  annota('error', e.message ?? e);
  process.exit(1);
});
