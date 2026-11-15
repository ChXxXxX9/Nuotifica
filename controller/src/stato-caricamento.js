// A che punto è il caricamento di tutta Italia (workflow "Stato del caricamento").
import { leggiAccountServizio, creaGestoreToken, creaClientGoogle } from './google.js';
import { creaFirestore } from './firestore.js';
import { trovaUrlRtdb, creaRtdb } from './rtdb.js';

const account = leggiAccountServizio(process.env.FIREBASE_SERVICE_ACCOUNT);
const chiama = creaClientGoogle(creaGestoreToken(account));
const db = creaFirestore(chiama, account.project_id);
const rtdb = creaRtdb(chiama, await trovaUrlRtdb(chiama, account.project_id));
const stato = (await db.leggi('meta/graduatorie')) ?? {};
const fatte = Object.keys(stato.rtdb ?? {}).sort().reverse();
const [atleti, squadre, annate, storici] = await Promise.all([rtdb.chiavi('a'), rtdb.chiavi('sqs'), rtdb.chiavi('ann'), rtdb.chiavi('st')]);
const v2 = Object.entries(stato.rtdbV ?? {}).filter(([, v]) => v >= 2).map(([s]) => s).sort().reverse();
const elenco = Object.keys((await db.leggi('meta/squadre'))?.squadre ?? {}).length;
console.log(`::notice title=Caricamento::Stagioni di tutta Italia: ${fatte.length ? fatte.join(', ') : 'nessuna'}${stato.rtdbFine ? ` (prima stagione senza tempi: ${stato.rtdbFine})` : ''}. Atleti: ${atleti.size}. Squadre: ${squadre.size} (${elenco} nell'elenco). Lette con la versione nuova: ${v2.join(', ') || 'nessuna'}. Indice annata: ${annate.size} stagioni. Storici: ${storici.size}.`);
