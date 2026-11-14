// Gare nazionali con cronometraggio in diretta: batterie, finali, corsie e parziali.
// L'elenco delle gare arriva da una pagina di risultati (indirizzo nel secret FONTI, chiave "elencoNaz");
// ogni gara ha un file "contatori" con l'elenco dei suoi file e, per ogni gara/categoria/turno,
// un riepilogo (tutte le batterie) o una classifica (le finali).
import {
  inMs, leggiGara, nomeProprio, chiaveAtleta, impronta, slug, piuGiorni,
} from './tempi.js';
import { inParallelo } from './invio.js';
import { indovinaVasca } from './live.js';
import { somiglianza } from './nazionali.js';

const STATI = {
  ASS: 'Assente', NP: 'Non partito', DNS: 'Assente', SQ: 'Squalificato', DSQ: 'Squalificato', 'SQUAL.': 'Squalificato',
  RIT: 'Ritirato', DNF: 'Ritirato', NC: 'Non classificato', FG: 'Fuori gara',
};
const LETTERE = 'ABCDEFGH';

const leggiJson = (testo) => (typeof testo === 'string' ? JSON.parse(testo.replace(/^﻿/, '')) : testo);
const dataIso = (testo = '') => {
  const m = String(testo).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};
const pulisci = (t = '') => String(t).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const maiuscolo = (t) => t && t === t.toUpperCase() && /[A-Z]/.test(t);

/** Link alle gare nella pagina dei risultati: indirizzo, testo, cartella dei dati e date. */
export function leggiElencoGare(html = '') {
  const gare = new Map();
  const re = /<a[^>]+href="(https?:\/\/[^"]+\/(NU_\d{4}_\d{2}_[^"/]+?)\.php)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const [, url, cartella, testo] of html.matchAll(re)) {
    const m = cartella.match(/^NU_(\d{4})_(\d{2})_(\d{2})(?:-(\d{2}))?(?:_(\d{2}))?_(.+)$/);
    if (!m) continue;
    const [, anno, mese, giorno, fine1, fine2, luogo] = m;
    const dal = `${anno}-${mese}-${giorno}`;
    let al = dal;
    if (fine1 && fine2) al = `${anno}-${fine1}-${fine2}`;
    else if (fine1) al = `${anno}-${mese}-${fine1}`;
    if (al < dal) al = `${Number(anno) + 1}${al.slice(4)}`;
    const nome = pulisci(testo.replace(/<[^>]+>/g, ''))
      .replace(/^nuoto\.?\s*/i, '').replace(/\s*[-–]\s*risultati.*$/i, '').trim();
    gare.set(cartella, {
      url,
      cartella,
      dati: `${url.slice(0, url.lastIndexOf('/'))}/export/${cartella}/NU/`,
      nome: nome || nomeProprio(luogo.replace(/_/g, ' ')),
      luogo: nomeProprio(luogo.replace(/_/g, ' ')),
      dal,
      al,
    });
  }
  return [...gare.values()];
}

/** File dei risultati da leggere: per ogni gara/categoria/turno il riepilogo, altrimenti la classifica. */
export function scegliFile(contatori) {
  const elenco = leggiJson(contatori)?.contatori ?? [];
  const scelti = new Map();
  for (const f of elenco) {
    const tipo = String(f.cod ?? '');
    if (tipo !== 'SUM' && !/^CGR/.test(tipo)) continue;
    const chiave = `${f.c0}|${f.c1}|${f.c2}`;
    const prima = scelti.get(chiave);
    if (!prima || (tipo === 'SUM' && prima.tipo !== 'SUM')) scelti.set(chiave, { tipo, nome: f.nomefile });
  }
  return [...scelti.values()].map((x) => x.nome).filter(Boolean);
}

/** Nome e sigla della batteria a seconda del turno (batterie, serie, semifinali, finali). */
function batteria(turno, n, finali) {
  if (/final/i.test(turno) && !/semi/i.test(turno)) {
    const lettera = LETTERE[n - 1] ?? String(n);
    return finali > 1 ? { nome: `Finale ${lettera}`, sigla: `F${lettera}`, finale: n } : { nome: 'Finale', sigla: 'F', finale: n };
  }
  if (/semi/i.test(turno)) return { nome: `Semifinale ${n}`, sigla: `SF${n}` };
  if (/serie/i.test(turno)) return { nome: `Serie ${n}`, sigla: `S${n}` };
  return { nome: `Batteria ${n}`, sigla: `B${n}` };
}

