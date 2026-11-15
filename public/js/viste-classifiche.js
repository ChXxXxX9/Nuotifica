// Classifiche: graduatorie del Lazio stile Spotify (▲▼, NUOVO, picco), Indice Cloro, tempi limite
// e "Quanto vale questo tempo?".
import {
  stato, api, esc, barraTop, tabBar, disegna, caricamento, paginaErrore, conCache, percorso, memoria, avviso, conAttesa,
} from './nucleo.js';
import {
  tempo, nomeGara, giorno, quando, stagioneCorrente, nomeStagione, stagioneDi, differenza,
  codici, nomeCodice,
} from './formato.js';
import { punti } from './punti.js';
import { leggiAtleta } from './viste-atleti.js';

export const GARE = ['50SL', '100SL', '200SL', '400SL', '800SL', '1500SL', '50DO', '100DO', '200DO', '50RA', '100RA', '200RA',
  '50FA', '100FA', '200FA', '100MI', '200MI', '400MI'];
const PRIMA_STAGIONE = 1967; // le graduatorie federali partono dal 1967/68
const PRIMA_NOTTE = 2018; // le classifiche del Lazio preparate di notte partono dal 2018/19

/** Menu delle categorie, diviso per categoria: Ragazzi (tutti), R14, R1, R2; Juniores, J1, J2… */
export function menuCategorie(sx, scelta) {
  const gruppi = sx === 'F'
    ? [['Esordienti', ['EB', 'EA']], ['Ragazze', ['R', 'R1', 'R2']], ['Juniores', ['J', 'J1', 'J2']], ['Cadette e Seniores', ['C', 'S']]]
    : [['Esordienti', ['EB', 'EA']], ['Ragazzi', ['R', 'R14', 'R1', 'R2']], ['Juniores', ['J', 'J1', 'J2']], ['Cadetti e Seniores', ['C', 'S']]];
  const nome = (c) => (['R', 'J'].includes(c) ? `${nomeCodice(c, sx)} (tutti gli anni)` : nomeCodice(c, sx));
  return `<option value="tutte" ${scelta === 'tutte' ? 'selected' : ''}>Assoluti</option>${gruppi.map(([g, cs]) => `
    <optgroup label="${esc(g)}">${cs.map((c) => `<option value="${c}" ${scelta === c ? 'selected' : ''}>${esc(nome(c))}</option>`).join('')}</optgroup>`).join('')}`;
}
export const REGIONI = {
  1: 'Piemonte', 3: 'Lombardia', 5: 'Veneto', 6: 'Friuli Venezia Giulia', 7: 'Liguria', 8: 'Emilia Romagna', 9: 'Toscana',
  10: 'Umbria', 11: 'Marche', 12: 'Lazio', 13: 'Abruzzo', 14: 'Molise', 15: 'Campania', 16: 'Puglia', 17: 'Basilicata',
  18: 'Calabria', 19: 'Sicilia', 20: 'Sardegna', 21: 'Bolzano', 22: 'Trento',
};
const LAZIO = '12';
const ORE_VALIDITA = 24;
const nomeRegione = (reg) => (reg === 'it' ? 'Italia' : REGIONI[reg] ?? reg);

const nascosto = (k) => (stato.nascosti ?? []).includes(k);

/** Sotto-menu della sezione Classifiche. */
export function menuClassifiche(attiva) {
  const voci = [['classifiche', 'Graduatorie'], ['squadre', 'Squadre'], ['limiti', 'Tempi limite'], ['quanto-vale', 'Quanto vale?']];
  return `<nav class="filtri menu-sezione" aria-label="Classifiche">${voci.map(([id, nome]) => `<a class="chip" href="#/${id}" ${id === attiva ? 'aria-current="true"' : ''}>${nome}</a>`).join('')}</nav>`;
}

/* ---------- lettura ---------- */

export function leggiClassifica(id) {
  return conCache(`classifica:${id}`, (fresco) => api.leggiClassifica(id, fresco), { durata: 600_000 });
}

/** Righe di una classifica: { k, n, y, s, valore, d }. */
export function righeClassifica(doc) {
  return (doc?.righe ?? []).map((riga) => {
    const [k, n, y, s, valore, d] = riga.split('|');
    return {
      k, n, y: Number(y) || null, s, valore: Number(valore), d,
    };
  }).filter((r) => !nascosto(r.k));
}

