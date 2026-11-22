// Prove delle regole di sicurezza (Firestore e Realtime Database) sugli emulatori di Firebase.
// Gira su GitHub (workflow "Prova delle regole"): node --test dentro "firebase emulators:exec".
import { test, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, collection, serverTimestamp,
} from 'firebase/firestore';
import {
  ref, query, orderByKey, startAt, endAt, limitToFirst, get,
} from 'firebase/database';

let env;
const FOTO = `data:image/jpeg;base64,${'A'.repeat(2000)}`;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cloro',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    database: { rules: readFileSync('database.rules.json', 'utf8'), host: '127.0.0.1', port: 9000 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admin/capo'), { ruolo: 'admin' });
    await setDoc(doc(db, 'users/anna'), { settori: [], gruppi: [], tipi: [], pushOn: true, tokens: [] });
    await setDoc(doc(db, 'privato/nascosti'), { atleti: { 'rossi-ugo-2012': { n: 'Ugo Rossi' } } });
    await setDoc(doc(db, 'config/nascosti'), { h: ['abc'], r: [] });
    const rt = ctx.database();
    const { set } = await import('firebase/database');
    await set(ref(rt, 'c'), {
      'mario rossi~rossi-mario-2010': 'x', 'mario bianchi~bianchi-mario-2011': 'y', 'luca verdi~verdi-luca-2012': 'z',
    });
  });
});
after(async () => { await env?.cleanup(); });

const richiesta = (uid, extra = {}) => ({
  uid, atleta: 'rossi-mario-2010', nome: 'Mario Rossi', tipo: 'togli', chi: 'genitore', prova: '', email: 'a@b.it',
  foto: true, stato: 'nuova', avvisato: false, creato: serverTimestamp(), ...extra,
});

test('richiesta privacy: con la foto sì, senza no; foto solo per sé', async () => {
  const db = env.authenticatedContext('anna').firestore();
  const r1 = doc(collection(db, 'richiestePrivacy'));
  const ok = writeBatch(db);
  ok.set(r1, richiesta('anna'));
  ok.set(doc(db, 'richiestePrivacyFoto', r1.id), { uid: 'anna', foto: FOTO, creato: serverTimestamp() });
  await assertSucceeds(ok.commit());
  // Senza foto.
  await assertFails(setDoc(doc(collection(db, 'richiestePrivacy')), richiesta('anna')));
  await assertFails(setDoc(doc(collection(db, 'richiestePrivacy')), richiesta('anna', { foto: false })));
  // A nome di un altro.
  const r2 = doc(collection(db, 'richiestePrivacy'));
  const altro = writeBatch(db);
  altro.set(r2, richiesta('bruno'));
  altro.set(doc(db, 'richiestePrivacyFoto', r2.id), { uid: 'bruno', foto: FOTO, creato: serverTimestamp() });
  await assertFails(altro.commit());
  // Una foto da sola (senza richiesta) no.
  await assertFails(setDoc(doc(db, 'richiestePrivacyFoto/sola'), { uid: 'anna', foto: FOTO, creato: serverTimestamp() }));
  // Leggere: no (né richiesta né foto).
  await assertFails(getDoc(r1));
  await assertFails(getDoc(doc(db, 'richiestePrivacyFoto', r1.id)));
  // L'admin le legge, chiude la richiesta e cancella la foto insieme.
  const capo = env.authenticatedContext('capo').firestore();
  await assertSucceeds(getDoc(doc(capo, 'richiestePrivacy', r1.id)));
  await assertSucceeds(getDoc(doc(capo, 'richiestePrivacyFoto', r1.id)));
  const chiudi = writeBatch(capo);
  chiudi.update(doc(capo, 'richiestePrivacy', r1.id), { stato: 'tolta', chiusa: serverTimestamp() });
  chiudi.delete(doc(capo, 'richiestePrivacyFoto', r1.id));
  await assertSucceeds(chiudi.commit());
  // Richiesta a mano dell'admin, senza foto.
  await assertSucceeds(setDoc(doc(collection(capo, 'richiestePrivacy')), richiesta('capo', { foto: false, avvisato: true, manuale: true })));
  // Chi non ha fatto l'accesso: niente.
  const ospite = env.unauthenticatedContext().firestore();
  await assertFails(setDoc(doc(collection(ospite, 'richiestePrivacy')), richiesta('anna')));
});

test('consigli: "Segnala un errore" con il riferimento; cancellabili dal proprietario', async () => {
  const db = env.authenticatedContext('anna').firestore();
  const base = {
    uid: 'anna', testo: 'Il tempo giusto è 1\'02"30', tipo: 'errore', dispositivo: 'iPhone', stato: 'nuovo', creato: serverTimestamp(),
  };
  const c1 = doc(collection(db, 'consigli'));
  await assertSucceeds(setDoc(c1, { ...base, rif: 'atleta rossi-mario-2010 · 100 SL' }));
  await assertFails(setDoc(doc(collection(db, 'consigli')), { ...base, rif: 'x'.repeat(201) }));
  await assertFails(setDoc(doc(collection(db, 'consigli')), { ...base, tipo: 'spam' }));
  await assertSucceeds(deleteDoc(c1));
});

test('utenti: accettazione dei testi; elenchi privati solo per l\'admin', async () => {
  const db = env.authenticatedContext('anna').firestore();
  await assertSucceeds(updateDoc(doc(db, 'users/anna'), { accettato: { v: '2026-11-18', eta: true, il: serverTimestamp() } }));
  await assertFails(updateDoc(doc(db, 'users/anna'), { sospeso: true }));
  await assertFails(getDoc(doc(db, 'privato/nascosti')));
  await assertSucceeds(getDoc(doc(db, 'config/nascosti')));
  const capo = env.authenticatedContext('capo').firestore();
  await assertSucceeds(getDoc(doc(capo, 'privato/nascosti')));
});

test('ricerca nel Realtime Database: solo per inizio del nome, almeno 3 lettere, al massimo 100', async () => {
  const rt = env.authenticatedContext('anna').database();
  const c = ref(rt, 'c');
  await assertSucceeds(get(query(c, orderByKey(), startAt('mar'), endAt('mar'), limitToFirst(80))));
  await assertSucceeds(get(query(c, orderByKey(), startAt('mario'), endAt('mario'), limitToFirst(100))));
  await assertFails(get(query(c, orderByKey(), startAt('ma'), endAt('ma'), limitToFirst(80))));
  await assertFails(get(query(c, orderByKey(), startAt('mar'), endAt('mar'), limitToFirst(101))));
  await assertFails(get(query(c, orderByKey(), startAt('mar'), limitToFirst(80))));
  await assertFails(get(query(c, orderByKey(), startAt('mar'), endAt('z'), limitToFirst(80))));
  await assertFails(get(c));
  const ospite = env.unauthenticatedContext().database();
  await assertFails(get(query(ref(ospite, 'c'), orderByKey(), startAt('mar'), endAt('mar'), limitToFirst(80))));
});
