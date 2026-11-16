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
  const voci = {};
  const rtdb = { async aggiorna(v) { Object.assign(voci, v); return Object.keys(v).length; } };
  const esito = await leggiStagione({
    db, rtdb, chiedi, st: 2025, adesso: '2026-11-15T02:00:00Z', log: () => {},
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
  // Atleti, ricerca e squadre nel Realtime Database.
  assert.equal(voci['a/desempio-marco-2007/i'], "Marco D'Esempio|2007|M");
  assert.ok(voci['a/desempio-marco-2007/s2025'].startsWith('Nuoto Esempio - Roma|12~100SL|25|45680|2026-04-01|Roma'));
  assert.ok(voci['c/desempio marco~desempio-marco-2007']);
  assert.ok(voci['c/marco d esempio~desempio-marco-2007']);
  const { squadraDaStagioni } = await import('../src/dati-italia.js');
  const squadra = squadraDaStagioni({ s2025: voci['sqs/nuoto-esempio-roma/s2025'] });
  assert.equal(squadra.m.length, 2);
  assert.equal(squadra.t['25|100SL|M'][0].split('|')[1], '45680');
  assert.equal(squadra.stagioni[2025].t['25|100SL|M'].length, 2);
  assert.ok(docs.get('meta/squadre').squadre['gruppo-sportivo-prova'].startsWith('Gruppo Sportivo Prova|1|1|2025|12'));
  assert.ok(![...docs.keys()].some((p) => p.startsWith('squadre/')));
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
  // Prima la richiesta più recente (è quella che qualcuno sta guardando).
  assert.equal(chiamate[0]['solr[id_comitato]'], '9');
  assert.equal(chiamate[1]['solr[id_comitato]'], '');
  assert.equal(chiamate[1]['solr[dalyob]'], '2014');
  const it = docs.get('classifiche/2026-25-100SL-M-it-EA');
  assert.equal(it.righe.length, 2);
  assert.ok(it.b);
  assert.ok(!docs.get('classifiche/2025-25-100SL-M-9-tutte').b);
  assert.ok(![...docs.keys()].some((p) => p.startsWith('richieste/')));
});

test('dati di tutta Italia: atleta, ricerca e squadra si rileggono uguali', async () => {
  const {
    rigaInfo, rigaStagione, leggiAtletaItalia, chiaviRicerca, testoRicerca, squadraDaStagioni,
  } = await import('../src/dati-italia.js');
  const a = {
    n: "Maria D'Angelo", y: 2008, sx: 'F', s: 'Nuoto | Esempio', reg: '9',
    risultati: [
      { c: '100SL', v: 25, t: 60_100, d: '2025-03-01', l: 'Firenze' },
      { c: '100SL', v: 25, t: 59_900, d: '2025-04-01', l: 'Prato' },
    ],
  };
  const doc = { i: rigaInfo(a), s2024: rigaStagione(a), s2025: rigaStagione({ ...a, s: 'Altra', risultati: [{ c: '50DO', v: 50, t: 31_000, d: '2026-06-01', l: '' }] }) };
  const letto = leggiAtletaItalia(doc);
  assert.equal(letto.n, "Maria D'Angelo");
  assert.equal(letto.s, 'Altra');
  assert.equal(letto.r.length, 2);
  assert.deepEqual(letto.r.find((x) => x.c === '100SL'), {
    i: 'i2024-100SL-25', c: '100SL', v: 25, t: 59_900, d: '2025-04-01', gn: 'Prato', l: 'Prato', f: 1,
  });
  const chiavi = chiaviRicerca("Maria D'Angelo");
  for (const scritto of ['dangelo', "d'angelo maria", 'angelo maria', 'maria d angelo', 'maria dangelo']) {
    assert.ok(chiavi.some((c) => c.startsWith(testoRicerca(scritto))), scritto);
  }
  const sq = squadraDaStagioni({
    s2024: { n: 'Vecchio nome', reg: '9', m: 'a|A|2008|F~b|B|2009|F', t: { '25|100SL|F': 'a|60000|2025-01-01~b|61000|2025-01-02' } },
    s2025: { n: 'Nome', reg: '9', m: 'a|A|2008|F', t: { '25|100SL|F': 'a|59000|2026-01-01' } },
  });
  assert.equal(sq.n, 'Nome');
  assert.deepEqual(sq.st, ['2025', '2024']);
  assert.deepEqual(sq.m.sort(), ['a|A|2008|F|2024|2025', 'b|B|2009|F|2024|2024']);
  assert.deepEqual(sq.t['25|100SL|F'], ['a|59000|2026-01-01|2025', 'b|61000|2025-01-02|2024']);
});

