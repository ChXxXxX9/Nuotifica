// Sezione Gare: elenco delle gare e pagina di una gara (categorie, gare, batterie, classifica, parziali).
import {
  stato, api, esc, barraTop, tabBar, disegna, caricamento, paginaErrore, ICONE, conCache, giaInCache,
  percorso, parametriHash, memoria,
} from './nucleo.js';
import {
  tempo, differenza, nomeGara, periodo, mese, metri, velocita, oggi,
} from './formato.js';
import { seguiAtleta, eSeguito } from './viste-atleti.js';

/* ---------- stato di una gara: in diretta, in corso, in programma, svolta ---------- */

/** live = in corso con risultati in diretta; corso = in corso, risultati a fine gara. */
export function statoGara(g) {
  const o = oggi();
  if (!g?.dal) return 'svolta';
  if (g.dal > o) return 'programma';
  if ((g.al ?? g.dal) < o) return 'svolta';
  return g.fonte === 'italia' ? 'corso' : 'live';
}

function etichettaStato(g) {
  const s = statoGara(g);
  if (s === 'live') return '<span class="live">LIVE</span>';
  if (s === 'corso') return '<span class="etichetta-stato etichetta-corso">IN CORSO</span>';
  if (s === 'programma') {
    const giorni = Math.round((new Date(`${g.dal}T12:00:00`) - new Date(`${oggi()}T12:00:00`)) / 86_400_000);
    return `<span class="etichetta-stato etichetta-programma">${giorni === 1 ? 'DOMANI' : `TRA ${giorni} GIORNI`}</span>`;
  }
  return '<span class="etichetta-stato etichetta-svolta">SVOLTA</span>';
}

export function cartaGara(g, { li = true } = {}) {
  const s = statoGara(g);
  const info = s === 'programma'
    ? `${g.vasca ? `Vasca ${esc(g.vasca)} m · ` : ''}risultati a gara finita`
    : [g.vasca ? `Vasca ${esc(g.vasca)} m` : '', g.conta ? `${g.conta} risultati` : (g.fonte === 'italia' ? 'risultati a gara finita' : '')].filter(Boolean).join(' · ');
  const a = `
    <a class="carta-gara stato-${s}" href="#/gara/${esc(g.id)}">
      <span class="carta-gara-testa">
        <span class="carta-gara-info">${esc(periodo(g.dal, g.al))} · ${esc(g.luogo ?? '')}</span>
        ${etichettaStato(g)}
      </span>
      <span class="carta-gara-nome">${esc(g.nome)}</span>
      ${info ? `<span class="carta-gara-info">${info}</span>` : ''}
    </a>`;
  return li ? `<li>${a}</li>` : a;
}

const PROVINCE_LAZIO = /\((RM|LT|FR|VT|RI)\)/;
export const delLazio = (g) => g.fonte === 'diretta' || /lazio/i.test(g.regione ?? '') || PROVINCE_LAZIO.test(g.luogo ?? '');

/* ---------- elenco ---------- */

