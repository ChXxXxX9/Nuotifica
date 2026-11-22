// Sezione Gare: elenco delle gare e pagina di una gara (categorie, gare, batterie, classifica, parziali).
import {
  stato, api, esc, barraTop, tabBar, disegna, caricamento, paginaErrore, ICONE, conCache, giaInCache,
  percorso, parametriHash, memoria,
} from './nucleo.js';
import {
  tempo, differenza, nomeGara, periodo, mese, metri, velocita, oggi, stagioneDi,
} from './formato.js';
import { seguiAtleta, eSeguito } from './viste-atleti.js';
import { riempiPosizioni } from './posizioni.js';
import { tastoInfo } from './spiegazioni.js';
import {
  annateDi, riferimento, indiceAnnata, scriviIndice, riempiAnnata,
} from './annata.js';

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
export const delLazio = (g) => /lazio/i.test(g.regione ?? '') || (g.fonte === 'diretta' && !g.regione) || PROVINCE_LAZIO.test(g.luogo ?? '');

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
        <p class="sottotitolo">Lazio e grandi gare nazionali in diretta, con batterie, finali e parziali.</p>
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
/**
 * Classifica di una gara. Se ci sono finali: prima chi le ha nuotate (A, poi B…) nell'ordine d'arrivo,
 * poi gli altri con il tempo delle batterie. Ogni atleta compare una volta sola.
 */
function classificaEvento(evento) {
  const tutte = evento.b.flatMap((b) => b.r.map((r) => ({ r, b })));
  const chi = (r) => r.k || `${r.n}|${r.s ?? ''}`;
  const finali = tutte.filter((x) => x.b.fi).sort((x, y) => x.b.fi - y.b.fi || (x.r.t ?? 9e9) - (y.r.t ?? 9e9));
  const inFinale = new Set(finali.map((x) => chi(x.r)));
  const altre = tutte.filter((x) => !x.b.fi && !inFinale.has(chi(x.r)));
  // Più turni senza finali (es. serie e spareggi): vale il miglior tempo di ognuno.
  const migliore = new Map();
  for (const x of altre) {
    const prima = migliore.get(chi(x.r));
    if (!prima || (x.r.t && (!prima.r.t || x.r.t < prima.r.t))) migliore.set(chi(x.r), x);
  }
  const resto = [...migliore.values()];
  const conTempo = [...finali.filter((x) => x.r.t), ...resto.filter((x) => x.r.t).sort((a, b) => a.r.t - b.r.t)];
  const senza = [...finali, ...resto].filter((x) => !x.r.t);
  const posizioni = new Map();
  let pos = 0;
  let ultimo = null;
  conTempo.forEach((x, i) => {
    // A pari tempo stessa posizione (nelle finali conta l'ordine d'arrivo).
    if (x.b.fi || x.r.t !== ultimo) pos = i + 1;
    ultimo = x.r.t;
    posizioni.set(x.r, pos);
  });
  return { conTempo, senza, posizioni };
}

function posizioniClassifica(evento) {
  const { posizioni } = classificaEvento(evento);
  return (r) => posizioni.get(r) ?? null;
}

const nomeBatteria = (b, conTurni) => b.nb ?? `${conTurni ? `Turno ${Number(b.tu) || b.tu} · ` : ''}Batteria ${b.n}`;
const siglaBatteria = (b) => b.nc ?? (b.n ? `B${b.n}` : '');

/**
 * I parziali di un tempo, con i numeri veri. Le frazioni dopo la prima (che comprende la partenza) si
 * confrontano con il ritmo medio dell'atleta in quelle frazioni: `delta` = secondi persi (+) o guadagnati (−)
 * rispetto a nuotare quella frazione al ritmo medio (con frazioni di lunghezza diversa si conta per metro).
 * Migliore e peggiore: la frazione più veloce e la più lenta per metro, prima esclusa. Servono almeno due
 * frazioni confrontabili; altrimenti niente barre.
 */
