// Prova del Realtime Database: trova l'indirizzo, scrive e rilegge un valore.
import { leggiAccountServizio, creaGestoreToken, creaClientGoogle } from './google.js';
import { trovaUrlRtdb, creaRtdb } from './rtdb.js';

const account = leggiAccountServizio(process.env.FIREBASE_SERVICE_ACCOUNT);
const chiama = creaClientGoogle(creaGestoreToken(account));
try {
  const url = await trovaUrlRtdb(chiama, account.project_id);
  const rtdb = creaRtdb(chiama, url);
  const quando = new Date().toISOString();
  await rtdb.scrivi('meta/prova', { quando });
  const letto = await rtdb.leggi('meta/prova');
  console.log(`::notice title=Realtime Database::${url} — scritto e riletto: ${letto?.quando === quando ? 'ok' : JSON.stringify(letto)}`);
} catch (e) {
  console.log(`::error title=Realtime Database::${e.message}`);
  process.exit(1);
}
