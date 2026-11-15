// Sezione Admin (anche dal computer): panoramica e lavori, consigli, annunci, tempi limite,
// categorie, atleti nascosti, utenti.
import {
  stato, api, esc, barraTop, disegna, caricamento, paginaErrore, ICONE, avviso, conAttesa, mostraErrore, percorso,
  parametriHash, conCache,
} from './nucleo.js';
import {
  quando, tempo, nomeGara, nomeStagione, stagioneCorrente, NOMI_CATEGORIE, impostaRegoleCategorie, regoleCategorie,
} from './formato.js';
import { regoleInTesto, regoleDaTesto } from './categorie.js';
import { GARE, leggiTempo } from './viste-classifiche.js';
import { cerca } from './viste-atleti.js';
import { eAdmin } from './viste-consigli.js';

const SEZIONI = [
  ['panoramica', 'Panoramica'], ['consigli', 'Consigli'], ['annunci', 'Annunci'], ['limiti', 'Tempi limite'],
  ['categorie', 'Categorie'], ['nascosti', 'Atleti nascosti'], ['utenti', 'Utenti'],
];
const NOME_TIPO = { idea: 'Idea', problema: 'Problema', altro: 'Altro' };
const STATI = { nuovo: 'Inviato', letto: 'Letto', fatto: 'Fatto!' };
const LAVORI = {
  stagione: 'Rileggi una stagione delle graduatorie', testi: 'Rileggi il testo dei PDF', prova: 'Notifica di prova', gara: 'Rileggi una gara',
};
const COLONNE = ['*', 'EB', 'EA', 'R', 'J', 'C', 'S'];
const nomeColonna = (c) => (c === '*' ? 'Tutti' : NOMI_CATEGORIE[c]);
const qui = () => percorso() === 'admin';

function pagina(sez, corpo) {
  return `
    ${barraTop({ indietro: true, titolo: 'Admin' })}
    <main class="pagina pagina-admin">
      <h1 class="titolo-pagina">Admin</h1>
      <nav class="filtri menu-sezione" aria-label="Sezioni admin">
        ${SEZIONI.map(([id, nome]) => `<a class="chip" href="#/admin?sez=${id}" ${id === sez ? 'aria-current="true"' : ''}>${nome}</a>`).join('')}
      </nav>
      ${corpo}
    </main>`;
}

export async function vistaAdmin() {
  if (!stato.admin && !(await eAdmin())) {
    disegna(`${barraTop({ indietro: true })}<main class="pagina"><h1 class="titolo-pagina">Solo per chi gestisce Cloro</h1><p class="intro">Questa sezione non è disponibile per il tuo account.</p></main>`);
    return;
  }
  stato.admin = true;
  const sez = parametriHash().get('sez') ?? 'panoramica';
  const vista = {
    panoramica, consigli, annunci, limiti, categorie, nascosti, utenti,
  }[sez] ?? panoramica;
  try {
    await vista();
  } catch (err) {
    if (qui()) paginaErrore(err);
  }
}

/* ---------- panoramica e lavori ---------- */

