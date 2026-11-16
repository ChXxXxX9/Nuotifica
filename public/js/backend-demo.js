// Backend finto con dati di esempio (nomi inventati): serve per l'anteprima con ?demo.
import { DEMO } from './demo-dati.js';
import { riassuntoSquadra } from './dati-italia.js';
import { punti } from './punti.js';
const ora = Date.now();
const fa = (ore) => new Date(ora - ore * 3_600_000);
const U = 'https://www.esempio.it/wp-content/uploads/2026';

const POST = [
  {
    id: '350001',
    titolo: 'NUOTO – Finali Campionato Regionale Estivo di Categoria 2026 vl',
    link: 'https://www.esempio.it/nuoto-campionato-regionale-di-categoria-2026-vasca-lunga-fasi-finali/',
    settori: ['nuoto'],
    gruppi: ['categoria'],
    data: fa(600),
    ultimoCambio: fa(0.4),
    novita: { tipo: 'aggiunta', quando: fa(0.4), fileIds: ['a1'] },
    file: [
      { id: 'a1', tipo: 'ammessi', etichetta: 'FcrEC – Elenco Atleti AMMESSI alle Gare AGGIORNATO', aggiornato: true, url: `${U}/07/FcrCvl_RJC_elammessi.pdf`, aggiuntoIl: fa(0.4) },
      { id: 'a2', tipo: 'orari', etichetta: 'comun198- FcrEC – Orari Prime Serie', aggiornato: false, url: `${U}/07/comun198_.pdf`, aggiuntoIl: fa(30) },
      { id: 'a3', tipo: 'orari', etichetta: 'comun197 AGGIORNATO- FcrEC – Orari Serie Successive', aggiornato: true, url: `${U}/07/comun197__.pdf`, aggiuntoIl: fa(30) },
      { id: 'a4', tipo: 'ammessi', etichetta: 'FcrEC – Elenco Staffette Ammesse', aggiornato: false, url: `${U}/07/FcrCvl_RJC_elstaffAmmesse.pdf`, aggiuntoIl: fa(52) },
      { id: 'a5', tipo: 'iscritti', etichetta: 'FcrEC – Elenco Iscritti per Società da tagliare', aggiornato: false, url: `${U}/07/x.pdf`, aggiuntoIl: fa(200) },
      { id: 'a6', tipo: 'comunicati', etichetta: 'comun186-Finali Campionato Regionale Estivo di Categoria vl – Regolamento', aggiornato: false, url: `${U}/06/comun186.pdf`, aggiuntoIl: fa(600) },
    ],
  },
  {
    id: '353900',
    titolo: 'NUOTO – Campionato Regionale Assoluto in vasca corta',
    link: 'https://www.esempio.it/nuoto-campionato-regionale-assoluto-in-vasca-corta/',
    settori: ['nuoto'],
    gruppi: ['categoria'],
    data: fa(50),
    ultimoCambio: fa(50),
    novita: { tipo: 'nuovo', quando: fa(50), fileIds: ['b1', 'b2'] },
    file: [
      { id: 'b1', tipo: 'comunicati', etichetta: 'comun29 – Regolamento e programma gare', aggiornato: false, url: `${U}/10/comun29.pdf`, aggiuntoIl: fa(50) },
      { id: 'b2', tipo: 'startlist', etichetta: 'Programma gare – parte 1', aggiornato: false, url: `${U}/10/prog1.pdf`, aggiuntoIl: fa(50) },
    ],
  },
  {
    id: '354010',
    titolo: 'Chiusura Uffici Comitato Regionale Lazio FIN – 14 Ottobre 2026',
    link: 'https://www.esempio.it/chiusura-uffici-comitato-regionale-lazio-fin-14-ottobre-2026/',
    settori: ['comitato'],
    gruppi: ['categoria', 'esordienti'],
    data: fa(30),
    ultimoCambio: fa(30),
    novita: { tipo: 'nuovo', quando: fa(30), fileIds: [] },
    file: [],
  },
  {
    id: '353950',
    titolo: 'NUOTO – Bozza Calendario Regionale 2026/27',
    link: 'https://www.esempio.it/nuoto-bozza-calendario-regionale-2026-27/',
    settori: ['nuoto'],
    gruppi: ['categoria', 'esordienti'],
    data: fa(130),
    ultimoCambio: fa(130),
    novita: null,
    file: [
      { id: 'c1', tipo: 'calendari', etichetta: 'Bozza calendario regionale nuoto 2026-27', aggiornato: false, url: `${U}/10/cal.pdf`, aggiuntoIl: fa(130) },
    ],
  },
  {
    id: '352000',
    titolo: 'NUOTO: Campionati Regionali Estivi Es/B – Es/A – Risultati Finali – Classifiche',
    link: 'https://www.esempio.it/',
    settori: ['nuoto'],
    gruppi: ['esordienti'],
    data: fa(2400),
    ultimoCambio: fa(2300),
    novita: null,
    file: [
      { id: 'd1', tipo: 'risultati', etichetta: 'Risultati completi', aggiornato: false, url: `${U}/06/r.pdf`, aggiuntoIl: fa(2300) },
      { id: 'd2', tipo: 'classifiche', etichetta: 'Classifica maschile', aggiornato: false, url: `${U}/06/cm.pdf`, aggiuntoIl: fa(2300) },
      { id: 'd3', tipo: 'classifiche', etichetta: 'Classifica femminile', aggiornato: false, url: `${U}/06/cf.pdf`, aggiuntoIl: fa(2300) },
    ],
  },
  {
    id: '354017',
    titolo: 'SALVAMENTO: Bozza Calendario Nuoto per Salvamento 2026/2027 parte 1',
    link: 'https://www.esempio.it/salvamento-bozza-calendario-nuoto-per-salvamento-2026-2027-parte-1/',
    settori: ['salvamento'],
    gruppi: ['categoria', 'esordienti'],
    data: fa(12),
    ultimoCambio: fa(12),
    novita: { tipo: 'nuovo', quando: fa(12), fileIds: ['e1'] },
    file: [
      { id: 'e1', tipo: 'calendari', etichetta: 'Bozza Calendario Salvamento 1 parte 26_27', aggiornato: false, url: `${U}/10/sal.pdf`, aggiuntoIl: fa(12) },
    ],
  },
];

