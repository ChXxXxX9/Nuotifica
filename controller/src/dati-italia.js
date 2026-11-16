// Copia di public/js/dati-italia.js (tenere uguali).
// Dati di tutta Italia nel Realtime Database: come si scrivono (controllore) e come si rileggono (app).
// Righe di testo corte invece di oggetti, per stare comodi nel giga gratuito.
//   a/{chiave}/i             "nome|anno|sesso"
//   a/{chiave}/s{stagione}   "società|regione~gara|vasca|tempo|data|luogo~…"
//   a/{chiave}/f             id dell'atleta nella fonte (per lo storico)
//   sqx/{squadra}            riassunto della squadra (componenti, migliori di sempre, punti di sempre): vedi riassuntoSquadra
//   sqr/{squadra}/{impronta} staffette dalle gare lette: "gara|sesso|vasca|tempo|data|id gara|categoria"
//   st/{chiave}              storico gara per gara degli atleti seguiti: { agg, g: { gara: "vasca|tempo|data|luogo|evento~…" } }
//   ann/s{stagione}          Indice annata: { "vasca|gara|sesso|anno": "media dei 10 migliori|quanti" }
//   c/{nome}~{chiave}        "chiave|nome|anno|società|regione"
//   sqs/{squadra}/s{stagione} { n, reg, m: "chiave|nome|anno|sesso~…", t: { "vasca|gara|sesso": "chiave|tempo|data~…" } }
// Questo file è usato sia dall'app sia dal controllore: niente dipendenze.

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
  const tempi = [...migliori.values()].map((v) => [v.c, v.v, v.t, v.d ?? '', pulisci(v.l)].join('|'));
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
  const r = stagioni.flatMap((x) => doc[x].split('~').slice(1).map((riga) => {
    const [c, v, t, d, l] = riga.split('|');
    return {
      i: `i${x.slice(1)}-${c}-${v}`, c, v: Number(v), t: Number(t), d, gn: l || 'Gara FIN', l, f: 1,
    };
  }));
  return {
    n, y: Number(y) || null, sx, s, reg, r,
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
    t[kt] = [...perAtleta].sort((x, y) => x[1].t - y[1].t).map(([k, v]) => `${k}|${v.t}|${v.d ?? ''}`).join('~');
  }
  return {
    n: pulisci(sq.n),
    reg: sq.reg ?? '',
    m: [...sq.membri].map(([k, a]) => `${k}|${pulisci(a.n)}|${a.y ?? ''}|${a.sx ?? ''}`).join('~'),
    t,
  };
}

const TOP_SEMPRE = 30;

/**
 * Da sqs/{squadra} alla squadra come la usa l'app: componenti con prima e ultima stagione,
 * migliori di sempre per gara (i primi 30) e le tabelle di ogni stagione.
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
      const righe = String(testo).split('~').filter(Boolean);
      tabelle[kt] = righe;
      if (!sempre.has(kt)) sempre.set(kt, new Map());
      for (const riga of righe) {
        const [k, t, data] = riga.split('|');
        const ora = sempre.get(kt).get(k);
        if (!ora || Number(t) < ora.t) sempre.get(kt).set(k, { t: Number(t), d: data, s: st });
      }
    }
    stagioni[st] = { t: tabelle, m: String(d.m ?? '').split('~').filter(Boolean).length };
  }
  const t = {};
  for (const [kt, perAtleta] of sempre) {
    t[kt] = [...perAtleta].sort((x, y) => x[1].t - y[1].t).slice(0, TOP_SEMPRE).map(([k, v]) => `${k}|${v.t}|${v.d}|${v.s}`);
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

/** Il riassunto di una squadra da tutte le sue stagioni (lo prepara il controllore, l'app legge solo questo). */
export function riassuntoSquadra(doc, punti) {
  const sq = squadraDaStagioni(doc);
  if (!sq) return null;
  const ps = puntiSquadra(Object.values(sq.stagioni).map((x) => x.t), punti);
  return {
    n: pulisci(sq.n),
    reg: sq.reg ?? '',
    st: sq.st.join(','),
    m: sq.m.join('~'),
    t: Object.fromEntries(Object.entries(sq.t).map(([kt, righe]) => [kt, righe.join('~')])),
    ps: ps.map((x) => [x.k, x.sx, x.pt, x.gare, x.top?.c ?? '', x.top?.v ?? '', x.top?.p ?? ''].join('|')).join('~'),
  };
}

/** Dal riassunto (sqx/{squadra}) alla squadra come la usa l'app. */
export function leggiRiassuntoSquadra(x) {
  if (!x?.st) return null;
  const elenco = (testo) => String(testo ?? '').split('~').filter(Boolean);
  return {
    n: x.n,
    reg: x.reg,
    st: String(x.st).split(',').filter(Boolean),
    m: elenco(x.m),
    t: Object.fromEntries(Object.entries(x.t ?? {}).map(([kt, righe]) => [kt, elenco(righe)])),
    ps: elenco(x.ps).map((riga) => {
      const [k, sx, pt, gare, c, v, p] = riga.split('|');
      return {
        k, sx, pt: Number(pt), gare: Number(gare), top: c ? { c, v: Number(v), p: Number(p) } : null,
      };
    }),
  };
}

/** Una stagione di una squadra (sqs/{squadra}/s{stagione}) con le tabelle come elenchi. */
export function leggiStagioneSquadra(d) {
  if (!d) return null;
  return {
    m: String(d.m ?? '').split('~').filter(Boolean),
    t: Object.fromEntries(Object.entries(d.t ?? {}).map(([kt, testo]) => [kt, String(testo).split('~').filter(Boolean)])),
  };
}
