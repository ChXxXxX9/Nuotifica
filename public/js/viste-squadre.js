// Squadre: elenco, componenti attuali e passati, migliori tempi per gara (di sempre o di una stagione),
// classifica interna di ogni gara e staffette.
import {
  stato, api, esc, barraTop, tabBar, disegna, caricamento, paginaErrore, conCache, giaInCache, percorso, memoria, avviso,
} from './nucleo.js';
import { punti } from './punti.js';
import {
  tempo, nomeGara, ordineGara, giorno, iniziali, categoria, gruppoCategoria, stagioneDi,
} from './formato.js';
import { menuClassifiche, REGIONI } from './viste-classifiche.js';
import {
  squadraDaStagioni, leggiRiassuntoSquadra, leggiStagioneSquadra as stagioneDaItalia, indiciStagione,
} from './dati-italia.js';
import { tastoInfo } from './spiegazioni.js';

const nascosto = (k) => (stato.nascosti ?? []).includes(k);
const normalizza = (t = '') => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nomeStagione = (st) => `${st}/${String(Number(st) + 1).slice(2)}`;

const leggiElenco = () => conCache('squadre', (fresco) => api.leggiSquadre(fresco), { durata: 600_000 });
/**
 * Squadra: stagione per stagione da tutta Italia (Realtime Database), più le staffette lette nelle gare
 * (Firestore). Se tutta Italia non c'è ancora, la squadra com'era prima (Firestore).
 */
const leggiSquadra = (id) => conCache(`squadra:${id}`, async () => {
  const [riassunto, prima, staffette] = await Promise.all([
    api.leggiRiassuntoSquadra?.(id).catch(() => null) ?? null,
    api.leggiSquadra(id).catch(() => null),
    api.leggiStaffetteSquadra?.(id).catch(() => []) ?? [],
  ]);
  // Staffette: quelle lette prima (Firestore) più quelle di tutte le gare (Realtime Database), senza doppioni.
  const sf = [...new Set([...(prima?.sf ?? []), ...(staffette ?? [])])];
  const sq = leggiRiassuntoSquadra(riassunto);
  if (sq) return { id, ...sq, sf, italia: true };
  // Riassunto non ancora pronto: la squadra intera (più pesante) o, prima ancora, quella del Lazio.
  const tutta = squadraDaStagioni(await api.leggiSquadraItalia(id).catch(() => null));
  if (tutta) return { id, ...tutta, sf, italia: true };
  return prima ? { ...prima, sf } : null;
}, { durata: 300_000 });
const leggiStagione = async (id, st) => {
  const sq = await leggiSquadra(id);
  if (sq?.stagioni) return sq.stagioni[st] ?? null;
  if (sq?.italia) {
    return conCache(`squadra:${id}:${st}`, async () => stagioneDaItalia(await api.leggiStagioneSquadraItalia(id, st)), { durata: 300_000 });
  }
  return conCache(`squadra:${id}:${st}`, () => api.leggiStagioneSquadra(id, st), { durata: 300_000 });
};

function righeElenco(elenco) {
  return Object.entries(elenco ?? {}).map(([id, riga]) => {
    const [n, attivi, totale, ultima, reg] = riga.split('|');
    return {
      id, n, attivi: Number(attivi) || 0, totale: Number(totale) || 0, ultima, reg: reg || '12',
    };
  });
}

/* ---------- elenco ---------- */

