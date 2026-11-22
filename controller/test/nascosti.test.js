import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  NASCOSTI, IN_ATTESA, SOLO_RISULTATI, caricaPrivato, pulisciNascosti, impronta, rigaNascosta, NOME_NASCOSTO,
} from '../src/nascosti.js';
import { costruisciSede } from '../src/gare.js';
import { leggiGara } from '../src/tempi.js';
import { aggiungiRiga } from '../src/italia.js';
import { scrittureRicerca } from '../src/ricerca.js';
import { sotto14 } from '../src/testi.js';

// Firestore finto (solo quello che serve).
function dbFinto(iniziali = {}) {
  const docs = new Map(Object.entries(iniziali));
  const copia = (x) => JSON.parse(JSON.stringify(x));
  return {
    docs,
    conta: { letture: 0, scritture: 0 },
    async leggi(p) { return docs.has(p) ? copia(docs.get(p)) : null; },
    async leggiTanti(ps) { return new Map(ps.map((p) => [p, docs.has(p) ? copia(docs.get(p)) : null])); },
    async scrivi(p, d) { docs.set(p, copia(d)); },
    async elimina(p) { docs.delete(p); },
    async elenca(c) {
      const pezzi = c.split('/').length;
      return [...docs].filter(([p]) => p.startsWith(`${c}/`) && p.split('/').length === pezzi + 1)
        .map(([p, d]) => ({ id: p.split('/').pop(), ...copia(d) }));
    },
  };
}

// Realtime Database finto: un albero in memoria.
function rtdbFinto(albero = {}) {
  const pezzi = (p) => p.split('/').filter(Boolean);
  const prendi = (p) => pezzi(p).reduce((x, k) => (x == null ? undefined : x[k]), albero);
  const metti = (p, v) => {
    const ks = pezzi(p);
    let x = albero;
    for (const k of ks.slice(0, -1)) x = (x[k] ??= {});
    if (v === null) delete x[ks[ks.length - 1]];
    else x[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v));
  };
  return {
    albero,
    async leggi(p) { const v = prendi(p); return v === undefined ? null : JSON.parse(JSON.stringify(v)); },
    async scrivi(p, v) { metti(p, v); },
    async aggiorna(voci) { for (const [p, v] of Object.entries(voci)) metti(p, v); },
    async chiavi(p) { return new Set(Object.keys(prendi(p) ?? {})); },
  };
}

test('impronte: stesso SHA-256 dell\'app, prime 16 cifre', () => {
  assert.equal(impronta('pulcini-ettore-2009'), createHash('sha256').update('pulcini-ettore-2009').digest('hex').slice(0, 16));
  assert.deepEqual(rigaNascosta({
    n: 'Luca Ferri', s: 'Aurora', y: 2012, k: 'ferri-luca-2012', t: 62_000, p: 1, c: 4,
  }), {
    n: NOME_NASCOSTO, t: 62_000, p: 1, c: 4,
  });
});

