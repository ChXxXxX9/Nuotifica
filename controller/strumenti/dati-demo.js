// Crea i dati di esempio dell'app (public/js/demo-dati.js) dai campioni anonimi dei test.
// Uso: node strumenti/dati-demo.js
import { readFileSync, writeFileSync } from 'node:fs';
import { leggiRisultati, leggiElenco, raggruppa } from '../src/live.js';
import { costruisciSede, documentoGara, iniziali } from '../src/gare.js';
import { chiaveAtleta } from '../src/tempi.js';

const campione = (n) => readFileSync(new URL(`../test/campioni/${n}`, import.meta.url), 'utf8');
const NOMI_M = ['Luca', 'Marco', 'Andrea', 'Pietro', 'Tommaso', 'Giulio', 'Davide', 'Simone', 'Matteo', 'Riccardo', 'Lorenzo', 'Edoardo'];
const NOMI_F = ['Giulia', 'Sara', 'Chiara', 'Marta', 'Alice', 'Elena', 'Sofia', 'Martina', 'Aurora', 'Ginevra', 'Beatrice', 'Viola'];
const COGNOMI = ['Ferri', 'Galli', 'Sala', 'Conti', 'Neri', 'Moretti', 'Greco', 'Costa', 'Fontana', 'Marini', 'Rinaldi', 'Caruso', 'Ferrara', 'Lombardi', 'Barbieri', 'Testa', 'Serra', 'Pellegrini', 'Leone', 'Gentile'];
const SOCIETA = ['Aurora Nuoto', 'Delfini Tiburtina', 'Nuoto Prenestino', 'Polisportiva Aniene Blu', 'Tritone Roma', 'Acquarium Ostia'];

let n = 0;
function rinomina(righe) {
  for (const r of righe) {
    const i = n++;
    const nome = (r.sesso === 'F' ? NOMI_F : NOMI_M)[i % 12];
    const cognome = COGNOMI[(i * 7) % COGNOMI.length];
    r.atleta.nome = `${nome} ${cognome}`;
    r.atleta.chiave = chiaveAtleta(cognome, nome, r.atleta.anno);
    r.societa = SOCIETA[(i * 5) % SOCIETA.length];
  }
  return righe;
}

const elenco = raggruppa(leggiElenco(campione('elenco.html')));
const gareDemo = [
  { info: elenco.find((g) => /Assoluto/.test(g.nome)), sede: '72a5f6a67cf2', piscina: 'Pietralata', file: 'gara-assoluti.json' },
  { info: elenco.find((g) => /Lanzi/.test(g.nome)), sede: '98cffe103913', piscina: 'Pietralata Conc.A', file: 'gara-esordienti.json' },
];
const uscita = { elenco: [], gare: {}, categorie: {}, atleti: {}, indici: {} };
const primati = new Map();
for (const { info, sede, piscina, file } of gareDemo) {
  const righe = rinomina(leggiRisultati(campione(file)));
  const { documenti, atleti } = costruisciSede({ gara: info, sede, piscina, righe, primati });
  const cat = {};
  for (const [id, doc] of documenti) {
    uscita.categorie[`${info.id}/${id}`] = doc;
    cat[doc.cat] = {
      nome: doc.nome, sx: doc.sx,
      gare: doc.eventi.map((e) => ({ c: e.c, n: e.n, conta: e.b.reduce((t, b) => t + b.r.length, 0) })),
    };
  }
  const doc = documentoGara(info, new Map([[sede, { piscina, cat }]]), new Date().toISOString());
  delete doc.aggiornato;
  uscita.gare[info.id] = doc;
  uscita.elenco.push({ id: info.id, nome: info.nome, luogo: info.luogo, dal: info.dal, al: info.al, vasca: info.vasca, conta: doc.conta, fonte: 'diretta', regione: 'Lazio' });
  for (const [k, a] of atleti) {
    const prima = uscita.atleti[k];
    uscita.atleti[k] = { n: a.n, y: a.y, s: a.s, sx: a.sx, r: [...(prima?.r ?? []), ...a.risultati] };
  }
}
// Un po' di storia per il primo atleta della prima gara, così il grafico ha qualcosa da mostrare.
const primo = Object.keys(uscita.atleti)[0];
const base = uscita.atleti[primo].r[0];
const storia = [['2026-02-14', 1.05], ['2026-04-11', 1.035], ['2026-06-20', 1.02], ['2026-10-03', 1.012]];
for (const [d, f] of storia) {
  uscita.atleti[primo].r.push({
    ...base, i: `storia|${d}`, g: base.g, d, t: Math.round(base.t * f / 10) * 10, b: undefined, pt: Math.round((base.pt ?? 500) / f ** 3),
  });
}
for (const [k, a] of Object.entries(uscita.atleti)) {
  for (const l of iniziali(a.n)) (uscita.indici[l] ??= []).push(`${k}|${a.n}|${a.y ?? ''}|${a.s}`);
}
const testo = `// File generato da controller/strumenti/dati-demo.js: dati di esempio con nomi inventati.\nexport const DEMO = ${JSON.stringify(uscita)};\n`;
writeFileSync(new URL('../../public/js/demo-dati.js', import.meta.url), testo);
console.log(`gare ${uscita.elenco.length}, categorie ${Object.keys(uscita.categorie).length}, atleti ${Object.keys(uscita.atleti).length}, ${Math.round(testo.length / 1024)} KB, primo ${primo}`);
