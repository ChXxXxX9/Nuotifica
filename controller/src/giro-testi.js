// Legge il testo dei PDF nuovi degli avvisi (lo avvia il workflow del controllore solo quando serve).
import { leggiAccountServizio, creaGestoreToken, creaClientGoogle } from './google.js';
import { creaFirestore } from './firestore.js';
import { aggiornaTesti } from './testi.js';

const account = leggiAccountServizio(process.env.FIREBASE_SERVICE_ACCOUNT);
const db = creaFirestore(creaClientGoogle(creaGestoreToken(account)), account.project_id);
aggiornaTesti({ db, adesso: new Date().toISOString() })
  .then((n) => console.log(`Testi: ${n} documenti letti (${db.conta.scritture} scritture).`))
  .catch((e) => {
    console.log(`::warning title=Testi::${String(e.message).slice(0, 300)}`);
  });