async function panoramica() {
  caricamento('Apro la sezione admin…');
  const dati = await api.datiAdmin();
  if (!qui()) return;
  const s = dati.stato ?? {};
  const b = dati.budget ?? {};
  const corrente = Number(stagioneCorrente());
  const stagioni = [];
  for (let x = corrente; x >= 2018; x--) stagioni.push(x);
  disegna(pagina('panoramica', `
    <div class="cifre" style="margin-top:10px">
      <div class="cifra"><b>${dati.utenti ?? '–'}</b><small>Iscritti</small></div>
      <div class="cifra"><b>${dati.atleti ?? '–'}</b><small>Atleti</small></div>
      <div class="cifra"><b>${dati.squadre ?? '–'}</b><small>Squadre</small></div>
      <div class="cifra"><b>${(dati.consigli ?? []).filter((c) => c.stato === 'nuovo').length}</b><small>Consigli nuovi</small></div>
    </div>
    <div class="griglia-admin">
      <section class="sezione">
        <div class="sezione-testa"><h2 class="sezione-titolo">Sistema</h2></div>
        <ul class="elenco elenco-admin">
          <li class="scheda"><b>Ultimo controllo avvisi</b><span>${esc(s.ultimoControllo ? quando(new Date(s.ultimoControllo)) : '–')} · ${esc(s.esito ?? '')}</span></li>
          <li class="scheda"><b>Scritture su Firestore oggi</b><span>${(b.scritture ?? 0) + (dati.budgetGrad?.scritture ?? 0)} su 20.000 (controllore ${b.scritture ?? 0}, graduatorie ${dati.budgetGrad?.scritture ?? 0})</span></li>
          <li class="scheda"><b>Testi dei PDF letti</b><span>${dati.testi ?? 0} documenti</span></li>
          ${s.messaggio ? `<li class="scheda"><b>Ultimo messaggio</b><span>${esc(String(s.messaggio).slice(0, 200))}</span></li>` : ''}
        </ul>
      </section>
      <section class="sezione">
        <div class="sezione-testa"><h2 class="sezione-titolo">Graduatorie lette</h2></div>
        <ul class="stagioni-lette">${stagioni.map((x) => {
    const fatta = dati.graduatorie?.[x];
    return `<li class="${fatta ? 'fatta' : ''}"><b>${nomeStagione(x)}</b><small>${fatta ? esc(quando(new Date(fatta))) : 'da leggere'}</small></li>`;
  }).join('')}</ul>
      </section>
    </div>
    <section class="sezione">
      <div class="sezione-testa"><h2 class="sezione-titolo">Lavori per il controllore</h2></div>
      <p class="nota" style="margin-bottom:10px">Partono al prossimo giro (entro 5 minuti). Le stagioni si leggono di notte o subito se c'è spazio nel limite giornaliero.</p>
      <form class="modulo riga-lavoro" data-lavoro="stagione">
        <select name="stagione" aria-label="Stagione">${stagioni.map((x) => `<option value="${x}">${nomeStagione(x)}</option>`).join('')}</select>
        <button class="bottone bottone-piccolo" type="submit">${ICONE.aggiorna}<span>Rileggi la stagione</span></button>
      </form>
      <form class="modulo riga-lavoro" data-lavoro="gara">
        <input name="gara" placeholder="Id della gara (dall'indirizzo, es. l20261107-…)" aria-label="Id della gara">
        <button class="bottone bottone-piccolo" type="submit">${ICONE.aggiorna}<span>Rileggi la gara</span></button>
      </form>
      <div class="riga-lavoro">
        <button class="bottone bottone-secondario bottone-piccolo" data-lavoro-semplice="testi">Rileggi il testo dei PDF</button>
        <button class="bottone bottone-secondario bottone-piccolo" data-lavoro-semplice="prova">${ICONE.campana}<span>Notifica di prova a me</span></button>
      </div>
      ${dati.lavori?.length ? `<ul class="elenco elenco-admin" style="margin-top:12px">${dati.lavori.map((l) => `
        <li class="scheda"><b>${esc(LAVORI[l.tipo] ?? l.tipo)}${l.stagione ? ` ${esc(nomeStagione(l.stagione))}` : ''}${l.gara ? ` ${esc(l.gara)}` : ''}</b>
          <span>${esc(quando(l.creato))} · ${esc(l.stato === 'fatto' ? `fatto${l.esito ? `: ${l.esito}` : ''}` : l.stato === 'errore' ? `errore: ${l.esito ?? ''}` : 'in attesa')}</span></li>`).join('')}</ul>` : ''}
    </section>`), (el) => {
    el.querySelectorAll('form[data-lavoro]').forEach((f) => f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const tipo = f.dataset.lavoro;
      const dati2 = tipo === 'stagione' ? { stagione: String(f.stagione.value) } : { gara: f.gara.value.trim() };
      if (tipo === 'gara' && !dati2.gara) return;
      try {
        await conAttesa(f.querySelector('button'), () => api.creaLavoro(tipo, dati2));
        avviso('Lavoro in coda.');
        panoramica();
      } catch (err) {
        avviso(err.message, 'errore');
      }
    }));
    el.querySelectorAll('[data-lavoro-semplice]').forEach((x) => x.addEventListener('click', async () => {
      try {
        await conAttesa(x, () => api.creaLavoro(x.dataset.lavoroSemplice));
        avviso('Lavoro in coda.');
        panoramica();
      } catch (err) {
        avviso(err.message, 'errore');
      }
    }));
  }, { classeBody: 'senza-tab' });
}

