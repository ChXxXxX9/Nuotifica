import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estraiFile, tipoDocumento, eAggiornato, mappaCategorie, settoriDelPost, gruppiDelPost,
  leggiPost, decodificaEntita, normalizzaUrl,
} from '../src/parse.js';
import * as d from './dati.js';

const mappa = mappaCategorie(d.categorie);

test('decodifica entità HTML dei titoli', () => {
  assert.equal(decodificaEntita('NUOTO &#8211; Corso &#8220;Istruttore&#8221; &amp; altro'), 'NUOTO – Corso “Istruttore” & altro');
});

test('estrae i file del post Finali: niente icona, niente doppioni', () => {
  const file = estraiFile(d.contenutoFinali);
  assert.equal(file.length, 10);
  assert.ok(file.every((f) => !/ico-FIN/.test(f.url)));
  assert.equal(file[0].etichetta, 'FcrEC – Risultati Completi delle Gare');
  // il doppione di comun186 con http/https e www diversi è riconosciuto
  assert.equal(file.filter((f) => /comun186/.test(f.url)).length, 1);
  assert.equal(new Set(file.map((f) => f.id)).size, file.length);
});

test('normalizzazione indirizzi', () => {
  assert.equal(
    normalizzaUrl('http://sito-esempio.it/wp-content/uploads/2026/06/comun186.pdf'),
    normalizzaUrl('https://www.sito-esempio.it/wp-content/uploads/2026/06/comun186.pdf'),
  );
});

test('riconosce il tipo di documento', () => {
  const casi = [
    ['FcrEC – Risultati Completi delle Gare', 'risultati'],
    ['FcrEC – Classifiche di Società Maschili', 'classifiche'],
    ['FcrEC – Elenco Staffette Ammesse', 'ammessi'],
    ['FcrEC – Elenco Staffette Iscritte', 'iscritti'],
    ['comun198- FcrEC – Orari Prime Serie', 'orari'],
    ['FcrEC – Elenco Atleti AMMESSI alle Gare AGGIORNATO', 'ammessi'],
    ['comun186-Finali Campionato Regionale Estivo di Categoria vl – Regolamento', 'comunicati'],
    ['Bozza Calendario Salvamento 1 parte 26_27', 'calendari'],
    ['Start list 1ª giornata', 'startlist'],
    ['PROGRAMMA GARE', 'startlist'],
    ['Convocazione riunione', 'comunicati'],
    ['Corso SNF Nautilus Roma', 'altro'],
  ];
  for (const [etichetta, atteso] of casi) {
    assert.equal(tipoDocumento(etichetta, ''), atteso, etichetta);
  }
  // se l'etichetta non basta, aiuta il nome del file
  assert.equal(tipoDocumento('Elenco', 'https://x.it/FcrCvl_RJC_elammessi.pdf'), 'ammessi');
});

test('riconosce "aggiornato"', () => {
  assert.ok(eAggiornato('Elenco Atleti AMMESSI alle Gare AGGIORNATO'));
  assert.ok(eAggiornato('Rettifica orari'));
  assert.ok(!eAggiornato('Orari Prime Serie'));
});

test('settori dei post', () => {
  const s = (p) => settoriDelPost(p.categories, mappa, decodificaEntita(p.title.rendered));
  assert.deepEqual(s(d.finali), ['nuoto']);
  assert.deepEqual(s(d.salvamento), ['salvamento']);
  assert.deepEqual(s(d.chiusura), ['comitato']);
  assert.deepEqual(s(d.corsoSit), ['sit']);
  assert.deepEqual(s(d.artisticoPropaganda), ['artistico']);
});

test('gruppi del nuoto: Categoria / Esordienti', () => {
  const g = (p) => leggiPost(p, mappa).gruppi;
  assert.deepEqual(g(d.finali), ['categoria']);
  assert.deepEqual(g(d.esordienti), ['esordienti']);
  assert.deepEqual(g(d.assoluto), ['categoria']);
  assert.deepEqual(g(d.riunione), ['categoria', 'esordienti']);
  assert.deepEqual(gruppiDelPost([], mappa, ['Categoria Esordienti A']), ['esordienti']);
});

test('i link agli articoli non sono documenti, quelli ai file sì', () => {
  const html = `
    <p>Testo <a href="https://www.federnuoto.it/home/news/123">Leggi tutto…</a></p>
    <p><a href="https://www.federnuoto.it/faq.html">FAQ Dipartimento per lo Sport</a></p>
    <p><a href="https://www.sito-esempio.it/wp-content/uploads/2026/10/Corso-SNF.pdf">Corso SNF Nautilus Roma</a></p>
    <p><a href="https://live.microplustiming.com/regionali">Risultati live</a></p>`;
  const p = leggiPost(d.postGrezzo({ id: 1, titolo: 'Notizia', categorie: [85], contenuto: html }), mappa);
  assert.deepEqual(p.file.map((f) => f.etichetta), ['Corso SNF Nautilus Roma', 'Risultati live']);
});

test('post Master archiviato anche sotto Nuoto: solo Master', () => {
  const master = d.postGrezzo({ id: 2, titolo: 'Master &#8211; Distanze Speciali', categorie: [78, 83], contenuto: '' });
  assert.deepEqual(leggiPost(master, mappa).settori, ['master']);
});

test('leggiPost produce date ISO e file classificati', () => {
  const p = leggiPost(d.finali, mappa);
  assert.equal(p.id, '350001');
  assert.equal(p.modificato, '2026-07-19T10:00:00.000Z');
  assert.equal(p.titolo, 'NUOTO – Finali Campionato Regionale Estivo di Categoria 2026 vl');
  const ammessi = p.file.find((f) => /elammessi/.test(f.url));
  assert.equal(ammessi.tipo, 'ammessi');
  assert.equal(ammessi.aggiornato, true);
});
