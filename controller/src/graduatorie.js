// Graduatorie nazionali: per ogni stagione, vasca, sesso e gara, il miglior tempo di ogni atleta
// del Lazio (dalla stagione 2018/19, da quando i tempi sono solo con cronometraggio automatico).
// Con queste si completano le schede degli atleti (personali e stagionali di ogni anno),
// i primati usati per i badge PB/SB e le pagine delle squadre.
//
// Documenti scritti:
//   atleti/{chiave}                      si aggiungono i migliori tempi di stagione
//   ricerca/{xx}, noti/{x}               atleti nuovi
//   primati/{vasca}-{gara}-{sesso}        personale e stagionale aggiornati
//   squadre/{id}                         componenti, migliori di sempre per gara
//   squadre/{id}/stagioni/{stagione}     tutti i migliori tempi di quella stagione
//   meta/squadre                         elenco delle squadre per l'app
//   meta/graduatorie                     stagioni già lette
import {
  inMs, nomeProprio, chiaveAtleta, oggiRoma,
} from './tempi.js';
import { punti } from './punti.js';
import { comeData } from './firestore.js';
import { stagione, leggiPrimato } from './gare.js';
import {
  scrittureRicerca, scrittureNoti, leggiNotiTutti, chiaveSquadra, scrittureCerca, leggiIndicizzati, scrittureIndicizzati,
} from './ricerca.js';
import { preparaPacchi } from './pacchi.js';
import { migraCerca } from './ricerca.js';

export const CODICI = {
  '00': '50SL', '01': '100SL', '02': '200SL', '04': '400SL', '08': '800SL', 15: '1500SL',
  20: '50DO', 21: '100DO', 22: '200DO', 30: '50RA', 31: '100RA', 32: '200RA',
  40: '50FA', 41: '100FA', 42: '200FA', 51: '100MI', 52: '200MI', 54: '400MI',
};
export const PRIMA_STAGIONE = 2018;
const COMITATO = '12'; // Lazio
const VASCHE = [[25, '1'], [50, '2']];
const TOP_SEMPRE = 30;
const PAUSA = 400;
const MESI = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
};
const PARTICELLE = new Set(['de', 'di', 'da', 'del', 'della', 'dello', 'dei', 'degli', 'delle', 'dal', 'dalla', 'dall', 'la', 'lo', 'le', 'li', 'van', 'von', 'mc', 'mac', 'san', 'santa', 'st']);
const pausa = (ms) => new Promise((r) => { setTimeout(r, ms); });

const testo = (h = '') => h.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
const maiuscolo = (t) => t && t === t.toUpperCase() && /[A-Z]/.test(t);

