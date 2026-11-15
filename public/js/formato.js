import { REGOLE_BASE, categoria as categoriaNome, stagioneDi as stagioneNumero } from './categorie.js';
// Formati: tempi, gare, date. Stesse regole del controllore (controller/src/tempi.js).

/** Millisecondi -> 2'05"40 (o 58"88). */
export function tempo(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const cent = Math.round(ms / 10);
  const minuti = Math.floor(cent / 6000);
  const secondi = Math.floor((cent % 6000) / 100);
  const c = String(cent % 100).padStart(2, '0');
  return minuti ? `${minuti}'${String(secondi).padStart(2, '0')}"${c}` : `${secondi}"${c}`;
}

/** Differenza con segno: −0"80 / +1"25. */
export function differenza(ms) {
  if (!Number.isFinite(ms) || ms === 0) return '';
  return `${ms < 0 ? '−' : '+'}${tempo(Math.abs(ms))}`;
}

const STILI = { SL: 'stile libero', DO: 'dorso', RA: 'rana', FA: 'farfalla', MI: 'misti' };

/** "200SL" -> "200 stile libero"; breve: "200 SL". */
export function nomeGara(codice = '', { breve = false } = {}) {
  const m = codice.match(/^(?:(\d)x)?(\d+)([A-Z]{2})$/);
  if (!m) return codice;
  const [, fraz, dist, stile] = m;
  const d = fraz ? `${fraz}x${dist}` : dist;
  return breve ? `${d} ${stile}` : `${d} ${STILI[stile] ?? stile}`;
}

/** Ordine naturale delle gare: per stile, poi per distanza. */
export function ordineGara(codice = '') {
  const stili = ['SL', 'DO', 'RA', 'FA', 'MI'];
  const staff = codice.includes('x') ? 1 : 0;
  const stile = stili.indexOf(codice.slice(-2));
  const dist = Number(codice.replace(/^\d+x/, '').match(/\d+/)?.[0] ?? 0);
  return staff * 1e6 + (stile < 0 ? 9 : stile) * 1e4 + dist;
}

const fmtGiorno = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' });
const fmtGiornoAnno = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtMese = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });
const fmtOra = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });
const fmtRel = new Intl.RelativeTimeFormat('it-IT', { numeric: 'auto' });

const data = (iso) => new Date(`${iso}T12:00:00`);
const pulisci = (t) => t.replace('.', '');

/** Data aaaa-mm-gg di oggi (ora italiana). */
export function oggi() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
}

export function piuGiorni(iso, giorni) {
  const d = data(iso);
  d.setDate(d.getDate() + giorni);
  return new Intl.DateTimeFormat('sv-SE').format(d);
}

/** "7–8 nov" / "31 ott – 1 nov" / "7 nov 2025" (anno solo se non è quello corrente). */
export function periodo(dal, al = dal) {
  if (!dal) return '';
  const annoOra = new Date().getFullYear();
  const f = (iso) => pulisci((Number(iso.slice(0, 4)) === annoOra ? fmtGiorno : fmtGiornoAnno).format(data(iso)));
  if (!al || al === dal) return f(dal);
  if (dal.slice(0, 7) === al.slice(0, 7)) return `${Number(dal.slice(8))}–${f(al)}`;
  return `${f(dal)} – ${f(al)}`;
}

export function giorno(iso) {
  return iso ? pulisci((Number(iso.slice(0, 4)) === new Date().getFullYear() ? fmtGiorno : fmtGiornoAnno).format(data(iso))) : '';
}

export function mese(iso) {
  const t = fmtMese.format(data(iso));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Tempo trascorso: "adesso", "12 minuti fa", "oggi, 14:32", "ieri, 09:10", "12 ott, 18:00". */
export function quando(d) {
  if (!d) return '';
  const minuti = Math.round((Date.now() - d.getTime()) / 60_000);
  if (minuti < 1) return 'adesso';
  if (minuti < 60) return fmtRel.format(-minuti, 'minute');
  const ieri = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === new Date().toDateString()) return `oggi, ${fmtOra.format(d)}`;
  if (d.toDateString() === ieri.toDateString()) return `ieri, ${fmtOra.format(d)}`;
  return `${pulisci(fmtGiorno.format(d))}, ${fmtOra.format(d)}`;
}

/** La gara è in corso oggi (o è finita da poco)? */
export function inCorso(gara) {
  const o = oggi();
  return Boolean(gara?.dal && gara.dal <= o && o <= (gara.al ?? gara.dal));
}

/** Iniziali per l'avatar: "Luca Ferri" -> "LF". */
export function iniziali(nome = '') {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

/** Velocità media in km/h. */
export function velocita(metri, ms) {
  if (!metri || !ms) return '';
  return `${((metri / 1000) / (ms / 3_600_000)).toFixed(1).replace('.', ',')} km/h`;
}

/** Distanza in metri di una gara: "200SL" -> 200, "4x50SL" -> 200. */
export function metri(codice = '') {
  const m = codice.match(/^(?:(\d)x)?(\d+)/);
  return m ? Number(m[2]) * Number(m[1] ?? 1) : 0;
}

/* ---------- categorie FIN (età = anno di fine stagione − anno di nascita) ---------- */
// Le regole stanno in categorie.js (le stesse del controllore); l'admin le può correggere
// (config/categorie): l'app le carica all'avvio in stato.regoleCategorie.

const CODICI = {
  'Esordienti B': 'EB', 'Esordienti A': 'EA', Ragazzi: 'R', Juniores: 'J', Cadetti: 'C', Seniores: 'S',
};
export const NOMI_CATEGORIE = Object.fromEntries(Object.entries(CODICI).map(([n, c]) => [c, n]));
let regoleAttuali = REGOLE_BASE;
export function impostaRegoleCategorie(regole) {
  regoleAttuali = regole && Object.keys(regole).length ? regole : REGOLE_BASE;
}
export const regoleCategorie = () => regoleAttuali;

/** Categoria di un atleta in una stagione ("2026" = 2026/27): EB, EA, R, J, C, S (o null se più piccolo). */
export function categoria(anno, sesso, stagione) {
  const nome = categoriaNome(anno, sesso, stagione, regoleAttuali);
  return nome ? (CODICI[nome] ?? nome) : null;
}

/** "esordienti" (EB, EA) o "categoria" (Ragazzi e oltre). */
export const gruppoCategoria = (c) => (c === 'EB' || c === 'EA' ? 'esordienti' : c ? 'categoria' : null);

/** Stagione di una data ("2026-11-15" -> "2026"). */
export const stagioneDi = (data = '') => String(stagioneNumero(data));

/** Stagione in corso. */
export const stagioneCorrente = () => stagioneDi(new Date().toISOString().slice(0, 10));
export const nomeStagione = (st) => `${st}/${String(Number(st) + 1).slice(2)}`;