/** Posizioni (a pari merito stessa posizione) e movimenti rispetto alla settimana scorsa. */
export function conPosizioni(righe, doc, { indice = false, cat = 'tutte', sx, st } = {}) {
  // "Di sempre": la categoria è quella che l'atleta aveva quando ha nuotato quel tempo.
  const filtrate = cat === 'tutte' ? righe
    : righe.filter((r) => codici(r.y, sx, st === 'tutte' ? stagioneDi(r.d ?? '') : st).includes(cat));
  let pos = 0;
  let ultimo = null;
  const base = doc?.b ?? null;
  const conBase = base && Object.keys(base).length > 0;
  // Posizioni della settimana scorsa dentro lo stesso gruppo (categoria).
  let basePos = base;
  if (conBase && cat !== 'tutte') {
    basePos = Object.fromEntries(filtrate.filter((r) => base[r.k]).sort((a, b) => base[a.k] - base[b.k]).map((r, i) => [r.k, i + 1]));
  }
  return filtrate.map((r, i) => {
    if (r.valore !== ultimo) pos = i + 1;
    ultimo = r.valore;
    const prima = conBase ? basePos[r.k] : undefined;
    return {
      ...r,
      pos,
      mov: !conBase ? null : prima === undefined ? 'nuovo' : prima - pos,
      picco: cat === 'tutte' ? doc?.p?.[r.k] ?? null : null,
      indice,
    };
  });
}

const badgeMovimento = (mov) => {
  if (mov === null || mov === undefined) return '<span class="mov"></span>';
  if (mov === 'nuovo') return '<span class="mov mov-nuovo">NUOVO</span>';
  if (mov > 0) return `<span class="mov mov-su" aria-label="Salito di ${mov}">▲${mov}</span>`;
  if (mov < 0) return `<span class="mov mov-giu" aria-label="Sceso di ${-mov}">▼${-mov}</span>`;
  return '<span class="mov mov-fermo" aria-label="Stessa posizione">=</span>';
};

/* ---------- graduatorie ---------- */