export async function vistaSquadre(q = '') {
  const qui = () => ['squadre', 'classifiche'].includes(percorso());
  const testoIniziale = q || stato.ricercaSquadre || '';
  if (!giaInCache('squadre')) caricamento('Carico le squadre…', { tab: 'classifiche' });
  let tutte;
  try {
    tutte = righeElenco(await leggiElenco());
  } catch (err) {
    if (qui()) paginaErrore(err, { tab: 'classifiche' });
    return;
  }
  if (!qui()) return;
  const parole = (t) => normalizza(t).split(/\s+/).filter((p) => p.length >= 2);
  const presenti = new Set(tutte.map((x) => x.reg));
  let regione = memoria('squadre-regione') ?? '12';
  if (regione !== 'it' && !presenti.has(regione)) regione = '12';
  const filtra = (t) => {
    const p = parole(t);
    const qui = regione === 'it' ? tutte : tutte.filter((x) => x.reg === regione);
    const scelte = p.length ? qui.filter((x) => p.every((w) => normalizza(x.n).includes(w))) : qui;
    return scelte.sort((a, b) => (b.ultima ?? '').localeCompare(a.ultima ?? '') || b.attivi - a.attivi || a.n.localeCompare(b.n, 'it'));
  };
  const voce = (x) => `
    <li><a href="#/squadra/${encodeURIComponent(x.id)}">
      <span class="iniziali" aria-hidden="true">${esc(iniziali(x.n))}</span>
      <span class="chi"><b>${esc(x.n)}</b><small>${x.attivi} ${x.attivi === 1 ? 'atleta' : 'atleti'} nel ${esc(nomeStagione(x.ultima))}${regione === 'it' && REGIONI[x.reg] ? ` · ${esc(REGIONI[x.reg])}` : ''}</small></span>
    </a></li>`;
  disegna(`
    ${barraTop()}
    <main class="pagina">
      <h1 class="titolo-pagina">Classifiche</h1>
      ${menuClassifiche('squadre')}
      <p class="intro">Le società: chi nuota per loro, i migliori tempi di sempre e di ogni stagione, le staffette.</p>
      ${presenti.size > 1 ? `<div class="scelte-classifica"><label class="modulo"><span>Dove</span>
        <select data-regione>
          <option value="it"${regione === 'it' ? ' selected' : ''}>Tutta Italia</option>
          ${Object.entries(REGIONI).filter(([id]) => presenti.has(id)).sort((a, b) => a[1].localeCompare(b[1], 'it'))
    .map(([id, nome]) => `<option value="${id}"${regione === id ? ' selected' : ''}>${esc(nome)}</option>`).join('')}
        </select></label></div>` : ''}
      <label class="cerca">
        <span class="nascosto">Cerca una squadra</span>
        <input type="search" placeholder="Nome della squadra" autocomplete="off" enterkeyhint="search" value="${esc(testoIniziale)}">
      </label>
      ${tutte.length ? '<ul class="elenco elenco-squadre" data-elenco></ul>' : `
        <div class="vuoto"><strong>Squadre in arrivo</strong>Stiamo leggendo le graduatorie stagione per stagione: le squadre compaiono qui nelle prossime ore.</div>`}
      <p class="nota" style="margin-top:18px">Tutte le società d'Italia che compaiono nelle graduatorie, dal 1970 a oggi: scegli la regione qui sopra.</p>
    </main>
    ${tabBar('classifiche')}`, (el) => {
    const input = el.querySelector('input');
    const box = el.querySelector('[data-elenco]');
    const mostra = () => {
      stato.ricercaSquadre = input.value;
      if (!box) return;
      const scelte = filtra(input.value);
      box.innerHTML = scelte.length ? scelte.slice(0, 120).map(voce).join('') : '<li class="vuoto"><strong>Nessuna squadra</strong>Prova con un\'altra parola del nome.</li>';
    };
    input.addEventListener('input', mostra);
    el.querySelector('[data-regione]')?.addEventListener('change', (e) => {
      regione = e.target.value;
      memoria('squadre-regione', regione);
      mostra();
    });
    mostra();
  });
}

/* ---------- pagina della squadra ---------- */

