import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  inMs, formatta, leggiGara, nomeProprio, chiaveAtleta, nomeCategoria, oggiRoma,
} from '../src/tempi.js';
import { punti } from '../src/punti.js';
import {
  periodo, leggiElenco, raggruppa, leggiRisultati, indovinaVasca,
} from '../src/live.js';
import {
  costruisciSede, aggiornaGare, stagione, leggiNoti,
} from '../src/gare.js';

const campione = (nome) => readFileSync(new URL(`./campioni/${nome}`, import.meta.url), 'utf8');

test('tempi: lettura e scrittura', () => {
  assert.equal(inMs('58.88'), 58_880);
  assert.equal(inMs("2'05.40"), 125_400);
  assert.equal(inMs('2\'05"40'), 125_400);
  assert.equal(inMs('1:02.45'), 62_450);
  assert.equal(inMs("15'08.24"), 908_240);
  assert.equal(inMs('ASS'), null);
  assert.equal(inMs('SQ'), null);
  assert.equal(formatta(125_400), '2\'05"40');
  assert.equal(formatta(58_880), '58"88');
  assert.equal(formatta(62_050), '1\'02"05');
});

test('gare, nomi e categorie', () => {
  assert.deepEqual(leggiGara('200 m Stile Libero').codice, '200SL');
  assert.equal(leggiGara('50 Farfalla').codice, '50FA');
  assert.equal(leggiGara('400 m Misti').breve, '400 MI');
  assert.equal(leggiGara('4x50 m Stile Libero').staffetta, true);
  assert.equal(leggiGara('50 m Trasporto manichino'), null);
  assert.equal(nomeProprio("D'ANGELO"), "D'Angelo");
  assert.equal(nomeProprio('DE ROSSI'), 'De Rossi');
  assert.equal(chiaveAtleta('De Rossi', 'Luca', 2012), 'de-rossi-luca-2012');
  assert.equal(nomeCategoria('ES/A FEMMINE 2016'), 'Esordienti A femmine 2016');
  assert.equal(nomeCategoria('ASSOLUTI MASCHI'), 'Assoluti maschi');
});

test('punti World Aquatics', () => {
  // 200 SL uomini, vasca corta 2026/27: base 98.61 → 1'45"12 = 825 punti.
  assert.equal(punti(105_120, '200SL', 'M', 25, '2026-10-31'), 825);
  // Record del mondo = 1000.
  assert.equal(punti(19_900, '50SL', 'M', 25, '2026-10-01'), 1000);
  assert.equal(punti(60_000, '4x50SL', 'M', 25, '2026-10-01'), null);
  assert.equal(punti(60_000, '100MI', 'M', 50, '2026-07-01'), null); // non esiste in vasca lunga
});

test('periodo delle gare', () => {
  assert.deepEqual(periodo('07-08/11/2026'), { dal: '2026-11-07', al: '2026-11-08' });
  assert.deepEqual(periodo('31-01/10-11/2026'), { dal: '2026-10-31', al: '2026-11-01' });
  assert.deepEqual(periodo('07/11/2026'), { dal: '2026-11-07', al: '2026-11-07' });
  assert.deepEqual(periodo('30-02/12-01/2027'), { dal: '2026-12-30', al: '2027-01-02' });
  assert.equal(indovinaVasca('Campionato Regionale di Categoria 2026 - V.L.', '2026-03-01'), 50);
  assert.equal(indovinaVasca('Campionato Regionale Assoluto V.C. 2026', '2026-07-01'), 25);
  assert.equal(stagione('2026-11-07'), '2026');
  assert.equal(stagione('2026-07-07'), '2025');
});

test('elenco delle ultime gare: sedi raggruppate, niente propaganda', () => {
  const voci = leggiElenco(campione('elenco.html'));
  assert.ok(voci.length >= 10);
  assert.ok(voci.every((v) => !/propaganda/i.test(v.titolo)));
  const gruppi = raggruppa(voci);
  const lanzi = gruppi.find((g) => /Lanzi/.test(g.nome));
  assert.equal(lanzi.sedi.length, 4);
  assert.equal(lanzi.dal, '2026-11-07');
  // Stesso nome con spazi diversi = stessa gara.
  const categoria = gruppi.filter((g) => /Regionale di Categoria 2026/.test(g.nome));
  assert.equal(categoria.length, 1);
  assert.equal(categoria[0].vasca, 50);
});