/* ---------- consigli ---------- */

async function consigli() {
  caricamento('Carico i consigli…');
  const dati = await api.datiAdmin();
  if (!qui()) return;
  const filtro = stato.filtroAdmin ?? 'nuovo';
  const elenco = dati.consigli.filter((c) => filtro === 'tutti' || c.stato === filtro);
  disegna(pagina('consigli', `
    <div class="filtri" role="toolbar" aria-label="Filtra i consigli">
      ${[['nuovo', 'Nuovi'], ['letto', 'Letti'], ['fatto', 'Fatti'], ['tutti', 'Tutti']].map(([id, nome]) => `<button class="chip" data-filtro-admin="${id}" aria-pressed="${filtro === id}">${nome}</button>`).join('')}
    </div>
    ${elenco.length ? `<ul class="elenco griglia-consigli">${elenco.map((c) => `
      <li class="scheda consiglio" data-id="${esc(c.id)}">
        <div class="consiglio-testa"><span class="tipo">${esc(NOME_TIPO[c.tipo] ?? 'Altro')}</span><span>${esc(quando(c.creato))} · ${esc(c.dispositivo ?? '')}</span><span class="stato-consiglio stato-${esc(c.stato)}">${esc(STATI[c.stato] ?? c.stato)}</span></div>
        <p>${esc(c.testo)}</p>
        <textarea rows="2" maxlength="500" placeholder="Rispondi (la vede chi l'ha scritto)" aria-label="Risposta">${esc(c.risposta ?? '')}</textarea>
        <div class="dettaglio-azioni">
          <button class="bottone bottone-secondario bottone-piccolo" data-segna="letto">Letto</button>
          <button class="bottone bottone-piccolo" data-segna="fatto">Fatto</button>
        </div>
      </li>`).join('')}</ul>` : '<p class="nota">Nessun consiglio qui.</p>'}`), (el) => {
    el.querySelectorAll('[data-filtro-admin]').forEach((x) => x.addEventListener('click', () => {
      stato.filtroAdmin = x.dataset.filtroAdmin;
      consigli();
    }));
    el.querySelectorAll('[data-segna]').forEach((x) => x.addEventListener('click', async () => {
      const li = x.closest('[data-id]');
      try {
        await conAttesa(x, () => api.aggiornaConsiglio(li.dataset.id, { stato: x.dataset.segna, risposta: li.querySelector('textarea').value.trim() }));
        avviso('Salvato.');
        consigli();
      } catch (err) {
        avviso(err.message, 'errore');
      }
    }));
  }, { classeBody: 'senza-tab' });
}

/* ---------- annunci ---------- */

async function annunci() {
  caricamento('Carico gli annunci…');
  const dati = await api.datiAdmin();
  if (!qui()) return;
  disegna(pagina('annunci', `
    <form class="modulo" data-annuncio novalidate style="max-width:560px">
      <label class="campo">Titolo<input name="titolo" maxlength="60" required placeholder="Es. Nuove classifiche in Cloro"></label>
      <label class="campo">Testo<textarea name="corpo" rows="3" maxlength="180" required placeholder="Arriva come notifica a tutti gli iscritti"></textarea></label>
      <label class="campo">Dove porta (facoltativo)<input name="url" maxlength="120" placeholder="es. #/classifiche"></label>
      <p class="errore" data-errore hidden></p>
      <button class="bottone" type="submit">${ICONE.campana}<span>Manda la notifica a tutti</span></button>
      <p class="nota">Parte al prossimo giro del controllore (entro 5 minuti).</p>
    </form>
    ${dati.annunci.length ? `<ul class="elenco elenco-admin" style="margin-top:12px">${dati.annunci.map((a) => `
      <li class="scheda"><b>${esc(a.titolo)}</b><span>${esc(a.stato === 'inviato' ? `Inviato ${quando(a.inviato)} · ${a.notifiche ?? 0} notifiche` : 'In attesa del prossimo giro')}</span></li>`).join('')}</ul>` : ''}`), (el) => {
    const modulo = el.querySelector('[data-annuncio]');
    modulo.addEventListener('submit', async (e) => {
      e.preventDefault();
      const titolo = modulo.titolo.value.trim();
      const corpo = modulo.corpo.value.trim();
      const url = modulo.url.value.trim();
      if (!titolo || !corpo) {
        mostraErrore(modulo, new Error('Scrivi titolo e testo.'));
        return;
      }
      if (url && !/^#\//.test(url)) {
        mostraErrore(modulo, new Error('L\'indirizzo deve iniziare con #/ (una pagina di Cloro).'));
        return;
      }
      // eslint-disable-next-line no-alert
      if (!window.confirm(`Mandare "${titolo}" a tutti gli iscritti?`)) return;
      try {
        await conAttesa(modulo.querySelector('[type="submit"]'), () => api.creaAnnuncio({ titolo, corpo, ...(url ? { url } : {}) }));
        avviso('Annuncio in partenza.');
        annunci();
      } catch (err) {
        mostraErrore(modulo, err);
      }
    });
  }, { classeBody: 'senza-tab' });
}