test('una stagione di tutta Italia: nazionale, regioni solo se serve, regione dalla società', async () => {
  const { scaricaItalia, vociStagione } = await import('../src/italia.js');
  const chiamate = [];
  // 100 SL maschi in vasca corta: la nazionale arriva al limite, si legge per regione (solo la Toscana ha righe).
  const vuota = JSON.stringify({ content: '' });
  const chiedi = async (campi) => {
    chiamate.push(campi['solr[id_comitato]']);
    const giusta = campi['solr[codice_gara]'] === '01' && campi['solr[sesso]'] === 'M' && campi['solr[id_lunghezza_vasca]'] === '1';
    if (giusta && campi['solr[id_comitato]'] === '') return { troppe: true };
    if (giusta && campi['solr[id_comitato]'] === '9') return campione;
    return vuota;
  };
  const finto = async (campi) => {
    const r = await chiedi(campi);
    if (r?.troppe) {
      // 5000 righe finte: la nazionale è "piena".
      const riga = '<div class="row"><div class="tempo"> 59.00</div><span data-view="gratleta">ALTRO ATLETA</span><div class="nascita"><span>2000</span></div></div>';
      return JSON.stringify({ content: riga.repeat(5000) });
    }
    return r;
  };
  const { atleti, richieste } = await scaricaItalia({ chiedi: finto, st: 2015, log: () => {} });
  assert.equal(richieste, 72 + 20);
  assert.equal(chiamate.filter((x) => x === '').length, 72);
  assert.equal(atleti.get('desempio-marco-2007').reg, '9');
  // Chi ha la regione solo dalla società.
  atleti.set('x-y-2001', { n: 'Y X', y: 2001, sx: 'M', societa: new Set(['Nuoto Esempio - Roma']), reg: null, risultati: [] });
  const { completaRegioni } = await import('../src/italia.js');
  completaRegioni(atleti);
  assert.equal(atleti.get('x-y-2001').reg, '9');
  const voci = vociStagione(atleti, 2015, { indice: new Set(['desempio-marco-2007']) });
  assert.ok(voci['a/desempio-marco-2007/s2015']);
  assert.ok(!Object.keys(voci).some((p) => p.startsWith('c/') && p.endsWith('~desempio-marco-2007')));
  assert.ok(Object.keys(voci).some((p) => p.startsWith('c/') && p.endsWith('~x-y-2001')));
  assert.ok(voci['sqs/nuoto-esempio-roma/s2015'].m.includes('x-y-2001|Y X|2001|M'));
});

