// Gare in diretta: legge l'elenco delle ultime gare, scarica i risultati delle sedi che stanno
// gareggiando (o mai lette prima), li salva "a pacchetti" su Firestore e avvisa chi segue gli atleti.
//
// Documenti scritti:
//   gare/{gara}                         riassunto della gara (categorie, gare, sedi)
//   gare/{gara}/categorie/{sede~cat}    batterie e risultati di una categoria in una sede
//   atleti/{chiave}                     scheda dell'atleta (si aggiungono i risultati, senza rileggerla)
//   indici/{lettera}                    elenco per la ricerca degli atleti
//   primati/{vasca}-{gara}-{sesso}      personale e stagionale di ogni atleta (per i badge PB/SB)
//   stato-live/{sede}                   righe già viste di una sede (per capire cosa è nuovo)
//   meta/live                           stato delle sedi e delle gare
//   meta/gare                           elenco delle gare per l'app (una sola lettura)
import {
  leggiElenco, raggruppa, leggiRisultati, nomeCat,
} from './live.js';
import { punti } from './punti.js';
import {
  formatta, oggiRoma, piuGiorni, impronta, slug, ordineGara,
} from './tempi.js';
import { comeData } from './firestore.js';

export const MAX_NUOVE_SEDI = 2;
const GIORNI_ELENCO = 400;

/** Stagione agonistica: da settembre ad agosto ("2026" = 2026/27). */
export function stagione(data = '') {
  const anno = Number(data.slice(0, 4));
  const mese = Number(data.slice(5, 7));
  return String(mese >= 9 ? anno : anno - 1);
}

const sedeBreve = (sede) => sede.slice(0, 8);

/** Iniziali (senza accenti) delle parole di un nome: le "lettere" dell'indice di ricerca. */
export function iniziali(nome = '') {
  return [...new Set(slug(nome).split('-').filter((p) => p.length > 1).map((p) => (/^[a-z]/.test(p) ? p[0] : '_')))];
}
const docCategoria = (sede, cat) => `${sedeBreve(sede)}~${cat}`;
const percorsoPrimati = (vasca, codice, sesso) => `primati/${vasca}-${codice}-${sesso}`;

/** Primato salvato come "personale|stagionale|stagione" (un solo campo per atleta). */
export function leggiPrimato(testo) {
  if (!testo) return null;
  const [p, s, st] = String(testo).split('|');
  return { p: Number(p) || null, s: Number(s) || null, st };
}

const valoreRiga = (r) => `${r.ms ?? r.stato ?? ''}`;

/** Righe già viste di una sede: id -> "valore|badge|differenza". */
export function leggiNoti(righe = {}) {
  const noti = new Map();
  for (const [id, testo] of Object.entries(righe)) {
    const [v, b, dp] = String(testo).split('|');
    noti.set(id, { v, b: b || null, dp: dp ? Number(dp) : null });
  }
  return noti;
}

/**
 * Costruisce i documenti di una sede.
 * - `primati`: Map percorso -> { chiave: "personale|stagionale|stagione" } per ogni atleta;
 *   si aggiorna solo con le righe nuove o cambiate (in ordine di data).
 * - `noti`: righe già viste nei giri precedenti, con il loro badge (PB/SB) già deciso.
 * Restituisce i documenti delle categorie, le schede atleta da aggiornare (solo righe nuove),
 * i percorsi dei primati toccati, le righe nuove e lo stato da ricordare.
 */