const nascosti = [];
const lavori = [];
const limiti = [{
  id: 'regionali-2026', nome: 'Regionali di Categoria 2027', vasca: 25, st: '2026', stato: 'pubblicato',
  t: {
    '100SL|M|R': 57_500, '100SL|M|J': 55_800, '100SL|F|R': 63_900, '100SL|F|J': 62_100, '200SL|M|R': 2 * 60_000 + 6_500,
    '100DO|M|R': 66_000, '100DO|F|R': 72_400, '1500SL|M|*': 17 * 60_000, '1500SL|F|*': 18 * 60_000, '100DO|M|*': 60_500, '100DO|F|*': 66_800,
  },
}];

/** Classifiche di prova dagli atleti di esempio (come quelle che scrive il controllore dalle graduatorie). */
function classificaDemo(id) {
  const [st, a, b, c] = id.split('-');
  const righe = [];
  for (const [k, x] of Object.entries(DEMO.atleti)) {
    if (a === 'indice') {
      if (x.sx !== b) continue;
      const punti = (x.r ?? []).filter((v) => v.pt).map((v) => v.pt).sort((p, q) => q - p).slice(0, 3);
      if (punti.length) righe.push([k, x.n, x.y ?? '', x.s ?? '', Math.round(punti.reduce((p, q) => p + q, 0) / punti.length), '']);
      continue;
    }
    if (x.sx !== c) continue;
    const migliore = (x.r ?? []).filter((v) => v.t && String(v.v) === a && v.c === b).sort((p, q) => p.t - q.t)[0];
    if (migliore) righe.push([k, x.n, x.y ?? '', x.s ?? '', migliore.t + (st === '2026' ? 0 : 700), migliore.d]);
  }
  righe.sort((p, q) => (a === 'indice' ? q[4] - p[4] : p[4] - q[4]));
  const b2 = {};
  righe.forEach((r, i) => { b2[r[0]] = i % 3 === 0 ? i + 2 : i % 3 === 1 ? Math.max(1, i - 1) : i + 1; });
  if (righe[1]) delete b2[righe[1][0]];
  return righe.length ? { righe: righe.map((r) => r.join('|')), b: b2, p: Object.fromEntries(righe.map((r, i) => [r[0], Math.max(1, i)])) } : null;
}