export function analisiParziali(r, dist) {
  const vuoto = {
    passaggi: [], frazioni: [], delta: [], veloce: [], lenta: [],
  };
  if (!r?.t || !dist) return vuoto;
  // Parziali in ordine, crescenti e dentro la gara (scarta doppioni e valori impossibili).
  const sp = [...(r.sp ?? [])].filter((p) => p.m > 0 && p.m < dist && p.t > 0).sort((a, b) => a.m - b.m);
  const passaggi = [];
  for (const p of sp) {
    const prima = passaggi[passaggi.length - 1];
    if (prima && (p.m === prima.m || p.t <= prima.t)) continue;
    if (p.t >= r.t) continue;
    passaggi.push({ m: p.m, t: p.t, p: p.p });
  }
  passaggi.push({ m: dist, t: r.t });
  if (passaggi.length < 2) return vuoto;
  const frazioni = passaggi.map((p, i) => (i === 0 ? p.t : p.t - passaggi[i - 1].t));
  const lunghezze = passaggi.map((p, i) => (i === 0 ? p.m : p.m - passaggi[i - 1].m));
  const delta = frazioni.map(() => null);
  const confrontabili = frazioni.map((_, i) => i).filter((i) => i > 0);
  if (confrontabili.length < 2) {
    return {
      passaggi, frazioni, delta, veloce: [], lenta: [],
    };
  }
  const tempoTot = confrontabili.reduce((x, i) => x + frazioni[i], 0);
  const metriTot = confrontabili.reduce((x, i) => x + lunghezze[i], 0);
  const perMetro = tempoTot / metriTot;
  for (const i of confrontabili) delta[i] = Math.round(frazioni[i] - perMetro * lunghezze[i]);
  // A parità (al centesimo per 50 m) si segnano tutte.
  const ritmo = (i) => Math.round((frazioni[i] * 50) / lunghezze[i] / 10);
  const minimo = Math.min(...confrontabili.map(ritmo));
  const massimo = Math.max(...confrontabili.map(ritmo));
  const veloce = minimo === massimo ? [] : confrontabili.filter((i) => ritmo(i) === minimo);
  const lenta = minimo === massimo ? [] : confrontabili.filter((i) => ritmo(i) === massimo);
  return {
    passaggi, frazioni, delta, veloce, lenta,
  };
}

/** Scheda di un risultato: tempo, posizioni, punti e parziali disegnati. */
export function schedaRisultato({
  r, codice, batteria, nomeBatt, posTot, extra = '', nota = '', rif = '',
}) {
  const dist = metri(codice);
  const { passaggi, frazioni, delta, veloce, lenta } = analisiParziali(r, dist);
  const conParziali = passaggi.length > 1;
  const conBarre = delta.some((d) => d != null);
  const scala = Math.max(...delta.filter((d) => d != null).map(Math.abs), 1);
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
        <span><small>${d <= 0 ? 'In progressione' : 'Calo'}</small><b class="${d <= 0 ? 'buono' : 'calo'}">${esc(differenza(d) || '0"00')}</b></span>
      </div>`;
  }
  const cifre = [
    r.pt ? `<div><b>${r.pt}</b><small>punti</small></div>` : '',
    r.p ? `<div><b>${r.p}°</b><small>${/finale/i.test(nomeBatt ?? '') ? 'in finale' : /serie/i.test(nomeBatt ?? '') ? 'nella serie' : 'in batteria'}</small></div>` : '',
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
        <span class="dettaglio-dove">${esc([nomeBatt ?? (batteria ? `Batteria ${batteria}` : ''), r.c ? `corsia ${r.c}` : ''].filter(Boolean).join(' · '))}</span>
      </div>
      ${r.b === 'PB' && r.dp ? `<p class="dettaglio-pb">${esc(differenza(r.dp))} sul personale di prima</p>` : ''}
      ${nota}
      ${cifre.length ? `<div class="cifre-piccole" style="grid-template-columns:repeat(${cifre.length},minmax(0,1fr))">${cifre.join('')}</div>` : ''}
      ${conParziali ? `
        <div class="parziali-grafico ${conBarre ? '' : 'senza-barre'}" aria-label="Parziali">
          <div class="fraz fraz-testa"><span>Metri</span>${conBarre ? '<span class="fraz-testa-barra">rispetto al suo ritmo</span>' : ''}<span>Frazione</span><span>Passaggio</span></div>
          ${passaggi.map((p, i) => {
    const d = delta[i];
    const largo = d == null ? 0 : Math.max(Math.round((Math.abs(d) / scala) * 50), d === 0 ? 0 : 2);
    return `
            <div class="fraz ${lenta.includes(i) ? 'fraz-lenta' : ''} ${veloce.includes(i) ? 'fraz-veloce' : ''}">
              <span class="fraz-m">${p.m} m</span>
              ${conBarre ? `<span class="fraz-barra ${d == null ? 'fraz-barra-vuota' : ''}" aria-hidden="true">${d == null ? '' : `<i class="${d <= 0 ? 'piu-veloce' : 'piu-lenta'}" style="${d <= 0 ? 'right:50%' : 'left:50%'};width:${largo}%"></i>`}</span>` : ''}
              <span class="fraz-t">${esc(tempo(frazioni[i]))}${d != null ? `<small>${d === 0 ? '=' : esc(differenza(d))}</small>` : conBarre ? '<small>partenza</small>' : ''}</span>
              <span class="fraz-c">${esc(tempo(p.t))}${p.p ? ` <em>${p.p}°</em>` : ''}</span>
            </div>`;
  }).join('')}
          ${conBarre ? `<p class="fraz-legenda"><span class="voce-legenda"><span class="punto-legenda veloce-l"></span>più veloce del suo ritmo</span><span class="voce-legenda"><span class="punto-legenda lenta-l"></span>più lenta</span></p>
          ${veloce.length ? `<p class="fraz-nota">Migliore: <b class="buono">${veloce.map((i) => `${passaggi[i].m} m`).join(', ')}</b> · peggiore: <b class="calo">${lenta.map((i) => `${passaggi[i].m} m`).join(', ')}</b></p>` : ''}
          <p class="fraz-nota">Il ritmo è la media delle frazioni dopo la prima, che comprende la partenza e non si confronta.${passaggi.some((p) => p.p) ? ' ° = posizione al passaggio.' : ''}</p>`
    : `<p class="fraz-nota">Con due sole frazioni non c'è un ritmo da confrontare: la differenza tra le due metà è qui sotto.${passaggi.some((p) => p.p) ? ' ° = posizione al passaggio.' : ''}</p>`}
        </div>
        ${andatura}`
    : (r.t && dist > 50 ? '<p class="nota">Parziali non disponibili per questa gara.</p>' : '')}
      ${r.t ? '<div data-posizioni></div>' : ''}
      ${extra}
      ${rif ? `<a class="link-segnala" href="#/consigli?tipo=errore&rif=${encodeURIComponent(rif.slice(0, 200))}">Segnala un errore</a>` : ''}
      ${r.k ? `
        <div class="dettaglio-azioni">
          <a class="bottone bottone-secondario bottone-piccolo" href="#/atleta/${encodeURIComponent(r.k)}">Scheda atleta</a>
          <button class="bottone bottone-piccolo ${seguito ? 'bottone-secondario' : ''}" data-segui="${esc(r.k)}" data-nome="${esc(r.n)}">${seguito ? 'Seguito ✓' : 'Segui'}</button>
        </div>` : ''}
    </div>`;
}

