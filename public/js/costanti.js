// Stesse chiavi usate dal controllore (controller/src/config.js).

export const SETTORI = [
  { id: 'nuoto', nome: 'Nuoto' },
  { id: 'pallanuoto', nome: 'Pallanuoto' },
  { id: 'artistico', nome: 'Nuoto artistico' },
  { id: 'tuffi', nome: 'Tuffi' },
  { id: 'salvamento', nome: 'Salvamento' },
  { id: 'fondo', nome: 'Fondo' },
  { id: 'master', nome: 'Master' },
  { id: 'propaganda', nome: 'Propaganda' },
  { id: 'sit', nome: 'Corsi di formazione' },
  { id: 'comitato', nome: 'Comunicazioni del Comitato' },
];

export const GRUPPI = [
  { id: 'categoria', nome: 'Categoria', dettaglio: 'Ragazzi, Junior, Cadetti, Senior' },
  { id: 'esordienti', nome: 'Esordienti', dettaglio: 'Esordienti A e B' },
];

export const TIPI = [
  { id: 'ammessi', nome: 'Ammessi' },
  { id: 'startlist', nome: 'Start list e programma' },
  { id: 'orari', nome: 'Orari' },
  { id: 'risultati', nome: 'Risultati' },
  { id: 'classifiche', nome: 'Classifiche' },
  { id: 'iscritti', nome: 'Iscritti' },
  { id: 'comunicati', nome: 'Comunicati e regolamenti' },
  { id: 'calendari', nome: 'Calendari' },
  { id: 'altro', nome: 'Altro' },
];

export const NOME_SETTORE = Object.fromEntries(SETTORI.map((s) => [s.id, s.nome]));
export const NOME_TIPO = Object.fromEntries(TIPI.map((t) => [t.id, t.nome]));

// Etichette brevi per le targhette dei file.
export const TIPO_BREVE = {
  ammessi: 'Ammessi',
  startlist: 'Start list',
  orari: 'Orari',
  risultati: 'Risultati',
  classifiche: 'Classifiche',
  iscritti: 'Iscritti',
  comunicati: 'Comunicato',
  calendari: 'Calendario',
  altro: 'Documento',
};

// Per quanti giorni un file o un post resta segnato come nuovo.
export const GIORNI_NOVITA = 7;

export const AVVISO_NON_UFFICIALE = 'Nuotifica è un servizio non ufficiale: non è collegato '
  + 'alla Federazione Italiana Nuoto né al Comitato Regionale Lazio. Fa fede solo il sito finlazio.it.';