export function costruisciSede({
  gara, sede, piscina, righe, primati, noti = new Map(),
}) {
  const categorie = new Map();
  const atleti = new Map();
  const toccati = new Set();
  const nuove = [];
  const ricorda = {};

  // In ordine di data e turno: il personale "prima" di un tempo esclude quelli venuti dopo.
  const ordinate = [...righe].sort((a, b) => (a.data ?? '').localeCompare(b.data ?? '')
    || a.turno.localeCompare(b.turno) || a.batteria - b.batteria || (a.corsia ?? 0) - (b.corsia ?? 0));

  for (const r of ordinate) {
    const idCat = slug(r.categoria) || 'categoria';
    const id = docCategoria(sede, idCat);
    if (!categorie.has(id)) {
      categorie.set(id, {
        cat: idCat, nome: nomeCat(r.categoria), sx: r.sesso, sede: piscina, eventi: new Map(),
      });
    }
    const cat = categorie.get(id);
    if (cat.sx !== r.sesso) cat.sx = 'X';
    if (!cat.eventi.has(r.gara.codice)) {
      cat.eventi.set(r.gara.codice, { c: r.gara.codice, n: r.gara.nome, b: new Map() });
    }
    const evento = cat.eventi.get(r.gara.codice);
    const chiaveBatt = `${r.turno}|${r.batteria}`;
    if (!evento.b.has(chiaveBatt)) {
      evento.b.set(chiaveBatt, { n: r.batteria, tu: r.turno, d: r.data, r: [] });
    }

    const riga = { n: r.atleta.nome, s: r.societa, c: r.corsia, p: r.posizione };
    if (r.atleta.chiave) riga.k = r.atleta.chiave;
    if (r.atleta.anno) riga.y = r.atleta.anno;
    if (r.ms) riga.t = r.ms;
    if (r.stato) riga.x = r.stato;
    if (r.parziali.length) riga.sp = r.parziali.map((p) => (p.p ? { m: p.m, t: p.ms, p: p.p } : { m: p.m, t: p.ms }));
    const pt = punti(r.ms, r.gara.codice, r.sesso, gara.vasca, r.data);
    if (pt) riga.pt = pt;

    const v = valoreRiga(r);
    const noto = noti.get(r.id);
    const nuova = !noto || noto.v !== v;
    if (!nuova) {
      if (noto.b) riga.b = noto.b;
      if (noto.dp) riga.dp = noto.dp;
    } else if (r.atleta.chiave && r.ms && !r.gara.staffetta) {
      // Personale e stagionale, confrontati con quello che sapevamo prima di questo tempo.
      const percorso = percorsoPrimati(gara.vasca, r.gara.codice, r.sesso);
      if (!primati.has(percorso)) primati.set(percorso, {});
      const tabella = primati.get(percorso);
      const st = stagione(r.data ?? gara.dal);
      const prima = leggiPrimato(tabella[r.atleta.chiave]);
      if (prima?.p && r.ms < prima.p) {
        riga.b = 'PB';
        riga.dp = r.ms - prima.p;
      } else if (prima?.st === st && prima.s && r.ms < prima.s) {
        riga.b = 'SB';
      }
      if (!prima || r.ms < prima.p || prima.st !== st || r.ms < prima.s) {
        tabella[r.atleta.chiave] = [
          Math.min(r.ms, prima?.p ?? Infinity),
          prima?.st === st ? Math.min(r.ms, prima.s ?? Infinity) : r.ms,
          st,
        ].join('|');
        toccati.add(percorso);
      }
    }
    ricorda[r.id] = [v, riga.b ?? '', riga.dp ?? ''].join('|').replace(/\|+$/, '');
    evento.b.get(chiaveBatt).r.push(riga);
    if (!nuova) continue;
    nuove.push({ riga: r, uscita: riga });

    // Scheda dell'atleta: solo i risultati nuovi.
    if (r.atleta.chiave && (r.ms || r.stato === 'Squalificato')) {
      if (!atleti.has(r.atleta.chiave)) {
        atleti.set(r.atleta.chiave, {
          n: r.atleta.nome, y: r.atleta.anno, s: r.societa, sx: r.sesso, naz: r.atleta.naz,
          cod: r.atleta.codice, risultati: [],
        });
      }
      const voce = {
        i: `${gara.id}|${r.id}`,
        g: gara.id,
        gn: gara.nome,
        l: gara.luogo,
        d: r.data ?? gara.dal,
        c: r.gara.codice,
        v: gara.vasca,
        cat: nomeCat(r.categoria),
        ci: idCat,
      };
      if (r.ms) voce.t = r.ms;
      if (r.stato) voce.x = r.stato;
      if (riga.pt) voce.pt = riga.pt;
      if (riga.b) voce.b = riga.b;
      if (riga.dp) voce.dp = riga.dp;
      if (riga.sp) voce.sp = riga.sp;
      atleti.get(r.atleta.chiave).risultati.push(voce);
    }
  }

  // Map -> strutture salvabili, in ordine.
  const documenti = new Map();
  for (const [id, cat] of categorie) {
    const eventi = [...cat.eventi.values()]
      .sort((a, b) => ordineGara(a.c) - ordineGara(b.c))
      .map((e) => ({
        c: e.c,
        n: e.n,
        b: [...e.b.values()]
          .sort((a, b) => a.tu.localeCompare(b.tu) || a.n - b.n)
          .map((b) => ({ ...b, r: b.r.sort((x, y) => (x.p ?? 99) - (y.p ?? 99) || (x.t ?? 9e9) - (y.t ?? 9e9)) })),
      }));
    documenti.set(id, {
      cat: cat.cat, nome: cat.nome, sx: cat.sx, sede: cat.sede, eventi,
    });
  }
  return {
    documenti, atleti, primatiToccati: toccati, nuove, ricorda,
  };
}