export async function vistaClassifiche() {
  const qui = () => percorso() === 'classifiche';
  const corrente = stagioneCorrente();
  const scelta = {
    st: corrente, v: 25, sx: 'M', c: '100SL', cat: 'tutte', reg: LAZIO, tutti: false, ...(memoria('classifica-scelta') ?? {}), ...(stato.sceltaClassifica ?? {}),
  };
  if (scelta.c === 'indice' && scelta.reg !== LAZIO) scelta.c = '100SL';
  if (scelta.st !== 'tutte' && Number(scelta.st) > Number(corrente)) scelta.st = corrente;
  if (scelta.sx === 'F' && scelta.cat === 'R14') scelta.cat = 'R';
  const stagioni = [];
  for (let s = Number(corrente); s >= PRIMA_STAGIONE; s--) stagioni.push(String(s));
  // Lazio: per le stagioni non ancora preparate di notte (e per "di sempre") si usa quella su richiesta.
  let lazioSuRichiesta = false;

  // Lazio: classifiche complete (dalle graduatorie di notte). Italia e altre regioni: preparate su richiesta.
  const richiesta = () => ({
    st: scelta.st, v: scelta.v, c: scelta.c, sx: scelta.sx, reg: scelta.reg, cat: scelta.reg === 'it' ? scelta.cat : 'tutte',
  });
  const notturna = () => scelta.reg === LAZIO && scelta.st !== 'tutte' && Number(scelta.st) >= PRIMA_NOTTE && !lazioSuRichiesta;
  const idDoc = () => {
    if (scelta.c === 'indice') return `${scelta.st}-indice-${scelta.sx}`;
    if (notturna()) return `${scelta.st}-${scelta.v}-${scelta.c}-${scelta.sx}`;
    const r = richiesta();
    return `${r.st}-${r.v}-${r.c}-${r.sx}-${r.reg}-${r.cat}`;
  };
  let doc;
  let caricando = true;
  let errore = null;
  let inPreparazione = false;
  let attesa = null;

  const ridisegna = (aggiornamento = false) => {
    const indice = scelta.c === 'indice';
    const lazio = scelta.reg === LAZIO;
    const righe = doc ? conPosizioni(righeClassifica(doc), doc, {
      indice, cat: scelta.reg === 'it' ? 'tutte' : scelta.cat, sx: scelta.sx, st: scelta.st,
    }) : [];
    const dove = nomeRegione(scelta.reg);
    const risalita = righe.filter((r) => typeof r.mov === 'number' && r.mov > 0).sort((a, b) => b.mov - a.mov).slice(0, 6);
    const seguiti = new Set(stato.profilo?.seguiti ?? []);
    const mostrate = scelta.tutti ? righe : righe.slice(0, 100);
    disegna(`
      ${barraTop()}
      <main class="pagina">
        <h1 class="titolo-pagina">Classifiche</h1>
        ${menuClassifiche('classifiche')}
        <div class="scelte-classifica">
          <label class="campo-mini">Dove
            <select data-reg>
              <option value="${LAZIO}" ${scelta.reg === LAZIO ? 'selected' : ''}>Lazio</option>
              <option value="it" ${scelta.reg === 'it' ? 'selected' : ''}>Italia</option>
              <optgroup label="Altre regioni">${Object.entries(REGIONI).filter(([id]) => id !== LAZIO).sort((a, b) => a[1].localeCompare(b[1], 'it'))
    .map(([id, nome]) => `<option value="${id}" ${scelta.reg === id ? 'selected' : ''}>${esc(nome)}</option>`).join('')}</optgroup>
            </select>
          </label>
          <label class="campo-mini">Stagione
            <select data-st>
              <option value="tutte" ${scelta.st === 'tutte' ? 'selected' : ''}>Di sempre</option>
              ${stagioni.map((s) => `<option value="${s}" ${s === scelta.st ? 'selected' : ''}>${nomeStagione(s)}</option>`).join('')}
            </select>
          </label>
          <label class="campo-mini">Categoria
            <select data-categoria>${menuCategorie(scelta.sx, scelta.cat)}</select>
          </label>
          ${indice ? '' : `<div class="segmenti" role="tablist" aria-label="Vasca">
            ${[25, 50].map((v) => `<button class="segmento" role="tab" data-v="${v}" aria-selected="${scelta.v === v}">${v} m</button>`).join('')}
          </div>`}
          <div class="segmenti" role="tablist" aria-label="Sesso">
            <button class="segmento" role="tab" data-sx="M" aria-selected="${scelta.sx === 'M'}">Maschi</button>
            <button class="segmento" role="tab" data-sx="F" aria-selected="${scelta.sx === 'F'}">Femmine</button>
          </div>
        </div>
        <div class="filtri" role="toolbar" aria-label="Gara">
          ${lazio && scelta.st !== 'tutte' ? `<button class="chip chip-indice" data-c="indice" aria-pressed="${indice}">Indice Cloro</button>` : ''}
          ${GARE.map((c) => `<button class="chip" data-c="${c}" aria-pressed="${scelta.c === c}">${esc(nomeGara(c, { breve: true }))}</button>`).join('')}
        </div>

        <p class="nota" style="margin:2px 0 10px">${esc(indice ? 'Indice Cloro: media pesata dei punti delle 3 gare migliori della stagione (atleti del Lazio).' : `Migliori tempi ${scelta.st === 'tutte' ? 'di sempre (tutte le stagioni)' : `della stagione ${nomeStagione(scelta.st)}`}${scelta.cat !== 'tutte' ? ` · ${nomeCodice(scelta.cat, scelta.sx)}` : ''}${scelta.reg === 'it' ? ' in Italia' : ` degli atleti ${scelta.reg === LAZIO ? 'del Lazio' : `della regione ${dove}`}`}, vasca da ${scelta.v} m${doc?.parziale ? ` (i primi ${righeClassifica(doc).length})` : ''}.`)}${doc?.agg ? ` Aggiornata ${esc(quando(doc.agg?.toDate ? doc.agg.toDate() : new Date(doc.agg)))}.` : ''}</p>
        ${inPreparazione ? `<p class="avviso-preparazione">${doc ? 'Aggiornamento in corso: tra qualche minuto vedi i tempi nuovi.' : `Sto preparando la classifica ${scelta.reg === 'it' ? 'nazionale' : `della regione ${esc(dove)}`}: è pronta in pochi minuti, puoi restare qui.`}</p>` : ''}

        ${caricando ? '<p class="caricamento">Carico la classifica…</p>' : errore ? `<p class="errore">${esc(errore)}</p>` : !righe.length ? (inPreparazione && !doc ? '<p class="caricamento">In preparazione…</p>' : `
          <div class="vuoto"><strong>${doc ? 'Nessuno qui' : 'Classifica in arrivo'}</strong>${doc ? 'Prova un\'altra categoria o un\'altra gara.' : 'Le graduatorie del Lazio si caricano di notte, una stagione dopo l\'altra: torna domani.'}</div>`) : `
          ${risalita.length ? `
            <section class="risalita" aria-label="In risalita">
              <h2 class="sezione-titolo">In risalita</h2>
              <div class="risalita-elenco">${risalita.map((r) => `
                <a href="#/atleta/${encodeURIComponent(r.k)}" class="risalita-voce"><b>▲${r.mov}</b><span>${esc(r.n.split(' ')[0])} ${esc(r.n.split(' ').slice(1).join(' ').slice(0, 1))}.</span><small>${r.pos}°</small></a>`).join('')}
              </div>
            </section>` : ''}
          <ol class="classifica">${mostrate.map((r) => `
            <li class="${seguiti.has(r.k) ? 'seguito' : ''}">
              <a href="#/atleta/${encodeURIComponent(r.k)}">
                <span class="pos"><b>${r.pos}</b>${badgeMovimento(r.mov)}</span>
                <span class="chi"><b>${esc(r.n)}</b><small>${esc([r.y, r.s].filter(Boolean).join(' · '))}${r.picco && r.picco < r.pos ? ` · picco ${r.picco}°` : ''}</small></span>
                <span class="quanto">${indice ? `<b>${r.valore}</b><small>${esc((r.d ?? '').split(',').filter(Boolean).map((c) => nomeGara(c, { breve: true })).join(' · '))}</small>`
    : `<b>${esc(tempo(r.valore))}</b><small>${esc([punti(r.valore, scelta.c, scelta.sx, scelta.v, r.d) ? `${punti(r.valore, scelta.c, scelta.sx, scelta.v, r.d)} pt` : '', r.d ? giorno(r.d) : ''].filter(Boolean).join(' · '))}</small>`}</span>
              </a>
            </li>`).join('')}</ol>
          ${!scelta.tutti && righe.length > 100 ? `<button class="bottone bottone-secondario" data-tutti style="margin-top:12px">Mostra tutti (${righe.length})</button>` : ''}`}
      </main>
      ${tabBar('classifiche')}`, (el) => {
      const cambia = (modifica) => {
        Object.assign(scelta, modifica, { tutti: false });
        stato.sceltaClassifica = { ...scelta };
        memoria('classifica-scelta', {
          v: scelta.v, sx: scelta.sx, c: scelta.c, cat: scelta.cat, reg: scelta.reg,
        });
        carica();
      };
      el.querySelector('[data-st]').addEventListener('change', (e) => cambia({
        st: e.target.value, ...(e.target.value === 'tutte' && scelta.c === 'indice' ? { c: '100SL' } : {}),
      }));
      el.querySelector('[data-reg]').addEventListener('change', (e) => cambia({
        reg: e.target.value, ...(e.target.value !== LAZIO && scelta.c === 'indice' ? { c: '100SL' } : {}),
      }));
      el.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => cambia({ v: Number(b.dataset.v) })));
      el.querySelectorAll('[data-sx]').forEach((b) => b.addEventListener('click', () => cambia({
        sx: b.dataset.sx, ...(b.dataset.sx === 'F' && scelta.cat === 'R14' ? { cat: 'R' } : {}),
      })));
      el.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => cambia({ c: b.dataset.c })));
      el.querySelector('[data-categoria]').addEventListener('change', (e) => {
        const cat = e.target.value;
        // Per l'Italia ogni categoria è una classifica a sé (i primi 3000 di tutti non bastano per i più piccoli).
        if (scelta.reg === 'it') {
          cambia({ cat });
          return;
        }
        scelta.cat = cat;
        memoria('classifica-scelta', {
          v: scelta.v, sx: scelta.sx, c: scelta.c, cat: scelta.cat, reg: scelta.reg,
        });
        ridisegna(true);
      });
      el.querySelector('[data-tutti]')?.addEventListener('click', () => {
        scelta.tutti = true;
        ridisegna(true);
      });
      el.querySelector('[aria-pressed="true"][data-c]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    }, { aggiornamento });
  };

  const dataDi = (d) => (d?.agg?.toDate ? d.agg.toDate() : d?.agg ? new Date(d.agg) : null);
  async function carica() {
    caricando = true;
    errore = null;
    inPreparazione = false;
    lazioSuRichiesta = false;
    clearTimeout(attesa);
    let id = idDoc();
    ridisegna(true);
    try {
      let letto = await leggiClassifica(id);
      if (!qui() || id !== idDoc()) return;
      // Stagione del Lazio non ancora preparata di notte: si prende quella su richiesta.
      if (!letto && notturna() && scelta.c !== 'indice') {
        lazioSuRichiesta = true;
        id = idDoc();
        letto = await leggiClassifica(id);
        if (!qui() || id !== idDoc()) return;
      }
      doc = letto;
    } catch (err) {
      if (!qui()) return;
      errore = err.message;
      doc = null;
    }
    caricando = false;
    // Italia e altre regioni: se manca (o è di ieri, per la stagione in corso) la si chiede al controllore.
    const vecchia = doc && (scelta.st === corrente || scelta.st === 'tutte') && Date.now() - (dataDi(doc)?.getTime() ?? 0) > ORE_VALIDITA * 3_600_000;
    if (!errore && !notturna() && scelta.c !== 'indice' && (!doc || vecchia)) {
      inPreparazione = true;
      api.chiediClassifica(richiesta()).catch(() => {});
      aspetta(id, dataDi(doc)?.getTime() ?? 0, Date.now());
    }
    ridisegna(true);
  }
  /** Controlla ogni 20 secondi se la classifica chiesta è pronta (per 8 minuti al massimo). */
  function aspetta(id, primaDel, inizio) {
    attesa = setTimeout(async () => {
      if (!qui() || id !== idDoc()) return;
      try {
        const nuovo = await api.leggiClassificaRete(id);
        if (nuovo && (dataDi(nuovo)?.getTime() ?? 0) > primaDel) {
          doc = nuovo;
          inPreparazione = false;
          stato.cache.set(`classifica:${id}`, { valore: nuovo, quando: Date.now() });
          ridisegna(true);
          return;
        }
      } catch { /* riproviamo */ }
      if (Date.now() - inizio < 8 * 60_000) aspetta(id, primaDel, inizio);
    }, 20_000);
  }
  ridisegna();
  carica();
}

