// Sentinella (workflow "Sentinella", ogni 30 minuti, separata dal controllore): se il controllore non fa
// un giro da più di 30 minuti, una notifica all'admin; se resta fermo, un promemoria ogni 6 ore; quando
// riparte, un'ultima notifica. Se la notifica non può partire (Firestore non risponde, o l'admin non ha
// un telefono con le notifiche attive), la corsa fallisce e GitHub manda la sua email.
//   node src/sentinella.js    (serve FIREBASE_SERVICE_ACCOUNT; le fonti no)
import { leggiAccountServizio, creaGestoreToken, creaClientGoogle } from './google.js';
import { creaFirestore } from './firestore.js';
import { creaInvio } from './invio.js';
import { giroSentinella } from './allarmi.js';

function annota(livello, testo) {
  const t = String(testo).replace(/%/g, '%25').replace(/\r?\n/g, '%0A');
  console.log(process.env.GITHUB_ACTIONS ? `::${livello} title=Sentinella::${t}` : testo);
}

async function principale() {
  const account = leggiAccountServizio(process.env.FIREBASE_SERVICE_ACCOUNT);
  const progetto = account.project_id;
  const sito = (process.env.SITO_URL || `https://${progetto}.web.app`).replace(/\/+$/, '');
  const chiamaGoogle = creaClientGoogle(creaGestoreToken(account));
  const db = creaFirestore(chiamaGoogle, progetto);
  const invio = creaInvio({ chiamaGoogle, progetto });
  const esito = await giroSentinella({ db, invio, sito });
  if (esito.azione) {
    annota('warning', `${esito.messaggio.titolo}. ${esito.messaggio.corpo}`);
    if (!esito.inviate) throw new Error(`${esito.messaggio.titolo}, ma la notifica all'admin non è partita (nessun telefono con le notifiche attive).`);
  }
}

principale().catch((e) => {
  annota('error', e.message ?? e);
  process.exit(1);
});