/** Riassunto di una categoria per il documento della gara. */
function riassuntoCategoria(doc) {
  return {
    nome: doc.nome,
    sx: doc.sx,
    gare: doc.eventi.map((e) => ({ c: e.c, n: e.n, conta: e.b.reduce((t, b) => t + b.r.length, 0) })),
  };
}

/** Documento della gara a partire dallo stato di tutte le sue sedi. */
export function documentoGara(info, sediStato, adesso) {
  const categorie = new Map();
  let conta = 0;
  const sedi = [];
  for (const [sede, s] of sediStato) {
    if (s.piscina && !sedi.includes(s.piscina)) sedi.push(s.piscina);
    for (const [idCat, c] of Object.entries(s.cat ?? {})) {
      if (!categorie.has(idCat)) categorie.set(idCat, { id: idCat, nome: c.nome, sx: c.sx, docs: [], gare: new Map() });
      const cat = categorie.get(idCat);
      cat.docs.push(docCategoria(sede, idCat));
      for (const g of c.gare ?? []) {
        const prec = cat.gare.get(g.c);
        cat.gare.set(g.c, { c: g.c, n: g.n, conta: (prec?.conta ?? 0) + g.conta });
        conta += g.conta;
      }
    }
  }
  return {
    nome: info.nome,
    luogo: info.luogo,
    dal: info.dal,
    al: info.al,
    vasca: info.vasca,
    regione: 'Lazio',
    fonte: 'diretta',
    master: /master/i.test(info.nome),
    sedi,
    conta,
    categorie: [...categorie.values()]
      .sort((a, b) => a.nome.localeCompare(b.nome, 'it', { numeric: true }))
      .map((c) => ({ ...c, gare: [...c.gare.values()].sort((a, b) => ordineGara(a.c) - ordineGara(b.c)) })),
    aggiornato: comeData(adesso),
  };
}

/** Testo della notifica per un nuovo tempo di un atleta seguito. */
export function messaggioTempo(atleta, voce, gara, sito) {
  const nome = atleta.n.split(' ')[0];
  const pb = voce.b === 'PB';
  const titolo = pb ? `Nuovo personale per ${nome}!` : `${atleta.n} ha nuotato`;
  const pezzi = [`${voce.gara.breve} in ${formatta(voce.t)}`];
  if (pb && voce.dp) pezzi.push(`−${formatta(-voce.dp).replace(/^0"/, '0"')}`);
  if (voce.pt) pezzi.push(`${voce.pt} punti`);
  pezzi.push(gara.nome);
  return {
    titolo,
    corpo: pezzi.join(' · ').slice(0, 180),
    url: `${sito}/#/atleta/${encodeURIComponent(voce.k)}`,
    tag: `tempo-${voce.k}-${voce.gara.codice}`,
  };
}

