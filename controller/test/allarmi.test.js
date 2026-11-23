import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decidiSentinella, giroSentinella, avvisiConsumi, durata, oraRoma,
} from '../src/allarmi.js';

function dbFinto(iniziali = {}) {
  const docs = new Map(Object.entries(iniziali));
  const copia = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
  return {
    docs,
    async leggi(p) { return docs.has(p) ? copia(docs.get(p)) : null; },
    async leggiTanti(ps) { return new Map(ps.map((p) => [p, docs.has(p) ? copia(docs.get(p)) : null])); },
    async scrivi(p, d) { docs.set(p, copia(d)); },
  };
}

function invioFinto() {
  const inviati = [];
  return { inviati, async push(token, messaggio) { inviati.push({ token, ...messaggio }); return 'ok'; } };
}

const adesso = '2026-11-23T18:00:00.000Z'; // 19:00 in Italia

test('durata e ora italiana', () => {
  assert.equal(durata(60_000), '1 minuto');
  assert.equal(durata(45 * 60_000), '45 minuti');
  assert.equal(durata(3 * 3_600_000), '3 ore');
  assert.equal(durata(3 * 86_400_000), '3 giorni');
  assert.equal(oraRoma('2026-11-23T17:05:00Z', adesso), '18:05');
  assert.equal(oraRoma('2026-11-22T17:05:00Z', adesso), '22/11 alle 18:05');
});

test('sentinella: controllore che gira, nessun avviso', () => {
  const d = decidiSentinella({ ultimo: '2026-11-23T17:52:00Z', adesso });
  assert.equal(d.azione, null);
  assert.equal(d.stato, null);
});

test('sentinella: fermo da più di 30 minuti, poi promemoria ogni 6 ore, poi ripartito', () => {
  const fermo = decidiSentinella({ ultimo: '2026-11-23T17:20:00Z', adesso, sito: 'https://x' });
  assert.equal(fermo.azione, 'fermo');
  assert.equal(fermo.messaggio.titolo, 'Il controllore è fermo');
  assert.match(fermo.messaggio.corpo, /18:20 \(40 minuti fa\)/);
  assert.equal(fermo.messaggio.url, 'https://x/#/admin');
  assert.deepEqual(fermo.stato, { fermo: true, dal: '2026-11-23T17:20:00Z', avvisato: adesso });

  // Mezz'ora dopo, ancora fermo: niente di nuovo.
  const dopo = decidiSentinella({ ultimo: '2026-11-23T17:20:00Z', adesso: '2026-11-23T18:30:00Z', sentinella: fermo.stato });
  assert.equal(dopo.azione, null);

  // Dopo 6 ore: promemoria.
  const promemoria = decidiSentinella({ ultimo: '2026-11-23T17:20:00Z', adesso: '2026-11-24T00:00:00Z', sentinella: fermo.stato });
  assert.equal(promemoria.azione, 'ancora');
  assert.equal(promemoria.stato.dal, '2026-11-23T17:20:00Z');

  // Riparte.
  const ripartito = decidiSentinella({ ultimo: '2026-11-24T00:05:00Z', adesso: '2026-11-24T00:10:00Z', sentinella: promemoria.stato });
  assert.equal(ripartito.azione, 'ripartito');
  assert.match(ripartito.messaggio.corpo, /fermo dalle 23\/11 alle 18:20 \(7 ore\)/);
  assert.equal(ripartito.stato.fermo, false);

  // E dopo, di nuovo tutto a posto.
  assert.equal(decidiSentinella({ ultimo: '2026-11-24T00:35:00Z', adesso: '2026-11-24T00:40:00Z', sentinella: ripartito.stato }).azione, null);
});