/* ---------- tempi limite ---------- */

export async function leggiLimiti() {
  return conCache('limiti', () => api.leggiLimitiPubblicati(), { durata: 300_000 });
}

/** I limiti che l'utente segue (se non ha scelto, tutti). */
export function limitiSeguiti(limiti) {
  const scelti = stato.profilo?.limiti;
  return Array.isArray(scelti) ? limiti.filter((l) => scelti.includes(l.id)) : limiti;
}

/**
 * Il limite di un atleta in un set: prima per il suo anno (R14, J1…), poi per la categoria (R, J…),
 * altrimenti quello valido per tutti ("*"). `cat` è un codice o l'elenco dei codici dell'atleta.
 */
export function limitePer(l, codice, sx, cat) {
  const elenco = [...(Array.isArray(cat) ? [...cat].reverse() : [cat]), '*'];
  return elenco.map((c) => l.t?.[`${codice}|${sx}|${c}`]).find(Boolean) ?? null;
}

const ORDINE_CODICI = ['EB', 'EA', 'R', 'R14', 'R1', 'R2', 'J', 'J1', 'J2', 'C', 'S', '*'];
/** Nome della categoria più precisa di un atleta (es. "Ragazzi R14"). */
export const nomeCategoriaAtleta = (cod, sx) => (cod?.length ? nomeCodice(cod[cod.length - 1], sx) : '');