/** Un giro sulle gare in diretta. */
export async function aggiornaGare({
  db, fonti, scarica, invio, sito, adesso = new Date().toISOString(), log = console.log, puoScrivere = () => true,
}) {
  if (!fonti?.live || !fonti?.liveGara) {
    log('Gare in diretta: fonte non configurata, salto.');
    return { saltato: true };
  }
  const voci = leggiElenco(await scarica(fonti.live));
  if (!voci.length) {
    log('Gare in diretta: elenco vuoto o non riconosciuto.');
    return { gare: 0 };
  }
  const gruppi = raggruppa(voci);
  const oggi = oggiRoma(adesso);
  const stato = (await db.leggi('meta/live')) ?? {};
  stato.sedi ??= {};
  stato.gare ??= {};

  // Una volta sola: l'indice di ricerca passa a "un'iniziale per ogni parola del nome".
  if (stato.indiceV !== 2 && Object.keys(stato.sedi).length && db.elenca) {
    const tutti = await db.elenca('atleti');
    const perLettera = new Map();
    for (const a of tutti) {
      for (const l of iniziali(a.n)) {
        if (!perLettera.has(l)) perLettera.set(l, []);
        perLettera.get(l).push(`${a.id}|${a.n}|${a.y ?? ''}|${a.s ?? ''}`);
      }
    }
    await db.commit([
      ...[...perLettera].map(([l, voci]) => ({
        percorso: `indici/${l}`, dati: {}, maschera: [], aggiungi: { l: voci }, oraServer: ['agg'],
      })),
      { percorso: 'meta/atleti-noti', dati: {}, maschera: [], aggiungi: { k: tutti.map((a) => a.id) } },
    ]);
    stato.indiceV = 2;
    await db.scrivi('meta/live', stato);
    log(`Indice di ricerca rifatto: ${tutti.length} atleti.`);
  }
  stato.indiceV = 2;

  // Quali sedi scaricare: quelle in gara (fino al giorno dopo) e, poche per volta, quelle mai lette.
  const inGara = [];
  const nuove = [];
  for (const g of gruppi) {
    for (const s of g.sedi) {
      if (g.dal <= oggi && oggi <= piuGiorni(g.al, 1)) inGara.push({ g, s });
      else if (!stato.sedi[s.sede]) nuove.push({ g, s });
    }
  }
  nuove.sort((a, b) => a.g.dal.localeCompare(b.g.dal));
  const daLeggere = [...inGara, ...nuove.slice(0, MAX_NUOVE_SEDI)];

  const garaToccata = new Set();
  const tuttiAtleti = new Map();
  const nuoviTempi = [];
  const primati = new Map();
  const primatiToccati = new Set();
  let scritture = [];

  for (const { g, s } of daLeggere) {
    if (!puoScrivere()) {
      log('Gare in diretta: tetto giornaliero di scritture quasi raggiunto, mi fermo.');
      break;
    }
    let corpo;
    try {
      corpo = await scarica(fonti.liveGara + s.sede);
    } catch (e) {
      log(`Sede ${sedeBreve(s.sede)} non letta: ${e.message}`);
      continue;
    }
    const firma = impronta(corpo);
    const prima = stato.sedi[s.sede];
    if (prima?.firma === firma) continue;

    let righe;
    try {
      righe = leggiRisultati(corpo);
    } catch (e) {
      log(`Sede ${sedeBreve(s.sede)}: risultati non leggibili (${e.message}).`);
      continue;
    }
    const noti = prima ? leggiNoti((await db.leggi(`stato-live/${s.sede}`))?.righe) : new Map();

    // Personali e stagionali: si leggono le tabelle delle gare coinvolte (una lettura ciascuna).
    const servono = new Set(righe.filter((r) => r.ms && r.atleta.chiave && !r.gara.staffetta)
      .map((r) => percorsoPrimati(g.vasca, r.gara.codice, r.sesso)).filter((p) => !primati.has(p)));
    if (servono.size) {
      const letti = await db.leggiTanti([...servono]);
      for (const [p, dati] of letti) primati.set(p, dati?.atleti ?? {});
    }
    const {
      documenti, atleti, primatiToccati: toccati, nuove: righeNuove, ricorda,
    } = costruisciSede({
      gara: g, sede: s.sede, piscina: s.piscina, righe, primati, noti,
    });
    toccati.forEach((p) => primatiToccati.add(p));

    // Documenti delle categorie cambiate.
    const riassunto = {
      gara: g.id, piscina: s.piscina, firma, cat: {}, conta: righe.length, letto: adesso,
    };
    for (const [id, doc] of documenti) {
      const f = impronta(JSON.stringify(doc));
      riassunto.cat[doc.cat] = { ...riassuntoCategoria(doc), firma: f };
      if (prima?.cat?.[doc.cat]?.firma !== f) {
        scritture.push({ percorso: `gare/${g.id}/categorie/${id}`, dati: { ...doc, aggiornato: comeData(adesso) } });
      }
    }
    scritture.push({ percorso: `stato-live/${s.sede}`, dati: { righe: ricorda, aggiornato: comeData(adesso) } });
    stato.sedi[s.sede] = riassunto;
    stato.gare[g.id] = {
      nome: g.nome, luogo: g.luogo, dal: g.dal, al: g.al, vasca: g.vasca, sedi: g.sedi.map((x) => x.sede),
    };
    garaToccata.add(g.id);

    for (const [k, a] of atleti) {
      if (!tuttiAtleti.has(k)) tuttiAtleti.set(k, { ...a, risultati: [] });
      tuttiAtleti.get(k).risultati.push(...a.risultati);
    }
    // Avvisi solo per le sedi già lette in passato (niente notifiche per i risultati vecchi).
    if (prima) {
      for (const { riga: r, uscita } of righeNuove) {
        if (!uscita.k || !uscita.t || r.gara.staffetta) continue;
        nuoviTempi.push({ ...uscita, gara: r.gara, garaId: g.id, garaNome: g.nome });
      }
    }
    log(`Sede ${s.piscina || sedeBreve(s.sede)} (${g.nome}): ${righe.length} righe, ${righeNuove.length} nuove.`);
  }

  // Documenti delle gare toccate.
  for (const id of garaToccata) {
    const info = stato.gare[id];
    const sedi = new Map(info.sedi.filter((x) => stato.sedi[x]).map((x) => [x, stato.sedi[x]]));
    scritture.push({ percorso: `gare/${id}`, dati: documentoGara(info, sedi, adesso) });
  }

  // Primati aggiornati.
  for (const p of primatiToccati) {
    scritture.push({ percorso: p, dati: { atleti: primati.get(p) ?? {}, aggiornato: comeData(adesso) } });
  }

  // Elenco delle gare per l'app.
  if (garaToccata.size) {
    const limite = piuGiorni(oggi, -GIORNI_ELENCO);
    for (const [id, info] of Object.entries(stato.gare)) {
      if (info.al < limite) {
        for (const sd of info.sedi ?? []) delete stato.sedi[sd];
        delete stato.gare[id];
      }
    }
    const elenco = Object.entries(stato.gare)
      .map(([id, info]) => ({
        id,
        nome: info.nome,
        luogo: info.luogo,
        dal: info.dal,
        al: info.al,
        vasca: info.vasca,
        fonte: 'diretta',
        regione: 'Lazio',
        conta: (info.sedi ?? []).reduce((t, sd) => t + (stato.sedi[sd]?.conta ?? 0), 0),
      }))
      .filter((x) => x.conta > 0)
      .sort((a, b) => b.dal.localeCompare(a.dal) || a.nome.localeCompare(b.nome));
    scritture.push({ percorso: 'meta/gare-diretta', dati: { gare: elenco, aggiornato: comeData(adesso) } });
  }

  // Scritture "semplici" (documenti interi).
  if (scritture.length) await db.scriviTanti(scritture);
  scritture = [];

  // Schede degli atleti e indice di ricerca: si aggiunge senza rileggere.
  const avanzate = [];
  const indici = new Map();
  for (const [k, a] of tuttiAtleti) {
    const dati = { n: a.n, s: a.s, sx: a.sx };
    if (a.y) dati.y = a.y;
    if (a.naz) dati.naz = a.naz;
    avanzate.push({
      percorso: `atleti/${k}`,
      dati,
      maschera: Object.keys(dati),
      aggiungi: { r: a.risultati, ...(a.cod ? { cod: [a.cod] } : {}) },
      oraServer: ['agg'],
    });
    // Una voce per l'iniziale di ogni parola del nome: si trova cercando sia il nome sia il cognome.
    for (const lettera of iniziali(a.n)) {
      if (!indici.has(lettera)) indici.set(lettera, []);
      indici.get(lettera).push(`${k}|${a.n}|${a.y ?? ''}|${a.s}`);
    }
  }
  for (const [lettera, voci] of indici) {
    avanzate.push({ percorso: `indici/${lettera}`, dati: {}, maschera: [], aggiungi: { l: voci }, oraServer: ['agg'] });
  }
  // Elenco delle chiavi conosciute: serve alle gare di tutta Italia per aggiornare solo i "nostri" atleti.
  if (tuttiAtleti.size) avanzate.push({ percorso: 'meta/atleti-noti', dati: {}, maschera: [], aggiungi: { k: [...tuttiAtleti.keys()] } });
  if (avanzate.length) await db.commit(avanzate);

  // Stato per il prossimo giro.
  if (garaToccata.size) await db.scrivi('meta/live', stato);

  // Notifiche a chi segue gli atleti con tempi nuovi.
  let conteggi = { push: 0, errori: 0, utenti: 0 };
  if (nuoviTempi.length && invio) {
    conteggi = await avvisaTempi({ db, invio, nuoviTempi, atleti: tuttiAtleti, sito, log });
  }
  return { sedi: daLeggere.length, gare: garaToccata.size, atleti: tuttiAtleti.size, nuoviTempi: nuoviTempi.length, ...conteggi };
}