/** Un file di risultati -> righe nello stesso formato delle gare in diretta del Lazio. */
export function leggiFileRisultati(testo) {
  const d = leggiJson(testo);
  const gara = leggiGara(pulisci(d?.Competition?.Ita ?? ''));
  if (!gara || !Array.isArray(d.data)) return [];
  const codCat = String(d.Category?.Cod ?? '');
  const categoria = pulisci(d.Category?.Ita ?? '') || codCat;
  const sesso = /F$/i.test(codCat) || /femmin|donne/i.test(categoria) ? 'F' : 'M';
  const riepilogo = d.Document?.Cod === 'SUM';
  const turno = String(d.Round?.Cod ?? '');
  const nomeTurno = pulisci(d.Round?.Ita ?? '');
  const data = dataIso(d.Event?.Date) ?? dataIso(d.Heat?.UffDate);
  const campi = (d.ExtraDetails?.Ita ?? []).map((f) => String(f.Field ?? ''));
  const numeroBatt = (a) => (riepilogo ? Number(a.MemRBatt) : Number(a.b)) || 1;
  const finali = new Set(d.data.map(numeroBatt)).size;

  const righe = [];
  for (const a of d.data) {
    const prestazione = String(a.MemPrest ?? '').trim();
    if (!prestazione) continue; // non ancora nuotato
    const ms = inMs(prestazione);
    const sigla = prestazione.toUpperCase();
    const n = numeroBatt(a);
    const b = batteria(nomeTurno, n, finali);
    const cognome = nomeProprio(a.PlaSurname ?? '');
    const nome = nomeProprio(a.PlaName ?? '');
    const anno = Number(a.PlaBirth) || null;
    let societa = pulisci(a.TeamDescrIta || a.TeamDescrItaVis || '');
    if (maiuscolo(societa)) societa = nomeProprio(societa);
    const parziali = [];
    (a.MemFields ?? []).forEach((f, i) => {
      const etichetta = campi[i] ?? '';
      const metri = Number(etichetta.match(/^(\d+)\s*m/i)?.[1]);
      const t = inMs(f?.V);
      if (metri && t && metri < gara.dist) parziali.push({ m: metri, ms: t, p: Number(f.P) || null });
    });
    const posizione = riepilogo ? Number.parseInt(a.MemRBattCls, 10) : Number.parseInt(a.PlaCls, 10);
    righe.push({
      id: `${codCat}-${d.Competition?.Cod ?? gara.codice}-${turno}-${a.PlaCod || slug(`${cognome} ${nome}`)}`,
      categoria,
      sesso,
      gara,
      turno,
      batteria: n,
      nomeBatteria: b.nome,
      sigla: b.sigla,
      ...(b.finale ? { finale: b.finale } : {}),
      corsia: a.PlaLane === '' || a.PlaLane === undefined ? null : Number(a.PlaLane),
      posizione: Number.isFinite(posizione) ? posizione : null,
      ms,
      stato: ms ? null : (STATI[sigla] ?? sigla),
      data,
      atleta: {
        chiave: gara.staffetta ? null : chiaveAtleta(cognome, nome, anno),
        nome: gara.staffetta ? societa : `${nome} ${cognome}`.trim(),
        anno: gara.staffetta ? null : anno,
        naz: a.PlaNat || null,
        codice: a.PlaCod ? String(a.PlaCod) : null,
      },
      societa,
      parziali: parziali.sort((x, y) => x.m - y.m),
    });
  }
  return righe;
}

/** Tutte le righe di una gara: si leggono i file scelti dai contatori. */
export async function righeGara(cartellaDati, contatori, scarica) {
  const file = scegliFile(contatori);
  const letti = await inParallelo(file, 4, async (nome) => {
    try {
      return leggiFileRisultati(await scarica(cartellaDati + encodeURIComponent(nome)));
    } catch {
      return [];
    }
  });
  return letti.flat();
}

/**
 * Gare del cronometraggio nazionale come "gruppi" con una sede, pronti per aggiornaGare.
 * Nome, vasca e regione si prendono dal calendario nazionale quando la gara si riconosce.
 */
export async function gruppiNazionali({ db, fonti, scarica, oggi, log = console.log }) {
  if (!fonti?.elencoNaz) return [];
  const voci = leggiElencoGare(await scarica(fonti.elencoNaz));
  // Solo stagione in corso (circa un anno indietro): le più vecchie non servono.
  const recenti = voci.filter((v) => v.al >= piuGiorni(oggi, -330) && v.dal <= piuGiorni(oggi, 7));
  if (!recenti.length) return [];
  const calendario = Object.values((await db.leggi('meta/italia'))?.gare ?? {});
  return recenti.map((v) => {
    const candidati = calendario
      .filter((c) => c.dal <= v.al && c.al >= v.dal)
      .map((c) => ({
        c,
        punti: (slug(c.luogo ?? '').includes(slug(v.luogo)) ? 1 : 0) + somiglianza(c.nome ?? '', v.nome),
      }))
      .filter((x) => x.punti >= 0.6)
      .sort((x, y) => y.punti - x.punti);
    const c = candidati[0]?.c;
    const nome = c?.nome ?? v.nome;
    const regione = c?.regione ?? (/lazio/i.test(c?.comitato ?? '') ? 'Lazio' : 'Italia');
    const id = c?.fid
      ? `n${c.fid}`
      : `m${v.dal.replace(/-/g, '')}-${slug(nome).slice(0, 40).replace(/-+$/, '')}-${impronta(v.cartella).slice(0, 6)}`;
    if (!c) log(`Cronometraggio: "${v.nome}" non trovata nel calendario, uso i dati del link.`);
    return {
      id,
      nome,
      luogo: c?.luogo ?? v.luogo,
      dal: v.dal,
      al: v.al,
      vasca: c?.vasca ?? indovinaVasca(nome, v.dal),
      regione,
      tipo: 'naz',
      sedi: [{ sede: `cr${impronta(v.cartella).slice(0, 10)}`, piscina: v.luogo, dati: v.dati }],
    };
  });
}
