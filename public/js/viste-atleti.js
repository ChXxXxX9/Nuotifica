// Sezione Atleti: ricerca, scheda atleta (personali, grafico, storico) e "Segui".
import {
  stato, api, esc, barraTop, tabBar, disegna, caricamento, paginaErrore, ICONE, conCache, giaInCache,
  percorso, memoria, avviso, conAttesa,
} from './nucleo.js';
import {
  tempo, nomeGara, ordineGara, giorno, iniziali, differenza,
} from './formato.js';

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

export async function leggiAtleta(k, { fresco = false } = {}) {
  if (fresco) stato.cache.delete(`atleta:${k}`);
  const pulisci = (a) => (a ? { ...a, k, r: risultatiPuliti(a.r) } : null);
  return conCache(`atleta:${k}`, async (fresco) => pulisci(await api.leggiAtleta(k, (nuovo) => fresco(pulisci(nuovo)))), { durata: 60_000 });
}

/** Dati brevi degli atleti seguiti, per "Per te". */
export async function leggiSeguiti(chiavi) {
  const schede = await Promise.all(chiavi.map((k) => leggiAtleta(k).catch(() => null)));
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

/** Atleti: si legge un solo pezzo piccolo dell'indice (quello della parola più lunga scritta). */
async function cerca(testo) {
  const parole = testoCerca(testo).split(/\s+/).filter((p) => p.length >= 2);
  if (!parole.length) return [];
  const guida = [...parole].sort((x, y) => y.length - x.length)[0];
  const voci = await leggiPezzo(prefisso(guida));
  const trovati = voci.filter((v) => parole.every((p) => v.cerca.includes(p)));
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
      const [n, attivi, totale, ultima] = riga.split('|');
      return { id, n, attivi: Number(attivi), totale: Number(totale), ultima };
    })
    .filter((x) => parole.every((p) => testoCerca(x.n).includes(p)))
    .sort((a, b) => b.attivi - a.attivi)
    .slice(0, 8);
}

const voceSquadra = (x) => `<li><a href="#/squadra/${encodeURIComponent(x.id)}"><b>${esc(x.n)}</b><small>Squadra · ${x.attivi} ${x.attivi === 1 ? 'atleta' : 'atleti'} nell'ultima stagione</small></a></li>`;

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
      <p class="nota" style="margin-top:18px">Ci sono gli atleti del Lazio dal 2018/19 e quelli delle gare che leggiamo: l'elenco cresce gara dopo gara.</p>
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
              <li><a href="#/atleta/${encodeURIComponent(v.k)}"><b>${esc(v.n)}</b><small>${esc([v.y, v.s].filter(Boolean).join(' · '))}</small></a></li>`).join('')}</ul>`
          : '<div class="vuoto"><strong>Nessuno trovato</strong>Prova con il cognome (o il nome della squadra).</div>';
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
  if (!a) {
    disegna(`${barraTop({ indietro: true })}<main class="pagina"><h1 class="titolo-pagina">Atleta non trovato</h1><p class="intro">Torna alla <a href="#/atleti">ricerca</a>.</p></main>${tabBar('atleti')}`);
    return;
  }

  const risultati = a.r ?? [];
  const best = personali(risultati);
  const vasche = [...new Set([...best.values()].map((v) => v.v))].sort();
  let mostraTutte = false;
  const disegnaScheda = ({ vasca, gara, aggiornamento = false } = {}) => {
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
          <p class="info">${esc([a.y, a.sx === 'F' ? 'Femmine' : a.sx === 'M' ? 'Maschi' : ''].filter(Boolean).join(' · '))}${a.s ? ` · <a href="#/squadre?q=${encodeURIComponent(a.s)}">${esc(a.s)}</a>` : ''}</p>
          <button class="bottone ${seguito ? 'bottone-secondario' : ''}" data-segui aria-pressed="${seguito}">${seguito ? 'Seguito ✓' : 'Segui'}</button>
          <div class="cifre">
            <div class="cifra"><b>${gare}</b><small>Gare</small></div>
            <div class="cifra"><b>${risultati.filter((x) => x.t).length}</b><small>Tempi</small></div>
            <div class="cifra"><b>${maxPunti || '–'}</b><small>Punti max</small></div>
          </div>
        </section>

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
              </div>` : ''}
          </section>` : ''}

        <section class="sezione">
          <div class="sezione-testa"><h2 class="sezione-titolo">Tutte le gare</h2></div>
          ${risultati.length ? `
            <ul class="storico">
              ${risultati.slice(0, mostraTutte ? Infinity : 60).map((x) => `
                <li>
                  <${x.ci ? 'a' : 'div'} class="voce-storico" ${x.ci ? `href="#/gara/${encodeURIComponent(x.g)}?c=${encodeURIComponent(x.ci ?? '')}&e=${encodeURIComponent(x.c)}"` : ''}>
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
                  </${x.ci ? 'a' : 'div'}>
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
      el.querySelector('[data-tutte]')?.addEventListener('click', () => {
        mostraTutte = true;
        disegnaScheda({ vasca: v, gara: g, aggiornamento: true });
      });
    }, { aggiornamento });
  };
  disegnaScheda();
}
