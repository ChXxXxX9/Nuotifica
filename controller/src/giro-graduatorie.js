// Giro notturno delle graduatorie (workflow "Graduatorie"): una stagione per volta,
// solo se nel tetto giornaliero di scritture di Firestore c'è abbastanza spazio.
// Uso: node src/giro-graduatorie.js [stagione]
import { leggiFonti, scarica } from './fonti.js';
import { leggiAccountServizio, creaGestoreToken, creaClientGoogle } from './google.js';
import { creaFirestore } from './firestore.js';
import { giroGraduatorie } from './graduatorie.js';
import { giornoQuota } from './tempi.js';

// Si parte solo se oggi (tutti i lavori insieme) sono state fatte meno scritture di così:
// una stagione ne usa al massimo 7-8 mila e il piano gratuito ne permette 20.000.
const SOGLIA = 8_000;

function annota(livello, testo) {
  const t = String(testo).replace(/%/g, '%25').replace(/\r?\n/g, '%0A');
  console.log(process.env.GITHUB_ACTIONS ? `::${livello} title=Graduatorie::${t}` : testo);
}

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
  const forza = process.argv[2] ? Number(process.argv[2]) : null;
  if (gia > SOGLIA && !forza) {
    annota('notice', `Rimando: oggi già ${gia} scritture.`);
    return;
  }
  const esito = await giroGraduatorie({
    db, fonti, scarica, adesso, forza, log: (t) => console.log(t),
  });
  await db.scrivi('meta/budget-grad', { giorno, scritture: giaGrad + db.conta.scritture + 1 });
  annota('notice', esito.saltato
    ? `Niente da fare (${esito.saltato}).`
    : `Stagione ${esito.stagione}/${String(esito.stagione + 1).slice(2)}: ${esito.atleti} atleti (${esito.nuovi ?? 0} nuovi), ${esito.squadre ?? 0} squadre, ${db.conta.scritture} scritture.`);
}

principale().catch((e) => {
  annota('error', e.message ?? e);
  process.exit(1);
});
