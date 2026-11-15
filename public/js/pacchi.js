// "Pacchi": i migliori tempi di ogni stagione di tutti gli atleti, salvati a gruppi invece che
// uno per atleta (il piano gratuito del database permette poche scritture al giorno).
// Ogni atleta finisce sempre nello stesso pacco (un numero da 0 a 511 calcolato dalla sua chiave):
//   pacchi/{stagione}-{000..511}  { st, a: { chiave: "nome|anno|sesso|società|regione" },
//                                       t: { chiave: ["gara|vasca|tempo|data|luogo", …] } }
// Questo file è usato sia dall'app sia dal controllore: niente dipendenze.

export const SECCHI = 512;

/** Numero del pacco di un atleta (FNV-1a sulla chiave). */
export function secchio(k = '') {
  let h = 0x811c9dc5;
  for (let i = 0; i < k.length; i++) {
    h ^= k.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % SECCHI;
}

export const idPacco = (st, k) => `${st}-${String(secchio(k)).padStart(3, '0')}`;

/** Dagli atleti di una stagione ai documenti dei pacchi. `atleti`: Map chiave -> { n, y, sx, s, reg, risultati }. */
export function preparaPacchi(atleti, st) {
  const pacchi = new Map();
  for (const [k, a] of atleti) {
    const id = idPacco(st, k);
    if (!pacchi.has(id)) pacchi.set(id, { st: String(st), a: {}, t: {} });
    const p = pacchi.get(id);
    p.a[k] = [a.n, a.y ?? '', a.sx, a.s ?? '', a.reg ?? ''].join('|');
    p.t[k] = a.risultati.map((v) => [v.c, v.v, v.t, v.d ?? '', String(v.l ?? '').replace(/\|/g, ' ')].join('|'));
  }
  return pacchi;
}

/** Da un pacco ai dati di un atleta in quella stagione (o null se non c'è). */
export function leggiPacco(doc, k) {
  const riga = doc?.a?.[k];
  if (!riga) return null;
  const [n, y, sx, s, reg] = riga.split('|');
  const r = (doc.t?.[k] ?? []).map((x) => {
    const [c, v, t, d, l] = x.split('|');
    return {
      i: `p${doc.st}-${c}-${v}`, c, v: Number(v), t: Number(t), d, gn: l || 'Gara FIN', l, f: 1,
    };
  });
  return {
    n, y: Number(y) || null, sx, s, reg, r,
  };
}
