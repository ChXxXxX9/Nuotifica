// Solo nella copia pubblicata, come ultimo passo (dopo impacchetta.mjs e la compressione del CSS):
// scrive nel service worker l'impronta di ogni file che tiene in memoria. Così a un aggiornamento il
// telefono riscarica solo i file cambiati e copia gli altri dalla versione che ha già.
//   node strumenti/impronte.mjs public
// L'impronta è la stessa che calcola il service worker: le prime 16 cifre esadecimali dello SHA-256.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const pub = resolve(process.argv[2] ?? 'public');
const swPercorso = join(pub, 'sw.js');
let sw = readFileSync(swPercorso, 'utf8');
const elenco = sw.match(/const GUSCIO = \[([\s\S]*?)\];/);
if (!elenco) throw new Error('Nel service worker manca l\'elenco GUSCIO.');
const guscio = [...elenco[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
const impronte = {};
let byte = 0;
for (const u of guscio) {
  // "/" è la pagina dell'app (index.html). Un file che manca ferma la pubblicazione.
  const contenuto = readFileSync(join(pub, u === '/' ? 'index.html' : u.slice(1)));
  impronte[u] = createHash('sha256').update(contenuto).digest('hex').slice(0, 16);
  byte += contenuto.length;
}
if (!/const IMPRONTE = \{\};/.test(sw)) throw new Error('Nel service worker manca "const IMPRONTE = {};".');
sw = sw.replace('const IMPRONTE = {};', `const IMPRONTE = ${JSON.stringify(impronte)};`);
writeFileSync(swPercorso, sw);
console.log(`Impronte di ${guscio.length} file (${Math.round(byte / 1024)} KB in tutto).`);
