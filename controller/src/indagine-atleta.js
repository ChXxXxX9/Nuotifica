// Prova temporanea: come si leggono tutte le gare di un atleta. I risultati si salvano in una cartella
// che il workflow cifra prima di caricarla (nei log solo dimensioni, niente contenuti né indirizzi).
import { mkdirSync, writeFileSync } from 'node:fs';
import { leggiFonti, scarica } from './fonti.js';
import { leggiGraduatoria } from './graduatorie.js';

const fonti = leggiFonti();
const dir = process.argv[2] ?? 'indagine';
mkdirSync(dir, { recursive: true });
const salva = (nome, testo) => { writeFileSync(`${dir}/${nome}`, testo ?? ''); console.log(`${nome}: ${String(testo ?? '').length} caratteri`); };
const post = (campi) => scarica(`${fonti.naz}&currentpage=1&format=json&view=${campi.view}`, {
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

// Pagina e script (per vedere come la pagina chiede le altre viste).
const pagina = await scarica(fonti.naz, { timeout: 60, tentativi: 1 }).catch((e) => `ERRORE ${e.message}`);
salva('01-pagina.html', pagina);
const origine = new URL(fonti.naz).origin;
const script = [...pagina.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => new URL(m[1], fonti.naz).href).filter((u) => u.startsWith(origine));
let n = 0;
for (const u of script.slice(0, 25)) {
  const testo = await scarica(u, { timeout: 60, tentativi: 1 }).catch(() => '');
  if (/view|solr|gratleta|grspecialita/i.test(testo)) salva(`02-script-${++n}.js`, `// ${u.replace(origine, '')}\n${testo}`);
}
// Anche gli script dentro la pagina.
salva('03-script-pagina.js', [...pagina.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((t) => /view|solr|grat/i.test(t)).join('\n/* ---- */\n'));

const prove = [
  ['10-gratleta-solr', { view: 'gratleta', modulo: { 'solr[id_atleta]': id } }],
  ['11-gratleta-id', { view: 'gratleta', modulo: { id_atleta: id } }],
  ['12-gratleta-kind1', { view: 'gratleta', modulo: { 'solr[id_atleta]': id, 'solr[kindtime]': '1' } }],
  ['13-grspecialita', { view: 'grspecialitaatleta', modulo: { 'solr[id_atleta]': id, 'solr[codice_gara]': '01', 'solr[id_lunghezza_vasca]': '1' } }],
  ['14-grspecialita-kind1', { view: 'grspecialitaatleta', modulo: { 'solr[id_atleta]': id, 'solr[codice_gara]': '01', 'solr[id_lunghezza_vasca]': '1', 'solr[kindtime]': '1' } }],
  ['15-grevento', { view: 'grevento', modulo: { 'solr[id_evento]': r?.idEvento } }],
  ['16-grricerca-kind2', { view: 'grricerca', modulo: { ...base, 'solr[kindtime]': '2', 'solr[limit]': '30' } }],
  ['17-grricerca-atleta', { view: 'grricerca', modulo: { ...base, 'solr[id_atleta]': id, 'solr[kindtime]': '1', 'solr[limit]': '50', 'solr[id_comitato]': '' } }],
];
for (const [nome, campi] of prove) {
  await pausa();
  salva(`${nome}.json`, await post(campi));
}
