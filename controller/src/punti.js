// Punti World Aquatics (gli ex "punti FINA"): P = 1000 × (B / T)³, troncato all'intero.
// B è il tempo base (record del mondo all'inizio del periodo), T il tempo nuotato, in secondi.
// Tabelle ufficiali, una per vasca e periodo. Quando ne esce una nuova si aggiunge qui sotto.

const TABELLE = [
  {
    vasca: 25, dal: '2025-09-01', al: '2026-08-31',
    M: {
      '50SL': 19.90, '100SL': 44.84, '200SL': 98.61, '400SL': 212.25, '800SL': 440.46, '1500SL': 846.88,
      '50DO': 22.11, '100DO': 48.33, '200DO': 105.63, '50RA': 24.95, '100RA': 55.28, '200RA': 120.16,
      '50FA': 21.32, '100FA': 47.71, '200FA': 106.85, '100MI': 49.28, '200MI': 108.88, '400MI': 234.81,
    },
    F: {
      '50SL': 22.83, '100SL': 50.25, '200SL': 110.31, '400SL': 230.25, '800SL': 477.42, '1500SL': 908.24,
      '50DO': 25.23, '100DO': 54.02, '200DO': 118.04, '50RA': 28.37, '100RA': 62.36, '200RA': 132.50,
      '50FA': 23.94, '100FA': 52.71, '200FA': 119.32, '100MI': 55.11, '200MI': 121.63, '400MI': 255.48,
    },
  },
  {
    vasca: 25, dal: '2026-09-01', al: '2027-08-31',
    M: {
      '50SL': 19.90, '100SL': 44.84, '200SL': 98.61, '400SL': 212.25, '800SL': 440.46, '1500SL': 846.88,
      '50DO': 22.11, '100DO': 48.16, '200DO': 105.12, '50RA': 24.95, '100RA': 55.28, '200RA': 119.52,
      '50FA': 21.32, '100FA': 47.68, '200FA': 106.85, '100MI': 49.28, '200MI': 108.88, '400MI': 234.81,
    },
    F: {
      '50SL': 22.83, '100SL': 49.93, '200SL': 109.36, '400SL': 230.25, '800SL': 474.00, '1500SL': 908.24,
      '50DO': 25.23, '100DO': 54.02, '200DO': 117.33, '50RA': 28.37, '100RA': 62.36, '200RA': 132.50,
      '50FA': 23.72, '100FA': 52.71, '200FA': 119.32, '100MI': 55.11, '200MI': 121.63, '400MI': 255.48,
    },
  },
  {
    vasca: 50, dal: '2026-01-01', al: '2026-12-31',
    M: {
      '50SL': 20.91, '100SL': 46.40, '200SL': 102.00, '400SL': 219.96, '800SL': 452.12, '1500SL': 870.67,
      '50DO': 23.55, '100DO': 51.60, '200DO': 111.92, '50RA': 25.95, '100RA': 56.88, '200RA': 125.48,
      '50FA': 22.27, '100FA': 49.45, '200FA': 110.34, '200MI': 112.69, '400MI': 242.50,
    },
    F: {
      '50SL': 23.61, '100SL': 51.71, '200SL': 112.23, '400SL': 234.18, '800SL': 484.12, '1500SL': 920.48,
      '50DO': 26.86, '100DO': 57.13, '200DO': 123.14, '50RA': 29.16, '100RA': 64.13, '200RA': 137.55,
      '50FA': 24.43, '100FA': 54.60, '200FA': 121.81, '200MI': 125.70, '400MI': 263.65,
    },
  },
];

/** La tabella giusta per vasca e data; fuori dai periodi noti si usa la più vicina. */
export function tabella(vasca, data) {
  const stesse = TABELLE.filter((t) => t.vasca === vasca);
  if (!stesse.length) return null;
  const giorno = (data ?? '').slice(0, 10);
  return stesse.find((t) => giorno >= t.dal && giorno <= t.al)
    ?? (giorno < stesse[0].dal ? stesse[0] : stesse[stesse.length - 1]);
}

/** Punti di un tempo. Null per staffette, gare senza tempo base o tempi non validi. */
export function punti(ms, codice, sesso, vasca, data) {
  if (!ms || ms <= 0 || !codice || codice.includes('x')) return null;
  const t = tabella(vasca, data);
  const base = t?.[sesso === 'F' ? 'F' : 'M']?.[codice];
  if (!base) return null;
  return Math.floor(1000 * (base / (ms / 1000)) ** 3);
}
