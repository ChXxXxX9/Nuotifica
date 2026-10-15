// Prepara il progetto Firebase: controlla che esista il database Firestore "(default)" e, se manca, lo crea.
// Uso (su GitHub Actions): node src/prepara.js
import { leggiAccountServizio, creaGestoreToken, creaClientGoogle } from './google.js';

const LUOGO = process.env.FIRESTORE_LUOGO || 'eur3'; // Europa (più regioni)

function annota(livello, testo) {
  const t = String(testo).replace(/%/g, '%25').replace(/\r?\n/g, '%0A');
  console.log(process.env.GITHUB_ACTIONS ? `::${livello} title=Prepara::${t}` : testo);
}

async function attendi(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function principale() {
  const account = leggiAccountServizio(process.env.FIREBASE_SERVICE_ACCOUNT);
  const progetto = account.project_id;
  const google = creaClientGoogle(creaGestoreToken(account));
  const base = `https://firestore.googleapis.com/v1/projects/${progetto}/databases`;

  const { databases = [] } = await google(base);
  const nomi = databases.map((d) => d.name.split('/').pop());
  if (nomi.includes('(default)')) {
    const d = databases.find((x) => x.name.endsWith('/(default)'));
    annota('notice', `Firestore pronto: database (default) in ${d.locationId}.`);
    return;
  }
  annota('notice', `Database trovati: ${nomi.length ? nomi.join(', ') : 'nessuno'}. Creo "(default)" in ${LUOGO}.`);

  let operazione = await google(`${base}?databaseId=(default)`, {
    method: 'POST',
    body: { type: 'FIRESTORE_NATIVE', locationId: LUOGO },
  });
  for (let i = 0; i < 40 && !operazione.done; i++) {
    await attendi(5000);
    operazione = await google(`https://firestore.googleapis.com/v1/${operazione.name}`);
  }
  if (operazione.error) throw new Error(`Creazione del database non riuscita: ${operazione.error.message}`);
  annota('notice', `Database (default) creato in ${LUOGO}.`);
}

principale().catch((e) => {
  annota('error', e.message ?? e);
  process.exit(1);
});
