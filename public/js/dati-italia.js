// Dati di tutta Italia nel Realtime Database: come si scrivono (controllore) e come si rileggono (app).
// Righe di testo corte invece di oggetti, per stare comodi nel giga gratuito.
//   a/{chiave}/i             "nome|anno|sesso"
//   a/{chiave}/s{stagione}   "società|regione~gara|vasca|tempo|data|luogo~…" (per le prime frazioni di staffetta
//                            anche "|f|evento|staffetta"; i dati vecchi possono avere "|p|…" = passaggio, da scartare)
//   a/{chiave}/x{stagione}   passaggi della stagione (non validi), "gara|vasca|tempo|data~…": servono a toglierli dallo storico
//   a/{chiave}/f             id dell'atleta nella fonte (per lo storico)
//   sqx/{squadra}            riassunto della squadra (componenti, migliori di sempre, punti di sempre): vedi riassuntoSquadra
//   sqr/{squadra}/{impronta} staffette dalle gare lette: "gara|sesso|vasca|tempo|data|id gara|categoria"
//   st/{chiave}              storico gara per gara degli atleti seguiti: { agg, g: { gara: "vasca|tempo|data|luogo|evento~…" } }
//   ann/s{stagione}          Indice annata: { "vasca|gara|sesso|anno": "media dei 10 migliori|quanti" }
//   c/{nome}~{chiave}        "chiave|nome|anno|società|regione"
//   sqs/{squadra}/s{stagione} { n, reg, m: "chiave|nome|anno|sesso~…", t: { "vasca|gara|sesso": "chiave|tempo|data[|tipo]~…" } }
// Questo file è usato sia dall'app sia dal controllore: dipende solo da categorie.js (anche lui in tutte e due).
import { categoria } from './categorie.js';

const pulisci = (x) => String(x ?? '').replace(/[|~]/g, ' ').trim();
const senzaAccenti = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const rigaInfo = (a) => `${pulisci(a.n)}|${a.y ?? ''}|${a.sx ?? ''}`;

/** Una stagione di un atleta: società, regione e il migliore di ogni gara e vasca. */
export function rigaStagione(a) {
  const migliori = new Map();
  for (const v of a.risultati ?? []) {
    const chiave = `${v.c}|${v.v}`;
    if (!migliori.has(chiave) || v.t < migliori.get(chiave).t) migliori.set(chiave, v);
  }
  const tempi = [...migliori.values()].map((v) => [v.c, v.v, v.t, v.d ?? '', pulisci(v.l),
    ...(v.tp ? [v.tp, String(v.g ?? '').replace(/^n/, ''), v.og ?? ''] : [])].join('|'));
  return [`${pulisci(a.s)}|${a.reg ?? ''}`, ...tempi].join('~');
}

/** Da a/{chiave} ai dati dell'atleta (o null). */
export function leggiAtletaItalia(doc) {
  if (!doc?.i) return null;
  const [n, y, sx] = doc.i.split('|');
  const stagioni = Object.keys(doc).filter((x) => /^s\d{4}$/.test(x)).sort().reverse();
  if (!stagioni.length) return null;
  const [testa] = doc[stagioni[0]].split('~');
  const [s, reg] = testa.split('|');
  // Passaggi (non validi da regolamento): quelli ricordati a parte e quelli rimasti nei dati vecchi.
  const px = Object.keys(doc).filter((x) => /^x\d{4}$/.test(x)).flatMap((x) => String(doc[x]).split('~').filter(Boolean));
  const r = stagioni.flatMap((x) => doc[x].split('~').slice(1).map((riga) => {
    const [c, v, t, d, l, tp, ev, og] = riga.split('|');
    if (tp === 'p') {
      px.push([c, v, t, d].join('|'));
      return null;
    }
    const voce = {
      i: `i${x.slice(1)}-${c}-${v}`, c, v: Number(v), t: Number(t), d, gn: l || 'Gara FIN', l, f: 1,
    };
    if (tp) {
      voce.tp = tp;
      if (ev) voce.g = `n${ev}`;
      if (og) voce.og = og;
    }
    return voce;
  }).filter(Boolean));
  return {
    n, y: Number(y) || null, sx, s, reg, r, px: [...new Set(px)],
  };
}

