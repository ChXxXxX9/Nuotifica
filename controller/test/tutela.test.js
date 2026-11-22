import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  avvisaRichieste, ripulisciRichieste, calcolaSegnali, eseguiSegnali, controllaInattivi, pulisciConsigliVecchi,
  pulisciTestiStagione, pulisciVecchieRaccolte, mesiTra, tutela, cancellaFotoChiuse,
} from '../src/tutela.js';
import { NASCOSTI, IN_ATTESA, pulisciNascosti } from '../src/nascosti.js';

// Firestore finto (solo quello che serve).
function dbFinto(iniziali = {}) {
  const docs = new Map(Object.entries(iniziali));
  const copia = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
  const elenca = async (c) => {
    const pezzi = c.split('/').length;
    return [...docs].filter(([p]) => p.startsWith(`${c}/`) && p.split('/').length === pezzi + 1)
      .map(([p, d]) => ({ id: p.split('/').pop(), ...copia(d) }));
  };
  return {
    docs,
    conta: { letture: 0, scritture: 0 },
    async leggi(p) { return docs.has(p) ? copia(docs.get(p)) : null; },
    async leggiTanti(ps) { return new Map(ps.map((p) => [p, docs.has(p) ? copia(docs.get(p)) : null])); },
    async scrivi(p, d) { docs.set(p, copia(d)); },
    async aggiorna(p, d) {
      if (!docs.has(p)) throw new Error(`manca ${p}`);
      docs.set(p, { ...docs.get(p), ...copia(d) });
    },
    async elimina(p) { docs.delete(p); },
    async eliminaTanti(ps) { for (const p of ps) docs.delete(p); },
    async nomi(c, quanti) { return (await elenca(c)).slice(0, quanti).map((d) => d.id); },
    elenca,
    async dove(c, campo, valore) { return (await elenca(c)).filter((d) => d[campo] === valore).slice(0, 50); },
  };
}

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

const invioFinto = () => {
  const mandate = [];
  return { mandate, async push(token, m) { mandate.push({ token, ...m }); return 'ok'; } };
};
const SITO = 'https://cloro.web.app';
const token = (t) => [t];

test('mesi tra due date', () => {
  assert.equal(mesiTra('2023-11-22', '2026-11-22'), 36);
  assert.equal(mesiTra('2023-11-23', '2026-11-22'), 35);
  assert.equal(mesiTra(Date.parse('2024-01-10'), '2026-11-22'), 34);
});

test('richieste privacy: l\'admin è avvisato una volta, senza nomi; dopo 30 giorni restano solo stato e date', async () => {
  const db = dbFinto({
    'meta/admin': { uid: 'adm' },
    'users/adm': { tokens: ['tok-admin'] },
    'richiestePrivacy/r1': {
      uid: 'u1', atleta: 'rossi-anna-2012', nome: 'Anna Rossi', tipo: 'togli', chi: 'genitore', prova: 'tessera 1', email: 'x@y.it', stato: 'nuova', avvisato: false, creato: '2026-11-01T10:00:00Z',
    },
  });
  const invio = invioFinto();
  assert.equal(await avvisaRichieste({
    db, invio, sito: SITO, log: () => {},
  }), 1);
  assert.equal(invio.mandate.length, 1);
  assert.doesNotMatch(JSON.stringify(invio.mandate), /Anna|rossi/i);
  assert.equal(db.docs.get('richiestePrivacy/r1').avvisato, true);
  assert.equal(await avvisaRichieste({
    db, invio, sito: SITO, log: () => {},
  }), 0);
  // Chiusa da 10 giorni: niente; da 31: dati della verifica cancellati.
  db.docs.set('richiestePrivacy/r1', { ...db.docs.get('richiestePrivacy/r1'), stato: 'tolta', chiusa: '2026-11-12T10:00:00Z' });
  assert.equal(await ripulisciRichieste({ db, adesso: '2026-11-22T10:00:00Z', log: () => {} }), 0);
  assert.equal(await ripulisciRichieste({ db, adesso: '2026-12-13T10:00:00Z', log: () => {} }), 1);
  const r = db.docs.get('richiestePrivacy/r1');
  assert.deepEqual(Object.keys(r).sort(), ['avvisato', 'chiusa', 'creato', 'ripulita', 'stato', 'tipo']);
  assert.equal(r.stato, 'tolta');
});