export async function vistaSquadra(id) {
  const qui = () => percorso() === `squadra/${id}` || percorso() === `squadra/${encodeURIComponent(id)}`;
  if (!giaInCache(`squadra:${id}`)) caricamento('Apro la squadra…', { tab: 'classifiche' });
  let sq;
  try {
    sq = await leggiSquadra(id);
  } catch (err) {
    if (qui()) paginaErrore(err, { tab: 'classifiche' });
    return;
  }
  if (!qui()) return;
  if (!sq) {
    disegna(`${barraTop({ indietro: true })}<main class="pagina"><h1 class="titolo-pagina">Squadra non trovata</h1><p class="intro">Torna all'<a href="#/squadre">elenco delle squadre</a>.</p></main>${tabBar('classifiche')}`);
    return;
  }

  // Componenti: "chiave|nome|anno|sesso|prima stagione|ultima stagione".
  const membri = (sq.m ?? []).map((riga) => {
    const [k, n, y, sx, da, a] = riga.split('|');
    return {
      k, n, y, sx, da, a,
    };
  }).filter((x) => !nascosto(x.k));
  const perChiave = new Map(membri.map((x) => [x.k, x]));
  const stagioni = [...(sq.st ?? [])].sort().reverse();
  const ultima = stagioni[0] ?? '';
  const staffette = (sq.sf ?? []).map((riga) => {
    const [c, sx, v, t, d, g, cat] = riga.split('|');
    return {
      c, sx, v: Number(v), t: Number(t), d, g, cat,
    };
  });
  const vascheStaff = staffette.map((x) => x.v);
  const vasche = [...new Set([...Object.keys(sq.t ?? {}).map((kt) => Number(kt.split('|')[0])), ...vascheStaff])].sort();
  const pref = memoria(`squadra-vista`) ?? {};
  const scelta = {
    st: 'sempre',
    v: vasche.includes(pref.v) ? pref.v : (vasche.includes(25) ? 25 : vasche[0] ?? 25),
    sx: pref.sx === 'F' ? 'F' : 'M',
    gruppo: ['esordienti', 'categoria'].includes(pref.gruppo) ? pref.gruppo : 'tutti',
    rsx: ['M', 'F'].includes(pref.rsx) ? pref.rsx : 'tutti',
    rTutti: false,
    aperta: null,
    exAperti: false,
  };
  const ricorda = () => memoria('squadra-vista', {
    v: scelta.v, sx: scelta.sx, gruppo: scelta.gruppo, rsx: scelta.rsx,
  });

  // Classifica atleti per Indice Cloro: di una stagione, o il migliore raggiunto con la squadra (di sempre).
  const cacheRoster = new Map();
  const classificaAtleti = () => {
    const chiave = `${scelta.st}|${scelta.rsx}`;
    if (cacheRoster.has(chiave)) return cacheRoster.get(chiave);
    let elenco = null;
    if (scelta.st === 'sempre') {
      if (sq.ic) elenco = sq.ic;
      else if (sq.stagioni) {
        const migliori = new Map();
        for (const [st, x] of Object.entries(sq.stagioni)) {
          for (const a of indiciStagione(x.t, punti)) if (!migliori.has(a.k) || a.valore > migliori.get(a.k).valore) migliori.set(a.k, { ...a, st });
        }
        elenco = [...migliori.values()].sort((a, b) => b.valore - a.valore);
      }
    } else if (tabelleStagione) {
      elenco = indiciStagione(tabelleStagione, punti);
    }
    if (!elenco) return null;
    elenco = elenco.filter((x) => !nascosto(x.k) && (scelta.rsx === 'tutti' || x.sx === scelta.rsx));
    cacheRoster.set(chiave, elenco);
    return elenco;
  };
  const MAX_SQUADRE = 5;
  const seguita = () => (stato.profilo?.squadre ?? []).includes(id);
  const notifiche = () => stato.profilo?.notSq?.[id] ?? ['pb', 'staffette'];
  let tabelleStagione = null;

  const tabella = () => {
    // Righe "chiave|tempo|data|stagione" (di sempre) o "chiave|tempo|data" (di una stagione).
    const sorgente = scelta.st === 'sempre' ? (sq.t ?? {}) : (tabelleStagione ?? {});
    const gare = new Map();
    for (const [kt, righe] of Object.entries(sorgente)) {
      const [v, c, sx] = kt.split('|');
      if (Number(v) !== scelta.v || sx !== scelta.sx) continue;
      const filtrate = righe.map((riga) => {
        const [k, t, d, s] = riga.split('|');
        return {
          k, t: Number(t), d, s: s ?? scelta.st,
        };
      }).filter((r) => !nascosto(r.k)).filter((r) => scelta.gruppo === 'tutti'
        || gruppoCategoria(categoria(perChiave.get(r.k)?.y, scelta.sx, r.s === 'sempre' ? stagioneDi(r.d) : r.s)) === scelta.gruppo);
      if (filtrate.length) gare.set(c, filtrate);
    }
    return [...gare].sort((a, b) => ordineGara(a[0]) - ordineGara(b[0]));
  };

  const ridisegna = (aggiornamento = false) => {
    const gare = tabella();
    const staff = staffette.filter((x) => x.v === scelta.v && x.sx === scelta.sx
      && (scelta.st === 'sempre' || stagioneDi(x.d) === scelta.st));
    const miglioriStaff = new Map();
    for (const x of staff.sort((a, b) => a.t - b.t)) if (!miglioriStaff.has(`${x.c}|${x.cat}`)) miglioriStaff.set(`${x.c}|${x.cat}`, x);
    const stagioneVista = scelta.st === 'sempre' ? ultima : scelta.st;
    const precedente = String(Number(stagioneVista) - 1);
    // Atleti della squadra: chi ha gareggiato in questa stagione o nella precedente.
    // Ex: chi non gareggia almeno dalla stagione scorsa.
    const nelGruppo = (x) => scelta.gruppo === 'tutti' || gruppoCategoria(categoria(x.y, x.sx, stagioneVista)) === scelta.gruppo;
    const attuali = membri.filter((x) => x.da <= stagioneVista && x.a >= precedente && nelGruppo(x))
      .sort((a, b) => b.a.localeCompare(a.a) || a.n.localeCompare(b.n, 'it'));
    const ex = membri.filter((x) => x.a < precedente).sort((a, b) => b.a.localeCompare(a.a) || a.n.localeCompare(b.n, 'it'));
    const etichettaCat = (x) => {
      const c = categoria(x.y, x.sx, stagioneVista);
      return c ? { EB: 'Es. B', EA: 'Es. A', R: 'Ragazzi', J: 'Juniores', C: 'Cadetti', S: 'Seniores' }[c] : '';
    };
    const nomeAtleta = (k) => perChiave.get(k)?.n ?? k.replace(/-\d{4}$/, '').replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

    disegna(`
      ${barraTop({ indietro: true })}
      <main class="pagina">
        <section class="testa-atleta">
          <span class="iniziali" style="width:56px;height:56px;border-radius:18px;font-size:18px" aria-hidden="true">${esc(iniziali(sq.n ?? id))}</span>
          <h1>${esc(sq.n ?? id)}</h1>
          <div class="cifre">
            <div class="cifra"><b>${membri.filter((x) => x.a >= String(Number(ultima) - 1)).length}</b><small>Atleti attivi</small></div>
            <div class="cifra"><b>${membri.length}</b><small>Da sempre</small></div>
            <div class="cifra"><b>${stagioni.length}</b><small>Stagioni</small></div>
          </div>
          <div class="segui-squadra">
            <button class="bottone bottone-piccolo ${seguita() ? 'bottone-secondario' : ''}" data-segui-sq aria-pressed="${seguita()}">${seguita() ? 'Seguita ✓' : 'Segui la squadra'}</button>
            ${seguita() ? `
              <fieldset class="scelte-notifiche">
                <legend>Notifiche di questa squadra</legend>
                ${[['pb', 'Personali dei suoi atleti'], ['tempi', 'Tutti i tempi nuovi'], ['staffette', 'Staffette']].map(([v, nome]) => `
                  <label><input type="checkbox" value="${v}" ${notifiche().includes(v) ? 'checked' : ''}> ${nome}</label>`).join('')}
              </fieldset>` : ''}
          </div>
        </section>

        <div class="filtri" role="toolbar" aria-label="Periodo" style="margin-top:14px">
          <button class="chip" data-st="sempre" aria-pressed="${scelta.st === 'sempre'}">Di sempre</button>
          ${stagioni.map((s) => `<button class="chip" data-st="${esc(s)}" aria-pressed="${scelta.st === s}">${esc(nomeStagione(s))}</button>`).join('')}
        </div>
        <div class="segmenti" role="tablist" aria-label="Vasca e sesso" style="margin-top:10px">
          ${vasche.map((v) => `<button class="segmento" role="tab" data-v="${v}" aria-selected="${scelta.v === v}">${v} m</button>`).join('')}
          <button class="segmento" role="tab" data-sx="M" aria-selected="${scelta.sx === 'M'}">Maschi</button>
          <button class="segmento" role="tab" data-sx="F" aria-selected="${scelta.sx === 'F'}">Femmine</button>
        </div>

        <div class="filtri" role="toolbar" aria-label="Categorie" style="margin-top:10px">
          ${[['tutti', 'Tutti'], ['categoria', 'Categoria'], ['esordienti', 'Esordienti']].map(([id, nome]) => `<button class="chip" data-gruppo="${id}" aria-pressed="${scelta.gruppo === id}">${nome}</button>`).join('')}
        </div>

        <section class="sezione">
          <div class="sezione-testa"><h2 class="sezione-titolo">Migliori per gara${scelta.gruppo === 'tutti' ? '' : ` · ${scelta.gruppo === 'categoria' ? 'Categoria' : 'Esordienti'}`}</h2><span class="nota">${scelta.st === 'sempre' ? 'di sempre' : esc(nomeStagione(scelta.st))}</span></div>
          ${scelta.st !== 'sempre' && tabelleStagione === null ? '<p class="caricamento">Carico la stagione…</p>' : gare.length ? `
            <ul class="elenco classifica-squadra">${gare.map(([c, righe]) => {
    const primo = righe[0];
    const aperta = scelta.aperta === c;
    return `
              <li class="${aperta ? 'aperta' : ''}">
                <button type="button" class="riga-gara" data-gara="${esc(c)}" aria-expanded="${aperta}">
                  <span class="gara-nome">${esc(nomeGara(c, { breve: true }))}</span>
                  <span class="chi"><b>${esc(nomeAtleta(primo.k))}</b><small>${esc(scelta.st === 'sempre' ? `${nomeStagione(primo.s)} · ${giorno(primo.d)}` : giorno(primo.d))}</small></span>
                  <span class="quanto"><b>${esc(tempo(primo.t))}</b><small>${righe.length} ${righe.length === 1 ? 'atleta' : 'atleti'}</small></span>
                </button>
                ${aperta ? `<ol class="classifica-interna">${righe.map((r, i) => `
                  <li><a href="#/atleta/${encodeURIComponent(r.k)}">
                    <span class="pos"><b>${i + 1}</b></span>
                    <span class="chi"><b>${esc(nomeAtleta(r.k))}</b><small>${esc([perChiave.get(r.k)?.y, scelta.st === 'sempre' ? nomeStagione(r.s) : giorno(r.d)].filter(Boolean).join(' · '))}</small></span>
                    <span class="quanto"><b>${esc(tempo(r.t))}</b></span>
                  </a></li>`).join('')}</ol>` : ''}
              </li>`;
  }).join('')}</ul>` : `<div class="vuoto"><strong>Nessun tempo qui</strong>Prova con l'altra vasca o con ${scelta.sx === 'M' ? 'le femmine' : 'i maschi'}.</div>`}
        </section>

        <section class="sezione">
          <div class="sezione-testa"><h2 class="sezione-titolo titolo-con-info">Classifica atleti ${tastoInfo('indice-cloro', 'Come funziona l\'Indice Cloro')}</h2><span class="nota">${scelta.st === 'sempre' ? 'di sempre' : esc(nomeStagione(scelta.st))}</span></div>
          <p class="nota" style="margin:-4px 0 10px">Per Indice Cloro${scelta.st === 'sempre' ? ': il migliore che ognuno ha raggiunto in una stagione con questa squadra' : ' della stagione, con i tempi nuotati per questa squadra'}.</p>
          <div class="segmenti" role="tablist" aria-label="Chi">
            ${[['tutti', 'Tutti'], ['M', 'Maschi'], ['F', 'Femmine']].map(([v, nome]) => `<button class="segmento" role="tab" data-rsx="${v}" aria-selected="${scelta.rsx === v}">${nome}</button>`).join('')}
          </div>
          ${!sq.italia ? '<p class="nota">La classifica arriva appena la squadra è caricata con tutte le sue stagioni.</p>' : (() => {
    const elenco = classificaAtleti();
    if (!elenco) return '<p class="caricamento">Carico la stagione…</p>';
    if (!elenco.length) return '<p class="nota">Nessun atleta qui.</p>';
    return `<ol class="classifica" style="margin-top:10px">${elenco.slice(0, scelta.rTutti ? Infinity : 30).map((x, i) => `
              <li><a href="#/atleta/${encodeURIComponent(x.k)}">
                <span class="pos"><b>${i + 1}</b></span>
                <span class="chi"><b>${esc(nomeAtleta(x.k))}</b><small>${esc([perChiave.get(x.k)?.y, scelta.rsx === 'tutti' ? x.sx : '', (x.gare ?? []).map((c) => nomeGara(c, { breve: true })).join(', '), scelta.st === 'sempre' && x.st ? nomeStagione(x.st) : ''].filter(Boolean).join(' · '))}</small></span>
                <span class="quanto"><b>${x.valore}</b><small>indice</small></span>
              </a></li>`).join('')}</ol>
            ${!scelta.rTutti && elenco.length > 30 ? `<button class="bottone bottone-secondario" data-roster-tutti style="margin-top:10px">Mostra tutti (${elenco.length})</button>` : ''}`;
  })()}
        </section>

        <section class="sezione">
          <div class="sezione-testa"><h2 class="sezione-titolo">Staffette</h2></div>
          ${miglioriStaff.size ? `<ul class="elenco classifica-squadra">${[...miglioriStaff.values()].sort((a, b) => ordineGara(a.c) - ordineGara(b.c) || a.cat.localeCompare(b.cat)).map((x) => `
            <li><a class="riga-gara" href="#/gara/${encodeURIComponent(x.g)}?e=${encodeURIComponent(x.c)}">
              <span class="gara-nome">${esc(nomeGara(x.c, { breve: true }))}</span>
              <span class="chi"><b>${esc(x.cat || 'Staffetta')}</b><small>${esc(giorno(x.d))}</small></span>
              <span class="quanto"><b>${esc(tempo(x.t))}</b></span>
            </a></li>`).join('')}</ul>` : '<p class="nota">Le staffette compaiono qui dalle gare che leggiamo, in tutta Italia (le graduatorie federali non hanno le staffette, quindi quelle vecchie non ci sono).</p>'}
        </section>

        <section class="sezione">
          <div class="sezione-testa"><h2 class="sezione-titolo">Atleti${scelta.gruppo === 'tutti' ? '' : ` · ${scelta.gruppo === 'categoria' ? 'Categoria' : 'Esordienti'}`}</h2><span class="nota">${attuali.length}</span></div>
          <p class="nota" style="margin:-4px 0 10px">Hanno gareggiato nel ${esc(nomeStagione(precedente))} o nel ${esc(nomeStagione(stagioneVista))}.</p>
          ${attuali.length ? `<ul class="elenco risultati-ricerca">${attuali.map((x) => `
            <li><a href="#/atleta/${encodeURIComponent(x.k)}"><b>${esc(x.n)}</b><small>${esc([x.y, x.sx === 'F' ? 'F' : 'M', etichettaCat(x)].filter(Boolean).join(' · '))}</small></a></li>`).join('')}</ul>` : '<p class="nota">Nessuno qui.</p>'}
          ${ex.length ? `
            <button class="bottone bottone-secondario" data-ex style="margin-top:12px">${scelta.exAperti ? 'Nascondi' : 'Mostra'} gli ex atleti (${ex.length})</button>
            <p class="nota" style="margin-top:6px">Ex: non gareggiano almeno dal ${esc(nomeStagione(precedente))}.</p>
            ${scelta.exAperti ? `<ul class="elenco risultati-ricerca" style="margin-top:10px">${ex.map((x) => `
              <li><a href="#/atleta/${encodeURIComponent(x.k)}"><b>${esc(x.n)}</b><small>${esc(x.da === x.a ? nomeStagione(x.da) : `${nomeStagione(x.da)} – ${nomeStagione(x.a)}`)}</small></a></li>`).join('')}</ul>` : ''}` : ''}
        </section>
        <p class="nota" style="margin-top:20px">Tempi dalle graduatorie di ogni stagione e dalle gare che leggiamo. Prima del 2018/19 ci possono essere anche tempi presi a mano.</p>
      </main>
      ${tabBar('classifiche')}`, (el) => {
      el.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', async () => {
        scelta.st = b.dataset.st;
        scelta.aperta = null;
        scelta.rTutti = false;
        tabelleStagione = null;
        ridisegna(true);
        if (scelta.st === 'sempre') return;
        const st = scelta.st;
        try {
          const dati = await leggiStagione(id, st);
          if (!qui() || scelta.st !== st) return;
          tabelleStagione = dati?.t ?? {};
        } catch {
          tabelleStagione = {};
        }
        ridisegna(true);
      }));
      el.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => {
        scelta.v = Number(b.dataset.v);
        scelta.aperta = null;
        ricorda();
        ridisegna(true);
      }));
      el.querySelectorAll('[data-sx]').forEach((b) => b.addEventListener('click', () => {
        scelta.sx = b.dataset.sx;
        scelta.aperta = null;
        ricorda();
        ridisegna(true);
      }));
      el.querySelectorAll('[data-rsx]').forEach((b) => b.addEventListener('click', () => {
        scelta.rsx = b.dataset.rsx;
        scelta.rTutti = false;
        ricorda();
        ridisegna(true);
      }));
      el.querySelector('[data-roster-tutti]')?.addEventListener('click', () => {
        scelta.rTutti = true;
        ridisegna(true);
      });
      // Segui la squadra (con le notifiche scelte).
      el.querySelector('[data-segui-sq]')?.addEventListener('click', async (e) => {
        const bottone = e.currentTarget;
        const uid = stato.utente?.uid;
        if (!uid || !stato.profilo) return;
        const gia = seguita();
        if (!gia && (stato.profilo.squadre ?? []).length >= MAX_SQUADRE) {
          avviso(`Puoi seguire al massimo ${MAX_SQUADRE} squadre: togline una dalla sua pagina.`, 'errore');
          return;
        }
        bottone.disabled = true;
        try {
          if (gia) {
            await api.smettiSquadra(uid, id);
            stato.profilo.squadre = (stato.profilo.squadre ?? []).filter((x) => x !== id);
            if (stato.profilo.notSq) delete stato.profilo.notSq[id];
            avviso(`Non segui più ${sq.n ?? 'la squadra'}.`);
          } else {
            await api.seguiSquadra(uid, id, notifiche());
            stato.profilo.squadre = [...(stato.profilo.squadre ?? []), id];
            stato.profilo.notSq = { ...(stato.profilo.notSq ?? {}), [id]: notifiche() };
            avviso(memoria('token') ? `Segui ${sq.n ?? 'la squadra'}: scegli qui sotto quali notifiche ricevere.` : `Segui ${sq.n ?? 'la squadra'}. Attiva le notifiche per sapere subito i tempi.`);
          }
          ridisegna(true);
        } catch (err) {
          bottone.disabled = false;
          avviso(err.message, 'errore');
        }
      });
      el.querySelectorAll('.scelte-notifiche input').forEach((c) => c.addEventListener('change', async () => {
        const uid = stato.utente?.uid;
        if (!uid) return;
        const scelte = [...el.querySelectorAll('.scelte-notifiche input:checked')].map((x) => x.value);
        try {
          await api.seguiSquadra(uid, id, scelte);
          stato.profilo.notSq = { ...(stato.profilo.notSq ?? {}), [id]: scelte };
          avviso(scelte.length ? 'Notifiche della squadra salvate.' : 'Nessuna notifica da questa squadra (la segui lo stesso).');
        } catch (err) {
          avviso(err.message, 'errore');
        }
      }));
      el.querySelectorAll('[data-gara]').forEach((b) => b.addEventListener('click', () => {
        scelta.aperta = scelta.aperta === b.dataset.gara ? null : b.dataset.gara;
        ridisegna(true);
      }));
      el.querySelectorAll('[data-gruppo]').forEach((b) => b.addEventListener('click', () => {
        scelta.gruppo = b.dataset.gruppo;
        scelta.aperta = null;
        ricorda();
        ridisegna(true);
      }));
      el.querySelector('[data-ex]')?.addEventListener('click', () => {
        scelta.exAperti = !scelta.exAperti;
        ridisegna(true);
      });
    }, { aggiornamento });
  };
  ridisegna();
}
