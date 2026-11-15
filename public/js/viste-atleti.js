// Sezione Atleti: ricerca, scheda atleta (personali, grafico, storico) e "Segui".
import {
  stato, api, esc, barraTop, tabBar, disegna, caricamento, paginaErrore, ICONE, conCache, giaInCache,
  percorso, memoria, avviso, conAttesa,
} from './nucleo.js';
import {
  tempo, nomeGara, ordineGara, giorno, iniziali, differenza, codici, stagioneCorrente, stagioneDi, nomeStagione,
} from './formato.js';
import {
  leggiLimiti, limitiSeguiti, limitePer, migliore, rispettoAlLimite, leggiTempo, nomeCategoriaAtleta, REGIONI,
} from './viste-classifiche.js';
import { coriandoli } from './coriandoli.js';
import { idPacco, leggiPacco } from './pacchi.js';
import { punti } from './punti.js';
import { schedaRisultato } from './viste-gare.js';
import { riempiPosizioni } from './posizioni.js';

export const MAX_SEGUITI = 10;

const normalizza = (t = '') => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Risultati senza doppioni (se un tempo è stato corretto vale l'ultima versione). */
export function risultatiPuliti(r = []) {
  const perId = new Map();
  for (const v of r) perId.set(v.i ?? `${v.g}|${v.c}|${v.d}|${v.t}`, v);
  // Lo stesso tempo arrivato da più fonti (gara letta in diretta e graduatorie): si tiene il più completo.
  const ricchezza = (v) => (v.sp ? 4 : 0) + (v.ci ? 2 : 0) + (v.f ? 0 : 1);
  const perTempo = new Map();
  for (const v of perId.values()) {
    const chiave = v.t ? `${v.d}|${v.c}|${v.v}|${v.t}` : `${v.i}`;
    const prima = perTempo.get(chiave);
    if (!prima || ricchezza(v) > ricchezza(prima)) perTempo.set(chiave, v);
  }
  return [...perTempo.values()].sort((a, b) => (b.d ?? '').localeCompare(a.d ?? ''));
}

const PRIMA_STAGIONE_PACCHI = 2018;

/** I migliori di ogni stagione dai pacchi (tutta Italia, dal 2018/19): una lettura per stagione. */
async function leggiDaiPacchi(k) {
  const corrente = Number(stagioneCorrente());
  const stagioni = [];
  for (let st = corrente; st >= PRIMA_STAGIONE_PACCHI; st--) stagioni.push(st);
  const docs = await conCache(`pacchi:${k}`, () => api.leggiPacchi(stagioni.map((st) => idPacco(st, k))), { durata: 600_000 });
  const trovati = (docs ?? []).map((doc) => leggiPacco(doc, k)).filter(Boolean);
  if (!trovati.length) return null;
  const ultimo = trovati[0];
  const r = trovati.flatMap((x) => x.r.map((v) => {
    const pt = punti(v.t, v.c, ultimo.sx, v.v, v.d);
    return pt ? { ...v, pt } : v;
  }));
  return {
    n: ultimo.n, y: ultimo.y, sx: ultimo.sx, s: ultimo.s, reg: ultimo.reg, r,
  };
}

/** Scheda di un atleta: la sua scheda (gare lette e graduatorie del Lazio) più i pacchi di tutta Italia. */
export async function leggiAtleta(k, { fresco = false, pacchi = true } = {}) {
  if (fresco) stato.cache.delete(`atleta:${k}`);
  const pulisci = (a) => (a ? { ...a, k, r: risultatiPuliti(a.r) } : null);
  const base = conCache(`atleta:${k}`, async (fresco) => pulisci(await api.leggiAtleta(k, (nuovo) => fresco(pulisci(nuovo)))), { durata: 60_000 });
  if (!pacchi) return base;
  const [scheda, daiPacchi] = await Promise.all([base, leggiDaiPacchi(k).catch(() => null)]);
  if (!daiPacchi) return scheda;
  if (!scheda) return pulisci(daiPacchi);
  return { ...scheda, reg: scheda.reg ?? daiPacchi.reg, r: risultatiPuliti([...scheda.r, ...daiPacchi.r]) };
}

/** Dati brevi degli atleti seguiti, per "Per te". */
export async function leggiSeguiti(chiavi) {
  const schede = await Promise.all(chiavi.map((k) => leggiAtleta(k, { pacchi: false }).catch(() => null)));
  return chiavi.map((k, i) => {
    const a = schede[i];
    if (!a) return { k, n: k.replace(/-\d{4}$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) };
    return { k, n: a.n, s: a.s, ultimo: a.r?.find((v) => v.t) ?? null };
  });
}

export const eSeguito = (k) => (stato.profilo?.seguiti ?? []).includes(k);

/** Segui / smetti di seguire. Aggiorna il bottone passato. */
export async function seguiAtleta(k, nome, bottone) {
  const seguiti = stato.profilo?.seguiti ?? [];
  const gia = seguiti.includes(k);
  if (!gia && seguiti.length >= MAX_SEGUITI) {
    avviso(`Puoi seguire al massimo ${MAX_SEGUITI} atleti: togline uno dalla sua scheda.`, 'errore');
    return;
  }
  try {
    await conAttesa(bottone, () => (gia ? api.smettiDiSeguire(stato.utente.uid, k) : api.segui(stato.utente.uid, k)));
    stato.profilo.seguiti = gia ? seguiti.filter((x) => x !== k) : [...seguiti, k];
    stato.seguitiDati = null;
    stato.aggiornatoIl = 0;
    if (bottone) {
      bottone.textContent = gia ? 'Segui' : 'Seguito ✓';
      bottone.classList.toggle('bottone-secondario', !gia);
      bottone.setAttribute('aria-pressed', String(!gia));
    }
    if (gia) {
      avviso(`Non segui più ${nome}.`);
    } else {
      avviso(memoria('token')
        ? `Segui ${nome}: quando esce un suo tempo ti arriva una notifica.`
        : `Segui ${nome}. Attiva le notifiche per sapere subito i suoi tempi.`);
    }
  } catch (err) {
    avviso(err.message, 'errore');
  }
}

/* ---------- ricerca ---------- */

const ORE_INDICE = 12;

/** Le due lettere che dicono quale pezzo dell'indice leggere (come le calcola il controllore). */
const prefisso = (parola) => normalizza(parola).replace(/[^a-z]/g, '').slice(0, 2);
const testoCerca = (t) => normalizza(t).replace(/['’`-]/g, ' ');

async function leggiPezzo(p) {
  const chiave = `ricerca-${p}`;
  const salvato = memoria(chiave);
  if (salvato && Date.now() - salvato.quando < ORE_INDICE * 3_600_000) return salvato.voci;
  const elenco = await conCache(`ricerca:${p}`, () => api.leggiRicerca(p), { durata: 600_000 });
  // Una voce per atleta (vale l'ultima: ad esempio se ha cambiato società).
  const perChiave = new Map();
  for (const riga of elenco ?? []) {
    const [k, n, y, sq] = riga.split('|');
    perChiave.set(k, { k, n, y, s: sq, cerca: `${testoCerca(n)} ${testoCerca(n).replace(/\s+/g, '')} ${testoCerca(sq ?? '')}` });
  }
  const voci = [...perChiave.values()];
  try {
    memoria(chiave, { quando: Date.now(), voci });
  } catch { /* poco spazio: si rilegge la prossima volta */ }
  return voci;
}

/** Pezzo dell'indice a tre lettere (tutta Italia). */
async function leggiPezzoItalia(p) {
  const chiave = `cerca-${p}`;
  const salvato = memoria(chiave);
  if (salvato && Date.now() - salvato.quando < ORE_INDICE * 3_600_000) return salvato.voci;
  const elenco = await conCache(`cerca:${p}`, () => api.leggiCerca(p), { durata: 600_000 });
  const perChiave = new Map();
  for (const riga of elenco ?? []) {
    const [k, n, y, sq, reg] = riga.split('|');
    perChiave.set(k, {
      k, n, y, s: sq, reg, cerca: `${testoCerca(n)} ${testoCerca(n).replace(/\s+/g, '')} ${testoCerca(sq ?? '')}`,
    });
  }
  const voci = [...perChiave.values()];
  try {
    memoria(chiave, { quando: Date.now(), voci });
  } catch { /* poco spazio */ }
  return voci;
}

/** Atleti: si legge un solo pezzo piccolo dell'indice (quello della parola più lunga scritta). */
export async function cerca(testo) {
  const parole = testoCerca(testo).split(/\s+/).filter((p) => p.length >= 2);
  if (!parole.length) return [];
  const guida = [...parole].sort((x, y) => y.length - x.length)[0];
  // Con almeno tre lettere si cerca in tutta Italia; con due, nel Lazio (indice più piccolo).
  const lettere = normalizza(guida).replace(/[^a-z]/g, '');
  const soloLazio = () => leggiPezzo(prefisso(guida));
  const voci = lettere.length >= 3
    ? await leggiPezzoItalia(lettere.slice(0, 3)).then((v) => (v.length ? v : soloLazio())).catch(soloLazio)
    : await soloLazio();
  const nascosti = new Set(stato.nascosti ?? []);
  const trovati = voci.filter((v) => !nascosti.has(v.k) && parole.every((p) => v.cerca.includes(p)));
  const primo = parole[0];
  const iniziaCon = (v) => testoCerca(v.n).split(' ').some((x) => x.startsWith(primo));
  return trovati
    .sort((a, b) => Number(!iniziaCon(a)) - Number(!iniziaCon(b)) || a.n.localeCompare(b.n, 'it'))
    .slice(0, 40);
}

/** Squadre con il nome che contiene tutte le parole scritte. */
export async function cercaSquadre(testo) {
  const parole = testoCerca(testo).split(/\s+/).filter((p) => p.length >= 2);
  if (!parole.length) return [];
  const elenco = await conCache('squadre', (fresco) => api.leggiSquadre(fresco), { durata: 600_000 });
  return Object.entries(elenco ?? {})
    .map(([id, riga]) => {
      const [n, attivi, totale, ultima, reg] = riga.split('|');
      return {
        id, n, attivi: Number(attivi), totale: Number(totale), ultima, reg,
      };
    })
    .filter((x) => parole.every((p) => testoCerca(x.n).includes(p)))
    .sort((a, b) => b.attivi - a.attivi)
    .slice(0, 8);
}

const voceSquadra = (x) => `<li><a href="#/squadra/${encodeURIComponent(x.id)}"><b>${esc(x.n)}</b><small>Squadra · ${x.attivi} ${x.attivi === 1 ? 'atleta' : 'atleti'} nell'ultima stagione${x.reg && x.reg !== '12' && REGIONI[x.reg] ? ` · ${esc(REGIONI[x.reg])}` : ''}</small></a></li>`;

export async function vistaAtleti() {
  const seguiti = stato.profilo?.seguiti ?? [];
  const testoPrima = stato.ricerca ?? '';
  disegna(`
    ${barraTop()}
    <main class="pagina">
      <h1 class="titolo-pagina">Atleti</h1>
      <label class="cerca">
        <span class="nascosto">Cerca un atleta</span>
        ${ICONE.cerca}
        <input type="search" placeholder="Atleta o squadra" autocomplete="off" enterkeyhint="search" value="${esc(testoPrima)}">
      </label>
      <div data-risultati></div>
      ${seguiti.length ? `
        <section class="sezione" data-seguiti>
          <div class="sezione-testa"><h2 class="sezione-titolo">Che segui</h2><span class="nota">${seguiti.length}/${MAX_SEGUITI}</span></div>
          <ul class="elenco risultati-ricerca" data-elenco-seguiti><li class="caricamento">Carico…</li></ul>
        </section>` : ''}
      <a class="richiamo richiamo-secondario" href="#/squadre" style="margin-top:18px">
        ${ICONE.squadra ?? ICONE.atleti ?? ''}
        <span><strong>Squadre</strong><small>Componenti, migliori tempi di sempre e di ogni stagione, staffette.</small></span>
      </a>
      <p class="nota" style="margin-top:18px">Ci sono gli atleti del Lazio dal 2018/19 e quelli delle gare che leggiamo; stiamo aggiungendo quelli di tutta Italia, una stagione alla volta.</p>
    </main>
    ${tabBar('atleti')}`, (el) => {
    const input = el.querySelector('input');
    const box = el.querySelector('[data-risultati]');
    let attesa;
    let giro = 0;
    const esegui = async () => {
      const testo = input.value.trim();
      stato.ricerca = testo;
      const mio = ++giro;
      if (testo.length < 2) {
        box.innerHTML = '';
        return;
      }
      box.innerHTML = '<p class="caricamento">Cerco…</p>';
      try {
        const [trovati, squadre] = await Promise.all([cerca(testo), cercaSquadre(testo).catch(() => [])]);
        if (mio !== giro) return;
        box.innerHTML = trovati.length || squadre.length
          ? `<ul class="elenco risultati-ricerca">${squadre.map(voceSquadra).join('')}${trovati.map((v) => `
              <li><a href="#/atleta/${encodeURIComponent(v.k)}"><b>${esc(v.n)}</b><small>${esc([v.y, v.s, v.reg && v.reg !== '12' ? REGIONI[v.reg] : ''].filter(Boolean).join(' · '))}</small></a></li>`).join('')}</ul>`
          : '<div class="vuoto"><strong>Nessuno trovato</strong>Prova con il cognome (o il nome della squadra). Stiamo aggiungendo gli atleti di tutta Italia: se manca qualcuno, arriva nei prossimi giorni.</div>';
      } catch (err) {
        if (mio === giro) box.innerHTML = `<p class="errore">${esc(err.message)}</p>`;
      }
    };
    input.addEventListener('input', () => {
      clearTimeout(attesa);
      attesa = setTimeout(esegui, 120);
    });
    if (testoPrima) esegui();
    else if (!seguiti.length) input.focus();

    const elencoSeguiti = el.querySelector('[data-elenco-seguiti]');
    if (elencoSeguiti) {
      leggiSeguiti(seguiti).then((schede) => {
        if (percorso() !== 'atleti') return;
        elencoSeguiti.innerHTML = schede.map((a) => `
          <li><a href="#/atleta/${encodeURIComponent(a.k)}"><b>${esc(a.n)}</b><small>${esc(a.ultimo ? `${tempo(a.ultimo.t)} · ${nomeGara(a.ultimo.c, { breve: true })}` : (a.s ?? ''))}</small></a></li>`).join('');
      }).catch(() => { elencoSeguiti.innerHTML = ''; });
    }
  });
}

/* ---------- scheda atleta ---------- */

/** Migliori tempi per vasca e gara. */
function personali(risultati) {
  const migliori = new Map();
  for (const v of risultati) {
    if (!v.t || !v.c || v.c.includes('x')) continue;
    const chiave = `${v.v}|${v.c}`;
    const m = migliori.get(chiave);
    if (!m || v.t < m.t) migliori.set(chiave, v);
  }
  return migliori;
}

function grafico(punti) {
  if (punti.length < 2) {
    return '<p class="nota" style="padding:8px 4px">Serve almeno un altro tempo in questa gara per disegnare i progressi.</p>';
  }
  const L = 340;
  const A = 150;
  const m = { s: 46, d: 10, a: 12, b: 24 };
  const tempi = punti.map((p) => p.t);
  const min = Math.min(...tempi);
  const max = Math.max(...tempi);
  const margine = Math.max((max - min) * 0.12, 200);
  const y0 = min - margine;
  const y1 = max + margine;
  const date = punti.map((p) => new Date(`${p.d}T12:00:00`).getTime());
  const x0 = Math.min(...date);
  const x1 = Math.max(...date) === x0 ? x0 + 1 : Math.max(...date);
  const X = (d) => m.s + ((d - x0) / (x1 - x0)) * (L - m.s - m.d);
  // Più in alto = più veloce.
  const Y = (t) => m.a + ((t - y0) / (y1 - y0)) * (A - m.a - m.b);
  const migliore = Math.min(...tempi);
  const percorsoLinea = punti.map((p, i) => `${i ? 'L' : 'M'}${X(date[i]).toFixed(1)},${Y(p.t).toFixed(1)}`).join(' ');
  return `
    <svg viewBox="0 0 ${L} ${A}" role="img" aria-label="Andamento dei tempi: dal ${esc(giorno(punti[0].d))} al ${esc(giorno(punti[punti.length - 1].d))}, migliore ${esc(tempo(migliore))}">
      <line class="asse" x1="${m.s}" x2="${L - m.d}" y1="${Y(min)}" y2="${Y(min)}" stroke-dasharray="3 4"/>
      <line class="asse" x1="${m.s}" x2="${L - m.d}" y1="${Y(max)}" y2="${Y(max)}" stroke-dasharray="3 4"/>
      <text class="etichetta" x="${m.s - 6}" y="${Y(min) + 4}" text-anchor="end">${esc(tempo(min))}</text>
      <text class="etichetta" x="${m.s - 6}" y="${Y(max) + 4}" text-anchor="end">${esc(tempo(max))}</text>
      <path class="linea" d="${percorsoLinea}"/>
      ${punti.map((p, i) => `<circle class="punto ${p.t === migliore ? 'punto-pb' : ''}" cx="${X(date[i]).toFixed(1)}" cy="${Y(p.t).toFixed(1)}" r="4.5"/>`).join('')}
      <text class="etichetta" x="${m.s}" y="${A - 4}">${esc(giorno(punti[0].d))}</text>
      <text class="etichetta" x="${L - m.d}" y="${A - 4}" text-anchor="end">${esc(giorno(punti[punti.length - 1].d))}</text>
    </svg>`;
}

export async function vistaAtleta(k) {
  const qui = () => percorso() === `atleta/${encodeURIComponent(k)}` || percorso() === `atleta/${k}`;
  if (!giaInCache(`atleta:${k}`)) caricamento('Apro la scheda…');
  let a;
  try {
    a = await leggiAtleta(k);
  } catch (err) {
    if (qui()) paginaErrore(err, { tab: 'atleti' });
    return;
  }
  if (!qui()) return;
  // Se dalla rete arriva una scheda più nuova di quella salvata sul telefono, si ridisegna.
  const fresco = (e) => {
    if (!qui()) {
      window.removeEventListener('cloro:fresco', fresco);
      return;
    }
    if (e.detail.chiave === `atleta:${k}`) {
      window.removeEventListener('cloro:fresco', fresco);
      vistaAtleta(k);
    }
  };
  window.addEventListener('cloro:fresco', fresco);
  if (a && (stato.nascosti ?? []).includes(k)) {
    disegna(`${barraTop({ indietro: true })}<main class="pagina"><h1 class="titolo-pagina">Scheda non disponibile</h1><p class="intro">Questa scheda è stata tolta su richiesta.</p></main>${tabBar('atleti')}`);
    return;
  }
  if (!a) {
    disegna(`${barraTop({ indietro: true })}<main class="pagina"><h1 class="titolo-pagina">Scheda in arrivo</h1><p class="intro">Non abbiamo ancora i tempi di questo atleta: stiamo caricando quelli di tutta Italia, una stagione alla volta, e nei prossimi giorni ci sarà anche lui. Intanto torna alla <a href="#/atleti">ricerca</a>.</p></main>${tabBar('atleti')}`);
    return;
  }

  const risultati = a.r ?? [];
  const best = personali(risultati);
  const vasche = [...new Set([...best.values()].map((v) => v.v))].sort();
  let mostraTutte = false;
  let limiti = null;
  let ultimaScelta = {};
  const st = stagioneCorrente();
  const indice = indiceCloro(risultati.filter((x) => stagioneDi(x.d) === st));
  const indicePrima = indice ? null : indiceCloro(risultati.filter((x) => stagioneDi(x.d) === String(Number(st) - 1)));
  const disegnaScheda = ({ vasca, gara, aggiornamento = false } = {}) => {
    ultimaScelta = { vasca, gara };
    const v = vasca ?? (vasche.includes(25) ? 25 : vasche[0]);
    const pb = [...best.values()].filter((x) => x.v === v).sort((x, y) => ordineGara(x.c) - ordineGara(y.c));
    // Gara del grafico: quella scelta, altrimenti la più nuotata.
    const conteggi = new Map();
    for (const x of risultati) if (x.t && x.v === v) conteggi.set(x.c, (conteggi.get(x.c) ?? 0) + 1);
    const g = gara && conteggi.has(gara) ? gara : [...conteggi].sort((x, y) => y[1] - x[1])[0]?.[0];
    const puntiGrafico = risultati.filter((x) => x.t && x.v === v && x.c === g).sort((x, y) => x.d.localeCompare(y.d));
    const seguito = eSeguito(k);
    const gare = new Set(risultati.map((x) => x.g)).size;
    const maxPunti = Math.max(0, ...risultati.map((x) => x.pt ?? 0));

    disegna(`
      ${barraTop({ indietro: true })}
      <main class="pagina">
        <section class="testa-atleta">
          <span class="iniziali" style="width:56px;height:56px;border-radius:18px;font-size:18px" aria-hidden="true">${esc(iniziali(a.n))}</span>
          <h1>${esc(a.n)}</h1>
          <p class="info">${esc([a.y, a.sx === 'F' ? 'Femmine' : a.sx === 'M' ? 'Maschi' : ''].filter(Boolean).join(' · '))}${a.s ? ` · <a href="#/squadre?q=${encodeURIComponent(a.s)}">${esc(a.s)}</a>` : ''}${a.reg && a.reg !== '12' && REGIONI[a.reg] ? ` · ${esc(REGIONI[a.reg])}` : ''}</p>
          <button class="bottone ${seguito ? 'bottone-secondario' : ''}" data-segui aria-pressed="${seguito}">${seguito ? 'Seguito ✓' : 'Segui'}</button>
          <div class="cifre">
            <div class="cifra"><b>${risultati.filter((x) => x.t).length}</b><small>Tempi in ${gare} ${gare === 1 ? 'gara' : 'gare'}</small></div>
            <div class="cifra"><b>${maxPunti || '–'}</b><small>Punti max</small></div>
            <a class="cifra cifra-indice" href="#/classifiche"><b>${indice?.valore ?? indicePrima?.valore ?? '–'}</b><small>Indice Cloro${!indice && indicePrima ? ` ${esc(nomeStagione(String(Number(st) - 1)))}` : ''}</small></a>
          </div>
        </section>

        ${sezioneLimiti()}
        ${seguito ? sezioneObiettivi() : ''}

        ${pb.length ? `
          <section class="sezione">
            <div class="sezione-testa"><h2 class="sezione-titolo">Personali</h2></div>
            ${vasche.length > 1 ? `
              <div class="segmenti" role="tablist" aria-label="Vasca">
                ${vasche.map((x) => `<button class="segmento" role="tab" data-vasca="${x}" aria-selected="${x === v}">Vasca ${x} m</button>`).join('')}
              </div>` : `<p class="nota" style="margin-bottom:10px">Vasca ${v} m</p>`}
            <div class="personali">
              ${pb.map((x) => `
                <button class="personale" data-gara="${esc(x.c)}" aria-pressed="${x.c === g}">
                  <small>${esc(nomeGara(x.c, { breve: true }))}</small>
                  <b>${esc(tempo(x.t))}</b>
                  <span>${esc(giorno(x.d))}${x.pt ? ` · ${x.pt} pt` : ''}</span>
                </button>`).join('')}
            </div>
            ${g ? `
              <div class="scheda grafico">
                <div class="grafico-testa"><b>${esc(nomeGara(g))}</b><small>${puntiGrafico.length} ${puntiGrafico.length === 1 ? 'tempo' : 'tempi'}</small></div>
                ${grafico(puntiGrafico)}
                <div data-posizioni-pb><div data-posizioni></div></div>
              </div>` : ''}
          </section>` : ''}

        <section class="sezione">
          <div class="sezione-testa"><h2 class="sezione-titolo">Tutte le gare</h2></div>
          ${risultati.length ? `
            <ul class="storico">
              ${risultati.slice(0, mostraTutte ? Infinity : 60).map((x, i) => `
                <li>
                  <button type="button" class="voce-storico" data-voce="${i}" aria-expanded="false">
                    <span style="min-width:0">
                      <span class="cosa" style="display:block">${esc(nomeGara(x.c, { breve: true }))} <span class="nota" style="font-weight:600">· vasca ${x.v}</span></span>
                      <span class="dove" style="display:block">${esc(giorno(x.d))} · ${esc(x.gn ?? '')}${x.f ? ' <span class="nota">· migliore della stagione</span>' : ''}</span>
                    </span>
                    <span class="quanto">
                      ${x.t ? `<b>${esc(tempo(x.t))}</b>` : `<b class="nota">${esc(x.x ?? '–')}</b>`}
                      <span class="etichette" style="display:flex;gap:6px">
                        ${x.b ? `<span class="badge ${x.b === 'PB' ? 'badge-pb' : 'badge-sb'}">${x.b}</span>` : ''}
                        ${x.b === 'PB' && x.dp ? `<span class="punti">${esc(differenza(x.dp))}</span>` : (x.pt ? `<span class="punti">${x.pt} pt</span>` : '')}
                      </span>
                    </span>
                  </button>
                </li>`).join('')}
            </ul>
            ${!mostraTutte && risultati.length > 60 ? `<button class="bottone bottone-secondario" data-tutte style="margin-top:10px">Mostra tutti i ${risultati.length} tempi</button>` : ''}` : '<div class="vuoto"><strong>Ancora nessun tempo</strong>Appena nuota una gara la trovi qui.</div>'}
        </section>
        <p class="nota" style="margin-top:20px">Ci sono i tempi delle gare che leggiamo e, dal 2018/19, il migliore di ogni stagione per gara e vasca. Vuoi che questa scheda non compaia? Scrivici dalla pagina <a href="#/privacy">Privacy</a>.</p>
      </main>
      ${tabBar('atleti')}`, (el) => {
      el.querySelector('[data-segui]').addEventListener('click', (e) => seguiAtleta(k, a.n, e.currentTarget));
      el.querySelectorAll('[data-vasca]').forEach((b) => b.addEventListener('click', () => disegnaScheda({ vasca: Number(b.dataset.vasca), aggiornamento: true })));
      el.querySelectorAll('[data-gara]').forEach((b) => b.addEventListener('click', () => disegnaScheda({ vasca: v, gara: b.dataset.gara, aggiornamento: true })));
      collegaObiettivi(el);
      // Personale della gara scelta: dove si piazza nelle graduatorie della sua stagione.
      const pbScelto = pb.find((x) => x.c === g);
      const boxPb = el.querySelector('[data-posizioni-pb]');
      if (pbScelto && boxPb) {
        riempiPosizioni(boxPb, {
          t: pbScelto.t, c: pbScelto.c, v: pbScelto.v, sx: a.sx, st: stagioneDi(pbScelto.d), y: a.y, k,
        });
      }
      // Ogni gara dello storico si apre (una alla volta) con parziali, punti e posizione in classifica.
      const mostrati = risultati.slice(0, mostraTutte ? Infinity : 60);
      el.querySelectorAll('[data-voce]').forEach((b) => b.addEventListener('click', () => {
        const prima = el.querySelector('.voce-storico[aria-expanded="true"]');
        if (prima) {
          prima.setAttribute('aria-expanded', 'false');
          prima.parentElement.querySelector('.dettaglio')?.remove();
          if (prima === b) return;
        }
        const x = mostrati[Number(b.dataset.voce)];
        b.setAttribute('aria-expanded', 'true');
        b.insertAdjacentHTML('afterend', schedaRisultato({
          r: {
            t: x.t, sp: x.sp, b: x.b, dp: x.dp, pt: x.pt, x: x.x, n: a.n,
          },
          codice: x.c,
          nomeBatt: [x.cat, `vasca ${x.v} m`].filter(Boolean).join(' · '),
          extra: `<p class="nota" style="margin:8px 0 0">${esc([giorno(x.d), x.gn, x.f ? 'migliore della stagione dalle graduatorie' : ''].filter(Boolean).join(' · '))}</p>${x.ci ? `
            <a class="bottone bottone-secondario bottone-piccolo" style="margin-top:10px" href="#/gara/${encodeURIComponent(x.g)}?c=${encodeURIComponent(x.ci)}&e=${encodeURIComponent(x.c)}">Apri la gara</a>` : ''}`,
        }));
        const scheda = b.nextElementSibling;
        riempiPosizioni(scheda, {
          t: x.t, c: x.c, v: x.v, sx: a.sx, st: stagioneDi(x.d), y: a.y, k,
        });
      }));
      el.querySelector('[data-tutte]')?.addEventListener('click', () => {
        mostraTutte = true;
        disegnaScheda({ vasca: v, gara: g, aggiornamento: true });
      });
    }, { aggiornamento });
  };
  /* Tempi limite seguiti: per ogni gara nuotata quest'anno, preso / quasi / quanto manca. */
  function esitiLimiti() {
    if (!limiti) return [];
    const cat = codici(a.y, a.sx, st);
    return limitiSeguiti(limiti).filter((l) => String(l.st) === st).map((l) => {
      const gareL = [...new Set(Object.keys(l.t ?? {}).map((x) => x.split('|')[0]))];
      const voci = gareL.map((c) => {
        const lim = limitePer(l, c, a.sx, cat);
        const sb = lim ? migliore(risultati, c, l.vasca, st) : null;
        return lim && sb ? { c, lim, sb, esito: rispettoAlLimite(sb.t, lim) } : null;
      }).filter(Boolean).sort((x, y) => ordineGara(x.c) - ordineGara(y.c));
      return { l, voci };
    }).filter((x) => x.voci.length);
  }
  function sezioneLimiti() {
    const esiti = esitiLimiti();
    if (!esiti.length) return '';
    return `
      <section class="sezione">
        <div class="sezione-testa"><h2 class="sezione-titolo">Tempi limite</h2><a href="#/limiti">Scegli</a></div>
        ${esiti.map(({ l, voci }) => `
          <div class="scheda limite-atleta">
            <a href="#/limiti/${encodeURIComponent(l.id)}"><b>${esc(l.nome)}</b><small>Vasca ${l.vasca} m${codici(a.y, a.sx, st).length ? ` · ${esc(nomeCategoriaAtleta(codici(a.y, a.sx, st), a.sx))}` : ''}</small></a>
            <ul class="limiti-atleta">${voci.map((v) => `
              <li class="esito-${v.esito.tipo}"><span>${esc(nomeGara(v.c, { breve: true }))}</span><b>${esc(tempo(v.sb.t))}</b><small>${v.esito.tipo === 'preso' ? 'preso ✓' : `${v.esito.tipo === 'quasi' ? 'quasi! ' : ''}manca ${esc(tempo(v.esito.diff))}`} · limite ${esc(tempo(v.lim))}</small></li>`).join('')}
            </ul>
          </div>`).join('')}
      </section>`;
  }
  /* Coriandoli la prima volta che si vede un limite preso da un atleta seguito. */
  function forseFesta() {
    if (!eSeguito(k)) return;
    const visti = new Set(memoria(`festa-${k}`) ?? []);
    const nuovi = esitiLimiti().flatMap(({ l, voci }) => voci.filter((v) => v.esito.tipo === 'preso').map((v) => ({ id: `${l.id}|${v.c}`, nome: l.nome, c: v.c })))
      .filter((x) => !visti.has(x.id));
    if (!nuovi.length) return;
    nuovi.forEach((x) => visti.add(x.id));
    memoria(`festa-${k}`, [...visti]);
    coriandoli();
    avviso(`${a.n.split(' ')[0]} ha preso il limite: ${nuovi[0].nome} (${nomeGara(nuovi[0].c, { breve: true })})${nuovi.length > 1 ? ` e altri ${nuovi.length - 1}` : ''}!`);
  }

  /* Obiettivi: tempo da raggiungere per gara e vasca, con la proiezione a fine stagione. */
  const chiaveObiettivo = (c, v) => `${k}|${c}|${v}`;
  function obiettiviAtleta() {
    return Object.entries(stato.profilo?.obiettivi ?? {}).filter(([x]) => x.startsWith(`${k}|`)).map(([x, t]) => {
      const [, c, v] = x.split('|');
      return { c, v: Number(v), t: Number(t) };
    }).sort((x, y) => ordineGara(x.c) - ordineGara(y.c) || x.v - y.v);
  }
  function proiezione(c, v) {
    const punti = risultati.filter((x) => x.t && x.c === c && Number(x.v) === v && stagioneDi(x.d) === st).sort((x, y) => x.d.localeCompare(y.d));
    if (punti.length < 2) return null;
    const giorniDa = (d) => (Date.parse(d) - Date.parse(punti[0].d)) / 86_400_000;
    const xs = punti.map((p) => giorniDa(p.d));
    const ys = punti.map((p) => p.t);
    const mx = xs.reduce((p, q) => p + q, 0) / xs.length;
    const my = ys.reduce((p, q) => p + q, 0) / ys.length;
    const den = xs.reduce((p, x) => p + (x - mx) ** 2, 0);
    if (!den) return null;
    const pend = xs.reduce((p, x, i) => p + (x - mx) * (ys[i] - my), 0) / den;
    const fine = `${Number(st) + 1}-${v === 25 ? '04-30' : '08-10'}`;
    // Chi migliora rallenta con il tempo: metà della tendenza, al massimo l'1,5% sul migliore.
    const sb = Math.min(...ys);
    const stima = sb + pend * 0.5 * Math.max(0, giorniDa(fine) - giorniDa(punti[punti.length - 1].d));
    return Math.round(Math.max(sb * 0.985, Math.min(sb, stima)));
  }
  function sezioneObiettivi() {
    const elenco = obiettiviAtleta();
    const gareNuotate = [...new Set(risultati.filter((x) => x.t).map((x) => `${x.c}|${x.v}`))]
      .map((x) => x.split('|')).sort((x, y) => ordineGara(x[0]) - ordineGara(y[0]) || x[1] - y[1]);
    return `
      <section class="sezione">
        <div class="sezione-testa"><h2 class="sezione-titolo">Obiettivi</h2></div>
        ${elenco.length ? `<ul class="elenco obiettivi">${elenco.map((o) => {
    const sb = migliore(risultati, o.c, o.v, st) ?? migliore(risultati, o.c, o.v, String(Number(st) - 1));
    const pr = proiezione(o.c, o.v);
    const preso = sb && sb.t <= o.t;
    const primo = risultati.filter((x) => x.t && x.c === o.c && Number(x.v) === o.v).sort((x, y) => x.d.localeCompare(y.d))[0];
    const partenza = Math.max(primo?.t ?? 0, sb?.t ?? 0);
    const quota = preso ? 100 : sb && partenza > o.t ? Math.max(4, Math.min(96, Math.round(((partenza - sb.t) / (partenza - o.t)) * 100))) : 4;
    return `
            <li class="scheda obiettivo ${preso ? 'raggiunto' : ''}">
              <div class="obiettivo-testa"><b>${esc(nomeGara(o.c, { breve: true }))} · ${o.v} m</b><span>obiettivo <b>${esc(tempo(o.t))}</b></span>
                <button class="tasto-icona piccolo" data-togli-obiettivo="${esc(chiaveObiettivo(o.c, o.v))}" aria-label="Togli obiettivo">×</button></div>
              <div class="barra-progresso" aria-hidden="true"><i style="width:${quota}%"></i></div>
              <p class="nota">${preso ? `Raggiunto con ${esc(tempo(sb.t))}! 🎉` : sb ? `Migliore stagionale ${esc(tempo(sb.t))}: mancano ${esc(tempo(sb.t - o.t))}.` : 'Ancora nessun tempo quest\'anno.'}
              ${!preso && pr ? ` Al ritmo di quest'anno a fine stagione: <b>${esc(tempo(pr))}</b>${pr <= o.t ? ' — ce la può fare.' : '.'}` : ''}</p>
            </li>`;
  }).join('')}</ul>` : '<p class="nota">Fissa un tempo da raggiungere: ti mostriamo quanto manca e dove arriva a fine stagione se continua così.</p>'}
        ${gareNuotate.length ? `
          <form class="modulo modulo-obiettivo" data-obiettivo novalidate>
            <select name="gara" aria-label="Gara">${gareNuotate.map(([c, v]) => `<option value="${c}|${v}">${esc(nomeGara(c, { breve: true }))} · ${v} m</option>`).join('')}</select>
            <input name="tempo" inputmode="decimal" placeholder="es. 1'02&quot;45" aria-label="Tempo obiettivo">
            <button class="bottone bottone-piccolo" type="submit">Aggiungi</button>
          </form>` : ''}
      </section>`;
  }
  function collegaObiettivi(el) {
    const salva = async (obiettivi, bottone) => {
      try {
        await conAttesa(bottone, () => api.salvaObiettivi(stato.utente.uid, obiettivi));
        stato.profilo = { ...stato.profilo, obiettivi };
        disegnaScheda({ ...ultimaScelta, aggiornamento: true });
      } catch (err) {
        avviso(err.message, 'errore');
      }
    };
    el.querySelector('[data-obiettivo]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      const ms = leggiTempo(f.tempo.value);
      if (!ms) {
        avviso('Scrivi il tempo come 58"45 o 1\'02"45.', 'errore');
        return;
      }
      const [c, v] = f.gara.value.split('|');
      const obiettivi = { ...(stato.profilo?.obiettivi ?? {}), [chiaveObiettivo(c, v)]: ms };
      if (Object.keys(obiettivi).length > 60) {
        avviso('Hai già 60 obiettivi: togline qualcuno.', 'errore');
        return;
      }
      salva(obiettivi, f.querySelector('button'));
    });
    el.querySelectorAll('[data-togli-obiettivo]').forEach((b) => b.addEventListener('click', () => {
      const obiettivi = { ...(stato.profilo?.obiettivi ?? {}) };
      delete obiettivi[b.dataset.togliObiettivo];
      salva(obiettivi, b);
    }));
  }

  disegnaScheda();
  leggiLimiti().then((x) => {
    limiti = x;
    if (!qui() || !x.length) return;
    disegnaScheda({ ...ultimaScelta, aggiornamento: true });
    forseFesta();
  }).catch(() => {});
}

/** Indice Cloro: media pesata dei punti delle 3 gare migliori (stessa formula del controllore). */
export function indiceCloro(risultati = []) {
  const perGara = new Map();
  for (const v of risultati) if (v.pt && (!perGara.has(v.c) || v.pt > perGara.get(v.c).pt)) perGara.set(v.c, v);
  const migliori = [...perGara.values()].sort((x, y) => y.pt - x.pt).slice(0, 3);
  if (!migliori.length) return null;
  const pesi = [0.5, 0.3, 0.2].slice(0, migliori.length);
  const totale = pesi.reduce((x, y) => x + y, 0);
  return { valore: Math.round(migliori.reduce((x, v, i) => x + v.pt * pesi[i], 0) / totale), gare: migliori.map((v) => v.c) };
}