test('richiesta respinta: l\'atleta torna nella ricerca', async () => {
  const k = 'rossi-anna-2012';
  const db = dbFinto({
    'privato/nascosti': { atleti: {} },
    'privato/inAttesa': { atleti: {} },
    'meta/nascosti-puliti': { atleti: {}, ricerca: { [k]: '2026-11-20' } },
    [`atleti/${k}`]: { n: 'Anna Rossi', y: 2012, s: 'Aurora' },
    'ricerca/an': { l: [] },
  });
  const rtdb = rtdbFinto({ a: { [k]: { i: 'Anna Rossi|2012|F', s2025: 'Aurora|LAZ~100SL|25|70000|2025-12-01|Roma', s2026: 'Aurora Nuoto|LAZ~50SL|25|35000|2026-11-01|Roma' } } });
  NASCOSTI.clear();
  IN_ATTESA.clear();
  await pulisciNascosti({ db, rtdb, log: () => {} });
  assert.equal(rtdb.albero.c['anna rossi~rossi-anna-2012'], 'rossi-anna-2012|Anna Rossi|2012|Aurora Nuoto|LAZ');
  assert.ok(rtdb.albero.c['rossi anna~rossi-anna-2012']);
  assert.deepEqual(db.docs.get('ricerca/an').l, ['rossi-anna-2012|Anna Rossi|2012|Aurora']);
  assert.ok(db.docs.get('ricerca/ro').l.length);
  assert.deepEqual(db.docs.get('meta/nascosti-puliti').ricerca, {});
});

test('segnali: almeno 5 atleti sotto i 14 anni di almeno 3 società', async () => {
  const giovani = ['a-a-2014', 'b-b-2014', 'c-c-2015', 'd-d-2015', 'e-e-2016'];
  const a = {};
  const societa = ['Aurora', 'Aurora', 'Delfini', 'Tritone', 'Delfini'];
  giovani.forEach((k, i) => { a[k] = { i: `Atleta ${i}|${k.slice(-4)}|F`, s2026: `${societa[i]}|LAZ~50SL|25|40000|2026-11-01|Roma` }; });
  a['f-f-2008'] = { i: 'Grande|2008|M', s2026: 'Altra|LAZ~50SL|25|30000|2026-11-01|Roma' };
  const rtdb = rtdbFinto({ a });
  const db = dbFinto({
    'admin/adm': { ruolo: 'admin' },
    'users/u1': { seguiti: giovani },
    'users/u2': { seguiti: [...giovani.slice(0, 4), 'f-f-2008'] },
    'users/adm': { seguiti: giovani },
  });
  const r = await calcolaSegnali({ db, rtdb, adesso: '2026-11-22T10:00:00Z', log: () => {} });
  assert.equal(r.nuovi, 1);
  const s = db.docs.get('privato/segnali/utenti/u1');
  assert.equal(s.n, 5);
  assert.equal(s.m, 3);
  assert.equal(s.stato, 'da-vedere');
  assert.ok(!db.docs.has('privato/segnali/utenti/u2'));
  assert.ok(!db.docs.has('privato/segnali/utenti/adm'));
  // Ignorato: resta ignorato finché non ne segue di più.
  db.docs.set('privato/segnali/utenti/u1', { ...s, stato: 'ignorato', decisione: { azione: 'ignora', n: 5 } });
  assert.equal((await calcolaSegnali({ db, rtdb, adesso: '2026-11-23T10:00:00Z', log: () => {} })).nuovi, 0);
  assert.equal(db.docs.get('privato/segnali/utenti/u1').stato, 'ignorato');
  a['g-g-2016'] = { i: 'Atleta 6|2016|F', s2026: 'Tritone|LAZ~50SL|25|40000|2026-11-01|Roma' };
  db.docs.set('users/u1', { seguiti: [...giovani, 'g-g-2016'] });
  assert.equal((await calcolaSegnali({ db, rtdb, adesso: '2026-11-24T10:00:00Z', log: () => {} })).nuovi, 1);
  assert.equal(db.docs.get('privato/segnali/utenti/u1').stato, 'da-vedere');
  // Non più sopra la soglia mentre era da vedere: il segnale si toglie.
  db.docs.set('users/u1', { seguiti: giovani.slice(0, 2) });
  await calcolaSegnali({ db, rtdb, adesso: '2026-11-25T10:00:00Z', log: () => {} });
  assert.ok(!db.docs.has('privato/segnali/utenti/u1'));
});

