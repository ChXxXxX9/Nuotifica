// Legge il testo dei PDF nuovi degli avvisi (lo avvia il workflow del controllore solo quando serve)
// e avvisa chi segue un atleta che compare in un elenco nuovo ("Sei in start list").
import { leggiAccountServizio, creaGestoreToken, creaClientGoogle } from './google.js';
import { creaFirestore } from './firestore.js';
import { creaInvio } from './invio.js';
import { aggiornaTesti, avvisaElenchi } from './testi.js';
import { caricaPrivato } from './nascosti.js';

const account = leggiAccountServizio(process.env.FIREBASE_SERVICE_ACCOUNT);
const chiamaGoogle = creaClientGoogle(creaGestoreToken(account));
const db = creaFirestore(chiamaGoogle, account.project_id);
// Atleti che hanno chiesto di non comparire (senza l'elenco ci si ferma).
await caricaPrivato(db);
const invio = creaInvio({ chiamaGoogle, progetto: account.project_id });
const sito = (process.env.SITO_URL || 'https://cloro.web.app').replace(/\/+$/, '');

try {
  const letti = await aggiornaTesti({ db, adesso: new Date().toISOString() });
  console.log(`Testi: ${letti.length} documenti letti.`);
  const n = await avvisaElenchi({
    db, invio, sito, letti,
  });
  if (n && process.env.GITHUB_ACTIONS) console.log(`::notice title=Start list::${n} notifiche`);
} catch (e) {
  console.log(`::warning title=Testi::${String(e.message).slice(0, 300)}`);
}
