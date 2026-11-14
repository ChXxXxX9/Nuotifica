// Indice di ricerca degli atleti e elenco dei "conosciuti", divisi in tanti documenti piccoli:
// l'app scarica solo il pezzo che le serve (le prime due lettere di una parola), quindi cerca al volo.
//
//   ricerca/{xx}   voci "chiave|nome|anno|società" degli atleti con una parola del nome che inizia per xx
//   noti/{x}       chiavi degli atleti già salvati, per iniziale della chiave
import { slug } from './tempi.js';

const senzaAccenti = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Le prime due lettere di ogni parola del nome (anche dei pezzi di "D'Angelo" o "Rossi-Bianchi"). */
export function prefissi(nome = '') {
  const parole = new Set();
  for (const parola of senzaAccenti(nome).split(/\s+/)) {
    const intera = parola.replace(/[^a-z]/g, '');
    if (intera.length >= 2) parole.add(intera);
    for (const pezzo of parola.split(/['’`-]+/)) {
      const p = pezzo.replace(/[^a-z]/g, '');
      if (p.length >= 2) parole.add(p);
    }
  }
  return [...new Set([...parole].map((p) => p.slice(0, 2)))];
}

export const vocePrefisso = (k, a) => `${k}|${a.n}|${a.y ?? ''}|${a.s ?? ''}`;

/** Operazioni (per db.commit) che aggiungono gli atleti all'indice. `atleti`: Map chiave -> {n, y, s}. */
export function scrittureRicerca(atleti) {
  const perPrefisso = new Map();
  for (const [k, a] of atleti) {
    for (const p of prefissi(a.n)) {
      if (!perPrefisso.has(p)) perPrefisso.set(p, []);
      perPrefisso.get(p).push(vocePrefisso(k, a));
    }
  }
  return [...perPrefisso].map(([p, voci]) => ({
    percorso: `ricerca/${p}`, dati: {}, maschera: [], aggiungi: { l: voci }, oraServer: ['agg'],
  }));
}

const iniziale = (k) => (/^[a-z]/.test(k) ? k[0] : '_');

/** Operazioni che segnano le chiavi come conosciute. */
export function scrittureNoti(chiavi) {
  const perLettera = new Map();
  for (const k of chiavi) {
    const l = iniziale(k);
    if (!perLettera.has(l)) perLettera.set(l, []);
    perLettera.get(l).push(k);
  }
  return [...perLettera].map(([l, k]) => ({ percorso: `noti/${l}`, dati: {}, maschera: [], aggiungi: { k } }));
}

/** Tutte le chiavi conosciute (una lettura per lettera). */
export async function leggiNotiTutti(db) {
  const docs = await db.elenca('noti');
  return new Set(docs.flatMap((d) => d.k ?? []));
}

/**
 * Una volta sola: dal vecchio indice (una lettera per documento) al nuovo (due lettere),
 * e dall'elenco unico dei conosciuti a quello diviso per lettera.
 */
export async function migraRicerca(db, log = console.log) {
  const vecchi = await db.elenca('indici');
  const atleti = new Map();
  for (const d of vecchi) {
    for (const riga of d.l ?? []) {
      const [k, n, y, s] = String(riga).split('|');
      if (k && n) atleti.set(k, { n, y: y || null, s: s || '' });
    }
  }
  const noti = (await db.leggi('meta/atleti-noti'))?.k ?? [];
  const tutteChiavi = new Set([...noti, ...atleti.keys()]);
  // Si scrive "da zero" (non in aggiunta): se la migrazione si ripete non si duplica niente.
  const perPrefisso = new Map();
  for (const [k, a] of atleti) {
    for (const p of prefissi(a.n)) {
      if (!perPrefisso.has(p)) perPrefisso.set(p, []);
      perPrefisso.get(p).push(vocePrefisso(k, a));
    }
  }
  const perLettera = new Map();
  for (const k of tutteChiavi) {
    const l = iniziale(k);
    if (!perLettera.has(l)) perLettera.set(l, []);
    perLettera.get(l).push(k);
  }
  await db.scriviTanti([
    ...[...perPrefisso].map(([p, l]) => ({ percorso: `ricerca/${p}`, dati: { l } })),
    ...[...perLettera].map(([l, k]) => ({ percorso: `noti/${l}`, dati: { k } })),
  ]);
  log(`Ricerca: nuovo indice con ${atleti.size} atleti in ${perPrefisso.size} pezzi.`);
}

export const chiaveSquadra = (nome = '') => slug(nome).slice(0, 60) || 'senza-nome';