/** Le chiavi di ricerca di un nome: ogni ordine delle parole (anche con "D'Angelo" diviso e unito). */
export function chiaviRicerca(nome = '') {
  const base = senzaAccenti(nome).replace(/[^a-z'’`\- ]/g, ' ');
  const varianti = new Set();
  for (const parole of [
    base.replace(/['’`-]+/g, ' ').split(/\s+/).filter(Boolean),
    base.replace(/['’`-]+/g, '').split(/\s+/).filter(Boolean),
  ]) {
    for (let i = 0; i < parole.length; i++) varianti.add([...parole.slice(i), ...parole.slice(0, i)].join(' ').slice(0, 120));
  }
  return [...varianti].filter(Boolean);
}

/** Il testo scritto nella ricerca, nella stessa forma delle chiavi. */
export const testoRicerca = (t = '') => senzaAccenti(t).replace(/['’`-]+/g, ' ').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

export const rigaRicerca = (k, a) => `${k}|${pulisci(a.n)}|${a.y ?? ''}|${pulisci(a.s)}|${a.reg ?? ''}`;

export function leggiRigaRicerca(riga) {
  const [k, n, y, s, reg] = String(riga).split('|');
  return {
    k, n, y, s, reg,
  };
}

/** Una squadra in una stagione. `sq`: { n, reg, membri: Map chiave -> atleta, t: Map gara -> Map chiave -> tempo }. */
export function rigaSquadra(sq) {
  const t = {};
  for (const [kt, perAtleta] of sq.t) {
    t[kt] = [...perAtleta].sort((x, y) => x[1].t - y[1].t).map(([k, v]) => `${k}|${v.t}|${v.d ?? ''}${v.tp ? `|${v.tp}` : ''}`).join('~');
  }
  return {
    n: pulisci(sq.n),
    reg: sq.reg ?? '',
    m: [...sq.membri].map(([k, a]) => `${k}|${pulisci(a.n)}|${a.y ?? ''}|${a.sx ?? ''}`).join('~'),
    t,
  };
}

// Migliori di sempre: tutti (prima solo i primi 30, e chi era più indietro non compariva).
const TOP_SEMPRE = Infinity;

/**
 * Da sqs/{squadra} alla squadra come la usa l'app: componenti con prima e ultima stagione,
 * migliori di sempre per gara (tutti) e le tabelle di ogni stagione.
 */
export function squadraDaStagioni(doc) {
  const chiavi = Object.keys(doc ?? {}).filter((x) => /^s\d{4}$/.test(x)).sort().reverse();
  if (!chiavi.length) return null;
  const membri = new Map();
  const sempre = new Map();
  const stagioni = {};
  for (const x of chiavi) {
    const st = x.slice(1);
    const d = doc[x];
    for (const riga of String(d.m ?? '').split('~').filter(Boolean)) {
      const [k, n, y, sx] = riga.split('|');
      const prima = membri.get(k);
      membri.set(k, {
        k, n: prima?.n ?? n, y, sx, da: st, a: prima?.a ?? st,
      });
    }
    const tabelle = {};
    for (const [kt, testo] of Object.entries(d.t ?? {})) {
      const righe = String(testo).split('~').filter((r) => r && !r.endsWith('|p'));
      tabelle[kt] = righe;
      if (!sempre.has(kt)) sempre.set(kt, new Map());
      for (const riga of righe) {
        const [k, t, data, tp] = riga.split('|');
        if (tp === 'p') continue; // passaggio: non vale
        const ora = sempre.get(kt).get(k);
        if (!ora || Number(t) < ora.t) {
          sempre.get(kt).set(k, {
            t: Number(t), d: data, s: st, tp,
          });
        }
      }
    }
    stagioni[st] = { t: tabelle, m: String(d.m ?? '').split('~').filter(Boolean).length };
  }
  const t = {};
  for (const [kt, perAtleta] of sempre) {
    if (!perAtleta.size) continue;
    t[kt] = [...perAtleta].sort((x, y) => x[1].t - y[1].t).slice(0, TOP_SEMPRE).map(([k, v]) => `${k}|${v.t}|${v.d}|${v.s}${v.tp ? `|${v.tp}` : ''}`);
  }
  const ultima = doc[chiavi[0]];
  return {
    n: ultima.n,
    reg: ultima.reg,
    st: chiavi.map((x) => x.slice(1)),
    m: [...membri.values()].map((x) => [x.k, x.n, x.y, x.sx, x.da, x.a].join('|')),
    t,
    stagioni,
  };
}

/**
 * Punti fatti con la squadra, atleta per atleta: la somma dei migliori tempi di ogni gara e vasca
 * di ogni stagione. `tabelle`: [{ "vasca|gara|sesso": ["chiave|tempo|data", …] }, …]; `punti` la funzione dei punti.
 */
export function puntiSquadra(tabelle, punti) {
  const totali = new Map();
  for (const t of tabelle) {
    for (const [kt, righe] of Object.entries(t ?? {})) {
      const [v, c, sx] = kt.split('|');
      for (const riga of righe) {
        const [k, tempo, d] = riga.split('|');
        const p = punti(Number(tempo), c, sx, Number(v), d);
        if (!p) continue;
        const x = totali.get(k) ?? {
          k, sx, pt: 0, gare: 0, top: null,
        };
        x.pt += p;
        x.gare++;
        if (!x.top || p > x.top.p) x.top = { p, c, v: Number(v) };
        totali.set(k, x);
      }
    }
  }
  return [...totali.values()].sort((a, b) => b.pt - a.pt);
}

export const VERSIONE_RIASSUNTO = 3;

/** Il riassunto di una squadra da tutte le sue stagioni (lo prepara il controllore, l'app legge solo questo). */
export function riassuntoSquadra(doc, punti) {
  const sq = squadraDaStagioni(doc);
  if (!sq) return null;
  // Indice Cloro di sempre: con i migliori punti di ogni specialità di tutti gli anni passati in squadra,
  // contando solo le stagioni da Categoria (le gare da Esordienti non entrano).
  const anni = annidiNascita(sq.m);
  const ic = indiciStagione(unisciTabelle(Object.entries(sq.stagioni).map(([st, x]) => soloCategoria(x.t, st, anni))), punti);
  return {
    // Versione del riassunto: 2 = Indice Cloro di sempre con i soli tempi da Categoria; 3 = senza passaggi.
    v: VERSIONE_RIASSUNTO,
    n: pulisci(sq.n),
    reg: sq.reg ?? '',
    st: sq.st.join(','),
    m: sq.m.join('~'),
    t: Object.fromEntries(Object.entries(sq.t).map(([kt, righe]) => [kt, righe.join('~')])),
    ic: ic.map((x) => [x.k, x.sx, x.valore, '', x.gare.join(',')].join('|')).join('~'),
  };
}

/** Dal riassunto (sqx/{squadra}) alla squadra come la usa l'app. */
export function leggiRiassuntoSquadra(x) {
  if (!x?.st) return null;
  const elenco = (testo) => String(testo ?? '').split('~').filter(Boolean);
  return {
    v: Number(x.v) || 1,
    n: x.n,
    reg: x.reg,
    st: String(x.st).split(',').filter(Boolean),
    m: elenco(x.m),
    t: Object.fromEntries(Object.entries(x.t ?? {}).map(([kt, righe]) => [kt, elenco(righe).filter((r) => !r.endsWith('|p'))])),
    ic: x.ic === undefined ? null : elenco(x.ic).map((riga) => {
      const [k, sx, valore, st, gare] = riga.split('|');
      return {
        k, sx, valore: Number(valore), st, gare: String(gare ?? '').split(',').filter(Boolean),
      };
    }),
  };
}

/** Una stagione di una squadra (sqs/{squadra}/s{stagione}) con le tabelle come elenchi. */
export function leggiStagioneSquadra(d) {
  if (!d) return null;
  return {
    m: String(d.m ?? '').split('~').filter(Boolean),
    t: Object.fromEntries(Object.entries(d.t ?? {}).map(([kt, testo]) => [kt, String(testo).split('~').filter((r) => r && !r.endsWith('|p'))])),
  };
}

const PESI_INDICE = [0.5, 0.3, 0.2];

/**
 * Indice Cloro di un atleta in una stagione: media pesata 50/30/20 dei punti delle sue 3 specialità
 * migliori (per ogni specialità il punteggio più alto fra le due vasche). `punteggi`: [{ c, pt }].
 */
export function indiceDaPunti(punteggi = []) {
  const perGara = new Map();
  for (const x of punteggi) if (x.pt && (!perGara.has(x.c) || x.pt > perGara.get(x.c).pt)) perGara.set(x.c, x);
  const migliori = [...perGara.values()].sort((a, b) => b.pt - a.pt).slice(0, 3);
  if (!migliori.length) return null;
  const pesi = PESI_INDICE.slice(0, migliori.length);
  const totale = pesi.reduce((a, b) => a + b, 0);
  return { valore: Math.round(migliori.reduce((t, x, i) => t + x.pt * pesi[i], 0) / totale), gare: migliori.map((x) => x.c) };
}

/** Categoria (Ragazzi, Juniores, Cadetti, Seniores) e non Esordienti, in quella stagione. */
export function eCategoria(anno, sesso, st) {
  const c = categoria(Number(anno) || null, sesso, st);
  return !!c && !c.startsWith('Esordienti');
}

/** Anno di nascita di ogni componente, dalle righe "chiave|nome|anno|…". */
export const annidiNascita = (righe = []) => new Map(righe.map((r) => {
  const [k, , y] = String(r).split('|');
  return [k, y];
}));

/** Le tabelle di una stagione con i soli tempi fatti da Categoria. `anni`: chiave -> anno di nascita. */
export function soloCategoria(tabelle, st, anni) {
  return Object.fromEntries(Object.entries(tabelle ?? {}).map(([kt, righe]) => {
    const sx = kt.split('|')[2];
    return [kt, righe.filter((r) => eCategoria(anni.get(String(r).split('|')[0]), sx, st))];
  }));
}

/** Le tabelle di più stagioni messe insieme (le righe di tutte le stagioni, gara per gara). */
export function unisciTabelle(elenco) {
  const tutte = {};
  for (const t of elenco) for (const [kt, righe] of Object.entries(t ?? {})) (tutte[kt] ??= []).push(...righe);
  return tutte;
}

/** Indice Cloro di tutti gli atleti di una stagione di una squadra (o di più stagioni unite). `tabelle`: { "vasca|gara|sesso": ["chiave|tempo|data", …] }. */
export function indiciStagione(tabelle, punti) {
  const perAtleta = new Map();
  for (const [kt, righe] of Object.entries(tabelle ?? {})) {
    const [v, c, sx] = kt.split('|');
    for (const riga of righe) {
      const [k, tempo, d] = riga.split('|');
      const pt = punti(Number(tempo), c, sx, Number(v), d);
      if (!pt) continue;
      if (!perAtleta.has(k)) perAtleta.set(k, { sx, punteggi: [] });
      perAtleta.get(k).punteggi.push({ c, pt });
    }
  }
  return [...perAtleta].map(([k, x]) => ({ k, sx: x.sx, ...indiceDaPunti(x.punteggi) }))
    .filter((x) => x.valore).sort((a, b) => b.valore - a.valore);
}