test('segnali: avviso, sospensione e chiusura le esegue il controllore', async () => {
  const db = dbFinto({
    'privato/segnali': { daFare: true },
    'privato/segnali/utenti/u1': { n: 5, m: 3, stato: 'avviso-da-mandare' },
    'privato/segnali/utenti/u2': { n: 6, m: 4, stato: 'da-sospendere' },
    'privato/segnali/utenti/u3': { n: 7, m: 5, stato: 'da-chiudere', atleti: [{ n: 'X' }] },
    'users/u1': { tokens: token('t1') },
    'users/u2': { tokens: token('t2') },
    'users/u3': { tokens: [] },
    'consigli/c1': { uid: 'u3', testo: 'ciao' },
    'consigli/c2': { uid: 'u1', testo: 'ciao' },
  });
  const chiamate = [];
  const chiamaGoogle = async (url, o) => { chiamate.push([url.split(':').pop(), o.body]); return {}; };
  const invio = invioFinto();
  assert.equal(await eseguiSegnali({
    db, invio, sito: SITO, chiamaGoogle, progetto: 'p', adesso: '2026-11-22T10:00:00Z', log: () => {},
  }), 3);
  assert.equal(invio.mandate.length, 1);
  assert.equal(invio.mandate[0].url, `${SITO}/#/termini`);
  assert.equal(db.docs.get('privato/segnali/utenti/u1').stato, 'avvisato');
  assert.equal(db.docs.get('privato/segnali/utenti/u2').stato, 'sospeso');
  assert.deepEqual(db.docs.get('users/u2').tokens, []);
  assert.equal(db.docs.get('privato/segnali/utenti/u3').stato, 'chiuso');
  assert.deepEqual(db.docs.get('privato/segnali/utenti/u3').atleti, []);
  assert.ok(!db.docs.has('users/u3'));
  assert.ok(!db.docs.has('consigli/c1'));
  assert.ok(db.docs.has('consigli/c2'));
  assert.deepEqual(chiamate.map(([x]) => x), ['update', 'delete']);
  assert.equal(chiamate[0][1].disableUser, true);
  assert.equal(db.docs.get('privato/segnali').daFare, false);
  // Senza decisioni nuove non si rilegge niente.
  assert.equal(await eseguiSegnali({
    db, invio, sito: SITO, chiamaGoogle, progetto: 'p', adesso: '2026-11-22T10:05:00Z', log: () => {},
  }), 0);
});

