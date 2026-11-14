// Dati di prova ricalcati su post reali (ottobre 2026), con un indirizzo di esempio.
import { impostaSito } from '../src/parse.js';

impostaSito('https://www.sito-esempio.it/wp-json/wp/v2');

export const categorie = [
  { id: 78, slug: 'nuoto', parent: 0, name: 'Nuoto' },
  { id: 83, slug: 'comunicati-nu', parent: 78, name: 'Comunicati-Nu' },
  { id: 91, slug: 'eventi-nu', parent: 78, name: 'Eventi-Nu' },
  { id: 131, slug: 'risultati-nu', parent: 78, name: 'Risultati-Nu' },
  { id: 104, slug: 'esordienti-a-nu', parent: 78, name: 'Esordienti A-Nu' },
  { id: 103, slug: 'esordienti-b-nu', parent: 78, name: 'Esordienti B-Nu' },
  { id: 105, slug: 'ragazzi-nu', parent: 78, name: 'Ragazzi-Nu' },
  { id: 106, slug: 'junior-nu', parent: 78, name: 'Junior-Nu' },
  { id: 81, slug: 'salvamento', parent: 0, name: 'Salvamento' },
  { id: 95, slug: 'comunicati-sa', parent: 81, name: 'Comunicati-Sa' },
  { id: 111, slug: 'eventi-salvamento', parent: 81, name: 'Eventi-Sa' },
  { id: 120, slug: 'vetrina-sa', parent: 81, name: 'Vetrina-Sa' },
  { id: 147, slug: 'calendari-sa', parent: 81, name: 'Calendari-Sa' },
  { id: 85, slug: 'comitato', parent: 0, name: 'Comitato' },
  { id: 86, slug: 'primopiano', parent: 85, name: 'PrimoPiano' },
  { id: 87, slug: 'eventi', parent: 85, name: 'Eventi' },
  { id: 88, slug: 'sit', parent: 0, name: 'SIT' },
  { id: 169, slug: 'istruttore-nuoto', parent: 88, name: 'IstruttoreNuoto-Sit' },
  { id: 28, slug: 'propaganda', parent: 0, name: 'Propaganda' },
  { id: 96, slug: 'comunicati-pr', parent: 28, name: 'Comunicati-Pr' },
  { id: 79, slug: 'nuotoartistico', parent: 0, name: 'Nuoto Artistico' },
  { id: 94, slug: 'comunicati-na', parent: 79, name: 'Comunicati-Na' },
  { id: 68, slug: 'pallanuoto', parent: 0, name: 'Pallanuoto' },
  { id: 4, slug: 'comunicati-pn', parent: 68, name: 'Comunicati-Pn' },
];

const U = 'https://www.sito-esempio.it/wp-content/uploads/2026';

export const contenutoFinali = `
<p><a href="http://sito-esempio.it/wp-content/uploads/2014/10/ico-FIN.jpg"><img src="http://sito-esempio.it/wp-content/uploads/2014/10/ico-FIN.jpg" alt="ico-FIN" /></a></p>
<ul>
<li><a href="${U}/07/FcrCvlrisgar.pdf"><strong>FcrEC &#8211; Risultati Completi delle Gare</strong></a></li>
<li><a href="${U}/07/FcrCvl_clasocM.pdf"><strong>FcrEC &#8211; Classifiche di Società Maschili</strong></a></li>
<li><a href="${U}/07/FcrCvl_RJC_elstaffAmmesse.pdf">FcrEC &#8211; Elenco Staffette Ammesse</a></li>
<li><a href="${U}/07/FcrCvl_RJCelstaffiscr_.pdf">FcrEC &#8211; Elenco Staffette Iscritte</a></li>
</ul>
<p><strong>sarà disponibile la vasca da 33 per tutta la durata della manifestazione</strong></p>
<ul>
<li><a href="${U}/07/comun198_.pdf"><strong>comun198- FcrEC &#8211; Orari Prime Serie</strong></a></li>
<li><a href="${U}/07/comun197__.pdf">comun197 AGGIORNATO- FcrEC &#8211; Orari Serie Successive</a></li>
<li><a href="${U}/07/FcrCvl_RJC_elammessi.pdf"><strong>FcrEC &#8211;</strong> <strong>Elenco Atleti AMMESSI</strong> <strong>alle</strong> <strong>Gare AGGIORNATO</strong></a></li>
<li><a href="${U}/07/FcrCvl_RJCeliscrXsocCOMPLETO.pdf">FcrEC &#8211; Elenco Iscritti per Società da tagliare</a></li>
<li><a href="${U}/06/comun197.pdf">comun197- FcrEC &#8211; Orari Serie Successive</a></li>
<li><a href="${U}/06/comun186.pdf"><strong>comun186-Finali Campionato Regionale Estivo di Categoria vl &#8211; Regolamento</strong></a></li>
<li><a href="https://www.sito-esempio.it/wp-content/uploads/2026/06/comun186.pdf">doppione dello stesso file</a></li>
</ul>`;

