import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  leggiElencoGare, scegliFile, leggiFileRisultati,
} from '../src/cronometraggio.js';

const campione = (n) => readFileSync(new URL(`./campioni/${n}`, import.meta.url), 'utf8');

test('elenco: link alle gare con date e cartella dei dati', () => {
  const html = `<li><a href="https://esempio.it/NU_2026_11_12-14_Riccione.php" target="_blank">Nuoto. Open di prova - Risultati</a></li>
    <li><a href="https://esempio.it/NU_2026_12_30-01_02_Roma.php">Nuoto. Trofeo di fine anno</a></li>`;
  const [a, b] = leggiElencoGare(html);
  assert.equal(a.nome, 'Open di prova');
  assert.equal(a.dal, '2026-11-12');
  assert.equal(a.al, '2026-11-14');
  assert.equal(a.luogo, 'Riccione');
  assert.equal(a.dati, 'https://esempio.it/export/NU_2026_11_12-14_Riccione/NU/');
  assert.equal(b.dal, '2026-12-30');
  assert.equal(b.al, '2027-01-02');
});

test('contatori: riepilogo se c\'è, altrimenti classifica', () => {
  const file = scegliFile(JSON.stringify({ contatori: [
    { cod: 'CAT', c0: '', c1: '', c2: '001', nomefile: 'categorie.JSON' },
    { cod: 'SUM', c0: 'ASF', c1: '002', c2: '001', nomefile: 'NUASF002RIEP01 001.JSON' },
    { cod: 'CGR1', c0: 'ASF', c1: '002', c2: '001', nomefile: 'NUASF002CLAS01 001.JSON' },
    { cod: 'CGR1', c0: 'ASF', c1: '002', c2: '005', nomefile: 'NUASF002CLAS05 001.JSON' },
    { cod: 'STL1', c0: 'ASF', c1: '003', c2: '001', nomefile: 'NUASF003STAR01 001.JSON' },
  ] }));
  assert.deepEqual(file, ['NUASF002RIEP01 001.JSON', 'NUASF002CLAS05 001.JSON']);
});

test('riepilogo batterie: batteria, posizione, corsia e parziali', () => {
  const righe = leggiFileRisultati(campione('crono-batterie.json'));
  assert.equal(righe.length, 3);
  const [a, , c] = righe;
  assert.equal(a.gara.codice, '200SL');
  assert.equal(a.sesso, 'F');
  assert.equal(a.categoria, 'Assolute');
  assert.equal(a.batteria, 4);
  assert.equal(a.nomeBatteria, 'Batteria 4');
  assert.equal(a.posizione, 1);
  assert.equal(a.corsia, 4);
  assert.equal(a.ms, 118_870);
  assert.equal(a.data, '2026-11-13');
  assert.equal(a.atleta.nome, 'Anna Bianchi');
  assert.equal(a.atleta.chiave, 'bianchi-anna-2002');
  assert.equal(a.societa, 'Nuoto Esempio');
  assert.deepEqual(a.parziali, [{ m: 50, ms: 27_380, p: 1 }, { m: 100, ms: 57_500, p: 1 }, { m: 150, ms: 88_210, p: 2 }]);
  assert.equal(c.stato, 'Squalificato');
  assert.equal(c.ms, null);
});

test('finali: A e B con il loro nome', () => {
  const righe = leggiFileRisultati(campione('crono-finali.json'));
  const nomi = [...new Set(righe.map((r) => r.nomeBatteria))];
  assert.deepEqual(nomi.sort(), ['Finale A', 'Finale B']);
  const a = righe.find((r) => r.nomeBatteria === 'Finale A');
  assert.equal(a.finale, 1);
  assert.equal(a.sigla, 'FA');
  assert.equal(a.posizione, 1);
});
