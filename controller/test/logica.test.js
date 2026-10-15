import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { mappaCategorie, leggiPost } from '../src/parse.js';
import {
  confronta, voceIndice, documentoPost, perUtente, messaggiPush, etichettaLeggibile,
} from '../src/logica.js';
import { codifica, decodifica } from '../src/firestore.js';
import { creaGestoreToken } from '../src/google.js';
import * as d from './dati.js';

const mappa = mappaCategorie(d.categorie);

function conFileAggiunto(grezzo, html, modificato) {
  return { ...grezzo, modified_gmt: modificato, content: { rendered: grezzo.content.rendered + html } };
}

test('confronta: post nuovo, file aggiunto, etichetta "aggiornato", solo testo', () => {
  const prima = leggiPost(d.finali, mappa);
  assert.equal(confronta(null, prima).tipo, 'nuovo');

  const voce = voceIndice(prima);
  const dopo = leggiPost(conFileAggiunto(d.finali, '<a href="https://www.finlazio.it/wp-content/uploads/2026/07/startlist.pdf">Start list Finali</a>', '2026-07-20T08:00:00'), mappa);
  const diff = confronta(voce, dopo);
  assert.equal(diff.tipo, 'aggiunta');
  assert.deepEqual(diff.file.map((f) => f.tipo), ['startlist']);

  const rietichettato = {
    ...d.finali,
    content: { rendered: d.finali.content.rendered.replace('Elenco Staffette Ammesse', 'Elenco Staffette Ammesse AGGIORNATO') },
  };
  const diff2 = confronta(voce, leggiPost(rietichettato, mappa));
  assert.equal(diff2.file.length, 1);
  assert.equal(diff2.file[0].aggiornato, true);

  const soloTesto = { ...d.finali, content: { rendered: `${d.finali.content.rendered}<p>Nota: parcheggio chiuso</p>` } };
  assert.equal(confronta(voce, leggiPost(soloTesto, mappa)), null);
});

test('documentoPost conserva la data di arrivo dei file vecchi', () => {
  const prima = leggiPost(d.finali, mappa);
  const vecchio = JSON.parse(JSON.stringify(documentoPost(prima, null, null, '2026-07-19T10:00:00.000Z')));
  const dopo = leggiPost(conFileAggiunto(d.finali, '<a href="https://x.it/nuovo.pdf">Start list</a>', '2026-07-20T08:00:00'), mappa);
  const diff = confronta(voceIndice(prima), dopo);
  const doc = documentoPost(dopo, vecchio, diff, '2026-07-20T08:05:00.000Z');
  const nuovo = doc.file.find((f) => f.url === 'https://x.it/nuovo.pdf');
  const vecchioFile = doc.file.find((f) => /comun186/.test(f.url));
  assert.equal(nuovo.aggiuntoIl.toISOString(), '2026-07-20T08:05:00.000Z');
  assert.equal(vecchioFile.aggiuntoIl.toISOString(), '2026-07-19T10:00:00.000Z');
  assert.equal(doc.novita.tipo, 'aggiunta');
  assert.deepEqual(doc.novita.fileIds, [nuovo.id]);
});

test('perUtente: settore, gruppo e tipi', () => {
  const finali = leggiPost(d.finali, mappa);
  const cambio = { tipo: 'nuovo', file: finali.file, post: finali };

  assert.equal(perUtente({ settori: ['pallanuoto'] }, cambio), null);
  assert.equal(perUtente({ settori: ['nuoto'], gruppi: ['esordienti'] }, cambio), null);
  assert.ok(perUtente({ settori: ['nuoto'], gruppi: ['categoria'] }, cambio));
  assert.ok(perUtente({ settori: ['nuoto'], gruppi: [] }, cambio));

  const soloAmmessi = perUtente({ settori: ['nuoto'], gruppi: ['categoria'], tipi: ['ammessi'] }, cambio);
  assert.ok(soloAmmessi.file.length >= 1);
  assert.ok(soloAmmessi.file.every((f) => f.tipo === 'ammessi'));
  assert.equal(perUtente({ settori: ['nuoto'], tipi: ['tuttavia-niente'] }, cambio), null);

  // comunicato senza file
  const chiusura = leggiPost(d.chiusura, mappa);
  const avviso = { tipo: 'nuovo', file: [], post: chiusura };
  assert.ok(perUtente({ settori: ['comitato'], tipi: ['comunicati'] }, avviso));
  assert.equal(perUtente({ settori: ['comitato'], tipi: ['ammessi'] }, avviso), null);

  // gruppi non contano fuori dal nuoto
  const art = leggiPost(d.artisticoPropaganda, mappa);
  assert.ok(perUtente({ settori: ['artistico'], gruppi: ['categoria'] }, { tipo: 'nuovo', file: art.file, post: art }));
});

test('testi delle notifiche', () => {
  const finali = leggiPost(d.finali, mappa);
  const ammessi = finali.file.find((f) => f.tipo === 'ammessi' && f.aggiornato);
  const [m] = messaggiPush([{ tipo: 'aggiunta', file: [ammessi], post: finali }], 'https://nuotifica.web.app');
  assert.equal(m.titolo, 'NUOTO – Finali Campionato Regionale Estivo di Categoria 2026 vl');
  assert.equal(m.corpo, 'Aggiornato: Elenco Atleti AMMESSI alle Gare AGGIORNATO');
  assert.equal(m.url, 'https://nuotifica.web.app/#/post/350001');

  const [n] = messaggiPush([{ tipo: 'nuovo', file: finali.file.slice(0, 2), post: finali }], 'https://s');
  assert.equal(n.corpo, 'Nuovo · Risultati, Classifiche');

  const tanti = Array.from({ length: 6 }, () => ({ tipo: 'nuovo', file: [], post: finali }));
  assert.equal(messaggiPush(tanti, 'https://s').length, 1);
});

test('etichette leggibili', () => {
  assert.equal(etichettaLeggibile('comun198- FcrEC – Orari Prime Serie'), 'Orari Prime Serie');
  assert.equal(etichettaLeggibile('comun197 AGGIORNATO- FcrEC – Orari Serie Successive'), 'Aggiornato – FcrEC – Orari Serie Successive'.replace('FcrEC – ', ''));
  assert.equal(etichettaLeggibile('Bozza Calendario Salvamento'), 'Bozza Calendario Salvamento');
});

test('Firestore: codifica e decodifica', () => {
  const dati = {
    a: 'x', n: 3, f: 1.5, b: true, z: null, l: ['p', 2], m: { k: 'v', '353860': { m: 'y' } },
    t: new Date('2026-10-14T12:00:00.000Z'),
  };
  const tondo = decodifica(codifica(dati));
  assert.deepEqual(tondo, { ...dati, t: '2026-10-14T12:00:00.000Z' });
});

test('token Google: JWT firmato correttamente', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const account = {
    client_email: 'sa@progetto.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    project_id: 'progetto',
  };
  let chiamate = 0;
  const fetchFn = async (url, opzioni) => {
    chiamate++;
    const assertion = new URLSearchParams(opzioni.body.toString()).get('assertion');
    const [h, p, firma] = assertion.split('.');
    const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, firma, 'base64url');
    assert.ok(ok);
    assert.equal(JSON.parse(Buffer.from(p, 'base64url')).iss, account.client_email);
    return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
  };
  const ottieni = creaGestoreToken(account, { fetchFn });
  assert.equal(await ottieni(), 'tok');
  assert.equal(await ottieni(), 'tok');
  assert.equal(chiamate, 1);
});
