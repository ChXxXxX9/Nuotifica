// Prova delle classifiche su richiesta: ne prepara un gruppo vario (Italia e regioni, stagioni, categorie,
// gare piccole e grandi, di sempre) con lo stesso codice del controllore e dice per ognuna quanti atleti,
// se è intera e quanto ci ha messo. Nel log solo numeri e codici delle classifiche.
import { leggiFonti, scarica } from './fonti.js';
import { leggiAccountServizio, creaGestoreToken, creaClientGoogle } from './google.js';
import { trovaUrlRtdb, creaRtdb } from './rtdb.js';
import { preparaClassifica, idClassifica, richiestaValida } from './classifiche.js';
import { REGOLE_BASE } from './categorie.js';
import { stagione } from './gare.js';
import { oggiRoma } from './tempi.js';

const fonti = leggiFonti();
const account = leggiAccountServizio(process.env.FIREBASE_SERVICE_ACCOUNT);
const chiama = creaClientGoogle(creaGestoreToken(account));
const rtdb = creaRtdb(chiama, await trovaUrlRtdb(chiama, account.project_id));
const adesso = new Date().toISOString();
const st = stagione(oggiRoma(adesso));
const prec = String(Number(st) - 1);
const prove = [
  [st, 25, '50SL', 'M', 'it', 'tutte'], [st, 25, '100SL', 'F', 'it', 'tutte'], [prec, 25, '50SL', 'M', 'it', 'tutte'],
  [prec, 50, '50SL', 'F', 'it', 'tutte'], [prec, 50, '100RA', 'M', 'it', 'tutte'], [prec, 25, '1500SL', 'F', 'it', 'tutte'],
  [prec, 50, '200FA', 'M', 'it', 'tutte'], [prec, 25, '400MI', 'F', 'it', 'tutte'], [prec, 25, '50DO', 'M', 'it', 'tutte'],
  [prec, 25, '100SL', 'M', '12', 'tutte'], [prec, 25, '100SL', 'M', '3', 'tutte'], [prec, 50, '200DO', 'F', '9', 'tutte'],
  [st, 25, '800SL', 'M', '14', 'tutte'], ['2010', 25, '100FA', 'F', 'it', 'tutte'], ['1995', 50, '100SL', 'M', 'it', 'tutte'],
  ['tutte', 25, '50SL', 'M', 'it', 'tutte'], ['tutte', 50, '100RA', 'F', 'it', 'R'], ['tutte', 25, '200SL', 'M', '12', 'tutte'],
  [st, 50, '1500SL', 'F', '17', 'tutte'],
];
const chiedi = async (campi) => {
  await new Promise((ok) => { setTimeout(ok, 300); });
  return scarica(`${fonti.naz}&currentpage=1&format=json&view=grricerca`, { metodo: 'POST', timeout: 90, modulo: { 'solr[settore]': 'NUO', ...campi } });
};
const esiti = [];
for (const [s, v, c, sx, reg, cat] of prove) {
  const r = {
    st: String(s), v, c, sx, reg, cat,
  };
  const id = idClassifica(r);
  if (!richiestaValida(r)) {
    esiti.push(`${id}: richiesta non valida`);
    continue;
  }
  const inizio = Date.now();
  try {
    const n = await preparaClassifica({
      rtdb, chiedi, r, adesso, regole: REGOLE_BASE,
    });
    const doc = await rtdb.leggi(`cl/${id}`);
    const righe = String(doc?.righe ?? '').split('~').filter(Boolean);
    const passaggi = righe.filter((x) => x.split('|')[6] === 'p').length;
    esiti.push(`${id}: ${n} atleti${doc?.parziale ? ' (i primi)' : ' (intera)'}${passaggi ? `, ${passaggi} passaggi!` : ''}, ${Math.round((Date.now() - inizio) / 1000)} s`);
  } catch (e) {
    esiti.push(`${id}: ERRORE ${e.message}`);
  }
  console.log(esiti[esiti.length - 1]);
}
console.log(`::notice title=Prova classifiche::${esiti.join(' · ')}`);
