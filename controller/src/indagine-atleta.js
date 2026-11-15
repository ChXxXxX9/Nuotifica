// Prova temporanea: come si leggono tutte le gare di un atleta. I risultati si salvano in una cartella
// che il workflow cifra prima di caricarla (nei log solo dimensioni, niente contenuti né indirizzi).
import { mkdirSync, writeFileSync } from 'node:fs';
import { leggiFonti, scarica } from './fonti.js';
import { leggiGraduatoria } from './graduatorie.js';

const fonti = leggiFonti();
const dir = process.argv[2] ?? 'indagine';
mkdirSync(dir, { recursive: true });
const salva = (nome, testo) => { writeFileSync(`${dir}/${nome}`, testo ?? ''); console.log(`${nome}: ${String(testo ?? '').length} caratteri`); };
const post = (campi, pagina = 1) => scarica(`${fonti.naz}&currentpage=${pagina}&format=json&view=${campi.view}`, {
  metodo: 'POST', timeout: 60, tentativi: 1, modulo: { 'solr[settore]': 'NUO', ...campi.modulo },
}).catch((e) => `ERRORE ${e.message}`);
const pausa = () => new Promise((r) => { setTimeout(r, 800); });

const base = {
  'solr[sesso]': 'M', 'solr[id_lunghezza_vasca]': '1', 'solr[kindtime]': '3', 'solr[stagione]': '2025',
  'solr[codice_gara]': '01', 'solr[id_comitato]': '12', 'solr[limit]': '5',
};
const primo = await post({ view: 'grricerca', modulo: base });
salva('00-grricerca.json', primo);
const righe = leggiGraduatoria(primo);
const r = righe[2] ?? righe[0];
salva('00-riga.json', JSON.stringify(r, null, 1));
const id = r?.idAtleta;

const conta = (testo) => {
  try {
    const c = JSON.parse(testo).content ?? '';
    return c.split(/<h4>/).slice(1).map((v) => `${v.slice(0, 14)}: ${(v.match(/class="row"/g) ?? []).length}`).join(', ');
  } catch { return 'non JSON'; }
};
const spec = (codice, extra = {}) => ({ view: 'grspecialitaatleta', modulo: { 'solr[id_atleta]': id, 'solr[codice_gara]': codice, ...extra } });
const prove = [
  ['20-spec-base', spec('01'), 1],
  ['21-spec-limit200', spec('01', { 'solr[limit]': '200' }), 1],
  ['22-spec-pagina2', spec('01'), 2],
  ['23-spec-50sl-limit1000', spec('00', { 'solr[limit]': '1000' }), 1],
  ['24-spec-limit-semplice', spec('01', { limit: '200' }), 1],
];
for (const [nome, campi, pagina] of prove) {
  await pausa();
  const testo = await post(campi, pagina);
  salva(`${nome}.json`, testo);
  console.log(`  righe per vasca: ${conta(testo)}`);
}
