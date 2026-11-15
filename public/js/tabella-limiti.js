// Tempi limite da un file (CSV dal foglio di calcolo, oppure Excel .xlsx) o da testo incollato.
// Due modi di scriverli, riconosciuti da soli:
//   per colonne:  Gara;Sesso;R14;R1;R2;J1;J2;Cadetti        (una riga per gara e sesso)
//   per righe:    Gara;Sesso;Categoria;Tempo                (una riga per tempo)
import { leggiTempo } from './viste-classifiche.js';

const STILI = [
  [/stile|libero|\bsl\b|free/i, 'SL'], [/dorso|\bdo\b|back/i, 'DO'], [/rana|\bra\b|breast/i, 'RA'],
  [/farfalla|delfino|\bfa\b|butter|fly/i, 'FA'], [/misti|\bmi\b|medley|\bim\b/i, 'MI'],
];
const GARE_VALIDE = new Set(['50SL', '100SL', '200SL', '400SL', '800SL', '1500SL', '50DO', '100DO', '200DO', '50RA', '100RA', '200RA',
  '50FA', '100FA', '200FA', '100MI', '200MI', '400MI']);

/** "100 Stile Libero", "100SL", "100 sl" -> "100SL" (o null). */
export function codiceGara(testo = '') {
  const t = String(testo).trim();
  const compatto = t.toUpperCase().replace(/\s+/g, '');
  if (GARE_VALIDE.has(compatto)) return compatto;
  const dist = t.match(/\d{2,4}/)?.[0];
  const stile = STILI.find(([re]) => re.test(t.replace(/^\s*\d+\s*(?:(?:m|mt|metri)\b\.?)?\s*/i, ' ')))?.[1];
  const codice = dist && stile ? `${dist}${stile}` : null;
  return GARE_VALIDE.has(codice) ? codice : null;
}

export function codiceSesso(testo = '') {
  const t = String(testo).trim().toLowerCase();
  if (/^(m|maschi|maschile|uomini|u)$/.test(t)) return 'M';
  if (/^(f|femmine|femminile|donne|d)$/.test(t)) return 'F';
  return null;
}

/** "Ragazze R1", "R14", "Cadetti", "Juniores J2", "Tutti" -> codice (o null). */
export function codiceCategoria(testo = '') {
  const t = String(testo).trim().toUpperCase().replace(/\s+/g, ' ');
  if (!t) return null;
  const anno = t.match(/\b(R14|R1|R2|J1|J2)\b/)?.[1];
  if (anno) return anno;
  if (/^(TUTTI|TUTTE|ASSOLUTI|ASSOLUTE|\*|ASS)$/.test(t)) return '*';
  if (/ESORDIENTI\s*A|^EA$|ES\.?\s*A$/.test(t)) return 'EA';
  if (/ESORDIENTI\s*B|^EB$|ES\.?\s*B$/.test(t)) return 'EB';
  if (/^(RAGAZZ[IE]|R)$/.test(t)) return 'R';
  if (/^(JUNIORES|JUNIOR|J)$/.test(t)) return 'J';
  if (/^(CADETT[IE]|C)$/.test(t)) return 'C';
  if (/^(SENIORES|SENIOR|S)$/.test(t)) return 'S';
  return null;
}

/** Testo CSV (separato da ; , o tab) -> righe di celle. */
export function righeDaTesto(testo = '') {
  const linee = testo.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  const sep = [';', '\t', ','].find((x) => linee.some((l) => l.includes(x))) ?? ';';
  return linee.map((l) => l.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1')));
}

/** Righe di celle -> { t: { "gara|sesso|categoria": ms }, errori: [...] }. */
export function leggiTabellaLimiti(righe) {
  const t = {};
  const errori = [];
  if (!righe.length) return { t, errori: ['Il file è vuoto.'] };
  const intestazione = righe[0];
  const colonneCat = intestazione.slice(2).map(codiceCategoria);
  const perColonne = colonneCat.length > 0 && colonneCat.filter(Boolean).length >= 1 && !codiceGara(intestazione[0]);
  const corpo = codiceGara(intestazione[0]) ? righe : righe.slice(1);
  for (const [i, r] of corpo.entries()) {
    const numero = i + (corpo === righe ? 1 : 2);
    const gara = codiceGara(r[0]);
    const sesso = codiceSesso(r[1]);
    if (!gara || !sesso) {
      if (r.some((c) => c)) errori.push(`riga ${numero}: gara o sesso non riconosciuti`);
      continue;
    }
    if (perColonne) {
      colonneCat.forEach((cat, j) => {
        const cella = r[j + 2];
        if (!cat || !cella) return;
        const ms = leggiTempo(cella);
        if (ms) t[`${gara}|${sesso}|${cat}`] = ms;
        else errori.push(`riga ${numero}: tempo "${cella}" non valido`);
      });
    } else {
      const cat = codiceCategoria(r[2]);
      const ms = leggiTempo(r[3]);
      if (cat && ms) t[`${gara}|${sesso}|${cat}`] = ms;
      else errori.push(`riga ${numero}: categoria o tempo non validi`);
    }
  }
  return { t, errori };
}

/** Un file scelto dall'admin: CSV/testo, oppure Excel (la libreria si carica solo in quel caso). */
export async function leggiFileLimiti(file) {
  if (/\.xlsx?$/i.test(file.name)) {
    if (!window.XLSX) {
      await new Promise((ok, ko) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload = ok;
        s.onerror = () => ko(new Error('Non riesco a leggere i file Excel adesso: salvalo come CSV e riprova.'));
        document.head.appendChild(s);
      });
    }
    const libro = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const foglio = libro.Sheets[libro.SheetNames[0]];
    const righe = window.XLSX.utils.sheet_to_json(foglio, { header: 1, raw: false, defval: '' })
      .map((r) => r.map((c) => String(c).trim())).filter((r) => r.some(Boolean));
    return leggiTabellaLimiti(righe);
  }
  return leggiTabellaLimiti(righeDaTesto(await file.text()));
}

/** Il modello da scaricare: si apre con Excel o Fogli Google, si compila e si ricarica. */
export function modelloCsv() {
  const gare = ['50SL', '100SL', '200SL', '400SL', '800SL', '1500SL', '50DO', '100DO', '200DO', '50RA', '100RA', '200RA',
    '50FA', '100FA', '200FA', '100MI', '200MI', '400MI'];
  const righe = [
    '# Modello tempi limite di Cloro: una riga per gara e sesso, una colonna per categoria.',
    '# Tempi come 58.50, 1.02.45 o 1\'02"45. Lascia vuote le caselle senza limite. Le righe che iniziano con # si ignorano.',
    '# Colonne possibili: R14, R1, R2, J1, J2, Cadetti (o Cadette), Ragazzi, Juniores, Esordienti A, Esordienti B, Seniores, Tutti.',
    'Gara;Sesso;R14;R1;R2;J1;J2;Cadetti',
    ...gare.map((g) => `${g};M;;;;;;`),
    ...gare.map((g) => `${g};F;;;;;;`),
  ];
  return `﻿${righe.join('\r\n')}\r\n`;
}