test('account inattivi: avviso a 35 mesi, eliminazione a 36 (e almeno 30 giorni dopo l\'avviso)', async () => {
  const db = dbFinto({
    'admin/adm': {},
    'users/vecchio': { tokens: token('tv') },
    'users/quasi': { tokens: token('tq') },
    'users/attivo': { tokens: token('ta') },
    'consigli/c1': { uid: 'vecchio', testo: 'x' },
  });
  const ms = (d) => String(Date.parse(d));
  const utenti = [
    { localId: 'vecchio', createdAt: ms('2023-01-01'), lastLoginAt: ms('2023-10-01'), lastRefreshAt: '2023-10-20T10:00:00Z' },
    { localId: 'quasi', createdAt: ms('2023-01-01'), lastRefreshAt: '2023-12-10T10:00:00Z' },
    { localId: 'attivo', createdAt: ms('2023-01-01'), lastRefreshAt: '2026-11-01T10:00:00Z' },
    { localId: 'adm', createdAt: ms('2020-01-01'), lastRefreshAt: '2020-01-01T10:00:00Z' },
  ];
  const eliminati = [];
  const chiamaGoogle = async (url, o = {}) => {
    if (url.includes(':batchGet')) return { users: utenti };
    if (url.endsWith(':delete')) eliminati.push(o.body.localId);
    return {};
  };
  const invio = invioFinto();
  const giro = (adesso) => controllaInattivi({
    db, invio, sito: SITO, chiamaGoogle, progetto: 'p', adesso, log: () => {},
  });
  // Novembre 2026: "vecchio" (36 mesi) e "quasi" (35) ricevono l'avviso, nessuno si elimina subito.
  assert.deepEqual(await giro('2026-11-22T10:00:00Z'), { avvisi: 2, perEmail: 0, tolti: 0 });
  assert.equal(invio.mandate.length, 2);
  assert.match(invio.mandate[0].corpo, /entro 30 giorni verrà eliminato/);
  // Dicembre: avvisi già mandati; "vecchio" si elimina, "quasi" (36 mesi ora) anche, perché avvisato da 30 giorni.
  assert.deepEqual(await giro('2026-12-22T10:00:00Z'), { avvisi: 0, perEmail: 0, tolti: 2 });
  assert.deepEqual(eliminati, ['vecchio', 'quasi']);
  assert.ok(!db.docs.has('users/vecchio'));
  assert.ok(!db.docs.has('consigli/c1'));
  assert.ok(db.docs.has('users/attivo'));
  assert.equal(invio.mandate.length, 2);
});

test('account inattivi senza notifiche: li avvisa l\'admin per email, e si eliminano solo dopo', async () => {
  const db = dbFinto({
    'meta/admin': { uid: 'adm' },
    'admin/adm': {},
    'users/adm': { tokens: ['tok-admin'] },
    'users/muto': { tokens: [] },
  });
  const utenti = [{ localId: 'muto', email: 'muto@example.com', createdAt: String(Date.parse('2023-01-01')), lastRefreshAt: '2023-10-01T10:00:00Z' }];
  const eliminati = [];
  const chiamaGoogle = async (url, o = {}) => {
    if (url.includes(':batchGet')) return { users: utenti };
    if (url.endsWith(':delete')) eliminati.push(o.body.localId);
    return {};
  };
  const invio = invioFinto();
  const giro = (adesso) => controllaInattivi({
    db, invio, sito: SITO, chiamaGoogle, progetto: 'p', adesso, log: () => {},
  });
  assert.deepEqual(await giro('2026-11-22T10:00:00Z'), { avvisi: 1, perEmail: 1, tolti: 0 });
  const scheda = db.docs.get('privato/inattivi/account/muto');
  assert.equal(scheda.email, 'muto@example.com');
  assert.equal(scheda.stato, 'da-avvisare');
  // All'admin una notifica (senza email dentro).
  assert.equal(invio.mandate.length, 1);
  assert.equal(invio.mandate[0].token, 'tok-admin');
  assert.doesNotMatch(JSON.stringify(invio.mandate[0]), /muto@/);
  // Un mese dopo, email non ancora segnata come mandata: non si elimina.
  assert.deepEqual(await giro('2026-12-22T10:00:00Z'), { avvisi: 0, perEmail: 0, tolti: 0 });
  // L'admin la segna mandata il 23/12: si elimina al primo controllo dopo 30 giorni.
  db.docs.set('privato/inattivi/account/muto', { ...scheda, stato: 'avvisato', mandata: '2026-12-23T10:00:00Z' });
  assert.deepEqual(await giro('2027-01-10T10:00:00Z'), { avvisi: 0, perEmail: 0, tolti: 0 });
  assert.deepEqual(await giro('2027-01-25T10:00:00Z'), { avvisi: 0, perEmail: 0, tolti: 1 });
  assert.deepEqual(eliminati, ['muto']);
  assert.ok(!db.docs.has('privato/inattivi/account/muto'));
});

