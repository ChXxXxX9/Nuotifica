// Gare di tutta Italia: calendario (prima della gara) e risultati ufficiali (a gara finita).
// Niente batterie né parziali: per ogni gara, categoria e sesso c'è la classifica completa.
import {
  inMs, leggiGara, nomeProprio, slug, nomeCategoria, ordineGara, piuGiorni, oggiRoma,
} from './tempi.js';
import { punti } from './punti.js';
import { comeData } from './firestore.js';
import { stagione, leggiPrimato, iniziali } from './gare.js';

const MESI = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
};
const ENTITA = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì', ograve: 'ò', ugrave: 'ù' };
const testo = (h = '') => h.replace(/<[^>]*>/g, ' ')
  .replace(/&(#?\w+);/g, (m, e) => ENTITA[e] ?? (/^#\d+$/.test(e) ? String.fromCodePoint(Number(e.slice(1))) : m))
  .replace(/\s+/g, ' ').trim();

const contenuto = (json) => {
  const d = typeof json === 'string' ? JSON.parse(json) : json;
  return d?.content ?? '';
};

/** Elenco del calendario: una voce per gara. */
export function leggiCalendario(json) {
  const html = contenuto(json);
  const gare = [];
  for (const blocco of html.split('nat_eve_container').slice(1)) {
    const tipo = blocco.split('"')[0].trim();
    const date = [...blocco.matchAll(/nat_eve_d">(\d+)<\/span>\s*<span class="nat_eve_m">(\w+)<\/span>\s*<span class="nat_eve_y">(\d+)/g)]
      .map(([, g, m, a]) => `${a}-${String(MESI[m.toLowerCase()] ?? 1).padStart(2, '0')}-${String(g).padStart(2, '0')}`);
    const nome = testo(blocco.match(/nat_eve_title"[^>]*><span>([\s\S]*?)<\/span>/)?.[1] ?? '');
    const vasca = Number(blocco.match(/nat_eve_pool">\s*Vasca da (\d+)\s*m/i)?.[1]) || null;
    const luoghi = [...blocco.matchAll(/nat_eve_loc">([\s\S]*?)<\/p>/g)].map((m) => testo(m[1])).filter(Boolean);
    const id = blocco.match(/data-id="(\d+)"/)?.[1];
    const etichetta = blocco.match(/data-callbk="_viewDettaglio"\s*>\s*(\w+)\s*</)?.[1] ?? '';
    if (!id || !date.length || !nome) continue;
    gare.push({
      fid: id,
      id: `n${id}`,
      nome,
      federale: /^federale/i.test(tipo),
      dal: date[0],
      al: date[date.length - 1],
      vasca,
      luogo: luoghi.join(' · '),
      risultati: /risultati/i.test(etichetta),
    });
  }
  return gare;
}

/** Dettaglio di una gara: informazioni e (se ci sono) l'elenco delle classifiche. */
export function leggiEvento(json) {
  const html = contenuto(json);
  const info = {};
  for (const m of html.matchAll(/<span class="lbl">([\s\S]*?)<\/span>\s*(?:<a[^>]*>\s*)?<span class="vle">([\s\S]*?)<\/span>/g)) {
    info[testo(m[1]).toLowerCase()] = testo(m[2]);
  }
  const classifiche = [];
  let categoria = '';
  const re = /<h3>([\s\S]*?)<\/h3>|<span class="collegamento"[\s\S]*?data-id="([^"]+)"[\s\S]*?>([^<]*)<\/span>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1] !== undefined) {
      categoria = testo(m[1]);
      continue;
    }
    const [idEvento, codice, idCategoria, sesso] = m[2].split(';');
    const gara = leggiGara(testo(m[3]));
    if (!gara || !codice) continue;
    classifiche.push({
      idEvento, codice, idCategoria, sesso: sesso === 'F' ? 'F' : 'M', categoria, gara,
    });
  }
  return {
    comitato: info.comitato ?? '',
    impianto: info.impianto ?? '',
    sede: info.sede ?? '',
    vasca: Number((info['base vasca'] ?? '').match(/\d+/)?.[0]) || null,
    categorieAmmesse: info['categorie ammesse'] ?? '',
    iscrizioni: info['inizio/chiusura iscrizioni'] ?? '',
    competizione: info.competizione ?? '',
    classifiche,
  };
}

/** Classifica di una gara: righe con posizione, nome, anno, società e tempo. */
export function leggiClassifica(json) {
  const html = contenuto(json);
  const righe = [];
  for (const blocco of html.split('class="tournament"').slice(1)) {
    const campo = (c) => testo(blocco.match(new RegExp(`class="${c}"[^>]*>([\\s\\S]*?)<\\/p>`))?.[1] ?? '');
    const nome = campo('name');
    if (!nome) continue;
    const t = campo('tempo');
    const ms = inMs(t);
    righe.push({
      posizione: Number(campo('positions')) || null,
      naz: campo('nazione') || null,
      nome: nomeProprio(nome),
      anno: Number(campo('anno')) || null,
      societa: campo('societa'),
      ms,
      stato: ms ? null : (t.toUpperCase() || null),
    });
  }
  return righe;
}

/** Somiglianza tra due nomi di gara (parole in comune). */
export function somiglianza(a, b) {
  const parole = (t) => new Set(slug(t).split('-').filter((p) => p.length > 1 || /\d/.test(p)));
  const x = parole(a);
  const y = parole(b);
  const comuni = [...x].filter((p) => y.has(p)).length;
  return comuni / Math.max(1, Math.min(x.size, y.size));
}

const PAUSA = 250;
const pausa = (ms) => new Promise((r) => { setTimeout(r, ms); });
const ORE_CALENDARIO = 6;
const GIORNI_INDIETRO = 21;
const GIORNI_AVANTI = 45;
const MAX_GARE_PER_GIRO = 1;

/** Un giro sulle gare di tutta Italia: calendario ogni tanto, una gara finita per volta. */
export async function aggiornaNazionali({
  db, fonti, scarica, adesso = new Date().toISOString(), log = console.log, puoScrivere = () => true,
}) {
  if (!fonti?.naz) return { saltato: true };
  const chiedi = async (vista, campi) => {
    await pausa(PAUSA);
    return scarica(`${fonti.naz}&currentpage=${campi.pagina ?? 1}&format=json&view=${vista}`, {
      metodo: 'POST',
      modulo: Object.fromEntries(Object.entries({ 'solr[settore]': 'NUO', ...campi.solr }).filter(([, v]) => v !== undefined)),
    });
  };
  const oggi = oggiRoma(adesso);
  const stato = (await db.leggi('meta/italia')) ?? {};
  stato.gare ??= {};
  stato.fatte ??= {};
  let scritte = false;

  // 1. Calendario (ogni qualche ora): dalla stagione in corso, finché le gare sono entro 45 giorni.
  const vecchio = !stato.calendario || Date.now() - new Date(stato.calendario).getTime() > ORE_CALENDARIO * 3_600_000;
  if (vecchio) {
    const elenco = new Map();
    for (let pagina = 1; pagina <= 12; pagina++) {
      let voci;
      try {
        voci = leggiCalendario(await chiedi('calendario', { pagina, solr: { 'solr[stagione]': stagione(oggi) } }));
      } catch (e) {
        log(`Calendario non letto: ${e.message}`);
        break;
      }
      for (const v of voci) elenco.set(v.id, v);
      if (!voci.length || voci[voci.length - 1].dal > piuGiorni(oggi, GIORNI_AVANTI)) break;
    }
    if (elenco.size) {
      const limite = piuGiorni(oggi, -GIORNI_INDIETRO * 3);
      for (const [id, g] of Object.entries(stato.gare)) if (g.al < limite) delete stato.gare[id];
      for (const v of elenco.values()) {
        if (v.al < limite || v.dal > piuGiorni(oggi, GIORNI_AVANTI)) continue;
        stato.gare[v.id] = { ...stato.gare[v.id], ...v };
      }
      stato.calendario = adesso;
      scritte = true;
      log(`Calendario nazionale: ${elenco.size} gare lette.`);
    }
  }

  // Le gare del Lazio già seguite in diretta non si ripetono.
  const diretta = (await db.leggi('meta/gare-diretta'))?.gare ?? [];
  const doppia = (g) => diretta.some((d) => d.dal === g.dal && somiglianza(d.nome, g.nome) >= 0.6);

  // 2. Una gara finita (con i risultati) non ancora letta, dalla più vecchia.
  const daFare = Object.values(stato.gare)
    .filter((g) => g.risultati && !stato.fatte[g.id] && g.al >= piuGiorni(oggi, -GIORNI_INDIETRO) && !doppia(g))
    .sort((a, b) => a.al.localeCompare(b.al))
    .slice(0, MAX_GARE_PER_GIRO);
  const esito = { lette: 0, atleti: 0 };
  for (const g of daFare) {
    if (!puoScrivere()) break;
    try {
      const n = await leggiGaraNazionale({ db, g, chiedi, adesso, log });
      esito.lette++;
      esito.atleti += n;
      stato.fatte[g.id] = adesso;
      scritte = true;
    } catch (e) {
      log(`Gara ${g.id} non letta: ${e.message}`);
      stato.fatte[g.id] = `errore ${adesso}`;
      scritte = true;
    }
  }

  // 3. Elenco per l'app (senza i doppioni delle gare in diretta).
  if (scritte) {
    for (const id of Object.keys(stato.fatte)) if (!stato.gare[id]) delete stato.fatte[id];
    const elenco = Object.values(stato.gare)
      .filter((g) => !doppia(g))
      .map((g) => ({
        id: g.id,
        nome: g.nome,
        luogo: g.luogo,
        dal: g.dal,
        al: g.al,
        vasca: g.vasca,
        fonte: 'italia',
        ...(g.regione ? { regione: g.regione } : {}),
        ...(stato.fatte[g.id] && !String(stato.fatte[g.id]).startsWith('errore') ? { conta: g.conta ?? 0 } : {}),
      }))
      .sort((a, b) => b.dal.localeCompare(a.dal) || a.nome.localeCompare(b.nome));
    await db.scrivi('meta/gare-italia', { gare: elenco, aggiornato: comeData(adesso) });
    await db.scrivi('meta/italia', stato);
  }
  return esito;
}

/** Legge e salva i risultati di una gara nazionale. Restituisce quanti atleti ha aggiornato. */
async function leggiGaraNazionale({
  db, g, chiedi, adesso, log,
}) {
  const evento = leggiEvento(await chiedi('risultati', { solr: { 'solr[id_evento]': g.fid } }));
  const vasca = evento.vasca ?? g.vasca ?? 25;
  const lazio = /lazio/i.test(evento.comitato);
  const regione = nomeProprio(evento.comitato.replace(/comitato\s+regionale\s*/i, '').trim()) || null;

  // Atleti già conosciuti (le schede si aggiornano solo per loro, a meno che la gara sia del Lazio).
  const noti = new Set((await db.leggi('meta/atleti-noti'))?.k ?? []);
  const primati = new Map();
  const categorie = new Map();
  const atleti = new Map();
  const toccati = new Set();
  let conta = 0;

  for (const c of evento.classifiche) {
    let righe;
    try {
      righe = leggiClassifica(await chiedi('dettagliorisultati', {
        solr: {
          'solr[id_evento]': c.idEvento,
          'solr[codice_gara]': c.codice,
          'solr[id_categoria]': c.idCategoria,
          'solr[sesso]': c.sesso,
        },
      }));
    } catch (e) {
      log(`Classifica ${c.gara.breve} ${c.categoria} non letta: ${e.message}`);
      continue;
    }
    const idCat = slug(`${c.categoria} ${c.sesso === 'F' ? 'femmine' : 'maschi'}`);
    if (!categorie.has(idCat)) {
      categorie.set(idCat, {
        cat: idCat, nome: nomeCategoria(`${c.categoria} ${c.sesso === 'F' ? 'femmine' : 'maschi'}`), sx: c.sesso, sede: '', eventi: [],
      });
    }
    const percorso = `primati/${vasca}-${c.gara.codice}-${c.sesso}`;
    if (!c.gara.staffetta && !primati.has(percorso)) {
      primati.set(percorso, (await db.leggi(percorso))?.atleti ?? {});
    }
    const tabella = primati.get(percorso);
    const st = stagione(g.al);
    const uscita = [];
    for (const r of righe) {
      const k = c.gara.staffetta ? null : `${slug(r.nome).slice(0, 60)}${r.anno ? `-${r.anno}` : ''}`;
      const riga = { n: r.nome, s: r.societa, p: r.posizione };
      if (k) riga.k = k;
      if (r.anno) riga.y = r.anno;
      if (r.ms) riga.t = r.ms;
      if (r.stato) riga.x = r.stato;
      const pt = punti(r.ms, c.gara.codice, c.sesso, vasca, g.al);
      if (pt) riga.pt = pt;
      if (k && r.ms && tabella) {
        const prima = leggiPrimato(tabella[k]);
        if (prima?.p && r.ms < prima.p) {
          riga.b = 'PB';
          riga.dp = r.ms - prima.p;
        } else if (prima?.st === st && prima.s && r.ms < prima.s) {
          riga.b = 'SB';
        }
        if ((noti.has(k) || lazio) && (!prima || r.ms < prima.p || prima.st !== st || r.ms < prima.s)) {
          tabella[k] = [Math.min(r.ms, prima?.p ?? Infinity), prima?.st === st ? Math.min(r.ms, prima.s ?? Infinity) : r.ms, st].join('|');
          toccati.add(percorso);
        }
      }
      uscita.push(riga);
      conta++;
      if (k && (r.ms || r.stato) && (noti.has(k) || lazio)) {
        if (!atleti.has(k)) atleti.set(k, { n: r.nome, y: r.anno, s: r.societa, sx: c.sesso, naz: r.naz, risultati: [] });
        const voce = {
          i: `${g.id}|${c.codice}|${c.idCategoria}|${c.sesso}|${k}`,
          g: g.id, gn: g.nome, l: g.luogo, d: g.al, c: c.gara.codice, v: vasca, cat: categorie.get(idCat).nome, ci: idCat,
        };
        if (riga.t) voce.t = riga.t;
        if (riga.x) voce.x = riga.x;
        if (riga.pt) voce.pt = riga.pt;
        if (riga.b) voce.b = riga.b;
        if (riga.dp) voce.dp = riga.dp;
        atleti.get(k).risultati.push(voce);
      }
    }
    categorie.get(idCat).eventi.push({ c: c.gara.codice, n: c.gara.nome, b: [{ n: 0, tu: '', d: g.al, r: uscita }] });
  }

  // Documenti della gara.
  const scritture = [];
  const riassunto = [];
  for (const [id, doc] of categorie) {
    doc.eventi.sort((a, b) => ordineGara(a.c) - ordineGara(b.c));
    scritture.push({ percorso: `gare/${g.id}/categorie/${id}`, dati: { ...doc, aggiornato: comeData(adesso) } });
    riassunto.push({
      id, nome: doc.nome, sx: doc.sx, docs: [id],
      gare: doc.eventi.map((e) => ({ c: e.c, n: e.n, conta: e.b[0].r.length })),
    });
  }
  riassunto.sort((a, b) => a.nome.localeCompare(b.nome, 'it', { numeric: true }));
  scritture.push({
    percorso: `gare/${g.id}`,
    dati: {
      nome: g.nome,
      luogo: g.luogo,
      dal: g.dal,
      al: g.al,
      vasca,
      regione,
      fonte: 'italia',
      impianto: nomeProprio(evento.impianto),
      categorieAmmesse: evento.categorieAmmesse,
      sedi: evento.impianto ? [nomeProprio(evento.impianto)] : [],
      conta,
      categorie: riassunto,
      aggiornato: comeData(adesso),
    },
  });
  for (const p of toccati) scritture.push({ percorso: p, dati: { atleti: primati.get(p), aggiornato: comeData(adesso) } });
  await db.scriviTanti(scritture);

  // Schede degli atleti, indice di ricerca ed elenco dei conosciuti.
  const avanzate = [];
  const indici = new Map();
  for (const [k, a] of atleti) {
    const dati = { n: a.n, s: a.s, sx: a.sx };
    if (a.y) dati.y = a.y;
    if (a.naz) dati.naz = a.naz;
    avanzate.push({
      percorso: `atleti/${k}`, dati, maschera: Object.keys(dati), aggiungi: { r: a.risultati }, oraServer: ['agg'],
    });
    if (!noti.has(k)) {
      for (const l of iniziali(a.n)) {
        if (!indici.has(l)) indici.set(l, []);
        indici.get(l).push(`${k}|${a.n}|${a.y ?? ''}|${a.s}`);
      }
    }
  }
  for (const [l, voci] of indici) {
    avanzate.push({ percorso: `indici/${l}`, dati: {}, maschera: [], aggiungi: { l: voci }, oraServer: ['agg'] });
  }
  const nuovi = [...atleti.keys()].filter((k) => !noti.has(k));
  if (nuovi.length) avanzate.push({ percorso: 'meta/atleti-noti', dati: {}, maschera: [], aggiungi: { k: nuovi } });
  if (avanzate.length) await db.commit(avanzate);
  g.conta = conta;
  g.regione = regione;
  log(`Gara ${g.nome} (${g.luogo}): ${evento.classifiche.length} classifiche, ${conta} righe, ${atleti.size} schede.`);
  return atleti.size;
}

