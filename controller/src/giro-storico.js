// Storico gara per gara di tutti gli atleti seguiti (workflow "Storico", a mano): chi non ce l'ha o ce l'ha
// più vecchio di una settimana. Di solito lo fanno il controllore (atleti appena seguiti) e il giro di notte.
import { leggiFonti, scarica } from './fonti.js';
import { leggiAccountServizio, creaGestoreToken, creaClientGoogle } from './google.js';
import { creaFirestore } from './firestore.js';
import { trovaUrlRtdb, creaRtdb } from './rtdb.js';
import { giroStorico, creaChiedi } from './storico.js';
import { caricaPrivato } from './nascosti.js';

const fonti = leggiFonti();
const account = leggiAccountServizio(process.env.FIREBASE_SERVICE_ACCOUNT);
const chiama = creaClientGoogle(creaGestoreToken(account));
const db = creaFirestore(chiama, account.project_id);
// Atleti che hanno chiesto di non comparire (senza l'elenco ci si ferma).
await caricaPrivato(db);
const rtdb = creaRtdb(chiama, await trovaUrlRtdb(chiama, account.project_id));
const inizio = Date.now();
try {
  const esito = await giroStorico({
    db, rtdb, chiedi: creaChiedi({ fonti, scarica }), scadenza: inizio + 100 * 60_000, log: (t) => console.log(t),
  });
  console.log(`::notice title=Storico::${esito.atleti} atleti seguiti, ${esito.gare} gare, ${Math.round((Date.now() - inizio) / 60_000)} min.`);
} catch (e) {
  console.log(`::error title=Storico::${e.message}`);
  process.exit(1);
}