/** Squadre di prova costruite dagli atleti di esempio (come fa il controllore con le graduatorie). */
let cacheSquadre = null;
function squadreDemo() {
  if (cacheSquadre) return cacheSquadre;
  const slug = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const docs = new Map();
  const stagioni = new Map();
  const elenco = {};
  for (const [k, a] of Object.entries(DEMO.atleti)) {
    if (!a.s) continue;
    const id = slug(a.s);
    if (!docs.has(id)) docs.set(id, { n: a.s, m: [], t: {}, st: ['2026', '2025'], sf: [] });
    const sq = docs.get(id);
    sq.m.push(`${k}|${a.n}|${a.y ?? ''}|${a.sx}|2024|2026`);
    for (const v of a.r ?? []) {
      if (!v.t) continue;
      const kt = `${v.v}|${v.c}|${a.sx}`;
      for (const st of ['2026', '2025']) {
        const chiave = `${id}/${st}`;
        if (!stagioni.has(chiave)) stagioni.set(chiave, { t: {}, m: 0 });
        const t = st === '2026' ? v.t : v.t + 900;
        const tab = stagioni.get(chiave).t;
        tab[kt] = [...(tab[kt] ?? []).filter((x) => !x.startsWith(`${k}|`)), `${k}|${t}|${st}-11-01`].sort((x, y) => x.split('|')[1] - y.split('|')[1]);
      }
      sq.t[kt] = [...(sq.t[kt] ?? []).filter((x) => !x.startsWith(`${k}|`)), `${k}|${v.t}|${v.d}|2026`].sort((x, y) => x.split('|')[1] - y.split('|')[1]);
    }
  }
  for (const [id, sq] of docs) {
    sq.sf = [`4x50SL|M|25|${105_420 + id.length * 37}|2026-10-31|l20261031-campionato-regionale-assoluto-v-c-2026-8c6401|Assoluti`,
      `4x100MI|F|25|${262_100 + id.length * 51}|2026-11-08|l20261107-trofeo-gaetano-lanzi-2026-es-a-qualificazioni-2cd761|Esordienti A`];
    elenco[id] = `${sq.n}|${sq.m.length}|${sq.m.length + 3}|2026`;
  }
  cacheSquadre = { docs, stagioni, elenco };
  return cacheSquadre;
}

