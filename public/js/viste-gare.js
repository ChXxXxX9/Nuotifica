// Sezione Gare: elenco delle gare e pagina di una gara (categorie, gare, batterie, classifica, parziali).
import {
  stato, api, esc, barraTop, tabBar, disegna, caricamento, paginaErrore, ICONE, conCache, giaInCache,
  percorso, parametriHash, memoria, pocoMovimento,
} from './nucleo.js';
import {
  tempo, differenza, nomeGara, periodo, mese, inCorso, metri, velocita, oggi,
} from './formato.js';
import { seguiAtleta, eSeguito } from './viste-atleti.js';

/* ---------- elenco ---------- */

function cartaGara(g) {
  const live = inCorso(g);
  return `
    <li>
      <a class="carta-gara ${live ? 'in-corso' : ''}" href="#/gara/${esc(g.id)}">
        <span class="carta-gara-testa">
          <span class="carta-gara-info">${esc(periodo(g.dal, g.al))} · ${esc(g.luogo ?? '')}</span>
          ${live ? (g.fonte === 'italia' ? '<span class="badge badge-tenue">IN CORSO</span>' : '<span class="live">LIVE</span>') : ''}
        </span>
        <span class="carta-gara-nome">${esc(g.nome)}</span>
        <span class="carta-gara-info">${g.vasca ? `Vasca ${esc(g.vasca)} m` : ''}${g.conta ? ` · ${g.conta} risultati` : (g.fonte === 'italia' ? ' · risultati a gara finita' : '')}</span>
      </a>
    </li>`;
}

const PROVINCE_LAZIO = /\((RM|LT|FR|VT|RI)\)/;
export const delLazio = (g) => g.fonte === 'diretta' || /lazio/i.test(g.regione ?? '') || PROVINCE_LAZIO.test(g.luogo ?? '');

