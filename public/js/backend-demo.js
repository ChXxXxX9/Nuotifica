// Backend finto con dati di esempio: serve per l'anteprima finché Firebase non è configurato.
const ora = Date.now();
const fa = (ore) => new Date(ora - ore * 3_600_000);
const U = 'https://www.finlazio.it/wp-content/uploads/2026';

const POST = [
  {
    id: '350001',
    titolo: 'NUOTO – Finali Campionato Regionale Estivo di Categoria 2026 vl',
    link: 'https://www.finlazio.it/nuoto-campionato-regionale-di-categoria-2026-vasca-lunga-fasi-finali/',
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
    link: 'https://www.finlazio.it/nuoto-campionato-regionale-assoluto-in-vasca-corta/',
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
    link: 'https://www.finlazio.it/chiusura-uffici-comitato-regionale-lazio-fin-14-ottobre-2026/',
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
    link: 'https://www.finlazio.it/nuoto-bozza-calendario-regionale-2026-27/',
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
    link: 'https://www.finlazio.it/',
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
    link: 'https://www.finlazio.it/salvamento-bozza-calendario-nuoto-per-salvamento-2026-2027-parte-1/',
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

export function creaBackendDemo() {
  const parametri = new URLSearchParams(location.search);
  let utente = parametri.has('ospite') ? null : {
    uid: 'demo', email: 'tu@esempio.it', nome: 'Demo', verificata: true, conGoogle: true,
  };
  let profilo = parametri.has('nuovo') ? null : {
    email: 'tu@esempio.it',
    settori: ['nuoto', 'comitato'],
    gruppi: ['categoria'],
    tipi: ['tutti'],
    pushOn: true,
    emailOn: false,
    tokens: [],
  };
  const ascoltatori = new Set();
  const avvisa = () => ascoltatori.forEach((cb) => cb(utente));
  const pausa = (ms = 250) => new Promise((r) => setTimeout(r, ms));

  return {
    demo: true,
    seguiAccesso(cb) {
      ascoltatori.add(cb);
      setTimeout(() => cb(utente), 0);
      return () => ascoltatori.delete(cb);
    },
    prendiErroreAccesso: () => null,
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
    async disiscriviEmail() { await pausa(); },
  };
}