/* ---------- tempi limite ---------- */

async function limiti() {
  caricamento('Carico i tempi limite…');
  const tutti = await api.leggiLimiti();
  if (!qui()) return;
  const id = parametriHash().get('id');
  if (id) {
    editorLimite(tutti.find((l) => l.id === id) ?? null);
    return;
  }
  const ordinati = [...tutti].sort((a, b) => String(b.st).localeCompare(String(a.st)) || a.nome.localeCompare(b.nome, 'it'));
  disegna(pagina('limiti', `
    <p class="intro">Inserisci i tempi limite (Regionali, Criteria, Assoluti…). Quando li pubblichi arriva una notifica a tutti; poi ogni tempo nuovo sotto il limite fa partire "ha preso il limite!".</p>
    <a class="bottone" href="#/admin?sez=limiti&id=nuovo" style="margin:10px 0 16px">+ Nuovi tempi limite</a>
    ${ordinati.length ? `<ul class="elenco elenco-admin">${ordinati.map((l) => `
      <li class="scheda riga-limite">
        <a href="#/admin?sez=limiti&id=${encodeURIComponent(l.id)}"><b>${esc(l.nome)}</b><span>${esc(`${nomeStagione(l.st)} · vasca ${l.vasca} m · ${Object.keys(l.t ?? {}).length} tempi`)}</span></a>
        <span class="stato-consiglio stato-${l.stato === 'pubblicato' ? 'fatto' : l.stato === 'bozza' ? 'nuovo' : 'letto'}">${esc({ bozza: 'Bozza', 'da-notificare': 'In pubblicazione', pubblicato: 'Pubblicato' }[l.stato] ?? l.stato)}</span>
      </li>`).join('')}</ul>` : '<p class="nota">Ancora nessuno.</p>'}`), null, { classeBody: 'senza-tab' });
}