export async function vistaGare() {
  const ridisegna = (aggiornamento = false) => {
    const tutte = stato.gare;
    const filtro = memoria('filtro-gare') ?? 'lazio';
    let corpo;
    if (!tutte) {
      corpo = '<p class="caricamento" role="status">Carico le gare…</p>';
    } else {
      const o = oggi();
      const gare = tutte.filter((g) => (filtro === 'lazio' ? delLazio(g) : filtro === 'italia' ? !delLazio(g) : true));
      const inGara = gare.filter(inCorso);
      const prossime = gare.filter((g) => g.dal > o).sort((a, b) => a.dal.localeCompare(b.dal));
      const passate = gare.filter((g) => !inCorso(g) && g.dal <= o);
      const perMese = new Map();
      for (const g of passate) {
        const m = mese(g.dal);
        if (!perMese.has(m)) perMese.set(m, []);
        perMese.get(m).push(g);
      }
      corpo = gare.length ? `
        ${inGara.length ? `<h2 class="mese">In vasca adesso</h2><ul class="elenco-gare">${inGara.map(cartaGara).join('')}</ul>` : ''}
        ${prossime.length ? `<h2 class="mese">In programma</h2><ul class="elenco-gare">${prossime.slice(0, 12).map(cartaGara).join('')}</ul>` : ''}
        ${[...perMese].map(([m, elenco]) => `<h2 class="mese">${esc(m)}</h2><ul class="elenco-gare">${elenco.map(cartaGara).join('')}</ul>`).join('')}`
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
    stato.gare = await conCache('gare', () => api.leggiGare(), { durata: 30_000 });
    if (percorso() === 'gare' && JSON.stringify(stato.gare) !== prima) ridisegna(true);
  } catch (err) {
    if (!stato.gare) paginaErrore(err, { tab: 'gare', indietro: false });
  }
}

/** Gara ancora senza risultati (in programma o appena finita): le informazioni che abbiamo. */
function paginaSenzaRisultati(voce, gara) {
  const futura = voce.dal > oggi();
  disegna(`
    ${barraTop({ indietro: true })}
    <main class="pagina">
      <div class="testa-gara">
        <div class="riga"><span class="sottotitolo">${esc([voce.luogo, periodo(voce.dal, voce.al), voce.vasca ? `vasca ${voce.vasca} m` : ''].filter(Boolean).join(' · '))}</span>${inCorso(voce) ? '<span class="live">IN CORSO</span>' : ''}</div>
        <h1>${esc(voce.nome)}</h1>
      </div>
      ${gara?.categorieAmmesse ? `<p class="nota">Categorie: ${esc(gara.categorieAmmesse)}</p>` : ''}
      <div class="vuoto" style="margin-top:16px"><strong>${futura ? 'In programma' : 'Risultati in arrivo'}</strong>${futura
    ? 'I risultati arrivano a gara finita: li trovi qui, e se segui qualcuno che nuota ti avvisiamo.'
    : 'Per questa gara i risultati escono a gara finita: appena li riceviamo compaiono qui.'}</div>
    </main>
    ${tabBar('gare')}`);
}

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

function righeParziali(r, codice) {
  const sp = r.sp ?? [];
  if (!sp.length || !r.t) return '';
  const passaggi = [...sp.map((p) => ({ m: p.m, t: p.t })), { m: metri(codice), t: r.t }];
  const frazioni = passaggi.map((p, i) => (i === 0 ? p.t : p.t - passaggi[i - 1].t));
  // La frazione più lenta (esclusa la prima, che parte dal blocco).
  let lenta = -1;
  if (frazioni.length > 2) {
    const resto = frazioni.slice(1);
    lenta = 1 + resto.indexOf(Math.max(...resto));
  }
  return `
    <div class="parziali" aria-label="Parziali">
      ${passaggi.map((p, i) => `
        <div class="parziale ${i === lenta ? 'lenta' : ''}">
          <small>${p.m} m</small>
          <b>${esc(tempo(p.t))}</b>
          <span>${i === 0 ? 'partenza' : esc(tempo(frazioni[i]))}</span>
        </div>`).join('')}
    </div>`;
}

function rigaRisultato(r, codice, { posizione, sotto } = {}) {
  const seguito = r.k && eSeguito(r.k);
  const etichette = [
    r.b ? `<span class="badge ${r.b === 'PB' ? 'badge-pb' : 'badge-sb'}">${r.b}</span>` : '',
    r.pt ? `<span class="punti">${r.pt} pt</span>` : '',
  ].join('');
  const dettaglio = `
    <div class="dettaglio" hidden>
      ${righeParziali(r, codice)}
      ${r.t ? `<p class="nota">${r.b === 'PB' && r.dp ? `Nuovo personale: ${esc(differenza(r.dp))} rispetto a prima · ` : ''}Media ${esc(velocita(metri(codice), r.t))}</p>` : ''}
      ${r.k ? `
        <div class="dettaglio-azioni">
          <a class="bottone bottone-secondario bottone-piccolo" href="#/atleta/${encodeURIComponent(r.k)}">Scheda atleta</a>
          <button class="bottone bottone-piccolo ${seguito ? 'bottone-secondario' : ''}" data-segui="${esc(r.k)}" data-nome="${esc(r.n)}">${seguito ? 'Seguito ✓' : 'Segui'}</button>
        </div>` : ''}
    </div>`;
  return `
    <li class="risultato ${seguito ? 'seguito' : ''}">
      <button type="button" aria-expanded="false">
        <span class="pos"><b>${posizione ?? r.p ?? '–'}</b><small>${esc(sotto ?? (r.c ? `C${r.c}` : ''))}</small></span>
        <span class="chi"><b>${esc(r.n)}</b><small>${esc([r.y, r.s].filter(Boolean).join(' · '))}</small></span>
        <span class="quanto">
          ${r.t ? `<b>${esc(tempo(r.t))}</b>` : `<b class="stato">${esc(r.x ?? '–')}</b>`}
          ${etichette ? `<span class="etichette">${etichette}</span>` : ''}
        </span>
      </button>
      ${dettaglio}
    </li>`;
}

function vistaBatterie(evento) {
  const conTurni = new Set(evento.b.map((b) => b.tu)).size > 1;
  return evento.b.map((b) => `
    <h3 class="batteria-titolo"><span>${conTurni ? `Turno ${Number(b.tu) || b.tu} · ` : ''}Batteria ${b.n}</span><span>${esc([b.sede, b.d ? periodo(b.d) : ''].filter(Boolean).join(' · '))}</span></h3>
    <ol class="risultati">${b.r.map((r) => rigaRisultato(r, evento.c)).join('')}</ol>`).join('');
}

function vistaClassifica(evento) {
  const tutte = evento.b.flatMap((b) => b.r.map((r) => ({ ...r, batteria: b.n })));
  const conTempo = tutte.filter((r) => r.t).sort((a, b) => a.t - b.t);
  const senza = tutte.filter((r) => !r.t);
  let pos = 0;
  let ultimo = null;
  const righe = conTempo.map((r, i) => {
    if (r.t !== ultimo) pos = i + 1;
    ultimo = r.t;
    return rigaRisultato(r, evento.c, { posizione: pos, sotto: r.batteria ? `B${r.batteria}` : '' });
  });
  return `
    <ol class="risultati" style="margin-top:12px">${righe.join('')}${senza.map((r) => rigaRisultato(r, evento.c, { posizione: '–', sotto: r.batteria ? `B${r.batteria}` : '' })).join('')}</ol>`;
}

export async function vistaGara(id) {
  clearInterval(timerTribuna);
  const qui = () => percorso() === `gara/${id}`;
  const gara0 = giaInCache(`gara:${id}`);
  if (!gara0) caricamento('Apro la gara…');

  let gara;
  try {
    gara = await conCache(`gara:${id}`, () => api.leggiGara(id), { durata: 30_000 });
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

  const par = parametriHash();
  const categorie = gara.categorie ?? [];
  const ricordata = memoria(`cat-${id}`);
  const cat = categorie.find((c) => c.id === par.get('c')) ?? categorie.find((c) => c.id === ricordata) ?? categorie[0];
  if (!cat) {
    disegna(`${barraTop({ indietro: true })}<main class="pagina"><h1 class="titolo-pagina">${esc(gara.nome)}</h1><div class="vuoto"><strong>Ancora nessun risultato</strong>Appena escono li trovi qui.</div></main>${tabBar('gare')}`);
    return;
  }
  memoria(`cat-${id}`, cat.id);
  const live = inCorso(gara) && gara.fonte !== 'italia';
  const tribuna = memoria('tribuna') === true;

  const caricaCategoria = (fresco = false) => Promise.all(cat.docs.map((doc) => {
    const chiave = `cat:${id}:${doc}`;
    if (fresco) stato.cache.delete(chiave);
    return conCache(chiave, () => api.leggiCategoria(id, doc), { durata: live ? 30_000 : 600_000 });
  }));

  let documenti;
  if (!cat.docs.every((d) => giaInCache(`cat:${id}:${d}`))) {
    if (gara0) caricamento('Carico i risultati…');
  }
  try {
    documenti = await caricaCategoria();
  } catch (err) {
    if (qui()) paginaErrore(err);
    return;
  }
  if (!qui()) return;

  const disegnaTutto = (docs, { aggiornamento = false } = {}) => {
    const eventi = unisciCategoria(docs);
    const p = parametriHash();
    const evento = eventi.find((e) => e.c === p.get('e')) ?? eventi[0];
    const soloClassifica = gara.fonte === 'italia';
    const vista = soloClassifica || p.get('v') === 'classifica' ? 'classifica' : 'batterie';
    const atleti = evento ? evento.b.reduce((t, b) => t + b.r.length, 0) : 0;
    const link = (params) => {
      const q = new URLSearchParams({ c: cat.id, ...(evento ? { e: evento.c } : {}), v: vista, ...params });
      return `#/gara/${encodeURIComponent(id)}?${q}`;
    };

    disegna(`
      ${barraTop({
    indietro: true,
    azioni: `
      ${live ? `<button class="tasto-icona" data-azione="aggiorna" aria-label="Aggiorna i risultati">${ICONE.aggiorna}</button>` : ''}
      <button class="tasto-icona ${tribuna ? 'attivo' : ''}" data-azione="tribuna" aria-pressed="${tribuna}" aria-label="Modalità tribuna: caratteri grandi e schermo acceso">${ICONE.tribuna}</button>`,
  })}
      <main class="pagina">
        <div class="testa-gara">
          <div class="riga"><span class="sottotitolo">${esc([gara.luogo, periodo(gara.dal, gara.al), `vasca ${gara.vasca} m`].filter(Boolean).join(' · '))}</span>${live ? '<span class="live">LIVE</span>' : ''}</div>
          <h1>${esc(gara.nome)}</h1>
        </div>
        <nav class="chips" aria-label="Categorie">
          ${categorie.map((c) => `<a class="chip" href="#/gara/${encodeURIComponent(id)}?c=${encodeURIComponent(c.id)}" aria-current="${c.id === cat.id}" data-sostituisci>${esc(c.nome)}</a>`).join('')}
        </nav>
        ${evento ? `
          <nav class="chips" aria-label="Gare" style="margin-top:8px">
            ${eventi.map((e) => `<a class="chip" href="${link({ e: e.c })}" aria-current="${e.c === evento.c}" data-sostituisci>${esc(nomeGara(e.c, { breve: true }))}</a>`).join('')}
          </nav>
          <h2 class="evento-titolo">${esc(evento.n || nomeGara(evento.c))}</h2>
          <p class="sottotitolo">${esc(cat.nome)} · ${soloClassifica ? '' : `${evento.b.length} ${evento.b.length === 1 ? 'batteria' : 'batterie'} · `}${atleti} ${atleti === 1 ? 'atleta' : 'atleti'}</p>
          ${soloClassifica ? '<p class="nota" style="margin-top:8px">Risultati a gara finita: classifica completa, senza batterie e parziali.</p>' : `
          <div class="segmenti" role="tablist" aria-label="Vista">
            <a class="segmento" role="tab" href="${link({ v: 'batterie' })}" aria-selected="${vista === 'batterie'}" data-sostituisci style="display:grid;place-items:center;text-decoration:none">Batterie</a>
            <a class="segmento" role="tab" href="${link({ v: 'classifica' })}" aria-selected="${vista === 'classifica'}" data-sostituisci style="display:grid;place-items:center;text-decoration:none">Classifica</a>
          </div>`}
          ${vista === 'classifica' ? vistaClassifica(evento) : vistaBatterie(evento)}
          <p class="nota" style="margin-top:16px">Tocca un nome per i parziali. I punti sono quelli World Aquatics; PB = nuovo personale, SB = migliore della stagione.</p>`
    : '<div class="vuoto" style="margin-top:16px"><strong>Ancora nessun risultato</strong>Appena escono li trovi qui.</div>'}
      </main>
      ${tabBar('gare')}`, (el) => {
      // Cambi di categoria/gara/vista: si sostituisce l'indirizzo (il tasto indietro torna all'elenco).
      el.querySelectorAll('[data-sostituisci]').forEach((a) => a.addEventListener('click', (e) => {
        e.preventDefault();
        location.replace(a.getAttribute('href'));
      }));
      el.querySelectorAll('.risultato > button').forEach((b) => b.addEventListener('click', () => {
        const d = b.nextElementSibling;
        const apri = d.hidden;
        d.hidden = !apri;
        b.setAttribute('aria-expanded', String(apri));
      }));
      el.querySelectorAll('[data-segui]').forEach((b) => b.addEventListener('click', async () => {
        await seguiAtleta(b.dataset.segui, b.dataset.nome, b);
      }));
      el.querySelector('[data-azione="tribuna"]').addEventListener('click', () => {
        memoria('tribuna', !tribuna);
        vistaGara(id);
      });
      el.querySelector('[data-azione="aggiorna"]')?.addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        stato.cache.delete(`gara:${id}`);
        await caricaCategoria(true).then((d) => qui() && disegnaTutto(d, { aggiornamento: true })).catch(() => {});
      });
    }, { aggiornamento, classeBody: tribuna ? 'tribuna' : '' });
  };

  disegnaTutto(documenti);

  // Tribuna: schermo acceso e, durante la gara, risultati che si aggiornano da soli.
  tieniAcceso(tribuna);
  if (live) {
    timerTribuna = setInterval(async () => {
      if (!qui()) {
        clearInterval(timerTribuna);
        tieniAcceso(false);
        return;
      }
      if (document.visibilityState !== 'visible') return;
      const aperti = [...document.querySelectorAll('.risultato > button[aria-expanded="true"]')].length;
      if (aperti) return; // non ridisegniamo mentre qualcuno guarda i parziali
      try {
        const freschi = await caricaCategoria(true);
        if (qui() && JSON.stringify(freschi) !== JSON.stringify(documenti)) {
          documenti = freschi;
          disegnaTutto(freschi, { aggiornamento: true });
        }
      } catch { /* riproviamo al prossimo giro */ }
    }, tribuna ? 30_000 : 60_000);
  }
  if (!pocoMovimento) document.querySelector('.risultati')?.classList.add('entra');
}