/** Miglior tempo di un atleta in una stagione, gara e vasca. */
export function migliore(risultati, codice, vasca, st) {
  return risultati.filter((v) => v.t && v.c === codice && Number(v.v) === Number(vasca) && stagioneDi(v.d) === String(st))
    .sort((a, b) => a.t - b.t)[0] ?? null;
}

/** Stato di un atleta rispetto a un limite: preso, quasi (mezzo secondo), manca. */
export function rispettoAlLimite(t, limite) {
  if (!t || !limite) return null;
  if (t <= limite) return { tipo: 'preso', diff: limite - t };
  return { tipo: t - limite <= 500 ? 'quasi' : 'manca', diff: t - limite };
}

export async function vistaLimiti() {
  const qui = () => percorso() === 'limiti';
  caricamento('Carico i tempi limite…', { tab: 'classifiche' });
  let limiti;
  try {
    limiti = await leggiLimiti();
  } catch (err) {
    if (qui()) paginaErrore(err, { tab: 'classifiche' });
    return;
  }
  if (!qui()) return;
  limiti = [...limiti].sort((a, b) => String(b.st).localeCompare(String(a.st)) || a.nome.localeCompare(b.nome, 'it'));
  const ridisegna = (aggiornamento = false) => {
    const seguiti = new Set(limitiSeguiti(limiti).map((l) => l.id));
    disegna(`
      ${barraTop()}
      <main class="pagina">
        <h1 class="titolo-pagina">Classifiche</h1>
        ${menuClassifiche('limiti')}
        <p class="intro">Scegli quali tempi limite seguire: nella scheda dei tuoi atleti vedi quanto manca, e quando ne prendono uno ti arriva la notifica.</p>
        ${limiti.length ? `<ul class="elenco elenco-limiti">${limiti.map((l) => `
          <li class="scheda limite-voce">
            <a href="#/limiti/${encodeURIComponent(l.id)}">
              <b>${esc(l.nome)}</b>
              <small>${esc(`Vasca ${l.vasca} m · stagione ${nomeStagione(l.st)} · ${Object.keys(l.t ?? {}).length} tempi`)}</small>
            </a>
            <label class="interruttore"><input type="checkbox" data-segui-limite="${esc(l.id)}" ${seguiti.has(l.id) ? 'checked' : ''}><span>Seguo</span></label>
          </li>`).join('')}</ul>` : '<div class="vuoto"><strong>Ancora nessun tempo limite</strong>Appena vengono pubblicati li trovi qui, con una notifica.</div>'}
      </main>
      ${tabBar('classifiche')}`, (el) => {
      el.querySelectorAll('[data-segui-limite]').forEach((x) => x.addEventListener('change', async () => {
        const attuali = new Set(limitiSeguiti(limiti).map((l) => l.id));
        if (x.checked) attuali.add(x.dataset.seguiLimite);
        else attuali.delete(x.dataset.seguiLimite);
        const elenco = [...attuali].slice(0, 10);
        try {
          await api.salvaLimitiSeguiti(stato.utente.uid, elenco);
          stato.profilo = { ...stato.profilo, limiti: elenco };
        } catch (err) {
          avviso(err.message, 'errore');
          x.checked = !x.checked;
        }
      }));
    }, { aggiornamento });
  };
  ridisegna();
}