test('stagioni di tutta Italia: la corrente, la scorsa, poi indietro fino alla prima vuota', async () => {
  const { scegliItalia, VERSIONE_ITALIA } = await import('../src/graduatorie.js');
  const adesso = '2026-11-15T02:00:00Z';
  const ieri = '2026-11-15T01:00:00Z';
  const v = (...st) => Object.fromEntries(st.map((x) => [x, VERSIONE_ITALIA]));
  assert.equal(scegliItalia({}, adesso), 2026);
  assert.equal(scegliItalia({ rtdb: { 2026: ieri }, rtdbV: v(2026) }, adesso), 2025);
  assert.equal(scegliItalia({ rtdb: { 2026: ieri, 2025: ieri }, rtdbV: v(2026, 2025) }, adesso), 2024);
  assert.equal(scegliItalia({ rtdb: { 2026: ieri, 2025: ieri }, rtdbV: v(2026, 2025), rtdbFine: 2024 }, adesso), null);
  assert.equal(scegliItalia({ rtdb: { 2026: '2026-11-01T01:00:00Z', 2025: ieri }, rtdbV: v(2026, 2025), rtdbFine: 2024 }, adesso), 2026);
  assert.equal(scegliItalia({}, adesso, new Set([2026, 2025])), 2024);
  // Lette con la versione vecchia: si rileggono.
  assert.equal(scegliItalia({ rtdb: { 2026: ieri, 2025: ieri } }, adesso), 2026);
});

test('regioni grandi divise per anno di nascita, e Indice annata', async () => {
  const { scaricaItalia, fasceAnni, annateStagione } = await import('../src/italia.js');
  const fasce = fasceAnni(2025);
  assert.deepEqual(fasce[0], { dal: 2020, al: 2020 });
  assert.deepEqual(fasce.at(-1), { dal: 1900, al: 2000 });
  const riga = (n, anno, t) => `<div class="row"><div class="tempo"> ${t}</div><span data-view="gratleta">${n}</span><div class="nascita"><span>${anno}</span></div><div class="societa"><span>Nuoto Prova</span></div></div>`;
  const piena = JSON.stringify({ content: riga('ALTRO ATLETA', 2000, '59.00').repeat(5000) });
  const anni = [];
  const chiedi = async (c) => {
    const giusta = c['solr[codice_gara]'] === '00' && c['solr[sesso]'] === 'M' && c['solr[id_lunghezza_vasca]'] === '1';
    if (!giusta) return JSON.stringify({ content: '' });
    if (c['solr[id_comitato]'] === '' || (c['solr[id_comitato]'] === '3' && !c['solr[dalyob]'])) return piena;
    if (c['solr[id_comitato]'] === '3') {
      anni.push(c['solr[dalyob]']);
      if (c['solr[dalyob]'] === '2014') return JSON.stringify({ content: riga('BIANCHI LUCA', 2014, '30.10') + riga('VERDI ANDREA', 2014, '31.20') + riga('NERI PAOLO', 2014, '32.30') });
    }
    return JSON.stringify({ content: '' });
  };
  const { atleti, richieste } = await scaricaItalia({ chiedi, st: 2025, log: () => {} });
  assert.equal(anni.length, fasce.length);
  assert.equal(richieste, 72 + 20 + fasce.length);
  assert.equal(atleti.get('bianchi-luca-2014').reg, '3');
  const annate = annateStagione(atleti);
  assert.equal(annate['25|50SL|M|2014'], '31200|3');
});

