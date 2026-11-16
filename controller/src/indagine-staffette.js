// Prova temporanea: quali codici gara sono le staffette nelle graduatorie, e com'è fatta una riga.
// I risultati si salvano in una cartella che il workflow cifra.
import { mkdirSync, writeFileSync } from 'node:fs';
import { leggiFonti, scarica } from './fonti.js';
import { CODICI } from './graduatorie.js';

const fonti = leggiFonti();
const dir = process.argv[2] ?? 'indagine';
mkdirSync(dir, { recursive: true });
const pausa = () => new Promise((r) => { setTimeout(r, 500); });
const riassunto = [];
for (let n = 0; n < 100; n++) {
  const cod = String(n).padStart(2, '0');
  if (CODICI[cod] || CODICI[n]) continue;
  await pausa();
  const testo = await scarica(`${fonti.naz}&currentpage=1&format=json&view=grricerca`, {
    metodo: 'POST', timeout: 60, tentativi: 1,
    modulo: {
      'solr[settore]': 'NUO', 'solr[sesso]': 'M', 'solr[id_lunghezza_vasca]': '1', 'solr[kindtime]': '3', 'solr[stagione]': '2025',
      'solr[codice_gara]': cod, 'solr[id_comitato]': '', 'solr[limit]': '5',
    },
  }).catch((e) => `ERRORE ${e.message}`);
  let righe = 0;
  try { righe = ((JSON.parse(testo).content ?? '').match(/class="row"/g) ?? []).length; } catch { /* */ }
  riassunto.push(`${cod}: ${righe}`);
  if (righe) writeFileSync(`${dir}/${cod}.json`, testo);
}
// Anche misti (sesso X) e femmine per un codice trovato si provano dopo.
writeFileSync(`${dir}/riassunto.txt`, riassunto.join('\n'));
console.log(`Codici con righe: ${riassunto.filter((x) => !x.endsWith(': 0')).length}`);
