import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlla } from '../src/main.js';
import * as d from './dati.js';

// Firestore finto: salva come farebbe quello vero (le date tornano stringhe ISO).
function dbFinto() {
  const docs = new Map();
  const copia = (x) => JSON.parse(JSON.stringify(x));
  return {
    docs,
    async leggi(p) { return docs.has(p) ? copia(docs.get(p)) : null; },
    async scrivi(p, dati) { docs.set(p, copia(dati)); },
    async aggiorna(p, dati) { docs.set(p, { ...docs.get(p), ...copia(dati) }); },
    async scriviTanti(elenco) { for (const { percorso, dati } of elenco) docs.set(percorso, copia(dati)); },
    async elenca(collezione) {
      return [...docs.entries()]
        .filter(([p]) => p.startsWith(`${collezione}/`))
        .map(([p, v]) => ({ id: p.split('/')[1], ...copia(v) }));
    },
  };
}

function wpFinto(posts) {
  return {
    posts,
    async categorie() { return d.categorie; },
    async paginaPost(ordine, pagina, perPagina = 25) {
      const campo = ordine === 'modified' ? 'modified_gmt' : 'date_gmt';
      const ordinati = [...this.posts].sort((a, b) => b[campo].localeCompare(a[campo]));
      return ordinati.slice((pagina - 1) * perPagina, pagina * perPagina);
    },
  };
}

function invioFinto(verificati = []) {
  const registro = { push: [], email: [] };
  return {
    registro,
    emailAttive: true,
    async push(token, m) {
      if (token === 'morto') return 'token-non-valido';
      registro.push.push({ token, ...m });
      return 'ok';
    },
    async emailVerificate(uids) { return new Set(uids.filter((u) => verificati.includes(u))); },
    async email(e) { registro.email.push(e); },
  };
}

const log = () => {};

test('giro completo: primo avvio muto, poi avvisi solo a chi interessa', async () => {
  const wp = wpFinto([d.finali, d.salvamento, d.chiusura, d.esordienti, d.assoluto]);
  const db = dbFinto();
  const invio = invioFinto(['marco', 'giulia']);
  const sito = 'https://nuotifica.web.app';

  db.docs.set('users/marco', {
    email: 'marco@example.com', settori: ['nuoto'], gruppi: ['categoria'], tipi: ['tutti'],
    pushOn: true, emailOn: false, tokens: ['tel-marco', 'morto'], unsubToken: 't1',
  });
  db.docs.set('users/giulia', {
    email: 'giulia@example.com', settori: ['nuoto'], gruppi: ['esordienti'], tipi: ['tutti'],
    pushOn: false, emailOn: true, tokens: [], unsubToken: 't2',
  });
  db.docs.set('users/luca', {
    email: 'luca@example.com', settori: ['nuoto'], gruppi: ['categoria'], tipi: ['risultati'],
    pushOn: false, emailOn: true, tokens: [], unsubToken: 't3',
  });

  // 1° giro: memorizza, non avvisa nessuno.
  const primo = await controlla({ wp, db, invio, sito, adesso: '2026-10-14T20:00:00.000Z', log });
  assert.equal(primo.avvio, true);
  assert.equal(invio.registro.push.length, 0);
  assert.ok(db.docs.get('posts/350001'));
  assert.equal(db.docs.get('meta/stato').esito, 'ok');

  // 2° giro senza cambiamenti: niente.
  const secondo = await controlla({ wp, db, invio, sito, adesso: '2026-10-14T20:15:00.000Z', log });
  assert.equal(secondo.cambi.length, 0);

  // Sul post Finali compare l'elenco ammessi delle staffette aggiornato + esce un post esordienti nuovo.
  const finaliDopo = {
    ...d.finali,
    modified_gmt: '2026-10-14T20:20:00',
    content: {
      rendered: `${d.finali.content.rendered}<a href="https://www.finlazio.it/wp-content/uploads/2026/10/startlist-finali.pdf">Start list Finali</a>`,
    },
  };
  const nuovoEs = d.postGrezzo({
    id: 360000,
    titolo: 'NUOTO &#8211; 1ª Prova Regionale Esordienti A',
    categorie: [78, 83, 104],
    contenuto: '<a href="https://www.finlazio.it/wp-content/uploads/2026/10/EsA_regolamento.pdf">Regolamento</a>',
    modificato: '2026-10-14T20:22:00',
    data: '2026-10-14T20:22:00',
  });
  wp.posts = [finaliDopo, nuovoEs, d.salvamento, d.chiusura, d.esordienti, d.assoluto];

  const terzo = await controlla({ wp, db, invio, sito, adesso: '2026-10-14T20:30:00.000Z', log });
  assert.equal(terzo.cambi.length, 2);

  // Marco (nuoto categoria, push): riceve solo il post Finali, sul token valido.
  assert.equal(invio.registro.push.length, 1);
  assert.equal(invio.registro.push[0].token, 'tel-marco');
  assert.equal(invio.registro.push[0].url, `${sito}/#/post/350001`);
  assert.match(invio.registro.push[0].corpo, /^Aggiunto: Start list Finali/);
  // il token non valido è stato tolto
  assert.deepEqual(db.docs.get('users/marco').tokens, ['tel-marco']);

  // Giulia (esordienti, email verificata): riceve solo il post esordienti.
  // Luca vuole solo risultati e non ha l'email verificata: niente.
  assert.equal(invio.registro.email.length, 1);
  assert.equal(invio.registro.email[0].a, 'giulia@example.com');
  assert.match(invio.registro.email[0].oggetto, /Esordienti A/);

  // Il post salvato ha la novità e il file nuovo con la data giusta.
  const salvato = db.docs.get('posts/350001');
  assert.equal(salvato.novita.tipo, 'aggiunta');
  const startlist = salvato.file.find((f) => /startlist-finali/.test(f.url));
  assert.equal(startlist.aggiuntoIl, '2026-10-14T20:30:00.000Z');
  assert.equal(db.docs.get('meta/stato').postCambiati, 2);

  // 4° giro: niente di nuovo, niente doppioni.
  const quarto = await controlla({ wp, db, invio, sito, adesso: '2026-10-14T20:45:00.000Z', log });
  assert.equal(quarto.cambi.length, 0);
  assert.equal(invio.registro.push.length, 1);
});