test('storico: specialità, tutte le gare per vasca, e giro delle richieste', async () => {
  const {
    leggiSpecialita, leggiGareSpecialita, giroStorico,
  } = await import('../src/storico.js');
  const personali = JSON.stringify({
    content: `<div class="scheda_atleta"><h4>Vasca da 25m</h4>
      <div class="row"><div class="specialita"><span class="collegamento" data-value="solr[codice_gara]" data-id="00" data-view="grspecialitaatleta">50 Stile Libero</span></div></div>
      <div class="row"><div class="specialita"><span class="collegamento" data-value="solr[codice_gara]" data-id="21" data-view="grspecialitaatleta">100 Dorso</span></div></div>
      <h4>Vasca da 50m</h4>
      <div class="row"><div class="specialita"><span class="collegamento" data-value="solr[codice_gara]" data-id="00" data-view="grspecialitaatleta">50 Stile Libero</span></div></div></div>`,
  });
  assert.deepEqual(leggiSpecialita(personali), ['00', '21']);
  const riga = (t, d, l, ev) => `<div class="row"><div class="tempo"><span>${t}</span></div><div class="data"><span>${d}</span></div>
    <div class="luogo"><span class="collegamento" data-value="solr[id_evento]" data-id="${ev}" data-view="grevento">${l}</span></div></div>`;
  const specialita = JSON.stringify({
    content: `<div class="personalbest"><h3>Personal Ranking</h3><div class="vasca"><h4>Vasca da 50m</h4><div>${riga('27.10', '12 Luglio 2025', 'Roma', '11')}</div></div>
      <div class="vasca"><h4>Vasca da 25m</h4><div>${riga('26.50', '05 Dicembre 2025', 'Ostia', '12')}${riga('01:02.30', '10 Gennaio 2015', 'Roma', '13')}</div></div></div>`,
  });
  assert.deepEqual(leggiGareSpecialita(specialita), [
    { v: 50, t: 27_100, d: '2025-07-12', l: 'Roma', ev: '11' },
    { v: 25, t: 26_500, d: '2025-12-05', l: 'Ostia', ev: '12' },
    { v: 25, t: 62_300, d: '2015-01-10', l: 'Roma', ev: '13' },
  ]);
  // Giro: una richiesta, atleta con l'id nella scheda Firestore.
  const docs = new Map([['richiesteStorico/rossi-anna-2010', { creato: 1 }], ['atleti/rossi-anna-2010', { fin: ['999'] }]]);
  const db = {
    async leggi(p) { return docs.get(p) ?? null; },
    async elenca(c) { return [...docs].filter(([p]) => p.startsWith(`${c}/`)).map(([p, d]) => ({ id: p.split('/')[1], ...d })); },
    async elimina(p) { docs.delete(p); },
  };
  const rt = new Map();
  const rtdb = {
    async leggi(p) { return rt.get(p) ?? null; },
    async scrivi(p, d) { rt.set(p, d); },
    async aggiorna(v) { for (const [p, d] of Object.entries(v)) rt.set(p, d); },
  };
  const chieste = [];
  const chiedi = async (campi) => {
    chieste.push(campi.view);
    return campi.view === 'gratleta' ? personali : specialita;
  };
  const esito = await giroStorico({
    db, rtdb, chiedi, adesso: '2026-11-15T20:00:00Z', soloRichieste: true, log: () => {},
  });
  assert.deepEqual(esito, { atleti: 1, gare: 6 });
  assert.deepEqual(chieste, ['gratleta', 'grspecialitaatleta', 'grspecialitaatleta']);
  const st = rt.get('st/rossi-anna-2010');
  assert.equal(st.f, '999');
  assert.equal(st.g['50SL'].split('~')[0], '25|26500|2025-12-05|Ostia|12');
  assert.equal(rt.get('a/rossi-anna-2010/f'), '999');
  assert.ok(!docs.has('richiesteStorico/rossi-anna-2010'));
});

