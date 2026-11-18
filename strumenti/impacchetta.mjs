// Solo nella copia pubblicata: il codice dell'app diventa pochi file (uno principale + i pezzi caricati
// dopo), così all'apertura il telefono legge 2-3 file invece di 25. Aggiorna anche il service worker
// (elenco dei file e versione) e i "preload" di index.html.
//   node strumenti/impacchetta.mjs public <versione>
import { execFileSync } from 'node:child_process';
import {
  readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync, copyFileSync,
} from 'node:fs';
import { join, basename, resolve } from 'node:path';

const [cartella = 'public', versione = String(Date.now())] = process.argv.slice(2);
const pub = resolve(cartella);
const tmp = resolve(pub, '..', '.pacchetto');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const meta = join(tmp, 'meta.json');
execFileSync('npx', ['--yes', 'esbuild@0.24.2', join(pub, 'js', 'app.js'), '--bundle', '--splitting', '--format=esm', '--minify',
  `--outdir=${join(tmp, 'js')}`, '--entry-names=[name]', '--chunk-names=pezzo-[hash]', `--metafile=${meta}`, '--log-level=warning'], { stdio: 'inherit' });

// Quali pezzi: quello dell'anteprima (dati di esempio) non serve sul telefono, gli altri si tengono in memoria.
const uscite = JSON.parse(readFileSync(meta, 'utf8')).outputs;
const file = Object.entries(uscite).map(([p, o]) => ({ nome: basename(p), entrate: Object.keys(o.inputs) }));
const demo = (f) => f.entrate.some((e) => /demo/.test(e));
const daTenere = file.filter((f) => !demo(f)).map((f) => f.nome);
const backend = file.find((f) => f.entrate.some((e) => /backend-firebase/.test(e)))?.nome;
if (!daTenere.includes('app.js') || !backend) throw new Error('Impacchettamento non riuscito: manca app.js o il pezzo di Firebase.');

// Al posto dei file sorgente, quelli impacchettati.
for (const f of readdirSync(join(pub, 'js'))) rmSync(join(pub, 'js', f));
for (const f of readdirSync(join(tmp, 'js'))) copyFileSync(join(tmp, 'js', f), join(pub, 'js', f));
rmSync(tmp, { recursive: true, force: true });

// Service worker: versione nuova (così si aggiorna da solo) e l'elenco dei file da tenere in memoria.
const swPercorso = join(pub, 'sw.js');
let sw = readFileSync(swPercorso, 'utf8');
sw = sw.replace(/const VERSIONE = '[^']*';/, `const VERSIONE = 'cloro-${versione}';`);
sw = sw.replace(/\n  '\/js\/[^']*',/g, '');
sw = sw.replace("  '/css/app.css',", `  '/css/app.css',\n${daTenere.map((n) => `  '/js/${n}',`).join('\n')}`);
writeFileSync(swPercorso, sw);

// index.html: si precaricano solo i file che esistono (app.js arriva dal tag script; il pezzo di Firebase subito).
const indice = join(pub, 'index.html');
let html = readFileSync(indice, 'utf8');
html = html.replace(/\s*<link rel="modulepreload" href="\/js\/[^"]*">/g, '');
html = html.replace('<script type="module" src="/js/app.js"></script>',
  `${daTenere.filter((n) => n !== 'app.js').map((n) => `<link rel="modulepreload" href="/js/${n}">`).join('\n  ')}\n  <script type="module" src="/js/app.js"></script>`);
writeFileSync(indice, html);
console.log(`Impacchettato: ${daTenere.join(', ')} (versione ${versione}).`);