test('sentinella: nessun giro registrato vale come fermo', () => {
  const d = decidiSentinella({ ultimo: null, adesso });
  assert.equal(d.azione, 'fermo');
  assert.match(d.messaggio.corpo, /Non c'è traccia/);
});

test('giro della sentinella: notifica all\'admin e scrittura solo quando cambia qualcosa', async () => {
  const db = dbFinto({
    'meta/stato': { ultimoControllo: '2026-11-23T17:00:00.000Z' },
    'meta/admin': { uid: 'adm' },
    'users/adm': { tokens: ['tok-admin'] },
  });
  const invio = invioFinto();
  const primo = await giroSentinella({
    db, invio, sito: 'https://x', adesso, log: () => {},
  });
  assert.equal(primo.azione, 'fermo');
  assert.equal(primo.inviate, 1);
  assert.equal(invio.inviati[0].token, 'tok-admin');
  assert.equal(db.docs.get('meta/sentinella').fermo, true);

  const secondo = await giroSentinella({
    db, invio, sito: 'https://x', adesso: '2026-11-23T18:30:00.000Z', log: () => {},
  });
  assert.equal(secondo.azione, null);
  assert.equal(invio.inviati.length, 1);
});

test('giro della sentinella: admin senza notifiche attive → 0 inviate', async () => {
  const db = dbFinto({ 'meta/stato': { ultimoControllo: '2026-11-23T10:00:00.000Z' }, 'meta/admin': { uid: 'adm' } });
  const esito = await giroSentinella({
    db, invio: invioFinto(), sito: '', adesso, log: () => {},
  });
  assert.equal(esito.azione, 'fermo');
  assert.equal(esito.inviate, 0);
});

test('consumi: sotto le soglie nessun avviso', () => {
  const c = avvisiConsumi({ scritte: 11_000, tetto: 15_000, rtdb: 2.5e9 });
  assert.deepEqual(c.messaggi, []);
  assert.deepEqual(c.giorno, []);
  assert.deepEqual(c.mese, []);
});

test('consumi: 80% delle scritture una volta sola, poi il tetto', () => {
  const primo = avvisiConsumi({ scritte: 12_345, tetto: 15_000, sito: 'https://x' });
  assert.equal(primo.messaggi.length, 1);
  assert.equal(primo.messaggi[0].titolo, 'Scritture quasi finite');
  assert.match(primo.messaggi[0].corpo, /12\.345 scritture su 15\.000/);
  assert.deepEqual(primo.giorno, ['scritture-80']);

  const ancora = avvisiConsumi({ scritte: 13_000, tetto: 15_000, avvisati: { giorno: primo.giorno } });
  assert.deepEqual(ancora.messaggi, []);

  const tetto = avvisiConsumi({ scritte: 15_002, tetto: 15_000, avvisati: { giorno: primo.giorno } });
  assert.equal(tetto.messaggi.length, 1);
  assert.equal(tetto.messaggi[0].titolo, 'Tetto delle scritture raggiunto');
  assert.deepEqual(tetto.giorno, ['scritture-80', 'scritture-tetto']);
});

test('consumi: salto diretto al tetto → un solo avviso, quello più alto', () => {
  const c = avvisiConsumi({ scritte: 16_000, tetto: 15_000 });
  assert.equal(c.messaggi.length, 1);
  assert.equal(c.messaggi[0].titolo, 'Tetto delle scritture raggiunto');
  assert.deepEqual(c.giorno, ['scritture-80', 'scritture-tetto']);
});

test('consumi: download del Realtime Database a 3, 6 e 8 GB nel mese', () => {
  const tre = avvisiConsumi({ rtdb: 3.2e9, tetto: 15_000 });
  assert.equal(tre.messaggi.length, 1);
  assert.match(tre.messaggi[0].corpo, /3,2 GB su 10 GB/);
  assert.deepEqual(tre.mese, ['rtdb-3']);
  assert.deepEqual(avvisiConsumi({ rtdb: 5e9, tetto: 15_000, avvisati: { mese: tre.mese } }).messaggi, []);
  const otto = avvisiConsumi({ rtdb: 8.1e9, tetto: 15_000, avvisati: { mese: tre.mese } });
  assert.equal(otto.messaggi.length, 1);
  assert.deepEqual(otto.mese, ['rtdb-3', 'rtdb-6', 'rtdb-8']);
});

test('consumi: scritture e download insieme → due avvisi', () => {
  const c = avvisiConsumi({ scritte: 12_500, tetto: 15_000, rtdb: 6.5e9 });
  assert.equal(c.messaggi.length, 2);
  assert.deepEqual(c.giorno, ['scritture-80']);
  assert.deepEqual(c.mese, ['rtdb-3', 'rtdb-6']);
});