test('risultati di una sede: tempi, stati e parziali', () => {
  const righe = leggiRisultati(campione('gara-assoluti.json'));
  assert.equal(righe.length, 64);
  const prima = righe[0];
  assert.equal(prima.gara.codice, '100DO');
  assert.equal(prima.sesso, 'F');
  assert.equal(prima.ms, 58_880);
  assert.deepEqual(prima.parziali, [{ m: 50, ms: 28_260, p: 1 }]);
  assert.match(prima.atleta.chiave, /^[a-z-]+-\d{4}$/);
  const millecinque = righe.find((r) => r.gara.codice === '1500SL' && r.ms);
  assert.ok(millecinque.parziali.length >= 20);
});

test('personali e stagionali: PB solo se migliora, badge ricordati tra un giro e l\'altro', () => {
  const gara = { id: 'g1', nome: 'Prova', luogo: 'Roma', dal: '2026-11-07', vasca: 25 };
  const riga = (id, ms, data = '2026-11-07') => ({
    id, categoria: 'RAGAZZI MASCHI', sesso: 'M', gara: leggiGara('100 m Stile Libero'), turno: '001',
    batteria: 1, corsia: 4, posizione: 1, ms, stato: null, data,
    atleta: { chiave: 'ferri-luca-2012', nome: 'Luca Ferri', anno: 2012, naz: 'ITA', codice: '1' },
    societa: 'Aurora', parziali: [],
  });
  const primati = new Map([['primati/25-100SL-M', { 'ferri-luca-2012': '63000|63000|2026' }]]);
  const uno = costruisciSede({ gara, sede: 'abcdef1234', piscina: 'P', righe: [riga('r1', 62_450)], primati });
  const r1 = [...uno.documenti.values()][0].eventi[0].b[0].r[0];
  assert.equal(r1.b, 'PB');
  assert.equal(r1.dp, -550);
  assert.equal(primati.get('primati/25-100SL-M')['ferri-luca-2012'], '62450|62450|2026');
  assert.equal(uno.atleti.get('ferri-luca-2012').risultati[0].b, 'PB');

  // Giro dopo: la stessa riga non è nuova e tiene il suo PB, anche se il primato è già aggiornato.
  const noti = leggiNoti(uno.ricorda);
  const due = costruisciSede({ gara, sede: 'abcdef1234', piscina: 'P', righe: [riga('r1', 62_450)], primati, noti });
  assert.equal([...due.documenti.values()][0].eventi[0].b[0].r[0].b, 'PB');
  assert.equal(due.nuove.length, 0);
  assert.equal(due.atleti.size, 0);

  // Un tempo peggiore del personale ma migliore dello stagionale (nuova stagione) → niente PB.
  primati.set('primati/25-100SL-M', { 'ferri-luca-2012': '60000|64000|2026' });
  const tre = costruisciSede({ gara, sede: 'x', piscina: 'P', righe: [riga('r2', 63_500)], primati });
  assert.equal([...tre.documenti.values()][0].eventi[0].b[0].r[0].b, 'SB');
});

// Firestore finto, con le operazioni usate dal giro delle gare.
function dbFinto() {
  const docs = new Map();
  const copia = (x) => JSON.parse(JSON.stringify(x));
  const conta = { letture: 0, scritture: 0 };
  return {
    docs,
    conta,
    async leggi(p) { conta.letture++; return docs.has(p) ? copia(docs.get(p)) : null; },
    async scrivi(p, d) { conta.scritture++; docs.set(p, copia(d)); },
    async aggiorna(p, d) { conta.scritture++; docs.set(p, { ...docs.get(p), ...copia(d) }); },
    async scriviTanti(elenco) { for (const { percorso, dati } of elenco) await this.scrivi(percorso, dati); },
    async leggiTanti(percorsi) { return new Map(percorsi.map((p) => [p, docs.has(p) ? copia(docs.get(p)) : null])); },
    async commit(elenco) {
      for (const w of elenco) {
        conta.scritture++;
        const prima = docs.get(w.percorso) ?? {};
        const dopo = { ...prima, ...copia(w.dati ?? {}) };
        for (const [campo, valori] of Object.entries(w.aggiungi ?? {})) {
          const esistenti = dopo[campo] ?? [];
          for (const v of valori) if (!esistenti.some((e) => JSON.stringify(e) === JSON.stringify(v))) esistenti.push(copia(v));
          dopo[campo] = esistenti;
        }
        for (const campo of w.oraServer ?? []) dopo[campo] = 'ora';
        docs.set(w.percorso, dopo);
      }
    },
    async contieneUno(collezione, campo, valori) {
      return [...docs.entries()]
        .filter(([p, d]) => p.startsWith(`${collezione}/`) && (d[campo] ?? []).some((v) => valori.includes(v)))
        .map(([p, d]) => ({ id: p.split('/')[1], ...copia(d) }));
    },
  };
}