export function postGrezzo({
  id, titolo, categorie: cat, contenuto = '', modificato = '2026-07-19T10:00:00', data = '2026-06-20T10:00:00',
}) {
  return {
    id,
    date_gmt: data,
    modified_gmt: modificato,
    title: { rendered: titolo },
    link: `https://www.sito-esempio.it/post-${id}/`,
    categories: cat,
    content: { rendered: contenuto },
  };
}

export const finali = postGrezzo({
  id: 350001,
  titolo: 'NUOTO &#8211; Finali Campionato Regionale Estivo di Categoria 2026 vl',
  categorie: [78, 83, 91, 105, 106],
  contenuto: contenutoFinali,
});

export const salvamento = postGrezzo({
  id: 354017,
  titolo: 'SALVAMENTO: Bozza Calendario Nuoto per Salvamento 2026/2027 parte 1',
  categorie: [147, 85, 95, 87, 111, 81, 120],
  contenuto: `<p><span style="color: #0000ff"><strong><a style="color: #0000ff" href="${U}/10/Bozza-Calendario-Salvamento-1-parte-26_27.pdf">Bozza Calendario Salvamento 1 parte 26_27</a></strong></span></p>`,
  modificato: '2026-10-14T07:52:26',
  data: '2026-10-14T07:50:25',
});

export const chiusura = postGrezzo({
  id: 354010,
  titolo: 'Chiusura Uffici Comitato Regionale Lazio FIN &#8211; 14 Ottobre 2026',
  categorie: [85, 86],
  contenuto: '<p>Si comunica che mercoledì 14 ottobre p.v. gli uffici resteranno chiusi.</p>',
  modificato: '2026-10-13T09:00:00',
  data: '2026-10-13T09:00:00',
});

export const corsoSit = postGrezzo({
  id: 354025,
  titolo: 'Corso &#8220;Istruttore&#8221; 2026/2027 &#8211; organizzato dalla SNF Nautilus Roma',
  categorie: [169, 88],
  contenuto: `<p><a href="${U}/10/Corso-SNF-Nautilus-Roma.pdf">Corso SNF Nautilus Roma</a></p>`,
  modificato: '2026-10-14T12:11:28',
  data: '2026-10-14T12:11:28',
});

export const esordienti = postGrezzo({
  id: 352000,
  titolo: 'NUOTO: Campionati Regionali Estivi Es/B &#8211; Es/A &#8211; Risultati Finali',
  categorie: [78, 83, 103, 104],
  contenuto: `<p><a href="${U}/06/EsAB_risultati.pdf">Risultati completi</a></p>`,
  modificato: '2026-06-30T18:00:00',
  data: '2026-06-10T18:00:00',
});

export const assoluto = postGrezzo({
  id: 353900,
  titolo: 'NUOTO &#8211; Campionato Regionale Assoluto in vasca corta',
  categorie: [78, 83, 91],
  contenuto: `<p><a href="${U}/10/comun29.pdf">comun29 &#8211; Regolamento</a></p>`,
  modificato: '2026-10-12T15:00:00',
  data: '2026-10-12T15:00:00',
});

export const riunione = postGrezzo({
  id: 353800,
  titolo: 'Riunione Settore Nuoto 2026/2027',
  categorie: [78, 83],
  contenuto: `<p><a href="${U}/09/riunione-nuoto.pdf">Convocazione riunione</a></p>`,
  modificato: '2026-09-28T15:00:00',
  data: '2026-09-28T15:00:00',
});

export const artisticoPropaganda = postGrezzo({
  id: 354014,
  titolo: 'Nuoto Artistico Propaganda &#8211; Obbligatori Giovanissime &#8211; ES/B 2026/2027',
  categorie: [79, 94],
  contenuto: `<p><a href="${U}/10/obbligatori.pdf">Obbligatori Giovanissime ES/B</a></p>`,
  modificato: '2026-10-13T11:00:00',
  data: '2026-10-13T11:00:00',
});
