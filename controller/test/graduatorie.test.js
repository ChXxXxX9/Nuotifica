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
  assert.equal(n.length, 2);
  assert.deepEqual(letti, ['https://esempio.it/c.pdf', 'https://esempio.it/a.pdf']);
  assert.deepEqual(docs.get(`testi/${idTesto('https://esempio.it/a.pdf')}`).p, ['pagina uno ROSSI', 'pagina due']);
  assert.equal((await aggiornaTesti({ db, adesso: '2026-11-15T00:05:00Z', estrai: async () => [] })).length, 0);
});

test('start list: si trova l\'atleta (anche con il cognome prima) e non l\'omonimo di un altro anno', async () => {
  const { trovaAtleta, formeNome } = await import('../src/testi.js');
  assert.ok(formeNome("Maria Chiara D'Angelo").includes('DANGELO MARIA CHIARA'));
  const pagine = ['100 SL Maschi\n 1  ROSSI MARCO      2008  NUOTO ESEMPIO  52.10\n 2  BIANCHI LUCA  2009'];
  assert.equal(trovaAtleta(pagine, { n: 'Marco Rossi', y: 2008 }), 'ROSSI MARCO');
  assert.equal(trovaAtleta(pagine, { n: 'Marco Rossi', y: 2011 }), null);
  assert.equal(trovaAtleta(['Batteria 3 corsia 4 BIANCHI LUCA'], { n: 'Luca Bianchi', y: 2009 }), 'BIANCHI LUCA');
  assert.equal(trovaAtleta(pagine, { n: 'Marco Ross', y: 2008 }), null);
});

test('classifiche: posizioni, movimenti della settimana e Indice Cloro', async () => {
  const { scriviClassifiche, indiceCloro } = await import('../src/graduatorie.js');
  assert.deepEqual(indiceCloro([{ c: '100SL', pt: 600 }, { c: '100SL', pt: 640 }, { c: '200SL', pt: 500 }]), { valore: 588, gare: ['100SL', '200SL'] });
  const docs = new Map();
  const db = {
    async leggiTanti(ps) { return new Map(ps.map((p) => [p, docs.get(p) ?? null])); },
    async scriviTanti(e) { for (const { percorso, dati } of e) docs.set(percorso, structuredClone(dati)); },
  };
  const atleta = (n, t) => ({ n, y: 2010, sx: 'M', societa: new Set(['S']), risultati: [{ c: '100SL', v: 25, t, d: '2026-11-01', pt: Math.round(1e8 / t) }] });
  let atleti = new Map([['a', atleta('A', 60_000)], ['b', atleta('B', 61_000)]]);
  await scriviClassifiche({ db, atleti, st: 2026, adesso: '2026-11-15T01:00:00Z' });
  let doc = docs.get('classifiche/2026-25-100SL-M');
  assert.deepEqual(doc.righe.map((r) => r.split('|')[0]), ['a', 'b']);
  assert.deepEqual(doc.b, { a: 1, b: 2 });
  // Una settimana dopo: b supera a, arriva c.
  atleti = new Map([['a', atleta('A', 60_000)], ['b', atleta('B', 59_000)], ['c', atleta('C', 58_000)]]);
  await scriviClassifiche({ db, atleti, st: 2026, adesso: '2026-11-23T01:00:00Z' });
  doc = docs.get('classifiche/2026-25-100SL-M');
  assert.deepEqual(doc.righe.map((r) => r.split('|')[0]), ['c', 'b', 'a']);
  assert.deepEqual(doc.b, { a: 1, b: 2 });
  assert.deepEqual(doc.p, { a: 1, b: 2, c: 1 });
  assert.ok(docs.get('classifiche/2026-indice-M').righe[0].startsWith('c|'));
});

test('lavori dell\'admin: rileggere una gara e una stagione', async () => {
  const { eseguiLavori } = await import('../src/admin.js');
  const docs = new Map([
    ['meta/live', { gare: { g1: { sedi: ['s1', 's2'] } }, sedi: { s1: { firma: 'x' }, s2: { firma: 'y' } } }],
  ]);
  const lavori = [{ id: 'a', tipo: 'gara', gara: 'g1' }, { id: 'b', tipo: 'stagione', stagione: '2023' }];
  const db = {
    async dove() { return lavori; },
    async leggi(p) { return docs.get(p) ?? null; },
    async scrivi(p, d) { docs.set(p, d); },
    async aggiorna(p, d) { docs.set(p, { ...(docs.get(p) ?? {}), ...d }); },
  };
  const avviate = [];
  await eseguiLavori({
    db, invio: null, sito: 'S', log: () => {}, avviaWorkflow: async (st) => avviate.push(st),
  });
  assert.equal(docs.get('meta/live').sedi.s1.firma, null);
  assert.deepEqual(avviate, ['2023']);
  assert.equal(docs.get('lavori/a').stato, 'fatto');
  assert.equal(docs.get('lavori/b').esito, 'graduatorie avviate');
});

test('classifiche su richiesta: Italia per categoria e regione intera', async () => {
  const { eseguiRichieste, anniCategoria, richiestaValida } = await import('../src/classifiche.js');
  assert.deepEqual(anniCategoria('EA', 'M', 2026), { dal: 2014, al: 2015 });
  assert.ok(!richiestaValida({ st: '2026', v: 25, c: '100SL', sx: 'M', reg: '9', cat: 'EA' }));
  const docs = new Map([
    ['richieste/a', { st: '2026', v: 25, c: '100SL', sx: 'M', reg: 'it', cat: 'EA', creato: '1' }],
    ['richieste/b', { st: '2025', v: 25, c: '100SL', sx: 'M', reg: '9', cat: 'tutte', creato: '2' }],
  ]);
  const db = {
    async elenca(c) { return [...docs].filter(([p]) => p.startsWith(`${c}/`)).map(([p, d]) => ({ id: p.split('/')[1], ...d })); },
    async leggi(p) { return docs.get(p) ?? null; },
    async scrivi(p, d) { docs.set(p, d); },
    async elimina(p) { docs.delete(p); },
  };
  const chiamate = [];
  const scarica = async (url, opz) => { chiamate.push(opz.modulo); return campione; };
  const n = await eseguiRichieste({
    db, fonti: { naz: 'N?x=1' }, scarica, adesso: '2026-11-15T12:00:00Z', log: () => {},
  });
  assert.equal(n, 2);
  assert.equal(chiamate[0]['solr[id_comitato]'], '');
  assert.equal(chiamate[0]['solr[dalyob]'], '2014');
  assert.equal(chiamate[1]['solr[id_comitato]'], '9');
  const it = docs.get('classifiche/2026-25-100SL-M-it-EA');
  assert.equal(it.righe.length, 2);
  assert.ok(it.b);
  assert.ok(!docs.get('classifiche/2025-25-100SL-M-9-tutte').b);
  assert.ok(![...docs.keys()].some((p) => p.startsWith('richieste/')));
});
