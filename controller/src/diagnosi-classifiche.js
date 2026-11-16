// Diagnosi: le classifiche nazionali salvate (righe, aggiornamento) e le richieste in coda.
import { leggiAccountServizio, creaGestoreToken, creaClientGoogle } from './google.js';
import { creaFirestore } from './firestore.js';

const account = leggiAccountServizio(process.env.FIREBASE_SERVICE_ACCOUNT);
const db = creaFirestore(creaClientGoogle(creaGestoreToken(account)), account.project_id);
const docs = await db.elenca('classifiche');
const it = docs.filter((d) => /-it-/.test(d.id));
const vuote = it.filter((d) => !(d.righe ?? []).length).map((d) => d.id);
const richieste = await db.elenca('richieste');
console.log(`::notice title=Classifiche::Totale ${docs.length}, nazionali ${it.length}, nazionali vuote ${vuote.length}: ${vuote.slice(0, 60).join(', ')}`);
console.log(`::notice title=Richieste::In coda ${richieste.length}: ${richieste.slice(0, 40).map((r) => r.id).join(', ')}`);
const perStagione = {};
for (const d of it) {
  const st = d.id.split('-')[0];
  perStagione[st] = (perStagione[st] ?? 0) + 1;
}
console.log(`::notice title=Per stagione::${JSON.stringify(perStagione)}`);
console.log(`::notice title=Esempi::${it.slice(0, 30).map((d) => `${d.id}=${(d.righe ?? []).length}${d.parziale ? 'p' : ''}`).join(', ')}`);
