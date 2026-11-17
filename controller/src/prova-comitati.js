// Prova temporanea: quali codici di comitato, oltre alle 20 regioni, hanno righe nelle graduatorie
// (società fuori da ogni comitato regionale). Nel log solo i numeri; i nomi delle società nel file cifrato.
import { writeFileSync, mkdirSync } from 'node:fs';
import { leggiFonti, scarica } from './fonti.js';
import { leggiGraduatoria, TUTTE_LE_REGIONI } from './graduatorie.js';

const pausa = (ms) => new Promise((r) => { setTimeout(r, ms); });
const fonti = leggiFonti();
const cartella = process.argv[2];
mkdirSync(cartella, { recursive: true });
const prove = [
  { sx: 'M', vasca: '2', st: '2024', codice: '02' }, // 200 SL M vasca 50 2024/25
  { sx: 'F', vasca: '2', st: '2024', codice: '00' }, // 50 SL F vasca 50 2024/25
];
const codici = ['0', '2', '4', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '40', '50', '90', '98', '99', '100'].filter((c) => !TUTTE_LE_REGIONI.includes(c));
const esiti = [];
for (const p of prove) {
  for (const c of codici) {
    await pausa(800);
    let righe = [];
    let errore = null;
    try {
      righe = leggiGraduatoria(await scarica(`${fonti.naz}&currentpage=1&format=json&view=grricerca`, {
        metodo: 'POST',
        timeout: 90,
        modulo: {
          'solr[settore]': 'NUO', 'solr[sesso]': p.sx, 'solr[id_lunghezza_vasca]': p.vasca, 'solr[kindtime]': '3', 'solr[stagione]': p.st, 'solr[codice_gara]': p.codice, 'solr[id_comitato]': c, 'solr[limit]': '5000',
        },
      }));
    } catch (e) {
      errore = e.message;
    }
    const societa = [...new Set(righe.flatMap((r) => r.societa))];
    console.log(`prova ${p.codice}-${p.sx}-${p.vasca} comitato ${c}: ${righe.length} righe, ${societa.length} società${errore ? ` (errore: ${errore})` : ''}`);
    esiti.push({
      ...p, comitato: c, righe: righe.length, societa: societa.slice(0, 40), nomi: righe.slice(0, 5).map((r) => `${r.nome} ${r.anno}`),
    });
  }
}
writeFileSync(`${cartella}/comitati.json`, JSON.stringify(esiti, null, 1));
