// Copia di public/js/categorie.js (tenere uguali).
// Categorie FIN per età (anno di fine stagione meno anno di nascita).
// Le regole cambiano ogni tanto: dalla stagione indicata valgono quelle, finché non ne arriva una nuova.
// L'admin le può correggere dall'app (documento meta/categorie): qui ci sono quelle di partenza.
// Questo file è usato sia dall'app sia dal controllore: niente dipendenze.

export const REGOLE_BASE = {
  // fino alla stagione 2024/25
  2000: {
    M: [['Esordienti B', 9, 10], ['Esordienti A', 11, 12], ['Ragazzi', 13, 14], ['Juniores', 15, 16], ['Cadetti', 17, 18], ['Seniores', 19, 99]],
    F: [['Esordienti B', 8, 9], ['Esordienti A', 10, 11], ['Ragazzi', 12, 13], ['Juniores', 14, 15], ['Cadetti', 16, 17], ['Seniores', 18, 99]],
  },
  // dalla stagione 2025/26
  2025: {
    M: [['Esordienti B', 10, 11], ['Esordienti A', 12, 13], ['Ragazzi', 14, 16], ['Juniores', 17, 18], ['Cadetti', 19, 20], ['Seniores', 21, 99]],
    F: [['Esordienti B', 9, 10], ['Esordienti A', 11, 12], ['Ragazzi', 13, 14], ['Juniores', 15, 16], ['Cadetti', 17, 18], ['Seniores', 19, 99]],
  },
};

export const NOMI_CATEGORIE = ['Esordienti B', 'Esordienti A', 'Ragazzi', 'Juniores', 'Cadetti', 'Seniores'];

/** Stagione agonistica di una data: da settembre ad agosto ("2026" = 2026/27). */
export function stagioneDi(data = '') {
  const anno = Number(String(data).slice(0, 4));
  const mese = Number(String(data).slice(5, 7));
  return mese >= 9 ? anno : anno - 1;
}

/** Le regole in vigore in una stagione. */
export function regoleDi(stagione, regole = REGOLE_BASE) {
  const anni = Object.keys(regole).map(Number).filter((a) => a <= Number(stagione)).sort((a, b) => b - a);
  return regole[anni[0]] ?? REGOLE_BASE[2000];
}

/** Categoria di un atleta in una stagione (null se troppo giovane o anno sconosciuto). */
export function categoria(anno, sesso, stagione, regole = REGOLE_BASE) {
  if (!anno || !sesso) return null;
  const eta = Number(stagione) + 1 - Number(anno);
  const elenco = regoleDi(stagione, regole)[sesso === 'F' ? 'F' : 'M'] ?? [];
  return elenco.find(([, da, a]) => eta >= da && eta <= a)?.[0] ?? null;
}

export const eEsordiente = (anno, sesso, stagione, regole) => /^esordienti/i.test(categoria(anno, sesso, stagione, regole) ?? '');

/** Testo delle regole per l'admin: una riga per stagione, sesso e categoria ("2025 M Ragazzi 14-16"). */
export function regoleInTesto(regole = REGOLE_BASE) {
  const righe = [];
  for (const [st, perSesso] of Object.entries(regole).sort((a, b) => a[0] - b[0])) {
    for (const sx of ['M', 'F']) for (const [nome, da, a] of perSesso[sx] ?? []) righe.push(`${st} ${sx} ${nome} ${da}-${a}`);
  }
  return righe.join('\n');
}

/** Il contrario: dal testo dell'admin alle regole. Le righe sbagliate si segnalano. */
export function regoleDaTesto(testo = '') {
  const regole = {};
  const errori = [];
  for (const [i, riga] of testo.split('\n').entries()) {
    const t = riga.trim();
    if (!t) continue;
    const m = t.match(/^(\d{4})\s+([MF])\s+(.+?)\s+(\d{1,2})\s*-\s*(\d{1,2})$/i);
    if (!m) {
      errori.push(`Riga ${i + 1}: "${t}"`);
      continue;
    }
    const [, st, sx, nome, da, a] = m;
    regole[st] ??= { M: [], F: [] };
    regole[st][sx.toUpperCase()].push([nome.trim(), Number(da), Number(a)]);
  }
  return { regole, errori };
}