export async function vistaGare() {
  const ridisegna = (aggiornamento = false) => {
    const tutte = stato.gare;
    const filtro = memoria('filtro-gare') ?? 'lazio';
    let corpo;
    if (!tutte) {
      corpo = '<p class="caricamento" role="status">Carico le gare…</p>';
    } else {
      const gare = tutte.filter((g) => (filtro === 'lazio' ? delLazio(g) : filtro === 'italia' ? !delLazio(g) : true));
      const adesso = gare.filter((g) => ['live', 'corso'].includes(statoGara(g)));
      const prossime = gare.filter((g) => statoGara(g) === 'programma').sort((a, b) => a.dal.localeCompare(b.dal));
      const svolte = gare.filter((g) => statoGara(g) === 'svolta');
      const perMese = new Map();
      for (const g of svolte) {
        const m = mese(g.dal);
        if (!perMese.has(m)) perMese.set(m, []);
        perMese.get(m).push(g);
      }
      corpo = gare.length ? `
        ${adesso.length ? `<h2 class="mese mese-live">In vasca adesso</h2><ul class="elenco-gare">${adesso.map((g) => cartaGara(g)).join('')}</ul>` : ''}
        ${prossime.length ? `<h2 class="mese mese-programma">In programma</h2><ul class="elenco-gare">${prossime.slice(0, 15).map((g) => cartaGara(g)).join('')}</ul>` : ''}
        ${svolte.length ? '<h2 class="mese mese-svolta">Svolte</h2>' : ''}
        ${[...perMese].map(([m, elenco]) => `<h3 class="mese-sotto">${esc(m)}</h3><ul class="elenco-gare">${elenco.map((g) => cartaGara(g)).join('')}</ul>`).join('')}`
        : '<div class="vuoto" style="margin-top:12px"><strong>Ancora nessuna gara</strong>Appena iniziano a uscire i risultati le trovi qui.</div>';
    }
    const scelte = [['lazio', 'Lazio'], ['italia', 'Resto d\'Italia'], ['tutte', 'Tutte']];
    disegna(`
      ${barraTop()}
      <main class="pagina">
        <h1 class="titolo-pagina">Gare</h1>
        <p class="sottotitolo">Lazio quasi in diretta, con batterie e parziali. Il resto d'Italia a gara finita.</p>
        <div class="filtri" role="toolbar" aria-label="Quali gare" style="margin-top:14px">
          ${scelte.map(([id, nome]) => `<button class="chip" data-filtro-gare="${id}" aria-pressed="${filtro === id}">${nome}</button>`).join('')}
        </div>
        <p class="legenda"><span class="punto-legenda live-l"></span>Live <span class="punto-legenda programma-l"></span>In programma <span class="punto-legenda svolta-l"></span>Svolta</p>
        ${corpo}
      </main>
      ${tabBar('gare')}`, (el) => {
      el.querySelectorAll('[data-filtro-gare]').forEach((b) => b.addEventListener('click', () => {
        memoria('filtro-gare', b.dataset.filtroGare);
        ridisegna(true);
      }));
    }, { aggiornamento });
  };
  ridisegna();
  try {
    const prima = JSON.stringify(stato.gare);
    stato.gare = await conCache('gare', (fresco) => api.leggiGare(fresco), { durata: 30_000 });
    if (percorso() === 'gare' && JSON.stringify(stato.gare) !== prima) ridisegna(true);
    const fresco = (e) => {
      if (percorso() !== 'gare') {
        window.removeEventListener('cloro:fresco', fresco);
        return;
      }
      if (e.detail.chiave !== 'gare') return;
      stato.gare = stato.cache.get('gare')?.valore ?? stato.gare;
      ridisegna(true);
    };
    window.addEventListener('cloro:fresco', fresco);
  } catch (err) {
    if (!stato.gare) paginaErrore(err, { tab: 'gare', indietro: false });
  }
}

/** Gara ancora senza risultati (in programma o appena finita): le informazioni che abbiamo. */
function paginaSenzaRisultati(voce, gara) {
  const futura = statoGara(voce) === 'programma';
  disegna(`
    ${barraTop({ indietro: true })}
    <main class="pagina">
      <div class="testa-gara">
        <div class="riga"><span class="sottotitolo">${esc([voce.luogo, periodo(voce.dal, voce.al), voce.vasca ? `vasca ${voce.vasca} m` : ''].filter(Boolean).join(' · '))}</span>${etichettaStato(voce)}</div>
        <h1>${esc(voce.nome)}</h1>
      </div>
      ${gara?.categorieAmmesse ? `<p class="nota">Categorie: ${esc(gara.categorieAmmesse)}</p>` : ''}
      <div class="vuoto" style="margin-top:16px"><strong>${futura ? 'In programma' : 'Risultati in arrivo'}</strong>${futura
    ? 'I risultati arrivano a gara finita: li trovi qui, e se segui qualcuno che nuota ti avvisiamo.'
    : 'Per questa gara i risultati escono a gara finita: appena li riceviamo compaiono qui.'}</div>
    </main>
    ${tabBar('gare')}`);
}

