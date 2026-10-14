// Costanti condivise dal controllore.

export const WP_BASE = 'https://www.finlazio.it/wp-json/wp/v2';
export const USER_AGENT =
  'Nuotifica/1.0 (servizio non ufficiale di avvisi; controllo ogni 15 minuti)';

// Settori che l'utente può scegliere. Le chiavi sono quelle salvate su Firestore.
export const SETTORI = {
  nuoto: 'Nuoto',
  pallanuoto: 'Pallanuoto',
  artistico: 'Nuoto artistico',
  tuffi: 'Tuffi',
  salvamento: 'Salvamento',
  fondo: 'Fondo',
  master: 'Master',
  propaganda: 'Propaganda',
  sit: 'Corsi di formazione (SIT)',
  comitato: 'Comunicazioni del Comitato',
};

// Slug della categoria "radice" su WordPress -> settore.
// Tutto ciò che non è qui (Comitato, Notiziari, Flash News, Senza categoria…) va in "comitato".
export const SLUG_SETTORE = {
  nuoto: 'nuoto',
  pallanuoto: 'pallanuoto',
  nuotoartistico: 'artistico',
  tuffi: 'tuffi',
  salvamento: 'salvamento',
  fondo: 'fondo',
  master: 'master',
  propaganda: 'propaganda',
  sit: 'sit',
};

// Gruppi del nuoto.
export const GRUPPI = {
  categoria: 'Categoria (Ragazzi, Junior, Cadetti, Senior)',
  esordienti: 'Esordienti (A e B)',
};

export const SLUG_GRUPPO = {
  'esordienti-a-nu': 'esordienti',
  'esordienti-b-nu': 'esordienti',
  'ragazzi-nu': 'categoria',
  'junior-nu': 'categoria',
  'cadetti-nu': 'categoria',
  'senior-nu': 'categoria',
};

// Tipi di documento, nell'ordine in cui vengono riconosciuti:
// il primo che corrisponde vince (es. "comun197 – Orari Serie" è un orario, non un comunicato).
export const TIPI = [
  { id: 'classifiche', nome: 'Classifiche', re: /classific|clasoc|graduatori|ranking/i },
  { id: 'risultati', nome: 'Risultati', re: /risultat|risgar|results|resoconto/i },
  { id: 'ammessi', nome: 'Ammessi', re: /ammess|qualificat/i },
  { id: 'iscritti', nome: 'Iscritti', re: /iscritt|eliscr/i },
  { id: 'orari', nome: 'Orari', re: /orari|timing/i },
  { id: 'startlist', nome: 'Start list e programma', re: /start\s*-?\s*list|startlist|batterie|programma|sequenza/i },
  { id: 'calendari', nome: 'Calendari', re: /calendari/i },
  { id: 'comunicati', nome: 'Comunicati e regolamenti', re: /comun\s*\d|comunicat|regolament|circolar|notiziari|bando|norme|informativ|iscrizion|convoca/i },
];
export const TIPO_ALTRO = { id: 'altro', nome: 'Altro' };
export const TIPO_AVVISO = { id: 'comunicati', nome: 'Comunicati e regolamenti' };

export const NOMI_TIPI = Object.fromEntries(
  [...TIPI, TIPO_ALTRO].map((t) => [t.id, t.nome]),
);

export const RE_AGGIORNATO = /aggiornat|rettific|corrett|variazion|sostituisc|nuova versione/i;

// Quanti post leggere per pagina e al massimo quante pagine per giro.
export const PER_PAGINA = 25;
export const MAX_PAGINE = 4;
// Al primo avvio si memorizza lo stato attuale senza mandare notifiche.
export const POST_INIZIALI = 100;
// L'indice tiene traccia dei post modificati negli ultimi N giorni.
export const GIORNI_INDICE = 240;
// Oltre questo numero di post cambiati nello stesso giro, si manda un'unica notifica riassuntiva.
export const MAX_PUSH_PER_GIRO = 4;