function rigaRisultato(i, r, { posizione, sotto, indice } = {}) {
  const seguito = r.k && eSeguito(r.k);
  const etichette = [
    indice != null ? `<span class="punti punti-annata">${esc(scriviIndice(indice))} IA</span>` : '',
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

/** Righe e HTML per la vista "batterie", "classifica" o "annata". Le righe servono ad aprire le schede. */
function costruisciElenco(evento, vista, contesto = {}) {
  const righe = [];
  const posTot = posizioniClassifica(evento);
  const conTurni = new Set(evento.b.map((b) => b.tu)).size > 1;
  if (vista === 'annata') {
    // Piccola classifica interna: chi è andato meglio rispetto ai migliori d'Italia della sua annata.
    const { conTempo, posizioni } = classificaEvento(evento);
    const { annate, v, sx } = contesto;
    const conIndice = conTempo.map((x) => ({
      x,
      indice: indiceAnnata(x.r.t, riferimento({
        c: evento.c, v, sx, y: x.r.y,
      }, annate?.ora, annate?.prima)),
    }));
    const ordinati = [...conIndice.filter((z) => z.indice != null).sort((a, b) => b.indice - a.indice), ...conIndice.filter((z) => z.indice == null)];
    const pezzi = ordinati.map(({ x, indice }, n) => {
      righe.push({
        r: x.r, codice: evento.c, batteria: x.b.n, nomeBatt: nomeBatteria(x.b, conTurni), posTot: posizioni.get(x.r), d: x.b.d,
      });
      return rigaRisultato(righe.length - 1, x.r, { posizione: indice != null ? n + 1 : '–', sotto: indice != null ? `${posizioni.get(x.r)}° cl.` : '', indice });
    });
    return {
      righe,
      html: `<p class="nota" style="margin-top:10px">${tastoInfo('annata', 'Come funziona l\'Indice annata')}Indice annata (IA): il tempo rispetto alla media dei 10 migliori d'Italia nati nello stesso anno, in questa gara e vasca (100 = come loro, più alto = meglio). Sotto la posizione, quella in classifica.</p>
        <ol class="risultati" style="margin-top:8px">${pezzi.join('')}</ol>`,
    };
  }
  if (vista === 'batterie') {
    const html = evento.b.map((b) => `
      <h3 class="batteria-titolo ${b.fi ? 'titolo-finale' : ''}"><span>${esc(nomeBatteria(b, conTurni))}</span><span>${esc([b.sede, b.d ? periodo(b.d) : ''].filter(Boolean).join(' · '))}</span></h3>
      <ol class="risultati">${b.r.map((r) => {
    righe.push({
      r, codice: evento.c, batteria: b.n, nomeBatt: nomeBatteria(b, conTurni), posTot: posTot(r), d: b.d,
    });
    return rigaRisultato(righe.length - 1, r);
  }).join('')}</ol>`).join('');
    return { righe, html };
  }
  const { conTempo, senza, posizioni } = classificaEvento(evento);
  const pezzi = conTempo.map((x) => {
    const pos = posizioni.get(x.r);
    righe.push({
      r: x.r, codice: evento.c, batteria: x.b.n, nomeBatt: nomeBatteria(x.b, conTurni), posTot: pos, d: x.b.d,
    });
    return rigaRisultato(righe.length - 1, x.r, { posizione: pos, sotto: siglaBatteria(x.b) });
  });
  for (const x of senza) {
    righe.push({ r: x.r, codice: evento.c, batteria: x.b.n, nomeBatt: nomeBatteria(x.b, conTurni), posTot: null });
    pezzi.push(rigaRisultato(righe.length - 1, x.r, { posizione: '–', sotto: siglaBatteria(x.b) }));
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

  const pagina = ({
    cat, eventi, evento, vista, caricando, annate,
  }) => {
    const soloClassifica = gara.fonte === 'italia';
    const atleti = evento ? evento.b.reduce((t, b) => t + b.r.length, 0) : 0;
    let elenco = { righe: [], html: '' };
    if (evento) {
      elenco = costruisciElenco(evento, vista, {
        annate, v: gara.vasca, sx: cat.sx,
      });
    }
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
          ${soloClassifica ? '<p class="nota" style="margin-top:8px">Risultati a gara finita: classifica completa, senza batterie e parziali.</p>' : ''}
          <div class="segmenti" role="tablist" aria-label="Vista">
            ${soloClassifica ? '' : `<button class="segmento" role="tab" data-v="batterie" aria-selected="${vista === 'batterie'}">Batterie</button>`}
            <button class="segmento" role="tab" data-v="classifica" aria-selected="${vista === 'classifica'}">Classifica</button>
            ${gara.vasca && ['M', 'F'].includes(cat.sx) ? `<button class="segmento" role="tab" data-v="annata" aria-selected="${vista === 'annata'}">Annata</button>` : ''}
          </div>
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
      const rx = righe[i];
      b.insertAdjacentHTML('afterend', schedaRisultato({
        ...rx,
        rif: [decodeURIComponent(location.hash.replace(/^#\//, '').split('?')[0]), rx.codice ? nomeGara(rx.codice, { breve: true }) : '', rx.nomeBatt,
          rx.r?.n, rx.r?.t ? tempo(rx.r.t) : rx.r?.x].filter(Boolean).join(' · '),
      }));
      const scheda = b.nextElementSibling;
      scheda.querySelector('[data-segui]')?.addEventListener('click', (e) => seguiAtleta(e.currentTarget.dataset.segui, e.currentTarget.dataset.nome, e.currentTarget));
      // Dove si piazza questo tempo nelle graduatorie della stagione (Lazio e Italia).
      const { cat } = scelta();
      const riga = righe[i];
      riempiPosizioni(scheda, {
        t: riga.r.t, c: riga.codice, v: gara.vasca, sx: cat.sx, st: stagioneDi(riga.d ?? gara.dal), y: riga.r.y, k: riga.r.k,
      });
      riempiAnnata(scheda, {
        t: riga.r.t, c: riga.codice, v: gara.vasca, sx: cat.sx, st: stagioneDi(riga.d ?? gara.dal), y: riga.r.y,
      });
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
    const vista = v === 'annata' && gara.vasca && ['M', 'F'].includes(cat.sx) ? 'annata'
      : gara.fonte === 'italia' || v === 'classifica' ? 'classifica' : 'batterie';
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
    let annate = null;
    if (vista === 'annata' && evento) {
      const st = stagioneDi(evento.b.find((b) => b.d)?.d ?? gara.dal);
      if (!giaInCache(`annate:${st}`)) disegna(pagina({ cat, caricando: true }), collega, { aggiornamento: true, classeBody: tribuna ? 'tribuna' : '' });
      annate = await annateDi(st);
      if (!qui() || scelta().cat.id !== cat.id) return;
    }
    disegna(pagina({
      cat, eventi, evento, vista, annate,
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

