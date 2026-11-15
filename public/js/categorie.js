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

export const CODICI_CATEGORIA = {
  'Esordienti B': 'EB', 'Esordienti A': 'EA', Ragazzi: 'R', Juniores: 'J', Cadetti: 'C', Seniores: 'S',
};
const NOME_DA_CODICE = Object.fromEntries(Object.entries(CODICI_CATEGORIA).map(([n, c]) => [c, n]));

/** Età (da, a) di un codice: categoria (EB, EA, R, J, C, S) o anno dentro la categoria (R14, R1, R2, J1, J2). */
export function etaCodice(codice, sesso, stagione, regole = REGOLE_BASE) {
  const elenco = regoleDi(stagione, regole)[sesso === 'F' ? 'F' : 'M'] ?? [];
  if (NOME_DA_CODICE[codice]) {
    const r = elenco.find(([n]) => n === NOME_DA_CODICE[codice]);
    return r ? { da: r[1], a: r[2] } : null;
  }
  const m = String(codice).match(/^([RJ])(14|1|2)$/);
  if (!m) return null;
  const r = elenco.find(([n]) => n === (m[1] === 'R' ? 'Ragazzi' : 'Juniores'));
  if (!r) return null;
  // Ragazzi su tre anni (maschi dal 2025/26): R14, R1, R2. Su due anni: R1, R2. Juniores: J1, J2.
  const treAnni = m[1] === 'R' && r[2] - r[1] + 1 >= 3;
  let i;
  if (treAnni) i = { 14: 0, 1: 1, 2: 2 }[m[2]];
  else if (m[2] === '14') return null;
  else i = Number(m[2]) - 1;
  const eta = r[1] + i;
  return eta <= r[2] ? { da: eta, a: eta } : null;
}

/** Anni di nascita di un codice in una stagione. */
export function anniCodice(codice, sesso, stagione, regole = REGOLE_BASE) {
  const e = etaCodice(codice, sesso, stagione, regole);
  return e ? { dal: Number(stagione) + 1 - e.a, al: Number(stagione) + 1 - e.da } : null;
}

/** Codici di un atleta in una stagione: categoria e (per Ragazzi e Juniores) anno, es. ['R', 'R14']. */
export function codiciAtleta(anno, sesso, stagione, regole = REGOLE_BASE) {
  const nome = categoria(anno, sesso, stagione, regole);
  if (!nome) return [];
  const codici = [CODICI_CATEGORIA[nome]];
  for (const sub of ['R14', 'R1', 'R2', 'J1', 'J2']) {
    if (sub[0] !== codici[0]) continue;
    const e = etaCodice(sub, sesso, stagione, regole);
    if (e && Number(stagione) + 1 - Number(anno) === e.da) codici.push(sub);
  }
  return codici;
}

/** Nome da mostrare per un codice ("Ragazze R1", "Cadetti"…). */
export function nomeCodice(codice, sesso) {
  const f = sesso === 'F';
  return {
    EB: 'Esordienti B', EA: 'Esordienti A', R: f ? 'Ragazze' : 'Ragazzi', R14: 'Ragazzi R14', R1: f ? 'Ragazze R1' : 'Ragazzi R1',
    R2: f ? 'Ragazze R2' : 'Ragazzi R2', J: 'Juniores', J1: 'Juniores J1', J2: 'Juniores J2', C: f ? 'Cadette' : 'Cadetti', S: 'Seniores',
    '*': 'Tutti',
  }[codice] ?? codice;
}

/** Codici possibili per un sesso, in ordine (per menu e tabelle). */
export const codiciPerSesso = (sesso) => (sesso === 'F'
  ? ['EB', 'EA', 'R', 'R1', 'R2', 'J', 'J1', 'J2', 'C', 'S']
  : ['EB', 'EA', 'R', 'R14', 'R1', 'R2', 'J', 'J1', 'J2', 'C', 'S']);

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