test('conservazione: consigli di oltre 24 mesi, testi della stagione passata, vecchie copie', async () => {
  const db = dbFinto({
    'consigli/vecchio': { creato: '2024-10-01T10:00:00Z' },
    'consigli/nuovo': { creato: '2025-12-01T10:00:00Z' },
    'testi/t1': { agg: '2026-06-01T10:00:00Z', p: ['x'] },
    'testi/t2': { agg: '2026-10-01T10:00:00Z', p: ['y'] },
    'meta/testi': { fatti: { t1: '2026-06-01', t2: '2026-10-01' } },
    'meta/live': { indiceV: 3 },
    'meta/atleti-noti': { k: ['a'] },
    'pacchi/1': {},
    'pacchi/2': {},
    'cerca/abc': {},
    'indici/a': {},
  });
  assert.equal(await pulisciConsigliVecchi({ db, adesso: '2026-11-22T10:00:00Z', log: () => {} }), 1);
  assert.ok(db.docs.has('consigli/nuovo'));
  assert.equal(await pulisciTestiStagione({ db, adesso: '2026-11-22T10:00:00Z', log: () => {} }), 1);
  assert.ok(!db.docs.has('testi/t1'));
  assert.ok(db.docs.has('testi/t2'));
  assert.match(db.docs.get('meta/testi').fatti.t1, /^tolto/);
  assert.deepEqual(await pulisciVecchieRaccolte({ db, massimo: 3, log: () => {} }), { tolti: 3, finito: false });
  assert.deepEqual(await pulisciVecchieRaccolte({ db, massimo: 3, log: () => {} }), { tolti: 1, finito: true });
  assert.ok(!db.docs.has('meta/atleti-noti'));
  assert.ok(![...db.docs.keys()].some((p) => /^(pacchi|cerca|indici)\//.test(p)));
});

test('tutela: i lavori di giorno, mese e stagione si fanno una volta', async () => {
  const db = dbFinto({ 'meta/live': { indiceV: 3 } });
  const chiamaGoogle = async () => ({ users: [] });
  const opz = {
    db, rtdb: null, invio: invioFinto(), sito: SITO, chiamaGoogle, progetto: 'p', log: () => {},
  };
  await tutela({ ...opz, adesso: '2026-11-22T10:00:00Z' });
  const m = db.docs.get('meta/manutenzione');
  assert.equal(m.giorno, '2026-11-22');
  assert.equal(m.mese, '2026-11');
  assert.equal(m.stagione, 2026);
  assert.equal(m.vecchieFinite, true);
  let elenchi = 0;
  const elenca = db.elenca;
  db.elenca = async (c, o) => { elenchi++; return elenca(c, o); };
  await tutela({ ...opz, adesso: '2026-11-22T10:05:00Z' });
  assert.equal(elenchi, 0);
});

test('foto delle tessere: restano con la richiesta aperta e fino a 30 giorni dopo la chiusura', async () => {
  const db = dbFinto({
    'richiestePrivacy/a': { stato: 'nuova' },
    'richiestePrivacy/b': { stato: 'in-attesa' },
    'richiestePrivacy/c': { stato: 'tolta', chiusa: '2026-11-01T10:00:00Z' },
    'richiestePrivacy/d': { stato: 'respinta', chiusa: '2026-10-01T10:00:00Z' },
    'richiestePrivacyFoto/d': { foto: 'data:image/jpeg;base64,EEE' },
    'richiestePrivacyFoto/a': { foto: 'data:image/jpeg;base64,AAA' },
    'richiestePrivacyFoto/b': { foto: 'data:image/jpeg;base64,BBB' },
    'richiestePrivacyFoto/c': { foto: 'data:image/jpeg;base64,CCC' },
    'richiestePrivacyFoto/orfana': { foto: 'data:image/jpeg;base64,DDD' },
  });
  assert.equal(await cancellaFotoChiuse({ db, adesso: '2026-11-22T10:00:00Z', log: () => {} }), 2);
  assert.deepEqual([...db.docs.keys()].filter((p) => p.startsWith('richiestePrivacyFoto/')).sort(), ['richiestePrivacyFoto/a', 'richiestePrivacyFoto/b', 'richiestePrivacyFoto/c']);
});