export async function vistaLimite(id) {
  const qui = () => percorso() === `limiti/${id}`;
  caricamento('Apro i tempi limite…', { tab: 'classifiche' });
  let limiti;
  try {
    limiti = await leggiLimiti();
  } catch (err) {
    if (qui()) paginaErrore(err, { tab: 'classifiche' });
    return;
  }
  const l = limiti.find((x) => x.id === id);
  if (!qui()) return;
  if (!l) {
    disegna(`${barraTop({ indietro: true })}<main class="pagina"><h1 class="titolo-pagina">Tempi limite non trovati</h1><p class="intro">Torna all'<a href="#/limiti">elenco</a>.</p></main>${tabBar('classifiche')}`);
    return;
  }
  // Colonne: le categorie (e "tutti") presenti nel set, per sesso.
  const chiavi = Object.keys(l.t ?? {}).map((k) => k.split('|'));
  const categorieDi = (sx) => [...new Set(chiavi.filter((c) => c[1] === sx).map((c) => c[2]))]
    .sort((a, b) => ORDINE_CODICI.indexOf(a) - ORDINE_CODICI.indexOf(b));
  const gare = [...new Set(chiavi.map((c) => c[0]))].sort((a, b) => GARE.indexOf(a) - GARE.indexOf(b));
  let sx = categorieDi('M').length ? 'M' : 'F';

  // I tuoi atleti: quanto manca a ciascuno.
  const seguiti = stato.profilo?.seguiti ?? [];
  let schede = [];
  const ridisegna = (aggiornamento = false) => {
    const cats = categorieDi(sx);
    const righeAtleti = schede.filter((a) => a && a.sx === sx).map((a) => {
      const cat = codici(a.y, a.sx, l.st);
      const voci = gare.map((c) => {
        const lim = limitePer(l, c, a.sx, cat);
        const sb = lim ? migliore(a.r ?? [], c, l.vasca, l.st) : null;
        return lim && sb ? { c, lim, sb, esito: rispettoAlLimite(sb.t, lim) } : null;
      }).filter(Boolean);
      return { a, cat, voci };
    }).filter((x) => x.voci.length);
    disegna(`
      ${barraTop({ indietro: true })}
      <main class="pagina">
        <h1 class="titolo-pagina" style="font-size:24px">${esc(l.nome)}</h1>
        <p class="intro">${esc(`Vasca ${l.vasca} m · stagione ${nomeStagione(l.st)}`)}</p>
        <div class="segmenti" role="tablist" aria-label="Sesso">
          ${['M', 'F'].filter((x) => categorieDi(x).length).map((x) => `<button class="segmento" role="tab" data-sx="${x}" aria-selected="${sx === x}">${x === 'M' ? 'Maschi' : 'Femmine'}</button>`).join('')}
        </div>
        ${righeAtleti.length ? `
          <section class="sezione">
            <div class="sezione-testa"><h2 class="sezione-titolo">I tuoi atleti</h2></div>
            <ul class="elenco">${righeAtleti.map(({ a, cat, voci }) => `
              <li class="scheda limite-atleta">
                <a href="#/atleta/${encodeURIComponent(a.k)}"><b>${esc(a.n)}</b><small>${esc([a.y, nomeCategoriaAtleta(cat, a.sx)].filter(Boolean).join(' · '))}</small></a>
                <ul class="limiti-atleta">${voci.map((v) => `
                  <li class="esito-${v.esito.tipo}"><span>${esc(nomeGara(v.c, { breve: true }))}</span><b>${esc(tempo(v.sb.t))}</b><small>${v.esito.tipo === 'preso' ? 'preso ✓' : `manca ${esc(differenza(v.esito.diff).replace('+', ''))}`}</small></li>`).join('')}
                </ul>
              </li>`).join('')}</ul>
          </section>` : ''}
        <section class="sezione">
          <div class="sezione-testa"><h2 class="sezione-titolo">Tutti i tempi</h2></div>
          <div class="tabella-scorre">
            <table class="tabella-limiti">
              <thead><tr><th>Gara</th>${cats.map((c) => `<th>${esc(nomeCodice(c, sx))}</th>`).join('')}</tr></thead>
              <tbody>${gare.filter((c) => cats.some((cat) => l.t[`${c}|${sx}|${cat}`])).map((c) => `
                <tr><th>${esc(nomeGara(c, { breve: true }))}</th>${cats.map((cat) => `<td>${l.t[`${c}|${sx}|${cat}`] ? esc(tempo(l.t[`${c}|${sx}|${cat}`])) : '–'}</td>`).join('')}</tr>`).join('')}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      ${tabBar('classifiche')}`, (el) => {
      el.querySelectorAll('[data-sx]').forEach((b) => b.addEventListener('click', () => {
        sx = b.dataset.sx;
        ridisegna(true);
      }));
    }, { aggiornamento });
  };
  ridisegna();
  if (seguiti.length) {
    schede = await Promise.all(seguiti.map((k) => leggiAtleta(k).catch(() => null)));
    if (qui()) ridisegna(true);
  }
}

