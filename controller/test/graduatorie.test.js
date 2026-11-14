import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  leggiGraduatoria, dividiNome, dataIso, scegliStagione, leggiStagione,
} from '../src/graduatorie.js';

const campione = readFileSync(new URL('./campioni/graduatoria.json', import.meta.url), 'utf8');

test('graduatoria: righe con tempo, atleta, società, data e luogo', () => {
  const righe = leggiGraduatoria(campione);
  assert.equal(righe.length, 3);
  const [a, b, c] = righe;
  assert.equal(a.ms, 45_680);
  assert.equal(a.nome, "D'ESEMPIO MARCO");
  assert.equal(a.anno, 2007);
  assert.deepEqual(a.societa, ['Nuoto Esempio - Roma']);
  assert.equal(a.data, '2026-04-01');
  assert.equal(a.luogo, 'Roma');
  assert.equal(a.idEvento, '900001');
  assert.deepEqual(b.societa, ['Gruppo Sportivo Prova', 'Nuoto Esempio - Roma']);
  assert.equal(c.ms, 62_400);
  assert.equal(c.turno, 'Serie - Passaggio gara');
});

test('nomi: il cognome viene prima, anche con le particelle', () => {
  assert.deepEqual(dividiNome('ROSSI ANDREA'), { cognome: 'Rossi', nome: 'Andrea' });
  assert.deepEqual(dividiNome('DE PROVA LUCA MARIA'), { cognome: 'De Prova', nome: 'Luca Maria' });
  assert.deepEqual(dividiNome("D'ESEMPIO MARCO"), { cognome: "D'Esempio", nome: 'Marco' });
  assert.equal(dataIso('5 Dicembre 2025'), '2025-12-05');
});

test('stagione da leggere: prima la corrente, poi indietro', () => {
  const adesso = '2026-11-15T02:00:00Z';
  assert.equal(scegliStagione({}, adesso), 2026);
  assert.equal(scegliStagione({ fatte: { 2026: '2026-11-15T01:00:00Z' } }, adesso), 2025);
  const tutte = Object.fromEntries([2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((s) => [s, '2026-11-15T01:00:00Z']));
  assert.equal(scegliStagione({ fatte: tutte }, adesso), null);
});

test('una stagione: schede, primati e squadre (solo tempi individuali)', async () => {
  const docs = new Map();
  const db = {
    conta: { letture: 0, scritture: 0 },
    async leggi(p) { return docs.get(p) ?? null; },
    async scrivi(p, d) { docs.set(p, structuredClone(d)); },
    async scriviTanti(e) { for (const { percorso, dati } of e) docs.set(percorso, structuredClone(dati)); },
    async leggiTanti(ps) { return new Map(ps.map((p) => [p, docs.get(p) ?? null])); },
    async elenca(c) { return [...docs].filter(([p]) => p.startsWith(`${c}/`)).map(([p, d]) => ({ id: p.split('/')[1], ...d })); },
    async commit(ops) {
      for (const o of ops) {
        const d = { ...(docs.get(o.percorso) ?? {}), ...structuredClone(o.dati ?? {}) };
        for (const [c, v] of Object.entries(o.aggiungi ?? {})) d[c] = [...new Set([...(d[c] ?? []), ...v.map((x) => JSON.stringify(x))])].map((x) => JSON.parse(x));
        docs.set(o.percorso, d);
      }
    },
  };
  // Solo la prima richiesta (100 SL maschi in vasca corta) restituisce righe.
  let n = 0;
  const chiedi = async (campi) => {
    n++;
    return campi['solr[codice_gara]'] === '01' && campi['solr[sesso]'] === 'M' && campi['solr[id_lunghezza_vasca]'] === '1'
      ? campione : JSON.stringify({ content: '' });
  };
  const esito = await leggiStagione({
    db, chiedi, st: 2025, adesso: '2026-11-15T02:00:00Z', log: () => {},
  });
  assert.equal(n, 72);
  assert.equal(esito.atleti, 2);
  const marco = docs.get('atleti/desempio-marco-2007');
  assert.equal(marco.n, "Marco D'Esempio");
  assert.equal(marco.r[0].t, 45_680);
  assert.equal(marco.r[0].v, 25);
  assert.equal(marco.r[0].g, 'n900001');
  assert.ok(docs.get('ricerca/ma').l.some((v) => v.startsWith('desempio-marco-2007|')));
  assert.equal(docs.get('primati/25-100SL-M').atleti['desempio-marco-2007'].split('|')[0], '45680');
  const squadra = docs.get('squadre/nuoto-esempio-roma');
  assert.equal(squadra.m.length, 2);
  assert.equal(squadra.t['25|100SL|M'][0].split('|')[1], '45680');
  assert.equal(docs.get('squadre/nuoto-esempio-roma/stagioni/2025').t['25|100SL|M'].length, 2);
  assert.ok(docs.get('meta/squadre').squadre['gruppo-sportivo-prova'].startsWith('Gruppo Sportivo Prova|1|1|2025'));
});

test('testi dei PDF: solo i nuovi, dai più recenti', async () => {
  const { aggiornaTesti, idTesto } = await import('../src/testi.js');
  const docs = new Map([['meta/avvisi', { posts: [
    { file: [{ url: 'https://esempio.it/a.pdf', aggiuntoIl: '2026-11-10' }, { url: 'https://esempio.it/b.xlsx' }] },
    { file: [{ url: 'https://esempio.it/c.pdf', aggiuntoIl: '2026-11-12' }] },
  ] }]]);
  const db = {
    async leggi(p) { return docs.get(p) ?? null; },
    async scrivi(p, d) { docs.set(p, d); },
  };
  const letti = [];
  const n = await aggiornaTesti({
    db, adesso: '2026-11-15T00:00:00Z', log: () => {}, estrai: async (u) => { letti.push(u); return ['pagina uno ROSSI', 'pagina due']; },
  });
  assert.equal(n, 2);
  assert.deepEqual(letti, ['https://esempio.it/c.pdf', 'https://esempio.it/a.pdf']);
  assert.deepEqual(docs.get(`testi/${idTesto('https://esempio.it/a.pdf')}`).p, ['pagina uno ROSSI', 'pagina due']);
  assert.equal(await aggiornaTesti({ db, adesso: '2026-11-15T00:05:00Z', estrai: async () => [] }), 0);
});
