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
  scrittureRicerca, scrittureNoti, leggiNotiTutti, chiaveSquadra,
} from './ricerca.js';

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
  for (let s = corrente - 1; s >= PRIMA_STAGIONE; s--) if (!stato.fatte?.[s]) return s;
  if (ore(corrente - 1) > 24 * 7) return corrente - 1; // ritardatari della stagione scorsa
  return null;
}

/** Legge una stagione intera e salva tutto. Restituisce il numero di atleti aggiornati. */
export async function leggiStagione({
  db, chiedi, st, adesso, log = console.log,
}) {
  const atleti = new Map();
  let richieste = 0;
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
            'solr[id_comitato]': COMITATO,
            'solr[limit]': '5000',
          }));
          richieste++;
        } catch (e) {
          log(`Graduatoria ${st} ${codice} ${sesso} ${vasca}m non letta: ${e.message}`);
          continue;
        }
        for (const r of righe) {
          if (!/individuale/i.test(r.turno) && r.turno) continue;
          const { cognome, nome } = dividiNome(r.nome);
          const k = chiaveAtleta(cognome, nome, r.anno);
          if (!k) continue;
          if (!atleti.has(k)) {
            atleti.set(k, {
              n: `${nome} ${cognome}`.trim(), y: r.anno, sx: sesso, societa: new Set(), fin: r.idAtleta, risultati: [],
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
  if (!atleti.size) {
    log(`Graduatorie ${st}: nessun tempo letto (${richieste} richieste).`);
    return { atleti: 0, richieste };
  }

  // 1. Schede degli atleti: per quelli già conosciuti si aggiungono solo i tempi (nome e società restano).
  const noti = await leggiNotiTutti(db);
  const operazioni = [];
  const nuovi = new Map();
  for (const [k, a] of atleti) {
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
  operazioni.push(...scrittureRicerca(nuovi), ...scrittureNoti(nuovi.keys()));
  await db.commit(operazioni);

  // 2. Primati (badge PB/SB nelle gare in diretta).
  const corrente = stagione(oggiRoma(adesso));
  const percorsi = [];
  for (const [vasca] of VASCHE) for (const sx of ['M', 'F']) for (const c of Object.values(CODICI)) percorsi.push(`primati/${vasca}-${c}-${sx}`);
  const letti = await db.leggiTanti(percorsi);
  const cambiati = new Map();
  for (const [k, a] of atleti) {
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
  log(`Graduatorie ${st}: ${richieste} richieste, ${atleti.size} atleti (${nuovi.size} nuovi), ${cambiati.size} primati, ${squadre} squadre.`);
  return { atleti: atleti.size, nuovi: nuovi.size, richieste, squadre };
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
      if (!perSquadra.has(id)) perSquadra.set(id, { n: nome, membri: new Map(), t: new Map() });
      const sq = perSquadra.get(id);
      sq.membri.set(k, a);
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
    elenco[id] = `${nome}|${attivi}|${membri.size}|${ultima}`;
  }
  scritture.push({ percorso: 'meta/squadre', dati: { squadre: elenco, aggiornato: comeData(adesso) } });
  await db.commit(operazioni);
  await db.scriviTanti(scritture);
  return perSquadra.size;
}

/** Un giro: una stagione per volta, se c'è spazio nel tetto giornaliero di scritture. */
export async function giroGraduatorie({
  db, fonti, scarica, adesso = new Date().toISOString(), log = console.log, forza = null,
}) {
  if (!fonti?.naz) return { saltato: 'fonte' };
  const stato = (await db.leggi('meta/graduatorie')) ?? {};
  stato.fatte ??= {};
  const st = forza ?? scegliStagione(stato, adesso);
  if (st === null) return { saltato: 'tutto letto' };
  const chiedi = async (campi) => {
    await pausa(PAUSA);
    return scarica(`${fonti.naz}&currentpage=1&format=json&view=grricerca`, {
      metodo: 'POST',
      timeout: 90,
      modulo: { 'solr[settore]': 'NUO', ...campi },
    });
  };
  const esito = await leggiStagione({
    db, chiedi, st, adesso, log,
  });
  if (esito.atleti) {
    stato.fatte[st] = adesso;
    await db.scrivi('meta/graduatorie', stato);
  }
  return { stagione: st, ...esito };
}