/** "12 Aprile 2026" -> "2026-04-12". */
export function dataIso(t = '') {
  const m = String(t).trim().toLowerCase().match(/^(\d{1,2})\s+([a-zà-ù]+)\s+(\d{4})$/);
  if (!m || !MESI[m[2]]) return null;
  return `${m[3]}-${String(MESI[m[2]]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** "DE ROSSI MARIA CHIARA" -> cognome "De Rossi", nome "Maria Chiara" (il cognome viene prima). */
export function dividiNome(completo = '') {
  const parole = completo.trim().split(/\s+/).filter(Boolean);
  let n = 1;
  while (n < parole.length - 1 && PARTICELLE.has(parole[n - 1].toLowerCase().replace(/['’]/g, ''))) n++;
  return { cognome: nomeProprio(parole.slice(0, n).join(' ')), nome: nomeProprio(parole.slice(n).join(' ')) };
}

/** Una graduatoria (HTML dentro il JSON) -> righe. */
export function leggiGraduatoria(json) {
  const d = typeof json === 'string' ? JSON.parse(json) : json;
  const html = d?.content ?? '';
  const righe = [];
  for (const blocco of html.split(/<div class="row"[^>]*>/).slice(1)) {
    const ms = inMs(blocco.match(/class="tempo">\s*(?:<span>)?\s*([0-9:.,']+)/)?.[1]);
    const dati = blocco.match(/data-id-evento="(\d*)"[^>]*data-id-gara="(\d*)"[^>]*data-id-atleta="(\d*)"[^>]*data-id-turno="(\d*)"/);
    const nome = testo(blocco.match(/data-view="gratleta"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '');
    if (!ms || !nome) continue;
    const societa = [...(blocco.match(/class="societa">([\s\S]*?)<\/div>/)?.[1] ?? '').matchAll(/<span>([\s\S]*?)<\/span>/g)]
      .map((m) => testo(m[1])).filter(Boolean).map((s) => (maiuscolo(s) ? nomeProprio(s) : s));
    const turno = blocco.match(/class="turno"><span title="([^"]*)"/)?.[1] ?? '';
    righe.push({
      ms,
      nome,
      anno: Number(blocco.match(/class="nascita"><span>(\d{4})/)?.[1]) || null,
      societa,
      data: dataIso(testo(blocco.match(/class="data"><span>([^<]*)/)?.[1] ?? '')),
      luogo: nomeProprio(testo(blocco.match(/data-view="grevento"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '')),
      idEvento: dati?.[1] || null,
      idAtleta: dati?.[3] || null,
      idTurno: dati?.[4] || null,
      turno,
    });
  }
  return righe;
}

/** Quale stagione leggere in questo giro: prima quella in corso, poi indietro fino al 2018/19. */
export function scegliStagione(stato, adesso) {
  const corrente = Number(stagione(oggiRoma(adesso)));
  const ore = (s) => (stato.fatte?.[s] ? (Date.parse(adesso) - Date.parse(stato.fatte[s])) / 3_600_000 : Infinity);
  if (ore(corrente) > 20) return corrente;
  if (ore(corrente - 1) > 24 * 7) return corrente - 1; // ritardatari della stagione scorsa
  return null;
}

/** Stagione passata del Lazio da mettere nei pacchi (se non è già stata letta con tutta Italia). */
export function scegliPacchiLazio(stato, adesso) {
  const corrente = Number(stagione(oggiRoma(adesso)));
  for (let s = corrente - 2; s >= PRIMA_STAGIONE; s--) {
    if (!stato.fatte?.[s] && !stato.pacchiLazio?.[s] && !stato.italia?.[s]) return s;
  }
  return null;
}

/** Stagione da leggere per tutta Italia: quella in corso ogni settimana, poi indietro fino al 2018/19. */
export function scegliItalia(stato, adesso) {
  const corrente = Number(stagione(oggiRoma(adesso)));
  const giorni = (s) => (stato.italia?.[s] ? (Date.parse(adesso) - Date.parse(stato.italia[s])) / 86_400_000 : Infinity);
  if (giorni(corrente) > 7) return corrente;
  for (let s = corrente - 1; s >= PRIMA_STAGIONE; s--) if (!stato.italia?.[s]) return s;
  if (giorni(corrente - 1) > 30) return corrente - 1;
  return null;
}

/** Tutti i comitati regionali (per leggere tutta Italia una regione alla volta: ognuna sta sotto le 5000 righe). */
export const TUTTE_LE_REGIONI = ['12', '1', '3', '5', '6', '7', '8', '9', '10', '11', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22'];

/**
 * Legge una stagione e salva tutto. Restituisce il numero di atleti.
 *   modo "schede": una scheda per atleta (atleti/{chiave}) — la stagione in corso del Lazio, aggiornata ogni notte;
 *   modo "pacchi": i migliori della stagione nei pacchi (pochissime scritture) — le stagioni passate e tutta Italia.
 * In entrambi i casi: squadre, e per il Lazio primati e classifiche.
 */
export async function leggiStagione({
  db, chiedi, st, adesso, log = console.log, regioni = [COMITATO], modo = 'schede',
}) {
  const atleti = new Map();
  let richieste = 0;
  for (const reg of regioni) {
    for (const [vasca, idVasca] of VASCHE) {
      for (const sesso of ['M', 'F']) {
        for (const [codFin, codice] of Object.entries(CODICI)) {
        let righe;
        try {
          righe = leggiGraduatoria(await chiedi({
            'solr[sesso]': sesso,
            'solr[id_lunghezza_vasca]': idVasca,
            'solr[kindtime]': '3',
            'solr[stagione]': String(st),
            'solr[codice_gara]': codFin.padStart(2, '0'),
            'solr[id_comitato]': reg,
            'solr[limit]': '5000',
          }));
          richieste++;
        } catch (e) {
          log(`Graduatoria ${st} ${codice} ${sesso} ${vasca}m (regione ${reg}) non letta: ${e.message}`);
          continue;
        }
        for (const r of righe) {
          if (!/individuale/i.test(r.turno) && r.turno) continue;
          const { cognome, nome } = dividiNome(r.nome);
          const k = chiaveAtleta(cognome, nome, r.anno);
          if (!k) continue;
          if (!atleti.has(k)) {
            atleti.set(k, {
              n: `${nome} ${cognome}`.trim(), y: r.anno, sx: sesso, societa: new Set(), fin: r.idAtleta, reg, risultati: [],
            });
          }
          const a = atleti.get(k);
          r.societa.forEach((s) => a.societa.add(s));
          const voce = {
            i: `fg${r.idEvento ?? ''}-${codice}-${r.idTurno ?? ''}`,
            gn: r.luogo || 'Gara FIN',
            l: r.luogo,
            d: r.data ?? `${st}-12-31`,
            c: codice,
            v: vasca,
            t: r.ms,
            f: 1,
          };
          if (r.idEvento) voce.g = `n${r.idEvento}`;
          const pt = punti(r.ms, codice, sesso, vasca, voce.d);
          if (pt) voce.pt = pt;
          a.risultati.push(voce);
        }
        }
      }
    }
  }
  if (!atleti.size) {
    log(`Graduatorie ${st}: nessun tempo letto (${richieste} richieste).`);
    return { atleti: 0, richieste };
  }

  // 1a. Pacchi: tutti gli atleti della stagione in pochi documenti; nell'indice "cerca" chi non c'è ancora.
  if (modo === 'pacchi') {
    const pacchi = preparaPacchi(new Map([...atleti].map(([k, a]) => [k, { ...a, s: [...a.societa][0] ?? '' }])), st);
    await db.scriviTanti([...pacchi].map(([id, dati]) => ({ percorso: `pacchi/${id}`, dati: { ...dati, agg: comeData(adesso) } })));
    const indicizzati = await leggiIndicizzati(db);
    const nuoviIndice = new Map();
    const nuoviLazio = new Map();
    for (const [k, a] of atleti) {
      if (indicizzati.has(k)) continue;
      const voce = {
        n: a.n, y: a.y, s: [...a.societa][0] ?? '', reg: a.reg,
      };
      nuoviIndice.set(k, voce);
      if (a.reg === COMITATO) nuoviLazio.set(k, voce);
    }
    // Il Lazio anche nell'indice a due lettere (ricerca veloce), gli altri solo in quello a tre.
    const soloAltri = new Map([...nuoviIndice].filter(([k]) => !nuoviLazio.has(k)));
    await db.commit([
      ...scrittureRicerca(nuoviLazio), ...scrittureCerca(soloAltri), ...scrittureIndicizzati(nuoviIndice.keys()),
    ]);
    log(`Pacchi ${st}: ${pacchi.size} documenti, ${nuoviIndice.size} atleti nuovi nella ricerca.`);
  }

  // 1b. Schede degli atleti: per quelli già conosciuti si aggiungono solo i tempi (nome e società restano).
  const noti = modo === 'schede' ? await leggiNotiTutti(db) : new Set();
  const operazioni = [];
  const nuovi = new Map();
  for (const [k, a] of modo === 'schede' ? atleti : []) {
    const s = [...a.societa][0] ?? '';
    const dati = noti.has(k) ? {} : { n: a.n, s, sx: a.sx, ...(a.y ? { y: a.y } : {}) };
    operazioni.push({
      percorso: `atleti/${k}`,
      dati,
      maschera: Object.keys(dati),
      aggiungi: { r: a.risultati, ...(a.fin ? { fin: [a.fin] } : {}) },
      oraServer: ['agg'],
    });
    if (!noti.has(k)) nuovi.set(k, { n: a.n, y: a.y, s });
  }
  if (operazioni.length) {
    operazioni.push(...scrittureRicerca(nuovi), ...scrittureNoti(nuovi.keys()));
    await db.commit(operazioni);
  }
  const lazio = new Map([...atleti].filter(([, a]) => a.reg === COMITATO));

  // 2. Primati (badge PB/SB nelle gare in diretta).
  const corrente = stagione(oggiRoma(adesso));
  const percorsi = [];
  for (const [vasca] of VASCHE) for (const sx of ['M', 'F']) for (const c of Object.values(CODICI)) percorsi.push(`primati/${vasca}-${c}-${sx}`);
  const letti = await db.leggiTanti(percorsi);
  const cambiati = new Map();
  for (const [k, a] of lazio) {
    for (const v of a.risultati) {
      const p = `primati/${v.v}-${v.c}-${a.sx}`;
      const tabella = cambiati.get(p) ?? letti.get(p)?.atleti ?? {};
      const prima = leggiPrimato(tabella[k]);
      const pb = Math.min(v.t, prima?.p ?? Infinity);
      let sb = prima?.s ?? null;
      let sst = prima?.st ?? null;
      if (String(st) === corrente) {
        sb = sst === corrente ? Math.min(v.t, sb ?? Infinity) : v.t;
        sst = corrente;
      }
      const nuovo = [pb, sb ?? '', sst ?? ''].join('|');
      if (nuovo !== tabella[k]) {
        tabella[k] = nuovo;
        cambiati.set(p, tabella);
      }
    }
  }
  await db.scriviTanti([...cambiati].map(([p, tabella]) => ({ percorso: p, dati: { atleti: tabella, aggiornato: comeData(adesso) } })));

  // 3. Squadre.
  const squadre = await aggiornaSquadre({
    db, atleti, st, adesso,
  });
  // 4. Classifiche del Lazio per l'app (gara per gara e Indice Cloro), con i movimenti per la stagione in corso.
  const classifiche = lazio.size ? await scriviClassifiche({
    db, atleti: lazio, st, adesso,
  }) : 0;
  log(`Graduatorie ${st}: ${richieste} richieste, ${atleti.size} atleti (${nuovi.size} nuovi), ${cambiati.size} primati, ${squadre} squadre, ${classifiche} classifiche.`);
  return {
    atleti: atleti.size, nuovi: nuovi.size, richieste, squadre, classifiche,
  };
}

const PESI_INDICE = [0.5, 0.3, 0.2];
const GIORNI_BASE = 6.5;

/**
 * Movimenti stile Spotify per la stagione in corso: b = posizioni della settimana scorsa (bd = da quando),
 * p = posizione migliore raggiunta. `righe` in ordine, con la chiave k.
 */
export function aggiungiMovimenti(dati, righe, vecchio, adesso) {
  const posizioni = Object.fromEntries(righe.map((r, i) => [r.k, i + 1]));
  const vecchiePosizioni = vecchio ? Object.fromEntries((vecchio.righe ?? []).map((riga, i) => [riga.split('|')[0], i + 1])) : null;
  if (!vecchio) {
    dati.b = posizioni;
    dati.bd = adesso;
  } else if (!vecchio.bd || Date.parse(adesso) - Date.parse(vecchio.bd) > GIORNI_BASE * 86_400_000) {
    dati.b = vecchiePosizioni;
    dati.bd = adesso;
  } else {
    dati.b = vecchio.b ?? vecchiePosizioni;
    dati.bd = vecchio.bd;
  }
  const picco = { ...(vecchio?.p ?? {}) };
  for (const [k, pos] of Object.entries(posizioni)) picco[k] = Math.min(picco[k] ?? pos, pos);
  dati.p = picco;
  return dati;
}

/** Indice Cloro: media pesata dei punti delle 3 gare migliori (una per specialità, la vasca migliore). */
export function indiceCloro(risultati = []) {
  const perGara = new Map();
  for (const v of risultati) if (v.pt && (!perGara.has(v.c) || v.pt > perGara.get(v.c).pt)) perGara.set(v.c, v);
  const migliori = [...perGara.values()].sort((a, b) => b.pt - a.pt).slice(0, 3);
  if (!migliori.length) return null;
  const pesi = PESI_INDICE.slice(0, migliori.length);
  const totale = pesi.reduce((a, b) => a + b, 0);
  return { valore: Math.round(migliori.reduce((x, v, i) => x + v.pt * pesi[i], 0) / totale), gare: migliori.map((v) => v.c) };
}

/**
 * classifiche/{stagione}-{vasca}-{gara}-{sesso} e classifiche/{stagione}-indice-{sesso}:
 * righe "chiave|nome|anno|società|valore|data" in ordine. Per la stagione in corso anche
 * b (posizioni della settimana scorsa, per ▲▼ e NUOVO), bd (quando) e p (posizione migliore).
 */
export async function scriviClassifiche({
  db, atleti, st, adesso,
}) {
  const tabelle = new Map();
  const aggiungi = (chiave, riga) => {
    if (!tabelle.has(chiave)) tabelle.set(chiave, []);
    tabelle.get(chiave).push(riga);
  };
  for (const [k, a] of atleti) {
    const s = [...a.societa][0] ?? '';
    for (const v of a.risultati) {
      aggiungi(`${v.v}-${v.c}-${a.sx}`, {
        k, n: a.n, y: a.y, s, valore: v.t, d: v.d,
      });
    }
    const indice = indiceCloro(a.risultati);
    if (indice) {
      aggiungi(`indice-${a.sx}`, {
        k, n: a.n, y: a.y, s, valore: indice.valore, d: indice.gare.join(','),
      });
    }
  }
  const corrente = String(st) === stagione(oggiRoma(adesso));
  const percorsi = [...tabelle.keys()].map((x) => `classifiche/${st}-${x}`);
  const prima = corrente ? await db.leggiTanti(percorsi) : new Map();
  const scritture = [];
  for (const [chiave, righe] of tabelle) {
    const percorso = `classifiche/${st}-${chiave}`;
    const indice = chiave.startsWith('indice');
    righe.sort((x, y) => (indice ? y.valore - x.valore : x.valore - y.valore) || x.n.localeCompare(y.n));
    const dati = {
      righe: righe.map((r) => [r.k, r.n, r.y ?? '', r.s, r.valore, r.d ?? ''].join('|')),
      agg: comeData(adesso),
    };
    if (corrente) aggiungiMovimenti(dati, righe, prima.get(percorso), adesso);
    scritture.push({ percorso, dati });
  }
  await db.scriviTanti(scritture);
  return scritture.length;
}

const chiaveTabella = (v, c, sx) => `${v}|${c}|${sx}`;

/** Componenti e migliori tempi delle squadre, a partire dagli atleti di una stagione. */
export async function aggiornaSquadre({
  db, atleti, st, adesso,
}) {
  // Atleti e tempi di ogni squadra in questa stagione.
  const perSquadra = new Map();
  for (const [k, a] of atleti) {
    for (const nome of a.societa) {
      const id = chiaveSquadra(nome);
      if (!perSquadra.has(id)) perSquadra.set(id, { n: nome, membri: new Map(), t: new Map(), regioni: new Map() });
      const sq = perSquadra.get(id);
      sq.membri.set(k, a);
      if (a.reg) sq.regioni.set(a.reg, (sq.regioni.get(a.reg) ?? 0) + 1);
      for (const v of a.risultati) {
        const kt = chiaveTabella(v.v, v.c, a.sx);
        if (!sq.t.has(kt)) sq.t.set(kt, new Map());
        const prima = sq.t.get(kt).get(k);
        if (!prima || v.t < prima.t) sq.t.get(kt).set(k, v);
      }
    }
  }
  const ids = [...perSquadra.keys()];
  const esistenti = await db.leggiTanti(ids.map((id) => `squadre/${id}`));
  const scritture = [];
  const operazioni = [];
  const elenco = (await db.leggi('meta/squadre'))?.squadre ?? {};
  for (const [id, sq] of perSquadra) {
    const prima = esistenti.get(`squadre/${id}`) ?? {};
    // Stagione: tutti i migliori tempi, in ordine.
    const tabelle = {};
    for (const [kt, perAtleta] of sq.t) {
      tabelle[kt] = [...perAtleta].sort((x, y) => x[1].t - y[1].t).map(([k, v]) => `${k}|${v.t}|${v.d}`);
    }
    scritture.push({ percorso: `squadre/${id}/stagioni/${st}`, dati: { t: tabelle, m: sq.membri.size, aggiornato: comeData(adesso) } });

    // Componenti di sempre: "chiave|nome|anno|sesso|prima stagione|ultima stagione".
    const membri = new Map((prima.m ?? []).map((riga) => [riga.split('|')[0], riga.split('|')]));
    for (const [k, a] of sq.membri) {
      const vecchio = membri.get(k);
      const da = Math.min(Number(vecchio?.[4] ?? st), st);
      const a2 = Math.max(Number(vecchio?.[5] ?? st), st);
      membri.set(k, [k, vecchio?.[1] || a.n, a.y ?? '', a.sx, da, a2]);
    }
    // Migliori di sempre: per gara, il miglior tempo di ogni atleta (i primi 30).
    const sempre = { ...(prima.t ?? {}) };
    for (const [kt, perAtleta] of sq.t) {
      const migliori = new Map((sempre[kt] ?? []).map((riga) => {
        const [k, t, d, s] = riga.split('|');
        return [k, { t: Number(t), d, s }];
      }));
      for (const [k, v] of perAtleta) {
        const x = migliori.get(k);
        if (!x || v.t < x.t) migliori.set(k, { t: v.t, d: v.d, s: String(st) });
      }
      sempre[kt] = [...migliori].sort((x, y) => x[1].t - y[1].t).slice(0, TOP_SEMPRE).map(([k, x]) => `${k}|${x.t}|${x.d}|${x.s}`);
    }
    const stagioni = [...new Set([...(prima.st ?? []), String(st)])].sort().reverse();
    const nome = prima.n ?? sq.n;
    const dati = {
      n: nome, m: [...membri.values()].map((x) => x.join('|')), t: sempre, st: stagioni,
    };
    operazioni.push({ percorso: `squadre/${id}`, dati, maschera: Object.keys(dati), oraServer: ['agg'] });
    const ultima = Math.max(...[...membri.values()].map((x) => Number(x[5])));
    const attivi = [...membri.values()].filter((x) => Number(x[5]) === ultima).length;
    // Regione della squadra: quella della maggior parte dei suoi atleti (se non si sa, quella di prima).
    const regione = [...sq.regioni].sort((x, y) => y[1] - x[1])[0]?.[0] ?? String(elenco[id] ?? '').split('|')[4] ?? '';
    elenco[id] = `${nome}|${attivi}|${membri.size}|${ultima}|${regione}`;
  }
  scritture.push({ percorso: 'meta/squadre', dati: { squadre: elenco, aggiornato: comeData(adesso) } });
  await db.commit(operazioni);
  await db.scriviTanti(scritture);
  return perSquadra.size;
}

/** Un giro: una stagione per volta, se c'è spazio nel tetto giornaliero di scritture. */
export async function giroGraduatorie({
  db, fonti, scarica, adesso = new Date().toISOString(), log = console.log, forza = null, lavoro = 'notte',
  puoContinuare = () => true,
}) {
  if (!fonti?.naz) return { saltato: 'fonte' };
  const stato = (await db.leggi('meta/graduatorie')) ?? {};
  stato.fatte ??= {};
  stato.pacchiLazio ??= {};
  stato.italia ??= {};
  const salva = () => db.scrivi('meta/graduatorie', stato);
  const chiedi = async (campi) => {
    await pausa(PAUSA);
    return scarica(`${fonti.naz}&currentpage=1&format=json&view=grricerca`, {
      metodo: 'POST',
      timeout: 90,
      modulo: { 'solr[settore]': 'NUO', ...campi },
    });
  };
  // Una volta sola: l'indice a tre lettere (tutta Italia) parte da quello del Lazio.
  if (!stato.cercaV) {
    await migraCerca(db, log);
    stato.cercaV = 1;
    await salva();
  }
  const corrente = stagione(oggiRoma(adesso));

  /** Stagione del Lazio con una scheda per atleta (quella in corso, o una scelta a mano). */
  const schede = async (st) => {
    const esito = await leggiStagione({
      db, chiedi, st, adesso, log,
    });
    if (esito.atleti) {
      stato.fatte[st] = adesso;
      await salva();
      // Con la stagione in corso si mettono in coda anche le classifiche nazionali della vasca del periodo
      // (il controllore le prepara poche per volta): così sono già pronte quando qualcuno le apre.
      if (String(st) === corrente) {
        const mese = Number(oggiRoma(adesso).slice(5, 7));
        const v = mese >= 5 && mese <= 8 ? 50 : 25;
        await db.scriviTanti(Object.values(CODICI).flatMap((c) => ['M', 'F'].map((sx) => ({
          percorso: `richieste/${st}-${v}-${c}-${sx}-it-tutte`,
          dati: {
            st: String(st), v, c, sx, reg: 'it', cat: 'tutte', creato: adesso,
          },
        }))));
      }
    }
    return { stagione: st, ...esito };
  };
  /** Una stagione nei pacchi: solo il Lazio o tutta Italia. */
  const pacchi = async (st, italia) => {
    const esito = await leggiStagione({
      db, chiedi, st, adesso, log, modo: 'pacchi', regioni: italia ? TUTTE_LE_REGIONI : [COMITATO],
    });
    if (esito.atleti) {
      (italia ? stato.italia : stato.pacchiLazio)[st] = adesso;
      await salva();
    }
    return { stagione: st, italia, ...esito };
  };

  if (forza && lavoro === 'italia') return pacchi(forza, true);
  if (forza) return schede(forza);
  if (lavoro === 'lazio') {
    // Tutte le stagioni passate del Lazio, finché c'è spazio nel limite di oggi.
    const fatte = [];
    const provate = new Set();
    for (let st = scegliPacchiLazio(stato, adesso); st !== null && !provate.has(st) && puoContinuare(3_000); st = scegliPacchiLazio(stato, adesso)) {
      provate.add(st);
      fatte.push(await pacchi(st, false));
    }
    return { lazio: fatte };
  }
  if (lavoro === 'avanzi') {
    // A fine giornata: prima le stagioni passate del Lazio, poi quelle di tutta Italia, finché c'è spazio.
    // (Una stagione che non si riesce a leggere non si riprova nello stesso giro.)
    const esiti = [];
    const provate = new Set();
    for (let st = scegliPacchiLazio(stato, adesso); st !== null && !provate.has(st) && puoContinuare(3_000); st = scegliPacchiLazio(stato, adesso)) {
      provate.add(st);
      esiti.push(await pacchi(st, false));
    }
    const provateItalia = new Set();
    for (let st = scegliItalia(stato, adesso); st !== null && !provateItalia.has(st) && puoContinuare(8_000); st = scegliItalia(stato, adesso)) {
      provateItalia.add(st);
      esiti.push(await pacchi(st, true));
    }
    return { esiti };
  }
  if (lavoro === 'italia') {
    const st = scegliItalia(stato, adesso);
    return st === null ? { saltato: 'tutta Italia già letta' } : pacchi(st, true);
  }
  // Di notte: prima la stagione in corso del Lazio (se serve), poi una stagione di tutta Italia.
  const esiti = [];
  const st = scegliStagione(stato, adesso);
  if (st !== null) esiti.push(await schede(st));
  const stItalia = scegliItalia(stato, adesso);
  if (stItalia !== null && puoContinuare(8_000)) esiti.push(await pacchi(stItalia, true));
  return esiti.length ? { esiti } : { saltato: 'tutto letto' };
}
