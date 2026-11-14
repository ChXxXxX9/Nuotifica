// Tempi, gare e nomi: le piccole conversioni usate da tutte le fonti.
import { createHash } from 'node:crypto';

const STILI = [
  { re: /stile\s*libero|freestyle|\bsl\b/i, codice: 'SL', nome: 'stile libero', breve: 'SL' },
  { re: /dorso|backstroke|\bdo\b/i, codice: 'DO', nome: 'dorso', breve: 'DO' },
  { re: /rana|breaststroke|\bra\b/i, codice: 'RA', nome: 'rana', breve: 'RA' },
  { re: /farfalla|delfino|butterfly|\bfa\b/i, codice: 'FA', nome: 'farfalla', breve: 'FA' },
  { re: /misti|mista|medley|\bmi\b/i, codice: 'MI', nome: 'misti', breve: 'MI' },
];

/** "2'05.40", "2'05\"40", "1:02.45", "58.88" -> millisecondi. Altrimenti null (es. "ASS", "SQ"). */
export function inMs(testo) {
  if (testo === null || testo === undefined) return null;
  const t = String(testo).trim().replace(/\s+/g, '').replace(/[’′]/g, "'").replace(/[″“”]/g, '"');
  const m = t.match(/^(?:(\d{1,2})[':])?(\d{1,2})[."',](\d{1,2})$/);
  if (!m) return null;
  const minuti = Number(m[1] ?? 0);
  const secondi = Number(m[2]);
  const centesimi = Number(m[3].padEnd(2, '0'));
  if (secondi >= 60 && m[1] !== undefined) return null;
  const ms = (minuti * 60 + secondi) * 1000 + centesimi * 10;
  return ms > 0 ? ms : null;
}

/** Millisecondi -> 2'05"40 (o 58"88). */
export function formatta(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const cent = Math.round(ms / 10);
  const minuti = Math.floor(cent / 6000);
  const secondi = Math.floor((cent % 6000) / 100);
  const c = String(cent % 100).padStart(2, '0');
  return minuti ? `${minuti}'${String(secondi).padStart(2, '0')}"${c}` : `${secondi}"${c}`;
}

/** "200 m Stile Libero", "50 Stile Libero", "4x50 m Misti" -> descrizione della gara. */
export function leggiGara(testo = '') {
  const t = String(testo);
  const staffetta = /\d\s*x\s*\d/i.test(t);
  const dist = Number((staffetta ? t.match(/\d\s*x\s*(\d+)/i)?.[1] : t.match(/(\d{2,4})/)?.[1]) ?? 0);
  const stile = STILI.find((s) => s.re.test(t));
  if (!dist || !stile) return null;
  const frazioni = staffetta ? Number(t.match(/(\d)\s*x/i)[1]) : 1;
  const codice = staffetta ? `${frazioni}x${dist}${stile.codice}` : `${dist}${stile.codice}`;
  return {
    codice,
    dist: dist * frazioni,
    stile: stile.codice,
    staffetta,
    nome: staffetta ? `${frazioni}x${dist} ${stile.nome}` : `${dist} ${stile.nome}`,
    breve: staffetta ? `${frazioni}x${dist} ${stile.breve}` : `${dist} ${stile.breve}`,
  };
}

/** Ordine "naturale" delle gare: per stile, poi per distanza. */
export function ordineGara(codice = '') {
  const stili = ['SL', 'DO', 'RA', 'FA', 'MI'];
  const staff = codice.includes('x') ? 1 : 0;
  const stile = stili.indexOf(codice.slice(-2));
  const dist = Number(codice.replace(/^\d+x/, '').match(/\d+/)?.[0] ?? 0);
  return staff * 1e6 + (stile < 0 ? 9 : stile) * 1e4 + dist;
}

const MINUSCOLE = new Set(['di', 'de', 'da', 'del', 'della', 'dei', 'van', 'von']);

/** "DE ROSSI" -> "De Rossi", "D'ANGELO" -> "D'Angelo". */
export function nomeProprio(testo = '') {
  return String(testo).trim().toLowerCase().split(/\s+/).filter(Boolean)
    .map((p, i) => (i > 0 && MINUSCOLE.has(p) ? p : p.replace(/(^|[-'’])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())))
    .join(' ');
}

/** Testo -> "slug" senza accenti, per chiavi e documenti. */
export function slug(testo = '') {
  return String(testo)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Chiave stabile di un atleta: cognome, nome e anno di nascita. */
export function chiaveAtleta(cognome, nome, anno) {
  const base = slug(`${cognome} ${nome}`).slice(0, 60);
  return anno ? `${base}-${anno}` : base;
}

/** "ES/A FEMMINE 2016" -> "Esordienti A femmine 2016". */
export function nomeCategoria(testo = '') {
  const sostituzioni = [
    [/\bES\s*\/?\s*A\b/i, 'Esordienti A'],
    [/\bES\s*\/?\s*B\b/i, 'Esordienti B'],
    [/\bASS(OLUTI)?\b/i, 'Assoluti'],
    [/\bRAG(AZZI)?\b/i, 'Ragazzi'],
    [/\bJUN(IORES|IOR)?\b/i, 'Juniores'],
    [/\bCAD(ETTI)?\b/i, 'Cadetti'],
    [/\bSEN(IORES|IOR)?\b/i, 'Seniores'],
    [/\bFEMMINE\b/i, 'femmine'],
    [/\bMASCHI\b/i, 'maschi'],
    [/\bMISTI\b/i, 'misti'],
  ];
  let t = String(testo).trim().replace(/\s+/g, ' ');
  for (const [re, s] of sostituzioni) t = t.replace(re, s);
  // Le parole ancora tutte maiuscole diventano normali.
  t = t.replace(/\b[A-ZÀ-Ý]{3,}\b/g, (p) => p[0] + p.slice(1).toLowerCase());
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Data ISO (aaaa-mm-gg) di oggi a Roma. */
export function oggiRoma(adesso = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date(adesso));
}

/** Aggiunge giorni a una data aaaa-mm-gg. */
export function piuGiorni(data, giorni) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + giorni);
  return d.toISOString().slice(0, 10);
}

/** Impronta corta e stabile di un testo (per riconoscere i cambiamenti). */
export function impronta(testo) {
  return createHash('sha1').update(typeof testo === 'string' ? testo : JSON.stringify(testo)).digest('hex').slice(0, 16);
}