/* ---------- precaricamento: si inizia a leggere la gara appena il dito tocca la carta ---------- */

const leggiGaraCache = (id) => conCache(`gara:${id}`, (fresco) => api.leggiGara(id, fresco), { durata: 30_000 });
const leggiCategoriaCache = (id, doc, durata) => conCache(`cat:${id}:${doc}`, (fresco) => api.leggiCategoria(id, doc, fresco), { durata });

async function precarica(id) {
  try {
    const gara = await leggiGaraCache(id);
    const cat = gara?.categorie?.find((c) => c.id === memoria(`cat-${id}`)) ?? gara?.categorie?.[0];
    if (cat) await Promise.all(cat.docs.map((d) => leggiCategoriaCache(id, d, 120_000)));
  } catch { /* si riprova all'apertura */ }
}
document.addEventListener('pointerdown', (e) => {
  const a = e.target.closest?.('a[href^="#/gara/"]');
  if (a) precarica(decodeURIComponent(a.getAttribute('href').slice(7).split('?')[0]));
}, { passive: true });

/* ---------- una gara ---------- */

let timerTribuna = null;
let wakeLock = null;

async function tieniAcceso(acceso) {
  try {
    if (acceso && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!acceso && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* non supportato: pazienza */ }
}

/** Unisce gli eventi di una categoria che arrivano da più sedi. */
function unisciCategoria(documenti) {
  const eventi = new Map();
  const piuSedi = documenti.filter(Boolean).length > 1;
  for (const doc of documenti) {
    if (!doc) continue;
    for (const e of doc.eventi ?? []) {
      if (!eventi.has(e.c)) eventi.set(e.c, { c: e.c, n: e.n, b: [] });
      for (const b of e.b ?? []) eventi.get(e.c).b.push({ ...b, sede: piuSedi ? doc.sede : '' });
    }
  }
  return [...eventi.values()];
}

/** Posizione di ogni tempo nella classifica complessiva della gara. */
function posizioniClassifica(evento) {
  const tutti = evento.b.flatMap((b) => b.r).filter((r) => r.t).map((r) => r.t).sort((a, b) => a - b);
  return (t) => (t ? tutti.indexOf(t) + 1 : null);
}

/** Scheda di un risultato: tempo, posizioni, punti e parziali disegnati. */
function schedaRisultato({ r, codice, batteria, posTot }) {
  const dist = metri(codice);
  const passaggi = r.t ? [...(r.sp ?? []).map((p) => ({ m: p.m, t: p.t, p: p.p })), { m: dist, t: r.t }] : [];
  const conParziali = passaggi.length > 1;
  const frazioni = passaggi.map((p, i) => (i === 0 ? p.t : p.t - passaggi[i - 1].t));
  const min = Math.min(...frazioni.slice(1));
  const max = Math.max(...frazioni.slice(1));
  const lenta = frazioni.length > 2 ? frazioni.indexOf(max, 1) : -1;
  const veloce = frazioni.length > 2 ? frazioni.indexOf(min, 1) : -1;
  const larghezza = (f, i) => {
    if (i === 0 || max === min) return 70;
    return Math.round(42 + (58 * (f - min)) / (max - min));
  };
  // Andatura: prima metà contro seconda metà.
  let andatura = '';
  const meta = passaggi.find((p) => p.m === dist / 2);
  if (conParziali && meta && dist >= 100) {
    const prima = meta.t;
    const seconda = r.t - meta.t;
    const d = seconda - prima;
    andatura = `
      <div class="andatura">
        <span><small>Prima metà</small><b>${esc(tempo(prima))}</b></span>
        <span><small>Seconda metà</small><b>${esc(tempo(seconda))}</b></span>
        <span><small>${d <= 0 ? 'In progressione' : 'Calo'}</small><b class="${d <= 0 ? 'buono' : ''}">${esc(differenza(d) || '0"00')}</b></span>
      </div>`;
  }
  const cifre = [
    r.pt ? `<div><b>${r.pt}</b><small>punti</small></div>` : '',
    r.p ? `<div><b>${r.p}°</b><small>in batteria</small></div>` : '',
    posTot ? `<div><b>${posTot}°</b><small>in classifica</small></div>` : '',
    r.t && dist ? `<div><b>${esc(velocita(dist, r.t).replace(' km/h', ''))}</b><small>km/h di media</small></div>` : '',
  ].filter(Boolean);
  const seguito = r.k && eSeguito(r.k);
  return `
    <div class="dettaglio">
      <div class="dettaglio-testa">
        <div>
          <span class="dettaglio-tempo">${r.t ? esc(tempo(r.t)) : esc(r.x ?? '–')}</span>
          ${r.b ? `<span class="badge ${r.b === 'PB' ? 'badge-pb' : 'badge-sb'}">${r.b === 'PB' ? 'PERSONALE' : 'STAGIONALE'}</span>` : ''}
        </div>
        <span class="dettaglio-dove">${esc([batteria ? `Batteria ${batteria}` : '', r.c ? `corsia ${r.c}` : ''].filter(Boolean).join(' · '))}</span>
      </div>
      ${r.b === 'PB' && r.dp ? `<p class="dettaglio-pb">${esc(differenza(r.dp))} sul personale di prima</p>` : ''}
      ${cifre.length ? `<div class="cifre-piccole" style="grid-template-columns:repeat(${cifre.length},minmax(0,1fr))">${cifre.join('')}</div>` : ''}
      ${conParziali ? `
        <div class="parziali-grafico" aria-label="Parziali">
          <div class="fraz fraz-testa"><span>Vasca</span><span></span><span>Frazione</span><span>Passaggio</span></div>
          ${passaggi.map((p, i) => `
            <div class="fraz ${i === lenta ? 'fraz-lenta' : ''} ${i === veloce ? 'fraz-veloce' : ''}">
              <span class="fraz-m">${p.m} m</span>
              <span class="fraz-barra" aria-hidden="true"><i style="width:${larghezza(frazioni[i], i)}%"></i></span>
              <span class="fraz-t">${esc(tempo(frazioni[i]))}</span>
              <span class="fraz-c">${esc(tempo(p.t))}${p.p ? ` <em>${p.p}°</em>` : ''}</span>
            </div>`).join('')}
          <p class="fraz-legenda"><span class="punto-legenda veloce-l"></span>vasca più veloce <span class="punto-legenda lenta-l"></span>più lenta${passaggi.some((p) => p.p) ? ' · ° = posizione al passaggio' : ''}</p>
        </div>
        ${andatura}`
    : (r.t && dist > 50 ? '<p class="nota">Parziali non disponibili per questa gara.</p>' : '')}
      ${r.k ? `
        <div class="dettaglio-azioni">
          <a class="bottone bottone-secondario bottone-piccolo" href="#/atleta/${encodeURIComponent(r.k)}">Scheda atleta</a>
          <button class="bottone bottone-piccolo ${seguito ? 'bottone-secondario' : ''}" data-segui="${esc(r.k)}" data-nome="${esc(r.n)}">${seguito ? 'Seguito ✓' : 'Segui'}</button>
        </div>` : ''}
    </div>`;
}

function rigaRisultato(i, r, { posizione, sotto } = {}) {
  const seguito = r.k && eSeguito(r.k);
  const etichette = [
    r.b ? `<span class="badge ${r.b === 'PB' ? 'badge-pb' : 'badge-sb'}">${r.b}</span>` : '',
    r.pt ? `<span class="punti">${r.pt} pt</span>` : '',
  ].join('');
  return `
    <li class="risultato ${seguito ? 'seguito' : ''}">
      <button type="button" aria-expanded="false" data-i="${i}">
        <span class="pos"><b>${posizione ?? r.p ?? '–'}</b><small>${esc(sotto ?? (r.c ? `C${r.c}` : ''))}</small></span>
        <span class="chi"><b>${esc(r.n)}</b><small>${esc([r.y, r.s].filter(Boolean).join(' · '))}</small></span>
        <span class="quanto">
          ${r.t ? `<b>${esc(tempo(r.t))}</b>` : `<b class="stato">${esc(r.x ?? '–')}</b>`}
          ${etichette ? `<span class="etichette">${etichette}</span>` : ''}
        </span>
      </button>
    </li>`;
}

/** Righe e HTML per la vista "batterie" o "classifica". Le righe servono ad aprire le schede. */
function costruisciElenco(evento, vista) {
  const righe = [];
  const posTot = posizioniClassifica(evento);
  if (vista === 'batterie') {
    const conTurni = new Set(evento.b.map((b) => b.tu)).size > 1;
    const html = evento.b.map((b) => `
      <h3 class="batteria-titolo"><span>${conTurni ? `Turno ${Number(b.tu) || b.tu} · ` : ''}Batteria ${b.n}</span><span>${esc([b.sede, b.d ? periodo(b.d) : ''].filter(Boolean).join(' · '))}</span></h3>
      <ol class="risultati">${b.r.map((r) => {
    righe.push({ r, codice: evento.c, batteria: b.n, posTot: posTot(r.t) });
    return rigaRisultato(righe.length - 1, r);
  }).join('')}</ol>`).join('');
    return { righe, html };
  }
  const tutte = evento.b.flatMap((b) => b.r.map((r) => ({ r, batteria: b.n })));
  const conTempo = tutte.filter((x) => x.r.t).sort((a, b) => a.r.t - b.r.t);
  const senza = tutte.filter((x) => !x.r.t);
  let pos = 0;
  let ultimo = null;
  const pezzi = conTempo.map((x, i) => {
    if (x.r.t !== ultimo) pos = i + 1;
    ultimo = x.r.t;
    righe.push({ r: x.r, codice: evento.c, batteria: x.batteria, posTot: pos });
    return rigaRisultato(righe.length - 1, x.r, { posizione: pos, sotto: x.batteria ? `B${x.batteria}` : '' });
  });
  for (const x of senza) {
    righe.push({ r: x.r, codice: evento.c, batteria: x.batteria, posTot: null });
    pezzi.push(rigaRisultato(righe.length - 1, x.r, { posizione: '–', sotto: x.batteria ? `B${x.batteria}` : '' }));
  }
  return { righe, html: `<ol class="risultati" style="margin-top:12px">${pezzi.join('')}</ol>` };
}

export async function vistaGara(id) {
  clearInterval(timerTribuna);
  const qui = () => percorso() === `gara/${id}`;
  if (!giaInCache(`gara:${id}`)) caricamento('Apro la gara…', { tab: 'gare' });

  let gara;
  try {
    gara = await leggiGaraCache(id);
  } catch (err) {
    if (qui()) paginaErrore(err);
    return;
  }
  if (!qui()) return;
  const voce = (stato.gare ?? []).find((g) => g.id === id);
  if (!gara || (!gara.categorie?.length && voce)) {
    if (voce) {
      paginaSenzaRisultati(voce, gara);
      return;
    }
    disegna(`${barraTop({ indietro: true })}<main class="pagina"><h1 class="titolo-pagina">Gara non trovata</h1><p class="intro">Torna all'<a href="#/gare">elenco delle gare</a>.</p></main>${tabBar('gare')}`);
    return;
  }
  const categorie = gara.categorie ?? [];
  if (!categorie.length) {
    disegna(`${barraTop({ indietro: true })}<main class="pagina"><h1 class="titolo-pagina">${esc(gara.nome)}</h1><div class="vuoto"><strong>Ancora nessun risultato</strong>Appena escono li trovi qui.</div></main>${tabBar('gare')}`);
    return;
  }
  const live = statoGara(gara) === 'live';
  const tribuna = memoria('tribuna') === true;
  const durata = live ? 30_000 : 600_000;

  // Categoria, gara e vista scelte: stanno nell'indirizzo, ma si cambiano senza ricaricare la pagina.
  const scelta = () => {
    const p = parametriHash();
    const cat = categorie.find((c) => c.id === p.get('c')) ?? categorie.find((c) => c.id === memoria(`cat-${id}`)) ?? categorie[0];
    return { cat, e: p.get('e'), v: p.get('v') };
  };
  const vai = (params) => {
    const { cat, e, v } = scelta();
    const q = new URLSearchParams({ c: cat.id, ...(e ? { e } : {}), ...(v ? { v } : {}), ...params });
    if (params.c && params.c !== cat.id) q.delete('e');
    history.replaceState(null, '', `#/gara/${encodeURIComponent(id)}?${q}`);
    mostraCategoria({ aggiornamento: true });
  };
  const documentiDi = (cat) => cat.docs.map((d) => giaInCache(`cat:${id}:${d}`));
  let righe = [];
  let aperta = null;

  const pagina = ({ cat, eventi, evento, vista, caricando }) => {
    const soloClassifica = gara.fonte === 'italia';
    const atleti = evento ? evento.b.reduce((t, b) => t + b.r.length, 0) : 0;
    let elenco = { righe: [], html: '' };
    if (evento) elenco = costruisciElenco(evento, vista);
    righe = elenco.righe;
    aperta = null;
    return `
      ${barraTop({
    indietro: true,
    azioni: `
      ${live ? `<button class="tasto-icona" data-azione="aggiorna" aria-label="Aggiorna i risultati">${ICONE.aggiorna}</button>` : ''}
      <button class="tasto-icona ${tribuna ? 'attivo' : ''}" data-azione="tribuna" aria-pressed="${tribuna}" aria-label="Modalità tribuna: caratteri grandi e schermo acceso">${ICONE.tribuna}</button>`,
  })}
      <main class="pagina">
        <div class="testa-gara stato-${statoGara(gara)}">
          <div class="riga"><span class="sottotitolo">${esc([gara.luogo, periodo(gara.dal, gara.al), gara.vasca ? `vasca ${gara.vasca} m` : ''].filter(Boolean).join(' · '))}</span>${etichettaStato(gara)}</div>
          <h1>${esc(gara.nome)}</h1>
        </div>
        <nav class="chips" aria-label="Categorie">
          ${categorie.map((c) => `<button class="chip" data-c="${esc(c.id)}" aria-pressed="${c.id === cat.id}">${esc(c.nome)}</button>`).join('')}
        </nav>
        ${caricando ? '<p class="caricamento" role="status">Carico i risultati…</p>' : evento ? `
          <nav class="chips" aria-label="Gare" style="margin-top:8px">
            ${eventi.map((e) => `<button class="chip" data-e="${esc(e.c)}" aria-pressed="${e.c === evento.c}">${esc(nomeGara(e.c, { breve: true }))}</button>`).join('')}
          </nav>
          <h2 class="evento-titolo">${esc(evento.n || nomeGara(evento.c))}</h2>
          <p class="sottotitolo">${esc(cat.nome)} · ${soloClassifica ? '' : `${evento.b.length} ${evento.b.length === 1 ? 'batteria' : 'batterie'} · `}${atleti} ${atleti === 1 ? 'atleta' : 'atleti'}</p>
          ${soloClassifica ? '<p class="nota" style="margin-top:8px">Risultati a gara finita: classifica completa, senza batterie e parziali.</p>' : `
          <div class="segmenti" role="tablist" aria-label="Vista">
            <button class="segmento" role="tab" data-v="batterie" aria-selected="${vista === 'batterie'}">Batterie</button>
            <button class="segmento" role="tab" data-v="classifica" aria-selected="${vista === 'classifica'}">Classifica</button>
          </div>`}
          ${elenco.html}
          <p class="nota" style="margin-top:16px">Tocca un nome per la sua gara: parziali, punti e posizioni. Punti World Aquatics; PB = nuovo personale, SB = migliore della stagione.</p>`
    : '<div class="vuoto" style="margin-top:16px"><strong>Ancora nessun risultato</strong>Appena escono li trovi qui.</div>'}
      </main>
      ${tabBar('gare')}`;
  };

  const collega = (el) => {
    el.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => vai({ c: b.dataset.c })));
    el.querySelectorAll('[data-e]').forEach((b) => b.addEventListener('click', () => vai({ e: b.dataset.e })));
    el.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => vai({ v: b.dataset.v })));
    // Un risultato aperto alla volta; la scheda si disegna solo quando si apre.
    el.querySelectorAll('.risultato > button').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.i);
      const prima = el.querySelector('.risultato > button[aria-expanded="true"]');
      if (prima) {
        prima.setAttribute('aria-expanded', 'false');
        prima.parentElement.querySelector('.dettaglio')?.remove();
      }
      if (aperta === i) {
        aperta = null;
        return;
      }
      aperta = i;
      b.setAttribute('aria-expanded', 'true');
      b.insertAdjacentHTML('afterend', schedaRisultato(righe[i]));
      const scheda = b.nextElementSibling;
      scheda.querySelector('[data-segui]')?.addEventListener('click', (e) => seguiAtleta(e.currentTarget.dataset.segui, e.currentTarget.dataset.nome, e.currentTarget));
      const sotto = scheda.getBoundingClientRect().bottom - (window.innerHeight - 90);
      if (sotto > 0) window.scrollBy({ top: Math.min(sotto, b.getBoundingClientRect().top - 70), behavior: 'smooth' });
    }));
    el.querySelector('[data-azione="tribuna"]').addEventListener('click', () => {
      memoria('tribuna', !tribuna);
      vistaGara(id);
    });
    el.querySelector('[data-azione="aggiorna"]')?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      await aggiornaDaRete();
    });
  };

  const mostraCategoria = async ({ aggiornamento = false } = {}) => {
    const { cat, e, v } = scelta();
    memoria(`cat-${id}`, cat.id);
    const vista = gara.fonte === 'italia' || v === 'classifica' ? 'classifica' : 'batterie';
    let docs = documentiDi(cat);
    if (docs.some((d) => d === undefined)) {
      disegna(pagina({ cat, caricando: true }), collega, { aggiornamento, classeBody: tribuna ? 'tribuna' : '' });
      try {
        docs = await Promise.all(cat.docs.map((d) => leggiCategoriaCache(id, d, durata)));
      } catch (err) {
        if (qui()) paginaErrore(err);
        return;
      }
      if (!qui() || scelta().cat.id !== cat.id) return;
    }
    const eventi = unisciCategoria(docs);
    const evento = eventi.find((x) => x.c === e) ?? eventi[0];
    disegna(pagina({
      cat, eventi, evento, vista,
    }), collega, { aggiornamento: true, classeBody: tribuna ? 'tribuna' : '' });
  };

  const aggiornaDaRete = async () => {
    const { cat } = scelta();
    cat.docs.forEach((d) => stato.cache.delete(`cat:${id}:${d}`));
    try {
      await Promise.all(cat.docs.map((d) => leggiCategoriaCache(id, d, durata)));
      if (qui() && aperta === null) mostraCategoria({ aggiornamento: true });
    } catch { /* riproviamo */ }
  };

  await mostraCategoria();

  // Dati più freschi arrivati dopo la copia salvata sul telefono: si ridisegna (se non c'è una scheda aperta).
  const fresco = (e) => {
    if (!qui()) {
      window.removeEventListener('cloro:fresco', fresco);
      return;
    }
    if (e.detail.chiave.startsWith(`cat:${id}:`) && aperta === null) mostraCategoria({ aggiornamento: true });
  };
  window.addEventListener('cloro:fresco', fresco);

  // Tribuna: schermo acceso e, durante la gara, risultati che si aggiornano da soli.
  tieniAcceso(tribuna);
  if (live) {
    timerTribuna = setInterval(() => {
      if (!qui()) {
        clearInterval(timerTribuna);
        tieniAcceso(false);
        return;
      }
      if (document.visibilityState === 'visible' && aperta === null) aggiornaDaRete();
    }, tribuna ? 30_000 : 60_000);
  }
}