function editorLimite(l) {
  const corrente = Number(stagioneCorrente());
  const nuovo = !l;
  const dati = {
    nome: l?.nome ?? '', st: String(l?.st ?? corrente), vasca: Number(l?.vasca ?? 25), t: { ...(l?.t ?? {}) }, stato: l?.stato ?? 'bozza',
  };
  const usate = new Set(Object.keys(dati.t).map((k) => k.split('|')[2]));
  let colonne = COLONNE.filter((c) => usate.has(c));
  if (!colonne.length) colonne = ['R', 'J', 'C', 'S'];
  let sesso = 'M';

  const ridisegna = (aggiornamento = false) => {
    disegna(pagina('limiti', `
      <a class="link" href="#/admin?sez=limiti">← Tutti i tempi limite</a>
      <form class="modulo editor-limite" novalidate>
        <div class="riga-campi">
          <label class="campo">Nome<input name="nome" maxlength="80" required value="${esc(dati.nome)}" placeholder="Es. Criteria Nazionali Giovanili 2027"></label>
          <label class="campo">Stagione<select name="st">${[corrente + 1, corrente, corrente - 1].map((x) => `<option value="${x}" ${String(x) === dati.st ? 'selected' : ''}>${nomeStagione(x)}</option>`).join('')}</select></label>
          <label class="campo">Vasca<select name="vasca">${[25, 50].map((v) => `<option value="${v}" ${v === dati.vasca ? 'selected' : ''}>${v} m</option>`).join('')}</select></label>
        </div>
        <fieldset class="colonne-limite"><legend>Categorie (colonne)</legend>
          ${COLONNE.map((c) => `<label class="gettone"><input type="checkbox" data-colonna="${c}" ${colonne.includes(c) ? 'checked' : ''}><span class="gettone-testo">${esc(nomeColonna(c))}</span></label>`).join('')}
        </fieldset>
        <div class="segmenti" role="tablist" aria-label="Sesso">
          ${['M', 'F'].map((x) => `<button type="button" class="segmento" data-sesso="${x}" aria-selected="${sesso === x}">${x === 'M' ? 'Maschi' : 'Femmine'}</button>`).join('')}
        </div>
        <div class="tabella-scorre">
          <table class="tabella-limiti tabella-modifica">
            <thead><tr><th>Gara</th>${colonne.map((c) => `<th>${esc(nomeColonna(c))}</th>`).join('')}</tr></thead>
            <tbody>${GARE.map((g) => `<tr><th>${esc(nomeGara(g, { breve: true }))}</th>${colonne.map((c) => {
    const v = dati.t[`${g}|${sesso}|${c}`];
    return `<td><input data-cella="${g}|${sesso}|${c}" inputmode="decimal" value="${v ? esc(tempo(v)) : ''}" aria-label="${esc(`${nomeGara(g, { breve: true })} ${nomeColonna(c)}`)}"></td>`;
  }).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>
        <details class="incolla">
          <summary>Incolla da una tabella</summary>
          <p class="nota">Una riga per tempo: gara, sesso, categoria e tempo. Es. <code>100SL M R 58.50</code> o <code>200MI F Tutti 2'25"10</code>. Categorie: EB, EA, R, J, C, S, Tutti.</p>
          <textarea data-incolla rows="5"></textarea>
          <button type="button" class="bottone bottone-secondario bottone-piccolo" data-applica>Inserisci nella tabella</button>
        </details>
        <p class="errore" data-errore hidden></p>
        <div class="dettaglio-azioni">
          <button class="bottone bottone-secondario" type="submit" data-azione="bozza">Salva bozza</button>
          <button class="bottone" type="submit" data-azione="pubblica">${dati.stato === 'pubblicato' ? 'Salva (già pubblicato)' : 'Pubblica e avvisa tutti'}</button>
          ${nuovo ? '' : '<button class="bottone bottone-pericolo" type="button" data-elimina>Elimina</button>'}
        </div>
      </form>`), (el) => {
      const f = el.querySelector('form');
      const leggiCampi = () => {
        dati.nome = f.nome.value.trim();
        dati.st = f.st.value;
        dati.vasca = Number(f.vasca.value);
        el.querySelectorAll('[data-cella]').forEach((x) => {
          const ms = leggiTempo(x.value);
          if (ms) dati.t[x.dataset.cella] = ms;
          else delete dati.t[x.dataset.cella];
        });
      };
      el.querySelectorAll('[data-colonna]').forEach((x) => x.addEventListener('change', () => {
        leggiCampi();
        colonne = COLONNE.filter((c) => el.querySelector(`[data-colonna="${c}"]`).checked);
        ridisegna(true);
      }));
      el.querySelectorAll('[data-sesso]').forEach((x) => x.addEventListener('click', () => {
        leggiCampi();
        sesso = x.dataset.sesso;
        ridisegna(true);
      }));
      el.querySelector('[data-applica]').addEventListener('click', () => {
        leggiCampi();
        const sbagliate = [];
        for (const riga of el.querySelector('[data-incolla]').value.split('\n')) {
          const t = riga.trim();
          if (!t) continue;
          const m = t.match(/^(\d{2,4}[A-Za-z]{2})\s+([MF])\s+(EB|EA|R|J|C|S|Tutti|\*)\s+(.+)$/i);
          const ms = m && leggiTempo(m[4]);
          if (!m || !ms || !GARE.includes(m[1].toUpperCase())) {
            sbagliate.push(t);
            continue;
          }
          const cat = /^(tutti|\*)$/i.test(m[3]) ? '*' : m[3].toUpperCase();
          dati.t[`${m[1].toUpperCase()}|${m[2].toUpperCase()}|${cat}`] = ms;
          if (!colonne.includes(cat)) colonne = COLONNE.filter((c) => colonne.includes(c) || c === cat);
        }
        ridisegna(true);
        avviso(sbagliate.length ? `Non capite ${sbagliate.length} righe: ${sbagliate.slice(0, 2).join(' / ')}` : 'Inserite.', sbagliate.length ? 'errore' : undefined);
      });
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        leggiCampi();
        const pubblica = e.submitter?.dataset.azione === 'pubblica';
        if (!dati.nome) {
          mostraErrore(f, new Error('Dai un nome ai tempi limite.'));
          return;
        }
        if (!Object.keys(dati.t).length) {
          mostraErrore(f, new Error('Inserisci almeno un tempo.'));
          return;
        }
        // eslint-disable-next-line no-alert
        if (pubblica && dati.stato !== 'pubblicato' && !window.confirm(`Pubblicare "${dati.nome}" e mandare la notifica a tutti?`)) return;
        const stato2 = dati.stato === 'pubblicato' ? 'pubblicato' : pubblica ? 'da-notificare' : 'bozza';
        try {
          const id = await conAttesa(e.submitter, () => api.salvaLimite(nuovo ? null : l.id, {
            nome: dati.nome, st: dati.st, vasca: dati.vasca, t: dati.t, stato: stato2,
          }));
          stato.cache.delete('limiti');
          avviso(stato2 === 'da-notificare' ? 'Pubblicati: la notifica parte entro 5 minuti.' : 'Salvato.');
          location.hash = `#/admin?sez=limiti${nuovo ? `&id=${encodeURIComponent(id)}` : ''}`;
          if (!nuovo) limiti();
        } catch (err) {
          mostraErrore(f, err);
        }
      });
      el.querySelector('[data-elimina]')?.addEventListener('click', async (e) => {
        // eslint-disable-next-line no-alert
        if (!window.confirm(`Eliminare "${l.nome}"?`)) return;
        try {
          await conAttesa(e.currentTarget, () => api.eliminaLimite(l.id));
          stato.cache.delete('limiti');
          location.hash = '#/admin?sez=limiti';
        } catch (err) {
          avviso(err.message, 'errore');
        }
      });
    }, { classeBody: 'senza-tab', aggiornamento });
  };
  ridisegna();
}

