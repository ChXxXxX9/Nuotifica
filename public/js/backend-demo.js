// Backend finto con dati di esempio (nomi inventati): serve per l'anteprima con ?demo.
import { DEMO } from './demo-dati.js';
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
    async segui(uid, k) { await pausa(); profilo.seguiti = [...new Set([...(profilo.seguiti ?? []), k])]; },
    async smettiDiSeguire(uid, k) { await pausa(); profilo.seguiti = (profilo.seguiti ?? []).filter((x) => x !== k); },
  };
}
