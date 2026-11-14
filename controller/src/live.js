// Gare del Lazio quasi in diretta: elenco delle ultime gare e risultati completi di ogni sede
// (batterie, corsie, posizioni, tempi, società, parziali).
import {
  inMs, leggiGara, nomeProprio, chiaveAtleta, nomeCategoria, slug, impronta,
} from './tempi.js';

const ENTITA = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#039': "'", nbsp: ' ' };
const decodifica = (t = '') => t.replace(/&(#?\w+);/g, (m, e) => {
  if (ENTITA[e]) return ENTITA[e];
  if (/^#\d+$/.test(e)) return String.fromCodePoint(Number(e.slice(1)));
  return m;
});

/** "07-08/11/2026" -> { dal, al }. Gestisce anche "31-01/10-11/2026" e "07/11/2026". */
export function periodo(testo = '') {
  const m = String(testo).trim().match(/^(\d{1,2})(?:-(\d{1,2}))?\/(\d{1,2})(?:-(\d{1,2}))?\/(\d{4})$/);
  if (!m) return null;
  const [, g1, g2, m1, m2, anno] = m;
  const a = Number(anno);
  const mese1 = Number(m1);
  const mese2 = Number(m2 ?? m1);
  const iso = (y, mm, gg) => `${y}-${String(mm).padStart(2, '0')}-${String(gg).padStart(2, '0')}`;
  return {
    dal: iso(mese1 > mese2 ? a - 1 : a, mese1, Number(g1)),
    al: iso(a, mese2, Number(g2 ?? g1)),
  };
}

/** Elenco delle ultime gare: una voce per sede (concentramento). */
export function leggiElenco(html = '') {
  const voci = [];
  const re = /<a\s+nome-pool=(.*?)\s+href=['"]#['"]\s+data-id-gare=([0-9a-f]{16,64})\s+nome-competizione='([^']*)'\s*>([^<]*)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const piscina = decodifica(m[1].replace(/^['"]|['"]$/g, '')).trim();
    const titolo = decodifica(m[3]).replace(/\s+/g, ' ').trim();
    const testo = decodifica(m[4]).trim();
    const t = testo.match(/^(.*?),\s*([\d/-]+)\s*:/);
    const p = periodo(t?.[2]);
    // Le manifestazioni di propaganda (bambini, attività non agonistica) non le mostriamo.
    if (!p || /propaganda/i.test(titolo)) continue;
    voci.push({
      sede: m[2],
      piscina: piscina === 'null' ? '' : piscina,
      titolo,
      luogo: nomeProprio(t[1]),
      ...p,
    });
  }
  return voci;
}

/** Vasca da 25 o 50 m: dal nome (V.C. / V.L.), altrimenti dal periodo dell'anno. */
export function indovinaVasca(titolo = '', dal = '') {
  if (/\bv\.?\s*l\.?\b|vasca lunga|\b50\s*m(etri)?\b/i.test(titolo)) return 50;
  if (/\bv\.?\s*c\.?\b|vasca corta|\b25\s*m(etri)?\b/i.test(titolo)) return 25;
  const mese = Number(dal.slice(5, 7));
  return mese >= 6 && mese <= 8 ? 50 : 25;
}

/** Identificativo della gara (le sedi della stessa gara finiscono insieme). */
export function idGara(titolo, dal) {
  const base = slug(titolo).slice(0, 48).replace(/-+$/, '');
  return `l${dal.replace(/-/g, '')}-${base}-${impronta(`${titolo}|${dal}`).slice(0, 6)}`;
}

/** Raggruppa le sedi dell'elenco per gara. */
export function raggruppa(voci) {
  const gare = new Map();
  for (const v of voci) {
    const id = idGara(v.titolo, v.dal);
    if (!gare.has(id)) {
      gare.set(id, {
        id, nome: v.titolo, luogo: v.luogo, dal: v.dal, al: v.al, vasca: indovinaVasca(v.titolo, v.dal), sedi: [],
      });
    }
    const g = gare.get(id);
    if (v.al > g.al) g.al = v.al;
    if (v.dal < g.dal) g.dal = v.dal;
    if (!g.sedi.some((s) => s.sede === v.sede)) g.sedi.push({ sede: v.sede, piscina: v.piscina });
  }
  return [...gare.values()];
}

const STATI = { ASS: 'Assente', SQ: 'Squalificato', RIT: 'Ritirato', NP: 'Non partito', NC: 'Non classificato', FG: 'Fuori gara' };

/** Risultati grezzi di una sede -> righe normalizzate. */
export function leggiRisultati(json) {
  const dati = typeof json === 'string' ? JSON.parse(json) : json;
  const righe = [];
  for (const [categoria, gare] of Object.entries(dati?.results ?? {})) {
    for (const [nomeGara, batterie] of Object.entries(gare ?? {})) {
      const gara = leggiGara(nomeGara);
      if (!gara) continue;
      for (const [batteria, atleti] of Object.entries(batterie ?? {})) {
        for (const a of atleti ?? []) {
          const nome = nomeProprio(a.athlete?.firstname ?? '');
          const cognome = nomeProprio(a.athlete?.lastname ?? '');
          const anno = Number(a.athlete?.year) || null;
          const ms = inMs(a.time);
          const stato = ms ? null : (String(a.time ?? '').trim().toUpperCase() || null);
          const parziali = (a.MemFields ?? [])
            .filter((f) => f.M && f.M !== 'FINISH' && inMs(f.V))
            .map((f) => ({ m: Number(String(f.M).replace(/\D/g, '')), ms: inMs(f.V), p: Number(f.P) || null }))
            .filter((f) => f.m > 0)
            .sort((x, y) => x.m - y.m);
          righe.push({
            id: String(a.id ?? `${categoria}|${nomeGara}|${batteria}|${a.lane}`),
            categoria: String(a.category ?? categoria).trim(),
            sesso: a.type === 'F' ? 'F' : 'M',
            gara,
            turno: String(a.round ?? ''),
            batteria: Number(batteria) || Number(a.battery) || 0,
            corsia: Number(a.lane) || null,
            posizione: Number(a.ord) || null,
            ms,
            stato: stato ? (STATI[stato] ?? stato) : null,
            data: String(a.date ?? '').slice(0, 10) || null,
            atleta: {
              chiave: gara.staffetta ? null : chiaveAtleta(cognome, nome, anno),
              nome: gara.staffetta ? nomeProprio(a.team?.name ?? '') : `${nome} ${cognome}`.trim(),
              anno,
              naz: a.athlete?.nat ?? null,
              codice: a.code ? String(a.code) : null,
            },
            societa: String(a.team?.name ?? '').trim(),
            parziali,
          });
        }
      }
    }
  }
  return righe;
}

export const nomeCat = nomeCategoria;