/* ---------- categorie ---------- */

async function categorie() {
  caricamento('Carico le categorie…');
  const salvate = await api.leggiCategorie().catch(() => null);
  if (!qui()) return;
  if (salvate) impostaRegoleCategorie(salvate);
  disegna(pagina('categorie', `
    <p class="intro">Le categorie per età servono a graduatorie, squadre (Categoria/Esordienti) e tempi limite. Età = anno di fine stagione meno anno di nascita. Una regola vale dalla stagione indicata finché non ne arriva una più nuova.</p>
    <form class="modulo" novalidate style="max-width:560px">
      <label class="campo">Regole (una per riga: stagione, sesso, categoria, età)
        <textarea name="regole" rows="16" spellcheck="false" style="font-family:ui-monospace,Menlo,monospace">${esc(regoleInTesto(regoleCategorie()))}</textarea>
      </label>
      <p class="errore" data-errore hidden></p>
      <button class="bottone" type="submit">Salva</button>
    </form>`), (el) => {
    const f = el.querySelector('form');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { regole, errori } = regoleDaTesto(f.regole.value);
      if (errori.length) {
        mostraErrore(f, new Error(`Righe non valide: ${errori.slice(0, 3).join(', ')}`));
        return;
      }
      try {
        await conAttesa(f.querySelector('button'), () => api.salvaCategorie(regole));
        impostaRegoleCategorie(regole);
        avviso('Categorie salvate.');
      } catch (err) {
        mostraErrore(f, err);
      }
    });
  }, { classeBody: 'senza-tab' });
}

/* ---------- atleti nascosti ---------- */