test('squadre seguite: notifica con i personali e le staffette, senza chi si segue già', async () => {
  const { avvisaSquadre, trovaSquadra } = await import('../src/avvisi-squadre.js');
  const elenco = [['circolo-canottieri-aniene', 'Circolo Canottieri Aniene'], ['nuoto-esempio', 'Nuoto Esempio']];
  assert.equal(trovaSquadra('CC Aniene', [['cc-aniene-asd', 'CC Aniene Asd'], ...elenco]), 'cc-aniene-asd');
  assert.equal(trovaSquadra('Squadra Nuova', elenco), 'squadra-nuova');
  const docs = new Map([['meta/squadre', { squadre: { 'cc-aniene-asd': 'CC Aniene Asd|30|30|2026|12' } }]]);
  const utenti = [
    { id: 'u1', tokens: ['t1'], squadre: ['cc-aniene-asd'], seguiti: ['bianchi-luca-2010'] },
    { id: 'u2', tokens: ['t2'], squadre: ['cc-aniene-asd'], notSq: { 'cc-aniene-asd': ['staffette'] } },
    { id: 'u3', tokens: ['t3'], squadre: ['cc-aniene-asd'], notSq: { 'cc-aniene-asd': ['tempi'] } },
  ];
  const db = {
    async leggi(p) { return docs.get(p) ?? null; },
    async contieneUno() { return utenti; },
    async aggiorna() {},
  };
  const mandate = [];
  const invio = { async push(token, m) { mandate.push([token, m]); return 'ok'; } };
  const tempo = (k, n, b) => ({ k, n, b, s: 'CC Aniene', t: 61_000, gara: { breve: '100 SL' } });
  await avvisaSquadre({
    db,
    invio,
    nuoviTempi: [tempo('rossi-anna-2011', 'Anna Rossi', 'PB'), tempo('bianchi-luca-2010', 'Luca Bianchi', 'PB'), tempo('verdi-ugo-2009', 'Ugo Verdi', null)],
    staffette: [{ squadra: 'CC Aniene Asd', nome: '4x50 SL', t: 110_000 }],
    sito: 'S',
    log: () => {},
  });
  const per = Object.fromEntries(mandate.map(([t, m]) => [t, m]));
  assert.equal(per.t1.titolo, 'CC Aniene Asd');
  assert.ok(per.t1.corpo.startsWith('Anna Rossi: nuovo personale, 100 SL'));
  assert.ok(per.t1.corpo.includes('staffetta 4x50 SL'));
  assert.ok(!per.t1.corpo.includes('Bianchi'));
  assert.ok(per.t2.corpo.startsWith('staffetta'));
  assert.ok(per.t3.corpo.startsWith('3 tempi nuovi (2 personali)'));
  assert.equal(per.t3.url, 'S/#/squadra/cc-aniene-asd');
});

test('riassunto di una squadra: componenti, migliori di sempre e punti fatti con la squadra', async () => {
  const { riassuntoSquadra, leggiRiassuntoSquadra } = await import('../src/dati-italia.js');
  const { punti } = await import('../src/punti.js');
  const doc = {
    s2024: { n: 'Nuoto Prova', reg: '12', m: 'a|Anna Rossi|2010|F~b|Luca Neri|2009|M', t: { '25|100SL|F': 'a|62000|2025-01-10', '25|100SL|M': 'b|55000|2025-02-01' } },
    s2025: { n: 'Nuoto Prova', reg: '12', m: 'a|Anna Rossi|2010|F', t: { '25|100SL|F': 'a|60000|2026-01-10', '50|50SL|F': 'a|28000|2026-06-10' } },
  };
  const r = leggiRiassuntoSquadra(riassuntoSquadra(doc, punti));
  assert.deepEqual(r.st, ['2025', '2024']);
  assert.deepEqual(r.m.sort(), ['a|Anna Rossi|2010|F|2024|2025', 'b|Luca Neri|2009|M|2024|2024']);
  assert.deepEqual(r.t['25|100SL|F'], ['a|60000|2026-01-10|2025']);
  // Indice Cloro di sempre: il migliore di una stagione, con la stagione e le specialità.
  const { indiciStagione, indiceDaPunti } = await import('../src/dati-italia.js');
  const anna = r.ic.find((x) => x.k === 'a');
  const st2025 = indiciStagione({ '25|100SL|F': ['a|60000|2026-01-10'], '50|50SL|F': ['a|28000|2026-06-10'] }, punti)[0];
  assert.equal(anna.valore, st2025.valore);
  assert.equal(anna.st, '2025');
  assert.deepEqual(anna.gare.sort(), ['100SL', '50SL']);
  assert.equal(r.ic.find((x) => x.k === 'b').st, '2024');
  // Stessa formula dell'Indice Cloro delle classifiche.
  const { indiceCloro } = await import('../src/graduatorie.js');
  const prova = [{ c: '100SL', pt: 600 }, { c: '100SL', pt: 640 }, { c: '200SL', pt: 500 }, { c: '50DO', pt: 550 }];
  assert.deepEqual(indiceDaPunti(prova), indiceCloro(prova));
});