test('nascosti: niente caricamenti, niente ricerca, nelle gare "Atleta nascosto"', async () => {
  const db = dbFinto({
    'privato/nascosti': { atleti: { 'ferri-luca-2012': { n: 'Luca Ferri', il: '2026-11-19' } } },
    'privato/inAttesa': { atleti: { 'rossi-anna-2011': { n: 'Anna Rossi' } } },
    'privato/soloRisultati': { atleti: { 'neri-ugo-2010': { n: 'Ugo Neri' } } },
  });
  assert.deepEqual(await caricaPrivato(db), { nascosti: 1, inAttesa: 1, soloRisultati: 1 });
  // Graduatorie: il nascosto non entra.
  const atleti = new Map();
  aggiungiRiga(atleti, {
    ms: 62_000, nome: 'FERRI LUCA', anno: 2012, societa: ['Aurora'], data: '2026-11-01', luogo: 'Roma', turno: 'Serie - Individuale',
  }, {
    sesso: 'M', vasca: 25, codice: '100SL', st: 2026,
  });
  assert.equal(atleti.size, 0);
  // Ricerca: né il nascosto né quello in attesa.
  const voci = scrittureRicerca(new Map([
    ['ferri-luca-2012', { n: 'Luca Ferri' }], ['rossi-anna-2011', { n: 'Anna Rossi' }], ['bianchi-ada-2011', { n: 'Ada Bianchi' }],
  ]));
  const tutte = voci.flatMap((v) => v.aggiungi.l);
  assert.ok(tutte.every((v) => v.startsWith('bianchi-ada-2011|')));
  // Gara in diretta: tempo e posizione restano, il resto no; niente scheda, niente notifiche, niente primati.
  const gara = { id: 'g1', nome: 'Prova', luogo: 'Roma', dal: '2026-11-07', vasca: 25 };
  const primati = new Map([['primati/25-100SL-M', {}]]);
  const sede = costruisciSede({
    gara,
    sede: 'abcdef1234',
    piscina: 'P',
    primati,
    righe: [{
      id: 'r1', categoria: 'RAGAZZI MASCHI', sesso: 'M', gara: leggiGara('100 m Stile Libero'), turno: '001', batteria: 1, corsia: 4, posizione: 1,
      ms: 62_450, stato: null, data: '2026-11-07', atleta: { chiave: 'ferri-luca-2012', nome: 'Luca Ferri', anno: 2012 }, societa: 'Aurora', parziali: [],
    }],
  });
  const riga = [...sede.documenti.values()][0].eventi[0].b[0].r[0];
  assert.deepEqual([riga.n, riga.k, riga.y, riga.s, riga.t, riga.p], [NOME_NASCOSTO, undefined, undefined, undefined, 62_450, 1]);
  assert.equal(sede.atleti.size, 0);
  assert.equal(sede.nuove.length, 0);
  assert.deepEqual(primati.get('primati/25-100SL-M'), {});
  assert.equal(SOLO_RISULTATI.has('neri-ugo-2010'), true);
});