test('giro delle gare: primo giro senza notifiche, poi notifica a chi segue l\'atleta', async () => {
  const db = dbFinto();
  const elenco = campione('elenco.html');
  let assoluti = campione('gara-assoluti.json');
  const esordienti = campione('gara-esordienti.json');
  const fonti = { live: 'L/', liveGara: 'G/' };
  const scarica = async (url) => {
    if (url === 'L/') return elenco;
    if (url.startsWith('G/72a5f6')) return assoluti;
    return esordienti;
  };
  const inviati = [];
  const invio = { async push(token, m) { inviati.push({ token, ...m }); return 'ok'; } };
  // Siamo durante il Regionale Assoluto (31/10 - 01/11).
  const adesso = '2026-11-01T10:00:00Z';
  assert.equal(oggiRoma(adesso), '2026-11-01');

  // Primo giro: legge la gara in corso e due sedi mai lette, nessuna notifica.
  const uno = await aggiornaGare({ db, fonti, scarica, invio, sito: 'https://x.app', adesso, log: () => {} });
  assert.equal(inviati.length, 0);
  assert.ok(uno.gare >= 1);
  const stato = db.docs.get('meta/live');
  const sedeAss = Object.keys(stato.sedi).find((s) => s.startsWith('72a5f6'));
  assert.ok(sedeAss, 'la sede in gara è stata letta');
  const idGara = stato.sedi[sedeAss].gara;
  const gara = db.docs.get(`gare/${idGara}`);
  assert.equal(gara.vasca, 25);
  assert.equal(gara.categorie.length, 2);
  assert.ok(gara.conta > 0);
  const docCat = db.docs.get(`gare/${idGara}/categorie/${gara.categorie[0].docs[0]}`);
  assert.ok(docCat.eventi[0].b[0].r[0].n);
  assert.ok(db.docs.get('meta/gare-diretta').gare.length >= 1);

  // Un atleta e la sua scheda.
  const righe = leggiRisultati(assoluti);
  const scelta = righe.find((r) => r.gara.codice === '100DO' && r.ms && r.sesso === 'M');
  const scheda = db.docs.get(`atleti/${scelta.atleta.chiave}`);
  assert.equal(scheda.n, scelta.atleta.nome);
  assert.ok(scheda.r.some((v) => v.c === '100DO' && v.t === scelta.ms && v.pt > 0));
  const indice = db.docs.get(`indici/${scelta.atleta.chiave[0]}`);
  assert.ok(indice.l.some((v) => v.startsWith(`${scelta.atleta.chiave}|`)));
  // Si trova anche dal nome di battesimo.
  const nome = scelta.atleta.nome.split(' ')[0].toLowerCase()[0];
  assert.ok(db.docs.get(`indici/${nome}`).l.some((v) => v.startsWith(`${scelta.atleta.chiave}|`)));

  // Qualcuno segue quell'atleta.
  db.docs.set('users/u1', { seguiti: [scelta.atleta.chiave], tokens: ['tok'], pushOn: true });

  // Secondo giro con la gara invariata: niente da fare.
  await aggiornaGare({ db, fonti, scarica, invio, sito: 'https://x.app', adesso, log: () => {} });
  assert.equal(inviati.length, 0);

  // Terzo giro: il tempo dell'atleta migliora (es. correzione o nuova batteria).
  const nuovo = JSON.parse(assoluti);
  for (const gareCat of Object.values(nuovo.results)) {
    for (const batt of Object.values(gareCat)) {
      for (const atleti of Object.values(batt)) {
        for (const a of atleti) if (a.id === scelta.id) a.time = '50.01';
      }
    }
  }
  assoluti = JSON.stringify(nuovo);
  const tre = await aggiornaGare({ db, fonti, scarica, invio, sito: 'https://x.app', adesso, log: () => {} });
  assert.equal(tre.nuoviTempi, 1);
  assert.equal(inviati.length, 1);
  assert.match(inviati[0].titolo, /Nuovo personale/);
  assert.match(inviati[0].corpo, /100 DO in 50"01/);
  assert.match(inviati[0].url, /#\/atleta\//);
});
