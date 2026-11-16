// Indice annata: un tempo confrontato con i 10 migliori d'Italia nati nello stesso anno, nella stessa
// gara e vasca (100 = la loro media; sopra 100 = più veloce). Le medie le prepara il controllore per
// ogni stagione (Realtime Database, ann/s{stagione}): "media in ms|quanti".
import { api, conCache, memoria } from './nucleo.js';
import { tastoInfo } from './spiegazioni.js';

const ORE = 12;

/** Medie della stagione (dal telefono se lette da poco). */
export async function leggiAnnate(st) {
  const chiave = `annate-${st}`;
  const salvate = api.demo ? null : memoria(chiave);
  if (salvate && Date.now() - salvate.quando < ORE * 3_600_000) return salvate.annate;
  const annate = await conCache(`annate:${st}`, () => api.leggiAnnate(String(st)), { durata: 3_600_000 }).catch(() => null);
  if (annate && !api.demo) {
    try {
      memoria(chiave, { quando: Date.now(), annate });
    } catch { /* poco spazio */ }
  }
  return annate;
}

/**
 * Riferimento per un atleta: i 10 migliori della sua annata in questa stagione; a inizio stagione
 * (meno di 10 tempi) quelli che avevano la sua età la stagione scorsa.
 */
export function riferimento({
  c, v, sx, y,
}, annate, annatePrima) {
  if (!y) return null;
  const leggi = (tab, anno) => {
    const [m, n] = String(tab?.[`${v}|${c}|${sx}|${anno}`] ?? '').split('|').map(Number);
    return m ? { m, n } : null;
  };
  const ora = leggi(annate, y);
  if (ora?.n >= 10) return ora;
  const prima = leggi(annatePrima, Number(y) - 1);
  return prima ? { ...prima, prima: true } : ora;
}

/** L'indice (una cifra decimale), o null. */
export function indiceAnnata(t, rif) {
  if (!t || !rif?.m) return null;
  return Math.round((1000 * rif.m) / t) / 10;
}

export const scriviIndice = (x) => (x == null ? '' : x.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

/** Le due tabelle che servono per una stagione (questa e la precedente). */
export async function annateDi(st) {
  const [ora, prima] = await Promise.all([leggiAnnate(st), leggiAnnate(Number(st) - 1)]);
  return { ora, prima };
}

/** Aggiunge l'Indice annata alla scheda aperta di un tempo (se ci sono i dati). */
export async function riempiAnnata(el, {
  t, c, v, sx, y, st,
}) {
  const scheda = el.querySelector('.dettaglio') ?? el;
  if (!t || !y || !v || !['M', 'F'].includes(sx)) return;
  const { ora, prima } = await annateDi(st);
  const rif = riferimento({
    c, v, sx, y,
  }, ora, prima);
  const indice = indiceAnnata(t, rif);
  if (indice == null || !scheda.isConnected) return;
  const riga = document.createElement('p');
  riga.className = 'riga-annata';
  riga.innerHTML = `<b>${scriviIndice(indice)}</b> <span>indice annata</span>${tastoInfo('annata', 'Come funziona l\'Indice annata')}<small>100 = media dei 10 migliori d'Italia ${rif.prima ? 'della stessa età nella stagione scorsa' : `nati nel ${Number(y)}`}${!rif.prima && rif.n < 10 ? ` (${rif.n} tempi finora)` : ''}</small>`;
  const dove = scheda.querySelector('[data-posizioni]');
  if (dove) dove.before(riga);
  else scheda.append(riga);
}