test('nascosti: i dati già salvati si cancellano ovunque, una volta sola', async () => {
  const k = 'ferri-luca-2012';
  const db = dbFinto({
    'privato/nascosti': { atleti: { [k]: { n: 'Luca Ferri' } } },
    'meta/squadre': { squadre: { aurora: 'Aurora|10|10|2026|12', altra: 'Altra|5|5|2026|12' } },
    [`atleti/${k}`]: { n: 'Luca Ferri', r: [{ g: 'g1', t: 1 }] },
    [`richiesteStorico/${k}`]: { creato: 'x' },
    'ricerca/lu': { l: [`${k}|Luca Ferri|2012|Aurora`, 'luzi-ada-2011|Ada Luzi|2011|Aurora'] },
    'ricerca/fe': { l: [`${k}|Luca Ferri|2012|Aurora`] },
    'noti/f': { k: [k, 'fabi-eva-2010'] },
    'primati/25-100SL-M': { atleti: { [k]: '1|1|2026', altro: '2|2|2026' } },
    'classifiche/2026-25-100SL-M': { righe: [`${k}|Luca Ferri|2012|Aurora|62000|`, 'altro|Altro|2012|Aurora|63000|'], b: { [k]: 1, altro: 2 } },
    'squadre/aurora': { m: [`${k}|Luca Ferri|2012|M|2025|2026`, 'altro|Altro|2012|M|2026|2026'], t: { '25|100SL|M': [`${k}|62000|2026-11-01|2026`] } },
    'squadre/aurora/stagioni/2026': { t: { '25|100SL|M': [`${k}|62000|2026-11-01`, 'altro|63000|2026-11-01'] } },
    'gare/g1': { nome: 'Prova' },
    'gare/g1/categorie/c1': { eventi: [{ c: '100SL', b: [{ r: [{ k, n: 'Luca Ferri', y: 2012, s: 'Aurora', t: 62000, p: 1 }, { k: 'altro', n: 'Altro', t: 63000, p: 2 }] }] }] },
    'config/nascosti': { k: [k], n: { [k]: 'Luca Ferri' } },
  });
  const rtdb = rtdbFinto({
    a: { [k]: { i: 'Luca Ferri|2012|M', s2026: 'Aurora|12~100SL|25|62000|2026-11-01|Roma' }, altro: { i: 'Altro|2012|M' } },
    st: { [k]: { agg: 'x' } },
    c: { 'luca ferri~ferri-luca-2012': 'x', 'ferri luca~ferri-luca-2012': 'x', 'ada luzi~luzi-ada-2011': 'y' },
    sqs: {
      aurora: { s2026: { n: 'Aurora', m: `${k}|Luca Ferri|2012|M~altro|Altro|2012|M`, t: { '25|100SL|M': `${k}|62000|2026-11-01~altro|63000|2026-11-01` } } },
      altra: { s2026: { n: 'Altra', m: `${k}|Luca Ferri|2012|M`, t: { '25|100SL|M': `${k}|62000|2026-11-01` } } },
    },
    cl: {
      '2026-25-100SL-M-it-tutte': { righe: `${k}|Luca Ferri|2012|Aurora|62000|~altro|Altro|2012|Aurora|63000|`, b: { [k]: 1, altro: 2 } },
      '2026-25-100SL-F-it-tutte': { righe: 'x|X|2012|A|1|' },
    },
  });
  await caricaPrivato(db);
  const riassunti = [];
  const n = await pulisciNascosti({
    db, rtdb, log: () => {}, aggiornaRiassunti: async ({ ids }) => { riassunti.push(...ids); },
  });
  assert.equal(n, 1);
  // Realtime Database.
  assert.equal(rtdb.albero.a[k], undefined);
  assert.equal(rtdb.albero.st[k], undefined);
  assert.deepEqual(Object.keys(rtdb.albero.c), ['ada luzi~luzi-ada-2011']);
  assert.equal(rtdb.albero.sqs.aurora.s2026.m, 'altro|Altro|2012|M');
  assert.equal(rtdb.albero.sqs.aurora.s2026.t['25|100SL|M'], 'altro|63000|2026-11-01');
  assert.equal(rtdb.albero.sqs.altra.s2026.m, '');
  assert.deepEqual(riassunti.sort(), ['altra', 'aurora']);
  assert.equal(rtdb.albero.cl['2026-25-100SL-M-it-tutte'].righe, 'altro|Altro|2012|Aurora|63000|');
  assert.deepEqual(rtdb.albero.cl['2026-25-100SL-M-it-tutte'].b, { altro: 2 });
  // Firestore.
  const d = (p) => db.docs.get(p);
  assert.equal(d(`atleti/${k}`), undefined);
  assert.equal(d(`richiesteStorico/${k}`), undefined);
  assert.deepEqual(d('ricerca/lu').l, ['luzi-ada-2011|Ada Luzi|2011|Aurora']);
  assert.deepEqual(d('ricerca/fe').l, []);
  assert.deepEqual(d('noti/f').k, ['fabi-eva-2010']);
  assert.deepEqual(d('primati/25-100SL-M').atleti, { altro: '2|2|2026' });
  assert.deepEqual(d('classifiche/2026-25-100SL-M').righe, ['altro|Altro|2012|Aurora|63000|']);
  assert.deepEqual(d('classifiche/2026-25-100SL-M').b, { altro: 2 });
  assert.deepEqual(d('squadre/aurora').m, ['altro|Altro|2012|M|2026|2026']);
  assert.deepEqual(d('squadre/aurora').t['25|100SL|M'], []);
  assert.deepEqual(d('squadre/aurora/stagioni/2026').t['25|100SL|M'], ['altro|63000|2026-11-01']);
  const righe = d('gare/g1/categorie/c1').eventi[0].b[0].r;
  assert.deepEqual(righe[0], { n: NOME_NASCOSTO, t: 62000, p: 1 });
  assert.equal(righe[1].n, 'Altro');
  // Per l'app solo impronte, niente nomi né chiavi.
  assert.deepEqual(d('config/nascosti').h, [impronta(k)]);
  assert.equal(d('config/nascosti').n, undefined);
  assert.equal(d('config/nascosti').k, undefined);
  // Il giro dopo non rifà niente.
  assert.equal(await pulisciNascosti({ db, rtdb, log: () => {} }), 0);
  NASCOSTI.clear();
  IN_ATTESA.clear();
  SOLO_RISULTATI.clear();
});

test('sotto i 14 anni: anno di fine stagione meno anno di nascita', () => {
  // Stagione 2026/27: fine 2027. Nati nel 2013 → 14 anni (no); nel 2014 → 13 (sì).
  assert.equal(sotto14(2013, '2026-11-19'), false);
  assert.equal(sotto14(2014, '2026-11-19'), true);
  assert.equal(sotto14(null, '2026-11-19'), false);
});