async function nascosti() {
  caricamento('Carico gli atleti nascosti…');
  const dati = await api.leggiNascosti();
  if (!qui()) return;
  let elenco = [...(dati.k ?? [])];
  const nomi = dati.n ?? {};
  const salva = async (bottone) => {
    try {
      await conAttesa(bottone, () => api.salvaNascosti({ k: elenco, n: nomi }));
      stato.nascosti = elenco;
      avviso('Salvato.');
      disegnaPagina();
    } catch (err) {
      avviso(err.message, 'errore');
    }
  };
  const disegnaPagina = () => disegna(pagina('nascosti', `
    <p class="intro">Chi chiede di non comparire: la sua scheda sparisce da ricerca, classifiche e squadre.</p>
    <label class="cerca"><span class="nascosto">Cerca un atleta</span>${ICONE.cerca}<input type="search" placeholder="Nome e cognome" autocomplete="off"></label>
    <ul class="elenco risultati-ricerca" data-trovati></ul>
    <section class="sezione">
      <div class="sezione-testa"><h2 class="sezione-titolo">Nascosti</h2><span class="nota">${elenco.length}</span></div>
      ${elenco.length ? `<ul class="elenco elenco-admin">${elenco.map((k) => `
        <li class="scheda"><b>${esc(nomi[k] ?? k)}</b><button class="bottone bottone-secondario bottone-piccolo" data-mostra="${esc(k)}">Mostra di nuovo</button></li>`).join('')}</ul>` : '<p class="nota">Nessuno.</p>'}
    </section>`), (el) => {
    const input = el.querySelector('input');
    const box = el.querySelector('[data-trovati]');
    let attesa;
    input.addEventListener('input', () => {
      clearTimeout(attesa);
      attesa = setTimeout(async () => {
        const trovati = input.value.trim().length >= 2 ? await cerca(input.value).catch(() => []) : [];
        box.innerHTML = trovati.slice(0, 10).map((v) => `
          <li><a href="#" data-nascondi="${esc(v.k)}" data-nome="${esc(v.n)}"><b>${esc(v.n)}</b><small>${esc([v.y, v.s].filter(Boolean).join(' · '))} · Nascondi</small></a></li>`).join('');
        box.querySelectorAll('[data-nascondi]').forEach((x) => x.addEventListener('click', (e) => {
          e.preventDefault();
          if (!elenco.includes(x.dataset.nascondi)) elenco.push(x.dataset.nascondi);
          nomi[x.dataset.nascondi] = x.dataset.nome;
          salva(null);
        }));
      }, 150);
    });
    el.querySelectorAll('[data-mostra]').forEach((x) => x.addEventListener('click', () => {
      elenco = elenco.filter((k) => k !== x.dataset.mostra);
      delete nomi[x.dataset.mostra];
      salva(x);
    }));
  }, { classeBody: 'senza-tab' });
  disegnaPagina();
}

/* ---------- utenti ---------- */

async function utenti() {
  caricamento('Carico gli utenti…');
  const elenco = await conCache('admin-utenti', () => api.leggiUtenti(), { durata: 60_000 });
  if (!qui()) return;
  const conPush = elenco.filter((u) => u.pushOn && u.dispositivi).length;
  const seguiti = elenco.reduce((x, u) => x + u.seguiti, 0);
  const settimana = elenco.filter((u) => u.aggiornato && Date.now() - u.aggiornato.getTime() < 7 * 86_400_000).length;
  disegna(pagina('utenti', `
    <div class="cifre" style="margin-top:10px">
      <div class="cifra"><b>${elenco.length}</b><small>Iscritti</small></div>
      <div class="cifra"><b>${conPush}</b><small>Con notifiche</small></div>
      <div class="cifra"><b>${seguiti}</b><small>Atleti seguiti</small></div>
      <div class="cifra"><b>${settimana}</b><small>Attivi in 7 giorni</small></div>
    </div>
    <p class="nota" style="margin:10px 0">Per la privacy qui non ci sono email né nomi: solo i numeri di ogni account.</p>
    <div class="tabella-scorre">
      <table class="tabella-limiti tabella-utenti">
        <thead><tr><th>Iscritto</th><th>Ultimo cambio</th><th>Avvisi</th><th>Seguiti</th><th>Notifiche</th></tr></thead>
        <tbody>${elenco.map((u) => `<tr><td>${esc(u.creato ? quando(u.creato) : '–')}</td><td>${esc(u.aggiornato ? quando(u.aggiornato) : '–')}</td><td>${u.settori.length}</td><td>${u.seguiti}</td><td>${u.pushOn ? `sì (${u.dispositivi})` : 'no'}</td></tr>`).join('')}</tbody>
      </table>
    </div>`), null, { classeBody: 'senza-tab' });
}