export function creaBackendDemo() {
  const parametri = new URLSearchParams(location.search);
  let utente = parametri.has('ospite') ? null : {
    uid: 'demo', email: 'tu@esempio.it', nome: 'Demo', verificata: true, conGoogle: true,
  };
  let profilo = parametri.has('nuovo') ? null : {
    settori: ['nuoto', 'comitato'],
    gruppi: ['categoria'],
    tipi: ['tutti'],
    pushOn: true,
    tokens: parametri.has('attive') ? ['demo-token'] : [],
    seguiti: parametri.has('nuovo') ? [] : Object.keys(DEMO.atleti).slice(0, 2),
  };
  // La prima gara di esempio è "in corso" oggi, così si vede la diretta.
  const oggi = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
  const elenco = DEMO.elenco.map((g, i) => (i === 0 ? { ...g, dal: oggi, al: oggi } : g));
  const ascoltatori = new Set();
  const consigli = [
    { id: 'c1', tipo: 'idea', testo: 'Sarebbe bello vedere anche i tempi limite dei Criteria.', dispositivo: 'iPhone', stato: 'letto', risposta: 'In arrivo con le Classifiche!', creato: new Date(Date.now() - 86_400_000) },
  ];
  const annunci = [];
  const avvisa = () => ascoltatori.forEach((cb) => cb(utente));
  const pausa = (ms = 250) => new Promise((r) => setTimeout(r, ms));

  return {
    demo: true,
    seguiAccesso(cb) {
      ascoltatori.add(cb);
      setTimeout(() => cb(utente), 0);
      return () => ascoltatori.delete(cb);
    },
    prendiErroreAccesso: async () => null,
    async accediGoogle() { await pausa(); utente = { uid: 'demo', email: 'tu@esempio.it', verificata: true, conGoogle: true }; avvisa(); },
    async registrati(email) { await pausa(); utente = { uid: 'demo', email, verificata: false }; avvisa(); },
    async accediEmail(email) { await pausa(); utente = { uid: 'demo', email, verificata: true }; avvisa(); },
    async recuperaPassword() { await pausa(); },
    async rimandaVerifica() { await pausa(); },
    async ricaricaUtente() { await pausa(); utente.verificata = true; return true; },
    async esci() { utente = null; avvisa(); },
    async leggiProfilo() { await pausa(150); return profilo && { ...profilo }; },
    async salvaProfilo(uid, dati) { await pausa(); profilo = { ...(profilo ?? { tokens: [] }), ...dati }; },
    async eliminaAccount() { await pausa(); profilo = null; utente = null; avvisa(); },
    async leggiPost(settori) {
      await pausa(200);
      return POST.filter((p) => p.settori.some((s) => settori.includes(s)))
        .sort((a, b) => b.ultimoCambio - a.ultimoCambio);
    },
    async leggiUnPost(id) { await pausa(120); return POST.find((p) => p.id === id) ?? null; },
    async leggiStato() {
      return { ultimoControllo: new Date(ora - 4 * 60_000), esito: 'ok' };
    },
    async attivaPush() {
      await pausa(400);
      profilo.pushOn = true;
      profilo.tokens = ['demo-token'];
      return 'demo-token';
    },
    async disattivaPushQui() { await pausa(); profilo.tokens = []; },
    async leggiAvvisi(settori) { return this.leggiPost(settori); },
    async leggiGare() {
      await pausa(150);
      const tra = (giorni) => new Intl.DateTimeFormat('sv-SE').format(new Date(Date.now() + giorni * 86_400_000));
      return [
        ...elenco,
        { id: 'n900001', nome: 'Trofeo d\'inverno', luogo: 'Bologna (BO)', dal: tra(6), al: tra(7), vasca: 50, fonte: 'italia' },
        { id: 'n900002', nome: 'Meeting di Natale', luogo: 'Latina (LT)', dal: tra(20), al: tra(20), vasca: 25, fonte: 'italia' },
      ];
    },
    async leggiGara(id) {
      await pausa(150);
      const g = DEMO.gare[id];
      const voce = elenco.find((x) => x.id === id);
      return g ? { ...g, dal: voce.dal, al: voce.al } : null;
    },
    async leggiCategoria(id, doc) { await pausa(120); return DEMO.categorie[`${id}/${doc}`] ?? null; },
    async leggiAtleta(k) { await pausa(120); return DEMO.atleti[k] ?? null; },
    async leggiIndice(lettera) { await pausa(100); return DEMO.indici[lettera] ?? []; },
    async leggiRicerca(prefisso) {
      await pausa(60);
      const tutte = [...new Set(Object.values(DEMO.indici).flat())];
      return tutte.filter((v) => v.split('|')[1].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .split(/[\s'’-]+/).some((p) => p.replace(/[^a-z]/g, '').startsWith(prefisso)));
    },
    async leggiAtletaItalia() { await pausa(60); return null; },
    async cercaItalia(testo) {
      const righe = await this.leggiRicerca(testo.slice(0, 2));
      const chiavi = (n) => { const p = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’`-]+/g, ' ').split(/\s+/); return p.map((_, i) => [...p.slice(i), ...p.slice(0, i)].join(' ')); };
      return righe.filter((v) => chiavi(v.split('|')[1]).some((c) => c.startsWith(testo))).map((v) => `${v}|12`);
    },
    async leggiSquadraItalia() { await pausa(60); return null; },
    async leggiStaffetteSquadra() { await pausa(40); return []; },
    // Anteprima: il riassunto si costruisce dalle squadre di esempio, come lo fa il controllore.
    async leggiRiassuntoSquadra(id) {
      await pausa(40);
      const { docs, stagioni } = squadreDemo();
      const sq = docs.get(id);
      if (!sq) return null;
      const doc = {};
      for (const st of sq.st) {
        const tab = stagioni.get(`${id}/${st}`)?.t ?? {};
        doc[`s${st}`] = {
          n: sq.n, reg: '12', m: sq.m.map((x) => x.split('|').slice(0, 4).join('|')).join('~'),
          t: Object.fromEntries(Object.entries(tab).map(([kt, righe]) => [kt, righe.join('~')])),
        };
      }
      return riassuntoSquadra(doc, punti);
    },
    async leggiStagioneSquadraItalia(id, st) {
      await pausa(40);
      const { docs, stagioni } = squadreDemo();
      const sq = docs.get(id);
      const tab = stagioni.get(`${id}/${st}`)?.t;
      if (!sq || !tab) return null;
      return { m: sq.m.map((x) => x.split('|').slice(0, 4).join('|')).join('~'), t: Object.fromEntries(Object.entries(tab).map(([kt, righe]) => [kt, righe.join('~')])) };
    },
    async seguiSquadra(uid, id, notifiche) {
      await pausa(120);
      profilo.squadre = [...new Set([...(profilo.squadre ?? []), id])];
      profilo.notSq = { ...(profilo.notSq ?? {}), [id]: notifiche };
    },
    async smettiSquadra(uid, id) {
      await pausa(120);
      profilo.squadre = (profilo.squadre ?? []).filter((x) => x !== id);
      if (profilo.notSq) delete profilo.notSq[id];
    },
    // Anteprima: medie inventate (circa 1'00" ogni 100 m, un po' di più per le femmine e i più giovani).
    async leggiAnnate(st) {
      await pausa(60);
      return new Proxy({}, {
        get: (_, chiave) => {
          const [, c, sx, y] = String(chiave).split('|');
          const metri = Number(String(c ?? '').match(/^\d+/)?.[0]);
          if (!metri || !y) return undefined;
          const eta = Number(st) + 1 - Number(y);
          return `${Math.round(metri * 560 * (sx === 'F' ? 1.08 : 1) * (1 + Math.max(0, 18 - eta) * 0.035))}|10`;
        },
      });
    },
    async leggiStorico() { await pausa(60); return null; },
    async chiediStorico() { return null; },
    async leggiSquadre() { await pausa(60); return squadreDemo().elenco; },
    async leggiSquadra(id) { await pausa(80); const sq = squadreDemo().docs.get(id); return sq ? { id, ...sq } : null; },
    async leggiStagioneSquadra(id, st) { await pausa(60); return squadreDemo().stagioni.get(`${id}/${st}`) ?? null; },
    async leggiTesto() {
      await pausa(80);
      return {
        n: 2,
        p: [
          'COMITATO REGIONALE LAZIO\n\nCAMPIONATO REGIONALE INVERNALE - ELENCO AMMESSI\n\n  100 Stile Libero Maschi\n  1  ROSSI MARCO          2008  NUOTO ESEMPIO       52.10\n  2  BIANCHI LUCA         2009  POLISPORTIVA PROVA  52.88\n  3  VERDI ANDREA         2008  AQUA CLUB ESEMPIO   53.40',
          '  200 Dorso Femmine\n  1  GALLI VIOLA          2010  DELFINI TIBURTINA   2:18.40\n  2  TESTA ELENA          2009  NUOTO ESEMPIO       2:19.02\n  3  ROSSI GIULIA         2011  POLISPORTIVA PROVA  2:21.75',
        ],
      };
    },
    async sonoAdmin() { return parametri.has('admin'); },
    async mandaConsiglio(uid, c) { await pausa(); consigli.unshift({ id: String(Date.now()), ...c, uid, stato: 'nuovo', creato: new Date() }); },
    async mieiConsigli() { await pausa(100); return consigli; },
    async datiAdmin() {
      await pausa(200);
      return {
        utenti: 128, atleti: Object.keys(DEMO.atleti).length, consigli, annunci,
        stato: { ultimoControllo: new Date(Date.now() - 180_000).toISOString(), esito: 'ok', messaggio: 'Nessuna novità.' },
        budget: { scritture: 4210, letture: 380 },
      };
    },
    async aggiornaConsiglio(id, dati) { await pausa(); Object.assign(consigli.find((c) => c.id === id) ?? {}, dati); },
    async creaAnnuncio(a) { await pausa(); annunci.unshift({ ...a, stato: 'da-inviare', creato: new Date() }); },
    async leggiUtenti() {
      await pausa(120);
      return Array.from({ length: 12 }, (_, i) => ({
        id: `u${i}`, creato: new Date(Date.now() - i * 86_400_000 * 3), aggiornato: new Date(Date.now() - i * 3_600_000), settori: ['nuoto'], seguiti: i % 4, pushOn: i % 3 !== 0, dispositivi: 1 + (i % 2),
      }));
    },
    async creaLavoro(tipo, dati = {}) { await pausa(); lavori.unshift({ id: String(Date.now()), tipo, ...dati, stato: 'da-fare', creato: new Date() }); },
    async leggiNascosti() { await pausa(60); return { k: [...nascosti] }; },
    async salvaNascosti(dati) { await pausa(); nascosti.splice(0, nascosti.length, ...(dati.k ?? [])); },
    async leggiLimiti() { await pausa(80); return limiti.map((l) => ({ ...l })); },
    async leggiLimitiPubblicati() { await pausa(80); return limiti.filter((l) => l.stato !== 'bozza').map((l) => ({ ...l })); },
    async salvaLimite(id, dati) {
      await pausa();
      if (id) {
        Object.assign(limiti.find((l) => l.id === id) ?? {}, dati);
        return id;
      }
      const nuovo = { id: `l${Date.now()}`, ...dati };
      limiti.push(nuovo);
      return nuovo.id;
    },
    async eliminaLimite(id) { await pausa(); limiti.splice(limiti.findIndex((l) => l.id === id), 1); },
    async leggiClassifica(id) { await pausa(90); return classificaDemo(id); },
    async leggiClassificaRete(id) { await pausa(90); return classificaDemo(id); },
    async chiediClassifica() { await pausa(60); },
    async salvaObiettivi(uid, obiettivi) { await pausa(); profilo.obiettivi = obiettivi; },
    async salvaLimitiSeguiti(uid, l) { await pausa(); profilo.limiti = l; },
    async leggiCategorie() { await pausa(40); return null; },
    async salvaCategorie() { await pausa(); },
    async segui(uid, k) { await pausa(); profilo.seguiti = [...new Set([...(profilo.seguiti ?? []), k])]; },
    async smettiDiSeguire(uid, k) { await pausa(); profilo.seguiti = (profilo.seguiti ?? []).filter((x) => x !== k); },
  };
}