/* ---------- quanto vale questo tempo? ---------- */

export async function vistaQuantoVale() {
  const qui = () => percorso() === 'quanto-vale';
  const st = stagioneCorrente();
  const scelta = {
    c: '100SL', v: 25, sx: 'M', t: '', y: '', ...(memoria('quanto-vale') ?? {}),
  };
  let limiti = [];
  leggiLimiti().then((x) => {
    limiti = x;
    if (qui()) calcola();
  }).catch(() => {});

  disegna(`
    ${barraTop()}
    <main class="pagina">
      <h1 class="titolo-pagina">Classifiche</h1>
      ${menuClassifiche('quanto-vale')}
      <p class="intro">Scrivi un tempo: ti diciamo quanti punti vale, dove sarebbe nelle graduatorie di quest'anno del Lazio e d'Italia e quali tempi limite prende.</p>
      <form class="modulo quanto-vale" novalidate>
        <div class="riga-campi">
          <label class="campo">Gara
            <select name="c">${GARE.map((c) => `<option value="${c}" ${c === scelta.c ? 'selected' : ''}>${esc(nomeGara(c))}</option>`).join('')}</select>
          </label>
          <label class="campo">Tempo
            <input name="t" inputmode="decimal" autocomplete="off" placeholder="es. 1'02"45 o 1.02.45" value="${esc(scelta.t)}">
          </label>
        </div>
        <div class="riga-campi">
          <div class="segmenti" role="tablist" aria-label="Vasca">
            ${[25, 50].map((v) => `<button type="button" class="segmento" data-v="${v}" aria-selected="${scelta.v === v}">${v} m</button>`).join('')}
          </div>
          <div class="segmenti" role="tablist" aria-label="Sesso">
            ${['M', 'F'].map((x) => `<button type="button" class="segmento" data-sx="${x}" aria-selected="${scelta.sx === x}">${x === 'M' ? 'Maschi' : 'Femmine'}</button>`).join('')}
          </div>
        </div>
        <label class="campo">Anno di nascita (facoltativo, per la categoria)
          <input name="y" inputmode="numeric" maxlength="4" placeholder="es. 2011" value="${esc(scelta.y)}">
        </label>
      </form>
      <div data-esito></div>
    </main>
    ${tabBar('classifiche')}`, (el) => {
    const modulo = el.querySelector('form');
    modulo.addEventListener('submit', (e) => e.preventDefault());
    modulo.addEventListener('input', () => {
      scelta.c = modulo.c.value;
      scelta.t = modulo.t.value;
      scelta.y = modulo.y.value;
      calcola();
    });
    el.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => {
      scelta.v = Number(b.dataset.v);
      el.querySelectorAll('[data-v]').forEach((x) => x.setAttribute('aria-selected', x === b));
      calcola();
    }));
    el.querySelectorAll('[data-sx]').forEach((b) => b.addEventListener('click', () => {
      scelta.sx = b.dataset.sx;
      el.querySelectorAll('[data-sx]').forEach((x) => x.setAttribute('aria-selected', x === b));
      calcola();
    }));
    calcola();
  });

  let giro = 0;
  async function calcola() {
    memoria('quanto-vale', scelta);
    const box = document.querySelector('[data-esito]');
    if (!box) return;
    const ms = leggiTempo(scelta.t);
    if (!ms) {
      box.innerHTML = scelta.t ? '<p class="nota">Scrivi il tempo come 58"45, 1\'02"45 o 1.02.45.</p>' : '';
      return;
    }
    const mio = ++giro;
    const pt = punti(ms, scelta.c, scelta.sx, scelta.v, new Date().toISOString().slice(0, 10));
    const anno = Number(scelta.y) || null;
    const tutti = anno ? codici(anno, scelta.sx, st) : [];
    const cat = tutti.length ? tutti[tutti.length - 1] : null;
    let italia = null;
    const mostra = (classifica) => {
      const righe = classifica ? righeClassifica(classifica) : [];
      const righeIt = italia ? righeClassifica(italia) : [];
      const davantiIt = righeIt.filter((r) => r.valore < ms).length;
      const fuoriIt = italia?.parziale && davantiIt >= righeIt.length;
      const davanti = righe.filter((r) => r.valore < ms).length;
      const inCat = cat ? righe.filter((r) => codici(r.y, scelta.sx, st).includes(cat)) : [];
      const davantiCat = inCat.filter((r) => r.valore < ms).length;
      const valide = limiti.filter((l) => String(l.st) === st && Number(l.vasca) === scelta.v);
      const esitiLimiti = valide.map((l) => {
        const lim = limitePer(l, scelta.c, scelta.sx, tutti);
        return lim ? { l, lim, esito: rispettoAlLimite(ms, lim) } : null;
      }).filter(Boolean);
      box.innerHTML = `
        <div class="cifre" style="margin-top:14px">
          <div class="cifra"><b>${pt ?? '–'}</b><small>Punti World Aquatics</small></div>
          <div class="cifra"><b>${classifica ? `${davanti + 1}°` : '–'}</b><small>${classifica ? `su ${righe.length + 1} nel Lazio` : 'Graduatoria in arrivo'}</small></div>
          ${cat ? `<div class="cifra"><b>${classifica ? `${davantiCat + 1}°` : '–'}</b><small>${esc(nomeCodice(cat, scelta.sx))} Lazio</small></div>` : ''}
          <div class="cifra"><b>${italia ? (fuoriIt ? `>${righeIt.length}°` : `${davantiIt + 1}°`) : '…'}</b><small>${italia ? 'in Italia' : 'Italia in preparazione'}</small></div>
        </div>
        <p class="nota" style="margin-top:8px">Graduatoria del Lazio ${esc(nomeStagione(st))}, vasca da ${scelta.v} m${classifica && righe[0] ? ` · il primo ha ${esc(tempo(righe[0].valore))}` : ''}.</p>
        ${esitiLimiti.length ? `
          <section class="sezione">
            <div class="sezione-testa"><h2 class="sezione-titolo">Tempi limite</h2></div>
            <ul class="elenco limiti-atleta">${esitiLimiti.map(({ l, lim, esito }) => `
              <li class="esito-${esito.tipo}"><span>${esc(l.nome)}</span><b>${esc(tempo(lim))}</b><small>${esito.tipo === 'preso' ? 'preso ✓' : `manca ${esc(differenza(esito.diff).replace('+', ''))}`}</small></li>`).join('')}
            </ul>
          </section>` : ''}`;
    };
    mostra(null);
    let lazio = null;
    try {
      lazio = await leggiClassifica(`${st}-${scelta.v}-${scelta.c}-${scelta.sx}`);
      if (mio === giro && qui()) mostra(lazio);
    } catch { /* resta senza graduatoria */ }
    // La classifica nazionale: se non c'è ancora (o è vecchia) la si chiede, e si vede al prossimo calcolo.
    const r = {
      st, v: scelta.v, c: scelta.c, sx: scelta.sx, reg: 'it', cat: 'tutte',
    };
    try {
      italia = await leggiClassifica(`${st}-${scelta.v}-${scelta.c}-${scelta.sx}-it-tutte`);
      const agg = italia?.agg?.toDate ? italia.agg.toDate() : italia?.agg ? new Date(italia.agg) : null;
      if (!italia || !agg || Date.now() - agg.getTime() > ORE_VALIDITA * 3_600_000) api.chiediClassifica(r).catch(() => {});
      if (mio === giro && qui()) mostra(lazio);
    } catch { /* niente Italia per ora */ }
  }
}

/** "1'02"45", "1:02.45", "1.02.45", "62.45", "58"45" -> millisecondi. */
export function leggiTempo(testo = '') {
  const t = String(testo).trim().replace(/\s+/g, '').replace(/[’′]/g, "'").replace(/[″“”]/g, '"');
  let m = t.match(/^(\d{1,2})['.:,](\d{2})["'.:,](\d{1,2})$/);
  if (m) return ((Number(m[1]) * 60 + Number(m[2])) * 1000) + Number(m[3].padEnd(2, '0')) * 10;
  m = t.match(/^(\d{1,3})["'.,](\d{1,2})$/);
  if (m) return Number(m[1]) * 1000 + Number(m[2].padEnd(2, '0')) * 10;
  return null;
}
