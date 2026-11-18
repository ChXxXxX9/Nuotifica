// Diagnosi: le classifiche preparate su richiesta (Realtime Database, cl/) e le richieste in coda (Firestore).
import { leggiAccountServizio, creaGestoreToken, creaClientGoogle } from './google.js';
import { creaFirestore } from './firestore.js';
import { trovaUrlRtdb, creaRtdb } from './rtdb.js';

const account = leggiAccountServizio(process.env.FIREBASE_SERVICE_ACCOUNT);
const chiama = creaClientGoogle(creaGestoreToken(account));
const db = creaFirestore(chiama, account.project_id);
const rtdb = creaRtdb(chiama, await trovaUrlRtdb(chiama, account.project_id));
const ids = [...await rtdb.chiavi('cl')];
const it = ids.filter((id) => /-it-/.test(id));
const perStagione = {};
for (const id of it) {
  const st = id.split('-')[0];
  perStagione[st] = (perStagione[st] ?? 0) + 1;
}
console.log(`::notice title=Classifiche::Preparate ${ids.length}, nazionali ${it.length}. Per stagione: ${JSON.stringify(perStagione)}`);
const esempi = [];
for (const id of it.slice(-12)) {
  const d = await rtdb.leggi(`cl/${id}`);
  esempi.push(`${id}=${d?.errore ? `errore(${d.errore})` : `${String(d?.righe ?? '').split('~').filter(Boolean).length}${d?.parziale ? 'p' : ''}`}`);
}
console.log(`::notice title=Esempi::${esempi.join(', ')}`);
const richieste = await db.elenca('richieste');
const eta = (r) => Math.round((Date.now() - Date.parse(r.creato ?? 0)) / 60_000);
const ordinate = [...richieste].sort((a, b) => String(a.creato ?? '').localeCompare(String(b.creato ?? '')));
console.log(`::notice title=Richieste::In coda ${richieste.length}; la più vecchia aspetta da ${ordinate[0] ? eta(ordinate[0]) : 0} minuti; più di 10 minuti: ${richieste.filter((r) => eta(r) > 10).length}. ${ordinate.slice(0, 40).map((r) => `${r.id}(${eta(r)}m${r.tentativi ? `, ${r.tentativi} tentativi` : ''})`).join(', ')}`);