/** Manda "è uscito il tuo tempo" a chi segue gli atleti. Al massimo 3 notifiche per persona per giro. */
export async function avvisaTempi({ db, invio, nuoviTempi, atleti, sito, log = console.log }) {
  const chiavi = [...new Set(nuoviTempi.map((t) => t.k))];
  const utenti = await db.contieneUno('users', 'seguiti', chiavi);
  const conteggi = { push: 0, errori: 0, utenti: 0 };
  for (const u of utenti) {
    if (u.pushOn === false || !u.tokens?.length) continue;
    const loro = nuoviTempi.filter((t) => u.seguiti?.includes(t.k));
    if (!loro.length) continue;
    conteggi.utenti++;
    let messaggi = loro.map((t) => messaggioTempo(atleti.get(t.k) ?? { n: t.n }, t, { nome: t.garaNome }, sito));
    if (messaggi.length > 3) {
      const nomi = [...new Set(loro.map((t) => t.n.split(' ')[0]))];
      messaggi = [{
        titolo: `${loro.length} tempi nuovi`,
        corpo: `${nomi.slice(0, 4).join(', ')}${nomi.length > 4 ? ' e altri' : ''}: apri Cloro per vederli.`,
        url: `${sito}/#/`,
        tag: 'tempi-nuovi',
      }];
    }
    const nonValidi = new Set();
    for (const token of u.tokens) {
      for (const m of messaggi) {
        const esito = await invio.push(token, m);
        if (esito === 'ok') conteggi.push++;
        else if (esito === 'token-non-valido') { nonValidi.add(token); break; } else conteggi.errori++;
      }
    }
    if (nonValidi.size) {
      await db.aggiorna(`users/${u.id}`, { tokens: u.tokens.filter((t) => !nonValidi.has(t)) }).catch(() => {});
    }
  }
  log(`Tempi nuovi: ${nuoviTempi.length}, avvisate ${conteggi.utenti} persone (${conteggi.push} notifiche).`);
  return conteggi;
}
